'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { AttendanceCalendarScreen, type DayCard, type Muster, type PersonAttendance } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// Muster › one person (Extra · Attendance calendar, Manager · one person): the designed month of someone in the viewer's
// muster (a manager's team; HR's attendance.view scope). The server checks the scope: anyone else answers 404, shown as
// "no access". The picker lists the people of the muster; each day opens the person's day card (TIM-03).
function YxPersonMonthInner() {
  const router = useRouter();
  const employeeId = String(useParams<{ employeeId: string }>().employeeId ?? '');
  const params = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : todayIndia().slice(0, 7);
  const person = useTime<PersonAttendance>(`/people/${id(employeeId)}/attendance?month=${month}`);
  const muster = useTime<Muster>(`/muster?month=${month}`);
  const read = useTimeRead();
  const go = (who: string, m: string) => router.push(`/yx/time/muster/${id(who)}?month=${m}`);
  const notFound = (person.error as { status?: number } | null)?.status === 404;
  return (
    <AttendanceCalendarScreen
      personLive={{
        state: notFound ? 'no-access' : timeState(person),
        onRetry: () => void person.refetch(),
        data: person.data ?? null,
        month,
        onMonth: (m) => go(employeeId, m),
        people: (muster.data?.people ?? []).filter((p) => !p.me).map((p) => ({ id: p.id, name: p.name })),
        onPick: (who) => go(who, month),
        onOpenDay: (on) => read<DayCard>(`/people/${id(employeeId)}/days/${on}`),
        musterHref: '/yx/time/muster',
        exceptionsHref: person.data ? `/yx/time/exceptions?search=${id(person.data.employee.name)}` : undefined,
      }}
    />
  );
}

export default function YxPersonMonthPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxPersonMonthInner />
    </Suspense>
  );
}
