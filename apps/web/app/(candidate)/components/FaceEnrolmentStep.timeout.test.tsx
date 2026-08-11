import { act, render, screen, fireEvent } from '@testing-library/react';
import { FaceEnrolmentStep, ATTEMPT_TIMEOUT_MS } from './FaceEnrolmentStep';
import { useFaceEnrolment } from '../../../lib/hooks/useAttempt';

// Separate file from FaceEnrolmentStep.test.tsx on purpose: those specs render only the consent and
// blocked phases and must keep working with no camera and no MediaPipe. Only the capture phase --
// exercised here -- needs either.
jest.mock('../../../lib/hooks/useAttempt', () => ({ useFaceEnrolment: jest.fn() }));

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

const mutateAsync = jest.fn().mockResolvedValue({ status: 'not_verified' });
const stop = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  mutateAsync.mockClear();
  stop.mockClear();
  (useFaceEnrolment as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
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

async function agree(policy: 'retry_then_allow' | 'require_enrolment', onSettled = jest.fn()) {
  render(<FaceEnrolmentStep policy={policy} onSettled={onSettled} />);
  fireEvent.click(screen.getByRole('button', { name: /I agree/i }));
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
    expect(screen.getByText(/Attempt 1 of 3/)).toBeInTheDocument();

    await waitOutTheDeadline();

    expect(screen.getByText(/could not get a clear photo in time/i)).toBeInTheDocument();
    expect(screen.getByText(/Attempt 2 of 3/)).toBeInTheDocument();
  });

  it('still retries and settles after three timed-out attempts', async () => {
    const onSettled = await agree('retry_then_allow');

    await waitOutTheDeadline();
    await waitOutTheDeadline();
    await waitOutTheDeadline();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'not_verified', consentGiven: true }),
    );
    expect(onSettled).toHaveBeenCalledWith('not_verified');
  });

  it('blocks rather than settling when the exam requires enrolment', async () => {
    const onSettled = await agree('require_enrolment');

    await waitOutTheDeadline();
    await waitOutTheDeadline();
    await waitOutTheDeadline();

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText(/contact your recruiter/i)).toBeInTheDocument();
  });

  it('stops the camera tracks when the step unmounts', async () => {
    const { unmount } = render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /I agree/i }));
    await flush();

    unmount();

    expect(stop).toHaveBeenCalled();
  });
});
