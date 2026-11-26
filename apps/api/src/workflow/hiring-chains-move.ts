import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext, type CompanyContext } from '../org-structure/org-structure.service';
import { resolveSteps, type ChainStepInput } from '../approvals/approver-resolver';
import { ApprovalPolicies, type PolicyStep } from './approval-policies';
import { ApprovalsEngine } from './approvals-engine.service';

type Tx = Prisma.TransactionClient;
type Ctx = { organizationId: string | null; userId?: string | null };
const NONE = '00000000-0000-0000-0000-000000000000';
const GATES = [
  { gate: 'requisition', type: 'ats.requisition', label: 'Requisitions' },
  { gate: 'offer', type: 'ats.offer', label: 'Offers' },
] as const;
/** People the dry run tries a chain for: past requesters, and (for a manager step) people with a manager on their login. */
const MAX_SAMPLES = 100;
const MAX_ROWS = 50;

export interface MoveRow {
  type: string;
  label: string;
  /** none: no old chain to move; moved: the company already has its own policy; match: old and new give the same people. */
  status: 'none' | 'moved' | 'match' | 'differs';
  steps: PolicyStep[];
  checked: number;
  differences: { step: string; person: string; old: string[]; new: string[]; why: string }[];
}

/** An old chain step as a policy step, or why it has none. */
function convert(s: { name: string; approverType: string; approverUserIds: string | null; groupId: string | null; managerLevel: number | null }, i: number): PolicyStep | string {
  const name = s.name.trim().length >= 2 && s.name.trim().length <= 60 && !/[<>]/.test(s.name) ? s.name.trim() : `Step ${i + 1}`;
  if (s.approverType === 'users') return { name, approver: 'users', mode: 'any', userIds: s.approverUserIds ? (JSON.parse(s.approverUserIds) as string[]).slice(0, 25) : [] };
  if (s.approverType === 'hiring_manager') return { name, approver: 'hiring_manager', mode: 'any' };
  if (s.approverType === 'group') return s.groupId ? { name, approver: 'group', mode: 'any', groupId: s.groupId } : `"${name}" has no group`;
  if (s.approverType === 'reporting_manager') return (s.managerLevel ?? 1) <= 2 ? { name, approver: (s.managerLevel ?? 1) === 2 ? 'manager_2' : 'manager', mode: 'any' } : `"${name}" goes ${s.managerLevel} managers up; the new rules go up two, or up the chain to a grade`;
  return `"${name}" has an approver kind the new rules do not have`;
}

/**
 * E2 part 6 (answers 2647 and 2789, review item 10): the old hiring approval chains (Hiring › Approvals) move into the
 * company's approval policies for requisitions and offers. The old chain walks the login's manager and skips a step
 * nobody can approve; the engine walks the employee record and sends such a step to the admins. So each company first
 * gets a dry run, old approvers next to new ones (the new ones from the engine's own route()), and only a company where
 * every step gives the same people moves. Re-runnable: a type that already has its own policy is left alone.
 */
@Injectable()
export class HiringChainsMove {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly policies: ApprovalPolicies,
    private readonly engine: ApprovalsEngine,
  ) {}

  async dryRun(ctx: Ctx): Promise<MoveRow[]> {
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
    return this.tenantPrisma.forTenant(c, (tx) => this.compare(tx, c));
  }

  private async compare(tx: Tx, c: CompanyContext): Promise<MoveRow[]> {
    const org = c.organizationId;
    const out: MoveRow[] = [];
    for (const g of GATES) {
      const row: MoveRow = { type: g.type, label: g.label, status: 'none', steps: [], checked: 0, differences: [] };
      out.push(row);
      const chain = await tx.approvalChain.findFirst({ where: { organizationId: org, gate: g.gate }, include: { steps: { orderBy: { position: 'asc' } } } });
      if (await this.policies.has(tx, c, g.type)) {
        row.status = 'moved';
        continue;
      }
      if (!chain?.enabled || !chain.steps.length) continue;
      const converted = chain.steps.map(convert);
      const bad = converted.filter((x): x is string => typeof x === 'string');
      if (bad.length) {
        row.status = 'differs';
        row.differences = bad.map((why) => ({ step: why.split('"')[1] ?? '', person: '', old: [], new: [], why }));
        continue;
      }
      row.steps = converted as PolicyStep[];
      const input: ChainStepInput[] = chain.steps.map((s) => ({ position: s.position, name: s.name, approverType: s.approverType as ChainStepInput['approverType'], approverUserIds: s.approverUserIds ? (JSON.parse(s.approverUserIds) as string[]) : [], managerLevel: s.managerLevel, groupId: s.groupId }));
      // A real job (and offer) of the company, so a hiring-manager step resolves the same way in both.
      const job = await tx.job.findFirst({ where: { organizationId: org, hiringManagerId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { id: true, hiringManagerId: true } });
      const offer = g.gate === 'offer' && job ? await tx.offer.findFirst({ where: { organizationId: org, pipelineEntry: { jobId: job.id } }, select: { id: true } }) : null;
      const subjectId = g.gate === 'offer' ? (offer?.id ?? NONE) : (job?.id ?? NONE);
      const hm = (g.gate === 'offer' ? offer : job) ? (job?.hiringManagerId ?? null) : null;
      const past = (await tx.wfRequest.findMany({ where: { organizationId: org, requestType: g.type, requesterUserId: { not: null } }, distinct: ['requesterUserId'], orderBy: { createdAt: 'desc' }, take: MAX_SAMPLES, select: { requesterUserId: true } })).map((r) => r.requesterUserId!);
      const withManager = input.some((s) => s.approverType === 'reporting_manager') ? (await tx.user.findMany({ where: { organizationId: org, status: 'active', managerId: { not: null } }, orderBy: { id: 'asc' }, take: MAX_SAMPLES, select: { id: true } })).map((u) => u.id) : [];
      const samples = [...new Set([...past, ...withManager])].slice(0, MAX_SAMPLES);
      const chosen = await this.policies.choose(tx, c, g.type, { rules: [], steps: row.steps }, 0, { ...(hm ? { hiring_manager_id: hm } : {}) }, []);
      const names = async (ids: string[]) => (ids.length ? (await tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { name: true, email: true } })).map((u) => u.name?.trim() || u.email).sort() : []);
      for (const who of samples.length ? samples : [NONE]) {
        row.checked++;
        const old = await resolveSteps(tx, { steps: input, submitterUserId: who, gate: g.gate, subjectId, organizationId: org });
        const skipped = new Set(old.skipped.map((s) => s.position));
        const oldIds: string[][] = [];
        let k = 0;
        for (const s of input) oldIds.push(skipped.has(s.position) ? [] : (old.resolved[k++]?.approverUserIds ?? []));
        const routed = await this.engine.route(tx, c, { type: g.type, subjectType: 'dry_run', subjectId, title: 'Dry run', summary: [], subjectPersonId: null, requesterUserId: who === NONE ? null : who, raisedByUserId: who === NONE ? null : who, steps: [], payload: hm ? { hiring_manager_id: hm } : {}, payloadFields: [], fallbackUserIds: [], alwaysRoute: true }, chosen);
        for (const [i, s] of row.steps.entries()) {
          const a = [...new Set(oldIds[i] ?? [])].sort();
          const b = [...new Set(routed.steps[i]?.approverIds ?? [])].sort();
          const same = a.length > 0 && a.length === b.length && a.every((x, j) => x === b[j]);
          if (same || row.differences.length >= MAX_ROWS) continue;
          row.differences.push({
            step: s.name,
            person: who === NONE ? '' : ((await names([who]))[0] ?? ''),
            old: await names(a),
            new: await names(b),
            why: !a.length ? 'The old chain skips this step for them; the new rules send it to the company admins.' : !b.length ? 'The new rules find nobody for this step.' : 'Different people approve.',
          });
        }
      }
      row.status = row.differences.length ? 'differs' : 'match';
    }
    return out;
  }

  /** Moves the matching types of this company into policies (version 1, audited with the chain id). */
  async run(ctx: Ctx): Promise<{ moved: string[]; rows: MoveRow[] }> {
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
    const moved = await this.tenantPrisma.forTenant(c, async (tx) => {
      const done: string[] = [];
      for (const r of await this.compare(tx, c)) {
        if (r.status !== 'match') continue;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-policy:${c.organizationId}:${r.type}`}))`;
        if (await this.policies.has(tx, c, r.type)) continue;
        await this.policies.checkCompany(tx, c, r.type, r.steps);
        await tx.approvalPolicy.create({ data: { organizationId: c.organizationId, requestType: r.type, steps: r.steps as unknown as Prisma.InputJsonValue, rules: [], version: 1, updatedBy: ctx.userId ?? null } });
        const chain = await tx.approvalChain.findFirst({ where: { organizationId: c.organizationId, gate: r.type === 'ats.offer' ? 'offer' : 'requisition' }, select: { id: true } });
        await AuditService.recordIn(tx, c, { actorUserId: ctx.userId ?? null, action: 'workflow.policy.moved', entityType: 'approval_policy', entityId: r.type, metadata: { type: r.type, chainId: chain?.id ?? null, after: { rules: [], steps: r.steps }, checked: r.checked } as unknown as Record<string, unknown> });
        done.push(r.type);
      }
      return done;
    });
    return { moved, rows: await this.dryRun(ctx) };
  }

  /** Every company with an old chain (the CLI): moves the matching ones, returns the rest for HR. */
  async runAll(): Promise<{ organizationId: string; moved: string[]; left: MoveRow[] }[]> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.approvalChain.findMany({ where: { enabled: true }, distinct: ['organizationId'], select: { organizationId: true } }));
    const out = [];
    for (const { organizationId } of orgs) {
      const r = await this.run({ organizationId, userId: null });
      out.push({ organizationId, moved: r.moved, left: r.rows.filter((x) => x.status === 'differs') });
    }
    return out;
  }
}
