'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EXP_LINKS, TripScreen, type TripSummary } from '@yukthix/ui/expenses';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../../lib/yx-expenses';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Trips (EXP-04, the designed screen with `live`): my trips, trips waiting for me, and the travel desk's list to book.
function Trips() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  // ?new=1: "Request a trip" from the expenses home opens the request sheet at once.
  const startRequest = useSearchParams()?.get('new') === '1';
  useEffect(() => {
    if (startRequest) router.replace(EXP_LINKS.trips, { scroll: false });
  }, [startRequest, router]);
  const mine = useExp<{ trips: TripSummary[] }>('/trips');
  const approvals = useExp<{ trips: TripSummary[] }>(withParams('/trips?view=approvals', sp.entity));
  const desk = useExp<{ trips: TripSummary[] }>(withParams('/trips?view=desk', sp.entity), perms.has('travel.booking.manage'));
  const write = useExpWrite();
  return (
    <TripScreen
      live={{
        view: 'list',
        state: loadState(mine, approvals),
        onRetry: () => void Promise.all([mine.refetch(), approvals.refetch()]),
        mine: mine.data?.trips ?? null,
        approvals: approvals.data?.trips ?? null,
        desk: perms.has('travel.booking.manage') ? (desk.data?.trips ?? []) : null,
        today: todayIst(),
        startRequest,
        onRequest: async (input) => {
          const t = await write<{ id: string; version: number }>('POST', '/trips', input);
          await write('POST', `/trips/${encodeURIComponent(t.id)}/submit`, { version: t.version });
          router.push(EXP_LINKS.trip(t.id));
        },
        onOpen: (id) => router.push(EXP_LINKS.trip(id)),
      }}
    />
  );
}

export default function YxTripsPage() {
  return (
    <Suspense>
      <Trips />
    </Suspense>
  );
}
