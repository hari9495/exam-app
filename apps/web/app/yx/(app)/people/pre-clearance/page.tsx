'use client';

import { useToast } from '@yukthix/ui';
import { PreclearanceQueue, type PreclearanceRules } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { preclearanceItem, type PreclearanceRow } from '../../../../../lib/yx-preclearance';

// People › More › Pre-clearance requests (PPL-44): the compliance officer approves or rejects designated persons'
// trades (never their own).
export default function YxPreclearanceQueuePage() {
  const { toast } = useToast();
  const queue = usePeople<{ rules: PreclearanceRules; rows: PreclearanceRow[] }>('/pre-clearance');
  const write = usePeopleWrite();
  return (
    <PreclearanceQueue
      live={{
        state: queue.isError ? 'error' : queue.data ? 'ready' : 'loading',
        onRetry: () => void queue.refetch(),
        rules: queue.data?.rules ?? { threshold: 0, validDays: 0, decideDays: 0 },
        rows: (queue.data?.rows ?? []).map(preclearanceItem),
        onDecide: async (id, approve, note) => {
          await write('POST', `/pre-clearance/${encodeURIComponent(id)}/decision`, { decision: approve ? 'approve' : 'reject', ...(note ? { note } : {}) });
          toast({ tone: 'success', title: approve ? 'Pre-clearance approved' : 'Pre-clearance rejected' });
        },
      }}
    />
  );
}
