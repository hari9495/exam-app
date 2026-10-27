import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { addDays, asDate, IN_STATES, isoDate, todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { buildViewer, has, tenantWide } from '../access/scope';
import { displayName, EmployeeHistoryService, RequestUser, Viewer } from '../employee-history/employee-history.service';
import type { ChangeRequestDto, EmployeeCreateDto } from '../employee-history/dto';
import { FoldError } from '../employee-history/history-rules';
import { withPayScope } from '../payroll/pay-access';

// People › Restructure (PPL-09) and the continuity checklist (PPL-10). A plan moves people inside a legal entity
// (department, location, manager, cost centre) or from one legal entity to another (merge, close, demerge) on one
// effective date. It is checked person by person (a dry run through the real engine), sent once, and approved once by
// someone other than the sender (YX-SEC-11). On approval every person moves on their own: all or nothing per person,
// so one person's problem never stops the others, and each failure keeps its reason.
//
// A move between legal entities is the job-change engine's own steps: the old employment ends the day before (a
// system exit change, history kept), and a new employment on the same employee record starts on the effective date
// (a join through the hire path, rehire link to the old one). Service continuity, the employee code, probation, pay
// and leave follow the plan's options; what is left to do (PF, ESI, tax, loans) becomes the person's continuity
// checklist, which payroll checks show until it is done. A move never lands in a locked payroll month.

export type Kind = 'merge' | 'close' | 'demerge' | 'within';
export interface MoveOptions {
  leave: 'carry' | 'lapse';
  service: 'keep' | 'restart';
  code: 'keep' | 'new';
  salary: 'keep' | 'new';
}
export interface Override extends Partial<MoveOptions> {
  employeeId: string;
  leaveOut?: boolean;
  reason: string;
}
export interface Plan {
  /** demerge and within: who moves, by location (and department, within). */
  locationIds: string[];
  departmentIds: string[];
  /** Between entities: each old location's place in the new entity. */
  locationMap: Record<string, string>;
  /** Between entities: a department, designation, employment type or grade only for the old entity, and the one
   *  people take in the new entity (master ids are unique, so one map serves all four). */
  masterMap: Record<string, string>;
  /** within: the new place (each one optional). One person moving between entities (PPL-04): their new location, and
   *  a new department or designation when chosen (the maps then stay empty). */
  target: { departmentId?: string; locationId?: string; managerEmployeeId?: string | null; costCentreId?: string; designationId?: string; employmentTypeId?: string };
  /** PPL-04 Change action: the one person who moves (a demerge of one), instead of everyone at the locations. */
  employeeIds?: string[];
  defaults: MoveOptions;
  overrides: Override[];
  /** The letter template for the transfer letters (offered in the bulk issue after approval). */
  letterType?: string;
}
export interface RestructureInput extends Plan {
  kind: Kind;
  fromEntityId: string;
  intoEntityId?: string | null;
  effectiveDate: string;
  reason: string;
  overrideReason?: string | null;
  /** The saved draft this plan came from: deleted once sent. */
  draftId?: string;
}
export interface DraftInput {
  title: string;
  state: object;
}

interface Who {
  employeeId: string;
  employmentId: string;
  name: string;
  code: string;
  locationId: string;
  departmentId: string;
  designationId: string;
  employmentTypeId: string;
  gradeId: string | null;
}
interface Head {
  id: string;
  kind: Kind;
  fromEntityId: string;
  intoEntityId: string | null;
  effectiveDate: string;
  reason: string;
  overrideReason: string | null;
  requestedBy: string | null;
  plan: Plan;
}
export interface PersonResult {
  employeeId: string;
  name: string;
  code: string;
  status: 'ready' | 'moved' | 'failed' | 'left_out';
  reason: string | null;
  from: { entity: string; code: string; location: string; department: string; manager: string | null };
  to: { entity: string; code: string | null; location: string; department: string; manager: string | null } | null;
  service: { from: string; kept: boolean } | null;
  leave: { name: string; days: number; action: 'carried' | 'lapsed' }[];
  pay: 'kept' | 'set_later' | 'none' | null;
}

const KEYS = ['employee.change.manage', 'employee.change.approve', 'payroll.run.prepare'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const showDay = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${iso.slice(0, 4)}`;
/** The last day of the month holding `iso` (the day before the next month starts). */
const endOfMonth = (iso: string) => addDays(isoDate(new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 1))), -1);
const ACROSS: Kind[] = ['merge', 'close', 'demerge'];
const CLOSES: Kind[] = ['merge', 'close'];

/** HR decides restructures (founder decision 21 Oct 2026: payroll does no HR work): the change and approval keys. */
const hrApprover = (v: Viewer) => has(v, 'employee.change.manage') && has(v, 'employee.change.approve');

/** A person cannot move: the reason, in plain words. */
class Stop extends Error {}

/** An error from the engine for one person, in plain words (an unexpected one is not swallowed). */
function reasonOf(e: unknown): string {
  if (e instanceof Stop) return e.message;
  if (e instanceof HttpException) {
    const r = e.getResponse();
    const m = typeof r === 'string' ? r : Array.isArray((r as { message?: unknown }).message) ? ((r as { message: string[] }).message).join('; ') : String((r as { message?: unknown }).message ?? e.message);
    return m.replace(/\s*\((?:YX|P\d|M\d)[^)]*\)/g, '').trim();
  }
  if (e instanceof FoldError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'That employee code is already used in the new legal entity. Choose a new code.';
  // A kept code that is someone else's in the new series (employments_code_owner_excl), not a date clash.
  if (e instanceof Error && /employments_code/.test(e.message)) return 'That employee code is already used in the new legal entity. Choose a new code.';
  if (e instanceof Error && /exclusion constraint|23P01/.test(e.message)) return 'The dates clash with another change for this person.';
  throw e;
}

@Injectable()
export class RestructureService {
  private readonly logger = new Logger(RestructureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
  ) {}

  private keys(user: RequestUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  // ------------------------------------------------------------------------------------------ set-up

  /** Entities, locations, departments and the other masters with today's head counts, cost centres, and the restructures still open. */
  setup(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const counts = await tx.$queryRaw<{ legal_entity_id: string; location_id: string; department_id: string; designation_id: string; employment_type_id: string; grade_id: string | null; n: number }[]>`
        SELECT a.legal_entity_id::text, a.location_id::text, a.department_id::text, a.designation_id::text, a.employment_type_id::text, a.grade_id::text, count(*)::int AS n
        FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND m.exited_on IS NULL
          AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        GROUP BY 1, 2, 3, 4, 5, 6`;
      const sum = (f: (r: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((n, r) => n + r.n, 0);
      const master = { id: true, name: true, ownerLegalEntityId: true, appliesToEntities: true } as const;
      const [designations, types, grades] = await Promise.all([
        tx.designation.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: master }),
        tx.employmentType.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: master }),
        tx.grade.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: master }),
      ]);
      // People per master in each entity, and the entities it is open to (null: every entity).
      const shape = (kind: 'department' | 'designation' | 'employmentType' | 'grade', col: 'department_id' | 'designation_id' | 'employment_type_id' | 'grade_id') =>
        ({ id, name, ownerLegalEntityId, appliesToEntities }: { id: string; name: string; ownerLegalEntityId: string | null; appliesToEntities: string[] }) => {
          const byEntity: Record<string, number> = {};
          for (const r of counts) if (r[col] === id) byEntity[r.legal_entity_id] = (byEntity[r.legal_entity_id] ?? 0) + r.n;
          return { kind, id, name, byEntity, openTo: ownerLegalEntityId ? [ownerLegalEntityId] : appliesToEntities.length ? appliesToEntities : null };
        };
      const [entities, locations, departments, costCentres, open] = await Promise.all([
        tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, shortName: true } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, legalEntityId: true, state: true } }),
        tx.department.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, ownerLegalEntityId: true, appliesToEntities: true } }),
        tx.costCentre.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, legalEntityId: true } }),
        tx.restructure.findMany({ where: { organizationId: org, status: { in: ['pending', 'scheduled'] } }, orderBy: { requestedAt: 'desc' } }),
      ]);
      return {
        today,
        defaults: await this.defaults(tx, c),
        entities: entities.map((e) => ({ ...e, people: sum((r) => r.legal_entity_id === e.id) })),
        locations: locations.map((l) => ({ ...l, state: IN_STATES[l.state] ?? l.state, people: sum((r) => r.location_id === l.id) })),
        departments: departments.map(shape('department', 'department_id')),
        masters: [...designations.map(shape('designation', 'designation_id')), ...types.map(shape('employmentType', 'employment_type_id')), ...grades.map(shape('grade', 'grade_id'))],
        costCentres,
        open: await Promise.all(open.map((r) => this.summary(tx, c, v, r))),
      };
    });
  }

  /** The company's transfer options (Settings › Inter-entity transfer defaults), where a plan starts. */
  private async defaults(tx: Tx, c: CompanyContext): Promise<MoveOptions> {
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: { startsWith: 'transfer.' } } });
    const value = (key: 'transfer.leave' | 'transfer.service' | 'transfer.code' | 'transfer.salary') =>
      String(resolveSetting(SETTINGS[key], rows.filter((r) => r.key === key).map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: c.organizationId }, null).value);
    return { leave: value('transfer.leave'), service: value('transfer.service'), code: value('transfer.code'), salary: value('transfer.salary') } as MoveOptions;
  }

  // ------------------------------------------------------------------------------------------ who moves

  private async who(tx: Tx, c: CompanyContext, h: Head): Promise<Who[]> {
    const org = c.organizationId;
    const rows = await tx.$queryRaw<{ employee_id: string; employment_id: string; employee_code: string; location_id: string; department_id: string; designation_id: string; employment_type_id: string; grade_id: string | null; given_name: string; family_name: string | null; preferred_name: string | null }[]>`
      SELECT m.employee_id::text, m.id::text AS employment_id, m.employee_code::text, a.location_id::text, a.department_id::text, a.designation_id::text, a.employment_type_id::text, a.grade_id::text, e.given_name, e.family_name, e.preferred_name
      FROM employments m
      JOIN employees e ON e.organization_id = m.organization_id AND e.id = m.employee_id
      JOIN employee_assignments a ON a.organization_id = m.organization_id AND a.employment_id = m.id AND a.superseded_at IS NULL
        AND GREATEST(${h.effectiveDate}::date, m.joined_on) <@ daterange(a.valid_from, a.valid_to, '[]')
      WHERE m.organization_id = ${org}::uuid AND m.legal_entity_id = ${h.fromEntityId}::uuid AND m.exited_on IS NULL
      ORDER BY e.given_name, e.family_name NULLS FIRST, m.id`;
    const p = h.plan;
    return rows
      .filter((r) => (h.kind === 'merge' || h.kind === 'close' ? true : (!p.locationIds.length || p.locationIds.includes(r.location_id)) && (h.kind === 'demerge' || !p.departmentIds.length || p.departmentIds.includes(r.department_id))))
      .filter((r) => !p.employeeIds?.length || p.employeeIds.includes(r.employee_id))
      .map((r) => ({ employeeId: r.employee_id, employmentId: r.employment_id, name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }), code: r.employee_code, locationId: r.location_id, departmentId: r.department_id, designationId: r.designation_id, employmentTypeId: r.employment_type_id, gradeId: r.grade_id }));
  }

  /** The plan's shape: entities of this company, locations of the right entity, a target that changes something. */
  private async checkPlan(tx: Tx, c: CompanyContext, h: Head) {
    const org = c.organizationId;
    const p = h.plan;
    const from = await tx.legalEntity.findFirst({ where: { organizationId: org, id: h.fromEntityId } });
    if (!from) throw new BadRequestException('Choose a legal entity of this company to move people from.');
    const into = h.intoEntityId ? await tx.legalEntity.findFirst({ where: { organizationId: org, id: h.intoEntityId } }) : null;
    if (h.kind === 'within') {
      if (h.intoEntityId) throw new BadRequestException('A move inside one legal entity has no second entity.');
      if (!p.locationIds.length && !p.departmentIds.length) throw new BadRequestException('Choose the locations or departments whose people move.');
      const t = p.target;
      if (!t.departmentId && !t.locationId && t.managerEmployeeId === undefined && !t.costCentreId) throw new BadRequestException('Choose the new department, location, manager or cost centre.');
      if (t.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: t.locationId, legalEntityId: from.id, archivedAt: null } }))) throw new BadRequestException(`Choose a location of ${from.name}.`);
      if (t.costCentreId && !(await tx.costCentre.findFirst({ where: { organizationId: org, id: t.costCentreId, legalEntityId: from.id, archivedAt: null } }))) throw new BadRequestException(`Choose a cost centre of ${from.name}.`);
    } else {
      if (!into) throw new BadRequestException('Choose the legal entity people move into.');
      if (into.id === from.id) throw new BadRequestException('People move into another legal entity.');
      if (into.archivedAt) throw new BadRequestException(`${into.name} is archived.`);
      if (h.kind === 'demerge' && !p.locationIds.length && !p.employeeIds?.length) throw new BadRequestException('Choose the locations whose people move.');
      const targets = [...Object.values(p.locationMap), ...(p.target.locationId ? [p.target.locationId] : [])];
      if (targets.length) {
        const ok = await tx.location.count({ where: { organizationId: org, id: { in: targets }, legalEntityId: into.id, archivedAt: null } });
        if (ok !== new Set(targets).size) throw new BadRequestException(`Each new location is a location of ${into.name}.`);
      }
    }
    return { from, into };
  }

  /**
   * Between entities, every location and every department, designation, employment type or grade of the people who move
   * that is not open to the new entity needs a chosen one there. Never guessed: a missing one rejects the plan.
   */
  private async checkMappings(tx: Tx, c: CompanyContext, h: Head, into: { id: string; name: string }, people: Who[]) {
    const org = c.organizationId;
    const p = h.plan;
    const moving = people.filter((w) => !this.optionsFor(h, w.employeeId).leaveOut);
    const noPlace = [...new Set(moving.map((w) => w.locationId))].filter((id) => !p.locationMap[id] && !p.target.locationId);
    if (noPlace.length) {
      const names = await tx.location.findMany({ where: { organizationId: org, id: { in: noPlace } }, select: { name: true } });
      throw new BadRequestException(`Choose the location in ${into.name} for ${names.map((l) => l.name).join(', ')}.`);
    }
    // A department, designation or employment type chosen for one person replaces theirs (the hire path checks it is open to the new entity).
    const used = new Set(moving.flatMap((w) => [...(p.target.departmentId ? [] : [w.departmentId]), ...(p.target.designationId ? [] : [w.designationId]), ...(p.target.employmentTypeId ? [] : [w.employmentTypeId]), ...(w.gradeId ? [w.gradeId] : [])]));
    const ids = [...new Set([...used, ...Object.values(p.masterMap)])];
    const where = { organizationId: org, id: { in: ids } };
    const select = { id: true, name: true, ownerLegalEntityId: true, appliesToEntities: true, archivedAt: true } as const;
    const tag = (kind: string) => (rows: { id: string; name: string; ownerLegalEntityId: string | null; appliesToEntities: string[]; archivedAt: Date | null }[]) => rows.map((r) => ({ ...r, kind }));
    const rows = (
      await Promise.all([
        tx.department.findMany({ where, select }).then(tag('department')),
        tx.designation.findMany({ where, select }).then(tag('designation')),
        tx.employmentType.findMany({ where, select }).then(tag('employmentType')),
        tx.grade.findMany({ where, select }).then(tag('grade')),
      ])
    ).flat();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const open = (m: (typeof rows)[number]) => (m.ownerLegalEntityId ? m.ownerLegalEntityId === into.id : !m.appliesToEntities.length || m.appliesToEntities.includes(into.id));
    const missing = [...used].map((id) => byId.get(id)).filter((m): m is (typeof rows)[number] => !!m && !open(m) && !p.masterMap[m.id]);
    if (missing.length) throw new BadRequestException(`Choose what ${missing.map((m) => m.name).join(', ')} ${missing.length === 1 ? 'becomes' : 'become'} in ${into.name}.`);
    for (const id of used) {
      const to = p.masterMap[id] ? byId.get(p.masterMap[id]) : undefined;
      if (p.masterMap[id] && (!to || to.archivedAt || to.kind !== byId.get(id)?.kind || !open(to))) throw new BadRequestException(`Each new department, designation, employment type or grade is one in use in ${into.name}.`);
    }
  }

  // ------------------------------------------------------------------------------------------ payroll months

  /** The payroll month of `entity` that holds `day`, when it is locked (or being processed). */
  private async lockedOn(tx: Tx, c: CompanyContext, entity: { id: string; name: string }, day: string) {
    const p = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entity.id, payGroupId: null, periodStart: { lte: asDate(day) }, periodEnd: { gte: asDate(day) } } });
    if (!p || p.stage === 'open') return null;
    const month = monthOf(isoDate(p.periodStart));
    return p.stage === 'frozen' ? `${month} payroll of ${entity.name} is being processed` : `${month} payroll of ${entity.name} is locked`;
  }

  /** Checks for the whole plan: payroll months, and (closing an entity) its last payroll month locked. */
  private async checks(tx: Tx, c: CompanyContext, h: Head, ents: { from: { id: string; name: string }; into: { id: string; name: string } | null }, people: Who[]) {
    const out: { id: string; title: string; status: 'Ready' | 'Blocked' | 'Done'; note?: string; payrollRunId?: string; month?: string }[] = [];
    const org = c.organizationId;
    if (ents.into) {
      // What moves with the people (the person record stays the same): open journeys, approvals and service-desk cases.
      const ids = people.filter((w) => !this.optionsFor(h, w.employeeId).leaveOut).map((w) => w.employeeId);
      const persons = (await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { personId: true } })).map((e) => e.personId);
      const [journeys, approvals, cases] = await Promise.all([
        tx.journey.count({ where: { organizationId: org, personId: { in: persons }, status: 'active' } }),
        tx.wfRequest.count({ where: { organizationId: org, subjectPersonId: { in: persons }, status: 'pending' } }),
        tx.sdTicket.count({ where: { organizationId: org, systemState: { notIn: ['solved', 'closed'] }, OR: [{ requesterPersonId: { in: persons } }, { requestedForPersonId: { in: persons } }] } }),
      ]);
      const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
      out.push({ id: 'journeys', title: `${n(journeys, 'open onboarding or exit journey', 'open onboarding and exit journeys')} will move with them`, status: 'Ready' });
      out.push({ id: 'approvals', title: `${n(approvals, 'approval', 'approvals')} and ${n(cases, 'case', 'cases')} will move with them`, status: 'Ready' });
    }
    const eff = h.effectiveDate;
    for (const e of [ents.from, ...(ents.into ? [ents.into] : [])]) {
      const locked = await this.lockedOn(tx, c, e, eff);
      out.push(locked ? { id: `pay-${e.id}`, title: `${locked}: choose a date in an open payroll month`, status: 'Blocked' } : { id: `pay-${e.id}`, title: `${monthOf(eff)} payroll of ${e.name} is open`, status: 'Ready' });
    }
    if (CLOSES.includes(h.kind)) {
      // Closing: the old entity's pay ends with its last month locked (paid and final).
      const last = addDays(eff, -1);
      const p = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: ents.from.id, payGroupId: null, periodStart: { lte: asDate(last) }, periodEnd: { gte: asDate(last) } } });
      if (!p) out.push({ id: 'last', title: `No ${monthOf(last)} payroll of ${ents.from.name} in YukthiX`, status: 'Ready' });
      else if (isoDate(p.periodEnd) >= eff) out.push({ id: 'last', title: `${ents.from.name} closes at the end of a payroll month`, status: 'Blocked', note: `Choose ${showDay(addDays(isoDate(p.periodEnd), 1))}, the first day after its ${monthOf(isoDate(p.periodStart))} payroll.` });
      else if (p.stage === 'locked' || p.stage === 'filed') out.push({ id: 'last', title: `Last payroll month (${monthOf(last)}) of ${ents.from.name} run and locked`, status: 'Done' });
      else {
        // The payroll to open from the blocked row: the latest regular run of that month.
        const run = await tx.payrollRun.findFirst({ where: { organizationId: org, legalEntityId: ents.from.id, periodStart: p.periodStart, runType: 'regular' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        out.push({ id: 'last', title: `Last payroll month (${monthOf(last)}) of ${ents.from.name} run and locked`, status: 'Blocked', note: `${monthOf(last)} payroll is not locked yet. Lock it first.`, month: MONTHS[Number(last.slice(5, 7)) - 1], ...(run ? { payrollRunId: run.id } : {}) });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ one person

  /** The person's facts on a day: assignment (with dotted lines and cost centres) and status. */
  private async factsOn(tx: Tx, c: CompanyContext, employmentId: string, day: string) {
    const org = c.organizationId;
    const on = { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(day) }, OR: [{ validTo: null }, { validTo: { gte: asDate(day) } }] };
    const a = await tx.employeeAssignment.findFirst({ where: on });
    const s = await tx.employmentStatusPeriod.findFirst({ where: on });
    if (!a || !s) throw new Stop('Their job record has a gap on the effective date. Fix their history first.');
    const dotted = await tx.assignmentDottedLineManager.findMany({ where: { organizationId: org, assignmentId: a.id }, select: { managerEmployeeId: true } });
    return { a, status: s.status, dotted: dotted.map((d) => d.managerEmployeeId).sort() };
  }

  private async nameMaps(tx: Tx, c: CompanyContext) {
    const org = c.organizationId;
    const [ents, locs, depts] = await Promise.all([
      tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
      tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
    ]);
    const m = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));
    return { ent: m(ents), loc: m(locs), dept: m(depts) };
  }

  private async personName(tx: Tx, c: CompanyContext, id: string | null) {
    if (!id) return null;
    const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id }, select: { givenName: true, familyName: true, preferredName: true } });
    return e ? displayName(e) : null;
  }

  /**
   * Moves one person (or, with `approver` null, checks it: the caller rolls everything back). Throws a Stop or an engine
   * error with the reason; the caller undoes this person's part alone (savepoint).
   */
  private async moveOne(tx: Tx, c: CompanyContext, h: Head, who: Who, opts: MoveOptions, sender: Viewer, approver: Viewer | null): Promise<Omit<PersonResult, 'status' | 'reason'> & { newEmploymentId: string | null; changeId: string | null }> {
    const org = c.organizationId;
    const eff = h.effectiveDate;
    const names = await this.nameMaps(tx, c);
    const e = await tx.employment.findFirst({ where: { organizationId: org, id: who.employmentId } });
    if (!e || e.exitedOn) throw new Stop('Has left the company.');
    if (e.legalEntityId !== h.fromEntityId) throw new Stop(`No longer works for ${names.ent.get(h.fromEntityId)}.`);
    const joined = isoDate(e.joinedOn);
    const across = ACROSS.includes(h.kind);
    if (across ? joined >= eff : joined > eff) throw new Stop(`Joins on ${showDay(joined)}, ${across ? 'on or ' : ''}after the move. Change their joining details instead.`);
    // The sender asked for it: their change grant must reach the person (and, at approval, still does).
    if (!(await this.history.reachesFrom(tx, c, sender, 'employee.change.manage', e, eff))) throw new Stop(approver ? 'The person who sent this can no longer change this employee.' : 'You cannot change this employee.');
    if (approver) {
      if ((await this.history.ownEmployeeId(tx, c, approver)) === e.employeeId) throw new Stop('A move about the approver is approved by someone else.');
      // HR approves (founder decision 21 Oct 2026): both HR change keys reach the person; a payroll-only role never does.
      if (!(await this.history.reachesFrom(tx, c, approver, 'employee.change.approve', e, eff)) || !(await this.history.reachesFrom(tx, c, approver, 'employee.change.manage', e, eff))) throw new Stop('Your approval does not reach this employee.');
    }
    const from = { id: h.fromEntityId, name: names.ent.get(h.fromEntityId)! };
    const lockedFrom = await this.lockedOn(tx, c, from, eff);
    if (lockedFrom) throw new Stop(`${lockedFrom}.`);
    const { a, status, dotted } = await this.factsOn(tx, c, e.id, eff);
    const fromView = { entity: from.name, code: e.employeeCode, location: names.loc.get(a.locationId) ?? '', department: names.dept.get(a.departmentId) ?? '', manager: await this.personName(tx, c, a.managerEmployeeId) };

    if (!across) {
      const t = h.plan.target;
      const assignment: ChangeRequestDto['payload']['assignment'] = {};
      if (t.departmentId && t.departmentId !== a.departmentId) assignment.departmentId = t.departmentId;
      if (t.locationId && t.locationId !== a.locationId) assignment.locationId = t.locationId;
      if (t.managerEmployeeId !== undefined && t.managerEmployeeId !== a.managerEmployeeId) {
        if (t.managerEmployeeId === e.employeeId) throw new Stop('Cannot be their own manager.');
        assignment.managerEmployeeId = t.managerEmployeeId;
        if (t.managerEmployeeId && dotted.includes(t.managerEmployeeId)) assignment.dottedLineManagerIds = dotted.filter((d) => d !== t.managerEmployeeId);
      }
      if (t.costCentreId) {
        const shares = await tx.assignmentCostCentre.findMany({ where: { organizationId: org, assignmentId: a.id } });
        if (!(shares.length === 1 && shares[0].costCentreId === t.costCentreId)) assignment.costCentres = [{ costCentreId: t.costCentreId, percent: '100' }];
      }
      if (!Object.keys(assignment).length) throw new Stop('Already in the new place: nothing changes.');
      const onlyManager = Object.keys(assignment).every((k) => k === 'managerEmployeeId' || k === 'dottedLineManagerIds');
      const { ch, e: emp } = await this.history.createChange(tx, c, sender, { employeeId: e.employeeId, changeType: onlyManager ? 'manager_change' : 'transfer', effectiveDate: eff, payload: { assignment }, reason: h.reason, ...(h.overrideReason ? { overrideReason: h.overrideReason } : {}) } as ChangeRequestDto);
      const asked = { ...ch, requestedBy: h.requestedBy };
      await tx.employeeChange.update({ where: { id: ch.id }, data: { requestedBy: h.requestedBy } });
      const applied = await this.history.approveIn(tx, c, approver ?? sender, asked, emp, { confirmRebase: true, simulate: !approver });
      if (approver) await this.history.afterApply(tx, c, applied.updated, applied.impact, applied.effectiveNow);
      const after = { ...a, departmentId: assignment.departmentId ?? a.departmentId, locationId: assignment.locationId ?? a.locationId, managerEmployeeId: assignment.managerEmployeeId !== undefined ? assignment.managerEmployeeId : a.managerEmployeeId };
      return {
        employeeId: e.employeeId,
        name: who.name,
        code: e.employeeCode,
        from: fromView,
        to: { entity: from.name, code: e.employeeCode, location: names.loc.get(after.locationId) ?? '', department: names.dept.get(after.departmentId) ?? '', manager: await this.personName(tx, c, after.managerEmployeeId ?? null) },
        service: null,
        leave: [],
        pay: null,
        newEmploymentId: null,
        changeId: ch.id,
      };
    }

    // ---- between legal entities
    const into = { id: h.intoEntityId!, name: names.ent.get(h.intoEntityId!)! };
    const lockedInto = await this.lockedOn(tx, c, into, eff);
    if (lockedInto) throw new Stop(`${lockedInto}.`);
    if (status === 'notice') throw new Stop('Is serving notice. Leave them out; they leave from the old entity.');
    if (await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: ['submitted', 'accepted', 'cleared'] } }, select: { id: true } })) throw new Stop('Has an open exit case. Leave them out, or close the exit case first.');
    // A change on or after the move date would be cut off with the old employment: never lost silently.
    const later = await tx.employeeChange.findFirst({ where: { organizationId: org, employmentId: e.id, status: { in: ['pending', 'scheduled', 'effective'] }, effectiveDate: { gte: asDate(eff) }, changeType: { not: 'join' } }, orderBy: { effectiveDate: 'asc' } });
    if (later) throw new Stop(`Has a ${later.changeType.replace(/_/g, ' ')} on ${showDay(isoDate(later.effectiveDate))}, on or after the move date. ${later.status === 'effective' ? 'Choose a later move date.' : 'Decide or cancel it first.'}`);
    const t = h.plan.target;
    const locationId = h.plan.locationMap[a.locationId] ?? t.locationId;
    if (!locationId) throw new Stop(`No location in ${into.name} is chosen for ${names.loc.get(a.locationId)}.`);
    const service = await this.history.serviceDatesOf(tx, c, e);
    const pay = await withPayScope(tx, [from.id], () => tx.compensation.findFirst({ where: { organizationId: org, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(eff) }, OR: [{ validTo: null }, { validTo: { gte: asDate(eff) } }] } }));
    if (pay && opts.salary === 'keep' && (sender.actingForOther || !has(sender, 'employee.salary.manage'))) throw new Stop('Keeping their pay needs someone allowed to change pay. In Transfer options, set Salary structure to "Assign new", or ask someone allowed to change pay to send this.');
    const probation = status === 'probation' ? await tx.probation.findFirst({ where: { organizationId: org, employmentId: e.id } }) : null;
    const types = await tx.leaveType.findMany({ where: { organizationId: org }, select: { id: true, name: true } });
    const sums = await tx.leaveLedgerEntry.groupBy({ by: ['leaveTypeId'], where: { organizationId: org, employeeId: e.employeeId }, _sum: { days: true } });
    const balances = sums.map((s) => ({ leaveTypeId: s.leaveTypeId, name: types.find((t) => t.id === s.leaveTypeId)?.name ?? 'Leave', days: Math.round(Number(s._sum.days ?? 0) * 100) / 100 })).filter((b) => b.days > 0);
    const person = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: e.employeeId } });
    const shares = await tx.assignmentCostCentre.count({ where: { organizationId: org, assignmentId: a.id } });

    // The old employment ends the day before (history kept), the new one starts on the effective date.
    await this.history.exitIn(tx, c, e.id, addDays(eff, -1), `Moved to ${into.name} (${h.reason})`.slice(0, 1000));
    const dto: EmployeeCreateDto = {
      legalEntityId: into.id,
      givenName: person.givenName,
      ...(person.familyName ? { familyName: person.familyName } : {}),
      joinedOn: eff,
      status: status === 'probation' ? 'probation' : 'confirmed',
      ...(opts.code === 'keep' ? { employeeCode: e.employeeCode } : {}),
      assignment: {
        locationId,
        departmentId: t.departmentId ?? h.plan.masterMap[a.departmentId] ?? a.departmentId,
        designationId: t.designationId ?? h.plan.masterMap[a.designationId] ?? a.designationId,
        employmentTypeId: t.employmentTypeId ?? h.plan.masterMap[a.employmentTypeId] ?? a.employmentTypeId,
        managerEmployeeId: a.managerEmployeeId,
        ...(a.gradeId ? { gradeId: h.plan.masterMap[a.gradeId] ?? a.gradeId } : {}),
        ...(a.skillClass ? { skillClass: a.skillClass } : {}),
        ...(a.hoursPerWeek ? { hoursPerWeek: a.hoursPerWeek.toFixed(1) } : {}),
        ...(dotted.length ? { dottedLineManagerIds: dotted } : {}),
      },
      reason: `Moved from ${from.name}: ${h.reason}`.slice(0, 1000),
      ...(h.overrideReason ? { overrideReason: h.overrideReason } : {}),
    } as EmployeeCreateDto;
    const made = await this.history.createEmployeeIn(tx, c, sender, dto, e.id, { transfer: true });
    await tx.employeeChange.update({ where: { id: made.changeId }, data: { requestedBy: h.requestedBy } });
    // Service: carried on from the old employment, or starting again on the effective date (HR's value either way).
    const keep = opts.service === 'keep';
    await tx.employment.update({ where: { id: made.employmentId }, data: { continuousServiceFrom: asDate(keep ? service.continuousServiceFrom : eff), continuousServiceReason: (keep ? `Service continues from ${from.name} (restructure)` : `Service restarts on the move from ${from.name} (restructure)`).slice(0, 300) } });
    // Probation carries over: the same start and end, not a new plan.
    if (probation) await tx.probation.update({ where: { organizationId_employmentId: { organizationId: org, employmentId: made.employmentId } }, data: { startOn: probation.startOn, originalEndOn: probation.originalEndOn, plannedEndOn: probation.plannedEndOn, extendedMonths: probation.extendedMonths } });
    // Pay: the same annual CTC from the effective date, as a salary change the approver approves (R1).
    let payState: PersonResult['pay'] = pay ? 'set_later' : 'none';
    if (pay && opts.salary === 'keep') {
      const { ch, e: emp } = await this.history.createChange(tx, c, sender, { employeeId: e.employeeId, changeType: 'salary_revision', effectiveDate: eff, payload: { compensation: { currency: pay.currency, annualCtc: pay.annualCtc.toFixed(2) } }, reason: `Pay carried from ${from.name}`, ...(h.overrideReason ? { overrideReason: h.overrideReason } : {}) } as ChangeRequestDto);
      await tx.employeeChange.update({ where: { id: ch.id }, data: { requestedBy: h.requestedBy } });
      const applied = await this.history.approveIn(tx, c, approver ?? sender, { ...ch, requestedBy: h.requestedBy }, emp, { confirmRebase: true, simulate: !approver });
      if (approver) await this.history.afterApply(tx, c, applied.updated, applied.impact, applied.effectiveNow);
      payState = 'kept';
    }
    // Leave: the balance belongs to the person, so it carries over as it is; a lapse is written to the ledger.
    if (opts.leave === 'lapse') {
      for (const b of balances) await tx.leaveLedgerEntry.create({ data: { organizationId: org, employeeId: e.employeeId, leaveTypeId: b.leaveTypeId, entryOn: asDate(eff), kind: 'lapse', days: new Prisma.Decimal(-b.days), reason: `Lapsed on the move from ${from.name} to ${into.name}`, createdBy: c.userId ?? null } });
    }
    const leaveText = balances.length ? balances.map((b) => `${b.name} ${b.days}`).join(', ') : 'no balance';
    const uan = await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: e.employeeId }, select: { uanHash: true } });
    const loans = await withPayScope(tx, [from.id], () => tx.loan.findMany({ where: { organizationId: org, employmentId: e.id, status: { in: ['active', 'paused', 'approved'] } }, select: { id: true, loanType: true } }));
    const due = endOfMonth(eff);
    const items: { key: string; title: string; owner: 'HR' | 'Payroll' | 'Finance'; done: boolean; note?: string }[] = [
      { key: 'uan', title: 'PF: same UAN; transfer the PF balance (Form 13 or EPFO auto-transfer)', owner: 'Payroll', done: false, note: uan?.uanHash ? 'UAN on file' : 'No UAN on file' },
      { key: 'esi', title: 'ESI: the same IP number carries over', owner: 'Payroll', done: false },
      { key: 'form12b', title: `Form 12B: carry this tax year's income and TDS from ${from.name}`, owner: 'Payroll', done: false },
      { key: 'declarations', title: 'Tax declarations and proofs: copy to the new entity', owner: 'Payroll', done: false },
      { key: 'leave', title: opts.leave === 'lapse' ? `Leave balances lapsed (${leaveText})` : `Leave balances carried (${leaveText})`, owner: 'HR', done: true },
      keep ? { key: 'gratuity', title: 'Gratuity: service continues, one payout at final exit', owner: 'Payroll', done: true } : { key: 'gratuity', title: `Gratuity: service restarts; settle the gratuity earned at ${from.name}`, owner: 'Payroll', done: false },
      payState === 'kept' ? { key: 'pay', title: 'Pay carried to the new employment', owner: 'Payroll', done: true } : { key: 'pay', title: 'Set pay on the new employment (salary change)', owner: 'Payroll', done: false },
      ...(shares ? [{ key: 'costcentre', title: `Cost centre: choose one of ${into.name}`, owner: 'HR' as const, done: false }] : []),
      ...loans.map((l, i) => ({ key: `loan${i + 1}`, title: `Loan (${l.loanType}) moved to ${into.name} (no F&F)`, owner: 'Finance' as const, done: false })),
    ];
    await tx.continuityItem.createMany({ data: items.map((it) => ({ organizationId: org, restructureId: h.id, employeeId: e.employeeId, legalEntityId: into.id, key: it.key, title: it.title, owner: it.owner, dueOn: it.done ? null : asDate(due), status: it.done ? 'done' : 'open', note: it.note ?? null, doneAt: it.done ? new Date() : null })) });
    const newLoc = await tx.location.findFirst({ where: { organizationId: org, id: locationId }, select: { name: true } });
    return {
      employeeId: e.employeeId,
      name: who.name,
      code: e.employeeCode,
      from: fromView,
      to: { entity: into.name, code: made.employeeCode, location: newLoc?.name ?? '', department: names.dept.get(t.departmentId ?? h.plan.masterMap[a.departmentId] ?? a.departmentId) ?? '', manager: fromView.manager },
      service: { from: keep ? service.continuousServiceFrom : eff, kept: keep },
      leave: balances.map((b) => ({ name: b.name, days: b.days, action: opts.leave === 'lapse' ? ('lapsed' as const) : ('carried' as const) })),
      pay: payState,
      newEmploymentId: made.employmentId,
      changeId: made.changeId,
    };
  }

  private optionsFor(h: Head, employeeId: string): { leaveOut: string | null; opts: MoveOptions } {
    const o = h.plan.overrides.find((x) => x.employeeId === employeeId);
    const d = h.plan.defaults;
    return { leaveOut: o?.leaveOut ? o.reason : null, opts: { leave: o?.leave ?? d.leave, service: o?.service ?? d.service, code: o?.code ?? d.code, salary: o?.salary ?? d.salary } };
  }

  /** Every person in turn, each in its own savepoint: a failure undoes that person alone and keeps the reason. */
  private async movePeople(tx: Tx, c: CompanyContext, h: Head, people: Who[], sender: Viewer, approver: Viewer | null) {
    const out: (PersonResult & { newEmploymentId: string | null; changeId: string | null })[] = [];
    const names = await this.nameMaps(tx, c);
    for (const p of people) {
      const { leaveOut, opts } = this.optionsFor(h, p.employeeId);
      const base = { employeeId: p.employeeId, name: p.name, code: p.code, from: { entity: names.ent.get(h.fromEntityId) ?? '', code: p.code, location: names.loc.get(p.locationId) ?? '', department: names.dept.get(p.departmentId) ?? '', manager: null }, to: null, service: null, leave: [], pay: null, newEmploymentId: null, changeId: null };
      if (leaveOut) {
        out.push({ ...base, status: 'left_out', reason: `Left out: ${leaveOut}` });
        continue;
      }
      await tx.$executeRaw`SAVEPOINT restructure_person`;
      try {
        const r = await this.moveOne(tx, c, h, p, opts, sender, approver);
        await tx.$executeRaw`RELEASE SAVEPOINT restructure_person`;
        out.push({ ...r, status: approver ? 'moved' : 'ready', reason: null });
      } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT restructure_person`;
        out.push({ ...base, status: 'failed', reason: reasonOf(e) });
      }
    }
    return out;
  }

  private head(id: string, dto: RestructureInput, requestedBy: string | null): Head {
    return {
      id,
      kind: dto.kind,
      fromEntityId: dto.fromEntityId,
      intoEntityId: dto.kind === 'within' ? null : (dto.intoEntityId ?? null),
      effectiveDate: dto.effectiveDate,
      reason: dto.reason.trim(),
      overrideReason: dto.overrideReason?.trim() || null,
      requestedBy,
      plan: { locationIds: dto.locationIds ?? [], departmentIds: dto.departmentIds ?? [], locationMap: dto.locationMap ?? {}, masterMap: dto.masterMap ?? {}, target: dto.target ?? {}, defaults: dto.defaults, overrides: dto.overrides ?? [], ...(dto.employeeIds?.length ? { employeeIds: dto.employeeIds } : {}), ...(dto.letterType ? { letterType: dto.letterType } : {}) },
    };
  }

  private async dryRun(tx: Tx, c: CompanyContext, v: Viewer, h: Head) {
    const ents = await this.checkPlan(tx, c, h);
    // Continuity items need a restructure row to hang on while checking; it is rolled back with everything else.
    await tx.restructure.create({ data: { id: h.id, organizationId: c.organizationId, kind: h.kind, fromEntityId: h.fromEntityId, intoEntityId: h.intoEntityId, effectiveOn: asDate(h.effectiveDate), plan: h.plan as unknown as Prisma.InputJsonObject, reason: h.reason, requestedBy: c.userId! } });
    const people = await this.who(tx, c, h);
    if (ents.into) await this.checkMappings(tx, c, h, ents.into, people);
    const checks = await this.checks(tx, c, h, ents, people);
    const rows = await this.movePeople(tx, c, h, people, v, null);
    return { people: rows.map(({ newEmploymentId: _n, changeId: _c, ...r }) => r), checks, counts: { ready: rows.filter((r) => r.status === 'ready').length, failed: rows.filter((r) => r.status === 'failed').length, leftOut: rows.filter((r) => r.status === 'left_out').length } };
  }

  /** The dry run: who moves, each person's result or reason, and the checks. Nothing is kept. */
  preview(ctx: TenantContext, v: Viewer, dto: RestructureInput) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
    return this.history.preview(ctx, (tx, c) => this.dryRun(tx, c, v, this.head(randomUUID(), dto, c.userId ?? null)));
  }

  /** Sends the plan for one approval. Everyone named must be able to move (or be left out with a reason). */
  async send(ctx: TenantContext, v: Viewer, dto: RestructureInput) {
    const result = await this.preview(ctx, v, dto);
    if (!result.people.length) throw new BadRequestException('No one moves with these choices.');
    if (result.counts.failed) throw new BadRequestException({ statusCode: 400, code: 'RESTRUCTURE_PEOPLE_INVALID', message: `${result.counts.failed} ${result.counts.failed === 1 ? 'person cannot' : 'people cannot'} move. Leave them out with a reason, or fix them first.`, ...result });
    const blocked = result.checks.find((x) => x.status === 'Blocked');
    if (blocked) throw new BadRequestException({ statusCode: 400, code: 'RESTRUCTURE_BLOCKED', message: blocked.note ?? blocked.title, ...result });
    return this.history.run(ctx, async (tx, c) => {
      const id = randomUUID();
      const h = this.head(id, dto, c.userId ?? null);
      await this.checkPlan(tx, c, h);
      const people = await this.who(tx, c, h);
      if (people.map((p) => p.employeeId).join() !== result.people.map((p) => p.employeeId).join()) throw new ConflictException('Who moves changed while you checked. Check again.');
      await tx.restructure.create({ data: { id, organizationId: c.organizationId, kind: h.kind, fromEntityId: h.fromEntityId, intoEntityId: h.intoEntityId, effectiveOn: asDate(h.effectiveDate), plan: h.plan as unknown as Prisma.InputJsonObject, reason: h.reason, overrideReason: h.overrideReason, requestedBy: c.userId! } });
      await tx.restructurePerson.createMany({
        data: people.map((p) => {
          const { leaveOut, opts } = this.optionsFor(h, p.employeeId);
          return { organizationId: c.organizationId, restructureId: id, employeeId: p.employeeId, employmentId: p.employmentId, options: opts as unknown as Prisma.InputJsonObject, status: leaveOut ? 'left_out' : 'pending', failReason: leaveOut ? `Left out: ${leaveOut}`.slice(0, 500) : null };
        }),
      });
      if (dto.draftId) await tx.restructureDraft.deleteMany({ where: { organizationId: c.organizationId, id: dto.draftId, createdBy: c.userId! } });
      await audit(tx, c, 'restructure.requested', 'restructure', id, { kind: h.kind, fromEntityId: h.fromEntityId, intoEntityId: h.intoEntityId, effectiveDate: h.effectiveDate, people: people.length });
      return { id };
    });
  }

  // ------------------------------------------------------------------------------------------ drafts ("Save and exit")

  /** One of the signed-in person's own drafts; anyone else's (or another company's) is never found. */
  private async draftOr404(tx: Tx, c: CompanyContext, id: string) {
    const d = await tx.restructureDraft.findFirst({ where: { organizationId: c.organizationId, id, createdBy: this.me(c) } });
    if (!d) throw new NotFoundException('No such draft.');
    return d;
  }
  private me(c: CompanyContext) {
    if (!c.userId) throw new ForbiddenException('Sign in again.');
    return c.userId;
  }

  drafts(ctx: TenantContext) {
    return this.history.run(ctx, (tx, c) => tx.restructureDraft.findMany({ where: { organizationId: c.organizationId, createdBy: this.me(c) }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true } }));
  }

  draft(ctx: TenantContext, id: string) {
    return this.history.run(ctx, async (tx, c) => {
      const d = await this.draftOr404(tx, c, id);
      return { id: d.id, title: d.title, updatedAt: d.updatedAt, state: d.payload };
    });
  }

  /** Saves the wizard as it was left. Its contents are only a starting point: sending checks the whole plan again. */
  saveDraft(ctx: TenantContext, id: string | null, dto: DraftInput) {
    const payload = JSON.parse(JSON.stringify(dto.state)) as Prisma.InputJsonObject;
    if (JSON.stringify(payload).length > 256_000) throw new BadRequestException('The draft is too large to save.');
    return this.history.run(ctx, async (tx, c) => {
      const select = { id: true, title: true, updatedAt: true } as const;
      if (id) {
        await this.draftOr404(tx, c, id);
        return tx.restructureDraft.update({ where: { id }, data: { title: dto.title.trim(), payload }, select });
      }
      if ((await tx.restructureDraft.count({ where: { organizationId: c.organizationId, createdBy: this.me(c) } })) >= 20) throw new BadRequestException('You have 20 saved drafts. Delete one first.');
      return tx.restructureDraft.create({ data: { organizationId: c.organizationId, createdBy: this.me(c), title: dto.title.trim(), payload }, select });
    });
  }

  deleteDraft(ctx: TenantContext, id: string) {
    return this.history.run(ctx, async (tx, c) => {
      await this.draftOr404(tx, c, id);
      await tx.restructureDraft.delete({ where: { id } });
    });
  }

  // ------------------------------------------------------------------------------------------ reading

  private async restructureOr404(tx: Tx, c: CompanyContext, id: string) {
    const r = await tx.restructure.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r) throw new NotFoundException('No such restructure.');
    return r;
  }

  private headOf(r: Prisma.RestructureGetPayload<object>): Head {
    return { id: r.id, kind: r.kind as Kind, fromEntityId: r.fromEntityId, intoEntityId: r.intoEntityId, effectiveDate: isoDate(r.effectiveOn), reason: r.reason, overrideReason: r.overrideReason, requestedBy: r.requestedBy, plan: { ...(r.plan as unknown as Partial<Plan>), masterMap: (r.plan as unknown as Partial<Plan>).masterMap ?? {} } as Plan };
  }

  private async summary(tx: Tx, c: CompanyContext, v: Viewer, r: Prisma.RestructureGetPayload<object>) {
    const names = await this.nameMaps(tx, c);
    const count = await tx.restructurePerson.count({ where: { organizationId: c.organizationId, restructureId: r.id, status: { not: 'left_out' } } });
    const from = names.ent.get(r.fromEntityId) ?? '';
    const into = r.intoEntityId ? (names.ent.get(r.intoEntityId) ?? '') : null;
    const one = (r.plan as unknown as Partial<Plan>).employeeIds;
    const title = r.kind === 'merge' ? `Merge ${from} into ${into}` : r.kind === 'close' ? `Close ${from}` : one?.length === 1 ? `Move ${(await this.personName(tx, c, one[0])) ?? 'one person'} from ${from} to ${into}` : r.kind === 'demerge' ? `Move part of ${from} to ${into}` : `Move people inside ${from}`;
    return { id: r.id, kind: r.kind, title, from, into, effectiveDate: isoDate(r.effectiveOn), status: r.status, count, moved: r.moved, failed: r.failed, requestedBy: await this.userName(tx, c, r.requestedBy), mine: r.requestedBy === v.userId };
  }

  private async userName(tx: Tx, c: CompanyContext, userId: string | null) {
    if (!userId) return null;
    const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId }, select: { givenName: true, familyName: true, preferredName: true } });
    if (e) return displayName(e);
    return (await tx.user.findFirst({ where: { id: userId }, select: { email: true } }))?.email ?? null;
  }

  private async view(tx: Tx, c: CompanyContext, v: Viewer, r: Prisma.RestructureGetPayload<object>) {
    const rows = await tx.restructurePerson.findMany({ where: { organizationId: c.organizationId, restructureId: r.id } });
    const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((x) => x.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    const items = await tx.continuityItem.groupBy({ by: ['employeeId'], where: { organizationId: c.organizationId, restructureId: r.id, status: 'open' }, _count: { _all: true } });
    const nameOf = (id: string) => {
      const p = people.find((x) => x.id === id);
      return p ? displayName(p) : '';
    };
    const own = await this.history.ownEmployeeId(tx, c, v);
    const canDecide = r.status === 'pending' && hrApprover(v) && !v.actingForOther && r.requestedBy !== v.userId && !rows.some((x) => x.employeeId === own);
    return {
      ...(await this.summary(tx, c, v, r)),
      reason: r.reason,
      plan: r.plan,
      decidedBy: await this.userName(tx, c, r.decidedBy),
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      canDecide,
      canCancel: r.status === 'pending' && (r.requestedBy === v.userId || has(v, 'employee.change.manage')) && !v.actingForOther,
      people: rows
        .map((x) => ({ employeeId: x.employeeId, name: nameOf(x.employeeId), status: x.status, reason: x.failReason, options: x.options, result: x.result, openItems: items.find((i) => i.employeeId === x.employeeId)?._count._all ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  list(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const rows = await tx.restructure.findMany({ where: { organizationId: c.organizationId }, orderBy: { requestedAt: 'desc' }, take: 100 });
      return Promise.all(rows.map((r) => this.summary(tx, c, v, r)));
    });
  }

  get(ctx: TenantContext, v: Viewer, id: string) {
    return this.history.run(ctx, async (tx, c) => this.view(tx, c, v, await this.restructureOr404(tx, c, id)));
  }

  // ------------------------------------------------------------------------------------------ deciding and running

  /** One approval, by someone other than the sender and the people in it. Runs now, or on the effective date. */
  async approve(ctx: TenantContext, v: Viewer, id: string, note?: string) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
    const decided = await this.history.run(ctx, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restructure:${c.organizationId}:${id}`}))`;
      const r = await this.restructureOr404(tx, c, id);
      if (r.status !== 'pending') throw new ConflictException(`This restructure is ${r.status}.`);
      if (!hrApprover(v)) throw new ForbiddenException('HR approves a restructure: it needs employee.change.manage and employee.change.approve.');
      if (r.requestedBy === c.userId) throw new ForbiddenException('You sent this restructure, so someone else in HR approves it.');
      const own = await this.history.ownEmployeeId(tx, c, v);
      if (own && (await tx.restructurePerson.findFirst({ where: { organizationId: c.organizationId, restructureId: id, employeeId: own } }))) throw new ForbiddenException('This restructure moves you, so someone else approves it.');
      const today = todayIst();
      const now = isoDate(r.effectiveOn) <= today || r.kind === 'within';
      await tx.restructure.update({ where: { id }, data: { status: now ? 'pending' : 'scheduled', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionNote: note?.trim() || null, version: { increment: 1 } } });
      await audit(tx, c, 'restructure.approved', 'restructure', id, { runs: now ? 'now' : isoDate(r.effectiveOn) });
      return now;
    });
    if (decided) await this.execute(ctx, id, v);
    return this.get(ctx, v, id);
  }

  /** Moves everyone still pending (approved), each person on their own. */
  private async execute(ctx: TenantContext, id: string, approverViewer: Viewer | null) {
    const r0 = await this.history.run(ctx, (tx, c) => this.restructureOr404(tx, c, id));
    // The sender's grants are checked again now, and the approver's: someone who lost access moves no one.
    const sender = await this.viewerOf(ctx, r0.requestedBy);
    const approver = approverViewer ?? (await this.viewerOf(ctx, r0.decidedBy!));
    return this.history.run({ ...ctx, userId: r0.decidedBy ?? ctx.userId } as TenantContext, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restructure:${c.organizationId}:${id}`}))`;
      const r = await this.restructureOr404(tx, c, id);
      if (r.ranAt || !r.decidedBy || !['pending', 'scheduled'].includes(r.status)) return;
      const h = this.headOf(r);
      const rows = await tx.restructurePerson.findMany({ where: { organizationId: c.organizationId, restructureId: id, status: 'pending' } });
      const names = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((x) => x.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const people: Who[] = [];
      for (const x of rows) {
        const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, id: x.employmentId } });
        const n = names.find((p) => p.id === x.employeeId);
        people.push({ employeeId: x.employeeId, employmentId: x.employmentId, name: n ? displayName(n) : '', code: e?.employeeCode ?? '', locationId: '', departmentId: '', designationId: '', employmentTypeId: '', gradeId: null });
      }
      // Each person's own options were fixed when sent.
      const withOpts: Head = { ...h, plan: { ...h.plan, overrides: rows.map((x) => ({ employeeId: x.employeeId, reason: '', ...(x.options as unknown as MoveOptions) })) } };
      const out = await this.movePeople(tx, c, withOpts, people, sender, approver);
      for (const o of out) {
        const { newEmploymentId, changeId, ...result } = o;
        await tx.restructurePerson.update({
          where: { restructureId_employeeId: { restructureId: id, employeeId: o.employeeId } },
          data: { status: o.status === 'moved' ? 'moved' : 'failed', failReason: o.reason?.slice(0, 500) ?? null, newEmploymentId, changeId, result: result as unknown as Prisma.InputJsonObject },
        });
      }
      const moved = out.filter((o) => o.status === 'moved').length;
      const failed = out.length - moved;
      await tx.restructure.update({ where: { id }, data: { status: 'done', ranAt: new Date(), moved, failed, version: { increment: 1 } } });
      await audit(tx, c, 'restructure.done', 'restructure', id, { moved, failed });
    });
  }

  private async viewerOf(ctx: TenantContext, userId: string): Promise<Viewer> {
    const u = await this.history.run(ctx, (tx) => tx.user.findFirst({ where: { id: userId }, select: { id: true, role: true, organizationId: true, permissionProfileId: true } }));
    if (!u) return { userId, grants: new Set(), scopes: new Map(), actingForOther: false };
    return this.history.viewer({ userId: u.id, role: u.role, organizationId: u.organizationId, permissionProfileId: u.permissionProfileId });
  }

  /** Reject (an approver, never the sender) or cancel (the sender, or HR). */
  async close(ctx: TenantContext, v: Viewer, id: string, outcome: 'rejected' | 'cancelled', reason: string) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
    await this.history.run(ctx, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restructure:${c.organizationId}:${id}`}))`;
      const r = await this.restructureOr404(tx, c, id);
      if (r.status !== 'pending') throw new ConflictException(`This restructure is ${r.status}.`);
      if (outcome === 'rejected' && !hrApprover(v)) throw new ForbiddenException('HR rejects a restructure: it needs employee.change.manage and employee.change.approve.');
      if (outcome === 'rejected' && r.requestedBy === c.userId) throw new ForbiddenException('You sent this restructure: cancel it instead.');
      if (outcome === 'cancelled' && r.requestedBy !== c.userId && !has(v, 'employee.change.manage')) throw new ForbiddenException('You cannot cancel this restructure.');
      await tx.restructure.update({ where: { id }, data: { status: outcome, decidedBy: c.userId ?? null, decidedAt: new Date(), decisionNote: reason.trim(), version: { increment: 1 } } });
      await audit(tx, c, `restructure.${outcome}`, 'restructure', id, { reason: reason.trim() });
    });
    return this.get(ctx, v, id);
  }

  /** The daily run: approved restructures whose effective date has come. */
  async runDue(today = todayIst()): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.restructure.findMany({ where: { status: 'scheduled', effectiveOn: { lte: asDate(today) } }, select: { id: true, organizationId: true, decidedBy: true } }));
    let n = 0;
    for (const r of due) {
      try {
        await this.execute({ organizationId: r.organizationId, isSuperAdmin: false, userId: r.decidedBy } as TenantContext, r.id, null);
        n++;
      } catch (e) {
        this.logger.warn(`restructure ${r.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ continuity (PPL-10)

  /** HR whose change grant reaches the person, or payroll of the entity they moved into. */
  private async mayKeepItems(tx: Tx, c: CompanyContext, v: Viewer, user: RequestUser, employeeId: string, entityId: string) {
    if (v.actingForOther) return false;
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, legalEntityId: entityId }, orderBy: { joinedOn: 'desc' } });
    if (e && (await this.history.reachesFrom(tx, c, v, 'employee.change.manage', e, isoDate(e.joinedOn)))) return true;
    const k = await this.keys(user);
    return tenantWide(k, 'payroll.run.prepare') || (k.scopes.get('payroll.run.prepare') ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId);
  }

  continuity(ctx: TenantContext, v: Viewer, user: RequestUser, restructureId: string, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const items = await tx.continuityItem.findMany({ where: { organizationId: c.organizationId, restructureId, employeeId }, orderBy: [{ status: 'desc' }, { dueOn: 'asc' }, { key: 'asc' }] });
      if (!items.length || !(await this.mayKeepItems(tx, c, v, user, employeeId, items[0].legalEntityId))) throw new NotFoundException('No continuity checklist for this person.');
      return items.map((i) => ({ id: i.id, key: i.key, title: i.title, owner: i.owner, dueOn: i.dueOn ? isoDate(i.dueOn) : null, status: i.status, note: i.note, version: i.version }));
    });
  }

  setItem(ctx: TenantContext, v: Viewer, user: RequestUser, id: string, dto: { done: boolean; note?: string | null; version: number }) {
    return this.history.run(ctx, async (tx, c) => {
      const i = await tx.continuityItem.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!i || !(await this.mayKeepItems(tx, c, v, user, i.employeeId, i.legalEntityId))) throw new NotFoundException('No such checklist item.');
      if (i.version !== dto.version) throw new ConflictException('Someone else changed this item. Reload it.');
      await tx.continuityItem.update({ where: { id }, data: { status: dto.done ? 'done' : 'open', doneBy: dto.done ? (c.userId ?? null) : null, doneAt: dto.done ? new Date() : null, ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}), version: { increment: 1 } } });
      await audit(tx, c, dto.done ? 'continuity.item_done' : 'continuity.item_reopened', 'continuity_item', id, { key: i.key, employeeId: i.employeeId });
      return { id, status: dto.done ? 'done' : 'open' };
    });
  }
}
