import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { assertOwnRecords, normaliseRules, refreshRuleGroup, withAllKinds, type GroupRules } from './group-rules';
import { toBin } from '../recycle-bin/bin';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';

export interface UserGroupWithMembers {
  id: string;
  name: string;
  description: string | null;
  /** T2-G 42: null for a hand-picked group; else the rules its members are worked out from. */
  rules: GroupRules | null;
  membersRefreshedAt: Date | null;
  members: { userId: string; name: string | null; email: string }[];
}

type GroupRow = { id: string; name: string; description: string | null; rules?: unknown; membersRefreshedAt?: Date | null };
const GROUP = { id: true, name: true, description: true, rules: true, membersRefreshedAt: true } as const;
/** Hiring's own groups (directory, mine) are the hand-picked ones: a rule group gives no record visibility. */
const HAND_PICKED = { rules: { equals: Prisma.DbNull } };

@Injectable()
export class UserGroupsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private async hydrate(tx: any, orgId: string, groups: GroupRow[]): Promise<UserGroupWithMembers[]> {
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
    return groups.map((g) => ({ id: g.id, name: g.name, description: g.description, rules: g.rules ? withAllKinds(g.rules) : null, membersRefreshedAt: g.membersRefreshedAt ?? null, members: byGroup.get(g.id) ?? [] }));
  }

  list(context: TenantContext): Promise<UserGroupWithMembers[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const groups = await tx.userGroup.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' }, select: GROUP });
      return this.hydrate(tx, orgId, groups);
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateUserGroupDto): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    const { result, name } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const clash = await tx.userGroup.findFirst({ where: { organizationId: orgId, name: dto.name }, select: { id: true } });
      if (clash) throw new BadRequestException(`A group named "${dto.name}" already exists`);
      const rules = dto.rules ? normaliseRules(dto.rules) : null;
      if (rules && dto.memberUserIds?.length) throw new BadRequestException('A group worked out from rules has no hand-picked members.');
      if (rules) await assertOwnRecords(tx, orgId, rules);
      const group = await tx.userGroup.create({ data: { organizationId: orgId, name: dto.name, description: dto.description ?? null, ...(rules ? { rules } : {}) }, select: GROUP });
      if (dto.memberUserIds?.length) await this.applyMembers(tx, orgId, group.id, dto.memberUserIds);
      if (rules) await refreshRuleGroup(tx, orgId, { id: group.id, rules });
      const result = (await this.hydrate(tx, orgId, [group]))[0];
      return { result, name: group.name };
    });
    await this.audit.record(context, { actorUserId, action: 'user_group.created', entityType: 'user_group', entityId: result.id, metadata: { name, ...(dto.rules ? { rules: result.rules, members: result.members.length } : {}) } });
    return result;
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateUserGroupDto): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    let before: { name: string; description: string | null; rules?: unknown } | null = null;
    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: GROUP });
      if (!existing) throw new NotFoundException(`User group ${id} not found`);
      before = { name: existing.name, description: existing.description, ...(existing.rules ? { rules: existing.rules } : {}) };
      const rules = dto.rules ? normaliseRules(dto.rules) : null;
      if (rules && !existing.rules) throw new BadRequestException('This group is picked by hand. Make a new group to work its members out from rules.');
      if (rules) await assertOwnRecords(tx, orgId, rules);
      if (dto.name !== undefined) {
        const clash = await tx.userGroup.findFirst({ where: { organizationId: orgId, name: dto.name, id: { not: id } }, select: { id: true } });
        if (clash) throw new BadRequestException(`A group named "${dto.name}" already exists`);
      }
      const group = await tx.userGroup.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.description !== undefined ? { description: dto.description || null } : {}), ...(rules ? { rules } : {}) },
        select: GROUP,
      });
      if (rules) await refreshRuleGroup(tx, orgId, { id, rules });
      return (await this.hydrate(tx, orgId, [group]))[0];
    });
    // Answer 2430: the audit keeps the name and description before and after.
    await this.audit.record(context, { actorUserId, action: 'user_group.updated', entityType: 'user_group', entityId: id, metadata: { before, after: { name: result.name, description: result.description, ...(result.rules ? { rules: result.rules, members: result.members.length } : {}) } } });
    return result;
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ id: string }> {
    const orgId = context.organizationId as string;
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.userGroup.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException(`User group ${id} not found`);
      // Answer 2439: the group and its members wait in the recycle bin (candidate assignments to it are not restored).
      const members = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId: id } });
      await toBin(tx, { organizationId: orgId, userId: actorUserId }, 'user_group', existing, existing.name, { userGroupMember: members });
      await tx.userGroupMember.deleteMany({ where: { organizationId: orgId, groupId: id } });
      await tx.pipelineEntry.updateMany({ where: { organizationId: orgId, assignedGroupId: id }, data: { assignedGroupId: null } });
      await tx.userGroup.delete({ where: { id } });
      return { id };
    });
    await this.audit.record(context, { actorUserId, action: 'user_group.deleted', entityType: 'user_group', entityId: id, metadata: {} });
    return { id };
  }

  async setMembers(context: TenantContext, actorUserId: string, id: string, userIds: string[]): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    const { result, count, was } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const group = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: GROUP });
      if (!group) throw new NotFoundException(`User group ${id} not found`);
      if (group.rules) throw new BadRequestException('Members of this group are worked out from its rules. Change the rules instead.');
      const was = await this.applyMembers(tx, orgId, id, userIds);
      const result = (await this.hydrate(tx, orgId, [group]))[0];
      return { result, count: [...new Set(userIds)].length, was };
    });
    // Answer 2430: who joined and who left, not only the count.
    const now = [...new Set(userIds)];
    await this.audit.record(context, { actorUserId, action: 'user_group.members_changed', entityType: 'user_group', entityId: id, metadata: { count, added: now.filter((u) => !was.includes(u)), removed: was.filter((u) => !now.includes(u)) } });
    return result;
  }

  // Validate + diff membership to the desired set; returns who was in it before.
  private async applyMembers(tx: any, orgId: string, groupId: string, desiredRaw: string[]): Promise<string[]> {
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
    return [...currentSet] as string[];
  }

  /** T2-G 42: the groups an audience or approver picker offers (name, how members come, how many today). */
  options(context: TenantContext): Promise<{ id: string; name: string; ruleBased: boolean; members: number }[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const groups = await tx.userGroup.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' }, select: { id: true, name: true, rules: true } });
      const counts = await tx.userGroupMember.groupBy({ by: ['groupId'], where: { organizationId: orgId }, _count: { _all: true } });
      return groups.map((g) => ({ id: g.id, name: g.name, ruleBased: g.rules !== null, members: counts.find((c) => c.groupId === g.id)?._count._all ?? 0 }));
    });
  }

  /** T2-G 42: works out a rule group's members now (from the nightly sweep or on request); audited when anyone joins or leaves. */
  async refresh(context: TenantContext, actorUserId: string | null, id: string): Promise<UserGroupWithMembers> {
    const orgId = context.organizationId as string;
    const { result, change } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const group = await tx.userGroup.findFirst({ where: { id, organizationId: orgId }, select: GROUP });
      if (!group) throw new NotFoundException(`User group ${id} not found`);
      if (!group.rules) throw new BadRequestException('This group is picked by hand: there is nothing to work out.');
      const change = await refreshRuleGroup(tx, orgId, group);
      const fresh = await tx.userGroup.findFirstOrThrow({ where: { id }, select: GROUP });
      return { result: (await this.hydrate(tx, orgId, [fresh]))[0], change };
    });
    if (change.added.length || change.removed.length) await this.audit.record(context, { actorUserId: actorUserId ?? undefined, action: 'user_group.members_worked_out', entityType: 'user_group', entityId: id, metadata: { added: change.added, removed: change.removed, count: result.members.length } } as never);
    return result;
  }

  /** The nightly sweep (T2-G 42): every company with rule groups, one company at a time; one company's failure stops no other. */
  async sweep(): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => (await tx.userGroup.findMany({ where: { NOT: HAND_PICKED }, distinct: ['organizationId'], select: { organizationId: true } })).map((g) => g.organizationId));
    let n = 0;
    for (const organizationId of orgs) n += await this.refreshAll({ organizationId, isSuperAdmin: false } as TenantContext).catch(() => 0);
    return n;
  }

  /** Every rule group of the company. */
  async refreshAll(context: TenantContext): Promise<number> {
    const ids = await this.tenantPrisma.forTenant(context, async (tx) => (await tx.userGroup.findMany({ where: { organizationId: context.organizationId as string, NOT: HAND_PICKED }, select: { id: true } })).map((g) => g.id));
    for (const id of ids) await this.refresh(context, null, id);
    return ids.length;
  }

  directory(context: TenantContext): Promise<{ id: string; name: string; memberIds: string[] }[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const groups = await tx.userGroup.findMany({ where: { organizationId: orgId, ...HAND_PICKED }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      if (groups.length === 0) return [];
      const members = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId: { in: groups.map((g: { id: string }) => g.id) } }, select: { groupId: true, userId: true } });
      const byGroup = new Map<string, string[]>();
      for (const m of members) { const a = byGroup.get(m.groupId) ?? []; a.push(m.userId); byGroup.set(m.groupId, a); }
      return groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name, memberIds: byGroup.get(g.id) ?? [] }));
    });
  }

  mine(context: TenantContext, userId: string): Promise<{ groupIds: string[]; coMemberUserIds: string[] }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const hand = (await tx.userGroup.findMany({ where: { organizationId: orgId, ...HAND_PICKED }, select: { id: true } })).map((g: { id: string }) => g.id);
      const mine = await tx.userGroupMember.findMany({ where: { organizationId: orgId, userId, groupId: { in: hand } }, select: { groupId: true } });
      const groupIds = mine.map((m: { groupId: string }) => m.groupId);
      if (groupIds.length === 0) return { groupIds: [], coMemberUserIds: [] };
      const co = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId: { in: groupIds } }, select: { userId: true } });
      const coMemberUserIds = [...new Set(co.map((m: { userId: string }) => m.userId))].filter((u) => u !== userId) as string[];
      return { groupIds, coMemberUserIds };
    });
  }
}
