import { poshAnnualReportPdf } from './posh-report-pdf';
import { pdfText } from '../../test/fixtures/pdf-text';

// Answer 2621: the IC annual report PDF carries the five Rule 14 items, the committee and no personal details.
describe('IC annual report PDF', () => {
  it('has the counts, the action taken, the members and the status', async () => {
    const pdf = await poshAnnualReportPdf({ company: 'Kaveri Foods', committee: 'Hosur plant', year: 2026, received: 3, disposed: 2, pendingOver90: 1, sessions: 4, trainings: 57, actionTaken: '1 written warning', stage: 'reviewed', members: [{ name: 'Lakshmi Venkatesan', role: 'presiding', woman: true }, { name: 'Asha Rao', role: 'external', woman: true }], preparedOn: '2027-01-10' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = (await pdfText(pdf)).replace(/\s+/g, ' ');
    for (const s of ['Annual report of the Internal Committee', 'Kaveri Foods', 'Hosur plant', 'Complaints of sexual harassment received in the year', '1 written warning', 'Presiding officer', 'External member', 'Reviewed by the presiding officer', 'more than ninety days']) expect(text).toContain(s);
  });

  it('a draft with no action written says so', async () => {
    const pdf = await poshAnnualReportPdf({ company: 'K', committee: 'Whole company', year: 2026, received: 0, disposed: 0, pendingOver90: 0, sessions: 0, trainings: 0, actionTaken: null, stage: 'draft', members: [], preparedOn: '2026-11-27' });
    const text = (await pdfText(pdf)).replace(/\s+/g, ' ');
    expect(text).toContain('Not written yet');
    expect(text).toContain('No members on record.');
  });
});
