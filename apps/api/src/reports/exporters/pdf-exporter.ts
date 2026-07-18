import PDFDocument from 'pdfkit';
import { ExportResultRow } from '../reports.service';

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
      const line = [
        row.candidateName,
        row.status,
        row.score !== null ? `${row.score}/${row.maxScore}` : '-',
        row.percentage !== null ? `${row.percentage}%` : '-',
        row.passFail ?? '-',
        row.durationMinutes !== null ? `${Math.round(row.durationMinutes)} min` : '-',
        row.integrityLevel ?? '-',
        `${row.integrityFlagCount ?? 0} flags`,
      ].join('   ');
      doc.text(line);
    });

    doc.end();
  });
}
