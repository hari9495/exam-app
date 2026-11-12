import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ProjectsListScreen, ProjectWorkspaceScreen, type LiveProjectWorkspace, type LiveProjectsList } from './projects';
import { LIVE_FIXED_FEE_DETAIL, LIVE_PROJECT_CHOICES, LIVE_PROJECT_DETAIL, LIVE_PROJECT_ROWS, LIVE_PROJECT_ROWS_FINANCE } from './projects-live-fixtures';
import { projectProblems } from './projects-live';
import { ProjectsTab } from '../time/live/shifts-setup';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-1 (answers 1401 to 1405, 1412, 1420): the designed PRJ-01 list and workspace with `live`, Settings 3.11,
// and Shifts set-up's moved projects tab. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const list = (over: Partial<LiveProjectsList> = {}): LiveProjectsList => ({ state: 'ready', rows: LIVE_PROJECT_ROWS, can: { create: true, finance: false }, choices: LIVE_PROJECT_CHOICES, onOpen: vi.fn(), onCreate: vi.fn().mockResolvedValue('p9'), ...over });
const ws = (over: Partial<LiveProjectWorkspace> = {}): LiveProjectWorkspace => {
  const ok = () => vi.fn().mockResolvedValue(undefined);
  return { state: 'ready', detail: LIVE_PROJECT_DETAIL, choices: LIVE_PROJECT_CHOICES, burn: { warn: 80, over: 100 }, onUpdate: ok(), onStatus: ok(), onAllocate: ok(), onChangeAllocation: ok(), onEndAllocation: ok(), onAddTask: ok(), onChangeTask: ok(), onAddMilestone: ok(), onCompleteMilestone: ok(), ...over };
};

describe('PRJ-01 Projects list (live)', () => {
  it('lists the projects with hours burn and people; no fee, margin or utilisation without Projects finance', () => {
    show(<ProjectsListScreen live={list()} />);
    expect(screen.getByText('NRP-WEB')).toBeInTheDocument();
    expect(screen.getByText('OLDAUDIT')).toBeInTheDocument();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Code', 'Project', 'Billing', 'Project manager', 'Status', 'Hours burn', 'People', 'Actions']);
  });

  it('Projects finance sees the fee; someone without projects.manage gets no New project button', () => {
    show(<ProjectsListScreen live={list({ rows: LIVE_PROJECT_ROWS_FINANCE, can: { create: false, finance: true } })} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Fee');
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });

  it('no access (or Projects off) says why and shows no list', () => {
    show(<ProjectsListScreen live={list({ state: 'no-access', rows: [] })} />);
    expect(screen.getByText("You can't open Projects.")).toBeInTheDocument();
    expect(screen.getByText(/Settings › Projects & timesheets/)).toBeInTheDocument();
  });

  it('Create project pressed empty says what is missing and sends nothing (never disabled)', async () => {
    const l = list();
    show(<ProjectsListScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'New project' }));
    const create = screen.getByRole('button', { name: 'Create project' });
    expect(create).toBeEnabled();
    await ue.click(create);
    expect((await screen.findAllByText('Give the project a name.')).length).toBeGreaterThan(0);
    expect(l.onCreate).not.toHaveBeenCalled();
  });

  it('creates a non-billable draft and opens it', async () => {
    const l = list();
    show(<ProjectsListScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'New project' }));
    await ue.type(screen.getByRole('textbox', { name: /Code/ }), 'APOLLO');
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'Apollo rollout');
    // New projects start billable (the design's starter); a billable one needs a client.
    await ue.click(screen.getByRole('button', { name: 'Create project' }));
    expect((await screen.findAllByText('A billable project needs a client.')).length).toBeGreaterThan(0);
    expect(l.onCreate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'Non-billable' }));
    await ue.click(screen.getByRole('button', { name: 'Create project' }));
    expect(l.onCreate).toHaveBeenCalledWith(expect.objectContaining({ code: 'APOLLO', name: 'Apollo rollout', billingModel: 'non_billable' }));
    expect(vi.mocked(l.onCreate).mock.calls[0]![0]).not.toHaveProperty('fee');
    expect((await screen.findAllByText('APOLLO created as a draft')).length).toBeGreaterThan(0);
    expect(l.onOpen).toHaveBeenCalledWith('p9');
  });

  it('the form checks: code shape, a client for billable projects, end after start', () => {
    const base = { code: 'A1', name: 'X', managerUserId: null, clientId: null, billingModel: 'non_billable' as const, startOn: null, endOn: null, budgetHours: null, clientAcceptsMilestones: false };
    expect(projectProblems(base)).toEqual([]);
    expect(projectProblems({ ...base, code: 'a1' }).map((p) => p.fieldId)).toEqual(['prj-code']);
    expect(projectProblems({ ...base, billingModel: 'fixed_fee' }).map((p) => p.fieldId)).toEqual(['prj-client']);
    expect(projectProblems({ ...base, startOn: '2026-12-01', endOn: '2026-11-01' }).map((p) => p.fieldId)).toEqual(['prj-end']);
  });
});

describe('PRJ-01 Project workspace (live)', () => {
  it('shows the burn alert at the company level and only the P-1 tabs (no timesheets, billing or expenses yet)', () => {
    show(<ProjectWorkspaceScreen live={ws()} />);
    expect(screen.getByText('Budget burn alert')).toBeInTheDocument();
    expect(screen.getByText(/hours at 85% of budget/)).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Project sections' })).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs.join('|')).not.toMatch(/Timesheets|Billing|Expenses/);
    expect(screen.queryByText(/Margin/)).toBeNull();
  });

  it('no burn alert under the company level', () => {
    show(<ProjectWorkspaceScreen live={ws({ burn: { warn: 90, over: 100 } })} />);
    expect(screen.queryByText('Budget burn alert')).toBeNull();
  });

  it('closing asks first, then sends the status with the version', async () => {
    const l = ws();
    show(<ProjectWorkspaceScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'More actions' })[0]!);
    await ue.click(await screen.findByRole('menuitem', { name: 'Close project' }));
    expect(l.onStatus).not.toHaveBeenCalled();
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close project' }));
    expect(l.onStatus).toHaveBeenCalledWith('closed', 3);
  });

  it('a reader (no edit, no team) gets no actions', () => {
    show(<ProjectWorkspaceScreen live={ws({ detail: { ...LIVE_PROJECT_DETAIL, can: { edit: false, run: false, team: false, finance: false } } })} />);
    expect(screen.queryByRole('button', { name: 'Add allocation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('a closed project shows the closed note and takes no team changes', () => {
    show(<ProjectWorkspaceScreen live={ws({ detail: { ...LIVE_PROJECT_DETAIL, project: { ...LIVE_PROJECT_DETAIL.project, status: 'closed' } } })} />);
    expect(screen.getByText('Closed project')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add allocation' })).toBeNull();
  });

  it('adds someone to the team; pressed empty it says who is missing and sends nothing', async () => {
    const l = ws();
    show(<ProjectWorkspaceScreen live={l} defaultTab="team" />);
    await ue.click(screen.getByRole('button', { name: 'Add allocation' }));
    const add = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add allocation' });
    await ue.click(add);
    expect(l.onAllocate).not.toHaveBeenCalled();
  });

  it('completes a milestone after asking (client acceptance on: it then waits for the client)', async () => {
    const l = ws({ detail: LIVE_FIXED_FEE_DETAIL });
    show(<ProjectWorkspaceScreen live={l} defaultTab="tasks" />);
    expect(screen.getByText('Completed · waiting for client')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(screen.getByText(/waits for the client to accept it/)).toBeInTheDocument();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark complete' }));
    expect(l.onCompleteMilestone).toHaveBeenCalledWith('m2', 1);
  });

  it('loading and error states', () => {
    const { unmount } = show(<ProjectWorkspaceScreen live={ws({ state: 'error', detail: null })} />);
    expect(screen.getByText("We couldn't load the project.")).toBeInTheDocument();
    unmount();
    show(<ProjectWorkspaceScreen live={ws({ state: 'no-access', detail: null })} />);
    expect(screen.getByText("You can't open this project.")).toBeInTheDocument();
  });
});

describe('Settings 3.11 and Shifts set-up (Projects P-1)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
  const data = { canEdit: true, values: { 'projects.enabled': 'off', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100' }, defaults: { 'projects.enabled': 'off', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100' }, choices: { 'projects.burn.warn_pct': ['70', '80'], 'projects.burn.over_pct': ['100', '120'] }, lastChange: null };

  it('shows only the live fields with the company values; the projects link only once Projects is on', () => {
    const page = projectSettingsPage(design, data);
    const keys = page.sections.flatMap((s) => s.settings.map((x) => x.key));
    expect(keys).toEqual(['prj.enabled', 'prj.booking_rule', 'prj.burn_alert_1', 'prj.burn_alert_2']);
    const all = page.sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'prj.enabled')!.value).toBe(false);
    expect(all.find((x) => x.key === 'prj.booking_rule')!.value).toBe('Block');
    expect(projectSettingsPage(design, { ...data, values: { ...data.values, 'projects.enabled': 'on' } }).sections.flatMap((s) => s.settings.map((x) => x.key))).toContain('prj.projects');
  });

  it('turns the page values back into company settings (unknown fields dropped)', () => {
    expect(projectSettingsChanges({ 'prj.enabled': true, 'prj.booking_rule': 'Allow', 'prj.burn_alert_1': '70', 'prj.daily_max': 12 })).toEqual([
      { key: 'projects.enabled', value: 'on' },
      { key: 'projects.booking.allocated_only', value: 'off' },
      { key: 'projects.burn.warn_pct', value: '70' },
    ]);
  });

  it("Shifts set-up's projects tab says where projects went and has no editor", () => {
    render(<ProjectsTab />);
    expect(screen.getByText('Timesheet projects moved to Projects')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a project' })).toBeNull();
  });
});
