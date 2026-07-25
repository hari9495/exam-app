'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTIFY_REARM_MINUTES } from '../attention-alert';

type NotificationPermissionState = NotificationPermission | 'unsupported';

// This module is evaluated during SSR in Next.js, where `Notification` and `document`
// don't exist -- every access must be guarded, and unsupported must be reported rather
// than thrown.
function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

interface NotifyEntry {
  notifiedAt: number;
  // False once the attemptId has dropped out of `flagged` since it was last notified --
  // this is what starts the re-arm clock, not the moment the ten minutes happen to elapse.
  active: boolean;
}

// Above this many newly-flagged attempts in one evaluation, send one summary instead of
// one popup each -- the fleet-wide misfire this feature exists for would otherwise bury
// the recruiter's desktop under a popup per candidate.
const SUMMARY_THRESHOLD = 3;

export function useAttentionNotifications(
  flagged: Set<string>,
  rosterByAttemptId: Map<string, string>,
  examTitle: string,
  examId: string,
): { permission: NotificationPermissionState; requestPermission: () => void } {
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );
  const notified = useRef<Map<string, NotifyEntry>>(new Map());

  // Only ever invoked from the "Enable alerts" button's onClick -- never call this on
  // mount, browsers penalise permission prompts that aren't tied to a user gesture.
  const requestPermission = useCallback(() => {
    if (!notificationsSupported()) return;
    void Notification.requestPermission().then(setPermission);
  }, []);

  // Navigating in-app to another exam keeps this hook mounted, so without this the
  // previous exam's attempts would sit in the map forever (and suppress nothing useful,
  // since attempt ids don't repeat).
  useEffect(() => {
    notified.current.clear();
  }, [examId]);

  useEffect(() => {
    const entries = notified.current;

    // Bookkeeping: mark attempts that dropped out of `flagged` as no longer active.
    // This must run on every evaluation regardless of tab visibility -- otherwise a
    // flagged-to-dropped transition that happens while the tab is visible never gets
    // recorded, and a later real flare-up (while hidden) is mistaken for a sustained
    // burst that never re-arms.
    for (const [attemptId, entry] of entries) {
      if (entry.active && !flagged.has(attemptId)) entry.active = false;
    }

    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    if (document.visibilityState !== 'hidden') return;

    const now = Date.now();

    const due: string[] = [];
    for (const attemptId of flagged) {
      const entry = entries.get(attemptId);
      const eligible = !entry || (!entry.active && now - entry.notifiedAt >= NOTIFY_REARM_MINUTES * 60_000);
      if (eligible) due.push(attemptId);
    }
    if (due.length === 0) return;

    if (due.length > SUMMARY_THRESHOLD) {
      new Notification(examTitle, { body: `${due.length} candidates need attention`, tag: `attention:${examId}` });
    } else {
      for (const attemptId of due) {
        const name = rosterByAttemptId.get(attemptId) ?? 'A candidate';
        // A per-attempt tag lets the OS collapse repeat popups for the same candidate
        // instead of stacking them.
        new Notification(examTitle, {
          body: `${name} is generating a lot of proctoring alerts`,
          tag: `attention:${examId}:${attemptId}`,
        });
      }
    }
    for (const attemptId of due) {
      entries.set(attemptId, { notifiedAt: now, active: true });
    }
  }, [flagged, rosterByAttemptId, examTitle, examId]);

  return { permission, requestPermission };
}
