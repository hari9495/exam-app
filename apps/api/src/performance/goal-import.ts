import { parse } from 'csv-parse/sync';
import { ImportFileProblem, type RowProblem } from './competency-import';

// T2-C item 71 (answer 2844): goals for many people from a CSV file, like the competency import (PRF-14): every row is
// checked, a preview lists what would be added, and nothing is saved unless every row is right. Pure: employee codes,
// scope and existing goals are checked by the service, inside the company.
//   employee_code  the person's employee code
//   title          3–200 characters
//   description    optional, up to 1000 characters
//   weight         0–100 (default 0)
//   kind           kpi (default); an objective with key results (okr) is added on the Goals page

export const GOAL_IMPORT_COLUMNS = ['employee_code', 'title', 'description', 'weight', 'kind'] as const;
const REQUIRED = ['employee_code', 'title'];
export const MAX_GOAL_ROWS = 500;
const MAX_LENGTH = 256 * 1024;

export interface GoalImportRow {
  line: number;
  employeeCode: string;
  title: string;
  description: string | null;
  weight: number;
}

const normalise = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function parseGoalCsv(csv: string): { rows: GoalImportRow[]; problems: RowProblem[] } {
  if (csv.length > MAX_LENGTH) throw new ImportFileProblem('The file is larger than 256 KB.');
  let records: string[][];
  try {
    records = parse(csv.replace(/^﻿/, ''), { skip_empty_lines: true, relax_column_count: false, trim: true, max_record_size: 8192 }) as string[][];
  } catch (e) {
    throw new ImportFileProblem(`The file is not valid CSV: ${e instanceof Error ? e.message.replace(/^Invalid Record Length: /, '') : 'unreadable'}`);
  }
  if (records.length < 2) throw new ImportFileProblem('The file has no rows under the header.');
  const header = records[0].map(normalise);
  const unknown = header.filter((h) => !(GOAL_IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) throw new ImportFileProblem(`Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use: ${GOAL_IMPORT_COLUMNS.join(', ')}.`);
  if (new Set(header).size !== header.length) throw new ImportFileProblem('A column appears twice in the header.');
  const missing = REQUIRED.filter((r) => !header.includes(r));
  if (missing.length) throw new ImportFileProblem(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  if (records.length - 1 > MAX_GOAL_ROWS) throw new ImportFileProblem(`At most ${MAX_GOAL_ROWS} goals per file.`);
  const rows: GoalImportRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  records.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const cell = (k: string) => (header.indexOf(k) < 0 ? '' : cells[header.indexOf(k)]);
    const out: string[] = [];
    const employeeCode = cell('employee_code');
    const title = cell('title');
    if (!employeeCode) out.push('Give the employee code.');
    if (title.length < 3 || title.length > 200) out.push('Give a title of 3 to 200 characters.');
    const description = cell('description') || null;
    if (description && description.length > 1000) out.push('Keep the description to 1000 characters.');
    const w = cell('weight');
    const weight = w === '' ? 0 : Number(w);
    if (!/^\d+(\.\d{1,2})?$/.test(w || '0') || weight > 100) out.push('Weight is a number from 0 to 100.');
    const kind = (cell('kind') || 'kpi').toLowerCase();
    if (kind === 'okr') out.push('Add an objective with key results on the Goals page; the file takes KPI goals.');
    else if (kind !== 'kpi') out.push('Kind is kpi.');
    const key = `${employeeCode.toLowerCase()}|${title.toLowerCase()}`;
    if (employeeCode && title && seen.has(key)) out.push('This person has this goal twice in the file.');
    seen.add(key);
    if (out.length) problems.push({ line, name: title || employeeCode || `Row ${line}`, problems: out });
    else rows.push({ line, employeeCode, title, description, weight });
  });
  return { rows, problems };
}
