import { parse } from 'csv-parse/sync';

// PRF-10 comp market data (founder answer 12): a salary survey as CSV, one row per grade. Every row is checked; one bad
// row and nothing is saved, and every bad row is listed with its line number and what to fix.

export const MARKET_COLUMNS = ['grade', 'min', 'median', 'max', 'currency'] as const;
export const MARKET_MAX_ROWS = 1000;

export type MarketRow = { gradeId: string; grade: string; min: number; median: number; max: number; currency: string };
export type MarketProblem = { row: number; message: string };

const amount = (s: string) => {
  const t = s.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 1e12 ? n : null;
};

/** Reads the CSV and checks each row against the company's grades (matched by name or code, any case). */
export function readMarketCsv(text: string, grades: { id: string; name: string; code: string | null }[]): { rows: MarketRow[]; errors: MarketProblem[] } {
  let records: string[][];
  try {
    records = parse(text.replace(/^﻿/, ''), { skip_empty_lines: true, trim: true, relax_column_count: true }) as string[][];
  } catch {
    return { rows: [], errors: [{ row: 1, message: 'This is not a readable CSV file. Save it as CSV (comma separated) and try again.' }] };
  }
  if (!records.length) return { rows: [], errors: [{ row: 1, message: 'The file is empty.' }] };
  const head = records[0]!.map((h) => h.toLowerCase());
  const missing = MARKET_COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) return { rows: [], errors: [{ row: 1, message: `The first row must name the columns ${MARKET_COLUMNS.join(', ')}. Missing: ${missing.join(', ')}.` }] };
  const at = (r: string[], c: (typeof MARKET_COLUMNS)[number]) => (r[head.indexOf(c)] ?? '').trim();
  const body = records.slice(1);
  if (!body.length) return { rows: [], errors: [{ row: 2, message: 'Add at least one grade below the column names.' }] };
  if (body.length > MARKET_MAX_ROWS) return { rows: [], errors: [{ row: MARKET_MAX_ROWS + 2, message: `Up to ${MARKET_MAX_ROWS} grades in one file.` }] };
  const byKey = new Map<string, { id: string; name: string }>();
  for (const g of grades) {
    byKey.set(g.name.trim().toLowerCase(), g);
    if (g.code) byKey.set(g.code.trim().toLowerCase(), g);
  }
  const rows: MarketRow[] = [];
  const errors: MarketProblem[] = [];
  const seen = new Set<string>();
  let currency: string | null = null;
  body.forEach((r, i) => {
    const line = i + 2;
    const why: string[] = [];
    const g = byKey.get(at(r, 'grade').toLowerCase());
    if (!at(r, 'grade')) why.push('the grade is empty');
    else if (!g) why.push(`no grade "${at(r, 'grade')}" in this company`);
    else if (seen.has(g.id)) why.push(`grade ${g.name} is already in the file`);
    const [min, median, max] = (['min', 'median', 'max'] as const).map((c) => amount(at(r, c)));
    for (const [c, v] of [['min', min], ['median', median], ['max', max]] as const) if (v === null) why.push(`${c} must be an amount above 0 (like 650000)`);
    if (min !== null && median !== null && max !== null && !(min <= median && median <= max)) why.push('min, median and max must go up (min ≤ median ≤ max)');
    const cur = at(r, 'currency').toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) why.push('currency must be a 3-letter code like INR');
    else if (currency && cur !== currency) why.push(`every row must use the same currency (${currency})`);
    if (why.length) return void errors.push({ row: line, message: `${why.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) });
    currency ??= cur;
    seen.add(g!.id);
    rows.push({ gradeId: g!.id, grade: g!.name, min: min!, median: median!, max: max!, currency: cur });
  });
  return { rows: errors.length ? [] : rows, errors };
}

/** "Stale" when the survey is older than the company's setting (perf.comp.market_stale_months). */
export function marketStale(asOf: string, today: string, months: number): boolean {
  const [y, m, d] = asOf.split('-').map(Number);
  const limit = new Date(Date.UTC(y!, m! - 1 + months, d!));
  return today > limit.toISOString().slice(0, 10);
}
