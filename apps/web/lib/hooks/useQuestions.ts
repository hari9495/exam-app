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
  status?: string;
}

function buildQuery(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.status) params.set('status', filters.status);
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
    // Keep previous results during search/page refetches so the loading early-return
    // doesn't unmount the search input and drop focus (see useCandidates).
    placeholderData: (prev) => prev,
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

// Inline, not imported from @exam-platform/shared: apps/web cannot import that package at
// runtime (see lib/sentry-rate-limiter.ts) and it isn't declared as a dependency here, so these
// shapes are kept in sync with FlagSeverity/ItemFlag/OptionCount by hand.
export interface QuestionAnalytics {
  questionId: string;
  responses: number;
  percentCorrect: number | null;
  discrimination: number | null;
  flags: { code: string; severity: 'critical' | 'warning' | 'info'; message: string }[];
  options: { optionId: string; text: string; isCorrect: boolean; selections: number }[];
  hasEnoughData: boolean;
}

export function useQuestionAnalytics(questionId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<QuestionAnalytics>({
    queryKey: ['question-analytics', questionId],
    queryFn: () => apiFetch(`/analytics/questions/${questionId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(questionId),
  });
}

export function useFlaggedQuestions() {
  const { accessToken } = useAuth();
  return useQuery<QuestionAnalytics[]>({
    queryKey: ['flagged-questions'],
    queryFn: () => apiFetch('/analytics/questions/flagged', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
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

export function useArchiveQuestion() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive is the soft-delete: it flips the question to status 'archived', which the default
    // (status: 'active') list query then excludes -- so it disappears from the Question Bank.
    mutationFn: (id: string) =>
      apiFetch(`/questions/${id}/archive`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });
}

export function useRestoreQuestion() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // Restore re-publishes an archived question: flips status back to 'active' so it returns to
    // the active bank. Reuses the existing publish endpoint (archived -> active).
    mutationFn: (id: string) =>
      apiFetch(`/questions/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
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

// Narrower than the app-wide QuestionType on purpose: the API's @IsIn allows only these three.
// Generating `code` questions is a later stage (the model would also have to produce starter code
// and pick a runtime), so offering it in the UI would fail validation with a 400 the recruiter
// cannot act on. Typing it out here means that mistake is a compile error, not a runtime one.
export type GeneratableQuestionType = Extract<QuestionType, 'single_mcq' | 'multi_mcq' | 'true_false'>;

export interface GenerateQuestionsPayload {
  topic: string;
  difficulty: Difficulty;
  questionTypes: GeneratableQuestionType[];
  count: number;
  marks: number;
  negativeMarks: number;
  tagIds: string[];
}

export interface GenerationOutput {
  requested: number;
  created: number;
  dropped: { reason: string }[];
  questionIds: string[];
}

export interface AiJobStatus {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputJson: string | null;
  error: string | null;
}

export function useGenerateQuestions() {
  const { accessToken } = useAuth();
  return useMutation<{ aiJobId: string }, Error, GenerateQuestionsPayload>({
    mutationFn: (payload) =>
      apiFetch('/questions/ai-generate', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
  });
}

// Note the path: the controller is mounted at `ai-jobs`, not `jobs`.
export function useAiJob(aiJobId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AiJobStatus>({
    queryKey: ['ai-job', aiJobId],
    queryFn: () => apiFetch(`/ai-jobs/${aiJobId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && aiJobId),
    // Poll while the job is still running, then stop. Without the false branch this polls
    // forever after completion, once per open modal, for as long as the tab is open.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 2000 : false;
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
