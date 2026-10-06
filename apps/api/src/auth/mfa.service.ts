import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { createBase32Plugin, generateSecret } from '@otplib/core';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { verify as verifyTotp } from '@otplib/totp';
import { generateTOTP as totpUri } from '@otplib/uri';
import { base32 } from '@scure/base';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  AuditService,
  DEFAULT_SECURITY_POLICY,
  OrgSecretsCryptoService,
  PrismaService,
  SENSITIVE_ROLE_PERMISSIONS,
  SessionAssurance,
  TenantContext,
  TenantPrismaService,
  loadTenantSecurityPolicy,
  resolvePermissionGrants,
  revokeStaffSessions,
} from '@exam-platform/shared';
import { LOGIN_PROTECTION_REDIS } from './login-protection.service';
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, OtpService, maskMobile, normaliseMobileNumber } from './otp.service';
import type { OtpMobileChannel } from './otp-sender';
import { SessionsService } from './sessions.service';
import { assertStepUp } from '../rbac/permissions.guard';
import type { MfaFactor, MfaProofDto } from './dto/mfa.dto';

// Second factors, recovery codes and the pending-sign-in state between password/SSO and the
// second factor (P12 YX-IAM-01/02/03/11). Proven libraries only: @simplewebauthn/server for
// passkeys, otplib for TOTP; secrets AES-256-GCM encrypted at rest (OrgSecretsCryptoService);
// every token, code and challenge is single-use, short-lived and stored hashed or server-side.

export interface MfaUser {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
  status: string;
  permissionProfileId: string | null;
  mfaEnrolmentDueAt: Date;
  mobileNumber?: string | null;
  mobileVerifiedAt?: Date | null;
  passwordChangeRequired?: boolean;
}

// What is kept between the first factor and the second (Redis, 5 min, keyed by sha256(token)).
export interface PendingLogin {
  userId: string;
  method: 'password' | 'saml' | 'oidc' | 'otp_email' | 'otp_sms' | 'otp_whatsapp';
  orgSlug: string;
  identifier: string;
  breakGlass: boolean;
  deviceIdHash: string;
  // SSO only: the provider that vouched (sessions.identity_provider_id).
  identityProviderId?: string | null;
}

export const PENDING_LOGIN_TTL_SECONDS = 5 * 60;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const TOTP_SETUP_TTL_SECONDS = 10 * 60;
// otplib with Node's own crypto (HMAC, CSPRNG) and @scure/base's RFC 4648 base32.
const OTP_PLUGINS = { crypto: new NodeCryptoPlugin(), base32: createBase32Plugin({ name: 'scure', encode: base32.encode, decode: base32.decode }) };
// One 30 s step either side for clock drift (otplib epochTolerance is in seconds).
const TOTP_DRIFT_SECONDS = 30;
export const RECOVERY_CODE_COUNT = 10;
// Enrolling the FIRST factor needs a sign-in this recent (re-authentication, ASVS V2.5 / V3.7.1):
// a stolen refresh cookie or an old hijacked session cannot plant the attacker's authenticator.
export const FIRST_FACTOR_REAUTH_SECONDS = 10 * 60;
export const REAUTH_REQUIRED_CODE = 'REAUTH_REQUIRED';
// YukthiX staff (P12 Q7): a hardware-bound security key is their only factor -- no authenticator
// app, no recovery codes (both can be copied or phished).
export const isStaff = (user: { role: string }) => user.role === 'super_admin';
const pendingUserKey = (userId: string) => `auth:mfa:pending-user:${userId}`;
// 32 symbols (no 0/1/l/o) x 16 = 80 bits: offline guessing of the sha256 is out of reach.
const RECOVERY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const contextFor = (user: { organizationId: string | null; role: string }): TenantContext => ({
  organizationId: user.organizationId,
  isSuperAdmin: user.role === 'super_admin',
});
const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };

export function webauthnConfig() {
  const frontend = new URL(process.env.FRONTEND_URL ?? 'http://localhost:3000');
  return {
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'YukthiX',
    rpID: process.env.WEBAUTHN_RP_ID ?? frontend.hostname,
    origins: (process.env.WEBAUTHN_ORIGINS ?? frontend.origin).split(',').map((o) => o.trim()).filter(Boolean),
  };
}

export const normaliseRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

// The accepted TOTP time step, or null. Drift window: one step either side; `afterTimeStep` rejects
// any step at or before the last one accepted (a replayed code). Constant-time compare in otplib.
async function checkTotp(secret: string, token: string, afterTimeStep?: bigint | null): Promise<number | null> {
  const result = await verifyTotp({
    ...OTP_PLUGINS,
    secret,
    token,
    epochTolerance: TOTP_DRIFT_SECONDS,
    ...(afterTimeStep != null ? { afterTimeStep: Number(afterTimeStep) } : {}),
  });
  return result.valid ? result.timeStep : null;
}

function newRecoveryCode(): string {
  const chars = Array.from({ length: 16 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    @Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis,
    private readonly otp: OtpService,
  ) {}

  // Fail closed: without its store, no challenge can be checked, so no MFA step proceeds.
  private async store<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      this.logger.error('MFA store unavailable', error as Error);
      throw new ServiceUnavailableException('Two-step verification is temporarily unavailable. Please try again shortly.');
    }
  }

  // The account behind a validated token or pending sign-in. Super-admin context: the caller has
  // proven who they are with a signed token / server-side pending state, and the user id is pinned.
  async loadUser(userId: string): Promise<MfaUser | null> {
    return this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          organizationId: true,
          role: true,
          status: true,
          permissionProfileId: true,
          mfaEnrolmentDueAt: true,
          mobileNumber: true,
          mobileVerifiedAt: true,
          passwordChangeRequired: true,
        },
      }),
    );
  }

  async activeFactors(user: Pick<MfaUser, 'id' | 'organizationId' | 'role'>) {
    return this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.authenticator.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { id: true, type: true, label: true, createdAt: true, lastUsedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  // The factors this account may actually use: for YukthiX staff, security keys (passkeys) only.
  async usableFactors(user: Pick<MfaUser, 'id' | 'organizationId' | 'role'>) {
    const factors = await this.activeFactors(user);
    return isStaff(user) ? factors.filter((f) => f.type === 'passkey') : factors;
  }

  async hasFactor(user: Pick<MfaUser, 'id' | 'organizationId' | 'role'>): Promise<boolean> {
    return (await this.usableFactors(user)).length > 0;
  }

  // In a sensitive role (P12 §3; YukthiX staff always), or the company requires MFA for everyone.
  async isSensitive(user: Pick<MfaUser, 'id' | 'organizationId' | 'role' | 'permissionProfileId'>): Promise<boolean> {
    if (user.role === 'super_admin') return true;
    // Role grants count too (P02 YX-SEC-03): a Payroll Admin grant makes its holder a sensitive role.
    const grants = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { ...user, userId: user.id }, [...SENSITIVE_ROLE_PERMISSIONS]);
    return SENSITIVE_ROLE_PERMISSIONS.some((key) => grants.has(key));
  }

  async mfaRequiredFor(user: MfaUser): Promise<boolean> {
    if (user.organizationId && (await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId)).mfaScope === 'all') return true;
    return this.isSensitive(user);
  }

  private async allowedFactors(user: MfaUser): Promise<string[]> {
    return user.organizationId ? (await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId)).allowedFactors : DEFAULT_SECURITY_POLICY.allowedFactors;
  }

  async status(user: MfaUser, session: SessionAssurance) {
    const [factors, recoveryCodesRemaining, required] = await Promise.all([
      this.activeFactors(user),
      this.tenantPrisma.forTenant(contextFor(user), (tx) => tx.recoveryCode.count({ where: { userId: user.id, usedAt: null } })),
      this.mfaRequiredFor(user),
    ]);
    return {
      factors,
      recoveryCodesRemaining,
      required,
      enrolmentDueAt: user.mfaEnrolmentDueAt,
      allowedFactors: await this.allowedFactors(user),
      assuranceLevel: session.assuranceLevel,
      mfaVerifiedAt: session.mfaVerifiedAt,
      mobileNumber: user.mobileVerifiedAt ? (user.mobileNumber ?? null) : null,
    };
  }

  // ---- pending sign-in (between first and second factor) -----------------------------------

  async createPendingLogin(pending: PendingLogin): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const hash = sha256(token);
    // Indexed per user, so a password reset / MFA reset can cancel sign-ins already half done.
    await this.store(async () => {
      const replies = await this.redis
        .multi()
        .set(`auth:mfa:pending:${hash}`, JSON.stringify(pending), 'EX', PENDING_LOGIN_TTL_SECONDS)
        .sadd(pendingUserKey(pending.userId), hash)
        .expire(pendingUserKey(pending.userId), PENDING_LOGIN_TTL_SECONDS)
        .exec();
      if (!replies || replies.some(([error]) => error)) throw new Error('pending sign-in MULTI failed');
    });
    return token;
  }

  // Every half-finished sign-in of `userId` (first factor done, second owed) stops working: after a
  // password reset or an MFA reset, a token won with the old credentials must not complete.
  async cancelPendingLogins(userId: string): Promise<void> {
    const hashes = await this.store(() => this.redis.smembers(pendingUserKey(userId)));
    const keys = hashes.flatMap((h) => [`auth:mfa:pending:${h}`, `auth:mfa:chal:login:${h}`, `auth:otp:mfa:${h}`]);
    await this.store(() => this.redis.del(pendingUserKey(userId), ...keys));
  }

  // The pending sign-in for `token`, only from the device that started it.
  async loadPendingLogin(token: string, deviceId: string): Promise<PendingLogin | null> {
    const raw = await this.store(() => this.redis.get(`auth:mfa:pending:${sha256(token)}`));
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingLogin;
    return sameHash(pending.deviceIdHash, sha256(deviceId)) ? pending : null;
  }

  // Single use: exactly one caller wins the delete, so two racing proofs cannot both sign in.
  async consumePendingLogin(token: string): Promise<boolean> {
    const hash = sha256(token);
    return (await this.store(() => this.redis.del(`auth:mfa:pending:${hash}`, `auth:mfa:chal:login:${hash}`))) > 0;
  }

  async loginPasskeyOptions(token: string, user: MfaUser) {
    return this.authenticationOptions(user, `auth:mfa:chal:login:${sha256(token)}`);
  }

  async takeLoginChallenge(token: string): Promise<string | null> {
    return this.store(() => this.redis.getdel(`auth:mfa:chal:login:${sha256(token)}`));
  }

  async stepUpPasskeyOptions(user: MfaUser, sessionId: string) {
    return this.authenticationOptions(user, `auth:mfa:chal:stepup:${sessionId}`);
  }

  async takeStepUpChallenge(sessionId: string): Promise<string | null> {
    return this.store(() => this.redis.getdel(`auth:mfa:chal:stepup:${sessionId}`));
  }

  private async authenticationOptions(user: MfaUser, challengeKey: string) {
    const passkeys = await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.authenticator.findMany({ where: { userId: user.id, type: 'passkey', revokedAt: null }, select: { credentialId: true, transports: true } }),
    );
    if (passkeys.length === 0) throw new BadRequestException('No passkey is registered for this account');
    const { rpID } = webauthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: passkeys.map((p) => ({ id: p.credentialId!, transports: p.transports as AuthenticatorTransportFuture[] })),
    });
    await this.store(() => this.redis.set(challengeKey, options.challenge, 'EX', CHALLENGE_TTL_SECONDS));
    return options;
  }

  // ---- verifying a second factor -----------------------------------------------------------

  // The factor that proved itself, or null. Replays fail: a TOTP time step is accepted once
  // (conditional update), a passkey challenge is single-use and its counter may not go back, a
  // recovery code is burnt by the same statement that checks it.
  async verifyProof(user: MfaUser, proof: MfaProofDto, passkeyChallenge: string | null): Promise<MfaFactor | null> {
    const ctx = contextFor(user);
    if (isStaff(user) && proof.factor !== 'passkey') return null; // Q7: security key only
    if (proof.factor === 'totp') {
      if (!proof.code || !/^\d{6}$/.test(proof.code)) return null;
      const totp = await this.tenantPrisma.forTenant(ctx, (tx) =>
        tx.authenticator.findFirst({ where: { userId: user.id, type: 'totp', revokedAt: null } }),
      );
      if (!totp) return null;
      const step = await checkTotp(this.crypto.decrypt(totp.secretEncrypted!), proof.code, totp.totpLastStep);
      if (step === null) return null;
      // Compare-and-set on the last step: a concurrent replay of the same code loses.
      const { count } = await this.tenantPrisma.forTenant(ctx, (tx) =>
        tx.authenticator.updateMany({
          where: { id: totp.id, revokedAt: null, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step, lastUsedAt: new Date() },
        }),
      );
      return count === 1 ? 'totp' : null;
    }

    if (proof.factor === 'recovery_code') {
      const { count } = await this.tenantPrisma.forTenant(ctx, (tx) =>
        tx.recoveryCode.updateMany({
          where: { userId: user.id, codeHash: sha256(normaliseRecoveryCode(proof.code ?? '')), usedAt: null },
          data: { usedAt: new Date() },
        }),
      );
      if (count !== 1) return null;
      await this.audit.record(ctx, { actorUserId: user.id, action: 'mfa.recovery_code_used', entityType: 'user', entityId: user.id });
      this.sessions.notifySecurityChange(user, 'A recovery code was used on your YukthiX account', 'One of your recovery codes was just used to sign in or to confirm an action.');
      return 'recovery_code';
    }

    if (!passkeyChallenge || !proof.credential) return null;
    const passkey = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.authenticator.findFirst({ where: { userId: user.id, type: 'passkey', credentialId: proof.credential!.id, revokedAt: null } }),
    );
    if (!passkey) return null;
    const { rpID, origins } = webauthnConfig();
    let newCounter: number;
    try {
      const verification = await verifyAuthenticationResponse({
        response: proof.credential as unknown as AuthenticationResponseJSON,
        expectedChallenge: passkeyChallenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId!,
          publicKey: new Uint8Array(passkey.publicKey!),
          counter: Number(passkey.signCount),
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
      if (!verification.verified) return null;
      newCounter = verification.authenticationInfo.newCounter;
    } catch {
      return null; // tampered, wrong origin / RP, wrong challenge, or a counter that went back
    }
    // Compare-and-set on the counter: a concurrent replay of the same assertion loses.
    const { count } = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.authenticator.updateMany({ where: { id: passkey.id, revokedAt: null, signCount: passkey.signCount }, data: { signCount: newCounter, lastUsedAt: new Date() } }),
    );
    return count === 1 ? 'passkey' : null;
  }

  // Marks the session as AAL2 proven now with `factor` (sign-in enrolment, step-up).
  async elevateSession(user: MfaUser, sessionId: string, factor: string): Promise<Date> {
    const now = new Date();
    await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { assuranceLevel: 'aal2', mfaVerifiedAt: now, mfaMethod: factor } }),
    );
    return now;
  }

  // ---- enrolment ---------------------------------------------------------------------------

  // Adding a factor is a security change. With one enrolled it needs a fresh step-up. The FIRST one
  // needs a fresh sign-in (re-authentication): a stolen refresh cookie or an old hijacked session
  // cannot plant the attacker's own authenticator (ASVS V2.5 / V3.7.1).
  private async assertMayEnrol(user: MfaUser, session: SessionAssurance, type: 'passkey' | 'totp') {
    if (isStaff(user) && type !== 'passkey') {
      throw new BadRequestException('YukthiX staff accounts use a hardware security key only');
    }
    if (!(await this.allowedFactors(user)).includes(type)) {
      throw new BadRequestException(`Your organisation does not allow ${type === 'totp' ? 'authenticator apps' : 'passkeys'}`);
    }
    const factors = await this.usableFactors(user);
    if (factors.length > 0) {
      assertStepUp({ session });
    } else if (!session.authenticatedAt || Date.now() - session.authenticatedAt.getTime() > FIRST_FACTOR_REAUTH_SECONDS * 1000) {
      throw new ForbiddenException({
        statusCode: 403,
        code: REAUTH_REQUIRED_CODE,
        message: 'For your security, sign in again before setting up two-step verification.',
      });
    }
    return factors;
  }

  async startTotp(user: MfaUser, session: SessionAssurance, sessionId: string) {
    const factors = await this.assertMayEnrol(user, session, 'totp');
    if (factors.some((f) => f.type === 'totp')) throw new ConflictException('An authenticator app is already set up. Remove it first.');
    const secret = generateSecret(OTP_PLUGINS); // 20 random bytes (RFC 4226 recommendation)
    await this.store(() => this.redis.set(`auth:mfa:totp-setup:${sessionId}`, this.crypto.encrypt(secret), 'EX', TOTP_SETUP_TTL_SECONDS));
    return { secret, otpauthUrl: totpUri({ issuer: webauthnConfig().rpName, label: user.email, secret }) };
  }

  async confirmTotp(user: MfaUser, session: SessionAssurance, sessionId: string, code: string, label?: string) {
    await this.assertMayEnrol(user, session, 'totp');
    const encrypted = await this.store(() => this.redis.get(`auth:mfa:totp-setup:${sessionId}`));
    if (!encrypted) throw new BadRequestException('Authenticator setup has expired. Start again.');
    const step = await checkTotp(this.crypto.decrypt(encrypted), code);
    if (step === null) throw new BadRequestException('That code is not right. Check the time on your phone and try again.');
    if ((await this.store(() => this.redis.del(`auth:mfa:totp-setup:${sessionId}`))) !== 1) {
      throw new BadRequestException('Authenticator setup has expired. Start again.');
    }
    await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.authenticator.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          type: 'totp',
          label: label ?? 'Authenticator app',
          secretEncrypted: encrypted,
          totpLastStep: step,
          lastUsedAt: new Date(),
        },
      }),
    );
    return this.afterEnrolment(user, sessionId, 'totp');
  }

  async passkeyRegistrationOptions(user: MfaUser, session: SessionAssurance, sessionId: string) {
    await this.assertMayEnrol(user, session, 'passkey');
    const existing = await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.authenticator.findMany({ where: { userId: user.id, type: 'passkey', revokedAt: null }, select: { credentialId: true, transports: true } }),
    );
    const { rpName, rpID } = webauthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.credentialId!, transports: p.transports as AuthenticatorTransportFuture[] })),
      // Staff (Q7): a roaming security key, with user verification.
      authenticatorSelection: isStaff(user)
        ? { authenticatorAttachment: 'cross-platform', residentKey: 'preferred', userVerification: 'required' }
        : { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.store(() => this.redis.set(`auth:mfa:chal:reg:${sessionId}`, options.challenge, 'EX', CHALLENGE_TTL_SECONDS));
    return options;
  }

  async registerPasskey(user: MfaUser, session: SessionAssurance, sessionId: string, credential: unknown, label?: string) {
    await this.assertMayEnrol(user, session, 'passkey');
    const challenge = await this.store(() => this.redis.getdel(`auth:mfa:chal:reg:${sessionId}`));
    if (!challenge) throw new BadRequestException('Passkey setup has expired. Start again.');
    const { rpID, origins } = webauthnConfig();
    let info;
    try {
      const verification = await verifyRegistrationResponse({
        response: credential as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
      info = verification.verified ? verification.registrationInfo : undefined;
    } catch {
      info = undefined;
    }
    if (!info) throw new BadRequestException('This passkey could not be verified. Try again.');
    // Staff (Q7): hardware-bound only -- a synced (multi-device) passkey can be copied off the device.
    if (isStaff(user) && (info.credentialDeviceType !== 'singleDevice' || info.credentialBackedUp)) {
      throw new BadRequestException('YukthiX staff accounts need a hardware security key, not a synced passkey');
    }
    try {
      await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
        tx.authenticator.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            type: 'passkey',
            label: label ?? 'Passkey',
            credentialId: info.credential.id,
            publicKey: Buffer.from(info.credential.publicKey),
            signCount: info.credential.counter,
            transports: info.credential.transports ?? [],
            lastUsedAt: new Date(),
          },
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('This passkey is already registered');
      throw error;
    }
    return this.afterEnrolment(user, sessionId, 'passkey');
  }

  // First factor: recovery codes (shown once; never for staff); the session becomes AAL2 as
  // 'enrolment', which meets the MFA floor but is NOT a step-up; every other session and
  // half-finished sign-in of the account ends (P12 §6 flow 1). The owner is told at once.
  private async afterEnrolment(user: MfaUser, sessionId: string, factor: 'passkey' | 'totp') {
    const first = (await this.usableFactors(user)).length === 1;
    const recoveryCodes = first && !isStaff(user) ? await this.replaceRecoveryCodes(user) : undefined;
    await this.elevateSession(user, sessionId, 'enrolment');
    let revoked = 0;
    if (first) {
      revoked = await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
        revokeStaffSessions(tx, { userId: user.id, id: { not: sessionId } }, 'mfa_enrolled'),
      );
      await this.cancelPendingLogins(user.id);
    }
    await this.audit.record(contextFor(user), {
      actorUserId: user.id,
      action: 'mfa.enrolled',
      entityType: 'user',
      entityId: user.id,
      metadata: { factor, first, otherSessionsRevoked: revoked },
    });
    this.sessions.notifySecurityChange(
      user,
      'Two-step verification added to your YukthiX account',
      `A new ${factor === 'totp' ? 'authenticator app' : 'passkey'} was added to your account${first ? ', and every other session was signed out' : ''}.`,
    );
    return { factor, recoveryCodes };
  }

  // ---- recovery codes and removal ----------------------------------------------------------

  private async replaceRecoveryCodes(user: MfaUser): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await this.tenantPrisma.forTenant(contextFor(user), async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.createMany({
        data: codes.map((code) => ({ organizationId: user.organizationId, userId: user.id, codeHash: sha256(normaliseRecoveryCode(code)) })),
      });
    });
    return codes;
  }

  async regenerateRecoveryCodes(user: MfaUser): Promise<{ recoveryCodes: string[] }> {
    if (isStaff(user)) throw new BadRequestException('YukthiX staff accounts do not use recovery codes. Register a second security key instead.');
    if (!(await this.hasFactor(user))) throw new BadRequestException('Set up a passkey or an authenticator app first');
    const recoveryCodes = await this.replaceRecoveryCodes(user);
    await this.audit.record(contextFor(user), { actorUserId: user.id, action: 'mfa.recovery_codes_generated', entityType: 'user', entityId: user.id });
    this.sessions.notifySecurityChange(user, 'New recovery codes for your YukthiX account', 'New recovery codes were created for your account; the old ones no longer work.');
    return { recoveryCodes };
  }

  // The last factor may go only where MFA is not required for this account.
  async removeFactor(user: MfaUser, authenticatorId: string): Promise<void> {
    const factors = await this.activeFactors(user);
    const target = factors.find((f) => f.id === authenticatorId);
    if (!target) throw new NotFoundException('Factor not found');
    const usable = await this.usableFactors(user);
    if (usable.length === 1 && usable[0].id === target.id && (await this.mfaRequiredFor(user))) {
      throw new BadRequestException('Two-step verification is required for your account. Add another factor before removing this one.');
    }
    await this.tenantPrisma.forTenant(contextFor(user), async (tx) => {
      await tx.authenticator.updateMany({ where: { id: target.id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (factors.length === 1) await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
    });
    await this.audit.record(contextFor(user), {
      actorUserId: user.id,
      action: 'mfa.removed',
      entityType: 'authenticator',
      entityId: target.id,
      metadata: { factor: target.type },
    });
    this.sessions.notifySecurityChange(user, 'Two-step verification removed from your YukthiX account', `A ${target.type === 'totp' ? 'authenticator app' : 'passkey'} was removed from your account.`);
  }

  // ---- verified mobile number (OTP sign-in by mobile, SMS / WhatsApp fallback factor) ------

  // A number signs in or receives fallback codes only once a code sent to it comes back. Adding
  // or removing one is a security change: with a factor enrolled it needs a fresh step-up, so a
  // hijacked session cannot route codes to the attacker's phone.
  private async assertMayChangeMobile(user: MfaUser, session: SessionAssurance) {
    if (await this.hasFactor(user)) assertStepUp({ session });
  }

  private mobileKey = (sessionId: string) => `auth:otp:mobile:${sessionId}`;

  async startMobileVerification(user: MfaUser, session: SessionAssurance, sessionId: string, raw: string, channel: OtpMobileChannel, ip: string | null) {
    const mobileNumber = normaliseMobileNumber(raw);
    if (!mobileNumber) throw new BadRequestException('Enter a valid mobile number, with the country code if it is not an Indian number');
    if (!(await this.otp.channelAvailable(channel, user.organizationId))) throw new BadRequestException('Codes by text message are not available right now');
    await this.assertMayChangeMobile(user, session);
    await this.otp.reserveSend(`mobile\u0000${user.id}`, ip);
    const code = await this.otp.issue(this.mobileKey(sessionId), { userId: user.id, mobileNumber });
    // No email fallback: the code proves this number.
    this.otp.deliver(channel, mobileNumber, code, 'mobile', user.organizationId, { userId: user.id });
    // YX-IAM-10: every code sent is on record (SMS-pumping / targeting signal).
    await this.audit.record(contextFor(user), {
      actorUserId: user.id,
      action: 'user.mobile_verification_started',
      entityType: 'user',
      entityId: user.id,
      metadata: { mobile: maskMobile(mobileNumber), channel, ip },
    });
    return { mobileNumber, expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  async confirmMobile(user: MfaUser, session: SessionAssurance, sessionId: string, code: string) {
    await this.assertMayChangeMobile(user, session);
    const proven = await this.otp.check(this.mobileKey(sessionId), code);
    if (!proven || proven.userId !== user.id) throw new BadRequestException('That code is not right or has expired. Ask for a new one.');
    try {
      await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
        tx.user.update({ where: { id: user.id }, data: { mobileNumber: proven.mobileNumber, mobileVerifiedAt: new Date() } }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('This mobile number is already used by another account in your organisation');
      throw error;
    }
    await this.audit.record(contextFor(user), {
      actorUserId: user.id,
      action: 'user.mobile_verified',
      entityType: 'user',
      entityId: user.id,
      metadata: { mobile: maskMobile(proven.mobileNumber) },
    });
    this.sessions.notifySecurityChange(user, 'Mobile number added to your YukthiX account', `The mobile number ${maskMobile(proven.mobileNumber)} was verified on your account and can now receive sign-in codes.`);
    return { mobileNumber: proven.mobileNumber };
  }

  async removeMobile(user: MfaUser, session: SessionAssurance): Promise<void> {
    if (!user.mobileNumber) throw new NotFoundException('No mobile number is set');
    await this.assertMayChangeMobile(user, session);
    await this.tenantPrisma.forTenant(contextFor(user), (tx) =>
      tx.user.update({ where: { id: user.id }, data: { mobileNumber: null, mobileVerifiedAt: null } }),
    );
    await this.audit.record(contextFor(user), {
      actorUserId: user.id,
      action: 'user.mobile_removed',
      entityType: 'user',
      entityId: user.id,
      metadata: { mobile: maskMobile(user.mobileNumber) },
    });
    this.sessions.notifySecurityChange(user, 'Mobile number removed from your YukthiX account', `The mobile number ${maskMobile(user.mobileNumber)} was removed from your account.`);
  }
}
