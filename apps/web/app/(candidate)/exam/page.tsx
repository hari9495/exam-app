'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Editor from '@monaco-editor/react';
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../components/ui';
import { CandidateButton } from '../components/CandidateButton';
import { CodeOutputPanel } from '../components/CodeOutputPanel';
import { LeaderboardWidget } from '../components/LeaderboardWidget';
import { QuestionNavigator, flattenQuestions } from '../components/QuestionNavigator';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from '../components/ProctoringOverlay';
import { TimerBar } from '../components/TimerBar';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume, RunCodeResult } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { AttemptAnswerSummary, isAttemptStarted } from '../../../lib/types';

function markButtonClasses(marked: boolean | undefined) {
  return clsx(
    'rounded-full border px-2 py-0.5 text-xs',
    marked ? 'border-candidate-review-border bg-candidate-review-bg text-candidate-review' : 'border-candidate-border text-candidate-text-faint',
  );
}

function optionClasses(selected: boolean) {
  return clsx(
    'rounded-lg border px-3 py-2 text-left text-sm',
    selected
      ? 'border-[1.5px] border-candidate-primary bg-candidate-primary-light font-semibold text-candidate-primary'
      : 'border-candidate-border text-candidate-text-secondary',
  );
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
  const [localSelections, setLocalSelections] = useState<Record<string, string[]>>({});
  const [localCodeValues, setLocalCodeValues] = useState<Record<string, string>>({});
  const [stdinValues, setStdinValues] = useState<Record<string, string>>({});
  const [runResults, setRunResults] = useState<Record<string, RunCodeResult>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});

  const attemptState = current && isAttemptStarted(current) ? current : null;
  const isPaused = attemptState?.status === 'paused';
  const isBlocked = attemptState?.status === 'blocked';
  const isTerminal = Boolean(attemptState && attemptState.status !== 'in_progress' && !isPaused && !isBlocked);
  const started = attemptState?.status === 'in_progress';
  useProctoringMonitor(started);
  useWebcamMonitor(started);
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
  const answers: AttemptAnswerSummary[] = attemptState?.answers ?? [];
  const existingAnswer = answers.find((answer) => answer.questionId === question?.id);
  const selectedOptionIds = question ? localSelections[question.id] ?? existingAnswer?.selectedOptionIds ?? [] : [];
  const codeValue = question ? localCodeValues[question.id] ?? existingAnswer?.answerText ?? question.starterCode ?? '' : '';
  const stdinValue = question ? stdinValues[question.id] ?? '' : '';
  const runResult = question ? runResults[question.id] ?? null : null;
  const runError = question ? runErrors[question.id] ?? null : null;
  const answeredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') return Boolean(a && a.answerText && a.answerText.trim() !== '');
    return Boolean(a && a.selectedOptionIds.length > 0);
  }).length;
  const reviewCount = questions.filter((q) => answers.find((ans) => ans.questionId === q.id)?.isMarkedForReview).length;
  const unansweredCount = questions.length - answeredCount;

  if (isError || !attemptState) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  if (!question || isTerminal) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  function toggleOption(optionId: string) {
    const isMulti = question!.type === 'multi_mcq';
    const next = isMulti
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    setLocalSelections((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, next, existingAnswer?.isMarkedForReview);
  }

  function toggleMarkForReview() {
    if (question!.type === 'code') {
      saveAnswer(question!.id, [], !existingAnswer?.isMarkedForReview, codeValue);
    } else {
      saveAnswer(question!.id, selectedOptionIds, !existingAnswer?.isMarkedForReview);
    }
  }

  function handleCodeChange(value: string | undefined) {
    const next = value ?? '';
    setLocalCodeValues((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, [], existingAnswer?.isMarkedForReview, next);
  }

  function handleRun() {
    if (!question) return;
    const questionId = question.id;
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    runCode.mutate(
      { questionId, code: codeValue, stdin: question.allowStdin ? stdinValue : undefined },
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

  return (
    <div className="relative">
      {isPaused ? (
        <ProctoringWarningOverlay
          strike={attemptState.webcamViolationCount}
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
        className={clsx('mx-auto max-w-4xl p-4', (isPaused || isBlocked) && 'pointer-events-none blur-sm select-none')}
      >
      <div className="mb-4 rounded-lg border border-candidate-border bg-white px-4 py-3 shadow-sm">
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
          <LeaderboardWidget />
          <span className="hidden text-sm font-bold text-candidate-text lg:inline">{attemptState.exam.title}</span>
        </div>
        <TimerBar remainingSeconds={remainingSeconds} totalSeconds={totalSecondsRef.current ?? remainingSeconds} />
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-candidate-text-tertiary">
              Question {currentIndex + 1} of {questions.length} ·{' '}
              {question.type === 'code' ? 'Code' : question.type === 'multi_mcq' ? 'Multiple choice' : 'Single choice'} ·{' '}
              {question.marks} marks
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              <span className="inline-flex items-center gap-1">
                <Bookmark className="h-3 w-3" fill={existingAnswer?.isMarkedForReview ? 'currentColor' : 'none'} aria-hidden="true" />
                {existingAnswer?.isMarkedForReview ? 'Marked for review' : 'Mark for review'}
              </span>
            </button>
          </div>
          <p className="mb-4 text-sm text-candidate-text">{question.text}</p>
          {question.type === 'code' ? (
            <>
              <div className="overflow-hidden rounded-t-md">
                <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-1.5">
                  <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                    {question.codeLanguage ?? 'plaintext'}
                  </span>
                </div>
                <Editor
                  height="400px"
                  language={question.codeLanguage ?? 'plaintext'}
                  value={codeValue}
                  onChange={handleCodeChange}
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                  theme="vs-dark"
                />
              </div>
              {question.allowStdin ? (
                <div className="mt-2 flex flex-col gap-1">
                  <label htmlFor="stdin-input" className="text-xs font-medium text-candidate-text-secondary">
                    Standard input (optional)
                  </label>
                  <textarea
                    id="stdin-input"
                    aria-label="Standard input (optional)"
                    value={stdinValue}
                    onChange={(e) => setStdinValues((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    className="rounded border border-candidate-border px-2 py-1 font-mono text-xs"
                    rows={2}
                  />
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
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
          ) : (
            <div className="flex flex-col gap-2">
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

        <div className="hidden w-40 shrink-0 lg:block">
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
          <div className="rounded-md bg-candidate-review-bg p-2 text-center">
            <div className="text-lg font-bold text-candidate-review">{reviewCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">For review</div>
          </div>
          <div className="rounded-md bg-candidate-bg p-2 text-center">
            <div className="text-lg font-bold text-candidate-text-secondary">{unansweredCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-candidate-text-tertiary">Unanswered</div>
          </div>
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
