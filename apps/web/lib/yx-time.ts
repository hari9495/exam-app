import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoadState, Pin } from '@yukthix/ui/time';
import { apiFetch, apiFetchBlob } from './api-client';
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

/** One location read from the browser; `high` asks for GPS, which on a laptop can take the whole timeout. */
const readLocation = (high: boolean, timeout: number) =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: high, timeout, maximumAge: high ? 30_000 : 300_000 }));

/** Rough enough to trust for a geofence without asking for GPS (metres). */
const GOOD_ENOUGH_M = 100;

/**
 * The browser's location for a punch (YX-AT-23): the pin, or the plain reason it is missing.
 * A quick network-based fix first (instant on a laptop, reused for 5 minutes); GPS only when that fix is too rough
 * (founder, 21 Oct: Clock in and breaks took up to 10 s on a laptop waiting for GPS).
 */
export async function browserLocation(): Promise<{ pin: Pin | null; problem?: string }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { pin: null, problem: 'This browser cannot share your location. You can still check in from the office network.' };
  const pin = (p: GeolocationPosition): Pin => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) });
  let quick: GeolocationPosition | null = null;
  try {
    quick = await readLocation(false, 4_000);
    // A laptop has no GPS to improve on the network fix, so only a phone or tablet waits for it.
    if (quick.coords.accuracy <= GOOD_ENOUGH_M || !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return { pin: pin(quick) };
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) return { pin: null, problem: 'Location is turned off for YukthiX in this browser. Allow it in the address bar, or check in from the office network.' };
  }
  try {
    return { pin: pin(await readLocation(true, 8_000)) };
  } catch {
    return quick ? { pin: pin(quick) } : { pin: null, problem: 'Your location could not be found. Move near a window or outdoors and try again.' };
  }
}

/** Today in India time (yyyy-mm-dd). */
export const todayIndia = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** Downloads a file from the time API (registers) with the person's token, as the browser's own download. */
export function useTimeDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallbackName: string) => {
    const { blob, filename } = await apiFetchBlob(`/time${path}`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? fallbackName;
    a.click();
    URL.revokeObjectURL(url);
  };
}

/** The Monday of a date's week (yyyy-mm-dd). */
export const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** The month before this one in India time (yyyy-mm). */
export const lastMonth = () => {
  const d = new Date(`${todayIndia().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
