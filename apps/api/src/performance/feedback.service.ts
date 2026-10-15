import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, covers, implicitPeriods, implicitSql, started } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import type { ActionDto, AgendaDto, FeedbackDto, FeedbackRequestDto, OneOnOneDto, OneOnOneUpdateDto } from './dto';

// Performance batch PM3 (M06-BUILD-DESIGN §8, §15.3; PM-3.01 … 3.03): anytime feedback and requests for it, 1:1s, and
// HR sealing of a feedback item that reports a concern.
//   feedback   any colleague, praise or a suggestion; "private" = the recipient and their manager chain, or
//              "recipient only"; withdrawn by the giver within 24 hours; never public, never scored (§8.1)
//   1:1s       only the two people: an employee and their current manager; private notes only their author, never
//              moved, never exported; open action items carry to the pair's next 1:1 (§8.2, D7)
//   concerns   no automatic text scanning (D11); HR with perf.concern.seal seals an item: it leaves every performance
//              view and report; the people see "removed by HR"; the reason is audited (§15.3)

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const WITHDRAW_MS = 24 * 3_600_000;
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));

type Item = Prisma.FeedbackItemGetPayload<object>;
type Meeting = Prisma.OneOnOneGetPayload<object>;

@Injectable()
export class PerformanceFeedbackService {
  private readonly logger = new Logger(PerformanceFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.concern.seal']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } });
  }

  private async mustBeEmployee(tx: Tx, org: string, v: Viewer) {
    const me = await this.me(tx, org, v);
    if (!me) throw new ForbiddenException('Only employees give and ask for feedback.');
    return me.id;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, personId: true, userId: true } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: emps.map((e) => e.personId) } } });
    return new Map(emps.map((e) => {
      const p = persons.find((x) => x.id === e.personId);
      return [e.id, p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''];
    }));
  }

  private async userOf(tx: Tx, org: string, employeeId: string) {
    return (await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { userId: true } }))?.userId ?? null;
  }

  private async tell(org: string, users: (string | null)[], type: string, text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    // The text stays in the app (P04 Q6): the mail only says there is something to read.
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'performance', entityId: org, contextText: text, linkPath: link }, { subject: 'Something new in YukthiX', html: '<p>There is something new for you in YukthiX.</p>' }).catch(() => undefined);
  }

  /** The manager on today's current job, or null. */
  private async managerOf(tx: Tx, org: string, employeeId: string) {
    const today = asDate(todayIst());
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } });
    return a?.managerEmployeeId ?? null;
  }

  private async inMyChain(tx: Tx, c: CompanyContext, me: string, employeeId: string) {
    const today = todayIst();
    return covers(started(await implicitPeriods(tx, c, me, employeeId), today), today);
  }

  // ------------------------------------------------------------------------------------------ feedback (PM-3.01)

  private itemView(x: Item, people: Map<string, string>, me: string | null, sealer: boolean) {
    const sealed = Boolean(x.sealedAt);
    const now = Date.now();
    return {
      id: x.id,
      from: people.get(x.fromEmployeeId) ?? '',
      fromEmployeeId: x.fromEmployeeId,
      to: people.get(x.toEmployeeId) ?? '',
      toEmployeeId: x.toEmployeeId,
      kind: x.kind,
      // A sealed item shows only that HR removed it, except to whoever seals (they pass it to the confidential channel).
      text: sealed && !sealer ? null : x.text,
      visibility: x.visibility,
      goalId: x.goalId,
      fromRequest: Boolean(x.requestId),
      at: x.createdAt.toISOString(),
      sealed,
      sealReason: sealer ? x.sealReason : null,
      can: { withdraw: me === x.fromEmployeeId && !sealed && !x.withdrawnAt && now - x.createdAt.getTime() < WITHDRAW_MS, seal: sealer && !sealed },
    };
  }

  async give(ctx: TenantContext, user: ScopeUser, dto: FeedbackDto) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.mustBeEmployee(tx, org, v);
      if (dto.toEmployeeId === me) throw new BadRequestException('Feedback goes to a colleague, not yourself.');
      if (!(await tx.employee.findFirst({ where: { organizationId: org, id: dto.toEmployeeId }, select: { id: true } }))) throw new BadRequestException('Choose a colleague of this company.');
      if (dto.goalId && !(await tx.goal.findFirst({ where: { organizationId: org, id: dto.goalId, ownerEmployeeId: dto.toEmployeeId }, select: { id: true } }))) throw new BadRequestException('Link a goal of the person you are writing to.');
      if (dto.requestId) {
        const n = await tx.feedbackRequest.updateMany({ where: { organizationId: org, id: dto.requestId, askedEmployeeId: me, aboutEmployeeId: dto.toEmployeeId, status: 'open' }, data: { status: 'answered', answeredAt: new Date() } });
        if (!n.count) throw new BadRequestException('That request is not open for you.');
      }
      const x = await tx.feedbackItem.create({ data: { organizationId: org, fromEmployeeId: me, toEmployeeId: dto.toEmployeeId, kind: dto.kind, text: dto.text, visibility: dto.visibility ?? 'private', goalId: dto.goalId ?? null, requestId: dto.requestId ?? null } });
      const people = await this.names(tx, org, [me, dto.toEmployeeId]);
      return { view: this.itemView(x, people, me, false), to: await this.userOf(tx, org, dto.toEmployeeId) };
    });
    void this.tell(ctx.organizationId!, [out.to], 'perf.feedback.received', 'You received feedback', '/yx/performance/feedback');
    return out.view;
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.mustBeEmployee(tx, org, v);
      const x = await tx.feedbackItem.findFirst({ where: { organizationId: org, id, fromEmployeeId: me } });
      if (!x) throw new NotFoundException('No such feedback.');
      if (x.withdrawnAt || x.sealedAt) throw new ConflictException('This feedback is no longer shown.');
      if (Date.now() - x.createdAt.getTime() >= WITHDRAW_MS) throw new ConflictException('Feedback can be withdrawn only within 24 hours of giving it.');
      await tx.feedbackItem.update({ where: { id }, data: { withdrawnAt: new Date() } });
      await audit(tx, c, 'perf.feedback.withdrawn', 'feedback_item', id, {});
      return { id };
    });
  }

  /** received · given · team (private feedback to my manager chain's people) · employee (HR who seals concerns). */
  async list(ctx: TenantContext, user: ScopeUser, view: 'received' | 'given' | 'team' | 'employee' = 'received', employeeId?: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = (await this.me(tx, org, v))?.id ?? null;
      const sealer = v.grants.has('perf.concern.seal') && !v.actingForOther;
      let rows: Item[] = [];
      if (view === 'employee') {
        if (!sealer) throw new ForbiddenException('Only HR who handle concerns read another person’s feedback.');
        if (!employeeId) throw new BadRequestException('Choose the employee.');
        rows = await tx.feedbackItem.findMany({ where: { organizationId: org, OR: [{ toEmployeeId: employeeId }, { fromEmployeeId: employeeId }], withdrawnAt: null }, orderBy: { createdAt: 'desc' }, take: 500 });
      } else if (!me) rows = [];
      else if (view === 'received') rows = await tx.feedbackItem.findMany({ where: { organizationId: org, toEmployeeId: me, withdrawnAt: null }, orderBy: { createdAt: 'desc' }, take: 200 });
      else if (view === 'given') rows = await tx.feedbackItem.findMany({ where: { organizationId: org, fromEmployeeId: me, withdrawnAt: null }, orderBy: { createdAt: 'desc' }, take: 200 });
      else {
        const ids = await tx.$queryRaw<{ id: string }[]>`
          SELECT f.id::text FROM feedback_items f WHERE f.organization_id = ${org}::uuid AND f.visibility = 'private' AND f.withdrawn_at IS NULL
            AND f.sealed_at IS NULL AND f.to_employee_id <> ${me}::uuid AND ${await implicitSql(tx, c, me, Prisma.sql`f.to_employee_id`, Prisma.sql`${todayIst()}::date`)}
          ORDER BY f.created_at DESC LIMIT 300`;
        rows = await tx.feedbackItem.findMany({ where: { organizationId: org, id: { in: ids.map((r) => r.id) } }, orderBy: { createdAt: 'desc' } });
      }
      const people = await this.names(tx, org, rows.flatMap((x) => [x.fromEmployeeId, x.toEmployeeId]));
      // Sealed items leave every list but the recipient's and giver's own, where they show as removed (§15.3).
      return { items: rows.filter((x) => !x.sealedAt || view !== 'team').map((x) => this.itemView(x, people, me, sealer && view === 'employee')) };
    });
  }

  async seal(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    if (!v.grants.has('perf.concern.seal') || v.actingForOther) throw new ForbiddenException('Only HR who handle concerns seal feedback.');
    return this.run(ctx, async (tx, c) => {
      const x = await tx.feedbackItem.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('No such feedback.');
      if (x.sealedAt) throw new ConflictException('This feedback is already sealed.');
      await tx.feedbackItem.update({ where: { id }, data: { sealedAt: new Date(), sealedBy: v.userId, sealReason: reason } });
      await audit(tx, c, 'perf.feedback.sealed', 'feedback_item', id, { reason });
      return { id, sealed: true };
    });
  }

  // ------------------------------------------------------------------------------------------ requests (PM-3.01)

  async request(ctx: TenantContext, user: ScopeUser, dto: FeedbackRequestDto) {
    const v = await this.viewer(user);
    const asked = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.mustBeEmployee(tx, org, v);
      if (dto.aboutEmployeeId !== me && !(await this.inMyChain(tx, c, me, dto.aboutEmployeeId))) throw new ForbiddenException('Ask for feedback about yourself or someone in your team.');
      const ids = [...new Set(dto.askedEmployeeIds)];
      if (ids.includes(dto.aboutEmployeeId)) throw new BadRequestException('Ask other people, not the person the feedback is about.');
      if ((await tx.employee.count({ where: { organizationId: org, id: { in: ids } } })) !== ids.length) throw new BadRequestException('Choose colleagues of this company.');
      if (dto.dueOn && dto.dueOn < todayIst()) throw new BadRequestException('The due date cannot be in the past.');
      await tx.feedbackRequest.createMany({ data: ids.map((a) => ({ organizationId: org, requestedByEmployeeId: me, aboutEmployeeId: dto.aboutEmployeeId, askedEmployeeId: a, question: dto.question, dueOn: dto.dueOn ? asDate(dto.dueOn) : null })) });
      await audit(tx, c, 'perf.feedback.requested', 'employee', dto.aboutEmployeeId, { asked: ids.length });
      return (await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { userId: true } })).map((e) => e.userId);
    });
    void this.tell(ctx.organizationId!, asked, 'perf.feedback.requested', 'You were asked for feedback', '/yx/performance/feedback');
    return { asked: asked.length };
  }

  async requests(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = (await this.me(tx, org, v))?.id;
      if (!me) return { requests: [] };
      const rows = await tx.feedbackRequest.findMany({ where: { organizationId: org, askedEmployeeId: me, status: 'open' }, orderBy: { createdAt: 'asc' } });
      const people = await this.names(tx, org, rows.flatMap((r) => [r.requestedByEmployeeId, r.aboutEmployeeId]));
      return { requests: rows.map((r) => ({ id: r.id, about: people.get(r.aboutEmployeeId) ?? '', aboutEmployeeId: r.aboutEmployeeId, requestedBy: people.get(r.requestedByEmployeeId) ?? '', question: r.question, dueOn: r.dueOn ? iso(r.dueOn) : null })) };
    });
  }

  async decline(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const me = await this.mustBeEmployee(tx, c.organizationId, v);
      const n = await tx.feedbackRequest.updateMany({ where: { organizationId: c.organizationId, id, askedEmployeeId: me, status: 'open' }, data: { status: 'declined', answeredAt: new Date() } });
      if (!n.count) throw new NotFoundException('No such open request.');
      return { id };
    });
  }

  // ------------------------------------------------------------------------------------------ 1:1s (PM-3.02)

  private async meetingOr404(tx: Tx, org: string, v: Viewer, id: string) {
    const m = await tx.oneOnOne.findFirst({ where: { organizationId: org, id } });
    const me = (await this.me(tx, org, v))?.id ?? null;
    // Only the two people; HR does not read 1:1s (§14.1).
    if (!m || !me || (m.employeeId !== me && m.managerEmployeeId !== me)) throw new NotFoundException('No such 1:1.');
    return { m, me };
  }

  private async meetingView(tx: Tx, org: string, m: Meeting, me: string, userId: string) {
    const agenda = await tx.oneOnOneAgendaItem.findMany({ where: { organizationId: org, oneOnOneId: m.id }, orderBy: { createdAt: 'asc' } });
    const actions = await tx.oneOnOneAction.findMany({ where: { organizationId: org, oneOnOneId: m.id }, orderBy: { createdAt: 'asc' } });
    const note = await tx.oneOnOnePrivateNote.findFirst({ where: { organizationId: org, oneOnOneId: m.id, authorUserId: userId } });
    const people = await this.names(tx, org, [m.employeeId, m.managerEmployeeId, ...agenda.map((a) => a.addedByEmployeeId), ...actions.map((a) => a.ownerEmployeeId)]);
    return {
      id: m.id,
      employee: people.get(m.employeeId) ?? '',
      employeeId: m.employeeId,
      manager: people.get(m.managerEmployeeId) ?? '',
      managerEmployeeId: m.managerEmployeeId,
      role: m.managerEmployeeId === me ? 'manager' : 'employee',
      on: iso(m.on),
      status: m.status,
      sharedNotes: m.sharedNotes,
      agenda: agenda.map((a) => ({ id: a.id, text: a.text, done: a.done, addedBy: people.get(a.addedByEmployeeId) ?? '' })),
      actions: actions.map((a) => ({ id: a.id, text: a.text, owner: people.get(a.ownerEmployeeId) ?? '', ownerEmployeeId: a.ownerEmployeeId, dueOn: a.dueOn ? iso(a.dueOn) : null, goalId: a.goalId, done: Boolean(a.doneAt) })),
      // Only the author ever reads their private note (D7).
      privateNote: note?.text ?? '',
      version: m.version,
    };
  }

  async meetings(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = (await this.me(tx, org, v))?.id;
      if (!me) return { meetings: [], partners: [] };
      const rows = await tx.oneOnOne.findMany({ where: { organizationId: org, OR: [{ employeeId: me }, { managerEmployeeId: me }] }, orderBy: { on: 'desc' }, take: 200 });
      const reports = await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.manager_employee_id = ${me}::uuid
          AND a.superseded_at IS NULL AND a.valid_from <= ${todayIst()}::date AND (a.valid_to IS NULL OR a.valid_to >= ${todayIst()}::date)`;
      const manager = await this.managerOf(tx, org, me);
      const partners = [...(manager ? [manager] : []), ...reports.map((r) => r.id)];
      const people = await this.names(tx, org, [...rows.flatMap((m) => [m.employeeId, m.managerEmployeeId]), ...partners]);
      return {
        meetings: rows.map((m) => ({ id: m.id, with: people.get(m.employeeId === me ? m.managerEmployeeId : m.employeeId) ?? '', on: iso(m.on), status: m.status, role: m.managerEmployeeId === me ? 'manager' : 'employee' })),
        // Who I can hold a 1:1 with: my manager and my direct reports.
        partners: partners.map((p) => ({ value: p, label: `${people.get(p) ?? ''}${p === manager ? ' (my manager)' : ''}` })),
      };
    });
  }

  async meeting(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { m, me } = await this.meetingOr404(tx, c.organizationId, v, id);
      return this.meetingView(tx, c.organizationId, m, me, v.userId!);
    });
  }

  /** A 1:1 is between an employee and their current manager; open actions of the pair's earlier 1:1s carry to it. */
  async createMeeting(ctx: TenantContext, user: ScopeUser, dto: OneOnOneDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.mustBeEmployee(tx, org, v);
      let pair: { employeeId: string; managerEmployeeId: string };
      if ((await this.managerOf(tx, org, me)) === dto.withEmployeeId) pair = { employeeId: me, managerEmployeeId: dto.withEmployeeId };
      else if ((await this.managerOf(tx, org, dto.withEmployeeId)) === me) pair = { employeeId: dto.withEmployeeId, managerEmployeeId: me };
      else throw new ForbiddenException('A 1:1 is with your manager or one of your direct reports.');
      const m = await tx.oneOnOne.create({ data: { organizationId: org, ...pair, on: asDate(dto.on), createdBy: v.userId } });
      const earlier = await tx.oneOnOne.findMany({ where: { organizationId: org, ...pair, id: { not: m.id } }, select: { id: true } });
      await tx.oneOnOneAction.updateMany({ where: { organizationId: org, oneOnOneId: { in: earlier.map((e) => e.id) }, doneAt: null }, data: { oneOnOneId: m.id } });
      await audit(tx, c, 'perf.one_on_one.created', 'one_on_one', m.id, {});
      return this.meetingView(tx, org, m, me, v.userId!);
    });
  }

  async updateMeeting(ctx: TenantContext, user: ScopeUser, id: string, dto: OneOnOneUpdateDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { me } = await this.meetingOr404(tx, org, v, id);
      const n = await tx.oneOnOne.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...(dto.sharedNotes !== undefined ? { sharedNotes: dto.sharedNotes } : {}), ...(dto.status ? { status: dto.status } : {}), ...(dto.on ? { on: asDate(dto.on), remindedOn: null } : {}), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this 1:1. Reload it.');
      return this.meetingView(tx, org, await tx.oneOnOne.findFirstOrThrow({ where: { id } }), me, v.userId!);
    });
  }

  async addAgenda(ctx: TenantContext, user: ScopeUser, id: string, dto: AgendaDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { m, me } = await this.meetingOr404(tx, c.organizationId, v, id);
      await tx.oneOnOneAgendaItem.create({ data: { organizationId: c.organizationId, oneOnOneId: id, addedByEmployeeId: me, text: dto.text } });
      return this.meetingView(tx, c.organizationId, m, me, v.userId!);
    });
  }

  async agendaDone(ctx: TenantContext, user: ScopeUser, id: string, itemId: string, done: boolean) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { m, me } = await this.meetingOr404(tx, c.organizationId, v, id);
      const n = await tx.oneOnOneAgendaItem.updateMany({ where: { organizationId: c.organizationId, id: itemId, oneOnOneId: id }, data: { done } });
      if (!n.count) throw new NotFoundException('No such agenda item.');
      return this.meetingView(tx, c.organizationId, m, me, v.userId!);
    });
  }

  async privateNote(ctx: TenantContext, user: ScopeUser, id: string, text: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { m, me } = await this.meetingOr404(tx, c.organizationId, v, id);
      await tx.oneOnOnePrivateNote.upsert({ where: { oneOnOneId_authorUserId: { oneOnOneId: id, authorUserId: v.userId! } }, create: { organizationId: c.organizationId, oneOnOneId: id, authorUserId: v.userId!, text }, update: { text } });
      return this.meetingView(tx, c.organizationId, m, me, v.userId!);
    });
  }

  async addAction(ctx: TenantContext, user: ScopeUser, id: string, dto: ActionDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { m, me } = await this.meetingOr404(tx, org, v, id);
      if (dto.ownerEmployeeId !== m.employeeId && dto.ownerEmployeeId !== m.managerEmployeeId) throw new BadRequestException('An action belongs to one of the two people.');
      if (dto.goalId && !(await tx.goal.findFirst({ where: { organizationId: org, id: dto.goalId, ownerEmployeeId: m.employeeId }, select: { id: true } }))) throw new BadRequestException('Link a goal of the employee.');
      await tx.oneOnOneAction.create({ data: { organizationId: org, oneOnOneId: id, ownerEmployeeId: dto.ownerEmployeeId, text: dto.text, dueOn: dto.dueOn ? asDate(dto.dueOn) : null, goalId: dto.goalId ?? null } });
      return this.meetingView(tx, org, m, me, v.userId!);
    });
  }

  async actionDone(ctx: TenantContext, user: ScopeUser, id: string, actionId: string, done: boolean) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { m, me } = await this.meetingOr404(tx, c.organizationId, v, id);
      const n = await tx.oneOnOneAction.updateMany({ where: { organizationId: c.organizationId, id: actionId, oneOnOneId: id }, data: { doneAt: done ? new Date() : null } });
      if (!n.count) throw new NotFoundException('No such action.');
      return this.meetingView(tx, c.organizationId, m, me, v.userId!);
    });
  }

  // ------------------------------------------------------------------------------------------ reminders

  async sweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM one_on_ones WHERE status = 'planned' AND "on" = ${addDays(today, 1)}::date`);
    for (const { id: org } of orgs) {
      try {
        await this.sweepOrg(org, today);
      } catch (e) {
        this.logger.warn(`1:1 reminders ${org}: ${(e as Error).message}`);
      }
    }
  }

  /** The day before a planned 1:1, both people get one reminder. */
  async sweepOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const users = await this.tenantPrisma.forTenant(c, async (tx) => {
      const due = await tx.oneOnOne.findMany({ where: { organizationId: org, status: 'planned', on: asDate(addDays(today, 1)), remindedOn: null } });
      if (due.length) await tx.oneOnOne.updateMany({ where: { organizationId: org, id: { in: due.map((m) => m.id) } }, data: { remindedOn: asDate(today) } });
      return (await tx.employee.findMany({ where: { organizationId: org, id: { in: due.flatMap((m) => [m.employeeId, m.managerEmployeeId]) } }, select: { userId: true } })).map((e) => e.userId);
    });
    await this.tell(org, users, 'perf.one_on_one.reminder', 'You have a 1:1 tomorrow', '/yx/performance/one-on-ones');
    return users.filter(Boolean).length;
  }
}
