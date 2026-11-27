import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TimesheetApprovalsPhone, TimesheetApprovalsScreen, type LiveTimesheetApprovals } from './projects';
import { LIVE_LINE_APPROVALS } from './projects-live-fixtures';

// Projects P-2 (PRJ-02, answers 1406, 1407, 1442): the designed timesheet approvals with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const live = (over: Partial<LiveTimesheetApprovals> = {}): LiveTimesheetApprovals => ({ state: 'ready', data: LIVE_LINE_APPROVALS, onDecide: vi.fn().mockResolvedValue(undefined), onBulk: vi.fn().mockResolvedValue(undefined), ...over });
const card = (name: string, project = 'NRP-WEB') => within(screen.getByRole('region', { name: new RegExp(`^${project}, Week of`) })).getByRole('article', { name: `Timesheet for ${name}` });

describe('PRJ-02 Timesheet approvals (live)', () => {
  it('groups my lines by project and week; says which client approves after me; flags hours outside an allocation', () => {
    show(<TimesheetApprovalsScreen live={live()} />);
    expect(screen.getByRole('region', { name: /NRP-WEB, Week of/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /OLDAUDIT, Week of/ })).toBeInTheDocument();
    expect(screen.getByText(/NRP-WEB \(Nilgiri Retail\): approved lines then go to the client/)).toBeInTheDocument();
    expect(screen.getByText(/Booked outside Meera Iyer's allocation/)).toBeInTheDocument();
    expect(within(card('Meera Iyer')).getByText('not allocated to this project')).toBeInTheDocument();
  });

  it('bulk takes only people within their allocation (never over it, never unallocated), after asking', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    const nrp = screen.getByRole('region', { name: /NRP-WEB, Week of/ });
    await ue.click(within(nrp).getByRole('button', { name: 'Approve 1 within allocation' }));
    expect(l.onBulk).not.toHaveBeenCalled();
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve 2 lines' }));
    expect(l.onBulk).toHaveBeenCalledWith([{ lineId: 'l1', version: 2 }, { lineId: 'l2', version: 2 }]);
  });

  it('approves every line of a card with its version', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Priya Nair')).getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l1', version: 2, status: 'approved' }, { lineId: 'l2', version: 2, status: 'approved' }]);
  });

  it('a reduction needs fewer hours and a reason the person sees; then it is sent with both', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    const rohit = card('Rohit Bhat');
    await ue.click(within(rohit).getByRole('button', { name: 'Reduce hours for NRP-WEB · Build' }));
    await ue.click(await screen.findByRole('button', { name: 'Reduce hours' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Approved hours/ }), '20');
    await ue.type(screen.getByRole('textbox', { name: /Reason for reducing/ }), 'Two days were the offsite');
    await ue.click(screen.getByRole('button', { name: 'Reduce hours' }));
    await ue.click(within(rohit).getByRole('button', { name: 'Approve all' }));
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l3', version: 2, status: 'reduced', hours: 20, reason: 'Two days were the offsite' }]);
  });

  it('send back rejects every line of the card with the reason', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Meera Iyer')).getByRole('button', { name: 'Send back' }));
    await ue.type(await screen.findByRole('textbox', { name: /What should they fix/ }), 'Not on this project');
    await ue.click(within(screen.getByRole('dialog', { name: /What should they fix/ })).getByRole('button', { name: 'Send back' }));
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l4', version: 2, status: 'rejected', reason: 'Not on this project' }]);
  });

  it('a refused decision says why and changes nothing on screen', async () => {
    const l = live({ onDecide: vi.fn().mockRejectedValue(new Error('You approve only the lines of your own projects.')) });
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Priya Nair')).getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(await screen.findByText('You approve only the lines of your own projects.')).toBeInTheDocument();
  });

  it('empty, error and no access', () => {
    const a = show(<TimesheetApprovalsScreen live={live({ data: { withinAllocation: true, groups: [] } })} />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    a.unmount();
    const b = show(<TimesheetApprovalsScreen live={live({ state: 'error', data: null })} />);
    expect(screen.getByText("Couldn't load timesheets")).toBeInTheDocument();
    b.unmount();
    show(<TimesheetApprovalsScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to timesheet approvals")).toBeInTheDocument();
  });
  it('batch D 2535: the Not sent tab lists people with weeks owed and reminds once a day; a refusal shows, nothing changes', async () => {
    const people = [
      { employeeId: 'e1', name: 'Arjun Mehta', projects: ['NRP-WEB'], weeks: [{ week: '2026-09-21', status: 'sent_back' as const, totalMinutes: 2280, locked: false }, { week: '2026-09-07', status: 'not_started' as const, totalMinutes: 0, locked: false }], remindedAt: null, canRemind: true },
      { employeeId: 'e2', name: 'Kavya Iyer', projects: ['CLL-WMS'], weeks: [{ week: '2026-09-14', status: 'draft' as const, totalMinutes: 960, locked: false }], remindedAt: '2026-09-28T04:30:00.000Z', canRemind: false },
    ];
    const onRemind = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Arjun Mehta was reminded in the last day. Try again tomorrow.'));
    show(<TimesheetApprovalsScreen live={live({ notSent: { state: 'ready', data: { people }, onRemind } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Not sent (2)' }));
    expect(screen.getByText('Arjun Mehta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reminded today' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Remind' }));
    expect(onRemind).toHaveBeenCalledWith('e1');
    expect((await screen.findAllByText('Reminder sent to Arjun Mehta'))[0]).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remind' }));
    expect(await screen.findByText('Arjun Mehta was reminded in the last day. Try again tomorrow.')).toBeInTheDocument();
  });

  it('negative: without the list there is no Not sent tab; an empty list says everyone has sent', async () => {
    const a = show(<TimesheetApprovalsScreen live={live()} />);
    expect(screen.queryByRole('tab', { name: /Not sent/ })).toBeNull();
    a.unmount();
    show(<TimesheetApprovalsScreen live={live({ notSent: { state: 'ready', data: { people: [] }, onRemind: vi.fn() } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Not sent' }));
    expect(screen.getByText('Everyone has sent their weeks.')).toBeInTheDocument();
  });

  // Batch D B1 (answer 2538): By person only regroups the lines already waiting for me; the week opens into days and tasks.
  it('By person regroups the same lines (never more); bulk and decisions still go line by line', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    const cards = () => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label')).sort();
    const before = cards();
    await ue.click(screen.getByRole('radio', { name: 'By person' }));
    expect(cards()).toEqual(before);
    const priya = screen.getByRole('region', { name: /^Priya Nair, Week of 2 Nov 2026/ });
    expect(within(priya).getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('region', { name: /^Priya Nair, Week of 26 Oct 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^NRP-WEB/ })).toBeNull();
    expect(within(priya).getByText('NRP-WEB · allocated 40 h a week')).toBeInTheDocument();
    expect(screen.getByText(/Booked outside Meera Iyer's allocation on NRP-WEB/)).toBeInTheDocument();
    await ue.click(within(priya).getByRole('button', { name: 'Approve 1 within allocation' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve 2 lines' }));
    expect(l.onBulk).toHaveBeenCalledWith([{ lineId: 'l1', version: 2 }, { lineId: 'l2', version: 2 }]);
  });

  it('a week opens into its days and a day into its tasks, in place', async () => {
    show(<TimesheetApprovalsScreen live={live()} />);
    const nrp = screen.getByRole('region', { name: /^NRP-WEB, Week of/ });
    await ue.click(within(nrp).getByRole('button', { name: 'Week by day · 74 h' }));
    await ue.click(within(nrp).getByRole('button', { name: 'Thu 5 Nov 2026 · 16 h' }));
    const tasks = within(within(nrp).getByRole('list', { name: 'Tasks on Thu 5 Nov 2026' })).getAllByRole('listitem');
    expect(tasks.map((t) => t.textContent)).toEqual(['BuildPriya Nair6 h', 'TestingPriya Nair2 h', 'BuildRohit Bhat4 h', 'TestingMeera Iyer4 h']);
  });

  it('negative: lines without days (an older reply) show no drill-down, and the cards still work', () => {
    const data = { ...LIVE_LINE_APPROVALS, groups: LIVE_LINE_APPROVALS.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, lines: i.lines.map(({ days: _d, ...x }) => x) })) })) };
    show(<TimesheetApprovalsScreen live={live({ data })} />);
    expect(screen.queryByRole('button', { name: /Week by day/ })).toBeNull();
    expect(screen.getAllByRole('article').length).toBe(4);
  });
});

// T2-H (items 95): the phone cards, one week at a time, with the desk page's decide call.
describe('PRJ-02 Timesheet approvals phone (live)', () => {
  it('approves every line of the shown week with its version; Next moves on', async () => {
    const l = live();
    show(<TimesheetApprovalsPhone groups={[]} live={l} />);
    expect(screen.getByText(/1 of \d+/)).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(l.onDecide).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ status: 'approved', version: expect.any(Number) })]));
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/2 of \d+/)).toBeInTheDocument();
  });

  it('a refused decision says why; nothing waiting says so; a failed load retries', async () => {
    const l = live({ onDecide: vi.fn().mockRejectedValue(new Error('Someone changed this week. Open it again.')) });
    const { unmount } = show(<TimesheetApprovalsPhone groups={[]} live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(await screen.findByText('Someone changed this week. Open it again.')).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = show(<TimesheetApprovalsPhone groups={[]} live={live({ data: { withinAllocation: true, groups: [] } })} />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    u2();
    const onRetry = vi.fn();
    show(<TimesheetApprovalsPhone groups={[]} live={live({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
