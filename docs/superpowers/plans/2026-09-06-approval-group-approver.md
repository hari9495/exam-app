# Approval Group Approver Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approval-chain step can target a user group (`approverType:'group'`); at submit it resolves to the group's active members frozen into the request snapshot, and any one member can approve.

**Architecture:** Add `'group'` to `APPROVER_TYPES` + an additive `ApprovalChainStep.groupId` column. `resolveSteps` gains a `'group'` branch that expands `groupId → active member ids` into the step's `approverUserIds`; the existing snapshot + `decide()` any-of check then give frozen-membership + any-member-approves for free (decide() is unchanged). Config validates group steps; the web ChainEditor gets a group picker.

**Tech Stack:** NestJS + Prisma + SQL Server (mssql, RLS), Next.js App Router (v2 UI), class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-09-06-approval-group-approver-design.md`

## Global Constraints

- **NEVER run `npm install`/`npm ci`/`npm update`** (worktree junction disk-fill hazard). Use only `npx prisma generate`/`npx prisma migrate deploy` and existing `npx jest`/`npx tsc`.
- **Migration is one additive nullable column** on an existing RLS-covered table (`approval_chain_steps`) → **no new table, no `_rls` migration, no seed.** `approverType` is a plain string column, so `'group'` needs no DB enum change. Migration folder `20260906120000_approval_step_group_id`.
- **apps/web CANNOT import `@exam-platform/shared` VALUES at runtime** — the `ApproverType` union is already duplicated in `ChainEditor.tsx`; extend the duplicate.
- **Do NOT change `decide()`** — the group semantics come from resolving into the snapshot at submit; the authorization path stays byte-for-byte the same.
- Tenant scoping: every service write wraps `forTenant`; group-member query is org-scoped.
- Commit after each task (TDD: red → green → commit; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

## File Structure

**Modified (API):** `packages/shared/src/approvals/approval-types.ts`; `apps/api/prisma/schema.prisma` + migration; `apps/api/src/approvals/approver-resolver.ts`; `apps/api/src/approvals/approvals.service.ts` (`submit`, `upsertChain`, `getChains`); `apps/api/src/approvals/dto/upsert-chain.dto.ts`.
**Modified (Web):** `apps/web/app/v2/(org-admin)/settings/approvals/ChainEditor.tsx`; `.../settings/approvals/page.tsx`; `apps/web/lib/hooks/useApprovals.ts`.

---

### Task 1: Types + schema + migration

**Files:**
- Modify: `packages/shared/src/approvals/approval-types.ts`, `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260906120000_approval_step_group_id/migration.sql`

**Interfaces:**
- Produces: `APPROVER_TYPES` includes `'group'`; `ApprovalChainStep.groupId String?`.

- [ ] **Step 1:** In `packages/shared/src/approvals/approval-types.ts`, add `'group'` to `APPROVER_TYPES` (→ `['users','reporting_manager','hiring_manager','group']`). Leave `ResolvedStep` unchanged.
- [ ] **Step 2:** In `schema.prisma` `model ApprovalChainStep`, add: `groupId String? @map("group_id") @db.UniqueIdentifier` (near `approverUserIds`).
- [ ] **Step 3:** migration.sql:
```sql
ALTER TABLE [dbo].[approval_chain_steps] ADD [group_id] UNIQUEIDENTIFIER NULL;
```
- [ ] **Step 4:** `cd apps/api && npx prisma migrate deploy && npx prisma generate` (no `_rls`); if migrate deploy errors, capture verbatim + DONE_WITH_CONCERNS, no npm install.
- [ ] **Step 5:** Build shared + tsc: the shared package must be rebuilt if it emits dist — run the repo's existing shared build (check how other shared-type changes are picked up; if `@exam-platform/shared` is consumed from source via tsconfig paths, `npx tsc --noEmit` in apps/api suffices). Then `cd apps/api && npx tsc --noEmit` clean.
- [ ] **Step 6:** Commit `feat(approvals): add 'group' approverType + ApprovalChainStep.groupId`.

---

### Task 2: Resolver `'group'` branch + submit wiring + frozen/any-of tests

**Files:**
- Modify: `apps/api/src/approvals/approver-resolver.ts`, `apps/api/src/approvals/approvals.service.ts` (`submit` call site + step-input mapping)
- Test: `apps/api/src/approvals/approver-resolver.spec.ts` (+ extend `approvals.service.spec.ts`)

**Interfaces:**
- `ChainStepInput` gains `groupId?: string | null`.
- `resolveSteps(tx, { steps, submitterUserId, gate, subjectId, organizationId })` — gains `organizationId: string`.
- Consumes: `tx.userGroupMember` (from the merged User Groups tables).

- [ ] **Step 1: Write failing tests** (`approver-resolver.spec.ts`):
  - a `'group'` step with a group of 2 active + 1 inactive member → one ResolvedStep whose `approverUserIds` = the 2 active ids.
  - a `'group'` step whose group has 0 active members → skipped (with a reason), not in `resolved`.
  - a `'group'` step with `groupId` null/absent → skipped (reason 'no group configured').
  - a `'group'` step interleaved with a `'users'` step → both resolve, positions re-numbered contiguous.
  Mock `tx.userGroupMember.findMany` + `tx.user.findMany` (for `activeIds`).
  Extend `approvals.service.spec.ts`:
  - **submit freezes group members into the snapshot:** submitting a chain with a group step writes `chainSnapshotJson` containing the group's active member ids in that step's `approverUserIds`.
  - **frozen:** after submit, changing group membership (the mock returns a different set on a later call) does NOT change the already-written snapshot (assert the persisted snapshot is unchanged; decide still authorizes against the frozen ids).
  - **decide any-of (decide() unchanged):** a member in the snapshot step approves → advances/approves; a non-member (incl. a user "added to the group after submit", i.e. not in the frozen ids) → `ForbiddenException`.

- [ ] **Step 2: Run red** `cd apps/api && npx jest approver-resolver approvals.service`.

- [ ] **Step 3: Implement** —
  - `approver-resolver.ts`: add `groupId?: string | null` to `ChainStepInput`; add `organizationId: string` to the `resolveSteps` params object; add the branch (after the existing type branches, before the "0 ids → skip" handling):
```ts
} else if (s.approverType === 'group') {
  if (!s.groupId) { skipped.push({ position: s.position, reason: 'no group configured' }); continue; }
  const members = await tx.userGroupMember.findMany({
    where: { organizationId, groupId: s.groupId },
    select: { userId: true },
  });
  ids = await activeIds(tx, members.map((m) => m.userId));
}
```
  (match the existing loop's variable names — `s`, `ids`, `skipped`, `continue`/skip pattern; `activeIds(tx, ...)` already exists.)
  - `approvals.service.ts` `submit()`: where it maps chain steps → `ChainStepInput[]` (parsing `approverUserIds` JSON), also carry `groupId: step.groupId`; pass `organizationId: context.organizationId as string` in the `resolveSteps({ ... })` call. No other change to submit; `decide()` untouched.

- [ ] **Step 4: Run green + tsc.** **Step 5: Commit** `feat(approvals): resolve group approver to active members (frozen in snapshot)`.

---

### Task 3: Config — validate + persist/read `groupId`

**Files:**
- Modify: `apps/api/src/approvals/dto/upsert-chain.dto.ts`, `apps/api/src/approvals/approvals.service.ts` (`upsertChain`, `getChains`)
- Test: extend `approvals.service.spec.ts`

**Interfaces:**
- `StepDto` gains `@IsOptional() @IsUUID() groupId?: string`.
- `upsertChain` validates + persists `groupId`; `getChains` returns it.

- [ ] **Step 1: Failing tests** —
  - saving an **enabled** chain with a `'group'` step whose group has 0 active members → `BadRequestException`.
  - saving an enabled chain with a `'group'` step + a non-empty group → ok; `groupId` persisted on the step.
  - a `'group'` step missing `groupId` → `BadRequestException` (regardless of enabled? — require `groupId` whenever the step type is group; the empty-member check only when `enabled`, mirroring the `'users'` rule).
  - `getChains` returns `groupId` on a group step (and null/absent on other steps).
  - non-group steps persist `groupId` as null (a previously-group step switched to `'users'` clears it).

- [ ] **Step 2: Implement** —
  - `StepDto`: add `@IsOptional() @IsUUID() groupId?: string;`.
  - `upsertChain` cross-field validation (beside the existing `'users'`-needs-≥1-approver rule): for each `'group'` step, require `step.groupId` (else `BadRequestException`); and when `dto.enabled`, count active members (`tx.userGroupMember.findMany({ where: { organizationId, groupId: step.groupId }, select: { userId: true } })` → filter active, or reuse an active-count query) and reject if 0. Persist `groupId: step.approverType === 'group' ? step.groupId : null` on the step row (alongside the existing `approverUserIds: JSON.stringify(...)`).
  - `getChains`: include `groupId` in the returned step shape.
  - (The empty-member validation and the resolver's active filter both use `status:'active'` — keep consistent.)

- [ ] **Step 3: Run green + tsc.** **Step 4: Commit** `feat(approvals): validate + persist group approver config`.

---

### Task 4: Web — ChainEditor group option + picker

**Files:**
- Modify: `apps/web/app/v2/(org-admin)/settings/approvals/ChainEditor.tsx`, `.../settings/approvals/page.tsx`, `apps/web/lib/hooks/useApprovals.ts`
- Test: extend/add the approvals settings test (or a focused ChainEditor render test)

**Interfaces:**
- `UpsertApprovalChainInput.steps[]` gains `groupId?: string`.

- [ ] **Step 1: Types + hook** — `ChainEditor.tsx` local `ApproverType` union: add `'group'`. `EditorStep` gains `groupId?: string`; `blankStep` default (no group). `useApprovals.ts` `UpsertApprovalChainInput.steps` item gains `groupId?: string`.
- [ ] **Step 2: Editor** — `APPROVER_TYPE_OPTIONS`: add `{ value: 'group', label: 'Group' }`. In the per-step conditional render, add a `'group'` branch: a `<Combobox>` group picker fed by `useUserGroupDirectory()` (`apps/web/lib/hooks/useUserGroups.ts`) — options `{ value: g.id, label: g.name }`, bound to `step.groupId`. (The `'users'` pill picker and `'reporting_manager'` level combobox stay for their types.)
- [ ] **Step 3: Save/seed transforms** — `page.tsx` `handleSave`: forward `groupId: s.approverType === 'group' ? s.groupId : undefined` per step (alongside the existing `approverUserIds`/`managerLevel` conditionals). `toEditorStep` seed: carry `groupId` from the fetched chain step.
- [ ] **Step 4: Test** — render ChainEditor (hooks mocked incl. `useUserGroupDirectory`); selecting `approverType='group'` shows the group picker; picking a group + saving calls the upsert with `groupId` on that step; an existing group step renders its selected group. Run `npx jest approvals` (web).
- [ ] **Step 5: tsc + commit** `feat(approvals): web group-approver picker in ChainEditor`.

---

## Self-Review Notes (author)

- **Spec coverage:** types+column+migration (T1); resolver branch + submit freeze + frozen/any-of guard tests (T2); config validate/persist/read (T3); web picker (T4). All spec sections mapped.
- **`decide()` untouched** — the security-critical path is never edited; T2's any-of/frozen tests exercise it against a group-sourced snapshot as a guard, but the code stays the same.
- **Type consistency:** `groupId?: string | null` on `ChainStepInput` (resolver) ↔ `StepDto.groupId?` (API in) ↔ `EditorStep.groupId?`/`UpsertApprovalChainInput.steps[].groupId?` (web). `APPROVER_TYPES` gains `'group'` in shared; the web `ApproverType` duplicate gains it too (web can't import the shared value).
- **Empty-group:** config-time reject when enabled (T3) + resolve-time skip (T2, via the existing 0-ids skip). Both use `status:'active'`.
- **No new table/RLS/seed** — one additive nullable column; migration `20260906120000` sorts after all prior. Depends on the User Groups tables already on `main`.
