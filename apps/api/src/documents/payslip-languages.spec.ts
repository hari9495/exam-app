import PDFDocument from 'pdfkit';
import { drawnOrder, expectNamesIn, INDIC_NAMES } from '../../test/fixtures/indic-names';
import { pdfText } from '../../test/fixtures/pdf-text';
import { LABELS, localOf, writeLabel, type LocalLanguage } from './payslip-languages';

// 5b-D2: every regional label lays out with real glyphs from the full Noto font (no blank boxes), and a bilingual payslip
// renders with the label, the English and the value, whatever script the value is in.
describe('payslip languages', () => {
  it.each(Object.keys(LABELS) as LocalLanguage[])('%s: every label has its glyphs in the font', (lang) => {
    for (const text of Object.values(LABELS[lang])) expect({ text, drawn: drawnOrder(text) !== null }).toEqual({ text, drawn: true });
  });

  it('a layout of English and Tamil renders a bilingual PDF with the Tamil font embedded and a Tamil name as the value', async () => {
    expect(localOf(['en', 'ta'])).toBe('ta');
    expect(localOf(['en'])).toBeNull();
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
    writeLabel(doc, 'ta', 'employeeName', 'Name', INDIC_NAMES.Tamil);
    writeLabel(doc, 'ta', 'netPay', 'Net wages paid', '58,500.00');
    writeLabel(doc, null, 'netPay', 'Net wages paid', '58,500.00');
    doc.end();
    const pdf = await done;
    expect(pdf.toString('latin1')).toMatch(/NotoSansTamil/);
    expectNamesIn(pdf, [LABELS.ta.netPay, INDIC_NAMES.Tamil]);
    expect(pdfText(pdf)).toContain('/ Net wages paid: 58,500.00 Net wages paid: 58,500.00');
  });
});
