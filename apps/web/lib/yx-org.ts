import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyRules, LoadState, StateOption } from '@yukthix/ui/org';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Settings › Organisation (P01). The screens in @yukthix/ui/org stay presentational.

/** Keys the YukthiX navigation and screens care about; the API checks each call anyway. */
export const YX_KEYS = [
  'org.structure.view',
  'org.settings.manage',
  'org.entity.statutory.manage',
  'pay.range.view',
  'pay.range.manage',
  'employee.profile.view',
  'employee.change.manage',
  'employee.change.approve',
  'employee.salary.manage',
  'request.raise_on_behalf',
  // P02 §4.2–4.5 (step 2d).
  'access.role.manage',
  'employee.identity.manage',
  'employee.identity.approve',
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
  // Step 4 time and leave: HR views in scope, balances, set-up.
  'leave.settings.manage',
  'leave.view',
  'leave.balance.adjust',
  'attendance.view',
  // Step 4 batch 2: rosters in scope and locking attendance months.
  'roster.manage',
  'attendance.lock',
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
