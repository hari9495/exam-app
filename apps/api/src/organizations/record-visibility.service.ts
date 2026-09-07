import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService, TenantContext, AuditService } from '@exam-platform/shared';

// Small dedicated service (mirrors field-permissions.service.ts) rather than growing the
// already-809-line organizations.service.ts. Same idiom as getBusinessHours/updateBusinessHours:
// plain PrismaService scoped by requireOrganizationId, audit written after the update (no tx).
@Injectable()
export class RecordVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getRecordVisibility(context: TenantContext): Promise<{ enabled: boolean }> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findFirstOrThrow({
      where: { id: organizationId },
      select: { recordVisibilityEnabled: true },
    });
    return { enabled: org.recordVisibilityEnabled };
  }

  async setRecordVisibility(context: TenantContext, enabled: boolean): Promise<{ enabled: boolean }> {
    const organizationId = this.requireOrganizationId(context);
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { recordVisibilityEnabled: enabled },
    });
    await this.audit.record(context, {
      actorUserId: context.userId ?? null,
      action: 'organization.record_visibility_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { enabled };
  }

  private requireOrganizationId(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('No organization context for this account');
    }
    return context.organizationId;
  }
}
