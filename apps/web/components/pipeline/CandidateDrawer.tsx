'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal, Button, useToast } from '../ui';
import { useEntryFeedback, useAddFeedback } from '../../lib/hooks/usePipeline';
import { BoardRow, EntryExamResult } from '../../lib/types';

function chipLabel(result: EntryExamResult): string {
  if (result.passFail === null) return `${result.examTitle} · Pending`;
  const label = result.passFail === 'pass' ? 'Passed' : 'Failed';
  return `${result.examTitle} · ${label}${result.score !== null ? ` ${result.score}%` : ''}`;
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value >= n}
          onClick={() => onChange(n)}
          className={value >= n ? 'text-amber-500' : 'text-gray-300'}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// Candidate details + full exam results + feedback timeline/compose. Fed with the BoardRow
// the caller already has from useJobPipeline -- no separate candidate fetch needed, the
// board's row already carries name/email/examResults.
export function CandidateDrawer({ jobId, row, onClose }: { jobId: string; row: BoardRow; onClose: () => void }) {
  const { data: feedback, isLoading } = useEntryFeedback(row.entryId);
  const addFeedback = useAddFeedback(row.entryId, jobId);
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);

  const canSubmit = Boolean(note.trim() || rating > 0);

  function handleSubmit() {
    addFeedback.mutate(
      { note: note.trim() || undefined, rating: rating > 0 ? rating : undefined },
      {
        onSuccess: () => {
          setNote('');
          setRating(0);
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add feedback.', 'error'),
      },
    );
  }

  return (
    <Modal open title={row.candidateName} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-recruiter-text-secondary">{row.candidateEmail}</p>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Exam results</h3>
          {row.examResults.length === 0 ? (
            <p className="text-sm text-recruiter-text-tertiary">No linked exam results yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {row.examResults.map((result) => (
                <li key={result.examId}>
                  <Link href={`/reports/${result.examId}/candidates/${row.candidateId}`} className="text-sm text-primary hover:underline">
                    {chipLabel(result)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Feedback</h3>
          {isLoading ? (
            <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
          ) : (feedback ?? []).length === 0 ? (
            <p className="text-sm text-recruiter-text-tertiary">No feedback yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(feedback ?? []).map((entry) => (
                <li key={entry.id} className="rounded border border-recruiter-border p-3">
                  <div className="flex items-center justify-between text-xs text-recruiter-text-tertiary">
                    <span>{entry.authorName ?? 'Unknown'}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  {entry.rating !== null && (
                    <p className="mt-1 text-sm text-amber-500">
                      {'★'.repeat(entry.rating)}
                      {'☆'.repeat(5 - entry.rating)}
                    </p>
                  )}
                  {entry.note && <p className="mt-1 text-sm text-recruiter-text">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-recruiter-border pt-4">
            <label htmlFor="feedback-note" className="text-sm font-medium text-gray-700">
              Add feedback
            </label>
            <textarea
              id="feedback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Notes for the team…"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <StarPicker value={rating} onChange={setRating} />
            <div>
              <Button size="sm" onClick={handleSubmit} loading={addFeedback.isPending} disabled={!canSubmit}>
                Post feedback
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
