'use client';

import { useRouter } from 'next/navigation';
import { OffCycleRunScreen, type PayGroupRef, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../../lib/yx-pay';
import { useScopeParams } from '../../../../../../lib/yx-shell';

// Payroll › Payroll home › Start off-cycle run (PAY-11 "Choose run type"): bonus, arrears only, correction or payment
// for a pay group and month; the run then opens on its own page. A full and final run starts from the settlement.
export default function YxPayOffCycleNewPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  const groups = usePay<PayGroupRef[]>('/pay-groups');
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const write = usePayWrite();
  const named = (groups.data ?? []).map((g) => ({ ...g, name: `${g.name} · ${entities.data?.find((e) => e.id === g.legalEntityId)?.shortName ?? ''}` }));
  return (
    <OffCycleRunScreen
      live={{
        mode: 'new',
        state: perms.data && !perms.has('payroll.offcycle.prepare') ? 'no-access' : payState(groups),
        onRetry: () => void groups.refetch(),
        groups: named,
        month: sp.month,
        fnfHref: '/yx/payroll/fnf',
        onCreate: (payGroupId, month, offcycleKind) => write<{ id: string }>('/runs', { payGroupId, month, offcycleKind }),
        onOpen: (id) => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`),
        onCancel: () => router.push('/yx/payroll/runs'),
      }}
    />
  );
}
