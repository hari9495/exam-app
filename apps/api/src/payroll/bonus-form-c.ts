import PDFDocument from 'pdfkit';

// PAY-24 Form C as a PDF (founder 30 Oct 2026, last 10, item 2), drawn like the statutory registers (pdfkit, A4
// landscape): the legal entity's letterhead, the register columns, a totals row, and the employer's signature and date.

export const FORM_C_HEADER = [
  'Sl. No.',
  'Employee code',
  'Name of the employee',
  "Father's name",
  'Completed 15 years of age at the beginning of the accounting year',
  'Designation',
  'Number of days worked in the year',
  'Total salary or wage for the year (section 12)',
  'Bonus payable under section 10 or 11',
  'Puja or other customary bonus paid during the year',
  'Interim bonus or bonus paid in advance',
  'Income tax deducted',
  'Deduction for financial loss caused by misconduct',
  'Total deducted',
  'Net amount payable',
  'Amount actually paid',
  'Date paid',
  'Signature or thumb impression of the employee',
];
/** The money columns (by position) that get a total. */
export const FORM_C_TOTALLED = [7, 8, 9, 10, 11, 12, 13, 14, 15];

export interface FormCPdf {
  entityName: string;
  /** The registered address as lines (empty: not recorded). */
  address: string[];
  /** e.g. "Bonus paid to employees for the accounting year 1 Apr 2025 to 31 Mar 2026 at 8.33%". */
  title: string;
  rows: (string | number)[][];
}

/** Sums the money columns of the rows (paise-exact: amounts arrive with at most 2 decimals). */
export function formCTotals(rows: (string | number)[][]): string[] {
  return FORM_C_HEADER.map((_, i) => {
    if (i === 2) return 'Total';
    if (!FORM_C_TOTALLED.includes(i)) return '';
    const paise = rows.reduce((t, r) => (r[i] === '' || r[i] == null ? t : t + Math.round(Number(r[i]) * 100)), 0);
    return (paise / 100).toFixed(2);
  });
}

export function renderFormC(d: FormCPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: `Form C ${d.entityName}` } });
    const out: Buffer[] = [];
    doc
      .on('data', (b: Buffer) => out.push(b))
      .on('end', () => resolve(Buffer.concat(out)))
      .on('error', reject);
    const left = 36;
    const full = doc.page.width - 72;
    // Letterhead.
    doc.font('Helvetica-Bold').fontSize(14).text(d.entityName, left, 36, { width: full });
    doc.font('Helvetica').fontSize(8).fillColor('#444').text(d.address.length ? d.address.join(', ') : 'Registered address not recorded', { width: full }).fillColor('#000');
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).text('Form C, Payment of Bonus Rules, 1975, Rule 4', { width: full, align: 'center' });
    doc.font('Helvetica').fontSize(9).text(d.title, { width: full, align: 'center' }).moveDown(0.6);
    // The register: each row as tall as its tallest cell; the header repeats on a new page.
    const width = full / FORM_C_HEADER.length;
    const line = (cells: (string | number)[], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6);
      const texts = cells.map((c) => (c === null || c === undefined ? '' : String(c)));
      const h = Math.max(...texts.map((t) => doc.heightOfString(t || ' ', { width: width - 4 }))) + 4;
      if (doc.y + h > doc.page.height - 110) {
        doc.addPage();
        if (!bold) line(FORM_C_HEADER, true);
      }
      const y = doc.y;
      texts.forEach((t, i) => doc.text(t, left + i * width + 2, y + 2, { width: width - 4, lineBreak: true }));
      doc.moveTo(left, y + h).lineTo(left + full, y + h).lineWidth(0.3).strokeColor('#999').stroke();
      doc.x = left;
      doc.y = y + h;
    };
    line(FORM_C_HEADER, true);
    for (const r of d.rows) line(r);
    if (!d.rows.length) doc.font('Helvetica').fontSize(8).text('No eligible employees in this year.', left, doc.y + 4);
    line(formCTotals(d.rows), true);
    // The employer signs and dates the register.
    if (doc.y > doc.page.height - 110) doc.addPage();
    const y = doc.y + 36;
    doc.font('Helvetica').fontSize(9);
    doc.moveTo(left, y).lineTo(left + 220, y).lineWidth(0.5).strokeColor('#000').stroke();
    doc.text(`Signature of the employer or authorised person, for ${d.entityName}`, left, y + 4, { width: 300 });
    doc.moveTo(left + full - 160, y).lineTo(left + full, y).stroke();
    doc.text('Date', left + full - 160, y + 4, { width: 160 });
    doc.end();
  });
}
