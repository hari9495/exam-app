import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Exam } from '../types';
import { useAuth } from '../auth-context';

export function useExams(status?: string) {
  const { accessToken } = useAuth();
  return useQuery<Exam[]>({
    queryKey: ['exams', status ?? 'default'],
    queryFn: () => apiFetch(`/exams${status ? `?status=${status}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useExam(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<Exam>({
    queryKey: ['exams', id],
    queryFn: () => apiFetch(`/exams/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}

interface CreateExamInput {
  title: string;
  instructions?: string;
  durationMinutes?: number;
  passCriteriaPercent?: number;
  randomizeOrder?: boolean;
}

export function useCreateExam() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      apiFetch('/exams', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });
}

export function useUpdateExam(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      apiFetch(`/exams/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}

export function usePublishExam(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/exams/${id}/publish`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}
