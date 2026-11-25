'use client';

import { useEffect, useState } from 'react';
import { EwaAdminScreen, type EwaDrawView, type EwaPolicyView, type EwaRecon, type EwaRecoveryMonth, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

const denied = (q: { isError: boolean; error: unknown }) => q.isError && (q.error as { status?: number })?.status === 403;

// Payroll › Earned wage access (PAY-27): the policy, paying the month's draws, their recoveries and the reconciliation.
// The finance approver (payroll.run.approve, no payroll.ewa.manage) gets the reconciliation only.
export default function YxPayEwaPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => todayIndia().slice(0, 7));
  const e = encodeURIComponent;
  const recon = usePay<EwaRecon>(`/ewa/reconciliation?month=${month}${entityId ? `&legalEntityId=${e(entityId)}` : ''}`);
  // Without the set-up keys the entities come from the reconciliation (the entities the person reaches there).
  const list: SetupEntity[] = denied(entities) ? (recon.data?.entities ?? []).map((x) => ({ ...x, shortName: x.name, keys: [] })) : (entities.data ?? []);
  useEffect(() => {
    if (!entityId && list.length) setEntityId(list[0].id);
  }, [list, entityId]);
  const policies = usePay<EwaPolicyView[]>(entityId ? `/ewa/policies?legalEntityId=${e(entityId)}` : null);
  const draws = usePay<EwaDrawView[]>(entityId ? `/ewa/draws?legalEntityId=${e(entityId)}&month=${month}` : null);
  const recoveries = usePay<EwaRecoveryMonth[]>(entityId ? `/ewa/recoveries?legalEntityId=${e(entityId)}&month=${month}` : null);
  const manage = !denied(policies) && !denied(draws);
  const write = useApiWrite();
  const nameOf = useNames();
  return (
    <EwaAdminScreen
      live={{
        // Policies and draws need payroll.ewa.manage; without it only the reconciliation is shown (refused there too: "no access").
        state: denied(entities) ? payState(recon) : !manage ? payState(entities, recon) : entityId ? payState(entities, policies, draws) : payState(entities),
        onRetry: () => void Promise.all([entities.refetch(), recon.refetch()]),
        entities: list,
        entityId,
        onEntity: setEntityId,
        month,
        onMonth: setMonth,
        nameOf,
        policies: policies.data ?? null,
        draws: draws.data ?? null,
        onPolicy: (x) => write('/payroll/ewa/policies', { legalEntityId: entityId, ...x }),
        onPaid: (d, reference) => write(`/payroll/ewa/draws/${e(d.id)}/paid`, { reference }),
        onFailed: (d, reason) => write(`/payroll/ewa/draws/${e(d.id)}/failed`, { reason }),
        recoveries: recoveries.data ?? null,
        recon: recon.data ?? null,
        canManage: manage,
      }}
    />
  );
}
