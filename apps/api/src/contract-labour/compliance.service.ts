import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { payScope } from '../payroll/pay-access';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { FilesService } from '../documents/files.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce, minWage, minWageTableFor, type RuleSet } from '../statutory/evaluator';
import { toPaise, toRupees } from '../staffing/staffing-rules';
import { ContractLabourService, type Upload } from './contract-labour.service';
import { activeIn, heldMonths, monthPacks } from './clra-holds';
import { PROOF_KINDS, challanShortfall, monthOf, packDue, packStatus, requiredProofs, wageShortfall, type ProofKind, type ProofState } from './clra-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { WageLineDto, type DirectPaymentDto, type HoldReleaseDto, type PackItemDto } from './clra-dto';
import { shortDays } from './clra-rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const ANY_ENTITY = { legalEntityId: '' };
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const LABEL: Record<ProofKind, string> = { pf_challan: 'PF ECR and challan', esi_challan: 'ESI challan', wage_register: 'Wage register', bank_proof: 'Wage payment proof', muster_roll: 'Muster roll' };
const SKILL: Record<string, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };
const prevMonth = (today: string) => {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
};
const dmy = (s: string) => day(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rupees = (p: bigint) => toRupees(p);

export interface ClraAlert { id: string; type: string; contractor: string; contractorId: string; site: string; month: string; detail: string; liability: string | null; severity: 'High' | 'Medium'; deploymentId?: string }

export interface MinWage {
  monthly: string;
  daily: string;
  monthlyPaise: bigint;
  dailyPaise: bigint;
  /** The state table (zone and skill) or the national floor, and whether the data still waits for verification. */
  source: string;
  verify: boolean;
  floor: boolean;
}

/**
 * Answer 626 / 685: the minimum wage for a site and skill on a day, from the IN.MW rule sets (the national floor and the
 * state's table for the site's minimum-wage zone; verify). Null when no rule is published for the day.
 */
export function minWageFor(rules: RuleSet[], site: { state: string; minWageZone: string | null }, skill: string, on: string): MinWage | null {
  const floor = inForce(rules, 'IN.MW', ['IN'], on);
  if (!floor) return null;
  const table = minWageTableFor(rules, site.state, on);
  const mw = minWage(floor, { table, zone: site.minWageZone, skill });
  const monthlyPaise = BigInt(mw.monthly.mul(100).toFixed(0));
  const dailyPaise = BigInt(mw.daily.mul(100).toFixed(0));
  const source = mw.floorApplied ? `National floor (${floor.version})` : `${site.state.replace('IN-', '')} ${table!.version}, zone ${mw.state?.zone ?? site.minWageZone ?? 'any'}, ${SKILL[mw.state?.skill ?? skill] ?? skill}${mw.state?.skillFallback ? ' (lowest class: skill not listed)' : ''}`;
  return { monthly: rupees(monthlyPaise), daily: rupees(dailyPaise), monthlyPaise, dailyPaise, source, verify: Boolean(floor.verify || table?.verify), floor: mw.floorApplied };
}

/**
 * Contract labour CL-4 (answers 626, 634, 685; CLB-03 and the T9-13 packs and bills). Each month a contractor uploads,
 * per site, the PF and ESI challans (with the workers covered and the amount), the wage register (each worker's days and
 * wage paid) and the wage payment proof. The compliance owner verifies each proof (a clean copy only; a short challan
 * cannot be verified) or raises a discrepancy with a note. The wage check compares each worker's pay with the minimum
 * wage for the site, zone and skill; shortfalls are liability alerts, and wages the company pays itself are recorded and
 * recovered from the contractor's next PAY 8 bill. A contractor's bills are held while a month is overdue or disputed
 * (setting clra.payment_hold); only the compliance owner (clra.contractor.manage) releases a month, with a reason.
 * Finance and readers (clra.contractor.view) see it all and change nothing. Never while acting for someone else (403);
 * another company's records are not found (404). Muster days come with attendance (CL-5).
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clra: ContractLabourService,
    private readonly rules: StatutoryRulesService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** One contractor's pack for a site and month: proofs, workers with their pay against the minimum, and the checks. */
  async packView(tx: Tx, c: CompanyContext, agencyId: string, locationId: string, month: string, today: string) {
    const org = c.organizationId;
    const loc = await tx.location.findFirst({ where: { id: locationId, organizationId: org }, select: { id: true, name: true, state: true, minWageZone: true } });
    if (!loc) throw new NotFoundException('Site not found.');
    const cutoff = Number(await settingFor(tx, c, 'clra.doc_cutoff', ANY_ENTITY));
    const due = packDue(month, cutoff);
    const required = requiredProofs(await settingFor(tx, c, 'clra.required_proofs', ANY_ENTITY));
    const pack = await tx.contractorPack.findFirst({ where: { organizationId: org, agencyId, locationId, month: day(month) } });
    const items = pack ? await tx.contractorPackItem.findMany({ where: { organizationId: org, packId: pack.id } }) : [];
    const lines = pack ? await tx.contractorWageLine.findMany({ where: { organizationId: org, packId: pack.id } }) : [];
    const fileRows = await tx.file.findMany({ where: { organizationId: org, id: { in: items.map((i) => i.fileId) } }, select: { id: true, fileName: true, scanStatus: true } });
    const deps = (await tx.contractDeployment.findMany({ where: { organizationId: org, agencyId, locationId } })).filter((d) => activeIn(d, month));
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: deps.map((d) => d.personId) } }, select: { id: true, givenName: true, familyName: true } });
    const paidByUs = await tx.contractorDirectPayment.findMany({ where: { organizationId: org, agencyId, deploymentId: { in: deps.map((d) => d.id) }, month: day(month) } });
    const rules = await this.rules.published();
    const released = await tx.contractorHoldRelease.findFirst({ where: { organizationId: org, agencyId, month: day(month) } });
    const states: Partial<Record<ProofKind, ProofState>> = {};
    for (const i of items) states[i.kind as ProofKind] = i.state as ProofState;
    // Answer 742: the days each worker was on site (kiosk punches or the contractor's entry), and whether confirmed.
    const present = await tx.contractAttendance.groupBy({ by: ['deploymentId'], where: { organizationId: org, deploymentId: { in: deps.map((d) => d.id) }, workOn: { gte: day(month), lt: day(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10)) } }, _count: { _all: true } });
    const confirmed = Boolean(await tx.contractAttendanceConfirmation.findFirst({ where: { organizationId: org, agencyId, locationId, month: day(month) } }));
    const workers = deps.map((d) => {
      const p = persons.find((x) => x.id === d.personId);
      const line = lines.find((l) => l.deploymentId === d.id);
      const mw = minWageFor(rules, loc, d.skill, month);
      const w = line && mw ? wageShortfall({ days: line.days, grossPaise: line.grossPaise, minDailyPaise: mw.dailyPaise, minMonthlyPaise: mw.monthlyPaise }) : null;
      const ours = paidByUs.filter((x) => x.deploymentId === d.id).reduce((n, x) => n + x.amountPaise, 0n);
      const left = w ? (w.shortPaise > ours ? w.shortPaise - ours : 0n) : 0n;
      return {
        deploymentId: d.id,
        name: p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : 'Worker',
        idMasked: `XXXX XXXX ${d.idLast4}`,
        skill: SKILL[d.skill] ?? d.skill,
        line: line ? { days: line.days, gross: rupees(line.grossPaise), paidOn: iso(line.paidOn) } : null,
        minimum: mw ? { monthly: mw.monthly, daily: mw.daily, source: mw.source, verify: mw.verify } : null,
        due: w ? rupees(w.duePaise) : null,
        short: w ? rupees(w.shortPaise) : null,
        paidByUs: rupees(ours),
        stillShort: rupees(left),
        daysOnSite: present.find((x) => x.deploymentId === d.id)?._count._all ?? 0,
      };
    });
    const item = (k: ProofKind) => {
      const i = items.find((x) => x.kind === k);
      const f = i ? fileRows.find((x) => x.id === i.fileId) : null;
      return i ? { id: i.id, state: i.state as ProofState, note: i.note, fileName: f?.fileName ?? 'proof', scan: f?.scanStatus ?? 'pending', workersCovered: i.workersCovered, amount: i.amountPaise !== null ? rupees(i.amountPaise) : null, uploadedAt: i.uploadedAt.toISOString(), version: i.version } : null;
    };
    const covered = (k: 'pf_challan' | 'esi_challan') => {
      const i = items.find((x) => x.kind === k);
      return i?.workersCovered ?? null;
    };
    const shortWorkers = workers.filter((w) => w.short !== null && w.short !== '0.00');
    const missingLines = workers.filter((w) => !w.line);
    const checks = [
      ...(['pf_challan', 'esi_challan'] as const).map((k) => {
        const n = covered(k);
        const short = n === null ? null : challanShortfall(n, deps.length);
        return { id: k, label: `${LABEL[k]}: workers covered ≥ workers on site`, status: n === null ? ('pending' as const) : short ? ('fail' as const) : ('pass' as const), detail: n === null ? 'Not uploaded yet.' : `Covers ${n}; ${deps.length} deployed in the month.${short ? ` Short by ${short}.` : ''}` };
      }),
      { id: 'wage_register', label: 'Every worker in the wage register', status: !items.some((i) => i.kind === 'wage_register') ? ('pending' as const) : missingLines.length ? ('fail' as const) : ('pass' as const), detail: missingLines.length && items.some((i) => i.kind === 'wage_register') ? `Missing: ${missingLines.map((w) => w.name).join(', ')}.` : undefined },
      ((short) => ({ id: 'days', label: `Days paid ≥ days on site${confirmed ? ' (confirmed)' : ' (not yet confirmed)'}`, status: !lines.length ? ('pending' as const) : short.length ? ('fail' as const) : ('pass' as const), detail: short.length ? short.map((w) => `${w.name}: paid ${w.line!.days} days, on site ${w.daysOnSite}`).join('; ') : undefined }))(workers.filter((w) => w.line && shortDays(w.line.days, w.daysOnSite) > 0)),
      { id: 'min_wage', label: 'Wages at or above the minimum wage (verify)', status: !lines.length ? ('pending' as const) : shortWorkers.length ? ('fail' as const) : ('pass' as const), detail: shortWorkers.length ? shortWorkers.map((w) => `${w.name}: paid ₹${w.line!.gross}, due ₹${w.due}`).join('; ') : undefined },
    ];
    return {
      agencyId,
      site: { id: loc.id, name: loc.name },
      month: month.slice(0, 7),
      due,
      status: packStatus(states, due, today, required),
      required,
      released: released ? { reason: released.reason, at: released.releasedAt.toISOString() } : null,
      deployed: deps.length,
      items: Object.fromEntries(PROOF_KINDS.map((k) => [k, item(k)])) as Record<ProofKind, ReturnType<typeof item>>,
      workers,
      checks,
    };
  }

  /* ---------------- CLB-03 vendor compliance ---------------- */

  async tracker(ctx: TenantContext, user: ScopeUser, monthArg?: string) {
    const a = await this.clra.gate(user, 'view');
    const today = todayIst();
    const month = monthArg ? `${monthArg}-01` : prevMonth(today);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const all = await monthPacks(tx, c, today);
      const { rows, alerts } = await this.monthAlerts(tx, c, all, month, today);
      const required = requiredProofs(await settingFor(tx, c, 'clra.required_proofs', ANY_ENTITY));
      return {
        month: month.slice(0, 7),
        due: packDue(month, Number(await settingFor(tx, c, 'clra.doc_cutoff', ANY_ENTITY))),
        holdMode: await settingFor(tx, c, 'clra.payment_hold', ANY_ENTITY),
        canManage: a.manage && !a.actingForOther,
        proofTypes: PROOF_KINDS.map((k) => ({ kind: k, label: LABEL[k], required: required.includes(k) })),
        months: [...new Set(all.map((p) => p.month.slice(0, 7)))].sort().reverse(),
        rows,
        alerts,
      };
    });
  }

  /** A month's packs on the tracker and its liability alerts (wage below minimum, short challans, proofs overdue). */
  private async monthAlerts(tx: Tx, c: CompanyContext, all: Awaited<ReturnType<typeof monthPacks>>, month: string, today: string) {
    const org = c.organizationId;
    const here = all.filter((p) => p.month === month);
    const agencies = await tx.agency.findMany({ where: { organizationId: org, id: { in: [...new Set(all.map((p) => p.agencyId))] } }, select: { id: true, name: true } });
    const held = await heldMonths(tx, c, today);
    const rows = [];
    const alerts: ClraAlert[] = [];
    for (const p of here) {
      const v = await this.packView(tx, c, p.agencyId, p.locationId, month, today);
      const name = agencies.find((x) => x.id === p.agencyId)?.name ?? 'Contractor';
      rows.push({ contractorId: p.agencyId, contractor: name, ...v, held: (held.get(p.agencyId) ?? []).length > 0, heldMonths: (held.get(p.agencyId) ?? []).map((m) => m.slice(0, 7)) });
      for (const w of v.workers) if (w.stillShort !== '0.00') alerts.push({ id: `wage:${w.deploymentId}:${month}`, type: 'Wage below minimum', contractor: name, contractorId: p.agencyId, site: v.site.name, month: month.slice(0, 7), detail: `${w.name}: paid ₹${w.line!.gross} for ${w.line!.days} days; due ₹${w.due} (${w.minimum?.source})${w.paidByUs !== '0.00' ? `; we paid ₹${w.paidByUs}` : ''}.`, liability: w.stillShort, severity: 'High', deploymentId: w.deploymentId });
      for (const ch of v.checks.filter((x) => (x.id === 'pf_challan' || x.id === 'esi_challan') && x.status === 'fail')) alerts.push({ id: `${ch.id}:${p.agencyId}:${p.locationId}:${month}`, type: ch.id === 'pf_challan' ? 'Short PF challan' : 'Short ESI challan', contractor: name, contractorId: p.agencyId, site: v.site.name, month: month.slice(0, 7), detail: ch.detail!, liability: null, severity: 'High' });
      if (v.status === 'overdue') alerts.push({ id: `overdue:${p.agencyId}:${p.locationId}:${month}`, type: 'Proofs overdue', contractor: name, contractorId: p.agencyId, site: v.site.name, month: month.slice(0, 7), detail: `Due ${dmy(v.due)}; ${v.required.filter((k) => v.items[k]?.state !== 'verified').map((k) => LABEL[k]).join(', ')} not verified.`, liability: null, severity: 'Medium' });
    }
    return { rows, alerts };
  }

  /* ---------------- answer 743: new liability alerts by email, once per alert ---------------- */

  async noticeAll(today = todayIst()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM contract_deployments`);
    let n = 0;
    for (const { id } of orgs) n += await this.noticeOrg(id, today).catch(() => 0);
    return n;
  }

  /**
   * Each alert on Vendor compliance in the last three months that the compliance owners were not told about yet
   * (clra_alert_notices keeps the ones sent). One message per alert, in the app and by email.
   */
  async noticeOrg(org: string, today = todayIst()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const sends = await this.tenantPrisma.forTenant(c, async (tx) => {
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`clra-alert-notices:${org}`})) AS ok`;
      if (!lock?.ok) return { out: [] as ClraAlert[], to: [] as string[] };
      const all = await monthPacks(tx, c, today);
      // shortcut: only the last three months are checked each night; an older month's new alert shows on the tracker only.
      const months = [...new Set(all.map((p) => p.month))].sort().reverse().slice(0, 3);
      const out: ClraAlert[] = [];
      for (const m of months) {
        for (const a of (await this.monthAlerts(tx, c, all, m, today)).alerts) {
          const { count } = await tx.clraAlertNotice.createMany({ data: [{ organizationId: org, alertId: a.id }], skipDuplicates: true });
          if (count) out.push(a);
        }
      }
      if (out.length) await audit(tx, c, 'clra.alerts.noticed', 'organization', org, { alerts: out.length });
      return { out, to: out.length ? await this.clra.owners(tx, org, today) : [] };
    });
    for (const a of sends.out) {
      const text = `${a.type}: ${a.contractor}, ${a.site}, ${a.month}. ${a.detail}${a.liability ? ` Our liability: ₹${a.liability}.` : ''}`;
      await this.notifications
        .notifySystem({ organizationId: org, isSuperAdmin: false }, sends.to, 'clra.alert.new', { entityType: 'agency', entityId: a.contractorId, contextText: text, linkPath: '/yx/contract-labour/compliance' }, { subject: `Contract labour: ${a.type.toLowerCase()} (${a.contractor})`, html: `<p>${escapeHtml(text)}</p><p>Open Contract labour › Vendor compliance in YukthiX.</p>` })
        .catch(() => undefined);
    }
    return sends.out.length;
  }

  private async itemFor(tx: Tx, c: CompanyContext, id: string, version?: number) {
    const i = await tx.contractorPackItem.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!i) throw new NotFoundException('Proof not found.');
    if (version !== undefined && i.version !== version) throw new ConflictException('This proof changed just now. Reload the page.');
    return i;
  }

  /** Verify a proof: a clean copy only, never a challan short of the workers on site (raise a discrepancy instead). */
  async verify(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    await this.clra.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const i = await this.itemFor(tx, c, id, version);
      if (i.state !== 'submitted') throw new ConflictException(`This proof is already ${i.state === 'verified' ? 'verified' : 'marked as a discrepancy'}.`);
      const f = await tx.file.findFirst({ where: { organizationId: c.organizationId, id: i.fileId }, select: { scanStatus: true } });
      if (f?.scanStatus !== 'clean') throw new ConflictException('The proof is still being checked for viruses, or failed the check.');
      const pack = await tx.contractorPack.findFirstOrThrow({ where: { id: i.packId, organizationId: c.organizationId } });
      if (i.kind === 'pf_challan' || i.kind === 'esi_challan') {
        const n = (await tx.contractDeployment.findMany({ where: { organizationId: c.organizationId, agencyId: pack.agencyId, locationId: pack.locationId } })).filter((d) => activeIn(d, iso(pack.month))).length;
        const short = challanShortfall(i.workersCovered ?? 0, n);
        if (short) throw new ConflictException(`The challan covers ${short} fewer ${short === 1 ? 'worker' : 'workers'} than were deployed. Raise a discrepancy instead.`);
      }
      await tx.contractorPackItem.update({ where: { id: i.id }, data: { state: 'verified', note: null, decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'clra.proof.verified', 'contractor_pack_item', i.id, { kind: i.kind, month: iso(pack.month), contractorId: pack.agencyId });
      return { id: i.id, state: 'verified' };
    });
  }

  async discrepancy(ctx: TenantContext, user: ScopeUser, id: string, version: number, note: string) {
    await this.clra.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const i = await this.itemFor(tx, c, id, version);
      if (i.state === 'discrepancy') throw new ConflictException('This proof is already marked as a discrepancy.');
      await tx.contractorPackItem.update({ where: { id: i.id }, data: { state: 'discrepancy', note, decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'clra.proof.discrepancy', 'contractor_pack_item', i.id, { kind: i.kind, note });
      return { id: i.id, state: 'discrepancy' };
    });
  }

  async itemFile(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.clra.gate(user, 'view');
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const i = await this.itemFor(tx, c, id);
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: i.fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('This file is still being checked for viruses, or failed the check.');
      await audit(tx, c, 'clra.proof.file_opened', 'contractor_pack_item', i.id, { fileId: f.id, sha256: f.sha256 });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /** Answer 634: release a month's hold on a contractor's bills: the compliance owner only, with a reason; audited. */
  async release(ctx: TenantContext, user: ScopeUser, dto: HoldReleaseDto) {
    await this.clra.gate(user, 'manage');
    const today = todayIst();
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const a = await tx.agency.findFirst({ where: { id: dto.contractorId, organizationId: c.organizationId, contractLabour: true }, select: { id: true } });
      if (!a) throw new NotFoundException('Contractor not found.');
      const month = `${dto.month}-01`;
      const months = (await heldMonths(tx, c, today, [a.id])).get(a.id) ?? [];
      if (!months.includes(month)) throw new ConflictException('This month does not hold the contractor’s bills.');
      const row = await tx.contractorHoldRelease.create({ data: { organizationId: c.organizationId, agencyId: a.id, month: day(month), reason: dto.reason, releasedBy: c.userId! } });
      await audit(tx, c, 'clra.hold.released', 'agency', a.id, { month: dto.month, reason: dto.reason });
      return { id: row.id, released: true };
    });
  }

  /** Answer 626: wages the company paid a contractor's worker itself; recovered from the contractor's next PAY 8 bill. */
  async directPayment(ctx: TenantContext, user: ScopeUser, dto: DirectPaymentDto) {
    await this.clra.gate(user, 'manage');
    const paise = toPaise(dto.amount);
    if (!paise || paise <= 0n) throw new BadRequestException('Enter the amount in rupees.');
    if (dto.paidOn > todayIst()) throw new BadRequestException('The payment day cannot be in the future.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.contractDeployment.findFirst({ where: { id: dto.deploymentId, organizationId: c.organizationId } });
      if (!d) throw new NotFoundException('Contract worker not found.');
      const month = `${dto.month}-01`;
      if (!activeIn(d, month)) throw new BadRequestException('The worker was not deployed in that month.');
      const row = await tx.contractorDirectPayment.create({ data: { organizationId: c.organizationId, agencyId: d.agencyId, deploymentId: d.id, month: day(month), amountPaise: paise, paidOn: day(dto.paidOn), reference: dto.reference, reason: dto.reason, createdBy: c.userId ?? null } });
      await audit(tx, c, 'clra.direct_payment.recorded', 'contract_deployment', d.id, { month: dto.month, rupees: dto.amount, reference: dto.reference });
      return { id: row.id };
    });
  }

  /** Answer 685: the minimum-wage hint under the wage field. */
  async minWageHint(ctx: TenantContext, user: ScopeUser, locationId: string, skill: string, on?: string) {
    await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.hintIn(tx, c, locationId, skill, on ?? todayIst()));
  }

  async hintIn(tx: Tx, c: CompanyContext, locationId: string, skill: string, on: string) {
    const loc = await tx.location.findFirst({ where: { id: locationId, organizationId: c.organizationId }, select: { state: true, minWageZone: true } });
    if (!loc) throw new NotFoundException('Site not found.');
    const mw = minWageFor(await this.rules.published(), loc, skill, on);
    return mw ? { monthly: mw.monthly, daily: mw.daily, source: mw.source, verify: mw.verify } : null;
  }

  /* ---------------- the contractor portal (CL-3 session) ---------------- */

  /** The months and sites a contractor owes packs for, newest first, with each one's status. */
  async portalPacks(tx: Tx, c: CompanyContext, agencyId: string, today: string) {
    const list = await monthPacks(tx, c, today, [agencyId]);
    const locs = await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(list.map((p) => p.locationId))] } }, select: { id: true, name: true } });
    return list.sort((a, b) => (a.month < b.month ? 1 : -1)).map((p) => ({ month: p.month.slice(0, 7), site: { id: p.locationId, name: locs.find((l) => l.id === p.locationId)?.name ?? 'Site' }, due: p.due, status: p.status }));
  }

  /** A proof from the contractor: the month must be one they owe; a verified proof is final; the wage register lists every worker. */
  async upload(tx: Tx, c: CompanyContext, agencyId: string, contactId: string, dto: PackItemDto, file: Upload, today: string) {
    const org = c.organizationId;
    const month = `${dto.month}-01`;
    if (month >= monthOf(today)) throw new BadRequestException('Proofs are uploaded after the month ends.');
    const owed = (await monthPacks(tx, c, today, [agencyId])).find((p) => p.locationId === dto.locationId && p.month === month);
    if (!owed) throw new NotFoundException('No pack is owed for this site and month.');
    const challan = dto.kind === 'pf_challan' || dto.kind === 'esi_challan';
    const amount = dto.amount ? toPaise(dto.amount) : null;
    if (challan && (dto.workersCovered === undefined || amount === null)) throw new BadRequestException('Enter the workers covered and the amount of the challan.');
    if (!challan && (dto.workersCovered !== undefined || dto.amount !== undefined)) throw new BadRequestException('Only a challan has workers covered and an amount.');
    const deps = (await tx.contractDeployment.findMany({ where: { organizationId: org, agencyId, locationId: dto.locationId } })).filter((d) => activeIn(d, month));
    let lines: WageLineDto[] = [];
    if (dto.kind === 'wage_register') {
      let raw: unknown;
      try {
        raw = JSON.parse(dto.lines ?? '');
      } catch {
        throw new BadRequestException('Give each worker’s days and wage paid.');
      }
      if (!Array.isArray(raw) || raw.length > 2000) throw new BadRequestException('Give each worker’s days and wage paid.');
      lines = raw.map((r) => plainToInstance(WageLineDto, r));
      for (const l of lines) if (validateSync(l, { whitelist: true, forbidNonWhitelisted: true }).length) throw new BadRequestException('Each worker needs the days (0 to 31), the wage paid in rupees and the day it was paid.');
      const ids = new Set(lines.map((l) => l.deploymentId));
      if (ids.size !== lines.length) throw new BadRequestException('A worker is listed twice.');
      if (lines.some((l) => !deps.some((d) => d.id === l.deploymentId))) throw new NotFoundException('A worker in the register was not deployed here that month.');
      const missing = deps.filter((d) => !ids.has(d.id));
      if (missing.length) throw new BadRequestException(`The wage register must list every worker deployed here in the month (${missing.length} missing).`);
      if (lines.some((l) => l.paidOn > today)) throw new BadRequestException('A payment day is in the future.');
    } else if (dto.lines !== undefined) throw new BadRequestException('Only the wage register lists workers.');
    if (!file?.data?.length) throw new BadRequestException('Attach the proof (PDF, JPG or PNG).');
    const pack = (await tx.contractorPack.findFirst({ where: { organizationId: org, agencyId, locationId: dto.locationId, month: day(month) } })) ?? (await tx.contractorPack.create({ data: { organizationId: org, agencyId, locationId: dto.locationId, month: day(month) } }));
    const cur = await tx.contractorPackItem.findFirst({ where: { organizationId: org, packId: pack.id, kind: dto.kind } });
    if (cur?.state === 'verified') throw new ConflictException('This proof is already verified.');
    const f = await this.files.storeIn(tx, c, { area: 'clra-proof', name: (file.name || 'proof').slice(0, 120), data: file.data, allowedMime: PROOF_TYPES, maxMb: 10, via: 'self' });
    const data = { fileId: f.id, state: 'submitted', note: null, workersCovered: challan ? dto.workersCovered! : null, amountPaise: challan ? amount : null, uploadedByContact: contactId, uploadedAt: new Date(), decidedBy: null, decidedAt: null };
    const item = cur ? await tx.contractorPackItem.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } }) : await tx.contractorPackItem.create({ data: { organizationId: org, packId: pack.id, kind: dto.kind, ...data } });
    if (dto.kind === 'wage_register') {
      await tx.contractorWageLine.deleteMany({ where: { organizationId: org, packId: pack.id } });
      await tx.contractorWageLine.createMany({ data: lines.map((l) => ({ organizationId: org, packId: pack.id, deploymentId: l.deploymentId, days: l.days, grossPaise: toPaise(l.gross)!, paidOn: day(l.paidOn) })) });
    }
    await audit(tx, c, 'clra.proof.uploaded', 'contractor_pack_item', item.id, { kind: dto.kind, month: dto.month, locationId: dto.locationId, contactId, replaced: Boolean(cur), fileId: f.id, sha256: f.sha256 });
    return { id: item.id, fileId: f.id, org };
  }

  /** The contractor's PAY 8 bills: what was billed, TDS, wages we paid and took back, what is paid, and any hold. */
  async portalBills(tx: Tx, c: CompanyContext, agencyId: string, today: string) {
    const a = await tx.agency.findFirstOrThrow({ where: { id: agencyId, organizationId: c.organizationId }, select: { consultantId: true } });
    const held = (await heldMonths(tx, c, today, [agencyId])).get(agencyId) ?? [];
    if (!a.consultantId) return { held: held.map((m) => m.slice(0, 7)), bills: [] };
    // Consultant invoices sit behind the payroll pay guard: opened for this company's entities for this read only.
    await payScope(tx, (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id));
    const invs = await tx.consultantInvoice.findMany({ where: { organizationId: c.organizationId, consultantId: a.consultantId }, orderBy: { invoiceDate: 'desc' }, take: 60 });
    return {
      held: held.map((m) => m.slice(0, 7)),
      bills: invs.map((i) => ({
        id: i.id,
        no: i.invoiceNo,
        period: iso(i.period).slice(0, 7),
        amount: i.taxableValue.add(i.cgst).add(i.sgst).add(i.igst).toFixed(2),
        tds: i.tdsAmount?.toFixed(2) ?? null,
        recovery: i.clraRecovery.toFixed(2),
        net: i.netPayable?.toFixed(2) ?? null,
        status: i.status === 'paid' ? 'Paid' : i.status === 'rejected' ? 'Rejected' : held.length && ['approved', 'failed', 'submitted'].includes(i.status) ? 'On hold' : i.status === 'submitted' ? 'Being checked' : 'Due',
        paidOn: i.paidOn ? iso(i.paidOn) : null,
      })),
    };
  }
}

