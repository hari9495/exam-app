import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferTemplate, Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';
import { CreateOfferTemplateDto } from './dto/create-offer-template.dto';
import { UpdateOfferTemplateDto } from './dto/update-offer-template.dto';

export interface OfferTemplateView {
  id: string | null;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class OfferTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private toView(row: OfferTemplate): OfferTemplateView {
    return { id: row.id, name: row.name, subject: row.subject, body: row.body, isDefault: row.isDefault };
  }

  // The one place that enforces "at most one isDefault row per org" -- clears every row's flag
  // so a caller can then set exactly one back to true. Reused by create (new default), update
  // (promoting the edited row) and remove (promoting a replacement after the default is deleted);
  // it's a harmless no-op when nothing is currently flagged, which is what remove relies on.
  private async clearOrgDefault(tx: Tx, organizationId: string): Promise<void> {
    await tx.offerTemplate.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  async list(context: TenantContext): Promise<OfferTemplateView[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.offerTemplate.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
      return rows.map((row) => this.toView(row));
    });
  }

  async getDefault(context: TenantContext): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.offerTemplate.findFirst({
        where: { organizationId: context.organizationId as string, isDefault: true },
      });
      if (row) return this.toView(row);
      return { id: null, name: 'Default offer letter', isDefault: true, ...DEFAULT_OFFER_TEMPLATE };
    });
  }

  async getById(context: TenantContext, id: string): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.offerTemplate.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!row) throw new NotFoundException(`Offer template ${id} not found`);
      return this.toView(row);
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateOfferTemplateDto): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      // An org's first template is always the default -- there's never a moment with saved
      // templates and no default.
      const existingCount = await tx.offerTemplate.count({ where: { organizationId: orgId } });
      const isDefault = existingCount === 0 || dto.isDefault === true;
      if (isDefault) {
        await this.clearOrgDefault(tx, orgId);
      }

      let row: OfferTemplate;
      try {
        row = await tx.offerTemplate.create({
          data: { organizationId: orgId, name: dto.name, subject: dto.subject, body: dto.body, isDefault },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(`A template named "${dto.name}" already exists`);
        }
        throw error;
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'offer_template.created',
        entityType: 'offer_template',
        entityId: row.id,
        metadata: { name: row.name },
      });
      return this.toView(row);
    });
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateOfferTemplateDto): Promise<OfferTemplateView> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const existing = await tx.offerTemplate.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException(`Offer template ${id} not found`);

      // isDefault:false is silently ignored -- exactly-one-default is auto-maintained, so a
      // template can only stop being the default by another one being promoted instead (see
      // update with isDefault:true, and remove's auto-promotion).
      const data: Prisma.OfferTemplateUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.subject !== undefined) data.subject = dto.subject;
      if (dto.body !== undefined) data.body = dto.body;
      if (dto.isDefault === true) {
        await this.clearOrgDefault(tx, orgId);
        data.isDefault = true;
      }

      let row: OfferTemplate;
      try {
        row = await tx.offerTemplate.update({ where: { id }, data });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(`A template named "${dto.name}" already exists`);
        }
        throw error;
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'offer_template.updated',
        entityType: 'offer_template',
        entityId: id,
        metadata: { name: row.name },
      });
      return this.toView(row);
    });
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ success: true }> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const existing = await tx.offerTemplate.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException(`Offer template ${id} not found`);

      await tx.offerTemplate.delete({ where: { id } });

      if (existing.isDefault) {
        // Promote the most-recently-updated survivor so the org keeps a default. If none remain,
        // the org has zero templates and getDefault falls back to DEFAULT_OFFER_TEMPLATE.
        const replacement = await tx.offerTemplate.findFirst({
          where: { organizationId: orgId },
          orderBy: { updatedAt: 'desc' },
        });
        if (replacement) {
          await this.clearOrgDefault(tx, orgId);
          await tx.offerTemplate.update({ where: { id: replacement.id }, data: { isDefault: true } });
        }
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'offer_template.deleted',
        entityType: 'offer_template',
        entityId: id,
        metadata: { name: existing.name },
      });
      return { success: true };
    });
  }
}
