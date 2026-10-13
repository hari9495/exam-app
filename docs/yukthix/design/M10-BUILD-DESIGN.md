# M10 · Recruitment / ATS · Build design

> **Status:** 🟡 Draft for the founder, 13 Oct 2026. The module decisions (Q1–Q8, R1, D3, E18, B8, C7, T8–T12, J9, J10, J13, J18, S9) were taken on 25–28 Sep 2026 in [M10](M10-ats.md). This doc turns the internal-hiring part into a reuse plan, tables, permissions, APIs, events, screens, tests and small pull requests. The founder questions are in §20.
> **Scope:** internal hiring:
> - requisitions with headcount and budget links;
> - job posting, the careers site and the job-board seam;
> - candidate profiles and dedupe;
> - the pipeline, interviews and scorecards, and assessments (linking T01–T08);
> - offers with approval, letter and e-sign, and the hand-off to onboarding;
> - referrals and agency access;
> - candidate communication, consent and retention, and reports;
> - AI only as a later seam.
> **Not in scope (a second M10 design):** the staffing desk, client portal, vendor portal, talent-CRM nurture sequences, AI interview, BGV, and the bulk campus day and bulk offers (Q4, Q5, Q7, Q8, C7, B8 nurture, J9). The mobile app is parked (no mobile planning here).
> **Order:** eight batches, **AT1 → AT8**.
> **Builds on:** the exam app's hiring product (most of what M10 needs already runs in production), P01 (masters, persons), P02 (scopes, field classes, consent, retention, external logins), P03 (approvals), P04 (channels, consents, templates), P05 (letters, e-sign), P09 (metrics), M01 (LIFE-2.09 hand-off, already built), M03 (CTC templates, one-time pay), T01–T08 (assessments).
> **Clean-room:** written in our own words from our own code, design docs and public law. No competitor text, screens or field names are copied. Frappe / ERPNext code is not read or copied.

---

## 1. How to read this doc
- **§2** records what is already decided.
- **§3** is the core of this design: what exists in the repo and, per capability, whether we **reuse** it as it is, **adapt** it into YukthiX, or **replace** it.
- **§4–§16** cover the model, rules, APIs and screens by area.
- **§17–§19** cover permissions, events and slices.
- **§20** holds the founder decisions.

Rules keep their M10 IDs (YX-ATS-01 …). New rules in this doc are YX-ATS-50 onwards.

## 2. Decisions this design follows

| Topic | Decision | Source |
|---|---|---|
| Headcount plan | Annual plan per department (positions by designation / grade / location + budget); in-plan requisitions get a short chain, outside plan or over budget an extra approval | M10 Q1 |
| Hand-off | Company chooses automatic or manual ("Ready to onboard") per entity; hand-off matrix by person type (new / internal / rehire / contractor) | M10 Q2, D3; **built in M01 LIFE-2.09** |
| Offers | Structured CTC from M03 templates, grade-range check with extra approval outside range, letter via P05, e-accept with OTP; versions supersede | M10 Q3, E18 |
| Retention | Non-hired candidates kept 12 months after last activity (company 6–36), consent-renewal email, then anonymised (stats kept) | M10 Q6 |
| Approvals | Requisition and offer approvals move to P03 | M10 "already decided", P03 |
| Letters | Offer and appointment letters are P05 .docx templates with OTP e-accept | P05 |
| Roles | `recruiter`, `hiring_manager`, `panel`, `auditor` become role templates; candidate visibility is a scope rule | P02 |
| Job boards | Company's own board accounts; generic feed today, India boards as connectors | M10 B8, YX-ATS-23 |
| Google for Jobs | Structured data and careers sitemap; closed jobs expire within a day | M10 S9, YX-ATS-45 |
| Internal applicants | Test result routed to the application, hidden from the current manager | M10 J13, T03 YX-DLV-23 |
| Offer conditions | Conditions with auto-lapse and pre-boarding unwind | M10 J10, YX-ATS-41 |
| AI | Advisory only; text-only to external AI; human decides | P10, M10 R1 |

## 3. What exists, and reuse / adapt / replace
The exam app's hiring product already runs about 35,000 lines of API code for hiring:
- candidates, jobs and pipelines;
- interviews with panels, slots, self-booking and Google / Microsoft calendar sync;
- offers with templates, approval, PDF and public accept;
- candidate email / SMS / WhatsApp with templates, batches and drip campaigns;
- the careers site (`/careers/[orgSlug]`) and public apply with résumé validation;
- easy-apply providers (LinkedIn, Indeed) and job boards (HTTP feed, LinkedIn, Indeed);
- referrals, agencies with a token portal (`/agency/[token]`), agency submissions and internal mobility;
- walk-in groups and campus drives;
- résumé parsing with embeddings, semantic search and duplicate pairs;
- AI fit scoring and AI scorecard drafts;
- HRIS export (BambooHR, Greenhouse, Lever, Workday, generic);
- versioned candidate consent, data rights (erase / export), custom fields, field permissions, record visibility and reports.

All its tables carry `organization_id` with **forced RLS and tenant isolation** (migration `20261005000001_tenant_rls`), plus a record-visibility policy on `pipeline_entries`. Its permissions are the older colon keys (`pipeline:manage`, `candidate:manage`, `pipelines:configure`, `approvals:configure`, `interview:view_assigned`, `candidate:data_rights`, …), and its screens live in `apps/web/app/v2` (recruiter and org-admin areas).

**Principle:** one hiring backend. YukthiX gets yx-ui screens and YukthiX permissions **on the same services and tables**. Nothing is rebuilt that works, and no second candidate table is created.

| Capability | What exists | Verdict | What changes |
|---|---|---|---|
| Candidates (one per email per company), profile, résumé parse | `candidates`, `candidate_profiles`, parse + embeddings | **Reuse** | yx-ui screens; add `person_id` (P01 persons) at offer stage (§7.4); phone normalised to E.164 |
| Semantic search, duplicate pairs | `candidate-search` (embeddings, `topSimilarPairs`) | **Reuse** | Duplicate review screen; **add merge** (missing, §7.2) |
| Jobs / requisitions | `jobs` with free-text department, headcount, salary range; requisition approval gate in the old engine | **Adapt** | P01 FKs (department, designation, grade, location, legal entity), plan line, `outside_plan`; approval on P03 (§5) |
| Headcount plan | — | **New** | §5 |
| Pipelines, stages, statuses, entries, rejection reasons, assignment | `pipeline*` (5,700 lines), record visibility | **Reuse** | yx-ui board and list; YukthiX scope keys (§17) |
| Interviews, panels, slots, self-booking, calendar sync, meeting links | `interviews`, `calendar-sync` | **Reuse** | yx-ui scheduling screens; panellist scorecards attach to the interview (§8.2) |
| Feedback / scorecards | `pipeline_feedback` (note + 1–5 rating); AI scorecard draft | **Adapt** | Structured scorecard templates with skills, weights, pass bar and recommendation (YX-ATS-05, U82). The old note + rating stays as "general feedback". The AI draft stays behind the AI seam (§15) |
| Assessments | Exams, invitations, proctoring, results; `job_exams` link | **Reuse** (T01–T08) | Results shown on the application; internal-applicant rule J13 (§9) |
| Approvals (requisition, offer) | `approval_chains`, `approval_requests` (old engine, two gates) | **Replace with P03** | Chains migrated to P03 request types `ats.requisition` / `ats.offer`; the old engine is retired once v2 uses P03 too (D3) |
| Offers | `offers` with free-text compensation, own template + PDF + token accept page | **Adapt** (data) + **Replace** (letter / accept) | Structured CTC, versions, person type, decline / withdraw / renege states (E18, D3). The letter and e-accept move to **P05** (templates, numbering, signatory, OTP e-sign with sealed acceptance copy). The old offer PDF / accept page is kept for v2 tenants until they move (D4) |
| Offer → employee hand-off | `offer.accepted` emitted; M01 `fromOffer` + Ready-to-onboard queue (LIFE-2.09); HRIS export adapters | **Reuse** | M10 supplies the prefill (person type, entity, designation, grade, location, start date, CTC draft) and listens for joiner status. HRIS export stays for ATS-only tenants |
| Careers site and public apply | `/careers/[orgSlug]`, `public-applications` (rate-limited, PDF checks) | **Adapt** | Per-entity branding from P01, P01 locations, languages (G1), Google for Jobs JSON-LD + sitemap (S9), ASCII slugs (U77 / U78), consent text from P02 |
| Easy apply, job boards | Providers: LinkedIn, Indeed, HTTP feed; `job_board_publications` | **Reuse** + extend | Board **seam** stays the provider interface; India boards (Naukri, Foundit, Shine) as adapters once accounts / APIs exist (D12); posting cost → `recruiting_costs` |
| Internal mobility | `internal-applications` | **Reuse** | Hand-off branch "internal" already goes to the P06 transfer (M01); manager-visibility rule (D13) |
| Walk-ins, campus drives | `walk-in`, `walk-in-groups`, `drives` | **Reuse** | yx-ui screens later. Bulk campus offers are outside this design (J9) |
| Referrals | `referrals` (referrer user, reward status) | **Adapt** | Employee "Refer someone" in YukthiX (Me); reward paid through M03 one-time pay (existing intake, §11) |
| Agencies | `agencies` (shared portal **token**), `agency_submissions` with duplicate flag | **Adapt** + **Replace** (access) | Agency contacts sign in with P02 external logins (OTP, scoped, expiring, audited; YX-SEC-21) instead of a bearer link. Job shares with visible fields, ownership window and fee terms (§12). Full vendor portal = C7, later |
| Candidate email / SMS / WhatsApp, templates, batches, drip | `candidate-emails`, `candidate-sms`, `candidate-whatsapp`, `bulk-candidate-email`, `drip`, `channel_consents` | **Reuse** | yx-ui composer; P04 quiet hours and consent rules already apply through `channel_consents`. Nurture sequences (B8) later |
| Consent, data rights | Versioned consent on candidates, `consent_records`, erase / export (`candidate:data_rights`) | **Reuse** + **Add** | **Automatic retention** (Q6) is missing: retention sweep, renewal email, anonymisation (§13) |
| Custom fields, field permissions, record visibility | Exist | **Reuse** | Mapped to P02 field classes for candidate fields (Confidential by default) |
| Reports, analytics, scheduled reports | `reports` (2,200 lines), `analytics` | **Adapt** | Hiring metrics registered in P09 (funnel, time to fill, source, offer acceptance, cost per hire); small-group suppression for diversity (§14) |
| AI (fit score, scorecard draft, parse) | `candidate-fit`, `interview-ai`, `ai` | **Reuse behind the seam** | Off by default for YukthiX tenants except parsing (D6); P10 rules |
| Screens | `apps/web/app/v2` (recruiter, org-admin) | **Replace for YukthiX** | yx-ui hiring screens in `/yx/hiring/*` on the same API; v2 keeps serving hiring-only customers, with no new features there (D1) |
| Permissions | Colon keys on fixed roles | **Adapt** | Scoped `ats.*` keys with the colon keys honoured as aliases (§17, D2) |

## 4. Where it lives
- **API:** the existing modules stay where they are. New code goes in `apps/api/src/hiring/`: headcount plans, requisition adapter, scorecard templates, offer composer, retention sweep, agency access and the hiring metrics registration. It calls the existing services and never copies them.
- **Web:** `apps/web/app/yx/(app)/hiring/*` pages.
- **UI:** yx-ui screens in `packages/yx-ui/src/screens/hiring/live`, with stories, screen tests and the affordance guard.
- **Public pages:** `/careers/[orgSlug]` and the candidate portal stay where they are and get the yx design tokens.

### 4.1 Changes needed in other modules (listed for their owners)

| # | Module | Change | Needed by |
|---|---|---|---|
| 1 | P03 | Request types `ats.requisition`, `ats.offer`; a migration that turns each enabled old chain into a P03 step list | AT2, AT6 |
| 2 | P05 | Starter letter types `offer`, `offer_revision`, `offer_withdrawal` (company edits); issue to a **person** linked to the candidate | AT6 |
| 3 | M03 | **Read-only** use of CTC templates and the pure `breakup()` function for the offer preview; referral bonus through the existing one-time pay intake (`source: 'm10'`). **No payroll code change**; if payroll prefers a service method for the preview, it is listed for the payroll owner | AT6, AT7 |
| 4 | M01 | None (LIFE-2.09 built). M10 adds the prefill fields to `offer.accepted` | AT6 |
| 5 | P09 | Hiring metric definitions | AT8 |
| 6 | P02 | External-login type `agency_contact` (exists in the catalogue as "external login"); field classes for candidate fields | AT7, AT1 |

## 5. Headcount plan and requisitions (AT2)
- **Plan:** a plan per department and financial year (`headcount_plans`) with lines (`headcount_plan_lines`: designation, grade, location, legal entity, count, budget). It is approved through P03 by HR and finance. Lines show **approved / committed (open requisitions) / filled**.
- **Requisition:** the existing `jobs` row gains the following columns. A job is a requisition until it is approved; then it can be published.
  - P01 FKs: department, designation, grade, location, legal entity;
  - `headcount_plan_line_id` or `outside_plan` with a reason;
  - `reason` (new position / replacement of employee X), `budget_amount`, `target_start`;
  - `hiring_manager_id` (exists) and recruiters.
- **Approval:** P03 `ats.requisition`. Steps:
  - inside the plan and inside the grade range: hiring manager's manager, then HR;
  - outside plan, over budget, or a salary range above the grade range: adds finance and the extra approver (default CFO / CEO, company setting).
- **Drawdown:** approval commits one position on the plan line. Hiring (offer accepted) fills it. Closing a job unfilled releases it. A **replacement** requisition names the leaver and does not draw on the plan (Q1).
- **Plan setting:** headcount plans are a company setting: `ats.headcount_plan` = `off` / `advisory` / `required` (D5). With `off`, requisitions still go through P03 but carry no plan line.
- **Migration:** existing jobs keep working. Their free-text department is matched to a P01 department where the name matches exactly, and HR fixes the rest on a "Link to masters" list.

## 6. Posting: careers site, job boards, apply (AT3)
- **Careers site:** the existing `/careers/[orgSlug]` with the following changes:
  - entity branding (logo, colours, about text) per legal entity;
  - P01 locations with city and remote flag;
  - filters by department and location;
  - G1 languages for the page chrome;
  - ASCII slugs (`/careers/acme/jobs/senior-accountant-chennai-7f3k`);
  - **Google for Jobs** JobPosting JSON-LD and a sitemap, and a closed job removed from both within a day (S9). The salary is shown only when the job sets `show_salary`.
- **Apply:** the existing public apply (résumé PDF checks, rate limits, duplicate by email). The page shows the P02 consent notice with its version, purpose and retention period, and the consent is stored per purpose: `application` (required) and `talent_pool` (optional). Screening questions use the existing custom fields.
- **Job-board seam:** the existing provider interface (`job-boards/providers`, `easy-apply/providers`) is the seam. Each board adapter implements post / refresh / close / pull applicants with the **company's own account** (credentials in the P10 secret store). Today: HTTP feed, LinkedIn, Indeed. Naukri, Foundit and Shine are added as adapters when the company has an account and the board offers an API (D12). Until then the HTTP feed and apply-by-link cover them. Each posting may carry a cost line (`recruiting_costs`).
- **Internal job board:** open jobs flagged `internal` show to employees under Me › Jobs (existing internal mobility), with the current manager rule (D13).

## 7. Candidates (AT4)

### 7.1 Profile
The existing candidate screens, rebuilt in yx-ui:
- contact, source and tags;
- résumé with parsed summary and skills;
- applications across jobs;
- assessments, interviews and scorecards;
- messages (email / SMS / WhatsApp threads);
- consents with versions;
- the retention date.

Candidate fields are **Confidential** (P02); date of birth, ID numbers and BGV are **Special** where held.

### 7.2 Dedupe and merge (rule YX-ATS-50)
- **Exact duplicates:** the same email is impossible within a company (unique key), and phone (E.164) matches are flagged on create.
- **Likely duplicates:** the existing embedding similarity (`topSimilarPairs`) plus a name + phone match feed a **Possible duplicates** list.
- **Merge** keeps one candidate:
  - The recruiter picks, field by field, which value stays.
  - Applications, messages, interviews, assessments, consents and files move to the kept record. If both candidates applied to the same job, the newer application closes as "merged".
  - The merged record keeps a tombstone (`merged_into_id`) so old links still resolve, and both histories show the merge.
  - Merge is **audited and not undoable** (D10).
  - A candidate under legal hold or with an accepted offer cannot be merged away.

### 7.3 Pools and hotlists
A **talent pool** is a named group (static, or saved search) of candidates who gave `talent_pool` consent. A **hotlist** is a short shortlist for a current need. Membership never extends retention beyond the consent. Campaigns and nurture sequences are out of scope (B8 later); the existing drip stays as is.

### 7.4 Candidate → person
A candidate is linked to a P01 **person** (YX-ORG-27 match on email / mobile / PAN) when the first **offer** is drafted, or earlier on a DSAR request, so that:
- P05 can issue the letter;
- the M01 hand-off and the P02 per-person DSAR (YX-SEC-36) see one person.

Before the offer stage a candidate has no person row (D11).

## 8. Pipeline, interviews and scorecards (AT5)

### 8.1 Pipeline
- The existing pipelines (per job, stages, statuses, rejection reasons, assignment) appear in yx-ui as a **board** (rich cards: name, current stage age, latest score, next step, owner; U81) and a **list**.
- **Bulk actions:** move, reject with reason and template, send assessment.
- **Record visibility** (existing policy) stays. YukthiX scopes (§17) decide who sees which jobs.
- **Rejection** asks for a reason (existing list) and offers the rejection template. Sending can be delayed (default 24 h) so a mistaken click can be undone.

### 8.2 Interviews
- **Scheduling** is reused as is: proposed slots or self-booking windows, panellists, time zone, calendar events and meeting links through the existing calendar sync.
- **The interview screen** shows the panel, the candidate's résumé, the scorecard to fill and earlier rounds' scorecards (see the visibility rule below).

### 8.3 Scorecards (rule YX-ATS-51)
- **Templates** (`scorecard_templates` + `scorecard_items`): skills or questions with a weight and a **pass bar**, attached to a job's interview round. A template can be started from the M06 competency library.
- **Panellist scorecard** (`scorecards`): a rating per item (company scale, default 1–4 with labels), evidence notes per item, an overall recommendation (strong no / no / yes / strong yes) and the computed weighted score against the pass bar.
- **Visibility:** an interviewer sees the other panellists' scorecards for the same round **only after submitting their own** (D7). The hiring manager and recruiters see all once submitted.
- **Next step:** when all scorecards are in, the stage card shows "passes / does not pass the bar" and the suggested next step (U82). A human moves the candidate.
- **Reminders:** a missing scorecard is chased (P04) at 24 h and 48 h after the interview, and the recruiter sees "waiting for scorecards".
- **Old feedback:** the existing note + rating (`pipeline_feedback`) stays as "general feedback".

## 9. Assessments (link T01–T08)
- **Attach:** a job attaches one or more exams through the existing `job_exams`. A stage can **send** a test automatically on entry (existing invitations). Results (score, sections, integrity flags from T04 / T05) show on the application with a link to the full report for people with `results:view` / `ats.assessment.view`.
- **Re-tests and attempts** follow the T03 / T05 rules. The proctoring evidence stays in the assessment engine, in region, under its own retention.
- **Internal applicants (J13):** the result goes to the application. The applicant's current manager never sees it, and is not told of the application until the offer stage unless the company changes this (D13).
- **External ATS connectors** (T05: send test from Greenhouse / Lever / Workday) are untouched.

## 10. Offers and hand-off (AT6)

### 10.1 Compose (rule YX-ATS-52)
An offer is drafted from an application:
1. Pick the **M03 CTC template** for the entity and grade, enter CTC (or monthly gross), joining bonus, variable and retention lines.
2. The **breakup preview** is computed with M03's own pure `breakup()` function on the template (read-only, behind the pay scope of the entity; employer costs shown). If the grade range is exceeded the offer is marked "outside range".
3. Choose designation, grade, location, entity, start date, expiry, conditions (J10: e.g. "degree certificate by joining", each with a due date and auto-lapse) and the P05 letter template.

Compensation data on offers is **Confidential** with the pay guard. Only users with `ats.offer.compensation.view` for the entity see amounts; other pipeline viewers see "Offer drafted" and the status.

### 10.2 Approve
P03 `ats.offer`:
- the hiring manager, then HR;
- finance as an extra step when outside range, over the requisition budget, or above a company threshold;
- re-approval when a revision changes CTC, grade or designation (E18).

The old offer-approval chain is migrated (§4.1 #1).

### 10.3 Letter and accept
- **Issue:** P05 issues the letter to the linked person (numbering, signatory, company DSC if set). The candidate gets a link to the existing candidate portal, which shows the letter and **e-accepts with OTP** (P05 sealed acceptance copy). Decline needs a reason from the M10 list (D3) plus an optional note.
- **Versions:** a revision supersedes the previous version, and the old letter is withdrawn through P05 (E18).
- **Expiry:** at expiry the offer lapses; the recruiter can extend it with a reason.

### 10.4 After acceptance
- **States:** accepted → joined, or reneged (the candidate does not join) or withdrawn (the company withdraws, with a reason and a P05 withdrawal letter).
- **Reneged / withdrawn** run the M01 pre-boarding unwind (YX-LC-12): the plan line is released and the requisition reopens.
- **Conditions** that lapse follow J10 (auto-lapse with the unwind, after a warning to the recruiter).
- **Hand-off:** `offer.accepted` (existing event) now carries the prefill: person type from the D3 match (new / internal / rehire / contractor), entity, department, designation, grade, location, start date, CTC draft reference and offer id. M01 LIFE-2.09 does the rest in auto or manual mode. Joining marks the offer **joined**, fills the plan line and closes the requisition when its count is met.
- **ATS-only tenants** keep the existing HRIS export adapters instead.

## 11. Referrals (AT7)
- **Refer someone:** employees refer from Me › Refer someone, or from an internal job card. The referral records the referrer (an employee), the job and the candidate's consent (the candidate receives a "you were referred, confirm your details" link before anything else happens; P02).
- **Duplicates:** a candidate already in the pipeline for that job within the ownership window (default 6 months) stays with the first source. The referrer is told "already in process" without details.
- **Reward:** a company referral policy (amount by grade or job, paid after N days of the hire's service, default 90; D9). When due, a one-time pay line goes through M03's existing intake (`source: 'm10'`, component `referral_bonus` from the company's components) and passes payroll's own approval. **No payroll code change.**
- **The referrer sees** their referrals with stage names only, never scores or feedback.

## 12. Agency access (AT7)
- **Sign-in:** agency contacts sign in with a **P02 external login** (email OTP, scoped to their agency and shared jobs, expiring, audited, not a billed seat). This replaces the existing shared portal **token** link; existing tokens keep working for 30 days after the company switches and then expire (D8).
- **Job share:** a job is shared with an agency with the fields the agency may see (client-facing title, location, salary band or hidden), a submission limit, an expiry and the **fee terms** (percent of first-year CTC or fixed, a replacement guarantee in days) from the agency agreement (a P05 document).
- **Submissions:** the existing duplicate check (email / phone / embedding) decides ownership for the **ownership window** (default 6 months). Submissions need the agency's right-to-represent confirmation and the candidate's consent link. Agency candidates then flow through the normal pipeline. The agency sees stage names and the final outcome only.
- **Fees:** an accepted offer from an agency candidate creates a fee entry in `recruiting_costs` when the candidate joins. Payment runs through accounts payable (outside YukthiX) or the M03 consultant payout where the agency is registered as a consultant (no payroll change).

## 13. Candidate communication, consent and retention (AT4, AT8)
- **Messages:** the existing email / SMS / WhatsApp modules and templates are used from a yx-ui composer on the candidate and in bulk.
  - Every send respects `channel_consents` (P04 YX-NTF-14) and quiet hours (P04).
  - Candidate-facing variables never include another candidate's data or internal notes.
  - Interview invites and reminders, assessment invites, status updates, offer links and rejection messages use the existing templates, extended with the G1 languages.
- **Consent:** stored per purpose (`application`, `talent_pool`, `assessment`, `nurture` later) with the notice version, source and time (existing `consent_records`). Withdrawing `talent_pool` takes the candidate out of pools at once.
- **Retention (rule YX-ATS-53, M10 Q6):** a daily sweep.
  - **Who:** non-hired candidates with no activity for the company's period (default 12 months; 6–36).
  - **First:** a **consent-renewal** email 30 days before the end ("stay in our talent pool?"). Renewing extends by the period.
  - **At the end:** the candidate is **anonymised**. Name, contact, résumé, parsed text, embeddings, messages, recordings and free-text notes are erased. Funnel facts are kept (job, stage reached, source, dates, outcome), together with assessment scores and (where needed for audit) the hashed email.
  - **Exceptions:** a candidate under legal hold, with an open dispute, or linked to an employee (hired) is skipped.
  - **Erasure on request** uses the existing data-rights flow and P02 YX-SEC-36.
  - **Proctoring evidence** keeps its own T05 retention.
- **Minors (E16):** an applicant under 18 needs guardian consent before any assessment. Their records are never used for pools.

## 14. Reports (AT8)
Hiring metrics are registered in P09 (one definition each, used by the screens and exports):
- funnel by stage;
- pass-through rate per stage;
- time to fill (approval → acceptance) and time to hire (application → acceptance);
- source effectiveness (applicants, hires, cost per hire by source);
- offer acceptance rate and decline reasons;
- interviewer load and scorecard timeliness;
- requisition ageing and plan vs actual;
- referral and agency performance;
- diversity at each stage, from candidate-supplied voluntary data only, with **small-group suppression** (YX-SEC-14) for every viewer below individual-level access.

Reports respect scopes (§17). CSV exports defuse formulas, as in M06 PM6. The existing `reports` and `scheduled-reports` modules keep serving v2. YukthiX screens read the P09 metrics.

## 15. AI (a later seam, nothing new built)
The existing AI features stay behind P10 rules:
- résumé parsing and embeddings: **on**, since they are needed for dedupe and search;
- **AI fit score** and **AI scorecard draft**: **off by default** for YukthiX tenants, a company switch, advisory only, never shown to the candidate, never a sole reason to reject (D6).

Nothing new is built here. The AI interview (Q4), notetaker (T9), reference checks (T11) and rediscovery (T12) belong to the second M10 design, behind the same seam (`ats.ai.*` switches, text-only to external AI, in-region recordings, human decides).

## 16. Data model

### 16.1 Rules for every new or changed table
- `organization_id` + **forced RLS** + `tenant_isolation` (the existing pattern).
- `support_session_excluded` (RESTRICTIVE) on offers, scorecards, plan lines with budgets, and referral rewards, so YukthiX support never reads them. Candidate tables stay masked in support sessions (P02 YX-SEC-20) rather than excluded, because support needs to debug applications (D14).
- `REVOKE DELETE, TRUNCATE` from `app_runtime` on decision tables (offers, scorecards, plan approvals, merges). Anonymisation **updates** candidate rows; it never deletes them.
- Compensation columns on offers sit behind the pay guard (`withPayScope`, entity-scoped), like M06 PM7 proposals.

### 16.2 New and changed tables

| Table | Main columns | Notes |
|---|---|---|
| `headcount_plans` | department, FY, legal entity, status, wf_request_id, version | P03 approval |
| `headcount_plan_lines` | plan, designation, grade, location, count, budget, committed, filled | Budget columns Confidential |
| `jobs` (change) | + department_id, designation_id, grade_id, location_id, legal_entity_id, headcount_plan_line_id, outside_plan + reason, replacement_of_employee_id, budget_amount, target_start, internal (bool), show_salary, wf_request_id, slug | P01 FKs (U79) |
| `scorecard_templates`, `scorecard_items` | name, scale; item text, skill ref, weight, pass bar | |
| `scorecards` | interview, panellist, items (rating, notes), recommendation, weighted score, submitted_at | Never deleted; edits after submit create a new version with reason |
| `candidates` (change) | + phone_e164, person_id, merged_into_id, retention_until, anonymised_at, date_of_birth, guardian consent ref | |
| `candidate_merges` | kept, merged, field choices JSON, by, at | Append-only |
| `talent_pools`, `talent_pool_members`, `hotlists`, `hotlist_members` | name, type (static / saved search), owner; member, added by, source | B8 base (no campaigns) |
| `offers` (change) | + version, supersedes_offer_id, compensation (template id, CTC, lines JSON, breakup snapshot), grade_id, designation_id, location_id, legal_entity_id, outside_range, person_type, conditions JSON, letter_id, wf_request_id, decline_reason + note, withdrawn_reason / by, reneged_at, joined_at | Pay guard on compensation |
| `referrals` (change) | + referrer_employee_id, consent_confirmed_at, ownership_until, reward_policy_id, reward_due_on, payroll_intake_ref | |
| `referral_policies` | amount rules by grade / job, service days, active | Company |
| `agencies` (change) | + agreement document id, fee model, replacement days, ownership months, status | Token column kept for v2, retired after switch |
| `agency_contacts` | agency, external login ref, name, email | P02 external login |
| `agency_job_shares` | job, agency, visible fields, submission limit, expires, fee terms | |
| `agency_submissions` (change) | + share_id, contact_id, right_to_represent_at, candidate_consent_at, ownership_until | |
| `recruiting_costs` | job (nullable), source, cost type, amount, currency, period, origin, entered_by | M10 H1 |
| `candidate_retention_runs` | run date, renewals sent, anonymised count, skipped (hold) | Ops log, no personal data |

Settings keys (company, entity where noted):

| Key | Values | Default |
|---|---|---|
| `ats.headcount_plan` | off / advisory / required | advisory (D5) |
| `ats.retention_months` | 6–36 | 12 |
| `ats.reject_delay_hours` | 0 / 24 / 48 | 24 |
| `ats.ownership_months` | 3 / 6 / 12 | 6 |
| `ats.ai.fit_score` | on / off | off |
| `ats.ai.scorecard_draft` | on / off | off |
| `ats.internal.manager_notice` | at_offer / at_application / never | at_offer (D13) |
| `ats.offer.finance_threshold` (entity) | amount | none |

## 17. Permissions (P02)

### 17.1 New scoped keys
Each new key is scoped by legal entity / department / location unless stated:

| Key | Who (template) | What |
|---|---|---|
| `ats.headcount.manage` | HR Admin, Finance | Plans and lines |
| `ats.requisition.raise` | Hiring managers (implicit for managers through their chain), HR | Raise requisitions for their scope |
| `ats.job.manage` | Recruiter | Jobs, pipelines, postings, careers content |
| `ats.candidate.view` · `ats.candidate.manage` | Recruiter (manage), Hiring manager (view for own jobs, implicit) | Candidates and applications in scope |
| `ats.interview.schedule` | Recruiter, Coordinator | Scheduling and panels |
| *(implicit)* | Panellists | Their assigned interviews and scorecards (as `interview:view_assigned`) |
| `ats.assessment.view` | Recruiter, Hiring manager | Assessment results on applications |
| `ats.offer.manage` | Recruiter, HR | Draft, send, withdraw offers |
| `ats.offer.compensation.view` | HR, Comp approvers (entity scope) | Offer amounts (pay guard) |
| `ats.referral.manage` | HR | Referral policies and rewards |
| `ats.agency.manage` | Recruiter lead, HR | Agencies, contacts, job shares |
| `ats.report.view` | HR, Recruiter lead | Hiring reports in scope |
| `ats.candidate.data_rights` | Privacy / HR Admin | Erase, export, legal hold |

### 17.2 Legacy keys and MFA
- **Legacy keys:** the colon keys stay valid. A role holding `pipeline:manage` passes `ats.candidate.manage` / `ats.job.manage` checks company-wide, `candidate:view` maps to `ats.candidate.view`, and so on, through an alias table in the RBAC resolver (D2). New YukthiX role templates use the scoped keys.
- **MFA-sensitive:** `ats.offer.compensation.view`, `ats.candidate.data_rights`, `ats.headcount.manage`.

## 18. APIs and events

### 18.1 APIs
Existing routes stay. New or changed routes, all under `/api/v1`:

| Area | Routes |
|---|---|
| Plans | `GET,POST /hiring/plans` · `GET,PUT /hiring/plans/:id` · `POST /hiring/plans/:id/submit` |
| Requisitions | `POST /hiring/requisitions` (creates a job in requisition state) · `POST /hiring/requisitions/:id/submit` · `GET /hiring/requisitions?view=mine/team/scope` |
| Scorecards | `GET,POST /hiring/scorecard-templates` · `GET /interviews/:id/scorecards` · `PUT /interviews/:id/scorecards/me` · `POST /interviews/:id/scorecards/me/submit` |
| Candidates | `GET /hiring/duplicates` · `POST /candidates/:id/merge` · pools and hotlists CRUD |
| Offers | `POST /hiring/offers/preview` (breakup) · `POST /hiring/offers` · `POST /hiring/offers/:id/submit` · `/send` · `/revise` · `/withdraw` · `/renege` · `/extend` |
| Referrals | `POST /me/referrals` · `GET /me/referrals` · policies CRUD |
| Agencies | `/hiring/agencies`, `/hiring/agencies/:id/contacts`, `/hiring/job-shares`; agency portal routes under the external-login guard |
| Reports | `GET /hiring/reports/:kind?from&to&scope` and `/csv` |
| Retention | `POST /hiring/retention/run` (ops) |

### 18.2 Events
Events go to the existing system-events / webhook catalogue (P11):
- `ats.requisition.submitted / approved / rejected`;
- `ats.job.published / closed`;
- `ats.application.created`;
- `ats.stage.changed`;
- `ats.interview.scheduled / cancelled`;
- `ats.scorecard.submitted`;
- `ats.offer.approved / sent / accepted / declined / withdrawn / reneged / lapsed / joined`;
- `ats.candidate.merged / anonymised`;
- `ats.referral.reward_due`.

`offer.accepted` keeps its current name for existing webhook consumers and gains the prefill fields.

## 19. Slices (batches; each ends with typecheck, unit, the batch e2e and the RLS suite, screen tests and stories, the affordance guard, web tests, Playwright on the demo and a fresh-database migration)

### Batch AT1 · Foundations (5 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-1.01 | `ats.*` keys, legacy-key alias table in the RBAC resolver, role templates (Recruiter, Hiring manager, Panel, Coordinator), MFA list | Unit: alias resolution; e2e: a legacy `pipeline:manage` role still moves candidates; a scoped recruiter sees only their entity's jobs |
| AT-1.02 | Support-session exclusion / masking per §16.1; P02 field classes for candidate fields | RLS e2e: support session cannot read offers / scorecards; candidate phone masked |
| AT-1.03 | yx-ui hiring shell: jobs list, candidates list, candidate profile (read) on existing APIs; nav "Hiring" | Screen tests; Playwright: recruiter opens a candidate |
| AT-1.04 | Candidate phone E.164 normalisation + backfill; events catalogue entries | Unit; migration test on sample data |
| AT-1.05 | Link jobs to P01 masters: columns, "Link to masters" screen | e2e: exact-name match backfill; unmatched listed |

### Batch AT2 · Headcount plan and requisitions (4 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-2.01 | Plans and lines, P03 approval, approved / committed / filled | e2e: plan approval by HR then finance; RLS |
| AT-2.02 | Requisition raise (managers implicit), P03 `ats.requisition` with in-plan vs outside-plan steps | e2e: in-plan → 2 steps; outside plan → extra approver; a manager cannot raise outside their department |
| AT-2.03 | Migrate old requisition chains to P03; retire the gate for YukthiX tenants | Migration test: an enabled old chain becomes the same P03 steps |
| AT-2.04 | Drawdown, release on close, replacement requisitions | e2e: commit on approval, fill on join, release on close |

### Batch AT3 · Posting (4 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-3.01 | Careers site: entity branding, P01 locations, filters, slugs, languages | Playwright on the demo careers page; slug ASCII test |
| AT-3.02 | Google for Jobs JSON-LD, sitemap, expiry of closed jobs | Unit: schema fields; e2e: closed job gone from sitemap |
| AT-3.03 | Apply with P02 consent per purpose (application required, talent pool optional) | e2e: consent rows with notice version; no talent-pool consent → never in pools |
| AT-3.04 | Job-board seam screen (accounts, post / close per board via existing providers), posting costs | e2e with provider fakes; cost line written |

### Batch AT4 · Candidates, consent, retention (4 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-4.01 | Possible duplicates list (embeddings + name / phone) | e2e: two near-identical candidates listed |
| AT-4.02 | Merge with field choice, tombstone, history; blocked under hold / accepted offer | e2e: applications move; same-job applications close one; audit row; DELETE refused |
| AT-4.03 | Talent pools and hotlists (consent-gated) | e2e: withdrawing consent removes from pools |
| AT-4.04 | Retention sweep: renewal email, renewal extends, anonymisation, skips (hold, hired) | e2e with a fake clock: renewal at −30 days; anonymised fields empty, funnel facts kept |

### Batch AT5 · Pipeline, interviews, scorecards, assessments (5 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-5.01 | yx-ui pipeline board and list, bulk actions, delayed rejection with undo | Playwright: drag a card; undo a rejection within the delay |
| AT-5.02 | Interview scheduling screens on the existing API (slots, self-booking, calendar) | Playwright: schedule with two panellists |
| AT-5.03 | Scorecard templates and items (from M06 competencies) | Screen tests |
| AT-5.04 | Panellist scorecards, blind until own submitted, pass-bar result, reminders | e2e: panellist B cannot read A's scorecard before submitting; result computed; reminder at 24 h |
| AT-5.05 | Assessment results on applications; auto-send on stage entry; internal applicant rule (J13) | e2e: current manager cannot see an internal applicant's result |

### Batch AT6 · Offers and hand-off (5 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-6.01 | Offer composer with M03 template breakup preview (read-only), outside-range flag, conditions | e2e: preview equals M03's breakup for the same CTC; amounts hidden without `ats.offer.compensation.view` |
| AT-6.02 | P03 `ats.offer` (finance step when outside range / over budget), migration of old offer chains | e2e: outside range adds finance; old chain migrated |
| AT-6.03 | P05 letter issue to the linked person (YX-ORG-27 match), portal e-accept with OTP, decline reasons | e2e: accept with OTP creates the sealed copy; decline needs a reason |
| AT-6.04 | Versions, extend, withdraw (letter), renege, lapse of conditions with M01 unwind | e2e: revision with new CTC re-approves; withdrawal unwinds pre-boarding and reopens the requisition |
| AT-6.05 | `offer.accepted` prefill and person type → M01 LIFE-2.09; joined status fills the plan line | e2e: auto mode creates the joiner with prefilled designation / grade / start; internal → transfer path |

### Batch AT7 · Referrals and agencies (4 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-7.01 | Me › Refer someone, candidate confirmation link, ownership window | e2e: second referral of the same person within 6 months keeps the first |
| AT-7.02 | Referral policies and reward through M03 one-time intake after N days | e2e: reward line created after 90 days; payroll approval still required |
| AT-7.03 | Agency contacts on P02 external logins; token links expire 30 days after the switch | e2e: OTP sign-in scoped to shared jobs; old token refused after expiry |
| AT-7.04 | Job shares (visible fields, limits, fee terms), submissions with right-to-represent and consent, fee into `recruiting_costs` on joining | e2e: duplicate submission held by the first owner; agency sees stage names only |

### Batch AT8 · Communication and reports (3 slices)

| ID | Slice | Tests |
|---|---|---|
| AT-8.01 | yx-ui message composer (single and bulk) on the existing email / SMS / WhatsApp modules; G1 languages for templates | e2e: no send without channel consent; quiet hours hold SMS |
| AT-8.02 | P09 hiring metrics and report screens with CSV | e2e: funnel totals equal applications; formula cells defused |
| AT-8.03 | Diversity report with suppression; cost per hire | e2e: a stage with 3 people suppressed |

Total: 34 slices. **AT1 → AT6** give a complete internal hiring flow from plan to joiner. AT7 and AT8 complete the scope.

## 20. Decisions for the founder
Short questions, each with the recommended default.

| # | Question | Recommended default |
|---|---|---|
| **D1** | The hiring product already has its own screens (v2). Do we rebuild them in YukthiX? | **Yes, YukthiX gets new hiring screens on the same backend.** v2 keeps working for hiring-only customers, but new features land only in YukthiX. We decide later when v2 customers move. |
| **D2** | Keep the old permission names working? | **Yes.** Old keys keep working; new YukthiX roles use scoped `ats.*` keys (by entity / department). |
| **D3** | Move requisition and offer approvals to the YukthiX approval engine? | **Yes, migrate the existing chains automatically**, then retire the old engine once v2 uses it too. |
| **D4** | Offer letters: old offer templates or YukthiX letters with e-sign? | **YukthiX letters (P05) with OTP e-accept** for YukthiX customers; old templates are converted into P05 drafts. v2 keeps the old page until it moves. |
| **D5** | Must every hire be in an approved headcount plan? | **Advisory by default:** requisitions show plan status, and outside-plan ones need the extra approver. Companies can switch the plan off or make it required. |
| **D6** | The existing AI features (fit score, AI scorecard draft): on for YukthiX customers? | **Résumé parsing on** (needed for duplicates and search); **fit score and AI scorecard draft off by default**, company switch, advisory only. |
| **D7** | Can interviewers see each other's scorecards? | **Only after submitting their own**, so nobody copies the first opinion. |
| **D8** | Agencies today use a shared link. Change to sign-in? | **Yes, agency contacts sign in with a one-time code**; old links expire 30 days after the company switches. Candidate ownership lasts 6 months. |
| **D9** | When is a referral bonus paid? | **After the hire completes 90 days**, through payroll's normal one-time pay approval; company sets amounts and days. |
| **D10** | Can a candidate merge be undone? | **No, but it is fully recorded** (who chose which field), and merged links still lead to the kept candidate. |
| **D11** | When does a candidate become a "person" in YukthiX? | **When the first offer is drafted** (or on a data request), not at application, to keep the person list clean. |
| **D12** | Which job boards first? | **Keep LinkedIn and Indeed (already built).** Add Naukri first when a customer gives us an account with API access, then Foundit and Shine. Until then, apply links and the feed. |
| **D13** | Is an internal applicant's current manager told? | **Only when the applicant reaches the offer stage**; company may change it. The manager never sees test results. |
| **D14** | Can YukthiX support staff see hiring data during a support session? | **Offers, scorecards, budgets and referral rewards: never. Candidate details: masked** (support may need to fix an application). |

## 21. Change log

| Date | Change |
|---|---|
| 13 Oct 2026 | First draft: reuse / adapt / replace table for the existing hiring product, headcount plans and requisitions on P03, careers site and job-board seam, candidates with dedupe, merge, pools, consent and retention, pipeline / interviews / scorecards, assessments link, offers with M03 breakup, P03, P05 e-sign and the M01 hand-off, referrals, agency logins and job shares, communication, P09 reports, AI seam, data model, permissions, APIs, events, 34 slices in batches AT1–AT8, founder decisions D1–D14. |
