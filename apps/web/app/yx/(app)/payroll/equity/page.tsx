'use client';

import { useEffect, useState } from 'react';
import { EquityScreen, type EquityOverview, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload } from '../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Equity (PAY-9.09): plans, valuations, grants approved by a second person, vesting, exercises, the cap table.
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
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      nameOf={nameOf}
      onSearch={search}
      data={data.data ?? null}
      onPlan={(x) => write('/payroll/equity/plans', { legalEntityId: entityId, ...x })}
      onValuation={(x) => write('/payroll/equity/valuations', { legalEntityId: entityId, ...x })}
      onGrant={(x) => write('/payroll/equity/grants', x)}
      onConfirm={(id) => write(`/payroll/equity/vesting/${e(id)}/confirm`)}
      onPaid={(id, reference) => write(`/payroll/equity/exercises/${e(id)}/paid`, { reference })}
      onCapTable={(planId) => download(`/payroll/equity/plans/${e(planId)}/cap-table`, 'cap-table.csv')}
    />
  );
}
