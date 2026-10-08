'use client';

import { useState } from 'react';
import { MusterScreen, type DayCard, type Muster } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead } from '../../../../../lib/yx-time';

// Attendance muster (TIM-02, read-only in batch 1): a manager's team, HR's people in attendance.view scope (YX-AT-14).
export default function YxMusterPage() {
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const muster = useTime<Muster>(`/muster?month=${month}`);
  const read = useTimeRead();
  return <MusterScreen state={timeState(muster)} onRetry={() => void muster.refetch()} data={muster.data ?? null} month={month} onMonth={setMonth} onOpenDay={(employeeId, on) => read<DayCard>(`/people/${encodeURIComponent(employeeId)}/days/${on}`)} />;
}
