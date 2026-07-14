import { useEffect, useRef, useState } from 'react';

export function useCountdown(remainingSeconds: number | undefined, onExpire: () => void): number {
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
  }, []);

  return displaySeconds;
}
