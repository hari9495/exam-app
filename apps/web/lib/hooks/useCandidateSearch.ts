import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Semantic candidate search + find-similar. Both are inert until the org configures an embeddings
// provider (the API then returns a friendly 400 / an empty 'not_embedded' result).

export interface CandidateMatch {
  candidateId: string;
  name: string;
  title: string | null;
  score: number;
}

export function useSemanticCandidateSearch() {
  const { accessToken } = useAuth();
  return useMutation<{ results: CandidateMatch[] }, Error, { query: string; limit?: number }>({
    mutationFn: (input) =>
      apiFetch('/candidates/search', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ results: CandidateMatch[] }>,
  });
}

export function useSimilarCandidates(candidateId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<{ results: CandidateMatch[]; status: 'ok' | 'not_embedded' }>({
    queryKey: ['similar-candidates', candidateId],
    queryFn: () => apiFetch(`/candidates/${candidateId}/similar`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId && enabled),
  });
}

export interface DuplicatePair {
  a: { candidateId: string; name: string; title: string | null };
  b: { candidateId: string; name: string; title: string | null };
  score: number;
}

// Org-wide near-duplicate scan. Fetches only once triggered (enabled), and never auto-refetches.
export function useDuplicateCandidates(enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<{ pairs: DuplicatePair[]; scanned: number; capped: boolean }>({
    queryKey: ['candidate-duplicates'],
    queryFn: () => apiFetch('/candidates/duplicates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && enabled),
    staleTime: 60_000,
  });
}
