# 08 · Recruitment — UI Reference

> **Purpose.** How Frappe HR lays out staffing plans, requisitions, job openings, the careers page, applicants, interviews, referrals and offers.
> **Companion to:** [08-recruitment.md](08-recruitment.md) (behaviour) and [08-recruitment.data-dictionary.md](08-recruitment.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 16 screenshots in [`../ui-screens/08-recruitment/`](../ui-screens/08-recruitment/). Internal reference only. All candidates are fictional.

## Read this first — Frappe is not the main blueprint here

Unlike modules 01–07, YukthiX **already has most of an ATS** in the exam app (see [exam-app-reuse-inventory.md](../exam-app-reuse-inventory.md) §2): pipeline board, AI fit scoring, careers site per tenant, job-board feeds, referrals with rewards, offers with templates and e-accept, calendar-synced panel interviews, candidate portal. Decision D9 schedules the ATS after HRMS wave 5.

This document therefore uses Frappe only to:
1. spot things **Frappe has and the exam app lacks** (headcount plan with budget, appointment letter, per-skill interview scoring, hand-off to onboarding);
2. record **what not to copy**.

| Capability | Frappe | Exam app (inventory) | YukthiX direction |
|---|---|---|---|
| Headcount / staffing plan with budget | ✅ Staffing Plan (§1.2) | ❌ `Job.headcount` only, no budget | **Add** from Frappe's idea, in the YukthiX style |
| Requisition approval | ⚠️ a status field, no approver flow | ✅ approval gate | Keep exam app |
| Pipeline board | ⚠️ generic kanban on status | ✅ configurable pipelines | Keep exam app |
| Careers page | ⚠️ basic `/jobs` | ✅ branded per tenant, AI assistant | Keep exam app |
| Interview feedback per skill | ✅ skill ratings per interview type | ✅ scorecards (rating + note) | Merge: skills per interview type into exam-app scorecards |
| Offer letter | ✅ offer terms table | ✅ templates, PDF, e-accept | Keep exam app |
| Appointment letter (after acceptance) | ✅ | ❌ | **Add** to HRMS letters (module 05 §2 screen 3) |
| Hand-off on acceptance → employee + onboarding | ✅ connections to Employee / Employee Onboarding | ⚠️ pushes to external HRIS only | **Build**: offer accepted → pre-boarding (module 05) |
| Resume parsing, dedupe, AI fit | ❌ | ✅ | Keep exam app |
| Assessment (proctored test) in pipeline | ❌ | ✅ (JobExam) | Keep exam app (unique strength) |

## Demo data behind the screenshots

| Item | Setup |
|---|---|
| Skills | Negotiation, CRM Hygiene, Communication, Territory Planning. |
| Interview types | HR Screen, Sales Role-play (with expected skills). |
| Staffing plan | "Sales FY 2026-27": 3 Sales Representatives @ ₹4.8 L + 1 Manager @ ₹12 L. |
| Job requisition | Priya, 2 Sales Reps for Chennai, "Open & Approved". |
| Job opening | "Sales Representative – Chennai", published with salary range ₹30–45 k/month. |
| Applicants | Sneha (shortlisted), Faisal (shortlisted), Rohit (open, walk-in), Divya (open, referral), Manoj (rejected), plus Kavya from module 05. |
| Interviews | Sneha: Sales Role-play on 22 Sep, **cleared**, feedback with skill ratings. Faisal: HR Screen on 26 Sep, pending. |
| Referral | Arjun refers Divya. |
| Offer | Sneha: ₹5.1 L, joining 15 Oct, awaiting response. |

**Set-up issues found:**
- The staffing plan needs a manually typed name.
- The public job URL generated from the title keeps the en-dash: `/jobs/workfox/sales-representative-–-chennai`. A non-ASCII slug breaks when the link is shared.

---

## 1. Screen-by-screen

### 1.1 Recruitment home — [01](../ui-screens/08-recruitment/01-recruitment-workspace.png) · Dashboard — [15](../ui-screens/08-recruitment/15-recruitment-dashboard.png) · Analytics report — [16](../ui-screens/08-recruitment/16-report-recruitment-analytics.png)
- **Layout:** sidebar (Dashboard, **Hiring Pipeline**, Job Opening, Job Applicant, Interview, Job Offer, Appointment Letter, Planning ›, Reports ›, Setup ›, Job Portal, Settings). Workspace cards and charts.
- **YukthiX:** use the exam app's hiring analytics (funnel, time-to-hire, sources) and add **plan vs actual headcount** from §1.2.

### 1.2 Staffing plan — [02](../ui-screens/08-recruitment/02-staffing-plan.png) · Requisition — [03](../ui-screens/08-recruitment/03-job-requisition.png)
- **Staffing plan layout:** company, department, dates; a grid per designation (vacancies, estimated cost per position, total, current count, current openings); total estimated budget. A "get job requisitions" button.
- **Requisition layout:** designation, department, positions, expected compensation, company, **status (a dropdown including "Open & Approved")**, requested by (employee) with department and designation, posting / expected-by / completed dates, time to fill, description, reason.
- **Observed:**
  - The staffing plan is **the one idea the exam app lacks**: headcount and budget per department and designation, with current count and open positions next to it.
  - "Approval" of a requisition is just selecting a status value; there is no approver or audit.
- **YukthiX:** a **headcount plan** per legal entity and department:
  - Planned vs filled vs open vs budget.
  - Requisitions raised **against a plan line**. An over-plan requisition needs extra approval.
  - The approval uses the exam app's requisition gate.
  - A live "budget used" indicator (offers accepted × CTC).

### 1.3 Job opening — [04](../ui-screens/08-recruitment/04-job-opening.png) · Careers list — [13](../ui-screens/08-recruitment/13-careers-list.png) · Job page — [14](../ui-screens/08-recruitment/14-careers-job-page.png)
- **Opening layout:** title, designation, status, dates, company, department, employment type, location, staffing plan, vacancies, requisition; publish flags (publish, show applications received, show salary); description; salary range.
- **Public job page layout:** breadcrumb; big title; "workfox · 3 weeks ago"; an info grid with icons (department, salary range, employment type, **applications received: 6**, closes on); description; "Apply Now"; footer "Powered by ERPNext".
- **Observed:**
  - The public page shows the **internal department code "Sales - W"** (company abbreviation suffix).
  - It advertises the **number of applications**, which most employers don't want public.
  - It carries **third-party branding**, with no company logo or theme.
- **YukthiX:** the exam app's branded careers site (`/careers/[orgSlug]`). Keep Frappe's clean **info-grid** pattern for job facts, but show public-friendly names only, keep the application count private, and use ASCII slugs.

### 1.4 Applicants — list [05](../ui-screens/08-recruitment/05-job-applicant-list.png), kanban [06](../ui-screens/08-recruitment/06-job-applicant-kanban.png), applicant [07](../ui-screens/08-recruitment/07-job-applicant-form.png)
- **Kanban:** columns are the fixed applicant statuses (Open 2, Replied 0, Shortlisted 2, Rejected 1, Hold…). Cards show **only the name**, with no job, rating, source or days in stage. The board is labelled "**test**", a leftover board name on this instance.
- **Applicant form layout:**
  - Tabs Details / Salary Expectation.
  - Connections (Employee, Job Offer 1, Interview 1, Employee Onboarding, Appointment Letter).
  - **Interview summary table** (interview, type, date, status, stars).
  - Details (name, email, phone | job opening, designation, country | status, applicant rating).
  - Resume link, cover letter, attachment, notes, source.
  - Header: Schedule Interview.
- **Observed:**
  - Statuses are one global list, not per-job pipeline stages.
  - **The applicant's record ID is their email address**, so interviews are titled "sneha.iyer@example.com" (§1.5).
  - The interview summary inside the applicant form is a good pattern.
- **YukthiX:** keep the exam app's pipeline board and candidate profile. From Frappe, take the idea of the **interview summary table on the candidate page**, and the connections to offer / appointment letter / onboarding.

### 1.5 Interviews — cleared [08](../ui-screens/08-recruitment/08-interview-cleared.png), pending [09](../ui-screens/08-recruitment/09-interview-pending.png), feedback [10](../ui-screens/08-recruitment/10-interview-feedback.png)
- **Interview layout:**
  - Tabs Details / Feedback; connection (Interview Feedback 1).
  - Type, applicant, opening, designation, resume link | status, scheduled on, from/to time.
  - Interviewers grid; ratings (**expected average rating: empty stars**, obtained 4 stars); collapsed summary.
- **Feedback layout:** interview, type, applicant, interviewer, result (Cleared / Rejected), a **skill-assessment grid** (skill, stars), free text.
- **Observed:**
  - The interview is titled by the applicant's **email**.
  - No meeting link, calendar invite or location is shown.
  - "Expected average rating" is blank, so there is no bar to compare against.
  - Status "Cleared" was set by hand after the feedback; nothing prompts the next stage.
- **YukthiX:** the exam app's panel console and calendar sync. Add from Frappe:
  - **Skills per interview type**, pre-filled into the scorecard.
  - **A pass bar per interview type** (expected rating), with a clear hire / no-hire recommendation.

### 1.6 Referral — [11](../ui-screens/08-recruitment/11-employee-referral.png) · Offer — [12](../ui-screens/08-recruitment/12-job-offer.png)
- **Referral layout:** candidate details, for designation, current employer and title, resume, referrer, bonus applicable, payment status, reason.
- **Offer layout:** applicant, offer date, designation, company, status (Awaiting Response); offer-terms table (Annual CTC ₹5,10,000; joining 15 Oct; probation 6 months; location Chennai); terms template; letter head.
- **Observed:**
  - Offer terms are free-text value pairs. The CTC is text ("₹5,10,000"), not a number linked to a salary structure, so the accepted offer can't flow into payroll.
  - There is no e-accept for the candidate on this screen.
- **YukthiX:** the exam app's offers (templates, approval, e-accept). **The offer carries a structured CTC** built with the CTC designer (module 03 §1.3). On acceptance it creates the pre-boarding record (module 05) and the draft compensation with no retyping. Referral bonus payout → payroll additional pay (module 03 §1.7).

---

## 2. YukthiX Recruitment — what HRMS adds to the exam-app ATS

| # | Screen / feature | Source idea | Notes |
|---|---|---|---|
| 1 | **Headcount plan & budget** | Frappe staffing plan | Plan lines, requisitions against plan, budget used |
| 2 | Skills per interview type + pass bar in scorecards | Frappe interview type / feedback | Merge into exam-app scorecards |
| 3 | **Offer → pre-boarding hand-off** with structured CTC | Frappe connections; module 03/05 | No retyping; creates employee on joining |
| 4 | Appointment letter | Frappe | Part of HRMS letters |
| 5 | Referral bonus → payroll | Frappe referral payment status | Via one-time pay in the run |
| 6 | Interview summary on candidate page | Frappe applicant form | If the exam app lacks it |

---

## 3. UI issues seen on the instance (do not copy)

U1–U76 are in modules 01–07.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U77 | Job opening URL | Non-ASCII slug `…-–-chennai` generated from the title. | ASCII slugs. |
| U78 | Careers page | Internal department code "Sales - W", public application count, third-party branding. | Public-friendly fields; employer branding. |
| U79 | Requisition | Approval = choose "Open & Approved" in a dropdown. | Approver flow with audit. |
| U80 | Applicants | Email used as record ID and as interview title. | Human-readable names; opaque IDs. |
| U81 | Kanban | Cards show only names; board labelled "test"; global statuses instead of per-job stages. | Rich cards; per-job pipelines. |
| U82 | Interview | No meeting link; expected rating blank; status set by hand. | Calendar and meeting links; pass bar; next-step prompt. |
| U83 | Offer | CTC as free text, not linked to a salary structure. | Structured offer that flows to payroll. |

---

## 4. Capture notes

- **Demo data:** `yx_demo08.py` in the session scratchpad: skills, interview types, staffing plan (named manually), requisition, published job opening, 5 fictional applicants, 2 interviews (1 with submitted feedback), referral (submitted), offer (awaiting).
- The **Hiring Pipeline** page listed in the sidebar was not captured. The exam app's pipeline board is the reference for that screen.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); default company (restored to *workfox (Demo)*).
- The recruitment data remains on the instance.
