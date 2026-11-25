import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';

// PRF-05 "Download PDF" and PRF-06 "Download review": the review as the viewer sees it on the page, never more. The input
// is the same view GET reviews/:id returns to that viewer (the service decides what each person may read), drawn with
// PDFKit and the Noto fonts for Indian scripts (writeText), like the payslip and "my data". Every page carries who
// downloaded it and when; the download itself is in the audit log.

type Answer = { rating: number | null; text: string | null };
type Entry = { answers: unknown; overallRating: number | null; comment: string | null; sealed?: boolean } | null;
export interface ReviewPdfInput {
  cycle: { name: string; periodFrom: string; periodTo: string };
  employee: string;
  manager: string;
  status: string;
  template: { name: string; sections: { id: string; title: string; questions: { id: string; text: string; answer: string }[] }[]; levels: { value: number | null; label: string }[] };
  self: Entry;
  managerEntry: Entry;
  finalScore: number | null;
  band: string | null;
  sectionScores: { title: string; score: number }[];
  skipComment: string | null;
  released: { at: string; acknowledgedAt: string | null; acknowledgeComment: string | null } | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3 Nov 2026" from an ISO date or timestamp (IST for a timestamp). */
export function dayText(isoText: string): string {
  const d = isoText.length > 10 ? new Date(new Date(isoText).getTime() + 330 * 60_000) : new Date(`${isoText}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const STATUS: Record<string, string> = { open: 'In progress', in_calibration: 'In calibration', ready: 'Waiting for release', released: 'Released', acknowledged: 'Acknowledged', closed: 'Closed' };

export function reviewPdf(r: ReviewPdfInput, by: { name: string; at: Date }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true, info: { Title: `Performance review: ${r.cycle.name}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const level = (v: number | null) => (v === null ? 'Not given' : `${v} · ${r.template.levels.find((l) => l.value === v)?.label ?? ''}`.replace(/ · $/, ''));
    const line = (label: string, value: string) => writeText(doc.font('Helvetica').fontSize(10).fillColor('#000'), `${label}: ${value}`);

    writeText(doc.font('Helvetica-Bold').fontSize(18), `Performance review · ${r.employee}`);
    doc.font('Helvetica').fontSize(9).fillColor('#a00').text('CONFIDENTIAL').fillColor('#000').moveDown(0.5);
    writeText(doc.fontSize(10), r.cycle.name);
    line('Period', `${dayText(r.cycle.periodFrom)} – ${dayText(r.cycle.periodTo)}`);
    line('Manager', r.manager);
    line('Template', r.template.name);
    line('Status', STATUS[r.status] ?? r.status);
    if (r.finalScore !== null) line('Score', `${r.finalScore.toFixed(2)}${r.band ? ` · ${r.band}` : ''}`);
    for (const s of r.sectionScores) line(s.title, s.score.toFixed(2));
    if (r.released) {
      line('Released', dayText(r.released.at));
      if (r.released.acknowledgedAt) line('Acknowledged', dayText(r.released.acknowledgedAt));
    }

    for (const s of r.template.sections) {
      doc.moveDown();
      writeText(doc.font('Helvetica-Bold').fontSize(13), s.title);
      for (const q of s.questions) {
        doc.moveDown(0.3);
        writeText(doc.font('Helvetica-Bold').fontSize(10), q.text);
        for (const [who, e] of [['Self review', r.self], ['Manager', r.managerEntry]] as const) {
          const a = ((e?.answers ?? {}) as Record<string, Answer | undefined>)[q.id];
          if (!e || !a || (a.rating === null && !a.text)) continue;
          writeText(doc.font('Helvetica').fontSize(10), `${who}: ${q.answer === 'text' ? (a.text ?? '') : `${level(a.rating)}${a.text ? ` · ${a.text}` : ''}`}`);
        }
      }
    }
    const notes: [string, string | null | undefined][] = [
      ['Your self review summary', r.self?.comment],
      ['Manager’s summary', r.managerEntry?.comment],
      ['Skip-level comment', r.skipComment],
      ['Acknowledgement comment', r.released?.acknowledgeComment],
    ];
    for (const [label, text] of notes) {
      if (!text) continue;
      doc.moveDown();
      writeText(doc.font('Helvetica-Bold').fontSize(11), label);
      writeText(doc.font('Helvetica').fontSize(10), text);
    }
    if (r.managerEntry?.overallRating !== null && r.managerEntry?.overallRating !== undefined) {
      doc.moveDown();
      line('Overall rating', level(r.managerEntry.overallRating));
    }

    // Who downloaded it and when, on every page (as the payslip's watermark line).
    const stamp = `Downloaded by ${by.name} on ${dayText(by.at.toISOString())} · Confidential`;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      writeText(doc.font('Helvetica').fontSize(8).fillColor('#555'), `${stamp} · Page ${i + 1} of ${range.count}`, 50, doc.page.height - 30, { width: doc.page.width - 100, lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
