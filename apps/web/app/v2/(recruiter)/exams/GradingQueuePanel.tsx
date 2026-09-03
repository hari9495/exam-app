'use client';

// v2 GradingQueuePanel — re-skin of components/GradingQueuePanel.tsx on v2 primitives. All grading
// hooks, validation, AI-review flow and finalize logic are verbatim (format only). TabActivity
// components reused as-is.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../../../../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../../../../lib/types';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from '../../../../components/TabActivity';
import { useToast } from '../../../../components/ui';
import { dt, Pill } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const DIFFICULTY_COLOR: Record<string, string> = { easy: STATUS.ok, medium: STATUS.warn, hard: STATUS.bad };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 12, padding: 16 };
const input: React.CSSProperties = { boxSizing: 'border-box', padding: '8px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };

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
    <div style={{ ...card, marginBottom: 12 }}>
      <TabActivityBanner entries={question.tabActivity} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{question.questionText}</p>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span>
          <Pill c={DIFFICULTY_COLOR[question.difficulty] ?? 'var(--muted)'} label={question.difficulty} />
        </span>
      </div>
      <pre style={{ margin: '0 0 12px', overflowX: 'auto', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--hair)', padding: 12, fontSize: 12 }} className="v2-mono">{question.answerText ?? '(no submission)'}</pre>

      <div style={{ marginBottom: 12 }}>
        {reviewLoading ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Loading AI review…</p>
        ) : review?.status === 'processing' ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Generating AI review… this can take up to a minute.</p>
        ) : review?.status === 'completed' ? (
          <p style={{ fontSize: 12, color: 'var(--ink)', margin: 0, border: '1px solid var(--hair)', borderRadius: 8, padding: 8 }}>AI suggested {review.suggestedMarks} / {question.marks} — {review.summary}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            {review?.status === 'failed' && <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>The AI review didn&apos;t complete. You can try again, or grade this answer yourself.</p>}
            <button type="button" className="v2-hoverbtn" style={dt.toolBtn} disabled={regenerateReview.isPending} onClick={handleGenerateReview}>{review?.status === 'failed' ? 'Try again' : 'Generate AI review'}</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div>
          <label className="v2-label">Marks</label>
          <input type="number" min={0} max={question.marks} value={marks} onChange={(e) => setMarks(e.target.value)} required aria-label={`Marks for ${question.questionText}`} style={{ ...input, width: 100 }} />
        </div>
        <span style={{ paddingBottom: 9, fontSize: 13, color: 'var(--muted)' }}>/ {question.marks}</span>
        <button type="button" className="v2-hoverbtn" style={dt.primaryBtn} disabled={gradeAnswer.isPending} onClick={handleSaveGrade}>Save grade</button>
      </div>
      <textarea aria-label={`Feedback for ${question.questionText}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional feedback" rows={2} style={{ ...input, width: '100%', marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }} />
    </div>
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
  // Kick off every question's review in one click. allSettled — one failing to start must not cancel the rest.
  async function handleReviewAll() {
    setReviewingAll(true);
    try {
      const results = await Promise.allSettled(row.codeQuestions.map((question) => regenerateReview.mutateAsync({ attemptId: row.attemptId, questionId: question.questionId })));
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed === 0) toast(`Generating AI reviews for ${results.length} question${results.length === 1 ? '' : 's'}…`);
      else toast(`${results.length - failed} of ${results.length} started — ${failed} failed.`, 'error');
    } finally {
      setReviewingAll(false);
    }
  }

  return (
    <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px' }}>
        <button type="button" onClick={() => setOpen((wasOpen) => !wasOpen)} aria-expanded={open} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
          <ChevronRight size={16} style={{ color: 'var(--muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} aria-hidden="true" />
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{row.candidateName}</span>
          <span style={{ fontSize: 12, color: allGraded ? VIZ.green : 'var(--muted)' }}>{row.codeQuestions.length === 0 ? 'nothing attempted' : `${gradedCount} of ${row.codeQuestions.length} graded`}</span>
        </button>
        <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 8 }}>
          {row.codeQuestions.length > 0 && <button type="button" className="v2-hoverbtn" style={dt.toolBtn} disabled={reviewingAll} onClick={handleReviewAll}>{reviewingAll ? 'Starting…' : `AI review all (${row.codeQuestions.length})`}</button>}
          <button type="button" className="v2-hoverbtn" style={{ ...dt.primaryBtn, opacity: !allGraded || finalizeManualGrade.isPending ? 0.5 : 1, cursor: !allGraded || finalizeManualGrade.isPending ? 'not-allowed' : 'pointer' }} disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>Finalize grade</button>
        </div>
      </div>
      {hasTabActivityContent(row.tabActivitySummary, row.proctoringAnalysis) && (
        <div style={{ borderTop: '1px solid var(--hair)', padding: '8px 14px' }}>
          <TabActivitySummaryCard summary={row.tabActivitySummary} proctoringAnalysis={row.proctoringAnalysis} />
        </div>
      )}
      {open && (
        <div style={{ borderTop: '1px solid var(--hair)', padding: 14 }}>
          {row.codeQuestions.length === 0 ? (
            <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>This candidate didn&apos;t attempt any code questions. They score 0 — finalize to record it.</p></div>
          ) : (
            row.codeQuestions.map((question) => <CodeQuestionGrader key={question.questionId} attemptId={row.attemptId} question={question} />)
          )}
        </div>
      )}
    </div>
  );
}

export function GradingQueuePanel({ examId }: { examId: string }) {
  const { data: rows, isLoading } = usePendingGrading(examId);
  if (isLoading) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>;
  if (!rows || rows.length === 0) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>No attempts pending manual grading.</p>;
  return (
    <div>
      {rows.map((row) => <AttemptGrader key={row.attemptId} row={row} defaultOpen={rows.length === 1} />)}
    </div>
  );
}
