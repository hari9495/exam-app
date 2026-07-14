import { useEffect, useRef } from 'react';
import { useReportProctoringEvent } from './useAttempt';
import { ProctoringEventType } from '../types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEVTOOLS_POLL_MS = 2000;
const DEVTOOLS_SIZE_THRESHOLD = 160;
const TAB_SWITCH_DEBOUNCE_MS = 5000;

export function useProctoringMonitor(enabled: boolean): void {
  const report = useReportProctoringEvent();
  const debounceTimers = useRef<Partial<Record<ProctoringEventType, ReturnType<typeof setTimeout>>>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    function debouncedReport(eventType: ProctoringEventType, windowMs: number, metadata?: Record<string, unknown>) {
      if (debounceTimers.current[eventType]) return;
      report(eventType, metadata);
      debounceTimers.current[eventType] = setTimeout(() => {
        delete debounceTimers.current[eventType];
      }, windowMs);
    }

    function resetIdleTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => report('idle_timeout'), IDLE_TIMEOUT_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        debouncedReport('tab_switch', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        debouncedReport('fullscreen_exit', TAB_SWITCH_DEBOUNCE_MS);
      }
    }
    function onCopy() {
      report('copy_paste', { action: 'copy' });
    }
    function onPaste() {
      report('copy_paste', { action: 'paste' });
    }
    function onContextMenu() {
      report('right_click');
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        report('dev_tools_detected', { trigger: 'shortcut' });
      }
      resetIdleTimer();
    }
    function onMouseMove() {
      resetIdleTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    resetIdleTimer();

    const devtoolsInterval = setInterval(() => {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > DEVTOOLS_SIZE_THRESHOLD || heightDelta > DEVTOOLS_SIZE_THRESHOLD) {
        report('dev_tools_detected', { trigger: 'window-size' });
      }
    }, DEVTOOLS_POLL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      clearInterval(devtoolsInterval);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [enabled, report]);
}
