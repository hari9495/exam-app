import { buildResultLine, exportResultsToPdf } from './pdf-exporter';
import { ExportResultRow } from '../reports.service';

function row(overrides: Partial<ExportResultRow> = {}): ExportResultRow {
  return {
    candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
    status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
    submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
    integrityAnalysis: null, integrityLevel: 'high_risk', integrityFlagCount: 3, faceEnrolmentStatus: null,
    ...overrides,
  };
}

// pdfkit compresses its content streams, so the finished buffer cannot be searched for the text
// it renders -- which is exactly how the Face column went missing from the download while the
// buffer-shape tests below stayed green. Assert on the line the document is built from.
describe('buildResultLine', () => {
  it('carries the face enrolment status, worded exactly as the Results tab words it', () => {
    expect(buildResultLine(row({ faceEnrolmentStatus: 'enrolled' }))).toContain('Verified');
    expect(buildResultLine(row({ faceEnrolmentStatus: 'not_verified' }))).toContain('Not verified');
  });

  it('renders a dash for an attempt with no enrolment row, matching the other optional columns', () => {
    expect(buildResultLine(row({ faceEnrolmentStatus: null })).endsWith('-')).toBe(true);
  });
});

describe('exportResultsToPdf', () => {
  it('produces a non-empty buffer starting with the PDF file signature', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
        integrityAnalysis: null, integrityLevel: 'high_risk', integrityFlagCount: 3, faceEnrolmentStatus: null,
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
