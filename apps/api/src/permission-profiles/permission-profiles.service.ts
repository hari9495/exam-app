import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PermissionProfile } from '@prisma/client';
import { PrismaService, TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { assignablePermissions, isAssignableKey, AssignablePermission } from '../rbac/assignable-permissions';
import { UpsertPermissionProfileDto, UpdatePermissionProfileDto } from './dto/upsert-permission-profile.dto';

export interface PermissionProfileDto {
  id: string;
  organizationId: string;
  name: string;
  permissions: string[];
  assignedUserCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PermissionProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // The catalog a profile editor may pick from -- not tenant-scoped (see assignable-permissions.ts).
  async assignablePermissions(): Promise<AssignablePermission[]> {
    return assignablePermissions(this.prisma);
  }

  async list(context: TenantContext): Promise<PermissionProfileDto[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const profiles = await tx.permissionProfile.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });
      return Promise.all(
        profiles.map(async (profile) => {
          const assignedUserCount = await tx.user.count({ where: { permissionProfileId: profile.id } });
          return this.toDto(profile, assignedUserCount);
        }),
      );
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertPermissionProfileDto): Promise<PermissionProfileDto> {
    await this.validatePermissions(dto.permissions);

    let created: PermissionProfile;
    try {
      created = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.permissionProfile.create({
          data: {
            organizationId: context.organizationId as string,
            name: dto.name,
            permissionsJson: JSON.stringify(dto.permissions),
          },
        }),
      );
    } catch (error) {
      throw this.mapDuplicateName(error, dto.name);
    }

    await this.audit.record(context, {
      actorUserId,
      action: 'permission_profile.created',
      entityType: 'permission_profile',
      entityId: created.id,
      metadata: { name: created.name, permissions: dto.permissions },
    });
    return this.toDto(created, 0);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdatePermissionProfileDto): Promise<PermissionProfileDto> {
    if (dto.permissions !== undefined) {
      await this.validatePermissions(dto.permissions);
    }

    let result: { row: PermissionProfile; assignedUserCount: number };
    try {
      result = await this.tenantPrisma.forTenant(context, async (tx) => {
        const organizationId = context.organizationId as string;
        const existing = await tx.permissionProfile.findFirst({ where: { id, organizationId } });
        if (!existing) throw new NotFoundException(`Permission profile ${id} not found`);

        const data: Prisma.PermissionProfileUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.permissions !== undefined) data.permissionsJson = JSON.stringify(dto.permissions);
        const row = await tx.permissionProfile.update({ where: { id }, data });
        const assignedUserCount = await tx.user.count({ where: { permissionProfileId: id } });
        return { row, assignedUserCount };
      });
    } catch (error) {
      throw this.mapDuplicateName(error, dto.name);
    }

    await this.audit.record(context, {
      actorUserId,
      action: 'permission_profile.updated',
      entityType: 'permission_profile',
      entityId: id,
      metadata: { name: dto.name, permissions: dto.permissions },
    });
    return this.toDto(result.row, result.assignedUserCount);
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const organizationId = context.organizationId as string;
      const existing = await tx.permissionProfile.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException(`Permission profile ${id} not found`);

      const assignedUserCount = await tx.user.count({ where: { permissionProfileId: id } });
      if (assignedUserCount > 0) {
        // Do NOT cascade/null the assignees -- surface the count and let an admin reassign
        // them first (assignment UI lands in Task 5).
        throw new ConflictException(`Cannot delete: ${assignedUserCount} user(s) are assigned to this profile`);
      }

      await tx.permissionProfile.delete({ where: { id } });
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'permission_profile.deleted',
      entityType: 'permission_profile',
      entityId: id,
    });
    return { success: true };
  }

  // permissions must be a subset of the assignable catalog: reject a non-assignable key (even if
  // it's a real permission) and reject any key the Permission catalog doesn't recognize at all.
  private async validatePermissions(permissions: string[]): Promise<void> {
    const catalog = await assignablePermissions(this.prisma);
    const catalogKeys = new Set(catalog.map((p) => p.key));
    for (const key of permissions) {
      if (!isAssignableKey(key)) {
        throw new BadRequestException(`Permission "${key}" is not assignable to a profile`);
      }
      if (!catalogKeys.has(key)) {
        throw new BadRequestException(`Unknown permission "${key}"`);
      }
    }
  }

  private mapDuplicateName(error: unknown, name: string | undefined): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(`A permission profile named "${name}" already exists`);
    }
    return error;
  }

  private toDto(profile: PermissionProfile, assignedUserCount: number): PermissionProfileDto {
    return {
      id: profile.id,
      organizationId: profile.organizationId,
      name: profile.name,
      permissions: JSON.parse(profile.permissionsJson),
      assignedUserCount,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
