# Deploy runbook — full backlog + AI initiative

**Written:** 2026-09-13. **Deploy target:** `origin/main` @ `3b9df3bd` (head migration
`20260909370000_careers_assistant`). **Status:** planning only — nothing here has run against prod.

Supersedes and extends [`2026-09-04-backlog-deploy-runbook.md`](./2026-09-04-backlog-deploy-runbook.md)
(still the reference for the pre-09-04 ATS/pipeline/billing gotchas) and the merge-sequencing
notes ([09-06](./2026-09-06-parked-branch-merge-sequencing.md),
[09-07](./2026-09-07-parked-branch-merge-sequencing.md),
[09-11](./2026-09-11-zoho-wave2-merge-sequencing.md)). Those describe how the code got onto
`main`; **this describes how to ship `main` to prod.**

---

## TL;DR

Everything is already merged to `main` as **one linear, correctly-ordered Prisma migration
chain** (Prisma applies in filename order, so ordering is solved). Prod was last deployed
~2026-08-01 (migration `20260801120000`), so the delta is essentially everything since —
~90 migrations. The deploy itself is the usual, in this exact order:

1. **Phase 0** — confirm the real prod baseline, take a full DB snapshot.
2. `prisma migrate deploy` (whole chain, in order).
3. `prisma db seed` (**required** — the RBAC catalog + role defaults live here, not in migrations).
4. `npm run build` → **copy `.next/static` + `public` into `.next/standalone/apps/web/`**.
5. Ship API + web; smoke-test.
6. **Post-deploy config** — every provider-backed feature (all the AI features included) ships
   **inert** and only wakes up once its key/creds/env are set. None of this blocks the deploy;
   it's how you turn features on afterward. See "Post-deploy configuration".

Two things that genuinely break if you get them wrong: **grandfather-before-enforcement**
(billing) and **seed-after-migrate** (RBAC). Both are covered below. No exam-day deploys.

---

## Recommended approach (the "best" path, not just the correct one)

**Verify baseline → rehearse on a restored snapshot → one coordinated deploy in a maintenance
window → smoke → enable config gradually.** Rationale:

- **One coordinated deploy, not a split/rolling one.** The delta is ~90 migrations but a single
  linear chain, and three things all want quiesced traffic at the same moment: grandfather must
  fully precede the new code (gate 1), the destructive column drop (gate 3), and the
  record-visibility RLS filter swap (gate 4). Splitting the chain *adds* risk — it creates windows
  where new code runs on an old schema or vice versa. Keep it one unit; the only thing you isolate
  is doing all of it inside a short **maintenance window** (this is a single-VM / pm2 app, so a
  brief window is simpler and safer than chasing zero-downtime).
- **Rehearse the whole chain on a restored snapshot — highest-value step.** A 90-migration delta
  against SQL Server is exactly where a surprise hides; find it on a throwaway copy, not in the
  window. See the rehearsal checklist below.
- **Ship dark, enable after.** Every provider/AI feature is inert until configured, so the deploy
  is low behavior-change. Bring prod up, confirm health, *then* set config (Post-deploy
  configuration) and pilot the AI features on one test org before announcing.

### Rehearsal checklist (run once, before the real window)

1. Restore the Phase-0 prod snapshot to a throwaway DB (same SQL Server version as prod).
2. Point a shell at it and run the real sequence end to end: `prisma migrate deploy` →
   `prisma db seed` → `npm run build` → the static copy.
3. Confirm `prisma migrate status` shows the chain fully applied with no drift, and the seed logs
   "Seed complete".
4. Boot the built app against the restored DB and run the smoke tests (below). Pay attention to the
   grandfather check and an org_admin opening pipeline/approvals/user-groups/Roles config.
5. Time it. That runtime (plus a margin) is your maintenance-window length.
6. Only after a clean rehearsal, schedule the real window (non-exam day).

---

## Phase 0 — before you touch prod

- **Confirm the baseline.** The whole plan assumes prod is at `20260801120000` (remote-access /
  SEB lockdown, ~2026-08-01). Verify against the prod `_prisma_migrations` table before anything
  else — a different baseline changes the delta. `prisma migrate status` from a shell pointed at
  prod is the cleanest check.
- **Full DB snapshot.** There is destructive DDL in the chain (see gate 3). There is no cheap
  rollback past it — the snapshot is the rollback.
- **Pick a window that is not an exam day.** VM SSH timeouts under load are disk burst-credit
  exhaustion (not networking); never migrate mid-exam.
- **Have the config values ready** (Post-deploy configuration) so you can light up features right
  after the app is healthy, rather than scrambling.

---

## The sequence

```
# 0. from a machine that can reach the prod DB + prod app host
prisma migrate status                 # confirm baseline + pending list
<take full DB snapshot>

# 1. schema
cd apps/api
npx prisma migrate deploy             # applies the whole chain in filename order

# 2. seed (NOT optional — see gate 2). Idempotent (upserts).
npx prisma db seed

# 3. build web (standalone) + the load-bearing static copy (gate 4)
cd ../.. && npm run build
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/
cp -r apps/web/public       apps/web/.next/standalone/apps/web/

# 4. ship API + web (restart the pm2 processes / redeploy the VM app)

# 5. smoke test on the PROD build (gate 5), not Turbopack dev
```

---

## Load-bearing gates (the things that actually break)

1. **Grandfather must precede enforcement.** `20260826090002_billing_grandfather` re-points
   every existing org to `legacy_unlimited` (1e9 limits). If new app code (Phase-1 402 quota
   enforcement) serves traffic *before* this migration runs, every active client is 402-blocked
   on AI features + proctored-exam starts. → migrate fully **before** the new app goes live.
2. **`prisma db seed` must run after migrate.** `apps/api/prisma/seed.ts` owns the permission
   catalog + `ROLE_PERMISSIONS`, and these are read per-request from the DB. Skipping it means:
   - `pipelines:configure` / `approvals:configure` missing → org_admins get **403** on pipeline
     + approval config (configurable-pipeline).
   - `users:manage_groups` missing → **403** on User Groups.
   - **`hiring_manager` role defaults missing** → the 5th role (RBAC PR #87) has no permissions
     until an org admin hand-configures it. The seed sets `hiring_manager: [org:view,
     results:view, interview:view_assigned, pipeline:manage, candidate:manage]`.
   Seed is idempotent (upserts) and needs no re-login (perms are per-request).
3. **Destructive DDL — snapshot first.** `20260904090004_drop_pipeline_entry_stage` drops the
   legacy `pipeline_entries.stage` column; behavior-preserving backfills (`090002`, `090006`) are
   ordered before it, so data is safe *if applied in order*. Phase-0 snapshot is the only rollback.
4. **Record-visibility RLS needs a maintenance window.** `20260906140001_record_visibility_rls`
   alters the RLS **filter** on an existing table (DROP/ADD gap) — run it in the window, not under
   live traffic, or a request can slip through the gap. (New-table `*_rls` migrations create a
   policy on a fresh table and need no window; this one is the exception because it re-filters an
   existing table.)
5. **Web standalone static copy.** Next.js standalone: after `npm run build` you MUST copy
   `.next/static` + `public` into `.next/standalone/apps/web/` or the browser 404s client chunks
   (blank page, "s.join is not a function").
6. **Verify on the production build, not Turbopack dev.** Next 16 route discovery /
   `global-not-found` are silently ignored by `next dev` — smoke the real prod build.
7. **Don't re-edit migrations.** SQL Server gotchas (dynamic SQL in `comms_trigger_stage`,
   default-constraint drop before column drop) are already fixed in-file. `monaco-editor` stays
   pinned at 0.52.2 (0.55.x breaks the self-hosted editor) — a build concern, noted so nobody bumps it.

---

## Post-deploy configuration — lighting up the inert features

Everything below ships **off/inert** and changes no behavior until configured. The deploy does not
depend on any of it; do it once the app is healthy. Split into platform-level (env/secrets) and
per-org (self-serve in Settings).

### Platform-level (env vars / app host)

| Setting | Enables | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Default AI provider for orgs with no own key | Optional — orgs can bring their own instead. Without it AND without a per-org key, every AI feature is inert (friendly "configure a key"). |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` + registered redirect URI | Google Calendar 2-way sync | Calendar sync stays inert until set. Closes Zoho #22. |
| `MICROSOFT_OAUTH_CLIENT_ID` / `_SECRET` + redirect URI | Microsoft 365 calendar sync | as above |
| `API_ORIGIN` | Absolute URLs in the job-board XML feeds | Multi-board publishing needs it for correct feed links. |
| `FRONTEND_URL` | Portal / careers / agency magic-link URLs | Points emails + public links at the right host. |

### Per-org (self-serve, Settings → Integrations / Careers)

| Setting | Enables | Where |
|---|---|---|
| **AI provider key** (Anthropic or OpenAI-compatible endpoint/model) | ALL synchronous + batch AI: interview kit, JD/offer/email/funnel drafting, question auto-tag + distractors, batch résumé screening, résumé parsing + candidate fit, vision proctoring, careers assistant | Settings → Integrations → AI |
| **Embeddings config** (OpenAI-compatible endpoint + model + key) | Semantic candidate search, find-similar, duplicate detection | Settings → Integrations → embeddings (decoupled from the chat key) |
| **Careers assistant toggle** | Public careers-site chat widget | Settings → Careers (default off; opt-in per org — it's public AI spend) |
| **Webcam AI analysis toggle** (per exam) | AI vision review of webcam snapshots at settlement | Exam builder → proctoring (default off) |
| **Paid job-board creds** (LinkedIn / Indeed / generic HTTP) | Push publishing to paid boards | per-org encrypted config; best-effort/inert without |
| **Easy Apply secrets** (Indeed / LinkedIn) | External quick-apply ingest | per-org; inert without |
| **SMS / WhatsApp provider** | Candidate SMS / WhatsApp channels | per-org encrypted config |

After configuring an AI key, an org can **backfill candidate embeddings** (Settings →
Integrations → "Backfill existing candidates") so semantic search / dedup cover the existing pool;
otherwise embeddings accrue as résumés are (re)parsed.

---

## Feature → migration → seed/config matrix (delta since prod baseline)

Grouped roughly by wave; all are on `main`, all inert-until-configured where a provider is involved.

**Zoho wave-2 + earlier backlog** (see the wave-2 merge doc for detail): billing phase 1
(`20260826090000..02`, gate 1), integrations 2a–2e, team collab, candidate portal, requisitions +
approvals (`20260903120000..01`), configurable pipeline (`20260904090000..06`, gates 2–3), business
hours, per-user tz/signature, custom fields, user groups (`20260906100000..01`, seed), blueprint
stage rules, field-level read perms (`20260906130000`), record visibility (`20260906140000..01`,
gate 4), recycle bin, offer/approval-email templates, sender addresses, unsubscribe, consent
capture, API usage metering, careers site (`20260908220000`), permission profiles
(`20260908230000..01`), multi-board job publishing (`20260908240000..01`, needs `API_ORIGIN`),
agency portal (`20260908250000..01`), interview self-booking, candidate SMS
(`20260909270000..01`), SMS providers, WhatsApp (`20260909290000..01`).

**Calendar + paid channels:** calendar OAuth sync (`20260909300000..01`, needs OAuth env apps),
paid job boards (`20260909310000`), easy apply (`20260909320000`).

**RBAC + field permissions:** Hiring Manager role + org-editable role perms
(`20260909330000..01_org_role_permissions`, **seed** for hiring_manager defaults — gate 2); field
permissions PR2/PR3 — read-only + per-user rules via permission profiles
(`20260909340000_permission_profile_field_permissions`; no seed).

**AI initiative (all this session):**

| Feature | Migration | Seed? | Config to activate |
|---|---|---|---|
| Interview kit (Q-gen + scorecard) | — (stateless) | no | per-org AI key |
| Drafting kit (JD/offer/email/funnel) | — (stateless) | no | per-org AI key |
| Embeddings foundation (semantic search + find-similar) | `20260909350000_embeddings_foundation` | no | per-org **embeddings** config + backfill |
| Duplicate detection | — (reuses embeddings) | no | embeddings config |
| Vision proctoring | `20260909360000_webcam_ai_analysis` | no | per-org AI key + per-exam toggle |
| Question-bank AI (auto-tag + distractors) | — (stateless) | no | per-org AI key |
| Batch résumé screening | — (reuses candidate-fit) | no | per-org AI key |
| Careers-site assistant | `20260909370000_careers_assistant` | no | per-org AI key + careers toggle |
| Difficulty calibration | — (pure stats) | no | none (works on exam data) |
| Snapshot retention sweep | — (service only) | no | none (runs daily automatically) |

**Note:** none of the AI features need a seed and only three add a (additive, nullable) column.
Difficulty calibration + retention sweep need no config at all.

---

## Smoke tests (post-deploy)

- Existing org_admin can open pipeline config, approvals config, user groups, Roles & Permissions
  (proves seed ran; `hiring_manager` shows its default perms).
- An existing client is NOT 402-blocked on an exam start / AI action (proves grandfather ran).
- Careers page renders for an enabled org; a proctored exam starts under lockdown.
- With an AI key set on a test org: generate a JD, run résumé screening on a job, ask the careers
  assistant a question — each returns content; with no key, each shows the friendly "configure a
  key" message (proves inert-vs-active both work).
- Web: hard-refresh a deep v2 route (proves the static copy + prod-build route discovery).

## Rollback

- Before gate-3 DDL: restore is clean from the Phase-0 snapshot.
- After it: forward-fix only, or restore the full snapshot (the dropped `pipeline_entries.stage`
  column is gone). This is why Phase 0's snapshot is mandatory, not optional.
- App-only rollback (redeploy previous build) is safe for any change that didn't run a migration —
  but once migrated, the old app may not match the new schema, so prefer forward-fix.
