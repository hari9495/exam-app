# User Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins create named groups of staff users, usable as a candidate-assignment target (user XOR group), a "my team's candidates" board filter, and a mention/notify audience.

**Architecture:** Two new tenant-scoped tables (`UserGroup`, `UserGroupMember`) + paired RLS, plus an additive `PipelineEntry.assignedGroupId` column. A config API (new `users:manage_groups` permission, org-admin only) does group CRUD + membership. Consumers reuse existing plumbing: assignment extends the current `assignEntry`/`AssignEntryDto`; the visibility filter is client-side like the existing "My candidates"; the mention audience expands groups to member ids client-side into the existing `mentionedUserIds` path (no API change).

**Tech Stack:** NestJS + Prisma + SQL Server (mssql, RLS), Next.js App Router (v2 UI), TanStack Query, class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-09-06-user-groups-design.md`

## Global Constraints

- **NEVER run `npm install`/`npm ci`/`npm update`** (worktree junction disk-fill hazard). Use only `npx prisma generate`/`npx prisma migrate deploy`/`npx prisma db seed` and existing `npx jest`/`npx tsc`.
- **Migrations are hand-authored additive raw SQL** (SQL Server). New tenant-scoped tables need a **paired `_rls` migration** — `ALTER SECURITY POLICY dbo.TenantAccessPolicy` cannot share a `CREATE TABLE` batch. Policy `dbo.TenantAccessPolicy`; predicate `dbo.fn_tenant_access_predicate(organization_id)`. Migration timestamps: `20260906100000_user_groups` + `20260906100001_user_groups_rls` (sort after the parked custom-fields `20260906090000/090001` to stay linear on a later merge).
- **This feature adds a permission (`users:manage_groups`) → a `npx prisma db seed` run is required** (dev: in Task 1; prod: in the deploy). Seed is idempotent.
- **apps/web CANNOT import `@exam-platform/shared` VALUES at runtime** — inline types web-side.
- **Tenant scoping:** every service write wraps `this.tenantPrisma.forTenant(context, async (tx) => …)`; every tenant row carries `organizationId String @map("organization_id") @db.UniqueIdentifier`. `TenantContext = { organizationId: string | null; isSuperAdmin: boolean }`.
- **Assignment target is user XOR group** (at most one non-null); assigning one clears the other; both null = unassigned.
- **Visibility = client-side filter, not access control.** No board query/RLS change for it.
- Commit after each task (TDD: red → green → commit; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

## File Structure

**API (new):** `apps/api/src/user-groups/` — `user-groups.module.ts`, `user-groups.controller.ts`, `user-groups.service.ts`, `dto/create-user-group.dto.ts`, `dto/update-user-group.dto.ts`, `dto/set-members.dto.ts`, + specs.
**API (modified):** `apps/api/prisma/schema.prisma`; new migrations; `apps/api/prisma/seed.ts`; `apps/api/src/pipeline/dto/assign-entry.dto.ts`; `apps/api/src/pipeline/pipeline.service.ts` (`assignEntry`, `getBoard`); `apps/api/src/pipeline/pipeline.controller.ts`; `apps/api/src/app.module.ts`.
**Web (new):** `apps/web/lib/hooks/useUserGroups.ts`; `apps/web/app/v2/(org-admin)/settings/user-groups/page.tsx`.
**Web (modified):** `apps/web/lib/types.ts`; `apps/web/lib/super-admin-nav.ts`; `apps/web/lib/staff-nav.ts`; `apps/web/lib/hooks/usePipeline.ts` (`useAssignEntry`); `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (`AssigneeControl`, `MentionPicker`); `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx`.

---

### Task 1: Schema + migrations + permission seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/20260906100000_user_groups/migration.sql`, `apps/api/prisma/migrations/20260906100001_user_groups_rls/migration.sql`

**Interfaces:**
- Produces: models `UserGroup`, `UserGroupMember`; `PipelineEntry.assignedGroupId`; permission `users:manage_groups` granted to `org_admin`.

- [ ] **Step 1: Add models + column to `schema.prisma`**

```prisma
model UserGroup {
  id             String   @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  name           String   @db.NVarChar(200)
  description    String?  @db.NVarChar(1000)
  createdAt      DateTime @default(now()) @map("created_at")

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("user_groups")
}

model UserGroupMember {
  id             String   @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  groupId        String   @map("group_id") @db.UniqueIdentifier
  userId         String   @map("user_id") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")

  @@unique([groupId, userId])
  @@index([organizationId, userId])
  @@map("user_group_members")
}
```
And add to `model PipelineEntry` (near `assignedUserId`):
```prisma
  assignedGroupId String? @map("assigned_group_id") @db.UniqueIdentifier
```

- [ ] **Step 2: CREATE TABLE + column migration** `20260906100000_user_groups/migration.sql`

```sql
CREATE TABLE [dbo].[user_groups] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_groups_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_groups_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_groups_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [user_groups_organization_id_name_key] ON [dbo].[user_groups]([organization_id], [name]);
CREATE NONCLUSTERED INDEX [user_groups_organization_id_idx] ON [dbo].[user_groups]([organization_id]);

CREATE TABLE [dbo].[user_group_members] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_group_members_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [group_id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_group_members_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_group_members_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [user_group_members_group_id_user_id_key] ON [dbo].[user_group_members]([group_id], [user_id]);
CREATE NONCLUSTERED INDEX [user_group_members_organization_id_user_id_idx] ON [dbo].[user_group_members]([organization_id], [user_id]);

ALTER TABLE [dbo].[pipeline_entries] ADD [assigned_group_id] UNIQUEIDENTIFIER NULL;
```
(No FK constraints — consistent with `assignedUserId`, which has no FK; names resolved by batched lookup. Verify the pipeline entries table name is `pipeline_entries` via the `@@map` on `PipelineEntry` before writing the ALTER.)

- [ ] **Step 3: RLS migration** `20260906100001_user_groups_rls/migration.sql`

```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members AFTER UPDATE;
```

- [ ] **Step 4: Add the permission in `seed.ts`** — add to the `PERMISSIONS` array: `{ key: 'users:manage_groups', description: 'Create and manage user groups' }`; add the string `'users:manage_groups'` to the `org_admin` array in `ROLE_PERMISSIONS`.

- [ ] **Step 5: Apply + generate + seed**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate && npx prisma db seed`
Expected: both migrations applied; client regenerated with the two models + `assignedGroupId`; seed upserts the new permission + grant. (If migrate deploy reports a shadow-DB error, that's the known quirk — migrate deploy does not use a shadow DB and should succeed. Report verbatim + DONE_WITH_CONCERNS if anything fails; do NOT npm install.)

- [ ] **Step 6: Verify tsc + note composite key names** `cd apps/api && npx tsc --noEmit` — clean. In the report, note the generated `UserGroupMemberWhereUniqueInput` composite key name for `@@unique([groupId, userId])` (likely `groupId_userId`) — later tasks use it.

- [ ] **Step 7: Commit** `git add apps/api/prisma && git commit -m "feat(user-groups): tables + RLS + assignedGroupId + users:manage_groups permission"`

---

### Task 2: UserGroupsService — CRUD + members + directory + mine

**Files:**
- Create: `apps/api/src/user-groups/user-groups.service.ts`
- Test: `apps/api/src/user-groups/user-groups.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `AuditService` (from `@exam-platform/shared`), Prisma models from Task 1.
- Produces `UserGroupsService`:
  - `list(context): Promise<UserGroupWithMembers[]>` where `UserGroupWithMembers = { id; name; description: string|null; members: { userId; name: string|null; email: string }[] }`
  - `create(context, actorUserId, dto): Promise<UserGroupWithMembers>`
  - `update(context, actorUserId, id, dto): Promise<UserGroupWithMembers>`
  - `remove(context, actorUserId, id): Promise<{ id: string }>`
  - `setMembers(context, actorUserId, id, userIds: string[]): Promise<UserGroupWithMembers>`
  - `directory(context): Promise<{ id; name; memberIds: string[] }[]>`
  - `mine(context, userId): Promise<{ groupIds: string[]; coMemberUserIds: string[] }>`

- [ ] **Step 1: Write failing tests** covering: create rejects a duplicate name (unique per org); create validates member users are same-org + active; `setMembers` diffs (inserts new, deletes removed, leaves unchanged — assert the exact createMany/deleteMany calls); `remove` deletes the group AND its members; `mine` returns the caller's group ids + the deduped co-member ids (excluding the caller); `directory` returns id/name/memberIds. Mock `TenantPrismaService.forTenant` to run the callback against a `tx` mock exposing `userGroup.*` and `userGroupMember.*` and `user.findMany`. Mock `AuditService.record`.

- [ ] **Step 2: Run red** `cd apps/api && npx jest user-groups.service`.

- [ ] **Step 3: Implement `user-groups.service.ts`**

```ts
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
    const userById = new Map(users.map((u: { id: string; name: string | null; email: string }) => [u.id, u]));
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
```

- [ ] **Step 4: Run green** `cd apps/api && npx jest user-groups.service`. **Step 5: tsc. Step 6: Commit** `feat(user-groups): CRUD + members + directory + mine service`.

---

### Task 3: Controller + DTOs + module

**Files:**
- Create: `apps/api/src/user-groups/dto/create-user-group.dto.ts`, `dto/update-user-group.dto.ts`, `dto/set-members.dto.ts`
- Create: `apps/api/src/user-groups/user-groups.controller.ts`, `user-groups.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `UserGroupsModule`)
- Test: `apps/api/src/user-groups/user-groups.controller.spec.ts`

**Interfaces:**
- Produces routes under `@Controller('user-groups')`.

- [ ] **Step 1: DTOs**

```ts
// create-user-group.dto.ts
import { IsArray, IsOptional, IsString, IsNotEmpty, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';
export class CreateUserGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID(undefined, { each: true }) memberUserIds?: string[];
}
```
```ts
// update-user-group.dto.ts
import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
export class UpdateUserGroupDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
```
```ts
// set-members.dto.ts
import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';
export class SetMembersDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID(undefined, { each: true }) userIds!: string[];
}
```

- [ ] **Step 2: Controller** (copy guard/decorator imports verbatim from `apps/api/src/pipeline/pipelines-config.controller.ts`)

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UserGroupsService } from './user-groups.service';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';
import { SetMembersDto } from './dto/set-members.dto';

@Controller('user-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserGroupsController {
  constructor(private readonly service: UserGroupsService) {}

  // Staff-readable (pickers/filters) — NOTE these two must precede ':id' style routes.
  @Get('directory')
  @RequirePermissions('results:view')
  directory(@CurrentTenant() tenant: TenantContext) { return this.service.directory(tenant); }

  @Get('mine')
  @RequirePermissions('results:view')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) { return this.service.mine(tenant, userId); }

  // Admin (manage) surface.
  @Get()
  @RequirePermissions('users:manage_groups')
  list(@CurrentTenant() tenant: TenantContext) { return this.service.list(tenant); }

  @Post()
  @RequirePermissions('users:manage_groups')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateUserGroupDto) { return this.service.create(tenant, userId, dto); }

  @Patch(':id')
  @RequirePermissions('users:manage_groups')
  update(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpdateUserGroupDto) { return this.service.update(tenant, userId, id, dto); }

  @Put(':id/members')
  @RequirePermissions('users:manage_groups')
  setMembers(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SetMembersDto) { return this.service.setMembers(tenant, userId, id, dto.userIds); }

  @Delete(':id')
  @RequirePermissions('users:manage_groups')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) { return this.service.remove(tenant, userId, id); }
}
```
(Confirm `CurrentUserId` decorator path against `pipeline.controller.ts` imports. Route ordering: `directory`/`mine` are static and declared before the `:id` routes — Nest matches in declaration order, so this avoids `mine` being captured as `:id`. Keep them first.)

- [ ] **Step 3: Module + register**

```ts
// user-groups.module.ts
import { Module } from '@nestjs/common';
import { UserGroupsController } from './user-groups.controller';
import { UserGroupsService } from './user-groups.service';
@Module({ controllers: [UserGroupsController], providers: [UserGroupsService], exports: [UserGroupsService] })
export class UserGroupsModule {}
```
Add `UserGroupsModule` to `app.module.ts` imports (near `UsersModule`). Mirror how `PipelineModule` obtains `TenantPrismaService`/`AuditService` (shared/global module — no extra provider likely needed).

- [ ] **Step 4: Controller test** — mock the service; assert each route delegates with tenant/user; assert the class is guarded and the two directory/mine routes use `results:view` while the rest use `users:manage_groups` (reflect metadata via `Reflect.getMetadata` on the handlers, or a light delegation test). Run `npx jest user-groups.controller`.

- [ ] **Step 5: tsc + commit** `feat(user-groups): controller + DTOs + module`.

---

### Task 4: Group-based assignment (API)

**Files:**
- Modify: `apps/api/src/pipeline/dto/assign-entry.dto.ts`, `apps/api/src/pipeline/pipeline.service.ts` (`assignEntry` ~L906, `getBoard` assignee block ~L529-557), `apps/api/src/pipeline/pipeline.controller.ts` (assignment handler ~L150)
- Test: extend `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `UserGroupsService` NOT needed — resolve members via `tx` directly inside `assignEntry` (avoids cross-module tx). Board resolves group names via `tx.userGroup.findMany`.
- Produces: `AssignEntryDto { assigneeUserId?: string|null; assigneeGroupId?: string|null }`; `BoardRow` gains `assignedGroupId: string|null` + `assignedGroupName: string|null`.

- [ ] **Step 1: DTO** — replace with:
```ts
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
export class AssignEntryDto {
  @ValidateIf((o) => o.assigneeUserId !== null && o.assigneeUserId !== undefined)
  @IsUUID()
  @IsOptional()
  assigneeUserId?: string | null;

  @ValidateIf((o) => o.assigneeGroupId !== null && o.assigneeGroupId !== undefined)
  @IsUUID()
  @IsOptional()
  assigneeGroupId?: string | null;
}
```

- [ ] **Step 2: Failing tests** — assign to a group sets `assignedGroupId` + clears `assignedUserId` + notifies all group members (assert `notify` called with the member ids, `type:'assigned'`); assign to a user sets `assignedUserId` + clears `assignedGroupId`; both non-null → `BadRequestException` (XOR); both null → both cleared; a group id from another org (findFirst returns null) → `BadRequestException`; `getBoard` returns `assignedGroupId` + resolved `assignedGroupName`.

- [ ] **Step 3: Implement** — change `assignEntry` signature to `assignEntry(context, actorUserId, entryId, target: { userId?: string | null; groupId?: string | null })`:
```ts
async assignEntry(context: TenantContext, actorUserId: string, entryId: string, target: { userId?: string | null; groupId?: string | null }): Promise<{ success: true }> {
  const orgId = context.organizationId as string;
  const userId = target.userId ?? null;
  const groupId = target.groupId ?? null;
  if (userId && groupId) throw new BadRequestException('Assign to a user or a group, not both');

  const { candidateId, candidateName, memberIds } = await this.tenantPrisma.forTenant(context, async (tx) => {
    const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId }, select: { id: true, candidateId: true, candidate: { select: { name: true } } } });
    if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
    let members: string[] = [];
    if (userId) {
      const user = await tx.user.findFirst({ where: { id: userId, organizationId: orgId }, select: { id: true } });
      if (!user) throw new BadRequestException('Assignee is not a member of this organization');
    } else if (groupId) {
      const group = await tx.userGroup.findFirst({ where: { id: groupId, organizationId: orgId }, select: { id: true } });
      if (!group) throw new BadRequestException('Group is not part of this organization');
      const rows = await tx.userGroupMember.findMany({ where: { organizationId: orgId, groupId }, select: { userId: true } });
      members = rows.map((r: { userId: string }) => r.userId);
    }
    await tx.pipelineEntry.update({ where: { id: entryId }, data: { assignedUserId: userId, assignedGroupId: groupId } });
    await this.audit.record(context, { actorUserId, action: 'entry.assigned', entityType: 'pipeline_entry', entityId: entryId, metadata: { assignedUserId: userId, assignedGroupId: groupId } });
    return { candidateId: entry.candidateId, candidateName: entry.candidate?.name ?? null, memberIds: members };
  });

  const recipients = userId ? [userId] : memberIds;
  if (recipients.length) {
    try {
      await this.notifications.notify(context, actorUserId, recipients, 'assigned', { entityType: 'pipeline_entry', entityId: entryId, contextText: candidateName, linkPath: `/candidates/${candidateId}` });
    } catch (e) {
      this.logger.error(`assignment notification failed for entry ${entryId}`, e as Error);
    }
  }
  return { success: true };
}
```
- **Controller** handler: `return this.pipelineService.assignEntry(tenant, userId, id, { userId: dto.assigneeUserId ?? null, groupId: dto.assigneeGroupId ?? null });`
- **getBoard:** add `assignedGroupId` to the `entries` select; after the assignee-name block, resolve group names:
```ts
const groupIds = [...new Set(entries.map((e) => e.assignedGroupId).filter((id): id is string => Boolean(id)))];
const groups = groupIds.length ? await tx.userGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } }) : [];
const groupName = new Map(groups.map((g: { id: string; name: string }) => [g.id, g.name]));
```
and on each row: `assignedGroupId: e.assignedGroupId, assignedGroupName: e.assignedGroupId ? (groupName.get(e.assignedGroupId) ?? null) : null,` plus the two fields on the `BoardRow` interface.

- [ ] **Step 4: Run tests + tsc. Step 5: Commit** `feat(user-groups): group-based candidate assignment (user XOR group)`.

---

### Task 5: Web — hooks + settings page + nav + types

**Files:**
- Modify: `apps/web/lib/types.ts`, `apps/web/lib/super-admin-nav.ts`, `apps/web/lib/staff-nav.ts`
- Create: `apps/web/lib/hooks/useUserGroups.ts`, `apps/web/app/v2/(org-admin)/settings/user-groups/page.tsx`
- Test: `apps/web/app/v2/(org-admin)/settings/user-groups/page.test.tsx`

**Interfaces (inline in `apps/web/lib/types.ts`):**
```ts
export interface UserGroupMember { userId: string; name: string | null; email: string; }
export interface UserGroup { id: string; name: string; description: string | null; members: UserGroupMember[]; }
export interface UserGroupDirectoryEntry { id: string; name: string; memberIds: string[]; }
export interface MyGroups { groupIds: string[]; coMemberUserIds: string[]; }
```

- [ ] **Step 1: Types** — add the above.
- [ ] **Step 2: Hooks `useUserGroups.ts`** — mirror `usePipelines.ts` shape (`apiFetch(path, opts, accessToken ?? undefined)`, `enabled: Boolean(accessToken)`):
  - `useUserGroups()` → `useQuery(['user-groups'], GET '/user-groups')`
  - `useUserGroupDirectory()` → `useQuery(['user-groups','directory'], GET '/user-groups/directory')`
  - `useMyGroups()` → `useQuery(['user-groups','mine'], GET '/user-groups/mine')`
  - `useCreateUserGroup` (POST), `useUpdateUserGroup` (PATCH :id), `useSetGroupMembers` (PUT :id/members `{userIds}`), `useDeleteUserGroup` (DELETE :id) — each invalidates `['user-groups']` (and directory/mine where relevant).
- [ ] **Step 3: Settings page** `/settings/user-groups` (`'use client'`; client gate `role === 'org_admin' || actingSuperAdmin`): list groups (name, description, member count/names); create + rename via dialog; a member editor (multi-select of teammates from `useTeammates()`) that calls `useSetGroupMembers`; delete row action. Follow `settings/pipelines/page.tsx` conventions; import `Button` directly if a DataTable is used (jest/DataTable ESM dodge).
- [ ] **Step 4: Nav** — `super-admin-nav.ts` `SUPER_ADMIN_FULL_NAV`: `{ href: '/settings/user-groups', label: 'User Groups', icon: Users }` (import `Users` from lucide-react). Add `'/settings/user-groups'` to `V2_ROUTES` in `staff-nav.ts`.
- [ ] **Step 5: Test** — render the page with hooks mocked (QueryClientProvider); assert it lists groups and "Add group" calls the create mutation, and setting members calls `useSetGroupMembers`. Run `npx jest user-groups` (web).
- [ ] **Step 6: tsc + commit** `feat(user-groups): web settings page + hooks + nav`.

---

### Task 6: Web — assignment picker (users + groups) + "my team" board filter

**Files:**
- Modify: `apps/web/lib/hooks/usePipeline.ts` (`useAssignEntry`), `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (`AssigneeControl`), `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx`, `apps/web/lib/types.ts` (`BoardEntryRow`)
- Test: extend/adjust the relevant component test if present; else a focused filter-predicate unit test.

**Interfaces:**
- Consumes: `useUserGroupDirectory()`, `useMyGroups()` from Task 5.
- `BoardEntryRow` gains `assignedGroupId: string | null; assignedGroupName: string | null`.

- [ ] **Step 1: `useAssignEntry`** — change the mutation input to a discriminated target and body:
```ts
export function useAssignEntry(entryId: string, jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { assigneeUserId?: string | null; assigneeGroupId?: string | null }) =>
      apiFetch(`/entries/${entryId}/assignment`, { method: 'PATCH', body: JSON.stringify(target) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}
```
- [ ] **Step 2: `AssigneeControl`** — one `<select>` with an "Unassigned" option, a **Users** `<optgroup>` (teammates), and a **Groups** `<optgroup>` (from `useUserGroupDirectory()`). Encode the option value to distinguish (e.g. `user:<id>` / `group:<id>`); on change, send `{ assigneeUserId }` or `{ assigneeGroupId }` accordingly (the other omitted/null). Seed the current value from `row.assignedGroupId ? 'group:'+id : row.assignedUserId ? 'user:'+id : ''`. Show `row.assignedGroupName` when a group is assigned.
- [ ] **Step 3: "My team's candidates" board filter** — in `PipelineBoard.tsx`, add a second filter (checkbox or a segmented "Mine / My team / All") using `useMyGroups()`:
```tsx
const { data: myGroups } = useMyGroups();
// team filter predicate:
const teamOnly = ...; // state
const inMyTeam = (r: BoardEntryRow) =>
  (r.assignedGroupId && myGroups?.groupIds.includes(r.assignedGroupId)) ||
  (r.assignedUserId && (r.assignedUserId === currentUser?.id || myGroups?.coMemberUserIds.includes(r.assignedUserId)));
const visible = (rows) => teamOnly ? rows.filter(inMyTeam) : (mineOnly ? rows.filter(r => r.assignedUserId === currentUser?.id) : rows);
```
Keep the existing "My candidates" (`mineOnly`) working; "My team's candidates" is additive.
- [ ] **Step 4: Types** — add `assignedGroupId`/`assignedGroupName` to `BoardEntryRow`.
- [ ] **Step 5: Run web tests + tsc. Step 6: Commit** `feat(user-groups): assignee picker (users+groups) + my-team board filter`.

---

### Task 7: Web — group mention/notify audience

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (`MentionPicker`)
- Test: extend the CandidateDrawer/MentionPicker test if present; else a focused unit test of the expand-to-members behavior.

**Interfaces:** consumes `useUserGroupDirectory()`. NO API change — groups expand to member ids client-side into the existing `mentionedUserIds` list (the `addFeedback` path already validates + notifies each id).

- [ ] **Step 1: Failing test** — `MentionPicker` shows a Groups section; toggling a group ON adds all its member ids to `value` (deduped against already-selected users); toggling it OFF removes exactly that group's members that aren't also selected via another still-on group. (Keep it simple: track selected groups; the emitted `value` = union of individually-picked users + members of selected groups, deduped.)
- [ ] **Step 2: Implement** — extend `MentionPicker` to render group chips (from `useUserGroupDirectory()`) beneath the teammate chips. Maintain the emitted user-id list as the deduped union of picked individuals and the members of selected groups. The parent still submits `mentionedUserIds` unchanged; server behavior is identical (validates + notifies each id, drops the actor).
- [ ] **Step 3: Run web tests + tsc. Step 4: Commit** `feat(user-groups): group mention/notify audience (client-side expand)`.

---

## Self-Review Notes (author)

- **Spec coverage:** tables+RLS+permission (T1); config CRUD + directory + mine (T2/T3); group-based assignment XOR (T4 api, T6 web); shared-visibility filter (T2 `mine` + T6 board); mention/notify audience (T7). Approver-target is explicitly out (fast-follow). All v1 spec sections mapped.
- **Type consistency:** assignment target is `{ assigneeUserId?, assigneeGroupId? }` end-to-end (DTO ↔ web mutation body); `BoardRow`/`BoardEntryRow` gain the same two fields (`assignedGroupId`, `assignedGroupName`) api↔web; `mine` shape `{ groupIds, coMemberUserIds }` shared T2↔T6.
- **XOR:** enforced server-side in `assignEntry` (both non-null → 400); the web picker structurally can only pick one. Both belt and suspenders.
- **Route ordering:** `/user-groups/directory` and `/user-groups/mine` declared before `:id` routes so Nest doesn't capture them as ids (noted in T3).
- **Deploy:** the one feature needing a seed run — flagged in Global Constraints, T1 Step 5 (dev), and the spec's deploy notes (prod).
- **Migration ordering:** `20260906100000/100001` sort after the parked custom-fields `090000/090001` and the earlier `20260905*` branches — linear on any later merge; keep all migrations when merging multiple parked branches.
