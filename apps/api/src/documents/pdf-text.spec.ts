import PDFDocument from 'pdfkit';
import { drawnOrder, expectNamesIn, INDIC_NAMES } from '../../test/fixtures/indic-names';
import { pdfText } from '../../test/fixtures/pdf-text';
import { heightOfText, scriptRuns, writeText } from './pdf-text';

const render = (f: (d: PDFKit.PDFDocument) => void) =>
  new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    f(doc);
    doc.end();
  });

// Names in Indian scripts print with real glyphs in every PDF (no boxes, no wrong letters): one shared writer picks the
// Noto font of each run of text by Unicode script.
describe('writeText (Indian scripts in PDFs)', () => {
  it('splits text into runs by script; spaces stay with the run before; Western Latin keeps the current font', () => {
    expect(scriptRuns('Ravi ரவி குமார்')).toEqual([
      { script: null, text: 'Ravi ' },
      { script: 'Tamil', text: 'ரவி குமார்' },
    ]);
    expect(scriptRuns('रवि (Ravi)').map((r) => r.script)).toEqual(['Devanagari', null]);
    expect(scriptRuns('Café Müller — 5%').map((r) => r.script)).toEqual([null]); // all in WinAnsi
    expect(scriptRuns('₹ 1,200 Śrī').map((r) => r.script)).toEqual(['Latin', null, 'Latin', null, 'Latin']); // NotoSans for what Helvetica lacks
    expect(scriptRuns('मैं।').map((r) => r.script)).toEqual(['Devanagari']); // the danda stays in the run
    expect(scriptRuns('')).toEqual([]);
  });

  it.each(Object.entries(INDIC_NAMES))('%s: the full Noto font has every glyph of %s', (_s, name) => {
    expect(drawnOrder(name)).not.toBeNull();
  });

  it('a PDF of every name, alone, after Latin and in bold, reads back with the same names', async () => {
    const names = Object.values(INDIC_NAMES);
    const pdf = await render((d) => {
      for (const n of names) writeText(d, n);
      for (const n of names) writeText(d, `Employee: Ravi ${n} (code 7)`);
      d.font('Helvetica-Bold');
      for (const n of names) writeText(d, n, 40, d.y, { width: 300 });
    });
    expectNamesIn(pdf, names);
    const text = pdfText(pdf);
    expect(text).toContain('Employee: Ravi');
    expect(text).toContain('(code 7)');
    expect(pdf.toString('latin1')).toMatch(/NotoSansTamil-Bold/);
  });

  it('money prints the rupee sign (founder 30 Oct 2026: ₹, not Rs.) in NotoSans, beside Helvetica text', async () => {
    const pdf = await render((d) => writeText(d, 'Net pay  ₹12,34,567.50'));
    // pdf.js puts a space between two fonts' runs when reading text back; on the page the sign sits next to the digits.
    expect(pdfText(pdf)).toMatch(/₹ ?12,34,567.50/);
    expect(pdf.toString('latin1')).toMatch(/NotoSans-Regular/);
  });

  it('negative: the same names written with plain doc.text (Helvetica) fail the check', async () => {
    const pdf = await render((d) => d.text(INDIC_NAMES.Tamil));
    expect(() => expectNamesIn(pdf, [INDIC_NAMES.Tamil])).toThrow();
  });

  it('plain Latin text is written exactly as doc.text would (no font change, options kept)', async () => {
    const pdf = await render((d) => {
      writeText(d, 'Hello', { continued: true });
      d.text(' world');
    });
    expect(pdfText(pdf)).toContain('Hello world');
    expect(pdf.toString('latin1')).not.toMatch(/NotoSans/);
  });

  it('mixed text wraps inside the width, and heightOfText measures it', async () => {
    const long = Array.from({ length: 12 }, () => `Ravi ${INDIC_NAMES.Tamil}`).join(' ');
    let h = 0;
    let used = 0;
    const pdf = await render((d) => {
      d.fontSize(10);
      h = heightOfText(d, long, { width: 200 });
      const y = d.y;
      writeText(d, long, 40, y, { width: 200 });
      used = d.y - y;
    });
    expect(used).toBeGreaterThan(30); // several lines
    expect(Math.abs(h - used)).toBeLessThan(15); // within about a line
    expect(pdfText(pdf)).toContain(drawnOrder(INDIC_NAMES.Tamil)!);
  });
});

describe('writeText centred and right-aligned', () => {
  const fragments = (f: (d: PDFKit.PDFDocument) => void) =>
    new Promise<number[][]>((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, compress: false });
      const chunks: Buffer[] = [];
      doc.on('data', (b: Buffer) => chunks.push(b));
      doc.on('end', () =>
        resolve(
          [
            ...Buffer.concat(chunks)
              .toString('latin1')
              .matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g),
          ].map((m) => [Number(m[1]), Number(m[2])]),
        ),
      );
      f(doc);
      doc.end();
    });

  it('places a mixed line as a whole: runs left to right on one baseline, centred in the width', async () => {
    const xs = await fragments((d) => writeText(d.fontSize(12), `Ravi ${INDIC_NAMES.Tamil} downloaded`, 100, 100, { width: 400, align: 'center' }));
    expect(xs).toHaveLength(3);
    expect(xs[0][0]).toBeGreaterThan(150); // centred, not at the left edge
    expect(xs[1][0]).toBeGreaterThan(xs[0][0]);
    expect(xs[2][0]).toBeGreaterThan(xs[1][0]);
    expect(new Set(xs.map((p) => p[1])).size).toBe(1);
    const right = await fragments((d) => writeText(d.fontSize(12), `Ravi ${INDIC_NAMES.Tamil}`, 100, 100, { width: 400, align: 'right' }));
    expect(right[0][0]).toBeGreaterThan(xs[0][0]);
  });

  it('wraps a long centred line into lines, each below the last', async () => {
    let after = 0;
    const xs = await fragments((d) => {
      writeText(d.fontSize(28), `${INDIC_NAMES.Tamil} · downloaded 30 Oct 2026 10:00 IST`, 60, 400, { width: 480, align: 'center' });
      after = d.y;
    });
    expect(new Set(xs.map((p) => p[1])).size).toBe(2);
    expect(after).toBeGreaterThan(450);
  });
});
