import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { CandidateButton } from './CandidateButton';

interface ProctoringWarningOverlayProps {
  strike: number;
  onContinue: () => void;
  continuePending: boolean;
  continueError: boolean;
}

export function ProctoringWarningOverlay({ strike, onContinue, continuePending, continueError }: ProctoringWarningOverlayProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-review-bg text-candidate-review">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">Face not visible</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">
          We couldn&apos;t see your face clearly. Make sure you&apos;re centered in the camera and facing forward, then
          continue.
        </p>
        <p className="mb-4 text-xs text-candidate-text-faint">Warning {strike}/3</p>
        <CandidateButton onClick={onContinue} disabled={continuePending}>
          {continuePending ? 'Checking…' : 'Continue'}
        </CandidateButton>
        {continueError ? <p className="mt-2 text-xs text-candidate-danger">Still not detected — reposition and try again.</p> : null}
      </div>
    </div>
  );
}

export function ProctoringBlockOverlay() {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/55 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-danger-bg text-candidate-danger">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">Exam paused</h1>
        <p className="text-sm text-candidate-text-secondary">
          Your exam has been paused after repeated webcam violations. A recruiter needs to unblock your session before you
          can continue.
        </p>
      </div>
    </div>
  );
}
