'use client';

import { useState } from 'react';
import { PayslipQueriesScreen, type PayslipQueryView } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';

// Payroll › Payslip queries (PAY-10.11, PAY-20): employees' questions about a payslip, answered by payroll.
export default function YxPayslipQueriesPage() {
  const [status, setStatus] = useState<'open' | 'answered' | 'closed'>('open');
  const queries = usePay<PayslipQueryView[]>(`/queries?status=${status}`);
  const write = usePayWrite();
  const nameOf = useNames();
  const patch = (q: PayslipQueryView, body: object) => write(`/queries/${encodeURIComponent(q.id)}`, body, 'PATCH');
  return (
    <PayslipQueriesScreen
      state={payState(queries)}
      onRetry={() => void queries.refetch()}
      queries={queries.data ?? null}
      nameOf={nameOf}
      status={status}
      onStatus={setStatus}
      onReply={(q, reply) => patch(q, { reply })}
      onClose={(q) => patch(q, { status: 'closed' })}
    />
  );
}
