// Settings 6.1 Hiring made live (founder answers 291 and 302): the designed 6.1 page with the company's values. Each
// designed field with a company setting behind it is filled from the API; designed fields with nothing behind them yet
// are left out (they are listed in docs/yukthix/hiring-design-map.md), never shown with sample values.
import { formatINR } from '../../lib/format';
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /hiring/settings. */
export interface HiringSettingsData {
  canEdit: boolean;
  /** Active people of the company (the default recruiter's choices). */
  people: { id: string; name: string }[];
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
  pipelines: { id: string; name: string; isDefault: boolean; jobs: number; stages: { id: string; name: string; category: string; daysTarget: number | null; limit: number | null }[] }[];
  scorecards: { id: string; name: string; scaleMax: number; items: string[] }[];
}

/** Designed field → company setting. */
const KEY = {
  'hire.default_recruiter': 'hiring.requisition.default_recruiter',
  'hire.retention_months': 'ats.retention_months',
  'hire.not_selected_notice': 'hiring.reject.email_candidate',
} as const;
const BONUS = 'ats.referral.bonus_inr';
const DAYS = 'ats.referral.qualify_days';
/** The designed fields that are live; everything else on the designed page is left out. */
const LIVE_FIELDS = new Set(['hire.pipelines', 'hire.scorecards', 'hire.referral_rules', ...Object.keys(KEY)]);

const bonusLabel = (v: string) => formatINR(Number(v));
const daysLabel = (v: string) => `${v} days`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The designed 6.1 page with the company's values, for SettingsPageScreen `live`. */
export function hiringSettingsPage(design: SettingsPageDef, data: HiringSettingsData): SettingsPageDef {
  const people = data.people.map((p) => ({ value: p.id, label: p.name }));
  const v = data.values;
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE_FIELDS.has(d.key)) return null;
    const base = { ...d, overrides: undefined, dated: undefined, scope: 'Company' };
    switch (d.key) {
      case 'hire.pipelines':
        return {
          ...base,
          readOnlyList: true,
          rows: data.pipelines.map((p) => [p.name, p.stages.map((s) => s.name).join(', '), [p.isDefault ? 'Default for new jobs' : null, plural(p.jobs, 'job')].filter(Boolean).join(' · ')]),
          starter: false,
          // Answer 302: each pipeline's days target and limit per stage are changed here (the pipelines key).
          helper: 'Stage targets: an optional days target and a limit per stage. The board shows a card in amber once it is over the days target. Nothing is blocked.',
        };
      case 'hire.scorecards':
        return { ...base, readOnlyList: true, rowAction: undefined, starter: false, rows: data.scorecards.map((s) => [s.name, s.items.join(', ') || 'None yet', `1–${s.scaleMax}`]) };
      case 'hire.default_recruiter': {
        const k = KEY[d.key];
        const options = ['none', ...people.map((p) => p.value)];
        const value = options.includes(v[k]!) ? v[k]! : 'none';
        return { ...base, kind: 'select', options, optionLabels: { none: 'None', ...Object.fromEntries(people.map((p) => [p.value, p.label])) }, value, starter: value === data.defaults[k] };
      }
      case 'hire.retention_months': {
        const k = KEY[d.key];
        const options = data.choices[k] ?? [];
        return {
          ...base,
          kind: 'select',
          options,
          optionLabels: Object.fromEntries(options.map((o) => [o, `${o} months`])),
          unit: undefined,
          min: undefined,
          max: undefined,
          value: v[k]!,
          starter: v[k] === data.defaults[k],
          helper: 'After this many months without activity, a candidate who was not hired is anonymised; funnel counts are kept. The law (DPDP Act, 2023 s.8(7)) says to erase data once its purpose is served; YukthiX caps this at 36 months.',
        };
      }
      case 'hire.not_selected_notice': {
        const k = KEY[d.key];
        return { ...base, value: v[k] === 'on', starter: v[k] === data.defaults[k], helper: 'On: rejecting a candidate on the pipeline board emails them after 24 hours (the Rejected stage’s email), and the rejection can be undone until then. Off: the candidate is told nothing.' };
      }
      case 'hire.referral_rules':
        return {
          ...base,
          fixedRows: true,
          addLabel: undefined,
          lockedColumns: ['Roles', 'Paid through'],
          columnOptions: { Bonus: (data.choices[BONUS] ?? []).map(bonusLabel), 'Paid after': (data.choices[DAYS] ?? []).map(daysLabel) },
          rows: [['All roles', bonusLabel(v[BONUS]!), daysLabel(v[DAYS]!), 'Payroll, or outside payroll']],
          starter: v[BONUS] === data.defaults[BONUS] && v[DAYS] === data.defaults[DAYS],
          helper: 'The bonus for a hire someone referred, and the days they must complete before it is due. Each referral keeps the bonus in force when it was made.',
        };
    }
    return null;
  };
  return {
    ...design,
    summary: 'Pipeline and scorecard templates with stage targets, the default recruiter for new requisitions, candidate data retention, telling candidates who are not selected, and referral bonuses.',
    related: undefined,
    scopes: undefined,
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /hiring/settings. */
export function hiringSettingsChanges(values: Record<string, SettingValue>, rows: Record<string, string[][]>, data: HiringSettingsData): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [field, value] of Object.entries(values)) {
    const key = KEY[field as keyof typeof KEY];
    if (!key) continue;
    out.push({ key, value: field === 'hire.not_selected_notice' ? (value === true ? 'on' : 'off') : String(value ?? 'none') });
  }
  const rule = rows['hire.referral_rules']?.[0];
  if (rule) {
    const bonus = (data.choices[BONUS] ?? []).find((c) => bonusLabel(c) === rule[1]);
    const days = (data.choices[DAYS] ?? []).find((c) => daysLabel(c) === rule[2]);
    if (bonus && bonus !== data.values[BONUS]) out.push({ key: BONUS, value: bonus });
    if (days && days !== data.values[DAYS]) out.push({ key: DAYS, value: days });
  }
  return out;
}
