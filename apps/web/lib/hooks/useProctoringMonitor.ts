import { useEffect, useRef } from 'react';
import { useReportProctoringEvent } from './useAttempt';
import { ProctoringEventType } from '../types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEVTOOLS_POLL_MS = 2000;
const DEVTOOLS_SIZE_THRESHOLD = 160;
const TAB_SWITCH_DEBOUNCE_MS = 5000;

export function useProctoringMonitor(enabled: boolean): void {
  const report = useReportProctoringEvent();
  const reportRef = useRef(report);
  reportRef.current = report;
  const debounceTimers = useRef<Partial<Record<ProctoringEventType, ReturnType<typeof setTimeout>>>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    function debouncedReport(eventType: ProctoringEventType, windowMs: number, metadata?: Record<string, unknown>) {
      if (debounceTimers.current[eventType]) return;
      reportRef.current(eventType, metadata);
      debounceTimers.current[eventType] = setTimeout(() => {
        delete debounceTimers.current[eventType];
      }, windowMs);
    }

    function resetIdleTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => reportRef.current('idle_timeout'), IDLE_TIMEOUT_MS);
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
      reportRef.current('copy_paste', { action: 'copy' });
    }
    function onPaste() {
      reportRef.current('copy_paste', { action: 'paste' });
    }
    function onContextMenu() {
      reportRef.current('right_click');
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        reportRef.current('dev_tools_detected', { trigger: 'shortcut' });
      }
      resetIdleTimer();
    }
    function onMouseMove() {
      resetIdleTimer();
    }

    const MULTI_MONITOR_POLL_MS = 15_000;
    let blurStartedAt: number | null = null;

    function onWindowBlur() {
      // Focus lost to another app while the exam stays visible -- a real tab
      // switch hides the document and is already covered by tab_switch.
      if (document.visibilityState === 'visible') {
        blurStartedAt = Date.now();
      }
    }
    function onWindowFocus() {
      if (blurStartedAt !== null) {
        const durationMs = Date.now() - blurStartedAt;
        blurStartedAt = null;
        debouncedReport('window_blur', TAB_SWITCH_DEBOUNCE_MS, { durationMs });
      }
      resetIdleTimer();
    }

    // screen.isExtended is Chromium-only; undefined (Firefox/Safari) never transitions to true.
    let lastIsExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
    const multiMonitorInterval = setInterval(() => {
      const isExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
      if (isExtended && !lastIsExtended) {
        reportRef.current('multi_monitor_detected');
      }
      lastIsExtended = isExtended;
    }, MULTI_MONITOR_POLL_MS);

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    resetIdleTimer();

    const devtoolsInterval = setInterval(() => {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > DEVTOOLS_SIZE_THRESHOLD || heightDelta > DEVTOOLS_SIZE_THRESHOLD) {
        reportRef.current('dev_tools_detected', { trigger: 'window-size' });
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
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(devtoolsInterval);
      clearInterval(multiMonitorInterval);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
      debounceTimers.current = {};
    };
  }, [enabled]);
}
