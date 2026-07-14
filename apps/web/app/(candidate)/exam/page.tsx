'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../components/ui';
import { CandidateButton } from '../components/CandidateButton';
import { QuestionNavigator, flattenQuestions } from '../components/QuestionNavigator';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSelections, setLocalSelections] = useState<Record<string, string[]>>({});

  const attemptState = current && isAttemptStarted(current) ? current : null;
  const started = Boolean(attemptState);
  useProctoringMonitor(started);

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
    }
  }, [current, isError, router, accessToken, authLoading]);

  const questions = useMemo(() => (attemptState ? flattenQuestions(attemptState.sections) : []), [attemptState]);
  const question = questions[currentIndex];
  const answers: AttemptAnswerSummary[] = attemptState?.answers ?? [];
  const existingAnswer = answers.find((answer) => answer.questionId === question?.id);
  const selectedOptionIds = question ? localSelections[question.id] ?? existingAnswer?.selectedOptionIds ?? [] : [];
  const unansweredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    return !a || a.selectedOptionIds.length === 0;
  }).length;

  if (isError || !attemptState || !question) {
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
    saveAnswer(question!.id, selectedOptionIds, !existingAnswer?.isMarkedForReview);
  }

  async function handleConfirmSubmit() {
    setConfirmOpen(false);
    await finishSubmit();
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
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
              {question.type === 'multi_mcq' ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'} · {question.marks} MARKS
            </span>
            <button onClick={toggleMarkForReview} className={markButtonClasses(existingAnswer?.isMarkedForReview)}>
              {existingAnswer?.isMarkedForReview ? '★ Marked for review' : '☆ Mark for review'}
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-800">{question.text}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option) => (
              <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selectedOptionIds.includes(option.id))}>
                {selectedOptionIds.includes(option.id) ? '◉' : '○'} {option.text}
              </button>
            ))}
          </div>
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
          <CandidateButton onClick={() => submitAttempt.mutate()}>Retry</CandidateButton>
        </div>
      </Modal>
    </div>
  );
}
