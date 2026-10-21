'use client';

import { AttendanceReportsScreen, type Muster, type Registers } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeDownload } from '../../../../../lib/yx-time';
import { recentMonths, useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Attendance reports (TIM-16, the designed screen): late marks and overtime from the month's muster (attendance.view or
// the manager's team), and the statutory registers per establishment (P07 IN.REGISTERS; each download is audited).
export default function YxRegistersPage() {
  const { month, setMonth, entity } = useScopeParams();
  const muster = useTime<Muster>(withParams(`/muster?month=${month}`, entity));
  const regs = useTime<Registers>(`/registers?month=${month}`);
  const download = useTimeDownload();
  return (
    <AttendanceReportsScreen
      live={{
        // A manager has no registers (attendance.view): the late and overtime reports still show.
        state: timeState(muster),
        onRetry: () => void muster.refetch(),
        muster: muster.data ?? null,
        registers: regs.data ?? null,
        today: todayIndia(),
        month,
        months: recentMonths().map((m) => m.value),
        onMonth: setMonth,
        onDownload: (type, locationId, format) => download(`/registers/${type}/export?locationId=${encodeURIComponent(locationId)}&month=${month}&format=${format}`, `${type}-register-${month}.${format}`),
      }}
    />
  );
}
