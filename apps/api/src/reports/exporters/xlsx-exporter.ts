import ExcelJS from 'exceljs';
import { ExportResultRow } from '../reports.service';

const COLUMNS = [
  { header: 'Candidate Name', key: 'candidateName', width: 24 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Score', key: 'score', width: 10 },
  { header: 'Max Score', key: 'maxScore', width: 10 },
  { header: 'Percentage', key: 'percentage', width: 12 },
  { header: 'Pass/Fail', key: 'passFail', width: 10 },
  { header: 'Submitted At', key: 'submittedAt', width: 22 },
  { header: 'Duration (min)', key: 'durationMinutes', width: 14 },
  { header: 'Integrity level', key: 'integrityLevel', width: 16 },
  { header: 'Integrity flags', key: 'integrityFlagCount', width: 14 },
];

export async function exportResultsToXlsx(rows: ExportResultRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = COLUMNS;
  rows.forEach((row) => {
    sheet.addRow({
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt ? row.submittedAt.toISOString() : '',
      durationMinutes: row.durationMinutes,
      integrityLevel: row.integrityLevel ?? '',
      integrityFlagCount: row.integrityFlagCount ?? 0,
    });
  });
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
