'use client';

import { useRouter } from 'next/navigation';
import { PayRunsScreen, type PayGroupRef, type PayRun, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Runs (PAY-10.01, PAY-01): each month's payroll and the off-cycle runs.
export default function YxPayRunsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const runs = usePay<PayRun[]>('/runs');
  const groups = usePay<PayGroupRef[]>('/pay-groups');
  const entities = usePay<SetupEntity[]>('/setup/entities');
  // Groups are named with their legal entity: two entities may each have a "Monthly staff".
  const named = (groups.data ?? []).map((g) => ({ ...g, name: `${g.name} · ${entities.data?.find((e) => e.id === g.legalEntityId)?.shortName ?? ''}` }));
  const write = usePayWrite();
  return (
    <PayRunsScreen
      state={payState(runs, groups)}
      onRetry={() => void runs.refetch()}
      runs={runs.data ?? null}
      groups={named}
      thisMonth={todayIndia().slice(0, 7)}
      canPrepare={perms.has('payroll.run.prepare')}
      canOffcycle={perms.has('payroll.offcycle.prepare')}
      onCreate={(payGroupId, month, offcycleKind) => write<{ id: string }>('/runs', { payGroupId, month, ...(offcycleKind ? { offcycleKind } : {}) })}
      onOpen={(id) => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`)}
    />
  );
}
