import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PrismaService,
  TenantContext,
  AuditService,
  GOVERNABLE_ROLES,
  FieldEntity,
  FieldPermissionConfig,
  parseFieldPermissions,
  validateFieldPermissions,
  hiddenFieldsFor,
} from '@exam-platform/shared';

@Injectable()
export class FieldPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getHiddenFields(context: TenantContext, role: string, entity: FieldEntity): Promise<Set<string>> {
    if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { fieldPermissionsJson: true },
    });
    return hiddenFieldsFor(parseFieldPermissions(org?.fieldPermissionsJson), entity, role);
  }

  async getConfig(context: TenantContext): Promise<FieldPermissionConfig> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { fieldPermissionsJson: true },
    });
    return parseFieldPermissions(org?.fieldPermissionsJson);
  }

  async setConfig(context: TenantContext, actorUserId: string, input: unknown): Promise<FieldPermissionConfig> {
    const organizationId = this.requireOrganizationId(context);
    let cfg: FieldPermissionConfig;
    try {
      cfg = validateFieldPermissions(input);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { fieldPermissionsJson: JSON.stringify(cfg) },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.field_permissions_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return cfg;
  }

  private requireOrganizationId(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('No organization context for this account');
    }
    return context.organizationId;
  }
}
