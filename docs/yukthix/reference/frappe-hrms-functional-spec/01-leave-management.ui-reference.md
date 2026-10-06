# 01 · Leave Management — UI Reference (pilot)

> **Purpose.** Record how Frappe HR lays out the Leave screens so YukthiX can reuse the *layouts and flows* (decision D13) while building its own React UI in the YukthiX visual style.
> **Companion to:** [01-leave-management.md](01-leave-management.md) (behaviour) and [01-leave-management.data-dictionary.md](01-leave-management.data-dictionary.md) (fields).
> **Captured:** 24 Sep 2026 from the local test instance (`hrms.localhost`, company *workfox*, demo data, 6 employees). Screenshots are in [`../ui-screens/01-leave/`](../ui-screens/01-leave/). They are for internal reference only and must never be shipped or published.

## Clean-room rules for UI

| Allowed | Not allowed |
|---|---|
| Page structure: where the list, form, side panel and tabs go | Copying CSS, components, icons, logos, illustrations or colours |
| The order of steps in a flow, grouping of fields into sections | Copying label text, help text, empty-state or error wording word for word |
| Which information is shown together (e.g. balance next to the apply form) | Copying document numbering formats (`HR-LAP-.YYYY.-`) or identifiers |
| Learning from what is confusing (see §4) | Tracing screenshots into mock-ups |

YukthiX writes its own labels (plain English, Indian SMB vocabulary) and uses the YukthiX design tokens.

---

## 1. Shared page patterns (reuse these across all modules)

Nearly every Leave screen is one of five templates. Building these five well in React covers about 80 % of the HR suite UI.

| # | Pattern | Frappe layout | YukthiX version |
|---|---|---|---|
| P1 | **App shell** | Left sidebar (module switcher at top, search, notifications, module links, user at bottom); page title bar with actions on the right. | Keep. **Improve:** role-based sidebar with at most ~8 items per module. Frappe's HR sidebar shows 25 items plus "66 more not shown", which is too many. Put a global tenant/legal-entity switcher in the top bar. |
| P2 | **List page** | Title + view switcher (List / Calendar / Report) + refresh + ⋯ + primary "Add" button. Row of quick-filter inputs, then Filter / Sort chips. Table: checkbox, name (bold), status pill, key columns, record ID, age, comment count, like. Page-size buttons (20/100/500/2500) at the bottom. | Keep the structure. **Improve:** saved views as tabs ("Pending my approval", "This month", "All"); status pills with meaning (Frappe's allocation list shows "Submitted" on every row, which tells the user nothing); show names not IDs; infinite scroll or normal pagination; bulk actions bar when rows are selected. |
| P3 | **Document form** | Breadcrumb "Doctype / Title" + status pill; prev/next arrows, ⋯ menu, primary action (Save → Submit → Cancel). Optional **Connections** strip (linked records with counts and "+"). Sections in a 2-column grid; collapsible sections. Right rail: assign, attachments, tags, share, last edited / created. Below the form: comments box, then activity timeline. | Keep: 2-column sections, right rail, comments + activity at the bottom. **Improve:** put the fields first and move connections into the right rail. On Frappe's open leave application the actual fields start halfway down the page. Show a single clear primary action per state (Apply → Approve/Reject → Cancel request). Hide "changed from 0 to null" noise in the activity. |
| P4 | **Report page** | Title + Actions + refresh; one row of filter inputs; tree-grouped or flat data grid with per-column filter row; footer with filter syntax hint and execution time. | Keep grid + filter row. **Improve:** always default the filters (current leave year, current entity). Frappe opens "Employee Leave Balance" as an empty page asking for filters. Add export and a chart toggle. |
| P5 | **Mobile PWA** | Top bar (title, bell, avatar); content cards on a grey background; bottom tab bar (Home, Attendance, Leaves, Expenses, Salary). Full-width black primary button pinned at the bottom of forms. | Keep almost as is. It is the cleanest part of Frappe's UI. **Improve:** as below per screen. |

---

## 2. Screen-by-screen

### 2.1 Leave home / workspace — [01](../ui-screens/01-leave/01-leaves-workspace.png)
- **Layout:** module sidebar (Home, Leave Application, Encashment, Control Panel, Policy Assignment, Allocation, Reports ›, Setup ›, Settings). Main area: one chart card ("applications by type") and three number cards (on leave today, on leave this month, holidays this month).
- **Observed:** the chart says *No Data* and *Holidays this month = 0*, although September has leave records and four Sundays. The cards use the user's *default* company ("workfox (Demo)"), not the company that has the data, and do not show this anywhere. **The user sees a silently wrong dashboard.**
- **YukthiX:** role-specific home.
  - **Employee:** my balances, request button, my upcoming leave, holidays.
  - **Manager:** requests waiting for me, with team availability; who is off this week.
  - **HR:** exceptions, negative balances, year-end status, pending encashments.

  Every card shows its scope, for example "Workfox Pvt Ltd · FY 2026-27".

### 2.2 Leave request list — [02](../ui-screens/01-leave/02-leave-application-list.png)
- **Columns:** employee name, status pill (Open amber / Approved green / Rejected red), from date, total days, ID. Quick filters: ID, employee, employee name, leave type, status.
- **Missing:** to-date, leave type column, approver, half-day marker. You cannot see *what* leave it is without opening it.
- **YukthiX:** columns person (avatar + name), type (colour chip), dates as a range ("12–16 Oct · 5 days", "4 Sep · ½ day (2nd half)"), status, approver, applied on. Default tab for managers is "Waiting for me", with Approve / Reject inline in the row.

### 2.3 Leave request form — open [04](../ui-screens/01-leave/04-leave-application-form-open.png), approved [03](../ui-screens/01-leave/03-leave-application-form-approved.png), new [05](../ui-screens/01-leave/05-leave-application-new.png)
- **Order on the open form:**
  1. The confirmation banner, shown twice.
  2. Connections (Attendance, Reports).
  3. The **allocated leaves table**: per type, allocated / expired / used / pending approval / available.
  4. The sections: employee + type | company + department; dates & reason (from, to, half day, total days | reason, balance before application); approval (approver, posting date, status, notify by email).
  5. Other details (collapsed), then comments and activity.
- **New form:** naming series (visible to the user), type, employee, dates, reason, approver, posting date, status. The balance table appears only after the employee is chosen.
- **Approved form:** read-only. Header actions are *View Ledger* and *Cancel*. The Attendance connection shows a count of 2 (attendance records created).
- **Worth keeping:** the per-type balance table shown *while applying* is the best idea on this screen.
- **Observed issues:**
  - "Balance before application" shows **0** for Privilege Leave while the table above shows **7.5 available**. Two numbers on one screen disagree. Add this to defect list §3 of the functional spec to verify.
  - Status (Open / Approved / Rejected) is a normal dropdown the approver edits and then *submits*: a two-step, error-prone approval.
  - The employee field shows the ID only (`HR-EMP-00003`) on the open form, but "ID: Name" on the submitted one.
- **YukthiX:**
  - **Apply** is a single-column sheet: type (with balance shown in the dropdown), date range picker with half-day per end (1st/2nd half), and a live summary: "5 days · 1 holiday excluded · balance after: 2.5". The summary includes projected balance, sandwich effect, block-date warnings, notice-period and attachment rules.
  - **Approve** is a separate approver view: request + balance + **team availability strip** ("2 others off on these dates") + Approve / Reject with comment. Delegation is shown ("approving on behalf of Priya").
  - **Cancel/withdraw** is initiated by the employee and goes through approval.
  - The system generates the ID, which is never an input.

### 2.4 Leave calendar — [06](../ui-screens/01-leave/06-leave-calendar.png)
- **Layout:** month grid (Sun–Sat), today highlighted, bars labelled "Name (Type)", Today / Month / Week / Day, "Hide weekends", drag to create.
- **Observed:** approved and open requests look almost the same (both pale blue); holidays are not shown; there is no filter by team/department in the view itself.
- **YukthiX:** team calendar with a row per person (timeline) and a month grid option; colour by type, hatched fill for pending, holidays and weekly offs shaded; filters for my team / department / location.

### 2.5 Allocations — list [07](../ui-screens/01-leave/07-leave-allocation-list.png), form [08](../ui-screens/01-leave/08-leave-allocation-earned.png)
- **List:** one row per employee × type. 19 rows for 6 people, all "Submitted".
- **Form:** Connections at the top (comp-off, encashment, adjustment, each with a "+"). Sections:
  - Employee | type + validity dates.
  - Allocation: new leaves, policy assignment link, "add unused from previous", total.
  - **Earned-leave schedule** grid: date, days, allocated ✓, via.
- **Observed:**
  - For Privilege Leave (earned monthly, 18/yr), the first row credits **7.5 on 24-09-2026** as a catch-up for Apr–Aug, then 1.5 on the last day of each month to March. This is clear and useful.
  - Rahul (joined 17 Aug) received pro-rated CL 7, SL 7 and PL 0.5.
- **YukthiX:** replace the allocation document with an **Employee leave card**:
  - Per type: entitlement, accrued so far, taken, pending, lapsed, carried forward, balance.
  - A timeline of every ledger entry: accrual, application, adjustment, encashment, expiry.
  - A future-accrual projection.

  HR edits happen through "Adjust balance" (reason required), never by editing an allocation.

### 2.6 Leave type — [09](../ui-screens/01-leave/09-leave-type-form.png)
- **Layout:** tabs Details / Limits / Connections. Checkbox groups:
  - Compensatory, LWP, partially paid.
  - Negative balance, over-allocation, include holidays, optional holiday.
- Collapsible sections: Carry Forward (max, expiry days), Encashment, Earned Leave.
- **Observed:** about 30 settings arranged as a flat wall of checkboxes. The relationships (e.g. "earned" needs frequency + day) are not visible until expanded.
- **YukthiX:** a **leave type wizard / sectioned editor** in plain language:
  1. Basics (name, paid / unpaid / partially paid, colour).
  2. Who can use it (eligibility: gender, marital status, employment type, probation, location).
  3. How it is credited (upfront / accrual by month or quarter / by days worked / reduced by LOP; rounding; pro-rata for joiners).
  4. How it is counted (holidays & weekends, **sandwich mode**, half days, hourly).
  5. Rules when applying (min notice, max per request/month, block dates, attachment after N days, negative up to −N).
  6. Year end (carry forward cap, expiry, lapse, encashment triggers and rate formula).

  Also show a live "Example: an employee joining 15 Jun gets…" preview panel, and statutory templates (Maternity 26 weeks, state S&E carry-forward caps) as starting points.

### 2.7 Leave policy — [10](../ui-screens/01-leave/10-leave-policy.png) · Policy assignment list — [11](../ui-screens/01-leave/11-leave-policy-assignment-list.png)
- **Policy:** name + grid (leave type, annual allocation). Header "Create" menu. Simple and fine.
- **Assignment list:** one row per employee; "Bulk Leave Policy Assignment" button in the header.
- **YukthiX:** policy = a named bundle of leave types with entitlements. Attach it by **rule** (location / department / grade / employment type) with per-employee override, rather than one document per employee. The assignment list becomes "Who is on this policy" with counts and exceptions.

### 2.8 Leave period — [12](../ui-screens/01-leave/12-leave-period.png)
- **Fields:** from, to, company, optional-holiday list, active. A connection to allocations.
- **YukthiX:** "Leave year" settings per legal entity (calendar / financial / custom start month), with no user-created period documents. The year-end wizard (§2.13) moves the year forward.

### 2.9 Leave control panel (bulk allocate) — [13](../ui-screens/01-leave/13-leave-control-panel.png)
- **Layout:**
  - Top: "dates based on" (period / joining / custom), leave period, company, from date; policy, "allocate based on policy", carry forward.
  - Collapsed quick and advanced filters.
  - An employee picker grid (employee, name, company, department).
  - Primary button top right.
- **Observed:** required fields are outlined red before the user has done anything; the grid is empty until filters are set.
- **YukthiX:** folded into the **year-end / bulk actions wizard**: choose people (rules or picker), choose action (allocate, carry forward, encash, lapse), **preview per employee**, confirm, get a downloadable result.

### 2.10 Holiday list — [14](../ui-screens/01-leave/14-holiday-list.png)
- **Layout:**
  - Connections (company 1, employee 6, SLA, leave period, shift type, workstation).
  - From/to, total holidays (59).
  - Collapsible "add weekly holidays" and "add local holidays" helpers.
  - A grid of **59 rows** (date, description, half-day), paged 50 at a time, with weekly Sundays stored as rows next to festivals.
  - Colour picker.
- **YukthiX:**
  - Weekly offs are a **rule**, not rows; they later move to shifts (decision 2).
  - Holiday calendar per **location** is shown as a year calendar plus a list of named holidays only.
  - Mark holidays as *mandatory* or *optional (choose N of M)*.
  - Import state festival templates.
  - Clone to next year.

### 2.11 Compensatory leave — [15](../ui-screens/01-leave/15-compensatory-leave.png)
- **Sections:** employee | type (comp-off) + allocation created; "worked on holiday" (from, to, half day | reason).
- **Observed:** on submit it silently creates or extends an allocation (HR-LAL-…-00019). The link appears only in the activity.
- **YukthiX:** an employee "Claim comp-off" flow:
  - Pick the worked holiday/weekend from the calendar.
  - The system checks attendance and shows "1 day credited, expires 14 Nov" (expiry window).
  - The manager approves.

  The credit then appears on the leave card timeline.

### 2.12 Encashment [16](../ui-screens/01-leave/16-leave-encashment-new.png) · Block list [17](../ui-screens/01-leave/17-leave-block-list-new.png) · Adjustment [18](../ui-screens/01-leave/18-leave-adjustment-new.png)

| Screen | Frappe layout | YukthiX |
|---|---|---|
| **Encashment** | 3-column top (employee, period, days \| company, type). Sections: accounting ("pay via payment entry" toggle), payroll (date), more info (status). | Part of the leave card ("Encash days"). Shows the **rate formula result** before confirming ("6 days × ₹1,538.46 (Basic ÷ 26) = ₹9,230.77, paid in Oct payroll"). The three triggers (exit, year end, request) come from the leave type. |
| **Block list** | Name, company, type, "applies to company"; a grid of block dates + reason; a grid of users allowed to approve anyway. | "Blackout dates" under leave settings: date range, reason, scope (location/department/type), exempt approvers. Show them on the apply calendar *before* the user picks dates. |
| **Adjustment** | Series, employee, type, adjustment type (allocate / reduce), days, posting date. | "Adjust balance" dialog on the leave card: +/− days, reason (required), effective date, audit trail. Also used for data migration. |

### 2.13 Reports — balance [19](../ui-screens/01-leave/19-report-leave-balance.png), summary [20](../ui-screens/01-leave/20-report-leave-balance-summary.png), ledger [21](../ui-screens/01-leave/21-report-leave-ledger.png)

| Report | Frappe | Observation | YukthiX |
|---|---|---|---|
| **Balance** | Filters: from, to, company, department, employee, status; "consolidate types". Grid grouped by type → employee: opening, allocated, taken, expired, closing. | Opens empty until dates are set. **Leave Without Pay shows closing −2** for Meera, so unpaid leave is presented as a negative balance. | Default to the current year. Exclude unpaid types from the balance or show them as "days taken" only. |
| **Summary** | As of date; one row per employee, one column per leave type (3 decimals). | Compact and useful for HR. "0.500" looks like a precision leak. | Keep as the "Balances" matrix. Show ½ and whole numbers; click a cell to open the ledger. |
| **Ledger** | Filters incl. transaction type/name. Rows: employee, created, from, to, ±leaves (green/red), type, transaction type, document. | The clearest view of how balances are built. Keep. | Same, as the leave card timeline plus an HR-wide audit export. |

### 2.14 Employee record — [22](../ui-screens/01-leave/22-employee-form.png)
- **Tabs:** Overview, Address & Contacts, Attendance & Leaves, Salary, Personal, Profile, Joining, Exit, Connections. Leave approver sits in "Attendance & Leaves".
- **YukthiX:** employee profile gets a **Leave** tab that shows the leave card from §2.5, with the approver chain and holiday calendar (from location) visible there.

### 2.15 Mobile PWA — home [m1](../ui-screens/01-leave/m1-pwa-home.png), leave dashboard [m2](../ui-screens/01-leave/m2-pwa-leaves-dashboard.png), apply [m3](../ui-screens/01-leave/m3-pwa-leave-new.png), history [m4](../ui-screens/01-leave/m4-pwa-leave-list.png), detail [m5](../ui-screens/01-leave/m5-pwa-leave-detail.png)
- **Home:** greeting + check-in card; quick links (attendance, shift, leave, expense, advance, salary slips); My / Team requests toggle; bottom tabs.
- **Leave dashboard:**
  - A horizontally scrolling row of **balance cards** with a half-donut ("10/12 Casual").
  - A full-width "Request a Leave" button.
  - Recent leaves (type, range, days, status pill, chevron) + "View list".
  - Upcoming holidays.
- **Apply:** type dropdown, from/to (native date inputs), half day, reason, approver (prefilled), attachments, Save pinned at the bottom.
- **History:** "My leaves / Team leaves" segmented control, filter, "+ New".
- **Detail:** a read-only form with a large "Cancel" button at the bottom.
- **Observed:**
  - Privilege Leave shows "7.5/7.5". The denominator is accrued-to-date, not the annual 18, which is confusing.
  - The approver shows as "Administrator : Administrator" (ID : name).
  - The detail page reuses full form inputs for read-only data.
  - "Half day" has no first/second-half choice.
- **YukthiX:** keep this structure almost exactly. It matches D13 well.
  - **Balance card:** "10 of 12 left" with a sub-line "+1.5 on 31 Oct" for accruals.
  - **Apply:** a range picker in one sheet, half-day per end, and a live days/balance summary (as desktop §2.3).
  - **Detail:** a timeline (applied → approved by X → attendance marked) plus a "Withdraw request" button.
  - **Manager:** swipe or approve buttons in Team requests, with an "others off" hint.
  - Build offline-tolerant drafts.

---

## 3. YukthiX Leave screen inventory

This is the target set of screens. Each item from functional-spec §4 is shown next to the screen that carries it.

| # | YukthiX screen | Based on Frappe | Carries these additions (§4) |
|---|---|---|---|
| 1 | Leave home (role-based: employee / manager / HR) | 2.1, 2.15 | Team availability, balance projection, exceptions |
| 2 | Apply leave (desktop sheet + mobile) | 2.3, 2.15 | 1st/2nd half, hourly/short leave, sandwich preview, min notice, max per month, mandatory attachment, block-date warning, optional-holiday quota, negative balance limit |
| 3 | Approvals inbox + approve view | 2.2, 2.3 | Multi-level approval, **delegation**, team availability ("who else is off") |
| 4 | My leave / request detail + withdraw | 2.15 | Employee-initiated cancellation with approval |
| 5 | Team leave calendar (timeline + month) | 2.4 | Holidays per location, pending vs approved |
| 6 | Employee leave card (balances + ledger timeline + projection) | 2.5, 2.13 | Carry forward & expiry visible, adjustment with reason, encash, LOP-reduced accrual, balance projection |
| 7 | Leave types (sectioned editor + preview) | 2.6 | Eligibility, days-worked accrual, LOP-reduced accrual, rounding (decision 4), sandwich mode (decision 3), negative limit (decision 6), encashment triggers & formula (decision 5), comp-off expiry, statutory templates |
| 8 | Leave policies + rule-based assignment | 2.7 | Per location / grade / employment type |
| 9 | Holiday calendars per location | 2.10 | Per-location calendars (decision 2), optional holidays N-of-M, state templates |
| 10 | Leave settings (leave year per entity, blackout dates, notifications) | 2.8, 2.12 | Leave year per legal entity (decision 1), block dates |
| 11 | Comp-off claim | 2.11 | Comp-off expiry window |
| 12 | **Year-end wizard** (preview → carry forward + encash + lapse) | 2.9 | Year-end processing wizard, auto-drafted encashments |
| 13 | Reports: balances matrix, ledger, leave taken, LOP for payroll | 2.13 | Defaults set; payroll LOP feed |

---

## 4. UI issues seen on the instance (do not copy)

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U1 | Workspace | Cards use a hidden default company, so the dashboard shows 0 or "No Data" while data exists. | Every aggregate shows its scope; the entity switcher is always visible. |
| U2 | Leave request | "Balance before application" 0 vs table 7.5 available. | One balance calculation, shown once. |
| U3 | Leave request | Approval = edit a status dropdown, then Submit. | Approve / Reject are actions, not field edits. |
| U4 | Forms | Banner duplicated; connections and balance table push fields below the fold. | Fields first; context in the side rail. |
| U5 | Lists | Status "Submitted" on every allocation row; IDs shown instead of names. | Status carries business meaning; names over IDs. |
| U6 | Reports | Open empty with red required filters. | Sensible defaults. |
| U7 | Balance report | Unpaid leave shown as a negative closing balance. | Unpaid types show "taken", not a balance. |
| U8 | Holiday list | Weekly offs stored as 52 rows; long paged grid. | Rules for weekly offs; calendar view. |
| U9 | Leave type | ~30 flat settings; dependencies hidden. | Sectioned editor with a live example. |
| U10 | Sidebar | 25 items + "66 more not shown". | Role-based, short navigation. |
| U11 | Mobile | "7.5/7.5" denominator is accrued-to-date; "ID : name" in approver. | "X of Y left" with next-accrual hint; names only. |
| U12 | Activity | "changed value from 0 to null" entries on system updates. | Hide system-only field changes from the timeline. |

---

## 5. Capture notes (for repeating on other modules)

- **Script:** `shots.js` (Playwright + installed Chrome), in the session scratchpad. It needs a temporary API token (`yx_key.py`).
  - The desk needs the "Session expired" modal hidden and the viewport grown to the tallest scroller.
  - The PWA needs a real session: use the single-use `login_via_key`, with the admin user temporarily linked to an employee without user permissions.
- **Reports:** pass filters in the URL (`?company=workfox&from_date=…&to_date=…`).
- **Clean-up done 24 Sep 2026:**
  - API key and secret cleared.
  - Employee link removed.
  - Token and key files deleted.
  - One-time key consumed.
- **Not captured (low value):** collapsed sections (Encashment / Earned Leave on leave type, Other Details on the request form) and settings pages. The behaviour for these is covered in the functional spec.
