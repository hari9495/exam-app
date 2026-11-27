// Settings S-2 (founder answers 1323, 1324): the drawn Time & Leave pages made live with the company's settings. Every
// setting that worked with its starter value but had no screen now has a field on its drawn page, marked "Starter
// default" until HR changes it; a legal floor or ceiling comes from the country's rule set and blocks saving, naming the
// Act. The drawn links to the live editors (shifts, leave types, holidays...) stay; drawn fields with no setting behind
// them yet are left out until their slice. Values are read from GET /org/settings and saved with PUT /org/settings.
// 3.11's one hidden setting (timesheet.tool_suggestions) is on the Projects settings page (projects-live.ts).
import type { LastChange, SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** One registry entry as GET /org/settings sends it. */
export interface RegistryDef {
  label: string;
  values: readonly string[];
  default: string;
  labels?: Record<string, string>;
  multi?: true;
  guard?: string;
  /** Dated (S-4): a change applies from today; earlier days keep the old value. */
  dated?: boolean;
  /** Where it may have values of its own (registry scopes: tenant, legal_entity, location, employment_type, grade...). */
  scopes?: readonly string[];
  /** Short text HR writes (one thing a line), up to this many characters. */
  text?: { maxLength: number };
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
  /**
   * Settings S-7 (answer 1484): "Different for" on the page. The places a value of its own may be set for (entities,
   * locations, employment types, grades), and the values of their own already set, by key.
   */
  scopes?: { label: string; type: string; id: string }[];
  byScope?: Record<string, { scope: string; value: string; validFrom: string | null; note?: string }[]>;
}

/**
 * `list` (answer 2123): a comma-list setting shown as a table, one row a value (the first column), with the drawn column
 * names; the page saves the rows back as the comma list (timeSettingsListChanges).
 */
type Place = { section: string; key: string; synonyms?: string[]; list?: { columns: string[]; addLabel: string; helper?: string } };
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
      // S-7 (answer 1321): from Company rules.
      { section: 'Flexi and split shifts', key: 'attendance.shift_types.flexi', synonyms: ['flexi'] },
      { section: 'Flexi and split shifts', key: 'attendance.shift_types.split', synonyms: ['split shift'] },
      { section: 'Flexi and split shifts', key: 'attendance.flexi.late_from' },
      { section: 'Flexi and split shifts', key: 'attendance.flexi.short_by' },
      { section: 'Flexi and split shifts', key: 'attendance.split.min_gap_minutes' },
    ],
  },
  // S-7 (answer 1321): 3.1 Attendance modes, from Company rules.
  '3.1': {
    links: [],
    settings: [
      { section: 'Attendance', key: 'attendance.mode', synonyms: ['attendance mode'] },
      { section: 'Attendance', key: 'attendance.missing_punch_effect', synonyms: ['missing punch'] },
      { section: 'Attendance', key: 'attendance.factories_act', synonyms: ['factories act'] },
    ],
  },
  '3.4': { links: [], settings: [{ section: 'Location defaults', key: 'roster.min_weekly_offs', synonyms: ['weekly holiday', 'day off'] }] },
  '3.5': {
    links: [],
    settings: [
      { section: 'Late penalty', key: 'attendance.late_mark_penalty', synonyms: ['late coming', 'late marks'] },
      // Batch C item 16: the Short hours and Breaks reports.
      { section: 'Short hours and breaks', key: 'attendance.short_hours.band1', synonyms: ['short hours', 'negligence', 'under hours'] },
      { section: 'Short hours and breaks', key: 'attendance.short_hours.band2' },
      { section: 'Short hours and breaks', key: 'attendance.short_hours.band3' },
      { section: 'Short hours and breaks', key: 'attendance.frequent_breaks.count', synonyms: ['breaks', 'frequent breaks'] },
      { section: 'Short hours and breaks', key: 'attendance.frequent_breaks.minutes' },
      { section: 'Regularisation', key: 'attendance.regularise_monthly_limit', synonyms: ['missed punch', 'attendance fix'] },
      { section: 'WFH and on-duty', key: 'attendance.wfh_monthly_limit', synonyms: ['work from home'] },
      { section: 'WFH and on-duty', key: 'attendance.wfh_same_day' },
      { section: 'WFH and on-duty', key: 'attendance.day_place_rule', synonyms: ['office or remote', 'hybrid', 'remote'] },
      { section: 'WFH and on-duty', key: 'attendance.presence' },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.ahead_days', synonyms: ['od'] },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.back_days' },
      { section: 'WFH and on-duty', key: 'attendance.on_duty.send_back' },
      { section: 'Hourly permission', key: 'attendance.permission.monthly_limit', synonyms: ['permission', 'short leave', 'hours off'] },
      { section: 'Hourly permission', key: 'attendance.permission.max_minutes' },
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
      { section: 'Company choices', key: 'leave.comp_off.auto_from_roster', synonyms: ['comp-off', 'roster'] },
      { section: 'Company choices', key: 'leave.overview.no_leave_days', synonyms: ['no leave taken', 'team overview'] },
      { section: 'Company choices', key: 'leave.block_leave.days' },
      { section: 'Company choices', key: 'leave.block_leave.next_year_days', synonyms: ['block leave', 'next year'] },
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
      { section: 'Back-dated pay', key: 'payroll.arrears.auto_draft', synonyms: ['arrears', 'back-dated', 'retro pay'] },
      { section: 'Changes to these settings', key: 'payroll.settings.second_person', synonyms: ['second approver', 'maker checker', 'four eyes'] },
      { section: 'Changes to these settings', key: 'payroll.settings.lapse_days', synonyms: ['expire', 'pending change'] },
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
  // S-7 (answers 1321, 1521): 4.6 with Payroll rules' bonus, loan and reports-access settings, under the second person.
  '4.6': {
    links: [],
    settings: [
      { section: 'Statutory bonus', key: 'payroll.bonus.eligibility_rate_on', synonyms: ['bonus'] },
      { section: 'Statutory bonus', key: 'payroll.bonus.eligibility_wage' },
      { section: 'Statutory bonus', key: 'payroll.bonus.calculation_ceiling' },
      { section: 'Statutory bonus', key: 'payroll.bonus.min_rate' },
      { section: 'Statutory bonus', key: 'payroll.bonus.max_rate' },
      { section: 'Statutory bonus', key: 'payroll.bonus.min_working_days' },
      { section: 'Statutory bonus', key: 'payroll.bonus.min_amount' },
      { section: 'Statutory bonus', key: 'payroll.bonus.allocable_percent' },
      { section: 'Statutory bonus', key: 'payroll.bonus.carry_years' },
      { section: 'Statutory bonus', key: 'payroll.bonus.year_start_month' },
      { section: 'Statutory bonus', key: 'payroll.bonus.due_months' },
      { section: 'Loans and advances', key: 'payroll.loan.max_gross_months', synonyms: ['loan', 'advance'] },
      { section: 'Loans and advances', key: 'payroll.loan.after_probation' },
      { section: 'Loans and advances', key: 'payroll.loan.interest_rate.advance' },
      { section: 'Loans and advances', key: 'payroll.loan.interest_rate.loan' },
      { section: 'Payroll reports access', key: 'payroll.reports_access.days', synonyms: ['reports access'] },
    ],
  },
  // Enterprise E4 (O19-O22, answers 2653-2655): the ledger mapping (its own screen), suspense, costing and the export format.
  '4.12': {
    links: ['ledger.mapping'],
    settings: [
      { section: 'Suspense', key: 'payroll.journal.suspense', synonyms: ['unmapped', 'suspense account'] },
      { section: 'Costing', key: 'payroll.costing.split', synonyms: ['cost allocation', 'project costing', 'cost centre split'] },
      { section: 'Export', key: 'payroll.journal.format', synonyms: ['SAP', 'Oracle', 'Tally', 'Zoho', 'journal file'] },
    ],
  },
};

/** Settings S-7 (answer 1321): the Organisation, Documents and Account pages that hold settings from Company rules. */
export const MORE_SETTINGS: Record<string, { links: string[]; settings: Place[]; related?: { label: string; screenId: string }[] }> = {
  '1.1': {
    links: [],
    settings: [
      { section: 'Working week and language', key: 'work.normal_week_hours', synonyms: ['full-time week'] },
      { section: 'Working week and language', key: 'people.language', synonyms: ['language'] },
    ],
  },
  '1.5': {
    links: [],
    settings: [
      { section: 'Employee records', key: 'employee.personal.required', synonyms: ['required fields'] },
      { section: 'Work permits and visas', key: 'work_auth.reminder_days', synonyms: ['visa', 'work permit'] },
    ],
  },
  '1.6': { links: [], settings: [{ section: 'Set-up hub', key: 'setup.hub.time' }, { section: 'Set-up hub', key: 'setup.hub.payroll' }] },
  '5.7': {
    links: [],
    settings: [
      { section: 'Company policies', key: 'policy.ack.due_days', synonyms: ['acknowledge'] },
      { section: 'Company policies', key: 'policy.reminder.every_days' },
      { section: 'Company policies', key: 'policy.reminder.manager_after_days' },
      { section: 'Company policies', key: 'policy.reack.default' },
      { section: 'Company policies', key: 'policy.ack.typed_name' },
      { section: 'Company policies', key: 'policy.publish.second_person' },
      { section: 'Company policies', key: 'policy.ai_writer', synonyms: ['AI policy'] },
      { section: 'Company policies', key: 'company.industry', synonyms: ['industry'] },
      // Batch G2 item 100 (M09 Q2): the feed's moderation choices.
      { section: 'Engage feed', key: 'engage.blocked_words', synonyms: ['blocked words', 'moderation', 'feed'] },
      { section: 'Engage feed', key: 'engage.hide_after_reports', synonyms: ['reports', 'hide posts'] },
      // Batch G2 item 73: the company values and badges of kudos.
      { section: 'Engage feed', key: 'engage.values', synonyms: ['company values', 'kudos'] },
      { section: 'Engage feed', key: 'engage.badges', synonyms: ['badges', 'kudos'] },
      // Batch G2 item 74: survey results are shown only for groups this big or bigger.
      { section: 'Engage feed', key: 'engage.survey.min_group', synonyms: ['surveys', 'anonymous', 'smallest group'] },
      // Batch G2 item 76: which celebrations the feed shows.
      { section: 'Engage feed', key: 'engage.celebrate.birthdays', synonyms: ['birthdays', 'celebrations'] },
      { section: 'Engage feed', key: 'engage.celebrate.anniversaries', synonyms: ['work anniversary', 'celebrations'] },
      { section: 'Engage feed', key: 'engage.celebrate.new_joiners', synonyms: ['new joiners', 'welcome'] },
      // Learning (M07): the attendance share for new courses, the manager's training check, and overdue escalation (2609).
      { section: 'Learning', key: 'learning.attendance_share', synonyms: ['attendance', 'sessions', 'training'] },
      { section: 'Learning', key: 'learning.check_after_days', synonyms: ['training check', 'manager check'] },
      { section: 'Learning', key: 'learning.overdue.manager_days', synonyms: ['overdue', 'mandatory training', 'escalation'] },
      { section: 'Learning', key: 'learning.overdue.hr_days', synonyms: ['overdue', 'mandatory training', 'escalation'] },
      // Answer 2781: SCORM upload limits.
      { section: 'Learning', key: 'learning.scorm.max_zip_mb', synonyms: ['scorm', 'package', 'upload size'] },
      { section: 'Learning', key: 'learning.scorm.max_unzipped_mb', synonyms: ['scorm', 'package', 'zip'] },
      { section: 'Learning', key: 'learning.scorm.max_files', synonyms: ['scorm', 'package', 'zip'] },
      { section: 'Learning', key: 'learning.scorm.max_ratio', synonyms: ['scorm', 'zip bomb', 'compression'] },
    ],
  },
  '8.6': { links: [], settings: [{ section: 'Help', key: 'help.whats_new.show', synonyms: ["what's new"] }, { section: 'Help', key: 'help.tours.show', synonyms: ['tours'] }] },
  // Settings S-8: 5.4 Notifications, the company switches for the channels that exist (in-app and email); the wording
  // stays on its editor (PLT-13, Emails).
  '5.4': {
    links: ['ntf.templates'],
    settings: [
      { section: 'Channels and defaults', key: 'notify.email.enabled', synonyms: ['notification channel', 'email notifications'] },
      // T2-E 52 (answer 2877): push through the installable web app.
      { section: 'Channels and defaults', key: 'notify.push.enabled', synonyms: ['push', 'push notifications', 'web app'] },
      { section: 'Digests and quiet hours', key: 'notify.email.default_cadence', synonyms: ['digest default', 'new people'] },
      { section: 'Digests and quiet hours', key: 'notify.digest.time', synonyms: ['summary email', 'digest'] },
      // T2-E 51 (answer 2874): the Home cards for a window that is closing, each kind on or off for the company.
      { section: 'Home reminders', key: 'home.reminders.tax_declarations', synonyms: ['tax declaration', 'reminder', 'nudge'] },
      { section: 'Home reminders', key: 'home.reminders.tax_proofs', synonyms: ['tax proof', 'investment proof', 'reminder'] },
      { section: 'Home reminders', key: 'home.reminders.tax_regime', synonyms: ['tax regime', 'reminder'] },
      { section: 'Home reminders', key: 'home.reminders.review', synonyms: ['self-review', 'manager review', 'reminder'] },
      { section: 'Home reminders', key: 'home.reminders.survey', synonyms: ['survey', 'pulse', 'reminder'] },
      { section: 'Home reminders', key: 'home.reminders.sent_back', synonyms: ['sent back', 'request', 'reminder'] },
    ],
  },
  // Settings S-8 (answer 1323): 4.8 Expenses & travel with the 14 company choices that had no screen; the policy matrix
  // stays on its own editor (EXP-07). Expense set-up (expense.policy.manage) changes them too.
  '4.8': {
    links: ['exp.policy_matrix_editor'],
    settings: [
      { section: 'Receipts, OCR and GST', key: 'expense.gst.capture', synonyms: ['GST', 'input tax credit', 'GSTIN'] },
      { section: 'Receipts, OCR and GST', key: 'expense.fx_tolerance_pct', synonyms: ['forex', 'currency', 'exchange rate'] },
      { section: 'Approval and finance check', key: 'expense.cc_owner_above', synonyms: ['cost centre owner'] },
      { section: 'Approval and finance check', key: 'expense.finance_audit', synonyms: ['finance check', 'audit'] },
      { section: 'Approval and finance check', key: 'expense.claim_window_days', synonyms: ['old bills'] },
      { section: 'Over-limit and payment', key: 'expense.route.default', synonyms: ['reimbursement', 'pay claims'] },
      { section: 'Over-limit and payment', key: 'expense.route.payout_above', synonyms: ['direct payout'] },
      { section: 'Over-limit and payment', key: 'expense.payroll_cutoff_day', synonyms: ['payroll cut-off'] },
      { section: 'Advances, travel and cards', key: 'expense.advance.enabled', synonyms: ['advances on', 'advances off', 'imprest'] },
      { section: 'Advances, travel and cards', key: 'expense.advance.cap', synonyms: ['advance limit', 'advance cap', 'grade'] },
      { section: 'Advances, travel and cards', key: 'expense.advance.settle_days', synonyms: ['advance settlement', 'imprest'] },
      { section: 'Advances, travel and cards', key: 'expense.advance.recovery_instalments' },
      { section: 'Advances, travel and cards', key: 'expense.card.match_amount_within', synonyms: ['corporate card', 'card statement'] },
      { section: 'Advances, travel and cards', key: 'expense.card.match_days' },
      { section: 'Advances, travel and cards', key: 'expense.card.reminder_days' },
      { section: 'Advances, travel and cards', key: 'expense.card.recovery_instalments' },
    ],
  },
  // S-8 (answer 1323): 6.3 Performance with its 19 company choices; scales, templates and competencies stay on their editors.
  // Performance set-up (perf.setup.manage) changes them too.
  '6.3': {
    links: ['perf.templates', 'perf.comp_matrix', 'perf.competencies'],
    settings: [
      { section: 'Goals and reviews', key: 'perf.goal.approval', synonyms: ['goal approval'] },
      { section: 'Goals and reviews', key: 'perf.goal.checkin_days', synonyms: ['check-in'] },
      // Batch F item 30 (answer 2575): when a goal shows as not updated to the manager.
      { section: 'Goals and reviews', key: 'perf.goal.stale_days', synonyms: ['not updated', 'stale goals'] },
      { section: 'Goals and reviews', key: 'perf.self_review.visible_to_manager', synonyms: ['self review'] },
      { section: 'Goals and reviews', key: 'perf.disagreement.days', synonyms: ['disagree', 'appeal'] },
      { section: 'Goals and reviews', key: 'perf.dispute.escalate_days', synonyms: ['dispute'] },
      { section: '360° and calibration', key: 'perf.anonymity.min_responses', synonyms: ['360 anonymity'] },
      { section: '360° and calibration', key: 'perf.report.min_cell', synonyms: ['distribution'] },
      { section: '360° and calibration', key: 'perf.feedback.default_visibility', synonyms: ['feedback'] },
      // Batch T2-C item 72 (answer 2845): the company bell-curve guide, off by default; the drawn Rating / Guide share table.
      { section: '360° and calibration', key: 'perf.calibration.default_guide', synonyms: ['bell curve', 'normalisation'] },
      { section: '360° and calibration', key: 'perf.calibration.guide_shares', synonyms: ['bell curve', 'calibration guide'], list: { columns: ['Rating', 'Guide share'], addLabel: 'Add rating', helper: 'A guide only: it fills a new calibration session, which can change it, and never blocks sign-off. Use the rating names of your scale.' } },
      { section: '360° and calibration', key: 'perf.calibration.guide_tolerance', synonyms: ['bell curve tolerance'] },
      { section: 'Compensation review and PIP', key: 'perf.comp.budget_overrun', synonyms: ['comp budget', 'increment budget'] },
      { section: 'Compensation review and PIP', key: 'perf.pay_band.visible', synonyms: ['pay band'] },
      { section: 'Compensation review and PIP', key: 'perf.pay_equity.flag_pct', synonyms: ['pay equity'] },
      { section: 'Compensation review and PIP', key: 'perf.comp.market_stale_months', synonyms: ['market data'] },
      { section: 'Compensation review and PIP', key: 'perf.pip.lengths', synonyms: ['pip', 'improvement plan'] },
      { section: 'Compensation review and PIP', key: 'perf.pip.extend_days' },
      { section: 'Compensation review and PIP', key: 'perf.pip.after_not_met_days' },
      { section: 'Competencies and 1:1s', key: 'perf.one_on_one.cadence_days', synonyms: ['one on one'] },
      { section: 'Manager assistants', key: 'perf.coach.frequency', synonyms: ['manager coach', 'nudges'] },
      { section: 'Manager assistants', key: 'perf.ai.review_assistant', synonyms: ['help me draft'] },
    ],
  },
  // AS-2 (answers 2007, 2008, 2123; Settings 6.5): the company's assessment defaults the engine uses today. Test owners
  // with the assessments settings key change them too. The rest of the drawn page waits for the features behind it.
  '6.5': {
    links: [],
    settings: [
      { section: 'Question bank', key: 'asmt.languages', synonyms: ['translations', 'question languages'] },
      { section: 'Question bank', key: 'asmt.bank.second_approver_collections', synonyms: ['question review', 'second approver'], list: { columns: ['Collection'], addLabel: 'Add collection', helper: 'Questions in these collections need a second approver after the first review.' } },
      { section: 'Question bank', key: 'asmt.bank.duplicate_percent', synonyms: ['duplicate questions'] },
      { section: 'Question bank', key: 'asmt.packs', synonyms: ['question library', 'starter packs'] },
      { section: 'Question bank', key: 'asmt.item_stats.provisional_answers', synonyms: ['item analysis'] },
      { section: 'Test defaults', key: 'asmt.high_stakes', synonyms: ['approver', 'big test'] },
      { section: 'Proctoring', key: 'asmt.proctor_mode', synonyms: ['proctoring', 'invigilation'] },
      // AS-5 (answer 2012): how long a candidate may appeal an integrity decision.
      { section: 'Results & retention', key: 'asmt.appeal_days', synonyms: ['appeal', 'integrity appeal'] },
      { section: 'Results & retention', key: 'asmt.retention', synonyms: ['recording retention', 'delete recordings', 'dpdp'] },
    ],
  },
};

/**
 * Settings S-4 (answer 1323): the People pages with settings that had no screen: 2.7 Exit & lifecycle policies and 2.10
 * Audit & data retention. Their other settings stay on Company rules and Access and privacy until those move with
 * "Different for" (answers 1321, 1484, S-7); the page links there.
 */
export const PEOPLE_SETTINGS: Record<string, { links: string[]; settings: Place[]; related?: { label: string; screenId: string }[] }> = {
  '2.7': {
    links: [],
    settings: [
      { section: 'Notice and resignation', key: 'exit.notice.probation', synonyms: ['notice period', 'resignation'] },
      { section: 'Notice and resignation', key: 'exit.notice.confirmed', synonyms: ['notice period', 'resignation'] },
      { section: 'Company lifecycle policies', key: 'retirement.age', synonyms: ['superannuation'] },
      { section: 'Company lifecycle policies', key: 'retirement.alert_months' },
      { section: 'Company lifecycle policies', key: 'vrs.benefit_days', synonyms: ['voluntary retirement'] },
      { section: 'Company lifecycle policies', key: 'absconding.days', synonyms: ['abandonment', 'unauthorised absence'] },
      { section: 'Company lifecycle policies', key: 'alumni.access_years', synonyms: ['former employees'] },
      { section: 'Rehire', key: 'rehire.pf', synonyms: ['boomerang', 'rejoin'] },
      { section: 'Rehire', key: 'rehire.same_fy_tax' },
      { section: 'Rehire', key: 'rehire.service' },
      { section: 'Rehire', key: 'rehire.gratuity' },
      { section: 'Rehire', key: 'rehire.leave' },
      { section: 'Rehire', key: 'rehire.probation' },
      { section: 'Rehire', key: 'rehire.prior_records' },
      // S-7 (answer 1321): from Company rules.
      { section: 'Fixed-term contracts', key: 'contract.max_years', synonyms: ['fixed-term', 'contract'] },
      { section: 'Fixed-term contracts', key: 'contract_end.action' },
    ],
  },
  // IT assets part 1 (answer 2712): 2.8 Assets; its category list is added by assetSettingsPage (asset-settings-live).
  '2.8': {
    links: [],
    settings: [
      { section: 'Issue and return', key: 'asset.ack_method', synonyms: ['acknowledge asset'] },
      { section: 'Issue and return', key: 'asset.recovery_to_fnf', synonyms: ['recovery'] },
      { section: 'Issue and return', key: 'asset.recovery_basis', synonyms: ['recovery amount', 'written-down value'] },
      // Answer 2714.
      { section: 'Warranty', key: 'asset.warranty_alert_days', synonyms: ['warranty', 'warranty alert'] },
      // Answer 2714 (contracts).
      { section: 'Contracts', key: 'asset.contract_alert_days', synonyms: ['contract', 'notice', 'renewal'] },
      // Answer 2718.
      { section: 'Licences', key: 'asset.licence_alert_days', synonyms: ['licence', 'license', 'software', 'expiry'] },
      // Answer 2715.
      { section: 'Bookings', key: 'asset.booking_max_days', synonyms: ['booking', 'loan', 'borrow', 'spare'] },
      { section: 'Bookings', key: 'asset.booking_approval', synonyms: ['booking', 'approval', 'loan'] },
    ],
  },
  // Settings S-7 (answers 1321, 1561, 1564): the settings that were on Company rules and Access and privacy.
  '2.2': {
    links: [],
    settings: [
      { section: 'Manager access', key: 'access.manager.view_scope', synonyms: ['manager sees'] },
      { section: 'Team pay access', key: 'pay_access.days', synonyms: ['team pay'] },
      { section: 'Team pay access', key: 'pay_access.scope' },
      { section: 'Privacy', key: 'privacy.who_accessed', synonyms: ['who looked'] },
      { section: 'Privacy', key: 'privacy.retention.internal_years', synonyms: ['retention'] },
      { section: 'Privacy', key: 'privacy.retention.personal_years' },
      { section: 'Privacy', key: 'privacy.retention.special_years' },
      { section: 'Privacy', key: 'privacy.erasure.enabled', synonyms: ['erasure', 'delete special data'] },
      { section: 'Home page', key: 'home.personalise_roles', synonyms: ['edit home', 'customise home', 'widgets'] },
      { section: 'Home page', key: 'home.pay_on_employee_home', synonyms: ['net pay on home'] },
    ],
  },
  '2.1': {
    links: [],
    settings: [
      { section: 'Access requests', key: 'access.request.allowed', synonyms: ['request access'] },
      { section: 'Access requests', key: 'access.request.max_days' },
      { section: 'Special permissions', key: 'access.risk.confidential_threshold', synonyms: ['confirmation'] },
    ],
  },
  '2.3': { links: [], settings: [{ section: 'Bank details', key: 'employee.bank_change.cooling_hours', synonyms: ['bank change', 'cooling'] }] },
  '2.5': {
    links: [],
    settings: [
      { section: 'Probation', key: 'probation.default_months', synonyms: ['probation length'] },
      { section: 'Probation', key: 'probation.max_total_months', synonyms: ['probation extension'] },
      { section: 'Probation', key: 'probation.review_lead_days' },
      { section: 'Probation', key: 'probation.auto_confirm_after_days', synonyms: ['confirm automatically'] },
      { section: 'Joining day', key: 'joining.reporting_time', synonyms: ['reporting time'] },
      { section: 'Joining day', key: 'joining.bring_on_day_one', synonyms: ['documents to bring'] },
    ],
  },
  '2.6': {
    links: [],
    settings: [
      { section: 'Job changes', key: 'employee_change.retro_limit', synonyms: ['back-dated change'] },
      { section: 'Job changes', key: 'promotion.must_change', synonyms: ['promotion'] },
      { section: 'Inter-entity transfer defaults', key: 'transfer.leave', synonyms: ['transfer'] },
      { section: 'Inter-entity transfer defaults', key: 'transfer.service' },
      { section: 'Inter-entity transfer defaults', key: 'transfer.code' },
      { section: 'Inter-entity transfer defaults', key: 'transfer.salary' },
      { section: 'Pay ranges', key: 'pay.band.above_max', synonyms: ['pay range', 'above max'] },
    ],
  },
  '2.9': {
    links: [],
    settings: [
      { section: 'Speak-up', key: 'speakup.anonymous', synonyms: ['anonymous', 'grievance'] },
      { section: 'Speak-up', key: 'speakup.ack_days' },
      { section: 'Speak-up', key: 'speakup.categories.grievance' },
      { section: 'Speak-up', key: 'speakup.categories.ethics' },
      { section: 'Speak-up', key: 'cases.reply_days' },
      { section: 'Speak-up', key: 'cases.disciplinary.reply_days', synonyms: ['disciplinary'] },
      { section: 'Regulated declarations', key: 'bfsi.declaration_due', synonyms: ['BFSI', 'declarations'] },
      { section: 'Regulated declarations', key: 'bfsi.preclearance_threshold', synonyms: ['pre-clearance'] },
      { section: 'Regulated declarations', key: 'bfsi.preclearance_valid_days' },
      { section: 'Regulated declarations', key: 'bfsi.preclearance_decide_days' },
    ],
  },
  // Settings S-6 (answer 1330): 2.4 Approvals, the reminder and escalation hours; the policies list comes from the API.
  '2.4': {
    links: ['approval.policy_editor'],
    related: [{ label: 'Approvals inbox', screenId: 'PLT-04' }],
    settings: [
      { section: 'Reminders and escalation', key: 'approval.remind_hours', synonyms: ['reminder', 'SLA'] },
      { section: 'Reminders and escalation', key: 'approval.escalate_hours', synonyms: ['escalation', 'escalate'] },
    ],
  },
  '2.10': {
    links: [],
    settings: [
      { section: 'Audit log', key: 'audit.retention_years', synonyms: ['audit trail'] },
      // S-7: the Not found references (who asked for which address), from Access and privacy.
      { section: 'Not found references', key: 'help.not_found.keep_days', synonyms: ['not found'] },
    ],
  },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS: Record<string, string> = { on: 'On', off: 'Off', yes: 'Yes', no: 'No', any: 'Any time', never: 'Never', any_month: 'Any month', calendar: 'Days in the month', none: 'None', basic_da: 'Basic and DA', next_month_arrears: 'As arrears next month' };
const pretty = (key: string, o: string): string => {
  if ((key === 'leave.year_start_month' || key === 'leave.encashment.window') && /^\d+$/.test(o)) return MONTHS[Number(o) - 1]!;
  // S-3: tax dates are month-day ('05-31' is 31 May); amounts in rupees.
  if (/^\d{2}-\d{2}$/.test(o)) return `${Number(o.slice(3))} ${MONTHS[Number(o.slice(0, 2)) - 1]!.slice(0, 3)}`;
  // S-4: notice periods ('15d', '1m') and the absconding timeline ('3,7,14,21').
  if (/^\d+[dm]$/.test(o)) { const n = Number(o.slice(0, -1)); return `${n} ${o.endsWith('d') ? 'day' : 'month'}${n === 1 ? '' : 's'}`; }
  if (key === 'absconding.days') { const [h, a, b, x] = o.split(','); return `Hold after ${h} days, notices at ${a} and ${b}, abandonment at ${x}`; }
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
  const spec = TIME_SETTINGS[design.id] ?? PAY_SETTINGS[design.id] ?? PEOPLE_SETTINGS[design.id] ?? MORE_SETTINGS[design.id];
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
      // Answer 2477: a guarded setting (phone binding, approved computers) is turned on only after a confirm.
      ...(d.guard ? { sensitive: true } : {}),
      ...(d.dated ? { helper: 'A change applies from today. Earlier days keep the value they had.' } : {}),
    };
    const labels = Object.fromEntries(d.values.map((o) => [o, d.labels?.[o] ?? pretty(p.key, o)]));
    // S-7 (answer 1484): the values of its own below the company, and where one may be set, on this page.
    const conv = (v: string): SettingValue => (isToggle(d) ? v === truthy(d) : d.multi ? (v ? v.split(',') : []) : v);
    const own = data.byScope?.[p.key];
    const scoped = data.scopes
      ? {
          scope: 'Company',
          overrides: own?.length ? own.map((o) => ({ scope: o.scope, value: conv(o.value), ...(o.validFrom ? { validFrom: o.validFrom } : {}), ...(o.note ? { note: o.note } : {}) })) : undefined,
          scopeable: data.scopes.filter((s) => d.scopes?.includes(s.type)).map((s) => s.label),
        }
      : {};
    // Answer 2123: a comma list shown as a table (one row a value); saved back by timeSettingsListChanges.
    if (d.text && p.list) {
      // Two columns (answer 2845): each value is 'name:number', shown as the name and the number with ' %'.
      const cell = (v: string) => (p.list!.columns.length === 2 ? [v.slice(0, v.lastIndexOf(':')).trim(), `${v.slice(v.lastIndexOf(':') + 1).trim()} %`] : [v]);
      const rows = value ? value.split(',').map((v) => v.trim()).filter(Boolean).map(cell) : [];
      return { ...base, ...(p.list.helper ? { helper: p.list.helper } : {}), kind: 'list', columns: p.list.columns, rows, addLabel: p.list.addLabel };
    }
    // S-7: text HR writes (topics one a line, what joiners bring).
    if (d.text) return { ...base, ...scoped, kind: d.text.maxLength > 100 ? 'textarea' : 'text', value };
    if (isToggle(d)) return { ...base, ...scoped, kind: 'toggle', value: value === truthy(d) };
    if (d.multi) return { ...base, ...scoped, kind: 'multiselect', options: [...d.values], optionLabels: labels, value: value ? value.split(',') : [] };
    return { ...base, ...scoped, options: [...d.values], optionLabels: labels, value };
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
  // S-7 (answer 1484): "Apply changes to" lists the company and every place a setting on this page may differ for.
  const kept = sections.filter((s) => s.settings.length > 0);
  const places = [...new Set(kept.flatMap((s) => s.settings.flatMap((d) => [...(d.scopeable ?? []), ...(d.overrides?.map((o) => o.scope) ?? [])])))];
  // The drawn note (e.g. "Changes need a second approver") describes sample data; live, the page's own state says it.
  return { ...design, note: undefined, related: (spec as { related?: { label: string; screenId: string }[] }).related, scopes: places.length ? ['Company', ...places] : undefined, sections: kept };
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

/**
 * Answer 2123: the edited tables of comma-list settings as their company values (the first column of each row; a comma in
 * a name would split it, so it becomes a space; blanks and repeats are dropped).
 */
export function timeSettingsListChanges(rows: Record<string, string[][]>, data: TimeSettingsData): { key: string; value: string }[] {
  return Object.entries(rows).flatMap(([key, list]) => {
    if (!data.registry[key]?.text) return [];
    const name = (r: string[]) => (r[0] ?? '').replace(/[,:]/g, ' ').replace(/\s+/g, ' ').trim();
    // Two columns (answer 2845): 'name:number' pairs; the API refuses shares that do not add up to 100.
    if (list.some((r) => r.length >= 2)) return [{ key, value: list.filter((r) => name(r)).map((r) => `${name(r)}:${parseFloat((r[1] ?? '').replace(/[^0-9.]/g, '')) || 0}`).join(',') }];
    const names = [...new Set(list.map(name).filter(Boolean))];
    return [{ key, value: names.join(',') }];
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

/** Settings S-5 (answers 1326, 1461): one change of a setting, from the audit log (GET /org/settings/history). */
export interface SettingChangeRow {
  id: string;
  at: string;
  by: string;
  role: string | null;
  key: string;
  label: string;
  scope: string;
  from: unknown;
  to: unknown;
}

/** The person's role in words, for the "(System Admin)" after their name; unknown roles say nothing. */
const ROLE_WORDS: Record<string, string> = { org_admin: 'System Admin', super_admin: 'YukthiX support', auditor: 'Auditor' };

/** A change in the page's words: "Weekly offs a week: 1 → 2", with the place when it is not the whole company. */
export function changeWords(page: SettingsPageDef | null, r: SettingChangeRow): { what: string; from: string; to: string } {
  const d = page?.sections.flatMap((s) => s.settings).find((f) => f.key === r.key);
  const words = (v: unknown) => {
    if (v === null || v === undefined) return 'Starter default';
    if (!d) return String(v);
    return d.kind === 'toggle' ? (v === 'on' || v === 'yes' || v === true ? 'On' : 'Off') : (d.optionLabels?.[String(v)] ?? String(v));
  };
  const label = d?.label ?? r.label;
  return { what: `${label}${r.scope && r.scope !== 'Company' ? ` (${r.scope})` : ''}`, from: words(r.from), to: words(r.to) };
}

/** Answer 1326: a page's "Last changed by" line and its history drawer, newest first. */
export function historyOnPage(page: SettingsPageDef, rows: SettingChangeRow[]): { lastChange: LastChange | null; history: (LastChange & { id: string })[] } {
  const all = rows.map((r) => {
    const w = changeWords(page, r);
    return { id: r.id, by: r.by, role: ROLE_WORDS[r.role ?? ''] ?? '', at: r.at.slice(0, 16), what: `Changed ${w.what} from ${w.from} to ${w.to}` };
  });
  return { lastChange: all[0] ? { by: all[0].by, role: all[0].role, at: all[0].at, what: all[0].what } : null, history: all.slice(1) };
}

/**
 * Settings S-6 (answer 1330): 2.4 shows each request type's approval steps as the drawn read-only list (change them in
 * the policy editor), from GET /workflow/policies.
 */
export function withApprovalPolicies(page: SettingsPageDef, data: { remindHours: number; escalateHours: number; types: { label: string; steps: { mode: string }[] | null; approvers: string }[] }): SettingsPageDef {
  const list: SettingDef = {
    key: 'approval.policies',
    label: 'Active policies',
    kind: 'list',
    readOnlyList: true,
    helper: 'Change these in the approval policy editor. A change applies to new requests only.',
    columns: ['Request type', 'Approvers', 'Who must approve', 'Time to decide', 'If no decision'],
    rows: data.types.map((t) =>
      t.steps
        ? [t.label, t.approvers, t.steps.map((s) => (s.mode === 'all' ? 'All' : 'Any one')).join(' → '), `${data.escalateHours} hours a step`, `Reminder at ${data.remindHours} hours, then their manager too`]
        : // Answers 1764, 1765: the module's own steps in words, on the company's hours.
          [t.label, t.approvers, 'As built in', `${data.escalateHours} hours a manager's step`, `Reminder at ${data.remindHours} hours, then their manager too`],
    ),
  };
  const title = 'Policies per request type';
  const has = page.sections.some((s) => s.title === title);
  const sections = has ? page.sections.map((s) => (s.title === title ? { ...s, settings: [...s.settings, list] } : s)) : [{ title, settings: [list] }, ...page.sections];
  return { ...page, sections };
}

/** Settings S-7 (answer 1484): the page's values for one place (label) as PUT /org/settings rows for that place. */
export function timeSettingsOverrides(overrides: { key: string; scope: string; value: SettingValue }[], data: TimeSettingsData): { key: string; value: string; scopeType: string; scopeId: string }[] {
  return overrides.flatMap((o) => {
    const d = data.registry[o.key];
    const place = data.scopes?.find((s) => s.label === o.scope);
    if (!d || !place) return [];
    const v = o.value;
    const value = typeof v === 'boolean' ? (v ? truthy(d) : falsy(d)) : Array.isArray(v) ? v.join(',') : String(v ?? '');
    return [{ key: o.key, value, scopeType: place.type, scopeId: place.id }];
  });
}
