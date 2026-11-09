import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, has, type ScopeUser } from '../access/scope';
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
//   revision     HIR-01: an approved plan is revised (same department and year); the revision waits on the plan and goes
//                through the same P03 type; requisitions keep drawing on the approved lines until it is approved, then the
//                lines change in place (ids kept). A line never drops below its open requisitions and hires.
//   board        HIR-01 / founder decision 11: holders of ats.headcount.manage see every plan; a hiring manager
//                (ats.requisition.raise) sees only their own department's approved plans, read-only, without budgets,
//                unless the company turned that off (ats.headcount_plan.manager_view).

export const REQUISITION_TYPE = 'ats.requisition';
export const PLAN_TYPE = 'ats.headcount_plan';
/** HIR-01: the refusal when the company shows the plan to HR only (ats.headcount_plan.manager_view = off); the web reads it. */
export const HEADCOUNT_PLAN_HR_ONLY = 'HEADCOUNT_PLAN_HR_ONLY';
const D = (n: Prisma.Decimal | null) => (n === null ? null : Number(n.toString()));
type RevLine = { id: string | null; designationId: string; gradeId: string | null; locationId: string | null; count: number; budget: number | null };
type Revision = { note: string | null; lines: RevLine[] };
const revOf = (p: { revision: Prisma.JsonValue }) => p.revision as Revision | null;
/** The plan's open question to approvers (the first approval or a revision), waiting or sent back. */
const latestRequest = (p: { status: string; wfRequestId: string | null; revisionStatus: string | null; revisionWfRequestId: string | null }) =>
  p.status === 'submitted' || p.status === 'rejected' ? p.wfRequestId : p.revisionStatus === 'submitted' || p.revisionStatus === 'rejected' ? p.revisionWfRequestId : null;
const fyLabel = (y: number) => `FY ${y}–${String(y + 1).slice(2)}`;

@Injectable()
export class HiringRequisitionsService implements OnModuleInit {
  private readonly logger = new Logger(HiringRequisitionsService.name);

  constructor(
    private readonly prisma: PrismaService,
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

  private async planView(tx: Tx, org: string, plans: Prisma.HeadcountPlanGetPayload<object>[], viewerId: string | null = null) {
    const lines = await tx.headcountPlanLine.findMany({ where: { organizationId: org, planId: { in: plans.map((p) => p.id) } } });
    const revLines = plans.flatMap((p) => revOf(p)?.lines ?? []);
    const use = await this.usage(tx, org, lines.map((l) => l.id));
    const names = async (model: 'department' | 'designation' | 'grade' | 'location', ids: (string | null)[]) => {
      const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
      const rows = (await (tx[model] as unknown as { findMany: (a: unknown) => Promise<{ id: string; name: string }[]> }).findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true } }));
      return new Map(rows.map((r) => [r.id, r.name]));
    };
    const all = [...lines, ...revLines];
    const dept = await names('department', plans.map((p) => p.departmentId));
    const desig = await names('designation', all.map((l) => l.designationId));
    const grade = await names('grade', all.map((l) => l.gradeId));
    const loc = await names('location', all.map((l) => l.locationId));
    // HIR-01: the route of the plan's latest request, why it was sent back, and the viewer's own open task on it.
    const reqIds = plans.map(latestRequest).filter((x): x is string => Boolean(x));
    const reqs = reqIds.length ? await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: reqIds } } }) : [];
    const routes = new Map(await Promise.all(reqs.map(async (r) => [r.id, await this.engine.viewIn(tx, org, r)] as const)));
    const mine = viewerId && reqIds.length ? await tx.wfTask.findMany({ where: { organizationId: org, requestId: { in: reqIds }, assigneeUserId: viewerId, status: 'open' }, select: { id: true, requestId: true, step: true } }) : [];
    const named = (l: { designationId: string; gradeId: string | null; locationId: string | null }) => ({ designation: desig.get(l.designationId) ?? '', grade: l.gradeId ? (grade.get(l.gradeId) ?? '') : null, location: l.locationId ? (loc.get(l.locationId) ?? '') : null });
    return plans.map((p) => {
      const rev = revOf(p);
      const req = reqs.find((r) => r.id === latestRequest(p));
      const route = req ? routes.get(req.id) : undefined;
      return {
        id: p.id,
        departmentId: p.departmentId,
        department: dept.get(p.departmentId) ?? '',
        legalEntityId: p.legalEntityId,
        fyStart: p.fyStart,
        status: p.status,
        note: p.note,
        version: p.version,
        revisionNo: p.revisionNo,
        revision: rev && p.revisionStatus ? { status: p.revisionStatus, note: rev.note, lines: rev.lines.map((l) => ({ ...l, ...named(l) })) } : null,
        approval: route && req
          ? {
              requestId: req.id,
              kind: p.status === 'approved' ? ('revision' as const) : ('plan' as const),
              status: req.status,
              reason: req.status === 'rejected' ? ([...route.log].reverse().find((a) => a.reason)?.reason ?? null) : null,
              submittedAt: route.submittedAt,
              submittedBy: route.log[0]?.by ?? null,
              steps: route.steps.map((st, i) => ({ name: st.name, state: st.state, approvers: [...new Set([...st.approvers.map((a) => a.name), ...st.waitingFor])].filter(Boolean), at: [...route.log].reverse().find((a) => a.step === i + 1)?.at ?? null })),
              myTaskId: mine.find((t) => t.requestId === req.id && t.step === req.currentStep)?.id ?? null,
            }
          : null,
        lines: lines.filter((l) => l.planId === p.id).map((l) => {
          const u = use.get(l.id) ?? { committed: 0, committedBudget: 0, filled: 0 };
          return { id: l.id, designationId: l.designationId, ...named(l), gradeId: l.gradeId, locationId: l.locationId, count: l.count, budget: D(l.budget), committed: u.committed, committedBudget: u.committedBudget, filled: u.filled };
        }),
      };
    });
  }

  /** Departments a hiring manager sees (decision 11): their own today, and the subtrees they head. */
  private async myDepartments(tx: Tx, org: string, userId: string | null | undefined): Promise<string[]> {
    const e = userId ? await tx.employee.findFirst({ where: { organizationId: org, userId }, select: { id: true } }) : null;
    if (!e) return [];
    const today = new Date(todayIst());
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: e.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { departmentId: true } });
    const heads = await tx.department.findMany({ where: { organizationId: org, headEmployeeId: e.id }, select: { id: true } });
    const sub = heads.length ? await tx.department.findMany({ where: { organizationId: org, OR: heads.map((h) => ({ path: { contains: `/${h.id}/` } })) }, select: { id: true } }) : [];
    return [...new Set([a?.departmentId, ...sub.map((d) => d.id)].filter((x): x is string => Boolean(x)))];
  }

  async plans(ctx: TenantContext, user: ScopeUser, fyStart?: number) {
    const hr = has(await buildViewer(this.prisma, this.tenantPrisma, user, ['ats.headcount.manage']), 'ats.headcount.manage');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      let where: Prisma.HeadcountPlanWhereInput = { organizationId: org, ...(fyStart ? { fyStart } : {}) };
      if (!hr) {
        if ((await settingFor(tx, c, 'ats.headcount_plan.manager_view', { legalEntityId: '' })) === 'off') throw new ForbiddenException({ statusCode: 403, code: HEADCOUNT_PLAN_HR_ONLY, message: 'Your company shows the headcount plan to HR only. Ask HR for your department’s numbers.' });
        where = { ...where, status: 'approved', departmentId: { in: await this.myDepartments(tx, org, user.userId) } };
      }
      const view = await this.planView(tx, org, await tx.headcountPlan.findMany({ where, orderBy: [{ fyStart: 'desc' }, { createdAt: 'asc' }] }), user.userId ?? null);
      // A hiring manager reads the approved positions only: no budgets, notes, revisions or routes.
      return hr ? view : view.map((p) => ({ ...p, note: null, revision: null, approval: null, lines: p.lines.map((l) => ({ ...l, budget: null, committedBudget: 0 })) }));
    });
  }

  /**
   * HIR-02: the requisitions list. Recruiting (pipeline:manage) and HR (ats.headcount.manage) see every requisition; a
   * hiring manager (ats.requisition.raise only) sees the ones they raised or are the hiring manager of, read-only,
   * without plan budgets (founder decision 11). A requisition is a job that went through the requisition flow.
   */
  async requisitions(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['pipeline:manage', 'ats.headcount.manage']);
    const all = has(v, 'pipeline:manage') || has(v, 'ats.headcount.manage');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = user.userId ?? '00000000-0000-0000-0000-000000000000';
      const jobs = await tx.job.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ requisitionReason: { not: null } }, { wfRequestId: { not: null } }, { headcountPlanLineId: { not: null } }, { outsidePlan: true }, { status: { in: ['draft', 'pending_approval'] } }],
          ...(all ? {} : { AND: [{ OR: [{ hiringManagerId: me }, { createdById: me }] }] }),
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const lineIds = [...new Set(jobs.map((j) => j.headcountPlanLineId).filter((x): x is string => Boolean(x)))];
      const lines = await tx.headcountPlanLine.findMany({ where: { organizationId: org, id: { in: lineIds } } });
      const use = await this.usage(tx, org, lineIds);
      const users = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: [...new Set(jobs.flatMap((j) => [j.hiringManagerId, j.recruiterUserId, j.createdById]).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const grades = new Map((await tx.grade.findMany({ where: { organizationId: org, id: { in: [...new Set([...jobs.map((j) => j.gradeId), ...lines.map((l) => l.gradeId)].filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
      const desig = new Map((await tx.designation.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.designationId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      const locs = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.locationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      const leavers = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: jobs.map((j) => j.replacementOfEmployeeId).filter((x): x is string => Boolean(x)) } }, select: { id: true, givenName: true, familyName: true } })).map((e) => [e.id, [e.givenName, e.familyName].filter(Boolean).join(' ')]));
      const reqs = await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: jobs.map((j) => j.wfRequestId).filter((x): x is string => Boolean(x)) } } });
      const routes = new Map(await Promise.all(reqs.map(async (r) => [r.id, await this.engine.viewIn(tx, org, r)] as const)));
      const mine = me && reqs.length ? await tx.wfTask.findMany({ where: { organizationId: org, requestId: { in: reqs.map((r) => r.id) }, assigneeUserId: me, status: 'open' }, select: { id: true, requestId: true, step: true } }) : [];
      const closed = jobs.filter((j) => j.status === 'closed').map((j) => j.id);
      const hired = closed.length
        ? new Map((await tx.$queryRaw<{ job: string; n: bigint }[]>`
            SELECT e.job_id::text AS job, count(*) AS n FROM pipeline_entries e JOIN pipeline_statuses s ON s.id = e.status_id JOIN pipeline_stages st ON st.id = s.stage_id
            WHERE e.organization_id = ${org}::uuid AND e.job_id = ANY(${closed}::uuid[]) AND st.category = 'hired' GROUP BY e.job_id`).map((r) => [r.job, Number(r.n)]))
        : new Map<string, number>();
      return {
        viewer: all ? ('all' as const) : ('own' as const),
        rows: jobs.map((j) => {
          const req = reqs.find((r) => r.id === j.wfRequestId);
          const route = req ? routes.get(req.id) : undefined;
          const status =
            j.status === 'pending_approval' ? 'Pending approval' : j.status === 'draft' ? (req?.status === 'rejected' ? 'Sent back' : 'Draft') : j.status === 'closed' ? ((hired.get(j.id) ?? 0) >= (j.headcount ?? 1) ? 'Filled' : 'Closed') : 'Approved';
          const l = lines.find((x) => x.id === j.headcountPlanLineId);
          const u = l ? (use.get(l.id) ?? { committed: 0, committedBudget: 0, filled: 0 }) : null;
          return {
            id: j.id,
            jobNumber: j.jobNumber,
            title: j.title,
            department: j.department ?? '',
            location: j.location ?? '',
            grade: j.gradeId ? (grades.get(j.gradeId) ?? '') : '',
            hiringManager: users.get(j.hiringManagerId ?? j.createdById) ?? '',
            recruiter: j.recruiterUserId ? (users.get(j.recruiterUserId) ?? '') : '',
            replacementFor: j.requisitionReason === 'replacement' ? (leavers.get(j.replacementOfEmployeeId ?? '') ?? 'a leaver') : null,
            outsidePlan: j.outsidePlan,
            outsidePlanReason: j.outsidePlanReason,
            budgetAmount: D(j.budgetAmount),
            positions: j.headcount ?? 1,
            status,
            raised: j.createdAt,
            // The plan line it draws on; the budget only for those who see plan budgets.
            line: l && u ? { id: l.id, designation: desig.get(l.designationId) ?? '', grade: l.gradeId ? (grades.get(l.gradeId) ?? '') : '', location: l.locationId ? (locs.get(l.locationId) ?? '') : '', approved: l.count, open: u.committed, filled: u.filled, budget: all ? D(l.budget) : null, committedBudget: all ? u.committedBudget : 0 } : null,
            approval:
              route && req && req.status !== 'withdrawn'
                ? {
                    status: req.status,
                    reason: req.status === 'rejected' ? ([...route.log].reverse().find((a) => a.reason)?.reason ?? null) : null,
                    submittedAt: route.submittedAt,
                    submittedBy: route.log[0]?.by ?? null,
                    steps: route.steps.map((st, i) => ({ name: st.name, state: st.state, approvers: [...new Set([...st.approvers.map((a) => a.name), ...st.waitingFor])].filter(Boolean), at: [...route.log].reverse().find((a) => a.step === i + 1)?.at ?? null })),
                    waitingOn: req.status === 'pending' ? (route.steps[req.currentStep]?.name ?? null) : null,
                    myTaskId: mine.find((t) => t.requestId === req.id && t.step === req.currentStep)?.id ?? null,
                  }
                : null,
          };
        }),
      };
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
      if (id && !(await tx.headcountPlan.findFirst({ where: { organizationId: org, id }, select: { id: true } }))) throw new NotFoundException('No such plan.');
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
        if (plan.status === 'approved') return this.saveRevision(tx, c, plan, dto);
        if (plan.status !== 'draft' && plan.status !== 'rejected') throw new ConflictException('This plan is with the approvers. Wait for their answer before changing it.');
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

  /** HIR-01: saves the revision of an approved plan; the approved lines are unchanged until it is approved. */
  private async saveRevision(tx: Tx, c: CompanyContext, plan: Prisma.HeadcountPlanGetPayload<object>, dto: PlanDto) {
    const org = c.organizationId;
    if (plan.revisionStatus === 'submitted') throw new ConflictException('A revision of this plan is already with the approvers.');
    if (dto.departmentId !== plan.departmentId || dto.fyStart !== plan.fyStart) throw new BadRequestException('A revision keeps the plan’s department and year.');
    const current = await tx.headcountPlanLine.findMany({ where: { organizationId: org, planId: plan.id } });
    const ids = dto.lines.map((l) => l.id).filter((x): x is string => Boolean(x));
    if (new Set(ids).size !== ids.length || ids.some((x) => !current.some((l) => l.id === x))) throw new BadRequestException('Each line must be a line of this plan or a new line.');
    const use = await this.usage(tx, org, current.map((l) => l.id));
    for (const l of current) {
      const u = use.get(l.id);
      const taken = (u?.committed ?? 0) + (u?.filled ?? 0);
      const row = dto.lines.find((r) => r.id === l.id);
      if (!taken) continue;
      if (!row) throw new ConflictException(`A line with open requisitions or hires stays in the plan. Keep it with at least ${taken} positions.`);
      if (row.count < taken) throw new ConflictException(`A line can't have fewer positions than its open requisitions and hires (${taken}).`);
      if (row.designationId !== l.designationId) throw new ConflictException('A line with requisitions keeps its designation. Add a new line instead.');
    }
    const revision: Revision = { note: dto.note ?? null, lines: dto.lines.map((l) => ({ id: l.id ?? null, designationId: l.designationId, gradeId: l.gradeId ?? null, locationId: l.locationId ?? null, count: l.count, budget: l.budget ?? null })) };
    const n = await tx.headcountPlan.updateMany({ where: { id: plan.id, version: dto.version ?? -1 }, data: { revision, revisionStatus: 'draft', version: { increment: 1 } } });
    if (!n.count) throw new ConflictException('Someone else changed this plan. Reload it.');
    await audit(tx, c, 'ats.plan.revision_saved', 'headcount_plan', plan.id, { lines: dto.lines.length });
    return (await this.planView(tx, org, [await tx.headcountPlan.findFirstOrThrow({ where: { id: plan.id } })]))[0];
  }

  async submitPlan(ctx: TenantContext, userId: string, id: string, version: number) {
    let notices: Notice[] = [];
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.headcountPlan.findFirst({ where: { organizationId: org, id } });
      if (!p) throw new NotFoundException('No such plan.');
      const revising = p.status === 'approved';
      if (revising ? p.revisionStatus === 'submitted' : p.status === 'submitted') throw new ConflictException('This plan is already with the approvers.');
      if (revising && p.revisionStatus !== 'draft' && p.revisionStatus !== 'rejected') throw new ConflictException('Revise the plan before sending it.');
      if (p.version !== version) throw new ConflictException('Someone else changed this plan. Reload it.');
      const view = (await this.planView(tx, org, [p]))[0];
      const lines = revising ? view.revision!.lines : view.lines;
      if (!lines.length) throw new BadRequestException('Add at least one line before sending the plan.');
      const approvers = await this.planApprovers(tx, org, [userId]);
      const total = lines.reduce((t, l) => t + l.count, 0);
      const budget = lines.reduce((t, l) => t + (l.budget ?? 0), 0);
      const was = { total: view.lines.reduce((t, l) => t + l.count, 0), budget: view.lines.reduce((t, l) => t + (l.budget ?? 0), 0) };
      const sub = await this.engine.submit(tx, c, {
        type: PLAN_TYPE,
        subjectType: 'headcount_plan',
        subjectId: p.id,
        title: `${revising ? `Headcount plan revision v${p.revisionNo + 1}` : 'Headcount plan'}: ${view.department} ${fyLabel(p.fyStart)}`,
        summary: revising
          ? [{ label: 'Positions', value: `${was.total} → ${total}` }, { label: 'Budget', value: `${was.budget.toLocaleString('en-IN')} → ${budget.toLocaleString('en-IN')}` }]
          : [{ label: 'Positions', value: String(total) }, ...(budget ? [{ label: 'Budget', value: budget.toLocaleString('en-IN') }] : [])],
        subjectPersonId: null,
        requesterUserId: userId,
        raisedByUserId: userId,
        steps: [{ name: 'Finance and HR', approvers: [{ kind: 'users', userIds: approvers.slice(0, 25) }], mode: 'any', selfApproval: 'never' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.admins(tx, org, [userId]),
        fallbackWording: { who: 'the company admins', check: 'Check who approves requisitions and headcount plans' },
      });
      notices = sub.notices;
      await tx.headcountPlan.update({ where: { id }, data: revising ? { revisionStatus: 'submitted', revisionWfRequestId: sub.id, version: { increment: 1 } } : { status: 'submitted', wfRequestId: sub.id, version: { increment: 1 } } });
      await audit(tx, c, revising ? 'ats.plan.revision_submitted' : 'ats.plan.submitted', 'headcount_plan', id, { positions: total });
      return { status: 'submitted' };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  private async planDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const p = await tx.headcountPlan.findFirst({ where: { organizationId: org, OR: [{ wfRequestId: req.id }, { revisionWfRequestId: req.id }] } });
    if (!p) return;
    if (p.wfRequestId === req.id && p.status === 'submitted') {
      await tx.headcountPlan.update({ where: { id: p.id }, data: { status: outcome, version: { increment: 1 } } });
      return;
    }
    const rev = revOf(p);
    if (p.revisionWfRequestId !== req.id || p.revisionStatus !== 'submitted' || !rev) return;
    if (outcome === 'rejected') {
      await tx.headcountPlan.update({ where: { id: p.id }, data: { revisionStatus: 'rejected', version: { increment: 1 } } });
      return;
    }
    // Approved: change the lines in place. Requisitions raised while it waited still count: a line keeps at least its
    // open requisitions and hires, and a line in use is never removed.
    const current = await tx.headcountPlanLine.findMany({ where: { organizationId: org, planId: p.id } });
    const use = await this.usage(tx, org, current.map((l) => l.id));
    for (const l of current) {
      const u = use.get(l.id);
      const taken = (u?.committed ?? 0) + (u?.filled ?? 0);
      const row = rev.lines.find((r) => r.id === l.id);
      if (row) await tx.headcountPlanLine.update({ where: { id: l.id }, data: { designationId: taken ? l.designationId : row.designationId, gradeId: row.gradeId, locationId: row.locationId, count: Math.max(row.count, taken), budget: row.budget } });
      else if (!taken) await tx.headcountPlanLine.delete({ where: { id: l.id } });
    }
    const added = rev.lines.filter((r) => !r.id);
    if (added.length) await tx.headcountPlanLine.createMany({ data: added.map((r) => ({ organizationId: org, planId: p.id, designationId: r.designationId, gradeId: r.gradeId, locationId: r.locationId, count: r.count, budget: r.budget })) });
    await tx.headcountPlan.update({ where: { id: p.id }, data: { note: rev.note, revision: Prisma.DbNull, revisionStatus: null, revisionNo: { increment: 1 }, version: { increment: 1 } } });
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
        fallbackWording: { who: 'the company admins', check: 'Check who approves requisitions and headcount plans' },
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
