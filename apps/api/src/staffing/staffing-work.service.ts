import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { displayName } from '../employee-history/employee-history.service';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { StaffingService, statutoryCostPct } from './staffing.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { marginPct, toPaise, toRupees } from './staffing-rules';
import type { BenchAddDto, ClientJobDto, MoveSubmissionDto, PlacementCreateDto, PlacementEndDto, PlacementExtendDto, SubmitToClientDto } from './staffing-dto';

const STAGES = ['submitted', 'client_review', 'interview', 'selected', 'rejected'] as const;
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The version of a rate-card line in force on a day (null when the card has no rate that day). */
export async function rateOn(tx: Tx, org: string, lineId: string, on: string) {
  return tx.staffingRate.findFirst({ where: { organizationId: org, lineId, validFrom: { lte: day(on) }, OR: [{ validTo: null }, { validTo: { gte: day(on) } }] } });
}

/**
 * Staffing desk slice 2: HIR-16 submissions to clients and HIR-17 placements and bench. A client job is an ordinary job
 * pointing at a staffing client and a rate-card line. Submissions carry only the bill rate; recruiters (ats.staffing.view)
 * submit and move cards; account managers (ats.staffing.manage) place, extend, end and keep the bench. A placement
 * points at the client and the rate-card line: its bill (and own-payroll pay) rate is the line's on the day. Pay rates,
 * vendor rates and margins are only ever sent to account managers. Nothing is written while acting for someone else;
 * another company's records are not found; every write is audited.
 */
@Injectable()
export class StaffingWorkService {
  private readonly logger = new Logger(StaffingWorkService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly staffing: StaffingService,
    private readonly email: EmailService,
    private readonly pipeline: PipelineService,
  ) {}

  private async clientJob(tx: Tx, c: CompanyContext, jobId: string) {
    const job = await tx.job.findFirst({ where: { id: jobId, organizationId: c.organizationId, deletedAt: null, staffingClientId: { not: null } }, select: { id: true, title: true, status: true, staffingClientId: true, staffingLineId: true } });
    if (!job || !job.staffingLineId) throw new NotFoundException('Client job not found.');
    return job as typeof job & { staffingClientId: string; staffingLineId: string };
  }

  private async names(tx: Tx, c: CompanyContext, employeeIds: (string | null)[], candidateIds: (string | null)[]) {
    const emp = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: employeeIds.filter((x): x is string => Boolean(x)) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    const cand = await tx.candidate.findMany({ where: { organizationId: c.organizationId, id: { in: candidateIds.filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true, phone: true, erasedAt: true } });
    return { emp: new Map(emp.map((e) => [e.id, displayName(e)])), cand: new Map(cand.map((x) => [x.id, x])) };
  }

  /* ---------------- client jobs ---------------- */

  /** Client jobs for the pickers (bill rate today only). */
  jobs(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'view', async (tx, c) => {
      const jobs = await tx.job.findMany({ where: { organizationId: c.organizationId, deletedAt: null, staffingClientId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, title: true, status: true, staffingClientId: true, staffingLineId: true } });
      const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: c.organizationId, id: { in: jobs.map((j) => j.staffingClientId!) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const today = todayIst();
      const out = [];
      for (const j of jobs) {
        const r = await rateOn(tx, c.organizationId, j.staffingLineId!, today);
        out.push({ id: j.id, title: j.title, status: j.status, clientId: j.staffingClientId, client: clients.get(j.staffingClientId!) ?? '', billRate: r ? toRupees(r.billRatePaise) : null, unit: r?.unit ?? null });
      }
      return out;
    });
  }

  /**
   * A client job: an ordinary job (the same rules as any job: pipeline, approvals) named after the rate-card line, pointing
   * at the client and that line.
   */
  async createClientJob(ctx: TenantContext, user: ScopeUser, clientId: string, dto: ClientJobDto) {
    const prep = await this.run(ctx, user, 'manage', async (tx, c) => {
      const client = await this.staffing.client(tx, c, clientId);
      const line = await tx.staffingRate.findFirst({ where: { organizationId: c.organizationId, clientId, lineId: dto.lineId, validTo: null } });
      if (!line) throw new BadRequestException('Choose a current line of this client’s rate card.');
      return { client, line };
    });
    const job = await this.pipeline.createJob(ctx, user.userId!, { title: dto.title?.trim() || prep.line.role, location: prep.line.location, headcount: dto.headcount ?? 1, description: `${prep.line.role} for ${prep.client.name}. Skills: ${prep.line.skill}.` });
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.job.update({ where: { id: job.id }, data: { staffingClientId: clientId, staffingLineId: dto.lineId } });
      await audit(tx, c, 'staffing.client_job.created', 'job', job.id, { clientId, lineId: dto.lineId });
    });
    return { id: job.id };
  }

  /* ---------------- HIR-16 submissions ---------------- */

  /** The submit sheet's choices for a client job: bench people first, then the job's pipeline; the client's contacts. */
  submitOptions(ctx: TenantContext, user: ScopeUser, jobId: string) {
    return this.run(ctx, user, 'view', async (tx, c) => {
      const org = c.organizationId;
      const job = await this.clientJob(tx, c, jobId);
      const client = await this.staffing.client(tx, c, job.staffingClientId);
      const rate = await rateOn(tx, org, job.staffingLineId, todayIst());
      const live = await tx.staffingSubmission.findMany({ where: { organizationId: org, jobId, stage: { not: 'rejected' } }, select: { employeeId: true, candidateId: true } });
      const taken = new Set(live.map((x) => x.employeeId ?? x.candidateId));
      const bench = await tx.staffingBench.findMany({ where: { organizationId: org, untilOn: null }, orderBy: { sinceOn: 'asc' } });
      const entries = await tx.pipelineEntry.findMany({ where: { organizationId: org, jobId, rejected: false, archivedAt: null, candidate: { erasedAt: null } }, select: { candidateId: true } });
      const n = await this.names(tx, c, bench.map((b) => b.employeeId), entries.map((e) => e.candidateId));
      const contacts = await tx.staffingClientContact.findMany({ where: { organizationId: org, clientId: client.id, archivedAt: null }, orderBy: { name: 'asc' } });
      return {
        job: { id: job.id, title: job.title, client: client.name },
        billRate: rate ? toRupees(rate.billRatePaise) : null,
        unit: rate?.unit ?? null,
        mask: (await settingFor(tx, c, 'staffing.submission.mask_contact', { legalEntityId: '' })) === 'on',
        people: [
          ...bench.filter((b) => !taken.has(b.employeeId)).map((b) => ({ kind: 'employee' as const, id: b.employeeId, name: n.emp.get(b.employeeId) ?? 'Employee', note: `Bench since ${iso(b.sinceOn)}` })),
          ...entries.filter((e) => !taken.has(e.candidateId)).map((e) => ({ kind: 'candidate' as const, id: e.candidateId, name: n.cand.get(e.candidateId)?.name ?? 'Candidate', note: 'In this job’s pipeline' })),
        ],
        contacts: contacts.map((x) => ({ id: x.id, name: x.name, role: x.role })),
      };
    });
  }

  /**
   * Submit people to a client contact for a client job, each on its own (one already submitted is reported, never sent
   * twice). The contact gets one email naming them; while masked it carries no phone or email of theirs.
   */
  async submit(ctx: TenantContext, user: ScopeUser, dto: SubmitToClientDto) {
    const bill = toPaise(dto.billRate);
    if (bill == null || bill <= 0n) throw new BadRequestException('Enter the bill rate in rupees, up to 2 decimals.');
    const out = await this.run(ctx, user, 'view', async (tx, c) => {
      const org = c.organizationId;
      const job = await this.clientJob(tx, c, dto.jobId);
      if (job.status !== 'open') throw new BadRequestException('Only an open client job takes submissions.');
      const contact = await tx.staffingClientContact.findFirst({ where: { id: dto.contactId, organizationId: org, clientId: job.staffingClientId, archivedAt: null } });
      if (!contact) throw new BadRequestException('Choose a contact of this client.');
      const rows: { kind: string; id: string; result: 'submitted' | 'already' | 'not_found'; submissionId?: string; name?: string }[] = [];
      for (const p of dto.people) {
        const ok =
          p.kind === 'employee'
            ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: p.id, exitedOn: null }, select: { id: true } })
            : await tx.candidate.findFirst({ where: { organizationId: org, id: p.id, erasedAt: null }, select: { id: true } });
        if (!ok) {
          rows.push({ kind: p.kind, id: p.id, result: 'not_found' });
          continue;
        }
        const exists = await tx.staffingSubmission.findFirst({ where: { organizationId: org, jobId: job.id, stage: { not: 'rejected' }, ...(p.kind === 'employee' ? { employeeId: p.id } : { candidateId: p.id }) }, select: { id: true } });
        if (exists) {
          rows.push({ kind: p.kind, id: p.id, result: 'already', submissionId: exists.id });
          continue;
        }
        const s = await tx.staffingSubmission.create({ data: { organizationId: org, clientId: job.staffingClientId, jobId: job.id, lineId: job.staffingLineId, employeeId: p.kind === 'employee' ? p.id : null, candidateId: p.kind === 'candidate' ? p.id : null, contactId: contact.id, billRatePaise: bill, masked: dto.masked, submittedBy: c.userId ?? null } });
        rows.push({ kind: p.kind, id: p.id, result: 'submitted', submissionId: s.id });
      }
      const n = await this.names(tx, c, rows.filter((r) => r.kind === 'employee').map((r) => r.id), rows.filter((r) => r.kind === 'candidate').map((r) => r.id));
      for (const r of rows) r.name = r.kind === 'employee' ? n.emp.get(r.id) : n.cand.get(r.id)?.name;
      if (rows.some((r) => r.result === 'submitted')) await audit(tx, c, 'staffing.submission.created', 'job', job.id, { contactId: contact.id, bill: toRupees(bill), submitted: rows.filter((r) => r.result === 'submitted').map((r) => r.submissionId), masked: dto.masked });
      const org2 = await tx.organization.findUnique({ where: { id: org }, select: { name: true } });
      return { rows, contact, job, orgName: org2?.name ?? '', people: rows.filter((r) => r.result === 'submitted').map((r) => ({ name: r.name ?? '', cand: r.kind === 'candidate' ? n.cand.get(r.id) : undefined })) };
    });
    // The client email, after the commit (a failed email never undoes the submissions; it is shown as not sent).
    let emailed = false;
    if (out.people.length) {
      const lines = out.people.map((p) => `<li>${escapeHtml(p.name)}${!dto.masked && p.cand ? ` · ${escapeHtml(p.cand.email)}${p.cand.phone ? ` · ${escapeHtml(p.cand.phone)}` : ''}` : ''}</li>`).join('');
      const r = await this.email.send({ to: out.contact.email, subject: `Candidates for ${out.job.title}`, html: `<p>${escapeHtml(out.orgName)} has submitted ${out.people.length} candidate${out.people.length === 1 ? '' : 's'} for ${escapeHtml(out.job.title)}:</p><ul>${lines}</ul>${dto.masked ? '<p>Contact details are shared once you shortlist.</p>' : ''}`, organizationId: ctx.organizationId as string }).catch((e: Error) => (this.logger.warn(`submission email: ${e.message}`), { success: false }));
      emailed = Boolean(r?.success);
      if (emailed) await inCompany(this.tenantPrisma, ctx, (tx) => tx.staffingSubmission.updateMany({ where: { id: { in: out.rows.filter((x) => x.result === 'submitted').map((x) => x.submissionId!) } }, data: { emailSentAt: new Date() } }));
    }
    return { emailed, rows: out.rows.map(({ kind, id, result, submissionId, name }) => ({ kind, id, result, submissionId, name })) };
  }

  /** The board: every submission with its source and days in the stage; the client's feedback SLA on Client review. */
  submissions(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'view', async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.staffingSubmission.findMany({ where: { organizationId: org }, orderBy: { stageEnteredAt: 'desc' }, take: 2000 });
      const n = await this.names(tx, c, rows.map((r) => r.employeeId), rows.map((r) => r.candidateId));
      const jobs = new Map((await tx.job.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.jobId))] } }, select: { id: true, title: true } })).map((j) => [j.id, j.title]));
      const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, slaFeedbackDays: true } })).map((x) => [x.id, x]));
      const contacts = new Map((await tx.staffingClientContact.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.contactId))] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const subs = await tx.agencySubmission.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.agencySubmissionId).filter((x): x is string => Boolean(x)) } }, select: { id: true, agency: { select: { name: true } } } });
      const vendor = new Map(subs.map((s) => [s.id, s.agency.name]));
      const today = todayIst();
      return rows.map((r) => ({
        id: r.id,
        person: r.employeeId ? (n.emp.get(r.employeeId) ?? 'Employee') : (n.cand.get(r.candidateId!)?.erasedAt ? 'Erased candidate' : (n.cand.get(r.candidateId!)?.name ?? 'Candidate')),
        job: jobs.get(r.jobId) ?? '',
        jobId: r.jobId,
        client: clients.get(r.clientId)?.name ?? '',
        contact: contacts.get(r.contactId) ?? '',
        billRate: toRupees(r.billRatePaise),
        source: r.agencySubmissionId ? `Vendor: ${vendor.get(r.agencySubmissionId) ?? ''}` : r.employeeId ? 'Bench' : 'Pipeline',
        kind: r.employeeId ? 'employee' : 'candidate',
        stage: r.stage,
        daysInStage: Math.max(0, daysBetween(iso(r.stageEnteredAt)!, today)),
        slaDays: clients.get(r.clientId)?.slaFeedbackDays ?? null,
        feedback: r.feedback,
        rejectedReason: r.rejectedReason,
        emailed: Boolean(r.emailSentAt),
      }));
    });
  }

  async move(ctx: TenantContext, user: ScopeUser, id: string, dto: MoveSubmissionDto) {
    return this.run(ctx, user, 'view', async (tx, c) => {
      const s = await tx.staffingSubmission.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!s) throw new NotFoundException('Submission not found.');
      if (dto.stage === 'rejected' && !dto.reason?.trim()) throw new BadRequestException('Say why the client rejected them.');
      if (s.stage === 'selected' && dto.stage !== 'selected' && (await tx.staffingPlacement.count({ where: { organizationId: c.organizationId, submissionId: id } })))
        throw new ConflictException('This person is already placed from this submission. End the placement instead.');
      if (s.stage === 'rejected' && dto.stage !== 'rejected') {
        const again = await tx.staffingSubmission.findFirst({ where: { organizationId: c.organizationId, jobId: s.jobId, stage: { not: 'rejected' }, id: { not: id }, ...(s.employeeId ? { employeeId: s.employeeId } : { candidateId: s.candidateId }) } });
        if (again) throw new ConflictException('This person has been submitted to this job again since. Use that card.');
      }
      await tx.staffingSubmission.update({ where: { id }, data: { stage: dto.stage, stageEnteredAt: dto.stage === s.stage ? s.stageEnteredAt : new Date(), feedback: dto.feedback?.trim() || s.feedback, rejectedReason: dto.stage === 'rejected' ? dto.reason!.trim() : null } });
      await audit(tx, c, 'staffing.submission.moved', 'staffing_submission', id, { from: s.stage, to: dto.stage, reason: dto.reason ?? null });
      return { id, stage: dto.stage };
    });
  }

  /* ---------------- HIR-17 placements ---------------- */

  private async placementView(tx: Tx, c: CompanyContext, rows: Prisma.StaffingPlacementGetPayload<object>[], showPay: boolean) {
    const org = c.organizationId;
    const today = todayIst();
    const soon = Number(await settingFor(tx, c, 'staffing.placement.ending_soon_days', { legalEntityId: '' }));
    const stat = await statutoryCostPct(tx, org);
    const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
    const agencies = new Map((await tx.agency.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.agencyId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
    const out = [];
    for (const r of rows) {
      const start = iso(r.startOn)!;
      const end = iso(r.endOn)!;
      const on = today < start ? start : today > end ? end : today;
      const rate = await rateOn(tx, org, r.lineId, on);
      const bill = rate?.billRatePaise ?? 0n;
      const cost = r.supply === 'vendor' ? r.vendorRatePaise! : (rate?.payRatePaise ?? 0n);
      const statutory = r.supply === 'own' ? (cost * BigInt(stat)) / 100n : 0n;
      const ended = r.status === 'ended' || end < today;
      out.push({
        id: r.id,
        person: r.workerName,
        role: rate?.role ?? '',
        unit: rate?.unit ?? 'hour',
        clientId: r.clientId,
        client: clients.get(r.clientId) ?? '',
        supply: r.supply,
        vendor: r.agencyId ? (agencies.get(r.agencyId) ?? '') : null,
        startOn: start,
        endOn: end,
        status: ended ? 'ended' : daysBetween(today, end) <= soon ? 'ending_soon' : 'active',
        endedReason: r.endedReason,
        billRate: rate ? toRupees(bill) : null,
        ...(showPay ? { costRate: toRupees(cost), statutory: toRupees(statutory), margin: rate ? toRupees(bill - cost - statutory) : null, marginPct: rate && bill > 0n ? marginPct(bill, cost + statutory) : null } : {}),
        version: r.version,
      });
    }
    return out;
  }

  placements(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'view', async (tx, c, a) => {
      const rows = await tx.staffingPlacement.findMany({ where: { organizationId: c.organizationId }, orderBy: { endOn: 'asc' }, take: 2000 });
      return { canManage: a.manage && !a.actingForOther, showPay: a.manage, rows: await this.placementView(tx, c, rows, a.manage) };
    });
  }

  placement(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, 'view', async (tx, c, a) => {
      const r = await tx.staffingPlacement.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r) throw new NotFoundException('Placement not found.');
      // Answer 494: the hire and the guarantee, for account managers (money: never for recruiters).
      const fee = a.manage
        ? {
            hiredOn: iso(r.hiredOn),
            ctc: r.hireCtcPaise != null ? toRupees(r.hireCtcPaise) : null,
            feeInvoice: r.feeInvoiceId ? await tx.staffingInvoice.findFirst({ where: { id: r.feeInvoiceId }, select: { id: true, number: true, status: true, totalPaise: true } }).then((i) => (i ? { id: i.id, number: i.number, status: i.status, total: toRupees(i.totalPaise) } : null)) : null,
            leftOn: iso(r.leftOn),
            guarantee: r.guaranteeOutcome,
            terms: Boolean(await tx.staffingClientTerms.count({ where: { clientId: r.clientId, organizationId: c.organizationId } })),
            series: (await tx.staffingInvoiceSeries.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ financialYear: 'desc' }] })).map((x) => ({ value: x.id, label: `${x.prefix} · ${x.gstin} · ${x.financialYear}` })),
          }
        : null;
      return { canManage: a.manage && !a.actingForOther, showPay: a.manage, placement: (await this.placementView(tx, c, [r], a.manage))[0]!, fee };
    });
  }

  /** Selected submissions that can become placements (the New placement sheet). */
  placeable(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const rows = await tx.staffingSubmission.findMany({ where: { organizationId: c.organizationId, stage: 'selected' } });
      const placed = new Set((await tx.staffingPlacement.findMany({ where: { organizationId: c.organizationId, submissionId: { in: rows.map((r) => r.id) } }, select: { submissionId: true } })).map((p) => p.submissionId));
      const n = await this.names(tx, c, rows.map((r) => r.employeeId), rows.map((r) => r.candidateId));
      const jobs = new Map((await tx.job.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.jobId) } }, select: { id: true, title: true } })).map((j) => [j.id, j.title]));
      return rows.filter((r) => !placed.has(r.id)).map((r) => ({ id: r.id, person: r.employeeId ? n.emp.get(r.employeeId) : n.cand.get(r.candidateId!)?.name, job: jobs.get(r.jobId) ?? '', source: r.agencySubmissionId ? 'vendor' : r.employeeId ? 'employee' : 'candidate' }));
    });
  }

  /**
   * A selected submission becomes a placement. Own payroll needs an employee (a pipeline candidate joins first); a
   * vendor's candidate is vendor supplied at the vendor's quote. The rate card must have a rate on the start day.
   * Starting a placement takes the person off the bench.
   */
  async createPlacement(ctx: TenantContext, user: ScopeUser, dto: PlacementCreateDto) {
    if (dto.endOn < dto.startOn) throw new BadRequestException('The placement cannot end before it starts.');
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const org = c.organizationId;
      const s = await tx.staffingSubmission.findFirst({ where: { id: dto.submissionId, organizationId: org } });
      if (!s) throw new NotFoundException('Submission not found.');
      if (s.stage !== 'selected') throw new ConflictException('Only a submission the client selected becomes a placement.');
      if (await tx.staffingPlacement.findFirst({ where: { organizationId: org, submissionId: s.id }, select: { id: true } })) throw new ConflictException('This submission is already a placement.');
      if (!(await rateOn(tx, org, s.lineId, dto.startOn))) throw new BadRequestException('The rate card has no rate for this role on the start day. Add or change the rate first.');
      let data: Prisma.StaffingPlacementUncheckedCreateInput;
      if (s.agencySubmissionId) {
        const v = await tx.agencySubmission.findFirst({ where: { id: s.agencySubmissionId, organizationId: org } });
        if (!v?.quotedRatePaise) throw new BadRequestException('The vendor gave no rate for this candidate.');
        data = { organizationId: org, clientId: s.clientId, lineId: s.lineId, submissionId: s.id, supply: 'vendor', agencyId: v.agencyId, workerName: v.candidateName, vendorRatePaise: v.quotedRatePaise, startOn: day(dto.startOn), endOn: day(dto.endOn), createdBy: c.userId ?? null };
      } else if (s.employeeId) {
        const e = await tx.employee.findFirst({ where: { id: s.employeeId, organizationId: org }, select: { givenName: true, familyName: true, preferredName: true } });
        if (!e || !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: s.employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('This person is no longer an employee.');
        data = { organizationId: org, clientId: s.clientId, lineId: s.lineId, submissionId: s.id, supply: 'own', employeeId: s.employeeId, workerName: displayName(e), startOn: day(dto.startOn), endOn: day(dto.endOn), createdBy: c.userId ?? null };
      } else throw new BadRequestException('A pipeline candidate joins as an employee first (People › Onboarding); then submit them from the bench.');
      const p = await tx.staffingPlacement.create({ data }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This person already has an active placement.');
        throw e;
      });
      if (p.employeeId) {
        const open = await tx.staffingBench.findFirst({ where: { organizationId: org, employeeId: p.employeeId, untilOn: null } });
        // Off the bench the day before the start (never before the bench began).
        if (open) await tx.staffingBench.update({ where: { id: open.id }, data: { untilOn: day([addDays(dto.startOn, -1), iso(open.sinceOn)!].sort().at(-1)!) } });
      }
      await audit(tx, c, 'staffing.placement.created', 'staffing_placement', p.id, { submissionId: s.id, supply: p.supply, startOn: dto.startOn, endOn: dto.endOn });
      return { id: p.id };
    });
  }

  async extend(ctx: TenantContext, user: ScopeUser, id: string, dto: PlacementExtendDto) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const p = await tx.staffingPlacement.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!p) throw new NotFoundException('Placement not found.');
      if (p.status === 'ended') throw new ConflictException('This placement has ended.');
      if (dto.endOn <= iso(p.endOn)!) throw new BadRequestException(`The new end must be after ${iso(p.endOn)}.`);
      const { count } = await tx.staffingPlacement.updateMany({ where: { id, version: dto.version }, data: { endOn: day(dto.endOn), version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone changed this placement meanwhile. Reload it.');
      await audit(tx, c, 'staffing.placement.extended', 'staffing_placement', id, { from: iso(p.endOn), to: dto.endOn, reason: dto.reason });
      return { id };
    });
  }

  /** End early: the last day and the reason; an own-payroll person moves to the bench from the next day. */
  async end(ctx: TenantContext, user: ScopeUser, id: string, dto: PlacementEndDto) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.staffingPlacement.findFirst({ where: { id, organizationId: org } });
      if (!p) throw new NotFoundException('Placement not found.');
      if (p.status === 'ended') throw new ConflictException('This placement has already ended.');
      if (dto.endOn < iso(p.startOn)! || dto.endOn > iso(p.endOn)!) throw new BadRequestException(`The last day is between ${iso(p.startOn)} and ${iso(p.endOn)}.`);
      const { count } = await tx.staffingPlacement.updateMany({ where: { id, version: dto.version, status: 'active' }, data: { endOn: day(dto.endOn), status: 'ended', endedReason: dto.reason, endNote: dto.note?.trim() || null, version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone changed this placement meanwhile. Reload it.');
      if (p.employeeId && !(await tx.staffingBench.findFirst({ where: { organizationId: org, employeeId: p.employeeId, untilOn: null } })))
        await tx.staffingBench.create({ data: { organizationId: org, employeeId: p.employeeId, sinceOn: day(addDays(dto.endOn, 1)), lastClientId: p.clientId, createdBy: c.userId ?? null } });
      await audit(tx, c, 'staffing.placement.ended', 'staffing_placement', id, { endOn: dto.endOn, reason: dto.reason, was: iso(p.endOn) });
      return { id };
    });
  }

  /* ---------------- HIR-17 bench ---------------- */

  bench(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'view', async (tx, c, a) => {
      const org = c.organizationId;
      const rows = await tx.staffingBench.findMany({ where: { organizationId: org, untilOn: null }, orderBy: { sinceOn: 'asc' } });
      const n = await this.names(tx, c, rows.map((r) => r.employeeId), []);
      const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.lastClientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const max = Number(await settingFor(tx, c, 'staffing.bench.max_days', { legalEntityId: '' }));
      const today = todayIst();
      return {
        canManage: a.manage && !a.actingForOther,
        policy: { maxDays: max, payPct: Number(await settingFor(tx, c, 'staffing.bench.pay_pct', { legalEntityId: '' })), after: await settingFor(tx, c, 'staffing.bench.after', { legalEntityId: '' }) },
        rows: rows.map((r) => {
          const days = Math.max(0, daysBetween(iso(r.sinceOn)!, today));
          return { id: r.id, employeeId: r.employeeId, person: n.emp.get(r.employeeId) ?? 'Employee', sinceOn: iso(r.sinceOn), days, left: max - days, overPolicy: days >= max, lastClient: r.lastClientId ? (clients.get(r.lastClientId) ?? null) : null, note: r.note };
        }),
      };
    });
  }

  /** People the bench can take: active employees not on it and not placed now. */
  benchCandidates(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const org = c.organizationId;
      const busy = new Set([...(await tx.staffingBench.findMany({ where: { organizationId: org, untilOn: null }, select: { employeeId: true } })).map((x) => x.employeeId), ...(await tx.staffingPlacement.findMany({ where: { organizationId: org, status: 'active', employeeId: { not: null } }, select: { employeeId: true } })).map((x) => x.employeeId!)]);
      const emps = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, take: 2000, select: { employeeId: true } });
      const n = await this.names(tx, c, emps.map((e) => e.employeeId), []);
      return emps.filter((e) => !busy.has(e.employeeId)).map((e) => ({ value: e.employeeId, label: n.emp.get(e.employeeId) ?? 'Employee' })).sort((x, y) => x.label.localeCompare(y.label));
    });
  }

  async addToBench(ctx: TenantContext, user: ScopeUser, dto: BenchAddDto) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.employment.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose an active employee of your company.');
      if (await tx.staffingPlacement.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, status: 'active', endOn: { gte: day(dto.sinceOn) } }, select: { id: true } })) throw new ConflictException('This person is placed until after that day. End or let the placement finish first.');
      const row = await tx.staffingBench.create({ data: { organizationId: org, employeeId: dto.employeeId, sinceOn: day(dto.sinceOn), note: dto.note?.trim() || null, createdBy: c.userId ?? null } }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This person is already on the bench.');
        throw e;
      });
      await audit(tx, c, 'staffing.bench.added', 'staffing_bench', row.id, { employeeId: dto.employeeId, sinceOn: dto.sinceOn });
      return { id: row.id };
    });
  }

  async removeFromBench(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, 'manage', async (tx, c) => {
      const row = await tx.staffingBench.findFirst({ where: { id, organizationId: c.organizationId, untilOn: null } });
      if (!row) throw new NotFoundException('Bench entry not found.');
      const today = todayIst();
      await tx.staffingBench.update({ where: { id }, data: { untilOn: day(today < iso(row.sinceOn)! ? iso(row.sinceOn)! : today) } });
      await audit(tx, c, 'staffing.bench.removed', 'staffing_bench', id, { employeeId: row.employeeId });
      return { removed: true };
    });
  }

  /** Every call: the key (view or manage), the desk on, then the company's transaction. */
  private async run<T>(ctx: TenantContext, user: ScopeUser, need: 'view' | 'manage', fn: (tx: Tx, c: CompanyContext, a: Awaited<ReturnType<StaffingService['access']>>) => Promise<T>): Promise<T> {
    const a = await this.staffing.gate(user, need);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.staffing.deskOn(tx, c);
      return fn(tx, c, a);
    });
  }
}

export const SUBMISSION_STAGES = STAGES;
