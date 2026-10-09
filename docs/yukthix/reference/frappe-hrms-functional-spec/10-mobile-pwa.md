# 10 · Mobile App (PWA) — Functional Reference

**Source studied:** Frappe HR, `develop` branch, folder `hrms-develop/frontend` (Vue 3 + Ionic progressive web app, ~7,000 lines) + `hrms/api/` (mobile backend endpoints) + in-app / push notifications
**Maps to YukthiX:** §2.1.18 Mobile App / PWA · §1.3.11 Employee Self-Service · §2.1.7 Notification Engine
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance (`/hrms` on the site).
**Data dictionary:** notification record + HR Settings → [10-mobile-pwa.data-dictionary.md](10-mobile-pwa.data-dictionary.md)
**Also see:** the separate **Roster** web app for shift planning — module 02 §2.4.

---

## 0. What it is

An **installable web app** (not a native store app) at the site's `/hrms` address. It works on phones and desktops, can be "added to home screen" (install prompt), caches its assets for fast start, and receives **push notifications** through a push relay. Same login as the main system. Every screen talks to the backend's normal data API plus ~40 mobile helper endpoints.

**Who can use it:** any user linked to an **active** employee. A logged-in user without an active employee record lands on an "invalid employee" screen.

---

## 1. Navigation

**Bottom tabs:** Home · Attendance · Leaves · Expenses · Salary.

| Screen | Contents |
|---|---|
| **Home** | Check-in / check-out panel (§3) · Quick links: request attendance, request a shift, request leave, claim an expense, request an advance, view salary slips · **Requests panel** with two tabs: *My Requests* and *Team Requests* (items awaiting my approval). |
| **Attendance dashboard** | Monthly attendance calendar (status per day + holidays), links to attendance requests, shift requests, shift assignments, check-in history. |
| **Leaves dashboard** | Leave balance per type (allocated / used / available, semicircle charts), upcoming holidays, my and team leave applications. |
| **Expenses dashboard** | Claim summary (pending, approved, rejected amounts), advance balances, my and team expense claims, advances. |
| **Salary dashboard** | Year-to-date summary and list of salary slips by payroll period; slip detail with earnings / deductions table and **PDF download**. |
| **Profile** | Employee details (name, number, gender, birth date, joining date, blood group), company information (company, department, designation, branch, grade, reports-to, employment type), contact (mobile, personal / company / preferred e-mail), salary information (CTC, cost centre, PAN, PF account, salary mode, bank) — read-only; logout. |
| **Notifications** | In-app notification list with unread count; mark all read; tap to open the document. |
| **Settings** | Enable / disable push notifications (disabled if the site has push turned off). |
| **Account** | Login (password, plus any configured social / SSO providers), forgot password, change password, expired-password redirect. |

---

## 2. Forms available on mobile

| Record | Create | View list / detail | Approve / submit on mobile |
|---|---|---|---|
| Leave Application | ✅ (live leave-day count and balance) | ✅ my + team | ✅ approve / reject / submit / cancel |
| Expense Claim | ✅ (lines, taxes, advance allocation, **photo / file attachments**) | ✅ my + team | ✅ |
| Employee Advance | ✅ | ✅ | ✅ (per permissions) |
| Attendance Request | ✅ | ✅ | ✅ |
| Shift Request | ✅ | ✅ my + team | ✅ |
| Shift Assignment | ✅ (managers/HR) | ✅ | ✅ |
| Employee Check-in | via check-in panel | ✅ history | — |
| Salary Slip | — | ✅ + PDF | — |

**Generic form behaviour**
| ID | Rule |
|---|---|
| MB-01 | Forms are built dynamically from the record's field definitions (supported field types only), so custom fields appear automatically. |
| MB-02 | Attachments: JPG, PNG, PDF, TXT, Office documents only; images are auto-rotated / compressed; uploading needs write access to the record; attachments can be deleted with write access. |
| MB-03 | **Approval actions** appear only to users allowed to edit the approval field: Approve / Reject while Open / Draft; Submit once Approved / Rejected; Cancel after submit. |
| MB-04 | **Self-approval of leave** is hidden when the HR setting forbids it. |
| MB-05 | If the record type has a **workflow**, the workflow's allowed transitions are shown instead of Approve / Reject (states coloured by the workflow). |
| MB-06 | Lists support filters (status, dates, employee, etc.) via an action sheet, and refresh **live** when records change (real-time events per user). |
| MB-07 | Approver pickers show the employee's own approver + department / parent-department approvers (module 09 §4). |

---

## 3. Check-in from mobile

| ID | Rule |
|---|---|
| MB-CK-01 | Shown only if HR Settings "allow check-in from mobile app" is on. |
| MB-CK-02 | One button: shows **Check In** or **Check Out** depending on the last punch; confirmation sheet with the current time. |
| MB-CK-03 | If geolocation tracking is on, the device location is captured and a map preview shown; the backend enforces the shift-location radius (module 02 AT-CK-06). |
| MB-CK-04 | Punch history list. |

---

## 4. Notifications

**In-app notification record:** from user, to user, message, reference record (type + id), read flag.

| ID | Rule |
|---|---|
| MB-NT-01 | **New request → approver:** when a leave application, expense claim or shift request is created, its approver gets "\<employee\> raised a new \<type\> for approval" (not if the approver is the employee). |
| MB-NT-02 | **Status change → employee:** when a leave / expense / shift request becomes Approved or Rejected, the employee is told who did it (not if they did it themselves). |
| MB-NT-03 | Each notification is also sent as a **push notification** (if the site's push service is enabled and the user opted in), linking to the record on the app. |
| MB-NT-04 | Unread badge count; "mark all as read". |
| MB-NT-05 | E-mail notifications (templates in HR Settings) run in parallel — see modules 01, 06, 08. |

---

## 5. Mobile backend endpoints (what the app asks the server)

Current user & employee info · HR settings subset · unread count / mark read · push enabled? · attendance calendar events + holidays · shift requests, attendance requests, leave applications, expense claims (my / team, with filters) · approvers for leave / expense / shift (employee + department chain) · leave types valid on a date · leave balance map · holidays for employee · expense claim summary, claim types, type descriptions · advance balances · company currencies & symbols · default cost centre / expense account · field definitions & workflow states of a record type · attachments list / upload / delete · PDF of a record · workflow and allowed transitions for the user.

| ID | Rule |
|---|---|
| MB-API-01 | Most endpoints resolve "me" from the logged-in user's **active** employee; not found → permission error. |
| MB-API-02 | Team lists are "records where I am the approver". |
| MB-API-03 | Endpoints that take an employee / department / company check read permission on it. |

---

## 6. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| MB-D1 | Field-definition and workflow-state endpoints return metadata for **any** record type to any logged-in user (schema disclosure). | Call with an unrelated record type as an Employee user. |
| MB-D2 | Notifications only cover leave, expense and shift requests — not attendance requests, advances, payslip published, appraisal, etc. | Submit an attendance request. |
| MB-D3 | Notification message text is built in English only. | Switch language. |
| MB-D4 | No offline mode for data entry (only asset caching) — check-in fails without network. | Airplane mode. |
| MB-D5 | Profile is read-only — employees can't request changes to address, bank, contacts. | Open Profile. |

---

## 7. Gap analysis vs YukthiX spec §2.1.18 / §1.3.11

| Capability | Frappe PWA | YukthiX spec | Note |
|---|---|---|---|
| Attendance check-in, leave, approvals, self-service | ✅ | ✅ | |
| Payslips + PDF | ✅ | ✅ | Add Form 16, letters, tax sheet. |
| Expense claims with photo receipts | ✅ | ✅ | Add OCR. |
| Native apps (store, biometric login, background location) | ❌ PWA only | ⚠️ "Mobile App / PWA" | Decide PWA vs native (React Native / Capacitor). |
| Offline check-in / queued actions | ❌ | ❌ | Needed for field staff. |
| Selfie / face check-in | ❌ | ❌ | Reuse proctoring face tech. |
| Profile change requests with approval | ❌ | ✅ §1.3.11 "requests" | Build. |
| Documents & letters download | ❌ | ✅ §1.3.11 | Build. |
| Team view for managers (who's in / on leave today) | ⚠️ team requests only | ✅ manager self-service | Build. |
| Notifications for all modules, in user's language | ⚠️ 3 record types, English | ✅ §2.1.7 | Notification engine with templates + WhatsApp / SMS. |
| Helpdesk tickets, surveys, recognition on mobile | ❌ | ✅ | Later modules. |
| Multi-language UI | ✅ translations | ✅ §2.1.6 | Hindi + regional languages for blue-collar users. |

---

## 8. YukthiX design questions (for the later design phase)

1. PWA only, or native iOS / Android apps (store presence, biometric login, reliable background location)?
2. Offline support for check-in and forms?
3. WhatsApp as a channel (notifications, even leave apply via chat)?
4. Which regional languages at launch?
5. Manager app features: team attendance today, approvals inbox, team calendar?

---

## 9. Source pointers (for verification only)

| Area | Path in `hrms-develop` |
|---|---|
| App shell, routes, tabs | `frontend/src/main.js`, `router/`, `components/BottomTabs.vue` |
| Home, requests, approvals | `frontend/src/views/Home.vue`, `components/RequestPanel.vue`, `RequestActionSheet.vue`, `WorkflowActionSheet.vue`, `composables/workflow.js` |
| Screens | `frontend/src/views/` (attendance, leave, expense_claim, employee_advance, salary_slip, Profile, Notifications, AppSettings, Login) |
| Dynamic forms | `frontend/src/components/FormView.vue`, `FormField.vue` |
| Check-in | `frontend/src/components/CheckInPanel.vue` |
| Push | `frontend/src/utils/pushNotifications.js`, `hrms/hr/doctype/pwa_notification/`, `hrms/mixins/pwa_notifications.py` |
| Backend endpoints | `hrms/api/__init__.py` |
