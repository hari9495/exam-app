'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { IndustrialActionScreen, type IndustrialEvent, type IndustrialList, type IndustrialOptions } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const HOME = '/yx/time/industrial-action';

// HR › Industrial action (TIM-37, attendance.lock over the legal entity). The page opens on the past strikes, lockouts
// and lay-offs in scope (founder decision 7b, server paging 25 / 50 / 100); ?new=1 records one at an establishment;
// ?id= opens its record (legality, dates, cancel). Pay follows the kind and legality in the payroll feed.
function YxIndustrialActionInner() {
  const sp = useSearchParams();
  const id = sp.get('id');
  const form = !id && sp.get('new') === '1';
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const list = useTime<IndustrialList>(!id && !form ? `/industrial-actions?page=${page}&pageSize=${pageSize}` : null);
  const options = useTime<IndustrialOptions>(form ? '/industrial-actions/options' : null);
  const event = useTime<IndustrialEvent>(id ? `/industrial-actions/${encodeURIComponent(id)}` : null);
  const write = useTimeWrite();
  const open = (eid: string) => `${HOME}?id=${encodeURIComponent(eid)}`;
  return (
    <IndustrialActionScreen
      live={{
        state: id ? timeState(event) : form ? timeState(options) : timeState(list),
        onRetry: () => void (id ? event.refetch() : form ? options.refetch() : list.refetch()),
        options: options.data ?? null,
        event: id ? (event.data ?? null) : null,
        list: !id && !form ? { data: list.data ?? null, page, pageSize, onPage: setPage, onPageSize: (n) => { setPageSize(n); setPage(1); }, openHref: open, recordHref: `${HOME}?new=1` } : undefined,
        onRecord: async (input) => {
          const e = await write<IndustrialEvent>('/industrial-actions', 'POST', input, true, 'Event recorded');
          router.replace(open(e.id));
          return e;
        },
        onLegality: (eid, legality, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/legality`, 'POST', { legality, version }, true, 'Legality saved'),
        onDates: (eid, from, to, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/dates`, 'POST', { from, to, version }, true, 'Dates saved'),
        onCancel: (eid, version) => write<IndustrialEvent>(`/industrial-actions/${encodeURIComponent(eid)}/cancel`, 'POST', { version }, true, 'Event cancelled'),
        links: { cancel: HOME, list: HOME, people: '/yx/people/directory', muster: '/yx/time/muster' },
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
