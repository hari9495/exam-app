import { Injectable, NotFoundException } from '@nestjs/common';
import { Offer } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { buildOfferPdf } from './offer-pdf';
import { renderOfferTemplate } from './offer-render';

@Injectable()
export class OffersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly offerTemplates: OfferTemplatesService,
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
}
