'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MissingIdsScreen, type MissingIds, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApi } from '../../../../../lib/yx-pay-5j';

// Compliance › Missing IDs (CMP-07, founder answer 22): the designed screen with real data. Who in the entity lacks a PAN,
// UAN, ESI IP number or a usable salary account, in scope only; Fix opens the person's record, where HR adds it.
export default function YxPayMissingIdsPage() {
  const router = useRouter();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const data = useApi<MissingIds>(entityId ? `/statutory/missing-ids?entityId=${encodeURIComponent(entityId)}` : null);
  return (
    <MissingIdsScreen
      rows={[]}
      live={{
        state: payState(entities, ...(entityId ? [data] : [])),
        onRetry: () => void Promise.all([entities.refetch(), data.refetch()]),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        data: data.data ?? null,
        onOpenPerson: (employeeId) => router.push(`/yx/people/directory/${encodeURIComponent(employeeId)}`),
        onOpenChecks: () => router.push('/yx/payroll/runs'),
      }}
    />
  );
}
