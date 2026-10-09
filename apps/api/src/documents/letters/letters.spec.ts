import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { TemplateProblem, buildDocx, docxParagraphs, fillDocx, openDocx, templateFields } from './docx';
import { FIELDS, STARTER_LETTERS, missingFields, sampleData, starterDocx, suggest } from './fields';
import { DevFakeConverter, acceptanceCopy, converterFromEnv, stampPdf } from './pdf';

describe('letter templates (YX-DOC-07 / 15)', () => {
  it('reads fields, sections included, and fills them; booleans drive sections', () => {
    const buf = buildDocx([{ text: 'Dear {{employee_name}},' }, { text: '{{#probation}}Probation: {{probation_months}} months.{{/probation}}' }]);
    expect(templateFields(buf)).toEqual(['employee_name', 'probation', 'probation_months']);
    expect(docxParagraphs(fillDocx(buf, { employee_name: 'Sneha', probation: true, probation_months: '6' }))).toEqual(['Dear Sneha,', 'Probation: 6 months.']);
    expect(docxParagraphs(fillDocx(buf, { employee_name: 'Sneha', probation: false }))).toEqual(['Dear Sneha,', '']);
  });

  it('refuses what could run or reach out: expressions, macros, external links, non-Word files', () => {
    expect(() => templateFields(buildDocx([{ text: '{{constructor.constructor}}' }]))).toThrow(TemplateProblem);
    expect(() => openDocx(Buffer.from('not a zip'))).toThrow(/not a Word/);
    const z = new PizZip(buildDocx([{ text: 'x' }]));
    z.file('word/vbaProject.bin', 'x');
    expect(() => openDocx(z.generate({ type: 'nodebuffer' }) as Buffer)).toThrow(/macros/);
    const e = new PizZip(buildDocx([{ text: 'x' }]));
    e.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="a" Target="https://x.test/a.png" TargetMode="External"/></Relationships>');
    expect(() => openDocx(e.generate({ type: 'nodebuffer' }) as Buffer)).toThrow(/outside the file/);
  });

  it('every starter uses only registered fields and fills from sample data; missing values are listed, flags never', () => {
    for (const s of STARTER_LETTERS) {
      const f = templateFields(starterDocx(s.letterType)!);
      expect(f.filter((k) => !FIELDS[k])).toEqual([]);
      expect(missingFields(f, sampleData())).toEqual([]);
    }
    expect(missingFields(['employee_code', 'probation'], { employee_code: '', probation: false })).toEqual(['employee_code']);
    expect(suggest('emp_nme')).toBe('employee_name');
    expect(suggest('desgnation')).toBe('designation');
    expect(suggest('zzzzzz')).toBeNull();
  });
});

describe('letter PDFs', () => {
  it('the dev fake is refused in production; without a converter nothing renders', () => {
    expect(() => converterFromEnv({ LETTER_PDF_CONVERTER: 'dev-fake', NODE_ENV: 'production' })).toThrow(/laptops only/);
    expect(converterFromEnv({})).toBeNull();
    expect(converterFromEnv({ GOTENBERG_URL: 'http://gotenberg:3000' })?.name).toBe('gotenberg');
  });

  it('stamps every page and seals an acceptance copy without changing the letter', async () => {
    const pdf = await new DevFakeConverter().toPdf(fillDocx(starterDocx('appointment')!, sampleData()));
    const stamped = await stampPdf(pdf, { referenceNo: 'KFPL/APT/2026/000001', verifyCode: 'ABCDEFGHJK', verifyUrl: 'http://localhost:3900/yx/verify/ABCDEFGHJK' });
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe((await PDFDocument.load(pdf)).getPageCount());
    const copy = await acceptanceCopy(stamped, { title: 'Appointment letter', referenceNo: 'KFPL/APT/2026/000001', letterSha256: 'a'.repeat(64), who: 'Sneha Pillai', at: '2026-10-09T05:00:00Z', channel: 'email', ip: '127.0.0.1', device: 'test', assurance: 'test' });
    expect((await PDFDocument.load(copy)).getPageCount()).toBe((await PDFDocument.load(stamped)).getPageCount() + 1);
  });
});
