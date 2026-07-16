# Bulk Question Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter upload an Excel (`.xlsx`) or CSV file of many questions at once, creating every valid row as a real Question Bank entry in a single request, with per-row error reporting for anything invalid.

**Architecture:** A pure parser module normalizes both file formats into a common row shape; the existing `validateQuestionPayload()` (unchanged) governs per-row semantic validation exactly as it does for single-question create, so there is no duplicated validation logic. A new `POST /questions/bulk-upload` endpoint (multipart file upload, same `FileInterceptor` pattern as the existing branding-logo upload) creates every valid row and returns a `{created, errors}` split. A companion `GET /questions/bulk-upload/template` generates a pre-filled `.xlsx` template on demand using the already-installed `exceljs`.

**Tech Stack:** NestJS + Prisma + `csv-parse`/`exceljs`/`multer` (all already dependencies) on apps/api; Next.js + TanStack Query on apps/web; Jest (unit + e2e), Playwright.

## Global Constraints

- Both `.xlsx` and CSV must be supported by the same upload endpoint.
- Template uses fixed option columns `Option1Text`/`Option1Correct` through `Option6Text`/`Option6Correct` — no delimited-option-column format.
- Partial success: every row that passes validation is created immediately; invalid rows are reported back with row number and reason, never blocking the valid rows.
- Uploaded questions land in the shared Question Bank only — never auto-assigned to an exam section.
- Limits: 500 data rows, 5MB file size, enforced before any row-level processing.
- A "Download template" affordance ships alongside the upload control.
- Same permission gate as single-question create: `question_bank:manage`.
- No schema changes — every row maps to the existing `Question`/`QuestionOption`/`Tag`/`QuestionTag` tables via the existing `CreateQuestionDto`-equivalent shape and `validateQuestionPayload()`.

---

### Task 1: Backend — bulk upload parser (CSV + XLSX → normalized rows)

**Files:**
- Create: `apps/api/src/questions/bulk-upload-parser.ts`
- Test: `apps/api/src/questions/bulk-upload-parser.spec.ts`

**Interfaces:**
- Produces: `BulkQuestionRow` (`{ rowNumber, type, text, difficulty, marks, negativeMarks, topic?, category?, tags: string[], codeLanguage?, starterCode?, options: {text, isCorrect}[] }`), `BulkUploadRowError` (`{ row: number, message: string }`), `ParsedBulkUpload` (`{ rows: BulkQuestionRow[], errors: BulkUploadRowError[] }`), `parseBulkQuestionFile(buffer: Buffer, kind: 'csv' | 'xlsx'): Promise<ParsedBulkUpload>`, `detectFileKind(filename: string): 'csv' | 'xlsx' | null`, and the exported constants `MAX_BULK_UPLOAD_SIZE_BYTES` (5MB) and `MAX_BULK_UPLOAD_ROWS` (500) — Task 3 imports and reuses these directly rather than redefining the limits.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/questions/bulk-upload-parser.spec.ts`:

```typescript
import { parseBulkQuestionFile, detectFileKind } from './bulk-upload-parser';
import ExcelJS from 'exceljs';

async function buildXlsxBuffer(rows: Record<string, string | number>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header }));
  rows.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('detectFileKind', () => {
  it('recognizes .csv and .xlsx case-insensitively', () => {
    expect(detectFileKind('questions.csv')).toBe('csv');
    expect(detectFileKind('Questions.CSV')).toBe('csv');
    expect(detectFileKind('questions.xlsx')).toBe('xlsx');
    expect(detectFileKind('questions.XLSX')).toBe('xlsx');
  });

  it('returns null for an unsupported extension', () => {
    expect(detectFileKind('questions.txt')).toBeNull();
    expect(detectFileKind('questions')).toBeNull();
  });
});

describe('parseBulkQuestionFile (csv)', () => {
  it('parses a valid single_mcq row with tags split by semicolon', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,NegativeMarks,Tags,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'single_mcq,What is 2+2?,easy,5,1,math;basics,3,FALSE,4,TRUE',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 1,
        type: 'single_mcq',
        text: 'What is 2+2?',
        difficulty: 'easy',
        marks: 5,
        negativeMarks: 1,
        topic: undefined,
        category: undefined,
        tags: ['math', 'basics'],
        codeLanguage: undefined,
        starterCode: undefined,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      },
    ]);
  });

  it('parses a valid code row with zero options', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,CodeLanguage,StarterCode',
      'code,Reverse a string,medium,10,javascript,function reverse(s) {}',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].options).toEqual([]);
    expect(rows[0].codeLanguage).toBe('javascript');
    expect(rows[0].starterCode).toBe('function reverse(s) {}');
  });

  it('reports a structural error for missing Marks', async () => {
    const csv = ['Type,Text,Difficulty,Marks', 'true_false,Is the sky blue?,easy,'].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: 'Marks must be a whole number, got ""' }]);
  });

  it('reports a structural error for non-numeric Marks', async () => {
    const csv = ['Type,Text,Difficulty,Marks', 'true_false,Is the sky blue?,easy,five'].join('\n');

    const { errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Marks must be a whole number, got "five"' }]);
  });

  it('ignores blank option slots and defaults NegativeMarks to 0 when omitted', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct,Option3Text,Option3Correct',
      'true_false,Is the sky blue?,easy,2,True,TRUE,False,FALSE,,',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows[0].negativeMarks).toBe(0);
    expect(rows[0].options).toEqual([
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ]);
  });

  it('assigns sequential row numbers and continues past a bad row', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'true_false,Row one,easy,2,True,TRUE,False,FALSE',
      'true_false,Row two - bad marks,easy,notanumber,True,TRUE,False,FALSE',
      'true_false,Row three,easy,3,True,TRUE,False,FALSE',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(rows.map((r) => r.rowNumber)).toEqual([1, 3]);
    expect(errors).toEqual([{ row: 2, message: 'Marks must be a whole number, got "notanumber"' }]);
  });
});

describe('parseBulkQuestionFile (xlsx)', () => {
  it('parses a valid row from an in-memory workbook', async () => {
    const buffer = await buildXlsxBuffer([
      {
        Type: 'true_false',
        Text: 'Is the sky blue?',
        Difficulty: 'easy',
        Marks: 2,
        Option1Text: 'True',
        Option1Correct: 'TRUE',
        Option2Text: 'False',
        Option2Correct: 'FALSE',
      },
    ]);

    const { rows, errors } = await parseBulkQuestionFile(buffer, 'xlsx');

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('true_false');
    expect(rows[0].options).toEqual([
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/questions/bulk-upload-parser.spec.ts`
Expected: FAIL with `Cannot find module './bulk-upload-parser'`.

- [ ] **Step 3: Implement the parser**

Create `apps/api/src/questions/bulk-upload-parser.ts`:

```typescript
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export interface BulkQuestionRow {
  rowNumber: number;
  type: string;
  text: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  topic?: string;
  category?: string;
  tags: string[];
  codeLanguage?: string;
  starterCode?: string;
  options: { text: string; isCorrect: boolean }[];
}

export interface BulkUploadRowError {
  row: number;
  message: string;
}

export interface ParsedBulkUpload {
  rows: BulkQuestionRow[];
  errors: BulkUploadRowError[];
}

export const MAX_BULK_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_BULK_UPLOAD_ROWS = 500;

const OPTION_SLOTS = [1, 2, 3, 4, 5, 6];

export function detectFileKind(filename: string): 'csv' | 'xlsx' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

function extractRow(record: Record<string, string>, rowNumber: number): BulkQuestionRow | BulkUploadRowError {
  const type = (record.Type ?? '').trim();
  const text = (record.Text ?? '').trim();
  const difficulty = (record.Difficulty ?? '').trim();
  const marksRaw = (record.Marks ?? '').trim();
  const negativeMarksRaw = (record.NegativeMarks ?? '').trim();

  if (!type) return { row: rowNumber, message: 'Missing Type' };
  if (!text) return { row: rowNumber, message: 'Missing Text' };
  if (!difficulty) return { row: rowNumber, message: 'Missing Difficulty' };

  const marks = Number(marksRaw);
  if (!marksRaw || !Number.isInteger(marks)) {
    return { row: rowNumber, message: `Marks must be a whole number, got "${marksRaw}"` };
  }

  let negativeMarks = 0;
  if (negativeMarksRaw) {
    const parsedNegativeMarks = Number(negativeMarksRaw);
    if (!Number.isInteger(parsedNegativeMarks)) {
      return { row: rowNumber, message: `NegativeMarks must be a whole number, got "${negativeMarksRaw}"` };
    }
    negativeMarks = parsedNegativeMarks;
  }

  const tags = (record.Tags ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const options: { text: string; isCorrect: boolean }[] = [];
  for (const slot of OPTION_SLOTS) {
    const optionText = (record[`Option${slot}Text`] ?? '').trim();
    if (!optionText) continue;
    const optionCorrect = (record[`Option${slot}Correct`] ?? '').trim().toUpperCase() === 'TRUE';
    options.push({ text: optionText, isCorrect: optionCorrect });
  }

  return {
    rowNumber,
    type,
    text,
    difficulty,
    marks,
    negativeMarks,
    topic: (record.Topic ?? '').trim() || undefined,
    category: (record.Category ?? '').trim() || undefined,
    tags,
    codeLanguage: (record.CodeLanguage ?? '').trim() || undefined,
    starterCode: (record.StarterCode ?? '').trim() || undefined,
    options,
  };
}

function isRowError(value: BulkQuestionRow | BulkUploadRowError): value is BulkUploadRowError {
  return 'message' in value;
}

function parseCsvRecords(buffer: Buffer): Record<string, string>[] {
  return parse(buffer.toString('utf-8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

async function parseXlsxRecords(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const records: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const record: Record<string, string> = {};
    let hasContent = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = row.getCell(colNumber).value;
      const stringValue = value != null ? String(value).trim() : '';
      if (stringValue) hasContent = true;
      record[header] = stringValue;
    });
    if (hasContent) records.push(record);
  }
  return records;
}

export async function parseBulkQuestionFile(buffer: Buffer, kind: 'csv' | 'xlsx'): Promise<ParsedBulkUpload> {
  const records = kind === 'csv' ? parseCsvRecords(buffer) : await parseXlsxRecords(buffer);

  const rows: BulkQuestionRow[] = [];
  const errors: BulkUploadRowError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const extracted = extractRow(record, rowNumber);
    if (isRowError(extracted)) {
      errors.push(extracted);
    } else {
      rows.push(extracted);
    }
  });

  return { rows, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/questions/bulk-upload-parser.spec.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/questions/bulk-upload-parser.ts apps/api/src/questions/bulk-upload-parser.spec.ts
git commit -m "feat: add bulk question upload CSV/XLSX parser"
```

---

### Task 2: Backend — downloadable template generator

**Files:**
- Create: `apps/api/src/questions/bulk-upload-template.ts`
- Test: `apps/api/src/questions/bulk-upload-template.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `generateBulkUploadTemplate(): Promise<Buffer>` — Task 3's controller calls this directly.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/questions/bulk-upload-template.spec.ts`:

```typescript
import ExcelJS from 'exceljs';
import { generateBulkUploadTemplate } from './bulk-upload-template';

describe('generateBulkUploadTemplate', () => {
  it('produces a workbook with the expected headers and one example row per question type', async () => {
    const buffer = await generateBulkUploadTemplate();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1).values as unknown[];
    const headers = headerRow.slice(1).map((v) => String(v));
    expect(headers).toEqual([
      'Type', 'Text', 'Difficulty', 'Marks', 'NegativeMarks', 'Topic', 'Category', 'Tags',
      'CodeLanguage', 'StarterCode',
      'Option1Text', 'Option1Correct', 'Option2Text', 'Option2Correct',
      'Option3Text', 'Option3Correct', 'Option4Text', 'Option4Correct',
      'Option5Text', 'Option5Correct', 'Option6Text', 'Option6Correct',
    ]);

    const typeColumnIndex = headers.indexOf('Type') + 1;
    const rowTypes: string[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      rowTypes.push(String(sheet.getRow(rowNumber).getCell(typeColumnIndex).value));
    }
    expect(rowTypes).toEqual(['single_mcq', 'multi_mcq', 'true_false', 'code']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/questions/bulk-upload-template.spec.ts`
Expected: FAIL with `Cannot find module './bulk-upload-template'`.

- [ ] **Step 3: Implement the template generator**

Create `apps/api/src/questions/bulk-upload-template.ts`:

```typescript
import ExcelJS from 'exceljs';

const HEADERS = [
  'Type', 'Text', 'Difficulty', 'Marks', 'NegativeMarks', 'Topic', 'Category', 'Tags',
  'CodeLanguage', 'StarterCode',
  'Option1Text', 'Option1Correct', 'Option2Text', 'Option2Correct',
  'Option3Text', 'Option3Correct', 'Option4Text', 'Option4Correct',
  'Option5Text', 'Option5Correct', 'Option6Text', 'Option6Correct',
];

const EXAMPLE_ROWS: Record<string, string | number>[] = [
  {
    Type: 'single_mcq', Text: 'What is 2 + 2?', Difficulty: 'easy', Marks: 5, NegativeMarks: 0,
    Topic: 'Arithmetic', Tags: 'math;basics',
    Option1Text: '3', Option1Correct: 'FALSE', Option2Text: '4', Option2Correct: 'TRUE',
  },
  {
    Type: 'multi_mcq', Text: 'Which of these are prime numbers?', Difficulty: 'medium', Marks: 10, NegativeMarks: 2,
    Tags: 'math',
    Option1Text: '2', Option1Correct: 'TRUE', Option2Text: '4', Option2Correct: 'FALSE', Option3Text: '5', Option3Correct: 'TRUE',
  },
  {
    Type: 'true_false', Text: 'The sky is blue.', Difficulty: 'easy', Marks: 2, NegativeMarks: 0,
    Option1Text: 'True', Option1Correct: 'TRUE', Option2Text: 'False', Option2Correct: 'FALSE',
  },
  {
    Type: 'code', Text: 'Write a function that reverses a string.', Difficulty: 'medium', Marks: 10, NegativeMarks: 0,
    CodeLanguage: 'javascript', StarterCode: 'function reverse(str) {\n\n}',
  },
];

export async function generateBulkUploadTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 18 }));
  EXAMPLE_ROWS.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/questions/bulk-upload-template.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/questions/bulk-upload-template.ts apps/api/src/questions/bulk-upload-template.spec.ts
git commit -m "feat: add downloadable bulk question upload template generator"
```

---

### Task 3: Backend — service + controller wiring

**Files:**
- Modify: `apps/api/src/questions/questions.service.ts:1-28` (imports and constructor unchanged; new method added at end of class, before the closing brace, after `publish()`)
- Modify: `apps/api/src/questions/questions.controller.ts`
- Modify: `apps/api/src/questions/questions.service.spec.ts` (append tests)
- Modify: `apps/api/test/question-bank.e2e-spec.ts` (append tests to the `describe('Question Bank HTTP flow', ...)` block)

**Interfaces:**
- Consumes: `parseBulkQuestionFile`, `detectFileKind`, `MAX_BULK_UPLOAD_SIZE_BYTES`, `MAX_BULK_UPLOAD_ROWS`, `BulkQuestionRow`, `BulkUploadRowError` from `./bulk-upload-parser` (Task 1); `generateBulkUploadTemplate` from `./bulk-upload-template` (Task 2); the existing `validateQuestionPayload` from `./question-validation`.
- Produces: `QuestionsService.bulkUpload(context: TenantContext, userId: string, file: Express.Multer.File): Promise<BulkUploadResult>` where `BulkUploadResult = { created: QuestionResponse[]; errors: BulkUploadRowError[] }`; `POST /questions/bulk-upload` (guarded by `question_bank:manage`, multipart `file` field, throttled `MODERATE_UPLOAD_THROTTLE`); `GET /questions/bulk-upload/template` (guarded by `question_bank:manage`, returns the `.xlsx` template as a download).

- [ ] **Step 1: Write the failing unit tests**

Open `apps/api/src/questions/questions.service.spec.ts` and append at the end of the file (after the last existing `it(...)`, still inside the outer `describe('QuestionsService', ...)` block, before its closing `});`):

```typescript

  describe('bulkUpload', () => {
    it('creates valid rows and reports errors for invalid ones from a CSV file', async () => {
      const csv = [
        'Type,Text,Difficulty,Marks,NegativeMarks,Option1Text,Option1Correct,Option2Text,Option2Correct',
        'single_mcq,What is 2+2?,easy,5,0,3,FALSE,4,TRUE',
        'single_mcq,Bad row - two correct,easy,5,0,3,TRUE,4,TRUE',
      ].join('\n');
      const file = { originalname: 'questions.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;

      const tx = {
        tag: { upsert: jest.fn() },
        question: { create: jest.fn().mockResolvedValue({ id: 'q-1', options: [], tags: [] }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.bulkUpload(context, 'user-1', file);

      expect(result.created).toHaveLength(1);
      expect(tx.question.create).toHaveBeenCalledTimes(1);
      expect(result.errors).toEqual([{ row: 2, message: 'single_mcq questions must have exactly 1 correct option' }]);
    });

    it('rejects a file with an unsupported extension before parsing', async () => {
      const file = { originalname: 'questions.txt', size: 10, buffer: Buffer.from('irrelevant') } as Express.Multer.File;

      await expect(service.bulkUpload(context, 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('rejects a file larger than 5MB', async () => {
      const file = { originalname: 'questions.csv', size: 6 * 1024 * 1024, buffer: Buffer.from('Type,Text\n') } as Express.Multer.File;

      await expect(service.bulkUpload(context, 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/questions/questions.service.spec.ts -t bulkUpload`
Expected: FAIL with `service.bulkUpload is not a function`.

- [ ] **Step 3: Implement `QuestionsService.bulkUpload()`**

In `apps/api/src/questions/questions.service.ts`, add these imports at the top, alongside the existing ones:

```typescript
import {
  parseBulkQuestionFile,
  detectFileKind,
  MAX_BULK_UPLOAD_SIZE_BYTES,
  MAX_BULK_UPLOAD_ROWS,
  BulkQuestionRow,
  BulkUploadRowError,
} from './bulk-upload-parser';
```

Add this interface near the top of the file, alongside the existing `QuestionFilters` interface:

```typescript
export interface BulkUploadResult {
  created: QuestionResponse[];
  errors: BulkUploadRowError[];
}
```

Add this method to the `QuestionsService` class, immediately after `publish()`:

```typescript

  async bulkUpload(context: TenantContext, userId: string, file: Express.Multer.File): Promise<BulkUploadResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const kind = detectFileKind(file.originalname);
    if (!kind) {
      throw new BadRequestException('File must be a .csv or .xlsx file');
    }
    if (file.size > MAX_BULK_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    const { rows, errors: parseErrors } = await parseBulkQuestionFile(file.buffer, kind);
    if (rows.length + parseErrors.length > MAX_BULK_UPLOAD_ROWS) {
      throw new BadRequestException(
        `File must contain at most ${MAX_BULK_UPLOAD_ROWS} questions (found ${rows.length + parseErrors.length})`,
      );
    }

    const validationErrors: BulkUploadRowError[] = [];
    const validRows: BulkQuestionRow[] = [];
    for (const row of rows) {
      try {
        validateQuestionPayload({
          type: row.type,
          difficulty: row.difficulty,
          marks: row.marks,
          negativeMarks: row.negativeMarks,
          options: row.options,
          codeLanguage: row.codeLanguage,
        });
        validRows.push(row);
      } catch (err) {
        validationErrors.push({ row: row.rowNumber, message: err instanceof Error ? err.message : 'Invalid row' });
      }
    }

    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const results: QuestionResponse[] = [];
      for (const row of validRows) {
        const tagIds = await this.resolveTagIds(tx, context.organizationId as string, row.tags);
        const question = await tx.question.create({
          data: {
            organizationId: context.organizationId as string,
            type: row.type,
            text: row.text,
            topic: row.topic,
            category: row.category,
            difficulty: row.difficulty,
            marks: row.marks,
            negativeMarks: row.negativeMarks,
            codeLanguage: row.codeLanguage,
            starterCode: row.starterCode,
            createdBy: userId,
            options: {
              create: row.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
            },
            tags: {
              create: tagIds.map((tagId) => ({ tagId })),
            },
          },
          include: { options: true, tags: { include: { tag: true } } },
        });
        results.push(this.toResponse(question as QuestionWithRelations));
      }
      return results;
    });

    const errors = [...parseErrors, ...validationErrors].sort((a, b) => a.row - b.row);
    return { created, errors };
  }
```

- [ ] **Step 4: Add the controller routes**

In `apps/api/src/questions/questions.controller.ts`, update the imports:

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
import { STRICT_AI_GENERATE_THROTTLE, MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { generateBulkUploadTemplate } from './bulk-upload-template';
```

Insert these two routes immediately after the `aiGenerate` method and before `list()`:

```typescript

  @Post('bulk-upload')
  @RequirePermissions('question_bank:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  bulkUpload(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.questionsService.bulkUpload(tenant, userId, file);
  }

  @Get('bulk-upload/template')
  @RequirePermissions('question_bank:manage')
  async downloadBulkUploadTemplate(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const buffer = await generateBulkUploadTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="question-bulk-upload-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/questions/questions.service.spec.ts`
Expected: PASS, all tests including the 3 new `bulkUpload` tests.

- [ ] **Step 6: Write the e2e test**

Open `apps/api/test/question-bank.e2e-spec.ts`. Append these two `it(...)` blocks inside the `describe('Question Bank HTTP flow', ...)` block, as the last tests before its closing `});`:

```typescript

  it('downloads the bulk upload template as an xlsx file', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/questions/bulk-upload/template')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('question-bulk-upload-template.xlsx');
  });

  it('bulk-uploads a CSV with valid and invalid rows, creating only the valid ones', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'true_false,Bulk row one,easy,2,True,TRUE,False,FALSE',
      'true_false,Bulk row two - only one option,easy,2,True,TRUE,,',
      'single_mcq,Bulk row three - no correct answer,easy,5,A,FALSE,B,FALSE',
    ].join('\n');

    const response = await request(app.getHttpServer())
      .post('/api/v1/questions/bulk-upload')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .attach('file', Buffer.from(csv), { filename: 'questions.csv', contentType: 'text/csv' })
      .expect(201);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0].text).toBe('Bulk row one');
    expect(response.body.errors).toEqual([
      { row: 2, message: 'true_false questions must have exactly 2 options' },
      { row: 3, message: 'single_mcq questions must have exactly 1 correct option' },
    ]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body.some((q: { text: string }) => q.text === 'Bulk row one')).toBe(true);
  });

  it('rejects a bulk upload file with an unsupported extension', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions/bulk-upload')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .attach('file', Buffer.from('irrelevant'), { filename: 'questions.txt', contentType: 'text/plain' })
      .expect(400);
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd apps/api && timeout 100 npx jest --config ./test/jest-e2e.json --runInBand question-bank.e2e-spec.ts`
Expected: PASS, all tests including the 3 new bulk-upload tests. (Wrapped with an external bounded timeout — this project has a documented history of e2e hangs on an unguarded `afterAll`.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.controller.ts apps/api/src/questions/questions.service.spec.ts apps/api/test/question-bank.e2e-spec.ts
git commit -m "feat: add POST /questions/bulk-upload and GET /questions/bulk-upload/template"
```

---

### Task 4: Frontend — Bulk Upload screen

**Files:**
- Modify: `apps/web/lib/hooks/useQuestions.ts` (append hooks after `useUpdateQuestion`)
- Modify: `apps/web/app/(recruiter)/questions/page.tsx` (add "Bulk upload" link)
- Create: `apps/web/app/(recruiter)/questions/bulk-upload/page.tsx`
- Test: `apps/web/app/(recruiter)/questions/bulk-upload/page.test.tsx`

**Interfaces:**
- Consumes: `POST /questions/bulk-upload` and `GET /questions/bulk-upload/template` from Task 3 (response shape `{ created: Question[], errors: { row: number, message: string }[] }`).
- Produces: `useBulkUploadQuestions(): UseMutationResult` (`mutate(file: File, {onSuccess, onError})`), `useDownloadBulkUploadTemplate(): UseMutationResult` (`mutateAsync(): Promise<{blob: Blob, filename: string | null}>`), both exported from `useQuestions.ts`.

- [ ] **Step 1: Write the failing frontend test**

Create `apps/web/app/(recruiter)/questions/bulk-upload/page.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BulkUploadQuestionsPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <BulkUploadQuestionsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('BulkUploadQuestionsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a file and shows the created count plus row errors', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/questions/bulk-upload') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            created: [{ id: 'q-1' }],
            errors: [{ row: 3, message: 'single_mcq questions must have exactly 1 correct option' }],
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    const file = new File(['Type,Text\nsingle_mcq,What is 2+2?'], 'questions.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Question file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(screen.getByText('1 question(s) created.')).toBeInTheDocument());
    expect(screen.getByText('single_mcq questions must have exactly 1 correct option')).toBeInTheDocument();
  });

  it('shows an error toast when the upload request fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/questions/bulk-upload') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'File must be 5MB or smaller' }), { status: 400 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    const file = new File(['Type,Text'], 'questions.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Question file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(screen.getByText('File must be 5MB or smaller')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm test -- questions/bulk-upload/page.test.tsx`
Expected: FAIL — `Cannot find module './page'` (the page doesn't exist yet).

- [ ] **Step 3: Add the hooks**

In `apps/web/lib/hooks/useQuestions.ts`, change the import line at the top from:

```typescript
import { apiFetch } from '../api-client';
```

to:

```typescript
import { apiFetch, apiFetchBlob } from '../api-client';
```

Append after `useUpdateQuestion` (after its closing `}`):

```typescript

export interface BulkUploadRowError {
  row: number;
  message: string;
}

export interface BulkUploadResult {
  created: Question[];
  errors: BulkUploadRowError[];
}

export function useBulkUploadQuestions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<BulkUploadResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/questions/bulk-upload', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useDownloadBulkUploadTemplate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: () => apiFetchBlob('/questions/bulk-upload/template', {}, accessToken ?? undefined),
  });
}
```

- [ ] **Step 4: Create the Bulk Upload screen**

Create `apps/web/app/(recruiter)/questions/bulk-upload/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useBulkUploadQuestions, useDownloadBulkUploadTemplate, BulkUploadResult } from '../../../../lib/hooks/useQuestions';
import { Button, useToast } from '../../../../components/ui';

export default function BulkUploadQuestionsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const { toast } = useToast();
  const bulkUpload = useBulkUploadQuestions();
  const downloadTemplate = useDownloadBulkUploadTemplate();

  async function handleDownloadTemplate() {
    try {
      const { blob, filename } = await downloadTemplate.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'question-bulk-upload-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to download template', 'error');
    }
  }

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    bulkUpload.mutate(file, {
      onSuccess: (data) => {
        setResult(data);
        toast(`${data.created.length} question(s) created.`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload questions.', 'error'),
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Bulk Upload Questions</h1>
      <Button variant="secondary" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending}>
        Download template
      </Button>
      <form onSubmit={handleUpload} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Question file (.xlsx or .csv, max 5MB)
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" disabled={!file || bulkUpload.isPending}>
          {bulkUpload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      {result && (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-900">{result.created.length} question(s) created.</p>
          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-red-600">{result.errors.length} row(s) had errors:</p>
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-1 pr-4 font-medium text-gray-600">Row</th>
                    <th className="py-1 font-medium text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((error) => (
                    <tr key={error.row} className="border-b border-gray-100">
                      <td className="py-1 pr-4">{error.row}</td>
                      <td className="py-1 text-red-600">{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the "Bulk upload" link to the Question Bank page**

In `apps/web/app/(recruiter)/questions/page.tsx`, replace:

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Question Bank</h1>
        <Link href="/questions/new">
          <Button>New question</Button>
        </Link>
      </div>
```

with:

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Question Bank</h1>
        <div className="flex gap-2">
          <Link href="/questions/bulk-upload">
            <Button variant="secondary">Bulk upload</Button>
          </Link>
          <Link href="/questions/new">
            <Button>New question</Button>
          </Link>
        </div>
      </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npm test -- questions/bulk-upload/page.test.tsx`
Expected: PASS, both tests.

Then run the full frontend suite to confirm no regression:

Run: `cd apps/web && npm test`
Expected: PASS, all suites (including the unmodified `questions/page.test.tsx`, since only its static JSX changed, not its tested behavior).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useQuestions.ts "apps/web/app/(recruiter)/questions/page.tsx" "apps/web/app/(recruiter)/questions/bulk-upload/page.tsx" "apps/web/app/(recruiter)/questions/bulk-upload/page.test.tsx"
git commit -m "feat: add Bulk Upload Questions screen"
```

---

### Task 5: Playwright — extend the recruiter golden path

**Files:**
- Create: `apps/web/e2e/fixtures/bulk-questions.csv`
- Modify: `apps/web/e2e/recruiter-golden-path.spec.ts`

**Interfaces:**
- Consumes: the "Bulk upload" link and Bulk Upload screen from Task 4.
- Produces: end-to-end proof that uploading a real file through the actual UI creates real questions and they appear in the Question Bank list.

- [ ] **Step 1: Create the fixture file**

Create `apps/web/e2e/fixtures/bulk-questions.csv`:

```csv
Type,Text,Difficulty,Marks,NegativeMarks,Tags,Option1Text,Option1Correct,Option2Text,Option2Correct
true_false,Bulk Upload True/False: the sky is blue,easy,2,0,bulk-fixture,True,TRUE,False,FALSE
single_mcq,Bulk Upload MCQ: 3 + 3 = ?,easy,5,0,bulk-fixture,5,FALSE,6,TRUE
```

- [ ] **Step 2: Write the extended e2e step**

In `apps/web/e2e/recruiter-golden-path.spec.ts`, add `import path from 'path';` as the first line after the existing `import { test, expect } from '@playwright/test';`.

The test currently reads (lines 24-27):

```ts
  await expect(page).toHaveURL(/\/questions$/);
  await expect(page.getByText('What is 2 + 2?').first()).toBeVisible();

  await page.getByRole('link', { name: 'Exams' }).click();
```

Replace those 4 lines with:

```ts
  await expect(page).toHaveURL(/\/questions$/);
  await expect(page.getByText('What is 2 + 2?').first()).toBeVisible();

  await page.getByRole('link', { name: 'Bulk upload' }).click();
  await expect(page).toHaveURL(/\/questions\/bulk-upload$/);
  await page.getByLabel(/Question file/).setInputFiles(path.join(__dirname, 'fixtures', 'bulk-questions.csv'));
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('2 question(s) created.')).toBeVisible();

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await expect(page.getByText('Bulk Upload True/False: the sky is blue')).toBeVisible();

  await page.getByRole('link', { name: 'Exams' }).click();
```

- [ ] **Step 3: Confirm dev servers are running, then run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports are unavailable).

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 4: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/fixtures/bulk-questions.csv apps/web/e2e/recruiter-golden-path.spec.ts
git commit -m "test: extend recruiter golden path with the bulk question upload flow"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Tasks 1-3. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Task 4.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every golden path passes, including the extended `recruiter-golden-path.spec.ts` from Task 5.

- [ ] **Step 4: Manual smoke check**

With dev servers running: as recruiter, open the Question Bank, click "Download template", confirm a valid `.xlsx` downloads with 4 example rows (one per type). Fill in a few more rows (or reuse the template), upload it via "Bulk upload", confirm the created count and any row errors render correctly, and confirm the new questions appear in the Question Bank list. Try uploading a file with at least one deliberately broken row (e.g. a `single_mcq` with 2 correct answers) and confirm the valid rows still get created while the broken one is reported with its row number and reason.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md` (overwrite fresh for this feature, per this project's ledger convention):

```
# Bulk Question Upload — SDD Progress Ledger

## Tasks
Task 1: complete (backend — CSV/XLSX parser)
Task 2: complete (backend — downloadable template generator)
Task 3: complete (backend — POST /questions/bulk-upload + GET template endpoint)
Task 4: complete (frontend — Bulk Upload Questions screen)
Task 5: complete (Playwright — extended recruiter golden path)
Task 6: complete (final verification)
```
