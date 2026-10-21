import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { holdersOf } from '../time/time-core';
import { ApprovalsEngine, type Notice, type StepSpec } from '../workflow/approvals-engine.service';
import { AutomationService } from '../rules-engine/automation.service';
import { JobBoardPosterService } from '../job-boards/job-board-poster.service';
import { resolveSteps, type ChainStepInput } from '../approvals/approver-resolver';
import type { ApprovalSummary } from '../approvals/approvals.service';
import { checkRequisition, type PlanMode } from './requisition-rules';
import type { PlanDto } from './hiring-dto';

// Recruitment batch AT2 (M10-BUILD-DESIGN §5; AT-2.01 … 2.04): headcount plans and requisitions on P03.
//   plans        one per department and financial year; lines by designation (grade, location optional) with a count
//                and an optional budget; edited while draft or sent back, approved through P03 'ats.headcount_plan' by
//                holders of ats.headcount.manage (never the submitter; the company's admins when nobody holds it)
//   usage        committed = openings of live requisitions on the line (waiting for approval or open); filled = people
//                in a "hired" stage of the line's jobs; counted, never stored, so closing a job releases its openings
//   requisition  a job in draft; on submit the plan rules decide whether the extra (outside plan / over budget) step is
//                needed; the company's requisition chain (the older approval_chains row, D3) stays the route: its steps
//                are resolved to people now and run on P03 'ats.requisition'; with neither, the job opens at once
//   decided      approved → the job opens (boards are synced after commit); sent back → draft again

export const REQUISITION_TYPE = 'ats.requisition';
export const PLAN_TYPE = 'ats.headcount_plan';
const D = (n: Prisma.Decimal | null) => (n === null ? null : Number(n.toString()));

@Injectable()
export class HiringRequisitionsService implements OnModuleInit {
  private readonly logger = new Logger(HiringRequisitionsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly automation: AutomationService,
    private readonly poster: JobBoardPosterService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: REQUISITION_TYPE, label: 'Requisition', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.decided(tx, req, o), requesterLink: () => '/yx/hiring/requisitions' });
    this.engine.register({ key: PLAN_TYPE, label: 'Headcount plan', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.planDecided(tx, req, o), requesterLink: () => '/yx/hiring/plans' });
    // Paid boards go live after the approval commits (as the older gate did on approval).
    this.automation.subscribe(async (ev) => {
      if (ev.type === 'ats.requisition.approved' && typeof ev.payload.jobId === 'string') {
        await this.poster.syncJobToPaidBoards({ organizationId: ev.organizationId, isSuperAdmin: false }, ev.payload.jobId).catch((e) => this.logger.warn(`boards ${ev.payload.jobId}: ${(e as Error).message}`));
      }
    });
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async mode(tx: Tx, c: CompanyContext): Promise<PlanMode> {
    return (await settingFor(tx, c, 'ats.headcount_plan', { legalEntityId: '' })) as PlanMode;
  }

  /** Does a new job start as a draft requisition? When the company's requisition chain is on, or the plan is required. */
  async startsAsDraft(ctx: TenantContext): Promise<boolean> {
    return this.run(ctx, async (tx, c) => {
      const chain = await tx.approvalChain.findFirst({ where: { organizationId: c.organizationId, gate: 'requisition' }, select: { enabled: true } });
      return Boolean(chain?.enabled) || (await this.mode(tx, c)) === 'required';
    });
  }

  private async admins(tx: Tx, org: string, not: (string | null)[]) {
    return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter((u) => !not.includes(u));
  }

  /** Holders of ats.job.manage or pipeline:manage (recruiting), else the company's admins. */
  private async jobManagers(tx: Tx, org: string, not: (string | null)[]) {
    const none = '00000000-0000-0000-0000-000000000000';
    const holders = [...new Set([...(await holdersOf(tx, org, 'ats.job.manage', none, todayIst())), ...(await holdersOf(tx, org, 'pipeline:manage', none, todayIst()))])].filter((u) => !not.includes(u));
    return holders.length ? holders : this.admins(tx, org, not);
  }

  /** Holders of ats.headcount.manage (finance / HR), else the company's admins. */
  private async planApprovers(tx: Tx, org: string, not: (string | null)[]) {
    const holders = (await holdersOf(tx, org, 'ats.headcount.manage', '00000000-0000-0000-0000-000000000000', todayIst())).filter((u) => !not.includes(u));
    return holders.length ? holders : this.admins(tx, org, not);
  }

  // ------------------------------------------------------------------------------------------ usage

  /** Committed openings / budget and filled hires per plan line, from the jobs linked to it. */
  private async usage(tx: Tx, org: string, lineIds: string[], exceptJobId: string | null = null) {
    if (!lineIds.length) return new Map<string, { committed: number; committedBudget: number; filled: number }>();
    const rows = await tx.$queryRaw<{ line: string; committed: bigint; committed_budget: Prisma.Decimal | null; filled: bigint }[]>`
      SELECT j.headcount_plan_line_id::text AS line,
             COALESCE(SUM(COALESCE(j.headcount, 1)) FILTER (WHERE j.status IN ('pending_approval', 'open') AND j.deleted_at IS NULL), 0) AS committed,
             SUM(j.budget_amount) FILTER (WHERE j.status IN ('pending_approval', 'open') AND j.deleted_at IS NULL) AS committed_budget,
             (SELECT count(*) FROM pipeline_entries e JOIN pipeline_statuses s ON s.id = e.status_id JOIN pipeline_stages st ON st.id = s.stage_id
               JOIN jobs j2 ON j2.id = e.job_id
              WHERE j2.organization_id = ${org}::uuid AND j2.headcount_plan_line_id = j.headcount_plan_line_id AND st.category = 'hired') AS filled
      FROM jobs j
      WHERE j.organization_id = ${org}::uuid AND j.headcount_plan_line_id = ANY(${lineIds}::uuid[]) AND (${exceptJobId}::uuid IS NULL OR j.id <> ${exceptJobId}::uuid)
      GROUP BY j.headcount_plan_line_id`;
    return new Map(rows.map((r) => [r.line, { committed: Number(r.committed), committedBudget: D(r.committed_budget) ?? 0, filled: Number(r.filled) }]));
  }

  // ------------------------------------------------------------------------------------------ plans (AT-2.01)

  private async planView(tx: Tx, org: string, plans: Prisma.HeadcountPlanGetPayload<object>[]) {
    const lines = await tx.headcountPlanLine.findMany({ where: { organizationId: org, planId: { in: plans.map((p) => p.id) } } });
    const use = await this.usage(tx, org, lines.map((l) => l.id));
    const names = async (model: 'department' | 'designation' | 'grade' | 'location', ids: (string | null)[]) => {
      const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
      const rows = (await (tx[model] as unknown as { findMany: (a: unknown) => Promise<{ id: string; name: string }[]> }).findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true } }));
      return new Map(rows.map((r) => [r.id, r.name]));
    };
    const dept = await names('department', plans.map((p) => p.departmentId));
    const desig = await names('designation', lines.map((l) => l.designationId));
    const grade = await names('grade', lines.map((l) => l.gradeId));
    const loc = await names('location', lines.map((l) => l.locationId));
    return plans.map((p) => ({
      id: p.id,
      departmentId: p.departmentId,
      department: dept.get(p.departmentId) ?? '',
      legalEntityId: p.legalEntityId,
      fyStart: p.fyStart,
      status: p.status,
      note: p.note,
      version: p.version,
      lines: lines.filter((l) => l.planId === p.id).map((l) => {
        const u = use.get(l.id) ?? { committed: 0, committedBudget: 0, filled: 0 };
        return { id: l.id, designationId: l.designationId, designation: desig.get(l.designationId) ?? '', gradeId: l.gradeId, grade: l.gradeId ? (grade.get(l.gradeId) ?? '') : null, locationId: l.locationId, location: l.locationId ? (loc.get(l.locationId) ?? '') : null, count: l.count, budget: D(l.budget), committed: u.committed, committedBudget: u.committedBudget, filled: u.filled };
      }),
    }));
  }

  async plans(ctx: TenantContext, fyStart?: number) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.headcountPlan.findMany({ where: { organizationId: c.organizationId, ...(fyStart ? { fyStart } : {}) }, orderBy: [{ fyStart: 'desc' }, { createdAt: 'asc' }] });
      return this.planView(tx, c.organizationId, rows);
    });
  }

  /** Lines of approved plans a requisition can draw on (pickers), with what is left. */
  async openLines(ctx: TenantContext, departmentId?: string) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.headcountPlan.findMany({ where: { organizationId: c.organizationId, status: 'approved', ...(departmentId ? { departmentId } : {}) } });
      return (await this.planView(tx, c.organizationId, rows)).flatMap((p) => p.lines.map((l) => ({ ...l, planId: p.id, department: p.department, departmentId: p.departmentId, fyStart: p.fyStart, left: l.count - l.committed - l.filled })));
    });
  }

  async savePlan(ctx: TenantContext, userId: string, id: string | null, dto: PlanDto) {
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.department.findFirst({ where: { organizationId: org, id: dto.departmentId }, select: { id: true } }))) throw new BadRequestException('Choose a department of this company.');
      if (dto.legalEntityId && !(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId }, select: { id: true } }))) throw new BadRequestException('Choose a legal entity of this company.');
      const check = async (model: 'designation' | 'grade' | 'location', ids: (string | null | undefined)[], label: string) => {
        const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
        const n = await (tx[model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { organizationId: org, id: { in: list } } });
        if (n !== list.length) throw new BadRequestException(`Choose a ${label} of this company.`);
      };
      await check('designation', dto.lines.map((l) => l.designationId), 'designation');
      await check('grade', dto.lines.map((l) => l.gradeId), 'grade');
      await check('location', dto.lines.map((l) => l.locationId), 'location');
      let plan;
      if (id) {
        plan = await tx.headcountPlan.findFirst({ where: { organizationId: org, id } });
        if (!plan) throw new NotFoundException('No such plan.');
        if (plan.status !== 'draft' && plan.status !== 'rejected') throw new ConflictException('A plan waiting for approval or approved is not edited. Start next year’s plan instead.');
        const n = await tx.headcountPlan.updateMany({ where: { id, version: dto.version ?? -1 }, data: { departmentId: dto.departmentId, legalEntityId: dto.legalEntityId ?? null, fyStart: dto.fyStart, note: dto.note ?? null, status: 'draft', version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this plan. Reload it.');
        await tx.headcountPlanLine.deleteMany({ where: { organizationId: org, planId: id } });
      } else {
        if (await tx.headcountPlan.findFirst({ where: { organizationId: org, departmentId: dto.departmentId, fyStart: dto.fyStart }, select: { id: true } })) throw new ConflictException('This department already has a plan for that year.');
        plan = await tx.headcountPlan.create({ data: { organizationId: org, departmentId: dto.departmentId, legalEntityId: dto.legalEntityId ?? null, fyStart: dto.fyStart, note: dto.note ?? null, createdBy: userId } });
      }
      await tx.headcountPlanLine.createMany({ data: dto.lines.map((l) => ({ organizationId: org, planId: plan.id, designationId: l.designationId, gradeId: l.gradeId ?? null, locationId: l.locationId ?? null, count: l.count, budget: l.budget ?? null })) });
      await audit(tx, c, id ? 'ats.plan.updated' : 'ats.plan.created', 'headcount_plan', plan.id, { lines: dto.lines.length });
      return (await this.planView(tx, org, [await tx.headcountPlan.findFirstOrThrow({ where: { id: plan.id } })]))[0];
    });
  }

  async submitPlan(ctx: TenantContext, userId: string, id: string, version: number) {
    let notices: Notice[] = [];
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.headcountPlan.findFirst({ where: { organizationId: org, id } });
      if (!p) throw new NotFoundException('No such plan.');
      if (p.status !== 'draft' && p.status !== 'rejected') throw new ConflictException('This plan is already with the approvers.');
      if (p.version !== version) throw new ConflictException('Someone else changed this plan. Reload it.');
      const view = (await this.planView(tx, org, [p]))[0];
      if (!view.lines.length) throw new BadRequestException('Add at least one line before sending the plan.');
      const approvers = await this.planApprovers(tx, org, [userId]);
      const total = view.lines.reduce((t, l) => t + l.count, 0);
      const budget = view.lines.reduce((t, l) => t + (l.budget ?? 0), 0);
      const sub = await this.engine.submit(tx, c, {
        type: PLAN_TYPE,
        subjectType: 'headcount_plan',
        subjectId: p.id,
        title: `Headcount plan: ${view.department} FY ${p.fyStart}–${String(p.fyStart + 1).slice(2)}`,
        summary: [{ label: 'Positions', value: String(total) }, ...(budget ? [{ label: 'Budget', value: budget.toLocaleString('en-IN') }] : [])],
        subjectPersonId: null,
        requesterUserId: userId,
        raisedByUserId: userId,
        steps: [{ name: 'Finance and HR', approvers: [{ kind: 'users', userIds: approvers.slice(0, 25) }], mode: 'any', selfApproval: 'never' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.admins(tx, org, [userId]),
      });
      notices = sub.notices;
      await tx.headcountPlan.update({ where: { id }, data: { status: 'submitted', wfRequestId: sub.id, version: { increment: 1 } } });
      await audit(tx, c, 'ats.plan.submitted', 'headcount_plan', id, { positions: total });
      return { status: 'submitted' };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  private async planDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const p = await tx.headcountPlan.findFirst({ where: { organizationId: req.organizationId, wfRequestId: req.id } });
    if (!p || p.status !== 'submitted') return;
    await tx.headcountPlan.update({ where: { id: p.id }, data: { status: outcome, version: { increment: 1 } } });
  }

  // ------------------------------------------------------------------------------------------ requisitions (AT-2.02 … 2.04)

  /** The checks a requisition's plan facts must pass when saved (link targets belong to the company). */
  async checkLinks(tx: Prisma.TransactionClient, org: string, dto: { headcountPlanLineId?: string | null; replacementOfEmployeeId?: string | null }) {
    if (dto.headcountPlanLineId && !(await tx.headcountPlanLine.findFirst({ where: { organizationId: org, id: dto.headcountPlanLineId }, select: { id: true } }))) throw new BadRequestException('Choose a line of this company’s headcount plan.');
    if (dto.replacementOfEmployeeId && !(await tx.employee.findFirst({ where: { organizationId: org, id: dto.replacementOfEmployeeId }, select: { id: true } }))) throw new BadRequestException('Choose an employee of this company.');
  }

  async submit(ctx: TenantContext, userId: string, jobId: string, raisedByManager = false): Promise<{ status: 'approved' | 'pending_approval'; requestId?: string }> {
    let notices: Notice[] = [];
    let opened = false;
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { organizationId: org, id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      if (job.status !== 'draft') throw new ConflictException('Only a draft requisition can be submitted');
      const mode = await this.mode(tx, c);
      let line = null;
      if (job.headcountPlanLineId) {
        const l = await tx.headcountPlanLine.findFirstOrThrow({ where: { organizationId: org, id: job.headcountPlanLineId } });
        const plan = await tx.headcountPlan.findFirstOrThrow({ where: { organizationId: org, id: l.planId } });
        const u = (await this.usage(tx, org, [l.id], job.id)).get(l.id) ?? { committed: 0, committedBudget: 0, filled: 0 };
        line = { planStatus: plan.status, count: l.count, budget: D(l.budget), committedOther: u.committed + u.filled, committedBudgetOther: u.committedBudget };
      }
      const check = checkRequisition(mode, { lineId: job.headcountPlanLineId, outsidePlan: job.outsidePlan, outsidePlanReason: job.outsidePlanReason, reason: (job.requisitionReason as 'new' | 'replacement' | null) ?? null, replacementOf: job.replacementOfEmployeeId, headcount: job.headcount ?? 1, budgetAmount: D(job.budgetAmount) }, line);
      if (check.problem) throw new BadRequestException(check.problem);

      // The company's requisition chain is the route (D3), its steps resolved to people now, as the older engine did.
      const chain = await tx.approvalChain.findFirst({ where: { organizationId: org, gate: 'requisition', enabled: true }, include: { steps: { orderBy: { position: 'asc' } } } });
      const chainSteps: ChainStepInput[] = (chain?.steps ?? []).map((s) => ({ position: s.position, name: s.name, approverType: s.approverType as ChainStepInput['approverType'], approverUserIds: s.approverUserIds ? (JSON.parse(s.approverUserIds) as string[]) : [], managerLevel: s.managerLevel, groupId: s.groupId }));
      const { resolved } = await resolveSteps(tx, { steps: chainSteps, submitterUserId: userId, gate: 'requisition', subjectId: job.id, organizationId: org });
      const steps: StepSpec[] = resolved.map((r) => ({ name: r.name, approvers: [{ kind: 'users', userIds: r.approverUserIds }], mode: 'any', selfApproval: 'never' }));
      if (check.extra) steps.push({ name: 'Outside the plan', approvers: [{ kind: 'users', userIds: (await this.planApprovers(tx, org, [userId])).slice(0, 25) }], mode: 'any', selfApproval: 'never' });
      // A manager's request never opens a job alone: without a route, recruiting (the job managers) approves it.
      if (!steps.length && raisedByManager) steps.push({ name: 'Recruiting', approvers: [{ kind: 'users', userIds: (await this.jobManagers(tx, org, [userId])).slice(0, 25) }], mode: 'any', selfApproval: 'never' });
      if (!steps.length) {
        // Neither a chain nor a reason for the extra step: the requisition opens at once (the older auto-pass).
        await tx.job.update({ where: { id: job.id }, data: { status: 'open' } });
        await audit(tx, c, 'ats.requisition.opened', 'job', job.id, { route: 'none' });
        opened = true;
        return { status: 'approved' as const };
      }
      const sub = await this.engine.submit(tx, c, {
        type: REQUISITION_TYPE,
        subjectType: 'job',
        subjectId: job.id,
        title: `Requisition: ${job.title}`,
        summary: [
          { label: 'Openings', value: String(job.headcount ?? 1) },
          { label: 'Plan', value: job.requisitionReason === 'replacement' ? 'Replacement' : job.outsidePlan ? 'Outside the plan' : line ? 'In the plan' : 'No plan line' },
          ...(check.why.length ? [{ label: 'Needs finance', value: check.why.join('; ') }] : []),
        ],
        subjectPersonId: null,
        requesterUserId: userId,
        raisedByUserId: userId,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.admins(tx, org, [userId]),
      });
      notices = sub.notices;
      await tx.job.update({ where: { id: job.id }, data: { status: 'pending_approval', wfRequestId: sub.id } });
      await audit(tx, c, 'ats.requisition.submitted', 'job', job.id, { extra: check.extra, why: check.why });
      return { status: 'pending_approval' as const, requestId: sub.id };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    if (opened) await this.poster.syncJobToPaidBoards(ctx, jobId).catch((e) => this.logger.warn(`boards ${jobId}: ${(e as Error).message}`));
    return out;
  }

  /** Withdraws a P03 requisition request (the job goes back to draft). False when the job has none (an older request). */
  async withdraw(ctx: TenantContext, userId: string, jobId: string, canConfigure: boolean): Promise<boolean> {
    return this.run(ctx, async (tx, c) => {
      const job = await tx.job.findFirst({ where: { organizationId: c.organizationId, id: jobId } });
      if (!job?.wfRequestId) return false;
      const req = await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, id: job.wfRequestId } });
      if (!req || req.status !== 'pending') return false;
      if (req.requesterUserId !== userId && !canConfigure) throw new ForbiddenException('Only the person who submitted it, or an approvals admin, withdraws a requisition.');
      await this.engine.withdraw(tx, c, req.id, userId, 'Withdrawn to edit');
      await tx.job.update({ where: { id: job.id }, data: { status: 'draft' } });
      return true;
    });
  }

  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const job = await tx.job.findFirst({ where: { organizationId: req.organizationId, wfRequestId: req.id } });
    if (!job || job.status !== 'pending_approval') return;
    await tx.job.update({ where: { id: job.id }, data: { status: outcome === 'approved' ? 'open' : 'draft' } });
    if (outcome === 'approved') await tx.eventOutbox.create({ data: { organizationId: req.organizationId, eventType: 'ats.requisition.approved', payload: { jobId: job.id } } });
  }

  /** The approval timeline of P03 requisitions, in the older summary shape the job screens read. */
  async summaries(ctx: TenantContext, jobIds: string[]): Promise<Map<string, ApprovalSummary>> {
    if (!jobIds.length) return new Map();
    return this.run(ctx, async (tx, c) => {
      const jobs = await tx.job.findMany({ where: { organizationId: c.organizationId, id: { in: jobIds }, wfRequestId: { not: null } }, select: { id: true, wfRequestId: true } });
      const reqs = await tx.wfRequest.findMany({ where: { organizationId: c.organizationId, id: { in: jobs.map((j) => j.wfRequestId!) } } });
      const out = new Map<string, ApprovalSummary>();
      for (const j of jobs) {
        const r = reqs.find((x) => x.id === j.wfRequestId);
        if (!r) continue;
        const steps = (r.steps as { name: string; state: string }[]).map((s) => ({ name: s.name, state: (s.state === 'approved' || s.state === 'skipped' ? 'approved' : s.state === 'rejected' ? 'rejected' : 'pending') as 'pending' | 'approved' | 'rejected' }));
        out.set(j.id, { status: r.status === 'pending' ? 'pending' : r.status, currentStep: r.currentStep, steps });
      }
      return out;
    });
  }
}
