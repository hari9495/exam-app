import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { ProfileService } from '../people/profile.service';
import { DocumentsService } from '../documents/documents.service';
import { LettersService } from '../documents/letters/letters.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { PayStructuresService } from '../payroll/structures.service';
import type { CompensationChangeDto } from '../payroll/dto-5b';
import { JourneysService as DeskJourneysService } from '../service-desk/journeys.service';
import { joinerInScope, ownOf } from '../documents/person-access';
import { PreboardingPortalService, nomineesOf } from './portal.service';
import { OnboardingExtrasService } from './onboarding-extras.service';
import { SETTINGS } from '../org-structure/settings-registry';

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

/**
 * Founder 2 Nov 2026: when a joining closes (joined, withdrawn, declined, cancelled) every still-open e-sign request of
 * the person is cancelled in the same transaction, one audit row per letter, so no pending acceptance hangs around.
 * Signed and declined requests stay as they are.
 */
export async function cancelOpenSignatures(tx: Tx, c: CompanyContext, personId: string, preboardingId: string, because: string) {
  const org = c.organizationId;
  const open = await tx.signatureRequest.findMany({ where: { organizationId: org, personId, status: 'open' }, select: { id: true, letterIssueId: true } });
  if (!open.length) return 0;
  await tx.signatureRequest.updateMany({ where: { organizationId: org, id: { in: open.map((s) => s.id) }, status: 'open' }, data: { status: 'cancelled' } });
  for (const s of open) await audit(tx, c, 'letter.signature.cancelled', 'letter_issue', s.letterIssueId, { signatureRequestId: s.id, preboardingId, because });
  return open.length;
}

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
    private readonly extras: OnboardingExtrasService,
    private readonly letters: LettersService,
    private readonly pipeline: PipelineService,
    private readonly structures: PayStructuresService,
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
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.onboarding.manage');
      if (pb.status !== 'invited' || pb.version !== dto.version) throw new ConflictException('This joiner changed meanwhile. Reload it.');
      if (iso(pb.joiningOn) > todayIst()) throw new BadRequestException(`${iso(pb.joiningOn)} is the joining day. Mark them joined on or after it, or change the joining day.`);
      if (!pb.departmentId || !pb.designationId || !pb.employmentTypeId) throw new BadRequestException('Add the department, designation and employment type to the joiner first.');
      // HIR-10: a discrepancy a person decided to proceed with no longer blocks joining (founder decision 3).
      const gated = await tx.bgvCheck.findFirst({ where: { organizationId: org, preboardingId: id, gate: 'before_joining', status: { notIn: ['clear', 'cancelled'] }, NOT: { status: 'discrepancy', decision: 'proceed' } } });
      if (gated) throw new ConflictException('A background check must be clear before joining. HR can change that check’s gate if the company decides so.');
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: pb.personId } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preboarding:${id}`}))`;
      // Lifecycle 6e (YX-LC-18): a rehire joins on the same record with the rehire policy's choices.
      const rehire = pb.personType === 'rehire' ? await this.extras.rehireAtJoining(tx, c, pb) : null;
      const hired = await this.history.createEmployeeIn(tx, c, hv, {
        legalEntityId: pb.legalEntityId,
        status: rehire?.skipProbation ? 'confirmed' : dto.status,
        reason: 'Joined after pre-boarding',
        givenName: p.givenName,
        familyName: p.familyName ?? undefined,
        preferredName: p.preferredName ?? undefined,
        personId: p.id,
        userId: dto.userId ?? undefined,
        workEmail: dto.workEmail ?? undefined,
        employeeCode: dto.employeeCode ?? rehire?.employeeCode ?? undefined,
        joinedOn: iso(pb.joiningOn),
        assignment: { locationId: pb.locationId, departmentId: pb.departmentId, designationId: pb.designationId, employmentTypeId: pb.employmentTypeId, managerEmployeeId: pb.managerEmployeeId ?? null },
      } as Parameters<EmployeeHistoryService['createEmployeeIn']>[3], rehire?.rehireOf ?? null);
      if (rehire) await tx.preboarding.update({ where: { id }, data: { rehireOptions: rehire.snapshot } });
      // YX-LC-03: what the joiner gave moves into the record without re-typing.
      const a = this.portal.answersOf(pb);
      if (a.personal) {
        const d = { dateOfBirth: asDate(a.personal.dateOfBirth), gender: a.personal.gender, personalEmail: p.primaryEmail, personalPhone: p.primaryPhone, addressLine1: a.personal.addressLine1, addressLine2: a.personal.addressLine2 ?? null, city: a.personal.city, stateCode: a.personal.stateCode, postalCode: a.personal.postalCode, country: 'IN', updatedBy: c.userId ?? null };
        await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org, employeeId: hired.id } }, update: d, create: { organizationId: org, employeeId: hired.id, ...d } });
      }
      // Lifecycle 6e (YX-LC-16): the nominees the joiner gave become the record's nominations (death in service uses them).
      // T9-01: one row per scheme with a share (group insurance is the group term scheme); an older single share stays "all".
      const SCHEME = { pf: 'pf', gratuity: 'gratuity', insurance: 'group_term' } as const;
      const noms = (nomineesOf(a) ?? []).flatMap((n) =>
        n.single
          ? [{ scheme: 'all', name: n.name, relation: n.relation, sharePercent: n.pf }]
          : (['pf', 'gratuity', 'insurance'] as const).filter((k) => n[k] > 0).map((k) => ({ scheme: SCHEME[k], name: n.name, relation: n.relation, sharePercent: n[k] })),
      );
      if (noms.length) await tx.employeeNomination.createMany({ data: noms.map((n) => ({ organizationId: org, employeeId: hired.id, ...n, source: 'joiner' })) });
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
      await cancelOpenSignatures(tx, c, p.id, id, 'joined');
      // Tasks for "the joiner" now reach their own login, if they have one.
      if (dto.userId) {
        const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: id } });
        if (j) await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, ownerType: 'person', status: { in: ['open', 'waiting'] } }, data: { assigneeUserId: dto.userId } });
      }
      await audit(tx, c, 'preboarding.joined', 'preboarding', id, { employeeId: hired.id, employmentId: hired.employmentId, identityAttested: true, changeRequests: raised });
      return { employeeId: hired.id, employmentId: hired.employmentId, employeeCode: hired.employeeCode, changeRequests: raised, joinedOn: iso(pb.joiningOn), offerId: pb.offerId };
    }, { timeout: 30_000 }); // one step makes the employee, their details and the approvals: give it room under load
    const { joinedOn, offerId, ...rest } = out;
    return { ...rest, payHandoff: offerId ? await this.payFromOffer(ctx, user, offerId, out.employeeId, joinedOn) : null };
  }

  /**
   * HIR-09: a joiner from an offer with CTC lines gets that pay as their first salary in Pay: the offer's salary structure
   * and fixed CTC, worked out again with the employee's own facts, as a pay change someone else approves (as any other).
   * Never blocks joining: when it cannot be raised (no right to set pay, a structure problem) the reason is returned and
   * audited, and payroll sets the salary as before. Variable pay and the joining bonus are not carried (question 334).
   */
  private async payFromOffer(ctx: TenantContext, user: ScopeUser, offerId: string, employeeId: string, joinedOn: string) {
    const v = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const o = await tx.offer.findFirst({ where: { organizationId: c.organizationId, id: offerId }, select: { currentVersion: true } });
      return o?.currentVersion ? tx.offerVersion.findFirst({ where: { organizationId: c.organizationId, offerId, version: o.currentVersion } }) : null;
    });
    if (!v) return null;
    try {
      const r = await this.structures.change(ctx, user, { employeeId, effectiveDate: joinedOn, templateVersionId: v.salaryTemplateVersionId, entryMode: 'ctc', annualCtc: v.annualCtc.toFixed(2), reason: `Pay from the accepted offer (version ${v.version})` } as CompensationChangeDto);
      await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'ats.offer.pay_handed_off', 'offer', offerId, { employeeId, version: v.version, changeId: r.changeId }));
      return { status: 'sent' as const, changeId: r.changeId, offerVersion: v.version };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const reason = status === 403 || status === 404 ? 'You cannot set pay for this person. Payroll sets the first salary from the offer.' : ((e as Error).message || 'The pay could not be worked out.');
      await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'ats.offer.pay_handoff_failed', 'offer', offerId, { employeeId, version: v.version, reason: reason.slice(0, 300) }));
      return { status: 'not_sent' as const, reason, offerVersion: v.version };
    }
  }

  /** YX-LC-12: did not join / reneged / offer withdrawn, in one audited action; nothing is deleted. */
  async cancel(ctx: TenantContext, user: ScopeUser, id: string, dto: { outcome: 'did_not_join' | 'reneged' | 'withdrawn'; reason?: string; version: number }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const pb = await this.joiner(tx, c, v, id, 'lifecycle.onboarding.manage');
      if (pb.status !== 'invited') throw new ConflictException('This joiner is no longer waiting to join.');
      if (dto.outcome === 'did_not_join' && iso(pb.joiningOn) > todayIst()) throw new BadRequestException('"Did not join" is for on or after the joining day. Before it, use reneged or offer withdrawn.');
      return this.closeIn(tx, c, pb, dto.outcome, dto.reason?.trim() || null, dto.version, true);
    });
    await this.afterClose(ctx, user.userId ?? null, res, dto.outcome, null);
    return { ok: true };
  }

  /**
   * T9-01 "Decline offer": the joiner, signed in to the joining portal, reneges with a reason. The same closing as HR's
   * (nothing deleted, tasks and checks stop, the offer and the hiring entry move); the portal stays readable so the
   * joiner sees the outcome; HR (the joiner's owner) is told. The candidate's move in Hiring is recorded under that HR
   * owner, with the joiner's reason.
   */
  async declineByJoiner(org: string, id: string, dto: { reason: string; note?: string }) {
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const reason = [dto.reason, dto.note?.trim()].filter(Boolean).join(': ').slice(0, 500);
    const res = await this.tenantPrisma.forTenant(c, async (tx) => {
      const pb = await tx.preboarding.findFirst({ where: { organizationId: org, id, status: 'invited' } });
      if (!pb) throw new ConflictException({ statusCode: 409, code: 'PORTAL_CLOSED', message: 'Your joining is closed, so nothing can be changed here.' });
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: pb.personId }, select: { givenName: true, familyName: true, preferredName: true } });
      const out = await this.closeIn(tx, c, pb, 'reneged', reason, pb.version, false);
      await audit(tx, c, 'preboarding.declined', 'preboarding', id, { by: 'joiner', reason: dto.reason, note: Boolean(dto.note?.trim()) });
      return { ...out, hr: pb.hrOwnerUserId, who: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') };
    });
    await this.afterClose({ organizationId: org, isSuperAdmin: false } as TenantContext, res.hr, res, 'reneged', `Declined by the joiner in the joining portal: ${reason}`);
    return { hr: res.hr, who: res.who, reason };
  }

  /** Closes a waiting joining in one transaction (nothing deleted). HR's cancel also ends the joiner's portal sessions. */
  private async closeIn(tx: Tx, c: CompanyContext, pb: { id: string; personId: string; offerId: string | null }, outcome: 'did_not_join' | 'reneged' | 'withdrawn', reason: string | null, version: number, endSessions: boolean) {
    const org = c.organizationId;
    const id = pb.id;
    // PPL-15 (founder 27 Oct 2026): a withdrawal comes with its letter, drafted (from the joiner's planned job, so before it is cancelled) for HR to review and issue in People › Letters.
    const letter = outcome === 'withdrawn' ? await this.letters.draftIn(tx, c, pb.personId, 'offer_withdrawal', reason) : null;
    const n = await tx.preboarding.updateMany({ where: { organizationId: org, id, version, status: 'invited' }, data: { status: 'cancelled', cancelledOn: asDate(todayIst()), outcome, outcomeReason: reason?.slice(0, 500) || null, version: { increment: 1 } } });
    if (!n.count) throw new ConflictException('Someone else changed this joiner. Reload it.');
    const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'preboarding', subjectId: id } });
    const tickets: string[] = [];
    if (j) {
      const linked = await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: j.id, linkType: 'sd_ticket', status: { in: ['open', 'waiting'] } }, select: { linkId: true } });
      tickets.push(...linked.map((t) => t.linkId!).filter(Boolean));
      await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, status: { in: ['open', 'waiting'] } }, data: { status: 'cancelled', version: { increment: 1 } } });
      await tx.journey.update({ where: { id: j.id }, data: { status: 'cancelled' } });
    }
    if (endSessions) await tx.preboardingPortalSession.updateMany({ where: { organizationId: org, preboardingId: id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.personRole.updateMany({ where: { organizationId: org, personId: pb.personId, roleType: 'preboarder', sourceId: id, endOn: null }, data: { endOn: asDate(todayIst()) } });
    await tx.bgvCheck.updateMany({ where: { organizationId: org, preboardingId: id, status: { in: ['requested', 'in_progress'] } }, data: { status: 'cancelled', note: 'The joiner did not join', version: { increment: 1 } } });
    const pending = await tx.letterIssue.findMany({ where: { organizationId: org, personId: pb.personId, status: { in: ['pending_approval', 'rendering', 'awaiting_signature'] } }, select: { id: true, wfRequestId: true } });
    await tx.letterIssue.updateMany({ where: { organizationId: org, id: { in: pending.map((l) => l.id) } }, data: { status: 'withdrawn' } });
    await cancelOpenSignatures(tx, c, pb.personId, id, outcome);
    if (pb.offerId) await tx.offer.updateMany({ where: { organizationId: org, id: pb.offerId }, data: { status: outcome === 'withdrawn' ? 'withdrawn' : 'reneged' } });
    await audit(tx, c, 'preboarding.cancelled', 'preboarding', id, { outcome, offerId: pb.offerId, deskRequests: tickets.length, letters: pending.length, withdrawalLetter: letter });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'preboarding.cancelled', payload: { preboardingId: id, outcome } } });
    return { tickets, org, offerId: pb.offerId };
  }

  /** After the closing commits: stop the desk requests and move the candidate out of hired in Hiring. */
  private async afterClose(ctx: TenantContext, actorUserId: string | null, res: { tickets: string[]; org: string; offerId: string | null }, outcome: 'did_not_join' | 'reneged' | 'withdrawn', reason: string | null) {
    await this.desk.stopFor({ organizationId: res.org, isSuperAdmin: false } as CompanyContext, res.tickets, `The joiner's onboarding was cancelled (${outcome.replace(/_/g, ' ')}).`).catch(() => undefined);
    if (res.offerId && actorUserId) await this.unwindHire(ctx, actorUserId, res.offerId, outcome, reason);
  }

  /**
   * PPL-15 (founder 27 Oct 2026): the candidate leaves the hired (or offer) stage in Hiring, as withdrawn or reneged, which
   * frees the headcount-plan slot (a slot counts hired candidates), and a closed requisition opens again. Through the ATS's
   * own moves (no message goes to the candidate); a status named for the outcome in the job's pipeline is used when the
   * company has one, else the rejected stage with the reason.
   */
  private async unwindHire(ctx: TenantContext, actorUserId: string, offerId: string, outcome: 'did_not_join' | 'reneged' | 'withdrawn', why: string | null = null) {
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const offer = await tx.offer.findFirst({ where: { organizationId: c.organizationId, id: offerId }, select: { pipelineEntryId: true } });
      const entry = offer ? await tx.pipelineEntry.findFirst({ where: { organizationId: c.organizationId, id: offer.pipelineEntryId }, include: { status: { include: { stage: true } }, job: { select: { id: true, status: true, pipelineId: true } } } }) : null;
      if (!entry || !['hired', 'offer'].includes(entry.status?.stage.category ?? '')) return null;
      const status = entry.job.pipelineId ? await tx.pipelineStatus.findFirst({ where: { stage: { pipelineId: entry.job.pipelineId, category: 'rejected' }, name: { contains: outcome === 'withdrawn' ? 'withdraw' : 'renege', mode: 'insensitive' } } }) : null;
      return { entryId: entry.id, job: entry.job, statusId: status?.id ?? null };
    });
    if (!found) return;
    const reason = why ?? (outcome === 'withdrawn' ? 'Offer withdrawn by the company' : outcome === 'reneged' ? 'Reneged after accepting the offer' : 'Did not join');
    await this.pipeline.patchEntry(ctx, actorUserId, found.entryId, found.statusId ? { statusId: found.statusId, reason } : { rejected: true, reason }, { skipComms: true });
    if (found.job.status === 'closed') await this.pipeline.updateJob(ctx, actorUserId, found.job.id, { status: 'open' });
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
  async updateCheck(ctx: TenantContext, user: ScopeUser, checkId: string, dto: { status: string; note?: string; gate?: string; checkedOn?: string; version: number }, file: { originalname: string; buffer: Buffer } | undefined) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.bgvCheck.findFirst({ where: { organizationId: c.organizationId, id: checkId } });
      if (!k) throw new NotFoundException('No such check.');
      const pb = await this.joiner(tx, c, v, k.preboardingId, 'lifecycle.bgv.manage');
      if ((await ownOf(tx, c, v)).personId === pb.personId) throw new ForbiddenException('You cannot check yourself.');
      if (k.status === 'cancelled') throw new ConflictException('This check was stopped.');
      const consent = await tx.consentRecord.findFirst({ where: { organizationId: c.organizationId, id: k.consentId } });
      if (consent?.withdrawnAt) throw new ConflictException('The joiner withdrew consent, so this check stopped.');
      // HIR-10: the day the check was done (IST), never in the future and never before the check was added.
      const checkedOn = dto.checkedOn ?? todayIst();
      if (checkedOn > todayIst()) throw new BadRequestException('The day the check was done cannot be in the future.');
      if (checkedOn < iso(new Date(k.createdAt.getTime() + 330 * 60_000))) throw new BadRequestException('The day the check was done cannot be before the check was added.');
      let docId: string | null = k.resultDocumentId;
      let resultVersion: number | null = k.resultVersion;
      let fileId: string | null = null;
      if (file) {
        const r = await this.documents.storeReport(tx, c, pb.personId, file);
        docId = r.d.id;
        fileId = r.fileId;
        resultVersion = (await tx.documentVersion.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.d.currentVersionId! }, select: { version: true } })).version;
      }
      // A changed result clears an earlier decision: it goes back to a person.
      const reset = dto.status !== k.status ? { decision: null, decisionNote: null, decidedBy: null, decidedAt: null } : {};
      const n = await tx.bgvCheck.updateMany({ where: { organizationId: c.organizationId, id: checkId, version: dto.version }, data: { status: dto.status, note: dto.note?.trim().slice(0, 1000) ?? k.note, gate: dto.gate ?? k.gate, resultDocumentId: docId, resultVersion, checkedBy: c.userId ?? null, checkedOn: asDate(checkedOn), ...reset, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this check. Reload it.');
      await audit(tx, c, 'bgv.check.updated', 'preboarding', pb.id, { checkId, status: dto.status, report: Boolean(file), checkedOn });
      return { org: c.organizationId, fileId };
    });
    if (out.fileId) await this.documents.scanUpload(out.org, out.fileId);
    return { ok: true };
  }

  /**
   * HIR-10 founder decision 3: a discrepancy goes to a person, who decides to proceed or not, with the reason. Nothing
   * is withdrawn automatically: "stop" only records the decision (HR then cancels the joining on its own page). With the
   * company setting hiring.bgv.decider_other_person (default on) the decider is not whoever recorded the discrepancy.
   */
  async decideCheck(ctx: TenantContext, user: ScopeUser, checkId: string, dto: { decision: 'proceed' | 'stop'; note: string; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.bgvCheck.findFirst({ where: { organizationId: c.organizationId, id: checkId } });
      if (!k) throw new NotFoundException('No such check.');
      const pb = await this.joiner(tx, c, v, k.preboardingId, 'lifecycle.bgv.manage');
      if ((await ownOf(tx, c, v)).personId === pb.personId) throw new ForbiddenException('You cannot decide your own background check.');
      if (k.status !== 'discrepancy') throw new ConflictException('Only a check with a discrepancy needs a decision.');
      if (k.decision) throw new ConflictException('This discrepancy is already decided. A new result for the check sends it back for a decision.');
      if ((await this.deciderOtherPerson(tx, c.organizationId)) && (k.checkedBy ?? k.createdBy) === c.userId) throw new ForbiddenException('Someone other than the person who recorded this discrepancy must decide it (company setting).');
      const n = await tx.bgvCheck.updateMany({ where: { organizationId: c.organizationId, id: checkId, version: dto.version, decision: null }, data: { decision: dto.decision, decisionNote: dto.note.trim(), decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this check. Reload it.');
      await audit(tx, c, 'bgv.discrepancy.decided', 'preboarding', pb.id, { checkId, decision: dto.decision });
      return { ok: true };
    });
  }

  private async deciderOtherPerson(tx: Tx, org: string) {
    const row = await tx.setting.findFirst({ where: { organizationId: org, key: 'hiring.bgv.decider_other_person', scopeType: 'tenant' }, select: { value: true } });
    return (row?.value ?? SETTINGS['hiring.bgv.decider_other_person'].default) === 'on';
  }

  /**
   * HIR-10 tracker: every joiner in the viewer's BGV scope whose checks were asked for or added, with consent, each
   * check's result, who checked it and when, its evidence (report version and virus-scan state) and any decision.
   * Special data: the key's scope applies per joiner, nothing while acting for someone else, and each look is audited.
   */
  async bgvTracker(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Background checks are not shown while acting for someone else. Sign in as yourself.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const checks = await tx.bgvCheck.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'asc' } });
      const pbs = await tx.preboarding.findMany({
        where: { organizationId: org, status: { in: ['invited', 'joined'] }, OR: [{ id: { in: [...new Set(checks.map((k) => k.preboardingId))] } }, { sections: { path: ['bgv_requested'], equals: 'yes' } }] },
        orderBy: { joiningOn: 'desc' },
        take: 1000,
      });
      const shown: typeof pbs = [];
      for (const pb of pbs) if (await joinerInScope(tx, c, v, 'lifecycle.bgv.manage', pb)) shown.push(pb);
      const personIds = shown.map((p) => p.personId);
      const [people, consents, desigs, journeys] = await Promise.all([
        tx.person.findMany({ where: { organizationId: org, id: { in: personIds } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
        tx.consentRecord.findMany({ where: { organizationId: org, personId: { in: personIds }, purpose: 'bgv' }, orderBy: { givenAt: 'desc' } }),
        tx.designation.findMany({ where: { organizationId: org, id: { in: shown.map((p) => p.designationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
        tx.journey.findMany({ where: { organizationId: org, subjectType: 'preboarding', subjectId: { in: shown.map((p) => p.id) }, kind: 'onboarding' }, select: { id: true, subjectId: true } }),
      ]);
      const mine = checks.filter((k) => shown.some((p) => p.id === k.preboardingId));
      const userIds = [...new Set(mine.flatMap((k) => [k.checkedBy, k.decidedBy, k.createdBy]).filter((x): x is string => Boolean(x)))];
      const users = userIds.length ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
      const who = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? 'Someone') : null);
      const docIds = [...new Set(mine.map((k) => k.resultDocumentId).filter((x): x is string => Boolean(x)))];
      const versions = docIds.length ? await tx.documentVersion.findMany({ where: { organizationId: org, documentId: { in: docIds } }, select: { documentId: true, version: true, fileId: true } }) : [];
      const files = versions.length ? await tx.file.findMany({ where: { organizationId: org, id: { in: versions.map((x) => x.fileId) } }, select: { id: true, scanStatus: true, fileName: true } }) : [];
      const evidence = (k: (typeof mine)[number]) => {
        if (!k.resultDocumentId) return null;
        // Older checks have no version: their evidence is the report's latest one.
        const ver = k.resultVersion != null ? versions.find((x) => x.documentId === k.resultDocumentId && x.version === k.resultVersion) : versions.filter((x) => x.documentId === k.resultDocumentId).sort((a, b) => b.version - a.version)[0];
        const f = ver ? files.find((x) => x.id === ver.fileId) : null;
        return ver ? { documentId: k.resultDocumentId, version: ver.version, fileName: f?.fileName ?? 'report', scan: f?.scanStatus === 'clean' ? 'clean' : f?.scanStatus === 'infected' ? 'infected' : 'pending' } : null;
      };
      const rows = shown.map((pb) => {
        const p = people.find((x) => x.id === pb.personId);
        const consent = consents.find((x) => x.personId === pb.personId);
        const sections = pb.sections as Record<string, string>;
        return {
          id: pb.id,
          journeyId: journeys.find((j) => j.subjectId === pb.id)?.id ?? null,
          name: p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : 'Joiner',
          designation: desigs.find((d) => d.id === pb.designationId)?.name ?? null,
          joiningOn: iso(pb.joiningOn),
          status: pb.status,
          consent: !consent ? (sections.bgv_requested === 'yes' ? 'pending' : 'not_asked') : consent.withdrawnAt ? 'withdrawn' : 'given',
          consentAt: consent ? (consent.withdrawnAt ?? consent.givenAt).toISOString() : null,
          checks: mine
            .filter((k) => k.preboardingId === pb.id)
            .map((k) => ({
              id: k.id,
              checkType: k.checkType,
              status: k.status,
              gate: k.gate,
              note: k.note,
              addedAt: k.createdAt.toISOString(),
              addedBy: who(k.createdBy),
              checkedBy: who(k.checkedBy),
              checkedById: k.checkedBy ?? k.createdBy,
              checkedOn: k.checkedOn ? iso(k.checkedOn) : null,
              evidence: evidence(k),
              decision: k.decision ? { decision: k.decision, note: k.decisionNote, by: who(k.decidedBy), at: k.decidedAt?.toISOString() ?? null } : null,
              version: k.version,
            })),
        };
      });
      await audit(tx, c, 'bgv.tracker.viewed', 'organization', org, { joiners: rows.length });
      // No BGV partner is connected yet (founder decision 3: manual tracking until a vendor contract).
      return { partner: null, today: todayIst(), viewerId: c.userId ?? null, deciderOtherPerson: await this.deciderOtherPerson(tx, org), joiners: rows };
    });
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
        const entry = await tx.pipelineEntry.findFirst({ where: { organizationId: org, id: o.pipelineEntryId }, select: { job: { select: { title: true, location: true, locationId: true } } } });
        if (!cand) continue;
        // PPL-12: the job's place (the location master's name, else the job's free text).
        const place = entry?.job.locationId ? (await tx.location.findFirst({ where: { organizationId: org, id: entry.job.locationId }, select: { name: true } }))?.name : null;
        const persons = await tx.person.findMany({ where: { organizationId: org, primaryEmail: cand.email, status: 'active' }, select: { id: true } });
        const emp = await tx.employee.findFirst({ where: { organizationId: org, OR: [{ personId: { in: persons.map((p) => p.id) } }, { workEmail: cand.email }] }, select: { id: true } });
        const current = emp ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }) : null;
        out.push({ offerId: o.id, name: cand.name, email: cand.email, phone: cand.phone, startDate: iso(o.startDate), jobTitle: entry?.job.title ?? '', location: place ?? entry?.job.location ?? null, acceptedOn: o.respondedAt ? o.respondedAt.toISOString().slice(0, 10) : null, personType: current ? 'internal' : emp ? 'ex_employee' : 'new' });
      }
      return out;
    });
  }
}
