import { act, render, waitFor } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useWebcamMonitor } from './useWebcamMonitor';
import { createBrowserEmbedder } from '../face-embedder';

const SAMPLE_INTERVAL_MS = 500;
const IDENTITY_HINT_INTERVAL_MS = 4_000;

const mockDetectForVideo = jest.fn();
const mockClose = jest.fn();

jest.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: jest.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: jest.fn().mockResolvedValue({ detectForVideo: (...args: unknown[]) => mockDetectForVideo(...args), close: mockClose }),
  },
}));

// The browser advisory tier (face-embedder.ts) is exercised on its own in face-embedder.test.ts,
// including against the real onnxruntime-web module. Mocked here so these hook-level tests can
// control what embed() returns without needing a real model file (there isn't one -- see
// face-embedder.ts) or a real ONNX session.
const mockEmbed = jest.fn();
const mockEmbedderClose = jest.fn();
jest.mock('../face-embedder', () => ({
  createBrowserEmbedder: jest.fn(() => ({ embed: (...args: unknown[]) => mockEmbed(...args), close: mockEmbedderClose })),
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
        webcamRecordOnly: false,
        enforcement: 'block',
        strikeLimit: 3,
        disabledSignals: [],
        screenCaptureEnabled: false,
        lockdownRequired: false,
        faceVerificationEnabled: false,
        faceEnrolmentPolicy: 'retry_then_allow',
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

  describe('identity hint (browser advisory tier)', () => {
    function IdentityProbe({ onHint, referenceEmbedding = new Float32Array([1, 0, 0]) }: { onHint: (v: string | null) => void; referenceEmbedding?: Float32Array | null }) {
      useWebcamMonitor(true, undefined, undefined, undefined, { referenceEmbedding, onHint });
      return null;
    }

    beforeEach(() => {
      mockEmbed.mockReset();
      mockEmbedderClose.mockReset();
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL;
    });

    it('never constructs an embedder or touches identity when NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL is unset (today, in every environment)', async () => {
      const onHint = jest.fn();
      render(<IdentityProbe onHint={onHint} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      await act(async () => {
        await jest.advanceTimersByTimeAsync(IDENTITY_HINT_INTERVAL_MS * 2);
      });

      expect(createBrowserEmbedder).not.toHaveBeenCalled();
      expect(mockEmbed).not.toHaveBeenCalled();
      expect(onHint).not.toHaveBeenCalled();
    });

    it('embeds on its own ~4s interval (not the 500ms landmark tick) and reports a classified hint, never a violation or event', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(new Float32Array([1, 0, 0])); // identical to the reference -> cosine similarity 1

      const onHint = jest.fn();
      render(<IdentityProbe onHint={onHint} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      // Well inside one 4s window -- the 500ms landmark tick has fired several times by now,
      // but embed() must not have been reached through it.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3_500);
      });
      expect(mockEmbed).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(500); // crosses the 4s mark
      });

      expect(mockEmbed).toHaveBeenCalledTimes(1);
      expect(onHint).toHaveBeenCalledWith('match');
      // Advisory only: nothing about the identity hint reaches the enforcement/reporting paths.
      expect(mutate).not.toHaveBeenCalled();
      expect(reportEvent).not.toHaveBeenCalled();
    });

    it('reports a mismatch hint for a dissimilar embedding and an uncertain hint for a middling one', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(new Float32Array([0, 1, 0])); // orthogonal to the [1,0,0] reference -> similarity 0

      const onHint = jest.fn();
      render(<IdentityProbe onHint={onHint} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      await act(async () => {
        await jest.advanceTimersByTimeAsync(IDENTITY_HINT_INTERVAL_MS);
      });

      expect(onHint).toHaveBeenCalledWith('mismatch');
    });

    it('never calls onHint when embed() resolves null (model failed to load) -- same invisible-failure contract as face-embedder.ts', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(null);

      const onHint = jest.fn();
      render(<IdentityProbe onHint={onHint} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      await act(async () => {
        await jest.advanceTimersByTimeAsync(IDENTITY_HINT_INTERVAL_MS * 2);
      });

      expect(mockEmbed).toHaveBeenCalled();
      expect(onHint).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
    });

    it('never calls embed() while no reference embedding is available yet', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(new Float32Array([1, 0, 0]));

      const onHint = jest.fn();
      render(<IdentityProbe onHint={onHint} referenceEmbedding={null} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      await act(async () => {
        await jest.advanceTimersByTimeAsync(IDENTITY_HINT_INTERVAL_MS * 2);
      });

      expect(mockEmbed).not.toHaveBeenCalled();
      expect(onHint).not.toHaveBeenCalled();
    });

    it('closes the embedder (releasing the ONNX session) on unmount', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(new Float32Array([1, 0, 0]));

      const { unmount } = render(<IdentityProbe onHint={jest.fn()} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      expect(mockEmbedderClose).not.toHaveBeenCalled();
      unmount();
      expect(mockEmbedderClose).toHaveBeenCalledTimes(1);
    });

    it('stops embedding after unmount even if a stale interval tick was already scheduled', async () => {
      process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL = 'https://models.example/face-embedder.onnx';
      mockEmbed.mockResolvedValue(new Float32Array([1, 0, 0]));

      const onHint = jest.fn();
      const { unmount } = render(<IdentityProbe onHint={onHint} />);
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

      unmount();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(IDENTITY_HINT_INTERVAL_MS * 3);
      });

      expect(onHint).not.toHaveBeenCalled();
    });
  });
});
