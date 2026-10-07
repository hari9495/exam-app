// YukthiX sign-in and "Confirm it's you" in YukthiX's plain voice. The API's own words stay for the
// older screens; these never say more than the API did (P12: a wrong password and an unknown email
// read the same; a used recovery code and a wrong one read the same).
export const TOO_MANY_TRIES = 'Too many tries. Wait a minute and try again.';
export const ACCOUNT_LOCKED = 'Too many tries. Wait a few minutes and try again.';
export const CODE_FAILED = "That code didn't work. Check it and try again.";
export const RECOVERY_CODE_FAILED = "That recovery code didn't work. It may already be used — try another one.";

const API_LOCKED = 'Too many sign-in attempts. Please wait and try again.';
const API_PROOF_FAILED = 'That verification did not work. Try again.';

const PLAIN: Record<string, string> = {
  'Invalid credentials': 'Wrong email or password. Try again.',
  [API_LOCKED]: ACCOUNT_LOCKED,
};

/** A failed sign-in step as one sentence. A 429 other than the account / IP lock is the request throttle. */
export function yxAuthMessage(err: unknown, fallback: string): string {
  const text = err instanceof Error && err.message ? err.message : fallback;
  if (PLAIN[text]) return PLAIN[text];
  return (err as { status?: number } | null)?.status === 429 ? TOO_MANY_TRIES : text;
}

/** A refused second step (sign-in or "Confirm it's you"), in the words for the way used. */
export function yxProofError(err: unknown, factor: string): Error {
  if (err instanceof Error && err.message === API_PROOF_FAILED) {
    if (factor === 'recovery_code') return new Error(RECOVERY_CODE_FAILED);
    if (factor === 'totp' || factor === 'otp') return new Error(CODE_FAILED);
  }
  return new Error(yxAuthMessage(err, API_PROOF_FAILED));
}
