'use client';

import { useEffect, useState } from 'react';
import { RulesBrowserScreen, type AdvisoryView, type RuleSetView, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Compliance › Rules & updates: the designed CMP-08 screen on its "Labour-law updates" tab: law changes for the entity's
// states, each marked reviewed with what was done. The "Rules" tab shows for payroll set-up holders.
export default function YxPayAdvisoriesPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const seeRules = perms.has('payroll.setup.manage');
  const rules = usePay<RuleSetView[]>(seeRules ? `/statutory/rules${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}` : null);
  const advisories = useApi<AdvisoryView[]>(entityId ? `/statutory/advisories?entityId=${encodeURIComponent(entityId)}` : null);
  const write = useApiWrite();
  return (
    <RulesBrowserScreen
      rules={[]}
      advisories={[]}
      tab="updates"
      live={{
        state: payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        rules: rules.data ?? null,
        advisories: advisories.data ?? (advisories.isError ? [] : null),
        can: { rules: seeRules, updates: true },
        onReview: (a, note) => write(`/statutory/advisories/${encodeURIComponent(a.code)}/review`, { entityId, note }),
        today: todayIndia(),
      }}
    />
  );
}
