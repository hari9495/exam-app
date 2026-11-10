import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { gstinProblem } from '../expenses/checks';
import { AgencySubmissionsService } from '../agency-submissions/agency-submissions.service';
import { rateOn } from './staffing-work.service';
import { toPaise, toRupees } from './staffing-rules';
import type { CapExceptionDto, ForwardDto, ShareJobDto, VendorDto } from './staffing-dto';

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

/** What a vendor still lacks before it can be shared a client job (HIR-21: agreement, PAN, verified bank, TDS section). */
export function vendorMissing(a: { agreementSignedOn: Date | null; pan: string | null; bankVerifiedAt: Date | null; tdsSection: string | null }): string[] {
  return [!a.agreementSignedOn && 'signed agreement', !a.pan && 'PAN', !a.bankVerifiedAt && 'verified bank account', !a.tdsSection && 'TDS section'].filter((x): x is string => Boolean(x));
}

/**
 * HIR-21 staffing vendors, built on the recruitment agencies that already exist (agencies, agency_jobs,
 * agency_submissions, the /agency/[token] portal): no second vendor model. A vendor's register entry adds its documents
 * and tier; sharing a client job adds the rate cap (a suggestion keeps the company's target margin, setting
 * staffing.vendor.target_margin_pct), the submissions limit, the last day and a hidden client. A vendor's submission
 * carries its quote, right to represent and consent; the first submitter holds the candidate for the job for the
 * company's ownership window (staffing.vendor.ownership_days). Forwarding to the client accepts the agency submission
 * through the existing review (a candidate and pipeline entry) and makes a client submission; never a duplicate, never
 * over the cap without an approved exception, never without right to represent and consent. Vendors never see bill
 * rates, margins or other vendors.
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly agencySubmissions: AgencySubmissionsService,
  ) {}

  register(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.agency.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' }, take: 1000 });
      const shares = await tx.agencyJob.groupBy({ by: ['agencyId'], where: { organizationId: org }, _count: { _all: true } });
      const subs = await tx.agencySubmission.groupBy({ by: ['agencyId'], where: { organizationId: org }, _count: { _all: true } });
      const dups = await tx.agencySubmission.groupBy({ by: ['agencyId'], where: { organizationId: org, OR: [{ duplicateOfAgencyId: { not: null } }, { ownerUntil: { not: null }, isDuplicate: true }] }, _count: { _all: true } });
      const jobs = await tx.agencyJob.findMany({ where: { organizationId: org }, select: { agencyId: true, expiresOn: true, rateCapPaise: true, job: { select: { id: true, title: true } } } });
      const placed = await tx.staffingPlacement.groupBy({ by: ['agencyId'], where: { organizationId: org, agencyId: { not: null } }, _count: { _all: true } });
      const count = (list: { agencyId: string | null; _count: { _all: number } }[], id: string) => list.find((x) => x.agencyId === id)?._count._all ?? 0;
      return rows.map((a) => {
        const missing = vendorMissing(a);
        const submissions = count(subs, a.id);
        return {
          id: a.id,
          name: a.name,
          contactEmail: a.contactEmail,
          pan: a.pan,
          gstin: a.gstin,
          tdsSection: a.tdsSection,
          tier: a.tier,
          agreementSignedOn: iso(a.agreementSignedOn),
          bankVerified: Boolean(a.bankVerifiedAt),
          active: a.active,
          status: !a.active ? 'inactive' : missing.length ? 'pending' : 'active',
          missing,
          sharedJobs: count(shares, a.id),
          submissions,
          duplicateRate: submissions ? Math.round((count(dups, a.id) / submissions) * 100) : 0,
          placements: count(placed, a.id),
          portalToken: a.portalToken,
          jobs: jobs.filter((j) => j.agencyId === a.id).map((j) => ({ id: j.job.id, title: j.job.title, expiresOn: iso(j.expiresOn) })),
        };
      });
    });
  }

  async save(ctx: TenantContext, id: string | null, dto: VendorDto) {
    if (dto.gstin) {
      const bad = gstinProblem(dto.gstin.toUpperCase());
      if (bad) throw new BadRequestException(bad);
    }
    if (dto.gstin && dto.pan && dto.gstin.toUpperCase().slice(2, 12) !== dto.pan) throw new BadRequestException('The GSTIN does not carry this PAN. Check both.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const data = {
        name: dto.name,
        contactEmail: dto.contactEmail || null,
        pan: dto.pan || null,
        gstin: dto.gstin?.toUpperCase() || null,
        tdsSection: dto.tdsSection || null,
        tier: dto.tier || null,
        agreementSignedOn: dto.agreementSignedOn ? day(dto.agreementSignedOn) : null,
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      };
      const dup = (e: unknown): never => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`A vendor named "${dto.name}" already exists.`);
        throw e;
      };
      let vid = id;
      if (id) {
        const cur = await tx.agency.findFirst({ where: { id, organizationId: org } });
        if (!cur) throw new NotFoundException('Vendor not found.');
        const bank = dto.bankVerified === undefined ? {} : dto.bankVerified ? (cur.bankVerifiedAt ? {} : { bankVerifiedAt: new Date(), bankVerifiedBy: c.userId ?? null }) : { bankVerifiedAt: null, bankVerifiedBy: null };
        await tx.agency.update({ where: { id }, data: { ...data, ...bank } }).catch(dup);
        await audit(tx, c, 'staffing.vendor.updated', 'agency', id, { name: dto.name, bankVerified: dto.bankVerified ?? null, tier: dto.tier ?? null, active: dto.active ?? null });
      } else {
        // The same portal-token rule as every agency (AgenciesService.create).
        vid = (await tx.agency.create({ data: { organizationId: org, portalToken: randomUUID(), ...data, ...(dto.bankVerified ? { bankVerifiedAt: new Date(), bankVerifiedBy: c.userId ?? null } : {}) } }).catch(dup)).id;
        await audit(tx, c, 'staffing.vendor.created', 'agency', vid, { name: dto.name });
      }
      return { id: vid };
    });
  }

  /** Open jobs a vendor manager may share (any open job; a client job shows its client). */
  openJobs(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const jobs = await tx.job.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'open' }, orderBy: { title: 'asc' }, take: 1000, select: { id: true, title: true, staffingClientId: true } });
      const clients = new Map((await tx.staffingClient.findMany({ where: { organizationId: c.organizationId, id: { in: jobs.map((j) => j.staffingClientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      return jobs.map((j) => ({ id: j.id, title: j.title, client: j.staffingClientId ? (clients.get(j.staffingClientId) ?? null) : null }));
    });
  }

  /** The share sheet: a job's bill rate today and the suggested cap (bill rate less the company's target margin). */
  shareOptions(ctx: TenantContext, jobId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: org, deletedAt: null }, select: { id: true, title: true, status: true, staffingClientId: true, staffingLineId: true } });
      if (!job) throw new NotFoundException('Job not found.');
      const margin = Number(await settingFor(tx, c, 'staffing.vendor.target_margin_pct', { legalEntityId: '' }));
      const client = job.staffingClientId ? await tx.staffingClient.findFirst({ where: { id: job.staffingClientId, organizationId: org }, select: { name: true } }) : null;
      const rate = job.staffingLineId ? await rateOn(tx, org, job.staffingLineId, todayIst()) : null;
      const cap = rate ? (rate.billRatePaise * BigInt(100 - margin)) / 100n / 100n * 100n : null; // whole rupees, rounded down
      const shared = await tx.agencyJob.findMany({ where: { organizationId: org, jobId }, select: { agencyId: true } });
      return { job: { id: job.id, title: job.title, status: job.status }, client: client?.name ?? null, billRate: rate ? toRupees(rate.billRatePaise) : null, unit: rate?.unit ?? null, targetMarginPct: margin, suggestedCap: cap != null ? toRupees(cap) : null, sharedWith: shared.map((s) => s.agencyId) };
    });
  }

  /**
   * Share a job with vendors (the existing agency_jobs allow-list) with its terms. A client job needs a rate cap, never
   * above today's bill rate, and only vendors with every document; any job needs active vendors.
   */
  async share(ctx: TenantContext, dto: ShareJobDto) {
    const cap = dto.rateCap ? toPaise(dto.rateCap) : null;
    if (dto.rateCap && (cap == null || cap <= 0n)) throw new BadRequestException('Enter the rate cap in rupees.');
    if (dto.expiresOn < todayIst()) throw new BadRequestException('The share cannot end in the past.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { id: dto.jobId, organizationId: org, deletedAt: null }, select: { id: true, status: true, staffingClientId: true, staffingLineId: true } });
      if (!job) throw new NotFoundException('Job not found.');
      if (job.status !== 'open') throw new BadRequestException('Only an open job can be shared with vendors.');
      if (job.staffingLineId) {
        if (cap == null) throw new BadRequestException('A client job needs a rate cap for vendors.');
        const rate = await rateOn(tx, org, job.staffingLineId, todayIst());
        if (rate && cap > rate.billRatePaise) throw new BadRequestException('The rate cap is above the bill rate: placements would run at a loss.');
      }
      const vendors = await tx.agency.findMany({ where: { organizationId: org, id: { in: dto.agencyIds } } });
      if (vendors.length !== new Set(dto.agencyIds).size) throw new NotFoundException('Vendor not found.');
      for (const v of vendors) {
        if (!v.active) throw new BadRequestException(`${v.name} is inactive.`);
        if (job.staffingLineId && vendorMissing(v).length) throw new BadRequestException(`${v.name} still needs: ${vendorMissing(v).join(', ')}.`);
      }
      for (const v of vendors)
        await tx.agencyJob.upsert({
          where: { agencyId_jobId: { agencyId: v.id, jobId: job.id } },
          create: { organizationId: org, agencyId: v.id, jobId: job.id, rateCapPaise: cap, maxSubmissions: dto.maxSubmissions, expiresOn: day(dto.expiresOn), maskClient: dto.maskClient },
          update: { rateCapPaise: cap, maxSubmissions: dto.maxSubmissions, expiresOn: day(dto.expiresOn), maskClient: dto.maskClient },
        });
      await audit(tx, c, 'staffing.vendor.job_shared', 'job', job.id, { agencyIds: dto.agencyIds, cap: cap != null ? toRupees(cap) : null, maxSubmissions: dto.maxSubmissions, expiresOn: dto.expiresOn, maskClient: dto.maskClient });
      return { shared: vendors.length };
    });
  }

  /** A new portal link: the old one stops working at once. */
  async newLink(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.agency.findFirst({ where: { id, organizationId: c.organizationId }, select: { id: true } }))) throw new NotFoundException('Vendor not found.');
      const portalToken = randomUUID();
      await tx.agency.update({ where: { id }, data: { portalToken } });
      await audit(tx, c, 'staffing.vendor.link_renewed', 'agency', id, {});
      return { portalToken };
    });
  }

  /** Stop sharing a job with a vendor; its submissions stay. */
  async unshare(ctx: TenantContext, id: string, jobId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.agencyJob.deleteMany({ where: { agencyId: id, jobId, organizationId: c.organizationId } });
      if (!count) throw new NotFoundException('This job is not shared with this vendor.');
      await audit(tx, c, 'staffing.vendor.job_unshared', 'agency', id, { jobId });
      return { removed: true };
    });
  }

  /** Vendor submissions with the checks the reviewer needs (who holds a duplicate is shown here, never to the vendor). */
  submissions(ctx: TenantContext, showRates: boolean) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.agencySubmission.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 1000, include: { agency: { select: { name: true } }, job: { select: { title: true, staffingClientId: true } } } });
      const shares = await tx.agencyJob.findMany({ where: { organizationId: org, OR: rows.map((r) => ({ agencyId: r.agencyId, jobId: r.jobId })) } });
      const holders = new Map((await tx.agency.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.duplicateOfAgencyId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
      return rows.map((r) => {
        const share = shares.find((s) => s.agencyId === r.agencyId && s.jobId === r.jobId);
        const cap = share?.rateCapPaise ?? null;
        const over = cap != null && r.quotedRatePaise != null && r.quotedRatePaise > cap;
        const duplicate = Boolean(r.duplicateOfAgencyId || r.ownerUntil);
        return {
          id: r.id,
          vendor: r.agency.name,
          candidate: r.candidateName,
          job: r.job.title,
          jobId: r.jobId,
          clientJob: Boolean(r.job.staffingClientId),
          at: r.createdAt,
          quoted: showRates && r.quotedRatePaise != null ? toRupees(r.quotedRatePaise) : null,
          cap: showRates && cap != null ? toRupees(cap) : null,
          overBy: showRates && over ? toRupees(r.quotedRatePaise! - cap!) : null,
          overCap: over && !r.capExceptionAt,
          exception: r.capExceptionReason ? { reason: r.capExceptionReason, at: r.capExceptionAt } : null,
          override: r.duplicateOverrideAt ? { reason: r.duplicateOverrideReason, at: r.duplicateOverrideAt } : null,
          duplicate: duplicate ? { holder: r.duplicateOfAgencyId ? (holders.get(r.duplicateOfAgencyId) ?? 'Another vendor') : 'Your own pipeline', until: iso(r.ownerUntil) } : null,
          rightToRepresent: r.rightToRepresent,
          consent: r.consent,
          status: r.status,
        };
      });
    });
  }

  async exception(ctx: TenantContext, id: string, dto: CapExceptionDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.agencySubmission.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r) throw new NotFoundException('Vendor submission not found.');
      const share = await tx.agencyJob.findFirst({ where: { agencyId: r.agencyId, jobId: r.jobId } });
      if (!share?.rateCapPaise || r.quotedRatePaise == null || r.quotedRatePaise <= share.rateCapPaise) throw new ConflictException('This quote is within the rate cap; no exception is needed.');
      if (r.capExceptionAt) throw new ConflictException('An exception was already approved.');
      await tx.agencySubmission.update({ where: { id }, data: { capExceptionReason: dto.reason, capExceptionBy: c.userId ?? null, capExceptionAt: new Date() } });
      await audit(tx, c, 'staffing.vendor.cap_exception', 'agency_submission', id, { quoted: toRupees(r.quotedRatePaise), cap: toRupees(share.rateCapPaise), reason: dto.reason });
      return { id };
    });
  }

  /** Answer 489 (the design's Review dispute): an account manager overrides a duplicate with a reason (audited). */
  async overrideDuplicate(ctx: TenantContext, id: string, dto: CapExceptionDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.agencySubmission.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r) throw new NotFoundException('Vendor submission not found.');
      if (!r.duplicateOfAgencyId && !r.ownerUntil) throw new ConflictException('This submission is not a duplicate.');
      if (r.status !== 'pending') throw new ConflictException('This submission has already been reviewed.');
      const { count } = await tx.agencySubmission.updateMany({ where: { id, duplicateOverrideAt: null }, data: { duplicateOverrideReason: dto.reason, duplicateOverrideBy: c.userId ?? null, duplicateOverrideAt: new Date() } });
      if (!count) throw new ConflictException('The duplicate was already overridden.');
      await audit(tx, c, 'staffing.vendor.duplicate_overridden', 'agency_submission', id, { holder: r.duplicateOfAgencyId ?? 'own pipeline', ownerUntil: r.ownerUntil?.toISOString().slice(0, 10) ?? null, reason: dto.reason });
      return { id };
    });
  }

  /** Forward to the client: the checks first, then the existing accept, then a client submission (source: the vendor). */
  async forward(ctx: TenantContext, userId: string, id: string, dto: ForwardDto) {
    const prep = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((await settingFor(tx, c, 'staffing.desk.enabled', { legalEntityId: '' })) !== 'on') throw new BadRequestException('Forwarding to a client needs the staffing desk (Settings › Staffing desk).');
      const r = await tx.agencySubmission.findFirst({ where: { id, organizationId: org }, include: { job: { select: { staffingClientId: true, staffingLineId: true, status: true } } } });
      if (!r) throw new NotFoundException('Vendor submission not found.');
      if (!r.job.staffingClientId || !r.job.staffingLineId) throw new BadRequestException('Only a submission for a client job goes to a client. Accept it into the pipeline instead.');
      if (r.status !== 'pending') throw new ConflictException('This submission has already been reviewed.');
      if ((r.duplicateOfAgencyId || r.ownerUntil) && !r.duplicateOverrideAt) throw new ConflictException('This candidate is a duplicate for this job. Review the dispute instead.');
      if (!r.rightToRepresent || !r.consent) throw new BadRequestException('The vendor has not confirmed right to represent and the candidate’s consent.');
      const share = await tx.agencyJob.findFirst({ where: { agencyId: r.agencyId, jobId: r.jobId } });
      if (share?.rateCapPaise && r.quotedRatePaise != null && r.quotedRatePaise > share.rateCapPaise && !r.capExceptionAt) throw new ConflictException('The quote is over the rate cap. Approve an exception with a reason first.');
      const contact = await tx.staffingClientContact.findFirst({ where: { id: dto.contactId, organizationId: org, clientId: r.job.staffingClientId, archivedAt: null } });
      if (!contact) throw new BadRequestException('Choose a contact of this client.');
      const rate = await rateOn(tx, org, r.job.staffingLineId, todayIst());
      if (!rate) throw new BadRequestException('The rate card has no rate for this role today.');
      // The same person already submitted to this client job (from another vendor or the pipeline): nothing to accept.
      const known = await tx.candidate.findUnique({ where: { organizationId_email: { organizationId: org, email: r.candidateEmail } }, select: { id: true } });
      if (known && (await tx.staffingSubmission.count({ where: { organizationId: org, jobId: r.jobId, candidateId: known.id, stage: { not: 'rejected' } } }))) throw new ConflictException('This person is already submitted to this client job.');
      return { r, contact, rate, clientId: r.job.staffingClientId, lineId: r.job.staffingLineId };
    });
    const accepted = (await this.agencySubmissions.accept(ctx, id, userId)) as { candidateId?: string };
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const candidateId = accepted.candidateId ?? (await tx.agencySubmission.findFirstOrThrow({ where: { id }, select: { candidateId: true } })).candidateId!;
      const mask = (await settingFor(tx, c, 'staffing.submission.mask_contact', { legalEntityId: '' })) === 'on';
      const s = await tx.staffingSubmission.create({ data: { organizationId: c.organizationId, clientId: prep.clientId, jobId: prep.r.jobId, lineId: prep.lineId, candidateId, agencySubmissionId: id, contactId: prep.contact.id, billRatePaise: prep.rate.billRatePaise, masked: mask, submittedBy: c.userId ?? null } }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This person is already submitted to this client job.');
        throw e;
      });
      await audit(tx, c, 'staffing.vendor.forwarded', 'agency_submission', id, { submissionId: s.id, contactId: prep.contact.id });
      return { submissionId: s.id };
    });
  }
}

export type { Tx, CompanyContext, ScopeUser };
