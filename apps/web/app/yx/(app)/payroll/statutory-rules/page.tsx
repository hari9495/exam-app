'use client';

import { RulesBrowserScreen, type AdvisoryView, type RuleSetView, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useEntityChoice } from '../../../../../lib/yx-pay-5b';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Compliance › Statutory rules: the designed CMP-08 browser ("Rules" tab) with the published rules, read only. The
// "Labour-law updates" tab shows for people who review them (statutory.advisory.review).
export default function YxStatutoryRulesPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const { list, entityId, setEntityId } = useEntityChoice(entities.data, 'payroll.setup.manage');
  const rules = usePay<RuleSetView[]>(`/statutory/rules${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`);
  const updates = perms.has('statutory.advisory.review');
  const advisories = useApi<AdvisoryView[]>(updates && entityId ? `/statutory/advisories?entityId=${encodeURIComponent(entityId)}` : null);
  const write = useApiWrite();
  return (
    <RulesBrowserScreen
      rules={[]}
      advisories={[]}
      tab="rules"
      live={{
        state: payState(entities, rules),
        onRetry: () => void rules.refetch(),
        entities: list,
        entityId,
        onEntity: setEntityId,
        rules: rules.data ?? null,
        advisories: advisories.data ?? null,
        can: { rules: true, updates },
        onReview: (a, note) => write(`/statutory/advisories/${encodeURIComponent(a.code)}/review`, { entityId, note }),
        today: todayIndia(),
      }}
    />
  );
}
