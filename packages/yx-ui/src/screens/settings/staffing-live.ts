// Settings 6.2 Staffing desk made live (slice 1): the designed 6.2 page with the company's values. Only the fields with
// a company setting or data behind them are shown (the desk switch, rate-card defaults, payment terms, invoice series and
// the law row); collections, bench, the client portal and e-invoicing come with slices 2 and 3 and are left out, never
// shown with sample values.
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
} as const;
const LIVE = new Set([...Object.keys(KEY), 'staff.rate_cards', 'staff.invoice_series', 'staff.invoice_series_law']);

export function staffingSettingsPage(design: SettingsPageDef, data: StaffingSettingsData): SettingsPageDef {
  const v = data.values;
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    const base: SettingDef = { ...d, overrides: undefined, dated: undefined, scope: d.kind === 'law' || d.kind === 'link' ? d.scope : 'Company' };
    const k = KEY[d.key as keyof typeof KEY];
    if (d.key === 'staff.desk_enabled') return { ...base, value: v[k] === 'on', starter: v[k] === data.defaults[k] };
    if (k) {
      const options = data.choices[k] ?? [];
      const unit = d.key === 'staff.payment_terms' ? ' days' : d.key === 'staff.rate_backdate' ? '' : '×';
      const labels = d.key === 'staff.rate_backdate' ? d.optionLabels : Object.fromEntries(options.map((o) => [o, `${o}${unit}`]));
      return { ...base, kind: 'select', options, optionLabels: labels, unit: undefined, min: undefined, max: undefined, value: v[k]!, starter: v[k] === data.defaults[k] };
    }
    if (d.key === 'staff.invoice_series')
      return { ...base, readOnlyList: true, columns: ['Legal entity', 'GSTIN', 'Series', 'Next number'], rows: data.series.map((s) => [s.entity, s.gstin, `${s.prefix} (${s.financialYear})`, String(s.nextNumber)]), starter: false, helper: `One series per GSTIN for each financial year (${data.financialYear} now). The next number only goes up.` };
    return base;
  };
  return {
    ...design,
    summary: 'Turn the staffing desk on, the rate-card defaults and how far back a rate may change, payment terms, and invoice numbering per GSTIN.',
    note: undefined,
    related: [{ label: 'Clients', screenId: 'HIR-14' }],
    scopes: undefined,
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /staffing/settings. */
export function staffingSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  return Object.entries(values)
    .filter(([f]) => f in KEY)
    .map(([f, value]) => ({ key: KEY[f as keyof typeof KEY], value: f === 'staff.desk_enabled' ? (value === true ? 'on' : 'off') : String(value) }));
}
