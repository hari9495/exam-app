import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import type { HandoverDecideDto, HandoverWithHrDto } from './b3-dto';

// PRF-13 hand-over list (M06 D7). When a manager leaves or changes, the open review, improvement plan, open 1:1 actions
// and goals aligned to the old manager's goal move to the new manager (reviews.service handOver, pips.service). This
// lists those moves: the new manager sees what came to them; HR with perf.cycle.manage (company-wide) sees all of them.
// A goal aligned to the old manager's goal needs a decision: align it to one of the new manager's goals, or leave it
// unaligned. The new manager or HR decides, once; the decision is audited. A moved improvement plan shows in HR's list
// only to HR who also hold perf.pip.manage company-wide.
// "Reassign to HR" (bulk, HR only): HR takes a decision that is still open off the new manager; it leaves their list and
// only HR decides it. Rows that need no decision, or are decided already, are left as they are and named in the answer.
// "View audit entry" (HR only): the move itself (made by YukthiX when the manager changed) and every audited change.

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const ARTEFACT_LABEL: Record<string, string> = { review: 'Manager review stage', goal_parent: 'Goal parent', pip: 'PIP', one_on_one_actions: '1:1 thread' };
const PIP_STATUS: Record<string, string> = { proposed: 'proposed', active: 'in progress', extended: 'extended', met: 'met', not_met: 'not met' };

type Row = Awaited<ReturnType<Tx['perfOwnerTransfer']['findMany']>>[number];

@Injectable()
export class PerformanceHandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.cycle.manage', 'perf.pip.manage']);
  }

  private hr(v: Viewer) {
    return tenantWide(v, 'perf.cycle.manage') && !v.actingForOther;
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

  /** What each moved artefact is, in a few words. */
  private async details(tx: Tx, org: string, rows: Row[]) {
    const of = (t: string) => rows.filter((r) => r.artefactType === t).map((r) => r.artefactId);
    const reviews = await tx.review.findMany({ where: { organizationId: org, id: { in: of('review') } }, select: { id: true, cycleId: true, status: true } });
    const cycles = new Map((await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: reviews.map((r) => r.cycleId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const goals = new Map((await tx.goal.findMany({ where: { organizationId: org, id: { in: of('goal_parent') } }, select: { id: true, title: true } })).map((g) => [g.id, g.title]));
    const pips = new Map((await tx.pip.findMany({ where: { organizationId: org, id: { in: of('pip') } }, select: { id: true, status: true } })).map((p) => [p.id, p.status]));
    const ones = new Map((await tx.oneOnOne.findMany({ where: { organizationId: org, id: { in: of('one_on_one_actions') } }, select: { id: true, on: true } })).map((o) => [o.id, iso(o.on)]));
    const rev = new Map(reviews.map((r) => [r.id, r]));
    return (r: Row): string => {
      if (r.artefactType === 'review') return `${cycles.get(rev.get(r.artefactId)?.cycleId ?? '') ?? 'Review'} · manager review`;
      if (r.artefactType === 'goal_parent') return `“${goals.get(r.artefactId) ?? 'Goal'}” was aligned to the old manager’s goal`;
      if (r.artefactType === 'pip') return `Improvement plan, ${PIP_STATUS[pips.get(r.artefactId) ?? ''] ?? 'open'}`;
      if (r.artefactType === 'one_on_one_actions') return `Open action items moved to the 1:1 on ${ones.get(r.artefactId) ?? 'the next date'}`;
      return r.artefactType;
    };
  }

  private async view(tx: Tx, org: string, rows: Row[]) {
    const people = await this.names(tx, org, rows.flatMap((r) => [r.employeeId, r.oldManagerEmployeeId, r.newManagerEmployeeId]));
    const detail = await this.details(tx, org, rows);
    return rows.map((r) => ({
      id: r.id,
      employee: people.get(r.employeeId) ?? '',
      employeeId: r.employeeId,
      artefact: ARTEFACT_LABEL[r.artefactType] ?? r.artefactType,
      artefactType: r.artefactType,
      artefactId: r.artefactId,
      detail: detail(r),
      from: people.get(r.oldManagerEmployeeId ?? '') ?? '',
      to: r.withHrAt ? 'HR' : (people.get(r.newManagerEmployeeId ?? '') ?? ''),
      withHr: Boolean(r.withHrAt),
      effectiveOn: iso(r.effectiveOn),
      status: r.decidedAt ? 'Decided' : r.decisionNeeded ? 'Needs decision' : 'Moved',
      decision: r.decision,
      note: r.decisionNote,
    }));
  }

  /** The new manager's list: everything handed over to me. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await this.me(tx, c.organizationId, v);
      if (!me) return [];
      const rows = await tx.perfOwnerTransfer.findMany({ where: { organizationId: c.organizationId, newManagerEmployeeId: me, withHrAt: null }, orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }], take: 500 });
      return this.view(tx, c.organizationId, rows);
    });
  }

  /** HR's list: every hand-over in the company (perf.cycle.manage, company-wide). */
  async all(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!this.hr(v)) throw new ForbiddenException('The company hand-over list is for HR with company-wide access to review cycles.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      // An improvement plan is Confidential: only HR who also hold perf.pip.manage company-wide see that one moved.
      const pips = tenantWide(v, 'perf.pip.manage');
      const rows = await tx.perfOwnerTransfer.findMany({ where: { organizationId: c.organizationId, ...(pips ? {} : { artefactType: { not: 'pip' } }) }, orderBy: [{ effectiveOn: 'desc' }, { createdAt: 'desc' }], take: 2000 });
      return this.view(tx, c.organizationId, rows);
    });
  }

  /** The row, if the caller may decide it: its new manager, or HR. Anyone else gets "not found". */
  private async decidable(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const r = await tx.perfOwnerTransfer.findFirst({ where: { organizationId: c.organizationId, id } });
    const me = await this.me(tx, c.organizationId, v);
    if (!r || !(this.hr(v) || (me && r.newManagerEmployeeId === me && !r.withHrAt))) throw new NotFoundException('No such hand-over.');
    return r;
  }

  /** Goals of the new manager the moved goal may be aligned to: theirs, in the same goal period, not closed. */
  async parentOptions(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.decidable(tx, c, v, id);
      if (r.artefactType !== 'goal_parent' || !r.newManagerEmployeeId) return [];
      const goal = await tx.goal.findFirst({ where: { organizationId: c.organizationId, id: r.artefactId }, select: { periodId: true } });
      if (!goal) return [];
      const rows = await tx.goal.findMany({ where: { organizationId: c.organizationId, ownerType: 'person', ownerEmployeeId: r.newManagerEmployeeId, periodId: goal.periodId, status: { in: ['draft', 'submitted', 'active'] } }, orderBy: { title: 'asc' }, select: { id: true, title: true } });
      return rows.map((g) => ({ value: g.id, label: g.title }));
    });
  }

  /** HR's company-wide actions, or 403 (the same rule as the list). */
  private hrOnly(v: Viewer) {
    if (!this.hr(v)) throw new ForbiddenException('Only HR with company-wide access to review cycles can do this.');
  }

  /** PRF-13 bulk "Reassign to HR": open decisions move from the new manager to HR; anything else is skipped and named. */
  async withHr(ctx: TenantContext, user: ScopeUser, dto: HandoverWithHrDto) {
    const v = await this.viewer(user);
    this.hrOnly(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = [...new Set(dto.ids)];
      const rows = await tx.perfOwnerTransfer.findMany({ where: { organizationId: org, id: { in: ids } } });
      const pips = tenantWide(v, 'perf.pip.manage');
      const skipped: { id: string; reason: string }[] = [];
      let moved = 0;
      const now = new Date();
      for (const id of ids) {
        const r = rows.find((x) => x.id === id);
        // Not in this company, or a plan this HR may not see: the same answer as "no such row".
        if (!r || (r.artefactType === 'pip' && !pips)) skipped.push({ id, reason: 'No such hand-over.' });
        else if (r.withHrAt) skipped.push({ id, reason: 'HR already has this one.' });
        else if (!r.decisionNeeded) skipped.push({ id, reason: 'It needs no decision: it already moved to the new manager.' });
        else if (r.decidedAt) skipped.push({ id, reason: 'It was already decided.' });
        else {
          const n = await tx.perfOwnerTransfer.updateMany({ where: { organizationId: org, id, withHrAt: null, decidedAt: null }, data: { withHrAt: now, withHrBy: v.userId } });
          if (!n.count) {
            skipped.push({ id, reason: 'Someone else changed it. Reload the list.' });
            continue;
          }
          moved++;
          await audit(tx, c, 'perf.handover.with_hr', 'perf_owner_transfer', id, { from: r.newManagerEmployeeId, artefactType: r.artefactType, artefactId: r.artefactId });
        }
      }
      return { moved, skipped };
    });
  }

  /** PRF-13 "View audit entry": the move (made when the manager changed) and each audited change to this hand-over. */
  async auditOf(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.hrOnly(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.perfOwnerTransfer.findFirst({ where: { organizationId: org, id } });
      if (!r || (r.artefactType === 'pip' && !tenantWide(v, 'perf.pip.manage'))) throw new NotFoundException('No such hand-over.');
      const people = await this.names(tx, org, [r.employeeId, r.oldManagerEmployeeId, r.newManagerEmployeeId]);
      const logs = await tx.auditLog.findMany({ where: { organizationId: org, entityType: 'perf_owner_transfer', entityId: id }, orderBy: { createdAt: 'asc' }, take: 50 });
      const WHAT: Record<string, string> = { 'perf.handover.with_hr': 'reassigned the decision to HR', 'perf.handover.decided': 'recorded the decision' };
      const how = (m: Record<string, unknown>) => (m.decision === 'realigned' ? ': aligned to a goal of the new manager' : m.decision === 'unaligned' ? ': left unaligned' : '');
      return [
        { id: `${r.id}-moved`, at: r.createdAt.toISOString(), who: null, what: `moved the ${(ARTEFACT_LABEL[r.artefactType] ?? r.artefactType).toLowerCase()} of ${people.get(r.employeeId) ?? ''} from ${people.get(r.oldManagerEmployeeId ?? '') ?? ''} to ${people.get(r.newManagerEmployeeId ?? '') ?? ''} when the manager changed` },
        ...logs.map((l) => {
          const m = (l.metadataJson ? JSON.parse(l.metadataJson) : {}) as Record<string, unknown>;
          return { id: l.id, at: l.createdAt.toISOString(), who: l.actorName ?? l.actorEmail ?? null, what: `${WHAT[l.action] ?? l.action}${l.action === 'perf.handover.decided' ? how(m) : ''}` };
        }),
      ];
    });
  }

  async decide(ctx: TenantContext, user: ScopeUser, id: string, dto: HandoverDecideDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await this.decidable(tx, c, v, id);
      if (!r.decisionNeeded) throw new ConflictException('This hand-over needs no decision.');
      if (r.decidedAt) throw new ConflictException('This hand-over was already decided. Reload the list.');
      if (r.artefactType !== 'goal_parent') throw new ConflictException('Only a goal’s alignment is decided here.');
      const goal = await tx.goal.findFirst({ where: { organizationId: org, id: r.artefactId } });
      if (!goal) throw new NotFoundException('The goal no longer exists.');
      let parentGoalId: string | null = null;
      if (dto.decision === 'realigned') {
        const parent = await tx.goal.findFirst({ where: { organizationId: org, id: dto.parentGoalId!, ownerType: 'person', ownerEmployeeId: r.newManagerEmployeeId ?? undefined, periodId: goal.periodId, status: { in: ['draft', 'submitted', 'active'] } } });
        if (!parent) throw new BadRequestException('Choose one of the new manager’s open goals in the same goal period.');
        parentGoalId = parent.id;
      }
      const n = await tx.perfOwnerTransfer.updateMany({ where: { organizationId: org, id, decidedAt: null }, data: { decision: dto.decision, decisionNote: dto.note || null, decidedBy: v.userId, decidedAt: new Date() } });
      if (!n.count) throw new ConflictException('This hand-over was already decided. Reload the list.');
      await tx.goal.update({ where: { id: goal.id }, data: { parentGoalId, version: { increment: 1 } } });
      await audit(tx, c, 'perf.handover.decided', 'perf_owner_transfer', id, { decision: dto.decision, goalId: goal.id, fromParent: goal.parentGoalId, toParent: parentGoalId });
      return (await this.view(tx, org, [await tx.perfOwnerTransfer.findFirstOrThrow({ where: { id } })]))[0];
    });
  }
}
