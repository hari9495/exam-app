'use client';

import { useRouter } from 'next/navigation';
import { LifeEventsList } from '@yukthix/ui/frame';
import type { LifeJourneyRow } from '@yukthix/ui/lifecycle';
import { todayIst } from '../../../../../lib/yx-org';
import { useLife } from '../../../../../lib/yx-lifecycle';

// People › Life events (PPL-48, designed 20 Oct 2026; LIFE-6.03, design §7.5): running checklists for new managers,
// transfers, parental leave and return to work, in the viewer's scope. Each opens the usual checklist page.
export default function YxLifeEventsPage() {
  const router = useRouter();
  const list = useLife<{ rows: LifeJourneyRow[] }>('/lifecycle/life-journeys');
  return (
    <LifeEventsList
      rows={list.data?.rows ?? []}
      today={new Date(`${todayIst()}T00:00:00`)}
      state={list.isError ? 'error' : list.data ? 'ready' : 'loading'}
      onRetry={() => void list.refetch()}
      onOpen={(id) => router.push(`/yx/people/onboarding/${encodeURIComponent(id)}`)}
    />
  );
}
