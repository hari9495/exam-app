import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { FilesService } from '../documents/files.service';
import { StatutoryRegistersService } from '../payroll/statutory-registers.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { payScope } from '../payroll/pay-access';
import { monthRange } from '../time/time-core';
import { ContractLabourService, type Upload } from './contract-labour.service';
import { challanRows, coverOf, daysPresent, packDue, packState, type OwnLicenceLike } from './own-licence-rules';
import { ownLicences, placedOn } from './own-licence-check';

// Contract labour CL-8 (CLB-06, CLB-07, CLB-08; founder answers 638, 639): we are the contractor. Client sites hang off
// the staffing clients and carry the client's registration number; our own licences are rows of the licence table owned
// by our legal entity; a placement of our employee past the licence maximum at the site is blocked (staffing placement
// create calls ownLicenceCheckIn). Each month a client pack is made from our payroll (approved payslips) and attendance
// for the employees placed there: the wage register and muster roll through the payroll registers service (types
// clpk_*); the upload to the client's portal is recorded by hand (day, reference, acknowledgement). Reads with
// clra.contractor.view, changes with clra.contractor.manage, never while acting (403); another company's rows 404.

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rupees = (n: { toFixed: (d: number) => string }) => n.toFixed(2);
const ACK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

@Injectable()
export class ContractorSideService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clra: ContractLabourService,
    private readonly files: FilesService,
    private readonly registers: StatutoryRegistersService,
    private readonly rules: StatutoryRulesService,
  ) {}

  private async site(tx: Tx, c: CompanyContext, id: string) {
    const s = await tx.staffingClientSite.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!s) throw new NotFoundException('Client site not found.');
    return s;
  }

  /* ---------------- CLB-06 client establishments ---------------- */

  async sites(ctx: TenantContext, user: ScopeUser) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const rows = await tx.staffingClientSite.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' } });
      const clients = await tx.staffingClient.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const lic = await ownLicences(tx, org);
      const out = [];
      for (const s of rows) {
        const l = coverOf(lic, s, today);
        out.push({ id: s.id, clientId: s.clientId, client: clients.find((x) => x.id === s.clientId)?.name ?? '', site: s.name, principal: s.principalName, registrationNo: s.registrationNo, state: s.state, address: s.address, packChannel: s.packChannel, packDueDay: s.packDueDay, deployed: await placedOn(tx, org, [s.id], today), max: l?.maxWorkers ?? 0, licenceNo: l?.licenceNo ?? null });
      }
      return { canManage: a.manage && !a.actingForOther, clients, sites: out };
    });
  }

  async addSite(ctx: TenantContext, user: ScopeUser, dto: { clientId: string; name: string; state: string; address?: string; principalName: string; registrationNo: string; packChannel: string; packDueDay?: number }) {
    await this.clra.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.staffingClient.findFirst({ where: { organizationId: c.organizationId, id: dto.clientId }, select: { id: true } }))) throw new NotFoundException('Client not found.');
      const row = await tx.staffingClientSite
        .create({ data: { organizationId: c.organizationId, clientId: dto.clientId, name: dto.name.trim(), state: dto.state, address: dto.address?.trim() || null, principalName: dto.principalName.trim(), registrationNo: dto.registrationNo.trim(), packChannel: dto.packChannel.trim(), packDueDay: dto.packDueDay ?? 10, createdBy: c.userId ?? null } })
        .catch((e: { code?: string }) => {
          if (e.code === 'P2002') throw new ConflictException('This client already has a site with that name.');
          throw e;
        });
      await audit(tx, c, 'clra.client_site.added', 'staffing_client_site', row.id, { clientId: dto.clientId, state: dto.state });
      return { id: row.id };
    });
  }

  /* ---------------- CLB-07 own licences ---------------- */

  async licences(ctx: TenantContext, user: ScopeUser) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const lic = await ownLicences(tx, org);
      const sites = await tx.staffingClientSite.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, state: true, clientId: true }, orderBy: { name: 'asc' } });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const out = [];
      for (const l of lic) {
        const reach = l.clientSiteId ? [l.clientSiteId] : sites.filter((s) => l.states.includes(s.state)).map((s) => s.id);
        out.push({ id: l.id, licenceNo: l.licenceNo, scope: l.scope, clientSiteId: l.clientSiteId, site: sites.find((s) => s.id === l.clientSiteId)?.name ?? null, states: l.states, maxWorkers: l.maxWorkers, deployed: await placedOn(tx, org, reach, today), validFrom: l.validFrom, validTo: l.validTo, authority: l.issuedBy, entity: entities.find((e) => e.id === l.legalEntityId)?.name ?? '' });
      }
      return { canManage: a.manage && !a.actingForOther, today, entities: entities.map((e) => ({ value: e.id, label: e.name })), sites: sites.map((s) => ({ value: s.id, label: s.name, state: s.state })), licences: out };
    });
  }

  /** An own licence: our legal entity holds it, for one client site or (a single licence) for the states listed. */
  async addLicence(ctx: TenantContext, user: ScopeUser, dto: { legalEntityId: string; clientSiteId?: string; licenceNo: string; scope: string; states?: string[]; maxWorkers: number; validFrom: string; validTo: string; issuedBy?: string }, file: Upload) {
    await this.clra.gate(user, 'manage');
    if (dto.validTo < dto.validFrom) throw new BadRequestException('The licence ends before it starts. Check the dates.');
    if (dto.validTo < todayIst()) throw new BadRequestException('This licence has already ended.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId }, select: { id: true } }))) throw new NotFoundException('Legal entity not found.');
      const site = dto.clientSiteId ? await this.site(tx, c, dto.clientSiteId) : null;
      const states = site ? [site.state] : [...new Set(dto.states ?? [])];
      if (!states.length) throw new BadRequestException('Name the client site, or the states a single licence covers.');
      const f = await this.clra.store(tx, c, file);
      const row = await tx.contractorLicence.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, clientSiteId: site?.id ?? null, licenceNo: dto.licenceNo.trim(), scope: dto.scope.trim(), issuedBy: dto.issuedBy?.trim() || null, states, maxWorkers: dto.maxWorkers, validFrom: day(dto.validFrom), validTo: day(dto.validTo), fileId: f.id, status: 'verified', decidedBy: c.userId ?? null, decidedAt: new Date(), createdBy: c.userId ?? null } });
      await audit(tx, c, 'clra.own_licence.added', 'contractor_licence', row.id, { legalEntityId: dto.legalEntityId, clientSiteId: site?.id ?? null, states, maxWorkers: dto.maxWorkers });
      return { id: row.id, org, fileId: f.id };
    });
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { id: out.id };
  }

  /* ---------------- CLB-08 client compliance packs ---------------- */

  async packs(ctx: TenantContext, user: ScopeUser) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const rows = await tx.clientPack.findMany({ where: { organizationId: org }, orderBy: [{ month: 'desc' }], take: 200 });
      const sites = await tx.staffingClientSite.findMany({ where: { organizationId: org }, select: { id: true, name: true, clientId: true, packDueDay: true, packChannel: true, archivedAt: true } });
      const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: sites.map((s) => s.clientId) } }, select: { id: true, name: true } });
      const name = (siteId: string) => {
        const s = sites.find((x) => x.id === siteId);
        return { client: clients.find((x) => x.id === s?.clientId)?.name ?? '', site: s?.name ?? '' };
      };
      return {
        canManage: a.manage && !a.actingForOther,
        today,
        sites: sites.filter((s) => !s.archivedAt).map((s) => ({ value: s.id, label: `${name(s.id).client} · ${s.name}` })),
        packs: rows.map((p) => {
          const s = sites.find((x) => x.id === p.clientSiteId)!;
          const month = iso(p.month).slice(0, 7);
          const due = packDue(month, s.packDueDay);
          return { id: p.id, ...name(p.clientSiteId), clientSiteId: p.clientSiteId, month, employees: p.employees, due, channel: s.packChannel, status: packState({ uploadedOn: p.uploadedOn ? iso(p.uploadedOn) : null, acceptedAt: p.acceptedAt?.toISOString() ?? null }, due, today), missing: p.missing, challans: Boolean(p.challansRegisterId), uploadedOn: p.uploadedOn ? iso(p.uploadedOn) : null, reference: p.reference, version: p.version };
        }),
      };
    });
  }

  /**
   * Answer 639: the month's pack for a client site from our payroll and attendance: the employees placed there in the
   * month, each with an approved payslip (else it waits for payroll); the wage register and the muster roll through the
   * payroll registers service, held by the legal entity whose licence covers the site. A pack already recorded as
   * uploaded is final; before that a remake needs a reason and makes new register versions.
   */
  async makePack(ctx: TenantContext, user: ScopeUser, dto: { clientSiteId: string; month: string; reason?: string }) {
    await this.clra.gate(user, 'manage');
    if (dto.month >= todayIst().slice(0, 7)) throw new BadRequestException('Make a month’s pack after the month ends.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const site = await this.site(tx, c, dto.clientSiteId);
      const { from, to } = monthRange(dto.month);
      const licence = coverOf(await ownLicences(tx, org), site, to) ?? coverOf(await ownLicences(tx, org), site, from);
      if (!licence) throw new ConflictException(`No licence of ours covers ${site.name} in ${dto.month}. Add it under Own licences first.`);
      const entityId = (await tx.contractorLicence.findFirstOrThrow({ where: { id: licence.id }, select: { legalEntityId: true } })).legalEntityId!;
      const placements = await tx.staffingPlacement.findMany({ where: { organizationId: org, clientSiteId: site.id, supply: 'own', startOn: { lte: day(to) }, endOn: { gte: day(from) } }, select: { employeeId: true } });
      const employees = [...new Set(placements.map((p) => p.employeeId!))];
      if (!employees.length) throw new ConflictException(`None of our employees was placed at ${site.name} in ${dto.month}.`);
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: employees } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const nameOf = (id: string) => { const p = people.find((x) => x.id === id); return p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''; };
      const employments = await tx.employment.findMany({ where: { organizationId: org, employeeId: { in: employees } }, select: { id: true, employeeId: true, legalEntityId: true, employeeCode: true }, orderBy: { joinedOn: 'desc' } });
      // The payroll's own guard: open it to the entities of these employees and the licence's entity.
      await payScope(tx, [...new Set([entityId, ...employments.map((e) => e.legalEntityId)])]);
      const slips = await tx.payslip.findMany({ where: { organizationId: org, employeeId: { in: employees }, periodStart: day(from), status: 'approved' }, select: { id: true, employeeId: true, employmentId: true, gross: true, deductions: true, net: true } });
      const missing = employees.filter((e) => !slips.some((s) => s.employeeId === e));
      if (missing.length) throw new ConflictException(`Payroll for ${dto.month} is not approved yet for ${missing.map(nameOf).sort().join(', ')}.`);
      const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'basic' }, select: { payslipId: true, quantity: true } });
      const att = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: employees }, workOn: { gte: day(from), lte: day(to) } }, select: { employeeId: true, status: true } });
      const code = (s: { employmentId: string }) => employments.find((e) => e.id === s.employmentId)?.employeeCode ?? '';
      const sorted = [...slips].sort((a, b) => nameOf(a.employeeId).localeCompare(nameOf(b.employeeId)));
      const wages = sorted.map((s) => [code(s), nameOf(s.employeeId), String(lines.filter((l) => l.payslipId === s.id).reduce((n, l) => n + Number(l.quantity ?? 0), 0)), rupees(s.gross), rupees(s.deductions), rupees(s.net)]);
      const muster = sorted.map((s) => {
        const mine = att.filter((x) => x.employeeId === s.employeeId).map((x) => x.status);
        return [code(s), nameOf(s.employeeId), String(daysPresent(mine)), String(mine.filter((x) => x === 'leave').length), String(mine.filter((x) => x === 'absent').length)];
      });
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { id: true, name: true } });
      const existing = await tx.clientPack.findFirst({ where: { organizationId: org, clientSiteId: site.id, month: day(from) } });
      if (existing?.uploadedOn) throw new ConflictException('This pack is recorded as uploaded to the client; it is final.');
      if (existing && !dto.reason?.trim()) throw new BadRequestException('A pack for this month exists. Say why a new version is needed.');
      const old = existing ? await tx.statutoryRegister.findMany({ where: { organizationId: org, id: { in: [existing.wagesRegisterId, existing.musterRegisterId, ...(existing.challansRegisterId ? [existing.challansRegisterId] : [])] } }, select: { id: true, version: true, registerType: true } }) : [];
      const place = `${site.name} (client: ${site.principalName}, registration ${site.registrationNo})`;
      const store = (type: string, title: string, columns: string[], rows: string[][]) =>
        this.registers.storeIn(tx, c, { entity, locationId: null, place, month: dto.month, type, title, columns, rows, note: `Client compliance pack · from approved payroll and attendance · ${rows.length} employees`, formatVersion: 'client-pack-v1', old: old.find((o) => o.registerType === type) ?? null, reason: dto.reason?.trim() ?? null, userId: user.userId! });
      const w = await store('clpk_wages', 'Register of wages (contract labour at the client)', ['Employee code', 'Name', 'Days paid', 'Gross', 'Deductions', 'Net'], wages);
      const m = await store('clpk_muster', 'Muster roll (contract labour at the client)', ['Employee code', 'Name', 'Days present', 'Days on leave', 'Days absent'], muster);
      // Answers 821 and 841: the month's PF, ESI and (for the client site's state) PT remittances of the entity (challan or
      // TRRN, amount, filed day); not filed yet is named. PT is a state statute: only the site's state counts.
      const statutes = ['IN.PF', 'IN.ESI', 'IN.PT'];
      const inState = (x: { statute: string; state: string | null }) => x.statute !== 'IN.PT' || x.state === site.state;
      const registered = (await tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: entity.id, statute: { in: statutes }, status: { not: 'off' } }, select: { statute: true, state: true, registrationNo: true } })).filter(inState);
      const filings = (await tx.statutoryFiling.findMany({ where: { organizationId: org, legalEntityId: entity.id, statute: { in: statutes }, periodStart: day(from), status: 'filed' }, orderBy: { filedAt: 'asc' }, select: { statute: true, state: true, reference: true, amount: true, filedAt: true } })).filter(inState);
      // Answer 882: PT is named as missing only in the state's PT months (IN.PT deductMonths; none means every month; verify).
      const ptRules = inForce(await this.rules.published(), 'IN.PT', [site.state], from);
      const ptMonths = (ptRules?.values as { deductMonths?: number[] } | undefined)?.deductMonths;
      const ptDue = !ptMonths || ptMonths.includes(Number(from.slice(5, 7)));
      const ch = challanRows(registered, filings.map((f) => ({ statute: f.statute, reference: f.reference, amount: f.amount ? rupees(f.amount) : null, filedOn: f.filedAt ? todayIst(f.filedAt) : null })), ptDue);
      const r = ch.rows.length ? await store('clpk_challans', 'PF, ESI and PT remittances (contract labour at the client)', ['Statute', 'Registration', 'Challan / TRRN', 'Amount', 'Filed on', 'Status'], ch.rows) : null;
      const data = { legalEntityId: entity.id, wagesRegisterId: w.id, musterRegisterId: m.id, challansRegisterId: r?.id ?? null, missing: ch.missing, employees: employees.length, madeBy: user.userId!, madeAt: new Date() };
      const pack = existing
        ? await tx.clientPack.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
        : await tx.clientPack.create({ data: { organizationId: org, clientSiteId: site.id, month: day(from), ...data } });
      await audit(tx, c, 'clra.client_pack.made', 'client_pack', pack.id, { clientSiteId: site.id, month: dto.month, employees: employees.length, version: pack.version, reason: dto.reason ?? null, missing: ch.missing });
      return { id: pack.id, employees: employees.length, version: pack.version, missing: ch.missing };
    });
  }

  private async pack(tx: Tx, c: CompanyContext, id: string) {
    const p = await tx.clientPack.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p) throw new NotFoundException('Pack not found.');
    return p;
  }

  /** The pack as one ZIP: the two registers and a cover listing their fingerprints (the download is audited). */
  async packFile(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.pack(tx, c, id);
      await payScope(tx, [p.legalEntityId]);
      const regs = await tx.statutoryRegister.findMany({ where: { organizationId: c.organizationId, id: { in: [p.wagesRegisterId, p.musterRegisterId, ...(p.challansRegisterId ? [p.challansRegisterId] : [])] } } });
      const month = iso(p.month).slice(0, 7);
      const zip = new JSZip();
      zip.file('cover.txt', [`Client compliance pack · ${month}`, ...regs.map((r) => `${r.registerType} v${r.version} SHA-256 ${r.sha256}`), ...(p.missing.length ? [`Not in this pack yet: ${p.missing.join(', ')} (not filed for the month)`] : [])].join('\r\n'));
      for (const r of regs) zip.file(`${r.registerType}-${month}-v${r.version}.pdf`, await this.registers.fileOf(r));
      await audit(tx, c, 'clra.client_pack.downloaded', 'client_pack', p.id, {});
      return { file: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), name: `client-pack-${month}.zip` };
    });
  }

  /** Answer 639: the pack was uploaded to the client's portal (by hand): the day and reference, and the acknowledgement if any. */
  async recordUpload(ctx: TenantContext, user: ScopeUser, id: string, dto: { uploadedOn: string; reference: string }, file: Upload) {
    await this.clra.gate(user, 'manage');
    if (dto.uploadedOn > todayIst()) throw new BadRequestException('The upload day cannot be in the future.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.pack(tx, c, id);
      if (p.uploadedOn) throw new ConflictException('This pack is already recorded as uploaded.');
      if (dto.uploadedOn < iso(p.month)) throw new BadRequestException('The pack cannot be uploaded before its month.');
      const f = file?.data?.length ? await this.files.storeIn(tx, c, { area: 'client-pack-ack', name: file.name, data: file.data, allowedMime: ACK_TYPES, maxMb: 10, via: 'staff' }) : null;
      await tx.clientPack.update({ where: { id: p.id }, data: { uploadedOn: day(dto.uploadedOn), reference: dto.reference.trim(), recordedBy: c.userId ?? null, recordedAt: new Date(), ...(f ? { ackFileId: f.id, acceptedAt: new Date() } : {}), version: { increment: 1 } } });
      await audit(tx, c, 'clra.client_pack.uploaded', 'client_pack', p.id, { uploadedOn: dto.uploadedOn, reference: dto.reference.trim(), acknowledgement: Boolean(f) });
      return { org: c.organizationId, fileId: f?.id ?? null };
    });
    if (out.fileId) void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { uploaded: true, accepted: Boolean(out.fileId) };
  }

  /** The client's acknowledgement arrived later: the pack is accepted. */
  async recordAcknowledgement(ctx: TenantContext, user: ScopeUser, id: string, file: Upload) {
    await this.clra.gate(user, 'manage');
    if (!file?.data?.length) throw new BadRequestException('Attach the client’s acknowledgement (PDF, JPG or PNG).');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.pack(tx, c, id);
      if (!p.uploadedOn) throw new ConflictException('Record the upload first.');
      if (p.acceptedAt) throw new ConflictException('This pack is already accepted.');
      const f = await this.files.storeIn(tx, c, { area: 'client-pack-ack', name: file.name, data: file.data, allowedMime: ACK_TYPES, maxMb: 10, via: 'staff' });
      await tx.clientPack.update({ where: { id: p.id }, data: { ackFileId: f.id, acceptedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'clra.client_pack.accepted', 'client_pack', p.id, { fileId: f.id });
      return { org: c.organizationId, fileId: f.id };
    });
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { accepted: true };
  }
}

export type { OwnLicenceLike };
