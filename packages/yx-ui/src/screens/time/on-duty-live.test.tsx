import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceCalendarScreen, type LiveMyAttendance } from './attendance';
import type { DayCard, MyAttendance } from './live/types';

// TIM-07 OnDuty and TIM-03 OnDuty, live (Nov 2026): ask for on duty, change and send again, and the day card.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ATT: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-09',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }],
  punches: [],
  next: 'in',
  days: [{ on: '2026-10-07', status: 'present', leavePart: null, firstIn: '2026-10-07T03:00:00Z', lastOut: '2026-10-07T12:30:00Z', workedMinutes: 540, lateMinutes: 0, regularised: false }],
  requests: [],
  regularise: { limit: 4, used: 1 },
  wfh: { limit: 4, used: 0 },
  onDuty: { aheadDays: 30, backDays: 60 },
};
const DAY_7: DayCard = {
  person: { name: 'Arjun Kulkarni', code: 'KF-0142' },
  on: '2026-10-07',
  zone: 'Asia/Kolkata',
  shift: { name: 'General', start: 570, end: 1110, grace: 10 },
  day: { status: 'present', leavePart: null, workedMinutes: 540, lateMinutes: 0, regularised: false },
  punches: [],
  onDuty: { id: 'od1', place: 'Hosur plant', inMinute: 510, outMinute: 1080, reason: 'Supplier audit', status: 'approved' },
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
  onOpenDay: vi.fn(async () => DAY_7),
  now: new Date('2026-10-09T05:00:00Z'),
  ...over,
});

describe('TIM-07 OnDuty, live', () => {
  it('On duty is a choice in the request sheet; pressed early it shows the missing place and time, never a disabled Send', async () => {
    const onOnDuty = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onOnDuty })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('radio', { name: 'On duty' }));
    expect(within(sheet).getByText('Up to 30 days ahead or 60 days back.')).toBeInTheDocument();
    expect(within(sheet).getByText('Add the place and times to see the result')).toBeInTheDocument();
    const send = within(sheet).getByRole('button', { name: 'Send request' });
    expect(send).not.toBeDisabled();
    await ue.click(send);
    expect(onOnDuty).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter where you will be').length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('textbox', { name: /Where/ })));
  });

  it('a To time before From is refused; a good request is sent with the place, times and reason, then a toast', async () => {
    const onOnDuty = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onOnDuty })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('radio', { name: 'On duty' }));
    await ue.type(within(sheet).getByRole('textbox', { name: /Where/ }), 'Hosur plant');
    await ue.type(within(sheet).getByLabelText(/^From/), '18:00');
    fireEvent.blur(within(sheet).getByLabelText(/^From/));
    await ue.type(within(sheet).getByLabelText(/^To/), '08:30');
    fireEvent.blur(within(sheet).getByLabelText(/^To/));
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Supplier audit');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(within(sheet).getAllByText('Enter a To time after From').length).toBeGreaterThan(0);
    expect(onOnDuty).not.toHaveBeenCalled();
    await ue.clear(within(sheet).getByLabelText(/^From/));
    await ue.type(within(sheet).getByLabelText(/^From/), '08:30');
    fireEvent.blur(within(sheet).getByLabelText(/^From/));
    await ue.clear(within(sheet).getByLabelText(/^To/));
    await ue.type(within(sheet).getByLabelText(/^To/), '18:00');
    fireEvent.blur(within(sheet).getByLabelText(/^To/));
    expect(within(sheet).getByText('On duty at Hosur plant, 8:30 am – 6:00 pm')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onOnDuty).toHaveBeenCalledWith({ on: '2026-10-09', inMinute: 510, outMinute: 1080, place: 'Hosur plant', reason: 'Supplier audit' }));
    expect(await screen.findByText('Sent to your manager')).toBeInTheDocument();
  });

  it('a date past the window is refused on the date field', async () => {
    render(<AttendanceCalendarScreen live={live({ onOnDuty: vi.fn(), data: { ...ATT, onDuty: { aheadDays: 7, backDays: 3 } } })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('radio', { name: 'On duty' }));
    const date = within(sheet).getByRole('textbox', { name: 'Date' });
    await ue.clear(date);
    await ue.type(date, '20 Oct 2026');
    fireEvent.blur(date);
    expect(await within(sheet).findAllByText('Pick a date in the next 7 days')).not.toHaveLength(0);
  });

  it('sent back for changes: the reason shows, Change and send again starts from it and sends it as a resend', async () => {
    const onOnDuty = vi.fn(async () => ({}));
    const sent = { id: 'od9', on: '2026-10-08', kind: 'on_duty' as const, inMinute: 540, outMinute: 1020, reason: 'Audit', status: 'sent_back' as const, place: 'Hosur', sentBack: 'Add the plant name in full' };
    render(<AttendanceCalendarScreen live={live({ onOnDuty, data: { ...ATT, requests: [sent] } })} />);
    const list = screen.getByRole('list', { name: 'Waiting for approval' });
    expect(within(list).getByText('8 Oct 2026 · On duty at Hosur')).toBeInTheDocument();
    expect(within(list).getByText('Sent back for changes: Add the plant name in full')).toBeInTheDocument();
    await ue.click(within(list).getByRole('button', { name: 'Change and send again' }));
    const sheet = screen.getByRole('dialog', { name: 'Change and send again' });
    expect(within(sheet).getByText('Add the plant name in full')).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /Where/ }), ' plant');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onOnDuty).toHaveBeenCalledWith({ on: '2026-10-08', inMinute: 540, outMinute: 1020, place: 'Hosur plant', reason: 'Audit', resendOf: 'od9' }));
  });

  it('without the on-duty handler the sheet offers no On duty choice', async () => {
    render(<AttendanceCalendarScreen live={live({ onWfh: vi.fn() })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    expect(within(screen.getByRole('dialog')).queryByRole('radio', { name: 'On duty' })).toBeNull();
  });
});

describe('TIM-03 OnDuty, live', () => {
  it('an approved on-duty day shows On duty in the calendar and on the day card with the place and times', async () => {
    const approved = { id: 'od1', on: '2026-10-07', kind: 'on_duty' as const, inMinute: 510, outMinute: 1080, reason: 'Supplier audit', status: 'approved' as const, place: 'Hosur plant' };
    render(<AttendanceCalendarScreen live={live({ data: { ...ATT, requests: [approved] } })} />);
    // The calendar cell for 7 Oct (the first match; a legend or list may name the date too).
    await ue.click(screen.getAllByRole('button', { name: /7 Oct 2026/ })[0]!);
    const card = await screen.findByRole('dialog');
    expect(await within(card).findByText('Hosur plant · 8:30 am – 6:00 pm')).toBeInTheDocument();
    expect(within(card).getAllByText('On duty').length).toBeGreaterThan(0);
  });
});
