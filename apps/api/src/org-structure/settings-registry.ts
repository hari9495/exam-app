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
  /** The value is a comma list of any of `values` (none: empty), e.g. which fields are required. */
  multi?: true;
  /** The value is short text HR writes (one thing a line), up to this many characters; `values` is empty. */
  text?: { maxLength: number };
  /** The values come from a platform list (besides `values`), read when the settings are listed and checked on save. */
  oneOf?: 'policy_industries' | 'company_users';
  /** Labels of the values, when the list is not fixed in code. */
  labels?: Record<string, string>;
  /** Careers answer 442: only YukthiX staff change it (console › Company settings), and only when the plan includes this feature. */
  platform?: { feature: string };
}

export const SETTINGS: Readonly<Record<string, SettingDef>> = {
  // HLP-04 (founder 3 Nov 2026): how often a published help article is checked again (YX-GRO-07). Desk set-up › Settings.
  'desk.kb.review_months': { label: 'Check help articles again every (months)', scopes: ['tenant'], dated: false, values: ['3', '6', '12', '24'], default: '12' },
  // HLP-10 / HLP-11 company policies (docs/yukthix/helpdesk-design-map.md 4d): when acknowledgements fall due, reminders,
  // re-acknowledging a new version, typing one's name, and the second person who publishes (loosening that is access).
  'policy.ack.due_days': { label: 'Policies: days to acknowledge a policy', scopes: ['tenant'], dated: false, values: ['7', '14', '15', '30', '45', '60'], default: '14' },
  'policy.reminder.every_days': { label: 'Policies: remind people who have not acknowledged every (days)', scopes: ['tenant'], dated: false, values: ['off', '1', '2', '3', '7'], default: '3' },
  'policy.reminder.manager_after_days': { label: 'Policies: tell the manager when someone is this many days overdue', scopes: ['tenant'], dated: false, values: ['off', '3', '7', '14', '30'], default: '7' },
  'policy.reack.default': { label: 'Policies: a new version asks everyone to acknowledge again', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  'policy.ack.typed_name': { label: 'Policies: people type their name to acknowledge', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HLP-14: draft policies with the company's own AI (founder decision 1); off offers the YukthiX starters instead.
  'policy.ai_writer': { label: 'Policies: write policy drafts with the company’s AI', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  // HLP-14 (answer 106): unapproved policy drafts are discarded by the daily clean-up after this many days untouched.
  'policy.ai_draft.discard_days': { label: 'Policies: discard unapproved AI drafts after (days untouched)', scopes: ['tenant'], dated: false, values: ['30', '60', '90', '180', '365'], default: '90' },
  // HLP-14 answer 132: the company's industry (the policy_industries list; none until HR chooses). Write policies with AI
  // starts from it; a draft can still choose another.
  'company.industry': { label: 'Industry of the company', scopes: ['tenant'], dated: false, values: ['none'], default: 'none', oneOf: 'policy_industries', labels: { none: 'Not chosen' } },
  'policy.publish.second_person': { label: 'Policies: a second person publishes each version', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on', guard: 'access.role.manage' },
  // HLP-06 speak-up (docs/yukthix/helpdesk-design-map.md 4e): who may report without a name, the days to acknowledge,
  // and the topics people choose from. Legal clocks (POSH, GRC) come from the rule sets IN.POSH and IN.GRC, not from here.
  'speakup.anonymous': { label: 'Speak-up: who may report without a name', scopes: ['tenant'], dated: false, values: ['all', 'ethics_only', 'off'], default: 'all' },
  'speakup.ack_days': { label: 'Speak-up: days for the case team to acknowledge a report', scopes: ['tenant'], dated: false, values: ['1', '2', '3', '5', '7'], default: '2' },
  'speakup.categories.grievance': { label: 'Speak-up: topics of a grievance (one a line)', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 600 }, default: 'Pay and benefits\nWorking conditions\nA manager\nTransport\nSafety\nOther' },
  // HLP-12 accident cases (map 4g): the injury types people choose from, and how often the safety team is reminded while a
  // contractor has not filed a contract worker's ESIC report. Legal deadlines come from IN.ESI.ACCIDENT and IN.EC.CLAIM.
  'accident.injury_types': { label: 'Accidents: injury types people choose from (one a line)', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 600 }, default: 'Crush\nCut\nBurn\nFall\nSprain or strain\nOther' },
  // Founder answer 43: injury leave recorded on a case becomes a leave request of this type (its code in Time › Leave types).
  'accident.injury_leave_type': { label: 'Accidents: the leave type code for injury leave', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 30 }, default: 'INJURY' },
  'accident.contractor_reminder_days': { label: 'Accidents: remind the safety team while a contractor has not filed, every (days)', scopes: ['tenant'], dated: false, values: ['off', '1', '2', '3', '7'], default: '1' },
  // HLP-13 collective disputes (map 4h): whether an outside lawyer on the industrial relations team may be the second
  // person who approves a settlement. Legal clocks come from IN.IR.DISPUTE.
  'dispute.lawyer_may_approve': { label: 'Disputes: an outside lawyer on the IR team may approve a settlement', scopes: ['tenant'], dated: false, values: ['no', 'yes'], default: 'no' },
  // HLP-07/08/09 (map 4f): days a respondent has to reply to a grievance or ethics notice. POSH days come from the rule
  // set IN.POSH.INQUIRY, never from here.
  'cases.reply_days': { label: 'Cases: days a respondent has to reply to a grievance or ethics notice', scopes: ['tenant'], dated: false, values: ['5', '7', '10', '15'], default: '7' },
  // HLP-08 disciplinary (answer 34): days to reply to a show-cause notice, per legal entity from its certified standing
  // orders; 'rule_set' takes the model standing orders figure from IN.SO.MODEL (verify with counsel), never a number in code.
  'cases.disciplinary.reply_days': { label: 'Cases: days to reply to a show-cause notice (from the standing orders)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['rule_set', '3', '5', '7', '10', '14', '15'], default: 'rule_set' },
  'speakup.categories.ethics': { label: 'Speak-up: topics of a fraud or ethics concern (one a line)', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 600 }, default: 'Fraud or theft\nBribery or corruption\nConflict of interest\nMisuse of data\nOther' },
  // YX-ORG-16: employee codes unique per legal entity (default) or across the company.
  'employee_code.scope': { label: 'Employee codes are unique', scopes: ['tenant'], dated: false, values: ['legal_entity', 'tenant'], default: 'legal_entity' },
  // YX-ORG-15: whether a new structure master starts shared or entity-only.
  'org.master.default_ownership': { label: 'New masters are', scopes: ['tenant'], dated: false, values: ['shared', 'entity_only'], default: 'shared' },
  // G1 (gap pass C1): a full-time week; a job's FTE is its hours over this. Starter: the country pack's value.
  'work.normal_week_hours': { label: 'Normal working week (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['pack', '35', '37.5', '38', '40', '42', '44', '45', '48'], default: 'pack' },
  // G1 (gap pass G1): the company value is the language its own words are typed in; an entity or a person may differ.
  'people.language': { label: 'Language', scopes: ['tenant', 'legal_entity', 'employee'], dated: false, values: ['en', 'hi', 'ta', 'te'], default: 'en' },
  // P06 YX-HIS-12: how far back a past-dated change may go without a System Admin override (Q5:
  // default the start of the current financial year; the company may widen it).
  // Widening it loosens a control (YX-HIS-12), so it is the access admin's (P02 §4.2, YX-SEC-02).
  'employee_change.retro_limit': { label: 'Past-dated changes may go back to', scopes: ['tenant'], dated: false, values: ['current_fy', 'previous_fy'], default: 'current_fy', guard: 'access.role.manage' },
  // M01 §3.4 / Q3 probation policy (starter values, D17): length per employment type / grade, the review
  // reminder lead, the most it may run with extensions, and auto-confirmation (off unless the company opts in).
  'probation.default_months': { label: 'Probation lasts (months)', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: false, values: ['3', '6', '9', '12'], default: '6' },
  'probation.review_lead_days': { label: 'Probation review reminder (days before the end)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '15', '30'], default: '15' },
  // PPL-06 (founder 20 Oct 2026): when a raise takes someone above their grade's pay range maximum (Structure › Grades),
  // the company decides: warn and let the approver decide, cap the new pay at the maximum, or refuse until it is changed.
  'pay.band.above_max': { label: 'A raise above the pay range maximum', scopes: ['tenant', 'legal_entity'], dated: false, values: ['warn', 'cap', 'block'], default: 'warn' },
  // Founder queue 28 Oct 2026: what a promotion must move. 'either' (a new designation or grade) is the starting rule.
  'promotion.must_change': { label: 'A promotion must change', scopes: ['tenant', 'legal_entity'], dated: false, values: ['either', 'both', 'grade', 'designation'], default: 'either' },
  'probation.max_total_months': { label: 'Probation with extensions lasts at most (months)', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['6', '9', '12', '18', '24'], default: '12' },
  // Auto-confirmation is a system change with no approver (YX-SEC-11), so turning it on is the access admin's.
  'probation.auto_confirm_after_days': { label: 'Confirm automatically after the end date', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', '0', '7', '15', '30'], default: 'off', guard: 'access.role.manage' },
  // M01 §10.2 / D7 (decided 9 Oct 2026): the notice period, in calendar days (d) or months (m), dated so a resignation
  // uses the policy in force on the day it is submitted (YX-LC-04). Starter values: probation 15 days, confirmed 30.
  'exit.notice.probation': { label: 'Notice period during probation', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: true, values: ['0d', '7d', '15d', '30d', '45d', '60d', '90d', '1m', '2m', '3m'], default: '15d' },
  'exit.notice.confirmed': { label: 'Notice period once confirmed', scopes: ['tenant', 'legal_entity', 'employment_type', 'grade'], dated: true, values: ['0d', '7d', '15d', '30d', '45d', '60d', '90d', '1m', '2m', '3m'], default: '30d' },
  // P05 Q6 (decided): alumni read their own letters and documents for this many years after the last day.
  // M05 §13 (expenses E1): capture supplier GSTIN, invoice and tax split on GST-eligible lines, per entity (off by default, Q5).
  // M05 E2 (§9): when finance checks claims, how old a bill may be before it needs that check, and above what claim
  // total the cost-centre owner approves too.
  'expense.finance_audit': { label: 'Expenses: finance check of claims', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'flagged_only', 'all', 'sample_10pct'], default: 'flagged_only' },
  'expense.claim_window_days': { label: 'Expenses: bills older than this many days need the finance check', scopes: ['tenant', 'legal_entity'], dated: false, values: ['30', '60', '90', '180'], default: '60' },
  'expense.cc_owner_above': { label: 'Expenses: the cost-centre owner also approves claims above', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', '10000', '25000', '50000', '100000'], default: 'off' },
  // Batch E3 (M05 §10.1 – §10.2, §11.3): how approved claims are paid, the payroll cut-off, and recovering overdue advances.
  'expense.route.default': { label: 'Expenses: approved claims are paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['payroll', 'payout'], default: 'payroll' },
  'expense.route.payout_above': { label: 'Expenses: pay by bank transfer instead of payroll when a claim is above', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', '5000', '10000', '25000', '50000', '100000'], default: 'off' },
  'expense.payroll_cutoff_day': { label: 'Expenses: claims approved after this day of the month go to the next payroll', scopes: ['tenant', 'legal_entity'], dated: false, values: ['15', '20', '23', '25', '28'], default: '23' },
  'expense.advance.recovery_instalments': { label: 'Expenses: an overdue advance is recovered from salary in this many instalments', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3', '6'], default: '3' },
  'expense.advance.settle_days': { label: 'Expenses: a trip advance is settled within this many days of the trip ending', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '15', '30', '45'], default: '15' },
  // Expenses round 2 (founder 3 Nov 2026): a rate the employee typed is flagged for the approver when it is further than
  // this from the company rate (was FX_TOLERANCE_PCT = 3 in code).
  'expense.fx_tolerance_pct': { label: 'Expenses: flag a typed exchange rate this far (%) from the company rate', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3', '5', '10'], default: '3' },
  'expense.gst.capture': { label: 'Expenses: capture GST for input credit', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
  // EXP-08 card statements (founder answer 3 Nov 2026): how close a claim line must be to a card line to be suggested,
  // how often an employee is reminded about a card line to explain, and how personal spend is recovered from salary.
  'expense.card.match_amount_within': { label: 'Card statements: suggest a claim line when the amount is within (₹)', scopes: ['tenant'], dated: false, values: ['0', '0.50', '1', '5', '10'], default: '1' },
  'expense.card.match_days': { label: 'Card statements: suggest a claim line dated within this many days of the card line', scopes: ['tenant'], dated: false, values: ['0', '1', '2', '3', '5', '7'], default: '3' },
  'expense.card.reminder_days': { label: 'Card statements: remind the employee about a card line to explain after these days', scopes: ['tenant'], dated: false, values: ['3,7,14', '7,14', '7', '14', 'off'], default: '3,7,14' },
  'expense.card.recovery_instalments': { label: 'Card statements: personal spend is recovered from salary in this many instalments', scopes: ['tenant'], dated: false, values: ['1', '2', '3', '6'], default: '3' },
  // M06 performance PM2 (§6.1, D2): whether the manager approves a person's goals; how often check-ins are expected.
  'perf.goal.approval': { label: 'Performance: the manager approves a person’s goals', scopes: ['tenant'], dated: false, values: ['manager', 'none'], default: 'manager' },
  'perf.self_review.visible_to_manager': { label: 'Performance: the manager reads the self review', scopes: ['tenant'], dated: false, values: ['after_manager_draft', 'immediately'], default: 'after_manager_draft' },
  'perf.disagreement.days': { label: 'Performance: days after release to disagree with a review', scopes: ['tenant'], dated: false, values: ['7', '15', '30'], default: '15' },
  'perf.anonymity.min_responses': { label: 'Performance: fewest answers before anonymous feedback is shown (never below 3)', scopes: ['tenant'], dated: false, values: ['3', '4', '5'], default: '3' },
  'perf.report.min_cell': { label: 'Performance: smallest group shown in distributions and reports', scopes: ['tenant'], dated: false, values: ['5', '10'], default: '5' },
  'perf.comp.budget_overrun': { label: 'Performance: a comp proposal over budget', scopes: ['tenant', 'legal_entity'], dated: false, values: ['extra_approval', 'block'], default: 'extra_approval' },
  'perf.pay_band.visible': { label: 'Performance: employees see their own pay band', scopes: ['tenant', 'legal_entity'], dated: false, values: ['on', 'off'], default: 'on' },
  'perf.pay_equity.flag_pct': { label: 'Performance: flag pay below the grade-and-role median by more than (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['5', '10', '15'], default: '10' },
  // PRF-08 / PRF-11 / PRF-12 (performance designs, builder 2): the choice each form starts with.
  'perf.feedback.default_visibility': { label: 'Performance: new feedback is shown to', scopes: ['tenant'], dated: false, values: ['private', 'recipient_only', 'with_hr'], default: 'private' },
  'perf.one_on_one.cadence_days': { label: 'Performance: a new 1:1 repeats every (days)', scopes: ['tenant'], dated: false, values: ['7', '14', '30'], default: '14' },
  // PRF-10 market data (founder answer 12): a salary survey older than this shows as stale on the comp sheet.
  'perf.comp.market_stale_months': { label: 'Performance: market data is out of date after (months)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['6', '12', '18', '24'], default: '12' },
  'perf.pip.extend_days': { label: 'Performance: an improvement plan is extended by (days)', scopes: ['tenant'], dated: false, values: ['15', '30', '45', '60'], default: '30' },
  // Founder answer (a), 3 Nov 2026: after "not met", HR may extend a plan once more, by this many days.
  'perf.pip.after_not_met_days': { label: 'Performance: after "not met", an improvement plan may be extended once more by (days)', scopes: ['tenant'], dated: false, values: ['15', '30', '45', '60'], default: '30' },
  // Performance builder 3 (PRF-15, PRF-16, PRF-17): how long after HR's answer a dispute may be escalated; how often the
  // manager coach writes nudges (each manager may still turn them off); whether managers get the AI review assistant.
  'perf.dispute.escalate_days': { label: 'Performance: days after HR answers a disagreement to escalate it', scopes: ['tenant'], dated: false, values: ['7', '15', '30'], default: '15' },
  'perf.coach.frequency': { label: 'Performance: manager coach nudges', scopes: ['tenant'], dated: false, values: ['weekly', 'fortnightly', 'off'], default: 'weekly' },
  'perf.ai.review_assistant': { label: 'Performance: AI review summaries (Help me draft) for managers', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  'perf.pip.lengths': { label: 'Performance: improvement plans run for (days)', scopes: ['tenant'], dated: false, values: ['30,60,90', '30,60', '60,90', '90'], default: '30,60,90' },
  // M10 AT2 (D5): requisitions against the headcount plan: not used, shown (outside-plan needs the extra approver), or required.
  'ats.headcount_plan': { label: 'Hiring: requisitions and the headcount plan', scopes: ['tenant'], dated: false, values: ['off', 'advisory', 'required'], default: 'advisory' },
  // HIR-01 (founder decision 11, 9 Nov 2026): hiring managers see their own department's approved plan, read-only.
  'ats.headcount_plan.manager_view': { label: 'Hiring: hiring managers see their department’s headcount plan', scopes: ['tenant'], dated: false, values: ['own_department', 'off'], default: 'own_department' },
  // M10 AT4 (Q6, YX-ATS-53): months without activity before a non-hired candidate is anonymised.
  'ats.retention_months': { label: 'Hiring: keep candidate details for (months without activity)', scopes: ['tenant'], dated: false, values: ['6', '9', '12', '18', '24', '36'], default: '12' },
  // HIR-12 referrals (YX-ATS-12): the bonus for a hire someone referred, and the days the hire must complete before it is
  // due. The amount is kept on each referral when it is made, so a later change never alters a promise already made.
  'ats.referral.bonus_inr': { label: 'Hiring: referral bonus (₹) for a referred hire', scopes: ['tenant'], dated: false, values: ['0', '5000', '10000', '15000', '20000', '25000', '50000', '100000'], default: '25000' },
  'ats.referral.qualify_days': { label: 'Hiring: days a referred hire must complete before the bonus is due', scopes: ['tenant'], dated: false, values: ['30', '60', '90', '180'], default: '90' },
  // Founder answer 201: no credit when the person applied for the job on their own this many days before (0 = always credit).
  'ats.referral.self_apply_days': { label: 'Hiring: no referral credit if the person applied themselves within (days)', scopes: ['tenant'], dated: false, values: ['0', '30', '60', '90', '180'], default: '90' },
  // HIR-23 (founder decision 2, question 7): the company uses an automated tool for New York City jobs, so it needs a
  // yearly independent bias audit (Hiring › Bias audits); off = not applicable.
  'hiring.bias_audit.nyc': { label: 'Hiring: we use an automated tool for jobs in New York City', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-25 interview notetaker (founder decision 2): off by default; consent from every participant first; the AI draft
  // scorecard is a separate switch (also off) and needs the company's AI; transcripts and drafts are kept for N days.
  'hiring.notetaker.enabled': { label: 'Hiring: interview notetaker (transcript with everyone’s consent)', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  'hiring.notetaker.ai_draft': { label: 'Hiring: AI drafts a scorecard from the transcript', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-20 campaigns: steps go out only inside the send window (IST hours, the design's quiet hours 9 pm to 9 am) and at
  // most the daily cap of campaign messages a day for the whole company.
  'hiring.crm.send_window': { label: 'Hiring: campaign messages go out between (IST)', scopes: ['tenant'], dated: false, values: ['09-21', '10-18', '08-20', '00-24'], default: '09-21', labels: { '09-21': '9 am to 9 pm', '10-18': '10 am to 6 pm', '08-20': '8 am to 8 pm', '00-24': 'Any time' } },
  'hiring.crm.daily_cap': { label: 'Hiring: most campaign messages a day', scopes: ['tenant'], dated: false, values: ['50', '100', '200', '500', '1000'], default: '200' },
  // HIR-20 sourced profiles (DPDP): a person added from outside YukthiX is erased this many days after the consent email
  // unless they consent first.
  'hiring.sourced.keep_days': { label: 'Hiring: erase a sourced profile without consent after (days)', scopes: ['tenant'], dated: false, values: ['7', '15', '30'], default: '30' },
  'hiring.notetaker.keep_days': { label: 'Hiring: keep interview transcripts and drafts for (days)', scopes: ['tenant'], dated: false, values: ['30', '90', '180', '365'], default: '90' },
  // HIR-13 internal jobs (founder decision 6): who may apply, and when; the current manager is told, never asked.
  'hiring.internal.after_probation': { label: 'Hiring: only people past probation can apply for internal jobs', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  'hiring.internal.months_in_role': { label: 'Hiring: months in their current role before someone can apply for internal jobs', scopes: ['tenant'], dated: false, values: ['0', '3', '6', '9', '12', '18', '24'], default: '12' },
  'hiring.internal.tell_manager': { label: 'Hiring: the current manager is told about an internal application', scopes: ['tenant'], dated: false, values: ['on_apply', 'at_offer'], default: 'on_apply' },
  'perf.goal.checkin_days': { label: 'Performance: remind about goal check-ins after (days)', scopes: ['tenant'], dated: false, values: ['14', '30', '90'], default: '30' },
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
  // PPL-40: the VRS scheme benefit's days of basic + DA per completed year in the employee's estimate (Rule 2BA allows up to 90; 45 is common).
  'vrs.benefit_days': { label: 'VRS benefit: days of basic + DA per completed year', scopes: ['tenant', 'legal_entity'], dated: false, values: ['30', '45', '60', '90'], default: '45' },
  'retirement.alert_months': { label: 'Open the retirement exit this many months before', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '3', '6'], default: '6' },
  // YX-LC-19: at the end of a fixed-term contract: remind HR and the manager (30 and 7 days before), or also exit on the day.
  'contract_end.action': { label: 'When a fixed-term contract ends', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['alert', 'auto_exit'], default: 'alert' },
  // PPL-49 (founder Q4, 30 Oct 2026): the longest a fixed-term contract may run from the joining day; setting or extending
  // an end past it is refused. Default 3 years; HR may change it per entity or employment type.
  'contract.max_years': { label: 'A fixed-term contract lasts at most (years from joining)', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['1', '2', '3', '4', '5', 'none'], default: '3' },
  // T9-01 (joiner portal): the time a joiner reports on the first day, shown in "Your first day". HR may change it per entity.
  'joining.reporting_time': { label: 'Joiners report on their first day at', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'], default: '09:30' },
  // Founder 2 Nov 2026 (T9-01 answer 5): what joiners bring on day one, short text HR writes (one thing a line), shown on
  // the joining portal. Per company or legal entity.
  'joining.bring_on_day_one': { label: 'Joiners bring on their first day', scopes: ['tenant', 'legal_entity'], dated: false, values: [], text: { maxLength: 500 }, default: 'Original PAN and Aadhaar (to be seen, not kept)\nTwo passport photos\nBank passbook or cancelled cheque' },
  // P02 Q2 (decided): managers view their whole reporting subtree by default; the company may narrow it.
  'access.manager.view_scope': { label: 'Managers can view', scopes: ['tenant'], dated: false, values: ['all_reports', 'direct_reports'], default: 'all_reports', guard: 'access.role.manage' },
  // Founder 28 Oct 2026: a manager's access to their team's pay lasts this long, and covers the whole team or the one person
  // asked about, unless the approving HR person changes it on the request. HR decides (org.settings.manage).
  'pay_access.days': { label: 'Team pay access lasts (days)', scopes: ['tenant'], dated: false, values: ['7', '15', '30', '60', '90'], default: '30' },
  'pay_access.scope': { label: 'Team pay access covers', scopes: ['tenant'], dated: false, values: ['team', 'person'], default: 'team' },
  // P02 YX-SEC-18 (a): a role grant giving Confidential / Special access over more people than this warns first.
  'access.risk.confidential_threshold': { label: 'Warn when a grant opens Confidential data of more than (people)', scopes: ['tenant'], dated: false, values: ['5', '10', '25', '50', '100', '250'], default: '25', guard: 'access.role.manage' },
  // P02 §7 / P08: employees see who viewed their Confidential and Special data (every view is recorded either way).
  'privacy.who_accessed': { label: 'Show "Who accessed my data" to employees', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on', guard: 'access.role.manage' },
  // PPL-33 (people small gaps): how long each data class is kept after the person leaves, shown to employees on Privacy
  // (Confidential follows payroll.document_retention_years). Shortening a period is the access admin's.
  'privacy.retention.internal_years': { label: 'Keep employment records after someone leaves (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['3', '5', '8', '10'], default: '8', guard: 'access.role.manage' },
  'privacy.retention.personal_years': { label: 'Keep personal details after someone leaves (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '3', '5', '8'], default: '3', guard: 'access.role.manage' },
  'privacy.retention.special_years': { label: 'Keep Special data (Aadhaar, background checks) after someone leaves (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '1', '3'], default: '1', guard: 'access.role.manage' },
  // Founder 30 Oct 2026 (item 12): the nightly job deletes Special data past privacy.retention.special_years. Off until HR
  // has read the dry run (Settings › Access and privacy); pay records keep their own period.
  'privacy.erasure.enabled': { label: 'Delete Special data when its period ends', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // PLT-02 / settings 2.2 Home page (19 Oct 2026): employees see their own latest net pay on Home, hidden until they ask.
  // HIR-24 (founder decision 7, 9 Nov 2026): where no law requires it (India), showing a new job's pay range on the careers
  // page and job boards is the company's choice (starter off: today's behaviour, founder question 221); asking applicants about their current or past pay
  // is off unless the company switches it on, and never where the location's law bans it (HIR.PAY_TRANSPARENCY).
  'hiring.pay_range.show': { label: 'Hiring: show the pay range on new jobs', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['off', 'on'], default: 'off' },
  'hiring.pay_history.ask': { label: 'Hiring: ask applicants about their current or past pay on new jobs', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-26 (founder decision 2): the company's AI writes a short advisory note per suggested past candidate; off = plain text search.
  'hiring.rediscovery.ai': { label: 'Hiring: AI notes on past candidates suggested for a requisition', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-04: rejecting on the pipeline board tells the candidate nothing unless the company switches this on; then the
  // Rejected stage's email template goes after 24 hours (the rejection can be undone until then).
  'hiring.reject.email_candidate': { label: 'Hiring: email the candidate when they are rejected on the board', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-05 founder answer 272: an ex-employee HR marked not eligible for rehire cannot move past the first stage (into
  // Screening or later) until HR clears the flag with a reason. Off by default: the banner only tells.
  'hiring.rehire_flag.blocks_screening': { label: 'Hiring: "not eligible for rehire" stops an ex-employee at the first stage', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // HIR-09 founder decision 4: an offer above the grade pay range adds one approval step; who approves it is the
  // company's choice (starter: the HR head, the head of the department coded HR; without one, the people who see offer pay).
  // Founder answer 332: or a named person of the company who holds the offer-pay key (the value is their user id).
  'hiring.offer.band_approver': { label: 'Hiring: who approves an offer above the grade pay range', scopes: ['tenant'], dated: false, values: ['hr_head', 'hiring_manager'], default: 'hr_head', labels: { hr_head: 'The HR head', hiring_manager: 'The hiring manager' }, oneOf: 'company_users' },
  // Founder answer 334: a joiner who leaves within the offer's clawback months repays the joining bonus in the final
  // settlement: all of it (starter), or the part for the months not served.
  'hiring.offer.clawback_basis': { label: 'Hiring: joining bonus repaid when the person leaves within the clawback months', scopes: ['tenant'], dated: false, values: ['full', 'pro_rata'], default: 'full', labels: { full: 'All of it', pro_rata: 'The part for the months not served' } },
  // HIR-29: the conditions a new offer starts with when the recruiter ticks "Add conditions" (one a line; due on the joining day).
  'hiring.offer.default_conditions': { label: 'Hiring: conditions a new offer starts with (one a line)', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 600 }, default: 'Background check clear\nDegree certificate uploaded\nRelieving letter from current employer' },
  // HIR-06: an interviewer's scorecard shows as overdue this many hours after the interview ended (reminders still go
  // at 24 and 48 hours).
  // HIR-10 (founder decision 3): a BGV discrepancy goes to a person. On: that person must be someone other than whoever
  // recorded the discrepancy (maker and checker). Off: the same HR person may record and decide.
  'hiring.bgv.decider_other_person': { label: 'Hiring: a BGV discrepancy is decided by someone other than who recorded it', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'on' },
  // HIR-27 bulk interview day: how long each interview lasts, and how Auto-assign fills the day (by_slot: the earliest
  // slots first across every panel, as drawn; by_panel: one panel's slots before the next panel's).
  'hiring.interview_day.slot_minutes': { label: 'Hiring: each interview on an interview day lasts (minutes)', scopes: ['tenant'], dated: false, values: ['30', '45', '60', '90'], default: '45' },
  'hiring.interview_day.assign': { label: 'Hiring: Auto-assign on an interview day fills', scopes: ['tenant'], dated: false, values: ['by_slot', 'by_panel'], default: 'by_slot' },
  // Staffing desk (slice 1; Settings 6.2). Off by default: the staffing area shows only to a company that turns it on.
  'staffing.desk.enabled': { label: 'Staffing desk: place people with client companies', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // Rate-card defaults for a new line (each line keeps its own), the client's payment terms when a client has none, and
  // how far back a rate change may start (0: today or later, so billed timesheets keep their rate).
  'staffing.ot_multiplier': { label: 'Staffing desk: overtime bill multiplier for new rate-card lines', scopes: ['tenant'], dated: false, values: ['1', '1.25', '1.5', '1.75', '2', '2.5', '3'], default: '1.5' },
  'staffing.holiday_multiplier': { label: 'Staffing desk: holiday bill multiplier for new rate-card lines', scopes: ['tenant'], dated: false, values: ['1', '1.25', '1.5', '1.75', '2', '2.5', '3'], default: '2' },
  'staffing.payment_terms_days': { label: 'Staffing desk: default payment terms (days)', scopes: ['tenant'], dated: false, values: ['0', '7', '15', '30', '45', '60', '90', '120'], default: '30' },
  'staffing.rate_change.backdate_days': { label: 'Staffing desk: a rate change may start up to (days back)', scopes: ['tenant'], dated: false, values: ['0', '7', '30', '90'], default: '0' },
  // Staffing slice 2 (Settings 6.2). Vendors: the margin the suggested rate cap keeps, and how long the first submitter
  // holds a candidate for a job (later ones are duplicates). Submissions: hide the candidate's phone and email from the
  // client until shortlisted. Placements: when one counts as ending soon; the statutory cost (employer PF, ESI…) taken
  // from own-payroll margin as a share of pay. Bench: pay while between placements, how long, and what follows.
  // Contract labour CL-1 (answer 627, Settings 4.9): days before a contractor licence ends that the compliance owners are told.
  'clra.licence_alerts': { label: 'Contract labour: licence expiry alerts (days before)', scopes: ['tenant'], dated: false, multi: true, values: ['90', '60', '30', '15', '7'], default: '60,30,7' },
  // CL-2 (answer 632): a recorded site safety induction before the first gate pass, and how long it lasts.
  'clra.induction_required': { label: 'Contract labour: safety induction before the gate pass', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  'clra.induction_months': { label: 'Contract labour: a safety induction lasts (months)', scopes: ['tenant'], dated: false, values: ['6', '12', '24'], default: '12' },
  // CL-4 (answer 634): when a month's proofs are due, and whether a contractor's bill is held while they are overdue or disputed.
  'clra.doc_cutoff': { label: 'Contract labour: monthly proofs due by (day of the following month)', scopes: ['tenant'], dated: false, values: Array.from({ length: 25 }, (_, i) => String(i + 1)), default: '15' },
  'clra.payment_hold': { label: 'Contract labour: contractor bill while proofs are overdue or disputed', scopes: ['tenant'], dated: false, values: ['hold', 'alert'], default: 'hold' },
  'staffing.vendor.target_margin_pct': { label: 'Staffing desk: target margin for a vendor rate cap (%)', scopes: ['tenant'], dated: false, values: ['10', '15', '20', '25', '30', '35', '40'], default: '25' },
  'staffing.vendor.ownership_days': { label: 'Staffing desk: a vendor holds a submitted candidate for (days)', scopes: ['tenant'], dated: false, values: ['30', '60', '90', '180'], default: '90' },
  'staffing.submission.mask_contact': { label: 'Staffing desk: hide candidate phone and email from clients until shortlisted', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'on' },
  'staffing.placement.ending_soon_days': { label: 'Staffing desk: a placement is ending soon within (days)', scopes: ['tenant'], dated: false, values: ['15', '30', '45', '60'], default: '30' },
  'staffing.statutory_cost_pct': { label: 'Staffing desk: statutory cost on own-payroll pay (%)', scopes: ['tenant'], dated: false, values: ['0', '5', '10', '13', '15', '20'], default: '0' },
  'staffing.bench.pay_pct': { label: 'Staffing desk: bench pay (% of fixed pay)', scopes: ['tenant'], dated: false, values: ['0', '25', '50', '60', '75', '100'], default: '50' },
  'staffing.bench.max_days': { label: 'Staffing desk: maximum bench days', scopes: ['tenant'], dated: false, values: ['15', '30', '45', '60', '90'], default: '30' },
  // Staffing slice 3 (Settings 6.2 collections and e-invoicing).
  'staffing.dunning.schedule': { label: 'Staffing desk: payment reminders to client billing contacts', scopes: ['tenant'], dated: false, values: ['standard', 'gentle', 'off'], default: 'standard' },
  // Staffing answer 522 (Settings 6.2 Accounting export): ledger names, the GST split, TDS and round-off.
  'staffing.export.ledger.sales': { label: 'Staffing desk export: sales ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Sales - Staffing Services' },
  'staffing.export.ledger.cgst': { label: 'Staffing desk export: CGST ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Output CGST' },
  'staffing.export.ledger.sgst': { label: 'Staffing desk export: SGST ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Output SGST' },
  'staffing.export.ledger.igst': { label: 'Staffing desk export: IGST ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Output IGST' },
  'staffing.export.ledger.gst': { label: 'Staffing desk export: GST ledger (one ledger for all GST)', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Output GST' },
  'staffing.export.ledger.tds': { label: 'Staffing desk export: TDS receivable ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'TDS Receivable' },
  'staffing.export.ledger.round_off': { label: 'Staffing desk export: round-off ledger', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 100 }, default: 'Round Off' },
  'staffing.export.gst_split': { label: 'Staffing desk export: GST in separate CGST, SGST and IGST ledgers or one', scopes: ['tenant'], dated: false, values: ['separate', 'combined'], default: 'separate' },
  'staffing.export.tds': { label: 'Staffing desk export: show the TDS the client is expected to deduct', scopes: ['tenant'], dated: false, values: ['none', 'expected'], default: 'none' },
  'staffing.export.round_off': { label: 'Staffing desk export: round each total to the rupee', scopes: ['tenant'], dated: false, values: ['none', 'rupee'], default: 'rupee' },
  'staffing.einvoice.applies': { label: 'Staffing desk: our invoices need an IRN (e-invoicing applies)', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  'staffing.bench.after': { label: 'Staffing desk: after the maximum bench days', scopes: ['tenant'], dated: false, values: ['review', 'unpaid'], default: 'review' },
  'hiring.scorecard.overdue_hours': { label: 'Hiring: a scorecard is overdue this many hours after the interview', scopes: ['tenant'], dated: false, values: ['12', '24', '48', '72'], default: '24' },
  // HIR-02 founder answer 291 (Settings 6.1): a hiring manager's request starts with this recruiter, or with none until
  // recruiting assigns one; never the manager themselves. The value is a person of the company (or none).
  'hiring.requisition.default_recruiter': { label: 'Hiring: default recruiter for new requisitions', scopes: ['tenant'], dated: false, values: ['none'], default: 'none', oneOf: 'company_users' },
  // HIR-28 bulk offers: an offer beyond the free places on the job's headcount-plan line is held (not made) until the plan
  // is revised (starter), or the check is off. A bulk offer expires this many days after it is sent (never after joining).
  'hiring.bulk_offer.plan_check': { label: 'Hiring: bulk offers beyond the free places on the plan line', scopes: ['tenant'], dated: false, values: ['hold', 'off'], default: 'hold', labels: { hold: 'Are held until the plan is revised', off: 'Are not checked against the plan' } },
  'hiring.offer.expiry_days': { label: 'Hiring: an offer expires after (days)', scopes: ['tenant'], dated: false, values: ['3', '5', '7', '10', '14', '30'], default: '7' },
  // Careers answer 352: when an applicant's résumé file fails the safety check, they are emailed a link to their
  // candidate page to upload another (starter on).
  'hiring.resume_quarantine.tell_applicant': { label: 'Hiring: tell applicants when their résumé file could not be accepted', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'on' },
  // Careers answer 356 (D15: white-label is in every plan): hide "Powered by YukthiX" on the careers site and the candidate
  // pages. Starter off.
  'brand.white_label': { label: 'Hide "Powered by YukthiX" on the careers site and candidate pages', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off', platform: { feature: 'white_label' } },
  'home.pay_on_employee_home': { label: 'Show net pay on the employee home', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // P02 §4.5 fraud guard: a new bank account is used for payouts only after this cooling period (starter, D17).
  'employee.bank_change.cooling_hours': { label: 'New bank accounts are used for pay after (hours)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '24', '48', '72'], default: '48', guard: 'access.role.manage' },
  // PPL-43: the day each financial year's BFSI declarations are due (designated persons).
  'bfsi.declaration_due': { label: 'Annual BFSI declarations are due on', scopes: ['tenant', 'legal_entity'], dated: false, values: ['04-30', '06-30', '09-30', '10-15', '12-31'], default: '10-15' },
  // PPL-44: trading pre-clearance for designated persons: the quarterly value that needs it, how long an approval
  // lasts (trading days) and how soon the compliance officer decides.
  'bfsi.preclearance_threshold': { label: 'Pre-clearance is needed for trades in a quarter above (₹)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['500000', '1000000', '2500000'], default: '1000000' },
  'bfsi.preclearance_valid_days': { label: 'A pre-clearance is valid for (trading days)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['5', '7', '10'], default: '7' },
  'bfsi.preclearance_decide_days': { label: 'The compliance officer decides within (working days)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3'], default: '2' },
  // PPL-45: reminders before a visa, permit or national ID expires (days before; the person is told each time).
  'work_auth.reminder_days': { label: 'Remind before a work permit or visa expires (days)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['90,60,30', '60,30', '30', 'off'], default: '90,60,30' },
  // PPL-04 / PPL-09 (P01 YX-ORG-17): where a move between legal entities starts (restructure plans and one-person moves);
  // HR may change any of them for one plan or one person.
  'transfer.leave': { label: 'Leave balance', scopes: ['tenant'], dated: false, values: ['carry', 'lapse'], default: 'carry' },
  'transfer.service': { label: 'Service continuity', scopes: ['tenant'], dated: false, values: ['keep', 'restart'], default: 'keep' },
  'transfer.code': { label: 'Employee code', scopes: ['tenant'], dated: false, values: ['keep', 'new'], default: 'keep' },
  'transfer.salary': { label: 'Salary structure', scopes: ['tenant'], dated: false, values: ['keep', 'new'], default: 'keep' },
  // PPL-03 (founder 28 Oct 2026): the personal details every record must have; the form and the server require them.
  'employee.personal.required': { label: 'Personal details everyone must have', scopes: ['tenant'], dated: false, multi: true, values: ['dateOfBirth', 'gender', 'maritalStatus', 'personalEmail', 'personalPhone', 'addressLine1', 'addressLine2', 'city', 'stateCode', 'postalCode'], default: 'dateOfBirth,gender,personalPhone,addressLine1,city,stateCode' },
  // PPL-32: an employee's own identity or bank change carries proof (a cancelled cheque, the PAN card, a gazette notice).
  'employee.profile_change.proof': { label: 'Proof with an identity or bank change', scopes: ['tenant', 'legal_entity'], dated: false, values: ['required', 'optional'], default: 'required', guard: 'access.role.manage' },
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
  // Leave v2 (29 Oct 2026). Company choices with a default; HR overrides per company, entity or location.
  // Leave during the notice period: allowed with no change to the last day, allowed and the last day moves by the
  // leave days, or only sick and unpaid leave.
  'leave.notice_period.leave': { label: 'Leave during the notice period', scopes: ['tenant', 'legal_entity'], dated: false, values: ['no_change', 'extends_last_day', 'sick_and_unpaid_only'], default: 'no_change' },
  // Leave while on probation: every type, casual / sick / unpaid only, or unpaid only.
  'leave.probation.leave': { label: 'Leave while on probation', scopes: ['tenant', 'legal_entity', 'employment_type'], dated: false, values: ['all', 'casual_sick_unpaid', 'unpaid_only'], default: 'all' },
  // Company block dates: planned leave on them is refused, or allowed with a warning to the approver.
  'leave.block_dates.mode': { label: 'Planned leave on company block dates', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['block', 'warn'], default: 'block' },
  // TIM-22: comp-off for work on a weekly off or holiday is claimed within N days and used within N days of the work.
  'leave.comp_off.claim_within_days': { label: 'Claim comp-off within (days of the work)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['7', '15', '30', '45', '60'], default: '30' },
  'leave.comp_off.expiry_days': { label: 'Comp-off must be used within (days of the work)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['30', '45', '60', '90', '180', '365', 'never'], default: '60' },
  // TIM-24: encashment while in service: the month the window is open (off: only at exit), the most days a year and
  // the days that must stay after encashing. The daily rate follows payroll.leave_encashment_basis.
  'leave.encashment.window': { label: 'Leave can be cashed in while working', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'any_month', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], default: 'off' },
  'leave.encashment.max_days': { label: 'Most days cashed in a year', scopes: ['tenant', 'legal_entity'], dated: false, values: ['5', '7', '10', '15', '20', '30'], default: '7' },
  'leave.encashment.min_left': { label: 'Days that must stay after cashing in', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '5', '7', '10', '15', '30'], default: '7' },
  // TIM-29 (Nov 2026): at year end, encashable leave over the carry-forward limit is paid out up to the type's yearly
  // cash-in limit instead of lapsing; the rest lapses.
  'leave.year_end.encash_excess': { label: 'At year end, pay out cash-in leave over the carry-forward limit', scopes: ['tenant', 'legal_entity'], dated: false, values: ['on', 'off'], default: 'on' },
  'leave.encashment.divisor': { label: 'Daily rate for cashing in: monthly pay divided by', scopes: ['tenant', 'legal_entity'], dated: false, values: ['26', '30'], default: '26' },
  // Founder decision 2 (29 Oct 2026): a leave type with no notice of its own asks for this many days (sick leave: 0 unless
  // the type sets its own); when HR applies for someone the notice is skipped (audited) unless the company says it applies.
  'leave.notice_days.default': { label: 'Apply leave at least this many days ahead (types without their own number)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '1', '2', '3', '5', '7', '10', '14', '15', '21', '30'], default: '0' },
  'leave.notice.on_behalf': { label: 'Notice when HR applies leave for someone', scopes: ['tenant', 'legal_entity'], dated: false, values: ['skip', 'apply'], default: 'skip' },
  // Founder answer B (29 Oct 2026): leave HR applies for someone goes to the person's normal approvers with an "Applied by
  // HR" note; a company may have it approved at once instead (only when that HR person also holds leave.approve over them).
  'leave.on_behalf.approval': { label: 'Leave HR applies for someone', scopes: ['tenant', 'legal_entity'], dated: false, values: ['chain', 'approved'], default: 'chain' },
  // Founder decision 3: the leave liability is unused encashable days x daily pay; daily pay = monthly pay (basis:
  // payroll.leave_encashment_basis) divided by 26, 30 or the days in the month.
  'leave.liability.divisor': { label: 'Daily pay for the leave liability: monthly pay divided by', scopes: ['tenant', 'legal_entity'], dated: false, values: ['26', '30', 'calendar'], default: '26' },
  // TIM-25: sabbatical and long unpaid leave earn leave or not (maternity always counts as service: Maternity Benefit Act).
  'leave.long_absence.accrues': { label: 'Leave is earned during a sabbatical or long unpaid leave', scopes: ['tenant', 'legal_entity'], dated: false, values: ['no', 'yes'], default: 'no' },
  // TIM-23: optional holidays are prorated by the months left after a move to another calendar.
  'leave.optional_holiday.prorate_on_move': { label: 'Prorate optional holidays after a move to another office', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['yes', 'no'], default: 'yes' },
  // TIM-39: people in these designations or departments take a block of consecutive working days off each leave year.
  // Founder (30 Oct 2026): a manager may send a leave request back for changes (with what to change) instead of rejecting it.
  'leave.send_back': { label: 'Approvers can send leave back for changes', scopes: ['tenant', 'legal_entity'], dated: false, values: ['on', 'off'], default: 'on' },
  'leave.block_leave.required': { label: 'Block leave is required', scopes: ['tenant', 'legal_entity', 'location', 'department', 'designation'], dated: false, values: ['no', 'yes'], default: 'no' },
  'leave.block_leave.days': { label: 'Block leave length (working days in a row)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['5', '10', '15'], default: '10' },
  // TIM-42: public-holiday feeds (provider: to decide; dev-fake until then).
  'holiday.feeds': { label: 'Use public-holiday feeds', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  // M02 Q5: regularisations a month with manager approval; beyond that HR approves too.
  'attendance.regularise_monthly_limit': { label: 'Fixes a month with manager approval only', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '2', '3', '4', '5', '6', '8', '10'], default: '4' },
  // TIM-07 / settings 3.5 (19 Oct 2026): work-from-home days a month with manager approval only; beyond that HR approves too.
  'attendance.wfh_monthly_limit': { label: 'Work from home days a month with manager approval only', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '1', '2', '3', '4', '5', '6', '8', '10', '15', '22'], default: '4' },
  // TIM-07 Ot (Nov 2026): overtime asked for ahead of the work. A claim without an approved plan is refused, flagged to
  // the approver ("Not pre-approved"), or allowed; and how far ahead a plan can be asked.
  'attendance.overtime.pre_approval': { label: 'Overtime claimed without pre-approval', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['flag', 'refuse', 'allow'], default: 'flag' },
  'attendance.overtime.plan_ahead_days': { label: 'Overtime can be pre-approved this many days ahead', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '15', '30', '60'], default: '30' },
  // TIM-03 / TIM-07 OnDuty (Nov 2026): how far ahead and back on duty can be asked, and whether the manager may send it
  // back for changes instead of turning it down.
  'attendance.on_duty.ahead_days': { label: 'On duty can be asked this many days ahead', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '7', '15', '30', '60', '90'], default: '30' },
  'attendance.on_duty.back_days': { label: 'On duty can be asked this many days back', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '3', '7', '15', '30', '60'], default: '60' },
  'attendance.on_duty.send_back': { label: 'Managers can send on duty back for changes', scopes: ['tenant', 'legal_entity'], dated: false, values: ['on', 'off'], default: 'on' },
  // Extra · My attendance today, ChoseWfh (30 Oct 2026): someone outside the office may clock in as work from home on the
  // day; the request goes to their manager as usual, and if it is not approved those punches no longer count.
  'attendance.wfh_same_day': { label: 'Clock in as work from home on the day (sent for approval)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['on', 'off'], default: 'on' },
  // Extra · My attendance today, ShiftNotStarted: check-in opens this long before the shift starts (any: no limit).
  'attendance.check_in_opens_minutes': { label: 'Check-in opens before the shift starts (minutes)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['any', '15', '30', '60', '90', '120', '180'], default: 'any' },
  // M02 §B2 / YX-AT-07: the least rest between two shifts of one person; the roster flags anything shorter. Founder
  // decision 9 Oct 2026: 11 hours by default, company-configurable.
  'attendance.min_rest_hours': { label: 'Least rest between shifts (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '8', '9', '10', '11', '12'], default: '11' },
  // TIM-06 flexi and split shifts (founder 2 Nov 2026): company choices, off by default; existing fixed shifts never change.
  'attendance.shift_types.flexi': { label: 'Flexi shifts (core hours) can be set up', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  'attendance.shift_types.split': { label: 'Split shifts (two parts a day) can be set up', scopes: ['tenant'], dated: false, values: ['off', 'on'], default: 'off' },
  'attendance.flexi.late_from': { label: 'On a flexi shift, late is', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['core_start', 'never'], default: 'core_start' },
  'attendance.flexi.short_by': { label: 'On a flexi shift, the day is short when', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['shift_hours', 'core_hours'], default: 'shift_hours' },
  'attendance.split.min_gap_minutes': { label: 'Shortest gap between the two parts of a split shift (minutes)', scopes: ['tenant'], dated: false, values: ['30', '60', '90', '120', '180'], default: '60' },
  // TIM-05 (founder decision 29 Oct 2026): employees see their team's published roster read-only; off: their own shifts only.
  'roster.staff_see_team': { label: "Employees can see their team's published roster", scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, values: ['off', 'on'], default: 'off' },
  // Working-hours limits the roster checks (Factories Act 1948 s.51 / 54 / 56, OSH Code 2020 s.25; a state's shops act
  // may be stricter, so each is per location): hours a day and a week, and the spread-over from start to end of a day.
  'roster.max_daily_hours': { label: 'Most hours of shifts in a day', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['8', '9', '10', '11', '12'], default: '9' },
  'roster.max_weekly_hours': { label: 'Most hours of shifts in a week', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['40', '45', '48', '54', '60'], default: '48' },
  'roster.max_spread_over_hours': { label: 'Longest working day from start to end, breaks included (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['10.5', '12', '13'], default: '10.5' },
  // Factories Act s.52 / shops acts: a weekly off in every week (Monday to Sunday) of the roster.
  'roster.min_weekly_offs': { label: 'Weekly offs each week at least', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '1', '2'], default: '1' },
  // YX-AT-07: a published day that starts within this many hours changes only with a reason, and the person is told at once.
  'roster.change_notice_hours': { label: 'Notice before a published shift changes (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '12', '24', '48', '72'], default: '24' },
  // TIM-35: how an open shift is given: the manager picks from the bids (fair order suggested), or the first eligible claim wins.
  'roster.open_shift_rule': { label: 'Open shifts go to', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['manager_picks', 'first_come'], default: 'manager_picks' },
  // TIM-38: a call-out is paid at least this long, however short the work.
  'standby.call_out_minimum_hours': { label: 'A call-out is paid for at least (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '1', '2', '3', '4'], default: '2' },
  // TIM-41: office days a week (0: no hybrid rule), the days everyone is in, and what counts as being in the office.
  'hybrid.office_days': { label: 'Office days a week', scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, values: ['0', '1', '2', '3', '4', '5'], default: '0' },
  'hybrid.anchor_days': { label: 'Days everyone is in the office', scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, multi: true, values: ['mon', 'tue', 'wed', 'thu', 'fri'], default: '' },
  'hybrid.evidence': { label: 'An office day counts with', scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, multi: true, values: ['geofence', 'network', 'kiosk'], default: 'geofence,network,kiosk' },
  // TIM-12 / TIM-14: phone check-in only from the one phone HR approved for the person.
  'attendance.phone_binding': { label: 'Phone check-in only from an approved phone', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['off', 'on'], default: 'off', guard: 'access.role.manage' },
  // Extra · My attendance today · DeviceNotApproved: web clock-in only from a computer HR approved for the person.
  'attendance.web_device_approval': { label: 'Web clock-in only from an approved computer', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['off', 'on'], default: 'off', guard: 'access.role.manage' },
  // TIM-13: how people identify themselves at a kiosk, and wrong PIN tries before a 15-minute lock.
  'kiosk.methods': { label: 'At a kiosk people sign in with', scopes: ['tenant', 'legal_entity', 'location'], dated: false, multi: true, values: ['pin', 'qr', 'face'], default: 'pin,qr' },
  // TIM-13 (30 Oct 2026): what the kiosk offers besides check-in. Founder: an unknown employee code is refused as unknown
  // (codes are printed on ID cards; the kiosk secret and the rate limit stop probing); a company may hide it again.
  'kiosk.tell_unknown_code': { label: 'Kiosk says when an employee code is unknown', scopes: ['tenant'], dated: false, values: ['yes', 'no'], default: 'yes', guard: 'access.role.manage' },
  'kiosk.leave': { label: 'People can apply leave at a kiosk', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['on', 'off'], default: 'on' },
  'kiosk.training_opens_minutes': { label: 'Training check-in at a kiosk opens this many minutes before the start', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '5', '10', '15', '30', '60'], default: '15' },
  'kiosk.pin_tries': { label: 'Wrong kiosk PIN tries before a 15-minute lock', scopes: ['tenant'], dated: false, values: ['3', '5', '10'], default: '5', guard: 'access.role.manage' },
  // TIM-32 (DPDP Act 2023): location tracking of field staff, only on duty and with consent; how long the trail is kept,
  // how often a moving phone reports, and the least accurate fix kept on the trail.
  'field.tracking': { label: 'Track field staff on duty (with their consent)', scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, values: ['off', 'on'], default: 'off' },
  'field.trail_retention_days': { label: 'Keep the location trail for (days)', scopes: ['tenant'], dated: false, values: ['7', '15', '30', '45', '90', '180'], default: '30' },
  'field.ping_minutes': { label: 'A moving phone reports its place every (minutes)', scopes: ['tenant', 'legal_entity', 'location', 'department'], dated: false, values: ['1', '2', '5', '10', '15'], default: '5' },
  'field.max_accuracy_m': { label: 'Ignore places less accurate than (metres)', scopes: ['tenant'], dated: false, values: ['50', '100', '200', '500'], default: '100' },
  // TIM-43: people may connect their calendar or work tools so the timesheet suggests lines (each person opts in).
  'timesheet.tool_suggestions': { label: 'People may connect calendars and work tools for timesheet suggestions', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
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
  // Founder answer 2 (2 Nov 2026): approving PAY-25 "Request access" gives read-only payroll reports for this many days.
  'payroll.reports_access.days': { label: 'Payroll reports access given on request lasts (days)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7', '30', '60', '90', '180', '365'], default: '90' },
  'payroll.protected_net_percent': { label: 'Recoveries leave at least this share of gross pay (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '10', '20', '25', '30', '40', '50'], default: '0' },
  'payroll.net_rounding': { label: 'Round net pay', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', 'rupee'], default: 'rupee' },
  // Founder decisions 5g-D4 / 5g-D5 (M03 §19.9): the daily rate leave encashment is paid at, and whether an unserved
  // resignation notice is recovered in the F&F (HR can still waive it for one person, with a reason).
  'payroll.leave_encashment_basis': { label: 'Leave encashment is paid on', scopes: ['tenant', 'legal_entity'], dated: false, values: ['basic_da', 'gross'], default: 'basic_da' },
  'payroll.notice_shortfall': { label: 'An unserved notice period is', scopes: ['tenant', 'legal_entity'], dated: false, values: ['recover', 'waive'], default: 'recover' },
  'payroll.standard_daily_hours': { label: 'Standard hours a day (for hourly rates and cost rates)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8', '8.5', '9'], default: '8' },
  // PAY-4.05 (YX-NTF-15): payslips by email as a password-protected PDF (no amounts in the email); off unless the company turns it on.
  // Batch 5e (§8.5, §8.6): the employee picks the regime until this day of the tax year; proofs are sent between the
  // window's opening and the proof cut-off (after it only verified amounts count).
  'tax.regime_cutoff': { label: 'Employees choose their tax regime until (day of the tax year)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['04-30', '05-31', '06-30', '07-31'], default: '05-31' },
  'tax.proof_window_opens': { label: 'Tax proof window opens', scopes: ['tenant', 'legal_entity'], dated: false, values: ['10-01', '11-01', '12-01', '01-01', '01-15'], default: '01-01' },
  'tax.proof_cutoff': { label: 'Tax proof cut-off', scopes: ['tenant', 'legal_entity'], dated: false, values: ['01-31', '02-15', '02-28', '03-15'], default: '02-28' },
  'payroll.payslip_email': { label: 'Email payslips as password-protected PDFs', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
  'payroll.one_time_review_above': { label: 'One-time pay above this amount needs approval', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', '10000', '25000', '50000', '100000'], default: '50000' },
  // Founder decision 8 (29 Oct 2026): a loan or advance is capped at months of gross pay, and only after probation by default.
  'payroll.loan.max_gross_months': { label: 'A loan or advance may be at most (months of gross pay)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', '1', '2', '3', '4', '6', '12'], default: '2' },
  'payroll.loan.after_probation': { label: 'Who may ask for a loan or advance', scopes: ['tenant', 'legal_entity'], dated: false, values: ['confirmed', 'everyone'], default: 'confirmed' },
  // Founder answer 1 (30 Oct 2026): the yearly interest rate is the company's, per loan type; employees never type it.
  // Interest-free by default (no perquisite question); the rate in force on the day of the request is kept on the loan.
  'payroll.loan.interest_rate.advance': { label: 'Interest on a salary advance (% a year)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '4', '5', '6', '7', '7.5', '8', '8.5', '9', '10', '12'], default: '0' },
  'payroll.loan.interest_rate.loan': { label: 'Interest on a personal loan (% a year)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['0', '4', '5', '6', '7', '7.5', '8', '8.5', '9', '10', '12'], default: '0' },
  // PAY-24 statutory bonus (Payment of Bonus Act, 1965; founder rule: policy is configurable). Defaults are the Act's
  // values; a company may only be more generous (a higher limit or ceiling, fewer days), never below the Act.
  'payroll.bonus.year_start_month': { label: 'The bonus accounting year starts in (month number)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], default: '4' },
  'payroll.bonus.eligibility_wage': { label: 'Bonus is paid to people whose wage a month is at most (₹)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['21000', '25000', '30000', '35000', '40000', '50000'], default: '21000' },
  'payroll.bonus.calculation_ceiling': { label: 'Bonus is worked out on the wage up to (₹ a month, or the minimum wage if higher)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['7000', '10000', '15000', '21000'], default: '7000' },
  'payroll.bonus.min_rate': { label: 'Lowest bonus rate (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8.33', '10', '12', '15', '20'], default: '8.33' },
  'payroll.bonus.max_rate': { label: 'Highest bonus rate (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8.33', '10', '12', '15', '20'], default: '20' },
  'payroll.bonus.min_working_days': { label: 'Working days in the year needed for bonus', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '15', '30'], default: '30' },
  'payroll.bonus.min_amount': { label: 'Least bonus for a whole year (₹)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['100', '500', '1000'], default: '100' },
  'payroll.bonus.allocable_percent': { label: 'Allocable surplus is this share of the available surplus (%)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['60', '67'], default: '60' },
  'payroll.bonus.carry_years': { label: 'Set-on and set-off are carried for (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['4'], default: '4' },
  // Founder 30 Oct 2026 (last 10, item 1): which day's salary rate the s.2(13) eligibility test uses each month.
  'payroll.bonus.eligibility_rate_on': { label: 'Bonus eligibility uses the salary rate on', scopes: ['tenant', 'legal_entity'], dated: false, values: ['last_day', 'first_day', 'highest_in_month'], default: 'last_day' },
  'payroll.bonus.due_months': { label: 'Bonus is paid within (months after the year end)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['1', '2', '3', '4', '5', '6', '7', '8'], default: '8' },
  'payroll.mid_period.join': { label: 'Joining in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff', 'next_month_arrears'], default: 'segments' },
  'payroll.mid_period.exit': { label: 'Leaving in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff'], default: 'segments' },
  'payroll.mid_period.revision': { label: 'A pay change in the middle of a month is paid', scopes: ['tenant', 'legal_entity'], dated: false, values: ['segments', 'cutoff', 'next_month_arrears'], default: 'segments' },
  'payroll.mid_period.cutoff_day': { label: 'Whole-month cut-off day (changes after it are paid next month)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['10', '15', '20', '25'], default: '15' },
  'payroll.document_retention_years': { label: 'Keep issued pay documents for (years)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['8', '10', '12', '15'], default: '8', guard: 'access.role.manage' },
  // Time ops (29 Oct 2026, TIM-11): who closes an attendance month. one_step: whoever holds attendance.lock locks it.
  // two_step: HR (attendance.lock) sends it, then payroll (attendance.lock.approve) approves the lock; never the same person.
  'attendance.lock_flow': { label: 'Locking an attendance month', scopes: ['tenant', 'legal_entity'], dated: false, values: ['one_step', 'two_step'], default: 'one_step' },
  // TIM-03 / §B6: late marks a month that cost nothing, and what each late mark over them costs in unpaid days.
  'attendance.late_marks_free': { label: 'Late marks a month without a deduction', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '1', '2', '3', '4', '5', '6'], default: '3' },
  'attendance.late_mark_penalty': { label: 'Each late mark over the free ones costs (days of pay)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['0', '0.5', '1'], default: '0' },
  // TIM-36: presence-based attendance on work-from-home days (desktop app / Teams presence), only with each person's consent.
  'attendance.presence': { label: 'Presence-based attendance on work-from-home days', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
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
/**
 * Founder answer 151: each location's own attendance.factories_act value in force on `today` (dated: the latest from on
 * or before it), so the pages can say "mark it as a registered factory" or "no longer needed".
 */
export function locationValuesInForce(rows: readonly { scopeType: string; scopeId: string; value: unknown; validFrom: string | null }[], today: string): Map<string, string> {
  const best = new Map<string, { value: string; validFrom: string }>();
  for (const r of rows)
    if (r.scopeType === 'location' && r.validFrom !== null && r.validFrom <= today && (!best.has(r.scopeId) || best.get(r.scopeId)!.validFrom < r.validFrom)) best.set(r.scopeId, { value: String(r.value), validFrom: r.validFrom });
  return new Map([...best].map(([k, v]) => [k, v.value]));
}

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
