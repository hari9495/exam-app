'use client';

import { PAY_SETTINGS, PEOPLE_SETTINGS, PROJECT_SETTING_KEYS, TIME_SETTINGS, type SettingChangeRow } from '@yukthix/ui/hiring';
import { useOrg } from './yx-org';

// Settings S-5 (answers 1326, 1461): the change history of settings pages, from the audit log (GET /org/settings/history).
// The API lists only settings the person may read; the pages ask only for their own settings.

/** The company settings shown on each drawn page that has them (S-2, S-3, S-4 and 3.11). */
export const PAGE_SETTING_KEYS: Record<string, string[]> = {
  ...Object.fromEntries([TIME_SETTINGS, PAY_SETTINGS, PEOPLE_SETTINGS].flatMap((m) => Object.entries(m).map(([id, p]) => [id, p.settings.map((x) => x.key)]))),
  '3.11': PROJECT_SETTING_KEYS,
};

/** The last `limit` changes of these settings, newest first (none asked: nothing loaded). */
export function useSettingsHistory(keys: string[], limit = 20) {
  const q = keys.length ? `/settings/history?keys=${encodeURIComponent([...new Set(keys)].sort().join(','))}&limit=${limit}` : '/settings/history';
  return useOrg<SettingChangeRow[]>(q, keys.length > 0);
}

/** The page a setting is on (the first, if it is on more than one). */
export const pageOfSetting = (key: string) => Object.entries(PAGE_SETTING_KEYS).find(([, keys]) => keys.includes(key))?.[0];
