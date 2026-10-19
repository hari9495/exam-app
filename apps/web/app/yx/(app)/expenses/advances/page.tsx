'use client';

import { useRouter } from 'next/navigation';
import { AdvancesScreen, type AdvanceSummary } from '@yukthix/ui/expenses';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../../lib/yx-expenses';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Advances (EXP-05, M05 batch E4): mine, those waiting for me, and finance's list to pay and settle.
export default function YxAdvancesPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  const mine = useExp<{ advances: AdvanceSummary[] }>('/advances');
  const approvals = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=approvals', sp.entity));
  const payout = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=payout', sp.entity), perms.has('expense.payout.manage'));
  const write = useExpWrite();
  return (
    <AdvancesScreen
      state={loadState(mine, approvals)}
      onRetry={() => void Promise.all([mine.refetch(), approvals.refetch()])}
      mine={mine.data?.advances ?? null}
      approvals={approvals.data?.advances ?? null}
      payout={perms.has('expense.payout.manage') ? (payout.data?.advances ?? []) : null}
      onRequest={async (purpose, amount) => {
        const a = await write<{ id: string }>('POST', '/advances', { purpose, amount });
        router.push(`/yx/expenses/advances/${encodeURIComponent(a.id)}`);
      }}
      onOpen={(id) => router.push(`/yx/expenses/advances/${encodeURIComponent(id)}`)}
    />
  );
}
