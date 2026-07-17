import { render, screen, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

function CountdownProbe({
  remainingSeconds,
  onExpire,
  isTicking,
}: {
  remainingSeconds: number | undefined;
  onExpire: () => void;
  isTicking?: boolean;
}) {
  const seconds = useCountdown(remainingSeconds, onExpire, isTicking);
  return <p>seconds:{seconds}</p>;
}

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ticks down once per second from the seeded value', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={3} onExpire={onExpire} />);
    expect(screen.getByText('seconds:3')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:2')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:1')).toBeInTheDocument();
  });

  it('calls onExpire exactly once when it reaches zero and stays at zero', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={1} onExpire={onExpire} />);

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:0')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('seconds:0')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('calls onExpire when seeded at exactly zero (e.g. a stale poll response)', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={0} onExpire={onExpire} />);
    expect(screen.getByText('seconds:0')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:0')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('re-seeds from a fresh remainingSeconds value (e.g. after a poll)', () => {
    const onExpire = jest.fn();
    const { rerender } = render(<CountdownProbe remainingSeconds={2} onExpire={onExpire} />);
    act(() => jest.advanceTimersByTime(2000));
    expect(onExpire).toHaveBeenCalledTimes(1);

    rerender(<CountdownProbe remainingSeconds={10} onExpire={onExpire} />);
    expect(screen.getByText('seconds:10')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('seconds:9')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not decrement or fire onExpire while frozen (isTicking=false), even at 1 second left', () => {
    const onExpire = jest.fn();
    render(<CountdownProbe remainingSeconds={1} onExpire={onExpire} isTicking={false} />);
    expect(screen.getByText('seconds:1')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText('seconds:1')).toBeInTheDocument();
    expect(onExpire).not.toHaveBeenCalled();
  });
});
