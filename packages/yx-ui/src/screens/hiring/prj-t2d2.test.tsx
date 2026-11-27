import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ProjectWorkspaceScreen, type LiveProjectWorkspace } from './projects';
import { LIVE_PROJECT_CHOICES, LIVE_PROJECT_DETAIL, LIVE_PROJECT_GLANCE } from './projects-live-fixtures';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// T2-D part 2 (answers 2865 to 2871) on PRJ-01, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ws = (over: Partial<LiveProjectWorkspace> = {}): LiveProjectWorkspace => {
  const ok = () => vi.fn().mockResolvedValue(undefined);
  return { state: 'ready', detail: LIVE_PROJECT_DETAIL, choices: LIVE_PROJECT_CHOICES, burn: { warn: 80, over: 100 }, onUpdate: ok(), onStatus: ok(), onAllocate: ok(), onChangeAllocation: ok(), onEndAllocation: ok(), onAddTask: ok(), onChangeTask: ok(), onAddMilestone: ok(), onCompleteMilestone: ok(), onMoveTask: ok(), onAssignTask: ok(), ...over };
};

describe('T2-D 56 tasks board and assignees (2865, 2866)', () => {
  it('the board shows the tasks in use by stage, with who they are assigned to; the PM moves one with Move to', async () => {
    const live = ws({ defaultTaskView: 'board' });
    show(<ProjectWorkspaceScreen live={live} defaultTab="tasks" />);
    const board = screen.getByRole('region', { name: 'Tasks of NRP-WEB by stage' });
    expect(within(board).getAllByRole('heading').map((h) => h.textContent?.replace(/\d+$/, '').trim())).toEqual(expect.arrayContaining(['To do', 'In progress', 'Review', 'Done']));
    const build = within(board).getByRole('article', { name: 'Build' });
    expect(build).toHaveTextContent('Priya Nair, Rohit Bhat');
    expect(build).toHaveTextContent('1500 of 1600 h');
    // A task not in use is not on the board.
    expect(within(board).queryByRole('article', { name: 'Internal reviews' })).toBeNull();
    await ue.click(within(build).getByRole('button', { name: 'Move Build' }));
    await ue.click(screen.getByRole('menuitem', { name: 'Done' }));
    expect(live.onMoveTask).toHaveBeenCalledWith('t1', 'done', 3);
  });

  it('negative: without the right to run the project, the board has no moves', () => {
    show(<ProjectWorkspaceScreen live={ws({ defaultTaskView: 'board', detail: { ...LIVE_PROJECT_DETAIL, can: { edit: false, run: false, team: false, finance: false } } })} defaultTab="tasks" />);
    expect(screen.queryByRole('button', { name: 'Move Build' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  });

  it('the list shows each task stage and assignees; Assign people saves the chosen team members', async () => {
    const live = ws();
    show(<ProjectWorkspaceScreen live={live} defaultTab="tasks" />);
    const row = screen.getByRole('row', { name: /Release notes/ });
    expect(row).toHaveTextContent('To do');
    expect(row).toHaveTextContent('Meera Iyer');
    expect(screen.getByRole('row', { name: /Testing/ })).toHaveTextContent('Not assigned');
    await ue.click(within(screen.getByRole('row', { name: /Testing/ })).getByRole('button', { name: /actions/i }));
    await ue.click(screen.getByRole('menuitem', { name: 'Assign people' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Rohit Bhat' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(live.onAssignTask).toHaveBeenCalledWith('t2', ['e2'], 1);
  });

  it('negative: an older API without stages shows no board switch and no stage column', () => {
    const { stages: _s, ...old } = LIVE_PROJECT_DETAIL;
    show(<ProjectWorkspaceScreen live={ws({ detail: old })} defaultTab="tasks" />);
    expect(screen.queryByRole('radiogroup', { name: 'Show tasks as' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Stage' })).toBeNull();
  });
});

describe('T2-D 56 the company task stages on Settings 3.11 (2865)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
  const data = { canEdit: true, values: { 'projects.task.extra_stages': 'Review' }, defaults: { 'projects.task.extra_stages': '' }, choices: {}, lastChange: null };
  it('shows the company stages as text and saves them back', () => {
    const f = projectSettingsPage(design, data).sections.flatMap((s) => s.settings).find((x) => x.key === 'prj.task_stages');
    expect(f).toMatchObject({ kind: 'text', value: 'Review', starter: false });
    expect(projectSettingsChanges({ 'prj.task_stages': 'Review, QA' })).toEqual([{ key: 'projects.task.extra_stages', value: 'Review, QA' }]);
  });
  it('negative: an older API without the setting never shows a sample value', () => {
    expect(projectSettingsPage(design, { ...data, values: {} }).sections.flatMap((s) => s.settings).find((x) => x.key === 'prj.task_stages')).toBeUndefined();
  });
});

describe('T2-D 57 actions pending and who is away (2867, 2868)', () => {
  it('the PM sees each action with its count and a link; nothing to invoice is left out', async () => {
    const open = vi.fn();
    show(<ProjectWorkspaceScreen live={ws({ glance: LIVE_PROJECT_GLANCE, onOpenLink: open })} />);
    const card = screen.getByRole('region', { name: 'Actions pending' });
    expect(card).toHaveTextContent('2 weeks are waiting for your approval');
    expect(card).toHaveTextContent('1 person has not sent last week');
    expect(card).toHaveTextContent('Meera Iyer');
    expect(card).toHaveTextContent('1 resource request is waiting');
    expect(card).not.toHaveTextContent('ready to invoice');
    await ue.click(within(card).getAllByRole('button', { name: 'Open' })[0]!);
    expect(open).toHaveBeenCalledWith('/yx/projects/approvals');
    expect(screen.getByText('Rohit Bhat')).toBeInTheDocument();
    expect(screen.getByText('Away 3 Dec, 4 Dec')).toBeInTheDocument();
  });

  it('negative: a team member sees who is away but no actions pending; the leave type never shows', () => {
    show(<ProjectWorkspaceScreen live={ws({ glance: { pending: null, away: LIVE_PROJECT_GLANCE.away } })} />);
    expect(screen.queryByRole('heading', { name: 'Actions pending' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Away in the next 14 days' })).toBeInTheDocument();
    expect(screen.queryByText(/leave/i)).toBeNull();
  });

  it('negative: nothing pending and no one away say so', () => {
    show(<ProjectWorkspaceScreen live={ws({ glance: { pending: [], away: { ...LIVE_PROJECT_GLANCE.away!, people: [] } } })} />);
    expect(screen.getByText('Nothing waiting for you.')).toBeInTheDocument();
    expect(screen.getByText('No one on the project is away.')).toBeInTheDocument();
  });
});
