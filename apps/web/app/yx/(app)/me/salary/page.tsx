'use client';

import { MySalaryScreen, type CompensationHistoryItem } from '@yukthix/ui/pay';
import { payState, usePay, usePayRead } from '../../../../../lib/yx-pay';
import { usePeople } from '../../../../../lib/yx-people';

// T2-B 63 (Keka B3): Me › My pay › My salary: the person's own salary now and before (PAY-12 history, self), each with
// its split by component (the salary in force on its first day). Approved salaries only (answer 2860).
export default function YxMySalaryPage() {
  const me = usePeople<{ employeeId: string }>('/me');
  const id = me.data?.employeeId;
  const history = usePay<CompensationHistoryItem[]>(id ? `/employees/${encodeURIComponent(id)}/compensation-history` : null);
  const read = usePayRead();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return (
    <MySalaryScreen
      live={{
        // Someone with no employee record has no salary to show.
        state: me.data && !id ? 'ready' : payState(me, history),
        onRetry: () => void Promise.all([me.refetch(), history.refetch()]),
        today,
        history: history.data ?? null,
        onBreakdown: (validFrom) => read(`/employees/${encodeURIComponent(id!)}/compensation?asOn=${encodeURIComponent(validFrom)}`),
      }}
    />
  );
}
