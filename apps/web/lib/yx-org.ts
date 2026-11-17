import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyRules, LoadState, StateOption } from '@yukthix/ui/org';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Settings › Organisation (P01). The screens in @yukthix/ui/org stay presentational.

/** Keys the YukthiX navigation and screens care about; the API checks each call anyway. */
export const YX_KEYS = [
  // S-9: the billing pages of Settings › Billing & Account (8.1 to 8.3, 8.5).
  'org:manage_billing',
  // Answer 1884: finance people read the plan, usage and invoices.
  'billing.view',
  // S-10: Integrations, AI and Developers (the older System Admin key, checked in the S-10 security check).
  'org:manage_settings',
  // Answer 1901: IT staff run integrations without being System Admins.
  'integration.manage',
  'org.structure.view',
  'org.settings.manage',
  'org.entity.statutory.manage',
  'pay.range.view',
  'pay.range.manage',
  'employee.profile.view',
  'employee.change.manage',
  'employee.change.approve',
  'employee.salary.manage',
  'employee.salary.view',
  'request.raise_on_behalf',
  // P02 §4.2–4.5 (step 2d).
  'access.role.manage',
  'employee.identity.manage',
  'employee.identity.approve',
  // PPL-34: the Identity panel is Special class.
  'employee.aadhaar.view',
  // PPL-38: disability declarations (Special), the HR diversity role.
  'employee.disability.view',
  // PPL-43 / PPL-44: the compliance officer.
  'compliance.declaration.manage',
  // P02 Q8 (step 3): the System Admin decides on YukthiX support sessions.
  'org.support_access.approve',
  // P04 Q5: Settings › Notifications › Email.
  'notification.template.manage',
  // M14 Service Desk (3b-1): tickets for desk members, set-up for desk and Service Desk admins.
  'desk.ticket.view',
  'desk.desk.create',
  'desk.settings.manage',
  'desk.member.manage',
  'desk.sla.manage',
  // Batch 2: monthly SLA compliance for leads.
  'desk.report.view',
  // Batch 3: email in and out, outside help pages, customers, known-issue banners.
  'desk.mailbox.manage',
  'desk.portal.manage',
  'desk.customer.manage',
  'desk.ticket.work',
  // Batch 4: knowledge (read, write, publish) and article-request tasks from content gaps.
  'desk.kb.view_internal',
  'desk.kb.author',
  'desk.kb.publish',
  'desk.task.work',
  // Batch 4: reports, wall screens and NPS surveys.
  'desk.report.manage',
  'desk.survey.manage',
  // Batch 4: YukthiX support (Contact YukthiX).
  'org.yukthix_support.raise',
  // Batch 4: the standalone people list and directory sync.
  'desk.directory.manage',
  // 3b-2 batch 1: the catalogue, desk rules and webhooks.
  'desk.catalog.manage',
  'desk.rule.manage',
  'desk.integration.manage',
  // 3b-2 batch 2.
  'desk.lifecycle.manage',
  'desk.channel.manage',
  'desk.chat.work',
  'desk.hr_summary.view',
  'desk.ticket.move',
  // 3b-2 batch 3: leads plan the team and its shifts.
  'desk.ticket.assign',
  // Step 4 time and leave: HR views in scope, balances, set-up.
  'leave.settings.manage',
  'leave.view',
  'leave.balance.adjust',
  // Founder answer A (29 Oct 2026): Payroll reads the leave liability report only.
  'leave.liability.view',
  'attendance.view',
  // Step 4 batch 2: rosters in scope and locking attendance months.
  'roster.manage',
  'attendance.lock',
  // Founder decision 5 (29 Oct 2026): payroll approves the lock HR sent (two-step flow).
  'attendance.lock.approve',
  // M03 payroll batch 5a: pay periods and reopen, pay documents, payroll files, the audit log.
  'payroll.period.view',
  'payroll.period.reopen',
  'payroll.period.reopen.approve',
  'payroll.document.view',
  'payroll.file.view',
  'audit.view',
  'audit.export',
  // M01 lifecycle batch 6a: joiners, checklists, documents.
  'lifecycle.onboarding.view',
  'lifecycle.onboarding.manage',
  'lifecycle.journey.template.manage',
  'document.view',
  'document.manage',
  // Batch 6b: background checks, letters, signatories.
  'lifecycle.bgv.manage',
  'letter.template.manage',
  'letter.issue',
  'letter.signatory.manage',
  'lifecycle.exit.view',
  'lifecycle.exit.manage',
  'lifecycle.exit.confidential.view',
  'succession.manage',
  'asset.view',
  'asset.manage',
  // M05 expenses E1.
  'expense.policy.manage',
  'expense.policy.view',
  // HLP-10 / HLP-11 company policies.
  'policy.manage',
  'policy.publish',
  // HLP-06 speak-up set-up.
  'speakup.setup.manage',
  // HLP-08 disciplinary show-cause cases.
  'case.disciplinary.raise',
  'expense.claim.view',
  'expense.finance.review',
  'travel.booking.manage',
  'expense.payout.manage',
  'expense.report.view',
  // Batch 5b: payroll set-up, statutory registrations, components, templates, imports.
  'payroll.setup.manage',
  'payroll.statutory.setup',
  'payroll.component.manage',
  'payroll.template.manage',
  'payroll.import.run',
  // Batch 5j: runs, inputs, pay-out, statutory filings, F&F and arrears.
  'payroll.run.view',
  'payroll.run.prepare',
  'payroll.run.approve',
  'payroll.input.manage',
  'payroll.hold.manage',
  'payroll.bankfile.generate',
  'payroll.bankfile.release',
  'payroll.payslip.publish',
  'payroll.offcycle.prepare',
  'payroll.arrears.approve',
  'payroll.fnf.manage',
  'payroll.writeoff.approve',
  'statutory.filing.view',
  'statutory.filing.generate',
  'statutory.filing.mark_filed',
  'statutory.challan.manage',
  'payroll.notice.waive',
  // PAY-24 statutory bonus.
  'payroll.bonus.manage',
  'payroll.bonus.approve',
  // PAY-25 payroll reports.
  'payroll.reports.view',
  // Payroll operations screens (PAY-10.09 … 10.16).
  'payroll.payment.record',
  'payroll.loan.manage',
  'consultant.manage',
  'consultant.invoice.approve',
  'payroll.special.manage',
  'payroll.ewa.manage',
  'payroll.equity.manage',
  'payroll.journal.export',
  'payroll.query.handle',
  'payroll.document.issue',
  'tax.proof.verify',
  // Batch H part 2 E2: Declare for an employee.
  'tax.regime.override',
  'statutory.filing.download',
  'statutory.register.sign',
  'statutory.advisory.review',
  // Assessments AS-2: Settings 6.5 (the company's assessment defaults).
  'assessments.settings.manage',
  // M06 performance PM1.
  'perf.setup.manage',
  'perf.goal.view',
  'perf.goal.manage',
  'perf.concern.seal',
  'perf.cycle.manage',
  'perf.review.view',
  'perf.feedback.investigate',
  'perf.calibration.facilitate',
  'perf.report.view',
  'perf.comp.manage',
  'perf.comp.approve',
  'perf.pip.manage',
  'perf.dispute.manage',
  // M10 AT1: hiring (the older keys answer for the new ones too, founder D2).
  'pipeline:manage',
  'results:view',
  // AT2: headcount plans and the hiring approval routes.
  'ats.headcount.manage',
  'ats.requisition.raise',
  // HIR-11 / HIR-12: recruiting costs and All referrals in the Hiring menu.
  'ats.costs.manage',
  // HIR-28: bulk offers (and offer pay) need the offer-pay key.
  'ats.offer.compensation.view',
  'ats.referral.manage',
  // Settings 6.1 Hiring.
  'ats.settings.manage',
  // Staffing desk (HIR-14, HIR-15, Settings 6.2).
  'ats.staffing.manage',
  'ats.staffing.view',
  // Projects P-1: Settings › Projects & timesheets.
  'projects.manage',
  // Projects P-5: Costing & margin.
  'projects.finance',
  // HIR-21 vendors (the recruitment agencies).
  'ats.agency.manage',
  // Staffing slice 3: staffing finance (invoices, receipts, vendor invoices).
  'ats.staffing.billing',
  // Contract labour CL-1: contractors and their licences, Settings 4.9.
  'clra.contractor.manage',
  'clra.contractor.view',
  'clra.settings.manage',
  // Visitors slice 1: the desk, the log and the visitor settings.
  'visitors.desk.manage',
  'visitors.log.view',
  'visitors.settings.manage',
  // Visitors slice 3: the watch-list (HR and Facility admin).
  'visitors.watchlist.manage',
  // Visitors slice 4: the emergency roll-call (reception, security, HR).
  'visitors.rollcall.view',
  // Menu items that checked keys nobody asked for (yx-nav-keys.test.ts): team pay access, the older assessment screens.
  'employee.pay_access.approve',
  'exam:manage',
  'question_bank:manage',
  // Bank follow-ups (answer 2001): Hire › Assessments for holders of the YukthiX bank key (or its older alias).
  'asmt.bank.manage',
  // AS-3 (answer 2159): Tests for test writers; Invitations & drives for inviters (the YukthiX keys; older aliases above).
  'asmt.test.manage',
  'ats.candidate.manage',
  // AS-5: Integrity review and Appeals.
  'asmt.proctor',
  'asmt.evaluate',
  // AS-6: Fairness for results readers.
  'asmt.results.view',
  'approvals:configure',
  // AT3: the careers site, consent notices and job boards (company settings).
  'org:manage_settings',
  // AT4: candidates (list, profile, merge, lists) and data rights (legal hold, erase, retention).
  'candidate:manage',
  'candidate:view',
  'candidate:data_rights',
  // AT5: interviews (panellists) and scorecard templates.
  'interview:view_assigned',
  'pipelines:configure',
] as const;
export type YxKey = (typeof YX_KEYS)[number];

export function useYxPermissions() {
  const { accessToken } = useAuth();
  const q = useQuery<YxKey[]>({
    queryKey: ['yx', 'permissions'],
    queryFn: () => apiFetch(`/rbac/me/permissions?keys=${YX_KEYS.join(',')}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });
  const has = (key: YxKey) => Boolean(q.data?.includes(key));
  return { ...q, has };
}

/** One GET under the org API, cached under ['yx', 'org', ...path]. */
export function useOrg<T>(path: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['yx', 'org', path], queryFn: () => apiFetch(`/org${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

/** A one-off read (not cached), e.g. Confidential values each opening of which is recorded. */
export function useOrgRead() {
  const { accessToken } = useAuth();
  return <T>(path: string): Promise<T> => apiFetch(`/org${path}`, {}, accessToken ?? undefined);
}

/** Calls the org API and refreshes every org list. */
export function useOrgWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async (method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => {
    const result = await apiFetch(`/org${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['yx', 'org'] });
    return result;
  };
}

/** The page's state from its queries: a plain 403 is a missing permission (MFA_REQUIRED is handled by the layout). */
export function loadState(...queries: { isError: boolean; isSuccess: boolean; error: unknown }[]): LoadState {
  const err = queries.find((q) => q.isError)?.error as { status?: number; code?: string } | undefined;
  if (err) return err.status === 403 && err.code !== 'MFA_REQUIRED' ? 'no-access' : 'error';
  return queries.every((q) => q.isSuccess) ? 'ready' : 'loading';
}

export interface Reference {
  states: (StateOption & { country: string })[];
  regions: { code: string; countries: string[] }[];
}

interface SettingsList {
  registry: Record<string, { default: string }>;
  overrides: { id: string; key: string; scopeType: string; value: unknown }[];
}

/** The company-wide rules with where each value comes from (YX-ORG-12). */
export function companyRules(list: SettingsList | undefined): CompanyRules | null {
  if (!list) return null;
  const rule = <V extends string>(key: string) => {
    const row = list.overrides.find((o) => o.key === key && o.scopeType === 'tenant');
    return { value: (row ? row.value : list.registry[key]?.default) as V, source: row ? ('company' as const) : ('default' as const) };
  };
  return { employeeCodeScope: rule('employee_code.scope'), defaultOwnership: rule('org.master.default_ownership') };
}

export const RULE_KEYS = { employeeCodeScope: 'employee_code.scope', defaultOwnership: 'org.master.default_ownership' } as const;

/** Today in India (the one live region): pay ranges starting after it may still change. */
export const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
