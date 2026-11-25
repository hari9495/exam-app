import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PAID_SOURCES, correctionPaid, knownLeave, lastDayIn, monthOf, paidIn } from './late-corrections';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { entityTimeZone, localDate, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { has, type ScopeUser, type Viewer } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { asDate, dateOf, factsOn, hrApprovers, monthRange, myEmployeeId } from '../time/time-core';
import { addDays, daysBetween } from '../time/time-maths';
import { ConfirmationDto, DeviceBatchDto, HrCorrectionDto, LateCorrectionDto, LopReversalDto } from './dto';
import { PayKey, entitiesFor, payHolders, payViewer, requireEntity, requireSelf, systemAdmins, withPayScope } from './pay-access';

// PAY-1.02 pay periods and the lock service, PAY-1.03 corrections into processed payroll, PAY-1.04 late device batches
// (P08 §A2–A4, YX-LOCK-01…09). The lock itself is taken where the month is closed (attendance today, the approved run
// in 5c); here: the stages and their history, the two-approval reopen request (YX-LOCK-05, founder decision 9 Oct 2026:
// the step-4 "unlock" became this request now that payroll exists), and the corrections that land in the next payroll.

export const REOPEN = 'payroll.period_reopen';
// Founder decision D2 (9 Oct 2026): frozen dates refuse attendance and leave changes in the database like locked and
// filed dates (yx_time_locked); employees then use a late request, paid in the next payroll.
export const CORRECTION = 'payroll.correction';
const PERIOD_KEYS: PayKey[] = ['payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve'];
const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const nextMonth = (month: string) => addDays(monthRange(month).to, 1).slice(0, 7);
export const reopenPhrase = (shortName: string, month: string) => `REOPEN ${shortName.toUpperCase()} ${month}`;

type Period = Prisma.PayPeriodGetPayload<object>;

@Injectable()
export class PayPeriodsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: REOPEN,
      label: 'Reopen a locked pay period',
      risk: 'high',
      autoActions: false,
      decideOnlyVia: '/yx/payroll/reopen-requests',
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.reopenDecided(tx, req, outcome),
      requesterLink: () => '/yx/payroll/reopen-requests',
    });
    this.engine.register({
      key: CORRECTION,
      label: 'Correction for the next payroll',
      risk: 'normal',
      autoActions: false,
      // US-A-150: the payroll step is a different person from the HR step (maker ≠ checker).
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.correctionDecided(tx, req, outcome),
      requesterLink: () => '/yx/time/attendance',
    });
  }

  private viewer(user: ScopeUser) {
    return payViewer(this.prisma, this.tenantPrisma, user);
  }

  /** Entities any period key reaches. */
  private async periodEntities(tx: Tx, c: CompanyContext, v: Viewer) {
    const sets = await Promise.all(PERIOD_KEYS.map((k) => entitiesFor(tx, c, v, k)));
    return [...new Set(sets.flat())];
  }

  private async names(tx: Tx, org: string, ids: (string | null | undefined)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!list.length) return new Map<string, string>();
    return new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
  }

  // ------------------------------------------------------------------------------------------ periods (PAY-1.02)

  /** The year's months per legal entity in scope, with stage, last change and any reopen request. */
  async periods(ctx: TenantContext, user: ScopeUser, year: string) {
    const v = await this.viewer(user);
    requireSelf(v);
    if (!PERIOD_KEYS.some((k) => has(v, k))) throw new ForbiddenException('Pay periods need payroll.period.view.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.periodEntities(tx, c, v);
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: ids }, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, shortName: true } });
      const periods = await tx.payPeriod.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, payGroupId: null, periodStart: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-01`) } } });
      const reopen = await tx.periodReopenRequest.findMany({ where: { organizationId: org, payPeriodId: { in: periods.map((p) => p.id) }, status: 'pending' } });
      const corrections = await tx.payCorrection.groupBy({ by: ['payPeriodId', 'status'], where: { organizationId: org, payPeriodId: { in: periods.map((p) => p.id) } }, _count: { _all: true } });
      const names = await this.names(tx, org, periods.flatMap((p) => [p.changedBy, p.lockedBy]));
      const today = todayIst();
      const canReopen = new Set(await entitiesFor(tx, c, v, 'payroll.period.reopen'));
      return {
        year,
        today,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          shortName: e.shortName,
          canRequestReopen: canReopen.has(e.id),
          months: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
            .filter((m) => m <= today.slice(0, 7))
            .map((month) => {
              const p = periods.find((x) => x.legalEntityId === e.id && dateOf(x.periodStart) === `${month}-01`);
              const r = p && reopen.find((x) => x.payPeriodId === p.id);
              const n = (status: string) => (p ? (corrections.find((x) => x.payPeriodId === p.id && x.status === status)?._count._all ?? 0) : 0);
              return {
                month,
                periodId: p?.id ?? null,
                stage: p?.stage ?? 'open',
                lockedAt: p?.lockedAt ?? null,
                lockedBy: p?.lockedBy ? (names.get(p.lockedBy) ?? null) : null,
                changedAt: p?.changedAt ?? null,
                changedBy: p?.changedBy ? (names.get(p.changedBy) ?? null) : null,
                reason: p?.reason ?? null,
                reopenRequestId: r?.id ?? null,
                corrections: { pending: n('pending'), approved: n('approved') },
              };
            }),
        })),
      };
    });
  }

  /** A period's stage history, its reopen requests and its corrections. */
  async history(ctx: TenantContext, user: ScopeUser, periodId: string) {
    const v = await this.viewer(user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, id: periodId } });
      if (!p || !(await this.periodEntities(tx, c, v)).includes(p.legalEntityId)) throw new NotFoundException('Not found');
      const [events, requests, corrections] = await Promise.all([
        tx.periodLockEvent.findMany({ where: { organizationId: org, payPeriodId: p.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
        tx.periodReopenRequest.findMany({ where: { organizationId: org, payPeriodId: p.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
        tx.payCorrection.findMany({ where: { organizationId: org, payPeriodId: p.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      ]);
      const people = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: corrections.map((x) => x.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } })).map((e) => [e.id, [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ')]));
      const names = await this.names(tx, org, [...events.map((e) => e.byUser), ...requests.map((r) => r.requestedBy)]);
      return {
        id: p.id,
        month: dateOf(p.periodStart).slice(0, 7),
        stage: p.stage,
        events: events.map((e) => ({ at: e.createdAt, from: e.fromStage, to: e.toStage, by: e.byUser ? (names.get(e.byUser) ?? null) : null, reason: e.reason })),
        reopenRequests: requests.map((r) => ({ id: r.id, status: r.status, reason: r.reason, requestedBy: names.get(r.requestedBy) ?? null, at: r.createdAt })),
        corrections: corrections.map((x) => ({ id: x.id, person: people.get(x.employeeId) ?? '', on: dateOf(x.workOn), kind: x.kind, source: x.source, change: x.change, reason: x.reason, status: x.status, paidIn: x.targetPeriod ? dateOf(x.targetPeriod).slice(0, 7) : null })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ reopen (YX-LOCK-05)

  /**
   * Asks to reopen a locked month (step-up checked by the route). Refused once anything has left the system: a released
   * bank file, an issued payslip, a filed return (then corrections only, in the next payroll). Two approvals follow:
   * a payroll check by someone else who holds payroll.period.reopen, then Finance or the System Admin — never the
   * person who asked, and never the same person twice (YX-SEC-12).
   */
  async requestReopen(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, reason: string, via: 'payroll.period.reopen' | 'attendance.lock' = 'payroll.period.reopen') {
    const v = await this.viewer(user);
    requireSelf(v);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, via, entityId);
      const { from } = monthRange(month);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lock:${org}:${entityId}:${month}`}))`;
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) } });
      if (!p || p.stage === 'open' || p.stage === 'frozen') throw new ConflictException(`${monthText(month)} is not locked.`);
      await this.assertNothingLeft(tx, org, p);
      if (await tx.periodReopenRequest.findFirst({ where: { organizationId: org, payPeriodId: p.id, status: 'pending' } })) throw new ConflictException(`A request to reopen ${monthText(month)} is already waiting for approval.`);
      const today = todayIst();
      const me = v.userId!;
      const checkers = (await payHolders(tx, org, 'payroll.period.reopen', entityId, today)).filter((u) => u !== me);
      const finals = [...new Set([...(await payHolders(tx, org, 'payroll.period.reopen.approve', entityId, today)), ...(await systemAdmins(tx, org))])].filter((u) => u !== me);
      if (!checkers.length) throw new BadRequestException('No one else can check this reopen. Give a second person "payroll.period.reopen" for this legal entity first.');
      if (!finals.length || finals.every((u) => checkers.length === 1 && u === checkers[0])) throw new BadRequestException('No one can give the final approval. Finance or a System Admin other than you and the payroll checker must hold "payroll.period.reopen.approve".');
      const entity = (await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { name: true, shortName: true } }));
      const req = await tx.periodReopenRequest.create({ data: { organizationId: org, payPeriodId: p.id, legalEntityId: entityId, reason, requestedBy: me, confirmation: { via, stage: p.stage } } });
      const steps: StepSpec[] = [
        { name: 'Payroll check', approvers: [{ kind: 'users', userIds: checkers }], mode: 'any', remindAfterHours: 24 },
        { name: 'Finance or System Admin', approvers: [{ kind: 'users', userIds: finals }], mode: 'any', remindAfterHours: 24 },
      ];
      const sub = await this.engine.submit(tx, c, {
        type: REOPEN,
        subjectType: 'period_reopen_request',
        subjectId: req.id,
        title: `Reopen ${monthText(month)} for ${entity.name}`,
        summary: [
          { label: 'Legal entity', value: entity.name },
          { label: 'Month', value: monthText(month) },
          { label: 'Why', value: reason.slice(0, 300) },
        ],
        subjectPersonId: null,
        requesterUserId: me,
        raisedByUserId: me,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
      });
      notices.push(...sub.notices);
      await tx.periodReopenRequest.update({ where: { id: req.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'payroll.period.reopen_requested', 'pay_period', p.id, { legalEntityId: entityId, month, reason, via, requestId: req.id });
      return { id: req.id, periodId: p.id, stage: p.stage, status: 'pending' };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /** YX-LOCK-05: refused once a bank file is released, a payslip issued, or a return filed for the month. */
  private async assertNothingLeft(tx: Tx, org: string, p: Period) {
    if (p.stage === 'filed') throw new ConflictException({ statusCode: 409, code: 'PERIOD_FILED', message: 'A return for this month is filed, so it can no longer be reopened. Record a correction: it is paid in the next payroll.' });
    const [released, published] = await withPayScope(tx, [p.legalEntityId], () =>
      Promise.all([
        tx.exchangeFile.count({ where: { organizationId: org, legalEntityId: p.legalEntityId, kind: 'bank', periodStart: p.periodStart, status: 'released' } }),
        tx.payDocument.count({ where: { organizationId: org, legalEntityId: p.legalEntityId, kind: 'payslip', periodStart: p.periodStart, status: { in: ['issued', 'superseded'] } } }),
      ]),
    );
    if (released) throw new ConflictException({ statusCode: 409, code: 'BANK_FILE_RELEASED', message: 'The bank file for this month is released, so it can no longer be reopened. Record a correction: it is paid in the next payroll.' });
    if (published) throw new ConflictException({ statusCode: 409, code: 'PAYSLIPS_PUBLISHED', message: 'Payslips for this month are issued, so it can no longer be reopened. Record a correction: it is paid in the next payroll.' });
  }

  /** Reopen requests the viewer may follow: those of entities in scope, and those waiting for them. */
  async reopenRequests(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await this.periodEntities(tx, c, v);
      const mine = await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId!, status: 'open' }, select: { id: true, requestId: true, step: true } });
      const rows = await tx.periodReopenRequest.findMany({ where: { organizationId: org, OR: [{ legalEntityId: { in: ids } }, { requestedBy: v.userId! }, { wfRequestId: { in: mine.map((t) => t.requestId) } }] }, orderBy: { createdAt: 'desc' }, take: 100 });
      const wf = new Map((await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.wfRequestId).filter((x): x is string => Boolean(x)) } } })).map((w) => [w.id, w]));
      const actions = await tx.wfAction.findMany({ where: { organizationId: org, requestId: { in: [...wf.keys()] }, action: { in: ['approved', 'rejected', 'self_approved'] } }, orderBy: { createdAt: 'asc' } });
      const periods = new Map((await tx.payPeriod.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.payPeriodId) } } })).map((p) => [p.id, p]));
      const entities = new Map((await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.legalEntityId) } }, select: { id: true, name: true, shortName: true } })).map((e) => [e.id, e]));
      const steps = (w: Prisma.WfRequestGetPayload<object> | undefined) => (w ? (w.steps as unknown as { name: string; state: string; approverIds: string[] }[]) : []);
      const names = await this.names(tx, org, [...rows.map((r) => r.requestedBy), ...actions.map((a) => a.actorUserId), ...[...wf.values()].flatMap((w) => steps(w).flatMap((s) => s.approverIds))]);
      return rows.map((r) => {
        const w = r.wfRequestId ? wf.get(r.wfRequestId) : undefined;
        const p = periods.get(r.payPeriodId)!;
        const e = entities.get(r.legalEntityId)!;
        const month = dateOf(p.periodStart).slice(0, 7);
        const task = w && w.status === 'pending' ? mine.find((t) => t.requestId === w.id && t.step === w.currentStep) : undefined;
        return {
          id: r.id,
          entity: e.name,
          legalEntityId: r.legalEntityId,
          month,
          stage: p.stage,
          reason: r.reason,
          status: r.status,
          requestedBy: names.get(r.requestedBy) ?? '',
          requestedByMe: r.requestedBy === v.userId,
          at: r.createdAt,
          decidedAt: r.decidedAt,
          steps: steps(w).map((s, i) => {
            const done = actions.filter((a) => a.requestId === w!.id && a.step === i);
            return { name: s.name, state: s.state, approvers: s.approverIds.map((id) => names.get(id) ?? ''), decidedBy: done.map((a) => ({ who: names.get(a.actorUserId ?? '') ?? '', action: a.action, reason: a.reason, at: a.createdAt })) };
          }),
          canDecide: Boolean(task),
          phrase: task ? reopenPhrase(e.shortName, month) : null,
        };
      });
    });
  }

  /** An approver decides on this page (step-up by the route): approving stores the typed phrase and what was shown. */
  async decideReopen(ctx: TenantContext, user: ScopeUser, id: string, decision: 'approve' | 'reject', reason: string | null, confirmation: ConfirmationDto | undefined) {
    const v = await this.viewer(user);
    requireSelf(v);
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.periodReopenRequest.findFirst({ where: { organizationId: org, id } });
      const w = r?.wfRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: r.wfRequestId } }) : null;
      const task = w ? await tx.wfTask.findFirst({ where: { organizationId: org, requestId: w.id, assigneeUserId: v.userId!, status: 'open', step: w.currentStep } }) : null;
      if (!r || !task) throw new NotFoundException('No such approval.');
      const p = await tx.payPeriod.findFirstOrThrow({ where: { organizationId: org, id: r.payPeriodId } });
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: r.legalEntityId }, select: { shortName: true } });
      return { taskId: task.id, phrase: reopenPhrase(e.shortName, dateOf(p.periodStart).slice(0, 7)) };
    });
    if (decision === 'approve' && confirmation?.phrase !== found.phrase) throw new BadRequestException(`Type ${found.phrase} to confirm.`);
    const c: CompanyContext = { ...ctx, organizationId: ctx.organizationId!, isSuperAdmin: false };
    return this.engine.decide(c, v.userId!, found.taskId, decision, reason, 'web', { via: REOPEN, evidence: decision === 'approve' ? { phrase: confirmation!.phrase, impact: confirmation!.impact } : undefined });
  }

  /** The final approval reopens the month in the same transaction; the frozen payroll feed is set aside (kept). */
  private async reopenDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const r = await tx.periodReopenRequest.findFirst({ where: { organizationId: org, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    await tx.periodReopenRequest.update({ where: { id: r.id }, data: { status: outcome, decidedAt: new Date() } });
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    if (outcome === 'rejected') {
      await audit(tx, c, 'payroll.period.reopen_rejected', 'pay_period', r.payPeriodId, { requestId: r.id, legalEntityId: r.legalEntityId });
      return;
    }
    const p = await tx.payPeriod.findFirstOrThrow({ where: { organizationId: org, id: r.payPeriodId } });
    // Re-checked at the moment of reopening: something may have left the system while the request waited.
    await this.assertNothingLeft(tx, org, p);
    if (p.stage !== 'locked') throw new ConflictException('This month is no longer locked.');
    await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'open', changedBy: null, changedAt: new Date(), reason: r.reason, lockedAt: null, lockedBy: null, lockedByRunId: null, version: { increment: 1 } } });
    // PAY-3.10: an approved payroll of the month becomes 'reopened'; recalculating it makes new payslip versions and its
    // approval marks the earlier payslips revised (they are kept).
    await withPayScope(tx, [p.legalEntityId], () => tx.payrollRun.updateMany({ where: { organizationId: org, legalEntityId: p.legalEntityId, periodStart: p.periodStart, status: 'approved' }, data: { status: 'reopened' } }));
    await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: p.id, fromStage: 'locked', toStage: 'open', byUser: null, reason: r.reason, reopenRequestId: r.id } });
    const superseded = await tx.payrollFeedRow.updateMany({ where: { organizationId: org, payPeriodId: p.id, supersededAt: null }, data: { supersededAt: new Date() } });
    await audit(tx, c, 'payroll.period.reopened', 'pay_period', p.id, { requestId: r.id, legalEntityId: p.legalEntityId, month: dateOf(p.periodStart).slice(0, 7), feedRowsSetAside: superseded.count });
  }

  // ------------------------------------------------------------------------------------------ corrections (PAY-1.03)

  /** The first month after `month` whose period is still open for the entity: where a correction is paid. */
  private async nextOpenMonth(tx: Tx, org: string, entityId: string, month: string): Promise<string> {
    let m = nextMonth(month);
    for (let i = 0; i < 24; i++, m = nextMonth(m)) {
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(`${m}-01`) }, select: { stage: true } });
      if (!p || p.stage === 'open') return m;
    }
    return m;
  }

  private async periodOn(tx: Tx, org: string, entityId: string, on: string) {
    return tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(monthRange(on.slice(0, 7)).from) } });
  }

  /**
   * An employee's late request for their own day in a frozen or locked month (YX-LOCK-02): within the company's maximum
   * lateness it goes to the manager, HR (the extra step) and payroll; past it only HR may record a correction.
   */
  async lateRequest(ctx: TenantContext, user: ScopeUser, dto: LateCorrectionDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const today = todayIst();
      if (dto.on > today) throw new BadRequestException('A late correction is for a day that has passed.');
      const f = await factsOn(tx, org, me, dto.on);
      if (!f) throw new BadRequestException('You were not working here on that day.');
      const p = await this.periodOn(tx, org, f.legalEntityId, dto.on);
      if (!p || p.stage === 'open') throw new BadRequestException('That month is still open. Fix the day in My attendance or My leave instead.');
      const max = Number(await settingFor(tx, c, 'payroll.late_request_max_days', { legalEntityId: f.legalEntityId }));
      if (daysBetween(dto.on, today) > max) throw new ForbiddenException(`That day is more than ${max} days ago, so only HR can record a correction now. Ask HR.`);
      const hr = await hrApprovers(tx, org, me, today, f.userId);
      const payroll = (await payHolders(tx, org, 'payroll.correction.approve', f.legalEntityId, today)).filter((u) => u !== c.userId);
      // US-A-150: a correction into a processed month always has a payroll step, never HR standing in for it.
      if (!payroll.length) throw new BadRequestException('No one in payroll can approve a late correction for your company yet. Ask HR.');
      const steps: StepSpec[] = [
        { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 },
        { name: 'HR', approvers: [{ kind: 'users', userIds: hr }], mode: 'any', remindAfterHours: 24 },
        { name: 'Payroll', approvers: [{ kind: 'users', userIds: payroll }], mode: 'any', remindAfterHours: 24 },
      ];
      return this.createCorrection(tx, c, { employeeId: me, name: f.name, personId: f.personId, entityId: f.legalEntityId, period: p, dto, source: 'late_request', steps, fallback: hr }, notices);
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /**
   * PAY-04 "Period frozen · late request only": the stage of a month per legal entity the person enters pay inputs for,
   * so the LOP input shows a frozen or locked month before anyone types.
   */
  /**
   * Answer 2283 (PAY-01): approved late corrections of people who have left, paid by their full and final settlement,
   * until it is settled. Payroll in scope of the entity (payroll.run.view).
   */
  async waitingForFnf(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.run.view');
      const rows = await withPayScope(tx, ids, () => tx.payCorrection.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, status: 'approved', source: { in: PAID_SOURCES } }, orderBy: { workOn: 'asc' }, take: 500 }));
      const out: { id: string; employeeId: string; name: string; on: string; month: string; fnfId: string | null; state: 'waiting' | 'settled' }[] = [];
      for (const x of rows) {
        const last = await lastDayIn(tx, org, x.employeeId, x.legalEntityId);
        if (!last || !x.targetPeriod || monthOf(x.targetPeriod) !== last.slice(0, 7)) continue;
        const f = await withPayScope(tx, [x.legalEntityId], () => tx.fnfSettlement.findFirst({ where: { organizationId: org, employeeId: x.employeeId, legalEntityId: x.legalEntityId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } }));
        if (f?.status === 'cancelled') continue;
        // Answer 2300: settled before it was paid: payroll pays it in an off-cycle correction run (once).
        if (f?.status === 'settled' && ((await correctionPaid(tx, org, x.id)) || (await withPayScope(tx, [x.legalEntityId], () => tx.oneTimePay.findFirst({ where: { organizationId: org, source: 'arrears', sourceRef: x.id, status: 'approved' }, select: { id: true } }))))) continue;
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: x.employeeId }, select: { givenName: true, familyName: true, preferredName: true } });
        out.push({ id: x.id, employeeId: x.employeeId, name: e ? (e.preferredName ?? [e.givenName, e.familyName].filter(Boolean).join(' ')) : 'Former employee', on: dateOf(x.workOn), month: last.slice(0, 7), fnfId: f?.id ?? null, state: f?.status === 'settled' ? 'settled' : 'waiting' });
      }
      return out;
    });
  }

  /** Answer 2282: active leave types, names and codes only. */
  leaveTypes(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) => tx.leaveType.findMany({ where: { organizationId: c.organizationId, active: true }, select: { code: true, name: true }, orderBy: { name: 'asc' } }));
  }

  async inputStages(ctx: TenantContext, user: ScopeUser, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.input.manage');
      const rows = await tx.payPeriod.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, payGroupId: null, periodStart: asDate(monthRange(month).from) }, select: { legalEntityId: true, stage: true } });
      return ids.map((id) => ({ legalEntityId: id, month, stage: rows.find((r) => r.legalEntityId === id)?.stage ?? 'open' }));
    });
  }

  /**
   * PAY-04 late request: payroll (payroll.input.manage) asks for a day of an assumed-present person in a frozen or locked
   * month to change (an unpaid day, or an unpaid day reversed). Someone else with payroll.correction.approve approves it
   * in Approvals; the difference is paid in the next open payroll, the locked month never changes (YX-LOCK-03).
   */
  async inputCorrection(ctx: TenantContext, user: ScopeUser, dto: HrCorrectionDto) {
    const v = await this.viewer(user);
    requireSelf(v);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.on > todayIst()) throw new BadRequestException('A late request is for a day that has passed.');
      const f = await factsOn(tx, org, dto.employeeId, dto.on);
      if (!f) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'payroll.input.manage', f.legalEntityId);
      if (f.userId === v.userId) throw new ForbiddenException('Someone else asks for a change to your own pay.');
      const p = await this.periodOn(tx, org, f.legalEntityId, dto.on);
      if (!p || p.stage === 'open') throw new BadRequestException('That month is still open. Change the LOP days in the input instead.');
      const payroll = (await payHolders(tx, org, 'payroll.correction.approve', f.legalEntityId, todayIst())).filter((u) => u !== v.userId && u !== f.userId);
      if (!payroll.length) throw new BadRequestException('No one else can approve it. Give a second person "payroll.correction.approve" for this legal entity.');
      const steps: StepSpec[] = [{ name: 'Payroll', approvers: [{ kind: 'users', userIds: payroll }], mode: 'any', remindAfterHours: 24 }];
      return this.createCorrection(tx, c, { employeeId: f.employeeId, name: f.name, personId: f.personId, entityId: f.legalEntityId, period: p, dto, source: 'late_request', steps, fallback: [] }, notices);
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /** HR records a correction for someone in a frozen / locked month (needs attendance.lock on the entity); payroll approves. */
  async hrCorrection(ctx: TenantContext, user: ScopeUser, dto: HrCorrectionDto) {
    const v = await this.viewer(user);
    requireSelf(v);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await factsOn(tx, org, dto.employeeId, dto.on);
      if (!f) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'attendance.lock', f.legalEntityId);
      if (f.userId === v.userId) throw new ForbiddenException('Ask another HR admin to record a correction for yourself.');
      const p = await this.periodOn(tx, org, f.legalEntityId, dto.on);
      if (!p || p.stage === 'open') throw new BadRequestException('That month is still open. Change the day in attendance or leave instead.');
      const today = todayIst();
      const payroll = (await payHolders(tx, org, 'payroll.correction.approve', f.legalEntityId, today)).filter((u) => u !== v.userId);
      if (!payroll.length) throw new BadRequestException('No one can approve it for payroll. Give someone "payroll.correction.approve" for this legal entity.');
      const steps: StepSpec[] = [{ name: 'Payroll', approvers: [{ kind: 'users', userIds: payroll }], mode: 'any', remindAfterHours: 24 }];
      return this.createCorrection(tx, c, { employeeId: f.employeeId, name: f.name, personId: f.personId, entityId: f.legalEntityId, period: p, dto, source: 'hr', steps, fallback: [] }, notices);
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /**
   * Batch A item 8 (attendance-leave D15, answer 2315): HR's "Reverse loss of pay" from the payroll inputs page. One HR
   * correction per day (the same rules as POST corrections: attendance.lock for the person's legal entity, never your own,
   * someone with payroll.correction.approve decides, paid in the next regular run), all in one transaction: a bad day
   * saves none. Only for a frozen or locked month; an open month is fixed by regularisation (409 MONTH_OPEN).
   */
  async reverseLop(ctx: TenantContext, user: ScopeUser, dto: LopReversalDto) {
    const v = await this.viewer(user);
    requireSelf(v);
    const days = dto.days.map((d) => d.on);
    if (new Set(days).size !== days.length) throw new BadRequestException('Each day can be listed once.');
    if (new Set(days.map((d) => d.slice(0, 7))).size > 1) throw new BadRequestException('Pick days of one month at a time.');
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids: string[] = [];
      for (const d of [...dto.days].sort((a, b) => a.on.localeCompare(b.on))) {
        const f = await factsOn(tx, org, dto.employeeId, d.on);
        if (!f) throw new NotFoundException('Not found');
        await requireEntity(tx, c, v, 'attendance.lock', f.legalEntityId);
        if (f.userId === v.userId) throw new ForbiddenException('Ask another HR admin to reverse loss of pay for yourself.');
        const p = await this.periodOn(tx, org, f.legalEntityId, d.on);
        if (!p || p.stage === 'open') throw new ConflictException({ statusCode: 409, code: 'MONTH_OPEN', message: `${monthText(d.on.slice(0, 7))} is still open. Fix the days in regularisation instead.` });
        const today = todayIst();
        const payroll = (await payHolders(tx, org, 'payroll.correction.approve', f.legalEntityId, today)).filter((u) => u !== v.userId);
        if (!payroll.length) throw new BadRequestException('No one can approve it for payroll. Give someone "payroll.correction.approve" for this legal entity.');
        const steps: StepSpec[] = [{ name: 'Payroll', approvers: [{ kind: 'users', userIds: payroll }], mode: 'any', remindAfterHours: 24 }];
        const one = await this.createCorrection(tx, c, { employeeId: f.employeeId, name: f.name, personId: f.personId, entityId: f.legalEntityId, period: p, dto: { on: d.on, kind: 'attendance', shouldBe: d.shouldBe, reason: dto.reason }, source: 'hr', steps, fallback: [] }, notices);
        ids.push(one.id);
      }
      await audit(tx, c, 'payroll.lop_reversal.submitted', 'employee', dto.employeeId, { days: dto.days, corrections: ids });
      return { ids, count: ids.length, status: 'pending' };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  private async createCorrection(
    tx: Tx,
    c: CompanyContext,
    a: { employeeId: string; name: string; personId: string; entityId: string; period: Period; dto: LateCorrectionDto; source: 'late_request' | 'hr'; steps: StepSpec[]; fallback: string[] },
    notices: Notice[],
  ) {
    const org = c.organizationId;
    if (!(await knownLeave(tx, org, a.dto.shouldBe))) throw new BadRequestException('That leave type is not one of your company’s. Choose one from the list.');
    if (await tx.payCorrection.findFirst({ where: { organizationId: org, employeeId: a.employeeId, workOn: asDate(a.dto.on), status: 'pending' } })) throw new ConflictException('A correction for that day is already waiting for approval.');
    const row = await tx.payCorrection.create({
      data: { organizationId: org, legalEntityId: a.entityId, employeeId: a.employeeId, payPeriodId: a.period.id, workOn: asDate(a.dto.on), kind: a.dto.kind, source: a.source, change: { shouldBe: a.dto.shouldBe }, reason: a.dto.reason, createdBy: c.userId ?? null },
    });
    const sub = await this.engine.submit(tx, c, {
      type: CORRECTION,
      subjectType: 'pay_correction',
      subjectId: row.id,
      title: `${a.name}: correction for ${a.dto.on} (paid next payroll)`,
      summary: [
        { label: 'Day', value: a.dto.on },
        { label: 'Should be', value: a.dto.shouldBe },
        { label: 'Month', value: `${monthText(a.dto.on.slice(0, 7))} is ${a.period.stage}; the difference is paid in the next payroll` },
        { label: 'Why', value: a.dto.reason.slice(0, 300) },
      ],
      subjectPersonId: a.personId,
      requesterUserId: a.source === 'late_request' ? (c.userId ?? null) : null,
      raisedByUserId: c.userId ?? null,
      steps: a.steps,
      payload: {},
      payloadFields: [],
      fallbackUserIds: a.fallback,
    });
    notices.push(...sub.notices);
    await tx.payCorrection.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
    await audit(tx, c, 'payroll.correction.submitted', 'pay_correction', row.id, { employeeId: a.employeeId, legalEntityId: a.entityId, on: a.dto.on, kind: a.dto.kind, source: a.source });
    return { id: row.id, status: 'pending', stage: a.period.stage };
  }

  private async correctionDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const x = await tx.payCorrection.findFirst({ where: { organizationId: org, id: wf.subjectId } });
    if (!x || x.status !== 'pending') return;
    // YX-LOCK-03: the locked month never changes; the correction waits for the next open payroll month (arrears, 5g).
    // Answer 2283: for someone who has left (or leaves first), their full and final settlement pays it.
    const paid = outcome === 'approved' ? await paidIn(tx, org, x.employeeId, x.legalEntityId, await this.nextOpenMonth(tx, org, x.legalEntityId, dateOf(x.workOn).slice(0, 7))) : null;
    const target = paid?.month ?? null;
    await tx.payCorrection.update({ where: { id: x.id }, data: { status: outcome, decidedAt: new Date(), targetPeriod: target ? asDate(`${target}-01`) : null } });
    await audit(tx, { organizationId: org, isSuperAdmin: false }, `payroll.correction.${outcome}`, 'pay_correction', x.id, { employeeId: x.employeeId, legalEntityId: x.legalEntityId, paidIn: target, fnf: paid?.fnf ?? false });
  }

  // ------------------------------------------------------------------------------------------ device batches (PAY-1.04)

  /**
   * A late device batch (YX-LOCK-09 / YX-AT-13): punches for frozen or locked dates are held, never applied to the
   * locked month. Punches for open days belong to the live device feed and are sent back.
   */
  async holdDeviceBatch(ctx: TenantContext, user: ScopeUser, dto: DeviceBatchDto) {
    const v = await this.viewer(user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'attendance.lock', dto.legalEntityId);
      const codes = [...new Set(dto.punches.map((p) => p.employeeCode))];
      const staff = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: dto.legalEntityId, employeeCode: { in: codes } }, select: { employeeId: true, employeeCode: true } });
      const byCode = new Map(staff.map((s) => [s.employeeCode.toLowerCase(), s.employeeId]));
      const zone = await entityTimeZone(tx, org, dto.legalEntityId);
      let held = 0;
      const notHeld: { employeeCode: string; at: string; why: string }[] = [];
      for (const p of dto.punches) {
        const employeeId = byCode.get(p.employeeCode.toLowerCase());
        const at = new Date(p.at);
        // The work date is the entity's date of the punch; a device's own shift mapping comes with the device feed.
        const on = localDate(at, zone);
        if (!employeeId) {
          notHeld.push({ employeeCode: p.employeeCode, at: p.at, why: 'No one with this code in the legal entity' });
          continue;
        }
        // TIM-10 (29 Oct 2026): punches for open days are held too and applied from Time › Device punches; there is no
        // live device feed yet.
        const r = await tx.heldPunch.createMany({ data: [{ organizationId: org, legalEntityId: dto.legalEntityId, employeeId, punchedAt: at, workOn: asDate(on), kind: p.kind, deviceRef: dto.deviceRef, receivedBy: v.userId }], skipDuplicates: true });
        held += r.count;
      }
      await audit(tx, c, 'payroll.device_batch.held', 'legal_entity', dto.legalEntityId, { deviceRef: dto.deviceRef, received: dto.punches.length, held, notHeld: notHeld.length });
      return { held, notHeld };
    });
  }

  /** Held punches of a device waiting for a backfill (what the confirmation sheet shows). */
  async heldPunches(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'attendance.lock', entityId);
      const rows = await tx.heldPunch.groupBy({ by: ['deviceRef'], where: { organizationId: c.organizationId, legalEntityId: entityId, status: 'held' }, _count: { _all: true }, _min: { workOn: true }, _max: { workOn: true, receivedAt: true } });
      const people = await tx.heldPunch.groupBy({ by: ['deviceRef', 'employeeId'], where: { organizationId: c.organizationId, legalEntityId: entityId, status: 'held' } });
      return rows.map((r) => ({ deviceRef: r.deviceRef, punches: r._count._all, people: people.filter((p) => p.deviceRef === r.deviceRef).length, from: r._min.workOn ? dateOf(r._min.workOn) : null, to: r._max.workOn ? dateOf(r._max.workOn) : null, receivedAt: r._max.receivedAt ?? null }));
    });
  }

  /**
   * HR's device backfill (YX-LOCK-09): one audited action for the whole held batch of a device, with a reason and what
   * was confirmed. Each person-day becomes an approved correction paid in the next payroll; the locked month is untouched.
   */
  async backfill(
    ctx: TenantContext,
    user: ScopeUser,
    entityId: string,
    deviceRef: string,
    reason: string,
    confirmation: ConfirmationDto,
    /** TIM-10: applies the punches of a day whose month is still open (Time module: punches and the day engine). */
    applyOpen?: (tx: Tx, c: CompanyContext, employeeId: string, on: string, punches: { at: Date; kind: string }[]) => Promise<void>,
  ) {
    const v = await this.viewer(user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'attendance.lock', entityId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`backfill:${org}:${entityId}:${deviceRef}`}))`;
      const held = await tx.heldPunch.findMany({ where: { organizationId: org, legalEntityId: entityId, deviceRef, status: 'held' }, orderBy: { punchedAt: 'asc' } });
      if (!held.length) throw new NotFoundException('Nothing from this device is waiting.');
      const phrase = `BACKFILL ${held.length}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      const days = new Map<string, typeof held>();
      for (const h of held) days.set(`${h.employeeId}|${dateOf(h.workOn)}`, [...(days.get(`${h.employeeId}|${dateOf(h.workOn)}`) ?? []), h]);
      const workOns = held.map((h) => dateOf(h.workOn)).sort();
      const b = await tx.deviceBackfill.create({ data: { organizationId: org, legalEntityId: entityId, deviceRef, fromOn: asDate(workOns[0]), toOn: asDate(workOns[workOns.length - 1]), punches: held.length, people: new Set(held.map((h) => h.employeeId)).size, reason, createdBy: v.userId! } });
      let opened = 0;
      for (const [key, rows] of days) {
        const [employeeId, on] = key.split('|');
        const period = await this.periodOn(tx, org, entityId, on);
        if (!period || period.stage === 'open') {
          if (!applyOpen) throw new ConflictException('Some punches are for days of an open month. Apply them from Time › Device punches.');
          await applyOpen(tx, c, employeeId, on, rows.map((r) => ({ at: r.punchedAt, kind: r.kind })));
          opened++;
          continue;
        }
        const target = (await paidIn(tx, org, employeeId, entityId, await this.nextOpenMonth(tx, org, entityId, on.slice(0, 7)))).month;
        await tx.payCorrection.create({
          data: { organizationId: org, legalEntityId: entityId, employeeId, payPeriodId: period.id, workOn: asDate(on), kind: 'punches', source: 'device_backfill', change: { punches: rows.map((r) => ({ at: r.punchedAt.toISOString(), kind: r.kind })) }, reason, status: 'approved', backfillId: b.id, targetPeriod: asDate(`${target}-01`), createdBy: v.userId, decidedAt: new Date() },
        });
      }
      await tx.heldPunch.updateMany({ where: { organizationId: org, id: { in: held.map((h) => h.id) } }, data: { status: 'backfilled', backfillId: b.id } });
      await audit(tx, c, 'payroll.device_backfill.applied', 'device_backfill', b.id, { legalEntityId: entityId, deviceRef, punches: held.length, personDays: days.size, openDays: opened, reason, confirmed: { phrase: confirmation.phrase, impact: confirmation.impact } });
      return { id: b.id, punches: held.length, personDays: days.size, people: b.people, openDays: opened, corrections: days.size - opened };
    });
  }
}
