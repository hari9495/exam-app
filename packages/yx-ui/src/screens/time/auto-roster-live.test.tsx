import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AutoRosterScreen } from './roster';
import type { AutoRosterData, AutoRosterResult, LiveAutoRoster } from './auto-roster-live';

// TIM-34 Auto-roster, live: the designed screen's states with the API's data (not set up, empty, loading, error,
// running, done with coverage and explanations, approve and publish).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const RESULT: AutoRosterResult = {
  week: '2026-11-02',
  to: '2026-11-08',
  location: { id: 'loc', name: 'Hosur' },
  generatedAt: '2026-10-29T04:00:00.000Z',
  people: 3,
  capped: null,
  placed: 2,
  coverage: { required: 3, filled: 2, unfilled: 1, shortSlots: 1, overSlots: 0 },
  nights: { min: 1, max: 1, most: 'Kavitha Sundaram' },
  slots: [
    { on: '2026-11-02', weekday: 'Mon', shiftId: 's-m', code: 'M', name: 'Morning', start: 360, end: 840, night: false, need: 2, had: 0, got: 2, placed: [{ employeeId: 'p1', name: 'Murugan Selvam' }, { employeeId: 'p2', name: 'Rekha Balan' }], skipped: [], reasons: [], noCandidates: false, closed: null },
    {
      on: '2026-11-07', weekday: 'Sat', shiftId: 's-n', code: 'N', name: 'Night', start: 1320, end: 360, night: true, need: 1, had: 0, got: 0, placed: [], noCandidates: false, closed: null,
      skipped: [{ employeeId: 'p2', name: 'Rekha Balan', kind: 'night', why: 'No night-work consent on file for Rekha Balan' }, { employeeId: 'p1', name: 'Murugan Selvam', kind: 'weekly_off', why: 'Only 1 day off in the week of 2 Nov 2026 (at least 2)' }],
      reasons: [{ kind: 'night', label: 'Night work not allowed', count: 1 }, { kind: 'weekly_off', label: 'Would lose the weekly off', count: 1 }],
    },
  ],
};
const DATA: AutoRosterData = {
  today: '2026-10-29',
  week: '2026-11-02',
  to: '2026-11-08',
  maxPeople: 200,
  locations: [{ id: 'loc', name: 'Hosur' }],
  location: { id: 'loc', name: 'Hosur' },
  shifts: [
    { id: 's-m', code: 'M', name: 'Morning', colour: 'orange', night: false, start: 360, end: 840 },
    { id: 's-n', code: 'N', name: 'Night', colour: 'purple', night: true, start: 1320, end: 360 },
  ],
  demand: [{ shiftId: 's-m', weekday: 1, need: 2 }, { shiftId: 's-n', weekday: 6, need: 1 }],
  people: { count: 3, used: 3 },
  rules: { minRestHours: 11, maxDailyHours: 9, maxWeeklyHours: 48, maxSpreadOverHours: 10.5, minWeeklyOffs: 2 },
  drafts: 2,
  draft: [
    { id: 'p1', name: 'Murugan Selvam', code: 'KFT-0101', days: ['M', null, null, null, null, 'OFF', null] },
    { id: 'p2', name: 'Rekha Balan', code: 'KFT-0102', days: ['M', null, null, null, null, null, null] },
  ],
  run: { id: 'run-1', status: 'done', startedAt: '2026-10-29T04:00:00.000Z', finishedAt: '2026-10-29T04:00:02.000Z', error: null, result: RESULT },
};
const live = (over: Partial<LiveAutoRoster> = {}): LiveAutoRoster => ({
  state: 'ready',
  data: DATA,
  week: '2026-11-02',
  onWeek: vi.fn(),
  onLocation: vi.fn(),
  onRetry: vi.fn(),
  onDemand: vi.fn(async () => ({})),
  onGenerate: vi.fn(async () => ({})),
  onPublish: vi.fn(async () => ({})),
  openShiftsHref: '/yx/time/open-shifts',
  ...over,
});

describe('TIM-34 Auto-roster, live', () => {
  it('Draft: coverage chips, unfilled slot card and the draft grid', () => {
    render(<AutoRosterScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Auto-roster · Hosur' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Morning Mon: 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Night Sat: 0 of 1, short. Explain' })).toBeInTheDocument();
    expect(screen.getByText(/7 Nov 2026 · Night · 1 short/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Offer as open shift' })).toHaveAttribute('href', '/yx/time/open-shifts');
    expect(screen.getAllByText('Murugan Selvam').length).toBeGreaterThan(0);
  });

  it('Explain: the drawer lists each candidate and why they were skipped', async () => {
    render(<AutoRosterScreen live={live()} />);
    await ue.click(screen.getByRole('button', { name: 'Night Sat: 0 of 1, short. Explain' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('No night-work consent on file for Rekha Balan')).toBeInTheDocument();
    expect(within(dlg).getByText('Would lose the weekly off')).toBeInTheDocument();
    expect(within(dlg).getByText(/Only 1 day off/)).toBeInTheDocument();
  });

  it('Approved · publish: approve, then publish calls the roster publish with the week', async () => {
    const l = live();
    render(<AutoRosterScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Approve draft' }));
    expect(await screen.findByText('Approved · ready to publish')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    const confirm = screen.getAllByRole('button', { name: 'Publish roster' });
    await ue.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(l.onPublish).toHaveBeenCalledWith('2026-11-02'));
    expect(await screen.findByText('Published · the people are told')).toBeInTheDocument();
  });

  it('a publish refusal stays on the page', async () => {
    const l = live({ onPublish: vi.fn(async () => { throw new Error('Rekha Balan, Sat 7 Nov: Not enough rest. Nothing was published; change that day first.'); }) });
    render(<AutoRosterScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Approve draft' }));
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    const confirm = screen.getAllByRole('button', { name: 'Publish roster' });
    await ue.click(confirm[confirm.length - 1]);
    expect(await screen.findByText(/Nothing was published/)).toBeInTheDocument();
  });

  it('Demand: a changed number is saved first, then Run again generates', async () => {
    const l = live();
    render(<AutoRosterScreen live={l} />);
    await ue.click(screen.getByRole('tab', { name: 'Demand' }));
    const cell = screen.getByLabelText('Morning Tue');
    await ue.clear(cell);
    await ue.type(cell, '3');
    await ue.click(screen.getByRole('button', { name: 'Run again' }));
    await waitFor(() => expect(l.onGenerate).toHaveBeenCalledWith('loc', '2026-11-02'));
    expect(l.onDemand).toHaveBeenCalledWith('loc', [{ shiftId: 's-m', weekday: 2, need: 3 }]);
  });

  it('Not set up: Generate pressed too early says to set the demand and focuses the first number', async () => {
    const l = live({ data: { ...DATA, demand: [], run: null, drafts: 0 } });
    render(<AutoRosterScreen live={l} />);
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Set the people needed first')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Morning Mon')).toHaveFocus());
    expect(l.onGenerate).not.toHaveBeenCalled();
  });

  it('Empty: demand set but no run yet', async () => {
    render(<AutoRosterScreen live={live({ data: { ...DATA, run: null } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Coverage and draft' }));
    expect(screen.getByText('No draft for this week yet')).toBeInTheDocument();
  });

  it('Running: another planner’s run shows Generating with Check again', async () => {
    const l = live({ data: { ...DATA, run: { ...DATA.run!, status: 'running', result: null, finishedAt: null } } });
    render(<AutoRosterScreen live={l} />);
    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText(/Generating the roster for 3 people and 3 slots/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check again' }));
    expect(l.onRetry).toHaveBeenCalled();
  });

  it('a failed run says why; loading, error and no access have their states', () => {
    const { unmount } = render(<AutoRosterScreen live={live({ data: { ...DATA, run: { ...DATA.run!, status: 'failed', result: null, error: 'Something went wrong while generating. Nothing was saved. Try again.' } } })} />);
    expect(screen.getByText('The last run did not finish')).toBeInTheDocument();
    unmount();
    const a = render(<AutoRosterScreen live={live({ state: 'loading', data: null })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    a.unmount();
    const b = render(<AutoRosterScreen live={live({ state: 'error', data: null })} />);
    expect(screen.getByText("The auto-roster didn't load")).toBeInTheDocument();
    b.unmount();
    render(<AutoRosterScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.queryByText('Coverage and draft')).not.toBeInTheDocument();
  });

  it('header: the actions are one row level with the title; the location picker sits under the subtitle (HR, several places)', async () => {
    const many = { ...DATA, locations: [DATA.location, { id: 'loc2', name: 'Bengaluru head office' }] };
    const onLocation = vi.fn();
    const { container } = render(<AutoRosterScreen live={live({ data: many, onLocation })} />);
    const actions = container.querySelector('.yx-page-header__actions') as HTMLElement;
    const facts = container.querySelector('.yx-page-header__facts') as HTMLElement;
    expect(screen.getByRole('heading', { level: 1, name: 'Auto-roster · Hosur' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Approve draft' })).toBeInTheDocument();
    // The picker was in the actions, full width, and pushed Generate under it (lead walk 29 Oct 2026).
    expect(within(actions).queryByRole('combobox')).not.toBeInTheDocument();
    const picker = within(facts).getByRole('combobox', { name: 'Location' });
    expect(picker).toHaveClass('yx-tim-place');
    await ue.click(picker);
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru head office' }));
    expect(onLocation).toHaveBeenCalledWith('loc2');
  });

  it('header: one location, no picker; not set up keeps Generate in the action row', () => {
    const { container } = render(<AutoRosterScreen live={live({ data: { ...DATA, demand: [], run: null } })} />);
    expect(container.querySelector('.yx-page-header__facts')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Location' })).not.toBeInTheDocument();
    expect(within(container.querySelector('.yx-page-header__actions') as HTMLElement).getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
  });
});
