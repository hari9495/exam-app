import ExcelJS from 'exceljs';

// Statutory file writers (M03-BUILD-DESIGN §11.4, §11.5, PAY-6.02 … 6.05): pure functions from the values stored on the
// approved payslips. Identifiers are text (leading zeros kept); names keep letters, digits, space and . only, so a value
// can never become a spreadsheet formula. Format versions are recorded on each filing; every format is "verify" until a
// file generated here has been accepted by the portal once (go-live checklist).

export const FORMATS = {
  ecr: 'EPFO-ECR-2.0',
  esi: 'ESIC-MC-XLSX-1',
  pt: 'PT-STATE-CSV-1',
  lwf: 'LWF-STATE-CSV-1',
  tds: 'TDS-ANNEXURE-CSV-1',
} as const;

const clean = (s: string, max = 85) =>
  s
    .replace(/[^A-Za-z0-9 .]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const rupees = (x: string) => String(Math.round(Number(x)));
const csv = (cells: (string | number)[]) => cells.map((c) => (typeof c === 'number' ? String(c) : `"${String(c).replace(/"/g, '""')}"`)).join(',');

export interface EcrRow {
  uan: string;
  name: string;
  gross: string;
  epfWages: string;
  epsWages: string;
  edliWages: string;
  epfEmployee: string;
  eps: string;
  epfDiff: string;
  ncpDays: number;
  refund: string;
}
/** EPFO ECR 2.0: one member per line, eleven fields joined by #~#, whole rupees, UAN and names in capitals. */
export function ecrFile(rows: EcrRow[]): Buffer {
  for (const r of rows) if (!/^\d{12}$/.test(r.uan)) throw new Error(`A UAN is 12 digits (${r.uan.slice(-4)}).`);
  const lines = rows.map((r) =>
    [
      r.uan,
      clean(r.name).toUpperCase(),
      rupees(r.gross),
      rupees(r.epfWages),
      rupees(r.epsWages),
      rupees(r.edliWages),
      rupees(r.epfEmployee),
      rupees(r.eps),
      rupees(r.epfDiff),
      String(Math.max(0, Math.round(r.ncpDays))),
      rupees(r.refund),
    ].join('#~#'),
  );
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

export interface EsiRow {
  ipNumber: string;
  name: string;
  days: number;
  wages: string;
  reasonCode: string;
  lastWorkingDay: string;
}
/** ESIC monthly contribution upload (portal Excel): IP number as text, days, wages, the reason code for zero days. */
export async function esiFile(rows: EsiRow[]): Promise<Buffer> {
  for (const r of rows) if (!/^\d{10}$/.test(r.ipNumber)) throw new Error(`An ESI IP number is 10 digits (${r.ipNumber.slice(-4)}).`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = [
    { header: 'IP Number (10 Digits)', width: 22, style: { numFmt: '@' } },
    { header: 'IP Name ( Only alphabets and space )', width: 34, style: { numFmt: '@' } },
    { header: 'No of Days for which wages paid/payable during the month', width: 18 },
    { header: 'Total Monthly Wages', width: 16 },
    { header: 'Reason Code for Zero workings days(numeric only; provide 0 for all other reasons- Click on the link for reference)', width: 18 },
    { header: 'Last Working Day( Format DD/MM/YYYY  or DD-MM-YYYY)', width: 20, style: { numFmt: '@' } },
  ];
  for (const r of rows) ws.addRow([r.ipNumber, clean(r.name).replace(/\./g, ' '), r.days, Number(rupees(r.wages)), Number(r.reasonCode || '0'), r.lastWorkingDay]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface PtRow {
  code: string;
  name: string;
  ptWage: string;
  pt: string;
}
/** A state's professional-tax return data: the employees, then a summary by the tax deducted (verify per state). */
export function ptFile(state: string, month: string, rows: PtRow[]): Buffer {
  const bySlab = new Map<string, number>();
  for (const r of rows) bySlab.set(r.pt, (bySlab.get(r.pt) ?? 0) + 1);
  const lines = [csv(['State', 'Month', 'Employee code', 'Name', 'PT wage', 'Professional tax'])];
  for (const r of rows) lines.push(csv([state, month, clean(r.code, 30), clean(r.name), r.ptWage, r.pt]));
  lines.push('', csv(['Summary', 'Tax per person', 'Employees', 'Total']));
  for (const [pt, n] of [...bySlab.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) lines.push(csv(['', pt, n, (Number(pt) * n).toFixed(2)]));
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

export interface LwfRow {
  code: string;
  name: string;
  employee: string;
  employer: string;
}
export function lwfFile(state: string, month: string, rows: LwfRow[]): Buffer {
  const lines = [csv(['State', 'Month', 'Employee code', 'Name', 'Employee share', 'Employer share'])];
  for (const r of rows) lines.push(csv([state, month, clean(r.code, 30), clean(r.name), r.employee, r.employer]));
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

export interface TdsRow {
  employeeCode: string;
  name: string;
  pan: string | null;
  month: string;
  paid: string;
  tds: string;
  noPan: boolean;
}
/** The quarterly TDS return's deductee annexure (one row per person and month), the data the return utility takes. */
export function tdsAnnexure(rows: TdsRow[]): Buffer {
  const lines = [csv(['Employee code', 'Name', 'PAN', 'Month', 'Amount paid', 'Tax deducted', 'No PAN (higher rate)'])];
  for (const r of rows) lines.push(csv([clean(r.employeeCode, 30), clean(r.name), r.pan ?? 'PANNOTAVBL', r.month, r.paid, r.tds, r.noPan ? 'Y' : 'N']));
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}
