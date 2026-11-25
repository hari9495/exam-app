'use client';

import { ConnectivityPanelScreen, type ConnectivityView } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../lib/yx-assessments';

// Assessments AS-4b › Connectivity (PRC-10, answer 2011): time lost to the connection above the company cap
// (asmt.time_credit_cap) waits here; a test writer or proctor approves it for a running test, or declines, with a reason.
export default function YxConnectivityPage() {
  const rows = useApi<ConnectivityView[]>('/asmt/connectivity?status=pending');
  const write = useApiWrite();
  return (
    <ConnectivityPanelScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        onApprove: async (id, reason) => void (await write('POST', `/asmt/connectivity/${id}/approve`, { reason })),
        onDecline: async (id, reason) => void (await write('POST', `/asmt/connectivity/${id}/decline`, { reason })),
      }}
    />
  );
}
