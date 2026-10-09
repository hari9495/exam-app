# M01 · Onboarding and exit · Build design (roadmap step 6, lifecycle)

> **Status:** 📝 Draft for founder review, 9 Oct 2026. Docs only, no code yet.
> **Scope:** the build design for the lifecycle parts of [M01](M01-core-hr-and-lifecycle.md) (§3.4 probation, §3.5 onboarding, §3.6 assets, §3.7 offboarding) and the parts of [P05](P05-letters-documents-esign.md) they need (files, documents, letters, e-sign). It turns them into tables, permissions, APIs, jobs, screens, tests and small pull requests.
> **Order:** five batches, **6a → 6e**. 6a–6d are the lifecycle a pilot company needs; 6e is the special cases.
> **Out of this design:** the **full and final settlement (F&F) calculation**. It is a payroll off-cycle run ([M03-BUILD-DESIGN](M03-BUILD-DESIGN.md) §9.9, batch 5g). This design only defines the **hand-off** to payroll (§11).
> **Backlog:** slices in §16 name their stories. Lifecycle stories are `US-D-037…081` (D.json, epic EP-D-03). Document stories are `US-C-028…030` and `US-C-085…088` (C.json). Others: `US-A-097`, `US-A-185/186`, `US-B-127`, `US-E-243/244/245`.
> **Clean-room:** all features are described in our own words from our own design docs and public law. No competitor text, screens or field names are copied. Frappe / ERPNext code is not read or copied.

---

## 1. How to read this doc

- **§2** lists the decisions we follow. **§3** is the scope in plain words.
- **§4** says where the code lives and what we reuse. **§5** is the data model.
- **§6** is permissions. **§7–§11** are the flows: journeys, pre-boarding, documents and letters, exit, payroll hand-off.
- **§12** is events and notifications. **§13** is the API. **§14** is screens. **§15** is security. **§16** is the build order. **§17** is tests.
- **§18** is India law in our own words. **§19** is the **decisions for the founder**.

Words used in this doc:

| Word | Meaning |
|---|---|
| **Joiner** | A person who has accepted an offer (or was added by HR) and has not yet joined. |
| **Pre-boarding** | The time between "joiner added" and the joining day. The joiner fills forms and uploads documents in a small portal. |
| **Journey** | A checklist that runs for one person: onboarding (anchored on the joining day) or offboarding (anchored on the last working day). |
| **Task** | One line of a journey, with an owner (HR, IT, Admin, Finance, manager, the person, buddy), a due date relative to the anchor day, and a kind (tick, form, document, letter, desk request, asset). |
| **Exit case** | One record per leaving: resignation, termination, end of contract, retirement, death, absconding, and later retrenchment and VRS. |
| **LWD** | Last working day. |
| **Clearance** | Sign-offs from each department before the leaver is "cleared". |
| **Alumni** | A former employee who can still sign in (OTP) to read their own letters and documents. |
| **Hand-off** | The frozen list of exit facts that payroll reads to make the F&F. |

---

## 2. Decisions this design follows

Nothing in this doc changes these. New questions are in §19.

| # | Decision (short) | Where it shows |
|---|---|---|
| M01 Q1 | Onboarding from an accepted ATS offer, from HR direct entry, and from bulk import | §8.1, LIFE-1.07, LIFE-2.09 |
| M01 Q2 | Pre-boarding checklist is configurable per entity / department / role, with a default set | §8.2, LIFE-2.02 |
| M01 Q3 | Probation 6 months by default; review 15 days before the end; confirm / extend (max 12 months) / terminate; no auto-confirm unless the company turns it on | §10.1, LIFE-3.01 (most of it is already built in step 2) |
| M01 Q5 | Dotted-line managers are not in approvals | §10.2 |
| M01 Q6 | Full resignation flow in the app: notice from policy, manager → HR acceptance, early release, buy-out, withdrawal | §10.2–10.3, LIFE-3.02/03 |
| M01 Q7 | F&F is fully calculated by payroll | §11 (hand-off only here) |
| M01 D3 | Onboarding by person type; pre-boarding exit states (postponed, did not join, reneged, withdrawn) | §8.4, LIFE-2.08/09 |
| M01 D6 | Exit deprovisioning fan-out with a status panel | §10.6, LIFE-4.02 |
| M01 D17 / YX-LC-25 | Every company lifecycle policy is a setting from a labelled starter template | §5.6 |
| M01 E-Q1, E-Q3, E-Q4, E6, E7, E16, E18, C1, J4, T19 | Death, absconding, rehire, contract end, retirement, open-case holds, campus, appointment letter, retrenchment, VRS, buddy | Batch 6e, except the appointment letter (6b) and open-case holds (6c) |
| P05 Q1 + Q3 | Templates are Word (.docx), filled and turned into PDF by LibreOffice in our own worker | §9.3, LIFE-2.04/05 |
| P05 Q2 | Employee e-sign = click-to-accept with OTP; company DSC on issued letters; Aadhaar eSign later as a paid add-on | §9.5, LIFE-2.07, 6e |
| P05 Q4 / Q5 / Q8 | Approval defaults per letter type; QR verification on; self-service certificates are instant | §9.4 |
| P05 Q6 | Alumni read their own documents for 7 years after exit | §10.7, LIFE-4.04 |
| P05 Q7 | PAN, Aadhaar, bank proof, education and experience proofs must be verified before payroll uses them | §9.2, LIFE-1.03 |
| P02 §4.7 | Pre-boarder, alumni and nominee are catalogued external logins (OTP, own records only, expire) | §8.3, §10.7 |
| P03 | Approvals go through the shared engine (`workflow/`) by registering request types | §10, §13 |
| M14 SD-2.08 | Joiner and leaver journeys can raise Service Desk requests | §7.4, §19 D1 |

---

## 3. Scope

### 3.1 Onboarding (in)

| Area | What it covers |
|---|---|
| **Sources** | HR adds a joiner by hand; HR imports many (CSV / Excel with a preview); an accepted offer from the exam-app ATS hands off (automatic or through a "Ready to onboard" queue). |
| **Person type** | New person → new record. Ex-employee → rehire on the same record (6e). Internal employee → not onboarded, it is a P06 transfer. Contract worker → a P06 change (6e). Matched on the P01 person, never on name or email alone. |
| **Pre-boarding** | Invite with OTP login. Welcome page, forms (personal, family, nominees, emergency contact, education, previous job incl. income this year), document uploads with the phone camera, bank details, tax regime, policy and letter signing, BGV consent. HR sees % complete. |
| **Tasks and checklists** | Journey templates per entity / department / role. Tasks for HR, IT, Admin, Finance, manager, the joiner and the buddy. Due dates before or after day one (negative offsets). Reminders and escalation. IT and Admin tasks can open a Service Desk request (§7.4). |
| **Documents** | Document types, uploads, versions, verification queue, expiry. |
| **Letters and e-sign** | Appointment letter (mandatory for every worker), offer / LOI, welcome letter; Word templates; issue with approval where needed; QR verify page; OTP e-sign with sealed evidence. |
| **Joining day** | "Mark joined" or the joining-day job: employee, employment, assignment, probation, login. Pre-boarding data moves into the record without re-typing. HR attests identity. |
| **Pre-boarding changes** | Postpone (all task dates move), did not join, reneged, offer withdrawn (one audited unwind; nothing is deleted). |
| **Probation** | Already built in step 2: plan, reminders, escalation, extend, confirm, optional auto-confirm. New here: the manager's review form, letters, and "terminate" opening an exit case. |
| **Assets** | A simple asset list; issue from a joining task; employee acknowledges; return at exit. |

### 3.2 Exit (in)

| Area | What it covers |
|---|---|
| **Resignation** | Employee submits (reason, wanted last day). Notice from policy gives the standard LWD. Manager → HR accept (P03). Withdraw: free before acceptance, with approval after. |
| **Notice and buy-out** | Early release, buy-out by either side, LWD change; leave during notice shows its effect when M02's notice policy exists. |
| **Other exit types** | HR starts termination (blocked during maternity leave), end of contract, retirement, death (basic), absconding (manual). Full special flows in 6e. |
| **Pre-checks and holds** | Open POSH / disciplinary case or PIP flagged to HR only; company policy may hold relieving letters (never beyond a legal deadline). |
| **Clearance** | Department sign-offs (manager handover, IT, Admin / assets, Finance, HR), each with notes and an optional recovery amount. |
| **Asset return** | Unreturned assets become clearance items and recovery inputs for payroll. |
| **Exit interview** | Form filled by the leaver, plus HR notes. Confidential answers are HR-only. |
| **Letters** | Resignation acceptance, no-dues certificate, relieving letter, experience letter. |
| **Last day** | Access ends at the end of the LWD; deprovisioning panel with one row per module; open approvals reassigned. |
| **Alumni** | Login switches to alumni (OTP to personal email / mobile), read-only own letters and documents for 7 years. |
| **Flags** | Rehire eligible + reason, regretted exit, backfill requested (HR-only facts). |

### 3.3 Out of this design

| Item | Where it goes |
|---|---|
| F&F calculation, payment, F&F letter, Form 16 / 130 | M03 batch 5g (PAY-7.04…7.06). We only hand off (§11). |
| Salary hold on absconding | M03 holds; 6e calls it when it exists. |
| Policy acknowledgement tracking | M08 (YX-POL). Pre-boarding only shows and signs the documents. |
| Exit survey analytics, attrition | P09 / M09 later; we store the answers. |
| Succession, positions, workforce planning | M01 §3.9, wave 5. |

---

## 4. Where it lives and what we reuse

**Code:** a new NestJS area `apps/api/src/lifecycle/` with modules `journeys`, `onboarding`, `preboarding` (external portal), `exits`, `assets`. The P05 pieces are shared, not lifecycle-only, so they go in `apps/api/src/documents/` with modules `files`, `doc-types`, `letters`, `esign`, `verify`. Payroll (M03 PAY-1.09) and the Service Desk documents (SD-2.07) move onto the same store later. Prisma models in the existing `schema.prisma`; each migration has forced RLS + the `tenant_isolation` policy.

**Reuse first.** We build only what does not exist.

| Need | Reuse | Status today |
|---|---|---|
| Tenant isolation | `app_current_org()`, forced RLS, `TenantPrismaService.forTenant`, CI guard `rls-raw-client-guard.spec.ts` | Built |
| People | `persons`, `person_roles`, `employees`, `employments`, `employee_assignments`, `employment_status_periods` (status `probation` / `confirmed` / `notice`), `employee_changes` (P06), hire path in `employee-history.service.ts` that already emits `employee.joined` | Built (step 2) |
| Probation | `probations`, `people/probation.ts`, `probationSweep`, extend endpoint, confirmation change, auto-confirm setting | Built (step 2) |
| Personal data | `employee_personal_details`, `employee_identifiers` (encrypted PAN / UAN / Aadhaar), `employee_bank_accounts` (cooling hours), profile requests | Built (step 2) |
| Settings with scopes | `settings` + `settings-registry.ts` (`resolveSetting`, company → entity → employment type → grade) | Built |
| Permissions | P02 keys, `ROLE_TEMPLATES`, `RequirePermissions`, `grantPeriods` / `covers` scope checks, field redaction | Built |
| Login, OTP, step-up, bot check | `auth/otp.service.ts`, `@RequireStepUp`, `assertHuman()` (Turnstile) | Built (step 1) |
| Approvals | P03 `ApprovalsEngine` (`register` request type, `submit`, `withdraw`, delegations, reassignment) | Built (3b-2) |
| Conditions and forms | P19 `rules-engine/conditions.ts` and `forms.ts` (`FormDef`) | Built (3b-2) |
| Events | `event_outbox` + `AutomationService.subscribe` | Built |
| Notifications | P04 pipeline, notification types registry, email / SMS / WhatsApp channels, quiet hours | Built (3b-1 + step 1+) |
| Jobs | BullMQ 5.x `upsertJobScheduler` (pattern in `time/time-jobs.ts`) | Built |
| Calendars | `holiday_calendars` + `holidays` (M02), `business_calendars` | Built (step 4, 3b-1) |
| Blob storage | `packages/shared/src/storage/blob-storage.service.ts` (Azure Blob today, local folder on laptops) | Built |
| Virus scan | `service-desk/scanner.ts` (ClamAV `clamd` INSTREAM; dev EICAR stand-in; fail closed) | Built; **moved** to `common/scanner.ts` in LIFE-1.02 |
| File type sniffing | `file-type` 16.5.4 | Installed |
| Signed document + evidence pattern | `service-desk/documents.service.ts` (hash, in-app signature evidence, sealed copy) | Built (SD-2.07); its logic moves into `documents/esign` |
| Joiner / leaver desk requests | `service-desk/journeys.service.ts` (listens to `employee.joined`; waits for an exit event) | Built (SD-2.08); wired to our events in LIFE-1.05 / LIFE-3.05 |
| Public verification page | exam-app certificate verification controller | Built; pattern reused for letters |
| Audit | `AuditService.recordIn(tx, …)` | Built (hash chain comes with M03 PAY-1.05) |
| Screens | `packages/yx-ui/src/screens/people` (PPL-11…31, 41), `portals/t9-workforce.tsx` (T9-01, T9-02, T9-08), `workforce/probation.tsx`, settings registry (Onboarding & probation, Exit & lifecycle policies, Assets, Letters, Documents) | Prototype built; wired here |

**New libraries** (open source, widely used, maintained). Each is checked for its licence before it is added (P05 rule).

| Library | Use | Licence | Why this one / what we rejected |
|---|---|---|---|
| `docxtemplater` (core only, no paid modules) | Fill Word templates: fields, conditions, repeating rows | MIT (verify at adoption) | The most used .docx template filler for Node. We run it with **our own tiny parser that only looks up field names** (no expression language), so an uploaded template can never run code. Rejected: `docx-templates` (runs JavaScript written inside the template, a code-injection risk with company-uploaded files); Carbone (licence is not open source for our use). |
| `pizzip` | Read / write the .docx zip for docxtemplater | MIT | Its standard companion. We add our own zip-bomb limits before it runs (§15). |
| **Gotenberg** (Docker image, called over HTTP inside our network) | Word → PDF and PDF/A, using LibreOffice inside | MIT (LibreOffice inside is MPL-2.0, separate process) | Keeps P05's LibreOffice decision but gives a maintained, health-checked service with timeouts and a queue, instead of us managing `soffice` processes. Runs with **no outbound network**. Indic fonts (Noto Sans Devanagari / Tamil / Telugu) are baked into our image. Alternative: our own `soffice --headless` worker (§19 D4). |
| `pdf-lib` | Add the QR / reference footer, the e-sign completion page, and merge pages | MIT | Pure JS, no native code, edits existing PDFs. `pdfkit` (installed) only makes new PDFs. |
| `qrcode` | QR image for the verify link | MIT | Small, standard. |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | S3-compatible storage adapter (AWS S3, MinIO on laptops, other S3-compatible stores) behind the existing blob interface | Apache-2.0 | Official SDK; spec D4 / P05 §4.1 decided S3-compatible storage. Only if §19 D9 = A. |
| `@signpdf/signpdf` | PAdES company signature (DSC) on relieving / experience letters | MIT | Already chosen in M03; added only in 6e, after M03 D4 decides where the key lives. |

Not added: an image library (phone photos are size-limited instead; add `sharp` only if storage cost shows a need), a rich-text-to-Word library (the in-app template editor is 6e; it will use `docx`, MIT, then).

---

## 5. Data model

### 5.1 Rules for every new table

- Plain names (as M01 §4 and P05 §5). Primary key `id uuid`. Every row has `organization_id`.
- **Forced RLS** with the standard `tenant_isolation` policy. The CI guard is extended so a new table without the policy fails.
- **Composite foreign keys** `(organization_id, id)` like the people tables: a row can never point at another company's row.
- `created_at`, `created_by`; rows people edit carry `version int` (optimistic locking).
- **No hard delete.** Cancelled joiners, withdrawn resignations and superseded letters stay, with a status and an audit row. Files are removed only by the retention job (P05 §4.7).
- Every write records an audit row in the same transaction. Business events go through `event_outbox` in the same transaction.
- **HR-only facts live in their own tables** (`exit_case_hr`, `exit_interview_answers`), each with a **restrictive** RLS policy that also needs the session flag `app.lifecycle_confidential = on`. The API sets that flag per transaction only when the caller holds `lifecycle.exit.confidential.view` for that person (same pattern as the pay guard in M03 §5.1). No super-admin escape. A manager's query therefore cannot read them even through a bug in the app layer.
- **Support sessions** (P02) are excluded from documents of Confidential / Special types and from the HR-only tables (existing `support_session_excluded` policy).

### 5.2 Batch 6a · Files, documents, journeys, joiners

```prisma
model File {                         // P05 files: every stored upload or generated PDF
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  region         String   @db.VarChar(16)
  storageKey     String   @map("storage_key") @db.VarChar(300)   // org/{org}/{area}/{uuid}, no names
  mime           String   @db.VarChar(100)                         // sniffed from bytes, not trusted from the client
  size           Int
  sha256         String   @db.Char(64)
  scanStatus     String   @default("pending") @map("scan_status") @db.VarChar(10) // pending|clean|infected|error
  scannedAt      DateTime? @map("scanned_at") @db.Timestamptz(3)
  uploadedBy     String?  @map("uploaded_by") @db.Uuid             // user, or null for external logins (see uploaded_via)
  uploadedVia    String   @map("uploaded_via") @db.VarChar(16)     // staff|preboarder|alumni|system
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@unique([organizationId, id])
  @@map("files")
}

model DocumentType {                 // system rows have organization_id NULL (read-only to companies)
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId       String?  @map("organization_id") @db.Uuid
  key                  String   @db.VarChar(40)                  // pan_card, aadhaar, bank_proof, degree, relieving_prev, photo, ...
  name                 String   @db.VarChar(100)
  ownerKind            String   @map("owner_kind") @db.VarChar(10) // person|company
  sensitivity          String   @db.VarChar(12)                  // P02 class: internal|personal|confidential|special
  requiresVerification Boolean  @map("requires_verification")
  allowedMime          String[] @map("allowed_mime")
  maxBytes             Int      @map("max_bytes")
  expiryTracked        Boolean  @map("expiry_tracked")
  reminderDays         Int[]    @map("reminder_days")
  retentionRule        String   @map("retention_rule") @db.VarChar(40)
  uploadBy             String[] @map("upload_by")                 // person|hr
  active               Boolean  @default(true)
  @@map("document_types")
}

model Document {                     // one item of a type for one owner, with versions
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String    @map("organization_id") @db.Uuid
  ownerType        String    @map("owner_type") @db.VarChar(10)   // person|company
  ownerId          String    @map("owner_id") @db.Uuid            // persons.id: survives pre-boarding → employee → alumni
  typeKey          String    @map("type_key") @db.VarChar(40)
  status           String    @db.VarChar(12)                      // requested|uploaded|verified|rejected|expired|superseded
  currentVersionId String?   @map("current_version_id") @db.Uuid
  expiresOn        DateTime? @map("expires_on") @db.Date
  verifiedBy       String?   @map("verified_by") @db.Uuid
  verifiedAt       DateTime? @map("verified_at") @db.Timestamptz(3)
  rejectReason     String?   @map("reject_reason") @db.VarChar(500)
  legalHold        Boolean   @default(false) @map("legal_hold")
  version          Int       @default(1)
  @@unique([organizationId, id])
  @@map("documents")
}

model DocumentVersion {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  documentId     String   @map("document_id") @db.Uuid
  fileId         String   @map("file_id") @db.Uuid
  version        Int
  note           String?  @db.VarChar(300)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@map("document_versions")
}

model JourneyTemplate {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  kind           String   @db.VarChar(12)                 // onboarding|offboarding|custom
  name           String   @db.VarChar(100)
  audience       Json?                                     // P19 condition over entity, location, department, employment type, grade
  priority       Int      @default(100)                    // most specific audience wins; one template per journey
  starterKey     String?  @map("starter_key") @db.VarChar(40) // copied from a YukthiX starter (YX-DOC-20 pattern)
  active         Boolean  @default(true)
  version        Int      @default(1)
  @@unique([organizationId, id])
  @@map("journey_templates")
}

model JourneyTemplateTask {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  templateId     String   @map("template_id") @db.Uuid
  key            String   @db.VarChar(40)                  // stable within the template, used by depends_on
  title          String   @db.VarChar(150)
  ownerType      String   @map("owner_type") @db.VarChar(12) // hr|it|admin|finance|payroll|manager|person|buddy|user|group
  ownerRef       String?  @map("owner_ref") @db.Uuid       // a user, user group or desk when owner_type needs one
  kind           String   @db.VarChar(16)                  // tick|form|document|letter|desk_request|asset_issue|asset_return|clearance
  config         Json     @default("{}")                   // form def / document type / letter type / catalogue item / clearance department
  dueOffsetDays  Int      @map("due_offset_days")          // ± from the anchor day (negative allowed, fixes U49)
  dependsOn      String[] @default([]) @map("depends_on")
  required       Boolean  @default(true)
  locked         Boolean  @default(false)                  // law tasks (appointment letter, YX-LC-26): owner and offset editable, not removable
  condition      Json?                                     // P19: e.g. only where ESI applies
  order          Int
  @@map("journey_template_tasks")
}

model Journey {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  kind           String    @db.VarChar(12)
  personId       String    @map("person_id") @db.Uuid
  subjectType    String    @map("subject_type") @db.VarChar(12) // preboarding|exit_case|employment
  subjectId      String    @map("subject_id") @db.Uuid
  templateId     String    @map("template_id") @db.Uuid
  templateVersion Int      @map("template_version")
  anchorOn       DateTime  @map("anchor_on") @db.Date             // joining day or LWD
  status         String    @db.VarChar(10)                         // active|done|cancelled
  progress       Int       @default(0)                             // % of required tasks done
  @@unique([organizationId, id])
  @@unique([organizationId, subjectType, subjectId, kind])         // one journey per subject and kind
  @@map("journeys")
}

model JourneyTask {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  journeyId      String    @map("journey_id") @db.Uuid
  templateTaskKey String   @map("template_task_key") @db.VarChar(40)
  title          String    @db.VarChar(150)
  kind           String    @db.VarChar(16)
  config         Json      @default("{}")
  assigneeUserId String?   @map("assignee_user_id") @db.Uuid
  assigneeGroupId String?  @map("assignee_group_id") @db.Uuid
  forPerson      Boolean   @default(false) @map("for_person")      // the joiner / leaver does it themselves
  dueOn          DateTime  @map("due_on") @db.Date
  status         String    @db.VarChar(10)                          // waiting|open|done|skipped|cancelled
  linkType       String?   @map("link_type") @db.VarChar(16)       // sd_ticket|letter_issue|document|asset_assignment|clearance_item
  linkId         String?   @map("link_id") @db.Uuid
  completedBy    String?   @map("completed_by") @db.Uuid
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(3)
  skipReason     String?   @map("skip_reason") @db.VarChar(300)
  remindedOn     DateTime? @map("reminded_on") @db.Date
  escalatedOn    DateTime? @map("escalated_on") @db.Date
  version        Int       @default(1)
  @@map("journey_tasks")
}

model Preboarding {                  // the joiner before day one (M01 preboarding_sessions)
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String    @map("organization_id") @db.Uuid
  personId         String    @map("person_id") @db.Uuid
  source           String    @db.VarChar(8)                 // offer|direct|import
  offerId          String?   @map("offer_id") @db.Uuid
  personType       String    @map("person_type") @db.VarChar(10) // new|rehire (rehire flows in 6e)
  joiningOn        DateTime  @map("joining_on") @db.Date
  plan             Json                                       // planned entity, location, department, designation, grade, employment type, manager, cost centre, CTC ref
  sections         Json      @default("{}")                  // per section: status + staged answers (Personal / Special data encrypted, §15)
  completion       Int       @default(0)
  status           String    @db.VarChar(12)                 // invited|in_progress|ready|joined|cancelled
  outcome          String?   @db.VarChar(16)                 // did_not_join|reneged|withdrawn
  outcomeReason    String?   @map("outcome_reason") @db.VarChar(500)
  batchId          String?   @map("batch_id") @db.Uuid       // 6e
  employmentId     String?   @map("employment_id") @db.Uuid  // set on joining
  identityAttestedBy String? @map("identity_attested_by") @db.Uuid
  version          Int       @default(1)
  @@unique([organizationId, id])
  @@map("preboardings")
}
```

Why the joiner is **not** an employee before day one: the joiner is a P01 `person` with a `preboarder` person role, plus a `preboardings` row holding the planned job. The employee, employment, assignment and probation are created **on the joining day** through the existing hire path. This keeps directories, headcount, billing and payroll clean, and makes "did not join" a simple status change (YX-LC-12's outcome: nothing counted, nothing deleted). Documents are owned by the **person**, so they follow the joiner into the record without copying. See §19 D2.

### 5.3 Batch 6b · Letters, e-sign, BGV

```prisma
model LetterTemplate {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  letterType      String   @map("letter_type") @db.VarChar(40)    // appointment, confirmation, relieving, experience, ... (APX-F numbers)
  legalEntityId   String?  @map("legal_entity_id") @db.Uuid
  language        String   @db.VarChar(5)
  source          String   @db.VarChar(8)                          // upload|starter|editor
  docxFileId      String   @map("docx_file_id") @db.Uuid
  fields          String[]                                          // validated against the field registry
  requiresApproval Boolean @map("requires_approval")
  verifyQr        Boolean  @default(true) @map("verify_qr")
  pdfA            Boolean  @default(false) @map("pdf_a")
  version         Int
  status          String   @db.VarChar(10)                         // draft|active|retired
  previewViewedBy String?  @map("preview_viewed_by") @db.Uuid     // activation needs a viewed sample preview (YX-DOC-15)
  @@map("letter_templates")
}

model LetterIssue {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  templateId      String    @map("template_id") @db.Uuid
  templateVersion Int       @map("template_version")
  personId        String    @map("person_id") @db.Uuid
  subjectType     String?   @map("subject_type") @db.VarChar(12)  // preboarding|exit_case|probation|change
  subjectId       String?   @map("subject_id") @db.Uuid
  referenceNo     String?   @map("reference_no") @db.VarChar(40)  // set at issue, gap-free per entity × type
  dataSnapshot    Json      @map("data_snapshot")                  // frozen merge values (encrypted where Confidential)
  documentId      String?   @map("document_id") @db.Uuid           // the issued PDF as a document of the person
  sha256          String?   @db.Char(64)
  status          String    @db.VarChar(16)                        // draft|pending_approval|issued|superseded|withdrawn
  wfRequestId     String?   @map("wf_request_id") @db.Uuid
  supersedesId    String?   @map("supersedes_id") @db.Uuid
  verifyCode      String?   @unique @map("verify_code") @db.VarChar(16) // 10+ random base32 chars
  issuedBy        String?   @map("issued_by") @db.Uuid
  issuedAt        DateTime? @map("issued_at") @db.Timestamptz(3)
  @@map("letter_issues")
}

model LetterCounter {                // UPDATE … RETURNING inside the issue transaction = gap-free numbers
  organizationId String @map("organization_id") @db.Uuid
  legalEntityId  String @map("legal_entity_id") @db.Uuid
  letterType     String @map("letter_type") @db.VarChar(40)
  year           Int
  next           Int
  @@id([organizationId, legalEntityId, letterType, year])
  @@map("letter_counters")
}

model Signatory {
  id              String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String  @map("organization_id") @db.Uuid
  legalEntityId   String  @map("legal_entity_id") @db.Uuid
  userId          String  @map("user_id") @db.Uuid
  title           String  @db.VarChar(100)
  signatureFileId String? @map("signature_file_id") @db.Uuid
  letterTypes     String[] @map("letter_types")
  active          Boolean @default(true)
  @@map("signatories")
}

model SignatureRequest {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  letterIssueId  String    @map("letter_issue_id") @db.Uuid
  signerType     String    @map("signer_type") @db.VarChar(10)  // person|signatory
  signerId       String    @map("signer_id") @db.Uuid
  order          Int
  method         String    @db.VarChar(12)                       // click_otp (later: aadhaar_esign, dsc)
  status         String    @db.VarChar(10)                       // waiting|open|signed|declined|expired
  evidence       Json?                                            // time, IP, device, OTP channel, sign-in strength, document hash
  signedFileId   String?   @map("signed_file_id") @db.Uuid
  signedAt       DateTime? @map("signed_at") @db.Timestamptz(3)
  @@map("signature_requests")
}

model ConsentRecord {                // BGV consent now; reusable for other purpose-specific consents (P02 YX-SEC-35)
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  personId       String    @map("person_id") @db.Uuid
  purpose        String    @db.VarChar(40)                       // bgv
  noticeVersion  String    @map("notice_version") @db.VarChar(20)
  itemsShown     Json      @map("items_shown")                   // the itemised list the person saw
  givenAt        DateTime  @map("given_at") @db.Timestamptz(3)
  evidence       Json                                             // time, IP, device, OTP channel
  withdrawnAt    DateTime? @map("withdrawn_at") @db.Timestamptz(3)
  @@map("consent_records")
}

model BgvCheck {                     // manual tracking now; partner adapter in 6e (P10)
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  preboardingId  String    @map("preboarding_id") @db.Uuid
  consentId      String    @map("consent_id") @db.Uuid
  checkType      String    @map("check_type") @db.VarChar(20)    // identity|address|education|employment|criminal|reference|credit
  status         String    @db.VarChar(12)                       // requested|in_progress|clear|discrepancy|unable|cancelled
  resultDocumentId String? @map("result_document_id") @db.Uuid
  note           String?   @db.VarChar(1000)
  gate           String?   @db.VarChar(16)                       // none|before_joining|before_confirmation
  @@map("bgv_checks")
}
```

`bgv_checks` and `consent_records` are Special-class for the person (P02); readable by HR roles with the BGV key only.

### 5.4 Batch 6c · Exit cases, clearance, interviews, assets

```prisma
model ExitCase {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String    @map("organization_id") @db.Uuid
  employmentId     String    @map("employment_id") @db.Uuid
  exitType         String    @map("exit_type") @db.VarChar(20)    // resignation|termination|probation_termination|end_of_contract|retirement|death|absconding (6e: retrenchment|vrs)
  initiatedBy      String    @map("initiated_by") @db.VarChar(8)  // employee|company
  reasonCode       String?   @map("reason_code") @db.VarChar(40)
  reasonText       String?   @map("reason_text") @db.VarChar(1000) // the employee's own words (seen by manager + HR, §19 D8)
  submittedOn      DateTime  @map("submitted_on") @db.Date
  requestedLwd     DateTime? @map("requested_lwd") @db.Date
  noticeDays       Int       @map("notice_days")                  // from the policy valid on submitted_on (YX-LC-04)
  standardLwd      DateTime  @map("standard_lwd") @db.Date
  approvedLwd      DateTime? @map("approved_lwd") @db.Date
  noticeArrangement Json?    @map("notice_arrangement")           // early release / buy-out: who pays, days, approved request
  status           String    @db.VarChar(12)                      // submitted|accepted|withdrawn|cleared|exited|closed
  wfRequestId      String?   @map("wf_request_id") @db.Uuid
  withdrawnAt      DateTime? @map("withdrawn_at") @db.Timestamptz(3)
  lettersHeld      Boolean   @default(false) @map("letters_held")  // the hold itself; the reason is HR-only
  version          Int       @default(1)
  @@unique([organizationId, id])
  @@map("exit_cases")
}

model ExitCaseHr {                   // HR-only facts; restrictive RLS + app.lifecycle_confidential
  exitCaseId       String   @id @map("exit_case_id") @db.Uuid
  organizationId   String   @map("organization_id") @db.Uuid
  rehireEligible   Boolean? @map("rehire_eligible")
  rehireReason     String?  @map("rehire_reason") @db.VarChar(500)
  regretted        Boolean?
  backfillRequested Boolean @default(false) @map("backfill_requested")
  openCaseFlags    Json     @default("{}") @map("open_case_flags") // posh / disciplinary / pip: booleans + refs (never shown to the manager)
  holdReason       String?  @map("hold_reason") @db.VarChar(500)
  holdReviewOn     DateTime? @map("hold_review_on") @db.Date
  @@map("exit_case_hr")
}

model ClearanceItem {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  exitCaseId     String    @map("exit_case_id") @db.Uuid
  department     String    @db.VarChar(20)                   // manager_handover|it|admin|finance|hr|custom
  title          String    @db.VarChar(150)
  ownerUserId    String?   @map("owner_user_id") @db.Uuid
  ownerGroupId   String?   @map("owner_group_id") @db.Uuid
  status         String    @db.VarChar(10)                   // open|cleared|waived
  note           String?   @db.VarChar(1000)
  recoveryAmount Decimal?  @map("recovery_amount") @db.Decimal(14, 2)
  recoveryReason String?   @map("recovery_reason") @db.VarChar(300)
  assetAssignmentId String? @map("asset_assignment_id") @db.Uuid
  signedOffBy    String?   @map("signed_off_by") @db.Uuid
  signedOffAt    DateTime? @map("signed_off_at") @db.Timestamptz(3)
  version        Int       @default(1)
  @@map("clearance_items")
}

model ExitInterview {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  exitCaseId     String    @unique @map("exit_case_id") @db.Uuid
  formVersion    Int       @map("form_version")
  status         String    @db.VarChar(10)                    // sent|submitted|skipped
  submittedAt    DateTime? @map("submitted_at") @db.Timestamptz(3)
  @@map("exit_interviews")
}

model ExitInterviewAnswers {         // restrictive RLS + app.lifecycle_confidential (YX-LC-09)
  exitInterviewId String @id @map("exit_interview_id") @db.Uuid
  organizationId  String @map("organization_id") @db.Uuid
  answers         Json                                        // encrypted at rest with the company key (§15)
  hrNotes         String? @map("hr_notes")
  @@map("exit_interview_answers")
}

model Asset {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  category       String    @db.VarChar(40)
  name           String    @db.VarChar(150)
  tag            String    @db.VarChar(60)                    // unique per company
  serial         String?   @db.VarChar(100)
  legalEntityId  String?   @map("legal_entity_id") @db.Uuid
  locationId     String?   @map("location_id") @db.Uuid
  purchasedOn    DateTime? @map("purchased_on") @db.Date
  cost           Decimal?  @db.Decimal(14, 2)
  status         String    @db.VarChar(10)                    // in_stock|assigned|in_repair|retired|lost
  version        Int       @default(1)
  @@unique([organizationId, id])
  @@map("assets")
}

model AssetAssignment {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  assetId         String    @map("asset_id") @db.Uuid
  personId        String    @map("person_id") @db.Uuid
  issuedOn        DateTime  @map("issued_on") @db.Date
  issueCondition  String    @map("issue_condition") @db.VarChar(200)
  ackEvidence     Json?     @map("ack_evidence")             // click or OTP, time, device
  returnedOn      DateTime? @map("returned_on") @db.Date
  returnCondition String?   @map("return_condition") @db.VarChar(200)
  @@map("asset_assignments")
}
```

A DB constraint allows only one open assignment per asset (partial unique index on `asset_id WHERE returned_on IS NULL`).

### 5.5 Batch 6d · Deprovisioning and the payroll hand-off

```prisma
model ExitDeprovisioning {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  exitCaseId     String    @map("exit_case_id") @db.Uuid
  handler        String    @db.VarChar(40)                   // auth.sessions, access.alumni, workflow.reassign, desk.seats, ...
  timing         String    @db.VarChar(6)                    // at_lwd|t0|tn
  runAfter       DateTime  @map("run_after") @db.Timestamptz(3)
  status         String    @db.VarChar(8)                    // pending|done|failed|manual
  attempts       Int       @default(0)
  lastError      String?   @map("last_error") @db.VarChar(500) // no personal data
  doneAt         DateTime? @map("done_at") @db.Timestamptz(3)
  @@unique([exitCaseId, handler])
  @@map("exit_deprovisioning")
}

model ExitSettlementInput {          // the hand-off payroll reads (§11); one current row per exit case
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  exitCaseId        String   @map("exit_case_id") @db.Uuid
  employmentId      String   @map("employment_id") @db.Uuid
  legalEntityId     String   @map("legal_entity_id") @db.Uuid
  revision          Int
  exitType          String   @map("exit_type") @db.VarChar(20)
  lwd               DateTime @db.Date
  wagesDueBy        DateTime @map("wages_due_by") @db.Date     // LWD + 2 working days on the entity calendar (YX-LC-08)
  noticeDays        Int      @map("notice_days")
  noticeServedDays  Int      @map("notice_served_days")
  noticeArrangement Json     @map("notice_arrangement")        // shortfall to recover / company pays in lieu / waived
  recoveries        Json                                        // clearance recoveries and unreturned assets, each with source + reason
  holds             Json                                        // letters / F&F hold flags (no reasons)
  payeesRef         String?  @map("payees_ref") @db.Uuid      // death: exit_payees (6e)
  frozenAt          DateTime @map("frozen_at") @db.Timestamptz(3)
  supersededAt      DateTime? @map("superseded_at") @db.Timestamptz(3)
  @@map("exit_settlement_inputs")
}
```

`exit_settlement_inputs` also gets the M03 pay visibility guard (it holds money) and `support_session_excluded`.

### 5.6 Company settings (P01 settings registry, starter templates, D17)

New keys in `settings-registry.ts`, matching the prototype's settings screens ("Onboarding & probation", "Exit & lifecycle policies", "Assets", "Letters", "Documents & Communication"):

| Key | Scopes | Starter value |
|---|---|---|
| `onboarding.handoff_mode` | tenant, legal entity | `manual` (Ready-to-onboard queue) |
| `onboarding.preboarding_items` | tenant, entity, department | the M01 Q2 default list |
| `onboarding.bgv.timing` | tenant, entity | `after_acceptance` |
| `onboarding.identity_check` | tenant | `hr_attest` (face match in 6e with P10) |
| `exit.notice_days` | tenant, entity, employment type, grade, **dated** | probation 15 / confirmed 30 (company edits; contract first) |
| `exit.notice_unit` | tenant | `calendar_days` (§19 D7) |
| `exit.early_release` / `exit.buyout` | tenant, entity | allowed with approval / both sides with approval |
| `exit.resignation.approval` | tenant, entity | manager then HR |
| `exit.interview.form` | tenant | starter form |
| `exit.clearance_departments` | tenant, entity | manager handover, IT, Admin, Finance, HR |
| `exit.access_end` | tenant | `end_of_lwd` (D6 T+0) |
| `exit.plan_line_release_days` | tenant | 30 |
| `lifecycle.open_case_hold` | tenant | hold relieving / experience letters, HR may release |
| `asset.ack_method` | tenant | click (OTP optional) |
| `letter.ref_format` | tenant, entity | `{ENTITY}/HR/{YYYY}/{NNNN}` |
| `alumni.access_years` | tenant | 7 (P05 Q6; the prototype shows "3", fixed in LIFE-4.04) |

---

## 6. Permissions

### 6.1 New keys

| Key | What it allows | Scope |
|---|---|---|
| `lifecycle.onboarding.view` | See joiners, pre-boarding progress, journeys | people in scope (planned entity / location for joiners) |
| `lifecycle.onboarding.manage` | Add / import joiners, edit the plan, postpone, mark joined, cancel (did not join / reneged / withdraw) | in scope |
| `lifecycle.bgv.manage` | See and record BGV checks and consents (Special) | in scope |
| `lifecycle.journey.template.manage` | Edit journey templates | tenant / entity |
| `lifecycle.exit.view` | See exit cases (not HR-only facts) | in scope |
| `lifecycle.exit.manage` | Start company exits, accept on HR's step, set LWD, holds, clearance set-up | in scope |
| `lifecycle.exit.confidential.view` | Read HR-only facts and confidential exit-interview answers | in scope |
| `lifecycle.settings.manage` | Lifecycle settings (key already used by the prototype) | tenant / entity |
| `document.view` | See a person's documents (each type still needs its P02 class) | in scope |
| `document.manage` | Upload for someone, request uploads, verify / reject | in scope |
| `letter.template.manage` | Upload, validate and activate letter templates | tenant / entity |
| `letter.issue` | Issue letters (approval-required types still go to P03) | in scope |
| `letter.signatory.manage` | Manage signatories and signature images (**step-up**) | entity |
| `asset.view` / `asset.manage` | Asset list / issue, return, edit | location / entity |

**No key** is needed for: a person's own resignation, pre-boarding, documents, letters and signing; a manager acting on their own team through the reporting-line scope (accept resignation step, review probation, clearance "handover" item, see team joiners); a task assignee completing their own task.

Restricted fields are still P02 field classes: Aadhaar, bank and BGV are Special / Confidential, so `document.view` alone never opens them.

### 6.2 Role templates (added to `ROLE_TEMPLATES`)

| Role | Gets |
|---|---|
| HR Admin | all `lifecycle.*`, `document.*`, `letter.*` (not `letter.signatory.manage`), `asset.view` |
| HR Executive | `lifecycle.onboarding.view/manage`, `lifecycle.exit.view`, `document.view/manage`, `letter.issue` |
| Payroll Admin | `lifecycle.exit.view` (for the hand-off), `document.view` |
| **New: IT / Admin coordinator** | `asset.view/manage`, `lifecycle.onboarding.view` (names and joining days only) |
| **New: Company signatory** | `letter.issue` for the types they sign; signs in the app |
| System Admin | `letter.signatory.manage`, `lifecycle.settings.manage` |

`lifecycle.exit.confidential.view` and `lifecycle.bgv.manage` are in the P02 "risky grant" list (warning when given to many people).

---

## 7. Journeys (one engine for joining, leaving and later return-to-work)

### 7.1 Templates
- HR builds templates in **Settings › Onboarding & probation › Journey templates** (and the offboarding twin). Each task has owner, kind, offset from the anchor day (−30 … +90), dependencies and an optional P19 condition.
- **One template per journey:** the active template with the most specific matching audience wins (entity + department beats entity), ties broken by priority. HR can pick another when adding the joiner (the prototype's "Chosen from the location. You can change it.").
- **Starter templates** ship as YukthiX starters (labelled, copied into the company, never overwritten by updates; YX-DOC-20 pattern). They include the statutory tasks (YX-LC-22) and the **locked** appointment-letter task (YX-LC-26).

### 7.2 Running
- `start(subject, template, anchorOn)` creates one `journeys` row and its tasks; due = anchor + offset. Tasks whose dependencies are not done are `waiting`; others `open`.
- **Owner resolution** at start: `manager` = the joiner's planned manager (or the leaver's current manager); `hr` / `it` / `admin` / `finance` / `payroll` = the user group the company maps in settings (falls back to HR Admins in scope); `person` = the joiner / leaver themselves (shown in their portal or Me page); `buddy` (6e).
- **Re-anchor** (YX-LC-13): when the joining day or LWD changes, every open / waiting task moves by the same number of days. Done tasks never move. One audit row, one `preboarding.joining_date.changed` or `exit.lwd.changed` event.
- **Complete / skip:** the assignee completes; HR may skip a non-required task with a reason; a **locked** task cannot be skipped. Linked tasks complete themselves (letter issued, document verified, desk request fulfilled, asset acknowledged, clearance item cleared).
- **Reminders:** a BullMQ scheduler (hourly) raises `journey.task.due` on the due day and `journey.task.overdue` after it; the overdue notice goes to the assignee and, after the company's escalation days, to the journey owner (HR).
- **Cancel:** when the joiner does not join or the resignation is withdrawn, the journey is `cancelled`; open desk requests are cancelled with a note.

### 7.3 Task kinds

| Kind | What it does | Completes when |
|---|---|---|
| `tick` | Plain to-do | Assignee ticks |
| `form` | A small form (`FormDef` from `rules-engine/forms.ts`) | Form submitted |
| `document` | Asks the person (or HR) for a document type | Document uploaded (or verified, if the type needs it) |
| `letter` | Issues a letter type through §9.4 | Letter **issued** (signing tracked separately; YX-LC-26) |
| `desk_request` | Raises a Service Desk request from a catalogue item for the joiner / leaver (laptop, email account, access card, access removal) | `helpdesk.request.fulfilled` for that request |
| `asset_issue` / `asset_return` | Opens the issue / return dialog for an asset category | Assignment acknowledged / returned |
| `clearance` | Creates a clearance item for a department (offboarding) | Item cleared or waived |

### 7.4 Link with the Service Desk journeys (SD-2.08)
The desk already has "joiner / leaver journeys" that raise one request per desk from catalogue items when `employee.joined` fires. Two engines would mean two checklists. This design makes the **lifecycle journey the only checklist** and uses the desk as the way IT / Admin **do** their tasks:
- a `desk_request` task calls the existing `CatalogService` / `TicketsService` (system work, as `JourneysService.start` does today);
- the request's due date is the task's due date (before day one), so the desk's OLA timers and queues apply;
- the request links back to the task; fulfilment completes the task.
- The SD-only journey set-up screen stays for companies that use the **standalone Service Desk without HR** (no M01). In an HRMS company, desk journeys whose items are also in a lifecycle template are not started twice (the desk listener skips a person who has an active lifecycle journey). See §19 D1.
- The desk listener's placeholder event `employee.exit_scheduled` is replaced by the agreed APX-B event `exit.case.accepted` (LIFE-3.05).

---

## 8. Onboarding flow

### 8.1 Adding a joiner
1. **Direct entry** (PPL-12 "Create employee" form) or **import** (CSV / Excel, preview with errors per row, like the bulk changes import of step 2).
2. The system finds or creates the **P01 person** (existing `persons.ts` matching: email / phone / identifiers; "possible same person" goes to PPL-36). If the person has a past employment, the joiner is a **rehire** (6e flow; until 6e, HR sees "Ex-employee: rehire flow comes later" and can continue as a new employment with the same person).
3. A `preboardings` row is created with the plan (entity, location, department, designation, grade, employment type, manager, CTC reference), the journey starts (anchor = joining day), and `preboarding.started` fires.
4. **From an ATS offer** (LIFE-2.09): on `offer.accepted`, with `onboarding.handoff_mode = auto` the row is created at once; with `manual` the offer appears in **Ready to onboard** pre-filled. An **internal** candidate is not onboarded: HR is sent to the P06 transfer action with the agreed release date.

### 8.2 Pre-boarding portal (T9-01)
- Sections come from `onboarding.preboarding_items` (required / optional per entity / department). Default: personal, family and nominees, emergency contact, education, previous employment (and income this year for TDS), documents, bank, tax regime, policies to sign, letters to accept, BGV consent.
- Answers are **staged** in `preboardings.sections` (Personal / Special values encrypted with the company key, §15). On joining they are written to the real tables (`employee_personal_details`, `employee_identifiers`, `employee_bank_accounts`, family, nominees) by the same services HR uses, so all their checks run (PAN / Aadhaar format, duplicate check YX-EMP-02, bank cooling hours).
- Bank and PAN entry need a **fresh OTP** (step-up for this login type, P02 §4.7).
- Document uploads use §9.1; the phone camera is the native `<input type="file" accept="image/*" capture>`.
- HR sees `completion` (% of required sections done) on the board and the journey record.

### 8.3 Pre-boarder login (external)
- Catalogued login "Pre-boarding candidate" (P02 §4.7): **OTP to the personal email or mobile** given by HR; Turnstile on the OTP request; rate limits as the existing OTP sign-in.
- The session's only scope is its own `preboardings` row and the person's own documents and letters. It is **not a seat** and is not billed.
- It ends on joining (the person gets a normal employee login) or on cancel. Sessions are revoked at once on cancel.

### 8.4 Joining day and pre-boarding changes
- **Mark joined** (HR) or the **joining-day job** (07:00 IST, only when the company turns on "join automatically when ready"): calls the existing hire path (employee, employment, assignment, `join` change, probation from settings, employee code), copies staged data, re-labels the person role `preboarder → employee`, creates the login (SSO if set), and fires `employee.joined` (the desk listener keeps working).
- **Appointment letter check** (YX-LC-26): if no appointment letter is issued by the due day, HR gets a compliance alert; the letter task cannot be removed.
- **Identity check on day one** (YX-LC-31): in this design HR **attests** ("I checked the original ID") and the attestation is stored; the face match from the identity chain comes with P10 in 6e. It never blocks joining.
- **Postpone:** new joining day → plan dates and all open task dates move (re-anchor); the joiner is told.
- **Did not join / reneged / withdrawn:** one action with a mandatory reason: `preboardings.status = cancelled`, journey cancelled, open desk requests cancelled, portal login revoked, person role ended, ATS offer marked reneged / withdrawn (exam-app offer status). A withdrawal makes a draft withdrawal letter for HR. Nothing is deleted. (Headcount plan / requisition release comes with M10.)

---

## 9. Documents, letters and e-sign (P05 core)

### 9.1 Files
- Upload goes to the API (multipart, streamed, size-capped per type). The API sniffs the real type with `file-type`, checks the type's allow-list, computes SHA-256, stores the bytes under `org/{org}/{area}/{uuid}`, and queues a **ClamAV** scan. The file is `pending` and cannot be downloaded until `clean` (fail closed, YX-DOC-02). EICAR is the test.
- Downloads: the API checks P02 for the owner and type, writes an audit row for Confidential / Special, then returns a **signed link valid for 5 minutes** with `Content-Disposition: attachment` (PDFs and images may open inline in the browser's own viewer, never as HTML).
- Storage backend: the existing blob interface; an S3-compatible adapter is added if §19 D9 = A. Keys never contain names.

### 9.2 Documents and verification
- System document types (PAN, Aadhaar, bank proof, photo, education, previous relieving letter, experience letter, passport, appointment letter (issued), relieving / experience (issued), BGV report, ...) plus company types.
- Upload → `uploaded`; HR verifies or rejects with a reason (PPL-27); rejection notifies the person to re-upload; re-upload makes a new version.
- **Payroll pre-flight hook:** `documentsBlockingPay(employmentIds)` returns people whose verification-required documents are not verified (YX-DOC-17). M03 PAY pre-flight calls it.
- Expiry: a daily job moves documents past `expires_on` to `expired` and raises reminders at the type's days (P04).
- Automated checks (PAN verification, penny-drop) are P10 adapters; until they exist, HR verifies by hand.

### 9.3 Letter templates
- **Upload a Word file** (PPL-29 "Upload" tab). Safety checks before anything else (§15): real .docx (not .docm), size and zip limits, no macros, no external links / remote images (removed with a note).
- **Placeholders** use `{{field}}`, `{{#if probation}}…{{/if}}` and `{{#each salary_lines}}…{{/each}}`. They are checked against the **field registry**: each field has a label, a source (person, employment, assignment, compensation, company, entity, exit case, preboarding) and a P02 class. Unknown fields get a "did you mean" suggestion (edit distance). Fields the author cannot see under P02 are refused.
- **Activate** only after a sample preview (rendered with a sample person) has been viewed (YX-DOC-15). Versions: activating a new version retires the old one; issued letters keep their version.
- **Starter library** (6b): appointment (#6), welcome / joining instructions (#5), confirmation (#12), probation extension (#13), resignation acceptance (#50), resignation withdrawal acceptance (#52), termination (#53, simple variants), no-dues certificate (#60), relieving (#62), experience (#63), asset acknowledgement (#10). Written by us, in plain English; Hindi / Tamil / Telugu versions follow the P21 translation process. They contain **no post-exit non-compete clause** (§18.4).

### 9.4 Issuing a letter
1. Pick type → template (entity + language) → **preview with real data** (PPL-28).
2. Missing required values stop the render with a list (YX-DOC-07). The issuer must be able to see every field (YX-DOC-08).
3. If the type needs approval (P05 Q4 defaults), a P03 request `letter.issue` is raised; the summary shows type, person and reference only.
4. On approval (or at once), in **one transaction**: next reference number (`letter_counters` UPDATE … RETURNING), frozen data snapshot, render job queued. The render worker: docxtemplater fill → Gotenberg PDF (PDF/A if set) → pdf-lib adds the QR + reference footer and the signatory image → SHA-256 → stored as a `documents` row of the person → `issued`, `document.issued` event, P04 notice "Your letter is ready" (no content outside the app).
5. **Immutable:** a trigger blocks changes to `sha256`, `reference_no` and the file of an issued letter. A correction is a new issue that **supersedes** the old one (old one stays, verify page says "superseded on …").
6. Render failures (Gotenberg down, timeout) leave the letter `pending_render` with a retry; the number is already reserved, so numbers stay gap-free.

### 9.5 E-sign (click-to-accept with OTP)
- The first time a person signs anything, they see the **e-sign disclosure** (APX-G G-19) and accept it once.
- To sign: the person reads the PDF, ticks "I accept", gets an OTP on their registered channel, enters it. We store evidence (time, IP, device, OTP channel, sign-in strength, the PDF's SHA-256) and **seal** a signed copy: the original pages + a completion page listing signers and evidence (pdf-lib), stored as a new file with its own hash.
- **Order:** company signatory first (signature image, or DSC later), then the person. A declined signature tells HR.
- This reuses the logic of `service-desk/documents.service.ts`, which moves into `documents/esign` and is called by both.
- Aadhaar eSign (licensed provider) and company DSC are adapters on the same `method` column, built in 6e (§19 D5).

### 9.6 Verify page (T9-08)
- Public page `/verify/{code}` (and a form to type the code). Shows only company, letter type, person's name, issue date, current / superseded. Restricted-area letters show "Confidential HR letter" only (YX-DOC-21).
- Codes are 10 random base32 characters (50 bits); the page is rate-limited per IP and returns the same "not found" for wrong and expired codes.

---

## 10. Exit flow

### 10.1 Probation outcomes (finishing step 2)
- The manager gets the **review form** N days before the end (existing reminder; PPL-17, phone too): outcome confirm / extend (months, within the max) / terminate, comments, optional rating.
- **Confirm** → existing confirmation change + confirmation letter. **Extend** → existing extend endpoint + extension letter. **Terminate** → HR reviews, then an exit case `probation_termination` is opened (§10.4). `employee.probation.confirmed / extended / terminated` events.

### 10.2 Resignation (PPL-18)
1. The employee opens **Me › Resign**, gives reason and the day they want to leave. The screen shows the notice period from policy and the **standard LWD** = submitted day + notice (calendar days or months, §19 D7) before they submit.
2. `exit_cases` row `submitted`; employment status stays as is until acceptance. Event `exit.case.opened` (thin, no reason text).
3. P03 request type `exit.resignation`: step 1 the reporting manager (not dotted-line), step 2 HR (user group from settings). Approvers can propose a different LWD inside the rules (early release needs its own approval, §10.3).
4. On acceptance (in the decision's transaction): `approved_lwd` set; a P06 status change `notice` from the acceptance day; resignation acceptance letter; offboarding journey starts (anchor = LWD); clearance items created; `exit.case.accepted` event (desk leaver requests, M10 backfill later).
5. **Withdraw:** before acceptance the employee withdraws alone; after acceptance it is a P03 request (manager + HR); on approval the notice status ends, journey and desk requests are cancelled, a withdrawal acceptance letter is issued, `exit.case.withdrawn`.
6. A manager can never accept their own resignation; the P03 self-approval rule already blocks it.

### 10.3 Notice changes
- **Early release** (company agrees to an earlier LWD) and **buy-out** (employee pays the shortfall, or the company pays in lieu) are P03 requests on the case; the result is stored in `notice_arrangement` and in the payroll hand-off. LWD changes re-anchor the journey and fire `exit.lwd.changed`.
- **Leave during notice** (YX-LC-21) is M02's per-leave-type notice policy. When it exists, an "extends LWD" leave moves the LWD through the same path; until then leave during notice is normal leave and the hand-off notes "notice served" from attendance at freeze time.

### 10.4 Company-started exits (PPL-19 "Start exit")
- HR picks the type, LWD and reason. **Termination is refused while the employee is on maternity leave** (M02 leave state; YX-LV-10) and shows why.
- **Death (basic):** LWD = date of death; every deprovisioning handler runs at once; no exit interview; employee-owned clearance items are closed by HR; letters go to the next of kin. Payees, nominee login and the claim forms checklist are 6e (LIFE-5.04).
- **Absconding (manual):** HR records last day present; LWD = that day; rehire-ineligible set (HR can clear). The automatic timeline from M02 absence is 6e.
- **End of contract / retirement:** HR starts them by hand with the contract end / retirement date; the schedulers that start them automatically are 6e.
- Company exits that need approval (company setting, starter: termination and probation termination need HR Admin approval) use P03 type `exit.company`.

### 10.5 Pre-checks, holds, flags
- When a case opens, `exitPrechecks(personId)` asks the registered modules: M08 open POSH / disciplinary case where the person is respondent, M06 open PIP. Modules that do not exist yet return "not checked" (shown to HR as such). Results are stored in `exit_case_hr.open_case_flags` and shown **only** to holders of `lifecycle.exit.confidential.view` (never to the manager, YX-LC-23).
- **Hold** (company policy): relieving / experience letters wait; `exit_cases.letters_held = true` is visible to the leaver as "Your relieving letter is on hold. HR will contact you." The reason and review date are HR-only. A hold never moves the wage deadline (§11).
- **Flags:** rehire eligible + reason, regretted, backfill requested: HR-only (`exit_case_hr`).

### 10.6 Clearance, assets, exit interview
- **Clearance** (PPL-20 + phone): items per department from settings and the offboarding template, each owned by a user or group. The owner clears, waives with a reason, or records a **recovery amount + reason** (e.g. unreturned laptop at book value per `asset.recovery_basis`). When every item is cleared or waived, the case is `cleared` and the no-dues certificate can be issued. **Open items never block the exit itself** (M01 §3.7); they flow to payroll as open recoveries.
- **Assets:** every open assignment of the leaver becomes an `asset_return` task and a clearance item; returning it closes both. Unreturned at LWD → recovery input.
- **Exit interview** (PPL-21 + phone): sent to the leaver at the template offset (starter LWD − 5). Form from `exit.interview.form`. Answers go to `exit_interview_answers` (HR-only, encrypted); HR adds notes. The manager only sees "Exit interview: done / not done".

### 10.7 Last working day, deprovisioning, alumni
- **At LWD** (`employment.lwd_approaching`, run on the LWD morning): handlers that must run while the person is still active: reassign open P03 approval tasks (existing reassignment), reassign desk tickets and remove desk seats, transfer journey tasks the leaver owns to their manager.
- **T+0** (end of the LWD, 23:59 IST job): a P06 change `exit` is applied (employment `exited_on`, status period closed); `employment.exited` fires; handlers: revoke all sessions and refresh tokens, end implicit grants (P02), convert the login to **alumni**, end P03 delegations, revoke user API keys, calendar connection and face template. **T+N** handlers (e.g. release the headcount-plan line) run later.
- **Deprovisioning panel** (PPL-19): one row per handler (pending / done / failed + retry / manual). Handlers are idempotent; failures retry with backoff (3 tries) then alert HR (`exit.deprovisioning.failed`). Modules not built yet register their handler when they are built.
- **Alumni** (T9-02): OTP to the personal email / mobile on the record; read-only own issued letters and documents (payslips and Form 16 / 130 appear when M03 publishes them); for `alumni.access_years` (7) from the LWD (YX-DOC-16). Relieving and experience letters are issued at LWD (or when a hold is released) straight into the alumni vault.

---

## 11. Hand-off to payroll (F&F is not built here)

The **hand-off point** is one frozen record per exit case, `exit_settlement_inputs`, plus one event.

| When | What happens |
|---|---|
| Case accepted | Revision 1 is frozen: exit type, approved LWD, `wages_due_by` (LWD + 2 working days on the legal entity's holiday calendar, YX-LC-08), notice days and arrangement, current recoveries, holds. Event `exit.settlement_inputs.ready` (Confidential, ids only). |
| LWD change, notice arrangement change, clearance recovery added / cleared, asset returned | A new revision; the old one is `superseded`. Same event with the new revision. |
| `employment.exited` (T+0) | Final revision with `notice_served_days`. Changes after this still make new revisions until payroll marks the F&F approved (M03 `fnf.approved`), as YX-LC-07 asks; after that, corrections follow P06 / P08. |

**What payroll does with it** (M03 §9.9 / §10.5, not this design): creates the F&F off-cycle run with the deadline, pulls pay to LWD, leave encashment, gratuity, loans, the recoveries listed here, and pays. M03 PAY-7.04 reads the **current revision** and never writes to it.

**Until payroll 5g exists:** PPL-22 (F&F calculator) shows the hand-off (deadline countdown, recoveries list, holds) with the note "Payroll calculates the final settlement". No amounts are computed in M01. HR settles outside YukthiX and records "settled outside" on the case (reason, date), so the case can close.

---

## 12. Events and notifications

### 12.1 Events (APX-B §2.10 keys; outbox, same transaction)

| Event | Producer slice | Consumers today |
|---|---|---|
| `preboarding.started`, `preboarding.completed`, `preboarding.cancelled`, `preboarding.joining_date.changed` | LIFE-1.07, 2.08 | P04 notices; desk (cancel / move requests) |
| `employee.joined` (existing) | LIFE-2.08 via the hire path | desk journeys (skips people with a lifecycle journey), P02 |
| `journey.task.assigned`, `journey.task.due`, `journey.task.overdue` | LIFE-1.04 | P04 |
| `document.uploaded`, `document.verified`, `document.rejected`, `document.expiring` | LIFE-1.03 | P04, journey task completion |
| `document.issued` | LIFE-2.05 | P04, journey task completion |
| `signature.requested`, `signature.completed`, `signature.declined` | LIFE-2.07 | P04 |
| `employee.probation.confirmed / extended / terminated` | LIFE-3.01 | P04, letters, exit case |
| `exit.case.opened`, `exit.case.accepted`, `exit.case.withdrawn`, `exit.lwd.changed` | LIFE-3.02…3.04 | P04, journeys, desk leaver requests, M10 later |
| `asset.assigned`, `asset.returned` | LIFE-3.07 | P04, clearance |
| `employment.lwd_approaching`, `employment.exited` | LIFE-4.01 | deprovisioning handlers, P04 |
| `exit.deprovisioning.failed` | LIFE-4.02 | P04 (HR) |
| `exit.settlement_inputs.ready` (**new**, add to APX-B) | LIFE-4.05 | M03 F&F (when built) |

Payloads carry ids and dates only, never reasons, answers or amounts.

### 12.2 Notifications (P04 types, in-app + email; SMS / WhatsApp only where the person opted in)

| Who | Notice |
|---|---|
| Joiner | Invitation with portal link; reminders for pending items (T−7, T−3); joining day changed; letter ready to sign; welcome on day one |
| Manager | New joiner in your team (with date); joiner's tasks for you; probation review due / overdue; resignation to accept; exit interview done (no content) |
| HR / IT / Admin / Finance (task owners) | Task assigned, due, overdue; documents to verify; clearance item to sign off |
| HR | Pre-boarding complete; appointment letter missing (compliance); resignation accepted / withdrawn; deprovisioning failed; open-case flag (HR only) |
| Leaver | Resignation received / accepted / withdrawal decided; LWD changed; clearance and asset return reminders; exit interview; relieving letter ready; alumni access active |

All texts are neutral outside the app (P04 Q6): "You have a document to sign in YukthiX", never the content.

---

## 13. API

All under `/api/yx/` with the existing guards (session, CSRF, tenant, `RequirePermissions`, scope check per person). External portal routes under `/api/portal/` use the external-login guard.

| Endpoint | Purpose | Permission |
|---|---|---|
| `GET/POST/PUT /lifecycle/journey-templates[/:id]` | List, create, edit templates and tasks | `lifecycle.journey.template.manage` |
| `GET /lifecycle/journeys/:id`, `GET /lifecycle/my-tasks` | Journey record; my tasks across journeys | scope / assignee |
| `POST /lifecycle/journey-tasks/:id/complete` · `/skip` · `/reassign` | Task actions | assignee / `lifecycle.onboarding.manage` |
| `GET /lifecycle/joiners`, `POST /lifecycle/joiners`, `POST /lifecycle/joiners/import` (preview + commit) | Board, add, import | `lifecycle.onboarding.view/manage` |
| `GET /lifecycle/ready-to-onboard`, `POST /lifecycle/ready-to-onboard/:offerId/create` | Manual ATS hand-off | `lifecycle.onboarding.manage` |
| `POST /lifecycle/joiners/:id/postpone` · `/cancel` · `/mark-joined` · `/attest-identity` | Pre-boarding actions | `lifecycle.onboarding.manage` (cancel: step-up) |
| `GET/POST /lifecycle/joiners/:id/bgv`, `PUT /lifecycle/bgv/:checkId` | BGV checks | `lifecycle.bgv.manage` |
| `POST /portal/preboarding/otp`, `POST /portal/preboarding/session` | Pre-boarder OTP sign-in (Turnstile) | public, rate-limited |
| `GET /portal/preboarding`, `PUT /portal/preboarding/sections/:key`, `POST /portal/preboarding/consents/bgv` | Portal checklist, save a section, give / withdraw consent | pre-boarder (own) |
| `POST /documents/files` (upload), `GET /documents/files/:id/link` | Upload; short signed link | owner / `document.manage` + P02 class |
| `GET /documents/people/:personId`, `POST /documents/requests` | Person's documents; ask people to upload | `document.view` / `document.manage` |
| `GET /documents/verification-queue`, `POST /documents/:id/verify` · `/reject` | Verification | `document.manage` |
| `GET /me/documents` | My documents and letters | self |
| `GET/POST /letters/templates`, `POST /letters/templates/:id/validate` · `/preview` · `/activate`, `GET /letters/templates/:id/docx` | Templates | `letter.template.manage` |
| `GET /letters/fields` | Field registry (only fields the caller may see) | `letter.template.manage` / `letter.issue` |
| `POST /letters/issues` (draft + preview), `POST /letters/issues/:id/issue`, `POST /letters/issues/:id/supersede` | Issue | `letter.issue` (+ P03 where needed) |
| `GET /letters/issued` | Issued letters register | `letter.issue` |
| `POST /me/certificates` | Instant self-service certificate | self |
| `GET /esign/requests/mine`, `POST /esign/requests/:id/otp`, `POST /esign/requests/:id/sign` · `/decline` | Signing | signer |
| `GET/POST/PUT /letters/signatories` | Signatories | `letter.signatory.manage` + step-up |
| `GET /public/verify/:code` | Verify page data | public, rate-limited |
| `GET /lifecycle/probations/:id/review`, `POST /lifecycle/probations/:id/review` | Manager review form | manager scope |
| `GET /me/resignation`, `POST /me/resignation`, `POST /me/resignation/withdraw` | Resign / withdraw | self |
| `GET /lifecycle/exits`, `GET /lifecycle/exits/:id` | Exit list and workspace (HR-only facts only with the confidential key) | `lifecycle.exit.view` / manager scope |
| `POST /lifecycle/exits` (company exit), `PUT /lifecycle/exits/:id` (LWD, notice arrangement, holds) | Company exits and changes | `lifecycle.exit.manage` |
| `PUT /lifecycle/exits/:id/hr` | HR-only facts | `lifecycle.exit.confidential.view` + `lifecycle.exit.manage` |
| `GET /lifecycle/clearance/mine`, `POST /lifecycle/clearance/:id/clear` · `/waive` | Clearance sign-off | item owner |
| `GET/PUT /me/exit-interview`, `GET /lifecycle/exits/:id/interview` | Exit interview | self / confidential key |
| `GET /lifecycle/exits/:id/deprovisioning`, `POST …/:handler/retry` · `/manual-done` | Deprovisioning panel | `lifecycle.exit.manage` |
| `GET /lifecycle/exits/:id/settlement-input` | Payroll hand-off (current revision) | `lifecycle.exit.view` + pay visibility guard |
| `GET/POST/PUT /assets`, `POST /assets/:id/issue` · `/return`, `POST /me/assets/:assignmentId/acknowledge` | Assets | `asset.view/manage` / self |
| `GET /portal/alumni/documents`, `GET /portal/alumni/documents/:id/link` | Alumni vault | alumni (own) |

Request types registered with P03: `letter.issue`, `exit.resignation`, `exit.withdrawal`, `exit.notice_change`, `exit.company`. All are `risk: normal`, `autoActions: false`, neutral card preview (names of people leaving are not pushed to Teams / Slack cards).

---

## 14. Screens

### 14.1 Wired from `packages/yx-ui`

| Screen | Component(s) | Batch / slice |
|---|---|---|
| PPL-27 Document verification queue | `DocumentVerificationQueue` | 6a · LIFE-1.03 |
| PPL-11 Onboarding board | `OnboardingBoard` | 6a · LIFE-1.07 |
| PPL-13 Journey record (HR, IT, manager, employee views) | `JourneyRecord` | 6a · LIFE-1.07 |
| Settings › Onboarding & probation › Journey templates; Exit & lifecycle policies | settings registry G2 | 6a · LIFE-1.04 / 1.06 |
| T9-01 Pre-boarding portal (+ `NomineeForm`, `BankDetailsStep`, `TaxRegimeStep`, `OfferLettersPanel`, `PreboardingDocuments`, `BgvConsentStep`) | `PreboardingPortalScreen` … | 6b · LIFE-2.02 / 2.03 / 2.07 |
| PPL-29 Letter templates (Upload tab, validation report, preview) | `LetterTemplatesList`, `LetterTemplateWorkspace` | 6b · LIFE-2.04 |
| PPL-28 Issue letter + issued register | `IssueLetterSheet`, `IssuedLettersRegister` | 6b · LIFE-2.05 |
| T9-08 Public verify page | `VerifyPageScreen` | 6b · LIFE-2.06 |
| PPL-15 Pre-boarding actions | `PreboardingActionSheet` | 6b · LIFE-2.08 |
| PPL-12 Ready to onboard | `ReadyToOnboardQueue` | 6b · LIFE-2.09 |
| PPL-16 / PPL-17 Probation queue and review form (+ phone) | `ProbationQueue`, `ProbationReviewForm`, `ProbationReviewPhone`; step-2 `ProbationScreen` | 6c · LIFE-3.01 |
| PPL-18 Resignation (+ phone) | `ResignationSheet`, `ResignationPhone` | 6c · LIFE-3.02 |
| PPL-19 Exit cases list + workspace | `ExitCasesList`, `ExitCaseWorkspace` | 6c · LIFE-3.04; deprovisioning panel 6d |
| PPL-20 Clearance (+ phone) | `ClearanceSignoffs`, `ClearancePhone` | 6c · LIFE-3.05 |
| PPL-21 Exit interview (+ phone) | `ExitInterview`, `ExitInterviewPhone` | 6c · LIFE-3.06 |
| PPL-25 Asset register + acknowledge (phone) | `AssetRegister`, `AssetAcknowledgePhone` | 6c · LIFE-3.07 |
| PPL-30 My documents (+ phone, camera) | `MyDocuments`, `MyDocumentsPhone` | 6d · LIFE-4.06 |
| PPL-31 Certificate request (+ phone) | `CertificateRequest`, `CertificateRequestPhone` | 6d · LIFE-4.06 |
| T9-02 Alumni portal (alumni half) | `AlumniPortalScreen` | 6d · LIFE-4.04 |
| PPL-22 F&F calculator, **hand-off state only** | `FnfCalculator` (read-only hand-off view) | 6d · LIFE-4.05 |
| 6e: PPL-14 batches, PPL-23 death, PPL-24 absconding, PPL-40 VRS, PPL-41 buddy, T9-02 nominee half, PPL-28 bulk wizard, PPL-29 editor tab | as named | 6e |

### 14.2 Gaps found in the prototype (to add or fix while wiring)

| Gap | Fix |
|---|---|
| No **"My tasks"** list for IT / Admin / Finance owners across journeys | Small list screen in the People frame (kit `DataTable`), or the desk queue when the task is a desk request. Add in LIFE-1.07. |
| No **journey template editor** screen (settings shows only a list row) | Settings detail drawer with the task table (owner, kind, offset, depends, locked). LIFE-1.04. |
| No **"Start exit"** sheet (button exists, no sheet) for company exits | Sheet: type, LWD, reason, approval note; maternity-leave block message. LIFE-3.04. |
| No **"Settled outside YukthiX"** action on PPL-22 for the time before payroll 5g | Small action on the hand-off view. LIFE-4.05. |
| Settings shows **alumni access "3 years after exit"**; the decision is 7 years | Fix the prototype data. LIFE-4.04. |
| No **e-sign disclosure (G-19)** step in the portal | One-time sheet before the first signature. LIFE-2.07. |
| No **identity attestation** control on the joining day | Checkbox + note on PPL-15 "Mark joined". LIFE-2.08. |
| Manager's **"Joining soon"** on the Team page | Small card on PPL-08 fed by the joiners API. LIFE-1.07. |

Every wired control follows the YukthiX clickable-affordance and single-choice (Segment) rules; the shared guard test covers new screens.

---

## 15. Security

| Risk | Control |
|---|---|
| Cross-company reads | Forced RLS on every new table; composite foreign keys; CI guard; e2e "two companies apart" test per batch. |
| Manager sees HR-only facts (POSH flag, rehire, regretted, exit answers) | Separate tables with a **restrictive** policy that needs `app.lifecycle_confidential = on`, set per transaction only after the P02 key + scope check; API responses never include those fields otherwise; test that the manager's API and a raw query both return nothing. |
| Malicious upload (malware, HTML disguised as image) | Byte-sniffed type vs allow-list; ClamAV before use; signed links with `attachment` disposition; separate storage origin; quarantine on infection. |
| Malicious Word template | Only .docx; reject macros (.docm content types, `vbaProject.bin`); zip limits (≤ 20 MB compressed, ≤ 100 MB uncompressed, ≤ 2,000 entries, no nested zips); strip external relationships (remote images, linked files); docxtemplater with a **field-lookup-only parser** (no expressions, no prototype access: field names must match `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$`); Gotenberg container with **no outbound network**, per-request timeout (30 s), memory limit; output size cap. |
| Data leaking through a letter | Merge fields checked against the issuer's P02 classes at render; snapshot stored encrypted when it holds Confidential fields; QR page shows only the minimum; restricted-area letters show "Confidential HR letter". |
| Forged letters | Hash stored; trigger blocks change of issued letters; public verify page; superseded state shown. |
| Guessing verify codes or portal OTPs | 50-bit codes, per-IP rate limits, identical "not found" answers; OTP rules of step 1 (expiry, attempts, cooldown) + Turnstile. |
| Pre-boarder reaching other data | External-login guard: only `/portal/preboarding` routes, own row only, ends at joining / cancel; bank / PAN entry needs a fresh OTP. |
| Staged Special data before joining | Aadhaar, PAN, bank account in `sections` encrypted with the company key (`OrgSecretsCryptoService`), masked in every response, same as `employee_identifiers`; purged 30 days after a cancel (unless HR records a reason to keep, e.g. a dispute). |
| Fake resignation | Only the signed-in employee can submit for themselves (no "on behalf" route except HR's company exit); acceptance needs the manager and HR. |
| Access left open after exit | T+0 job is idempotent, retried, alerted, and visible on the panel; sessions and refresh tokens revoked in the same job; a test calls the API with the leaver's old session after T+0 and gets 401. |
| Self-approval | P03 rule: nobody approves their own request; a manager's own resignation goes to their manager. |
| Bulk misuse | Cancel joiner, signatory changes and template activation need step-up; every action audited. |
| Support staff seeing personal documents | `support_session_excluded` on documents of Confidential / Special types, BGV, HR-only tables and the hand-off. |

---

## 16. Build order (PR-sized slices)

Each slice is one pull request with its migration, API, tests and (where listed) wired screen. "Stories" are tracker ids. Every batch ends with the independent security review and a full green test run (roadmap rule).

### 16.1 Batch 6a · Files, documents and journeys (8 slices)

| ID | Slice | Tests | Stories |
|---|---|---|---|
| LIFE-1.01 | `lifecycle/` and `documents/` modules; permission keys and role templates (§6); settings keys (§5.6); CI RLS guard covers new tables | unit: role templates contain keys; settings resolve by scope; CI guard fails on a table without policy | US-D-040 |
| LIFE-1.02 | Files: `files` table, upload pipeline (size, `file-type` sniff, allow-list, SHA-256), scanner moved to `common/` and used by desk + documents, quarantine, 5-minute signed links, audited Confidential downloads; S3 adapter if §19 D9 = A | unit: sniff rejects HTML-as-JPEG; e2e: EICAR quarantined and never downloadable; link expires; other company's file id → 404 | US-C-028 |
| LIFE-1.03 | Document types (system + company), documents, versions, request upload, verification queue, expiry job, `documentsBlockingPay()`; wire PPL-27 | e2e: verify / reject with reason; re-upload makes v2; expiry reminder at configured days; employee cannot open another's PAN; screen test for queue | US-C-028, US-C-029 |
| LIFE-1.04 | Journey engine: templates + tasks, audience match, start, owner resolution, dependencies, complete / skip / reassign, re-anchor, hourly due / overdue job; template editor drawer in settings | unit: due = anchor + offset incl. negative; re-anchor moves only open tasks; locked task cannot be skipped; e2e: overdue escalates after N days | US-D-037, US-D-039 |
| LIFE-1.05 | Task kinds `tick`, `form`, `document`, `desk_request` (via catalogue, closes on `helpdesk.request.fulfilled`; desk listener skips people with a lifecycle journey) | e2e: IT laptop request raised with the task's due date; fulfilling it completes the task; no duplicate desk request on `employee.joined` | US-D-037, US-B-127 |
| LIFE-1.06 | Starter onboarding and offboarding templates (statutory tasks YX-LC-22, locked appointment-letter task YX-LC-26), copy into a company | e2e: starter has UAN / Form 11 / Form 2 / ESIC; the appointment task cannot be removed; company copy not overwritten by a starter update | US-D-039, US-D-046 |
| LIFE-1.07 | Joiners: `preboardings`, add by hand, CSV / Excel import with preview, person match, journey start; onboarding board, journey record, "My tasks", Team page "Joining soon"; wire PPL-11, PPL-13 | e2e: Kavya's "Collect PAN" at −7 days is due a week before joining (U49); import shows row errors and commits only valid rows; joiner not in the directory before day one; screen tests | US-D-038, US-D-042 |
| LIFE-1.08 | Batch 6a end-to-end and Playwright (HR adds a joiner → IT sees the desk request → HR verifies a document); forced-RLS test on every new table | Playwright run; RLS e2e | — |

### 16.2 Batch 6b · Pre-boarding, letters and e-sign (9 slices)

| ID | Slice | Tests | Stories |
|---|---|---|---|
| LIFE-2.01 | Pre-boarder external login: OTP + Turnstile, own-row scope, ends at joining / cancel; invite and reminders | e2e: pre-boarder cannot call any staff route; session revoked on cancel; reminder T−7 for pending items | US-D-041 |
| LIFE-2.02 | Portal API: sections, staged encrypted answers, documents with camera, bank (fresh OTP), tax regime, nominees, completion %; wire T9-01 | e2e: Aadhaar staged encrypted and masked; completion % moves; bank entry without fresh OTP refused; screen tests | US-D-052 |
| LIFE-2.03 | BGV: itemised notice + consent record + withdrawal, checks list, results as documents, gates, discrepancy = flag only; wire `BgvConsentStep` | e2e: no check can be created without consent; withdrawal stops open checks; a discrepancy never withdraws the offer; manager cannot read BGV | US-D-050 |
| LIFE-2.04 | Letter templates: .docx upload, safety checks, field registry with P02 classes, placeholder validation with suggestions, sample preview gate, versions, download; starter .docx library (§9.3); wire PPL-29 upload tab | unit: macro / external-link / zip-bomb rejected; `{{emp_nme}}` suggests `employee_name`; expression syntax refused; e2e: cannot activate before preview | US-E-243, US-E-244 |
| LIFE-2.05 | Render and issue: docxtemplater → Gotenberg → pdf-lib (QR, reference, signatory image); gap-free numbers; immutable trigger; supersede; P03 `letter.issue`; delivery to vault; wire PPL-28 single issue | e2e: missing field stops with a list; 20 parallel issues give 20 consecutive numbers; issued PDF cannot be changed; Tamil glyphs render (font test) | US-C-085 |
| LIFE-2.06 | Public verify page; restricted-area letters; wire T9-08 | e2e: current vs superseded; wrong code and rate limit; only minimal fields returned | US-C-086, US-E-245 |
| LIFE-2.07 | E-sign: G-19 disclosure once, OTP click-to-accept, evidence, sealed completion page, signing order, signatories (step-up); offer / appointment acceptance in the portal; desk documents moved onto the shared esign module | e2e: signed copy hash differs and is stored; evidence holds OTP channel and PDF hash; company signs before employee; desk SD-2.07 tests still green | US-C-030 |
| LIFE-2.08 | Joining: Mark joined / joining-day job through the hire path, staged data written through existing services, documents follow the person, appointment-letter compliance alert, identity attestation; postpone / did not join / reneged / withdrawn; wire PPL-15 | e2e: Sneha 1 Oct → 15 Oct moves "Collect PAN" 24 Sep → 8 Oct; did-not-join cancels journey, desk requests and login in one action; `employee.joined` fires once; missing appointment letter alerts next day | US-D-052, US-D-047, US-D-048, US-D-046, US-D-053 |
| LIFE-2.09 | ATS hand-off: accepted offer → auto or Ready-to-onboard queue; internal candidate → P06 transfer; ex-employee flagged; wire PPL-12 | e2e: auto mode creates the joiner on acceptance; manual mode lists it pre-filled; internal candidate is not onboarded | US-D-041, US-D-042 |

### 16.3 Batch 6c · Probation outcomes, resignation and exit case (7 slices)

| ID | Slice | Tests | Stories |
|---|---|---|---|
| LIFE-3.01 | Probation review form (manager): confirm / extend / terminate, letters, events; wire PPL-16, PPL-17 (+ phone) | e2e: review not done by the end escalates and does not auto-confirm (YX-LC-01); extend beyond max refused; terminate opens a probation-termination case after HR | US-A-097 |
| LIFE-3.02 | `exit_cases`, notice policy (dated, by type / grade / confirmation), resignation submit / withdraw, standard LWD, P03 `exit.resignation`, notice status, acceptance letter, offboarding journey start; wire PPL-18 (+ phone) | unit: LWD maths for days and months (31 Jan + 1 month); e2e: notice from the policy valid on the submission day; manager → HR; withdrawal before / after acceptance | US-D-056 |
| LIFE-3.03 | Early release, buy-out (either side), LWD change with re-anchor, leave-in-notice hook to M02 | e2e: early release moves LWD and tasks; buy-out recorded in the arrangement; `exit.lwd.changed` once | US-D-057, US-D-058 |
| LIFE-3.04 | Company exits (termination with maternity block, probation termination, end of contract, retirement, death basic, absconding manual), P03 `exit.company`, pre-checks registry, holds, HR-only table with restrictive RLS; "Start exit" sheet; wire PPL-19 | e2e: termination during maternity leave refused; POSH flag invisible to the manager by API and raw query; hold shows a neutral message to the leaver | US-D-059, US-D-062 |
| LIFE-3.05 | Offboarding journey on `exit.case.accepted` (desk listener moved from `employee.exit_scheduled`), clearance items, sign-off / waive / recovery; wire PPL-20 (+ phone) | e2e: each owner sees only their items; all cleared → case `cleared`; open items do not block LWD | US-D-060, US-B-127 |
| LIFE-3.06 | Exit interview: company form, confidential answers table, HR notes; wire PPL-21 (+ phone) | e2e: "reason: manager" answer not visible to the manager (YX-LC-09); death case creates no interview | US-D-061 |
| LIFE-3.07 | Assets: register, issue from a journey task, acknowledgement, return with condition, unreturned → clearance + recovery; wire PPL-25 + acknowledge phone | e2e: one open assignment per asset (DB); return closes task and clearance item; unreturned laptop appears as a recovery | US-D-054, US-D-055 |

### 16.4 Batch 6d · Last day, letters, alumni and payroll hand-off (6 slices)

| ID | Slice | Tests | Stories |
|---|---|---|---|
| LIFE-4.01 | LWD jobs: `employment.lwd_approaching` (morning of LWD) and T+0 (end of LWD, IST) applying P06 change `exit` (new change type), `employment.exited` | unit: IST day boundary; e2e: employment `exited_on` set once even if the job runs twice | US-D-063 |
| LIFE-4.02 | Deprovisioning registry and panel: handler interface, retries, alerts; handlers for sessions, alumni conversion, P03 reassign + delegations, desk seats + tickets, API keys, calendar, face template, journey tasks owned | e2e: after Ravi's LWD his old session gets 401, his API key is revoked, his delegation ended, panel all done (YX-LC-14); a failing handler retries and alerts | US-D-064 |
| LIFE-4.03 | Exit letters: no-dues after clearance, relieving and experience at LWD, held by policy until released; rehire / regretted / backfill flags | e2e: held letter not issued until HR releases; released letter lands in the alumni vault | US-D-080, US-D-062 |
| LIFE-4.04 | Alumni login (OTP to personal contact), read-only own vault, ends after 7 years; wire T9-02 alumni half; fix "3 years" prototype data | e2e: alumni can read own letters, not anything else; access refused after the period (clock test) | US-D-081, US-C-087 |
| LIFE-4.05 | Payroll hand-off: `exit_settlement_inputs` revisions, `wages_due_by` (LWD + 2 working days, entity holidays), `exit.settlement_inputs.ready`, PPL-22 hand-off view + "settled outside" | unit: Anjali LWD Fri 30 Oct → due Tue 3 Nov; with a holiday on Mon 2 Nov → Wed 4 Nov; e2e: open clearance never moves the date; new revision on asset return | US-D-077 |
| LIFE-4.06 | Wire PPL-30 My documents and PPL-31 instant certificates; dead-button scan on lifecycle screens; Playwright: resignation → acceptance → clearance → LWD → alumni login | Playwright run; screen tests | US-C-085 |

### 16.5 Batch 6e · Special cases and add-ons (8 slices, can be split again)

| ID | Slice | Tests | Stories |
|---|---|---|---|
| LIFE-5.01 | Rehire policy, impact preview, per-rehire override with reason; ex-employee flag at application (with M10) | e2e: Priya's same-FY rehire case (M01 §7) | US-D-043, US-D-044, US-A-185 |
| LIFE-5.02 | Campus batches, LOI, engagement touchpoints; wire PPL-14 | e2e: batch date change re-anchors every member | US-D-049 |
| LIFE-5.03 | Onboarding buddy; wire PPL-41 | e2e: manager cannot be buddy; day-30 check-in | US-D-051 |
| LIFE-5.04 | Death in service full: payees from nominations, legal heirs with documents, claim forms checklist, next-of-kin letters, nominee login; wire PPL-23, T9-02 nominee half | e2e: Suresh 60 / 40 payees in the hand-off; Deepak without nomination blocks until heirs recorded | US-D-065, US-D-067 |
| LIFE-5.05 | Absconding timeline from M02 unauthorised absence (salary hold via M03 when built); wire PPL-24 | e2e: Anil's day 3 / 7 / 14 / 21 steps; stop on return | US-D-068 |
| LIFE-5.06 | Retirement and contract-end schedulers; extension / conversion changes | e2e: alerts at 30 and 7 days; auto-exit only when policy says so | US-D-070, US-D-071, US-A-186 |
| LIFE-5.07 | Retrenchment, lay-off and closure with the government permission request; VRS scheme; wire PPL-40 | e2e: 350-worker plant blocked until permission granted | US-D-072, US-D-073, US-D-074 |
| LIFE-5.08 | Add-ons: in-app template editor (saves .docx with `docx`), bulk letter wizard, company DSC (after M03 D4), Aadhaar eSign provider, BGV partner adapter, day-one face match (P10) | per adapter: contract tests with the provider sandbox | US-C-030, US-C-085 |

**Totals:** 6a 8 · 6b 9 · 6c 7 · 6d 6 · 6e 8 = **38 slices**.

### 16.6 Stories to add to the tracker (not added in this commit)

| Proposed story | Why | Slice |
|---|---|---|
| Lifecycle tasks for IT and Admin open Service Desk requests | Joins M01 journeys and SD-2.08 into one checklist | LIFE-1.05 |
| HR settles an exit outside YukthiX until payroll F&F exists | Lets a pilot close exit cases before M03 5g | LIFE-4.05 |
| Exit settlement inputs are frozen and revised for payroll | The hand-off record and event | LIFE-4.05 |
| BGV consent is itemised, recorded and can be withdrawn | DPDP evidence (US-D-050 covers tracking only) | LIFE-2.03 |

---

## 17. Tests (summary)

| Level | What |
|---|---|
| Unit | LWD and notice maths (days, months, month ends), working-day deadline with holidays, journey offsets and re-anchor, template field parser and suggestions, docx safety checks, owner resolution, audience match. |
| API e2e (per batch) | Forced RLS on every new table; two companies apart; every endpoint's permission (extends `endpoint-permissions.spec.ts`); manager vs HR-only facts by API and by raw query; external logins limited to their routes; idempotent jobs (run twice, same result); events fired once. |
| Worker | Gotenberg render of each starter letter with English, Hindi, Tamil and Telugu sample data; PDF/A flag; timeout handling. |
| Screen (Vitest + Testing Library) | Each wired screen: loading, empty, error, ready; role views (HR / manager / employee); clickable controls; Segment for single choice. |
| Playwright | 6a: joiner + desk request + verification. 6b: pre-boarding to joining with appointment letter signed. 6c: resignation to clearance. 6d: LWD to alumni. |
| Security review | Independent review at the end of each batch: upload and template attacks, external logins, HR-only data, verify page enumeration, deprovisioning completeness. |

---

## 18. India law points (public sources, in our own words)

These are design inputs, not legal advice. Each line marked **verify** becomes a P07 rule or a starter-template note checked by the compliance owner before the pilot.

### 18.1 Joining
- **Appointment letter:** the OSH Code (in force from 21 Nov 2025) requires an appointment letter for every employee. YukthiX makes it a locked onboarding task with an alert (YX-LC-26).
- **PF and ESI at joining:** new members give a declaration (Form 11) and nomination (Form 2), and get or link a UAN; where ESI applies, the employee is registered as an insured person soon after joining (**verify** the current number of days). These are starter tasks owned by payroll / HR.
- **Under-18 joiners** (apprentices, interns): their consent for data processing must come from a parent or guardian under the DPDP Act; the BGV consent and e-sign steps ask for the guardian when the date of birth shows a minor.

### 18.2 Background verification and the DPDP Act 2023 (with the DPDP Rules 2025)
- Personal data may be processed with **consent** that is free, specific, informed, clear and given by a clear action, after an **itemised notice** (what data, for what purpose, how to withdraw, how to complain). The main duties apply from **13 May 2027** (APX-G); we build to them now.
- The Act also allows some processing **for employment purposes without consent** (a "legitimate use"). A candidate who has not yet joined is a weaker fit for that, so YukthiX always takes **explicit BGV consent** with a record, and tells the person plainly what happens if they withdraw (checks stop; HR decides on the offer; nothing is automatic).
- **Only the checks needed for the role** (purpose limitation, data minimisation): the company picks checks per role; credit checks only where the role handles money.
- **Aadhaar:** a private employer should not force Aadhaar use; offer other IDs and never store the full number where a masked one is enough (Supreme Court Puttaswamy 2018 limited private use; Aadhaar Act s.29). Any Aadhaar-based check goes through a licensed partner (P10).
- **BGV partner** is a data processor: contract, listed as a sub-processor (APX-G G-04), in-region data, results deleted when the purpose is served.
- **Retention:** BGV results are kept for the company's period (starter: until confirmation + 1 year, then deleted unless a dispute) (**verify** with counsel).
- **No automatic adverse action:** a discrepancy only flags HR (M01 BGV rule); the candidate can explain.
- **Breach:** a personal data breach is reported to the Board and the people affected (APX-G G-03 / G-23 process).

### 18.3 Notice period, resignation and termination
- For most private-sector staff **no single central law sets the resignation notice**; it comes from the appointment letter, the company's certified standing orders, or the state Shops and Establishments law. YukthiX takes it from the company's notice policy (dated) so the letter and the policy agree.
- **Standing orders:** under the Industrial Relations Code, establishments above the threshold (currently 300 workers) need standing orders covering termination and notice; model standing orders apply until certified ones exist (**verify** per state rules).
- **State Shops and Establishments laws** in several states require the employer to give notice (often around 30 days) or pay in lieu when ending the job of an employee with a minimum service (**verify** per state; P07 rule per state).
- **Retrenchment** of a worker with 1+ year of service needs written notice (one month) or wages in lieu, compensation of 15 days' average pay per completed year, and government permission at 300+ workers (6e; YX-LC-27).
- **Maternity:** an employer may not dismiss or discharge a woman during her maternity leave (Maternity Benefit Act / SS Code); YukthiX blocks a termination case in that period.
- **Notice buy-out recovery** is a contract term; payroll shows it as its own F&F line. Whether it counts as a permitted deduction from wages under the Code on Wages is **verify** (M03 flag).
- **Wages on exit** are due within **2 working days** of the last day for every exit type (Code on Wages, s.17(2)); YukthiX computes the date at acceptance and never moves it for holds.
- **Gratuity** becomes payable on exit after the qualifying service (5 years; 1 year for fixed-term under the SS Code; no service condition on death); the employer sends Form L within 15 days of it becoming payable (M03).
- **PF exit:** the employer marks the date of exit on the EPFO portal; ESI exit is marked too (starter offboarding tasks).

### 18.4 Relieving and experience letters
- A **relieving letter** is a strong business custom rather than a general statutory duty; new employers ask for it. Holding it for a long time or to pressure the person is a legal and reputation risk, so YukthiX makes every hold visible to the leaver (neutral text), requires a reason and a review date, and the hold never affects pay deadlines.
- A **service / experience certificate** at exit is required for workers under model standing orders and under several state Shops and Establishments laws (**verify** per state). YukthiX issues the experience letter by default at LWD.
- Letters state facts only (dates, designation, conduct statement as the company chooses). **No post-exit non-compete:** a restraint on working elsewhere after leaving is generally void in India (Indian Contract Act 1872, s.27); starter letters keep only confidentiality duties.

### 18.5 Electronic signatures and records
- A contract can be formed electronically (IT Act 2000, s.10A). OTP click-to-accept gives us an **electronic record with evidence** (who, when, which document hash), which is enough for acceptance of offers, appointment letters and policies in normal use.
- A **legally recognised electronic signature** under the IT Act (s.3A, Second Schedule) is Aadhaar eSign through a licensed eSign provider, or a digital signature certificate (DSC). Companies that want that strength for appointment letters or NDAs turn on the paid add-on (P05 Q2, 6e).
- When an electronic record is used as evidence in court, a certificate about the record may be needed (Bharatiya Sakshya Adhiniyam 2023, s.63); our sealed completion page and audit trail make that easy to produce (**verify** format with counsel).

---

## 19. Decisions for the founder

Each question is short. The **bold** option is my recommendation.

### D1 · IT and Admin joining tasks: where are they done?
The new joiner needs a laptop, an email account, an access card. Who sees these tasks, and where?

| Option | What it means |
|---|---|
| **A. A checklist task that opens a Service Desk request** | HR sees one checklist. IT and Admin get a normal request in their desk queue, with the due date and their SLA. When they finish, the checklist line turns green by itself. |
| B. Only a checklist tick in HR | Simpler. But IT does not see it in their queue, and there is no SLA. |

**Recommended: A.** The Service Desk is already built for this. One checklist, no double work.

### D2 · Does a new joiner appear in the employee list before day one?

| Option | What it means |
|---|---|
| **A. No. Only on the Onboarding board and the manager's "Joining soon" card** | The person becomes an employee on the joining day. If they do not join, nothing needs undoing. Headcount, billing and payroll stay correct. |
| B. Yes, with a "Joining on …" badge | Everyone sees future joiners in the directory. Cancelling is harder, and reports must filter them out. |

**Recommended: A.**

### D3 · One asset list or two?
HR needs a simple asset list now (laptops, phones, cards). The IT Service Desk will later have a full asset and configuration database (phase 3b-3).

| Option | What it means |
|---|---|
| **A. One shared list, started simple now** | We build the simple list now in a shared place. Phase 3b-3 adds more fields to the same list. One truth for "who has which laptop". |
| B. Two lists | HR's own simple list now; IT's list later. Two places to update, they can disagree. |

**Recommended: A.**

### D4 · How we turn Word letters into PDF
The decision to use LibreOffice is already made (P05). This is about how we run it.

| Option | What it means |
|---|---|
| **A. Gotenberg (a free, well-known container with LibreOffice inside)** | Ready-made service with timeouts and health checks. We add our Indian-language fonts. It has no internet access. |
| B. Our own LibreOffice process | Fewer parts, but we must write and maintain the process handling ourselves. |

**Recommended: A.**

### D5 · Company signature on relieving and experience letters at first release

| Option | What it means |
|---|---|
| **A. Signature image + QR verify now; digital signature (DSC) later** | Letters carry the signatory's signature image and a QR code anyone can check. DSC comes when payroll decides where the company's signing key lives (M03 D4). |
| B. Wait for DSC | No relieving letters from YukthiX until DSC is ready. |

**Recommended: A.** The QR check already proves the letter is real.

### D6 · Background checks at launch

| Option | What it means |
|---|---|
| **A. HR tracks checks by hand, with proper consent. A BGV partner comes later** | The joiner gives consent in the portal. HR records each check and uploads the report. Partner connection in batch 6e. |
| B. A BGV partner from day one | Automatic checks, but we must choose and contract a partner first. This would delay the batch. |

**Recommended: A.**

### D7 · How is the notice period counted?

| Option | What it means |
|---|---|
| **A. Calendar days or months, as written in the company policy** | 30 days notice given on 10 Oct (10 Oct is day 1) ends on 8 Nov. This is how appointment letters normally say it. |
| B. Working days | Holidays and weekends are skipped. Rare in India; confusing for employees. |

**Recommended: A.** Companies can still choose months (e.g. "2 months").

### D8 · Can the manager see why the employee resigned?

| Option | What it means |
|---|---|
| **A. Yes for the reason the employee writes in the resignation. No for the exit interview** | The employee knows the manager reads the resignation. The exit interview stays private to HR (rule YX-LC-09). |
| B. Only HR sees the resignation reason | More private, but the manager accepts a resignation without knowing why. |

**Recommended: A.** The screen tells the employee who will read the reason.

### D9 · File storage now

| Option | What it means |
|---|---|
| **A. Build the S3-compatible storage now** | Our design (D4) says S3-compatible storage. Documents are long-lived, so we start them there. On a laptop it runs on MinIO (free). |
| B. Keep today's Azure storage until hosting is chosen | Less work now; moving all documents later is extra work and risk. |

**Recommended: A**, unless the hosting decision (P13) is coming in the next few weeks; then follow it.

### D10 · Who builds the document and letter engine first?
Lifecycle (this design) and payroll (M03 batch 5a) both need the same document store and letter engine.

| Option | What it means |
|---|---|
| **A. Lifecycle builds it (batches 6a and 6b); payroll reuses it** | Lifecycle needs it for appointment and relieving letters. Payroll then only adds payslips and Form 16 / 130 on top. |
| B. Payroll builds it in 5a; lifecycle waits | Lifecycle batches 6b and 6d wait for payroll 5a. |

**Recommended: A** if step 6 starts before step 5; otherwise B. Either way it is built **once**, in `apps/api/src/documents/`.

### D11 · What happens to the exit case before payroll F&F exists?

| Option | What it means |
|---|---|
| **A. HR can mark "Settled outside YukthiX" with a date and note** | The pilot company can close exit cases now. When payroll F&F is built, it replaces this. |
| B. Exit cases stay open until payroll F&F is built | Cases pile up as "waiting for payroll". |

**Recommended: A.**

---

## 20. Change log

| Date | Change |
|---|---|
| 9 Oct 2026 | First draft: scope, reuse, data model per batch, permissions, journeys, onboarding, documents / letters / e-sign, exit, payroll hand-off, events, API, screens and gaps, security, 38 slices in batches 6a–6e, India law points, founder decisions D1–D11. |
