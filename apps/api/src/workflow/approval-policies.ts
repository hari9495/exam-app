import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext, type CompanyContext } from '../org-structure/org-structure.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import { type FieldDef, type Group, type RecordValues, RuleError, evaluate, parseGroup } from '../rules-engine/conditions';
import type { ApproverSpec, ApprovalsEngine, FrozenStep, StepSpec, SubmitInput } from './approvals-engine.service';
import { LIMIT_FAMILIES, MAX_HOLDERS, familyOf } from './approver-kinds';

type Tx = Prisma.TransactionClient;

/** E2 part 4 (answers 2644 and 2785): how far a company may change a request type's route. */
export type PolicyMode = 'full' | 'addon' | 'locked';
export interface PolicyType {
  key: string;
  label: string;
  /** The area the editor groups it under. */
  group: string;
  /** full: the company's steps replace the module's (its required steps stay); addon: they come after the module's steps;
   *  locked: built in, cannot change (payroll run, period reopen, correction, payment mode, reports access). */
  mode: PolicyMode;
  /** The values a rule's condition may test, as the module sends them with each request. */
  fields: FieldDef[];
}
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const AMOUNT: FieldDef = { key: 'amount', label: 'Amount (₹)', type: 'money' };
/** Not for conditions (an id): the job's hiring manager, for the "Hiring manager" approver (answer 2647). */
const HIRING_MANAGER: FieldDef = { key: 'hiring_manager_id', label: 'Hiring manager', type: 'text' };

/**
 * Settings S-6, 2.4 Approvals (answer 1330), widened by E2 (answer 2644): every request type the editor shows, by area.
 * Each needs its module to submit through the shared engine and to send the declared values (`fields`).
 */
export const POLICY_TYPES: PolicyType[] = [
  { key: 'leave.request', label: 'Leave', group: 'Time and leave', mode: 'full', fields: [{ key: 'days', label: 'Days', type: 'number' }] },
  { key: 'leave.cancel', label: 'Leave cancellation', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'leave.comp_off', label: 'Comp-off', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'attendance.regularise', label: 'Attendance fix', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'attendance.wfh', label: 'Work from home', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'attendance.on_duty', label: 'On duty', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'time.overtime', label: 'Overtime', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'time.overtime_plan', label: 'Overtime pre-approval', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'time.shift_swap', label: 'Shift swap', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'time.timesheet', label: 'Timesheet', group: 'Time and leave', mode: 'full', fields: [] },
  { key: 'expense.claim', label: 'Expense claim', group: 'Expenses', mode: 'full', fields: [AMOUNT] },
  { key: 'expense.trip', label: 'Trip', group: 'Expenses', mode: 'full', fields: [] },
  { key: 'expense.advance', label: 'Expense advance', group: 'Expenses', mode: 'full', fields: [AMOUNT] },
  {
    key: 'ats.requisition',
    label: 'Requisition',
    group: 'Hiring',
    mode: 'full',
    fields: [{ key: 'openings', label: 'Openings', type: 'number' }, { key: 'outside_plan', label: 'Outside the plan', type: 'choice', options: YES_NO }, { key: 'replacement', label: 'Replacement', type: 'choice', options: YES_NO }, HIRING_MANAGER],
  },
  { key: 'ats.offer', label: 'Offer', group: 'Hiring', mode: 'full', fields: [{ ...AMOUNT, label: 'Fixed pay a year (₹)' }, { key: 'above_range', label: 'Above the pay range', type: 'choice', options: YES_NO }, HIRING_MANAGER] },
  { key: 'ats.headcount_plan', label: 'Headcount plan', group: 'Hiring', mode: 'full', fields: [{ key: 'positions', label: 'Positions', type: 'number' }, { key: 'budget', label: 'Budget (₹)', type: 'money' }] },
  { key: 'org.position_change', label: 'Position change', group: 'Organisation', mode: 'full', fields: [{ key: 'changes', label: 'Changes', type: 'number' }] },
  { key: 'payroll.one_time', label: 'One-time pay', group: 'Pay', mode: 'addon', fields: [AMOUNT] },
  { key: 'payroll.loan', label: 'Loan or salary advance', group: 'Pay', mode: 'addon', fields: [AMOUNT] },
  { key: 'payroll.run', label: 'Payroll run', group: 'Pay', mode: 'locked', fields: [] },
  { key: 'payroll.period_reopen', label: 'Reopen a pay period', group: 'Pay', mode: 'locked', fields: [] },
  { key: 'payroll.correction', label: 'Pay correction', group: 'Pay', mode: 'locked', fields: [] },
  { key: 'payroll.payment_mode', label: 'Payment mode change', group: 'Pay', mode: 'locked', fields: [] },
  { key: 'payroll.reports_access', label: 'Payroll reports access', group: 'Pay', mode: 'locked', fields: [] },
  { key: 'exit.resignation', label: 'Resignation', group: 'Exits and letters', mode: 'addon', fields: [] },
  { key: 'exit.company', label: 'Exit', group: 'Exits and letters', mode: 'addon', fields: [] },
  { key: 'exit.withdrawal', label: 'Resignation withdrawal', group: 'Exits and letters', mode: 'addon', fields: [] },
  { key: 'exit.notice_change', label: 'Notice change', group: 'Exits and letters', mode: 'addon', fields: [] },
  { key: 'letter.issue', label: 'Letter', group: 'Exits and letters', mode: 'addon', fields: [] },
];
const TYPES = new Map(POLICY_TYPES.map((t) => [t.key, t]));
/** The values a request type declares for conditions (none for types outside the editor). */
export const declaredFields = (type: string): FieldDef[] => TYPES.get(type)?.fields ?? [];
/** The fields a condition may test: ids (such as the hiring manager) are carried but never compared. */
const conditionFields = (type: string) => declaredFields(type).filter((f) => !f.key.endsWith('_id'));

/**
 * E2 review item 4 (separation of duties): a Pay-group request type and the approve key of its area. Changing who approves
 * one needs that key in every legal entity of the company, and every HR Admin a step would route to must hold it too, so
 * an HR Admin with no pay keys can never route pay approvals to themselves or a friend. These types are not editable yet
 * (E2 lists them); the guard runs first, so it already holds.
 */
export const PAY_APPROVE_KEYS: Readonly<Record<string, string>> = {
  'payroll.one_time': 'payroll.run.approve',
  'payroll.loan': 'payroll.loan.approve',
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

/**
 * Who approves a step, in the company's words. manager / manager_2 / hr (answer 1330); E2 adds named people, a user
 * group, holders of a key in the request's entity, department or location (2646, 2788), up the manager chain until a
 * grade or the approval limit (2645), and the job's hiring manager (2647, hiring types only).
 */
export type PolicyApprover = 'manager' | 'manager_2' | 'hr' | 'users' | 'group' | 'key_holders' | 'chain_grade' | 'chain_limit' | 'hiring_manager';
export interface PolicyStep {
  name: string;
  approver: PolicyApprover;
  /** Any one of them, all of them, or at least `count`. */
  mode: 'any' | 'all' | 'count';
  count?: number;
  userIds?: string[];
  groupId?: string;
  key?: string;
  scope?: 'entity' | 'department' | 'location';
  gradeId?: string;
  family?: string;
}
/** E2: one rule of a policy: when its condition holds, its steps are the route (the first matching rule wins). */
export interface PolicyRule {
  name: string;
  when: Group;
  steps: PolicyStep[];
}
/** A policy as saved: its rules in order, then the "otherwise" steps. */
export interface PolicyBody {
  rules: PolicyRule[];
  steps: PolicyStep[];
}
/** The route a policy chose for one request, as the engine takes it. */
export interface ChosenRoute {
  steps: StepSpec[];
  version: number;
  addOn: boolean;
  rule: string;
}
export const REMIND_KEY = 'approval.remind_hours';
export const ESCALATE_KEY = 'approval.escalate_hours';
export const OTHERWISE = 'Otherwise';
const MAX_RULES = 10;
const APPROVERS: PolicyApprover[] = ['manager', 'manager_2', 'hr', 'users', 'group', 'key_holders', 'chain_grade', 'chain_limit', 'hiring_manager'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z_]*(\.[a-z_]+){1,4}$/;
const NAME_RULE = (what: string) => `${what}: give a name of 2 to 60 characters, without < or >.`;
const nameOf = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const badName = (n: string) => n.length < 2 || n.length > 60 || /[<>]/.test(n);

/** The checked steps of one route (1 to 5; plain names; known approvers and their parts), or the reason in words. */
export function checkSteps(input: unknown, type = '', where = ''): PolicyStep[] {
  const at = (i: number) => `${where}Step ${i + 1}`;
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) throw new BadRequestException(`${where}Give between 1 and 5 steps.`);
  return input.map((raw, i) => {
    const s = (raw ?? {}) as Partial<PolicyStep>;
    const name = nameOf(s.name);
    if (badName(name)) throw new BadRequestException(NAME_RULE(at(i)));
    if (!APPROVERS.includes(s.approver as PolicyApprover)) throw new BadRequestException(`${at(i)}: choose who approves.`);
    if (!['any', 'all', 'count'].includes(String(s.mode))) throw new BadRequestException(`${at(i)}: choose any one, all or a number.`);
    const out: PolicyStep = { name, approver: s.approver as PolicyApprover, mode: s.mode as PolicyStep['mode'] };
    if (out.mode === 'count') {
      if (!Number.isInteger(s.count) || (s.count as number) < 1 || (s.count as number) > MAX_HOLDERS) throw new BadRequestException(`${at(i)}: how many must approve (1 to ${MAX_HOLDERS})?`);
      out.count = s.count;
    }
    if (out.approver === 'users') {
      if (!Array.isArray(s.userIds) || !s.userIds.length || s.userIds.length > MAX_HOLDERS || s.userIds.some((u) => typeof u !== 'string' || !UUID.test(u))) throw new BadRequestException(`${at(i)}: choose 1 to ${MAX_HOLDERS} people.`);
      out.userIds = [...new Set(s.userIds)];
    }
    if (out.approver === 'group') {
      if (typeof s.groupId !== 'string' || !UUID.test(s.groupId)) throw new BadRequestException(`${at(i)}: choose a group.`);
      out.groupId = s.groupId;
    }
    if (out.approver === 'key_holders') {
      if (typeof s.key !== 'string' || !KEY.test(s.key)) throw new BadRequestException(`${at(i)}: choose the key the approvers hold.`);
      if (!['entity', 'department', 'location'].includes(String(s.scope))) throw new BadRequestException(`${at(i)}: choose where they hold it: the request's legal entity, department or location.`);
      Object.assign(out, { key: s.key, scope: s.scope });
    }
    if (out.approver === 'chain_grade') {
      if (typeof s.gradeId !== 'string' || !UUID.test(s.gradeId)) throw new BadRequestException(`${at(i)}: choose the grade the chain goes up to.`);
      out.gradeId = s.gradeId;
    }
    if (out.approver === 'chain_limit') {
      const family = familyOf(type);
      if (!family || !declaredFields(type).some((f) => f.key === 'amount')) throw new BadRequestException(`${at(i)}: this request type has no amount, so it cannot go up the chain to an approval limit.`);
      out.family = family;
    }
    if (out.approver === 'hiring_manager' && !['ats.requisition', 'ats.offer'].includes(type)) throw new BadRequestException(`${at(i)}: only requisitions and offers have a hiring manager.`);
    // Derived people are one each, except holders and groups: "all" or a number only makes sense with several people.
    if (out.mode !== 'any' && !['users', 'group', 'key_holders', 'hr'].includes(out.approver)) throw new BadRequestException(`${at(i)}: one person approves this step, so choose "Any one".`);
    return out;
  });
}

/** The checked policy: rules (up to 10, each a name, a condition on the type's values and its steps) and the otherwise steps. */
export function checkBody(type: string, input: { rules?: unknown; steps?: unknown }): PolicyBody {
  const fields = conditionFields(type);
  const rawRules = input.rules ?? [];
  if (!Array.isArray(rawRules) || rawRules.length > MAX_RULES) throw new BadRequestException(`Use up to ${MAX_RULES} rules.`);
  if (rawRules.length && !fields.length) throw new BadRequestException('This request type sends no values to test, so it has one route: use the "otherwise" steps only.');
  const rules = rawRules.map((raw, i): PolicyRule => {
    const r = (raw ?? {}) as Partial<PolicyRule>;
    const name = nameOf(r.name);
    if (badName(name)) throw new BadRequestException(NAME_RULE(`Rule ${i + 1}`));
    let when: Group;
    try {
      when = parseGroup(r.when, fields);
    } catch (e) {
      throw new BadRequestException(`Rule "${name}": ${e instanceof RuleError ? e.message : 'the condition is not in the expected shape.'}`);
    }
    if (!when.items.length) throw new BadRequestException(`Rule "${name}": add a condition. Requests that match no rule take the "otherwise" steps.`);
    return { name, when, steps: checkSteps(r.steps, type, `Rule "${name}", `) };
  });
  return { rules, steps: checkSteps(input.steps, type) };
}

/** The first rule whose condition holds for these values, else the otherwise steps. */
export function pick(body: PolicyBody, values: RecordValues, fields: FieldDef[]): { name: string; steps: PolicyStep[] } {
  for (const r of body.rules) {
    let pass = false;
    try {
      pass = evaluate(r.when, values, fields).pass;
    } catch {
      pass = false; // a rule on a value the type no longer sends never matches
    }
    if (pass) return { name: r.name, steps: r.steps };
  }
  return { name: OTHERWISE, steps: body.steps };
}

/** A company step as the engine's: a reminder and escalation (to the approver's manager) after the company's hours. */
export function toStepSpec(s: PolicyStep, remindHours: number, escalateHours: number, ranks: ReadonlyMap<string, number> = new Map()): StepSpec {
  const approvers: ApproverSpec[] =
    s.approver === 'hr'
      ? [{ kind: 'hr' }]
      : s.approver === 'users'
        ? [{ kind: 'users', userIds: s.userIds ?? [] }]
        : s.approver === 'group'
          ? [{ kind: 'user_group', groupId: s.groupId! }]
          : s.approver === 'key_holders'
            ? [{ kind: 'key_holders', key: s.key!, scope: s.scope! }]
            : s.approver === 'chain_grade'
              ? // A grade archived since the save ranks above everyone, so the step falls to the fallback people.
                [{ kind: 'chain_until', until: 'grade', gradeRank: ranks.get(s.gradeId!) ?? 1_000_000 }]
              : s.approver === 'chain_limit'
                ? [{ kind: 'chain_until', until: 'limit', family: s.family! }]
                : s.approver === 'hiring_manager'
                  ? [{ kind: 'hiring_manager' }]
                  : [{ kind: 'manager', level: s.approver === 'manager_2' ? 2 : 1 }];
  // E2 review item 3: a company's own step never allows self-approval (only a module's built-in sole-approver path may).
  return { name: s.name, approvers, mode: s.mode, ...(s.mode === 'count' ? { count: s.count } : {}), remindAfterHours: remindHours, timeoutHours: escalateHours, onTimeout: 'escalate', selfApproval: 'never' };
}

const APPROVER_WORDS: Record<PolicyApprover, string> = {
  manager: 'Manager',
  manager_2: "Manager's manager",
  hr: 'HR Admins',
  users: 'Named people',
  group: 'A group',
  key_holders: 'Key holders',
  chain_grade: 'Up the chain to a grade',
  chain_limit: 'Up the chain to the approval limit',
  hiring_manager: 'Hiring manager',
};
const routeWords = (steps: PolicyStep[]) => steps.map((s) => APPROVER_WORDS[s.approver]).join(' → ');

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
  'ats.requisition': 'The steps under Hiring › Approvals until they move here; "Outside the plan" when a requisition is outside the plan; Recruiting when a manager raises one with no route',
  'ats.offer': 'The steps under Hiring › Approvals until they move here; an extra step when the pay is above the range',
  'ats.headcount_plan': 'Finance and HR',
  'org.position_change': 'Whoever manages positions',
  'payroll.one_time': 'Payroll approval (a holder of payroll.run.approve who did not enter it)',
  'payroll.loan': 'Payroll approval (a holder of payroll.loan.approve)',
  'payroll.run': 'Payroll approval: a holder of payroll.run.approve who made none of its inputs and is not paid by it',
  'payroll.period_reopen': 'Payroll approval, decided on the pay period page with a second sign-in step',
  'payroll.correction': 'Payroll approval, by someone other than who made the correction',
  'payroll.payment_mode': 'Payroll approval',
  'payroll.reports_access': 'Payroll approval',
  'exit.resignation': 'Manager, then HR',
  'exit.company': 'HR',
  'exit.withdrawal': 'Manager, then HR',
  'exit.notice_change': 'HR',
  'letter.issue': "The letter template's approvers",
};

/** The types whose built-in steps take the company's reminder hours (answer 1765: people requests). */
const PEOPLE_GROUPS = new Set(['Time and leave', 'Expenses']);

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

type Ctx = { organizationId: string | null; userId?: string | null };
const ctxOf = (ctx: Ctx) => companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null });
const today = () => todayIst();
const bodyOf = (r: { steps: Prisma.JsonValue; rules: Prisma.JsonValue }): PolicyBody => ({ steps: r.steps as unknown as PolicyStep[], rules: (r.rules ?? []) as unknown as PolicyRule[] });

/**
 * The company's approval policies (answer 1330, widened by E2), on the shared approvals engine: for each listed request
 * type, its rules and otherwise steps, or the module's built-in ones. Changes apply to new requests only (a request
 * keeps the route it was sent with).
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
    if (!PEOPLE_GROUPS.has(TYPES.get(type)?.group ?? '') || !steps.length) return steps;
    const h = await this.hours(tx, c);
    return withCompanyHours(steps, h.remind, h.escalate);
  }

  /** The route a policy body gives these values, as the engine's steps. */
  async choose(tx: Tx, c: CompanyContext, type: string, body: PolicyBody, version: number, values: RecordValues, fields: FieldDef[]): Promise<ChosenRoute> {
    const h = await this.hours(tx, c);
    const picked = pick(body, values, fields);
    const gradeIds = picked.steps.flatMap((s) => (s.gradeId ? [s.gradeId] : []));
    const ranks = new Map(gradeIds.length ? (await tx.grade.findMany({ where: { organizationId: c.organizationId, id: { in: gradeIds }, archivedAt: null }, select: { id: true, rank: true } })).map((g) => [g.id, g.rank] as const) : []);
    return { steps: picked.steps.map((s) => toStepSpec(s, h.remind, h.escalate, ranks)), version, addOn: TYPES.get(type)?.mode === 'addon', rule: picked.name };
  }

  /** The route to use for this request at this company, or null for the module's built-in steps. */
  async stepsFor(tx: Tx, c: CompanyContext, type: string, values: RecordValues = {}, fields: FieldDef[] = declaredFields(type)): Promise<ChosenRoute | null> {
    const t = TYPES.get(type);
    if (!t || t.mode === 'locked') return null;
    const row = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
    return row ? this.choose(tx, c, type, bodyOf(row), row.version, values, fields) : null;
  }

  /** Whether the company has its own policy for the type (hiring then sends every requisition and offer through it). */
  async has(tx: Tx, c: CompanyContext, type: string): Promise<boolean> {
    return Boolean(await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type }, select: { id: true } }));
  }

  async list(ctx: Ctx) {
    const c = ctxOf(ctx);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await tx.approvalPolicy.findMany({ where: { organizationId: c.organizationId } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.updatedBy ? [r.updatedBy] : [])) } }, select: { id: true, name: true, email: true } });
      const h = await this.hours(tx, c);
      return {
        remindHours: h.remind,
        escalateHours: h.escalate,
        types: POLICY_TYPES.map((t) => {
          const r = t.mode === 'locked' ? undefined : rows.find((x) => x.requestType === t.key);
          const body = r ? bodyOf(r) : null;
          const by = r?.updatedBy ? users.find((u) => u.id === r.updatedBy) : undefined;
          return {
            key: t.key,
            label: t.label,
            group: t.group,
            mode: t.mode,
            fields: conditionFields(t.key),
            family: familyOf(t.key),
            payKey: PAY_APPROVE_KEYS[t.key] ?? null,
            steps: body?.steps ?? null,
            rules: body?.rules ?? [],
            builtIn: BUILT_IN_WORDS[t.key] ?? '',
            approvers: body ? [...body.rules.map((x) => `${x.name}: ${routeWords(x.steps)}`), `${body.rules.length ? `${OTHERWISE}: ` : ''}${routeWords(body.steps)}`].join('; ') : BUILT_IN_WORDS[t.key]!,
            version: r?.version ?? 0,
            updatedBy: by ? by.name?.trim() || by.email : null,
            updatedAt: r?.updatedAt.toISOString() ?? null,
          };
        }),
      };
    });
  }

  /** Saves the type's rules and otherwise steps as a new version (version: the one the editor opened; 0 for none). Audited. */
  async save(ctx: Ctx, type: string, input: { steps?: unknown; rules?: unknown }, version: number) {
    if (!ctx.userId) throw new ForbiddenException('Sign in to change approval policies.');
    const c = ctxOf(ctx);
    const t = TYPES.get(type);
    const raw = [...(Array.isArray(input.steps) ? input.steps : []), ...(Array.isArray(input.rules) ? input.rules.flatMap((r) => (Array.isArray((r as PolicyRule)?.steps) ? (r as PolicyRule).steps : [])) : [])] as Partial<PolicyStep>[];
    // Review item 4: the pay key check comes first, so someone without it learns nothing more about pay types.
    if (PAY_APPROVE_KEYS[type]) await this.tenantPrisma.forTenant(c, (tx) => this.payKeyOfEditor(tx, c, type));
    if (!t) throw new NotFoundException('This request type has no approval policy here.');
    if (t.mode === 'locked') throw new BadRequestException(`${t.label} approvals are built in and cannot change.`);
    const body = checkBody(type, input);
    await this.tenantPrisma.forTenant(c, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-policy:${c.organizationId}:${type}`}))`;
      await this.checkCompany(tx, c, type, [...body.steps, ...body.rules.flatMap((r) => r.steps)]);
      if (PAY_APPROVE_KEYS[type]) await this.payGuard(tx, c, type, raw);
      const before = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
      if ((before?.version ?? 0) !== version) throw new ConflictException('Someone changed this policy since you opened it. Open it again.');
      const data = { steps: body.steps as unknown as Prisma.InputJsonValue, rules: body.rules as unknown as Prisma.InputJsonValue };
      if (before) await tx.approvalPolicy.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.userId!, updatedAt: new Date() } });
      else await tx.approvalPolicy.create({ data: { organizationId: c.organizationId, requestType: type, ...data, version: 1, updatedBy: ctx.userId! } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.policy.changed', entityType: 'approval_policy', entityId: type, metadata: { type, before: before ? { steps: before.steps, rules: before.rules } : null, after: body, version: version + 1 } as unknown as Record<string, unknown> });
    });
    return this.list(ctx);
  }

  /**
   * E2 part 5: what a policy may not do in this company. Refused: a limit step whose family has no limits yet; grades
   * that share a rank in one legal entity (the chain compares ranks); "all" or a number on key holders or a group that can
   * be more than 25 people; a group or person the company does not have; a key no role has.
   */
  async checkCompany(tx: Tx, c: CompanyContext, type: string, steps: PolicyStep[]) {
    const org = c.organizationId;
    for (const family of new Set(steps.flatMap((s) => (s.approver === 'chain_limit' && s.family ? [s.family] : [])))) {
      if (!(await tx.approvalLimit.count({ where: { organizationId: org, family } }))) throw new BadRequestException(`Set the approval limits for ${LIMIT_FAMILIES[family]!.label.toLowerCase()} first (Settings › Approval limits).`);
    }
    if (steps.some((s) => s.approver === 'chain_grade' || s.approver === 'chain_limit')) {
      const grades = await tx.grade.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, rank: true, ownerLegalEntityId: true, appliesToEntities: true } });
      for (const id of steps.flatMap((s) => (s.gradeId ? [s.gradeId] : []))) if (!grades.some((g) => g.id === id)) throw new BadRequestException('Choose a grade the company has.');
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true } });
      for (const e of entities) {
        const here = grades.filter((g) => !g.ownerLegalEntityId || g.ownerLegalEntityId === e.id || g.appliesToEntities.includes(e.id));
        const twin = here.find((g, i) => here.some((h, k) => k > i && h.rank === g.rank));
        if (twin) {
          const other = here.find((h) => h.id !== twin.id && h.rank === twin.rank)!;
          throw new BadRequestException(`Grades ${twin.name} and ${other.name} share rank ${twin.rank} in ${e.name}, so the chain cannot tell which is higher. Give each grade its own rank first (Settings › Grades).`);
        }
      }
    }
    for (const s of steps) {
      if (s.approver === 'group') {
        const g = await tx.userGroup.findFirst({ where: { organizationId: org, id: s.groupId! }, select: { id: true, name: true } });
        if (!g) throw new BadRequestException(`"${s.name}": that group is not in this company. Choose another group.`);
        if (s.mode !== 'any' && (await tx.userGroupMember.count({ where: { organizationId: org, groupId: g.id } })) > MAX_HOLDERS) throw new BadRequestException(`"${s.name}": ${g.name} has more than ${MAX_HOLDERS} people, so "All" or a number cannot be used. Choose "Any one".`);
      }
      if (s.approver === 'users') {
        const found = await tx.user.count({ where: { organizationId: org, id: { in: s.userIds }, status: 'active' } });
        if (found !== s.userIds!.length) throw new BadRequestException(`"${s.name}": choose people who are active in this company.`);
      }
      if (s.approver === 'key_holders') {
        if (!(await tx.permission.findFirst({ where: { key: s.key! }, select: { key: true } }))) throw new BadRequestException(`"${s.name}": ${s.key} is not a key in YukthiX.`);
        // 2788: the holders change with the request's place; "all" or a number is refused when they can be more than 25.
        if (s.mode !== 'any' && (await this.holderCount(tx, org, s.key!)) > MAX_HOLDERS) throw new BadRequestException(`"${s.name}": more than ${MAX_HOLDERS} people can hold ${s.key}, so "All" or a number cannot be used. Choose "Any one".`);
      }
      if (s.mode === 'count' && s.approver === 'users' && s.count! > s.userIds!.length) throw new BadRequestException(`"${s.name}": you chose ${s.userIds!.length} people, so at most ${s.userIds!.length} can be asked to approve.`);
    }
  }

  /** Everyone who may hold a key here, in any place (a profile or a grant in force). */
  private async holderCount(tx: Tx, org: string, key: string): Promise<number> {
    const like = `%"${key}"%`;
    const d = today();
    const [n] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT x.id) AS n FROM (
        SELECT u.id FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
        WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
        UNION
        SELECT g.user_id FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
        JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
        WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
          AND g.valid_from <= ${d}::date AND (g.valid_to IS NULL OR g.valid_to >= ${d}::date)) x`;
    return Number(n?.n ?? 0);
  }

  /** Review item 4: changing who approves a pay type needs the area's approve key in every legal entity. */
  private async payKeyOfEditor(tx: Tx, c: CompanyContext, type: string) {
    const key = PAY_APPROVE_KEYS[type]!;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id);
    if (!(await holdKeyEverywhere(tx, c.organizationId, [c.userId!], key, entities, today())).has(c.userId!)) throw new ForbiddenException(`Changing who approves this needs ${key} in every legal entity of the company.`);
  }

  /**
   * E2 review item 4: on a pay type, every person a step can route to must hold the type's approve key everywhere: named
   * people, a group's members and the HR Admins are checked now; key holders must be of that key; approvers worked out
   * later (managers, the chain) cannot be checked, so they are refused.
   */
  async payGuard(tx: Tx, c: CompanyContext, type: string, steps: Partial<PolicyStep>[]) {
    const key = PAY_APPROVE_KEYS[type]!;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id);
    for (const s of steps) {
      if (s.approver === 'key_holders' && s.key !== key) throw new BadRequestException(`"${s.name}": on pay approvals, key holders must hold ${key}.`);
      if (['manager', 'manager_2', 'chain_grade', 'chain_limit', 'hiring_manager'].includes(String(s.approver))) throw new BadRequestException(`"${s.name}": on pay approvals choose named people, a group, the HR Admins or holders of ${key}, so everyone can be checked for the key now.`);
    }
    const named = [...new Set(steps.flatMap((s) => (s.approver === 'users' ? (s.userIds ?? []) : [])))];
    const groups = steps.flatMap((s) => (s.approver === 'group' && s.groupId ? [s.groupId] : []));
    const members = groups.length ? (await tx.userGroupMember.findMany({ where: { organizationId: c.organizationId, groupId: { in: groups } }, select: { userId: true } })).map((m) => m.userId) : [];
    let hr: string[] = [];
    if (steps.some((s) => s?.approver === 'hr')) {
      const profiles = (await tx.permissionProfile.findMany({ where: { organizationId: c.organizationId, permissionsJson: { contains: '"org.settings.manage"' } }, select: { id: true } })).map((p) => p.id);
      hr = [...(await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', permissionProfileId: { in: profiles } }, select: { id: true } })).map((u) => u.id), ...(await tx.roleGrant.findMany({ where: { organizationId: c.organizationId, status: 'active', permissionProfileId: { in: profiles } }, select: { userId: true } })).map((g) => g.userId)];
    }
    const all = [...new Set([...named, ...members, ...hr])];
    const ok = await holdKeyEverywhere(tx, c.organizationId, all, key, entities, today());
    const without = all.filter((u) => !ok.has(u));
    if (without.length) {
      const names = (await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: without } }, select: { name: true, email: true }, take: 5 })).map((u) => u.name?.trim() || u.email);
      const what = hr.some((u) => without.includes(u)) && !named.some((u) => without.includes(u)) && !members.some((u) => without.includes(u)) ? 'An "HR Admins" step' : 'These steps';
      throw new BadRequestException(`${what} would route pay approvals to people without ${key}: ${names.join(', ')}${without.length > 5 ? ' and others' : ''}. Choose approvers who hold it.`);
    }
  }

  /** Back to the module's built-in steps. Audited. */
  async reset(ctx: Ctx, type: string, version: number) {
    if (!ctx.userId) throw new ForbiddenException('Sign in to change approval policies.');
    const c = ctxOf(ctx);
    if (PAY_APPROVE_KEYS[type]) await this.tenantPrisma.forTenant(c, (tx) => this.payKeyOfEditor(tx, c, type));
    const t = TYPES.get(type);
    if (!t || t.mode === 'locked') throw new NotFoundException('This request type has no approval policy here.');
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const before = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
      if (!before) return;
      if (before.version !== version) throw new ConflictException('Someone changed this policy since you opened it. Open it again.');
      await tx.approvalPolicy.delete({ where: { id: before.id } });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.policy.reset', entityType: 'approval_policy', entityId: type, metadata: { type, before: { steps: before.steps, rules: before.rules }, after: null } as unknown as Record<string, unknown> });
    });
    return this.list(ctx);
  }

  /**
   * E2 part 5 "Try it" (PLT-57): the route a request would take, on typed sample values or on a past request of the type
   * that kept its values, through the engine's own route() (the function submit uses). With `draft`, the unsaved policy
   * is tried instead of the saved one. Nothing is saved or sent.
   */
  async tryIt(ctx: Ctx, engine: ApprovalsEngine, type: string, input: { values?: Record<string, unknown>; requestId?: string; personId?: string; draft?: { steps?: unknown; rules?: unknown } }) {
    const c = ctxOf(ctx);
    const t = TYPES.get(type);
    if (!t) throw new NotFoundException('This request type has no approval policy here.');
    const draft = input.draft ? checkBody(type, input.draft) : null;
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const fields = declaredFields(type);
      let sub: SubmitInput;
      if (input.requestId) {
        const r = await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, id: input.requestId, requestType: type } });
        if (!r) throw new NotFoundException('That request is not one of this type.');
        const frozen = r.steps as unknown as FrozenStep[];
        sub = {
          type,
          subjectType: r.subjectType,
          subjectId: r.subjectId,
          title: r.title,
          summary: [],
          subjectPersonId: r.subjectPersonId,
          requesterUserId: r.requesterUserId,
          raisedByUserId: r.raisedByUserId,
          // The module's steps of that request as it froze them, with their people. When a company policy routed it, only
          // the required ones are known to be the module's.
          steps: frozen.filter((s) => r.policyVersion === null || s.required).map((s) => ({ ...s, approvers: [{ kind: 'users', userIds: s.approverIds }] })),
          payload: r.payload as RecordValues,
          payloadFields: [],
          fallbackUserIds: [],
          alwaysRoute: true,
        };
      } else {
        const values: Record<string, string | number> = {};
        for (const f of conditionFields(type)) {
          const v = input.values?.[f.key];
          if (v === undefined || v === null || v === '') continue;
          if ((f.type === 'number' || f.type === 'money') && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e12)) throw new BadRequestException(`Enter a number for "${f.label}".`);
          if (f.type === 'choice' && !f.options?.some((o) => o.value === v)) throw new BadRequestException(`Choose one of the values of "${f.label}".`);
          values[f.key] = v as string | number;
        }
        const person = input.personId ? await tx.person.findFirst({ where: { organizationId: c.organizationId, id: input.personId }, select: { id: true } }) : null;
        if (input.personId && !person) throw new NotFoundException('That person is not in this company.');
        const emp = person ? await tx.employee.findFirst({ where: { organizationId: c.organizationId, personId: person.id }, select: { userId: true } }) : null;
        sub = { type, subjectType: 'try', subjectId: '00000000-0000-0000-0000-000000000000', title: 'Try it', summary: [], subjectPersonId: person?.id ?? null, requesterUserId: emp?.userId ?? null, raisedByUserId: emp?.userId ?? null, steps: [], payload: values, payloadFields: [], fallbackUserIds: [], alwaysRoute: true };
      }
      const row = await tx.approvalPolicy.findFirst({ where: { organizationId: c.organizationId, requestType: type } });
      const body = draft ?? (row && t.mode !== 'locked' ? bodyOf(row) : null);
      const chosen = body ? await this.choose(tx, c, type, body, row?.version ?? 0, sub.payload, fields) : null;
      const out = await engine.route(tx, c, sub, chosen);
      const ids = [...new Set(out.steps.flatMap((s) => s.approverIds))];
      const names = new Map((ids.length ? await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: ids } }, select: { id: true, name: true, email: true } }) : []).map((u) => [u.id, u.name?.trim() || u.email]));
      const companySteps = new Set(chosen?.steps.map((s) => s.name) ?? []);
      return {
        rule: out.rule,
        values: Object.fromEntries(conditionFields(type).map((f) => [f.key, (sub.payload as Record<string, unknown>)[f.key] ?? null])),
        // On sample values the module's own steps are not known (it adds them at submit): say so in words.
        builtIn: input.requestId ? null : t.mode === 'addon' || !chosen ? (BUILT_IN_WORDS[type] ?? null) : null,
        steps: out.steps.map((s) => ({
          name: s.name,
          from: companySteps.has(s.name) && !s.required ? 'company' : s.required ? 'required' : 'built_in',
          state: s.state,
          need: s.need,
          approvers: s.approverIds.map((id) => names.get(id) ?? 'Someone'),
          fallback: out.noApprover.includes(s.name),
          nobody: out.empty.includes(s.name),
        })),
      };
    });
  }

  /** Settings › Approval limits (PLT-34): per family, each grade's largest amount, with the grades to choose from. */
  async limits(ctx: Ctx) {
    const c = ctxOf(ctx);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const [rows, grades] = await Promise.all([
        tx.approvalLimit.findMany({ where: { organizationId: c.organizationId } }),
        tx.grade.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, select: { id: true, name: true, code: true, rank: true }, orderBy: [{ rank: 'asc' }, { name: 'asc' }] }),
      ]);
      const by = new Set(rows.map((r) => r.updatedBy));
      const users = by.size ? await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: [...by] } }, select: { id: true, name: true, email: true } }) : [];
      return {
        grades: grades.map((g) => ({ id: g.id, name: g.name, code: g.code, rank: g.rank })),
        families: Object.entries(LIMIT_FAMILIES).map(([key, f]) => {
          const mine = rows.filter((r) => r.family === key);
          const last = mine.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
          const u = last ? users.find((x) => x.id === last.updatedBy) : undefined;
          return { key, label: f.label, payKey: key === 'pay' ? 'payroll.run.approve' : null, rows: mine.map((r) => ({ gradeId: r.gradeId, amount: r.amount.toFixed(2) })), updatedBy: u ? u.name?.trim() || u.email : null, updatedAt: last?.updatedAt.toISOString() ?? null };
        }),
      };
    });
  }

  /** Replaces a family's limits (a grade left out has none). The pay family needs the pay approve key everywhere. Audited. */
  async saveLimits(ctx: Ctx, family: string, input: unknown) {
    if (!ctx.userId) throw new ForbiddenException('Sign in to change approval limits.');
    const c = ctxOf(ctx);
    if (!LIMIT_FAMILIES[family]) throw new NotFoundException('There are no approval limits of that kind.');
    if (family === 'pay') await this.tenantPrisma.forTenant(c, (tx) => this.payKeyOfEditor(tx, c, 'payroll.one_time'));
    if (!Array.isArray(input) || input.length > 200) throw new BadRequestException('Give up to 200 grades.');
    const rows = input.map((raw, i) => {
      const r = (raw ?? {}) as { gradeId?: unknown; amount?: unknown };
      const amount = typeof r.amount === 'number' ? r.amount : typeof r.amount === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(r.amount) ? Number(r.amount) : NaN;
      if (typeof r.gradeId !== 'string' || !UUID.test(r.gradeId)) throw new BadRequestException(`Row ${i + 1}: choose a grade.`);
      if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999.99) throw new BadRequestException(`Row ${i + 1}: enter an amount of ₹0 or more.`);
      return { gradeId: r.gradeId, amount: amount.toFixed(2) };
    });
    if (new Set(rows.map((r) => r.gradeId)).size !== rows.length) throw new BadRequestException('Give each grade once.');
    await this.tenantPrisma.forTenant(c, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-limits:${c.organizationId}:${family}`}))`;
      const known = await tx.grade.count({ where: { organizationId: c.organizationId, archivedAt: null, id: { in: rows.map((r) => r.gradeId) } } });
      if (known !== rows.length) throw new BadRequestException('Choose grades the company has.');
      const before = await tx.approvalLimit.findMany({ where: { organizationId: c.organizationId, family }, select: { gradeId: true, amount: true } });
      // A policy that goes up the chain to the limit must keep having limits to go by.
      if (!rows.length && (await this.limitUsers(tx, c.organizationId, family)).length) throw new BadRequestException(`Approval policies go up the chain to these limits (${(await this.limitUsers(tx, c.organizationId, family)).join(', ')}). Change those first, or keep at least one limit.`);
      await tx.approvalLimit.deleteMany({ where: { organizationId: c.organizationId, family } });
      if (rows.length) await tx.approvalLimit.createMany({ data: rows.map((r) => ({ organizationId: c.organizationId, family, gradeId: r.gradeId, amount: r.amount, updatedBy: ctx.userId! })) });
      await AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'workflow.limits.changed', entityType: 'approval_limit', entityId: family, metadata: { family, before: before.map((b) => ({ gradeId: b.gradeId, amount: b.amount.toFixed(2) })), after: rows } });
    });
    return this.limits(ctx);
  }

  /** The labels of request types whose saved policy goes up the chain to this family's limits. */
  private async limitUsers(tx: Tx, org: string, family: string): Promise<string[]> {
    const rows = await tx.approvalPolicy.findMany({ where: { organizationId: org, requestType: { in: LIMIT_FAMILIES[family]!.types } } });
    return rows.filter((r) => [...bodyOf(r).steps, ...bodyOf(r).rules.flatMap((x) => x.steps)].some((s) => s.approver === 'chain_limit')).map((r) => TYPES.get(r.requestType)?.label ?? r.requestType);
  }
}
