import { exportResultsToPdf } from './pdf-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToPdf', () => {
  it('produces a non-empty buffer starting with the PDF file signature', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
      },
    ];

    const buffer = await exportResultsToPdf(rows);

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('produces a valid, non-empty PDF even with zero rows', async () => {
    const buffer = await exportResultsToPdf([]);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
