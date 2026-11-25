import { expectNamesIn, INDIC_NAMES } from '../../test/fixtures/indic-names';
import { LABELS } from '../documents/payslip-languages';
import { payslipValues, renderPayslipPdf, type SlipData } from './payslip-pdf';

const slip: SlipData = {
  employerName: 'Pay Mills',
  employeeName: 'Asha Rao',
  employeeCode: 'E-1',
  designation: 'Analyst',
  month: '2026-10',
  gross: '60500.00',
  deductions: '2000.00',
  net: '58500.00',
  bankLast4: '6789',
  resultHash: 'a'.repeat(64),
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', amount: '24200.00', quantity: '31.00' },
    { code: 'hra', name: 'HRA', kind: 'earning', amount: '12100.00', quantity: null },
    { code: 'special', name: 'Special', kind: 'earning', amount: '24200.00', quantity: null },
    { code: 'pf_employee', name: 'PF', kind: 'deduction', amount: '1800.00', quantity: null },
    { code: 'pt', name: 'PT', kind: 'deduction', amount: '200.00', quantity: null },
    { code: 'pf_employer', name: 'PF (employer)', kind: 'employer', amount: '1800.00', quantity: null },
    { code: 'zero', name: 'Nothing', kind: 'earning', amount: '0.00', quantity: null },
  ],
};

describe('payslip PDF (PAY-4.04)', () => {
  it('takes every figure from the stored lines (employer costs and zero lines are not on the slip)', () => {
    expect(payslipValues(slip)).toMatchObject({
      period: 'October 2026',
      paidDays: '31',
      earnings: 'Basic 24,200.00 · HRA 12,100.00 · Special 24,200.00',
      deductions: 'PF 1,800.00 · PT 200.00',
      grossPay: '60,500.00',
      netPay: '58,500.00',
      bankAccount: '•••• 6789',
    });
  });

  it('PPL-46: a split pay shows each account (masked) with what it gets, instead of the one account', () => {
    const v = payslipValues({ ...slip, bankSplit: [{ label: 'Salary account', last4: '6789', amount: '1000.00' }, { label: 'Account abroad', last4: '3456', amount: '24500.50' }] });
    expect(v.bankAccount).toBe('Salary account •••• 6789 1,000.00 · Account abroad •••• 3456 24,500.50');
    expect(payslipValues({ ...slip, bankSplit: [] }).bankAccount).toBe('•••• 6789');
  });

  it('M05 D3: reimbursements have their own line, apart from earnings', () => {
    const v = payslipValues({ ...slip, net: '59500.00', lines: [...slip.lines, { code: 'exp_reimb', name: 'Expense reimbursement', kind: 'reimbursement', amount: '1000.00', quantity: null }] });
    expect(v.reimbursements).toBe('Expense reimbursement 1,000.00');
    expect(v.earnings).toBe('Basic 24,200.00 · HRA 12,100.00 · Special 24,200.00');
    expect(payslipValues(slip).reimbursements).toBe('—');
  });

  it('renders a PDF that names the result hash; an emailed copy is encrypted', async () => {
    const blocks = [{ key: 'netPay', shown: true }];
    const plain = await renderPayslipPdf(blocks, { netPay: 'Net wages paid' }, null, payslipValues(slip), {
      title: 'Payslip 2026-10',
      keywords: `result:${slip.resultHash}`,
      watermark: 'Asha · 2026-11-01 10:00 IST',
    });
    expect(plain.subarray(0, 5).toString()).toBe('%PDF-');
    expect(plain.toString('latin1')).toContain(`result:${slip.resultHash}`);
    expect(plain.toString('latin1')).not.toContain('/Encrypt');
    const locked = await renderPayslipPdf(blocks, {}, null, payslipValues(slip), { title: 'Payslip', password: '01011990' });
    expect(locked.toString('latin1')).toContain('/Encrypt');
    expect(locked.toString('latin1')).toContain('/CFM /AESV3');
  });

  it('names in every Indian script print on the payslip, with or without a regional language (and in the watermark)', async () => {
    const blocks = ['employerName', 'employeeName', 'designation', 'netPay'].map((key) => ({ key, shown: true }));
    for (const [key, name] of Object.entries(INDIC_NAMES)) {
      const values = { ...payslipValues(slip), employerName: `${name} Pvt Ltd`, employeeName: name, designation: `Analyst ${name}` };
      for (const local of [null, 'ta', 'hi'] as const) {
        const pdf = await renderPayslipPdf(blocks, {}, local, values, { title: key, watermark: `${name} · 2026-11-01 10:00 IST` });
        expectNamesIn(pdf, [name, ...(local ? [LABELS[local].employeeName] : [])]);
        expect(pdf.length).toBeLessThan(40_000); // only the glyphs used are embedded
      }
    }
  });
});
