import { Injectable, NotFoundException } from '@nestjs/common';
import { OfferTemplate } from '@prisma/client';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';

export interface OfferTemplateView {
  id: string | null;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  /** HIR-09: the candidate signs electronically (a one-time code) only when this is on. */
  esign: boolean;
}

@Injectable()
export class OfferTemplatesService {
  // Answer 2515: read-only. The older free-text offer path still reads its template; templates are kept and changed in Letters.
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private toView(row: OfferTemplate): OfferTemplateView {
    return { id: row.id, name: row.name, subject: row.subject, body: row.body, isDefault: row.isDefault, esign: row.esign };
  }

  async getDefault(context: TenantContext): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.offerTemplate.findFirst({
        where: { organizationId: context.organizationId as string, isDefault: true },
      });
      if (row) return this.toView(row);
      return { id: null, name: 'Default offer letter', isDefault: true, esign: false, ...DEFAULT_OFFER_TEMPLATE };
    });
  }

  async getById(context: TenantContext, id: string): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.offerTemplate.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!row) throw new NotFoundException(`Offer template ${id} not found`);
      return this.toView(row);
    });
  }
}
