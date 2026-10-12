'use client';

import { useRouter } from 'next/navigation';
import { ExpensesHomeScreen, type ClaimSummary, type ExpenseHome } from '@yukthix/ui/expenses';
import { loadState } from '../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../lib/yx-expenses';

// Expenses home (EXP-01, M05 batch E2): my claims with what I will receive, claims waiting for me, and finance's check.
export default function YxExpensesPage() {
  const router = useRouter();
  const home = useExp<ExpenseHome>('/me/home');
  const approvals = useExp<{ claims: ClaimSummary[] }>('/claims?view=approvals', Boolean(home.data?.waitingForMe));
  const review = useExp<{ claims: ClaimSummary[] }>('/claims?view=review', home.data?.toReview !== null && home.data?.toReview !== undefined);
  const write = useExpWrite();
  return (
    <ExpensesHomeScreen
      state={loadState(home)}
      onRetry={() => void home.refetch()}
      home={home.data ?? null}
      approvals={approvals.data?.claims ?? null}
      review={review.data?.claims ?? null}
      onNew={async (title) => {
        const c = await write<{ id: string }>('POST', '/claims', { title });
        router.push(`/yx/expenses/claims/${encodeURIComponent(c.id)}`);
      }}
      onOpen={(id) => router.push(`/yx/expenses/claims/${encodeURIComponent(id)}`)}
    />
  );
}
