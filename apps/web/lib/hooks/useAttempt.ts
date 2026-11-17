import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { candidateApiFetch } from '../candidate-api-client';
import { useCandidateAuth } from '../candidate-auth-context';
import { useToast } from '../../components/ui';
import { isRetryableError, withRetry } from '../retry';
import { reportClientError } from '../client-error-reporter';
import { enqueue, loadQueue, saveQueue, settle, type AnswerQueue } from '../answer-queue';
import type { CandidateBrand, LiveMyTest, LiveReuseOffer } from '@yukthix/ui/assessments';
import { AttemptCurrent, ProctoringEventType, CandidateLeaderboardResponse, AnswerTelemetry, AnswerFile } from '../types';

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

// Candidate download of their own pass certificate (get-or-generate on the server, returns a signed
// URL to open). Only shown when the attempt feedback reports certificateAvailable.
export function useCandidateCertificate() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/certificate', {}, accessToken ?? undefined) as Promise<{ url: string }>,
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
  /** AS-4a: when this device saved it (ISO). */
  clientSavedAt: string;
}

/** AS-4a (PRC-26): the connection as the runner shows it. */
export type AnswerConnection = 'online' | 'reconnecting' | 'offline';
const RESEND_EVERY_MS = 15_000;

/**
 * Answer autosave. AS-4a: every answer is also kept on this device (lib/answer-queue) with the time it was saved, until
 * the server has it: a lost connection keeps the answers here (through a reload) and sends them when it returns; the
 * server never lets an older copy win. A refusal from the server (the test ended, a bad answer) is not retried.
 */
export function useAnswerMutation() {
  const { accessToken } = useCandidateAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, PendingAnswer>>({});
  const queue = useRef<AnswerQueue>(loadQueue());
  const [queued, setQueued] = useState(() => Object.keys(queue.current).length);
  const [connection, setConnection] = useState<AnswerConnection>('online');
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const sending = useRef(false);

  const store = (next: AnswerQueue) => {
    queue.current = next;
    saveQueue(next);
    setQueued(Object.keys(next).length);
  };
  const lost = () => {
    setConnection(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting');
    setOfflineSince((t) => t ?? Date.now());
  };
  const back = () => {
    setConnection('online');
    setOfflineSince(null);
  };

  function send(questionId: string, payload: Omit<PendingAnswer, 'telemetry'> & { telemetry?: AnswerTelemetry }): Promise<void> {
    return withRetry(() =>
      candidateApiFetch('/attempt/answer', { method: 'POST', body: JSON.stringify({ questionId, ...payload }) }, accessToken ?? undefined),
    )
      .then(() => {
        store(settle(queue.current, questionId, payload.clientSavedAt));
        back();
        // ponytail: re-sync from the server so the "marked for review" / answered
        // state updates promptly instead of waiting on the 30s poll interval.
        queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] });
      })
      .catch((error) => {
        if (isRetryableError(error)) {
          // Kept on this device; sent when the connection returns.
          lost();
          return;
        }
        store(settle(queue.current, questionId, payload.clientSavedAt));
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

  function fire(questionId: string): Promise<void> {
    const payload = pending.current[questionId];
    if (!payload) return Promise.resolve();
    delete pending.current[questionId];
    delete timers.current[questionId];
    return send(questionId, payload);
  }

  /** Sends what this device still holds, oldest first, one at a time. */
  async function resendQueued(): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    try {
      const waiting = Object.entries(queue.current).sort(([, x], [, y]) => (x.clientSavedAt < y.clientSavedAt ? -1 : 1));
      for (const [questionId, answer] of waiting) {
        if (pending.current[questionId]) continue; // a newer edit is about to go
        await send(questionId, answer);
        if (Object.prototype.hasOwnProperty.call(queue.current, questionId) && queue.current[questionId]!.clientSavedAt === answer.clientSavedAt) break; // still down
      }
    } finally {
      sending.current = false;
    }
  }

  useEffect(() => {
    const online = () => void resendQueued();
    const offline = () => lost();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const every = setInterval(() => {
      if (Object.keys(queue.current).length) void resendQueued();
    }, RESEND_EVERY_MS);
    // Answers this device kept from before a reload.
    if (Object.keys(queue.current).length) void resendQueued();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function saveAnswer(
    questionId: string,
    selectedOptionIds: string[],
    markedForReview?: boolean,
    answerText?: string,
    telemetry?: AnswerTelemetry,
    codeLanguage?: string,
  ) {
    const clientSavedAt = new Date().toISOString();
    pending.current[questionId] = { selectedOptionIds, markedForReview, answerText, telemetry, codeLanguage, clientSavedAt };
    // On the device at once, so a lost connection or a reload never loses it.
    store(enqueue(queue.current, questionId, { selectedOptionIds, markedForReview, answerText, codeLanguage, clientSavedAt }));
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
    await resendQueued();
  }

  return { saveAnswer, flush, queued, connection, offlineSince };
}

// file_upload answers: the files go through their own endpoint (uploads must run outside the
// answer tx). Upload/remove both return the new file list and re-sync /current so the picker and
// the answered-count update immediately.
export function useAnswerFileMutation() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (body: { questionId: string; fileName: string; dataUri: string }): Promise<{ files: AnswerFile[] }> =>
      candidateApiFetch('/attempt/answer-file', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
  const remove = useMutation({
    mutationFn: (body: { questionId: string; fileId: string }): Promise<{ files: AnswerFile[] }> =>
      candidateApiFetch('/attempt/answer-file/remove', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
  return { upload, remove };
}

export function useSubmitAttempt() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => candidateApiFetch('/attempt/submit', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => {
      // AS-4a: the test is in; nothing of it stays on this device.
      saveQueue({});
      return queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] });
    },
  });
}

/** AS-4a (PRC-26): start or end a break; the optional after-test survey. */
export function useRunnerActions() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  const post = (path: string, body: unknown = {}) =>
    candidateApiFetch(path, { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined).then((r: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] });
      return r;
    });
  return {
    startBreak: () => post('/attempt/break/start'),
    endBreak: () => post('/attempt/break/end'),
    sendSurvey: (input: { rating: number; clearInstructions?: boolean; comment?: string; gender?: 'woman' | 'man' | 'another' | 'not_say' }) => post('/attempt/survey', input),
    // AS-5 (answer 2012): appeal an integrity decision.
    sendAppeal: (text: string) => post('/attempt/appeal', { text }),
  };
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

// Stage-3 face enforcement 'warn': candidate acknowledges the non-freezing heads-up, clearing
// faceWarningAt server-side so it stops surfacing on /current.
export function useAckFaceWarning() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ ok: true }> =>
      withRetry(() => candidateApiFetch('/attempt/face-warning-ack', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export function useFaceEnrolment() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: (body: { status: 'enrolled' | 'not_verified'; snapshot?: string; qualityJson?: string; consentGiven: boolean }) =>
      candidateApiFetch('/attempt/face-enrolment', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    // Deliberately opted out of the global mutation retry. This POST now sits between "the
    // attempt has started" and "the candidate is in the exam", so the global three retries with
    // backoff would hold a candidate on the welcome screen for seconds over a recording that is
    // explicitly best-effort. One attempt, then let them in.
    retry: false,
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

// AS-3 (PRC-21): every test of this candidate at this company.
export function useMyTests() {
  const { accessToken } = useCandidateAuth();
  return useQuery<LiveMyTest[]>({
    queryKey: ['attempt', 'my-tests', accessToken],
    queryFn: () => candidateApiFetch('/attempt/my-tests', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// AS-3 (PRC-32): an earlier result on the same test this invitation may use, or the one it already uses.
export function useReuseOffer() {
  const { accessToken } = useCandidateAuth();
  return useQuery<LiveReuseOffer>({
    queryKey: ['attempt', 'reuse', accessToken],
    queryFn: () => candidateApiFetch('/attempt/reuse', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useReuseActions() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attempt'] });
  const use = useMutation({
    mutationFn: (attemptId: string) => candidateApiFetch('/attempt/reuse', { method: 'POST', body: JSON.stringify({ attemptId, agree: true }) }, accessToken ?? undefined),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: () => candidateApiFetch('/attempt/reuse/withdraw', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: refresh,
  });
  return { use, withdraw };
}

/** AS-3: the company and candidate a live candidate page names in its header (from /attempt/current). */
export function useCandidateBrand(): CandidateBrand {
  const { data } = useAttemptQuery();
  return { company: data?.organizationName ?? '', candidate: data?.candidateName ?? '', logoUrl: data?.organizationLogoUrl ?? null, myTestsHref: '/my-tests' };
}

/* ------------------------------------------------------------------ AS-4b (answer 2011): help before the test */

export interface CandidateHelp {
  request: { kinds: string[]; extraTimePercent: number | null; status: string; approvedKinds: string[]; grantedExtraTimePercent: number | null; message: string | null; createdAt: string; decidedAt: string | null } | null;
  approved: string[];
  extraTimePercent: number;
}

/** The candidate's requests for help and what was approved for them (answer 2164: "approved for you"). */
export function useCandidateHelp(enabled = true) {
  const { accessToken } = useCandidateAuth();
  return useQuery<CandidateHelp>({
    queryKey: ['attempt', 'accommodation'],
    queryFn: () => candidateApiFetch('/attempt/accommodation', {}, accessToken ?? undefined) as Promise<CandidateHelp>,
    enabled: Boolean(accessToken) && enabled,
    retry: false,
  });
}

/** A file as a base64 data URI (the runtime checks the real type and size again). */
export function fileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read. Try again.'));
    r.readAsDataURL(file);
  });
}

/** Asks for help before the test (one open request at a time); the evidence is optional. */
export function useAskForHelp() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (a: { kinds: string[]; extraTimePercent: number | null; note: string | null; evidence: File | null }) =>
      candidateApiFetch(
        '/attempt/accommodation',
        { method: 'POST', body: JSON.stringify({ kinds: a.kinds, extraTimePercent: a.extraTimePercent, note: a.note, evidence: a.evidence ? { fileName: a.evidence.name, dataUri: await fileAsDataUri(a.evidence) } : null }) },
        accessToken ?? undefined,
      ) as Promise<CandidateHelp>,
    onSuccess: (help) => queryClient.setQueryData(['attempt', 'accommodation'], help),
  });
}
