import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AccessRequestContext } from '../../components/feedback';
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

  it('no access: the kit no-access page, never naming a key; Projects off is its own plain state', () => {
    const { unmount } = show(<ProjectsListScreen live={list({ state: 'no-access', rows: [] })} />);
    expect(screen.getByText("You don't have access to Projects")).toBeInTheDocument();
    expect(screen.getByText(/Ask your System Admin to give you access/)).toBeInTheDocument();
    expect(screen.queryByText(/key/i)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    unmount();
    show(<ProjectsListScreen live={list({ state: 'off', rows: [] })} />);
    expect(screen.getByText('Projects is switched off')).toBeInTheDocument();
    expect(screen.queryByText(/don't have access/)).toBeNull();
  });

  it('Request access from the Projects page (answer 946) names Projects', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <AccessRequestContext.Provider value={() => ({ maxDays: 30, sent: null, send })}>
        <ToastProvider>
          <ProjectsListScreen live={list({ state: 'no-access', rows: [] })} />
        </ToastProvider>
      </AccessRequestContext.Provider>,
    );
    await ue.click(screen.getByRole('button', { name: 'Request access' }));
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(send).not.toHaveBeenCalled(); // a reason first
    await ue.type(screen.getByRole('textbox', { name: /Why do you need access/ }), 'I run the Kaveri ERP project');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ what: 'Projects', reason: 'I run the Kaveri ERP project' }));
  });

  it('a long code and project name end in an ellipsis with the full text as the tooltip', () => {
    const long = { ...LIVE_PROJECT_ROWS[0]!, id: 'pl', code: 'FSSAI-AUDIT', name: 'FSSAI audit readiness for the Hosur and Kolar plants', client: 'Nilgiri Retail Private Limited' };
    show(<ProjectsListScreen live={list({ rows: [long] })} />);
    expect(screen.getByTitle('FSSAI-AUDIT')).toHaveClass('yx-hire-clip');
    expect(screen.getByTitle('FSSAI audit readiness for the Hosur and Kolar plants')).toBeInTheDocument();
    expect(screen.getByTitle('Nilgiri Retail Private Limited')).toBeInTheDocument();
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

  it('B3 (answer 2537): the Team tab shows approved billable and non-billable and total booked over a range; the range asks again', async () => {
    const onHoursRange = vi.fn();
    const detail = { ...LIVE_PROJECT_DETAIL, hoursRange: 'week' as const, allocations: LIVE_PROJECT_DETAIL.allocations.map((a, i) => ({ ...a, hours: { billable: i ? 0 : 30, nonBillable: i ? 5 : 2, booked: i ? 6 : 34 } })) };
    show(<ProjectWorkspaceScreen live={ws({ detail, onHoursRange })} />);
    await ue.click(screen.getByRole('tab', { name: /^Team/ }));
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Billable (approved)', 'Non-billable (approved)', 'Total booked']));
    expect(heads).not.toContain('Hours booked');
    expect(screen.getByRole('radio', { name: 'This week' })).toBeChecked();
    await ue.click(screen.getByRole('radio', { name: 'This month' }));
    expect(onHoursRange).toHaveBeenCalledWith('month');
  });

  it('negative: an older API without range hours keeps the one Hours booked column', async () => {
    show(<ProjectWorkspaceScreen live={ws()} />);
    await ue.click(screen.getByRole('tab', { name: /^Team/ }));
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toContain('Hours booked');
    expect(heads).not.toContain('Billable (approved)');
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
    expect(screen.getByText("You don't have access to this project")).toBeInTheDocument();
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

  it('A14 (answer 2536): the nudge time, the due day and the reminder time show with the company values and save back', () => {
    const vals = { ...data.values, 'timesheet.nudge.daily_from': '17:00', 'timesheet.reminder.cutoff_day': 'off', 'timesheet.reminder.time': '10:00' };
    const all = projectSettingsPage(design, { ...data, values: vals, defaults: { ...data.defaults, 'timesheet.nudge.daily_from': '16:00', 'timesheet.reminder.cutoff_day': 'fri', 'timesheet.reminder.time': '10:00' } }).sections.flatMap((x) => x.settings);
    expect(all.find((x) => x.key === 'prj.nudge_from')).toMatchObject({ value: '17:00', starter: false });
    expect(all.find((x) => x.key === 'prj.cutoff_day')).toMatchObject({ value: 'off', optionLabels: expect.objectContaining({ off: 'No reminder' }) });
    expect(all.find((x) => x.key === 'prj.reminder_time')).toMatchObject({ value: '10:00', starter: true });
    expect(projectSettingsChanges({ 'prj.nudge_from': 'off', 'prj.cutoff_day': 'thu', 'prj.reminder_time': '09:00' })).toEqual([
      { key: 'timesheet.nudge.daily_from', value: 'off' },
      { key: 'timesheet.reminder.cutoff_day', value: 'thu' },
      { key: 'timesheet.reminder.time', value: '09:00' },
    ]);
    // An older API without them never shows them with sample values.
    expect(projectSettingsPage(design, data).sections.flatMap((x) => x.settings).some((x) => x.key === 'prj.nudge_from')).toBe(false);
  });

  it("Shifts set-up's projects tab says where projects went and has no editor", () => {
    render(<ProjectsTab />);
    expect(screen.getByText('Timesheet projects moved to Projects')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a project' })).toBeNull();
  });
});

// P-6 (founder 12 Nov): the FinanceList margin and the workspace Billing tab, live.
const BILLING_TAB: NonNullable<LiveProjectWorkspace['billing']> = {
  model: 'time_material',
  fee: null,
  ready: '616000.00',
  readyHours: 280,
  waitingHours: 40,
  billed: '1240000.00',
  unbilled: [
    { id: 'h1', source: 'Timesheet hours', detail: 'Priya Nair, 120 h × ₹2,200', hours: 120, amount: '264000.00', held: null },
    { id: 'h2', source: 'Timesheet hours', detail: 'Sana Nizami, 40 h × ₹2,200', hours: 40, amount: '88000.00', held: 'waiting for client approval' },
  ],
  invoices: [{ id: 'i0', number: 'KF/TN/151', kind: 'Invoice', status: 'issued', date: '2026-10-01', amount: '1252800.00' }],
};

describe('P-6: margin in the finance list, and the Billing tab', () => {
  it('Projects finance sees fee billed and margin from the stored totals; others never do', () => {
    const a = show(<ProjectsListScreen live={list({ rows: LIVE_PROJECT_ROWS_FINANCE, can: { create: false, finance: true } })} />);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['Fee billed', 'Margin']));
    expect(screen.getByText('31%')).toBeInTheDocument();
    a.unmount();
    show(<ProjectsListScreen live={list({ rows: LIVE_PROJECT_ROWS_FINANCE.map(({ billed: _b, margin: _m, ...r }) => r) })} />);
    const plain = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(plain).not.toContain('Margin');
    expect(plain).not.toContain('Fee billed');
  });

  it('the Billing tab: unbilled work, hours waiting for the client, billed to date and invoices that open in Staffing desk', async () => {
    const onOpenInvoice = vi.fn();
    show(<ProjectWorkspaceScreen defaultTab="billing" live={ws({ billing: BILLING_TAB, onOpenInvoice })} />);
    expect(screen.getByRole('tab', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.getByText('40 h')).toBeInTheDocument();
    expect(screen.getByText('Held: waiting for client approval')).toBeInTheDocument();
    await ue.click(screen.getByText('KF/TN/151'));
    expect(onOpenInvoice).toHaveBeenCalledWith('i0');
  });

  it('no Billing tab for a project manager or an employee (the page passes no billing)', () => {
    show(<ProjectWorkspaceScreen live={ws()} />);
    expect(screen.queryByRole('tab', { name: 'Billing' })).toBeNull();
  });
});
