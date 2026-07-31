/**
 * Turns an HTTP failure into a sentence a non-technical person can act on.
 *
 * The rule: a CUSTOM server message passes through untouched -- messages like
 * "Logo must be a PNG, JPEG, or SVG image" or "Invalid credentials" are already
 * written for people. What gets replaced is framework noise the user was never
 * meant to see: NestJS defaults ("Forbidden resource", "Internal server error",
 * "ThrottlerException: Too Many Requests"), empty bodies (nginx 502/504 pages
 * aren't JSON, so the parsed body is {}), and class-validator ARRAYS, which
 * Error() would otherwise mash into one comma-run sentence.
 */

// Framework/gateway defaults, compared case-insensitively. Anything here is
// technical noise; anything NOT here is assumed to be a hand-written message.
const TECHNICAL_DEFAULTS = new Set(
  [
    'Bad Request',
    'Unauthorized',
    'Forbidden',
    'Forbidden resource',
    'Not Found',
    'Conflict',
    'Payload Too Large',
    'Unprocessable Entity',
    'Too Many Requests',
    'ThrottlerException: Too Many Requests',
    'Internal server error',
    'Internal Server Error',
    'Bad Gateway',
    'Service Unavailable',
    'Gateway Timeout',
  ].map((m) => m.toLowerCase()),
);

const BY_STATUS: Record<number, string> = {
  400: "That request couldn't be processed. Please check the details and try again.",
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to do this. If you think you should, ask your organization admin.",
  404: "We couldn't find that. It may have been moved or deleted.",
  409: 'That conflicts with something that already exists.',
  413: 'That file is too large.',
  429: 'Too many attempts. Please wait a minute and try again.',
};

export function humanizeHttpError(status: number, rawMessage: unknown): string {
  // class-validator sends message as an array of per-field sentences; each one
  // is already readable, they just need joining as sentences instead of being
  // comma-mashed by String(array).
  if (Array.isArray(rawMessage) && rawMessage.length > 0) {
    return rawMessage.map((m) => String(m).replace(/\.$/, '')).join('. ') + '.';
  }

  if (typeof rawMessage === 'string' && rawMessage.trim() && !TECHNICAL_DEFAULTS.has(rawMessage.trim().toLowerCase())) {
    return rawMessage;
  }

  if (BY_STATUS[status]) return BY_STATUS[status];
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return `Something unexpected went wrong (error ${status}). Please try again.`;
}

/**
 * fetch() rejects with a bare TypeError("Failed to fetch") when no response
 * arrived at all. Subclassing TypeError keeps lib/retry.ts's
 * `error instanceof TypeError` retry check working while the user sees a
 * sentence instead of browser internals.
 */
export class NetworkError extends TypeError {
  constructor() {
    super("Can't reach the server. Check your internet connection and try again.");
    this.name = 'NetworkError';
  }
}
