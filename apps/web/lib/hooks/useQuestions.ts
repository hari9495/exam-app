import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { Question, QuestionType, Difficulty, Tag, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface QuestionFilters {
  difficulty?: Difficulty;
  tagId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildQuery(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tagId) params.set('tagId', filters.tagId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useQuestions(filters: QuestionFilters = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Question>>({
    queryKey: ['questions', filters],
    queryFn: () => apiFetch(`/questions${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useQuestion(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<Question>({
    queryKey: ['questions', id],
    queryFn: () => apiFetch(`/questions/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}

export function useTags() {
  const { accessToken } = useAuth();
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => apiFetch('/tags', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface QuestionInput {
  type: QuestionType;
  text: string;
  topic?: string;
  category?: string;
  difficulty: Difficulty;
  marks: number;
  negativeMarks?: number;
  tags?: string[];
  languageMode?: string;
  allowedLanguages?: string[];
  starterCode?: string;
  allowStdin?: boolean;
  snippetCode?: string;
  snippetLanguage?: string;
  imageUrl?: string;
  options: { text: string; isCorrect: boolean; imageUrl?: string }[];
}

export function useCreateQuestion() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) =>
      apiFetch('/questions', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useUpdateQuestion(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionInput) =>
      apiFetch(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['questions', id] });
    },
  });
}

export interface BulkUploadRowError {
  row: number;
  message: string;
}

export interface BulkUploadResult {
  created: Question[];
  errors: BulkUploadRowError[];
}

export function useBulkUploadQuestions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<BulkUploadResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/questions/bulk-upload', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useDownloadBulkUploadTemplate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: () => apiFetchBlob('/questions/bulk-upload/template', {}, accessToken ?? undefined),
  });
}

export function useUploadQuestionImage() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (file: File): Promise<{ imageUrl: string }> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/questions/images', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
  });
}

export function useCodeLanguages() {
  const { accessToken } = useAuth();
  return useQuery<{ language: string; version: string }[]>({
    queryKey: ['questions', 'code-languages'],
    queryFn: () => apiFetch('/questions/code-languages', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    staleTime: 60 * 60 * 1000,
  });
}
