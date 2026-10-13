import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { holdersOf } from '../time/time-core';
import { bandFor } from './perf-rules';
import { changeProblem, distribution, guideProblem, type Guide } from './calibration-rules';
import type { CalibrationChangeDto, SessionDto } from './review-dto';

// Performance batch PM6 (M06-BUILD-DESIGN §11; PM-6.01, 6.02): calibration sessions.
//   sessions   HR (perf.cycle.manage) opens a session for a cycle's finished reviews (all, or some departments) and
//              names a facilitator who holds perf.calibration.facilitate; the reviews wait there (in_calibration)
//   board      the facilitator, HR and the managers of the people in it see each manager rating, the calibrated
//              score, self and skip-level signals and the distribution against the guide; never pay
//   changes    only the facilitator, only with a reason; each one is a calibration_changes row (YX-PERF-08)
//   guide      a guide only (Q5): a soft note outside the tolerance; never blocks sign-off; small groups get no chart;
//              protected leave is not counted
//   sign-off   the facilitator signs off; the reviews are ready to release with the calibrated scores

const num = (x: Prisma.Decimal | null) => (x === null ? null : Number(x.toString()));
const asJson = (x: unknown) => x as Prisma.InputJsonValue;

@Injectable()
export class PerformanceCalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.cycle.manage', 'perf.calibration.facilitate']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private hr(v: Viewer) {
    return tenantWide(v, 'perf.cycle.manage') && !v.actingForOther;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  private async scale(tx: Tx, org: string, scaleId: string) {
    const s = await tx.ratingScale.findFirstOrThrow({ where: { organizationId: org, id: scaleId } });
    const bands = (await tx.ratingBand.findMany({ where: { organizationId: org, scaleId }, orderBy: { fromScore: 'asc' } })).map((b) => ({ fromScore: num(b.fromScore)!, toScore: num(b.toScore)!, label: b.label }));
    return { min: num(s.minValue)!, max: num(s.maxValue)!, bands };
  }

  /** Who may look at a session: HR, its facilitator, and the managers of the people in it. */
  private async session(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const s = await tx.calibrationSession.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!s) throw new NotFoundException('No such session.');
    const facilitator = s.facilitatorUserId === v.userId && v.grants.has('perf.calibration.facilitate') && !v.actingForOther;
    let attendee = false;
    if (!facilitator && !this.hr(v) && v.userId) {
      const me = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } });
      attendee = Boolean(me && (await tx.review.count({ where: { organizationId: c.organizationId, calibrationSessionId: id, managerEmployeeId: me.id } })));
    }
    if (!facilitator && !this.hr(v) && !attendee) throw new NotFoundException('No such session.');
    return { s, facilitator };
  }

  /** Sessions of a cycle (with its scale's bands, for a guide), or across cycles when no cycle is given. HR see all; a facilitator theirs. */
  async sessions(ctx: TenantContext, user: ScopeUser, cycleId: string | null) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const cycle = cycleId ? await tx.reviewCycle.findFirst({ where: { organizationId: c.organizationId, id: cycleId } }) : null;
      if (cycleId && !cycle) throw new NotFoundException('No such cycle.');
      const bands = cycle ? (await this.scale(tx, c.organizationId, cycle.scaleId)).bands.map((b) => b.label) : [];
      if (!this.hr(v) && !v.grants.has('perf.calibration.facilitate')) return { bands, sessions: [] };
      const where = { organizationId: c.organizationId, ...(cycleId ? { cycleId } : {}), ...(this.hr(v) ? {} : { facilitatorUserId: v.userId ?? '' }) };
      const rows = await tx.calibrationSession.findMany({ where, orderBy: { createdAt: 'asc' } });
      const counts = await tx.review.groupBy({ by: ['calibrationSessionId'], where: { organizationId: c.organizationId, calibrationSessionId: { in: rows.map((s) => s.id) } }, _count: { _all: true } });
      const users = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((s) => s.facilitatorUserId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      return { bands, sessions: rows.map((s) => ({ id: s.id, name: s.name, facilitator: users.get(s.facilitatorUserId) ?? '', status: s.status, people: counts.find((x) => x.calibrationSessionId === s.id)?._count._all ?? 0 })) };
    });
  }

  /** People who may facilitate: holders of perf.calibration.facilitate. */
  async facilitators(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!this.hr(v)) throw new ForbiddenException('Calibration sessions are opened by HR.');
    return this.run(ctx, async (tx, c) => {
      const ids = await holdersOf(tx, c.organizationId, 'perf.calibration.facilitate', '00000000-0000-0000-0000-000000000000', todayIst());
      const admins = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', OR: [{ id: { in: ids } }, { role: 'org_admin' }] }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      return admins.map((u) => ({ value: u.id, label: u.name }));
    });
  }

  async create(ctx: TenantContext, user: ScopeUser, cycleId: string, dto: SessionDto) {
    const v = await this.viewer(user);
    if (!this.hr(v)) throw new ForbiddenException('Calibration sessions are opened by HR.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const cycle = await tx.reviewCycle.findFirst({ where: { organizationId: org, id: cycleId } });
      if (!cycle) throw new NotFoundException('No such cycle.');
      if (cycle.status !== 'launched') throw new ConflictException('Only a running cycle is calibrated.');
      const sc = await this.scale(tx, org, cycle.scaleId);
      if (dto.guide) {
        const p = guideProblem(dto.guide, sc.bands.map((b) => b.label));
        if (p) throw new BadRequestException(p);
      }
      // The facilitator must hold the key: a role grant, a profile or company admin.
      const holders = await holdersOf(tx, org, 'perf.calibration.facilitate', '00000000-0000-0000-0000-000000000000', todayIst());
      const fac = await tx.user.findFirst({ where: { organizationId: org, id: dto.facilitatorUserId, status: 'active' }, select: { id: true, role: true } });
      if (!fac || (!holders.includes(fac.id) && fac.role !== 'org_admin')) throw new BadRequestException('Choose a facilitator who can run calibration sessions.');
      const today = todayIst();
      const deptSql = dto.departmentIds?.length
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM employee_assignments a WHERE a.organization_id = r.organization_id AND a.employee_id = r.employee_id AND a.superseded_at IS NULL
            AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) AND a.department_id = ANY(${dto.departmentIds}::uuid[]))`
        : Prisma.empty;
      const members = await tx.$queryRaw<{ id: string }[]>`
        SELECT r.id::text FROM reviews r WHERE r.organization_id = ${org}::uuid AND r.cycle_id = ${cycleId}::uuid AND r.status = 'ready' AND r.calibration_session_id IS NULL ${deptSql}`;
      if (!members.length) throw new ConflictException('No finished review is waiting for calibration in that group.');
      const s = await tx.calibrationSession.create({ data: { organizationId: org, cycleId, name: dto.name, facilitatorUserId: fac.id, population: dto.departmentIds?.length ? asJson({ departmentIds: dto.departmentIds }) : Prisma.DbNull, guide: dto.guide ? asJson(dto.guide) : Prisma.DbNull, createdBy: v.userId } });
      await tx.review.updateMany({ where: { organizationId: org, id: { in: members.map((m) => m.id) } }, data: { status: 'in_calibration', calibrationSessionId: s.id, version: { increment: 1 } } });
      await audit(tx, c, 'perf.calibration.opened', 'calibration_session', s.id, { reviews: members.length });
      return { id: s.id, people: members.length };
    });
  }

  async board(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { s, facilitator } = await this.session(tx, c, v, id);
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: s.cycleId } });
      const sc = await this.scale(tx, org, cycle.scaleId);
      const reviews = await tx.review.findMany({ where: { organizationId: org, calibrationSessionId: id }, orderBy: { createdAt: 'asc' } });
      const people = await this.names(tx, org, reviews.flatMap((r) => [r.employeeId, r.managerEmployeeId]));
      const elig = new Map((await tx.reviewEligibility.findMany({ where: { organizationId: org, cycleId: s.cycleId, employeeId: { in: reviews.map((r) => r.employeeId) } } })).map((e) => [e.employeeId, e.rule]));
      const entries = await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId: { in: reviews.map((r) => r.id) }, stage: { in: ['self', 'skip'] }, status: 'submitted' }, select: { reviewId: true, stage: true, answers: true } });
      const selfAvg = (rid: string) => {
        const e = entries.find((x) => x.reviewId === rid && x.stage === 'self');
        const r = e ? Object.values(e.answers as Record<string, { rating?: number | null }>).map((a) => a?.rating).filter((x): x is number => typeof x === 'number') : [];
        return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100 : null;
      };
      const rows = reviews.map((r) => {
        const score = num(r.calibratedScore) ?? num(r.finalScore);
        return {
          reviewId: r.id,
          employee: people.get(r.employeeId) ?? '',
          manager: people.get(r.managerEmployeeId) ?? '',
          managerScore: num(r.finalScore),
          score,
          band: score === null ? null : (bandFor(sc.bands, score)?.label ?? null),
          moved: r.calibratedScore !== null,
          selfIndication: selfAvg(r.id),
          skipAgreed: entries.some((x) => x.reviewId === r.id && x.stage === 'skip'),
          protectedLeave: elig.get(r.employeeId) === 'protected_leave',
        };
      });
      const min = Number(await settingFor(tx, c, 'perf.report.min_cell', { legalEntityId: '' }));
      const guide = (s.guide as Guide | null) ?? null;
      const changes = await tx.calibrationChange.findMany({ where: { organizationId: org, sessionId: id }, orderBy: { at: 'asc' } });
      return {
        id: s.id,
        name: s.name,
        cycle: cycle.name,
        status: s.status,
        guide,
        scale: sc,
        rows,
        distribution: distribution(rows, sc.bands.map((b) => b.label), guide, min),
        changes: changes.map((x) => ({ reviewId: x.reviewId, employee: rows.find((r) => r.reviewId === x.reviewId)?.employee ?? '', from: num(x.fromScore), to: num(x.toScore), fromBand: x.fromBand, toBand: x.toBand, reason: x.reason, at: x.at.toISOString() })),
        can: { change: facilitator && s.status === 'open', signOff: facilitator && s.status === 'open' },
      };
    });
  }

  /** YX-PERF-08: only the facilitator, only with a reason; to a band (its middle score) or to a typed score. */
  async change(ctx: TenantContext, user: ScopeUser, id: string, dto: CalibrationChangeDto) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { s, facilitator } = await this.session(tx, c, v, id);
      if (!facilitator) throw new ForbiddenException('Only the facilitator changes ratings in a session.');
      if (s.status !== 'open') throw new ConflictException('This session is signed off.');
      const r = await tx.review.findFirst({ where: { organizationId: org, id: dto.reviewId, calibrationSessionId: id } });
      if (!r) throw new NotFoundException('That review is not in this session.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: s.cycleId } });
      const sc = await this.scale(tx, org, cycle.scaleId);
      let to = dto.toScore ?? null;
      if (to === null) {
        const b = sc.bands.find((x) => x.label === dto.toBand);
        if (!b) throw new BadRequestException('Choose a band of this scale, or a score.');
        to = Math.round(((b.fromScore + b.toScore) / 2) * 100) / 100;
      }
      const from = num(r.calibratedScore) ?? num(r.finalScore);
      const problem = changeProblem({ from, to, min: sc.min, max: sc.max, reason: dto.reason });
      if (problem) throw new BadRequestException(problem);
      const toBand = bandFor(sc.bands, to)?.label ?? null;
      await tx.calibrationChange.create({ data: { organizationId: org, sessionId: id, reviewId: r.id, fromScore: from, toScore: to, fromBand: from === null ? null : (bandFor(sc.bands, from)?.label ?? null), toBand, reason: dto.reason.trim(), byUserId: v.userId } });
      await tx.review.update({ where: { id: r.id }, data: { calibratedScore: to, band: toBand, version: { increment: 1 } } });
      await audit(tx, c, 'perf.calibration.changed', 'review', r.id, { from, to, reason: dto.reason.trim() });
    });
    return this.board(ctx, user, id);
  }

  /** The guide never blocks sign-off (Q5). The reviews are then ready to release with their calibrated scores. */
  async signOff(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { s, facilitator } = await this.session(tx, c, v, id);
      if (!facilitator) throw new ForbiddenException('Only the facilitator signs off.');
      if (s.status !== 'open') throw new ConflictException('This session is already signed off.');
      await tx.calibrationSession.update({ where: { id }, data: { status: 'signed_off', signedOffBy: v.userId, signedOffAt: new Date(), version: { increment: 1 } } });
      const n = await tx.review.updateMany({ where: { organizationId: org, calibrationSessionId: id, status: 'in_calibration' }, data: { status: 'ready', version: { increment: 1 } } });
      await audit(tx, c, 'perf.calibration.signed_off', 'calibration_session', id, { reviews: n.count });
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: s.cycleId } });
      return { people: n.count, to: [cycle.createdBy, s.createdBy] };
    });
    const to = [...new Set(out.to.filter((u): u is string => Boolean(u)))];
    if (to.length) await this.notifications.notifySystem({ organizationId: ctx.organizationId!, isSuperAdmin: false }, to, 'perf.calibration.signed_off', { entityType: 'performance', entityId: id, contextText: 'A calibration session was signed off', linkPath: '/yx/performance/cycles' }, { subject: 'A calibration session was signed off', html: '<p>A calibration session was signed off. Its reviews are ready to release.</p>' }).catch(() => undefined);
    return { signedOff: true, people: out.people };
  }
}
