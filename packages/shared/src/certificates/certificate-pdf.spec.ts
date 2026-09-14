import { buildCertificatePdf, CERTIFICATE_DEFAULT } from './certificate-pdf';

describe('buildCertificatePdf', () => {
  const vars = {
    candidateName: 'Ada Lovelace',
    examTitle: 'Algorithms',
    scorePercent: '88',
    date: 'January 1, 2026',
    orgName: 'Acme',
    certificateId: 'cert-123',
  };

  it('produces a non-empty PDF buffer', async () => {
    const pdf = await buildCertificatePdf(CERTIFICATE_DEFAULT, vars);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    // PDF magic header.
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders custom copy without throwing (merge fields resolved)', async () => {
    const pdf = await buildCertificatePdf(
      { title: 'Well done {{candidateName}}', bodyText: 'Passed {{examTitle}} ({{scorePercent}}%).', signatoryName: 'Jordan' },
      vars,
    );
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('embeds a verification QR when verifyUrl is set (larger than without)', async () => {
    const withoutQr = await buildCertificatePdf(CERTIFICATE_DEFAULT, vars);
    const withQr = await buildCertificatePdf(CERTIFICATE_DEFAULT, { ...vars, verifyUrl: 'https://app.example.com/verify/cert-123' });
    expect(Buffer.isBuffer(withQr)).toBe(true);
    // The embedded QR PNG makes the file meaningfully larger.
    expect(withQr.length).toBeGreaterThan(withoutQr.length);
  });
});
