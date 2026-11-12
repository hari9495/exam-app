// Settings S-2 (founder answers 1323, 1324): the drawn Time & Leave pages made live with the company's settings. Every
// setting that worked with its starter value but had no screen now has a field on its drawn page, marked "Starter
// default" until HR changes it; a legal floor or ceiling comes from the country's rule set and blocks saving, naming the
// Act. The drawn links to the live editors (shifts, leave types, holidays...) stay; drawn fields with no setting behind
// them yet are left out until their slice. Values are read from GET /org/settings and saved with PUT /org/settings.
// 3.11's one hidden setting (timesheet.tool_suggestions) is on the Projects settings page (projects-live.ts).
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** One registry entry as GET /org/settings sends it. */
export interface RegistryDef {
  label: string;
  values: readonly string[];
  default: string;
  labels?: Record<string, string>;
  multi?: true;
  guard?: string;
}

export interface TimeSettingsData {
  registry: Record<string, RegistryDef>;
  /** The company-wide value of each key that has one (others use the starter default). */
  company: Record<string, string>;
  /** Keys with values of their own somewhere below the company (a legal entity, a location...), as how many places. */
  elsewhere: Record<string, number>;
  limits: Record<string, { min?: number; max?: number; act: string }>;
  /** Viewer holds org.settings.manage (company-wide). */
  canEdit: boolean;
  /** Viewer also holds the access key a guarded setting needs (phone binding, kiosk PIN tries). */
  canGuard: boolean;
  lastChange: { by: string; at: string; what: string } | null;
}

type Place = { section: string; key: string; synonyms?: string[] };
/** Drawn page → the settings on it, in the drawn section they belong to (a section not drawn is added after). */
export const TIME_SETTINGS: Record<string, { links: string[]; settings: Place[] }> = {
  '3.2': {
    links: ['checkin.geofence', 'checkin.devices'],
    settings: [
      { section: 'Check-in methods', key: 'attendance.check_in_opens_minutes', synonyms: ['early check-in'] },
      { section: 'Device binding', key: 'attendance.phone_binding', synonyms: ['device binding', 'buddy punching'] },
      { section: 'Shared kiosk', key: 'kiosk.methods' },
      { section: 'Shared kiosk', key: 'kiosk.training_opens_minutes' },
      { section: 'Shared kiosk', key: 'kiosk.pin_tries' },
      { section: 'Field staff tracking', key: 'field.tracking', synonyms: ['gps', 'location trail'] },
      { section: 'Field staff tracking', key: 'field.ping_minutes' },
      { section: 'Field staff tracking', key: 'field.max_accuracy_m' },
      { section: 'Field staff tracking', key: 'field.trail_retention_days' },
    ],
  },
  '3.3': {
    links: ['shift.editor', 'roster.editor'],
    settings: [
      { section: 'Working-hour limits', key: 'roster.max_daily_hours', synonyms: ['daily hours'] },
      { section: 'Working-hour limits', key: 'roster.max_weekly_hours', synonyms: ['weekly hours', '48 hours'] },
      { section: 'Working-hour limits', key: 'roster.max_spread_over_hours', synonyms: ['spread-over'] },
      { section: 'Working-hour limits', key: 'attendance.min_rest_hours', synonyms: ['rest between shifts'] },
      { section: 'Overtime policy', key: 'attendance.overtime.pre_approval', synonyms: ['ot'] },
      { section: 'Overtime policy', key: 'standby.call_out_minimum_hours', synonyms: ['on call', 'standby'] },
      { section: 'Patterns and roster', key: 'roster.change_notice_hours' },
      { section: 'Patterns and roster', key: 'roster.open_shift_rule' },
    ],
  },
  '3.4': { links: [], settings: [{ section: 'Location defaults', key: 'roster.min_weekly_offs', synonyms: ['weekly holiday', 'day off'] }] },
  '3.5': {
    links: [],
    settings: [
      { section: 'Late penalty', key: 'attendance.late_mark_penalty', synonyms: ['late coming', 'late marks'] },
      { section: 'Regularisation', key: 'attendance.regularise_monthly_limit', synonyms: ['missed punch', 'attendance fix'] },
      { section: 'WFH and on-duty', key: 'attendance.wfh_monthly_limit', synonyms: ['work from home'] },
      { section: 'WFH and on-duty', key: 'attendance.wfh_same_day' },
      { section: 'WFH and on-duty', key: 'attendance.presence' },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.ahead_days', synonyms: ['od'] },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.back_days' },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.send_back' },
    ],
  },
  '3.6': {
    links: ['leave.type_editor', 'leave.year_end_wizard'],
    settings: [
      { section: 'Request rules', key: 'leave.notice_days.default', synonyms: ['notice', 'apply ahead'] },
      { section: 'Request rules', key: 'leave.on_behalf.approval' },
      { section: 'Request rules', key: 'leave.send_back' },
      { section: 'Year end', key: 'leave.encashment.window', synonyms: ['encashment', 'cash in'] },
      { section: 'Year end', key: 'leave.year_end.encash_excess' },
      { section: 'Year end', key: 'leave.liability.divisor', synonyms: ['leave liability'] },
      { section: 'Company choices', key: 'leave.probation.leave', synonyms: ['probation'] },
      { section: 'Company choices', key: 'leave.comp_off.claim_within_days', synonyms: ['comp-off', 'compensatory off'] },
      { section: 'Company choices', key: 'leave.comp_off.expiry_days', synonyms: ['comp-off'] },
      { section: 'Company choices', key: 'leave.block_leave.days' },
    ],
  },
  '3.8': { links: ['holiday.calendar_editor', 'holiday.feed'], settings: [{ section: 'Rules', key: 'leave.optional_holiday.prorate_on_move', synonyms: ['optional holiday', 'transfer'] }] },
  '3.9': {
    links: [],
    settings: [
      { section: 'Leave year', key: 'leave.year_start_month', synonyms: ['financial year', 'calendar year'] },
      { section: 'Blackout dates', key: 'leave.block_dates.mode', synonyms: ['blackout'] },
    ],
  },
};

/**
 * Settings S-3 (answers 1323 to 1325): the Payroll & Statutory pages built the same way. Their changes wait for a second
 * person while "Payroll setting changes need a second person" is on (the API decides; the page says so).
 */
export const PAY_SETTINGS: Record<string, { links: string[]; settings: Place[] }> = {
  '4.3': {
    links: [],
    settings: [
      { section: 'Calculation', key: 'payroll.variance_threshold_pct', synonyms: ['variance', 'net pay change'] },
      { section: 'Calculation', key: 'payroll.net_rounding', synonyms: ['rounding'] },
      { section: 'Calculation', key: 'payroll.standard_daily_hours', synonyms: ['hourly rate'] },
      { section: 'Calculation', key: 'payroll.leave_encashment_basis', synonyms: ['encashment'] },
      { section: 'Recoveries and protected net', key: 'payroll.protected_net_percent', synonyms: ['recovery', 'deduction cap'] },
      { section: 'Recoveries and protected net', key: 'payroll.notice_shortfall', synonyms: ['notice pay', 'notice recovery'] },
      { section: 'One-time pay and holds', key: 'payroll.one_time_review_above', synonyms: ['bonus approval', 'one-time pay'] },
      { section: 'Mid-month changes', key: 'payroll.mid_period.join', synonyms: ['joiner', 'proration'] },
      { section: 'Mid-month changes', key: 'payroll.mid_period.exit', synonyms: ['leaver', 'proration'] },
      { section: 'Mid-month changes', key: 'payroll.mid_period.revision', synonyms: ['increment', 'arrears'] },
      { section: 'Mid-month changes', key: 'payroll.mid_period.cutoff_day', synonyms: ['cut-off'] },
      { section: 'Changes to these settings', key: 'payroll.settings.second_person', synonyms: ['second approver', 'maker checker', 'four eyes'] },
    ],
  },
  '4.4': {
    links: ['payslip.editor'],
    settings: [
      { section: 'PDF protection', key: 'payroll.payslip_email', synonyms: ['payslip password'] },
      { section: 'Keeping pay documents', key: 'payroll.document_retention_years', synonyms: ['retention', 'records'] },
    ],
  },
  '4.5': {
    links: [],
    settings: [
      { section: 'Regime', key: 'tax.regime_cutoff', synonyms: ['old regime', 'new regime'] },
      { section: 'Declarations and proofs', key: 'tax.proof_window_opens', synonyms: ['investment proof'] },
      { section: 'Declarations and proofs', key: 'tax.proof_cutoff', synonyms: ['investment proof'] },
    ],
  },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS: Record<string, string> = { on: 'On', off: 'Off', yes: 'Yes', no: 'No', any: 'Any time', never: 'Never', any_month: 'Any month', calendar: 'Days in the month', none: 'None', basic_da: 'Basic and DA', next_month_arrears: 'As arrears next month' };
const pretty = (key: string, o: string): string => {
  if ((key === 'leave.year_start_month' || key === 'leave.encashment.window') && /^\d+$/.test(o)) return MONTHS[Number(o) - 1]!;
  // S-3: tax dates are month-day ('05-31' is 31 May); amounts in rupees.
  if (/^\d{2}-\d{2}$/.test(o)) return `${Number(o.slice(3))} ${MONTHS[Number(o.slice(0, 2)) - 1]!.slice(0, 3)}`;
  if (key === 'payroll.one_time_review_above') return o === 'none' ? 'Never' : `₹${Number(o).toLocaleString('en-IN')}`;
  if (WORDS[o]) return WORDS[o];
  if (/^[\d.]+$/.test(o)) return o;
  const w = o.replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const isToggle = (d: RegistryDef) => d.values.length === 2 && ['on,off', 'off,on', 'yes,no', 'no,yes'].includes([...d.values].join(','));
const truthy = (d: RegistryDef) => (d.values.includes('on') ? 'on' : 'yes');
const falsy = (d: RegistryDef) => (d.values.includes('off') ? 'off' : 'no');

/** The drawn Time & Leave page with the company's settings, for SettingsPageScreen `live`. `links`: drawn editor links the viewer may open. */
export function timeSettingsPage(design: SettingsPageDef, data: TimeSettingsData, links: Set<string>): SettingsPageDef {
  const spec = TIME_SETTINGS[design.id] ?? PAY_SETTINGS[design.id];
  if (!spec) return design;
  const field = (p: Place): SettingDef | null => {
    const d = data.registry[p.key];
    if (!d) return null;
    const value = data.company[p.key] ?? d.default;
    const limit = data.limits[p.key];
    const n = data.elsewhere[p.key];
    const base: SettingDef = {
      key: p.key,
      label: d.label,
      kind: 'select',
      synonyms: p.synonyms,
      starter: value === d.default,
      scope: n ? `Company · own value at ${n} ${n === 1 ? 'place' : 'places'} (Company rules)` : 'Company',
      ...(limit ? { legal: { value: limit.max ?? limit.min!, kind: limit.max != null ? ('max' as const) : ('min' as const), statute: limit.act } } : {}),
      ...(d.guard && !data.canGuard ? { locked: 'Changed by whoever manages access (Roles & access).' } : {}),
    };
    const labels = Object.fromEntries(d.values.map((o) => [o, d.labels?.[o] ?? pretty(p.key, o)]));
    if (isToggle(d)) return { ...base, kind: 'toggle', value: value === truthy(d) };
    if (d.multi) return { ...base, kind: 'multiselect', options: [...d.values], optionLabels: labels, value: value ? value.split(',') : [] };
    return { ...base, options: [...d.values], optionLabels: labels, value };
  };
  const drawnLinks = new Map(design.sections.flatMap((s) => s.settings.filter((d) => spec.links.includes(d.key) && links.has(d.key)).map((d) => [d.key, s.title] as const)));
  const titles = [...design.sections.map((s) => s.title), ...spec.settings.map((p) => p.section).filter((t) => !design.sections.some((s) => s.title === t))];
  const sections = [...new Set(titles)].map((title) => {
    const drawn = design.sections.find((s) => s.title === title);
    const settings: SettingDef[] = [
      ...(drawn?.settings.filter((d) => drawnLinks.get(d.key) === title) ?? []),
      ...spec.settings.filter((p) => p.section === title).map(field).filter((x): x is SettingDef => x !== null),
    ];
    return { title, description: drawn?.description, tone: drawn?.tone, settings };
  });
  // The drawn note (e.g. "Changes need a second approver") describes sample data; live, the page's own state says it.
  return { ...design, note: undefined, related: undefined, scopes: undefined, sections: sections.filter((s) => s.settings.length > 0) };
}

/** The page's changes as company-wide settings, for PUT /org/settings (one each). */
export function timeSettingsChanges(values: Record<string, SettingValue>, data: TimeSettingsData): { key: string; value: string }[] {
  return Object.entries(values).flatMap(([key, v]) => {
    const d = data.registry[key];
    if (!d) return [];
    const value = typeof v === 'boolean' ? (v ? truthy(d) : falsy(d)) : Array.isArray(v) ? v.join(',') : String(v ?? '');
    return [{ key, value }];
  });
}

/** One change waiting for a second person, as GET /org/settings sends it (answer 1325). */
export interface PendingSettingChange {
  id: string;
  key: string;
  scopeType: string;
  from: unknown;
  to: unknown;
  by: string;
  at: string;
  mine: boolean;
}

/** The company-wide changes waiting for a second person on this page, in the page's own words. */
export function pendingOnPage(page: SettingsPageDef, pending: PendingSettingChange[]) {
  const fields = page.sections.flatMap((s) => s.settings);
  return pending.flatMap((p) => {
    const d = fields.find((f) => f.key === p.key);
    if (!d || p.scopeType !== 'tenant') return [];
    const words = (v: unknown) => (d.kind === 'toggle' ? (v === 'on' || v === 'yes' ? 'On' : 'Off') : (d.optionLabels?.[String(v)] ?? String(v)));
    // No company value yet: the change starts from the starter value the page shows.
    const from = p.from ?? (typeof d.value === 'boolean' ? (d.value ? 'on' : 'off') : d.value);
    return [{ id: p.id, label: d.label, from: words(from), to: words(p.to), by: p.by, at: p.at, mine: p.mine }];
  });
}
