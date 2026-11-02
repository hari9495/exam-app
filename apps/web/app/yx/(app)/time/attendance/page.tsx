'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { AttendanceCalendarScreen, MyAttendanceTodayScreen, type DayCard, type LiveMyAttendance, type MyAttendance, type MyNightWork, type NightCodeSent, type PunchResult } from '@yukthix/ui/time';
import { browserLocation, timeState, todayIndia, useOtherWrite, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

// Me › Attendance: the designed attendance calendar (my month, day cards, fixes, work from home, night work) and, with
// ?view=today, the designed "My attendance today" clock page. No permission key; punches and fixes are the person's own.
// The location is read only when they press Clock in or Clock out, and only to send with that punch. Night work: the
// person's own opt-in and consent confirmation (one-time code) or withdrawal (founder decisions 9 Oct 2026). Home's
// "Request work from home" opens the sheet here (?request=wfh); its Regularise opens the fix sheet (?request=regularise).
function YxMyAttendanceInner() {
  const params = useSearchParams();
  const request = params.get('request');
  const today = params.get('view') === 'today';
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const att = useTime<MyAttendance>(`/me/attendance?month=${today ? todayIndia().slice(0, 7) : month}`);
  const night = useTime<MyNightWork>(today ? null : '/me/night-work');
  const write = useTimeWrite();
  const read = useTimeRead();
  const other = useOtherWrite();
  const live: LiveMyAttendance = {
    state: timeState(att),
    onRetry: () => void att.refetch(),
    data: att.data ?? null,
    month,
    onMonth: setMonth,
    getLocation: browserLocation,
    onPunch: (kind, pin, opts) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}), ...(opts?.wfh ? { wfh: true } : {}), ...(opts?.note ? { note: opts.note } : {}) }),
    onFix: (input) => write('/me/regularise', 'POST', input),
    onWithdrawFix: (rid) => write(`/me/regularise/${encodeURIComponent(rid)}/withdraw`),
    onOpenDay: (on) => read<DayCard>(`/people/${encodeURIComponent(att.data!.employee.id)}/days/${on}`),
    onWfh: (input) => write('/me/wfh', 'POST', input),
    onOnDuty: (input) => write('/me/on-duty', 'POST', input),
    onOtPlan: (input) => write('/me/overtime/plans', 'POST', input),
    onWithdrawOtPlan: (pid) => write(`/me/overtime/plans/${encodeURIComponent(pid)}/withdraw`),
    // TIM-07: a day of a frozen or locked month goes as a late correction (manager, HR, payroll), paid next payroll.
    onLateCorrection: (input) => other('/payroll/me/late-corrections', input),
    defaultRequest: request === 'wfh' || request === 'regularise' ? request : undefined,
    night: night.data ?? null,
    onNightOptIn: (optIn) => write('/me/night-work/opt-in', 'PUT', { optIn }),
    onNightCode: (id) => write<NightCodeSent>(`/me/night-consents/${encodeURIComponent(id)}/code`, 'POST', undefined, false),
    onNightConfirm: (id, code) => write(`/me/night-consents/${encodeURIComponent(id)}/confirm`, 'POST', { code }),
    onNightWithdraw: (id) => write(`/me/night-consents/${encodeURIComponent(id)}/withdraw`),
    todayHref: '/yx/time/attendance?view=today',
    monthHref: '/yx/time/attendance',
  };
  return today ? <MyAttendanceTodayScreen live={live} /> : <AttendanceCalendarScreen live={live} />;
}

export default function YxMyAttendancePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxMyAttendanceInner />
    </Suspense>
  );
}
