import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { AuditService, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { appUrl, staffInviteEmail } from '../email/account-emails';
import { ACCOUNT_SETUP_EXPIRY_HOURS, issuePasswordToken } from '../auth/password-tokens';
import { PLATFORM, platformRead } from './platform.service';

// Console staff roles (founder answers 1058, 1086): five roles, each a fixed set of platform.* keys (platform_role_keys,
// set by migrations). A member of staff holds the keys of their roles; nobody holds every key by default. Only a
// Security lead changes roles, with the security key again (the route), never their own, and the last active Security
// lead keeps the role (all three also in platform_set_staff_roles). Every change is in the platform audit log.

export const STAFF_ROLES = ['support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  support_agent: 'Support agent',
  customer_success: 'Customer success',
  rules_editor: 'Rules editor',
  finance: 'Finance',
  security_lead: 'Security lead',
};

/** The database's refusals in plain words with the right status. */
function refusal(e: unknown): never {
  const m = (e as Error).message ?? '';
  if (/YX_STAFF_SELF: nobody deactivates/.test(m)) throw new ForbiddenException('You cannot deactivate yourself. Ask another Security lead.');
  if (/YX_STAFF_SELF: nobody reactivates/.test(m)) throw new ForbiddenException('You cannot reactivate yourself. Ask another Security lead.');
  if (/YX_STAFF_SELF/.test(m)) throw new ForbiddenException('You cannot change your own roles. Ask another Security lead.');
  if (/YX_STAFF_NOT_LEAD/.test(m)) throw new ForbiddenException('Only a Security lead changes staff roles.');
  if (/YX_STAFF_NOT_FOUND/.test(m)) throw new NotFoundException('No such member of staff.');
  if (/YX_STAFF_LAST_LEAD: the last Security lead stays active/.test(m)) throw new ConflictException('The last Security lead stays active. Make someone else a Security lead first.');
  if (/YX_STAFF_LAST_LEAD/.test(m)) throw new ConflictException('The last Security lead keeps the role. Make someone else a Security lead first.');
  if (/YX_STAFF_ROLE/.test(m)) throw new BadRequestException('Choose from the five staff roles.');
  if (/YX_STAFF_STATE: not deactivated/.test(m)) throw new ConflictException('This member of staff is active. Only a deactivated account is reactivated.');
  if (/YX_STAFF_STATE/.test(m)) throw new ConflictException('This member of staff is already deactivated.');
  throw e;
}

/** What each console key lets a member of staff do, in plain words (My security, answer 1166). */
export const KEY_WORDS: Record<string, string> = {
  'platform.companies.view': 'See companies',
  'platform.companies.manage': 'Create companies and change their lifecycle',
  'platform.plans.manage': 'Set prices',
  'platform.channels.manage': 'Run the shared SMS account',
  'platform.support.request': 'Ask a company for a support session',
  'platform.support_desk.work': 'Work the Support desk',
  'platform.customers.success': 'Customer health, alerts and messages to company admins',
  'platform.news.manage': "Write What's new",
  'platform.statutory.manage': 'Draft, review and publish rule sets',
  'platform.audit.view': 'Read the platform audit log',
  'platform.staff.manage': 'Add, deactivate and give roles to staff',
  'platform.company.contain': 'Contain a company after a suspected breach',
  'platform.flags.manage': 'Switch features on and off',
  'platform.maintenance.manage': 'Schedule planned maintenance',
  'platform.maintenance.view': 'See planned maintenance',
  'platform.helpcentre.write': 'Write and publish the help-centre articles',
  'platform.settings.manage': 'Change the platform settings',
  'platform.incidents.manage': 'Run incidents and the status page; breach reminders',
};

/** Answer 1173: how many times a day the invitation may be sent again to one person (platform setting). */
export const RESEND_KEY = 'staff.invite.resends_per_day';
/** Answer 1243: days after the latest invitation before an invited member of staff who never signed in is deactivated. */
export const INVITE_EXPIRE_KEY = 'staff.invite.expire_days';
export const INVITE_EXPIRE_DEFAULT = 30;
export const RESEND_DEFAULT = 3;
/** The start of today in India (IST, UTC+5:30). */
const istDayStart = (now: Date) => {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
};

@Injectable()
export class StaffRolesService {
  private readonly logger = new Logger(StaffRolesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
  ) {}

  /** Answer 1166: the signed-in member of staff's own roles and what each lets them do (read outside any company). */
  async mine(userId: string) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: false }, async (tx) => {
      const [roles, keys] = await Promise.all([tx.platformStaffRole.findMany({ where: { userId }, select: { role: true } }), tx.platformRoleKey.findMany()]);
      return STAFF_ROLES.filter((r) => roles.some((x) => x.role === r)).map((r) => ({ role: r, label: STAFF_ROLE_LABEL[r], does: keys.filter((k) => k.role === r).map((k) => KEY_WORDS[k.key] ?? k.key) }));
    });
  }

  /**
   * Answer 1164: a Security lead adds a member of staff. The account has no role (so no console key) until one is given;
   * the invitation sets a password, and the console asks for a security key before anything else.
   */
  async invite(actorUserId: string, input: { email: string; name: string; reason: string }) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const { id, rawToken } = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      if (await tx.user.findFirst({ where: { organizationId: null, email }, select: { id: true } })) throw new ConflictException('A YukthiX staff account with this email already exists.');
      const user = await tx.user.create({ data: { organizationId: null, email, name: input.name.trim(), passwordHash, role: 'super_admin', mfaEnrolmentDueAt: new Date() }, select: { id: true } });
      const token = await issuePasswordToken(tx, user.id, 'setup');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.invited', entityType: 'user', entityId: user.id, metadata: { email, name: input.name.trim(), reason: input.reason } });
      return { id: user.id, rawToken: token };
    });
    try {
      const mail = await staffInviteEmail(email, appUrl(`/yx/reset-password/${rawToken}`), ACCOUNT_SETUP_EXPIRY_HOURS);
      await this.email.send({ to: email, ...mail });
    } catch (e) {
      this.logger.error(`Failed to send the staff invitation to ${email}`, e as Error);
    }
    return { id, email, roles: [] as StaffRole[] };
  }

  /**
   * Answer 1171: a Security lead reactivates a deactivated member of staff (never themselves). They come back with the
   * roles they held (answer 1172 kept them, so a Security lead decides on purpose what they hold) and sign in again
   * with their security key: every session and refresh token is ended again here.
   */
  async reactivate(actorUserId: string, userId: string, reason: string) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      try {
        await tx.$executeRaw`SELECT platform_reactivate_staff(${userId}::uuid, ${actorUserId}::uuid)`;
      } catch (e) {
        refusal(e);
      }
      await revokeStaffSessions(tx, { userId }, 'reactivated');
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      const roles = (await tx.platformStaffRole.findMany({ where: { userId }, select: { role: true } })).map((r) => r.role);
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.reactivated', entityType: 'user', entityId: userId, metadata: { reason, roles } });
      return { id: userId, active: true, roles: STAFF_ROLES.filter((r) => roles.includes(r)) };
    });
  }

  /**
   * Answer 1173: a Security lead sends the invitation again to a member of staff who never signed in. The new link
   * retires the old one; at most staff.invite.resends_per_day sends a day per person (an India day; 3 by default).
   */
  async resendInvite(actorUserId: string, userId: string, reason: string, now = new Date()) {
    const { email, rawToken } = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      // One at a time per person, so two clicks cannot both pass the daily limit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-invite:${userId}`}))`;
      const user = await tx.user.findFirst({ where: { id: userId, organizationId: null, role: 'super_admin' }, select: { email: true, status: true, lastLoginAt: true } });
      if (!user) throw new NotFoundException('No such member of staff.');
      if (user.status !== 'active') throw new ConflictException('This member of staff is deactivated. Reactivate them first.');
      if (user.lastLoginAt) throw new ConflictException('They have already signed in, so there is no invitation to send. They can use "Forgot password".');
      const limit = Number((await tx.platformSetting.findUnique({ where: { key: RESEND_KEY } }))?.value) || RESEND_DEFAULT;
      const dayStart = istDayStart(now);
      const sent = await tx.auditLog.count({ where: { organizationId: null, action: 'platform.staff.invite_resent', entityId: userId, createdAt: { gte: dayStart } } });
      if (sent >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((dayStart.getTime() + 86_400_000 - now.getTime()) / 1000));
        throw new HttpException({ statusCode: 429, code: 'INVITE_LIMIT', message: `The invitation was already sent ${limit} times today. Try again tomorrow.`, retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
      }
      const token = await issuePasswordToken(tx, userId, 'setup');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.invite_resent', entityType: 'user', entityId: userId, metadata: { reason, sendToday: sent + 1, limit } });
      return { email: user.email, rawToken: token };
    });
    try {
      const mail = await staffInviteEmail(email, appUrl(`/yx/reset-password/${rawToken}`), ACCOUNT_SETUP_EXPIRY_HOURS);
      await this.email.send({ to: email, ...mail });
    } catch (e) {
      this.logger.error(`Failed to send the staff invitation again to ${email}`, e as Error);
    }
    return { id: userId, sent: true };
  }

  /** Answer 1164: a Security lead deactivates another member of staff (never themselves, never the last Security lead). */
  async deactivate(actorUserId: string, userId: string, reason: string) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      try {
        await tx.$executeRaw`SELECT platform_deactivate_staff(${userId}::uuid, ${actorUserId}::uuid)`;
      } catch (e) {
        refusal(e);
      }
      // Signed out everywhere at once.
      const sessions = await revokeStaffSessions(tx, { userId }, 'deactivated');
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.deactivated', entityType: 'user', entityId: userId, metadata: { reason, sessionsEnded: sessions } });
      return { id: userId, active: false };
    });
  }

  /** Every staff account with its roles, and what each role holds (who holds what, answer 1058). */
  async list(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'staff.roles', async (tx) => {
      const [staff, roles, keys] = await Promise.all([
        tx.user.findMany({ where: { organizationId: null, role: 'super_admin' }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }] }),
        tx.platformStaffRole.findMany({ select: { userId: true, role: true } }),
        tx.platformRoleKey.findMany({ orderBy: [{ role: 'asc' }, { key: 'asc' }] }),
      ]);
      const leads = new Set(roles.filter((r) => r.role === 'security_lead').map((r) => r.userId));
      const activeLeads = staff.filter((s) => s.status === 'active' && leads.has(s.id)).length;
      return {
        roles: STAFF_ROLES.map((r) => ({ role: r, label: STAFF_ROLE_LABEL[r], keys: keys.filter((k) => k.role === r).map((k) => k.key) })),
        staff: staff.map((s) => ({
          id: s.id,
          name: s.name?.trim() || s.email,
          email: s.email,
          active: s.status === 'active',
          // Answer 1173: never signed in, so the invitation can be sent again.
          invited: s.status === 'active' && !s.lastLoginAt,
          me: s.id === actorUserId,
          roles: STAFF_ROLES.filter((r) => roles.some((x) => x.userId === s.id && x.role === r)),
          lastLead: s.status === 'active' && leads.has(s.id) && activeLeads === 1,
        })),
      };
    });
  }

  /** A Security lead sets another member of staff's roles (never their own; the last Security lead keeps it). */
  async setRoles(actorUserId: string, userId: string, roles: StaffRole[], reason: string) {
    const want = [...new Set(roles)];
    if (want.some((r) => !STAFF_ROLES.includes(r))) throw new BadRequestException('Choose from the five staff roles.');
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      let before: string[];
      try {
        const [row] = await tx.$queryRaw<{ before: string[] }[]>`SELECT platform_set_staff_roles(${userId}::uuid, ${want}::text[], ${actorUserId}::uuid) AS before`;
        before = row!.before;
      } catch (e) {
        refusal(e);
      }
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.roles_changed', entityType: 'user', entityId: userId, metadata: { from: before, to: STAFF_ROLES.filter((r) => want.includes(r)), reason } });
      return { id: userId, roles: STAFF_ROLES.filter((r) => want.includes(r)) };
    });
  }

  /**
   * Answer 1243 (nightly sweep 'staff-invite-expiry'): deactivates invited staff who never signed in, more than
   * staff.invite.expire_days after their latest invitation, as the system. The database function never touches anyone
   * who has signed in, nor the last active Security lead; a rerun finds nobody new. Audited per person and once per run.
   */
  async expireInvites(now = new Date()) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const v = Number((await tx.platformSetting.findUnique({ where: { key: INVITE_EXPIRE_KEY } }))?.value);
      const days = Number.isInteger(v) && v >= 7 && v <= 90 ? v : INVITE_EXPIRE_DEFAULT;
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT platform_expire_invited_staff(${days}::int, ${now}::timestamptz) AS id`;
      for (const r of rows) {
        await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.staff.deactivated', entityType: 'user', entityId: r.id, metadata: { automatically: true, reason: `Invited and never signed in for more than ${days} days`, [INVITE_EXPIRE_KEY]: days } });
      }
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.staff.invites_expired', entityType: 'platform_setting', entityId: INVITE_EXPIRE_KEY, metadata: { [INVITE_EXPIRE_KEY]: days, deactivated: rows.map((r) => r.id) } });
      return { days, deactivated: rows.map((r) => r.id) };
    });
  }

}
