'use client';

import { useState } from 'react';
import { AttendanceReportsScreen, type PayrollFeed, type Registers } from '@yukthix/ui/time';
import { lastMonth, timeState, useTime } from '../../../../../lib/yx-time';

// HR › Payroll feed (§B6, TIM-16), read only: attendance.view over the people; frozen at the period lock.
export default function YxPayrollFeedPage() {
  const [month, setMonth] = useState(lastMonth());
  const [picked, setPicked] = useState<string | null>(null);
  // The legal entities with people in the viewer's scope that month (from the establishments list).
  const regs = useTime<Registers>(`/registers?month=${month}`);
  const entities = [...new Map((regs.data?.locations ?? []).map((l) => [l.entityId, { id: l.entityId, name: l.entity }])).values()];
  const entityId = picked ?? entities[0]?.id ?? null;
  const feed = useTime<PayrollFeed>(entityId ? `/payroll-feed?legalEntityId=${encodeURIComponent(entityId)}&month=${month}` : null);
  return (
    <AttendanceReportsScreen
      live={{
        report: 'feed',
        state: entityId ? timeState(regs, feed) : timeState(regs),
        onRetry: () => void (entityId ? feed.refetch() : regs.refetch()),
        data: feed.data ?? null,
        entities,
        entityId,
        onEntity: setPicked,
        month,
        onMonth: setMonth,
      }}
    />
  );
}
