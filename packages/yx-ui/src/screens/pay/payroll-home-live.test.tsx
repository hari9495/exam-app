import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoverageMonitorPanel, PayrollHomeScreen } from './payroll-run';
import { coverageRows, currentRun, stageOf, type LivePayrollHome } from './payroll-home-live';
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
    expect(within(screen.getByRole('list', { name: 'Due this month' })).getByText('Salaries paid')).toBeInTheDocument();
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

  it('not checked yet, and could not load (negative)', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<CoverageMonitorPanel live={{ state: 'ready', entities: SETUP_ENTITIES, rows: [], setupHref: '/setup' }} />);
    expect(screen.getByText('Not checked yet. The daily check fills this in.')).toBeInTheDocument();
    rerender(<CoverageMonitorPanel live={{ state: 'error', onRetry, entities: [], rows: null, setupHref: '/setup' }} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
