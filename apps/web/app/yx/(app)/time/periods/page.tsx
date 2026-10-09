'use client';

import { useState } from 'react';
import { PeriodsScreen, type Periods, type Preflight } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

// HR › Attendance periods (P08): attendance.lock for the legal entity; lock and unlock ask for a fresh second step.
export default function YxPeriodsPage() {
  const [year, setYear] = useState(todayIndia().slice(0, 4));
  const periods = useTime<Periods>(`/periods?year=${year}`);
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <PeriodsScreen
      state={timeState(periods)}
      onRetry={() => void periods.refetch()}
      data={periods.data ?? null}
      year={year}
      onYear={setYear}
      onPreflight={(legalEntityId, month) => read<Preflight>(`/periods/preflight?legalEntityId=${encodeURIComponent(legalEntityId)}&month=${month}`)}
      onLock={(legalEntityId, month) => write('/periods/lock', 'POST', { legalEntityId, month })}
      onUnlock={(legalEntityId, month, reason) => write('/periods/unlock', 'POST', { legalEntityId, month, reason })}
    />
  );
}
