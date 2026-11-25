import { createHmac, hkdfSync } from 'crypto';

/**
 * Security review F10 (25 Nov 2026): a keyed hash whose key is derived from the API's own secret (HKDF, one key per
 * purpose, as the approval links do), never a constant in the code. Without the secret it throws, so a missing secret
 * can never fall back to a key an attacker can read in the source.
 */
export function keyedHash(purpose: string, value: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required for keyed hashes');
  const key = Buffer.from(hkdfSync('sha256', secret, 'yukthix', `keyed-hash:${purpose}`, 32));
  return createHmac('sha256', key).update(value).digest('hex');
}
