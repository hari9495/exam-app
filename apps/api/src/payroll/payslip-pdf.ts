import { randomBytes } from 'crypto';
import PDFDocument from 'pdfkit';
import { writeLabel, type LocalLanguage } from '../documents/payslip-languages';

// The payslip PDF (M03-BUILD-DESIGN §11.1, PAY-4.04, YX-PAY-12 / 35): rendered from the stored lines through the
// entity's active layout; the Code on Wages particulars are always shown (the layout cannot hide them). The same renderer
// draws the layout preview (5b) with sample figures. A download carries a name / time watermark; an emailed copy is an
// AES-256 password-protected PDF (YX-NTF-15).

export interface SlipLine {
  code: string;
  name: string;
  kind: string;
  amount: string;
  quantity: string | null;
}
export interface SlipData {
  employerName: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  /** YYYY-MM */
  month: string;
  gross: string;
  deductions: string;
  net: string;
  lines: SlipLine[];
  bankLast4: string | null;
  resultHash: string;
}

const inr = (x: string) => Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthText = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The block values of one payslip, every amount from its stored lines (pure, so it is tested against the lines). */
export function payslipValues(d: SlipData): Record<string, string> {
  const list = (kind: string) =>
    d.lines
      .filter((l) => l.kind === kind && Number(l.amount) !== 0)
      .map((l) => `${l.name} ${inr(l.amount)}`)
      .join(' · ') || '—';
  const days = d.lines.filter((l) => l.code === 'basic' && l.quantity !== null).reduce((t, l) => t + Number(l.quantity), 0);
  return {
    employerName: d.employerName,
    employeeName: d.employeeName,
    employeeCode: d.employeeCode,
    designation: d.designation,
    period: monthText(d.month),
    paidDays: days ? String(days) : '—',
    earnings: list('earning'),
    deductions: list('deduction'),
    grossPay: inr(d.gross),
    netPay: inr(d.net),
    bankAccount: d.bankLast4 ? `•••• ${d.bankLast4}` : '—',
  };
}

export const SAMPLE_VALUES = (entityName: string): Record<string, string> => ({
  employerName: entityName,
  employeeName: 'Sample Employee',
  employeeCode: 'EMP-0001',
  designation: 'Engineer',
  period: 'Sample month',
  paidDays: '30',
  earnings: 'Basic 24,200 · HRA 12,100 · Special 22,600',
  deductions: 'PF 1,800 · PT 200',
  grossPay: '60,500',
  netPay: '58,500',
});

export function renderPayslipPdf(
  blocks: { key: string; shown: boolean }[],
  labels: Record<string, string>,
  local: LocalLanguage | null,
  values: Record<string, string>,
  opts: { title: string; preview?: boolean; watermark?: string; password?: string; keywords?: string },
): Promise<Buffer> {
  const secure = opts.password
    ? { userPassword: opts.password, ownerPassword: randomBytes(24).toString('base64url'), pdfVersion: '1.7ext3' as const, permissions: { printing: 'highResolution' as const } }
    : {};
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: opts.title, Keywords: opts.keywords ?? '' }, ...secure });
    const out: Buffer[] = [];
    doc
      .on('data', (b: Buffer) => out.push(b))
      .on('end', () => resolve(Buffer.concat(out)))
      .on('error', reject);
    if (opts.preview) doc.fontSize(9).fillColor('#a33').text('PREVIEW — sample figures, not a payslip', { align: 'right' }).fillColor('#000');
    doc
      .moveDown()
      .fontSize(14)
      .text(values.employerName ?? '')
      .fontSize(11);
    writeLabel(doc, local, 'payslip', 'Payslip', '');
    doc.moveDown();
    for (const b of blocks.filter((x) => x.shown)) {
      doc.fontSize(10);
      writeLabel(doc, local, b.key, labels[b.key] ?? b.key, values[b.key] ?? '—');
    }
    if (opts.watermark) {
      doc
        .save()
        .rotate(-35, { origin: [300, 420] })
        .fontSize(28)
        .fillColor('#999', 0.18)
        .text(opts.watermark, 60, 400, { width: 480, align: 'center' })
        .restore();
      doc.fillColor('#666', 1).fontSize(8).text(opts.watermark, 48, 780, { width: 500, align: 'center' });
    }
    doc.end();
  });
}
