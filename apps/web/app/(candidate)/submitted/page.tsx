'use client';

import { useState } from 'react';
import { TerminalCard } from '../components/TerminalCard';
import { ResultSummary } from '../components/ResultSummary';
import { useAttemptQuery, useCandidateCertificate } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

export default function CandidateSubmittedPage() {
  const { data: current } = useAttemptQuery();
  const certificate = useCandidateCertificate();
  const [certError, setCertError] = useState<string | null>(null);
  const feedback = current && isAttemptStarted(current) ? current.feedback : null;

  const isPending = feedback?.status === 'pending_review';
  const isAwaitingRelease = feedback?.status === 'awaiting_release';
  // A result is shown only when the exam's feedback setting isn't "none" and there's something to show.
  const hasResult =
    !!feedback &&
    feedback.status === 'settled' &&
    feedback.visibility !== 'none' &&
    (feedback.passFail !== null || feedback.percentage !== null || feedback.sections !== null);

  // Body copy tracks what the candidate is actually shown, so a card that reveals a Pass/Fail/score
  // no longer also claims the result is coming later from the recruiter.
  const body = isPending
    ? 'Your exam has been submitted. Some answers need manual review — your result will follow.'
    : isAwaitingRelease
      ? "Your exam has been submitted. Your results haven't been released yet — you'll be able to see them once the recruiter releases them."
      : hasResult
        ? 'Your exam has been submitted. Here is your result:'
        : 'Your exam has been submitted. Results will be reviewed by the recruiter.';

  return (
    <TerminalCard tone="success" title="Exam submitted" body={body}>
      {hasResult && feedback ? <ResultSummary feedback={feedback} /> : null}
      {feedback?.certificateAvailable ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={certificate.isPending}
            onClick={async () => {
              setCertError(null);
              try {
                const { url } = await certificate.mutateAsync();
                window.open(url, '_blank', 'noopener');
              } catch (e) {
                setCertError(e instanceof Error ? e.message : 'Could not download your certificate.');
              }
            }}
            className="inline-flex items-center rounded bg-candidate-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {certificate.isPending ? 'Preparing…' : 'Download certificate'}
          </button>
          {certError ? <p className="text-xs text-candidate-danger">{certError}</p> : null}
        </div>
      ) : null}
    </TerminalCard>
  );
}
