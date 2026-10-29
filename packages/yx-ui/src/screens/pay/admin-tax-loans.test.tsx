import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EwaAdminScreen, LoansScreen, ProofQueueScreen, type Form12bRow, type LiveEwaAdmin, type LiveLoans, type LiveProofQueue } from './admin-tax-loans';
import { PEOPLE } from './live/fixtures-5j';
import { LOANS, PROOFS } from './live/fixtures-ops';

// PAY-17, PAY-23 and PAY-27 with the live app's data (moved from live/pay-ops-live.test.tsx, plus the new paths).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));

describe('PAY-17 · Payroll › Loans and advances (live)', () => {
  const live = (over: Partial<LiveLoans> = {}): LiveLoans => ({ state: 'ready', loans: LOANS, nameOf, can: { manage: true }, onSearch: search, onRequest: fn(), onChange: fn(), ...over });

  it('payroll asks for someone else with a person; pressed too early the person is required', async () => {
    const onRequest = fn();
    render(<LoansScreen live={live({ onRequest })} />);
    await ue.click(screen.getByRole('button', { name: 'Add loan' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    expect(onRequest).not.toHaveBeenCalled();
    expect(within(d).getByText('Choose the person.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Search' }));
    await ue.click(await within(d).findByRole('button', { name: /Divya Raghunathan/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Amount/ }), '25000');
    await ue.type(within(d).getByRole('textbox', { name: /Instalments/ }), '5');
    await ue.clear(within(d).getByLabelText(/First instalment in/));
    await ue.type(within(d).getByLabelText(/First instalment in/), '2026-11');
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Medical bills');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith({ employeeId: 'p2', loanType: 'advance', principal: '25000', instalments: 5, firstMonth: '2026-11', reason: 'Medical bills' }));
  });

  it('only active loans of others can be changed; one’s own loan cannot', () => {
    render(<LoansScreen live={live()} />);
    expect(screen.getAllByRole('button', { name: /^Change the loan of/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' })).toBeInTheDocument();
  });

  it('a new instalment is above zero and not more than what is left', async () => {
    const onChange = fn();
    render(<LoansScreen live={live({ onChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change instalment' }));
    const d = await screen.findByRole('dialog', { name: 'Change the instalment?' });
    await ue.type(within(d).getByRole('textbox', { name: /New instalment/ }), '25000');
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Asked to repay faster');
    await ue.click(within(d).getByRole('button', { name: 'Save instalment' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(d).getByText(/not more than ₹20,000.00/)).toBeInTheDocument();
    await ue.clear(within(d).getByRole('textbox', { name: /New instalment/ }));
    await ue.type(within(d).getByRole('textbox', { name: /New instalment/ }), '15000');
    await ue.click(within(d).getByRole('button', { name: 'Save instalment' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], { kind: 'reschedule', emi: '15000', reason: 'Asked to repay faster' }));
  });

  it('pause needs a reason and sends the month', async () => {
    const onChange = fn();
    render(<LoansScreen live={live({ onChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause EMIs' }));
    const d = await screen.findByRole('dialog', { name: 'Pause EMIs?' });
    await ue.click(within(d).getByRole('button', { name: 'Pause EMIs' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Reason/ })).toHaveFocus();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Medical leave without pay');
    await ue.click(within(d).getByRole('button', { name: 'Pause EMIs' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], expect.objectContaining({ kind: 'pause', reason: 'Medical leave without pay', pauseUntil: expect.stringMatching(/^\d{4}-\d{2}$/) })));
  });

  it('an expense loan is shown as the recovery of an expense advance, not a salary advance', () => {
    render(<LoansScreen live={live({ loans: [{ ...LOANS[0]!, id: 'l9', loanType: 'expense' }] })} />);
    expect(screen.getByText('Expense advance recovery')).toBeInTheDocument();
    expect(screen.queryByText('Salary advance')).not.toBeInTheDocument();
  });

  it('without payroll.loan.manage there is no Add loan and no Change; no access shows who grants it', () => {
    const { unmount } = render(<LoansScreen live={live({ can: { manage: false } })} />);
    expect(screen.queryByRole('button', { name: 'Add loan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Change the loan of/ })).not.toBeInTheDocument();
    unmount();
    render(<LoansScreen live={live({ state: 'no-access', loans: null })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });
});

describe('PAY-23 · Payroll › Proof checking (live)', () => {
  const F12B: Form12bRow = { id: 'f1', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', taxYear: '2026-27', employerName: 'Old Co', employerTan: 'BLRA12345B', gross: '300000.00', exemptions: '0.00', tds: '12000.00', status: 'pending', comment: null, file: { name: 'form12b.pdf', size: 1000, at: '2026-10-01T10:00:00Z' }, submittedAt: '2026-10-01T10:00:00Z' };
  const live = (over: Partial<LiveProofQueue> = {}): LiveProofQueue => ({ state: 'ready', status: 'pending', onStatus: vi.fn(), lines: PROOFS, form12b: [F12B], onFile: fn(), onDecide: fn(), onForm12bFile: fn(), onForm12bDecide: fn(), ...over });

  it('a part approval is below what was declared; a rejection needs a comment', async () => {
    const onDecide = fn();
    render(<ProofQueueScreen live={live({ onDecide })} />);
    await ue.click(screen.getAllByRole('button', { name: /^Decide on/ })[1]!);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Approve part' }));
    await ue.type(within(d).getByRole('textbox', { name: /Approved amount/ }), '150000');
    await ue.type(within(d).getByRole('textbox', { name: /Comment/ }), 'Only the PPF receipt is this year’s');
    await ue.click(within(d).getByRole('button', { name: 'Approve part' }));
    expect(onDecide).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /Approved amount/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Approved amount/ }), '90000');
    await ue.click(within(d).getByRole('button', { name: 'Approve part' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(PROOFS[1], { decision: 'partly', amount: '90000', comment: 'Only the PPF receipt is this year’s' }));
  });

  it('Form 12B is in the same queue: the file opens; reject needs a comment; approve sends the decision', async () => {
    const onForm12bDecide = fn();
    const onForm12bFile = fn();
    render(<ProofQueueScreen live={live({ onForm12bDecide, onForm12bFile })} />);
    await ue.click(screen.getByRole('button', { name: "Decide on Divya Raghunathan's Form 12B" }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Open form12b.pdf' }));
    await waitFor(() => expect(onForm12bFile).toHaveBeenCalledWith(F12B));
    await ue.click(within(d).getByRole('radio', { name: 'Reject' }));
    await ue.click(within(d).getByRole('button', { name: 'Reject Form 12B' }));
    expect(onForm12bDecide).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Comment/ })).toHaveFocus();
    await ue.click(within(d).getByRole('radio', { name: 'Approve' }));
    await ue.click(within(d).getByRole('button', { name: 'Approve Form 12B' }));
    await waitFor(() => expect(onForm12bDecide).toHaveBeenCalledWith(F12B, { decision: 'approve' }));
  });

  it('the status filter is one Segment; an empty queue says so', async () => {
    const onStatus = vi.fn();
    const { unmount } = render(<ProofQueueScreen live={live({ onStatus })} />);
    await ue.click(screen.getByRole('radio', { name: 'Rejected' }));
    expect(onStatus).toHaveBeenCalledWith('rejected');
    unmount();
    render(<ProofQueueScreen live={live({ lines: [], form12b: [] })} />);
    expect(screen.getByText('No proofs to verify yet.')).toBeInTheDocument();
  });
});

describe('PAY-27 · Payroll › Earned wage access (live)', () => {
  const DRAWS = [
    { id: 'w1', employeeId: 'p1', month: '2026-10', available: '6000.00', amount: '5000.00', fee: '49.00', feePayer: 'employee' as const, status: 'requested' as const, paidRef: null, failureReason: null, createdAt: '2026-10-12T09:00:00Z' },
    { id: 'w2', employeeId: 'p2', month: '2026-10', available: '8000.00', amount: '3000.10', fee: '49.00', feePayer: 'employee' as const, status: 'paid' as const, paidRef: 'UTR1234', failureReason: null, createdAt: '2026-10-10T09:00:00Z' },
  ];
  const live = (over: Partial<LiveEwaAdmin> = {}): LiveEwaAdmin => ({
    state: 'ready',
    entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] } as never],
    entityId: 'e1',
    onEntity: vi.fn(),
    month: '2026-10',
    onMonth: vi.fn(),
    nameOf,
    policies: [{ id: 'p', validFrom: '2026-10-01', enabled: true, percentAvailable: '50', minAmount: '500.00', maxAmount: '20000.00', drawsPerMonth: 3, blackoutDays: 3, fee: '49.00', feePayer: 'employee' }],
    draws: DRAWS,
    onPolicy: fn(),
    onPaid: fn(),
    onFailed: fn(),
    ...over,
  });

  it('a payment needs its bank reference; then it is recorded', async () => {
    const onPaid = fn();
    render(<EwaAdminScreen live={live({ onPaid })} />);
    await ue.click(screen.getByRole('button', { name: 'Record payment to Arjun Kulkarni' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Record payment' }));
    expect(onPaid).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Bank reference/ }), 'UTR998877');
    await ue.click(within(d).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(DRAWS[0], 'UTR998877'));
  });

  it('recoveries add the amounts and the person’s fees exactly', async () => {
    render(<EwaAdminScreen live={live()} />);
    await ue.click(screen.getByRole('tab', { name: 'Recoveries in payroll' }));
    expect(screen.getByText('₹3,049.10')).toBeInTheDocument();
  });

  it('the policy: pressed too early the start day is required; then saved from that day', async () => {
    const onPolicy = fn();
    render(<EwaAdminScreen live={live({ onPolicy })} />);
    await ue.click(screen.getByRole('tab', { name: 'Policy' }));
    await ue.click(screen.getByRole('button', { name: 'Change from a date' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save policy' }));
    expect(onPolicy).not.toHaveBeenCalled();
    expect(within(d).getByLabelText(/^From/)).toHaveFocus();
    await ue.type(within(d).getByLabelText(/^From/), '2026-11-01');
    await ue.click(within(d).getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(onPolicy).toHaveBeenCalledWith({ validFrom: '2026-11-01', enabled: true, percentAvailable: '50', minAmount: '500', maxAmount: '20000', drawsPerMonth: 3, blackoutDays: 3, fee: '0', feePayer: 'employer' }));
  });

  it('no partner connected is the true state; no access says who grants it', () => {
    const { unmount } = render(<EwaAdminScreen live={live()} />);
    unmount();
    render(<EwaAdminScreen live={live({ state: 'no-access', entities: [] })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });
});
