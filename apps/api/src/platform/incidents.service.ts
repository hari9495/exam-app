import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { PLATFORM, platformRead } from './platform.service';
import type { IncidentOpenDto, IncidentReviewDto, IncidentUpdateDto } from './incidents.dto';

type Tx = Prisma.TransactionClient;
const LEAD_KEY = 'incident.breach_reminder_lead_hours';
const LEAD_DEFAULT = 1;
const HOUR = 3_600_000;
export const incidentRef = (n: number) => `INC-${String(n).padStart(3, '0')}`;
const istTime = (d: Date) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Answer 1124: which breach clocks are due for their reminder now (the due time less the lead hours), not yet sent. */
export function dueReminders(i: { certinRemindedAt: Date | null; dpdpRemindedAt: Date | null }, c: { certinDueAt: Date; dpdpDueAt: Date }, leadHours: number, now: Date) {
  const due: ('certin' | 'dpdp')[] = [];
  if (!i.certinRemindedAt && now.getTime() >= c.certinDueAt.getTime() - leadHours * HOUR) due.push('certin');
  if (!i.dpdpRemindedAt && now.getTime() >= c.dpdpDueAt.getTime() - leadHours * HOUR) due.push('dpdp');
  return due;
}

/**
 * YukthiX console C-8, YX-10 incidents. Staff open an incident (title, severity, affected products) with its first status
 * update; every update is posted only when a second staff member (never the writer) approves it. While an incident is
 * open, every company with an affected product sees its latest posted update in the C-5 availability banner (one
 * endpoint, `GET /availability`). A security breach is never shown to other companies. Answer 1124: an incident marked as
 * a security breach and linked to a containment reminds the incident staff before the CERT-In and DPDP due times.
 */
/** Staff roles (answer 1058): the active staff whose roles hold the incidents key (the Security leads) get the reminders. */
async function incidentHolders(tx: Prisma.TransactionClient) {
  const roles = (await tx.platformRoleKey.findMany({ where: { key: 'platform.incidents.manage' }, select: { role: true } })).map((r) => r.role);
  const ids = [...new Set((await tx.platformStaffRole.findMany({ where: { role: { in: roles } }, select: { userId: true } })).map((r) => r.userId))];
  return tx.user.findMany({ where: { id: { in: ids }, organizationId: null, role: 'super_admin', status: 'active' }, select: { email: true } });
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
  ) {}

  private async leadHours(tx: Tx) {
    const v = Number((await tx.platformSetting.findUnique({ where: { key: LEAD_KEY } }))?.value);
    return Number.isInteger(v) && v >= 0 ? v : LEAD_DEFAULT;
  }

  /** Staff: every incident with its updates, the open containments a breach can be linked to, products and the rule. */
  async overview(actorUserId: string) {
    // The containments name companies: an audited cross-company read.
    return platformRead(this.tenantPrisma, actorUserId, 'incidents.overview', async (tx) => {
      const rows = await tx.platformIncident.findMany({ orderBy: { openedAt: 'desc' }, take: 100, include: { updates: { orderBy: { createdAt: 'desc' } } } });
      const containments = await tx.companyContainment.findMany({ where: { OR: [{ liftedAt: null }, { id: { in: rows.flatMap((r) => (r.containmentId ? [r.containmentId] : [])) } }] }, orderBy: { containedAt: 'desc' }, take: 100 });
      const orgs = new Map((await tx.organization.findMany({ where: { id: { in: containments.map((c) => c.organizationId) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
      const ids = [...new Set(rows.flatMap((r) => [r.openedBy, ...r.updates.flatMap((u) => [u.writtenBy, u.reviewedBy ?? ''])]).filter(Boolean))];
      const names = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      const cView = (c: (typeof containments)[number]) => ({ id: c.id, company: orgs.get(c.organizationId) ?? '', containedAt: c.containedAt.toISOString(), certinDueAt: c.certinDueAt.toISOString(), dpdpDueAt: c.dpdpDueAt.toISOString(), open: !c.liftedAt });
      const byId = new Map(containments.map((c) => [c.id, c]));
      return {
        incidents: rows.map((r) => {
          const posted = r.updates.find((u) => u.status === 'posted');
          const c = r.containmentId ? byId.get(r.containmentId) : undefined;
          return {
            id: r.id,
            ref: incidentRef(r.number),
            title: r.title,
            severity: r.severity,
            products: r.products,
            status: r.status,
            stage: posted?.stage ?? null,
            openedAt: r.openedAt.toISOString(),
            openedBy: names.get(r.openedBy) ?? '',
            resolvedAt: r.resolvedAt?.toISOString() ?? null,
            securityBreach: r.securityBreach,
            breach: c ? { ...cView(c), certinRemindedAt: r.certinRemindedAt?.toISOString() ?? null, dpdpRemindedAt: r.dpdpRemindedAt?.toISOString() ?? null } : null,
            updates: r.updates.map((u) => ({
              id: u.id,
              stage: u.stage,
              impact: u.impact,
              action: u.action,
              nextUpdateAt: u.nextUpdateAt?.toISOString() ?? null,
              status: u.status,
              writtenBy: names.get(u.writtenBy) ?? '',
              mine: u.writtenBy === actorUserId,
              reviewedBy: u.reviewedBy ? (names.get(u.reviewedBy) ?? '') : null,
              reviewNote: u.reviewNote,
              createdAt: u.createdAt.toISOString(),
            })),
          };
        }),
        containments: containments.filter((c) => !c.liftedAt).map(cView),
        products: await tx.product.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } }),
        settings: { leadHours: await this.leadHours(tx), leadHoursDefault: LEAD_DEFAULT },
      };
    });
  }

  private nextAt(dto: IncidentUpdateDto) {
    return dto.stage === 'resolved' || !dto.nextUpdateMinutes ? null : new Date(Date.now() + dto.nextUpdateMinutes * 60_000);
  }

  async open(actorUserId: string, dto: IncidentOpenDto) {
    const products = [...new Set(dto.products)];
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const known = await tx.product.findMany({ where: { code: { in: products } }, select: { code: true } });
      if (known.length !== products.length) throw new BadRequestException('Choose products from the list.');
      const i = await tx.platformIncident.create({ data: { title: dto.title, severity: dto.severity, products, openedBy: actorUserId } });
      await tx.platformIncidentUpdate.create({ data: { incidentId: i.id, stage: dto.stage, impact: dto.impact, action: dto.action, nextUpdateAt: this.nextAt(dto), writtenBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.incident.opened', entityType: 'platform_incident', entityId: i.id, metadata: { ref: incidentRef(i.number), title: i.title, severity: i.severity, products } });
    });
    return this.overview(actorUserId);
  }

  async postUpdate(actorUserId: string, id: string, dto: IncidentUpdateDto) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const i = await tx.platformIncident.findUnique({ where: { id } });
      if (!i) throw new NotFoundException('Incident not found.');
      if (i.status !== 'open') throw new ConflictException('This incident is resolved.');
      if (await tx.platformIncidentUpdate.findFirst({ where: { incidentId: id, status: 'pending' }, select: { id: true } })) throw new ConflictException('An update is already waiting for approval. Approve or send it back first.');
      const u = await tx.platformIncidentUpdate.create({ data: { incidentId: id, stage: dto.stage, impact: dto.impact, action: dto.action, nextUpdateAt: this.nextAt(dto), writtenBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.incident.update_written', entityType: 'platform_incident', entityId: id, metadata: { updateId: u.id, stage: u.stage } });
    });
    return this.overview(actorUserId);
  }

  /** Posts (or sends back) an update someone else wrote; a posted "resolved" update resolves the incident. */
  async review(actorUserId: string, id: string, updateId: string, dto: IncidentReviewDto) {
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say what to change before sending it back.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const u = await tx.platformIncidentUpdate.findFirst({ where: { id: updateId, incidentId: id } });
      if (!u || u.status !== 'pending') throw new NotFoundException('No such update waiting for approval.');
      if (u.writtenBy === actorUserId) throw new ForbiddenException('You wrote this update. Another staff member approves it.');
      const done = await tx.platformIncidentUpdate.updateMany({ where: { id: u.id, status: 'pending' }, data: { status: dto.approve ? 'posted' : 'sent_back', reviewedBy: actorUserId, reviewedAt: new Date(), reviewNote: dto.note?.trim() || null } });
      if (!done.count) throw new ConflictException('Someone else decided this update. Open it again.');
      if (dto.approve && u.stage === 'resolved') await tx.platformIncident.update({ where: { id }, data: { status: 'resolved', resolvedAt: new Date(), version: { increment: 1 } } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: dto.approve ? 'platform.incident.update_posted' : 'platform.incident.update_sent_back', entityType: 'platform_incident', entityId: id, metadata: { updateId: u.id, stage: u.stage, ...(dto.approve ? {} : { note: dto.note!.trim() }) } });
    });
    return this.overview(actorUserId);
  }

  /** Answer 1124: the incident is a security breach of this contained company; its clocks start the reminders. */
  async markBreach(actorUserId: string, id: string, containmentId: string) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const i = await tx.platformIncident.findUnique({ where: { id } });
      if (!i) throw new NotFoundException('Incident not found.');
      if (i.containmentId) throw new ConflictException('This incident is already linked to a containment.');
      const c = await tx.companyContainment.findUnique({ where: { id: containmentId } });
      if (!c) throw new BadRequestException('Choose a containment from the list.');
      await tx.platformIncident.update({ where: { id }, data: { securityBreach: true, containmentId, version: { increment: 1 } } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.incident.marked_breach', entityType: 'platform_incident', entityId: id, metadata: { containmentId, organizationId: c.organizationId, certinDueAt: c.certinDueAt.toISOString(), dpdpDueAt: c.dpdpDueAt.toISOString() } });
    });
    return this.overview(actorUserId);
  }

  async saveSettings(actorUserId: string, leadHours: number) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const before = await this.leadHours(tx);
      await tx.platformSetting.upsert({ where: { key: LEAD_KEY }, create: { key: LEAD_KEY, value: String(leadHours), label: 'Breach reminders: hours before the CERT-In and DPDP due times', updatedBy: actorUserId }, update: { value: String(leadHours), updatedBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.incident.settings_changed', entityType: 'platform_setting', entityId: LEAD_KEY, metadata: { before, after: leadHours } });
    });
    return this.overview(actorUserId);
  }

  /**
   * Answer 1124 (sweep, every 5 minutes): emails every staff member who holds the incidents key once per clock, the lead
   * hours before the containment's CERT-In and DPDP due times. Each clock is marked so it is sent once.
   */
  async remindSweep(now = new Date()) {
    let sent = 0;
    try {
      const work = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
        const lead = await this.leadHours(tx);
        const rows = await tx.platformIncident.findMany({ where: { securityBreach: true, containmentId: { not: null }, OR: [{ certinRemindedAt: null }, { dpdpRemindedAt: null }] } });
        const out: { incident: (typeof rows)[number]; clocks: ('certin' | 'dpdp')[]; due: Record<'certin' | 'dpdp', Date>; company: string }[] = [];
        for (const r of rows) {
          const c = await tx.companyContainment.findUnique({ where: { id: r.containmentId! } });
          if (!c) continue;
          const clocks = dueReminders(r, c, lead, now);
          if (!clocks.length) continue;
          const done = await tx.platformIncident.updateMany({ where: { id: r.id, version: r.version }, data: { ...(clocks.includes('certin') ? { certinRemindedAt: now } : {}), ...(clocks.includes('dpdp') ? { dpdpRemindedAt: now } : {}), version: { increment: 1 } } });
          if (!done.count) continue;
          const company = (await tx.organization.findUnique({ where: { id: c.organizationId }, select: { name: true } }))?.name ?? '';
          await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.incident.breach_reminder', entityType: 'platform_incident', entityId: r.id, metadata: { clocks, certinDueAt: c.certinDueAt.toISOString(), dpdpDueAt: c.dpdpDueAt.toISOString() } });
          out.push({ incident: r, clocks, due: { certin: c.certinDueAt, dpdp: c.dpdpDueAt }, company });
        }
        const to = out.length
          ? await incidentHolders(tx)
          : [];
        return { out, to: to.map((u) => u.email) };
      });
      for (const w of work.out) {
        const lines = w.clocks.map((k) => (k === 'certin' ? `CERT-In report due ${istTime(w.due.certin)} IST` : `DPDP detailed report to the Data Protection Board due ${istTime(w.due.dpdp)} IST`));
        const subject = `Breach reminder: ${incidentRef(w.incident.number)} ${w.incident.title}`;
        const html = `<p>${esc(`${incidentRef(w.incident.number)} ${w.incident.title} is a security breach of ${w.company} (contained).`)}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p>Open Console › Incidents to see it.</p>`;
        for (const to of work.to) {
          await this.email.send({ to, subject, html }).catch((e: unknown) => this.logger.error(`breach reminder to staff failed: ${e instanceof Error ? e.message : String(e)}`));
          sent++;
        }
      }
    } catch (e) {
      this.logger.warn(`breach reminders failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return sent;
  }

  /**
   * What a company sees now: the latest posted update of the most severe open incident that touches one of its products
   * (a security breach is never shown to other companies), or nothing.
   */
  async current(ctx: TenantContext) {
    if (!ctx.organizationId) return null;
    const mine = (await this.tenantPrisma.forTenant(ctx, (tx) => tx.organizationProduct.findMany({ where: { organizationId: ctx.organizationId! }, select: { productCode: true } }))).map((p) => p.productCode);
    if (!mine.length) return null;
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const rows = await tx.platformIncident.findMany({
        where: { status: 'open', securityBreach: false, products: { hasSome: mine }, updates: { some: { status: 'posted' } } },
        orderBy: [{ severity: 'asc' }, { openedAt: 'desc' }],
        take: 1,
        include: { updates: { where: { status: 'posted' }, orderBy: { reviewedAt: 'desc' }, take: 1 } },
      });
      const i = rows[0];
      const u = i?.updates[0];
      return i && u ? { title: i.title, severity: i.severity, stage: u.stage, impact: u.impact, action: u.action, nextUpdateAt: u.nextUpdateAt?.toISOString() ?? null, updatedAt: (u.reviewedAt ?? u.createdAt).toISOString() } : null;
    });
  }
}
