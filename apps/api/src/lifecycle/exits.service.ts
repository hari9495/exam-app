import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, covers, implicitPeriods, tenantWide } from '../access/scope';
import { ApprovalsEngine, type Notice, type StepSpec } from '../workflow/approvals-engine.service';
import { AutomationService } from '../rules-engine/automation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmployeeHistoryService, displayName } from '../employee-history/employee-history.service';
import { PeopleService } from '../people/people.service';
import { settingFor } from '../people/probation';
import { holdersOf } from '../time/time-core';
import { JourneysService as DeskJourneysService } from '../service-desk/journeys.service';
import { ownOf, reachesPerson } from '../documents/person-access';
import { LifecycleJourneysService } from './journeys.service';
import { LastDayService } from './last-day.service';
import { freezeSettlementIn } from './settlement';
import { daysFrom, CLEARANCE_STARTER, DEATH_CLAIMS, EXIT_INTERVIEW_FORM_VERSION, IR_PERMISSION_THRESHOLD, MATERNITY_BLOCKED, NEEDS_APPROVAL, RESIGNATION_REASONS, type ExitType, noticeLabel, standardLwd } from './exit-rules';

// Lifecycle batch 6c (design §10): probation reviews, resignations, notice changes and company-started exits.
//   resignation   the employee gives it (Me › Resign); P03 exit.resignation: their manager, then HR; on acceptance the
//                 employment goes on notice (P06), the offboarding checklist starts on the last working day, clearance
//                 items and the exit interview are created, and exit.case.accepted fires (desk leaver requests);
//   withdrawal    alone before acceptance; after it, P03 exit.withdrawal (manager + HR) ends the notice;
//   notice        early release, buy-out and other last-day changes are P03 exit.notice_change (another HR person);
//   company exits HR starts them; termination and probation termination need another HR person's approval (starter
//                 setting) and are refused during maternity leave (YX-LV-10); death and absconding record a past day;
//   HR-only facts open-case flags, rehire, regretted, backfill and hold reasons live in exit_case_hr, readable only with
//                 lifecycle.exit.confidential.view (restrictive RLS + a per-transaction flag set after the check).

const KEYS = ['lifecycle.exit.view', 'lifecycle.exit.manage', 'lifecycle.exit.confidential.view', 'employee.change.manage'] as const;
const T = { resignation: 'exit.resignation', withdrawal: 'exit.withdrawal', notice: 'exit.notice_change', company: 'exit.company' } as const;
type Case = Prisma.ExitCaseGetPayload<object>;
type Employment = Prisma.EmploymentGetPayload<object>;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const isoOrNull = (d: Date | null | undefined) => (d ? iso(d) : null);
const LIVE = ['submitted', 'accepted', 'cleared'];
const TYPE_LABEL: Record<ExitType, string> = { resignation: 'Resignation', termination: 'Termination', probation_termination: 'Probation not confirmed', end_of_contract: 'End of contract', retirement: 'Retirement', death: 'Death in service', absconding: 'Absconding', retrenchment: 'Retrenchment', vrs: 'Voluntary retirement' };

/** M08 / M06 are not built yet: their checks say so, and HR sees "not checked" (§10.5). */
const PRECHECKS = () => ({ posh: 'not_checked', disciplinary: 'not_checked', pip: 'not_checked' });

export interface ResignDto {
  reasonCode: string;
  reasonText: string;
  requestedLwd?: string | null;
}
export interface CompanyExitDto {
  employeeId: string;
  exitType: ExitType;
  lwd: string;
  reasonCode?: string | null;
  reasonText: string;
  /** Retrenchment (YX-LC-27): how the worker was chosen, notice or pay in lieu, the permission request if needed. */
  selectionBasis?: string | null;
  noticeMode?: 'notice' | 'pay_in_lieu' | null;
  irPermissionId?: string | null;
}
export interface NoticeChangeDto {
  kind: 'early_release' | 'buyout' | 'lwd_change';
  lwd: string;
  buyoutBy?: 'employee' | 'company' | null;
  buyoutDays?: number | null;
  reason: string;
  version: number;
}
export interface HrFactsDto {
  rehireEligible?: boolean | null;
  rehireReason?: string | null;
  regretted?: boolean | null;
  backfillRequested?: boolean;
  hold?: boolean;
  holdReason?: string | null;
  holdReviewOn?: string | null;
  version: number;
}
export interface ProbationReviewDto {
  outcome: 'confirm' | 'extend' | 'terminate';
  months?: number | null;
  comments: string;
  rating?: number | null;
}

@Injectable()
export class ExitsService implements OnModuleInit {
  private readonly logger = new Logger(ExitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly people: PeopleService,
    private readonly approvals: ApprovalsEngine,
    private readonly automation: AutomationService,
    private readonly notifications: NotificationsService,
    private readonly journeys: LifecycleJourneysService,
    private readonly desk: DeskJourneysService,
    private readonly lastDay: LastDayService,
  ) {}

  onModuleInit() {
    const ctxOf = (org: string): CompanyContext => ({ organizationId: org, isSuperAdmin: false, userId: null });
    const base = { risk: 'normal' as const, autoActions: false, distinctSteps: true, cardPreview: async () => 'neutral' as const };
    this.approvals.register({
      ...base,
      key: T.resignation,
      label: 'Resignation',
      requesterLink: () => '/yx/me/resignation',
      onDecided: async (tx, req, outcome) => {
        if (outcome === 'approved') await this.acceptIn(tx, ctxOf(req.organizationId), req.subjectId);
        else await this.closeIn(tx, ctxOf(req.organizationId), req.subjectId, 'rejected');
      },
    });
    this.approvals.register({
      ...base,
      key: T.company,
      label: 'Exit',
      requesterLink: (req) => `/yx/people/exits/${req.subjectId}`,
      onDecided: async (tx, req, outcome) => {
        if (outcome === 'approved') await this.mustHavePermission(tx, req.organizationId, req.subjectId);
        if (outcome === 'approved') await this.acceptIn(tx, ctxOf(req.organizationId), req.subjectId);
        else await this.closeIn(tx, ctxOf(req.organizationId), req.subjectId, 'rejected');
      },
    });
    this.approvals.register({
      ...base,
      key: T.withdrawal,
      label: 'Resignation withdrawal',
      requesterLink: () => '/yx/me/resignation',
      onDecided: async (tx, req, outcome) => {
        if (outcome === 'approved') await this.withdrawIn(tx, ctxOf(req.organizationId), req.subjectId);
        else await this.clearChangeIn(tx, req.organizationId, req.subjectId);
      },
    });
    this.approvals.register({
      ...base,
      key: T.notice,
      label: 'Notice change',
      requesterLink: (req) => `/yx/people/exits/${req.subjectId}`,
      onDecided: async (tx, req, outcome) => {
        if (outcome === 'approved') await this.applyChangeIn(tx, ctxOf(req.organizationId), req.subjectId);
        else await this.clearChangeIn(tx, req.organizationId, req.subjectId);
      },
    });
    // After the decision's commit: raise the checklist's desk requests, tell clearance owners; stop desk requests.
    this.automation.subscribe(async (ev) => {
      const ctx = ctxOf(ev.organizationId);
      if (ev.type === 'exit.case.accepted' && typeof ev.payload.exitCaseId === 'string') {
        if (typeof ev.payload.journeyId === 'string') await this.journeys.afterStart(ctx, ev.payload.journeyId, null).catch((e) => this.logger.warn(`exit journey: ${(e as Error).message}`));
        await this.tellClearanceOwners(ctx, ev.payload.exitCaseId);
      }
      if (ev.type === 'exit.case.withdrawn' && Array.isArray(ev.payload.tickets)) {
        await this.desk.stopFor(ctx, ev.payload.tickets.filter((t): t is string => typeof t === 'string'), 'The resignation was withdrawn.').catch(() => undefined);
      }
    });
  }

  viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  // ------------------------------------------------------------------------------------------ shared reads

  private async employmentOf(tx: Tx, org: string, employeeId: string): Promise<Employment> {
    const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId, exitedOn: null } });
    if (!e) throw new NotFoundException('No open employment for that employee.');
    return e;
  }

  private assignmentOn(tx: Tx, org: string, employmentId: string, date: string) {
    return tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(date) }, OR: [{ validTo: null }, { validTo: { gte: asDate(date) } }] }, orderBy: { validFrom: 'desc' } });
  }

  private async statusOn(tx: Tx, org: string, employmentId: string, date: string): Promise<string | null> {
    const s = await tx.employmentStatusPeriod.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(date) }, OR: [{ validTo: null }, { validTo: { gte: asDate(date) } }] } });
    return s?.status ?? null;
  }

  /** YX-LC-04: the notice from the company policy in force on the day, by status, entity, employment type and grade. */
  private async noticeOn(tx: Tx, c: CompanyContext, e: Employment, date: string) {
    const a = await this.assignmentOn(tx, c.organizationId, e.id, date);
    const status = await this.statusOn(tx, c.organizationId, e.id, date);
    const key = status === 'probation' ? 'exit.notice.probation' : 'exit.notice.confirmed';
    const period = await settingFor(tx, c, key, { legalEntityId: e.legalEntityId, employmentTypeId: a?.employmentTypeId, gradeId: a?.gradeId }, date);
    return { period, status, managerEmployeeId: a?.managerEmployeeId ?? null, assignment: a };
  }

  /** Who decides the HR step: holders of lifecycle.exit.manage over the person; else the company's System Admins. */
  private async hrDeciders(tx: Tx, org: string, employeeId: string, not: (string | null | undefined)[]): Promise<string[]> {
    const skip = new Set(not.filter(Boolean));
    const hr = (await holdersOf(tx, org, 'lifecycle.exit.manage', employeeId, todayIst())).filter((u) => !skip.has(u));
    if (hr.length) return hr;
    return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter((u) => !skip.has(u));
  }

  /** The reporting manager's step (never the dotted line, M01 Q5); none when the manager has no login, so HR decides alone. */
  private async managerStep(tx: Tx, org: string, employeeId: string): Promise<StepSpec[]> {
    const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId, exitedOn: null } });
    const a = e ? await this.assignmentOn(tx, org, e.id, todayIst()) : null;
    const m = a?.managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { userId: true } }) : null;
    const u = m?.userId ? await tx.user.findFirst({ where: { organizationId: org, id: m.userId, status: 'active' }, select: { id: true } }) : null;
    return u ? [{ name: 'Manager', approvers: [{ kind: 'users', userIds: [u.id] }], mode: 'any' }] : [];
  }

  private async hrStep(tx: Tx, org: string, employeeId: string, not: (string | null | undefined)[]): Promise<StepSpec> {
    const ids = (await this.hrDeciders(tx, org, employeeId, not)).slice(0, 25);
    return { name: 'HR', approvers: ids.length ? [{ kind: 'users', userIds: ids }] : [], mode: 'any' };
  }

  private confidential(tx: Tx) {
    return tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
  }

  /** What the viewer is to a case: the leaver, HR in scope (view / manage / confidential) or the manager (team). */
  private async access(tx: Tx, c: CompanyContext, v: Viewer, k: Case) {
    const own = await ownOf(tx, c, v);
    const today = todayIst();
    const reach = async (key: string) => !v.actingForOther && (await reachesPerson(tx, c, v, key, k.personId, own));
    const manage = (await reach('lifecycle.exit.manage')) && own.employeeId !== k.employeeId;
    const view = manage || (await reach('lifecycle.exit.view'));
    const confidential = (await reach('lifecycle.exit.confidential.view')) && own.employeeId !== k.employeeId;
    const self = own.employeeId === k.employeeId;
    const manager = !self && Boolean(own.employeeId) && covers(await implicitPeriods(tx, c, own.employeeId, k.employeeId), today);
    return { self, manage, view: view || manager, confidential, manager, own };
  }

  private async caseOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!k) throw new NotFoundException('No such exit.');
    const a = await this.access(tx, c, v, k);
    if (!a.view && !a.self) throw new NotFoundException('No such exit.');
    return { k, a };
  }

  private caseView(k: Case, opts: { reasonVisible: boolean }) {
    const pending = k.changeKind ? { kind: k.changeKind, ...(k.changePayload as Record<string, unknown>) } : null;
    return {
      id: k.id,
      employeeId: k.employeeId,
      personId: k.personId,
      exitType: k.exitType,
      typeLabel: TYPE_LABEL[k.exitType as ExitType],
      initiatedBy: k.initiatedBy,
      reasonCode: opts.reasonVisible ? k.reasonCode : null,
      reasonText: opts.reasonVisible ? k.reasonText : null,
      submittedOn: iso(k.submittedOn),
      requestedLwd: isoOrNull(k.requestedLwd),
      noticePeriod: k.noticePeriod,
      noticeLabel: noticeLabel(k.noticePeriod),
      standardLwd: iso(k.standardLwd),
      approvedLwd: isoOrNull(k.approvedLwd),
      lastDay: iso(k.approvedLwd ?? k.standardLwd),
      noticeArrangement: k.noticeArrangement,
      status: k.status,
      pendingChange: pending,
      lettersHeld: k.lettersHeld,
      version: k.version,
    };
  }

  // ------------------------------------------------------------------------------------------ resignation (LIFE-3.02)

  /** Me › Resign: my notice from the policy today and the standard last day, or my resignation as it stands. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.employeeId) throw new ForbiddenException('Only employees can resign here.');
      const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: own.employeeId }, orderBy: { joinedOn: 'desc' } });
      if (!e) throw new ForbiddenException('Only employees can resign here.');
      const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id }, orderBy: { createdAt: 'desc' } });
      const today = todayIst();
      const n = e.exitedOn ? null : await this.noticeOn(tx, c, e, today);
      const interview = k ? await tx.exitInterview.findFirst({ where: { organizationId: c.organizationId, exitCaseId: k.id }, select: { status: true } }) : null;
      return {
        today,
        notice: n ? { period: n.period, label: noticeLabel(n.period), standardLwd: standardLwd(today, n.period), onProbation: n.status === 'probation' } : null,
        reasons: RESIGNATION_REASONS,
        current: k && (LIVE.includes(k.status) || k.status === 'exited') ? { ...this.caseView(k, { reasonVisible: k.initiatedBy === 'employee' }), interview: interview?.status ?? null } : null,
        last: k && !LIVE.includes(k.status) ? { status: k.status, submittedOn: iso(k.submittedOn) } : null,
      };
    });
  }

  async resign(ctx: TenantContext, user: ScopeUser, dto: ResignDto) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the employee can resign, signed in as themselves.');
    let notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      if (!own.employeeId || !own.personId) throw new ForbiddenException('Only employees can resign here.');
      const e = await this.employmentOf(tx, org, own.employeeId);
      await this.history.lockEmployment(tx, c, e.id);
      if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: LIVE } }, select: { id: true } })) throw new ConflictException('You have already resigned. Your resignation is on this page.');
      const today = todayIst();
      const n = await this.noticeOn(tx, c, e, today);
      const std = standardLwd(today, n.period);
      if (dto.requestedLwd && dto.requestedLwd < today) throw new BadRequestException('The day you want to leave cannot be in the past.');
      const k = await tx.exitCase.create({
        data: { organizationId: org, employmentId: e.id, employeeId: e.employeeId, personId: own.personId, exitType: 'resignation', initiatedBy: 'employee', reasonCode: dto.reasonCode, reasonText: dto.reasonText.trim(), submittedOn: asDate(today), requestedLwd: dto.requestedLwd ? asDate(dto.requestedLwd) : null, noticePeriod: n.period, standardLwd: asDate(std), status: 'submitted', createdBy: c.userId ?? null },
      });
      await this.openHrFacts(tx, org, k.id, {});
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: e.employeeId } });
      const sub = await this.approvals.submit(tx, c, {
        type: T.resignation,
        subjectType: 'exit_case',
        subjectId: k.id,
        title: `Resignation of ${displayName(emp)}`,
        summary: [
          { label: 'Last working day (by notice)', value: std },
          ...(dto.requestedLwd ? [{ label: 'Asked to leave on', value: dto.requestedLwd }] : []),
          { label: 'Notice', value: noticeLabel(n.period) },
        ],
        subjectPersonId: own.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [
          ...(await this.managerStep(tx, org, e.employeeId)),
          await this.hrStep(tx, org, e.employeeId, [c.userId]),
        ],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.hrDeciders(tx, org, e.employeeId, [c.userId]),
      });
      notices = sub.notices;
      await tx.exitCase.update({ where: { id: k.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'exit.case.opened', 'exit_case', k.id, { exitType: 'resignation', employeeId: e.employeeId, standardLwd: std, notice: n.period });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.opened', payload: { exitCaseId: k.id, employeeId: e.employeeId, exitType: 'resignation' } } });
      return k.id;
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    return this.mine(ctx, user).then((m) => ({ ...m, id: res }));
  }

  /** Before acceptance the employee withdraws alone; after it, the manager and HR decide (P03 exit.withdrawal). */
  async withdraw(ctx: TenantContext, user: ScopeUser, reason: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the employee can withdraw their resignation.');
    let notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      const k = own.employeeId ? await tx.exitCase.findFirst({ where: { organizationId: org, employeeId: own.employeeId, exitType: 'resignation', status: { in: ['submitted', 'accepted'] } } }) : null;
      if (!k) throw new NotFoundException('You have no resignation to withdraw.');
      if (k.status === 'submitted') {
        if (k.wfRequestId) await this.approvals.withdraw(tx, c, k.wfRequestId, c.userId ?? null, reason.trim());
        await tx.exitCase.update({ where: { id: k.id }, data: { status: 'withdrawn', withdrawnAt: new Date(), version: { increment: 1 } } });
        await audit(tx, c, 'exit.case.withdrawn', 'exit_case', k.id, { before: 'submitted' });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.withdrawn', payload: { exitCaseId: k.id, employeeId: k.employeeId, tickets: [] } } });
        return 'withdrawn' as const;
      }
      if (k.changeKind) throw new ConflictException('A change to your notice is already waiting for a decision.');
      if (iso(k.approvedLwd!) < todayIst()) throw new ConflictException('Your last working day has passed.');
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: k.employeeId } });
      const sub = await this.approvals.submit(tx, c, {
        type: T.withdrawal,
        subjectType: 'exit_case',
        subjectId: k.id,
        title: `${displayName(emp)} asks to withdraw their resignation`,
        summary: [{ label: 'Accepted last working day', value: iso(k.approvedLwd!) }],
        subjectPersonId: k.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [
          ...(await this.managerStep(tx, org, k.employeeId)),
          await this.hrStep(tx, org, k.employeeId, [c.userId]),
        ],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.hrDeciders(tx, org, k.employeeId, [c.userId]),
      });
      notices = sub.notices;
      await tx.exitCase.update({ where: { id: k.id }, data: { changeKind: 'withdrawal', changeWfRequestId: sub.id, changePayload: { reason: reason.trim() }, version: { increment: 1 } } });
      await audit(tx, c, 'exit.withdrawal.requested', 'exit_case', k.id, {});
      return 'requested' as const;
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    return { result: out };
  }

  // ------------------------------------------------------------------------------------------ company exits (LIFE-3.04)

  async startCompanyExit(ctx: TenantContext, user: ScopeUser, dto: CompanyExitDto) {
    const v = await this.viewer(user);
    let notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } });
      const own = await ownOf(tx, c, v);
      if (!emp?.personId || v.actingForOther || !(await reachesPerson(tx, c, v, 'lifecycle.exit.manage', emp.personId, own))) throw new NotFoundException('No open employment for that employee.');
      if (own.employeeId === emp.id) throw new ForbiddenException('Someone else records your own exit.');
      const k = await this.openCompanyCase(tx, c, emp, dto);
      if (NEEDS_APPROVAL.includes(dto.exitType)) notices = await this.submitCompany(tx, c, k, emp, [c.userId]);
      else await this.acceptIn(tx, c, k.id);
      return k.id;
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    return this.get(ctx, user, out);
  }

  private async openCompanyCase(tx: Tx, c: CompanyContext, emp: Prisma.EmployeeGetPayload<object>, dto: CompanyExitDto): Promise<Case> {
    const org = c.organizationId;
    const e = await this.employmentOf(tx, org, emp.id);
    await this.history.lockEmployment(tx, c, e.id);
    if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: LIVE } }, select: { id: true } })) throw new ConflictException('This person already has an exit in progress.');
    const today = todayIst();
    if (dto.lwd < iso(e.joinedOn)) throw new BadRequestException('The last working day is before they joined.');
    if (dto.lwd < today && dto.exitType !== 'death' && dto.exitType !== 'absconding') throw new BadRequestException('The last working day cannot be in the past.');
    if (dto.lwd > today && (dto.exitType === 'death' || dto.exitType === 'absconding')) throw new BadRequestException(dto.exitType === 'death' ? 'Give the date of death.' : 'Give the last day they were present.');
    const n = await this.noticeOn(tx, c, e, today);
    if (dto.exitType === 'probation_termination' && n.status !== 'probation') throw new BadRequestException('This person is not on probation.');
    // YX-LV-10: no termination while on maternity leave (approved leave of the maternity kind over today … the last day).
    if (MATERNITY_BLOCKED.includes(dto.exitType)) {
      const [m] = await tx.$queryRaw<{ id: string }[]>`
        SELECT r.id::text FROM leave_requests r JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
        WHERE r.organization_id = ${org}::uuid AND r.employee_id = ${emp.id}::uuid AND t.kind = 'maternity' AND r.status IN ('approved', 'cancel_pending')
          AND r.from_on <= ${dto.lwd}::date AND r.to_on >= ${today}::date LIMIT 1`;
      if (m) throw new ConflictException({ statusCode: 409, code: 'MATERNITY_LEAVE', message: 'She is on maternity leave in this period. The law does not allow a termination during maternity leave (Maternity Benefit Act, section 12).' });
    }
    let retrenchment: Prisma.InputJsonValue | undefined;
    if (dto.exitType === 'retrenchment') {
      if (!dto.selectionBasis?.trim() || !dto.noticeMode) throw new BadRequestException('Record how the worker was chosen and whether notice is given or paid in lieu.');
      const years = Math.floor(daysFrom(iso(e.joinedOn), dto.lwd) / 365.25);
      // What payroll pays from (no amounts here): 15 days' average pay per completed year, notice or wages in lieu,
      // and the employer's re-skilling fund contribution of 15 days' wages (a statutory payable, not an F&F line).
      retrenchment = { selectionBasis: dto.selectionBasis.trim().slice(0, 500), noticeMode: dto.noticeMode, completedYears: years, compensationDays: years >= 1 ? 15 * years : 0, reskillingFundDays: 15, workers: await this.workersIn(tx, org, e.legalEntityId) };
      if (dto.irPermissionId && !(await tx.irPermissionRequest.findFirst({ where: { organizationId: org, id: dto.irPermissionId, legalEntityId: e.legalEntityId, kind: { in: ['retrenchment', 'closure'] } }, select: { id: true } }))) throw new BadRequestException('That permission request is not for this legal entity.');
    }
    const k = await tx.exitCase.create({
      data: { organizationId: org, employmentId: e.id, employeeId: emp.id, personId: emp.personId!, exitType: dto.exitType, initiatedBy: 'company', reasonCode: dto.reasonCode ?? null, reasonText: dto.reasonText.trim(), submittedOn: asDate(today), noticePeriod: '0d', standardLwd: asDate(dto.lwd), status: 'submitted', retrenchment, irPermissionId: dto.irPermissionId ?? null, createdBy: c.userId ?? null },
    });
    await this.openHrFacts(tx, org, k.id, dto.exitType === 'absconding' ? { rehireEligible: false, rehireReason: 'Absconded (HR may change this)' } : {});
    await audit(tx, c, 'exit.case.opened', 'exit_case', k.id, { exitType: dto.exitType, employeeId: emp.id, lwd: dto.lwd });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.opened', payload: { exitCaseId: k.id, employeeId: emp.id, exitType: dto.exitType } } });
    return k;
  }

  private async submitCompany(tx: Tx, c: CompanyContext, k: Case, emp: Prisma.EmployeeGetPayload<object>, not: (string | null | undefined)[]): Promise<Notice[]> {
    const org = c.organizationId;
    const deciders = await this.hrDeciders(tx, org, emp.id, not);
    const sub = await this.approvals.submit(tx, c, {
      type: T.company,
      subjectType: 'exit_case',
      subjectId: k.id,
      title: `${TYPE_LABEL[k.exitType as ExitType]}: ${displayName(emp)}`,
      summary: [{ label: 'Last working day', value: iso(k.standardLwd) }],
      subjectPersonId: k.personId,
      requesterUserId: c.userId ?? null,
      raisedByUserId: c.userId ?? null,
      steps: [{ name: 'HR', approvers: deciders.length ? [{ kind: 'users', userIds: deciders.slice(0, 25) }] : [], mode: 'any' }],
      payload: {},
      payloadFields: [],
      fallbackUserIds: deciders,
    });
    await tx.exitCase.update({ where: { id: k.id }, data: { wfRequestId: sub.id } });
    return sub.notices;
  }

  private async openHrFacts(tx: Tx, org: string, exitCaseId: string, extra: { rehireEligible?: boolean; rehireReason?: string }) {
    await this.confidential(tx);
    await tx.exitCaseHr.createMany({ data: [{ exitCaseId, organizationId: org, openCaseFlags: PRECHECKS(), ...extra }] });
  }

  // ------------------------------------------------------------------------------------------ effects of decisions

  /** In the decision's transaction: the case is accepted, the notice starts, the checklist, clearance and interview open. */
  async acceptIn(tx: Tx, c: CompanyContext, id: string) {
    const org = c.organizationId;
    const k = await tx.exitCase.findFirst({ where: { organizationId: org, id, status: 'submitted' } });
    if (!k) return;
    const std = iso(k.standardLwd);
    const lwd = k.exitType === 'resignation' && k.requestedLwd && iso(k.requestedLwd) > std ? iso(k.requestedLwd) : std;
    const today = todayIst();
    await tx.exitCase.update({ where: { id }, data: { status: 'accepted', approvedLwd: asDate(lwd), acceptedAt: new Date(), version: { increment: 1 } } });
    const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: k.employmentId } });
    // P06: the employment is on notice from the acceptance day (resignations; a company exit records its last day only).
    if (k.exitType === 'resignation' && lwd >= today) {
      const before = await this.statusOn(tx, org, e.id, today);
      if (before && before !== 'notice') await this.systemChange(tx, c, e, 'notice', 'notice', today, 'Resignation accepted');
    }
    // The offboarding checklist, anchored on the last working day (a company without one simply has none yet).
    const a = await this.assignmentOn(tx, org, e.id, lwd < today ? lwd : today);
    const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: k.employeeId } });
    const owner = (await this.hrDeciders(tx, org, k.employeeId, []))[0] ?? null;
    let journeyId: string | null = null;
    if (a && owner) {
      try {
        const j = await this.journeys.startIn(tx, c, {
          kind: 'offboarding',
          personId: k.personId,
          subjectType: 'exit_case',
          subjectId: k.id,
          anchorOn: lwd,
          place: { legalEntityId: e.legalEntityId, locationId: a.locationId, departmentId: a.departmentId },
          ownerUserId: owner,
          managerEmployeeId: a.managerEmployeeId,
          personUserId: k.exitType === 'death' ? null : emp.userId,
        });
        journeyId = j.id;
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
      }
    }
    // Clearance (§10.6): the starter list, owners from the checklist's teams; then one item per asset they still hold.
    const managerUser = a?.managerEmployeeId ? ((await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { userId: true } }))?.userId ?? null) : null;
    const tasks = journeyId ? await tx.journeyTask.findMany({ where: { organizationId: org, journeyId }, select: { ownerType: true, assigneeUserId: true, assigneeGroupId: true } }) : [];
    const ownerFor = (dep: string) => {
      if (dep === 'manager_handover') return { ownerUserId: managerUser ?? owner, ownerGroupId: null };
      const t = tasks.find((x) => x.ownerType === dep && (x.assigneeUserId || x.assigneeGroupId));
      return t ? { ownerUserId: t.assigneeUserId, ownerGroupId: t.assigneeGroupId } : { ownerUserId: owner, ownerGroupId: null };
    };
    for (const item of CLEARANCE_STARTER) {
      const o = ownerFor(item.department);
      if (o.ownerUserId || o.ownerGroupId) await tx.clearanceItem.create({ data: { organizationId: org, exitCaseId: id, department: item.department, title: item.title, ...o } });
    }
    await this.assetItemsIn(tx, org, id, k.personId, owner);
    // Death in service (YX-LC-16): the family's claim forms are tasks on the case; the nominations become the payees.
    if (k.exitType === 'death') {
      if (owner) for (const title of DEATH_CLAIMS) await tx.clearanceItem.create({ data: { organizationId: org, exitCaseId: id, department: 'hr', title, ownerUserId: owner } });
      const noms = await tx.employeeNomination.findMany({ where: { organizationId: org, employeeId: k.employeeId, scheme: { in: ['gratuity', 'all'] } } });
      if (noms.length && !(await tx.exitPayee.findFirst({ where: { organizationId: org, exitCaseId: id }, select: { id: true } }))) {
        await tx.exitPayee.createMany({ data: noms.map((n) => ({ organizationId: org, exitCaseId: id, kind: 'nominee', name: n.name, relation: n.relation, sharePercent: n.sharePercent })) });
      }
    }
    if (k.exitType !== 'death' && k.exitType !== 'absconding') await tx.exitInterview.create({ data: { organizationId: org, exitCaseId: id, formVersion: EXIT_INTERVIEW_FORM_VERSION } });
    // LIFE-4.05: the first payroll hand-off revision (wages due two working days after the last day).
    await freezeSettlementIn(tx, c, id, 'accepted');
    await audit(tx, c, 'exit.case.accepted', 'exit_case', id, { lwd, journeyId });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.accepted', payload: { exitCaseId: id, employeeId: k.employeeId, lastDay: lwd, journeyId, exitType: k.exitType } } });
  }

  /** One clearance item per asset the leaver still holds (returning it clears the item). */
  async assetItemsIn(tx: Tx, org: string, exitCaseId: string, personId: string, owner: string | null) {
    const open = await tx.assetAssignment.findMany({ where: { organizationId: org, personId, returnedOn: null } });
    for (const x of open) {
      if (await tx.clearanceItem.findFirst({ where: { organizationId: org, exitCaseId, assetAssignmentId: x.id }, select: { id: true } })) continue;
      const asset = await tx.asset.findFirstOrThrow({ where: { organizationId: org, id: x.assetId } });
      const keeper = (await tx.assetAssignment.findFirst({ where: { organizationId: org, id: x.id }, select: { issuedBy: true } }))?.issuedBy ?? owner;
      if (keeper) await tx.clearanceItem.create({ data: { organizationId: org, exitCaseId, department: 'asset', title: `Return ${asset.name} (${asset.tag})`.slice(0, 150), ownerUserId: keeper, assetAssignmentId: x.id } });
    }
  }

  private async systemChange(tx: Tx, c: CompanyContext, e: Employment, type: 'notice' | 'notice_withdrawal', status: string, from: string, reason: string) {
    await this.history.lockEmployment(tx, c, e.id);
    const ch = await tx.employeeChange.create({ data: { organizationId: c.organizationId, employeeId: e.employeeId, employmentId: e.id, changeType: type, effectiveDate: asDate(from), status: 'scheduled', payload: { status }, reason, decidedAt: new Date() } });
    await this.history.rebuild(tx, c, e, from, ch.id);
    if (from <= todayIst()) await tx.employeeChange.update({ where: { id: ch.id }, data: { status: 'effective', appliedAt: new Date() } });
    await audit(tx, c, 'employee.change.effective', 'employee', e.employeeId, { changeId: ch.id, changeType: type, effectiveDate: from });
  }

  /** Workers on the rolls of the legal entity today (YX-LC-27; IR Code establishment count, from P01 for now). */
  async workersIn(tx: Tx, org: string, legalEntityId: string) {
    return tx.employment.count({ where: { organizationId: org, legalEntityId, exitedOn: null } });
  }

  /** YX-LC-27: at or above the threshold, a retrenchment is approved only with the government's permission granted. */
  private async mustHavePermission(tx: Tx, org: string, id: string) {
    const k = await tx.exitCase.findFirst({ where: { organizationId: org, id } });
    if (!k || k.exitType !== 'retrenchment') return;
    const workers = await this.workersIn(tx, org, (await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: k.employmentId } })).legalEntityId);
    if (workers < IR_PERMISSION_THRESHOLD) return;
    const p = k.irPermissionId ? await tx.irPermissionRequest.findFirst({ where: { organizationId: org, id: k.irPermissionId } }) : null;
    if (!p || (p.status !== 'granted' && p.status !== 'deemed')) {
      throw new ConflictException({ statusCode: 409, code: 'IR_PERMISSION_NEEDED', message: `This establishment has ${workers} workers. A retrenchment needs the government's permission (IR Code); record the permission as granted first.` });
    }
  }

  /** An exit the system opens by policy (retirement, contract end, absconding): recorded and accepted at once. */
  async openSystemExitIn(tx: Tx, c: CompanyContext, employeeId: string, exitType: ExitType, lwd: string, reasonText: string) {
    const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: employeeId } });
    const k = await this.openCompanyCase(tx, c, emp, { employeeId, exitType, lwd, reasonText });
    await this.acceptIn(tx, c, k.id);
    return k.id;
  }

  /** A refused permission ends the retrenchments waiting on it (YX-LC-27). */
  async refusePermissionIn(tx: Tx, c: CompanyContext, permissionId: string) {
    for (const k of await tx.exitCase.findMany({ where: { organizationId: c.organizationId, irPermissionId: permissionId, status: 'submitted' } })) {
      if (k.wfRequestId) await this.approvals.withdraw(tx, c, k.wfRequestId, c.userId ?? null, 'Government permission refused');
      await this.closeIn(tx, c, k.id, 'rejected');
    }
  }

  // ------------------------------------------------------------------------------------------ VRS (LIFE-5.07)

  /** Open schemes I may apply to: my legal entity (or all), open today, my age and service at or above the minimum. */
  async myVrs(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      const e = own.employeeId ? await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: own.employeeId, exitedOn: null } }) : null;
      if (!e) return { schemes: [] };
      const today = todayIst();
      const dob = (await tx.employeePersonalDetails.findFirst({ where: { organizationId: c.organizationId, employeeId: own.employeeId! }, select: { dateOfBirth: true } }))?.dateOfBirth;
      const age = dob ? Math.floor(daysFrom(iso(dob), today) / 365.25) : null;
      const service = Math.floor(daysFrom(iso(e.joinedOn), today) / 365.25);
      const rows = await tx.vrsScheme.findMany({ where: { organizationId: c.organizationId, status: 'open', opensOn: { lte: asDate(today) }, closesOn: { gte: asDate(today) }, OR: [{ legalEntityId: null }, { legalEntityId: e.legalEntityId }] } });
      return { schemes: rows.map((s) => ({ id: s.id, name: s.name, closesOn: iso(s.closesOn), minAge: s.minAge, minServiceYears: s.minServiceYears, eligible: age !== null && age >= s.minAge && service >= s.minServiceYears })) };
    });
  }

  async applyVrs(ctx: TenantContext, user: ScopeUser, dto: { schemeId: string; requestedLwd: string; reasonText?: string | null }) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the employee applies for themselves.');
    const open = (await this.myVrs(ctx, user)).schemes.find((s) => s.id === dto.schemeId);
    if (!open) throw new NotFoundException('That scheme is not open to you.');
    if (!open.eligible) throw new BadRequestException(`This scheme is for people aged ${open.minAge} or more with ${open.minServiceYears} years of service or more.`);
    let notices: Notice[] = [];
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      const e = await this.employmentOf(tx, org, own.employeeId!);
      await this.history.lockEmployment(tx, c, e.id);
      if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: LIVE } }, select: { id: true } })) throw new ConflictException('You already have an exit in progress.');
      const today = todayIst();
      if (dto.requestedLwd < today) throw new BadRequestException('The last day cannot be in the past.');
      const k = await tx.exitCase.create({ data: { organizationId: org, employmentId: e.id, employeeId: e.employeeId, personId: own.personId!, exitType: 'vrs', initiatedBy: 'employee', reasonText: dto.reasonText?.trim() || null, submittedOn: asDate(today), requestedLwd: asDate(dto.requestedLwd), noticePeriod: '0d', standardLwd: asDate(dto.requestedLwd), status: 'submitted', vrsSchemeId: dto.schemeId, createdBy: c.userId ?? null } });
      await this.openHrFacts(tx, org, k.id, {});
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: e.employeeId } });
      notices = await this.submitCompany(tx, c, k, emp, [c.userId]);
      await audit(tx, c, 'exit.case.opened', 'exit_case', k.id, { exitType: 'vrs', schemeId: dto.schemeId });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.opened', payload: { exitCaseId: k.id, employeeId: e.employeeId, exitType: 'vrs' } } });
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    return this.mine(ctx, user);
  }

  private async closeIn(tx: Tx, c: CompanyContext, id: string, status: 'rejected') {
    const n = await tx.exitCase.updateMany({ where: { organizationId: c.organizationId, id, status: 'submitted' }, data: { status, version: { increment: 1 } } });
    if (n.count) await audit(tx, c, `exit.case.${status}`, 'exit_case', id, {});
  }

  private clearChangeIn(tx: Tx, org: string, id: string) {
    return tx.exitCase.updateMany({ where: { organizationId: org, id }, data: { changeKind: null, changeWfRequestId: null, changePayload: Prisma.DbNull, version: { increment: 1 } } });
  }

  /** An approved withdrawal: the notice ends today (back to the status before), the checklist and clearance stop. */
  async withdrawIn(tx: Tx, c: CompanyContext, id: string) {
    const org = c.organizationId;
    const k = await tx.exitCase.findFirst({ where: { organizationId: org, id, status: { in: ['accepted', 'cleared'] } } });
    if (!k) return;
    await tx.exitCase.update({ where: { id }, data: { status: 'withdrawn', withdrawnAt: new Date(), changeKind: null, changeWfRequestId: null, changePayload: Prisma.DbNull, version: { increment: 1 } } });
    const e = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: k.employmentId } });
    const today = todayIst();
    if ((await this.statusOn(tx, org, e.id, today)) === 'notice') {
      const before = (await this.statusOn(tx, org, e.id, iso(k.submittedOn))) ?? 'confirmed';
      await this.systemChange(tx, c, e, 'notice_withdrawal', before === 'notice' ? 'confirmed' : before, today, 'Resignation withdrawn');
    }
    const tickets: string[] = [];
    const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'exit_case', subjectId: id, status: { not: 'cancelled' } } });
    if (j) {
      const linked = await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: j.id, linkType: 'sd_ticket', status: { in: ['open', 'waiting'] } }, select: { linkId: true } });
      tickets.push(...linked.map((t) => t.linkId!).filter(Boolean));
      await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] } }, data: { status: 'cancelled', version: { increment: 1 } } });
      await tx.journey.update({ where: { id: j.id }, data: { status: 'cancelled' } });
    }
    await tx.clearanceItem.updateMany({ where: { organizationId: org, exitCaseId: id, status: 'open' }, data: { status: 'waived', note: 'Resignation withdrawn', signedOffAt: new Date(), version: { increment: 1 } } });
    await tx.exitInterview.updateMany({ where: { organizationId: org, exitCaseId: id, status: 'sent' }, data: { status: 'skipped' } });
    await audit(tx, c, 'exit.case.withdrawn', 'exit_case', id, { before: 'accepted', deskRequests: tickets.length });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.case.withdrawn', payload: { exitCaseId: id, employeeId: k.employeeId, tickets } } });
  }

  /** An approved notice change: the new last day and the arrangement; the checklist moves (YX-LC-13); one event. */
  async applyChangeIn(tx: Tx, c: CompanyContext, id: string) {
    const org = c.organizationId;
    const k = await tx.exitCase.findFirst({ where: { organizationId: org, id } });
    if (!k || !k.changeKind || k.changeKind === 'withdrawal') return;
    const p = k.changePayload as { lwd: string; buyoutBy?: string | null; buyoutDays?: number | null; reason: string };
    const from = iso(k.approvedLwd ?? k.standardLwd);
    const arrangement = { kind: k.changeKind, from, to: p.lwd, buyoutBy: p.buyoutBy ?? null, buyoutDays: p.buyoutDays ?? null, reason: p.reason, approvedAt: new Date().toISOString() };
    const history = Array.isArray(k.noticeArrangement) ? (k.noticeArrangement as Prisma.JsonArray) : [];
    await tx.exitCase.update({ where: { id }, data: { approvedLwd: asDate(p.lwd), noticeArrangement: [...history, arrangement] as Prisma.InputJsonValue, changeKind: null, changeWfRequestId: null, changePayload: Prisma.DbNull, version: { increment: 1 } } });
    const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'exit_case', subjectId: id, status: { not: 'cancelled' } } });
    if (j) await this.journeys.reanchorIn(tx, c, j.id, p.lwd);
    await freezeSettlementIn(tx, c, id, 'lwd_changed');
    await audit(tx, c, 'exit.lwd.changed', 'exit_case', id, arrangement);
    if (from !== p.lwd) await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'exit.lwd.changed', payload: { exitCaseId: id, employeeId: k.employeeId, from, to: p.lwd } } });
  }

  private async tellClearanceOwners(ctx: CompanyContext, exitCaseId: string) {
    const items = await this.tenantPrisma.forTenant(ctx, (tx) => tx.clearanceItem.findMany({ where: { organizationId: ctx.organizationId, exitCaseId, status: 'open' }, select: { ownerUserId: true, ownerGroupId: true } }));
    const groups = [...new Set(items.map((i) => i.ownerGroupId).filter((g): g is string => Boolean(g)))];
    const members = groups.length ? await this.tenantPrisma.forTenant(ctx, (tx) => tx.userGroupMember.findMany({ where: { organizationId: ctx.organizationId, groupId: { in: groups } }, select: { userId: true } })) : [];
    const users = [...new Set([...items.map((i) => i.ownerUserId), ...members.map((m) => m.userId)].filter((u): u is string => Boolean(u)))];
    if (users.length)
      await this.notifications
        .notifySystem(ctx, users, 'exit.clearance.assigned', { entityType: 'exit_case', entityId: exitCaseId, contextText: 'A leaver needs your clearance sign-off', linkPath: '/yx/people/clearance' }, { subject: 'A clearance sign-off is waiting for you', html: '<p>A clearance item for someone leaving is waiting for you in YukthiX.</p>' })
        .catch(() => undefined);
  }

  // ------------------------------------------------------------------------------------------ notice changes (LIFE-3.03)

  async requestNoticeChange(ctx: TenantContext, user: ScopeUser, id: string, dto: NoticeChangeDto) {
    const v = await this.viewer(user);
    let notices: Notice[] = [];
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { k, a } = await this.caseOr404(tx, c, v, id);
      if (!a.manage) throw new ForbiddenException('Only HR changes the last working day.');
      if (k.status !== 'accepted') throw new ConflictException('Only an accepted exit can change its last working day.');
      if (k.version !== dto.version) throw new ConflictException('Someone else changed this exit. Reload it.');
      if (k.changeKind) throw new ConflictException('A change is already waiting for a decision.');
      const current = iso(k.approvedLwd!);
      if (dto.lwd < todayIst()) throw new BadRequestException('The new last working day cannot be in the past.');
      if (dto.lwd === current) throw new BadRequestException('That is already the last working day.');
      if (dto.kind === 'early_release' && dto.lwd > current) throw new BadRequestException('An early release moves the last day earlier.');
      if (dto.kind === 'buyout' && (!dto.buyoutBy || !dto.buyoutDays)) throw new BadRequestException('Say who buys out the notice and for how many days.');
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: k.employeeId } });
      const deciders = await this.hrDeciders(tx, org, k.employeeId, [c.userId]);
      const label = dto.kind === 'early_release' ? 'Early release' : dto.kind === 'buyout' ? 'Notice buy-out' : 'New last working day';
      const sub = await this.approvals.submit(tx, c, {
        type: T.notice,
        subjectType: 'exit_case',
        subjectId: k.id,
        title: `${label}: ${displayName(emp)}`,
        summary: [
          { label: 'Last working day now', value: current },
          { label: 'Asked for', value: dto.lwd },
          ...(dto.kind === 'buyout' ? [{ label: 'Buy-out', value: `${dto.buyoutDays} days, paid by the ${dto.buyoutBy}` }] : []),
        ],
        subjectPersonId: k.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'HR', approvers: deciders.length ? [{ kind: 'users', userIds: deciders.slice(0, 25) }] : [], mode: 'any' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: deciders,
      });
      notices = sub.notices;
      await tx.exitCase.update({ where: { id }, data: { changeKind: dto.kind, changeWfRequestId: sub.id, changePayload: { lwd: dto.lwd, buyoutBy: dto.buyoutBy ?? null, buyoutDays: dto.buyoutDays ?? null, reason: dto.reason.trim() }, version: { increment: 1 } } });
      await audit(tx, c, 'exit.notice_change.requested', 'exit_case', id, { kind: dto.kind, lwd: dto.lwd });
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ HR-only facts and holds

  async setHrFacts(ctx: TenantContext, user: ScopeUser, id: string, dto: HrFactsDto) {
    const v = await this.viewer(user);
    const released = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { k, a } = await this.caseOr404(tx, c, v, id);
      if (!a.manage || !a.confidential) throw new ForbiddenException('HR-only facts need the confidential exit key.');
      if (k.version !== dto.version) throw new ConflictException('Someone else changed this exit. Reload it.');
      if (dto.hold && !dto.holdReason?.trim()) throw new BadRequestException('Say why the letters are on hold (HR only).');
      await this.confidential(tx);
      await tx.exitCaseHr.update({
        where: { exitCaseId: id },
        data: {
          ...(dto.rehireEligible !== undefined ? { rehireEligible: dto.rehireEligible, rehireReason: dto.rehireReason?.trim() || null } : {}),
          ...(dto.regretted !== undefined ? { regretted: dto.regretted } : {}),
          ...(dto.backfillRequested !== undefined ? { backfillRequested: dto.backfillRequested } : {}),
          ...(dto.hold !== undefined ? { holdReason: dto.hold ? dto.holdReason!.trim() : null, holdReviewOn: dto.hold && dto.holdReviewOn ? asDate(dto.holdReviewOn) : null } : {}),
          updatedBy: c.userId ?? null,
        },
      });
      await tx.exitCase.update({ where: { id }, data: { ...(dto.hold !== undefined ? { lettersHeld: dto.hold } : {}), version: { increment: 1 } } });
      // The audit row says what changed, never the reasons (they stay in the HR-only table).
      await audit(tx, c, 'exit.hr_facts.updated', 'exit_case', id, { fields: Object.keys(dto).filter((x) => x !== 'version' && !x.endsWith('Reason')) });
      if (dto.hold !== undefined && dto.hold !== k.lettersHeld && ['accepted', 'cleared', 'exited'].includes(k.status)) await freezeSettlementIn(tx, c, id, 'hold');
      return dto.hold === false && k.lettersHeld && (k.status === 'exited' || k.status === 'closed') ? c.organizationId : null;
    });
    // LIFE-4.03: letters held at the last day are issued as soon as HR releases them (into the alumni vault).
    if (released) await this.lastDay.released(released, id);
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ lists and the workspace

  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.exitCase.findMany({ where: { organizationId: org, status: { notIn: ['withdrawn', 'rejected'] } }, orderBy: { createdAt: 'desc' }, take: 500 });
      // Company-wide HR sees every case without a per-case scope check; anyone else is checked case by case.
      const own = await ownOf(tx, c, v);
      const wide = !v.actingForOther && (tenantWide(v, 'lifecycle.exit.view') || tenantWide(v, 'lifecycle.exit.manage'));
      const wideManage = !v.actingForOther && tenantWide(v, 'lifecycle.exit.manage');
      const shown: { k: Case; manage: boolean }[] = [];
      for (const k of rows) {
        if (k.employeeId === own.employeeId) continue;
        if (wide) shown.push({ k, manage: wideManage });
        else {
          const a = await this.access(tx, c, v, k);
          if (a.view && !a.self) shown.push({ k, manage: a.manage });
        }
      }
      const ids = shown.map((x) => x.k.id);
      const [emps, jobs, items, ivs] = await Promise.all([
        tx.employee.findMany({ where: { organizationId: org, id: { in: shown.map((x) => x.k.employeeId) } } }),
        tx.employment.findMany({ where: { organizationId: org, id: { in: shown.map((x) => x.k.employmentId) } }, select: { id: true, employeeCode: true } }),
        tx.clearanceItem.groupBy({ by: ['exitCaseId', 'status'], where: { organizationId: org, exitCaseId: { in: ids } }, _count: { _all: true } }),
        tx.exitInterview.findMany({ where: { organizationId: org, exitCaseId: { in: ids } }, select: { exitCaseId: true, status: true } }),
      ]);
      const out = shown.map(({ k, manage }) => {
        const mine = items.filter((i) => i.exitCaseId === k.id);
        return {
          ...this.caseView(k, { reasonVisible: true }),
          name: displayName(emps.find((e) => e.id === k.employeeId)!),
          employeeCode: jobs.find((j) => j.id === k.employmentId)?.employeeCode ?? null,
          clearance: { open: mine.filter((i) => i.status === 'open').reduce((n, i) => n + i._count._all, 0), total: mine.reduce((n, i) => n + i._count._all, 0) },
          interview: ivs.find((i) => i.exitCaseId === k.id)?.status ?? null,
          canManage: manage,
        };
      });
      return { today: todayIst(), rows: out };
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { k, a } = await this.caseOr404(tx, c, v, id);
      if (a.self && !a.view) throw new NotFoundException('No such exit.');
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: k.employeeId } });
      const items = await tx.clearanceItem.findMany({ where: { organizationId: org, exitCaseId: id }, orderBy: { createdAt: 'asc' } });
      const iv = await tx.exitInterview.findFirst({ where: { organizationId: org, exitCaseId: id }, select: { status: true } });
      const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'exit_case', subjectId: id }, select: { id: true, status: true } });
      let hr = null;
      if (a.confidential) {
        await this.confidential(tx);
        const h = await tx.exitCaseHr.findUnique({ where: { exitCaseId: id } });
        if (h) hr = { rehireEligible: h.rehireEligible, rehireReason: h.rehireReason, regretted: h.regretted, backfillRequested: h.backfillRequested, openCaseFlags: h.openCaseFlags, holdReason: h.holdReason, holdReviewOn: isoOrNull(h.holdReviewOn) };
      }
      const names = await this.userNames(tx, org, items.map((i) => i.ownerUserId));
      const groups = await this.groupNames(tx, org, items.map((i) => i.ownerGroupId));
      return {
        ...this.caseView(k, { reasonVisible: true }),
        name: displayName(emp),
        employeeCode: (await tx.employment.findFirst({ where: { organizationId: org, id: k.employmentId }, select: { employeeCode: true } }))?.employeeCode ?? null,
        journeyId: j?.status !== 'cancelled' ? (j?.id ?? null) : null,
        interview: iv?.status ?? null,
        clearance: items.map((i) => this.itemView(i, names, groups)),
        hr,
        can: { manage: a.manage, confidential: a.confidential && a.manage, interview: a.confidential },
        typeLabels: TYPE_LABEL,
      };
    });
  }

  itemView(i: Prisma.ClearanceItemGetPayload<object>, names: Map<string, string>, groups: Map<string, string>) {
    return {
      id: i.id,
      department: i.department,
      title: i.title,
      owner: (i.ownerUserId && names.get(i.ownerUserId)) || (i.ownerGroupId && groups.get(i.ownerGroupId)) || 'HR',
      status: i.status,
      note: i.note,
      recoveryAmount: i.recoveryAmount?.toFixed(2) ?? null,
      recoveryReason: i.recoveryReason,
      assetAssignmentId: i.assetAssignmentId,
      signedOffAt: i.signedOffAt?.toISOString() ?? null,
      version: i.version,
    };
  }

  async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(users.map((u) => [u.id, u.name || u.email]));
  }

  async groupNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const g = list.length ? await tx.userGroup.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true } }) : [];
    return new Map(g.map((x) => [x.id, x.name]));
  }

  // ------------------------------------------------------------------------------------------ probation review (LIFE-3.01)

  /**
   * The direct manager (or HR with employee.change.manage) reviews a running probation: confirm sends a confirmation
   * change for approval (never confirmed at once), extend applies within the company maximum, terminate opens a
   * "probation not confirmed" exit that another HR person approves. Nobody reviews their own probation.
   */
  async reviewProbation(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: ProbationReviewDto) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Reviews are made by the manager, signed in as themselves.');
    let notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      if (own.employeeId === employeeId) throw new ForbiddenException('Someone else reviews your own probation.');
      const e = await this.employmentOf(tx, org, employeeId).catch(() => null);
      if (!e) throw new NotFoundException('No such probation.');
      const today = todayIst();
      const a = await this.assignmentOn(tx, org, e.id, today);
      const isManager = Boolean(own.employeeId && a?.managerEmployeeId === own.employeeId);
      const isHr = !isManager && (await this.history.reaches(tx, c, v, 'employee.change.manage', employeeId, today));
      if (!isManager && !isHr) throw new NotFoundException('No such probation.');
      await this.history.lockEmployment(tx, c, e.id);
      const p = await tx.probation.findFirst({ where: { organizationId: org, employmentId: e.id } });
      if (!p) throw new NotFoundException('No such probation.');
      const state = await this.people.confirmationState(tx, c, e.id);
      if (state.confirmedFrom) throw new ConflictException('The probation is already confirmed.');
      if (state.pendingChangeId) throw new ConflictException('A confirmation is already waiting for approval.');
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId } });
      let changeId: string | null = null;
      let exitCaseId: string | null = null;
      if (dto.outcome === 'confirm') {
        const from = iso(new Date(p.plannedEndOn.getTime() + 86_400_000));
        const ch = await tx.employeeChange.create({ data: { organizationId: org, employeeId, employmentId: e.id, changeType: 'confirmation', effectiveDate: asDate(from < today ? today : from), status: 'pending', payload: { status: 'confirmed' }, reason: `Probation review: ${dto.comments.trim()}`.slice(0, 1000), requestedBy: c.userId ?? null } });
        await audit(tx, c, 'employee.change.requested', 'employee', employeeId, { changeId: ch.id, changeType: 'confirmation', effectiveDate: from, via: 'probation_review' });
        changeId = ch.id;
      } else if (dto.outcome === 'extend') {
        if (!dto.months) throw new BadRequestException('Say by how many months.');
        await this.people.extendIn(tx, c, e, p, dto.months, dto.comments);
      } else {
        const n = await this.noticeOn(tx, c, e, today);
        const k = await this.openCompanyCase(tx, c, emp, { employeeId, exitType: 'probation_termination', lwd: standardLwd(today, n.period), reasonCode: 'probation_review', reasonText: dto.comments });
        notices = await this.submitCompany(tx, c, k, emp, [c.userId]);
        exitCaseId = k.id;
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'employee.probation.terminated', payload: { employeeId, employmentId: e.id, exitCaseId } } });
      }
      await tx.probationReview.create({ data: { organizationId: org, employmentId: e.id, reviewerUserId: c.userId!, outcome: dto.outcome, months: dto.outcome === 'extend' ? dto.months! : null, comments: dto.comments.trim(), rating: dto.rating ?? null, changeId, exitCaseId } });
      await audit(tx, c, 'employee.probation.reviewed', 'employee', employeeId, { outcome: dto.outcome, by: isManager ? 'manager' : 'hr' });
      return { org, employeeId, name: displayName(emp), outcome: dto.outcome, hr: await this.hrDeciders(tx, org, employeeId, [c.userId]) };
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    const words = { confirm: 'recommended confirming', extend: 'extended', terminate: 'recommended ending' }[res.outcome];
    await this.notifications
      .notifySystem({ organizationId: res.org, isSuperAdmin: false }, res.hr, 'probation.review.done', { entityType: 'employee', entityId: res.employeeId, contextText: `A probation was reviewed: ${words}`, linkPath: '/yx/people/probation' }, { subject: 'A probation review was made', html: '<p>A manager reviewed a probation. See it in YukthiX.</p>' })
      .catch(() => undefined);
    return { outcome: res.outcome };
  }
}
