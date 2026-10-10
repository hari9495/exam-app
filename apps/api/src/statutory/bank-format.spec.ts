import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bankCells, bankLayoutProblems, writeBankFile, type BankLayout } from './bank-format';
import { checkShape, runGolden, type GoldenCase, type RuleSet } from './evaluator';

const pack = (JSON.parse(readFileSync(join(__dirname, 'packs', 'in-bank-formats.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
const generic = pack[0].values as unknown as BankLayout;
const row = { account: '000123456789', ifsc: 'HDFC0001234', name: 'Asha Rao', amount: '58500.00', code: 'EMP-1', narration: 'Salary 2026-10' };
const ctx = { debitAccount: '0050200012345678', date: '2026-10-31' };
const fixed: BankLayout = {
  ...generic,
  fileType: 'txt',
  header: false,
  amountFormat: 'paise',
  columns: [
    { title: 'T', field: 'txnType', width: 4 },
    { title: 'A', field: 'account', width: 18 },
    { title: 'I', field: 'ifsc', width: 11 },
    { title: 'N', field: 'name', width: 10 },
    { title: 'Amt', field: 'amount', width: 12 },
  ],
};

describe('bank file formats (PAY-4.01, YX-PAY-13)', () => {
  it('the generic pack passes its shape checks and golden cases', () => {
    for (const rs of pack) {
      expect(checkShape(rs)).toEqual([]);
      for (const g of rs.golden) expect(runGolden(rs, g)).toEqual([]);
    }
  });

  it('keeps leading zeros in a fixed-width TXT, pads amounts with zeros, and cuts only names', async () => {
    const out = await writeBankFile(fixed, [row], ctx);
    expect(out.data.toString()).toBe('NEFT000123456789      HDFC0001234ASHA RAO  000005850000\r\n');
    expect(() =>
      bankCells(
        {
          ...fixed,
          columns: [
            { title: 'A', field: 'account', width: 8 },
            { title: 'I', field: 'ifsc', width: 11 },
            { title: 'Amt', field: 'amount', width: 12 },
          ],
        },
        row,
        ctx,
      ),
    ).toThrow(/does not fit/);
  });

  it('keeps leading zeros in XLSX: identifier cells are text, the amount a number', async () => {
    const out = await writeBankFile(generic, [row], ctx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.data as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Payments')!;
    expect(ws.getRow(1).getCell(2).value).toBe('Beneficiary account');
    expect(ws.getRow(2).getCell(2).value).toBe('000123456789');
    expect(ws.getRow(2).getCell(7).value).toBe('0050200012345678');
    expect(ws.getRow(2).getCell(5).value).toBe(58500);
  });

  it('CSV rows are plain text with the names cleaned (no spreadsheet formulas)', async () => {
    const out = await writeBankFile({ ...generic, fileType: 'csv' }, [{ ...row, name: '=cmd|calc!A1, "x"' }], ctx);
    const [, line] = out.data.toString().split('\r\n');
    expect(line).toBe('NEFT,000123456789,HDFC0001234,CMD CALC A1 X,58500.00,31/10/2026,0050200012345678,SALARY 2026 10,EMP 1');
  });

  it('RTGS from the limit; bad accounts, IFSC and amounts are refused', () => {
    expect(bankCells(generic, { ...row, amount: '200000.00' }, ctx)[0]).toBe('RTGS');
    expect(() => bankCells(generic, { ...row, account: '12-34' }, ctx)).toThrow(/account/);
    expect(() => bankCells(generic, { ...row, ifsc: 'HDFC1001234' }, ctx)).toThrow(/IFSC/);
    expect(() => bankCells(generic, { ...row, amount: '0.00' }, ctx)).toThrow(/positive/);
  });

  it('shape checks name what is wrong with a layout', () => {
    expect(bankLayoutProblems({ ...fixed, columns: [{ title: 'N', field: 'name' }] } as never)).toEqual(
      expect.arrayContaining(['Column 1: a fixed-width file gives every column a width', 'A bank format includes the account column']),
    );
    expect(bankLayoutProblems({ ...generic, delimiter: 'a' } as never)).toContain('The delimiter is one character that cannot appear in a value');
  });
});
