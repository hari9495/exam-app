'use client';

import { useEffect, useState } from 'react';
import { AdvisoriesScreen, type AdvisoryView, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Compliance advisories (PAY-10.14, CMP-12): law changes for the entity's states, each marked reviewed.
export default function YxPayAdvisoriesPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const advisories = useApi<AdvisoryView[]>(entityId ? `/statutory/advisories?entityId=${encodeURIComponent(entityId)}` : null);
  const write = useApiWrite();
  return (
    <AdvisoriesScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      advisories={advisories.data ?? null}
      onReview={(a, note) => write(`/statutory/advisories/${encodeURIComponent(a.code)}/review`, { entityId, note })}
    />
  );
}
