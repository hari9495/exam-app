import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate, CandidateDataExport } from '../types';
import { useAuth } from '../auth-context';

export function useLookupCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch(`/candidates/lookup?email=${encodeURIComponent(email)}`, {}, accessToken ?? undefined) as Promise<Candidate>,
  });
}

export function useExportCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch(`/candidates/${candidateId}/export`, {}, accessToken ?? undefined) as Promise<CandidateDataExport>,
  });
}

export function useEraseCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch(`/candidates/${candidateId}/erase`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined) as Promise<{
        id: string;
        erasedAt: string;
      }>,
  });
}
