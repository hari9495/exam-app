// Settings 6.1 Hiring made live (founder answers 291, 302, 341, 345 and 348): the designed 6.1 page with the company's values. Each
// designed field with a company setting behind it is filled from the API; designed fields with nothing behind them yet
// are left out (they are listed in docs/yukthix/hiring-design-map.md), never shown with sample values.
import { formatINR } from '../../lib/format';
import type { ScorecardTemplateView } from '../hiring/live/types';
import { asPerCent } from '../hiring/scorecard-template-sheet';
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /hiring/settings. */
export interface HiringSettingsData {
  canEdit: boolean;
  /** Active people of the company with the recruiter key (the default recruiter's choices, answer 348). */
  people: { id: string; name: string }[];
  /** The stored default recruiter no longer qualifies (left, or lost the key): their name; the value reads as none. */
  staleRecruiter?: string | null;
  values: Record<string, string>;
  defaults: Record<string, string>;
  choices: Record<string, string[]>;
  lastChange: { by: string; at: string; what: string } | null;
  pipelines: { id: string; name: string; isDefault: boolean; jobs: number; stages: { id: string; name: string; category: string; daysTarget: number | null; limit: number | null }[] }[];
  scorecards: ScorecardTemplateView[];
  /** HIR-09 answer 332: people who may approve an offer above the range (they hold the offer-pay key). */
  offerApprovers?: { id: string; name: string }[];
  /** HIR-09 answer 337: each offer letter template and its e-sign switch. */
  offerLetters?: { id: string; name: string; esign: boolean }[];
}

/** Designed field → company setting. */
const KEY = {
  'hire.default_recruiter': 'hiring.requisition.default_recruiter',
  'hire.retention_months': 'ats.retention_months',
  'hire.not_selected_notice': 'hiring.reject.email_candidate',
  'hire.band_approver': 'hiring.offer.band_approver',
  'hire.clawback_basis': 'hiring.offer.clawback_basis',
  'hire.headcount_plan': 'ats.headcount_plan',
  'hire.plan_manager_view': 'ats.headcount_plan.manager_view',
  'hire.pay_range_show': 'hiring.pay_range.show',
  'hire.pay_history_ask': 'hiring.pay_history.ask',
  'hire.rediscovery_ai': 'hiring.rediscovery.ai',
  'hire.rehire_blocks_screening': 'hiring.rehire_flag.blocks_screening',
  'hire.referral_self_apply_days': 'ats.referral.self_apply_days',
  // HIR-13 (founder decision 6).
  'hire.internal_after_probation': 'hiring.internal.after_probation',
  'hire.internal_months_in_role': 'hiring.internal.months_in_role',
  'hire.internal_tell_manager': 'hiring.internal.tell_manager',
  // HIR-25 (founder decision 2).
  'hire.notetaker_enabled': 'hiring.notetaker.enabled',
  'hire.notetaker_ai_draft': 'hiring.notetaker.ai_draft',
  'hire.notetaker_keep_days': 'hiring.notetaker.keep_days',
  'hire.bgv_decider_other_person': 'hiring.bgv.decider_other_person',
} as const;
/** On/off fields: the stored value for on and for off. */
const TOGGLE: Partial<Record<keyof typeof KEY, [on: string, off: string]>> = {
  'hire.not_selected_notice': ['on', 'off'],
  'hire.plan_manager_view': ['own_department', 'off'],
  'hire.pay_range_show': ['on', 'off'],
  'hire.pay_history_ask': ['on', 'off'],
  'hire.rediscovery_ai': ['on', 'off'],
  'hire.rehire_blocks_screening': ['on', 'off'],
  'hire.internal_after_probation': ['on', 'off'],
  'hire.notetaker_enabled': ['on', 'off'],
  'hire.notetaker_ai_draft': ['on', 'off'],
  'hire.bgv_decider_other_person': ['on', 'off'],
};
const BASIS: Record<string, string> = { full: 'All of it', pro_rata: 'The part for the months not served' };
const BONUS = 'ats.referral.bonus_inr';
const DAYS = 'ats.referral.qualify_days';
/** The designed fields that are live; everything else on the designed page is left out. */
const LIVE_FIELDS = new Set(['hire.pipelines', 'hire.scorecards', 'hire.referral_rules', 'hire.offer_esign', ...Object.keys(KEY)]);

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
        // Answer 345: Add and Edit open the scorecard template sheet (listEditors) for people with the pipelines key.
        return {
          ...base,
          readOnlyList: true,
          rowAction: undefined,
          starter: false,
          rows: data.scorecards.map((s) => {
            const pc = asPerCent(s.items.map((i) => i.weight));
            return [s.name, s.items.map((i, k) => `${i.label} ${pc[k]} %`).join(', ') || 'None yet', `1–${s.scaleMax}`, String(s.passBar)];
          }),
        };
      case 'hire.default_recruiter': {
        const k = KEY[d.key];
        const options = ['none', ...people.map((p) => p.value)];
        const value = options.includes(v[k]!) ? v[k]! : 'none';
        // Answer 348: a stored default who no longer holds the key (or left) is treated as none, and said so.
        const warning = data.staleRecruiter ? `${data.staleRecruiter} no longer holds the recruiter key or has left, so new requisitions start with no recruiter. Choose someone else or None.` : undefined;
        return { ...base, kind: 'select', options, optionLabels: { none: 'None', ...Object.fromEntries(people.map((p) => [p.value, p.label])) }, value, warning, starter: value === data.defaults[k] && !warning };
      }
      case 'hire.headcount_plan':
      case 'hire.internal_months_in_role':
      case 'hire.notetaker_keep_days':
      case 'hire.internal_tell_manager':
      case 'hire.referral_self_apply_days': {
        const k = KEY[d.key];
        return { ...base, options: data.choices[k] ?? d.options, value: v[k]!, starter: v[k] === data.defaults[k] };
      }
      case 'hire.plan_manager_view':
      case 'hire.pay_range_show':
      case 'hire.pay_history_ask':
      case 'hire.rediscovery_ai':
      case 'hire.rehire_blocks_screening':
      case 'hire.internal_after_probation':
      case 'hire.notetaker_enabled':
      case 'hire.notetaker_ai_draft':
      case 'hire.bgv_decider_other_person': {
        const k = KEY[d.key];
        return { ...base, value: v[k] === TOGGLE[d.key]![0], starter: v[k] === data.defaults[k] };
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
        return { ...base, value: v[k] === TOGGLE[d.key]![0], starter: v[k] === data.defaults[k], helper: 'On: rejecting a candidate on the pipeline board emails them after 24 hours (the Rejected stage’s email), and the rejection can be undone until then. Off: the candidate is told nothing.' };
      }
      case 'hire.band_approver': {
        const k = KEY[d.key];
        const approvers = (data.offerApprovers ?? []).map((p) => ({ value: p.id, label: p.name }));
        const options = ['hr_head', 'hiring_manager', ...approvers.map((p) => p.value)];
        const value = options.includes(v[k]!) ? v[k]! : 'hr_head';
        return { ...base, kind: 'select', options, optionLabels: { hr_head: 'HR head', hiring_manager: 'Hiring manager', ...Object.fromEntries(approvers.map((p) => [p.value, p.label])) }, value, starter: value === data.defaults[k] };
      }
      case 'hire.clawback_basis': {
        const k = KEY[d.key];
        return { ...base, options: ['full', 'pro_rata'], optionLabels: BASIS, value: v[k] ?? 'full', starter: v[k] === data.defaults[k] };
      }
      case 'hire.offer_esign': {
        const letters = data.offerLetters ?? [];
        if (!letters.length) return null;
        return { ...base, options: letters.map((l) => l.id), optionLabels: Object.fromEntries(letters.map((l) => [l.id, l.name])), value: letters.filter((l) => l.esign).map((l) => l.id), starter: letters.every((l) => !l.esign) };
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
    summary: 'Pipeline and scorecard templates with stage targets, the default recruiter, the headcount plan, pay transparency, rehire, background-check and candidate data rules, AI notes on past candidates, telling candidates who are not selected, offers (the approver above the pay range, joining bonus clawback, e-signed letters), referral bonuses, who can apply for internal jobs, and the interview notetaker.',
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
    const toggle = TOGGLE[field as keyof typeof KEY];
    const empty = field === 'hire.clawback_basis' ? 'full' : field === 'hire.band_approver' ? 'hr_head' : 'none';
    out.push({ key, value: toggle ? toggle[value === true ? 0 : 1] : String(value ?? empty) });
  }
  // HIR-09 answer 337: each offer letter whose e-sign switch changed ('offer_template.esign' = '<id>:on|off').
  const chosen = values['hire.offer_esign'];
  if (Array.isArray(chosen))
    for (const l of data.offerLetters ?? []) if (chosen.includes(l.id) !== l.esign) out.push({ key: 'offer_template.esign', value: `${l.id}:${chosen.includes(l.id) ? 'on' : 'off'}` });
  const rule = rows['hire.referral_rules']?.[0];
  if (rule) {
    const bonus = (data.choices[BONUS] ?? []).find((c) => bonusLabel(c) === rule[1]);
    const days = (data.choices[DAYS] ?? []).find((c) => daysLabel(c) === rule[2]);
    if (bonus && bonus !== data.values[BONUS]) out.push({ key: BONUS, value: bonus });
    if (days && days !== data.values[DAYS]) out.push({ key: DAYS, value: days });
  }
  return out;
}

