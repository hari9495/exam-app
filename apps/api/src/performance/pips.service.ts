import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, implicitPeriods, implicitSql, inScopeSql, started, employeesInEntity } from '../access/scope';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { holdersOf } from '../time/time-core';
import { LettersService } from '../documents/letters/letters.service';
import { ExitsService } from '../lifecycle/exits.service';
import { checkinDates, extensionProblem, isMissed, onLeave, pausedEnd, planProblem, type Span } from './pip-rules';
import type { PipCheckinDto, PipExitDto, PipOutcomeDto, PipProposeDto } from './review-dto';

// Performance batch PM8 (M06-BUILD-DESIGN §13; PM-8.01 … 8.03): performance improvement plans.
//   propose     the manager (or the chain above) proposes for a report: reason, expectations with measures, support,
//               30 / 60 / 90 days (perf.pip.lengths), check-ins every 7–30 days; never while on protected leave (D10)
//   approve     P03 'perf.pip': HR holding perf.pip.manage for the person, never the proposer (YX-PERF-11); HR is warned
//               when the employee or the manager is in an active reviewer block (§15.3) — the warning says nothing more
//   plan        the employee reads and acknowledges it, with a comment (acknowledging is not agreeing); HR issues the
//               P05 'pip' letter; check-ins on a fixed schedule, the manager records each, the employee may add a note
//   pause       protected leave inside the plan moves its end by the same days (computed, never stored over)
//   outcome     HR: met, extended once (new end and a reason) or not met; "not met" never opens an exit by itself — HR's
//               "Start an exit case" opens a company-initiated M01 exit linked to the plan (§4.1 change 4)
//   daily       missed check-ins (3 days' grace, never during protected leave) are recorded and HR and the manager are
//               told; the employee is told of a newly approved plan; plans follow a manager change (perf_owner_transfers)
//   visibility  the employee, the manager chain and HR in scope only; never peers, never the profile overview

export const PIP_SET = 'perf.pip';
const LIVE = ['active', 'extended'] as const;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Pip = Prisma.PipGetPayload<object>;
type Access = { me: string | null; own: boolean; manager: boolean; chain: boolean; hr: boolean };

@Injectable()
export class PerformancePipsService implements OnModuleInit {
  private readonly logger = new Logger(PerformancePipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly notifications: NotificationsService,
    private readonly letters: LettersService,
    private readonly exits: ExitsService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: PIP_SET,
      label: 'Improvement plan',
      risk: 'high',
      autoActions: false,
      distinctSteps: true,
      cardPreview: async () => 'neutral',
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: (req) => `/yx/performance/pips/${req.subjectId}`,
    });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.pip.manage', 'lifecycle.exit.manage']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  private async tell(org: string, users: (string | null)[], type: string, text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    // The text stays in the app (P04 Q6): the mail only says there is something to read.
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'performance', entityId: org, contextText: text, linkPath: link }, { subject: 'Something new in YukthiX', html: '<p>There is something new for you in YukthiX.</p>' }).catch(() => undefined);
  }

  /** Approved protected leave (the same kinds as review eligibility, J11). */
  private async leaveOf(tx: Tx, org: string, employeeId: string): Promise<Span[]> {
    return tx.$queryRaw<Span[]>`
      SELECT l.from_on::text AS "from", l.to_on::text AS "to" FROM leave_requests l
      JOIN leave_types lt ON lt.organization_id = l.organization_id AND lt.id = l.leave_type_id
      WHERE l.organization_id = ${org}::uuid AND l.employee_id = ${employeeId}::uuid AND l.status = 'approved' AND lt.kind IN ('maternity', 'paternity')
      ORDER BY l.from_on`;
  }

  /** §15.3: an active reviewer block on the employee or the manager. Only that it exists; never which or why. */
  private async blocked(tx: Tx, org: string, ids: string[], today: string) {
    return Boolean(
      await tx.reviewerBlock.findFirst({
        where: { organizationId: org, endedBy: null, OR: [{ employeeA: { in: ids } }, { employeeB: { in: ids } }], AND: [{ OR: [{ untilOn: null }, { untilOn: { gte: asDate(today) } }] }] },
        select: { id: true },
      }),
    );
  }

  private async access(tx: Tx, c: CompanyContext, v: Viewer, p: Pip): Promise<Access> {
    const today = todayIst();
    const me = await this.me(tx, c.organizationId, v);
    const own = me === p.employeeId;
    const manager = !own && me === p.managerEmployeeId;
    const chain = !own && !manager && covers(started(await implicitPeriods(tx, c, me, p.employeeId), today), today);
    const hr = !own && !v.actingForOther && v.grants.has('perf.pip.manage') && covers(started(await grantPeriods(tx, c, v, 'perf.pip.manage', p.employeeId, me), today), today);
    return { me, own, manager, chain, hr };
  }

  private async pipOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const p = await tx.pip.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p) throw new NotFoundException('No such plan.');
    const a = await this.access(tx, c, v, p);
    // Not proposed yet means not shown to the employee (HR has not approved it).
    if (!(a.manager || a.chain || a.hr || (a.own && p.status !== 'proposed' && p.status !== 'declined'))) throw new NotFoundException('No such plan.');
    return { p, a };
  }

  private async view(tx: Tx, c: CompanyContext, v: Viewer, p: Pip, a: Access) {
    const org = c.organizationId;
    const today = todayIst();
    const people = await this.names(tx, org, [p.employeeId, p.managerEmployeeId]);
    const goals = await tx.pipGoal.findMany({ where: { organizationId: org, pipId: p.id }, orderBy: { seq: 'asc' } });
    const checkins = await tx.pipCheckin.findMany({ where: { organizationId: org, pipId: p.id }, orderBy: { dueOn: 'asc' } });
    const leave = await this.leaveOf(tx, org, p.employeeId);
    const end = pausedEnd(iso(p.startsOn), iso(p.endsOn), leave);
    const live = (LIVE as readonly string[]).includes(p.status);
    const lead = a.manager || a.chain;
    return {
      id: p.id,
      employee: people.get(p.employeeId) ?? '',
      employeeId: p.employeeId,
      manager: people.get(p.managerEmployeeId) ?? '',
      reason: p.reason,
      expectations: p.expectations,
      support: p.support,
      startsOn: iso(p.startsOn),
      plannedEndsOn: iso(p.endsOn),
      endsOn: end.endsOn,
      pausedDays: end.pausedDays,
      pausedNow: live && onLeave(today, leave),
      checkinEveryDays: p.checkinEveryDays,
      status: p.status,
      acknowledgedAt: p.acknowledgedAt?.toISOString() ?? null,
      employeeComment: p.employeeComment,
      extendedFrom: p.extendedFrom ? iso(p.extendedFrom) : null,
      extendReason: p.extendReason,
      outcomeNote: p.outcomeNote,
      outcomeAt: p.outcomeAt?.toISOString() ?? null,
      letterId: p.letterId,
      exitCaseId: a.hr ? p.exitCaseId : null,
      goals: goals.map((g) => ({ id: g.id, text: g.text, measure: g.measure, status: g.status })),
      checkins: checkins.map((x) => ({ id: x.id, dueOn: iso(x.dueOn), heldOn: x.heldOn ? iso(x.heldOn) : null, managerNote: x.managerNote, employeeNote: x.employeeNote, status: x.status })),
      // §15.3: HR only, and only that there is something to check with the case owner.
      warning: a.hr && (live || p.status === 'proposed') ? await this.blocked(tx, org, [p.employeeId, p.managerEmployeeId], today) : false,
      role: a.own ? 'employee' : lead ? 'manager' : 'hr',
      can: {
        acknowledge: a.own && live && !p.acknowledgedAt,
        checkin: lead && live,
        employeeNote: a.own && live,
        outcome: a.hr && live,
        extend: a.hr && live && !p.extendedFrom,
        letter: a.hr && live && !p.letterId,
        startExit: a.hr && p.status === 'not_met' && !p.exitCaseId && v.grants.has('lifecycle.exit.manage'),
      },
      version: p.version,
    };
  }

  // ------------------------------------------------------------------------------------------ list and read

  async list(ctx: TenantContext, user: ScopeUser, view: 'mine' | 'team' | 'scope' = 'team', entityId?: string | null) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const me = await this.me(tx, org, v);
      let ids: { id: string }[] = [];
      if (view === 'mine') ids = me ? await tx.$queryRaw`SELECT p.id::text FROM pips p WHERE p.organization_id = ${org}::uuid AND p.employee_id = ${me}::uuid AND p.status NOT IN ('proposed', 'declined')` : [];
      else if (view === 'team') ids = me ? await tx.$queryRaw`SELECT p.id::text FROM pips p WHERE p.organization_id = ${org}::uuid AND p.employee_id <> ${me}::uuid AND (p.manager_employee_id = ${me}::uuid OR ${await implicitSql(tx, c, me, Prisma.sql`p.employee_id`, Prisma.sql`${today}::date`)})` : [];
      else {
        if (!v.grants.has('perf.pip.manage') || v.actingForOther) throw new ForbiddenException('Plans of people in scope need perf.pip.manage.');
        ids = await tx.$queryRaw`SELECT p.id::text FROM pips p WHERE p.organization_id = ${org}::uuid AND ${inScopeSql(c, v, 'perf.pip.manage', Prisma.sql`p.employee_id`, Prisma.sql`${today}::date`, me)} ${me ? Prisma.sql`AND p.employee_id <> ${me}::uuid` : Prisma.empty} LIMIT 2000`;
      }
      const all = await tx.pip.findMany({ where: { organizationId: org, id: { in: ids.map((x) => x.id) } }, orderBy: { startsOn: 'desc' } });
      const inEntity = entityId && view !== 'mine' ? await employeesInEntity(tx, c, entityId, all.map((p) => p.employeeId)) : null;
      const rows = inEntity ? all.filter((p) => inEntity.has(p.employeeId)) : all;
      const people = await this.names(tx, org, rows.flatMap((p) => [p.employeeId, p.managerEmployeeId]));
      const next = await tx.pipCheckin.findMany({ where: { organizationId: org, pipId: { in: rows.map((p) => p.id) }, status: 'due' }, orderBy: { dueOn: 'asc' } });
      return rows.map((p) => ({ id: p.id, employee: people.get(p.employeeId) ?? '', manager: people.get(p.managerEmployeeId) ?? '', status: p.status, startsOn: iso(p.startsOn), endsOn: iso(p.endsOn), nextCheckin: next.find((x) => x.pipId === p.id)?.dueOn.toISOString().slice(0, 10) ?? null }));
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { p, a } = await this.pipOr404(tx, c, v, id);
      // §15.1: who read a plan is on record.
      if (!a.own) await audit(tx, c, 'perf.pip.viewed', 'pip', id, {});
      return this.view(tx, c, v, p, a);
    });
  }

  // ------------------------------------------------------------------------------------------ propose and approve (PM-8.01)

  async propose(ctx: TenantContext, user: ScopeUser, dto: PipProposeDto) {
    const v = await this.viewer(user);
    let notices: Notice[] = [];
    let warn = null as { org: string; hr: string[]; id: string } | null;
    const id = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const me = await this.me(tx, org, v);
      if (!me) throw new ForbiddenException('Plans are proposed by a manager with an employee record.');
      if (me === dto.employeeId) throw new ForbiddenException('Someone else proposes a plan for you.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } });
      const [job] = await tx.$queryRaw<{ employment_id: string; manager_employee_id: string | null }[]>`
        SELECT a.employment_id::text, a.manager_employee_id::text FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        WHERE a.organization_id = ${org}::uuid AND a.employee_id = ${dto.employeeId}::uuid AND a.superseded_at IS NULL AND a.valid_from <= ${today}::date
          AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
        ORDER BY a.valid_from DESC LIMIT 1`;
      const lead = job && (job.manager_employee_id === me || covers(started(await implicitPeriods(tx, c, me, dto.employeeId), today), today));
      if (!emp?.personId || !job || !lead) throw new NotFoundException('Plans are proposed for your own reports.');
      const lengths = (await settingFor(tx, c, 'perf.pip.lengths', { legalEntityId: '' })).split(',').map(Number);
      const problem = planProblem(dto, lengths, today);
      if (problem) throw new BadRequestException(problem);
      const endsOn = addDays(dto.startsOn, dto.lengthDays);
      // D10: no plan starts during protected leave.
      const leave = await this.leaveOf(tx, org, dto.employeeId);
      if (onLeave(today, leave) || onLeave(dto.startsOn, leave)) throw new ConflictException({ statusCode: 409, code: 'PROTECTED_LEAVE', message: 'This person is on protected leave then. A plan cannot start during it.' });
      if (await tx.pip.findFirst({ where: { organizationId: org, employmentId: job.employment_id, status: { in: ['proposed', ...LIVE] } }, select: { id: true } })) throw new ConflictException('This person already has a plan in progress.');
      const owner = job.manager_employee_id ?? me;
      // HR holding perf.pip.manage for the person; with none yet, the company's admins (as M01 exits do).
      const skip = (u: string) => u !== v.userId && u !== emp.userId;
      let hr = (await holdersOf(tx, org, 'perf.pip.manage', dto.employeeId, today)).filter(skip);
      if (!hr.length) hr = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter(skip);
      if (!hr.length) throw new ConflictException('No one in HR can approve plans for this person yet. Ask an admin to grant perf.pip.manage.');
      const p = await tx.pip.create({ data: { organizationId: org, employeeId: dto.employeeId, employmentId: job.employment_id, managerEmployeeId: owner, reason: dto.reason, expectations: dto.expectations, support: dto.support, startsOn: asDate(dto.startsOn), endsOn: asDate(endsOn), checkinEveryDays: dto.checkinEveryDays, createdBy: v.userId } });
      await tx.pipGoal.createMany({ data: dto.goals.map((g, i) => ({ organizationId: org, pipId: p.id, seq: i + 1, goalId: g.goalId ?? null, text: g.text, measure: g.measure })) });
      const name = [emp.preferredName || emp.givenName, emp.familyName].filter(Boolean).join(' ');
      const sub = await this.engine.submit(tx, c, {
        type: PIP_SET,
        subjectType: 'pip',
        subjectId: p.id,
        title: `Improvement plan: ${name}`,
        summary: [
          { label: 'Runs', value: `${dto.lengthDays} days from ${dto.startsOn}` },
          { label: 'Check-ins', value: `Every ${dto.checkinEveryDays} days` },
        ],
        subjectPersonId: emp.personId,
        requesterUserId: v.userId,
        raisedByUserId: v.userId,
        steps: [{ name: 'HR', approvers: [{ kind: 'users', userIds: hr.slice(0, 25) }], mode: 'any', selfApproval: 'never' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      await tx.pip.update({ where: { id: p.id }, data: { wfRequestId: sub.id } });
      notices = sub.notices;
      if (await this.blocked(tx, org, [dto.employeeId, owner], today)) warn = { org, hr, id: p.id };
      await audit(tx, c, 'perf.pip.proposed', 'pip', p.id, { employeeId: dto.employeeId, lengthDays: dto.lengthDays });
      return p.id;
    });
    if (notices.length) await this.engine.send(ctx, notices);
    // §15.3: the approvers alone are warned; the warning names no case.
    if (warn) await this.tell(warn.org, warn.hr, 'perf.pip.warning', 'Before deciding on an improvement plan, check with the case owner.', `/yx/performance/pips/${warn.id}`);
    return { id };
  }

  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const p = await tx.pip.findFirst({ where: { organizationId: org, wfRequestId: req.id } });
    if (!p || p.status !== 'proposed') return;
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    if (outcome === 'rejected') {
      await tx.pip.update({ where: { id: p.id }, data: { status: 'declined', version: { increment: 1 } } });
      await audit(tx, c, 'perf.pip.declined', 'pip', p.id, {});
      return;
    }
    const dates = checkinDates(iso(p.startsOn), iso(p.endsOn), p.checkinEveryDays);
    await tx.pipCheckin.createMany({ data: dates.map((d) => ({ organizationId: org, pipId: p.id, dueOn: asDate(d) })) });
    await tx.pip.update({ where: { id: p.id }, data: { status: 'active', version: { increment: 1 } } });
    await audit(tx, c, 'perf.pip.started', 'pip', p.id, { checkins: dates.length });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'perf.pip.started', payload: { pipId: p.id, employeeId: p.employeeId } } });
  }

  // ------------------------------------------------------------------------------------------ the plan (PM-8.01, 8.02)

  private versioned(p: Pip, version: number) {
    if (p.version !== version) throw new ConflictException('Someone else changed this plan. Reload it.');
  }

  /** The employee acknowledges, with a comment if they want; acknowledging is not agreeing. */
  async acknowledge(ctx: TenantContext, user: ScopeUser, id: string, comment: string | null | undefined, version: number) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { p, a } = await this.pipOr404(tx, c, v, id);
      if (!a.own) throw new ForbiddenException('Only the person on the plan acknowledges it.');
      if (!(LIVE as readonly string[]).includes(p.status) || p.acknowledgedAt) throw new ConflictException('This plan is not waiting for your acknowledgement.');
      this.versioned(p, version);
      const next = await tx.pip.update({ where: { id }, data: { acknowledgedAt: new Date(), employeeComment: comment?.trim() || null, version: { increment: 1 } } });
      await audit(tx, c, 'perf.pip.acknowledged', 'pip', id, { comment: Boolean(comment?.trim()) });
      return this.view(tx, c, v, next, a);
    });
  }

  /** The manager records a check-in as held (their note is required); the employee adds a note to a held one. */
  async checkin(ctx: TenantContext, user: ScopeUser, id: string, dto: PipCheckinDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { p, a } = await this.pipOr404(tx, c, v, id);
      if (!(LIVE as readonly string[]).includes(p.status)) throw new ConflictException('This plan is closed.');
      const x = await tx.pipCheckin.findFirst({ where: { organizationId: org, pipId: id, id: dto.checkinId } });
      if (!x || x.status === 'cancelled') throw new NotFoundException('No such check-in.');
      const today = todayIst();
      if (a.manager || a.chain) {
        if (x.status === 'held') throw new ConflictException('This check-in is already recorded.');
        if (iso(x.dueOn) > addDays(today, 7)) throw new ConflictException('Record a check-in when it is near: at most a week before it is due.');
        await tx.pipCheckin.update({ where: { id: x.id }, data: { status: 'held', heldOn: asDate(today), managerNote: dto.note } });
      } else if (a.own) {
        if (x.status !== 'held') throw new ConflictException('Add your note after the check-in is held.');
        await tx.pipCheckin.update({ where: { id: x.id }, data: { employeeNote: dto.note } });
      } else throw new ForbiddenException('Check-ins are recorded by the manager and the person on the plan.');
      await audit(tx, c, 'perf.pip.checkin', 'pip', id, { checkinId: x.id, by: a.own ? 'employee' : 'manager' });
      const next = await tx.pip.update({ where: { id }, data: { version: { increment: 1 } } });
      return this.view(tx, c, v, next, a);
    });
  }

  /** HR issues the P05 'pip' letter (the company's own template; none is shipped as a starter). */
  async letter(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const p = await this.run(ctx, async (tx, c) => {
      const { p: x, a } = await this.pipOr404(tx, c, v, id);
      if (!a.hr) throw new ForbiddenException('HR issues the plan letter.');
      if (!(LIVE as readonly string[]).includes(x.status) || x.letterId) throw new ConflictException('A letter goes out once, for a plan in progress.');
      if (!(await tx.letterTemplate.findFirst({ where: { organizationId: c.organizationId, letterType: 'pip', status: 'active' }, select: { id: true } }))) throw new ConflictException('Add a letter template of the type "pip" first (Settings › Letter templates).');
      return { personId: (await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: x.employeeId } })).personId! };
    });
    const issued = (await this.letters.issueSystem(ctx, { letterType: 'pip', personId: p.personId, subjectType: 'pip', subjectId: id } as never)) as { id?: string } | null;
    if (issued?.id) await this.run(ctx, async (tx, c) => {
      await tx.pip.update({ where: { id }, data: { letterId: issued.id, version: { increment: 1 } } });
      await audit(tx, c, 'perf.pip.letter_issued', 'pip', id, { letterId: issued.id });
    });
    return { letterId: issued?.id ?? null };
  }

  // ------------------------------------------------------------------------------------------ outcome and exit (PM-8.03)

  async outcome(ctx: TenantContext, user: ScopeUser, id: string, dto: PipOutcomeDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { p, a } = await this.pipOr404(tx, c, v, id);
      if (!a.hr) throw new ForbiddenException('HR records the outcome.');
      if (!(LIVE as readonly string[]).includes(p.status)) throw new ConflictException('This plan already has an outcome.');
      this.versioned(p, dto.version);
      let next: Pip;
      if (dto.outcome === 'extended') {
        const problem = extensionProblem(iso(p.endsOn), dto.extendTo, Boolean(p.extendedFrom));
        if (problem) throw new BadRequestException(problem);
        const dates = checkinDates(iso(p.startsOn), dto.extendTo!, p.checkinEveryDays, iso(p.endsOn));
        await tx.pipCheckin.createMany({ data: dates.map((d) => ({ organizationId: org, pipId: id, dueOn: asDate(d) })), skipDuplicates: true });
        next = await tx.pip.update({ where: { id }, data: { status: 'extended', extendedFrom: p.endsOn, endsOn: asDate(dto.extendTo!), extendReason: dto.note, version: { increment: 1 } } });
      } else {
        // Open check-ins of a closed plan are not missed: they are cancelled.
        await tx.pipCheckin.updateMany({ where: { organizationId: org, pipId: id, status: 'due' }, data: { status: 'cancelled' } });
        next = await tx.pip.update({ where: { id }, data: { status: dto.outcome, outcomeNote: dto.note, outcomeBy: v.userId, outcomeAt: new Date(), version: { increment: 1 } } });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'perf.pip.closed', payload: { pipId: id, employeeId: p.employeeId, outcome: dto.outcome } } });
      }
      // "Not met" opens nothing by itself; HR may start an exit from the plan (startExit).
      await audit(tx, c, 'perf.pip.outcome', 'pip', id, { outcome: dto.outcome });
      return this.view(tx, c, v, next, a);
    });
  }

  /** §4.1 change 4: HR opens a company-initiated M01 exit (M01's own checks and approval) linked back to the plan. */
  async startExit(ctx: TenantContext, user: ScopeUser, id: string, dto: PipExitDto) {
    const v = await this.viewer(user);
    const p = await this.run(ctx, async (tx, c) => {
      const { p: x, a } = await this.pipOr404(tx, c, v, id);
      if (!a.hr) throw new ForbiddenException('HR starts an exit case.');
      if (x.status !== 'not_met' || x.exitCaseId) throw new ConflictException('An exit case starts only from a plan that was not met, once.');
      return x;
    });
    const k = (await this.exits.startCompanyExit(ctx, user, { employeeId: p.employeeId, exitType: 'termination', lwd: dto.lwd, reasonText: dto.reasonText })) as { id: string };
    await this.run(ctx, async (tx, c) => {
      await tx.exitCase.updateMany({ where: { organizationId: c.organizationId, id: k.id, sourceType: null }, data: { sourceType: 'pip', sourceId: id } });
      await tx.pip.update({ where: { id }, data: { exitCaseId: k.id, version: { increment: 1 } } });
      await audit(tx, c, 'perf.pip.exit_started', 'pip', id, { exitCaseId: k.id });
    });
    return { exitCaseId: k.id };
  }

  // ------------------------------------------------------------------------------------------ daily (§18.3)

  async sweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM pips WHERE status IN ('active', 'extended')`);
    for (const { id: org } of orgs) {
      try {
        await this.sweepOrg(org, today);
      } catch (e) {
        this.logger.warn(`pips ${org}: ${(e as Error).message}`);
      }
    }
  }

  async sweepOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const out = await this.tenantPrisma.forTenant(c, async (tx) => {
      const tells: { users: (string | null)[]; type: string; text: string; link: string }[] = [];
      const userOf = async (ids: string[]) => (await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, userId: true } })).map((e) => e.userId);
      // A manager change moves a live plan to the new manager (D7), logged like reviews.
      const moved = await tx.$queryRaw<{ id: string; employee_id: string; old: string; new: string }[]>`
        SELECT p.id::text, p.employee_id::text, p.manager_employee_id::text AS old, a.manager_employee_id::text AS new
        FROM pips p JOIN employee_assignments a ON a.organization_id = p.organization_id AND a.employment_id = p.employment_id AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
        WHERE p.organization_id = ${org}::uuid AND p.status IN ('proposed', 'active', 'extended') AND a.manager_employee_id IS NOT NULL AND a.manager_employee_id <> p.manager_employee_id`;
      for (const m of moved) {
        await tx.pip.update({ where: { id: m.id }, data: { managerEmployeeId: m.new, version: { increment: 1 } } });
        await tx.perfOwnerTransfer.create({ data: { organizationId: org, employeeId: m.employee_id, oldManagerEmployeeId: m.old, newManagerEmployeeId: m.new, effectiveOn: asDate(today), artefactType: 'pip', artefactId: m.id } });
        tells.push({ users: await userOf([m.new]), type: 'perf.pip.handed_over', text: 'An improvement plan was handed over to you', link: `/yx/performance/pips/${m.id}` });
      }
      const live = await tx.pip.findMany({ where: { organizationId: org, status: { in: [...LIVE] } } });
      for (const p of live) {
        // A newly approved plan: the employee is told once (P03 tells the proposer).
        if (!p.employeeToldOn) {
          await tx.pip.update({ where: { id: p.id }, data: { employeeToldOn: asDate(today) } });
          tells.push({ users: await userOf([p.employeeId]), type: 'perf.pip.started', text: 'An improvement plan to read and acknowledge', link: `/yx/performance/pips/${p.id}` });
        }
        const leave = await this.leaveOf(tx, org, p.employeeId);
        const due = await tx.pipCheckin.findMany({ where: { organizationId: org, pipId: p.id, status: 'due', dueOn: { lt: asDate(today) } } });
        const missed = due.filter((x) => isMissed(iso(x.dueOn), today, leave));
        if (!missed.length) continue;
        await tx.pipCheckin.updateMany({ where: { organizationId: org, id: { in: missed.map((x) => x.id) } }, data: { status: 'missed' } });
        await audit(tx, c, 'perf.pip.checkin_missed', 'pip', p.id, { missed: missed.length });
        const hr = await holdersOf(tx, org, 'perf.pip.manage', p.employeeId, today);
        tells.push({ users: [...hr, ...(await userOf([p.managerEmployeeId]))], type: 'perf.pip.checkin_missed', text: 'An improvement plan check-in was missed', link: `/yx/performance/pips/${p.id}` });
      }
      return tells;
    });
    for (const t of out) await this.tell(org, t.users, t.type, t.text, t.link);
    return out.length;
  }
}
