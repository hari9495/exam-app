import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';

// Bank file formats as data (M03-BUILD-DESIGN §11.2, PAY-4.01, YX-PAY-13). A format is a platform rule set of kind
// `bank_format` (statute IN.BANKFMT, jurisdiction = the format key), drafted and published by two YukthiX staff like
// every P07 rule set. The layout names its columns, their order and widths, the file type, the date and amount style.
// Account numbers and IFSC codes are always text: leading zeros are kept in TXT, CSV and XLSX (cells typed as text).

export const BANK_FIELDS = ['txnType', 'debitAccount', 'account', 'ifsc', 'name', 'amount', 'date', 'narration', 'code'] as const;
export type BankField = (typeof BANK_FIELDS)[number];
const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYYMMDD', 'DDMMYYYY'] as const;

export interface BankColumn {
  title: string;
  field: BankField;
  /** Fixed-width files: the column's width; text is padded with spaces (amounts on the left with zeros). */
  width?: number;
}
export interface BankLayout {
  kind: 'bank_format';
  label: string;
  fileType: 'xlsx' | 'csv' | 'txt';
  /** CSV, or a delimited TXT; a TXT without a delimiter is fixed width. */
  delimiter?: string;
  header: boolean;
  dateFormat: (typeof DATE_FORMATS)[number];
  /** "decimal" = 1234.50; "paise" = 123450. */
  amountFormat: 'decimal' | 'paise';
  /** Amounts from this figure go by RTGS, below it by NEFT. */
  rtgsFrom: string;
  nameMax: number;
  upper: boolean;
  columns: BankColumn[];
}
export interface BankRow {
  account: string;
  ifsc: string;
  name: string;
  amount: string;
  code: string;
  narration: string;
}
export interface BankContext {
  debitAccount: string;
  /** ISO date the bank pays on. */
  date: string;
}

const ACCOUNT = /^\d{6,20}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const MONEY = /^\d{1,12}\.\d{2}$/;
/** Names and narrations: letters, digits, space and . only (bank portals refuse the rest; this also stops spreadsheet formulas). */
const clean = (s: string, max: number, upper: boolean) => {
  const t = s
    .replace(/[^A-Za-z0-9 .]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return upper ? t.toUpperCase() : t;
};

function dateText(iso: string, f: BankLayout['dateFormat']) {
  const [y, m, d] = iso.split('-');
  return f === 'DD/MM/YYYY' ? `${d}/${m}/${y}` : f === 'DD-MM-YYYY' ? `${d}-${m}-${y}` : f === 'YYYYMMDD' ? `${y}${m}${d}` : `${d}${m}${y}`;
}

/** One row's cells in the layout's order (pure; the bank file writer and the rule set's golden cases both use it). */
export function bankCells(l: BankLayout, r: BankRow, c: BankContext): string[] {
  if (!ACCOUNT.test(r.account) || !ACCOUNT.test(c.debitAccount)) throw new Error('A bank account number is 6 to 20 digits.');
  if (!IFSC.test(r.ifsc)) throw new Error(`${r.ifsc} is not an IFSC code.`);
  if (!MONEY.test(r.amount) || new Prisma.Decimal(r.amount).lte(0)) throw new Error('A bank file pays positive amounts in rupees and paise.');
  const value: Record<BankField, string> = {
    txnType: new Prisma.Decimal(r.amount).gte(new Prisma.Decimal(l.rtgsFrom)) ? 'RTGS' : 'NEFT',
    debitAccount: c.debitAccount,
    account: r.account,
    ifsc: r.ifsc,
    name: clean(r.name, l.nameMax, l.upper),
    amount: l.amountFormat === 'paise' ? r.amount.replace('.', '').replace(/^0+(?=\d)/, '') : r.amount,
    date: dateText(c.date, l.dateFormat),
    narration: clean(r.narration, 30, l.upper),
    code: clean(r.code, 20, false),
  };
  return l.columns.map((col) => {
    const v = value[col.field];
    if (!col.width || l.fileType !== 'txt' || l.delimiter) return v;
    // Identifiers never get cut: a value wider than its column refuses the file instead.
    if (v.length > col.width && ['account', 'debitAccount', 'ifsc', 'amount'].includes(col.field)) throw new Error(`${col.title} does not fit its ${col.width} characters.`);
    return col.field === 'amount' ? v.padStart(col.width, '0') : v.slice(0, col.width).padEnd(col.width, ' ');
  });
}

/** Shape checks before a format is published (§8.1). */
export function bankLayoutProblems(v: Record<string, unknown>): string[] {
  const l = v as unknown as BankLayout;
  const p: string[] = [];
  if (!['xlsx', 'csv', 'txt'].includes(l.fileType)) p.push('A bank format is an xlsx, csv or txt file');
  if (!DATE_FORMATS.includes(l.dateFormat)) p.push(`The date format is one of ${DATE_FORMATS.join(', ')}`);
  if (!['decimal', 'paise'].includes(l.amountFormat)) p.push('Amounts are "decimal" or "paise"');
  if (typeof l.rtgsFrom !== 'string' || !/^\d{1,12}$/.test(l.rtgsFrom)) p.push('rtgsFrom is a whole rupee amount');
  if (!Number.isInteger(l.nameMax) || l.nameMax < 10 || l.nameMax > 140) p.push('nameMax is between 10 and 140');
  if (!Array.isArray(l.columns) || !l.columns.length) p.push('A bank format has columns');
  for (const [i, c] of (l.columns ?? []).entries()) {
    if (!BANK_FIELDS.includes(c.field)) p.push(`Column ${i + 1}: unknown field ${String(c.field)}`);
    if (typeof c.title !== 'string' || !c.title) p.push(`Column ${i + 1} has a title`);
    if (l.fileType === 'txt' && !l.delimiter && !(Number.isInteger(c.width) && (c.width as number) > 0)) p.push(`Column ${i + 1}: a fixed-width file gives every column a width`);
  }
  for (const f of ['account', 'ifsc', 'amount'] as const) if (!(l.columns ?? []).some((c) => c.field === f)) p.push(`A bank format includes the ${f} column`);
  if (l.delimiter !== undefined && (typeof l.delimiter !== 'string' || l.delimiter.length !== 1 || /[A-Za-z0-9 .]/.test(l.delimiter)))
    p.push('The delimiter is one character that cannot appear in a value');
  return p;
}

/** The golden-case calculator: one sample row as the format would write it. */
export function bankFormatSample(values: Record<string, unknown>, i: BankRow & BankContext) {
  const l = values as unknown as BankLayout;
  const cells = bankCells(l, i, i);
  return { txnType: cells[l.columns.findIndex((c) => c.field === 'txnType')] ?? null, cells: cells.join('|') };
}

/** Writes the file: XLSX with text cells for identifiers, CSV / delimited TXT, or fixed-width TXT (CRLF lines). */
export async function writeBankFile(l: BankLayout, rows: BankRow[], c: BankContext): Promise<{ data: Buffer; ext: string; contentType: string }> {
  const body = rows.map((r) => bankCells(l, r, c));
  if (l.fileType === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.created = wb.modified = new Date(`${c.date}T00:00:00Z`);
    const ws = wb.addWorksheet('Payments');
    ws.columns = l.columns.map((col) => ({ header: l.header ? col.title : undefined, width: Math.max(12, col.title.length + 2), style: { numFmt: col.field === 'amount' ? '0.00' : '@' } }));
    if (!l.header) ws.spliceRows(1, 1);
    for (const cells of body) ws.addRow(cells.map((v, i) => (l.columns[i].field === 'amount' && l.amountFormat === 'decimal' ? Number(v) : v)));
    return { data: Buffer.from(await wb.xlsx.writeBuffer()), ext: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  const sep = l.delimiter ?? (l.fileType === 'csv' ? ',' : '');
  const lines = [...(l.header ? [l.columns.map((col) => (sep ? col.title : col.title.slice(0, col.width).padEnd(col.width ?? 0, ' '))).join(sep)] : []), ...body.map((cells) => cells.join(sep))];
  return { data: Buffer.from(lines.join('\r\n') + '\r\n', 'utf8'), ext: l.fileType, contentType: l.fileType === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8' };
}
