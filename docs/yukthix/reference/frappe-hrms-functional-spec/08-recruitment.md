# 08 · Recruitment — Functional Reference

**Source studied:** Frappe HR, `develop` branch, folder `hrms-develop/hrms` (staffing plan, job requisition, job opening + careers page + application form, job applicant, employee referral, interview type / interview / feedback, job offer)
**Maps to YukthiX:** **§1.2.2 Internal ATS** (+ §1.2.1 shared candidate & interview layer, §1.3.1 headcount planning, §1.3.2 onboarding handoff)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance.
**Data dictionary:** every object and field → [08-recruitment.data-dictionary.md](08-recruitment.data-dictionary.md)
**Not in Frappe:** external staffing (clients, submissions, placements, rate cards — §1.2.3), AI interviews, resume parsing, job-board posting. Those are YukthiX-only designs.

---

## 0. How it works — the big picture

```
 Staffing Plan (company × period: designation → vacancies, cost per position, budget)
        ▲ can be built from requisitions            │ caps openings and offers
 Job Requisition (department asks: designation, positions, expected pay, reason)
        │ approved → "create job opening"
        ▼
 Job Opening ──publish──► Careers page (/jobs) ──► Application web form ──► Job Applicant
        ▲                                                           ▲
        └── Employee Referral (employee refers someone) ──────────────┘
                                                                    │ (status: Open → Replied → Shortlisted → Hold → Accepted / Rejected; kanban)
 Interview Type (round: designation, interviewers, expected skills, expected rating)
        ▼
 Interview (applicant × round × date/time, interviewers) ──► Interview Feedback (per interviewer: skill ratings + result)
        │ Cleared / Rejected → offer to update applicant status
        ▼
 Job Offer (terms from template, status Awaiting / Accepted / Rejected) ──► Employee / Onboarding (module 05)
        (referral bonus → Additional Salary for the referrer, module 03)
```

---

## 1. Staffing Plan (headcount & budget)

**Data.** Company, department, from & to date; rows per **designation**: vacancies, estimated cost per position, current count (active employees), current openings, number of positions (= current + vacancies), total estimated cost (= vacancies × cost); total budget.

| ID | Rule |
|---|---|
| RC-SP-01 | From ≤ to. |
| RC-SP-02 | Only one submitted plan per designation per company for overlapping periods. |
| RC-SP-03 | Current count and openings are counted across the company **and all its subsidiaries**. |
| RC-SP-04 | **Group companies:** a subsidiary's vacancies / budget for a designation can't exceed its parent's plan, and all subsidiaries together can't exceed the parent; a parent can't plan fewer than its subsidiaries already have. |
| RC-SP-05 | Can be filled from selected job requisitions. |

> **Example.** Designation "Software Engineer": 40 active, vacancies 10, ₹12 L per position → positions 50, cost **₹1.2 Cr**.

## 2. Job Requisition (hiring request)

**Data.** Designation, department, number of positions, expected compensation, company, requested by (employee), status (Pending / Open & Approved / Rejected / Filled / On Hold / Cancelled), posting date, expected by, completed on, time to fill, job description, reason.

| ID | Rule |
|---|---|
| RC-JR-01 | Warning helper: an active requisition (not cancelled / filled) for the same designation + department + requester already exists. |
| RC-JR-02 | Status "Filled" with completion date → **time to fill** = completed − posted (average shown on dashboards). |
| RC-JR-03 | "Create job opening" copies designation, department, positions → vacancies, expected compensation → lower salary range, description; or link to an existing opening. |
| RC-JR-04 | Closing the linked job opening marks the requisition **Filled** with today as completion date. |
| RC-JR-05 | Status is set by hand — no approval workflow. HR User can only read requisitions. |

## 3. Job Opening & careers page

**Data.** Job title, designation, department, company, employment type, location, status (Open / Closed), posted on, closes on, closed on, vacancies, staffing plan + planned positions, job requisition, description, salary range (lower, upper, currency, per month / year), **publish on website**, publish salary range, publish applications count, **prevent duplicate applications**, application form route, template.
**Template:** reusable title, designation, department, employment type, location, description, salary range.

| ID | Rule |
|---|---|
| RC-JO-01 | Web address auto-built as jobs / company / title. |
| RC-JO-02 | Open → posted ≤ closes-on; Closed → posted ≤ closed-on. Closing sets closed-on (today); reopening clears it. |
| RC-JO-03 | **Vacancy check:** if a staffing plan covers the designation, opening another when (active employees + other open openings) ≥ planned positions is blocked. Closing an opening under a plan shows a warning. |
| RC-JO-04 | **Daily job:** openings past their closes-on date are closed automatically. |
| RC-JO-05 | **Careers page:** lists open + published openings, 20 per page, search (title / description), filters (company, department, employment type, location), sort by posted date, application count; each opening has its own page and an **apply** form. |

## 4. Job Applicant

**Data.** Name, e-mail (identity), phone, country, status (Open / Replied / Shortlisted / Rejected / Hold / Accepted), job opening, designation, source (+ source name), employee referral, cover letter, resume attachment / link, notes, rating, expected salary range + currency.

| ID | Rule |
|---|---|
| RC-JA-01 | Record identity = e-mail (numbered if repeated). E-mail must be valid; missing name derived from the e-mail. |
| RC-JA-02 | Can't apply to a **closed** opening. If the opening prevents duplicates, the same e-mail can't apply twice to it. |
| RC-JA-03 | Applications from the website get source "Website Listing". |
| RC-JA-04 | Linked referral's status follows the applicant: Open / Replied / Hold → In Process; Accepted / Rejected → same. |
| RC-JA-05 | Kanban board by status (Open, Replied, Shortlisted, Accepted). |
| RC-JA-06 | Create interview / schedule interview (round must match the applicant's designation); create job offer; create employee (maps name, e-mail, phone, currency, company / department / employment type from the opening). |
| RC-JA-07 | Metric: applicant-to-hire % = accepted ÷ all applicants. |

## 5. Employee Referral

**Data.** First / last name, e-mail, phone, current employer & title, date, for designation, department, resume, work references, reason qualified, referrer (employee), status (Pending / In Process / Accepted / Rejected / Cancelled), eligible for referral bonus (default yes), bonus payment status (Unpaid / Paid).

| ID | Rule |
|---|---|
| RC-ER-01 | Referrer must be active; one referral per e-mail. |
| RC-ER-02 | Create job applicant from referral (source "Employee Referral"; status → In Process). |
| RC-ER-03 | Bonus: eligible → payment status Unpaid; **pay via Additional Salary** to the referrer (only if the referral is Accepted — module 03 PY-ADD-08); submitting that marks it Paid. |

## 6. Interview rounds, interviews, feedback

**Interview Type (round).** Name, designation (optional), description, expected skills (list), expected average rating, default interviewers (users with the Interviewer role).

**Interview.** Applicant, job opening, designation, round, scheduled date, from & to time, interviewers, resume link, expected vs obtained average rating, summary, status (Pending / Under Review / Cleared / Rejected / Cancelled), reminded flag.

| ID | Rule |
|---|---|
| RC-IV-01 | An applicant can't have two submitted interviews of the same round. |
| RC-IV-02 | Round designation must match the applicant's designation. |
| RC-IV-03 | Only **Cleared** or **Rejected** interviews can be submitted; then HR is offered to set the applicant Accepted / Rejected. |
| RC-IV-04 | Reschedule changes date/time and e-mails interviewers and the applicant. |
| RC-IV-05 | Calendar view coloured by status. |
| RC-IV-06 | **Reminders** (HR settings): e-mail before the interview (default lead 15 min, to interviewers + applicant, once); daily e-mail to interviewers who haven't submitted feedback. |

**Interview Feedback.** Interview, round, applicant, interviewer, skill ratings (from the round's expected skills), feedback text, result (Cleared / Rejected), average rating.

| ID | Rule |
|---|---|
| RC-IF-01 | Only an interviewer **listed on the interview** can submit (and only as themselves via the quick form). |
| RC-IF-02 | Can't submit before the interview date. |
| RC-IF-03 | One submitted feedback per interviewer per interview. |
| RC-IF-04 | Feedback average = mean of skill ratings; interview's obtained rating = mean of all submitted feedback. Skill-wise averages across interviewers shown on the interview. |

> **Example.** Round expects Python, SQL, Communication (expected 3.5 / 5). Interviewer A: 4, 3, 5 → 4.0; B: 3, 3, 4 → 3.33 → obtained **3.67** ≥ 3.5.

## 7. Job Offer

**Data.** Applicant, name, e-mail, designation, company, offer date, status (Awaiting Response / Accepted / Rejected / Cancelled), offer terms (term + value, from a term template), terms & conditions, letter head, print heading.

| ID | Rule |
|---|---|
| RC-JF-01 | One active offer (not rejected / cancelled) per applicant e-mail. |
| RC-JF-02 | **Vacancy check** (HR setting, off by default): offers submitted in the staffing plan period for that designation must stay below planned vacancies. |
| RC-JF-03 | Offer status Accepted / Rejected updates the applicant status. |
| RC-JF-04 | Create employee from offer (name, personal e-mail, offer date → confirmation date); onboarding (module 05) is keyed on the offer. |
| RC-JF-05 | Metric: offer acceptance % = accepted ÷ submitted offers. |

> Note: the offer has **no structured salary / CTC fields** — pay is written as free-text terms.

## 8. Reports, settings, permissions

**Recruitment Analytics report:** staffing plan → job opening → applicant → status → offer → offer status, per designation.
**HR Settings (hiring):** interview reminder + template + lead time, feedback reminder + template, hiring sender e-mail, check vacancies on offer (off).

| Object | Employee | Interviewer | HR User | HR Manager |
|---|---|---|---|---|
| Staffing Plan | — | — | create, submit | full |
| Job Requisition | — | — | **read only** | full |
| Job Opening / Template | — | — | create/edit | full |
| Job Applicant | — | — | create/edit | full |
| Employee Referral | create, submit | — | full | full |
| Interview Type | — | full | full | full |
| Interview | — | full | full | full |
| Interview Feedback | — | full | **read** | **read** |
| Job Offer | — | — | create, submit | full |

## 9. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| RC-D1 | HR User can't create requisitions; department heads (not HR) have no role to raise them — contradicts "departments raise their own needs". | Log in as a department head. |
| RC-D2 | No approval workflow on requisitions or offers (status typed by hand). | — |
| RC-D3 | Applicant identity = e-mail → the same person applying to two openings becomes two records (numbered); no candidate de-duplication or merge. | Apply twice with one e-mail to different openings. |
| RC-D4 | Job offer has no salary / CTC fields and doesn't create a salary assignment. | Create an offer. |
| RC-D5 | Vacancy check on offers is off by default and counts offers, not joiners. | — |
| RC-D6 | Interview reminder e-mails the applicant using the internal template (may expose internal content). | Enable reminders. |
| RC-D7 | Only one round per type per applicant — can't repeat a round (e.g. re-interview). | Second "Technical" interview. |
| RC-D8 | Referral bonus has no rules (after N days of joining, amount by level). | — |

## 10. Gap analysis vs YukthiX spec §1.2.1 / §1.2.2

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Manpower requisition against approved headcount budget | ⚠️ requisition + staffing plan, no approval | ✅ | Approval workflow; department heads raise. |
| Branded careers page per tenant | ✅ basic | ✅ | Tenant branding, SEO, custom domain. |
| Job board posting & distribution | ❌ | ✅ | Naukri, LinkedIn, Indeed integrations. |
| Resume parsing, dedup, merge, talent pool, hotlist | ❌ | ✅ | Must build; AI layer. |
| Candidate portal (status, documents) | ❌ | ✅ | Must build. |
| Pipeline stages | ⚠️ fixed statuses | ✅ | Configurable stages per job. |
| AI first-round interview | ❌ | ✅ | YukthiX differentiator. |
| Assessments | ❌ | ✅ via Proctoring §1.1 | Auto-shortlist from test scores. |
| Panel interviews, scorecards, feedback | ✅ | ✅ | Add calendar sync (Google / Microsoft). |
| Offer management, approval, letter generation | ⚠️ terms only | ✅ | Structured CTC, approval, e-sign, letter. |
| Handoff to onboarding | ✅ | ✅ §1.3.2 | |
| Employee referrals + bonus | ✅ | ✅ | Bonus rules. |
| Background verification | ❌ | ✅ | Provider integration. |
| Candidate consent & retention (DPDP / GDPR) | ❌ | ✅ | Must build. |
| Recruiter dashboards (time to hire, source, funnel) | ⚠️ time to fill, acceptance %, one report | ✅ §1.4.5 | |
| External staffing (clients, submissions, rates, placements) | ❌ | ✅ §1.2.3 | YukthiX-only. |

## 11. YukthiX design questions (for the later design phase)

1. Who can raise requisitions, and what approval chain?
2. Configurable pipeline stages per job, or a fixed set?
3. Which job boards first?
4. Candidate identity: one person across jobs (dedup by e-mail + phone)?
5. Offer: structured CTC with approval and e-sign at launch?
6. AI interview: which rounds, how is it scored?

## 12. Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Staffing & requisition | `hr/doctype/staffing_plan*/`, `job_requisition/` |
| Openings & careers | `hr/doctype/job_opening*/`, `www/jobs/`, `hr/web_form/job_application/`, `templates/generators/job_opening.html` |
| Applicants & referrals | `hr/doctype/job_applicant*/`, `employee_referral/` |
| Interviews | `hr/doctype/interview*/`, `skill_assessment/`, `expected_skill_set/` |
| Offers | `hr/doctype/job_offer*/`, `offer_term/` |
| Report | `hr/report/recruitment_analytics/` |
