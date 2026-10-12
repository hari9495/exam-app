import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FnfScreen, StatutoryHubScreen } from './compliance';
import { GoLiveScreen } from './golive';
import { MyPayslipsScreen, payDiff } from './employee';
import { PayRunScreen, PayRunsScreen, rupees } from './runs';
import { BANK_FILES, DETAIL, FILINGS, FNF, GO_LIVE, HUB, MY_PAYSLIPS, PARALLEL, PAYSLIPS, PEOPLE, PREVIOUS, READINESS, RETURNS, RUN, VARIANCES } from './fixtures-5j';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = vi.fn(async () => ({}) as never);
const runProps = () => ({
  state: 'ready' as const,
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
});

describe('batch 5j payroll screens', () => {
  it('rupees: Indian grouping from the API string', () => {
    expect(rupees('1234567.5')).toBe('₹12,34,567.50');
    expect(rupees('-200.00')).toBe('−₹200.00');
  });

  it('a new run: monthly or off-cycle is a pick-one Segment; errors show only after trying to create', async () => {
    const onCreate = vi.fn(async () => ({ id: 'r9' }));
    const onOpen = vi.fn();
    render(<PayRunsScreen state="ready" runs={[]} groups={[{ id: 'g1', name: 'Monthly staff', legalEntityId: 'e1' }]} thisMonth="2026-10" canPrepare canOffcycle onCreate={onCreate} onOpen={onOpen} />);
    await ue.click(screen.getAllByRole('button', { name: 'New run' })[0]);
    expect(screen.getByRole('radiogroup', { name: 'Kind of run' })).toBeInTheDocument();
    expect(screen.queryByText(/Fix these/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Off-cycle' }));
    await ue.click(screen.getByRole('radio', { name: 'Arrears' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('g1', '2026-10', 'arrears'));
    expect(onOpen).toHaveBeenCalledWith('r9');
  });

  it('checks: a blocking check stops calculating until it is waived with a reason', async () => {
    const p = runProps();
    render(<PayRunScreen {...p} run={{ ...RUN, status: 'draft' }} />);
    expect(screen.getByRole('button', { name: 'Calculate again' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Waive' }));
    await ue.click(screen.getByRole('button', { name: 'Waive' }));
    expect((await screen.findAllByText(/at least 5 letters/)).length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Bank details next week');
    await ue.click(screen.getByRole('button', { name: 'Waive' }));
    await waitFor(() => expect(p.onWaive).toHaveBeenCalledWith('c1', 'Bank details next week'));
  });

  it('payslips: every line explained with the rule it cites', async () => {
    const p = runProps();
    render(<PayRunScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Why these numbers for Arjun Kulkarni' }));
    const earnings = await screen.findByRole('table', { name: 'Earnings' });
    expect(within(earnings).getByText('Basic')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Deductions' })).toHaveTextContent('IN.PT IN-KA 2025-v1, verify');
  });

  it('approval: the approver types the phrase; the preparer is told someone else approves', async () => {
    const p = runProps();
    const { rerender } = render(<PayRunScreen {...p} run={{ ...RUN, status: 'submitted', preparedByMe: true, approval: { canDecide: false, phrase: 'APPROVE KFPL 2026-09', step: 1, steps: 2 } }} />);
    expect(screen.getByText(/someone else approves it/)).toBeInTheDocument();
    rerender(<PayRunScreen {...p} run={{ ...RUN, status: 'submitted', preparedByMe: false, approval: { canDecide: true, phrase: 'APPROVE KFPL 2026-09', step: 1, steps: 2 } }} />);
    await ue.click(screen.getByRole('button', { name: 'Approve and lock' }));
    const confirm = screen.getAllByRole('button', { name: 'Approve and lock' }).pop()!;
    expect(confirm).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'APPROVE KFPL 2026-09');
    await ue.click(confirm);
    await waitFor(() => expect(p.onDecide).toHaveBeenCalledWith('approve', null, expect.objectContaining({ phrase: 'APPROVE KFPL 2026-09' })));
  });

  it('bank file: made with the debit account, then released by someone else with the phrase', async () => {
    const p = runProps();
    render(<PayRunScreen {...p} run={{ ...RUN, status: 'approved' }} />);
    await ue.click(await screen.findByRole('button', { name: 'Make bank file' }));
    expect((await screen.findAllByText(/Enter the account the bank debits/)).length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Company account/ }), '0050200012345678');
    await ue.type(screen.getByRole('textbox', { name: /Why a new file/ }), 'Wrong debit account');
    await ue.click(screen.getByRole('button', { name: 'Make bank file' }));
    expect(await screen.findByText(/Not in the file: Sridhar Fernandes/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'RELEASE 2');
    await ue.click(screen.getByRole('button', { name: 'Release file' }));
    await waitFor(() => expect(p.onReleaseBank).toHaveBeenCalledWith('b1', expect.objectContaining({ phrase: 'RELEASE 2' })));
  });

  it('my payslip: what changed since last month, worked out only from the two payslips', async () => {
    expect(payDiff(PREVIOUS.lines, DETAIL.lines).map((r) => [r.name, r.before, r.after])).toEqual([
      ['Special allowance', 13125, 15125],
      ['Income tax (TDS)', 2980, 3120],
    ]);
    render(<MyPayslipsScreen state="ready" payslips={MY_PAYSLIPS} onOpen={async (id) => (id === 's0' ? PREVIOUS : DETAIL)} onPdf={ok} onQuery={ok} />);
    await ue.click(screen.getByRole('button', { name: 'Open payslip for September 2026' }));
    expect(await screen.findByRole('region', { name: 'Reimbursements' })).toHaveTextContent(/not of gross earnings/);
    await ue.click(screen.getByRole('button', { name: 'Show what changed' }));
    expect(await screen.findByRole('table', { name: 'What changed' })).toHaveTextContent('Special allowance');
  });

  it('statutory hub: an uploaded filing is marked filed with its phrase; the TDS return waits for the filer’s .fvu', async () => {
    const onFiled = vi.fn(async () => ({}));
    render(
      <StatutoryHubScreen
        state="ready"
        entities={[{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }]}
        entityId="e1"
        onEntity={vi.fn()}
        month="2026-09"
        onMonth={vi.fn()}
        hub={HUB}
        filings={FILINGS}
        returns={RETURNS}
        can={{ generate: true, markFiled: true }}
        onGenerate={ok}
        onUploaded={ok}
        onFiled={onFiled}
        onDownload={ok}
        onCreateReturn={ok}
        onReconcile={ok}
        onReturnFile={ok}
        onUploadFvu={ok}
        onReturnFiled={ok}
      />,
    );
    expect(screen.getByRole('table', { name: 'Statutory dues' })).toHaveTextContent('Late');
    await ue.click(screen.getByRole('button', { name: 'Mark filed' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'FILED PF 2026-09');
    await ue.click(screen.getAllByRole('button', { name: 'Mark filed' }).pop()!);
    await waitFor(() => expect(onFiled).toHaveBeenCalledWith('fl1', expect.objectContaining({ phrase: 'FILED PF 2026-09' })));
  });

  it('F&F: a held line shows why, and is released for the second run', async () => {
    const onHold = vi.fn(async () => ({}));
    render(<FnfScreen state="ready" settlements={FNF} nameOf={(id) => PEOPLE.find((x) => x.employeeId === id)!.name} onOpenRun={vi.fn()} onHold={onHold} onAdd={ok} onWaiveNotice={ok} onSecondRun={async () => ({ runId: 'r10' })} />);
    await ue.click(screen.getByRole('button', { name: 'Open the settlement of Sridhar Fernandes' }));
    expect(screen.getByRole('table', { name: 'Settlement lines' })).toHaveTextContent(/permission for retrenchment/);
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(onHold).toHaveBeenCalledWith(FNF[0], 'i1', null, 'Released for payment'));
  });

  it('go-live: what is left, and a comparison with differences signed off only with a reason, never by its uploader', async () => {
    const onDecide = vi.fn(async () => ({}));
    const props = { state: 'ready' as const, entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }], entityId: 'e1', onEntity: vi.fn(), readiness: GO_LIVE, runs: [RUN], parallel: PARALLEL, can: { upload: true, decide: true }, onUpload: ok, onDecide };
    const { rerender } = render(<GoLiveScreen {...props} me="u-other" />);
    expect(screen.getByRole('list', { name: 'Readiness checks' })).toHaveTextContent('UAN on file');
    expect(screen.getByText(/someone else signs it off/)).toBeInTheDocument();
    rerender(<GoLiveScreen {...props} me="u-me" />);
    expect(screen.getByRole('table', { name: 'Differences' })).toHaveTextContent('Divya Raghunathan');
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    await ue.type(screen.getByRole('textbox', { name: /accepted/ }), 'Old payroll rounded PT wrongly');
    await ue.click(screen.getAllByRole('button', { name: 'Sign off' }).pop()!);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('pr1', 'signed_off', 'Old payroll rounded PT wrongly'));
  });
});
