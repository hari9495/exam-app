import { ScreenShare } from 'lucide-react';
import { CandidateButton } from './CandidateButton';

interface ScreenShareRequiredOverlayProps {
  error: 'wrong-surface' | 'denied' | 'unsupported' | 'unavailable' | null;
  onShare: () => void;
  pending?: boolean;
}

export function ScreenShareRequiredOverlay({ error, onShare, pending }: ScreenShareRequiredOverlayProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-candidate-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-candidate-border bg-white p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-review-bg text-candidate-review">
          <ScreenShare className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 font-display text-base font-bold text-candidate-text">Screen Sharing Required</h1>
        <p className="mb-3 text-sm text-candidate-text-secondary">
          This exam records your screen for integrity review. Please share your entire screen to continue.
        </p>
        <p className="mb-4 text-xs text-candidate-text-faint">Your exam is paused and no time is being lost while you do this.</p>
        {error === 'wrong-surface' ? (
          <p className="mb-4 text-xs text-candidate-danger">Please choose your entire screen, not a single tab or window.</p>
        ) : error === 'denied' ? (
          // A browser/org-level display-capture block (Permissions-Policy, an enterprise
          // ScreenCaptureAllowed policy, a missing OS screen-recording grant) rejects with the
          // exact same NotAllowedError as a candidate dismissing the picker -- the client
          // cannot tell these apart, so this copy has to cover both rather than assume denial.
          <p className="mb-4 text-xs text-candidate-danger">
            You dismissed the prompt — click again and choose your entire screen. If you didn&apos;t see a sharing prompt, your
            browser or organization may be blocking it — contact your recruiter, they can let you continue without it.
          </p>
        ) : error === 'unavailable' || error === 'unsupported' ? (
          <p className="mb-4 text-xs text-candidate-danger">
            Your browser or organization is blocking screen sharing. Contact your recruiter — they can let you continue without it.
          </p>
        ) : null}
        <CandidateButton onClick={onShare} disabled={pending}>
          {pending ? 'Waiting…' : 'Share my screen'}
        </CandidateButton>
      </div>
    </div>
  );
}
