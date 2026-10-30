'use client';

import { useQuery } from '@tanstack/react-query';
import { CompanySettingsScreen, type ErasureReport, type LegalEntity, type SettingsArea, type MasterRecord, type OrgLocation, type SettingDef, type SettingOverride } from '@yukthix/ui/org';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { loadState, todayIst, useOrg, useOrgWrite, useYxPermissions } from './yx-org';

const opts = (rows: { id: string; name: string; archivedAt?: string | null }[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));

/**
 * Settings › Company rules (group 1), Access and privacy (group 2) and Payroll rules (group 4), P01 §4.6 / P02 §4.2:
 * the registry and every override from the API; the records an override can name from the structure lists. The API
 * checks org.settings.manage per entity (payroll set-up only reads the payroll rules) and the guard key on access and
 * fraud settings.
 */
export function CompanySettingsPage({ section }: { section: SettingsArea }) {
  const perms = useYxPermissions();
  const settings = useOrg<{ registry: Record<string, SettingDef>; overrides: SettingOverride[] }>('/settings');
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const locations = useOrg<OrgLocation[]>('/locations');
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const types = useOrg<MasterRecord[]>('/masters/employment-types');
  const grades = useOrg<MasterRecord[]>('/masters/grades');
  const write = useOrgWrite();
  const { accessToken } = useAuth();
  // Access and privacy: the Special data erasure dry run, for company-wide settings managers (a 403 hides the card).
  // Under ['yx', 'org'] so saving the switch refreshes it.
  const erasure = useQuery<ErasureReport>({
    queryKey: ['yx', 'org', 'people-privacy-erasure'],
    queryFn: () => apiFetch('/people/privacy-erasure', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && section === 'access' && perms.has('org.settings.manage'),
    retry: false,
  });
  return (
    <CompanySettingsScreen
      section={section}
      state={loadState(settings, entities, locations, departments, types, grades)}
      onRetry={() => void Promise.all([settings, entities, locations, departments, types, grades].map((q) => q.refetch()))}
      registry={settings.data?.registry ?? {}}
      overrides={settings.data?.overrides ?? []}
      choices={{ legal_entity: opts(entities.data), location: opts(locations.data), department: opts(departments.data), employment_type: opts(types.data), grade: opts(grades.data) }}
      canManage={perms.has('org.settings.manage')}
      heldGuards={perms.has('access.role.manage') ? ['access.role.manage'] : []}
      today={todayIst()}
      onSave={async (input) => void (await write('PUT', '/settings', input))}
      onRemove={async (settingId) => void (await write('DELETE', `/settings/${encodeURIComponent(settingId)}`))}
      erasure={erasure.data}
    />
  );
}
