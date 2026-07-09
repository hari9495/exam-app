import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';

interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async record(context: TenantContext, entry: AuditEntry): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
        },
      }),
    );
  }
}
