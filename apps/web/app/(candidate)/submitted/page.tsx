'use client';

import { TerminalCard } from '../components/TerminalCard';
import { ResultSummary } from '../components/ResultSummary';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

export default function CandidateSubmittedPage() {
  const { data: current } = useAttemptQuery();
  const feedback = current && isAttemptStarted(current) ? current.feedback : null;

  return (
    <div>
      <TerminalCard
        tone="success"
        title="Exam submitted"
        body="Your exam has been submitted. Results will be reviewed by the recruiter."
      />
      {feedback ? (
        <div className="mx-auto -mt-3 w-full max-w-sm px-6">
          <ResultSummary feedback={feedback} />
        </div>
      ) : null}
    </div>
  );
}
