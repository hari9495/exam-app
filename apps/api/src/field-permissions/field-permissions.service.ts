import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PrismaService,
  TenantPrismaService,
  TenantContext,
  AuditService,
  GOVERNABLE_ROLES,
  FieldEntity,
  FieldPermissionConfig,
  UserFieldPermissionConfig,
  parseFieldPermissions,
  parseUserFieldPermissions,
  validateFieldPermissions,
  resolveHiddenFields,
  resolveLockedFields,
} from '@exam-platform/shared';

@Injectable()
export class FieldPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async getHiddenFields(context: TenantContext, role: string, entity: FieldEntity): Promise<Set<string>> {
    if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
    const [orgCfg, userCfg] = await Promise.all([this.orgConfig(context), this.userConfig(context)]);
    return resolveHiddenFields(orgCfg, userCfg, entity, role);
  }

  // Fields this role may not edit (readonly OR hidden) -- enforced on write paths.
  async getLockedFields(context: TenantContext, role: string, entity: FieldEntity): Promise<Set<string>> {
    if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
    const [orgCfg, userCfg] = await Promise.all([this.orgConfig(context), this.userConfig(context)]);
    return resolveLockedFields(orgCfg, userCfg, entity, role);
  }

  private async orgConfig(context: TenantContext): Promise<FieldPermissionConfig> {
    const organizationId = this.requireOrganizationId(context);
    // organizations is NOT an RLS table -- a raw read is correct here.
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { fieldPermissionsJson: true },
    });
    return parseFieldPermissions(org?.fieldPermissionsJson);
  }

  // The caller's per-user overrides come from the permission profile assigned to them (if any).
  // permission_profiles is RLS-scoped, so this must read through forTenant.
  private async userConfig(context: TenantContext): Promise<UserFieldPermissionConfig> {
    const profileId = context.permissionProfileId;
    if (!profileId) return {};
    const profile = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.permissionProfile.findFirst({ where: { id: profileId }, select: { fieldPermissionsJson: true } }),
    );
    return parseUserFieldPermissions(profile?.fieldPermissionsJson ?? null);
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
