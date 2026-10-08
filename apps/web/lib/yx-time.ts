import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoadState, Pin } from '@yukthix/ui/time';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Time and leave (/time/*, M02 step 4 batch 1). The screens in @yukthix/ui/time stay presentational;
// every call is checked again on the server (own records, the manager's team, HR scope, the set-up key).

/** One GET under /time, cached under ['time', path]. */
export function useTime<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['time', path], queryFn: () => apiFetch(`/time${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** Calls the time API and refreshes every time query (and the approvals inbox, which leave requests land in). */
export function useTimeWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, method: 'POST' | 'PUT' = 'POST', body?: unknown, refresh = true): Promise<T> => {
    const result = await apiFetch(`/time${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    if (refresh) {
      await queryClient.invalidateQueries({ queryKey: ['time'] });
      await queryClient.invalidateQueries({ queryKey: ['workflow'] });
    }
    return result as T;
  };
}

/** A GET that is not cached (previews, day cards, ledgers). */
export function useTimeRead() {
  const { accessToken } = useAuth();
  return <T,>(path: string) => apiFetch(`/time${path}`, {}, accessToken ?? undefined) as Promise<T>;
}

export function timeState(...qs: { isError: boolean; error: unknown; data: unknown }[]): LoadState {
  const err = qs.find((q) => q.isError)?.error as { status?: number; code?: string } | undefined;
  if (err) return err.status === 403 && err.code !== 'MFA_REQUIRED' ? 'no-access' : 'error';
  return qs.every((q) => q.data !== undefined) ? 'ready' : 'loading';
}

/** The browser's location for a punch (YX-AT-23): the pin, or the plain reason it is missing. */
export function browserLocation(): Promise<{ pin: Pin | null; problem?: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ pin: null, problem: 'This browser cannot share your location. You can still check in from the office network.' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ pin: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) } }),
      (e) =>
        resolve({
          pin: null,
          problem: e.code === e.PERMISSION_DENIED ? 'Location is turned off for YukthiX in this browser. Allow it in the address bar, or check in from the office network.' : 'Your location could not be found. Move near a window or outdoors and try again.',
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

/** Today in India time (yyyy-mm-dd). */
export const todayIndia = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
