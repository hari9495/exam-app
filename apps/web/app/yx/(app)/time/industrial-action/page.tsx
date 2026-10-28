'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { IndustrialActionScreen, type IndustrialEvent, type IndustrialOptions } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// HR › Industrial action (TIM-37, attendance.lock over the legal entity): record a strike, lockout or lay-off at one
// establishment; ?id= opens its record (legality, dates, cancel). Pay follows the kind and legality in the payroll feed.
function YxIndustrialActionInner() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const options = useTime<IndustrialOptions>(id ? null : '/industrial-actions/options');
  const event = useTime<IndustrialEvent>(id ? `/industrial-actions/${encodeURIComponent(id)}` : null);
  const write = useTimeWrite();
  return (
    <IndustrialActionScreen
      live={{
        state: id ? timeState(event) : timeState(options),
        onRetry: () => void (id ? event.refetch() : options.refetch()),
        options: options.data ?? null,
        event: id ? (event.data ?? null) : null,
        onRecord: async (input) => {
          const e = await write<IndustrialEvent>('/industrial-actions', 'POST', input, true, 'Event recorded');
          router.replace(`/yx/time/industrial-action?id=${encodeURIComponent(e.id)}`);
          return e;
        },
        onLegality: (eid, legality, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/legality`, 'POST', { legality, version }, true, 'Legality saved'),
        onDates: (eid, from, to, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/dates`, 'POST', { from, to, version }, true, 'Dates saved'),
        onCancel: (eid, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/cancel`, 'POST', { version }, true, 'Event cancelled'),
        links: { cancel: '/yx/time/periods', people: '/yx/people/directory', muster: '/yx/time/muster' },
      }}
    />
  );
}

export default function YxIndustrialActionPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxIndustrialActionInner />
    </Suspense>
  );
}
