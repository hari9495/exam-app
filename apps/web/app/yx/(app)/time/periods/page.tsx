'use client';

import { useRouter } from 'next/navigation';
import { PeriodsScreen, type Periods, type Preflight } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

const PAGES = { muster: '/yx/time/muster', leave: '/yx/time/team', overtime: '/yx/time/overtime-review', approvals: '/yx/approvals' } as const;

// Periods (TIM-11, the designed screen; P08): attendance.lock for the legal entity; lock and reopen ask for a fresh
// second step (the API client handles it).
export default function YxPeriodsPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const year = Number(todayIndia().slice(0, 4));
  const periods = useTime<Periods>(withParams(`/periods?year=${year}`, sp.entity));
  // January to March also show the last months of the year before (the screen shows the latest four months).
  const early = Number(todayIndia().slice(5, 7)) <= 3;
  const before = useTime<Periods>(early ? withParams(`/periods?year=${year - 1}`, sp.entity) : null);
  const data: Periods | null = periods.data && (!early || before.data) ? { ...periods.data, entities: periods.data.entities.map((e) => ({ ...e, months: [...(before.data?.entities.find((x) => x.id === e.id)?.months ?? []), ...e.months] })) } : null;
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <PeriodsScreen
      live={{
        state: early ? timeState(periods, before) : timeState(periods),
        onRetry: () => void periods.refetch(),
        data,
        onPreflight: (legalEntityId, month) => read<Preflight>(`/periods/preflight?legalEntityId=${encodeURIComponent(legalEntityId)}&month=${month}`),
        onLock: (legalEntityId, month) => write('/periods/lock', 'POST', { legalEntityId, month }),
        onUnlock: (legalEntityId, month, reason) => write('/periods/unlock', 'POST', { legalEntityId, month, reason }),
        onOpen: (where) => router.push(PAGES[where]),
      }}
    />
  );
}
