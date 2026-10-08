import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { FieldDef, Group, RecordValues, RuleError, evaluate, parseGroup } from '../rules-engine/conditions';

// P03 approvals engine (shared platform engine, built first for the Service Desk catalogue, SD-2.05; leave, expenses
// and the rest plug in later by registering a request type). A request freezes its route at submit (YX-WF-02): every
// step with the approvers resolved then, the quorum, reminders and the timeout action. Each approver gets a task; the
// action log is append-only; effects run in the same transaction as the final decision (YX-WF-10).
//
// Rules kept here, for every module:
//   - nobody approves their own request, and whoever raised it for someone else never approves it (YX-WF-04 / 18),
//     unless the step says self-approval is allowed; such an approval is logged as "self_approved" and audited;
//   - only the task's assignee decides (a delegate acts on behalf of the approver, never chained, YX-WF-07);
//   - approvers see only the summary the module chose for them (never the record itself, never sensitive answers);
//   - auto-approve / auto-reject after a timeout only for request types that allow it and are not high risk (P03 Q2).

export type ApproverSpec = { kind: 'manager'; level?: number } | { kind: 'cost_centre_owner'; field: string } | { kind: 'users'; userIds: string[] } | { kind: 'user_group'; groupId: string };
export interface StepSpec {
  name: string;
  approvers: ApproverSpec[];
  /** P03 Q1 / US-G-044: any one (default), all, at least N, or a percentage. */
  mode: 'any' | 'all' | 'count' | 'percent';
  count?: number;
  percent?: number;
  /** One reject stops the request (default), or only once the quorum can no longer be reached. */
  rejectOn?: 'one' | 'quorum_lost';
  remindAfterHours?: number;
  timeoutHours?: number;
  onTimeout?: 'escalate' | 'approve' | 'reject';
  /** P19 condition over the request's fields: the step is skipped when it holds. */
  skipIf?: Group;
  selfApproval?: 'never' | 'allowed';
}
export interface FrozenStep extends StepSpec {
  approverIds: string[];
  need: number;
  state: 'waiting' | 'open' | 'approved' | 'rejected' | 'skipped';
}

export type Outcome = 'approved' | 'rejected';
export interface RequestType {
  key: string;
  label: string;
  risk: 'low' | 'normal' | 'high';
  /** The company may turn on auto-approve / auto-reject after a timeout (never for high risk). */
  autoActions: boolean;
  /** Effects, run in the decision's own transaction (exactly once). */
  onDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome): Promise<void>;
  /** Where the requester follows the request. */
  requesterLink(req: Prisma.WfRequestGetPayload<object>): string;
}

export interface SubmitInput {
  type: string;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: { label: string; value: string }[];
  /** The person the request is for (resolvers start here: their manager, P03 D5). */
  subjectPersonId: string | null;
  requesterUserId: string | null;
  raisedByUserId: string | null;
  steps: StepSpec[];
  /** Values skip conditions and the cost-centre resolver read. */
  payload: RecordValues;
  payloadFields: FieldDef[];
  /** Who approves a step nobody else can (e.g. the desk's leads). The company's HR Admins are told when it happens. */
  fallbackUserIds: string[];
  /** 'high' for this request only (e.g. a costly order): it then never auto-approves or auto-rejects on timeout. */
  risk?: 'high';
}

export interface Notice {
  to: string[];
  requestId: string;
  type: 'workflow.approval.needed' | 'workflow.approval.reminder' | 'workflow.approval.decided' | 'workflow.approval.no_approver';
  title: string;
  link: string;
  text: string;
}

const MAX = { steps: 6, approvers: 5, users: 25 };
const hours = (h: number) => h * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Checks steps from outside (an admin's catalogue item). Throws RuleError with a plain message. */
export function parseSteps(input: unknown, payloadFields: FieldDef[]): StepSpec[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX.steps) throw new RuleError(`Use up to ${MAX.steps} approval steps.`);
  return input.map((x, i) => {
    if (!isObj(x)) throw new RuleError(`Approval step ${i + 1} is not in the expected shape.`);
    for (const k of Object.keys(x)) if (!['name', 'approvers', 'mode', 'count', 'percent', 'rejectOn', 'remindAfterHours', 'timeoutHours', 'onTimeout', 'skipIf', 'selfApproval'].includes(k)) throw new RuleError(`Approval step ${i + 1} has an unknown part "${k.slice(0, 20)}".`);
    const name = typeof x.name === 'string' ? x.name.trim() : '';
    if (!name || name.length > 80) throw new RuleError(`Name approval step ${i + 1} (up to 80 characters).`);
    if (!Array.isArray(x.approvers) || !x.approvers.length || x.approvers.length > MAX.approvers) throw new RuleError(`Choose who approves "${name}".`);
    const approvers = x.approvers.map((a): ApproverSpec => {
      if (!isObj(a)) throw new RuleError(`"${name}": an approver is not in the expected shape.`);
      if (a.kind === 'manager') {
        const level = a.level === undefined ? 1 : Number(a.level);
        if (!Number.isInteger(level) || level < 1 || level > 3) throw new RuleError(`"${name}": manager level is 1 to 3.`);
        return { kind: 'manager', level };
      }
      if (a.kind === 'cost_centre_owner') {
        if (typeof a.field !== 'string' || !payloadFields.some((f) => f.key === a.field)) throw new RuleError(`"${name}": choose the form field that holds the cost centre.`);
        return { kind: 'cost_centre_owner', field: a.field };
      }
      if (a.kind === 'users') {
        if (!Array.isArray(a.userIds) || !a.userIds.length || a.userIds.length > MAX.users || a.userIds.some((u) => typeof u !== 'string' || !UUID.test(u))) throw new RuleError(`"${name}": choose 1 to ${MAX.users} people.`);
        return { kind: 'users', userIds: [...new Set(a.userIds as string[])] };
      }
      if (a.kind === 'user_group') {
        if (typeof a.groupId !== 'string' || !UUID.test(a.groupId)) throw new RuleError(`"${name}": choose a group.`);
        return { kind: 'user_group', groupId: a.groupId };
      }
      throw new RuleError(`"${name}": choose who approves.`);
    });
    const mode = (x.mode ?? 'any') as StepSpec['mode'];
    if (!['any', 'all', 'count', 'percent'].includes(mode)) throw new RuleError(`"${name}": choose how many must approve.`);
    const step: StepSpec = { name, approvers, mode };
    if (mode === 'count') {
      if (!Number.isInteger(x.count) || (x.count as number) < 1 || (x.count as number) > MAX.users) throw new RuleError(`"${name}": how many must approve (1 to ${MAX.users})?`);
      step.count = x.count as number;
    }
    if (mode === 'percent') {
      if (!Number.isInteger(x.percent) || (x.percent as number) < 1 || (x.percent as number) > 100) throw new RuleError(`"${name}": what share must approve (1 to 100 %)?`);
      step.percent = x.percent as number;
    }
    if (x.rejectOn !== undefined) {
      if (x.rejectOn !== 'one' && x.rejectOn !== 'quorum_lost') throw new RuleError(`"${name}": choose when a reject stops the request.`);
      step.rejectOn = x.rejectOn;
    }
    for (const k of ['remindAfterHours', 'timeoutHours'] as const) {
      if (x[k] === undefined || x[k] === null) continue;
      if (!Number.isInteger(x[k]) || (x[k] as number) < 1 || (x[k] as number) > 720) throw new RuleError(`"${name}": hours are 1 to 720.`);
      step[k] = x[k] as number;
    }
    if (x.onTimeout !== undefined) {
      if (!['escalate', 'approve', 'reject'].includes(x.onTimeout as string)) throw new RuleError(`"${name}": choose what happens when time runs out.`);
      if (!step.timeoutHours) throw new RuleError(`"${name}": set after how many hours time runs out.`);
      step.onTimeout = x.onTimeout as StepSpec['onTimeout'];
    }
    if (x.skipIf !== undefined && x.skipIf !== null) step.skipIf = parseGroup(x.skipIf, payloadFields);
    if (x.selfApproval !== undefined) {
      if (x.selfApproval !== 'never' && x.selfApproval !== 'allowed') throw new RuleError(`"${name}": choose whether people may approve their own request.`);
      step.selfApproval = x.selfApproval;
    }
    return step;
  });
}

/** How many approvals close a step (US-G-044). */
export function needOf(s: Pick<StepSpec, 'mode' | 'count' | 'percent'>, n: number): number {
  if (n === 0) return 0;
  if (s.mode === 'all') return n;
  if (s.mode === 'count') return Math.min(n, s.count ?? 1);
  if (s.mode === 'percent') return Math.max(1, Math.ceil((n * (s.percent ?? 100)) / 100));
  return 1;
}

/** The step's verdict from its tasks: approved, rejected, or still open. */
export function verdict(s: Pick<FrozenStep, 'need' | 'rejectOn'>, n: number, approved: number, rejected: number): 'approved' | 'rejected' | 'open' {
  if (approved >= s.need) return 'approved';
  if ((s.rejectOn ?? 'one') === 'one' ? rejected > 0 : n - rejected < s.need) return 'rejected';
  return 'open';
}

@Injectable()
export class ApprovalsEngine {
  private readonly logger = new Logger(ApprovalsEngine.name);
  private readonly types = new Map<string, RequestType>();

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A module registers its request types once, at start-up (P03 §4.1). */
  register(t: RequestType) {
    this.types.set(t.key, t);
  }

  private type(key: string): RequestType {
    const t = this.types.get(key);
    if (!t) throw new Error(`Unknown request type ${key}`);
    return t;
  }

  // ------------------------------------------------------------------------------------------ resolving approvers

  private async managerOf(tx: Tx, org: string, personId: string | null, userId: string | null, level: number): Promise<string | null> {
    const today = new Date(`${todayIst()}T00:00:00Z`);
    let emp = await tx.employee.findFirst({ where: { organizationId: org, ...(personId ? { personId } : { userId: userId ?? '00000000-0000-0000-0000-000000000000' }) }, select: { id: true } });
    for (let i = 0; i < level && emp; i++) {
      const a = await tx.employeeAssignment.findFirst({
        where: { organizationId: org, employeeId: emp.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
        orderBy: { validFrom: 'desc' },
        select: { managerEmployeeId: true },
      });
      emp = a?.managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { id: true } }) : null;
    }
    if (!emp) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, id: emp.id }, select: { userId: true } }))?.userId ?? null;
  }

  private async resolve(tx: Tx, org: string, a: ApproverSpec, input: SubmitInput): Promise<string[]> {
    if (a.kind === 'manager') {
      const m = await this.managerOf(tx, org, input.subjectPersonId, input.requesterUserId, a.level ?? 1);
      return m ? [m] : [];
    }
    if (a.kind === 'cost_centre_owner') {
      const cc = input.payload[a.field];
      if (typeof cc !== 'string' || !UUID.test(cc)) return [];
      const row = await tx.costCentre.findFirst({ where: { organizationId: org, id: cc, archivedAt: null }, select: { ownerUserId: true } });
      return row?.ownerUserId ? [row.ownerUserId] : [];
    }
    if (a.kind === 'users') return a.userIds;
    return (await tx.userGroupMember.findMany({ where: { organizationId: org, groupId: a.groupId }, select: { userId: true }, take: MAX.users })).map((m) => m.userId);
  }

  private async active(tx: Tx, org: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const ok = new Set((await tx.user.findMany({ where: { organizationId: org, id: { in: ids }, status: 'active' }, select: { id: true } })).map((u) => u.id));
    return [...new Set(ids)].filter((id) => ok.has(id));
  }

  /** Active people holding the HR Admin key set (org.settings.manage) through their profile or a role grant in force today. */
  private async hrAdmins(tx: Tx, org: string): Promise<string[]> {
    const profiles = (await tx.permissionProfile.findMany({ where: { organizationId: org, permissionsJson: { contains: '"org.settings.manage"' } }, select: { id: true } })).map((p) => p.id);
    if (!profiles.length) return [];
    const today = new Date(`${todayIst()}T00:00:00Z`);
    const [byProfile, byGrant] = await Promise.all([
      tx.user.findMany({ where: { organizationId: org, permissionProfileId: { in: profiles } }, select: { id: true }, take: MAX.users }),
      tx.roleGrant.findMany({ where: { organizationId: org, permissionProfileId: { in: profiles }, status: 'active', validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, select: { userId: true }, take: MAX.users }),
    ]);
    return this.active(tx, org, [...byProfile.map((u) => u.id), ...byGrant.map((g) => g.userId)]);
  }

  /** The delegate who holds tasks for this approver today (never chained), or null. */
  private async delegateOf(tx: Tx, org: string, userId: string, type: string): Promise<string | null> {
    const today = new Date(`${todayIst()}T00:00:00Z`);
    const d = await tx.wfDelegation.findFirst({
      where: { organizationId: org, userId, revokedAt: null, startsOn: { lte: today }, endsOn: { gte: today }, OR: [{ requestTypes: { isEmpty: true } }, { requestTypes: { has: type } }] },
      orderBy: { createdAt: 'desc' },
    });
    if (!d) return null;
    return (await this.active(tx, org, [d.delegateUserId]))[0] ?? null;
  }

  // ------------------------------------------------------------------------------------------ submit

  /**
   * Freezes the route and opens the first step, inside the caller's transaction. Returns the request id (and whether it
   * was decided at once: no steps, or every step skipped), plus notices to send after commit.
   */
  async submit(tx: Tx, ctx: CompanyContext, input: SubmitInput): Promise<{ id: string; status: string; notices: Notice[] }> {
    const org = ctx.organizationId;
    const type = this.type(input.type);
    const excluded = new Set([input.requesterUserId, input.raisedByUserId].filter((x): x is string => Boolean(x)));
    const fallback = await this.active(tx, org, input.fallbackUserIds);
    const steps: FrozenStep[] = [];
    const noApprover: string[] = [];
    for (const s of input.steps) {
      const skip = s.skipIf ? evaluate(s.skipIf, input.payload, input.payloadFields).pass : false;
      let ids = await this.active(tx, org, (await Promise.all(s.approvers.map((a) => this.resolve(tx, org, a, input)))).flat());
      const self = s.selfApproval === 'allowed';
      // YX-WF-04 / 18: the requester and the person who raised it for them are taken out (unless self-approval is allowed;
      // even then only the requester, never a proxy raiser).
      ids = ids.filter((id) => !(id === input.raisedByUserId && id !== input.requesterUserId) && (self || !excluded.has(id)));
      if (!ids.length && !skip) {
        ids = fallback.filter((id) => !excluded.has(id));
        if (ids.length) noApprover.push(s.name);
      }
      if (!ids.length && !skip) throw new BadRequestException({ statusCode: 400, code: 'NO_APPROVER', message: `No one can approve the step "${s.name}" for this request. Ask the desk admin to check the approvers.` });
      steps.push({ ...s, approverIds: ids, need: needOf(s, ids.length), state: skip ? 'skipped' : 'waiting' });
    }
    const req = await tx.wfRequest.create({
      data: {
        organizationId: org,
        requestType: type.key,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        title: input.title.slice(0, 200),
        summary: input.summary.slice(0, 40) as unknown as Prisma.InputJsonValue,
        requesterUserId: input.requesterUserId,
        raisedByUserId: input.raisedByUserId,
        steps: steps as unknown as Prisma.InputJsonValue,
        risk: input.risk ?? type.risk,
      },
    });
    await this.log(tx, org, req.id, null, null, input.raisedByUserId ?? input.requesterUserId, null, 'submitted', null, 'web');
    for (const [i, s] of steps.entries()) if (s.state === 'skipped') await this.log(tx, org, req.id, null, i, null, null, 'skipped', 'The step condition held', 'system');
    await AuditService.recordIn(tx, ctx, { actorUserId: input.raisedByUserId ?? input.requesterUserId, action: 'workflow.request.submitted', entityType: 'wf_request', entityId: req.id, metadata: { type: type.key, subjectType: input.subjectType, subjectId: input.subjectId, steps: steps.map((s) => ({ name: s.name, approvers: s.approverIds, state: s.state })) } });
    const notices: Notice[] = [];
    // Founder decision 9 Oct 2026: the leads approve it, and HR Admins hear about it so they can fix the data behind it.
    if (noApprover.length) notices.push({ to: await this.hrAdmins(tx, org), requestId: req.id, type: 'workflow.approval.no_approver', title: req.title, link: '/yx/people/directory', text: `No approver found for "${noApprover.join('", "')}", so the desk's team leads got it. Check the manager or cost-centre owner` });
    const after = await this.advance(tx, ctx, req.id, notices);
    return { id: req.id, status: after.status, notices };
  }

  /** Opens the next waiting step, or finishes the request when none is left. */
  private async advance(tx: Tx, ctx: CompanyContext, requestId: string, notices: Notice[], now = new Date()) {
    const org = ctx.organizationId;
    const req = await tx.wfRequest.findFirstOrThrow({ where: { organizationId: org, id: requestId } });
    const steps = req.steps as unknown as FrozenStep[];
    const next = steps.findIndex((s) => s.state === 'waiting');
    if (next < 0) return this.finish(tx, ctx, req, 'approved', notices);
    steps[next].state = 'open';
    const s = steps[next];
    for (const approver of s.approverIds) {
      const delegate = await this.delegateOf(tx, org, approver, req.requestType);
      const holder = delegate && delegate !== req.requesterUserId && delegate !== req.raisedByUserId && !s.approverIds.includes(delegate) ? delegate : approver;
      await tx.wfTask.create({
        data: {
          organizationId: org,
          requestId: req.id,
          step: next,
          assigneeUserId: holder,
          onBehalfOfUserId: holder === approver ? null : approver,
          dueAt: s.timeoutHours ? new Date(now.getTime() + hours(s.timeoutHours)) : null,
          remindAt: s.remindAfterHours ? new Date(now.getTime() + hours(s.remindAfterHours)) : null,
        },
      });
      if (holder !== approver) await this.log(tx, org, req.id, null, next, holder, approver, 'delegated', 'Delegated while away', 'system');
    }
    const updated = await tx.wfRequest.update({ where: { id: req.id }, data: { steps: steps as unknown as Prisma.InputJsonValue, currentStep: next, version: { increment: 1 }, updatedAt: now } });
    const holders = (await tx.wfTask.findMany({ where: { organizationId: org, requestId: req.id, step: next, status: 'open' }, select: { assigneeUserId: true } })).map((t) => t.assigneeUserId);
    notices.push({ to: holders, requestId: req.id, type: 'workflow.approval.needed', title: req.title, link: '/yx/approvals', text: `${this.type(req.requestType).label}: ${s.name}` });
    return updated;
  }

  private async finish(tx: Tx, ctx: CompanyContext, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome, notices: Notice[]) {
    const done = await tx.wfRequest.updateMany({ where: { id: req.id, status: 'pending' }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (!done.count) throw new ConflictException('This request was already decided.');
    const after = await tx.wfRequest.findFirstOrThrow({ where: { id: req.id } });
    await AuditService.recordIn(tx, ctx, { actorUserId: null, action: `workflow.request.${outcome}`, entityType: 'wf_request', entityId: req.id, metadata: { type: req.requestType, subjectId: req.subjectId } });
    await this.type(req.requestType).onDecided(tx, after, outcome);
    if (req.requesterUserId) notices.push({ to: [req.requesterUserId], requestId: req.id, type: 'workflow.approval.decided', title: req.title, link: this.type(req.requestType).requesterLink(after), text: outcome === 'approved' ? 'Approved' : 'Not approved' });
    return after;
  }

  private log(tx: Tx, org: string, requestId: string, taskId: string | null, step: number | null, actor: string | null, behalf: string | null, action: string, reason: string | null, channel: string) {
    return tx.wfAction.create({ data: { organizationId: org, requestId, taskId, step, actorUserId: actor, onBehalfOfUserId: behalf, action, reason: reason?.slice(0, 1000) ?? null, channel } });
  }

  /** Closes a step's other open tasks and tells their holders (US-G-044 "others are told"). */
  private async closeOthers(tx: Tx, org: string, req: Prisma.WfRequestGetPayload<object>, step: number, why: string, notices: Notice[]) {
    const open = await tx.wfTask.findMany({ where: { organizationId: org, requestId: req.id, step, status: 'open' } });
    for (const t of open) {
      await tx.wfTask.update({ where: { id: t.id }, data: { status: 'closed', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await this.log(tx, org, req.id, t.id, step, null, null, 'closed', why, 'system');
    }
    if (open.length) notices.push({ to: open.map((t) => t.assigneeUserId), requestId: req.id, type: 'workflow.approval.decided', title: req.title, link: '/yx/approvals', text: why });
  }

  /** Applies a step verdict: next step, or the end of the request. */
  private async settle(tx: Tx, ctx: CompanyContext, req: Prisma.WfRequestGetPayload<object>, step: number, v: 'approved' | 'rejected', notices: Notice[], why: string) {
    const steps = req.steps as unknown as FrozenStep[];
    steps[step].state = v;
    await tx.wfRequest.update({ where: { id: req.id }, data: { steps: steps as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedAt: new Date() } });
    await this.closeOthers(tx, ctx.organizationId, req, step, why, notices);
    if (v === 'rejected') return this.finish(tx, ctx, await tx.wfRequest.findFirstOrThrow({ where: { id: req.id } }), 'rejected', notices);
    return this.advance(tx, ctx, req.id, notices);
  }

  // ------------------------------------------------------------------------------------------ deciding

  /**
   * An approver's decision. Only the task's holder decides; a reject needs a reason (YX-WF-08). channel is the SD-2.06
   * seam (Teams / Slack / push arrive later with their own signed links).
   */
  async decide(ctx: CompanyContext, userId: string, taskId: string, decision: 'approve' | 'reject', reason: string | null, channel: 'web' | 'mobile' = 'web') {
    const notices: Notice[] = [];
    const res = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId;
      const task = await tx.wfTask.findFirst({ where: { organizationId: org, id: taskId } });
      // Someone else's task is "not found": approvers never learn about requests that are not theirs.
      if (!task || task.assigneeUserId !== userId) throw new NotFoundException('No such approval.');
      await tx.$queryRaw`SELECT id FROM wf_requests WHERE organization_id = ${org}::uuid AND id = ${task.requestId}::uuid FOR UPDATE`;
      const req = await tx.wfRequest.findFirstOrThrow({ where: { organizationId: org, id: task.requestId } });
      const fresh = await tx.wfTask.findFirstOrThrow({ where: { id: task.id } });
      if (fresh.status !== 'open' || req.status !== 'pending' || fresh.step !== req.currentStep) throw new ConflictException('This approval is already closed.');
      if (decision === 'reject' && !reason?.trim()) throw new BadRequestException('Say why you are not approving it.');
      const steps = req.steps as unknown as FrozenStep[];
      const s = steps[fresh.step];
      const own = userId === req.requesterUserId;
      if ((own && s.selfApproval !== 'allowed') || (userId === req.raisedByUserId && !own)) throw new ForbiddenException('You cannot approve a request you raised.');
      await tx.wfTask.update({ where: { id: fresh.id }, data: { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      const action = decision === 'reject' ? 'rejected' : own ? 'self_approved' : 'approved';
      await this.log(tx, org, req.id, fresh.id, fresh.step, userId, fresh.onBehalfOfUserId, action, reason?.trim() || null, channel);
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: `workflow.request.${action}`, entityType: 'wf_request', entityId: req.id, metadata: { step: fresh.step, onBehalfOf: fresh.onBehalfOfUserId, channel, selfApproval: own } });
      const tasks = await tx.wfTask.findMany({ where: { organizationId: org, requestId: req.id, step: fresh.step }, select: { status: true, assigneeUserId: true, onBehalfOfUserId: true } });
      // A person counts once even if they hold two tasks (their own and one on behalf of someone).
      const v = verdict(s, s.approverIds.length, tasks.filter((t) => t.status === 'approved').length, tasks.filter((t) => t.status === 'rejected').length);
      if (v !== 'open') await this.settle(tx, ctx, req, fresh.step, v, notices, v === 'approved' ? `${s.name}: approved` : `${s.name}: not approved`);
      return tx.wfRequest.findFirstOrThrow({ where: { id: req.id }, select: { id: true, status: true, currentStep: true } });
    });
    await this.send(ctx, notices);
    return res;
  }

  /** The module withdraws a pending request (the requester cancelled what it was for). */
  async withdraw(tx: Tx, ctx: CompanyContext, requestId: string, byUserId: string | null, reason: string) {
    const org = ctx.organizationId;
    const req = await tx.wfRequest.findFirst({ where: { organizationId: org, id: requestId } });
    if (!req || req.status !== 'pending') return;
    await tx.wfRequest.update({ where: { id: req.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const open = await tx.wfTask.findMany({ where: { organizationId: org, requestId, status: 'open' } });
    await tx.wfTask.updateMany({ where: { organizationId: org, requestId, status: 'open' }, data: { status: 'closed', decidedAt: new Date(), updatedAt: new Date() } });
    await this.log(tx, org, req.id, null, req.currentStep, byUserId, null, 'withdrawn', reason, 'web');
    await AuditService.recordIn(tx, ctx, { actorUserId: byUserId, action: 'workflow.request.withdrawn', entityType: 'wf_request', entityId: req.id, metadata: { reason, closedTasks: open.length } });
  }

  // ------------------------------------------------------------------------------------------ reminders and timeouts

  /** Job every 5 minutes: reminders (at most 3 per task) and the step's timeout action (P03 §4.6, US-G-043). */
  async tick(now = new Date()): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.wfTask.findMany({ where: { status: 'open', OR: [{ remindAt: { lte: now } }, { dueAt: { lte: now } }] }, select: { id: true, organizationId: true }, take: 500 }),
    );
    let n = 0;
    for (const d of due) {
      const ctx: CompanyContext = { organizationId: d.organizationId, isSuperAdmin: false };
      const notices: Notice[] = [];
      try {
        n += await this.tenantPrisma.forTenant(ctx, (tx) => this.tickOne(tx, ctx, d.id, now, notices));
        await this.send(ctx, notices);
      } catch (e) {
        this.logger.warn(`approval tick ${d.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async tickOne(tx: Tx, ctx: CompanyContext, taskId: string, now: Date, notices: Notice[]): Promise<number> {
    const org = ctx.organizationId;
    const t0 = await tx.wfTask.findFirst({ where: { organizationId: org, id: taskId } });
    if (!t0) return 0;
    await tx.$queryRaw`SELECT id FROM wf_requests WHERE organization_id = ${org}::uuid AND id = ${t0.requestId}::uuid FOR UPDATE`;
    const t = await tx.wfTask.findFirstOrThrow({ where: { id: taskId } });
    const req = await tx.wfRequest.findFirstOrThrow({ where: { id: t.requestId } });
    if (t.status !== 'open' || req.status !== 'pending' || t.step !== req.currentStep) return 0;
    const s = (req.steps as unknown as FrozenStep[])[t.step];
    const type = this.type(req.requestType);
    if (t.dueAt && t.dueAt <= now) {
      const action = s.onTimeout ?? 'escalate';
      // P03 Q2: auto-actions only where the type allows them and never for high-risk types; otherwise escalate.
      if ((action === 'approve' || action === 'reject') && type.autoActions && req.risk !== 'high') {
        await this.log(tx, org, req.id, t.id, t.step, null, null, action === 'approve' ? 'auto_approved' : 'auto_rejected', `No answer within ${s.timeoutHours} hours`, 'system');
        await AuditService.recordIn(tx, ctx, { actorUserId: null, action: `workflow.request.auto_${action === 'approve' ? 'approved' : 'rejected'}`, entityType: 'wf_request', entityId: req.id, metadata: { step: t.step, after: s.timeoutHours } });
        await this.settle(tx, ctx, req, t.step, action === 'approve' ? 'approved' : 'rejected', notices, `${s.name}: no answer in time`);
        return 1;
      }
      // Escalate once: the approver's manager also gets the task.
      const boss = await this.managerOf(tx, org, null, t.onBehalfOfUserId ?? t.assigneeUserId, 1);
      const ok = boss && boss !== req.requesterUserId && boss !== req.raisedByUserId && (await this.active(tx, org, [boss])).length;
      if (ok && !(await tx.wfTask.findFirst({ where: { organizationId: org, requestId: req.id, step: t.step, assigneeUserId: boss, status: 'open' } }))) {
        await tx.wfTask.create({ data: { organizationId: org, requestId: req.id, step: t.step, assigneeUserId: boss } });
        // The manager's approval counts as the approver's own.
        const steps = req.steps as unknown as FrozenStep[];
        if (!steps[t.step].approverIds.includes(boss)) steps[t.step].approverIds.push(boss);
        await tx.wfRequest.update({ where: { id: req.id }, data: { steps: steps as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
        notices.push({ to: [boss], requestId: req.id, type: 'workflow.approval.needed', title: req.title, link: '/yx/approvals', text: `Escalated to you: ${s.name}` });
      }
      await tx.wfTask.update({ where: { id: t.id }, data: { dueAt: null, escalatedAt: now, version: { increment: 1 }, updatedAt: now } });
      await this.log(tx, org, req.id, t.id, t.step, null, null, 'escalated', ok ? 'No answer in time: sent to their manager too' : 'No answer in time (no manager to send it to)', 'system');
      return 1;
    }
    if (t.remindAt && t.remindAt <= now) {
      const more = t.reminders + 1 < 3 && s.remindAfterHours;
      await tx.wfTask.update({ where: { id: t.id }, data: { reminders: { increment: 1 }, remindAt: more ? new Date(now.getTime() + hours(s.remindAfterHours!)) : null, version: { increment: 1 }, updatedAt: now } });
      await this.log(tx, org, req.id, t.id, t.step, null, null, 'reminded', null, 'system');
      notices.push({ to: [t.assigneeUserId], requestId: req.id, type: 'workflow.approval.reminder', title: req.title, link: '/yx/approvals', text: `Still waiting for you: ${s.name}` });
      return 1;
    }
    return 0;
  }

  // ------------------------------------------------------------------------------------------ delegation

  private async moveOpenTasks(tx: Tx, org: string, from: string, to: string, types: string[]) {
    // Never chained (YX-WF-07): only the person's own tasks move, not those they already hold for someone else.
    const open = await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: from, onBehalfOfUserId: null, status: 'open' } });
    let moved = 0;
    for (const t of open) {
      const req = await tx.wfRequest.findFirstOrThrow({ where: { id: t.requestId } });
      if (types.length && !types.includes(req.requestType)) continue;
      // Never to the requester or the person who raised it, and never twice to the same person on one step.
      if (to === req.requesterUserId || to === req.raisedByUserId) continue;
      if (await tx.wfTask.findFirst({ where: { organizationId: org, requestId: t.requestId, step: t.step, assigneeUserId: to, status: 'open' } })) continue;
      await tx.wfTask.update({ where: { id: t.id }, data: { assigneeUserId: to, onBehalfOfUserId: from, version: { increment: 1 }, updatedAt: new Date() } });
      await this.log(tx, org, t.requestId, t.id, t.step, to, from, 'delegated', 'Delegated while away', 'system');
      moved++;
    }
    return moved;
  }

  /** "I'm away from … to …, X approves for me" (P03 §4.4). Open tasks move at once when it starts today. */
  async delegate(ctx: CompanyContext, userId: string, input: { delegateUserId: string; startsOn: string; endsOn: string; requestTypes?: string[] }, source: 'manual' | 'leave' = 'manual') {
    return this.tenantPrisma.forTenant(ctx, (tx) => this.delegateIn(tx, ctx, userId, input, source, userId));
  }

  async delegateIn(tx: Tx, ctx: CompanyContext, userId: string, input: { delegateUserId: string; startsOn: string; endsOn: string; requestTypes?: string[] }, source: 'manual' | 'leave', by: string | null) {
    const org = ctx.organizationId;
    if (input.delegateUserId === userId) throw new BadRequestException('Choose someone other than yourself.');
    if (!(await this.active(tx, org, [input.delegateUserId])).length) throw new BadRequestException('Choose an active colleague.');
    if (input.endsOn < input.startsOn) throw new BadRequestException('The last day is before the first day.');
    if (Date.parse(input.endsOn) - Date.parse(input.startsOn) > 366 * 86_400_000) throw new BadRequestException('Delegate for up to a year at a time.');
    const types = (input.requestTypes ?? []).filter((k) => this.types.has(k));
    const d = await tx.wfDelegation.create({ data: { organizationId: org, userId, delegateUserId: input.delegateUserId, startsOn: new Date(`${input.startsOn}T00:00:00Z`), endsOn: new Date(`${input.endsOn}T00:00:00Z`), requestTypes: types, source, createdBy: by } });
    const today = todayIst();
    const moved = input.startsOn <= today && input.endsOn >= today ? await this.moveOpenTasks(tx, org, userId, input.delegateUserId, types) : 0;
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: 'workflow.delegation.created', entityType: 'wf_delegation', entityId: d.id, metadata: { userId, delegateUserId: input.delegateUserId, startsOn: input.startsOn, endsOn: input.endsOn, source, moved } });
    return { id: d.id, moved };
  }

  /**
   * Seam for M02 (P03 Q3): approved leave hands the approver's tasks to the delegate they chose on the leave request,
   * else to their own manager. Called by the leave module inside its own transaction when leave is approved.
   */
  async delegateForLeave(tx: Tx, ctx: CompanyContext, userId: string, startsOn: string, endsOn: string, delegateUserId?: string | null) {
    const to = delegateUserId ?? (await this.managerOf(tx, ctx.organizationId, null, userId, 1));
    if (!to || to === userId) return null;
    return this.delegateIn(tx, ctx, userId, { delegateUserId: to, startsOn, endsOn }, 'leave', null);
  }

  /** M02 seam: cancelled leave takes back the delegation its approval made (never a manual one). */
  async revokeLeaveDelegations(tx: Tx, ctx: CompanyContext, userId: string, startsOn: string, endsOn: string) {
    const n = await tx.wfDelegation.updateMany({ where: { organizationId: ctx.organizationId, userId, source: 'leave', revokedAt: null, startsOn: new Date(`${startsOn}T00:00:00Z`), endsOn: new Date(`${endsOn}T00:00:00Z`) }, data: { revokedAt: new Date() } });
    if (n.count) await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'workflow.delegation.revoked', entityType: 'wf_delegation', entityId: userId, metadata: { source: 'leave', startsOn, endsOn, count: n.count } });
    return n.count;
  }

  async revokeDelegation(ctx: CompanyContext, userId: string, id: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const n = await tx.wfDelegation.updateMany({ where: { organizationId: ctx.organizationId, id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!n.count) throw new NotFoundException('No such delegation.');
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: 'workflow.delegation.revoked', entityType: 'wf_delegation', entityId: id });
      return { revoked: true };
    });
  }

  async delegations(ctx: CompanyContext, userId: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const rows = await tx.wfDelegation.findMany({ where: { organizationId: ctx.organizationId, revokedAt: null, endsOn: { gte: new Date(`${todayIst()}T00:00:00Z`) }, OR: [{ userId }, { delegateUserId: userId }] }, orderBy: { startsOn: 'asc' } });
      const names = await this.names(tx, ctx.organizationId, rows.flatMap((r) => [r.userId, r.delegateUserId]));
      return rows.map((r) => ({ id: r.id, mine: r.userId === userId, person: names.get(r.userId) ?? '', delegate: names.get(r.delegateUserId) ?? '', startsOn: r.startsOn.toISOString().slice(0, 10), endsOn: r.endsOn.toISOString().slice(0, 10), source: r.source, requestTypes: r.requestTypes }));
    });
  }

  // ------------------------------------------------------------------------------------------ reading

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.name?.trim() || u.email]));
  }

  /** Active logins of the company by name (to pick a delegate or a named approver). Names only, 20 at most. */
  async people(ctx: CompanyContext, q: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const rows = await tx.user.findMany({ where: { organizationId: ctx.organizationId, status: 'active', ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { startsWith: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 20 });
      return rows.map((u) => ({ id: u.id, label: u.name?.trim() || u.email.split('@')[0], detail: null }));
    });
  }

  /** What is waiting for me (YX-WF-14: the one query every count uses). */
  async inbox(ctx: CompanyContext, userId: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId;
      const tasks = await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: userId, status: 'open' }, orderBy: { createdAt: 'asc' }, take: 200 });
      const reqs = new Map((await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: tasks.map((t) => t.requestId) }, status: 'pending' } })).map((r) => [r.id, r]));
      const names = await this.names(tx, org, [...reqs.values()].flatMap((r) => [r.requesterUserId, r.raisedByUserId]).concat(tasks.map((t) => t.onBehalfOfUserId)));
      return tasks
        .filter((t) => reqs.get(t.requestId)?.currentStep === t.step)
        .map((t) => {
          const r = reqs.get(t.requestId)!;
          const steps = r.steps as unknown as FrozenStep[];
          return {
            taskId: t.id,
            requestId: r.id,
            type: this.types.get(r.requestType)?.label ?? r.requestType,
            title: r.title,
            summary: r.summary,
            requester: r.requesterUserId ? (names.get(r.requesterUserId) ?? '') : '',
            raisedBy: r.raisedByUserId && r.raisedByUserId !== r.requesterUserId ? (names.get(r.raisedByUserId) ?? '') : null,
            onBehalfOf: t.onBehalfOfUserId ? (names.get(t.onBehalfOfUserId) ?? '') : null,
            step: { index: t.step + 1, of: steps.length, name: steps[t.step].name, need: steps[t.step].need, approvers: steps[t.step].approverIds.length },
            dueAt: t.dueAt,
            submittedAt: r.submittedAt,
          };
        });
    });
  }

  /** A request's route and log, for its requester, the person who raised it, or anyone who held one of its tasks. */
  async view(ctx: CompanyContext, userId: string, requestId: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId;
      const r = await tx.wfRequest.findFirst({ where: { organizationId: org, id: requestId } });
      const holder = r && (await tx.wfTask.findFirst({ where: { organizationId: org, requestId, OR: [{ assigneeUserId: userId }, { onBehalfOfUserId: userId }] }, select: { id: true } }));
      if (!r || !(r.requesterUserId === userId || r.raisedByUserId === userId || holder)) throw new NotFoundException('No such request.');
      return this.viewIn(tx, org, r);
    });
  }

  /** The route and log of a request (the module checks who may see it). */
  async viewIn(tx: Tx, org: string, r: Prisma.WfRequestGetPayload<object>) {
    const actions = await tx.wfAction.findMany({ where: { organizationId: org, requestId: r.id }, orderBy: { createdAt: 'asc' } });
    const tasks = await tx.wfTask.findMany({ where: { organizationId: org, requestId: r.id }, orderBy: { createdAt: 'asc' } });
    const steps = r.steps as unknown as FrozenStep[];
    const names = await this.names(tx, org, [...actions.flatMap((a) => [a.actorUserId, a.onBehalfOfUserId]), ...tasks.flatMap((t) => [t.assigneeUserId, t.onBehalfOfUserId]), ...steps.flatMap((s) => s.approverIds)]);
    return {
      id: r.id,
      type: this.types.get(r.requestType)?.label ?? r.requestType,
      title: r.title,
      status: r.status,
      summary: r.summary,
      submittedAt: r.submittedAt,
      decidedAt: r.decidedAt,
      steps: steps.map((s, i) => ({
        name: s.name,
        state: s.state,
        rule: s.mode === 'any' ? 'Any one' : s.mode === 'all' ? 'All' : `${s.need} of ${s.approverIds.length}`,
        approvers: tasks.filter((t) => t.step === i).map((t) => ({ name: names.get(t.assigneeUserId) ?? '', onBehalfOf: t.onBehalfOfUserId ? (names.get(t.onBehalfOfUserId) ?? '') : null, status: t.status })),
        waitingFor: s.state === 'waiting' ? s.approverIds.map((id) => names.get(id) ?? '') : [],
      })),
      log: actions.map((a) => ({ action: a.action, by: a.actorUserId ? (names.get(a.actorUserId) ?? '') : null, onBehalfOf: a.onBehalfOfUserId ? (names.get(a.onBehalfOfUserId) ?? '') : null, step: a.step === null ? null : a.step + 1, reason: a.reason, channel: a.channel, at: a.createdAt })),
    };
  }

  /** My recent decisions and the requests I sent. */
  async history(ctx: CompanyContext, userId: string) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId;
      const decided = await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: userId, status: { in: ['approved', 'rejected'] } }, orderBy: { decidedAt: 'desc' }, take: 50 });
      const mine = await tx.wfRequest.findMany({ where: { organizationId: org, OR: [{ requesterUserId: userId }, { raisedByUserId: userId }] }, orderBy: { submittedAt: 'desc' }, take: 50 });
      const reqs = new Map((await tx.wfRequest.findMany({ where: { organizationId: org, id: { in: decided.map((t) => t.requestId) } }, select: { id: true, title: true, requestType: true, status: true } })).map((r) => [r.id, r]));
      return {
        decided: decided.map((t) => ({ requestId: t.requestId, title: reqs.get(t.requestId)?.title ?? '', type: this.types.get(reqs.get(t.requestId)?.requestType ?? '')?.label ?? '', decision: t.status, at: t.decidedAt, requestStatus: reqs.get(t.requestId)?.status ?? '' })),
        sent: mine.map((r) => ({ requestId: r.id, title: r.title, type: this.types.get(r.requestType)?.label ?? r.requestType, status: r.status, submittedAt: r.submittedAt, decidedAt: r.decidedAt })),
      };
    });
  }

  /** Bell notices and email, after the transaction committed (never inside it). */
  async send(ctx: TenantContext, notices: Notice[]) {
    for (const n of notices) {
      const to = [...new Set(n.to)];
      if (!to.length) continue;
      try {
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        const url = `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}${n.link}`;
        await this.notifications.notifySystem(ctx, to, n.type, { entityType: 'wf_request', entityId: n.requestId, contextText: `${n.title} · ${n.text}`.slice(0, 300), linkPath: n.link }, { subject: `${n.text}: ${n.title}`.slice(0, 150), html: `<p>${esc(n.text)}: <strong>${esc(n.title)}</strong></p><p><a href="${esc(url)}">Open in YukthiX</a></p>` });
      } catch (e) {
        this.logger.warn(`approval notice not sent: ${(e as Error).message}`);
      }
    }
  }
}

export const isRuleError = (e: unknown): e is RuleError => e instanceof RuleError;
