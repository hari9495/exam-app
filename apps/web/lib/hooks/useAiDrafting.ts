import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// AI drafting endpoints (inert until the org configures an AI key -> the API returns a friendly
// "configure a key" 400 the callers surface). All are one-shot generations, not cached.

export function useGenerateJobDescription() {
  const { accessToken } = useAuth();
  return useMutation<{ description: string }, Error, { title: string; seniority?: string; keySkills?: string; notes?: string }>({
    mutationFn: (input) =>
      apiFetch('/ai/job-description', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ description: string }>,
  });
}

export function useGenerateOfferLetter(entryId: string) {
  const { accessToken } = useAuth();
  return useMutation<{ body: string }, Error, { salary?: string; startDate?: string; notes?: string }>({
    mutationFn: (input) =>
      apiFetch(`/ai/entries/${entryId}/offer-letter`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ body: string }>,
  });
}

export function useGenerateOutreachEmail(entryId: string) {
  const { accessToken } = useAuth();
  return useMutation<{ subject: string; body: string }, Error, { intent: string; tone?: string }>({
    mutationFn: (input) =>
      apiFetch(`/ai/entries/${entryId}/outreach-email`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ subject: string; body: string }>,
  });
}

export interface FunnelNarrativeResult { narrative: string; highlights: string[] }
export function useGenerateFunnelNarrative() {
  const { accessToken } = useAuth();
  return useMutation<FunnelNarrativeResult, Error, { jobTitle?: string; totalCandidates?: number; stages: { name: string; count: number }[] }>({
    mutationFn: (input) =>
      apiFetch('/ai/funnel-narrative', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<FunnelNarrativeResult>,
  });
}
