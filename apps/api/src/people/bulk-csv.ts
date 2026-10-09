import { parse } from 'csv-parse/sync';

// M01 §3.3 bulk job changes from a CSV file: the columns, and parsing into raw rows with line numbers. Codes
// are resolved to records by the service, inside the company. Pure functions.

export const MAX_BULK_ROWS = 500;
export const MAX_BULK_CSV_LENGTH = 512 * 1024;

/** The columns a file may carry (header names are case-insensitive; spaces and dashes count as "_"). */
export const BULK_COLUMNS = [
  'employee_code',
  'legal_entity',
  'change_type',
  'effective_date',
  'location',
  'department',
  'designation',
  'grade',
  'employment_type',
  'manager',
  'dotted_line_managers',
  'cost_centre',
  'annual_ctc',
  'increase_percent',
  'reason',
] as const;
export type BulkColumn = (typeof BULK_COLUMNS)[number];
const REQUIRED: readonly BulkColumn[] = ['employee_code', 'change_type', 'effective_date'];

export type RawRow = { line: number } & Partial<Record<BulkColumn, string>>;

export class CsvProblem extends Error {}

const normalise = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Rows of a bulk-change file, or a CsvProblem saying what is wrong with the file as a whole. */
export function parseBulkCsv(csv: string): RawRow[] {
  if (csv.length > MAX_BULK_CSV_LENGTH) throw new CsvProblem('The file is larger than 512 KB.');
  let records: string[][];
  try {
    records = parse(csv.replace(/^﻿/, ''), { skip_empty_lines: true, relax_column_count: false, trim: true, max_record_size: 4096 }) as string[][];
  } catch (e) {
    throw new CsvProblem(`The file is not valid CSV: ${e instanceof Error ? e.message.replace(/^Invalid Record Length: /, '') : 'unreadable'}`);
  }
  if (records.length < 2) throw new CsvProblem('The file has no rows under the header.');
  const header = records[0].map(normalise);
  const unknown = header.filter((h) => !(BULK_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) throw new CsvProblem(`Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use: ${BULK_COLUMNS.join(', ')}.`);
  if (new Set(header).size !== header.length) throw new CsvProblem('A column appears twice in the header.');
  const missing = REQUIRED.filter((r) => !header.includes(r));
  if (missing.length) throw new CsvProblem(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  if (records.length - 1 > MAX_BULK_ROWS) throw new CsvProblem(`At most ${MAX_BULK_ROWS} rows per file.`);
  return records.slice(1).map((cells, i) => {
    const row: RawRow = { line: i + 2 };
    header.forEach((h, j) => {
      if (cells[j] !== '') row[h as BulkColumn] = cells[j];
    });
    return row;
  });
}
