import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { EmployeeHistoryService, displayName } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LettersService } from '../documents/letters/letters.service';
import { ownOf, reachesPerson } from '../documents/person-access';
import { settingFor } from '../people/probation';
import { holdersOf } from '../time/time-core';
import { ExitsService } from './exits.service';
import { addDaysIso } from './exit-rules';
import { freezeSettlementIn } from './settlement';

// Lifecycle batch 6e, the exit special cases (M01 §3.7; design §16.5):
//   death         (LIFE-5.04, YX-LC-16) the payees: the nominations, else legal heirs with a succession certificate;
//                 shares make 100 %; the payroll hand-off carries them; the exit cannot close without them;
//   absconding    (LIFE-5.05, YX-LC-17) the company's timeline (starter day 3 hold + alert, day 7 and 14 notices, day 21
//                 deemed abandonment with LWD = last day present), started by HR or from the attendance engine's
//                 unauthorised absence; HR stops or resumes it at any step; every step audited;
//   retirement /  (LIFE-5.06, YX-LC-19 / 20) the retirement exit opens N months ahead (age per type / grade, last day =
//   contract end  end of that month); a fixed-term contract reminds HR and the manager 30 and 7 days ahead and, where the
//                 policy says auto-exit, opens the end-of-contract exit; HR extends or converts instead;
//   retrenchment  (LIFE-5.07, YX-LC-27) the government permission requests (retrenchment, lay-off, closure), a closure's
//                 bulk exits; VRS schemes.
// The M03 salary hold of an absconding employee is not built yet: the step says so and HR is told.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const KEYS = ['lifecycle.exit.view', 'lifecycle.exit.manage', 'employee.change.manage', 'document.view'] as const;
type Step = { key: 'hold' | 'notice_1' | 'notice_2' | 'abandoned'; day: number; dueOn: string; doneAt: string | null; note: string | null; dispatchRef: string | null };
const STEP_LABEL: Record<Step['key'], string> = { hold: 'Salary hold and alert', notice_1: 'Notice 1', notice_2: 'Notice 2 (final)', abandoned: 'Deemed abandonment' };

/** The end of the month in which someone reaches `age` (YX-LC-20 starter rule). */
export function retirementDay(dob: string, age: number): string {
  const [y, m] = dob.split('-').map(Number);
  return new Date(Date.UTC(y + age, m, 0)).toISOString().slice(0, 10);
}

@Injectable()
export class ExitExtrasService {
  private readonly logger = new Logger(ExitExtrasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly exits: ExitsService,
    private readonly letters: LettersService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private async managedCase(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, id } });
    const own = await ownOf(tx, c, v);
    if (!k || v.actingForOther || own.employeeId === k.employeeId || !(await reachesPerson(tx, c, v, 'lifecycle.exit.manage', k.personId, own))) throw new NotFoundException('No such exit.');
    return k;
  }

  private async managedEmployee(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, key = 'lifecycle.exit.manage') {
    const emp = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId } });
    const own = await ownOf(tx, c, v);
    if (!emp || v.actingForOther || own.employeeId === emp.id || !(await reachesPerson(tx, c, v, key, emp.personId, own))) throw new NotFoundException('No such employee.');
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, exitedOn: null } });
    if (!e) throw new NotFoundException('No open employment for that employee.');
    return { emp, e };
  }

  private entityAdmin(v: Viewer, legalEntityId: string) {
    if (!v.grants.has('lifecycle.exit.manage') || v.actingForOther) throw new ForbiddenException('You cannot manage exits.');
    if (!tenantWide(v, 'lifecycle.exit.manage') && !(v.scopes.get('lifecycle.exit.manage') ?? []).some((s) => s.type === 'legal_entity' && s.id === legalEntityId)) throw new ForbiddenException('You cannot manage exits of that legal entity.');
  }

  private async tell(org: string, users: (string | null)[], text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, 'exit.case.update', { entityType: 'exit_case', entityId: org, contextText: text, linkPath: link }, { subject: 'An exit needs your attention', html: '<p>An exit needs your attention in YukthiX.</p>' }).catch(() => undefined);
  }

  private async managerUser(tx: Tx, org: string, employmentId: string) {
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId, supersededAt: null }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } });
    return a?.managerEmployeeId ? ((await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { userId: true } }))?.userId ?? null) : null;
  }

  // ------------------------------------------------------------------------------------------ death: payees (LIFE-5.04)

  async payees(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.managedCase(tx, c, v, id);
      return this.payeesIn(tx, c.organizationId, k.id);
    });
  }

  private async payeesIn(tx: Tx, org: string, exitCaseId: string) {
    const rows = await tx.exitPayee.findMany({ where: { organizationId: org, exitCaseId, removedAt: null }, orderBy: { createdAt: 'asc' } });
    const total = rows.reduce((s, r) => s + Number(r.sharePercent), 0);
    return { payees: rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, relation: r.relation, sharePercent: r.sharePercent.toFixed(2), email: r.email, documentId: r.documentId })), total: total.toFixed(2), complete: rows.length > 0 && Math.abs(total - 100) < 0.005 };
  }

  /** Replaces the payee list (the old rows are kept, marked removed). Legal heirs need a succession certificate. */
  async setPayees(ctx: TenantContext, user: ScopeUser, id: string, list: { kind: 'nominee' | 'legal_heir'; name: string; relation: string; sharePercent: string; email?: string | null; documentId?: string | null }[]) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await this.managedCase(tx, c, v, id);
      if (k.exitType !== 'death') throw new BadRequestException('Payees are for a death in service.');
      const total = list.reduce((s, p) => s + Number(p.sharePercent), 0);
      if (list.length && Math.abs(total - 100) >= 0.005) throw new BadRequestException(`The shares make ${total.toFixed(2)} %. They must make 100 %.`);
      for (const p of list) {
        if (p.kind === 'legal_heir') {
          const d = p.documentId ? await tx.document.findFirst({ where: { organizationId: org, id: p.documentId, personId: k.personId, typeKey: 'succession_certificate' } }) : null;
          if (!d) throw new BadRequestException(`${p.name}: a legal heir needs the succession or legal-heir certificate uploaded to the record first.`);
        }
      }
      await tx.exitPayee.updateMany({ where: { organizationId: org, exitCaseId: id, removedAt: null }, data: { removedAt: new Date() } });
      if (list.length) await tx.exitPayee.createMany({ data: list.map((p) => ({ organizationId: org, exitCaseId: id, kind: p.kind, name: p.name.trim(), relation: p.relation.trim(), sharePercent: new Prisma.Decimal(p.sharePercent), email: p.email?.trim().toLowerCase() || null, documentId: p.documentId ?? null, createdBy: c.userId ?? null })) });
      if (k.approvedLwd) await freezeSettlementIn(tx, c, id, 'payees');
      await audit(tx, c, 'exit.payees.set', 'exit_case', id, { count: list.length, kinds: list.map((p) => p.kind) });
      return this.payeesIn(tx, org, id);
    });
  }

  // ------------------------------------------------------------------------------------------ absconding (LIFE-5.05)

  private async timelineSteps(tx: Tx, c: CompanyContext, legalEntityId: string, lastPresentOn: string): Promise<Step[]> {
    const days = (await settingFor(tx, c, 'absconding.days', { legalEntityId })).split(',').map(Number);
    return (['hold', 'notice_1', 'notice_2', 'abandoned'] as const).map((key, i) => ({ key, day: days[i], dueOn: addDaysIso(lastPresentOn, days[i]), doneAt: null, note: null, dispatchRef: null }));
  }

  async startAbsconding(ctx: TenantContext, user: ScopeUser, dto: { employeeId: string; lastPresentOn: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e } = await this.managedEmployee(tx, c, v, dto.employeeId);
      return this.startAbscondingIn(tx, c, e, dto.lastPresentOn, 'hr');
    });
  }


  private async startAbscondingIn(tx: Tx, c: CompanyContext, e: Prisma.EmploymentGetPayload<object>, lastPresentOn: string, by: 'hr' | 'attendance') {
    const org = c.organizationId;
    if (lastPresentOn >= todayIst()) throw new BadRequestException('The last day present is before today.');
    if (lastPresentOn < iso(e.joinedOn)) throw new BadRequestException('The last day present is before they joined.');
    if (await tx.abscondingTimeline.findFirst({ where: { organizationId: org, employmentId: e.id, status: 'running' }, select: { id: true } })) throw new ConflictException('A timeline is already running for this person.');
    if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: ['submitted', 'accepted', 'cleared'] } }, select: { id: true } })) throw new ConflictException('This person already has an exit in progress.');
    const t = await tx.abscondingTimeline.create({ data: { organizationId: org, employmentId: e.id, employeeId: e.employeeId, lastPresentOn: asDate(lastPresentOn), steps: (await this.timelineSteps(tx, c, e.legalEntityId, lastPresentOn)) as unknown as Prisma.InputJsonValue, createdBy: c.userId ?? null } });
    await audit(tx, c, 'absconding.started', 'employee', e.employeeId, { timelineId: t.id, lastPresentOn, by });
    return { id: t.id };
  }

  private async timelineOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const t = await tx.abscondingTimeline.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!t) throw new NotFoundException('No such timeline.');
    await this.managedEmployee(tx, c, v, t.employeeId).catch(async (err) => {
      // An abandoned timeline's person has left: still HR's to read.
      if (t.status !== 'abandoned') throw err;
    });
    return t;
  }

  async abscondingList(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('lifecycle.exit.manage')) throw new ForbiddenException('You cannot see absconding timelines.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.abscondingTimeline.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 200 });
      const out = [];
      for (const t of rows) {
        const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: t.employeeId } });
        const own = await ownOf(tx, c, v);
        if (own.employeeId === emp.id || !(await reachesPerson(tx, c, v, 'lifecycle.exit.manage', emp.personId, own))) continue;
        out.push({ id: t.id, employeeId: t.employeeId, name: displayName(emp), lastPresentOn: iso(t.lastPresentOn), status: t.status, stoppedReason: t.stoppedReason, exitCaseId: t.exitCaseId, version: t.version, steps: (t.steps as unknown as Step[]).map((s) => ({ ...s, label: STEP_LABEL[s.key] })) });
      }
      return { today: todayIst(), rows: out };
    });
  }

  async stopAbsconding(ctx: TenantContext, user: ScopeUser, id: string, dto: { reason: string; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.timelineOr404(tx, c, v, id);
      if (t.status !== 'running' || t.version !== dto.version) throw new ConflictException('This timeline is not running or changed meanwhile.');
      await tx.abscondingTimeline.update({ where: { id }, data: { status: 'stopped', stoppedReason: dto.reason.trim(), version: { increment: 1 } } });
      // The salary hold is released with the M03 hold, when payroll is built; the attendance fix stays with M02.
      await audit(tx, c, 'absconding.stopped', 'employee', t.employeeId, { timelineId: id, reason: dto.reason.trim() });
      return { ok: true };
    });
  }

  async resumeAbsconding(ctx: TenantContext, user: ScopeUser, id: string, dto: { version: number }) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.timelineOr404(tx, c, v, id);
      if (t.status !== 'stopped' || t.version !== dto.version) throw new ConflictException('This timeline is not stopped or changed meanwhile.');
      await tx.abscondingTimeline.update({ where: { id }, data: { status: 'running', stoppedReason: null, version: { increment: 1 } } });
      await audit(tx, c, 'absconding.resumed', 'employee', t.employeeId, { timelineId: id });
    });
    await this.runTimeline(ctx.organizationId!, id);
    return { ok: true };
  }

  /** HR records how a notice went by registered post (dispatch number), on the step. */
  async dispatch(ctx: TenantContext, user: ScopeUser, id: string, key: string, dto: { ref: string; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.timelineOr404(tx, c, v, id);
      if (t.version !== dto.version) throw new ConflictException('This timeline changed meanwhile. Reload it.');
      const steps = t.steps as unknown as Step[];
      const s = steps.find((x) => x.key === key && (x.key === 'notice_1' || x.key === 'notice_2'));
      if (!s || !s.doneAt) throw new BadRequestException('That notice has not gone out yet.');
      s.dispatchRef = dto.ref.trim().slice(0, 60);
      await tx.abscondingTimeline.update({ where: { id }, data: { steps: steps as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
      await audit(tx, c, 'absconding.dispatch', 'employee', t.employeeId, { timelineId: id, step: key });
      return { ok: true };
    });
  }

  /** Runs the steps that are due today or earlier (idempotent: a done step is never done again). */
  async runTimeline(org: string, id: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    let notices = 0;
    let due = false;
    let personId = '';
    const notify: string[] = [];
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const t = await tx.abscondingTimeline.findFirst({ where: { organizationId: org, id, status: 'running' } });
      if (!t) return;
      const steps = t.steps as unknown as Step[];
      const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: t.employmentId } });
      let status = t.status;
      let exitCaseId = t.exitCaseId;
      for (const s of steps) {
        if (s.doneAt || s.dueOn > today) continue;
        if (s.key === 'hold') {
          s.note = 'Salary hold: payroll holds come with M03. HR and the manager were told.';
        } else if (s.key === 'abandoned') {
          if (!e.exitedOn) exitCaseId = await this.exits.openSystemExitIn(tx, c, t.employeeId, 'absconding', iso(t.lastPresentOn), `Deemed abandonment: absent without leave since ${addDaysIso(iso(t.lastPresentOn), 1)}`);
          status = 'abandoned';
          s.note = 'Exit recorded; rehire is off (HR may change it).';
        } else {
          notices++;
          s.note = 'Notice issued in YukthiX; send it by email and registered post and record the dispatch number.';
        }
        s.doneAt = new Date().toISOString();
        due = true;
        await audit(tx, c, `absconding.${s.key}`, 'employee', t.employeeId, { timelineId: id, day: s.day });
      }
      await tx.abscondingTimeline.update({ where: { id }, data: { steps: steps as unknown as Prisma.InputJsonValue, status, exitCaseId, version: { increment: 1 } } });
      if (due) notify.push(...(await holdersOf(tx, org, 'lifecycle.exit.manage', t.employeeId, today)), (await this.managerUser(tx, org, e.id)) ?? '');
      personId = (await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: t.employeeId } })).personId;
    });
    // Each notice is a letter in YukthiX (the person's vault); HR also sends it by email and registered post.
    for (let i = 0; i < notices; i++) await this.letters.issueSystem(c, { letterType: 'absconding_notice', personId }).catch((err: Error) => this.logger.warn(`absconding notice: ${err.message}`));
    if (notify.length) await this.tell(org, notify, 'An absconding timeline step is due', '/yx/people/absconding');
  }

  /**
   * The daily part: open timelines run their due steps; and the attendance engine's unauthorised absence (M02 days
   * marked absent, with no leave, since the last day present) starts a timeline once the first step is due.
   */
  async abscondingSweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const running = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.abscondingTimeline.findMany({ where: { status: 'running' }, select: { id: true, organizationId: true } }));
    for (const r of running) await this.runTimeline(r.organizationId, r.id, today).catch((e) => this.logger.warn(`absconding ${r.id}: ${(e as Error).message}`));
    const absent = await this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.$queryRaw<{ organization_id: string; employee_id: string; last_present: Date }[]>`
        WITH last AS (
          SELECT organization_id, employee_id, max(work_on) FILTER (WHERE status IN ('present', 'half_day', 'leave')) AS last_present
          FROM attendance_days WHERE work_on >= ${today}::date - 60 GROUP BY organization_id, employee_id)
        SELECT l.organization_id::text, l.employee_id::text, l.last_present FROM last l
        WHERE l.last_present IS NOT NULL
          AND EXISTS (SELECT 1 FROM attendance_days d WHERE d.organization_id = l.organization_id AND d.employee_id = l.employee_id AND d.work_on > l.last_present AND d.status = 'absent')
          AND NOT EXISTS (SELECT 1 FROM absconding_timelines t JOIN employments m ON m.id = t.employment_id WHERE m.employee_id = l.employee_id AND t.last_present_on >= l.last_present)`,
    );
    for (const a of absent) {
      try {
        const c: CompanyContext = { organizationId: a.organization_id, isSuperAdmin: false, userId: null };
        const started = await this.tenantPrisma.forTenant(c, async (tx) => {
          const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: a.employee_id, exitedOn: null } });
          if (!e) return null;
          const first = (await this.timelineSteps(tx, c, e.legalEntityId, iso(a.last_present)))[0];
          if (first.dueOn > today) return null;
          return this.startAbscondingIn(tx, c, e, iso(a.last_present), 'attendance').catch(() => null);
        });
        if (started) await this.runTimeline(c.organizationId, started.id, today);
      } catch (e) {
        this.logger.warn(`absconding start ${a.employee_id}: ${(e as Error).message}`);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ retirement and contract end (LIFE-5.06)

  /** The daily part: retirement exits opening N months ahead; contract reminders at 30 and 7 days; auto-exit by policy. */
  async policySweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM employments WHERE exited_on IS NULL`);
    for (const { id: org } of orgs) {
      const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
      try {
        await this.tenantPrisma.forTenant(c, (tx) => this.policySweepIn(tx, c, today), { timeout: 60_000 });
      } catch (e) {
        this.logger.warn(`policy sweep ${org}: ${(e as Error).message}`);
      }
    }
  }

  /** One company's policy sweep (also what the tests run, so they never touch other companies). */
  policySweepOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, (tx) => this.policySweepIn(tx, c, today), { timeout: 60_000 });
  }

  private async policySweepIn(tx: Tx, c: CompanyContext, today: string) {
    const org = c.organizationId;
    const live = { status: { in: ['submitted', 'accepted', 'cleared'] } };
    for (const e of await tx.employment.findMany({ where: { organizationId: org, exitedOn: null } })) {
      if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, ...live }, select: { id: true } })) continue;
      const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null }, orderBy: { validFrom: 'desc' } });
      // Retirement.
      const dob = (await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: e.employeeId }, select: { dateOfBirth: true } }))?.dateOfBirth;
      if (dob) {
        const scope = { legalEntityId: e.legalEntityId, employmentTypeId: a?.employmentTypeId, gradeId: a?.gradeId };
        const day = retirementDay(iso(dob), Number(await settingFor(tx, c, 'retirement.age', scope)));
        const months = Number(await settingFor(tx, c, 'retirement.alert_months', scope));
        const opensOn = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 - months, Number(day.slice(8, 10)))).toISOString().slice(0, 10);
        if (today >= opensOn && day >= today) {
          const id = await this.exits.openSystemExitIn(tx, c, e.employeeId, 'retirement', day, 'Retirement age (company policy)');
          await audit(tx, c, 'exit.retirement.opened', 'exit_case', id, { lastDay: day });
          void this.tell(org, [...(await holdersOf(tx, org, 'lifecycle.exit.manage', e.employeeId, today)), (await this.managerUser(tx, org, e.id)) ?? ''], `A retirement exit opened (last day ${day})`, `/yx/people/exits/${id}`);
          continue;
        }
      }
      // Contract end.
      if (!e.contractEndOn) continue;
      const end = iso(e.contractEndOn);
      const left = Math.round((e.contractEndOn.getTime() - asDate(today).getTime()) / 86_400_000);
      for (const d of [30, 7]) {
        if (left <= d && left >= 0 && !e.contractReminded.includes(d)) {
          await tx.employment.update({ where: { id: e.id }, data: { contractReminded: { push: d } } });
          await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'employment.contract_ending', payload: { employmentId: e.id, employeeId: e.employeeId, contractEndOn: end, daysLeft: left } } });
          await audit(tx, c, 'employment.contract_ending', 'employee', e.employeeId, { contractEndOn: end, daysLeft: left });
          const to = [...(await holdersOf(tx, org, 'lifecycle.exit.manage', e.employeeId, today)), (await this.managerUser(tx, org, e.id)) ?? ''];
          void this.tell(org, to, `A fixed-term contract ends in ${left} days: extend it, convert it or let it end`, '/yx/people/exits');
        }
      }
      const action = await settingFor(tx, c, 'contract_end.action', { legalEntityId: e.legalEntityId, employmentTypeId: a?.employmentTypeId });
      if (action === 'auto_exit' && left <= 7 && left >= 0) {
        const id = await this.exits.openSystemExitIn(tx, c, e.employeeId, 'end_of_contract', end, 'Fixed-term contract ends (company policy: exit on the end date)');
        await audit(tx, c, 'exit.contract_end.opened', 'exit_case', id, { lastDay: end });
      }
    }
  }

  /** Upcoming retirements (12 months) and contract ends (90 days) of the people in scope. */
  async upcoming(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('lifecycle.exit.view') && !v.grants.has('lifecycle.exit.manage')) throw new ForbiddenException('You cannot see exits.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const own = await ownOf(tx, c, v);
      const rows = [];
      for (const e of await tx.employment.findMany({ where: { organizationId: org, exitedOn: null } })) {
        const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: e.employeeId } });
        if (own.employeeId === emp.id || !((await reachesPerson(tx, c, v, 'lifecycle.exit.view', emp.personId, own)) || (await reachesPerson(tx, c, v, 'lifecycle.exit.manage', emp.personId, own)))) continue;
        const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null }, orderBy: { validFrom: 'desc' } });
        const dob = (await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: e.employeeId }, select: { dateOfBirth: true } }))?.dateOfBirth;
        if (dob) {
          const day = retirementDay(iso(dob), Number(await settingFor(tx, c, 'retirement.age', { legalEntityId: e.legalEntityId, employmentTypeId: a?.employmentTypeId, gradeId: a?.gradeId })));
          if (day >= today && day <= addDaysIso(today, 366)) rows.push({ employeeId: emp.id, name: displayName(emp), kind: 'retirement' as const, on: day });
        }
        if (e.contractEndOn && iso(e.contractEndOn) >= today && iso(e.contractEndOn) <= addDaysIso(today, 90)) rows.push({ employeeId: emp.id, name: displayName(emp), kind: 'contract_end' as const, on: iso(e.contractEndOn) });
      }
      return { today, rows: rows.sort((x, y) => x.on.localeCompare(y.on)) };
    });
  }

  /** HR sets, extends or converts a fixed-term contract (conversion is a P06 employment-type change for approval). */
  async contract(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: { action: 'set' | 'extend' | 'convert'; contractEndOn?: string | null; employmentTypeId?: string | null; reason: string }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e } = await this.managedEmployee(tx, c, v, employeeId, 'employee.change.manage');
      if (dto.action === 'convert') {
        if (!dto.employmentTypeId) throw new BadRequestException('Choose the new employment type.');
        await tx.employment.update({ where: { id: e.id }, data: { contractEndOn: null, contractReminded: [] } });
        await audit(tx, c, 'employment.contract_converted', 'employee', employeeId, { reason: dto.reason.trim() });
        return { convert: true };
      }
      if (!dto.contractEndOn || dto.contractEndOn < iso(e.joinedOn)) throw new BadRequestException('Give a contract end on or after the joining day.');
      if (dto.action === 'extend' && e.contractEndOn && dto.contractEndOn <= iso(e.contractEndOn)) throw new BadRequestException('An extension moves the end later.');
      await tx.employment.update({ where: { id: e.id }, data: { contractEndOn: asDate(dto.contractEndOn), contractReminded: [] } });
      await audit(tx, c, `employment.contract_${dto.action === 'set' ? 'set' : 'extended'}`, 'employee', employeeId, { contractEndOn: dto.contractEndOn, reason: dto.reason.trim() });
      return { convert: false };
    });
    // Conversion to permanent: the ordinary employment-type change, approved by someone else (P06).
    if (res.convert) {
      const hv = await this.history.viewer(user as Parameters<EmployeeHistoryService['viewer']>[0]);
      return this.history.requestChange(ctx, hv, { employeeId, changeType: 'employment_type_change', effectiveDate: todayIst(), payload: { assignment: { employmentTypeId: dto.employmentTypeId! } }, reason: dto.reason } as Parameters<EmployeeHistoryService['requestChange']>[2]);
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ IR permissions, closure, VRS schemes (LIFE-5.07)

  async permissions(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('lifecycle.exit.manage')) throw new ForbiddenException('You cannot see permission requests.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.irPermissionRequest.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' } });
      const schemes = await tx.vrsScheme.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' } });
      const workers: Record<string, number> = {};
      for (const le of await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })) workers[le.id] = await this.exits.workersIn(tx, c.organizationId, le.id);
      return {
        workers,
        requests: rows.filter((r) => tenantWide(v, 'lifecycle.exit.manage') || (v.scopes.get('lifecycle.exit.manage') ?? []).some((s) => s.id === r.legalEntityId)).map((r) => ({ id: r.id, legalEntityId: r.legalEntityId, kind: r.kind, workersAffected: r.workersAffected, reasons: r.reasons, appliedOn: iso(r.appliedOn), authority: r.authority, status: r.status, decidedOn: r.decidedOn ? iso(r.decidedOn) : null, version: r.version })),
        schemes: schemes.map((s) => ({ id: s.id, name: s.name, legalEntityId: s.legalEntityId, opensOn: iso(s.opensOn), closesOn: iso(s.closesOn), minAge: s.minAge, minServiceYears: s.minServiceYears, status: s.status })),
      };
    });
  }

  async addPermission(ctx: TenantContext, user: ScopeUser, dto: { legalEntityId: string; kind: 'retrenchment' | 'layoff' | 'closure'; workersAffected: number; reasons: string; appliedOn: string; authority: string }) {
    const v = await this.viewer(user);
    this.entityAdmin(v, dto.legalEntityId);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (dto.appliedOn > todayIst()) throw new BadRequestException('The application day cannot be in the future.');
      const r = await tx.irPermissionRequest.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, kind: dto.kind, workersAffected: dto.workersAffected, reasons: dto.reasons.trim(), appliedOn: asDate(dto.appliedOn), authority: dto.authority.trim(), createdBy: c.userId ?? null } });
      await audit(tx, c, 'ir.permission.applied', 'ir_permission_request', r.id, { kind: dto.kind, workersAffected: dto.workersAffected });
      return { id: r.id };
    });
  }

  async decidePermission(ctx: TenantContext, user: ScopeUser, id: string, dto: { status: 'granted' | 'deemed' | 'refused'; decidedOn: string; orderDocumentId?: string | null; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.irPermissionRequest.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such request.');
      this.entityAdmin(v, r.legalEntityId);
      if (r.status !== 'applied' || r.version !== dto.version) throw new ConflictException('This request was decided or changed meanwhile.');
      await tx.irPermissionRequest.update({ where: { id }, data: { status: dto.status, decidedOn: asDate(dto.decidedOn), orderDocumentId: dto.orderDocumentId ?? null, version: { increment: 1 } } });
      if (dto.status === 'refused') await this.exits.refusePermissionIn(tx, c, id);
      await audit(tx, c, `ir.permission.${dto.status}`, 'ir_permission_request', id, {});
      return { ok: true };
    });
  }

  /** A permitted closure opens a retrenchment exit for everyone still working in the legal entity (YX-LC-27). */
  async closure(ctx: TenantContext, user: ScopeUser, id: string, dto: { lwd: string; reason: string }) {
    const v = await this.viewer(user);
    return inCompany(
      this.tenantPrisma,
      ctx,
      async (tx, c) => {
        const r = await tx.irPermissionRequest.findFirst({ where: { organizationId: c.organizationId, id, kind: 'closure' } });
        if (!r) throw new NotFoundException('No such closure.');
        this.entityAdmin(v, r.legalEntityId);
        if (r.status !== 'granted' && r.status !== 'deemed') throw new ConflictException('The closure needs the permission granted first.');
        if (dto.lwd < todayIst()) throw new BadRequestException('The last working day cannot be in the past.');
        const own = await ownOf(tx, c, v);
        let opened = 0;
        for (const e of await tx.employment.findMany({ where: { organizationId: c.organizationId, legalEntityId: r.legalEntityId, exitedOn: null } })) {
          if (e.employeeId === own.employeeId) continue;
          if (await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, status: { in: ['submitted', 'accepted', 'cleared'] } }, select: { id: true } })) continue;
          const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.employeeId } });
          const k = await tx.exitCase.create({ data: { organizationId: c.organizationId, employmentId: e.id, employeeId: e.employeeId, personId: emp.personId, exitType: 'retrenchment', initiatedBy: 'company', reasonText: `Closure: ${dto.reason.trim()}`.slice(0, 1000), submittedOn: asDate(todayIst()), noticePeriod: '0d', standardLwd: asDate(dto.lwd), status: 'submitted', irPermissionId: id, retrenchment: { selectionBasis: 'Closure of the establishment', noticeMode: 'notice' }, createdBy: c.userId ?? null } });
          await tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
          await tx.exitCaseHr.createMany({ data: [{ exitCaseId: k.id, organizationId: c.organizationId, openCaseFlags: { posh: 'not_checked', disciplinary: 'not_checked', pip: 'not_checked' } }] });
          await this.exits.acceptIn(tx, c, k.id);
          opened++;
        }
        await audit(tx, c, 'ir.closure.exits', 'ir_permission_request', id, { opened, lwd: dto.lwd });
        return { opened };
      },
      { timeout: 120_000 },
    );
  }

  async addScheme(ctx: TenantContext, user: ScopeUser, dto: { name: string; legalEntityId?: string | null; opensOn: string; closesOn: string; minAge: number; minServiceYears: number }) {
    const v = await this.viewer(user);
    if (dto.legalEntityId) this.entityAdmin(v, dto.legalEntityId);
    else if (!tenantWide(v, 'lifecycle.exit.manage')) throw new ForbiddenException('A company-wide scheme needs a company-wide exit admin.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (dto.closesOn < dto.opensOn) throw new BadRequestException('The scheme closes after it opens.');
      const s = await tx.vrsScheme.create({ data: { organizationId: c.organizationId, name: dto.name.trim(), legalEntityId: dto.legalEntityId ?? null, opensOn: asDate(dto.opensOn), closesOn: asDate(dto.closesOn), minAge: dto.minAge, minServiceYears: dto.minServiceYears, createdBy: c.userId ?? null } });
      await audit(tx, c, 'vrs.scheme.created', 'vrs_scheme', s.id, { opensOn: dto.opensOn, closesOn: dto.closesOn });
      return { id: s.id };
    });
  }
}
