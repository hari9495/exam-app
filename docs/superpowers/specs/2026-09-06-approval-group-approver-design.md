# Approval Group Approver Target — Design Spec

**Date:** 2026-09-06
**Status:** Approved design, ready for implementation planning.
**Source:** Fast-follow to User Groups (Zoho adopt #10). The approver-target consumer was deferred from the User Groups v1 spec (`docs/superpowers/specs/2026-09-06-user-groups-design.md`, "Out of scope") because it couples into the approvals engine.

## Goal

Let an approval-chain step target a **user group** (`approverType: 'group'`), resolving to the group's active members at chain-start, with the step satisfied when **any one member approves**.

## Why

Requisition and offer approvals currently route to specific users, the submitter's reporting manager, or the job's hiring manager. Teams that already model themselves as User Groups (built in #10) want a chain step like "approved by anyone on the Hiring Panel." The approvals engine's frozen-snapshot + any-of authorization already provides exactly these semantics once a group resolves to member ids at submit time — so this is a thin, low-risk extension.

## Decisions (locked during brainstorming)

1. **`approverType: 'group'`** added to `APPROVER_TYPES`; a step of this type carries a `groupId`.
2. **Any member approves (OR-gate)** — the step resolves to *all* current active members; the existing `step.approverUserIds.includes(actorUserId)` check gives any-of for free.
3. **Frozen membership** — the member set is resolved once, at submit, into the request's `chainSnapshotJson`. Later membership edits do NOT change an in-flight approval (cleaner audit; no re-resolution at decide-time). This is the engine's existing snapshot behavior — no change to `decide()`.
4. **Empty group = config-validate + resolve-skip.** At config: an **enabled** chain can't be saved if a `'group'` step points at a group with zero active members (mirrors the existing "a `'users'` step needs ≥1 approver" rule). At resolve: a `'group'` step that still resolves to zero ids is **skipped** (the engine already skips reporting/hiring-manager steps that resolve to nobody) — a safety net, consistent with the engine.
5. **Storage = a dedicated additive `ApprovalChainStep.groupId` column** (not overloading `approverUserIds`). Additive nullable column on an existing RLS-covered table → no new table, no paired RLS, no seed.
6. **Both gates** (`requisition` + `offer`) get this automatically — `approverType` lives on the shared `ApprovalChainStep`.

## Existing code this builds on

- **Types** `packages/shared/src/approvals/approval-types.ts`: `APPROVER_TYPES = ['users','reporting_manager','hiring_manager']` (add `'group'`); `ResolvedStep = { position; name; approverType; approverUserIds: string[] }` (unchanged — a group resolves into `approverUserIds`).
- **Models** `apps/api/prisma/schema.prisma`: `ApprovalChainStep` (~L1105: `approverType`, `approverUserIds` JSON string, `managerLevel`, `position`; **add `groupId String? @map("group_id") @db.UniqueIdentifier`**). `ApprovalRequest.chainSnapshotJson` freezes `ResolvedStep[]`. `ApprovalDecision` records `stepPosition`/`approverUserId`/`decision`.
- **Resolver** `apps/api/src/approvals/approver-resolver.ts`: `ChainStepInput` (`{position,name,approverType,approverUserIds,managerLevel}` → add `groupId?`); `activeIds(tx, ids)` filters to `status:'active'`; `resolveSteps(tx, {steps, submitterUserId, gate, subjectId})` branches per `approverType`, skips steps resolving to 0 ids, re-numbers contiguous. **Add a `'group'` branch.**
- **Service** `apps/api/src/approvals/approvals.service.ts`: `submit()` (~L118) maps steps → inputs (parsing `approverUserIds` JSON), calls `resolveSteps`, freezes `chainSnapshotJson`. `decide()` (~L218) authorizes via `steps[currentStepPosition].approverUserIds.includes(actorUserId)` — **unchanged.** `upsertChain()` (~L563) cross-field-validates + persists steps (`approverUserIds: JSON.stringify(...)`); `getChains()` (~L535) parses back. **Add group validation + persist/read `groupId`.**
- **Config API** `apps/api/src/approvals/dto/upsert-chain.dto.ts` `StepDto` (`@IsIn(APPROVER_TYPES) approverType`, `approverUserIds?`, `managerLevel?` → **add `@IsOptional @IsUUID groupId?`**); controller `approvals-config.controller.ts` `PUT /organizations/approvals/chains/:gate` gated `approvals:configure`.
- **User Groups (merged)** `apps/api/src/user-groups/*`: members live in `UserGroupMember` (org-scoped). The resolver will query `tx.userGroupMember.findMany({ where: { organizationId, groupId }, select: { userId: true } })` directly (stays in the submit tx; no cross-module DI needed).
- **Web** `apps/web/app/v2/(org-admin)/settings/approvals/ChainEditor.tsx` (`ApproverType` union ~L12, `APPROVER_TYPE_OPTIONS` ~L49, conditional render ~L92, `EditorStep`/`blankStep`) + `page.tsx` (`toEditorStep` seed ~L23, `handleSave` transform ~L61); hooks `apps/web/lib/hooks/useApprovals.ts` (`UpsertApprovalChainInput.steps` ~L18) + `useUserGroups.ts` `useUserGroupDirectory()`. Approve/reject UI (`apps/web/app/v2/(recruiter)/approvals/*`) unchanged.
- **Migrations**: latest `20260906110000_blueprint_stage_rules`; next `20260906120000_approval_step_group_id`. Additive style: `ALTER TABLE [dbo].[approval_chain_steps] ADD [group_id] UNIQUEIDENTIFIER NULL;`.
- **Web constraint**: apps/web cannot import `@exam-platform/shared` VALUES at runtime — the `ApproverType` union is already duplicated in `ChainEditor.tsx`; add `'group'` there too.

## Architecture

### 1. Types + model
- `APPROVER_TYPES` gains `'group'` (shared).
- `ApprovalChainStep.groupId String? @map("group_id") @db.UniqueIdentifier` (additive migration `20260906120000_approval_step_group_id`).
- `ChainStepInput` gains `groupId?: string | null`. `ResolvedStep` unchanged (group resolves into `approverUserIds`).

### 2. Resolver — the `'group'` branch (`resolveSteps`)
`resolveSteps`'s input gains `organizationId: string` (thread it from `submit()`, which has `context.organizationId`) so the group-member query is explicitly org-scoped, matching the user-groups service convention. (The tx is already org-scoped via `forTenant`/RLS, so a `groupId`-only query would also be safe — a UUID can't collide cross-tenant — but pass `organizationId` for an explicit, greppable scope.)
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
`ids` (active member user ids) feed the existing "0 ids → skip, else push a ResolvedStep with these approverUserIds" logic. Result: one step whose `approverUserIds` = the group's active members, satisfied by any one of them.

Optionally set the resolved step's `name` to include the group's name for the approver-inbox display (nice-to-have; the step already carries a configured `name`, so this is optional and can reuse it).

### 3. Config — validate + persist `groupId`
- `StepDto`: add `@IsOptional() @IsUUID() groupId?: string`.
- `upsertChain` cross-field validation (alongside the existing `'users'`-needs-approvers rule): a `'group'` step must have a `groupId`; and when `chain.enabled`, that group must have ≥1 active member (`tx.userGroupMember.findMany` + active filter, or count). Reject with `BadRequestException` otherwise.
- Persist `groupId` on the step row; clear it (null) for non-group steps. `getChains` returns `groupId` on group steps.

### 4. Web config UI (`ChainEditor` + `page.tsx`)
- `ApproverType` union + `APPROVER_TYPE_OPTIONS`: add `{ value: 'group', label: 'Group' }`.
- `EditorStep` gains `groupId?: string`; `blankStep` default.
- Conditional render: a `'group'` step shows a group `<Combobox>`/picker fed by `useUserGroupDirectory()` (label = group name; value = group id), replacing the teammate pill picker for that type.
- `toEditorStep` seeds `groupId` from the fetched chain; `handleSave` forwards `groupId: s.approverType === 'group' ? s.groupId : undefined`.
- `UpsertApprovalChainInput.steps` gains `groupId?`.
- Approve/reject flow untouched (snapshot already holds resolved user ids).

## Testing

- **Resolver:** a `'group'` step resolves to the group's active member ids (inactive excluded); an empty/all-inactive group → step skipped (0 ids); a step with `approverType:'group'` but no `groupId` → skipped with reason. Interleaves correctly with other step types + contiguous re-numbering.
- **Submit + snapshot:** submitting a chain with a group step freezes the resolved member ids into `chainSnapshotJson`; a subsequent membership change does NOT alter the frozen approvers (frozen semantics).
- **Decide (any-of):** any current-snapshot member of the group step can approve; a non-member (incl. someone added to the group AFTER submit) is `ForbiddenException`; one member's approval advances/completes the step. (These exercise the unchanged `decide()` against a group-sourced snapshot.)
- **Config validation:** saving an enabled chain with a group step + empty group → 400; with a non-empty group → ok; a group step missing `groupId` → 400; `getChains` round-trips `groupId`.
- **Web:** ChainEditor shows the Group option + a group picker; selecting a group + saving sends `groupId`; an existing group step renders its selected group.

## Out of scope (v1)

- Quorum / N-of-M / all-members approval (v1 is any-one-member).
- Live (decide-time) membership re-resolution (v1 is frozen-at-submit).
- Group approvers anywhere other than approval-chain steps.
- Displaying the group's live member list on the approver-inbox (the snapshot's resolved ids suffice; group-name display is an optional nicety, not required).
- Nested groups (User Groups v1 has none).

## Deploy notes

- One additive nullable column (`approval_chain_steps.group_id`) — no new table, no RLS, no seed. Ships with any api/web build. Existing chains (no group steps) behave exactly as today. Depends on the User Groups tables/module already on `main` (they are, @ `fec52f3c`). Migration `20260906120000` sorts after all prior migrations.
