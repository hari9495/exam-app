import { stringify } from 'csv-stringify/sync';
import { ExportResultRow } from '../reports.service';

const COLUMNS = ['candidateName', 'status', 'score', 'maxScore', 'percentage', 'passFail', 'submittedAt', 'durationMinutes'];

export function exportResultsToCsv(rows: ExportResultRow[]): Buffer {
  const records = rows.map((row) => ({
    candidateName: row.candidateName,
    status: row.status,
    score: row.score ?? '',
    maxScore: row.maxScore ?? '',
    percentage: row.percentage ?? '',
    passFail: row.passFail ?? '',
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : '',
    durationMinutes: row.durationMinutes ?? '',
  }));
  const csv = stringify(records, { header: true, columns: COLUMNS });
  return Buffer.from(csv, 'utf-8');
}
