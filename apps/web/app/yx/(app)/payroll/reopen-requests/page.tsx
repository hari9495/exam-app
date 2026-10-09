'use client';

import { ReopenRequestsScreen, type ReopenRequest } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Payroll › Reopen requests (YX-LOCK-05): two approvals by people other than the one who asked, each with a fresh
// second step and the typed phrase (stored with the audit event).
export default function YxReopenRequestsPage() {
  const me = useCurrentUser();
  const list = usePay<ReopenRequest[]>('/reopen-requests');
  const write = usePayWrite();
  return (
    <ReopenRequestsScreen
      state={payState(list)}
      onRetry={() => void list.refetch()}
      data={list.data ?? null}
      me={me.data?.name || me.data?.email || 'You'}
      onDecide={(id, decision, reason, confirmation) => write(`/reopen-requests/${encodeURIComponent(id)}/decide`, { decision, ...(reason ? { reason } : {}), ...(confirmation ? { confirmation } : {}) })}
    />
  );
}
