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
  const firstName = (record['First Name'] ?? '').trim();
  // Optional -- files made from the pre-middle-name template simply have no such column.
  const middleName = (record['Middle Name'] ?? '').trim();
  const lastName = (record['Last Name'] ?? '').trim();
  const phone = (record.Phone ?? '').trim() || undefined;

  if (!EMAIL_PATTERN.test(email)) {
    return { row: rowNumber, message: `Invalid or missing email: "${email}"` };
  }
  if (!firstName) {
    return { row: rowNumber, message: 'Missing first name' };
  }
  if (!lastName) {
    return { row: rowNumber, message: 'Missing last name' };
  }

  return { rowNumber, email, name: [firstName, middleName, lastName].filter(Boolean).join(' '), phone };
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
