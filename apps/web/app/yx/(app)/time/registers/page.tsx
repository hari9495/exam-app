'use client';

import { useState } from 'react';
import { RegistersScreen, type Registers } from '@yukthix/ui/time';
import { lastMonth, timeState, useTime, useTimeDownload } from '../../../../../lib/yx-time';

// HR › Registers (P07 IN.REGISTERS): attendance.view over the establishment's people; each download is audited.
export default function YxRegistersPage() {
  const [month, setMonth] = useState(lastMonth());
  const regs = useTime<Registers>(`/registers?month=${month}`);
  const download = useTimeDownload();
  return (
    <RegistersScreen
      state={timeState(regs)}
      onRetry={() => void regs.refetch()}
      data={regs.data ?? null}
      month={month}
      onMonth={setMonth}
      onDownload={(type, locationId, format) => download(`/registers/${type}/export?locationId=${encodeURIComponent(locationId)}&month=${month}&format=${format}`, `${type}-register-${month}.${format}`)}
    />
  );
}
