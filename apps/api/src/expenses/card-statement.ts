import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { merchantsAlike } from './checks';

// EXP-08 card statements (founder answer 3 Nov 2026, option A): one import for any bank. The file is read with proven
// parsers (csv-parse, exceljs), finance maps its columns once per bank, and every row is checked before anything is
// saved. A card number keeps its last 4 digits only; a full number anywhere in a row is cut to its last 4.

export const MAX_ROWS = 5000;
export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export type AmountMode = 'signed' | 'split' | 'indicator';

/** Which column (by its heading) holds what. */
export interface CardMapping {
  date: string;
  dateFormat: DateFormat;
  description: string;
  /** signed: one amount column (minus is `negativeIs`); split: a debit and a credit column; indicator: amount plus a Dr/Cr column. */
  amountMode: AmountMode;
  amount?: string;
  negativeIs?: 'credit' | 'debit';
  debit?: string;
  credit?: string;
  indicator?: string;
  card?: string;
  merchant?: string;
  currency?: string;
}

export interface CardRow {
  /** The row's number in the file (the heading row counts), so finance can find it. */
  rowNo: number;
  txnOn: string;
  description: string;
  merchant: string | null;
  amount: string;
  direction: 'debit' | 'credit';
  currency: string;
  last4: string | null;
}
export interface RowProblem {
  rowNo: number;
  problems: string[];
}
export interface Parsed {
  rows: CardRow[];
  problems: RowProblem[];
  /** Cells that held a full card number (cut to the last 4 digits). */
  fullNumbers: number;
}

/** A file read as a table of text cells. Excel dates become YYYY-MM-DD. */
export async function readTable(name: string, data: Buffer): Promise<string[][]> {
  if (/\.csv$/i.test(name)) {
    const text = data.toString('utf8').replace(/^﻿/, '');
    if (text.includes('\u0000')) throw new Error('This CSV file has unreadable characters. Save it again as CSV (UTF-8).');
    try {
      return parse(text, { skip_empty_lines: false, relax_column_count: true, trim: true, to: MAX_ROWS + 40, max_record_size: 8192 }) as string[][];
    } catch {
      throw new Error('This CSV file could not be read. Check that it is a plain CSV export from the bank.');
    }
  }
  if (/\.xlsx$/i.test(name)) {
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(data as unknown as ArrayBuffer);
    } catch {
      throw new Error('This Excel file could not be read. Save it again as .xlsx.');
    }
    const sheet = book.worksheets[0];
    if (!sheet) throw new Error('This Excel file has no sheet.');
    const out: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > MAX_ROWS + 40) return;
      const cells: string[] = [];
      for (let i = 1; i <= Math.min(row.cellCount, 60); i++) cells.push(cellText(row.getCell(i).value));
      out[n - 1] = cells;
    });
    return Array.from(out, (r) => r ?? []);
  }
  throw new Error('Upload the statement as a CSV or Excel (.xlsx) file.');
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text).trim();
  }
  return '';
}

const filled = (r: string[]) => r.filter((c) => c.trim() !== '').length;

/** The heading row: the first row naming every mapped column, else (no mapping yet) the first with 3 or more cells. */
export function headerIndex(table: string[][], m?: CardMapping): number {
  const want = m ? mappedColumns(m) : [];
  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const r = table[i].map(norm);
    if (want.length ? want.every((w) => r.includes(norm(w))) : filled(table[i]) >= 3) return i;
  }
  return -1;
}
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const mappedColumns = (m: CardMapping) =>
  [m.date, m.description, m.amount, m.debit, m.credit, m.indicator, m.card, m.merchant, m.currency].filter((x): x is string => Boolean(x));

/** What is wrong with a mapping (plain words), or null. */
export function mappingProblem(m: CardMapping): string | null {
  if (!m.date) return 'Choose the column with the transaction date.';
  if (!DATE_FORMATS.includes(m.dateFormat)) return 'Choose how dates are written.';
  if (!m.description) return 'Choose the column with the description.';
  if (m.amountMode === 'signed' && !m.amount) return 'Choose the amount column.';
  if (m.amountMode === 'split' && (!m.debit || !m.credit)) return 'Choose both the debit and the credit columns.';
  if (m.amountMode === 'indicator' && (!m.amount || !m.indicator)) return 'Choose the amount column and the debit/credit column.';
  if (!['signed', 'split', 'indicator'].includes(m.amountMode)) return 'Choose how debits and credits are shown.';
  const cols = mappedColumns(m).map(norm);
  if (new Set(cols).size !== cols.length) return 'Each column can be chosen once.';
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A date written in the bank's format (or plain YYYY-MM-DD, as Excel dates arrive) as YYYY-MM-DD; null if not a real date. */
export function parseDate(raw: string, f: DateFormat): string | null {
  const s = raw.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if (f === 'DD-MMM-YYYY' && (m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2}|\d{4})$/.exec(s))) {
    [d, mo, y] = [Number(m[1]), MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[3])];
  } else if ((f === 'DD/MM/YYYY' || f === 'MM/DD/YYYY') && (m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    [d, mo, y] = f === 'DD/MM/YYYY' ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[2]), Number(m[1]), Number(m[3])];
  } else return null;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** An amount cell: commas, ₹ and spaces allowed; (x) or -x is negative; a trailing Cr / Dr says which side. */
export function parseAmount(raw: string): { value: Prisma.Decimal; side: 'credit' | 'debit' | null } | 'bad' | 'empty' {
  let s = raw.replace(/[₹,\s]|INR|Rs\.?/gi, '');
  if (!s) return 'empty';
  let side: 'credit' | 'debit' | null = null;
  const tail = /(cr|dr)$/i.exec(s);
  if (tail) {
    side = tail[1].toLowerCase() === 'cr' ? 'credit' : 'debit';
    s = s.slice(0, -2);
  }
  let neg = false;
  if (/^\(.*\)$/.test(s)) [neg, s] = [true, s.slice(1, -1)];
  if (s.startsWith('-')) [neg, s] = [!neg, s.slice(1)];
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'bad';
  const v = new Prisma.Decimal(s);
  return { value: neg ? v.neg() : v, side };
}

const CREDIT_WORDS = ['cr', 'c', 'credit', 'refund'];
const DEBIT_WORDS = ['dr', 'd', 'debit'];
/** A full card number (12 to 19 digits, spaces or dashes between) anywhere in a text. */
const FULL_NUMBER = /\d(?:[ -]?\d){11,18}/g;

/** The last 4 digits of a card cell; `full` when the cell held more than a masked number. */
export function cardLast4(raw: string): { last4: string; full: boolean } | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return { last4: digits.slice(-4), full: digits.length >= 12 };
}

/** Text with any full card number cut to its last 4 digits. */
export function scrub(text: string): { text: string; cut: number } {
  let cut = 0;
  const out = text.replace(FULL_NUMBER, (n) => (cut++, `XXXX${n.replace(/\D/g, '').slice(-4)}`));
  return { text: out, cut };
}

/** Every data row checked against the mapping; any problem means nothing is imported. */
export function parseRows(table: string[][], m: CardMapping): Parsed {
  const head = headerIndex(table, m);
  if (head < 0) return { rows: [], problems: [{ rowNo: 0, problems: [`The file has no heading row with the columns ${mappedColumns(m).join(', ')}. Check the column names or the file.`] }], fullNumbers: 0 };
  const h = table[head].map(norm);
  const col = (name?: string) => (name ? h.indexOf(norm(name)) : -1);
  const at = (r: string[], name?: string) => {
    const i = col(name);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const rows: CardRow[] = [];
  const problems: RowProblem[] = [];
  let fullNumbers = 0;
  const data = table.slice(head + 1);
  if (data.filter(filled).length > MAX_ROWS) return { rows: [], problems: [{ rowNo: 0, problems: [`A statement can have up to ${MAX_ROWS} rows. Split the file.`] }], fullNumbers: 0 };
  data.forEach((r, i) => {
    if (!filled(r)) return;
    const rowNo = head + i + 2;
    const p: string[] = [];
    const dateRaw = at(r, m.date);
    const txnOn = dateRaw ? parseDate(dateRaw, m.dateFormat) : null;
    if (!dateRaw) p.push('No date.');
    else if (!txnOn) p.push(`"${dateRaw.slice(0, 20)}" is not a date written as ${m.dateFormat}.`);
    const d = scrub(at(r, m.description));
    const mer = m.merchant ? scrub(at(r, m.merchant)) : null;
    fullNumbers += d.cut + (mer?.cut ?? 0);
    if (!d.text) p.push('No description.');
    let amount: Prisma.Decimal | null = null;
    let direction: 'debit' | 'credit' = 'debit';
    if (m.amountMode === 'split') {
      const dr = parseAmount(at(r, m.debit));
      const cr = parseAmount(at(r, m.credit));
      const has = (x: typeof dr) => typeof x === 'object' && !x.value.isZero();
      if (dr === 'bad' || cr === 'bad') p.push('The debit or credit is not an amount.');
      else if (has(dr) && has(cr)) p.push('Both debit and credit have an amount; a row has one.');
      else if (!has(dr) && !has(cr)) p.push('No amount.');
      else [amount, direction] = has(dr) ? [(dr as { value: Prisma.Decimal }).value, 'debit'] : [(cr as { value: Prisma.Decimal }).value, 'credit'];
      if (amount?.isNegative()) p.push('Debit and credit amounts are written without a minus sign.');
    } else {
      const a = parseAmount(at(r, m.amount));
      if (a === 'empty') p.push('No amount.');
      else if (a === 'bad') p.push(`"${at(r, m.amount).slice(0, 20)}" is not an amount (up to 2 decimals).`);
      else if (a.value.isZero()) p.push('The amount is zero.');
      else {
        amount = a.value.abs();
        if (m.amountMode === 'indicator') {
          const w = at(r, m.indicator).toLowerCase().replace(/\./g, '');
          if (CREDIT_WORDS.includes(w)) direction = 'credit';
          else if (DEBIT_WORDS.includes(w)) direction = 'debit';
          else p.push(`"${at(r, m.indicator).slice(0, 12)}" in the debit/credit column is not Dr or Cr.`);
        } else {
          const neg = m.negativeIs ?? 'credit';
          direction = a.side ?? (a.value.isNegative() ? neg : neg === 'credit' ? 'debit' : 'credit');
        }
      }
    }
    let last4: string | null = null;
    if (m.card) {
      const raw = at(r, m.card);
      const c = raw ? cardLast4(raw) : null;
      if (!c) p.push(raw ? 'The card number has fewer than 4 digits.' : 'No card number.');
      else {
        last4 = c.last4;
        if (c.full) fullNumbers++;
      }
    }
    let currency = 'INR';
    if (m.currency) {
      const cur = at(r, m.currency).toUpperCase();
      if (cur && !/^[A-Z]{3}$/.test(cur)) p.push(`"${cur.slice(0, 8)}" is not a currency code like INR or USD.`);
      else if (cur) currency = cur;
    }
    if (p.length) problems.push({ rowNo, problems: p });
    else rows.push({ rowNo, txnOn: txnOn!, description: d.text.slice(0, 200), merchant: mer?.text ? mer.text.slice(0, 120) : null, amount: amount!.toFixed(2), direction, currency, last4 });
  });
  if (!rows.length && !problems.length) problems.push({ rowNo: 0, problems: ['The file has a heading row but no transactions.'] });
  return { rows, problems, fullNumbers };
}

// ------------------------------------------------------------------------------------------ matching

export interface MatchCard {
  id: string;
  txnOn: string;
  amount: string;
  currency: string;
  direction: 'debit' | 'credit';
  merchant: string | null;
  /** The employees whose card on file has this line's last 4 digits. */
  holders: string[];
}
export interface MatchCandidate {
  id: string;
  employeeId: string;
  spentOn: string;
  amount: string;
  currency: string;
  merchant: string | null;
}

const dayNo = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * Suggested matches, one claim line per card line at most: same holder and currency, the amount within `within`, the
 * date within `days`. Closest amount first, then the nearest date, then a like merchant; a credit is never matched.
 */
export function suggestMatches(cards: MatchCard[], candidates: MatchCandidate[], o: { within: string; days: number }): Map<string, string> {
  const within = new Prisma.Decimal(o.within);
  const pairs: { card: string; cand: string; diff: Prisma.Decimal; days: number; alike: number; tie: string }[] = [];
  for (const c of cards) {
    if (c.direction !== 'debit') continue;
    for (const x of candidates) {
      if (!c.holders.includes(x.employeeId) || x.currency !== c.currency) continue;
      const diff = new Prisma.Decimal(c.amount).sub(x.amount).abs();
      const days = Math.abs(dayNo(c.txnOn) - dayNo(x.spentOn));
      if (diff.gt(within) || days > o.days) continue;
      pairs.push({ card: c.id, cand: x.id, diff, days, alike: merchantsAlike(c.merchant, x.merchant) ? 0 : 1, tie: `${c.txnOn}|${c.id}|${x.spentOn}|${x.id}` });
    }
  }
  pairs.sort((a, b) => a.diff.cmp(b.diff) || a.days - b.days || a.alike - b.alike || (a.tie < b.tie ? -1 : 1));
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.card) || used.has(p.cand)) continue;
    out.set(p.card, p.cand);
    used.add(p.cand);
  }
  return out;
}
