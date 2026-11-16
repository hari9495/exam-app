import type { LiveRunnerPause } from '@yukthix/ui/assessments';

// Answer 2231 (AS-5 part 2): every reason the test stops, as the designed runner's paused view shows it. The wording
// is the older overlays' (ProctoringOverlay, ScreenShareRequiredOverlay), now in the kit's sentence case.

const DEFAULT_MESSAGE = { title: 'Face not visible', message: "We couldn't see your face clearly. Make sure you're centred in the camera and facing forward, then continue." };

const BY_REASON: Record<string, { title: string; message: string }> = {
  multiple_faces: { title: 'More than one person detected', message: 'Only you may be in view during the test. Make sure no one else is visible in the camera, then continue.' },
  no_face: DEFAULT_MESSAGE,
  head_turned: DEFAULT_MESSAGE,
  face_mismatch: { title: 'Identity check failed', message: "Your face didn't match your enrolment photo. Make sure you're centred and facing the camera, then continue." },
  tab_switch: { title: 'Tab switch detected', message: 'We noticed you switched away from this test tab.' },
  window_blur: { title: 'Switched application', message: 'We noticed you switched to another application.' },
  fullscreen_exit: { title: 'Exited full screen', message: 'We noticed you left full screen mode.' },
  copy_paste: { title: 'Copy or paste detected', message: 'We noticed copy or paste activity.' },
  right_click: { title: 'Right-click detected', message: 'We noticed a right-click or context-menu action.' },
  dev_tools_detected: { title: 'Developer tools detected', message: 'We noticed browser developer tools were opened.' },
  multi_monitor_detected: { title: 'Additional display detected', message: 'We noticed an additional display was connected.' },
  idle_timeout: { title: 'Inactivity detected', message: 'We noticed no activity for several minutes.' },
  browser_activity_unspecified: { title: 'Policy violation detected', message: 'We noticed unusual activity during this test.' },
};

const SHARE_ERROR: Record<string, string> = {
  'wrong-surface': 'Please choose your entire screen, not a single tab or window.',
  // A browser or company block rejects exactly like a dismissed picker; the client cannot tell them apart.
  denied: "You dismissed the prompt: click again and choose your entire screen. If you didn't see a sharing prompt, your browser or organisation may be blocking it; contact your recruiter, they can let you continue without it.",
  unavailable: 'Your browser or organisation is blocking screen sharing. Contact your recruiter; they can let you continue without it.',
  unsupported: 'Your browser or organisation is blocking screen sharing. Contact your recruiter; they can let you continue without it.',
};

export interface PauseInput {
  status: string;
  pausedReason: string | null;
  /** The last rule broken on this device (a reload reads the server's owner instead). */
  violationReason: string;
  violationSource: 'webcam' | 'browser_activity';
  webcamViolations: number;
  browserViolations: number;
  strikeLimit: number;
  pauseMessage?: string | null;
  /** The test needs a shared screen and none is shared. */
  shareNeeded: boolean;
  shareError: string | null;
  onShare: () => void;
  sharing: boolean;
  onContinue: () => void;
  continuing: boolean;
  continueFailed: boolean;
  onFaceCheck: () => void;
  faceChecking: boolean;
  faceCheckFailed: string | null;
}

/** The pause to show, or null while the test runs (a break has its own view). */
export function pauseFor(i: PauseInput): LiveRunnerPause | null {
  if (i.status === 'blocked')
    return {
      title: 'Test paused',
      message: 'Your test has been paused after repeated policy violations. A recruiter needs to unblock your session before you can continue.',
      note: "Waiting for a recruiter; we check automatically. Your timer is paused: you won't lose time waiting.",
    };
  if (i.shareNeeded)
    return {
      title: 'Screen sharing required',
      message: 'This test records your screen for integrity review. Please share your entire screen to continue.',
      note: 'Your test is paused and no time is being lost while you do this.',
      action: { label: 'Share my screen', busyLabel: 'Waiting…', onClick: i.onShare, busy: i.sharing },
      error: i.shareError ? SHARE_ERROR[i.shareError] ?? null : null,
    };
  if (i.status !== 'paused' || i.pausedReason === 'break') return null;
  if (i.pausedReason === 'proctor')
    return {
      title: 'Your test is paused',
      message: i.pauseMessage?.trim() ? `Message from your proctor: "${i.pauseMessage.trim()}"` : 'Your proctor paused the test.',
      note: 'The timer is stopped. It starts again when your proctor resumes the test.',
    };
  if (i.pausedReason === 'face_recheck')
    return {
      title: 'Check your face to continue',
      message: 'Your extra time was approved. Look straight at the camera in good light; we check it is still you, then the test carries on.',
      note: 'The timer is stopped while you do this.',
      action: { label: 'Check and continue', busyLabel: 'Checking…', onClick: i.onFaceCheck, busy: i.faceChecking },
      error: i.faceCheckFailed,
    };
  const face = i.pausedReason === 'face_mismatch';
  const { title, message } = BY_REASON[face ? 'face_mismatch' : i.violationReason] ?? DEFAULT_MESSAGE;
  // A face mismatch pause is a direct action, not a strike: no count.
  const strikes = i.violationSource === 'browser_activity' ? i.browserViolations : i.webcamViolations;
  return {
    title,
    message,
    strike: face ? null : `Warning ${strikes}/${i.strikeLimit}`,
    action: { label: 'Continue', busyLabel: 'Checking…', onClick: i.onContinue, busy: i.continuing },
    error: i.continueFailed ? 'Still not detected: reposition and try again.' : null,
  };
}

/** One frame from the camera as a JPEG data URI (the face check after approved extra time). */
export async function cameraFrame(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
