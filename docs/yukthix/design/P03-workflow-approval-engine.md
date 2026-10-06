# P03 · Workflow & Approval Engine

> **Status:** ✅ Decided, 24 Sep 2026. All 8 questions answered (§11).
> **Covers:** spec §2.1.4 (generic configurable approval chains, built once, reused by every module), Leave decision "delegation must be built", gap summary §2 (the most-shared platform gap), UI brief principle 1 ("decisions are actions").
> **Builds on:** [P01](P01-tenancy-and-organisation.md) (org structure, managers) and [P02](P02-access-visibility-privacy.md) (roles, scopes, no self-approval, maker ≠ checker).

---

## 1. Purpose & scope

One engine routes **every** request that needs someone's decision:

| Module | Request types (examples) |
|---|---|
| Leave (M02) | Leave, leave cancellation, comp-off claim, balance adjustment |
| Attendance (M02) | Regularisation, WFH / on-duty, shift change / swap, overtime pre-approval |
| Payroll (M03) | Payroll run approval, bank file release, one-time pay, salary revision, statutory payment |
| Core HR / Lifecycle (M01) | Profile change (bank, PAN, name), promotion / transfer, confirmation, resignation, F&F |
| Expenses (M05) | Claim, advance, trip |
| Performance (M06) | Goal approval, review sign-off, calibration change |
| Hiring (M10) | Requisition, offer (existing exam-app gates) |
| Platform (P02) | Role grant with Confidential access, support-access session |

**Out of scope:** message delivery (P04 sends what this engine emits); audit storage (P08).

---

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | Keep / change |
|---|---|---|
| `ApprovalChain` | One chain **per org per gate**; `gate` ∈ requisition / offer; enabled flag | **Generalise:** many *policies* per request type, chosen by conditions |
| `ApprovalChainStep` | Ordered steps; approver types: `users`, `reporting_manager` (N levels), `hiring_manager`, `group` | **Keep and extend** resolvers (§4.3) |
| `ApprovalRequest` | Gate, subject (job/offer), status, current step, **chain snapshot JSON** at submit | **Keep the snapshot idea**; add request type, payload snapshot, SLA |
| `ApprovalDecision` | Approve / reject + note per step | Extend to more actions (§4.5) |
| `ApprovalEmailTemplate` | Per-org email templates for requested / approved / rejected / cancelled | Moves to the notification engine (P04) |
| Shared helpers | `isPendingForApprover` (one definition of "pending for me") | Keep the principle: one inbox query |
| UI | `ApprovalTimeline`, `ApprovalDecisionDialog` (ui-v2) | Reuse (UI brief §5) |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **Request type** | A kind of request registered by a module in code: key, subject entity, the **fields usable in conditions**, allowed actions, and what happens on approve/reject |
| **Policy** | A tenant-defined route for a request type: conditions ("amount > ₹10,000", "leave type = Maternity", "entity = LLP") + ordered steps. Several policies per type, checked by priority; the first match wins; there is always a default |
| **Step** | One stage: who approves (resolver), how many must approve (any / all / N), time limit, escalation, optional skip condition |
| **Resolver** | How approvers are found at run time: reporting manager (level N), department head, role in scope, named users, group, field on the subject |
| **Task** | One approver's to-do for one step of one request |
| **Delegation** | An approver hands their tasks to someone else for a period (manual, or automatic while on leave) |
| **Snapshot** | The policy and resolved approvers frozen at submit, so later configuration changes don't alter requests in flight |
| **Subject employee / proxy requester** | The **subject** is the employee the request is for; the **raiser** is who filed it. Normally the same person; when HR or a manager files it for someone (e.g. a shop-floor worker without a login), the raiser is a **proxy** (YX-WF-18) |

---

## 4. Design

### 4.1 Request type registry (code)
Each module registers its request types (like settings and permissions in P01/P02):
- key, label and subject entity;
- condition fields with types (amount, days, leave type, grade, entity, location, department, …);
- allowed approver actions (e.g. expense: *approve with changes* per line; leave: not);
- edit rules (can the requester edit while pending?);
- cancel-after-approval flow;
- **effects**: callbacks run on final approve / reject / cancel (e.g. post a leave ledger entry);
- default policy (used until the tenant configures one);
- risk level (low / normal / high), which drives email/WhatsApp approval (Q4) and auto-actions.

### 4.2 Policies & conditions
- *(26 Sep 2026, D19: conditions are written in the shared P19 rule language and may use any field, including P18 custom fields and related records; routing policies are P19 **routing rules**.)*
- A no-code **condition builder** over the registered fields: `amount > 10000 AND category = Travel`, `days >= 5`, `grade in (G5, G6)`, `legal entity = LLP`.
- Policies are ordered; the first match wins; a **catch-all default** is mandatory (no request can be unroutable).
- A policy can be limited to legal entities / locations (so the Pvt Ltd and LLP can route differently).
- **Test before saving:** "Simulate" with a sample request shows which policy matches and who would approve.

### 4.3 Steps & resolvers

| Resolver | Resolves to | Example |
|---|---|---|
| Reporting manager (level N) | Manager at level 1, 2… of the requester's assignment on the request date | Leave: L1 manager |
| Department head | Head of the requester's department (or a parent level) | Big purchases |
| Role in scope | Holders of a role whose scope covers the requester (P02) | "HR Admin of the employee's entity" |
| Named users / group | Fixed people or a user group | Finance team |
| Subject field | A person referenced on the subject | Project manager on a timesheet; hiring manager on a requisition |
| Requester's skip-level | Manager's manager | Sensitive cases |

**Step options:**
- **mode:** any one / all / at least N;
- **skip condition** (e.g. skip the Finance step if amount ≤ ₹5,000);
- **SLA** (working hours/days, using the approver's location calendar);
- **escalation target**;
- **fallback resolver** when nobody resolves (e.g. no manager) → default: HR Admin of the entity.

**Automatic step adjustments** (all recorded in the timeline):
- The resolved approver **is the requester** → that person is removed; if the step becomes empty, use the fallback (YX-SEC-11).
- The same person approves consecutive steps → auto-approve the duplicate step (Q6), **never across a maker ≠ checker boundary** (YX-WF-05).
- The approver has **left or is inactive** → re-resolve; pending tasks are reassigned.

### 4.4 Delegation
- **Manual:** an approver sets a delegate for a date range, optionally per request type.
- **Automatic** while the approver is on approved leave (Q3).
- The delegate acts **on behalf of** the approver: the timeline shows "Priya (for Ananya)".
- Delegates must pass the same P02 checks (they can't see fields their own role can't).
- Delegation never chains (A→B→C resolves to B's own tasks only).

### 4.5 Actions

| Actor | Actions |
|---|---|
| Approver | **Approve** · **Reject** (reason required) · **Send back** for changes (reason; requester edits and resubmits; the chain restarts per Q7) · **Approve with changes** (only where the type allows, with a reason per change, Q5) · **Reassign** to another eligible approver · **Comment / ask a question** (the requester answers in the thread; the SLA pauses optionally) |
| Requester | **Withdraw** (while pending) · **Cancel** after approval (runs the type's cancellation flow, itself approvable) · reply to questions |
| Proxy requester (with `request.raise_on_behalf`, P02 YX-SEC-27) | **Raise on behalf** of a subject employee in scope, for request types the company allows · withdraw / reply on the subject's behalf |
| Admin (with `workflow.request.override`) | Reassign stuck tasks, force-close with reason (audited) |

- **Bulk approve** from the queue for items of the same type; each item is still individually checked.
- **Mobile approval card** (UI brief §5): the request type supplies the context block (balance after, "2 others off", receipts).
- **Raise on behalf (proxy requester):** HR, or a manager for their own team, may raise a request for a subject employee. The company chooses who may do this (HR only / HR + managers) and for which request types. The approval chain and all resolvers resolve from the **subject** (not the raiser); the timeline shows "raised by X on behalf of Y"; the subject is informed through their channel (kiosk / WhatsApp / SMS, P04); the proxy can never approve a request they raised (YX-WF-18).

### 4.6 SLA, reminders & escalation
Per step:
- due time → reminder at 50 % and 100 % → **escalate** to the approver's manager (or a configured role) after the SLA;
- optionally **auto-action** after a further period, for request types the tenant allows (Q2).
- SLAs count **working time** of the approver's location.

Everything emits events for P04 (notifications) and P09 (metrics: turnaround time, pending age).

### 4.7 One-tap approval outside the app (Q4)
Low-risk request types can be approved from an email / WhatsApp message through a **signed, single-use, short-lived link** that opens a minimal confirm page. High-risk types always need a login (with MFA where enabled).

### 4.8 Generic "change with approval"
A reusable request type for **field changes**: the subject, old → new diff, attachments (proof), and applying the change on approval. Used for bank/PAN/name changes (P02 YX-SEC-13), master data edits, and past-dated corrections in locked periods (P08).

---

## 5. Data model

| Table | Key columns |
|---|---|
| `approval_policies` | `organization_id`, `request_type`, `name`, `priority`, `conditions jsonb`, `entity_ids[]`, `location_ids[]`, `is_default`, `active`, `version` |
| `approval_policy_steps` | `policy_id`, `position`, `name`, `resolver_type`, `resolver_params jsonb`, `mode` (any/all/n), `min_approvals`, `skip_condition jsonb`, `sla_minutes`, `escalation jsonb`, `fallback jsonb` |
| `approval_requests` | `request_type`, `subject_type`, `subject_id`, `requester_employee_id`/`user_id` (the subject), `raised_by_user_id` (proxy raiser; null when self-raised), `payload jsonb` (condition fields frozen at submit), `policy_snapshot jsonb`, `status` (draft / pending / sent_back / approved / rejected / withdrawn / cancelled), `current_step`, `submitted_at`, `decided_at` |
| `approval_tasks` | `request_id`, `step`, `assignee_user_id`, `on_behalf_of_user_id`, `status` (open / done / skipped / reassigned / escalated), `due_at`, `escalated_at` |
| `approval_actions` | `request_id`, `task_id`, `actor_user_id`, `on_behalf_of`, `action`, `reason`, `changes jsonb`, `channel` (web / mobile / email / whatsapp), `created_at` |
| `approval_delegations` | `user_id`, `delegate_user_id`, `from`, `to`, `request_types[]`, `source` (manual / leave) |

All tables carry `organization_id` + RLS (P01). "Pending for me" = open tasks for me or for people who delegated to me, a single indexed query (keeping the exam app's single-definition principle).

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-WF-01 | Every request type has a default policy; a request can never be left without a route. |
| YX-WF-02 | Policy, steps and resolved approvers are **snapshotted at submit**; configuration edits affect only new requests. |
| YX-WF-03 | Policies are evaluated in priority order on the frozen payload; the first match wins; the matched policy is recorded on the request. |
| YX-WF-04 | A requester is never their own approver; if removal empties a step, the fallback resolver applies (P02 YX-SEC-11). |
| YX-WF-05 | Maker ≠ checker request types (payroll run, bank file, statutory payment) follow P02 YX-SEC-12 including the single-user exception. |
| YX-WF-06 | Inactive or departed approvers are re-resolved; their open tasks move to the new approver or fallback, with a timeline entry. |
| YX-WF-07 | Delegation acts on behalf of the delegator, never chains, and the delegate's own P02 field restrictions still apply. |
| YX-WF-08 | Reject and send-back require a reason; approve-with-changes requires a reason per change and is allowed only when the request type permits it. |
| YX-WF-09 | SLAs count working time on the approver's location calendar; reminders and escalation follow the step's settings; auto-actions only for types the tenant enabled. |
| YX-WF-10 | Approval effects (ledger postings, record updates) run exactly once, in the same transaction as the final decision, or as an idempotent job with retry. |
| YX-WF-11 | Late requests on **frozen / locked** dates (P08 Q4) are allowed up to the tenant's maximum lateness, with an extra HR approval step; the effect posts to the next payroll (arrears / LOP reversal). Reopening a locked period happens only per P08 Q3, never as a side effect of a request. |
| YX-WF-17 | Duplicate-approver auto-approval (Q6) never applies across a maker ≠ checker boundary (YX-WF-05): the checker step always needs its own decision. |
| YX-WF-12 | Every action (who, on behalf of whom, channel, reason, changes) is stored and shown in the request timeline. |
| YX-WF-13 | Out-of-app approval links are signed, single-use, expire (default 72 h), work only for low-risk types, and re-check permission at click time. |
| YX-WF-15 | On resubmission after send-back, the engine compares condition fields with the frozen payload: unchanged → resume at the sending step; changed → re-evaluate policies and restart at step 1 with a fresh snapshot. |
| YX-WF-16 | Editing a policy requires `workflow.policy.manage` plus the owner permission of sensitive request types; saves require a Simulate run, create a new policy version and are audited. |
| YX-WF-18 | A request may be **raised on behalf** of a subject employee by a holder of `request.raise_on_behalf` (P02 YX-SEC-27), only for request types the company enabled for that role (HR only / HR + managers). Policies, conditions and resolvers evaluate on the **subject**; the timeline shows "raised by X on behalf of Y"; the subject is notified (kiosk / WhatsApp / SMS); YX-WF-04 removes **both** the subject and the proxy raiser from every approval step. |
| YX-WF-14 | Status and pending counts shown anywhere (home, queue, mobile, dashboards) come from the same task query (UI brief principle 2). |
| YX-WF-19 | **Access request** is a registered request type, raised by the **Request access** button on the permission-denied state (APX-D §6.3): the requester asks for a permission or a record scope (subject = resource / permission, reason required). It routes to the HR Admin in scope of the record's owner (role owner), then System Admin as fallback; it is never offered for restricted areas (YX-SEC-10), which show "Not found". On approval the effect grants a **time-boxed** scope through P02 (end date required where the role allows; revoked automatically at expiry); request, decision, grant and expiry are audited (P08). |

---

## 7. UI
- **Approvals inbox** (global, T2): tabs Waiting for me · Delegated to me · Sent by me · Team history; filters by type; bulk approve; approval cards inline.
- **Request timeline** (right rail of every record, ✅ ApprovalTimeline): steps, who, on behalf of, when, reasons, SLA state.
- **Policy editor** (Settings → Approvals): per request type list of policies (priority drag), condition builder, step cards (resolver picker, mode, SLA, escalation, skip), **Simulate** panel.
- **Delegation** in Me: "I'm away from… to…, delegate to…".
- **Mobile:** Requests › Team as approval cards with swipe and bulk (UI brief §7).

---

## 8. Migration (exam app)
1. `requisition` and `offer` become registered request types; each existing `ApprovalChain` becomes that type's default policy (no conditions); step approver types map 1:1 (`hiring_manager` → subject-field resolver).
2. Existing `ApprovalRequest`s: `chainSnapshotJson` → `policy_snapshot`; decisions → actions; open ones get tasks.
3. `ApprovalEmailTemplate` → P04 templates for the `approval.*` events.

---

## 9. Acceptance tests (samples)
- An expense of ₹12,000 by a G3 in the LLP matches policy "LLP high value" (manager → finance); a ₹4,000 claim goes manager-only (YX-WF-03).
- Priya approves her own team's request where she is also level-2 approver → the second step auto-approves with a timeline note (Q6).
- A manager on approved leave → tasks route to the delegate; the timeline shows "for …" (YX-WF-07).
- The approver leaves the company mid-request → the task moves to the fallback within one job cycle (YX-WF-06).
- Editing a policy doesn't change pending requests (YX-WF-02).
- A leave cancellation for a period whose payroll is locked goes through with an extra HR approval step; the LOP reversal posts to the next payroll; beyond the tenant's maximum lateness it is refused (YX-WF-11).
- An email approval link reused or expired → rejected; for payroll run types, no email link is sent (YX-WF-13).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | When a step has several approvers, default: **any one** approves, or **all** must? | **Any one** by default; *all* / *at least N* selectable per step. |
| Q2 | When an approver misses the deadline: only remind and escalate, or also auto-approve/reject? | **Remind → escalate** by default; **auto-approve** allowed only for request types the tenant switches on (e.g. regularisation ≤ 1 day). Never for payroll, bank, role grants. |
| Q3 | Automatic delegation when an approver is on approved leave? | **Yes**: to their chosen delegate, else their own manager; manual delegation too. |
| Q4 | Approve from email / WhatsApp without logging in? | **Yes for low-risk types** via signed single-use links; high-risk always needs login. |
| Q5 | Can approvers change a request while approving? | Only where the type allows it (e.g. reduce an expense line with a reason); otherwise **send back**. |
| Q6 | Same person at consecutive steps: auto-approve the duplicate? | **Yes** by default (configurable per policy). |
| Q7 | After **send back**, does the chain restart from step 1 or resume at the step that sent it back? | **Resume at that step** by default; restart from step 1 if the requester changed a field used in a policy condition (e.g. amount). |
| Q8 | Who configures approval policies? | HR Admin and System Admin via permission `workflow.policy.manage`, with the Simulate check; payroll/role-grant policies need Payroll Admin / System Admin respectively. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | Step mode default **any one**; per step the tenant may choose **all** or **at least N**. | 24 Sep 2026 |
| Q2 | SLA breach: **remind (50 % / 100 %) → escalate** to approver's manager or configured role. **Auto-approve / auto-reject** only for request types the tenant enables (with its own delay); **never** for high-risk types (payroll run, bank file, statutory payment, bank/PAN change, role grants, support access). | 24 Sep 2026 |
| Q3 | **Automatic + manual delegation.** During an approved leave the approver's tasks go to the delegate chosen on the leave request, else to their own manager; manual delegation for any date range and request types. The leave-apply sheet asks "Who approves for you while you're away?" | 24 Sep 2026 |
| Q4 | **Out-of-app approval (email / WhatsApp) for low-risk types only**, via signed single-use links (expire 72 h, permission re-checked on click, tenant can switch off). High-risk types always require login. Risk level is set per request type in the registry; tenants may raise a type's risk but not lower a high-risk one. | 24 Sep 2026 |
| Q5 | **Approve-with-changes only for request types that allow it** (e.g. expense lines, advance amount), each change with a reason and shown to the requester as old → new. All other types: **send back** for the requester to edit. | 24 Sep 2026 |
| Q6 | **Duplicate consecutive approver → the later step auto-approves** by default, with a timeline note; the tenant can switch this off per policy. Never applies across a maker ≠ checker boundary (YX-WF-05). | 24 Sep 2026 |
| Q7 | **After send-back, resume at the step that sent it back**, unless the requester changed a field used in policy conditions or step skip-conditions (e.g. amount, days, leave type): then re-evaluate the policy and **restart from step 1** with a new snapshot. The timeline shows which rule applied. Rule YX-WF-15. | 24 Sep 2026 |
| Q8 | **Policy management via permission `workflow.policy.manage`** (HR Admin + System Admin by default). Sensitive request types need their owner permission too: payroll/bank/statutory policies → `payroll.policy.manage` (Payroll Admin); role-grant and support-access policies → System Admin. Saving requires a passing Simulate run; every policy change is versioned and audited. Rule YX-WF-16. | 24 Sep 2026 |
| D5 | **Proxy requests (raise on behalf).** HR, or a manager for their own team, may raise a request on behalf of an employee; the approval chain resolves from the **subject** employee; the timeline shows "raised by X on behalf of Y"; the employee is informed (kiosk / WhatsApp / SMS); a proxy can never approve a request they raised; the company chooses who may raise on behalf (HR only / HR + managers) and for which request types. Rule YX-WF-18; permission in P02 YX-SEC-27. | 26 Sep 2026 |
| F-follow-ups (consistency fix) | **Access request type (APX-D §8 F-11).** Registered request type "Access request" behind the **Request access** button (APX-D §6.3): the requester asks for a permission / record scope; routed to the HR Admin in scope of the record's owner, then System Admin; never offered for restricted areas; on approval a time-boxed scope is granted via P02; audited. Rule YX-WF-19. | 26 Sep 2026 |
| D19 | **Amended by spec D19 / P19 (26 Sep 2026):** approval conditions use the shared P19 rule language and can reference any built-in, custom or related field. | 26 Sep 2026 |
