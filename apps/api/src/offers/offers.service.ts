import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Offer } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { buildOfferPdf } from './offer-pdf';
import { renderOfferTemplate } from './offer-render';

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
  ) {}

  async createOffer(context: TenantContext, actorUserId: string, entryId: string, dto: CreateOfferDto): Promise<Offer> {
    // Template lookup opens its own forTenant read (see OfferTemplatesService.getWithDefault),
    // so it runs before -- not nested inside -- the entry-check/create transaction below, and
    // only when the caller didn't supply both subject and body.
    let letterSubject = dto.subject;
    let letterBody = dto.body;
    if (!letterSubject || !letterBody) {
      const template = await this.offerTemplates.getWithDefault(context);
      letterSubject = letterSubject ?? template.subject;
      letterBody = letterBody ?? template.body;
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

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

  async listForEntry(context: TenantContext, entryId: string): Promise<Offer[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, pipelineEntryId: entryId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listForCandidate(context: TenantContext, candidateId: string): Promise<Offer[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async sendOffer(context: TenantContext, actorUserId: string, offerId: string): Promise<Offer> {
    const orgId = context.organizationId as string;

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
      if (offer.status !== 'draft') throw new BadRequestException('Offer already sent');
      if (offer.pipelineEntry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      const offerToken = randomUUID();
      await tx.offer.update({ where: { id: offerId }, data: { offerToken } });
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorName = actorUserId
        ? ((await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '')
        : '';
      return { offer, candidate: offer.pipelineEntry.candidate, job: offer.pipelineEntry.job, org, actorName, offerToken };
    });

    // Phase 2 (outside any tx): rendering + network calls (PDF build, blob upload, SMTP send).
    const offerLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/offer/${prep.offerToken}`;
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
        data: { status: 'sent', pdfPath, sentAt: new Date(), sentByUserId: actorUserId },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'offer.sent',
        entityType: 'offer',
        entityId: offerId,
        metadata: { to: prep.candidate.email },
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
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      status: offer.status,
      pdfUrl,
    };
  }

  async respondPublic(token: string, action: 'accept' | 'decline'): Promise<Offer> {
    const offer = await this.resolveOfferByToken(token);
    // Generic conflict messages -- same anti-oracle reasoning as the NotFound above, just
    // surfaced as 409s once the token itself is known-good.
    if (offer.status !== 'sent') throw new ConflictException('This offer is no longer available');
    if (offer.expiresAt < new Date()) throw new ConflictException('This offer has expired');

    const context = { organizationId: offer.organizationId, isSuperAdmin: true };
    const newStatus = action === 'accept' ? 'accepted' : 'declined';

    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const upd = await tx.offer.update({
        where: { id: offer.id },
        data: { status: newStatus, respondedAt: new Date() },
      });
      await this.audit.record(context, {
        actorUserId: null,
        action: action === 'accept' ? 'offer.accepted' : 'offer.declined',
        entityType: 'offer',
        entityId: offer.id,
      });
      return upd;
    });

    // Recruiter notification: OUTSIDE the tx above -- emailService.send is a network call and
    // must never run inside a forTenant callback (same three-phase reasoning as sendOffer).
    if (offer.sentByUserId) {
      const notify = await this.tenantPrisma.forTenant(context, async (tx) => {
        const recruiter = await tx.user.findUnique({ where: { id: offer.sentByUserId as string }, select: { email: true } });
        const entry = await tx.pipelineEntry.findUnique({
          where: { id: offer.pipelineEntryId },
          select: { candidate: { select: { name: true } }, job: { select: { title: true } } },
        });
        return { recruiterEmail: recruiter?.email, candidateName: entry?.candidate.name ?? '', jobTitle: entry?.job.title ?? '' };
      });
      if (notify.recruiterEmail) {
        const verb = action === 'accept' ? 'accepted' : 'declined';
        await this.emailService.send({
          to: notify.recruiterEmail,
          subject: `Offer ${verb}: ${notify.candidateName}`,
          html: `<p>Candidate ${notify.candidateName} has ${verb} the offer for ${notify.jobTitle}.</p>`,
          organizationId: offer.organizationId,
        });
      }
    }

    return updated;
  }
}
