import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';

/**
 * Answer 492: a GST tax invoice (or credit note) as PDF. Which fields print, in which order and with which label is data:
 * the rule set GST.INVOICE_R46 (CGST Rules r.46 for invoices, r.53 for credit notes; marked verify). The values
 * come from the issued invoice; a field the rule set names but the invoice lacks prints "Not given", never invented.
 */
export interface InvoicePdfField {
  key: string;
  label: string;
  /** Print only on a tax invoice, or only on a credit note. */
  only?: 'invoice' | 'credit_note';
}
export interface InvoicePdfData {
  title: string;
  kind: 'invoice' | 'credit_note';
  fields: InvoicePdfField[];
  values: Record<string, string | null | undefined>;
  lines: { description: string; sac: string; qty: string; rate: string; amount: string }[];
  totals: { label: string; value: string }[];
  /** Credit notes issued against the invoice (r.53 link back). */
  notes?: string[];
  footer: string;
}

export function buildInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(d.title, { align: 'left' });
    doc.moveDown(0.6).fontSize(9);
    for (const f of d.fields) {
      if (f.only && f.only !== d.kind) continue;
      if (f.key === 'lines' || f.key === 'totals') continue;
      writeText(doc.font('Helvetica-Bold'), `${f.label}: `, { continued: true });
      writeText(doc.font('Helvetica'), d.values[f.key] || 'Not given');
    }
    doc.moveDown(0.8);
    const cols = [48, 300, 360, 420, 490];
    const row = (cells: string[], bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      writeText(doc, cells[0]!, cols[0], y, { width: 245 });
      const h = doc.y;
      cells.slice(1).forEach((c, i) => writeText(doc, c, cols[i + 1], y, { width: 65, align: 'right' }));
      doc.x = 48;
      doc.y = Math.max(h, doc.y) + 2;
    };
    row(['Description', 'SAC', 'Quantity', 'Rate (₹)', 'Amount (₹)'], true);
    for (const l of d.lines) row([l.description, l.sac, l.qty, l.rate, l.amount]);
    doc.moveDown(0.4);
    for (const t of d.totals) row([t.label, '', '', '', t.value], t.label.startsWith('Total'));
    if (d.notes?.length) {
      doc.moveDown(0.8).font('Helvetica-Bold').text('Credit notes against this invoice');
      doc.font('Helvetica');
      for (const n of d.notes) writeText(doc, n);
    }
    doc.moveDown(1.2).fontSize(8).font('Helvetica');
    writeText(doc, d.footer);
    doc.end();
  });
}
