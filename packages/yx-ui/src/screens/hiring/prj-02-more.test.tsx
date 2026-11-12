import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ClientPortalScreen, type LiveClientPortal } from '../portals/t9-business';
import { TimesheetScreen, type LiveTimesheet } from '../time/ops';
import { MY_TIMESHEET, TODAY } from '../time/live/fixtures';
import type { MyTimesheet } from '../time/live/types';
import { ProjectDrawer } from './projects-drawers';
import { LIVE_PROJECT_CHOICES, LIVE_PROJECT_ROWS } from './projects-live-fixtures';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-2 (answers 1406 to 1408, 1442; 914): what the person, the client and the System Admin see. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('the person sees each decision and its reason (1406)', () => {
  const sheet = (data: MyTimesheet): LiveTimesheet => ({ state: 'ready', data, week: data.week, today: TODAY, onWeek: vi.fn(), onSave: vi.fn(async () => ({})), onSubmit: vi.fn(async () => ({})), onWithdraw: vi.fn(async () => ({})) });
  const p = MY_TIMESHEET.projects[0]!;
  const line = (over: Partial<MyTimesheet['lines'][number]>) => ({ id: 'x', projectId: p.id, activity: null, billable: false, minutes: [480, 480, 0, 0, 0, 0, 0], note: null, ...over });

  it('a reduced and a rejected line show with their reasons; an approved one does not', () => {
    const data: MyTimesheet = { ...MY_TIMESHEET, sheet: { id: 'ts1', status: 'approved', totalMinutes: 1920 }, lines: [line({ id: 'a', decision: 'reduced', reason: 'Offsite on Tuesday', approvedMinutes: [480, 240, 0, 0, 0, 0, 0] }), line({ id: 'b', decision: 'rejected', reason: 'Not this project' }), line({ id: 'c', decision: 'approved' })] };
    wrap(<TimesheetScreen live={sheet(data)} />);
    const list = screen.getByRole('list', { name: 'Changed hours' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(/reduced from 16 h to 12 h\. Reason: Offsite on Tuesday/)).toBeInTheDocument();
    expect(within(list).getByText(/16 h rejected\. Reason: Not this project/)).toBeInTheDocument();
  });

  it('while lines wait it says how many are decided; nothing changed shows no list', () => {
    const data: MyTimesheet = { ...MY_TIMESHEET, sheet: { id: 'ts1', status: 'pending', totalMinutes: 1920 }, lines: [line({ id: 'a', decision: 'approved' }), line({ id: 'b', decision: 'pending' })] };
    wrap(<TimesheetScreen live={sheet(data)} />);
    expect(screen.getByText('1 of 2 lines decided; the rest are waiting.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changed hours' })).toBeNull();
  });
});

describe('the client approves only their own project lines (1408, 914)', () => {
  const live = (over: Partial<LiveClientPortal> = {}): LiveClientPortal => ({
    tenant: 'demo',
    tab: 'timesheets',
    hrefFor: (t) => `?tab=${t}`,
    state: 'ready',
    onRetry: vi.fn(),
    ended: false,
    onSignInAgain: vi.fn(),
    onSignOut: vi.fn(),
    today: new Date(2026, 10, 10),
    data: { client: { name: 'Nilgiri', contact: 'Meera', email: 'meera@nilgiri.test', contractEnds: '2027-03-31' }, jobs: [], submissions: [], timesheets: [], invoices: [], projectHours: [{ id: 'l1', worker: 'Priya Nair', project: 'NRP-WEB · Nilgiri Retail web rebuild', task: 'Build', weekStart: '2026-11-02', hours: '34', status: 'Waiting for you', note: null }, { id: 'l2', worker: 'Rohit Bhat', project: 'NRP-WEB · Nilgiri Retail web rebuild', task: null, weekStart: '2026-10-26', hours: '20', status: 'Approved', note: null }] },
    onDecide: vi.fn().mockResolvedValue(undefined),
    onTimesheet: vi.fn().mockResolvedValue(undefined),
    onProjectHours: vi.fn().mockResolvedValue(undefined),
    ...over,
  });

  it('lists the project lines; approves one', async () => {
    const l = live();
    wrap(<ClientPortalScreen live={l} />);
    const list = screen.getByRole('list', { name: 'Project hours' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await ue.click(within(list).getByRole('button', { name: 'Approve' }));
    expect(l.onProjectHours).toHaveBeenCalledWith('l1', 'approve');
  });

  it('send back needs a note; then it goes with the note', async () => {
    const l = live();
    wrap(<ClientPortalScreen live={l} />);
    await ue.click(within(screen.getByRole('list', { name: 'Project hours' })).getByRole('button', { name: 'Send back' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(await within(dialog).findByText('Say what is wrong, in a few words.')).toBeInTheDocument();
    expect(l.onProjectHours).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'Priya was on leave on Friday');
    await ue.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(l.onProjectHours).toHaveBeenCalledWith('l1', 'send_back', 'Priya was on leave on Friday');
  });

  it('no project hours: no project card', () => {
    wrap(<ClientPortalScreen live={live({ data: { ...live().data!, projectHours: [] } })} />);
    expect(screen.queryByRole('list', { name: 'Project hours' })).toBeNull();
  });
});

describe('the project and Settings 3.11 (1408, 1407, 1442)', () => {
  it('client approval of hours is a per-project choice, off by default, offered once there is a client', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(<ProjectDrawer project={null} choices={LIVE_PROJECT_CHOICES} finance={false} onClose={() => {}} onSave={onSave} />);
    expect(screen.queryByRole('switch', { name: /client approves the hours/ })).toBeNull();
  });

  it('on a project with a client: off by default; switched on, it is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(<ProjectDrawer project={LIVE_PROJECT_ROWS[0]!} choices={LIVE_PROJECT_CHOICES} finance={false} onClose={() => {}} onSave={onSave} />);
    const sw = screen.getByRole('switch', { name: /client approves the hours/ });
    expect(sw).not.toBeChecked();
    await ue.click(sw);
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', clientApprovesHours: true }));
  });

  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
  const v = { 'projects.enabled': 'on', 'projects.booking.allocated_only': 'approval', 'projects.bulk.within_allocation': 'on' };
  it('the booking rule has "allow with project manager approval"; bulk within allocation is a setting, on by default', () => {
    const all = projectSettingsPage(design, { canEdit: true, values: v, defaults: { ...v, 'projects.booking.allocated_only': 'on' }, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'prj.booking_rule')).toMatchObject({ value: 'Allow with project manager approval', starter: false });
    expect(all.find((x) => x.key === 'prj.bulk_within_allocation')).toMatchObject({ value: true, starter: true });
    expect(projectSettingsChanges({ 'prj.booking_rule': 'Allow with project manager approval', 'prj.bulk_within_allocation': false })).toEqual([
      { key: 'projects.booking.allocated_only', value: 'approval' },
      { key: 'projects.bulk.within_allocation', value: 'off' },
    ]);
    expect(projectSettingsChanges({ 'prj.booking_rule': 'Block' })).toEqual([{ key: 'projects.booking.allocated_only', value: 'on' }]);
  });
});
