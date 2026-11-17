'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
// Side-effect import: points the Monaco loader at self-hosted /monaco/vs before
// the editor mounts, so a code question works on CDN-blocked exam networks.
import '../../../lib/monaco-setup';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button, FileUpload, FormField, InlineAlert, Select, TextArea } from '@yukthix/ui';
import { CodeRunOutput, TestRunnerScreen, type LiveRunner, type LiveRunnerQuestion } from '@yukthix/ui/assessments';
import { SpokenAnswerRecorder } from '../components/SpokenAnswerRecorder';
import {
  useAttemptQuery,
  useAnswerMutation,
  useAnswerFileMutation,
  useSubmitAttempt,
  useRunCode,
  useCodeLanguages,
  useWebcamResume,
  useAckFaceWarning,
  useScreenShareState,
  useRunnerActions,
  useCandidateHelp,
  useFaceRecheck,
  useProctorMessages,
  RunCodeResult,
} from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useEditorTelemetry } from '../../../lib/hooks/useEditorTelemetry';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useScreenCapture } from '../../../lib/hooks/useScreenCapture';
import { usePeriodicScreenAnalysis } from '../../../lib/hooks/usePeriodicScreenAnalysis';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { reportClientError } from '../../../lib/client-error-reporter';
import { AttemptAnswerSummary, AttemptQuestion, AttemptSection, isAttemptStarted } from '../../../lib/types';
import { monacoLanguageFor } from '../../../lib/monaco-language';
import { cameraFrame, pauseFor } from '../../../lib/proctoring-pause';

// AS-4a part 2 (answers 2161, 2162): the in-test page is the designed runner (PRC-26). Its sections, review mode,
// "answer any N" sections, phone question list, pictures and code snippets, calculator, display settings, breaks and
// the connection banner come from the kit; this page keeps what only the browser can do: proctoring and screen sharing,
// the code editor and runs, file and spoken answers, saving, and submitting.

// Fixed global file-upload policy — mirrors ANSWER_FILE_* in the exam-runtime attempt.service.ts.
// The server re-validates; these just give the candidate an instant, friendlier rejection.
const ANSWER_FILE_MAX_BYTES = 10 * 1024 * 1024;
const ANSWER_FILE_MAX_COUNT = 10;
const ANSWER_FILE_ACCEPT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg', '.zip'];

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Every question of every section in one list, in order (the runner steps through this). */
const flattenQuestions = (sections: AttemptSection[]) => sections.flatMap((section) => section.questions);

/** Seconds since `since` (ms), ticking each second while set. */
function useSecondsSince(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export default function CandidateExamPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isError } = useAttemptQuery();
  const { saveAnswer, flush, queued, connection, offlineSince } = useAnswerMutation();
  const answerFile = useAnswerFileMutation();
  const [fileError, setFileError] = useState<string | null>(null);
  const submitAttempt = useSubmitAttempt();
  const runner = useRunnerActions();
  const help = useCandidateHelp();
  const runCode = useRunCode();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localSelections, setLocalSelections] = useState<Record<string, string[]>>({});
  const [localCodeValues, setLocalCodeValues] = useState<Record<string, string>>({});
  const [stdinValues, setStdinValues] = useState<Record<string, string>>({});
  const [runResults, setRunResults] = useState<Record<string, RunCodeResult>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [selectedLanguages, setSelectedLanguages] = useState<Record<string, string>>({});
  // Optimistic mark-for-review state: the server answer only updates after the save debounce + round-trip + refetch,
  // so the toggle would feel dead for seconds. Track the intended value locally and show it at once.
  const [localMarkedForReview, setLocalMarkedForReview] = useState<Record<string, boolean>>({});
  const [finishError, setFinishError] = useState<string | null>(null);

  const attemptState = current && isAttemptStarted(current) ? current : null;
  // AS-4a: a break is a pause the candidate asked for; the runner shows it, not the proctoring overlay.
  const onBreak = attemptState?.status === 'paused' && attemptState.pausedReason === 'break';
  const isBlocked = attemptState?.status === 'blocked';
  const isTerminal = Boolean(attemptState && attemptState.status !== 'in_progress' && attemptState.status !== 'paused' && !isBlocked);
  const started = attemptState?.status === 'in_progress';
  const proctoringConfig = attemptState?.exam.proctoring;
  const [lastViolationReason, setLastViolationReason] = useState<string>('no_face');
  const [lastViolationSource, setLastViolationSource] = useState<'webcam' | 'browser_activity'>('webcam');
  const hasLiveViolationSource = useRef(false);
  const captureEnabled = proctoringConfig?.screenCaptureEnabled === true;
  // Server-authoritative: false under a recruiter bypass even though captureEnabled stays true -- a bypass narrows
  // what is punished, not what is watched, so capture stays enabled but only screenShareRequired gates the overlay.
  const screenShareRequired = attemptState?.screenShareRequired === true;
  const screenShareState = useScreenShareState();
  // Guards the "POST { active: false } once" requirement -- reset whenever a share becomes active so a later
  // stop-and-restart posts again, but not on every render while the candidate sits on the overlay. Set true *before*
  // mutating because onEnded and the effect both call this for the same stop event; reset on error so one failed POST
  // cannot leave the attempt running with the clock on.
  const postedShareInactiveRef = useRef(false);
  // 'ended': the browser's own Stop-sharing control fired (strike-worthy). 'absent': mounted with no live stream (a
  // refresh), indistinguishable from a tab crash: pauses without a strike.
  function postShareInactive(reason: 'ended' | 'absent') {
    if (postedShareInactiveRef.current) return;
    postedShareInactiveRef.current = true;
    screenShareState.mutate(
      { active: false, reason },
      {
        onError: () => {
          postedShareInactiveRef.current = false;
        },
      },
    );
  }
  const screenCapture = useScreenCapture(captureEnabled, () => postShareInactive('ended'));
  useEffect(() => {
    if (!captureEnabled || screenCapture.active) {
      postedShareInactiveRef.current = false;
      return;
    }
    postShareInactive('absent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureEnabled, screenCapture.active]);

  // Remote-access detection: while live and sharing, periodically send a frame of the shared monitor for analysis.
  usePeriodicScreenAnalysis(started && captureEnabled && screenCapture.active, screenCapture.capture);

  const [isRequestingShare, setIsRequestingShare] = useState(false);
  async function handleShareScreen() {
    setIsRequestingShare(true);
    try {
      const result = await screenCapture.requestShare();
      if (result) {
        screenShareState.mutate({ active: true, displaySurface: result.displaySurface, userAgent: result.userAgent });
      }
    } finally {
      setIsRequestingShare(false);
    }
  }

  useProctoringMonitor(
    started,
    (eventType) => {
      hasLiveViolationSource.current = true;
      setLastViolationReason(eventType);
      setLastViolationSource('browser_activity');
    },
    proctoringConfig,
    screenCapture.capture,
  );
  useWebcamMonitor(
    started,
    (reason) => {
      hasLiveViolationSource.current = true;
      setLastViolationReason(reason);
      setLastViolationSource('webcam');
    },
    proctoringConfig,
    screenCapture.capture,
  );
  // A mount that never saw a live violation (a reload while paused) reads the server's pause owner instead of
  // defaulting to webcam, so the heading and strike count stay right after a refresh.
  useEffect(() => {
    if (hasLiveViolationSource.current) return;
    if (!attemptState || (attemptState.status !== 'paused' && attemptState.status !== 'blocked')) return;
    if (attemptState.pausedReason === 'browser_activity') {
      setLastViolationReason('browser_activity_unspecified');
      setLastViolationSource('browser_activity');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptState?.status, attemptState?.pausedReason]);
  // Resuming from a browser-activity pause reuses the webcam-resume endpoint (the same "clear the pause" transition).
  const webcamResume = useWebcamResume();
  // Stage-3 face 'warn': a non-freezing heads-up while live; dismissing acks it. Pause/block take precedence.
  const ackFaceWarning = useAckFaceWarning();
  const showFaceWarning = started && Boolean(attemptState?.faceWarningAt);
  // Answer 2205: the face check after approved extra time.
  const faceRecheck = useFaceRecheck();
  const proctorMessages = useProctorMessages();
  const [faceCheckFailed, setFaceCheckFailed] = useState<string | null>(null);
  async function handleFaceCheck() {
    setFaceCheckFailed(null);
    try {
      const out = await faceRecheck.mutateAsync(await cameraFrame());
      if (out.matched === false && out.triesLeft !== 0)
        setFaceCheckFailed(`That did not match your photo. Face the camera in good light and try again${out.triesLeft ? ` (${out.triesLeft} ${out.triesLeft === 1 ? 'try' : 'tries'} left)` : ''}, or wait for your proctor.`);
    } catch (error) {
      setFaceCheckFailed(error instanceof Error && error.message ? error.message : 'We could not use your camera. Check it is not in use by another app.');
    }
  }

  async function finishSubmit() {
    if (submitAttempt.isPending) return;
    setFinishError(null);
    try {
      await flush();
      await submitAttempt.mutateAsync();
      router.push('/submitted');
    } catch (error) {
      setFinishError(error instanceof Error && error.message ? error.message : 'It did not go through.');
    }
  }

  const remainingSeconds = useCountdown(attemptState?.remainingSeconds, () => void finishSubmit(), started);

  // A break ends on its own when its time is up (the server settles it too); ask once so the runner comes back.
  const breakEndsAt = onBreak && attemptState?.runner?.breakEndsAt ? Date.parse(attemptState.runner.breakEndsAt) : null;
  const breakElapsed = useSecondsSince(breakEndsAt === null ? null : breakEndsAt - (attemptState?.runner?.breakMinutes ?? 0) * 60_000);
  const breakSecondsLeft = breakEndsAt === null ? 0 : Math.max(0, (attemptState?.runner?.breakMinutes ?? 0) * 60 - breakElapsed);
  const breakEndAsked = useRef(false);
  useEffect(() => {
    if (!onBreak) {
      breakEndAsked.current = false;
      return;
    }
    if (breakEndsAt !== null && breakSecondsLeft === 0 && !breakEndAsked.current) {
      breakEndAsked.current = true;
      runner.endBreak().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBreak, breakEndsAt, breakSecondsLeft]);
  const offlineSeconds = useSecondsSince(offlineSince);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && !isAttemptStarted(current)) {
      router.push('/welcome');
    } else if (isTerminal) {
      router.push('/submitted');
    }
  }, [current, isError, router, accessToken, authLoading, isTerminal]);

  const questions = useMemo(() => (attemptState ? flattenQuestions(attemptState.sections) : []), [attemptState]);
  const question = questions[currentIndex];
  const editorTelemetry = useEditorTelemetry(question?.type === 'code' ? question.id : null);
  const answers: AttemptAnswerSummary[] = attemptState?.answers ?? [];
  const answerOf = (questionId: string) => answers.find((answer) => answer.questionId === questionId);
  const existingAnswer = question ? answerOf(question.id) : undefined;
  // The flag a question shows: the optimistic local value if just toggled, otherwise the server's.
  const markedForReview = (questionId: string) => localMarkedForReview[questionId] ?? Boolean(answerOf(questionId)?.isMarkedForReview);

  // Drop an optimistic override once the server agrees, so a stale local value never masks a later server change.
  useEffect(() => {
    setLocalMarkedForReview((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const qid of keys) {
        const server = Boolean(answers.find((a) => a.questionId === qid)?.isMarkedForReview);
        if (server === prev[qid]) {
          delete next[qid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);
  const selectionOf = (q: AttemptQuestion) => localSelections[q.id] ?? answerOf(q.id)?.selectedOptionIds ?? [];
  const textOf = (q: AttemptQuestion) => localCodeValues[q.id] ?? answerOf(q.id)?.answerText ?? (q.type === 'code' ? q.starterCode ?? '' : '');
  const codeValue = question ? textOf(question) : '';
  const stdinValue = question ? stdinValues[question.id] ?? '' : '';
  const runResult = question ? runResults[question.id] ?? null : null;
  const runError = question ? runErrors[question.id] ?? null : null;
  const currentCodeLanguage =
    question && question.type === 'code'
      ? selectedLanguages[question.id] ??
        (question.languageMode === 'fixed' && question.allowedLanguages.length === 1 ? question.allowedLanguages[0] : (existingAnswer?.codeLanguage ?? ''))
      : '';
  const codeLanguagesQuery = useCodeLanguages(Boolean(question && question.type === 'code' && question.languageMode === 'any'));
  const languageOptions = question?.type === 'code' ? (question.languageMode === 'fixed' ? question.allowedLanguages : (codeLanguagesQuery.data ?? []).map((entry) => entry.language)) : [];
  // One rule for "answered": the navigator, Finish and review mode all read it. What the candidate just typed or
  // chose counts at once (it is already kept on this device).
  const isQuestionAnswered = (q: AttemptQuestion) => {
    const a = answerOf(q.id);
    if (q.type === 'file_upload' || q.type === 'spoken') return Boolean(a && a.answerFiles && a.answerFiles.length > 0);
    if (q.type === 'code' || q.type === 'essay') return (localCodeValues[q.id] ?? a?.answerText ?? '').trim() !== '';
    return selectionOf(q).length > 0;
  };

  if (isError || !attemptState || !question || isTerminal) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  // Answer 2231: every reason the test stops shows in the designed runner's paused view. A block wins over the share
  // prompt (there is nothing to resume into); the share prompt is gated on screenShareRequired (bypass-aware).
  const pause = pauseFor({
    status: attemptState.status,
    pausedReason: attemptState.pausedReason,
    violationReason: lastViolationReason,
    violationSource: lastViolationSource,
    webcamViolations: attemptState.webcamViolationCount,
    browserViolations: attemptState.browserActivityViolationCount,
    strikeLimit: proctoringConfig?.strikeLimit ?? 3,
    pauseMessage: attemptState.pauseMessage,
    faceRecheckTriesLeft: attemptState.faceRecheckTriesLeft,
    shareNeeded: screenShareRequired && !screenCapture.active && !isBlocked,
    shareError: screenCapture.error,
    onShare: () => void handleShareScreen(),
    sharing: isRequestingShare,
    onContinue: () => webcamResume.mutate(),
    continuing: webcamResume.isPending,
    continueFailed: webcamResume.isError,
    onFaceCheck: () => void handleFaceCheck(),
    faceChecking: faceRecheck.isPending,
    faceCheckFailed,
  });

  const byId = new Map(questions.map((q) => [q.id, q]));
  const saveWithMark = (q: AttemptQuestion, marked: boolean) => {
    if (q.type === 'code') saveAnswer(q.id, [], marked, textOf(q), editorTelemetry.snapshot(), currentCodeLanguage);
    else if (q.type === 'essay') saveAnswer(q.id, [], marked, textOf(q));
    else saveAnswer(q.id, selectionOf(q), marked);
  };

  function handleCodeChange(value: string | undefined) {
    const next = value ?? '';
    setLocalCodeValues((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, [], markedForReview(question!.id), next, editorTelemetry.snapshot(), currentCodeLanguage);
  }

  async function uploadFile(file: File) {
    const questionId = question!.id;
    // The kit checks size and type before this; the count and an empty file are ours.
    if ((existingAnswer?.answerFiles ?? []).length >= ANSWER_FILE_MAX_COUNT) throw new Error(`You can upload at most ${ANSWER_FILE_MAX_COUNT} files for this question.`);
    if (file.size === 0) throw new Error(`"${file.name}" is empty.`);
    setFileError(null);
    const dataUri = await readFileAsDataUri(file);
    await answerFile.upload.mutateAsync({ questionId, fileName: file.name, dataUri });
  }

  async function handleFileRemove(fileId: string) {
    setFileError(null);
    try {
      await answerFile.remove.mutateAsync({ questionId: question!.id, fileId });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Couldn't remove that file.");
    }
  }

  function handleRun() {
    if (!question || !currentCodeLanguage) return;
    const questionId = question.id;
    editorTelemetry.recordRun();
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    runCode.mutate(
      { questionId, code: codeValue, codeLanguage: currentCodeLanguage, stdin: question.allowStdin ? stdinValue : undefined },
      {
        onSuccess: (result) => setRunResults((prev) => ({ ...prev, [questionId]: result })),
        // error.message carries the server's real message (the run cap, the sandbox being down).
        onError: (error) => {
          setRunErrors((prev) => ({ ...prev, [questionId]: error instanceof Error ? error.message : "Couldn't run your code right now, try again." }));
          // The HTTP status is the diagnostic that matters: 0 means no HTTP exchange at all (the runtime's port
          // filtered by the candidate's network); a real status (429, 503) means something else. This report also
          // goes to the runtime, so its absence alongside a candidate's "error 0" is itself the evidence.
          const status = (error as { status?: number } | null)?.status;
          reportClientError(accessToken, {
            kind: 'code_run_failed',
            message: error instanceof Error ? error.message : String(error),
            detail: `questionId=${questionId} language=${currentCodeLanguage} status=${status ?? 'none'}`,
          });
        },
      },
    );
  }

  /** Code, file and spoken questions: the parts only this page has (the runner shows the text, picture and snippet). */
  function renderQuestion() {
    const q = question!;
    if (q.type === 'code') {
      if (!currentCodeLanguage)
        return (
          <FormField label="Choose a language before you start">
            <Select
              aria-label="Choose a language before you start"
              value={null}
              placeholder="Select a language"
              options={languageOptions.map((lang) => ({ value: lang, label: lang }))}
              onChange={(lang) => lang && setSelectedLanguages((prev) => ({ ...prev, [q.id]: lang }))}
            />
          </FormField>
        );
      return (
        <>
          <div className="overflow-hidden rounded-lg border border-[#2D2D2D]">
            <div className="flex items-center justify-end bg-[#1E1E1E] px-3 py-2">
              <span className="rounded-sm bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">{currentCodeLanguage}</span>
            </div>
            <Editor
              height="400px"
              path={q.id}
              language={monacoLanguageFor(currentCodeLanguage)}
              value={codeValue}
              onChange={handleCodeChange}
              onMount={(editor) => editorTelemetry.onEditorMount(editor)}
              options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }}
              theme="vs-dark"
            />
          </div>
          {q.allowStdin ? (
            <FormField label="Standard input (optional)">
              <TextArea rows={2} value={stdinValue} onChange={(v) => setStdinValues((prev) => ({ ...prev, [q.id]: v }))} />
            </FormField>
          ) : null}
          <div>
            <Button icon={Play} loading={runCode.isPending} onClick={handleRun}>
              Run
            </Button>
          </div>
          {/* Answer 2234: the run output is the kit's results panel (runs left shown there). */}
          <CodeRunOutput result={runResult} error={runError} />
        </>
      );
    }
    if (q.type === 'file_upload') {
      const files = existingAnswer?.answerFiles ?? [];
      return (
        <>
          {files.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Your files">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-candidate-border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={file.fileName}>
                    {file.fileName}
                  </span>
                  <span className="shrink-0 text-candidate-text-tertiary">{formatFileSize(file.size)}</span>
                  <Button size="sm" onClick={() => void handleFileRemove(file.id)} disabled={answerFile.remove.isPending} aria-label={`Remove ${file.fileName}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-candidate-text-tertiary">No files uploaded yet.</p>
          )}
          <FormField label={`Upload files (up to ${ANSWER_FILE_MAX_COUNT}, 10 MB each)`}>
            <FileUpload key={q.id} accept={ANSWER_FILE_ACCEPT} maxSize={ANSWER_FILE_MAX_BYTES} disabled={files.length >= ANSWER_FILE_MAX_COUNT} upload={(file) => uploadFile(file)} />
          </FormField>
          {fileError ? (
            <InlineAlert tone="danger" title="That did not work">
              {fileError}
            </InlineAlert>
          ) : null}
        </>
      );
    }
    if (q.type === 'spoken')
      return (
        <SpokenAnswerRecorder
          key={q.id}
          existing={existingAnswer?.answerFiles?.[0]}
          uploading={answerFile.upload.isPending}
          disabled={answerFile.upload.isPending || answerFile.remove.isPending}
          onUpload={(fileName, dataUri) => answerFile.upload.mutateAsync({ questionId: q.id, fileName, dataUri }).then(() => undefined)}
          onRemove={(fileId) => answerFile.remove.mutateAsync({ questionId: q.id, fileId }).then(() => undefined)}
        />
      );
    return null;
  }

  const toLive = (q: (typeof questions)[number]): LiveRunnerQuestion => ({
    id: q.id,
    type: q.type === 'multi_mcq' ? 'multiple' : q.type === 'single_mcq' || q.type === 'true_false' ? 'single' : q.type === 'essay' ? 'essay' : 'other',
    text: q.text,
    marks: q.marks,
    image: q.imageUrl ? { src: q.imageUrl, alt: q.imageAlt } : null,
    snippet: q.snippetCode ? { language: q.snippetLanguage, code: q.snippetCode } : null,
    options: q.options.map((o) => ({ id: o.id, label: o.text, image: o.imageUrl ? { src: o.imageUrl, alt: o.imageAlt } : null })),
    value: selectionOf(q),
    answerText: q.type === 'essay' ? textOf(q) : '',
    answered: isQuestionAnswered(q),
    markedForReview: markedForReview(q.id),
  });

  const run = attemptState.runner;
  const proctored = Boolean(proctoringConfig?.webcamEnabled || captureEnabled);
  const live: LiveRunner = {
    testName: attemptState.exam.title,
    candidateName: attemptState.candidateName,
    proctored,
    proctoringNote: proctored ? [proctoringConfig?.webcamEnabled ? 'Camera on' : null, captureEnabled && screenCapture.active ? 'Screen shared' : null].filter(Boolean).join(' · ') || undefined : undefined,
    seconds: remainingSeconds,
    status: onBreak ? 'break' : pause ? 'paused' : 'running',
    pause,
    notice:
      showFaceWarning && !pause
        ? {
            title: 'Identity check warning',
            message: "Your face didn't clearly match your enrolment photo. Your test is still running: centre yourself and face the camera. Repeated warnings may pause your test.",
            actionLabel: 'I understand',
            onAction: () => ackFaceWarning.mutate(),
            busy: ackFaceWarning.isPending,
          }
        : null,
    // Answer 2269: the proctor's messages; "Got it" marks them read, a reply goes to the proctor's console.
    messages: {
      items: attemptState.messages ?? [],
      onRead: () => proctorMessages.read.mutateAsync(),
      onReply: (text) => proctorMessages.reply.mutateAsync(text),
    },
    breakSecondsLeft,
    breaksLeft: run ? Math.max(0, run.breaksAllowed - run.breaksUsed) : 0,
    breakMinutes: run?.breakMinutes ?? 0,
    onStartBreak: async () => {
      await flush();
      return runner.startBreak();
    },
    onEndBreak: runner.endBreak,
    connection,
    queued,
    offlineSeconds,
    offlineMinutes: run?.offlineMinutes ?? 5,
    creditSeconds: run?.offlineCreditSeconds ?? 0,
    creditCapMinutes: run?.timeCreditCapMinutes ?? 10,
    approvedHelp: help.data?.approved ?? [],
    saveStatus: connection !== 'online' ? 'offline' : queued > 0 ? 'saving' : 'saved',
    sections: attemptState.sections.map((s) => ({ name: s.title, count: s.questions.length, required: s.requiredCount })),
    questions: questions.map(toLive),
    current: currentIndex,
    onNavigate: setCurrentIndex,
    onAnswer: (lq, value) => {
      const q = byId.get(lq.id)!;
      setLocalSelections((prev) => ({ ...prev, [q.id]: value }));
      // Keep the (possibly optimistic) review flag so answering does not clear it.
      saveAnswer(q.id, value, markedForReview(q.id));
    },
    onAnswerText: (lq, text) => {
      setLocalCodeValues((prev) => ({ ...prev, [lq.id]: text }));
      saveAnswer(lq.id, [], markedForReview(lq.id), text);
    },
    onMark: (lq, marked) => {
      // Flip at once; the debounced save and refetch reconcile it afterwards.
      setLocalMarkedForReview((prev) => ({ ...prev, [lq.id]: marked }));
      saveWithMark(byId.get(lq.id)!, marked);
    },
    renderQuestion: () => renderQuestion(),
    calculator: run?.calculator ?? 'none',
    onFinish: () => void finishSubmit(),
    finishing: submitAttempt.isPending,
    finishError,
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <TestRunnerScreen live={live} />
    </div>
  );
}
