import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { PLATFORM, platformRead } from './platform.service';
import { CustomerSuccessService, bandOf, dayPlus, istDay } from './customer-success.service';

type Tx = Prisma.TransactionClient;
type AlertStatus = 'open' | 'contacted' | 'resolved';

// Console 1165 (answers 1082, 1083). The nightly job keeps one health snapshot per company per India day (score and
// band only; a rerun on the same day replaces it), syncs the churn alerts into follow-ups (a new alert opens one owned
// by the company's Customer success owner; one that cleared by itself is resolved automatically) and purges snapshots
// older than cs.snapshot.keep_days. Staff with the Customer success key set a company's owner (only active staff
// holding the Customer success role), and an alert's owner and status, and log outreach notes. Everything is audited.

@Injectable()
export class CsFollowupService {
  private readonly logger = new Logger(CsFollowupService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cs: CustomerSuccessService,
  ) {}

  /** The nightly run (scheduled sweep 'cs-health-snapshot'). `only` limits it to these companies (tests). */
  async nightly(now = new Date(), only?: string[]) {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const { settings, rows: all } = await this.cs.healthRows(tx, now);
      const rows = only ? all.filter((r) => only.includes(r.id)) : all;
      const day = new Date(`${istDay(now)}T00:00:00Z`);
      for (const r of rows) {
        const band = bandOf(r.health);
        await tx.csHealthSnapshot.upsert({ where: { organizationId_day: { organizationId: r.id, day } }, create: { organizationId: r.id, day, score: r.health, band }, update: { score: r.health, band, takenAt: now } });
      }
      const synced = await this.syncAlerts(tx, rows, now);
      const keep = settings['cs.snapshot.keep_days'];
      const { count: purged } = await tx.csHealthSnapshot.deleteMany({ where: { day: { lt: new Date(`${dayPlus(istDay(now), -keep)}T00:00:00Z`) }, ...(only ? { organizationId: { in: only } } : {}) } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.cs.snapshot_taken', entityType: 'cs_health_snapshot', metadata: { day: istDay(now), companies: rows.length, ...synced, purged, keepDays: keep } });
      return { companies: rows.length, ...synced, purged };
    });
  }

  /** New alerts open a follow-up (owned by the company's owner); live follow-ups whose alert cleared resolve by themselves. */
  private async syncAlerts(tx: Tx, rows: { id: string; alertRules: { rule: string; text: string }[] }[], now: Date) {
    const ids = rows.map((r) => r.id);
    const [live, accounts] = await Promise.all([tx.csAlert.findMany({ where: { organizationId: { in: ids }, status: { not: 'resolved' } } }), tx.csAccount.findMany({ where: { organizationId: { in: ids } } })]);
    let opened = 0;
    let resolved = 0;
    for (const r of rows) {
      for (const a of r.alertRules) {
        const had = live.find((l) => l.organizationId === r.id && l.rule === a.rule);
        if (had) {
          if (had.text !== a.text) await tx.csAlert.update({ where: { id: had.id }, data: { text: a.text } });
          continue;
        }
        const owner = accounts.find((x) => x.organizationId === r.id)?.ownerUserId ?? null;
        const row = await tx.csAlert.create({ data: { organizationId: r.id, rule: a.rule, text: a.text, ownerUserId: owner } });
        await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.cs.alert_opened', entityType: 'cs_alert', entityId: row.id, metadata: { organizationId: r.id, rule: a.rule } });
        opened++;
      }
      for (const l of live.filter((x) => x.organizationId === r.id && !r.alertRules.some((a) => a.rule === x.rule))) {
        await tx.csAlert.update({ where: { id: l.id }, data: { status: 'resolved', resolvedAt: now, autoResolved: true, version: { increment: 1 } } });
        await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.cs.alert_resolved', entityType: 'cs_alert', entityId: l.id, metadata: { organizationId: r.id, rule: l.rule, automatically: true } });
        resolved++;
      }
    }
    return { opened, resolved };
  }

  /** Active staff holding the Customer success role: the only people who may own a company or an alert. */
  private async csStaff(tx: Tx) {
    const holders = await tx.platformStaffRole.findMany({ where: { role: 'customer_success' }, select: { userId: true } });
    return tx.user.findMany({ where: { id: { in: holders.map((h) => h.userId) }, organizationId: null, role: 'super_admin', status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
  }

  owners(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'customer_success.owners', async (tx) => (await this.csStaff(tx)).map((u) => ({ id: u.id, name: u.name?.trim() || u.email })));
  }

  private async assertOwner(tx: Tx, userId: string | null) {
    if (userId && !(await this.csStaff(tx)).some((u) => u.id === userId)) throw new BadRequestException('Choose an active member of staff with the Customer success role.');
  }

  async setOwner(actorUserId: string, organizationId: string, ownerUserId: string | null) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      if (!(await tx.organization.findFirst({ where: { id: organizationId, isPlatform: false }, select: { id: true } }))) throw new NotFoundException('Company not found');
      await this.assertOwner(tx, ownerUserId);
      const before = (await tx.csAccount.findUnique({ where: { organizationId } }))?.ownerUserId ?? null;
      await tx.csAccount.upsert({ where: { organizationId }, create: { organizationId, ownerUserId, setBy: actorUserId }, update: { ownerUserId, setBy: actorUserId, setAt: new Date() } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.cs.owner_set', entityType: 'organization', entityId: organizationId, metadata: { before, after: ownerUserId } });
    });
    return { organizationId, ownerUserId };
  }

  /** The follow-ups, newest first, with their notes (staff names only; account facts, never HR data). */
  async alerts(actorUserId: string, now = new Date()) {
    // Fresh before showing: the same sync as the nightly run (no snapshot, no purge).
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => this.syncAlerts(tx, (await this.cs.healthRows(tx, now)).rows, now));
    return platformRead(this.tenantPrisma, actorUserId, 'customer_success.alerts', async (tx) => {
      const rows = await tx.csAlert.findMany({ orderBy: [{ status: 'asc' }, { openedAt: 'desc' }], take: 500 });
      const notes = await tx.csAlertNote.findMany({ where: { alertId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'desc' } });
      const orgs = await tx.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } });
      const people = await tx.user.findMany({ where: { id: { in: [...new Set([...rows.map((r) => r.ownerUserId), ...notes.map((n) => n.writtenBy)].filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true, email: true } });
      const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name?.trim() || people.find((p) => p.id === id)?.email || null) : null);
      return rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        company: orgs.find((o) => o.id === r.organizationId)?.name ?? '',
        rule: r.rule,
        text: r.text,
        status: r.status as AlertStatus,
        owner: r.ownerUserId ? { id: r.ownerUserId, name: name(r.ownerUserId) } : null,
        openedAt: r.openedAt,
        resolvedAt: r.resolvedAt,
        autoResolved: r.autoResolved,
        version: r.version,
        notes: notes.filter((n) => n.alertId === r.id).map((n) => ({ id: n.id, note: n.note, by: name(n.writtenBy), at: n.createdAt })),
      }));
    });
  }

  async updateAlert(actorUserId: string, id: string, dto: { version: number; status?: AlertStatus; ownerUserId?: string | null }) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const a = await tx.csAlert.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Alert not found.');
      if (a.version !== dto.version) throw new ConflictException('Someone changed this alert since you opened it. Open it again.');
      if (a.status === 'resolved' && dto.status && dto.status !== 'resolved') throw new ConflictException('This alert is resolved. A new one opens if the problem comes back.');
      if (dto.ownerUserId !== undefined) await this.assertOwner(tx, dto.ownerUserId);
      const data: Prisma.CsAlertUpdateInput = { version: { increment: 1 } };
      if (dto.status) Object.assign(data, { status: dto.status, resolvedAt: dto.status === 'resolved' ? new Date() : null, autoResolved: false });
      if (dto.ownerUserId !== undefined) data.ownerUserId = dto.ownerUserId;
      await tx.csAlert.update({ where: { id }, data });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.cs.alert_updated', entityType: 'cs_alert', entityId: id, metadata: { organizationId: a.organizationId, before: { status: a.status, owner: a.ownerUserId }, after: { status: dto.status ?? a.status, owner: dto.ownerUserId === undefined ? a.ownerUserId : dto.ownerUserId } } });
    });
    return this.alerts(actorUserId);
  }

  /** Log outreach: a note on the alert; an open alert becomes contacted. */
  async outreach(actorUserId: string, id: string, note: string) {
    const text = note.trim();
    if (!text) throw new BadRequestException('Write what you did or agreed.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const a = await tx.csAlert.findUnique({ where: { id } });
      if (!a) throw new NotFoundException('Alert not found.');
      const n = await tx.csAlertNote.create({ data: { alertId: id, note: text, writtenBy: actorUserId } });
      if (a.status === 'open') await tx.csAlert.update({ where: { id }, data: { status: 'contacted', version: { increment: 1 } } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.cs.outreach_logged', entityType: 'cs_alert', entityId: id, metadata: { organizationId: a.organizationId, noteId: n.id, note: text } });
    });
    return this.alerts(actorUserId);
  }
}
