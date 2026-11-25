import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { asDate, todayIst } from '../org-structure/org-validation';
import { buildViewer, ScopeUser, tenantWide, Viewer } from '../access/scope';
import { displayName } from '../employee-history/employee-history.service';
import { joinerInScope } from '../documents/person-access';
import { payScope } from '../payroll/pay-access';

// People menu registers (design PPL-41, PPL-39, PPL-26):
//   buddies     the pool of colleagues who volunteer, how many joiners each looks after (at most their cap), joiners
//               still without a buddy and the buddy check-ins. Joiners are named only where the onboarding keys reach.
//               Assigning goes through PUT /lifecycle/joiners/:id/buddy (the existing rules: never the manager).
//   unions      the union register per legal entity: establishment, recognition and basis, period, office bearers and
//               how many workers signed check-off. Membership is Confidential, so the rows stay under the pay guard
//               (RLS app_pay_entities) for the entities lifecycle.exit.manage reaches (industrial relations).
//   succession  critical positions with nominated successors and readiness; Confidential, company-wide holders of
//               succession.manage only.

const KEYS = ['lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.exit.manage', 'succession.manage'] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const READINESS = { now: 'Ready now', '1_2y': '1–2 years', '3y': '3+ years' } as const;
/** How long after joining a buddy still looks after the joiner. */
const LOOK_AFTER_DAYS = 90;
/** Joiners a buddy looks after now: still to join, or joined in the last LOOK_AFTER_DAYS days. */
export const lookedAfter = (org: string) => ({ organizationId: org, OR: [{ status: 'invited' }, { status: 'joined', joiningOn: { gte: asDate(new Date(Date.now() - LOOK_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10)) } }] });

@Injectable()
export class PeopleRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }) : [];
    return new Map(rows.map((r) => [r.id, displayName(r)]));
  }

  /** Today's department and location of each employee (their current assignment). */
  private async placeOf(tx: Tx, org: string, employeeIds: string[]) {
    if (!employeeIds.length) return new Map<string, { team: string; location: string; legalEntityId: string }>();
    const rows = await tx.$queryRaw<{ employee_id: string; team: string | null; location: string | null; legal_entity_id: string }[]>`
      SELECT e.employee_id, d.name::text AS team, l.name::text AS location, e.legal_entity_id
      FROM employments e
      LEFT JOIN employee_assignments a ON a.employment_id = e.id AND a.organization_id = e.organization_id
        AND a.valid_from <= ${todayIst()}::date AND (a.valid_to IS NULL OR a.valid_to >= ${todayIst()}::date) AND a.superseded_at IS NULL
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN locations l ON l.id = a.location_id
      WHERE e.organization_id = ${org}::uuid AND e.exited_on IS NULL AND e.employee_id = ANY(${employeeIds}::uuid[])`;
    return new Map(rows.map((r) => [r.employee_id, { team: r.team ?? '', location: r.location ?? '', legalEntityId: r.legal_entity_id }]));
  }

  // ------------------------------------------------------------------------------------------ buddies (PPL-41)

  private onboardingReader(v: Viewer) {
    if (v.actingForOther || !(v.grants.has('lifecycle.onboarding.view') || v.grants.has('lifecycle.onboarding.manage'))) throw new ForbiddenException('You cannot see the buddy pool.');
  }

  async buddies(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.onboardingReader(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const all = await tx.preboarding.findMany({ where: lookedAfter(org), orderBy: { joiningOn: 'asc' } });
      const key = v.grants.has('lifecycle.onboarding.view') ? 'lifecycle.onboarding.view' : 'lifecycle.onboarding.manage';
      const joiners: typeof all = [];
      for (const j of all) if (await joinerInScope(tx, c, v, key, j)) joiners.push(j);
      const people = await tx.person.findMany({ where: { organizationId: org, id: { in: joiners.map((j) => j.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const personName = new Map(people.map((p) => [p.id, displayName(p)]));
      const pool = await tx.buddyPool.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'asc' } });
      // Load counts every joiner a buddy looks after, named or not.
      const load = new Map<string, number>();
      for (const j of all) if (j.buddyEmployeeId) load.set(j.buddyEmployeeId, (load.get(j.buddyEmployeeId) ?? 0) + 1);
      const ids = [...pool.map((p) => p.employeeId), ...joiners.map((j) => j.managerEmployeeId), ...joiners.map((j) => j.buddyEmployeeId)];
      const names = await this.names(tx, org, ids);
      const place = await this.placeOf(tx, org, pool.map((p) => p.employeeId));
      const [depts, locs, desigs] = await Promise.all([
        tx.department.findMany({ where: { organizationId: org, id: { in: joiners.map((j) => j.departmentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
        tx.location.findMany({ where: { organizationId: org, id: { in: joiners.map((j) => j.locationId) } }, select: { id: true, name: true } }),
        tx.designation.findMany({ where: { organizationId: org, id: { in: joiners.map((j) => j.designationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
      ]);
      const nameIn = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? '';
      // A buddy who is leaving cannot look after a joiner past their last day.
      const leaving = await tx.exitCase.findMany({ where: { organizationId: org, employeeId: { in: pool.map((p) => p.employeeId) }, status: { in: ['submitted', 'accepted', 'cleared'] } }, select: { employeeId: true, approvedLwd: true, standardLwd: true } });
      const journeys = joiners.length ? await tx.journey.findMany({ where: { organizationId: org, subjectType: 'preboarding', subjectId: { in: joiners.filter((j) => j.buddyEmployeeId).map((j) => j.id) } }, select: { id: true, subjectId: true } }) : [];
      const tasks = journeys.length ? await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: { in: journeys.map((j) => j.id) }, ownerType: 'buddy', status: { not: 'cancelled' } }, orderBy: { dueOn: 'asc' } }) : [];
      const today = todayIst();
      return {
        pool: pool.map((p) => {
          const exit = leaving.find((e) => e.employeeId === p.employeeId);
          return {
            employeeId: p.employeeId,
            name: names.get(p.employeeId) ?? '',
            team: place.get(p.employeeId)?.team ?? '',
            location: place.get(p.employeeId)?.location ?? '',
            cap: p.cap,
            load: load.get(p.employeeId) ?? 0,
            joiners: joiners.filter((j) => j.buddyEmployeeId === p.employeeId).map((j) => ({ name: personName.get(j.personId) ?? '', joins: iso(j.joiningOn) })),
            leavingOn: exit ? iso(exit.approvedLwd ?? exit.standardLwd) : null,
          };
        }),
        needs: joiners
          .filter((j) => j.status === 'invited' && !j.buddyEmployeeId)
          .map((j) => ({ id: j.id, version: j.version, name: personName.get(j.personId) ?? '', role: nameIn(desigs, j.designationId), team: nameIn(depts, j.departmentId), location: nameIn(locs, j.locationId), manager: names.get(j.managerEmployeeId ?? '') ?? '', managerEmployeeId: j.managerEmployeeId, joins: iso(j.joiningOn) })),
        checkins: tasks.map((t) => {
          const j = joiners.find((x) => x.id === journeys.find((jj) => jj.id === t.journeyId)?.subjectId)!;
          const done = t.status === 'done';
          return { id: t.id, title: t.title, pair: `${personName.get(j.personId) ?? ''} and ${names.get(j.buddyEmployeeId ?? '') ?? ''}`, due: iso(t.dueOn), status: done ? 'Done' : iso(t.dueOn) < today ? 'Overdue' : 'Pending' };
        }),
      };
    });
  }

  private onboardingManager(v: Viewer) {
    if (v.actingForOther || !v.grants.has('lifecycle.onboarding.manage')) throw new ForbiddenException('You cannot change the buddy pool.');
  }

  async addBuddy(ctx: TenantContext, user: ScopeUser, dto: { employeeId: string; cap?: number }) {
    const v = await this.viewer(user);
    this.onboardingManager(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee.');
      try {
        await tx.buddyPool.create({ data: { organizationId: org, employeeId: dto.employeeId, cap: dto.cap ?? 2, createdBy: c.userId ?? null } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This person is already in the buddy pool.');
        throw e;
      }
      await audit(tx, c, 'buddy.pool.added', 'employee', dto.employeeId, { cap: dto.cap ?? 2 });
      return { employeeId: dto.employeeId };
    });
  }

  async removeBuddy(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    this.onboardingManager(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const n = await tx.buddyPool.deleteMany({ where: { organizationId: c.organizationId, employeeId } });
      if (!n.count) throw new NotFoundException('This person is not in the buddy pool.');
      await audit(tx, c, 'buddy.pool.removed', 'employee', employeeId);
      return { employeeId };
    });
  }

  // ------------------------------------------------------------------------------------------ unions (PPL-39)

  /** The legal entities whose union register the person keeps (industrial relations: lifecycle.exit.manage). */
  private async irEntities(tx: Tx, c: CompanyContext, v: Viewer) {
    if (v.actingForOther || !v.grants.has('lifecycle.exit.manage')) throw new ForbiddenException('You cannot see the union register.');
    const all = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } });
    const ids = tenantWide(v, 'lifecycle.exit.manage') ? all.map((e) => e.id) : all.map((e) => e.id).filter((id) => (v.scopes.get('lifecycle.exit.manage') ?? []).some((s) => s.type === 'legal_entity' && s.id === id));
    await payScope(tx, ids);
    return ids;
  }

  async unions(ctx: TenantContext, user: ScopeUser, legalEntityId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const reach = (await this.irEntities(tx, c, v)).filter((id) => !legalEntityId || id === legalEntityId);
      const rows = await tx.union.findMany({ where: { organizationId: org, legalEntityId: { in: reach } }, orderBy: { name: 'asc' } });
      const today = asDate(todayIst());
      const auths = await tx.unionAuthorisation.groupBy({ by: ['unionId'], where: { organizationId: org, unionId: { in: rows.map((r) => r.id) }, validFrom: { lte: today }, OR: [{ revokedOn: null }, { revokedOn: { gt: today } }] }, _count: { _all: true } });
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.locationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: reach } }, select: { id: true, name: true } });
      return {
        entities: entities.map((e) => ({ id: e.id, name: e.name })),
        unions: rows.map((u) => ({
          id: u.id,
          name: u.name,
          registrationNo: u.registrationNo,
          legalEntityId: u.legalEntityId,
          locationId: u.locationId,
          establishment: locs.find((l) => l.id === u.locationId)?.name ?? entities.find((e) => e.id === u.legalEntityId)?.name ?? '',
          recognition: u.recognition as 'recognised' | 'not_recognised',
          basis: u.basis,
          validFrom: u.validFrom ? iso(u.validFrom) : null,
          validTo: u.validTo ? iso(u.validTo) : null,
          bearers: u.bearers,
          checkOff: auths.find((a) => a.unionId === u.id)?._count._all ?? 0,
        })),
      };
    });
  }

  async saveUnion(ctx: TenantContext, user: ScopeUser, id: string | null, dto: UnionInput) {
    const v = await this.viewer(user);
    if (dto.validFrom && dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException('The end date must be on or after the start date.');
    if (dto.recognition === 'recognised' && !dto.basis?.trim()) throw new BadRequestException('Say on what basis the union is recognised.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const reach = await this.irEntities(tx, c, v);
      if (!reach.includes(dto.legalEntityId)) throw new ForbiddenException('You cannot keep the union register of that legal entity.');
      if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId, legalEntityId: dto.legalEntityId }, select: { id: true } }))) throw new BadRequestException('Choose an establishment of that legal entity.');
      const data = {
        name: dto.name.trim(),
        registrationNo: dto.registrationNo?.trim() || null,
        locationId: dto.locationId ?? null,
        recognition: dto.recognition,
        basis: dto.basis?.trim() || null,
        validFrom: dto.validFrom ? asDate(dto.validFrom) : null,
        validTo: dto.validTo ? asDate(dto.validTo) : null,
        bearers: dto.bearers?.trim() || null,
      };
      try {
        if (id) {
          const u = await tx.union.findFirst({ where: { organizationId: org, id, legalEntityId: { in: reach } } });
          if (!u) throw new NotFoundException('No such union.');
          if (u.legalEntityId !== dto.legalEntityId) throw new BadRequestException('A union stays with its legal entity.');
          await tx.union.update({ where: { id }, data });
          await audit(tx, c, 'union.updated', 'union', id, { name: data.name, recognition: data.recognition });
          return { id };
        }
        const u = await tx.union.create({ data: { ...data, organizationId: org, legalEntityId: dto.legalEntityId, createdBy: c.userId! } });
        await audit(tx, c, 'union.added', 'union', u.id, { name: data.name, recognition: data.recognition });
        return { id: u.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A union with this name is already recorded for this legal entity.');
        throw e;
      }
    });
  }

  // ------------------------------------------------------------------------------------------ succession (PPL-26)

  private succession(v: Viewer) {
    // Positions are company-wide, so a plan is for company-wide holders only (Confidential).
    if (v.actingForOther || !tenantWide(v, 'succession.manage')) throw new ForbiddenException('Succession plans are for HR and leadership only.');
  }

  async positions(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.succession(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const positions = await tx.successionPosition.findMany({ where: { organizationId: org }, orderBy: { title: 'asc' } });
      const successors = await tx.successor.findMany({ where: { organizationId: org, positionId: { in: positions.map((p) => p.id) } }, orderBy: { createdAt: 'asc' } });
      const people = [...positions.map((p) => p.incumbentEmployeeId), ...successors.map((s) => s.employeeId)].filter((x): x is string => Boolean(x));
      const names = await this.names(tx, org, people);
      // The latest released review band (reviews the person may not read stay hidden by their own RLS).
      const reviews = people.length ? await tx.review.findMany({ where: { organizationId: org, employeeId: { in: people }, releasedAt: { not: null }, band: { not: null } }, orderBy: { releasedAt: 'desc' }, select: { employeeId: true, band: true, releasedAt: true } }) : [];
      const band = (id: string | null) => (id ? reviews.find((r) => r.employeeId === id)?.band ?? null : null);
      const updated = [...positions.map((p) => p.createdAt), ...successors.map((s) => s.createdAt)].sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        updatedOn: updated ? iso(updated) : null,
        positions: positions.map((p) => ({
          id: p.id,
          title: p.title,
          incumbent: p.incumbentEmployeeId ? { id: p.incumbentEmployeeId, name: names.get(p.incumbentEmployeeId) ?? '', band: band(p.incumbentEmployeeId) } : null,
          successors: successors.filter((s) => s.positionId === p.id).map((s) => ({ id: s.employeeId, name: names.get(s.employeeId) ?? '', readiness: READINESS[s.readiness as keyof typeof READINESS], band: band(s.employeeId) })),
        })),
      };
    });
  }

  async addPosition(ctx: TenantContext, user: ScopeUser, dto: { title: string; incumbentEmployeeId?: string | null }) {
    const v = await this.viewer(user);
    this.succession(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.incumbentEmployeeId && !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.incumbentEmployeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee as the person in the role now.');
      try {
        const p = await tx.successionPosition.create({ data: { organizationId: org, title: dto.title.trim(), incumbentEmployeeId: dto.incumbentEmployeeId ?? null, createdBy: c.userId ?? null } });
        await audit(tx, c, 'succession.position.added', 'succession_position', p.id, { title: p.title });
        return { id: p.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This critical position is already on the list.');
        throw e;
      }
    });
  }

  async nominate(ctx: TenantContext, user: ScopeUser, positionId: string, dto: { employeeId: string; readiness: keyof typeof READINESS }) {
    const v = await this.viewer(user);
    this.succession(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.successionPosition.findFirst({ where: { organizationId: org, id: positionId } });
      if (!p) throw new NotFoundException('No such position.');
      if (p.incumbentEmployeeId === dto.employeeId) throw new BadRequestException('The person in the role cannot be their own successor.');
      if (!(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee.');
      await tx.successor.upsert({
        where: { positionId_employeeId: { positionId, employeeId: dto.employeeId } },
        create: { organizationId: org, positionId, employeeId: dto.employeeId, readiness: dto.readiness, createdBy: c.userId ?? null },
        update: { readiness: dto.readiness },
      });
      await audit(tx, c, 'succession.nominated', 'succession_position', positionId, { employeeId: dto.employeeId, readiness: dto.readiness });
      return { positionId, employeeId: dto.employeeId };
    });
  }

  async removeSuccessor(ctx: TenantContext, user: ScopeUser, positionId: string, employeeId: string) {
    const v = await this.viewer(user);
    this.succession(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const n = await tx.successor.deleteMany({ where: { organizationId: c.organizationId, positionId, employeeId } });
      if (!n.count) throw new NotFoundException('This person is not a successor for this position.');
      await audit(tx, c, 'succession.removed', 'succession_position', positionId, { employeeId });
      return { positionId, employeeId };
    });
  }
}

export interface UnionInput {
  legalEntityId: string;
  name: string;
  registrationNo?: string | null;
  locationId?: string | null;
  recognition: 'recognised' | 'not_recognised';
  basis?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  bearers?: string | null;
}
