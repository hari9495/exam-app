# M10 · ATS: Internal Hiring, Staffing Desk & Client Helpdesk

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026:** talent CRM, job-board connectors and panel auto-slotting (GAP B8); vendor / sub-vendor portal for the staffing desk (GAP C7, reversing the spec's "out of scope"); §11 B8 / C7. **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** identity chain across hiring and deepfake partner check (YX-ATS-32; §11 T10). Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:**
> - spec §1.2 (shared capabilities §1.2.1, internal ATS §1.2.2, external staffing ATS §1.2.3, client helpdesk §1.2.4);
> - Frappe reference [08](../reference/frappe-hrms-functional-spec/08-recruitment.md), questions 1–6;
> - UI reference 08 (U77–U83);
> - [exam-app reuse inventory §2](../reference/exam-app-reuse-inventory.md).
>
> **Build wave:** 7, after HRMS wave 5 (spec §4, P2-6). **The internal ATS already exists in the exam app.** This doc defines the **deltas**: what we keep, what we change so it becomes part of HRMS, and what is new.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Tenancy | `organization_id` is kept; RLS; departments, designations, grades and locations are P01 masters (they replace `Job.department` free text) | P01 |
| Roles | Data-driven roles; `recruiter`, `hiring_manager`, `panel` and `auditor` become role templates; candidate visibility becomes a scope rule | P02 |
| Approvals | Requisition and offer approvals move onto the generalised P03 engine | P03 |
| Notifications and WhatsApp | The company's own number | P04 |
| Letters and e-sign | Offer and appointment letters as .docx templates, with OTP click-to-accept | P05 |
| AI | Managed key + bring-your-own; data tiered by sensitivity | P10 Q1/Q2 |
| Candidate → employee | The offer is one of the 3 onboarding sources; pre-boarding starts automatically on acceptance or after HR's **Create employee**, per the Q2 setting | M01 Q1/Q2 |
| Cost per hire | Metric definition | P09 Q3 |
| Referral bonus | Paid through payroll one-time pay | M03 |
| Timesheets | Basic timesheets exist in M02 §B7; the staffing desk bills from them | M02 |
| Assessments | Proctoring engine (§1.1), which already scores candidates | exam app |
| Inbound assessment connector for **external** ATSs (Greenhouse, Lever, Workday, SAP SF: send test from a stage, results back) | Designed in T05, not here; reference only | GAP B6 → T05 |
| Calendar free/busy and meeting links | Google / Microsoft OAuth; reused for panel auto-slotting (YX-ATS-24) | P10 §B |
| Consultant payouts with TDS 194C / 194J, 26Q, Form 16A | Reused for vendor payouts (YX-ATS-29) | M03 A8, YX-TAX-16/17, YX-PAY-37/38 |
| External / limited logins | OTP, scoped to named records, not billed, expiring, audited; used for vendor contacts | P02 §4.7, YX-SEC-21 |

---

## 1. Purpose & scope
One hiring system that:
1. Lets departments request hires against a plan.
2. Lets recruiters source, assess, interview and offer.
3. Creates the employee in HRMS on acceptance (automatic mode) or when HR clicks **Create employee** (manual mode), per entity (Q2).
4. Lets staffing companies run a **client delivery desk**: submissions, placements, contractors and billing.

## 2. What exists today (exam app, `origin/main`) — keep / change / add

| Capability | Today | M10 |
|---|---|---|
| Resume parsing, dedup (embeddings), talent pool, semantic search | Done | **Keep** |
| Candidate merge, hotlist, bench | Missing | **Add**: merge with field-level choice + audit; hotlists (named shortlists); bench = available placed contractors (§1.2.3) |
| Candidate portal | Magic link, status, résumé | **Extend**: multi-document upload (P05 vault), offer / pre-boarding tasks, interview self-booking (exists) |
| Consent and retention | Versioned consent, erase / export | **Add** automatic retention (Q6) |
| Calendar sync, panel, scorecards | Done | **Extend**: skill-based scorecards with pass bar and next-step prompt (fixes U82) |
| AI first round | Only an interview kit (questions and notes) | **Add** (Q4) |
| BGV | Missing | **Add** (Q5) |
| Requisitions + approval gate | Partial; `Job.department` is free text | **Change**: link to P01 department / designation / grade / location; P03 chain; **headcount plan** (Q1) (fixes U79) |
| Career page, job boards, Easy Apply, referrals, internal mobility | Done | **Keep**; ASCII slugs, public-friendly fields (fixes U77, U78) |
| Offers + templates + e-accept | Done (CTC as template text) | **Change**: structured CTC from M03 templates (Q3) (fixes U83) |
| Hire hand-off | Push to external HRIS only | **Add** internal employee creation (Q2) and **keep** external HRIS adapters for ATS-only customers |
| Pipelines | Configurable per job | **Keep**; rich cards (fixes U81); opaque IDs and human names (fixes U80) |
| External staffing (§1.2.3), client helpdesk (§1.2.4) | Missing | **New** (Q7, Q8) |
| Recruiter productivity dashboard | Partial | **Add** via P09 metrics |
| Talent CRM (campaigns, nurture sequences), sourcing extension | Missing | **New** (B8, YX-ATS-20/21/22) |
| Job-board connectors (Naukri, Shine, Foundit, LinkedIn, Indeed) | Generic job-board feed only | **Add** (B8, YX-ATS-23) |
| Panel auto-slotting | Self-booking of offered slots only | **Add** (B8, YX-ATS-24) |
| Vendor / sub-vendor portal | Missing | **New** (C7, YX-ATS-25…30) |

## 3. Concepts
- **Headcount plan:** per department × FY. It sets approved positions (by designation, grade and location) and a budget. Requisitions draw it down (Q1).
- **Requisition / job:** it is linked to the plan, or flagged "outside plan". It has a hiring manager, recruiters, a pipeline template and a pay range from the grade (M06 Q6 ranges).
- **Candidate:** one person across all jobs (dedup by email, phone and embedding similarity). Consent is recorded per purpose.
- **Application / pipeline entry:** a candidate × job, holding stage, source, scores (assessment, AI interview, panel) and history.
- **Scorecard:** skills from the job (and from M06 competencies), each with a rating, a pass bar and a recommendation.
- **Offer:** a structured compensation proposal built from an M03 template with CTC (Q3). It has approvals, a letter, e-accept and an expiry.
- **Client (staffing):** a customer company with contacts, contracts, rate cards and SLAs.
- **Client job / submission:** a job under a client, and a candidate submitted to a client contact with a bill rate.
- **Placement:** a candidate placed at a client under a contract. It has start and end dates, a pay rate, a bill rate and margin, and **becomes a contractor employee** in HRMS (P01 employment type "contract – deployed") for timesheets and payroll.
- **Client ticket:** a helpdesk ticket raised by a client contact (M08 engine, Q8).
- **Talent pool / hotlist (B8):** a **pool** is a standing group of candidates (static, or dynamic from a saved search) kept warm over time; a **hotlist** is a short named shortlist for a current need. Both respect consent and retention (YX-ATS-09).
- **Campaign / nurture sequence (B8):** a one-off message (campaign) or a timed series of steps (sequence) to a pool or hotlist by email and / or WhatsApp, sent only with channel consent (YX-ATS-20).
- **Sourced profile (B8):** a profile a recruiter captured with the browser extension from LinkedIn or Naukri; it stays in "sourced – pending consent" until the candidate responds (YX-ATS-22).
- **Job posting (B8):** a job published to a board through the **company's own board account** (Naukri, Shine, Foundit, LinkedIn, Indeed), with its external id, status and cost (YX-ATS-23).
- **Vendor (C7):** a staffing agency or sub-vendor that supplies candidates to the tenant's staffing desk (or to internal hiring). It has a register entry (PAN, GSTIN, verified bank, agreement, TDS section), contacts with a limited login, a rate card and a scorecard.
- **Job share (C7):** a job shared with named vendors, with a **rate cap**, submission limit, expiry and the fields the vendor may see (YX-ATS-26).
- **Vendor submission (C7):** a candidate a vendor submits against a job share, checked for duplicates and ownership (YX-ATS-27).
- **Vendor-supplied placement (C7):** a placement where the worker stays on the vendor's payroll: no HRMS employment is created; the vendor is paid at its rate against client-approved timesheets and invoices through the M03 consultant payout (YX-ATS-28/29).
- **Hand-off matrix (D3):** on acceptance (or **Create employee**), the hand-off branches by person type. The type is found by matching PAN, email and mobile against **employees** (active, pre-boarding and exited) before anything is created:

  | Person type | Match | What the hand-off does | Requisition |
  |---|---|---|---|
  | **New person** | No employee match | New employee (pre-boarding) + employment + assignment + draft compensation + pre-boarding tasks (YX-ATS-07, M01 §3.5) | Filled on joining |
  | **Internal employee** | Active employee (internal-mobility application) | **No new employee or employment:** a P06 transfer / promotion on the existing record, effective on a **release date agreed with the current manager** (M01 §3.3) | Filled on acceptance |
  | **Alumni rehire** | Exited employee | **New employment on the existing employee record** (`employments.rehire_of`, P01 YX-ORG-19), pre-filled from the old record; HR picks what continues (service, leave, gratuity, code, probation) in the impact preview; rehire-eligibility flag shown first (M01 YX-LC-10) | Filled on joining |
  | **Contractor conversion** | Active deployed / contract employment | P06 **employment-type change** on the existing record (placement ended if one is running) | Filled on the effective date |

  A match on only some keys (e.g. same email, different PAN) stops the hand-off for HR to confirm the match or proceed as a new person; it never fails silently on the PAN-duplicate check (M01 YX-EMP-02).
- **Offer states after acceptance (D3):** **accepted → joined**, or **reneged** (candidate backs out / did not join) or **withdrawn** (company withdraws after acceptance: manual, reason mandatory, withdrawal letter via P05). Reneged and withdrawn run the M01 pre-boarding unwind (YX-LC-12): the plan line is released and the requisition reopens. Declines (before or after acceptance) carry a **decline reason**: compensation, counter-offer from current employer, another offer, location, role / growth, joining-date conflict, personal / family, BGV / documents, no response, other (+ note). Reasons feed offer-acceptance analytics (P09).

## 4. Data model (additions and changes)

| Table | Purpose |
|---|---|
| `headcount_plans` + `headcount_plan_lines` | Department, designation, grade, location, count, budget, FY, status (approved via P03) |
| `jobs` (change) | + `department_id`, `designation_id`, `grade_id`, `location_id`, `legal_entity_id`, `headcount_plan_line_id`, `outside_plan`, `client_job` flag |
| `scorecard_templates` + `scorecard_items` | Skill, weight, pass bar |
| `ai_interviews` | Application, question set, mode, recording refs (in-region), transcript, rubric scores (advisory), integrity flags, reviewer decision (Q4, R1) |
| `bgv_requests` | Candidate, package, provider ref, consent, status, report doc (Q5) |
| `candidate_retention` | Consent expiry, renewal requests, anonymisation date (Q6) |
| candidates (change) | + `date_of_birth`, `is_minor` (derived), `guardian_consent` (guardian name, relation, verification method, consent record) (E16 minors); + `person_id` (P01 `persons`, matched per YX-ORG-27; YX-ATS-33) |
| applications (change) | + `ex_employee` (derived from the person's past employment or alumnus role), `rehire_eligible` snapshot, `rehire_flag_cleared_by` / reason (M01 YX-LC-29; YX-ATS-33) |
| `offers` (change) | + `compensation_draft` (M03 template id, CTC, lines), `grade_id`, band check, `employee_id` after hand-off, `person_type` (new / internal / rehire / contractor), `status` (+ reneged / withdrawn), `decline_reason` (enum §3) + note, `withdrawn_reason`, `withdrawn_by`; + `version`, `supersedes_offer_id`, `kind` (offer / LOI), `batch_id` (campus joining batch) (E18) |
| `clients`, `client_contacts`, `client_contracts`, `rate_cards` | Staffing (Q7) |
| `client_submissions` | Job, candidate, contact, bill rate, status, client feedback |
| `placements` | Candidate / employee, client, contract, start / end (dated changes: extension, early end), pay / bill rate, margin, commission recipients, status (active / bench / ended), bench start (E17) |
| `bench_policies` | Per company (starter template, D17): bench pay %, max bench days, action after max (redeploy / exit review) (E17) |
| `client_invoices` + `client_invoice_lines` | From approved timesheets; GST fields; client PO number; status; accounting export (Q7) |
| `client_receipts`, `client_receipt_allocations`, `client_tds_deductions`, `client_disputes`, `dunning_schedules` | Collections (E17): payments and part payments allocated to invoices, client-side TDS (194C / 194J) with 26AS match status, disputes / short payments, credit-note matching, company dunning schedule |
| `client_portal_users` | Limited login for client contacts (Q8) |
| `recruiting_costs` | Cost entries for cost per hire (P09 Q3, H1): `job_id` (nullable for general spend), `source` (hiring source / channel, e.g. a job board, agency or campus), `cost_type` (job board / agency fee / referral bonus / assessment / event / other), `amount`, `currency`, `period` (month), `origin` (manual / payroll one-time pay / assessment cost from T02), `entered_by`, `note`. Referral bonuses are posted automatically from M03 one-time pay and assessment costs from the T02 test cost setting, so they are never entered twice; manual rows cover job boards, agency fees, events and other. Feeds `recruitment.cost_per_hire` ([APX-C](APX-C-reports-metrics.md) §4.2) and the recruiting cost register (APX-C RPT-ATS-09) |
| `talent_pools` (change) + `talent_pool_members`, `hotlists` + `hotlist_members` | B8: pool type static / dynamic (saved-search query), owner, purpose; member added by / source / date |
| `candidate_consents` (change) | B8: + purpose `nurture` per channel (email / WhatsApp) with opt-in source, time and text version; opt-out time and channel |
| `crm_campaigns`, `crm_sequences` + `crm_sequence_steps`, `crm_enrolments`, `crm_messages` | B8: audience (pool / hotlist / filter), channel, template (P04), wait / condition per step; enrolment per candidate with current step and stop reason (reply / applied / opted out / hired / retention end); each message with delivery / open / click / reply status |
| `sourcing_captures` | B8: recruiter, site (LinkedIn / Naukri), profile URL, captured fields, captured at, notice sent at, consent status, purge-by date |
| `job_board_accounts` + `job_postings` | B8: board, company's credentials ref (P10 secrets), contract / credit notes; per posting: job, board, external id, status draft / live / refreshed / closed / failed, posted / expires, applicants pulled, cost entry ref (`recruiting_costs`) |
| `interview_slot_searches` | B8: application, round, panel members, duration, window, rules applied, slots proposed, slot chosen, meeting ref |
| `vendors`, `vendor_contacts`, `vendor_agreements` | C7: vendor (legal name, PAN, GSTIN, M03 `consultants` ref for payouts, tier, status); contacts with limited login ref; agreement document (P05), fee model, ownership window, payment terms, validity |
| `vendor_rate_cards` | C7: per role / skill / location: vendor pay rate or fee %, OT / holiday multipliers, currency, effective dates (P06) |
| `vendor_job_shares` | C7: job, vendor, rate cap, max submissions, visible fields (client name masked y/n), shared / expires / withdrawn at |
| `vendor_submissions` | C7: job share, vendor contact, candidate, quoted rate, right-to-represent confirmation + candidate consent ref, duplicate status (unique / duplicate / held by other), ownership until, status |
| `placements` (change) | C7: + `supply_type` (own_payroll / vendor_supplied), `vendor_id`, `vendor_rate`; `employee_id` null for vendor-supplied |
| `vendor_workers` | C7: vendor-supplied worker (name, contact, placement), limited timesheet login ref; not an employee, never in headcount or registers |
| `vendor_invoices` | C7: vendor, period, placement lines (approved hours × vendor rate), GST, TDS section, linked M03 `consultant_invoices` id, status, payment status, pay-when-paid hold |
| `vendor_scorecards` | C7: vendor × period snapshot of the scorecard metrics (YX-ATS-30) |

All tables carry `organization_id` + RLS. Candidate data is **Confidential**. BGV reports and AI-interview recordings are **Special**. AI-interview recordings and face match stay in-region on the proctoring engine; only the text transcript (no face or voice data) goes to external AI for scoring (R1). Vendor tables holding PAN, GSTIN and bank data are **Special** (as M03 consultants); vendor contacts see only their own vendor's records (YX-ATS-25).

## 5. Rules (YX-ATS)

| ID | Rule |
|---|---|
| YX-ATS-01 | A requisition inside an approved headcount-plan line follows the short chain. "Outside plan", or pay above the plan budget, adds the extra approval step (Q1) (fixes U79). |
| YX-ATS-02 | A job references P01 masters, not free text. Public career pages show only public fields, with ASCII slugs and tenant branding (fixes U77, U78). |
| YX-ATS-03 | One candidate record per person. A merge keeps both histories, chooses field values explicitly, and is audited. |
| YX-ATS-04 | Scorecards hold per-skill ratings against a pass bar. The panel's recommendation and the next-step prompt appear on submit (fixes U82). |
| YX-ATS-05 | AI interview scores are advisory. Every AI-scored candidate is reviewed by a human before rejection or progression. There is never an automatic reject (Q4). The video / voice recording and face match stay in-region on the proctoring engine; only the text transcript (no face or voice data) is sent to external AI for scoring (R1; P10 YX-AI-01 exception). |
| YX-ATS-06 | An offer's compensation comes from an M03 template. A CTC outside the grade's pay range needs extra approval (Q3) (fixes U83). |
| YX-ATS-07 | On acceptance (automatic mode) or when HR clicks **Create employee** in the "Ready to onboard" queue (manual mode), per entity (Q2), one transaction first matches the candidate against employees on PAN, email and mobile, then branches by person type (§3 hand-off matrix, D3): a **new person** gets the employee (status: pre-boarding), the employment and assignment (P01), a draft compensation (dated on joining, P06) and pre-boarding tasks (M01); an **alumni rehire** gets a new employment on the existing employee (`rehire_of`, P01 YX-ORG-19); an **internal** candidate gets a P06 transfer / promotion; a **contractor** gets a P06 employment-type change. It links the candidate to the employee. It is idempotent (Q2). |
| YX-ATS-08 | BGV is triggered only after the candidate gives explicit consent. Results are visible only to HR and recruiters in scope (Q5). |
| YX-ATS-09 | Candidates not hired are anonymised when their retention period ends, unless they renew consent (Q6). Erase requests are handled within the legal time limit. |
| YX-ATS-10 | A placement creates a deployed-contractor employment. Client-approved timesheets become invoice lines at the bill rate, and payroll pays the contractor through **M03 rate-based compensation** (hourly / day rate from the placement, OT / holiday multipliers from the rate card) using the same client-approved timesheets as the input. Payslip lines carry the `placement_id`, so margin = bill − pay − statutory cost is computed per placement (Q7, D4). |
| YX-ATS-11 | Client contacts see only their own client's jobs, submissions, placements, invoices and tickets (Q8). |
| YX-ATS-12 | Referral bonus eligibility (e.g. the referred person completes 90 days) triggers a one-time pay in M03 automatically. |
| YX-ATS-13 | An internal hire marks the requisition filled (and draws the plan line) on acceptance without creating an employee or employment; the move is a P06 change on the existing record, effective on the release date agreed with the current manager. |
| YX-ATS-14 | An offer that is reneged, not joined or withdrawn after acceptance (withdrawal is manual, with a mandatory reason and a P05 letter) triggers the M01 pre-boarding unwind (YX-LC-12): the headcount-plan line is released and the requisition reopens with its pipeline intact. Every decline, renege or withdrawal records a reason from the fixed decline-reason list. |
| YX-ATS-15 | **Placement lifecycle (E17).** Placement extension and early end are dated changes (P06) with a reason; the client's contract-end notice (date received, notice days) is recorded and the placement end alerts the account team N days ahead. On end, `ats.placement.ended` fires and the contractor moves to **bench** status. Bench follows the company's **bench policy** (D17; YukthiX ships a labelled starter template only): bench pay % (fed to M03), max bench days, then redeploy or an exit review (never an automatic exit). Redeploy from bench starts a new placement on the same employment. |
| YX-ATS-16 | **Collections (E17).** Each client has a receivables ledger with ageing buckets (company-defined; starter template 0–30 / 31–60 / 61–90 / 90+). Dunning reminders go to the client's billing contacts on the company's schedule. Receipts can be part payments allocated across invoices. **Client-side TDS** (194C / 194J, rate from P07) deducted by the client is recorded as **TDS receivable** and reconciled against 26AS; unmatched amounts are flagged. Disputes and short payments are logged per invoice line with a reason; credit notes are matched to the invoice they correct. The client can add a PO number to an invoice in the portal (YX-ATS-11). Commission recipients on the placement are an input to M03 one-time pay. |
| YX-ATS-17 | **Offer versions (E18).** A revised offer is a new version that supersedes the previous one; if the CTC or grade changed, it goes through approval again (YX-ATS-06). The superseded letter is withdrawn in P05 and can't be accepted. Declines use the decline-reason list (§3, D3). |
| YX-ATS-18 | **Campus offers (E18).** A campus hire can get an **LOI** (letter of intent) first and the offer later, or the offer months ahead. Long pre-boarding is a candidate state (not an employee, not billed) with scheduled touchpoints; campus hires are grouped into a **joining batch** with one joining date that can be moved for the whole batch. |
| YX-ATS-19 | **Minors (law; DPDP s.9; E16).** Every candidate gives a date of birth. An under-18 candidate needs **verifiable parental / guardian consent** before processing continues; there is **no AI interview** (YX-ATS-05) and **no profiling** (AI fit score, semantic ranking, behavioural signals) for them. The same gate applies to assessments in T05 (YX-EVAL-13). This is a legal rule and can't be switched off. |
| YX-ATS-20 | **Campaigns and nurture sequences (B8).** A message goes to a candidate only if they hold a current **nurture consent for that channel** (email or WhatsApp opt-in, recorded with source, time and text version; WhatsApp uses approved templates on the company's own number, P04). Opt-out (unsubscribe link, "STOP") takes effect at once for that channel and is honoured by every campaign. A sequence stops for a candidate on reply, application, hire, opt-out or retention end. Under-18 candidates are never enrolled (YX-ATS-19). Sending limits and quiet hours follow P04. WhatsApp / SMS message charges are pass-through add-ons (D18); the CRM itself is included. |
| YX-ATS-21 | **Pools and hotlists (B8).** Dynamic pools re-evaluate their saved search nightly; membership never extends a candidate's retention. Before retention ends the consent-renewal email (Q6) is sent; renewal keeps the candidate in their pools, otherwise they are anonymised and leave every pool and sequence (YX-ATS-09). |
| YX-ATS-22 | **Sourcing browser extension (B8).** A Chrome / Edge extension captures **one profile per explicit recruiter click** from the page the recruiter is viewing in their own logged-in LinkedIn or Naukri session; no bulk crawling or background scraping, and the company is responsible for its use under the site's terms. The capture is dedup-checked (YX-ATS-03) and saved as **sourced – pending consent**: only a first recruiter outreach carrying the privacy notice is allowed; **no AI scoring, semantic ranking, campaigns or submission** until the candidate consents. With no consent within the company's window (starter template 30 days) the capture is deleted. |
| YX-ATS-23 | **Job-board connectors (B8; D18).** Naukri, Shine, Foundit, LinkedIn and Indeed connect with the **company's own board accounts**; posting fees, job slots and credits are the company's contract with the board (the connector is included). A job can be posted, refreshed and closed from YukthiX; closing or filling the requisition closes every live posting. Applicants are pulled into the pipeline with the board as source, dedup-checked, and shown the standard privacy notice and consent on first contact. Board costs are entered (or imported where the board provides them) into `recruiting_costs` for cost per hire. A connector to another board built for one customer is a custom-connection add-on (D18 (4)). |
| YX-ATS-24 | **Panel auto-slotting (B8).** For a round, YukthiX reads free / busy for every panel member (P10 calendar connector) and finds common slots within the company's rules: working hours and time zone of each person, buffer between interviews, maximum interviews per interviewer per day / week, required vs optional panelists, and the candidate's stated availability. It proposes the best N slots; the recruiter confirms one or offers them to the candidate for self-booking. Availability is re-checked at booking; the meeting and invites are created through the connector. A panelist who declines triggers a re-slot proposal. Interviewers without a connected calendar are shown as "availability unknown" and never assumed free. |
| YX-ATS-25 | **Vendor register and portal (C7).** A vendor is active only with a signed agreement (P05), PAN, verified bank account (P10) and TDS section, held once in the M03 consultant register (firm type) so payouts reuse M03 (YX-PAY-37). Vendor contacts log in through the **limited external login** (P02 §4.7: OTP, not billed seats, expiring, audited, YX-SEC-21) and see only their own vendor's job shares, submissions and their statuses, placements, timesheets, invoices, payments and scorecard. They never see other vendors, candidates submitted by others, bill rates or margins. A vendor cannot re-share a job. |
| YX-ATS-26 | **Job sharing with rate caps (C7).** A recruiter shares a job with named vendors, setting a **rate cap** (maximum vendor rate; suggested as bill rate − target margin from the company's margin policy, D17), a maximum number of submissions per vendor and an expiry. The vendor sees only the shared fields (client name masked if chosen). A submission quoting above the cap is blocked unless the recruiter approves an exception with a reason (P03). Withdrawing or filling the job closes all shares and notifies the vendors. |
| YX-ATS-27 | **Vendor submissions and duplicate check (C7).** Each submission needs the vendor's **right-to-represent confirmation** and the candidate's consent (captured by a candidate link, P02). It is checked against all candidates (email, phone, embedding similarity, YX-ATS-03). If the candidate is already in the job's pipeline or was submitted for it by anyone (own recruiter or another vendor) within the **ownership window** (company sets; starter template 90 days), the submission is marked **duplicate** and ownership stays with the first valid source; the vendor sees "duplicate — not accepted" without learning who holds it. Disputes go to the recruiter with an audited decision. |
| YX-ATS-28 | **Vendor rate cards and margins (C7).** A vendor-supplied placement takes the vendor rate from the vendor rate card (or the accepted quote within the cap) as a dated value (P06). It creates **no HRMS employment and no payroll**: the worker is a `vendor_worker` with a limited timesheet login (or the vendor contact enters timesheets), and the client approves them as for any placement (YX-ATS-11). The client invoice is unchanged (YX-ATS-10); margin for these placements = bill − vendor rate (no statutory cost), shown in the same margin report. Contract-labour (CLRA) compliance for vendor workers is out of this rule (GAP B17). |
| YX-ATS-29 | **Vendor invoices and payouts (C7).** Each period YukthiX proposes the vendor invoice from client-approved hours × vendor rate per placement; the vendor confirms it and adds its invoice number and GST details in the portal (or uploads its own, which must not exceed the approved amount without a recruiter-approved exception). The approved vendor invoice becomes an **M03 consultant invoice** (YX-PAY-38): TDS **194C or 194J** per the vendor's section (YX-TAX-16), P03 approval, payment in the bank file / payout, 26Q and Form 16A (YX-TAX-17), payment advice in the vendor portal. An optional company **pay-when-paid** setting (D17; off in the starter template) holds the payout until the matching client invoice is receipted (YX-ATS-16). |
| YX-ATS-30 | **Vendor performance scorecards (C7).** Per vendor and period (P09 metrics): submissions, duplicate rate, submission → interview, interview → offer, placements, time to first submission, early-exit rate (placement ended within a company-set window), rate-cap exceptions, invoice disputes and document validity (agreement, GST). The recruiter team sees all scorecards; each vendor sees only its own. Scorecards inform manual vendor tiering and share decisions; nothing is suspended automatically. |
| YX-ATS-31 | **Candidate promises (G12; G13 decided no).** After a résumé upload the candidate never re-types what was parsed: parsed fields are shown for confirmation and edit only, and the same parsing prefills every later application within that company. The candidate portal shows the application's status at every stage using a **company-editable status label set** (D17; YukthiX ships a labelled starter set mapped to the pipeline stages). When the company enables it (per job or company-wide), a candidate who is not progressing receives a **"not selected" notice** or the plain reason the recruiter picked from the decline-reason list (D3); nothing is sent while a result is held (T05 YX-EVAL-03) and no AI-generated reason is sent without human confirmation (YX-ATS-05). **One login per candidate per company** (email OTP, P02 §4.7). Candidate profiles are **per company**: there is no cross-employer portable profile (G13, not adopted). |
| YX-ATS-33 | **Candidates are persons; ex-employees flagged at application (Validation pass 3 Must follow-up, 28 Sep 2026).** Every candidate, referral and campus registrant links to one P01 `persons` row of the same tenant (YX-ORG-26, matching per YX-ORG-27; no match = new person). When that person has a past employment or alumnus role, the application shows **"Ex-employee"** from the first screen and through screening per M01 YX-LC-29: recruiter and HR see exit date, exit type and rehire eligibility; the **hiring manager sees only "Ex-employee" and rehire-eligible yes / no**; a rehire-ineligible flag alerts the recruiter before screening can be passed (HR may clear it with a reason); nothing is auto-rejected. The hire hands off on the person (M01 YX-LC-11 rehire branch). |
| YX-ATS-32 | **Identity chain hooks (T10).** A company may add an optional **application verification** step (ID + selfie with consent), which is the first capture point for the person record (P01 `persons`) when it runs (T04 YX-PROC-19). The **AI interview** and the **live interview** (T07 interview room, built-in video) each match the candidate against that record; where face detection is off, consent is refused or the interview runs on Teams / Meet, the interviewer **attests** identity against the ID. When the company has the add-on, the partner deepfake / voice-clone check runs on the interview video / audio (T04 YX-PROC-20). Mismatch and deepfake results are **review flags** shown in the review player and scorecard, never an automatic reject or stage move (YX-ATS-05); the candidate can explain or re-verify (T05 YX-EVAL-30). Under-18 candidates get the ID check and attestation only (YX-ATS-19). |

## 6. Flows
1. **Plan to requisition:** HR / finance approve the headcount plan → a department head opens a requisition (plan line prefilled) → approval → the job is published (careers page, boards, referrals, internal mobility).
2. **Pipeline:**
   1. Apply / source / refer.
   2. Parse and dedup.
   3. AI fit score (exists).
   4. Assessment (proctoring).
   5. AI first-round interview (Q4).
   6. Panel rounds with scorecards.
   7. Offer.
   8. Accept.
   9. BGV (default; or before acceptance, per company) (Q5).
   10. **Employee created** (YX-ATS-07): automatically, or by HR's **Create employee** in the "Ready to onboard" queue, per entity (Q2).
   11. Pre-boarding (M01).
3. **Staffing desk:**
   1. Client registered, with contract and rate card.
   2. Client jobs are created.
   3. Recruiters source from the bench, talent pool and hotlists.
   4. Submit to the client contact (email or portal, single or bulk).
   5. Client feedback and interviews.
   6. Placement.
   7. Contractor onboarding (M01, deployed type).
   8. Timesheets (M02 §B7), approved by the client in the portal.
   9. Invoice (Q7).
   10. Payroll (M03 rate-based compensation from the same client-approved timesheets; `placement_id` on payslip lines, YX-ATS-10).
   11. Margin and commission reports.
   12. Placement end: `ats.placement.ended` fires; the contractor moves to **bench** status (available for new submissions) until redeployed or exited, per the company bench policy (YX-ATS-15).
   13. Collections: receipts, client-side TDS, dunning and disputes against the receivables ledger (YX-ATS-16).
4. **Client helpdesk:** a client contact raises a ticket about a job, submission or placement → it goes to the account team queue (M08 engine) → SLA per contract.
5. **Talent CRM (B8):** build a pool or hotlist (search, saved search, extension captures, past applicants) → create a campaign or nurture sequence (email / WhatsApp, templates, waits) → only consented candidates are enrolled → replies and applications stop the sequence and land in the recruiter's inbox / pipeline → opt-outs honoured at once (YX-ATS-20/21/22).
6. **Job boards (B8):** job published → choose boards (company accounts) → posted with external ids → applicants pulled into the pipeline with source → refresh / close from YukthiX; requisition filled closes all postings → board costs into `recruiting_costs` (YX-ATS-23).
7. **Panel auto-slotting (B8):** recruiter picks round and panel → YukthiX proposes common free slots → recruiter confirms or offers them to the candidate → meeting and invites created → decline → re-slot (YX-ATS-24).
8. **Vendor desk (C7):**
   1. Vendor onboarded: register entry, agreement (P05), bank verified, TDS section (M03 consultant register), rate card, contacts invited to the portal.
   2. Job shared with selected vendors, with rate cap, limits and expiry.
   3. Vendor submits candidates (right-to-represent + candidate consent) → duplicate / ownership check.
   4. Recruiter reviews and forwards accepted submissions to the client (existing submission flow).
   5. Placement as **vendor-supplied** (no employment; vendor worker timesheet login) or converted to own payroll.
   6. Client approves timesheets → client invoice (unchanged) → vendor invoice proposed, confirmed by the vendor → M03 consultant payout with TDS 194C / 194J (optionally pay-when-paid).
   7. Monthly vendor scorecard.

**Events emitted (B8 / C7):** `ats.crm.optout` (→ all sequences), `ats.posting.closed`, `ats.vendor.submission.received`, `ats.vendor.submission.duplicate`, `ats.vendor_invoice.approved` (→ M03 consultant invoice / payout).

**Events emitted:** `ats.offer.accepted` (→ M01), `ats.placement.started`, `ats.placement.ended` (→ M02 timesheets close, M03, bench), `ats.invoice.issued`, `ats.referral.eligible` (SCH-63, YX-ATS-12 → M03 referral bonus one-time pay), `ats.bonus.clawback` (on `exit.case.accepted` inside the clawback period → M03 / M01 F&F recovery line, YX-LC-07), `ats.commission.earned` (YX-ATS-16 → M03 placement commission one-time pay). Full list in [APX-B](APX-B-events.md) §2.18.

**Events consumed:** `employment.exited` (M01 YX-LC-14): requisitions owned by the leaver are reassigned; the plan line is released or, with `backfill_requested`, a replacement requisition is opened (YX-LC-15). `exit.case.accepted`: clawback check on joining / retention bonuses → `ats.bonus.clawback`.

## 7. UI
Keep the exam-app v2 recruiter screens (jobs, pipeline board, candidates, calendar, referrals), then add:
- Rich pipeline cards: stage age, scores, next action (U81).
- The headcount plan board (T6).
- Scorecard form.
- AI interview review player: recording (in-region), transcript, advisory scores, integrity flags; the human reviewer decides (R1).
- Identity strip on the application, review player and panel scorecard (T10): check points with result (match / mismatch / attested / re-verified) and any deepfake signal, with **Request re-verification**; no template or ID image shown.
- Offer builder with a CTC breakup preview (M03).
- Staffing desk: clients, submissions board, placements, invoices.
- Client portal: jobs, submissions to review, timesheets to approve, invoices, tickets.
- **Talent CRM (B8):** pools and hotlists, campaign and sequence builder (step timeline, channel, template, wait), per-candidate engagement timeline, consent badge per channel.
- **Sourcing extension (B8):** side panel on the viewed profile: "already in YukthiX?" match, capture button, add to pool / hotlist / job, first-outreach message with the privacy notice.
- **Job postings (B8):** per job, a board-by-board status strip (live / expires / applicants / cost) with post, refresh and close.
- **Slot finder (B8):** panel members' availability grid with proposed slots ranked, rule badges (buffer, load cap) and "offer to candidate".
- **Vendor desk (C7):** vendor register, job-share dialog (vendors, rate cap, limits, masked fields), vendor submissions inbox with duplicate flags, vendor invoices, scorecards.
- **Vendor portal (C7):** shared jobs, submit candidate (résumé, rate, right-to-represent, candidate consent link), my submissions and statuses, placements and timesheets, invoices and payment advice, my scorecard.

## 8. Migration & rollout
Existing exam-app ATS tenants keep working throughout. The steps:
1. Map `Job.department` free text to P01 departments using a matching wizard.
2. Move roles to P02 templates.
3. Move approval gates to P03 chains.
4. Enable internal hand-off only when the tenant has HRMS.

The external HRIS adapters (BambooHR, Workday…) remain for ATS-only customers.

In waves 4–6, the existing exam-app offer hands off to M01 pre-boarding (basic hand-off). Wave 7 adds the headcount plan, structured offers, the manual / automatic hand-off modes and the rest below.

Order within wave 7:
1. Internal deltas: plan, scorecards, structured offer, hand-off, retention, merge.
2. AI interview and BGV.
3. Staffing desk and client portal.
4. **Gap-register extension (26 Sep 2026), all in launch scope:** job-board connectors and panel auto-slotting (B8) with the internal deltas; talent CRM and sourcing extension (B8) after AI interview; vendor / sub-vendor portal (C7) after the staffing desk, since it reuses clients, placements, client invoices and M03 consultant payouts. All included in the ATS price (D18); board fees, WhatsApp / SMS message costs and BGV stay the customer's or add-ons, and vendor contacts and vendor workers are not billed seats.

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 Should items for hiring and the staffing desk ([SHOULD-DECISIONS](research/validation-pass-3/SHOULD-DECISIONS.md)).

| ID | What it does | Rule | Wave |
|---|---|---|---|
| T4 + R10 + R11 (hiring side) | Salary range on job ads and careers pages for every company; pay-history question control | YX-ATS-34 | 5 |
| R13 + R14 + R15 | Candidate notices, consent, alternative process, deletion on request | YX-ATS-35 | 5 |
| T8 | WhatsApp / chatbot apply and screening | YX-ATS-36 | 5 |
| T9 | Interview notetaker with consent; draft scorecard | YX-ATS-37 | 5 |
| T11 | Automated reference checks | YX-ATS-38 | 5 |
| T12 | Candidate rediscovery when a requisition opens | YX-ATS-39 | 5 |
| J9 | Bulk campus interview day and bulk offers | YX-ATS-40 | 5 |
| J10 | Offer conditions with auto-lapse and pre-boarding unwind | YX-ATS-41 | 5 |
| J13 | Internal applicant's test result routed to the application | YX-ATS-42 | 5 |
| J18 | Permanent placement fee, conversion fee, replacement guarantee | YX-ATS-43 | 7 |
| R20 | E-invoice 30-day guard on staffing invoices | YX-ATS-44 | 7 |
| S9 | Google for Jobs structured data and sitemap | YX-ATS-45 | 5 |

| ID | Rule |
|---|---|
| YX-ATS-34 | **T4 + R10 + R11 (hiring side).** Every company can show a salary range on job ads and careers pages. Where the job's work location has a pay-transparency law (list held in P07 rules-as-data, not code), the range is **mandatory** and publishing is blocked without it; elsewhere it is a company setting with the starter template **on**. The pay-history question on application forms is **blocked** where the law bans it and **off by default** elsewhere (company may switch it on). |
| YX-ATS-35 | **R13 + R14 + R15.** Before any automated screening, AI interview or AI scoring, the candidate sees a plain notice of what is automated and why, and gives consent (recorded with notice version and time). A candidate may ask for an alternative (human) process at no disadvantage; the request routes to the recruiter. A candidate may ask for deletion of the application data; it is completed within **30 days** unless a legal hold applies (reason shown). Bias audit maths and export stay in T05 YX-EVAL-32. |
| YX-ATS-36 | **T8.** A candidate can apply and answer knockout / screening questions via WhatsApp or the careers-site chatbot. Channel consent is captured first and opt-out is instant; answers land on the same application as the web form (P01 person match, no duplicate candidate). A knockout outcome is a recommendation to the recruiter, never an automatic rejection without the R14 alternative-process option. |
| YX-ATS-37 | **T9.** The interview notetaker records and transcribes only after every participant has consented (consent recorded; no consent = no recording, the interview continues). AI drafts scorecard notes from the transcript; the draft is **not** submitted until the interviewer edits / confirms each rating. Recordings follow the retention policy. |
| YX-ATS-38 | **T11.** The recruiter triggers reference requests after the candidate supplies referees and consents. Referees get a secure link to a structured questionnaire; responses are visible to the recruiter and hiring panel only; reminders and expiry follow a template. Fraud signals (referee email domain equals the candidate's, same device) are flagged for review, never auto-decided. |
| YX-ATS-39 | **T12.** When a requisition opens, the system suggests past candidates and talent-pool members (silver medallists, nurture-consented) matched on skills and location. Only candidates whose retention period and consent are still valid are shown; outreach follows the B8 nurture-consent rules. |
| YX-ATS-40 | **J9.** A campus drive can schedule a bulk interview day (slots, panels, rooms, auto-assignment) and issue offers in bulk from one template with per-candidate fields; each offer still gets its own headcount-plan approval check and its own e-sign envelope (P05). |
| YX-ATS-41 | **J10.** An offer can carry conditions (background check, documents, degree completion) with due dates. An unmet condition or unsigned offer auto-lapses at its deadline after a reminder; lapse or withdrawal unwinds pre-boarding (M01 tasks cancelled, accounts not created, headcount slot released) with an audit entry. |
| YX-ATS-42 | **J13.** A test taken for an internal application is linked to that application; the result is visible to the new job's hiring manager and HR and hidden from the applicant's current manager (T03 YX-DLV-23). |
| YX-ATS-43 | **J18.** The staffing desk supports permanent placement fees (fixed or % of CTC), contract-to-hire conversion fees (per contract, tapering by months served) and a replacement guarantee period: if the placed person leaves inside it, the client gets a free replacement or a pro-rated credit note, per contract. |
| YX-ATS-44 | **R20.** For a legal entity at or above the e-invoice reporting threshold (AATO value held in P07 rules-as-data; **verify the current threshold** before go-live), a staffing invoice dated more than 30 days ago cannot be sent for IRN: warning from day 25, blocked after day 30 with the fix path shown. |
| YX-ATS-45 | **S9.** Each public job page emits JobPosting structured data (title, description, location, employment type, date posted, valid through, salary range when shown) and is listed in the careers-site sitemap; closed jobs are removed or marked expired within one day. |

**Acceptance tests (validation pass 3):**

- T4: a job in a pay-transparency jurisdiction cannot be published without a salary range; elsewhere, with the setting on, the range shows on the careers page; the pay-history question cannot be added for a location that bans it.
- R14 / R15: a candidate asks for a human process instead of the AI interview and is routed to a recruiter; a deletion request is completed within 30 days and the audit shows the date.
- T9: one participant declines recording, so no transcript is created and the scorecard is filled manually; with consent, the AI draft scorecard is not submitted until the interviewer confirms it.
- J10: an offer with an unmet background-check condition lapses at its deadline; M01 pre-boarding tasks are cancelled and the headcount slot is released.
- R20: an entity above the threshold tries to send a 31-day-old staffing invoice for IRN and is blocked; at day 25 the user sees a warning.

## 9. Acceptance tests (samples)
- A requisition outside the plan asks for the extra approver. One inside the plan doesn't (U79).
- The job URL for "Sales Executive – Chennai" is `/careers/acme/sales-executive-chennai` (U77).
- Accepting an offer twice (double click, retry) creates exactly one employee (YX-ATS-07).
- In manual mode, an accepted offer appears in "Ready to onboard"; **Create employee** opens a form pre-filled from the offer and candidate, creates exactly one employee, and a second click or retry creates no duplicate (YX-ATS-07).
- An AI interview sends only the text transcript to external AI; no video, voice or face data leaves the region (YX-ATS-05).
- An offer with CTC ₹14 L for a grade range of ₹8–12 L needs the extra approval (U83).
- An AI interview scoring 38/100 leaves the candidate in "AI round – review", never rejected automatically (YX-ATS-05).
- A live-interview face mismatch against the identity captured at the test shows a review flag on the scorecard; the interviewer cannot reject from the flag alone and the candidate is offered re-verification (YX-ATS-32).
- An unhired candidate whose consent expired 12 months ago is anonymised by the nightly job; their application counts remain in analytics (YX-ATS-09).
- A client contact from Client A gets 403 on Client B's submission (YX-ATS-11).
- A placement at bill ₹1,200/h and pay ₹800/h with 160 approved hours gives an invoice of ₹1,92,000 + GST, and a margin report showing (1,92,000 − pay − statutory cost).
- An ex-employee accepting an offer gets a new employment on her existing record (`rehire_of` set), with no PAN-duplicate failure; an internal candidate's acceptance creates a P06 transfer and marks the requisition filled with no new employee (YX-ATS-07/13).
- A campus hire who reneges is cancelled in pre-boarding; the plan line is free and the requisition reopens (YX-ATS-14).
- A nurture sequence to the "Java 2027" pool skips the 12 members with no WhatsApp opt-in; a candidate who replies "STOP" gets no further message from any sequence (YX-ATS-20).
- A LinkedIn profile captured by the extension cannot be AI-scored or added to a campaign until the person consents; with no consent after 30 days the capture is deleted (YX-ATS-22).
- Marking the requisition filled closes the job's live Naukri and Indeed postings (YX-ATS-23).
- For a 3-person panel with a 15-minute buffer rule, the slot finder never proposes a slot that overlaps any panelist's busy time or leaves < 15 minutes after their previous interview (YX-ATS-24).
- Vendor B submits Priya for Client A's Java job 20 days after Vendor A did: Vendor B sees "duplicate — not accepted" and cannot see who holds her (YX-ATS-27).
- A vendor quoting ₹950/h against a ₹900/h rate cap is blocked unless the recruiter approves an exception with a reason (YX-ATS-26).
- A vendor-supplied placement with 160 approved hours at a vendor rate of ₹900/h proposes a vendor invoice of ₹1,44,000 + GST; after approval, M03 deducts TDS under the vendor's 194C section and pays it in the next bank file; no employee or payslip is created (YX-ATS-28/29).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Headcount planning | **Annual plan per department** (positions by designation / grade / location + budget), approved by HR + finance; requisitions inside the plan → short approval; **outside plan / over budget → extra approval** (e.g. CFO / CEO); replacement hires auto-linked to the exit. |
| Q2 | Offer accepted → employee | **Automatic internal creation** (employee in pre-boarding + draft compensation + tasks) when the tenant has HRMS; **external HRIS push kept** for ATS-only tenants; HR can review before the employee record is activated on the joining day. |
| Q3 | Structured offers | **Yes:** offer uses the M03 CTC template (breakup preview, employer costs), grade-range check with extra approval outside range, variable pay / joining bonus as separate lines, letter via P05, e-accept with OTP. |
| Q4 | AI first-round interview | **Asynchronous AI interview** (candidate answers by video or voice, or text; questions from job skills, adaptive follow-ups), **scored against a rubric** with evidence quotes; integrity checks from proctoring (face match, tab switch); languages EN + HI at launch; **human reviews every result, never auto-reject**; candidate consent + notice that AI is used. |
| Q5 | Background verification | **Partner integration as a paid add-on** (identity, address, education, employment, criminal, credit per package), triggered after offer acceptance (or before, per company) with candidate consent; status tracking and report in the vault; manual BGV tracking for companies without the add-on. Team action: pick the BGV partner. |
| Q6 | Candidate data retention | **Default 12 months** after last activity for non-hired candidates, then **anonymise** (keep stats); consent-renewal email before expiry keeps them in the talent pool; company can set 6–36 months; erase on request. |
| Q7 | Staffing desk billing | **Full §1.2.3 at wave 7:** clients, contracts, rate cards, submissions, placements, contractor lifecycle, **GST tax invoices generated in YukthiX** from client-approved timesheets (invoice numbering per entity / GSTIN), payment status, and **export to Tally / Zoho** (P10 Q7); e-invoicing (IRN) via a GSP partner for turnover above the threshold. |
| Q8 | Client portal & helpdesk | **Client contact login** (email OTP; no billed seat): view their jobs, review / shortlist / reject submissions with feedback, schedule interviews, approve timesheets, see invoices, raise tickets (M08 engine, SLA per contract). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Annual headcount plan per department** (positions by designation / grade / location + budget) approved by HR + finance; in-plan requisitions → short chain; **outside plan / over budget → extra approval** (default CFO / CEO, configurable); replacement hires auto-linked to the exit (M01) and don't consume new plan lines; mid-year plan revisions versioned. | 25 Sep 2026 |
| Q2 | **Company chooses the hand-off mode** (setting per entity): (a) **automatic** — on acceptance the employee is created in pre-boarding with draft compensation and tasks (YX-ATS-07), HR reviews before activation on the joining day; or (b) **manual** — the accepted offer appears in HR's "Ready to onboard" queue and HR clicks **Create employee** (form pre-filled from the offer and candidate; nothing retyped; same transaction and idempotency). **External HRIS push kept** for ATS-only tenants. | 25 Sep 2026 |
| Q3 | **Structured offers from M03 CTC templates:** breakup preview incl. employer costs, grade pay-range check with extra approval outside range, joining bonus / variable / retention as separate lines (with clawback terms if any), letter from P05 .docx templates, OTP e-accept, offer expiry; ATS-only tenants use a simple breakup template. | 25 Sep 2026 |
| Q4 | **Asynchronous AI interview:** video / voice / text answers; questions from job skills + adaptive follow-ups; rubric scores with evidence quotes; proctoring integrity checks (face match, tab switch); EN + HI at launch (more with P04 languages later); **human reviews every result, never auto-reject** (YX-ATS-05); explicit candidate consent and AI-use notice; recordings retained per Q6; AI usage metered (credits). | 25 Sep 2026 |
| Q5 | **BGV partner integration as a paid add-on** (packages: identity, address, education, employment, criminal, credit), triggered after acceptance by default (before, per company) with candidate consent; status sync, report stored in the P05 vault (Special); discrepancies flagged to HR, never auto-withdraw the offer; **manual BGV tracking** for companies without the add-on. Team action: pick the BGV partner. | 25 Sep 2026 |
| Q6 | **Non-hired candidates retained 12 months after last activity** (company sets 6–36), consent-renewal email before expiry keeps them in the talent pool, otherwise **anonymised** (stats and funnel counts kept; résumé, recordings, contact data deleted); erase on request within the legal limit; hired candidates' data moves to the employee record under HRMS retention. | 25 Sep 2026 |
| Q7 | **Full staffing desk (§1.2.3) in wave 7:** clients, contacts, contracts, rate cards (per role / skill / location, OT and holiday multipliers), submissions, placements, deployed-contractor lifecycle, commission; **GST tax invoices generated in YukthiX** from client-approved timesheets (numbering per entity / GSTIN, credit notes), payment tracking, export to Tally / Zoho (P10 Q7); **e-invoicing (IRN / QR) via a GSP partner** for tenants above the threshold; margin report bill − pay − statutory cost. Team action: pick the GSP partner. | 25 Sep 2026 |
| Q8 | **Full client portal:** client contacts log in by email OTP (not a billed seat; scoped to their client, YX-ATS-11): jobs, review / shortlist / reject submissions with feedback (email submission still supported), interview scheduling, timesheet approval, invoices, tickets via the M08 engine with SLA per contract. | 25 Sep 2026 |
| R1 | Consistency review: AI interview data path — recording and face match in-region; only the text transcript goes to external AI; advisory scores; human decides (P10 YX-AI-01 exception) | 25 Sep 2026 |
| D3 | **Hand-off matrix by person type** (GAP-REGISTER D3): YX-ATS-07 matches PAN / email / mobile against employees before creating anything; **new** → pre-boarding employee (existing flow); **internal** → P06 transfer / promotion on a release date agreed with the current manager, requisition filled on acceptance without a new employment (YX-ATS-13); **alumni rehire** → new employment on the existing record (`rehire_of`, P01 YX-ORG-19 continuity options); **contractor** → employment-type change. Offer states **reneged / withdrawn after acceptance** (manual, reason, letter) run the M01 unwind: plan line released, requisition reopened (YX-ATS-14); decline-reason enum. | 26 Sep 2026 |
| D4 | Consistency fix (GAP-REGISTER D4): deployed contractors are paid through **M03 rate-based compensation** from the same client-approved timesheets used for invoicing; `placement_id` carried on payslip lines for per-placement margin (YX-ATS-10); `ats.placement.ended` event added; contractor returns to bench on placement end. | 26 Sep 2026 |
| E17 | **Placement lifecycle and collections (GAP-REGISTER E17):** extension / early end as dated changes, client contract-end notice, `ats.placement.ended`, **bench** status under a company bench policy (bench pay %, max bench days, then redeploy / exit review; starter template only, D17), redeploy from bench (YX-ATS-15); receivables ledger per client, ageing, dunning to client contacts on the company schedule, part payments, **client-side TDS (194C / 194J) as TDS receivable with 26AS reconciliation**, disputes / short payments, PO number via the portal, credit notes matched; commission recipients → M03 input (YX-ATS-16). | 26 Sep 2026 |
| E18 | **Offer versions and campus offers (GAP-REGISTER E18):** a revision supersedes the previous version, re-approval if CTC / grade changed, old letter withdrawn via P05 (YX-ATS-17); decline reasons already in D3; campus LOI vs offer, long pre-boarding (not billed, touchpoints), batch joining (YX-ATS-18). | 26 Sep 2026 |
| E16 minors (law) | **Under-18 candidates (DPDP s.9):** DOB gate; verifiable parental / guardian consent; no AI interview, no profiling; applies in M10 and T05 (YX-ATS-19). | 26 Sep 2026 |
| H1 (consistency fix) | **Cost per hire made deliverable (GAP-REGISTER H1):** `recruiting_costs` table (§4) with job, source, cost type (job board / agency fee / referral bonus / assessment / event / other), amount, period and entered by; referral bonuses auto-posted from M03 one-time pay and assessment costs from the T02 test cost setting; feeds P09 Q3 cost per hire and the report library ([APX-C](APX-C-reports-metrics.md)). | 26 Sep 2026 |
| F-follow-ups (consistency fix) | **Events aligned with APX-B §2.18 / §3 #3.** "Events emitted" adds `ats.referral.eligible`, `ats.bonus.clawback` and `ats.commission.earned`, each consumed by M03 as a named one-time-pay source (clawback also to the F&F, YX-LC-07); `exit.case.accepted` added to "Events consumed" as the clawback trigger. | 26 Sep 2026 |
| B8 | Gap-register extension (user decision 26 Sep 2026): **talent CRM, job-board connectors, panel auto-slotting.** Campaigns and nurture sequences by email / WhatsApp only with per-channel nurture consent, instant opt-out, stop on reply / apply / hire, minors excluded, message costs pass-through (YX-ATS-20); static and dynamic pools and hotlists under the retention rule (YX-ATS-21); **sourcing browser extension** for LinkedIn / Naukri — one profile per click from the recruiter's own session, dedup, "pending consent" state with no AI profiling or campaigns until consent, deleted after the company window (starter 30 days) (YX-ATS-22); **Naukri / Shine / Foundit / LinkedIn / Indeed** connectors on the company's own board accounts (posting costs the company's; connector included, D18), post / refresh / close, applicants pulled with source, costs into `recruiting_costs` (YX-ATS-23); **panel auto-slotting** from calendar free/busy with buffer, load cap, time zone and candidate availability, re-check at booking, re-slot on decline (YX-ATS-24). Inbound assessment connector for external ATSs (B6) is designed in T05 (reference only). Wave 7. | 26 Sep 2026 |
| C7 | Gap-register extension (user decision 26 Sep 2026): **vendor / sub-vendor portal for the staffing desk** (reverses spec §1.2.3 "Out of scope: vendor and sub-vendor management"). Vendor register held once in the M03 consultant register (agreement, PAN, verified bank, TDS section) with contacts on the P02 §4.7 limited login, scoped to their own vendor (YX-ATS-25); **job sharing** to named vendors with rate cap (starter margin policy, D17), limits, expiry, masked fields, above-cap exception approval (YX-ATS-26); **vendor submissions** with right-to-represent + candidate consent, duplicate check and ownership window (starter 90 days) without revealing the holder (YX-ATS-27); **vendor rate cards** and vendor-supplied placements with no HRMS employment, vendor-worker timesheet login, margin = bill − vendor rate (YX-ATS-28); **vendor invoices** proposed from client-approved hours, paid as **M03 consultant invoices with TDS 194C / 194J**, 26Q / Form 16A, optional pay-when-paid (YX-ATS-29); **vendor scorecards** via P09, manual tiering only (YX-ATS-30). CLRA contract-labour compliance stays with GAP B17. Wave 7, after the staffing desk; included in the price (D18). | 26 Sep 2026 |
| Market analysis additions (G12, G13) | **Candidate promises adopted** ([MARKET-COMPETITOR-ANALYSIS](MARKET-COMPETITOR-ANALYSIS.md) §4 G12): no re-typing after a résumé upload (parsed fields shown for edit only), status visible to the candidate at every stage with a company-editable label set (D17), a "not selected" notice or plain reason when the company enables it, one login per candidate per company (YX-ATS-31). **G13 portable cross-employer candidate profile: not adopted** — per-company candidate profiles only; résumé parsing prefills each application. | 26 Sep 2026 |
| T10 | **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** **identity chain hooks in hiring:** optional application verification as a capture point; AI and live interviews re-match against the person record (P01 `persons`) (interviewer attestation where face detection is off, consent refused or external video); partner deepfake / voice-clone check on interview video / audio as a paid add-on; all results are review flags, never auto-reject. Rule YX-ATS-32; main rules T04 YX-PROC-19 / 20; incidents T05 YX-EVAL-30. | 28 Sep 2026 |
| Validation pass 3 Must follow-up, 28 Sep 2026 | **Candidates link to P01 `persons`; ex-employee / alumni flag at application and screening** (hiring manager sees only "Ex-employee" + rehire-eligible yes / no); rule YX-ATS-33 (M01 YX-LC-29, P01 YX-ORG-26). | 28 Sep 2026 |
| T4 + R10 + R11 (hiring side) | Validation pass 3 Should (T4 + R10 + R11 (hiring side)), founder decision 28 Sep 2026: salary range on job ads and careers pages for every company (mandatory where law requires, otherwise company setting with starter template on); pay-history question blocked where banned, off by default elsewhere. Rule YX-ATS-34. | 28 Sep 2026 |
| R13 + R14 + R15 | Validation pass 3 Should (R13 + R14 + R15), founder decision 28 Sep 2026: candidate notices and consent before automated steps, human alternative process on request, deletion within 30 days on request (bias audit maths in T05 YX-EVAL-32). Rule YX-ATS-35. | 28 Sep 2026 |
| T8 | Validation pass 3 Should (T8), founder decision 28 Sep 2026: WhatsApp / chatbot apply and screening with channel consent; answers land on the same application. Rule YX-ATS-36. | 28 Sep 2026 |
| T9 | Validation pass 3 Should (T9), founder decision 28 Sep 2026: interview notetaker only with consent; AI draft scorecard confirmed by the interviewer before submission. Rule YX-ATS-37. | 28 Sep 2026 |
| T11 | Validation pass 3 Should (T11), founder decision 28 Sep 2026: automated reference checks with candidate consent, structured questionnaire, fraud signals flagged for review. Rule YX-ATS-38. | 28 Sep 2026 |
| T12 | Validation pass 3 Should (T12), founder decision 28 Sep 2026: candidate rediscovery suggestions when a requisition opens, limited to consented, in-retention candidates. Rule YX-ATS-39. | 28 Sep 2026 |
| J9 | Validation pass 3 Should (J9), founder decision 28 Sep 2026: bulk campus interview day and bulk offers (per-offer approval and e-sign kept). Rule YX-ATS-40. | 28 Sep 2026 |
| J10 | Validation pass 3 Should (J10), founder decision 28 Sep 2026: offer conditions with auto-lapse and automatic pre-boarding unwind. Rule YX-ATS-41. | 28 Sep 2026 |
| J13 | Validation pass 3 Should (J13), founder decision 28 Sep 2026: internal applicant's test result routed to the application and hidden from the current manager (T03 YX-DLV-23). Rule YX-ATS-42. | 28 Sep 2026 |
| J18 | Validation pass 3 Should (J18), founder decision 28 Sep 2026: permanent placement fee, conversion fee and replacement guarantee on the staffing desk. Rule YX-ATS-43. | 28 Sep 2026 |
| R20 | Validation pass 3 Should (R20), founder decision 28 Sep 2026: e-invoice 30-day reporting guard on staffing invoices (AATO threshold held in P07, to verify). Rule YX-ATS-44. | 28 Sep 2026 |
| S9 | Validation pass 3 Should (S9), founder decision 28 Sep 2026: Google for Jobs JobPosting structured data and careers sitemap; closed jobs expire within a day. Rule YX-ATS-45. | 28 Sep 2026 |
