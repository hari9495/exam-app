import { API_BASE } from './api-client';

// The outside help page (/yx/portal/<company>/<portal>): public calls with no YukthiX sign-in. After the email code the
// API hands out a portal session token; it is sent as X-Portal-Session and kept in this tab only (sessionStorage).

export type PortalError = Error & { status?: number; retryAfterSeconds?: number };

const key = (org: string, portal: string) => `yx-portal:${org}/${portal}`;

export const portalSession = {
  get: (org: string, portal: string): string | null => {
    try {
      return window.sessionStorage.getItem(key(org, portal));
    } catch {
      return null;
    }
  },
  set: (org: string, portal: string, token: string | null) => {
    try {
      if (token) window.sessionStorage.setItem(key(org, portal), token);
      else window.sessionStorage.removeItem(key(org, portal));
    } catch {
      /* storage blocked: the session lasts until the page reloads */
    }
  },
};

/** One call under /desk/portal/<org>/<portal>. Errors carry the status and, on 429, how long to wait. */
export async function portalFetch<T>(org: string, portal: string, path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/desk/portal/${encodeURIComponent(org)}/${encodeURIComponent(portal)}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'omit',
      headers: { ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(opts.token ? { 'X-Portal-Session': opts.token } : {}) },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });
  } catch {
    throw Object.assign(new Error('We could not reach the help page. Check your connection and try again.'), { status: 0 });
  }
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[]; retryAfterSeconds?: number };
  const wait = body.retryAfterSeconds ?? Number(res.headers.get('Retry-After') ?? 0);
  const message =
    res.status === 429
      ? `Too many tries. Wait ${wait > 0 ? `${wait} seconds` : 'a minute'} and try again.`
      : (Array.isArray(body.message) ? body.message[0] : body.message) || (res.status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : 'That did not work. Try again.');
  throw Object.assign(new Error(message), { status: res.status, retryAfterSeconds: wait || undefined }) as PortalError;
}
