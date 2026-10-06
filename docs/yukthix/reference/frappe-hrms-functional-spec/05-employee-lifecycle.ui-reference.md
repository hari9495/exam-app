# 05 · Employee Lifecycle — UI Reference

> **Purpose.** How Frappe HR lays out onboarding, promotion, transfer, separation, exit interview and full & final settlement, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [05-employee-lifecycle.md](05-employee-lifecycle.md) (behaviour) and [05-employee-lifecycle.data-dictionary.md](05-employee-lifecycle.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 16 screenshots in [`../ui-screens/05-lifecycle/`](../ui-screens/05-lifecycle/). Internal reference only. Frappe's mobile app has no lifecycle screens.

## Demo data behind the screenshots

| Journey | What was set up |
|---|---|
| **Join** | Applicant *Kavya Menon* (Sales Representative) → job offer (accepted) → onboarding from template "Sales Onboarding" (5 activities: collect PAN/Aadhaar/bank, laptop & email, ID card, induction, CRM access). Joining 1 Oct 2026. First task marked done. |
| **Grow** | *Arjun* promoted today, Business Development Manager → Manager, CTC ₹6.6 L → ₹7.8 L. |
| **Move** | *Rahul* transfer Hyderabad → Chennai, dated 5 Oct (draft). |
| **Leave** | *Meera* resigned 20 Sep, relieving 19 Oct, "higher studies". Separation from template "Standard Exit" (handover, asset return, finance clearance, revoke access). Exit interview scheduled 15 Oct. Full & final statement drafted. |

**Problems hit while creating the data (UI lessons):**
- **Pre-joining tasks are impossible.** With the onboarding start (25 Sep) before the joining date (1 Oct), creation failed: a *task* cannot start before its *project*, and the project starts on the joining date. So "collect documents before day 1" cannot be scheduled.
- The F&F statement listed Gratuity, Expense Claim, Bonus, Leave Encashment and Employee Advance, **all at ₹0**. It computes nothing itself (§1.6).

---

## 1. Screen-by-screen

### 1.1 Onboarding — template [02](../ui-screens/05-lifecycle/02-onboarding-template.png), onboarding [03](../ui-screens/05-lifecycle/03-employee-onboarding.png), project [04](../ui-screens/05-lifecycle/04-onboarding-project.png), tasks [05](../ui-screens/05-lifecycle/05-onboarding-tasks.png), job offer [06](../ui-screens/05-lifecycle/06-job-offer.png)
- **Onboarding layout:**
  - Job offer, applicant, template | company, boarding status, project.
  - Employee details (name, department, joining date, onboarding begins on, holiday list).
  - An **activities grid** (activity, user, begin on (days), duration (days)); notify by email.
  - Header: View ▾, Create ▾ (employee), **Mark as Completed**.
- **How it works:** submitting creates a **Project** in the Projects module and one **Task** per activity. Progress lives there: a separate module and sidebar, with an ERPNext "Getting started: Projects setup 0/4" pop-up over the screen.
- **Observed:**
  - The onboarding form does **not show task status**. The grid has no task link or done state, so HR must jump to the project or task list to see progress. The task list shows cut-off subjects ("Collect PAN, Aadh…") and generic project columns (Is Group, Is Milestone, Priority Low).
  - The project shows **0 % complete** with one of five tasks done: progress is not linked back.
  - **The new hire has no part in it.** There is no pre-boarding portal to upload documents or sign letters. The first task, "Collect PAN, Aadhaar & bank details", is an HR chore.
  - The onboarding record is found through the **"Tenure"** workspace, while the job offer lives under Recruitment.
- **YukthiX:** an **onboarding board** for HR (columns: Offer accepted → Pre-boarding → Day 1 → First 30 days → Done). Each card shows a checklist progress ring.
  - **Checklist with owners:** HR, IT, manager and **the new hire**. Tasks are relative to the joining date and can be negative (−7 days).
  - **Pre-boarding portal** (mobile): welcome, document upload (PAN, Aadhaar, bank, photo), e-sign offer and NDA, fill profile; the collected data creates the employee record.
  - Reminders and escalation on overdue tasks. No separate project module.

### 1.2 Promotion — [07](../ui-screens/05-lifecycle/07-promotion.png) · Employee after promotion — [09](../ui-screens/05-lifecycle/09-employee-after-promotion.png)
- **Layout:** employee, promotion date | company; **property grid** (property, current, new: here Designation BDM → Manager); salary details (current CTC, revised CTC).
- **Observed:**
  - On submit the employee's designation changed and **"Cost to Company" on the employee changed 0 → ₹7,80,000**, but the **salary assignment was not touched**. Arjun's payroll still uses ₹55,000/month (₹6.6 L). Two CTC figures now disagree, and the revision never reaches payroll unless someone remembers to create a new assignment.
  - History goes to a collapsed "History In Company" section on the employee's Profile tab. The only other trace is the activity log.
  - Promotion lives in the **Performance** workspace, transfer in HR, onboarding in Tenure.
- **YukthiX:** one **"Change" action** on the employee (promotion, transfer, revision, role change, manager change) with an effective date:
  - **Promotion + pay revision is one transaction:** new designation/grade and new CTC → a new compensation record with arrears preview (module 03) → approval → letter generated.
  - An employee **timeline** shows every change (joined, promoted, transferred, revised) with its letter attached.

### 1.3 Transfer — [08](../ui-screens/05-lifecycle/08-transfer-draft.png)
- **Layout:** employee, transfer date | company, new company; property grid (Branch: Hyderabad → Chennai); reallocate leaves, create new employee ID.
- **Observed:** it only changes fields on the employee record. There is no link to the effects a transfer really has in India:
  - shift and location geofence (module 02);
  - holiday calendar;
  - **PT state** (Telangana → Tamil Nadu changes the PT slab: module 04);
  - reporting manager.
- **YukthiX:** the same "Change" action (§1.2) with an **impact preview**: "Holiday calendar → Chennai 2026-27, PT → Tamil Nadu (half-yearly), shift → Sales Flexi, manager → Priya Sharma". Scheduled changes apply on the effective date.

### 1.4 Separation — template [10](../ui-screens/05-lifecycle/10-separation-template.png), separation [11](../ui-screens/05-lifecycle/11-employee-separation.png), employee Exit tab [14](../ui-screens/05-lifecycle/14-employee-exit-tab.png)
- **Separation layout:** employee, name, department, designation | company, status, resignation letter date, separation begins on, project; template; activities grid; notify.
- **Employee Exit tab:** resignation letter date, relieving date | exit interview held on, new workplace | leave encashed?; reason for leaving, feedback.
- **Observed:**
  - The **relieving date lives on the employee record**, not on the separation, so the separation screen shows no last working day or notice period.
  - **Notice period is not calculated** (resigned 20 Sep, relieving 19 Oct = 30 days; nothing checks it against a policy or suggests a shortfall recovery).
  - Same task-visibility gap as onboarding (§1.1).
  - Meera stays **"Active"** with no indication she is serving notice.
- **YukthiX:** an **exit case** with a stepper:

  | Step | What happens |
  |---|---|
  | 1. Resignation | Employee submits in the app, or HR records it. |
  | 2. Approval & notice | Manager/HR approve; notice period from policy, last working day, buy-out / shortfall calculation, early release option. |
  | 3. Clearance checklist | Handover, assets, finance, IT; each owner signs off. |
  | 4. Exit interview | |
  | 5. F&F settlement | See §1.6. |
  | 6. Documents | Relieving letter, experience letter, service certificate. |

  The employee header shows a badge: "Serving notice · last day 19 Oct".

### 1.5 Exit interview — [12](../ui-screens/05-lifecycle/12-exit-interview.png)
- **Layout:**
  - Employee, name, email | company, status (Scheduled), date.
  - Employee details (department, designation, reports to | joining date, relieving date).
  - Exit questionnaire (reference document type/name, "questionnaire email sent"; header button "Send Exit Questionnaire", which needs a separately built web form).
  - Interview details: interviewers, rich-text summary, final decision.
- **Observed:**
  - The **"Reports To" field shows "HR-EMP-00002: Meera Nair"**. HR-EMP-00002 is Vikram, so the display name next to the manager's ID is the leaver's own. This looks like a display/fetch defect; add it to the functional spec's defect list for verification.
  - The summary is free text: nothing structured to analyse (reasons, rating, would-rejoin).
- **YukthiX:** a structured exit survey (reason categories, ratings, "would you rejoin / recommend", free text) that the employee fills in the app. The interviewer adds notes. Answers feed **attrition analytics** (Analytics product).

### 1.6 Full & final settlement — [13](../ui-screens/05-lifecycle/13-full-and-final.png)
- **Layout:**
  - Connections (Journal Entry).
  - Employee, name, transaction date | company, status (**Unpaid**).
  - Employee details (joining, relieving, designation, department).
  - **Payables grid** (Gratuity, Expense Claim, Bonus, Leave Encashment: component, reference document, account, amount, status Unsettled).
  - **Receivables grid** (Employee Advance).
  - Assets allocated (auto-fetched; none).
  - Totals (payable ₹0, receivable ₹0).
- **Observed:** a **container of references, not a calculation**. For Meera it shows ₹0 everywhere, although:
  - she has **7.5 days Privilege Leave** available: encashment only appears once a separate Leave Encashment is created;
  - her **October salary up to 19 Oct** is not included;
  - **notice-period shortfall** is not considered;
  - Gratuity eligibility (< 5 years) is not explained, just ₹0.

  The status reads "Unpaid" from the start.
- **YukthiX:** an **F&F calculator** (decision 5/6 of module 01 feeds in):

  | Area | Lines |
  |---|---|
  | Earnings | Salary for days worked in the final month (from attendance), leave encashment at the formula rate, bonus, gratuity (eligibility and formula shown), reimbursements due. |
  | Recoveries | Notice shortfall, negative leave balance (module 01 decision 6), advances, asset damage, loans. |
  | Tax | TDS recalculated on the final income. |
  | Result | **Net payable / recoverable**. |

  Each line carries its explanation ("7.5 days × ₹1,538.46 (Basic ÷ 26)"). Approval → paid off-cycle or with the payroll run → F&F letter. The legal deadline (2 working days under the wage code) is shown as a countdown.

### 1.7 Reports & dashboard — employee exits [15](../ui-screens/05-lifecycle/15-report-employee-exits.png), lifecycle dashboard [16](../ui-screens/05-lifecycle/16-lifecycle-dashboard.png), org chart [17](../ui-screens/05-lifecycle/17-org-chart.png)
- **Dashboard layout:** cards: onboardings / separations / promotions / transfers / trainings (this month); charts: grievance type, training type, year-on-year transfers and promotions.
- **Observed:**
  - "Promotions (This Month): **0**" although Arjun's promotion is dated and submitted today. The year-on-year chart does count it, so two widgets disagree.
  - "Onboardings (This Month): 0" (joining is next month), while an onboarding started this week.
- **Org chart:** a clean card tree (name, designation, "n connections"), Expand all, Export, Edit. **Keep this pattern.**
- **YukthiX:** lifecycle analytics in the Analytics product: headcount movement (joiners, leavers, transfers), attrition % by team, time-to-onboard, notice buy-outs, exit reasons. The org chart supports search and a click-through to the employee profile.

---

## 2. YukthiX Lifecycle screen inventory

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Onboarding board + checklist | 1.1 | Owners incl. new hire, negative day offsets, reminders |
| 2 | **Pre-boarding portal** (new hire, mobile) | — | Documents, e-sign, profile → creates employee |
| 3 | Letters & documents (offer, appointment, promotion, relieving, experience) | 1.1, 1.2, 1.4 | Templates, e-sign, stored on timeline |
| 4 | Employee "Change" action (promotion / transfer / revision / manager) | 1.2, 1.3 | One transaction incl. compensation; impact preview; scheduled apply |
| 5 | Employee timeline | 1.2 | All changes with letters |
| 6 | Exit case stepper | 1.4 | Notice calc, buy-out, clearance sign-offs |
| 7 | Exit survey + interview notes | 1.5 | Structured, feeds analytics |
| 8 | **F&F calculator** | 1.6 | Explained lines, TDS, approval, deadline countdown |
| 9 | Org chart | 1.7 | Search, export |
| 10 | Lifecycle analytics | 1.7 | Attrition, movements (Analytics product) |

Probation confirmation, POSH (decision D8, first wave) and asset issue/return link to screens 1, 5 and 6. Their UI reference comes with modules 07 and 09.

---

## 3. UI issues seen on the instance (do not copy)

U1–U48 are in modules 01–04.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U49 | Onboarding | Pre-joining tasks blocked (task can't start before the project, which starts at joining). | Checklist offsets relative to joining, negative allowed. |
| U50 | Onboarding / separation | Task progress lives in a separate Projects module; the form shows no status; project shows 0 % with a task done; unrelated ERPNext set-up pop-up. | Checklist progress on the record itself. |
| U51 | Onboarding | New hire has no role; HR collects documents by hand. | Pre-boarding portal. |
| U52 | Promotion | Employee CTC updated, salary assignment untouched, so payroll keeps the old pay. | Promotion and pay revision in one transaction. |
| U53 | Navigation | Onboarding under "Tenure", promotion under "Performance", offer under Recruitment. | One lifecycle area per employee journey. |
| U54 | Transfer | Only changes fields; no effect on shift, holiday list, PT state, manager. | Impact preview and linked updates. |
| U55 | Separation | Relieving date on the employee, not the case; no notice calculation; employee still plain "Active". | Exit case owns dates and notice; "serving notice" badge. |
| U56 | Exit interview | "Reports To" shows the leaver's name next to the manager's ID. | Correct display of linked names. |
| U57 | F&F | All lines ₹0, no final salary, no leave encashment (7.5 days available), no notice recovery; status "Unpaid" from the start. | F&F calculator with explained lines. |
| U58 | Dashboard | "Promotions this month 0" while the yearly chart counts it. | Consistent counts across widgets. |

---

## 4. Capture notes

- **Demo data:** `yx_demo05.py` in the session scratchpad. It creates the templates, applicant, offer, onboarding (joining-day start after the pre-joining attempt failed), promotion (submitted: this **changed Arjun's designation to Manager** on the instance), transfer (draft), separation (submitted; Meera's resignation and relieving dates set), exit interview and F&F draft.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); Administrator's default company (restored to *workfox (Demo)*).
- The lifecycle data remains on the instance. Modules 06–09 can reuse Meera's exit (e.g. expense and advance clearance) and Kavya's onboarding.
