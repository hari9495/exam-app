import PDFDocument from 'pdfkit';
import { renderTemplateString } from '../templates/render-template-string';

// Per-org editable copy for a pass certificate. The visual layout below is fixed; only these text
// fields are org-customizable ({{merge}} fields rendered against CertificateVars). A missing or
// disabled CertificateTemplate row falls back to this default.
export interface CertificateTemplateCopy {
  title: string;
  bodyText: string;
  signatoryName?: string | null;
}

export const CERTIFICATE_DEFAULT: CertificateTemplateCopy = {
  title: 'Certificate of Achievement',
  bodyText:
    'This is to certify that {{candidateName}} has successfully passed {{examTitle}} at {{orgName}}, ' +
    'achieving a score of {{scorePercent}}% on {{date}}.',
  signatoryName: '',
};

export interface CertificateVars {
  candidateName: string;
  examTitle: string;
  scorePercent: string;
  date: string;
  orgName: string;
  certificateId: string;
}

// Renders the certificate to a PDF Buffer. Layout is deliberately simple + centered (mirrors the
// offer-letter pdfkit approach); the org's title/body/signatory text is merged in.
export function buildCertificatePdf(template: CertificateTemplateCopy, vars: CertificateVars): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width;
    const inner = width - 120; // margin 60 both sides

    // Decorative double border.
    doc.lineWidth(3).rect(30, 30, width - 60, doc.page.height - 60).stroke('#1f3a5f');
    doc.lineWidth(1).rect(40, 40, width - 80, doc.page.height - 80).stroke('#1f3a5f');

    doc.fontSize(13).fillColor('#555').text(vars.orgName.toUpperCase(), 60, 80, { width: inner, align: 'center', characterSpacing: 2 });

    const title = renderTemplateString(template.title, vars as unknown as Record<string, string>);
    doc.moveDown(1.2).fontSize(30).fillColor('#1f3a5f').text(title, { width: inner, align: 'center' });

    doc.moveDown(1).fontSize(14).fillColor('#333').text('This certificate is proudly presented to', { width: inner, align: 'center' });

    doc.moveDown(0.6).fontSize(28).fillColor('#111').text(vars.candidateName, { width: inner, align: 'center' });

    const body = renderTemplateString(template.bodyText, vars as unknown as Record<string, string>);
    doc.moveDown(1).fontSize(13).fillColor('#333').text(body, { width: inner, align: 'center', lineGap: 4 });

    if (template.signatoryName && template.signatoryName.trim()) {
      doc.moveDown(2).fontSize(12).fillColor('#111').text(template.signatoryName, { width: inner, align: 'center' });
      doc.fontSize(10).fillColor('#777').text('Authorized signatory', { width: inner, align: 'center' });
    }

    // Footer: certificate id + issue date, for verification/reference.
    doc.fontSize(9).fillColor('#999').text(`Certificate ID: ${vars.certificateId}  ·  Issued ${vars.date}`, 60, doc.page.height - 70, {
      width: inner,
      align: 'center',
    });

    doc.end();
  });
}
