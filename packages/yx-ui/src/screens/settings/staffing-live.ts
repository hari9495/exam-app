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
  /** Answer 491: the Helpdesk teams client portal tickets can go to. */
  teams?: { value: string; label: string }[];
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
  // Slice 3: collections and e-invoicing.
  'staff.dunning': 'staffing.dunning.schedule',
  'staff.einvoice': 'staffing.einvoice.applies',
  // Answer 522: the accounting export.
  'staff.exp_sales': 'staffing.export.ledger.sales',
  'staff.exp_split': 'staffing.export.gst_split',
  'staff.exp_cgst': 'staffing.export.ledger.cgst',
  'staff.exp_sgst': 'staffing.export.ledger.sgst',
  'staff.exp_igst': 'staffing.export.ledger.igst',
  'staff.exp_gst': 'staffing.export.ledger.gst',
  'staff.exp_tds': 'staffing.export.tds',
  'staff.exp_tds_ledger': 'staffing.export.ledger.tds',
  'staff.exp_round': 'staffing.export.round_off',
  'staff.exp_round_ledger': 'staffing.export.ledger.round_off',
  // Answer 491: where client portal tickets go.
  'staff.portal_tickets': 'staffing.portal.tickets_team',
} as const;
/** Free-text company settings (ledger names): shown as typed, saved as text. */
const TEXTS = new Set(['staff.exp_sales', 'staff.exp_cgst', 'staff.exp_sgst', 'staff.exp_igst', 'staff.exp_gst', 'staff.exp_tds_ledger', 'staff.exp_round_ledger']);
const SEGMENTS = new Set(['staff.exp_split', 'staff.exp_tds', 'staff.exp_round']);
const TOGGLES = new Set(['staff.desk_enabled', 'staff.mask_contact', 'staff.einvoice']);
/** The design's own option labels are kept for these (the stored values are the same). */
const OWN_LABELS = new Set(['staff.rate_backdate', 'staff.ending_soon', 'staff.statutory_cost', 'staff.vendor_margin', 'staff.vendor_ownership']);
const LIVE = new Set([...Object.keys(KEY), 'staff.rate_cards', 'staff.invoice_series', 'staff.invoice_series_law', 'staff.ageing']);
const DUNNING_LABELS: Record<string, string> = { standard: 'Standard: 3 days before due, then 7, 21 and 45 days overdue', gentle: 'Gentle: on the due date, then 15 and 45 days overdue', off: 'No reminders' };

export function staffingSettingsPage(design: SettingsPageDef, data: StaffingSettingsData): SettingsPageDef {
  const v = data.values;
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    const base: SettingDef = { ...d, overrides: undefined, dated: undefined, scope: d.kind === 'law' || d.kind === 'link' ? d.scope : 'Company' };
    const k = KEY[d.key as keyof typeof KEY];
    if (k && !(k in v)) return null; // an older API without this setting: never shown with a sample value
    if (d.key === 'staff.einvoice') return { ...base, kind: 'toggle', availability: undefined, value: v[k!] === 'on', starter: v[k!] === data.defaults[k!], helper: 'Our invoices need an IRN (aggregate turnover at or above the e-invoice limit in the rule set, verify with your CA). The invoice shows its reporting window; the IRP itself is not connected, so report on the IRP yourself.' };
    if (d.key === 'staff.dunning') return { ...base, kind: 'select', columns: undefined, rows: undefined, addLabel: undefined, options: data.choices[k!] ?? [], optionLabels: DUNNING_LABELS, value: v[k!]!, starter: v[k!] === data.defaults[k!], helper: 'Reminders go to the client’s billing contacts; a dispute pauses them for that invoice.' };
    if (d.key === 'staff.portal_tickets')
      return { ...base, kind: 'select', options: data.choices[k!] ?? ['account_manager'], optionLabels: { account_manager: "The client's account manager", ...Object.fromEntries((data.teams ?? []).map((t) => [t.value, t.label])) }, value: v[k!]!, starter: v[k!] === data.defaults[k!] };
    if (d.key === 'staff.ageing') return { ...base, readOnlyList: true, helper: 'How unpaid invoices are grouped on Receivables (fixed).' };
    if (k && TEXTS.has(d.key)) return { ...base, kind: 'text', value: v[k]!, starter: v[k] === data.defaults[k] };
    if (k && SEGMENTS.has(d.key)) return { ...base, kind: 'segment', value: v[k]!, starter: v[k] === data.defaults[k] };
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
    summary: 'Turn the staffing desk on; rate-card defaults, submissions, placements, vendors and the bench policy; payment terms, invoice numbering per GSTIN, payment reminders and e-invoicing.',
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
