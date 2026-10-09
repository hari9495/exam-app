import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash, randomUUID, timingSafeEqual } from 'crypto';
// argon2 above is retained deliberately: it still hashes PASSWORDS (lines 54,
// 112), which are the low-entropy input it exists for. Only refresh tokens moved
// to SHA-256 -- see refresh-token-hash.ts for why.
import {
  DEFAULT_SECURITY_POLICY,
  NETWORK_NOT_ALLOWED_MESSAGE,
  OTP_FALLBACK_BARRED_PERMISSIONS,
  PrismaService,
  hashRefreshToken,
  ipAllowedForSurface,
  isLegacyArgon2Hash,
  loadTenantSecurityPolicy,
  refreshTokenMatches,
  resolvePermissionGrants,
  revokeStaffSessions,
  staffDeskIpAllowed,
} from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE } from '@exam-platform/shared';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ClientMeta, LoginMethod, SessionUser, SessionsService } from './sessions.service';
import { ANY_COMPANY, LOGIN_PROTECTION_REDIS, LockoutSettings, LoginAttempt, LoginBlock, LoginProtectionService, TooManyLoginAttemptsException } from './login-protection.service';
import { PasswordPolicyService } from './password-policy.service';
import { MfaService, MfaUser, PENDING_LOGIN_TTL_SECONDS, PendingLogin, isStaff } from './mfa.service';
import { MfaLoginDto, MfaProofDto } from './dto/mfa.dto';
import { MfaOtpSendDto, OtpStartDto, OtpVerifyDto } from './dto/otp.dto';
import { OTP_CHANNELS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, OtpChannel, OtpService, parseOtpIdentifier } from './otp.service';
import { PlatformLoginDto, SelectCompanyDto } from './dto/login.dto';
import { CompanyCard, CompanyScopeService } from './company-scope';
import { SocialIdentity, SocialProvider, isSocialProvider } from './social-sign-in';
import { emailDomain } from './identity-providers';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Signed in, no second factor enrolled. `mfa` is set when MFA is required for this account:
// the client prompts enrolment, which becomes mandatory at `enrolmentDueAt` (YX-IAM-01, P12 §8).
export interface SignedIn extends TokenPair {
  mfa?: { required: true; enrolmentDueAt: Date };
  // The signed "last company on this device" cookie value (set by signInResponse, never in the body).
  rememberCompany?: string;
}

// First factor accepted; the second is still owed (no session, no tokens yet).
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  factors: string[];
  expiresInSeconds: number;
}

// The credential matched accounts in several companies (email-first sign-in): the person picks one
// with the single-use, device-bound token; only then is that account signed in (and its MFA asked).
export interface CompanyChoice {
  selectionRequired: true;
  selectionToken: string;
  companies: ({ id: string } & CompanyCard)[];
  expiresInSeconds: number;
}

export type LoginOutcome = SignedIn | MfaChallenge | CompanyChoice;

// A code was (or, for an unknown account, seemingly was) sent. Identical for every identifier.
export interface OtpSent {
  otpToken?: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export const OTP_SIGN_IN_OFF_MESSAGE = 'Sign-in with a one-time code is not turned on for this organisation';
const OTP_INVALID_MESSAGE = 'That code is not right or has expired. Ask for a new one.';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sameHash = (a: string | undefined, b: string) =>
  typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// One live sign-in code per (organisation, identifier): a new request replaces the previous code.
const otpSignInKey = (orgSlug: string, identifier: string) => `auth:otp:signin:${sha256(`${orgSlug}\u0000${identifier}`)}`;
const otpMfaKey = (mfaToken: string) => `auth:otp:mfa:${sha256(mfaToken)}`;
export const isMfaChallenge = (outcome: LoginOutcome): outcome is MfaChallenge => 'mfaRequired' in outcome;
// Not signed in yet: a second factor or a company choice is still owed.
export const isPending = (outcome: LoginOutcome): outcome is MfaChallenge | CompanyChoice => 'mfaRequired' in outcome || 'selectionRequired' in outcome;

// Email-first sign-in (founder decision 7 Oct 2026). One person has one account per company (P12 §3);
// with no company named, the credential is checked against each active account with that email /
// mobile number -- at most this many, so the work per attempt stays bounded.
export const MAX_COMPANY_ACCOUNTS = 10;
// Lockout scope for an email / mobile number across every company (W-016: see LoginProtectionService).
export { ANY_COMPANY };
export const COMPANY_PICK_TTL_SECONDS = 2 * 60;
// Lockout scope of the YukthiX platform staff sign-in (no company slug is ever empty).
export const PLATFORM_SCOPE = '';
const pickKey = (token: string) => `auth:pick:${sha256(token)}`;
const socialCodeKey = (code: string) => `auth:social:code:${sha256(code)}`;
export const SOCIAL_CODE_TTL_SECONDS = 60;
const EXPIRED_MESSAGE = 'Your sign-in has expired. Please sign in again.';

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  organizationId: true,
  role: true,
  status: true,
  permissionProfileId: true,
  passwordHash: true,
  passwordRecheckPending: true,
  mobileNumber: true,
  mobileVerifiedAt: true,
  organization: { select: { slug: true, name: true, logoPath: true, status: true } },
} as const;
type Account = {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
  status: string;
  permissionProfileId: string | null;
  passwordHash: string;
  passwordRecheckPending: boolean;
  mobileNumber: string | null;
  mobileVerifiedAt: Date | null;
  organization: { slug: string; name: string; logoPath: string | null; status: string } | null;
};
type Policy = Awaited<ReturnType<typeof loadTenantSecurityPolicy>>;
interface Candidate {
  account: Account;
  policy: Policy;
  // Lowercased company slug: the account's own lockout scope, as with an orgSlug.
  slug: string;
  listedBreakGlass: boolean;
  blocked: { scope: string } | null;
}
// Kept in Redis (2 min) under sha256(token) while the person picks a company.
interface CompanyPick {
  method: PendingLogin['method'];
  identifier: string;
  deviceIdHash: string;
  // proof: sha256 of the password hash that was verified (a reset in between voids the choice).
  accounts: { userId: string; choice: string; proof: string }[];
  // Google / Microsoft: the subject to link once the picked account has signed in.
  subject?: string;
}
// "Continue with Google / Microsoft": what the provider proved, kept 60 s under sha256(code) for the
// browser that started it (AuthService.socialSignIn).
export interface SocialProof extends SocialIdentity {
  provider: SocialProvider;
  scopeSlug: string | null;
  deviceIdHash: string;
}
type ParsedIdentifier = { kind: 'email' | 'mobile'; value: string };

const PASSWORD_RESET_EXPIRY_MINUTES = 15;
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';
const INVALID_CREDENTIALS = 'Invalid credentials';

// Verified against when no account matched, so an unknown email costs the same argon2 work as
// a wrong password and response timing cannot enumerate accounts. Same default parameters as
// every real hash. Computed once, lazily.
let dummyPasswordHash: Promise<string> | undefined;
const getDummyPasswordHash = () => (dummyPasswordHash ??= argon2.hash(randomBytes(32).toString('hex')));

// How long after a refresh token is rotated out that presenting it is treated as a benign
// concurrent-refresh race rather than reuse of a stolen token.
//
// Why this exists: 119 `auth.token_reuse_detected` events across 18 ordinary staff users in
// 10 days, 72 of them within 10 seconds of another for the SAME user. That is not 119
// stolen tokens; it is two browser tabs each refreshing, the second arriving with the token
// the first had just rotated. Reuse detection then revoked the whole family and logged the
// user out of every tab. The single-tab client already collapses concurrent refreshes onto
// one in-flight promise; a useRef cannot reach across tabs, so the race is inherently
// cross-tab and has to be tolerated server-side.
//
// Why 10 seconds and not more: a stolen token replayed within the window yields only what
// the legitimate session already holds, and only once (the row stays revoked; the forgiven
// caller gets a fresh rotation, which itself rotates the current live token). Beyond the
// window, replay is treated exactly as before -- family revoked, incident audited.
const REFRESH_REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly sessions: SessionsService,
    private readonly loginProtection: LoginProtectionService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly mfa: MfaService,
    private readonly otp: OtpService,
    private readonly companyScope: CompanyScopeService,
    @Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis,
  ) {}

  // Password sign-in (YX-IAM-06/07/10). With a company (orgSlug, web address or remembered company):
  // that company's account, as before. Without one: email-first across every company. Either way an
  // unknown organisation, a suspended one, a network outside the desk allow-list, an unknown email /
  // number and a wrong password are indistinguishable to the caller -- same 401, same argon2 cost --
  // so neither accounts nor organisations (or their settings) can be enumerated; and every attempt,
  // including blocked ones, lands in login_events.
  async login(dto: LoginDto, meta: ClientMeta): Promise<LoginOutcome> {
    const parsed: ParsedIdentifier | null = dto.email !== undefined ? { kind: 'email', value: dto.email.trim().toLowerCase() } : parseOtpIdentifier(dto.identifier ?? '');
    if (!parsed) throw new BadRequestException('Enter an email address or a mobile number');
    const slug = dto.organizationSlug?.trim();
    return slug ? this.loginToCompany(slug, parsed, dto.password, meta) : this.loginAnyCompany(parsed, dto.password, meta);
  }

  // YukthiX platform staff (P12 Q7) sign in here and only here; no company path reaches them (W-005).
  // Only an account with no company and the super_admin role is looked up, so an unknown email, a
  // company account and a wrong password all answer the same 401 after the same argon2 work. Lockout
  // under YukthiX's settings; the second factor is a hardware security key only (MfaService).
  async loginPlatformStaff(dto: PlatformLoginDto, meta: ClientMeta): Promise<LoginOutcome> {
    const identifier = dto.email.trim().toLowerCase();
    const attempt = { identifier, method: 'password' as const, meta };
    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findFirst({ where: { email: identifier, role: 'super_admin', organizationId: null } }),
    );
    const reserved = await this.loginProtection.reserve(PLATFORM_SCOPE, identifier, meta.ip, { deviceId: meta.deviceId, lockout: await this.lockoutFor(null) });
    if (reserved.block) {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: null, userId: user?.id ?? null, result: 'locked', reason: `${reserved.block.scope}_locked` });
      throw new TooManyLoginAttemptsException(reserved.block.retryAfterSeconds);
    }
    const passwordOk = await argon2.verify(user?.passwordHash ?? (await getDummyPasswordHash()), dto.password);
    if (!user || !passwordOk) return this.rejectLogin(PLATFORM_SCOPE, attempt, null, user, user ? 'bad_password' : 'unknown_user', reserved);
    if (user.status !== 'active') {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: null, userId: user.id, result: 'failed', reason: 'account_inactive' });
      throw new UnauthorizedException('This account has been deactivated');
    }
    await this.loginProtection.registerSuccess(PLATFORM_SCOPE, identifier, meta.ip);
    if (user.passwordRecheckPending) await this.passwordPolicy.recheckAfterLogin(user, dto.password);
    return this.continueAfterFirstFactor(user, { method: 'password', orgSlug: PLATFORM_SCOPE, identifier, breakGlass: false }, meta);
  }

  private async loginToCompany(slug: string, parsed: ParsedIdentifier, password: string, meta: ClientMeta): Promise<LoginOutcome> {
    const identifier = parsed.value;
    const orgSlug = slug.toLowerCase();
    const attempt = { identifier, method: 'password' as const, meta };

    const org = await this.prisma.organization.findUnique({ where: { slug } });
    const orgActive = Boolean(org && isOrganizationActive(org.status));
    const organizationId = orgActive ? org!.id : null;
    const policy = organizationId ? await loadTenantSecurityPolicy(this.tenantPrisma, organizationId) : DEFAULT_SECURITY_POLICY;

    // Desk IP allow-list (YX-IAM-09): refused like a wrong password, after the same work, and not
    // counted (no guess was checked). The admin sees the real reason in login activity.
    if (organizationId && !ipAllowedForSurface(policy, 'desk', meta.ip)) {
      await argon2.verify(await getDummyPasswordHash(), password);
      await this.sessions.recordLoginEvent({ ...attempt, organizationId, result: 'failed', reason: 'ip_not_allowed' });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = organizationId
      ? await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
          tx.user.findFirst({
            where:
              parsed.kind === 'email'
                ? { email: identifier, organizationId }
                : { mobileNumber: identifier, mobileVerifiedAt: { not: null }, organizationId },
          }),
        )
      : null;

    // Counted BEFORE the password is checked (atomic; a parallel burst cannot outrun the lock).
    // Break-glass accounts (YX-IAM-04) get the delay but not the long lock: their admins are
    // alerted instead, so nobody can keep them locked out during an SSO outage.
    // The company's lockout settings apply to every identifier under its slug -- real account or not,
    // organisation active or not -- so the lock behaviour reveals nothing about either.
    const listedBreakGlass = Boolean(user && policy.breakGlassUserIds.includes(user.id));
    // The identifier lock (W-016) holds this path as it holds email-first; a break-glass account is
    // never held by it (YX-IAM-04), as it is never held by its company's long lock.
    const lockedOut = async (block: LoginBlock): Promise<never> => {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: org?.id ?? null, userId: user?.id ?? null, result: 'locked', reason: `${block.scope}_locked` });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    };
    const block = listedBreakGlass ? null : await this.companyPathBlock(orgSlug, identifier, meta);
    if (block) return lockedOut(block);
    const lockout = await this.lockoutFor(org?.id ?? null);
    const reserved = await this.loginProtection.reserve(orgSlug, identifier, meta.ip, { deviceId: meta.deviceId, lockExempt: listedBreakGlass, lockout });
    if (reserved.block) return lockedOut(reserved.block);

    const passwordOk = await argon2.verify(user?.passwordHash ?? (await getDummyPasswordHash()), password);
    if (!user || !passwordOk) {
      const reason = orgActive ? (user ? 'bad_password' : 'unknown_user') : org ? 'organization_inactive' : 'unknown_organization';
      return this.rejectLogin(orgSlug, attempt, org?.id ?? null, user, reason, reserved);
    }

    // SSO-only (YX-IAM-04): password sign-in is off except for the named break-glass accounts. A
    // correct password from anyone else gets exactly the wrong-password response, so the switch
    // is no password oracle.
    const breakGlass = policy.ssoOnly && listedBreakGlass;
    if (policy.ssoOnly && !breakGlass) {
      return this.rejectLogin(orgSlug, attempt, organizationId, user, 'sso_only', reserved);
    }

    if (user.status !== 'active') {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId, userId: user.id, result: 'failed', reason: 'account_inactive' });
      throw new UnauthorizedException('This account has been deactivated');
    }
    // The password is right: its guess counter is cleared (the device is trusted only once the
    // whole sign-in, second factor included, has succeeded).
    await this.loginProtection.registerSuccess(orgSlug, identifier, meta.ip);

    // The password is proven: re-check one whose breach check could not run when it was set. Awaited
    // (bounded by the breach check's timeout; flagged accounts only): a password found breached now
    // must be changed before this very sign-in opens a session (YX-IAM-08).
    if (user.passwordRecheckPending) {
      await this.passwordPolicy.recheckAfterLogin(user, password);
    }
    return this.continueAfterFirstFactor(user, { method: 'password', orgSlug, identifier, breakGlass }, meta);
  }

  // Email-first (no company named). The attempt is counted atomically up front for the email /
  // number across companies; every active account with it (at most MAX_COMPANY_ACCOUNTS) is tried in
  // parallel, a dummy hash when there is none, so 0, 1 or many accounts cost the same and answer the
  // same. An account its company has locked (on its own page) is not tried at all. Wrong everywhere:
  // the email's identifier lock counts it (W-016), and a locked email answers 429 here as on a
  // company page. Right for one: signed in as with its orgSlug. Right for several: only now are
  // those companies listed, for the person to pick one.
  private async loginAnyCompany(parsed: ParsedIdentifier, password: string, meta: ClientMeta): Promise<LoginOutcome> {
    const identifier = parsed.value;
    const attempt = { identifier, method: 'password' as const, meta };
    const reserved = await this.loginProtection.reserve(ANY_COMPANY, identifier, meta.ip, { deviceId: meta.deviceId });
    if (reserved.block) {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: null, result: 'locked', reason: `${reserved.block.scope}_locked` });
      throw new TooManyLoginAttemptsException(reserved.block.retryAfterSeconds);
    }

    const candidates = await this.toCandidates(await this.accountsFor(parsed), identifier, meta);
    const open = candidates.filter((c) => !c.blocked);
    // ponytail: parallel verifies (<= 10) keep wall time near one argon2 on the libuv pool; pad to a
    // fixed count if timing across 1 vs many accounts ever needs to be exact.
    const hashes = open.length ? open.map((c) => c.account.passwordHash) : [await getDummyPasswordHash()];
    const proven = await Promise.all(hashes.map((hash) => argon2.verify(hash, password).catch(() => false)));
    const results = await Promise.all(
      open.map(async (c, i) => ({ c, reason: proven[i] ? await this.refusal(c.account, c.policy, 'password', identifier, meta.ip) : 'bad_password' })),
    );
    const winners = results.filter((r) => r.reason === null).map((r) => r.c);
    for (const c of candidates.filter((x) => x.blocked)) {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: c.account.organizationId, userId: c.account.id, result: 'locked', reason: `${c.blocked!.scope}_locked` });
    }

    if (!winners.length) {
      // Counted for the email only (reserved above; W-016), never under the accounts' companies, so
      // the lock is the same whether or not accounts have it. When it locks, their holders are told.
      const { locked } = await this.loginProtection.registerFailure(ANY_COMPANY, identifier, meta.ip, reserved);
      for (const { c, reason } of results) {
        await this.sessions.recordLoginEvent({
          ...attempt,
          organizationId: c.account.organizationId,
          userId: c.account.id,
          result: 'failed',
          reason: locked ? `${reason}+lockout_started` : reason!,
        });
        if (locked) this.alertLocked(c.account, meta, c.listedBreakGlass);
      }
      if (!candidates.length) await this.sessions.recordLoginEvent({ ...attempt, organizationId: null, result: 'failed', reason: 'unknown_user' });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Proven: the counters of the email and of each account it opens are cleared. Accounts in other
    // companies whose password differs are left alone (no failure counted, no event): the person
    // proved who they are, and other companies' admins should not see a failed sign-in for it.
    await this.loginProtection.registerSuccess(ANY_COMPANY, identifier, meta.ip);
    for (const w of winners) {
      await this.loginProtection.registerSuccess(w.slug, identifier, meta.ip);
      if (w.account.passwordRecheckPending) await this.passwordPolicy.recheckAfterLogin(w.account, password);
    }
    return winners.length === 1 ? this.continueAs(winners[0], 'password', identifier, meta) : this.offerCompanies(winners, 'password', identifier, meta);
  }

  // Every active company account with this email / verified mobile number, in an active company,
  // oldest first, capped. Never a YukthiX staff account (W-005): they sign in only through
  // loginPlatformStaff, so the company paths -- password, one-time code, the company picker and
  // forgot-password -- cannot reach them, and do the same work whether or not one exists.
  private async accountsFor(parsed: ParsedIdentifier): Promise<Account[]> {
    const accounts = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findMany({
        where: {
          ...(parsed.kind === 'email' ? { email: parsed.value } : { mobileNumber: parsed.value, mobileVerifiedAt: { not: null } }),
          status: 'active',
          role: { not: 'super_admin' },
          organizationId: { not: null },
          organization: { status: 'active' },
        },
        select: ACCOUNT_SELECT,
        orderBy: { createdAt: 'asc' },
        take: MAX_COMPANY_ACCOUNTS,
      }),
    );
    return accounts.filter((a) => a.organizationId && !isStaff(a));
  }

  private accountById(userId: string): Promise<Account | null> {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT }));
  }

  // Each account with its company's policy and whether that company has it locked (read only).
  private toCandidates(accounts: Account[], identifier: string, meta: ClientMeta): Promise<Candidate[]> {
    return Promise.all(
      accounts.map(async (account) => {
        const policy = account.organizationId ? await loadTenantSecurityPolicy(this.tenantPrisma, account.organizationId) : DEFAULT_SECURITY_POLICY;
        const slug = account.organization?.slug.toLowerCase() ?? '';
        const blocked = await this.loginProtection.check(slug, identifier, meta.ip, meta.deviceId);
        return { account, policy, slug, listedBreakGlass: policy.breakGlassUserIds.includes(account.id), blocked };
      }),
    );
  }

  // Why an account whose credential is proven may still not be signed in to now, or null. Checked
  // when the credential is, and again when a company is picked.
  private async refusal(account: Account, policy: Policy, method: PendingLogin['method'], identifier: string, ip: string | null): Promise<string | null> {
    if (account.status !== 'active') return 'account_inactive';
    if (!identifier.includes('@') && !(account.mobileVerifiedAt && account.mobileNumber === identifier)) return 'mobile_changed';
    if (!account.organizationId || isStaff(account)) return 'platform_staff'; // their own sign-in only (W-005)
    if (!isOrganizationActive(account.organization?.status)) return 'organization_inactive';
    if (!ipAllowedForSurface(policy, 'desk', ip)) return 'ip_not_allowed';
    // Each company opts in per provider; SSO-only turns both off (YX-IAM-04).
    if (isSocialProvider(method)) return policy.ssoOnly || !(method === 'google' ? policy.googleSignIn : policy.microsoftSignIn) ? 'social_disabled' : null;
    if (method === 'password') return policy.ssoOnly && !policy.breakGlassUserIds.includes(account.id) ? 'sso_only' : null;
    return policy.ssoOnly || !policy.otpSignInChannels.includes(method.slice('otp_'.length) as OtpChannel) ? 'otp_disabled' : null;
  }

  // A sign-in that names the company is held by the identifier lock (W-016) and by the company's own
  // counter -- both the same for every typed identifier -- and is told the longer wait. Read-only.
  private async companyPathBlock(orgSlug: string, identifier: string, meta: ClientMeta): Promise<LoginBlock | null> {
    const [mine, company] = await Promise.all([
      this.loginProtection.check(ANY_COMPANY, identifier, meta.ip, meta.deviceId),
      this.loginProtection.check(orgSlug, identifier, meta.ip, meta.deviceId),
    ]);
    return !mine || (company && company.retryAfterSeconds > mine.retryAfterSeconds) ? company : mine;
  }

  // A failed company sign-in that named the company: one more failure for the typed identifier's own
  // lock too (W-016), under YukthiX's lockout, whether or not an account has it.
  private async countIdentifierFailure(identifier: string, meta: ClientMeta): Promise<void> {
    await this.loginProtection.reserve(ANY_COMPANY, identifier, meta.ip, { deviceId: meta.deviceId });
  }

  // The first factor is proven for this one account: on to its second factor, or signed in.
  private continueAs(c: Candidate, method: PendingLogin['method'], identifier: string, meta: ClientMeta, externalSubject?: string): Promise<LoginOutcome> {
    const breakGlass = method === 'password' && c.policy.ssoOnly && c.listedBreakGlass;
    return this.continueAfterFirstFactor(c.account, { method, orgSlug: c.slug, identifier, breakGlass, ...(externalSubject ? { externalSubject } : {}) }, meta);
  }

  // Second factor (YX-IAM-01/03): anyone with one enrolled must use it. Break-glass sign-in is only
  // for accounts with MFA (YX-IAM-04); without it, the same wrong-password response.
  private async continueAfterFirstFactor(
    user: SessionUser & { permissionProfileId?: string | null },
    login: Pick<PendingLogin, 'method' | 'orgSlug' | 'identifier' | 'breakGlass' | 'externalSubject'>,
    meta: ClientMeta,
  ): Promise<LoginOutcome> {
    const hasFactor = await this.mfa.hasFactor(user);
    if (login.breakGlass && !hasFactor) {
      await this.sessions.recordLoginEvent({
        organizationId: user.organizationId,
        userId: user.id,
        identifier: login.identifier,
        result: 'failed',
        method: login.method,
        reason: 'break_glass_without_mfa',
        meta,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return hasFactor ? this.challengeSecondFactor(user.id, login, meta) : this.finishSignIn(user, login, meta);
  }

  // Several companies matched: a 2-minute, single-use, device-bound choice. Only the companies the
  // credential opened are listed, name and logo only.
  private async offerCompanies(winners: Candidate[], method: PendingLogin['method'], identifier: string, meta: ClientMeta, subject?: string): Promise<CompanyChoice> {
    const selectionToken = randomBytes(32).toString('base64url');
    const pick: CompanyPick = {
      method,
      identifier,
      deviceIdHash: sha256(meta.deviceId),
      ...(subject ? { subject } : {}),
      accounts: winners.map((w) => ({
        userId: w.account.id,
        choice: w.account.organizationId!,
        proof: method === 'password' ? sha256(w.account.passwordHash) : '',
      })),
    };
    await this.store(() => this.redis.set(pickKey(selectionToken), JSON.stringify(pick), 'EX', COMPANY_PICK_TTL_SECONDS));
    const companies = await Promise.all(
      winners.map(async (w) => ({ id: w.account.organizationId!, ...(await this.companyScope.card(w.account.organization!)) })),
    );
    return { selectionRequired: true, selectionToken, companies, expiresInSeconds: COMPANY_PICK_TTL_SECONDS };
  }

  // The company picked. The token is spent whatever happens next (GETDEL); it only works from the
  // device it was given to, only for a company the credential matched, and only while nothing that
  // made the account usable has changed (password, status, company policy). Then that account's
  // second factor, as for a direct sign-in.
  async selectCompany(dto: SelectCompanyDto, meta: ClientMeta): Promise<LoginOutcome> {
    const raw = await this.store(() => this.redis.getdel(pickKey(dto.selectionToken)));
    const pick = raw ? (JSON.parse(raw) as CompanyPick) : null;
    const refuse = async (reason: string, account?: Account | null): Promise<never> => {
      await this.sessions.recordLoginEvent({
        organizationId: account?.organizationId ?? null,
        userId: account?.id ?? null,
        identifier: pick?.identifier ?? null,
        result: 'failed',
        method: pick?.method ?? 'password',
        reason,
        meta,
      });
      throw new UnauthorizedException(EXPIRED_MESSAGE);
    };
    if (!pick) return refuse('company_pick_invalid');
    if (!sameHash(pick.deviceIdHash, sha256(meta.deviceId))) return refuse('company_pick_device_mismatch');
    const chosen = pick.accounts.find((a) => a.choice === dto.organizationId);
    if (!chosen) return refuse('company_pick_not_matched');
    const account = await this.accountById(chosen.userId);
    if (!account) return refuse('unknown_user');
    if (pick.method === 'password' && !sameHash(chosen.proof, sha256(account.passwordHash))) return refuse('password_changed', account);
    // Google / Microsoft vouched for the person, not for one address: each account by its own email.
    const identifier = isSocialProvider(pick.method) ? account.email.toLowerCase() : pick.identifier;
    const [c] = await this.toCandidates([account], identifier, meta);
    const reason = c.blocked ? `${c.blocked.scope}_locked` : await this.refusal(account, c.policy, pick.method, identifier, meta.ip);
    if (reason) return refuse(reason, account);
    return this.continueAs(c, pick.method, identifier, meta, pick.subject);
  }

  // Fail closed (as the lockout store): no choice can be kept or checked without Redis.
  private async store<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      this.logger.error('Sign-in store unavailable', error as Error);
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable. Please try again shortly.');
    }
  }

  // A company's lockout settings (YX-IAM-07); YukthiX's for platform staff and unknown organisations.
  async lockoutFor(organizationId: string | null): Promise<LockoutSettings> {
    const { maxFailedAttempts, lockMinutes } = organizationId ? await loadTenantSecurityPolicy(this.tenantPrisma, organizationId) : DEFAULT_SECURITY_POLICY;
    return { maxFailedAttempts, lockMinutes };
  }

  // Everything after the last factor: lockout cleared, session + tokens, audit, alerts.
  private async finishSignIn(
    user: SessionUser & { permissionProfileId?: string | null },
    login: Pick<PendingLogin, 'method' | 'orgSlug' | 'identifier' | 'breakGlass' | 'identityProviderId' | 'externalSubject'>,
    meta: ClientMeta,
    mfaFactor?: string,
  ): Promise<SignedIn> {
    const viaIdp = login.method === 'saml' || login.method === 'oidc';
    if (!viaIdp) {
      await this.loginProtection.registerSuccess(login.orgSlug, login.identifier, meta.ip, { deviceId: meta.deviceId, trustDevice: true });
      // The identifier lock (W-016) too: cleared, and this device keeps its own counter for it, so a
      // stranger typing this email elsewhere cannot lock its owner out here.
      if (user.organizationId) await this.loginProtection.registerSuccess(ANY_COMPANY, login.identifier, meta.ip, { deviceId: meta.deviceId, trustDevice: true });
    }
    // A password found in a breach on re-check (YX-IAM-08) is changed before any session opens:
    // the client is sent to the reset page with a fresh single-use token. Only after every factor.
    if (login.method === 'password' && (await this.mfa.loadUser(user.id))?.passwordChangeRequired) {
      const resetToken = await this.createResetToken(user.id);
      await this.sessions.recordLoginEvent({ organizationId: user.organizationId, userId: user.id, identifier: login.identifier, result: 'failed', method: 'password', reason: 'password_change_required', meta });
      throw new ForbiddenException({
        statusCode: 403,
        code: PASSWORD_CHANGE_REQUIRED_CODE,
        message: 'Your password appears in a known data breach. Choose a new one to continue.',
        resetToken,
      });
    }
    const reason = login.breakGlass ? 'break_glass' : mfaFactor ? `mfa_${mfaFactor}` : undefined;
    const tokens: SignedIn = await this.startSession(user, login.method, meta, login.identifier, reason, mfaFactor, login.identityProviderId ?? null);
    if (isSocialProvider(login.method) && login.externalSubject && user.organizationId) {
      await this.linkExternalIdentity(user, login.method, login.externalSubject);
    }
    if (!viaIdp) {
      const metadata = { ...(login.method !== 'password' ? { method: login.method } : {}), ...(mfaFactor ? { mfa: mfaFactor } : {}) };
      await this.audit.record(
        { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' },
        {
          actorUserId: user.id,
          action: login.breakGlass ? 'login.break_glass' : 'login.success',
          entityType: 'user',
          entityId: user.id,
          ...(Object.keys(metadata).length ? { metadata } : {}),
        },
      );
    }
    if (login.breakGlass) {
      this.sessions.notifyBreakGlass(user, meta);
    }
    if (!mfaFactor) {
      const account = await this.mfa.loadUser(user.id);
      if (account && (await this.mfa.mfaRequiredFor(account))) {
        tokens.mfa = { required: true, enrolmentDueAt: account.mfaEnrolmentDueAt };
      }
    }
    // This device remembers the company for the next sign-in (signed cookie, set by signInResponse).
    if (user.organizationId) tokens.rememberCompany = this.companyScope.cookieValue(user.organizationId);
    return tokens;
  }

  private async challengeSecondFactor(
    userId: string,
    login: Pick<PendingLogin, 'method' | 'orgSlug' | 'identifier' | 'breakGlass' | 'identityProviderId' | 'externalSubject'>,
    meta: ClientMeta,
  ): Promise<MfaChallenge> {
    const account = (await this.mfa.loadUser(userId))!;
    const factors = [...new Set((await this.mfa.usableFactors(account)).map((f) => f.type))];
    if (account.role !== 'super_admin') factors.push('recovery_code'); // staff: security key only (Q7)
    if ((await this.otpFallbackChannels(account, login.method)).length > 0) factors.push('otp');
    const mfaToken = await this.mfa.createPendingLogin({
      ...login,
      userId,
      deviceIdHash: createHash('sha256').update(meta.deviceId).digest('hex'),
    });
    return { mfaRequired: true, mfaToken, factors, expiresInSeconds: PENDING_LOGIN_TTL_SECONDS };
  }

  // Passkey challenge for the second step of a pending sign-in (same device only).
  async mfaLoginPasskeyOptions(mfaToken: string, meta: ClientMeta) {
    const pending = await this.mfa.loadPendingLogin(mfaToken, meta.deviceId);
    const user = pending && (await this.mfa.loadUser(pending.userId));
    if (!pending || !user) {
      throw new UnauthorizedException('Your sign-in has expired. Please sign in again.');
    }
    return this.mfa.loginPasskeyOptions(mfaToken, user);
  }

  // Second step of sign-in (YX-IAM-01/03). Guessing is bounded by the same per-account and per-IP
  // lockout as passwords (keyed on the account id), and every failure is a login event.
  async completeMfaLogin(dto: MfaLoginDto, meta: ClientMeta): Promise<SignedIn> {
    const pending = await this.mfa.loadPendingLogin(dto.mfaToken, meta.deviceId);
    const user = pending && (await this.mfa.loadUser(pending.userId));
    if (!pending || !user) {
      await this.sessions.recordLoginEvent({ organizationId: null, result: 'mfa_failed', method: dto.factor, reason: 'mfa_token_invalid', meta });
      throw new UnauthorizedException('Your sign-in has expired. Please sign in again.');
    }
    const event = { organizationId: user.organizationId, userId: user.id, identifier: pending.identifier, meta };
    // Counted before the proof is checked (atomic): parallel guesses with one mfaToken cannot
    // outrun the lock.
    const reserved = await this.loginProtection.reserve('mfa', user.id, meta.ip, {
      deviceId: meta.deviceId,
      lockExempt: pending.breakGlass,
      lockout: await this.lockoutFor(user.organizationId),
    });
    if (reserved.block) {
      await this.sessions.recordLoginEvent({ ...event, result: 'locked', method: dto.factor, reason: `mfa_${reserved.block.scope}_locked` });
      throw new TooManyLoginAttemptsException(reserved.block.retryAfterSeconds);
    }
    if (user.status !== 'active') {
      await this.sessions.recordLoginEvent({ ...event, result: 'failed', method: pending.method, reason: 'account_inactive' });
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, meta.ip))) {
      await this.sessions.recordLoginEvent({ ...event, result: 'failed', method: pending.method, reason: 'ip_not_allowed' });
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }

    let factor: string | null;
    if (dto.factor === 'otp') {
      // Fallback factor (YX-IAM-03): only while it is still allowed for this account and sign-in.
      const allowed = (await this.otpFallbackChannels(user, pending.method)).length > 0;
      factor = allowed && /^\d{6}$/.test(dto.code ?? '') && (await this.otp.check(otpMfaKey(dto.mfaToken), dto.code!)) ? 'otp' : null;
    } else {
      const challenge = dto.factor === 'passkey' ? await this.mfa.takeLoginChallenge(dto.mfaToken) : null;
      factor = await this.mfa.verifyProof(user, dto as MfaProofDto, challenge);
    }
    if (!factor || !(await this.mfa.consumePendingLogin(dto.mfaToken))) {
      const { locked } = await this.loginProtection.registerFailure('mfa', user.id, meta.ip, reserved);
      await this.sessions.recordLoginEvent({
        ...event,
        result: 'mfa_failed',
        method: dto.factor,
        reason: locked ? 'mfa_invalid+lockout_started' : 'mfa_invalid',
      });
      if (locked) this.alertLocked(user, meta, pending.breakGlass);
      throw new UnauthorizedException('That verification did not work. Try again.');
    }
    await this.loginProtection.registerSuccess('mfa', user.id, meta.ip, { deviceId: meta.deviceId, trustDevice: true });
    return this.finishSignIn(user, pending, meta, factor);
  }

  // ---- one-time-code sign-in (P12 §3 AAL1; M04 Q2) -----------------------------------------

  // Step 1: send a code to the account's email or verified mobile number. The answer, the
  // counters and the work done are the same whether or not such an account -- or organisation,
  // or an organisation with OTP sign-in on / this network allowed -- exists (no enumeration);
  // the real reason is in the login event.
  async startOtpLogin(dto: OtpStartDto, meta: ClientMeta): Promise<OtpSent> {
    const parsed = parseOtpIdentifier(dto.identifier);
    if (!parsed) throw new BadRequestException('Enter an email address or a mobile number');
    const channel: OtpChannel = dto.channel ?? (parsed.kind === 'email' ? 'email' : 'sms');
    if (channel === 'email' && parsed.kind !== 'email') throw new BadRequestException('A code by email needs an email address');
    if (channel !== 'email' && parsed.kind !== 'mobile') throw new BadRequestException('A code by text message needs a mobile number');
    if (!(await this.otp.channelAvailable(channel))) throw new BadRequestException('Codes by text message are not available right now');
    const method = `otp_${channel}` as const;

    const orgSlug = dto.organizationSlug?.trim().toLowerCase();
    if (!orgSlug) return this.startOtpAnyCompany(parsed, channel, meta);
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    let organizationId = org && isOrganizationActive(org.status) ? org.id : null;
    // A code that can't go by text message goes by email instead, where the company allows email codes.
    let emailFallback = false;
    if (organizationId) {
      const policy = await loadTenantSecurityPolicy(this.tenantPrisma, organizationId);
      emailFallback = policy.otpSignInChannels.includes('email');
      // SSO-only (YX-IAM-04) turns every other way in off; break-glass stays password + MFA.
      const refused =
        policy.ssoOnly || !policy.otpSignInChannels.includes(channel) ? 'otp_disabled' : !ipAllowedForSurface(policy, 'desk', meta.ip) ? 'ip_not_allowed' : null;
      if (refused) {
        await this.sessions.recordLoginEvent({ organizationId, identifier: parsed.value, result: 'failed', method, reason: refused, meta });
        organizationId = null; // answered exactly like an unknown organisation: nothing is sent
      }
    }

    const block = await this.companyPathBlock(orgSlug, parsed.value, meta);
    if (block) {
      await this.sessions.recordLoginEvent({ organizationId, identifier: parsed.value, result: 'locked', method, reason: `${block.scope}_locked`, meta });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    }
    await this.otp.reserveSend(`signin\u0000${orgSlug}\u0000${parsed.value}`, meta.ip);

    const user = organizationId
      ? await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
          tx.user.findFirst({
            where:
              parsed.kind === 'email'
                ? { organizationId, email: parsed.value }
                : { organizationId, mobileNumber: parsed.value, mobileVerifiedAt: { not: null } },
            select: { id: true, email: true, status: true, mobileNumber: true },
          }),
        )
      : null;
    const recipient = user?.status === 'active' ? user : null;
    const otpToken = randomBytes(32).toString('base64url');
    // Unknown accounts get a code too (never sent, no user), so the stored state, the token and
    // the later verify path cannot tell the two apart.
    const code = await this.otp.issue(otpSignInKey(orgSlug, parsed.value), {
      userId: recipient?.id ?? '',
      organizationId: organizationId ?? '',
      channel,
      tokenHash: sha256(otpToken),
      deviceIdHash: sha256(meta.deviceId),
    });
    if (recipient) {
      this.otp.deliver(channel, channel === 'email' ? recipient.email : recipient.mobileNumber!, code, 'sign_in', organizationId, {
        userId: recipient.id,
        fallbackEmail: channel !== 'email' && emailFallback ? recipient.email : null,
      });
      // YX-IAM-10: every code actually sent is a login event (SMS-pumping / targeting signal).
      await this.sessions.recordLoginEvent({ organizationId, userId: recipient.id, identifier: parsed.value, result: 'code_sent', method, meta });
    }
    return { otpToken, expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  // Step 2: the code, from the device that asked for it, with the token step 1 returned. Wrong
  // codes count toward the same per-account / per-IP lockout as wrong passwords; an account with
  // a second factor still owes it.
  async completeOtpLogin(dto: OtpVerifyDto, meta: ClientMeta): Promise<LoginOutcome> {
    const parsed = parseOtpIdentifier(dto.identifier);
    if (!parsed) throw new BadRequestException('Enter an email address or a mobile number');
    const orgSlug = dto.organizationSlug?.trim().toLowerCase();
    if (!orgSlug) return this.completeOtpAnyCompany(parsed, dto, meta);
    const key = otpSignInKey(orgSlug, parsed.value);
    const record = await this.otp.peek(key);
    const method = `otp_${record?.channel ?? (parsed.kind === 'email' ? 'email' : 'sms')}` as PendingLogin['method'];
    const event = { organizationId: record?.organizationId || null, identifier: parsed.value, method, meta };

    // Counted before the code is checked (atomic; see LoginProtectionService), under the lockout
    // settings of the organisation the slug names -- the same counter and settings as passwords.
    // The identifier lock (W-016) first, as on every company path.
    const slugOrg = await this.prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
    const lockedOut = async (block: LoginBlock): Promise<never> => {
      await this.sessions.recordLoginEvent({ ...event, userId: record?.userId || null, result: 'locked', reason: `${block.scope}_locked` });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    };
    const block = await this.companyPathBlock(orgSlug, parsed.value, meta);
    if (block) return lockedOut(block);
    const reserved = await this.loginProtection.reserve(orgSlug, parsed.value, meta.ip, { deviceId: meta.deviceId, lockout: await this.lockoutFor(slugOrg?.id ?? null) });
    if (reserved.block) return lockedOut(reserved.block);

    const mine = record && sameHash(record.tokenHash, sha256(dto.otpToken)) && sameHash(record.deviceIdHash, sha256(meta.deviceId));
    const proven = mine ? await this.otp.check(key, dto.code) : null;
    const user = proven?.userId ? await this.mfa.loadUser(proven.userId) : null;
    if (!proven || !user) {
      const { locked } = await this.loginProtection.registerFailure(orgSlug, parsed.value, meta.ip, reserved);
      await this.countIdentifierFailure(parsed.value, meta);
      await this.sessions.recordLoginEvent({ ...event, userId: record?.userId || null, result: 'failed', reason: locked ? 'otp_invalid+lockout_started' : 'otp_invalid' });
      const holder = locked && record?.userId ? await this.mfa.loadUser(record.userId) : null;
      if (holder) this.sessions.notifyLocked(holder, meta);
      throw new UnauthorizedException(OTP_INVALID_MESSAGE);
    }

    // The code is spent and right: its guess counter is cleared. Whatever could have changed since
    // it was sent is checked again.
    await this.loginProtection.registerSuccess(orgSlug, parsed.value, meta.ip);
    const refuse = async (reason: string, error: Error): Promise<never> => {
      await this.sessions.recordLoginEvent({ ...event, userId: user.id, result: 'failed', reason });
      throw error;
    };
    const org = user.organizationId ? await this.prisma.organization.findUnique({ where: { id: user.organizationId } }) : null;
    if (user.status !== 'active') return refuse('account_inactive', new UnauthorizedException('This account has been deactivated'));
    if (!org || !isOrganizationActive(org.status)) return refuse('organization_inactive', new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE));
    const policy = await loadTenantSecurityPolicy(this.tenantPrisma, org.id);
    if (policy.ssoOnly || !policy.otpSignInChannels.includes(proven.channel)) {
      return refuse('otp_disabled', new BadRequestException(OTP_SIGN_IN_OFF_MESSAGE));
    }
    if (!ipAllowedForSurface(policy, 'desk', meta.ip)) return refuse('ip_not_allowed', new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE));
    if (parsed.kind === 'mobile' && !(user.mobileVerifiedAt && user.mobileNumber === parsed.value)) {
      return refuse('mobile_changed', new UnauthorizedException(OTP_INVALID_MESSAGE));
    }

    const login = { method, orgSlug, identifier: parsed.value, breakGlass: false };
    return (await this.mfa.hasFactor(user)) ? this.challengeSecondFactor(user.id, login, meta) : this.finishSignIn(user, login, meta);
  }

  // Email-first code sign-in (no company named): ONE code to the address, whatever number of
  // companies use it, and the same answer, counters and work when none does. The code is for every
  // account that may sign in by this channel now; after it is verified, the same rule as passwords:
  // one account signs in, several are offered as a choice.
  private async startOtpAnyCompany(parsed: ParsedIdentifier, channel: OtpChannel, meta: ClientMeta): Promise<OtpSent> {
    const method = `otp_${channel}` as const;
    const block = await this.loginProtection.check(ANY_COMPANY, parsed.value, meta.ip, meta.deviceId);
    if (block) {
      await this.sessions.recordLoginEvent({ organizationId: null, identifier: parsed.value, result: 'locked', method, reason: `${block.scope}_locked`, meta });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    }
    await this.otp.reserveSend(`signin\u0000\u0000${parsed.value}`, meta.ip);

    const allowed: Candidate[] = [];
    for (const c of await this.toCandidates(await this.accountsFor(parsed), parsed.value, meta)) {
      const reason = c.blocked ? `${c.blocked.scope}_locked` : await this.refusal(c.account, c.policy, method, parsed.value, meta.ip);
      if (reason) await this.sessions.recordLoginEvent({ organizationId: c.account.organizationId, userId: c.account.id, identifier: parsed.value, result: 'failed', method, reason, meta });
      else allowed.push(c);
    }
    const otpToken = randomBytes(32).toString('base64url');
    const code = await this.otp.issue(otpSignInKey('', parsed.value), {
      userIds: allowed.map((c) => c.account.id).join(','),
      channel,
      tokenHash: sha256(otpToken),
      deviceIdHash: sha256(meta.deviceId),
    });
    const first = allowed[0];
    if (first) {
      // One address, one code: sent once, under the first company's sender / SMS account.
      const { account } = first;
      this.otp.deliver(channel, channel === 'email' ? account.email : account.mobileNumber!, code, 'sign_in', account.organizationId, {
        userId: account.id,
        fallbackEmail: channel !== 'email' && first.policy.otpSignInChannels.includes('email') ? account.email : null,
      });
      for (const c of allowed) {
        await this.sessions.recordLoginEvent({ organizationId: c.account.organizationId, userId: c.account.id, identifier: parsed.value, result: 'code_sent', method, meta });
      }
    }
    return { otpToken, expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  private async completeOtpAnyCompany(parsed: ParsedIdentifier, dto: OtpVerifyDto, meta: ClientMeta): Promise<LoginOutcome> {
    const key = otpSignInKey('', parsed.value);
    const record = await this.otp.peek(key);
    const method = `otp_${record?.channel ?? (parsed.kind === 'email' ? 'email' : 'sms')}` as PendingLogin['method'];
    const event = { identifier: parsed.value, method, meta };
    const userIds = (record?.userIds ?? '').split(',').filter(Boolean);

    // Counted before the code is checked (atomic), for the address across companies.
    const reserved = await this.loginProtection.reserve(ANY_COMPANY, parsed.value, meta.ip, { deviceId: meta.deviceId });
    if (reserved.block) {
      await this.sessions.recordLoginEvent({ ...event, organizationId: null, result: 'locked', reason: `${reserved.block.scope}_locked` });
      throw new TooManyLoginAttemptsException(reserved.block.retryAfterSeconds);
    }
    const mine = record && sameHash(record.tokenHash, sha256(dto.otpToken)) && sameHash(record.deviceIdHash, sha256(meta.deviceId));
    const proven = mine ? await this.otp.check(key, dto.code) : null;
    const accounts = (await Promise.all(userIds.map((id) => this.accountById(id)))).filter((a): a is Account => a !== null);
    const candidates = await this.toCandidates(accounts, parsed.value, meta);

    if (!proven) {
      // Wrong: counted for the address only (W-016), whoever the code was for; their holders are told of a lock.
      const { locked } = await this.loginProtection.registerFailure(ANY_COMPANY, parsed.value, meta.ip, reserved);
      for (const c of candidates) {
        await this.sessions.recordLoginEvent({ ...event, organizationId: c.account.organizationId, userId: c.account.id, result: 'failed', reason: locked ? 'otp_invalid+lockout_started' : 'otp_invalid' });
        if (locked) this.alertLocked(c.account, meta, c.listedBreakGlass);
      }
      if (!candidates.length) await this.sessions.recordLoginEvent({ ...event, organizationId: null, result: 'failed', reason: 'otp_invalid' });
      throw new UnauthorizedException(OTP_INVALID_MESSAGE);
    }

    // The code is spent and right. Whatever could have changed since it was sent is checked again.
    await this.loginProtection.registerSuccess(ANY_COMPANY, parsed.value, meta.ip);
    const winners: Candidate[] = [];
    for (const c of candidates) {
      const reason = c.blocked ? `${c.blocked.scope}_locked` : await this.refusal(c.account, c.policy, method, parsed.value, meta.ip);
      if (reason) await this.sessions.recordLoginEvent({ ...event, organizationId: c.account.organizationId, userId: c.account.id, result: 'failed', reason });
      else winners.push(c);
    }
    if (!winners.length) {
      if (!candidates.length) await this.sessions.recordLoginEvent({ ...event, organizationId: null, result: 'failed', reason: 'unknown_user' });
      throw new UnauthorizedException(OTP_INVALID_MESSAGE);
    }
    for (const w of winners) await this.loginProtection.registerSuccess(w.slug, parsed.value, meta.ip);
    return winners.length === 1 ? this.continueAs(winners[0], method, parsed.value, meta) : this.offerCompanies(winners, method, parsed.value, meta);
  }

  // ---- "Continue with Google / Microsoft" (founder request 7 Oct 2026; P12 Q2) ----------------

  // The provider's callback hands the browser this single-use, 60-second, device-bound code (in the
  // URL fragment); the browser trades it at POST /auth/social/exchange. Only its sha256 is stored.
  async mintSocialCode(proof: SocialProof): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.store(() => this.redis.set(socialCodeKey(code), JSON.stringify(proof), 'EX', SOCIAL_CODE_TTL_SECONDS));
    return code;
  }

  // Which accounts the provider's proof opens, by the rules of the email-first password sign-in:
  // none -> the wrong-password answer (nothing says why: no account, address not verified, method
  // off for the company, staff, locked ...); one -> that account, its second factor still owed;
  // several -> the company picker. Every refusal is a login event for its company.
  async socialSignIn(code: string, meta: ClientMeta): Promise<LoginOutcome> {
    const raw = await this.store(() => this.redis.getdel(socialCodeKey(code)));
    const proof = raw ? (JSON.parse(raw) as SocialProof) : null;
    if (!proof || !sameHash(proof.deviceIdHash, sha256(meta.deviceId))) {
      await this.sessions.recordLoginEvent({
        organizationId: null,
        identifier: proof?.email ?? proof?.domainEmail ?? null,
        result: 'failed',
        method: proof?.provider ?? 'google',
        reason: proof ? 'social_device_mismatch' : 'social_code_invalid',
        meta,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const method = proof.provider;
    const accounts = await this.socialAccounts(proof);
    const candidates = (await Promise.all(accounts.map((a) => this.toCandidates([a], a.email.toLowerCase(), meta)))).flat();
    const winners: Candidate[] = [];
    for (const c of candidates) {
      const identifier = c.account.email.toLowerCase();
      // With a company known (web address / remembered company), only that company's account.
      const reason =
        proof.scopeSlug && c.slug !== proof.scopeSlug
          ? 'other_company'
          : c.blocked
            ? `${c.blocked.scope}_locked`
            : await this.refusal(c.account, c.policy, method, identifier, meta.ip);
      if (reason) {
        await this.sessions.recordLoginEvent({ organizationId: c.account.organizationId, userId: c.account.id, identifier, result: c.blocked ? 'locked' : 'failed', method, reason, meta });
      } else {
        winners.push(c);
      }
    }
    if (!winners.length) {
      if (!candidates.length) {
        await this.sessions.recordLoginEvent({ organizationId: null, identifier: proof.email ?? proof.domainEmail, result: 'failed', method, reason: 'unknown_user', meta });
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return winners.length === 1
      ? this.continueAs(winners[0], method, winners[0].account.email.toLowerCase(), meta, proof.subject)
      : this.offerCompanies(winners, method, proof.email ?? winners[0].account.email.toLowerCase(), meta, proof.subject);
  }

  // The accounts linked to this subject, then by email the accounts not linked to another account of
  // this provider: a provider-verified address in any company, a Microsoft work sign-in name only in
  // a company that has verified its domain (not lapsed). Never YukthiX staff (W-005); capped.
  private async socialAccounts(proof: SocialProof): Promise<Account[]> {
    const all = { organizationId: null, isSuperAdmin: true };
    const linked = await this.tenantPrisma.forTenant(all, (tx) =>
      tx.externalIdentity.findMany({ where: { provider: proof.provider, subject: proof.subject }, select: { userId: true }, take: MAX_COMPANY_ACCOUNTS }),
    );
    const byLink: Account[] = linked.length
      ? await this.tenantPrisma.forTenant(all, (tx) =>
          tx.user.findMany({
            where: { id: { in: linked.map((l) => l.userId) }, status: 'active', role: { not: 'super_admin' }, organizationId: { not: null }, organization: { status: 'active' } },
            select: ACCOUNT_SELECT,
            orderBy: { createdAt: 'asc' },
          }),
        )
      : [];
    const byEmail: Account[] = proof.email ? await this.accountsFor({ kind: 'email', value: proof.email }) : [];
    if (proof.domainEmail && proof.domainEmail !== proof.email) {
      const found = await this.accountsFor({ kind: 'email', value: proof.domainEmail });
      const verified = found.length
        ? await this.tenantPrisma.forTenant(all, (tx) =>
            tx.verifiedDomain.findMany({
              where: { domain: emailDomain(proof.domainEmail!), lapsedAt: null, organizationId: { in: found.map((a) => a.organizationId!) } },
              select: { organizationId: true },
            }),
          )
        : [];
      byEmail.push(...found.filter((a) => verified.some((v) => v.organizationId === a.organizationId)));
    }
    const linkedElsewhere = byEmail.length
      ? await this.tenantPrisma.forTenant(all, (tx) =>
          tx.externalIdentity.findMany({ where: { provider: proof.provider, userId: { in: byEmail.map((a) => a.id) }, subject: { not: proof.subject } }, select: { userId: true } }),
        )
      : [];
    const accounts = new Map<string, Account>();
    for (const a of [...byLink, ...byEmail]) {
      if (!isStaff(a) && !linkedElsewhere.some((l) => l.userId === a.id)) accounts.set(a.id, a);
    }
    return [...accounts.values()].slice(0, MAX_COMPANY_ACCOUNTS);
  }

  // After the whole sign-in (every factor): remember which Google / Microsoft account this is. A link
  // is never moved to another subject here: the first one stays while the account exists.
  private async linkExternalIdentity(user: SessionUser, provider: SocialProvider, subject: string): Promise<void> {
    const ctx = { organizationId: user.organizationId, isSuperAdmin: false };
    const created = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const existing = await tx.externalIdentity.findUnique({ where: { userId_provider: { userId: user.id, provider } } });
      if (existing) {
        if (existing.subject === subject) await tx.externalIdentity.update({ where: { id: existing.id }, data: { lastUsedAt: new Date() } });
        return false;
      }
      await tx.externalIdentity.create({ data: { organizationId: user.organizationId!, userId: user.id, provider, subject } });
      return true;
    });
    if (created) {
      await this.audit.record(ctx, { actorUserId: user.id, action: 'user.external_identity_linked', entityType: 'user', entityId: user.id, metadata: { provider } });
    }
  }

  // OTP as the fallback second factor (YX-IAM-03): SMS / WhatsApp to a verified mobile number,
  // where the company allows OTP. Never by email (a password reset already goes there, so
  // password + email code would be one factor), never after a one-time-code first step (one
  // channel is not two factors), and never for System / Payroll Admin or YukthiX staff.
  async otpFallbackChannels(user: MfaUser, firstFactor: PendingLogin['method']): Promise<OtpChannel[]> {
    if (firstFactor.startsWith('otp_') || user.role === 'super_admin' || !user.organizationId || !user.mobileNumber || !user.mobileVerifiedAt) {
      return [];
    }
    if (!(await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId)).allowedFactors.includes('otp')) return [];
    const grants = await resolvePermissionGrants(this.prisma, this.tenantPrisma, user, [...OTP_FALLBACK_BARRED_PERMISSIONS]);
    if (OTP_FALLBACK_BARRED_PERMISSIONS.some((key) => grants.has(key))) return [];
    const texted = OTP_CHANNELS.filter((channel) => channel !== 'email');
    const ready = await Promise.all(texted.map((channel) => this.otp.channelAvailable(channel, user.organizationId)));
    return texted.filter((_, i) => ready[i]);
  }

  // Sends the fallback code for a pending sign-in (same device only).
  async sendMfaOtp(dto: MfaOtpSendDto, meta: ClientMeta): Promise<OtpSent> {
    const pending = await this.mfa.loadPendingLogin(dto.mfaToken, meta.deviceId);
    const user = pending && (await this.mfa.loadUser(pending.userId));
    if (!pending || !user) throw new UnauthorizedException('Your sign-in has expired. Please sign in again.');
    if (!(await this.otpFallbackChannels(user, pending.method)).includes(dto.channel)) {
      throw new BadRequestException('A one-time code cannot be used for your second step. Use your passkey, authenticator app or a recovery code.');
    }
    await this.otp.reserveSend(`mfa\u0000${user.id}`, meta.ip);
    const code = await this.otp.issue(otpMfaKey(dto.mfaToken), { userId: user.id });
    // Never by email: password + email code would be one factor (YX-IAM-03).
    this.otp.deliver(dto.channel, user.mobileNumber!, code, 'mfa', user.organizationId, { userId: user.id });
    await this.sessions.recordLoginEvent({ organizationId: user.organizationId, userId: user.id, identifier: pending.identifier, result: 'code_sent', method: 'otp', reason: `mfa_${dto.channel}`, meta });
    return { expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  private async rejectLogin(
    orgSlug: string,
    attempt: { identifier: string; method: 'password'; meta: ClientMeta },
    organizationId: string | null,
    user: SessionUser | null,
    reason: string,
    reserved: LoginAttempt,
  ): Promise<never> {
    const { locked } = await this.loginProtection.registerFailure(orgSlug, attempt.identifier, attempt.meta.ip, reserved);
    // W-016: a company sign-in's failure also counts toward the identifier lock (never staff's).
    if (orgSlug !== PLATFORM_SCOPE) await this.countIdentifierFailure(attempt.identifier, attempt.meta);
    await this.sessions.recordLoginEvent({
      ...attempt,
      organizationId,
      userId: user?.id ?? null,
      result: 'failed',
      reason: locked ? `${reason}+lockout_started` : reason,
    });
    if (locked && user) {
      this.alertLocked(user, attempt.meta, reserved.lockExempt);
    }
    throw new UnauthorizedException(INVALID_CREDENTIALS);
  }

  // The lock threshold was reached: the holder is told; for a break-glass account (never locked)
  // every admin of the company is told instead, since someone is guessing at the way in of last resort.
  private alertLocked(user: SessionUser, meta: ClientMeta, breakGlass: boolean): void {
    if (breakGlass && user.organizationId) {
      this.sessions.notifyAdmins(
        user.organizationId,
        'Repeated failed sign-ins to a break-glass account',
        `<p>Someone has repeatedly failed to sign in to the break-glass account <b>${escapeHtml(user.email)}</b>.</p>` +
          `<p>IP address: ${escapeHtml(meta.ip ?? 'unknown')}</p><p>Review <b>Admin &rsaquo; Login activity</b>.</p>`,
      );
      return;
    }
    this.sessions.notifyLocked(user, meta);
  }

  // Session + token pair + login history + new-device alert, for every successful sign-in path.
  private async startSession(
    user: SessionUser & { permissionProfileId?: string | null },
    method: LoginMethod,
    meta: ClientMeta,
    identifier: string,
    reason?: string,
    mfaFactor?: string,
    identityProviderId: string | null = null,
  ): Promise<TokenPair> {
    const session = await this.sessions.create(user, method, meta, mfaFactor, identityProviderId);
    const tokens = await this.issueTokenPair(user.id, user.organizationId, user.role, user.permissionProfileId ?? null, session);
    await this.recordLogin(user.id, user.organizationId, user.role);
    await this.sessions.recordLoginEvent({
      organizationId: user.organizationId,
      userId: user.id,
      identifier,
      result: 'success',
      method,
      reason,
      sessionId: session.id,
      newDevice: session.newDevice,
      meta,
    });
    if (session.newDevice) {
      this.sessions.notifyNewDevice(user, meta);
    } else if (session.newCountry) {
      this.sessions.notifyNewCountry(user, meta);
    }
    return tokens;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    // Email-first: every company account with this email gets its own link, naming the company
    // (the answer is the same whether there are none, one or several).
    if (!dto.organizationSlug) {
      const accounts = await this.accountsFor({ kind: 'email', value: dto.email.trim().toLowerCase() });
      for (const account of accounts) {
        const rawToken = await this.createResetToken(account.id);
        this.dispatchResetEmail(account.email, rawToken, account.organizationId!, account.organization?.name).catch((error) =>
          this.logger.error(`Failed to dispatch password reset email to ${account.email}`, error as Error),
        );
      }
      return;
    }
    const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
    if (!org) {
      return;
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
      tx.user.findFirst({ where: { email: dto.email, organizationId: org.id } }),
    );
    if (!user) {
      return;
    }

    const rawToken = await this.createResetToken(user.id);

    // Fire-and-forget, matching the invitation-email pattern in InvitationsService:
    // email delivery is a notification side effect, not something the caller should
    // wait on (or that should make forgotPassword() throw on SMTP failure).
    this.dispatchResetEmail(user.email, rawToken, org.id).catch((error) =>
      this.logger.error(`Failed to dispatch password reset email to ${user.email}`, error as Error),
    );
  }

  // A single-use reset token (stored as sha256 only), valid PASSWORD_RESET_EXPIRY_MINUTES.
  private async createResetToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    return rawToken;
  }

  private async dispatchResetEmail(email: string, rawToken: string, organizationId: string, companyName?: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    const which = companyName ? ` for your <b>${escapeHtml(companyName)}</b> account` : '';
    await this.emailService.send({
      to: email,
      subject: companyName ? `Reset your ${companyName} password` : 'Reset your password',
      html: `<p>Click the link below to reset your password${which}. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
      organizationId,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const owner = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUnique({ where: { id: resetToken.userId }, select: { organizationId: true, role: true, email: true, organization: { select: { slug: true } } } }),
    );
    // Before the token is consumed: a rejected password leaves the link usable for another try.
    const { passwordHash, passwordRecheckPending } = await this.passwordPolicy.hashNewPassword(
      dto.newPassword,
      owner?.organizationId ?? null,
    );

    // Routed through forTenant (super_admin bypass): the caller has proven identity via
    // a validated reset token, not via an org-scoped session, so there is no tenant
    // context to set otherwise -- and without one, RLS's secure-by-default predicate
    // silently matches zero rows on `users`, making tx.user.update() a no-op. Same
    // pattern as the reuse-detection branch in refresh() below.
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      // Compare-and-set: of two concurrent resets with one link, exactly one wins.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (count !== 1) throw new BadRequestException('This reset link is invalid or has expired');
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash, passwordRecheckPending, passwordChangeRequired: false } });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await revokeStaffSessions(tx, { userId: resetToken.userId }, 'password_reset');
    });
    // Sign-ins half done with the old password stop working, and the owner's lock is lifted.
    await this.mfa.cancelPendingLogins(resetToken.userId);
    if (owner) {
      await this.loginProtection.registerSuccess(owner.organization?.slug ?? '', owner.email.toLowerCase(), null);
      if (owner.organizationId) await this.loginProtection.registerSuccess(ANY_COMPANY, owner.email.toLowerCase(), null);
      await this.loginProtection.registerSuccess('mfa', resetToken.userId, null);
    }

    await this.audit.record(
      { organizationId: owner?.organizationId ?? null, isSuperAdmin: owner?.role === 'super_admin' },
      { actorUserId: resetToken.userId, action: 'password.reset', entityType: 'user', entityId: resetToken.userId },
    );
  }

  async refresh(refreshToken: string, ip: string | null = null): Promise<TokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // The family is the session (sessions.id). A revoked / expired / idle session -- or a
    // pre-sessions token whose family never had one -- ends here: retire whatever is left of the
    // family and make the client sign in again. Not reuse, so no reuse audit entry.
    const session = await this.sessions.findLive(payload.familyId, payload.sub);
    if (!session) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session expired');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // A row written under the previous argon2 scheme can never match a SHA-256
    // digest. Retire it as an ordinary expired session rather than letting it
    // fall into the reuse branch below, which revokes the family AND writes an
    // auth.token_reuse_detected audit entry -- a security event meaning a
    // possibly-stolen token. Every session predating the cutover would have
    // produced one, poisoning the audit trail with false positives.
    if (stored && isLegacyArgon2Hash(stored.tokenHash)) {
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!stored || !refreshTokenMatches(stored.tokenHash, refreshToken)) {
      // Before calling it reuse: was THIS token rotated out only moments ago, AND is there a
      // live successor in the family? That combination is the concurrent-refresh race -- see
      // REFRESH_REUSE_GRACE_MS -- and only that combination.
      //
      // `stored` (a live row) is REQUIRED. The benign race always has one: the other tab's
      // rotation produced it. A logout, a password reset, or a prior reuse detection leave
      // ZERO live rows in the family, and forgiving there would let a copied token resurrect
      // a session the user had deliberately killed, for up to 10s. Security review caught
      // exactly that before this shipped.
      //
      // The hash is matched in the WHERE clause, not by ordering: with three tabs racing, the
      // most-recently-revoked row is not necessarily the one this caller holds, and an
      // orderBy+findFirst would wrongly reject the third tab. sha256 is deterministic, so an
      // exact match is available. Legacy argon2 rows can never equal a sha256 digest, so
      // they are excluded by construction.
      const justRotated = stored
        ? await this.prisma.refreshToken.findFirst({
            where: {
              userId: payload.sub,
              familyId: payload.familyId,
              tokenHash: hashRefreshToken(refreshToken),
              revokedAt: { gte: new Date(Date.now() - REFRESH_REUSE_GRACE_MS) },
            },
          })
        : null;
      if (justRotated) {
        // Forgive: hand this caller a fresh rotation rather than replaying the other tab's
        // token (which cannot be recovered from its hash anyway). This DOES revoke the other
        // tab's live token -- it must, to keep the family single-live -- and that is fine:
        // the other tab adopts this one's result over the BroadcastChannel, or on its next
        // 401 goes through this same forgiveness path itself.
        this.logger.warn(`Refresh race forgiven for user ${payload.sub} (token rotated ${Date.now() - justRotated.revokedAt!.getTime()}ms ago)`);
        return this.issueAfterRefreshChecks(payload, stored, session, ip);
      }
      // Reuse of an already-rotated/unknown token: revoke the whole family. Only LIVE rows --
      // re-stamping already-revoked rows would move them back inside the grace window on every
      // failed retry, so a family under attack could never age out of forgiveness.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // ...and the session it belongs to, so access tokens already issued from it die on their
      // next request instead of living out their 15 minutes (YX-IAM-06).
      await this.sessions.revokeById(payload.familyId, payload.sub, 'refresh_token_reuse');
      // The lookup below and the audit write both live inside this one try: the family
      // revocation above has already committed, so nothing security-critical is lost if
      // either fails, and a failure here -- whether the RLS-bypass transaction or the
      // audit write itself -- must not prevent the client from being told their session
      // was revoked. Surfacing a 500/503 here instead of the 401 below would leave them
      // retrying with the same compromised token.
      try {
        // Routed through forTenant (super_admin bypass), not the raw client: `users` is
        // RLS-protected and the raw client sets no session context, so a bare findUnique
        // would silently match zero rows for every user, always falling through to the
        // null branch below. Same pattern as resetPassword and this method's own success
        // path further down. findUnique (not OrThrow): a token whose user was actually
        // deleted is a real case that must still fall through to null below.
        const compromisedUser = await this.tenantPrisma.forTenant(
          { organizationId: null, isSuperAdmin: true },
          (tx) => tx.user.findUnique({ where: { id: payload.sub } }),
        );
        // When compromisedUser is null (the token's user no longer exists, e.g. deleted),
        // organizationId is also null. A null organizationId with isSuperAdmin: false is
        // unwritable under this table's RLS block predicate: NULL = NULL evaluates to
        // UNKNOWN in SQL, so the predicate rejects every such row, regardless of load.
        // Route this case through the super_admin bypass instead -- correct both
        // mechanically (it's the only way to write a null-org row) and semantically (a
        // token attributable to no known user isn't attributable to any tenant either).
        const isSuperAdmin = compromisedUser ? compromisedUser.role === 'super_admin' : true;
        await this.audit.record(
          { organizationId: compromisedUser?.organizationId ?? null, isSuperAdmin },
          { actorUserId: payload.sub, action: 'auth.token_reuse_detected', entityType: 'user', entityId: payload.sub },
        );
      } catch (error) {
        this.logger.error('Failed to record auth.token_reuse_detected audit entry', error as Error);
      }
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    return this.issueAfterRefreshChecks(payload, stored, session, ip);
  }

  // The tail of refresh(): revoke the presented live row, re-check the account and org are
  // still active, issue a new pair in the same family. Shared by the normal path and the
  // concurrent-refresh forgiveness path so the two cannot drift.
  private async issueAfterRefreshChecks(
    payload: { sub: string; familyId: string },
    stored: { id: string } | null,
    session: { id: string; absoluteExpiresAt: Date },
    ip: string | null,
  ): Promise<TokenPair> {
    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

    // Desk IP allow-list (YX-IAM-09) before rotating: the refresh token stays usable from an
    // allowed network instead of being burnt (and later mistaken for reuse).
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, ip))) {
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }

    if (stored) {
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    // A super admin has no organization to suspend. For everyone else, checking
    // only at login would let a suspended organization's staff keep rotating
    // tokens indefinitely, so the suspension would appear not to have applied.
    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }

    return this.issueTokenPair(user.id, user.organizationId, user.role, user.permissionProfileId ?? null, session);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
    await this.sessions.revokeById(payload.familyId, payload.sub, 'logout');
  }

  // An identity provider vouched for `user` (SAML or OIDC). The session is AAL2 only when the IdP
  // asserted MFA (P12 §3); otherwise the assertion is a first factor and the MFA rules apply: an
  // enrolled YukthiX factor is still required, and the enrolment prompt / floor as for passwords.
  async issueTokensForSso(
    user: SessionUser & { permissionProfileId: string | null },
    meta: ClientMeta,
    sso: { method: 'saml' | 'oidc'; mfaAsserted: boolean; identityProviderId?: string | null } = { method: 'saml', mfaAsserted: false },
  ): Promise<LoginOutcome> {
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, meta.ip))) {
      await this.sessions.recordLoginEvent({
        organizationId: user.organizationId,
        userId: user.id,
        identifier: user.email.toLowerCase(),
        result: 'failed',
        method: sso.method,
        reason: 'ip_not_allowed',
        meta,
      });
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }
    const login = { method: sso.method, orgSlug: '', identifier: user.email.toLowerCase(), breakGlass: false, identityProviderId: sso.identityProviderId ?? null };
    // IdP-asserted MFA (only from a provider an admin trusts for it) never stands in for the
    // YukthiX factor of a break-glass account: those are the way in when the IdP is the problem.
    const breakGlass = user.organizationId
      ? (await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId)).breakGlassUserIds.includes(user.id)
      : false;
    if (sso.mfaAsserted && !breakGlass) {
      return this.finishSignIn(user, login, meta, 'idp');
    }
    if (await this.mfa.hasFactor(user)) {
      return this.challengeSecondFactor(user.id, login, meta);
    }
    return this.finishSignIn(user, login, meta);
  }

  // Only called from the two real login entry points (password login, SSO exchange) --
  // deliberately not folded into issueTokenPair(), which refresh() also calls on every
  // silent token rotation. Bumping this on every refresh would turn "last login" into
  // "last active", a different (and less useful) signal than the one the column promises.
  private async recordLogin(userId: string, organizationId: string | null, role: string): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: role === 'super_admin' }, (tx) =>
      tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
    );
  }

  // The acting token rides on the super admin's own session (`sid`): revoking that session
  // kills it too.
  async switchIntoOrg(actorUserId: string, targetOrgId: string, sessionId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) {
      throw new NotFoundException(`Organization ${targetOrgId} not found`);
    }

    await this.audit.record(
      { organizationId: targetOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_in', entityType: 'organization', entityId: targetOrgId },
    );

    return this.signAccessToken({
      sub: actorUserId,
      organizationId: targetOrgId,
      role: 'super_admin',
      permissionProfileId: null,
      actingSuperAdmin: true,
      actingOrgName: org.name,
      actingOrgSlug: org.slug,
      sid: sessionId,
    });
  }

  async recordSwitchOut(actorUserId: string, exitedOrgId: string | null): Promise<void> {
    if (!exitedOrgId) {
      return;
    }
    await this.audit.record(
      { organizationId: exitedOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_out', entityType: 'organization', entityId: exitedOrgId },
    );
  }

  async impersonate(
    caller: { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string; sessionId: string },
    targetUserId: string,
  ): Promise<string> {
    if (caller.impersonatorUserId) {
      throw new BadRequestException('Already impersonating another user');
    }
    if (caller.userId === targetUserId) {
      throw new BadRequestException('You cannot impersonate yourself');
    }

    const isSuper = caller.role === 'super_admin';
    const lookupContext = { organizationId: isSuper ? null : caller.organizationId, isSuperAdmin: isSuper };
    const { target, callerRecord } = await this.tenantPrisma.forTenant(lookupContext, async (tx) => ({
      target: await tx.user.findUnique({ where: { id: targetUserId } }),
      callerRecord: await tx.user.findUnique({ where: { id: caller.userId } }),
    }));

    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.status !== 'active') {
      throw new BadRequestException('Cannot impersonate a deactivated user');
    }
    if (isSuper) {
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot impersonate another platform administrator');
      }
    } else if (caller.role === 'org_admin') {
      const inOrg = target.organizationId === caller.organizationId;
      const impersonatable = target.role === 'recruiter' || target.role === 'panel' || target.role === 'hiring_manager';
      if (!inOrg || !impersonatable) {
        throw new ForbiddenException('You can only impersonate recruiter, hiring manager, or panel users in your own organization');
      }
    } else {
      throw new ForbiddenException('You are not allowed to impersonate users');
    }

    await this.audit.record(
      { organizationId: target.organizationId, isSuperAdmin: isSuper },
      { actorUserId: caller.userId, action: 'user.impersonate_start', entityType: 'user', entityId: target.id },
    );

    return this.signAccessToken({
      sub: target.id,
      organizationId: target.organizationId,
      role: target.role,
      permissionProfileId: null,
      impersonatorUserId: caller.userId,
      impersonatorEmail: callerRecord?.email ?? undefined,
      // The impersonator's session, not the target's: JwtStrategy checks it against
      // impersonatorUserId, and ending the impersonator's session ends the impersonation.
      sid: caller.sessionId,
    });
  }

  async recordImpersonationStop(impersonatorUserId: string, targetUserId: string): Promise<void> {
    // Look up the target's org so the stop event lands in the same audit scope as the
    // start event (filed under target.organizationId in impersonate() above). Routed
    // through forTenant's super_admin bypass since this method only receives user ids,
    // not a tenant context to query users with.
    const target = await this.tenantPrisma.forTenant(
      { organizationId: null, isSuperAdmin: true },
      (tx) => tx.user.findUnique({ where: { id: targetUserId }, select: { organizationId: true } }),
    );
    await this.audit.record(
      { organizationId: target?.organizationId ?? null, isSuperAdmin: true },
      { actorUserId: impersonatorUserId, action: 'user.impersonate_stop', entityType: 'user', entityId: targetUserId },
    );
  }

  private signAccessToken(payload: {
    sub: string;
    organizationId: string | null;
    role: string;
    permissionProfileId: string | null;
    actingSuperAdmin?: boolean;
    actingOrgName?: string;
    actingOrgSlug?: string;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
    sid: string;
  }): string {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` as `${number}s`,
    });
  }

  // The refresh family is the session, and the refresh token dies with the session's absolute
  // limit (never the old 30 days).
  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    permissionProfileId: string | null,
    session: { id: string; absoluteExpiresAt: Date },
  ): Promise<TokenPair> {
    const familyId = session.id;
    const accessToken = this.signAccessToken({ sub: userId, organizationId, role, permissionProfileId, sid: session.id });
    const refreshTtlSeconds = Math.max(1, Math.ceil((session.absoluteExpiresAt.getTime() - Date.now()) / 1000));
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      // jwtid: two rotations inside the same second must still yield distinct tokens (and hashes).
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${refreshTtlSeconds}s` as `${number}s`, jwtid: randomUUID() },
    );
    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt: session.absoluteExpiresAt },
    });

    return { accessToken, refreshToken };
  }
}
