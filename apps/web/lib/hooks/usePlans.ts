import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Plan } from '../types';
import { useAuth } from '../auth-context';

export function usePlans() {
  const { accessToken } = useAuth();
  return useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => apiFetch('/platform/plans', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpsertPlanInput {
  name: string;
  seatLimit: number;
  candidateLimit: number;
  aiCreditLimit: number;
  proctoringMinutesLimit: number;
  priceLabel?: string;
  isPublic?: boolean;
}

export function useCreatePlan() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPlanInput): Promise<Plan> =>
      apiFetch('/platform/plans', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useUpdatePlan() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpsertPlanInput & { id: string }): Promise<Plan> =>
      apiFetch(`/platform/plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useAssignPlan() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }): Promise<{ id: string }> =>
      apiFetch(`/platform/organizations/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ planId }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
