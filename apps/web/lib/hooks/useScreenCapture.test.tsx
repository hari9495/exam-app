import { act, renderHook } from '@testing-library/react';
import { useScreenCapture } from './useScreenCapture';

// jsdom implements neither a 2D canvas context nor toDataURL (no 'canvas' native
// module installed) -- stub both so capture() can be exercised end to end.
const mockDrawImage = jest.fn();
const mockToDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,stub');

function makeTrack(settings: { displaySurface?: string } = {}) {
  return {
    stop: jest.fn(),
    getSettings: jest.fn().mockReturnValue(settings),
    addEventListener: jest.fn(),
    listeners: {} as Record<string, () => void>,
  };
}

function makeStream(track: ReturnType<typeof makeTrack>) {
  track.addEventListener.mockImplementation((event: string, handler: () => void) => {
    track.listeners[event] = handler;
  });
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

  describe('with an active monitor share', () => {
    async function setupActiveShare(onEnded: () => void) {
      const track = makeTrack({ displaySurface: 'monitor' });
      const stream = makeStream(track);
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getDisplayMedia: jest.fn().mockResolvedValue(stream) },
        configurable: true,
      });

      const { result } = renderHook(() => useScreenCapture(true, onEnded));
      await act(async () => {
        await result.current.requestShare();
      });
      return { result, track };
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
  });
});
