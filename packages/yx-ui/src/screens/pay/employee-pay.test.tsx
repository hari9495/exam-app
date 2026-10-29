import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EwaRequestScreen, IncentiveStatementScreen, LoanRequestScreen, MyPayDocumentsScreen, NomineeDrawer, PayBandScreen, PayslipViewerScreen, TaxWorkspaceScreen, payDiff, previewEmi, type LiveEwaRequest, type LiveLoanRequest, type LivePayslips, type LiveTax, type LoanRules, type MyTaxWorkspace } from './employee-pay';
import { DETAIL, MY_PAYSLIPS, PREVIOUS } from './live/fixtures-5j';
import { DECLARATIONS, LOANS } from './live/fixtures-ops';
import { PAY_DOCUMENTS } from './live/fixtures-5ab';

// The employee's designed Pay screens with the live app's data (moved from live/pay-5j-live.test.tsx and
// live/pay-ops-live.test.tsx, plus the new paths): positive and negative cases per page.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const drawer = () => screen.getByRole('dialog');

describe('PAY-21 / PAY-40 · Me › Payslips (live)', () => {
  const live = (over: Partial<LivePayslips> = {}): LivePayslips => ({ state: 'ready', payslips: MY_PAYSLIPS, onOpen: async (id) => (id === 's0' ? PREVIOUS : DETAIL), onPdf: fn(), onQuery: fn(), ...over });

  it('what changed is worked out only from the two payslips, exactly, largest first', () => {
    expect(payDiff(PREVIOUS.lines, DETAIL.lines).map((r) => [r.name, r.before, r.after, r.netEffect])).toEqual([
      ['Special allowance', '13125.00', '15125.00', '2000.00'],
      ['Income tax (TDS)', '2980.00', '3120.00', '-140.00'],
    ]);
    // A line that left the payslip is "not on this payslip"; paise never drift.
    const gone = payDiff([{ ...DETAIL.lines[0], code: 'bonus', name: 'Bonus', amount: '0.10' }, { ...DETAIL.lines[0], code: 'bonus', name: 'Bonus', amount: '0.20' }], []);
    expect(gone).toEqual([expect.objectContaining({ name: 'Bonus', before: '0.30', after: '0.00', netEffect: '-0.30', explanation: 'Not on this payslip.' })]);
  });

  it('shows the latest payslip net first, its lines, reimbursements and the year to date from the payslips', async () => {
    render(<PayslipViewerScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Payslip for September 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Reimbursements' })).toHaveTextContent(/not of gross earnings/);
    expect(screen.getByText('Special allowance')).toBeInTheDocument();
    // Year to date April–September: 60,500 + 58,500 gross, exact.
    expect(screen.getByText('₹1,19,000.00')).toBeInTheDocument();
    expect(screen.getByText(/₹2,140.00 more than August 2026/)).toBeInTheDocument();
  });

  it('why is my pay different: each changed line with its cause from the payslip', async () => {
    render(<PayslipViewerScreen live={live()} />);
    await screen.findByText('Special allowance');
    await ue.click(screen.getByRole('button', { name: 'Why is my pay different?' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('list', { name: 'Changed lines' })).toHaveTextContent('Special allowance');
    expect(within(d).getByText('₹15,125.00 a month, the full month.')).toBeInTheDocument();
    expect(within(d).getByText('August 2026 net')).toBeInTheDocument();
  });

  it('a query: pressed too early the question is required and focused; then sent with the line', async () => {
    const onQuery = fn();
    render(<PayslipViewerScreen live={live({ onQuery })} />);
    await screen.findByText('Special allowance');
    await ue.click(screen.getByRole('button', { name: 'Raise a query' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Send query' }));
    expect(onQuery).not.toHaveBeenCalled();
    expect(within(drawer()).getByText('Write your question (at least 5 letters).')).toBeInTheDocument();
    expect(within(drawer()).getByRole('textbox', { name: /Your question/ })).toHaveFocus();
    await ue.type(within(drawer()).getByRole('textbox', { name: /Your question/ }), 'Why did my TDS go up?');
    await ue.click(within(drawer()).getByRole('button', { name: 'Send query' }));
    await waitFor(() => expect(onQuery).toHaveBeenCalledWith('s1', 'Why did my TDS go up?', undefined));
    expect((await screen.findAllByText('Query sent to payroll. You get the reply in the app.')).length).toBeGreaterThan(0);
  });

  it('no payslips yet, a held salary, and the error state with retry', async () => {
    const { unmount } = render(<PayslipViewerScreen live={live({ payslips: [] })} />);
    expect(screen.getByText('No payslips yet.')).toBeInTheDocument();
    unmount();
    const held = render(<PayslipViewerScreen live={live({ payslips: [{ ...MY_PAYSLIPS[0], paymentStatus: 'held' }] })} />);
    expect(screen.getByText('Your net pay is on hold')).toBeInTheDocument();
    held.unmount();
    const onRetry = vi.fn();
    render(<PayslipViewerScreen live={live({ state: 'error', payslips: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('an off-cycle payslip has no "why different" and the PDF downloads with a toast', async () => {
    const onPdf = fn();
    render(<PayslipViewerScreen live={live({ payslips: [{ ...MY_PAYSLIPS[0], runType: 'offcycle' }, MY_PAYSLIPS[1]], onPdf })} />);
    await screen.findByText('Special allowance');
    expect(screen.queryByRole('button', { name: 'Why is my pay different?' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(onPdf).toHaveBeenCalledWith('s1', '2026-09'));
    expect((await screen.findAllByText('Payslip downloaded')).length).toBeGreaterThan(0);
  });
});

describe('PAY-22 / PAY-41 · Me › Tax (live)', () => {
  const WS: MyTaxWorkspace = { taxYear: '2026-27', regime: 'new', residentialStatus: 'resident', panStatus: 'operative', otherIncome: [], dates: { regimeCutoff: '2099-05-31', proofWindowOpens: '2000-01-01', proofCutoff: '2099-01-31' }, canChooseRegime: true, canDeclare: true, canSendProofs: true };
  const live = (over: Partial<LiveTax> = {}): LiveTax => ({
    state: 'ready',
    tab: 'overview',
    workspace: WS,
    sheet: {
      taxYear: '2026-27',
      month: '2026-09',
      sheet: {
        regime: 'new',
        income: { salary: '726000.00', previousEmployers: '0.00', perquisites: '0.00', other: '18000.00', total: '744000.00' },
        exemptions: { standardDeduction: '75000.00', hra: '0.00', professionalTax: '0.00', previousEmployers: '0.00' },
        deductions: [],
        taxable: '669000.00',
        tax: { slab: '29450.00', rebate: '29450.00', surcharge: '0.00', total: '0.00', noPanApplied: false },
        alreadyDeducted: '0.00',
        remainingPeriods: 7,
        monthTds: '0.00',
        notes: [],
      },
    },
    declarations: DECLARATIONS,
    certificates: [{ id: 'c1', taxYear: '2025-26', form: 'form16', payDocumentId: null }],
    form12b: { taxYear: '2026-27', open: true, closesOn: '2099-01-31', submission: null },
    onCompare: async () => ({ taxYear: '2026-27', current: 'new', lower: 'new', regimes: [{ regime: 'new', taxable: '669000.00', annualTax: '0.00', monthTds: '0.00' }, { regime: 'old', taxable: '626000.00', annualTax: '38220.00', monthTds: '3185.00' }] }),
    onPatch: fn(),
    onDeclare: fn(),
    onProof: fn(),
    onPartA: fn(),
    onForm12b: fn(),
    ...over,
  });

  it('overview: how the monthly tax is worked out, from the tax sheet', () => {
    render(<TaxWorkspaceScreen live={live()} />);
    const how = screen.getByRole('region', { name: 'How your monthly tax is worked out' });
    expect(how).toHaveTextContent('Projected income for the year: ₹7,44,000.00');
    expect(how).toHaveTextContent('other income ₹18,000.00');
    expect(how).toHaveTextContent('7 months left');
  });

  it('before the first payslip, the overview says so', () => {
    render(<TaxWorkspaceScreen live={live({ sheet: { taxYear: '2026-27', sheet: null, message: 'Your tax sheet appears with your first payslip of the tax year.' } })} />);
    expect(screen.getByText('Your tax sheet appears with your first payslip of the tax year.')).toBeInTheDocument();
  });

  it('compare regimes uses the API figures and never picks one', async () => {
    render(<TaxWorkspaceScreen live={live({ tab: 'compare' })} />);
    await ue.click(screen.getByRole('button', { name: 'Compare the two regimes' }));
    const table = await screen.findByRole('table', { name: 'Regimes compared' });
    expect(table).toHaveTextContent('₹38,220.00');
    expect(screen.getByText('Tax is ₹38,220.00 lower under the new regime with your figures.')).toBeInTheDocument();
  });

  it('the regime is a Segment; saving the same regime is refused with a message, the other one is saved', async () => {
    const onPatch = fn();
    render(<TaxWorkspaceScreen live={live({ tab: 'declarations', onPatch })} />);
    await ue.click(screen.getByRole('button', { name: 'Save my regime' }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText(/New regime is already your regime/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Old regime' }));
    await ue.click(screen.getByRole('button', { name: 'Save my regime' }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ regime: 'old' }));
  });

  it('after the cut-off the regime is locked and only payroll changes it', () => {
    render(<TaxWorkspaceScreen live={live({ tab: 'declarations', workspace: { ...WS, canChooseRegime: false, dates: { regimeCutoff: '2026-05-31' } } })} />);
    expect(screen.getByText(/New regime, locked on 31 May 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save my regime' })).not.toBeInTheDocument();
  });

  it('declare rent: it asks for the months and the city and sends the monthly rent', async () => {
    const onDeclare = fn();
    render(<TaxWorkspaceScreen live={live({ tab: 'declarations', declarations: { ...DECLARATIONS, lines: [DECLARATIONS.lines[1]] }, onDeclare })} />);
    await ue.click(screen.getByRole('button', { name: 'Add declaration' }));
    await ue.click(within(drawer()).getByRole('combobox', { name: /What/ }));
    await ue.click(await screen.findByRole('option', { name: 'Rent paid (HRA)' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /Rent a month/ }), '18000');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save declaration' }));
    expect(onDeclare).not.toHaveBeenCalled();
    expect(within(drawer()).getByLabelText(/Rent paid from/)).toHaveFocus();
    await ue.type(within(drawer()).getByLabelText(/Rent paid from/), '2026-04');
    await ue.type(within(drawer()).getByLabelText(/Rent paid to/), '2027-03');
    await ue.click(within(drawer()).getByRole('radio', { name: /Delhi, Mumbai/ }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save declaration' }));
    await waitFor(() => expect(onDeclare).toHaveBeenCalledWith({ subjectKey: 'hra', amount: '18000', rentFrom: '2026-04', rentTo: '2027-03', metro: true }));
  });

  it('proofs: in the old regime a turned-down proof shows payroll’s reason; before the window there is no upload', () => {
    const { unmount } = render(<TaxWorkspaceScreen live={live({ tab: 'proofs', workspace: { ...WS, regime: 'old' } })} />);
    expect(screen.getByText(/Payroll: The ELSS statement is for last year/)).toBeInTheDocument();
    expect(screen.getAllByText(/Drag|browse/i).length).toBeGreaterThan(0);
    unmount();
    render(<TaxWorkspaceScreen live={live({ tab: 'proofs', workspace: { ...WS, regime: 'old', canSendProofs: false }, declarations: { ...DECLARATIONS, proofWindowOpens: '2099-01-01' } })} />);
    expect(screen.getByText(/Proofs open on 1 Jan 2099/)).toBeInTheDocument();
    expect(screen.queryByText(/Drag|browse/i)).not.toBeInTheDocument();
  });

  it('Form 12B: pressed too early every missing field shows; tax above salary is refused; then sent with the PDF', async () => {
    const onForm12b = fn();
    render(<TaxWorkspaceScreen live={live({ tab: 'previous', onForm12b })} />);
    await ue.click(screen.getByRole('button', { name: 'Send to payroll' }));
    expect(onForm12b).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter the previous employer's TAN/)).toBeInTheDocument();
    expect(screen.getByText('Attach your Form 12B as a PDF.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Their TAN/ })).toHaveFocus();
    await ue.type(screen.getByRole('textbox', { name: /Their TAN/ }), 'blra12345b');
    await ue.type(screen.getByRole('textbox', { name: /Salary from previous employer/ }), '300000');
    await ue.type(screen.getByRole('textbox', { name: /Tax deducted by previous employer/ }), '300000.01');
    const pdf = new File(['%PDF-1.4'], 'form12b.pdf', { type: 'application/pdf' });
    await ue.upload(screen.getByLabelText(/Form 12B from previous employer/, { selector: 'input' }), pdf);
    await ue.click(screen.getByRole('button', { name: 'Send to payroll' }));
    expect(onForm12b).not.toHaveBeenCalled();
    expect(screen.getByText('The tax deducted cannot be more than the gross salary.')).toBeInTheDocument();
    await ue.clear(screen.getByRole('textbox', { name: /Tax deducted by previous employer/ }));
    await ue.type(screen.getByRole('textbox', { name: /Tax deducted by previous employer/ }), '12000');
    await ue.click(screen.getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onForm12b).toHaveBeenCalledWith({ employerTan: 'BLRA12345B', gross: '300000', tds: '12000' }, pdf));
  });

  it('Form 12B: once payroll accepted it, it is read-only; a turned-down one shows why', () => {
    const sub = { id: 'f1', employerName: 'Old Co', employerTan: 'BLRA12345B', gross: '300000.00', exemptions: '0.00', tds: '12000.00', status: 'approved' as const, comment: null, file: { name: 'f.pdf', size: 10, at: '2026-10-01T10:00:00Z' }, submittedAt: '2026-10-01T10:00:00Z', verifiedAt: '2026-10-02T10:00:00Z' };
    const { unmount } = render(<TaxWorkspaceScreen live={live({ tab: 'previous', form12b: { taxYear: '2026-27', open: true, closesOn: '2099-01-31', submission: sub } })} />);
    expect(screen.getByText('Checked: counted in your tax')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
    unmount();
    render(<TaxWorkspaceScreen live={live({ tab: 'previous', form12b: { taxYear: '2026-27', open: true, closesOn: '2099-01-31', submission: { ...sub, status: 'rejected', comment: 'The form is not signed.' } } })} />);
    expect(screen.getByText(/Payroll: The form is not signed./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();
  });

  it('residential status and other income save through the workspace', async () => {
    const onPatch = fn();
    render(<TaxWorkspaceScreen live={live({ tab: 'residential', onPatch })} />);
    await ue.click(screen.getByRole('button', { name: 'Save residential status' }));
    expect(onPatch).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'Non-resident' }));
    await ue.click(screen.getByRole('button', { name: 'Save residential status' }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ residentialStatus: 'non_resident' }));
  });

  it('an inoperative PAN is shown, and the Part A downloads from the header', async () => {
    const onPartA = fn();
    render(<TaxWorkspaceScreen live={live({ workspace: { ...WS, panStatus: 'inoperative' }, onPartA })} />);
    expect(screen.getByText('Your PAN is inoperative')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download Part A of Form 16 for 2025-26' }));
    await waitFor(() => expect(onPartA).toHaveBeenCalled());
  });

  it('no access and loading states', () => {
    const { unmount } = render(<TaxWorkspaceScreen live={live({ state: 'no-access', workspace: null })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
    unmount();
    render(<TaxWorkspaceScreen live={live({ state: 'loading', workspace: null })} />);
    expect(screen.getByRole('status', { name: 'Loading your tax workspace' })).toBeInTheDocument();
  });
});

describe('PAY-18 · Me › Loans and advances (live, founder decision 8)', () => {
  const RULES: LoanRules = { eligible: true, reason: null, probationEndsOn: null, monthlyGross: '40000.00', maxGrossMonths: 2, limit: '80000.00', outstanding: '5000.00', available: '75000.00' };
  const live = (over: Partial<LiveLoanRequest> = {}): LiveLoanRequest => ({ state: 'ready', loans: LOANS, rules: RULES, onRequest: fn(), ...over });

  it('the instalment preview is exact for an interest-free advance (rounded up to the rupee, as the API)', () => {
    expect(previewEmi('10000', '', 3)).toEqual({ emi: '3334.00', exact: true });
    expect(previewEmi('12000', '', 4)).toEqual({ emi: '3000.00', exact: true });
    expect(previewEmi('100000', '12', 12).exact).toBe(false);
  });

  it('shows only my loans and the company limit, then sends a request within it', async () => {
    const onRequest = fn();
    render(<LoanRequestScreen live={live({ onRequest })} />);
    expect(within(screen.getByRole('table', { name: 'My loans and advances' })).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText("Company limit (2 months' gross pay)")).toBeInTheDocument();
    expect(screen.getAllByText('₹75,000.00').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '75000');
    await ue.type(screen.getByRole('textbox', { name: /Number of instalments/ }), '5');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Medical bills');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ loanType: 'advance', principal: '75000', instalments: 5, reason: 'Medical bills' })));
    expect((onRequest.mock.calls[0] as unknown[])[0]).not.toHaveProperty('employeeId');
  });

  it('over the limit: refused before sending, with the reason; pressed too early the amount takes focus', async () => {
    const onRequest = fn();
    render(<LoanRequestScreen live={live({ onRequest })} />);
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveFocus();
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '75000.01');
    await ue.type(screen.getByRole('textbox', { name: /Number of instalments/ }), '5');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Medical bills');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter ₹75,000.00 or less/)).toBeInTheDocument();
    expect(screen.getByText('Over the limit')).toBeInTheDocument();
  });

  it('a refusal from the server is shown in plain words', async () => {
    const onRequest = vi.fn(async () => Promise.reject(new Error("The most you can ask for is ₹70,000.00: 2 months' gross pay, less ₹10,000.00 still to repay.")));
    render(<LoanRequestScreen live={live({ onRequest })} />);
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '72000');
    await ue.type(screen.getByRole('textbox', { name: /Number of instalments/ }), '6');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'School fees');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/The most you can ask for is ₹70,000.00/)).toBeInTheDocument();
  });

  it('founder answer 1: no interest field; the company rate per type is shown, used for the preview and never sent', async () => {
    const onRequest = fn();
    render(<LoanRequestScreen live={live({ onRequest, rules: { ...RULES, interestRate: { advance: '0', loan: '8.5' } } })} />);
    expect(screen.queryByRole('textbox', { name: /Interest/ })).not.toBeInTheDocument();
    expect(screen.getByText('Interest-free')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Personal loan' }));
    expect(screen.getByText('8.5% a year')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Interest/ })).not.toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '60000');
    await ue.type(screen.getByRole('textbox', { name: /Number of instalments/ }), '12');
    expect(screen.getByText('Instalment (about)')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'House repairs');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalled());
    expect((onRequest.mock.calls[0] as unknown[])[0]).not.toHaveProperty('interestRate');
  });

  it('on probation: no form, the reason and the day probation ends', () => {
    render(<LoanRequestScreen live={live({ rules: { ...RULES, eligible: false, reason: 'You can ask for a loan or advance after your probation is confirmed. Your probation ends on 14 Dec 2026.', probationEndsOn: '2026-12-14' } })} />);
    expect(screen.getByText(/after your probation is confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Your probation ends on 14 Dec 2026. The company allows/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });
});

describe('PAY-26 · Me › Get paid early (live)', () => {
  const DATA = { open: true, reasons: [], policy: { minAmount: '500.00', maxAmount: '20000.00', fee: '49.00', feePayer: 'employee' as const, drawsPerMonth: 3 }, quote: { expectedNet: '30000.00', payableDays: '12.00', monthDays: 30, drawn: '0.00', deductionsDue: '0.00', earned: '12000.00', available: '6000.00' }, draws: [] };
  const live = (over: Partial<LiveEwaRequest> = {}): LiveEwaRequest => ({ state: 'ready', data: DATA, onDraw: fn(), ...over });

  it('a draw stays within what is available and needs the recovery accepted, with the exact amount taken back', async () => {
    const onDraw = fn();
    render(<EwaRequestScreen live={live({ onDraw })} />);
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '7000');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter ₹6,000.00 or less.')).toBeInTheDocument();
    await ue.clear(screen.getByRole('textbox', { name: /Amount/ }));
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '5000');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Get ₹5,000.00' }));
    expect(onDraw).not.toHaveBeenCalled();
    expect(screen.getByText('Tick the box to accept the fee and the recovery.')).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: /₹5,049.00 is taken from this month's pay/ }));
    await ue.click(screen.getByRole('button', { name: 'Get ₹5,000.00' }));
    await waitFor(() => expect(onDraw).toHaveBeenCalledWith('5000'));
  });

  it('not open: the reasons; and the error state', () => {
    const { unmount } = render(<EwaRequestScreen live={live({ data: { ...DATA, open: false, reasons: ['Draws close 3 days before the payroll cut-off.'] } })} />);
    expect(screen.getByText('Draws close 3 days before the payroll cut-off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    unmount();
    render(<EwaRequestScreen live={live({ state: 'error', data: null })} />);
    expect(screen.getByText("We couldn't load earned wage access.")).toBeInTheDocument();
  });
});

describe('PAY-33 · Me › My incentives (live)', () => {
  it('results with what went to payroll and clawbacks, exact totals', () => {
    render(
      <IncentiveStatementScreen
        live={{
          state: 'ready',
          data: {
            results: [
              { id: 'r1', plan: 'South sales 2026-27', month: '2026-09', quota: '100000.00', actual: '120000.00', amount: '26000.10', sentToPayroll: true, workings: { attainment: '120.00' } },
              { id: 'r2', plan: 'South sales 2026-27', month: '2026-10', quota: '100000.00', actual: '90000.00', amount: '9000.20', sentToPayroll: false, workings: { attainment: '90.00' } },
            ],
            clawbacks: [{ id: 'k1', month: '2026-10', amount: '2000.00', reason: 'Order 4471 cancelled within 90 days' }],
          },
        }}
      />,
    );
    expect(screen.getByText('₹35,000.30')).toBeInTheDocument();
    expect(screen.getByText('Clawback: ₹2,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹9,000.20', { selector: 'dd, dd *' })).toBeInTheDocument();
  });

  it('not on a plan: the empty state; loading has a status', () => {
    const { unmount } = render(<IncentiveStatementScreen live={{ state: 'ready', data: { results: [], clawbacks: [] } }} />);
    expect(screen.getByText('No incentive results yet.')).toBeInTheDocument();
    unmount();
    render(<IncentiveStatementScreen live={{ state: 'loading', data: null }} />);
    expect(screen.getByRole('status', { name: 'Loading your incentives' })).toBeInTheDocument();
  });
});

describe('PAY-39 · My pay band (live)', () => {
  it('says where I sit, or that there is no range, or that bands are not shared', () => {
    const { rerender } = render(<PayBandScreen live={{ state: 'ready', band: { visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'within', quartile: 3 } }} />);
    expect(screen.getByText('You are within the range, in quarter 3 of 4.')).toBeInTheDocument();
    rerender(<PayBandScreen live={{ state: 'ready', band: { visible: true, range: null } }} />);
    expect(screen.getByText('No range is set for your grade yet.')).toBeInTheDocument();
    rerender(<PayBandScreen live={{ state: 'ready', band: { visible: false } }} />);
    expect(screen.getByText("Your company doesn't share pay bands.")).toBeInTheDocument();
  });

  it('error with retry', async () => {
    const onRetry = vi.fn();
    render(<PayBandScreen live={{ state: 'error', onRetry, band: null }} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('PAY-54 · My pay documents and the nominee drawer', () => {
  const MINE = PAY_DOCUMENTS.documents.filter((x) => x.employeeId === 'e-arjun').map(({ person: _p, ...x }) => x);

  it('lists my documents with their verify codes; a deleted one cannot be downloaded; a refused download says why', async () => {
    const onDownload = vi.fn(async () => Promise.reject(new Error('Your session ended. Sign in again to download.')));
    render(<MyPayDocumentsScreen live={{ state: 'ready', data: [{ ...MINE[0]!, purged: true }, ...MINE.slice(1)], onDownload, verifyUrl: (c) => `/yx/verify/${c}` }} />);
    expect(screen.getByText('Deleted after its retention period')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: /^Download/ })[0]!);
    expect(await screen.findByText('Your session ended. Sign in again to download.')).toBeInTheDocument();
  });

  it('none yet', () => {
    render(<MyPayDocumentsScreen live={{ state: 'ready', data: [], onDownload: fn(), verifyUrl: (c) => c }} />);
    expect(screen.getByText('No pay documents yet.')).toBeInTheDocument();
  });

  it('nominee: whose documents, an email and a day after today', async () => {
    const onSave = fn();
    render(<NomineeDrawer onSearch={async () => [{ id: 'p1', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' }]} onClose={vi.fn()} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose whose documents.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: /Arjun Kulkarni/ }));
    await ue.type(screen.getByRole('textbox', { name: /Nominee's name/ }), 'Lakshmi Kulkarni');
    await ue.type(screen.getByRole('textbox', { name: /Nominee's email/ }), 'lakshmi@example');
    await ue.type(screen.getByLabelText(/Access until/), '2099-12-31');
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Nominee's email/ }), '.com');
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ employeeId: 'p1', name: 'Lakshmi Kulkarni', email: 'lakshmi@example.com', validUntil: '2099-12-31' }));
  });
});
