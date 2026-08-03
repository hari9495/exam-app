import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { candidateApiFetch } from '../candidate-api-client';
import { useCandidateAuth } from '../candidate-auth-context';
import { useToast } from '../../components/ui';
import { isRetryableError, withRetry } from '../retry';
import { reportClientError } from '../client-error-reporter';
import { AttemptCurrent, ProctoringEventType, CandidateLeaderboardResponse, AnswerTelemetry } from '../types';

const ANSWER_DEBOUNCE_MS = 800;

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
    mutationFn: () => candidateApiFetch('/attempt/start', { method: 'POST', body: JSON.stringify({ consent: true }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

interface PendingAnswer {
  selectedOptionIds: string[];
  answerText?: string;
  codeLanguage?: string;
  markedForReview?: boolean;
  telemetry?: AnswerTelemetry;
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
      .catch((error) => {
        toast("Couldn't save your last answer — please check your connection.", 'error');
        // A failed save is the single most important exam-day failure to have on record
        // when a candidate later disputes lost answers.
        reportClientError(accessToken, {
          kind: 'answer_save_failed',
          message: error instanceof Error ? error.message : 'Answer save failed',
          detail: `questionId=${questionId}`,
          severity: 'warn',
        });
      });
  }

  function saveAnswer(
    questionId: string,
    selectedOptionIds: string[],
    markedForReview?: boolean,
    answerText?: string,
    telemetry?: AnswerTelemetry,
    codeLanguage?: string,
  ) {
    pending.current[questionId] = { selectedOptionIds, markedForReview, answerText, telemetry, codeLanguage };
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
    mutationFn: ({ questionId, code, codeLanguage, stdin }: { questionId: string; code: string; codeLanguage: string; stdin?: string }): Promise<RunCodeResult> =>
      candidateApiFetch('/attempt/run-code', { method: 'POST', body: JSON.stringify({ questionId, code, codeLanguage, stdin }) }, accessToken ?? undefined),
    // Deliberately opted out of the global mutation retry. Each run consumes one
    // of a hard 10/min per-IP budget (STRICT_CODE_RUN_THROTTLE) and re-executes
    // code in the external sandbox, so an automatic retry spends a scarce,
    // candidate-visible resource -- runsRemaining is on screen -- to re-do work
    // that may well have already run. The candidate presses Run again if they
    // want another attempt.
    retry: false,
  });
}

export function useReportProctoringEvent() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: ({
      eventType,
      metadata,
      screenshot,
    }: {
      eventType: ProctoringEventType;
      metadata?: Record<string, unknown>;
      screenshot?: string;
    }) =>
      candidateApiFetch(
        '/attempt/proctoring-event',
        { method: 'POST', body: JSON.stringify({ eventType, metadata, screenshot }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
  return function report(eventType: ProctoringEventType, metadata?: Record<string, unknown>, screenshot?: string) {
    mutate({ eventType, metadata, screenshot });
  };
}

// Periodic AI screen analysis (remote-access detection). Best-effort: no retry -- the next
// scheduled tick is the retry -- and no cache invalidation, since the response carries no
// attempt state the UI renders.
export function useScreenAnalysis() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: ({ screenshot }: { screenshot: string }): Promise<{ status: 'flagged' | 'clear' | 'skipped' }> =>
      candidateApiFetch('/attempt/screen-analysis', { method: 'POST', body: JSON.stringify({ screenshot }) }, accessToken ?? undefined),
    retry: false,
  });
}

export function useScreenShareState() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      active,
      displaySurface,
      userAgent,
      reason,
    }: {
      active: boolean;
      displaySurface?: string;
      userAgent?: string;
      // 'ended' (the browser's Stop-sharing control) is strike-worthy; 'absent' (no live
      // stream at mount -- a refresh can't carry a getDisplayMedia stream across navigation)
      // pauses only. Omitted defaults server-side to 'ended'.
      reason?: 'ended' | 'absent';
    }): Promise<{ status: string }> =>
      candidateApiFetch(
        '/attempt/screen-share-state',
        { method: 'POST', body: JSON.stringify({ active, displaySurface, userAgent, reason }) },
        accessToken ?? undefined,
      ),
    // A missed { active: false } leaves the attempt in_progress with the clock running behind a
    // blocking overlay that claims otherwise -- and page.tsx's guard, once set, only retries on
    // its own if captureEnabled/active later change, which doesn't happen on the most common
    // path (mount, never shared, one transient failure). React Query retries with exponential
    // backoff before onError ever fires, making the ref-reset there a last resort, not the
    // only line of defense.
    // Keeps its own two retries rather than the global three, but defers to the
    // shared predicate so a 4xx (which no number of retries will change) stops
    // immediately instead of being repeated.
    retry: (failureCount, error) => failureCount < 3 && isRetryableError(error),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export interface WebcamViolationResult {
  strike: number;
  status: string;
}

export function useReportWebcamViolation() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reason,
      snapshot,
      screenshot,
    }: {
      reason: 'no_face' | 'head_turned' | 'multiple_faces';
      snapshot: string;
      screenshot?: string;
    }): Promise<WebcamViolationResult> =>
      withRetry(() =>
        candidateApiFetch(
          '/attempt/webcam-violation',
          { method: 'POST', body: JSON.stringify({ reason, snapshot, screenshot }) },
          accessToken ?? undefined,
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export function useReportWebcamSnapshot() {
  const { accessToken } = useCandidateAuth();
  return function report(snapshot: string) {
    candidateApiFetch(
      '/attempt/webcam-snapshot',
      { method: 'POST', body: JSON.stringify({ snapshot }) },
      accessToken ?? undefined,
    ).catch(() => undefined);
  };
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

export function useLeaderboard(enabled: boolean) {
  const { accessToken } = useCandidateAuth();
  return useQuery<CandidateLeaderboardResponse>({
    queryKey: ['attempt', 'leaderboard'],
    queryFn: () => candidateApiFetch('/attempt/leaderboard', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && enabled,
    // 30s, matched to the /attempt/current poll. At 5s this was ~70% of all
    // steady-state server load for a large cohort (12 req/min/candidate =
    // ~200 req/s at 1000), and second-by-second rankings mid-exam aren't
    // worth that cost. See ADO #6827.
    refetchInterval: 30_000,
  });
}

export function useCodeLanguages(enabled: boolean) {
  const { accessToken } = useCandidateAuth();
  return useQuery<{ language: string; version: string }[]>({
    queryKey: ['attempt', 'code-languages'],
    // The endpoint wraps its list ({ languages: [...] }) but consumers are typed for the
    // bare array and .map over data directly — unwrap here, exactly like the recruiter
    // path does server-side (questions.service.ts listAvailableLanguages). Returning the
    // raw object made `.map` throw during render, which tore down the whole exam page for
    // every code question in "any language" mode.
    queryFn: async () => {
      const result = (await candidateApiFetch('/attempt/code-languages', {}, accessToken ?? undefined)) as {
        languages?: { language: string; version: string }[];
      };
      return result.languages ?? [];
    },
    enabled: Boolean(accessToken) && enabled,
    staleTime: 60 * 60 * 1000,
  });
}
