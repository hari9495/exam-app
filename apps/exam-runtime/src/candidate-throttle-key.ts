import { createHash } from 'crypto';
import { verify } from 'jsonwebtoken';

const CANDIDATE_REFRESH_COOKIE = 'candidate_refresh_token';

// Rate-limit key for a candidate request, or null to fall back to the client IP.
//
// The whole reason this exists: the throttler keys on client IP by default, and
// candidates sitting in a shared office / exam hall all egress through ONE
// public IP. Per-IP buckets then mean the entire room shares one allowance --
// e.g. 60 attempt-requests/min for 200 people -- and the exam collapses under
// its own polling. Keying on the candidate's own identity gives each candidate
// an independent bucket regardless of shared egress. See ADO #6823.
//
// Three cases, in the order a candidate hits them:
//  1. Authenticated exam traffic (poll/answer/submit/proctoring/run-code) carries
//     a candidate access token. We VERIFY it -- an unverified decode would let a
//     forged `sub` mint unlimited fresh buckets and defeat the limit; a bad token
//     falls through to IP, and it 401s at the auth guard anyway.
//  2. redeem has no session yet, so key on the invite token. A 256-bit random
//     token is unguessable, so a per-token cap protects a *known* token from
//     hammering without penalising an office behind one IP.
//  3. refresh keys on the refresh token (body or cookie).
//
// Token-derived keys are hashed: they are bearer credentials and must not sit in
// the rate-limit store (Redis) in the clear. The invitationId in case 1 is a
// plain UUID, not a secret, so it is used as-is.
export function candidateThrottleKey(req: {
  headers?: Record<string, unknown>;
  body?: Record<string, unknown>;
  cookies?: Record<string, unknown>;
}): string | null {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const secret = process.env.CANDIDATE_JWT_ACCESS_SECRET;
    if (secret) {
      try {
        const payload = verify(auth.slice(7), secret);
        if (typeof payload === 'object' && payload && (payload as { subjectType?: unknown }).subjectType === 'candidate') {
          const sub = (payload as { sub?: unknown }).sub;
          if (typeof sub === 'string' && sub) return `cand:${sub}`;
        }
      } catch {
        // Expired/forged/wrong-secret -> fall through to IP. The auth guard will
        // reject it; here we just refuse to let it carve out its own bucket.
      }
    }
  }

  const bodyToken = req.body?.token;
  if (typeof bodyToken === 'string' && bodyToken) return `invtok:${hash(bodyToken)}`;

  const refresh = req.body?.refreshToken ?? req.cookies?.[CANDIDATE_REFRESH_COOKIE];
  if (typeof refresh === 'string' && refresh) return `crt:${hash(refresh)}`;

  return null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}
