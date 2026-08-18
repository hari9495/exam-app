import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';
import { UpsertOfferTemplateDto } from './dto/upsert-offer-template.dto';

export interface OfferTemplateView {
  id: string | null;
  subject: string;
  body: string;
}

@Injectable()
export class OfferTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async getWithDefault(context: TenantContext): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const saved = await tx.offerTemplate.findFirst({
        where: { organizationId: context.organizationId as string },
      });
      if (saved) return { id: saved.id, subject: saved.subject, body: saved.body };
      return { id: null, ...DEFAULT_OFFER_TEMPLATE };
    });
  }

  // One row per org -- upsert-by-org rather than upsert-by-id, since there's exactly one
  // offer template per tenant (unlike candidate-email templates, which are per triggerEvent).
  async upsert(context: TenantContext, actorUserId: string, dto: UpsertOfferTemplateDto) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const existing = await tx.offerTemplate.findFirst({ where: { organizationId: orgId } });
      const data = { organizationId: orgId, subject: dto.subject, body: dto.body };
      const row = existing
        ? await tx.offerTemplate.update({ where: { id: existing.id }, data })
        : await tx.offerTemplate.create({ data });

      await this.audit.record(context, {
        actorUserId,
        action: 'offer_template.saved',
        entityType: 'offer_template',
        entityId: row.id,
      });
      return row;
    });
  }
}
