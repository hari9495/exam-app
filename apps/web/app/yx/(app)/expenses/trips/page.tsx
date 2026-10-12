'use client';

import { useRouter } from 'next/navigation';
import { TripsScreen, type TripSummary } from '@yukthix/ui/expenses';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../../lib/yx-expenses';

// Trips (EXP-04, M05 batch E4): my trips, trips waiting for me, and the travel desk's list to book.
export default function YxTripsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const mine = useExp<{ trips: TripSummary[] }>('/trips');
  const approvals = useExp<{ trips: TripSummary[] }>('/trips?view=approvals');
  const desk = useExp<{ trips: TripSummary[] }>('/trips?view=desk', perms.has('travel.booking.manage'));
  const write = useExpWrite();
  return (
    <TripsScreen
      state={loadState(mine, approvals)}
      onRetry={() => void Promise.all([mine.refetch(), approvals.refetch()])}
      mine={mine.data?.trips ?? null}
      approvals={approvals.data?.trips ?? null}
      desk={perms.has('travel.booking.manage') ? (desk.data?.trips ?? []) : null}
      today={todayIst()}
      onRequest={async (input) => {
        const t = await write<{ id: string; version: number }>('POST', '/trips', input);
        await write('POST', `/trips/${encodeURIComponent(t.id)}/submit`, { version: t.version });
        router.push(`/yx/expenses/trips/${encodeURIComponent(t.id)}`);
      }}
      onOpen={(id) => router.push(`/yx/expenses/trips/${encodeURIComponent(id)}`)}
    />
  );
}
