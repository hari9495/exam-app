import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Question-bank AI (inert until the org configures an AI key -> friendly 400). One-shot generations.

export interface SuggestedTags {
  existing: { tagId: string; name: string }[];
  suggested: string[];
}

export function useSuggestQuestionTags() {
  const { accessToken } = useAuth();
  return useMutation<SuggestedTags, Error, { text: string; options?: string[] }>({
    mutationFn: (input) =>
      apiFetch('/questions/ai/tags', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<SuggestedTags>,
  });
}

export function useGenerateDistractors() {
  const { accessToken } = useAuth();
  return useMutation<{ distractors: string[] }, Error, { stem: string; correctAnswers: string[]; count?: number }>({
    mutationFn: (input) =>
      apiFetch('/questions/ai/distractors', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ distractors: string[] }>,
  });
}
