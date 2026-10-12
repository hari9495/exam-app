'use client';

import { useRouter } from 'next/navigation';
import { FnfScreen, type FnfSettlementView } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';

// Payroll › Full and final (PAY-10.04, PPL-22): settlements, held lines, the notice waiver and the second run.
export default function YxPayFnfPage() {
  const router = useRouter();
  const list = usePay<FnfSettlementView[]>('/fnf');
  const write = usePayWrite();
  const nameOf = useNames();
  const patch = (s: FnfSettlementView, body: object) => write(`/fnf/${encodeURIComponent(s.id)}`, { version: s.version, ...body }, 'PATCH');
  return (
    <FnfScreen
      state={payState(list)}
      onRetry={() => void list.refetch()}
      settlements={list.data ?? null}
      nameOf={nameOf}
      onOpenRun={(id) => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`)}
      onHold={(s, itemId, holdReason, reason) => patch(s, { reason: reason.length >= 5 ? reason : `${reason} (F&F)`, items: [{ id: itemId, holdReason }] })}
      onAdd={(s, line, reason) => patch(s, { reason, add: [line] })}
      onWaiveNotice={(s, reason) => write(`/fnf/${encodeURIComponent(s.id)}/waive-notice`, { reason })}
      onSecondRun={(s) => write<{ runId: string }>(`/fnf/${encodeURIComponent(s.id)}/second-run`)}
    />
  );
}
