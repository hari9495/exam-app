import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OffCycleRunScreen } from './offcycle';
import type { LiveOffCycleRun } from './offcycle-run-live';
import type { LiveRunWorkspaceData } from './run-workspace-live';
import { BANK_FILES, DETAIL, FNF, PAYSLIPS, PEOPLE, READINESS, RUN, VARIANCES } from './live/fixtures-5j';

// PAY-11 off-cycle run, live: "Start off-cycle run" (choose the type, pay group and month) and an off-cycle run's page
// (the design's header and settlement lines over the run workspace's steps). What /yx/payroll/runs/off-cycle and
// /yx/payroll/runs/[id] must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const GROUPS = [{ id: 'g1', name: 'Monthly staff · KFPL', legalEntityId: 'e1', frequency: 'monthly' as const, anchorDate: null }];
type New = Extract<LiveOffCycleRun, { mode: 'new' }>;
const fresh = (over: Partial<New> = {}): New => ({
  mode: 'new',
  state: 'ready',
  onRetry: vi.fn(),
  groups: GROUPS as unknown as New['groups'],
  month: '2026-10',
  fnfHref: '/yx/payroll/fnf',
  onCreate: vi.fn(async () => ({ id: 'r20' })),
  onOpen: vi.fn(),
  onCancel: vi.fn(),
  ...over,
});
const workspace = (over: Partial<LiveRunWorkspaceData> = {}): LiveRunWorkspaceData => ({
  state: 'ready',
  run: { ...RUN, id: 'r9', runType: 'offcycle', offcycleKind: 'fnf', status: 'draft', reference: 'FNF-2026-0040' },
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
  onGenerateBank: vi.fn(async () => ({ id: 'b2', fileId: 'f2', rows: 1, total: '1.00', excluded: [] })),
  onReleaseBank: vi.fn(async () => ({})),
  onDownload: vi.fn(async () => ({})),
  onPublish: vi.fn(async () => ({})),
  ...over,
});
const record = (over: Partial<Extract<LiveOffCycleRun, { mode: 'run' }>> = {}) => render(<OffCycleRunScreen live={{ mode: 'run', workspace: workspace(), settlement: null, person: null, fnfHref: '/yx/payroll/fnf', ...over }} />);

describe('PAY-11 off-cycle run, live: start one', () => {
  it('the design: Run type with the kinds the API takes; a bonus run is created and opens', async () => {
    const l = fresh();
    render(<OffCycleRunScreen live={l} />);
    expect(screen.getByRole('heading', { name: 'Off-cycle run' })).toBeInTheDocument();
    for (const k of ['Full and final settlement', 'Bonus', 'Arrears only', 'Correction', 'Payment']) expect(screen.getByLabelText(k)).toBeInTheDocument();
    await ue.click(screen.getByLabelText('Arrears only'));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(l.onCreate).toHaveBeenCalledWith('g1', '2026-10', 'arrears'));
    expect(l.onOpen).toHaveBeenCalledWith('r20');
  });

  it('negative: full and final is never started here; it says where it starts and stays on the step', async () => {
    const l = fresh();
    render(<OffCycleRunScreen live={l} />);
    await ue.click(screen.getByLabelText('Full and final settlement'));
    expect(screen.getByText('A full and final run starts from the settlement')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open full and final' })).toHaveAttribute('href', '/yx/payroll/fnf');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Pay group', { selector: 'label' })).not.toBeInTheDocument();
    expect(l.onCreate).not.toHaveBeenCalled();
  });

  it('negative: Create run pressed with no pay group shows the field error, focuses it and sends nothing', async () => {
    const l = fresh({ groups: [] });
    render(<OffCycleRunScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    const create = screen.getByRole('button', { name: 'Create run' });
    expect(create).toBeEnabled();
    await ue.click(create);
    expect(await screen.findByText('Choose a pay group.')).toBeInTheDocument();
    expect(l.onCreate).not.toHaveBeenCalled();
  });

  it('negative: the server refuses (wrong entity, month locked): the reason shows and nothing opens', async () => {
    const l = fresh({ onCreate: vi.fn(async () => Promise.reject(new Error('You cannot prepare off-cycle runs for this legal entity.'))) });
    render(<OffCycleRunScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    expect(await screen.findByText('You cannot prepare off-cycle runs for this legal entity.')).toBeInTheDocument();
    expect(l.onOpen).not.toHaveBeenCalled();
  });

  it('negative: without payroll.offcycle.prepare it says so and offers no form', () => {
    render(<OffCycleRunScreen live={fresh({ state: 'no-access' })} />);
    expect(screen.getByText("You can't start an off-cycle run")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create run' })).not.toBeInTheDocument();
  });
});

describe('PAY-11 off-cycle run, live: an off-cycle run page', () => {
  it('F&F: the design header (leaver, due date) and the deadline; lines with the net; the run steps under them', () => {
    record({ settlement: FNF[1], person: 'Arjun Kumar', workspace: workspace({ run: { ...RUN, id: 'r11', runType: 'offcycle', offcycleKind: 'fnf', status: 'calculated', reference: 'FNF-2026-0041' } }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Full and final: Arjun Kumar' })).toBeInTheDocument();
    expect(screen.getByText('Due 21 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Pay by 21 Oct 2026 (2 working days after last working day)')).toBeInTheDocument();
    const table = screen.getByRole('region', { name: /Settlement lines/ });
    expect(within(table).getByText('Leave encashment')).toBeInTheDocument();
    expect(within(table).getByText('Basic')).toBeInTheDocument();
    expect(within(table).getByText('₹33,440')).toBeInTheDocument();
    for (const t of ['Inputs', 'Payslips', 'Validations', 'Approvals', 'Files']) expect(screen.getByRole('tab', { name: new RegExp(`^${t}`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
  });

  it('negative: retrenchment without the government permission: blocked badge, the held line and why', () => {
    record({ settlement: FNF[0], person: 'Meena Rao' });
    expect(screen.getByText('Permission needed')).toBeInTheDocument();
    expect(screen.getByText("Can't pay retrenchment compensation yet: government permission needed")).toBeInTheDocument();
    expect(screen.getByText(/350 workers/)).toBeInTheDocument();
    expect(screen.getByText('After calculation')).toBeInTheDocument();
  });

  it('retrenchment with the permission granted: no block, the deadline instead', () => {
    record({ settlement: { ...FNF[0], items: FNF[0].items.map((i) => ({ ...i, held: null, heldTag: null })) }, person: 'Meena Rao' });
    expect(screen.queryByText('Permission needed')).not.toBeInTheDocument();
    expect(screen.getByText(/Pay by 21 Oct 2026/)).toBeInTheDocument();
  });

  it('death in service: nominee shares; with none recorded it warns before approval', () => {
    const death = { ...FNF[1], exitType: 'death', payees: [{ kind: 'nominee', name: 'Saroja Kumar', relation: 'Spouse', sharePercent: '60.00', accountLast4: '4321', ifsc: 'HDFC0001', amount: '20064.00' }] };
    const { unmount } = record({ settlement: death, person: 'Arjun Kumar' });
    expect(screen.getByText('Late Arjun Kumar')).toBeInTheDocument();
    expect(screen.getByText('Saroja Kumar')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    unmount();
    record({ settlement: { ...death, payees: [] }, person: 'Arjun Kumar' });
    expect(screen.getByText('No nominees recorded yet')).toBeInTheDocument();
  });

  it('bonus run: the design title with kind and month; lines are added in Inputs', () => {
    record({ workspace: workspace({ run: { ...RUN, id: 'r12', runType: 'offcycle', offcycleKind: 'bonus', status: 'draft' } }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Off-cycle run · Bonus · September 2026' })).toBeInTheDocument();
    expect(screen.getByText('An off-cycle run pays only what you add to it')).toBeInTheDocument();
  });

  it('negative: an F&F run for someone without payroll.fnf.manage shows no settlement, only where it is', () => {
    record({ settlement: null });
    expect(screen.getByText('Full and final run')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Settlement lines/ })).not.toBeInTheDocument();
  });
});
