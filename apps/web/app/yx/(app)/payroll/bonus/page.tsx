'use client';

import { useEffect, useState } from 'react';
import { BonusComputationScreen, type BonusOverview, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Statutory bonus (PAY-24, Payment of Bonus Act; founder decision 9): work it out per legal entity and
// accounting year, approve it (someone other than its makers) and send it to an off-cycle bonus run. Every write carries
// the computation's version; the API refuses a stale one.
export default function YxPayBonusPage() {
  const entities = usePay<SetupEntity[]>('/bonus/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  const [yearStart, setYearStart] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const e = encodeURIComponent;
  const data = usePay<BonusOverview>(entityId ? `/bonus?legalEntityId=${e(entityId)}${yearStart ? `&yearStart=${e(yearStart)}` : ''}` : null);
  const write = useApiWrite();
  const c = data.data?.computation;
  const at = (path = '') => `/payroll/bonus/${e(c!.id)}${path}`;
  return (
    <BonusComputationScreen
      live={{
        state: payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: (id) => {
          setEntityId(id);
          setYearStart(null);
        },
        onYear: setYearStart,
        data: data.data ?? null,
        onCompute: (start) => write('/payroll/bonus', { legalEntityId: entityId, yearStart: start }),
        onChange: (x) => write(at(), { version: c!.version, ...x }, 'PATCH'),
        onRow: (employmentId, x) => write(at(`/rows/${e(employmentId)}`), { version: c!.version, ...x }, 'PATCH'),
        onSubmit: () => write(at('/submit'), { version: c!.version }),
        onApprove: () => write(at('/approve'), { version: c!.version }),
        onReturn: (reason) => write(at('/return'), { version: c!.version, reason }),
        onSend: () => write(at('/send'), { version: c!.version }),
        runHref: (runId) => `/yx/payroll/runs/${e(runId)}`,
      }}
    />
  );
}
