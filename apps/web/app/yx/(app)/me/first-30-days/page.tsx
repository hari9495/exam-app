'use client';

import { FirstThirtyDaysScreen, type FirstThirtyDays } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useTaskActions } from '../../../../../lib/yx-lifecycle';

// Me › My first 30 days (LIFE-6.04, design §7.6): a new hire's own joining steps for today, this week and this month,
// with their manager and buddy. First in the menu while the joining checklist runs, so it is their home page.
export default function YxFirstThirtyDaysPage() {
  const card = useLife<{ card: FirstThirtyDays | null }>('/lifecycle/me/first-30-days');
  const actions = useTaskActions();
  return <FirstThirtyDaysScreen state={loadState(card)} onRetry={() => void card.refetch()} data={card.data?.card ?? null} {...actions} />;
}
