'use client';

import { useEffect, useState } from 'react';
import { EquityScreen, type EquityOverview, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload } from '../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Equity (PAY-9.09): the designed PAY-57 screen with plans, valuations, grants approved by a second person,
// vesting, exercises and the cap table. Every read and action needs payroll.equity.manage: a refusal shows no access.
export default function YxPayEquityPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const e = encodeURIComponent;
  const data = usePay<EquityOverview>(entityId ? `/equity?legalEntityId=${e(entityId)}` : null);
  const write = useApiWrite();
  const download = usePayDownload();
  const nameOf = useNames();
  const search = usePeopleSearch();
  return (
    <EquityScreen
      live={{
        state: entityId ? payState(entities, data) : payState(entities),
        onRetry: () => void Promise.all([entities.refetch(), entityId ? data.refetch() : undefined]),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        nameOf,
        onSearch: search,
        data: data.data ?? null,
        onPlan: (x) => write('/payroll/equity/plans', { legalEntityId: entityId, ...x }),
        onValuation: (x) => write('/payroll/equity/valuations', { legalEntityId: entityId, ...x }),
        onGrant: (x) => write('/payroll/equity/grants', x),
        onConfirm: (id) => write(`/payroll/equity/vesting/${e(id)}/confirm`),
        onPaid: (id, reference) => write(`/payroll/equity/exercises/${e(id)}/paid`, { reference }),
        onCapTable: (planId) => download(`/payroll/equity/plans/${e(planId)}/cap-table`, 'cap-table.csv'),
      }}
    />
  );
}
