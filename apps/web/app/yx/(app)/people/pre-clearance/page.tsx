'use client';

import { useToast } from '@yukthix/ui';
import { PreclearanceQueue, type PreclearanceRules } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { preclearanceItem, tradingWindow, type PreclearanceRow, type TradingWindowRow } from '../../../../../lib/yx-preclearance';

// People › More › Pre-clearance requests (PPL-44): the compliance officer approves or rejects designated persons'
// trades (never their own).
export default function YxPreclearanceQueuePage() {
  const { toast } = useToast();
  const queue = usePeople<{ rules: PreclearanceRules; rows: PreclearanceRow[] }>('/pre-clearance');
  const write = usePeopleWrite();
  // PPL-44: the trading window calendar (closed periods), set for the whole company by the compliance officer.
  const perms = useYxPermissions();
  const windows = usePeople<{ rows: TradingWindowRow[] }>(perms.has('compliance.declaration.manage') ? '/trading-windows' : null);
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
        ...(windows.data
          ? {
              windows: {
                rows: windows.data.rows.map(tradingWindow),
                onClose: async (input) => {
                  await write('POST', '/trading-windows', input);
                  toast({ tone: 'success', title: 'Trading window closed for those days' });
                },
                onRemove: async (id) => {
                  await write('POST', `/trading-windows/${encodeURIComponent(id)}/remove`);
                  toast({ tone: 'success', title: 'Closed period removed' });
                },
              },
            }
          : {}),
      }}
    />
  );
}
