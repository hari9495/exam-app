'use client';

import { useParams, useRouter } from 'next/navigation';
import { ClaimScreen, type ClaimDetail, type ExpenseCategory } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../../lib/yx-org';
import { useExp, useExpWrite, useReceiptOpen } from '../../../../../../lib/yx-expenses';

// One expense claim (EXP-02 composer for the person claiming, EXP-03 review for the approver whose turn it is and for
// finance; M05 batch E2). The API decides what each viewer may do (claim.can).
export default function YxClaimPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/claims/${encodeURIComponent(id)}`;
  const claim = useExp<ClaimDetail>(base);
  const categories = useExp<ExpenseCategory[]>('/categories');
  const write = useExpWrite();
  const open = useReceiptOpen();
  return (
    <ClaimScreen
      state={loadState(claim, categories)}
      onRetry={() => void Promise.all([claim.refetch(), categories.refetch()])}
      claim={claim.data ?? null}
      categories={categories.data ?? []}
      today={todayIst()}
      onBack={() => router.push('/yx/expenses')}
      onUploadReceipt={(file, lineId) => {
        const form = new FormData();
        form.append('file', file);
        return write('POST', `${base}/receipts${lineId ? `?lineId=${encodeURIComponent(lineId)}` : ''}`, form);
      }}
      onSaveLine={(lineId, input) => (lineId ? write('PUT', `${base}/lines/${encodeURIComponent(lineId)}`, input) : write('POST', `${base}/lines`, input))}
      onRemoveLine={(lineId) => write('DELETE', `${base}/lines/${encodeURIComponent(lineId)}`)}
      onSubmit={() => write('POST', `${base}/submit`, { version: claim.data!.version })}
      onWithdraw={() => write('POST', `${base}/withdraw`)}
      onApproveAmount={(lineId, amount, reason) => write('PATCH', `${base}/lines/${encodeURIComponent(lineId)}/approve-amount`, { amount, ...(reason ? { reason } : {}) })}
      onDecide={(decision, reason) => write('POST', `${base}/decide`, { decision, ...(reason ? { reason } : {}) })}
      onFlag={(flagId, decision, note) => write('POST', `/flags/${encodeURIComponent(flagId)}`, { decision, note })}
      onOpenReceipt={(lineId) => open(`${base}/lines/${encodeURIComponent(lineId)}/receipt`)}
    />
  );
}
