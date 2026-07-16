'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import Editor from '@monaco-editor/react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../components/ui';
import { CandidateButton } from '../components/CandidateButton';
import { QuestionNavigator, flattenQuestions } from '../components/QuestionNavigator';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from '../components/ProctoringOverlay';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume, RunCodeResult } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { AttemptAnswerSummary, isAttemptStarted } from '../../../lib/types';

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function markButtonClasses(marked: boolean | undefined) {
  return clsx(
    'rounded-full border px-2 py-0.5 text-xs',
    marked ? 'border-candidate-review-border bg-candidate-review-bg text-candidate-review' : 'border-gray-200 text-gray-400',
  );
}

function optionClasses(selected: boolean) {
  return clsx(
    'rounded-lg border px-3 py-2 text-left text-sm',
    selected
      ? 'border-[1.5px] border-candidate-primary bg-candidate-primary-light font-semibold text-candidate-primary'
      : 'border-gray-200 text-gray-700',
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

  const remainingSeconds = useCountdown(attemptState?.remainingSeconds, () => {
    finishSubmit();
  });

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
  const unansweredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') {
      return !a || !a.answerText || a.answerText.trim() === '';
    }
    return !a || a.selectedOptionIds.length === 0;
  }).length;

  if (isError || !attemptState) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  if (!question || isTerminal) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
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
      <div className={clsx('mx-auto max-w-4xl p-4', (isPaused || isBlocked) && 'pointer-events-none blur-sm select-none')}>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => setNavigatorOpen((open) => !open)}
          className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary lg:hidden"
        >
          Q{currentIndex + 1}/{questions.length} ▾
        </button>
        <span className="hidden text-sm font-bold text-candidate-primary lg:inline">
          Question {currentIndex + 1} of {questions.length}
        </span>
        <span className="rounded-full bg-candidate-primary-light px-3 py-1 text-xs font-bold text-candidate-primary">
          ⏱ {formatTime(remainingSeconds)}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">
              {question.type === 'code' ? 'CODE' : question.type === 'multi_mcq' ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'} · {question.marks} MARKS
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              {existingAnswer?.isMarkedForReview ? '★ Marked for review' : '☆ Mark for review'}
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-800">{question.text}</p>
          {question.type === 'code' ? (
            <>
              <Editor
                height="400px"
                language={question.codeLanguage ?? 'plaintext'}
                value={codeValue}
                onChange={handleCodeChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
              {question.allowStdin ? (
                <div className="mt-2 flex flex-col gap-1">
                  <label htmlFor="stdin-input" className="text-xs font-medium text-gray-600">
                    Standard input (optional)
                  </label>
                  <textarea
                    id="stdin-input"
                    aria-label="Standard input (optional)"
                    value={stdinValue}
                    onChange={(e) => setStdinValues((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    className="rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    rows={2}
                  />
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                  {runCode.isPending ? 'Running…' : 'Run'}
                </CandidateButton>
              </div>
              {runError ? (
                <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{runError}</div>
              ) : runResult ? (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
                  {runResult.compileError ? (
                    <div className="text-red-700">{runResult.compileError}</div>
                  ) : (
                    <>
                      {runResult.stdout ? <div className="whitespace-pre-wrap">{runResult.stdout}</div> : null}
                      {runResult.stderr ? <div className="whitespace-pre-wrap text-red-700">{runResult.stderr}</div> : null}
                      {runResult.timedOut ? <div className="text-amber-700">Your program was stopped for taking too long.</div> : null}
                    </>
                  )}
                  <div className="mt-1 text-gray-500">Exit code: {runResult.exitCode}</div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selectedOptionIds.includes(option.id))}>
                  {selectedOptionIds.includes(option.id) ? '◉' : '○'} {option.text}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-between">
            <CandidateButton variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
              ← Previous
            </CandidateButton>
            {currentIndex < questions.length - 1 ? (
              <CandidateButton onClick={() => setCurrentIndex((i) => i + 1)}>Next →</CandidateButton>
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
        <div className="fixed inset-0 z-10 flex items-end bg-black/30 lg:hidden" onClick={() => setNavigatorOpen(false)}>
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
        <p className="mb-4 text-sm text-gray-600">
          {unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Once submitted, you cannot make further changes.`
            : 'Once submitted, you cannot make further changes.'}
        </p>
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
        <p className="mb-4 text-sm text-gray-600">Your submission didn&apos;t go through. Your answers are saved — please retry.</p>
        <div className="flex justify-end">
          <CandidateButton onClick={() => finishSubmit()}>Retry</CandidateButton>
        </div>
      </Modal>
      </div>
    </div>
  );
}
