import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, implicitPeriods, implicitSql, started } from '../access/scope';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hrApprovers } from '../time/time-core';
import { krProblem, krProgress, weightedProgress, wouldCycle } from './perf-rules';
import type { CascadeDto, CheckinDto, GoalDto, GoalPeriodDto } from './dto';

// Performance batch PM2 (M06-BUILD-DESIGN §7; PM-2.01 … 2.03): goals owned by a person, a team or the company,
// aligned to a parent owned by anyone, key results with worked-out progress, approval of a person's goals by their
// manager (company setting, decision D2), changes to an approved goal with a reason, check-ins and reminders.
//   who sees   a person's goals: the person, their manager chain (P02 implicit view) and perf.goal.view in scope;
//              company and team goals: everyone in the company; aligning to a goal shows only its title and progress
//   who edits  person goals: the person (drafts; changes to active goals go to the manager); team and company
//              goals and periods: perf.goal.manage; check-ins: the person or their manager chain

export const GOAL_SET = 'perf.goal_set';
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (x: Prisma.Decimal) => Number(x.toString());
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));
const LIVE = ['draft', 'submitted', 'active', 'done'];

type Goal = Prisma.GoalGetPayload<object>;
type Access = { own: boolean; chain: boolean; scope: boolean; manage: boolean };
type KrInput = GoalDto['keyResults'];

@Injectable()
export class PerformanceGoalsService implements OnModuleInit {
  private readonly logger = new Logger(PerformanceGoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: GOAL_SET,
      label: 'Goals',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: () => '/yx/performance',
    });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.goal.view', 'perf.goal.manage']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true, personId: true } });
  }

  private async access(tx: Tx, c: CompanyContext, v: Viewer, g: Goal): Promise<Access> {
    const me = await this.me(tx, c.organizationId, v);
    const manage = v.grants.has('perf.goal.manage');
    if (g.ownerType !== 'person') return { own: false, chain: false, scope: true, manage };
    const today = todayIst();
    const chain = covers(started(await implicitPeriods(tx, c, me?.id ?? null, g.ownerEmployeeId!), today), today);
    const scope = v.grants.has('perf.goal.view') && covers(started(await grantPeriods(tx, c, v, 'perf.goal.view', g.ownerEmployeeId!, me?.id ?? null), today), today);
    return { own: me?.id === g.ownerEmployeeId, chain, scope, manage };
  }

  private async goalOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const g = await tx.goal.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!g) throw new NotFoundException('No such goal.');
    const a = await this.access(tx, c, v, g);
    if (!a.own && !a.chain && !a.scope) throw new NotFoundException('No such goal.');
    return { g, a };
  }

  private async names(tx: Tx, org: string, employeeIds: (string | null)[]) {
    const ids = [...new Set(employeeIds.filter((x): x is string => Boolean(x)))];
    const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, personId: true } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: emps.map((e) => e.personId) } } });
    return new Map(emps.map((e) => {
      const p = persons.find((x) => x.id === e.personId);
      return [e.id, p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''];
    }));
  }

  // ------------------------------------------------------------------------------------------ periods

  periods(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) =>
      (await tx.goalPeriod.findMany({ where: { organizationId: c.organizationId }, orderBy: { fromOn: 'desc' } })).map((p) => ({ id: p.id, name: p.name, fromOn: iso(p.fromOn), toOn: iso(p.toOn), status: p.status })),
    );
  }

  async addPeriod(ctx: TenantContext, dto: GoalPeriodDto) {
    if (dto.toOn <= dto.fromOn) throw new BadRequestException('The period must end after it starts.');
    return this.run(ctx, async (tx, c) => {
      const p = await tx.goalPeriod.create({ data: { organizationId: c.organizationId, name: dto.name, fromOn: asDate(dto.fromOn), toOn: asDate(dto.toOn) } });
      await audit(tx, c, 'perf.goal_period.created', 'goal_period', p.id, { name: dto.name });
      return { id: p.id };
    }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A goal period with that name already exists.');
      throw e;
    });
  }

  async closePeriod(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const n = await tx.goalPeriod.updateMany({ where: { organizationId: c.organizationId, id, status: 'open' }, data: { status: 'closed' } });
      if (!n.count) throw new NotFoundException('No such open goal period.');
      await audit(tx, c, 'perf.goal_period.closed', 'goal_period', id, {});
      return { id };
    });
  }

  private async openPeriod(tx: Tx, org: string, id: string) {
    const p = await tx.goalPeriod.findFirst({ where: { organizationId: org, id, status: 'open' } });
    if (!p) throw new BadRequestException('Choose an open goal period.');
    return p;
  }

  // ------------------------------------------------------------------------------------------ reading

  private async view(tx: Tx, c: CompanyContext, g: Goal, a: Access) {
    const org = c.organizationId;
    const krs = await tx.keyResult.findMany({ where: { organizationId: org, goalId: g.id }, orderBy: { seq: 'asc' } });
    const checkins = await tx.goalCheckin.findMany({ where: { organizationId: org, goalId: g.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    const children = await tx.goal.findMany({ where: { organizationId: org, parentGoalId: g.id, status: { in: LIVE } }, select: { id: true, title: true, progress: true, ownerType: true, ownerEmployeeId: true, ownerDepartmentId: true } });
    const parent = g.parentGoalId ? await tx.goal.findFirst({ where: { organizationId: org, id: g.parentGoalId }, select: { id: true, title: true, progress: true } }) : null;
    const people = await this.names(tx, org, [g.ownerEmployeeId, ...children.map((x) => x.ownerEmployeeId)]);
    const dept = g.ownerDepartmentId ? await tx.department.findFirst({ where: { organizationId: org, id: g.ownerDepartmentId }, select: { name: true } }) : null;
    const editable = g.status === 'draft' || g.status === 'active';
    return {
      ...this.summary(g, g.ownerType === 'person' ? (people.get(g.ownerEmployeeId!) ?? '') : g.ownerType === 'team' ? (dept?.name ?? '') : 'Company'),
      description: g.description,
      keyResults: krs.map((k) => ({ id: k.id, title: k.title, unit: k.unit, direction: k.direction, start: num(k.startValue), target: num(k.targetValue), current: num(k.currentValue), weight: num(k.weight), progress: krProgress({ direction: k.direction as 'up', start: num(k.startValue), target: num(k.targetValue), current: num(k.currentValue) }) })),
      // Aligning to a goal shows only its title and progress, never its owner's other goals.
      parent: parent ? { id: parent.id, title: parent.title, progress: num(parent.progress) } : null,
      children: children.map((x) => ({ id: x.id, title: x.title, progress: num(x.progress), owner: x.ownerType === 'person' ? (people.get(x.ownerEmployeeId!) ?? '') : x.ownerType })),
      checkins: checkins.map((k) => ({ id: k.id, on: iso(k.on), progress: num(k.progress), confidence: k.confidence, note: k.note, values: k.values })),
      pendingChange: g.pendingChange,
      decisionNote: g.decisionNote,
      can: {
        edit: (g.ownerType === 'person' ? a.own : a.manage) && editable && !g.pendingChange,
        checkIn: g.status === 'active' && (g.ownerType === 'person' ? a.own || a.chain : a.manage),
        drop: (g.ownerType === 'person' ? a.own || a.chain : a.manage) && (g.status === 'draft' || g.status === 'active'),
        cascade: (g.ownerType === 'person' ? a.own || a.chain : a.manage) && g.status !== 'dropped',
      },
    };
  }

  private summary(g: Goal, owner: string) {
    return { id: g.id, periodId: g.periodId, ownerType: g.ownerType, ownerEmployeeId: g.ownerEmployeeId, ownerDepartmentId: g.ownerDepartmentId, owner, parentGoalId: g.parentGoalId, kind: g.kind, title: g.title, weight: num(g.weight), status: g.status, progress: num(g.progress), version: g.version };
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { g, a } = await this.goalOr404(tx, c, v, id);
      return this.view(tx, c, g, a);
    });
  }

  /** mine (with the weights check, §7.4) · team (the manager chain) · company (company and team goals) · one employee. */
  async list(ctx: TenantContext, user: ScopeUser, periodId: string, view: 'mine' | 'team' | 'company' | 'employee' = 'mine', employeeId?: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      let goals: Goal[] = [];
      if (view === 'mine') goals = me ? await tx.goal.findMany({ where: { organizationId: org, periodId, ownerType: 'person', ownerEmployeeId: me.id, status: { not: 'dropped' } }, orderBy: { createdAt: 'asc' } }) : [];
      else if (view === 'company') goals = await tx.goal.findMany({ where: { organizationId: org, periodId, ownerType: { in: ['company', 'team'] }, status: { not: 'dropped' } }, orderBy: [{ ownerType: 'asc' }, { createdAt: 'asc' }] });
      else if (view === 'team') {
        const today = todayIst();
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT g.id::text FROM goals g WHERE g.organization_id = ${org}::uuid AND g.period_id = ${periodId}::uuid AND g.owner_type = 'person'
            AND g.status <> 'dropped' AND ${await implicitSql(tx, c, me?.id ?? null, Prisma.sql`g.owner_employee_id`, Prisma.sql`${today}::date`)}`;
        goals = await tx.goal.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.id) } }, orderBy: [{ ownerEmployeeId: 'asc' }, { createdAt: 'asc' }] });
      } else {
        if (!employeeId) throw new BadRequestException('Choose the employee.');
        const probe = { ownerType: 'person', ownerEmployeeId: employeeId } as Goal;
        const a = await this.access(tx, c, v, probe);
        if (!a.own && !a.chain && !a.scope) throw new NotFoundException('No such employee.');
        goals = await tx.goal.findMany({ where: { organizationId: org, periodId, ownerType: 'person', ownerEmployeeId: employeeId, status: { not: 'dropped' } }, orderBy: { createdAt: 'asc' } });
      }
      const people = await this.names(tx, org, goals.map((g) => g.ownerEmployeeId));
      const depts = new Map((await tx.department.findMany({ where: { organizationId: org, id: { in: goals.map((g) => g.ownerDepartmentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      const out = goals.map((g) => this.summary(g, g.ownerType === 'person' ? (people.get(g.ownerEmployeeId!) ?? '') : g.ownerType === 'team' ? (depts.get(g.ownerDepartmentId!) ?? '') : 'Company'));
      return { goals: out, totalWeight: view === 'mine' ? Math.round(out.reduce((t, g) => t + g.weight, 0) * 100) / 100 : null };
    });
  }

  /** What a goal can align to: company and team goals, my own goals and my current manager's goals (titles only). */
  async alignOptions(ctx: TenantContext, user: ScopeUser, periodId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      const today = asDate(todayIst());
      const job = me ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: me.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } }) : null;
      const rows = await tx.goal.findMany({
        where: { organizationId: org, periodId, status: { in: ['draft', 'submitted', 'active'] }, OR: [{ ownerType: { in: ['company', 'team'] } }, ...(me ? [{ ownerEmployeeId: me.id }] : []), ...(job?.managerEmployeeId ? [{ ownerEmployeeId: job.managerEmployeeId }] : [])] },
        orderBy: [{ ownerType: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, ownerType: true, ownerEmployeeId: true },
      });
      const people = await this.names(tx, org, rows.map((r) => r.ownerEmployeeId));
      return rows.map((r) => ({ id: r.id, title: r.title, owner: r.ownerType === 'person' ? (people.get(r.ownerEmployeeId!) ?? '') : r.ownerType === 'company' ? 'Company' : 'Team' }));
    });
  }

  /** The company map (PRF-03): company → team → person with progress, and person goals aligned to nothing. */
  async map(ctx: TenantContext, user: ScopeUser, periodId: string) {
    const v = await this.viewer(user);
    if (!v.grants.has('perf.goal.view')) throw new ForbiddenException('You cannot see the company goal map.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      const all = await tx.goal.findMany({ where: { organizationId: org, periodId, status: { in: ['submitted', 'active', 'done'] } }, orderBy: { createdAt: 'asc' } });
      const today = todayIst();
      const visible: Goal[] = [];
      for (const g of all) {
        if (g.ownerType !== 'person') visible.push(g);
        else if (covers(started(await grantPeriods(tx, c, v, 'perf.goal.view', g.ownerEmployeeId!, me?.id ?? null), today), today)) visible.push(g);
      }
      const people = await this.names(tx, org, visible.map((g) => g.ownerEmployeeId));
      const depts = new Map((await tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      const nodes = visible.map((g) => ({ ...this.summary(g, g.ownerType === 'person' ? (people.get(g.ownerEmployeeId!) ?? '') : g.ownerType === 'team' ? (depts.get(g.ownerDepartmentId!) ?? '') : 'Company') }));
      const ids = new Set(nodes.map((n) => n.id));
      return { goals: nodes, unaligned: nodes.filter((n) => n.ownerType === 'person' && (!n.parentGoalId || !ids.has(n.parentGoalId))).map((n) => n.id), offTrack: await this.offTrack(tx, org, nodes.map((n) => n.id)) };
    });
  }

  /** Goals whose latest check-in says off track. */
  private async offTrack(tx: Tx, org: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await tx.$queryRaw<{ goal_id: string }[]>`
      SELECT DISTINCT ON (goal_id) goal_id::text, confidence FROM goal_checkins
      WHERE organization_id = ${org}::uuid AND goal_id = ANY(${ids}::uuid[]) ORDER BY goal_id, created_at DESC`;
    return (rows as unknown as { goal_id: string; confidence: string }[]).filter((r) => r.confidence === 'off_track').map((r) => r.goal_id);
  }

  // ------------------------------------------------------------------------------------------ writing (PM-2.01, 2.02)

  private checkKrs(kind: 'okr' | 'kpi', krs: KrInput) {
    if (kind === 'okr' && !krs.length) throw new BadRequestException('An objective needs at least one key result.');
    for (const k of krs) {
      const p = krProblem(k);
      if (p) throw new BadRequestException(`${k.title}: ${p}`);
    }
  }

  private async checkParent(tx: Tx, org: string, goalId: string | null, parentId: string | null | undefined, periodId: string) {
    if (!parentId) return null;
    const parent = await tx.goal.findFirst({ where: { organizationId: org, id: parentId, status: { in: ['draft', 'submitted', 'active', 'done'] } } });
    if (!parent) throw new BadRequestException('Choose a goal of this company to align to.');
    if (parent.periodId !== periodId) throw new BadRequestException('Align to a goal in the same period.');
    if (goalId) {
      const all = await tx.goal.findMany({ where: { organizationId: org, periodId }, select: { id: true, parentGoalId: true } });
      if (wouldCycle(goalId, parentId, new Map(all.map((x) => [x.id, x.parentGoalId])))) throw new BadRequestException('That would make the goals align in a circle.');
    }
    return parent.id;
  }

  private async writeKrs(tx: Tx, org: string, goalId: string, krs: KrInput, keepCurrent: boolean) {
    const old = keepCurrent ? await tx.keyResult.findMany({ where: { organizationId: org, goalId }, orderBy: { seq: 'asc' } }) : [];
    await tx.keyResult.deleteMany({ where: { organizationId: org, goalId } });
    if (krs.length) await tx.keyResult.createMany({ data: krs.map((k, i) => ({ organizationId: org, goalId, seq: i + 1, title: k.title, unit: k.unit ?? null, direction: k.direction, startValue: k.start, targetValue: k.target, currentValue: old[i] ? old[i].currentValue : k.start, weight: k.weight ?? 1 })) });
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: GoalDto) {
    this.checkKrs(dto.kind, dto.keyResults);
    const v = await this.viewer(user);
    const id = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.openPeriod(tx, org, dto.periodId);
      let owner: { ownerEmployeeId: string | null; ownerDepartmentId: string | null } = { ownerEmployeeId: null, ownerDepartmentId: null };
      if (dto.ownerType === 'person') {
        const me = await this.me(tx, org, v);
        if (!me) throw new ForbiddenException('Only employees have their own goals.');
        owner = { ownerEmployeeId: me.id, ownerDepartmentId: null };
      } else {
        if (!v.grants.has('perf.goal.manage')) throw new ForbiddenException('Company and team goals are set by those who manage goals.');
        if (dto.ownerType === 'team') {
          if (!dto.ownerDepartmentId || !(await tx.department.findFirst({ where: { organizationId: org, id: dto.ownerDepartmentId }, select: { id: true } }))) throw new BadRequestException('Choose the team (department).');
          owner = { ownerEmployeeId: null, ownerDepartmentId: dto.ownerDepartmentId };
        }
      }
      const parentGoalId = await this.checkParent(tx, org, null, dto.parentGoalId, dto.periodId);
      // Company and team goals need no approval: those who manage goals set them as active.
      const g = await tx.goal.create({ data: { organizationId: org, periodId: dto.periodId, ownerType: dto.ownerType, ...owner, parentGoalId, kind: dto.kind, title: dto.title, description: dto.description ?? null, weight: dto.weight, status: dto.ownerType === 'person' ? 'draft' : 'active', createdBy: v.userId } });
      await this.writeKrs(tx, org, g.id, dto.keyResults, false);
      await audit(tx, c, 'perf.goal.created', 'goal', g.id, { ownerType: dto.ownerType });
      return g.id;
    });
    return this.get(ctx, user, id);
  }

  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: GoalDto) {
    this.checkKrs(dto.kind, dto.keyResults);
    const v = await this.viewer(user);
    const notices = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { g, a } = await this.goalOr404(tx, c, v, id);
      if (g.ownerType === 'person' ? !a.own : !a.manage) throw new ForbiddenException('Only the goal owner changes the goal.');
      if (g.version !== dto.version) throw new ConflictException('Someone else changed this goal. Reload it.');
      if (g.pendingChange) throw new ConflictException('A change to this goal is waiting for approval.');
      const parentGoalId = await this.checkParent(tx, org, g.id, dto.parentGoalId, g.periodId);
      const data = { title: dto.title, description: dto.description ?? null, kind: dto.kind, weight: dto.weight, parentGoalId };
      if (g.status === 'draft' || g.ownerType !== 'person' || (await settingFor(tx, c, 'perf.goal.approval', { legalEntityId: '' })) === 'none') {
        if (g.status !== 'draft' && g.status !== 'active') throw new ConflictException('Only a draft or active goal can be changed.');
        await tx.goal.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        await this.writeKrs(tx, org, id, dto.keyResults, true);
        await this.recalculate(tx, org, id);
        await audit(tx, c, 'perf.goal.updated', 'goal', id, { reason: dto.reason ?? null });
        return [];
      }
      // An approved goal changes only with a reason the manager approves (§7.3); it stays as it was until then.
      if (g.status !== 'active') throw new ConflictException('This goal is waiting for approval.');
      if (!dto.reason) throw new BadRequestException('Say why the goal changes; your manager approves the change.');
      const sub = await this.submitRequest(tx, c, v, g.ownerEmployeeId!, `Goal change: ${dto.title}`, [{ label: 'Why', value: dto.reason }]);
      await tx.goal.update({ where: { id }, data: { pendingChange: { ...data, keyResults: dto.keyResults, reason: dto.reason } as unknown as Prisma.InputJsonValue, wfRequestId: sub.id, version: { increment: 1 } } });
      await audit(tx, c, 'perf.goal.change_requested', 'goal', id, { reason: dto.reason });
      return sub.notices;
    });
    await this.engine.send(ctx, notices);
    return this.get(ctx, user, id);
  }

  private async submitRequest(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, title: string, summary: { label: string; value: string }[]) {
    const org = c.organizationId;
    const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId }, select: { personId: true } });
    return this.engine.submit(tx, c, {
      type: GOAL_SET,
      subjectType: 'employee',
      subjectId: employeeId,
      title: title.slice(0, 150),
      summary,
      subjectPersonId: emp.personId,
      requesterUserId: v.userId,
      raisedByUserId: v.userId,
      steps: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 48, timeoutHours: 120, onTimeout: 'escalate', selfApproval: 'never' }],
      payload: {},
      payloadFields: [],
      fallbackUserIds: await hrApprovers(tx, org, employeeId, todayIst(), v.userId),
    });
  }

  /** My draft goals of a period go to my manager together (D2); with approval off they become active at once. */
  async submit(ctx: TenantContext, user: ScopeUser, periodId: string) {
    const v = await this.viewer(user);
    const notices = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      if (!me) throw new ForbiddenException('Only employees have their own goals.');
      await this.openPeriod(tx, org, periodId);
      const drafts = await tx.goal.findMany({ where: { organizationId: org, periodId, ownerType: 'person', ownerEmployeeId: me.id, status: 'draft' } });
      if (!drafts.length) throw new BadRequestException('There are no draft goals to send.');
      if ((await settingFor(tx, c, 'perf.goal.approval', { legalEntityId: '' })) === 'none') {
        await tx.goal.updateMany({ where: { organizationId: org, id: { in: drafts.map((g) => g.id) } }, data: { status: 'active', decisionNote: null, version: { increment: 1 } } });
        await audit(tx, c, 'perf.goal.activated', 'employee', me.id, { goals: drafts.length });
        return [];
      }
      const period = await tx.goalPeriod.findFirstOrThrow({ where: { organizationId: org, id: periodId } });
      const total = drafts.reduce((t, g) => t + num(g.weight), 0);
      const sub = await this.submitRequest(tx, c, v, me.id, `Goals for ${period.name}`, [
        { label: 'Goals', value: String(drafts.length) },
        { label: 'Weights', value: `${Math.round(total * 100) / 100} of 100` },
      ]);
      await tx.goal.updateMany({ where: { organizationId: org, id: { in: drafts.map((g) => g.id) } }, data: { status: 'submitted', wfRequestId: sub.id, decisionNote: null, version: { increment: 1 } } });
      await audit(tx, c, 'perf.goal.submitted', 'employee', me.id, { goals: drafts.length });
      return sub.notices;
    });
    await this.engine.send(ctx, notices);
    return this.list(ctx, user, periodId, 'mine');
  }

  /** P03 effect, once, in the decision's own transaction: the set becomes active, or a change is applied or dropped. */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const last = await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id }, orderBy: { createdAt: 'desc' }, select: { reason: true } });
    const goals = await tx.goal.findMany({ where: { organizationId: org, wfRequestId: req.id } });
    for (const g of goals) {
      if (g.pendingChange) {
        const ch = g.pendingChange as unknown as { title: string; description: string | null; kind: string; weight: number; parentGoalId: string | null; keyResults: KrInput };
        if (outcome === 'approved') {
          await tx.goal.update({ where: { id: g.id }, data: { title: ch.title, description: ch.description, kind: ch.kind, weight: ch.weight, parentGoalId: ch.parentGoalId, pendingChange: Prisma.DbNull, decisionNote: last?.reason ?? null, version: { increment: 1 } } });
          await this.writeKrs(tx, org, g.id, ch.keyResults, true);
          await this.recalculate(tx, org, g.id);
        } else {
          await tx.goal.update({ where: { id: g.id }, data: { pendingChange: Prisma.DbNull, decisionNote: last?.reason ?? null, version: { increment: 1 } } });
        }
      } else if (g.status === 'submitted') {
        await tx.goal.update({ where: { id: g.id }, data: { status: outcome === 'approved' ? 'active' : 'draft', decisionNote: last?.reason ?? null, version: { increment: 1 } } });
      }
    }
  }

  async drop(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const { g, a } = await this.goalOr404(tx, c, v, id);
      if (g.ownerType === 'person' ? !(a.own || a.chain) : !a.manage) throw new ForbiddenException('You cannot drop this goal.');
      if (g.status !== 'draft' && g.status !== 'active') throw new ConflictException('Only a draft or active goal can be dropped.');
      await tx.goal.update({ where: { id }, data: { status: 'dropped', decisionNote: reason, version: { increment: 1 } } });
      // Aligned goals keep working; they simply have no parent now.
      await tx.goal.updateMany({ where: { organizationId: c.organizationId, parentGoalId: id }, data: { parentGoalId: null } });
      if (g.parentGoalId) await this.recalculate(tx, c.organizationId, g.parentGoalId);
      await audit(tx, c, 'perf.goal.dropped', 'goal', id, { reason });
    });
    return this.get(ctx, user, id);
  }

  /** Draft copies for named people, aligned to this goal (§7.1); only for people in the caller's team, or by goal managers. */
  async cascade(ctx: TenantContext, user: ScopeUser, id: string, dto: CascadeDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { g, a } = await this.goalOr404(tx, c, v, id);
      if (g.status === 'dropped') throw new ConflictException('A dropped goal cannot be cascaded.');
      if (g.ownerType === 'person' ? !(a.own || a.chain) : !a.manage) throw new ForbiddenException('You cannot cascade this goal.');
      const me = await this.me(tx, org, v);
      const today = todayIst();
      const krs = await tx.keyResult.findMany({ where: { organizationId: org, goalId: id }, orderBy: { seq: 'asc' } });
      const made: string[] = [];
      for (const employeeId of [...new Set(dto.employeeIds)]) {
        const reach = v.grants.has('perf.goal.manage') || covers(started(await implicitPeriods(tx, c, me?.id ?? null, employeeId), today), today);
        if (!reach || employeeId === g.ownerEmployeeId) throw new ForbiddenException('You can cascade only to people in your team.');
        const copy = await tx.goal.create({ data: { organizationId: org, periodId: g.periodId, ownerType: 'person', ownerEmployeeId: employeeId, parentGoalId: id, kind: g.kind, title: g.title, description: g.description, weight: 0, createdBy: v.userId } });
        await this.writeKrs(tx, org, copy.id, krs.map((k) => ({ title: k.title, unit: k.unit, direction: k.direction as 'up', start: num(k.startValue), target: num(k.targetValue), weight: num(k.weight) })), false);
        made.push(copy.id);
      }
      await audit(tx, c, 'perf.goal.cascaded', 'goal', id, { to: made.length });
      return { created: made };
    });
  }

  // ------------------------------------------------------------------------------------------ check-ins (PM-2.03)

  async checkIn(ctx: TenantContext, user: ScopeUser, id: string, dto: CheckinDto) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { g, a } = await this.goalOr404(tx, c, v, id);
      if (g.status !== 'active') throw new ConflictException('Only an active goal takes check-ins.');
      if (g.ownerType === 'person' ? !(a.own || a.chain) : !a.manage) throw new ForbiddenException('Only the goal owner or their manager checks in.');
      const krs = await tx.keyResult.findMany({ where: { organizationId: org, goalId: id } });
      let progress: number;
      if (krs.length) {
        // YX-PERF-01: progress comes from the key results; a typed figure is refused.
        if (dto.progress !== undefined) throw new BadRequestException('Progress is worked out from the key results; enter their values instead.');
        const values = new Map(dto.values.map((x) => [x.keyResultId, x.value]));
        if ([...values.keys()].some((k) => !krs.some((r) => r.id === k))) throw new BadRequestException('A value is for a key result of another goal.');
        for (const k of krs) if (values.has(k.id)) await tx.keyResult.update({ where: { id: k.id }, data: { currentValue: values.get(k.id) } });
        progress = await this.recalculate(tx, org, id);
      } else {
        if (dto.values.length || dto.progress === undefined) throw new BadRequestException('Enter how far the goal is (0–100).');
        progress = dto.progress;
        await tx.goal.update({ where: { id }, data: { progress } });
        if (g.parentGoalId) await this.recalculate(tx, org, g.parentGoalId);
      }
      await tx.goalCheckin.create({ data: { organizationId: org, goalId: id, byUserId: v.userId, on: asDate(todayIst()), values: dto.values as unknown as Prisma.InputJsonValue, progress, confidence: dto.confidence, note: dto.note ?? null } });
      await tx.goal.update({ where: { id }, data: { checkinRemindedOn: null, version: { increment: 1 } } });
    });
    return this.get(ctx, user, id);
  }

  /**
   * A goal's progress from its key results, else from its live children (weighted), then up the parent chain.
   * A goal with neither keeps its last typed value (a KPI checked in by hand). Returns the goal's new progress.
   */
  private async recalculate(tx: Tx, org: string, goalId: string): Promise<number> {
    let at: string | null = goalId;
    let first = -1;
    for (let depth = 0; at && depth < 50; depth++) {
      const g: Goal | null = await tx.goal.findFirst({ where: { organizationId: org, id: at } });
      if (!g) break;
      const krs = await tx.keyResult.findMany({ where: { organizationId: org, goalId: g.id } });
      let progress = num(g.progress);
      if (krs.length) progress = weightedProgress(krs.map((k) => ({ progress: krProgress({ direction: k.direction as 'up', start: num(k.startValue), target: num(k.targetValue), current: num(k.currentValue) }), weight: num(k.weight) })));
      else {
        const kids = await tx.goal.findMany({ where: { organizationId: org, parentGoalId: g.id, status: { in: ['active', 'done'] } }, select: { progress: true, weight: true } });
        if (kids.length) progress = weightedProgress(kids.map((k) => ({ progress: num(k.progress), weight: num(k.weight) })));
      }
      if (progress !== num(g.progress)) await tx.goal.update({ where: { id: g.id }, data: { progress } });
      if (first < 0) first = progress;
      at = g.parentGoalId;
    }
    return first < 0 ? 0 : first;
  }

  // ------------------------------------------------------------------------------------------ reminders (PM-2.03)

  async sweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM goals WHERE status = 'active' AND owner_type = 'person'`);
    for (const { id: org } of orgs) {
      try {
        await this.sweepOrg(org, today);
      } catch (e) {
        this.logger.warn(`goal reminders ${org}: ${(e as Error).message}`);
      }
    }
  }

  /** Active person goals in open periods with no check-in for the company's interval get one reminder per interval. */
  async sweepOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const due = await this.tenantPrisma.forTenant(c, async (tx) => {
      const days = Number(await settingFor(tx, c, 'perf.goal.checkin_days', { legalEntityId: '' }));
      const since = asDate(addDays(today, -days));
      const goals = await tx.$queryRaw<{ id: string; employee_id: string }[]>`
        SELECT g.id::text, g.owner_employee_id::text AS employee_id FROM goals g JOIN goal_periods p ON p.organization_id = g.organization_id AND p.id = g.period_id
        WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.owner_type = 'person' AND p.status = 'open' AND p.to_on >= ${today}::date
          AND g.updated_at < ${since} AND (g.checkin_reminded_on IS NULL OR g.checkin_reminded_on < ${since})
          AND NOT EXISTS (SELECT 1 FROM goal_checkins k WHERE k.organization_id = g.organization_id AND k.goal_id = g.id AND k.created_at >= ${since})`;
      if (goals.length) await tx.goal.updateMany({ where: { organizationId: org, id: { in: goals.map((g) => g.id) } }, data: { checkinRemindedOn: asDate(today) } });
      const users = await tx.employee.findMany({ where: { organizationId: org, id: { in: goals.map((g) => g.employee_id) } }, select: { userId: true } });
      return users.map((u) => u.userId).filter((u): u is string => Boolean(u));
    });
    if (due.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, due, 'perf.goal.checkin_due', { entityType: 'goal', entityId: org, contextText: 'Time for a check-in on your goals', linkPath: '/yx/performance' }, { subject: 'Time for a goal check-in', html: '<p>Some of your goals have not had a check-in for a while. Open YukthiX to update them.</p>' }).catch(() => undefined);
    return due.length;
  }
}
