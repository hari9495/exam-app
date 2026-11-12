// Settings 3.11 Projects & timesheets made live (Projects P-1; founder answers 1401, 1404, 1405): the designed page with
// the company's values. Only the fields with a company setting behind them are shown (the Projects switch, the booking
// rule and the two burn alerts) plus the link to PRJ-01; the rest come with their slices, never shown with sample values.
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /projects/settings. */
export interface ProjectSettingsData {
  canEdit: boolean;
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
}

const KEY = {
  'prj.enabled': 'projects.enabled',
  'prj.booking_rule': 'projects.booking.allocated_only',
  'prj.burn_alert_1': 'projects.burn.warn_pct',
  'prj.burn_alert_2': 'projects.burn.over_pct',
  // P-3 (answer 1409): pre-fill from work tools, off by default; owned by the projects settings API (one way, S-4).
  'prj.prefill_enabled': 'timesheet.tool_suggestions',
  // Answer 1444: the billing model new projects start with.
  'prj.billable_default': 'projects.default_billing_model',
  // P-2 (answer 1407): bulk approval within the allocation.
  'prj.bulk_within_allocation': 'projects.bulk.within_allocation',
  // P-4 (answer 1411): the utilisation target and the small-team limit.
  'prj.utilisation_target': 'projects.utilisation.target_pct',
  'prj.small_team': 'projects.small_team.limit',
  // P-5 (answers 1412, 1419): the people limit for a PM's cost and project expenses.
  'prj.cost_min_people': 'projects.cost.min_people',
  'prj.expenses_projects': 'projects.expenses.enabled',
} as const;
type Field = keyof typeof KEY;
const LIVE = new Set<string>([...Object.keys(KEY), 'prj.projects', 'prj.mapping_rules']);
/** The drawn radio's words for the stored on/off. */
const BOOKING: Record<string, string> = { on: 'Block', off: 'Allow', approval: 'Allow with project manager approval' };

/** The designed 3.11 page with the company's values, for SettingsPageScreen `live`. */
export function projectSettingsPage(design: SettingsPageDef, data: ProjectSettingsData): SettingsPageDef {
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    if (d.key === 'prj.projects') return data.values['projects.enabled'] === 'on' ? d : null;
    // P-3: the PRJ-08 rules, once Projects is on (they map to its projects).
    if (d.key === 'prj.mapping_rules') return data.values['projects.enabled'] === 'on' ? { ...d, contributedBy: undefined, availability: undefined } : null;
    const k = KEY[d.key as Field];
    if (!(k in data.values)) return null; // an older API without this setting: never shown with a sample value
    const base = { ...d, overrides: undefined, dated: undefined, scope: 'Company', starter: data.values[k] === data.defaults[k] };
    if (d.key === 'prj.enabled' || d.key === 'prj.prefill_enabled' || d.key === 'prj.bulk_within_allocation' || d.key === 'prj.expenses_projects') return { ...base, contributedBy: undefined, availability: undefined, value: data.values[k] === 'on' };
    if (d.key === 'prj.booking_rule') return { ...base, value: BOOKING[data.values[k]!]! };
    if (d.key === 'prj.billable_default' || d.key === 'prj.small_team' || d.key === 'prj.cost_min_people') return { ...base, value: data.values[k]! };
    if (d.key === 'prj.utilisation_target') return { ...base, kind: 'select', options: data.choices[k] ?? [], optionLabels: Object.fromEntries((data.choices[k] ?? []).map((o) => [o, `${o}%`])), value: data.values[k]! };
    const options = data.choices[k] ?? [];
    return { ...base, kind: 'select', options, optionLabels: Object.fromEntries(options.map((o) => [o, `${o}% of the hours budget`])), unit: undefined, min: undefined, max: undefined, value: data.values[k]! };
  };
  return {
    ...design,
    summary: 'Switch Projects on, who may book time to a project, and when budget burn alerts go to the project manager and Projects finance.',
    note: undefined,
    scopes: undefined,
    related: [{ label: 'Projects', screenId: 'PRJ-01' }],
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /projects/settings. */
export function projectSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [field, value] of Object.entries(values)) {
    const key = KEY[field as Field];
    if (!key) continue;
    if (field === 'prj.enabled' || field === 'prj.prefill_enabled' || field === 'prj.bulk_within_allocation' || field === 'prj.expenses_projects') out.push({ key, value: value === true ? 'on' : 'off' });
    else if (field === 'prj.booking_rule') out.push({ key, value: value === 'Allow' ? 'off' : value === 'Allow with project manager approval' ? 'approval' : 'on' });
    else out.push({ key, value: String(value) });
  }
  return out;
}

