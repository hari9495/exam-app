// P01 §4.6 scoped settings. Every key is registered here with its allowed scopes, whether it is dated, its
// values and its product default (a starter value, spec D17). Modules add their keys as they are built.

/** Most specific first (YX-ORG-18). */
export const SCOPE_ORDER = ['employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'pay_group', 'legal_entity', 'tenant'] as const;
export type ScopeType = (typeof SCOPE_ORDER)[number];

export interface SettingDef {
  label: string;
  scopes: readonly ScopeType[];
  /** Dated settings carry valid_from and resolve as of the date processed, never "today" (YX-ORG-18). */
  dated: boolean;
  values: readonly string[];
  default: string;
}

export const SETTINGS: Readonly<Record<string, SettingDef>> = {
  // YX-ORG-16: employee codes unique per legal entity (default) or across the company.
  'employee_code.scope': { label: 'Employee codes are unique', scopes: ['tenant'], dated: false, values: ['legal_entity', 'tenant'], default: 'legal_entity' },
  // YX-ORG-15: whether a new structure master starts shared or entity-only.
  'org.master.default_ownership': { label: 'New masters are', scopes: ['tenant'], dated: false, values: ['shared', 'entity_only'], default: 'shared' },
  // P06 YX-HIS-12: how far back a past-dated change may go without a System Admin override (Q5:
  // default the start of the current financial year; the company may widen it).
  'employee_change.retro_limit': { label: 'Past-dated changes may go back to', scopes: ['tenant'], dated: false, values: ['current_fy', 'previous_fy'], default: 'current_fy' },
  // M01 §3.4 / Q3 probation policy (starter values, D17): length per employment type / grade, the review
  // reminder lead, the most it may run with extensions, and auto-confirmation (off unless the company opts in).
  'probation.default_months': { label: 'Probation lasts (months)', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: false, values: ['3', '6', '9', '12'], default: '6' },
  'probation.review_lead_days': { label: 'Probation review reminder (days before the end)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '15', '30'], default: '15' },
  'probation.max_total_months': { label: 'Probation with extensions lasts at most (months)', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['6', '9', '12', '18', '24'], default: '12' },
  'probation.auto_confirm_after_days': { label: 'Confirm automatically after the end date', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', '0', '7', '15', '30'], default: 'off' },
  // P01 §4.6 / D1 (M02): attendance mode and the missing-punch effect, both dated.
  'attendance.mode': {
    label: 'Attendance mode',
    scopes: ['tenant', 'legal_entity', 'location', 'department', 'employment_type'],
    dated: true,
    values: ['punch', 'assumed_present', 'timesheet'],
    default: 'punch',
  },
  'attendance.missing_punch_effect': {
    label: 'Missing punches',
    scopes: ['tenant', 'legal_entity', 'location', 'department', 'employment_type'],
    dated: true,
    values: ['block_payroll_approval', 'warning_only'],
    default: 'block_payroll_approval',
  },
};

export interface SettingRow {
  id: string;
  scopeType: string;
  scopeId: string;
  value: unknown;
  /** YYYY-MM-DD, dated keys only. */
  validFrom: string | null;
}

export type ScopeContext = Partial<Record<ScopeType, string>>;

export interface Resolved {
  value: unknown;
  /** Where the value comes from (YX-ORG-12): the override row, or the product default. */
  source: { scopeType: ScopeType; scopeId: string; validFrom: string | null; settingId: string } | { scopeType: 'default' };
}

/**
 * The most specific override for `context` (YX-ORG-18). For a dated key, only rows in force on `asOf`
 * count, the latest valid_from winning within a scope.
 */
export function resolveSetting(def: SettingDef, rows: readonly SettingRow[], context: ScopeContext, asOf: string | null): Resolved {
  for (const scopeType of SCOPE_ORDER) {
    const scopeId = context[scopeType];
    if (!scopeId || !def.scopes.includes(scopeType)) continue;
    const candidates = rows.filter((r) => r.scopeType === scopeType && r.scopeId === scopeId && (!def.dated || (r.validFrom !== null && asOf !== null && r.validFrom <= asOf)));
    if (candidates.length === 0) continue;
    const row = candidates.reduce((a, b) => ((a.validFrom ?? '') >= (b.validFrom ?? '') ? a : b));
    return { value: row.value, source: { scopeType, scopeId, validFrom: row.validFrom, settingId: row.id } };
  }
  return { value: def.default, source: { scopeType: 'default' } };
}
