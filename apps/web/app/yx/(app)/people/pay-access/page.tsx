'use client';

import { PayAccessRequests, type PayAccessDecision, type PayAccessRow } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

// People › Team pay access (PPL-50, founder decisions 28 Oct 2026): managers' requests to see their team's pay. Two
// different HR people approve each (the API refuses the manager, and the same HR person twice); each approval asks for a
// fresh second factor (the client prompts when the API needs it).
export default function YxPayAccessPage() {
  const list = usePeople<{ rows: PayAccessRow[] }>('/pay-access');
  const write = usePeopleWrite();
  return (
    <PayAccessRequests
      rows={list.data?.rows ?? []}
      state={loadState(list)}
      onRetry={() => void list.refetch()}
      onDecide={async (id: string, d: PayAccessDecision) => void (await write('POST', `/pay-access/${encodeURIComponent(id)}/decision`, d))}
    />
  );
}
