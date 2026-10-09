# 09 · Training, Grievance & Other Features — Functional Reference

**Source studied:** Frappe HR, `develop` branch, folder `hrms-develop/hrms/hr` (training program / event / result / feedback, employee grievance, daily work summary, department approvers, small masters)
**Maps to YukthiX:** §1.3.9 Learning & Development · §1.3.15 Compliance (grievance, POSH, disciplinary) · §1.3.12 Employee Helpdesk · §2.1.4 approvals
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance.
**Data dictionary:** every object and field → [09-training-grievance-misc.data-dictionary.md](09-training-grievance-misc.data-dictionary.md)
**Coverage check:** with this module every HR and payroll record in the reference codebase is documented (verified by listing all definitions against modules 00–09). App notifications and the mobile app are module 10.

---

## 1. Training

```
 Training Program (catalogue: name, trainer, supplier, description, status)
        ▼
 Training Event (a session: type, level, location, start/end, trainer, attendees)  ──submit──►
        ├─► Training Result (per attendee: hours, grade, comments)  ──submit──► attendees Completed
        └─► Training Feedback (per attendee: feedback text)          ──submit──► attendee "Feedback Submitted"
 Employee record → trainings attended (via skill map, module 05)
```

**Training Program.** Name, company, status (Scheduled / Completed / Cancelled), trainer name / e-mail / phone, supplier, description.

**Training Event.** Event name, program, course, **type** (Seminar / Theory / Workshop / Conference / Exam / Internet / Self-Study), level (Beginner / Intermediate / Advance), has certificate, company, trainer, supplier, location, start & end date-time, introduction, status (Scheduled / Completed / Cancelled); attendees (employee, department, status Open / Invited / Completed / Feedback Submitted, attendance Present / Absent, mandatory — default yes); attendee e-mails.

| ID | Rule |
|---|---|
| TR-EV-01 | End time must be after start time. |
| TR-EV-02 | Attendee e-mail list built automatically (user, else personal, else company e-mail). |
| TR-EV-03 | After submit, setting the event **Completed** marks every *present* attendee Completed (unless feedback already submitted); setting it back to Scheduled resets all attendees to Open. |

**Training Result.** Event, attendees with results (hours, grade, comments — see dictionary).

| ID | Rule |
|---|---|
| TR-RS-01 | The event must be submitted. |
| TR-RS-02 | On submit: event → Completed and each listed attendee → Completed. |

**Training Feedback.** Employee, event, course, trainer, feedback text.

| ID | Rule |
|---|---|
| TR-FB-01 | The event must be submitted; the employee must be an attendee and **not marked absent**. |
| TR-FB-02 | Submit → attendee status "Feedback Submitted"; cancel → back to Completed. |

**Permissions.** HR Manager full; HR User edit programs / events, create results; **Employee can create and submit feedback**.

**Source:** `hr/doctype/training_program/`, `training_event*/`, `training_result*/`, `training_feedback/`, `employee_training/`

---

## 2. Employee Grievance

**Data.** Subject, **raised by** (employee) + designation / reports-to, date, **grievance type** (master), **grievance against** — any kind of record (party type + party, e.g. an employee or department), associated document (type + record), description, status (Open / Investigated / Resolved / Invalid / Cancelled), cause, employee responsible, resolved by, resolution date, resolution details.

| ID | Rule |
|---|---|
| GR-01 | Only status **Resolved** or **Invalid** can be submitted (closing the case). |
| GR-02 | Discarding a draft → Cancelled. |

**Permissions.** Employee: create, edit, delete (no submit); HR User: create, edit (no submit); HR Manager / System Manager: full.

> **Gap:** no confidentiality (the "against" person is visible), no investigation committee, no timelines / SLA, no anonymous reporting, no **POSH** (Internal Committee, 90-day inquiry, annual report) or disciplinary workflow (show-cause, warning, suspension).

**Source:** `hr/doctype/employee_grievance/`, `grievance_type/`

---

## 3. Daily Work Summary (e-mail stand-up)

**Group.** Name, enabled, users (with e-mail), **send at hour** (00:00–23:00), holiday list, subject (default asks what they worked on today), message.

| ID | Rule |
|---|---|
| DW-01 | A group with users needs a default **incoming** e-mail account. |
| DW-02 | **Hourly job:** for each enabled group whose send-hour is now and today isn't a holiday in its list, create a daily summary and e-mail all enabled users, with replies going to the incoming mailbox. |
| DW-03 | Replies are collected as e-mails against that day's summary. |
| DW-04 | **Daily job:** every open summary sends one digest of all replies (with sender photo), plus a "no reply from" list, to the group; status → Sent. |

**Report:** Daily Work Summary Replies — who replied, per group and date.

**Source:** `hr/doctype/daily_work_summary*/`, `hr/report/daily_work_summary_replies/`

---

## 4. Department approvers (shared approval routing)

A department holds three approver lists: **leave**, **expense**, **shift request**. Used by modules 01, 02 and 06.

| ID | Rule |
|---|---|
| AP-01 | Approver choices for an employee = the approver set on the employee (if enabled) + that type's approvers on the employee's department **and every parent department** up the tree (enabled users, disabled departments skipped). |
| AP-02 | No approver found at all → error asking to set one on the employee or department. |
| AP-03 | Default approver (leave) = employee's own, else the **first** in the department's list. |

> **Gap:** single-level only (multi-level needs the generic workflow engine); no delegation / out-of-office; no amount-based routing (e.g. claims > ₹50,000 to finance).

---

## 5. Small masters

| Master | Purpose |
|---|---|
| Identification Document Type | ID types used on travel requests (e.g. passport, driving licence). |
| Interest | Interest / hobby list (legacy). |
| Grievance Type | Categories for grievances. |

---

## 6. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| MS-D1 | Training result submission marks attendees Completed even if they were absent. | Result for an absent attendee. |
| MS-D2 | No certificate generation even when the event "has certificate". | Event with certificate ticked. |
| MS-D3 | Grievance "raised by" isn't forced to the logged-in employee — an employee can raise a grievance in someone else's name. | As Employee, pick another raiser. |
| MS-D4 | Grievance visible to anyone with read access — no confidentiality. | Log in as another employee with user-permission gaps. |
| MS-D5 | Daily work summary depends on an incoming mail server; without one, groups can't be saved. | No incoming account. |

---

## 7. Gap analysis vs YukthiX spec

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Training catalogue, sessions, attendance, results, feedback | ✅ basic | ✅ §1.3.9 | |
| Enrolment, nominations with approval, waitlists | ❌ | ✅ "enrolment" | Build. |
| Certifications with expiry & renewal | ❌ | ✅ | Build (compliance training). |
| Assessments for training | ❌ | ✅ via Proctoring §1.1 | Link training → test → certificate. |
| LMS / SCORM content | ❌ | ✅ §1.1.16 | Integrate. |
| Training needs from skill gaps / appraisal | ❌ | ❌ | 💡 Link skill map + appraisal. |
| Grievance case management | ⚠️ basic record | ✅ §1.3.15 | Confidentiality, committee, SLA, anonymous. |
| **POSH** (IC constitution, complaints, 90-day inquiry, annual report) | ❌ | ✅ §1.3.15 | Indian legal requirement for 10+ employees. |
| Disciplinary cases (show cause, warnings, suspension) | ❌ | ✅ §1.3.15 | Build. |
| Employee helpdesk (HR / IT tickets, SLA) | ❌ | ✅ §1.3.12 | Build. |
| Daily stand-up / check-ins | ✅ e-mail based | ❌ | Optional; in-app instead of e-mail. |
| Approval routing (department, multi-level, amount-based, delegation) | ⚠️ single-level lists | ✅ §2.1.4 | Generic workflow engine. |
| Engagement surveys, pulse, eNPS, recognition | ❌ | ✅ §1.3.16 | Build. |
| Policy management & acknowledgement | ❌ | ✅ §1.3.15 | Build. |

---

## 8. Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Training | `hr/doctype/training_*`, `employee_training/` |
| Grievance | `hr/doctype/employee_grievance/`, `grievance_type/` |
| Daily work summary | `hr/doctype/daily_work_summary*/`, `hr/report/daily_work_summary_replies/` |
| Department approvers | `hr/doctype/department_approver/` |
| Masters | `hr/doctype/identification_document_type/`, `interest/` |
