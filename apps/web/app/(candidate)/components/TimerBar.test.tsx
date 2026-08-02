import { render, screen } from '@testing-library/react';
import { TimerBar, timerTier, formatTime } from './TimerBar';

describe('timerTier', () => {
  it('returns ok above 50% remaining', () => {
    expect(timerTier(600, 1000)).toBe('ok');
  });

  it('returns warn between 15% and 50% remaining, inclusive of the 50% boundary', () => {
    expect(timerTier(500, 1000)).toBe('warn');
    expect(timerTier(300, 1000)).toBe('warn');
  });

  it('returns danger at or below 15% remaining', () => {
    expect(timerTier(150, 1000)).toBe('danger');
    expect(timerTier(0, 1000)).toBe('danger');
  });

  it('returns ok when totalSeconds is zero, avoiding a divide-by-zero', () => {
    expect(timerTier(0, 0)).toBe('ok');
  });
});

describe('formatTime', () => {
  it('formats seconds as m:ss with zero-padded seconds', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('TimerBar', () => {
  it('renders the remaining time', () => {
    render(<TimerBar remainingSeconds={300} totalSeconds={1000} />);
    expect(screen.getByText('5:00 remaining')).toBeInTheDocument();
  });

  it('renders a bar whose width reflects the remaining fraction', () => {
    render(<TimerBar remainingSeconds={250} totalSeconds={1000} />);
    const bar = screen.getByTestId('timer-bar-fill');
    expect(bar).toHaveStyle({ width: '25%' });
  });

  it('renders no progress chip when progressLabel is omitted', () => {
    render(<TimerBar remainingSeconds={300} totalSeconds={1000} />);
    expect(screen.queryByText(/answered/)).not.toBeInTheDocument();
  });

  it('renders the progress chip beside the timer when progressLabel is given', () => {
    render(<TimerBar remainingSeconds={300} totalSeconds={1000} progressLabel="12/20 answered" />);
    expect(screen.getByText('12/20 answered')).toBeInTheDocument();
    expect(screen.getByText('5:00 remaining')).toBeInTheDocument();
  });
});
