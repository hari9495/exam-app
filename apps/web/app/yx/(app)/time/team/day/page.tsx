'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { DayCardScreen, type DayCard, type PersonAttendance } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// Batch C item 15: the designed TIM-03 day card, opened from a dot on the team calendar (a manager's own team, answer 2509).
// The server checks the manager's scope for the person: anyone else answers 404, shown as "no access".
function YxTeamDayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const person = params.get('person') ?? '';
  const on = /^\d{4}-\d{2}-\d{2}$/.test(params.get('on') ?? '') ? params.get('on')! : todayIndia();
  const month = useTime<PersonAttendance>(`/people/${id(person)}/attendance?month=${on.slice(0, 7)}`);
  const read = useTimeRead();
  const notFound = (month.error as { status?: number } | null)?.status === 404;
  return (
    <DayCardScreen
      live={{
        state: notFound ? 'no-access' : timeState(month),
        onRetry: () => void month.refetch(),
        data: month.data ?? null,
        on,
        onDay: (day) => router.replace(`/yx/time/team/day?person=${id(person)}&on=${day}`),
        onOpenDay: (day) => read<DayCard>(`/people/${id(person)}/days/${day}`),
        backHref: '/yx/time/team',
        backLabel: 'Back to the team calendar',
        onClose: () => router.push('/yx/time/team'),
      }}
    />
  );
}

export default function YxTeamDayPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxTeamDayInner />
    </Suspense>
  );
}
