import { stringify } from 'csv-stringify/sync';
import { ExportResultRow } from '../reports.service';
import { formatFaceEnrolment } from './face-enrolment-label';

const COLUMNS = [
  'candidateName', 'status', 'score', 'maxScore', 'percentage', 'passFail', 'submittedAt', 'durationMinutes',
  { key: 'integrityLevel', header: 'Integrity level' },
  { key: 'integrityFlagCount', header: 'Integrity flags' },
  { key: 'faceEnrolment', header: 'Face' },
];

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
    integrityLevel: row.integrityLevel ?? '',
    integrityFlagCount: row.integrityFlagCount ?? 0,
    faceEnrolment: formatFaceEnrolment(row.faceEnrolmentStatus),
  }));
  const csv = stringify(records, { header: true, columns: COLUMNS });
  return Buffer.from(csv, 'utf-8');
}
