import { act, renderHook } from '@testing-library/react';
import { useScreenCapture } from './useScreenCapture';

// jsdom implements neither a 2D canvas context nor toDataURL (no 'canvas' native
// module installed) -- stub both so capture() can be exercised end to end.
const mockDrawImage = jest.fn();
const mockToDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,stub');

function makeTrack(settings: { displaySurface?: string } = {}) {
  const listeners = {} as Record<string, () => void>;
  return {
    stop: jest.fn(),
    getSettings: jest.fn().mockReturnValue(settings),
    addEventListener: jest.fn((event: string, handler: () => void) => {
      listeners[event] = handler;
    }),
    removeEventListener: jest.fn((event: string) => {
      delete listeners[event];
    }),
    listeners,
  };
}

function makeStream(track: ReturnType<typeof makeTrack>) {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track], // a real MediaStream's getTracks() includes its video track(s)
  };
}

describe('useScreenCapture', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({ drawImage: mockDrawImage });
    HTMLCanvasElement.prototype.toDataURL = mockToDataURL;
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 1080, configurable: true });
    mockDrawImage.mockClear();
    mockToDataURL.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('accepts a monitor share and reports active with no error', async () => {
    const track = makeTrack({ displaySurface: 'monitor' });
    const stream = makeStream(track);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toEqual({ displaySurface: 'monitor', userAgent: navigator.userAgent });
    expect(result.current.active).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('rejects a browser/window surface, stops the tracks, and sets wrong-surface', async () => {
    const track = makeTrack({ displaySurface: 'browser' });
    const stream = makeStream(track);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(result.current.error).toBe('wrong-surface');
  });

  it('accepts an absent displaySurface and returns the userAgent so the server can record the weaker guarantee', async () => {
    const track = makeTrack({}); // no displaySurface key at all
    const stream = makeStream(track);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toEqual({ displaySurface: undefined, userAgent: navigator.userAgent });
    expect(result.current.active).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets denied when the user rejects the share prompt', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('denied');
    expect(result.current.active).toBe(false);
  });

  it("sets unavailable (not denied) when getDisplayMedia rejects with anything other than NotAllowedError", async () => {
    // An enterprise policy or a Permissions-Policy: display-capture block never shows a
    // picker at all -- the rejection isn't the candidate dismissing a prompt, so it must not
    // get the "click again" copy that assumes one was shown.
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockRejectedValue(new DOMException('blocked', 'NotFoundError')) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('unavailable');
    expect(result.current.active).toBe(false);
  });

  it('sets unavailable when getDisplayMedia rejects with a plain (non-DOMException) error', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockRejectedValue(new Error('blocked by policy')) },
      configurable: true,
    });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('unavailable');
  });

  it('reports unsupported without throwing when getDisplayMedia is missing', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', { value: {}, configurable: true });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    let threw = false;
    await act(async () => {
      try {
        outcome = await result.current.requestShare();
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(false);
    expect(outcome).toBeNull();
    expect(result.current.error).toBe('unsupported');
  });

  it('capture() returns null when there is no active stream', () => {
    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    expect(result.current.capture()).toBeNull();
    expect(mockToDataURL).not.toHaveBeenCalled();
  });

  it('releases a previously active share before starting a new request, so a later wrong-surface leaves nothing orphaned', async () => {
    const firstTrack = makeTrack({ displaySurface: 'monitor' });
    const firstStream = makeStream(firstTrack);
    const secondTrack = makeTrack({ displaySurface: 'browser' });
    const secondStream = makeStream(secondTrack);
    const getDisplayMedia = jest.fn().mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream);
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    await act(async () => {
      await result.current.requestShare();
    });
    expect(result.current.active).toBe(true);

    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('wrong-surface');
    expect(result.current.active).toBe(false);
    // The first (now orphaned) share's tracks must be stopped too, not just the
    // rejected second one -- otherwise the browser's sharing indicator stays on.
    expect(firstTrack.stop).toHaveBeenCalled();
    expect(secondTrack.stop).toHaveBeenCalled();
  });

  async function runConcurrentRequestShareRace(settleOrder: 'A-first' | 'B-first') {
    const trackA = makeTrack({ displaySurface: 'monitor' });
    const streamA = makeStream(trackA);
    const trackB = makeTrack({ displaySurface: 'monitor' });
    const streamB = makeStream(trackB);

    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    const getDisplayMedia = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveB = resolve)));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));

    let outcomeA: unknown;
    let outcomeB: unknown;
    await act(async () => {
      // Both calls start before either awaits resolve -- this is the double-click:
      // call B's requestShare() runs its synchronous prefix (guards, stopStream(),
      // claiming a generation) while call A is still suspended awaiting its own
      // getDisplayMedia picker promise.
      const promiseA = result.current.requestShare().then((r) => (outcomeA = r));
      const promiseB = result.current.requestShare().then((r) => (outcomeB = r));
      if (settleOrder === 'A-first') {
        resolveA(streamA);
        resolveB(streamB);
      } else {
        resolveB(streamB);
        resolveA(streamA);
      }
      await Promise.all([promiseA, promiseB]);
    });

    // A was superseded by B before A's picker promise ever resolved -- its stream
    // must be released, not orphaned live with a dangling 'ended' listener.
    expect(trackA.stop).toHaveBeenCalled();
    expect(outcomeA).toBeNull();
    // B is the one that actually won and is now the active share.
    expect(trackB.stop).not.toHaveBeenCalled();
    expect(outcomeB).toEqual({ displaySurface: 'monitor', userAgent: navigator.userAgent });
    expect(result.current.active).toBe(true);
    // The loser's rejection/discard must not clobber the winner's clean state.
    expect(result.current.error).toBeNull();
  }

  it('discards the loser when two requestShare() calls race concurrently (double-clicked share button)', async () => {
    await runConcurrentRequestShareRace('A-first');
  });

  it('discards the loser the same way regardless of which picker promise settles first', async () => {
    await runConcurrentRequestShareRace('B-first');
  });

  it("a stale rejection from a call superseded by a concurrent winner does not clobber the winner's healthy state", async () => {
    const trackB = makeTrack({ displaySurface: 'monitor' });
    const streamB = makeStream(trackB);

    let rejectA!: (reason?: unknown) => void;
    let resolveB!: (value: unknown) => void;
    const getDisplayMedia = jest
      .fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectA = reject)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveB = resolve)));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));

    let outcomeA: unknown;
    let outcomeB: unknown;
    await act(async () => {
      const promiseA = result.current.requestShare().then((r) => (outcomeA = r));
      const promiseB = result.current.requestShare().then((r) => (outcomeB = r));
      resolveB(streamB);
      await promiseB; // B fully wins and settles active:true first
      rejectA(new DOMException('denied', 'NotAllowedError')); // A's stale picker rejects afterward
      await promiseA;
    });

    expect(outcomeA).toBeNull();
    expect(outcomeB).toEqual({ displaySurface: 'monitor', userAgent: navigator.userAgent });
    // The superseded call's rejection must not overwrite the winner's already-healthy state.
    expect(result.current.active).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not leak a stream that resolves after enabled flips to false mid-request', async () => {
    const track = makeTrack({ displaySurface: 'monitor' });
    const stream = makeStream(track);
    let resolveGetDisplayMedia!: (value: unknown) => void;
    const getDisplayMedia = jest.fn().mockReturnValue(new Promise((resolve) => (resolveGetDisplayMedia = resolve)));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });

    const { result, rerender } = renderHook(({ enabled }) => useScreenCapture(enabled, jest.fn()), {
      initialProps: { enabled: true },
    });

    let outcome: unknown;
    let sharePromise!: Promise<void>;
    act(() => {
      sharePromise = result.current.requestShare().then((r) => {
        outcome = r;
      });
    });

    rerender({ enabled: false }); // the exam/feature is disabled while the picker is still open

    await act(async () => {
      resolveGetDisplayMedia(stream);
      await sharePromise;
    });

    expect(track.stop).toHaveBeenCalled();
    expect(outcome).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('stops the stream if the component unmounts while getDisplayMedia is still pending', async () => {
    const track = makeTrack({ displaySurface: 'monitor' });
    const stream = makeStream(track);
    let resolveGetDisplayMedia!: (value: unknown) => void;
    const getDisplayMedia = jest.fn().mockReturnValue(new Promise((resolve) => (resolveGetDisplayMedia = resolve)));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });

    const { result, unmount } = renderHook(() => useScreenCapture(true, jest.fn()));

    let outcome: unknown;
    let sharePromise!: Promise<void>;
    act(() => {
      sharePromise = result.current.requestShare().then((r) => {
        outcome = r;
      });
    });

    unmount(); // cleanup runs while requestShare() is still suspended awaiting getDisplayMedia

    await act(async () => {
      resolveGetDisplayMedia(stream);
      await sharePromise;
    });

    expect(track.stop).toHaveBeenCalled(); // otherwise unreachable by every teardown path
    expect(outcome).toBeNull();
  });

  it('stops the stream and sets unavailable (not denied) when video.play() rejects', async () => {
    // The candidate already picked a screen -- play() itself failing (Safari/low-power mode)
    // is not a picker outcome, so 'denied' ("click again") would be actively wrong here.
    const track = makeTrack({ displaySurface: 'monitor' });
    const stream = makeStream(track);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
      configurable: true,
    });
    HTMLMediaElement.prototype.play = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));

    const { result } = renderHook(() => useScreenCapture(true, jest.fn()));
    let outcome;
    await act(async () => {
      outcome = await result.current.requestShare();
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('unavailable');
    expect(result.current.active).toBe(false);
    expect(track.stop).toHaveBeenCalled(); // otherwise unreachable by every teardown path
  });

  describe('with an active monitor share', () => {
    async function setupActiveShare(onEnded: () => void) {
      const track = makeTrack({ displaySurface: 'monitor' });
      const stream = makeStream(track);
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
        configurable: true,
      });

      const rendered = renderHook(() => useScreenCapture(true, onEnded));
      const { result } = rendered;
      await act(async () => {
        await result.current.requestShare();
      });
      return { result, track, unmount: rendered.unmount };
    }

    it('rate-limits to one capture per 5s', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      const { result } = await setupActiveShare(jest.fn());

      expect(result.current.capture()).toBe('data:image/jpeg;base64,stub');
      expect(mockToDataURL).toHaveBeenCalledTimes(1);

      expect(result.current.capture()).toBeNull(); // immediate second call, still within 5s
      expect(mockToDataURL).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(5000));
      expect(result.current.capture()).toBe('data:image/jpeg;base64,stub');
      expect(mockToDataURL).toHaveBeenCalledTimes(2);
    });

    it('self-limits to 150 captures', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      const { result } = await setupActiveShare(jest.fn());

      for (let i = 0; i < 150; i++) {
        expect(result.current.capture()).toBe('data:image/jpeg;base64,stub');
        act(() => jest.advanceTimersByTime(5000));
      }

      expect(mockToDataURL).toHaveBeenCalledTimes(150);
      expect(result.current.capture()).toBeNull(); // the 151st is refused client-side
      expect(mockToDataURL).toHaveBeenCalledTimes(150);
    });

    it('fires onEnded and clears active state when the track ends', async () => {
      const onEnded = jest.fn();
      const { result, track } = await setupActiveShare(onEnded);
      expect(result.current.active).toBe(true);

      act(() => {
        track.listeners['ended']();
      });

      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(result.current.active).toBe(false);
    });

    it('downscales the frame to at most 1280px wide and encodes at quality 0.5', async () => {
      // Fixture source is 1920x1080 (see beforeEach) -- server's 1mb body limit is
      // sized against exactly this contract, so the scale math and quality are
      // asserted directly rather than just checking capture() returns non-null.
      const { result } = await setupActiveShare(jest.fn());

      result.current.capture();

      expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 720);
      expect(mockToDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
    });

    it('stops all tracks on unmount', async () => {
      const { track, unmount } = await setupActiveShare(jest.fn());

      unmount();

      expect(track.stop).toHaveBeenCalled();
    });
  });
});
