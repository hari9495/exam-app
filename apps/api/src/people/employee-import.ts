import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { PAN } from '../org-structure/org-validation';

// People › Import (PPL-07): reading an employee file (CSV or Excel) and checking each row's fields in plain words.
// Pure; the service resolves names to records and creates people through the hire path. Nothing here is saved.

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
const MAX_COLUMNS = 40;
const MAX_CELL = 200;

/** The YukthiX fields a column can be matched to, with the words a file usually uses for them. */
export const IMPORT_FIELDS = {
  code: { label: 'Employee code', words: ['employee code', 'emp code', 'emp no', 'employee no', 'employee id', 'emp id', 'code'] },
  name: { label: 'Name', words: ['name', 'full name', 'employee name'] },
  pan: { label: 'PAN', words: ['pan', 'pan no', 'pan number'] },
  manager: { label: 'Manager code', words: ['manager code', 'manager', 'reports to', 'reporting manager', 'manager emp no'] },
  joined: { label: 'Joining date', words: ['joining date', 'date of joining', 'doj', 'joined', 'joined on', 'start date'] },
  department: { label: 'Department', words: ['department', 'dept'] },
  designation: { label: 'Designation', words: ['designation', 'job title', 'title', 'role'] },
  location: { label: 'Location', words: ['location', 'work location', 'site', 'office'] },
  type: { label: 'Employment type', words: ['employment type', 'type', 'emp type'] },
  status: { label: 'Status', words: ['status', 'employment status'] },
  email: { label: 'Work email', words: ['work email', 'email', 'official email', 'email id'] },
  mobile: { label: 'Mobile', words: ['mobile', 'phone', 'mobile no', 'mobile number', 'phone number'] },
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export const FIELD_KEYS = Object.keys(IMPORT_FIELDS) as ImportField[];
/** Fields every row needs (a join sets location, department, designation and employment type). */
export const REQUIRED_FIELDS: readonly ImportField[] = ['name', 'joined', 'department', 'designation', 'location', 'type'];

export class ImportFileProblem extends Error {}

export interface ReadFile {
  columns: { column: string; sample: string; field: ImportField | null }[];
  /** Data rows, cells in column order, with their row number in the file (the header is row 1). */
  rows: { row: number; cells: string[] }[];
  /** The fields a column can be matched to, in order, and which ones every row needs. */
  fields: { key: ImportField; label: string; required: boolean }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s._-]+/g, ' ');

/** The field a column header most likely means, each field used at most once. */
export function guessFields(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const n = norm(h);
    const f = FIELD_KEYS.find((k) => !used.has(k) && (IMPORT_FIELDS[k].words as readonly string[]).includes(n));
    if (f) used.add(f);
    return f ?? null;
  });
}

/** "01 Oct 2026" for an Excel date cell (Excel dates carry no zone: read them as UTC). */
const dayText = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return dayText(v);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result instanceof Date ? dayText(v.result) : String(v.result ?? '');
    return '';
  }
  return String(v);
}

/** Rows of a CSV or .xlsx file (first sheet, header in row 1), or an ImportFileProblem saying what is wrong with the file. */
/** The fields a column can be matched to, in order, and which ones every row needs. */
export const importFieldList = () => FIELD_KEYS.map((key) => ({ key, label: IMPORT_FIELDS[key].label, required: REQUIRED_FIELDS.includes(key) }));

export async function readImportFile(buffer: Buffer, fileName: string): Promise<ReadFile> {
  if (buffer.length > MAX_IMPORT_BYTES) throw new ImportFileProblem('The file is larger than 2 MB. Split it into smaller files.');
  const lower = fileName.toLowerCase();
  let records: string[][];
  if (lower.endsWith('.csv')) {
    try {
      // info.lines is the record's last line in the file, so a blank line never shifts a row number.
      const out = parse(buffer.toString('utf-8').replace(/^﻿/, ''), { skip_empty_lines: true, relax_column_count: true, trim: true, max_record_size: 16384, info: true }) as unknown as { record: string[]; info: { lines: number } }[];
      records = [];
      for (const r of out) records[r.info.lines - 1] = r.record;
    } catch {
      throw new ImportFileProblem('We could not read this CSV file. Save it again as CSV (comma separated) and upload it.');
    }
  } else if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new ImportFileProblem('We could not read this Excel file. Save it again as .xlsx and upload it.');
    }
    const sheet = wb.worksheets[0];
    records = [];
    if (sheet) {
      if (sheet.rowCount > MAX_IMPORT_ROWS + 1) throw new ImportFileProblem(`The file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.`);
      const width = Math.min(sheet.columnCount, MAX_COLUMNS + 1);
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value).trim());
        records.push(cells);
      }
    }
  } else {
    throw new ImportFileProblem('Upload a .csv or .xlsx file.');
  }
  // Blank lines (an Excel sheet keeps them) are not rows; the file's own row numbers stay.
  const numbered = Array.from(records, (cells, i) => ({ row: i + 1, cells: cells ?? [] })).filter((r) => r.cells.some((c) => c !== ''));
  if (numbered.length < 2) throw new ImportFileProblem('The file has no rows under the header.');
  const header = numbered[0].cells;
  const last = header.reduce((n, h, i) => (h ? i + 1 : n), 0);
  if (last > MAX_COLUMNS) throw new ImportFileProblem(`The file has more than ${MAX_COLUMNS} columns.`);
  const headers = header.slice(0, last);
  if (headers.some((h) => !h)) throw new ImportFileProblem('A column has no name in the first row. Give every column a name.');
  if (new Set(headers.map(norm)).size !== headers.length) throw new ImportFileProblem('Two columns have the same name. Rename one of them.');
  const data = numbered.slice(1);
  if (data.length > MAX_IMPORT_ROWS) throw new ImportFileProblem(`The file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.`);
  const rows = data.map((r) => ({ row: r.row, cells: headers.map((_, i) => (r.cells[i] ?? '').slice(0, MAX_CELL)) }));
  const fields = guessFields(headers);
  return {
    columns: headers.map((column, i) => ({ column, sample: rows.find((r) => r.cells[i])?.cells[i] ?? '', field: fields[i] })),
    rows,
    fields: importFieldList(),
  };
}

/** ISO date from "01 Oct 2026", "2026-10-01" or "01/10/2026" (day first), or null. */
export function importDate(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/))) {
    const i = MONTHS.findIndex((mm) => mm.toLowerCase() === x![2].toLowerCase());
    if (i < 0) return null;
    [d, m, y] = [Number(x[1]), i + 1, Number(x[3])];
  } else if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1950 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const showDate = (iso: string) => dayText(new Date(`${iso}T00:00:00Z`));

export type ImportValues = Partial<Record<ImportField, string>>;
export interface Issue {
  /** The field's label ("PAN"), or "Already an employee" for a row that is skipped. */
  field: string;
  message: string;
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field problems a row has on its own (lookups against records are the service's), in plain words. */
export function fieldIssues(v: ImportValues): Issue[] {
  const out: Issue[] = [];
  const val = (f: ImportField) => (v[f] ?? '').trim();
  const add = (f: ImportField, message: string) => out.push({ field: IMPORT_FIELDS[f].label, message });
  if (!val('name')) add('name', 'Enter the employee name.');
  else if (val('name').length > 200) add('name', 'The name is longer than 200 letters.');
  if (val('code') && !CODE.test(val('code'))) add('code', 'Use up to 30 letters and digits (and / - _), or leave it blank.');
  if (val('pan') && !PAN.test(val('pan').toUpperCase())) add('pan', 'Enter a 10-character PAN like ABCDE1234F.');
  if (!val('joined')) add('joined', 'Enter the joining date, like 01 Oct 2026.');
  else if (!importDate(val('joined'))) add('joined', 'Enter the date as dd MMM yyyy, like 01 Oct 2026.');
  for (const f of ['department', 'designation', 'location', 'type'] as const) if (!val(f)) add(f, `Enter the ${IMPORT_FIELDS[f].label.toLowerCase()}.`);
  if (val('status') && !['probation', 'confirmed'].includes(val('status').toLowerCase())) add('status', 'Use Probation or Confirmed, or leave it blank for Probation.');
  if (val('email') && !EMAIL.test(val('email'))) add('email', 'Enter a work email like name@company.com.');
  return out;
}

/** "Dept X (YX-ORG-04)." → "Dept X." : people never see internal rule numbers. */
export const plain = (msg: string) => msg.replace(/\s*\((?:YX|P\d|M\d|R\d|Q\d)[^)]*\)/g, '').trim();
