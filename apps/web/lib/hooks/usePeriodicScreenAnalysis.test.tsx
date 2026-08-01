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

  it('fires an immediate first scan shortly after enabling, then keeps ticking periodically', () => {
    const capture = jest.fn().mockReturnValue('data:image/jpeg;base64,Zm9v');
    renderHook(() => usePeriodicScreenAnalysis(true, capture));

    // First scan comes at the short fixed delay, well before the first full interval.
    act(() => jest.advanceTimersByTime(5_000));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ screenshot: 'data:image/jpeg;base64,Zm9v' });

    // Max periodic delay is 60s base + 30s jitter; one full advance crosses exactly one tick.
    act(() => jest.advanceTimersByTime(90_000));
    expect(mutate).toHaveBeenCalledTimes(2);

    act(() => jest.advanceTimersByTime(90_000));
    expect(mutate).toHaveBeenCalledTimes(3);
  });

  it('skips the post when capture returns null (share not live) but keeps ticking', () => {
    const capture = jest.fn().mockReturnValue(null);
    renderHook(() => usePeriodicScreenAnalysis(true, capture));

    act(() => jest.advanceTimersByTime(5_000));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(90_000));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('does nothing while disabled and stops when disabled mid-flight', () => {
    const capture = jest.fn().mockReturnValue('data:image/jpeg;base64,Zm9v');
    const { rerender } = renderHook(({ enabled }) => usePeriodicScreenAnalysis(enabled, capture), {
      initialProps: { enabled: false },
    });

    act(() => jest.advanceTimersByTime(200_000));
    expect(mutate).not.toHaveBeenCalled();

    rerender({ enabled: true });
    act(() => jest.advanceTimersByTime(5_000));
    expect(mutate).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    act(() => jest.advanceTimersByTime(200_000));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
