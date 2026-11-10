import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { toPaise, toRupees } from '../staffing/staffing-rules';
import { ContractLabourService } from './contract-labour.service';
import { gateValidTo, monthsLater, workerChecks, type LicenceLike, type WorkerCheck } from './clra-rules';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { FilesService } from '../documents/files.service';
import type { ApproveWorkerDto, ReleaseWorkerDto, WorkerDto } from './clra-dto';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const ANY_ENTITY = { legalEntityId: '' };
const NOT_FOUND = 'Contract worker not found.';
const SKILL: Record<string, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };

/**
 * Contract labour CL-2 (answers 624, 632, 633, 635, 636; CLB-02). A contract worker is a person (persons) with the
 * contract_worker role, sourced from a deployment: a contractor's worker at one of our sites. Never an employee, never on
 * our payroll, no login. Every deployment is checked on the server on its first day (workerChecks: age, licence, licence
 * maximum, the same ID not already deployed; the registration threshold warns) and blocked with the reasons, no
 * override. Only the last 4 Aadhaar digits and a keyed hash are kept, never the number; the hash finds the same person
 * again, so history follows them. A deployment waits for site approval; approval needs the site safety induction
 * (settings clra.induction_required, default on, and clra.induction_months, default 12) and issues the gate pass: a
 * number and the day it ends (the deployment, the licence or the induction, whichever is first). Same keys and rules as
 * the contractors register: reads with clra.contractor.view, changes with clra.contractor.manage, never while acting
 * for someone else (403), another company's records not found (404); every change audited.
 */
@Injectable()
export class WorkersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly clra: ContractLabourService,
    private readonly files: FilesService,
  ) {}

  private async policy(tx: Tx, c: CompanyContext) {
    const required = (await settingFor(tx, c, 'clra.induction_required', ANY_ENTITY)) === 'on';
    return { inductionRequired: required, inductionMonths: Number(await settingFor(tx, c, 'clra.induction_months', ANY_ENTITY)) };
  }

  async list(ctx: TenantContext, user: ScopeUser) {
    const a = await this.clra.gate(user, 'view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.contractDeployment.findMany({ where: { organizationId: org }, orderBy: [{ fromOn: 'desc' }, { createdAt: 'desc' }], take: 2000 });
      const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.personId))] } }, select: { id: true, givenName: true, familyName: true } });
      const agencies = await tx.agency.findMany({ where: { organizationId: org, OR: [{ contractLabour: true }, { id: { in: rows.map((r) => r.agencyId) } }] }, select: { id: true, name: true, active: true, contractLabour: true }, orderBy: { name: 'asc' } });
      const locations = await tx.location.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' }, select: { id: true, name: true, state: true, archivedAt: true } });
      const pins = new Set((await tx.contractKioskPin.findMany({ where: { organizationId: org, deploymentId: { in: rows.map((r) => r.id) } }, select: { deploymentId: true } })).map((x) => x.deploymentId));
      const name = (p?: { givenName: string; familyName: string | null }) => (p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : 'Unknown');
      return {
        canManage: a.manage && !a.actingForOther,
        today: todayIst(),
        ...(await this.policy(tx, c)),
        contractors: agencies.filter((x) => x.contractLabour && x.active).map((x) => ({ id: x.id, name: x.name })),
        locations: locations.filter((l) => !l.archivedAt).map((l) => ({ id: l.id, name: l.name, state: l.state })),
        workers: rows.map((r) => ({
          id: r.id,
          personId: r.personId,
          name: name(persons.find((p) => p.id === r.personId)),
          contractor: { id: r.agencyId, name: agencies.find((x) => x.id === r.agencyId)?.name ?? 'Contractor' },
          site: { id: r.locationId, name: locations.find((x) => x.id === r.locationId)?.name ?? 'Archived location' },
          skill: SKILL[r.skill] ?? r.skill,
          wage: r.wagePaise !== null ? toRupees(r.wagePaise) : null,
          fromOn: iso(r.fromOn),
          toOn: r.toOn ? iso(r.toOn) : null,
          status: r.status,
          gatePass: r.gatePassNo,
          gateValidTo: r.gateValidTo ? iso(r.gateValidTo) : null,
          induction: r.inductionOn ? { on: iso(r.inductionOn), by: r.inductionBy } : null,
          uan: r.uan,
          esicIp: r.esicIp,
          idMasked: `XXXX XXXX ${r.idLast4}`,
          releasedOn: r.releasedOn ? iso(r.releasedOn) : null,
          releaseReason: r.releaseReason,
          photo: Boolean(r.photoFileId),
          kioskPin: pins.has(r.id),
          version: r.version,
        })),
      };
    });
  }

  private hash(org: string, aadhaar: string) {
    return this.crypto.hmac('clra.aadhaar', `${org}:${aadhaar}`);
  }

  /** The checks for a worker at a site on a day (no write). */
  private async checksFor(tx: Tx, c: CompanyContext, i: { contractorId: string; locationId: string; on: string; dob: string; idHash: string | null; exceptId?: string }) {
    const org = c.organizationId;
    const contractor = await tx.agency.findFirst({ where: { id: i.contractorId, organizationId: org, contractLabour: true }, select: { id: true, active: true } });
    if (!contractor) throw new NotFoundException('Contractor not found.');
    if (!contractor.active) throw new BadRequestException('This contractor is inactive.');
    const loc = await tx.location.findFirst({ where: { id: i.locationId, organizationId: org, archivedAt: null }, select: { id: true, name: true, state: true, code: true } });
    if (!loc) throw new NotFoundException('Site not found.');
    const licences = (await tx.contractorLicence.findMany({ where: { organizationId: org, agencyId: contractor.id } })).map(
      (l): LicenceLike & { maxWorkers: number } => ({ id: l.id, locationId: l.locationId, states: l.states, validFrom: iso(l.validFrom), validTo: iso(l.validTo), status: l.status as LicenceLike['status'], renewalOfId: l.renewalOfId, maxWorkers: l.maxWorkers }),
    );
    const inForce = licences.filter((l) => l.status === 'verified' && l.locationId === loc.id && l.validFrom <= i.on && i.on <= l.validTo).sort((x, y) => (x.validTo < y.validTo ? 1 : -1))[0] ?? null;
    const active = { organizationId: org, status: { in: ['pending', 'deployed'] }, ...(i.exceptId ? { id: { not: i.exceptId } } : {}) };
    const activeUnderLicence = await tx.contractDeployment.count({ where: { ...active, agencyId: contractor.id, locationId: loc.id } });
    const activeAtSite = await tx.contractDeployment.count({ where: { ...active, locationId: loc.id } });
    const dup = i.idHash ? await tx.contractDeployment.findFirst({ where: { ...active, idHash: i.idHash }, select: { locationId: true } }) : null;
    const dupAt = dup ? ((await tx.location.findFirst({ where: { id: dup.locationId, organizationId: org }, select: { name: true } }))?.name ?? 'another site') : null;
    const rule = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.CLRA', jurisdiction: loc.state, status: 'published', validFrom: { lte: day(i.on) }, OR: [{ validTo: null }, { validTo: { gte: day(i.on) } }] }, orderBy: { validFrom: 'desc' } });
    const law = rule?.values as { registrationThreshold?: number; minAge?: number } | undefined;
    // Answer 675: the contractor's work order covering this site on the day (the latest one when several do).
    const wo = await tx.contractorWorkOrder.findFirst({ where: { organizationId: org, agencyId: contractor.id, locationIds: { has: loc.id }, fromOn: { lte: day(i.on) }, toOn: { gte: day(i.on) } }, orderBy: { fromOn: 'desc' } });
    const woActive = wo ? await tx.contractDeployment.count({ where: { ...active, agencyId: contractor.id, locationId: { in: wo.locationIds } } }) : 0;
    const checks = workerChecks({
      dob: i.dob,
      on: i.on,
      // The law's minimum (18) when the state has no rule set yet: never younger.
      minAge: Math.max(18, law?.minAge ?? 18),
      licences,
      site: { locationId: loc.id, state: loc.state, name: loc.name },
      licenceMax: inForce?.maxWorkers ?? null,
      activeUnderLicence,
      activeAtSite,
      threshold: law?.registrationThreshold ?? null,
      // Answers 673 / 681: the site's registration (in force on the day) lifts the threshold block up to its maximum.
      registration: await tx.clraRegistration.findFirst({ where: { organizationId: org, locationId: loc.id, removedAt: null, OR: [{ validTo: null }, { validTo: { gte: day(i.on) } }] }, select: { maxWorkers: true } }),
      warnPct: Number(await settingFor(tx, c, 'clra.threshold_warn', ANY_ENTITY)),
      duplicateAt: dupAt,
      workOrder: wo ? { number: wo.number, headcount: wo.headcount, active: woActive } : null,
    });
    return { checks, loc, licence: inForce };
  }

  private refuse(checks: WorkerCheck[]) {
    const fails = checks.filter((x) => x.status === 'fail');
    if (fails.length) throw new BadRequestException({ statusCode: 400, code: 'DEPLOYMENT_BLOCKED', message: `This worker can't be deployed. ${fails.map((f) => f.detail ?? f.label).join(' ')}`, checks });
  }

  private input(dto: WorkerDto) {
    if (dto.toOn && dto.toOn < dto.fromOn) throw new BadRequestException('The deployment ends before it starts.');
    if (dto.dob >= dto.fromOn) throw new BadRequestException('Check the date of birth.');
    const wage = dto.wage ? toPaise(dto.wage) : null;
    if (dto.wage && (wage === null || wage <= 0n)) throw new BadRequestException('Enter the wage in rupees.');
    return wage;
  }

  /** The drawer's checks before sending (no write). */
  async check(ctx: TenantContext, user: ScopeUser, dto: WorkerDto) {
    await this.clra.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.checkIn(tx, c, dto));
  }

  /** The checks inside a caller's transaction (the contractor portal, CL-3, uses it with its own contractor). */
  async checkIn(tx: Tx, c: CompanyContext, dto: WorkerDto) {
    this.input(dto);
    return { checks: (await this.checksFor(tx, c, { contractorId: dto.contractorId, locationId: dto.locationId, on: dto.fromOn, dob: dto.dob, idHash: this.hash(c.organizationId, dto.aadhaar) })).checks };
  }

  /** Send a worker for site approval: every check passes or nothing is written; the same ID keeps the same person. */
  async create(ctx: TenantContext, user: ScopeUser, dto: WorkerDto) {
    await this.clra.gate(user, 'manage');
    this.input(dto);
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.sendIn(tx, c, dto, null));
  }

  /** Send inside a caller's transaction; `portalContactId` when a contractor's contact sends it (CL-3). */
  async sendIn(tx: Tx, c: CompanyContext, dto: WorkerDto, portalContactId: string | null) {
    const wage = this.input(dto);
    {
      const org = c.organizationId;
      const idHash = this.hash(org, dto.aadhaar);
      // One deployment at a time per ID: two sends of the same worker never both pass the duplicate check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clra-worker:${org}:${idHash}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clra-site:${org}:${dto.locationId}`}))`;
      const { checks } = await this.checksFor(tx, c, { contractorId: dto.contractorId, locationId: dto.locationId, on: dto.fromOn, dob: dto.dob, idHash });
      this.refuse(checks);
      const before = await tx.contractDeployment.findFirst({ where: { organizationId: org, idHash }, orderBy: { createdAt: 'desc' }, select: { personId: true } });
      const personId = before?.personId ?? (await tx.person.create({ data: { organizationId: org, givenName: dto.givenName, familyName: dto.familyName || null, createdBy: c.userId ?? null } })).id;
      const row = await tx.contractDeployment.create({
        data: { organizationId: org, personId, agencyId: dto.contractorId, locationId: dto.locationId, skill: dto.skill, wagePaise: wage, dob: day(dto.dob), idLast4: dto.aadhaar.slice(-4), idHash, uan: dto.uan || null, esicIp: dto.esicIp || null, fromOn: day(dto.fromOn), toOn: dto.toOn ? day(dto.toOn) : null, createdBy: c.userId ?? null },
      });
      await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: row.id, startOn: day(dto.fromOn), endOn: dto.toOn ? day(dto.toOn) : null } });
      await audit(tx, c, 'clra.worker.sent', 'contract_deployment', row.id, { personId, samePerson: Boolean(before), contractorId: dto.contractorId, locationId: dto.locationId, fromOn: dto.fromOn, warnings: checks.filter((x) => x.status === 'warn').map((x) => x.id), ...(portalContactId ? { via: 'contractor_portal', contactId: portalContactId } : {}) });
      return { id: row.id, personId, checks };
    }
  }

  private async deployment(tx: Tx, c: CompanyContext, id: string, version: number) {
    const row = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.version !== version) throw new ConflictException('Someone else changed this worker just now. Reload the page.');
    return row;
  }

  /**
   * Site approval: the checks again on the first day (or today, if later), the safety induction recorded within its
   * months, and the gate pass issued: GP-<site code>-<number>, ending first of deployment, licence and induction.
   */
  async approve(ctx: TenantContext, user: ScopeUser, id: string, dto: ApproveWorkerDto) {
    await this.clra.gate(user, 'manage');
    const today = todayIst();
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const row = await this.deployment(tx, c, id, dto.version);
      if (row.status !== 'pending') throw new ConflictException('Only a worker waiting for site approval can be approved.');
      const p = await this.policy(tx, c);
      const on = iso(row.fromOn) > today ? iso(row.fromOn) : today;
      if (row.toOn && iso(row.toOn) < today) throw new BadRequestException('This deployment has already ended. Release it instead.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clra-site:${org}:${row.locationId}`}))`;
      const { checks, loc, licence } = await this.checksFor(tx, c, { contractorId: row.agencyId, locationId: row.locationId, on, dob: iso(row.dob), idHash: row.idHash, exceptId: row.id });
      this.refuse(checks);
      // Answer 754: a photo the contractor sent is checked against the person before the gate pass.
      if (row.photoFileId && !dto.photoChecked) throw new BadRequestException('Check the photo against the person at the site first.');
      const induction = dto.inductionOn ? { on: dto.inductionOn, by: dto.inductionBy?.trim() || null } : null;
      if (p.inductionRequired) {
        if (!induction || !induction.by) throw new BadRequestException('Record the site safety induction (the day and who gave it) before the gate pass.');
        if (induction.on > today) throw new BadRequestException('The safety induction cannot be in the future.');
        if (monthsLater(induction.on, p.inductionMonths) < on) throw new BadRequestException(`The safety induction is older than ${p.inductionMonths} months. Give it again.`);
      } else if (induction && induction.on > today) throw new BadRequestException('The safety induction cannot be in the future.');
      const validTo = gateValidTo({ toOn: row.toOn ? iso(row.toOn) : null, licenceValidTo: licence!.validTo, inductionOn: p.inductionRequired ? induction!.on : null, inductionMonths: p.inductionRequired ? p.inductionMonths : null });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clra-pass:${org}:${loc.id}`}))`;
      const prefix = `GP-${loc.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-`;
      const n = (await tx.contractDeployment.count({ where: { organizationId: org, gatePassNo: { startsWith: prefix } } })) + 1;
      const gatePassNo = `${prefix}${String(n).padStart(4, '0')}`;
      const { count } = await tx.contractDeployment.updateMany({
        where: { id: row.id, organizationId: org, version: row.version, status: 'pending' },
        data: { status: 'deployed', gatePassNo, gateValidTo: day(validTo), inductionOn: induction ? day(induction.on) : null, inductionBy: induction?.by ?? null, approvedBy: c.userId ?? null, approvedAt: new Date(), version: { increment: 1 } },
      });
      if (!count) throw new ConflictException('Someone else changed this worker just now. Reload the page.');
      await audit(tx, c, 'clra.worker.approved', 'contract_deployment', row.id, { gatePassNo, gateValidTo: validTo, inductionOn: induction?.on ?? null });
      return { id: row.id, gatePass: gatePassNo, gateValidTo: validTo };
    });
  }

  /** Answer 736: the contractor withdraws its own worker waiting for approval: ended today, the role too; audited. */
  async withdrawIn(tx: Tx, c: CompanyContext, id: string, agencyId: string, reason: string, contactId: string) {
    const row = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId, agencyId } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status !== 'pending') throw new ConflictException('Only a worker waiting for site approval can be withdrawn. Ask the company to release a deployed worker.');
    const today = todayIst();
    const end = iso(row.fromOn) > today ? iso(row.fromOn) : today;
    const { count } = await tx.contractDeployment.updateMany({ where: { id: row.id, organizationId: c.organizationId, status: 'pending', version: row.version }, data: { status: 'released', releasedOn: day(end), releaseReason: reason, toOn: day(end), version: { increment: 1 } } });
    if (!count) throw new ConflictException('This worker changed just now. Reload the page.');
    await tx.personRole.updateMany({ where: { organizationId: c.organizationId, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: row.id }, data: { endOn: day(end) } });
    await audit(tx, c, 'clra.worker.released', 'contract_deployment', row.id, { on: end, reason, wasPending: true, via: 'contractor_portal', contactId });
    return { id: row.id, status: 'released' };
  }

  /** Release (or withdraw before approval): the deployment and the contract_worker role end on the day. */
  async release(ctx: TenantContext, user: ScopeUser, id: string, dto: ReleaseWorkerDto) {
    await this.clra.gate(user, 'manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const row = await this.deployment(tx, c, id, dto.version);
      if (row.status === 'released') throw new ConflictException('This worker was already released.');
      const end = dto.on < iso(row.fromOn) ? iso(row.fromOn) : dto.on;
      if (dto.on > todayIst()) throw new BadRequestException('Release on today or an earlier day. A later end is the deployment’s planned end.');
      if (row.toOn && dto.on > iso(row.toOn)) throw new BadRequestException(`The deployment already ends on ${iso(row.toOn)}.`);
      const gateTo = row.gateValidTo && iso(row.gateValidTo) > end ? day(end) : row.gateValidTo;
      const { count } = await tx.contractDeployment.updateMany({ where: { id: row.id, organizationId: org, version: row.version }, data: { status: 'released', releasedOn: day(end), releaseReason: dto.reason, toOn: day(end), gateValidTo: gateTo, version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone else changed this worker just now. Reload the page.');
      await tx.personRole.updateMany({ where: { organizationId: org, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: row.id }, data: { endOn: day(end) } });
      await audit(tx, c, 'clra.worker.released', 'contract_deployment', row.id, { on: end, reason: dto.reason, wasPending: row.status === 'pending' });
      return { id: row.id, releasedOn: end };
    });
  }

  /**
   * Answer 684: renew a gate pass, keeping its number: the licence in force today (a verified renewal counts) and the
   * induction (recorded again when the old one has run out) set the new end, never past the deployment's last day.
   */
  async renewPass(ctx: TenantContext, user: ScopeUser, id: string, dto: ApproveWorkerDto) {
    await this.clra.gate(user, 'manage');
    const today = todayIst();
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.deployment(tx, c, id, dto.version);
      if (row.status !== 'deployed' || !row.gatePassNo) throw new ConflictException('Only a deployed worker has a gate pass to renew.');
      if (row.toOn && iso(row.toOn) < today) throw new BadRequestException('This deployment has ended.');
      const p = await this.policy(tx, c);
      const { checks, licence } = await this.checksFor(tx, c, { contractorId: row.agencyId, locationId: row.locationId, on: today, dob: iso(row.dob), idHash: row.idHash, exceptId: row.id });
      const lic = checks.find((x) => x.id === 'licence' && x.status === 'fail');
      if (lic || !licence) throw new BadRequestException(`The gate pass cannot be renewed: ${lic?.detail ?? 'no licence in force today'}.`);
      let induction = dto.inductionOn ? { on: dto.inductionOn, by: dto.inductionBy?.trim() || null } : row.inductionOn ? { on: iso(row.inductionOn), by: row.inductionBy } : null;
      if (dto.inductionOn && (!induction?.by || induction.on > today)) throw new BadRequestException('Give the day of the induction (not in the future) and who gave it.');
      if (p.inductionRequired) {
        if (!induction || monthsLater(induction.on, p.inductionMonths) < today) throw new BadRequestException(`The safety induction is older than ${p.inductionMonths} months. Record the new induction.`);
      } else induction = dto.inductionOn ? induction : null;
      const validTo = gateValidTo({ toOn: row.toOn ? iso(row.toOn) : null, licenceValidTo: licence.validTo, inductionOn: p.inductionRequired ? induction!.on : null, inductionMonths: p.inductionRequired ? p.inductionMonths : null });
      if (row.gateValidTo && validTo <= iso(row.gateValidTo)) throw new ConflictException(`The gate pass already runs to ${iso(row.gateValidTo)}; renewing would not extend it. Renew the licence or record a new induction first.`);
      const { count } = await tx.contractDeployment.updateMany({ where: { id: row.id, organizationId: c.organizationId, version: row.version }, data: { gateValidTo: day(validTo), ...(dto.inductionOn ? { inductionOn: day(dto.inductionOn), inductionBy: dto.inductionBy!.trim() } : {}), version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone else changed this worker just now. Reload the page.');
      await audit(tx, c, 'clra.gate_pass.renewed', 'contract_deployment', row.id, { gatePassNo: row.gatePassNo, from: row.gateValidTo ? iso(row.gateValidTo) : null, to: validTo });
      return { id: row.id, gatePass: row.gatePassNo, gateValidTo: validTo };
    });
  }

  /** Answer 735: the worker's photo for the gate pass card (JPG or PNG; replaces the old one). */
  async setPhoto(ctx: TenantContext, user: ScopeUser, id: string, file: { name: string; data: Buffer } | null) {
    await this.clra.gate(user, 'manage');
    if (!file?.data?.length) throw new BadRequestException('Choose a photo (JPG or PNG).');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!row) throw new NotFoundException(NOT_FOUND);
      return this.photoIn(tx, c, row.id, file, null);
    });
    void this.files.scan(out.org, out.fileId).catch(() => undefined);
    return { photo: true };
  }

  /**
   * The one stored photo of a deployment (answers 735, 754): JPG or PNG up to 5 MB, private, virus-scanned before it
   * opens; a new one replaces it. Staff add it on the gate pass card; the contractor when sending the worker (portal).
   */
  async photoIn(tx: Tx, c: CompanyContext, deploymentId: string, file: { name: string; data: Buffer }, contactId: string | null) {
    const f = await this.files.storeIn(tx, c, { area: 'clra-photo', name: file.name.slice(0, 120) || 'photo.jpg', data: file.data, allowedMime: ['image/jpeg', 'image/png'], maxMb: 5, via: contactId ? 'self' : 'staff' });
    await tx.contractDeployment.update({ where: { id: deploymentId }, data: { photoFileId: f.id } });
    await audit(tx, c, 'clra.worker.photo_set', 'contract_deployment', deploymentId, { fileId: f.id, sha256: f.sha256, ...(contactId ? { via: 'contractor_portal', contactId } : {}) });
    return { org: c.organizationId, fileId: f.id };
  }

  /** Answer 754: the contractor adds the photo of its own worker waiting for site approval (another's: 404). */
  async portalPhotoIn(tx: Tx, c: CompanyContext, agencyId: string, contactId: string, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a photo (JPG or PNG).');
    const row = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId, agencyId } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status !== 'pending') throw new ConflictException('Add the photo while the worker waits for site approval. Ask the site to change it later.');
    return this.photoIn(tx, c, row.id, file, contactId);
  }

  async photo(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.clra.gate(user, 'view');
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId }, select: { photoFileId: true } });
      if (!d?.photoFileId) throw new NotFoundException('No photo yet.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: d.photoFileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('The photo is still being checked for viruses, or failed the check.');
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /**
   * Answer 625: the worker's kiosk PIN, shown once to give to the worker with the gate pass. At the site's kiosk the
   * worker enters the gate pass number and this PIN; wrong tries lock it as an employee's PIN does.
   */
  async setKioskPin(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.clra.gate(user, 'manage');
    const pin = String(randomInt(0, 10000)).padStart(4, '0');
    const pinHash = await argon2.hash(pin);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.contractDeployment.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!row) throw new NotFoundException(NOT_FOUND);
      if (row.status !== 'deployed' || !row.gatePassNo) throw new ConflictException('A kiosk PIN goes with the gate pass: approve the worker first.');
      await tx.contractKioskPin.upsert({ where: { deploymentId: row.id }, create: { organizationId: c.organizationId, deploymentId: row.id, pinHash }, update: { pinHash, failed: 0, lockedUntil: null, setAt: new Date() } });
      await audit(tx, c, 'clra.kiosk_pin.set', 'contract_deployment', row.id, {});
    });
    return { pin };
  }
}

