import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrgSenderAddress } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { CreateSenderAddressDto } from './dto/create-sender-address.dto';
import { UpdateSenderAddressDto } from './dto/update-sender-address.dto';

@Injectable()
export class OrgSenderAddressesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // Shared exactly-one-default invariant helper: unsets every default sender for the org so a
  // caller can then set exactly one. Always called inside the same forTenant tx as the write
  // that establishes the new default, so the org never observes zero-or-many defaults.
  private clearOrgDefault(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.orgSenderAddress.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
  }

  async list(context: TenantContext): Promise<OrgSenderAddress[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgSenderAddress.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
      }),
    );
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateSenderAddressDto): Promise<OrgSenderAddress> {
    let created: OrgSenderAddress;
    try {
      created = await this.tenantPrisma.forTenant(context, async (tx) => {
        const organizationId = context.organizationId as string;
        const existingCount = await tx.orgSenderAddress.count({ where: { organizationId } });
        // First sender for the org is always forced default -- there is no valid "no default"
        // state once at least one sender exists.
        const shouldBeDefault = existingCount === 0 || dto.isDefault === true;
        if (shouldBeDefault) {
          await this.clearOrgDefault(tx, organizationId);
        }
        return tx.orgSenderAddress.create({
          data: { organizationId, label: dto.label, address: dto.address, isDefault: shouldBeDefault },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A sender address "${dto.address}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, {
      actorUserId,
      action: 'org_sender_address.created',
      entityType: 'org_sender_address',
      entityId: created.id,
      metadata: { label: created.label, address: created.address, isDefault: created.isDefault },
    });
    return created;
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateSenderAddressDto): Promise<OrgSenderAddress> {
    let updated: OrgSenderAddress;
    try {
      updated = await this.tenantPrisma.forTenant(context, async (tx) => {
        const organizationId = context.organizationId as string;
        const existing = await tx.orgSenderAddress.findFirst({ where: { id, organizationId } });
        if (!existing) throw new NotFoundException(`Sender address ${id} not found`);

        const data: Prisma.OrgSenderAddressUpdateInput = {};
        if (dto.label !== undefined) data.label = dto.label;
        if (dto.address !== undefined) data.address = dto.address;
        // isDefault:true clears every sibling first, then sets self. isDefault:false is
        // deliberately ignored -- the invariant never allows the org to drop to zero defaults
        // via an explicit unset; only remove() (promoting a survivor) or setting another
        // sender's isDefault:true can change who the default is.
        if (dto.isDefault === true) {
          await this.clearOrgDefault(tx, organizationId);
          data.isDefault = true;
        }
        return tx.orgSenderAddress.update({ where: { id }, data });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A sender address "${dto.address}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, {
      actorUserId,
      action: 'org_sender_address.updated',
      entityType: 'org_sender_address',
      entityId: id,
      metadata: { label: dto.label, address: dto.address, isDefault: dto.isDefault },
    });
    return updated;
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const existing = await tx.orgSenderAddress.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException(`Sender address ${id} not found`);

      await tx.orgSenderAddress.delete({ where: { id } });

      if (existing.isDefault) {
        // Promote the most-recently-updated survivor so the org never sits with zero defaults
        // while other senders remain. Deleting the last sender leaves none -- EmailService's
        // resolution chain falls through to org.emailFromAddress as documented in the design.
        const promoted = await tx.orgSenderAddress.findFirst({
          where: { organizationId },
          orderBy: { updatedAt: 'desc' },
        });
        if (promoted) {
          await tx.orgSenderAddress.update({ where: { id: promoted.id }, data: { isDefault: true } });
        }
      }
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'org_sender_address.deleted',
      entityType: 'org_sender_address',
      entityId: id,
    });
    return { success: true };
  }
}
