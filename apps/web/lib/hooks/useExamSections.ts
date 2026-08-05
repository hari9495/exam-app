import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { PoolPreview } from '../types';

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

export function useUpdateSection(examId: string, sectionId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weightPercent?: number; requiredCount?: number | null }) =>
      apiFetch(
        `/exams/${examId}/sections/${sectionId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ),
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

export function useDeleteSection(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      apiFetch(`/exams/${examId}/sections/${sectionId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}

export function useDuplicateSection(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      apiFetch(`/exams/${examId}/sections/${sectionId}/duplicate`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}

// A pool section never stores which questions it drew (see the backend comment on
// previewSectionPool) -- there is nothing to fetch until the recruiter actually opens the
// preview, so this stays disabled until `enabled` is true rather than firing on every render
// of a page that happens to list several pool sections.
export function usePoolPreview(examId: string, sectionId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<PoolPreview>({
    queryKey: ['exams', examId, 'sections', sectionId, 'pool-preview'],
    queryFn: () => apiFetch(`/exams/${examId}/sections/${sectionId}/pool-preview`, {}, accessToken ?? undefined),
    enabled: enabled && Boolean(accessToken),
  });
}
