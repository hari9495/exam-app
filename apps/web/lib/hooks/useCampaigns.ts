import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { DripCampaign, DripStep } from '../types';

export interface CampaignInput {
  name: string;
  enabled?: boolean;
  targetGlobalStage?: string;
  steps: DripStep[];
}

export function useCampaigns() {
  const { accessToken } = useAuth();
  return useQuery<DripCampaign[]>({
    queryKey: ['drip-campaigns'],
    queryFn: () => apiFetch('/drip-campaigns', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useCreateCampaign() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CampaignInput): Promise<DripCampaign> =>
      apiFetch('/drip-campaigns', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip-campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CampaignInput }): Promise<DripCampaign> =>
      apiFetch(`/drip-campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip-campaigns'] }),
  });
}

export function useSetCampaignEnabled() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }): Promise<DripCampaign> =>
      apiFetch(`/drip-campaigns/${id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip-campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ deleted: boolean }> =>
      apiFetch(`/drip-campaigns/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drip-campaigns'] }),
  });
}
