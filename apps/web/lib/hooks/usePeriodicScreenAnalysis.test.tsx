import { renderHook, act } from '@testing-library/react';
import { usePeriodicScreenAnalysis } from './usePeriodicScreenAnalysis';

const mutate = jest.fn();
jest.mock('./useAttempt', () => ({
  useScreenAnalysis: () => ({ mutate }),
}));

describe('usePeriodicScreenAnalysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mutate.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('captures and posts on each tick while enabled', () => {
    const capture = jest.fn().mockReturnValue('data:image/jpeg;base64,Zm9v');
    renderHook(() => usePeriodicScreenAnalysis(true, capture));

    // Max delay is 60s base + 30s jitter; one full advance always crosses exactly one tick.
    act(() => jest.advanceTimersByTime(90_000));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ screenshot: 'data:image/jpeg;base64,Zm9v' });

    act(() => jest.advanceTimersByTime(90_000));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('skips the post when capture returns null (share not live) but keeps ticking', () => {
    const capture = jest.fn().mockReturnValue(null);
    renderHook(() => usePeriodicScreenAnalysis(true, capture));

    act(() => jest.advanceTimersByTime(90_000));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(90_000));
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('does nothing while disabled and stops when disabled mid-flight', () => {
    const capture = jest.fn().mockReturnValue('data:image/jpeg;base64,Zm9v');
    const { rerender } = renderHook(({ enabled }) => usePeriodicScreenAnalysis(enabled, capture), {
      initialProps: { enabled: false },
    });

    act(() => jest.advanceTimersByTime(200_000));
    expect(mutate).not.toHaveBeenCalled();

    rerender({ enabled: true });
    act(() => jest.advanceTimersByTime(90_000));
    expect(mutate).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    act(() => jest.advanceTimersByTime(200_000));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
