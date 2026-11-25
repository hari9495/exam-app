import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoverageMonitorPanel, PayrollHomeScreen } from './payroll-run';
import { coverageRows, currentRun, groupRuns, homeDueItems, stageOf, type HomeDues, type LivePayrollHome } from './payroll-home-live';
import { COVERAGE, SETUP_ENTITIES } from './live/fixtures-5ab';
import { READINESS, RUN } from './live/fixtures-5j';
import type { PayRun } from './live/types-5j';

// PAY-01 Payroll home + PAY-29 run list + PAY-30 coverage, live (moved from pay-5j / pay-5i / pay-5b live tests).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const SEP: PayRun = { ...RUN, status: 'in_review' };
const AUG: PayRun = { ...RUN, id: 'r0', month: '2026-08', status: 'paid', totals: { ...RUN.totals!, net: '150000.00' } };
const home = (over: Partial<LivePayrollHome> = {}): LivePayrollHome => ({
  state: 'ready',
  runs: [SEP, { ...RUN, id: 'r2', runType: 'offcycle', offcycleKind: 'bonus', status: 'void', voidReason: 'Wrong month' }, AUG],
  groups: [{ id: 'g1', name: 'Monthly staff', legalEntityId: 'e1' }],
  month: '2026-09',
  today: '2026-09-20',
  readiness: READINESS,
  calendar: { cutOff: '2026-09-25', payDate: '2026-09-30' },
  canPrepare: true,
  canOffcycle: true,
  canApprove: false,
  setupHref: '/setup',
  statutoryHref: '/statutory',
  runHref: (id) => `/runs/${id}`,
  onCreate: vi.fn(async () => ({ id: 'r9' })),
  onOpen: vi.fn(),
  ...over,
});

describe('PAY-01 Payroll home, live', () => {
  it('answer 2300: settled first, it says so and one click adds it to an off-cycle run, which opens; a refusal says why', async () => {
    const onAddToOffcycle = vi.fn().mockRejectedValueOnce(new Error('This correction is already in an off-cycle run.')).mockResolvedValueOnce({ runId: 'r7' });
    const live = home({ waitingForFnf: [{ id: 'pc2', name: 'Meena S', on: '2026-08-07', month: '2026-08', fnfId: 'f2', state: 'settled' }], onAddToOffcycle });
    render(<PayrollHomeScreen live={live} />);
    const list = screen.getByRole('list', { name: 'Waiting for F&F' });
    expect(within(list).getByText('F&F settled')).toBeInTheDocument();
    expect(within(list).queryByRole('link', { name: 'Open F&F' })).toBeNull();
    await ue.click(within(list).getByRole('button', { name: 'Add to an off-cycle run' }));
    expect((await screen.findAllByText('This correction is already in an off-cycle run.')).length).toBeGreaterThan(0);
    expect(live.onOpen).not.toHaveBeenCalled();
    await ue.click(within(list).getByRole('button', { name: 'Add to an off-cycle run' }));
    await waitFor(() => expect(live.onOpen).toHaveBeenCalledWith('r7'));
    expect(onAddToOffcycle).toHaveBeenCalledWith('pc2');
  });

  it('answer 2283: a late correction of someone who has left shows as waiting for F&F, with a link to it; none, nothing shown', () => {
    const { unmount } = render(<PayrollHomeScreen live={home({ waitingForFnf: [{ id: 'pc1', name: 'Ravi Kumar', on: '2026-08-05', month: '2026-09', fnfId: 'f1' }], fnfHref: (id) => `/fnf/${id}` })} />);
    const list = screen.getByRole('list', { name: 'Waiting for F&F' });
    expect(within(list).getByText('Ravi Kumar: late correction for 2026-08-05')).toBeInTheDocument();
    expect(within(list).getByText('Waiting for F&F')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open F&F' })).toHaveAttribute('href', '/fnf/f1');
    unmount();
    render(<PayrollHomeScreen live={home({ waitingForFnf: [] })} />);
    expect(screen.queryByRole('list', { name: 'Waiting for F&F' })).toBeNull();
  });

  it('the stages and the badge cover all nine statuses; void runs are never this month’s run', () => {
    expect(stageOf('reopened', false)).toBe('In review');
    expect(stageOf('submitted', false)).toBe('In review');
    expect(stageOf('paid', true)).toBe('Published');
    expect(stageOf('calculating', false)).toBe('Draft');
    expect(currentRun([{ ...SEP, status: 'void' }], '2026-09')).toBeNull();
    expect(currentRun([SEP], '2026-10')).toBeNull();
  });

  it('shows this month’s run, its blocking checks, its dates and the run list (positive)', async () => {
    const live = home();
    render(<PayrollHomeScreen live={live} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Payroll' })).toBeInTheDocument();
    expect(screen.getByText(/Cut-off 25 Sep 2026 · Pay date 30 Sep 2026/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Pay run stages' })).getByText('1 check blocks the run')).toBeInTheDocument();
    expect(screen.getByText(/Sridhar Fernandes: no salary bank account/)).toBeInTheDocument();
    expect(screen.getByText('Blocks calculation')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Pay dates' })).getByText('Salaries paid')).toBeInTheDocument();
    // The run list: void and off-cycle runs stay listed with their badge.
    const table = screen.getByRole('table', { name: 'Monthly runs' });
    expect(within(table).getByText('Void')).toBeInTheDocument();
    expect(within(table).getByText('Paid')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open run workspace' }));
    expect(live.onOpen).toHaveBeenCalledWith('r1');
    // Totals: the last paid run.
    expect(screen.getByRole('region', { name: 'Net pay, August 2026' })).toBeInTheDocument();
  });

  it('a finance approver gets "Review and approve" on a run waiting for approval; no New run buttons', () => {
    render(<PayrollHomeScreen live={home({ canPrepare: false, canOffcycle: false, canApprove: true, runs: [{ ...SEP, status: 'submitted', preparedByMe: false }] })} />);
    expect(screen.getByText('Runs waiting for your approval, payments and statutory dues.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start off-cycle run' })).not.toBeInTheDocument();
    expect(screen.getByText('1 run is waiting for approval')).toBeInTheDocument();
  });

  it('no pay group: payroll is not set up, with a link to set-up (negative)', () => {
    render(<PayrollHomeScreen live={home({ runs: [], groups: [] })} />);
    expect(screen.getByText("Payroll isn't set up for this entity yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up payroll' })).toHaveAttribute('href', '/setup');
    expect(screen.queryByRole('button', { name: /Start .* payroll/ })).not.toBeInTheDocument();
  });

  it('no runs yet: says so and offers to start the month', () => {
    render(<PayrollHomeScreen live={home({ runs: [], readiness: null, calendar: null })} />);
    expect(screen.getByText('No payroll runs yet')).toBeInTheDocument();
    expect(screen.getByText('No payroll run for September 2026 yet. Start it when the month\'s inputs are in.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start September payroll' })).toBeInTheDocument();
  });

  it('loading, error with retry, and no access (negative)', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PayrollHomeScreen live={home({ state: 'loading', runs: null })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    rerender(<PayrollHomeScreen live={home({ state: 'error', runs: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<PayrollHomeScreen live={home({ state: 'no-access', runs: null })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open run workspace' })).not.toBeInTheDocument();
  });

  it('a new run: monthly or off-cycle is a pick-one Segment; the run is created, toasted and opened', async () => {
    const live = home({ runs: [] });
    render(<PayrollHomeScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Start off-cycle run' }));
    expect(screen.getByRole('radiogroup', { name: 'Kind of run' })).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Arrears' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(live.onCreate).toHaveBeenCalledWith('g1', '2026-09', 'arrears', null));
    expect(live.onOpen).toHaveBeenCalledWith('r9');
    expect((await screen.findAllByText('Run created')).length).toBeGreaterThan(0);
  });

  it('a weekly group’s run asks for its pay period first: the error shows and the field gets focus (negative), then the choice is sent', async () => {
    const live = home({ runs: [], groups: [{ id: 'g1', name: 'Weekly workers', legalEntityId: 'e1', frequency: 'weekly', anchorDate: '2026-09-28' }], month: '2026-10', canOffcycle: false });
    render(<PayrollHomeScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Start October payroll' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    expect(screen.getAllByText(/Choose the pay period/).length).toBeGreaterThan(0);
    expect(live.onCreate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Pay period/ }));
    await ue.click(await screen.findByRole('option', { name: /26 Oct 2026 to 31 Oct 2026/ }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(live.onCreate).toHaveBeenCalledWith('g1', '2026-10', null, 5));
  });

  it('a refused create keeps the drawer open with the reason (negative)', async () => {
    const live = home({ runs: [], onCreate: vi.fn(async () => Promise.reject(new Error('A run for this pay group and month already exists.'))) });
    render(<PayrollHomeScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Start September payroll' }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    expect(await screen.findByText('A run for this pay group and month already exists.')).toBeInTheDocument();
    expect(live.onOpen).not.toHaveBeenCalled();
  });

  it('weekly runs sit in their own tab', async () => {
    render(<PayrollHomeScreen live={home({ groups: [{ id: 'g1', name: 'Weekly workers', legalEntityId: 'e1', frequency: 'weekly', anchorDate: '2026-09-28' }] })} />);
    expect(screen.getByRole('tab', { name: /Weekly/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('PAY-30 Coverage, live', () => {
  it('maps the daily check to the design table, read only, with the entity column (positive)', () => {
    render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: COVERAGE, setupHref: '/setup' }} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Kaveri Foods Pvt Ltd').length).toBeGreaterThan(0);
    expect(within(table).getByText('Approaching')).toBeInTheDocument();
    expect(within(table).getAllByText(/Covered since/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Switch on' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open statutory set-up' })).toHaveAttribute('href', '/setup');
    expect(coverageRows(COVERAGE, SETUP_ENTITIES).map((r) => r.status)).toEqual(['Covered', 'Covered', 'Approaching', 'Covered']);
  });

  it('PAY-30 Crossed: covered but not set up blocks approval; Switch on needs the number (negative), then saves it with a toast', async () => {
    const crossed = [{ ...COVERAGE[3], status: 'crossed' as const, crossedOn: '2026-09-24' }];
    const onSettle = vi.fn(async () => ({}));
    render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: crossed, setupHref: '/setup', onSettle }} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Crossed: set-up needed')).toBeInTheDocument();
    await ue.click(within(table).getByRole('button', { name: 'Switch on' }));
    await ue.click(screen.getByRole('button', { name: /^Switch .+ on$/ }));
    expect(screen.getByText('Give the registration number (at least 5 characters).')).toBeInTheDocument();
    expect(onSettle).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Registration number/ }), 'TNMAS0012345000');
    await ue.click(screen.getByRole('button', { name: /^Switch .+ on$/ }));
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith(crossed[0], expect.objectContaining({ applied: false, registrationNo: 'TNMAS0012345000', from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })));
  });

  it('PAY-30 Crossed: Record applied sends the date only; without the set-up key there are no buttons (negative)', async () => {
    const crossed = [{ ...COVERAGE[3], status: 'crossed' as const }];
    const onSettle = vi.fn(async () => ({}));
    const { unmount } = render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: crossed, setupHref: '/setup', onSettle }} />);
    await ue.click(screen.getByRole('button', { name: 'Record applied' }));
    await ue.click(screen.getAllByRole('button', { name: 'Record applied' }).pop()!);
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith(crossed[0], expect.objectContaining({ applied: true })));
    unmount();
    render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: crossed, setupHref: '/setup' }} />);
    expect(screen.queryByRole('button', { name: 'Switch on' })).not.toBeInTheDocument();
    expect(screen.getByText(/switch it on or record it as applied for/)).toBeInTheDocument();
  });

  it('not checked yet, and could not load (negative)', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: [], setupHref: '/setup' }} />);
    expect(screen.getByText('Not checked yet. The daily check fills this in.')).toBeInTheDocument();
    rerender(<CoverageMonitorPanel live={{ state: 'error', onRetry, entities: [], rows: null, setupHref: '/setup' }} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

// Round 2 (founder answers 29 Oct): statutory dues in "Due this month" and one stage row per pay group.
const DUES: HomeDues[] = [
  {
    entity: 'Kaveri Foods',
    entityId: 'e1',
    month: '2026-08',
    today: '2026-09-20',
    cards: [
      { statute: 'IN.PF', state: null, label: 'PF (ECR)', amount: '24000.00', dueOn: '2026-09-15', status: 'not_generated', late: true, penaltyEstimate: '1250.00' },
      { statute: 'IN.ESI', state: null, label: 'ESI contributions', amount: '5200.00', dueOn: '2026-09-15', status: 'filed', late: false, penaltyEstimate: null },
      { statute: 'IN.LWF', state: 'KA', label: 'Labour welfare fund · KA', amount: '0.00', dueOn: null, status: 'not_generated', late: false, penaltyEstimate: null },
      { statute: 'IN.PT', state: 'KA', label: 'Professional tax · KA', amount: '600.00', dueOn: null, status: 'not_generated', late: false, penaltyEstimate: null },
    ],
    tds: { amount: '18000.00', dueOn: '2026-09-07', challanStatus: 'deposited', late: false },
  },
  // September's own dues fall in October: not "due this month" unless late.
  { entity: 'Kaveri Foods', entityId: 'e1', month: '2026-09', today: '2026-09-20', cards: [{ statute: 'IN.PF', state: null, label: 'PF (ECR)', amount: '25000.00', dueOn: '2026-10-15', status: 'not_generated', late: false, penaltyEstimate: null }], tds: { amount: '0.00', dueOn: '2026-10-07', challanStatus: 'not_prepared', late: false } },
];

describe('PAY-01 Payroll home, live: statutory dues and pay groups (round 2)', () => {
  it('works out what falls due this month: late with its penalty, filed as Filed, nothing owed left out, PT without a date counted apart', () => {
    const { items, undated } = homeDueItems(DUES, '2026-09', '/statutory');
    expect(items.map((i) => [i.statute, i.status])).toEqual([
      ['TDS', 'done'],
      ['PF', 'overdue'],
      ['ESI', 'done'],
    ]);
    expect(items[1]).toMatchObject({ what: 'PF return and payment for August', penalty: 1250, action: { href: '/statutory' } });
    expect(items[0].action).toBeUndefined();
    expect(undated).toBe(1);
    // October: the September PF falls due; the late August PF still shows; the zero TDS does not.
    expect(homeDueItems(DUES, '2026-10', '/s').items.map((i) => i.id)).toEqual(['e1-2026-08-IN.PF-', 'e1-2026-09-IN.PF-']);
  });

  it('item 12 and 13: a state PT date shows like any other; an unfiled due from three months back still shows as overdue', () => {
    const back: HomeDues[] = [
      { entity: 'Kaveri Foods', entityId: 'e1', month: '2026-06', today: '2026-09-20', cards: [{ statute: 'IN.PT', state: 'IN-KA', label: 'Professional tax · IN-KA', amount: '4200.00', dueOn: '2026-07-20', status: 'not_generated', late: true, penaltyEstimate: null }], tds: { amount: '0.00', dueOn: '2026-07-07', challanStatus: 'not_prepared', late: false } },
      { entity: 'Kaveri Foods', entityId: 'e1', month: '2026-08', today: '2026-09-20', cards: [{ statute: 'IN.PT', state: 'IN-KA', label: 'Professional tax · IN-KA', amount: '4400.00', dueOn: '2026-09-20', status: 'not_generated', late: false, penaltyEstimate: null }], tds: { amount: '0.00', dueOn: '2026-09-07', challanStatus: 'not_prepared', late: false } },
    ];
    const { items, undated } = homeDueItems(back, '2026-09', '/s');
    expect(items.map((i) => [i.what, i.status, `${i.due.getMonth() + 1}-${i.due.getDate()}`])).toEqual([
      ['Professional tax return for June', 'overdue', '7-20'],
      ['Professional tax return for August', 'due', '9-20'],
    ]);
    expect(items[0].statute).toBe('Professional tax (IN-KA)');
    expect(undated).toBe(0);
  });

  it('shows the dues strip with the penalty and the hub link (positive)', () => {
    render(<PayrollHomeScreen live={home({ dues: DUES })} />);
    const strip = screen.getByRole('list', { name: 'Statutory due dates' });
    expect(within(strip).getByText('PF return and payment for August')).toBeInTheDocument();
    expect(within(strip).getByText('5 days overdue')).toBeInTheDocument();
    expect(within(strip).getByText(/Penalty if filed today/)).toBeInTheDocument();
    expect(within(strip).getAllByText('Filed')).toHaveLength(2);
    expect(within(strip).getByRole('link', { name: 'Open statutory hub' })).toHaveAttribute('href', '/statutory');
    expect(screen.getByText(/Professional tax and labour welfare fund dates depend on the state/)).toBeInTheDocument();
  });

  it('without statutory access no dues are shown, only the link to the hub (negative)', () => {
    render(<PayrollHomeScreen live={home({ dues: undefined })} />);
    expect(screen.queryByRole('list', { name: 'Statutory due dates' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PF, ESI, TDS and PT dues' })).toBeInTheDocument();
  });

  it('several pay groups: one stage row each, blocking counted per run, open or start (positive)', async () => {
    const weekly: PayRun = { ...RUN, id: 'r5', payGroupId: 'g2', status: 'calculated' };
    const live = home({
      runs: [SEP, weekly, AUG],
      groups: [
        { id: 'g1', name: 'Monthly staff', legalEntityId: 'e1' },
        { id: 'g2', name: 'Plant workers', legalEntityId: 'e1', frequency: 'weekly' },
        { id: 'g3', name: 'Tamil Nadu staff', legalEntityId: 'e2' },
      ],
      readinessByRun: { r1: READINESS, r5: { ...READINESS, run: weekly, checks: [] } },
    });
    expect(groupRuns(live.runs!, live.groups, '2026-09').map((g) => [g.groupId, g.run?.id ?? null])).toEqual([
      ['g1', 'r1'],
      ['g2', 'r5'],
      ['g3', null],
    ]);
    render(<PayrollHomeScreen live={live} />);
    const list = screen.getByRole('list', { name: 'Runs by pay group' });
    const rows = [...list.children] as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('1 blocking')).toBeInTheDocument();
    expect(within(rows[1]).getByText('On track')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('list', { name: 'Stage: Calculated, step 2 of 6' })).toBeInTheDocument();
    expect(within(rows[2]).getAllByText('Not started').length).toBeGreaterThan(0);
    await ue.click(within(rows[1]).getByRole('button', { name: 'Open run' }));
    expect(live.onOpen).toHaveBeenCalledWith('r5');
    await ue.click(within(rows[2]).getByRole('button', { name: 'Start run' }));
    // The row's own pay group, not the first one.
    expect(within(await screen.findByRole('dialog', { name: 'Start a payroll run' })).getByRole('combobox', { name: /Pay group/ })).toHaveTextContent('Tamil Nadu staff');
  });

  it('one pay group keeps the single stage track; a finance approver gets no Start run (negative)', () => {
    const { unmount } = render(<PayrollHomeScreen live={home()} />);
    expect(screen.queryByRole('list', { name: 'Runs by pay group' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pay run stages' })).toBeInTheDocument();
    unmount();
    render(<PayrollHomeScreen live={home({ canPrepare: false, canApprove: true, groups: [{ id: 'g1', name: 'Monthly staff', legalEntityId: 'e1' }, { id: 'g3', name: 'Tamil Nadu staff', legalEntityId: 'e2' }] })} />);
    expect(screen.getByRole('list', { name: 'Runs by pay group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
  });
});
