import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { ApprovalChain, ApprovalGate, ApprovalRequestSummary, ApprovalRequestDetail } from '../types';

export function useApprovalChains() {
  const { accessToken } = useAuth();
  return useQuery<{ requisition: ApprovalChain; offer: ApprovalChain }>({
    queryKey: ['approvals', 'chains'],
    queryFn: () => apiFetch('/organizations/approvals/chains', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface UpsertApprovalChainInput {
  gate: ApprovalGate;
  enabled: boolean;
  steps: { name: string; approverType: string; approverUserIds?: string[]; managerLevel?: number }[];
}

export function useUpsertApprovalChain() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertApprovalChainInput) =>
      apiFetch(
        `/organizations/approvals/chains/${input.gate}`,
        { method: 'PUT', body: JSON.stringify({ enabled: input.enabled, steps: input.steps }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', 'chains'] });
      // Recruiters read gate state from gate-status (chains is admin-only, see
      // useApprovalGateStatus below) -- keep it in sync whenever an admin toggles a gate.
      queryClient.invalidateQueries({ queryKey: ['approvals', 'gate-status'] });
    },
  });
}

// Lightweight, auth-only alternative to useApprovalChains() for surfaces that only need to know
// whether a gate is on/off (not the full chain config, which requires approvals:configure).
// Recruiters get a 403 from useApprovalChains's endpoint, which used to be silently swallowed
// into offerGateOn=false -- this hooks into a dedicated endpoint any org user can call instead.
export function useApprovalGateStatus() {
  const { accessToken } = useAuth();
  return useQuery<{ requisition: boolean; offer: boolean }>({
    queryKey: ['approvals', 'gate-status'],
    queryFn: () => apiFetch('/approvals/gate-status', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useApprovalRequests(scope: 'inbox' | 'submitted', status?: string) {
  const { accessToken } = useAuth();
  return useQuery<ApprovalRequestSummary[]>({
    queryKey: ['approvals', 'requests', scope, status ?? ''],
    queryFn: () => apiFetch(`/approvals/requests?scope=${scope}${status ? `&status=${status}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useApprovalRequest(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<ApprovalRequestDetail>({
    queryKey: ['approvals', 'request', id],
    queryFn: () => apiFetch(`/approvals/requests/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && id),
  });
}

export function useDecideApproval() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      apiFetch(
        `/approvals/requests/${input.id}/decide`,
        { method: 'POST', body: JSON.stringify({ decision: input.decision, note: input.note }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-offers'] });
    },
  });
}
