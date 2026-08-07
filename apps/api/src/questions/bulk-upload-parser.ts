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
  languageMode?: string;
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

  // Blank means 'fixed': every spreadsheet written before this column existed sets CodeLanguage
  // and expects a single fixed language, so the default has to preserve that.
  const languageMode = (record.LanguageMode ?? '').trim().toLowerCase() || 'fixed';
  if (type === 'code' && languageMode !== 'fixed' && languageMode !== 'any') {
    return { row: rowNumber, message: `LanguageMode must be "fixed" or "any", got "${languageMode}"` };
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
    languageMode,
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
