'use client';

import { LegalEntitiesScreen, type LegalEntity, type StatutoryIds } from '@yukthix/ui/org';
import { companyRules, loadState, RULE_KEYS, useOrg, useOrgRead, useOrgWrite, useYxPermissions, type Reference } from '../../../../../lib/yx-org';

const id = encodeURIComponent;

// Settings › Organisation › Legal entities (P01 §4.1). PAN / TAN / GSTIN / CIN are Confidential: the list
// carries only whether each is on file; the values are read through a recorded call, and saving them is a
// step-up action (apiFetch asks the person to confirm it's them, then resends).
export default function YxLegalEntitiesPage() {
  const entities = useOrg<LegalEntity[]>('/legal-entities?includeArchived=true');
  const reference = useOrg<Reference>('/reference');
  const settings = useOrg<Parameters<typeof companyRules>[0]>('/settings');
  const perms = useYxPermissions();
  const write = useOrgWrite();
  const read = useOrgRead();
  return (
    <LegalEntitiesScreen
      state={loadState(entities, reference)}
      onRetry={() => void Promise.all([entities.refetch(), reference.refetch()])}
      entities={entities.data ?? []}
      states={reference.data?.states ?? []}
      canManage={perms.has('org.settings.manage')}
      canStatutory={perms.has('org.entity.statutory.manage')}
      rules={companyRules(settings.data)}
      onSaveRules={async (changes) => {
        for (const [rule, value] of Object.entries(changes)) {
          if (value) await write('PUT', '/settings', { key: RULE_KEYS[rule as keyof typeof RULE_KEYS], scopeType: 'tenant', value });
        }
      }}
      onSave={async (entityId, input) => {
        await write(entityId ? 'PUT' : 'POST', entityId ? `/legal-entities/${id(entityId)}` : '/legal-entities', input);
      }}
      onSetDefault={async (entityId) => void (await write('POST', `/legal-entities/${id(entityId)}/default`))}
      onArchive={async (entityId) => void (await write('POST', `/legal-entities/${id(entityId)}/archive`))}
      onRestore={async (entityId) => void (await write('POST', `/legal-entities/${id(entityId)}/restore`))}
      onDelete={async (entityId) => void (await write('DELETE', `/legal-entities/${id(entityId)}`))}
      onLoadStatutory={(entityId) => read<StatutoryIds>(`/legal-entities/${id(entityId)}/statutory`)}
      onSaveStatutory={async (entityId, ids) => void (await write('PUT', `/legal-entities/${id(entityId)}/statutory`, ids))}
    />
  );
}
