import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Exam, ExamListItem, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseExamsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildExamsQuery(status: string | undefined, params: UseExamsParams): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useExams(status?: string, params: UseExamsParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<ExamListItem>>({
    queryKey: ['exams', status ?? 'default', params],
    queryFn: () => apiFetch(`/exams${buildExamsQuery(status, params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    // Keep previous results during search/page refetches so the loading early-return
    // doesn't unmount the search input and drop focus (see useCandidates).
    placeholderData: (prev) => prev,
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
  schedulingEnabled?: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
  walkInEnabled?: boolean;
  walkInListed?: boolean;
  enableAntiCheating?: boolean;
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

export function useUnpublishExam(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/exams/${id}/unpublish`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}

export function useSetWalkInEnabled(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (walkInEnabled: boolean) =>
      apiFetch(`/exams/${id}/walk-in`, { method: 'PATCH', body: JSON.stringify({ walkInEnabled }) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}

export function useSetWalkInListed(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (walkInListed: boolean) =>
      apiFetch(`/exams/${id}/walk-in-listed`, { method: 'PATCH', body: JSON.stringify({ walkInListed }) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
    },
  });
}

export function useDuplicateExam() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) =>
      apiFetch(`/exams/${examId}/duplicate`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });
}

export function useArchiveExam() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) =>
      apiFetch(`/exams/${examId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });
}
