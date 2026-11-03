'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClaimComposerScreen, ClaimReviewScreen, EXP_LINKS, type AddKind, type ClaimDetail, type ExpenseCategory, type LiveClaim } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../../lib/yx-org';
import { useExp, useExpWrite, useReceiptOpen } from '../../../../../../lib/yx-expenses';

const ADD: AddKind[] = ['receipt', 'mileage', 'perdiem', 'bill'];

// One expense claim: the designed EXP-02 composer for the person claiming, the designed EXP-03 review for the approver
// whose turn it is, finance and anyone allowed to see it. The API decides what each viewer may do (claim.can).
function Claim() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const add = useSearchParams()?.get('add');
  const base = `/claims/${encodeURIComponent(id)}`;
  const claim = useExp<ClaimDetail>(base);
  const categories = useExp<ExpenseCategory[]>('/categories');
  const write = useExpWrite();
  const open = useReceiptOpen();
  const file = (f: File) => {
    const form = new FormData();
    form.append('file', f);
    return form;
  };
  const live: LiveClaim = {
    state: loadState(claim, categories),
    onRetry: () => void Promise.all([claim.refetch(), categories.refetch()]),
    claim: claim.data ?? null,
    categories: categories.data ?? [],
    today: todayIst(),
    startAdd: ADD.find((k) => k === add) ?? null,
    onBack: () => router.push(EXP_LINKS.home),
    onOpenTrip: (tripId) => router.push(EXP_LINKS.trip(tripId)),
    onUploadReceipt: (f, lineId) => write('POST', `${base}/receipts${lineId ? `?lineId=${encodeURIComponent(lineId)}` : ''}`, file(f)),
    onSaveLine: (lineId, input) => (lineId ? write('PUT', `${base}/lines/${encodeURIComponent(lineId)}`, input) : write('POST', `${base}/lines`, input)),
    onRemoveLine: (lineId) => write('DELETE', `${base}/lines/${encodeURIComponent(lineId)}`),
    onSubmit: () => write('POST', `${base}/submit`, { version: claim.data!.version }),
    onWithdraw: () => write('POST', `${base}/withdraw`),
    onOpenReceipt: (lineId) => open(`${base}/lines/${encodeURIComponent(lineId)}/receipt`),
    onUploadFxProof: (lineId, f) => write('POST', `${base}/lines/${encodeURIComponent(lineId)}/fx-proof`, file(f)),
    onOpenFxProof: (lineId) => open(`${base}/lines/${encodeURIComponent(lineId)}/fx-proof`),
    onApproveAmount: (lineId, amount, reason) => write('PATCH', `${base}/lines/${encodeURIComponent(lineId)}/approve-amount`, { amount, ...(reason ? { reason } : {}) }),
    onDecide: (decision, reason) => write('POST', `${base}/decide`, { decision, ...(reason ? { reason } : {}) }),
    onFlag: (flagId, decision, note) => write('POST', `/flags/${encodeURIComponent(flagId)}`, { decision, note }),
  };
  return claim.data && !claim.data.can.own ? <ClaimReviewScreen live={live} /> : <ClaimComposerScreen live={live} />;
}

export default function YxClaimPage() {
  return (
    <Suspense>
      <Claim />
    </Suspense>
  );
}
