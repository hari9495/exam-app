import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { addDays, asDate, isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { has, inScopeSql, managerViewScope, tenantWide } from '../access/scope';
import { holdersOf } from '../time/time-core';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsEngine, InboxItem } from '../workflow/approvals-engine.service';
import { settingFor } from './probation';
import { PAY_ACCESS_ROLE } from '../access/role-templates';
import { PayAccessAskDto, PayAccessDecisionDto } from './dto';

// Founder decisions 28 Oct 2026: a manager asks to see their team's pay (the whole team or one named person), with a
// reason. Two different HR people approve (employee.pay_access.approve over every person it covers; never the manager,
// never one of the people covered, and the second never the first). The company sets how long access lasts and the
// default scope (pay_access.days / pay_access.scope); the approving HR person may change both. The second approval
// creates a role grant of employee.salary.view over only those people (the team scope, or one_report), valid until the
// end date, so the pay is hidden again the day after without any job. A refusal grants nothing.

const KEY = 'employee.pay_access.approve';
const ROLE_KEYS = JSON.stringify(['employee.salary.view']);

type Row = Prisma.PayAccessRequestGetPayload<object>;
type Person = { id: string; name: string };

@Injectable()
export class PayAccessService implements OnModuleInit {
  private readonly logger = new Logger(PayAccessService.name);

  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications?: NotificationsService,
    private readonly engine?: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine?.registerInboxSource((tx, c, userId) => this.waitingFor(tx, c, userId));
  }

  /** The manager's reports today, exactly as a team grant opens them (the company's "managers can view" setting). */
  private async team(tx: Tx, c: CompanyContext, own: string): Promise<Person[]> {
    const type = (await managerViewScope(tx, c)) === 'direct_reports' ? 'direct_reports' : 'all_reports';
    const today = todayIst();
    const rows = await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; preferred_name: string | null }[]>`
      SELECT e.id::text, e.given_name, e.family_name, e.preferred_name FROM employees e
      WHERE e.organization_id = ${c.organizationId}::uuid AND e.id <> ${own}::uuid
        AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                    AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))
        AND yx_scope_periods(${c.organizationId}::uuid, e.id, ${type}, NULL, ${own}::uuid) @> ${today}::date`;
    return rows.map((r) => ({ id: r.id, name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The people a request covers today: the team, or the one person while they are still in it. */
  private async covered(tx: Tx, c: CompanyContext, r: Pick<Row, 'managerEmployeeId' | 'scope' | 'employeeId'>): Promise<Person[]> {
    const team = await this.team(tx, c, r.managerEmployeeId);
    return r.scope === 'team' ? team : team.filter((p) => p.id === r.employeeId);
  }

  private async defaults(tx: Tx, c: CompanyContext) {
    return { days: Number(await settingFor(tx, c, 'pay_access.days', { legalEntityId: '' })), scope: (await settingFor(tx, c, 'pay_access.scope', { legalEntityId: '' })) as 'team' | 'person' };
  }

  // ------------------------------------------------------------------------------------------------- the manager

  /** What the manager needs to ask: their team, the company's defaults, and their own requests (newest first). */
  mine(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const own = await this.history.ownEmployeeId(tx, c, v);
      const team = own ? await this.team(tx, c, own) : [];
      const rows = v.userId ? await tx.payAccessRequest.findMany({ where: { organizationId: c.organizationId, requestedBy: v.userId }, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
      return { ...(await this.defaults(tx, c)), team, requests: await this.views(tx, c, rows, null) };
    });
  }

  async ask(ctx: TenantContext, v: Viewer, dto: PayAccessAskDto) {
    if (v.actingForOther || !v.userId) throw new ForbiddenException('Not available while acting for someone else.');
    const userId = v.userId;
    const out = await this.history.run(ctx, async (tx, c) => {
      const own = await this.history.ownEmployeeId(tx, c, v);
      const team = own ? await this.team(tx, c, own) : [];
      if (!own || !team.length) throw new ForbiddenException('Only a manager can ask to see their team’s pay.');
      if ((dto.scope === 'person') !== Boolean(dto.employeeId)) throw new BadRequestException(dto.scope === 'person' ? 'Say whose pay you need.' : 'A request for the whole team names nobody.');
      // Never someone outside the team (scope can never exceed the manager's reports).
      if (dto.employeeId && !team.some((p) => p.id === dto.employeeId)) throw new ForbiddenException('You can ask only for people in your team.');
      if (await tx.payAccessRequest.findFirst({ where: { organizationId: c.organizationId, requestedBy: userId, status: 'pending' }, select: { id: true } })) {
        throw new ConflictException('You already have a request waiting for HR.');
      }
      const { days } = await this.defaults(tx, c);
      const row = await tx.payAccessRequest.create({
        data: { organizationId: c.organizationId, requestedBy: userId, managerEmployeeId: own, scope: dto.scope, employeeId: dto.employeeId ?? null, reason: dto.reason.trim(), days },
      });
      await audit(tx, c, 'employee.pay_access.requested', 'pay_access_request', row.id, { scope: row.scope, employeeId: row.employeeId, days, people: dto.scope === 'team' ? team.length : 1 });
      return { row, view: (await this.views(tx, c, [row], null))[0], to: await this.approverIds(tx, c, row) };
    });
    await this.tell(ctx, userId, out.to, 'employee.pay_access.approval_needed', out.row.id, `${out.view.manager.name} asks to see the pay of ${out.view.covers} · waits for your approval (1 of 2)`);
    return out.view;
  }

  // ---------------------------------------------------------------------------------------------------- HR

  /** Every request whose people the HR person's key reaches, with whether they may decide it now. */
  list(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      if (!has(v, KEY)) throw new ForbiddenException('You cannot decide pay access requests.');
      const rows = await tx.payAccessRequest.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 200 });
      const mine: Row[] = [];
      for (const r of rows) if (await this.reachesAll(tx, c, v, r)) mine.push(r);
      return { ...(await this.defaults(tx, c)), rows: await this.views(tx, c, mine, v) };
    });
  }

  /** The approver's key reaches the manager and every person the request may cover. */
  private async reachesAll(tx: Tx, c: CompanyContext, v: Viewer, r: Pick<Row, 'managerEmployeeId' | 'scope' | 'employeeId'>, people?: Person[]) {
    const ids = [r.managerEmployeeId, ...(people ?? (await this.covered(tx, c, r))).map((p) => p.id), ...(r.employeeId ? [r.employeeId] : [])];
    if (!has(v, KEY)) return false;
    if (tenantWide(v, KEY)) return true;
    const own = await this.history.ownEmployeeId(tx, c, v);
    const reached = await tx.$queryRaw<{ id: string }[]>`
      SELECT x.id::text FROM unnest(${[...new Set(ids)]}::uuid[]) AS x(id) WHERE ${inScopeSql(c, v, KEY, Prisma.sql`x.id`, Prisma.sql`${todayIst()}::date`, own)}`;
    return ids.every((id) => reached.some((r) => r.id === id));
  }

  /** Why this person may not decide this request now, or null. The same rules the database enforces. */
  private async refusal(tx: Tx, c: CompanyContext, v: Viewer, r: Row, people: Person[]): Promise<string | null> {
    if (r.status !== 'pending') return `This request is already ${r.status}.`;
    if (r.requestedBy === v.userId) return 'You asked for this, so two other HR people decide it.';
    if (r.firstBy && r.firstBy === v.userId) return 'You gave the first approval; another HR person gives the second.';
    const own = await this.history.ownEmployeeId(tx, c, v);
    if (own && (own === r.managerEmployeeId || people.some((p) => p.id === own))) return 'It is about your own pay or your manager, so other HR people decide it.';
    return null;
  }

  async decide(ctx: TenantContext, v: Viewer, id: string, dto: PayAccessDecisionDto) {
    if (v.actingForOther || !v.userId) throw new ForbiddenException('Not available while acting for someone else.');
    const actor = v.userId;
    const out = await this.history.run(ctx, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pay-access:${c.organizationId}:${id}`}))`;
      const r = await tx.payAccessRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r || !(await this.reachesAll(tx, c, v, r))) throw new NotFoundException('Request not found');
      const now = new Date();
      if (dto.decision === 'refuse') {
        const why = await this.refusal(tx, c, v, r, await this.covered(tx, c, r));
        if (why) throw (r.status !== 'pending' ? new ConflictException(why) : new ForbiddenException(why));
        if (!dto.note?.trim()) throw new BadRequestException('Say why you refuse it.');
        const row = await tx.payAccessRequest.update({ where: { id }, data: { status: 'refused', decidedBy: actor, decidedAt: now, decisionNote: dto.note.trim() } });
        await audit(tx, c, 'employee.pay_access.refused', 'pay_access_request', id, { step: r.firstBy ? 2 : 1 });
        return { row, to: [r.requestedBy, ...(r.firstBy ? [r.firstBy] : [])], kind: 'refused' as const };
      }
      // The approver may change how long and who it covers; never beyond the manager's reports.
      const scope = dto.scope ?? (r.scope as 'team' | 'person');
      const employeeId = scope === 'person' ? (dto.employeeId ?? (dto.scope ? null : r.employeeId)) : null;
      if (scope === 'person' && !employeeId) throw new BadRequestException('Say which person it covers.');
      const next = { scope, employeeId, days: dto.days ? Number(dto.days) : r.days };
      const people = await this.covered(tx, c, { managerEmployeeId: r.managerEmployeeId, ...next });
      if (!people.length) throw new BadRequestException(scope === 'person' ? 'That person is not in this manager’s team.' : 'This manager has nobody in their team now.');
      if (!(await this.reachesAll(tx, c, v, { managerEmployeeId: r.managerEmployeeId, ...next }, people))) throw new ForbiddenException('That person is outside the people you look after.');
      const why = await this.refusal(tx, c, v, r, people);
      if (why) throw (r.status !== 'pending' ? new ConflictException(why) : new ForbiddenException(why));
      const note = dto.note?.trim() || null;
      if (!r.firstBy) {
        const row = await tx.payAccessRequest.update({ where: { id }, data: { ...next, firstBy: actor, firstAt: now, firstNote: note } });
        await audit(tx, c, 'employee.pay_access.first_approved', 'pay_access_request', id, { ...next, people: people.length });
        return { row, to: await this.approverIds(tx, c, row), kind: 'first' as const };
      }
      // Second approval: the grant, over only these people, until the last day.
      const today = todayIst();
      const validTo = addDays(today, next.days - 1);
      const team = (await managerViewScope(tx, c)) === 'direct_reports' ? 'direct_reports' : 'all_reports';
      const grant = await tx.roleGrant.create({
        data: {
          organizationId: c.organizationId,
          userId: r.requestedBy,
          permissionProfileId: await this.role(tx, c),
          scopeType: scope === 'team' ? team : 'one_report',
          employeeId,
          validFrom: asDate(today),
          validTo: asDate(validTo),
          status: 'active',
          reason: `Team pay access: ${r.reason}`.slice(0, 500),
          grantedBy: r.firstBy,
          decidedBy: actor,
          decidedAt: now,
          decisionNote: note,
        },
      });
      const row = await tx.payAccessRequest.update({ where: { id }, data: { ...next, status: 'approved', decidedBy: actor, decidedAt: now, decisionNote: note, grantId: grant.id, validTo: asDate(validTo) } });
      await audit(tx, c, 'employee.pay_access.approved', 'pay_access_request', id, { ...next, grantId: grant.id, validTo, people: people.length });
      await audit(tx, c, 'access.grant.created', 'role_grant', grant.id, { userId: r.requestedBy, role: 'Team pay access', scopeType: grant.scopeType, employeeId, validFrom: today, validTo, status: 'active', confidential: true, people: people.length, payAccessRequestId: id });
      return { row, to: [r.requestedBy, r.firstBy], kind: 'approved' as const };
    });
    const view = await this.history.run(ctx, async (tx, c) => (await this.views(tx, c, [out.row], v))[0]);
    const text =
      out.kind === 'refused'
        ? `Your request to see the pay of ${view.covers} was refused: ${out.row.decisionNote}`
        : out.kind === 'first'
          ? `${view.manager.name} asks to see the pay of ${view.covers} · first approval given, waits for yours (2 of 2)`
          : `Pay of ${view.covers} is open to ${view.manager.name} until ${view.validTo}`;
    if (out.kind === 'first') {
      await this.tell(ctx, actor, out.to, 'employee.pay_access.approval_needed', out.row.id, text);
      await this.tell(ctx, actor, [out.row.requestedBy], 'employee.pay_access.decided', out.row.id, `Your request to see the pay of ${view.covers} has its first approval; it waits for a second HR person.`);
    } else {
      await this.tell(ctx, actor, out.to, 'employee.pay_access.decided', out.row.id, text);
    }
    return view;
  }

  /** The company role the grants use (employee.salary.view only), made once. */
  private async role(tx: Tx, c: CompanyContext): Promise<string> {
    const found = await tx.permissionProfile.findFirst({ where: { organizationId: c.organizationId, templateKey: PAY_ACCESS_ROLE, permissionsJson: ROLE_KEYS }, select: { id: true } });
    if (found) return found.id;
    const made = await tx.permissionProfile.create({ data: { organizationId: c.organizationId, name: 'Team pay access (manager request)', permissionsJson: ROLE_KEYS, templateKey: PAY_ACCESS_ROLE, templateChecked: true } });
    return made.id;
  }

  // ------------------------------------------------------------------------------------- inbox and notices

  /**
   * Who may decide the request now: holders of the key over the manager and every person it covers, never the manager,
   * the first approver or one of those people. shortcut: holdersOf returns at most 25 logins per person and the team is
   * read in full; fine for a team's size, index by scope if a company has hundreds of HR approvers.
   */
  private async approverIds(tx: Tx, c: CompanyContext, r: Row): Promise<string[]> {
    if (r.status !== 'pending') return [];
    const today = todayIst();
    const people = await this.covered(tx, c, r);
    let ids: string[] | null = null;
    for (const emp of [r.managerEmployeeId, ...people.map((p) => p.id)]) {
      const holders: string[] = await holdersOf(tx, c.organizationId, KEY, emp, today);
      ids = ids === null ? holders : ids.filter((x) => holders.includes(x));
      if (!ids.length) return [];
    }
    const users = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: [r.managerEmployeeId, ...people.map((p) => p.id)] }, userId: { not: null } }, select: { userId: true } });
    const out = new Set(users.map((u) => u.userId));
    return (ids ?? []).filter((x) => x !== r.requestedBy && x !== r.firstBy && !out.has(x));
  }

  /** Requests waiting for this person join their Approvals inbox and its count; they decide on People › Team pay access. */
  async waitingFor(tx: Tx, c: CompanyContext, userId: string): Promise<InboxItem[]> {
    const rows = await tx.payAccessRequest.findMany({ where: { organizationId: c.organizationId, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100 });
    const mine: { r: Row; approvers: number }[] = [];
    for (const r of rows) {
      const ids = await this.approverIds(tx, c, r);
      if (ids.includes(userId)) mine.push({ r, approvers: ids.length });
    }
    if (!mine.length) return [];
    const views = await this.views(tx, c, mine.map((m) => m.r), null);
    return mine.map(({ r, approvers }, i) => ({
      taskId: r.id,
      requestId: r.id,
      type: 'Team pay access',
      title: `${views[i].manager.name}: see the pay of ${views[i].covers}`,
      summary: [
        { label: 'For', value: `${r.days} days` },
        { label: 'Reason', value: r.reason },
      ],
      requester: views[i].manager.name,
      raisedBy: null,
      onBehalfOf: null,
      person: views[i].person?.name ?? '',
      step: { index: r.firstBy ? 2 : 1, of: 2, name: r.firstBy ? 'Second HR approval' : 'First HR approval', need: 1, approvers },
      dueAt: null,
      submittedAt: r.createdAt,
      decideAt: '/yx/people/pay-access',
    }));
  }

  private async tell(ctx: TenantContext, actor: string, to: (string | null)[], type: string, id: string, text: string) {
    const ids = to.filter((x): x is string => Boolean(x));
    if (!this.notifications || !ids.length) return;
    await this.notifications.notify(ctx, actor, ids, type, { entityType: 'pay_access_request', entityId: id, contextText: text, linkPath: type === 'employee.pay_access.approval_needed' ? '/yx/people/pay-access' : '/yx/people/team' }).catch((e: unknown) => this.logger.error(e));
  }

  // ------------------------------------------------------------------------------------------------ views

  private async views(tx: Tx, c: CompanyContext, rows: Row[], v: Viewer | null) {
    if (!rows.length) return [];
    const org = c.organizationId;
    const today = todayIst();
    const employeeIds = [...new Set(rows.flatMap((r) => [r.managerEmployeeId, ...(r.employeeId ? [r.employeeId] : [])]))];
    const userIds = [...new Set(rows.flatMap((r) => [r.firstBy, r.decidedBy]).filter((x): x is string => Boolean(x)))];
    const [employees, users] = await Promise.all([
      tx.employee.findMany({ where: { organizationId: org, id: { in: employeeIds } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
      userIds.length ? tx.user.findMany({ where: { organizationId: org, id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    ]);
    const nameOf = (id: string | null) => {
      const e = employees.find((x) => x.id === id);
      return e ? displayName(e) : '';
    };
    const who = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? u.name?.trim() || u.email : null;
    };
    const out = [];
    for (const r of rows) {
      const team = await this.team(tx, c, r.managerEmployeeId);
      const person = r.employeeId ? { id: r.employeeId, name: nameOf(r.employeeId) } : null;
      const validTo = r.validTo ? isoDate(r.validTo) : null;
      const state = r.status === 'pending' ? (r.firstBy ? 'second' : 'first') : r.status === 'refused' ? 'refused' : validTo && validTo >= today ? 'active' : 'ended';
      const decider = v && r.status === 'pending' && (await this.reachesAll(tx, c, v, r)) && !(await this.refusal(tx, c, v, r, r.scope === 'team' ? team : team.filter((p) => p.id === r.employeeId)));
      out.push({
        id: r.id,
        manager: { id: r.managerEmployeeId, name: nameOf(r.managerEmployeeId) },
        scope: r.scope as 'team' | 'person',
        person,
        covers: person ? person.name : `their whole team (${team.length} ${team.length === 1 ? 'person' : 'people'})`,
        reason: r.reason,
        days: r.days,
        state: state as 'first' | 'second' | 'active' | 'ended' | 'refused',
        askedAt: r.createdAt.toISOString(),
        first: r.firstBy ? { by: who(r.firstBy), at: r.firstAt!.toISOString(), note: r.firstNote } : null,
        decided: r.decidedBy ? { by: who(r.decidedBy), at: r.decidedAt!.toISOString(), note: r.decisionNote } : null,
        validTo,
        // Only for an HR person who may decide it now: the team to narrow it to one person.
        ...(decider ? { canDecide: true, team } : { canDecide: false }),
      });
    }
    return out;
  }
}
