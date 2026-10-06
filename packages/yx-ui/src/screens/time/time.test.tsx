/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { composeStories } from '@storybook/react-vite';
import {
  canReopen,
  countLeaveDays,
  encashAmount,
  evaluateClock,
  geofenceVerdict,
  lateMinutes,
  leaveWarnings,
  monthSummary,
  nextClockState,
  otCapFlag,
  overtimeMinutes,
  regularisationRoute,
  workedMinutes,
  yearEndSplit,
  type ClockContext,
  type Punch,
} from './time-logic';
import { FENCES, GENERAL_SHIFT, SEPTEMBER, TODAY } from './time-data';
import { AttendanceMonth, ClockCard } from './time-kit';
import { AttendanceCalendarScreen } from './attendance';
import { ApplyLeaveForm, OptionalHolidaysSheet } from './leave';

const ctx = (o: Partial<ClockContext> = {}): ClockContext => ({
  state: 'not_in', now: 9 * 60 + 25, shift: GENERAL_SHIFT, inside: true, locationName: 'Chennai office', mode: 'restricted', deviceApproved: true, ...o,
});

describe('clock-in policy (M02 §B1)', () => {
  it('allows clock-in inside the office network', () => {
    expect(evaluateClock(ctx())).toEqual({ actions: ['clock_in'], block: null });
  });
  it('blocks outside the office with a plain reason and WFH / on-duty options', () => {
    const r = evaluateClock(ctx({ inside: false, distanceM: 850 }));
    expect(r.actions).toEqual([]);
    expect(r.block?.message).toBe('Clock in as work from home or on duty instead?');
    expect(r.block?.title).toContain('850 m away');
    expect(r.block?.options).toEqual(['wfh', 'on_duty', 'retry']);
  });
  it('does not restrict field-mode staff', () => {
    expect(evaluateClock(ctx({ inside: false, mode: 'field' })).block).toBeNull();
  });
  it('blocks before the check-in window opens', () => {
    const r = evaluateClock(ctx({ now: 8 * 60 + 10 }));
    expect(r.block?.code).toBe('not_started');
    expect(r.block?.message).toBe('General shift starts at 9:30 am. Clock-in opens at 8:30 am.');
  });
  it('blocks after clock-out and offers regularise', () => {
    const r = evaluateClock(ctx({ state: 'out', outAt: '18:41' }));
    expect(r.block?.code).toBe('already_out');
    expect(r.block?.message).toContain('6:41 pm');
    expect(r.block?.options).toEqual(['regularise']);
  });
  it('blocks an unapproved device before anything else', () => {
    expect(evaluateClock(ctx({ deviceApproved: false, inside: false })).block?.code).toBe('device');
  });
  it('flags a coarse GPS fix', () => {
    expect(evaluateClock(ctx({ accuracyM: 300 })).block?.message).toContain('Location accuracy 300 m');
  });
  it('allows break and clock-out while working', () => {
    expect(evaluateClock(ctx({ state: 'working' })).actions).toEqual(['clock_out', 'start_break']);
    expect(evaluateClock(ctx({ state: 'break' })).actions).toEqual(['end_break']);
  });
  it('moves through the state machine and ignores invalid actions', () => {
    expect(nextClockState('not_in', 'clock_in')).toBe('working');
    expect(nextClockState('working', 'start_break')).toBe('break');
    expect(nextClockState('break', 'end_break')).toBe('working');
    expect(nextClockState('working', 'clock_out')).toBe('out');
    expect(nextClockState('out', 'clock_in')).toBe('out');
  });
});

describe('worked time, late and OT', () => {
  const p = (kind: Punch['kind'], time: string): Punch => ({ id: time, kind, time, source: 'web', where: '', verdict: 'network' });
  it('subtracts breaks and counts an open punch to now', () => {
    expect(workedMinutes([p('in', '09:30'), p('break_start', '13:00'), p('break_end', '13:30'), p('out', '18:30')])).toBe(510);
    expect(workedMinutes([p('in', '09:38')], 9 * 60 + 42)).toBe(4);
  });
  it('counts late only beyond grace', () => {
    expect(lateMinutes('09:30', '09:38', 10)).toBe(0);
    expect(lateMinutes('09:30', '09:52', 10)).toBe(22);
  });
  it('gives no OT for a few minutes past shift end and rounds down (YX-AT-04)', () => {
    expect(overtimeMinutes('18:00', '18:07')).toBe(0);
    expect(overtimeMinutes('18:30', '19:20')).toBe(45);
    expect(overtimeMinutes('18:30', '19:35')).toBe(60);
  });
  it('flags statutory OT caps', () => {
    expect(otCapFlag(9, 58)).toBeNull();
    expect(otCapFlag(13, 71)).toContain('weekly cap');
    expect(otCapFlag(11, 77)).toContain('quarterly cap');
  });
});

describe('geofence verdict (YX-AT-23)', () => {
  it('is inside at the office pin', () => {
    expect(geofenceVerdict({ lat: 12.9894, lng: 80.2481, accuracyM: 20 }, FENCES).kind).toBe('inside');
  });
  it('says how far outside the nearest fence', () => {
    const v = geofenceVerdict({ lat: 12.9985, lng: 80.253, accuracyM: 25 }, FENCES);
    expect(v.kind).toBe('outside');
    expect(v.fence.name).toBe('Chennai office');
    expect(v.message).toMatch(/^Outside Chennai office, \d+ m away$/);
  });
  it('asks to move outdoors when accuracy is poor', () => {
    expect(geofenceVerdict({ lat: 12.9894, lng: 80.2481, accuracyM: 300 }, FENCES).message).toBe('Location accuracy 300 m, move outdoors');
  });
});

describe('attendance month summary', () => {
  it('counts present, LOP, late marks, OT and items to fix for September', () => {
    const s = monthSummary(SEPTEMBER);
    expect(s.counts.P).toBe(12);
    expect(s.lateMarks).toBe(2);
    expect(s.otHours).toBe(1.75);
    expect(s.pending).toBe(2);
    expect(s.present).toBe(12 + 2 + 1 + 1 + 0.5);
    expect(s.lop).toBe(0);
  });
  it('counts an open absence as absent, not unpaid, until the month locks', () => {
    const s = monthSummary([{ date: new Date(2026, 8, 24), code: 'A' }, { date: new Date(2026, 7, 21), code: 'LOP' }]);
    expect(s.absent).toBe(1);
    expect(s.lop).toBe(1);
  });
});

describe('leave counting (YX-LV-03) and warnings', () => {
  const base = { holidays: [new Date(2026, 9, 2)], weeklyOffDays: [0], weeklyOffDates: [new Date(2026, 9, 10)] };
  it('counts the weekend between leave days with sandwich, not without', () => {
    const r = { from: new Date(2026, 9, 9), to: new Date(2026, 9, 12), ...base };
    expect(countLeaveDays({ ...r, sandwich: 'sandwich' }).total).toBe(4);
    expect(countLeaveDays({ ...r, sandwich: 'none' }).total).toBe(2);
  });
  it('never counts an edge holiday under the sandwich rule', () => {
    expect(countLeaveDays({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 2), ...base, sandwich: 'sandwich' }).total).toBe(1);
  });
  it('counts half days at both ends', () => {
    expect(countLeaveDays({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 7), fromHalf: 'second', toHalf: 'first', ...base, sandwich: 'none' }).total).toBe(2);
  });
  it('blocks over balance and past the negative limit, warns within it', () => {
    const w = { balance: 4.5, negativeLimit: 0, noticeDays: 0, daysAhead: 10, maxPerRequest: 10, attachmentAfter: null, hasAttachment: false, blocked: false, onNotice: false };
    expect(leaveWarnings({ ...w, total: 5 }).errors[0]).toContain('Not enough balance');
    expect(leaveWarnings({ ...w, total: 5, negativeLimit: 2 }).errors).toEqual([]);
    expect(leaveWarnings({ ...w, total: 5, negativeLimit: 2 }).warnings[0]).toContain('-0.5');
  });
  it('requires a certificate and warns about notice and the notice period', () => {
    const w = leaveWarnings({ total: 3, balance: 6, negativeLimit: 0, noticeDays: 7, daysAhead: 1, maxPerRequest: 10, attachmentAfter: 2, hasAttachment: false, blocked: false, onNotice: true, noticePolicy: 'extends' });
    expect(w.errors).toContain('Attach a medical certificate for more than 2 days.');
    expect(w.warnings.some((x) => x.includes("7 days' notice"))).toBe(true);
    expect(w.warnings.some((x) => x.includes('last working day moves by 3 days'))).toBe(true);
  });
});

describe('requests, periods, year end', () => {
  it('adds HR after 4 regularisations and for locked dates', () => {
    expect(regularisationRoute({ usedThisMonth: 1, dateLocked: false }).steps).toEqual(['Manager']);
    expect(regularisationRoute({ usedThisMonth: 4, dateLocked: false }).steps).toEqual(['Manager', 'HR']);
    const locked = regularisationRoute({ usedThisMonth: 0, dateLocked: true });
    expect(locked.steps).toEqual(['Manager', 'HR']);
    expect(locked.notes[0]).toContain('late request');
  });
  it('refuses reopen after the bank file or filing (YX-LOCK-05)', () => {
    expect(canReopen({ stage: 'locked', bankReleased: true, payslipsPublished: true, returnFiled: false }).ok).toBe(false);
    expect(canReopen({ stage: 'filed', bankReleased: true, payslipsPublished: true, returnFiled: true }).reason).toContain('return is filed');
    expect(canReopen({ stage: 'locked', bankReleased: false, payslipsPublished: false, returnFiled: false }).ok).toBe(true);
  });
  it('splits closing balance into carry, encash and lapse', () => {
    expect(yearEndSplit({ name: '', type: '', closing: 34, cfCap: 30, encashMax: 10 })).toEqual({ carry: 30, encash: 4, lapse: 0 });
    expect(yearEndSplit({ name: '', type: '', closing: 45, cfCap: 30, encashMax: 10 })).toEqual({ carry: 30, encash: 10, lapse: 5 });
  });
  it('computes encashment on the ÷26 rate', () => {
    expect(encashAmount(48000, 26, 5)).toBe(9231);
  });
});

describe('ClockCard flows', () => {
  it('clocks in, shows the new status and punch, then starts a break', async () => {
    const u = userEvent.setup();
    render(<ClockCard now={9 * 60 + 25} date={TODAY} shift={GENERAL_SHIFT} />);
    expect(screen.getByText('Not clocked in')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(screen.getByText('Working since 9:25 am')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('In recorded at 9:25 am');
    expect(within(screen.getByRole('list', { name: 'Punches' })).getAllByRole('listitem')).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Start break' }));
    expect(screen.getByText(/On break since/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End break' })).toBeTruthy();
  });
  it('outside the office: clock-in disabled until WFH is chosen', async () => {
    const u = userEvent.setup();
    render(<ClockCard now={9 * 60 + 25} date={TODAY} shift={GENERAL_SHIFT} inside={false} />);
    expect(screen.getByText('Not on Chennai office Wi-Fi')).toBeTruthy();
    expect(screen.getByText('Clock in as work from home or on duty instead?')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clock in' }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(screen.getByRole('button', { name: 'Clock in as WFH' }));
    expect((screen.getByRole('button', { name: 'Clock in' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Work from home')).toBeTruthy();
  });
  it('shows late by minutes beyond grace', () => {
    render(<ClockCard now={600} date={TODAY} shift={GENERAL_SHIFT} defaultState="working" defaultPunches={[{ id: 'a', kind: 'in', time: '09:52', source: 'web', where: '', verdict: 'network' }]} />);
    expect(screen.getByText('Late by 22 min')).toBeTruthy();
  });
});

describe('attendance calendar', () => {
  it('labels each day with its status and opens the day card on click', async () => {
    const u = userEvent.setup();
    render(<AttendanceCalendarScreen />);
    const day10 = screen.getByRole('button', { name: /10 Sep 2026: Missing check-out/ });
    await u.click(day10);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText(/Payroll for September can't be approved/).length).toBeGreaterThan(0);
  });
  it('shows the locked notice for August after navigating back', async () => {
    const u = userEvent.setup();
    render(<AttendanceCalendarScreen />);
    await u.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('August 2026 is locked')).toBeTruthy();
  });
  it('disables future days', () => {
    render(<AttendanceMonth month={SEPTEMBER[0].date} days={SEPTEMBER} />);
    expect((screen.getByRole('button', { name: /30 Sep 2026: Upcoming/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('leave sheets', () => {
  it('apply leave summary shows sandwich days and balance after', () => {
    render(<ApplyLeaveForm />);
    const summary = screen.getByRole('region', { name: 'Leave summary' });
    expect(within(summary).getByText('Days counted').nextSibling?.textContent).toBe('4 (incl. 2 weekend days)');
    // 14 earned leave − 2 already pending − 4 for 23–26 Oct.
    expect(within(summary).getByText('Balance after').nextSibling?.textContent).toBe('8');
  });
  it('optional holidays blocks saving over the limit', async () => {
    const u = userEvent.setup();
    render(<OptionalHolidaysSheet chosen={['o1']} />);
    // Mahalaya Amavasya falls on a weekly off, so it can't be picked.
    expect((screen.getByRole('checkbox', { name: /Mahalaya Amavasya/ }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(screen.getByRole('checkbox', { name: /Karthigai Deepam/ }));
    // At the limit the other choices are disabled with the reason, so you can't go over.
    expect((screen.getByRole('checkbox', { name: /Christmas Eve/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Limit reached · untick one to swap').length).toBeGreaterThan(0);
  });
});

// Smoke test: every Time story renders without throwing (visuals are checked in Storybook).
const modules = import.meta.glob('./*.stories.tsx', { eager: true }) as Record<string, Parameters<typeof composeStories>[0]>;
describe('Time stories render', () => {
  for (const [file, mod] of Object.entries(modules)) {
    for (const [name, S] of Object.entries(composeStories(mod))) {
      const Story = S as unknown as () => JSX.Element;
      it(`${file} · ${name}`, () => {
        const { container, unmount } = render(<Story />);
        expect(container.ownerDocument.body.textContent?.length).toBeGreaterThan(0);
        unmount();
      });
    }
  }
});
