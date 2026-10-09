# 02 · Attendance, Shifts & Overtime — Functional Reference

**Source studied:** Frappe HR, `develop` branch (downloaded 23 Sep 2026), folder `hrms-develop`
**Maps to YukthiX:** §1.3.4 Time & Attendance (feeds §1.3.5 Payroll, §1.3.3 Leave, §1.2.3 client timesheets)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance, not by reading source.
**Data dictionary:** every object and field → [02-attendance-and-shifts.data-dictionary.md](02-attendance-and-shifts.data-dictionary.md)

---

## 0. How it works — the big picture

```
 Shift Type (9:00–18:00, rules)          Shift Location (lat/long + radius)
      │                                          │
      ▼                                          ▼
 Shift Assignment (employee × shift × dates [× location])  ◄── Shift Request (employee asks, approver OKs)
      ▲                                                     ◄── Shift Schedule Assignment (repeat pattern → auto-creates assignments)
      │ fallback: employee's Default Shift                  ◄── Roster screen / bulk tool
      │
 Employee Checkin (raw punch: time, IN/OUT, device, GPS) ── from mobile app, web, or biometric device API
      │   each punch is tagged to the shift window it falls in (or "off-shift")
      ▼
 Auto-attendance job (hourly) ── groups punches per employee per shift ──► Attendance (one per employee per day[/shift])
      │                                                                       Present / Half Day / Absent
      │── no punches on a working day ──► Absent                             + working hours, late entry, early exit, overtime
      ▼
 Other ways to create Attendance: manual, bulk tool, Attendance Request (WFH / On Duty), approved Leave (On Leave)
      │
      ▼
 Overtime Slip (per pay period) ──► Additional Salary ──► Payroll
 Attendance ──► Payroll payment days (if payroll is attendance-based)
```

**Key idea:** punches (check-ins) are raw data; **Attendance** is the one daily verdict per employee. Everything downstream (payroll, reports, comp-off) reads Attendance, never raw punches.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| Shift Type | A named working pattern: start time, end time, and the rules for turning punches into attendance |
| Check-in window | Shift start − "early check-in allowance" to shift end + "late check-out allowance". Punches outside every window are "off-shift" |
| Shift Assignment | Employee works shift X from date A to date B (B may be open-ended) |
| Default shift | Shift stored on the employee record, used when no assignment covers the date |
| Checkin | One raw punch (time, optional IN/OUT, device, GPS) |
| Auto attendance | Background job that converts punches into Attendance |
| Last sync | Per shift: the moment up to which all punches are known to have arrived. Attendance is only computed for shifts that ended before it |
| Attendance Request | Employee asks for a day to be marked Work-From-Home or On-Duty (field work) |
| Shift Schedule | A repeating weekly pattern: shift X on chosen weekdays, every 1–4 weeks |
| Overtime Type | Rules for paying overtime: multipliers, rate, caps |

---

## 2. Features

### 2.1 Shift Type

**Purpose.** Defines a shift and how punches become attendance.
**Who.** HR Manager (full), HR User (create/edit), employees read.

**Settings catalogue**

| Setting | Meaning | Default |
|---|---|---|
| Start time / End time | Shift timing. End earlier than start = crosses midnight (night shift) | required |
| Holiday list | If set, overrides the employee's holiday list for this shift's auto-attendance | — |
| How to read IN/OUT | (a) alternate punches as IN, OUT, IN, OUT… or (b) trust the IN/OUT type on each punch | — |
| Working hours method | (a) first IN to last OUT, or (b) sum of every valid IN→OUT pair (excludes breaks) | — |
| Half-day threshold (hours) | Worked hours below this → Half Day (0 = off) | — |
| Absent threshold (hours) | Worked hours below this → Absent (0 = off) | — |
| Early check-in allowance (min) | Punches this long before start still count for this shift | 60 |
| Late check-out allowance (min) | Punches this long after end still count for this shift | 60 |
| Late entry marking + grace (min) | In-time after start + grace → flagged late | off |
| Early exit marking + grace (min) | Out-time before end − grace → flagged early exit | off |
| Auto attendance | Turn the punch → attendance engine on for this shift | off |
| Process attendance after (date) | Engine ignores anything before this date | today |
| Last sync of check-ins | See glossary; can be updated by the device integration or automatically | — |
| Auto-update last sync | Recommended for mobile check-ins or a single device | off |
| Mark auto attendance on holidays | If punches exist on a holiday, still create attendance | off |
| Absent buffer (days) | Wait this many days after a shift before marking missing days Absent (0 = same day) | 1 |
| Allow overtime + Overtime Type | Compute overtime from worked hours beyond shift length | off |
| Roster colour | Display only | Blue |

**Rules**

| ID | Rule |
|---|---|
| AT-ST-01 | Start and end time cannot be equal. |
| AT-ST-02 | Shift length + early allowance + late allowance must be under 24 hours (a shift window can't overlap itself). |
| AT-ST-03 | Start time can't be changed while punches of this shift are still waiting to be processed. |
| AT-ST-04 | Absent buffer of 0 days requires auto-update of last sync. |

> **Example — check-in window.** Shift 09:00–18:00, early allowance 60, late allowance 60 → punches between **08:00 and 19:00** belong to this shift.
> **Night shift.** Shift 22:00–06:00. A punch at 05:30 on Tuesday belongs to the shift that **started Monday**; attendance date = Monday.

**Source:** `hrms/hr/doctype/shift_type/`

---

### 2.2 Shift Assignment

**Purpose.** Tie an employee to a shift for a date range, optionally with a check-in location and an overtime type.
**Data.** Employee, Shift Type, Company, Start, End (optional = open-ended), Status (Active/Inactive), Shift Location, Overtime Type, source (shift request / schedule).
**Status flow.** Draft → Submitted (Active) → Inactive (expired or set) / Cancelled.

| ID | Rule |
|---|---|
| AT-SA-01 | Employee must be active. End ≥ Start if given. |
| AT-SA-02 | No two **active** assignments for the same employee whose dates overlap **and** whose timings overlap. |
| AT-SA-03 | Two non-overlapping-time shifts on the same dates (e.g. split shift 06–10 and 17–21) are allowed only if HR Settings "allow multiple shift assignments" is on (then a warning); otherwise blocked. |
| AT-SA-04 | Cannot cancel if punches or attendance already reference this shift within its dates. |
| AT-SA-05 | Daily job sets assignments whose end date is before yesterday to Inactive. |
| AT-SA-06 | Inactive assignments are ignored everywhere. |

**Resolving "which shift is this employee on at time T"**
1. Collect active assignments covering T's date, the day before and the day after (night shifts).
2. Keep only those whose check-in window contains T and that fall inside the assignment's dates (special handling so a night shift starting on the assignment's last day can end the next morning).
3. If two consecutive shifts' windows overlap, trim them so each punch belongs to exactly one shift (the later shift's window starts no earlier than the earlier shift's end).
4. If nothing matches, fall back to the employee's **default shift**.

**Source:** `hrms/hr/doctype/shift_assignment/`

---

### 2.3 Shift Request

**Purpose.** Employee asks to work a different shift for a period.
**Data.** Shift Type, Employee, Company, From, To (optional), Status (Draft/Approved/Rejected), Approver (required).

| ID | Rule |
|---|---|
| AT-SR-01 | Employee must be active; To ≥ From. |
| AT-SR-02 | No overlapping (dates and timings) non-cancelled request. |
| AT-SR-03 | Approver must be the employee's shift approver or a shift approver of their department. |
| AT-SR-04 | Cannot request your own default shift. |
| AT-SR-05 | Only users with submit rights can change status away from Draft. |
| AT-SR-06 | Only Approved or Rejected can be submitted. Approved → a Shift Assignment is created and submitted. Cancel → that assignment is cancelled. |

Notifications to approver on create; to employee on status change; mobile push.

**Source:** `hrms/hr/doctype/shift_request/`

---

### 2.4 Shift Schedules (repeating patterns) & Roster

**Shift Schedule** = shift X on selected weekdays, repeating every 1, 2, 3 or 4 weeks. Duplicate weekdays are removed.

**Shift Schedule Assignment** = schedule × employee (+ location, status), with "enabled" and "create shifts after" date.
- Generates normal Shift Assignments: consecutive selected weekdays become one assignment (e.g. Mon–Fri → one 5-day assignment per week).
- If no end is given it generates 90 days ahead; an **hourly job** keeps extending enabled schedules.
- Cannot move "create shifts after" backwards over already generated assignments.

**Roster screen** (separate web app): month grid of employees × days showing shifts (coloured), approved leave and holidays; filters by company, department, branch, designation, shift type, location. Actions:
- Create a repeating schedule for an employee (reuses an identical schedule if it already exists).
- **Break** a shift for one day (splits the assignment around that day).
- **Insert** a shift for a date range — merges with an identical adjacent assignment instead of creating a new one.
- **Swap** a day's shift between two employees (or move it to an employee with no shift that day).
- Delete a schedule assignment → cancels and deletes all generated assignments.

**Bulk tool** (Shift Assignment Tool): filter active employees (company, branch, department, designation, grade, employment type, advanced filters), then (a) assign a shift, (b) assign a schedule, or (c) approve/reject pending shift requests in bulk. Employees who already have a conflicting active shift are excluded. Large batches run in the background with progress.

**Source:** `hrms/hr/doctype/shift_schedule*/`, `shift_assignment_tool/`, `hrms/api/roster.py`, `roster/` (web app)

---

### 2.5 Employee Checkin (punches)

**Data.** Employee, time, log type (IN/OUT/blank), device/location ID, GPS (lat/long + map point), skip-auto-attendance flag, shift and its window (filled automatically), off-shift flag, linked attendance, overtime type.

**Sources of punches**
1. **Mobile app / web** — one button toggling IN/OUT based on the last punch; optional GPS with map preview (HR setting "allow check-in from mobile app").
2. **Biometric / external device** — an API that accepts: employee identifier (device ID on employee record, or employee ID), timestamp, device ID, optional IN/OUT, optional lat/long, optional skip flag. The integration is expected to push logs and update "last sync".
3. Manual entry by HR.

| ID | Rule |
|---|---|
| AT-CK-01 | Employee must be active. Time is stored to the second. |
| AT-CK-02 | No duplicate punch: same employee + same time + same log type. |
| AT-CK-03 | Time can't be changed once the punch is linked to an attendance (cancel attendance first). |
| AT-CK-04 | Each punch is tagged to the shift whose window contains it; if none → off-shift (ignored by auto-attendance). |
| AT-CK-05 | If the shift uses "trust IN/OUT type", a punch without a type is rejected (unless flagged skip). |
| AT-CK-06 | **Geofence** (HR setting "allow geolocation tracking"): lat/long are mandatory; if the employee's active shift assignment has a location with radius > 0, the punch must be within that radius (great-circle distance), else rejected. |
| AT-CK-07 | HR can re-run shift tagging on selected punches in bulk (after fixing assignments). |

> **Example — geofence.** Office at the location pin, radius 100 m. Employee punches 140 m away → rejected "must be within 100 m".

**Source:** `hrms/hr/doctype/employee_checkin/`, `frontend/src/components/CheckInPanel.vue`

---

### 2.6 Auto-attendance engine

Runs **hourly** for every shift with auto attendance on (and can be triggered manually; >1000 punches runs in background). Skips a shift if auto attendance is off, or "process after" / "last sync" isn't set.

**Step 1 — Present / Half Day / Absent from punches.** Take unprocessed, non-skipped, on-shift punches after "process after" whose shift window **ended before last sync**. Group by employee + shift occurrence. For each group:

1. Skip if the date is a holiday (unless "mark on holidays" is on).
2. If the date is a **half holiday**, both thresholds are halved.
3. Compute worked hours, first-in and last-out:
   - Alternate mode: first punch = in; last punch = out (needs ≥2 punches). Hours = first→last, **or** sum of pairs (1st→2nd, 3rd→4th, …).
   - Trust-type mode: first IN to last OUT, **or** sum of each IN followed by an OUT (unpaired punches ignored).
   - Hours rounded to 2 decimals.
4. Late entry = in-time after start + grace (if enabled). Early exit = out-time before end − grace (if enabled).
5. Status: hours < absent threshold → **Absent**; else hours < half-day threshold → **Half Day**; else **Present**.
6. Create and submit Attendance (or, if a half-day leave already created a "half day" record for that date, fill in the other half: Present or Absent). Link the punches to it.
7. If creation fails (e.g. duplicate, overlapping shift, leave), the punches are marked skipped with the reason as a comment.

> **Example.** Shift 09:00–18:00, half-day threshold 6 h, absent threshold 4 h, late grace 15.
> Punches 09:20 and 14:30 (alternate, first→last) → 5.17 h → **Half Day**, **late** (09:20 > 09:15).
> Punches 09:00, 13:00, 14:00, 18:00 → first→last = 9 h; sum of pairs = 4 + 4 = **8 h** (lunch excluded).

**Step 2 — Absent for missing days.** For each employee on this shift (assignment or default shift, not inactive): every **working day** (not a holiday) from max(process-after, joining date) up to the last completed shift before (last sync − absent buffer days), capped at relieving date, that has no attendance → **Absent** with comment "missing check-ins".

**Step 3 — Other half of half-day leave.** Where a half-day leave left the other half open and no punches came, the other half is set Absent.

**Last sync auto-update (hourly).** For shifts with auto-update on: once the latest shift window has fully ended, last sync = that window end + 1 minute.

**Source:** `hrms/hr/doctype/shift_type/`, `employee_checkin/`

---

### 2.7 Attendance (the daily record)

**Data.** Employee, date, status (Present / Absent / On Leave / Half Day / Work From Home), leave type + leave application (when on leave), shift, in/out time, working hours, late entry, early exit, other-half status (for half day), attendance request link, overtime type, standard hours, actual overtime.
**Status flow.** Draft → Submitted → Cancelled (amendable). Employees can only read.

| ID | Rule |
|---|---|
| AT-AT-01 | Status must be one of the five values. Employee must be active and not Inactive. |
| AT-AT-02 | Date cannot be before joining date. |
| AT-AT-03 | One attendance per employee per date — except different shifts on the same date whose timings don't overlap. A same-date record with no shift blocks all others. |
| AT-AT-04 | Two attendance records on the same date for shifts with overlapping timings → error. |
| AT-AT-05 | If approved leave covers the date, status is forced to On Leave (or Half Day on the leave's half-day date) and linked to the leave. |
| AT-AT-06 | Status On Leave / Half Day without any approved leave → kept, other half set Absent, alert shown. |
| AT-AT-07 | Leave type is cleared if status isn't On Leave / Half Day. |
| AT-AT-08 | Cancelling attendance unlinks its punches (so they can be re-processed). |
| AT-AT-09 | Half Day record has an "other half" status: Present or Absent. |

**Ways attendance is created:** auto engine (§2.6), approved leave (module 01), attendance request (§2.8), manual form, bulk tool (§2.9), bulk "mark unmarked days" for one employee (select status, optionally exclude holidays; >10 days runs in background; duplicates silently skipped).

**Calendar view** for employees: own attendance + holidays.

**Source:** `hrms/hr/doctype/attendance/`

---

### 2.8 Attendance Request (WFH / On Duty regularisation)

**Purpose.** Employee asks for days to be marked Present (On Duty, e.g. client visit) or Work From Home.
**Data.** Employee, company, from, to, half day + date, reason (Work From Home / On Duty), explanation, shift, include-holidays flag.
**Who.** Employee creates; HR submits.

| ID | Rule |
|---|---|
| AT-AR-01 | Active employee; To ≥ From; dates within joining/relieving (future dates allowed). |
| AT-AR-02 | Half-day date must be within range. |
| AT-AR-03 | If one shift is assigned for the whole range it is filled in automatically; if several, the user must choose. |
| AT-AR-04 | No overlapping non-cancelled request for the same employee (and same shift, if given). |
| AT-AR-05 | A preview lists per date: Skip (holiday / on leave / status unchanged) or Overwrite (attendance exists). If **every** date would be skipped → error. |

**On submit, per date:** skip holidays (unless include-holidays) and full-day leave dates; status = Half Day on the half-day date, else WFH or Present. Existing attendance → status overwritten with a comment (half day → other half Absent; or other half raised to Present if requesting half day). No attendance → created and submitted.
**On cancel:** attendance created/linked by the request is cancelled.

Note: there is **no "missed punch" correction** with actual in/out times — only a status change.

**Source:** `hrms/hr/doctype/attendance_request/`

---

### 2.9 Employee Attendance Tool (bulk daily marking)

For a date and filters (department, branch, company, employment type, designation, grade, optionally shift): lists **marked**, **half-day (other half open)** and **unmarked** active employees who had joined by that date. HR selects employees and marks Present / Absent / Half Day / WFH, with late-entry / early-exit flags and shift; can also set the other half for half-day-leave employees.

**Source:** `hrms/hr/doctype/employee_attendance_tool/`

---

### 2.10 Overtime

**Overtime Type**

| Setting | Meaning |
|---|---|
| Overtime salary component | Where OT pay is booked (required) |
| Calculation | **Fixed hourly rate**, or **salary-component based**: (sum of chosen components in the month's salary) ÷ payment days ÷ standard daily hours |
| Standard multiplier | e.g. 1.5 (required) |
| Weekend multiplier | Used on weekly offs, if enabled |
| Public holiday multiplier | Used on holidays (not weekly offs), if enabled |
| Max OT hours per day | Cap |

**Where overtime comes from.** Shift Type "allow overtime" + overtime type (the shift assignment can override the type). When auto-attendance marks **Present**: standard hours = shift end − start (no break deduction); if worked hours > standard → actual overtime = difference, stored on the attendance.

**Overtime Slip** (per employee per pay period; dates default to the salary structure's payroll frequency):
- "Get details" pulls Present attendance with overtime in the period; each row = date, type, duration capped at the type's max, standard hours.
- Manual rows allowed (capped at max). A date can't repeat. No overlapping slips for an employee.
- **On submit:** amount per row = hours × hourly rate × multiplier (weekend / holiday / standard); summed per salary component → one **Additional Salary** each, payroll date = slip end date.
- Payroll Entry can bulk-create slips for eligible employees (Present attendance with overtime, no existing slip) and bulk-submit them (Payroll Settings switch).

> **Example.** Shift 09:00–18:00 → standard 9 h. Worked 11 h → OT 2 h; type max 1.5 h → **1.5 h**. Salary-component based on Basic ₹30,000, payment days 30, standard 9 h → ₹1,000/day ÷ 9 = **₹111.11/h**. Normal day ×1.5 → 1.5 × 111.11 × 1.5 = **₹250**. On a public holiday with multiplier 2 → **₹333.33**.

**Who.** HR User, Leave Approver (!) and System Manager create/submit slips; employees can create drafts.

**Source:** `hrms/hr/doctype/overtime_type/`, `overtime_slip/`, `overtime_details/`

---

### 2.11 Integration — Payroll

- **Payroll based on Attendance** (Payroll Settings): payment days reduced by Absent days, LWP/PPL leave (see module 01 §2.19), half-day absent halves (× half-day fraction), and — if "consider unmarked attendance as Absent" — days with no attendance at all.
- Absent on a holiday is ignored unless "consider marked attendance on holidays" is on.
- Overtime reaches payroll through Additional Salary (§2.10).
- **Timesheet-based salary** (salary structure option): pay = hours in submitted timesheets × hourly rate; details in module 03.

---

### 2.12 Scheduled jobs

| Job | Frequency |
|---|---|
| Update last sync for auto-update shifts | Hourly (long) |
| Auto attendance for all shifts | Hourly (long) |
| Extend shift schedules into assignments | Hourly (long) |
| Mark expired shift assignments Inactive | Daily |

---

### 2.13 Reports & views

| Report | Shows |
|---|---|
| Monthly Attendance Sheet | Employee × day grid with status codes (P, A, L, HD, WFH, H…), totals: present, leaves (per type), absent, holidays, unmarked, late entries, early exits; filter by month or date range; group by department/branch/etc.; summarized view |
| Shift Attendance | Per attendance with punches: shift, start/end, in/out, hours, late-by and early-by minutes (with or without grace), summary counts and chart |
| Employee Hours Utilization (timesheets) | Total vs billed vs non-billed vs untracked hours; utilisation % |
| Dashboards | Attendance count chart, shift assignment breakdown, timesheet hours by department |
| Mobile PWA | Check-in panel, check-in list, attendance calendar, attendance requests, shift requests, shift assignments (with approvals for approvers) |

---

### 2.14 Settings reference

**HR Settings:** allow multiple shift assignments for the same date (off); allow check-in from mobile app (on); allow geolocation tracking (off).
**Payroll Settings:** working days based on (Leave / Attendance); treat unmarked days as Present/Absent; consider marked attendance on holidays; create overtime slips during payroll; max working hours against timesheet.

---

### 2.15 Permissions (default roles)

| Object | Employee | HR User | HR Manager |
|---|---|---|---|
| Attendance | read | full | full |
| Checkin | create, edit, delete own | full | full |
| Attendance Request | create, edit, delete draft | full | full |
| Shift Type | read | create/edit | full |
| Shift Assignment | read | create, submit | full |
| Shift Request | create, edit | create, submit | full |
| Shift Location | read | full | full |
| Shift Schedule / Schedule Assignment | read | create/edit | full |
| Overtime Type | — | — | full |
| Overtime Slip | create draft | full | — (Leave Approver has full) |
| Bulk tools | — | HR User (shift tool) | HR Manager (attendance tool) |

---

## 3. Suspected defects — verify on the running instance

| # | Area | Suspicion | How to test |
|---|---|---|---|
| A1 | Shift assignment cancel | The "punches/attendance exist" guard filters by start…end date; for an **open-ended** assignment (no end date) the check may match nothing, letting HR cancel a shift that already has attendance. | Open-ended assignment, create attendance via punches, try to cancel. |
| A2 | Overtime | Standard hours = raw shift length (09–18 = 9 h), with no break deduction. With the "sum of pairs" hour method, lunch is excluded from worked hours but still included in standard hours, so OT is under-counted by the break length. Example: punches 09:00 / 13:00 / 14:00 / 19:00 → worked 4 + 5 = 9 h → **0 h OT**, although the employee stayed 1 h late. With "first-in to last-out" the same day gives 10 h → 1 h OT. | Same shift and punches under both hour methods; compare OT on the attendance. |
| A3 | Overtime permissions | Leave Approver role has full rights on Overtime Slip while HR Manager has none by default — likely unintended. | Check role permissions on a fresh site. |
| A4 | Geofence | Only the **first** active assignment with a location is checked; punches with no matched shift skip the geofence entirely. | Employee with no shift assignment + geolocation on → punch from anywhere. |

---

## 4. Gap analysis vs YukthiX spec §1.3.4

Our spec lists: *clock-in/out, shifts, rosters · timesheets billed to clients · overtime and regularisation · attendance device and biometric integration*.

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Clock-in/out (mobile, web) | ✅ | ✅ | |
| Geofence per location | ✅ (one radius per location) | ❌ not explicit | Add. Multiple allowed locations per employee. |
| Selfie / face match at check-in | ❌ | ❌ | Common in India field-force apps; our Proctoring face tech can be reused. 💡 |
| IP / Wi-Fi restriction for web check-in | ❌ | ❌ | Add (office-only punching). |
| Offline check-in (sync later) | ❌ | ❌ | Needed for field staff / low network. |
| Shifts incl. night shifts | ✅ | ✅ | |
| Split shifts / multiple shifts per day | ✅ (setting) | ❌ | |
| Rosters with repeat patterns | ⚠️ weekly patterns only | ✅ | **Better:** rotating patterns (e.g. 4 on / 2 off, 3-shift rotation over N days). |
| Roster drag / swap / break | ✅ | ✅ | |
| Weekly off per shift / roster | ⚠️ shift-level holiday list override | ⏳ deferred from Leave Q2 | Decide in this module. |
| Break rules (unpaid break deduction, fixed break) | ⚠️ only via pair-sum method | ❌ | Add. |
| Flexi-time / core hours | ❌ | ❌ | Add for IT/service companies. |
| Late-coming penalties (e.g. 3 lates = ½ day LOP) and grace count per month | ❌ (flag only) | ❌ | Very common in India — add. |
| Minimum rest between shifts | ❌ | ❌ | Add as validation. |
| Regularisation — missed-punch correction with actual times | ❌ (status-only request) | ✅ "regularisation" | Must build. |
| WFH / On-duty requests | ✅ | ❌ not explicit | Add, with monthly WFH limits. |
| Overtime calculation & multipliers | ✅ | ✅ | |
| Overtime **pre-approval** workflow | ❌ | ❌ | Add. |
| Statutory OT limits (Factories Act: max hours/quarter, double rate) | ❌ | ❌ | India pack. |
| Shift / night allowance | ❌ | ❌ | Add — feeds payroll. |
| Auto comp-off from holiday attendance | ❌ (manual request) | ❌ | Add — ties to Leave comp-off. |
| Biometric device integration | ⚠️ push API only, no device connectors | ✅ | Build connectors (ZKTeco, eSSL, Matrix, Realtime) or a sync agent. |
| Timesheets → client billing | ⚠️ lives in ERPNext Projects | ✅ §1.2.3 | Build in YukthiX; link to External ATS. |
| Attendance lock after payroll | ❌ (only LWP leave checked) | ❌ | Add — freeze a period once payroll runs. |
| Muster roll / statutory registers (e.g. Factories Act Form 25) | ❌ | ❌ | India pack. |
| Monthly attendance sheet, late/early reports | ✅ | ✅ (§1.4.7) | |

---

## 5. YukthiX design questions

1. **Weekly offs** (deferred from Leave Q2): from location, from shift, from roster, or employee-specific?
2. **Rotating rosters:** which patterns must we support at launch (weekly only / N-day cycles / 3-shift rotation)?
3. **Break handling:** fixed unpaid break deducted, actual punch-based break, or both per shift?
4. **Late-coming policy:** grace count per month and conversion to half-day / leave deduction — configurable how?
5. **Regularisation:** what can employees correct (missed in, missed out, wrong time) and how many per month?
6. **Check-in controls:** geofence, selfie, IP restriction, offline — which at launch?
7. **Overtime:** pre-approval required? statutory caps enforced?
8. **Biometric devices:** which brands matter to our first customers — direct connectors or a small on-prem sync agent?

---

## 6. Source pointers (for verification only)

| Area | Path in `hrms-develop` |
|---|---|
| Attendance | `hrms/hr/doctype/attendance/` |
| Punches & hour calculation | `hrms/hr/doctype/employee_checkin/` |
| Shift rules & auto engine | `hrms/hr/doctype/shift_type/` |
| Shift assignment & shift resolution | `hrms/hr/doctype/shift_assignment/` |
| Shift requests | `hrms/hr/doctype/shift_request/` |
| Schedules & roster | `hrms/hr/doctype/shift_schedule/`, `shift_schedule_assignment/`, `hrms/api/roster.py`, `roster/` |
| Locations / geofence | `hrms/hr/doctype/shift_location/`, `hrms/hr/utils.py` |
| Attendance requests | `hrms/hr/doctype/attendance_request/` |
| Bulk tools | `hrms/hr/doctype/employee_attendance_tool/`, `shift_assignment_tool/` |
| Overtime | `hrms/hr/doctype/overtime_type/`, `overtime_slip/`, `overtime_details/` |
| Jobs | `hrms/hooks.py` |
| Reports | `hrms/hr/report/monthly_attendance_sheet/`, `shift_attendance/`, `employee_hours_utilization_based_on_timesheet/` |
| Mobile | `frontend/src/components/CheckInPanel.vue`, `frontend/src/views/attendance/` |
