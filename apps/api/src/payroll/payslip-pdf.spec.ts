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
});
