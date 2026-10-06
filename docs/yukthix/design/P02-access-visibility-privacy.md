# P02 · Roles, Data Visibility & Privacy

> **Status:** ✅ Decided, 24 Sep 2026. All 8 questions answered (§11). **Extended 26 Sep 2026** (gap-register user decision): DPDP / GDPR programme tooling (B12, §6.1), §11 row B12. **Corrected 28 Sep 2026** (validation pass 3, C3): DPDP Rules 2025 dated milestones and readiness plan (§6.2), YX-SEC-32 breach clocks, YX-SEC-34–35. **Validation pass 3 Must (J15), founder decision 28 Sep 2026:** DSAR and consent per person across all roles (YX-SEC-30 amended, YX-SEC-36); §11 J15. **Validation pass 3 Should (G9 + S16), founder decision 28 Sep 2026:** residency per region and legal entity, multi-region tenants, tenant region move (YX-SEC-19 amended, YX-SEC-37 / 38; [P21](P21-global-readiness.md)); §11 G9.
> **Covers:** spec §2.1.3 (RBAC & data visibility), §2.1.16 (privacy & data governance), gap summary "privacy & security by design", UI brief principles 2 and 6.
> **Builds on:** [P01](P01-tenancy-and-organisation.md). Tenant isolation (RLS) is solved there; this doc decides **who inside a tenant sees and does what**.

---

## 1. Purpose & scope

Three questions, answered for every screen, API, report, export and AI answer:
1. **What can this person do?** (actions: permissions)
2. **On whose records?** (record scope: self, team, department, location, entity, all)
3. **Which fields?** (field sensitivity: salary, PAN, Aadhaar, bank, health, POSH…)

Plus the privacy obligations around personal data (India DPDP Act 2023 first; GDPR-style later), and support access by YukthiX staff.

**Out of scope:** approval routing (P03), audit log mechanics (P08). This doc says *what* must be audited.

---

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | Keep / change |
|---|---|---|
| Permission catalogue | ~63 permission keys (seeded), checked by `PermissionsGuard` via `@Permissions(...)` / any-of decorators | **Keep the mechanism**; add HR keys (§4.1) |
| Roles | **Hard-coded** in `rbac/roles.ts`: `org_admin`, `hiring_manager`, `recruiter`, `panel`, `auditor` (+ platform `super_admin`); one `role` string per user | **Change:** data-driven roles, several per user, each with a scope (§4.2) |
| Per-org overrides | `OrgRolePermission` (edit the 3 editable roles' grants) | Superseded by tenant roles (migrate) |
| Custom profiles | `PermissionProfile` (custom grant set + field permissions), one per user | Becomes "custom role" (migrate) |
| Field permissions | `field-permissions.ts`: fixed map for candidate (email, phone) and job (salary, headcount…); levels `readonly` / `hidden`; roles fixed | **Generalise:** field registry per entity + sensitivity classes + `masked` level (§4.4) |
| Record visibility | `record-visibility.ts`: only `pipeline_entries`, only `recruiter`, via RLS session flag | **Generalise:** scope engine for all HR entities (§4.3) |
| Impersonation / super admin | Exists, with audit | Change: tenant-approved, time-boxed support sessions (Q8, YX-SEC-20) |
| Privacy | Candidate consent, erase/export, retention sweeps (candidate-centric) | Extend to employees (§6) |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **Permission** | An action on a resource, e.g. `leave.request.approve`, `payroll.run.approve`, `employee.salary.view` |
| **Role** | A named bundle of permissions + field-access levels. Tenants get **templates** and can make **custom roles** |
| **Role grant** | *User* + *role* + **scope** (+ optional validity dates). A user can hold several grants: e.g. HR Admin for Workfox Pvt Ltd **and** Payroll for the LLP |
| **Scope** | Which records a grant covers: `self`, `direct_reports`, `all_reports` (subtree), `dotted_line` (dotted-line reports: view + feedback only, no salary; M01 Q5), `department_subtree`, `location`, `legal_entity`, `tenant` |
| **Implicit grants** | Given automatically, not assigned: every employee gets **Employee @ self**; anyone with reports gets **Manager @ their team**; a department head gets **Dept head @ department subtree** |
| **Sensitivity class** | Label on every personal field: Public · Internal · Personal · Confidential · Special |
| **Field access level** | Per role × class (or field): `hidden` · `masked` · `read` · `edit` · `edit_with_approval` |
| **External login** | A non-employee sign-in from the §4.7 catalogue (candidate, vendor, contractor, coordinator, invigilator, guest learner …): named-record scope, not a seat, expiring, audited (YX-SEC-21 / 33) |
| **Restricted area** | Data only named members may see, whatever their role: POSH cases, disciplinary cases, grievance cases, whistleblower reports, medical records (access by case membership only; M08 Q3/Q8) |

---

## 4. Design

### 4.1 Permission catalogue
- Keys follow `domain.object.action`, and the catalogue is registered in code per module (like settings in P01). Examples:
  - `employee.profile.view`, `employee.profile.edit`, `employee.salary.view`
  - `leave.request.create`, `leave.request.approve`, `leave.balance.adjust`
  - `attendance.muster.lock`, `attendance.roster.manage` (shifts and rosters: team scope for managers / supervisors, entity scope for HR)
  - `request.raise_on_behalf` (raise a request for another employee, P03 proxy requester: team scope for managers, entity / tenant scope for HR; the company chooses which roles hold it and for which request types, YX-SEC-27)
  - `payroll.run.prepare`, `payroll.run.approve`, `payroll.bank_file.generate`
  - `statutory.return.file`, `expense.claim.pay`
  - `analytics.dashboard.build`, `report.export`
  - `privacy.notice.publish` (publish the company's own employee / candidate privacy-notice versions, APX-G; default holders HR Admin + System Admin, YX-SEC-28)
  - `privacy.request.manage`, `privacy.register.manage`, `privacy.breach.manage` (DSARs, DPIA / RoPA / retention schedule, breach records; default holder: Privacy officer template, §6.1, B12)
  - `survey.candidate.view` (confidential-linked candidate experience survey answers, M09 YX-ENG-11; default holders Recruiting Ops + HR Admin; never interviewers / evaluators)
- **Every API and every report column** declares its permission (and field class). CI fails if an HR endpoint has no permission (like YX-ORG-14).

### 4.2 Roles (templates shipped; tenant may clone and edit, Q5)

| Template | Typical scope | Can | Cannot (by default) |
|---|---|---|---|
| **Employee** (implicit) | self | Own profile, requests, payslips, tax, documents; team calendar (names + leave only) | Others' data |
| **Manager** (implicit) | team (Q2) | Approve team requests, see team attendance/leave/goals, give feedback; exact current pay of their team **only inside a comp review they own** (M06 Q6) | Team salary outside own comp reviews (Q3), identifiers |
| **Department head** (implicit) | department subtree | Manager rights for the whole department; department dashboards | Salary unless granted |
| **HR Admin** | entity or tenant | All HR records, lifecycle, letters, settings for HR | Payroll run approval (separation, Q6) |
| **HR Executive** | location / entity | Day-to-day HR ops: attendance, leave, onboarding tasks, documents | Salary, identifiers (masked) |
| **Payroll Admin** | entity | Compensation, payroll runs, statutory, tax | HR settings |
| **Payroll Approver** | entity | Approve runs and bank files (checker) | Prepare runs |
| **Finance** | entity | Pay claims / F&F / payroll payouts; cost reports | Individual salary detail beyond payouts (configurable) |
| **Recruiter / Hiring manager / Panel** | as today | ATS (exam app) | HR records |
| **IT / Admin ops** | entity | Onboarding / exit tasks assigned to them, assets | HR records |
| **Auditor** | scope as granted (default tenant-wide), **time-boxed** | Read-only registers, audit log within the granted scope (P08 Q8) | Any write |
| **POSH Committee member** | restricted area | POSH cases they are appointed to | — (nobody else can see these) |
| **Ethics officer** | restricted area | Whistleblower reports and grievance cases assigned to them (M08 Q8) | Other restricted areas without membership |
| **Helpdesk agent** | queue(s) | Tickets in their queues (M08 Q1/Q2) | Restricted cases; fields beyond the ticket's category |
| **Queue lead** | queue(s) | Helpdesk agent rights + assign, reassign, SLA and queue settings (M08 Q1/Q2) | Restricted cases |
| **L&D admin** | entity or tenant | Courses, sessions, enrolments, trainers, learning reports (M07) | Salary, identifiers |
| **Travel desk** | entity | Book and manage trips, travel bookings and itineraries (M05 Q3) | Salary, identifiers |
| **Privacy officer** (DPO / grievance officer, B12) | entity or tenant | Data-subject requests, DPIA / RoPA / retention schedule, breach records (§6.1) | Restricted areas without membership; salary unless granted |
| **Moderator** | tenant or audience | Hide / restore posts and comments, handle reports in Engage (M09 Q2) | HR records |
| **Tenant / System Admin** | tenant | Users, roles, settings, integrations, billing | HR & payroll **data** unless also granted (Q1) |

**Stand-alone permission:** `engage.announcement.publish` (**Announcer**, M09 YX-ENG-02) can be added to any role (e.g. HR Admin, department heads) to post announcements to audiences within the grant's scope.

**Comp-review exception to Q3:** a manager sees the exact current pay of their team only inside a compensation review they own (M06 Q6), for the review's participants and duration, with every view audited (YX-SEC-09). Outside it, managers see no team salary unless the company grants "team salary view".

### 4.3 Record scope engine
- One **visibility service** turns the user's grants into a filter per entity type (e.g. "employees whose current assignment is in legal entity X, or who are in the user's reporting subtree").
- It is applied in **every** list, record, report, export, analytics query (P09) and AI answer. Repositories are called through it, never directly.
- Reporting subtrees and department subtrees are pre-computed (closure table refreshed on assignment changes, P01/P06). "My team" is then a join, not a recursive query per request.
- **Time-aware:** a manager sees a former team member's records only for the period they managed them (e.g. approving old leave), not after the transfer.
- **Cycle-scoped read-back (exception to the above):** when a person's manager changes during an open review cycle (M06), the **new** manager gets read access to that person's current-cycle review, goals, check-ins and PIP for the **whole cycle period**, including the part before the change. The previous manager's private 1-on-1 notes are **not** included (YX-SEC-24).
- **Test takers:** an employee taking a training quiz, skills test or certification (M06 / M07 via T03) sees only their own attempts and results; evaluators and L&D see attempts within their normal P02 scope; test results are **Confidential** (YX-SEC-26).
- **Defence in depth:** tenant isolation stays in Postgres RLS (P01). Restricted areas (POSH, disciplinary, grievance, whistleblower, medical) **also** get RLS policies keyed on membership, so even a coding mistake in a module can't leak them.

### 4.4 Field sensitivity

| Class | Examples | Default for roles without HR/Payroll grants |
|---|---|---|
| **Public** (inside the tenant) | Name, photo, designation, department, location, work email/phone, manager | read |
| **Internal** | Joining date, employment type, grade, birthday (day-month) | read for HR; team for managers |
| **Personal** | Personal phone/email, address, family, emergency contacts, DOB with year | hidden |
| **Confidential** | Salary, CTC, bank account, tax, PAN, UAN, ESIC no., payslips | hidden · **masked** where needed (bank ••••6789) |
| **Special** | Aadhaar, health/disability, religion/caste (if collected), POSH & disciplinary | hidden; Aadhaar **always masked** to the last 4 except for explicit roles |

- A field registry per entity lists each field's class, and roles grant per class with per-field overrides. This generalises the exam app's `GOVERNED_FIELDS`.
- **Enforced server-side** on read (redact) and write (reject). The UI only reflects it.
- **Exports, reports, analytics and AI** apply the same rules. Small-group suppression (fewer than the tenant threshold: default 5, configurable 3–10) applies to breakdowns of Confidential/Special data for viewers **without individual-level access** to that data (P09 Q2, YX-SEC-14). For **anonymous surveys** the minimum applies to every viewer, HR included (M09).
- **Viewing** Confidential or Special fields of someone else is **audited** (P08), e.g. "Vikram viewed Priya's bank account".

### 4.5 Self-service changes
- Employees edit Personal fields directly.
- Changes to **bank account, PAN, name, address used for statutory purposes** go through approval (P03), with an old → new diff and proof upload. The payout uses the new bank account only after approval **and** a cooling period / notification to the old contact (fraud guard).
- **Returned-salary exception:** when a salary payment to the current account is returned by the bank (M03 payment failure), an **expedited correction** is allowed: the new account is approved by a checker (not the person who entered it) and passes a successful **penny-drop verification**; together these waive the cooling period so the re-payment can go out. The employee and the old contact are still notified (YX-SEC-25).

### 4.6 Separation of duties
- The same person cannot **prepare and approve** a payroll run, bank file or statutory payment (Q6).
- A user cannot approve their **own** requests (leave, expense, attendance) or their own role grant.
- **Raise on behalf:** a holder of `request.raise_on_behalf` may file a request for an employee in scope (P03 proxy requester). The self-approval bar applies to **both** the subject and the proxy: a proxy can never approve a request they raised (YX-SEC-27).
- Role grants are themselves approvable changes when the granted role includes Confidential access.

### 4.7 External / limited logins
People outside the workforce get a narrow login, not a user seat:
- **Identity:** OTP to their email or mobile (no password);
- **Grant:** scoped to named records only (their own file, their sessions, their case), never a scope like team or entity;
- **Not a billed seat;**
- **Expiry:** ends automatically (per template, or when the linked record closes);
- **Audited:** every sign-in and view logged (P08).

**Partner users (P16)** are the one template whose scope is not named records: they reach client tenants only through a client-approved partner grant (P16 YX-PTR-02 / 03), with mandatory MFA instead of OTP-only sign-in (rows below).

| Template | Sees | Source |
|---|---|---|
| **Pre-boarding candidate** | Own pre-boarding checklist, documents, e-sign until the joining date | M01 |
| **Alumni** | Own letters, payslips, tax documents after exit | P05 Q6 |
| **External trainer** | Own sessions: attendee names, attendance, results, feedback summary | M07 Q6 |
| **POSH IC external member** | POSH cases they are appointed to (restricted area) | M08 Q4 |
| **Audit committee chair** | Whistleblower outcomes routed to the committee | M08 Q8 |
| **Client contact** | Candidates / submissions shared with that client | M10 Q8 |
| **Consultant** | Own invoices (upload monthly invoices, see approval status), own payments and payment advices, own Form 16A; own PAN / GSTIN / bank details read-only (changes via HR, §4.5); expires when the consultant is deactivated in the register. The login is not a seat; a consultant paid in the month is billed as an HRMS unit (P14 YX-BILL-10) | M03 A8-Q1 |
| **Candidate** | Own applications, status, documents, interview self-booking, offers; own test invitations, readiness check, attempts, result + appeal, privacy centre (T9 candidate portal / candidate app) | M10, T03, T05 |
| **Nominee / legal heir** | Documents HR releases for claims after a death in service (alumni pattern) | P05 YX-DOC-19 |
| **External case party** | The one case they complain in (contractor, vendor staff, client staff, visitor) | M08 E16, YX-CASE-09 |
| **Staffing vendor contact** | Own vendor's job shares (shared fields only), submissions and statuses, placements, timesheets, invoices, payments, scorecard; never other vendors, bill rates or margins | M10 C7, YX-ATS-25…30 |
| **Vendor worker** | Own timesheets for their vendor-supplied placement (no HRMS employment) | M10 YX-ATS-28 |
| **Contractor (vendor)** | Own establishments, contract-worker lists, monthly packs and proofs, discrepancies, bills and payment status | M03 A8, M13 YX-CLRA-11 |
| **Contract worker** | **No login.** Checks in at the M02 kiosk / biometric device with a gate pass; appears only in the contractor's and HR's views | M13 YX-CLRA-04 |
| **LTI guest learner** | Only the launched course / assessment, own attempt and result; created on first launch when no employee matches | M07 YX-LRN-14, T05 YX-EVAL-22 |
| **College coordinator** | Own institution's registrants for drives shared with them; results only at the level the company set (none / aggregate / per candidate); never answers, evidence, integrity or accommodations | T03 B7, YX-DLV-15 |
| **Invigilator** | Assigned centre session only: roll call, admit-card QR, photo-ID check, seat plan, incident log | T03 C5, YX-DLV-19 |
| **Visitor** | **No login.** A one-time invite link (pre-registration, ID, photo, QR pass) | M02 B11, APX-D T9-14 |
| **Partner user** (CA firm, payroll bureau, reseller / referral partner, implementation partner) | Only the client tenants the user is assigned to, and inside each only the modules, entities and actions of the client's partner grant, with field classes as for tenant roles; **never Special data** (medical, POSH, biometrics). Reseller sales / onboarding users see no HR data. Every action is audited in the client tenant and shown in "who accessed my data". In a **partner-owned tenant** (P16 Q2) the partner is the account owner and tenant admin, while the **named client contact** always keeps audit-log view, full export and the right to transfer ownership | P16 YX-PTR-02…06, 13 |

#### External logins catalogue (sign-in, sessions, data classes)

Every non-employee who can sign in uses one of the templates above; the portal is the **T9 external shell** (APX-D §2.14 / §4). Scope is always the named records in the "Sees" column (§4.3 engine, YX-SEC-21); P12 governs sign-in and sessions; IP allow-lists do not apply unless the company includes external portals (YX-IAM-09). Rule YX-SEC-33.

| Login | Sign-in | MFA / session (P12) | Data classes reachable | Portal | Ends |
|---|---|---|---|---|---|
| Candidate | Magic link or OTP (email / mobile); candidate app: OTP | AAL1; test attempts add per-attempt consent + ID check (T04); desk session limits | Own Personal / Confidential (application, results); own Special (ID photo, evidence) read via privacy centre only | T9 candidate portal, PRC-21…28; M04 candidate app | Candidate retention end (M10 Q6, T05 Q7) |
| Pre-boarding candidate | OTP | AAL1 + step-up OTP for bank / PAN entry | Own Personal / Confidential / Special (Aadhaar, bank) | T9-01 | Joining date (becomes an employee) |
| Alumni / Nominee | OTP to own email / mobile | AAL1, read-only | Own Confidential (payslips, tax, letters) | T9-02 | YX-DOC-16 period / claims closed |
| External trainer | OTP | AAL1 | Internal (attendee names), Confidential (own sessions' results) | T9-03 | Trainer deactivated |
| POSH IC external member / Audit-committee chair | OTP + passkey or TOTP | **AAL2 mandatory** (IC members are a P12 Q1 sensitive role); desk session limits | Special (restricted-area cases) | T9-04 / T9-05 | Appointment ends |
| External case party | OTP | AAL1 | Own case only (Special) | T9-04 | Case closed + appeal window |
| Client contact | OTP | AAL1; company may require AAL2 | Confidential (shared candidates / submissions, own timesheets, invoices, tickets) | T9-06 | Client deactivated |
| Consultant | OTP | AAL1 + step-up for invoice submit; bank / PAN read-only | Own Special (PAN, GSTIN, bank) | Consultant portal (T9) | Deactivated in register |
| Staffing vendor contact | OTP | AAL1 + step-up for invoice confirm; company may require AAL2 | Confidential (own submissions' candidates); own vendor's Special (PAN, GSTIN, bank) | T9-12 | Vendor agreement expiry / deactivation |
| Vendor worker | OTP | AAL1; timesheet entry only | Own Internal (timesheets) | T9-12 (worker view) | Placement end |
| Contractor (vendor) | OTP | AAL1 + step-up for bill upload | Personal / Confidential of own contract workers (wages, UAN / IP no.); own Special (PAN, bank) | T9-13 | Contractor deactivated |
| LTI guest learner | LMS-signed LTI 1.3 ID token (no OTP; YX-EVAL-22) | Session = the launch; no standing login | Own attempt / result (Confidential) | Launched runner | End of launch; record per T05 Q7 |
| College coordinator | OTP | AAL1; desk session limits | Personal of own registrants; Confidential results only if the company enables | T9-11 | Drive closed / institution coordinator removed |
| Invigilator | OTP on the invigilator app + device-bound passkey | **AAL2**; session limited to the assigned centre session window (+ sync); works offline on the enrolled device | Special (photo-ID match, check-in photos) for that session's candidates | Invigilator app (M04) | Session end |
| Partner user (CA firm / payroll bureau / reseller / implementation partner) | Partner portal sign-in with the partner's own identity (partner SSO or passkeys where required); no OTP-only login | **MFA mandatory** for every partner user; **SSO or passkeys** for partners with 10+ users; desk session limits (YX-PTR-06); step-up for payroll / bank-file release, filing and DSC signing (YX-PTR-05) | Internal, Personal and Confidential of **assigned clients only**, within the grant's modules and entities (YX-PTR-03); **never Special**; reseller sales role: no HR data | Partner portal (own shell, APX-D §2.20); client switcher into the client tenant with a "Working in: Client X as Partner Y" banner; every action in the client's audit log (YX-PTR-04) | Link ended or grant withdrawn by the client, user unassigned, ownership moved to the client, or partner suspended (YX-PTR-01 / 02 / 12) |

All rows: not a billed seat (billing units per P14 where a rule says so, e.g. consultants, contract workers), every sign-in and view audited (P08), notice / terms acceptance per YX-SEC-28. YukthiX proctors are **not** in this catalogue: they use the proctor-service grant below (YX-SEC-23). Partner users are not billed seats either (each client pays its own D18 units); in a partner-owned tenant the partner holds the owner / System Admin role, and the named client contact's audit view, export and transfer rights can't be removed by it (P16 YX-PTR-02 / 13).


**Proctor-service grant (YukthiX proctors, T04 add-on).** YukthiX-employed proctors are **not** a YX-SEC-20 support session and not a tenant login template above. The tenant opts in **once** when buying the proctoring add-on; after that, each YukthiX proctor gets a **per-slot grant**:
- only to the proctoring sessions assigned to them (T04 `proctors.pool` = YukthiX pool, `proctor_assignments`);
- only for the slot's time window (auto-expires at slot end);
- only live view and proctoring evidence (Special data) for the candidates in those sessions; nothing else in the tenant;
- MFA and signed confidentiality terms are mandatory before any grant is issued;
- every view is audited (P08) and listed for the tenant's admins.
Rule YX-SEC-23.

### 4.8 API keys & service grants
- An API key (integration, P10) is a **service grant**: a scope (entity, tenant, …) plus the permissions and **allowed field classes** it may read or write, e.g. the Accounting API gets salary-level (Confidential) per-employee lines only because its key allows that class (P10 Q7).
- Keys are created by System Admin, shown once, expirable and revocable; each call is audited under the key's name.

---

## 5. Rules

| ID | Rule |
|---|---|
| YX-SEC-01 | Every API endpoint, report column, export and AI tool declares a permission; unannotated HR endpoints fail CI. |
| YX-SEC-02 | Roles are data (tenant-editable templates + custom roles); no role names are hard-coded in business logic, which checks permissions only. |
| YX-SEC-03 | A user may hold several role grants; each grant has a scope and optional validity dates; effective rights = union of grants. |
| YX-SEC-04 | Employee, Manager and Department-head grants are **implicit** and recomputed when assignments change (P01, P06). |
| YX-SEC-05 | Every read passes through the visibility service; list counts, totals and charts only include visible records. |
| YX-SEC-06 | Manager visibility of a person is limited to the periods in which they managed that person. |
| YX-SEC-07 | Every personal field has a sensitivity class; access is enforced server-side on read and write, including exports, analytics and AI. |
| YX-SEC-08 | Aadhaar is stored encrypted and displayed masked (last 4) except to roles explicitly granted `employee.aadhaar.view`; each unmasked view is audited. |
| YX-SEC-09 | Viewing another person's Confidential/Special fields is audited (who, whose, which field, when). |
| YX-SEC-10 | Restricted areas (POSH, disciplinary, grievance cases, whistleblower reports, medical; M08 Q3/Q8) are visible only to appointed members (case membership); enforced in Postgres RLS as well as the app. Tenant admins and YukthiX support cannot see them without membership. |
| YX-SEC-11 | No self-approval: requesters, role grantees and payroll preparers cannot approve their own items. |
| YX-SEC-12 | Payroll run, bank file and statutory payment need maker ≠ checker whenever ≥ 2 users can approve for that legal entity; with a single eligible user, self-approval requires a reason and notifies the System Admin / owner (Q6). |
| YX-SEC-13 | Changes to bank account, PAN and statutory identity fields require approval and trigger a notification to the employee's previous contact. |
| YX-SEC-14 | Breakdowns of Confidential/Special data with fewer than the tenant threshold (default 5, range 3–10) people are suppressed in analytics and exports for viewers who lack individual-level access to that data (refined by P09 Q2). |
| YX-SEC-15 | Auditor and support-access grants are time-boxed and expire automatically. |
| YX-SEC-17 | The colleague directory shows only fields the tenant enabled, chosen from Public, Internal and allow-listed Personal fields; Confidential and Special fields are never selectable. Employee-level hide choices override the tenant setting for Personal fields. |
| YX-SEC-18 | Creating or editing a role runs a risk check: (a) Confidential/Special access over more than a threshold of people, (b) conflicting duties (prepare + approve), (c) approval coverage gaps, (d) removing the last holder of a critical permission. Warnings are shown with the effective-access preview; saving past them requires confirmation, is audited and notifies other admins. Hard limits (restricted areas, self-approval, Aadhaar audit, directory limits) are not grantable. |
| YX-SEC-19 | A tenant's region is fixed at sign-up (India default for Indian tenants). Database, files, backups and search indexes for that tenant live in that region; cross-region transfer only to listed sub-processors, with the minimum data needed. **Amended 28 Sep 2026 (G9 + S16):** the region is held per legal entity (`data_region`, P01 YX-ORG-30); the sign-up region is the tenant's home region; see YX-SEC-37 / 38. |
| YX-SEC-20 | YukthiX staff access to tenant data requires a tenant-admin approval per session: fixed window (default 24 h, max 72 h), declared reason, scope excluding restricted areas, Confidential/Special masked by default; the session is audited action by action and listed for tenant admins; access ends automatically. |
| YX-SEC-21 | External / limited logins (§4.7) use OTP identity, are scoped to named records only, are not billed seats, expire automatically and are audited; they can never hold scope-wide or Confidential-class grants beyond their own records or appointed cases. Exception: partner users (P16) are catalogued in §4.7 but scoped by a client-approved partner grant under YX-PTR-03, never named records only; Special data stays excluded. |
| YX-SEC-22 | API keys are service grants with a scope and an explicit list of allowed field classes; a field class not listed is redacted in API responses; keys are expirable, revocable and audited per call. |
| YX-SEC-23 | YukthiX proctors reach tenant data only through a **proctor-service grant**: tenant opt-in once with the proctoring add-on; per slot, auto-expiring at slot end, limited to assigned sessions and to live view + evidence for those candidates; MFA and confidentiality terms mandatory; every view audited and visible to tenant admins. It is never a YX-SEC-20 support session and gives no other tenant access. |
| YX-SEC-24 | Exception to YX-SEC-06: when a manager changes during an open review cycle, the new manager may read the current cycle's review, goals, check-ins and PIP of their new reports for the whole cycle period; the previous manager's private 1-on-1 notes stay excluded. |
| YX-SEC-25 | Exception to the §4.5 cooling period: after a returned salary payment, a bank-account correction approved by a checker (≠ maker) **and** verified by a successful penny drop takes effect without the cooling period; the employee and the old contact are still notified. |
| YX-SEC-26 | Employees taking training / skills tests or certifications see only their own attempts and results; evaluators and L&D see attempts within their P02 scope; test results are Confidential. |
| YX-SEC-27 | `request.raise_on_behalf` lets HR (entity / tenant scope) or managers (team scope) raise requests for an employee in scope; the company chooses which roles hold it and for which request types. The self-approval bar (YX-SEC-11) covers both the subject and the proxy who raised the request. |
| YX-SEC-28 | Legal documents (terms, DPA, privacy notices, consent texts; catalogue in [APX-G](APX-G-legal-artefacts.md)) are versioned per locale in `legal_documents`, and every acceptance, acknowledgement, consent, withdrawal and opt-out is an append-only row in `legal_acceptances` (who, which version, when, where, IP / device, OTP channel), written to the audit log (P08); tables in APX-G §3. A **material change** to terms or a privacy notice requires re-acceptance (re-acknowledgement for notices) **before continued use**; non-material changes show a banner. Tenant versions of notice templates are published by holders of `privacy.notice.publish`. Anonymous reporters are exempt: no acceptance row, no identity, IP or device (YX-CASE-11). |
| YX-SEC-33 | **External logins catalogue (gap-register tidy-up).** Every non-employee sign-in uses a catalogued §4.7 template with a defined sign-in method, P12 assurance level, session limit, reachable data classes, portal and end trigger; a new external persona needs a catalogue row before release. Templates reaching other people's Special data (POSH IC external member, audit-committee chair, invigilator) require **AAL2**; all others are AAL1 with step-up for financial or identity changes. LTI guest learners have no standing login (session = launch). Contract workers and visitors have no login. |
| YX-SEC-16 | Employee-facing reports (e.g. PF/ESI/tax registers) are never visible to employees beyond their own rows. This avoids Frappe's "employees can see everyone's tax/PF" defect (gap summary). |
| YX-SEC-29 | **Privacy officer (B12):** every tenant names a privacy officer (DPO / grievance officer) with a public contact before the first privacy notice is published; the contact is printed in every published notice and the G-23 page; a notice cannot be published without it. |
| YX-SEC-30 | **Data-subject requests (B12):** every access, correction, erasure, nomination, consent-withdrawal and grievance request is a `privacy_requests` row with verified identity, an SLA due date no later than the legal maximum for the jurisdiction (company may set shorter), reminders and escalation before breach, and an audited closure; erasure deletes or anonymises everything not under a legal retention or hold and states in the response what was kept and why. **Amended 28 Sep 2026 (J15):** a request is raised against the **person** (P01 `persons`), not one record, and runs across **every role table** linked to that person (YX-SEC-36). |
| YX-SEC-36 | **Per-person DSAR and consent (J15).** Identity is verified once for the person; an **access** export covers every linked role (candidate, test-taker, campus registrant, employee, alumnus, nominee, consultant, contract worker, vendor worker, external login) and lists the roles found; a **correction** of shared data (name, contact) is applied to every role and logged per role, while role-owned data is corrected in that role's record; **erasure** is decided **role by role** against that role's legal retention (e.g. payroll and statutory records for employment, CLRA / OSH registers for contract work, the candidate retention setting for applications), so a role still under retention or hold is kept and the others are erased or anonymised, and erasing one role never deletes or alters data another role's legal record needs (e.g. the name and PAN on a kept payslip or Form 16); the `persons` row stays, reduced to the keys the kept roles need, until the last role is erased. **Consent** is recorded per person and purpose: a withdrawal applies to every role using that purpose (e.g. withdrawing face-match consent deletes the face template and stops face matching everywhere). |
| YX-SEC-37 | **Residency per region (G9 + S16).** Each legal entity's people data (records, files, backups, search indexes, analytics snapshots, AI processing) stays in its data region; UAE and KSA entities are hosted in-country including DR. In a multi-region tenant only the directory card (Public and Internal fields) may be copied to the home region; Personal, Confidential and Special data are read from the entity's region at request time by users whose grants cover that entity, and Special data never leaves its region. Cross-region reports return in-region aggregates with YX-SEC-14 suppression. Every cross-region flow is listed in the record of processing (YX-SEC-31) with its legal transfer mechanism (e.g. EU SCCs, UAE / KSA PDPL routes); AI calls use an in-region endpoint or the feature is off for that entity. |
| YX-SEC-38 | **Region move privacy (G9 + S16).** A tenant or entity region move (P21 YX-GLB-11) needs a System Admin request with a recorded legal basis and YukthiX approval; the tenant's DPA transfer annex and sub-processor notice are updated before copying; employee privacy notices are updated (and employees told where the notice or law requires) before cut-over; access during the move is limited to the migration service; source data is deleted after verification and the deletion certificate is given to the tenant; legal holds move with the data and are never dropped; a move out of an in-country region is refused unless a lawful transfer route is recorded. Every step is audited. |
| YX-SEC-31 | **Registers & retention (B12):** the DPIA register, record of processing and master retention schedule cover every enabled module and data class; enabling a feature with a starter DPIA prompts for it; retention values stay within the legal minimum and the allowed range, and the tenant-visible schedule and public G-13 page are regenerated on every change. |
| YX-SEC-32 | **Breaches (B12; C3):** a company breach record starts the notification clocks with tasks and reminders: under the **DPDP Rules 2025**, intimation to the Data Protection Board and to each affected Data Principal **without delay**, then a **detailed report to the Board within 72 hours** of becoming aware; under **GDPR**, 72 h to the supervisory authority (and individuals where required) where applicable; a YukthiX incident in the P12 register affecting the tenant automatically creates a linked tenant breach record. Consent withdrawals received from any source, including a future DPDP consent manager, stop the linked processing the same way. |
| YX-SEC-34 | **DPDP Rules 2025 readiness (C3).** The Rules (notified 13–14 Nov 2025) phase in: Data Protection Board provisions immediately; consent-manager registration from **Nov 2026** (12 months); the main obligations (notice, consent, security safeguards, breach intimation, retention / erasure, rights, children's data, significant data fiduciary duties) from **13 May 2027** (18 months). Every one of these is live in YukthiX **before 13 May 2027**, and the consent-manager adapter (§6.1) is ready **by Nov 2026**. The milestones are dated rule data (P07), so each duty shows the date it applies from. Significant-data-fiduciary duties (yearly DPIA, audit) apply **only if** YukthiX or a tenant is notified as an SDF (§6.2). |
| YX-SEC-35 | **DPDP notice, logs and erasure (C3).** Privacy notices are **itemised per purpose in plain language** in the Rules' schedule format (data items, purpose, how to withdraw consent, how to exercise rights, how to complain to the Board); processing logs and traffic data are kept **at least 1 year** under the security-safeguards rule, longer where another law requires (P12 YX-SECOPS-07); personal data is erased when its purpose is served unless a legal retention or hold applies, and in inactive-user cases where the Rules' retention schedule applies a **48-hour prior intimation** is sent before erasure (*verify applicability to employers*). Children's data needs verifiable parental consent (M10 YX-ATS-19, T05 YX-EVAL-13). |

---

## 6. Privacy (India DPDP Act 2023 first)

| Obligation | YukthiX design |
|---|---|
| Notice & purpose | Employee privacy notice per tenant (template provided), shown at onboarding / first login; purposes tagged on data categories; notice **itemised per purpose in plain language** in the DPDP Rules 2025 schedule format (YX-SEC-35) |
| Consent where needed | Optional data (e.g. selfie check-in, health, diversity attributes) collected only with recorded consent; withdrawal supported |
| Access & correction | Employee "My data" page: download own data (JSON/PDF), request correction (P03 flow) |
| Erasure & retention | Retention rules per category (e.g. payroll/statutory: legal minimum years; candidates: configurable); scheduled deletion/anonymisation after exit + retention, i.e. when the purpose is served; legal hold overrides; 48-hour prior intimation for inactive-user cases where the Rules' retention schedule applies (*verify applicability to employers*; YX-SEC-35) |
| Breach readiness | Access logs + sensitive-view audit (P08) support investigation and notification; processing logs and traffic data kept **at least 1 year** (P12 YX-SECOPS-07); Board + Data Principal intimation without delay, detailed Board report within 72 h (YX-SEC-32) |
| Data residency | Tenant home region fixed at sign-up (India default for Indian tenants; Q7); data region per legal entity, UAE / KSA in-country, multi-region tenants and region moves per YX-SEC-37 / 38 (G9 + S16, [P21](P21-global-readiness.md)) |
| Processors | Sub-processor list (hosting, email, WhatsApp, AI providers) published; AI calls send the minimum data; Special class is **never** sent to external AI. Face check-in and AI-interview face match run in-region, in-house (P10 Q2/Q3, M10 Q4) |
| Legal & trust artefacts | Terms, DPA, sub-processor list, privacy notices (incl. the employee notice template above), consent texts, opt-ins and other public artefacts are catalogued in [APX-G](APX-G-legal-artefacts.md), each requiring legal drafting & review; acceptances are versioned and audited (YX-SEC-28) |
| Programme tooling (B12) | DPO / grievance officer, data-subject requests with SLA, DPIA register, record of processing, breach workflow, master retention schedule, consent-manager readiness: §6.1 |
| DPDP Rules 2025 (C3) | Dated milestones, readiness plan, children's data and conditional SDF duties: §6.2 (YX-SEC-34 / 35) |

### 6.1 Privacy programme tooling (B12)
Two roles are served: the **company** as data fiduciary / controller for its employees and candidates, and **YukthiX** as processor (and controller for its own sign-ups, G-05). The tooling below is the company's; YukthiX runs the same tools for itself in the platform console (P14). All included in the price (D18); policies (SLAs shorter than the law, retention within legal ranges, who handles what) are company-configured from labelled starter templates (D17).

| Tool | Design |
|---|---|
| **DPO / grievance officer** | Role template **Privacy officer (DPO / grievance officer)**, scope tenant or entity, holding `privacy.request.manage`, `privacy.register.manage`, `privacy.breach.manage`. The company records the officer's **public contact** (name or designation, email, phone, address), which is printed in every published privacy notice (G-06, G-07, G-09) and on the company's contact page generated from G-23. YukthiX's own DPO contact appears on the platform G-23 page. |
| **Data-subject request tracker (DSAR)** | `privacy_requests` covering **access** (the "My data" export), **correction**, **erasure**, **nomination** (DPDP right to nominate someone to exercise rights on death or incapacity), **consent withdrawal** and **grievance**. Channels: Me › My data, candidate privacy centre (PRC-28), the no-login public form on the G-23 page (OTP to verify identity), or logged by the officer (email / letter). Each request gets identity verification, an **SLA clock** (legal maximum per jurisdiction from dated rule data, e.g. DPDP rules for grievances, GDPR one month extendable; the company may set shorter), assignment, reminders and escalation (P04), a response letter (P05) and closure reason. **Erasure** runs the retention engine: data under a legal retention (payroll, statutory registers, tax, open cases, legal hold) is kept and the response lists what was kept and why; the rest is deleted / anonymised with a certificate. Metrics: `privacy.dsar_sla_met_pct` (APX-C). |
| **DPIA register** | `dpia_records`: activity, risk assessment, mitigations, residual risk, approver, review date. **Starter DPIAs** shipped by YukthiX for its higher-risk features (face check-in, proctoring recording / biometrics, AI interview, AI-assistance signals, location tracking, Engage monitoring) which the company adopts and edits; enabling such a feature prompts for a DPIA (warn, not block). |
| **Record of processing (RoPA)** | `processing_activities` auto-seeded from the purpose tags on data categories (§6), enabled modules and features, sub-processors (G-04) and retention periods; the officer edits lawful basis / purpose / recipients; exportable (XLSX / PDF) for regulators and auditors. |
| **Breach workflow** | `privacy_breaches` for the company's own breaches (e.g. a payslip emailed to the wrong person): detection, assessment, affected people and data classes, clock, notification tasks (DPDP Rules 2025: intimation to the Data Protection Board and affected Data Principals without delay, then a detailed report to the Board within 72 hours; supervisory authority within 72 h and individuals under GDPR where applicable; YX-SEC-32), evidence, closure. A **YukthiX-caused** incident in the P12 incident register (`security_incidents`, YX-SECOPS-07) that affects the tenant creates a linked `privacy_breaches` record in that tenant with the facts YukthiX shares, so the company can meet its own duties. |
| **Master retention schedule** | `retention_policies` (T05) is extended to **every data class** (employee record, payroll / statutory, tax, attendance, leave, expenses, documents, cases, performance, learning, Engage, candidates, proctoring media, biometrics, audit, backups): legal minimum (from P07 / law), company value within the allowed range, trigger (exit, case close, test date…), action (delete / anonymise), legal-hold override. **Tenant-visible** in Settings › Privacy; the public retention page (APX-G G-13) is generated from it. |
| **Consent-manager readiness** | Consents are stored as consent artefacts (`legal_acceptances`, YX-SEC-28) with purpose, data items and version, so they can be exchanged with a **DPDP Consent Manager** registered with the Data Protection Board: an adapter (P10 framework) will accept consent grants / withdrawals from a consent manager and report status back; the adapter is **ready by Nov 2026**, when consent-manager registration opens under the DPDP Rules 2025 (YX-SEC-34); withdrawal from any source stops processing the same way. |

### 6.2 DPDP Rules 2025: dated milestones & readiness plan (C3)
The Digital Personal Data Protection Rules, 2025 were notified on 13–14 Nov 2025 and replace "as the rules require" everywhere in this design. They phase in:

| Milestone | Date | What applies | YukthiX readiness |
|---|---|---|---|
| Board provisions | Immediate (13–14 Nov 2025) | Data Protection Board constituted and operating | Breach workflow (§6.1) and G-23 already name the Board; no product gap |
| Consent managers | **Nov 2026** (12 months) | Consent managers register with the Board | Consent-manager adapter (§6.1, P10 framework) **ready by Nov 2026**; connection in Settings › Privacy |
| Main obligations | **13 May 2027** (18 months) | Notice, consent, security safeguards, breach intimation, retention / erasure, rights, children's data, significant data fiduciary duties | **Everything below live before 13 May 2027** (built with public launch; pilot tenants get it by upgrade); tenant readiness checklist in Settings › Privacy |

| Duty (from 13 May 2027) | Design | Link |
|---|---|---|
| Notice | Itemised **per purpose in plain language** in the Rules' schedule format: data items, purpose, how to withdraw consent, how to exercise rights, how to complain to the Board; generated from the purpose tags (§6) into the G-06 / G-07 templates | YX-SEC-35, APX-G |
| Consent | Purpose-specific consent artefacts, withdrawal as easy as giving, consent-manager exchange | YX-SEC-28, §6.1 |
| Security safeguards | Encryption, access control, monitoring; processing logs and traffic data kept **at least 1 year** (longer if other law requires) | P12 YX-SECOPS-01 / 07 |
| Breach | Intimation to the Board and each affected Data Principal **without delay**; **detailed report to the Board within 72 hours** | YX-SEC-32 |
| Retention / erasure | Erase when the purpose is served (legal retention and hold excepted); **48-hour prior intimation** before erasure in inactive-user cases where the Rules' retention schedule applies — ***verify applicability to employers*** | YX-SEC-31 / 35 |
| Rights | Access, correction, erasure, nomination, grievance, with SLA clocks from rule data | YX-SEC-30 |
| Children's data | Verifiable parental / guardian consent; no AI interview, profiling or AI scoring of minors | M10 YX-ATS-19, T05 YX-EVAL-13 |
| Significant data fiduciary | Yearly DPIA and independent audit — **conditional**: only if YukthiX or a tenant is notified as an SDF; the DPIA register (§6.1) already supports it | YX-SEC-34 |

---

## 7. UI
- **Roles & access** (Settings): role templates list → role workspace (permissions grouped by module, field classes as a matrix with hidden/masked/read/edit), "clone role", "who has this role".
- **User access tab:** grants with scope and dates; "effective access preview": *"Vikram can approve leave for 4 people, view salary for 0 people"*.
- **Masked values** with a reveal action, only where allowed, and audited ("Show bank account").
- **Restricted areas** carry a lock badge and member list.
- **Employee "My data"** page under Me (mobile tab).
- **Settings › Privacy › Programme** (B12): officer & public contact; DSAR queue with SLA countdown; DPIA register; record of processing (export); breach records; master retention schedule (per data class, legal minimum shown); consent-manager connection (when available); DPDP Rules 2025 readiness checklist (§6.2).

---

## 8. Migration (exam app → platform)
1. Create role templates; map existing users: `org_admin` → System Admin + HR Admin (tenant scope, to preserve today's power), `hiring_manager`/`recruiter`/`panel`/`auditor` → same-named templates; `PermissionProfile` → custom roles; `OrgRolePermission` overrides → edited copies of templates.
2. Replace the `User.role` string with role grants, keeping a compatibility read until all guards use grants.
3. Move `GOVERNED_FIELDS` into the field registry; recruiter record visibility becomes a scope rule on pipeline entries.

---

## 9. Acceptance tests (samples)
- An employee cannot fetch another employee's payslip, bank, PAN or tax by API id guessing (YX-SEC-05/07).
- A manager transferred out of a team loses access to that team's new records the next day (YX-SEC-06).
- PF/ESI registers: an employee-role user sees only their own row; an HR Executive sees masked identifiers (YX-SEC-16).
- A tenant admin without POSH membership gets zero rows from POSH tables even via reports (YX-SEC-10).
- A payroll preparer's approve button is disabled with a reason (YX-SEC-12).
- A department head without individual salary access opens a salary breakdown with a group of 3 → "suppressed (fewer than 5)" at the default threshold; an HR Admin with salary access sees the figures (YX-SEC-14).
- Anonymous survey results for a team of 3 are suppressed for every viewer, HR included (M09).
- J15: a former contract worker, later an employee and now an applicant, asks for access: one export lists all three roles; her erasure request removes the application and test attempts, keeps payslips, Form 16 and the CLRA register rows with their retention end dates, and leaves the name and PAN on those kept records unchanged (YX-SEC-30 / 36).
- B12: an ex-employee requests erasure; the response deletes Engage posts and personal contacts but keeps payslips and statutory registers, listing each kept item with its legal retention end date; the request closes before its SLA date (YX-SEC-30).
- B12: publishing an employee privacy notice with no privacy-officer contact is refused (YX-SEC-29); a P12 incident marked as affecting the tenant creates a linked breach record with the DPDP notification tasks (YX-SEC-32).
- C3: a breach recorded at 10:00 creates a Board intimation task and affected-person notices due immediately and a detailed Board report due within 72 hours; a published employee notice lists each purpose with its data items, withdrawal and complaint route (YX-SEC-32 / 35).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should the tenant **System Admin** automatically see salary and other Confidential/Special data? | **No, keep it separate.** The admin *can* grant themselves an HR/Payroll role, but that grant is audited and notified to other admins. Small companies simply give the owner both. |
| Q2 | Manager scope default: direct reports only, or the whole reporting subtree? | **View: whole subtree; approve: direct reports** (configurable per tenant). |
| Q3 | Can managers see their team's salary? | **No by default**; a tenant can grant "team salary view" per role (e.g. department heads). |
| Q4 | Employee directory: what can colleagues see about each other? | Public class only (name, photo, designation, department, location, work contact, manager) + birthday day-month with per-employee opt-out. |
| Q5 | Allow tenants to create **custom roles** at launch? | **Yes**: clone a template and edit; templates themselves stay restorable. |
| Q6 | Enforce maker ≠ checker for payroll even in tiny companies with one payroll person? | **Enforce when ≥ 2 eligible users exist**; with only one, allow self-approval with a mandatory reason + notification to the System Admin (logged). |
| Q7 | Data residency: India-hosted by default for Indian tenants; other regions later? | **Yes**: region chosen at sign-up, India default; data doesn't leave the region except to disclosed processors. |
| Q8 | YukthiX support access to a tenant's data | **Only with tenant approval per session** (time-boxed, e.g. 24 h), scoped (no restricted areas), fully audited, visible to the tenant's admins. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **System Admin is separate from HR/Payroll data.** No Confidential/Special access unless an HR/Payroll role is also granted; self-granting is allowed but audited and notified to the other admins. | 24 Sep 2026 |
| Q2 | **Manager: view = whole reporting subtree; approve = direct reports.** Both are tenant settings; escalation to higher managers is handled by P03 (SLA / delegation). | 24 Sep 2026 |
| Q3 | **Managers do not see team salary by default.** The tenant can grant "team salary view" (`employee.salary.view` @ team scope) to chosen roles (e.g. department heads); the increment-planning UI can show ranges without exact figures. | 24 Sep 2026 |
| Q4 | **Company configures the directory field by field.** Default preset: name, photo, designation, department, location, work email/phone, manager, birthday (day-month). Allowed fields are limited to Public, Internal and selected Personal fields; Confidential/Special can never appear. Employees may hide their own Personal-class values (e.g. birthday, personal phone). Rule YX-SEC-17. | 24 Sep 2026 |
| Q5 | **Custom roles fully from scratch** (as well as cloning templates). Before saving, a **risk check** shows warnings (broad Confidential access, maker+checker in one role, uncovered approvals) with the effective-access preview; saving past warnings is audited and notified to other admins. **Hard limits** (YX-SEC-10/11/08/17) cannot be granted away by any role. Rule YX-SEC-18. | 24 Sep 2026 |
| Q6 | **Maker ≠ checker enforced when ≥ 2 users hold the approve permission for that entity.** With only one, self-approval is allowed with a mandatory reason, audited and notified to the System Admin / owner. Applies to payroll runs, bank files and statutory payments (YX-SEC-12). | 24 Sep 2026 |
| Q7 | **Data region chosen at sign-up; India is the default for Indian tenants.** All tenant data incl. files and backups stays in-region; transfers only to disclosed processors (email, WhatsApp, AI) with data minimised. Infra (D4) must support per-region deployment. Rule YX-SEC-19. | 24 Sep 2026 |
| Q8 | **YukthiX support access only with the tenant's approval each time**: requested in-app, approved by a tenant admin for a fixed window (default 24 h), scoped (never restricted areas; Confidential/Special masked unless the tenant allows), every action audited and visible to tenant admins. Replaces today's standing super-admin switch-in for tenant data (platform billing/ops views excepted). Rule YX-SEC-20. | 24 Sep 2026 |
| R1 | Consistency review: comp-review exception to Q3 as decided in M06 Q6 (managers see exact current team pay only inside a comp review they own; §4.2). | 25 Sep 2026 |
| D12 | **YukthiX proctors via a proctor-service grant.** The company opts in once when buying the add-on; each YukthiX proctor gets a per-slot grant only to assigned sessions, only for the slot time window, only live view + evidence for those candidates; every view audited and visible to the company; MFA + confidentiality terms mandatory. Not a YX-SEC-20 support session. Rule YX-SEC-23. | 26 Sep 2026 |
| D5 | **Raise on behalf.** Permission `request.raise_on_behalf` (team scope for managers, entity / tenant for HR); the company chooses who may raise on behalf (HR only / HR + managers) and for which request types; a proxy can never approve a request they raised. Rule YX-SEC-27 (flow in P03 YX-WF-18). | 26 Sep 2026 |
| D7 | **Consistency fix:** cycle-scoped read-back exception to YX-SEC-06 for a new manager mid-review-cycle (current cycle's review, goals, check-ins, PIP; not the old manager's private 1-on-1 notes). Rule YX-SEC-24. | 26 Sep 2026 |
| D11 | **Consistency fix:** returned-salary exception to the bank-change cooling period: checker approval + successful penny drop waives it; employee and old contact still notified. Rule YX-SEC-25. | 26 Sep 2026 |
| D2 | **Consistency fix:** test-taker scope: employees see only their own test attempts; evaluators / L&D per P02 scopes; results Confidential. Rule YX-SEC-26. Also added `attendance.roster.manage` (team for managers / supervisors, entity for HR). | 26 Sep 2026 |
| H6 | **Consistency fix:** legal & trust artefacts catalogued in [APX-G](APX-G-legal-artefacts.md) (23 artefacts, each requiring legal drafting & review); `legal_documents` / `legal_acceptances` tables (APX-G §3); material changes to terms / privacy notices need re-acceptance before continued use, acceptances versioned and audited; permission `privacy.notice.publish` for tenant notice versions. Rule YX-SEC-28. | 26 Sep 2026 |
| F-follow-ups (consistency fix) | Permission **`privacy.notice.publish`** added to the §4.1 catalogue: who may publish the company's own employee / candidate privacy-notice versions; default holders HR Admin + System Admin (as referenced by YX-SEC-28 and APX-G §3). | 26 Sep 2026 |
| B12 | **Gap-register extension (user decision 26 Sep 2026): DPDP / GDPR programme tooling.** Privacy officer (DPO / grievance officer) role template with a public contact printed in notices and G-23; DSAR tracker (access, correction, erasure, nomination, consent withdrawal, grievance) with legal-maximum SLA clocks and retention-aware erasure; DPIA register with starter DPIAs for high-risk features; auto-seeded record of processing; breach workflow linked to the P12 incident register; master retention schedule for every data class (tenant-visible, public page G-13); consent-manager readiness. Included (D18); company policies from starter templates (D17). §6.1, permissions `privacy.request.manage` / `privacy.register.manage` / `privacy.breach.manage`, YX-SEC-29–32. | 26 Sep 2026 |
| Gap-register tidy-up | **External logins catalogue.** §4.7 extended with every non-employee login now in the design: candidates, nominees, external case parties, staffing vendor contacts and vendor workers (M10 C7), contractors (M03 A8 / M13), LTI guest learners (T05 / M07 B15), college coordinators (T03 B7), invigilators (T03 C5); contract workers and visitors explicitly have no login. Per login: sign-in, P12 assurance / session, data classes, T9 portal, end trigger. AAL2 for IC external members, audit-committee chair and invigilators. Rule YX-SEC-33. Permission `survey.candidate.view` added to §4.1 for M09 YX-ENG-11. | 26 Sep 2026 |
| P16 follow-up | **Partner users in the external-login catalogue (P16).** §4.7 template and catalogue row "Partner user" (CA firm, payroll bureau, reseller, implementation partner): partner-portal sign-in, **MFA mandatory**, SSO or passkeys for partners with 10+ users (YX-PTR-06); scope = only assigned clients within the client-approved grant (YX-PTR-03), never Special data; every action audited in the client tenant (YX-PTR-04). **Partner-owned tenants** (P16 Q2) make the partner the account owner and tenant admin, while the named client contact keeps audit view, full export and the right to transfer ownership (YX-PTR-02 / 13). YX-SEC-21 notes the grant-scoped exception. No new rule IDs. | 26 Sep 2026 |
| Correction C3 (validation pass 3) | **DPDP Rules 2025 pinned** (notified 13–14 Nov 2025): Board provisions immediate; consent-manager registration from Nov 2026 (adapter ready by then); main obligations from **13 May 2027**, all live before that date (§6.2). Breach: Board and affected Data Principals told without delay, **detailed Board report within 72 hours** (YX-SEC-32 updated, GDPR kept). Processing logs and traffic data kept **at least 1 year**. Notice itemised per purpose in plain language (schedule format). Erasure when the purpose is served, 48-hour prior intimation for inactive-user cases where the retention schedule applies (verify applicability to employers). Children's data linked to M10 / T05. SDF duties conditional on notification. Rules YX-SEC-34 / 35. | 28 Sep 2026 |
| Validation pass 3 Must (J15), founder decision 28 Sep 2026 | **DSAR and consent per person across all roles (J15).** Access, correction, erasure and consent run per P01 `persons` record across every role table; erasure is decided role by role against each role's legal retention (payroll, statutory, CLRA / OSH registers, candidate retention) and never breaks another role's legal record; consent withdrawal applies to every role using the purpose. YX-SEC-30 amended, YX-SEC-36. | 28 Sep 2026 |
| Validation pass 3 Should (G9 + S16), founder decision 28 Sep 2026 | **Residency per region and region move.** Data region per legal entity; UAE / KSA in-country incl. DR; multi-region tenants copy only the directory card to the home region, read other data in-region at request time, never move Special data; transfers listed with their mechanism; region move with legal basis, DPA / notice updates before cut-over, deletion certificate, legal holds kept, no move out of an in-country region without a lawful route. YX-SEC-19 amended; YX-SEC-37 / 38; [P21](P21-global-readiness.md) YX-GLB-10 / 11. | 28 Sep 2026 |
