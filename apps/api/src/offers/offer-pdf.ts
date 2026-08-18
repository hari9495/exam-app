import PDFDocument from 'pdfkit';

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

    doc.fontSize(18).text(d.orgName, { align: 'left' });
    doc.moveDown().fontSize(14).text('Offer of Employment', { align: 'left' });
    doc.moveDown().fontSize(11).text(d.letterBody, { align: 'left' });
    doc.moveDown();
    doc
      .fontSize(11)
      .text(`Position: ${d.jobTitle}`)
      .text(`Compensation: ${d.compensation}`)
      .text(`Proposed start date: ${d.startDate.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`)
      .text(`This offer expires: ${d.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' } as any)}`);
    doc.moveDown(2).text(`Sincerely,`).text(d.orgName);
    doc.end();
  });
}
