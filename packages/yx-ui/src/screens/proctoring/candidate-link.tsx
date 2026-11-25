import { EmptyState, ErrorState } from '../../components/feedback';
import { Spinner } from '../../components/foundations';
import { CandidateFrame } from './proctoring-shared';

// Decision 2398 (step 4): the candidate's invitation link (/start) and the "session ended" page, in the kit. The company
// is not known yet on these pages, so the frame shows only "Candidate test portal".
export type LiveCandidateLink =
  | { state: 'checking' }
  /** The link could not be opened. `onRetry` only when trying again can work (a dropped connection, a server error). */
  | { state: 'failed'; message: string; onRetry?: () => void }
  /** Opened in another tab or browser, or the session expired. */
  | { state: 'ended' };

export function CandidateLinkScreen({ live }: { live: LiveCandidateLink }) {
  return (
    <CandidateFrame company="" user="">
      {live.state === 'checking' ? (
        <EmptyState icon={<Spinner size="md" label="Checking your invitation" />} title="Checking your invitation" description="This takes a moment." />
      ) : live.state === 'failed' ? (
        <ErrorState title="We can't open this invitation" description={live.message} onRetry={live.onRetry} />
      ) : (
        <EmptyState
          title="Your session has ended"
          description="The test was opened in another tab or browser, or your session expired. If the test is still open, use the link in your invitation email again to continue."
        />
      )}
    </CandidateFrame>
  );
}
