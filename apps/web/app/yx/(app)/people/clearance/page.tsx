'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ClearanceSignoffs } from '@yukthix/ui/frame';
import type { MyClearanceItem } from '@yukthix/ui/lifecycle';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';

// People › Clearance (PPL-20, design audit step 3; design §10.6): sign-offs for leavers that I or my team own; HR with
// lifecycle.exit.manage also sees every department, leaver by leaver (GET lifecycle/clearance, scoped by the server).
export default function YxClearancePage() {
  const { toast } = useToast();
  const router = useRouter();
  const perms = useYxPermissions();
  const hr = perms.has('lifecycle.exit.manage');
  const data = useLife<{ today: string; rows: MyClearanceItem[] }>('/lifecycle/clearance/mine');
  const byLeaver = useLife<{ today: string; rows: MyClearanceItem[] }>(hr ? '/lifecycle/clearance' : null);
  const write = useLifeWrite();
  return (
    <ClearanceSignoffs
      key={hr ? 'hr' : 'owner'}
      live={{
        state: hr ? loadState(data, byLeaver) : loadState(data),
        onRetry: () => void Promise.all([data.refetch(), hr ? byLeaver.refetch() : null]),
        rows: data.data?.rows ?? [],
        ...(hr ? { hrRows: byLeaver.data?.rows ?? [], onOpenExit: (exitCaseId: string) => router.push(`/yx/people/exits/${encodeURIComponent(exitCaseId)}`) } : {}),
        onSignOff: async (item, x) => {
          await write('POST', `/lifecycle/clearance/${encodeURIComponent(item.id)}/sign-off`, { action: x.action, version: item.version, ...(x.note ? { note: x.note } : {}), ...(x.recoveryAmount ? { recoveryAmount: x.recoveryAmount, recoveryReason: x.recoveryReason } : {}) });
          const person = 'person' in item ? ` for ${(item as MyClearanceItem).person}` : '';
          toast({ tone: 'success', title: `${item.title} ${x.action === 'clear' ? 'signed off' : 'waived'}${person}` });
        },
      }}
    />
  );
}
