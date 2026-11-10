'use client';

import { useState } from 'react';
import { NoAccessState } from '@yukthix/ui';
import { AttendanceMonthScreen, type AttendanceRow } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { useClra, useClraWrite } from '../../../../../lib/yx-contract-labour';

interface AttendanceData {
  month: string;
  canManage: boolean;
  canConfirm: boolean;
  rows: AttendanceRow[];
}
const months = () =>
  Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

// Contract labour › Attendance (CL-5, answer 625): contract workers' days on site per contractor and site, from the
// kiosk (gate pass and PIN) or the contractor's entry; the site in-charge confirms a past month, which locks it.
export default function YxContractAttendancePage() {
  const [month, setMonth] = useState<string | null>(null);
  const q = useClra<AttendanceData>(`/attendance${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  const write = useClraWrite();
  const state = loadState(q);
  if (state === 'no-access') return <NoAccessState what="contract workers' attendance" grantedBy="your HR team" />;
  return (
    <AttendanceMonthScreen
      month={q.data?.month ?? month ?? ''}
      months={months()}
      onMonth={setMonth}
      rows={q.data?.rows ?? []}
      canManage={Boolean(q.data?.canManage)}
      canConfirm={Boolean(q.data?.canConfirm)}
      state={state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error'}
      onRetry={() => void q.refetch()}
      onConfirm={(contractorId, locationId, m) => write('POST', '/attendance/confirm', { contractorId, locationId, month: m })}
    />
  );
}
