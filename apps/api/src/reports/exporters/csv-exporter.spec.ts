import { parse } from 'csv-parse/sync';
import { exportResultsToCsv } from './csv-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToCsv', () => {
  it('produces a CSV whose rows round-trip back to the original data', () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
        integrityAnalysis: null, integrityLevel: 'high_risk', integrityFlagCount: 3, faceEnrolmentStatus: null,
      },
    ];

    const buffer = exportResultsToCsv(rows);
    const records = parse(buffer.toString('utf-8'), { columns: true });

    expect(records).toEqual([
      {
        candidateName: 'Alice', status: 'submitted', score: '10', maxScore: '10', percentage: '100',
        passFail: 'pass', submittedAt: '2026-01-01T00:20:00.000Z', durationMinutes: '20',
        'Integrity level': 'high_risk', 'Integrity flags': '3',
      },
    ]);
  });

  it('renders null numeric/date fields as empty strings rather than the literal string "null"', () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-2', candidateName: 'Bob', invitationId: 'inv-2', attemptId: null,
        status: 'invited', score: null, maxScore: null, percentage: null, passFail: null,
        submittedAt: null, proctoringAnalysis: null, durationMinutes: null,
        integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0, faceEnrolmentStatus: null,
      },
    ];

    const buffer = exportResultsToCsv(rows);
    const records = parse(buffer.toString('utf-8'), { columns: true });

    expect(records).toEqual([
      {
        candidateName: 'Bob', status: 'invited', score: '', maxScore: '', percentage: '', passFail: '', submittedAt: '', durationMinutes: '',
        'Integrity level': '', 'Integrity flags': '0',
      },
    ]);
  });
});
