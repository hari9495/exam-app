import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HybridPlannerScreen } from './roster';
import { TimesheetScreen, type LiveTimesheet } from './ops';
import type { HybridCompliance, HybridDay, HybridMe, HybridTeam, LiveHybrid } from './hybrid-live';
import type { LivePrefill, PrefillSuggestions, PrefillTools } from './prefill-live';
import { MY_TIMESHEET, TODAY } from './live/fixtures';

// The designed TIM-41 and TIM-43 screens with the live app's data: every state each live page must show.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
// Next week, Mon 2 – Fri 6 Nov 2026: Wednesday is the anchor day, Thursday a holiday.
const NW = '2026-11-02';
const on = (k: number) => `2026-11-0${2 + k}`;
const days = (place: (k: number) => HybridDay['place'] = () => null): HybridDay[] =>
  [0, 1, 2, 3, 4].map((k) => ({ on: on(k), place: k === 2 ? 'office' : place(k), anchor: k === 2, closed: k === 3 ? 'holiday' : null, note: k === 3 ? 'Kannada Rajyotsava' : null }));
const RULE = { officeDays: 3, anchors: [2], evidence: ['geofence', 'network', 'kiosk'] as ('geofence' | 'network' | 'kiosk')[] };
const ME: HybridMe = { employee: { id: 'e1', name: 'Arun Prakash' }, today: '2026-10-29', week: NW, thisWeek: '2026-10-26', nextWeek: NW, rule: RULE, days: days(), colleagues: [{ on: on(0), names: ['Meera Krishnan'] }, ...[1, 2, 3, 4].map((k) => ({ on: on(k), names: [] }))], can: { team: false, compliance: false, policy: false } };
const TEAM: HybridTeam = { week: NW, people: [{ employeeId: 'e2', name: 'Meera Krishnan', rule: RULE, days: days((k) => (k === 0 ? 'office' : 'home')) }, { employeeId: 'e3', name: 'Rahul Deshpande', rule: RULE, days: days(() => 'home') }] };
const COMPLIANCE: HybridCompliance = {
  week: '2026-10-19',
  thisWeek: '2026-10-26',
  people: [
    { employeeId: 'e2', name: 'Meera Krishnan', rule: RULE, noRule: false, target: 3, planned: 3, office: 3, leave: 0, counted: 3, met: true, short: 0, missed: [] },
    { employeeId: 'e3', name: 'Rahul Deshpande', rule: RULE, noRule: false, target: 3, planned: 3, office: 1, leave: 0, counted: 1, met: false, short: 2, missed: ['2026-10-19'] },
    { employeeId: 'e4', name: 'Fathima Beevi', rule: { ...RULE, officeDays: 0 }, noRule: true, target: 0, planned: 0, office: 0, leave: 0, counted: 0, met: false, short: 0, missed: [] },
  ],
};
const hybrid = (o: Partial<LiveHybrid> = {}): LiveHybrid => ({ me: { state: 'ready', data: ME, onRetry: vi.fn() }, week: NW, onWeek: vi.fn(), onPlan: ok(), onRemind: ok(), onPolicy: ok(), ...o });

describe('Hybrid office days (TIM-41 live)', () => {
  it('loading and error states, with retry', async () => {
    const { unmount } = render(<HybridPlannerScreen live={hybrid({ me: { state: 'loading', data: null } })} />);
    expect(screen.getByRole('status', { name: 'Loading your office days' })).toBeInTheDocument();
    unmount();
    const retry = vi.fn();
    render(<HybridPlannerScreen live={hybrid({ me: { state: 'error', data: null, onRetry: retry } })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(retry).toHaveBeenCalled();
  });

  it('employee: anchor and holiday fixed; Save pressed with no change says why; a pick saves with a toast', async () => {
    const live = hybrid();
    render(<HybridPlannerScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'My office days' })).toBeInTheDocument();
    expect(screen.getByText('Holiday · Kannada Rajyotsava')).toBeInTheDocument();
    expect(screen.getByText('You: 1 of 3 office days')).toBeInTheDocument();
    expect(screen.getByText('Meera Krishnan')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save plan' }));
    expect((await screen.findAllByText('No changes yet: pick office days first'))[0]).toBeInTheDocument();
    expect(live.onPlan).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('radiogroup', { name: '2 Nov 2026' })).getByRole('radio', { name: 'Office' }));
    expect(screen.getByText('You: 2 of 3 office days')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(live.onPlan).toHaveBeenCalledWith({ days: [{ on: NW, place: 'office' }] }));
    expect((await screen.findAllByText('Plan for week of 2 Nov 2026 saved'))[0]).toBeInTheDocument();
  });

  it('no rule: the page says so; the next-week arrow at next week says why', async () => {
    render(<HybridPlannerScreen live={hybrid({ me: { state: 'ready', data: { ...ME, rule: { ...RULE, officeDays: 0 } } } })} />);
    expect(screen.getByText('No office-day rule for you')).toBeInTheDocument();
    const live = hybrid();
    render(<HybridPlannerScreen live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Next week' })[0]);
    expect((await screen.findAllByText('Plans open one week ahead'))[0]).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Previous week' })[0]);
    expect(live.onWeek).toHaveBeenCalledWith('2026-10-26');
  });

  it('manager: the team grid with targets, a change saved for that person, a reminder, and compliance', async () => {
    const live = hybrid({ me: { state: 'ready', data: { ...ME, can: { team: true, compliance: true, policy: false } } }, team: { state: 'ready', data: TEAM }, compliance: { state: 'ready', data: COMPLIANCE } });
    render(<HybridPlannerScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Office days · Your team' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Rahul Deshpande/ });
    expect(within(row).getByText('Short by 2')).toBeInTheDocument();
    await ue.click(within(row).getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(live.onRemind).toHaveBeenCalledWith('e3', NW));
    expect((await screen.findAllByText('Reminder sent to Rahul Deshpande'))[0]).toBeInTheDocument();
    await ue.click(within(row).getByRole('button', { name: /Rahul Deshpande, 3 Nov 2026: Home/ }));
    await ue.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(live.onPlan).toHaveBeenCalledWith({ employeeId: 'e3', days: [{ on: on(1), place: 'office' }] }));
    await ue.click(screen.getByRole('tab', { name: 'Compliance' }));
    expect(screen.getByText('Week of 19 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Met')).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByText('1 office day · planned but not in: Mon')).toBeInTheDocument();
    expect(screen.getByText('No rule')).toBeInTheDocument();
  });

  it('HR policy: office days below the anchor days is a field error; a change saves the three settings', async () => {
    const groups = [{ scopeType: 'tenant' as const, scopeId: null, label: 'Whole company', own: { officeDays: '3', anchors: 'wed', evidence: null }, applies: RULE }];
    const live = hybrid({ me: { state: 'ready', data: { ...ME, employee: null, rule: null, days: [], can: { team: false, compliance: false, policy: true } } }, policy: { state: 'ready', data: { groups } } });
    render(<HybridPlannerScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Hybrid policy' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save policy' }));
    expect((await screen.findAllByText('No changes yet'))[0]).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'Mon' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Tue' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Thu' }));
    await ue.click(screen.getByRole('button', { name: 'Save policy' }));
    expect(screen.getByText('At least 4, the number of anchor days')).toBeInTheDocument();
    expect(live.onPolicy).not.toHaveBeenCalled();
    // Changing the anchor days clears the error.
    await ue.click(screen.getByRole('checkbox', { name: 'Thu' }));
    expect(screen.queryByText('At least 4, the number of anchor days')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'Tue' }));
    await ue.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(live.onPolicy).toHaveBeenCalledWith({ scopeType: 'tenant', scopeId: null }, { officeDays: '3', anchors: 'mon,wed', evidence: 'geofence,network,kiosk' }));
    expect((await screen.findAllByText('Policy saved'))[0]).toBeInTheDocument();
  });

  it('titles the page by who is looking: employee, manager, HR company-wide, HR in a scope', () => {
    const t = (o: Partial<LiveHybrid>) => { const r = render(<HybridPlannerScreen live={hybrid(o)} />); const h = screen.getByRole('heading', { level: 1 }).textContent; const d = r.container.querySelector('.yx-page-header__desc')?.textContent; r.unmount(); return [h, d]; };
    expect(t({})).toEqual(['My office days', '3 office days a week · anchor day Wed']);
    expect(t({ me: { state: 'ready', data: { ...ME, can: { team: true, compliance: true, policy: false } } }, team: { state: 'ready', data: TEAM }, compliance: { state: 'ready', data: COMPLIANCE } })).toEqual(['Office days · Your team', '3 office days a week · anchor day Wed']);
    const hrMe = { ...ME, employee: null, rule: null, days: [] };
    const company = (officeDays: number) => ({ state: 'ready' as const, data: { groups: [{ scopeType: 'tenant' as const, scopeId: null, label: 'Whole company', own: { officeDays: officeDays ? String(officeDays) : null, anchors: null, evidence: null }, applies: { officeDays, anchors: officeDays ? [0] : [], evidence: ['geofence' as const] } }] } });
    // HR (hr-tester, no employee record) saw "My office days" over everyone's compliance (lead walk 29 Oct 2026).
    expect(t({ me: { state: 'ready', data: { ...hrMe, can: { team: false, compliance: true, policy: true, everyone: true } } }, compliance: { state: 'ready', data: COMPLIANCE }, policy: company(0) })).toEqual(['Office days · Everyone', 'No office-day rule yet. HR sets one on the Policy tab.']);
    expect(t({ me: { state: 'ready', data: { ...hrMe, can: { team: false, compliance: true, policy: true, everyone: true } } }, compliance: { state: 'ready', data: COMPLIANCE }, policy: company(2) })).toEqual(['Office days · Everyone', 'Whole company · 2 office days a week · anchor day Mon']);
    expect(t({ me: { state: 'ready', data: { ...hrMe, can: { team: false, compliance: true, policy: false, everyone: false } } }, compliance: { state: 'ready', data: COMPLIANCE } })).toEqual(['Office days · The people you see', 'No office-day rule yet. HR sets one on the Policy tab.']);
  });
});

describe('Timesheet pre-fill from my tools (TIM-43 live)', () => {
  const TOOLS = (connected: boolean, enabled = true): PrefillTools => ({ enabled, tools: [{ provider: 'calendar', label: 'Work calendar', connected, accountLabel: connected ? 'Work calendar (dev-fake)' : null }, { provider: 'issues', label: 'Issue tracker', connected: false, accountLabel: null }, { provider: 'code', label: 'Code host', connected: false, accountLabel: null }] });
  const SUGG: PrefillSuggestions = {
    week: MY_TIMESHEET.week,
    upTo: TODAY,
    lines: [
      { id: 's1', provider: 'calendar', date: '2026-10-28', minutes: 120, projectId: 'pr1', activity: 'Line checks', projectHint: 'FSSAI', source: 'Calendar: "FSSAI line checks"', kind: 'rule' },
      { id: 's2', provider: 'calendar', date: '2026-10-27', minutes: 60, projectId: null, activity: null, projectHint: 'Client workshop', source: 'Calendar: "Client workshop"', kind: 'rule' },
    ],
  };
  const prefill = (o: Partial<LivePrefill> = {}): LivePrefill => ({ tools: { state: 'ready', data: TOOLS(true) }, suggestions: { state: 'ready', data: SUGG }, onConnect: ok(), onDisconnect: ok(), ...o });
  const sheet = (p: LivePrefill, o: Partial<LiveTimesheet> = {}): LiveTimesheet => ({ state: 'ready', data: MY_TIMESHEET, week: MY_TIMESHEET.week, today: TODAY, onWeek: vi.fn(), onSave: ok(), onSubmit: ok(), onWithdraw: ok(), prefill: p, ...o });

  it('not set up for the company: the drawer says so', async () => {
    render(<TimesheetScreen live={sheet(prefill({ tools: { state: 'ready', data: TOOLS(false, false) } }))} />);
    await ue.click(screen.getByRole('button', { name: 'Pre-fill from my tools' }));
    expect(await screen.findByText('Not set up for your company')).toBeInTheDocument();
  });

  it('no tool connected: Connect calls the API', async () => {
    const p = prefill({ tools: { state: 'ready', data: TOOLS(false) }, suggestions: { state: 'loading', data: null } });
    render(<TimesheetScreen live={sheet(p)} />);
    await ue.click(screen.getByRole('button', { name: 'Pre-fill from my tools' }));
    await ue.click(await screen.findByRole('button', { name: 'Connect work calendar' }));
    await waitFor(() => expect(p.onConnect).toHaveBeenCalledWith('calendar'));
  });

  it('accept adds the hours to the grid (nothing saved); a line with no project asks for one first', async () => {
    const live = sheet(prefill());
    render(<TimesheetScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Pre-fill from my tools' }));
    const drawer = await screen.findByRole('dialog');
    const items = within(drawer).getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Accept' }));
    await ue.click(within(items[1]).getByRole('button', { name: 'Accept' }));
    expect(within(drawer).getByRole('alert')).toHaveTextContent('Choose a project first: "Client workshop" is not one of your projects.');
    await ue.click(within(items[0]).getByRole('button', { name: 'Accept' }));
    expect(within(drawer).getByText('Added to Wed · FSSAI')).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(live.prefill!.onDisconnect).toHaveBeenCalledWith('calendar'));
  });
});
