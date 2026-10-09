// The India starter library (M03-BUILD-DESIGN §7.1, PAY-2.07) and the starter template (§7.3): a company installs them
// once and edits names, flags and formulas. Wage flags decide the statutory bases, never names (YX-PAY-17); statutory
// components belong to the pack (their amounts come only from the evaluator). No legal figure here: the formulas call
// the statutory functions, and the split of the CTC is the company's choice, shown as editable starter text.

type Flags = Partial<Record<'taxable' | 'pfWage' | 'esiWage' | 'ptWage' | 'gratuityWage' | 'bonusWage' | 'codeWagePart' | 'codeExclusion' | 'prorated' | 'onPayslip' | 'inCtc', boolean>>;
export interface StarterComponent extends Flags {
  code: string;
  name: string;
  kind: 'earning' | 'deduction' | 'employer' | 'reimbursement' | 'info';
  statutory?: string;
  rounding?: 'none' | 'rupee' | 'up_rupee';
}

const wage: Flags = { pfWage: true, esiWage: true, ptWage: true, gratuityWage: true, bonusWage: true, codeWagePart: true };
const allowance: Flags = { esiWage: true, ptWage: true, codeExclusion: true };

export const STARTER_COMPONENTS: StarterComponent[] = [
  { code: 'basic', name: 'Basic', kind: 'earning', ...wage },
  { code: 'da', name: 'Dearness allowance', kind: 'earning', ...wage },
  { code: 'hra', name: 'House rent allowance', kind: 'earning', ...allowance },
  { code: 'conveyance', name: 'Conveyance allowance', kind: 'earning', ...allowance },
  { code: 'special', name: 'Special allowance', kind: 'earning', esiWage: true, ptWage: true, codeWagePart: true },
  { code: 'lta', name: 'Leave travel allowance', kind: 'earning', ptWage: true, codeExclusion: true },
  { code: 'bonus', name: 'Bonus', kind: 'earning', esiWage: false, ptWage: true, codeExclusion: true, prorated: false, inCtc: false },
  { code: 'ot', name: 'Overtime', kind: 'earning', esiWage: true, ptWage: true, codeExclusion: true, prorated: false, inCtc: false },
  { code: 'arrears', name: 'Arrears', kind: 'earning', esiWage: true, ptWage: true, prorated: false, inCtc: false },
  { code: 'pf_employee', name: 'Provident fund (employee)', kind: 'deduction', statutory: 'pf_employee', taxable: false, prorated: false },
  { code: 'vpf', name: 'Voluntary provident fund', kind: 'deduction', taxable: false, prorated: false },
  { code: 'esi_employee', name: 'ESI (employee)', kind: 'deduction', statutory: 'esi_employee', taxable: false, prorated: false, rounding: 'up_rupee' },
  { code: 'pt', name: 'Professional tax', kind: 'deduction', statutory: 'pt', taxable: false, prorated: false },
  { code: 'lwf_employee', name: 'Labour welfare fund (employee)', kind: 'deduction', statutory: 'lwf_employee', taxable: false, prorated: false, rounding: 'none' },
  { code: 'tds', name: 'Income tax (TDS)', kind: 'deduction', statutory: 'tds', taxable: false, prorated: false },
  { code: 'loan_emi', name: 'Loan instalment', kind: 'deduction', taxable: false, prorated: false },
  { code: 'advance_recovery', name: 'Salary advance recovery', kind: 'deduction', taxable: false, prorated: false },
  { code: 'court_attachment', name: 'Court attachment', kind: 'deduction', taxable: false, prorated: false },
  { code: 'ewa_recovery', name: 'Earned wage access recovery', kind: 'deduction', taxable: false, prorated: false },
  { code: 'pf_employer', name: 'Provident fund (employer)', kind: 'employer', statutory: 'pf_employer', taxable: false, prorated: false, onPayslip: true },
  { code: 'esi_employer', name: 'ESI (employer)', kind: 'employer', statutory: 'esi_employer', taxable: false, prorated: false, rounding: 'up_rupee' },
  { code: 'lwf_employer', name: 'Labour welfare fund (employer)', kind: 'employer', statutory: 'lwf_employer', taxable: false, prorated: false, rounding: 'none', inCtc: false },
  { code: 'gratuity_provision', name: 'Gratuity provision', kind: 'employer', statutory: 'gratuity_provision', taxable: false, prorated: false, onPayslip: false, inCtc: false, rounding: 'none' },
  { code: 'bonus_provision', name: 'Statutory bonus provision', kind: 'employer', statutory: 'bonus_provision', taxable: false, prorated: false, onPayslip: false, inCtc: false, rounding: 'none' },
];

/** The starter template: an editable split of the CTC; Special allowance balances it. */
export const STARTER_TEMPLATE = {
  name: 'Standard monthly (India starter)',
  balancing: 'special',
  lines: [
    { code: 'basic', formula: 'round(monthly_ctc * 0.4)' },
    { code: 'hra', formula: 'round(basic * 0.5)' },
    { code: 'conveyance', formula: 'min(1600, round(monthly_ctc * 0.05))' },
    { code: 'special', formula: '0' },
    { code: 'pf_employee', formula: 'pf_employee()' },
    { code: 'esi_employee', formula: 'esi_employee()' },
    { code: 'pt', formula: 'pt()' },
    { code: 'pf_employer', formula: 'pf_employer()' },
    { code: 'esi_employer', formula: 'esi_employer()' },
    { code: 'gratuity_provision', formula: 'gratuity_provision()' },
  ],
};
