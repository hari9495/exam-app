import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeClockCard } from './my-attendance';
import type { MyAttendance } from './types';

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
const punch = (kind: 'in' | 'out', at: string) => ({ id: kind, kind, at, source: 'web', accepted: true, refusal: null, verdict: 'network', distanceM: null, accuracyM: null, where: null });
const props = (over: Partial<Parameters<typeof HomeClockCard>[0]> = {}) => ({
  data: DAY,
  now: NOW,
  getLocation: vi.fn(async () => ({ pin: { lat: 12.9, lng: 77.6, accuracyM: 20 } })),
  onPunch: vi.fn(async (kind: 'in' | 'out') => ({ accepted: true, duplicate: false, kind, message: 'Recorded', verdict: 'network', distanceM: null })),
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

  it('shows working since the first punch, with no break button (no break punch in the live app)', () => {
    render(<HomeClockCard {...props({ data: { ...DAY, next: 'out', punches: [punch('in', '2026-10-19T04:08:00Z')] } })} />);
    expect(screen.getByText('Working since 9:38 am')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start break' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Today's punches (1)" })).toHaveAttribute('href', '/yx/time/attendance');
  });

  it('says why a punch was refused', async () => {
    const p = props({ onPunch: vi.fn(async () => ({ accepted: false, duplicate: false, kind: 'in' as const, message: 'Outside Bengaluru head office, 850 m away', verdict: 'outside', distanceM: 850 })) });
    render(<HomeClockCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText('Outside Bengaluru head office, 850 m away')).toBeInTheDocument();
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
