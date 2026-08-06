'use client';

import { useState } from 'react';
import { Button, Card, Input, useToast } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../lib/types';

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
      <p className="mb-2 text-sm font-medium text-gray-800">{question.questionText}</p>
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

      <div className="flex items-end gap-3">
        <Input
          label={`Marks For ${question.questionText}`}
          type="number"
          min={0}
          max={question.marks}
          value={marks}
          onChange={setMarks}
          required
        />
        <Button type="button" disabled={gradeAnswer.isPending} onClick={handleSaveGrade}>
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

function AttemptGrader({ row }: { row: PendingGradingRow }) {
  const finalizeManualGrade = useFinalizeManualGrade();
  const { toast } = useToast();
  const allGraded = row.codeQuestions.every((question) => question.marksAwarded !== null);

  async function handleFinalize() {
    try {
      await finalizeManualGrade.mutateAsync(row.attemptId);
      toast('Attempt finalized.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to finalize attempt.', 'error');
    }
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-medium">{row.candidateName}</h3>
        <Button disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>
          Finalize grade
        </Button>
      </div>
      {row.codeQuestions.map((question) => (
        <CodeQuestionGrader key={question.questionId} attemptId={row.attemptId} question={question} />
      ))}
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
        <AttemptGrader key={row.attemptId} row={row} />
      ))}
    </div>
  );
}
