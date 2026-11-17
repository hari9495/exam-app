import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApplyLeaveSheet, LeaveHomeScreen, type LiveLeaveHome } from './leave';
import type { LeavePlan, MyLeave } from './live/types';

// Batch A C4 (answer 2313): Apply leave's "Notify colleagues", design and live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LEAVE: MyLeave = {
  employee: { id: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142' },
  today: '2026-10-09',
  year: { start: '2026-01-01', end: '2026-12-31' },
  balances: [{ leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 21, pending: 0, available: 21, takenThisYear: 0, entitlement: 18, negativeLimit: 0 }],
  requests: [],
  holidays: { calendar: null, list: [] },
} as unknown as MyLeave;
const PLAN: LeavePlan = { type: { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', rules: { certificateAfterDays: null, medical: false, halfDays: true } }, days: [], total: 1, holidaysExcluded: 0, sandwichDays: 0, balance: null, balanceAfter: 20, othersOff: 0, certificateNeeded: false, blocks: [], warnings: [] };
const PEOPLE = Array.from({ length: 11 }, (_, i) => ({ id: `u${i}`, label: `Colleague ${i}`, detail: null }));
const home = (over: Partial<LiveLeaveHome> = {}): LiveLeaveHome => ({
  state: 'ready',
  data: LEAVE,
  startApplying: true,
  onPreview: vi.fn(async () => PLAN),
  onApply: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onChooseHoliday: vi.fn(async () => ({})),
  onFindPeople: vi.fn(async (q: string) => PEOPLE.filter((p) => p.label.includes(q))),
  ...over,
});
const add = async (sheet: HTMLElement, label: string) => {
  const search = within(sheet).getByLabelText('Search colleague to notify');
  await ue.clear(search);
  await ue.type(search, label);
  await ue.click(await within(sheet).findByRole('combobox', { name: 'Colleague to notify' }));
  await ue.click(await screen.findByRole('option', { name: new RegExp(`^${label}$`) }));
};

describe('Notify colleagues, design', () => {
  it('shows the picker with what they are told', () => {
    render(<ApplyLeaveSheet notify={['Arun Prakash', 'Meera Krishnan']} />);
    expect(screen.getByText(/They are told when the leave is approved, with the dates only, never the type or the reason\./)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Notify colleagues' })).toBeInTheDocument();
  });
});

describe('Notify colleagues, live', () => {
  it('picked colleagues go with the request; a tag removes one', async () => {
    const live = home();
    render(<LeaveHomeScreen live={live} />);
    const sheet = screen.getByRole('dialog', { name: 'Apply leave' });
    await add(sheet, 'Colleague 1');
    await add(sheet, 'Colleague 2');
    await add(sheet, 'Colleague 3');
    await ue.click(within(sheet).getByRole('button', { name: 'Remove Colleague 2' }));
    const from = within(sheet).getByLabelText(/^From/);
    await ue.type(from, '20 Oct 2026');
    await ue.tab();
    await waitFor(() => expect(live.onPreview).toHaveBeenCalled());
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(live.onApply).toHaveBeenCalledWith(expect.objectContaining({ notifyUserIds: ['u1', 'u3'] })));
  });

  it('after 10 people the picker gives way to a note', async () => {
    render(<LeaveHomeScreen live={home()} />);
    const sheet = screen.getByRole('dialog', { name: 'Apply leave' });
    for (let i = 0; i < 10; i++) await add(sheet, `Colleague ${i}`);
    expect(within(sheet).queryByLabelText('Search colleague to notify')).toBeNull();
    expect(within(sheet).getByText('10 people chosen, the most you can notify.')).toBeInTheDocument();
  }, 60_000);
});
