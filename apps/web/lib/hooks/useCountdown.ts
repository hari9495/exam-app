import { useEffect, useRef, useState } from 'react';

export function useCountdown(remainingSeconds: number | undefined, onExpire: () => void, isTicking = true): number {
  const [displaySeconds, setDisplaySeconds] = useState(remainingSeconds ?? 0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    if (remainingSeconds !== undefined) {
      setDisplaySeconds(remainingSeconds);
      firedRef.current = false;
    }
  }, [remainingSeconds]);

  useEffect(() => {
    // ponytail: freeze is a param, not a status enum, so this hook stays agnostic
    // of "paused"/"blocked" — the caller (exam/page.tsx) maps its own status to isTicking.
    if (!isTicking) return;
    const interval = setInterval(() => {
      setDisplaySeconds((current) => {
        const next = current <= 0 ? 0 : current - 1;
        if (next <= 0 && !firedRef.current) {
          firedRef.current = true;
          onExpireRef.current();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTicking]);

  return displaySeconds;
}
