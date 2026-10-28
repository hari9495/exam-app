'use client';

import { OpenShiftsScreen, type OpenShiftsData } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster › Open shifts (TIM-35): the designed OpenShiftsScreen. The API decides the reach (a manager's own team, or
// roster.manage in scope) and checks every bid again when a shift is awarded.
export default function YxOpenShiftsPage() {
  const q = useTime<OpenShiftsData>('/open-shifts?show=all');
  const write = useTimeWrite();
  return (
    <OpenShiftsScreen
      live={{
        state: timeState(q),
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        onOffer: (input) => write('/open-shifts', 'POST', input),
        onAward: (id, employeeId, version) => write(`/open-shifts/${id}/award`, 'POST', { employeeId, version }),
        onCancel: (id, version, reason) => write(`/open-shifts/${id}/cancel`, 'POST', { version, ...(reason ? { reason } : {}) }),
      }}
    />
  );
}
