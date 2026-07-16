# Bulk Upload & Invite Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter upload an Excel (`.xlsx`) or CSV file of candidates for a chosen exam, creating/updating each candidate and sending them an invitation in the same step, with per-row error reporting for anything invalid.

**Architecture:** A new pure parser normalizes both file formats into `{email, name, phone}` rows. A new `InvitationsService.bulkUploadAndInvite()` method validates the exam is published, creates/updates each row's candidate, then delegates the actual invitation-sending to the **existing, unmodified** `InvitationsService.bulkInvite()` — reusing its already-correct skip-if-already-invited and fire-and-forget email logic rather than duplicating it. Two new routes on the existing `InvitationsController` (upload+invite, and a template download) follow the exact `FileInterceptor` pattern already used by the Bulk Question Upload feature.

**Tech Stack:** NestJS + Prisma + `csv-parse`/`exceljs`/`multer` (all already dependencies) on apps/api; Next.js + TanStack Query on apps/web; Jest (unit + e2e), Playwright.

## Global Constraints

- Both `.xlsx` and CSV must be supported by the same upload endpoint.
- Partial success: every row that passes parsing is processed immediately (created/updated + invited); invalid rows are reported back with row number and reason, never blocking other rows.
- If a row's email matches an existing candidate, that candidate's `name`/`phone` are updated (not an error) and they proceed to the invite step — matching the existing `CandidatesService.bulkUpload`'s create-or-update semantics.
- The target exam must be `published`, checked once up front for the whole file — not per row. If not published, the whole request is rejected before any candidate is created or updated.
- Results are three separate sets, never merged: `created` (fresh invitations), `skipped` (valid candidates who already had a live invitation — informational), `errors` (bad rows to fix).
- Limits: 500 rows, 5MB file size — file size rejected before parsing; row count checked immediately after parsing and before any candidate is created (matching the Bulk Question Upload feature's accepted precedent).
- The existing `POST /candidates/bulk` (JSON `csvContent` body, candidates only, no invitations) is not modified or reused.
- The existing `InvitationsService.bulkInvite()` is not modified — the new method calls it as-is.
- Same permission gate as existing candidate-management actions: `candidate:manage`.
- No schema changes.

---

### Task 1: Backend — bulk-invite parser (CSV + XLSX → normalized candidate rows)

**Files:**
- Create: `apps/api/src/candidates/bulk-invite-parser.ts`
- Test: `apps/api/src/candidates/bulk-invite-parser.spec.ts`

**Interfaces:**
- Produces: `BulkInviteCandidateRow` (`{ rowNumber, email, name, phone? }`), `BulkInviteRowError` (`{ row: number, message: string }`), `ParsedBulkInviteFile` (`{ rows: BulkInviteCandidateRow[], errors: BulkInviteRowError[] }`), `parseBulkInviteFile(buffer: Buffer, kind: 'csv' | 'xlsx'): Promise<ParsedBulkInviteFile>`, `detectFileKind(filename: string): 'csv' | 'xlsx' | null`, and the exported constants `MAX_BULK_INVITE_SIZE_BYTES` (5MB) and `MAX_BULK_INVITE_ROWS` (500) — Task 3 imports and reuses these directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/candidates/bulk-invite-parser.spec.ts`:

```typescript
import { parseBulkInviteFile, detectFileKind } from './bulk-invite-parser';
import ExcelJS from 'exceljs';

async function buildXlsxBuffer(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Candidates');
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header }));
  rows.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('detectFileKind', () => {
  it('recognizes .csv and .xlsx case-insensitively', () => {
    expect(detectFileKind('candidates.csv')).toBe('csv');
    expect(detectFileKind('Candidates.CSV')).toBe('csv');
    expect(detectFileKind('candidates.xlsx')).toBe('xlsx');
    expect(detectFileKind('candidates.XLSX')).toBe('xlsx');
  });

  it('returns null for an unsupported extension', () => {
    expect(detectFileKind('candidates.txt')).toBeNull();
    expect(detectFileKind('candidates')).toBeNull();
  });
});

describe('parseBulkInviteFile (csv)', () => {
  it('parses valid rows including an optional phone column', async () => {
    const csv = ['Email,Name,Phone', 'alice@test.com,Alice,555-1234', 'bob@test.com,Bob,'].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 1, email: 'alice@test.com', name: 'Alice', phone: '555-1234' },
      { rowNumber: 2, email: 'bob@test.com', name: 'Bob', phone: undefined },
    ]);
  });

  it('flags a row with a missing email', async () => {
    const csv = ['Email,Name,Phone', ',Alice,555-1234'].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: 'Invalid or missing email: ""' }]);
  });

  it('flags a row with a malformed email', async () => {
    const csv = ['Email,Name,Phone', 'not-an-email,Alice,'].join('\n');

    const { errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Invalid or missing email: "not-an-email"' }]);
  });

  it('flags a row with a missing name', async () => {
    const csv = ['Email,Name,Phone', 'alice@test.com,,'].join('\n');

    const { errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Missing name' }]);
  });

  it('assigns sequential row numbers and continues past a bad row', async () => {
    const csv = [
      'Email,Name,Phone',
      'alice@test.com,Alice,',
      'not-an-email,Bad Row,',
      'carol@test.com,Carol,',
    ].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(rows.map((r) => r.rowNumber)).toEqual([1, 3]);
    expect(errors).toEqual([{ row: 2, message: 'Invalid or missing email: "not-an-email"' }]);
  });
});

describe('parseBulkInviteFile (xlsx)', () => {
  it('parses a valid row from an in-memory workbook', async () => {
    const buffer = await buildXlsxBuffer([{ Email: 'alice@test.com', Name: 'Alice', Phone: '555-1234' }]);

    const { rows, errors } = await parseBulkInviteFile(buffer, 'xlsx');

    expect(errors).toEqual([]);
    expect(rows).toEqual([{ rowNumber: 1, email: 'alice@test.com', name: 'Alice', phone: '555-1234' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/candidates/bulk-invite-parser.spec.ts`
Expected: FAIL with `Cannot find module './bulk-invite-parser'`.

- [ ] **Step 3: Implement the parser**

Create `apps/api/src/candidates/bulk-invite-parser.ts`:

```typescript
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export interface BulkInviteCandidateRow {
  rowNumber: number;
  email: string;
  name: string;
  phone?: string;
}

export interface BulkInviteRowError {
  row: number;
  message: string;
}

export interface ParsedBulkInviteFile {
  rows: BulkInviteCandidateRow[];
  errors: BulkInviteRowError[];
}

export const MAX_BULK_INVITE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_BULK_INVITE_ROWS = 500;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function detectFileKind(filename: string): 'csv' | 'xlsx' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

function extractRow(record: Record<string, string>, rowNumber: number): BulkInviteCandidateRow | BulkInviteRowError {
  const email = (record.Email ?? '').trim();
  const name = (record.Name ?? '').trim();
  const phone = (record.Phone ?? '').trim() || undefined;

  if (!EMAIL_PATTERN.test(email)) {
    return { row: rowNumber, message: `Invalid or missing email: "${email}"` };
  }
  if (!name) {
    return { row: rowNumber, message: 'Missing name' };
  }

  return { rowNumber, email, name, phone };
}

function isRowError(value: BulkInviteCandidateRow | BulkInviteRowError): value is BulkInviteRowError {
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
  await workbook.xlsx.load(buffer as any);
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

export async function parseBulkInviteFile(buffer: Buffer, kind: 'csv' | 'xlsx'): Promise<ParsedBulkInviteFile> {
  const records = kind === 'csv' ? parseCsvRecords(buffer) : await parseXlsxRecords(buffer);

  const rows: BulkInviteCandidateRow[] = [];
  const errors: BulkInviteRowError[] = [];

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

The `buffer as any` cast on `workbook.xlsx.load(...)` works around a known, already-diagnosed ExcelJS type-declaration defect (its `index.d.ts` shadows Node's real `Buffer` type) — this exact workaround is already used in `apps/api/src/questions/bulk-upload-parser.ts:110`, so it's an established pattern in this codebase, not a new one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/candidates/bulk-invite-parser.spec.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates/bulk-invite-parser.ts apps/api/src/candidates/bulk-invite-parser.spec.ts
git commit -m "feat: add bulk candidate upload+invite CSV/XLSX parser"
```

---

### Task 2: Backend — downloadable template generator

**Files:**
- Create: `apps/api/src/candidates/bulk-invite-template.ts`
- Test: `apps/api/src/candidates/bulk-invite-template.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `generateBulkInviteTemplate(): Promise<Buffer>` — Task 3's controller calls this directly.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/candidates/bulk-invite-template.spec.ts`:

```typescript
import ExcelJS from 'exceljs';
import { generateBulkInviteTemplate } from './bulk-invite-template';

describe('generateBulkInviteTemplate', () => {
  it('produces a workbook with the Email/Name/Phone headers and one example row', async () => {
    const buffer = await generateBulkInviteTemplate();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1).values as unknown[];
    const headers = headerRow.slice(1).map((v) => String(v));
    expect(headers).toEqual(['Email', 'Name', 'Phone']);

    expect(sheet.rowCount).toBe(2);
    const exampleRow = sheet.getRow(2).values as unknown[];
    expect(String(exampleRow[1])).toContain('@');
    expect(String(exampleRow[2]).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/candidates/bulk-invite-template.spec.ts`
Expected: FAIL with `Cannot find module './bulk-invite-template'`.

- [ ] **Step 3: Implement the template generator**

Create `apps/api/src/candidates/bulk-invite-template.ts`:

```typescript
import ExcelJS from 'exceljs';

const HEADERS = ['Email', 'Name', 'Phone'];
const EXAMPLE_ROW = { Email: 'alice@example.com', Name: 'Alice Smith', Phone: '555-1234' };

export async function generateBulkInviteTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Candidates');
  sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 24 }));
  sheet.addRow(EXAMPLE_ROW);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/candidates/bulk-invite-template.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates/bulk-invite-template.ts apps/api/src/candidates/bulk-invite-template.spec.ts
git commit -m "feat: add downloadable bulk candidate upload+invite template generator"
```

---

### Task 3: Backend — service + controller wiring

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Modify: `apps/api/src/invitations/invitations.controller.ts`
- Modify: `apps/api/src/invitations/invitations.service.spec.ts` (append tests)
- Modify: `apps/api/test/candidates-invitations.e2e-spec.ts` (append test to the `describe('Candidates & Invitations HTTP flow', ...)` block)

**Interfaces:**
- Consumes: `parseBulkInviteFile`, `detectFileKind`, `MAX_BULK_INVITE_SIZE_BYTES`, `MAX_BULK_INVITE_ROWS`, `BulkInviteRowError` from `../candidates/bulk-invite-parser` (Task 1); `generateBulkInviteTemplate` from `../candidates/bulk-invite-template` (Task 2); the existing, **unmodified** `InvitationsService.bulkInvite(context, examId, candidateIds)`.
- Produces: `InvitationsService.bulkUploadAndInvite(context: TenantContext, examId: string, file: Express.Multer.File): Promise<BulkUploadInviteResult>` where `BulkUploadInviteResult = { created: Invitation[]; skipped: { email: string; reason: string }[]; errors: BulkInviteRowError[] }`; `POST /candidates/bulk-upload-invite` (guarded by `candidate:manage`, multipart `file` field plus an `examId` body field, throttled `MODERATE_UPLOAD_THROTTLE`); `GET /candidates/bulk-upload-invite/template` (guarded by `candidate:manage`, returns the `.xlsx` template as a download).

- [ ] **Step 1: Write the failing unit tests**

Open `apps/api/src/invitations/invitations.service.spec.ts` and append at the end of the file (after the last existing `it(...)`, still inside the outer `describe('InvitationsService', ...)` block, before its closing `});`):

```typescript

  describe('bulkUploadAndInvite', () => {
    it('creates/updates candidates from a CSV, invites them, and reports skips and errors separately', async () => {
      const csv = [
        'Email,Name,Phone',
        'new@test.com,New Person,',
        'existing@test.com,Existing Updated,555-0002',
        'not-an-email,Bad Row,',
      ].join('\n');
      const file = { originalname: 'candidates.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;

      const examCheckTx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) } };
      const candidateLoopTx = {
        candidate: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'cand-existing', email: 'existing@test.com' }),
          create: jest.fn().mockResolvedValue({ id: 'cand-new', email: 'new@test.com' }),
          update: jest.fn().mockResolvedValue({ id: 'cand-existing', email: 'existing@test.com' }),
        },
      };
      const bulkInviteTx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
        candidate: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'cand-new', email: 'new@test.com', name: 'New Person', erasedAt: null },
            { id: 'cand-existing', email: 'existing@test.com', name: 'Existing Updated', erasedAt: null },
          ]),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-existing' }]),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-new', status: 'invited' }),
        },
      };
      // Three sequential forTenant calls, in order: the exam-published check, the
      // candidate create/update loop, and bulkInvite's own internal transaction.
      // A 4th call (the fire-and-forget notification write inside dispatchInvitationEmail)
      // happens asynchronously after this method returns and is not awaited here --
      // matching how the existing bulkInvite test above only asserts on it after an
      // explicit microtask flush. It's left unmocked; an unmocked forTenant call falls
      // through to undefined, which dispatchInvitationEmail awaits harmlessly since its
      // caller already wraps it in .catch().
      tenantPrisma.forTenant
        .mockImplementationOnce((_ctx, fn) => fn(examCheckTx))
        .mockImplementationOnce((_ctx, fn) => fn(candidateLoopTx))
        .mockImplementationOnce((_ctx, fn) => fn(bulkInviteTx));

      const result = await service.bulkUploadAndInvite(context, 'exam-1', file);

      expect(result.created).toHaveLength(1);
      expect(result.created[0].candidateId).toBe('cand-new');
      expect(result.skipped).toEqual([{ email: 'existing@test.com', reason: 'Candidate already has a live invitation for this exam' }]);
      expect(result.errors).toEqual([{ row: 3, message: 'Invalid or missing email: "not-an-email"' }]);
      expect(tx.candidate.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', email: 'new@test.com', name: 'New Person', phone: undefined },
      });
      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-existing' },
        data: { name: 'Existing Updated', phone: '555-0002' },
      });
    });

    it('rejects the whole request when the exam is not published, before any candidate is created', async () => {
      const csv = 'Email,Name,Phone\nalice@test.com,Alice,';
      const file = { originalname: 'candidates.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.bulkUploadAndInvite(context, 'exam-1', file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a file with an unsupported extension before touching the exam or database', async () => {
      const file = { originalname: 'candidates.txt', size: 10, buffer: Buffer.from('irrelevant') } as Express.Multer.File;

      await expect(service.bulkUploadAndInvite(context, 'exam-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/invitations/invitations.service.spec.ts -t bulkUploadAndInvite`
Expected: FAIL with `service.bulkUploadAndInvite is not a function`.

- [ ] **Step 3: Implement `InvitationsService.bulkUploadAndInvite()`**

In `apps/api/src/invitations/invitations.service.ts`, add these imports at the top, alongside the existing ones:

```typescript
import {
  parseBulkInviteFile,
  detectFileKind,
  MAX_BULK_INVITE_SIZE_BYTES,
  MAX_BULK_INVITE_ROWS,
  BulkInviteRowError,
} from '../candidates/bulk-invite-parser';
```

Add this interface near the top of the file, alongside the existing `BulkInviteResult` interface:

```typescript
export interface BulkUploadInviteResult {
  created: Invitation[];
  skipped: { email: string; reason: string }[];
  errors: BulkInviteRowError[];
}
```

Add this method to the `InvitationsService` class, immediately after `bulkInvite()`:

```typescript

  async bulkUploadAndInvite(context: TenantContext, examId: string, file: Express.Multer.File): Promise<BulkUploadInviteResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const kind = detectFileKind(file.originalname);
    if (!kind) {
      throw new BadRequestException('File must be a .csv or .xlsx file');
    }
    if (file.size > MAX_BULK_INVITE_SIZE_BYTES) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    const exam = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } }),
    );
    if (!exam) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }
    if (exam.status !== 'published') {
      throw new BadRequestException(`Exam ${examId} must be published before candidates can be invited`);
    }

    const { rows, errors: parseErrors } = await parseBulkInviteFile(file.buffer, kind);
    if (rows.length + parseErrors.length > MAX_BULK_INVITE_ROWS) {
      throw new BadRequestException(
        `File must contain at most ${MAX_BULK_INVITE_ROWS} candidates (found ${rows.length + parseErrors.length})`,
      );
    }

    const candidateIds: string[] = [];
    const emailByCandidateId = new Map<string, string>();

    await this.tenantPrisma.forTenant(context, async (tx) => {
      for (const row of rows) {
        const existing = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: row.email },
        });
        let candidateId: string;
        if (existing) {
          const updated = await tx.candidate.update({
            where: { id: existing.id },
            data: { name: row.name, phone: row.phone },
          });
          candidateId = updated.id;
        } else {
          const created = await tx.candidate.create({
            data: {
              organizationId: context.organizationId as string,
              email: row.email,
              name: row.name,
              phone: row.phone,
            },
          });
          candidateId = created.id;
        }
        candidateIds.push(candidateId);
        emailByCandidateId.set(candidateId, row.email);
      }
    });

    const inviteResult = await this.bulkInvite(context, examId, candidateIds);

    return {
      created: inviteResult.created,
      skipped: inviteResult.skipped.map((s) => ({ email: emailByCandidateId.get(s.candidateId) ?? s.candidateId, reason: s.reason })),
      errors: parseErrors,
    };
  }
```

Note: this method calls `this.bulkInvite(...)` — the existing, unmodified method already defined earlier in this same class — which itself re-validates the exam is published and re-fetches the candidates. That's intentional, minor redundant work in exchange for reusing `bulkInvite`'s already-correct skip-detection and fire-and-forget email dispatch logic with zero duplication.

- [ ] **Step 4: Add the controller routes**

In `apps/api/src/invitations/invitations.controller.ts`, update the imports:

```typescript
import { Body, Controller, Get, Param, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InvitationsService } from './invitations.service';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { BulkUploadInviteDto } from './dto/bulk-upload-invite.dto';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { generateBulkInviteTemplate } from '../candidates/bulk-invite-template';
```

Create `apps/api/src/invitations/dto/bulk-upload-invite.dto.ts`:

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class BulkUploadInviteDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}
```

Insert these two routes into `InvitationsController`, immediately after the `bulkInvite` method and before `list()`:

```typescript

  @Post('candidates/bulk-upload-invite')
  @RequirePermissions('candidate:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  bulkUploadInvite(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: BulkUploadInviteDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.invitationsService.bulkUploadAndInvite(tenant, dto.examId, file);
  }

  @Get('candidates/bulk-upload-invite/template')
  @RequirePermissions('candidate:manage')
  async downloadBulkUploadInviteTemplate(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const buffer = await generateBulkInviteTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="candidate-bulk-upload-invite-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/invitations/invitations.service.spec.ts`
Expected: PASS, all tests including the 3 new `bulkUploadAndInvite` tests.

- [ ] **Step 6: Write the e2e test**

Open `apps/api/test/candidates-invitations.e2e-spec.ts`. Append this `it(...)` block inside the `describe('Candidates & Invitations HTTP flow', ...)` block, as the last test before its closing `});` (after the existing invitation-lifecycle test — this reuses that test's shared `examId`, which is already `published` and already has all 5 existing candidates invited, giving a real "already invited" candidate to exercise the skip path with no extra setup):

```typescript

  it('bulk-uploads a CSV of candidates and invites them, splitting created/skipped/errors', async () => {
    const csv = [
      'Email,Name,Phone',
      'frank@ci-http.test,Frank,555-2000',
      'alice@ci-http.test,Alice Renamed,',
      'not-an-email,Bad Row,',
    ].join('\n');

    const response = await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk-upload-invite')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .field('examId', examId)
      .attach('file', Buffer.from(csv), { filename: 'candidates.csv', contentType: 'text/csv' })
      .expect(201);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0].candidateId).toBeDefined();
    expect(response.body.skipped).toEqual([{ email: 'alice@ci-http.test', reason: 'Candidate already has a live invitation for this exam' }]);
    expect(response.body.errors).toEqual([{ row: 3, message: 'Invalid or missing email: "not-an-email"' }]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const frank = listResponse.body.find((c: { email: string }) => c.email === 'frank@ci-http.test');
    expect(frank).toBeDefined();
    const alice = listResponse.body.find((c: { email: string }) => c.email === 'alice@ci-http.test');
    expect(alice.name).toBe('Alice Renamed');
  });

  it('rejects a bulk upload+invite file with an unsupported extension', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk-upload-invite')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .field('examId', examId)
      .attach('file', Buffer.from('irrelevant'), { filename: 'candidates.txt', contentType: 'text/plain' })
      .expect(400);
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd apps/api && timeout 100 npx jest --config ./test/jest-e2e.json --runInBand candidates-invitations.e2e-spec.ts`
Expected: PASS, all tests including the 2 new bulk-upload-invite tests. (Wrapped with an external bounded timeout — this project has a documented history of e2e hangs on an unguarded `afterAll`.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.controller.ts apps/api/src/invitations/dto/bulk-upload-invite.dto.ts apps/api/src/invitations/invitations.service.spec.ts apps/api/test/candidates-invitations.e2e-spec.ts
git commit -m "feat: add POST /candidates/bulk-upload-invite and its template endpoint"
```

---

### Task 4: Frontend — Bulk Upload & Invite screen

**Files:**
- Modify: `apps/web/lib/hooks/useInvitations.ts` (append hooks)
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx` (add "Bulk upload & invite" link)
- Create: `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.tsx`
- Test: `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.test.tsx`

**Interfaces:**
- Consumes: `POST /candidates/bulk-upload-invite` and `GET /candidates/bulk-upload-invite/template` from Task 3 (response shape `{ created: (Invitation & {token: string})[], skipped: {email, reason}[], errors: {row, message}[] }`).
- Produces: `useBulkUploadInvite(): UseMutationResult` (`mutate({file, examId}, {onSuccess, onError})`), `useDownloadBulkUploadInviteTemplate(): UseMutationResult` (`mutateAsync(): Promise<{blob: Blob, filename: string | null}>`), both exported from `useInvitations.ts`.

- [ ] **Step 1: Write the failing frontend test**

Create `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkUploadInviteCandidatesPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <BulkUploadInviteCandidatesPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('BulkUploadInviteCandidatesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a file for the selected exam and shows created/skipped/error results', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published' }]), { status: 200 });
      }
      if (String(url).endsWith('/candidates/bulk-upload-invite') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            created: [{ id: 'inv-1', candidateId: 'cand-1' }],
            skipped: [{ email: 'existing@test.com', reason: 'Candidate already has a live invitation for this exam' }],
            errors: [{ row: 3, message: 'Invalid or missing email: "not-an-email"' }],
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Exam to invite to' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam to invite to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Backend Round' }));

    const file = new File(['Email,Name\nfrank@test.com,Frank'], 'candidates.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Candidate file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload & invite' }));

    await waitFor(() => expect(screen.getByText('1 candidate(s) invited.')).toBeInTheDocument());
    expect(screen.getByText('existing@test.com')).toBeInTheDocument();
    expect(screen.getByText('Invalid or missing email: "not-an-email"')).toBeInTheDocument();
  });

  it('shows an error toast when the upload request fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published' }]), { status: 200 });
      }
      if (String(url).endsWith('/candidates/bulk-upload-invite') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'File must be 5MB or smaller' }), { status: 400 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Exam to invite to' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam to invite to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Backend Round' }));

    const file = new File(['Email,Name'], 'candidates.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Candidate file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload & invite' }));

    await waitFor(() => expect(screen.getByText('File must be 5MB or smaller')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm test -- candidates/bulk-upload-invite/page.test.tsx`
Expected: FAIL — `Cannot find module './page'` (the page doesn't exist yet).

- [ ] **Step 3: Add the hooks**

In `apps/web/lib/hooks/useInvitations.ts`, replace the whole file with:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { BulkInviteResult } from '../types';
import { useAuth } from '../auth-context';

export function useBulkInvite(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateIds: string[]): Promise<BulkInviteResult> =>
      apiFetch(`/exams/${examId}/invitations`, { method: 'POST', body: JSON.stringify({ candidateIds }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}

export interface BulkUploadInviteRowError {
  row: number;
  message: string;
}

export interface BulkUploadInviteResult {
  created: { id: string; candidateId: string }[];
  skipped: { email: string; reason: string }[];
  errors: BulkUploadInviteRowError[];
}

export function useBulkUploadInvite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, examId }: { file: File; examId: string }): Promise<BulkUploadInviteResult> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('examId', examId);
      return apiFetch('/candidates/bulk-upload-invite', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}

export function useDownloadBulkUploadInviteTemplate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: () => apiFetchBlob('/candidates/bulk-upload-invite/template', {}, accessToken ?? undefined),
  });
}
```

- [ ] **Step 4: Create the Bulk Upload & Invite screen**

Create `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  useBulkUploadInvite,
  useDownloadBulkUploadInviteTemplate,
  BulkUploadInviteResult,
} from '../../../../lib/hooks/useInvitations';
import { useExams } from '../../../../lib/hooks/useExams';
import { Button, Select, useToast } from '../../../../components/ui';

export default function BulkUploadInviteCandidatesPage() {
  const [examId, setExamId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadInviteResult | null>(null);
  const { data: publishedExams } = useExams('published');
  const { toast } = useToast();
  const bulkUploadInvite = useBulkUploadInvite();
  const downloadTemplate = useDownloadBulkUploadInviteTemplate();

  async function handleDownloadTemplate() {
    try {
      const { blob, filename } = await downloadTemplate.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'candidate-bulk-upload-invite-template.xlsx';
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
    if (!file || !examId) return;
    bulkUploadInvite.mutate(
      { file, examId },
      {
        onSuccess: (data) => {
          setResult(data);
          toast(`${data.created.length} candidate(s) invited.`);
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload candidates.', 'error'),
      },
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Bulk Upload &amp; Invite Candidates</h1>
      <div className="mb-4">
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
      </div>
      <Button variant="secondary" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending}>
        Download template
      </Button>
      <form onSubmit={handleUpload} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Candidate file (.xlsx or .csv, max 5MB)
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" disabled={!file || !examId || bulkUploadInvite.isPending}>
          {bulkUploadInvite.isPending ? 'Uploading…' : 'Upload & invite'}
        </Button>
      </form>
      {result && (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-900">{result.created.length} candidate(s) invited.</p>
          {result.skipped.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700">{result.skipped.length} already invited:</p>
              <ul className="mt-1 text-sm text-gray-600">
                {result.skipped.map((skip) => (
                  <li key={skip.email}>{skip.email}</li>
                ))}
              </ul>
            </div>
          )}
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

- [ ] **Step 5: Add the "Bulk upload & invite" link to the Candidates page**

In `apps/web/app/(recruiter)/candidates/page.tsx`, add the `Link` import (currently imported from `next/link`? check — the file does not currently import `Link`, so add it) and a link near the existing exam-picker/invite controls. Replace:

```tsx
'use client';

import { useEffect, useState } from 'react';
```

with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
```

Then replace:

```tsx
      <div className="mb-4 flex items-end gap-2">
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0}>
          Send invitations
        </Button>
      </div>
```

with:

```tsx
      <div className="mb-4 flex items-end gap-2">
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0}>
          Send invitations
        </Button>
        <Link href="/candidates/bulk-upload-invite">
          <Button variant="secondary">Bulk upload &amp; invite</Button>
        </Link>
      </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npm test -- candidates/bulk-upload-invite/page.test.tsx`
Expected: PASS, both tests.

Then run the full frontend suite to confirm no regression:

Run: `cd apps/web && npm test`
Expected: PASS, all suites (including the unmodified behavior of `candidates/page.test.tsx`, since only its static JSX and an unused-until-now `Select`/`Link` composition changed).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useInvitations.ts "apps/web/app/(recruiter)/candidates/page.tsx" "apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.tsx" "apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.test.tsx"
git commit -m "feat: add Bulk Upload & Invite Candidates screen"
```

---

### Task 5: Playwright — extend the recruiter golden path

**Files:**
- Create: `apps/web/e2e/fixtures/bulk-candidates.csv`
- Modify: `apps/web/e2e/recruiter-golden-path.spec.ts`

**Interfaces:**
- Consumes: the "Bulk upload & invite" link and screen from Task 4, and the exam already created/published earlier in the same golden-path spec.
- Produces: end-to-end proof that uploading a real file through the actual UI creates a real candidate and sends them a real invitation.

- [ ] **Step 1: Create the fixture file**

Create `apps/web/e2e/fixtures/bulk-candidates.csv`:

```csv
Email,Name,Phone
bulk-invite-fixture@example.com,Bulk Invite Fixture,555-3000
```

- [ ] **Step 2: Write the extended e2e step**

Read the current `apps/web/e2e/recruiter-golden-path.spec.ts` first — a prior feature (Bulk Question Upload) already extended this file with a bulk-question-upload step, so the exact surrounding lines will differ from any version described elsewhere. Confirm the current content around the candidate-invite section (near the end of the test, after the exam is published) before editing — don't assume line numbers.

The test currently ends with the existing single-candidate invite flow (`Add candidate` → select exam → check candidate → `Send invitations` → assert `Invited 1 candidate(s)`). Add the new step immediately after that existing invite assertion and before the test's closing `});`:

```ts
  await page.getByRole('link', { name: 'Bulk upload & invite' }).click();
  await expect(page).toHaveURL(/\/candidates\/bulk-upload-invite$/);
  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByLabel(/Candidate file/).setInputFiles(path.join(__dirname, 'fixtures', 'bulk-candidates.csv'));
  await page.getByRole('button', { name: 'Upload & invite' }).click();
  await expect(page.getByText('1 candidate(s) invited.')).toBeVisible();
```

`apps/web/components/ui/Select.tsx` is a Radix `Select.Root`/`Select.Trigger`/`Select.Item` combobox (`aria-label` set to the `label` prop on the trigger, options rendered as `role="option"` items in a portal) — not a native `<select>`. The click-then-option pattern above is the correct, already-verified interaction for this component, matching exactly how the existing candidate-invite step earlier in this same file already drives its own "Exam to invite to" `Select` (`await page.getByLabel('Exam to invite to').click(); await page.getByRole('option', { name: examTitle, exact: true }).click();`) — do not use `selectOption()`, it will not work against this component.

If `import path from 'path';` is not already present at the top of the file (it may already be there from the earlier Bulk Question Upload extension — check first), add it as the first import.

- [ ] **Step 3: Confirm dev servers are running, then run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports are unavailable).

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 4: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/fixtures/bulk-candidates.csv apps/web/e2e/recruiter-golden-path.spec.ts
git commit -m "test: extend recruiter golden path with the bulk candidate upload+invite flow"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Tasks 1-3. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY`) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Task 4.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every golden path passes, including the extended `recruiter-golden-path.spec.ts` from Task 5.

- [ ] **Step 4: Manual smoke check**

With dev servers running: as recruiter, publish an exam, open Candidates, click "Download template," confirm a valid `.xlsx` downloads with the Email/Name/Phone headers and one example row. Upload a file with a mix of a brand-new email, an email matching an existing candidate, and a malformed row; confirm the invited count, the skipped list (if the exam already had that candidate invited), and the error table all render correctly, and confirm the new/updated candidates and their invitations show up in the Candidates/exam invitations lists.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md` (overwrite fresh for this feature, per this project's ledger convention):

```
# Bulk Upload & Invite Candidates — SDD Progress Ledger

## Tasks
Task 1: complete (backend — CSV/XLSX parser)
Task 2: complete (backend — downloadable template generator)
Task 3: complete (backend — POST /candidates/bulk-upload-invite + template endpoint)
Task 4: complete (frontend — Bulk Upload & Invite Candidates screen)
Task 5: complete (Playwright — extended recruiter golden path)
Task 6: complete (final verification)
```
