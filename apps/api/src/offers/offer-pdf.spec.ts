import { buildOfferPdf } from './offer-pdf';

it('produces a non-empty PDF buffer starting with the PDF magic bytes', async () => {
  const buf = await buildOfferPdf({
    orgName: 'Acme',
    letterBody: 'We are pleased to offer you the role.',
    candidateName: 'Asha Rao',
    jobTitle: 'Backend Engineer',
    compensation: '$120,000 / year',
    startDate: new Date('2026-01-06'),
    expiresAt: new Date('2025-12-31'),
  });
  expect(buf.length).toBeGreaterThan(500);
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-'); // pdfkit output is a real PDF
});
