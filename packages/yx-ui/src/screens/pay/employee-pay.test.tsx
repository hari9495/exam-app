import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayslipViewerScreen, TaxWorkspaceScreen, payDiff, type LivePayslips, type LiveTax, type MyTaxWorkspace } from './employee-pay';
import { DETAIL, MY_PAYSLIPS, PREVIOUS } from './live/fixtures-5j';
import { DECLARATIONS } from './live/fixtures-ops';

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
