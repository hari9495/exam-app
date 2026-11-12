// Settings S-2 (founder answers 1323, 1324): the drawn Time & Leave pages made live with the company's settings. Every
// setting that worked with its starter value but had no screen now has a field on its drawn page, marked "Starter
// default" until HR changes it; a legal floor or ceiling comes from the country's rule set and blocks saving, naming the
// Act. The drawn links to the live editors (shifts, leave types, holidays...) stay; drawn fields with no setting behind
// them yet are left out until their slice. Values are read from GET /org/settings and saved with PUT /org/settings.
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
  '3.11': { links: ['prj.projects'], settings: [{ section: 'Pre-fill from work tools', key: 'timesheet.tool_suggestions', synonyms: ['calendar', 'jira'] }] },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS: Record<string, string> = { on: 'On', off: 'Off', yes: 'Yes', no: 'No', any: 'Any time', never: 'Never', any_month: 'Any month', calendar: 'Days in the month' };
const pretty = (key: string, o: string): string => {
  if ((key === 'leave.year_start_month' || key === 'leave.encashment.window') && /^\d+$/.test(o)) return MONTHS[Number(o) - 1]!;
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
  const spec = TIME_SETTINGS[design.id];
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
  return { ...design, related: undefined, scopes: undefined, sections: sections.filter((s) => s.settings.length > 0) };
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
