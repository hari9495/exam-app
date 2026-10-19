import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeClockCard } from './my-attendance';
import type { MyAttendance, PunchKind } from './types';

const NOW = new Date('2026-10-19T04:12:15Z');
const DAY: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun' },
  today: '2026-10-19',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [],
  punches: [],
  next: 'in',
  days: [],
  requests: [],
  regularise: { limit: 4, used: 0 },
};
const punch = (kind: PunchKind, at: string) => ({ id: kind, kind, at, source: 'web', accepted: true, refusal: null, verdict: 'network', distanceM: null, accuracyM: null, where: null });
const props = (over: Partial<Parameters<typeof HomeClockCard>[0]> = {}) => ({
  data: DAY,
  now: NOW,
  getLocation: vi.fn(async () => ({ pin: { lat: 12.9, lng: 77.6, accuracyM: 20 } })),
  onPunch: vi.fn(async (kind: PunchKind) => ({ accepted: true, duplicate: false, kind, message: 'Recorded', verdict: 'network', distanceM: null })),
  attendanceHref: '/yx/time/attendance',
  onRegularise: vi.fn(),
  ...over,
});

describe('Attendance today on the live Home (PLT-02)', () => {
  it('checks in on the server with the location, from the designed card', async () => {
    const p = props();
    render(<HomeClockCard {...p} />);
    expect(screen.getByText('Not clocked in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clock in' }));
    await waitFor(() => expect(p.onPunch).toHaveBeenCalledWith('in', { lat: 12.9, lng: 77.6, accuracyM: 20 }));
  });

  it('shows working since the first punch; Start break goes to the server with the location', async () => {
    const p = props({ data: { ...DAY, next: 'out', punches: [punch('in', '2026-10-19T04:08:00Z')] } });
    render(<HomeClockCard {...p} />);
    expect(screen.getByText('Working since 9:38 am')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(screen.getByRole('link', { name: "Today's punches (1)" })).toHaveAttribute('href', '/yx/time/attendance');
    await userEvent.click(screen.getByRole('button', { name: 'Start break' }));
    await waitFor(() => expect(p.onPunch).toHaveBeenCalledWith('break_start', { lat: 12.9, lng: 77.6, accuracyM: 20 }));
  });

  it('on a break: says since when, End break ends it, and clock-out waits for it', async () => {
    const p = props({ data: { ...DAY, next: 'out', onBreak: true, punches: [punch('in', '2026-10-19T03:58:00Z'), punch('break_start', '2026-10-19T04:05:00Z')] } });
    render(<HomeClockCard {...p} />);
    expect(screen.getByText('On break since 9:35 am')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeDisabled();
    expect(screen.getByText('End your break to clock out')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End break' }));
    await waitFor(() => expect(p.onPunch).toHaveBeenCalledWith('break_end', { lat: 12.9, lng: 77.6, accuracyM: 20 }));
  });

  it('says why a punch was refused', async () => {
    const p = props({ onPunch: vi.fn(async () => ({ accepted: false, duplicate: false, kind: 'in' as const, message: 'Outside Bengaluru head office, 850 m away', verdict: 'outside', distanceM: 850 })) });
    render(<HomeClockCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText('Outside Bengaluru head office, 850 m away')).toBeInTheDocument();
  });

  it("shows the browser's location problem alone, not glued to the server's message", async () => {
    const p = props({
      getLocation: vi.fn(async () => ({ pin: null, problem: 'Your location could not be found. Move near a window or outdoors and try again.' })),
      onPunch: vi.fn(async () => ({ accepted: false, duplicate: false, kind: 'in' as const, message: 'Turn on location for this site, or connect to the office network.', verdict: 'no_location', distanceM: null })),
    });
    render(<HomeClockCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText('Your location could not be found. Move near a window or outdoors and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/office network Your/)).toBeNull();
  });

  it('says how late in hours and minutes, never "770 min"', () => {
    // Clocked in at 10:20 pm for a 9:30 am shift: 12 h 50 min late.
    render(<HomeClockCard {...props({ now: new Date('2026-10-19T16:51:00Z'), data: { ...DAY, next: 'out', punches: [punch('in', '2026-10-19T16:50:00Z')] } })} />);
    expect(screen.getByText('Late by 12 h 50 min')).toBeInTheDocument();
    expect(screen.queryByText(/770 min/)).toBeNull();
  });

  it('has no clock-in on a day of leave or a weekly off', () => {
    const { rerender } = render(<HomeClockCard {...props({ data: { ...DAY, days: [{ on: '2026-10-19', status: 'leave', leavePart: 'full', workedMinutes: null, lateMinutes: null, regularised: false }] } })} />);
    expect(screen.getByText('On leave today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clock in' })).not.toBeInTheDocument();
    rerender(<HomeClockCard {...props({ data: { ...DAY, shift: { ...DAY.shift, off: true } } })} />);
    expect(screen.getByText('Weekly off today')).toBeInTheDocument();
  });

  it('is done for the day after checking out', () => {
    render(<HomeClockCard {...props({ data: { ...DAY, punches: [punch('in', '2026-10-19T04:08:00Z'), punch('out', '2026-10-19T13:05:00Z')] } })} />);
    expect(screen.getByText('Clocked out at 6:35 pm')).toBeInTheDocument();
  });
});
