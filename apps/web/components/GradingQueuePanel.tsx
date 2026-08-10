'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button, Card, Input, StatusBadge, useToast, type StatusTone } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../lib/types';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from './TabActivity';

// The question bank's three levels. Unknown values fall back to neutral rather than crashing --
// difficulty is a plain string column, not an enum, so a future level must not break grading.
const DIFFICULTY_TONE: Record<string, StatusTone> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

function CodeQuestionGrader({ attemptId, question }: { attemptId: string; question: PendingGradingCodeQuestion }) {
  const [marks, setMarks] = useState(question.marksAwarded !== null ? String(question.marksAwarded) : '');
  const [feedback, setFeedback] = useState(question.gradingFeedback ?? '');
  const gradeAnswer = useGradeCodeAnswer(attemptId);
  const { data: review, isLoading: reviewLoading } = useCodeReview(attemptId, question.questionId);
  const regenerateReview = useRegenerateCodeReview();
  const { toast } = useToast();

  async function handleSaveGrade() {
    const marksAwarded = Number(marks);
    if (marks.trim() === '' || Number.isNaN(marksAwarded) || marksAwarded < 0 || marksAwarded > question.marks) {
      toast(`Marks must be between 0 and ${question.marks}.`, 'error');
      return;
    }
    try {
      await gradeAnswer.mutateAsync({ questionId: question.questionId, marksAwarded, feedback: feedback || undefined });
      toast('Grade saved.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to save grade.', 'error');
    }
  }

  async function handleGenerateReview() {
    try {
      await regenerateReview.mutateAsync({ attemptId, questionId: question.questionId });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to generate AI review.', 'error');
    }
  }

  return (
    <Card className="mb-3">
      <TabActivityBanner entries={question.tabActivity} />
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-800">{question.questionText}</p>
        {/* How hard the question is meant to be, straight from the question bank. A 3-mark hard
            question and a 3-mark easy one warrant different strictness, and the grader had no way
            to tell them apart here. */}
        <span className="flex shrink-0 items-center gap-2">
          {/* What this question is worth. It was previously only discoverable by typing an
              out-of-range value and reading the error toast. */}
          <span className="whitespace-nowrap text-xs font-medium text-gray-600">
            {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
          </span>
          <StatusBadge tone={DIFFICULTY_TONE[question.difficulty] ?? 'neutral'}>{question.difficulty}</StatusBadge>
        </span>
      </div>
      <pre className="mb-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs">{question.answerText ?? '(no submission)'}</pre>

      <div className="mb-3">
        {reviewLoading ? (
          <p className="text-xs text-gray-500">Loading AI review…</p>
        ) : review?.status === 'processing' ? (
          // Generation is detached server-side and can take a while; useCodeReview polls until
          // it settles. Without this branch the row fell through to the button below and invited
          // a second click on work that was already running.
          <p className="text-xs text-gray-500">Generating AI review… this can take up to a minute.</p>
        ) : review?.status === 'completed' ? (
          <p className="rounded border border-gray-200 p-2 text-xs text-gray-700">
            AI suggested {review.suggestedMarks} / {question.marks} — {review.summary}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {review?.status === 'failed' && (
              // Say so rather than silently offering the button again, which read as if the
              // click had never registered.
              <p className="text-xs text-status-danger">
                The AI review didn&apos;t complete. You can try again, or grade this answer yourself.
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={regenerateReview.isPending}
              onClick={handleGenerateReview}
              className="self-start"
            >
              {review?.status === 'failed' ? 'Try Again' : 'Generate AI Review'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Input
          label={`Marks For ${question.questionText}`}
          type="number"
          min={0}
          max={question.marks}
          value={marks}
          onChange={setMarks}
          required
        />
        {/* The ceiling, right where the number is typed -- so an out-of-range value is obvious
            before the Save that rejects it. */}
        <span className="pb-2 text-sm text-gray-500">/ {question.marks}</span>
        <Button type="button" disabled={gradeAnswer.isPending} onClick={handleSaveGrade} className="ml-1">
          Save grade
        </Button>
      </div>
      <textarea
        aria-label={`Feedback for ${question.questionText}`}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Optional feedback"
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        rows={2}
      />
    </Card>
  );
}

function AttemptGrader({ row, defaultOpen }: { row: PendingGradingRow; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [reviewingAll, setReviewingAll] = useState(false);
  const finalizeManualGrade = useFinalizeManualGrade();
  const regenerateReview = useRegenerateCodeReview();
  const { toast } = useToast();
  const gradedCount = row.codeQuestions.filter((question) => question.marksAwarded !== null).length;
  const allGraded = gradedCount === row.codeQuestions.length;

  async function handleFinalize() {
    try {
      await finalizeManualGrade.mutateAsync(row.attemptId);
      toast('Attempt finalized.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to finalize attempt.', 'error');
    }
  }

  // Kick off every question's review in one click. No batch endpoint is needed: generation is
  // already detached server-side, so each call returns immediately and each card's own poll
  // (useCodeReview) shows "Generating…" and then the result. allSettled, not all -- one question
  // failing to start must not cancel the rest.
  async function handleReviewAll() {
    setReviewingAll(true);
    try {
      const results = await Promise.allSettled(
        row.codeQuestions.map((question) => regenerateReview.mutateAsync({ attemptId: row.attemptId, questionId: question.questionId })),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed === 0) {
        toast(`Generating AI reviews for ${results.length} question${results.length === 1 ? '' : 's'}…`);
      } else {
        toast(`${results.length - failed} of ${results.length} started — ${failed} failed.`, 'error');
      }
    } finally {
      setReviewingAll(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200">
      {/* One row per candidate, collapsed. With a full drive queued, the old layout stacked every
          candidate's every code answer into one unscannable column -- you could not see who was
          left without scrolling past everyone's submissions. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRight size={16} className={open ? 'rotate-90 text-gray-500 transition-transform' : 'text-gray-500 transition-transform'} aria-hidden="true" />
          <span className="text-base font-medium">{row.candidateName}</span>
          <span className={allGraded ? 'text-xs text-green-700' : 'text-xs text-gray-500'}>
            {row.codeQuestions.length === 0
              ? 'nothing attempted'
              : `${gradedCount} of ${row.codeQuestions.length} graded`}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {row.codeQuestions.length > 0 && (
            <Button variant="secondary" disabled={reviewingAll} onClick={handleReviewAll}>
              {reviewingAll ? 'Starting…' : `AI review all (${row.codeQuestions.length})`}
            </Button>
          )}
          <Button disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>
            Finalize grade
          </Button>
        </div>
      </div>
      {hasTabActivityContent(row.tabActivitySummary, row.proctoringAnalysis) && (
        <div className="border-t border-gray-200 px-3 py-2">
          <TabActivitySummaryCard summary={row.tabActivitySummary} proctoringAnalysis={row.proctoringAnalysis} />
        </div>
      )}
      {!open ? null : (
      <div className="border-t border-gray-200 p-3">
      {row.codeQuestions.length === 0 ? (
        // Unattempted code questions are auto-zeroed and hidden, so a queued attempt can have
        // nothing left to judge. Say that, rather than showing a name above empty space.
        <Card className="mb-3">
          <p className="text-sm text-gray-600">
            This candidate didn&apos;t attempt any code questions. They score 0 — finalize to record it.
          </p>
        </Card>
      ) : (
        row.codeQuestions.map((question) => (
          <CodeQuestionGrader key={question.questionId} attemptId={row.attemptId} question={question} />
        ))
      )}
      </div>
      )}
    </div>
  );
}

export function GradingQueuePanel({ examId }: { examId: string }) {
  const { data: rows, isLoading } = usePendingGrading(examId);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-500">No attempts pending manual grading.</p>;
  }

  return (
    <div>
      {rows.map((row) => (
        // A single pending candidate is opened for you -- collapsing the only row would just be
        // one click before any work could start. Past that, everything starts closed.
        <AttemptGrader key={row.attemptId} row={row} defaultOpen={rows.length === 1} />
      ))}
    </div>
  );
}
