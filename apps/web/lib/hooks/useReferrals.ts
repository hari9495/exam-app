import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { ReferableJob, ReferralRow } from '../types';

export interface SubmitReferralInput {
  jobId: string;
  name: string;
  email: string;
  phone?: string;
  resumeBase64?: string;
  note?: string;
}

export function useReferableJobs() {
  const { accessToken } = useAuth();
  return useQuery<ReferableJob[]>({
    queryKey: ['referrals', 'jobs'],
    queryFn: () => apiFetch('/referrals/jobs', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useMyReferrals() {
  const { accessToken } = useAuth();
  return useQuery<ReferralRow[]>({
    queryKey: ['referrals', 'mine'],
    queryFn: () => apiFetch('/referrals/mine', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Recruiter view — 403s for staff without candidate:view, so only enable it for privileged roles.
export function useAllReferrals(enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<ReferralRow[]>({
    queryKey: ['referrals', 'all'],
    queryFn: () => apiFetch('/referrals', {}, accessToken ?? undefined),
    enabled: enabled && Boolean(accessToken),
  });
}

export function useSubmitReferral() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitReferralInput): Promise<{ id: string }> =>
      apiFetch('/referrals', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referrals'] }),
  });
}

export function useSetReferralReward() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rewardStatus, rewardNote }: { id: string; rewardStatus: string; rewardNote?: string }): Promise<{ id: string; rewardStatus: string }> =>
      apiFetch(`/referrals/${id}/reward`, { method: 'PATCH', body: JSON.stringify({ rewardStatus, rewardNote }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referrals'] }),
  });
}
