import { render, waitFor } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useWebcamMonitor } from './useWebcamMonitor';

const mockDetectForVideo = jest.fn();
const mockClose = jest.fn();

jest.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: jest.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: jest.fn().mockResolvedValue({ detectForVideo: (...args: unknown[]) => mockDetectForVideo(...args), close: mockClose }),
  },
}));

function Probe({ enabled }: { enabled: boolean }) {
  useWebcamMonitor(enabled);
  return null;
}

describe('useWebcamMonitor', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportWebcamViolation').mockReturnValue({ mutate } as any);
    mockDetectForVideo.mockReturnValue({ faceLandmarks: [], facialTransformationMatrixes: [] });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) },
      configurable: true,
    });
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 2, configurable: true });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does nothing when disabled', async () => {
    render(<Probe enabled={false} />);
    await Promise.resolve();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('reports a violation only after the condition is sustained for 3 seconds', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] }); // no_face, sustained from here on
    jest.advanceTimersByTime(2_500); // under the 3s threshold
    expect(mutate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000); // now past 3s
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no_face' }));
  });

  it('resets the sustained timer once the face reappears', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] });
    jest.advanceTimersByTime(2_000);
    mockDetectForVideo.mockReturnValue({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]) }] });
    jest.advanceTimersByTime(2_000);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('ignores the __DISABLE_WEBCAM_MONITOR__ escape hatch in production builds', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    // NODE_ENV's type is readonly (Next.js's global.d.ts); a real assignment is what next dev/
    // build actually does under the hood, and Object.defineProperty on process.env is a no-op
    // in this Jest/Node environment (its descriptor is protected), so cast past the type instead.
    (process.env as { NODE_ENV: string }).NODE_ENV = 'production';
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;

    try {
      render(<Probe enabled={true} />);
      // A candidate flipping this flag from devtools must not be able to disable
      // proctoring in production -- monitoring should still start.
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    } finally {
      (process.env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv as string;
      delete (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__;
    }
  });
});
