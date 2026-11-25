import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CostingMarginScreen, ProjectWorkspaceScreen, type LiveCosts, type LiveProjectWorkspace } from './projects';
import { LIVE_COSTS, LIVE_PROJECT_CHOICES, LIVE_PROJECT_DETAIL } from './projects-live-fixtures';
import { ClaimComposerScreen } from '../ops/expenses';
import { CATEGORIES, DRAFT } from '../ops/expenses-live-samples';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-5 (PRJ-04, answers 1412, 1413, 1419): totals only; finance sees revenue and margin; a PM never a rate.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const costs = (over: Partial<LiveCosts> = {}): LiveCosts => ({ state: 'ready', data: LIVE_COSTS, months: ['2026-11', '2026-10'], onMonth: vi.fn(), onOpen: vi.fn(), ...over });

describe('PRJ-04 Costing and margin (live)', () => {
  it('finance: cost, expenses, revenue and margin; provisional months and a restatement are said', () => {
    show(<CostingMarginScreen live={costs()} />);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(['People cost', 'Expenses', 'Revenue', 'Margin', 'Cost basis']));
    expect(screen.getByText(/costs are provisional/)).toBeInTheDocument();
    expect(screen.getByText(/NRP-WEB: provisional ₹4,51,200(\.00)?, final ₹4,59,000/)).toBeInTheDocument();
    expect(screen.getByText('77%')).toBeInTheDocument();
  });

  it('a project manager: totals only, a small month hidden, no revenue, margin or rates', () => {
    const data = { ...LIVE_COSTS, finance: false, rows: LIVE_COSTS.rows.map((r) => ({ ...r, rebill: null, revenue: null, margin: null, restatedFrom: null, ...(r.people < 2 ? { hidden: true, cost: null, expenses: null } : {}) })) };
    show(<CostingMarginScreen live={costs({ data })} />);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).not.toContain('Revenue');
    expect(heads).not.toContain('Margin');
    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0);
    expect(screen.getByText(/fewer than 2 people/)).toBeInTheDocument();
    expect(screen.queryByText(/rate/i, { selector: 'td' })).toBeNull();
  });

  it('no access, and the month picker', async () => {
    const a = show(<CostingMarginScreen live={costs({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to project cost")).toBeInTheDocument();
    a.unmount();
    const l = costs();
    show(<CostingMarginScreen live={l} />);
    expect(screen.getByRole('combobox', { name: 'Period' })).toBeInTheDocument();
  });
});

describe('the workspace: cost to date and the Expenses tab (1412, 1419)', () => {
  const ws = (over: Partial<LiveProjectWorkspace> = {}): LiveProjectWorkspace => {
    const ok = () => vi.fn().mockResolvedValue(undefined);
    return { state: 'ready', detail: LIVE_PROJECT_DETAIL, choices: LIVE_PROJECT_CHOICES, burn: { warn: 80, over: 100 }, onUpdate: ok(), onStatus: ok(), onAllocate: ok(), onChangeAllocation: ok(), onEndAllocation: ok(), onAddTask: ok(), onChangeTask: ok(), onAddMilestone: ok(), onCompleteMilestone: ok(), ...over };
  };

  it('a PM sees the total and how many months are left out; never a rate', () => {
    show(<ProjectWorkspaceScreen live={ws({ cost: { finance: false, hiddenMonths: 1, provisional: false, total: '742000.00', months: [] } })} />);
    expect(screen.getByText('Cost to date')).toBeInTheDocument();
    expect(screen.getByText(/1 month is left out: too few people/)).toBeInTheDocument();
    expect(screen.getByText(/Individual cost rates are visible to payroll and finance only/)).toBeInTheDocument();
  });

  it('no cost object: no cost shown at all (non-finance, not the manager)', () => {
    show(<ProjectWorkspaceScreen live={ws()} />);
    expect(screen.queryByText('Cost to date')).toBeNull();
  });

  it('the Expenses tab lists the lines naming the project, with re-billing', async () => {
    show(<ProjectWorkspaceScreen live={ws({ expenses: [{ id: 'x1', person: 'Priya Nair', what: 'Travel', spentOn: '2026-10-10', amount: '4860.00', rebill: true, status: 'Approved' }] })} />);
    await ue.click(screen.getByRole('tab', { name: /Expenses/ }));
    expect(screen.getByText('Rebill')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
  });
});

describe('expense lines name a project only when the company has it on (1419)', () => {
  const noop = vi.fn(async () => ({}));
  const live = (claim: typeof DRAFT) => ({ state: 'ready' as const, onRetry: vi.fn(), claim, categories: CATEGORIES, today: '2026-09-20', startAdd: 'bill' as const, onBack: vi.fn(), onUploadReceipt: noop, onSaveLine: noop, onRemoveLine: noop, onSubmit: noop, onWithdraw: noop, onOpenReceipt: noop, onApproveAmount: noop, onDecide: noop, onFlag: noop });

  it('off: no project field', async () => {
    show(<ClaimComposerScreen live={live({ ...DRAFT, projects: null })} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Project/ })).toBeNull();
  });

  it('on: a project to choose; re-billing offered only for a project with a client', async () => {
    show(<ClaimComposerScreen live={live({ ...DRAFT, projects: [{ id: 'p1', code: 'NRP-WEB', name: 'Nilgiri Retail web rebuild', client: true }] })} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /Re-bill/ })).toBeNull();
  });
});

describe('Settings 3.11 (1412, 1419)', () => {
  it('the people limit for a PM’s cost and the expense switch, with their defaults', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
    const v = { 'projects.enabled': 'on', 'projects.cost.min_people': '2', 'projects.expenses.enabled': 'off', 'timesheet.tool_suggestions': 'off' };
    const all = projectSettingsPage(design, { canEdit: true, values: v, defaults: v, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'prj.cost_min_people')).toMatchObject({ value: '2', starter: true });
    expect(all.find((x) => x.key === 'prj.expenses_projects')).toMatchObject({ value: false, starter: true });
    expect(all.find((x) => x.key === 'prj.prefill_enabled')).toMatchObject({ value: false });
    expect(projectSettingsChanges({ 'prj.cost_min_people': '3', 'prj.expenses_projects': true })).toEqual([
      { key: 'projects.cost.min_people', value: '3' },
      { key: 'projects.expenses.enabled', value: 'on' },
    ]);
  });
});
