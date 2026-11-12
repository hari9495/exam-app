import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CapacityBoardScreen, ProjectWorkspaceScreen, TimesheetApprovalsScreen, type LiveProjectWorkspace } from './projects';
import { BenchRequestsScreen } from './projects-billing';
import { BenchBoardScreen } from './hiring-staffing';
import { ProjectDrawer } from './projects-drawers';
import { LIVE_CAPACITY, LIVE_LINE_APPROVALS, LIVE_MATCHES, LIVE_PROJECT_CHOICES, LIVE_PROJECT_DETAIL, LIVE_PROJECT_ROWS, LIVE_REQUESTS } from './projects-live-fixtures';
import { requestProblems, type LiveRequests } from './resourcing-live';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-4 (PRJ-03, PRJ-07, the one bench; answers 1411, 1417, 1418, 1541, 1547): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PRJ-03 Capacity and utilisation (live, 1411)', () => {
  it('HR’s view: free hours, over-allocation and utilisation against the company target', () => {
    show(<CapacityBoardScreen live={{ state: 'ready', data: LIVE_CAPACITY }} />);
    expect(screen.getByText('Over-allocated people')).toBeInTheDocument();
    expect(screen.getAllByText('48%').length).toBeGreaterThan(0);
    expect(screen.getByText('target 75%')).toBeInTheDocument();
    expect(screen.getAllByText('Priya Nair').length).toBeGreaterThan(0);
  });

  it('a PM’s team under the limit: per-person figures hidden, no names', () => {
    show(<CapacityBoardScreen live={{ state: 'ready', data: { ...LIVE_CAPACITY, teamSize: 3, privileged: false, suppressed: true, people: [], team: null } }} />);
    expect(screen.getByText('Hidden for small teams')).toBeInTheDocument();
    expect(screen.getByText(/fewer than 5/)).toBeInTheDocument();
    expect(screen.queryByText('Priya Nair')).toBeNull();
  });

  it('no access and Projects off', () => {
    const a = show(<CapacityBoardScreen live={{ state: 'no-access', data: null }} />);
    expect(screen.getByText("You don't have access to capacity")).toBeInTheDocument();
    a.unmount();
    show(<CapacityBoardScreen live={{ state: 'off', data: null }} />);
    expect(screen.getByText('Projects is switched off')).toBeInTheDocument();
  });
});

describe('PRJ-07 Resource requests (live, 1417, 1418)', () => {
  const live = (over: Partial<LiveRequests> = {}): LiveRequests => ({ state: 'ready', data: LIVE_REQUESTS, onRaise: vi.fn().mockResolvedValue(undefined), onMatches: vi.fn().mockResolvedValue(LIVE_MATCHES), onFill: vi.fn().mockResolvedValue(undefined), onWithdraw: vi.fn().mockResolvedValue(undefined), onBench: vi.fn(), ...over });

  it('only the Resource requests list; the bench is a link to the one bench', async () => {
    const l = live();
    show(<BenchRequestsScreen live={l} />);
    expect(screen.queryByRole('tab', { name: /Bench board/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Open the bench' }));
    expect(l.onBench).toHaveBeenCalled();
  });

  it('allocating needs a person chosen; then it fills with the request’s version', async () => {
    const l = live();
    show(<BenchRequestsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Find people' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('list', { name: 'People with free time, bench first' })).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Allocate' }));
    expect(await within(drawer).findByText('Choose a person first.')).toBeInTheDocument();
    expect(l.onFill).not.toHaveBeenCalled();
    await ue.click(within(drawer).getAllByRole('button', { name: 'Choose' })[0]!);
    await ue.click(within(drawer).getByRole('button', { name: 'Allocate' }));
    expect(l.onFill).toHaveBeenCalledWith('q1', 'e5', 1);
  });

  it('a project manager (not Projects resource) raises but cannot fill', () => {
    show(<BenchRequestsScreen live={live({ data: { ...LIVE_REQUESTS, can: { raise: true, fill: false } } })} />);
    expect(screen.getByRole('button', { name: 'Raise request' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find people' })).toBeNull();
  });

  it('no one with enough free time says so', () => {
    show(<BenchRequestsScreen live={live({ defaultMatch: { ...LIVE_MATCHES, matches: [] } })} />);
    expect(screen.getByText('No one has this much free time.')).toBeInTheDocument();
  });

  it('the request form checks project, role and dates; then sends the share chosen', async () => {
    expect(requestProblems({ projectId: null, role: ' ', fromOn: null, toOn: null }).map((p) => p.fieldId)).toEqual(['rq-project', 'rq-role', 'rq-from', 'rq-to']);
    expect(requestProblems({ projectId: 'p', role: 'Dev', fromOn: '2026-12-01', toOn: '2026-11-01' }).map((p) => p.fieldId)).toEqual(['rq-to']);
    const l = live({ defaultRaise: true });
    show(<BenchRequestsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect((await screen.findAllByText('Choose the project.')).length).toBeGreaterThan(0);
    expect(l.onRaise).not.toHaveBeenCalled();
  });
});

describe('the one bench shows project allocation (1417)', () => {
  it('allocated %, and partly or fully allocated', () => {
    show(
      <BenchBoardScreen
        live={{ state: 'ready', onRetry: vi.fn(), policy: { maxDays: 30, payPct: 50, after: 'review' }, canManage: false, onAdd: vi.fn(), onRemove: vi.fn(), onSubmit: vi.fn(), onPlacements: vi.fn(), rows: [
          { id: 'b1', employeeId: 'e1', person: 'Arjun Das', sinceOn: '2026-10-01', days: 42, left: -12, overPolicy: true, lastClient: null, note: null, allocatedPct: 0 },
          { id: 'b2', employeeId: 'e2', person: 'Sana Nizami', sinceOn: '2026-10-26', days: 17, left: 13, overPolicy: false, lastClient: null, note: null, allocatedPct: 50 },
        ] }}
      />,
    );
    expect(screen.getByText('50% allocated')).toBeInTheDocument();
    expect(screen.getByText('Partly allocated')).toBeInTheDocument();
    expect(screen.getByText('0% allocated')).toBeInTheDocument();
    expect(screen.getAllByText('Partly allocated')).toHaveLength(1);
  });
});

describe('PRJ-01 Timesheets tab and PRJ-02 attendance check (1541)', () => {
  const ws = (over: Partial<LiveProjectWorkspace> = {}): LiveProjectWorkspace => {
    const ok = () => vi.fn().mockResolvedValue(undefined);
    return { state: 'ready', detail: LIVE_PROJECT_DETAIL, choices: LIVE_PROJECT_CHOICES, burn: { warn: 80, over: 100 }, onUpdate: ok(), onStatus: ok(), onAllocate: ok(), onChangeAllocation: ok(), onEndAllocation: ok(), onAddTask: ok(), onChangeTask: ok(), onAddMilestone: ok(), onCompleteMilestone: ok(), ...over };
  };

  it('each allocated person’s hours this week against the allocation, with the attendance flag; weeks move', async () => {
    const onTimesheetWeek = vi.fn();
    show(<ProjectWorkspaceScreen defaultTab="timesheets" live={ws({ onTimesheetWeek, timesheets: { week: '2026-11-02', rows: [{ employeeId: 'e2', person: 'Rohit Bhat', bookedHours: 26, approvedHours: 20, allocatedHours: 20, status: 'reduced', mismatch: 'Timesheet 42 h vs attendance 40 h worked' }, { employeeId: 'e3', person: 'Meera Iyer', bookedHours: 0, approvedHours: 0, allocatedHours: 16, status: 'missing', mismatch: null }] } })} />);
    expect(screen.getByText('Timesheet 42 h vs attendance 40 h worked: flagged, not changed')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onTimesheetWeek).toHaveBeenCalledWith('2026-10-26');
  });

  it('no Timesheets tab when the page gives none', () => {
    show(<ProjectWorkspaceScreen live={ws()} />);
    expect(screen.queryByRole('tab', { name: 'Timesheets' })).toBeNull();
  });

  it('a PRJ-02 card shows the attendance check; pay is unchanged', () => {
    const data = { ...LIVE_LINE_APPROVALS, groups: [{ ...LIVE_LINE_APPROVALS.groups[0]!, items: [{ ...LIVE_LINE_APPROVALS.groups[0]!.items[1]!, mismatch: 'Timesheet 42 h vs attendance 40 h worked' }] }] };
    show(<TimesheetApprovalsScreen live={{ state: 'ready', data, onDecide: vi.fn(), onBulk: vi.fn() }} />);
    expect(screen.getByText('Timesheet 42 h vs attendance 40 h worked. Pay is unchanged; check before approving.')).toBeInTheDocument();
  });
});

describe('1547 and Settings 3.11 (1411)', () => {
  it('"The client approves the hours" only when the staffing desk is on', () => {
    const one = show(<ProjectDrawer project={LIVE_PROJECT_ROWS[0]!} choices={{ ...LIVE_PROJECT_CHOICES, staffingDesk: false }} finance={false} onClose={() => {}} onSave={vi.fn()} />);
    expect(screen.queryByRole('switch', { name: /client approves the hours/ })).toBeNull();
    one.unmount();
    show(<ProjectDrawer project={LIVE_PROJECT_ROWS[0]!} choices={{ ...LIVE_PROJECT_CHOICES, staffingDesk: true }} finance={false} onClose={() => {}} onSave={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /client approves the hours/ })).toBeInTheDocument();
  });

  it('the utilisation target and the small-team limit are company settings with their defaults', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
    const v = { 'projects.enabled': 'on', 'projects.utilisation.target_pct': '75', 'projects.small_team.limit': '5' };
    const all = projectSettingsPage(design, { canEdit: true, values: v, defaults: v, choices: { 'projects.utilisation.target_pct': ['70', '75', '80'] }, lastChange: null }).sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'prj.utilisation_target')).toMatchObject({ kind: 'select', value: '75', starter: true });
    expect(all.find((x) => x.key === 'prj.small_team')).toMatchObject({ value: '5', starter: true });
    expect(projectSettingsChanges({ 'prj.utilisation_target': '80', 'prj.small_team': '3' })).toEqual([
      { key: 'projects.utilisation.target_pct', value: '80' },
      { key: 'projects.small_team.limit', value: '3' },
    ]);
  });
});
