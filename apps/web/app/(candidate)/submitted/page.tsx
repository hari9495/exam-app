'use client';

import { TerminalCard } from '../components/TerminalCard';
import { ResultSummary } from '../components/ResultSummary';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

export default function CandidateSubmittedPage() {
  const { data: current } = useAttemptQuery();
  const feedback = current && isAttemptStarted(current) ? current.feedback : null;

  const isPending = feedback?.status === 'pending_review';
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
    : hasResult
      ? 'Your exam has been submitted. Here is your result:'
      : 'Your exam has been submitted. Results will be reviewed by the recruiter.';

  return (
    <TerminalCard tone="success" title="Exam submitted" body={body}>
      {hasResult && feedback ? <ResultSummary feedback={feedback} /> : null}
    </TerminalCard>
  );
}
