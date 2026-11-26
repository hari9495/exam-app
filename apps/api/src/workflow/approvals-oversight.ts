import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { ApprovalsEngine } from './approvals-engine.service';

/** Answer 2500: see everyone's pending approvals and move them (HR Admin template; legal-entity scope). */
export const OVERSEE = 'workflow.approvals.oversee';

/**
 * The requests an overseer reaches: all of them with a company-wide grant; with legal-entity grants, those about a person
 * whose current job is in one of those entities. A request about nobody (or a candidate) needs the company-wide grant.
 * Any other scope type reaches nothing (deny by default).
 */
export async function reachable(tx: Tx, org: string, v: Viewer, reqs: Pick<Prisma.WfRequestGetPayload<object>, 'id' | 'subjectPersonId'>[]): Promise<Set<string>> {
  if (!v.grants.has(OVERSEE) || v.actingForOther) return new Set();
  if (tenantWide(v, OVERSEE)) return new Set(reqs.map((r) => r.id));
  const entities = new Set((v.scopes.get(OVERSEE) ?? []).filter((s) => s.type === 'legal_entity' && s.id).map((s) => s.id as string));
  const people = [...new Set(reqs.map((r) => r.subjectPersonId).filter((p): p is string => Boolean(p)))];
  if (!entities.size || !people.length) return new Set();
  const emps = await tx.employee.findMany({ where: { organizationId: org, personId: { in: people } }, select: { id: true, personId: true } });
  const jobs = await tx.employment.findMany({ where: { organizationId: org, employeeId: { in: emps.map((e) => e.id) } }, orderBy: { joinedOn: 'desc' }, select: { employeeId: true, legalEntityId: true } });
  const latest = new Map<string, string>();
  for (const j of jobs) if (!latest.has(j.employeeId)) latest.set(j.employeeId, j.legalEntityId);
  const entityOf = new Map(emps.map((e) => [e.personId, latest.get(e.id)]));
  return new Set(reqs.filter((r) => r.subjectPersonId && entities.has(entityOf.get(r.subjectPersonId) ?? '')).map((r) => r.id));
}

@Injectable()
export class ApprovalsOversight {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [OVERSEE]);
  }

  async everyone(ctx: CompanyContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has(OVERSEE) || v.actingForOther) throw new ForbiddenException('You cannot see everyone’s approvals.');
    return this.engine.pendingAll(ctx, (tx, reqs) => reachable(tx, ctx.organizationId, v, reqs));
  }

  /** Answer 2502: the task's holder, or an overseer whose scope reaches the request. */
  async reassign(ctx: CompanyContext, user: ScopeUser, taskId: string, toUserId: string, reason: string) {
    const v = await this.viewer(user);
    return this.engine.reassign(ctx, user.userId!, taskId, toUserId, reason, async (tx, req) => (await reachable(tx, ctx.organizationId, v, [req])).has(req.id));
  }
}
