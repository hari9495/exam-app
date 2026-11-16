import { act, render, screen } from '@testing-library/react';
import { FaceEnrolmentStep, ATTEMPT_TIMEOUT_MS } from './FaceEnrolmentStep';

// The capture phase needs a camera and MediaPipe, both mocked here. Consent is given on the designed consent step
// (PRC-24) before this step mounts (answer 2201), so capture starts at once.

// A camera and a model that both work perfectly, and a candidate the challenge never sees blink:
// detectForVideo reports no face, which createBlinkChallenge deliberately holds its state on. This
// is the real dead end -- glasses glare, poor light, candidate out of frame.
jest.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: jest.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: jest.fn().mockResolvedValue({
      detectForVideo: () => ({ faceBlendshapes: [], faceLandmarks: [] }),
      close: jest.fn(),
    }),
  },
}));

const stop = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  stop.mockClear();
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// Lets the effect's dynamic import / model load / getUserMedia awaits resolve.
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function agree(policy: 'allow_unenrolled' | 'retry_then_allow' | 'require_enrolment', onSettled = jest.fn()) {
  render(<FaceEnrolmentStep policy={policy} candidateName="Ada" companyName="Acme" onSettled={onSettled} />);
  await flush();
  return onSettled;
}

async function waitOutTheDeadline() {
  await act(async () => {
    jest.advanceTimersByTime(ATTEMPT_TIMEOUT_MS);
  });
  await flush();
}

describe('FaceEnrolmentStep capture timeout', () => {
  it('fails the attempt instead of stalling forever when no blink is ever detected', async () => {
    await agree('retry_then_allow');
    expect(screen.getByText(/Try 1 of 3/)).toBeInTheDocument();

    await waitOutTheDeadline();

    expect(screen.getByText(/could not get a clear photo in time/i)).toBeInTheDocument();
    expect(screen.getByText(/Try 2 of 3/)).toBeInTheDocument();
  });

  it('still retries and settles after three timed-out attempts', async () => {
    const onSettled = await agree('retry_then_allow');

    await waitOutTheDeadline();
    await waitOutTheDeadline();
    await waitOutTheDeadline();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ status: 'not_verified', consentGiven: true });
  });

  // allow_unenrolled and retry_then_allow are separate dropdown options. They used to do exactly
  // the same thing -- three attempts, then settle -- which made one of them a lie.
  it('settles on the FIRST failure under allow_unenrolled instead of labouring three attempts', async () => {
    const onSettled = await agree('allow_unenrolled');
    expect(screen.getByText(/Try 1 of 1/)).toBeInTheDocument();

    await waitOutTheDeadline();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ status: 'not_verified', consentGiven: true });
  });

  it('still spends all three attempts under retry_then_allow before settling', async () => {
    const onSettled = await agree('retry_then_allow');

    await waitOutTheDeadline();
    expect(onSettled).not.toHaveBeenCalled();
    await waitOutTheDeadline();
    expect(onSettled).not.toHaveBeenCalled();
    await waitOutTheDeadline();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('blocks rather than settling when the exam requires enrolment', async () => {
    const onSettled = await agree('require_enrolment');

    await waitOutTheDeadline();
    await waitOutTheDeadline();
    await waitOutTheDeadline();

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText(/contact the person who invited you/i)).toBeInTheDocument();
  });

  it('stops the camera tracks when the step unmounts', async () => {
    const { unmount } = render(<FaceEnrolmentStep policy="retry_then_allow" candidateName="Ada" companyName="Acme" onSettled={jest.fn()} />);
    await flush();

    unmount();

    expect(stop).toHaveBeenCalled();
  });
});
