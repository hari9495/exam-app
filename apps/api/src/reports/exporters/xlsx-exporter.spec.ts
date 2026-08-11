import ExcelJS from 'exceljs';
import { exportResultsToXlsx } from './xlsx-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToXlsx', () => {
  it('produces a workbook whose first sheet round-trips the result rows', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
        integrityAnalysis: null, integrityLevel: 'high_risk', integrityFlagCount: 3, faceEnrolmentStatus: 'enrolled',
      },
    ];

    const buffer = await exportResultsToXlsx(rows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Results')!;
    const headerRow = sheet.getRow(1).values as unknown[];
    const dataRow = sheet.getRow(2).values as unknown[];

    expect(headerRow).toContain('Candidate Name');
    expect(headerRow).toContain('Integrity level');
    expect(headerRow).toContain('Integrity flags');
    expect(dataRow).toContain('Alice');
    expect(dataRow).toContain(100);
    expect(dataRow).toContain('high_risk');
    expect(dataRow).toContain(3);
    // The Results tab shows a Face column; a download that omits it disagrees with the screen.
    expect(headerRow).toContain('Face');
    expect(dataRow).toContain('Verified');
  });

  it('leaves the Face cell blank for an attempt with no enrolment row rather than writing "null"', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-2', candidateName: 'Bob', invitationId: 'inv-2', attemptId: null,
        status: 'invited', score: null, maxScore: null, percentage: null, passFail: null,
        submittedAt: null, proctoringAnalysis: null, durationMinutes: null,
        integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0, faceEnrolmentStatus: null,
      },
    ];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportResultsToXlsx(rows)) as any);
    const dataRow = workbook.getWorksheet('Results')!.getRow(2).values as unknown[];

    expect(dataRow).not.toContain('null');
    expect(dataRow).not.toContain('Verified');
  });
});
