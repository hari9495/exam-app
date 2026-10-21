'use client';

import { useState } from 'react';
import { PayrollFeedScreen, type PayrollFeed, type Registers } from '@yukthix/ui/time';
import { timeState, useTime } from '../../../../../lib/yx-time';
import { recentMonths, useScopeParams } from '../../../../../lib/yx-shell';

// Payroll feed (§B6, designed in the library as "Extra · Payroll feed"), read only: attendance.view over the people;
// frozen at the period lock. The month is the top-bar period; the entity is the top-bar company or the first in scope.
export default function YxPayrollFeedPage() {
  const { month, setMonth } = useScopeParams();
  const [picked, setPicked] = useState<string | null>(null);
  // The legal entities with people in the viewer's scope that month (from the establishments list).
  const regs = useTime<Registers>(`/registers?month=${month}`);
  const entities = [...new Map((regs.data?.locations ?? []).map((l) => [l.entityId, { id: l.entityId, name: l.entity }])).values()];
  const entityId = (picked && entities.some((e) => e.id === picked) ? picked : null) ?? entities[0]?.id ?? null;
  const feed = useTime<PayrollFeed>(entityId ? `/payroll-feed?legalEntityId=${encodeURIComponent(entityId)}&month=${month}` : null);
  return (
    <PayrollFeedScreen
      live={{
        state: regs.data && !entities.length ? 'ready' : timeState(regs, feed),
        onRetry: () => void (feed.isError ? feed.refetch() : regs.refetch()),
        data: feed.data ?? null,
        entities,
        entityId,
        onEntity: setPicked,
        month,
        months: recentMonths().map((m) => m.value),
        onMonth: setMonth,
      }}
    />
  );
}
