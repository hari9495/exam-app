# 02 · Attendance & Shifts — UI Reference

> **Purpose.** How Frappe HR lays out the attendance, shift and overtime screens, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [02-attendance-and-shifts.md](02-attendance-and-shifts.md) (behaviour) and [02-attendance-and-shifts.data-dictionary.md](02-attendance-and-shifts.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the Leave pilot ([01 UI reference](01-leave-management.ui-reference.md)). The shared page patterns P1–P5 are defined there and are not repeated here.
> **Captured:** 24 Sep 2026 on the local test instance. Screenshots are in [`../ui-screens/02-attendance/`](../ui-screens/02-attendance/) (25 desktop + 7 mobile). Internal reference only.

## Demo data behind the screenshots

Company *workfox*, 6 employees, 1–23 Sep 2026.

| Item | Setup |
|---|---|
| Shifts | **General 9–6** (Hyderabad) for Ananya, Vikram and Meera. **Sales Flexi 10–7** (Chennai) for Priya and Arjun. **Night 10pm–6am** for Rahul, generated from a repeating Mon–Fri weekly schedule. |
| Shift rules | Auto attendance on. Half-day threshold 6 h, absent threshold 4 h. Late and early grace 15 min. Overtime allowed on General, with a *Standard OT* type (₹150/h × 1.5; weekend and holiday × 2; max 3 h/day). |
| Office geofences | Hyderabad HQ and Chennai Office, radius 150 m. |
| Punches | 223, from a biometric device (Hyderabad) or the mobile app with GPS (Chennai). |

**Scenarios built into the punches:**
- Vikram is late on 4 days.
- Ananya stays until 20:30 on 3 days (overtime).
- Arjun leaves at 15:30 on 11 Sep, so the day becomes a half day by hours.
- Priya exits early on 19 Sep.
- Meera forgets to punch out on 10 Sep.
- Meera is absent on 14–15 Sep after her leave was rejected.
- Arjun has a WFH request for 22–23 Sep. Priya has an On-Duty request (draft). Meera has a shift-change request (draft).

**Frappe's own hourly engine then produced:**

| Result | Count |
|---|---|
| Present | 109 |
| Absent | 3 |
| Half day | 2 |
| On leave | 2 |
| Late entries | 4 |
| Early exits | 2 |
| **Days with overtime** | **45** |

---

## 1. Screen-by-screen

### 1.1 Shift & Attendance home — [01](../ui-screens/02-attendance/01-shift-attendance-workspace.png)
- **Layout:** module sidebar (Roster, Dashboard, attendance tool, check-ins, shift request, attendance request, Overtime ›, Reports ›, Setup ›, Settings). Main area: an "attendance count" line chart (present / absent / leave per day) and three number cards: present, absent and late this month.
- **Observed:** on the first capture every card showed **0** and the chart said *No Data*. This is the Leave home problem again (U1): the cards silently use the user's default company. After we switched the default company to *workfox*, they showed 109 / 3 / 4.
- **YukthiX:** role-based "Today" board.
  - **Manager/HR:** who is in, late, not yet in, on leave or WFH right now; exceptions queue (missed punches, pending regularisations, overtime awaiting approval); this-month trend.
  - **Employee:** the check-in card (§1.12).

  Every figure shows its scope, for example "Hyderabad · today 10:40".

### 1.2 Attendance list — [02](../ui-screens/02-attendance/02-attendance-list.png)
- **Columns:** employee, status pill, date, ID. Header has "Mark Attendance" and "Add Attendance".
- **Missing:** shift, in/out time, hours, late/early flags. A manager can't see *why* a day is Half Day or Absent without opening each record. The list is also 116 rows, one per person per day, which is a poor way to review a month.
- **YukthiX:** replace it with a **muster grid** (§1.9) as the main view. Keep a row list only as a filterable "exceptions" view: late, early, absent, missed punch, overtime.

### 1.3 Attendance record — late [03](../ui-screens/02-attendance/03-attendance-form-late.png), overtime [04](../ui-screens/02-attendance/04-attendance-form-overtime.png), half day [05](../ui-screens/02-attendance/05-attendance-form-halfday.png), missed punch [06](../ui-screens/02-attendance/06-attendance-form-missed-punch.png)
- **Layout:**
  - Connections strip ("Employee Checkin 2").
  - Employee | date, company, department. Working hours and status. "Status for other half" appears on half days.
  - Details: shift, in time, out time (with timezone) | late entry, early exit checkboxes.
  - Overtime section, shown only when there is overtime: type, standard hours, actual overtime.
  - Comments and activity.
- **Observed:**

  | Record | What the screen shows |
  |---|---|
  | Late (Vikram) | In 09:32, out 18:28, 8.93 h, "late entry" ticked. The screen doesn't say *how* late (17 min past grace). |
  | Overtime (Ananya) | 09:02–20:30 = 11.47 h. Standard hours 9, actual overtime 2.47. Nothing marks it as approved or not; it simply exists. |
  | Half day (Arjun) | 5.42 h, "other half: Absent", early exit ticked. |
  | Missed punch (Meera) | Only an in time (08:54). Status **Absent**, with an automatic comment saying she was below the working-hours threshold. **The real cause is a missing out-punch.** The screen misleads HR, and it offers no regularisation action. |

  Every record's activity shows "changed from 0 to null" noise (Leave U12).
- **YukthiX:** a **day card** instead of a form:
  - A timeline bar for the shift window, with the punches placed on it (source: device / mobile + map pin / manual).
  - Computed facts in words: "Late by 17 min", "Worked 8 h 56 m", "Overtime 2 h 28 m, pending approval".
  - Actions: **Regularise** (propose correct in/out times with a reason, routed to the manager), Mark on-duty, Approve overtime.
  - A missing punch is shown as "Missing check-out", not "below threshold".

### 1.4 Attendance calendar — [07](../ui-screens/02-attendance/07-attendance-calendar.png)
- **Observed:** a month grid that stays **empty for HR**, because it shows only the logged-in user's own attendance. It is useless on the desk.
- **YukthiX:** the team calendar and muster grid (§1.9) are for managers and HR; the personal calendar lives on mobile (§1.12).

### 1.5 Punches (check-ins) — list [08](../ui-screens/02-attendance/08-employee-checkin-list.png), record [09](../ui-screens/02-attendance/09-employee-checkin-form.png)
- **List:** one row per punch (223 rows): employee, log type pill (IN/OUT), time, ID. Header has "Add Checkin for Another Employee".
- **Record:** employee, log type, shift | time, device ID ("Mobile App"), skip-auto-attendance, attendance marked (link).
- **Observed:** the latitude/longitude we stored are not visible anywhere on the punch record. There is no map, no distance from the office and no "inside geofence" result.
- **YukthiX:** punches appear inside the day card (§1.3), not as a list of their own. Keep an audit list for HR with source, device, location and a distance/geofence verdict, and a selfie thumbnail when that option is on.

### 1.6 Shift type — [10](../ui-screens/02-attendance/10-shift-type-form.png)
- **Layout:**
  - Connections (attendance 58, check-ins 99+, requests, assignments 3).
  - Start/end | holiday list, roster colour, enable auto attendance.
  - **Auto attendance settings:** in/out detection mode, hours calculation mode, check-in window before start, check-out window after end, mark on holidays, absent buffer days | half-day and absent thresholds, "process after" date, last sync of check-in, auto-update last sync.
  - **Late/early:** enable + grace for each.
  - **Overtime:** allow + type.
- **Observed:** about 20 settings. Two of them, "last sync of check-in" and "process after", are **operational plumbing shown as configuration**, with warning text ("don't modify this if you are unsure"). The help text is long and technical.
- **YukthiX:** a **shift editor** in plain language:
  1. **Timing:** start, end, break (fixed unpaid / from punches), night-shift flag, weekly offs (decision pending, Q1).
  2. **Attendance rules:** full day ≥ X h, half day ≥ Y h; how early and late punches count.
  3. **Late & early:** grace, and **penalty policy** such as "3 lates in a month = ½ day LOP".
  4. **Overtime:** after N minutes beyond shift end (minimum threshold), pre-approval required, rate/type.
  5. **Allowances:** night or shift allowance.

  Also show a **live preview**: "A punch at 09:20–14:30 becomes Half day, late by 5 min". Device sync status goes on an integrations page, not here.

### 1.7 Office location / geofence — [11](../ui-screens/02-attendance/11-shift-location-form.png)
- **Observed:** on this instance the form body did not render at all after two tries: no name, coordinates, radius or map, only the connections strip ("Shift Assignment 12") and comments. We could not see the intended layout. The fields (name, latitude, longitude, radius, map pin) are listed in the data dictionary.
- **YukthiX:** location = a map with a draggable pin and a radius circle, several allowed locations per employee, and optional IP / Wi-Fi ranges for web punching.

### 1.8 Shift assignments & schedules — list [12](../ui-screens/02-attendance/12-shift-assignment-list.png), record [13](../ui-screens/02-attendance/13-shift-assignment-form.png), schedule [14](../ui-screens/02-attendance/14-shift-schedule-form.png), schedule assignment [15](../ui-screens/02-attendance/15-shift-schedule-assignment.png), roster [25](../ui-screens/02-attendance/25-roster.png)

**Frappe layout:**

| Screen | What it shows |
|---|---|
| Assignment | Employee details; shift details (type, location, start, end blank = open-ended, status). |
| Schedule | Shift type, frequency ("Every Week"), a grid of weekdays (Mon–Fri). |
| Schedule assignment | Employee, schedule, location, status, enabled, "create shifts after" (moves forward automatically, e.g. to 30-10-2026). |
| **Roster** (separate app) | Month grid of employees × days. Each cell is a coloured card: shift name, time, location pin. Weekly offs are shaded with "WO". Approved leave is shown in the cell ("Casual Leave" on Arjun's 4 Sep). Filters: company, department, branch, designation, shift type, location. "Create" menu and view switcher. |

**Observed:**
- Rahul's single repeating schedule became **9 separate weekly assignment documents** in the list (one per week to the end of October). The list turns into clutter as soon as schedules are used.
- The roster is the best screen in this module: clear, visual and filterable.
- On weekly offs the roster shows **both "WO" and a shift card** in the same cell, because the assignment spans the holiday. That is confusing.
- The capture shows only the first four people. We did not check whether the grid loads more rows as you scroll.

**YukthiX:**
- The **roster is the main shift screen.** Assignments and schedules are data behind it and never shown as lists.
- Features:
  - Drag to assign, copy a week, swap two people.
  - Rotating patterns (e.g. 4 on / 2 off, 3-shift rotation over N days; decision Q2).
  - Conflict badges: overlapping shifts, minimum rest broken, on leave.
  - Publish / notify employees.
- A weekly off shows **only** "Off".

### 1.9 Monthly attendance sheet — [23](../ui-screens/02-attendance/23-report-monthly-attendance-sheet.png)
- **Layout:**
  - Filters: month/date range, month, year, employee, status, company, department, branch, group by, include descendants, summarised view.
  - A **legend strip** with status codes (P, A, HD/A, HD/P, WFH, L, H, WO).
  - A line chart (absent / present / leave per day).
  - A grid of employee × day status codes.
- **Observed:**
  - Useful and close to the muster roll Indian HR expects.
  - Late entries are **not visible in the grid**, so Vikram's late days show as a plain "P".
  - Rahul's Saturdays (no shift scheduled) are **blank**, not "Off", so HR can't tell "not scheduled" from "missing".
  - The chart repeats what the grid already shows.
- **YukthiX:** the **muster grid** as the attendance home for HR:
  - Colour cells, with small markers for late, early, overtime and regularised.
  - Click a cell to open the day card (§1.3).
  - Row totals: payable days, LOP, late count, overtime hours.
  - "Lock month" after payroll.
  - Export in the statutory muster format (India pack).

### 1.10 Shift attendance report — [24](../ui-screens/02-attendance/24-report-shift-attendance.png)
- **Layout:**
  - Filters: dates, employee, shift, department, company; late / early / consider grace / include records without punches.
  - **Summary numbers:** present 109, half day 1, absent 1, late 4, early 2.
  - A stacked bar of attendance by shift (General 56, Sales 39, Night 16).
  - A long grid: shift start/end, in/out (late in-times and early out-times in **red**), total hours.
- **Observed:** the summary says **half day 1 and absent 1**. The module's own counts are **2 and 3**, because this report only counts records that have punches. The difference is not explained anywhere, so two screens disagree.
- **YukthiX:** fold into the exceptions view of the muster (§1.2), with the same numbers everywhere.

### 1.11 Requests — shift request [16](../ui-screens/02-attendance/16-shift-request-form.png), attendance request WFH [17](../ui-screens/02-attendance/17-attendance-request-wfh.png), On-Duty draft [18](../ui-screens/02-attendance/18-attendance-request-onduty-draft.png)

**Frappe layout:**

| Request | Fields |
|---|---|
| Shift request | Shift type, employee, department, status (Draft) \| company, approver, from, to. |
| Attendance request | Employee, company \| from, to, half day, include holidays, shift (with a note that it won't overwrite existing records). Reason (WFH / On Duty) + explanation. |

**Observed:**
- The submitted WFH request for 22–23 Sep **overwrote two existing Present records**, yet its "Attendance" connection shows **no count**, so there is no trail from the request to the days it changed.
- Approval is again "edit status + Submit" (Leave U3).
- There is **no request type for correcting punch times**. On-Duty/WFH can only change the status.

**YukthiX:** one **"Request" sheet** with types, all routed through the same approvals inbox as leave:
- **Regularise** (missed in/out or wrong time → proposed times + reason).
- **WFH** (with a monthly limit).
- **On duty** (with an optional location).
- **Shift change / swap** (with the colleague's consent for swaps).
- **Overtime pre-approval.**

Before submitting, show the effect: "22 Sep: Present → WFH".

### 1.12 Mobile PWA — home + check-in [m1](../ui-screens/02-attendance/m1-pwa-home-checkin.png), attendance [m2](../ui-screens/02-attendance/m2-pwa-attendance-dashboard.png), punch history [m3](../ui-screens/02-attendance/m3-pwa-checkin-history.png), request [m4](../ui-screens/02-attendance/m4-pwa-attendance-request-new.png) / list [m5](../ui-screens/02-attendance/m5-pwa-attendance-requests.png), shift request [m6](../ui-screens/02-attendance/m6-pwa-shift-request-new.png), shift assignments [m7](../ui-screens/02-attendance/m7-pwa-shift-assignments.png)

**Frappe layout:**

| Screen | What it shows |
|---|---|
| Home | Greeting card: "Last check-out was at 06:03 pm yesterday · View list" and a single **Check In** button (it toggles to Check Out). |
| Attendance tab | Month calendar with coloured day circles (present green, weekly off grey); counts for present / half day / absent / on leave; "Request Attendance" button; recent requests; upcoming shifts ("General 9–6 · 1 Sep – Ongoing · 9:00–18:00"); "Request a Shift". |
| Punch history | A flat list, "Log Type: OUT / 06:03 pm yesterday". |
| Forms | Native date pickers; Save button pinned at the bottom. |

**Observed:**
- Vikram's **four late days show as plain green**; the calendar has no way to show late or early.
- The **punch history is a raw log** with ~50 rows for three weeks. The rows are not paired into days and show no hours worked. The label "Log Type: OUT" is technical wording.
- The shift request form asks the employee to pick their own **approver**.
- The check-in button gives no hint of shift timing, how late the person is, or location status.

**YukthiX:** keep the layout; it matches the leave mobile screens.
- **Check-in card:**
  - Shift and time left ("General 9–6 · starts in 12 min").
  - Location status ("At Hyderabad HQ ✓", or "Outside office, 340 m").
  - Optional selfie.
  - Offline queueing with "will sync".
- **Calendar:** a late or early dot on the day circle. Tap a day to see its punches paired, hours, and a *Fix* (regularise) button.
- **History:** grouped by day ("Tue 22 Sep · 09:32 → 18:28 · 8 h 56 m · late 17 m").
- The approver is always derived, never picked by the employee.

### 1.13 Bulk tools & overtime — attendance tool [19](../ui-screens/02-attendance/19-employee-attendance-tool.png), shift assignment tool [20](../ui-screens/02-attendance/20-shift-assignment-tool.png), overtime type [21](../ui-screens/02-attendance/21-overtime-type.png), overtime slip [22](../ui-screens/02-attendance/22-overtime-slip-new.png)

| Screen | Frappe layout | Observed | YukthiX |
|---|---|---|---|
| Attendance tool | Date, shift \| late/early flags. "Get employees" filters (company, branch, department, employment type, designation, grade, filter by shift). "Unmarked employees": a status dropdown + checkbox list shown as "ID : Name" in 3 columns; Select all / Unselect all; "Mark Attendance". | Only works for one day; nothing shows *why* someone is unmarked. | Bulk actions from the muster grid: select cells → mark status, with the reason required. |
| Shift assignment tool | Action (assign shift / schedule / process requests), company; shift details; quick/advanced filters; employee picker grid; "Assign Shift". | Empty grid until the required fields are set (same as Leave control panel). | Roster multi-select plus "apply pattern". |
| Overtime type | Basic (max hours/day, salary component); calculation method (fixed hourly rate / salary-component based, explained in help text) \| hourly rate; multipliers: standard 1.5, public holiday 2, weekend 2. | Clear. **There is no minimum-overtime threshold**: in our data *any* minutes past shift end became overtime (45 of 109 present days, e.g. 18:07 exit = 7 min OT). | Overtime policy on the shift editor: minimum block (e.g. 30 min), rounding (15 min), pre-approval, daily/quarterly caps (Factories Act), rate formula like the leave encashment formula. |
| Overtime slip | Posting date, company, employee, start/end; a grid (reference document, date, OT type, duration); "Fetch Overtime Details". | A per-employee monthly document HR must create and fill. | No slip. Approved overtime flows automatically into the payroll run, with an "Overtime" review step in the payroll wizard. |

---

## 2. YukthiX Attendance & Shifts screen inventory

Each item from functional-spec §4 is shown next to the screen that carries it.

| # | YukthiX screen | Based on Frappe | Carries these additions |
|---|---|---|---|
| 1 | Today board (manager/HR) | 1.1 | Real-time in/late/absent, exceptions queue |
| 2 | Mobile check-in card | 1.12 | Geofence status, **multiple locations**, **selfie / face match** (reuse Proctoring), **IP / Wi-Fi restriction** (web), **offline check-in** |
| 3 | Muster grid (month) + lock | 1.9, 1.2, 1.13 | **Attendance lock after payroll**, statutory muster export, late/OT markers, bulk mark |
| 4 | Day card (punch timeline + actions) | 1.3, 1.5 | **Missed-punch regularisation**, break handling, OT approval |
| 5 | Requests (regularise / WFH / on-duty / shift change / OT pre-approval) | 1.11 | **Regularisation with times**, WFH monthly limits, **OT pre-approval**, shift swap |
| 6 | Roster | 1.8 | **Rotating patterns**, weekly off per shift/roster, **minimum rest** validation, split shifts, publish |
| 7 | Shift editor with preview | 1.6 | **Break rules**, **flexi / core hours**, **late-coming penalties**, night shift, **shift/night allowance** |
| 8 | Locations (map, radius, IP ranges) | 1.7 | Geofence per location |
| 9 | Overtime policy + payroll review step | 1.13 | Minimum threshold, **statutory OT caps**, multipliers, **auto comp-off from holiday work** (links to Leave) |
| 10 | Devices & integrations | 1.6 (last sync) | **Biometric connectors / sync agent**, sync health |
| 11 | Timesheets → client billing | — (ERPNext) | Timesheets billed to clients (spec §1.2.3) |
| 12 | Reports: muster, late/early, OT, statutory registers | 1.9, 1.10 | Muster roll / Form 25 (India pack) |

---

## 3. UI issues seen on the instance (do not copy)

U1–U12 are the Leave issues in [01 UI reference §4](01-leave-management.ui-reference.md). U1 (hidden default company), U3 (status-edit approval) and U12 (activity noise) happen here too.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U13 | Attendance record | Missing out-punch reported as "below working-hours threshold". | Name the real cause; offer the fix. |
| U14 | Overtime | Any minutes past shift end count as overtime (45 / 109 days); no approval state. | Minimum block, rounding, approval. |
| U15 | Shift attendance report | Half day / absent counts (1 / 1) differ from the module's own (2 / 3). | One source of truth for counts. |
| U16 | Attendance calendar (desk) | Empty for HR; only shows your own records. | Team views for managers; personal view on mobile. |
| U17 | Punch record | GPS stored but never shown; no geofence verdict. | Show map and distance. |
| U18 | Shift assignments | One schedule → 9 weekly documents in the list. | Roster-first; hide generated records. |
| U19 | Roster | Weekly off shows "WO" and a shift card together. | Off means off. |
| U20 | Monthly sheet | Late days show as plain P; unscheduled days blank. | Markers for late/early/OT; "Off" vs "Missing" distinct. |
| U21 | Attendance request | Overwrote 2 days but its link shows no count. | Every automatic change links back to its request. |
| U22 | Shift type | Sync plumbing ("last sync", "process after") shown as settings with warnings. | Keep engine state out of configuration. |
| U23 | Mobile | Late days green; raw punch log; employee picks own approver. | Late markers; day-grouped history; derived approver. |
| U24 | Shift location | Form body did not render on this instance. | (Our test instance, not verified as a product bug.) |

---

## 4. Capture notes

- **Demo data:** `yx_demo02*.py` in the session scratchpad. It creates the shifts, locations, assignments and punches, runs Frappe's own `process_auto_attendance` per shift, and adds the requests. Rahul's night shifts needed an explicit `create_shifts` call, which the roster normally does.
- **Temporary changes for capture, all reverted 24 Sep 2026:**
  - Administrator API key (revoked).
  - Administrator linked to Vikram for the mobile screens (unlinked).
  - One-time login key (used once).
  - Administrator's default company switched to *workfox* for the dashboard, roster and tool retakes (restored to *workfox (Demo)*).
- The demo attendance, punches, shifts and requests **remain** on the test instance for later modules. Payroll (module 03) will use them.
