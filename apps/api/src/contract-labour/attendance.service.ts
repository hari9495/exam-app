import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { afterWrongPin, pinLocked } from '../time/device-rules';
import { ContractLabourService } from './contract-labour.service';
import { activeIn } from './clra-holds';
import { monthOf, peakOf } from './clra-rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const ANY_ENTITY = { legalEntityId: '' };
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const nameOf = (p?: { givenName: string; familyName: string | null }) => (p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : 'Worker');

/**
 * Contract labour CL-5 (answers 622, 625, 742): contract workers' attendance. Where the site has an attendance kiosk the
 * worker punches there with the gate pass number and their own kiosk PIN (setting clra.attendance_source, default "kiosk
 * where there is one, else the contractor"); otherwise the contractor marks the days on the portal. Our site in-charge
 * (clra.contractor.manage) confirms a contractor's month at a site, which locks it. Attendance never creates payroll
 * inputs: it lives here, not in the employees' punches. The wage check compares the days paid with these days. A nightly
 * job keeps each site's highest number of contract workers on any day of the last 12 months (the threshold count).
 */
@Injectable()
export class ContractAttendanceService {
  private readonly logger = new Logger(ContractAttendanceService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clra: ContractLabourService,
  ) {}

  /** Whether the contractor enters the days for this site (no kiosk there, or the company chose the contractor). */
  async contractorEnters(tx: Tx, c: CompanyContext, locationId: string) {
    if ((await settingFor(tx, c, 'clra.attendance_source', ANY_ENTITY)) === 'contractor') return true;
    return !(await tx.timeDevice.count({ where: { organizationId: c.organizationId, kind: 'kiosk', mode: 'attendance', locationId, status: 'active' } }));
  }

  /** Days present per worker of a contractor at a site in a month (a day counts when it has an entry or a punch). */
  async monthOf(tx: Tx, c: CompanyContext, agencyId: string, locationId: string, month: string) {
    const org = c.organizationId;
    const deps = (await tx.contractDeployment.findMany({ where: { organizationId: org, agencyId, locationId } })).filter((d) => activeIn(d, month));
    const rows = await tx.contractAttendance.findMany({ where: { organizationId: org, deploymentId: { in: deps.map((d) => d.id) }, workOn: { gte: day(month), lte: day(monthEnd(month)) } } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: deps.map((d) => d.personId) } }, select: { id: true, givenName: true, familyName: true } });
    const confirmed = await tx.contractAttendanceConfirmation.findFirst({ where: { organizationId: org, agencyId, locationId, month: day(month) } });
    return {
      confirmed: confirmed ? { at: confirmed.confirmedAt.toISOString(), days: confirmed.days } : null,
      workers: deps.map((d) => {
        const mine = rows.filter((r) => r.deploymentId === d.id);
        return {
          deploymentId: d.id,
          name: nameOf(persons.find((p) => p.id === d.personId)),
          gatePass: d.gatePassNo,
          from: iso(d.fromOn),
          to: (d.releasedOn ?? d.toOn) ? iso((d.releasedOn ?? d.toOn)!) : null,
          days: mine.map((r) => ({ day: iso(r.workOn), source: r.source, inAt: r.inAt?.toISOString() ?? null, outAt: r.outAt?.toISOString() ?? null })).sort((a, b) => a.day.localeCompare(b.day)),
          present: mine.length,
        };
      }),
    };
  }

  /* ---------------- staff ---------------- */

  async month(ctx: TenantContext, user: ScopeUser, monthArg?: string) {
    const a = await this.clra.gate(user, 'view');
    const today = todayIst();
    const month = monthArg ? `${monthArg}-01` : monthOf(today);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const deps = (await tx.contractDeployment.findMany({ where: { organizationId: org }, select: { agencyId: true, locationId: true, fromOn: true, toOn: true, releasedOn: true, status: true } })).filter((d) => activeIn(d, month));
      const keys = [...new Map(deps.map((d) => [`${d.agencyId}|${d.locationId}`, d])).values()];
      const agencies = await tx.agency.findMany({ where: { organizationId: org, id: { in: keys.map((k) => k.agencyId) } }, select: { id: true, name: true } });
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: keys.map((k) => k.locationId) } }, select: { id: true, name: true } });
      const rows = [];
      for (const k of keys) {
        const m = await this.monthOf(tx, c, k.agencyId, k.locationId, month);
        rows.push({ contractorId: k.agencyId, contractor: agencies.find((x) => x.id === k.agencyId)?.name ?? 'Contractor', site: { id: k.locationId, name: locs.find((x) => x.id === k.locationId)?.name ?? 'Site' }, contractorEnters: await this.contractorEnters(tx, c, k.locationId), ...m });
      }
      return { month: month.slice(0, 7), today, canManage: a.manage && !a.actingForOther, canConfirm: month < monthOf(today), rows: rows.sort((x, y) => x.contractor.localeCompare(y.contractor)) };
    });
  }

  /** The site in-charge confirms a past month: the days are then locked (no contractor edit, no late punch). */
  async confirm(ctx: TenantContext, user: ScopeUser, dto: { contractorId: string; locationId: string; month: string }) {
    await this.clra.gate(user, 'manage');
    const month = `${dto.month}-01`;
    if (month >= monthOf(todayIst())) throw new BadRequestException('A month is confirmed after it ends.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const a = await tx.agency.findFirst({ where: { id: dto.contractorId, organizationId: c.organizationId, contractLabour: true }, select: { id: true } });
      if (!a) throw new NotFoundException('Contractor not found.');
      const m = await this.monthOf(tx, c, a.id, dto.locationId, month);
      if (!m.workers.length) throw new NotFoundException('No contract workers of this contractor were at this site that month.');
      if (m.confirmed) throw new ConflictException('This month is already confirmed.');
      const days = m.workers.reduce((n, w) => n + w.present, 0);
      await tx.contractAttendanceConfirmation.create({ data: { organizationId: c.organizationId, agencyId: a.id, locationId: dto.locationId, month: day(month), days, confirmedBy: c.userId! } });
      await audit(tx, c, 'clra.attendance.confirmed', 'agency', a.id, { locationId: dto.locationId, month: dto.month, days });
      return { confirmed: true, days };
    });
  }

  /* ---------------- the contractor portal ---------------- */

  async portalMonth(tx: Tx, c: CompanyContext, agencyId: string, locationId: string, month: string) {
    const has = await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, agencyId, locationId }, select: { id: true } });
    if (!has) throw new NotFoundException('Site not found.');
    const m = await this.monthOf(tx, c, agencyId, locationId, `${month}-01`);
    const enters = await this.contractorEnters(tx, c, locationId);
    return { month, site: locationId, contractorEnters: enters, editable: enters && !m.confirmed && `${month}-01` <= monthOf(todayIst()), ...m };
  }

  /** The contractor marks the days each of its workers was on site (sites without a kiosk only; not once confirmed). */
  async portalEnter(tx: Tx, c: CompanyContext, agencyId: string, contactId: string, dto: { locationId: string; month: string; entries: { deploymentId: string; days: string[] }[] }) {
    const org = c.organizationId;
    const month = `${dto.month}-01`;
    const today = todayIst();
    if (month > monthOf(today)) throw new BadRequestException('Days are marked once they have come.');
    if (!(await this.contractorEnters(tx, c, dto.locationId))) throw new ConflictException('This site has an attendance kiosk: workers punch there with their gate pass number and PIN.');
    if (await tx.contractAttendanceConfirmation.findFirst({ where: { organizationId: org, agencyId, locationId: dto.locationId, month: day(month) } })) throw new ConflictException('The company confirmed this month; ask them to change a day.');
    const deps = (await tx.contractDeployment.findMany({ where: { organizationId: org, agencyId, locationId: dto.locationId } })).filter((d) => activeIn(d, month));
    for (const e of dto.entries) {
      const d = deps.find((x) => x.id === e.deploymentId);
      if (!d) throw new NotFoundException('A worker in the list was not deployed here that month.');
      const end = (d.releasedOn ?? d.toOn) ? iso((d.releasedOn ?? d.toOn)!) : null;
      for (const x of e.days) {
        if (monthOf(x) !== month) throw new BadRequestException(`${x} is not in ${dto.month}.`);
        if (x > today) throw new BadRequestException(`${x} has not come yet.`);
        if (x < iso(d.fromOn) || (end && x > end)) throw new BadRequestException(`${x} is outside the worker's deployment.`);
      }
      if (new Set(e.days).size !== e.days.length) throw new BadRequestException('A day is listed twice.');
    }
    for (const e of dto.entries) {
      await tx.contractAttendance.deleteMany({ where: { organizationId: org, deploymentId: e.deploymentId, workOn: { gte: day(month), lte: day(monthEnd(month)) }, source: 'contractor' } });
      if (e.days.length) await tx.contractAttendance.createMany({ data: e.days.map((x) => ({ organizationId: org, deploymentId: e.deploymentId, workOn: day(x), source: 'contractor', enteredByContact: contactId })), skipDuplicates: true });
    }
    await audit(tx, c, 'clra.attendance.entered', 'agency', agencyId, { locationId: dto.locationId, month: dto.month, workers: dto.entries.length, days: dto.entries.reduce((n, e) => n + e.days.length, 0), via: 'contractor_portal', contactId });
    return { saved: true };
  }

  /* ---------------- the kiosk (answer 625) ---------------- */

  /**
   * A contract worker at a kiosk: the gate pass number and their PIN, for a deployed worker of this site whose pass is
   * valid today. The same tries and lock as an employee's PIN; always one argon2 check.
   */
  async byGatePass(tx: Tx, c: CompanyContext, locationId: string | null, code: string, pin: string, tries: number, dummy: string): Promise<string | null> {
    const today = todayIst();
    const d = await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, gatePassNo: code.toUpperCase(), status: 'deployed', gateValidTo: { gte: day(today) }, ...(locationId ? { locationId } : {}) } });
    if (d) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clra-kiosk:${c.organizationId}:${d.id}`}))`;
    const cred = d ? await tx.contractKioskPin.findFirst({ where: { organizationId: c.organizationId, deploymentId: d.id } }) : null;
    const now = new Date();
    const locked = pinLocked(cred?.lockedUntil ?? null, now);
    const ok = (await argon2.verify(cred && !locked ? cred.pinHash : dummy, /^\d{4}$/.test(pin) ? pin : 'x').catch(() => false)) && Boolean(cred) && !locked;
    if (ok) {
      if (cred!.failed) await tx.contractKioskPin.update({ where: { deploymentId: d!.id }, data: { failed: 0 } });
      return d!.id;
    }
    if (cred && !locked) {
      const next = afterWrongPin(cred.failed, tries, now);
      await tx.contractKioskPin.update({ where: { deploymentId: d!.id }, data: next });
      await audit(tx, c, next.lockedUntil ? 'clra.kiosk.pin_locked' : 'clra.kiosk.pin_failed', 'contract_deployment', d!.id, {});
    }
    return null;
  }

  /** Is this a gate pass of a deployed contract worker of the site? (the kiosk's unknown-code check) */
  async knownGatePass(tx: Tx, c: CompanyContext, locationId: string | null, code: string) {
    return Boolean(await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, gatePassNo: code.toUpperCase(), status: 'deployed', gateValidTo: { gte: day(todayIst()) }, ...(locationId ? { locationId } : {}) }, select: { id: true } }));
  }

  async kioskName(tx: Tx, c: CompanyContext, deploymentId: string) {
    const d = await tx.contractDeployment.findFirstOrThrow({ where: { id: deploymentId, organizationId: c.organizationId } });
    const p = await tx.person.findFirst({ where: { organizationId: c.organizationId, id: d.personId }, select: { givenName: true } });
    return p?.givenName ?? 'there';
  }

  /** What the kiosk shows a contract worker today: their name, today's in and out, and the next punch. */
  async kioskToday(tx: Tx, c: CompanyContext, deploymentId: string) {
    const today = todayIst();
    const row = await tx.contractAttendance.findFirst({ where: { organizationId: c.organizationId, deploymentId, workOn: day(today) } });
    const punches = [...(row?.inAt ? [{ kind: 'in', at: row.inAt }] : []), ...(row?.outAt ? [{ kind: 'out', at: row.outAt }] : [])];
    return { firstName: await this.kioskName(tx, c, deploymentId), today, zone: 'Asia/Kolkata', leave: false, shift: null, punches, next: row?.inAt && !row.outAt ? 'out' : 'in', requests: [], contractWorker: true };
  }

  /** A kiosk punch of a contract worker: the day's first in and last out; a confirmed month takes no more punches. */
  async kioskPunch(tx: Tx, c: CompanyContext, deploymentId: string, kind: string, at: Date) {
    const org = c.organizationId;
    const d = await tx.contractDeployment.findFirstOrThrow({ where: { id: deploymentId, organizationId: org } });
    const workOn = istDay(at);
    const month = monthOf(workOn);
    if (await tx.contractAttendanceConfirmation.findFirst({ where: { organizationId: org, agencyId: d.agencyId, locationId: d.locationId, month: day(month) } })) throw new ConflictException('This month is confirmed; ask the site in-charge.');
    const cur = await tx.contractAttendance.findFirst({ where: { organizationId: org, deploymentId, workOn: day(workOn) } });
    const out = kind === 'out' || (kind !== 'in' && Boolean(cur?.inAt) && !cur?.outAt);
    if (cur) await tx.contractAttendance.update({ where: { id: cur.id }, data: out ? { outAt: at, source: 'kiosk', updatedAt: new Date() } : { inAt: cur.inAt ?? at, source: 'kiosk', updatedAt: new Date() } });
    else await tx.contractAttendance.create({ data: { organizationId: org, deploymentId, workOn: day(workOn), source: 'kiosk', ...(out ? { outAt: at } : { inAt: at }) } });
    return { accepted: true, duplicate: false, kind: out ? 'out' : 'in', at: at.toISOString(), verdict: 'accepted', message: out ? 'Checked out.' : 'Checked in.', distanceM: null, punchId: null };
  }

  /* ---------------- answer 622: the threshold count, nightly ---------------- */

  /** Every site's highest number of contract workers on any day of the last 12 months (deployed or waiting). */
  async peaksOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const deps = await tx.contractDeployment.findMany({ where: { organizationId: org, fromOn: { lte: day(today) } }, select: { locationId: true, fromOn: true, toOn: true, releasedOn: true } });
      const sites = [...new Set(deps.map((d) => d.locationId))];
      for (const s of sites) {
        const p = peakOf(deps.filter((d) => d.locationId === s).map((d) => ({ from: iso(d.fromOn), to: (d.releasedOn ?? d.toOn) ? iso((d.releasedOn ?? d.toOn)!) : null })), from, today);
        await tx.clraSitePeak.upsert({ where: { organizationId_locationId: { organizationId: org, locationId: s } }, create: { organizationId: org, locationId: s, peak: p.peak, peakOn: p.on ? day(p.on) : null, evaluatedOn: day(today) }, update: { peak: p.peak, peakOn: p.on ? day(p.on) : null, evaluatedOn: day(today) } });
      }
      return sites.length;
    });
  }

  async peaksAll(today = todayIst()) {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM contract_deployments`);
    let n = 0;
    for (const { id } of orgs) n += await this.peaksOrg(id, today).catch((e: Error) => (this.logger.warn(`clra peaks ${id}: ${e.message}`), 0));
    return n;
  }
}
