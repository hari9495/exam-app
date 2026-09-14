import PDFDocument from 'pdfkit';
// qrcode is a workspace dependency (declared in apps/web) hoisted to the root node_modules, so it
// resolves from here without being re-declared. Used to embed the verification QR on the certificate.
import QRCode from 'qrcode';
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
  // Public verification page URL for this certificate. When set, a "Verify at …" line + a scannable
  // QR are printed in the footer so a holder can confirm the certificate is genuine.
  verifyUrl?: string;
}

// Renders the certificate to a PDF Buffer. Layout is deliberately simple + centered (mirrors the
// offer-letter pdfkit approach); the org's title/body/signatory text is merged in.
export async function buildCertificatePdf(template: CertificateTemplateCopy, vars: CertificateVars): Promise<Buffer> {
  // Generated before opening the doc so it can be drawn synchronously inside the stream.
  const qrBuffer = vars.verifyUrl ? await QRCode.toBuffer(vars.verifyUrl, { margin: 1, width: 120 }) : null;
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
    if (vars.verifyUrl) {
      doc.fontSize(9).fillColor('#999').text(`Verify at ${vars.verifyUrl}`, 60, doc.page.height - 58, { width: inner, align: 'center' });
    }
    if (qrBuffer) {
      // Bottom-right, inside the border.
      doc.image(qrBuffer, width - 60 - 62, doc.page.height - 122, { width: 62 });
    }

    doc.end();
  });
}
