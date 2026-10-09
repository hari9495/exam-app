import { join } from 'path';
import PDFDocument from 'pdfkit';
import { FONT_DIR, FONT_FILE, LABELS, labelText, localOf, writeLabel, type LocalLanguage } from './payslip-languages';
// fontkit is what pdfkit lays text out with (a dependency of pdfkit).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as { openSync(p: string): { layout(t: string): { glyphs: { id: number }[] } } };

// 5b-D2: every regional label lays out with real glyphs from its subset font (no blank boxes: a changed label without a
// new subset fails here), and a bilingual payslip renders.
describe('payslip languages', () => {
  it.each(Object.keys(LABELS) as LocalLanguage[])('%s: every label has its glyphs in the subset font', (lang) => {
    const font = fontkit.openSync(join(FONT_DIR, FONT_FILE[lang]));
    for (const text of Object.values(LABELS[lang])) expect({ text, missing: font.layout(text).glyphs.filter((g) => g.id === 0).length }).toEqual({ text, missing: 0 });
    expect(labelText(lang).length).toBeGreaterThan(20);
  });

  it('a layout of English and Tamil renders a bilingual PDF with the Tamil font embedded', async () => {
    expect(localOf(['en', 'ta'])).toBe('ta');
    expect(localOf(['en'])).toBeNull();
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
    writeLabel(doc, 'ta', 'netPay', 'Net wages paid', '58,500.00');
    writeLabel(doc, null, 'netPay', 'Net wages paid', '58,500.00');
    doc.end();
    expect((await done).toString('latin1')).toMatch(/NotoSansTamil/);
  });
});
