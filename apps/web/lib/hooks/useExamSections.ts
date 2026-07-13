import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

interface SectionInput {
  title: string;
  targetDurationMinutes?: number;
}

export function useCreateSection(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SectionInput) =>
      apiFetch(`/exams/${examId}/sections`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}

export function useReplaceSectionQuestions(examId: string, sectionId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionIds: string[]) =>
      apiFetch(
        `/exams/${examId}/sections/${sectionId}/questions`,
        { method: 'PUT', body: JSON.stringify({ questionIds }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}
