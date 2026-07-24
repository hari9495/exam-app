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

  it('does not report dev_tools_detected for a persistent outer/inner size gap present from the start (DPI scaling, extension toolbars, etc.)', () => {
    // A real, unchanging 200px gap -- bigger than the 160px threshold -- exists the
    // whole time (e.g. high OS display scaling, or a browser extension's toolbar).
    // Because this never increases after monitoring starts, it must never be flagged.
    Object.defineProperty(window, 'outerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    render(<Probe enabled={true} />);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(report).not.toHaveBeenCalledWith('dev_tools_detected', expect.anything());
  });

  it('reports dev_tools_detected when the outer/inner size gap grows after monitoring starts', () => {
    // Starts with no gap (baseline), then DevTools gets docked mid-session, growing
    // the gap well past the threshold -- this is the case that must still be caught.
    Object.defineProperty(window, 'outerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    render(<Probe enabled={true} />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(report).not.toHaveBeenCalledWith('dev_tools_detected', expect.anything());

    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(report).toHaveBeenCalledWith('dev_tools_detected', { trigger: 'window-size' });
  });

  it('does not reset the idle timer merely because the host component re-renders', () => {
    // The real (non-memoized) useReportProctoringEvent returns a brand-new function
    // identity on every render. mockReturnValue would hand back the same reference
    // every time, which fails to reproduce that — so mock a fresh closure per call.
    const idleReportCalls: [string, unknown?][] = [];
    jest.spyOn(useAttemptModule, 'useReportProctoringEvent').mockImplementation(() => {
      return (eventType: string, metadata?: unknown) => idleReportCalls.push([eventType, metadata]);
    });

    const { rerender } = render(<Probe enabled={true} />);

    act(() => {
      jest.advanceTimersByTime(4 * 60 * 1000 + 50 * 1000); // 4:50 of 5:00
    });
    expect(idleReportCalls).not.toContainEqual(['idle_timeout', undefined]);

    // Re-render caused by unrelated host state (e.g. a ticking countdown), not real user input.
    rerender(<Probe enabled={true} />);

    act(() => {
      jest.advanceTimersByTime(10 * 1000); // remaining 10s to reach the 5:00 threshold
    });

    expect(idleReportCalls).toContainEqual(['idle_timeout', undefined]);
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

  describe('window_blur', () => {
    it('reports on focus return with durationMs when blur happened while visible', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

      window.dispatchEvent(new Event('blur'));
      expect(report).not.toHaveBeenCalled(); // reported on focus-return, not at blur

      act(() => {
        jest.advanceTimersByTime(7000);
      });
      window.dispatchEvent(new Event('focus'));

      expect(report).toHaveBeenCalledWith('window_blur', { durationMs: 7000 });
    });

    it('suppresses blur that accompanies a tab-hide (visibilityState hidden)', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      window.dispatchEvent(new Event('blur'));
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      window.dispatchEvent(new Event('focus'));

      expect(report).not.toHaveBeenCalledWith('window_blur', expect.anything());
    });

    it('debounces rapid blur/focus cycles to one report per 5s window', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

      window.dispatchEvent(new Event('blur'));
      act(() => jest.advanceTimersByTime(1000));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('blur'));
      act(() => jest.advanceTimersByTime(1000));
      window.dispatchEvent(new Event('focus'));

      const blurReports = report.mock.calls.filter(([type]: [string]) => type === 'window_blur');
      expect(blurReports).toHaveLength(1);
    });

    it('does not double-report when visibility goes hidden between blur and focus', () => {
      render(<Probe enabled={true} />);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      window.dispatchEvent(new Event('blur'));

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange')); // reports tab_switch

      act(() => jest.advanceTimersByTime(3000));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      window.dispatchEvent(new Event('focus'));

      expect(report).toHaveBeenCalledWith('tab_switch', undefined);
      expect(report).not.toHaveBeenCalledWith('window_blur', expect.anything());
    });
  });

  describe('multi_monitor_detected', () => {
    function setIsExtended(value: boolean | undefined) {
      Object.defineProperty(window.screen, 'isExtended', { value, configurable: true });
    }

    it('fires once when isExtended transitions false -> true, silent on repeated true ticks', () => {
      setIsExtended(false);
      render(<Probe enabled={true} />);

      act(() => jest.advanceTimersByTime(15_000)); // tick: still false
      expect(report).not.toHaveBeenCalledWith('multi_monitor_detected', undefined);

      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000)); // tick: false -> true edge
      act(() => jest.advanceTimersByTime(15_000)); // tick: true -> true, silent

      const monitorReports = report.mock.calls.filter(([type]: [string]) => type === 'multi_monitor_detected');
      expect(monitorReports).toHaveLength(1);
    });

    it('fires again after removal then re-add', () => {
      setIsExtended(false);
      render(<Probe enabled={true} />);

      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000));
      setIsExtended(false);
      act(() => jest.advanceTimersByTime(15_000));
      setIsExtended(true);
      act(() => jest.advanceTimersByTime(15_000));

      const monitorReports = report.mock.calls.filter(([type]: [string]) => type === 'multi_monitor_detected');
      expect(monitorReports).toHaveLength(2);
    });

    it('never fires when isExtended is undefined (unsupported browser)', () => {
      setIsExtended(undefined);
      render(<Probe enabled={true} />);
      act(() => jest.advanceTimersByTime(60_000));
      expect(report).not.toHaveBeenCalledWith('multi_monitor_detected', expect.anything());
    });
  });

  describe('onViolation callback', () => {
    function ProbeWithCallback({ enabled, onViolation }: { enabled: boolean; onViolation: (eventType: string) => void }) {
      useProctoringMonitor(enabled, onViolation);
      return null;
    }

    it('calls onViolation with the event type when a signal is reported', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={true} onViolation={onViolation} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(onViolation).toHaveBeenCalledWith('right_click');
    });

    it('calls onViolation for a debounced report (tab_switch), not just direct ones', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={true} onViolation={onViolation} />);
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      document.dispatchEvent(new Event('visibilitychange'));

      expect(onViolation).toHaveBeenCalledWith('tab_switch');
    });

    it('does not call onViolation when disabled', () => {
      const onViolation = jest.fn();
      render(<ProbeWithCallback enabled={false} onViolation={onViolation} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(onViolation).not.toHaveBeenCalled();
    });

    it('works with no callback provided (backward compatible)', () => {
      render(<Probe enabled={true} />);
      expect(() => document.dispatchEvent(new Event('contextmenu'))).not.toThrow();
    });
  });
});
