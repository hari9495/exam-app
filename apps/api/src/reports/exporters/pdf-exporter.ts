import PDFDocument from 'pdfkit';
import { ExportResultRow } from '../reports.service';
import { formatFaceEnrolment } from './face-enrolment-label';

// Exported so a test can assert what a row actually SAYS. pdfkit compresses its content
// streams, so the finished buffer can only be checked for being a valid PDF -- the columns
// themselves are unreadable from it, which is how the Face column went missing unnoticed.
export function buildResultLine(row: ExportResultRow): string {
  return [
    row.candidateName,
    row.status,
    row.score !== null ? `${row.score}/${row.maxScore}` : '-',
    row.percentage !== null ? `${row.percentage}%` : '-',
    row.passFail ?? '-',
    row.durationMinutes !== null ? `${Math.round(row.durationMinutes)} min` : '-',
    row.integrityLevel ?? '-',
    `${row.integrityFlagCount ?? 0} flags`,
    // '-' rather than blank, matching every other optional column on this line.
    formatFaceEnrolment(row.faceEnrolmentStatus, '-'),
  ].join('   ');
}

export function exportResultsToPdf(rows: ExportResultRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Exam Results', { align: 'left' });
    doc.moveDown();
    doc.fontSize(10);

    rows.forEach((row) => {
      doc.text(buildResultLine(row));
    });

    doc.end();
  });
}
