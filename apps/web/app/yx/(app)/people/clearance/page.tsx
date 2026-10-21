'use client';

import { useToast } from '@yukthix/ui';
import { ClearanceSignoffs } from '@yukthix/ui/frame';
import type { MyClearanceItem } from '@yukthix/ui/lifecycle';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { loadState } from '../../../../../lib/yx-org';

// People › Clearance (PPL-20, design audit step 3; design §10.6): sign-offs for leavers that I or my team own.
export default function YxClearancePage() {
  const { toast } = useToast();
  const data = useLife<{ today: string; rows: MyClearanceItem[] }>('/lifecycle/clearance/mine');
  const write = useLifeWrite();
  return (
    <ClearanceSignoffs
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        rows: data.data?.rows ?? [],
        onSignOff: async (item, x) => {
          await write('POST', `/lifecycle/clearance/${encodeURIComponent(item.id)}/sign-off`, { action: x.action, version: item.version, ...(x.note ? { note: x.note } : {}), ...(x.recoveryAmount ? { recoveryAmount: x.recoveryAmount, recoveryReason: x.recoveryReason } : {}) });
          const person = 'person' in item ? ` for ${(item as MyClearanceItem).person}` : '';
          toast({ tone: 'success', title: `${item.title} ${x.action === 'clear' ? 'signed off' : 'waived'}${person}` });
        },
      }}
    />
  );
}
