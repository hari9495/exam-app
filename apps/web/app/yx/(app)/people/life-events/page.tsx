'use client';

import { useRouter } from 'next/navigation';
import { LifeJourneysScreen, type LifeJourneyRow } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife } from '../../../../../lib/yx-lifecycle';

// People › Life events (LIFE-6.03, design §7.5): running checklists for new managers, transfers, parental leave and
// return to work, in the viewer's scope. Each opens the usual checklist page.
export default function YxLifeEventsPage() {
  const router = useRouter();
  const list = useLife<{ rows: LifeJourneyRow[] }>('/lifecycle/life-journeys');
  return <LifeJourneysScreen state={loadState(list)} onRetry={() => void list.refetch()} rows={list.data?.rows ?? null} onOpen={(id) => router.push(`/yx/people/onboarding/${encodeURIComponent(id)}`)} />;
}
