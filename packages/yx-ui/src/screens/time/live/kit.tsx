import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../../components/display';
import { ErrorState, NoAccessState, Skeleton } from '../../../components/feedback';
import { PageHeader } from '../../../components/shell';
import type { DayStatus, LeaveStatus, LoadState } from './types';

// Small shared pieces of the wired time screens: the page frame with its load states, and plain-English labels.

export function LivePage({ title, description, actions, state, onRetry, what, grantedBy = 'HR', children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; state: LoadState; onRetry?: () => void; what: string; grantedBy?: string; children: ReactNode }) {
  return (
    <div className="yx-auth__page yx-tim-live">
      <PageHeader title={title} description={description} actions={state === 'ready' ? actions : undefined} />
      {state === 'loading' && (
        <div className="yx-tim-stack" aria-busy="true" aria-label={`Loading ${what}`}>
          <Skeleton height={96} />
          <Skeleton height={240} />
        </div>
      )}
      {state === 'error' && <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy={grantedBy} what={what} />}
      {state === 'ready' && <div className="yx-tim-stack">{children}</div>}
    </div>
  );
}

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Mon 12 Oct" */
export const dayText = (iso: string) => D(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "12 Oct 2026" */
export const dateText = (iso: string) => D(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const rangeText = (from: string, to: string) => (from === to ? dayText(from) : `${dayText(from)} to ${dayText(to)}`);
export const daysText = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
export const addDays = (iso: string, n: number) => new Date(D(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** Minutes after midnight as "9:30 am". */
export function clock(minute: number | null | undefined): string {
  if (minute === null || minute === undefined) return '';
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
/** An instant as local "9:31 am" in the zone. */
export const timeIn = (iso: string | null | undefined, zone: string) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).toLowerCase() : '');
export const duration = (min: number | null | undefined) => (min === null || min === undefined ? '' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} m`);

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  cancel_pending: { label: 'Cancellation waiting', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export const LeaveStatusBadge = ({ status }: { status: LeaveStatus }) => <Badge tone={LEAVE_STATUS[status].tone}>{LEAVE_STATUS[status].label}</Badge>;

export const DAY_STATUS: Record<DayStatus, { label: string; code: string; tone: BadgeTone }> = {
  present: { label: 'Present', code: 'P', tone: 'success' },
  half_day: { label: 'Half day', code: 'HD', tone: 'warning' },
  absent: { label: 'Absent', code: 'A', tone: 'danger' },
  leave: { label: 'On leave', code: 'L', tone: 'info' },
  holiday: { label: 'Holiday', code: 'H', tone: 'neutral' },
  weekly_off: { label: 'Weekly off', code: 'WO', tone: 'neutral' },
  missing_in: { label: 'Missing check-in', code: 'MI', tone: 'warning' },
  missing_out: { label: 'Missing check-out', code: 'MO', tone: 'warning' },
  no_timesheet: { label: 'No timesheet yet', code: 'NT', tone: 'warning' },
  not_started: { label: 'Day not over', code: '·', tone: 'neutral' },
};
export const DayStatusBadge = ({ status, leavePart }: { status: DayStatus; leavePart?: string | null }) => (
  <Badge tone={DAY_STATUS[status].tone}>
    {DAY_STATUS[status].label}
    {leavePart && leavePart !== 'full' && status !== 'leave' ? ` · ${leavePart} half on leave` : ''}
  </Badge>
);

export const MODE_TEXT: Record<string, string> = { punch: 'Check in and out', assumed_present: 'Present unless on leave', timesheet: 'Timesheet' };
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function offsText(offs: { weekday: number; nth?: number[] }[]): string {
  if (!offs.length) return 'None';
  const nth = (n: number) => ['1st', '2nd', '3rd', '4th', '5th'][n - 1];
  return offs.map((o) => (o.nth?.length ? `${o.nth.map(nth).join(' and ')} ${WEEKDAYS[o.weekday - 1]}` : `${WEEKDAYS[o.weekday - 1]}s`)).join(', ');
}
