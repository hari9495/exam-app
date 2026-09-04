# Configurable 2-Level Pipeline + Talent Pool — Design

**Status:** Design approved (2026-09-04). Not built. Deploy-deferred; migration preserves current behavior.
**Branch (proposed):** `feat/ats-configurable-pipeline` (off current ATS line).
**Competitive input:** Zoho Recruit Hiring Pipeline (2-level Stage→Status, multiple pipelines, "Map Status") + Applications (candidate-level global stage incl. "Available" re-engageable pool, sibling-application behavior). See `docs/ats/zoho-adopt-inventory.md` (Customization → Hiring Pipeline, live-validated 2026-09-04).

---

## 1. Problem & goal

Today the hiring pipeline is a **flat, hardcoded** 5-stage enum — `PIPELINE_STAGES = ['applied','screened','interview','offer','hired']` — duplicated in `apps/api/src/pipeline/pipeline-stages.ts` and `apps/web/lib/types.ts`. `PipelineEntry.stage` is a string; **rejection is a separate boolean** (`rejected`/`rejectedReason`/`rejectedAt`) rendered as its own board column. There is no candidate-level lifecycle stage (only a coarse `Candidate.status = 'active'`), so hiring one candidate leaves their other applications untouched and there is no notion of a re-engageable talent pool.

**Goals:**
1. **Configurable 2-level pipeline** — orgs define stages AND the statuses under each; **multiple named pipelines** per org, assigned per job (full Zoho parity).
2. **Talent pool** — a candidate-level **global stage** (New → In Review → Engaged → Available / Offered / Hired / Rejected), stored and auto-maintained, where **Available = re-engageable** (job filled, candidate neither hired nor rejected).

**Non-goals (v1):** re-assigning a job's pipeline after it has entries; cross-pipeline comms templates; skill-matching search over the pool (waits for AI resume-parsing); template/pipeline folders; a single-vs-multiple-applications toggle (we are always multiple); Blueprint-style per-transition enforcement (separate adopt).

---

## 2. Key decisions (all confirmed in brainstorming)

| # | Decision |
|---|----------|
| D1 | **Full parity:** configurable stages **and** statuses, **multiple named pipelines** per org, chosen per job. |
| D2 | **Typed stages:** each stage carries a `category ∈ active \| offer \| hired \| rejected \| archived` — the single semantic key that reports, comms, events, and the candidate global-stage all pivot on (Zoho's "Map Status"). |
| D3 | **Candidate global stage is stored & auto-maintained** (`Candidate.globalStage`), derived by one idempotent `recomputeGlobalStage()` called from hooks — stored so the talent pool is a fast indexed filter. |
| D4 | **Auto-archive siblings on hire** (org toggle `autoArchiveSiblingsOnHire`, default **on**); **Available on job-close** (still-active candidates on a closed job are archived and freed to the pool). |
| D5 | A job's **pipeline is locked once it has entries** (no entry-remap engine in v1). |
| D6 | `rejected` boolean stays as a **denormalized auto-maintained mirror** (true when the entry's status is in a `rejected`-category stage) so existing readers keep working; add `archivedAt`. |
| D7 | Migration seeds a **default pipeline** mirroring today's 5 stages + a Rejected stage, mapping every existing entry — existing orgs see **zero behavior change**. |

---

## 3. Data model

### 3.1 New tables (all org-scoped; RLS per existing `TenantPrismaService` pattern)

**`Pipeline`**
- `id`, `organizationId`, `name`, `isDefault Boolean`, `createdAt`, `updatedAt`
- Invariant: exactly one `isDefault = true` per org.

**`PipelineStage`**
- `id`, `organizationId`, `pipelineId → Pipeline`, `name`, `category` (`active|offer|hired|rejected|archived`), `position Int`
- Invariant per pipeline: ordered by `position`; **≥1 `hired`** and **≥1 `rejected`** stage required.

**`PipelineStatus`**
- `id`, `organizationId`, `stageId → PipelineStage`, `name`, `position Int`
- The 2nd level. Every stage has ≥1 status.

### 3.2 Changed tables

**`Job`** — add `pipelineId → Pipeline` (nullable in schema; on create defaults to the org's default pipeline). Locked once the job has entries (D5).

**`PipelineEntry`**
- Add `statusId → PipelineStatus` — **new source of truth**. The entry's *stage* is derived via `status → stage`.
- Keep `rejected Boolean` as an **auto-maintained mirror** (D6): set on every `statusId` write from the target stage's `category`.
- Add `archivedAt DateTime?` (set when moved into an `archived`-category stage, incl. by job-close).
- `stage` string column is **dropped** after migration back-fills `statusId`.

**`Candidate`** — add `globalStage String @default("new")` (`new|in_review|engaged|available|offered|hired|rejected`), indexed on `(organizationId, globalStage)`. The existing `status` (active/erased) is unchanged and orthogonal.

**Org settings** — add `autoArchiveSiblingsOnHire Boolean @default(true)` (wherever org-level ATS settings live; co-located with the pipeline/approvals config).

### 3.3 Migration (idempotent; preserves behavior)

Per org:
1. Create one **default pipeline** (`isDefault = true`) with stages: `applied`(active), `screened`(active), `interview`(active), `offer`(offer), `hired`(hired), `rejected`(rejected) — each with one same-named status. (Ordering by `position` matches today.)
2. Set every `Job.pipelineId` to that default.
3. Map each `PipelineEntry.stage` string → the matching seeded `statusId`; entries with `rejected = true` → the Rejected stage's status (keep `rejected = true`).
4. Back-fill `Candidate.globalStage` via the recompute function (§4.1).
5. Drop the `PipelineEntry.stage` column.

Idempotency: keyed on "org has no pipeline yet" so a re-run is a no-op.

---

## 4. Behavior

### 4.1 `recomputeGlobalStage(candidateId)` — the one deriving function (D3)

Pure function of the candidate's entries (+ contact history), stored to `Candidate.globalStage`. Precedence:

1. any entry in a **`hired`** stage → `hired`
2. else any entry in an **`offer`** stage → `offered`
3. else any entry in an **`active`** stage → `engaged`
4. else (all entries terminal): **`available`** if any entry is `archivedAt`-set (freed by job-close) — *available wins over rejected*; else `rejected` if any entry rejected
5. else no entries: `in_review` if the candidate has ever been emailed/SMS'd, else `new`

Idempotent — always safe to re-run; hooks call it rather than mutating incrementally.

### 4.2 Hooks (where recompute fires)

| Hook | Effect |
|------|--------|
| `addEntry` (associate to job) | recompute → `engaged` |
| `patchEntry` status change | maintain `rejected` mirror + `archivedAt` from new stage category; recompute candidate |
| candidate email/SMS send | if `globalStage = new` → recompute (→ `in_review`) |
| **enter a `hired` stage** | recompute → `hired`; if `autoArchiveSiblingsOnHire` → move the candidate's other **active** entries to their pipeline's `archived` stage (set `archivedAt`); fire `candidate.hired` (on category, not the literal string) |
| **job close** (`Job.status → closed`) | for each still-active (non-terminal) entry on the job: move to the pipeline's `archived` stage, set `archivedAt`; recompute each affected candidate (→ `available` when they now have no active/hired/offer entries) |

### 4.3 Making stage-coupled code pipeline-aware (§ downstream)

- **Board** — columns = the job's pipeline stages (by `position`); each card shows its **status** as a dropdown; moving a card sets `statusId`. Rejected/archived are typed columns. `PipelineBoard` becomes dynamic per pipeline.
- **Stage counts / reports** — keyed by stage id per job; **cross-pipeline rollups group by `category`** (so funnels, time-to-hire, hired/rejected totals work across jobs on different pipelines regardless of custom stage names).
- **Comms template triggers** — `CandidateEmailTemplate.triggerEvent` becomes a **`PipelineStage` FK**; migration maps existing name triggers (`applied`…`hired`) to the default pipeline's matching stage and `'rejected'` → the Rejected stage. Templates are pipeline-scoped in v1.
- **`candidate.hired` event** — fires on transition into a `hired`-**category** stage.
- **Shared constants** — `PIPELINE_STAGES` / `STAGE_LABEL` / `isValidStage` (API + web) are **removed**; validation becomes "does `statusId` belong to the job's pipeline?"; `category` is the new shared enum in `packages/shared`.

---

## 5. API & RBAC

**New permission** `pipelines:configure` (org_admin), mirroring `approvals:configure`. Entry moves stay under existing `pipeline:manage`.

**Endpoints:**
- Pipeline config (org_admin): CRUD `Pipeline`; nested `PipelineStage` CRUD (name, category, reorder) + `PipelineStatus` CRUD (name, reorder). Guardrails: default pipeline undeletable; a pipeline must keep ≥1 `hired` + ≥1 `rejected` stage; a stage/status with entries can't be deleted.
- `createJob` accepts `pipelineId` (defaults to org default; validated org-owned).
- `patchEntry` takes `statusId` (validated: the status's stage belongs to the job's pipeline) — replaces `stage`.
- Candidates list: `globalStage` filter param.
- Org settings: `autoArchiveSiblingsOnHire` read/write (behind `pipelines:configure`).

---

## 6. Web

- **Settings → Pipelines** (mirrors the Approvals settings page): pipeline list + a per-pipeline **stage/status kanban editor** (add/rename/reorder stages & statuses, pick each stage's category) + the auto-archive toggle.
- **Job create modal**: pipeline picker (defaults to org default).
- **PipelineBoard**: dynamic stage columns + per-card status dropdown.
- **Candidates list**: `globalStage` filter (default view **"Available"** = the talent pool) + a **Re-engage** action (opens add-to-job → creates a `PipelineEntry` → candidate flips to `engaged`).

---

## 7. Phasing (for the implementation plan)

Two shippable halves:

- **Phase A — configurable pipelines:** config tables + migration + typed stages + board/reports/comms/event made pipeline-aware + config API/UI + job pipeline picker + removal of the shared flat-stage constants.
- **Phase B — talent pool:** `Candidate.globalStage` + `recomputeGlobalStage` + hooks + job-close archiving + `autoArchiveSiblingsOnHire` toggle + candidates `globalStage` filter + Re-engage.

Phase A ships value on its own (configurable multi-pipeline); Phase B layers the pool on top.

---

## 8. Testing

TDD throughout. Core unit coverage:
- `recomputeGlobalStage` — every precedence branch (hired/offered/engaged/available-vs-rejected/in_review/new), incl. multi-application candidates.
- Migration idempotency + entry→status mapping + globalStage back-fill.
- `rejected` mirror + `archivedAt` maintenance on status change.
- Category-based cross-pipeline rollups.
- `patchEntry` status validation (rejects a status not in the job's pipeline).
- Job-close archiving → Available; hire → sibling auto-archive (toggle on/off).
- Config guardrails (undeletable default, required hired/rejected stages, delete-with-entries blocked).

Then **browser-verify end-to-end** (as with approvals): configure a 2nd pipeline, create a job on it, move a candidate across custom stages/statuses, hire (siblings archive), close a job (others → Available), re-engage from the pool.

---

## 9. Deploy

Rides the existing deferred-deploy backlog. The migration seeds each org's default pipeline and maps all existing data, so **existing orgs see zero behavior change** until they build a new pipeline or use the pool. All new config is opt-in. Coordinate with the other deploy-deferred ATS/commercialization features (see the deploy-sequencing memory).
