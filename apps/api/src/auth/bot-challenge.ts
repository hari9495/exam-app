import { ForbiddenException, Logger } from '@nestjs/common';

// Bot challenge on the public sign-in steps (ASVS V2.2.1, YX-IAM-07): Cloudflare Turnstile,
// verified server-side with the official siteverify API. Inert until TURNSTILE_SECRET_KEY is set
// (the web app then needs NEXT_PUBLIC_TURNSTILE_SITE_KEY). The lockout is the hard limit; this
// raises the cost of automating it.
//
// Outage policy -- FAIL OPEN, LOGGED: if siteverify cannot be reached, the attempt goes on to the
// lockout-protected check rather than locking every tenant out because a third party is down.
// A token the service actually rejects is always refused.
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 3000;
export const BOT_CHALLENGE_FAILED_CODE = 'BOT_CHALLENGE_FAILED';
const logger = new Logger('BotChallenge');

export async function assertHuman(token: string | undefined, ip: string | null): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  const refuse = () =>
    new ForbiddenException({ statusCode: 403, code: BOT_CHALLENGE_FAILED_CODE, message: 'Please confirm you are human and try again.' });
  if (!token) throw refuse();
  let outcome: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    outcome = (await res.json()) as typeof outcome;
  } catch (error) {
    logger.error(`Bot-challenge verification unavailable (${(error as Error).message}); falling back to the lockout alone`);
    return;
  }
  if (outcome.success !== true) throw refuse();
}
