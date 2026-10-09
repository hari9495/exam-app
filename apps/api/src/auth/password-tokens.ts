import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

// Founder decision, 8 Oct 2026: a "forgot password" link works for 15 minutes; a welcome or
// invitation link (someone setting their first password) works for 72 hours.
export const PASSWORD_RESET_EXPIRY_MINUTES = 15;
export const ACCOUNT_SETUP_EXPIRY_HOURS = 72;

export type PasswordTokenKind = 'reset' | 'setup';

/**
 * Issues a single-use set-password link token (only its sha256 is stored) and retires every
 * earlier unused one for the same person, so only the newest link in their inbox works.
 * Returns the raw token for the link.
 */
export async function issuePasswordToken(
  db: { passwordResetToken: Pick<Prisma.TransactionClient['passwordResetToken'], 'create' | 'updateMany'> },
  userId: string,
  kind: PasswordTokenKind,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const ttlMs = kind === 'setup' ? ACCOUNT_SETUP_EXPIRY_HOURS * 3_600_000 : PASSWORD_RESET_EXPIRY_MINUTES * 60_000;
  const now = new Date();
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  await db.passwordResetToken.create({ data: { userId, tokenHash, expiresAt: new Date(now.getTime() + ttlMs) } });
  return rawToken;
}
