'use client';

import { useEffect, useState } from 'react';
import { EwaAdminScreen, type EwaDrawView, type EwaPolicyView, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Earned wage access (PAY-9.05, PAY-27): the policy, and paying the month's draws.
export default function YxPayEwaPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [month, setMonth] = useState(() => todayIndia().slice(0, 7));
  const e = encodeURIComponent;
  const policies = usePay<EwaPolicyView[]>(entityId ? `/ewa/policies?legalEntityId=${e(entityId)}` : null);
  const draws = usePay<EwaDrawView[]>(entityId ? `/ewa/draws?legalEntityId=${e(entityId)}&month=${month}` : null);
  const write = useApiWrite();
  const nameOf = useNames();
  return (
    <EwaAdminScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      month={month}
      onMonth={setMonth}
      nameOf={nameOf}
      policies={policies.data ?? null}
      draws={draws.data ?? null}
      onPolicy={(x) => write('/payroll/ewa/policies', { legalEntityId: entityId, ...x })}
      onPaid={(d, reference) => write(`/payroll/ewa/draws/${e(d.id)}/paid`, { reference })}
      onFailed={(d, reason) => write(`/payroll/ewa/draws/${e(d.id)}/failed`, { reason })}
    />
  );
}
