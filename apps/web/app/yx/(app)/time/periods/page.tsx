'use client';

import { useState } from 'react';
import { PeriodsScreen, type LateMarks, type Periods, type Preflight } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// HR › Attendance periods (P08, TIM-11): attendance.lock for the legal entity, or attendance.lock.approve in the
// two-step flow; lock, approve and unlock ask for a fresh second step.
export default function YxPeriodsPage() {
  const sp = useScopeParams();
  const [year, setYear] = useState(todayIndia().slice(0, 4));
  const periods = useTime<Periods>(withParams(`/periods?year=${year}`, sp.entity));
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <PeriodsScreen
      live={{
        state: timeState(periods),
        onRetry: () => void periods.refetch(),
        data: periods.data ?? null,
        year,
        onYear: setYear,
        onPreflight: (legalEntityId, month) => read<Preflight>(`/periods/preflight?legalEntityId=${encodeURIComponent(legalEntityId)}&month=${month}`),
        onLock: (legalEntityId, month) => write('/periods/lock', 'POST', { legalEntityId, month }, true, 'Month locked'),
        onUnlock: (legalEntityId, month, reason) => write('/periods/unlock', 'POST', { legalEntityId, month, reason }, true, 'Reopen request sent for approval'),
        // Founder decision 7a: HR opens a month it froze again (reason + the second sign-in step, like Lock).
        onUnfreeze: (legalEntityId, month, reason) => write('/periods/unfreeze', 'POST', { legalEntityId, month, reason }, true, 'Month opened again. Freeze it again before it is locked.'),
        // TIM-11 two-step flow (company setting): HR sends, payroll approves with the second sign-in step.
        onSend: (legalEntityId, month) => write('/periods/send', 'POST', { legalEntityId, month }, true, 'Sent for payroll approval'),
        onApproveLock: (legalEntityId, month) => write('/periods/approve-lock', 'POST', { legalEntityId, month }, true, 'Month locked'),
        // Batch C item 6: late marks and their penalty waivers (the drawer says "done" itself).
        onLateMarks: (legalEntityId, month) => read<LateMarks>(`/periods/late-marks?legalEntityId=${encodeURIComponent(legalEntityId)}&month=${month}`),
        onWaiveLate: (legalEntityId, month, items, reason) => write('/periods/late-marks/waive', 'POST', { legalEntityId, month, items, reason }),
        onUndoLate: (legalEntityId, month, waiverIds, reason) => write('/periods/late-marks/undo', 'POST', { legalEntityId, month, waiverIds, reason }),
      }}
    />
  );
}
