import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { PayPeriodsService } from '../payroll/periods.service';
import { DayEngine } from './day-engine.service';
import { TIME_KEYS, asDate, dateOf, factsOn } from './time-core';
import { minutesInto } from './time-maths';

// TIM-10 device backfill correction (29 Oct 2026). A device (kiosk, biometric reader) that was offline sends its stored
// punches late; they are held (POST /payroll/device-batches). HR (attendance.lock over the legal entity) picks the
// device's batch, sees what it would change (each day worked out with the punches, then rolled back), gives a reason
// and applies it once, with the second sign-in step: days of an open month get the punches and are worked out again;
// days of a frozen or locked month become approved corrections paid in the next payroll (P08 YX-LOCK-09). One audit
// record for the whole batch.

const hhmm = (m: number | null) => (m === null ? null : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

@Injectable()
export class DeviceBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
    private readonly payPeriods: PayPeriodsService,
  ) {}

  private async viewer(user: ScopeUser, entityId: string): Promise<Viewer> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!(tenantWide(v, 'attendance.lock') || (v.scopes.get('attendance.lock') ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId))) throw new NotFoundException('Not found');
    return v;
  }

  /**
   * Devices with punches waiting, with their legal entity: the one asked for, else every entity the person may lock
   * (attendance.lock company-wide, or granted on the entity). Nobody gets another entity's batches.
   */
  async batches(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const covers = (id: string) => tenantWide(v, 'attendance.lock') || (v.scopes.get('attendance.lock') ?? []).some((s) => s.type === 'legal_entity' && s.id === id);
    const entities = (await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null, ...(entityId ? { id: entityId } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true } }))).filter((e) => covers(e.id));
    if (entityId && !entities.length) throw new NotFoundException('Not found');
    const out = [];
    for (const e of entities) for (const b of await this.payPeriods.heldPunches(ctx, user, e.id)) out.push({ ...b, legalEntityId: e.id, entityName: e.name });
    return { entities: entities.length, batches: out };
  }

  /** Inserts a day's device punches (skipping any already recorded) and works the day out again. */
  private async apply(tx: Tx, c: CompanyContext, employeeId: string, on: string, punches: { at: Date; kind: string }[]) {
    const org = c.organizationId;
    for (const p of punches) {
      if (await tx.punch.findFirst({ where: { organizationId: org, employeeId, punchedAt: p.at, kind: p.kind, accepted: true }, select: { id: true } })) continue;
      await tx.punch.create({ data: { organizationId: org, employeeId, punchedAt: p.at, workOn: asDate(on), kind: p.kind, source: 'biometric', accepted: true, verdict: 'no_fence' } });
    }
    await this.days.evaluate(tx, c, employeeId, on, on);
  }

  /**
   * What applying the batch would change, per person-day: the day before and after. Open days are worked out with the
   * punches inside a savepoint that is rolled back, so nothing is written; frozen or locked days show the punches that
   * would become a correction.
   */
  async preview(ctx: TenantContext, user: ScopeUser, entityId: string, deviceRef: string) {
    await this.viewer(user, entityId);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const held = await tx.heldPunch.findMany({ where: { organizationId: org, legalEntityId: entityId, deviceRef, status: 'held' }, orderBy: { punchedAt: 'asc' } });
      if (!held.length) throw new NotFoundException('Nothing from this device is waiting.');
      const groups = new Map<string, typeof held>();
      for (const h of held) groups.set(`${h.employeeId}|${dateOf(h.workOn)}`, [...(groups.get(`${h.employeeId}|${dateOf(h.workOn)}`) ?? []), h]);
      const changes = [];
      for (const [key, rows] of groups) {
        const [employeeId, on] = key.split('|');
        const f = await factsOn(tx, org, employeeId, on);
        if (!f) continue;
        const before = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(on) } } });
        const period = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(`${on.slice(0, 7)}-01`) }, select: { stage: true } });
        const open = !period || period.stage === 'open';
        let after = null;
        if (open) {
          await tx.$executeRawUnsafe('SAVEPOINT backfill_preview');
          await this.apply(tx, c, employeeId, on, rows.map((r) => ({ at: r.punchedAt, kind: r.kind })));
          after = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(on) } } });
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT backfill_preview');
        }
        const view = (d: typeof before) => (d ? { status: d.status, lateMinutes: d.lateMinutes, firstIn: hhmm(d.firstIn ? minutesInto(on, f.zone, d.firstIn) : null), lastOut: hhmm(d.lastOut ? minutesInto(on, f.zone, d.lastOut) : null) } : null);
        changes.push({ employeeId, name: f.name, code: f.code, on, open, stage: period?.stage ?? 'open', punches: rows.map((r) => ({ kind: r.kind, at: hhmm(minutesInto(on, f.zone, r.punchedAt)) })), before: view(before), after: view(after) });
      }
      changes.sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name));
      const worked = (s?: string | null) => s === 'present' || s === 'half_day';
      const late = (d: { lateMinutes: number | null } | null) => (d?.lateMinutes ?? 0) > 0;
      const days = held.map((h) => dateOf(h.workOn)).sort();
      return {
        deviceRef,
        from: days[0],
        to: days[days.length - 1],
        receivedAt: held.reduce((m, h) => (h.receivedAt > m ? h.receivedAt : m), held[0].receivedAt),
        punches: held.length,
        people: new Set(held.map((h) => h.employeeId)).size,
        personDays: changes.length,
        becomePresent: changes.filter((x) => x.after && worked(x.after.status) && !worked(x.before?.status)).length,
        lateRemoved: changes.filter((x) => x.after && late(x.before) && !late(x.after)).length,
        lateAdded: changes.filter((x) => x.after && !late(x.before) && late(x.after)).length,
        corrections: changes.filter((x) => !x.open).length,
        changes,
      };
    });
  }

  /**
   * Applies the batch once (step-up on the route). `punches` is the count HR reviewed: when more punches arrived since,
   * HR reviews again.
   */
  async backfill(ctx: TenantContext, user: ScopeUser, entityId: string, deviceRef: string, reason: string, punches: number) {
    await this.viewer(user, entityId);
    const waiting = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.heldPunch.count({ where: { organizationId: c.organizationId, legalEntityId: entityId, deviceRef, status: 'held' } }));
    if (!waiting) throw new NotFoundException('Nothing from this device is waiting.');
    if (waiting !== punches) throw new ConflictException(`The batch now has ${waiting} punches, not ${punches}. Review it again before applying.`);
    // Founder decision (29 Oct 2026): a plain confirm and the second sign-in step, not a typed phrase.
    return this.payPeriods.backfill(ctx, user, entityId, deviceRef, reason, { phrase: `BACKFILL ${punches}`, impact: [] }, (tx, c, employeeId, on, rows) => this.apply(tx, c, employeeId, on, rows));
  }
}
