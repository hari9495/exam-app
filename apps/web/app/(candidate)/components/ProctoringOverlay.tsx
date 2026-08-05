import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { CandidateButton } from './CandidateButton';

interface ProctoringWarningOverlayProps {
  strike: number;
  strikeLimit: number;
  reason?: string;
  onContinue: () => void;
  continuePending: boolean;
  continueError: boolean;
}

const DEFAULT_MESSAGE = {
  heading: 'Face Not Visible',
  body: "We couldn't see your face clearly. Make sure you're centered in the camera and facing forward, then continue.",
};

const MESSAGES_BY_REASON: Record<string, { heading: string; body: string }> = {
  multiple_faces: {
    heading: 'More Than One Person Detected',
    body: 'Only you may be in view during the exam. Make sure no one else is visible in the camera, then continue.',
  },
  no_face: DEFAULT_MESSAGE,
  head_turned: DEFAULT_MESSAGE,
  tab_switch: { heading: 'Tab Switch Detected', body: 'We noticed you switched away from this exam tab.' },
  window_blur: { heading: 'Switched Application', body: 'We noticed you switched to another application.' },
  fullscreen_exit: { heading: 'Exited Fullscreen', body: 'We noticed you exited fullscreen mode.' },
  copy_paste: { heading: 'Copy/Paste Detected', body: 'We noticed copy or paste activity.' },
  right_click: { heading: 'Right-Click Detected', body: 'We noticed a right-click / context-menu action.' },
  dev_tools_detected: { heading: 'Developer Tools Detected', body: 'We noticed browser developer tools were opened.' },
  multi_monitor_detected: { heading: 'Additional Display Detected', body: 'We noticed an additional display was connected.' },
  idle_timeout: { heading: 'Inactivity Detected', body: 'We noticed no activity for several minutes.' },
  browser_activity_unspecified: { heading: 'Policy Violation Detected', body: 'We noticed unusual activity during this exam.' },
};

export function ProctoringWarningOverlay({ strike, strikeLimit, reason, onContinue, continuePending, continueError }: ProctoringWarningOverlayProps) {
  const { heading, body } = (reason && MESSAGES_BY_REASON[reason]) || DEFAULT_MESSAGE;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-candidate-text/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-candidate-review-bg text-candidate-review">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">{heading}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">{body}</p>
        <p className="mb-4 text-xs text-candidate-text-faint">Warning {strike}/{strikeLimit}</p>
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
        <h1 className="mb-1 text-base font-bold text-candidate-text">Exam Paused</h1>
        <p className="mb-3 text-sm text-candidate-text-secondary">
          Your exam has been paused after repeated policy violations. A recruiter needs to unblock your session before you
          can continue.
        </p>
        <p className="mb-1 text-xs text-candidate-text-faint">Waiting for a recruiter · checking automatically</p>
        <p className="text-xs text-candidate-text-faint">Your timer is paused — you won&apos;t lose time waiting.</p>
      </div>
    </div>
  );
}
