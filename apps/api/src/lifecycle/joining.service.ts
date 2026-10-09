import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { ProfileService } from '../people/profile.service';
import { DocumentsService } from '../documents/documents.service';
import { JourneysService as DeskJourneysService } from '../service-desk/journeys.service';
import { joinerInScope, ownOf } from '../documents/person-access';
import { PreboardingPortalService } from './portal.service';

// LIFE-2.03 / 2.08 / 2.09 HR's side of a joiner (M01 §3.5, D3; YX-LC-03 / 12 / 31; design §8.4):
//   joining   "Mark joined" on or after the joining day, with HR's identity check (YX-LC-31): the employee record is made
//             by the ordinary hire path in the same transaction, personal details are written, and identity / bank
//             details become change requests someone else approves (maker ≠ checker); the portal login ends;
//   cancel    did not join / reneged / offer withdrawn: one audited action, nothing deleted (YX-LC-12);
//   BGV       HR asks for consent in the portal; checks need a live consent; a discrepancy only flags (never withdraws);
//   offers    accepted ATS offers wait in "Ready to onboard" (M10 Q2 manual hand-off, the starter mode).

const KEYS = ['lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.bgv.manage', 'employee.personal.view', 'employee.identity.view'] as const;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class JoiningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly profile: ProfileService,
    private readonly documents: DocumentsService,
    private readonly portal: PreboardingPortalService,
    private readonly desk: DeskJourneysService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private async joiner(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: string) {
    const pb = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!pb) throw new NotFoundException('No such joiner.');
    if (v.actingForOther || !(await joinerInScope(tx, c, v, key, pb))) throw new ForbiddenException('You cannot do this for this joiner.');
    return pb;
  }

  /** HR's view of the pre-boarding forms: progress, personal answers with the class key, identity / bank masked. */
  async forms(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id, v.grants.has('lifecycle.onboarding.view') ? 'lifecycle.onboarding.view' : 'lifecycle.onboarding.manage');
      const shown = PreboardingPortalService.shown(this.portal.answersOf(pb));
      const personal = await joinerInScope(tx, c, v, 'employee.personal.view', pb);
      const identity = await joinerInScope(tx, c, v, 'employee.identity.view', pb);
      const sections = pb.sections as Record<string, string>;
      const bgv = await joinerInScope(tx, c, v, 'lifecycle.bgv.manage', pb);
      const consent = bgv ? await tx.consentRecord.findFirst({ where: { organizationId: c.organizationId, personId: pb.personId, purpose: 'bgv' }, orderBy: { givenAt: 'desc' } }) : null;
      const checks = bgv ? await tx.bgvCheck.findMany({ where: { organizationId: c.organizationId, preboardingId: pb.id }, orderBy: { createdAt: 'asc' } }) : [];
      return {
        id: pb.id,
        status: pb.status,
        outcome: pb.outcome,
        completion: pb.completion,
        sections: Object.fromEntries(['personal', 'identity', 'bank', 'emergency', 'nominees', 'tax'].map((k) => [k, sections[k] === 'done' ? 'done' : 'to_do'])),
        answers: { ...shown, personal: personal ? shown.personal : null, emergency: personal ? shown.emergency : null, nominees: personal ? shown.nominees : null, identity: identity ? shown.identity : null, bank: identity ? shown.bank : null },
        identityAttested: Boolean(pb.identityAttestedAt),
        bgv: bgv ? { requested: sections.bgv_requested === 'yes', consent: consent ? { givenAt: consent.givenAt.toISOString(), withdrawnAt: consent.withdrawnAt?.toISOString() ?? null } : null, checks: checks.map((k) => ({ id: k.id, checkType: k.checkType, status: k.status, gate: k.gate, note: k.note, resultDocumentId: k.resultDocumentId, version: k.version })) } : null,
        version: pb.version,
      };
    });
  }

  /** Fill in or change the planned job before day one (the hire needs department, designation and type). */
  async updatePlan(ctx: TenantContext, user: ScopeUser, id: string, dto: { departmentId?: string | null; designationId?: string | null; employmentTypeId?: string | null; managerEmployeeId?: string | null; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.onboarding.manage');
      if (pb.status !== 'invited') throw new ConflictException('This joiner is no longer waiting to join.');
      const org = c.organizationId;
      if (dto.departmentId && !(await tx.department.findFirst({ where: { organizationId: org, id: dto.departmentId }, select: { id: true } }))) throw new BadRequestException('No such department.');
      if (dto.designationId && !(await tx.designation.findFirst({ where: { organizationId: org, id: dto.designationId }, select: { id: true } }))) throw new BadRequestException('No such designation.');
      if (dto.employmentTypeId && !(await tx.employmentType.findFirst({ where: { organizationId: org, id: dto.employmentTypeId }, select: { id: true } }))) throw new BadRequestException('No such employment type.');
      if (dto.managerEmployeeId && !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.managerEmployeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('The manager must be a current employee.');
      const data = Object.fromEntries(Object.entries({ departmentId: dto.departmentId, designationId: dto.designationId, employmentTypeId: dto.employmentTypeId, managerEmployeeId: dto.managerEmployeeId }).filter(([, x]) => x !== undefined));
      const n = await tx.preboarding.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...data, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this joiner. Reload it.');
      await audit(tx, c, 'preboarding.plan.changed', 'preboarding', id, { fields: Object.keys(data) });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------------------ joining (LIFE-2.08)

  async markJoined(ctx: TenantContext, user: ScopeUser, id: string, dto: { identityAttested: boolean; status: 'probation' | 'confirmed'; userId?: string | null; workEmail?: string | null; employeeCode?: string | null; version: number }) {
    if (!dto.identityAttested) throw new BadRequestException('Confirm you checked the original ID before marking the joiner as joined (YX-LC-31).');
    const v = await this.viewer(user);
    const hv = await this.history.viewer(user as Parameters<EmployeeHistoryService['viewer']>[0]);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.onboarding.manage');
      if (pb.status !== 'invited' || pb.version !== dto.version) throw new ConflictException('This joiner changed meanwhile. Reload it.');
      if (iso(pb.joiningOn) > todayIst()) throw new BadRequestException(`${iso(pb.joiningOn)} is the joining day. Mark them joined on or after it, or change the joining day.`);
      if (!pb.departmentId || !pb.designationId || !pb.employmentTypeId) throw new BadRequestException('Add the department, designation and employment type to the joiner first.');
      const gated = await tx.bgvCheck.findFirst({ where: { organizationId: org, preboardingId: id, gate: 'before_joining', status: { notIn: ['clear', 'cancelled'] } } });
      if (gated) throw new ConflictException('A background check must be clear before joining. HR can change that check’s gate if the company decides so.');
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: pb.personId } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preboarding:${id}`}))`;
      const hired = await this.history.createEmployeeIn(tx, c, hv, {
        legalEntityId: pb.legalEntityId,
        status: dto.status,
        reason: 'Joined after pre-boarding',
        givenName: p.givenName,
        familyName: p.familyName ?? undefined,
        preferredName: p.preferredName ?? undefined,
        personId: p.id,
        userId: dto.userId ?? undefined,
        workEmail: dto.workEmail ?? undefined,
        employeeCode: dto.employeeCode ?? undefined,
        joinedOn: iso(pb.joiningOn),
        assignment: { locationId: pb.locationId, departmentId: pb.departmentId, designationId: pb.designationId, employmentTypeId: pb.employmentTypeId, managerEmployeeId: pb.managerEmployeeId ?? null },
      } as Parameters<EmployeeHistoryService['createEmployeeIn']>[3]);
      // YX-LC-03: what the joiner gave moves into the record without re-typing.
      const a = this.portal.answersOf(pb);
      if (a.personal) {
        const d = { dateOfBirth: asDate(a.personal.dateOfBirth), gender: a.personal.gender, personalEmail: p.primaryEmail, personalPhone: p.primaryPhone, addressLine1: a.personal.addressLine1, addressLine2: a.personal.addressLine2 ?? null, city: a.personal.city, stateCode: a.personal.stateCode, postalCode: a.personal.postalCode, country: 'IN', updatedBy: c.userId ?? null };
        await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org, employeeId: hired.id } }, update: d, create: { organizationId: org, employeeId: hired.id, ...d } });
      }
      const reason = 'Given by the joiner in pre-boarding';
      const raised: string[] = [];
      if (a.identity) {
        for (const [kind, value] of [['legal_name', { legalName: a.identity.legalName }], ['pan', { pan: a.identity.pan }], ['aadhaar', a.identity.aadhaar ? { aadhaar: a.identity.aadhaar } : null], ['uan', a.identity.uan ? { uan: a.identity.uan } : null]] as const) {
          if (value && (await this.profile.raiseIn(tx, c, hired.id, kind, value as never, reason))) raised.push(kind);
        }
      }
      if (a.bank && (await this.profile.raiseIn(tx, c, hired.id, 'bank_salary', { holderName: a.bank.holderName, accountNumber: a.bank.accountNumber, ifsc: a.bank.ifsc } as never, reason))) raised.push('bank_salary');
      await tx.preboarding.update({ where: { id }, data: { status: 'joined', employmentId: hired.employmentId, joinedAt: new Date(), identityAttestedBy: c.userId ?? null, identityAttestedAt: new Date(), version: { increment: 1 } } });
      await tx.personRole.updateMany({ where: { organizationId: org, personId: p.id, roleType: 'preboarder', sourceId: id, endOn: null }, data: { endOn: asDate(todayIst()) } });
      await tx.preboardingPortalSession.updateMany({ where: { organizationId: org, preboardingId: id, endedAt: null }, data: { endedAt: new Date() } });
      // Tasks for "the joiner" now reach their own login, if they have one.
      if (dto.userId) {
        const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: id } });
        if (j) await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, ownerType: 'person', status: { in: ['open', 'waiting'] } }, data: { assigneeUserId: dto.userId } });
      }
      await audit(tx, c, 'preboarding.joined', 'preboarding', id, { employeeId: hired.id, employmentId: hired.employmentId, identityAttested: true, changeRequests: raised });
      return { employeeId: hired.id, employmentId: hired.employmentId, employeeCode: hired.employeeCode, changeRequests: raised };
    }, { timeout: 30_000 }); // one step makes the employee, their details and the approvals: give it room under load
  }

  /** YX-LC-12: did not join / reneged / offer withdrawn, in one audited action; nothing is deleted. */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string, dto: { outcome: 'did_not_join' | 'reneged' | 'withdrawn'; reason: string; version: number }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.onboarding.manage');
      if (pb.status !== 'invited') throw new ConflictException('This joiner is no longer waiting to join.');
      if (dto.outcome === 'did_not_join' && iso(pb.joiningOn) > todayIst()) throw new BadRequestException('"Did not join" is for on or after the joining day. Before it, use reneged or offer withdrawn.');
      const n = await tx.preboarding.updateMany({ where: { organizationId: org, id, version: dto.version, status: 'invited' }, data: { status: 'cancelled', outcome: dto.outcome, outcomeReason: dto.reason.trim().slice(0, 500), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this joiner. Reload it.');
      const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: id } });
      const tickets: string[] = [];
      if (j) {
        const linked = await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: j.id, linkType: 'sd_ticket', status: { in: ['open', 'waiting'] } }, select: { linkId: true } });
        tickets.push(...linked.map((t) => t.linkId!).filter(Boolean));
        await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] } }, data: { status: 'cancelled', version: { increment: 1 } } });
        await tx.journey.update({ where: { id: j.id }, data: { status: 'cancelled' } });
      }
      await tx.preboardingPortalSession.updateMany({ where: { organizationId: org, preboardingId: id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.personRole.updateMany({ where: { organizationId: org, personId: pb.personId, roleType: 'preboarder', sourceId: id, endOn: null }, data: { endOn: asDate(todayIst()) } });
      await tx.bgvCheck.updateMany({ where: { organizationId: org, preboardingId: id, status: { in: ['requested', 'in_progress'] } }, data: { status: 'cancelled', note: 'The joiner did not join', version: { increment: 1 } } });
      const pending = await tx.letterIssue.findMany({ where: { organizationId: org, personId: pb.personId, status: { in: ['pending_approval', 'rendering', 'awaiting_signature'] } }, select: { id: true, wfRequestId: true } });
      await tx.letterIssue.updateMany({ where: { organizationId: org, id: { in: pending.map((l) => l.id) } }, data: { status: 'withdrawn' } });
      await tx.signatureRequest.updateMany({ where: { organizationId: org, personId: pb.personId, status: 'open' }, data: { status: 'cancelled' } });
      if (pb.offerId) await tx.offer.updateMany({ where: { organizationId: org, id: pb.offerId }, data: { status: dto.outcome === 'withdrawn' ? 'withdrawn' : 'reneged' } });
      await audit(tx, c, 'preboarding.cancelled', 'preboarding', id, { outcome: dto.outcome, offerId: pb.offerId, deskRequests: tickets.length, letters: pending.length });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'preboarding.cancelled', payload: { preboardingId: id, outcome: dto.outcome } } });
      return { tickets, org };
    });
    await this.desk.stopFor({ organizationId: res.org, isSuperAdmin: false } as CompanyContext, res.tickets, `The joiner's onboarding was cancelled (${dto.outcome.replace(/_/g, ' ')}).`).catch(() => undefined);
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ BGV (LIFE-2.03)

  async askBgvConsent(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.bgv.manage');
      if (pb.status !== 'invited') throw new ConflictException('This joiner is no longer waiting to join.');
      await tx.preboarding.update({ where: { id }, data: { sections: { ...(pb.sections as Record<string, string>), bgv_requested: 'yes' } } });
      await audit(tx, c, 'bgv.consent.asked', 'preboarding', id);
      return { ok: true };
    });
  }

  async addCheck(ctx: TenantContext, user: ScopeUser, id: string, dto: { checkType: string; gate: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.bgv.manage');
      if ((await ownOf(tx, c, v)).personId === pb.personId) throw new ForbiddenException('You cannot check yourself.');
      const consent = await tx.consentRecord.findFirst({ where: { organizationId: c.organizationId, personId: pb.personId, purpose: 'bgv', withdrawnAt: null } });
      if (!consent) throw new ConflictException('There is no consent from the joiner for background checks. Ask for it first; they give it in the joining portal.');
      const k = await tx.bgvCheck.create({ data: { organizationId: c.organizationId, preboardingId: id, consentId: consent.id, checkType: dto.checkType, gate: dto.gate, status: 'requested', createdBy: c.userId ?? null } });
      await audit(tx, c, 'bgv.check.added', 'preboarding', id, { checkId: k.id, checkType: dto.checkType, gate: dto.gate });
      return { id: k.id };
    });
  }

  /** A result: clear / discrepancy / unable, with the report as a Special document. A discrepancy only flags HR. */
  async updateCheck(ctx: TenantContext, user: ScopeUser, checkId: string, dto: { status: string; note?: string; gate?: string; version: number }, file: { originalname: string; buffer: Buffer } | undefined) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.bgvCheck.findFirst({ where: { organizationId: c.organizationId, id: checkId } });
      if (!k) throw new NotFoundException('No such check.');
      const pb = await this.joiner(tx, c, v, k.preboardingId, 'lifecycle.bgv.manage');
      if (k.status === 'cancelled') throw new ConflictException('This check was stopped.');
      const consent = await tx.consentRecord.findFirst({ where: { organizationId: c.organizationId, id: k.consentId } });
      if (consent?.withdrawnAt) throw new ConflictException('The joiner withdrew consent, so this check stopped.');
      let docId: string | null = k.resultDocumentId;
      let fileId: string | null = null;
      if (file) {
        const r = await this.documents.storeReport(tx, c, pb.personId, file);
        docId = r.d.id;
        fileId = r.fileId;
      }
      const n = await tx.bgvCheck.updateMany({ where: { organizationId: c.organizationId, id: checkId, version: dto.version }, data: { status: dto.status, note: dto.note?.trim().slice(0, 1000) ?? k.note, gate: dto.gate ?? k.gate, resultDocumentId: docId, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this check. Reload it.');
      await audit(tx, c, 'bgv.check.updated', 'preboarding', pb.id, { checkId, status: dto.status, report: Boolean(file) });
      return { org: c.organizationId, fileId };
    });
    if (out.fileId) await this.documents.scanUpload(out.org, out.fileId);
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ ATS hand-off (LIFE-2.09)

  /** Accepted offers not onboarded yet, with who they are (P01 person match: internal, ex-employee or new). */
  async readyToOnboard(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('lifecycle.onboarding.manage')) throw new ForbiddenException('You cannot onboard joiners.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const offers = await tx.offer.findMany({ where: { organizationId: org, status: 'accepted' }, orderBy: { startDate: 'asc' }, take: 200 });
      const taken = new Set((await tx.preboarding.findMany({ where: { organizationId: org, offerId: { in: offers.map((o) => o.id) }, status: { not: 'cancelled' } }, select: { offerId: true } })).map((p) => p.offerId));
      const out = [];
      for (const o of offers.filter((x) => !taken.has(x.id))) {
        const cand = await tx.candidate.findFirst({ where: { organizationId: org, id: o.candidateId }, select: { name: true, email: true, phone: true } });
        const entry = await tx.pipelineEntry.findFirst({ where: { organizationId: org, id: o.pipelineEntryId }, select: { job: { select: { title: true } } } });
        if (!cand) continue;
        const persons = await tx.person.findMany({ where: { organizationId: org, primaryEmail: cand.email, status: 'active' }, select: { id: true } });
        const emp = await tx.employee.findFirst({ where: { organizationId: org, OR: [{ personId: { in: persons.map((p) => p.id) } }, { workEmail: cand.email }] }, select: { id: true } });
        const current = emp ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }) : null;
        out.push({ offerId: o.id, name: cand.name, email: cand.email, phone: cand.phone, startDate: iso(o.startDate), jobTitle: entry?.job.title ?? '', personType: current ? 'internal' : emp ? 'ex_employee' : 'new' });
      }
      return out;
    });
  }
}
