'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LimitFamily, MoveRow, NoticeRow, PastRequest, PolicyBodyInput, PolicyTypeRow, TryInput, TryResult } from '@yukthix/ui/hiring';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// Settings S-6 (answer 1330), widened by E2: the company's approval rules per request type (/workflow/policies), "Try
// it", the approval limits (/workflow/approval-limits), the hiring notices and the move of the old hiring routes.
export interface PoliciesData {
  remindHours: number;
  escalateHours: number;
  types: PolicyTypeRow[];
}
export interface LimitsData {
  grades: { id: string; name: string; code: string; rank: number }[];
  families: LimitFamily[];
}
export const APPROVAL_POLICIES = '/yx/settings/approval-policies';
export const APPROVAL_LIMITS = '/yx/settings/approval-limits';

export function useApprovalPolicies(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<PoliciesData>({ queryKey: ['workflow', 'policies'], queryFn: () => apiFetch('/workflow/policies', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

export function useApprovalLimits(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<LimitsData>({ queryKey: ['workflow', 'limits'], queryFn: () => apiFetch('/workflow/approval-limits', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

/** Part 6: the old hiring routes next to the new rules (only for those who may change settings). */
export function useHiringMove(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<MoveRow[]>({ queryKey: ['workflow', 'hiring-move'], queryFn: () => apiFetch('/workflow/hiring-move', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

export function useApprovalPolicyWrite() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const token = accessToken ?? undefined;
  const send = (path: string, method: 'PUT' | 'POST', body: unknown) => apiFetch(path, { method, body: JSON.stringify(body) }, token);
  const call = async (path: string, method: 'PUT' | 'POST', body: unknown) => {
    const out = await send(`/workflow/policies${path}`, method, body);
    await qc.invalidateQueries({ queryKey: ['workflow'] });
    await qc.invalidateQueries({ queryKey: ['yx', 'org'] });
    return out;
  };
  const t = (type: string) => `/${encodeURIComponent(type)}`;
  return {
    save: (type: string, body: PolicyBodyInput, version: number) => call(t(type), 'PUT', { ...body, version }),
    reset: (type: string, version: number) => call(`${t(type)}/reset`, 'POST', { version }),
    tryIt: (type: string, input: TryInput) => send(`/workflow/policies${t(type)}/try`, 'POST', input) as Promise<TryResult>,
    pastRequests: (type: string) => apiFetch(`/workflow/policies${t(type)}/requests`, {}, token) as Promise<PastRequest[]>,
    notices: {
      load: (type: string) => apiFetch(`/workflow/policies${t(type)}/notices`, {}, token) as Promise<{ events: NoticeRow[] }>,
      save: (type: string, event: string, v: { subject: string; body: string }) => send(`/workflow/policies${t(type)}/notices/${encodeURIComponent(event)}`, 'PUT', v),
      reset: (type: string, event: string) => send(`/workflow/policies${t(type)}/notices/${encodeURIComponent(event)}/reset`, 'POST', {}),
    },
    saveLimits: async (family: string, rows: { gradeId: string; amount: string }[]) => {
      const out = await send(`/workflow/approval-limits/${encodeURIComponent(family)}`, 'PUT', { rows });
      await qc.invalidateQueries({ queryKey: ['workflow', 'limits'] });
      return out;
    },
    move: async () => {
      const out = await send('/workflow/hiring-move', 'POST', {});
      await qc.invalidateQueries({ queryKey: ['workflow'] });
      return out;
    },
  };
}
