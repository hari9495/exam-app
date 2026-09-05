import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';

export interface UserGroupWithMembers {
  id: string;
  name: string;
  description: string | null;
  members: { userId: string; name: string | null; email: string }[];
}

@Injectable()
export class UserGroupsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private async hydrate(tx: any, orgId: string, groups: { id: string; name: string; description: string | null }[]): Promise<UserGroupWithMembers[]> {
    if (groups.length === 0) return [];
    const groupIds = groups.map((g) => g.id);
    const members = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId: { in: groupIds } }, select: { groupId: true, userId: true } });
    const userIds = [...new Set(members.map((m: { userId: string }) => m.userId))];
    const users = userIds.length ? await tx.user.findMany({ where: { id: { in: userIds }, organizationId: orgId }, select: { id: true, name: true, email: true } }) : [];
    const userById = new Map<string, { id: string; name: string | null; email: string }>(
      users.map((u: { id: string; name: string | null; email: string }) => [u.id, u]),
    );
    const byGroup = new Map<string, { userId: string; name: string | null; email: string }[]>();
    for (const m of members) {
      const u = userById.get(m.userId);
      if (!u) continue;
      const arr = byGroup.get(m.groupId) ?? [];
      arr.push({ userId: u.id, name: u.name, email: u.email });
      byGroup.set(m.groupId, arr);
    }
    return groups.map((g) => ({ id: g.id, name: g.name, description: g.description, members: byGroup.get(g.id) ?? [] }));
  }

  list(context: TenantContext): Promise<UserGroupWithMembers[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const groups = await tx.userGroup.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } });
      return this.hydrate(tx, orgId, groups);
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateUserGroupDto): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const clash = await tx.userGroup.findFirst({ where: { organizationId: orgId, name: dto.name }, select: { id: true } });
      if (clash) throw new BadRequestException(`A group named "${dto.name}" already exists`);
      const group = await tx.userGroup.create({ data: { organizationId: orgId, name: dto.name, description: dto.description ?? null }, select: { id: true, name: true, description: true } });
      if (dto.memberUserIds?.length) await this.applyMembers(tx, orgId, group.id, dto.memberUserIds);
      await this.audit.record(context, { actorUserId, action: 'user_group.created', entityType: 'user_group', entityId: group.id, metadata: { name: group.name } });
      return (await this.hydrate(tx, orgId, [group]))[0];
    });
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateUserGroupDto): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
      if (!existing) throw new NotFoundException(`User group ${id} not found`);
      if (dto.name !== undefined) {
        const clash = await tx.userGroup.findFirst({ where: { organizationId: orgId, name: dto.name, id: { not: id } }, select: { id: true } });
        if (clash) throw new BadRequestException(`A group named "${dto.name}" already exists`);
      }
      const group = await tx.userGroup.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.description !== undefined ? { description: dto.description || null } : {}) },
        select: { id: true, name: true, description: true },
      });
      await this.audit.record(context, { actorUserId, action: 'user_group.updated', entityType: 'user_group', entityId: id, metadata: {} });
      return (await this.hydrate(tx, orgId, [group]))[0];
    });
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ id: string }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
      if (!existing) throw new NotFoundException(`User group ${id} not found`);
      await tx.userGroupMember.deleteMany({ where: { organizationId: orgId, groupId: id } });
      await tx.userGroup.delete({ where: { id } });
      await this.audit.record(context, { actorUserId, action: 'user_group.deleted', entityType: 'user_group', entityId: id, metadata: {} });
      return { id };
    });
  }

  async setMembers(context: TenantContext, actorUserId: string, id: string, userIds: string[]): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const group = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: { id: true, name: true, description: true } });
      if (!group) throw new NotFoundException(`User group ${id} not found`);
      await this.applyMembers(tx, orgId, id, userIds);
      await this.audit.record(context, { actorUserId, action: 'user_group.members_changed', entityType: 'user_group', entityId: id, metadata: { count: [...new Set(userIds)].length } });
      return (await this.hydrate(tx, orgId, [group]))[0];
    });
  }

  // Validate + diff membership to the desired set.
  private async applyMembers(tx: any, orgId: string, groupId: string, desiredRaw: string[]): Promise<void> {
    const desired = [...new Set(desiredRaw)];
    if (desired.length) {
      const valid = await tx.user.findMany({ where: { id: { in: desired }, organizationId: orgId, status: 'active' }, select: { id: true } });
      if (valid.length !== desired.length) throw new BadRequestException('One or more users are not active members of this organization');
    }
    const current = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId }, select: { userId: true } });
    const currentSet = new Set(current.map((m: { userId: string }) => m.userId));
    const desiredSet = new Set(desired);
    const toAdd = desired.filter((u) => !currentSet.has(u));
    const toRemove = [...currentSet].filter((u) => !desiredSet.has(u as string)) as string[];
    if (toRemove.length) await tx.userGroupMember.deleteMany({ where: { organizationId: orgId, groupId, userId: { in: toRemove } } });
    if (toAdd.length) await tx.userGroupMember.createMany({ data: toAdd.map((userId) => ({ organizationId: orgId, groupId, userId })) });
  }

  directory(context: TenantContext): Promise<{ id: string; name: string; memberIds: string[] }[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const groups = await tx.userGroup.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      if (groups.length === 0) return [];
      const members = await tx.userGroupMember.findMany({ where: { organizationId: orgId }, select: { groupId: true, userId: true } });
      const byGroup = new Map<string, string[]>();
      for (const m of members) { const a = byGroup.get(m.groupId) ?? []; a.push(m.userId); byGroup.set(m.groupId, a); }
      return groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name, memberIds: byGroup.get(g.id) ?? [] }));
    });
  }

  mine(context: TenantContext, userId: string): Promise<{ groupIds: string[]; coMemberUserIds: string[] }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const mine = await tx.userGroupMember.findMany({ where: { organizationId: orgId, userId }, select: { groupId: true } });
      const groupIds = mine.map((m: { groupId: string }) => m.groupId);
      if (groupIds.length === 0) return { groupIds: [], coMemberUserIds: [] };
      const co = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId: { in: groupIds } }, select: { userId: true } });
      const coMemberUserIds = [...new Set(co.map((m: { userId: string }) => m.userId))].filter((u) => u !== userId) as string[];
      return { groupIds, coMemberUserIds };
    });
  }
}
