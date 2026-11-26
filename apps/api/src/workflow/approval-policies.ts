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

/**
 * E2 review item 4 (separation of duties): a Pay-group request type and the approve key of its area. Changing who approves
 * one needs that key in every legal entity of the company, and every HR Admin a step would route to must hold it too, so
 * an HR Admin with no pay keys can never route pay approvals to themselves or a friend. These types are not editable yet
 * (E2 lists them); the guard runs first, so it already holds.
 */
export const PAY_APPROVE_KEYS: Readonly<Record<string, string>> = {
  'payroll.one_time': 'payroll.run.approve',
  'payroll.loan': 'payroll.run.approve',
  'payroll.run': 'payroll.run.approve',
  'payroll.correction': 'payroll.run.approve',
  'payroll.period_reopen': 'payroll.run.approve',
  'payroll.payment_mode': 'payroll.run.approve',
};

/** The users among `ids` who hold `key` (company-wide, or a grant for that entity) in every one of `entities`. */
export async function holdKeyEverywhere(tx: Tx, org: string, ids: string[], key: string, entities: string[], today: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const like = `%"${key}"%`;
  const rows = await tx.$queryRaw<{ user_id: string; scope: string; entity: string | null }[]>`
    SELECT u.id::text AS user_id, 'tenant' AS scope, NULL::text AS entity FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.id = ANY(${ids}::uuid[]) AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT g.user_id::text, g.scope_type, g.legal_entity_id::text FROM role_grants g
    JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    WHERE g.organization_id = ${org}::uuid AND g.user_id = ANY(${ids}::uuid[]) AND g.status = 'active' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date) AND g.scope_type IN ('tenant', 'legal_entity')`;
  return new Set(ids.filter((u) => rows.some((r) => r.user_id === u && r.scope === 'tenant') || (entities.length > 0 && entities.every((e) => rows.some((r) => r.user_id === u && r.entity === e)))));
}

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
  // E2 review item 3: a company's own step never allows self-approval (only a module's built-in sole-approver path may).
  return { name: s.name, approvers, mode: s.mode, remindAfterHours: remindHours, timeoutHours: escalateHours, onTimeout: 'escalate', selfApproval: 'never' };
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

  /** The steps to use for this request type at this company and the policy version, or null for the module's built-in steps. */
  async stepsFor(tx: Tx, c: CompanyContext, type: string): Promise<{ steps: StepSpec[]; version: number } | null> {
    if (!TYPE_KEYS.has(type)) return null;
    const row = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
    if (!row) return null;
    const h = await this.hours(tx, c);
    return { steps: (row.steps as unknown as PolicyStep[]).map((s) => toStepSpec(s, h.remind, h.escalate)), version: row.version };
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
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    if (PAY_APPROVE_KEYS[type]) await this.tenantPrisma.forTenant(c, (tx) => this.payGuard(tx, c, type, Array.isArray(steps) ? (steps as PolicyStep[]) : []));
    if (!TYPE_KEYS.has(type)) throw new NotFoundException('This request type has no approval policy here.');
    const clean = checkSteps(steps);
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

  /** E2 review item 4: refuses a pay policy from someone without the area's approve key everywhere, or routing to HR Admins without it. */
  async payGuard(tx: Tx, c: CompanyContext, type: string, steps: Partial<PolicyStep>[]) {
    const key = PAY_APPROVE_KEYS[type]!;
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id);
    if (!(await holdKeyEverywhere(tx, c.organizationId, [c.userId!], key, entities, today)).has(c.userId!)) throw new ForbiddenException(`Changing who approves this needs ${key} in every legal entity of the company.`);
    if (!steps.some((s) => s?.approver === 'hr')) return;
    const profiles = (await tx.permissionProfile.findMany({ where: { organizationId: c.organizationId, permissionsJson: { contains: '"org.settings.manage"' } }, select: { id: true } })).map((p) => p.id);
    const hr = [...new Set([...(await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', permissionProfileId: { in: profiles } }, select: { id: true } })).map((u) => u.id), ...(await tx.roleGrant.findMany({ where: { organizationId: c.organizationId, status: 'active', permissionProfileId: { in: profiles } }, select: { userId: true } })).map((g) => g.userId)])];
    const ok = await holdKeyEverywhere(tx, c.organizationId, hr, key, entities, today);
    const without = hr.filter((u) => !ok.has(u));
    if (without.length) {
      const names = (await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: without } }, select: { name: true, email: true }, take: 5 })).map((u) => u.name?.trim() || u.email);
      throw new BadRequestException(`An "HR Admins" step would route pay approvals to people without ${key}: ${names.join(', ')}${without.length > 5 ? ' and others' : ''}. Choose approvers who hold it.`);
    }
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
