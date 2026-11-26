'use client';

import { useRouter } from 'next/navigation';
import { AdvanceScreen, EXP_LINKS, type AdvanceSummary } from '@yukthix/ui/expenses';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../../lib/yx-expenses';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Advances (EXP-05, the designed screen with `live`): mine, those waiting for me, and finance's list to pay and settle.
export default function YxAdvancesPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  // T2-B 67: `policy` says whether advances are on and the most one can be.
  const mine = useExp<{ advances: AdvanceSummary[]; policy?: { enabled: boolean; cap: string | null } | null }>('/advances');
  const approvals = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=approvals', sp.entity));
  const payout = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=payout', sp.entity), perms.has('expense.payout.manage'));
  const write = useExpWrite();
  return (
    <AdvanceScreen
      live={{
        view: 'list',
        state: loadState(mine, approvals),
        onRetry: () => void Promise.all([mine.refetch(), approvals.refetch()]),
        mine: mine.data?.advances ?? null,
        approvals: approvals.data?.advances ?? null,
        payout: perms.has('expense.payout.manage') ? (payout.data?.advances ?? []) : null,
        onRequest: async (purpose, amount) => {
          const a = await write<{ id: string }>('POST', '/advances', { purpose, amount });
          router.push(EXP_LINKS.advance(a.id));
        },
        onRequestTrip: () => router.push(`${EXP_LINKS.trips}?new=1`),
        onOpen: (id) => router.push(EXP_LINKS.advance(id)),
        policy: mine.data?.policy ?? null,
      }}
    />
  );
}
