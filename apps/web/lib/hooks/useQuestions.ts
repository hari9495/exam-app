import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Question, QuestionType, Difficulty, Tag } from '../types';
import { useAuth } from '../auth-context';

interface QuestionFilters {
  difficulty?: Difficulty;
  tagId?: string;
}

function buildQuery(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tagId) params.set('tagId', filters.tagId);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useQuestions(filters: QuestionFilters = {}) {
  const { accessToken } = useAuth();
  return useQuery<Question[]>({
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
  options: { text: string; isCorrect: boolean }[];
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
