import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

@Injectable()
export class TagsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.tag.findMany({ where: { organizationId: context.organizationId as string }, orderBy: { name: 'asc' } }),
    );
  }
}
