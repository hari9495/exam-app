import { AsyncLocalStorage } from 'async_hooks';

/**
 * Settings S-5 follow-up (answer 1723): where a request came from, kept for the length of the request so every audit row
 * written while handling it records it (the database reads `app.channel`, set with each tenant transaction).
 * `api`: the public API (an API key); `phone`: a phone's browser or app; `web`: anything else signed in. Jobs have none.
 */
export type AuditChannel = 'web' | 'phone' | 'api';

export const requestChannel = new AsyncLocalStorage<AuditChannel>();

const PHONE = /\b(Android|iPhone|iPad|iPod|Mobile)\b/i;

export function channelOf(req: { path?: string; originalUrl?: string; headers?: Record<string, string | string[] | undefined> }): AuditChannel {
  const path = req.originalUrl ?? req.path ?? '';
  if (/\/api\/v1\/public\//.test(path)) return 'api';
  const ua = req.headers?.['user-agent'];
  return PHONE.test(Array.isArray(ua) ? ua.join(' ') : (ua ?? '')) ? 'phone' : 'web';
}

/**
 * Security review F2 (25 Nov 2026): who is really acting in this request. Filled in by the API's JWT check once the token
 * is read (it runs after this middleware, so the store is an object it sets a field on); every audit row written while
 * handling the request then names the impersonator beside the impersonated person.
 */
export const requestActor = new AsyncLocalStorage<{ impersonatorUserId?: string | null }>();

/** Express middleware: runs the rest of the request with its channel known (and room for the real actor). */
export function recordRequestChannel(req: Parameters<typeof channelOf>[0], _res: unknown, next: () => void): void {
  requestChannel.run(channelOf(req), () => requestActor.run({}, next));
}
