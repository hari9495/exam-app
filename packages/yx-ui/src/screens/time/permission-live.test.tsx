import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceCalendarScreen, type LiveMyAttendance } from './attendance';
import { AttendanceRequestSheet } from './requests';
import type { MyAttendance } from './live/types';

// Batch A item 7 (attendance-leave B4, answer 2310): hourly permission on the TIM-07 request sheet, design and live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ATT: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-09',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [],
  punches: [],
  next: 'in',
  days: [],
  requests: [],
  regularise: { limit: 4, used: 1 },
  wfh: { limit: 4, used: 0 },
  onDuty: { aheadDays: 30, backDays: 60 },
  permission: { limit: 2, maxMinutes: 120, used: 1 },
};
const live = (over: Partial<LiveMyAttendance> = {}): LiveMyAttendance => ({
  state: 'ready',
  data: ATT,
  month: '2026-10',
  onMonth: vi.fn(),
  getLocation: vi.fn(async () => ({ pin: null })),
  onPunch: vi.fn(),
  onFix: vi.fn(async () => ({})),
  onWithdrawFix: vi.fn(async () => ({})),
  onOpenDay: vi.fn(),
  now: new Date('2026-10-09T05:00:00Z'),
  ...over,
});
const time = async (sheet: HTMLElement, label: RegExp, value: string) => {
  const f = within(sheet).getByLabelText(label);
  await ue.clear(f);
  await ue.type(f, value);
  fireEvent.blur(f);
};
const open = async () => {
  await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
  const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
  await ue.click(within(sheet).getByRole('radio', { name: 'Permission' }));
  return screen.getByRole('dialog', { name: 'Hourly permission' });
};

describe('Hourly permission, design', () => {
  it('shows the from and to times, that the day stays present, and the count of the month', () => {
    render(<AttendanceRequestSheet type="permission" />);
    expect(screen.getByRole('radio', { name: 'Permission' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Permission 4:30 pm – 6:30 pm · the day stays present')).toBeInTheDocument();
    expect(screen.getByText('This will be permission 1 of 2 in September. It does not use leave.')).toBeInTheDocument();
  });
  it('past the monthly limit the date says so', () => {
    render(<AttendanceRequestSheet type="permission" permissionUsed={2} />);
    expect(screen.getAllByText('You have used all 2 permissions for September. Apply for leave instead.').length).toBeGreaterThan(0);
  });
});

describe('Hourly permission, live', () => {
  it('pressed early it shows the missing times (never a disabled Send); too long is refused; a good one is sent with a toast', async () => {
    const onPermission = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onPermission })} />);
    const sheet = await open();
    expect(within(sheet).getByText('Add the times to see the result')).toBeInTheDocument();
    const send = within(sheet).getByRole('button', { name: 'Send request' });
    expect(send).not.toBeDisabled();
    await ue.click(send);
    expect(onPermission).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter the From and To times').length).toBeGreaterThan(0);
    await time(sheet, /^From/, '15:00');
    await time(sheet, /^To/, '17:30');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Bank visit');
    await ue.click(send);
    expect(within(sheet).getAllByText('A permission can be at most 2 hours. Apply for leave for a longer time.').length).toBeGreaterThan(0);
    expect(onPermission).not.toHaveBeenCalled();
    await time(sheet, /^From/, '16:30');
    expect(within(sheet).getByText('Permission 4:30 pm – 5:30 pm · the day stays present')).toBeInTheDocument();
    expect(within(sheet).getByText('This will be permission 2 of 2 in October. It does not use leave.')).toBeInTheDocument();
    await ue.click(send);
    await waitFor(() => expect(onPermission).toHaveBeenCalledWith({ on: '2026-10-09', inMinute: 990, outMinute: 1050, reason: 'Bank visit' }));
    expect(await screen.findByText('Sent to your manager')).toBeInTheDocument();
  });

  it('with the month used up the date is refused with the reason', async () => {
    const onPermission = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onPermission, data: { ...ATT, permission: { limit: 2, maxMinutes: 120, used: 2 } } })} />);
    const sheet = await open();
    expect(within(sheet).getAllByText('You have used all 2 permissions for October. Apply for leave instead.').length).toBeGreaterThan(0);
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(onPermission).not.toHaveBeenCalled();
  });

  it('without the handler there is no Permission choice', async () => {
    render(<AttendanceCalendarScreen live={live({ onWfh: vi.fn() })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    expect(within(screen.getByRole('dialog')).queryByRole('radio', { name: 'Permission' })).toBeNull();
  });
});
