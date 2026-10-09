import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import {
  AddressDto,
  AnyMasterDto,
  CostCentreDto,
  DepartmentDto,
  DesignationDto,
  EmploymentTypeDto,
  GradeDto,
  LegalEntityDto,
  LegalEntityStatutoryDto,
  LocationDto,
  MasterKind,
  PayRangeAmountsDto,
  PayRangeDto,
} from './dto';
import { addDays, addressProblem, asDate, codeFromName, gstinMatchesPan, isCidr, isCurrency, isoDate, isTimeZone, regionProblem, todayIst } from './org-validation';

// P01 organisation structure (§4.1–4.3): legal entities, locations, structure masters and grade pay ranges.
// Everything runs inside the caller's company (forced RLS, never the super-admin bypass: P01 §5 #2), and
// every change is audited in the same transaction (P08).

export type Tx = Prisma.TransactionClient;
export type CompanyContext = TenantContext & { organizationId: string };

/** The caller's company, without the RLS bypass even for platform staff acting in it. */
export function companyContext(ctx: TenantContext): CompanyContext {
  if (!ctx.organizationId) throw new ForbiddenException('Sign in to a company to manage its organisation.');
  return { organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null, role: ctx.role ?? null, supportSessionId: ctx.supportSessionId ?? null };
}

/** Database refusals in plain words: uniqueness, a row still in use, overlapping dated rows. */
export function mapDbError(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // The unique indexes are expression / partial indexes Prisma cannot name, so the model tells which.
    if (e.code === 'P2002') {
      const model = String(e.meta?.modelName ?? '');
      if (model === 'LegalEntity') return new ConflictException('Another legal entity already has that short name.');
      if (model === 'Setting') return new ConflictException('That setting was saved at the same moment. Reload and try again.');
      return new ConflictException('That name or code is already used (YX-ORG-05).');
    }
    if (e.code === 'P2003') return new ConflictException('It is in use, so it can only be archived (YX-ORG-04).');
  }
  if (e instanceof Error && /exclusion constraint|23P01/.test(e.message)) {
    return new ConflictException('The dates overlap another pay range for this grade, entity and currency.');
  }
  return e;
}

export async function inCompany<T>(tenantPrisma: TenantPrismaService, ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
  const c = companyContext(ctx);
  try {
    return await tenantPrisma.forTenant(c, (tx) => fn(tx, c));
  } catch (e) {
    throw mapDbError(e);
  }
}

export const audit = (tx: Tx, c: CompanyContext, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) =>
  AuditService.recordIn(tx, c, { actorUserId: c.userId ?? null, action, entityType, entityId, metadata });

/** Names of the fields whose values differ (audit metadata never carries Confidential values). */
function changed(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => after[k] !== undefined && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

function checkAddress(address: AddressDto): Prisma.InputJsonObject {
  const problem = addressProblem(address);
  if (problem) throw new BadRequestException(problem);
  return { lines: address.lines.map(clean), city: clean(address.city), state: address.state, postalCode: address.postalCode ?? null, country: address.country };
}

// ---- views: what the browser may see ----

type EntityRow = Prisma.LegalEntityGetPayload<object>;
export function legalEntityView(r: EntityRow) {
  return {
    id: r.id,
    name: r.name,
    shortName: r.shortName,
    country: r.country,
    currency: r.currency,
    fyStartMonth: r.fyStartMonth,
    registeredAddress: r.registeredAddress,
    dataRegion: r.dataRegion,
    isDefault: r.isDefault,
    archivedAt: r.archivedAt,
    // Confidential identifiers: only whether each is on file (P02 §4.4); values via the audited statutory read.
    statutory: { pan: r.pan !== null, tan: r.tan !== null, gstin: r.gstin !== null, cin: r.cin !== null },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

type LocationRow = Prisma.LocationGetPayload<object>;
export function locationView(r: LocationRow) {
  const { organizationId: _o, geoLat, geoLng, geoRadiusM, createdBy: _c, ...rest } = r;
  return { ...rest, geofence: geoLat !== null && geoLng !== null && geoRadiusM !== null ? { lat: Number(geoLat), lng: Number(geoLng), radiusM: geoRadiusM } : null };
}

function masterView<T extends { organizationId: string; createdBy: string | null }>(r: T) {
  const { organizationId: _o, createdBy: _c, ...rest } = r;
  return rest;
}

type PayRangeRow = Prisma.GradePayRangeGetPayload<object>;
function payRangeView(r: PayRangeRow) {
  return {
    id: r.id,
    gradeId: r.gradeId,
    legalEntityId: r.legalEntityId,
    currency: r.currency,
    min: r.min.toString(),
    mid: r.mid.toString(),
    max: r.max.toString(),
    validFrom: isoDate(r.validFrom),
    validTo: r.validTo ? isoDate(r.validTo) : null,
  };
}

// ---- masters ----

const MODEL = {
  departments: 'department',
  designations: 'designation',
  grades: 'grade',
  'employment-types': 'employmentType',
  'cost-centres': 'costCentre',
} as const;
/** Audit entity type, and the settings scope type where one exists. */
export const MASTER_ENTITY: Record<MasterKind, string> = {
  departments: 'department',
  designations: 'designation',
  grades: 'grade',
  'employment-types': 'employment_type',
  'cost-centres': 'cost_centre',
};

interface MasterRow {
  id: string;
  name: string;
  code: string;
  archivedAt: Date | null;
  organizationId: string;
  createdBy: string | null;
  ownerLegalEntityId?: string | null;
  appliesToEntities?: string[];
  parentId?: string | null;
  path?: string;
  legalEntityId?: string;
}

// The five master delegates share the operations used here; one typed view of them.
interface MasterDelegate {
  findMany(args: unknown): Promise<MasterRow[]>;
  findFirst(args: unknown): Promise<MasterRow | null>;
  create(args: unknown): Promise<MasterRow>;
  update(args: unknown): Promise<MasterRow>;
  delete(args: unknown): Promise<MasterRow>;
  count(args: unknown): Promise<number>;
}
const delegate = (tx: Tx, kind: MasterKind) => tx[MODEL[kind]] as unknown as MasterDelegate;

@Injectable()
export class OrgStructureService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  /** An entity of this company that may take new records (YX-ORG-04: archived masters can't be chosen). */
  private async activeEntity(tx: Tx, c: CompanyContext, id: string, what = 'legal entity'): Promise<EntityRow> {
    const row = await tx.legalEntity.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new BadRequestException(`Choose a ${what} of this company.`);
    if (row.archivedAt) throw new BadRequestException(`${row.name} is archived; choose an active ${what}.`);
    return row;
  }

  private async entityOr404(tx: Tx, c: CompanyContext, id: string): Promise<EntityRow> {
    const row = await tx.legalEntity.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Legal entity not found');
    return row;
  }

  /** Settings that point at a record make it "used" (YX-ORG-04). */
  private async assertNoSettings(tx: Tx, c: CompanyContext, scopeId: string): Promise<void> {
    if (await tx.setting.count({ where: { organizationId: c.organizationId, scopeId } })) {
      throw new ConflictException('Settings are set for it, so it can only be archived (YX-ORG-04).');
    }
  }

  // ================= 4.1 legal entities =================

  listEntities(ctx: TenantContext, includeArchived: boolean) {
    return this.run(ctx, async (tx, c) =>
      (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })).map(legalEntityView),
    );
  }

  createEntity(ctx: TenantContext, dto: LegalEntityDto) {
    const country = dto.country ?? 'IN';
    const dataRegion = dto.dataRegion ?? 'IN';
    const currency = dto.currency ?? 'INR';
    // YX-ORG-30 / YX-GLB-01: the region must be live and serve the country.
    const regionError = regionProblem(dataRegion, country);
    if (regionError) throw new BadRequestException(regionError);
    if (!isCurrency(currency)) throw new BadRequestException('Unknown currency');
    const registeredAddress = dto.registeredAddress ? checkAddress(dto.registeredAddress) : undefined;
    return this.run(ctx, async (tx, c) => {
      // YX-ORG-01: the company's first entity is its default.
      const first = (await tx.legalEntity.count({ where: { organizationId: c.organizationId } })) === 0;
      const row = await tx.legalEntity.create({
        data: {
          organizationId: c.organizationId,
          name: clean(dto.name),
          shortName: clean(dto.shortName),
          country,
          currency,
          fyStartMonth: dto.fyStartMonth ?? 4,
          registeredAddress,
          dataRegion,
          isDefault: first,
          createdBy: c.userId,
        },
      });
      await audit(tx, c, 'org.legal_entity.created', 'legal_entity', row.id, { name: row.name, shortName: row.shortName, isDefault: first });
      return legalEntityView(row);
    });
  }

  updateEntity(ctx: TenantContext, id: string, dto: LegalEntityDto) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      // YX-ORG-30: country and data region are fixed (a region move is a platform process).
      if ((dto.country && dto.country !== row.country) || (dto.dataRegion && dto.dataRegion !== row.dataRegion)) {
        throw new BadRequestException('The country and data region of a legal entity are fixed once created.');
      }
      if (dto.currency && !isCurrency(dto.currency)) throw new BadRequestException('Unknown currency');
      const data = {
        name: clean(dto.name),
        shortName: clean(dto.shortName),
        currency: dto.currency,
        fyStartMonth: dto.fyStartMonth,
        registeredAddress: dto.registeredAddress === null ? Prisma.DbNull : dto.registeredAddress ? checkAddress(dto.registeredAddress) : undefined,
      };
      const updated = await tx.legalEntity.update({ where: { id }, data });
      const fields = changed(row, { ...data, registeredAddress: dto.registeredAddress === undefined ? undefined : (updated.registeredAddress ?? null) });
      if (fields.length) await audit(tx, c, 'org.legal_entity.updated', 'legal_entity', id, { fields });
      return legalEntityView(updated);
    });
  }

  /** YX-ORG-01: exactly one default, always an active entity. */
  setDefaultEntity(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      await this.lock(tx, c, 'legal-entities');
      const row = await this.activeEntity(tx, c, id);
      if (row.isDefault) return legalEntityView(row);
      await tx.legalEntity.updateMany({ where: { organizationId: c.organizationId, isDefault: true }, data: { isDefault: false } });
      const updated = await tx.legalEntity.update({ where: { id }, data: { isDefault: true } });
      await audit(tx, c, 'org.legal_entity.default_changed', 'legal_entity', id, { name: row.name });
      return legalEntityView(updated);
    });
  }

  archiveEntity(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      if (row.archivedAt) return legalEntityView(row);
      if (row.isDefault) throw new ConflictException('Make another entity the default before archiving this one (YX-ORG-01).');
      const where = { organizationId: c.organizationId, archivedAt: null };
      const [locations, costCentres, owned] = await Promise.all([
        tx.location.count({ where: { ...where, legalEntityId: id } }),
        tx.costCentre.count({ where: { ...where, legalEntityId: id } }),
        Promise.all((['department', 'designation', 'grade', 'employmentType'] as const).map((m) => (tx[m] as unknown as MasterDelegate).count({ where: { ...where, ownerLegalEntityId: id } }))),
      ]);
      const ownedTotal = owned.reduce((a, b) => a + b, 0);
      if (locations + costCentres + ownedTotal > 0) {
        throw new ConflictException(`Archive its ${[locations && `${locations} location(s)`, costCentres && `${costCentres} cost centre(s)`, ownedTotal && `${ownedTotal} entity-only master(s)`].filter(Boolean).join(', ')} first.`);
      }
      const updated = await tx.legalEntity.update({ where: { id }, data: { archivedAt: new Date() } });
      await audit(tx, c, 'org.legal_entity.archived', 'legal_entity', id, { name: row.name });
      return legalEntityView(updated);
    });
  }

  restoreEntity(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      if (!row.archivedAt) return legalEntityView(row);
      const updated = await tx.legalEntity.update({ where: { id }, data: { archivedAt: null } });
      await audit(tx, c, 'org.legal_entity.restored', 'legal_entity', id, { name: row.name });
      return legalEntityView(updated);
    });
  }

  deleteEntity(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      if (row.isDefault) throw new ConflictException('The default legal entity cannot be deleted (YX-ORG-01).');
      await this.assertNoSettings(tx, c, id);
      await tx.legalEntity.delete({ where: { id } });
      await audit(tx, c, 'org.legal_entity.deleted', 'legal_entity', id, { name: row.name });
    });
  }

  /** The Confidential identifiers themselves (P02 §4.4); every read is audited (YX-SEC-09 pattern). */
  getStatutory(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      await audit(tx, c, 'org.legal_entity.statutory_viewed', 'legal_entity', id);
      return { pan: row.pan, tan: row.tan, gstin: row.gstin, cin: row.cin };
    });
  }

  setStatutory(ctx: TenantContext, id: string, dto: LegalEntityStatutoryDto) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.entityOr404(tx, c, id);
      // Other countries' identifiers come with their P07 country pack.
      if (row.country !== 'IN') throw new BadRequestException('Statutory identifiers for this country are not available yet.');
      const next = { pan: dto.pan === undefined ? row.pan : dto.pan, tan: dto.tan === undefined ? row.tan : dto.tan, gstin: dto.gstin === undefined ? row.gstin : dto.gstin, cin: dto.cin === undefined ? row.cin : dto.cin };
      if (next.gstin && next.pan && !gstinMatchesPan(next.gstin, next.pan)) throw new BadRequestException('The GSTIN does not contain this entity’s PAN.');
      const fields = changed({ pan: row.pan, tan: row.tan, gstin: row.gstin, cin: row.cin }, next);
      if (!fields.length) return legalEntityView(row);
      const updated = await tx.legalEntity.update({ where: { id }, data: next });
      await audit(tx, c, 'org.legal_entity.statutory_changed', 'legal_entity', id, { fields });
      return legalEntityView(updated);
    });
  }

  // ================= 4.2 locations =================

  private locationData(dto: LocationDto) {
    const address = checkAddress(dto.address);
    // YX-ORG-02: state and time zone are mandatory.
    if (!isTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
    const ipRanges = [...new Set((dto.ipRanges ?? []).map((r) => r.trim()))];
    const bad = ipRanges.find((r) => !isCidr(r));
    if (bad) throw new BadRequestException(`${bad} is not an IP range such as 203.0.113.0/24`);
    return {
      name: clean(dto.name),
      address,
      country: dto.address.country,
      state: dto.address.state,
      timezone: dto.timezone,
      minWageZone: dto.minWageZone === undefined ? undefined : dto.minWageZone === null ? null : clean(dto.minWageZone) || null,
      geoLat: dto.geofence === undefined ? undefined : (dto.geofence?.lat ?? null),
      geoLng: dto.geofence === undefined ? undefined : (dto.geofence?.lng ?? null),
      geoRadiusM: dto.geofence === undefined ? undefined : (dto.geofence?.radiusM ?? null),
      ipRanges: dto.ipRanges === undefined ? undefined : ipRanges,
    };
  }

  private async locationOr404(tx: Tx, c: CompanyContext, id: string): Promise<LocationRow> {
    const row = await tx.location.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Location not found');
    return row;
  }

  listLocations(ctx: TenantContext, legalEntityId: string | undefined, includeArchived: boolean) {
    return this.run(ctx, async (tx, c) =>
      (
        await tx.location.findMany({
          where: { organizationId: c.organizationId, ...(legalEntityId ? { legalEntityId } : {}), ...(includeArchived ? {} : { archivedAt: null }) },
          orderBy: { name: 'asc' },
        })
      ).map(locationView),
    );
  }

  createLocation(ctx: TenantContext, dto: LocationDto) {
    const data = this.locationData(dto);
    return this.run(ctx, async (tx, c) => {
      // YX-ORG-02: one active legal entity of this company.
      await this.activeEntity(tx, c, dto.legalEntityId);
      const code = dto.code ?? codeFromName(data.name, await this.takenCodes(tx, c, 'location', data.name));
      const row = await tx.location.create({ data: { ...data, organizationId: c.organizationId, legalEntityId: dto.legalEntityId, code, createdBy: c.userId } });
      await audit(tx, c, 'org.location.created', 'location', row.id, { name: row.name, code: row.code, legalEntityId: row.legalEntityId, state: row.state });
      return locationView(row);
    });
  }

  updateLocation(ctx: TenantContext, id: string, dto: LocationDto) {
    const data = this.locationData(dto);
    return this.run(ctx, async (tx, c) => {
      const row = await this.locationOr404(tx, c, id);
      // People's employments hang off the site's entity (YX-ORG-08): a site never changes entity.
      if (dto.legalEntityId !== row.legalEntityId) throw new BadRequestException('A location stays with its legal entity. Add a new location under the other entity instead.');
      const next = { ...data, code: dto.code ?? row.code };
      const updated = await tx.location.update({ where: { id }, data: next });
      const fields = changed(locationView(row) as unknown as Record<string, unknown>, locationView(updated) as unknown as Record<string, unknown>).filter((f) => f !== 'updatedAt');
      if (fields.length) await audit(tx, c, 'org.location.updated', 'location', id, { fields });
      return locationView(updated);
    });
  }

  archiveLocation(ctx: TenantContext, id: string, archive: boolean) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.locationOr404(tx, c, id);
      if (Boolean(row.archivedAt) === archive) return locationView(row);
      if (!archive) await this.activeEntity(tx, c, row.legalEntityId);
      const updated = await tx.location.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
      await audit(tx, c, archive ? 'org.location.archived' : 'org.location.restored', 'location', id, { name: row.name });
      return locationView(updated);
    });
  }

  deleteLocation(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.locationOr404(tx, c, id);
      await this.assertNoSettings(tx, c, id);
      await tx.location.delete({ where: { id } });
      await audit(tx, c, 'org.location.deleted', 'location', id, { name: row.name });
    });
  }

  /** Codes already used near `name` in the record's scope (YX-ORG-05). */
  private async takenCodes(tx: Tx, c: CompanyContext, kind: MasterKind | 'location', name: string, scope: Record<string, unknown> = {}): Promise<Set<string>> {
    const prefix = codeFromName(name, new Set());
    const where = { organizationId: c.organizationId, code: { startsWith: prefix }, ...scope };
    const rows = kind === 'location' ? await tx.location.findMany({ where, select: { code: true } }) : await delegate(tx, kind).findMany({ where, select: { code: true } });
    return new Set(rows.map((r) => r.code.toUpperCase()));
  }

  // ================= 4.3 structure masters =================

  listMasters(ctx: TenantContext, kind: MasterKind, legalEntityId: string | undefined, includeArchived: boolean) {
    return this.run(ctx, async (tx, c) => {
      const where: Record<string, unknown> = { organizationId: c.organizationId, ...(includeArchived ? {} : { archivedAt: null }) };
      if (legalEntityId) {
        // YX-ORG-15: masters available to the entity -- its own, or shared and not limited away from it.
        where.OR =
          kind === 'cost-centres'
            ? [{ legalEntityId }]
            : [{ ownerLegalEntityId: legalEntityId }, { ownerLegalEntityId: null, appliesToEntities: { isEmpty: true } }, { ownerLegalEntityId: null, appliesToEntities: { has: legalEntityId } }];
      }
      const rows = await delegate(tx, kind).findMany({ where, orderBy: kind === 'departments' ? { path: 'asc' } : kind === 'grades' ? [{ rank: 'asc' }, { name: 'asc' }] : { name: 'asc' } });
      return rows.map((r) => {
        const { path: _p, ...view } = masterView(r);
        return view;
      });
    });
  }

  private async masterOr404(tx: Tx, c: CompanyContext, kind: MasterKind, id: string): Promise<MasterRow> {
    const row = await delegate(tx, kind).findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  /** Owner and entity limits of a shared / entity-only master (YX-ORG-15). */
  private async ownership(tx: Tx, c: CompanyContext, dto: { ownerLegalEntityId?: string | null; appliesToEntities?: string[] }, before?: MasterRow) {
    const owner = dto.ownerLegalEntityId === undefined ? (before?.ownerLegalEntityId ?? null) : dto.ownerLegalEntityId;
    const appliesTo = [...new Set(dto.appliesToEntities ?? (owner ? [] : (before?.appliesToEntities ?? [])))];
    if (owner && appliesTo.length) throw new BadRequestException('An entity-only master cannot also be limited to other entities.');
    if (owner && owner !== before?.ownerLegalEntityId) await this.activeEntity(tx, c, owner);
    for (const e of appliesTo.filter((e) => !before?.appliesToEntities?.includes(e))) await this.activeEntity(tx, c, e);
    return { ownerLegalEntityId: owner, appliesToEntities: appliesTo };
  }

  private async lock(tx: Tx, c: CompanyContext, what: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${what}:${c.organizationId}`}, 0))`;
  }

  createMaster(ctx: TenantContext, kind: MasterKind, dto: AnyMasterDto) {
    return this.run(ctx, async (tx, c) => {
      const name = clean(dto.name);
      const base = { organizationId: c.organizationId, name, createdBy: c.userId };
      let data: Record<string, unknown>;
      let codeScope: Record<string, unknown>;
      if (kind === 'cost-centres') {
        const d = dto as CostCentreDto;
        await this.activeEntity(tx, c, d.legalEntityId);
        if (d.parentId) await this.costCentreParent(tx, c, d.legalEntityId, d.parentId);
        await this.activeLogin(tx, c, d.ownerUserId);
        data = { ...base, legalEntityId: d.legalEntityId, parentId: d.parentId ?? null, ownerUserId: d.ownerUserId ?? null };
        codeScope = { legalEntityId: d.legalEntityId };
      } else {
        const own = await this.ownership(tx, c, dto as DepartmentDto);
        data = { ...base, ...own, ...this.kindFields(kind, dto) };
        codeScope = { ownerLegalEntityId: own.ownerLegalEntityId };
        if (kind === 'departments') {
          const d = dto as DepartmentDto;
          await this.headOf(tx, c, d.headEmployeeId, null, data);
          await this.lock(tx, c, 'departments');
          const id = randomUUID();
          const parent = d.parentId ? await this.departmentParent(tx, c, id, d.parentId, own.ownerLegalEntityId) : null;
          if (parent && d.isDivision) throw new BadRequestException('A division is a top-level department (no parent).');
          data = { ...data, id, parentId: parent?.id ?? null, path: `${parent?.path ?? '/'}${id}/` };
        }
      }
      const code = dto.code ?? codeFromName(name, await this.takenCodes(tx, c, kind, name, codeScope));
      const row = await delegate(tx, kind).create({ data: { ...data, code } });
      await audit(tx, c, `org.${MASTER_ENTITY[kind]}.created`, MASTER_ENTITY[kind], row.id, { name: row.name, code: row.code });
      if (data.headSince !== undefined) await this.auditHead(tx, c, row.id, null, data.headEmployeeId as string | null);
      const { path: _p, ...view } = masterView(row);
      return view;
    });
  }

  private kindFields(kind: MasterKind, dto: AnyMasterDto): Record<string, unknown> {
    switch (kind) {
      case 'departments': {
        const d = dto as DepartmentDto;
        return { isDivision: d.isDivision ?? false, ...(d.headEmployeeId !== undefined ? { headEmployeeId: d.headEmployeeId } : {}) };
      }
      case 'designations':
        return { jobFamily: (dto as DesignationDto).jobFamily?.trim() || null };
      case 'grades':
        return { rank: (dto as GradeDto).rank };
      case 'employment-types':
        return { category: (dto as EmploymentTypeDto).category };
      default:
        return {};
    }
  }

  /**
   * A department's new parent (YX-ORG-03, YX-ORG-15): active, not itself or below itself, and either
   * shared or owned by the same entity (an entity-only department may sit under a shared parent).
   */
  private async departmentParent(tx: Tx, c: CompanyContext, id: string, parentId: string, owner: string | null) {
    const parent = (await delegate(tx, 'departments').findFirst({ where: { id: parentId, organizationId: c.organizationId } })) as (MasterRow & { path: string }) | null;
    if (!parent) throw new BadRequestException('Choose a parent department of this company.');
    if (parent.archivedAt) throw new BadRequestException(`${parent.name} is archived; choose an active parent.`);
    if (parent.path.includes(`/${id}/`)) throw new BadRequestException('A department cannot sit under itself or one of its sub-departments (YX-ORG-03).');
    if (parent.ownerLegalEntityId !== null && parent.ownerLegalEntityId !== owner) {
      throw new BadRequestException(`${parent.name} belongs to one legal entity, so only that entity’s departments can sit under it (YX-ORG-15).`);
    }
    return parent;
  }

  /** The department's head now (null for none or a new department): naming another is an access change. */
  departmentHead(ctx: TenantContext, id: string | null): Promise<string | null> {
    if (!id) return Promise.resolve(null);
    return this.run(ctx, async (tx, c) => (await tx.department.findFirst({ where: { id, organizationId: c.organizationId }, select: { headEmployeeId: true } }))?.headEmployeeId ?? null);
  }

  /**
   * A new department head (P02 YX-SEC-04): an employee of this company (the composite key proves it again), never
   * the person naming them, since the head's implicit view of the subtree is an access grant; it runs from today,
   * never over the department's earlier history (YX-SEC-06). Sets headSince on `data` when the head changes.
   */
  private async headOf(tx: Tx, c: CompanyContext, employeeId: string | null | undefined, current: string | null, data: Record<string, unknown>) {
    if (employeeId === undefined || employeeId === current) return;
    if (employeeId) {
      if (!(await tx.employee.findFirst({ where: { id: employeeId, organizationId: c.organizationId }, select: { id: true } }))) throw new BadRequestException('Choose a department head who is an employee of this company.');
      const own = c.userId ? await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true } }) : null;
      if (own?.id === employeeId) throw new ForbiddenException('Someone else names you department head: it opens the department’s records to you (YX-SEC-11).');
    }
    data.headSince = employeeId ? asDate(todayIst()) : null;
  }

  /** Changing a head grants or ends an implicit view: recorded as an access change (P02 §4.2, P08). */
  private auditHead(tx: Tx, c: CompanyContext, departmentId: string, from: string | null, to: string | null) {
    return audit(tx, c, 'access.implicit_grant.changed', 'department', departmentId, { grant: 'department_head', from, to });
  }

  /** A cost centre's parent: same entity, active, no cycle. */
  /** A cost-centre owner is an active login of the company. */
  private async activeLogin(tx: Tx, c: CompanyContext, userId: string | null | undefined) {
    if (userId && !(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active colleague as the owner.');
  }

  private async costCentreParent(tx: Tx, c: CompanyContext, legalEntityId: string, parentId: string, id?: string) {
    const parent = await tx.costCentre.findFirst({ where: { id: parentId, organizationId: c.organizationId } });
    if (!parent || parent.legalEntityId !== legalEntityId) throw new BadRequestException('Choose a parent cost centre of the same legal entity.');
    if (parent.archivedAt) throw new BadRequestException(`${parent.name} is archived; choose an active parent.`);
    if (id) {
      const [loop] = await tx.$queryRaw<{ found: number }[]>`
        WITH RECURSIVE up AS (
          SELECT id, parent_id FROM cost_centres WHERE id = ${parentId}::uuid AND organization_id = ${c.organizationId}::uuid
          UNION ALL
          SELECT cc.id, cc.parent_id FROM cost_centres cc JOIN up ON cc.id = up.parent_id WHERE cc.organization_id = ${c.organizationId}::uuid
        )
        SELECT 1 AS found FROM up WHERE id = ${id}::uuid LIMIT 1`;
      if (loop) throw new BadRequestException('A cost centre cannot sit under itself or one of its children.');
    }
  }

  updateMaster(ctx: TenantContext, kind: MasterKind, id: string, dto: AnyMasterDto) {
    return this.run(ctx, async (tx, c) => {
      if (kind === 'departments') await this.lock(tx, c, 'departments');
      if (kind === 'cost-centres') await this.lock(tx, c, 'cost-centres');
      const row = await this.masterOr404(tx, c, kind, id);
      let data: Record<string, unknown> = { name: clean(dto.name), code: dto.code ?? row.code };
      if (kind === 'cost-centres') {
        const d = dto as CostCentreDto;
        if (d.legalEntityId !== row.legalEntityId) throw new BadRequestException('A cost centre stays with its legal entity.');
        const parentId = d.parentId === undefined ? row.parentId : d.parentId;
        if (parentId && parentId !== row.parentId) await this.costCentreParent(tx, c, row.legalEntityId!, parentId, id);
        data.parentId = parentId ?? null;
        if (d.ownerUserId !== undefined) {
          await this.activeLogin(tx, c, d.ownerUserId);
          data.ownerUserId = d.ownerUserId;
        }
      } else {
        const own = await this.ownership(tx, c, dto as DepartmentDto, row);
        data = { ...data, ...own, ...this.kindFields(kind, dto) };
        if (kind === 'departments') {
          await this.headOf(tx, c, (dto as DepartmentDto).headEmployeeId, (row as { headEmployeeId?: string | null }).headEmployeeId ?? null, data);
          await this.moveDepartment(tx, c, row as MasterRow & { path: string }, dto as DepartmentDto, own.ownerLegalEntityId, data);
        }
      }
      const updated = await delegate(tx, kind).update({ where: { id }, data });
      const fields = changed(row as unknown as Record<string, unknown>, data);
      if (fields.length) await audit(tx, c, `org.${MASTER_ENTITY[kind]}.updated`, MASTER_ENTITY[kind], id, { fields });
      if (data.headSince !== undefined) await this.auditHead(tx, c, id, (row as { headEmployeeId?: string | null }).headEmployeeId ?? null, data.headEmployeeId as string | null);
      const { path: _p, ...view } = masterView(updated);
      return view;
    });
  }

  /** Re-parenting moves the whole subtree (YX-ORG-03); ownership must still fit parent and children (YX-ORG-15). */
  private async moveDepartment(tx: Tx, c: CompanyContext, row: MasterRow & { path: string }, dto: DepartmentDto, owner: string | null, data: Record<string, unknown>) {
    const parentId = dto.parentId === undefined ? (row.parentId ?? null) : dto.parentId;
    if (dto.isDivision && parentId) throw new BadRequestException('A division is a top-level department (no parent).');
    const parent = parentId ? await this.departmentParent(tx, c, row.id, parentId, owner) : null;
    if (owner) {
      const misfit = await delegate(tx, 'departments').findFirst({ where: { organizationId: c.organizationId, parentId: row.id, NOT: { ownerLegalEntityId: owner } } });
      if (misfit) throw new BadRequestException(`${misfit.name} sits under it and is not owned by the same entity (YX-ORG-15).`);
    }
    data.parentId = parent?.id ?? null;
    const newPath = `${parent?.path ?? '/'}${row.id}/`;
    if (newPath !== row.path) {
      await tx.$executeRaw`
        UPDATE departments SET path = ${newPath} || substr(path, ${row.path.length + 1}::int)
        WHERE organization_id = ${c.organizationId}::uuid AND path LIKE ${`${row.path}%`}`;
    }
  }

  archiveMaster(ctx: TenantContext, kind: MasterKind, id: string, archive: boolean) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.masterOr404(tx, c, kind, id);
      if (Boolean(row.archivedAt) === archive) {
        const { path: _p, ...view } = masterView(row);
        return view;
      }
      if (archive && (kind === 'departments' || kind === 'cost-centres')) {
        const children = await delegate(tx, kind).count({ where: { organizationId: c.organizationId, parentId: id, archivedAt: null } });
        if (children) throw new ConflictException(`Archive or move its ${children} sub-${kind === 'departments' ? 'department' : 'cost centre'}(s) first.`);
      }
      if (!archive) {
        // Restoring needs an active owner / entity and parent.
        const entity = row.legalEntityId ?? row.ownerLegalEntityId;
        if (entity) await this.activeEntity(tx, c, entity);
        if (row.parentId) {
          const parent = await this.masterOr404(tx, c, kind, row.parentId);
          if (parent.archivedAt) throw new ConflictException(`Restore ${parent.name} first.`);
        }
      }
      const updated = await delegate(tx, kind).update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
      await audit(tx, c, `org.${MASTER_ENTITY[kind]}.${archive ? 'archived' : 'restored'}`, MASTER_ENTITY[kind], id, { name: row.name });
      const { path: _p, ...view } = masterView(updated);
      return view;
    });
  }

  deleteMaster(ctx: TenantContext, kind: MasterKind, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.masterOr404(tx, c, kind, id);
      await this.assertNoSettings(tx, c, id);
      await delegate(tx, kind).delete({ where: { id } });
      await audit(tx, c, `org.${MASTER_ENTITY[kind]}.deleted`, MASTER_ENTITY[kind], id, { name: row.name });
    });
  }

  // ================= grade pay ranges (pay data, founder rule R1) =================

  listPayRanges(ctx: TenantContext, gradeId: string, legalEntityId: string | undefined, entities: 'all' | ReadonlySet<string> = 'all') {
    return this.run(ctx, async (tx, c) => {
      await this.masterOr404(tx, c, 'grades', gradeId);
      const reach = entities === 'all' ? {} : { legalEntityId: { in: [...entities] } };
      const rows = await tx.gradePayRange.findMany({
        where: { organizationId: c.organizationId, gradeId, AND: [reach, legalEntityId ? { legalEntityId } : {}] },
        orderBy: [{ legalEntityId: 'asc' }, { currency: 'asc' }, { validFrom: 'asc' }],
      });
      // R1: "Show pay" is recorded.
      await audit(tx, c, 'org.pay_range.viewed', 'grade', gradeId, { legalEntityId: legalEntityId ?? null });
      return rows.map(payRangeView);
    });
  }

  /**
   * A new dated range (P06 §4.3): it closes the open range it follows on the day before it starts. The past
   * is never rewritten (YX-HIS-07): a range starting before today may only fill a gap, never cut a range.
   */
  createPayRange(ctx: TenantContext, gradeId: string, dto: PayRangeDto) {
    checkAmounts(dto);
    if (dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException('The end date is before the start date.');
    const currency = dto.currency ?? 'INR';
    if (!isCurrency(currency)) throw new BadRequestException('Unknown currency');
    return this.run(ctx, async (tx, c) => {
      await this.lock(tx, c, `pay-ranges:${gradeId}`);
      const grade = await this.masterOr404(tx, c, 'grades', gradeId);
      if (grade.archivedAt) throw new BadRequestException(`${grade.name} is archived.`);
      await this.activeEntity(tx, c, dto.legalEntityId);
      // YX-ORG-15: only a grade the entity may use.
      if ((grade.ownerLegalEntityId && grade.ownerLegalEntityId !== dto.legalEntityId) || (!grade.ownerLegalEntityId && grade.appliesToEntities?.length && !grade.appliesToEntities.includes(dto.legalEntityId))) {
        throw new BadRequestException(`${grade.name} is not available to that legal entity (YX-ORG-15).`);
      }
      const key = { organizationId: c.organizationId, gradeId, legalEntityId: dto.legalEntityId, currency };
      const open = await tx.gradePayRange.findFirst({ where: { ...key, validTo: null, validFrom: { lt: asDate(dto.validFrom) } } });
      if (open && !dto.validTo) {
        if (dto.validFrom < todayIst()) throw new ConflictException('A range in force cannot be cut in the past. Start the new range today or later (YX-HIS-07).');
        await tx.gradePayRange.update({ where: { id: open.id }, data: { validTo: asDate(addDays(dto.validFrom, -1)) } });
      }
      const row = await tx.gradePayRange.create({
        data: { ...key, min: dto.min, mid: dto.mid, max: dto.max, validFrom: asDate(dto.validFrom), validTo: dto.validTo ? asDate(dto.validTo) : null, createdBy: c.userId },
      });
      await audit(tx, c, 'org.pay_range.created', 'grade', gradeId, { payRangeId: row.id, legalEntityId: dto.legalEntityId, currency, validFrom: dto.validFrom, validTo: dto.validTo ?? null, closed: open && !dto.validTo ? open.id : null });
      return payRangeView(row);
    });
  }

  /** Only a range not yet in force may change (P06 Q7); one in force or past is kept as it was. */
  private async futureRange(tx: Tx, c: CompanyContext, id: string): Promise<PayRangeRow> {
    const row = await tx.gradePayRange.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException('Pay range not found');
    if (isoDate(row.validFrom) <= todayIst()) throw new ConflictException('This range is already in force. Add a new range from a later date instead (YX-HIS-07).');
    return row;
  }

  updatePayRange(ctx: TenantContext, id: string, dto: PayRangeAmountsDto) {
    checkAmounts(dto);
    return this.run(ctx, async (tx, c) => {
      const row = await this.futureRange(tx, c, id);
      const updated = await tx.gradePayRange.update({ where: { id }, data: { min: dto.min, mid: dto.mid, max: dto.max } });
      await audit(tx, c, 'org.pay_range.updated', 'grade', row.gradeId, { payRangeId: id });
      return payRangeView(updated);
    });
  }

  deletePayRange(ctx: TenantContext, id: string) {
    return this.run(ctx, async (tx, c) => {
      const row = await this.futureRange(tx, c, id);
      await this.lock(tx, c, `pay-ranges:${row.gradeId}`);
      await tx.gradePayRange.delete({ where: { id } });
      // The range it had closed runs on again.
      const before = await tx.gradePayRange.findFirst({
        where: { organizationId: c.organizationId, gradeId: row.gradeId, legalEntityId: row.legalEntityId, currency: row.currency, validTo: asDate(addDays(isoDate(row.validFrom), -1)) },
      });
      if (before) await tx.gradePayRange.update({ where: { id: before.id }, data: { validTo: row.validTo } });
      await audit(tx, c, 'org.pay_range.deleted', 'grade', row.gradeId, { payRangeId: id, reopened: before?.id ?? null });
    });
  }
}

function checkAmounts(dto: PayRangeAmountsDto): void {
  if (!(dto.min <= dto.mid && dto.mid <= dto.max)) throw new BadRequestException('Minimum ≤ midpoint ≤ maximum.');
}
