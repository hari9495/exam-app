# 09 · Training, Grievance & Misc — UI Reference

> **Purpose.** How Frappe HR lays out training, grievances, the daily work summary, department approvers, skill maps and HR settings, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [09-training-grievance-misc.md](09-training-grievance-misc.md) (behaviour) and [09-training-grievance-misc.data-dictionary.md](09-training-grievance-misc.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 14 screenshots in [`../ui-screens/09-training-grievance/`](../ui-screens/09-training-grievance/). Internal reference only.

## Demo data behind the screenshots

| Item | Setup |
|---|---|
| Training | Program "Consultative Selling" (external trainer). Event "Batch 1": workshop, 18 Sep, Chennai office, certificate; Priya and Arjun attended; submitted. Results: 7 h each, grades A / B+. Arjun's feedback submitted. |
| Grievances | **Open:** Rahul, "Night shift allowance not paid for September", Pay & Benefits, against the Operations department. **Resolved:** Arjun, "AC not working in Chennai office", Work Environment, resolved 12 Sep by facilities, Vikram responsible. |
| Department approvers | Sales department: leave approver and expense approver = Administrator. |
| Skill map | Arjun: Negotiation 3★, Territory Planning 4★, CRM Hygiene 2★. |
| Daily work summary | **Could not be created**: a group requires an incoming email account to be configured first (U88). |

---

## 1. Screen-by-screen

### 1.1 Training — program [01](../ui-screens/09-training-grievance/01-training-program.png), event [02](../ui-screens/09-training-grievance/02-training-event.png), result [03](../ui-screens/09-training-grievance/03-training-result.png), feedback [04](../ui-screens/09-training-grievance/04-training-feedback.png), calendar [05](../ui-screens/09-training-grievance/05-training-calendar.png)
- **Event layout:**
  - Connections: result 1, feedback 1.
  - Program, status, has certificate | type, level, company; trainer; location | start, end.
  - Introduction.
  - **Attendees grid:** employee, status (Completed / Feedback Submitted), attendance, mandatory.
  - The activity shows the **invitation e-mail** (event, location, date, time) sent to attendees.
  - Header buttons: Training Result, Training Feedback.
- **Result:** a grid per attendee (hours, grade, comments). **Feedback:** employee, event, free text.
- **Observed:**
  - Three separate documents (event, result, feedback) for one session.
  - There is **no certificate file** despite "has certificate", no cost or budget, and no link to skills: the completed training does **not** appear in Arjun's skill map (§1.4).
  - There is no self-enrolment, course catalogue or e-learning content; this is classroom-event logistics only.
  - The event URL again carries an en-dash from the title (like U77).
- **YukthiX:** a **learning** area:
  - A catalogue: programs with modules, classroom or online.
  - Sessions with RSVP, attendance by QR or check-in, and a **certificate issued on completion**.
  - Completion updates the **skill map** and the employee timeline.
  - Mandatory trainings with due dates (compliance: POSH awareness, safety).
  - Feedback as a short survey; cost per session and per head.
  - **Assessments reuse the exam app's proctored tests** (a unique strength).

### 1.2 Grievance — open [06](../ui-screens/09-training-grievance/06-grievance-open.png), resolved [07](../ui-screens/09-training-grievance/07-grievance-resolved.png), list [08](../ui-screens/09-training-grievance/08-grievance-list.png)
- **Layout:**
  - Subject, raised by, name, designation | date, status, reports to.
  - Grievance details (against party type + party, type | associated document).
  - Description; investigation (cause).
  - Resolution (resolved by, date, employee responsible | details).
  - Submit.
- **Observed:**
  - **"Reports To" shows "HR-EMP-00002: Rahul Verma"**: the manager's ID (Vikram) paired with the complainant's own name. This is the same defect as the exit interview (U56), so it is **systemic** in how these forms fetch the manager's display name.
  - **No confidentiality:** anyone with grievance access sees who complained; there is no anonymous option and no restricted investigator list.
  - **No SLA or escalation:** "Open" has no age, owner or due date.
  - "Against party" must be a document type (Department / Employee…). An employee can't easily say "my manager" without HR's help.
  - Rahul's grievance names his missing night-shift allowance. That allowance does not exist in the product (module 02 gap: shift/night allowance). This is a real-world example of why the gap matters.
  - **POSH is not covered.** Harassment complaints need an Internal Committee workflow, statutory timelines and confidentiality (decision D8 puts POSH in the first wave).
- **YukthiX:** two separate flows.
  - **Helpdesk-style employee cases** for pay, facilities and policy: category → owner → SLA → updates to the employee → resolution + satisfaction. Linked documents (the payslip in question) can be attached from the app.
  - **POSH case management**, restricted to the Internal Committee, with statutory timelines, inquiry records, orders and an annual report.

  A "speak up" option allows anonymous reports.

### 1.3 Daily work summary (new) — [09](../ui-screens/09-training-grievance/09-daily-work-summary-group-new.png) · Team updates — [13](../ui-screens/09-training-grievance/13-team-updates.png)
- **Observed:** the stand-up works **by e-mail**: a group of users, a send time, a subject and a message. Replies are collected into a summary. It can't even be set up without an incoming mail account.
- **YukthiX:** stand-ups and check-ins in the app and chat (WhatsApp / Slack / Teams bot): questions at a set time, replies inline, a team feed, and a missed-update nudge. Optionally, link check-ins to goals (module 07) and timesheets (module 02).

### 1.4 Employee skill map — [11](../ui-screens/09-training-grievance/11-employee-skill-map.png)
- **Layout:** employee, designation; skills grid (skill, **star proficiency**, evaluation date); trainings grid (training, date: **empty**).
- **YukthiX:** a skills profile on the employee (self + manager assessed), fed by training completions, interview scorecards (module 08) and appraisal competencies (module 07). Add a **skills matrix** view per team for gap analysis.

### 1.5 Department approvers — [10](../ui-screens/09-training-grievance/10-department-approvers.png)
- **Layout:** department, parent, company, flags; payroll cost centre, leave block list; **approver tables: shift request, leave, expense** ("the first approver in the list will be set as the default").
- **Observed:** a useful idea (routing by department) but limited: one list per request type, the "first = default" rule, no amount thresholds, no second level.
- **YukthiX:** the shared **approval engine** (platform service): rules by request type, department, location, grade and amount; multi-level with delegation (module 01); approver preview on every request form.

### 1.6 HR settings — [12](../ui-screens/09-training-grievance/12-hr-settings.png), leave & expense tab [12b](../ui-screens/09-training-grievance/12b-hr-settings-leave.png)
- **Observed:** one settings document holding **~35 unrelated switches**: employee naming, retirement age, reminders, leave rules, expense rules, shift and check-in, exit questionnaire, and interview reminders.
- **YukthiX:** settings live **with each module** (leave settings in Leave, and so on), grouped by task, with plain-language descriptions and a search across settings.

---

## 2. YukthiX screen inventory for this module

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Learning catalogue, sessions, certificates, mandatory trainings | 1.1 | Exam-app assessments; skill updates |
| 2 | Employee cases (helpdesk-style) with SLA | 1.2 | Categories, owners, satisfaction |
| 3 | **POSH case management** (restricted) | — (gap) | Decision D8, first wave |
| 4 | Speak-up / anonymous reporting | — | |
| 5 | Stand-ups & check-ins (app + chat) | 1.3 | No e-mail dependency |
| 6 | Skills profile + team skills matrix | 1.4 | Fed by training, interviews, appraisals |
| 7 | Approval rules (platform service) | 1.5 | Multi-level, thresholds, delegation |
| 8 | Module-level settings with search | 1.6 | |

---

## 3. UI issues seen on the instance (do not copy)

U1–U83 are in modules 01–08.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U84 | Grievance (and exit interview U56) | "Reports To" shows the manager's ID with the employee's own name: systemic. | Correct linked-name display everywhere. |
| U85 | Grievance | No confidentiality, anonymity, SLA or owner; POSH not supported. | Case management with access control and SLA; separate POSH flow. |
| U86 | Training | Event, result and feedback are three documents; certificate flag without a certificate; no cost. | One session record; certificate issued; cost tracked. |
| U87 | Skill map | Completed training not reflected in the skill map. | Learning updates skills automatically. |
| U88 | Daily work summary | Cannot be created without an incoming e-mail account; e-mail-only. | In-app and chat check-ins. |
| U89 | Department approvers | One flat list per type, first = default, no thresholds or levels. | Rule-based approval engine. |
| U90 | HR settings | ~35 unrelated switches in one document. | Settings per module, searchable. |

---

## 4. Capture notes

- **Demo data:** `yx_demo09.py` in the session scratchpad: training program, event (submitted), result and feedback (submitted), 3 grievance types, 2 grievances (1 resolved and submitted), Sales department approvers, Arjun's skill map. The daily work summary group failed (no incoming email account).
- The grievance descriptions were entered with HTML tags into a plain-text field, so the tags show literally in screenshot 06. That comes from our demo input, not a Frappe defect.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); default company (restored to *workfox (Demo)*).
- This data remains on the instance.
