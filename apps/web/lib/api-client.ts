import { humanizeHttpError, NetworkError } from './http-error-message';
import { goTo } from './navigate';
import { withNextHere } from './safe-next';

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
  '/auth/platform/login',
  '/auth/staff/select-company',
  '/auth/otp/verify',
  '/auth/mfa/verify',
  '/auth/mfa/passkey-options',
  '/auth/mfa/step-up',
  // A wrong current password, not an expired session.
  '/users/me/change-password',
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

// errors: per-field problems from a form the API checks (Settings › Notifications › Email).
const DETAIL_FIELDS = ['personIds', 'clashes', 'errors', 'retryAfterSeconds'] as const;

async function throwForResponse(response: Response): Promise<never> {
  const body = await errorBody(response);
  const error = new Error(humanizeHttpError(response.status, body.message as string | undefined)) as Error & { status?: number; code?: string; body?: Record<string, unknown> };
  error.status = response.status;
  // Structured refusals screens act on (POSSIBLE_SAME_PERSON's personIds, EMPLOYEE_CODE_CLASHES' clashes).
  // An allowlist: other fields (a password-reset token) never ride along on the error object.
  const details = Object.fromEntries(DETAIL_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
  if (Object.keys(details).length) error.body = details;
  if (typeof body.code === 'string') error.code = body.code;
  if (body.code === PASSWORD_CHANGE_REQUIRED && typeof body.resetToken === 'string' && /^[0-9a-f]{64}$/.test(body.resetToken) && typeof window !== 'undefined') {
    window.location.assign(`/yx/reset-password/${body.resetToken}`);
  }
  throw error;
}

// Set when a YukthiX platform staff (super_admin) token is applied, so a dead staff session goes
// back to the staff sign-in rather than the company one (founder decision 7 Oct 2026).
export const STAFF_SESSION_KEY = 'staffSession';
export const STAFF_SIGN_IN = '/staff/sign-in';

/** Where this tab signs in again: the staff page for platform staff, else the YukthiX sign-in. */
export function signInPath(): string {
  if (typeof window === 'undefined') return '/yx/sign-in';
  return window.location.pathname.startsWith('/staff') || window.sessionStorage.getItem(STAFF_SESSION_KEY) === '1' ? STAFF_SIGN_IN : '/yx/sign-in';
}

// One /auth/refresh shared by every request that hits a 401 at the same time: refresh tokens rotate
// on every use, and the endpoint is strictly rate-limited.
let refreshInFlight: Promise<string | null> | null = null;
function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = unauthorizedHandler!()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

let sentToSignIn = false;
/** The session is over (refresh refused, rate-limited or unreachable): stop and sign in again, once,
 * then come back here (?next=, validated again by the sign-in). */
function sendToSignIn() {
  if (sentToSignIn || typeof window === 'undefined') return;
  const target = signInPath();
  if (window.location.pathname === target) return;
  sentToSignIn = true;
  goTo(withNextHere(target));
}

/** Test hook: forget a previous send-to-sign-in. */
export function resetSessionState() {
  sentToSignIn = false;
  refreshInFlight = null;
}

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let token = accessToken;
  let response = await doFetch(path, options, token);
  let code = await errorCode(response);

  // Only a 401 means the access token expired. A 403 is the server's answer (no permission, or an
  // MFA floor) and a refresh cannot change it; refreshing on 403 looped with every query that a
  // permission profile is denied (and a role change reaches this tab through the scheduled refresh
  // in AuthProvider instead). One refresh, one retry: if the refresh fails (401, 429, network) or
  // hands back the token that was just refused, the session is over and the person signs in again.
  if (response.status === 401 && unauthorizedHandler && !NO_REFRESH_PATHS.has(path)) {
    const freshToken = await refreshOnce();
    if (freshToken && freshToken !== token) {
      token = freshToken;
      response = await doFetch(path, options, token);
      code = await errorCode(response);
    } else if (token) {
      sendToSignIn();
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
