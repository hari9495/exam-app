import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { maskShaped, OrgSecretsCryptoService, TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toCsv } from '../performance/calibration-rules';
import { settingFor } from './probation';
import { sealValue } from './profile.service';
import type { BfsiCoiDto, BfsiHoldingDto, BfsiRelatedDto } from './person-panels.dto';

// PPL-43 BFSI declarations (SEBI PIT Regulations 2015; Confidential, P02 §4.4). The compliance officer
// (compliance.declaration.manage, in scope) names the designated persons. Each submits once a financial year their
// holdings, related persons (PAN masked) and conflicts of interest, and attests the code of conduct with a fresh second
// factor; until then it is a draft only they see. The officer sees who is pending, overdue or done, reviews a
// submitted declaration (each look recorded for "Who accessed my data"), reminds, and exports the register (statuses
// only, no holdings).

const KEY = 'compliance.declaration.manage';
export interface Holding { id: string; security: string; quantity: number; how: string | null }
export interface Related { id: string; name: string; relation: string; pan: string | null; holdings: string | null }

/** The financial year (April to March) a day falls in, as "2026-27". */
export const cycleOf = (day: string) => {
  const y = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

@Injectable()
export class BfsiService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  private seal(c: CompanyContext, employeeId: string, value: unknown) {
    return sealValue(this.crypto, c.organizationId, employeeId, JSON.stringify(value));
  }

  private open<T>(c: CompanyContext, employeeId: string, blob: string | null, empty: T): T {
    if (!blob) return empty;
    const prefix = `${c.organizationId}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored value does not belong to this record.');
    return JSON.parse(plain.slice(prefix.length)) as T;
  }

  /** The due day of this financial year's declarations (company setting, per legal entity). */
  private async due(tx: Tx, c: CompanyContext, employeeId: string, cycle: string) {
    const job = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' }, select: { legalEntityId: true } });
    const md = await settingFor(tx, c, 'bfsi.declaration_due', { legalEntityId: job?.legalEntityId ?? '' });
    const start = Number(cycle.slice(0, 4));
    return `${Number(md.slice(0, 2)) >= 4 ? start : start + 1}-${md}`;
  }

  /** My own employee record, designated (the person only, never someone acting for them). */
  private async mine(tx: Tx, c: CompanyContext, v: Viewer) {
    const employeeId = await this.history.ownEmployeeId(tx, c, v);
    if (!employeeId || v.actingForOther) throw new NotFoundException('You have no employee record in this company.');
    const designated = await tx.bfsiDesignation.findUnique({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId } } });
    return { employeeId, designated: Boolean(designated) };
  }

  private async draft(tx: Tx, c: CompanyContext, v: Viewer) {
    const { employeeId, designated } = await this.mine(tx, c, v);
    if (!designated) throw new ForbiddenException('Only designated persons make these declarations.');
    const cycle = cycleOf(todayIst());
    const row = await tx.bfsiDeclaration.upsert({ where: { organizationId_employeeId_cycle: { organizationId: c.organizationId, employeeId, cycle } }, create: { organizationId: c.organizationId, employeeId, cycle }, update: {} });
    if (row.status === 'submitted') throw new ConflictException('This year’s declaration is submitted. Ask the compliance officer to change it.');
    return { employeeId, row };
  }

  private view(c: CompanyContext, employeeId: string, row: { holdingsEnc: string | null; relatedEnc: string | null; coi: string | null; coiEnc: string | null }) {
    return {
      holdings: this.open<Holding[]>(c, employeeId, row.holdingsEnc, []),
      related: this.open<Related[]>(c, employeeId, row.relatedEnc, []).map((r) => ({ ...r, pan: maskShaped('pan', r.pan?.slice(-4)) })),
      coi: row.coi ? { answer: row.coi, details: this.open<string | null>(c, employeeId, row.coiEnc, null) } : null,
    };
  }

  /** My declaration this financial year (or that I am not designated). */
  my(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, designated } = await this.mine(tx, c, v);
      if (!designated) return { designated: false };
      const cycle = cycleOf(todayIst());
      const row = await tx.bfsiDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId, cycle } });
      return {
        designated: true,
        cycle,
        due: await this.due(tx, c, employeeId, cycle),
        status: row?.status ?? 'draft',
        submittedAt: row?.submittedAt?.toISOString() ?? null,
        ...(row ? this.view(c, employeeId, row) : { holdings: [], related: [], coi: null }),
      };
    });
  }

  addHolding(ctx: TenantContext, v: Viewer, dto: BfsiHoldingDto) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, row } = await this.draft(tx, c, v);
      const list = this.open<Holding[]>(c, employeeId, row.holdingsEnc, []);
      if (list.length >= 50) throw new BadRequestException('Up to 50 holdings.');
      const item: Holding = { id: randomUUID(), security: dto.security.trim(), quantity: dto.quantity, how: dto.how?.trim() || null };
      await tx.bfsiDeclaration.update({ where: { id: row.id }, data: { holdingsEnc: this.seal(c, employeeId, [...list, item]) } });
      return { id: item.id };
    });
  }

  addRelated(ctx: TenantContext, v: Viewer, dto: BfsiRelatedDto) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, row } = await this.draft(tx, c, v);
      const list = this.open<Related[]>(c, employeeId, row.relatedEnc, []);
      if (list.length >= 20) throw new BadRequestException('Up to 20 related persons.');
      const item: Related = { id: randomUUID(), name: dto.name.trim(), relation: dto.relation, pan: dto.pan ?? null, holdings: dto.holdings?.trim() || null };
      await tx.bfsiDeclaration.update({ where: { id: row.id }, data: { relatedEnc: this.seal(c, employeeId, [...list, item]) } });
      return { id: item.id };
    });
  }

  remove(ctx: TenantContext, v: Viewer, what: 'holdings' | 'related', id: string) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, row } = await this.draft(tx, c, v);
      const list = this.open<{ id: string }[]>(c, employeeId, what === 'holdings' ? row.holdingsEnc : row.relatedEnc, []);
      if (!list.some((x) => x.id === id)) throw new NotFoundException('Not found');
      const next = this.seal(c, employeeId, list.filter((x) => x.id !== id));
      await tx.bfsiDeclaration.update({ where: { id: row.id }, data: what === 'holdings' ? { holdingsEnc: next } : { relatedEnc: next } });
      return { removed: true };
    });
  }

  saveCoi(ctx: TenantContext, v: Viewer, dto: BfsiCoiDto) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, row } = await this.draft(tx, c, v);
      if (dto.answer === 'yes' && !dto.details?.trim()) throw new BadRequestException('Say what the interest is.');
      await tx.bfsiDeclaration.update({ where: { id: row.id }, data: { coi: dto.answer, coiEnc: dto.answer === 'yes' ? this.seal(c, employeeId, dto.details!.trim()) : null } });
      return { saved: true };
    });
  }

  /** Attest the code of conduct and submit (step-up at the route): the conflict question must be answered. */
  submit(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const { employeeId, row } = await this.draft(tx, c, v);
      if (!row.coi) throw new BadRequestException('Answer the conflict of interest question first.');
      await tx.bfsiDeclaration.update({ where: { id: row.id }, data: { status: 'submitted', submittedAt: new Date() } });
      await audit(tx, c, 'compliance.declaration.submitted', 'employee', employeeId, { cycle: row.cycle });
      return { submitted: true };
    });
  }

  // ---------------------------------------------------------------------------------- the compliance officer

  private officer(v: Viewer) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
  }

  /** The register: every designated person the key reaches, with this year's status. */
  register(ctx: TenantContext, v: Viewer) {
    this.officer(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const all = await tx.bfsiDesignation.findMany({ where: { organizationId: org } });
      const reached = await this.history.reachedIds(tx, c, v, KEY, all.map((d) => d.employeeId));
      const shown = all.filter((d) => reached.has(d.employeeId));
      const cycle = cycleOf(todayIst());
      const rows = await tx.bfsiDeclaration.findMany({ where: { organizationId: org, cycle, employeeId: { in: shown.map((d) => d.employeeId) } } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: shown.map((d) => d.employeeId) } } });
      const out = [];
      for (const d of shown) {
        const r = rows.find((x) => x.employeeId === d.employeeId);
        const due = await this.due(tx, c, d.employeeId, cycle);
        out.push({ employeeId: d.employeeId, name: displayName(people.find((p) => p.id === d.employeeId)!), cycle, due, status: r?.status === 'submitted' ? 'Done' : due < todayIst() ? 'Overdue' : 'Pending', submittedAt: r?.submittedAt?.toISOString() ?? null, remindedAt: r?.remindedAt?.toISOString() ?? null });
      }
      return { cycle, rows: out.sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }

  private async reach(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string) {
    if (!(await this.history.reaches(tx, c, v, KEY, employeeId, todayIst()))) throw new NotFoundException('Not found');
  }

  /** People the officer may designate: current employees the key reaches, not yet designated. */
  candidates(ctx: TenantContext, v: Viewer) {
    this.officer(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const jobs = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, select: { employeeId: true, employeeCode: true } });
      const done = new Set((await tx.bfsiDesignation.findMany({ where: { organizationId: org }, select: { employeeId: true } })).map((d) => d.employeeId));
      const reached = await this.history.reachedIds(tx, c, v, KEY, jobs.map((j) => j.employeeId).filter((id) => !done.has(id)));
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...reached] } } });
      return people.map((p) => ({ employeeId: p.id, name: displayName(p), code: jobs.find((j) => j.employeeId === p.id)?.employeeCode ?? null })).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  designate(ctx: TenantContext, v: Viewer, employeeId: string) {
    this.officer(v);
    return this.history.run(ctx, async (tx, c) => {
      await this.reach(tx, c, v, employeeId);
      await tx.bfsiDesignation.upsert({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId } }, create: { organizationId: c.organizationId, employeeId, designatedOn: asDate(todayIst()), createdBy: c.userId ?? null }, update: {} });
      await audit(tx, c, 'compliance.designated', 'employee', employeeId);
      return { designated: true };
    });
  }

  undesignate(ctx: TenantContext, v: Viewer, employeeId: string) {
    this.officer(v);
    return this.history.run(ctx, async (tx, c) => {
      await this.reach(tx, c, v, employeeId);
      const n = await tx.bfsiDesignation.deleteMany({ where: { organizationId: c.organizationId, employeeId } });
      if (!n.count) throw new NotFoundException('Not a designated person.');
      await audit(tx, c, 'compliance.undesignated', 'employee', employeeId);
      return { designated: false };
    });
  }

  /** A submitted declaration, for the officer (a recorded look at the person's Confidential data). */
  review(ctx: TenantContext, v: Viewer, employeeId: string) {
    this.officer(v);
    return this.history.run(ctx, async (tx, c) => {
      await this.reach(tx, c, v, employeeId);
      const row = await tx.bfsiDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId, cycle: cycleOf(todayIst()), status: 'submitted' } });
      if (!row) throw new NotFoundException('Nothing submitted yet this year.');
      await audit(tx, c, 'compliance.declaration.viewed', 'employee', employeeId, { cycle: row.cycle });
      return { cycle: row.cycle, submittedAt: row.submittedAt!.toISOString(), ...this.view(c, employeeId, row) };
    });
  }

  async remind(ctx: TenantContext, v: Viewer, employeeId: string) {
    this.officer(v);
    const out = await this.history.run(ctx, async (tx, c) => {
      await this.reach(tx, c, v, employeeId);
      const cycle = cycleOf(todayIst());
      if (!(await tx.bfsiDesignation.findUnique({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId } } }))) throw new NotFoundException('Not a designated person.');
      const row = await tx.bfsiDeclaration.upsert({ where: { organizationId_employeeId_cycle: { organizationId: c.organizationId, employeeId, cycle } }, create: { organizationId: c.organizationId, employeeId, cycle, remindedAt: new Date() }, update: { remindedAt: new Date() } });
      if (row.status === 'submitted') throw new ConflictException('This year’s declaration is already submitted.');
      await audit(tx, c, 'compliance.declaration.reminded', 'employee', employeeId, { cycle });
      const user = (await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: employeeId }, select: { userId: true } })).userId;
      return { user, due: await this.due(tx, c, employeeId, cycle) };
    });
    if (out.user && v.userId) void this.notifications.notify(ctx, v.userId, [out.user], 'document.requested', { entityType: 'employee', entityId: employeeId, contextText: `Submit your annual declarations by ${out.due}`, linkPath: '/yx/me/annual-declarations' }).catch(() => undefined);
    return { reminded: true };
  }

  /** The register as a CSV for the regulator's records: who, due, status; never the holdings. */
  async exportRegister(ctx: TenantContext, v: Viewer) {
    const r = await this.register(ctx, v);
    return toCsv(['Person', 'Declaration', 'Financial year', 'Due', 'Status', 'Submitted on'], r.rows.map((x) => [x.name, 'Holdings and relatives (annual)', x.cycle, x.due, x.status, x.submittedAt ? isoDate(new Date(x.submittedAt)) : '']));
  }
}
