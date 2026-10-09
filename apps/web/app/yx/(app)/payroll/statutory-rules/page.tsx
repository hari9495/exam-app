'use client';

import { StatutoryRulesScreen, type RuleSetView, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useEntityChoice } from '../../../../../lib/yx-pay-5b';

// Payroll › Statutory rules (CMP-08, PAY-2.01): the published rules with sources and verify flags, read only.
export default function YxStatutoryRulesPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const { list, entityId, setEntityId } = useEntityChoice(entities.data, 'payroll.setup.manage');
  const rules = usePay<RuleSetView[]>(`/statutory/rules${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`);
  return <StatutoryRulesScreen state={payState(entities, rules)} onRetry={() => void rules.refetch()} entities={list} entityId={entityId} onEntity={setEntityId} rules={rules.data ?? null} />;
}
