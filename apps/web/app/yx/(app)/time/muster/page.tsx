'use client';

import { MusterScreen, type DayCard, type Muster } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Attendance muster (TIM-02, read-only in batch 1): a manager's team, HR's people in attendance.view scope (YX-AT-14).
export default function YxMusterPage() {
  const { month, setMonth, entity } = useScopeParams();
  const muster = useTime<Muster>(withParams(`/muster?month=${month}`, entity));
  const read = useTimeRead();
  return <MusterScreen state={timeState(muster)} onRetry={() => void muster.refetch()} data={muster.data ?? null} month={month} onMonth={setMonth} onOpenDay={(employeeId, on) => read<DayCard>(`/people/${encodeURIComponent(employeeId)}/days/${on}`)} />;
}
