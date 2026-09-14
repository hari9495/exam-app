import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the initial value immediately, then the latest value after the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: 'a' } });
    expect(result.current).toBe('a');

    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    expect(result.current).toBe('a'); // not yet elapsed

    act(() => { jest.advanceTimersByTime(250); });
    expect(result.current).toBe('abc'); // only the final value lands
  });
});
