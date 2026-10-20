'use client';

import { MusterScreen, type DayCard, type Muster } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Muster (TIM-02, the designed screen): a manager's team, HR's people in attendance.view scope (YX-AT-14). The month
// is the top-bar period; a cell opens the designed day card.
export default function YxMusterPage() {
  const { month, entity } = useScopeParams();
  const muster = useTime<Muster>(withParams(`/muster?month=${month}`, entity));
  const read = useTimeRead();
  return (
    <MusterScreen
      live={{
        state: timeState(muster),
        onRetry: () => void muster.refetch(),
        data: muster.data ?? null,
        today: todayIndia(),
        month,
        onOpenDay: (employeeId, on) => read<DayCard>(`/people/${encodeURIComponent(employeeId)}/days/${on}`),
      }}
    />
  );
}
