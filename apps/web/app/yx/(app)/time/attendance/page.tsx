'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { AttendanceCalendarScreen, NightWorkCard, type DayCard, type MyAttendance, type MyNightWork, type NightCodeSent } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

// Me › Attendance (the designed attendance calendar, with TIM-07's request drawer for a fix or work from home): no
// permission key; days, fixes and requests are the person's own. Checking in and out is on Home's clock card. Night
// work: the person's own opt-in and consent confirmation (founder decisions 9 Oct 2026). Home's "Request work from
// home" and its clock's "Regularise" open the drawer here (?request=wfh | regularise); the parameter is then dropped,
// so asking again from Home opens it again.
function YxMyAttendanceInner() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get('request');
  const [ask, setAsk] = useState<{ type: 'regularise' | 'wfh'; n: number } | undefined>();
  useEffect(() => {
    if (asked !== 'wfh' && asked !== 'regularise') return;
    setAsk((a) => ({ type: asked, n: (a?.n ?? 0) + 1 }));
    router.replace(path);
  }, [asked, path, router]);
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const att = useTime<MyAttendance>(`/me/attendance?month=${month}`);
  const night = useTime<MyNightWork>('/me/night-work');
  const read = useTimeRead();
  const write = useTimeWrite();
  const employeeId = att.data?.employee.id;
  return (
    <AttendanceCalendarScreen
      live={{
        state: timeState(att),
        onRetry: () => void att.refetch(),
        data: att.data ?? null,
        month,
        onMonth: setMonth,
        onOpenDay: (on) => read<DayCard>(`/people/${encodeURIComponent(employeeId ?? '')}/days/${on}`),
        onFix: (input) => write('/me/regularise', 'POST', input),
        onWfh: (input) => write('/me/wfh', 'POST', input),
        onWithdraw: (rid) => write(`/me/regularise/${encodeURIComponent(rid)}/withdraw`),
        ask,
        extra: night.data ? (
          <NightWorkCard
            night={night.data}
            onNightOptIn={(optIn) => write('/me/night-work/opt-in', 'PUT', { optIn })}
            onNightCode={(id) => write<NightCodeSent>(`/me/night-consents/${encodeURIComponent(id)}/code`, 'POST', undefined, false)}
            onNightConfirm={(id, code) => write(`/me/night-consents/${encodeURIComponent(id)}/confirm`, 'POST', { code })}
            onNightWithdraw={(id) => write(`/me/night-consents/${encodeURIComponent(id)}/withdraw`)}
          />
        ) : undefined,
      }}
    />
  );
}

export default function YxMyAttendancePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxMyAttendanceInner />
    </Suspense>
  );
}
