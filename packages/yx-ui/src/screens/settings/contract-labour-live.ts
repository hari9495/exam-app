// Settings 4.9 Contract labour made live (CL-1, answers 621 and 627): the designed 4.9 page with the company's values.
// Shown: the registration threshold and the minimum age from the rule set IN.CLRA (read-only, marked verify), the
// licence block (law, always on), the licence expiry alerts and (CL-2) the safety induction (company settings). Principal-employer registrations
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
  /** CL-5 (answer 673): the registrations per site, the sites, and each site's 12-month peak. */
  registrations?: { id: string; locationId: string; registrationNo: string; maxWorkers: number; validTo: string | null; version: number }[];
  sites?: { id: string; name: string; state: string }[];
  peaks?: { locationId: string; peak: number; peakOn: string | null }[];
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

const PROOF_NAME: Record<string, string> = { pf_challan: 'PF ECR and challan', esi_challan: 'ESI challan', wage_register: 'Wage register', bank_proof: 'Wage payment proof', muster_roll: 'Muster roll' };
const PROOF_ORDER = Object.keys(PROOF_NAME);
const LIVE = new Set(['clra.required_proofs', 'clra.registrations', 'clra.threshold_warn', 'clra.attendance_source', 'clra.threshold', 'clra.licence_check', 'clra.licence_alerts', 'clra.min_age', 'clra.induction_required', 'clra.induction_months', 'clra.doc_cutoff', 'clra.payment_hold']);
const HOLD_LABELS: Record<string, string> = { hold: 'Hold, compliance owner can release with a reason', alert: 'Alert only' };

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
    // CL-2 (answer 632): the induction before the gate pass and how long it lasts.
    if (d.key === 'clra.induction_required') return 'clra.induction_required' in data.values ? { ...base, kind: 'toggle', scope: 'Company', value: data.values['clra.induction_required'] === 'on', starter: data.values['clra.induction_required'] === data.defaults['clra.induction_required'] } : null;
    if (d.key === 'clra.induction_months') return 'clra.induction_months' in data.values ? { ...base, kind: 'select', scope: 'Company', options: data.choices['clra.induction_months'] ?? [], value: data.values['clra.induction_months']!, starter: data.values['clra.induction_months'] === data.defaults['clra.induction_months'] } : null;
    // CL-5: registrations (edited in their sheet), the warning share and where attendance comes from.
    if (d.key === 'clra.registrations') {
      if (!data.registrations) return null;
      const name = (id: string) => data.sites?.find((x) => x.id === id)?.name ?? 'Site';
      const peak = (id: string) => data.peaks?.find((x) => x.locationId === id)?.peak;
      return { ...base, scope: 'Company', columns: ['Establishment', 'Registration', 'Max contract workers', 'Valid to', 'Highest in 12 months'], rows: data.registrations.map((r) => [name(r.locationId), r.registrationNo, String(r.maxWorkers), r.validTo ? dayText(r.validTo) : 'No end', String(peak(r.locationId) ?? 0)]), starter: false, helper: 'At the threshold a site needs a registration before it takes more contract workers; a registered site is held to its maximum.' };
    }
    // Answer 741: which monthly proofs are required.
    if (d.key === 'clra.required_proofs') {
      if (!('clra.required_proofs' in data.values)) return null;
      const options = data.choices['clra.required_proofs'] ?? [];
      const v = data.values['clra.required_proofs']!;
      return { ...base, kind: 'multiselect', scope: 'Company', options, optionLabels: Object.fromEntries(options.map((o) => [o, PROOF_NAME[o] ?? o])), value: v ? v.split(',') : [], starter: v === data.defaults['clra.required_proofs'] };
    }
    if (d.key === 'clra.threshold_warn') return 'clra.threshold_warn' in data.values ? { ...base, kind: 'select', scope: 'Company', value: data.values['clra.threshold_warn']!, starter: data.values['clra.threshold_warn'] === data.defaults['clra.threshold_warn'] } : null;
    if (d.key === 'clra.attendance_source') return 'clra.attendance_source' in data.values ? { ...base, kind: 'radio', scope: 'Company', value: data.values['clra.attendance_source']!, starter: data.values['clra.attendance_source'] === data.defaults['clra.attendance_source'] } : null;
    // CL-4 (answer 634): when a month's proofs are due, and the payment hold.
    if (d.key === 'clra.doc_cutoff') return 'clra.doc_cutoff' in data.values ? { ...base, kind: 'number', scope: 'Company', value: Number(data.values['clra.doc_cutoff']), starter: data.values['clra.doc_cutoff'] === data.defaults['clra.doc_cutoff'] } : null;
    if (d.key === 'clra.payment_hold') return 'clra.payment_hold' in data.values ? { ...base, kind: 'radio', scope: 'Company', options: ['hold', 'alert'], optionLabels: HOLD_LABELS, value: data.values['clra.payment_hold']!, starter: data.values['clra.payment_hold'] === data.defaults['clra.payment_hold'] } : null;
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
  return [
    ...(Array.isArray(v) ? [{ key: 'clra.licence_alerts', value: [...v].map(String).sort((a, b) => Number(b) - Number(a)).join(',') }] : []),
    ...('clra.induction_required' in values ? [{ key: 'clra.induction_required', value: values['clra.induction_required'] === true ? 'on' : 'off' }] : []),
    ...('clra.induction_months' in values ? [{ key: 'clra.induction_months', value: String(values['clra.induction_months']) }] : []),
    ...('clra.doc_cutoff' in values ? [{ key: 'clra.doc_cutoff', value: String(values['clra.doc_cutoff']) }] : []),
    ...('clra.payment_hold' in values ? [{ key: 'clra.payment_hold', value: String(values['clra.payment_hold']) }] : []),
    ...(Array.isArray(values['clra.required_proofs']) ? [{ key: 'clra.required_proofs', value: PROOF_ORDER.filter((k) => (values['clra.required_proofs'] as unknown[]).map(String).includes(k)).join(',') }] : []),
    ...('clra.threshold_warn' in values ? [{ key: 'clra.threshold_warn', value: String(values['clra.threshold_warn']) }] : []),
    ...('clra.attendance_source' in values ? [{ key: 'clra.attendance_source', value: String(values['clra.attendance_source']) }] : []),
  ];
}
