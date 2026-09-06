# Parked-Branch Merge Sequencing — 6 Zoho features → main

**Date:** 2026-09-06
**Scope:** Getting the six parked feature branches integrated into `main` **cleanly and green** (tsc + jest + build). This is a *merge* runbook, not a prod-deploy runbook — production rollout is a separate step (see `docs/deploy/2026-09-04-backlog-deploy-runbook.md`, the no-exam-day rule, and the Next standalone static-copy gotcha).

## Why sequencing is needed

All six branches fork from `origin/main @ aec66003` in parallel — they do **not** stack, so they cannot each fast-forward `main`. They must be integrated in one controlled pass. Recommended shape: build an **integration branch** off `aec66003`, merge the six in the order below (resolving conflicts, keeping every migration), prove it green, then fast-forward `main` to the integration branch in a single push. `main` is never touched until the integration is proven.

## Inventory (authoritative HEADs from git, 2026-09-06)

| # | Branch | HEAD | Commits | Non-doc files | Migration(s) | Seed? |
|---|--------|------|---------|---------------|--------------|-------|
| 1 | feat/candidate-portal-self-service | `179f7a02` | 7 | 9 | — (none) | no |
| 2 | feat/business-hours-holidays | `e3fb704e` | 8 | 20 | `20260905130000_organization_business_hours` | no |
| 3 | feat/per-user-timezone-signature | `3b3779bd` | 10 | 13 | `20260905140000_user_timezone_signature` | no |
| 4 | feat/custom-fields | `2a56ebf7` | 13 | 42 | `20260906090000_custom_fields`, `…090001_custom_fields_rls` | no |
| 5 | feat/user-groups | `731bfd11` | 12 | 30 | `20260906100000_user_groups`, `…100001_user_groups_rls` | **YES — `users:manage_groups`** |
| 6 | feat/blueprint-stage-rules | `0d86644a` | 11 | 21 | `20260906110000_blueprint_stage_rules` | no |

> Note: the candidate-portal memory records `852d8017`; the branch's actual HEAD is `179f7a02`. Use git, not the memory hash.

**Migrations form one linear chain by timestamp** — `130000 < 140000 < 20260906090000 < 090001 < 100000 < 100001 < 110000` — so no filename collisions; Prisma applies all pending in order. Merge order does **not** have to equal migration order (Prisma sorts by filename), but the recommended order below happens to match it, which keeps history intuitive.

## Recommended merge order + rationale

Merge smallest/most-independent first; put the three `pipeline.service.ts`/`getBoard` branches last and consecutive so the 3-way reconciliation is incremental.

1. **candidate-portal-self-service** — no migration, 9 files; only overlap is `public-applications.service(.spec)` (with custom-fields, merged later). Smallest, land first.
2. **business-hours-holidays** — migration `130000`; overlaps nav files + `ScheduleInterviewModal` (with #3) + schema.
3. **per-user-timezone-signature** — migration `140000`; overlaps `ScheduleInterviewModal(.test)` (resolve once, against #2 now in) + schema + types.
4. **custom-fields** — migrations `090000/090001`; the big one (42 files). Establishes `getBoard` row `customFields`, the `CandidateDrawer` custom-field sections, `app.module`, nav, `public-applications` trust boundary. Land before the other two board branches.
5. **user-groups** — migrations `100000/100001` + **seed**; overlaps `pipeline.service` (assignEntry + getBoard group name/assignedGroupId), `CandidateDrawer`, `PipelineBoard`, `usePipeline`, `pipeline.controller`, `app.module`, nav, types. Resolve getBoard/drawer against custom-fields.
6. **blueprint-stage-rules** — migration `110000`; overlaps `pipeline.service` (patchEntry + getBoard stage rules + setChecklistItem), `CandidateDrawer`, `PipelineBoard`, `usePipeline`, `pipeline.controller`, types. Land last (highest getBoard/patchEntry surface).

## Conflict map (files touched by >1 branch) + resolution guidance

| Touches | File | Branches | Resolution |
|---|---|---|---|
| 6 | `apps/web/lib/types.ts` | all | **Additive.** Each branch appends interfaces/fields (`BoardEntryRow` gains `customFields`, `assignedGroupId/assignedGroupName`, `blueprintChecklist`; plus new type blocks). Keep all; accept both sides at each hunk. |
| 5 | `apps/api/prisma/schema.prisma` | 2–6 | **Additive, different models.** New cols: `User.timeZone/emailSignature`, `Organization.businessHoursJson/holidaysJson`, `PipelineStage.rulesJson`, `PipelineEntry.assignedGroupId/blueprintChecklistJson`; new models `CustomField*`, `UserGroup*`. Keep every addition. After merge, `npx prisma generate` must be clean. |
| 3 | `apps/web/lib/super-admin-nav.ts` | 2,4,5 | Additive nav entries (Business Hours, Custom Fields, User Groups). Keep all. |
| 3 | `apps/web/lib/staff-nav.ts` | 2,4,5 | Additive `V2_ROUTES` Set entries. Keep all. |
| 3 | `apps/web/lib/hooks/usePipeline.ts` | 4,5,6 | Additive hooks (useAssignEntry change, useSetChecklistItem, + custom-fields mutation body). Keep all; ensure the assignment mutation body carries the user-groups discriminated target. |
| 3 | `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` | 4,5,6 | **Care.** Three additive section-cards + prop changes: custom-fields display, user-groups AssigneeControl/MentionPicker, blueprint checklist card + `stages` prop. Keep all sections; reconcile the component signature (it gains a `stages` prop from #6) and the section stack order. |
| 3 | `apps/api/src/pipeline/pipeline.service.ts` | 4,5,6 | **HIGHEST CARE — see getBoard callout below.** |
| 3 | `apps/api/src/pipeline/pipeline.service.spec.ts` | 4,5,6 | Mechanical test-block merges; re-run the suite after. |
| 2 | `ScheduleInterviewModal.tsx(.test)` | 2,3 | business-hours off-hours warning + timezone seed. Both additive to the modal; keep both. |
| 2 | `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx` | 5,6 | Both pass props to `CandidateDrawer` (user-groups filter + `stages` for both). Reconcile the single `<CandidateDrawer …>` call site to pass all props. |
| 2 | `public-applications.service(.spec)` | 1,4 | portal token-scoped writes (#1) + apply custom-field trust boundary (#4). Different methods; keep both. |
| 2 | `apps/api/src/pipeline/pipeline.controller.ts` | 5,6 | user-groups assignment DTO wiring + blueprint checklist route. Additive; keep both routes. |
| 2 | `apps/api/src/app.module.ts` | 4,5 | Add both `CustomFieldsModule` + `UserGroupsModule` to imports. |

### getBoard 3-way callout (the one to slow down on)

`getBoard` in `pipeline.service.ts` is edited by custom-fields, user-groups, and blueprint. Each addition is additive but touches the same three regions — reconcile so ALL survive:
- **entries `include`/`select`:** custom-fields (none extra — reads values separately), user-groups (`assignedGroupId`), blueprint (`rulesJson` on stages, `blueprintChecklistJson` on entries). Keep every field.
- **batch pre-loads:** custom-fields (defs + values for the page's candidate ids), user-groups (group names for `assignedGroupId`), blueprint (parse stage `rulesJson`). Keep all three `Promise.all`/findMany blocks.
- **the row object literal:** must carry `customFields` (#4) + `assignedGroupId`/`assignedGroupName` (#5) + `blueprintChecklist` (#6); the `board.pipeline.stages` mapping must carry parsed `rules` (#6). Assemble the union.
- Also in this file: custom-fields `deleteJob` cleanup, user-groups `assignEntry` rewrite (user XOR group) + `entry.assigned` metadata, blueprint `patchEntry` enforcement + `setChecklistItem`. These are separate methods — no conflict beyond textual proximity.

## Per-merge verification gate (run after EACH merge, in the integration branch)

Do NOT proceed to the next merge until the current one is green. **NEVER `npm install` in a worktree** — use the existing toolchain.

1. `cd apps/api && npx prisma generate` — schema merges cleanly into a valid client.
2. `cd apps/api && npx tsc --noEmit` — API types.
3. `cd apps/web && npx tsc --noEmit` — web types (ignore the pre-existing stale `.next/types` route noise).
4. Targeted jest for the just-merged area (this machine fakes mass jest failures under load — re-run any failure in isolation before believing it):
   - after #4: `npx jest custom-fields candidates public-applications pipeline`
   - after #5: `npx jest user-groups pipeline`
   - after #6: `npx jest blueprint pipeline`
   - plus the web suites for the touched components.

## After all six merged (on the integration branch)

1. **Apply the full migration chain against a clean dev DB:** `cd apps/api && npx prisma migrate deploy` (all 7 pending, in timestamp order) → `npx prisma generate`.
2. **Run the seed** (user-groups): `cd apps/api && npx prisma db seed` — grants `users:manage_groups` to org_admin. Idempotent; required or the group-management routes 403.
3. **Full test pass:** `npx jest` in `apps/api` and `apps/web` (re-run load-flaky suites in isolation).
4. **Web build smoke:** production build, then copy `.next/static` + `public` into `.next/standalone/apps/web/` (the known standalone gotcha) before any browser smoke.

## Cutover (user runs — pushing to shared `main` needs consent)

When the integration branch is green: fast-forward `main` to it —
```bash
git push origin <integration-branch>:main
```
(The assistant's classifier blocks the push to shared `main`; the user runs it.)

## Post-merge bookkeeping

- Update the six project memories from "parked UNMERGED" → merged @ `<new main sha>`.
- Delete the six SDD workspaces under `.superpowers/sdd/` (git history is the record once merged).
- **Production deploy is still separate** — this runbook only lands the code on `main`. Prod rollout follows `docs/deploy/2026-09-04-backlog-deploy-runbook.md` conventions (migrate → seed → standalone static copy → smoke), honors the no-deploys-on-exam-day rule, and should run `db seed` in prod too (user-groups permission).
