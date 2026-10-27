import 'reflect-metadata';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TemplateProblem, buildDocx, docxBlocks, docxParagraphs, fillDocx, openDocx, renameFields, templateFields, type Block } from './docx';
import { ComposeTemplateDto } from './dto';
import { FIELDS, STARTER_LETTERS, missingFields, sampleData, starterDocx, suggest } from './fields';
import { DevFakeConverter, acceptanceCopy, converterFromEnv, stampPdf } from './pdf';

describe('letter templates (YX-DOC-07 / 15)', () => {
  it('reads fields, sections included, and fills them; booleans drive sections', () => {
    const buf = buildDocx([{ runs: [{ text: 'Dear {{employee_name}},' }] }, { runs: [{ text: '{{#probation}}Probation: {{probation_months}} months.{{/probation}}' }] }]);
    expect(templateFields(buf)).toEqual(['employee_name', 'probation', 'probation_months']);
    expect(docxParagraphs(fillDocx(buf, { employee_name: 'Sneha', probation: true, probation_months: '6' }))).toEqual(['Dear Sneha,', 'Probation: 6 months.']);
    expect(docxParagraphs(fillDocx(buf, { employee_name: 'Sneha', probation: false }))).toEqual(['Dear Sneha,', '']);
  });

  it('refuses what could run or reach out: expressions, macros, external links, non-Word files', () => {
    expect(() => templateFields(buildDocx([{ runs: [{ text: '{{constructor.constructor}}' }] }]))).toThrow(TemplateProblem);
    expect(() => openDocx(Buffer.from('not a zip'))).toThrow(/not a Word/);
    const z = new PizZip(buildDocx([{ runs: [{ text: 'x' }] }]));
    z.file('word/vbaProject.bin', 'x');
    expect(() => openDocx(z.generate({ type: 'nodebuffer' }) as Buffer)).toThrow(/macros/);
    const e = new PizZip(buildDocx([{ runs: [{ text: 'x' }] }]));
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

  it('PPL-15 offer withdrawal: the role, the start date and the reason when HR gave one; no blank line when not; never signed by the person', () => {
    const s = STARTER_LETTERS.find((x) => x.letterType === 'offer_withdrawal')!;
    expect(s).toMatchObject({ name: 'Offer withdrawal letter', requiresApproval: false, personSigns: false, onePerPerson: true });
    const f = templateFields(starterDocx('offer_withdrawal')!);
    expect(f).toEqual(expect.arrayContaining(['employee_name', 'designation', 'joining_date', 'legal_entity', 'today', 'reference_no', 'signatory_name', 'signatory_title', 'withdrawal_reason']));
    const data = { ...sampleData(), withdrawal_reason: 'The role was closed' };
    const text = docxParagraphs(fillDocx(starterDocx('offer_withdrawal')!, data)).join('\n');
    expect(text).toContain('Kaveri Foods Pvt Ltd withdraws its offer for the role of Production Supervisor, which was to start on 19 October 2026.');
    expect(text).toContain('The reason: The role was closed.');
    expect(missingFields(f, { ...data, withdrawal_reason: '' })).toEqual([]);
    expect(docxParagraphs(fillDocx(starterDocx('offer_withdrawal')!, { ...data, withdrawal_reason: '' })).join('\n')).not.toContain('The reason');
  });

  it('every starter is a proper letter: letterhead, reference, date, subject and who signs; the CIN only when known', () => {
    for (const s of STARTER_LETTERS) {
      const text = docxParagraphs(starterDocx(s.letterType)!).join('\n');
      for (const part of ['{{legal_entity}}', 'Ref: {{reference_no}}', 'Date: {{today}}', 'Subject: ', '{{signatory_name}}', '{{signatory_title}}']) expect(text).toContain(part);
    }
    const head = docxParagraphs(fillDocx(starterDocx('experience')!, { ...sampleData(), legal_entity_cin: '' })).slice(0, 3);
    expect(head).toEqual(['Kaveri Foods Pvt Ltd', '4th Floor, Prestige Meridian, MG Road, Bengaluru 560001', '']);
    expect(missingFields(['legal_entity_cin', 'legal_entity_address'], { legal_entity_cin: '', legal_entity_address: '' })).toEqual([]);
  });

  it('"Use suggestion" renames a placeholder, also when Word split it across runs', () => {
    const z = new PizZip(buildDocx([{ runs: [{ text: 'Dear {{emp_nme}}' }] }, { runs: [{ text: '{{#on_prob}}x{{/on_prob}}' }] }]));
    z.file('word/document.xml', z.file('word/document.xml')!.asText().replace('{{emp_nme}}', '{{emp_</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t xml:space="preserve">nme}}'));
    const fixed = renameFields(z.generate({ type: 'nodebuffer' }) as Buffer, { emp_nme: 'employee_name', on_prob: 'probation' });
    expect(templateFields(fixed)).toEqual(['employee_name', 'probation']);
    expect(docxParagraphs(fillDocx(fixed, { employee_name: 'Sneha', probation: true }))).toEqual(['Dear Sneha', 'x']);
  });
});

describe('the letter editor in Word (PPL-29)', () => {
  const blocks: Block[] = [
    { kind: 'heading', runs: [{ text: 'Offer for {{employee_name}}' }] },
    { kind: 'subheading', runs: [{ text: 'Pay' }] },
    { kind: 'normal', runs: [{ text: 'Bold', bold: true }, { text: ' italic', italic: true }, { text: ' under', underline: true }, { text: ' struck', strike: true }, { text: ' red', color: '#C00000' }, { text: ' marked', highlight: '#FFFF00' }, { text: ' big', size: 18 }, { text: ' policies', link: 'https://kaveri.example/policies' }] },
    { kind: 'bullet', level: 0, runs: [{ text: 'One' }] },
    { kind: 'bullet', level: 1, runs: [{ text: 'Inside' }] },
    { kind: 'numbered', level: 0, runs: [{ text: 'First {{designation}}' }] },
    { kind: 'quote', runs: [{ text: 'Quoted' }] },
    { kind: 'normal', runs: [{ text: 'Dear {{emp', bold: true }, { text: 'loyee_name}}, line\ntwo' }] },
  ];
  const buf = buildDocx(blocks);
  const part = (name: string) => new PizZip(buf).file(name)!.asText();

  it('builds Word runs, styles, numbering and links; a tag split by formatting stays in one run and still fills', () => {
    const xml = part('word/document.xml');
    for (const x of ['<w:b/>', '<w:i/>', '<w:u w:val="single"/>', '<w:strike/>', '<w:color w:val="C00000"/>', '<w:highlight w:val="yellow"/>', '<w:sz w:val="36"/>', '<w:pStyle w:val="Heading2"/>', '<w:pStyle w:val="Quote"/>', '<w:ilvl w:val="1"/><w:numId w:val="1"/>', '<w:ilvl w:val="0"/><w:numId w:val="2"/>', '<w:hyperlink r:id="rIdLink1"']) expect(xml).toContain(x);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Dear {{employee_name}}</w:t>');
    expect(part('word/_rels/document.xml.rels')).toContain('Target="https://kaveri.example/policies" TargetMode="External"');
    expect(part('word/numbering.xml')).toContain('<w:numFmt w:val="decimal"/>');
    expect(templateFields(buf)).toEqual(['designation', 'employee_name']);
    const filled = docxParagraphs(fillDocx(buf, { employee_name: 'Sneha', designation: 'Analyst' }));
    expect([filled[0], filled[5], filled[7]]).toEqual(['Offer for Sneha', 'First Analyst', 'Dear Sneha, line\ntwo']);
  });

  it('reads every style back for the editor, and reads older templates (no Word styles) too', () => {
    expect(docxBlocks(buf)).toEqual([...blocks.slice(0, 7), { kind: 'normal', runs: [{ text: 'Dear {{employee_name}}', bold: true }, { text: ', line\ntwo' }] }]);
    const old = new PizZip(buf);
    old.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">{{legal_entity}}</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">CIN</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Thanks</w:t></w:r></w:p></w:body></w:document>');
    expect(docxBlocks(old.generate({ type: 'nodebuffer' }) as Buffer)).toEqual([
      { kind: 'heading', runs: [{ text: '{{legal_entity}}' }] },
      { kind: 'normal', runs: [{ text: 'CIN', size: 9 }] },
      { kind: 'normal', runs: [{ text: 'Thanks', bold: true }] },
    ]);
  });

  it('accepts only the editor presets and https or mailto links', () => {
    const errors = (run: object) => validateSync(plainToInstance(ComposeTemplateDto, { letterType: 'note', name: 'Note', requiresApproval: false, personSigns: false, paragraphs: [{ runs: [{ text: 'x', ...run }] }] }), { whitelist: true, forbidNonWhitelisted: true }).length;
    expect(errors({ bold: true, color: '#C00000', highlight: '#FFFF00', size: 14, link: 'mailto:hr@kaveri.example' })).toBe(0);
    for (const bad of [{ color: '#123456' }, { highlight: 'red' }, { size: 72 }, { link: 'javascript:alert(1)' }, { link: 'http://kaveri.example' }, { font: 'Comic Sans' }]) expect({ bad, n: errors(bad) }).not.toEqual({ bad, n: 0 });
    expect(() => openDocx(buildDocx([{ runs: [{ text: 'x', link: 'http://kaveri.example' }] }]))).toThrow(/outside the file/);
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
