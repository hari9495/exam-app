import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { personForEmployee } from '../people/persons';
import { joinerInScope, ownOf } from '../documents/person-access';
import { LifecycleJourneysService } from './journeys.service';

// LIFE-1.07 joiners before day one (M01 §3.5, Q1, D3; founder D2): HR adds a joiner by hand or imports many, the
// P01 person is found or made (an email or phone that already belongs to someone is never linked silently), and the
// onboarding checklist starts, anchored on the joining day. A joiner is NOT an employee yet: not in the directory,
// headcount or billing; the employee record is made on the joining day (batch 6b). Who sees a joiner: HR whose
// onboarding key reaches the planned entity / location / department, and the planned manager ("Joining soon").

export interface JoinerInput {
  givenName: string;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  personId?: string;
  joiningOn: string;
  legalEntityId: string;
  locationId: string;
  departmentId?: string | null;
  designationId?: string | null;
  employmentTypeId?: string | null;
  managerEmployeeId?: string | null;
  templateId?: string | null;
}

const CSV_COLUMNS = ['given_name', 'family_name', 'email', 'phone', 'joining_on', 'legal_entity', 'location', 'department', 'designation', 'employment_type', 'manager_code'] as const;
const CSV_REQUIRED = ['given_name', 'joining_on', 'legal_entity', 'location'];
const MAX_ROWS = 300;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (p: { preferredName: string | null; givenName: string; familyName: string | null }) => [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ');

@Injectable()
export class JoinersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly journeys: LifecycleJourneysService,
    private readonly notifications: NotificationsService,
  ) {}

  private async place(tx: Tx, org: string, d: Pick<JoinerInput, 'legalEntityId' | 'locationId' | 'departmentId' | 'designationId' | 'employmentTypeId' | 'managerEmployeeId'>) {
    const loc = await tx.location.findFirst({ where: { organizationId: org, id: d.locationId } });
    if (!loc || loc.legalEntityId !== d.legalEntityId) throw new BadRequestException('Choose a location of the chosen legal entity.');
    if (d.departmentId && !(await tx.department.findFirst({ where: { organizationId: org, id: d.departmentId }, select: { id: true } }))) throw new BadRequestException('No such department.');
    if (d.designationId && !(await tx.designation.findFirst({ where: { organizationId: org, id: d.designationId }, select: { id: true } }))) throw new BadRequestException('No such designation.');
    if (d.employmentTypeId && !(await tx.employmentType.findFirst({ where: { organizationId: org, id: d.employmentTypeId }, select: { id: true } }))) throw new BadRequestException('No such employment type.');
    if (d.managerEmployeeId && !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: d.managerEmployeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('The manager must be a current employee.');
  }

  private async addIn(tx: Tx, c: CompanyContext, v: Viewer, dto: JoinerInput, source: 'direct' | 'import') {
    const org = c.organizationId;
    if (!ISO.test(dto.joiningOn)) throw new BadRequestException('Give the joining day as a date.');
    if (dto.joiningOn < todayIst()) throw new BadRequestException('The joining day cannot be in the past. Add people who already joined as employees.');
    await this.place(tx, org, dto);
    if (!(await joinerInScope(tx, c, v, 'lifecycle.onboarding.manage', { legalEntityId: dto.legalEntityId, locationId: dto.locationId, departmentId: dto.departmentId ?? null, managerEmployeeId: null }))) throw new ForbiddenException('You cannot add joiners to that place.');
    let personId: string;
    try {
      personId = await personForEmployee(tx, c, { givenName: dto.givenName, familyName: dto.familyName, email: dto.email, phone: dto.phone, personId: dto.personId });
    } catch (e) {
      if (e instanceof ConflictException && /already has an employee record/.test(e.message)) throw new ConflictException('This person was an employee before. Rehiring on the same record comes in a later release (batch 6e); for now ask your YukthiX contact.');
      throw e;
    }
    if (await tx.preboarding.findFirst({ where: { organizationId: org, personId, status: 'invited' }, select: { id: true } })) throw new ConflictException('This person is already a joiner.');
    const pb = await tx.preboarding.create({
      data: {
        organizationId: org,
        personId,
        source,
        joiningOn: asDate(dto.joiningOn),
        legalEntityId: dto.legalEntityId,
        locationId: dto.locationId,
        departmentId: dto.departmentId ?? null,
        designationId: dto.designationId ?? null,
        employmentTypeId: dto.employmentTypeId ?? null,
        managerEmployeeId: dto.managerEmployeeId ?? null,
        hrOwnerUserId: c.userId!,
        status: 'invited',
        createdBy: c.userId ?? null,
      },
    });
    await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'preboarder', sourceTable: 'preboardings', sourceId: pb.id, startOn: asDate(todayIst()) } });
    const j = await this.journeys.startIn(tx, c, {
      kind: 'onboarding',
      personId,
      subjectType: 'preboarding',
      subjectId: pb.id,
      anchorOn: dto.joiningOn,
      templateId: dto.templateId,
      place: { legalEntityId: dto.legalEntityId, locationId: dto.locationId, departmentId: dto.departmentId ?? null },
      ownerUserId: c.userId!,
      managerEmployeeId: dto.managerEmployeeId ?? null,
      personUserId: null,
    });
    await audit(tx, c, 'preboarding.started', 'preboarding', pb.id, { source, joiningOn: dto.joiningOn, journeyId: j.id });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'preboarding.started', payload: { preboardingId: pb.id, personId, joiningOn: dto.joiningOn } } });
    return { pb, journeyId: j.id };
  }

  async add(ctx: TenantContext, user: ScopeUser, dto: JoinerInput) {
    const v = await this.journeys.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, (tx, c) => this.addIn(tx, c, v, dto, 'direct'));
    await this.afterAdd(ctx as CompanyContext, user, [res]);
    return { id: res.pb.id, journeyId: res.journeyId };
  }

  private async afterAdd(ctx: CompanyContext, user: ScopeUser, added: { pb: Prisma.PreboardingGetPayload<object>; journeyId: string }[]) {
    for (const a of added) await this.journeys.afterStart(ctx, a.journeyId, user.userId ?? null);
    const managers = await this.tenantPrisma.forTenant(ctx, (tx) => tx.employee.findMany({ where: { organizationId: ctx.organizationId, id: { in: added.map((a) => a.pb.managerEmployeeId).filter((x): x is string => Boolean(x)) }, userId: { not: null } }, select: { userId: true } }));
    if (managers.length) void this.notifications.notify(ctx, user.userId!, managers.map((m) => m.userId!), 'lifecycle.joiner.added', { entityType: 'preboarding', entityId: added[0].pb.id, contextText: 'Someone is joining your team', linkPath: '/yx/people/team' }).catch(() => undefined);
  }

  /** CSV import (Q1): a preview with every row's problems, then commit adds only the rows without problems. */
  async import(ctx: TenantContext, user: ScopeUser, dto: { csv: string; commit: boolean; templateId?: string | null }) {
    if (dto.csv.length > 256 * 1024) throw new BadRequestException('The file is larger than 256 KB.');
    let records: string[][];
    try {
      records = parse(dto.csv.replace(/^﻿/, ''), { skip_empty_lines: true, trim: true, max_record_size: 4096 }) as string[][];
    } catch (e) {
      throw new BadRequestException(`The file is not valid CSV: ${(e as Error).message}`);
    }
    if (records.length < 2) throw new BadRequestException('The file has no rows under the header.');
    const header = records[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
    if (unknown.length) throw new BadRequestException(`Unknown column: ${unknown.join(', ')}. Use: ${CSV_COLUMNS.join(', ')}.`);
    const missing = CSV_REQUIRED.filter((r) => !header.includes(r));
    if (missing.length) throw new BadRequestException(`Missing column: ${missing.join(', ')}.`);
    if (records.length - 1 > MAX_ROWS) throw new BadRequestException(`At most ${MAX_ROWS} rows per file.`);
    const v = await this.journeys.viewer(user);
    const rows = records.slice(1).map((cells, i) => ({ line: i + 2, cell: (k: string) => cells[header.indexOf(k)]?.trim() || null }));
    const results: { line: number; name: string; joiningOn: string | null; ok: boolean; problem: string | null }[] = [];
    const added: { pb: Prisma.PreboardingGetPayload<object>; journeyId: string }[] = [];
    for (const r of rows) {
      const name = [r.cell('given_name'), r.cell('family_name')].filter(Boolean).join(' ');
      try {
        // Each row in its own transaction: one bad row never stops the others; the preview rolls every row back.
        const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          const org = c.organizationId;
          const code = async <T extends { id: string }>(label: string, value: string | null, find: (v: string) => Promise<T | null>) => {
            if (!value) return null;
            const hit = await find(value);
            if (!hit) throw new BadRequestException(`No ${label} "${value}".`);
            return hit.id;
          };
          const entity = await code('legal entity', r.cell('legal_entity'), (x) => tx.legalEntity.findFirst({ where: { organizationId: org, OR: [{ shortName: x }, { name: x }] }, select: { id: true } }));
          const location = await code('location', r.cell('location'), (x) => tx.location.findFirst({ where: { organizationId: org, legalEntityId: entity ?? undefined, OR: [{ code: x }, { name: x }] }, select: { id: true } }));
          if (!entity || !location) throw new BadRequestException('Give the legal entity and location.');
          const input: JoinerInput = {
            givenName: r.cell('given_name') ?? '',
            familyName: r.cell('family_name'),
            email: r.cell('email'),
            phone: r.cell('phone'),
            joiningOn: r.cell('joining_on') ?? '',
            legalEntityId: entity,
            locationId: location,
            departmentId: await code('department', r.cell('department'), (x) => tx.department.findFirst({ where: { organizationId: org, OR: [{ code: x }, { name: x }] }, select: { id: true } })),
            designationId: await code('designation', r.cell('designation'), (x) => tx.designation.findFirst({ where: { organizationId: org, OR: [{ code: x }, { name: x }] }, select: { id: true } })),
            employmentTypeId: await code('employment type', r.cell('employment_type'), (x) => tx.employmentType.findFirst({ where: { organizationId: org, OR: [{ code: x }, { name: x }] }, select: { id: true } })),
            managerEmployeeId: await code('manager with code', r.cell('manager_code'), async (x) => {
              const e = await tx.employment.findFirst({ where: { organizationId: org, employeeCode: x, exitedOn: null }, select: { employeeId: true } });
              return e ? { id: e.employeeId } : null;
            }),
            templateId: dto.templateId,
          };
          if (!input.givenName) throw new BadRequestException('Give the first name.');
          const res = await this.addIn(tx, c, v, input, 'import');
          if (!dto.commit) throw new PreviewOnly();
          return res;
        });
        added.push(out);
        results.push({ line: r.line, name, joiningOn: r.cell('joining_on'), ok: true, problem: null });
      } catch (e) {
        if (e instanceof PreviewOnly) results.push({ line: r.line, name, joiningOn: r.cell('joining_on'), ok: true, problem: null });
        else results.push({ line: r.line, name, joiningOn: r.cell('joining_on'), ok: false, problem: e instanceof HttpException ? messageOf(e) : 'This row could not be read.' });
      }
    }
    if (added.length) await this.afterAdd(ctx as CompanyContext, user, added);
    return { committed: dto.commit, added: added.length, rows: results };
  }

  /** The onboarding board: open joiners the viewer's onboarding key reaches, with checklist progress. */
  async board(ctx: TenantContext, user: ScopeUser) {
    const v = await this.journeys.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const since = new Date(Date.now() - 30 * 86_400_000);
      const rows = await tx.preboarding.findMany({ where: { organizationId: org, OR: [{ status: 'invited' }, { status: 'joined', updatedAt: { gte: since } }] }, orderBy: { joiningOn: 'asc' }, take: 1000 });
      const out = [];
      for (const r of rows) {
        const key = v.grants.has('lifecycle.onboarding.view') ? 'lifecycle.onboarding.view' : 'lifecycle.onboarding.manage';
        if (!(await joinerInScope(tx, c, v, key, r))) continue;
        out.push(await this.rowView(tx, org, r));
      }
      return { today: todayIst(), canAdd: v.grants.has('lifecycle.onboarding.manage'), joiners: out };
    });
  }

  private async rowView(tx: Tx, org: string, r: Prisma.PreboardingGetPayload<object>) {
    const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: r.personId } });
    const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: r.id, kind: 'onboarding' } });
    const [loc, dept, desig, mgr] = await Promise.all([
      tx.location.findFirst({ where: { organizationId: org, id: r.locationId }, select: { name: true } }),
      r.departmentId ? tx.department.findFirst({ where: { organizationId: org, id: r.departmentId }, select: { name: true } }) : null,
      r.designationId ? tx.designation.findFirst({ where: { organizationId: org, id: r.designationId }, select: { name: true } }) : null,
      r.managerEmployeeId ? tx.employee.findFirst({ where: { organizationId: org, id: r.managerEmployeeId } }) : null,
    ]);
    const open = j ? await tx.journeyTask.count({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] } } }) : 0;
    const overdue = j ? await tx.journeyTask.count({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] }, dueOn: { lt: asDate(todayIst()) } } }) : 0;
    return {
      id: r.id,
      personId: r.personId,
      name: nameOf(p),
      email: p.primaryEmail,
      joiningOn: iso(r.joiningOn),
      status: r.status,
      source: r.source,
      location: loc?.name ?? '',
      department: dept?.name ?? null,
      designation: desig?.name ?? null,
      manager: mgr ? nameOf(mgr) : null,
      journeyId: j?.id ?? null,
      progress: j?.progress ?? 0,
      openTasks: open,
      overdueTasks: overdue,
      version: r.version,
    };
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.journeys.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such joiner.');
      const own = await ownOf(tx, c, v);
      if (r.managerEmployeeId !== own.employeeId && !(await joinerInScope(tx, c, v, v.grants.has('lifecycle.onboarding.view') ? 'lifecycle.onboarding.view' : 'lifecycle.onboarding.manage', r))) throw new ForbiddenException('You cannot see this joiner.');
      return this.rowView(tx, c.organizationId, r);
    });
  }

  /** "Joining soon" for a manager (and HR's own planned reports): joiners whose planned manager is me. */
  async joiningSoon(ctx: TenantContext, user: ScopeUser) {
    const v = await this.journeys.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.employeeId) return [];
      const rows = await tx.preboarding.findMany({ where: { organizationId: c.organizationId, managerEmployeeId: own.employeeId, status: 'invited' }, orderBy: { joiningOn: 'asc' } });
      return Promise.all(rows.map((r) => this.rowView(tx, c.organizationId, r)));
    });
  }

  /** YX-LC-13 postpone: a new joining day moves the checklist's unfinished tasks by the same days. */
  async postpone(ctx: TenantContext, user: ScopeUser, id: string, dto: { joiningOn: string; reason: string; version: number }) {
    const v = await this.journeys.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('No such joiner.');
      if (!(await joinerInScope(tx, c, v, 'lifecycle.onboarding.manage', r))) throw new ForbiddenException('You cannot change this joiner.');
      if (r.status !== 'invited') throw new ConflictException('This joiner is no longer waiting to join.');
      if (!ISO.test(dto.joiningOn) || dto.joiningOn < todayIst()) throw new BadRequestException('The new joining day must be today or later.');
      const n = await tx.preboarding.updateMany({ where: { organizationId: c.organizationId, id, version: dto.version }, data: { joiningOn: asDate(dto.joiningOn), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this joiner. Reload it.');
      const j = await tx.journey.findFirst({ where: { organizationId: c.organizationId, subjectType: 'preboarding', subjectId: id, kind: 'onboarding' } });
      const moved = j ? await this.journeys.reanchorIn(tx, c, j.id, dto.joiningOn) : 0;
      await audit(tx, c, 'preboarding.joining_date.changed', 'preboarding', id, { from: iso(r.joiningOn), to: dto.joiningOn, reason: dto.reason.trim().slice(0, 300) });
      await tx.eventOutbox.create({ data: { organizationId: c.organizationId, eventType: 'preboarding.joining_date.changed', payload: { preboardingId: id, from: iso(r.joiningOn), to: dto.joiningOn } } });
      return { ok: true, moved };
    });
  }
}

class PreviewOnly extends Error {}
function messageOf(e: HttpException): string {
  const r = e.getResponse();
  if (typeof r === 'string') return r;
  const m = (r as { message?: unknown }).message;
  return Array.isArray(m) ? m.join(' ') : String(m ?? e.message);
}
