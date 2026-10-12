'use client';

import { CountryGuideScreen, type CountryPack, type CountrySetup, type EntityDefaults, type GuideEntity, type Language } from '@yukthix/ui/global';
import { loadState, useOrg, useOrgWrite, useYxPermissions } from '../../../../../lib/yx-org';
import { useGlobal, useGlobalWrite } from '../../../../../lib/yx-global';

const id = encodeURIComponent;

interface SettingsList {
  overrides: { key: string; scopeType: string; scopeId: string; value: unknown }[];
}

// Settings › Organisation › Countries (G1-GLOBAL-CORE-BUILD-DESIGN §8): the "Add a country" guide. The entity is
// created through the legal-entity API, the week and language are entity settings; identifiers and registrations
// stay on their own screens (their own keys and step-up).
export default function YxCountriesPage() {
  const countries = useGlobal<CountryPack[]>('/countries');
  const setups = useGlobal<CountrySetup[]>('/country-setups');
  const entities = useOrg<GuideEntity[]>('/legal-entities?includeArchived=true');
  const settings = useOrg<SettingsList>('/settings');
  const perms = useYxPermissions();
  const write = useGlobalWrite();
  const orgWrite = useOrgWrite();
  const entityDefaults: Record<string, EntityDefaults> = {};
  for (const o of settings.data?.overrides ?? []) {
    if (o.scopeType !== 'legal_entity' || (o.key !== 'work.normal_week_hours' && o.key !== 'people.language')) continue;
    const d = (entityDefaults[o.scopeId] ??= { normalWeek: 'pack', language: 'en' });
    if (o.key === 'work.normal_week_hours') d.normalWeek = String(o.value);
    else d.language = o.value as Language;
  }
  return (
    <CountryGuideScreen
      state={loadState(countries, setups, entities)}
      onRetry={() => void Promise.all([countries.refetch(), setups.refetch(), entities.refetch()])}
      countries={countries.data ?? []}
      setups={setups.data ?? []}
      entities={entities.data ?? []}
      entityDefaults={entityDefaults}
      canManage={perms.has('org.settings.manage')}
      onStart={(country) => write<CountrySetup>('POST', '/country-setups', { country })}
      onCreateEntity={(input) => orgWrite('POST', '/legal-entities', input) as Promise<{ id: string }>}
      onLinkEntity={(setupId, legalEntityId, version) => write<CountrySetup>('PUT', `/country-setups/${id(setupId)}`, { legalEntityId, version })}
      onSaveDefaults={async (entityId, d) => {
        await orgWrite('PUT', '/settings', { key: 'work.normal_week_hours', scopeType: 'legal_entity', scopeId: entityId, value: d.normalWeek });
        await orgWrite('PUT', '/settings', { key: 'people.language', scopeType: 'legal_entity', scopeId: entityId, value: d.language });
      }}
      onFinish={(setupId, version) => write<CountrySetup>('POST', `/country-setups/${id(setupId)}/finish`, { version })}
      onRefresh={async () => void (await setups.refetch())}
    />
  );
}
