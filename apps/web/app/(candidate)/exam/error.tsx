'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '../../../components/ErrorScreen';

/**
 * Exam-scoped error boundary. The root boundary is wrong here: its "Back to Prudent Hire" action
 * would walk a candidate out of a live attempt. Answers are persisted server-side by the debounced
 * `saveAnswer` mutation, so the correct recovery is to reload back INTO the attempt — and the copy
 * says only what is actually true (saved answers survive; the last keystroke or two may not have
 * flushed yet).
 */
export default function ExamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      eyebrow="Exam interrupted"
      title="Something went wrong loading your exam."
      description="Your saved answers are safe — they are stored as you go. Reload to pick up where you left off. If this keeps happening, tell your invigilator and share the reference below."
      actions={
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-ink px-4 py-2 font-body text-sm font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          Reload the exam
        </button>
      }
      footnote={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
