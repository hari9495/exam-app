import { InternalApplicationsService } from '../internal-applications/internal-applications.service';
import { createHash, randomUUID } from 'crypto';
import { minorHold } from '../talent-crm/minor';
import type { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { Offer, Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { buildOfferPdf } from './offer-pdf';
import { renderOfferTemplate } from './offer-render';
import { ApprovalsService, ApprovalSummary, SubmitResult } from '../approvals/approvals.service';
import { OtpService } from '../auth/otp.service';
import { publicBrand } from '../public-applications/public-brand';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PDF_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class OffersService {
  // offers is RLS-protected and there is no org context until the offerToken resolves one. The
  // super-admin flag on forTenant bypasses the RLS predicate entirely, same as
  // PublicApplicationsService.LOOKUP_ORG -- this placeholder org is never used for filtering.
  private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly offerTemplates: OfferTemplatesService,
    private readonly emailService: EmailService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly integrationEvents: IntegrationEventsService,
    private readonly approvals: ApprovalsService,
    // HIR-09 e-sign: the one-time code the candidate signs with (optional so older unit tests build without it).
    @Optional() private readonly otp?: OtpService,
    @Optional() private readonly internal?: InternalApplicationsService,
  ) {}

  async createOffer(context: TenantContext, actorUserId: string, entryId: string, dto: CreateOfferDto): Promise<Offer> {
    // Template lookup opens its own forTenant read (see OfferTemplatesService.getDefault/getById),
    // so it runs before -- not nested inside -- the entry-check/create transaction below, and
    // only when the caller didn't supply both subject and body.
    let letterSubject = dto.subject;
    let letterBody = dto.body;
    if (!letterSubject || !letterBody) {
      const template = dto.templateId
        ? await this.offerTemplates.getById(context, dto.templateId)
        : await this.offerTemplates.getDefault(context);
      letterSubject = letterSubject ?? template.subject;
      letterBody = letterBody ?? template.body;
    }

    const made = await this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      // HIR-05 under 18 (rule set HIR.MINOR): no offer until a parent or guardian consents.
      const minor = await minorHold(tx as unknown as Tx, orgId, entry.candidateId, todayIst(), 'offer');
      if (minor) throw new ConflictException(minor);

      const offer = await tx.offer.create({
        data: {
          organizationId: orgId,
          pipelineEntryId: entryId,
          candidateId: entry.candidateId,
          compensation: dto.compensation,
          startDate: new Date(dto.startDate),
          expiresAt: new Date(dto.expiresAt),
          status: 'draft',
          letterSubject: letterSubject as string,
          letterBody: letterBody as string,
        },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'offer.created',
        entityType: 'offer',
        entityId: offer.id,
      });
      return offer;
    });
    // HIR-13: an internal applicant's manager may be told at the offer (company setting).
    await this.internal?.tellAtOffer(context, entryId);
    return made;
  }

  async previewPdf(context: TenantContext, offerId: string): Promise<Buffer> {
    const loaded = await this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const offer = await tx.offer.findFirst({
        where: { id: offerId, organizationId: orgId },
        include: { pipelineEntry: { include: { candidate: true, job: true } } },
      });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
      return {
        offer,
        candidateName: offer.pipelineEntry.candidate.name,
        jobTitle: offer.pipelineEntry.job.title,
        orgName: org?.name ?? '',
      };
    });
    const { offer, candidateName, jobTitle, orgName } = loaded;

    const dateFmt = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long' } as any);
    const rendered = renderOfferTemplate(offer.letterSubject, offer.letterBody, {
      candidateName,
      jobTitle,
      orgName,
      recruiterName: '',
      compensation: offer.compensation,
      startDate: dateFmt(offer.startDate),
      offerExpiry: dateFmt(offer.expiresAt),
      offerLink: '',
    });

    return buildOfferPdf({
      orgName,
      letterBody: rendered.body,
      candidateName,
      jobTitle,
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
    });
  }

  async listForEntry(context: TenantContext, entryId: string): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const offers = await this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, pipelineEntryId: entryId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return this.withApprovalSummaries(context, offers);
  }

  async listForCandidate(context: TenantContext, candidateId: string): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const offers = await this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return this.withApprovalSummaries(context, offers);
  }

  // One batched getSummariesFor call for the whole list, not one per offer -- avoids N+1.
  private async withApprovalSummaries(context: TenantContext, offers: Offer[]): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const approvalByOfferId = await this.approvals.getSummariesFor(context, 'offer', offers.map((o) => o.id));
    return offers.map((offer) => ({ ...offer, approval: approvalByOfferId.get(offer.id) ?? null }));
  }

  // Org-scoped status flips for the offer approval lifecycle -- mirrors
  // PipelineService.markRequisitionApproved/Draft (Task 11) for the offer gate.
  async markApproved(context: TenantContext, offerId: string): Promise<void> {
    await this.setOfferStatus(context, offerId, 'approved');
  }

  async markDraft(context: TenantContext, offerId: string): Promise<void> {
    await this.setOfferStatus(context, offerId, 'draft');
  }

  private async setOfferStatus(context: TenantContext, offerId: string, status: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.offer.updateMany({ where: { id: offerId, organizationId: context.organizationId as string }, data: { status } }),
    );
  }

  // Submits the offer through the approvals engine. Only a draft offer is eligible -- one
  // already pending, approved, or sent has either cleared this gate already or isn't
  // resubmittable. Mirrors PipelineService.submitRequisition's auto-pass/pending split.
  async submitOffer(context: TenantContext, actorUserId: string, offerId: string): Promise<SubmitResult> {
    const offer = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.offer.findFirst({ where: { id: offerId, organizationId: context.organizationId as string } }),
    );
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    if (offer.status !== 'draft') throw new ConflictException('Only a draft offer can be submitted');

    const result = await this.approvals.submit(context, 'offer', offerId, actorUserId);
    if (result.status === 'approved') {
      await this.markApproved(context, offerId);
    } else {
      await this.setOfferStatus(context, offerId, 'pending_approval');
    }
    return result;
  }

  // Cancels the offer's open approval request (permission-checked by ApprovalsService.cancel via
  // isConfigurer) and puts the offer back in draft so it can be edited and resubmitted.
  async cancelOfferApproval(context: TenantContext, actorUserId: string, offerId: string): Promise<void> {
    const isConfigurer = await this.approvals.isConfigurer(context, actorUserId);
    await this.approvals.cancelForSubject(context, 'offer', offerId, actorUserId, isConfigurer);
    await this.markDraft(context, offerId);
  }

  async sendOffer(context: TenantContext, actorUserId: string, offerId: string): Promise<Offer> {
    const orgId = context.organizationId as string;

    // Offer gate: when the org has an enabled offer approval chain, only an approved offer may
    // be sent. When the gate is off (no chain, or disabled), preserve today's behavior exactly --
    // sendable straight from draft. Read outside the tx below, same as PipelineService.createJob's
    // requisition-gate check.
    const chains = await this.approvals.getChains(context);
    const gateEnabled = chains.offer.enabled;

    // Phase 1 (short tx): org-scoped read + the offerToken mint. No network calls here --
    // forTenant uses Prisma's default 5s interactive-transaction timeout, and the PDF build +
    // blob upload + SMTP send below can take longer than that (see CandidateEmailsService.sendMessage,
    // which follows the same three-phase shape for the same reason).
    const prep = await this.tenantPrisma.forTenant(context, async (tx) => {
      const offer = await tx.offer.findFirst({
        where: { id: offerId, organizationId: orgId },
        include: { pipelineEntry: { include: { candidate: true, job: true } } },
      });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      // HIR-09: an offer with CTC versions is sent only once approved (its route, or the auto-pass when it has none).
      if (offer.currentVersion > 0) {
        if (offer.status !== 'approved') throw new ConflictException(offer.status === 'sent' ? 'Offer already sent' : 'Send the offer for approval first.');
      } else if (gateEnabled) {
        if (offer.status !== 'approved') throw new ConflictException('Offer not approved');
      } else if (offer.status !== 'draft') {
        throw new BadRequestException('Offer already sent');
      }
      if (offer.pipelineEntry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      const offerToken = randomUUID();
      await tx.offer.update({ where: { id: offerId }, data: { offerToken } });
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorName = actorUserId
        ? ((await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '')
        : '';
      // Founder decision 4: e-sign only when the offer's template switches it on (accepting by the link otherwise).
      const esign = offer.templateId ? Boolean((await tx.offerTemplate.findFirst({ where: { organizationId: orgId, id: offer.templateId }, select: { esign: true } }))?.esign) : false;
      return { offer, candidate: offer.pipelineEntry.candidate, job: offer.pipelineEntry.job, org, actorName, offerToken, esign };
    });

    // Phase 2 (outside any tx): rendering + network calls (PDF build, blob upload, SMTP send).
    const offerLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/yx/offer/${prep.offerToken}`;
    const rendered = renderOfferTemplate(prep.offer.letterSubject, prep.offer.letterBody, {
      candidateName: prep.candidate.name,
      jobTitle: prep.job.title,
      orgName: prep.org?.name ?? '',
      recruiterName: prep.actorName,
      compensation: prep.offer.compensation,
      startDate: prep.offer.startDate.toLocaleDateString('en-US', { dateStyle: 'long' } as any),
      offerExpiry: prep.offer.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' } as any),
      offerLink,
    });
    const pdf = await buildOfferPdf({
      orgName: prep.org?.name ?? '',
      letterBody: rendered.body,
      candidateName: prep.candidate.name,
      jobTitle: prep.job.title,
      compensation: prep.offer.compensation,
      startDate: prep.offer.startDate,
      expiresAt: prep.offer.expiresAt,
    });
    const pdfPath = await this.blobStorage.upload(`offers/${orgId}/${prep.offerToken}.pdf`, pdf, 'application/pdf');
    const logoUrl = prep.org?.logoPath ? await this.blobStorage.signIfOurs(prep.org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const html = buildCandidateEmailHtml({
      logoUrl: logoUrl as string | null,
      orgName: prep.org?.name ?? null,
      bodyText: `${rendered.body}\n\nRespond to your offer: ${offerLink}`,
    });
    const result = await this.emailService.send({
      to: prep.candidate.email,
      subject: rendered.subject,
      html,
      organizationId: orgId,
      attachments: [{ filename: 'offer-letter.pdf', content: pdf }],
    });

    // Phase 3 (short tx): log the outcome. A failed send leaves the offer in draft so the
    // recruiter can retry -- it must not look "sent" when the candidate never received it.
    return this.tenantPrisma.forTenant(context, async (tx) => {
      if (!result.success) {
        await this.audit.record(context, {
          actorUserId,
          action: 'offer.send_failed',
          entityType: 'offer',
          entityId: offerId,
          metadata: { to: prep.candidate.email },
        });
        return prep.offer;
      }
      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: 'sent', pdfPath, sentAt: new Date(), sentByUserId: actorUserId, esign: prep.esign },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'offer.sent',
        entityType: 'offer',
        entityId: offerId,
        metadata: { to: prep.candidate.email, esign: prep.esign },
      });
      return updated;
    });
  }

  async withdraw(context: TenantContext, actorUserId: string, offerId: string): Promise<Offer> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const offer = await tx.offer.findFirst({ where: { id: offerId, organizationId: orgId } });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      if (offer.status !== 'sent') throw new BadRequestException('Only a sent offer can be withdrawn');

      const updated = await tx.offer.update({ where: { id: offerId }, data: { status: 'withdrawn' } });
      await this.audit.record(context, {
        actorUserId,
        action: 'offer.withdrawn',
        entityType: 'offer',
        entityId: offerId,
      });
      return updated;
    });
  }

  private async resolveOfferByToken(token: string) {
    const offer = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.offer.findUnique({
          where: { offerToken: token },
          select: {
            id: true,
            organizationId: true,
            pipelineEntryId: true,
            compensation: true,
            startDate: true,
            expiresAt: true,
            status: true,
            pdfPath: true,
            sentByUserId: true,
            esign: true,
            letterBody: true,
          },
        }),
    );
    // Generic message regardless of which condition failed later (expired, already responded)
    // -- distinguishing "no such token" from a state failure would give an outsider an oracle.
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  async getPublicOffer(token: string) {
    const offer = await this.resolveOfferByToken(token);

    const details = await this.tenantPrisma.forTenant(
      { organizationId: offer.organizationId, isSuperAdmin: true },
      async (tx) => {
        const entry = await tx.pipelineEntry.findUnique({
          where: { id: offer.pipelineEntryId },
          select: { job: { select: { title: true } } },
        });
        const org = await tx.organization.findUnique({ where: { id: offer.organizationId }, select: { name: true } });
        return { jobTitle: entry?.job.title ?? '', orgName: org?.name ?? '' };
      },
    );

    const pdfUrl = offer.pdfPath ? ((await this.blobStorage.signIfOurs(offer.pdfPath, PDF_SIGN_TTL_MS)) as string | null) : null;

    return {
      jobTitle: details.jobTitle,
      orgName: details.orgName,
      // Careers answer 362: the company's logo, colour, careers link and white-label on the offer page.
      brand: await publicBrand(this.tenantPrisma, this.blobStorage, offer.organizationId),
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      status: offer.status,
      pdfUrl,
      // HIR-09: the candidate signs with a one-time code only when the company's template asks for it.
      esign: offer.esign,
    };
  }

  private esignKey = (offerId: string) => `offer-esign:${offerId}`;

  /** HIR-09 e-sign, step 1: a one-time code to the candidate's email (rate-limited per offer and per address). */
  async sendEsignCode(token: string, ip: string | null) {
    const offer = await this.resolveOfferByToken(token);
    if (!offer.esign || offer.status !== 'sent' || offer.expiresAt < new Date()) throw new ConflictException('This offer is no longer available');
    if (!this.otp) throw new ConflictException('Signing is not available right now. Try again later.');
    const email = await this.tenantPrisma.forTenant({ organizationId: offer.organizationId, isSuperAdmin: true }, async (tx) => {
      const entry = await tx.pipelineEntry.findUnique({ where: { id: offer.pipelineEntryId }, select: { candidate: { select: { email: true } } } });
      return entry?.candidate.email ?? null;
    });
    if (!email) throw new ConflictException('This offer is no longer available');
    await this.otp.reserveSend(this.esignKey(offer.id), ip);
    const code = await this.otp.issue(this.esignKey(offer.id), { email });
    this.otp.deliver('email', email, code, 'mfa', offer.organizationId, { userId: '' });
    return { sent: true, to: email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }

  async respondPublic(token: string, action: 'accept' | 'decline', sign: { code?: string; disclosureAccepted?: boolean; ip?: string | null; device?: string | null } = {}): Promise<Offer> {
    const offer = await this.resolveOfferByToken(token);
    // Generic conflict messages -- same anti-oracle reasoning as the NotFound above, just
    // surfaced as 409s once the token itself is known-good.
    if (offer.status !== 'sent') throw new ConflictException('This offer is no longer available');
    if (offer.expiresAt < new Date()) throw new ConflictException('This offer has expired');

    const context = { organizationId: offer.organizationId, isSuperAdmin: true };
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    // HIR-09 e-sign (the template switched it on): accepting needs the disclosure read and the emailed one-time code;
    // the evidence (when, from where, the letter's fingerprint) is kept on the offer. Declining never needs a code.
    let esignEvidence: Record<string, unknown> | null = null;
    if (action === 'accept' && offer.esign) {
      if (!sign.disclosureAccepted) throw new BadRequestException({ statusCode: 400, code: 'ESIGN_DISCLOSURE', message: 'Read and accept how electronic signing works first.' });
      if (!sign.code || !this.otp) throw new BadRequestException({ statusCode: 400, code: 'ESIGN_CODE', message: 'Enter the code we emailed you to sign the offer.' });
      if (!(await this.otp.check(this.esignKey(offer.id), sign.code))) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      esignEvidence = { at: new Date().toISOString(), ip: sign.ip ?? null, device: sign.device?.slice(0, 300) ?? null, channel: 'email', assurance: 'one-time code', letterSha256: createHash('sha256').update(offer.letterBody).digest('hex') };
    }

    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      // Compound-precondition write, not a pre-tx-guarded update: two concurrent public
      // requests (double-click, retry) can both pass the reads above, but only one can
      // flip status:'sent' -> newStatus here. The loser gets count:0 and must not write
      // an audit row or trigger a recruiter email -- same generic message, no oracle.
      const respondedAt = new Date();
      const result = await tx.offer.updateMany({
        where: { id: offer.id, organizationId: offer.organizationId, status: 'sent' },
        data: { status: newStatus, respondedAt, ...(esignEvidence ? { esignEvidence: esignEvidence as Prisma.InputJsonValue } : {}) },
      });
      if (result.count === 0) {
        throw new ConflictException('This offer is no longer available');
      }
      await this.audit.record(context, {
        actorUserId: null,
        action: action === 'accept' ? 'offer.accepted' : 'offer.declined',
        entityType: 'offer',
        entityId: offer.id,
        ...(esignEvidence ? { metadata: { esign: true } } : {}),
      });
      return { ...offer, status: newStatus, respondedAt } as Offer;
    });

    // Recruiter notification + fit-scored candidate lookup: OUTSIDE the tx above --
    // emailService.send is a network call and must never run inside a forTenant callback
    // (same three-phase reasoning as sendOffer). Fetched unconditionally (not gated on
    // sentByUserId) since offer.accepted must emit regardless of whether a recruiter email
    // goes out.
    const notify = await this.tenantPrisma.forTenant(context, async (tx) => {
      const recruiter = offer.sentByUserId
        ? await tx.user.findUnique({ where: { id: offer.sentByUserId as string }, select: { email: true } })
        : null;
      const entry = await tx.pipelineEntry.findUnique({
        where: { id: offer.pipelineEntryId },
        select: { candidateId: true, candidate: { select: { name: true } }, job: { select: { title: true } } },
      });
      return {
        recruiterEmail: recruiter?.email,
        candidateName: entry?.candidate.name ?? '',
        candidateId: entry?.candidateId,
        jobTitle: entry?.job.title ?? '',
      };
    });
    if (notify.recruiterEmail) {
      const verb = action === 'accept' ? 'accepted' : 'declined';
      const html = buildCandidateEmailHtml({
        logoUrl: null,
        orgName: null,
        bodyText: `Candidate ${notify.candidateName} has ${verb} the offer for ${notify.jobTitle}.`,
      });
      await this.emailService.send({
        to: notify.recruiterEmail,
        subject: `Offer ${verb}: ${notify.candidateName}`,
        html,
        organizationId: offer.organizationId,
      });
    }

    if (action === 'accept') {
      await this.integrationEvents.emit(offer.organizationId, 'offer.accepted', {
        subject: notify.candidateName,
        roleTitle: notify.jobTitle || undefined,
        linkPath: `/candidates/${notify.candidateId}`,
      });
    }

    return updated;
  }
}
