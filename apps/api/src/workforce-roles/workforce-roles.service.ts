import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, type ScopeUser } from '../access/scope';
import { e164 } from '../people/persons';
import { reachOf, reaches, reachWhere, type Reach } from './reach';
import { ContractComplianceService, type IdentifierInput } from './contract-compliance.service';

// Contract workers (CLB-01 contractors and licences, CLB-02 deployments) and placements (HIR-17), founder decision
// 21 Oct 2026. Each worker and each placed person is one person record with a role (person_roles), so the Directory
// counts persons, and history follows them. Keys: clra.worker.view / manage (company, legal entity or site) and
// staffing.placement.view / manage (company or legal entity). Never in a support session (RLS) or while acting for
// someone else.

const KEYS = ['clra.worker.view', 'clra.worker.manage', 'staffing.placement.view', 'staffing.placement.manage'] as const;
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ageOn = (dob: string, on: string) => {
  const [y, m, d] = dob.split('-').map(Number);
  const [Y, M, Dd] = on.split('-').map(Number);
  return Y - y - (M < m || (M === m && Dd < d) ? 1 : 0);
};
const plus = (on: string, days: number) => new Date(D(on).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const SKILL = ['unskilled', 'semi_skilled', 'skilled'] as const;

export interface PersonInput {
  personId?: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
  email?: string;
}

export interface LicenceInput {
  licenceNo: string;
  locationId: string;
  states: string[];
  maxWorkers: number;
  validFrom: string;
  validTo: string;
}

@Injectable()
export class WorkforceRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly compliance: ContractComplianceService,
  ) {}

  private async reach(user: ScopeUser, key: (typeof KEYS)[number]) {
    return reachOf(await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]), key);
  }

  private async need(user: ScopeUser, key: (typeof KEYS)[number]): Promise<Reach> {
    const r = await this.reach(user, key);
    if (!r) throw new ForbiddenException('You do not have access to this.');
    return r;
  }

  /**
   * The person a worker or placement belongs to: one HR names, or a new one. An email or phone that already belongs to a
   * person is never linked silently (YX-ORG-27): the caller is asked to confirm by naming that person.
   */
  private async person(tx: Tx, c: CompanyContext, p: PersonInput): Promise<string> {
    const org = c.organizationId;
    if (p.personId) {
      const found = await tx.person.findFirst({ where: { organizationId: org, id: p.personId, status: 'active' }, select: { id: true } });
      if (!found) throw new BadRequestException('No such person in this company.');
      return found.id;
    }
    if (!p.givenName?.trim()) throw new BadRequestException('Give the person’s name.');
    const phone = p.phone ? e164(p.phone) : null;
    const email = p.email?.trim() || null;
    const keys = [...(email ? [{ primaryEmail: email }] : []), ...(phone ? [{ primaryPhone: phone }] : [])];
    const matches = keys.length ? await tx.person.findMany({ where: { organizationId: org, status: 'active', OR: keys }, select: { id: true } }) : [];
    if (matches.length)
      throw new ConflictException({ statusCode: 409, code: 'POSSIBLE_SAME_PERSON', message: 'That phone or email already belongs to a person in this company. Check it is the same person and choose them.', personIds: matches.map((m) => m.id) });
    return (await tx.person.create({ data: { organizationId: org, givenName: p.givenName.trim(), familyName: p.familyName?.trim() || null, primaryEmail: email, primaryPhone: phone, createdBy: c.userId ?? null } })).id;
  }

  private async endRole(tx: Tx, org: string, table: string, id: string, on: string) {
    await tx.personRole.updateMany({ where: { organizationId: org, sourceTable: table, sourceId: id, endOn: null }, data: { endOn: D(on) } });
  }

  // ------------------------------------------------------------------------------------------ contractors (CLB-01)

  async contractors(ctx: TenantContext, user: ScopeUser, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const licences = await tx.contractorLicence.findMany({ where: { organizationId: org }, orderBy: { validTo: 'desc' } });
      const all = await tx.contractor.findMany({ where: { organizationId: org, ...(legalEntityId ? { legalEntityId } : {}) }, orderBy: { name: 'asc' } });
      // A site-scoped person sees the contractors licensed for their sites.
      const seen = all.filter((k) => reaches(r, k.legalEntityId) || licences.some((l) => l.contractorId === k.id && r.locations.includes(l.locationId)));
      const active = await tx.contractDeployment.groupBy({ by: ['licenceId'], where: { organizationId: org, status: { not: 'released' } }, _count: true });
      const sites = new Map((await tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true, state: true } })).map((l) => [l.id, l]));
      return seen.map((k) => ({
        id: k.id,
        legalEntityId: k.legalEntityId,
        name: k.name,
        work: k.work,
        pan: k.pan,
        contact: k.contact,
        status: k.status,
        licences: licences
          .filter((l) => l.contractorId === k.id)
          .map((l) => ({ id: l.id, licenceNo: l.licenceNo, locationId: l.locationId, site: sites.get(l.locationId)?.name ?? '', states: l.states, maxWorkers: l.maxWorkers, active: active.find((a) => a.licenceId === l.id)?._count ?? 0, validFrom: iso(l.validFrom), validTo: iso(l.validTo) })),
      }));
    });
  }

  async createContractor(ctx: TenantContext, user: ScopeUser, dto: { legalEntityId: string; name: string; work: string; pan?: string; contact?: string; licence: LicenceInput }) {
    const r = await this.need(user, 'clra.worker.manage');
    if (!reaches(r, dto.legalEntityId, dto.licence.locationId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.site(tx, c.organizationId, dto.legalEntityId, dto.licence.locationId);
      if (dto.pan && (await tx.contractor.findFirst({ where: { organizationId: c.organizationId, pan: dto.pan } }))) throw new ConflictException('A contractor with this PAN is already on the register.');
      const k = await tx.contractor.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, name: dto.name.trim(), work: dto.work.trim(), pan: dto.pan || null, contact: dto.contact?.trim() || null, createdBy: c.userId ?? null } });
      await this.licence(tx, c, k.id, dto.licence);
      await audit(tx, c, 'clra.contractor.added', 'contractor', k.id, { name: k.name, legalEntityId: k.legalEntityId });
      return { id: k.id };
    });
  }

  async addLicence(ctx: TenantContext, user: ScopeUser, contractorId: string, dto: LicenceInput) {
    const r = await this.need(user, 'clra.worker.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: contractorId } });
      if (!k || !reaches(r, k.legalEntityId, dto.locationId)) throw new NotFoundException('Not found');
      await this.site(tx, c.organizationId, k.legalEntityId, dto.locationId);
      return { id: await this.licence(tx, c, k.id, dto) };
    });
  }

  /** The site must belong to the contractor's legal entity (the principal employer). */
  private async site(tx: Tx, org: string, legalEntityId: string, locationId: string) {
    const site = await tx.location.findFirst({ where: { organizationId: org, id: locationId, legalEntityId } });
    if (!site) throw new BadRequestException('Choose a site of this legal entity.');
    return site;
  }

  private async licence(tx: Tx, c: CompanyContext, contractorId: string, l: LicenceInput) {
    if (l.validTo < l.validFrom) throw new BadRequestException('The licence ends before it starts.');
    if (await tx.contractorLicence.findFirst({ where: { organizationId: c.organizationId, licenceNo: l.licenceNo } })) throw new ConflictException('This licence number is already on the register.');
    const row = await tx.contractorLicence.create({ data: { organizationId: c.organizationId, contractorId, licenceNo: l.licenceNo.trim(), locationId: l.locationId, states: [...new Set(l.states)], maxWorkers: l.maxWorkers, validFrom: D(l.validFrom), validTo: D(l.validTo), createdBy: c.userId ?? null } });
    await audit(tx, c, 'clra.licence.added', 'contractor_licence', row.id, { contractorId, licenceNo: row.licenceNo, maxWorkers: row.maxWorkers, validTo: l.validTo });
    return row.id;
  }

  // ------------------------------------------------------------------------------------------ contract workers (CLB-02)

  async workers(ctx: TenantContext, user: ScopeUser, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.workerRows(tx, c.organizationId, r, legalEntityId, false));
  }

  /** Workers in reach; for the Directory only those on site (deployed). */
  async workerRows(tx: Tx, org: string, r: Reach, legalEntityId: string | null, openOnly: boolean) {
    const rows = await tx.contractDeployment.findMany({
      where: { organizationId: org, ...reachWhere(r), ...(legalEntityId ? { legalEntityId } : {}), ...(openOnly ? { status: 'deployed' } : {}) },
      orderBy: { fromOn: 'desc' },
      take: 5000,
    });
    const [people, contractors, licences, sites, entities] = await Promise.all([
      tx.person.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true, primaryPhone: true } }),
      tx.contractor.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.contractorId) } }, select: { id: true, name: true } }),
      tx.contractorLicence.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.licenceId) } }, select: { id: true, licenceNo: true } }),
      tx.location.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.locationId) } }, select: { id: true, name: true } }),
      tx.legalEntity.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.legalEntityId) } }, select: { id: true, name: true } }),
    ]);
    return rows.map((w) => {
      const p = people.find((x) => x.id === w.personId);
      return {
        id: w.id,
        personId: w.personId,
        name: p ? p.preferredName || [p.givenName, p.familyName].filter(Boolean).join(' ') : '',
        phone: p?.primaryPhone ?? null,
        contractorId: w.contractorId,
        contractor: contractors.find((x) => x.id === w.contractorId)?.name ?? '',
        licenceNo: licences.find((x) => x.id === w.licenceId)?.licenceNo ?? '',
        legalEntity: { id: w.legalEntityId, name: entities.find((x) => x.id === w.legalEntityId)?.name ?? null },
        site: { id: w.locationId, name: sites.find((x) => x.id === w.locationId)?.name ?? null },
        work: w.work,
        skill: w.skill,
        wage: w.wage?.toFixed(2) ?? null,
        fromOn: iso(w.fromOn)!,
        toOn: iso(w.toOn),
        status: w.status,
        // Confidential identifiers: the last four only (the full value through the audited reveal).
        aadhaarLast4: w.aadhaarLast4,
        uanLast4: w.uanLast4,
        esicLast4: w.esicLast4,
        gatePass: w.gatePass,
        gatePassValidTo: iso(w.gatePassValidTo),
      };
    });
  }

  /** CLB-02 deployment checks: age 18 or over, a licence valid on the date, covering the site's state, within its maximum. */
  async deploy(ctx: TenantContext, user: ScopeUser, dto: PersonInput & IdentifierInput & { contractorId: string; licenceId: string; locationId: string; dateOfBirth: string; work: string; skill: (typeof SKILL)[number]; wage?: string; fromOn: string }) {
    const r = await this.need(user, 'clra.worker.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await tx.contractor.findFirst({ where: { organizationId: org, id: dto.contractorId } });
      if (!k || !reaches(r, k.legalEntityId, dto.locationId)) throw new NotFoundException('Not found');
      const site = await this.site(tx, org, k.legalEntityId, dto.locationId);
      // Counted under a lock so two deployments at once cannot pass the maximum together.
      await tx.$queryRaw`SELECT id FROM contractor_licences WHERE organization_id = ${org}::uuid AND id = ${dto.licenceId}::uuid FOR UPDATE`;
      const lic = await tx.contractorLicence.findFirst({ where: { organizationId: org, id: dto.licenceId, contractorId: k.id } });
      if (!lic) throw new BadRequestException('Choose a licence of this contractor.');
      const active = await tx.contractDeployment.count({ where: { organizationId: org, licenceId: lic.id, status: { not: 'released' } } });
      const blocks: string[] = [];
      if (ageOn(dto.dateOfBirth, dto.fromOn) < 18) blocks.push('The worker is under 18. Deployment is not allowed.');
      if (dto.fromOn < iso(lic.validFrom)! || dto.fromOn > iso(lic.validTo)!) blocks.push(`Licence ${lic.licenceNo} is not valid on the deployment date.`);
      if (!lic.states.includes(site.state)) blocks.push(`Licence ${lic.licenceNo} does not cover the site's state.`);
      if (active + 1 > lic.maxWorkers) blocks.push(`Licence ${lic.licenceNo} allows ${lic.maxWorkers} workers; ${active} are already deployed.`);
      if (blocks.length) throw new BadRequestException({ statusCode: 400, code: 'DEPLOYMENT_BLOCKED', message: blocks.join(' '), blocks });
      const personId = await this.person(tx, c, dto);
      if (await tx.contractDeployment.findFirst({ where: { organizationId: org, personId, status: { not: 'released' } } })) throw new ConflictException('This person is already deployed by a contractor.');
      const w = await tx.contractDeployment.create({
        data: { organizationId: org, legalEntityId: k.legalEntityId, contractorId: k.id, licenceId: lic.id, personId, locationId: site.id, work: dto.work.trim(), skill: dto.skill, wage: dto.wage ? new Prisma.Decimal(dto.wage) : null, dateOfBirth: D(dto.dateOfBirth), fromOn: D(dto.fromOn), createdBy: c.userId ?? null },
      });
      // Aadhaar, UAN and ESI sealed (Confidential), gate pass; the same Aadhaar is never deployed twice at once.
      const ids = await this.compliance.identifierData(tx, c, w.id, dto);
      if (Object.keys(ids).length) await tx.contractDeployment.update({ where: { id: w.id }, data: ids });
      await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: w.id, startOn: D(dto.fromOn) } });
      await audit(tx, c, 'clra.worker.deployed', 'contract_deployment', w.id, { contractorId: k.id, licenceId: lic.id, locationId: site.id, fromOn: dto.fromOn });
      return { id: w.id, personId, status: w.status };
    });
  }

  /** Site approval of a deployment, or its release (the role on the person record ends). */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, action: 'approve' | 'release') {
    const r = await this.need(user, 'clra.worker.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const w = await tx.contractDeployment.findFirst({ where: { organizationId: org, id } });
      if (!w || !reaches(r, w.legalEntityId, w.locationId)) throw new NotFoundException('Not found');
      if (action === 'approve') {
        if (w.status !== 'pending') throw new ConflictException('Only a deployment waiting for approval can be approved.');
        await tx.contractDeployment.update({ where: { id }, data: { status: 'deployed', decidedBy: c.userId ?? null } });
      } else {
        if (w.status === 'released') throw new ConflictException('This worker is already released.');
        const on = todayIst() < iso(w.fromOn)! ? iso(w.fromOn)! : todayIst();
        await tx.contractDeployment.update({ where: { id }, data: { status: 'released', toOn: D(on), decidedBy: c.userId ?? null } });
        await this.endRole(tx, org, 'contract_deployments', id, on);
      }
      await audit(tx, c, action === 'approve' ? 'clra.worker.approved' : 'clra.worker.released', 'contract_deployment', id, {});
      return { id, status: action === 'approve' ? 'deployed' : 'released' };
    });
  }

  // ------------------------------------------------------------------------------------------ placements (HIR-17)

  async placements(ctx: TenantContext, user: ScopeUser, legalEntityId: string | null) {
    const r = await this.need(user, 'staffing.placement.view');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.placementRows(tx, c.organizationId, r, legalEntityId, false));
  }

  /** Placements in reach (company or legal entity; a site scope does not reach a client's site); open ones for the Directory. */
  async placementRows(tx: Tx, org: string, r: Reach, legalEntityId: string | null, openOnly: boolean) {
    const rows = await tx.placement.findMany({ where: { organizationId: org, AND: [r.all ? {} : { legalEntityId: { in: r.entities } }, legalEntityId ? { legalEntityId } : {}], ...(openOnly ? { status: 'active' } : {}) }, orderBy: { startOn: 'desc' }, take: 5000 });
    const [people, entities] = await Promise.all([
      tx.person.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true, primaryEmail: true, primaryPhone: true } }),
      tx.legalEntity.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.legalEntityId) } }, select: { id: true, name: true } }),
    ]);
    const today = todayIst();
    return rows.map((x) => {
      const p = people.find((y) => y.id === x.personId);
      const end = iso(x.endOn)!;
      return {
        id: x.id,
        personId: x.personId,
        name: p ? p.preferredName || [p.givenName, p.familyName].filter(Boolean).join(' ') : '',
        email: p?.primaryEmail ?? null,
        phone: p?.primaryPhone ?? null,
        legalEntity: { id: x.legalEntityId, name: entities.find((e) => e.id === x.legalEntityId)?.name ?? null },
        client: x.client,
        role: x.role,
        startOn: iso(x.startOn)!,
        endOn: end,
        billRate: x.billRate.toFixed(2),
        payRate: x.payRate.toFixed(2),
        statutoryPerHour: x.statutoryPerHour.toFixed(2),
        supply: x.supply,
        vendor: x.vendor,
        // Ending soon: the client's end date is within 30 days.
        status: x.status === 'ended' ? 'ended' : end <= plus(today, 30) ? 'ending_soon' : 'active',
        endedOn: iso(x.endedOn),
      };
    });
  }

  async createPlacement(ctx: TenantContext, user: ScopeUser, dto: PersonInput & { legalEntityId: string; client: string; role: string; startOn: string; endOn: string; billRate: string; payRate: string; statutoryPerHour?: string; supply: 'own' | 'vendor'; vendor?: string }) {
    const r = await this.need(user, 'staffing.placement.manage');
    if (!reaches(r, dto.legalEntityId)) throw new NotFoundException('Not found');
    if (dto.endOn < dto.startOn) throw new BadRequestException('The placement ends before it starts.');
    if ((dto.supply === 'vendor') !== Boolean(dto.vendor?.trim())) throw new BadRequestException(dto.supply === 'vendor' ? 'Name the vendor who supplies this person.' : 'A vendor is named only for a vendor-supplied placement.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId } }))) throw new NotFoundException('Not found');
      const personId = await this.person(tx, c, dto);
      if (await tx.placement.findFirst({ where: { organizationId: org, personId, status: 'active' } })) throw new ConflictException('This person already has an active placement.');
      const x = await tx.placement.create({
        data: { organizationId: org, legalEntityId: dto.legalEntityId, personId, client: dto.client.trim(), role: dto.role.trim(), startOn: D(dto.startOn), endOn: D(dto.endOn), billRate: new Prisma.Decimal(dto.billRate), payRate: new Prisma.Decimal(dto.payRate), statutoryPerHour: new Prisma.Decimal(dto.statutoryPerHour || '0'), supply: dto.supply, vendor: dto.supply === 'vendor' ? dto.vendor!.trim() : null, createdBy: c.userId ?? null },
      });
      await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'placement', sourceTable: 'placements', sourceId: x.id, startOn: D(dto.startOn) } });
      await audit(tx, c, 'staffing.placement.created', 'placement', x.id, { client: x.client, legalEntityId: x.legalEntityId, startOn: dto.startOn, endOn: dto.endOn });
      return { id: x.id, personId };
    });
  }

  async endPlacement(ctx: TenantContext, user: ScopeUser, id: string, endedOn: string, reason: string) {
    const r = await this.need(user, 'staffing.placement.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await tx.placement.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x || !reaches(r, x.legalEntityId)) throw new NotFoundException('Not found');
      if (x.status === 'ended') throw new ConflictException('This placement has already ended.');
      if (endedOn < iso(x.startOn)!) throw new BadRequestException('A placement cannot end before it starts.');
      await tx.placement.update({ where: { id }, data: { status: 'ended', endedOn: D(endedOn) } });
      await this.endRole(tx, c.organizationId, 'placements', id, endedOn);
      await audit(tx, c, 'staffing.placement.ended', 'placement', id, { endedOn, reason });
      return { id, status: 'ended' };
    });
  }

  /** For the Directory: the reach of each key for this person (null = none). */
  async directoryReach(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
    return { workers: reachOf(v, 'clra.worker.view'), placements: reachOf(v, 'staffing.placement.view') };
  }
}
