import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { JoinersService } from './joiners.service';
import { LifecycleJourneysService } from './journeys.service';

// Contract labour CL-7 (CLB-05, founder answer 637): a contract worker becomes an employee through the PPL-12 joiner flow.
// HR with the onboarding key starts it from the worker's deployment: the joiner (source "contract_worker") is the same
// person row, pre-filled from the person and the deployment's site. Nothing changes for the worker until the joining
// day: then (joining.service) the deployment ends the day before, the gate pass with it, the contract_worker role
// closes, and the UAN and ESIC IP from the deployment are raised on the new employee record for HR to approve. Earlier
// deployments, punches and register rows stay as contract-worker history. Acting for someone else: 403; another
// company's deployment: 404.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const before = (s: string) => iso(new Date(day(s).getTime() - 86_400_000));
const NOT_FOUND = 'Contract worker not found.';

export interface ConversionInput {
  joiningOn: string;
  legalEntityId: string;
  locationId: string;
  departmentId?: string | null;
  designationId?: string | null;
  employmentTypeId?: string | null;
  managerEmployeeId?: string | null;
  templateId?: string | null;
  version: number;
}

/**
 * On the joining day: the deployment ends the day before joining (never before it started; an earlier release keeps
 * its day), the gate pass with it, and the contract_worker role closes the same day. Returns the statutory numbers
 * to carry over (raised on the employee by the caller). Audited.
 */
export async function endContractRoleIn(tx: Tx, c: CompanyContext, deploymentId: string, joinedOn: string, employeeId: string) {
  const org = c.organizationId;
  const dep = await tx.contractDeployment.findFirst({ where: { organizationId: org, id: deploymentId } });
  if (!dep) return { uan: null, esicIp: null };
  const wanted = before(joinedOn) < iso(dep.fromOn) ? iso(dep.fromOn) : before(joinedOn);
  const end = dep.status === 'released' && dep.releasedOn && iso(dep.releasedOn) < wanted ? iso(dep.releasedOn) : wanted;
  if (dep.status !== 'released' || (dep.releasedOn && iso(dep.releasedOn) > end)) {
    await tx.contractDeployment.update({
      where: { id: dep.id },
      data: {
        status: 'released',
        releasedOn: day(end),
        releaseReason: 'Joined as an employee',
        toOn: !dep.toOn || iso(dep.toOn) > end ? day(end) : dep.toOn,
        gateValidTo: dep.gateValidTo && iso(dep.gateValidTo) > end ? day(end) : dep.gateValidTo,
        version: { increment: 1 },
      },
    });
  }
  await tx.personRole.updateMany({ where: { organizationId: org, personId: dep.personId, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: dep.id, OR: [{ endOn: null }, { endOn: { gt: day(end) } }] }, data: { endOn: day(end) } });
  await audit(tx, c, 'clra.worker.converted', 'contract_deployment', dep.id, { employeeId, lastDay: end });
  return { uan: dep.uan, esicIp: dep.esicIp };
}

@Injectable()
export class ContractConversionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly joiners: JoinersService,
    private readonly journeys: LifecycleJourneysService,
  ) {}

  private async deployment(tx: Tx, c: CompanyContext, id: string) {
    const dep = await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!dep) throw new NotFoundException(NOT_FOUND);
    return dep;
  }

  /** CLB-05 steps: the person, the deployment, and what stops or changes the conversion. */
  async prefill(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.journeys.viewer(user);
    if (!v.grants.has('lifecycle.onboarding.manage')) throw new ForbiddenException('Converting a contract worker needs the onboarding key.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const dep = await this.deployment(tx, c, id);
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: dep.personId } });
      const agency = await tx.agency.findFirst({ where: { organizationId: org, id: dep.agencyId }, select: { name: true } });
      const site = await tx.location.findFirst({ where: { organizationId: org, id: dep.locationId }, select: { id: true, name: true, legalEntityId: true } });
      const employee = await tx.employee.findFirst({ where: { organizationId: org, personId: p.id }, select: { id: true } });
      const working = employee ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: employee.id, exitedOn: null }, select: { id: true } }) : null;
      const joiner = await tx.preboarding.findFirst({ where: { organizationId: org, personId: p.id, status: 'invited' }, select: { id: true, joiningOn: true } });
      const block =
        dep.status !== 'deployed' ? 'Only a deployed worker can be converted. A worker waiting for approval or released is not on site.' : working ? 'This person works here as an employee now.' : joiner ? `This person is already joining on ${iso(joiner.joiningOn)}.` : null;
      return {
        deploymentId: dep.id,
        version: dep.version,
        canStart: !block && !v.actingForOther,
        block,
        person: { id: p.id, givenName: p.givenName, familyName: p.familyName, name: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '), email: p.primaryEmail, phone: p.primaryPhone },
        rehire: Boolean(employee && !working),
        contractor: agency?.name ?? '',
        site: site ? { id: site.id, name: site.name, legalEntityId: site.legalEntityId } : null,
        skill: dep.skill,
        fromOn: iso(dep.fromOn),
        toOn: dep.toOn ? iso(dep.toOn) : null,
        status: dep.status,
        gatePass: dep.gatePassNo,
        gateValidTo: dep.gateValidTo ? iso(dep.gateValidTo) : null,
        uan: dep.uan,
        esicIp: dep.esicIp,
        idMasked: `XXXX XXXX ${dep.idLast4}`,
        today: todayIst(),
      };
    });
  }

  /** Starts the joiner from the deployment (the PPL-12 flow with the contract_worker source). */
  async start(ctx: TenantContext, user: ScopeUser, id: string, dto: ConversionInput) {
    const v = await this.journeys.viewer(user);
    if (v.actingForOther) throw new ForbiddenException("You can't convert a contract worker while acting for someone else. Sign in as yourself.");
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const dep = await this.deployment(tx, c, id);
      if (dep.version !== dto.version) throw new ConflictException('This worker changed just now. Reload the page.');
      if (dep.status !== 'deployed') throw new ConflictException('Only a deployed worker can be converted.');
      if (dto.joiningOn <= iso(dep.fromOn)) throw new BadRequestException(`Join after the deployment started (${iso(dep.fromOn)}): the contract role ends the day before joining.`);
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: c.organizationId, id: dep.personId } });
      const out = await this.joiners.addIn(tx, c, v, { givenName: p.givenName, familyName: p.familyName, email: p.primaryEmail, phone: p.primaryPhone, personId: p.id, joiningOn: dto.joiningOn, legalEntityId: dto.legalEntityId, locationId: dto.locationId, departmentId: dto.departmentId ?? null, designationId: dto.designationId ?? null, employmentTypeId: dto.employmentTypeId ?? null, managerEmployeeId: dto.managerEmployeeId ?? null, templateId: dto.templateId ?? null }, 'contract_worker', null, dep.id);
      await audit(tx, c, 'clra.worker.conversion_started', 'contract_deployment', dep.id, { preboardingId: out.pb.id, joiningOn: dto.joiningOn });
      return out;
    });
    await this.joiners.afterAdd(ctx as CompanyContext, user, [res]);
    return { id: res.pb.id, journeyId: res.journeyId };
  }
}
