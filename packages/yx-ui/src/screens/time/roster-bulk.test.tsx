import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RosterGrid } from '../../components/roster';
import { BulkChangeDrawer, RosterScreen } from './roster';

// Batch A B6 (answer 2316): TIM-05 row checkboxes, the bulk bar and the bulk change drawer.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PEOPLE = [{ id: 'a', name: 'Kavitha Sundaram' }, { id: 'b', name: 'Rekha Balan' }];
const SHIFTS = [{ id: 's1', label: 'General · 09:30 – 18:30' }];

describe('kit RosterGrid row checkboxes', () => {
  it('ticks a row and everyone; the bulk bar shows the count and the actions; Clear empties it', async () => {
    const onSel = vi.fn();
    const { rerender } = render(<RosterGrid people={PEOPLE} start={new Date(2026, 10, 16)} selectedPeople={[]} onSelectedPeopleChange={onSel} bulkActions={() => <button type="button">Go</button>} />);
    expect(screen.queryByRole('region', { name: 'Bulk changes' })).toBeNull();
    await ue.click(screen.getByRole('checkbox', { name: 'Tick Rekha Balan' }));
    expect(onSel).toHaveBeenLastCalledWith(['b']);
    await ue.click(screen.getByRole('checkbox', { name: 'Tick everyone' }));
    expect(onSel).toHaveBeenLastCalledWith(['a', 'b']);
    rerender(<RosterGrid people={PEOPLE} start={new Date(2026, 10, 16)} selectedPeople={['a']} onSelectedPeopleChange={onSel} bulkActions={(ids) => <span>{`for ${ids.join(',')}`}</span>} />);
    const bar = screen.getByRole('region', { name: 'Bulk changes' });
    expect(within(bar).getByText('1 person ticked')).toBeInTheDocument();
    expect(within(bar).getByText('for a')).toBeInTheDocument();
    await ue.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(onSel).toHaveBeenLastCalledWith([]);
  });
  it('negative: read-only (staff) or no handler: no checkboxes', () => {
    render(<RosterGrid people={PEOPLE} start={new Date(2026, 10, 16)} readOnly onSelectedPeopleChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('bulk change drawer', () => {
  it('pressed early it asks for the date and the shift; a good one sends and toasts', async () => {
    const onSend = vi.fn(async () => ({}));
    render(<BulkChangeDrawer change="shift" names={['Kavitha Sundaram', 'Rekha Balan']} shifts={SHIFTS} onSend={onSend} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: 'Change shift' });
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 2 people' }));
    expect(within(dlg).getAllByText('Choose the date it starts from.').length).toBeGreaterThan(0);
    expect(within(dlg).getAllByText('Choose the new shift.').length).toBeGreaterThan(0);
    expect(onSend).not.toHaveBeenCalled();
  });
  it('weekly off: no day is refused, four days are refused; a penalty change not on the 1st is refused', async () => {
    const onSend = vi.fn(async () => ({}));
    const { unmount } = render(<BulkChangeDrawer change="weekly_off" names={['Rekha Balan']} shifts={SHIFTS} from={new Date(2026, 11, 7)} onSend={onSend} onClose={vi.fn()} />);
    let dlg = screen.getByRole('dialog', { name: 'Change weekly off' });
    await ue.click(within(dlg).getByRole('checkbox', { name: 'Sunday' }));
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 1 person' }));
    expect(within(dlg).getAllByText('Choose at least one weekly-off day.').length).toBeGreaterThan(0);
    for (const n of ['Monday', 'Tuesday', 'Wednesday', 'Thursday']) await ue.click(within(dlg).getByRole('checkbox', { name: n }));
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 1 person' }));
    expect(within(dlg).getAllByText('Choose up to three weekly-off days.').length).toBeGreaterThan(0);
    for (const n of ['Monday', 'Tuesday']) await ue.click(within(dlg).getByRole('checkbox', { name: n }));
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 1 person' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ change: 'weekly_off', from: '2026-12-07', weeklyOffs: [3, 4] }));
    unmount();
    render(<BulkChangeDrawer change="penalty" names={['Rekha Balan']} shifts={SHIFTS} from={new Date(2026, 11, 7)} onSend={onSend} onClose={vi.fn()} />);
    dlg = screen.getByRole('dialog', { name: 'Change penalty policy' });
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 1 person' }));
    expect(within(dlg).getAllByText('A penalty policy change starts on the 1st of a month.').length).toBeGreaterThan(0);
  });
  it('negative: the server refusing (a locked month) keeps the drawer open with its reason', async () => {
    const onSend = vi.fn(async () => Promise.reject(new Error('October 2026 is locked for attendance and leave, so this can’t change any more.')));
    render(<BulkChangeDrawer change="penalty" names={['Rekha Balan']} shifts={SHIFTS} from={new Date(2026, 9, 1)} onSend={onSend} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: 'Change penalty policy' });
    await ue.click(within(dlg).getByRole('button', { name: 'Apply to 1 person' }));
    expect(await within(dlg).findByText(/is locked for attendance/)).toBeInTheDocument();
  });
});

describe('TIM-05 design stories', () => {
  it('people ticked show the bar; HR gets the penalty policy button, a manager does not', () => {
    const { unmount } = render(<RosterScreen ticked={['p1', 'p2']} />);
    const bar = screen.getByRole('region', { name: 'Bulk changes' });
    expect(within(bar).getByRole('button', { name: 'Change shift' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Change penalty policy' })).toBeNull();
    unmount();
    render(<RosterScreen persona="hr" ticked={['p1']} bulk="penalty" />);
    expect(screen.getByRole('dialog', { name: 'Change penalty policy' })).toBeInTheDocument();
  });
});
