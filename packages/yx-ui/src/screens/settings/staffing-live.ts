// Settings 6.2 Staffing desk made live: the designed 6.2 page with the company's values. Only the fields with a company
// setting or data behind them are shown (the desk switch, rate-card defaults, payment terms, invoice series, the law row;
// slice 2: submissions, placements, vendors and the bench policy); collections, the client portal and e-invoicing come
// with slice 3 and are left out, never shown with sample values.
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /staffing/settings. */
export interface StaffingSettingsData {
  canEdit: boolean;
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
  financialYear: string;
  entities: { id: string; name: string; gstins: string[] }[];
  series: { id: string; legalEntityId: string; entity: string; gstin: string; financialYear: string; prefix: string; nextNumber: number; version: number }[];
}

const KEY = {
  'staff.desk_enabled': 'staffing.desk.enabled',
  'staff.rate_backdate': 'staffing.rate_change.backdate_days',
  'staff.ot_multiplier': 'staffing.ot_multiplier',
  'staff.holiday_multiplier': 'staffing.holiday_multiplier',
  'staff.payment_terms': 'staffing.payment_terms_days',
  'staff.mask_contact': 'staffing.submission.mask_contact',
  'staff.ending_soon': 'staffing.placement.ending_soon_days',
  'staff.statutory_cost': 'staffing.statutory_cost_pct',
  'staff.vendor_margin': 'staffing.vendor.target_margin_pct',
  'staff.vendor_ownership': 'staffing.vendor.ownership_days',
  'staff.bench_pay': 'staffing.bench.pay_pct',
  'staff.bench_days': 'staffing.bench.max_days',
  'staff.bench_after': 'staffing.bench.after',
} as const;
const TOGGLES = new Set(['staff.desk_enabled', 'staff.mask_contact']);
/** The design's own option labels are kept for these (the stored values are the same). */
const OWN_LABELS = new Set(['staff.rate_backdate', 'staff.ending_soon', 'staff.statutory_cost', 'staff.vendor_margin', 'staff.vendor_ownership']);
const LIVE = new Set([...Object.keys(KEY), 'staff.rate_cards', 'staff.invoice_series', 'staff.invoice_series_law']);

export function staffingSettingsPage(design: SettingsPageDef, data: StaffingSettingsData): SettingsPageDef {
  const v = data.values;
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    const base: SettingDef = { ...d, overrides: undefined, dated: undefined, scope: d.kind === 'law' || d.kind === 'link' ? d.scope : 'Company' };
    const k = KEY[d.key as keyof typeof KEY];
    if (k && !(k in v)) return null; // an older API without this setting: never shown with a sample value
    if (k && TOGGLES.has(d.key)) return { ...base, kind: 'toggle', value: v[k] === 'on', starter: v[k] === data.defaults[k] };
    if (d.key === 'staff.bench_after') return { ...base, scope: 'Company', kind: 'segment', options: ['review', 'unpaid'], optionLabels: { review: 'Redeploy or exit review', unpaid: 'Unpaid bench' }, value: v[k!]!, starter: v[k!] === data.defaults[k!] };
    if (k) {
      const options = data.choices[k] ?? [];
      const unit = d.key === 'staff.payment_terms' || d.key === 'staff.bench_days' ? ' days' : d.key === 'staff.bench_pay' ? '%' : '×';
      const labels = OWN_LABELS.has(d.key) ? d.optionLabels : Object.fromEntries(options.map((o) => [o, `${o}${unit}`]));
      return { ...base, kind: 'select', options, optionLabels: labels, unit: undefined, min: undefined, max: undefined, value: v[k]!, starter: v[k] === data.defaults[k] };
    }
    if (d.key === 'staff.invoice_series')
      return { ...base, readOnlyList: true, columns: ['Legal entity', 'GSTIN', 'Series', 'Next number'], rows: data.series.map((s) => [s.entity, s.gstin, `${s.prefix} (${s.financialYear})`, String(s.nextNumber)]), starter: false, helper: `One series per GSTIN for each financial year (${data.financialYear} now). The next number only goes up.` };
    return base;
  };
  return {
    ...design,
    summary: 'Turn the staffing desk on; rate-card defaults, submissions, placements, vendors and the bench policy; payment terms and invoice numbering per GSTIN.',
    note: undefined,
    related: [{ label: 'Clients', screenId: 'HIR-14' }, { label: 'Placements and bench', screenId: 'HIR-17' }, { label: 'Vendors', screenId: 'HIR-21' }],
    scopes: undefined,
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /staffing/settings. */
export function staffingSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  return Object.entries(values)
    .filter(([f]) => f in KEY)
    .map(([f, value]) => ({ key: KEY[f as keyof typeof KEY], value: TOGGLES.has(f) ? (value === true ? 'on' : 'off') : String(value) }));
}
