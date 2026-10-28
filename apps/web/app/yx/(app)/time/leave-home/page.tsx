'use client';

import { useRouter } from 'next/navigation';
import { LeaveHomeScreen, type HrLeaveHome, type LongAbsenceRow } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave (TIM-17 HR): requests waiting with managers, who is away, what needs HR, long absences. leave.view in
// scope; extending or ending a long absence needs leave.balance.adjust (checked by the API for each person).
export default function YxHrLeaveHomePage() {
  const router = useRouter();
  const home = useTime<HrLeaveHome>('/hr/leave-home');
  const absences = useTime<LongAbsenceRow[]>('/hr/long-absences');
  const write = useTimeWrite();
  return (
    <LeaveHomeScreen
      hrLive={{
        state: timeState(home),
        onRetry: () => void home.refetch(),
        data: home.data ?? null,
        onRemind: (rid) => write(`/hr/leave-home/remind/${id(rid)}`, 'POST', undefined, false, 'Approver reminded'),
        onNavigate: (href) => router.push(href),
        hrefs: { approvals: '/yx/approvals', calendar: '/yx/time/team', negative: '/yx/time/balances', yearEnd: '/yx/time/setup/year-end', request: () => '/yx/approvals' },
        absences: {
          data: absences.data ?? null,
          onChange: (aid, how, on, note, version) => write(`/hr/long-absences/${id(aid)}/${how === 'extend' ? 'extend' : 'early-return'}`, 'POST', { on, note, version }, true, how === 'extend' ? 'Absence extended' : 'Early return recorded'),
        },
      }}
    />
  );
}
