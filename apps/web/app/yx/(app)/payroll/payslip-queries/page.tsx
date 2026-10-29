'use client';

import { useState } from 'react';
import { QueryQueueScreen, type PayslipQueryView, type QueryHandler } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { payState, usePay, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Payslip queries: the designed PAY-20 queue. Employees' questions about a payslip, answered by payroll
// (never one's own: the API refuses it too).
export default function YxPayslipQueriesPage() {
  const [status, setStatus] = useState<'open' | 'answered' | 'closed'>('open');
  const me = useCurrentUser();
  const queries = usePay<PayslipQueryView[]>(`/queries?status=${status}`);
  const write = usePayWrite();
  const read = usePayRead();
  const nameOf = useNames();
  const patch = (q: PayslipQueryView, body: object) => write(`/queries/${encodeURIComponent(q.id)}`, body, 'PATCH');
  return (
    <QueryQueueScreen
      live={{
        state: payState(queries),
        onRetry: () => void queries.refetch(),
        queries: queries.data ?? null,
        nameOf,
        me: { id: me.data?.id ?? '', name: me.data?.name || me.data?.email || 'You' },
        today: todayIndia(),
        status,
        onStatus: setStatus,
        onReply: (q, reply) => patch(q, { reply }),
        onClose: (q) => patch(q, { status: 'closed' }),
        onAssign: (q, userId) => patch(q, { assigneeUserId: userId }),
        onHandlers: (q) => read<QueryHandler[]>(`/queries/${encodeURIComponent(q.id)}/handlers`),
      }}
    />
  );
}
