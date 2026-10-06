/**
 * Provider abstraction for outbound SMS. An org (candidate SMS) or a channel account (P04 SMS channel)
 * picks one adapter by id and stores an encrypted config blob shaped by that adapter's configFields.
 */

export interface SmsConfigField {
  key: string;
  label: string;
  secret: boolean; // secret fields are never returned by GET; blank-on-PUT keeps existing
  required: boolean;
  placeholder?: string;
}

export interface SmsSendArgs {
  to: string;
  body: string;
  /** DLT sender header / sender id. */
  sender?: string | null;
  dltEntityId?: string | null;
  dltTemplateId?: string | null;
  /** The DLT template's {#var#} values, in order ({var1}, {var2}, ... in an http body template). */
  vars?: string[];
  /** Same for every retry of one send, for gateways that de-duplicate on it. */
  idempotencyKey?: string;
}

/**
 * Why a send did not go, which decides what is safe next (never resend a code that may have arrived):
 *  - rejected:    the gateway refused it; nothing was sent. Try the next account.
 *  - unavailable: the gateway was never reached, or asked us to come back (429 / 503). Retry, then the next account.
 *  - unknown:     it may have been sent (timeout after the request went, 5xx). Stop.
 */
export type SmsFailure = 'rejected' | 'unavailable' | 'unknown';

export interface SmsSendResult {
  ok: boolean;
  status?: number;
  providerMsgId?: string;
  failure?: SmsFailure;
  /** Short reason for the delivery log; never contains a secret or the message. */
  error?: string;
}

/** The subset of fetch the adapters use; the default is the DNS-pinned public-https fetch. */
export type SmsFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; redirect?: 'manual'; signal?: AbortSignal },
) => Promise<Response>;

export interface SmsProviderAdapter {
  id: string; // 'twilio' | 'http' | 'dev'
  label: string;
  configFields: SmsConfigField[];
  validateConfig(config: Record<string, unknown>): void; // throw BadRequestException on invalid
  send(config: Record<string, unknown>, args: SmsSendArgs, fetchImpl?: SmsFetch): Promise<SmsSendResult>;
}

// Network errors that happen before a request reaches the gateway: nothing can have been sent.
const NOT_REACHED = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH']);
// The gateway can never be reached safely (resolves to a private address, bad certificate).
const REFUSED = new Set(['ENOTPUBLIC', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']);

/** A thrown fetch error as a send result. */
export function networkFailure(error: unknown): SmsSendResult {
  const err = error as { code?: string; cause?: { code?: string } };
  const code = err?.code ?? err?.cause?.code ?? '';
  if (NOT_REACHED.has(code)) return { ok: false, failure: 'unavailable', error: `gateway not reached (${code})` };
  if (REFUSED.has(code)) return { ok: false, failure: 'rejected', error: `gateway refused by YukthiX (${code})` };
  return { ok: false, failure: 'unknown', error: code ? `no answer from the gateway (${code})` : 'no answer from the gateway' };
}

/** A non-success HTTP status as a send result. */
export function statusFailure(status: number): SmsSendResult {
  if (status === 429 || status === 503) return { ok: false, status, failure: 'unavailable', error: `gateway busy (HTTP ${status})` };
  if (status >= 500) return { ok: false, status, failure: 'unknown', error: `gateway error (HTTP ${status})` };
  return { ok: false, status, failure: 'rejected', error: `gateway refused the message (HTTP ${status})` };
}

/** A dot path into parsed JSON: "data.0.id". */
export function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((at, key) => (at !== null && typeof at === 'object' && Object.prototype.hasOwnProperty.call(at, key) ? (at as Record<string, unknown>)[key] : undefined), value);
}
