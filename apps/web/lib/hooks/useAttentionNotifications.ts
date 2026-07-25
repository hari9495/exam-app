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

export function useAttentionNotifications(
  flagged: Set<string>,
  rosterByAttemptId: Map<string, string>,
  examTitle: string,
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

  useEffect(() => {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    if (document.visibilityState !== 'hidden') return;

    const now = Date.now();
    const entries = notified.current;

    for (const [attemptId, entry] of entries) {
      if (entry.active && !flagged.has(attemptId)) entry.active = false;
    }

    for (const attemptId of flagged) {
      const entry = entries.get(attemptId);
      const eligible = !entry || (!entry.active && now - entry.notifiedAt >= NOTIFY_REARM_MINUTES * 60_000);
      if (!eligible) continue;

      const name = rosterByAttemptId.get(attemptId) ?? 'A candidate';
      new Notification(examTitle, { body: `${name} is generating a lot of proctoring alerts` });
      entries.set(attemptId, { notifiedAt: now, active: true });
    }
  }, [flagged, rosterByAttemptId, examTitle]);

  return { permission, requestPermission };
}
