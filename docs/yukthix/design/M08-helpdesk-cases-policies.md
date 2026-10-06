# M08 · Helpdesk, Grievance, POSH, Disciplinary & Policies

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Correction C1 (validation pass 3), 28 Sep 2026:** IR Code (P07 `IN.IR`, in force 21 Nov 2025) Grievance Redressal Committee for 20+ workers and standing orders at 300+ workers linked to the misconduct matrix (YX-CASE-12/13); §11 C1. **Validation pass 3 Must J6, 28 Sep 2026:** new case type **workplace accident / injury** — incident record for employees and contract workers, ESIC accident report, statutory accident notice, Employees' Compensation claim tracking, injury leave (M02 YX-LV-15) and pay (M03 YX-PAY-50), accidents register fed automatically (YX-CASE-14…16); §11 J6.
> **Covers:** spec §1.3.12 (employee helpdesk: tickets to HR and IT) and §1.3.15 (policy management and acknowledgement; grievance, POSH and disciplinary case management — POSH Internal Committee, confidential and optionally anonymous complaints, 90-day inquiry tracking, annual report). Also Frappe reference [09 §2](../reference/frappe-hrms-functional-spec/09-training-grievance-misc.md) (MS-D3, MS-D4) and UI reference 09 (U84, U85).
> Statutory registers and document expiry tracking (also §1.3.15) are covered by P05 and P07.
> **Build wave:** **POSH and workplace accident / injury (J6) in wave 4**; helpdesk, grievance, disciplinary, policies and whistleblower in wave 5 (spec §4).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Support access | Needs tenant approval per session | P02 Q8 |
| System Admin separation | System Admin is separate from sensitive data (the same principle applies to POSH and case data) | P02 Q1 |
| SLA | Reminders and escalation on the approver's location calendar | P03 |
| Messages outside the app | Never carry sensitive content | P04 Q6 |
| Letters and e-sign | Show-cause, warning and POSH letters; OTP click-to-accept; company DSC | P05 |
| Audit | Append-only with a hash chain; "who accessed my data" | P08 |
| AI policy helpdesk | Wave 5: answers from published policies | P10 Q8 |
| Mobile | Every employee flow is on mobile; the WhatsApp assistant arrives in wave 5 | M04 |
| Exit case | Disciplinary termination opens an M01 exit case | M01 |

---

## 1. Purpose & scope
- Give employees one place to ask for help.
- Give companies a **safe, legally compliant** way to handle complaints and misconduct.
- Make sure every employee has read the policies that apply to them.

Scope:
- the helpdesk;
- **cases** of five types: grievance, POSH complaint, disciplinary, whistleblower and workplace accident / injury (J6);
- policies.

## 2. What exists today (exam app)
There are no tickets or cases. We reuse:
- the approval engine;
- notifications;
- the audit log (append-only);
- record-visibility / RLS (generalised in P02);
- document templates;
- the AI providers, for the P10 helpdesk assistant.

## 3. Concepts
- **Queue:** a helpdesk team (HR, Payroll, IT, Admin, Finance…) with agents, categories, business hours and SLA targets (Q1).
- **Ticket:** a request or question. It holds a category, priority, requester, assignee, status (new → in progress → waiting on employee → resolved → closed / reopened), SLA timers, conversation, attachments and satisfaction rating.
- **Knowledge article:** a published answer attached to categories. It is suggested while the employee types a ticket. It is the source for the P10 AI assistant together with policies.
- **Case:** a confidential record with its own access list:
  - **Grievance:** a workplace complaint about pay, a manager, conditions and so on.
  - **POSH complaint:** under the Sexual Harassment of Women at Workplace Act 2013, handled only by the **Internal Committee (IC)**.
  - **Disciplinary case:** misconduct raised by a manager or HR. Steps: show-cause → reply → inquiry → decision.
  - **Whistleblower report:** fraud or ethics concerns (vigil mechanism), routed to an ethics officer or audit committee (Q8).
  - **Workplace accident / injury (J6):** an accident at work that injured or killed an employee or a contract worker (M13), handled by the location's safety officer and HR. It carries the incident record, the statutory reports with their deadlines, injury leave and pay, and (for staff not covered by ESI) the Employees' Compensation claim. **Near-misses are not recorded as this case type.**
  - **Collective dispute / settlement (J4):** a charter of demands or industrial dispute raised by a union (M01 union register) or a group of workers, with conciliation meetings, and the resulting **settlement** (bipartite or in conciliation) as a signed record that M03 uses for wage-settlement arrears.
  - **Whistleblower timings by jurisdiction (R18):** for an entity in an EU member state with 50+ workers, whistleblower reports follow the EU Directive 2019/1937 clocks (acknowledge within 7 days, feedback within 3 months) as P07 jurisdiction parameters (national transposition, verify).
- **Case team:** the named people who can see a case. There is no role-wide access, and HR Admin doesn't see a case unless added (Q3/Q4).
- **Internal Committee:** per workplace or entity. It has a presiding officer, members, an external member and dated tenure. The composition is validated against the law.
- **Grievance Redressal Committee (GRC, C1):** per establishment where the IR Code requires one (P07 `IN.IR`, dated; currently **20 or more workers**). Modelled like the IC: members with a side (employer / worker), dated tenure, a chairperson who **alternates** between the employer and worker sides, and a composition validated against the law.
- **Standing orders (C1):** for an establishment where `IN.IR` requires them (currently **300 or more workers**), the certified or model standing orders, versioned, whose misconduct list backs the misconduct matrix.
- **Policy:** a versioned document with an audience, an effective date, an acknowledgement requirement and an optional quiz (M07) (Q6).

## 4. Data model (main tables)

| Area | Tables |
|---|---|
| Helpdesk | `hd_queues` (members, business-hours calendar), `hd_categories` (queue, SLA first-response / resolution by priority, sensitive flag), `tickets`, `ticket_messages` (internal note flag), `ticket_sla_events`, `ticket_ratings`, `kb_articles` (versioned, audience) |
| Cases | `cases` (type, subject, raised_by nullable for anonymous, respondent(s), confidentiality level, status, stage, due dates), `case_external_parties` (name, employer, contact, party type: contractor / vendor staff / client staff / visitor; complainant or respondent; E16), `case_access_codes` (hashed code, case, optional encrypted contact; E20), `case_members` (person or external party, role: complainant / respondent / IC member / investigator / witness / HR / ethics officer, access level), `case_events` (timeline: filed, acknowledged, notice sent, hearing, finding, decision, appeal), `case_messages` (anonymous two-way channel), `case_documents` (P05, encrypted at rest with a per-case key), `case_actions` (warning, suspension, deduction, training, termination → M01) |
| POSH | `internal_committees` (entity / workplace, members with role + tenure, external member), `posh_annual_reports` (year, counts, workshops, status submitted) |
| GRC (C1) | `grievance_committees` (establishment, members with side employer / worker, gender, role chair / member, tenure, chair rotation dates), validity status |
| Disciplinary | `misconduct_types` (per company standing orders; `standing_order_clause?`, C1), `warnings` (level, issued, expires), `standing_orders` (establishment, version, kind certified / model / company policy, effective_from, certified_on, document; C1) |
| Accidents (J6) | `accident_cases` (case, person kind employee / contract worker, employment or M13 worker + contractor, occurred_at, place / location, description, witnesses (case members), photos (P05 documents), injury type, body part, first aid given / by, hospital, outcome death / injury, days unable to work, ESI-covered flag at the time, reportable flag, register entry ref), `accident_medical` (diagnosis, certificates, disablement % and kind; **Special**), `accident_reports` (kind ESIC accident report / statutory accident notice / EC statement, P07 form version, due_at, status draft / generated / submitted / acknowledged, acknowledgement no., document ref), `ec_claims` (claimant employee / dependants, kind temporary / permanent partial / permanent total / death, P07 rule version, wage used, relevant factor, amount computed, due_at, paid / deposited with commissioner at, deposit ref, interest / penalty lines, status) |
| Policies | `policies`, `policy_versions` (file / content, effective date, change summary), `policy_audiences`, `policy_acknowledgements` (version, employee, accepted_at, method, quiz score) |
| Cases (Validation pass 3) | `collective_disputes` (J4: `union_id?`, establishment, demands, status, conciliation events), `settlements` (dispute, type bipartite / conciliation, signed document, `effective_from` / `to`, covered categories, filed-with-authority ref, M03 arrears ref); whistleblower clocks read P07 jurisdiction parameters (R18, no new table) |

All tables carry `organization_id` + RLS. Case tables use **Special** sensitivity. Access is by **case membership only**: never by role alone, and never by System Admin (P02). Every read is audited and shown in P08 "who accessed".

## 5. Rules

### Helpdesk (YX-HD)

| ID | Rule |
|---|---|
| YX-HD-01 | A ticket is routed by category to a queue, then assigned round-robin or manually. SLA timers use the queue's business hours and pause while "waiting on employee". |
| YX-HD-02 | SLA breach warnings go to the agent at 80 % of the target, and to the queue lead at breach. |
| YX-HD-03 | Tickets in **sensitive categories** (payroll, medical, personal) are visible only to that queue's agents. The requester can also mark a ticket "private" (Q2). |
| YX-HD-04 | Knowledge articles are suggested while the employee types. A ticket closed by an article ("this solved it") is counted as deflected. |
| YX-HD-05 | A resolved ticket closes after 3 days without a reply. The employee can reopen it within 7 days. A satisfaction rating is requested on close. |

### Cases (YX-CASE)

| ID | Rule |
|---|---|
| YX-CASE-01 | "Raised by" is always the logged-in user, or empty when the complaint is anonymous (fixes MS-D3). |
| YX-CASE-02 | Only case members can see a case. The respondent is not told of a complaint until the process formally notifies them (fixes MS-D4, U85). |
| YX-CASE-03 | Anonymous complaints hide the complainant from everyone, including the case team. Communication happens only through the anonymous message channel. Identity is not stored unless the complainant later chooses to reveal it. |
| YX-CASE-04 | A case member with a conflict of interest (the respondent, their manager chain, or anyone who self-declares) is blocked from the case. Adding them needs a documented override. |
| YX-CASE-05 | Every stage has a due date and reminders (P03). The case timeline records every step. Cases can't be deleted, only closed with an outcome. |
| YX-CASE-06 | Case notifications outside the app say only "You have an update on a confidential matter", with an in-app link (P04 Q6). |
| YX-CASE-07 | Disciplinary actions follow the company's misconduct matrix. A show-cause notice and a chance to reply (default 7 days) are required before any penalty. Warnings expire after their period (Q5). Subsistence allowance during suspension pending inquiry is paid through M03 (YX-PAY-23, rate from P07). |
| YX-CASE-08 | A retaliation flag can be raised by the complainant at any time. It creates a linked case and alerts the case owner. |
| YX-CASE-09 | **Non-employee parties (E16).** A complainant or respondent can be an **external party** (contractor, vendor staff, client staff, visitor) recorded with name, employer and contact. Notices to an external respondent are delivered to them and coordinated with their employer (named contact, delivery logged on the timeline). An external complainant files and follows the case without an employee login, through the OTP external login (P02 §4.7, YX-SEC-21), scoped to that case only. |
| YX-CASE-10 | **A party exits during a case (E16).** The case continues after a complainant or respondent leaves; the ex-employee keeps case-scoped access through the alumni login. An ex-employee can still file a POSH complaint within the legal window (YX-POSH-02: 3 months, extendable by 3) via alumni-scoped access. The M01 exit pre-check flags any open case where the leaver is a party (the flag names no case details outside the case team). |
| YX-CASE-11 | **Anonymous reporter return path (E20).** On filing an anonymous grievance or whistleblower report, the reporter is shown a **case access code** once (random, high-entropy, stored only as a hash; they can save or download it). With the code they check status and reply on a **no-login page**; no identity, IP or device is stored against the case. If the reporter chooses to give a contact (email / phone) for "you have an update" alerts, it is stored encrypted, visible to nobody (case team, HR, System Admin, support), and used only for that content-free alert (YX-CASE-06). A lost code can't be recovered; the reporter files a linked follow-up. Failed code attempts are rate-limited. |
| YX-CASE-12 | **Grievance Redressal Committee (IR Code, C1).** An establishment at or above the P07 `IN.IR` threshold (dated; currently 20 or more workers) must have a valid GRC: no more members than `IN.IR` allows, **equal employer and worker representation**, a chairperson **alternating** between the employer and worker sides per `IN.IR`, and **women members at least in proportion to women workers** in the establishment. The composition is validated like the IC (YX-POSH-01), with a banner and a compliance-calendar flag when it isn't valid. A worker's individual grievance in such an establishment is routed to the GRC: its members join the case team (YX-CASE-04 conflict rules apply) and the case carries the **statutory disposal clock** (period per IR Code rules, verify; a P07 parameter) with reminders and escalation. The decision is recorded on the case, and the worker is shown the **appeal path** for a rejected or undecided grievance (onward route and time limit per IR Code rules, verify). Anonymous grievances and the other case types keep their existing flow. |
| YX-CASE-13 | **Standing orders (IR Code, C1).** For an establishment at or above the `IN.IR` standing-orders threshold (currently 300 workers), the misconduct matrix is linked to the establishment's standing-orders version (certified or model): every misconduct type cites its clause, and a disciplinary case can cite only misconduct in the version valid on the incident date. Below the threshold the matrix is company policy (D17). An establishment above the threshold with no standing orders on record raises a compliance alert (P07 calendar). |
| YX-CASE-14 | **Workplace accident / injury record (J6).** Any employee, supervisor, security staff or contractor supervisor can report an accident; the case is created for the location's safety officer and HR (company-set case team, D17), and the reporter is a member. It records the person (employee, or contract worker linked to the M13 worker and contractor), date and time, place, description, witnesses, photos, injury type, body part, first aid, hospital, and whether the person could not work and for how many days. **Near-misses are not recorded as this case type.** Medical details (diagnosis, certificates, disablement) are **Special** and visible only to case members given medical access; the manager sees only the injury leave dates (M02 YX-LV-15). On closure the case writes one entry to the statutory **accidents register** (P07 `IN.REGISTERS`, M03 YX-PAY-39) with no manual re-keying; a correction after the register is signed follows YX-PAY-39 (new signed version). |
| YX-CASE-15 | **Statutory accident reports (J6).** For an ESI-covered person the case generates the **ESIC accident report** (employer's report, APX-F #109; P07 `IN.ESI`) due within the **prescribed time per ESI regs, verify** from the time of the accident. For a **reportable accident** — death, or disablement beyond the prescribed days per the P07 `IN.OSH` / `IN.FACTORIES` rule set valid on the accident date — it generates the **statutory accident notice** (Factories Act / OSH Code, APX-F #110) to the authority in the prescribed form and time. Both are pre-filled from the case, reviewed and marked submitted with the acknowledgement no.; each deadline is an item on the P07 compliance calendar (reminders and escalation via P04), and a missed deadline shows the P07 estimated penalty where one exists. For a contract worker the contractor is the immediate employer; the case records who filed and the principal employer is alerted when the contractor has not (P07 `IN.CLRA` liability). |
| YX-CASE-16 | **Employees' Compensation claim (J6).** For a person not covered by ESI for the injury, the case opens an **EC claim**: compensation is computed by the P07 `IN.EC` formula valid on the accident date (kind of injury, wage with the P07 ceiling, age factor, minimums, waiting period for temporary disablement); temporary-disablement payments go through payroll (M03 YX-PAY-50); a lump sum is paid to the employee, or **deposited with the commissioner** where P07 requires it (death, and other cases the rule lists), with the deposit reference recorded. The due date (P07) is on the compliance calendar; a late payment adds the P07 interest and penalty as payable lines. The EC letter (APX-F #111) states the amount and its calculation. ESI-covered persons get the ESI benefit instead (no EC claim; injury pay per M03 YX-PAY-50). Company policies around the statutory floor (top-up, who is on the case team) are D17 settings. |
| YX-CASE-17 | **Whistleblower clocks by jurisdiction (R18).** A whistleblower case at an entity whose country has a P07 whistleblowing parameter set (e.g. EU member states, entities with 50+ workers) gets the dated clocks from it: acknowledgement due within 7 days of receipt and feedback within 3 months of acknowledgement (or of receipt + 7 days when none was sent), per national transposition (verify); reminders and escalation to the ethics officer; records kept for the parameter's retention period. Entities without such a set keep the Q8 flow. |
| YX-CASE-18 | **Collective dispute and settlement (J4).** A dispute case raised by a union or worker group records demands, conciliation events and outcome; a settlement is a signed P05 document with effective dates and covered categories, sent to the authority where the IR Code requires (per IR Code rules, verify); on signing, its pay terms are handed to M03 for settlement arrears and it is linked from the union's register entry (M01 YX-EMP-15). Case team: HR-IR and legal (D17). |

### POSH (YX-POSH)

| ID | Rule |
|---|---|
| YX-POSH-01 | An entity at or above the employee threshold in the P07 POSH parameters (dated data; currently 10 or more employees at a workplace) must have a valid Internal Committee, with the composition set by the P07 POSH parameters (currently a senior woman as presiding officer, at least half the members women, one external member, and tenure of 3 years or less). The composition is validated, and a banner shows if it isn't. |
| YX-POSH-02 | Complaints can be filed by the aggrieved woman or on her behalf. The filing window is 3 months from the incident (the IC can extend it by 3 more with reasons). |
| YX-POSH-03 | Statutory timeline tracking per the P07 POSH parameters (dated data; currently: notice to the respondent within 7 days; inquiry completed within **90 days**; report within 10 days after the inquiry; the employer acts within 60 days of the report). Due dates are calculated and escalated. |
| YX-POSH-04 | Conciliation is offered only at the complainant's request, with no monetary settlement as a basis. |
| YX-POSH-05 | Only the IC members on the case (and the external member) see POSH cases. HR sees only anonymised counts and the actions it must carry out. Case details are never used in performance or other modules. |
| YX-POSH-06 | The annual report is compiled, in the format and with the due date set by the P07 POSH parameters, from cases and awareness sessions, then submitted to the employer and the District Officer. A missing report is flagged in the compliance calendar (P07). In wave 4, awareness sessions are recorded as a manual session log in M08 (date, audience, attendance count); from wave 5 they come from M07 courses / templates. |

### Policies (YX-POL)

| ID | Rule |
|---|---|
| YX-POL-01 | Policies are versioned. Publishing a new version with "re-acknowledge" asks the audience to acknowledge again. Older acknowledgements remain on record. |
| YX-POL-02 | Acknowledgement records the version, time and method (in-app click, OTP per P05 for critical policies, quiz pass per M07). Reminders are sent; overdue items escalate to the manager. |
| YX-POL-03 | New joiners get the policies for their audience as a pre-boarding / onboarding task (M01). |

## 6. Flows
1. **Ticket:**
   1. The employee starts from Requests → Help, or the AI assistant.
   2. Knowledge-article suggestions appear.
   3. They submit.
   4. The ticket is routed to a queue.
   5. The agent replies (the conversation also runs in the app).
   6. The ticket is resolved.
   7. The employee rates it.
2. **Grievance:**
   1. File (named-confidential or anonymous, per Q3).
   2. Acknowledged.
   3. Case owner assigned (or the **GRC**, where YX-CASE-12 applies; C1).
   4. Investigation (meetings, statements, documents).
   5. Finding.
   6. Resolution with actions.
   7. The complainant can appeal once to the next level (for GRC cases, along the `IN.IR` appeal path; C1).
3. **POSH:**
   1. File to the IC.
   2. Conciliation (if requested) or inquiry.
   3. Notice to the respondent.
   4. Hearings.
   5. IC report with recommendation.
   6. Employer action within 60 days.
   7. Appeal window noted.
   8. Closure; the case counts in the annual report.
4. **Disciplinary:**
   1. The incident is raised by a manager or HR.
   2. HR reviews it.
   3. Show-cause notice (letter).
   4. The employee replies.
   5. Inquiry (optional; inquiry officer).
   6. Decision: warning, suspension, deduction, termination or no action.
   7. Letter.
   8. Appeal.
   9. Termination → M01 exit case.
5. **Whistleblower:** anonymous or named report → ethics officer → investigation → outcome to the audit committee.
6. **Policy:** HR publishes → the audience is notified → the employee reads and acknowledges → dashboard of acknowledged / pending.
7. **Workplace accident / injury (J6):**
   1. Report the accident (web, mobile or on behalf of the injured person); the case opens for the safety officer and HR.
   2. Complete the incident record: witnesses, photos, injury, first aid, hospital.
   3. The system checks ESI coverage and whether the accident is reportable (P07), and puts each statutory deadline on the compliance calendar.
   4. Generate, review and submit the ESIC accident report and / or the statutory accident notice; record the acknowledgement.
   5. Injury leave is recorded (M02 YX-LV-15); payroll gets the injury pay or EC lines (M03 YX-PAY-50).
   6. Non-ESI: compute the EC claim, pay or deposit with the commissioner by the due date, send the EC letter.
   7. Close the case; the accidents register entry is written.

## 7. UI
- **Help centre (mobile first):** search the knowledge base and ask the AI assistant (wave 5), with "raise a ticket" as a fallback. Shows my tickets with SLA status.
- **Agent desk (T2 list + T3 detail):** queue views, SLA badges, macros (saved replies) and internal notes.
- **Case workspace:**
  - timeline;
  - members panel, showing who can see the case;
  - due-date banner with the POSH statutory clock;
  - documents and anonymous messages.

  A "Confidential" watermark appears on every screen and PDF.
- **IC console:** committee details, validity status, cases, annual report builder.
- **GRC console (C1):** the same pattern per establishment: members by side, chair rotation, validity status, cases with the disposal clock.
- **Accident workspace (J6):** the case workspace with a statutory panel (ESIC report, accident notice, EC claim: status, due time, acknowledgement) and the medical section shown only to members with medical access; a location-level accident list for the safety officer.
- **Policy library:** employee view with "pending acknowledgement" chips; admin dashboard with acknowledgement %.

Correct linked-name display everywhere (fixes U84).

## 8. Migration & rollout
- **Wave 4:** IC setup, POSH complaints, the case engine core, the workplace accident / injury case type (J6, Must before launch), and a manual POSH awareness session log (date, audience, attendance count) for the annual report. From wave 5, awareness sessions come from M07 courses / templates.
- **Wave 5:** helpdesk, knowledge base, grievance, disciplinary, whistleblower, policies and the AI assistant.
- Import existing policies and IC composition. Open cases can be recorded as "migrated" with a summary.

## 9. Acceptance tests (samples)
- An employee can't file a grievance in a colleague's name (MS-D3).
- An HR Admin who isn't a case member gets 403 on a grievance; the access attempt is audited (MS-D4).
- In an anonymous grievance, the case owner sees "Anonymous" and can message; no identity field exists in the DB row.
- A POSH complaint filed on 1 Oct shows the inquiry due on 30 Dec, with escalation at 75 days.
- An IC with no external member shows "Committee not valid" on the IC console and the compliance calendar.
- A new policy version with re-acknowledge moves 200 employees to pending; reminders follow the P04 quiet hours.
- A payroll-category ticket is not visible to IT agents (YX-HD-03).
- A 45-worker warehouse has a GRC of 3 employer and 2 worker members: the GRC console shows "Committee not valid (unequal sides)"; after a third worker member is added it is valid, and a worker's grievance filed there is routed to the GRC with the disposal clock (YX-CASE-12; Correction C1).
- At a 320-worker plant, a disciplinary case for an incident on 5 Oct can cite only misconduct from the standing-orders version valid on 5 Oct, with its clause shown on the show-cause letter (YX-CASE-13; Correction C1).
- An ESI-covered machine operator injures a hand on 3 Oct and cannot work for 5 days: the case shows the ESIC accident report due per the P07 time limit on the compliance calendar and, because the absence exceeds the P07 reportable threshold, the statutory accident notice; the manager sees only the injury leave dates, not the diagnosis; on closure the accidents register for October has the entry (YX-CASE-14/15; J6).
- A non-ESI supervisor with a permanent partial disablement gets an EC claim computed from the P07 `IN.EC` rule set valid on the accident date; payment after the P07 due date adds interest and penalty lines (YX-CASE-16; J6).
- Reporting a near-miss offers no accident case type (YX-CASE-14).
- A whistleblower report at the Dublin entity (60 staff) received on 1 Oct shows "Acknowledge by 8 Oct" and "Feedback by" 3 months after acknowledgement; the same report at an Indian entity has no statutory clock (YX-CASE-17; R18).
- A long-term settlement signed with the recognised union on 15 Nov with effect from 1 Apr sends arrears inputs for the covered categories to M03 and appears on the union's register entry (YX-CASE-18; J4).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Helpdesk scope | **Configurable queues** (HR, Payroll, IT, Admin, Finance…) with categories, SLAs by priority, business hours, knowledge base, macros; AI assistant (P10 Q8) in front in wave 5; **email-to-ticket** via a company support address. |
| Q2 | Private tickets | **Sensitive categories** restricted to that queue (payroll, medical, personal); employee can mark any ticket **private** (only assigned agent + queue lead). |
| Q3 | Grievance confidentiality | **Named-confidential by default + anonymous option** (company can switch anonymous off); anonymous two-way messaging; case team only. |
| Q4 | Who sees POSH cases? | **Only IC members on the case (incl. external member, with a limited external login)**; HR sees anonymised counts and assigned actions; System Admin and support never; every access audited. |
| Q5 | Disciplinary process | **Configurable misconduct matrix** (minor / major per company standing orders) with default steps show-cause → reply (7 days) → optional inquiry → decision → letter → appeal; warnings expire (default 12 months) but stay on record. |
| Q6 | Policy acknowledgement | **Versioned policies** with audience targeting; acknowledgement by click (default) or OTP for critical policies; optional quiz (M07); re-acknowledge on major versions; reminders + manager escalation; onboarding task for joiners. |
| Q7 | Case record retention | **Closed cases retained 8 years** (align with P08 audit), then archived; POSH records per legal advice (default 8 years); disciplinary records on the employee file; company can extend; legal hold flag stops deletion. |
| Q8 | Whistleblower / vigil mechanism | **Yes, as a case type:** anonymous or named reports routed to an ethics officer (and audit committee chair for serious ones); separate from HR; available on web + mobile + (wave 5) WhatsApp link. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Configurable queues** (HR, Payroll, IT, Admin, Finance…) with categories, SLA by priority, business hours, knowledge base, macros, email-to-ticket via a company support address (sender matched to employee); AI assistant in front from wave 5 (P10 Q8). | 25 Sep 2026 |
| Q2 | **Sensitive categories** (payroll, medical, personal; company can add) visible only to that queue's agents; employee can mark any ticket **private** (assigned agent + queue lead only); private / sensitive tickets excluded from AI training / suggestions content. | 25 Sep 2026 |
| Q3 | **Grievances named-confidential by default + anonymous option** (company can switch anonymous off); anonymous two-way message channel (YX-CASE-03); visible to case team only; complainant may later reveal identity. | 25 Sep 2026 |
| Q4 | **POSH cases visible only to the IC members on the case**, incl. the external member via a limited external login (OTP, case-scoped, not a billed seat); HR sees anonymised counts and the actions assigned to it; System Admin and YukthiX support never (support-access sessions exclude case data); every access audited; a member with a conflict is excluded (YX-CASE-04). | 25 Sep 2026 |
| Q5 | **Configurable misconduct matrix** (minor / major per company standing orders, suggested actions); default steps show-cause → reply (7 days, extendable) → optional inquiry (inquiry officer, hearings) → decision → letter (P05) → appeal; **no penalty without show-cause**; suspension pending inquiry with subsistence allowance flag to payroll (M03); warnings expire (default 12 months) but stay on record; termination → M01 exit case. | 25 Sep 2026 |
| Q6 | **Versioned policies** with audience targeting (entity / location / department / designation); acknowledgement by click (default) or **OTP for critical policies** (P05 click-to-accept evidence); optional quiz (M07); major versions trigger re-acknowledgement; P04 reminders → manager escalation; joiners get them as onboarding tasks (M01); published policies feed the AI helpdesk (P10 Q8). | 25 Sep 2026 |
| Q7 | **Closed cases retained 8 years** from closure (aligned with P08 audit), then archived (encrypted, restricted restore); company can extend; **legal hold** flag blocks archive / deletion; disciplinary outcomes and active warnings stay on the employee file; POSH retention confirmed with legal advice (team action). | 25 Sep 2026 |
| Q8 | **Whistleblower / vigil mechanism as a case type:** anonymous or named reports routed to a designated **ethics officer**, serious ones (per company threshold / category) also to the **audit committee chair** (limited external login); separate from HR (HR not a member unless added); web + mobile at wave 5, WhatsApp link with the wave-5 assistant; retaliation protection flag (YX-CASE-08). | 25 Sep 2026 |
| E16 | **Non-employee parties and exits during a case (GAP-REGISTER E16):** external-party record (name, employer, contact) for a complainant or respondent who is a contractor, vendor staff, client staff or visitor; notice delivery and coordination with the respondent's employer; external complainant via the OTP external login (P02 §4.7). Case continues when a party exits; an ex-employee can file within the legal window (3 + 3 months) via alumni-scoped access; M01 exit pre-check flags open cases (YX-CASE-09, YX-CASE-10). | 26 Sep 2026 |
| E20 | **Anonymous reporter return path (GAP-REGISTER E20):** one-time **case access code** (random, hashed, shown once) for status and replies on a no-login page; no identity stored; optional contact for a content-free "you have an update" alert, stored encrypted and visible to nobody (YX-CASE-11). | 26 Sep 2026 |
| C1 | **Correction C1 (validation pass 3), 28 Sep 2026:** IR Code (P07 `IN.IR`) **Grievance Redressal Committee** for establishments with 20+ workers, modelled like the POSH IC: equal employer / worker representation, chair alternating between the sides, women members in proportion, validity banner; worker grievances routed to it with the statutory disposal clock (period per IR Code rules, verify) and an appeal path (per IR Code rules, verify). **Standing orders** at 300+ workers linked to the misconduct matrix (clause per misconduct type, version by incident date). §3, §4, §6, §7, YX-CASE-12/13. | 28 Sep 2026 |
| J6 | **Validation pass 3 Must (J6), founder decision 28 Sep 2026 (option A):** statutory accident and injury handling as a new case type **workplace accident / injury**: incident record for an employee or contract worker (date / time, place, description, witnesses, photos, injury type, body part, first aid, hospital); near-misses excluded; medical details Special; **ESIC accident report** (prescribed time per ESI regs, verify) and **Factories Act / OSH Code accident notice** for reportable accidents (death or disablement beyond the prescribed days), both auto-filled with deadlines on the compliance calendar; **Employees' Compensation claim tracking** for non-ESI staff (P07 `IN.EC` formula, deposit with the commissioner, due dates, interest / penalty); injury leave in M02 (YX-LV-15) paid per company policy (D17) above the statutory floor (ESI benefit for ESI-covered, EC for others; M03 YX-PAY-50); the accidents register (M03 YX-PAY-39) filled automatically; templates APX-F #109–111. §1, §3, §4, §6 flow 7, §7, §9, YX-CASE-14/15/16. | 28 Sep 2026 |
| Validation pass 3 Should (J4), founder decision 28 Sep 2026 | **Collective dispute / settlement records** as a case type (union or worker group, conciliation, signed settlement, authority copy per IR Code, verify; arrears to M03). Wave 4. §3, §4, YX-CASE-18. | 28 Sep 2026 |
| Validation pass 3 Should (R18), founder decision 28 Sep 2026 | **EU whistleblower timings as jurisdiction parameters** (acknowledge 7 days, feedback 3 months, records; per national transposition, verify). Wave: first EU customer with 50+ staff. §3, YX-CASE-17. | 28 Sep 2026 |
