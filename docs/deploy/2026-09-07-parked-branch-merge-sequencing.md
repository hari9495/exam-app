# Parked-Branch Merge Sequencing — 9 Zoho features → main

**Date:** 2026-09-07
**Scope:** Integrate the **nine** currently-parked feature branches into `main` **cleanly and green** (tsc + jest + build). This is a *merge* runbook, not a prod-deploy runbook — production rollout is a separate step (see `docs/deploy/2026-09-04-backlog-deploy-runbook.md`, the no-exam-day rule, the Next standalone static-copy gotcha, and the record-visibility RLS maintenance-window note below).

> Supersedes `docs/deploy/2026-09-06-parked-branch-merge-sequencing.md`, which covered the earlier batch of 6 (business-hours, timezone, custom-fields, user-groups, blueprint, portal). **That batch is already merged into `origin/main @ fec52f3c`** — this doc starts from there.

## Baseline facts (verified from git 2026-09-07)

- **Target = `origin/main @ fec52f3c`** ("docs(deploy): parked-branch merge-sequencing runbook", 2026-09-06). It already contains the first batch's merges.
- ⚠️ **Local `main @ 2661a39e` is STALE** — 289 commits *behind* `fec52f3c`. Do NOT build the integration branch off local `main`. `git fetch` first and branch off `origin/main`.
- All nine branches fork **in parallel from `fec52f3c`** (each confirmed off-base). They do **not** stack, so they cannot each fast-forward `main`. Integrate them in one controlled pass on an integration branch, prove green, then fast-forward `main` once.

## Inventory (authoritative HEADs from git)

| # | Branch | HEAD | Commits | Migration(s) | RLS? | Seed? |
|---|--------|------|---------|--------------|------|-------|
| 1 | feat/approval-group-approver | `ba24132f` | 7 | `20260906120000_approval_step_group_id` | no | no |
| 2 | feat/field-permissions | `0f206619` | 8 | `20260906130000_organization_field_permissions` | no | no |
| 3 | feat/record-visibility | `ea1c122d` | 9 | `20260906140000_organization_record_visibility`, `…140001_record_visibility_rls` | **yes** | no |
| 4 | feat/recycle-bin | `2089d766` | 13 | `20260906150000_recycle_bin_soft_delete` | no | no |
| 5 | feat/offer-templates | `3071709e` | 6 | `20260907160000_named_offer_templates` | no | no |
| 6 | feat/approval-email-templates | `58669d3c` | 9 | `20260907170000_approval_email_templates`, `…170001_…_rls` | **yes** | no |
| 7 | feat/org-sender-addresses | `81fe47d5` | 8 | `20260907180000_org_sender_addresses`, `…180001_…_rls` | **yes** | no |
| 8 | feat/candidate-unsubscribe | `32e0db71` | 6 | `20260907190000_candidate_unsubscribe` | no | no |
| 9 | feat/consent-capture | `5f005489` | 6 | `20260907200000_consent_capture` | no | no |

**Migrations form one linear chain by timestamp** — `120000 < 130000 < 140000 < 140001 < 150000 < 160000 < 170000 < 170001 < 180000 < 180001 < 190000 < 200000` — no filename collisions; Prisma applies all 12 pending in order regardless of merge order. **No branch needs a seed** — every gate reuses a permission already on `fec52f3c` (`org:manage_settings`, `pipeline:manage`, `approvals:configure`, `pipelines:configure`). Verify that assumption once (see final pass, step 2) rather than trusting it blind.

## Recommended merge order = migration-timestamp order (1→9 above)

Timestamp order is also the lowest-pain order here: it lands the two highest-risk *shared* files in **adjacent** merges, so each 2-way reconciliation happens with both contexts fresh.

- **`TenantPrismaService` core** (record-visibility #3 → recycle-bin #4): adjacent. #3's combined RLS predicate goes in first; #4's `$extends` soft-delete filter + `forTenantIncludingDeleted` layer on top. **The one to slow down on.**
- **`candidate-emails.service`** (org-sender #7 → unsubscribe #8): adjacent. #7's From-precedence first; #8's opt-out suppression + footer layer onto the same `sendMessage`.
- **`apply()` / `walk-in.register()`** (recycle-bin #4, then unsubscribe #8, then consent #9): #9 lands last and merges its consent-stamp into the upsert create+update that #4 already modified (resurrect `deletedAt:null`). Reconcile so BOTH survive in the same data object.
- **`approvals.service` / `approval-types`** (group-approver #1, email-templates #6): not adjacent but separable — #1 is submit-time group→member snapshot + `ApprovalChainStep.groupId`; #6 is the email-render path + a new table. Reconcile textual overlap when #6 lands.

## Conflict map (files touched by >1 branch) + resolution guidance

| # | File | Branches | Care | Resolution |
|---|------|----------|------|------------|
| 9 | `apps/api/prisma/schema.prisma` | all 9 | low | **Additive, mostly different models.** `Candidate` gains `deletedAt`(#4)+`unsubscribeToken`/`emailOptedOutAt`(#8)+`consentedAt`/`consentVersion`(#9); `Organization` gains field-perms JSON(#2)+record-vis col(#3)+`applyConsentText`/`applyConsentVersion`(#9); `ApprovalChainStep.groupId`(#1); new models `OfferTemplate`(#5), `ApprovalEmailTemplate`(#6), `OrgSenderAddress`(#7). Keep every addition; `npx prisma generate` must be clean after each merge. |
| 6 | `apps/web/lib/super-admin-nav.ts` | 2,3,4,6,7,9 | low | Additive nav entries. Keep all. |
| 6 | `apps/web/lib/staff-nav.ts` | 2,3,4,6,7,9 | low | Additive `V2_ROUTES` entries. Keep all. |
| 5 | `apps/web/lib/types.ts` | 1,2,5,7,9 | low | Additive interfaces/fields. Keep all sides. |
| 4 | `packages/shared/src/index.ts` | 2,3,4,6 | low | Additive barrel exports. Keep all. **Run the packages/shared jest runner after each of these merges.** |
| 3 | `apps/api/src/public-applications/public-applications.service(.spec)` | 4,8,9 | **HIGH** | #4 resurrects a soft-deleted candidate in the apply upsert; #8 adds public unsubscribe routes; #9 stamps consent into the SAME upsert (create+update). The upsert `update` data must carry `deletedAt:null`(#4) **and** the consent stamp(#9). Keep #8's routes. Re-run the spec. |
| 2 | `apps/api/src/walk-in/walk-in.service(.spec)` | 4,9 | **HIGH** | #4 resurrect in `register()`; #9 stamp in `register()` **and** the `listExams` return shape (array→`{exams,applyConsentText,applyConsentVersion}`). Reconcile `register()` update data to carry both; keep #9's new return shape. |
| 2 | `apps/api/src/candidate-emails/candidate-emails.service(.spec)` | 7,8 | **HIGH** | Both edit `sendMessage`. #7 = From-address precedence; #8 = opt-out suppression (manual→Conflict, triggered→skip) + optional unsubscribe footer + lazy token mint. Keep both; the send must pick the From (#7) AND honor opt-out + footer (#8). |
| 2 | `packages/shared/src/prisma/tenant-prisma.service(.spec)` | 3,4 | **HIGHEST** | #3 changes the RLS predicate/session-context path; #4 adds the global `$extends` soft-delete filter + `forTenantIncludingDeleted`. Both edit the core query pipeline — the `$extends` filter must still fire inside #3's `forTenant` interactive tx, and `forTenantIncludingDeleted` must carry #3's session context. Slow down here; re-run the shared suite. |
| 2 | `packages/shared/src/approvals/approval-types(.spec)` | 1,6 | med | #1 adds `approverType`/`groupId`; #6 adds email-template types. Additive; keep both. Run shared jest. |
| 2 | `apps/api/src/approvals/approvals.service(.spec)` | 1,6 | med | #1 = submit-time group→member resolution; #6 = approval-email render swap. Separate regions; reconcile textual overlap. `decide()` MUST remain unchanged (both features preserve it). |
| 2 | `apps/api/src/pipeline/pipeline.service(.spec)` | 2,4 | med | #2 redacts fields in read paths (getBoard/list); #4 filters `deletedAt`. Keep #2's redaction AND #4's soft-delete filter in the same read path. |
| 2 | `apps/api/src/candidates/candidates.service(.spec)` | 2,4 | med | Same shape: field redaction (#2) + soft-delete filter (#4). Keep both. |
| 2 | `apps/api/src/organizations/organizations.module.ts` | 3,7 | low | Add both providers/imports (record-vis service + sender-addresses). |
| 2 | `apps/api/src/app.module.ts` | 2,4 | low | Add both modules to imports. |

## Per-merge verification gate (run after EACH merge, in the integration branch)

Do NOT proceed to the next merge until the current one is green. **NEVER `npm install`/`ci`/`update` in a worktree** — use the existing toolchain only. This machine fakes mass jest failures under load — re-run any failure in isolation before believing it, and run jest from `apps/api` or `apps/web` (repo-root `npx jest` mis-resolves into a stale sibling worktree).

1. `cd apps/api && npx prisma generate` — schema merged into a valid client.
2. `cd apps/api && npx tsc --noEmit` and `cd apps/web && npx tsc --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
3. **If the merge touched `packages/shared/`** (merges #1,#2,#3,#4,#6): run the packages/shared jest runner.
4. Targeted jest for the just-merged area (api unless noted):
   - #1 approval-group-approver → `npx jest approval` + shared
   - #2 field-permissions → `npx jest field-permission candidates pipeline` + shared + web touched components
   - #3 record-visibility → `npx jest record-visibility tenant-prisma` + shared
   - #4 recycle-bin → `npx jest recycle candidates pipeline public-applications walk-in tenant-prisma` + shared
   - #5 offer-templates → `npx jest offer-template` + web
   - #6 approval-email-templates → `npx jest approval-email approval` + shared
   - #7 org-sender-addresses → `npx jest sender candidate-emails rls-raw-client-guard`
   - #8 candidate-unsubscribe → `npx jest unsubscribe candidate-emails public-applications` + web
   - #9 consent-capture → `npx jest consent public-applications walk-in organizations apply-form apply-consent` (api + web)

## After all nine merged (on the integration branch)

1. **Apply the full chain against a clean dev DB:** `cd apps/api && npx prisma migrate deploy` (all 12 pending, timestamp order) → `npx prisma generate`.
2. **Verify no seed gap:** confirm `org:manage_settings`, `pipeline:manage`, `approvals:configure`, `pipelines:configure` already exist on the target. If any is missing, the corresponding gated routes 403 — but per the inventory none of the 9 *adds* a permission, so a clean `fec52f3c` DB needs no new seed. (Contrast the earlier batch, where user-groups did.)
3. **Full test pass:** `npx jest` in `apps/api` and `apps/web` (re-run load-flaky suites in isolation; the ImpersonationBanner web test is a known pre-existing failure unrelated to any of these branches).
4. **Web build smoke:** production build, then copy `.next/static` + `public` into `.next/standalone/apps/web/` (the standalone gotcha) before any browser smoke.

## Cutover (user runs — pushing to shared `main` needs consent)

When the integration branch is green, fast-forward `main` to it in one push:
```bash
git push origin <integration-branch>:main
```
The assistant's classifier blocks the push to shared `main`; the user runs it.

## Production deploy (separate, later — NOT part of the merge)

- Follows `docs/deploy/2026-09-04-backlog-deploy-runbook.md` conventions (migrate → generate → standalone static copy → smoke) and the **no-deploys-on-exam-day** rule.
- ⚠️ **record-visibility RLS maintenance window:** `20260906140001_record_visibility_rls` **DROPs and re-ADDs the `pipeline_entries` FILTER predicate** (single-policy/single-FILTER SQL-Server constraint → combined predicate swap). There is a brief window where the tenant filter is absent — run it in a maintenance window with no live tenant traffic. The other two `_rls` migrations (#6, #7) only ADD a policy to a brand-new empty table → no gap, safe anytime.
- All nine are behavior-preserving until configured (no org has field-perms/record-vis/templates/senders/consent set, no candidate opted out) → no data backfill, no grandfather step.

## Post-merge bookkeeping

- Update the nine project memories from "parked UNMERGED" → merged @ `<new main sha>`.
- Delete the nine SDD workspaces under `.superpowers/sdd/` (git history is the record once merged).
- Fold the deferred fast-follows (each memory lists its Minors) into the backlog.
