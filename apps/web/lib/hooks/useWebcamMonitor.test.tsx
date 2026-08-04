import { act, render, waitFor } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useWebcamMonitor } from './useWebcamMonitor';

const SAMPLE_INTERVAL_MS = 500;

const mockDetectForVideo = jest.fn();
const mockClose = jest.fn();

jest.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: jest.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: jest.fn().mockResolvedValue({ detectForVideo: (...args: unknown[]) => mockDetectForVideo(...args), close: mockClose }),
  },
}));

// A single, forward-facing head -- no violation, no looking-down. Used as the default
// steady-state detection so tests that don't care about detection content (disabled,
// periodic snapshot) don't accidentally accumulate votes toward a confirmed violation.
const CLEAN_RESULT = {
  faceLandmarks: [[{ x: 0, y: 0, z: 0 }]],
  facialTransformationMatrixes: [{ data: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]) }],
};

// Pitch tipped past the 45-degree looking-down threshold, yaw kept at 0 so this is never
// also read as head_turned.
const LOOKING_DOWN_RESULT = {
  faceLandmarks: [[{ x: 0, y: 0, z: 0 }]],
  facialTransformationMatrixes: [{ data: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, -0.9, 1]) }],
};

function Probe({
  enabled,
  onViolationReason,
  capture,
}: {
  enabled: boolean;
  onViolationReason?: (reason: string) => void;
  capture?: () => string | null;
}) {
  useWebcamMonitor(enabled, onViolationReason, undefined, capture);
  return null;
}

describe('useWebcamMonitor', () => {
  let mutate: jest.Mock;
  let reportEvent: jest.Mock;
  let reportSnapshot: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    reportEvent = jest.fn();
    reportSnapshot = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportWebcamViolation').mockReturnValue({ mutate } as any);
    jest.spyOn(useAttemptModule, 'useReportProctoringEvent').mockReturnValue(reportEvent);
    jest.spyOn(useAttemptModule, 'useReportWebcamSnapshot').mockReturnValue(reportSnapshot);
    mockDetectForVideo.mockReturnValue(CLEAN_RESULT);
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

  it('reports a webcam violation only after the voting window confirms (5 of 8), not on a single frame', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] }); // no_face every tick from here
    jest.advanceTimersByTime(4 * SAMPLE_INTERVAL_MS); // 4 of 8 -> not confirmed yet
    expect(mutate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SAMPLE_INTERVAL_MS); // 5th of 8 -> confirmed
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no_face' }));
  });

  it('reports looking_down as a proctoring event, never as a webcam violation', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue(LOOKING_DOWN_RESULT);
    jest.advanceTimersByTime(19 * SAMPLE_INTERVAL_MS); // 19 of 24 -> not confirmed yet
    expect(reportEvent).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SAMPLE_INTERVAL_MS); // 20th of 24 -> confirmed
    expect(reportEvent).toHaveBeenCalledWith('looking_down');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('captures a periodic snapshot within the jittered interval and reschedules', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    jest.advanceTimersByTime(180_000); // past the max 180s jitter bound -> at least one capture
    expect(reportSnapshot).toHaveBeenCalled();

    const callsAfterFirst = reportSnapshot.mock.calls.length;
    jest.advanceTimersByTime(180_000); // rescheduled -> at least one more capture
    expect(reportSnapshot.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('invokes onViolationReason with the confirmed reason when a strike is reported', async () => {
    const onViolationReason = jest.fn();
    render(<Probe enabled={true} onViolationReason={onViolationReason} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }], [{ x: 1, y: 1, z: 1 }]] }); // multiple_faces
    jest.advanceTimersByTime(5 * SAMPLE_INTERVAL_MS); // 5 of 8 -> confirmed

    expect(onViolationReason).toHaveBeenCalledWith('multiple_faces');
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'multiple_faces' }));
  });

  it('does not fire onViolationReason for looking_down', async () => {
    const onViolationReason = jest.fn();
    render(<Probe enabled={true} onViolationReason={onViolationReason} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue(LOOKING_DOWN_RESULT);
    jest.advanceTimersByTime(20 * SAMPLE_INTERVAL_MS); // confirms looking_down

    expect(reportEvent).toHaveBeenCalledWith('looking_down');
    expect(onViolationReason).not.toHaveBeenCalled();
  });

  it('reports a no_face violation via the fail-safe when camera/model setup fails', async () => {
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValue(new Error('camera denied'));
    render(<Probe enabled={true} />);

    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ reason: 'no_face', snapshot: '' }));
  });

  it('attaches a screen capture to a confirmed webcam violation when capture is supplied', async () => {
    const capture = jest.fn(() => 'data:image/jpeg;base64,screen');
    render(<Probe enabled={true} capture={capture} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] }); // no_face every tick from here
    jest.advanceTimersByTime(5 * SAMPLE_INTERVAL_MS); // 5 of 8 -> confirmed

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no_face', screenshot: 'data:image/jpeg;base64,screen' }));
  });

  it('attaches a screen capture to the fail-safe no_face report when camera/model setup fails', async () => {
    const capture = jest.fn(() => 'data:image/jpeg;base64,screen');
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValue(new Error('camera denied'));
    render(<Probe enabled={true} capture={capture} />);

    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ reason: 'no_face', snapshot: '', screenshot: 'data:image/jpeg;base64,screen' }));
  });

  it('does not re-subscribe (restart the camera) when the capture function identity changes across renders', async () => {
    const captureA = jest.fn(() => 'a');
    const { rerender } = render(<Probe enabled={true} capture={captureA} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1));

    const captureB = jest.fn(() => 'b');
    rerender(<Probe enabled={true} capture={captureB} />);

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] }); // no_face every tick from here
    jest.advanceTimersByTime(5 * SAMPLE_INTERVAL_MS); // 5 of 8 -> confirmed

    // Still only one getUserMedia call (no teardown/restart), and the *new* capture function
    // (mirrored through the ref, not a stale closure) is what gets used.
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ screenshot: 'b' }));
  });

  it('stops the stream and never starts polling if unmounted while getUserMedia is still pending', async () => {
    let resolveGetUserMedia!: (stream: unknown) => void;
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveGetUserMedia = resolve;
      }),
    );
    const stop = jest.fn();

    const { unmount } = render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    unmount(); // cleanup runs while setup() is still suspended awaiting getUserMedia
    const detectCallsBeforeResolve = mockDetectForVideo.mock.calls.length;

    resolveGetUserMedia({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());

    jest.advanceTimersByTime(SAMPLE_INTERVAL_MS * 10);
    expect(mockDetectForVideo.mock.calls.length).toBe(detectCallsBeforeResolve); // no interval ever started
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

  it('never touches the camera when the exam has webcam proctoring turned off', async () => {
    function ConfigProbe() {
      useWebcamMonitor(true, undefined, {
        enableAntiCheating: true,
        webcamEnabled: false,
        enforcement: 'block',
        strikeLimit: 3,
        disabledSignals: [],
        screenCaptureEnabled: false,
        lockdownRequired: false,
      });
      return null;
    }

    render(<ConfigProbe />);
    await act(async () => {
      await Promise.resolve();
    });

    // Must short-circuit before setup(): the hook's fail-safe reports a real
    // no_face violation on camera failure, so relying on getUserMedia failing
    // would generate violations for an exam that opted out of webcam entirely.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});
