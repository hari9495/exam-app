import { useEffect, useRef } from 'react';
import { useScreenAnalysis } from './useAttempt';

// Client-side target interval for periodic remote-access screen analysis. Jittered so a
// cohort that all started at once doesn't hit the AI endpoint in lockstep; the server keeps
// its own 60s floor per attempt (SCREEN_ANALYSIS_MIN_INTERVAL_MS), so this pacing is
// politeness, not enforcement.
const BASE_DELAY_MS = 60_000;
const JITTER_MS = 30_000;
// First scan fires almost immediately after the attempt starts -- a candidate who left a
// messaging app or remote-access tool open gets flagged in the opening seconds instead of
// after the first full interval. Small delay so the exam page has painted over the share.
const FIRST_SCAN_DELAY_MS = 5_000;

// While the candidate is in an active, screen-captured attempt, periodically captures the
// shared monitor and posts it for AI remote-access analysis. Fire-and-forget: a failed post
// is simply superseded by the next tick.
export function usePeriodicScreenAnalysis(enabled: boolean, capture: () => string | null): void {
  const screenAnalysis = useScreenAnalysis();
  // The mutate fn and capture are kept in refs so the effect (and its timer chain) only
  // tears down when `enabled` actually flips, not on every render's new closure identity.
  const mutateRef = useRef(screenAnalysis.mutate);
  mutateRef.current = screenAnalysis.mutate;
  const captureRef = useRef(capture);
  captureRef.current = capture;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (cancelled) return;
      const screenshot = captureRef.current();
      if (screenshot) {
        mutateRef.current({ screenshot });
      }
      timer = setTimeout(tick, BASE_DELAY_MS + Math.random() * JITTER_MS);
    };
    timer = setTimeout(tick, FIRST_SCAN_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);
}
