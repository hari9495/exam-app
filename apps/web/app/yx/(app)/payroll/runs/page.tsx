'use client';

import { useRouter } from 'next/navigation';
import { PayRunsScreen, type PayGroupRef, type PayRun } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Runs (PAY-10.01, PAY-01): each month's payroll and the off-cycle runs.
export default function YxPayRunsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const runs = usePay<PayRun[]>('/runs');
  const groups = usePay<PayGroupRef[]>('/pay-groups');
  const write = usePayWrite();
  return (
    <PayRunsScreen
      state={payState(runs, groups)}
      onRetry={() => void runs.refetch()}
      runs={runs.data ?? null}
      groups={groups.data ?? []}
      thisMonth={todayIndia().slice(0, 7)}
      canPrepare={perms.has('payroll.run.prepare')}
      canOffcycle={perms.has('payroll.offcycle.prepare')}
      onCreate={(payGroupId, month, offcycleKind) => write<{ id: string }>('/runs', { payGroupId, month, ...(offcycleKind ? { offcycleKind } : {}) })}
      onOpen={(id) => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`)}
    />
  );
}
