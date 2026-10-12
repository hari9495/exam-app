'use client';

import { useEffect, useState } from 'react';
import { GoLiveScreen, type GoLiveReadiness, type ParallelRunView, type PayRun, type SetupEntity } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Go-live readiness (PAY-10.07): what is left before the first live month, and the parallel run.
export default function YxPayGoLivePage() {
  const perms = useYxPermissions();
  const me = useCurrentUser();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const q = entityId ? `entityId=${encodeURIComponent(entityId)}` : null;
  const readiness = usePay<GoLiveReadiness>(q ? `/go-live?${q}` : null);
  const parallel = usePay<ParallelRunView[]>(q ? `/parallel-runs?${q}` : null);
  const runs = usePay<PayRun[]>('/runs');
  const write = usePayWrite();
  const upload = useApiWrite();
  return (
    <GoLiveScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      readiness={readiness.data ?? null}
      runs={runs.data ?? []}
      parallel={parallel.data ?? (parallel.isError ? [] : null)}
      me={me.data?.id ?? null}
      can={{ upload: perms.has('payroll.run.prepare'), decide: perms.has('payroll.run.approve') }}
      onUpload={(runId, file) => {
        const body = new FormData();
        body.append('file', file);
        return upload(`/payroll/runs/${encodeURIComponent(runId)}/parallel`, body);
      }}
      onDecide={(id, decision, reason) => write(`/parallel-runs/${encodeURIComponent(id)}/decision`, { decision, ...(reason ? { reason } : {}) })}
    />
  );
}
