'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PolicyStepInput, PolicyTypeRow } from '@yukthix/ui/hiring';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// Settings S-6 (answer 1330): the company's approval steps per request type (GET/PUT /workflow/policies).
export interface PoliciesData {
  remindHours: number;
  escalateHours: number;
  types: PolicyTypeRow[];
}
export const APPROVAL_POLICIES = '/yx/settings/approval-policies';

export function useApprovalPolicies(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<PoliciesData>({ queryKey: ['workflow', 'policies'], queryFn: () => apiFetch('/workflow/policies', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

export function useApprovalPolicyWrite() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const call = async (path: string, method: 'PUT' | 'POST', body: unknown) => {
    const out = await apiFetch(`/workflow/policies${path}`, { method, body: JSON.stringify(body) }, accessToken ?? undefined);
    await qc.invalidateQueries({ queryKey: ['workflow', 'policies'] });
    await qc.invalidateQueries({ queryKey: ['yx', 'org'] });
    return out;
  };
  return {
    save: (type: string, steps: PolicyStepInput[], version: number) => call(`/${encodeURIComponent(type)}`, 'PUT', { steps, version }),
    reset: (type: string, version: number) => call(`/${encodeURIComponent(type)}/reset`, 'POST', { version }),
  };
}
