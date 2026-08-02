'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Editor from '@monaco-editor/react';
// Side-effect import: points the Monaco loader at self-hosted /monaco/vs before
// the editor mounts, so a code question works on CDN-blocked exam networks.
import '../../../lib/monaco-setup';
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../components/ui';
import { CandidateButton } from '../components/CandidateButton';
import { CodeOutputPanel } from '../components/CodeOutputPanel';
import { QuestionNavigator, flattenQuestions } from '../components/QuestionNavigator';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from '../components/ProctoringOverlay';
import { ScreenShareRequiredOverlay } from '../components/ScreenShareRequiredOverlay';
import { TimerBar } from '../components/TimerBar';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useCodeLanguages, useWebcamResume, useScreenShareState, RunCodeResult } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useEditorTelemetry } from '../../../lib/hooks/useEditorTelemetry';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useScreenCapture } from '../../../lib/hooks/useScreenCapture';
import { usePeriodicScreenAnalysis } from '../../../lib/hooks/usePeriodicScreenAnalysis';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { AttemptAnswerSummary, isAttemptStarted } from '../../../lib/types';

function markButtonClasses(marked: boolean | undefined) {
  return clsx(
    // Sized as a real button, not a hairline pill: candidates were struggling to hit it.
    // whitespace-nowrap keeps "Mark for review" on one line beside the question meta.
    // active:scale + focus ring give an immediate press response so the toggle feels
    // instant, independent of the debounced save behind it.
    'whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-candidate-review-border',
    marked
      ? 'border-candidate-review-border bg-candidate-review-bg text-candidate-review'
      : 'border-candidate-border text-candidate-text-secondary hover:bg-candidate-bg',
  );
}

function optionClasses(selected: boolean) {
  return clsx(
    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
    selected
      ? 'border-[1.5px] border-candidate-primary bg-candidate-primary-light font-semibold text-candidate-primary'
      // An unselected option had no hover feedback at all despite being a clickable button.
      : 'border-candidate-border text-candidate-text-secondary hover:border-candidate-primary/40 hover:bg-candidate-bg',
  );
}

const PISTON_TO_MONACO_LANGUAGE: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  go: 'go',
  ruby: 'ruby',
  // Piston exposes far more runtimes than Monaco has dedicated grammars for — anything not
  // listed here still executes correctly (this only controls syntax-highlighting), it just
  // falls back to plaintext coloring.
};

function monacoLanguageFor(pistonLanguage: string): string {
  return PISTON_TO_MONACO_LANGUAGE[pistonLanguage] ?? 'plaintext';
}

export default function CandidateExamPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isError } = useAttemptQuery();
  const { saveAnswer, flush } = useAnswerMutation();
  const submitAttempt = useSubmitAttempt();
  const runCode = useRunCode();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // When set, the candidate is stepping through only the questions in that state (reached from
  // the submit dialog's "For review" / "Unanswered" tiles). A banner then lets them cycle just
  // that subset instead of walking every question.
  const [reviewFilter, setReviewFilter] = useState<'marked' | 'unanswered' | null>(null);
  const [localSelections, setLocalSelections] = useState<Record<string, string[]>>({});
  const [localCodeValues, setLocalCodeValues] = useState<Record<string, string>>({});
  const [stdinValues, setStdinValues] = useState<Record<string, string>>({});
  const [runResults, setRunResults] = useState<Record<string, RunCodeResult>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [selectedLanguages, setSelectedLanguages] = useState<Record<string, string>>({});
  // Optimistic mark-for-review state: the button appearance is otherwise driven off the
  // server answer, which only updates after the 800ms save debounce + round-trip + refetch --
  // so the toggle felt dead for ~3s. Track the intended value locally and show it immediately.
  const [localMarkedForReview, setLocalMarkedForReview] = useState<Record<string, boolean>>({});

  const attemptState = current && isAttemptStarted(current) ? current : null;
  const isPaused = attemptState?.status === 'paused';
  const isBlocked = attemptState?.status === 'blocked';
  const isTerminal = Boolean(attemptState && attemptState.status !== 'in_progress' && !isPaused && !isBlocked);
  const started = attemptState?.status === 'in_progress';
  const proctoringConfig = attemptState?.exam.proctoring;
  const [lastViolationReason, setLastViolationReason] = useState<string>('no_face');
  const [lastViolationSource, setLastViolationSource] = useState<'webcam' | 'browser_activity'>('webcam');
  const hasLiveViolationSource = useRef(false);
  const captureEnabled = proctoringConfig?.screenCaptureEnabled === true;
  // Server-authoritative: false under a recruiter bypass even though captureEnabled (from
  // exam.proctoring.screenCaptureEnabled) stays true -- a bypass narrows what is punished, not
  // what is watched, so the hook below still stays enabled (the candidate can still share and
  // still get frames captured), but only screenShareRequired gates the blocking overlay.
  const screenShareRequired = attemptState?.screenShareRequired === true;
  const screenShareState = useScreenShareState();
  // Guards the "POST { active: false } once" requirement -- reset whenever a share becomes
  // active (below) so a later stop-and-restart cycle posts again, but not on every render
  // while the candidate simply sits on the share-required overlay. Set true *before* mutating
  // (not in onSuccess) because onEnded and this hook's own effect both call this for the same
  // stop event, milliseconds apart -- onSuccess would leave a window where both fire the POST.
  // Reset on error (rather than left permanently stuck) so the attempt isn't silently stuck
  // in_progress with the clock running because one transient POST failed.
  const postedShareInactiveRef = useRef(false);
  // reason: 'ended' -- the browser's own Stop-sharing control fired, a genuine and
  // strike-worthy stop. 'absent' -- this component mounted (or re-mounted, e.g. after a
  // refresh) with no live stream; a getDisplayMedia stream cannot survive navigation, so this
  // is indistinguishable from a tab crash and must pause without costing a strike.
  function postShareInactive(reason: 'ended' | 'absent') {
    if (postedShareInactiveRef.current) return;
    postedShareInactiveRef.current = true;
    screenShareState.mutate(
      { active: false, reason },
      { onError: () => { postedShareInactiveRef.current = false; } },
    );
  }
  // onEnded fires from the browser's own "Stop sharing" control (see useScreenCapture) --
  // it's identity-stable through that hook's internal ref mirror, so passing a fresh closure
  // here every render is fine.
  const screenCapture = useScreenCapture(captureEnabled, () => postShareInactive('ended'));
  useEffect(() => {
    if (!captureEnabled || screenCapture.active) {
      postedShareInactiveRef.current = false;
      return;
    }
    postShareInactive('absent');
  }, [captureEnabled, screenCapture.active]);

  // Remote-access detection: while the attempt is live and a share is active, periodically
  // send a frame of the shared monitor for server-side AI analysis (AnyDesk/TeamViewer/etc.
  // UI is visible on the monitor even though the browser can't see other processes).
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
  // If this mount never saw a live violation event (e.g. the page reloaded while
  // already paused/blocked from an earlier session), use the server-reported pause
  // owner instead of defaulting to webcam -- otherwise a browser-activity pause would
  // render the wrong heading/strike count after a refresh. This reads the
  // server-authoritative reason directly rather than guessing from the counters (which
  // could be wrong, e.g. on a tie, or once a strike escalates past the other owner's count).
  useEffect(() => {
    if (hasLiveViolationSource.current) return;
    if (!attemptState || (attemptState.status !== 'paused' && attemptState.status !== 'blocked')) return;
    if (attemptState.pausedReason === 'browser_activity') {
      setLastViolationReason('browser_activity_unspecified');
      setLastViolationSource('browser_activity');
    }
  }, [attemptState?.status, attemptState?.pausedReason]);
  // Resuming from a browser-activity pause has nothing to re-verify (unlike webcam, which
  // re-checks face presence) -- it's the same generic "clear the pause" transition either way,
  // so the existing webcam-resume endpoint/mutation is reused rather than adding a duplicate one.
  const webcamResume = useWebcamResume();

  async function finishSubmit() {
    if (submitAttempt.isPending) return;
    await flush();
    await submitAttempt.mutateAsync();
    router.push('/submitted');
  }

  const remainingSeconds = useCountdown(
    attemptState?.remainingSeconds,
    () => {
      finishSubmit();
    },
    attemptState?.status === 'in_progress',
  );

  const totalSecondsRef = useRef<number | null>(null);
  if (totalSecondsRef.current === null && attemptState?.remainingSeconds) {
    totalSecondsRef.current = attemptState.remainingSeconds;
  }

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
  const existingAnswer = answers.find((answer) => answer.questionId === question?.id);
  // The mark-for-review flag a question is currently shown with: the optimistic local value
  // if the candidate just toggled it, otherwise whatever the server last returned.
  const markedForReview = (questionId: string, serverValue: boolean | undefined) =>
    localMarkedForReview[questionId] ?? Boolean(serverValue);
  const currentMarked = question ? markedForReview(question.id, existingAnswer?.isMarkedForReview) : false;

  // Drop an optimistic override once the server's answer agrees with it, so a stale local
  // value can never mask a later server change (e.g. a recruiter action on another device).
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
  const selectedOptionIds = question ? localSelections[question.id] ?? existingAnswer?.selectedOptionIds ?? [] : [];
  const codeValue = question ? localCodeValues[question.id] ?? existingAnswer?.answerText ?? question.starterCode ?? '' : '';
  const stdinValue = question ? stdinValues[question.id] ?? '' : '';
  const runResult = question ? runResults[question.id] ?? null : null;
  const runError = question ? runErrors[question.id] ?? null : null;
  const currentCodeLanguage =
    question && question.type === 'code'
      ? selectedLanguages[question.id] ??
        (question.languageMode === 'fixed' && question.allowedLanguages.length === 1
          ? question.allowedLanguages[0]
          : (existingAnswer?.codeLanguage ?? ''))
      : '';
  const needsLanguagePick = question?.type === 'code' && !currentCodeLanguage;
  const codeLanguagesQuery = useCodeLanguages(Boolean(question && question.type === 'code' && question.languageMode === 'any'));
  const languageOptions = question?.type === 'code' ? (question.languageMode === 'fixed' ? question.allowedLanguages : (codeLanguagesQuery.data ?? []).map((entry) => entry.language)) : [];
  // Single source of truth for "is this answered": the submit dialog counts these AND jumps
  // to them, so a second copy of the rule would eventually disagree with the tally shown.
  const isQuestionAnswered = (q: (typeof questions)[number]) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') return Boolean(a && a.answerText && a.answerText.trim() !== '');
    return Boolean(a && a.selectedOptionIds.length > 0);
  };
  const isQuestionMarkedForReview = (q: (typeof questions)[number]) =>
    markedForReview(q.id, answers.find((ans) => ans.questionId === q.id)?.isMarkedForReview);

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const reviewCount = questions.filter(isQuestionMarkedForReview).length;
  const unansweredCount = questions.length - answeredCount;
  const markedIndices = questions.reduce<number[]>((acc, q, i) => (isQuestionMarkedForReview(q) ? [...acc, i] : acc), []);
  const unansweredIndices = questions.reduce<number[]>((acc, q, i) => (!isQuestionAnswered(q) ? [...acc, i] : acc), []);
  const activeFilterIndices = reviewFilter === 'marked' ? markedIndices : reviewFilter === 'unanswered' ? unansweredIndices : [];
  const reviewPos = activeFilterIndices.indexOf(currentIndex); // -1 if the current question no longer matches

  // Leave review mode once nothing matches (e.g. the last unanswered question got answered, or
  // the last mark was cleared) so the banner doesn't linger empty.
  useEffect(() => {
    if (reviewFilter && activeFilterIndices.length === 0) setReviewFilter(null);
  }, [reviewFilter, activeFilterIndices.length]);

  if (isError || !attemptState) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  if (!question || isTerminal) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  // The block overlay takes precedence -- a blocked attempt has nothing to resume into,
  // sharing again wouldn't change that, so don't mask it with the share prompt. Gated on
  // screenShareRequired (server-computed, bypass-aware), not captureEnabled -- a bypassed
  // attempt must not be blocked over a share it was never going to be punished for missing.
  if (screenShareRequired && !screenCapture.active && !isBlocked) {
    return <ScreenShareRequiredOverlay error={screenCapture.error} onShare={handleShareScreen} pending={isRequestingShare} />;
  }

  function toggleOption(optionId: string) {
    const isMulti = question!.type === 'multi_mcq';
    const next = isMulti
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    setLocalSelections((prev) => ({ ...prev, [question!.id]: next }));
    // Preserve the current (possibly optimistic) review flag so answering doesn't clear it.
    saveAnswer(question!.id, next, currentMarked);
  }

  function toggleMarkForReview() {
    const next = !currentMarked;
    // Flip the UI immediately; the debounced save + refetch reconciles it afterwards.
    setLocalMarkedForReview((prev) => ({ ...prev, [question!.id]: next }));
    if (question!.type === 'code') {
      saveAnswer(question!.id, [], next, codeValue, editorTelemetry.snapshot(), currentCodeLanguage);
    } else {
      saveAnswer(question!.id, selectedOptionIds, next);
    }
  }

  function handleCodeChange(value: string | undefined) {
    const next = value ?? '';
    setLocalCodeValues((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, [], currentMarked, next, editorTelemetry.snapshot(), currentCodeLanguage);
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
        // error.message carries the server's real message (e.g. the run-cap or
        // sandbox_unavailable text set in apps/exam-runtime's runCode()) rather than a
        // hardcoded string here, matching this codebase's established onError convention.
        onError: (error) =>
          setRunErrors((prev) => ({
            ...prev,
            [questionId]: error instanceof Error ? error.message : "Couldn't run your code right now, try again.",
          })),
      },
    );
  }

  async function handleConfirmSubmit() {
    setConfirmOpen(false);
    await finishSubmit();
  }

  // From the submit dialog's tallies: enter a mode that steps through only the questions in
  // that state. Jumps to the first match, opens the review banner, and closes the dialog.
  function enterReviewFilter(filter: 'marked' | 'unanswered') {
    const indices = filter === 'marked' ? markedIndices : unansweredIndices;
    if (indices.length === 0) return;
    setReviewFilter(filter);
    setCurrentIndex(indices[0]);
    setConfirmOpen(false);
  }

  // Move to the next/previous question within the active filter. If the current question is no
  // longer in the set (e.g. it was just answered), step to the first/last remaining match.
  function stepReview(dir: -1 | 1) {
    if (activeFilterIndices.length === 0) return;
    const nextPos = reviewPos === -1 ? (dir === 1 ? 0 : activeFilterIndices.length - 1) : reviewPos + dir;
    if (nextPos < 0 || nextPos >= activeFilterIndices.length) return;
    setCurrentIndex(activeFilterIndices[nextPos]);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {isPaused ? (
        <ProctoringWarningOverlay
          strike={lastViolationSource === 'browser_activity' ? attemptState.browserActivityViolationCount : attemptState.webcamViolationCount}
          strikeLimit={proctoringConfig?.strikeLimit ?? 3}
          reason={lastViolationReason}
          onContinue={() => webcamResume.mutate()}
          continuePending={webcamResume.isPending}
          continueError={webcamResume.isError}
        />
      ) : null}
      {isBlocked ? <ProctoringBlockOverlay /> : null}
      <div
        data-testid="dimmable-content"
        // @types/react's stable release doesn't type the `inert` DOM attribute yet (only
        // experimental.d.ts does) — cast bridges that gap so keyboard/screen-reader users
        // can't reach the dimmed content while an overlay covers it.
        {...(((isPaused || isBlocked) ? { inert: '' } : {}) as React.HTMLAttributes<HTMLDivElement>)}
        // Fills the screen on large displays rather than stopping at a fixed width and
        // leaving hundreds of pixels of dead margin. Past 2xl the cap is dropped entirely and
        // the padding becomes the gutter; the width is kept usable by widening the navigator
        // and splitting the options into two columns rather than stretching single rows.
        className={clsx(
          'mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col overflow-hidden p-4 xl:max-w-7xl xl:p-6 2xl:max-w-none 2xl:px-10',
          (isPaused || isBlocked) && 'pointer-events-none blur-sm select-none',
        )}
      >
      <div className="mb-4 shrink-0 rounded-lg border border-candidate-border bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => setNavigatorOpen((open) => !open)}
            className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary lg:hidden"
          >
            <span className="inline-flex items-center gap-1">
              Q{currentIndex + 1}/{questions.length}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </span>
          </button>
          {/* Left-aligned by request. On desktop the Q-navigator button beside this is
              lg:hidden, so this block is the row's only child and justify-between leaves it
              at the start; on mobile the button takes the left slot and this sits opposite. */}
          <div className="flex flex-col items-start text-left">
            <span className="hidden text-sm font-bold text-candidate-text lg:inline">{attemptState.exam.title}</span>
            <span className="text-xs text-candidate-text-tertiary">{attemptState.candidateName}</span>
          </div>
        </div>
        <TimerBar
          remainingSeconds={remainingSeconds}
          totalSeconds={totalSecondsRef.current ?? remainingSeconds}
          progressLabel={`${answeredCount}/${questions.length} answered`}
        />
      </div>

      {reviewFilter && activeFilterIndices.length > 0 ? (
        <div
          className={clsx(
            'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5',
            reviewFilter === 'marked'
              ? 'border-candidate-review-border bg-candidate-review-bg'
              : 'border-candidate-border bg-candidate-bg',
          )}
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-candidate-text">
            {reviewFilter === 'marked' ? (
              <Bookmark className="h-4 w-4 text-candidate-review" fill="currentColor" aria-hidden="true" />
            ) : null}
            Reviewing {reviewFilter === 'marked' ? 'marked for review' : 'unanswered'} — {(reviewPos === -1 ? 0 : reviewPos) + 1} of{' '}
            {activeFilterIndices.length}
          </span>
          <div className="flex items-center gap-2">
            <CandidateButton
              variant="secondary"
              onClick={() => stepReview(-1)}
              disabled={reviewPos <= 0}
              aria-label={`Previous ${reviewFilter === 'marked' ? 'marked-for-review' : 'unanswered'} question`}
            >
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Prev
              </span>
            </CandidateButton>
            <CandidateButton
              variant="secondary"
              onClick={() => stepReview(1)}
              disabled={reviewPos !== -1 && reviewPos >= activeFilterIndices.length - 1}
              aria-label={`Next ${reviewFilter === 'marked' ? 'marked-for-review' : 'unanswered'} question`}
            >
              <span className="inline-flex items-center gap-1">
                Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </CandidateButton>
            <button
              type="button"
              onClick={() => setReviewFilter(null)}
              className="rounded-md px-2.5 py-2 text-sm font-medium text-candidate-text-secondary hover:bg-white/60"
            >
              Show all questions
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden xl:gap-6">
        <div className="flex-1 overflow-y-auto rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              {/* Where the candidate is in the paper. The word "Section" and the position are
                  what carry the meaning for a first-timer -- the title itself is whatever the
                  recruiter typed ("test", "S1"), so it is shown as a suffix, not on its own.
                  The position is only added when there is more than one section to move between. */}
              <span className="w-fit max-w-full truncate rounded-md bg-candidate-primary-light px-2.5 py-1 text-xs font-semibold text-candidate-primary">
                Section{attemptState.sections.length > 1 ? ` ${question.sectionIndex + 1} of ${attemptState.sections.length}` : ''}
                {question.sectionTitle ? `: ${question.sectionTitle}` : ''}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-candidate-text-tertiary">
                Question {currentIndex + 1} of {questions.length} ·{' '}
                {question.type === 'code' ? 'Code' : question.type === 'multi_mcq' ? 'Multiple choice' : 'Single choice'} ·{' '}
                {question.marks} marks
              </span>
            </div>
            <button type="button" onClick={toggleMarkForReview} aria-pressed={currentMarked} className={markButtonClasses(currentMarked)}>
              <span className="inline-flex items-center gap-1.5">
                <Bookmark className="h-4 w-4" fill={currentMarked ? 'currentColor' : 'none'} aria-hidden="true" />
                {currentMarked ? 'Marked for review' : 'Mark for review'}
              </span>
            </button>
          </div>
          <p className="mb-4 text-sm text-candidate-text">{question.text}</p>
          {question.imageUrl ? (
            <img src={question.imageUrl} alt="Question illustration" className="mb-4 max-h-64 rounded-lg object-contain" />
          ) : null}
          {question.snippetCode ? (
            <div className="mb-4 overflow-hidden rounded-md">
              <div className="bg-[#1E1E1E] px-3 py-1.5">
                <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                  {question.snippetLanguage ?? 'plaintext'}
                </span>
              </div>
              <pre className="overflow-x-auto bg-[#1E1E1E] px-3 py-2 font-mono text-xs text-candidate-text-faint">{question.snippetCode}</pre>
            </div>
          ) : null}
          {question.type === 'code' ? (
            <>
              {needsLanguagePick ? (
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-candidate-border bg-candidate-bg p-3">
                  <label htmlFor="code-language-select" className="text-xs font-medium text-candidate-text-secondary">
                    Choose a language before you start
                  </label>
                  <select
                    id="code-language-select"
                    aria-label="Choose A Language Before You Start"
                    className="rounded border border-candidate-border px-2 py-1 text-sm"
                    value=""
                    onChange={(e) => {
                      const lang = e.target.value;
                      if (!lang) return;
                      setSelectedLanguages((prev) => ({ ...prev, [question.id]: lang }));
                    }}
                  >
                    <option value="" disabled>
                      Select a language…
                    </option>
                    {languageOptions.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-[#2D2D2D] shadow-sm">
                    <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-2">
                      <span className="inline-flex items-center gap-1.5" aria-hidden="true">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                      </span>
                      <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                        {currentCodeLanguage}
                      </span>
                    </div>
                    <Editor
                      height="400px"
                      path={question.id}
                      language={monacoLanguageFor(currentCodeLanguage)}
                      value={codeValue}
                      onChange={handleCodeChange}
                      onMount={(editor) => editorTelemetry.onEditorMount(editor)}
                      options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }}
                      theme="vs-dark"
                    />
                  </div>
                  {question.allowStdin ? (
                    <div className="mt-3 flex flex-col gap-1">
                      <label htmlFor="stdin-input" className="text-xs font-medium text-candidate-text-secondary">
                        Standard input (optional)
                      </label>
                      <textarea
                        id="stdin-input"
                        aria-label="Standard Input (Optional)"
                        value={stdinValue}
                        onChange={(e) => setStdinValues((prev) => ({ ...prev, [question.id]: e.target.value }))}
                        className="rounded-md border border-candidate-border px-2.5 py-1.5 font-mono text-xs"
                        rows={2}
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3">
                    <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                      <span className="inline-flex items-center gap-1.5">
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        {runCode.isPending ? 'Running…' : 'Run'}
                      </span>
                    </CandidateButton>
                    {runResult ? <span className="text-xs text-candidate-text-faint">{runResult.runsRemaining} runs left</span> : null}
                  </div>
                  <CodeOutputPanel result={runResult} error={runError} />
                </>
              )}
            </>
          ) : (
            // Two columns once there is real width to use: a single option row stretched
            // across a 2560px screen is mostly empty space with a radio button on the left.
            <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
              {question.options.map((option) => {
                const selected = selectedOptionIds.includes(option.id);
                return (
                  <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selected)}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={clsx(
                          'inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border-2',
                          selected ? 'border-candidate-primary bg-candidate-primary shadow-[inset_0_0_0_2px_white]' : 'border-candidate-text-faint',
                        )}
                        aria-hidden="true"
                      />
                      {option.imageUrl ? (
                        <img src={option.imageUrl} alt="Option illustration" className="h-10 w-10 rounded object-cover" />
                      ) : null}
                      {option.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-between">
            <CandidateButton variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </span>
            </CandidateButton>
            {currentIndex < questions.length - 1 ? (
              <CandidateButton onClick={() => setCurrentIndex((i) => i + 1)}>
                <span className="inline-flex items-center gap-1">
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </CandidateButton>
            ) : (
              <CandidateButton onClick={() => setConfirmOpen(true)}>Review & Submit</CandidateButton>
            )}
          </div>
        </div>

        {/* The extra width on a large screen goes to the navigator rather than stretching the
            question text further — the numbers and per-section counts genuinely read better. */}
        <div className="hidden w-56 shrink-0 overflow-y-auto lg:block xl:w-64 2xl:w-80">
          <QuestionNavigator sections={attemptState.sections} answers={answers} currentIndex={currentIndex} onSelect={setCurrentIndex} />
          <CandidateButton onClick={() => setConfirmOpen(true)} className="mt-3 w-full text-xs">
            Review & Submit
          </CandidateButton>
        </div>
      </div>

      {navigatorOpen && (
        <div className="fixed inset-0 z-10 flex items-end bg-candidate-text/30 lg:hidden" onClick={() => setNavigatorOpen(false)}>
          <div className="w-full rounded-t-xl bg-candidate-bg p-4" onClick={(event) => event.stopPropagation()}>
            <QuestionNavigator
              sections={attemptState.sections}
              answers={answers}
              currentIndex={currentIndex}
              onSelect={(index) => {
                setCurrentIndex(index);
                setNavigatorOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <Modal open={confirmOpen} title="Submit exam?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-candidate-text-secondary">You won&apos;t be able to change your answers after this.</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-candidate-primary-light p-2 text-center">
            <div className="text-lg font-bold text-candidate-primary">{answeredCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">Answered</div>
          </div>
          {/* Clickable when there is somewhere to go: enters a mode that steps through only the
              questions in that state. Rendered as a plain tile at zero so there is no dead
              control to press. */}
          {reviewCount > 0 ? (
            <button
              type="button"
              onClick={() => enterReviewFilter('marked')}
              aria-label={`Review the ${reviewCount} questions marked for review`}
              className="rounded-md bg-candidate-review-bg p-2 text-center transition hover:ring-2 hover:ring-inset hover:ring-candidate-review-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-candidate-review-border"
            >
              <div className="text-lg font-bold text-candidate-review">{reviewCount}</div>
              <div className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-candidate-review">
                For review <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </div>
            </button>
          ) : (
            <div className="rounded-md bg-candidate-review-bg p-2 text-center">
              <div className="text-lg font-bold text-candidate-review">{reviewCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">For review</div>
            </div>
          )}
          {unansweredCount > 0 ? (
            <button
              type="button"
              onClick={() => enterReviewFilter('unanswered')}
              aria-label={`Review the ${unansweredCount} unanswered questions`}
              className="rounded-md bg-candidate-bg p-2 text-center transition hover:ring-2 hover:ring-inset hover:ring-candidate-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-candidate-primary"
            >
              <div className="text-lg font-bold text-candidate-text-secondary">{unansweredCount}</div>
              <div className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-candidate-text-secondary">
                Unanswered <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </div>
            </button>
          ) : (
            <div className="rounded-md bg-candidate-bg p-2 text-center">
              <div className="text-lg font-bold text-candidate-text-secondary">{unansweredCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">Unanswered</div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <CandidateButton variant="secondary" onClick={() => setConfirmOpen(false)}>
            Keep reviewing
          </CandidateButton>
          <CandidateButton onClick={handleConfirmSubmit} disabled={submitAttempt.isPending}>
            {submitAttempt.isPending ? 'Submitting…' : 'Submit'}
          </CandidateButton>
        </div>
      </Modal>

      <Modal open={submitAttempt.isError} title="Couldn't submit" onClose={() => undefined}>
        <p className="mb-4 text-sm text-candidate-text-secondary">
          Your submission didn&apos;t go through. Your answers are saved — please retry.
        </p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()} className="bg-candidate-danger hover:opacity-90">
            Retry
          </CandidateButton>
        </div>
      </Modal>
      </div>
    </div>
  );
}
