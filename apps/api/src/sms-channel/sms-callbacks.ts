import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { readPath } from '../sms/providers';

// Delivery-status and opt-out callbacks from a gateway (YX-NTF-10/11), mapped by configuration so any
// gateway's format works. Each account authenticates its callbacks with its own secret:
//   token  the secret in the `X-Callback-Token` header or the `token` query parameter (for gateways
//          that only let you set a URL)
//   hmac   HMAC-SHA256 of the raw body with the secret, in a header (hex or base64, optional "sha256=")
// Both are compared in constant time over fixed-length digests.

export interface CallbackConfig {
  auth: 'token' | 'hmac';
  signatureHeader?: string;
  signatureEncoding?: 'hex' | 'base64';
  /** Path to an array of events when the gateway batches them; otherwise the body is one event (or an array). */
  itemsPath?: string;
  messageIdPath: string;
  statusPath: string;
  /** Path to the phone number, for opt-out (STOP) events that carry no message id. */
  addressPath?: string;
  delivered: string[];
  failed: string[];
  optedOut: string[];
}

export type CallbackOutcome = 'delivered' | 'failed' | 'opted_out';

export interface CallbackEvent {
  messageId: string | null;
  outcome: CallbackOutcome | null;
  address: string | null;
}

const PATH_RE = /^[A-Za-z0-9_.-]{1,200}$/;
const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Twilio status callbacks (form-encoded MessageSid / MessageStatus); the URL carries ?token=. */
export const TWILIO_CALLBACK: CallbackConfig = {
  auth: 'token',
  messageIdPath: 'MessageSid',
  statusPath: 'MessageStatus',
  delivered: ['delivered'],
  failed: ['failed', 'undelivered'],
  optedOut: [],
};

export function callbackFor(provider: string, configured: unknown): CallbackConfig | null {
  if (configured !== undefined && configured !== null) return callbackConfigError(configured) ? null : (configured as CallbackConfig);
  return provider === 'twilio' ? TWILIO_CALLBACK : null;
}

const stringList = (v: unknown) => Array.isArray(v) && v.length <= 20 && v.every((s) => typeof s === 'string' && s.length <= 100);

export function callbackConfigError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'callback must be an object';
  const c = value as Partial<CallbackConfig>;
  if (c.auth !== 'token' && c.auth !== 'hmac') return 'callback.auth must be token or hmac';
  if (c.signatureHeader !== undefined && !HEADER_RE.test(String(c.signatureHeader))) return 'callback.signatureHeader is not a header name';
  if (c.signatureEncoding !== undefined && c.signatureEncoding !== 'hex' && c.signatureEncoding !== 'base64') return 'callback.signatureEncoding must be hex or base64';
  for (const key of ['messageIdPath', 'statusPath'] as const) if (!PATH_RE.test(String(c[key] ?? ''))) return `callback.${key} must be a dot path`;
  for (const key of ['itemsPath', 'addressPath'] as const) if (c[key] !== undefined && !PATH_RE.test(String(c[key]))) return `callback.${key} must be a dot path`;
  for (const key of ['delivered', 'failed', 'optedOut'] as const) if (!stringList(c[key])) return `callback.${key} must be a list of up to 20 status values`;
  return null;
}

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest();
const sameSecret = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

export interface CallbackRequest {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}

const header = (req: CallbackRequest, name: string) => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/** True only when the request carries this account's secret (constant time). No secret, no callbacks. */
export function verifyCallback(config: CallbackConfig, secret: unknown, req: CallbackRequest): boolean {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  if (config.auth === 'token') {
    const given = header(req, 'x-callback-token') ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
    return typeof given === 'string' && sameSecret(given, secret);
  }
  const given = header(req, config.signatureHeader ?? 'x-signature');
  if (typeof given !== 'string') return false;
  const mac = createHmac('sha256', secret).update(req.rawBody).digest(config.signatureEncoding ?? 'hex');
  const value = given.replace(/^sha256=/i, '').trim();
  return sameSecret(config.signatureEncoding === 'base64' ? value : value.toLowerCase(), mac);
}

function parseBody(raw: Buffer, contentType: string | undefined): unknown {
  const text = raw.toString('utf8');
  if (!text.trim()) return {};
  if (contentType?.includes('x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

const MAX_EVENTS = 500;
const asText = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 200) : null);

/** The events in a verified callback. Query parameters count as body fields (GET-style gateways). */
export function parseCallback(config: CallbackConfig, req: CallbackRequest): CallbackEvent[] {
  const body = parseBody(req.rawBody, header(req, 'content-type'));
  const merged = body && typeof body === 'object' && !Array.isArray(body) ? { ...stringsOf(req.query), ...(body as object) } : body;
  const listed = config.itemsPath ? readPath(merged, config.itemsPath) : merged;
  const items = (Array.isArray(listed) ? listed : [listed]).slice(0, MAX_EVENTS);
  return items.map((item) => {
    const status = asText(readPath(item, config.statusPath));
    const outcome: CallbackOutcome | null =
      status === null ? null : config.optedOut.includes(status) ? 'opted_out' : config.delivered.includes(status) ? 'delivered' : config.failed.includes(status) ? 'failed' : null;
    return {
      messageId: asText(readPath(item, config.messageIdPath)),
      outcome,
      address: config.addressPath ? asText(readPath(item, config.addressPath)) : null,
    };
  });
}

function stringsOf(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([k, v]) => k !== 'token' && typeof v === 'string')) as Record<string, string>;
}
