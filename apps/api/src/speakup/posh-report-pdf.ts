import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';

// Answer 2621: the Internal Committee's annual report as a PDF, with the five things the POSH Act asks for (Section 21
// and Rule 14 of the 2013 Rules): complaints received, disposed of, pending over 90 days, awareness workshops, and the
// action taken; plus the committee and the POSH awareness course completions (answer 2624). PDFKit with writeText, as
// the other printable PDFs (Indian scripts print in Noto fonts). Counts only: no names of complainants or respondents.

export interface PoshReportData {
  company: string;
  committee: string;
  year: number;
  received: number;
  disposed: number;
  pendingOver90: number;
  sessions: number;
  trainings: number;
  actionTaken: string | null;
  stage: 'draft' | 'reviewed' | 'employer' | 'district';
  members: { name: string; role: 'presiding' | 'member' | 'external'; woman: boolean }[];
  preparedOn: string;
}

const ROLE: Record<PoshReportData['members'][number]['role'], string> = { presiding: 'Presiding officer', member: 'Member', external: 'External member' };
const STAGE: Record<PoshReportData['stage'], string> = { draft: 'Draft: not yet reviewed by the presiding officer', reviewed: 'Reviewed by the presiding officer', employer: 'Sent to the employer', district: 'Sent to the District Officer' };

function done(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function poshAnnualReportPdf(r: PoshReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Internal Committee annual report ${r.year}` } });
  const out = done(doc);
  const left = 50;
  const width = 495;
  doc.font('Helvetica-Bold').fontSize(15);
  writeText(doc, 'Annual report of the Internal Committee', left, 50, { width });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  writeText(doc, 'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013, Section 21 and Rule 14', { width });
  doc.fillColor('#000').moveDown(1).fontSize(10);
  const fact = (label: string, value: string) => {
    const y = doc.y;
    doc.font('Helvetica-Bold');
    writeText(doc, label, left, y, { width: 190 });
    const h = doc.y;
    doc.font('Helvetica');
    writeText(doc, value, left + 200, y, { width: width - 200 });
    doc.y = Math.max(h, doc.y) + 4;
    doc.x = left;
  };
  fact('Employer', r.company);
  fact('Workplace (committee)', r.committee);
  fact('Calendar year', `1 January to 31 December ${r.year}`);
  fact('Status', STAGE[r.stage]);
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Details for the year', left);
  doc.moveDown(0.4).fontSize(10);
  const rows: [string, string][] = [
    ['(a) Complaints of sexual harassment received in the year', String(r.received)],
    ['(b) Complaints disposed of during the year', String(r.disposed)],
    ['(c) Cases pending for more than ninety days', String(r.pendingOver90)],
    ['(d) Workshops or awareness programmes against sexual harassment carried out', String(r.sessions)],
    ['    POSH awareness course completions in the year', String(r.trainings)],
    ['(e) Nature of action taken by the employer or District Officer', r.actionTaken?.trim() || 'Not written yet'],
  ];
  for (const [k, v] of rows) {
    if (doc.y > 760) doc.addPage();
    const y = doc.y;
    doc.font('Helvetica');
    writeText(doc, k, left, y, { width: 330 });
    const h = doc.y;
    doc.font('Helvetica-Bold');
    writeText(doc, v, left + 340, y, { width: width - 340 });
    doc.y = Math.max(h, doc.y) + 6;
    doc.moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3).strokeColor('#ddd').stroke().strokeColor('#000');
    doc.x = left;
  }
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).text('Members of the committee', left);
  doc.moveDown(0.4).font('Helvetica').fontSize(10);
  if (!r.members.length) doc.text('No members on record.', left);
  for (const m of r.members) writeText(doc, `${m.name} · ${ROLE[m.role]}${m.woman ? ' · woman' : ''}`, left, undefined, { width });
  doc.moveDown(2);
  writeText(doc, `Prepared on ${r.preparedOn} from the records in YukthiX. Counts only: no names of the people in the complaints.`, left, undefined, { width });
  doc.moveDown(3);
  doc.text('Signature of the presiding officer: ______________________________', left);
  doc.moveDown(1.2).text('Date: ________________          Place: ______________________', left);
  doc.end();
  return out;
}
