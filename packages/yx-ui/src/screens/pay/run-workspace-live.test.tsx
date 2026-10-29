import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunWorkspaceScreen } from './payroll-run';
import { explained, type LiveRunWorkspaceData } from './run-workspace-live';
import { BANK_FILES, DETAIL, PAYSLIPS, PEOPLE, READINESS, RUN, VARIANCES } from './live/fixtures-5j';

// The designed PAY-03 run workspace (with PAY-02 checks, PAY-07, PAY-08, PAY-09) on one live run: what
// /yx/payroll/runs/[id] must do. Ported from the old PayRunScreen tests, with the negative paths.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const APPROVER = { canDecide: true, phrase: 'APPROVE KFPL 2026-09', step: 1, steps: 2 };
const live = (over: Partial<LiveRunWorkspaceData> = {}): LiveRunWorkspaceData => ({
  state: 'ready',
  onRetry: vi.fn(),
  run: RUN,
  people: PEOPLE,
  readiness: READINESS,
  progress: null,
  payslips: PAYSLIPS,
  variances: VARIANCES,
  bankFiles: BANK_FILES,
  published: false,
  can: { prepare: true, approve: true, bankGenerate: true, bankRelease: true, publish: true, offcycle: true },
  onBack: vi.fn(),
  onWaive: vi.fn(async () => ({})),
  onCalculate: vi.fn(async () => ({})),
  onPayslip: vi.fn(async () => DETAIL),
  onAck: vi.fn(async () => ({})),
  onSubmit: vi.fn(async () => ({})),
  onDecide: vi.fn(async () => ({})),
  onVoid: vi.fn(async () => ({})),
  onGenerateBank: vi.fn(async () => ({ id: 'b2', fileId: 'f2', rows: 2, total: '126620.00', excluded: [{ employeeId: 'p3', reason: 'No salary bank account.' }] })),
  onReleaseBank: vi.fn(async () => ({})),
  onDownload: vi.fn(async () => ({})),
  onPublish: vi.fn(async () => ({})),
  onPayments: vi.fn(),
  ...over,
});
const show = (l: LiveRunWorkspaceData) => render(<RunWorkspaceScreen live={l} />);

describe('PAY-03 run workspace, live', () => {
  it('a payslip line becomes a "why this number" line with the rule it cites', () => {
    const pt = DETAIL.lines.findIndex((l) => l.code === 'pt');
    expect(explained(DETAIL.lines[pt], pt)).toMatchObject({ label: 'Professional tax', amount: 200, kind: 'deduction', rule: 'IN.PT IN-KA 2025-v1, verify' });
  });

  it('the design, not a copy: run name, stage track and the six design tabs', () => {
    show(live());
    expect(screen.getByRole('heading', { level: 1, name: 'Payroll · September 2026' })).toBeInTheDocument();
    for (const t of ['Inputs', 'Payslips', 'Variance', 'Validations', 'Approvals', 'Files']) expect(screen.getByRole('tab', { name: new RegExp(`^${t}`) })).toBeInTheDocument();
  });

  it('checks: Calculate is never disabled; with a blocking check it says why and does not calculate; a waiver needs a reason', async () => {
    const l = live({ run: { ...RUN, status: 'draft' } });
    show(l);
    const calc = screen.getByRole('button', { name: 'Calculate' });
    expect(calc).toBeEnabled();
    await ue.click(calc);
    expect((await screen.findAllByText('Fix or waive 1 check first.')).length).toBeGreaterThan(0);
    expect(l.onCalculate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Waive' }));
    await ue.click(screen.getByRole('button', { name: 'Waive with reason' }));
    expect(await screen.findByText(/Reason: at least 5 characters/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveFocus();
    expect(l.onWaive).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Bank details next week');
    await ue.click(screen.getByRole('button', { name: 'Waive with reason' }));
    await waitFor(() => expect(l.onWaive).toHaveBeenCalledWith('c1', 'Bank details next week'));
  });

  it('checks: with nothing blocking, Calculate calculates', async () => {
    const l = live({ run: { ...RUN, status: 'draft' }, readiness: { ...READINESS, checks: READINESS.checks.map((c) => ({ ...c, waived: true, waiverReason: 'Bank next week' })) } });
    show(l);
    expect(screen.getByText('Ready to calculate')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Calculate' }));
    await waitFor(() => expect(l.onCalculate).toHaveBeenCalled());
  });

  it('payslips: a row opens the drawer with every line explained and the rule it cites', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByText('Arjun Kulkarni'));
    await waitFor(() => expect(l.onPayslip).toHaveBeenCalledWith('s1'));
    const drawer = await screen.findByRole('dialog');
    await ue.click(await within(drawer).findByRole('button', { name: /Professional tax/ }));
    expect(within(drawer).getByText('IN.PT IN-KA 2025-v1, verify')).toBeInTheDocument();
  });

  it('submit: refused while a pay change is not acknowledged; the note is optional', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect((await screen.findAllByText('Acknowledge 1 pay change first.')).length).toBeGreaterThan(0);
    expect(l.onSubmit).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge the change for Divya Raghunathan' }));
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(l.onAck).toHaveBeenCalledWith('v1', ''));
  });

  it('submit: a sole approver is asked why, then the reason is sent', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Say why you approve it yourself.'), { code: 'SELF_APPROVAL_REASON' })).mockResolvedValue({});
    const l = live({ variances: [], onSubmit });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('dialog', { name: 'Approve it yourself?' })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Submit for approval' }).pop()!);
    expect(await screen.findByText(/at least 5 characters/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Why you approve it yourself/ }), 'Only payroll person here');
    await ue.click(screen.getAllByRole('button', { name: 'Submit for approval' }).pop()!);
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith('Only payroll person here'));
  });

  it('approval: the preparer is told someone else approves and gets no approve button', () => {
    show(live({ run: { ...RUN, status: 'submitted', preparedByMe: true, approval: { ...APPROVER, canDecide: false } } }));
    expect(screen.getByText(/someone else approves it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and lock' })).not.toBeInTheDocument();
  });

  it('approval: the approver must type the phrase; then the decision is sent with it', async () => {
    const l = live({ run: { ...RUN, status: 'submitted', preparedByMe: false, approval: APPROVER } });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Approve and lock' }));
    const confirm = screen.getAllByRole('button', { name: 'Approve and lock' }).pop()!;
    await ue.click(confirm);
    expect(screen.getAllByText(/exactly, in capitals\./).length).toBeGreaterThan(0);
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'APPROVE KFPL 2026-09');
    await ue.click(confirm);
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('approve', null, expect.objectContaining({ phrase: 'APPROVE KFPL 2026-09' })));
  });

  it('approval: sending back needs what to change', async () => {
    const l = live({ run: { ...RUN, status: 'submitted', preparedByMe: false, approval: APPROVER } });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    await ue.click(screen.getAllByRole('button', { name: 'Send back' }).pop()!);
    expect(await screen.findByText(/What to change: at least 5 characters/)).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What to change/ }), 'Divya’s arrears are missing');
    await ue.click(screen.getAllByRole('button', { name: 'Send back' }).pop()!);
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('reject', 'Divya’s arrears are missing', { phrase: '', impact: [] }));
  });

  it('bank file: made with the debit account (pressed early it says what is missing); not-in-file people stay listed', async () => {
    const l = live({ run: { ...RUN, status: 'approved' }, bankFiles: [] });
    show(l);
    await ue.click(screen.getAllByRole('button', { name: 'Make bank file' })[0]);
    await ue.click(screen.getAllByRole('button', { name: 'Make bank file' }).pop()!);
    expect(await screen.findByText(/Enter the account the bank debits/)).toBeInTheDocument();
    expect(l.onGenerateBank).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Company account/ }), '0050200012345678');
    await ue.click(screen.getAllByRole('button', { name: 'Make bank file' }).pop()!);
    await waitFor(() => expect(l.onGenerateBank).toHaveBeenCalledWith('0050200012345678', undefined));
    expect(await screen.findByText(/Not in the file: Sridhar Fernandes/)).toBeInTheDocument();
  });

  it('bank file: someone other than its maker releases it with the phrase; its maker cannot', async () => {
    const l = live({ run: { ...RUN, status: 'approved' } });
    const { unmount } = show(l);
    await ue.click(screen.getByRole('button', { name: 'Release bank file' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'RELEASE 2');
    await ue.click(screen.getAllByRole('button', { name: 'Release bank file' }).pop()!);
    await waitFor(() => expect(l.onReleaseBank).toHaveBeenCalledWith('b1', expect.objectContaining({ phrase: 'RELEASE 2' })));
    unmount();
    show(live({ run: { ...RUN, status: 'approved' }, bankFiles: [{ ...BANK_FILES[0], madeByMe: true }] }));
    expect(screen.queryByRole('button', { name: /Release/ })).not.toBeInTheDocument();
    expect(screen.getByText('Someone else releases it')).toBeInTheDocument();
  });

  it('publish: nothing approved says so; approved payslips publish with the typed count', async () => {
    const none = live({ run: { ...RUN, status: 'paid' }, bankFiles: [] , can: { ...live().can, bankGenerate: false } });
    const { unmount } = show(none);
    await ue.click(screen.getByRole('button', { name: 'Publish payslips' }));
    expect((await screen.findAllByText('No approved payslips to publish.')).length).toBeGreaterThan(0);
    unmount();
    const l = live({ run: { ...RUN, status: 'paid' }, payslips: PAYSLIPS.map((s) => ({ ...s, status: 'approved' })), bankFiles: [], can: { ...live().can, bankGenerate: false } });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Publish payslips' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'PUBLISH 3');
    await ue.click(screen.getAllByRole('button', { name: 'Publish payslips' }).pop()!);
    await waitFor(() => expect(l.onPublish).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'PUBLISH 3' })));
  });

  it('void: from the menu, only with a reason; a void run says so', async () => {
    const l = live();
    const { unmount } = show(l);
    await ue.click(screen.getByRole('button', { name: 'More actions' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Void run' }));
    await ue.click(screen.getAllByRole('button', { name: 'Void run' }).pop()!);
    expect(await screen.findByText(/Why: at least 5 characters/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Wrong pay group');
    await ue.click(screen.getAllByRole('button', { name: 'Void run' }).pop()!);
    await waitFor(() => expect(l.onVoid).toHaveBeenCalledWith('Wrong pay group'));
    unmount();
    show(live({ run: { ...RUN, status: 'void', voidReason: 'Wrong pay group' } }));
    expect(screen.getByText('This run is void')).toBeInTheDocument();
  });

  it('without the keys: no calculate, submit, waive, void or publish', () => {
    show(live({ run: { ...RUN, status: 'draft' }, can: { prepare: false, approve: false, bankGenerate: false, bankRelease: false, publish: false, offcycle: false } }));
    expect(screen.queryByRole('button', { name: /Calculate|Submit|Waive|Publish/ })).not.toBeInTheDocument();
  });

  it('calculating: the progress names each failure', () => {
    show(live({ run: { ...RUN, status: 'calculating' }, progress: { status: 'calculating', calcVersion: 1, total: 3, ok: 1, failed: 1, skipped: 0, queued: 1, failures: [{ employeeId: 'p3', field: 'compensation', message: 'No compensation from 1 Sep.' }] } }));
    expect(screen.getByText('Sridhar Fernandes')).toBeInTheDocument();
    expect(screen.getByText(/No compensation from 1 Sep/)).toBeInTheDocument();
  });

  it('states: loading, error with retry, and no access', async () => {
    const { unmount } = show(live({ state: 'loading', run: null }));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    unmount();
    const l = live({ state: 'error', run: null });
    const second = show(l);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(l.onRetry).toHaveBeenCalled();
    second.unmount();
    show(live({ state: 'no-access', run: null }));
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });
});
