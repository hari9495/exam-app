import { humanizeHttpError, NetworkError } from './http-error-message';

// Exported for public, unauthenticated pages (e.g. the candidate apply/status pages) that hit
// the backend with plain fetch instead of apiFetch -- there's no access token to attach.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

// 403 codes from the API's MFA floor (P12 YX-IAM-01/02). Neither is a stale token, so neither
// goes through the refresh retry below.
export const MFA_REQUIRED = 'MFA_REQUIRED';
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';
// The password was found in a breach on re-check (P12 YX-IAM-08): sign-in hands out a single-use
// reset token instead of a session, and the browser goes straight to choosing a new password.
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

// Asks the person to confirm it is them (StepUpProvider); resolves true once they have, and the
// request that needed it is sent again.
let stepUpHandler: (() => Promise<boolean>) | null = null;

export function setStepUpHandler(handler: (() => Promise<boolean>) | null) {
  stepUpHandler = handler;
}

// A 401 from these means a wrong credential or code, not an expired session: refreshing is
// pointless there (and /auth/refresh would recurse into its own handler).
const NO_REFRESH_PATHS = new Set([
  '/auth/refresh',
  '/auth/staff/login',
  '/auth/staff/select-company',
  '/auth/otp/verify',
  '/auth/mfa/verify',
  '/auth/mfa/passkey-options',
  '/auth/mfa/step-up',
]);

// An error body can be read once; remember it for throwForResponse.
const errorBodies = new WeakMap<Response, Record<string, unknown>>();
async function errorBody(response: Response): Promise<Record<string, unknown>> {
  if (!errorBodies.has(response)) errorBodies.set(response, await response.json().catch(() => ({})));
  return errorBodies.get(response)!;
}

async function errorCode(response: Response): Promise<string | undefined> {
  if (response.status !== 403) return undefined;
  const { code } = await errorBody(response);
  return typeof code === 'string' ? code : undefined;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    return await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    // fetch() only rejects when no response arrived at all (offline, DNS,
    // connection reset). NetworkError extends TypeError so retry.ts still
    // recognises it as retryable, but the user sees a sentence instead of
    // the browser's "Failed to fetch".
    throw new NetworkError();
  }
}

async function throwForResponse(response: Response): Promise<never> {
  const body = await errorBody(response);
  const error = new Error(humanizeHttpError(response.status, body.message as string | undefined)) as Error & { status?: number; code?: string };
  error.status = response.status;
  if (typeof body.code === 'string') error.code = body.code;
  if (body.code === PASSWORD_CHANGE_REQUIRED && typeof body.resetToken === 'string' && /^[0-9a-f]{64}$/.test(body.resetToken) && typeof window !== 'undefined') {
    window.location.assign(`/reset-password/${body.resetToken}`);
  }
  throw error;
}

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let token = accessToken;
  let response = await doFetch(path, options, token);
  let code = await errorCode(response);

  // 403 alongside 401: a role change made elsewhere leaves this tab holding a
  // still-valid-but-stale access token, so a now-permitted request server-side
  // denies with 403 (not 401) until that token is replaced. One retry through the
  // same refresh handler picks up the current role instead of failing outright.
  // Exclude the refresh endpoint itself: the registered unauthorized handler
  // (AuthProvider's silentRefresh) calls this same endpoint, so retrying a
  // failed refresh through the handler would recurse into itself forever.
  // A 401 from the login endpoint means bad credentials, NOT an expired session — running the
  // refresh handler there is pointless (no session yet) and, if refresh itself errors, masks the
  // real "Invalid credentials" message. Exclude it alongside the refresh endpoint.
  if ((response.status === 401 || (response.status === 403 && !code)) && unauthorizedHandler && !NO_REFRESH_PATHS.has(path)) {
    const freshToken = await unauthorizedHandler();
    if (freshToken) {
      token = freshToken;
      response = await doFetch(path, options, token);
      code = await errorCode(response);
    }
  }

  if (code === STEP_UP_REQUIRED && stepUpHandler && (await stepUpHandler())) {
    response = await doFetch(path, options, token);
  }

  if (!response.ok) {
    await throwForResponse(response);
  }
  return response.status === 204 ? null : response.json();
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await doFetch(path, options, accessToken);
  if (!response.ok) {
    await throwForResponse(response);
  }
  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  return { blob: await response.blob(), filename: filenameMatch ? filenameMatch[1] : null };
}
