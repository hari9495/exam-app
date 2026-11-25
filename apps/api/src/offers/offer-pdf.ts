import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';

export interface OfferPdfData {
  orgName: string;
  letterBody: string;
  candidateName: string;
  jobTitle: string;
  compensation: string;
  startDate: Date;
  expiresAt: Date;
}

export function buildOfferPdf(d: OfferPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    writeText(doc.fontSize(18), d.orgName, { align: 'left' });
    doc.moveDown().fontSize(14).text('Offer of Employment', { align: 'left' });
    writeText(doc.moveDown().fontSize(11), d.letterBody, { align: 'left' });
    doc.moveDown();
    writeText(doc.fontSize(11), `Position: ${d.jobTitle}`);
    writeText(doc, `Compensation: ${d.compensation}`)
      .text(`Proposed start date: ${d.startDate.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`)
      .text(`This offer expires: ${d.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`);
    writeText(doc.moveDown(2).text(`Sincerely,`), d.orgName);
    doc.end();
  });
}
