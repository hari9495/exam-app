import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext, type CompanyContext } from '../org-structure/org-structure.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';
import type { ApproverSpec, StepSpec } from './approvals-engine.service';

type Tx = Prisma.TransactionClient;

/**
 * Settings S-6, 2.4 Approvals (answer 1330): the request types a company may give its own approval steps. People requests
 * only: payroll, pay, offers, hiring and other high-risk or specially guarded routes keep the approvers their module sets
 * (hiring's routes move here later). Each needs the request type's module to submit through the shared engine.
 */
export const POLICY_TYPES: { key: string; label: string }[] = [
  { key: 'leave.request', label: 'Leave' },
  { key: 'leave.cancel', label: 'Leave cancellation' },
  { key: 'leave.comp_off', label: 'Comp-off' },
  { key: 'attendance.regularise', label: 'Attendance fix' },
  { key: 'attendance.wfh', label: 'Work from home' },
  { key: 'attendance.on_duty', label: 'On duty' },
  { key: 'time.overtime', label: 'Overtime' },
  { key: 'time.overtime_plan', label: 'Overtime pre-approval' },
  { key: 'time.shift_swap', label: 'Shift swap' },
  { key: 'time.timesheet', label: 'Timesheet' },
  { key: 'expense.claim', label: 'Expense claim' },
  { key: 'expense.trip', label: 'Trip' },
  { key: 'expense.advance', label: 'Expense advance' },
];
const TYPE_KEYS = new Set(POLICY_TYPES.map((t) => t.key));

/** Who approves a step, in the company's words: the person's manager, their manager's manager, or the HR Admins. */
export type PolicyApprover = 'manager' | 'manager_2' | 'hr';
export interface PolicyStep {
  name: string;
  approver: PolicyApprover;
  /** Any one of them, or all of them. */
  mode: 'any' | 'all';
}
export const REMIND_KEY = 'approval.remind_hours';
export const ESCALATE_KEY = 'approval.escalate_hours';

/** The checked steps of a policy (1 to 5; plain names; known approvers), or the reason in words. */
export function checkSteps(input: unknown): PolicyStep[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) throw new BadRequestException('Give between 1 and 5 steps.');
  return input.map((raw, i) => {
    const s = raw as Partial<PolicyStep>;
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (name.length < 2 || name.length > 60 || /[<>]/.test(name)) throw new BadRequestException(`Step ${i + 1}: give a name of 2 to 60 characters, without < or >.`);
    if (!['manager', 'manager_2', 'hr'].includes(String(s.approver))) throw new BadRequestException(`Step ${i + 1}: choose who approves.`);
    if (!['any', 'all'].includes(String(s.mode))) throw new BadRequestException(`Step ${i + 1}: choose any one or all.`);
    return { name, approver: s.approver as PolicyApprover, mode: s.mode as 'any' | 'all' };
  });
}

/** A company step as the engine's: a reminder and escalation (to the approver's manager) after the company's hours. */
export function toStepSpec(s: PolicyStep, remindHours: number, escalateHours: number): StepSpec {
  const approvers: ApproverSpec[] = s.approver === 'hr' ? [{ kind: 'hr' }] : [{ kind: 'manager', level: s.approver === 'manager_2' ? 2 : 1 }];
  return { name: s.name, approvers, mode: s.mode, remindAfterHours: remindHours, timeoutHours: escalateHours, onTimeout: 'escalate' };
}

const APPROVER_WORDS: Record<PolicyApprover, string> = { manager: 'Manager', manager_2: "Manager's manager", hr: 'HR Admins' };

/** Answer 1764: each module's built-in steps in plain words (kept in step with the module's own submit). */
export const BUILT_IN_WORDS: Record<string, string> = {
  'leave.request': 'Manager; HR too when the leave is longer than its leave type allows without HR',
  'leave.cancel': 'Manager',
  'leave.comp_off': 'Manager',
  'attendance.regularise': "Manager; HR too once the month's fixes are used up",
  'attendance.wfh': "Manager; HR too once the month's work-from-home days are used up",
  'attendance.on_duty': 'Manager',
  'time.overtime': 'Manager, when the overtime rule asks for approval',
  'time.overtime_plan': 'Manager',
  'time.shift_swap': 'The colleague agrees, then the manager',
  'time.timesheet': "The project's managers (all of them), or the manager when it has none",
  'expense.claim': "Manager; then the cost-centre owner above the company's amount, the manager's manager when a line is over its limit, and a finance check when the company asks for one",
  'expense.trip': 'Manager; then the travel desk when a booking is needed',
  'expense.advance': 'Manager, then Finance',
};

/**
 * Answer 1765: the company's reminder and escalation hours on a people request's built-in steps too. Every step is
 * reminded at the company's hours; a manager's step (or one the module already times out) escalates at the company's
 * hours, to the approver's manager unless the module says otherwise. A step for named people only, such as a colleague
 * agreeing to a swap, is not escalated past them.
 */
export function withCompanyHours(steps: StepSpec[], remindHours: number, escalateHours: number): StepSpec[] {
  return steps.map((s) => {
    const escalates = s.timeoutHours !== undefined || s.approvers.some((a) => a.kind === 'manager');
    return { ...s, remindAfterHours: remindHours, ...(escalates ? { timeoutHours: escalateHours, onTimeout: s.onTimeout ?? 'escalate' } : {}) };
  });
}

/**
 * The company's approval policies (answer 1330), on the shared approvals engine: for each listed request type, its own
 * steps, or the module's built-in ones. Changes apply to new requests only (a request keeps the route it was sent with).
 */
@Injectable()
export class ApprovalPolicies {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async hours(tx: Tx, c: CompanyContext) {
    const n = async (k: string) => Number(await settingFor(tx, c, k as keyof typeof SETTINGS & string, { legalEntityId: '' }));
    return { remind: await n(REMIND_KEY), escalate: await n(ESCALATE_KEY) };
  }

  /** A people request's built-in steps with the company's hours (answer 1765); any other request's steps unchanged. */
  async builtIn(tx: Tx, c: CompanyContext, type: string, steps: StepSpec[]): Promise<StepSpec[]> {
    if (!TYPE_KEYS.has(type) || !steps.length) return steps;
    const h = await this.hours(tx, c);
    return withCompanyHours(steps, h.remind, h.escalate);
  }

  /** The steps to use for this request type at this company, or null for the module's built-in steps. */
  async stepsFor(tx: Tx, c: CompanyContext, type: string): Promise<StepSpec[] | null> {
    if (!TYPE_KEYS.has(type)) return null;
    const row = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
    if (!row) return null;
    const h = await this.hours(tx, c);
    return (row.steps as unknown as PolicyStep[]).map((s) => toStepSpec(s, h.remind, h.escalate));
  }

  async list(ctx: { organizationId: string | null; userId?: string | null }) {
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await tx.approvalPolicy.findMany({ where: { organizationId: c.organizationId } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.updatedBy ? [r.updatedBy] : [])) } }, select: { id: true, name: true, email: true } });
      const h = await this.hours(tx, c);
      return {
        remindHours: h.remind,
        escalateHours: h.escalate,
        types: POLICY_TYPES.map((t) => {
          const r = rows.find((x) => x.requestType === t.key);
          const steps = r ? (r.steps as unknown as PolicyStep[]) : null;
          const by = r?.updatedBy ? users.find((u) => u.id === r.updatedBy) : undefined;
          return {
            key: t.key,
            label: t.label,
            steps,
            approvers: steps ? steps.map((s) => APPROVER_WORDS[s.approver]).join(' → ') : BUILT_IN_WORDS[t.key]!,
            version: r?.version ?? 0,
            updatedBy: by ? by.name?.trim() || by.email : null,
            updatedAt: r?.updatedAt.toISOString() ?? null,
          };
        }),
      };
    });
  }

  /** Saves the type's steps as a new version (version: the one the editor opened; 0 for none). Audited. */
  async save(ctx: { organizationId: string | null; userId?: string | null }, type: string, steps: unknown, version: number) {
    if (!ctx.userId) throw new ForbiddenException('Sign in to change approval policies.');
    if (!TYPE_KEYS.has(type)) throw new NotFoundException('This request type has no approval policy here.');
    const clean = checkSteps(steps);
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    await this.tenantPrisma.forTenant(c, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-policy:${c.organizationId}:${type}`}))`;
      const before = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
      if ((before?.version ?? 0) !== version) throw new ConflictException('Someone changed this policy since you opened it. Open it again.');
      const json = clean as unknown as Prisma.InputJsonValue;
      if (before) await tx.approvalPolicy.update({ where: { id: before.id }, data: { steps: json, version: { increment: 1 }, updatedBy: ctx.userId!, updatedAt: new Date() } });
      else await tx.approvalPolicy.create({ data: { organizationId: c.organizationId, requestType: type, steps: json, version: 1, updatedBy: ctx.userId! } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.policy.changed', entityType: 'approval_policy', entityId: type, metadata: { type, before: before?.steps ?? null, after: clean, version: version + 1 } });
    });
    return this.list(ctx);
  }

  /** Back to the module's built-in steps. Audited. */
  async reset(ctx: { organizationId: string | null; userId?: string | null }, type: string, version: number) {
    if (!ctx.userId) throw new ForbiddenException('Sign in to change approval policies.');
    if (!TYPE_KEYS.has(type)) throw new NotFoundException('This request type has no approval policy here.');
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const before = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
      if (!before) return;
      if (before.version !== version) throw new ConflictException('Someone changed this policy since you opened it. Open it again.');
      await tx.approvalPolicy.delete({ where: { id: before.id } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.policy.reset', entityType: 'approval_policy', entityId: type, metadata: { type, before: before.steps, after: null } });
    });
    return this.list(ctx);
  }
}
