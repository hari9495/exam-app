import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { StatutoryRegistersService, renderRegister } from '../payroll/statutory-registers.service';
import { monthRange } from '../time/time-core';
import { payScope } from '../payroll/pay-access';
import { ContractLabourService } from './contract-labour.service';

// Contract labour CL-6 (CLB-04, founder answers 629, 630). The registers: the formats are rule-set data per state
// (IN.CLRA.REGISTERS, verify); each month and establishment the compliance owner makes the register of contractors, of
// contract workers, the muster roll and the wage register from the deployments and the contractors' wage registers
// (CL-4). Answer 781: the muster's days are the site attendance the site in-charge confirmed (CL-5); a contractor whose
// month is not confirmed keeps the muster waiting, and one without a wage register keeps the wage register waiting. The versions live in statutory_registers
// (types clra_*), so freezing and the company DSC signature are the payroll registers service's. The annual return is
// drafted here from the year's data; filing on the portal stays manual: the filed day and reference are recorded.
// Reads: clra.contractor.view; changes: clra.contractor.manage, never while acting (403); another company: 404.

type RegisterFormat = { type: string; title: string; columns: string[] };
type Formats = { registers: RegisterFormat[]; annualReturn: { title: string; due: string } };
const STATUTE = 'IN.CLRA.REGISTERS';
const MUSTER_NOTE = 'Days from the site attendance confirmed by the site in-charge';
const RETURN_DAYS_NOTE = 'Days worked are from the contractors’ wage registers';
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rupees = (paise: bigint) => (Number(paise) / 100).toFixed(2);
const lastMonths = (month: string, n: number) => Array.from({ length: n }, (_, i) => iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - (n - 1 - i), 1))).slice(0, 7));

@Injectable()
export class ClraRegistersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clra: ContractLabourService,
    private readonly rules: StatutoryRulesService,
    private readonly registers: StatutoryRegistersService,
  ) {}

  private async formats(state: string, on: string) {
    const rs = inForce(await this.rules.published(), STATUTE, [state], on);
    if (!rs) throw new ConflictException(`No contract-labour register formats are published for ${state} on ${on}. YukthiX support publishes them first.`);
    return { version: rs.version, values: rs.values as unknown as Formats };
  }

  private async site(tx: Tx, c: CompanyContext, locationId: string) {
    const loc = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId }, select: { id: true, name: true, state: true, legalEntityId: true } });
    if (!loc) throw new NotFoundException('Establishment not found.');
    return loc;
  }

  /** Deployments that worked at the site in the period (approved; a worker never approved never worked). */
  private deployments(tx: Tx, c: CompanyContext, locationId: string | null, from: string, to: string) {
    return tx.contractDeployment.findMany({ where: { organizationId: c.organizationId, ...(locationId ? { locationId } : {}), approvedAt: { not: null }, fromOn: { lte: day(to) }, OR: [{ toOn: null }, { toOn: { gte: day(from) } }] }, orderBy: { fromOn: 'asc' } });
  }

  /** The month's registers and what is still waiting, for the establishments in contract labour; the last six months' counts. */
  async list(ctx: TenantContext, user: ScopeUser, month: string) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { from, to } = monthRange(month);
      const deps = await this.deployments(tx, c, null, from, to);
      const siteIds = [...new Set((await tx.contractDeployment.findMany({ where: { organizationId: org, approvedAt: { not: null } }, select: { locationId: true }, distinct: ['locationId'] })).map((x) => x.locationId))];
      const sites = await tx.location.findMany({ where: { organizationId: org, id: { in: siteIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true, legalEntityId: true } });
      // The register table's pay guard opens to the entities of these sites; only clra_* rows are read.
      await payScope(tx, [...new Set(sites.map((s) => s.legalEntityId))]);
      const regs = await tx.statutoryRegister.findMany({ where: { organizationId: org, registerType: { startsWith: 'clra_' }, periodStart: day(from), status: { not: 'superseded' } }, orderBy: [{ registerType: 'asc' }] });
      const waiting = [];
      const attendanceWaiting = [];
      for (const s of sites) {
        const here = deps.filter((d) => d.locationId === s.id);
        const names = await this.missingWages(tx, c, s.id, month, here);
        if (names.length) waiting.push({ locationId: s.id, contractors: names });
        const open = await this.unconfirmed(tx, c, s.id, month, here);
        if (open.length) attendanceWaiting.push({ locationId: s.id, contractors: open });
      }
      const chartMonths = lastMonths(month, 6);
      const chartDeps = await this.deployments(tx, c, null, `${chartMonths[0]}-01`, to);
      return {
        month,
        canMake: a.manage && !a.actingForOther,
        establishments: sites.map((s) => ({ id: s.id, name: s.name })),
        registers: regs.map((r) => ({ id: r.id, type: r.registerType, locationId: r.locationId, location: sites.find((s) => s.id === r.locationId)?.name ?? '', formatVersion: r.formatVersion, version: r.version, status: r.status, rows: r.rowCount, signatureRef: r.signatureRef, frozenAt: r.frozenAt, signedAt: r.signedAt })),
        waiting,
        attendanceWaiting,
        chart: {
          months: chartMonths,
          series: sites.map((s) => ({ name: s.name, values: chartMonths.map((m) => chartDeps.filter((d) => d.locationId === s.id && iso(d.fromOn) <= monthRange(m).to && (!d.toOn || iso(d.toOn) >= `${m}-01`)).length) })),
        },
      };
    });
  }

  /** Contractors with workers at the site in the month and no wage register yet. */
  private async missingWages(tx: Tx, c: CompanyContext, locationId: string, month: string, deps: { agencyId: string }[]) {
    const agencies = [...new Set(deps.map((d) => d.agencyId))];
    if (!agencies.length) return [];
    const packs = await tx.contractorPack.findMany({ where: { organizationId: c.organizationId, locationId, month: day(`${month}-01`), agencyId: { in: agencies } }, select: { id: true, agencyId: true } });
    const withWages = new Set((await tx.contractorPackItem.findMany({ where: { organizationId: c.organizationId, packId: { in: packs.map((p) => p.id) }, kind: 'wage_register' }, select: { packId: true } })).map((i) => packs.find((p) => p.id === i.packId)!.agencyId));
    const missing = agencies.filter((x) => !withWages.has(x));
    return (await tx.agency.findMany({ where: { organizationId: c.organizationId, id: { in: missing } }, select: { name: true }, orderBy: { name: 'asc' } })).map((x) => x.name);
  }

  /** Answer 781: contractors with workers at the site in the month whose attendance the site in-charge has not confirmed. */
  private async unconfirmed(tx: Tx, c: CompanyContext, locationId: string, month: string, deps: { agencyId: string }[]) {
    const agencies = [...new Set(deps.map((d) => d.agencyId))];
    if (!agencies.length) return [];
    const done = new Set((await tx.contractAttendanceConfirmation.findMany({ where: { organizationId: c.organizationId, locationId, month: day(`${month}-01`), agencyId: { in: agencies } }, select: { agencyId: true } })).map((x) => x.agencyId));
    return (await tx.agency.findMany({ where: { organizationId: c.organizationId, id: { in: agencies.filter((x) => !done.has(x)) } }, select: { name: true }, orderBy: { name: 'asc' } })).map((x) => x.name);
  }

  /** Answer 629: the month's registers for one establishment (a new version needs a reason; the old one is superseded). */
  async make(ctx: TenantContext, user: ScopeUser, dto: { month: string; locationId: string; reason?: string }) {
    const a = await this.clra.gate(user, 'manage');
    if (dto.month >= todayIst().slice(0, 7)) throw new BadRequestException('Make a month’s registers after the month ends.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const loc = await this.site(tx, c, dto.locationId);
      const { from, to } = monthRange(dto.month);
      const f = await this.formats(loc.state, from);
      const deps = await this.deployments(tx, c, loc.id, from, to);
      if (!deps.length) throw new ConflictException(`No contract workers worked at ${loc.name} in ${dto.month}.`);
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: loc.legalEntityId }, select: { id: true, name: true } });
      await payScope(tx, [entity.id]);
      const agencies = await tx.agency.findMany({ where: { organizationId: org, id: { in: [...new Set(deps.map((d) => d.agencyId))] } }, select: { id: true, name: true, work: true }, orderBy: { name: 'asc' } });
      const licences = await tx.contractorLicence.findMany({ where: { organizationId: org, locationId: loc.id, agencyId: { in: agencies.map((x) => x.id) }, status: 'verified', validFrom: { lte: day(to) }, validTo: { gte: day(from) } }, orderBy: { validTo: 'desc' } });
      const persons = new Map((await tx.person.findMany({ where: { organizationId: org, id: { in: deps.map((d) => d.personId) } }, select: { id: true, givenName: true, familyName: true } })).map((p) => [p.id, [p.givenName, p.familyName].filter(Boolean).join(' ')]));
      const agencyName = new Map(agencies.map((x) => [x.id, x.name]));
      const waiting = await this.missingWages(tx, c, loc.id, dto.month, deps);
      const attendanceWaiting = await this.unconfirmed(tx, c, loc.id, dto.month, deps);
      // Answer 781: each worker's days on site from the confirmed attendance.
      const present = new Map<string, number>();
      for (const a of await tx.contractAttendance.findMany({ where: { organizationId: org, deploymentId: { in: deps.map((d) => d.id) }, workOn: { gte: day(from), lte: day(to) } }, select: { deploymentId: true } })) present.set(a.deploymentId, (present.get(a.deploymentId) ?? 0) + 1);
      const packs = await tx.contractorPack.findMany({ where: { organizationId: org, locationId: loc.id, month: day(from) }, select: { id: true } });
      const wages = new Map((await tx.contractorWageLine.findMany({ where: { organizationId: org, packId: { in: packs.map((p) => p.id) }, deploymentId: { in: deps.map((d) => d.id) } } })).map((w) => [w.deploymentId, w]));
      const sl = (rows: string[][]) => rows.map((r, i) => [String(i + 1), ...r]);
      const byName = [...deps].sort((x, y) => (persons.get(x.personId) ?? '').localeCompare(persons.get(y.personId) ?? ''));
      const rowsOf: Record<string, string[][] | null> = {
        clra_contractors: sl(agencies.map((ag) => {
          const lic = licences.find((l) => l.agencyId === ag.id);
          return [ag.name, ag.work ?? '', lic?.licenceNo ?? 'No licence verified', lic ? iso(lic.validTo) : '', lic ? String(lic.maxWorkers) : '', String(deps.filter((d) => d.agencyId === ag.id).length)];
        })),
        clra_workmen: sl(byName.map((d) => [persons.get(d.personId) ?? '', agencyName.get(d.agencyId) ?? '', d.skill.replace('_', '-'), d.idLast4, d.uan ?? '', iso(d.fromOn), d.toOn ? iso(d.toOn) : ''])),
        // A register that would be incomplete waits: the muster for every contractor's confirmed attendance, the wages for every wage register.
        clra_muster: attendanceWaiting.length ? null : sl(byName.map((d) => [persons.get(d.personId) ?? '', agencyName.get(d.agencyId) ?? '', String(present.get(d.id) ?? 0)])),
        clra_wages: waiting.length ? null : sl(byName.map((d) => { const w = wages.get(d.id); return [persons.get(d.personId) ?? '', agencyName.get(d.agencyId) ?? '', String(w?.days ?? 0), w ? rupees(w.grossPaise) : '0.00', w ? iso(w.paidOn) : '']; })),
      };
      const current = await tx.statutoryRegister.findMany({ where: { organizationId: org, legalEntityId: entity.id, locationId: loc.id, periodStart: day(from), registerType: { startsWith: 'clra_' }, status: { not: 'superseded' } } });
      if (current.length && !dto.reason?.trim()) throw new BadRequestException('Registers for this month exist. Say why a new version is needed.');
      const made = [];
      for (const t of f.values.registers) {
        const rows = rowsOf[t.type];
        if (!rows) continue;
        const old = current.find((x) => x.registerType === t.type) ?? null;
        const note = `Format ${f.version} (verify)${t.type === 'clra_muster' ? ` · ${MUSTER_NOTE}` : t.type === 'clra_wages' ? ' · from the contractors’ wage registers' : ''}`;
        const reg = await this.registers.storeIn(tx, c, { entity, locationId: loc.id, place: loc.name, month: dto.month, type: t.type, title: t.title, columns: t.columns, rows, note, formatVersion: f.version, old, reason: dto.reason?.trim() ?? null, userId: user.userId! });
        made.push({ id: reg.id, type: t.type, version: reg.version, rows: rows.length });
      }
      await audit(tx, c, 'clra.registers.generated', 'location', loc.id, { month: dto.month, registers: made, waiting, attendanceWaiting, reason: dto.reason ?? null });
      return { month: dto.month, registers: made, waiting, attendanceWaiting };
    });
  }

  /** The register's file for readers of contract labour (the download is recorded with its hash). */
  async file(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id);
      await payScope(tx, entities);
      const r = await tx.statutoryRegister.findFirst({ where: { organizationId: c.organizationId, id, registerType: { startsWith: 'clra_' } } });
      if (!r) throw new NotFoundException('Register not found.');
      const file = await this.registers.fileOf(r);
      await audit(tx, c, 'statutory.register.downloaded', 'statutory_register', r.id, { sha256: r.sha256 });
      return { file, name: `${r.registerType}-${iso(r.periodStart).slice(0, 7)}-v${r.version}.pdf` };
    });
  }

  /* ---------------- 630 the annual return ---------------- */

  private async figures(tx: Tx, c: CompanyContext, locationId: string, year: number) {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const deps = await this.deployments(tx, c, locationId, from, to);
    let max = 0;
    for (let t = day(from).getTime(); t <= day(to).getTime(); t += 86_400_000) {
      const d = iso(new Date(t));
      const n = deps.filter((x) => iso(x.fromOn) <= d && (!x.toOn || iso(x.toOn) >= d)).length;
      if (n > max) max = n;
    }
    const packs = await tx.contractorPack.findMany({ where: { organizationId: c.organizationId, locationId, month: { gte: day(from), lte: day(to) } }, select: { id: true } });
    const lines = await tx.contractorWageLine.findMany({ where: { organizationId: c.organizationId, packId: { in: packs.map((p) => p.id) } }, select: { days: true, grossPaise: true } });
    return { contractors: new Set(deps.map((d) => d.agencyId)).size, workers: new Set(deps.map((d) => d.personId)).size, maxWorkersOnADay: max, daysWorked: lines.reduce((s, l) => s + l.days, 0), wagesPaid: rupees(lines.reduce((s, l) => s + l.grossPaise, 0n)) };
  }

  /** Each establishment's return for a year: the drafted figures, the day it is due, and the filing if recorded. */
  async returns(ctx: TenantContext, user: ScopeUser, year: number) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const deps = await this.deployments(tx, c, null, `${year}-01-01`, `${year}-12-31`);
      const sites = await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(deps.map((d) => d.locationId))] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, state: true } });
      const filed = await tx.clraAnnualReturn.findMany({ where: { organizationId: c.organizationId, year } });
      const out = [];
      for (const s of sites) {
        const f = await this.formats(s.state, `${year}-12-31`).catch(() => null);
        const done = filed.find((x) => x.locationId === s.id);
        out.push({
          locationId: s.id,
          location: s.name,
          title: f?.values.annualReturn.title ?? 'Annual return of the principal employer',
          due: `${year + 1}-${f?.values.annualReturn.due ?? '02-15'}`,
          figures: done ? (done.figures as Record<string, unknown>) : await this.figures(tx, c, s.id, year),
          filed: done ? { on: iso(done.filedOn), reference: done.reference, at: done.filedAt.toISOString() } : null,
        });
      }
      return { year, canFile: a.manage && !a.actingForOther, daysNote: RETURN_DAYS_NOTE, returns: out };
    });
  }

  /** The drafted return as a PDF to fill in on the portal. */
  async returnPdf(ctx: TenantContext, user: ScopeUser, locationId: string, year: number) {
    await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.site(tx, c, locationId);
      const f = await this.formats(loc.state, `${year}-12-31`);
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: loc.legalEntityId }, select: { name: true } });
      const fig = await this.figures(tx, c, loc.id, year);
      const rows = [
        ['Contractors engaged', String(fig.contractors)],
        ['Contract workers engaged', String(fig.workers)],
        ['Most contract workers on any day', String(fig.maxWorkersOnADay)],
        ['Days worked (from the wage registers)', String(fig.daysWorked)],
        ['Wages paid by contractors (₹)', fig.wagesPaid],
      ];
      await audit(tx, c, 'clra.return.drafted', 'location', loc.id, { year });
      return { file: await renderRegister(`${f.values.annualReturn.title} ${year} (draft)`, entity.name, String(year), loc.name, ['Item', 'Figure'], rows, `Format ${f.version} (verify) · drafted by YukthiX · file it on the portal and record the filing`), name: `clra-annual-return-${year}.pdf` };
    });
  }

  /** Answer 630: the return was filed on the portal by hand; the day and reference are recorded once. */
  async recordFiling(ctx: TenantContext, user: ScopeUser, locationId: string, year: number, dto: { filedOn: string; reference: string }) {
    const a = await this.clra.gate(user, 'manage');
    const today = todayIst();
    if (year >= Number(today.slice(0, 4))) throw new BadRequestException('A year’s return is filed after the year ends.');
    if (dto.filedOn > today) throw new BadRequestException('The filing day cannot be in the future.');
    if (dto.filedOn < `${year + 1}-01-01`) throw new BadRequestException(`A ${year} return is filed in ${year + 1} or later.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.site(tx, c, locationId);
      if (await tx.clraAnnualReturn.findFirst({ where: { organizationId: c.organizationId, locationId: loc.id, year }, select: { id: true } })) throw new ConflictException('This return is already recorded as filed.');
      const f = await this.formats(loc.state, `${year}-12-31`);
      const figures = await this.figures(tx, c, loc.id, year);
      if (!figures.contractors) throw new ConflictException(`No contract workers worked at ${loc.name} in ${year}.`);
      const row = await tx.clraAnnualReturn.create({ data: { organizationId: c.organizationId, locationId: loc.id, year, figures, formatVersion: f.version, filedOn: day(dto.filedOn), reference: dto.reference.trim(), filedBy: user.userId! } });
      await audit(tx, c, 'clra.return.filed', 'location', loc.id, { year, filedOn: dto.filedOn, reference: row.reference });
      return { id: row.id, filedOn: dto.filedOn, reference: row.reference };
    });
  }
}

