// Settings 3.12 Visitors made live (Visitors slice 1; founder answers 602-610): the designed page with the company's
// values. A location's own value is set on the company rules page and named on the field ("Own value at Hosur plant").
// Fields with nothing behind them yet (visitor types) are left out until their slice. Slice 3: ID capture is three
// choices (603), the watch-list link and its review period (605).
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /visitors/settings. */
export interface VisitorSettingsData {
  canEdit: boolean;
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  labels: Record<string, Record<string, string>>;
  /** Per key: the locations with their own value. */
  overrides: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
}

/** Designed field → company setting. */
const KEY = {
  'vis.host_approval_timeout': 'visitors.host_timeout_minutes',
  'vis.id_capture': 'visitors.id_capture',
  'vis.photo': 'visitors.photo',
  'vis.hours_from': 'visitors.hours_from',
  'vis.hours_to': 'visitors.hours_to',
  'vis.notice': 'visitors.notice',
  'vis.badge': 'visitors.badge',
  'vis.retention_days': 'visitors.retention_days',
  'vis.id_retention_days': 'visitors.id_retention_days',
  'vis.watchlist_review_days': 'visitors.watchlist_review_days',
  // Slice 2 (601): self check-in on a visitor kiosk (per location, off by default).
  'vis.kiosk': 'visitors.kiosk',
} as const;
type Field = keyof typeof KEY;
const TOGGLE: Partial<Record<Field, [on: string, off: string]>> = { 'vis.photo': ['on', 'off'], 'vis.kiosk': ['on', 'off'] };
const UNIT: Partial<Record<Field, (v: string) => string>> = {
  'vis.host_approval_timeout': (v) => `${v} minutes`,
  'vis.retention_days': (v) => `${v} days`,
  'vis.id_retention_days': (v) => `${v} days`,
  'vis.watchlist_review_days': (v) => `${v} days`,
};
const LIVE = new Set<string>([...Object.keys(KEY), 'vis.desk', 'vis.log', 'vis.watchlist', 'vis.types']);

/** Slice 2 (606): GET /visitors/types. */
export interface VisitorTypesData {
  types: { id: string; name: string; escort: boolean; ndaPolicyId: string | null; nda: string | null; inductionPolicyId: string | null; induction: string | null }[];
  policies: { id: string; title: string }[];
}
const NO = 'No';

/** The edited list back to PUT /visitors/types (a row keeps its id by its place; added rows are new). */
export function visitorTypesFromRows(rows: string[][], data: VisitorTypesData): { id?: string; name: string; escort: boolean; ndaPolicyId: string | null; inductionPolicyId: string | null }[] {
  const policy = (title: string | undefined) => (title && title !== NO ? (data.policies.find((p) => p.title === title)?.id ?? null) : null);
  return rows.map((r, i) => ({ ...(data.types[i] ? { id: data.types[i]!.id } : {}), name: (r[0] ?? '').trim(), escort: r[1] === 'Yes', ndaPolicyId: policy(r[2]), inductionPolicyId: policy(r[3]) }));
}

/** The designed 3.12 page with the company's values, for SettingsPageScreen `live`. */
export function visitorSettingsPage(design: SettingsPageDef, data: VisitorSettingsData, types?: VisitorTypesData): SettingsPageDef {
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    if (d.key === 'vis.types') {
      if (!types) return null;
      const titles = [NO, ...types.policies.map((p) => p.title)];
      return { ...d, rows: types.types.map((t) => [t.name, t.escort ? 'Yes' : 'No', t.nda ?? NO, t.induction ?? NO]), columnOptions: { Escort: ['Yes', 'No'], NDA: titles, 'Safety induction': titles }, helper: 'The NDA and the safety induction are published company policies (Policies). An NDA counts for a year for the same person and company; the induction is every visit.' };
    }
    if (d.key === 'vis.desk' || d.key === 'vis.log' || d.key === 'vis.watchlist') return d;
    const f = d.key as Field;
    const k = KEY[f];
    const own = data.overrides[k] ?? [];
    const base = { ...d, overrides: undefined, dated: undefined, scope: own.length ? `Company · own value at ${own.join(', ')}` : 'Company', starter: data.values[k] === data.defaults[k] };
    const toggle = TOGGLE[f];
    if (toggle) return { ...base, value: data.values[k] === toggle[0] };
    if (f === 'vis.notice') return { ...base, value: data.values[k]! };
    const options = data.choices[k] ?? [];
    const labels = data.labels[k] ?? (UNIT[f] ? Object.fromEntries(options.map((o) => [o, UNIT[f]!(o)])) : undefined);
    return { ...base, kind: 'select', options, optionLabels: labels, unit: undefined, min: undefined, max: undefined, after: undefined, value: data.values[k]! };
  };
  return {
    ...design,
    summary: 'What is captured at the desk, allowed hours, the notice visitors accept, the badge, and how long visitor data is kept. A location can have its own value.',
    related: undefined,
    scopes: undefined,
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /visitors/settings. */
export function visitorSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [field, value] of Object.entries(values)) {
    const key = KEY[field as Field];
    if (!key) continue;
    const toggle = TOGGLE[field as Field];
    out.push({ key, value: toggle ? toggle[value === true ? 0 : 1] : String(value ?? '') });
  }
  return out;
}
