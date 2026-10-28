'use client';

import { MusterScreen, type DayCard, type Muster } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Attendance muster (TIM-02): the designed muster on a manager's team, or HR's people in attendance.view scope
// (YX-AT-14). Each cell opens the person's day card (TIM-03: HR resolves a past day, managers decide pending overtime).
// The month's stage for its legal entity: freeze inputs and lock (attendance.lock), or in the two-step flow send it
// (HR) and approve the lock (payroll.correction.approve); the lock asks for the second sign-in step. HR (leave.approve)
// marks ticked people present with a reason. Every action is checked again on the server.
export default function YxMusterPage() {
  const { month, setMonth, entity } = useScopeParams();
  const muster = useTime<Muster>(withParams(`/muster?month=${month}`, entity));
  const read = useTimeRead();
  const write = useTimeWrite();
  const period = (legalEntityId: string, m: string) => ({ legalEntityId, month: m });
  return (
    <MusterScreen
      live={{
        state: timeState(muster),
        onRetry: () => void muster.refetch(),
        data: muster.data ?? null,
        month,
        onMonth: setMonth,
        onOpenDay: (employeeId, on) => read<DayCard>(`/people/${encodeURIComponent(employeeId)}/days/${on}`),
        today: todayIndia(),
        onFreeze: (e, m) => write('/periods/freeze', 'POST', period(e, m), true, 'Inputs frozen'),
        onLock: (e, m) => write('/periods/lock', 'POST', period(e, m), true, 'Month locked'),
        onSend: (e, m) => write('/periods/send', 'POST', period(e, m), true, 'Sent for payroll approval'),
        onApproveLock: (e, m) => write('/periods/approve-lock', 'POST', period(e, m), true, 'Month locked'),
        onMarkPresent: (employeeIds, on, reason) => write('/muster/mark-present', 'POST', { employeeIds, on, reason }, true, 'Marked present'),
        onResolve: (input) => write('/exceptions/resolve', 'POST', input, true, 'Exception resolved'),
        onDecideOt: (id, decision, reason) => write(`/overtime/${encodeURIComponent(id)}/decide`, 'POST', { decision, ...(reason ? { reason } : {}) }, true, decision === 'reject' ? 'Overtime rejected' : decision === 'comp_off' ? 'Comp-off given' : 'Overtime approved'),
        exceptionsHref: '/yx/time/exceptions',
      }}
    />
  );
}
