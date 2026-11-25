import { parse } from 'csv-parse/sync';

// PRF-14 Import: competencies from a CSV file. Every row is checked; nothing is saved unless every row is right, and the
// rows with problems are listed (line number, name, what is wrong). Pure: names of designations and existing
// competencies are matched by the service, inside the company.
//   name         2–120 characters, once per file
//   group        core, functional or leadership
//   description  optional, up to 500 characters
//   levels       2–10 level names in order, separated by "|" (each 2–80 characters)
//   roles        optional: "Designation=level" pairs separated by "|", each level from 1 to the number of levels

export const IMPORT_COLUMNS = ['name', 'group', 'description', 'levels', 'roles'] as const;
const REQUIRED = ['name', 'group', 'levels'];
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_LENGTH = 256 * 1024;
const GROUPS = ['core', 'functional', 'leadership'] as const;

export class ImportFileProblem extends Error {}

export interface ImportRow {
  line: number;
  name: string;
  group: (typeof GROUPS)[number];
  description: string | null;
  levels: string[];
  roles: { designation: string; level: number }[];
}
export interface RowProblem {
  line: number;
  name: string;
  problems: string[];
}

const normalise = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');
const parts = (v: string | undefined) => (v ?? '').split('|').map((x) => x.trim()).filter(Boolean);

/** Each row checked on its own; file-wide problems (not CSV, unknown columns, too many rows) throw ImportFileProblem. */
export function parseCompetencyCsv(csv: string): { rows: ImportRow[]; problems: RowProblem[] } {
  if (csv.length > MAX_IMPORT_LENGTH) throw new ImportFileProblem('The file is larger than 256 KB.');
  let records: string[][];
  try {
    records = parse(csv.replace(/^﻿/, ''), { skip_empty_lines: true, relax_column_count: false, trim: true, max_record_size: 8192 }) as string[][];
  } catch (e) {
    throw new ImportFileProblem(`The file is not valid CSV: ${e instanceof Error ? e.message.replace(/^Invalid Record Length: /, '') : 'unreadable'}`);
  }
  if (records.length < 2) throw new ImportFileProblem('The file has no rows under the header.');
  const header = records[0].map(normalise);
  const unknown = header.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) throw new ImportFileProblem(`Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use: ${IMPORT_COLUMNS.join(', ')}.`);
  if (new Set(header).size !== header.length) throw new ImportFileProblem('A column appears twice in the header.');
  const missing = REQUIRED.filter((r) => !header.includes(r));
  if (missing.length) throw new ImportFileProblem(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  if (records.length - 1 > MAX_IMPORT_ROWS) throw new ImportFileProblem(`At most ${MAX_IMPORT_ROWS} competencies per file.`);

  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();
  records.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const cell = (k: string) => {
      const j = header.indexOf(k);
      return j < 0 ? '' : cells[j];
    };
    const out: string[] = [];
    const name = cell('name');
    if (name.length < 2 || name.length > 120) out.push('Give a name of 2 to 120 characters.');
    const group = cell('group').toLowerCase();
    if (!(GROUPS as readonly string[]).includes(group)) out.push('Group must be core, functional or leadership.');
    const description = cell('description') || null;
    if (description && description.length > 500) out.push('Keep the description to 500 characters.');
    const levels = parts(cell('levels'));
    if (levels.length < 2 || levels.length > 10) out.push('Give 2 to 10 levels, separated by "|".');
    if (levels.some((l) => l.length < 2 || l.length > 80)) out.push('Each level name needs 2 to 80 characters.');
    const roles: ImportRow['roles'] = [];
    for (const p of parts(cell('roles'))) {
      const m = /^(.+?)\s*=\s*(\d{1,2})$/.exec(p);
      if (!m) {
        out.push(`Write each role as "Designation=level": "${p.slice(0, 40)}" is not.`);
        continue;
      }
      const level = Number(m[2]);
      if (level < 1 || level > Math.max(levels.length, 1)) out.push(`The level for ${m[1]} must be from 1 to ${Math.max(levels.length, 1)}.`);
      if (roles.some((r) => r.designation.toLowerCase() === m[1].toLowerCase())) out.push(`${m[1]} is listed twice.`);
      roles.push({ designation: m[1], level });
    }
    const key = `${group}|${name.toLowerCase()}`;
    if (name && seen.has(key)) out.push(`The same name is on line ${seen.get(key)}.`);
    else if (name) seen.set(key, line);
    if (out.length) problems.push({ line, name, problems: out });
    else rows.push({ line, name, group: group as ImportRow['group'], description, levels, roles });
  });
  return { rows, problems };
}
