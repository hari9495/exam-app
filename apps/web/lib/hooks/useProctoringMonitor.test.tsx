import { act, render } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useProctoringMonitor } from './useProctoringMonitor';

function Probe({ enabled }: { enabled: boolean }) {
  useProctoringMonitor(enabled);
  return null;
}

describe('useProctoringMonitor', () => {
  let report: jest.Mock;

  beforeEach(() => {
    report = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportProctoringEvent').mockReturnValue(report);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does nothing when disabled', () => {
    render(<Probe enabled={false} />);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(report).not.toHaveBeenCalled();
  });

  it('reports tab_switch when the document becomes hidden, debounced', () => {
    render(<Probe enabled={true} />);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('tab_switch', undefined);
  });

  it('reports right_click on contextmenu', () => {
    render(<Probe enabled={true} />);
    document.dispatchEvent(new Event('contextmenu'));
    expect(report).toHaveBeenCalledWith('right_click');
  });

  it('reports dev_tools_detected on F12', () => {
    render(<Probe enabled={true} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12' }));
    expect(report).toHaveBeenCalledWith('dev_tools_detected', { trigger: 'shortcut' });
  });

  it('does not reset the idle timer merely because the host component re-renders', () => {
    const { rerender } = render(<Probe enabled={true} />);

    act(() => {
      jest.advanceTimersByTime(4 * 60 * 1000 + 50 * 1000); // 4:50 of 5:00
    });
    expect(report).not.toHaveBeenCalledWith('idle_timeout');

    // Re-render caused by unrelated host state (e.g. a ticking countdown), not real user input.
    rerender(<Probe enabled={true} />);

    act(() => {
      jest.advanceTimersByTime(10 * 1000); // remaining 10s to reach the 5:00 threshold
    });

    expect(report).toHaveBeenCalledWith('idle_timeout');
  });

  it('does not drop a debounced event that recurs across a disable/re-enable cycle', () => {
    const { rerender } = render(<Probe enabled={true} />);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    document.dispatchEvent(new Event('visibilitychange'));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('tab_switch', undefined);

    // Disable (runs cleanup) then re-enable within the 5s debounce window.
    rerender(<Probe enabled={false} />);
    rerender(<Probe enabled={true} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(2, 'tab_switch', undefined);
  });
});
