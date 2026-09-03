# Requisitions & Approvals — Design Spec

**Date:** 2026-09-03
**Status:** Approved (brainstorm complete), ready for implementation planning
**Feature:** ATS layer — job requisitions, a configurable multi-step approval subsystem, and a lightweight org hierarchy (reporting manager) that dynamic approvers resolve against.

---

## 1. Summary & goals

Add the two classic ATS approval gates on top of the existing hiring pipeline:

- **Requisition open** — a job must be approved before it can go live to candidates.
- **Offer send** — an offer must be approved before it can be sent to a candidate.

Both are driven by **one generic, subject-polymorphic approval subsystem** (`requisition` | `offer`), configured **per gate**, with a **multi-step sequential chain** (any-one-per-step). Each step's approvers may be **named users** or **resolved dynamically** from a new org hierarchy (reporting manager) or the requisition's hiring manager.

Non-goals (see §10 for the full YAGNI list): conditional/criteria routing, parallel steps, SLA/escalation, email notifications (v1 is in-app only), an org-chart visualization, headcount/budget tracking.

### Design principles
- **One engine, two subjects.** A single `ApprovalsService` + generic models; the gates are two subject types + two configured chains. A third gate later (e.g. "candidate reject") is nearly free.
- **Additive.** When a gate is disabled, the corresponding flow behaves exactly as today. No retroactive changes to already-live jobs/offers.
- **Immutable in-flight.** Each request freezes its chain (with dynamic approvers already resolved to concrete users) at submit time; later config/manager/hiring-manager edits never reroute an in-flight request.
- **Never hard-block all hiring.** A misconfigured/empty/unresolvable chain auto-passes with an audit record (and a notification for dynamic-resolution misses), rather than blocking.

### Competitive grounding (Zoho Recruit)
Validated against Zoho Recruit's bundled **"Job Requisition Approval"** process and **Blueprint**:
- Zoho binds an approval to a **module + trigger** with **criteria rules**, an approver, and **post-approval/rejection actions** (email templates). We keep the module/trigger idea as an explicit *submit* action; we **cut criteria routing** for v1 (documented later-add) and use **in-app notifications** instead of email templates (email is a fast-follow).
- Zoho resolves approvers **by relationship** ("Reporting Manager"). We adopt this via the org-hierarchy model in §2.4 / §4.3.
- Zoho splits single-approver **Approval Process** from multi-step **Blueprint**; we fuse a multi-step chain into one subsystem, which is simpler for our scope.
- Zoho's **"My Actions"** approver inbox validates our Approvals inbox (§7.5).

---

## 2. Data model (Prisma / SQL Server)

All new tables are org-scoped and carry RLS policies consistent with the existing schema (`organization_id`, tenant policy). All ids are `UniqueIdentifier` UUIDs, matching the existing convention.

### 2.1 ApprovalChain — org-level config, one row per gate
```
ApprovalChain
  id              String   @id @default(uuid())
  organizationId  String
  gate            String   // 'requisition' | 'offer'
  enabled         Boolean  @default(false)
  createdAt/updatedAt
  steps           ApprovalChainStep[]

  @@unique([organizationId, gate])
```

### 2.2 ApprovalChainStep — ordered steps within a chain
```
ApprovalChainStep
  id              String   @id @default(uuid())
  chainId         String
  position        Int      // 0..n contiguous, normalized on save
  name            String   // e.g. "Hiring manager", "Finance"
  approverType    String   // 'users' | 'reporting_manager' | 'hiring_manager'
  approverUserIds String?  @db.NVarChar(Max)  // JSON array; used when approverType='users'
  managerLevel    Int?     // used when approverType='reporting_manager' (1=direct, 2=skip-level, ...)

  @@index([chainId])
```

### 2.3 ApprovalRequest — one instance per submitted item
```
ApprovalRequest
  id                  String    @id @default(uuid())
  organizationId      String
  gate                String    // 'requisition' | 'offer'
  subjectType         String    // 'job' | 'offer'
  subjectId           String    // jobId | offerId
  status              String    // 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
  currentStepPosition Int
  submittedByUserId   String
  submittedAt         DateTime  @default(now())
  decidedAt           DateTime?
  chainSnapshotJson   String    @db.NVarChar(Max)  // frozen steps with resolved approver userIds
  createdAt/updatedAt

  @@index([organizationId, status])
  @@index([subjectType, subjectId])
```
`chainSnapshotJson` shape: `[{ position, name, approverType, approverUserIds: string[] /* already resolved */ }]`.

### 2.4 ApprovalDecision — audit trail, one row per step action
```
ApprovalDecision
  id             String   @id @default(uuid())
  requestId      String
  stepPosition   Int
  approverUserId String
  decision       String   // 'approved' | 'rejected'
  note           String?  @db.NVarChar(Max)
  decidedAt      DateTime @default(now())

  @@index([requestId])
```

### 2.5 Field additions to existing models
```
Job (new fields, all nullable — additive)
  status          // extend allowed values to: 'draft' | 'pending_approval' | 'open' | 'closed'
                  //   (default stays 'open'; created as 'draft' only when the requisition gate is enabled)
  department      String?
  hiringManagerId String?   // userId
  headcount       Int?
  salaryMin       Int?
  salaryMax       Int?
  salaryCurrency  String?
  // location, employmentType already exist

User (new field — the org hierarchy, one edge per user)
  managerId       String?   // self-relation, reports_to_id; org-scoped; indexed

Offer
  // no new columns; existing `status` gains a 'pending_approval' value
```

---

## 3. State machines & gating

### 3.1 Requisition (`Job.status`) — only when the `requisition` gate is enabled
```
draft ──submit──▶ pending_approval ──(final step approved)──▶ open ──close──▶ closed
  ▲                     │
  └──── rejected/cancel ┘
```
- **draft**: fully editable. `publicApplyEnabled` cannot be turned on; `POST pipeline/jobs/:id/entries` (add candidate) is refused **409 "requisition not approved"**.
- **submit**: creates an `ApprovalRequest(gate=requisition)`, resolves + snapshots the chain, `currentStepPosition = first`, status → `pending_approval`. Approval-relevant fields (title, department, headcount, salary, hiringManagerId) are **locked**; description edits are allowed. Changing a locked field requires cancel + resubmit.
- **approve**: record `ApprovalDecision`; advance if more steps; on final step → request `approved`, Job → `open` (public apply + candidates now allowed).
- **reject** (any step): request → `rejected`, Job → `draft` (with the reason). Revise + resubmit → a **fresh** request starting at step 1 (chain restarts, not resumes).
- Gate **disabled** → jobs are created `open` and behave exactly as today.

### 3.2 Offer (`Offer.status`) — only when the `offer` gate is enabled
```
draft ──submit──▶ pending_approval ──(final approved)──▶ approved ──send──▶ sent ──▶ (accepted/declined/withdrawn)
  ▲                    │
  └──── rejected/cancel┘
```
- The existing **`POST offers/:id/send`** gains a guard: gate on ⇒ requires `status = approved`; gate off ⇒ unchanged.
- reject/cancel → back to `draft`; edit + resubmit restarts the chain.

### 3.3 Cross-cutting rules
1. **No retroactive pull-back** — enabling a gate leaves existing `open` jobs / `sent` offers untouched; the gate applies only to items submitted after it is enabled.
2. **Empty/unresolvable chain auto-passes** — if a gate is enabled but its (resolved) chain has zero effective steps, submit resolves to `approved` immediately and audit-logs the reason. Prevents a misconfiguration from hard-blocking all hiring.
3. **Cancel** — the submitter or an `approvals:configure` holder may cancel an in-flight request: request → `cancelled`, subject → `draft`, current-step approvers notified it was withdrawn.

---

## 4. Approval runtime (`ApprovalsService`)

A single engine; the job/offer services call into it. Four operations + two gate-check helpers.

### 4.1 submit(context, gate, subjectId, actor)
1. Load the gate's chain. Disabled → no-op (caller proceeds normally).
2. **Resolve** each step's approvers (§4.3) and drop deactivated users. If **zero effective steps** → resolve `approved` immediately, flip the subject to its approved state, audit `"auto-passed: no approvers"`. Done.
3. Else create `ApprovalRequest(status=pending_approval, currentStepPosition=first)` with `chainSnapshotJson` (resolved userIds frozen in), flip subject → `pending_approval`, **notify step-1 approvers**.

### 4.2 decide(context, requestId, actor, decision, note?)
- Guard: request is `pending_approval` **and** `actor ∈ currentStep.approverUserIds` (from snapshot) — else 403/409.
- Write an `ApprovalDecision`.
- **approve** → more steps: `currentStepPosition++`, notify next step's approvers; last step: request `approved`, subject → approved state, notify **submitter**.
- **reject** → request `rejected`, subject → `draft`, notify **submitter** with the note.
- **Concurrency (any-one-clears):** the state change is a **conditional update** — `WHERE status='pending_approval' AND currentStepPosition = :seen`. Two approvers in one step (or approve-vs-reject) racing → exactly one wins; the loser gets a clean "already actioned" (no double-advance).

### 4.3 Dynamic approver resolution (at submit, frozen into snapshot)
- `users` → `approverUserIds` verbatim.
- `reporting_manager(level N)` → walk `User.managerId` up N hops from the **submitter**; the resulting user is the step's single approver.
- `hiring_manager` → **req gate**: `job.hiringManagerId`; **offer gate**: offer → pipelineEntry → job → `hiringManagerId`.
- **Unresolvable step** (no manager set, walked past top, or resolved user deactivated) → the step is dropped (auto-passes); audit-log it **and notify the submitter + an org admin** ("approval step skipped — no reporting manager set"). If dropping empties the whole chain, §3.3 rule 2 applies (whole request auto-passes).
- Resolved concrete userIds are **frozen** into `chainSnapshotJson`; later manager/hiring-manager/config edits never reroute an in-flight request.

### 4.4 cancel(context, requestId, actor)
Actor is submitter or `approvals:configure` holder; request → `cancelled`, subject → `draft`, current-step approvers notified.

### 4.5 Notifications & audit
- Reuse `NotificationsService.notify(context, actor, recipientIds, type, target)`. New types: `approval.requested` (→ current-step approvers, deep-links to the item's approval panel / inbox detail), `approval.approved` / `approval.rejected` (→ submitter), `approval.cancelled` (→ current approvers). In-app `NotificationBell` only for v1.
- `audit.record` on submit / each decision / cancel / auto-pass / config change (actor, gate, subjectId, step) — surfaces in the existing audit-log view.

### 4.6 Integration points (the only edits to existing code)
- `pipeline.service`: `createJob` sets `status='draft'` when the req gate is enabled; new `submitRequisition` calls `ApprovalsService.submit`; **guards** on `setPublicApply` + `addEntry` refuse unless `status='open'`.
- `offers.service`: new `submitOffer` calls `submit`; existing `send` refuses unless `status='approved'` (gate on) — one guard line.
- `users.service`: `updateUser` accepts `managerId`.

---

## 5. Permissions (RBAC)

- New permission **`approvals:configure`** — manage chains + the org hierarchy manager field on users. Seeded to `org_admin` by default.
- **Approving needs no permission** — authorization *is* membership in the current step's approver set (that's why a non-admin hiring manager can approve).
- **Submit** reuses each flow's existing permission: `pipeline:manage` (requisition), `candidate:manage` (offer).
- Reads (inbox) are any authenticated org user, org-scoped by RLS.

---

## 6. API surface

### Config (org-admin, `approvals:configure`)
```
GET  /organizations/approvals/chains            → both gates: enabled + ordered steps
PUT  /organizations/approvals/chains/:gate       → upsert one gate's enabled + ordered steps
```
Config edits never touch in-flight requests (they carry their own snapshot).

### Requisition fields — additive to existing job DTOs (no new endpoints)
```
POST /pipeline/jobs   &   PATCH /pipeline/jobs/:id
  + department?, hiringManagerId?, headcount?, salaryMin?, salaryMax?, salaryCurrency?
```

### Org hierarchy — additive to existing user DTO
```
PATCH /users/:id   + managerId?
```

### Submit / cancel — on the owning modules (reuse each flow's permission)
```
POST /pipeline/jobs/:id/submit            (pipeline:manage)
POST /pipeline/jobs/:id/approval/cancel   (submitter | approvals:configure)
POST /offers/:id/submit                   (candidate:manage)
POST /offers/:id/approval/cancel          (submitter | approvals:configure)
```

### Approve / reject + approver inbox — shared approvals controller
```
GET  /approvals/requests?scope=inbox|submitted[&status=]   → list
GET  /approvals/requests/:id                                → detail: steps, decisions, snapshot, subject summary
POST /approvals/requests/:id/decide   { decision:'approved'|'rejected', note? }
```
- `decide` carries no permission key — the runtime guard *is* the authorization.
- `scope=inbox` = requests where I'm a current-step approver; `scope=submitted` = requests I opened. Both org-scoped by RLS.

### Subject reads gain an approval summary (richer payloads, no new endpoints)
- `GET /pipeline/jobs/:id` + the pipeline board → each job carries `{ approval: { status, currentStep, steps[] } | null }`.
- Offer reads → same `approval` summary.

**Ponytail ceiling:** `scope=inbox` filters by membership in `currentStep.approverUserIds` (JSON in the snapshot, not a relational column). v1 fetches the org's `pending_approval` requests and filters in app code — fine at ATS volumes (tens of open items). Upgrade path if it ever grows: a denormalized `current_approver_user_id` join table. Leave a `ponytail:` comment.

---

## 7. UI surfaces (v2 kit)

All on existing ui-v2 primitives — `Dialog`, `DataTable`, `Timeline`, `IconStatCard`, `Combobox`, inline `notice`, `NotificationBell`. Two shared components:
- **`ApprovalTimeline`** (built on `Timeline`): one row per step, tone dot = pending/approved/rejected, shows approver names + decision note + relative time.
- **`ApprovalDecisionDialog`**: approve/reject + note.

### 7.1 Settings → Approvals (new, `/v2/settings/approvals`; org-admin nav item, gated to `approvals:configure`)
Per-gate card: enable toggle + ordered **step editor** (add / remove / up-down reorder). Each step: a name `TextField` + an **approver-type selector** — Users (multiselect `Combobox` from teammate directory) / Reporting manager (+ level: Direct / Skip-level / N) / Hiring manager. Save = `PUT …/chains/:gate`. Follows the billing/integrations settings-page pattern.

### 7.2 Staff Users edit
Gains a **Manager** `Combobox` (from the teammate directory). No org-chart visualization — just the field.

### 7.3 Job form
Adds Department, Hiring manager (`Combobox` of teammates), Headcount, Salary min/max/currency.

### 7.4 Requisition status + submit (v2 Jobs list + job detail)
- Status `Pill`: Draft / Pending approval / Open / Closed.
- Draft + gate-on → **"Submit for approval"**; pending → `ApprovalTimeline` + Cancel; rejected → reason inline + re-submit.
- Add-candidate and enable-public-apply controls disabled on an unapproved req, with a one-line hint; 409 also rendered as a `notice`.

### 7.5 Offer approval (in `CandidateDrawer` offer flow)
- Status `Pill` gains Pending approval / Approved.
- Gate-on: **Send** replaced by "Submit for approval" until `approved`, then Send returns; same `ApprovalTimeline` + Cancel.

### 7.6 Approvals inbox (new nav item "Approvals"; visible to everyone — empty if nothing assigned)
- `DataTable` of `scope=inbox` (subject title, gate, submitter, current step, waiting-since) + a small `IconStatCard` strip (Awaiting you / Submitted by you / Approved 30d).
- Row → detail with `ApprovalTimeline` + `ApprovalDecisionDialog`.
- A `scope=submitted` tab for submitters to track their own items.

### 7.7 NotificationBell (already built)
The 4 new types render with deep links; no bell changes beyond type labels/icons.

---

## 8. Testing

Jest; unit specs colocated, API e2e in `apps/api/test`. Depth concentrates on the engine, the resolver, and the gates.

### 8.1 `ApprovalsService` unit
- `submit`: disabled gate → no-op; zero effective steps → auto-pass + audit; normal → pending at step 1, step-1 approvers notified, snapshot frozen.
- `decide` approve: advances; final → subject approved (Job `open` / Offer `approved`) + submitter notified.
- `decide` reject: → rejected, subject `draft`, submitter notified; resubmit starts fresh at step 1.
- `decide` guards: non-current-step approver → 403; stale `currentStepPosition` → 409.
- **Concurrency:** conditional-update lets one of two same-step deciders win; the other gets "already actioned" (no double-advance); approve-vs-reject race same.
- `cancel`: submitter/`approvals:configure` only → cancelled, subject `draft`.
- Snapshot immutability: editing chain config mid-flight doesn't mutate an in-flight request.

### 8.2 Dynamic resolver unit
- `reporting_manager` level 1 and level 2 resolve up `managerId`.
- No manager set → step dropped + audit + notify submitter/admin; if that empties the chain → whole request auto-passes.
- `hiring_manager` resolves for the **req** gate (job.hiringManagerId) and the **offer** gate (entry→job).
- Resolved users frozen in snapshot; changing a user's manager mid-flight does not reroute.

### 8.3 Gating integration
- `addEntry` / `setPublicApply` refused (409) on an unapproved req when gate on; allowed when gate off or job `open`.
- `offers/:id/send` refused unless `approved` when gate on; unchanged when gate off.
- No retroactive pull-back: enabling a gate leaves existing `open` jobs / `sent` offers alone.

### 8.4 Config + RBAC
- Chain upsert validation: enabled + `users` step with no approvers → rejected; enabled + zero steps → allowed (auto-pass); positions normalized; `reporting_manager` step requires `managerLevel ≥ 1`.
- `approvals:configure` required for config + user-manager edits; `decide` authorized by membership, not permission.

### 8.5 Web (match existing v2 depth — render + interaction)
`ApprovalTimeline` states; `ApprovalDecisionDialog`; settings step-editor add/reorder/approver-type; job-form new fields; Staff Users manager field; gated controls disabled.

### 8.6 Migration
SQL Server migration applies clean + idempotent — new tables, `Job` columns, `User.managerId`, and **RLS policies on the new tables** (org-scoped). Watch the two known project hazards: no same-batch column references; `EXEC`-wrap statements that need it.

**Machine caveat:** this box fakes mass jest failures under load — run new suites isolated when validating.

---

## 9. Rollout / deploy notes

- Rides the existing coordinated-deploy backlog (billing/integrations/collab/portal + v2 UI). Sequence the migration with those; grandfather nothing special — both gates default **disabled**, so existing orgs see no behavior change until they configure a chain.
- Seed the `approvals:configure` permission and grant it to `org_admin` in the RBAC seed (idempotent upsert).

---

## 10. Scope cuts (YAGNI) — deliberately out of v1

Each has a clean add-later path:
- **Conditional / criteria routing** (Zoho's multi-rule model) — one chain per gate, no per-department/attribute criteria. Add later: criteria rules per chain.
- **Parallel / all-must-approve steps** — every step is any-one-clears. Add later: a `mode` per step.
- **SLA timers & auto-escalation** — the inbox "waiting-since" makes stalls visible manually.
- **Email notifications** — in-app only for v1; SMTP approval emails are a fast follow.
- **Editing an in-flight chain** — frozen by snapshot; the path is cancel + resubmit.
- **Org-chart visualization** — just the `managerId` field + resolver; no chart UI.
- **Headcount/budget tracking** — `headcount` is a stored field only; no filled-vs-open decrementing, no budget rollups.
- **Requisition templates, bulk approve, approval analytics dashboard, comment threads** (beyond the single decision note) — all later.
