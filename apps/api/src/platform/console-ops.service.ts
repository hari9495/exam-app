import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditEntry, AuditService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { PLATFORM, platformRead, staffActor } from './platform.service';
import { FEATURES, Feature, featureOn } from './features';
import { CompanyContext } from '../org-structure/org-structure.service';

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;

// Console C-4 (answers 1049 and 1050). Feature switches: a default for every company, an override per company, and a
// kill switch for everyone (security key and a reason); a killed feature comes back only from a second staff member.
// Contain a company (YX-18): everyone signed out, connected apps revoked, exports, bank-detail changes and payouts held
// (ContainmentInterceptor, ProfileService), a banner; the breach clock from the platform settings; lifting takes a request
// by one staff member and the lift by another. Every change is audited: the platform log, and for a company the
// company's own log too (its admins see what YukthiX did).

@Injectable()
export class ConsoleOpsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async write<T>(actorUserId: string, fn: (tx: Tx, audit: (organizationId: string | null, entry: Omit<AuditEntry, 'actorUserId' | 'actor'>) => Promise<void>) => Promise<T>): Promise<T> {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    return this.tenantPrisma.forTenant(PLATFORM, (tx) =>
      fn(tx, async (organizationId, entry) => {
        const ctx: TenantContext = { organizationId, isSuperAdmin: true };
        await AuditService.recordIn(tx, ctx, { ...entry, actorUserId, actor });
      }),
    );
  }

  // ---------------------------------------------------------------------------------- feature switches (1049)

  /** Every switch with its default, kill state and the companies that differ from the default. */
  flags(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'feature switches', async (tx) => {
      const [flags, overrides] = await Promise.all([tx.featureFlag.findMany({ orderBy: { key: 'asc' } }), tx.featureFlagOverride.findMany({ orderBy: { setAt: 'desc' } })]);
      const orgs = await tx.organization.findMany({ where: { id: { in: [...new Set(overrides.map((o) => o.organizationId))] } }, select: { id: true, name: true } });
      return flags.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        defaultOn: f.defaultOn,
        killed: f.killedAt ? { at: f.killedAt.toISOString(), by: f.killedBy, reason: f.killReason } : null,
        overrides: overrides.filter((o) => o.flagKey === f.key).map((o) => ({ organizationId: o.organizationId, company: orgs.find((x) => x.id === o.organizationId)?.name ?? '', on: o.isOn, reason: o.reason, at: o.setAt.toISOString() })),
      }));
    });
  }

  private async flag(tx: Tx, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`feature-flag:${key}`}))`;
    const f = FEATURES.includes(key as Feature) ? await tx.featureFlag.findUnique({ where: { key } }) : null;
    if (!f) throw new NotFoundException('No such feature switch.');
    return f;
  }

  setDefault(actorUserId: string, key: string, on: boolean, reason: string) {
    return this.write(actorUserId, async (tx, audit) => {
      const f = await this.flag(tx, key);
      if (f.defaultOn === on) throw new ConflictException(`It is already ${on ? 'on' : 'off'} for every company.`);
      await tx.featureFlag.update({ where: { key }, data: { defaultOn: on, updatedBy: actorUserId, updatedAt: new Date() } });
      await audit(null, { action: 'platform.flag.default_changed', entityType: 'feature_flag', entityId: key, metadata: { on, reason } });
      return { key, defaultOn: on };
    });
  }

  /** A company's own value, or back to the default (on: null). */
  override(actorUserId: string, key: string, organizationId: string, on: boolean | null, reason: string) {
    return this.write(actorUserId, async (tx, audit) => {
      await this.flag(tx, key);
      if (!(await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException('Company not found');
      if (on === null) await tx.featureFlagOverride.deleteMany({ where: { organizationId, flagKey: key } });
      else await tx.featureFlagOverride.upsert({ where: { organizationId_flagKey: { organizationId, flagKey: key } }, create: { organizationId, flagKey: key, isOn: on, reason, setBy: actorUserId }, update: { isOn: on, reason, setBy: actorUserId, setAt: new Date() } });
      const entry = { action: on === null ? 'platform.flag.override_cleared' : 'platform.flag.override_set', entityType: 'feature_flag', entityId: key, metadata: { organizationId, on, reason } };
      await audit(null, entry);
      await audit(organizationId, entry);
      return { key, organizationId, on };
    });
  }

  /** The kill switch: off for every company at once, whatever its override (the route asks for the security key again). */
  kill(actorUserId: string, key: string, reason: string) {
    return this.write(actorUserId, async (tx, audit) => {
      const f = await this.flag(tx, key);
      if (f.killedAt) throw new ConflictException('The kill switch is already on for this feature.');
      await tx.featureFlag.update({ where: { key }, data: { killedAt: new Date(), killedBy: actorUserId, killReason: reason } });
      await audit(null, { action: 'platform.flag.killed', entityType: 'feature_flag', entityId: key, metadata: { reason } });
      return { key, killed: true };
    });
  }

  /** Back on after a kill: a second staff member, never the one who turned it off. */
  revive(actorUserId: string, key: string, reason: string) {
    return this.write(actorUserId, async (tx, audit) => {
      const f = await this.flag(tx, key);
      if (!f.killedAt) throw new ConflictException('The kill switch is not on for this feature.');
      if (f.killedBy === actorUserId) throw new ForbiddenException('You turned it off, so another staff member turns it back on.');
      await tx.featureFlag.update({ where: { key }, data: { killedAt: null, killedBy: null, killReason: null, updatedBy: actorUserId, updatedAt: new Date() } });
      await audit(null, { action: 'platform.flag.revived', entityType: 'feature_flag', entityId: key, metadata: { reason, killedBy: f.killedBy, killReason: f.killReason } });
      return { key, killed: false };
    });
  }

  /**
   * C-5's company page (answer 1053): each switch for one company, decided by the one feature check (featureOn), with
   * why it is off: killed for everyone, off for this company, off by default, or off in the company's own settings.
   */
  companySwitches(actorUserId: string, organizationId: string) {
    return platformRead(this.tenantPrisma, actorUserId, `feature switches of company ${organizationId}`, async (tx) => {
      if (!(await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException('Company not found');
      const c = { organizationId } as CompanyContext;
      const flags = await tx.featureFlag.findMany({ where: { key: { in: [...FEATURES] } }, orderBy: { key: 'asc' } });
      const overrides = await tx.featureFlagOverride.findMany({ where: { organizationId } });
      const out = [];
      for (const f of flags) {
        const o = overrides.find((x) => x.flagKey === f.key);
        const on = await featureOn(tx, c, f.key as Feature);
        const why = on ? null : f.killedAt ? 'Killed for everyone' : o ? (o.isOn ? 'Off in company settings' : 'Off for this company') : f.defaultOn ? 'Off in company settings' : 'Off by default';
        out.push({ key: f.key, label: f.label, on, why, defaultOn: f.defaultOn, override: o ? o.isOn : null, killed: Boolean(f.killedAt) });
      }
      return out;
    });
  }

  // ---------------------------------------------------------------------------------- contain a company (1050)

  private async hours(tx: Tx, key: string, fallback: number) {
    const v = Number((await tx.platformSetting.findUnique({ where: { key } }))?.value);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  /** The company's containment now (or the last one), the breach clock and what containing would do. */
  containment(actorUserId: string, organizationId: string) {
    return platformRead(this.tenantPrisma, actorUserId, `containment of company ${organizationId}`, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
      if (!org) throw new NotFoundException('Company not found');
      const row = await tx.companyContainment.findFirst({ where: { organizationId }, orderBy: { containedAt: 'desc' } });
      const [users, apps] = await Promise.all([tx.user.count({ where: { organizationId, status: 'active' } }), this.apps(tx, organizationId, false)]);
      const view = row && {
        id: row.id,
        open: !row.liftedAt,
        reason: row.reason,
        containedBy: row.containedByName,
        containedAt: row.containedAt.toISOString(),
        certinDueAt: row.certinDueAt.toISOString(),
        dpdpDueAt: row.dpdpDueAt.toISOString(),
        signedOut: row.signedOut,
        appsRevoked: row.appsRevoked,
        liftRequest: row.liftRequestedAt ? { by: row.liftRequestedByName, byMe: row.liftRequestedBy === actorUserId, at: row.liftRequestedAt.toISOString(), reason: row.liftReason } : null,
        lifted: row.liftedAt ? { by: row.liftedByName, at: row.liftedAt.toISOString() } : null,
      };
      return { company: { id: org.id, name: org.name }, users, apps, containment: view, breach: { certinHours: await this.hours(tx, 'breach.certin_hours', 6), dpdpHours: await this.hours(tx, 'breach.dpdp_board_report_hours', 72) } };
    });
  }

  /** Connected apps: webhooks to other systems, automation webhooks, work tools and calendars. Counted, or revoked. */
  private async apps(tx: Tx, organizationId: string, revoke: boolean): Promise<number> {
    if (!revoke) {
      const n = await Promise.all([
        tx.orgIntegration.count({ where: { organizationId, status: 'active' } }),
        tx.automationWebhook.count({ where: { organizationId, active: true } }),
        tx.toolConnection.count({ where: { organizationId, status: 'connected' } }),
        tx.calendarConnection.count({ where: { organizationId } }),
      ]);
      return n.reduce((a, b) => a + b, 0);
    }
    const now = new Date();
    const n = await Promise.all([
      tx.orgIntegration.updateMany({ where: { organizationId, status: 'active' }, data: { status: 'disabled' } }).then((r) => r.count),
      tx.automationWebhook.updateMany({ where: { organizationId, active: true }, data: { active: false } }).then((r) => r.count),
      tx.toolConnection.updateMany({ where: { organizationId, status: 'connected' }, data: { status: 'revoked', revokedAt: now } }).then((r) => r.count),
      // A calendar connection is its OAuth tokens: revoking it is removing them (the person connects again).
      tx.calendarConnection.deleteMany({ where: { organizationId } }).then((r) => r.count),
    ]);
    return n.reduce((a, b) => a + b, 0);
  }

  async contain(actorUserId: string, organizationId: string, reason: string) {
    await this.write(actorUserId, async (tx, audit) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contain:${organizationId}`}))`;
      if (!(await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException('Company not found');
      if (await tx.companyContainment.findFirst({ where: { organizationId, liftedAt: null }, select: { id: true } })) throw new ConflictException('This company is already contained.');
      const actor = await staffActor(this.tenantPrisma, actorUserId);
      const now = Date.now();
      const signedOut = await revokeStaffSessions(tx, { organizationId }, 'company_contained');
      await tx.refreshToken.updateMany({ where: { revokedAt: null, user: { organizationId } }, data: { revokedAt: new Date(now) } });
      // A support session ends too: nobody acts inside a contained company.
      await tx.supportSession.updateMany({ where: { organizationId, status: 'approved' }, data: { status: 'ended', endedBy: actorUserId, endedByName: actor.label.slice(0, 200), endedAt: new Date(now) } });
      const appsRevoked = await this.apps(tx, organizationId, true);
      const row = await tx.companyContainment.create({
        data: {
          organizationId,
          reason,
          containedBy: actorUserId,
          containedByName: actor.label.slice(0, 200),
          containedAt: new Date(now),
          certinDueAt: new Date(now + (await this.hours(tx, 'breach.certin_hours', 6)) * HOUR),
          dpdpDueAt: new Date(now + (await this.hours(tx, 'breach.dpdp_board_report_hours', 72)) * HOUR),
          signedOut,
          appsRevoked,
        },
      });
      const entry = { action: 'platform.company.contained', entityType: 'organization', entityId: organizationId, metadata: { containmentId: row.id, reason, signedOut, appsRevoked, certinDueAt: row.certinDueAt.toISOString(), dpdpDueAt: row.dpdpDueAt.toISOString() } };
      await audit(null, entry);
      await audit(organizationId, entry);
    });
    return this.containment(actorUserId, organizationId);
  }

  private async open(tx: Tx, organizationId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contain:${organizationId}`}))`;
    const row = await tx.companyContainment.findFirst({ where: { organizationId, liftedAt: null } });
    if (!row) throw new ConflictException('This company is not contained.');
    return row;
  }

  /** The first of the two people: asks for the lift, with a reason. */
  async requestLift(actorUserId: string, organizationId: string, reason: string) {
    await this.write(actorUserId, async (tx, audit) => {
      const row = await this.open(tx, organizationId);
      if (row.liftRequestedAt) throw new ConflictException('A lift is already waiting for a second staff member.');
      const actor = await staffActor(this.tenantPrisma, actorUserId);
      await tx.companyContainment.update({ where: { id: row.id }, data: { liftRequestedBy: actorUserId, liftRequestedByName: actor.label.slice(0, 200), liftRequestedAt: new Date(), liftReason: reason } });
      const entry = { action: 'platform.company.lift_requested', entityType: 'organization', entityId: organizationId, metadata: { containmentId: row.id, reason } };
      await audit(null, entry);
      await audit(organizationId, entry);
    });
    return this.containment(actorUserId, organizationId);
  }

  /** The second person lifts it: the holds end. Never the one who asked (also a database check). */
  async lift(actorUserId: string, organizationId: string) {
    await this.write(actorUserId, async (tx, audit) => {
      const row = await this.open(tx, organizationId);
      if (!row.liftRequestedAt) throw new BadRequestException('Ask for the lift first; a second staff member then lifts it.');
      if (row.liftRequestedBy === actorUserId) throw new ForbiddenException('You asked for the lift, so another staff member lifts it.');
      const actor = await staffActor(this.tenantPrisma, actorUserId);
      await tx.companyContainment.update({ where: { id: row.id }, data: { liftedBy: actorUserId, liftedByName: actor.label.slice(0, 200), liftedAt: new Date() } });
      const entry = { action: 'platform.company.lifted', entityType: 'organization', entityId: organizationId, metadata: { containmentId: row.id, requestedBy: row.liftRequestedBy } };
      await audit(null, entry);
      await audit(organizationId, entry);
    });
    return this.containment(actorUserId, organizationId);
  }
}
