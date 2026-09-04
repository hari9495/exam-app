# Deploy sequencing — the deferred backlog

**Written:** 2026-09-04. **Deploy target:** `origin/main` + `feat/ats-configurable-pipeline` (merged).
**Status:** planning only. Nothing here has run against prod.

## TL;DR

The whole backlog is **one linear, correctly-ordered Prisma migration chain** — Prisma
applies migrations in filename order, so migration *ordering* is already solved. The real
work is: (1) establish the prod baseline, (2) back up, (3) `migrate deploy` → `db seed` →
build/static-copy → ship app, in that order, (4) smoke-test grandfathering. A handful of
**load-bearing gates** (below) are the only things that can bite. Recommend **one
coordinated deploy** of the full delta; an optional split point is called out if you want to
de-risk the ATS pipeline separately.

## What's where (verified 2026-09-04)

| Feature | Migrations | On origin/main? |
|---|---|---|
| Billing Phase 1 (+ grandfather) | `20260826090000..090002` | ✅ yes |
| Integrations 2a–2e | `20260826100000..100002` | ✅ yes |
| Team Collaboration (notifications + assignment) | `20260826100003..100005` | ✅ yes |
| Candidate Portal | `20260826100006` | ✅ yes |
| ATS Requisitions + Approvals | `20260903120000..120001` | ❌ branch only |
| Configurable Pipeline A + B | `20260904090000..090006` | ❌ branch only |

`feat/ats-configurable-pipeline` is a **strict superset** of origin/main (0 behind), so the
deploy unit is: **merge the branch → main, deploy main.** Local `main` is 128 commits stale —
ignore it; treat `origin/main` as the target.

**PROD baseline is the one real unknown.** Prod was last deployed ~2026-08-01 (remote-access /
SEB lockdown, migration `20260801120000`); everything after is deferred. The delta to prod is
therefore *large* — essentially all of the table above. **Confirm the exact baseline before
touching anything** (Phase 0).

## Load-bearing gates (the things that actually break)

1. **Grandfather must precede enforcement.** `20260826090002_billing_grandfather` re-points
   every existing org to `legacy_unlimited` (1e9 limits). If the new app code (with Phase-1
   402 quota enforcement) serves traffic *before* this migration runs, every active client is
   402-blocked on AI features and proctored-exam starts. → **migrate fully before the new app
   goes live.** This is the normal migrate-then-code order, but here it is not optional.
2. **`db seed` must run after migrate.** `pipelines:configure` (and `approvals:configure`)
   live in `apps/api/prisma/seed.ts`, not in a migration. Skip the seed and every existing
   org_admin gets **403** on pipeline/approval config. Seed is idempotent. Permissions are
   read per-request from the DB, so no re-login is needed once seeded.
3. **Destructive DDL — back up first.** `20260904090004_drop_pipeline_entry_stage` drops the
   legacy `pipeline_entries.stage` column. Behavior-preserving seed/backfill (`090002`,
   `090006`) are ordered before it, so data is safe *if applied in order* — but take a full DB
   snapshot in Phase 0 regardless; there is no cheap rollback past this point.
4. **Web standalone static copy.** apps/web is Next.js standalone: after `npm run build` you
   MUST copy `.next/static` + `public` into `.next/standalone/apps/web/` or the browser 404s
   client chunks ("s.join is not a function", blank page).
5. **Verify on a production build, not Turbopack dev.** Next 16 route discovery /
   `global-not-found` are silently ignored by `next dev` — smoke-test the actual prod build.
6. **SQL Server migration gotchas are already fixed in-branch** (dynamic SQL in
   `comms_trigger_stage`; default-constraint drop in `drop_pipeline_entry_stage`). Do not
   re-edit those migrations.

## The sequence

### Phase 0 — Pre-flight
- [ ] **Window:** low-traffic, **never an exam day** (check the exam schedule). VM SSH
      timeouts are disk burst-credit exhaustion, not networking — don't deploy right after
      heavy I/O; let burst credits recover.
- [ ] **Baseline:** on prod DB, `SELECT migration_name, finished_at FROM _prisma_migrations
      ORDER BY finished_at;` — the last row is the baseline; everything after it in the chain
      is pending.
- [ ] **Backup:** full DB snapshot (mandatory — gate #3).
- [ ] **Merge** `feat/ats-configurable-pipeline` → `origin/main`. Confirm requisitions /
      approvals feature gates default **disabled**.

### Phase 1 — Build
- [ ] `npm run build` (api + web).
- [ ] **Copy `.next/static` + `public` → `.next/standalone/apps/web/`** (gate #4).
- [ ] Sanity-load the prod build locally (gate #5).

### Phase 2 — Migrate + seed (order-critical)
- [ ] `prisma migrate deploy` — applies the full pending chain in order (grandfather, RLS,
      configurable-pipeline seed/backfill, destructive column drop, global-stage backfill).
- [ ] `prisma db seed` — grants `pipelines:configure` / `approvals:configure` (gate #2).
- [ ] Do **not** start the new app until both complete (gate #1).

### Phase 3 — Ship + smoke
- [ ] Bring up new api + web.
- [ ] Smoke (existing-org, prod build): dashboard, candidates, a **default-pipeline** job
      board (renders unchanged — 5 stages + Rejected), settings → Pipelines, **Billing shows
      unlimited (NOT 402)**, start a proctored exam (not 402), notifications bell, candidate
      portal magic-link.

### Phase 4 — Post-deploy (deferred / credential-gated)
- [ ] Assign real paid plans deliberately (grandfather left everyone unlimited).
- [ ] Integrations OAuth (calendar OAuth, Zapier) — needs credentials; still deferred.
- [ ] Requisitions / approvals gates — enable per-org when ready.
- [ ] Prod has **no AI key** → AI-fit / screen analysis inert until a key is added.
- [ ] SEB ConfigKey toggle — needs one real-client test before enabling.

## One deploy or split?

**Recommend one deploy.** Prisma orders the migrations regardless, and the features are
runtime-independent and mostly un-gated, so a single migrate/build/smoke cycle is the least
error-prone.

**Optional split point** if you want the ATS pipeline separate: deploy through
`20260826100006_candidate_portal_token` (the four commercialization features) first, smoke,
then a second deploy for `20260903120000..20260904090006` (requisitions + configurable
pipeline). Costs a second backup + risk window; buys a smaller blast radius for the destructive
pipeline migration.
