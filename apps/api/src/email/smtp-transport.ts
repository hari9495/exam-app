/**
 * One place that decides how to talk to an SMTP server.
 *
 * This existed as three separate inline `createTransport({ host, port, auth })`
 * calls -- the settings-validation ping, the per-org sender, and the
 * platform-default sender -- and all three were missing the same two things.
 */

export interface SmtpConnectionInput {
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  pool: boolean;
  maxConnections: number;
}

/**
 * Port 465 is implicit TLS (SMTPS): the connection is encrypted from the very
 * first byte. Nodemailer's `secure` defaults to FALSE, so without this it opens
 * a plaintext socket to a TLS-only port, the server never sends a greeting, and
 * the connection just hangs -- no error, no diagnosis. Port 587 is the opposite
 * (plaintext then STARTTLS upgrade), which is why 587 always appeared to work.
 */
export function isImplicitTlsPort(port: number): boolean {
  return port === 465;
}

/**
 * Timeouts are not optional here. nginx in front of this API gives up at 60s and
 * returns a bare `504 Gateway Time-out`, so an unreachable or mis-ported SMTP
 * host produced a gateway error page rather than a message naming the problem.
 * These bound the wait well inside that window so the caller gets a real error.
 */
export const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
export const SMTP_GREETING_TIMEOUT_MS = 10_000;
export const SMTP_SOCKET_TIMEOUT_MS = 20_000;

// A bulk invite fires every invitation email back-to-back with no delay. Without
// pooling, nodemailer opens one brand-new SMTP connection per send -- a 97-candidate
// batch became 97 near-simultaneous connection attempts against the same mailbox,
// and Office365 rejected most of them with "432 4.3.2 Concurrent connections limit
// exceeded". Pooling makes nodemailer queue sends and reuse a small, bounded set of
// connections instead of opening one per message.
export const SMTP_MAX_CONNECTIONS = 3;

export function buildSmtpTransportOptions({ host, port, user, password }: SmtpConnectionInput): SmtpTransportOptions {
  return {
    host,
    port,
    secure: isImplicitTlsPort(port),
    // An empty user means "no authentication" (an open relay on an internal
    // network). Sending `auth: { user: '', pass: '' }` makes nodemailer attempt
    // AUTH and fail, so the key is omitted entirely instead.
    ...(user ? { auth: { user, pass: password ?? '' } } : {}),
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    pool: true,
    maxConnections: SMTP_MAX_CONNECTIONS,
  };
}
