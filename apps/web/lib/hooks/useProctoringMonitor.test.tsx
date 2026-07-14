import { render } from '@testing-library/react';
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
});
