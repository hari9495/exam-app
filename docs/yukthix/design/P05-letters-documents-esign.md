# P05 · Letters, Documents & E-sign

> **Status:** ✅ Decided, 24 Sep 2026. All 8 questions answered (§11).
> **Covers:** spec §2.1.8 (document management & e-signature), §2.1.9 (letter & template generator), §1.3.15 (policies & acknowledgement, document expiry), §1.3.14 (alumni access), D4 (S3-compatible storage), gap summary "letters & documents".
> **Builds on:** P01 (legal entity letterheads, employees), P02 (sensitivity classes, audit of views), P03 (approval before issuing), P04 (expiry reminders, acknowledgements).

---

## 1. Purpose & scope

| Area | What it covers |
|---|---|
| **File storage** | Every uploaded or generated file: S3-compatible, per-region, private, encrypted, virus-scanned |
| **Documents** | Typed, versioned records: employee documents (PAN, Aadhaar, degrees, previous relieving letter, photos), issued documents (letters, payslips, Form 16), company documents (policies) |
| **Letters** | Templates → generated PDFs with company letterhead, merge fields, reference numbers, approval, bulk issue, QR verification |
| **E-sign** | Employee acceptance / signature on letters and policies; company signatory signature |
| **Vaults** | "My documents" for employees (and alumni after exit), HR document views per employee |

---

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | Keep / change |
|---|---|---|
| Storage | `BlobStorageService` (Azure Blob, one private container, SAS-signed reads, path-traversal-safe URL checks) | **Replace the backend** with an S3-compatible adapter behind the same interface (D4); keep the safety checks; per-region buckets (P02 Q7) |
| Templates | `renderTemplateString`: `{{ key }}` replacement, missing → empty, no escaping | **Extend**: typed, permission-aware fields, conditionals, tables, escaping, missing-field errors |
| PDFs | `pdfkit` programmatic PDFs (offer letter, certificate, report exporter) | **Letters move to .docx templates + LibreOffice conversion** (Q1): pdfkit can't shape Hindi/Tamil/Telugu; pdfkit stays for simple exports |
| Offer letters | `OfferTemplate` (subject, body), `Offer.pdfPath`, click-to-accept via token | Keep for ATS; move into the letter system (offer = a letter type) |
| Certificates | `CertificateTemplate` + **public verification controller** | **Reuse** the verification pattern for letter QR codes (Q5) |
| Document management | None beyond résumés and offer PDFs | **New** (§4.2) |
| E-signature | Click-to-accept only | **Extend** (Q2) |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **File** | Stored bytes + metadata (type, size, hash, region, scan status). Never addressed by public URL; accessed through short-lived signed links after a permission check |
| **Document type** | A registered kind of document: PAN card, Aadhaar, degree certificate, offer letter, payslip, Form 16, policy… with sensitivity class, expiry rule, who may upload / verify / view, retention |
| **Document** | One item of a type for an owner (employee or company), with **versions** and a status (uploaded → verified / rejected → expired) |
| **Letter template** | Layout + text with merge fields for a letter type, per legal entity (letterhead), per language, versioned |
| **Letter issue** | One generated letter for one person: template version, frozen data snapshot, reference number, PDF (immutable), signatures, verification code |
| **Signature request** | Who must sign or accept what, by which method, with evidence (time, IP, OTP channel, certificate) |

---

## 4. Design

### 4.1 Storage
- An **S3-compatible** adapter (AWS S3 / MinIO / Azure-via-gateway / GCS interop) behind the existing storage interface. There is **one bucket per region**. Keys are `org/{organization_id}/{area}/{uuid}`. No customer names appear in keys.
- Private buckets with server-side encryption. **Reads use signed links valid for minutes**, issued only after the P02 check; downloads of Confidential/Special documents are audited (P02 YX-SEC-09).
- **Upload checks:** allowed types per document type, size limits, **virus scan** before the file becomes usable, image downscaling and PDF normalisation, and a content hash (duplicate detection, tamper evidence).
- `files` table with `organization_id` + RLS; blob deletion happens only via the retention job (§4.7).

### 4.2 Documents
- **Registry** of document types (code + tenant additions), each with:
  - sensitivity class (P02) and owner kind (employee / company);
  - **required for** (onboarding checklist, payroll, statutory);
  - **expiry tracking**: an expiry-date field and reminder days (P04 scheduler);
  - **verification required** (Q7), and who may upload (employee / HR);
  - retention period.
- **Versions:** re-uploads create a new version; the old one stays available to HR until retention ends.
- **Verification:** automated partner checks (PAN verification, bank penny-drop; P10 Q6, on by default) mark the document verified on success. For other types, and when an automated check fails, HR marks it verified or rejected (with a reason); rejected → the employee is notified to re-upload.
- **Bulk import:** a ZIP with files named by employee code and document type, with a preview of matches before import.
- **Medical certificate** (system type, gap D9): **Special** class; uploaded by the employee (or a proxy, P03 YX-WF-18) as an attachment to a leave or regularisation request; **HR verifies** (verified / rejected with reason); retention follows the leave record it supports. The approver never opens the file: the approval card shows only "certificate attached · verified" or "certificate attached · pending verification" (YX-DOC-18).
- **Special attachments on requests:** any attachment whose document type is Special is shown to a P03 approver only if the approver's own role grants the Special class for that person; otherwise the approver sees the attachment's type and verification status only (YX-DOC-18).

### 4.3 Letters
- **Letter types** (shipped library): offer, appointment, confirmation, probation extension, increment / revision, promotion, transfer, relieving, experience, full & final, warning / show-cause, suspension (M08 Q5), PIP letter (M06 Q7), POSH notices / IC letters (M08), training-bond terms (M07 Q5), salary certificate, address proof, employment verification, NOC; lifecycle events (GAP-REGISTER E): death-in-service letter to next of kin and nominee claim cover letters (PF / EDLI / gratuity / insurance), absconding notice 1 and notice 2 and deemed-abandonment letter, contract extension / conversion letter, retirement and re-employment letters, maternity leave approval letter, deputation letter, rehire letter. Every shipped letter is a labelled starter template the company edits (spec D17). Tenants can add their own.
- **Complete library:** the list above is the short form. The full shipped library (90 templates: letters, certificates, forms, notices, statutory forms, GST invoice / credit note, payslip layout, ID card, admit card, document-carrying emails) with type, trigger, signatory, e-sign / DSC, languages, QR default, retention and status is [APX-F](APX-F-templates.md) (rules YX-DOC-20–22).
- **Templates are Word (.docx) files** (Q1/Q3), made in either of two ways:
  - **Upload a Word template:** the company's own letter with placeholders such as `{{employee_name}}`, `{{ctc}}`, a repeating block for the salary annexure, and conditionals (`{{#if probation}}…{{/if}}`). It is edited in Word and re-uploaded.
  - **In-app editor:** for letters created inside YukthiX from the library or blank. It covers text, headings, lists, tables, merge-field picker, letterhead (per legal entity), signatory block and language versions, and **saves as .docx**.

  Any template can be downloaded as Word. The shipped library is available as both editor templates and downloadable .docx files.
- **Upload validation:** placeholders are checked against the field registry, and unknown ones get suggestions ("`{{emp_nme}}` → did you mean `{{employee_name}}`?"). A preview PDF with a sample employee must be viewed before the template can be activated.
- **Merge fields** come from a typed registry (employee, employment, assignment, compensation, company). A field the author or issuer can't see under P02 can't be used. **Missing required values stop generation** with a list (unlike the exam app's silent empty string).
- **Rendering** (Q1): one pipeline for all templates: fill the .docx (field registry, P02-checked) → convert to PDF with **LibreOffice in a YukthiX worker service** (in-region; Hindi/Tamil/Telugu fonts installed; PDF/A for archival letters). LibreOffice runs as a separate process (MPL-2.0), which is compatible with closed source. The .docx filling library (candidate: docxtemplater core) needs its **licence verified before adoption**; paid add-on modules are avoided.
- **Reference numbers** per legal entity and letter type (`WFX/HR/2026/0142`), gap-free.
- **Issue flow:** draft → (approval, if the type requires it, P03) → **issued**. An issued PDF is **immutable** (stored with its hash). A correction = a new issue that supersedes the old one, which stays visible as superseded.
- **Bulk issue:** e.g. 40 increment letters from the payroll revision run, with a per-person preview, failures listed, and a ZIP / individual delivery.
- **Delivery:** to the employee's vault + a P04 notification ("Your appointment letter is ready"; no content outside the app, P04 Q6).
- **Verification** (Q5): a QR code + short code on the letter; a public page confirms the letter is genuine and shows minimal data (company, letter type, employee name, date), reusing the exam app's certificate verification.

### 4.4 E-sign & acceptance (Q2)

| Method | Use | Evidence stored |
|---|---|---|
| **Click-to-accept with OTP** | Employee acceptance of offer, appointment; policy acknowledgement only for policies marked critical (a plain click by default, M08 Q6 / YX-POL-02) | Time, IP, device, OTP channel (mobile/email), document hash |
| **Aadhaar eSign** (via a licensed eSign provider) | Where the company wants legally stronger employee signatures (e.g. appointment, NDA) | Provider certificate + signed PDF |
| **Company digital signature (DSC)** | Letters signed by the company (relieving, experience, Form 16) | PAdES signature in the PDF |
| **Signature image** | Visual signatory on letters (with or without DSC) | Stored per signatory, used only by permitted issuers |

- Signed PDFs are sealed: a **completion certificate** page lists signers and evidence.
- Multi-party order is supported (company signs, then the employee accepts).

### 4.5 Policies & acknowledgement
P05 stores company documents of type "policy" and their versions like any other document. Acknowledgement (audience, read / acknowledged tracking, re-acknowledgement on a new version, quiz, reminders and escalation, proof report for compliance) is owned by **M08** (YX-POL, wave 5), which uses these documents.

### 4.6 Vaults
- **My documents** (Me tab): uploads and their status, issued letters, payslips, Form 16, policies. Download and share (signed link, expiring) for loan / visa purposes.
- **Employee documents** (HR view): by type with status chips (missing / pending verification / verified / expiring / expired), a checklist completeness score, and bulk request ("ask 12 people to upload PAN").
- **Alumni access** (Q6) after exit.
- **Nominee access** after a death in service: a limited login for a registered nominee / legal heir, same pattern as alumni (YX-DOC-19).

### 4.7 Retention & deletion
Each document type has a retention rule (e.g. statutory registers and payslips: legal minimum; ID copies: exit + N years; candidate documents: configurable). A daily job anonymises or deletes after retention unless there is a **legal hold**. Deletions are logged (P08).

---

## 5. Data model

| Table | Key columns |
|---|---|
| `files` | `organization_id`, `region`, `storage_key`, `mime`, `size`, `sha256`, `scan_status`, `uploaded_by`, `created_at` |
| `document_types` | `organization_id` (null = system), `key`, `name`, `owner_kind`, `sensitivity`, `requires_verification`, `expiry_rule`, `retention_rule`, `upload_by`, `required_for[]` |
| `documents` | `owner_type` (employee / company), `owner_id`, `type_key`, `status`, `current_version_id`, `valid_from`, `expires_on`, `verified_by`, `verified_at`, `legal_hold` |
| `document_versions` | `document_id`, `file_id`, `version`, `uploaded_by`, `note` |
| `letter_templates` | `letter_type`, `legal_entity_id?`, `language`, `source` (upload / editor), `docx_file_id`, `editor_json` (editor templates only), `fields[]`, `requires_approval`, `version`, `status` |
| `letter_issues` | `template_id + version`, `employee_id`, `reference_no`, `data_snapshot jsonb`, `document_id`, `status` (draft / pending_approval / issued / superseded / withdrawn), `issued_by`, `issued_at`, `verify_code` |
| `signature_requests` | `document_id`, `signer` (user / employee / external email), `order`, `method`, `status`, `evidence jsonb`, `signed_file_id` |
| `signatories` | `legal_entity_id`, `user_id`, `title`, `signature_file_id`, `dsc_ref`, `active` |

All carry `organization_id` + RLS (P01).

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-DOC-01 | Files are private; access is only through short-lived signed links issued after a P02 permission check; Confidential/Special downloads are audited. |
| YX-DOC-02 | A file is usable only after passing type/size validation and virus scan; failed files are quarantined and the uploader is told why. |
| YX-DOC-03 | Files are stored in the tenant's region (P02 YX-SEC-19) under tenant-prefixed keys, encrypted at rest. |
| YX-DOC-04 | Each document has a type; its sensitivity class, verification need, expiry and retention come from the type. |
| YX-DOC-05 | Re-upload creates a new version; earlier versions remain for HR until retention ends. |
| YX-DOC-06 | Documents with an expiry date raise reminders before expiry and move to "expired" automatically (P04 scheduler). |
| YX-DOC-07 | Letter generation fails with a list of missing required fields; no silent blanks. |
| YX-DOC-08 | Merge fields respect P02: authors can only place, and issuers only render, fields they may see. |
| YX-DOC-09 | Issued letters are immutable (hash stored); corrections create a new issue that supersedes the old; reference numbers are gap-free per entity and type. |
| YX-DOC-10 | Letter types marked approval-required go through P03 before issue. |
| YX-DOC-11 | Issued letters carry a verification code/QR unless the tenant switched it off for that letter type (default on); the public verify page shows only company, letter type, name and date, and whether the letter is current or superseded. |
| YX-DOC-12 | Signing/acceptance stores evidence (time, IP, device, OTP channel or provider certificate, document hash) and seals the signed PDF with a completion page. |
| YX-DOC-13 | Retention rules delete or anonymise files after their period unless a legal hold applies; every deletion is logged. |
| YX-DOC-15 | Every letter template is stored as .docx (uploaded or produced by the in-app editor) and rendered by the single fill → LibreOffice pipeline; a template can be activated only after its placeholders validate against the field registry and a sample preview has been viewed. |
| YX-DOC-16 | After exit, the employee's login converts to an **alumni** account (OTP to personal email/mobile) that can only read and download their own payslips, Form 16 and issued letters, for 7 years from the exit date; all other access ends on the last working day. |
| YX-DOC-17 | Documents of verification-required types (default: PAN, Aadhaar, bank proof, education, experience) are not used by payroll, payouts or statutory filings until verified; automated partner checks (PAN verification, bank penny-drop, P10 Q6, on by default) mark the document verified on success, and HR manual verification covers other types and failed checks; payroll pre-flight lists employees with unverified or rejected proofs. |
| YX-DOC-18 | Attachments of Special-class document types (e.g. **medical certificate**: Special, HR-verified, retained with the leave record it supports) are never shown to approvers who lack the Special class for that person; they see "certificate attached · verified / pending" only. The file stays reachable by the owner, HR verifiers and roles granted the class, and each view is audited (P02 YX-SEC-09). |
| YX-DOC-14 | Letters render with embedded fonts supporting all launch languages (English, Hindi, Tamil, Telugu). |
| YX-DOC-19 | After a death in service, each registered nominee (or a legal heir HR verifies) gets a **nominee login** on the alumni pattern (YX-DOC-16: OTP to the nominee's own email / mobile, read-only, audited) limited to the documents HR releases for claims: F&F statement, Form 16, service / relieving letter, nominee claim cover letters and the claim forms. The employee's own login is revoked immediately; nominee access ends when HR closes the claims or after the YX-DOC-16 period. |

---

## 7. UI
- **Employee workspace › Documents tab:** checklist with status chips, versions, verify / reject, request upload.
- **Letters:** issue a letter (pick type → template → preview with real data → approval → issue); bulk issue wizard (T5); issued letters list with reference numbers.
- **Templates:** list per letter type with source (uploaded Word / in-app editor); **upload Word** with validation report and preview; **in-app editor** (field picker, letterhead, conditionals, tables, language tabs); download as Word; field cheat-sheet; test render with a sample employee.
- **Me › My documents** (mobile + web): upload with camera, see status, download, share-link.
- **Public verify page** (branded per tenant).

---

## 8. Migration (exam app)
1. Storage: implement the S3 adapter behind `BlobStorageService`'s interface; copy existing blobs (test environment only, D10: no customer data) and switch.
2. `OfferTemplate` → letter templates of type "offer"; `Offer.pdfPath` → a document; click-to-accept → signature request with OTP evidence.
3. `CertificateTemplate` + public verification → letter type "certificate" + the common verify page.
4. `renderTemplateString` stays for simple notification text; letters use the new renderer.

---

## 9. Acceptance tests (samples)
- An employee cannot open another employee's PAN by guessing a file id; a signed link expires after its window (YX-DOC-01).
- An EICAR test file is quarantined and never downloadable (YX-DOC-02).
- A relieving letter with no relieving date fails with "missing: relieving date" (YX-DOC-07).
- A Tamil appointment letter renders correct Tamil glyphs in the PDF (YX-DOC-14).
- Re-issuing a corrected experience letter marks the old one superseded; its QR page says "superseded on …" (YX-DOC-09/11).
- A passport uploaded with expiry 30 Nov triggers reminders at the configured days (YX-DOC-06).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | PDF engine for letters | ✅ decided with Q3 (see §11) |
| Q2 | E-sign methods at launch | **Click-to-accept with OTP** for employees (built in); **company DSC** for issued letters and Form 16; **Aadhaar eSign** via a licensed provider as an optional paid add-on. |
| Q3 | How do companies make letter templates? | ✅ decided with Q1 (see §11) |
| Q4 | Which letters need approval before issue? | Defaults: offer, appointment, increment/promotion, transfer, relieving, experience, F&F, warning → **approval**; salary certificate / address proof / employment verification → **instant** (Q8). Tenant can change per type. |
| Q5 | QR verification on letters? | **Yes**, on every issued letter (public page with minimal data). |
| Q6 | Ex-employee access to their documents | **Yes**: alumni login (email/mobile OTP) to download payslips, Form 16 and letters for **7 years** after exit; full alumni portal stays in wave 6. |
| Q7 | Must HR verify uploaded ID and bank proofs? | **Yes for PAN, Aadhaar, bank proof, education/experience proofs** before they are used for payroll or statutory filings; other types optional. |
| Q8 | Self-service letters (salary certificate, address proof) | **Instant generation** with the entity's signatory image and QR verification; the tenant may switch a type to "needs HR approval". |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 + Q3 | **Word upload + in-app editor, one pipeline.** All templates are stored as .docx: companies upload their own Word letters with placeholders (edited in Word, re-uploaded) or create letters in the in-app editor (saves as .docx). Filling + **LibreOffice** PDF conversion runs in a YukthiX in-region worker with Indic fonts. Upload validation + mandatory sample preview; any template downloadable as Word; shipped library in both forms. Rule YX-DOC-15. | 24 Sep 2026 |
| Q2 | **E-sign at launch:** employee **click-to-accept with OTP** (built in; evidence sealed into the PDF); **company DSC** on issued letters and Form 16; **Aadhaar eSign via a licensed eSign provider as an optional paid add-on** (tenant enables per letter type). | 24 Sep 2026 |
| Q4 | **Approval defaults per letter type, tenant-changeable:** approval required for offer, appointment, increment/promotion, transfer, relieving, experience, F&F, warning/show-cause; instant for salary certificate, address proof, employment verification, NOC. Approvals run through P03. | 24 Sep 2026 |
| Q5 | **QR verification on by default for every letter type**; the tenant can switch it off per letter type (e.g. internal warning letters). The public page shows only company, letter type, employee name, issue date and current / superseded status. | 24 Sep 2026 |
| Q6 | **Alumni document access for 7 years after exit**: login by OTP to personal email/mobile; own payslips, Form 16 and issued letters only (read-only); ships with lifecycle in wave 4; full alumni portal stays wave 6 (§1.3.14). After 7 years access ends and retention rules apply. Rule YX-DOC-16. | 24 Sep 2026 |
| Q7 | **HR verification required for PAN, Aadhaar, bank proof, education and experience proofs** before they are used for payroll, bank payouts or statutory filings; payroll pre-run check flags unverified items. Other types optional; tenant can add verification to more types. Rule YX-DOC-17. | 24 Sep 2026 |
| Q8 | **Self-service certificates are instant** (salary certificate, address proof, employment verification, NOC): generated on request with the entity's authorised signatory image and QR verification, logged and visible to HR. The tenant can switch any of these types to "needs HR approval" (Q4 defaults). | 24 Sep 2026 |
| D9 | **Consistency fix:** document type **medical certificate** (Special class, HR verifies, approver sees verification status only, retention with the leave record); Special attachments on requests are never shown to approvers who lack the field class, who see "certificate attached · verified / pending". Rule YX-DOC-18. | 26 Sep 2026 |
| E (letters) | **Lifecycle-event letters (GAP-REGISTER E):** §4.3 library adds death-in-service letter to next of kin and nominee claim cover letters, absconding notice 1 / 2 and deemed-abandonment letter, contract extension / conversion letter, retirement and re-employment letters, maternity leave approval letter, deputation letter and rehire letter (starter templates, D17); **nominee limited document access** on the alumni pattern (YX-DOC-19, based on YX-DOC-16). | 26 Sep 2026 |
| F7 (consistency fix) | **Complete template library** (GAP-REGISTER F7) in [APX-F](APX-F-templates.md): 90 starter templates, adding termination, resignation acceptance, early release / buy-out, end of contract, bonus / incentive, loan sanction, retention-bonus / clawback agreement, disciplinary decision and appeal outcome, POSH acknowledgement and IC constitution / display notice, placement / deployment letter, **client GST tax invoice and credit note**, pre-boarding welcome / joining instructions, nominee letters, the statutory forms library (PF Form 11 / 2, ESIC Form 1, Gratuity Form F / L, Form 12BB, 12BA, 16, 16A, IW-1; placeholders), the **payslip layout template** (U33), ID card and admit card (placeholder). Rules **YX-DOC-20** (starter library, company copies never overwritten by starter updates), **YX-DOC-21** (restricted-area letters keep QR on but the verify page shows only "Confidential HR letter"), **YX-DOC-22** (legally mandatory content of statutory forms, GST invoices and wage slips is locked). | 26 Sep 2026 |
