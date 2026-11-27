// T2-E 52 (answers 2875 to 2877): the pure rules of Web Push.
import { NOTIFICATION_TYPE_BY_KEY } from './notification-types';

/** Push is on by default for approvals waiting and decisions on my requests (the approvals group), off for the rest. */
export const pushDefault = (type: string) => NOTIFICATION_TYPE_BY_KEY.get(type)?.group === 'approvals';

/** Answer 2876: a short neutral title only (the kind's label), never figures, names or ticket content. */
export const pushTitle = (type: string) => NOTIFICATION_TYPE_BY_KEY.get(type)?.label ?? 'You have something new in YukthiX';

/** Quiet hours in India time, "HH:MM" to "HH:MM"; a window over midnight (21:00-08:00) wraps. Equal ends: never quiet. */
export function inQuietHours(nowHm: string, from: string, to: string): boolean {
  if (from === to) return false;
  return from < to ? nowHm >= from && nowHm < to : nowHm >= from || nowHm < to;
}

/** India time now as "HH:MM". */
export const istHm = (now = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 16);

export const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The browsers' push services (Chrome/Edge via FCM, Firefox, Safari, Windows). The server POSTs to the endpoint, so any other host is refused (no requests to internal addresses). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

/** A push endpoint the browser gave: https, on a known push service, at most 1000 characters. */
export function validEndpoint(url: string): boolean {
  if (url.length > 1000) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.port && !u.username && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/** The server's push keys (from config, never committed); null when push is not set up. */
export function pushKeys(env: NodeJS.ProcessEnv = process.env): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}
