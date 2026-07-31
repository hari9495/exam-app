import { humanizeHttpError, NetworkError } from './http-error-message';

const EXAM_RUNTIME_API_BASE = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';

// Carries the bits of a failed response that a retry policy needs to decide
// with. Throwing a bare Error here used to discard the status entirely, which
// left callers unable to tell "the server is briefly overloaded, try again"
// apart from "this invitation was already used, retrying can never work" --
// and retrying the latter is not free: /candidate-auth/redeem is rate-limited
// to 5/min per IP, so a blind retry spends a candidate's budget on a request
// that is guaranteed to fail. See lib/retry.ts for the policy that reads this.
export class CandidateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'CandidateApiError';
  }
}

// Only the delta-seconds form is parsed. Retry-After also permits an HTTP-date,
// but the only sender we care about is ServerBusyRetryAfterFilter, which always
// emits seconds; an unparseable value simply falls back to the client's own
// backoff rather than being guessed at.
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setCandidateUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    return await fetch(`${EXAM_RUNTIME_API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    // Same contract as api-client: keeps `instanceof TypeError` true for the
    // retry policy while replacing "Failed to fetch" with a human sentence.
    throw new NetworkError();
  }
}

export async function candidateApiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  if (response.status === 401 && unauthorizedHandler && path !== '/candidate-auth/refresh') {
    const freshToken = await unauthorizedHandler();
    if (freshToken) {
      response = await doFetch(path, options, freshToken);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new CandidateApiError(
      humanizeHttpError(response.status, body.message),
      response.status,
      parseRetryAfter(response.headers.get('Retry-After')),
    );
  }
  return response.json();
}
