import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { IN_STATES, todayIst } from '../org-structure/org-validation';
import { OrgSettingsService } from '../org-structure/org-settings.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';
import { gstinProblem } from '../expenses/checks';
import { FilesService } from '../documents/files.service';
import { safeName } from '../service-desk/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { alertDaysOf, alertDue, deployBlock, licenceState, type LicenceLike } from './clra-rules';
import type { ContractorDto, LicenceDto, RenewalDto } from './clra-dto';

const KEYS = ['clra.contractor.manage', 'clra.contractor.view', 'clra.settings.manage', 'org.settings.manage'] as const;
type Access = { manage: boolean; view: boolean; settings: boolean; actingForOther: boolean };
/** Settings 4.9 keys made live in CL-1 and CL-2 (the monthly compliance keys come with CL-4). */
export const CLRA_SETTING_KEYS = ['clra.licence_alerts', 'clra.induction_required', 'clra.induction_months'] as const;
const LICENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const FILE_MAX_MB = 10;
const NOT_FOUND = 'Contractor not found.';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const ANY_ENTITY = { legalEntityId: '' };
type Upload = { name: string; data: Buffer } | null;

/**
 * Contract labour CL-1 (answers 621, 623, 627; CLB-01, Settings 4.9). A contractor is the existing vendor record
 * (agencies) with "supplies contract labour" on, its PF code, ESIC code and LIN; no second vendor table. Its licences
 * are per establishment (our location), with the states they cover, the maximum workers and the validity, and a copy of
 * the licence. A licence or a renewal counts only once a person with clra.contractor.manage has verified it; until then,
 * and once it has ended, deployment there is blocked (law, always on: deployBlock). Alerts go to the compliance owners
 * on the company's lead days (clra.licence_alerts, default 60, 30 and 7 days). Reads need clra.contractor.view or
 * manage for the whole company; writes are never made while acting for someone else (403); another company's records
 * are not found (404). Every write is audited.
 */
@Injectable()
export class ContractLabourService {
  private readonly logger = new Logger(ContractLabourService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly settings: OrgSettingsService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  async access(user: ScopeUser): Promise<Access> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
    const manage = tenantWide(v, 'clra.contractor.manage');
    return { manage, view: manage || tenantWide(v, 'clra.contractor.view'), settings: tenantWide(v, 'clra.settings.manage') || tenantWide(v, 'org.settings.manage'), actingForOther: v.actingForOther };
  }

  async gate(user: ScopeUser, need: 'view' | 'manage') {
    const a = await this.access(user);
    if (need === 'manage' && a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    if (!(need === 'manage' ? a.manage : a.view)) throw new ForbiddenException(need === 'manage' ? 'Only the compliance owners for contract labour (the contractor key for the whole company) can change this.' : 'You need the contract labour key to see contractors.');
    return a;
  }

  /* ---------------- CLB-01 contractors register ---------------- */

  async register(ctx: TenantContext, user: ScopeUser) {
    const a = await this.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const alertDays = alertDaysOf(await settingFor(tx, c, 'clra.licence_alerts', ANY_ENTITY));
      const rows = await tx.agency.findMany({ where: { organizationId: org, contractLabour: true }, orderBy: { name: 'asc' }, take: 1000 });
      const licences = await tx.contractorLicence.findMany({ where: { organizationId: org, agencyId: { in: rows.map((r) => r.id) } }, orderBy: [{ validTo: 'desc' }, { createdAt: 'desc' }] });
      const locations = await tx.location.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' }, select: { id: true, name: true, state: true, archivedAt: true } });
      const fileRows = await tx.file.findMany({ where: { organizationId: org, id: { in: licences.map((l) => l.fileId) } }, select: { id: true, fileName: true, scanStatus: true } });
      const consultants = await tx.consultant.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.consultantId).filter((x): x is string => Boolean(x)) } }, select: { id: true, panStatus: true } });
      const deciders = await tx.user.findMany({ where: { organizationId: org, id: { in: licences.map((l) => l.decidedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      const like = (l: (typeof licences)[number]): LicenceLike => ({ id: l.id, locationId: l.locationId, states: l.states, validFrom: iso(l.validFrom), validTo: iso(l.validTo), status: l.status as LicenceLike['status'], renewalOfId: l.renewalOfId });
      return {
        canManage: a.manage && !a.actingForOther,
        today,
        alertDays,
        locations: locations.filter((l) => !l.archivedAt).map((l) => ({ id: l.id, name: l.name, state: l.state })),
        states: Object.entries(IN_STATES).map(([code, name]) => ({ code, name })),
        contractors: rows.map((r) => {
          const mine = licences.filter((l) => l.agencyId === r.id);
          const all = mine.map(like);
          return {
            id: r.id,
            name: r.name,
            work: r.work ?? '',
            contactEmail: r.contactEmail,
            pan: r.pan,
            panVerified: consultants.find((k) => k.id === r.consultantId)?.panStatus === 'operative',
            gstin: r.gstin,
            pfCode: r.pfCode,
            esicCode: r.esicCode,
            lin: r.lin,
            active: r.active,
            licences: mine.map((l) => {
              const loc = locations.find((x) => x.id === l.locationId);
              const f = fileRows.find((x) => x.id === l.fileId);
              const who = deciders.find((u) => u.id === l.decidedBy);
              return {
                id: l.id,
                no: l.licenceNo,
                locationId: l.locationId,
                establishment: loc?.name ?? 'Archived location',
                scope: l.scope,
                states: l.states,
                max: l.maxWorkers,
                validFrom: iso(l.validFrom),
                validTo: iso(l.validTo),
                status: l.status,
                state: licenceState(like(l), today, alertDays, all),
                renewalOfId: l.renewalOfId,
                rejectReason: l.rejectReason,
                decided: l.decidedAt ? { by: who?.name || who?.email || 'Someone', at: l.decidedAt.toISOString() } : null,
                file: { name: f?.fileName ?? 'licence', scan: f?.scanStatus === 'clean' ? 'clean' : f?.scanStatus === 'infected' ? 'infected' : 'pending' },
                // shortcut: no deployments before CL-2, so "today at this establishment" is the only check shown.
                block: loc ? deployBlock(all, { locationId: l.locationId, state: loc.state, on: today }) : 'The establishment is archived.',
              };
            }),
          };
        }),
      };
    });
  }

  private checkIds(dto: ContractorDto) {
    if (dto.gstin) {
      const bad = gstinProblem(dto.gstin);
      if (bad) throw new BadRequestException(bad);
      if (dto.pan && dto.gstin.slice(2, 12) !== dto.pan) throw new BadRequestException('The GSTIN does not carry this PAN. Check both.');
    }
  }

  private fields(dto: ContractorDto) {
    return { work: dto.work, contactEmail: dto.contactEmail || null, pan: dto.pan || null, gstin: dto.gstin || null, pfCode: dto.pfCode || null, esicCode: dto.esicCode || null, lin: dto.lin || null };
  }

  /**
   * Answer 623: one vendor record. A vendor of the same name (a staffing vendor or agency) becomes a contractor too;
   * its PAN must match when both are known.
   */
  async createContractor(ctx: TenantContext, user: ScopeUser, dto: ContractorDto) {
    await this.gate(user, 'manage');
    this.checkIds(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const same = await tx.agency.findFirst({ where: { organizationId: org, name: { equals: dto.name, mode: 'insensitive' } } });
      if (same?.contractLabour) throw new ConflictException(`${same.name} is already a contractor.`);
      if (same && same.pan && dto.pan && same.pan !== dto.pan) throw new ConflictException(`The vendor ${same.name} has another PAN. Check the PAN, or use another name.`);
      const data = { ...this.fields(dto), contractLabour: true, ...(dto.active !== undefined ? { active: dto.active } : {}) };
      if (same) {
        // Keep what the vendor record already has when the form leaves it empty.
        const kept = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
        await tx.agency.update({ where: { id: same.id }, data: kept });
        await audit(tx, c, 'clra.contractor.created', 'agency', same.id, { name: same.name, existingVendor: true });
        return { id: same.id, existingVendor: true };
      }
      const row = await tx.agency.create({ data: { organizationId: org, name: dto.name, portalToken: randomUUID(), ...data } });
      await audit(tx, c, 'clra.contractor.created', 'agency', row.id, { name: dto.name, existingVendor: false });
      return { id: row.id, existingVendor: false };
    });
  }

  async updateContractor(ctx: TenantContext, user: ScopeUser, id: string, dto: ContractorDto) {
    await this.gate(user, 'manage');
    this.checkIds(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const cur = await this.contractor(tx, c, id);
      const data = { name: dto.name, ...this.fields(dto), ...(dto.active !== undefined ? { active: dto.active } : {}) };
      await tx.agency.update({ where: { id }, data }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`A vendor named "${dto.name}" already exists.`);
        throw e;
      });
      const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => (cur as Record<string, unknown>)[k] !== data[k]);
      await audit(tx, c, 'clra.contractor.updated', 'agency', id, { changed });
      return { id };
    });
  }

  private async contractor(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.agency.findFirst({ where: { id, organizationId: c.organizationId, contractLabour: true } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async licence(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.contractorLicence.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Licence not found.');
    return row;
  }

  private async store(tx: Tx, c: CompanyContext, file: Upload) {
    if (!file?.data?.length) throw new BadRequestException('Attach a copy of the licence (PDF, JPG or PNG).');
    return this.files.storeIn(tx, c, { area: 'clra-licence', name: safeName(file.name), data: file.data, allowedMime: LICENCE_TYPES, maxMb: FILE_MAX_MB, via: 'staff' });
  }

  private dates(from: string, to: string, today: string) {
    if (to < from) throw new BadRequestException('The licence ends before it starts. Check the dates.');
    if (to < today) throw new BadRequestException('This licence has already ended. Add the renewed licence instead.');
  }

  /** A new licence for one of our establishments: it must cover the establishment's state; it waits for verification. */
  async addLicence(ctx: TenantContext, user: ScopeUser, contractorId: string, dto: LicenceDto, file: Upload) {
    await this.gate(user, 'manage');
    const today = todayIst();
    this.dates(dto.validFrom, dto.validTo, today);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.contractor(tx, c, contractorId);
      const loc = await tx.location.findFirst({ where: { id: dto.locationId, organizationId: c.organizationId, archivedAt: null }, select: { id: true, name: true, state: true } });
      if (!loc) throw new NotFoundException('Establishment not found.');
      const states = [...new Set(dto.states)];
      const unknown = states.find((x) => !(x in IN_STATES));
      if (unknown) throw new BadRequestException(`${unknown} is not a state of India.`);
      if (!states.includes(loc.state)) throw new BadRequestException(`The licence must cover ${loc.name}’s state (${loc.state}).`);
      const f = await this.store(tx, c, file);
      const row = await tx.contractorLicence
        .create({ data: { organizationId: c.organizationId, agencyId: contractorId, locationId: loc.id, licenceNo: dto.licenceNo, scope: dto.scope, states, maxWorkers: dto.maxWorkers, validFrom: day(dto.validFrom), validTo: day(dto.validTo), fileId: f.id, createdBy: c.userId ?? null } })
        .catch(this.duplicate);
      await audit(tx, c, 'clra.licence.added', 'contractor_licence', row.id, { contractorId, licenceNo: dto.licenceNo, locationId: loc.id, validTo: dto.validTo, fileId: f.id, sha256: f.sha256 });
      return { id: row.id, fileId: f.id, org: c.organizationId };
    });
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { id: out.id };
  }

  private duplicate = (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A licence with this number and end date is already recorded, or a renewal is already waiting for verification.');
    throw e;
  };

  /** Answer 627: a renewal of a verified licence, for the same establishment and states; it counts once verified. */
  async renew(ctx: TenantContext, user: ScopeUser, licenceId: string, dto: RenewalDto, file: Upload) {
    await this.gate(user, 'manage');
    const today = todayIst();
    this.dates(dto.validFrom, dto.validTo, today);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const old = await this.licence(tx, c, licenceId);
      if (old.status !== 'verified') throw new ConflictException('Only a verified licence can be renewed. Verify or reject this one first.');
      if (await tx.contractorLicence.findFirst({ where: { organizationId: c.organizationId, renewalOfId: old.id, status: { not: 'rejected' } }, select: { id: true } })) throw new ConflictException('This licence already has a renewal.');
      if (dto.validTo <= iso(old.validTo)) throw new BadRequestException(`The renewal must end after the current licence (${iso(old.validTo)}).`);
      if (dto.validFrom <= iso(old.validFrom)) throw new BadRequestException('The renewal must start after the current licence started.');
      const f = await this.store(tx, c, file);
      const row = await tx.contractorLicence
        .create({ data: { organizationId: c.organizationId, agencyId: old.agencyId, locationId: old.locationId, licenceNo: dto.licenceNo, scope: old.scope, states: old.states, maxWorkers: dto.maxWorkers, validFrom: day(dto.validFrom), validTo: day(dto.validTo), fileId: f.id, renewalOfId: old.id, createdBy: c.userId ?? null } })
        .catch(this.duplicate);
      await audit(tx, c, 'clra.licence.renewal_added', 'contractor_licence', row.id, { renews: old.id, licenceNo: dto.licenceNo, validTo: dto.validTo, fileId: f.id, sha256: f.sha256 });
      return { id: row.id, fileId: f.id, org: c.organizationId };
    });
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { id: out.id };
  }

  /** Verify a licence or renewal after checking the copy (a clean file only); it then counts for deployment. */
  async verify(ctx: TenantContext, user: ScopeUser, licenceId: string) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const l = await this.licence(tx, c, licenceId);
      if (l.status !== 'pending') throw new ConflictException(`This licence was already ${l.status}.`);
      const f = await tx.file.findFirst({ where: { organizationId: c.organizationId, id: l.fileId }, select: { scanStatus: true } });
      if (f?.scanStatus !== 'clean') throw new ConflictException('The licence copy is still being checked for viruses, or failed the check. Verify it once it is clean.');
      const { count } = await tx.contractorLicence.updateMany({ where: { id: l.id, organizationId: c.organizationId, status: 'pending' }, data: { status: 'verified', decidedBy: c.userId ?? null, decidedAt: new Date() } });
      if (!count) throw new ConflictException('Someone else decided this licence just now. Reload the page.');
      await audit(tx, c, 'clra.licence.verified', 'contractor_licence', l.id, { licenceNo: l.licenceNo, renews: l.renewalOfId, validTo: iso(l.validTo) });
      return { id: l.id, status: 'verified' };
    });
  }

  async reject(ctx: TenantContext, user: ScopeUser, licenceId: string, reason: string) {
    await this.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const l = await this.licence(tx, c, licenceId);
      if (l.status !== 'pending') throw new ConflictException(`This licence was already ${l.status}.`);
      const { count } = await tx.contractorLicence.updateMany({ where: { id: l.id, organizationId: c.organizationId, status: 'pending' }, data: { status: 'rejected', rejectReason: reason, decidedBy: c.userId ?? null, decidedAt: new Date() } });
      if (!count) throw new ConflictException('Someone else decided this licence just now. Reload the page.');
      await audit(tx, c, 'clra.licence.rejected', 'contractor_licence', l.id, { licenceNo: l.licenceNo, reason });
      return { id: l.id, status: 'rejected' };
    });
  }

  /** The licence copy: clean files only; every open is audited. */
  async file(ctx: TenantContext, user: ScopeUser, licenceId: string) {
    await this.gate(user, 'view');
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const l = await this.licence(tx, c, licenceId);
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: l.fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('This file is still being checked for viruses, or failed the check.');
      await audit(tx, c, 'clra.licence.file_opened', 'contractor_licence', l.id, { fileId: f.id, sha256: f.sha256 });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /* ---------------- Settings 4.9 ---------------- */

  async readSettings(ctx: TenantContext, user: ScopeUser) {
    const a = await this.access(user);
    if (!a.settings && !a.view) throw new ForbiddenException('You need the contract labour key or the settings key to see the contract labour settings.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.setting.findMany({ where: { organizationId: org, key: { in: [...CLRA_SETTING_KEYS] }, scopeType: 'tenant', scopeId: org } });
      const last = rows.filter((r) => r.updatedBy).sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime())[0];
      const by = last ? await tx.user.findFirst({ where: { organizationId: org, id: last.updatedBy! }, select: { name: true, email: true } }) : null;
      const law = await tx.statutoryRuleSet.findMany({ where: { statute: 'IN.CLRA', status: 'published' }, orderBy: [{ jurisdiction: 'asc' }, { validFrom: 'asc' }] });
      return {
        canEdit: a.settings && !a.actingForOther,
        values: Object.fromEntries(CLRA_SETTING_KEYS.map((k) => [k, String(rows.find((r) => r.key === k)?.value ?? SETTINGS[k]!.default)])),
        defaults: Object.fromEntries(CLRA_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.default])),
        choices: Object.fromEntries(CLRA_SETTING_KEYS.map((k) => [k, SETTINGS[k]!.values])),
        lastChange: last ? { by: by?.name || by?.email || 'Someone', at: last.updatedAt, what: `Changed ${SETTINGS[last.key]!.label.replace(/^Contract labour: /, '').toLowerCase()}` } : null,
        law: law.map((r) => ({ state: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, verify: r.verify, source: r.source, values: r.values as { law: string; registrationThreshold: number; licenceThreshold: number; minAge: number } })),
      };
    });
  }

  async saveSettings(ctx: TenantContext, user: ScopeUser, changes: { key: string; value: string }[]) {
    const a = await this.access(user);
    if (a.actingForOther) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    if (!a.settings) throw new ForbiddenException('Only HR with the contract labour settings key for the whole company can change these settings.');
    const seen = new Set<string>();
    for (const ch of changes) {
      if (!(CLRA_SETTING_KEYS as readonly string[]).includes(ch.key)) throw new BadRequestException(`${ch.key} is not a contract labour setting.`);
      if (seen.has(ch.key)) throw new BadRequestException(`${SETTINGS[ch.key]!.label} is in the list twice.`);
      seen.add(ch.key);
      if (ch.key === 'clra.licence_alerts' && !ch.value) throw new BadRequestException('Choose at least one day for the licence expiry alerts.');
    }
    for (const ch of changes) await this.settings.set(ctx, { key: ch.key, scopeType: 'tenant', value: ch.value } as Parameters<OrgSettingsService['set']>[1]);
    return this.readSettings(ctx, user);
  }

  /* ---------------- answer 627: expiry alerts ---------------- */

  async alertAll(today = todayIst()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM contractor_licences WHERE status = 'verified' AND valid_to >= ${today}::date`);
    let n = 0;
    for (const { id } of orgs) n += await this.alertOrg(id, today).catch((e: Error) => (this.logger.warn(`licence alerts ${id}: ${e.message}`), 0));
    return n;
  }

  /** Once per licence and lead day (contractor_licence_alerts); a verified renewal or an inactive contractor stops them. */
  async alertOrg(org: string, today = todayIst()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const sends = await this.tenantPrisma.forTenant(c, async (tx) => {
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`clra-licence-alerts:${org}`})) AS ok`;
      if (!lock?.ok) return { out: [], to: [] };
      const days = alertDaysOf(await settingFor(tx, c, 'clra.licence_alerts', ANY_ENTITY));
      const rows = await tx.contractorLicence.findMany({ where: { organizationId: org, status: 'verified', validTo: { gte: day(today) } } });
      const renewed = new Set((await tx.contractorLicence.findMany({ where: { organizationId: org, status: 'verified', renewalOfId: { in: rows.map((r) => r.id) } }, select: { renewalOfId: true } })).map((r) => r.renewalOfId));
      const agencies = await tx.agency.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.agencyId) }, active: true, contractLabour: true }, select: { id: true, name: true } });
      const out: { id: string; text: string }[] = [];
      for (const l of rows) {
        const lead = alertDue(iso(l.validTo), today, days);
        const a = agencies.find((x) => x.id === l.agencyId);
        if (lead === null || !a || renewed.has(l.id)) continue;
        const { count } = await tx.contractorLicenceAlert.createMany({ data: [{ organizationId: org, licenceId: l.id, daysBefore: lead }], skipDuplicates: true });
        if (!count) continue;
        await audit(tx, c, 'clra.licence.alerted', 'contractor_licence', l.id, { daysBefore: lead });
        out.push({ id: l.id, text: `${a.name}: licence ${l.licenceNo} ends on ${iso(l.validTo)} (${lead} days). Deployments stop when it ends unless a renewal is verified.` });
      }
      return { out, to: out.length ? await this.owners(tx, org, today) : [] };
    });
    for (const s of sends.out)
      await this.notifications
        .notifySystem({ organizationId: org, isSuperAdmin: false }, sends.to, 'clra.licence.expiring', { entityType: 'contractor_licence', entityId: s.id, contextText: s.text, linkPath: '/yx/contract-labour/contractors' }, { subject: 'A contractor licence ends soon', html: `<p>${escapeHtml(s.text)}</p><p>Open Contract labour › Contractors in YukthiX to add the renewal.</p>` })
        .catch((e: Error) => this.logger.warn(`licence alert: ${e.message}`));
    return sends.out.length;
  }

  /** Active holders of clra.contractor.manage for the whole company (profile or company-wide grant), else the System Admins. */
  private async owners(tx: Tx, org: string, today: string): Promise<string[]> {
    const like = '%"clra.contractor.manage"%';
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
      WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
      UNION
      SELECT g.user_id::text FROM role_grants g
      JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
      JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
      WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.scope_type = 'tenant' AND p.permissions_json LIKE ${like}
        AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
      LIMIT 25`;
    if (rows.length) return rows.map((r) => r.id);
    return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id);
  }
}
