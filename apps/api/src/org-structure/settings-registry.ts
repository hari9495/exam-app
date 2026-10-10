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
  /**
   * A second key needed to change it, on top of org.settings.manage: settings that loosen an access or fraud
   * guard belong to whoever manages access (P02 §4.2; YX-SEC-02 least privilege).
   */
  guard?: 'access.role.manage';
}

export const SETTINGS: Readonly<Record<string, SettingDef>> = {
  // YX-ORG-16: employee codes unique per legal entity (default) or across the company.
  'employee_code.scope': { label: 'Employee codes are unique', scopes: ['tenant'], dated: false, values: ['legal_entity', 'tenant'], default: 'legal_entity' },
  // YX-ORG-15: whether a new structure master starts shared or entity-only.
  'org.master.default_ownership': { label: 'New masters are', scopes: ['tenant'], dated: false, values: ['shared', 'entity_only'], default: 'shared' },
  // P06 YX-HIS-12: how far back a past-dated change may go without a System Admin override (Q5:
  // default the start of the current financial year; the company may widen it).
  // Widening it loosens a control (YX-HIS-12), so it is the access admin's (P02 §4.2, YX-SEC-02).
  'employee_change.retro_limit': { label: 'Past-dated changes may go back to', scopes: ['tenant'], dated: false, values: ['current_fy', 'previous_fy'], default: 'current_fy', guard: 'access.role.manage' },
  // M01 §3.4 / Q3 probation policy (starter values, D17): length per employment type / grade, the review
  // reminder lead, the most it may run with extensions, and auto-confirmation (off unless the company opts in).
  'probation.default_months': { label: 'Probation lasts (months)', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: false, values: ['3', '6', '9', '12'], default: '6' },
  'probation.review_lead_days': { label: 'Probation review reminder (days before the end)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '15', '30'], default: '15' },
  'probation.max_total_months': { label: 'Probation with extensions lasts at most (months)', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['6', '9', '12', '18', '24'], default: '12' },
  // Auto-confirmation is a system change with no approver (YX-SEC-11), so turning it on is the access admin's.
  'probation.auto_confirm_after_days': { label: 'Confirm automatically after the end date', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', '0', '7', '15', '30'], default: 'off', guard: 'access.role.manage' },
  // M01 §10.2 / D7 (decided 9 Oct 2026): the notice period, in calendar days (d) or months (m), dated so a resignation
  // uses the policy in force on the day it is submitted (YX-LC-04). Starter values: probation 15 days, confirmed 30.
  'exit.notice.probation': { label: 'Notice period during probation', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: true, values: ['0d', '7d', '15d', '30d', '45d', '60d', '90d', '1m', '2m', '3m'], default: '15d' },
  'exit.notice.confirmed': { label: 'Notice period once confirmed', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: true, values: ['0d', '7d', '15d', '30d', '45d', '60d', '90d', '1m', '2m', '3m'], default: '30d' },
  // P05 Q6 (decided): alumni read their own letters and documents for this many years after the last day.
  'alumni.access_years': { label: 'Alumni can read their documents for (years after leaving)', scopes: ['tenant'], dated: false, values: ['3', '5', '7', '10'], default: '7' },
  // M01 YX-LC-18 (lifecycle 6e): the rehire policy. Starter template "fresh start, same record, code and UAN"; HR may
  // change any option for one rehire with a reason.
  'rehire.code': { label: 'Rehire: employee code', scopes: ['tenant', 'legal_entity'], dated: false, values: ['reuse', 'new'], default: 'reuse' },
  'rehire.pf': { label: 'Rehire: PF membership (the UAN is always kept)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['continue', 'transfer', 'fresh'], default: 'continue' },
  'rehire.same_fy_tax': { label: 'Rehire in the same financial year: tax', scopes: ['tenant', 'legal_entity'], dated: false, values: ['combine', 'previous_employer'], default: 'combine' },
  'rehire.service': { label: 'Rehire: service', scopes: ['tenant', 'legal_entity'], dated: false, values: ['fresh', 'continuous', 'break_counted'], default: 'fresh' },
  'rehire.gratuity': { label: 'Rehire: gratuity service', scopes: ['tenant', 'legal_entity'], dated: false, values: ['fresh', 'add_prior'], default: 'fresh' },
  'rehire.leave': { label: 'Rehire: leave balance', scopes: ['tenant', 'legal_entity'], dated: false, values: ['fresh', 'carry'], default: 'fresh' },
  'rehire.probation': { label: 'Rehire: probation', scopes: ['tenant', 'legal_entity'], dated: false, values: ['normal', 'skip_if_break_lt_6m', 'never'], default: 'normal' },
  'rehire.prior_records': { label: 'Rehire: earlier warnings and PIPs', scopes: ['tenant', 'legal_entity'], dated: false, values: ['hr_only', 'manager', 'hidden'], default: 'hr_only' },
  // YX-LC-17: the absconding timeline, days of unauthorised absence for the salary hold, notice 1, notice 2, abandonment.
  'absconding.days': { label: 'Absconding timeline (days: hold, notice 1, notice 2, abandonment)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['3,7,14,21', '3,7,14,30', '5,10,20,30'], default: '3,7,14,21' },
  // YX-LC-20: retirement age (the last day is the end of that month) and how early the retirement exit opens.
  'retirement.age': { label: 'Retirement age', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: false, values: ['58', '60', '62', '65'], default: '58' },
  'retirement.alert_months': { label: 'Open the retirement exit this many months before', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '3', '6'], default: '6' },
  // YX-LC-19: at the end of a fixed-term contract: remind HR and the manager (30 and 7 days before), or also exit on the day.
  'contract_end.action': { label: 'When a fixed-term contract ends', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['alert', 'auto_exit'], default: 'alert' },
  // P02 Q2 (decided): managers view their whole reporting subtree by default; the company may narrow it.
  'access.manager.view_scope': { label: 'Managers can view', scopes: ['tenant'], dated: false, values: ['all_reports', 'direct_reports'], default: 'all_reports', guard: 'access.role.manage' },
  // P02 YX-SEC-18 (a): a role grant giving Confidential / Special access over more people than this warns first.
  'access.risk.confidential_threshold': { label: 'Warn when a grant opens Confidential data of more than (people)', scopes: ['tenant'], dated: false, values: ['5', '10', '25', '50', '100', '250'], default: '25', guard: 'access.role.manage' },
  // P02 §7 / P08: employees see who viewed their Confidential and Special data (every view is recorded either way).
  'privacy.who_accessed': { label: 'Show "Who accessed my data" to employees', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on', guard: 'access.role.manage' },
  // P02 §4.5 fraud guard: a new bank account is used for payouts only after this cooling period (starter, D17).
  'employee.bank_change.cooling_hours': { label: 'New bank accounts are used for pay after (hours)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '24', '48', '72'], default: '48', guard: 'access.role.manage' },
  // P01 §4.6 / D1 (M02): attendance mode and the missing-punch effect, both dated.
  'attendance.mode': {
    label: 'Attendance mode',
    scopes: ['tenant', 'legal_entity', 'location', 'department', 'employment_type'],
    dated: true,
    values: ['punch', 'assumed_present', 'timesheet'],
    default: 'punch',
  },
  // M02 L1: the leave year starts in this month (1 = calendar year, 4 = financial year), per company or legal entity.
  'leave.year_start_month': { label: 'Leave year starts in', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], default: '1' },
  // M02 Q5: regularisations a month with manager approval; beyond that HR approves too.
  'attendance.regularise_monthly_limit': { label: 'Fixes a month with manager approval only', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '2', '3', '4', '5', '6', '8', '10'], default: '4' },
  // M02 §B2 / YX-AT-07: the least rest between two shifts of one person; the roster flags anything shorter. Founder
  // decision 9 Oct 2026: 11 hours by default, company-configurable.
  'attendance.min_rest_hours': { label: 'Least rest between shifts (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '8', '9', '10', '11', '12'], default: '11' },
  // Founder decision 9 Oct 2026: where the Factories Act / OSH Code covers the place (a factory), approved overtime of the
  // employment categories P07 IN.FACTORIES counts as workers is always paid at the legal rate, never comp-off. Dated.
  // P08 Q4 / YX-LOCK-02: how late an employee may still ask to correct a day of a frozen or locked month (then only HR).
  'payroll.late_request_max_days': { label: 'Late corrections may be asked for up to (days)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['30', '45', '60', '90', '120', '180'], default: '60' },
  // YX-AUD-08: audit is kept at least 8 years (the list never offers less), the last 13 months online.
  'audit.retention_years': { label: 'Keep the audit log for (years)', scopes: ['tenant'], dated: false, values: ['8', '9', '10', '12', '15', '20'], default: '8', guard: 'access.role.manage' },
  // YX-DOC-13: issued pay documents are kept this long, then the file is deleted (a legal hold keeps it).
  // M03 §7.6 / YX-HIS-13 (PAY-2.05): how a change in the middle of a pay period is paid, per change type. Statutory
  // items always follow the legal basis whatever is chosen here.
  // M03 batch 5c (PAY-3.08, 3.12, §9.4): variance threshold, protected net, net rounding, standard hours, one-time review.
  'payroll.variance_threshold_pct': { label: 'Ask to confirm a net pay change above (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['5', '10', '15', '20', '25'], default: '10' },
  'payroll.protected_net_percent': { label: 'Recoveries leave at least this share of gross pay (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '10', '20', '25', '30', '40', '50'], default: '0' },
  'payroll.net_rounding': { label: 'Round net pay', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', 'rupee'], default: 'rupee' },
  'payroll.standard_daily_hours': { label: 'Standard hours a day (for hourly rates and cost rates)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8', '8.5', '9'], default: '8' },
  // PAY-4.05 (YX-NTF-15): payslips by email as a password-protected PDF (no amounts in the email); off unless the company turns it on.
  'payroll.payslip_email': { label: 'Email payslips as password-protected PDFs', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
  'payroll.one_time_review_above': { label: 'One-time pay above this amount needs approval', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', '10000', '25000', '50000', '100000'], default: '50000' },
  'payroll.mid_period.join': { label: 'Joining in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff', 'next_month_arrears'], default: 'segments' },
  'payroll.mid_period.exit': { label: 'Leaving in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff'], default: 'segments' },
  'payroll.mid_period.revision': { label: 'A pay change in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff', 'next_month_arrears'], default: 'segments' },
  'payroll.mid_period.cutoff_day': { label: 'Whole-month cut-off day (changes after it are paid next month)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['10', '15', '20', '25'], default: '15' },
  'payroll.document_retention_years': { label: 'Keep issued pay documents for (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8', '10', '12', '15'], default: '8', guard: 'access.role.manage' },
  'attendance.factories_act': {
    label: 'Factories Act (overtime is paid at the legal rate)',
    scopes: ['tenant', 'legal_entity', 'location', 'department', 'employment_type'],
    dated: true,
    values: ['covered', 'not_covered'],
    default: 'not_covered',
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
