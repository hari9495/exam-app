import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, tenantWide } from '../access/scope';
import { ownOf } from '../documents/person-access';
import { addDays, daysBetween, firstThirtyBuckets } from './journey-rules';
import { LifecycleJourneysService, type StartInput } from './journeys.service';
import { LIFE_EVENT_KINDS, type LifeEventKind } from './starters';

// LIFE-6.02…6.04 (design §7.5 / §7.6): life-event journeys on the 6a engine, started by an hourly look at the facts
// (a first direct report, an approved transfer, approved maternity / paternity leave), so the core and leave modules
// stay untouched (batch G1 owns the core record). The company's template must be active; facts older than 7 days or
// dated before the template existed start nothing. One journey per subject and kind (journeys_subject_key).

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const PARENTAL = ['maternity', 'paternity'];
const LEAVE_ON = ['approved', 'cancel_pending'];
const KIND_LABEL: Record<LifeEventKind, string> = { new_manager: 'New manager', transfer: 'Transfer', parental_leave: 'Parental leave', return_to_work: 'Return to work' };

interface Candidate {
  kind: LifeEventKind;
  subjectType: StartInput['subjectType'];
  subjectId: string;
  employeeId: string;
  anchorOn: string;
}

@Injectable()
export class LifeEventsService {
  private readonly logger = new Logger(LifeEventsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly journeys: LifecycleJourneysService,
  ) {}

  // ------------------------------------------------------------------------------------------ hourly start / cancel

  async sweep(today = todayIst()): Promise<{ started: number; cancelled: number }> {
    const templates = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.journeyTemplate.findMany({ where: { kind: { in: [...LIFE_EVENT_KINDS] }, active: true }, select: { organizationId: true, kind: true, createdAt: true } }),
    );
    let started = 0;
    let cancelled = 0;
    for (const org of new Set(templates.map((t) => t.organizationId))) {
      const ctx = { organizationId: org, isSuperAdmin: false };
      cancelled += await this.tenantPrisma.forTenant(ctx, (tx) => this.cancelStale(tx, ctx));
      // The earliest anchor each kind may start from: 7 days back, and never before the company's template existed.
      const from = new Map<string, string>();
      for (const t of templates.filter((x) => x.organizationId === org)) {
        const f = [addDays(today, -7), iso(t.createdAt)].sort()[1];
        if (!from.has(t.kind) || f < from.get(t.kind)!) from.set(t.kind, f);
      }
      const found = await this.tenantPrisma.forTenant(ctx, (tx) => this.candidates(tx, org, from));
      for (const cand of found) {
        try {
          const id = await this.tenantPrisma.forTenant(ctx, (tx) => this.startOne(tx, ctx, cand));
          if (id) {
            started++;
            await this.journeys.afterStart(ctx, id, null, KIND_LABEL[cand.kind].toLowerCase());
          }
        } catch (e) {
          this.logger.warn(`${cand.kind} ${cand.subjectId}: ${(e as Error).message}`);
        }
      }
    }
    return { started, cancelled };
  }

  /** The facts that should have a journey and do not have one yet. */
  private async candidates(tx: Tx, org: string, from: Map<string, string>): Promise<Candidate[]> {
    const out: Candidate[] = [];
    const t = from.get('transfer');
    if (t) {
      const rows = await tx.employeeChange.findMany({ where: { organizationId: org, changeType: 'transfer', status: { in: ['scheduled', 'effective'] }, effectiveDate: { gte: asDate(t) } }, select: { id: true, employeeId: true, effectiveDate: true } });
      out.push(...rows.map((r) => ({ kind: 'transfer' as const, subjectType: 'employee_change' as const, subjectId: r.id, employeeId: r.employeeId, anchorOn: iso(r.effectiveDate) })));
    }
    const m = from.get('new_manager');
    if (m) {
      // A first-time manager: the earliest report they have on record starts on or after the cut-off.
      const rows = await tx.$queryRaw<{ manager: string; first: Date }[]>`
        SELECT a.manager_employee_id AS manager, MIN(a.valid_from) AS first FROM employee_assignments a
        WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
        GROUP BY a.manager_employee_id HAVING MIN(a.valid_from) >= ${m}::date`;
      const open = rows.length ? await tx.employment.findMany({ where: { organizationId: org, employeeId: { in: rows.map((r) => r.manager) }, exitedOn: null }, select: { id: true, employeeId: true } }) : [];
      for (const r of rows) {
        const e = open.find((x) => x.employeeId === r.manager);
        if (e) out.push({ kind: 'new_manager', subjectType: 'employment', subjectId: e.id, employeeId: r.manager, anchorOn: iso(r.first) });
      }
    }
    const p = from.get('parental_leave');
    const back = from.get('return_to_work');
    if (p || back) {
      const types = await tx.leaveType.findMany({ where: { organizationId: org, kind: { in: PARENTAL } }, select: { id: true } });
      const earliest = [p, back].filter((x): x is string => Boolean(x)).sort()[0];
      const rows = types.length
        ? await tx.leaveRequest.findMany({ where: { organizationId: org, leaveTypeId: { in: types.map((x) => x.id) }, status: { in: LEAVE_ON }, toOn: { gte: asDate(addDays(earliest, -1)) } }, select: { id: true, employeeId: true, fromOn: true, toOn: true } })
        : [];
      for (const r of rows) {
        if (p && iso(r.fromOn) >= p) out.push({ kind: 'parental_leave', subjectType: 'leave_request', subjectId: r.id, employeeId: r.employeeId, anchorOn: iso(r.fromOn) });
        const ret = addDays(iso(r.toOn), 1);
        if (back && ret >= back) out.push({ kind: 'return_to_work', subjectType: 'leave_request', subjectId: r.id, employeeId: r.employeeId, anchorOn: ret });
      }
    }
    if (!out.length) return out;
    const have = await tx.journey.findMany({ where: { organizationId: org, subjectId: { in: out.map((c) => c.subjectId) } }, select: { subjectId: true, kind: true } });
    return out.filter((c) => !have.some((h) => h.subjectId === c.subjectId && h.kind === c.kind));
  }

  /** Starts one journey from the most specific active template for the person's place on the anchor day. */
  private async startOne(tx: Tx, c: CompanyContext, cand: Candidate): Promise<string | null> {
    const org = c.organizationId;
    const emp = await tx.employee.findFirst({ where: { organizationId: org, id: cand.employeeId }, select: { personId: true, userId: true } });
    const asg = await tx.employeeAssignment.findFirst({
      where: { organizationId: org, employeeId: cand.employeeId, supersededAt: null, validFrom: { lte: asDate(cand.anchorOn) }, OR: [{ validTo: null }, { validTo: { gte: asDate(cand.anchorOn) } }] },
      orderBy: { validFrom: 'desc' },
    });
    if (!emp || !asg) return null;
    const place = { legalEntityId: asg.legalEntityId, locationId: asg.locationId, departmentId: asg.departmentId };
    const template = await this.journeys.pickTemplate(tx, org, cand.kind, place).catch(() => null);
    if (!template) return null; // no active template fits this place
    const j = await this.journeys.startIn(tx, c, {
      kind: cand.kind,
      personId: emp.personId,
      subjectType: cand.subjectType,
      subjectId: cand.subjectId,
      anchorOn: cand.anchorOn,
      templateId: template.id,
      place,
      ownerUserId: template.createdBy,
      managerEmployeeId: asg.managerEmployeeId,
      personUserId: emp.userId,
    });
    return j.id;
  }

  /** Leave rejected, withdrawn or cancelled, or a transfer cancelled: its active journeys close as cancelled. */
  private async cancelStale(tx: Tx, c: CompanyContext): Promise<number> {
    const org = c.organizationId;
    const live = await tx.journey.findMany({ where: { organizationId: org, status: 'active', subjectType: { in: ['leave_request', 'employee_change'] } }, select: { id: true, subjectType: true, subjectId: true } });
    if (!live.length) return 0;
    const leaves = await tx.leaveRequest.findMany({ where: { organizationId: org, id: { in: live.filter((j) => j.subjectType === 'leave_request').map((j) => j.subjectId) }, status: { in: LEAVE_ON } }, select: { id: true } });
    const changes = await tx.employeeChange.findMany({ where: { organizationId: org, id: { in: live.filter((j) => j.subjectType === 'employee_change').map((j) => j.subjectId) }, status: { in: ['scheduled', 'effective'] } }, select: { id: true } });
    const keep = new Set([...leaves, ...changes].map((x) => x.id));
    const gone = live.filter((j) => !keep.has(j.subjectId));
    for (const j of gone) {
      await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] } }, data: { status: 'cancelled', version: { increment: 1 } } });
      await tx.journey.update({ where: { id: j.id }, data: { status: 'cancelled' } });
      await audit(tx, c, 'journey.cancelled', 'journey', j.id, { reason: j.subjectType === 'leave_request' ? 'leave_not_taken' : 'change_cancelled' });
    }
    return gone.length;
  }

  // ------------------------------------------------------------------------------------------ HR list (LIFE-6.03)

  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.journeys.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.journey.findMany({ where: { organizationId: org, kind: { in: [...LIFE_EVENT_KINDS] }, status: 'active' }, orderBy: { anchorOn: 'asc' }, take: 200 });
      // Company-wide HR skips the per-journey check; others are checked one by one (at most 200 rows).
      const all = tenantWide(v, 'lifecycle.onboarding.view') || tenantWide(v, 'lifecycle.onboarding.manage');
      const seen: typeof rows = [];
      for (const j of rows) if (all || (await this.journeys.access(tx, c, v, j)).see) seen.push(j);
      const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: seen.map((j) => j.personId) } } });
      return {
        rows: seen.map((j) => {
          const p = persons.find((x) => x.id === j.personId);
          return { id: j.id, kind: j.kind, kindLabel: KIND_LABEL[j.kind as LifeEventKind], person: p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : '', anchorOn: iso(j.anchorOn), progress: j.progress };
        }),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ My first 30 days (LIFE-6.04)

  async firstThirtyDays(ctx: TenantContext, user: ScopeUser) {
    const v = await this.journeys.viewer(user);
    const today = todayIst();
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      if (!own.personId || !own.employeeId) return null;
      const j = await tx.journey.findFirst({ where: { organizationId: org, personId: own.personId, kind: 'onboarding', status: 'active', anchorOn: { lte: asDate(today), gte: asDate(addDays(today, -30)) } }, orderBy: { anchorOn: 'desc' } });
      if (!j) return null;
      const asg = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: own.employeeId, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } });
      const pb = j.subjectType === 'preboarding' ? await tx.preboarding.findFirst({ where: { organizationId: org, id: j.subjectId }, select: { buddyEmployeeId: true } }) : null;
      const name = async (employeeId: string | null | undefined) => {
        if (!employeeId) return null;
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { personId: true } });
        const p = e ? await tx.person.findFirst({ where: { organizationId: org, id: e.personId } }) : null;
        return p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : null;
      };
      const done = user.userId ? await tx.journeyTask.count({ where: { organizationId: org, journeyId: j.id, assigneeUserId: user.userId, status: { in: ['done', 'skipped'] } } }) : 0;
      return { journeyId: j.id, joinedOn: iso(j.anchorOn), manager: await name(asg?.managerEmployeeId), buddy: await name(pb?.buddyEmployeeId), done };
    });
    if (!found) return null;
    const mine = (await this.journeys.myTasks(ctx, user)).tasks.filter((t) => t.journeyId === found.journeyId);
    const b = firstThirtyBuckets(mine, today, found.joinedOn);
    return { ...found, date: today, day: daysBetween(found.joinedOn, today) + 1, today: b.today, week: b.week, month: b.month };
  }
}
