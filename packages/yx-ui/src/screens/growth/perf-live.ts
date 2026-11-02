// Shared helpers for the Performance designs when the app passes `live` (PRF-07 … PRF-12): dates from the API and one
// action at a time with a toast for done (5 s) and a toast that stays for a refusal.
import { useState } from 'react';
import { useToast } from '../../components/notify';
import { errorText } from '../org/org-kit';

/** "2026-11-03" (or an ISO time) → that day at local midnight. */
export function day(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** One action at a time. Done: a success toast; refused: the server's plain message in a toast that stays. */
export function useAct() {
  let toast: ReturnType<typeof useToast>['toast'] = () => 0;
  try {
    toast = useToast().toast;
  } catch {
    // Design stories and unit tests render without a toast host; nothing to show then.
  }
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>, done?: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      await fn();
      if (done) toast({ title: done, tone: 'success' });
      return true;
    } catch (e) {
      toast({ title: errorText(e), tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, act, toast };
}
