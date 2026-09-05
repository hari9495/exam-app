# User Groups — Design Spec

**Date:** 2026-09-06
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #10 (User Groups). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Let org admins create named **groups of staff users**, then use those groups as (a) an assignment target for candidates, (b) a "my team's candidates" board filter, and (c) a mention/notify audience. Groups are reusable sets of users layered on the existing flat user directory.

## Why

Today candidate assignment targets a single user, every picker reads one flat teammate list, and there's no notion of a team. Recruiting orgs work in pods/teams; a named group lets them assign a req's candidates to a whole team, filter the board to their team's work, and @mention/notify a team at once — reusing the assignment and notification plumbing already in place.

## Decisions (locked during brainstorming)

1. **Two tables:** `UserGroup` + `UserGroupMember` (join), both tenant-scoped with paired RLS. No FK cascade — deletes clean up members explicitly.
2. **Management is org-admin only** via a new `users:manage_groups` permission (org_admin only). This feature **requires a seed run on deploy** to grant it.
3. **v1 consumers = three:** (a) group-based assignment, (b) shared-visibility board filter, (c) mention/notify audience.
4. **Assignment target is user XOR group** — an entry is assigned to one user, or one group, or nobody. Assigning a group clears any user assignee and vice-versa.
5. **Visibility = a convenience FILTER, not an access-control boundary.** Recruiters already see all org candidates; v1 does not restrict what anyone can see (record-level visibility is inventory #18). The filter is client-side, like the existing "My candidates".
6. **OUT of v1 (documented fast-follow):** groups as an **approver target** in approval chains (`approverType:'group'`). It couples into the approvals engine (`approver-resolver`, chain snapshot, `decide()`) and is security-sensitive; it gets its own spec + plan later.

## Existing code this builds on

- **User model** `apps/api/prisma/schema.prisma` (`model User`, ~L143): `role` (plain string), `managerId` (per-user approval chain only — orthogonal to groups), `organizationId`, `status`. No existing user-grouping. `SafeUser = Omit<User,'passwordHash'|'avatarPath'>` + `SAFE_USER_SELECT` in `apps/api/src/users/users.service.ts` (~L28/L40); `listTeammates()` (~L192, gated `results:view`) is the flat picker source behind `GET /users/teammates`.
- **Permissions** `apps/api/prisma/seed.ts` — `PERMISSIONS` (~L6) + `ROLE_PERMISSIONS` (~L25). The `:configure` perms (`pipelines:configure`, `approvals:configure`) are org_admin-only — the tier a new `users:manage_groups` joins. Decorator `apps/api/src/rbac/permissions.decorator.ts`; guard `apps/api/src/rbac/permissions.guard.ts` (super-admin bypass).
- **Assignment (Team Collab #3):** `PipelineEntry.assignedUserId` (`schema.prisma:923`, on the job×candidate row). Service `assignEntry(context, actorUserId, entryId, assigneeUserId)` (`apps/api/src/pipeline/pipeline.service.ts:987`); route `PATCH /entries/:id/assignment` gated `results:view` (`pipeline.controller.ts:150`); DTO `AssignEntryDto` (`assigneeUserId: string|null`). Board read resolves `assigneeName` via a batched `user.findMany` (`pipeline.service.ts:586`, row shape ~L58/L635). "My candidates" filter is client-side in `PipelineBoard.tsx` (~L121/L154, `mineOnly`). Web assign hook `useAssignEntry` (`apps/web/lib/hooks/usePipeline.ts:189`); picker `AssigneeControl` in `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (~L417); teammate source `useTeammates()` (`apps/web/lib/hooks/useUserDirectory.ts:33`).
- **Notifications:** `notify(context, actorUserId, recipientUserIds: string[], type: string, target: MentionTarget)` (`apps/api/src/notifications/notifications.service.ts:40`) — dedups, drops the actor, one `UserNotification` row per same-org recipient + best-effort email per `UserNotificationPreference`. `MentionTarget = {entityType, entityId, contextText?, linkPath}`. `MentionPicker` in `CandidateDrawer` also reads `useTeammates()`.
- **Config-CRUD pattern to copy:** `apps/api/src/pipeline/pipelines-config.controller.ts` (routes, `@UseGuards(JwtAuthGuard, PermissionsGuard)`, `@RequirePermissions`, `@CurrentTenant()`/`@CurrentUserId()`); service wraps `this.tenantPrisma.forTenant(context, tx => …)` + `this.audit.record`; DTO `apps/api/src/pipeline/dto/create-stage.dto.ts`; web hook `apps/web/lib/hooks/usePipelines.ts`; settings page `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx`; nav in `apps/web/lib/super-admin-nav.ts` (`SUPER_ADMIN_FULL_NAV`) + `apps/web/lib/staff-nav.ts` (`V2_ROUTES`).
- **Join-table template:** `InterviewPanelist` (`schema.prisma:1185`, org-scoped user join, `@@unique([interviewId,userId])`, `@@index([organizationId,userId])`).
- **Migrations:** hand-authored additive mssql SQL; newest `20260906090001_custom_fields_rls`; new tenant tables need a paired `_rls` migration (`ALTER SECURITY POLICY dbo.TenantAccessPolicy … dbo.fn_tenant_access_predicate(organization_id)`). Next: `20260906xxxxxx`.
- **Web constraint:** apps/web cannot import `@exam-platform/shared` VALUES at runtime — inline types web-side.

## Architecture

### 1. Data model

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
Plus `PipelineEntry.assignedGroupId String? @map("assigned_group_id") @db.UniqueIdentifier` (additive column on the existing table). One CREATE TABLE migration (two tables) + the `assignedGroupId` ALTER, and one paired `_rls` migration (both new tables). No FK relations (resolve names by batched lookup, consistent with `assignedUserId`).

### 2. Permission + config API

- `seed.ts`: add `{ key: 'users:manage_groups', description: 'Create and manage user groups' }` to `PERMISSIONS`; grant to `org_admin` in `ROLE_PERMISSIONS`.
- New module `apps/api/src/user-groups/`: `user-groups.module.ts`, `user-groups.controller.ts`, `user-groups.service.ts`, DTOs.
- **Admin routes** (gated `users:manage_groups`):
  - `GET /user-groups` → groups with `{ id, name, description, members: [{ userId, name, email }] }` (member names resolved by batched `SAFE_USER_SELECT` lookup).
  - `POST /user-groups` `{ name, description?, memberUserIds?: string[] }` — unique name per org.
  - `PATCH /user-groups/:id` `{ name?, description? }`.
  - `DELETE /user-groups/:id` — hard delete + `deleteMany` its members.
  - `PUT /user-groups/:id/members` `{ userIds: string[] }` — replace membership (validates each user is same-org + active; diffs against current, insert/delete).
- **Staff-readable route** (gated `results:view`): `GET /user-groups/directory` → `[{ id, name, memberIds: string[] }]` — lets pickers/filters read groups without the manage permission. (Kept separate so the admin `GET /user-groups` can carry richer member detail.)
- Service wraps every method in `forTenant` + `audit.record` (`user_group.created/updated/deleted/members_changed`).

### 3. Consumer (a) — group-based assignment

- Add `assignedGroupId` to the board row shape; `getBoard` resolves group names via a batched `userGroup.findMany` (one query for the board), same pattern as `assigneeName`.
- Extend the assignment endpoint. New DTO shape for `PATCH /entries/:id/assignment`: `{ assigneeUserId?: string | null, assigneeGroupId?: string | null }`. **XOR enforced server-side:** at most one of the two may be non-null; setting one clears the other; both null = unassigned. Validate a group id belongs to the org.
- `assignEntry` becomes `assignEntry(context, actorUserId, entryId, { userId?, groupId? })`. On **group** assignment, resolve current member ids and `notify(context, actorUserId, memberIds, 'assigned', target)` (the notify helper already drops the actor + dedups). On **user** assignment, unchanged behavior.
- Web: `AssigneeControl` lists a "Users" section and a "Groups" section (groups read from `GET /user-groups/directory`); selecting either sends the matching field. Board row shows the group name (with a group affordance, e.g. a people icon) when `assignedGroupId` is set.

### 4. Consumer (b) — shared-visibility board filter

- The board already loads all org entries; add a filter option beside "My candidates": **"My team's candidates"** — show entries where `assignedGroupId` is one of my groups, OR `assignedUserId` is me or a co-member of any group I'm in.
- Client-side (like `mineOnly`): the web fetches my group memberships once (a `GET /user-groups/mine` → `{ groupIds, coMemberUserIds }`, gated to the authenticated user), and the board filters rows against that set. No server query change to the board. Not an access restriction.

### 5. Consumer (c) — mention / notify audience

- `MentionPicker` in `CandidateDrawer` lists groups (from `GET /user-groups/directory`) alongside users. Selecting a group **expands it to its member user ids client-side** and adds them to the mention's recipient list — there is **no new persisted "group mention" entity** ⚖. The existing mention/notify path is unchanged; it just receives more user ids.
- Server: no change to the mention entity. The existing create-mention/notify path already takes a list of user ids and calls `notify(...)`; a group simply contributes its members. Empty group → contributes nobody (no-op, no error). (If a future need arises to render "@GroupName" as a first-class token in the note, that's a separate change — out of v1.)

## Testing

- **Config API:** create enforces unique name per org; `PUT members` validates same-org/active users and diffs correctly (add+remove); delete removes the group + its members; admin routes gated `users:manage_groups`, directory route gated `results:view`.
- **Assignment:** XOR enforced (both non-null → 400); assigning a group notifies all members (actor dropped); switching user→group clears the user field and vice-versa; unassign clears both; board resolves group name.
- **Visibility filter:** given my memberships, the filter includes entries assigned to my group / me / co-members and excludes others (unit test on the filter predicate).
- **Mention/notify:** a group mention notifies every current member (same-org), empty group is a no-op, actor excluded.
- **RLS/tenancy:** groups + members invisible cross-tenant; assigning a group from another org rejected.
- **Web:** settings CRUD page (create/rename/set-members/delete) calls the hooks; `AssigneeControl` lists users + groups and sends the right field; the board "my team" filter predicate.

## Out of scope (v1)

- **Approver target in approval chains** (`approverType:'group'`) — documented fast-follow; separate spec + plan (touches `approver-resolver`, chain snapshot, `decide()`; security-sensitive).
- Record-level visibility / access restriction by group (that's inventory #18) — v1 visibility is a filter only.
- Group-based default record **sharing rules**, nested/hierarchical groups, group avatars/colors.
- Assigning an entry to **both** a user and a group simultaneously (XOR only).
- Group leads / delegated membership management (org-admin only in v1).

## Deploy notes

- Two additive tables + paired RLS + one additive `assignedGroupId` column — ships with any api/web build, independent of the deferred migration chain.
- **Requires a `db seed` run on deploy** to grant `users:manage_groups` (org_admin). Until seeded, the admin group routes 403 for everyone (super-admin bypass still works). This is the one difference from the prior four features, which reused existing permissions. Grant-before-use: seed after migrate, before anyone relies on the UI.
- Migrations `20260906xxxxxx` sort after the parked business-hours (`20260905130000`), timezone (`20260905140000`), and custom-fields (`20260906090000/090001`) branches — linear on later merge; a merge of multiple parked branches must keep all migrations.
