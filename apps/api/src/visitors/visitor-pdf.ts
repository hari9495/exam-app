import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { writeText } from '../documents/pdf-text';

// Visitors slice 4: the badge (answer 607) and the emergency roll-call (612) as PDFs the browser prints. No printer
// integration. PDFKit with writeText, so names in Indian scripts print in Noto fonts; the QR carries the pass code.

const MM = 72 / 25.4;
/** A common label roll (62 mm wide), printed landscape: 100 x 62 mm. */
export const BADGE_SIZE: [number, number] = [100 * MM, 62 * MM];

export interface BadgeData {
  company: string;
  location: string;
  name: string;
  visitorCompany: string | null;
  host: string;
  validUntil: string;
  badge: string;
  passCode: string;
  minorAdult: string | null;
  /** Answer 713: the visitor's photo (JPEG or PNG) on a photo badge; never for a visitor under 18 (614). */
  photo?: Buffer | null;
}

function done(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** One label: who, from where, whom they visit, until when; the QR with the pass code on the right. */
export async function badgePdf(b: BadgeData): Promise<Buffer> {
  const [w, h] = BADGE_SIZE;
  const doc = new PDFDocument({ size: [w, h], margin: 0, info: { Title: `Visitor badge ${b.badge}` } });
  const done$ = done(doc);
  const pad = 4 * MM;
  const qr = await QRCode.toBuffer(b.passCode, { errorCorrectionLevel: 'M', margin: 0, width: 240 });
  const q = 30 * MM;
  doc.image(qr, w - pad - q, pad + 4 * MM, { width: q, height: q });
  // A photo badge: the photo on the left, the text moves right.
  const ph = b.photo && !b.minorAdult ? 20 * MM : 0;
  if (ph) doc.image(b.photo!, pad, pad + 9 * MM, { fit: [ph, ph * 1.25], align: 'center' });
  const tx = pad + (ph ? ph + 2 * MM : 0);
  const tw = w - 3 * pad - q - (ph ? ph + 2 * MM : 0);
  doc.font('Helvetica').fontSize(7).fillColor('#444');
  writeText(doc, `${b.company} · ${b.location}`, pad, pad, { width: w - 3 * pad - q, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('VISITOR', pad, pad + 4 * MM);
  doc.font('Helvetica-Bold').fontSize(14);
  writeText(doc, b.name, tx, pad + 9 * MM, { width: tw, height: 12 * MM, ellipsis: true });
  doc.font('Helvetica').fontSize(8).fillColor('#222');
  const lines = [b.visitorCompany || 'Individual', `Host: ${b.host}`, `Valid until ${b.validUntil}`, ...(b.minorAdult ? [`Under 18 · with ${b.minorAdult}`] : [])];
  let y = pad + 23 * MM;
  for (const l of lines) {
    writeText(doc, l, tx, y, { width: tw, lineBreak: false, ellipsis: true });
    y += 4 * MM;
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(b.badge, w - pad - q, pad + 5 * MM + q, { width: q, align: 'center' });
  doc.font('Helvetica').fontSize(6).fillColor('#444').text(b.passCode, w - pad - q, pad + 9.5 * MM + q, { width: q, align: 'center' });
  doc.end();
  return done$;
}

export interface RollCallData {
  company: string;
  location: string;
  at: string;
  visitors: { name: string; company: string | null; host: string; badge: string | null; inAt: string; minorAdult: string | null }[];
  employees: { name: string; code: string | null; inAt: string }[];
}

/** A4: everyone on site now, visitors then employees, with an empty box to tick at the assembly point. */
export async function rollCallPdf(r: RollCallData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Roll-call ${r.location}` } });
  const done$ = done(doc);
  const left = 40;
  const width = 515;
  doc.font('Helvetica-Bold').fontSize(16);
  writeText(doc, `Roll-call · ${r.location}`, left, 40);
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  writeText(doc, `${r.company} · on site at ${r.at} · ${r.visitors.length} visitors, ${r.employees.length} employees`);
  doc.fillColor('#000');
  const table = (title: string, head: string[], cols: number[], rows: string[][]) => {
    doc.moveDown(1.2).font('Helvetica-Bold').fontSize(11).text(title, left);
    doc.moveDown(0.3);
    const line = (cells: string[], bold: boolean) => {
      if (doc.y > 780) doc.addPage();
      const y = doc.y;
      let x = left + 18;
      if (!bold) doc.rect(left, y, 9, 9).stroke();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      cells.forEach((cell, i) => {
        writeText(doc, cell, x, y, { width: cols[i]! - 6, lineBreak: false, ellipsis: true });
        x += cols[i]!;
      });
      doc.y = y + 15;
      doc.x = left;
    };
    line(head, true);
    if (!rows.length) doc.font('Helvetica').fontSize(9).fillColor('#444').text('Nobody.', left + 18).fillColor('#000');
    for (const row of rows) line(row, false);
  };
  table(`Visitors (${r.visitors.length})`, ['Name', 'Company', 'Host', 'Badge', 'In'], [150, 120, 120, 55, 52], r.visitors.map((v) => [v.minorAdult ? `${v.name} (under 18, with ${v.minorAdult})` : v.name, v.company || '—', v.host, v.badge ?? '—', v.inAt]));
  table(`Employees (${r.employees.length})`, ['Name', 'Employee code', 'In'], [260, 150, 87], r.employees.map((e) => [e.name, e.code ?? '—', e.inAt]));
  doc.moveDown(1.5).font('Helvetica').fontSize(8).fillColor('#444').text('Tick each person at the assembly point. Employees are those whose last check-in today was at this location; people who did not check in are not listed.', left, doc.y, { width });
  doc.end();
  return done$;
}
