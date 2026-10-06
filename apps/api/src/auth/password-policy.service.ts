import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuditService, TENANT_SECURITY_FLOOR, TenantPrismaService, loadTenantSecurityPolicy } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

// Have I Been Pwned "Pwned Passwords" k-anonymity range API: only the first 5 hex chars of the
// password's SHA-1 leave this process; the match is done locally against the returned suffixes.
// Add-Padding makes every response a similar size so the prefix's popularity does not leak.
const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PWNED_TIMEOUT_MS = 3000;

export const BREACHED_PASSWORD_MESSAGE =
  'This password has appeared in a known data breach, so it is easy to guess. Please choose a different one.';

export interface NewPasswordHash {
  passwordHash: string;
  // true when the breached check could not run (see hashNewPassword).
  passwordRecheckPending: boolean;
}

// The YukthiX password floor (YX-IAM-08, Q8): >= 12 characters (or the company's stricter
// minimum), <= 128, not in a known breach corpus, argon2id-hashed. No composition rules and no
// forced periodic rotation (NIST SP 800-63B). Applied wherever a person CHOOSES a password:
// set (admin create / first-run setup), change and reset.
@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async minLengthFor(organizationId: string | null): Promise<number> {
    if (!organizationId) return TENANT_SECURITY_FLOOR.passwordMinLength;
    const policy = await loadTenantSecurityPolicy(this.tenantPrisma, organizationId);
    return Math.max(TENANT_SECURITY_FLOOR.passwordMinLength, policy.passwordMinLength);
  }

  // Validates a chosen password and returns its hash.
  //
  // Breach-service outage policy -- FAIL OPEN, FLAGGED: if HIBP cannot be reached the password is
  // accepted (length rules still apply), the account is flagged `password_recheck_pending`, and the
  // next successful sign-in re-checks it. Failing closed would let a third-party outage block every
  // password reset, i.e. lock people out of their accounts; the length floor plus the re-check keeps
  // the exposure small and bounded.
  async hashNewPassword(password: string, organizationId: string | null): Promise<NewPasswordHash> {
    const minLength = await this.minLengthFor(organizationId);
    // Code points, not UTF-16 units, so an emoji counts as one character (63B §5.1.1.2).
    const length = [...password].length;
    if (length < minLength) {
      throw new BadRequestException(`Password must be at least ${minLength} characters long`);
    }
    if (password.length > TENANT_SECURITY_FLOOR.passwordMaxLength) {
      throw new BadRequestException(`Password must be at most ${TENANT_SECURITY_FLOOR.passwordMaxLength} characters long`);
    }
    const breached = await this.isBreached(password);
    if (breached === true) {
      throw new BadRequestException(BREACHED_PASSWORD_MESSAGE);
    }
    return { passwordHash: await argon2.hash(password, { type: argon2.argon2id }), passwordRecheckPending: breached === null };
  }

  // true = in the corpus, false = not, null = could not tell (network error, timeout, bad status).
  async isBreached(password: string): Promise<boolean | null> {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(PWNED_RANGE_URL + prefix, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'YukthiX-password-check' },
        signal: AbortSignal.timeout(PWNED_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Breached-password check unavailable (HTTP ${res.status}); accepting and flagging for re-check`);
        return null;
      }
      const body = await res.text();
      // Lines are "SUFFIX:COUNT"; padding lines carry count 0 and are not real matches.
      return body.split('\n').some((line) => {
        const [candidate, count] = line.trim().split(':');
        return candidate === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn(`Breached-password check unavailable (${(error as Error).name}); accepting and flagging for re-check`);
      return null;
    }
  }

  // After a successful password sign-in by an account flagged at set time: re-run the check now
  // that the plaintext is in hand again. Clean -> clear the flag. Breached -> clear the flag, audit
  // it and tell the user to change it. Still unreachable -> leave the flag for next time.
  // Fire-and-forget from the caller; never throws.
  async recheckAfterLogin(
    user: { id: string; email: string; organizationId: string | null; role: string },
    password: string,
  ): Promise<void> {
    try {
      const breached = await this.isBreached(password);
      if (breached === null) return;
      const context = { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' };
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.user.update({ where: { id: user.id }, data: { passwordRecheckPending: false } }),
      );
      if (!breached) return;
      await this.audit.record(context, {
        actorUserId: user.id,
        action: 'password.breached_on_recheck',
        entityType: 'user',
        entityId: user.id,
      });
      await this.email.send({
        to: user.email,
        subject: 'Please change your YukthiX password',
        html:
          '<p>The password on your YukthiX account appears in a known data breach, so it is easy for others to guess.</p>' +
          '<p>Please change it now from <b>Me &rsaquo; Security</b>, choosing a password you do not use anywhere else.</p>',
        organizationId: user.organizationId ?? undefined,
      });
    } catch (error) {
      this.logger.error(`Password re-check failed for user ${user.id}`, error as Error);
    }
  }
}
