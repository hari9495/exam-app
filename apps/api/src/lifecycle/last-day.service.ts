import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer } from '../access/scope';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { LettersService } from '../documents/letters/letters.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../rules-engine/automation.service';
import { ownOf, reachesPerson } from '../documents/person-access';
import { entitiesFor } from '../payroll/pay-access';
import { holdersOf } from '../time/time-core';
import { lwdStage } from './exit-rules';
import { freezeSettlementIn, settlementOf } from './settlement';

// Lifecycle batch 6d (design §10.7, §11): the last working day and after.
//   at the LWD   (morning, IST) employment.lwd_approaching; open approvals and checklist tasks the leaver holds move to
//                their manager (or HR) while the person is still active;
//   T+0          (once the LWD is over in India) the P06 exit change ends the employment (exited_on), then sessions and
//                refresh tokens are revoked, the login closed, delegations ended, desk seats ended, and the relieving
//                and experience letters issued (unless HR holds them); the final payroll hand-off revision is frozen;
//   cleared      the no-dues certificate.
// Every step is a row on the deprovisioning panel: idempotent, retried up to 3 times, then HR is told; HR can retry
// or mark a step done by hand. Steps of modules not built yet are added when those modules are built.

type Timing = 'at_lwd' | 't0' | 'cleared';
interface Leaver {
  org: string;
  caseId: string;
  personId: string;
  employeeId: string;
  userId: string | null;
  takeover: string | null;
  lwd: string;
  lettersHeld: boolean;
}
type Step = { timing: Timing; label: string; run: (x: Leaver) => Promise<'done' | 'held'> };
const MAX_ATTEMPTS = 3;
const KEYS = ['lifecycle.exit.view', 'lifecycle.exit.manage', 'payroll.period.view'] as const;

@Injectable()
export class LastDayService implements OnModuleInit {
  private readonly logger = new Logger(LastDayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly letters: LettersService,
    private readonly notifications: NotificationsService,
    private readonly automation: AutomationService,
  ) {}

  onModuleInit() {
    this.automation.subscribe(async (ev) => {
      const id = typeof ev.payload.exitCaseId === 'string' ? ev.payload.exitCaseId : null;
      if (!id) return;
      // A death or absconding case records a past day: it ends at once. A cleared case gets its no-dues certificate.
      if (ev.type === 'exit.case.accepted') await this.sweepCase(ev.organizationId, id);
      if (ev.type === 'exit.case.cleared') await this.runStepsOf(ev.organizationId, id, ['cleared']);
    });
  }

  // ------------------------------------------------------------------------------------------ the steps

  private readonly steps: Record<string, Step> = {
    'workflow.reassign': { timing: 'at_lwd', label: 'Open approvals moved to the manager', run: (x) => this.inOrg(x.org, async (tx) => this.moveApprovals(tx, x)) },
    'journey.tasks': { timing: 'at_lwd', label: 'Checklist tasks moved to the manager', run: (x) => this.inOrg(x.org, async (tx) => this.moveTasks(tx, x)) },
    'auth.sessions': {
      timing: 't0',
      label: 'Signed out everywhere',
      run: (x) =>
        this.inOrg(x.org, async (tx) => {
          if (!x.userId) return 'done';
          await tx.refreshToken.updateMany({ where: { userId: x.userId, revokedAt: null }, data: { revokedAt: new Date() } });
          await revokeStaffSessions(tx, { userId: x.userId }, 'employment_ended');
          return 'done' as const;
        }),
    },
    'auth.login': {
      timing: 't0',
      label: 'Staff login closed (alumni login instead)',
      run: (x) =>
        this.inOrg(x.org, async (tx) => {
          if (x.userId) await tx.user.updateMany({ where: { organizationId: x.org, id: x.userId, status: 'active' }, data: { status: 'deactivated' } });
          return 'done' as const;
        }),
    },
    'workflow.delegations': {
      timing: 't0',
      label: 'Approval delegations ended',
      run: (x) =>
        this.inOrg(x.org, async (tx) => {
          if (x.userId) await tx.wfDelegation.updateMany({ where: { organizationId: x.org, revokedAt: null, OR: [{ userId: x.userId }, { delegateUserId: x.userId }] }, data: { revokedAt: new Date() } });
          return 'done' as const;
        }),
    },
    'desk.seats': {
      timing: 't0',
      label: 'Service Desk seats ended',
      run: (x) =>
        this.inOrg(x.org, async (tx) => {
          if (!x.userId) return 'done';
          await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
          await tx.sdDeskMember.updateMany({ where: { organizationId: x.org, userId: x.userId, validTo: null }, data: { validTo: new Date(`${x.lwd}T00:00:00Z`), endedAt: new Date() } });
          return 'done' as const;
        }),
    },
    'letters.relieving': { timing: 't0', label: 'Relieving letter', run: (x) => this.letter(x, 'relieving', true) },
    'letters.experience': { timing: 't0', label: 'Experience letter', run: (x) => this.letter(x, 'experience', true) },
    'letters.no_dues': { timing: 'cleared', label: 'No-dues certificate', run: (x) => this.letter(x, 'no_dues', false) },
  };

  private inOrg<T>(org: string, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, (tx) => fn(tx, c));
  }

  private async moveApprovals(tx: Tx, x: Leaver) {
    if (x.userId && x.takeover) await tx.wfTask.updateMany({ where: { organizationId: x.org, assigneeUserId: x.userId, status: 'open' }, data: { assigneeUserId: x.takeover } });
    return 'done' as const;
  }

  private async moveTasks(tx: Tx, x: Leaver) {
    if (!x.userId || !x.takeover) return 'done' as const;
    const others = await tx.journey.findMany({ where: { organizationId: x.org, personId: { not: x.personId }, status: 'active' }, select: { id: true } });
    await tx.journeyTask.updateMany({ where: { organizationId: x.org, journeyId: { in: others.map((j) => j.id) }, assigneeUserId: x.userId, status: { in: ['open', 'waiting'] } }, data: { assigneeUserId: x.takeover, version: { increment: 1 } } });
    return 'done' as const;
  }

  /** Issues a letter of this type for the exit once (held while HR holds the letters). */
  private async letter(x: Leaver, letterType: string, holdable: boolean): Promise<'done' | 'held'> {
    if (holdable && x.lettersHeld) return 'held';
    const already = await this.inOrg(x.org, (tx) => tx.letterIssue.findFirst({ where: { organizationId: x.org, personId: x.personId, letterType, subjectType: 'exit_case', subjectId: x.caseId, status: { notIn: ['rejected', 'withdrawn'] } }, select: { id: true } }));
    if (!already) await this.letters.issueSystem({ organizationId: x.org, isSuperAdmin: false, userId: null }, { letterType, personId: x.personId, subjectType: 'exit_case', subjectId: x.caseId });
    return 'done';
  }

  // ------------------------------------------------------------------------------------------ running

  private async leaver(tx: Tx, org: string, caseId: string): Promise<Leaver> {
    const k = await tx.exitCase.findFirstOrThrow({ where: { organizationId: org, id: caseId } });
    const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: k.employeeId } });
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: k.employmentId, supersededAt: null }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } });
    const mgr = a?.managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { userId: true } }) : null;
    const hr = (await holdersOf(tx, org, 'lifecycle.exit.manage', k.employeeId, todayIst())).filter((u) => u !== emp.userId)[0] ?? null;
    return { org, caseId, personId: k.personId, employeeId: k.employeeId, userId: emp.userId, takeover: mgr?.userId && mgr.userId !== emp.userId ? mgr.userId : hr, lwd: (k.approvedLwd ?? k.standardLwd).toISOString().slice(0, 10), lettersHeld: k.lettersHeld };
  }

  private schedule(tx: Tx, org: string, caseId: string, timing: Timing) {
    return tx.exitDeprovisioning.createMany({ data: Object.entries(this.steps).filter(([, s]) => s.timing === timing).map(([handler]) => ({ organizationId: org, exitCaseId: caseId, handler, timing })), skipDuplicates: true });
  }

  /** Runs every pending (or failed, under its limit) step of these timings; each in its own transaction. */
  async runStepsOf(org: string, caseId: string, timings: Timing[], force = false) {
    await this.inOrg(org, async (tx) => {
      for (const t of timings) await this.schedule(tx, org, caseId, t);
    });
    const rows = await this.inOrg(org, (tx) => tx.exitDeprovisioning.findMany({ where: { organizationId: org, exitCaseId: caseId, timing: { in: timings }, status: { in: force ? ['pending', 'held', 'failed'] : ['pending', 'held'] } } }));
    const failed: string[] = [];
    for (const r of rows) {
      const step = this.steps[r.handler];
      if (!step) continue;
      try {
        const x = await this.inOrg(org, (tx) => this.leaver(tx, org, caseId));
        const out = await step.run(x);
        await this.inOrg(org, (tx) => tx.exitDeprovisioning.update({ where: { id: r.id }, data: out === 'held' ? { status: 'held', lastError: 'Letters are on hold' } : { status: 'done', doneAt: new Date(), lastError: null, attempts: { increment: 1 } } }));
      } catch (e) {
        // A plain reason, never personal data (the letter engine says "no active template", "missing field" and so on).
        const msg = (e instanceof BadRequestException || e instanceof ConflictException ? (e.message as string) : 'The step failed. It is tried again.').slice(0, 500);
        const attempts = r.attempts + 1;
        await this.inOrg(org, (tx) => tx.exitDeprovisioning.update({ where: { id: r.id }, data: { attempts, lastError: msg, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' } }));
        if (attempts >= MAX_ATTEMPTS) failed.push(step.label);
        this.logger.warn(`exit step ${r.handler} for ${caseId}: ${msg}`);
      }
    }
    if (failed.length) await this.alertHr(org, caseId, failed);
  }

  private async alertHr(org: string, caseId: string, failed: string[]) {
    const to = await this.inOrg(org, async (tx) => {
      const k = await tx.exitCase.findFirstOrThrow({ where: { organizationId: org, id: caseId }, select: { employeeId: true } });
      return holdersOf(tx, org, 'lifecycle.exit.manage', k.employeeId, todayIst());
    });
    await tellHr(this.notifications, { organizationId: org, isSuperAdmin: false }, to, caseId, failed.join(', '));
  }

  /** Moves one exit on, as far as today allows (idempotent: safe to run again and again). */
  async sweepCase(org: string, caseId: string, now = new Date()) {
    const today = todayIst(now);
    const stage = await this.inOrg(org, async (tx, c) => {
      const k = await tx.exitCase.findFirst({ where: { organizationId: org, id: caseId, status: { in: ['accepted', 'cleared'] } } });
      if (!k?.approvedLwd) return null;
      const lwd = k.approvedLwd.toISOString().slice(0, 10);
      const s = lwdStage(lwd, today);
      if (s === 'ahead') return null;
      if (!k.lwdNotifiedOn) {
        await tx.exitCase.update({ where: { id: k.id }, data: { lwdNotifiedOn: new Date(`${today}T00:00:00Z`) } });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'employment.lwd_approaching', payload: { exitCaseId: k.id, employeeId: k.employeeId, lastDay: lwd } } });
      }
      if (s === 'over') {
        const ended = await this.history.exitIn(tx, c, k.employmentId, lwd, `Left on ${lwd} (${k.exitType.replace(/_/g, ' ')})`);
        await tx.exitCase.update({ where: { id: k.id }, data: { status: 'exited', version: { increment: 1 } } });
        await freezeSettlementIn(tx, c, k.id, 'exited');
        await audit(tx, c, 'employment.exited', 'exit_case', k.id, { lastDay: lwd, newlyEnded: ended });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'employment.exited', payload: { exitCaseId: k.id, employeeId: k.employeeId, lastDay: lwd } } });
      }
      return s;
    });
    if (stage) await this.runStepsOf(org, caseId, stage === 'over' ? ['at_lwd', 't0'] : ['at_lwd']);
  }

  /** The hourly job: every company's exits whose last day has come; then pending steps of those that ended. */
  async sweep(now = new Date()): Promise<number> {
    const today = todayIst(now);
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.exitCase.findMany({ where: { OR: [{ status: { in: ['accepted', 'cleared'] }, approvedLwd: { lte: new Date(`${today}T00:00:00Z`) } }, { status: { in: ['exited', 'closed'] } }] }, select: { id: true, organizationId: true, status: true } }),
    );
    let n = 0;
    for (const d of due) {
      try {
        if (d.status === 'exited' || d.status === 'closed') {
          // Steps that failed earlier are tried again, up to their limit; held letters wait for the release.
          const open = await this.inOrg(d.organizationId, (tx) => tx.exitDeprovisioning.count({ where: { organizationId: d.organizationId, exitCaseId: d.id, status: 'pending' } }));
          if (open) await this.runStepsOf(d.organizationId, d.id, ['at_lwd', 't0', 'cleared']);
        } else await this.sweepCase(d.organizationId, d.id, now);
        n++;
      } catch (e) {
        this.logger.error(`last-day sweep ${d.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ HR: panel, hand-off, settled outside

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private async manageable(tx: Tx, c: CompanyContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, id } });
    const own = await ownOf(tx, c, v);
    if (!k || v.actingForOther || own.employeeId === k.employeeId || !(await reachesPerson(tx, c, v, 'lifecycle.exit.manage', k.personId, own))) throw new NotFoundException('No such exit.');
    return { k, v };
  }

  async panel(ctx: TenantContext, user: ScopeUser, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.manageable(tx, c, user, id);
      const rows = await tx.exitDeprovisioning.findMany({ where: { organizationId: c.organizationId, exitCaseId: id }, orderBy: { createdAt: 'asc' } });
      return rows.map((r) => ({ handler: r.handler, label: this.steps[r.handler]?.label ?? r.handler, timing: r.timing, status: r.status, attempts: r.attempts, lastError: r.lastError, doneAt: r.doneAt?.toISOString() ?? null }));
    });
  }

  async retry(ctx: TenantContext, user: ScopeUser, id: string, handler: string) {
    const org = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.manageable(tx, c, user, id);
      const n = await tx.exitDeprovisioning.updateMany({ where: { organizationId: c.organizationId, exitCaseId: id, handler, status: { in: ['failed', 'held', 'pending'] } }, data: { attempts: 0 } });
      if (!n.count) throw new ConflictException('That step is already done.');
      await audit(tx, c, 'exit.step.retried', 'exit_case', id, { handler });
      return c.organizationId;
    });
    const row = await this.inOrg(org, (tx) => tx.exitDeprovisioning.findFirstOrThrow({ where: { organizationId: org, exitCaseId: id, handler } }));
    await this.runStepsOf(org, id, [row.timing as Timing], true);
    return this.panel(ctx, user, id);
  }

  async manualDone(ctx: TenantContext, user: ScopeUser, id: string, handler: string, note: string) {
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.manageable(tx, c, user, id);
      const n = await tx.exitDeprovisioning.updateMany({ where: { organizationId: c.organizationId, exitCaseId: id, handler, status: { in: ['failed', 'pending', 'held'] } }, data: { status: 'manual', doneAt: new Date(), doneBy: c.userId ?? null, lastError: note.slice(0, 500) } });
      if (!n.count) throw new ConflictException('That step is already done.');
      await audit(tx, c, 'exit.step.manual', 'exit_case', id, { handler });
    });
    return this.panel(ctx, user, id);
  }

  /** HR released the hold: held letters are issued now (the leaver's alumni vault gets them). */
  async released(org: string, caseId: string) {
    await this.runStepsOf(org, caseId, ['t0']);
  }

  /** PPL-22 hand-off view: HR managing the exit, or payroll staff of the legal entity. No amounts are computed. */
  async handoff(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!k) throw new NotFoundException('No such exit.');
      const e = await tx.employment.findFirstOrThrow({ where: { organizationId: c.organizationId, id: k.employmentId } });
      const own = await ownOf(tx, c, v);
      const hr = !v.actingForOther && own.employeeId !== k.employeeId && (await reachesPerson(tx, c, v, 'lifecycle.exit.manage', k.personId, own));
      const pay = (await entitiesFor(tx, c, v, 'payroll.period.view')).includes(e.legalEntityId) && own.employeeId !== k.employeeId;
      if (!hr && !pay) throw new NotFoundException('No such exit.');
      const rows = await settlementOf(tx, c.organizationId, id, e.legalEntityId);
      await audit(tx, c, 'exit.handoff.viewed', 'exit_case', id, {});
      const view = (r: (typeof rows)[number]) => ({ revision: r.revision, cause: r.cause, lwd: r.lwd.toISOString().slice(0, 10), wagesDueBy: r.wagesDueBy.toISOString().slice(0, 10), noticePeriod: r.noticePeriod, noticeServedDays: r.noticeServedDays, noticeArrangement: r.noticeArrangement, recoveries: r.recoveries, holds: r.holds, frozenAt: r.frozenAt.toISOString() });
      return {
        current: rows[0] ? view(rows[0]) : null,
        earlier: rows.slice(1).map((r) => ({ revision: r.revision, cause: r.cause, frozenAt: r.frozenAt.toISOString() })),
        settledOutside: k.settledOutsideOn ? { on: k.settledOutsideOn.toISOString().slice(0, 10), reason: k.settledOutsideReason } : null,
        canSettle: hr && k.status === 'exited',
      };
    });
  }

  /** D11: until payroll's F&F exists, HR records that the settlement was made outside YukthiX; the exit then closes. */
  async settledOutside(ctx: TenantContext, user: ScopeUser, id: string, dto: { settledOn: string; reason: string }) {
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { k } = await this.manageable(tx, c, user, id);
      if (k.status !== 'exited') throw new ConflictException('Only an exit whose last day is over can be settled.');
      if (dto.settledOn > todayIst()) throw new BadRequestException('The settlement day cannot be in the future.');
      await tx.exitCase.update({ where: { id }, data: { status: 'closed', settledOutsideOn: new Date(`${dto.settledOn}T00:00:00Z`), settledOutsideReason: dto.reason.trim(), settledBy: c.userId ?? null, version: { increment: 1 } } });
      await audit(tx, c, 'exit.settled_outside', 'exit_case', id, { settledOn: dto.settledOn });
    });
    return this.handoff(ctx, user, id);
  }
}

/** Tell HR a step failed three times (exit.deprovisioning.failed; the text names the steps, never the person). */
async function tellHr(n: NotificationsService, ctx: TenantContext, to: string[], caseId: string, steps: string) {
  if (!to.length) return;
  await n
    .notifySystem(ctx, to, 'exit.deprovisioning.failed', { entityType: 'exit_case', entityId: caseId, contextText: `Exit steps need you: ${steps}`, linkPath: `/yx/people/exits/${caseId}` }, { subject: 'An exit step needs you', html: '<p>A step after someone left did not go through. Open the exit in YukthiX to retry it or mark it done.</p>' })
    .catch(() => undefined);
}

