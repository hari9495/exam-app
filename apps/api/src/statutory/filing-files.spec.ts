import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkShape, damages, runGolden, type GoldenCase, type RuleSet } from './evaluator';
import { ecrFile, esiFile, ptFile } from './filing-files';

const pack = (JSON.parse(readFileSync(join(__dirname, 'packs', 'in-filing.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;

describe('statutory files (PAY-6.02 … 6.05)', () => {
  it('the 5f pack passes its shape checks and golden cases', () => {
    for (const rs of pack) {
      expect(checkShape(rs)).toEqual([]);
      for (const g of rs.golden) expect(runGolden(rs, g)).toEqual([]);
    }
  });

  it('ECR: eleven #~#-separated fields, whole rupees, capital names; a bad UAN is refused', () => {
    const row = {
      uan: '100200300400',
      name: 'Asha Rao-K',
      gross: '60500.00',
      epfWages: '15000',
      epsWages: '15000',
      edliWages: '15000',
      epfEmployee: '1800.00',
      eps: '1250.00',
      epfDiff: '550.00',
      ncpDays: 2,
      refund: '0',
    };
    expect(ecrFile([row]).toString()).toBe('100200300400#~#ASHA RAO K#~#60500#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0\n');
    expect(() => ecrFile([{ ...row, uan: '12345' }])).toThrow(/12 digits/);
  });

  it('ESI: the IP number stays text with its leading zeros', async () => {
    const out = await esiFile([{ ipNumber: '0012345678', name: 'Asha Rao', days: 30, wages: '20000.00', reasonCode: '0', lastWorkingDay: '' }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as unknown as ArrayBuffer);
    const r = wb.worksheets[0].getRow(2);
    expect([r.getCell(1).value, r.getCell(3).value, r.getCell(4).value]).toEqual(['0012345678', 30, 20000]);
  });

  it('PT: people, then a summary by the tax each paid', () => {
    const pt = ptFile('IN-KA', '2026-10', [
      { code: 'E1', name: 'A', ptWage: '60500.00', pt: '200.00' },
      { code: 'E2', name: '=cmd', ptWage: '20000.00', pt: '0.00' },
      { code: 'E3', name: 'C', ptWage: '70000.00', pt: '200.00' },
    ]).toString();
    expect(pt).toContain('"","200.00",2,"400.00"');
    expect(pt).not.toContain('=cmd');
  });

  it('damages: the yearly rate by months late', () => {
    const rs = pack.find((r) => r.statute === 'IN.DAMAGES')!;
    expect(damages(rs, { statute: 'pf', amount: '10000', daysLate: 200 })).toMatchObject({ rate: '0.25' });
    expect(damages(rs, { statute: 'esi', amount: '10000', daysLate: 0 }).amount.toFixed(2)).toBe('0.00');
  });
});
