import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { candidateApiFetch } from '../candidate-api-client';
import { useCandidateAuth } from '../candidate-auth-context';
import { useToast } from '../../components/ui';
import { AttemptCurrent, ProctoringEventType } from '../types';

const ANSWER_DEBOUNCE_MS = 800;
const RETRY_ATTEMPTS = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
      }
    }
  }
  throw lastError;
}

export function useAttemptQuery() {
  const { accessToken } = useCandidateAuth();
  return useQuery<AttemptCurrent>({
    queryKey: ['attempt', 'current'],
    queryFn: () => candidateApiFetch('/attempt/current', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: (query) => {
      const data = query.state.data;
      const isPausedOrBlocked = data && 'status' in data && (data.status === 'paused' || data.status === 'blocked');
      return isPausedOrBlocked ? 3_000 : 30_000;
    },
    refetchOnWindowFocus: true,
  });
}

export function useStartAttempt() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/start', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

interface PendingAnswer {
  selectedOptionIds: string[];
  answerText?: string;
  markedForReview?: boolean;
}

export function useAnswerMutation() {
  const { accessToken } = useCandidateAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, PendingAnswer>>({});

  function fire(questionId: string): Promise<void> {
    const payload = pending.current[questionId];
    if (!payload) return Promise.resolve();
    delete pending.current[questionId];
    delete timers.current[questionId];
    return withRetry(() =>
      candidateApiFetch(
        '/attempt/answer',
        { method: 'POST', body: JSON.stringify({ questionId, ...payload }) },
        accessToken ?? undefined,
      ),
    )
      .then(() => {
        // ponytail: re-sync from the server so the "marked for review" / answered
        // state updates promptly instead of waiting on the 30s poll interval.
        queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] });
      })
      .catch(() => toast("Couldn't save your last answer — please check your connection.", 'error'));
  }

  function saveAnswer(questionId: string, selectedOptionIds: string[], markedForReview?: boolean, answerText?: string) {
    pending.current[questionId] = { selectedOptionIds, markedForReview, answerText };
    if (timers.current[questionId]) {
      clearTimeout(timers.current[questionId]);
    }
    timers.current[questionId] = setTimeout(() => fire(questionId), ANSWER_DEBOUNCE_MS);
  }

  async function flush() {
    const questionIds = Object.keys(pending.current);
    questionIds.forEach((questionId) => {
      if (timers.current[questionId]) {
        clearTimeout(timers.current[questionId]);
      }
    });
    await Promise.all(questionIds.map((questionId) => fire(questionId)));
  }

  return { saveAnswer, flush };
}

export function useSubmitAttempt() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/submit', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  compileError: string | null;
  timedOut: boolean;
  runsRemaining: number;
}

export function useRunCode() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: ({ questionId, code, stdin }: { questionId: string; code: string; stdin?: string }): Promise<RunCodeResult> =>
      candidateApiFetch('/attempt/run-code', { method: 'POST', body: JSON.stringify({ questionId, code, stdin }) }, accessToken ?? undefined),
  });
}

export function useReportProctoringEvent() {
  const { accessToken } = useCandidateAuth();
  return function report(eventType: ProctoringEventType, metadata?: Record<string, unknown>) {
    candidateApiFetch(
      '/attempt/proctoring-event',
      { method: 'POST', body: JSON.stringify({ eventType, metadata }) },
      accessToken ?? undefined,
    ).catch(() => undefined);
  };
}

export interface WebcamViolationResult {
  strike: number;
  status: string;
}

export function useReportWebcamViolation() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, snapshot }: { reason: 'no_face' | 'head_turned'; snapshot: string }): Promise<WebcamViolationResult> =>
      withRetry(() =>
        candidateApiFetch(
          '/attempt/webcam-violation',
          { method: 'POST', body: JSON.stringify({ reason, snapshot }) },
          accessToken ?? undefined,
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export function useWebcamResume() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ status: string }> =>
      withRetry(() => candidateApiFetch('/attempt/webcam-resume', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}
