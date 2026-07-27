import { createHash, timingSafeEqual } from 'crypto';

// Refresh tokens are stored hashed so a database leak doesn't hand an attacker
// usable sessions. They were hashed with argon2, which is the wrong primitive
// for this input and was the single largest scaling limit in the product.
//
// Argon2 is deliberately slow and memory-hard so that brute-forcing a
// LOW-entropy human-chosen password is expensive. A refresh token is not that:
// it's a signed JWT carrying a random UUIDv4 familyId -- 122+ bits of entropy,
// plus an HMAC signature that can't be forged without the server secret. There
// is no brute-force to defend against, so argon2's cost bought nothing while
// charging, measured on the 2-vCPU production VM, 132ms and 64MiB PER LOGIN.
// That capped candidate logins at ~8/sec and is what produced the pool-timeout
// 503s under load (ADO #6809 originally blamed the connection pool; the pool
// was a symptom -- connections were held for the duration of the hash).
//
// SHA-256 gives the same protection against a database leak: the digest of a
// 122-bit random value is not invertible. Cost is ~5 microseconds.
//
// PASSWORDS MUST NOT USE THIS. Human-chosen passwords are exactly the
// low-entropy case argon2 exists for, and every password call site in this
// codebase stays on argon2.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Constant-time comparison so a timing side channel can't be used to recover a
// stored digest byte by byte. Returns false rather than throwing for any
// malformed stored value -- notably a legacy argon2 hash, which is not valid hex
// and therefore decodes to a buffer of the wrong length.
export function refreshTokenMatches(storedHash: string, token: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = createHash('sha256').update(token).digest();
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// A stored hash written by the pre-SHA-256 scheme. Such a row can never match,
// so callers treat it as an expired session rather than as evidence of token
// reuse -- otherwise the cutover would write a misleading
// auth.token_reuse_detected security event for every session that predates it.
// ponytail: delete this and its call sites once no argon2 rows remain; they age
// out with the refresh-token TTL (30 days staff, 1 day candidate).
export function isLegacyArgon2Hash(storedHash: string): boolean {
  return storedHash.startsWith('$argon2');
}
