# 99 · Gap Register (all modules)

Generated from the *Gap analysis* section of every module doc by `../tools/build_gaps.py` — re-run after editing a module. Planning summary and priorities: [99-gap-summary.md](99-gap-summary.md).

| Class | Meaning | Rows |
|---|---|---|
| **A** | In our spec — no reference in Frappe (design from scratch) | 63 |
| **B** | Frappe has it — missing from our spec (add to spec) | 12 |
| **C** | Neither has it — new need / differentiator | 29 |
| **D** | Frappe partial — we must do better | 36 |
| **E** | Covered by both — reuse Frappe rules as reference | 51 |

**Total rows: 191**

---

## A · In our spec — no reference in Frappe (design from scratch) (63)

| Module | Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|---|
| 00 · Core HR Masters | Documents (ID proofs, certificates) with expiry | ❌ | ✅ §1.3.15 | Document management. |
| 00 · Core HR Masters | Employee self-edit with approval (address, bank change) | ❌ | ✅ | Change-request workflow. |
| 00 · Core HR Masters | Field-level security for sensitive data | ❌ | ✅ | Encrypt / mask Aadhaar, bank, health (DPDP). |
| 00 · Core HR Masters | Multiple bank accounts / salary split | ❌ | ⚠️ | Consider. |
| 01 · Leave Management | **Delegation** (approver out of office) | ❌ | ✅ | Must build. |
| 01 · Leave Management | Accrual based on days worked (e.g. 1 EL per 20 days worked) | ❌ | ❌ → ✅ added 23 Sep | Needed for Factories Act / state S&E Acts. |
| 01 · Leave Management | Accrual reduced by LOP days | ❌ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Balance projection ("what will I have on 1 Dec") | ❌ | ❌ → ✅ added 23 Sep | 💡 Nice-to-have. |
| 01 · Leave Management | Comp-off expiry window (use within N days) | ❌ | ❌ → ✅ added 23 Sep | Common in India — add. |
| 01 · Leave Management | Eligibility (gender, marital status, employment type, probation) | ❌ | ❌ → ✅ added 23 Sep | Needed for maternity/paternity. |
| 01 · Leave Management | Employee-initiated cancellation / withdrawal after approval | ❌ (HR cancels) | ❌ → ✅ added 23 Sep | Add with approval. |
| 01 · Leave Management | Encashment rate formula (e.g. Basic ÷ 26 or ÷ 30) | ❌ (fixed per-day amount) | ❌ → ✅ added 23 Sep | Add — ties to payroll. |
| 01 · Leave Management | First half / second half | ❌ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Hourly / short leave / permission hours | ❌ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Mandatory attachment (e.g. medical certificate after N days) | ❌ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Minimum notice, max applications per month | ❌ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Statutory templates (Maternity 26 weeks, state S&E carry-forward caps, state festival holidays) | ❌ | ❌ → ✅ added 23 Sep | India pack, §2.1.6. |
| 01 · Leave Management | True **sandwich rule** (count a holiday only when leave is on both sides) | ❌ (all-or-nothing per type) | ❌ → ✅ added 23 Sep | 💡 Common India SMB policy — add. |
| 01 · Leave Management | Year-end processing wizard (preview → carry forward + encash + lapse) | ❌ (three separate jobs) | ❌ → ✅ added 23 Sep | 💡 Strong UX win. |
| 02 · Attendance, Shifts & Overtime | Regularisation — missed-punch correction with actual times | ❌ (status-only request) | ✅ "regularisation" | Must build. |
| 03 · Payroll Engine | Form 16 | ❌ (in `india-payroll`) | ✅ | Module 04. |
| 03 · Payroll Engine | PF, ESI, PT, LWF computation & challans / returns (ECR, ESIC, PT returns, 24Q) | ❌ in core (reports only) | ✅ | Module 04. |
| 04 · India Statutory | ESIC portal upload format | ❌ | ✅ | Use ESIC Excel template. |
| 04 · India Statutory | Employer EPF / EPS / EDLI / admin computed | ❌ (register only) | ✅ | Must compute, show in CTC and slip; pre-2014 EPS, age 58, international workers. |
| 04 · India Statutory | Form 12BB, landlord PAN, lender details | ❌ | ⚠️ §1.3.5 proofs | Add to declarations/proofs. |
| 04 · India Statutory | Registrations per **state** | ❌ per company | ✅ | Legal entity → state registrations (PT, LWF, S&E). |
| 05 · Employee Lifecycle | **F&F calculation** (last salary, notice pay/recovery, leave encashment, gratuity, bonus, deductions, TDS) | ❌ (settlement ledger only) | ✅ | Must build; statutory deadline (Code on Wages: within 2 working days) alerts. |
| 05 · Employee Lifecycle | **Pre-boarding portal** (candidate uploads documents, fills forms before day 1) | ❌ | ✅ | Must build. |
| 05 · Employee Lifecycle | **Probation & confirmation** (probation period, review, confirm / extend / terminate, confirmation letter) | ❌ | ✅ | Must build. |
| 05 · Employee Lifecycle | **Resignation workflow** (employee submits, manager/HR accept, notice period calculated, early release, buy-out, withdrawal) | ❌ | ✅ | Must build. |
| 05 · Employee Lifecycle | Alumni portal (payslips, Form 16, letters after exit) | ❌ | ✅ §1.3.14 | Must build. |
| 05 · Employee Lifecycle | Background verification integration | ❌ | ✅ | Provider integrations (§2.1.13). |
| 05 · Employee Lifecycle | Contingent workforce (via External ATS) | ❌ | ✅ |  |
| 05 · Employee Lifecycle | Document collection & verification (PAN, Aadhaar, certificates) | ❌ | ✅ | With §2.1.8 document management. |
| 05 · Employee Lifecycle | Relieving, experience, F&F letters | ❌ | ✅ | Letter generator §2.1.9. |
| 05 · Employee Lifecycle | Succession planning | ❌ | ✅ | Must build. |
| 06 · Expenses, Advances & Travel | **Policy limits** (per category, grade, city tier, per day / per trip) | ❌ | ✅ "policy limits" | Must build. |
| 06 · Expenses, Advances & Travel | Mileage claims (km × rate), per-diem | ⚠️ vehicle log only / ❌ | ✅ per-diem | Must build. |
| 07 · Performance | 1-on-1s, check-ins, recognition | ❌ | ✅ §1.3.16 recognition | Add check-ins. |
| 07 · Performance | Manager rating distinct from peer feedback | ❌ | ✅ |  |
| 07 · Performance | Probation reviews | ❌ | ⚠️ (§1.3.1 probation) | Reuse appraisal engine for probation. |
| 07 · Performance | Stage workflow (goal setting, self, manager, reviewer, calibration, sign-off) with deadlines | ❌ | ✅ | Must build (via §2.1.4). |
| 08 · Recruitment | AI first-round interview | ❌ | ✅ | YukthiX differentiator. |
| 08 · Recruitment | Assessments | ❌ | ✅ via Proctoring §1.1 | Auto-shortlist from test scores. |
| 08 · Recruitment | Background verification | ❌ | ✅ | Provider integration. |
| 08 · Recruitment | Candidate consent & retention (DPDP / GDPR) | ❌ | ✅ | Must build. |
| 08 · Recruitment | Candidate portal (status, documents) | ❌ | ✅ | Must build. |
| 08 · Recruitment | External staffing (clients, submissions, rates, placements) | ❌ | ✅ §1.2.3 | YukthiX-only. |
| 08 · Recruitment | Job board posting & distribution | ❌ | ✅ | Naukri, LinkedIn, Indeed integrations. |
| 08 · Recruitment | Resume parsing, dedup, merge, talent pool, hotlist | ❌ | ✅ | Must build; AI layer. |
| 09 · Training, Grievance & Other Features | **POSH** (IC constitution, complaints, 90-day inquiry, annual report) | ❌ | ✅ §1.3.15 | Indian legal requirement for 10+ employees. |
| 09 · Training, Grievance & Other Features | Assessments for training | ❌ | ✅ via Proctoring §1.1 | Link training → test → certificate. |
| 09 · Training, Grievance & Other Features | Certifications with expiry & renewal | ❌ | ✅ | Build (compliance training). |
| 09 · Training, Grievance & Other Features | Disciplinary cases (show cause, warnings, suspension) | ❌ | ✅ §1.3.15 | Build. |
| 09 · Training, Grievance & Other Features | Employee helpdesk (HR / IT tickets, SLA) | ❌ | ✅ §1.3.12 | Build. |
| 09 · Training, Grievance & Other Features | Engagement surveys, pulse, eNPS, recognition | ❌ | ✅ §1.3.16 | Build. |
| 09 · Training, Grievance & Other Features | Enrolment, nominations with approval, waitlists | ❌ | ✅ "enrolment" | Build. |
| 09 · Training, Grievance & Other Features | LMS / SCORM content | ❌ | ✅ §1.1.16 | Integrate. |
| 09 · Training, Grievance & Other Features | Policy management & acknowledgement | ❌ | ✅ §1.3.15 | Build. |
| 10 · Mobile App (PWA) | Documents & letters download | ❌ | ✅ §1.3.11 | Build. |
| 10 · Mobile App (PWA) | Helpdesk tickets, surveys, recognition on mobile | ❌ | ✅ | Later modules. |
| 10 · Mobile App (PWA) | Native apps (store, biometric login, background location) | ❌ PWA only | ⚠️ "Mobile App / PWA" | Decide PWA vs native (React Native / Capacitor). |
| 10 · Mobile App (PWA) | Profile change requests with approval | ❌ | ✅ §1.3.11 "requests" | Build. |

---

## B · Frappe has it — missing from our spec (add to spec) (12)

| Module | Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|---|
| 02 · Attendance, Shifts & Overtime | Break rules (unpaid break deduction, fixed break) | ⚠️ only via pair-sum method | ❌ | Add. |
| 02 · Attendance, Shifts & Overtime | Geofence per location | ✅ (one radius per location) | ❌ not explicit | Add. Multiple allowed locations per employee. |
| 02 · Attendance, Shifts & Overtime | Split shifts / multiple shifts per day | ✅ (setting) | ❌ |  |
| 02 · Attendance, Shifts & Overtime | WFH / On-duty requests | ✅ | ❌ not explicit | Add, with monthly WFH limits. |
| 03 · Payroll Engine | Bank payment file | ✅ basic | ❌ | Add bank-specific formats (HDFC, ICICI, SBI…) and payment-status reconciliation. |
| 03 · Payroll Engine | Off-cycle / supplementary payroll | ⚠️ manual slips | ❌ | Add. |
| 03 · Payroll Engine | Payroll lock / freeze after run | ⚠️ | ❌ | Add — lock attendance, leave and inputs once approved. |
| 03 · Payroll Engine | Pre-run validations dashboard (missing bank, PAN, structure, attendance) | ⚠️ attendance only | ❌ | 💡 Add a readiness checklist. |
| 03 · Payroll Engine | Previous employer income (Form 12B) | ⚠️ opening balances / other income | ❌ | Add explicit 12B capture. |
| 06 · Expenses, Advances & Travel | Receipt capture, **OCR**, mandatory receipts above an amount | ⚠️ attachments only | ❌ | 💡 AI layer (§2.1.14) for OCR. |
| 07 · Performance | Competency framework / skills assessment | ⚠️ skills on designation / employee | ❌ | Link to skill map. |
| 09 · Training, Grievance & Other Features | Daily stand-up / check-ins | ✅ e-mail based | ❌ | Optional; in-app instead of e-mail. |

---

## C · Neither has it — new need / differentiator (29)

| Module | Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|---|
| 02 · Attendance, Shifts & Overtime | Attendance lock after payroll | ❌ (only LWP leave checked) | ❌ | Add — freeze a period once payroll runs. |
| 02 · Attendance, Shifts & Overtime | Auto comp-off from holiday attendance | ❌ (manual request) | ❌ | Add — ties to Leave comp-off. |
| 02 · Attendance, Shifts & Overtime | Flexi-time / core hours | ❌ | ❌ | Add for IT/service companies. |
| 02 · Attendance, Shifts & Overtime | IP / Wi-Fi restriction for web check-in | ❌ | ❌ | Add (office-only punching). |
| 02 · Attendance, Shifts & Overtime | Late-coming penalties (e.g. 3 lates = ½ day LOP) and grace count per month | ❌ (flag only) | ❌ | Very common in India — add. |
| 02 · Attendance, Shifts & Overtime | Minimum rest between shifts | ❌ | ❌ | Add as validation. |
| 02 · Attendance, Shifts & Overtime | Muster roll / statutory registers (e.g. Factories Act Form 25) | ❌ | ❌ | India pack. |
| 02 · Attendance, Shifts & Overtime | Offline check-in (sync later) | ❌ | ❌ | Needed for field staff / low network. |
| 02 · Attendance, Shifts & Overtime | Overtime **pre-approval** workflow | ❌ | ❌ | Add. |
| 02 · Attendance, Shifts & Overtime | Selfie / face match at check-in | ❌ | ❌ | Common in India field-force apps; our Proctoring face tech can be reused. 💡 |
| 02 · Attendance, Shifts & Overtime | Shift / night allowance | ❌ | ❌ | Add — feeds payroll. |
| 02 · Attendance, Shifts & Overtime | Statutory OT limits (Factories Act: max hours/quarter, double rate) | ❌ | ❌ | India pack. |
| 03 · Payroll Engine | Bonus Act (statutory bonus 8.33–20 %) | ❌ | ❌ | India pack. |
| 03 · Payroll Engine | Minimum wages check by state / skill | ❌ | ❌ | India pack — warn when below. |
| 03 · Payroll Engine | Month-over-month variance report | ❌ | ❌ | 💡 Add — catches payroll mistakes before pay-out. |
| 03 · Payroll Engine | Payroll run approval workflow (maker-checker) | ❌ | ❌ | Add — HR prepares, finance approves. |
| 03 · Payroll Engine | Report privacy | ❌ **employees can see all employees' tax/PF** | — | Must fix by design (row-level security). |
| 04 · India Statutory | Compliance calendar (due dates, reminders) | ❌ | ❌ | 💡 High value for SMBs. |
| 04 · India Statutory | Rates / slabs updatable without release | ❌ hard-coded | — | 💡 YukthiX: statutory rules as dated data, maintained centrally for all tenants. |
| 04 · India Statutory | Statutory bonus, gratuity provisioning, minimum wages | ❌ | ❌ | India pack. |
| 06 · Expenses, Advances & Travel | Corporate card reconciliation | ❌ | ❌ | Later. |
| 06 · Expenses, Advances & Travel | Duplicate / fraud checks | ❌ | ❌ | 💡 AI flagging. |
| 06 · Expenses, Advances & Travel | GST details per bill (GSTIN, HSN, input credit) | ❌ | ❌ | India need for finance. |
| 07 · Performance | Calibration / normalisation / 9-box | ❌ | ❌ | 💡 Differentiator. |
| 07 · Performance | Link to increments, bonus, promotion (compensation review) | ❌ | ❌ | Tie final rating to salary revision (module 03) and promotion (module 05). |
| 07 · Performance | Performance improvement plan (PIP) | ❌ | ❌ | Add. |
| 09 · Training, Grievance & Other Features | Training needs from skill gaps / appraisal | ❌ | ❌ | 💡 Link skill map + appraisal. |
| 10 · Mobile App (PWA) | Offline check-in / queued actions | ❌ | ❌ | Needed for field staff. |
| 10 · Mobile App (PWA) | Selfie / face check-in | ❌ | ❌ | Reuse proctoring face tech. |

---

## D · Frappe partial — we must do better (36)

| Module | Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|---|
| 00 · Core HR Masters | India identity fields (PAN, Aadhaar, UAN, ESIC IP, IFSC) with validation | ⚠️ via add-ons | ✅ | Build in with format checks and masking. |
| 00 · Core HR Masters | Legal entity → locations → departments hierarchy | ⚠️ company + branch + department tree | ✅ §2.1.1 | Locations with state (PT/LWF), address, holiday calendar. |
| 01 · Leave Management | Holiday calendars **per location** | ⚠️ only per employee or company | ✅ | **Better:** assign by location/branch/legal entity. |
| 01 · Leave Management | Leave year per legal entity / location | ⚠️ per company | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Multi-level approval | ⚠️ generic workflow only | ✅ via §2.1.4 | Use our workflow engine. |
| 01 · Leave Management | Team availability when approving ("who else is off") | ⚠️ calendar only | ❌ → ✅ added 23 Sep | 💡 Show inline in approval. |
| 02 · Attendance, Shifts & Overtime | Biometric device integration | ⚠️ push API only, no device connectors | ✅ | Build connectors (ZKTeco, eSSL, Matrix, Realtime) or a sync agent. |
| 02 · Attendance, Shifts & Overtime | Rosters with repeat patterns | ⚠️ weekly patterns only | ✅ | **Better:** rotating patterns (e.g. 4 on / 2 off, 3-shift rotation over N days). |
| 02 · Attendance, Shifts & Overtime | Timesheets → client billing | ⚠️ lives in ERPNext Projects | ✅ §1.2.3 | Build in YukthiX; link to External ATS. |
| 02 · Attendance, Shifts & Overtime | Weekly off per shift / roster | ⚠️ shift-level holiday list override | ⏳ deferred from Leave Q2 | Decide in this module. |
| 03 · Payroll Engine | Full & final settlement | ⚠️ pieces exist (encashment, gratuity, withholding) — F&F doc lives in HR module | ✅ | Module 05. |
| 03 · Payroll Engine | Loans & advances | ⚠️ needs separate lending app | ✅ | Build native: salary advance, loan with EMI, interest/perquisite, recovery in F&F. |
| 03 · Payroll Engine | Salary revision | ⚠️ new assignment; arrears for increases only | ✅ | **Better:** mid-month revision split (defect B-D1), decreases/recoveries, revision letters. |
| 03 · Payroll Engine | Tax declarations & proofs with HR verification | ⚠️ employees self-submit, no HR approval | ✅ | Add approve/reject per row with comments. |
| 04 · India Statutory | ESI with contribution-period continuation, rupee round-up, ₹176/day rule | ⚠️ partial | ✅ | Implement per law. |
| 04 · India Statutory | Form 16 Part A/B | ⚠️ skeleton | ✅ | Full Part B computation; bulk TRACES Part A; digital signing; e-mail to employees. |
| 04 · India Statutory | LWF all states incl. % based (Haryana), thresholds | ⚠️ flat amounts | ✅ | Versioned data; state forms. |
| 04 · India Statutory | PT all states, slabs as **dated data** | ⚠️ 16 states, hard-coded, several outdated | ✅ | Versioned rate tables; ₹2,500 cap check; PT returns/challans per state. |
| 05 · Employee Lifecycle | Asset issue / return | ⚠️ ERPNext asset movements | ✅ §1.3.10 | Own asset register. |
| 05 · Employee Lifecycle | Effective-dated history of **all** job attributes (salary, grade, location, manager, cost centre) | ⚠️ department / designation / branch only | ✅ | Build a full effective-dated job history; schedule future-dated changes. |
| 05 · Employee Lifecycle | Headcount & workforce planning | ⚠️ staffing plan in recruitment (module 08) | ✅ |  |
| 05 · Employee Lifecycle | Manager self-service | ⚠️ approvals only | ✅ | Team view, initiate changes, approve. |
| 05 · Employee Lifecycle | Promotion / transfer with approval workflow | ⚠️ no approval, no future dating | ✅ | Tie to salary revision (module 03) and letters. |
| 05 · Employee Lifecycle | Rehire eligibility | ⚠️ retained / exit confirmed only | ✅ | Add eligible-for-rehire flag + reason. |
| 06 · Expenses, Advances & Travel | Reimbursement through payroll | ⚠️ (benefit claims only; expense claims paid by payment entry) | ⚠️ | Option to pay approved claims in the next payroll. |
| 06 · Expenses, Advances & Travel | Travel requests with approval, budget, booking | ⚠️ form only | ✅ "requests and bookings" | Must build; booking via travel partners later. |
| 07 · Performance | 360° feedback with nominated reviewers, anonymity | ⚠️ open to anyone, not anonymous | ✅ "continuous feedback" | Nominations + anonymity options. |
| 07 · Performance | Analytics | ⚠️ one report | ✅ §1.4 | Distribution, completion rates, manager comparison. |
| 08 · Recruitment | Manpower requisition against approved headcount budget | ⚠️ requisition + staffing plan, no approval | ✅ | Approval workflow; department heads raise. |
| 08 · Recruitment | Offer management, approval, letter generation | ⚠️ terms only | ✅ | Structured CTC, approval, e-sign, letter. |
| 08 · Recruitment | Pipeline stages | ⚠️ fixed statuses | ✅ | Configurable stages per job. |
| 08 · Recruitment | Recruiter dashboards (time to hire, source, funnel) | ⚠️ time to fill, acceptance %, one report | ✅ §1.4.5 |  |
| 09 · Training, Grievance & Other Features | Approval routing (department, multi-level, amount-based, delegation) | ⚠️ single-level lists | ✅ §2.1.4 | Generic workflow engine. |
| 09 · Training, Grievance & Other Features | Grievance case management | ⚠️ basic record | ✅ §1.3.15 | Confidentiality, committee, SLA, anonymous. |
| 10 · Mobile App (PWA) | Notifications for all modules, in user's language | ⚠️ 3 record types, English | ✅ §2.1.7 | Notification engine with templates + WhatsApp / SMS. |
| 10 · Mobile App (PWA) | Team view for managers (who's in / on leave today) | ⚠️ team requests only | ✅ manager self-service | Build. |

---

## E · Covered by both — reuse Frappe rules as reference (51)

| Module | Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|---|
| 00 · Core HR Masters | Employee master with custom fields | ✅ | ✅ |  |
| 00 · Core HR Masters | Holiday calendars with public-holiday import | ✅ | ✅ | Per location (Leave decision Q2). |
| 00 · Core HR Masters | Org chart | ✅ | ✅ | Add dotted-line / matrix managers. |
| 01 · Leave Management | Accrual (monthly/quarterly/…) | ✅ | ✅ |  |
| 01 · Leave Management | Balances via ledger | ✅ | ✅ (implied) | 💡 Adopt ledger design. |
| 01 · Leave Management | Block dates | ✅ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Carry forward + expiry | ✅ | ❌ not explicit → ✅ added 23 Sep | Add to spec. |
| 01 · Leave Management | Comp-off | ✅ | ❌ → ✅ added 23 Sep | Add. |
| 01 · Leave Management | Encashment (payroll or payment) | ✅ | ❌ not explicit → ✅ added 23 Sep | Add; link to F&F §1.3.13. |
| 01 · Leave Management | Leave adjustment with reason | ✅ | ❌ → ✅ added 23 Sep | Add (also used for migration §2.1.11). |
| 01 · Leave Management | Leave types with rules | ✅ rich | ✅ | Use §2.1 catalogue as the baseline. |
| 01 · Leave Management | Optional / restricted holidays | ✅ (via leave type + list) | ❌ → ✅ added 23 Sep | Add, with "choose N of M" quota. |
| 02 · Attendance, Shifts & Overtime | Clock-in/out (mobile, web) | ✅ | ✅ |  |
| 02 · Attendance, Shifts & Overtime | Monthly attendance sheet, late/early reports | ✅ | ✅ (§1.4.7) |  |
| 02 · Attendance, Shifts & Overtime | Overtime calculation & multipliers | ✅ | ✅ |  |
| 02 · Attendance, Shifts & Overtime | Roster drag / swap / break | ✅ | ✅ |  |
| 02 · Attendance, Shifts & Overtime | Shifts incl. night shifts | ✅ | ✅ |  |
| 03 · Payroll Engine | Accounting journals | ✅ (in-house ERPNext) | ⚠️ §2.1.13 export | Generate journals and push to Tally / Zoho / QuickBooks. |
| 03 · Payroll Engine | Components, formula structures, assignments, CTC | ✅ | ✅ | 💡 Add a formula tester and a **CTC-first builder** (enter annual CTC → breakup computed) — the way Indian HR actually works. |
| 03 · Payroll Engine | Gratuity | ✅ (with defects) | ✅ | Add ₹20 L cap, completed-years rule (≥ 6 months rounds up per Payment of Gratuity Act), provisioning. |
| 03 · Payroll Engine | HRA exemption | ✅ (with defects) | ✅ | Fix mid-year joiner and proof-missing spike. |
| 03 · Payroll Engine | Multi-currency / multi-entity | ✅ | ✅ (§2.1.6) |  |
| 03 · Payroll Engine | Payroll run, slips, e-mail with password PDF | ✅ | ✅ |  |
| 03 · Payroll Engine | Payslip self-service & tax sheet | ✅ | ✅ (§1.3.11) |  |
| 03 · Payroll Engine | Reimbursements (claims with bills) | ✅ via benefit claims | ⚠️ §1.3.7 | Align with Expenses. |
| 03 · Payroll Engine | TDS projection, regimes, rebate, marginal relief, cess | ✅ | ✅ (TDS) | Old/new regime as separate slabs; **employee regime choice** comes from `india-payroll` (module 04). |
| 04 · India Statutory | 24Q / 138 quarterly return | ✅ via provider | ✅ | Full Annexure II, correct CSI window, due-date tracking, corrections from TRACES. |
| 04 · India Statutory | ECR file | ✅ ECR 2.0 | ✅ | One file per wage month; include arrears ECR. |
| 04 · India Statutory | EPF employee + VPF | ✅ (name-based PF wage) | ✅ | Build PF wage from a **component flag**, plus universal-allowance rule. |
| 04 · India Statutory | TDS challan register | ✅ | ✅ | Add interest/late-fee calculation, due-date alerts. |
| 04 · India Statutory | Tax regime selection | ✅ self-service | ⚠️ | Default new regime; year-correct slabs; 12BB proofs. |
| 05 · Employee Lifecycle | Birthday / anniversary / holiday reminders | ✅ | ⚠️ | Add opt-out and privacy controls. |
| 05 · Employee Lifecycle | Employee master + custom fields | ✅ (ERPNext) | ✅ | Custom fields via §2.1.5. |
| 05 · Employee Lifecycle | Exit clearance by departments | ✅ (separation tasks) | ✅ | Add clearance sign-off per department. |
| 05 · Employee Lifecycle | Exit interview + questionnaire | ✅ | ✅ | 💡 Built-in survey instead of web form. |
| 05 · Employee Lifecycle | Induction checklists / tasks | ✅ (project + tasks) | ✅ | 💡 Generic journey engine; SLA and reminders. |
| 05 · Employee Lifecycle | Org chart, reporting lines | ✅ (ERPNext) | ✅ |  |
| 06 · Expenses, Advances & Travel | Accounting export | ✅ in-house ledger | ⚠️ §2.1.13 | Journal export to Tally / Zoho. |
| 06 · Expenses, Advances & Travel | Advances with settlement / return / salary recovery | ✅ | ✅ | Add instalment recovery. |
| 06 · Expenses, Advances & Travel | Expense claims with approval | ✅ | ✅ | Multi-level via our workflow engine (§2.1.4). |
| 07 · Performance | Goals with cascading (tree), progress, KRA alignment | ✅ | ✅ "goals and OKRs" | Add **OKR** style (objective + measurable key results with target/actual), company → team → individual cascade. |
| 07 · Performance | Review cycles & appraisals | ✅ | ✅ |  |
| 08 · Recruitment | Branded careers page per tenant | ✅ basic | ✅ | Tenant branding, SEO, custom domain. |
| 08 · Recruitment | Employee referrals + bonus | ✅ | ✅ | Bonus rules. |
| 08 · Recruitment | Handoff to onboarding | ✅ | ✅ §1.3.2 |  |
| 08 · Recruitment | Panel interviews, scorecards, feedback | ✅ | ✅ | Add calendar sync (Google / Microsoft). |
| 09 · Training, Grievance & Other Features | Training catalogue, sessions, attendance, results, feedback | ✅ basic | ✅ §1.3.9 |  |
| 10 · Mobile App (PWA) | Attendance check-in, leave, approvals, self-service | ✅ | ✅ |  |
| 10 · Mobile App (PWA) | Expense claims with photo receipts | ✅ | ✅ | Add OCR. |
| 10 · Mobile App (PWA) | Multi-language UI | ✅ translations | ✅ §2.1.6 | Hindi + regional languages for blue-collar users. |
| 10 · Mobile App (PWA) | Payslips + PDF | ✅ | ✅ | Add Form 16, letters, tax sheet. |
