import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  async forTenant<T>(
    context: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = ${context.organizationId}`;
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = ${context.isSuperAdmin ? 1 : 0}`;
      try {
        return await fn(tx);
      } finally {
        // sp_set_session_context is scoped to the physical connection, not the
        // transaction, and is not undone by rollback. Prisma returns this
        // connection to its pool once this callback resolves, so without this
        // reset a later query that bypasses forTenant on the same pooled
        // connection would silently inherit this request's tenant context.
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0`;
      }
    });
  }
}
