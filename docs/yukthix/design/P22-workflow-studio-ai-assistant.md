# P22 · Workflow Studio & AI Assistant

> **Status:** ✅ Decided (founder decisions 1–3), 28 Sep 2026.
> **What it is:** three layers of company automation, from simplest to most powerful:
> - **Workflow Studio** (wave 2): a no-code, multi-step workflow builder. It extends P19 automations; a P19 automation becomes a one-step workflow (the **simple mode**).
> - **Script step** (wave 6): sandboxed JavaScript / TypeScript inside a workflow, using the YukthiX SDK (P11).
> - **AI assistant** (wave 5): the AI drafts workflows from a plain request ("build me an automation that …") and runs approved multi-step jobs ("do this for me") through normal APIs.
>
> Competitors: Salesforce Flow and Apex, Workday Business Process + Extend, ServiceNow Flow Designer, Zoho People workflows + Deluge, Zapier / Make, Darwinbox and Keka workflow builders.
>
> **Builds on:**
> - P19 rule language, expressions, impact preview (YX-RULE-07), second approver (YX-RULE-06), protected fields (YX-RULE-04), loop protection (YX-RULE-11);
> - P03 requests and approvals; P04 notifications; P05 documents;
> - P02 roles, field classes, maker ≠ checker; P08 locks and audit;
> - P10 AI layer (YX-AI-07 registered features, YX-AI-13 agent action contract, YX-AI-14 credits) and connectors (Part B);
> - P11 API, SDK, webhooks; P12 secrets vault and service identities; P14 usage metering; P15 sandbox and promotion;
> - P18 custom objects and fields; APX-B event catalogue.
>
> **Pricing (D18):** included, with fair-use limits per tenant per day (workflow runs, records touched, script CPU time, AI calls). Beyond fair use: **workflow usage add-on** and **AI credits**.
> **Build:** Studio wave 2 · AI assistant wave 5 · script step wave 6.

---

## 1. Purpose & scope
P19 automations cover "when X, do Y" in one step. Companies also need processes with several steps, waits, branches, approvals and loops (e.g. "30 days before probation ends: ask the manager, wait for the answer, confirm or extend, generate the letter"). Today this means paid customisation or an outside tool like Zapier.

P22 lets a company build these itself, safely:
- no code for most needs;
- a sandboxed script step for the rest, never broader than the admin who publishes it;
- an AI assistant that drafts workflows and carries out multi-step jobs, with a human approving every plan and every sensitive step.

**Out of scope:**
- custom UI components and a component SDK, partner marketplace (stay in P11 **TR1**);
- statutory calculations and filings (P07, M03; workflows may *start* them as requests, never compute or file);
- the approval engine itself (P03; workflows use it).

## 2. What exists today
- **Exam app:** fixed approval chains; outbound webhooks with delivery log; no automations.
- **Design:**
  - P19 one-step automations (trigger → conditions → actions), expression language, impact preview, loop protection, run log;
  - P03 request types and approvals; P04 notifications; P05 document generation;
  - P10 agent action contract (YX-AI-13) and AI credits (YX-AI-14); connector framework (B2);
  - P11 SDKs, HMAC-signed outbound webhooks;
  - P18 §1 excluded custom code.
- **Missing:** multi-step workflows, waits, loops, error handling, undo, inbound triggers, scripts, AI drafting and plan execution.

## 3. Concepts
- **Workflow:** a named, versioned graph of steps started by one trigger. Status: draft / in review / published / paused / retired. Owner module optional.
- **Simple mode:** a one-step workflow, shown in the P19 automation form. Every existing P19 automation is converted to one (no behaviour change).
- **Triggers:**

  | Trigger | Detail |
  |---|---|
  | Event | Any event in the APX-B catalogue the author may see |
  | Field change | Record type + field + from / to condition (P19 expression) |
  | Date / relative date | "On *Probation end date*", "30 days before *Contract end*" |
  | Schedule | Once or recurring (daily / weekly / monthly / cron-style), tenant time zone |
  | Form submitted | A P18 form or custom request type |
  | Inbound email | Mail to the workflow's own address (`wf-<id>@<tenant>.in.yukthix`); sender allow-list; attachments scanned |
  | Manual run | Button on a record or list, with inputs; permission per role |
  | Webhook in | HTTPS endpoint per workflow, **signed secret** (HMAC + timestamp, P11 pattern), replay window 5 min |

- **Steps:**

  | Step | Detail |
  |---|---|
  | Condition / branch | If / else-if / else on P19 expressions |
  | Wait | For a duration, until a date, or until a condition holds; always with a **timeout** and a timeout branch |
  | Loop | Over a list (query result, related records, input list); **max items** per loop |
  | Approval | Creates a P03 request; branches on approved / rejected / expired |
  | Task | Assigns a task to a person or role |
  | Notify | P04 template to people, roles or channels |
  | Create / update record | Company and custom fields only (P19 YX-RULE-04): never statutory values, locked periods, audit, consent |
  | Start request | Any P03 request type, on behalf of the workflow's service identity or a named person (who confirms) |
  | Generate document | P05 template; optional e-sign |
  | Call connection | A P10 connector action, or outbound HTTP **only to admin-approved endpoints** |
  | Bulk action | Same action over a list, counted against the per-run record limit |
  | Script (wave 6) | See Script step below |

- **Variables:** trigger data, step outputs and workflow variables, typed; referenced in the P19 expression language.
- **Error handling per step:** retry (count, backoff), fallback branch, or stop and alert (owner + P04). Default: retry 3 times, then stop and alert.
- **Compensating actions (undo):** each reversible step declares its undo (update record → restore old values; create record → delete / cancel; task → cancel; request → withdraw if still pending). Irreversible steps are **marked** in the builder (message sent, email sent, webhook / connection called, document e-signed, approval given by a person).
- **Limits:** per run: max records touched, max steps executed, max duration. Per tenant per day: runs, records touched, script CPU seconds (fair use, D18). Defaults set by the team and shown on the usage page.
- **Kill switch:** pause one workflow, or all workflows in the tenant (System Admin; also available to YukthiX support in an incident, audited). Paused runs stay paused and can be resumed or cancelled.
- **Template gallery (starters, D17):** probation-ending reminders; document expiry chase; birthday / work-anniversary wishes; monthly headcount report; new-joiner IT request; leave balance low alert; candidate no-show follow-up. Each opens as an editable draft.
- **Script step (wave 6):**
  - JavaScript / TypeScript with the YukthiX SDK (P11 sandbox-safe subset);
  - runs in an **isolated sandbox**: no file system, no internet except admin-approved connections, CPU / memory / time limits;
  - inputs and outputs are logged (deterministic: same inputs, same calls);
  - runs as a named **service identity** whose permissions are **equal to or narrower than the publishing admin's**, never broader;
  - secrets only from the vault (P12), never in code;
  - static checks before publish (types, banned APIs, secret patterns, SDK scopes used vs identity);
  - versioned and reviewed like rules; AI can draft a script from a plain description.
- **Service identity:** a non-login principal owned by the tenant, with a P02 role set at publish. If the publishing admin loses rights, the workflow is paused until another admin re-publishes.
- **AI assistant:**
  - **Build mode:** "Build me an automation that …" → the AI drafts a workflow (and scripts if needed), explains it in plain words, and runs the impact preview. An admin publishes; the AI **never publishes**.
  - **Do mode:** "Do this for me" → the AI writes a **plan** (records, changes, screens / APIs, irreversible steps flagged). The person approves the plan once; execution runs through normal APIs **with the person's own permissions**, shows progress, then a summary and undo where reversible.
  - **Always-confirm steps** (separate explicit confirmation per step, never autonomous): money (payroll release, payouts, bank files), statutory filing, approving or rejecting others' requests, candidate rejection, dismissal / termination, any change to pay.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `workflows` | `organization_id`, name, trigger type + config, owner module, status, service_identity_id, kill-switch flag, template ref, converted_from_rule_id (P19) |
| `workflow_versions` | Workflow × version: step graph (JSON, typed), variables, limits, author, reviewer (second approver), change note, impact-preview ref (P19 `impact_previews`), static-check result |
| `workflow_triggers_inbound` | Inbound email address and sender allow-list; webhook endpoint, secret (encrypted, vault ref), rotated_at |
| `workflow_runs` | Version × trigger payload ref: status (running / waiting / done / failed / stopped / undone), started by (event / schedule / person / agent plan), counts (steps, records), duration |
| `workflow_run_steps` | Run × step: input / output (P02 classes applied), result, retries, compensating action (JSON), reversible flag, undone_at |
| `workflow_waits` | Run × step: wake-up time or condition, timeout at (scheduler) |
| `workflow_scripts` | Version × script: source, SDK scopes used, static-check report, sandbox limits |
| `service_identities` | Tenant principal: role set, created by, publishing admin, status |
| `approved_endpoints` | Admin-approved outbound hosts / connections for HTTP steps and scripts |
| `agent_plans` | Person × request text: plan steps (JSON), approval (who, when), status, run refs, summary; links to `agent_actions` (P10) |
| `agent_plan_steps` | Plan × step: action, target records, API used, confirmation-required flag, confirmed_at, result, undo ref |
| `usage_counters` | Tenant × day: runs, records touched, script CPU s, AI calls (feeds P14 metering) |

All carry `organization_id` + RLS. Run and plan logs inherit the highest P02 class they touch.

## 5. Rules (YX-WFS)

| ID | Rule |
|---|---|
| YX-WFS-01 | Every P19 automation is a one-step workflow (simple mode). Converting one never changes its behaviour; the P19 form stays available for one-step workflows. |
| YX-WFS-02 | Create / update steps and scripts may change only company-owned and custom fields. Governed fields (statutory values, locked periods, audit, consent) are refused at save and at run (P19 YX-RULE-04). |
| YX-WFS-03 | A workflow version can be published only after an impact preview (P19 YX-RULE-07) and a test run on sample records. The preview is stored with the version. |
| YX-WFS-04 | Publishing a version that touches pay, leave balances, access or people data needs a **second approver** (P19 YX-RULE-06; maker ≠ checker). |
| YX-WFS-05 | Every version is kept; any past version can be viewed, compared and re-published. Runs record the version they used. |
| YX-WFS-06 | Every wait has a timeout and a timeout branch. Every loop has a max item count. A workflow without them can't be saved. |
| YX-WFS-07 | Per-run limits (records touched, steps, duration) stop the run with an alert when reached. Per-tenant daily limits follow fair use (D18) with 80 % / 100 % alerts; beyond is the usage add-on, never a silent stop of in-flight runs. |
| YX-WFS-08 | Loop protection as P19 YX-RULE-11: a workflow's action can't re-trigger the same workflow on the same record in one chain; cross-workflow chains stop at a depth limit and log a loop warning. |
| YX-WFS-09 | Each step declares retry, fallback branch or stop-and-alert. A failed run is visible in the failure queue with the step, input and error. |
| YX-WFS-10 | **Undo of a run** reverses reversible steps in reverse order using their compensating actions; irreversible steps are listed and left as they are. Undo is refused for any step whose record has since changed or whose period is locked (P08), and the conflict is shown. |
| YX-WFS-11 | Outbound HTTP and connection steps call only admin-approved endpoints or P10 connectors. Inbound webhooks need a valid HMAC signature and timestamp within 5 minutes; inbound email only from allow-listed senders. |
| YX-WFS-12 | Kill switch: an admin can pause one workflow or all workflows in the tenant at once; pausing takes effect before the next step of every run. |
| YX-WFS-13 | **Script sandbox.** Scripts run isolated: no file system, no network except approved endpoints, CPU / memory / time limits, SDK sandbox-safe subset only. Inputs, outputs and SDK calls are logged. |
| YX-WFS-14 | **Script identity.** A script runs as a service identity whose permissions are equal to or narrower than the publishing admin's; never broader. Secrets come only from the vault. If the publisher's rights drop, the workflow pauses. |
| YX-WFS-15 | **Script review.** Scripts pass static checks before publish, are versioned and reviewed like rules, and need a second approver when they touch pay or people data. |
| YX-WFS-16 | **AI build mode.** The AI may draft workflows and scripts, explain them and run the impact preview; it can never publish. A person with publish rights publishes, under YX-WFS-03/04/15. |
| YX-WFS-17 | **AI do mode.** A plan is executed only after the person approves it (plan approval, P10 YX-AI-15), only through public APIs, only with the person's permissions, and only within the approved plan. A step outside the plan stops the run. |
| YX-WFS-18 | **Always-confirm steps.** Money (payroll release, payouts, bank files), statutory filing, approving or rejecting others' requests, candidate rejection, dismissal / termination and pay changes need a separate explicit confirmation per step, on the app's own screen; never executed autonomously, by workflow or by agent (P10 YX-AI-13). |
| YX-WFS-19 | Every workflow run, script call, agent plan and plan step is audited (P08): who, what, version, identity, records, result, undo. |
| YX-WFS-20 | Workflows move between sandbox and production through P15 promotion when "promotion required" is on. YukthiX updates to gallery templates never change a tenant's workflows without acceptance. |

## 6. Flows
1. **Build from a template:**
   1. Settings › Automation › Workflow Studio › Gallery › "Probation ending reminders".
   2. Edit steps (30 days before: notify manager → approval "confirm / extend" → branch → update *Probation status* → generate letter).
   3. Test run on 5 sample employees.
   4. Impact preview (P19): 14 employees in the next 60 days.
   5. Publish (second approver if needed).
   6. Run log shows each run and step.
2. **Undo a run:** a bulk update ran on the wrong department → Run log › Undo → list of reversible steps (412 field updates) and irreversible ones (412 emails sent, marked) → confirm → values restored, audit entry.
3. **Inbound webhook:** a background-check vendor posts a result to the workflow URL → signature checked → workflow updates the custom field *BGV status* and notifies HR.
4. **Script step (wave 6):** admin asks the AI "score the referral bonus eligibility using the tenure and the client project" → AI drafts a script → static checks pass → test run → second approver (touches pay-related data) → publish; runs as service identity `wf-referral-bonus`.
5. **AI build mode:** "Remind managers when someone's leave balance drops below 2 days" → AI drafts trigger (field change on leave balance), condition, notify step, explains it, shows preview (37 alerts / month) → admin publishes.
6. **AI do mode:** "Move the 12 people in the Pune warehouse to the new Chakan location from 1 Nov" → plan: 12 transfer requests (P03), cost-centre change, notify managers; flags none as always-confirm → person approves plan → progress bar → summary with undo (withdraw pending requests). If the plan had included a pay change, each such step would ask for its own confirmation.

## 7. UI
- **Workflow Studio:** canvas with steps top to bottom, branches side by side; step palette; variable picker; plain-language summary; irreversible steps marked with an icon; limits panel.
- **Simple mode:** the P19 automation form, with "Open in Studio" to add steps.
- **Gallery:** starter cards with description and "Use this".
- **Test & preview panel:** sample records picker, step-by-step trace, P19 impact preview.
- **Versions:** list, diff, re-publish.
- **Run log & failure queue:** filter by status; open a run to see steps; Undo button with the reversible / irreversible list.
- **Kill switch:** per workflow toggle; tenant-wide switch in Settings › Automation with a confirmation.
- **Script editor (wave 6):** code editor with SDK types, static-check results, identity and scopes, test console.
- **AI assistant:** side panel in Studio (build mode); in the app shell and copilots (do mode) a plan card with steps, records, irreversible and always-confirm markers, Approve plan button, progress, summary, Undo.

## 8. Migration & rollout
- **Wave 2:** Studio, triggers, all no-code steps, gallery, undo, limits, kill switch. Existing P19 automations converted to one-step workflows (YX-WFS-01).
- **Wave 5:** AI assistant build and do modes (with P10 T1 copilots).
- **Wave 6:** script step, service identities for scripts, SDK sandbox-safe subset (with P18).
- Exam-app outbound webhooks keep working; they become a "call connection" step option.

## 9. Acceptance tests (samples)
- An existing P19 automation appears as a one-step workflow and fires exactly as before (YX-WFS-01).
- A workflow step that updates a PF wage value can't be saved (YX-WFS-02).
- Publishing without a test run and preview is refused; a workflow updating leave balances needs a second approver (YX-WFS-03/04).
- A wait step without a timeout can't be saved; a loop over 10,000 records with max 500 stops at 500 and alerts (YX-WFS-06/07).
- Undo of a run restores 412 field values, lists 412 sent emails as irreversible, and refuses a record edited since the run (YX-WFS-10).
- An inbound webhook with a bad signature or a 10-minute-old timestamp is rejected and logged (YX-WFS-11).
- Tenant-wide kill switch pauses 30 running workflows before their next step (YX-WFS-12).
- A script calling a non-approved URL fails; a script whose identity would exceed the publishing admin's rights can't be published (YX-WFS-13/14).
- The AI drafts a workflow but the Publish button is only for the admin (YX-WFS-16).
- A do-mode plan including "release October payroll" asks for a separate confirmation on the payroll screen and never releases on plan approval alone (YX-WFS-18).

## 10. Open questions (all decided)

| # | Question | Decision |
|---|---|---|
| Q1 | How far do no-code automations go? | Full multi-step Workflow Studio, extending P19; one-step automations stay as the simple mode. |
| Q2 | Allow custom code? | Yes, only as a sandboxed script step inside workflows, wave 6. Custom UI components stay in TR1. |
| Q3 | What can the AI do? | Draft workflows and scripts (admin publishes), and run approved multi-step plans with the person's permissions; always-confirm steps never autonomous. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Full multi-step no-code Workflow Studio (wave 2, extends P19):** triggers (event, field change, date / relative date, schedule, form, inbound email, manual, signed webhook in); steps (branch, wait with timeout, loop with max items, approval, task, notify, create / update company and custom fields only, start request, generate document, approved connection, bulk); P19 expressions; error handling; gallery; test run; impact preview; versions; second approver; run log; undo of reversible steps; per-run and per-tenant limits (D18); loop protection; kill switch. P19 automations become one-step workflows. YX-WFS-01–12, 19, 20. | 28 Sep 2026 |
| Q2 | **Sandboxed script step (wave 6):** JS / TS with the P11 SDK sandbox-safe subset; isolated, no file system, network only to approved connections, limits, logged I/O; service identity never broader than the publishing admin; vault secrets; static checks; versioned and reviewed; second approver for pay / people data; AI can draft; usage beyond fair use is an add-on. Amends P18 §1 (custom code); component SDK stays TR1. YX-WFS-13–15. | 28 Sep 2026 |
| Q3 | **AI assistant (wave 5, extends P10 YX-AI-13/14):** build mode drafts, explains and previews, never publishes; do mode runs a person-approved plan through normal APIs with the person's permissions, with progress, summary and undo; money, filing, others' approvals, candidate rejection, dismissal and pay changes always need per-step confirmation; AI credits beyond fair use; plans and actions audited (`agent_plans`, `agent_actions`); employment decisions follow P10 EU AI Act classification (human decides). YX-WFS-16–18, P10 YX-AI-15. | 28 Sep 2026 |
