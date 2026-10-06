# P08 · Period Locks & Audit

> **Status:** ✅ Decided, 25 Sep 2026. All 8 questions answered (§11).
> **Covers:** spec §2.1.15 (audit log, enterprise security review), gap summary "period locks" (attendance lock after payroll, payroll freeze, leave/attendance edits after slip), Phase 2 P0 items (payroll lock, attendance lock), P02 audit duties (sensitive views, support sessions), P06 corrections, U12 (activity noise).
> **Builds on:** P01–P07.

---

## Part A · Period locks

### A1. Purpose
Once a period's numbers are used (paid, filed, reported), the data behind them must not change silently. Changes after that go through **corrections** that produce **arrears** (P06), leaving the processed period intact.

### A2. What is lockable

| Period | Scope | Locks what |
|---|---|---|
| **Attendance period** | legal entity (or location) × month | Attendance days, punches, regularisations, overtime, shift assignments for those dates |
| **Leave (payroll-relevant)** | follows the attendance period | Leave applications / cancellations affecting pay (LWP, half days) for those dates |
| **Payroll period** | legal entity × pay group × pay period (month, or week / fortnight per M03 Q3) | Inputs (compensation, one-time pay, arrears lines), payslips, bank file |
| **Statutory filing period** | legal entity × statute × period (month / quarter / half-year) | Figures reported in filed challans/returns (PF ECR, ESI, PT, LWF, 24Q) |
| **Expense month** (optional) | legal entity × month | Claims already paid through a payroll or payout batch |

### A3. Lock stages (Q1)

| Stage | When | Effect |
|---|---|---|
| **Open** | Default | Normal edits (still through approvals) |
| **Inputs frozen** (soft) | The attendance cut-off day (Q2); if none is set, when payroll processing starts | Edits for these dates need a **late request** (Q4); approved late items go to the next period |
| **Locked** | Payroll approved (P02 maker ≠ checker) | No direct edits. Employee late requests (Q4) are still allowed with the extra HR approval step, up to the tenant's maximum lateness; after that, HR corrections only. Either way the change is a P06 correction whose effect (arrears / LOP reversal) lands in the next payroll |
| **Filed** | Statutory return / challan filed for that period | As locked, plus the statutory module handles revisions (revised return), never the source period |

Inputs **freeze** at the cut-off / when payroll processing starts; **payroll approval** moves the period to **locked**. M03 uses the same two transitions.

**Device and night-shift edge cases (E19, YX-LOCK-09):**
- **Late biometric batch:** when a device uploads punches for frozen or locked dates (offline device, sync failure), HR runs one audited **device backfill** correction for the batch (device, date range, affected employees, reason) instead of each employee raising late requests; effects follow YX-LOCK-03 (next payroll).
- **Night shift over the boundary:** a punch belonging to a shift that **started before** the freeze / lock point attaches to that shift's date without a late request, as long as it arrives within the shift's normal punch window.

### A4. Reopening (Q3)
- **Reopen** is an exceptional, high-risk request type (P03): mandatory reason, Payroll Admin + System Admin / owner approval, never self-approved.
- It is **allowed only if nothing downstream has left the system**: bank file not released, payslips not published, returns not filed. Otherwise it is refused, with a pointer to the correction path (arrears).
- A reopened payroll produces **new payslip versions**; if old versions were visible to employees, they are marked "revised" (never deleted).
- Every reopen and re-lock is audited and notified to Payroll Admins and the owner.

### A4b. Attendance exceptions before payroll (Q4)
- **Depends on attendance mode** (M02; scoped setting `attendance.mode` per entity / location / department / employment type, P01 §4.6):
  - **Punch:** missing-punch exceptions as below. The company setting `attendance.missing_punch_effect` decides whether open exceptions **block** payroll approval (default) or are **warnings** only in the pre-flight.
  - **Assumed present:** present unless approved leave; HR enters LOP manually (M03); **no** missing-punch exceptions.
  - **Timesheet:** approved hours drive pay; the exception is a **missing approved timesheet** for the period, following the same block / warn setting.
- **Expected status comes from employment status** (M02 §B3): no daily exceptions, nudges or late penalties for days on which the employee is suspended, on long leave (maternity / sabbatical / LWP), in an absconding process, or still pre-boarding.
- **Detect daily:** working days with a missing check-in/out, no attendance, or no covering approved leave / WFH / on-duty (holidays and weekly offs excluded).
- **Nudge:**
  - employee the next day ("No check-out on 10 Sep: fix or apply leave", one-tap);
  - manager weekly (team gaps);
  - HR daily digest + pre-cut-off alert with **Remind all**.
- **Resolve before payroll:** the payroll pre-flight lists open exceptions as **blocking** (or as warnings where the group's setting says warn). Each closes when the employee's request is approved, or when **HR resolves** it (absent / LOP, deduct from a leave balance, present with approval) with a reason, one by one or in bulk. This way no single unresponsive employee can hold up everyone's pay.

### A5. How modules check locks
- A single **lock service**: `isEditable(entity, legal_entity, date)` → open / frozen / locked / filed + reason.
- Every write that touches dated operational data (attendance, leave, payroll inputs, expenses) calls it inside the transaction.
- Past-dated changes to dated facts (P06) consult it to choose between a normal change and a correction.
- The UI shows lock state on periods and records ("🔒 September payroll locked on 30 Sep by Vikram").

---

## Part B · Audit

### B1. What exists today (exam app, `origin/main`)
- `AuditLog`: org, actor (with **snapshot** of email / name / role), action, entity type/id, metadata JSON, time; indexes by org+time, actor, entity type, action.
- The **append-only trigger** blocks DELETE. **UPDATE is still allowed** (needed by the FK set-null cascade).
- Admin UI `v2/(org-admin)/audit-log`, CSV export.
- **Keep** the model and snapshot; **strengthen** tamper resistance on Postgres (B4).

### B2. What is audited

| Category | Examples | Detail stored |
|---|---|---|
| **Data changes** | Create / update / delete of HR records, dated-fact changes, corrections | Field-level **before → after** diff; Special-class values stored encrypted or masked in the diff; Confidential/Special values are masked for readers who lack that field permission (B5) |
| **Sensitive views** (P02 YX-SEC-09) | Viewing someone else's salary, bank, PAN, Aadhaar (unmasked), health | Viewer, subject, field class/field, time. **Deduplicated** per viewer × subject × class per 30 min |
| **Exports & downloads** | Report exports, payslip/document downloads of others, bulk downloads | What, filters, row count, file hash |
| **Access & security** | Login, logout, MFA, failed logins, password reset, session revoke, role grants, support sessions (P02 Q8) | IP, device, result |
| **Configuration** | Roles, approval policies (P03), settings, legal options (P07), templates, integrations | Before → after |
| **Approvals** | Every P03 action (who, on behalf of whom, channel) | Linked to the request |
| **Locks** | Freeze, lock, reopen, re-lock | Reason, approvals |
| **Platform** (YukthiX side) | Statutory rule publishes (P07), super-admin actions | Separate platform audit, visible to tenants where it touched them |

### B3. Two views of history
- **Activity timeline on records** (for users): human-readable business events only ("Priya approved leave", "Salary revised from 1 Oct"). **No system noise** such as "changed from 0 to null" (U12).
- **Audit log** (for admins / auditors): complete, filterable, exportable.

### B4. Tamper resistance on Postgres (Q5)
- The app's database role has **INSERT and SELECT only** on audit tables. A trigger rejects UPDATE and DELETE.
- Actor details are **snapshots**, not foreign keys, so no cascade ever needs to update audit rows (this removes today's UPDATE exception).
- **Hash chain:** each row stores `hash = sha256(prev_hash + row content)` per tenant. A daily job verifies the chain and records a daily anchor hash (optionally stored outside the database). Any tampering becomes detectable.
- Monthly **partitions**; old partitions move to cheaper storage (Q7), still verifiable.

### B5. Who can read audit (Q8)
Access follows P02 scopes:
- System Admin and Auditor see the tenant's full audit log.
- HR / Payroll Admins see audit for records in their scope.
- Restricted areas (POSH, disciplinary, grievance cases, whistleblower reports, medical; M08 Q3/Q8) are auditable only by their members (and P02 hard limits).
- **Diffs are masked by field permission:** Confidential and Special before → after values are shown only to readers who hold that field permission; others see "changed" without values. System Admin has no Confidential/Special access unless an HR/Payroll role is also granted (P02 Q1).
- Employees see **"Who accessed my data"** for their own Confidential/Special fields: on by default, tenant can switch the employee view off; logging continues (Q6).

---

## 5. Data model

| Table | Key columns |
|---|---|
| `period_locks` | `organization_id`, `legal_entity_id`, `location_id?`, `period_type` (attendance / payroll / statutory / expense), `statute?`, `period_start`, `period_end`, `stage` (open / frozen / locked / filed), `changed_by`, `changed_at`, `reason`, `approval_request_id` |
| `late_requests` (view over P03 requests) | requests touching frozen/locked dates, with `target_period` for the effect |
| `audit_events` (evolves `AuditLog`) | `organization_id`, `category`, `action`, `entity_type`, `entity_id`, `actor_user_id`, `actor_snapshot jsonb`, `on_behalf_of`, `ip`, `device`, `diff jsonb` (sensitive values encrypted/masked), `metadata jsonb`, `created_at`, `prev_hash`, `hash` (partitioned by month) |
| `audit_anchors` | `organization_id`, `day`, `last_hash`, `row_count`, `verified_at` |

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-LOCK-01 | Every write to attendance, leave (pay-affecting), payroll inputs and paid expenses checks the lock service in the same transaction. |
| YX-LOCK-02 | Frozen and locked dates accept employee changes only as late requests with an extra HR approval step, within the tenant's maximum lateness (e.g. 60 days); after that, only HR corrections. The effect lands in the next payroll (arrears / LOP reversal). Device batches and night-shift punches follow YX-LOCK-09. |
| YX-LOCK-03 | Locked and filed periods are never modified; late requests and corrections on them become P06 corrections with arrears/recoveries in the next payroll. |
| YX-LOCK-04 | Payroll locks on approval (maker ≠ checker per P02); attendance and pay-affecting leave for the period lock with it. |
| YX-LOCK-05 | Reopen is a high-risk request (reason + Payroll Admin + System Admin/owner approval) and is refused once the bank file is released, payslips are published or a return is filed. |
| YX-LOCK-06 | A reopened payroll creates new payslip versions; previous versions are kept and marked revised. |
| YX-LOCK-07 | Attendance exceptions are raised only for employees in **Punch** mode (working day without complete punches or attendance and not covered by approved leave / WFH / on-duty / holiday / weekly off) and, in **Timesheet** mode, for a missing approved timesheet; **Assumed-present** employees raise none (HR enters LOP manually). Expected status comes from employment status: no exceptions, nudges or late penalties for days an employee is suspended, on long leave (maternity / sabbatical / LWP), in an absconding process or pre-boarding. Exceptions are detected daily and notified: employee next day, manager weekly, HR digest and pre-cut-off alert. |
| YX-LOCK-08 | Where the group's `attendance.missing_punch_effect` is **block** (default), payroll cannot be approved while the period has open attendance exceptions; where it is **warn**, they are listed as warnings in the pre-flight and payroll may be approved. Blocking exceptions must be closed by the employee's approved request or by an HR resolution with reason (absent/LOP, leave deducted, present with approval), which is audited. |
| YX-LOCK-09 | Exceptions to YX-LOCK-02: (a) punches for frozen/locked dates arriving in a late biometric batch are applied by an HR bulk **device backfill** correction (one audited action per batch, with reason; effects in the next payroll per YX-LOCK-03), not by per-employee late requests; (b) a punch for a shift that started before the freeze / lock point attaches to that shift without a late request when it falls within the shift's normal punch window. |
| YX-AUD-01 | All categories in B2 are audited; audit writes are in the same transaction as the change they describe. |
| YX-AUD-02 | Audit rows are append-only at the database level (INSERT/SELECT grants only, UPDATE/DELETE blocked); actor details are snapshots. |
| YX-AUD-03 | A per-tenant hash chain links audit rows; a daily job verifies it and stores an anchor; verification failures alert YukthiX security and the tenant's System Admins. |
| YX-AUD-04 | Sensitive-view events are deduplicated per viewer × subject × class within 30 minutes. |
| YX-AUD-05 | Record activity timelines show business events only; system field churn is visible only in the audit log (U12). |
| YX-AUD-06 | Audit read access follows P02 scopes; restricted-area audit (POSH, disciplinary, grievance, whistleblower, medical) is visible only to that area's members; Confidential/Special values in diffs are masked for readers without that field permission. |
| YX-AUD-07 | Audit exports are themselves audited. |
| YX-AUD-08 | Audit is retained 8 years (last 13 months online, older partitions archived); the tenant can extend but never shorten below 8 years; the retention job writes a deletion record when it deletes; a legal hold on a case (M08 Q7) blocks archive/deletion of that case's audit entries. |
| YX-AUD-09 | Every irreversible action confirmed through the irreversible-action dialog (APX-D §6.4: publish payslips, release bank file, approve run / lock period, reopen, bulk changes and transfers, bulk approve, invalidate attempt and the other listed actions) stores in its audit event (`metadata`) the **typed confirmation text** (or, for bulk approve, the confirmed count), the **impact-preview totals** shown (people / records affected, amounts) and the reason where one was required, so the log shows exactly what the actor saw and confirmed. |

---

## 7. UI
- **Periods** screen (Payroll / Attendance): month cards with stage chips, lock/unlock actions, reopen request, what's pending before lock (pre-flight).
- **Lock badges** on records and calendars; late-request banner on apply sheets for frozen dates ("This date's attendance is closed. Your request will affect October pay").
- **Audit log** (admin): filters (person, subject, category, action, date), diff viewer, integrity status ("Chain verified today 02:00").
- **Me › Who accessed my data** (Q6).

---

## 8. Migration (exam app)
1. `AuditLog` → `audit_events` on Postgres (D10): copy rows (test environment only), compute the initial hash chain, and drop FKs to user/org in favour of snapshots + ids.
2. Replace the SQL Server trigger with Postgres grants + trigger; add partitions.
3. Existing audit writers keep calling `AuditService`, extended with category/diff.

---

## 9. Acceptance tests (samples)
- Editing a September attendance record after September payroll is locked fails with "locked"; submitting it as a regularisation creates a late request whose effect appears in October (YX-LOCK-02/03).
- A reopen request after the bank file was released is refused with the correction path (YX-LOCK-05).
- The app DB role cannot UPDATE or DELETE an audit row; a manual DB tamper breaks the chain and is reported next morning (YX-AUD-02/03).
- Vikram opening Priya's salary 5 times in 10 minutes creates one sensitive-view event (YX-AUD-04).
- Priya sees "Vikram (HR Manager) viewed your bank details on 3 Oct" (Q6).
- An HR Admin scoped to the LLP cannot read audit events of Pvt Ltd employees (YX-AUD-06).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Lock stages | **Four stages:** open → inputs frozen → locked (payroll approved) → filed (return filed). |
| Q2 | When does attendance freeze? | **At a cut-off day per legal entity** (default: when payroll processing starts; tenant can set e.g. the 26th); hard lock with payroll approval. |
| Q3 | Reopening a locked payroll | Only **before** bank release / payslip publication / filing, with Payroll Admin + System Admin (owner) approval; afterwards corrections only. |
| Q4 | Employee requests for frozen/locked dates (late leave, regularisation) | **Allowed as late requests** with an extra approval step (HR); effect goes to the next payroll (arrears / LOP reversal). Tenant can set a maximum lateness (e.g. 60 days). |
| Q5 | Audit tamper protection | **Append-only grants + trigger + per-tenant hash chain with daily verification.** |
| Q6 | Can employees see who viewed their sensitive data? | **Yes**: "Who accessed my data" shows person and role for views of their Confidential/Special fields (payroll batch processing excluded). Supports DPDP transparency and deters snooping. |
| Q7 | Audit retention | **8 years** (aligned to the longest Indian record-keeping needs for payroll/tax), with the last 13 months online and older partitions archived (searchable on request); tenant can extend. |
| Q8 | Who can read the tenant's audit log? | **System Admin + Auditor: all; HR/Payroll Admins: within their scope; restricted areas: members only.** |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Four lock stages: open → inputs frozen → locked (payroll approved) → filed (statutory return/challan filed).** | 25 Sep 2026 |
| Q2 | **Attendance freezes at a cut-off day configured per legal entity** (e.g. the 26th); if none is set, it freezes when payroll processing starts. Hard lock with payroll approval. Reminders to managers/employees before the cut-off (P04). | 25 Sep 2026 |
| Q3 | **Reopen only before anything leaves the system** (bank file not released, payslips not published, returns not filed), with mandatory reason + Payroll Admin and System Admin/owner approval (never self-approved). After that, corrections only (arrears/recoveries next period). YX-LOCK-05. | 25 Sep 2026 |
| Q4 | **(a) Late requests** for frozen/locked dates are allowed with an **extra HR approval step**; the effect goes to the next payroll (arrears / LOP reversal); tenant sets a maximum lateness (e.g. 60 days), after which only HR corrections. **(b) Attendance exceptions are resolved before payroll:** a daily job detects working days with missing punches / no attendance / no covering leave-WFH-on-duty; employees get next-day nudges with one-tap fix, managers a weekly team summary, HR a digest and a pre-cut-off alert with "Remind all". **Payroll approval is blocked while exceptions for the period are open**; each exception closes by employee action (regularise / leave) or **HR resolution** (absent/LOP, deduct leave from balance, present with approval) with a reason, individually or in bulk. Rules YX-LOCK-07, YX-LOCK-08. | 25 Sep 2026 |
| Q5 | **Audit tamper protection: append-only at DB level (INSERT/SELECT grants, UPDATE/DELETE trigger) + per-tenant hash chain verified daily**, alerting YukthiX security and tenant System Admins on failure. External anchoring (write-once storage) can be added later without redesign. | 25 Sep 2026 |
| Q6 | **"Who accessed my data" is on by default; the tenant can switch it off.** Shows person and role for views of the employee's Confidential/Special data (automatic processing excluded). Switching off hides only the employee view; access logging (P02 YX-SEC-09) continues and full history appears if re-enabled. | 25 Sep 2026 |
| Q7 | **Audit retention 8 years:** last 13 months online and searchable; older monthly partitions archived to cheaper storage, searchable and chain-verifiable on request; tenant can extend (never shorten below 8 years). After retention, partitions are deleted by the retention job with a deletion record kept. | 25 Sep 2026 |
| Q8 | **Audit read access follows P02 roles and scope:** System Admin + Auditor see the full tenant log; HR/Payroll Admins see entries for records in their scope; restricted-area (POSH, disciplinary, medical) entries only for appointed members; employees only "Who accessed my data" (Q6). YX-AUD-06. | 25 Sep 2026 |
| R1 | Consistency review: restricted areas extended to grievance and whistleblower cases (M08) | 25 Sep 2026 |
| D1 | **Attendance mode per group.** Each company sets per group (entity / location / department / employment type) a mode: **Punch**, **Assumed present** (present unless approved leave; HR enters LOP manually; no exceptions) or **Timesheet** (approved hours drive pay). Missing-punch exceptions apply only in Punch mode; there the company chooses whether they **block** payroll approval (default) or are **warnings** only. Timesheet groups: a missing approved timesheet is the exception, with the same block / warn setting. Rules YX-LOCK-07, YX-LOCK-08 amended. | 26 Sep 2026 |
| D10 | **Consistency fix:** expected attendance status comes from employment status; suspended, long leave (maternity / sabbatical / LWP), absconding-in-process and pre-boarding employees get no daily exceptions, nudges or late penalties. YX-LOCK-07 amended. | 26 Sep 2026 |
| E19 | **Late device batches and night shifts over the lock.** A late biometric batch after freeze is applied by an audited HR bulk "device backfill" correction instead of per-employee late requests; a night-shift punch for a shift started before the lock attaches to that shift without a late request. Rule YX-LOCK-09. | 26 Sep 2026 |
| F-follow-ups (consistency fix) | **Irreversible actions record what was confirmed (APX-D §8 F-15).** Publish payslips, release bank file, lock period, bulk changes, bulk approve, invalidate attempt and the other APX-D §6.4 actions store the typed confirmation text (count for bulk approve) and the impact-preview totals in the audit event. Rule YX-AUD-09. | 26 Sep 2026 |
