import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, OtpService, maskMobile } from '../auth/otp.service';
import { NIGHT_PROTECTED_GENDERS } from './schedule';
import { dateOf, myEmployeeId } from './time-core';

// Me › Attendance › Night work (founder decisions 9 Oct 2026, YX-AT-25 / 26):
//   - the protection covers people recorded as female or transgender; anyone may opt in to the same protection. The
//     opt-in is self-service and audited, HR sees it on Shifts set-up, and only the person can turn it off (there is
//     no HR path that removes it);
//   - a consent HR records (with the signed form's reference) counts only once the worker confirms it here with a
//     one-time code (the P12 OTP service: 6 digits, kept as an HMAC, 5 minutes, 5 tries, rate-limited sends);
//   - the worker may withdraw a consent here too; it applies from today and is never a ground for adverse action.

const codeKey = (org: string, consentId: string, userId: string) => `time:night-consent:${org}:${consentId}:${userId}`;

@Injectable()
export class NightWorkService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly otp: OtpService,
  ) {}

  /** Only the person themselves, never someone acting for them. */
  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }

  private async mine(tx: Tx, org: string, userId: string | null | undefined, consentId: string) {
    const me = await myEmployeeId(tx, org, userId);
    const x = await tx.nightWorkConsent.findFirst({ where: { organizationId: org, id: consentId, employeeId: me } });
    if (!x) throw new NotFoundException('No such consent.');
    return x;
  }

  me(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const [pd, optIn, consents] = await Promise.all([
        tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: me }, select: { gender: true } }),
        tx.nightWorkOptIn.findUnique({ where: { organizationId_employeeId: { organizationId: org, employeeId: me } } }),
        tx.nightWorkConsent.findMany({ where: { organizationId: org, employeeId: me }, orderBy: { givenOn: 'desc' } }),
      ]);
      const locations = await tx.location.findMany({ where: { organizationId: org, id: { in: consents.map((x) => x.locationId) } }, select: { id: true, name: true } });
      return {
        byRecord: NIGHT_PROTECTED_GENDERS.includes(pd?.gender ?? ''),
        optedIn: Boolean(optIn),
        optedInSince: optIn?.since ?? null,
        consents: consents.map((x) => ({ id: x.id, location: locations.find((l) => l.id === x.locationId)?.name ?? '', givenOn: dateOf(x.givenOn), withdrawnOn: x.withdrawnOn ? dateOf(x.withdrawnOn) : null, reference: x.reference, confirmedAt: x.confirmedAt })),
      };
    });
  }

  async setOptIn(ctx: TenantContext, user: ScopeUser, optIn: boolean) {
    this.self(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const key = { organizationId_employeeId: { organizationId: org, employeeId: me } };
      const now = await tx.nightWorkOptIn.findUnique({ where: key });
      if (optIn === Boolean(now)) return;
      if (optIn) await tx.nightWorkOptIn.create({ data: { organizationId: org, employeeId: me } });
      else await tx.nightWorkOptIn.delete({ where: key });
      await audit(tx, c, optIn ? 'time.night_protection.opted_in' : 'time.night_protection.opted_out', 'employee', me, {});
    });
    return this.me(ctx);
  }

  /** Sends a one-time code to confirm a consent: by text to a verified mobile where the company can, else by email. */
  async sendCode(ctx: TenantContext, user: ScopeUser, consentId: string, ip: string | null) {
    this.self(user);
    const { org, to } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await this.mine(tx, c.organizationId, c.userId, consentId);
      if (x.withdrawnOn) throw new ConflictException('That consent is withdrawn.');
      if (x.confirmedAt) throw new ConflictException('You have already confirmed that consent.');
      const u = await tx.user.findFirstOrThrow({ where: { organizationId: c.organizationId, id: c.userId! }, select: { email: true, mobileNumber: true, mobileVerifiedAt: true } });
      return { org: c.organizationId, to: u };
    });
    await this.otp.reserveSend(`night-consent\u0000${user.userId}\u0000${consentId}`, ip);
    const code = await this.otp.issue(codeKey(org, consentId, user.userId!), { userId: user.userId! });
    const text = Boolean(to.mobileNumber && to.mobileVerifiedAt) && (await this.otp.channelAvailable('sms', org));
    if (text) this.otp.deliver('sms', to.mobileNumber!, code, 'mfa', org, { userId: user.userId!, fallbackEmail: to.email });
    else this.otp.deliver('email', to.email, code, 'mfa', org, { userId: user.userId! });
    return { sentTo: text ? maskMobile(to.mobileNumber!) : 'your work email', expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  confirm(ctx: TenantContext, user: ScopeUser, consentId: string, code: string) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await this.mine(tx, c.organizationId, c.userId, consentId);
      if (x.withdrawnOn) throw new ConflictException('That consent is withdrawn.');
      if (x.confirmedAt) throw new ConflictException('You have already confirmed that consent.');
      if (!(await this.otp.check(codeKey(c.organizationId, consentId, c.userId!), code))) throw new BadRequestException('That code did not work. Check it, or ask for a new one.');
      await tx.nightWorkConsent.update({ where: { id: x.id }, data: { confirmedAt: new Date(), confirmedBy: c.userId ?? null } });
      await audit(tx, c, 'time.night_consent.confirmed', 'night_work_consent', x.id, { employeeId: x.employeeId, method: 'one_time_code' });
      return { id: x.id };
    });
  }

  /** The worker's own withdrawal, from today (or from the day it starts, for one not yet in force). */
  withdraw(ctx: TenantContext, user: ScopeUser, consentId: string) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await this.mine(tx, c.organizationId, c.userId, consentId);
      if (x.withdrawnOn) throw new ConflictException('That consent is already withdrawn.');
      const on = [todayIst(), dateOf(x.givenOn)].sort()[1];
      await tx.nightWorkConsent.update({ where: { id: x.id }, data: { withdrawnOn: new Date(`${on}T00:00:00Z`) } });
      await audit(tx, c, 'time.night_consent.withdrawn', 'night_work_consent', x.id, { employeeId: x.employeeId, on, by: 'employee' });
      return { id: x.id, withdrawnOn: on };
    });
  }
}
