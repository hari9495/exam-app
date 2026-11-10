// Settings 4.9 Contract labour made live (CL-1, answers 621 and 627): the designed 4.9 page with the company's values.
// Shown: the registration threshold and the minimum age from the rule set IN.CLRA (read-only, marked verify), the
// licence block (law, always on) and the licence expiry alerts (a company setting). Principal-employer registrations
// and the monthly compliance section come with later slices (questions 671, CL-4) and are left out, never shown with
// sample values.
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /contract-labour/settings. */
export interface ClraSettingsData {
  canEdit: boolean;
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
  law: { state: string; version: string; validFrom: string; validTo: string | null; verify: boolean; source: string; values: { law: string; registrationThreshold: number; licenceThreshold: number; minAge: number } }[];
}

const STATE_NAMES: Record<string, string> = { 'IN-TN': 'Tamil Nadu', 'IN-KA': 'Karnataka' };
const dayText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "50 contract workers (20 for dates before 21 Nov 2025)", per state when the states differ. */
export function thresholdText(law: ClraSettingsData['law']): string {
  const states = [...new Set(law.map((r) => r.state))];
  const one = (rows: ClraSettingsData['law']) => {
    const now = rows.find((r) => !r.validTo) ?? rows[rows.length - 1];
    if (!now) return 'Not in the rules yet';
    const before = rows.find((r) => r.validTo && r.validTo < now.validFrom && r.values.registrationThreshold !== now.values.registrationThreshold);
    return `${now.values.registrationThreshold} contract workers${before ? ` (${before.values.registrationThreshold} for dates before ${dayText(now.validFrom)})` : ''}`;
  };
  const texts = states.map((s) => ({ s, t: one(law.filter((r) => r.state === s)) }));
  if (!texts.length) return 'Not in the rules yet';
  return new Set(texts.map((x) => x.t)).size === 1 ? texts[0]!.t : texts.map((x) => `${STATE_NAMES[x.s] ?? x.s}: ${x.t}`).join('; ');
}

const LIVE = new Set(['clra.threshold', 'clra.licence_check', 'clra.licence_alerts', 'clra.min_age']);

export function clraSettingsPage(design: SettingsPageDef, data: ClraSettingsData): SettingsPageDef {
  const verify = data.law.some((r) => r.verify) ? ' (verify)' : '';
  const laws = [...new Set(data.law.filter((r) => !r.validTo).map((r) => r.values.law))];
  const minAge = [...new Set(data.law.filter((r) => !r.validTo).map((r) => r.values.minAge))];
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    const base: SettingDef = { ...d, overrides: undefined, dated: undefined };
    if (d.key === 'clra.threshold') return { ...base, value: thresholdText(data.law), law: `${d.law}${verify}`, helper: `From the statutory rules for ${[...new Set(data.law.map((r) => STATE_NAMES[r.state] ?? r.state))].join(' and ')}.` };
    if (d.key === 'clra.min_age') return minAge.length === 1 ? { ...base, value: `${minAge[0]} years`, law: `${d.law}${verify}` } : base;
    if (d.key === 'clra.licence_check') return { ...base, law: `${laws.join('; ') || d.law}${verify}` };
    if (!('clra.licence_alerts' in data.values)) return null; // an older API: never shown with a sample value
    const options = data.choices['clra.licence_alerts'] ?? [];
    const v = data.values['clra.licence_alerts']!;
    return { ...base, kind: 'multiselect', scope: 'Company', options, optionLabels: Object.fromEntries(options.map((o) => [o, `${o} days`])), value: v ? v.split(',') : [], starter: v === data.defaults['clra.licence_alerts'], helper: 'The compliance owners for contract labour are told on each of these days before a licence ends, unless its renewal is verified.' };
  };
  return {
    ...design,
    summary: 'The registration threshold and licence rules from the statutory rules, and when you are told a contractor licence ends.',
    note: 'Thresholds and licence rules come from the statutory rules and are read-only. Every change is recorded.',
    scopes: undefined,
    related: [{ label: 'Contractors register', screenId: 'CLB-01' }],
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /contract-labour/settings (days largest first). */
export function clraSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  const v = values['clra.licence_alerts'];
  return Array.isArray(v) ? [{ key: 'clra.licence_alerts', value: [...v].map(String).sort((a, b) => Number(b) - Number(a)).join(',') }] : [];
}
