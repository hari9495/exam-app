# M02 · Leave & Attendance

> **Status:** ✅ Decided (7/7), 25 Sep 2026. The **6 Leave decisions (23 Sep)** and the attendance device question (P10 Q4) are already decided. **Extended 26 Sep 2026 (gap register, user decision):** field-force tracking (GAP B2, §B8, wave 5), auto-rostering, open shifts & shift bidding (GAP B3, §B9, designed now, built wave 6), desktop-agent / Teams-presence attendance and visitor management (GAP C1, §B10–§B11, wave 6); §11 B2 / B3 / C1. Projects & timesheets grow into [M12](M12-projects-timesheets.md) (GAP B1). **Market analysis additions (G7–G8, 26 Sep 2026):** geofence-aware check-in with logged failed attempts (YX-AT-23) and **offline check-in moved from wave 6 to wave 2** (YX-AT-24; Q6 amendment); §11 G7 / G8. **Correction C1 (validation pass 3), 28 Sep 2026:** women's night-shift work under the OSH Code (P07 `IN.OSH`, in force 21 Nov 2025) as a roster law guard with written consent, an establishment safeguards checklist and a register (YX-AT-25/26; YX-AT-19 amended); §11 C1. **Validation pass 3 Must J6, 28 Sep 2026:** statutory **injury leave** type fed by the M08 workplace accident / injury case, paid per company policy above the statutory floor (ESI benefit or employees' compensation) (YX-LV-15); §11 J6.
> **Covers:** spec §1.3.3 (Leave, incl. the 18 added features), §1.3.4 (Time & Attendance); Frappe reference [01](../reference/frappe-hrms-functional-spec/01-leave-management.md) (decisions §5, defects D1–D3) and [02](../reference/frappe-hrms-functional-spec/02-attendance-and-shifts.md) (open questions §5, defects A1–A4), UI references 01/02 (U1–U24); Phase 2 items (P0: geofence, WFH/on-duty limits, break rules, attendance lock, late penalties, auto comp-off; P1: Factories Act OT & registers, flexi-time, minimum rest, shift allowance, OT pre-approval, IP restriction, split shifts; P2: selfie/offline check-in).
> **Builds on:** P01 (locations: state, calendar, geofence), P02 (manager scopes), P03 (requests, delegation), P04 (nudges), P06 (dated shift/policy facts, segments), P07 (statutory leave & OT rules), P08 (locks, **attendance exceptions before payroll**), P09 (metrics), P10 (devices, face check-in).
> **Build wave:** 2 (with basic mobile), feeding payroll in wave 3.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## Part A · Leave

### A1. Decisions already made (Leave, 23 Sep 2026)

| # | Decision |
|---|---|
| L1 | Leave year configurable per company / legal entity (calendar, financial or custom start month); anniversary year deferred |
| L2 | Holiday calendar follows the employee's **work location**, optional per-employee override; weekly offs by shift/roster decided here (Q1) |
| L3 | **Sandwich rule per leave type:** None / Sandwich (holiday counted only between leave days) / Always; applies to weekly offs, holidays or both; half-day adjacency option |
| L4 | **Rounding per leave type:** none / 0.25 / 0.5 / 1, halfway rounds up; last accrual of the year trues up to the exact entitlement |
| L5 | **Encashment:** on exit (into F&F), at year end (drafted in the year-end wizard), on request (approval); rate = formula per type (selected components ÷ 26 / 30 / actual days); paid via payroll by default |
| L6 | **Negative balance per type** with maximum; future accruals repay first; on exit deducted in F&F at the encashment rate, or converted to LWP (option per type) |

### A2. Design
- **Leave types:** a sectioned editor with a live example (UI ref 01 §2.6):
  1. Basics: paid / unpaid / partially paid, colour.
  2. **Eligibility:** gender, marital status, employment type, probation, tenure, location.
  3. **Crediting:** upfront or accrual monthly/quarterly, **by days worked**, **reduced by LOP**; pro-rata for joiners; rounding (L4).
  4. **Counting:** holidays/weekly offs, **sandwich** (L3), half days (**first / second half**), **hourly / short leave**.
  5. **Rules:** minimum notice, max per request / month, **block dates**, **mandatory attachment after N days**, negative limit (L6), **optional holidays (choose N of M)**.
  6. **Year end:** carry-forward cap, expiry / lapse, encashment triggers and formula (L5).
  7. **Statutory templates** from P07 (e.g. maternity 26 weeks, state S&E carry-forward caps).
  8. **During long absence (E3, D17):** accrual **pauses or continues** per leave type while the employee is on sabbatical, long LWP or maternity — a company setting per type (starter template: pause on sabbatical / long LWP, continue on maternity); where the law fixes it (maternity counts as service) the statutory value is enforced. The absence is the dated employment status that drives the D10 expected status (§B3 step 1) (YX-LV-11).
  9. **During the notice period (E10, D17):** per type the company picks **allowed** / **converted to LOP** / **extends the last working day** / **blocked** (starter template: allowed). The apply sheet warns before submission; the effect (LWD change, notice shortfall days) is passed to the M01 exit case and F&F (YX-LV-12).
- **Maternity (Maternity Benefit Act, E2, E-Q2):** a statutory leave template driven by P07 **IN.LEAVE** (YX-LV-10):
  - eligibility: **80 days worked in the 12 months** before the expected delivery date;
  - **26 weeks** (at most **8 weeks before delivery**); **12 weeks** for an adopting / commissioning mother or from the **3rd child**; **6 weeks** after miscarriage / MTP; **2 weeks** after tubectomy — all values from P07, never typed in;
  - **ESIC-covered employees:** the leave is recorded here but the benefit is paid by ESIC, so M03 excludes employer maternity pay (M03 YX-PAY-26);
  - **company policy settings (D17):** crèche facility (legally required at 50+ employees — shown as a compliance check), post-maternity **WFH** option (by mutual agreement) and a company top-up (M03);
  - **legal guard:** a dismissal or discharge during maternity leave is blocked in M01 (exit case cannot start with an employer-initiated reason while the maternity leave is active).
- **Injury leave (J6):** a statutory leave template (P07 `IN.ESI` / `IN.EC`, YX-LV-15) used only from an M08 workplace accident / injury case (YX-CASE-14):
  - HR records the dates from the case (the injured person does not apply); extensions need a medical certificate (Special, YX-LV-09);
  - no balance, no accrual, no sandwich; the days count as service and never as LOP or absence;
  - **pay (company policy, D17, above the statutory floor):** ESI-covered — ESIC pays the disablement benefit, the company may add a top-up; not ESI-covered — at least the P07 employees' compensation for temporary disablement, starter full pay (M03 YX-PAY-50);
  - the manager sees the dates and "injury leave", never the diagnosis.
- **Policies:** bundles of leave types with entitlements, assigned **by rule** (entity / location / grade / type) with per-employee override; the assignment is a dated fact (P06).
- **Ledger (single source of balance):** every credit, debit, adjustment, expiry, encashment and carry-forward is an append-only ledger entry with a reason and link. Balances and projections are computed from it. **One balance figure everywhere** (fixes U2, UI principle 2). **Unpaid / LWP types carry no balance:** the balance card, reports and mobile show "taken this year", never a negative closing balance (YX-LV-14; fixes U7).
- **Accrual engine:** a scheduled job posts accruals per policy (P06 segments for mid-period policy changes), applies rounding and the year-end true-up (L4); "days worked" and "LOP-reduced" accruals read attendance after the P08 lock.
- **Apply:** request sheet (UI brief T4):
  - range picker with half per end;
  - live summary: days counted, sandwich effect, holidays excluded, balance after, policy warnings (notice, max, block dates, attachment);
  - **delegate approver while away** (P03 Q3).

  Approval card with **team availability** ("2 others off").
- **Mandatory attachments (D9):** a required attachment such as a medical certificate is stored as a P05 document of type **"Medical certificate"** (Special class) and verified by HR. The manager's approval card shows only its status — "certificate attached · verified" or "· pending" — never the file (YX-LV-09).
- **Cancel / withdraw:** employee-initiated with approval; after payroll lock → late correction (P08 Q4) → LOP reversal next month.
- **Comp-off:**
  - **auto-credit** from approved work on a holiday or weekly off (attendance), or a claim;
  - **expiry window** (use within N days);
  - optional manager approval.
- **Holiday calendars** per location with state festival templates, optional holidays (N of M), and clone to next year.
  - **Public holiday on a weekly off (E19, D17):** company choice per calendar — **substitute day** / **comp-off credit** / **none** (starter template: none) (YX-AT-11).
  - **Transfer (E19):** the calendar switches on the transfer date (P06 dated location); the optional-holiday count is **prorated or reset** per company setting (YX-LV-13).
- **Leave-year change mid-way (E19):** changing L1 creates a **short year** with pro-rata entitlements and a **carry-forward transition wizard** (preview → approve → ledger entries), like the year-end wizard (YX-LV-13).
- **Year-end wizard:** preview per employee (carry forward, lapse, encash) → approve → post ledger entries + draft encashments → letters/notifications.
- **Adjustments:** HR "adjust balance" with a required reason (also used for migration opening balances).
- **Projection:** "What will my balance be on 1 Dec?" (future accruals and scheduled leave).

---

## Part B · Attendance & time

### B1. Punches
- **Sources:**
  - mobile GPS check-in with **multiple allowed locations** and geofence;
  - web check-in with **IP / Wi-Fi restriction**;
  - biometric devices (P10 Q4: cloud push, sync agent, CSV);
  - **shared kiosk** check-in at launch (registered site tablet; employee code + PIN or ID-card QR; kiosk punches carry kiosk id + location; M04 Q4);
  - **offline** check-in in **wave 2** (moved from wave 6, G8, 26 Sep 2026: punches queue on the device with device time + GPS and sync later, flagged offline; YX-AT-24);
  - selfie / face check-in in wave 6 (P10 Q3);
  - **field-force** check-in at client sites with a duty-hours location trail (§B8, GAP B2);
  - **desktop agent / Microsoft Teams presence** for WFH days (§B10, GAP C1, company option with consent).

  The rules per location / employee group are set in Q6.
- A punch stores source, time (device time + server time), location + distance verdict, and device id. Duplicates are ignored (P10 YX-INT-02).
- The check-in card shows the shift, time to start, location status and offline queue (UI ref 02 §1.12). Before submit it shows the GPS pin, accuracy radius and the geofence, with "retry location" and a plain reason when outside; failed attempts are logged (G7, YX-AT-23, M04 YX-MOB-18).

### B2. Shifts, rosters & weekly offs
- **Shift:** start/end (night shift across midnight), **break rule** (Q3), **flexi / core hours** option, **split shift** option, check-in window, grace for late / early, thresholds (full / half / absent by hours), OT policy (Q7), shift/night allowance (feeds payroll).
- **Shift patterns** (Q2): weekly repeat, **N-day rotating cycles** (e.g. 4 on / 2 off, 3-shift rotation), assigned to people or groups from a start date (dated fact, P06).
- **Roster:** the main shift screen (UI ref 02 §1.8): drag to assign, copy week, swap (with the colleague's consent via P03), conflict badges (overlap, **minimum rest** between shifts, on leave), publish + notify.
- **Women on night shifts (OSH Code, law guard, C1):** a woman may be rostered in the **legal night window** only with her **written consent** and the establishment's **safeguards** in place, under the conditions set by the appropriate government (P07 `IN.OSH`, dated per state; the Factories Act s.66 and state S&E exemption conditions continue as transitional values where a state has not notified OSH rules):
  - **Night window:** the legal window comes from P07 for the location's state (dated; e.g. 7 pm – 6 am). The company's own definition of which shifts count as "night" (D17; also used for night allowance and fairness) may be **wider but never narrower** than the legal window (P19 YX-RULE-03).
  - **Consent:** written consent per woman employee (P05 e-sign / OTP acknowledgement) naming the establishment and the shifts it covers; refusing or withdrawing it is never a ground for any adverse action; a withdrawal applies from the next roster publication (or sooner per the company).
  - **Safeguards checklist per establishment:** the items the appropriate government requires (P07 list, e.g. transport pick-up and drop, a minimum number of women per shift, security and lighting, rest rooms, a working POSH IC (M08), the register below), each attested by the location admin with evidence and a review date; the checklist is **valid** only while every required item is attested and none has lapsed.
  - **Guard:** manual roster edits, pattern assignment, swaps, open-shift claims, bids and the auto-roster generator (§B9) all refuse to place a woman on a shift overlapping the legal window unless her consent is valid for that date and the establishment's checklist is valid; the reason is shown ("No night-work consent on file", "Safeguards checklist lapsed: transport"). It is a law guard (P19 YX-RULE-03 style): the company can't switch it off and there is no override (YX-AT-25).
  - **Register:** a **register of women night-shift workers** per establishment (§B5, YX-AT-26).
- **Weekly offs** (Q1): resolved per employee per date from the precedence rule; weekly offs are **rules, not stored rows** (fixes U8/U19).
- **Demand-based auto-rostering, open shifts and shift bidding** sit on top of this roster: §B9 (GAP B3, wave 6).

### B3. Day evaluation engine
**Attendance modes (D1).** Each company sets an attendance mode per group — entity / location / department / employment type (a scoped P01 setting, dated per P06) — and the engine behaves per mode:

| Mode | Day status comes from | Exceptions (P08) | Payroll |
|---|---|---|---|
| **Punch** (default) | Punches + requests, steps 1–6 below | Missing / incomplete punches raise exceptions (P08 YX-LOCK-07) | Company switch: exceptions **block** approval (default) or are **warnings only** |
| **Assumed present** | Every expected working day is present unless covered by approved leave; no punches needed | None — no missing-punch exceptions, nudges or late penalties | Never blocked by attendance; HR enters LOP manually (M03 §6) |
| **Timesheet** | Approved timesheet hours (§B7) | A working day without an approved timesheet is the exception | Approved hours drive pay (§B6, M03 rate-based pay) |

Punches, if any, are still recorded in the Assumed-present and Timesheet modes but don't set the day status. The mode and the block / warn switch are shown on the muster and on the payroll readiness screen.

For each employee and date (from roster + punches + approved requests + leave + holidays):
1. **Expected:** working day / weekly off / holiday / leave (full or half) / WFH / on-duty. **Employment status comes first (D10):** suspended (M08), long leave (maternity / sabbatical / LWP), absconding in process, pre-boarding (before the joining date) and exited (after the last working day) set the expected status for those dates (suspended / on long leave / absconding / not joined / exited); these days raise **no exceptions, no late penalties and no nudges**, and their pay effect comes from the status (e.g. subsistence allowance, M03 YX-PAY-23; LWP as LOP).
2. **Worked time:** first-in → last-out, or paired punches, minus the break rule (Q3); night shifts are attributed to the shift start date.
3. **Late / early:** minutes beyond grace; **late penalty** counting (Q4).
4. **Status:** present / half day / absent / on leave / WFH / on duty / holiday / weekly off by thresholds; **a missing punch is shown as "missing check-out", not "below threshold"** (fixes U13).
5. **Overtime:** after the minimum threshold, rounded, capped; pending approval per Q7; **no OT from a few minutes past shift end** (fixes U14).
6. **Exceptions:** incomplete / unaccounted days → P08 exception list with nudges; **payroll is blocked until resolved** (P08 Q4) — in Punch mode with the block switch on; with the switch on "warn" they are listed on the readiness screen but don't block. Assumed-present groups have none; Timesheet groups raise "no approved timesheet" instead.

Re-evaluation happens automatically when inputs change (a late punch sync, an approved regularisation), until the period is frozen (P08).

**Time edge cases (E19):**
- **Half-day leave + late / OT:** the grace window starts from the start of the working half; no late penalty for the leave half; the OT threshold is measured against the half-day's expected hours (YX-AT-12).
- **Night shift over the lock boundary:** a punch belonging to a shift that **started before** the lock attaches to that shift's day without a late request (YX-AT-13).
- **Biometric batch arriving after the freeze:** HR runs one audited bulk **"device backfill" correction** (P08) for the batch — not one late request per employee (YX-AT-13).
- **Two shifts in one day:** supported; each shift is evaluated separately and the day status combines them (YX-AT-13).

### B4. Requests
Through P03, one request sheet with types:
- **Regularise** (missed in, missed out, wrong time, full day) with limits (Q5);
- **WFH** and **on-duty** (with location) with monthly limits;
- **shift change / swap**;
- **OT pre-approval** (Q7).

Each shows its effect before submitting ("22 Sep: Missing check-out → Present 9:05–18:10").

### B5. Muster, locks & registers
- **Muster grid** (UI ref 02 §1.9): colour + markers (late, early, OT, regularised), row totals (payable days, LOP, late count, OT hours), cell → day card; bulk HR actions with reason.
- **Default scope (fixes U16):** the Today board, muster, team calendar and attendance calendar open in the viewer's widest P02 scope — manager: team; HR: entity — never self-only; the personal view is the employee's mobile Time tab (YX-AT-14; APX-D TIM-01, -02, -20).
- **Day card punch map (fixes U17):** each punch shows its source, a map pin, the distance to the nearest allowed location and the verdict (inside / outside / field-recorded) to viewers in scope (YX-AT-15; APX-D TIM-03).
- **Cut-off freeze and lock** (P08 Q2), statutory muster/registers from P07 (Factories Act Form 25 etc., wave-appropriate), exports.
- **Register of women night-shift workers (C1):** per establishment and period, generated from the published roster and punches (who, date, shift, hours in the legal window, consent reference, transport record) in the dated P07 `IN.REGISTERS` / `IN.OSH` format, frozen with the period lock (YX-AT-26).

### B6. Payroll feed (to M03)
Per payroll period after the lock:
- payable days, LOP days (incl. late penalties per Q4), half days;
- approved OT hours by rate category (normal / weekly off / holiday);
- shift/night allowance days;
- comp-off credits;
- leave encashment drafts;
- **timesheet hours feed (D4):** approved timesheet hours per employee per placement (M10) or project, by rate category (normal / OT / holiday), for Timesheet-mode groups and rate-based pay (M03 YX-PAY-24).

All figures come with P06 segments for mid-period changes. Assumed-present groups send payable days = expected working days − approved LWP; HR's manual LOP is entered in M03 (§6).

### B7. Timesheets (spec §1.3.4, basic)
Project / client time entries per day or week, billable flag.
- **Entry screens (D4):**
  - desk: a **weekly grid** (rows = project / placement × task, columns = days, hours per cell, billable flag, row and day totals, copy last week, submit week);
  - mobile: a **Time tab** with a day list (add entry, hours, project) and "submit week".
- **Approver resolver (D4):** **internal projects** → the project manager (P03 subject-field resolver); **deployed contractors** (M10 placements) → the client contact in the client portal (M10 Q8); if the placement has no active client contact → the **account manager** as fallback. Approved hours are invoiced via M10 Q7 and feed payroll (§B6).
- **Projects, tasks, utilisation, project costing and client billing for services firms** are designed in [M12 · Projects & timesheets](M12-projects-timesheets.md) (GAP B1). M12 owns the project master and extends this timesheet model; the entry screens, approver resolver and payroll feed above stay as decided.

### B8. Field-force tracking (GAP B2, wave 5)
For sales, service, collection and merchandising staff who work away from an office. **Company switch per group** (entity / location / department / designation / employment type; scoped P01 setting, dated per P06); starter template **off**.
- **Consent first.** When the switch is on for an employee's group, the app asks once for **location-tracking consent** with a plain-language notice (what is collected, when, who sees it, how long it is kept, P02 §6). Consent is recorded (P05 acknowledgement), can be **withdrawn** in Me › Privacy, and withdrawal stops the trail (the employee then checks in per the group's Q6 mode; field attendance without a trail is still allowed). Consent is required by law (D17 exception), so the company cannot switch it off.
- **Live location trail — duty hours only.** Location points (default every 5 min while moving, company sets 2–15 min; battery-saving when still) are recorded **only between check-in and check-out** on a duty day, and never outside the shift window + grace. **Never off-duty:** no points on leave, weekly offs, holidays or after check-out, unless an approved on-duty request covers that day. The app shows a persistent **"Tracking on"** indicator whenever points are being collected (M04 YX-MOB-13). Trails are **Confidential** (P02): the employee sees their own; the manager and HR in scope see the team map and trail for duty time only; retention is company-set (starter 90 days), then points are deleted and only daily distance and visit records are kept.
- **Beat plans & visits.** A **beat plan** is a list of planned visits (customer / site, address + geofence radius, planned date / time window, purpose) assigned by the manager or imported (CSV / API), one-off or repeating (e.g. every Tuesday). A **visit** is logged on the phone: check-in at the site (geofence verdict against the customer's pin), **photo** (camera only, time- and location-stamped), notes, outcome (company-defined list, e.g. order taken / follow-up / closed), optional custom form (P01 custom fields), check-out. Unplanned visits are allowed and marked "unplanned". The manager sees **planned vs done**, missed visits and time on site.
- **Client-site attendance.** A day with a first visit check-in counts as **present (field)**; the day engine (§B3) takes worked time from the first site check-in to the last site check-out (or the duty check-in / check-out, whichever the group sets). A **deputed / client-site employee** (M01 E8 host location) checks in against the client site's geofence. The day card shows each visit as a field punch with verdict "field-recorded" (YX-AT-15).
- **Distance-based conveyance → M05.** Each duty day produces a **distance**: sum of trail segments (straight-line with a company correction factor, starter ×1.2) or, where the company enables it, **road distance** from a maps provider (third-party per-use cost → add-on, D18). The daily distance, vehicle type and visit list become a **draft mileage line** in M05 (YX-EXP-16) that the employee confirms; rates, limits and approval stay in M05. Nothing is paid automatically.
- **Integrity.** Mock-location / developer-mode detection, impossible speed between points and large gaps are flagged on the day card and to the manager (never auto-penalised); the employee can add a note.
- **Where it runs.** Background location needs the store app (M04 Q1, Capacitor); the PWA records points only while open and says so.

### B9. Auto-rostering, open shifts & shift bidding (GAP B3, designed now, built wave 6)
For retail, hospitality, healthcare, BPO and factories where staffing follows demand. Builds on shifts, patterns and the roster (§B2); company rules via a labelled **starter template** (D17).
- **Demand (staffing requirement).** Per location (optionally department / work area) × shift (or time slot) × day: **required headcount per skill / role** (e.g. "Chennai store · Evening · Sat: 4 cashiers, 1 supervisor"). Entered as a weekly template with date overrides (festival, sale), imported (CSV / API from POS, footfall or call-volume forecasts), or copied from a past period. **Skills** come from the employee's P01 designation plus M06 competencies / M07 certifications (with expiry).
- **Auto-roster generator.** For a location and period (week / fortnight / month) it fills the demand with a draft roster:
  - **hard constraints (never broken):** required skill / certification valid on the date; employee availability (declared unavailability, preferred-off days if the company makes them hard); approved and pending leave, holidays and weekly-off rules (Q1); **minimum rest** between shifts (company value, never below P07 where the law sets one); **maximum hours and OT caps** per day / week / quarter (P07 statutory caps + company caps); one shift at a time; **women's night-shift consent and safeguards** (YX-AT-25); employment status (D10).
  - **soft goals (weighted, company-set):** **fairness** (nights, weekends and holidays spread evenly over a rolling window), employee preferences, continuity (same team / shift pattern), cost (fewer OT hours, fewer premium-rate shifts), contracted hours met.
  - **output:** a draft roster with a **coverage view** (demand vs filled per slot), every **unfilled or over-staffed slot explained** ("no cashier available without breaking the 11-h rest rule"), per-employee hours and fairness score. The manager edits (drag and drop, §B2) and **approves** it; only an approved roster is **published** (notify, YX-AT-07). Re-running keeps manually locked cells.
- **Open shifts.** Any unfilled slot (from the generator, a sick call or a swap) can be published as an **open shift** to **eligible** employees only (right skill, location or pool, no conflict, within rest and hour caps). Employees **claim** it on mobile; the company rule decides **first-come (auto-assign after checks)** or **manager picks from claimants** (starter: manager picks); claims are re-checked on approval. Open shifts can be offered to a cross-location **pool** the company defines.
- **Shift bidding.** For a future roster period the manager opens a **bid window**: employees rank preferred shifts / patterns (and days they want off). At close, the generator treats bids as preferences and the company's **award rule** breaks ties: seniority / rotation / fairness score / first bid (starter: fairness score, then seniority). Awards go to the manager for approval with the roster.
- **Approvals & audit.** Roster approval, open-shift awards and bid awards run through P03 (the manager, optional HR / location head step). Every generator run stores its inputs, rule version and score so a published roster can be explained later.
- **Compute is included** (D18): the generator is an in-product solver, not an AI-credit feature; an optional "explain this roster" summary in plain language uses AI credits (P10).

### B10. Desktop-agent & Teams-presence attendance (GAP C1, wave 6)
A way for WFH and hybrid staff to mark attendance without a manual check-in. **Company option per group** (starter **off**), and each employee gives **consent** (recorded, withdrawable) before any signal is read.
- **Sources:**
  - **Microsoft Teams presence** via Microsoft Graph (tenant admin consent): available / busy / in a meeting vs away / offline, with timestamps;
  - **desktop agent** (small Windows / macOS app signed by YukthiX, installed by the employee or pushed by the company's device management): active vs idle (no input for N minutes, company-set, starter 10), machine lock / unlock, agent start / stop.
- **What it produces:** a **first-active** and **last-active** time per WFH day, recorded as punches with source "teams" / "desktop" (YX-AT-01), plus total active time on the day card. The day engine (§B3) treats them as punches for WFH / hybrid days only (a group can instead use them as **evidence only**, shown on the day card, with the employee still checking in).
- **Never content.** Only **activity signals** (active / idle / presence state and times) are collected. **No keystroke content or counts, screenshots, screen recording, webcam, microphone, application names, window titles, URLs or files**, ever; the agent's code is limited to these signals and the limitation is stated in the consent notice. The employee sees exactly what was recorded for each day in the Time tab.
- **Not surveillance.** No productivity scores and no per-minute timelines for managers: managers see the derived day status and total active hours only. Absence of signal never marks a person absent without the normal exception flow (regularise, P08).
- **Cost:** Graph access and the agent are included (D18).

### B11. Visitor management (GAP C1, location operations, wave 6)
Front-desk operations per **location** (P01), included in the price (D18); SMS / WhatsApp message costs are the usual add-ons.
- **Pre-registration:** an employee (**host**) registers an expected visitor (name, mobile, company, purpose, date / time window, location; optional ID type and vehicle no.); the visitor gets an invite (email / WhatsApp / SMS) with a **QR pass** and location directions.
- **Walk-ins:** the reception (a **reception** role) or a **visitor kiosk** (the M04 Q4 kiosk in visitor mode) captures the visitor's details and photo; the host gets an **approval card** on mobile (approve / reject / "send someone") — P03, with a company timeout (starter 10 min → reception decides).
- **Check-in / out:** scanning the QR (or reception entry) records **check-in**, prints or shows a **badge** (name, host, photo, date, QR; APX-F badge layout via P05) and notifies the host; **check-out** at exit (QR scan or reception); passes expire at the end of the window.
- **Location rules (company, starter template):** NDA / safety induction e-acknowledgement before entry (P05), ID capture required yes / no, photo required, allowed hours, blocked-visitor list (HR / admin only), escort required.
- **Visitor log & safety:** a per-location **visitor log** (who, host, in / out times) exportable for audits; a live **"on site now"** list for emergencies alongside employees checked in (§B5 Today board).
- **Privacy:** visitors are not users; their data is **Confidential**, collected with a notice at registration, kept for the company's retention period (starter 90 days; ID images 30 days) and then deleted (P02 retention schedule).

### B12. Industrial action, standby, licences, block leave & hybrid office days (Validation pass 3 Should)
- **Strike / lockout / lay-off (J4, wave 4):** HR records an **industrial-action event** per establishment (type, from / to, affected group or list, legality legal / illegal / undetermined, notice reference per IR Code, verify). Affected days get the status **Strike**, **Lockout** or **Lay-off** (never plain Absent or LOP); M03 reads the status: lay-off compensation per P07 `IN.IR` (currently 50 % of basic + DA, verify), strike and lockout pay per legality and company policy (D17) above the legal floor. Leave and weekly offs inside the event are handled per P07. The days show on the employee timeline (M01 YX-EMP-15). YX-AT-27.
- **On-call / standby (V7, wave 5):** a roster slot type **Standby / On-call** (not a working shift) with a standby allowance per slot; a **call-out** is logged (start / end, source) and paid at least the company's **call-out minimum** (D17, starter 2 hours); call-out hours count towards daily / weekly hours, OT and minimum-rest checks. YX-AT-28.
- **Mandatory block leave (V12, wave 6, BFSI pack):** for designated roles, a yearly **block leave** of N consecutive days (company policy, starter 10 working days; regulator guidance for sensitive posts, verify); planning nudges and a compliance view; while on block leave the person's **system access is suspended** through P12 (and a P11 webhook for core systems), restored on return; any access during it needs a compliance-officer exception (logged). YX-LV-16.
- **Licences gating work (V13, wave 6):** a role / skill / shift can require licences (driving licence with class, nursing registration, FSSAI food-handler, etc.; D17), held as dated P05 documents with expiry. Roster, open-shift claims, bids, trip or assignment for a date where a required licence is missing or expired are blocked with the reason; expiry reminders at 60 / 30 / 7 days. YX-AT-29.
- **Hybrid office attendance (T7, wave 5):** a company policy (D17) of **N office days a week** per group (starter off); an office day is evidenced by a punch inside an office geofence, kiosk or badge (P10); a weekly **compliance view** per person and team (office days vs required, pro-rated for leave, holidays and travel); **team office-day planning** (planned days, anchor days, who's in). Not linked to pay or ratings by default. Desk / room booking later. YX-AT-30.

---

## Data model (main tables)

| Area | Tables |
|---|---|
| Leave | `leave_types` (sections as validated JSON + version), `leave_policies`, `leave_policy_rules`, `employee_leave_policy` (dated), `leave_ledger` (append-only), `leave_requests` + `leave_request_days` (per-day breakdown: counted, sandwich, holiday, half), `holiday_calendars` + `holidays` + `optional_holiday_choices`, `comp_off_credits` (expiry), `encashments`, `year_end_runs` |
| Attendance | `shifts`, `shift_patterns` (cycle definition), `employee_shift_pattern` (dated), `roster_entries` (published overrides), `weekly_off_rules`, `punches`, `attendance_days` (computed, versioned), `attendance_exceptions`, `attendance_requests` (P03), `overtime_entries`, `late_penalty_postings`, `allowance_days`, `timesheets` |
| Field force (B2) | `field_tracking_consents` (employee, notice version, given_at, withdrawn_at), `location_points` (employee, duty date, time, lat / long, accuracy, speed, mock flag; partitioned by month, purged at retention), `beat_plans` + `beat_plan_visits` (customer / site, geofence, window, repeat rule), `field_sites` (customer / client site, pin, radius), `visits` (planned ref?, site, check-in / out, verdict, photo document, notes, outcome, custom fields), `field_day_distance` (employee, date, method straight / road, km, M05 draft line ref) |
| Rostering (B3) | `staffing_demands` (location, area?, shift / slot, date or weekday template, skill / role, required count), `employee_availability` (unavailable / preferred-off, hard / soft), `roster_runs` (period, location, rule version, inputs hash, score, status draft / approved / published), `roster_run_gaps` (slot, reason), `open_shifts` (slot, pool, award rule, status) + `open_shift_claims`, `bid_windows` + `shift_bids` (ranked preferences) + `bid_awards` |
| Women's night work (Correction C1) | `night_work_consents` (employee, location, shifts covered, P05 document, given_at, withdrawn_at, effective_until), `night_work_safeguard_items` (location, P07 item code, attested_by, evidence document, attested_on, review_due, status), `night_work_register_runs` (location, period, generated file, frozen_at) |
| Presence & visitors (C1) | `presence_consents`, `presence_signals` (employee, date, source teams / desktop, first_active, last_active, active_minutes; no content columns), `desktop_agents` (device, version, last heartbeat), `visitors`, `visitor_passes` (host, location, window, QR, status), `visitor_visits` (check-in / out, badge, acknowledgements), `visitor_rules` (per location) |
| Validation pass 3 Should | `ir_events` + `ir_event_members` (J4: establishment, type strike / lockout / lay-off, from / to, legality, notice document); `roster_entries.slot_type` (shift / standby) + `callouts` (V7: employee, standby entry, start / end, source, paid minutes); `block_leave_requirements` (V12: role group, days, period) + `access_suspensions` (P12 ref, from / to, exceptions); `role_licence_requirements` (V13: role / skill / shift, licence type, class); `hybrid_policies` (T7: group, office days per week, office locations) + `office_day_plans` (employee, date, planned / anchor) |

All carry `organization_id` + RLS (P01).

---

## Rules

| ID | Rule |
|---|---|
| YX-LV-01 | A leave balance is always the sum of its ledger entries; no screen or report computes it differently. |
| YX-LV-02 | Accruals follow the type's frequency, basis (upfront / days worked / LOP-reduced) and rounding; the last accrual of the leave year trues up to the exact entitlement (L4). |
| YX-LV-03 | Day counting applies the type's sandwich mode, holiday/weekly-off treatment and half-day rules (L3), using the employee's location calendar and weekly-off resolution. |
| YX-LV-04 | Negative balances stay within the type's limit; future accruals repay first; on exit the remainder follows L6. |
| YX-LV-05 | Eligibility, notice, maximum per request/month, block dates and mandatory-attachment rules are checked before submission and shown in the live summary. |
| YX-LV-06 | Comp-off credits expire after the type's window; expiry posts a ledger entry and notifies the employee in advance. |
| YX-LV-07 | Year-end processing (carry forward, lapse, encash) runs only through the year-end wizard with preview and approval. |
| YX-LV-08 | Leave affecting a locked period can only be corrected via a late request / correction with effect in the next payroll (P08). |
| YX-LV-09 | A mandatory attachment of a medical nature is stored as a P05 **"Medical certificate"** document (Special class) and verified by HR; approvers and managers see only "certificate attached · verified / pending", never the file (D9). |
| YX-LV-10 | **Maternity** follows the P07 IN.LEAVE template: 80 days in the preceding 12 months for eligibility; 26 weeks (max 8 before delivery), 12 weeks for adopting / commissioning mothers or the 3rd child, 6 weeks for miscarriage / MTP, 2 weeks for tubectomy. For ESIC-covered employees the leave is recorded but pay is by ESIC (M03 YX-PAY-26). Dismissal during maternity leave is blocked (law); crèche and post-maternity WFH are company settings (D17). |
| YX-LV-11 | During sabbatical, long LWP or maternity, accrual pauses or continues per leave type as the company sets (D17); statutory values are enforced where the law fixes them. |
| YX-LV-12 | Leave during the notice period follows the type's company policy — allowed (starter) / LOP / extends LWD / blocked (D17); the apply sheet warns, and the LWD / notice-shortfall effect is sent to the M01 exit case. |
| YX-LV-13 | A leave-year change creates a short year with pro-rata entitlements and a carry-forward transition wizard; on transfer the holiday calendar switches on the transfer date and optional holidays are prorated or reset per company setting. |
| YX-LV-14 | Unpaid (LWP) leave types carry no balance: the balance card, reports and mobile show "taken this year", never a negative closing balance; negative balances exist only for paid types within their L6 limit (fixes U7). |
| YX-LV-15 | **Injury leave (J6):** injury leave is posted only from an M08 workplace accident / injury case (YX-CASE-14) for the days the person cannot work; it has no balance or accrual, counts as service and never as LOP; pay follows the company policy (D17) but never below the statutory floor — ESIC benefit for ESI-covered persons, P07 `IN.EC` compensation otherwise (M03 YX-PAY-50); medical evidence is a Special document (YX-LV-09) and the manager sees only the dates. |
| YX-AT-01 | Punches are deduplicated; each stores source, location verdict and device (kiosk punches: kiosk id + location, M04 Q4); geofence / IP rules follow the employee's location settings (Q6). |
| YX-AT-02 | Weekly offs are resolved per date by the precedence rule (Q1); they are never stored as holiday rows. |
| YX-AT-03 | Day status is derived by the day engine; a missing punch yields "missing check-in/out", never a threshold-based status. |
| YX-AT-04 | Overtime counts only beyond the policy minimum, rounded down to the policy unit, capped per P07 statutory limits, and reaches payroll only when approved (Q7). |
| YX-AT-05 | Late penalties follow the tenant's policy (Q4) and appear on the day card and muster before they affect pay. |
| YX-AT-06 | Regularisation and WFH/on-duty limits per month are enforced; beyond the limit, requests route to HR (Q5). |
| YX-AT-07 | Rosters flag overlaps and minimum-rest violations; publishing notifies affected employees. |
| YX-AT-08 | Attendance exceptions must be resolved before payroll approval (P08 YX-LOCK-07/08) — for Punch-mode groups with the block switch on (YX-AT-09). |
| YX-AT-09 | Every employee resolves to one attendance mode — **Punch**, **Assumed present** or **Timesheet** — from the scoped P01 setting (entity / location / department / employment type). Missing-punch exceptions exist only in Punch mode, where the company chooses **block** (default) or **warn** for payroll approval; Assumed-present groups never block payroll (LOP entered by HR, M03); Timesheet groups raise "no approved timesheet" instead (D1). |
| YX-AT-10 | The expected status of a day follows employment status first: suspended, long leave (maternity / sabbatical / LWP), absconding in process, pre-boarding and exited days raise no exceptions, late penalties or nudges (D10). |
| YX-AT-11 | A public holiday falling on a weekly off is handled per the calendar's company setting — substitute day / comp-off / none (starter: none) (D17). |
| YX-AT-12 | On a half-day leave date, grace applies from the start of the working half, the leave half carries no late penalty, and OT is measured against the half-day's expected hours. |
| YX-AT-13 | A punch for a shift that started before the lock attaches to that shift without a late request; a biometric batch arriving after the freeze is applied only through an audited HR bulk "device backfill" correction (P08); an employee can have two shifts in one day, each evaluated separately. |
| YX-AT-14 | The Today board, muster, team calendar and attendance calendar open in the viewer's widest P02 scope (manager: team; HR: entity), never self-only; the personal view is the employee's mobile Time tab (fixes U16). |
| YX-AT-15 | The day card shows each punch's source, map pin, distance to the nearest allowed location and verdict (inside / outside / field-recorded) to viewers in scope (fixes U17). |
| YX-AT-16 | **Field-force location trail (B2):** location points are collected only when the employee's group has field-force tracking on **and** the employee's consent is on record, and only between duty check-in and check-out within the shift window + grace; never on leave, weekly offs, holidays or after check-out unless an approved on-duty request covers the day. The app shows "Tracking on" while collecting; withdrawing consent stops collection at once. Trails are Confidential (own + manager / HR in scope, duty time only) and deleted after the company's retention period (starter 90 days), keeping only daily distance and visits. |
| YX-AT-17 | **Visits & client-site attendance (B2):** a visit check-in records the geofence verdict against the site's pin, a camera-only time- and location-stamped photo and notes; planned vs done is shown per beat plan; a day with a site check-in is present (field) with worked time per the group's rule; mock-location, impossible speed and gaps are flagged, never auto-penalised. |
| YX-AT-18 | **Distance-based conveyance (B2):** each duty day's distance (straight-line × company factor, or road distance where the company enabled the maps add-on) becomes a **draft** M05 mileage line the employee must confirm; M05 rates, limits and approvals apply; nothing is reimbursed automatically. |
| YX-AT-19 | **Auto-roster (B3):** the generator never breaks a hard constraint — valid skill / certification, availability marked hard, approved leave, holidays and weekly offs, minimum rest (never below P07), P07 statutory and company hour / OT caps, one shift at a time, the women's night-shift guard (YX-AT-25, added by Correction C1), employment status (D10); it optimises the company's weighted soft goals (fairness over a rolling window, preferences, continuity, cost); every unfilled or over-staffed slot carries a reason; a run stores inputs, rule version and score; nothing is published until a manager approves (P03). |
| YX-AT-20 | **Open shifts & bidding (B3):** an open shift is offered only to employees who meet its skill, location / pool, conflict, rest and hour-cap checks, re-checked at award; the award follows the company rule (first-come auto-assign or manager picks; starter manager picks); bids are ranked preferences within a bid window, awarded by the company's tie-break rule (starter fairness score, then seniority) and approved with the roster. |
| YX-AT-21 | **Desktop / Teams presence (C1):** used only where the company switched it on for the group and the employee consented; only presence / active-idle states and times are collected — never keystroke content or counts, screenshots, screen / webcam / audio recording, application names, window titles, URLs or files; it yields first-active / last-active punches (source "teams" / "desktop") or evidence only, per group; managers see the day status and total active hours, never a minute-by-minute timeline; a missing signal goes through the normal exception flow. |
| YX-AT-22 | **Visitor management (C1):** every visitor enters a location through a pre-registration or a host-approved walk-in; check-in and check-out are logged per location with badge / QR, required acknowledgements (NDA / safety) are captured before entry per the location's rules, blocked visitors are stopped at reception, an "on site now" list is available for emergencies, and visitor data (Confidential) is deleted after the company's retention period (starter 90 days; ID images 30 days). |
| YX-AT-23 | **Geofence transparency and failed attempts (G7):** before a mobile check-in is submitted the employee sees their GPS pin, the accuracy radius and the allowed geofence(s), can **retry location**, and is told in plain words why a punch would be refused ("Outside Chennai HQ, 850 m away", "Location accuracy 300 m, move outdoors"); **every refused or abandoned attempt is logged** (time, location, accuracy, distance, reason, device) as an attendance exception the employee and HR can see, so HR can **regularise the day from the attempt** (P03 request or one-click approval) without the employee being marked late or absent for a location or accuracy failure. |
| YX-AT-24 | **Offline check-in (G8, wave 2):** when the phone has no connectivity the punch is **queued on the device** with device time, GPS fix and accuracy, shown in the card's offline queue with a "pending sync" chip, and synced automatically when online; the synced punch is stored with both device time and server receipt time, **flagged offline**, evaluated by the day engine (§B3) on device time, and listed for HR with the offline flag; the server rejects a queued punch older than the company's limit (starter 48 h) or with a device clock drift beyond tolerance, raising an exception instead of a silent drop. Selfie / face check-in stays in wave 6. |
| YX-AT-25 | **Women's night-shift guard (C1, law):** no roster path (manual edit, pattern, swap, open-shift claim, bid award, auto-roster) places a woman on a shift overlapping the legal night window of P07 `IN.OSH` for the location's state (transitional Factories Act s.66 / state S&E values where OSH rules are not notified) unless, for that date, her written consent is on record and not withdrawn and the establishment's safeguards checklist is valid; the company's night definition (D17) may be wider but never narrower than the legal window; the guard has no company switch or override; refusing or withdrawing consent never triggers any adverse action. |
| YX-AT-26 | **Night-work records (C1):** consents (P05 documents), safeguard attestations with evidence and review dates, and a register of women night-shift workers per establishment and period (generated from roster and punches in the dated P07 format, frozen with the period lock) are kept; a lapsed safeguard item alerts the location admin and HR before its review date. |
| YX-AT-27 | **Industrial-action statuses (J4).** Days in a recorded strike, lockout or lay-off event get that status (not Absent / LOP); M03 pays lay-off compensation per P07 `IN.IR` (verify) and strike / lockout days per legality and company policy (D17), never below the legal floor; the event and its legality are audited and changing legality recomputes the affected days before the period lock. |
| YX-AT-28 | **Standby and call-out (V7).** A standby slot is not a working shift; a call-out logged during it is paid at least the company's call-out minimum (D17) and counts for hours, OT and minimum-rest checks; standby allowance per slot feeds M03. |
| YX-LV-16 | **Mandatory block leave (V12).** With the BFSI pack on, each designated person must take one block of the company's required consecutive days per year (verify regulator guidance); the start triggers P12 access suspension until return, any access during it needs a logged compliance-officer exception, and people without a block planned by the company's cut-off are listed for the compliance officer. |
| YX-AT-29 | **Licence gate (V13).** No roster path, trip or assignment places a person on a date where a licence required by the role / skill / shift is missing or expired; legally required licences have no override, company-required ones allow an HR override with reason (audited). |
| YX-AT-30 | **Hybrid office days (T7).** Office-day compliance per week is computed from office-geofence / kiosk / badge evidence against the group's policy, pro-rated for leave, holidays and approved travel; it is visible to the employee and manager, and never feeds pay, LOP or ratings unless the company sets a P19 rule to do so. |

---

## Acceptance tests (samples)
- Priya's leave screen, approval card, mobile card and balance report show the same Privilege Leave balance (YX-LV-01; U2).
- Leave Fri + Mon with a sandwich-mode type counts Sat/Sun; with mode None it doesn't (YX-LV-03).
- Meera's missing check-out on 10 Sep shows "Missing check-out" with a Fix button; payroll approval is blocked until resolved (YX-AT-03/08; U13).
- Leaving at 18:07 on a 9–6 shift with a 30-min OT minimum produces no overtime (YX-AT-04; U14).
- A 4-on / 2-off pattern from 1 Oct places weekly offs correctly for 60 days; the roster shows "Off" only (YX-AT-02; U19).
- Anita (ESIC-covered, 90 days worked in the last 12 months) applies for maternity leave: 26 weeks are granted, at most 8 of them before the delivery date, and M03 pays no employer maternity benefit for those weeks (YX-LV-10; E2).
- Ravi (not ESI-covered) is injured at the plant on 3 Oct; the accident case posts injury leave 3–12 Oct, his balance is untouched, the days are not LOP, and payroll gets the injury-leave days with at least the P07 EC amount (YX-LV-15; J6).
- Vikram (field sales, tracking on, consent given) checks in at 9:30 and out at 18:10: points exist only for 9:30–18:10; nothing is recorded on Sunday or after 18:10 even though the app stays installed; his 4 visits show photo, notes and verdict, and a draft M05 mileage line of 42 km waits for his confirmation (YX-AT-16/17/18; B2).
- Vikram withdraws consent in Me › Privacy at 13:00: collection stops immediately and the afternoon visits are still logged as field check-ins without a trail (YX-AT-16).
- The generator is asked for 3 night nurses on 5 Oct but only 2 qualified nurses satisfy the 11-hour rest rule: it fills 2, leaves 1 slot unfilled with the reason, and nothing reaches employees until the ward manager approves; the unfilled slot published as an open shift is not shown to a nurse whose certification expired on 30 Sep (YX-AT-19/20; B3).
- With Teams presence on for a WFH group, Asha's first-active 9:12 and last-active 18:03 create two "teams" punches; her manager sees "Present · 7 h 40 m active" and no timeline; the stored record has no application, window or keystroke data (YX-AT-21; C1).
- A walk-in visitor for Ravi waits at reception; Ravi approves on his phone, the visitor accepts the NDA on the kiosk, a badge prints, and the visitor appears on the Chennai HQ "on site now" list until check-out (YX-AT-22; C1).
- The Pune plant's legal night window is 7 pm – 6 am and its safeguards checklist is valid; Kavita has consent on file and is rostered 10 pm – 6 am; Rekha, with no consent, can't be dragged onto the same shift ("No night-work consent on file") and the auto-roster leaves her off it; when the transport item lapses on 1 Nov, neither can be rostered in the window until it is re-attested (YX-AT-25; Correction C1).
- A company defining "night" as 9 pm – 5 am is saved with a warning and the guard still applies 7 pm – 6 am (YX-AT-25, P19 YX-RULE-03).
- October's register of women night-shift workers for the Pune plant lists Kavita's 12 night shifts with her consent reference and is frozen with the period lock (YX-AT-26).
- A 3-day lay-off at the Pune plant marks 120 workers "Lay-off" (not LOP) and M03 shows lay-off compensation lines; a legal strike day is marked "Strike" (YX-AT-27; J4).
- Anil on standby is called out for 40 minutes at 2 am: he is paid the 2-hour minimum and his next shift raises a minimum-rest conflict (YX-AT-28; V7).
- A branch cashier starts 10 days' block leave: her system access is suspended that morning and restored on return; a login attempt in between is refused (YX-LV-16; V12).
- A driver's licence expired yesterday: assigning him today's trip is blocked with "Driving licence expired 27 Sep" (YX-AT-29; V13).
- With a 3-day office policy, Priya has 2 office punches and 1 day of leave in the week: she shows as compliant (YX-AT-30; T7).

---

## 10. Open questions (answer one at a time)
(Attendance reference §5; device question already decided in P10 Q4.)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Weekly offs: where do they come from? | **Precedence: employee override > shift pattern / roster > location default** (default Sunday); support **alternate Saturdays** (e.g. 2nd & 4th) and custom patterns. |
| Q2 | Rotating rosters at launch | **Weekly repeat + N-day cycles** (4 on / 2 off, 3-shift rotation) + manual roster edits and swaps. |
| Q3 | Break handling | **Configurable per shift:** fixed unpaid break deducted when worked hours exceed a threshold (default), **or** punch-based breaks, or none. |
| Q4 | Late-coming penalty | **Off by default; ready-made policy:** N lates per month free (default 3), each further N lates = ½ day deducted from leave (CL first) else LOP; grace minutes per shift. |
| Q5 | Regularisation limits | Employees can fix **missed in, missed out, wrong time**; default **4 per month** self-service (manager approval), beyond → HR approval. |
| Q6 | Check-in controls at launch | **Mobile GPS with geofence (multiple locations), web with IP restriction, biometric**; per location / group: "must be inside geofence" or "field staff: location recorded, not restricted"; selfie/offline in wave 6 (amended 26 Sep 2026: offline check-in moved to wave 2, G8). |
| Q7 | Overtime | **OT policy per shift:** minimum 30 min, rounded down to 15 min, approval **after the fact by default** (pre-approval optional per policy), **statutory caps from P07** (Factories Act workers) enforced; option to convert OT to comp-off. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Layered weekly offs.** Precedence: employee override > shift pattern / roster > location default (default Sunday). Supports alternate Saturdays (e.g. 2nd & 4th), nth-weekday and custom patterns. | 25 Sep 2026 |
| Q2 | **Weekly repeat + N-day rotating cycles** (e.g. 4 on / 2 off, 3-shift rotation) at launch, with manual roster edits and swaps on top. Demand-based auto-scheduling is not in launch scope. | 25 Sep 2026 |
| Q3 | **Break rule per shift:** fixed unpaid break deducted above a worked-hours threshold (default 30 min above 5 h), **or** punch-based breaks, **or** none. The day card always shows the deduction applied. | 25 Sep 2026 |
| Q4 | **Late penalty off by default**; ready policy when enabled: N lates/month free (default 3), each further N lates = ½ day from leave (order configurable, CL first) else LOP; grace per shift; all values editable. Employees get a warning nudge before a penalty posts; penalties are visible on the day card and muster before payroll. | 25 Sep 2026 |
| Q5 | **Regularisation:** missed in / missed out / wrong time / full day; default **4 per month** with manager approval, beyond that HR approval is added; limit and look-back window (default current open payroll period) set by the company; after the lock → late correction (P08 Q4). | 25 Sep 2026 |
| Q6 | **Launch check-in:** mobile GPS with geofence (multiple allowed locations), web with IP / Wi-Fi restriction, biometric devices (P10 Q4). Per location / group mode: **restricted** (must be inside geofence / allowed IP) or **field** (location recorded, not restricted). Selfie / face and offline check-in in wave 6 (P10 Q3). **Amendment 26 Sep 2026 (market analysis G8):** offline check-in moved to **wave 2** — punches queue on the device with device time + GPS, sync later and are flagged offline (YX-AT-24); selfie / face stays in wave 6. | 25 Sep 2026 |
| Q7 | **OT policy per shift:** minimum 30 min, rounded down to 15 min; approval after the fact by default, pre-approval optional per policy; statutory caps from P07 (Factories Act daily / weekly / quarterly) enforced, excess flagged and not paid as OT without HR override with reason; option per policy to credit comp-off instead of pay; rate categories (normal / weekly off / holiday) feed payroll. | 25 Sep 2026 |
| D1 | **Attendance mode per group** (entity / location / department / employment type; scoped P01 setting): **Punch** (current rules), **Assumed present** (present unless approved leave; HR enters LOP manually; no missing-punch exceptions; payroll never blocked by attendance) or **Timesheet** (approved hours drive pay; a missing approved timesheet is the exception). In Punch mode the company chooses whether missing-punch exceptions **block** payroll approval (default) or are **warnings** only. §B3, YX-AT-08/09. | 26 Sep 2026 |
| D10 | **Consistency fix:** expected day status derives from employment status (suspended, long leave / maternity / sabbatical / LWP, absconding in process, pre-boarding, exited) — no exceptions, late penalties or nudges on those days. §B3 step 1, YX-AT-10. | 26 Sep 2026 |
| D9 | **Consistency fix:** mandatory attachments such as medical certificates are P05 "Medical certificate" documents (Special), verified by HR; the approval card shows only "certificate attached · verified / pending". §A2, YX-LV-09. | 26 Sep 2026 |
| D4 | **Consistency fix:** timesheet entry screens (desk weekly grid, mobile Time tab), approver resolver (project manager; client contact via the M10 portal for deployed contractors; account manager fallback) and a timesheet hours feed to payroll (approved hours by normal / OT / holiday per placement). §B6, §B7. | 26 Sep 2026 |
| E-Q2 | **Maternity = statutory template (A):** P07 IN.LEAVE drives eligibility (80 days in 12 months), 26 weeks (max 8 pre-delivery), 12 weeks adoption / commissioning / 3rd child, 6 weeks miscarriage / MTP, 2 weeks tubectomy; ESIC-covered → leave recorded, pay by ESIC (M03 excludes employer pay); crèche (50+) and post-maternity WFH as company settings; no-dismissal legal guard. §A2, YX-LV-10. | 26 Sep 2026 |
| E3 (D17) | **Accrual during long absence** (sabbatical / long LWP / maternity): pause or continue per leave type as the company sets; statutory values enforced where the law fixes them; the absence drives the D10 expected status. §A2, YX-LV-11. | 26 Sep 2026 |
| E10 (D17) | **Leave during notice:** per leave type allowed / converted to LOP / extends LWD / blocked (starter template: allowed); the apply sheet warns; the LWD and notice-shortfall effect goes to the M01 exit case. §A2, YX-LV-12. | 26 Sep 2026 |
| E19 | **Time edge cases:** holiday on weekly off → substitute / comp-off / none per calendar (D17, starter none); half-day + late / OT interplay; night-shift punch across the lock attaches without a late request; post-freeze biometric batch → audited HR bulk device backfill; leave-year change → short year + carry-forward transition wizard; holiday calendar switches on transfer, optional holidays prorated / reset per setting; two shifts in one day. §A2, §B3, YX-LV-13, YX-AT-11/12/13. | 26 Sep 2026 |
| F-1 | **F-follow-ups (consistency fix), APX-D §8, U7:** unpaid / LWP types show "taken this year", never a negative balance. §A2, YX-LV-14. | 26 Sep 2026 |
| F-2 | **F-follow-ups (consistency fix), APX-D §8, U16:** Today board, muster, team and attendance calendars open in the viewer's team / entity scope, not self-only. §B5, YX-AT-14. | 26 Sep 2026 |
| F-3 | **F-follow-ups (consistency fix), APX-D §8, U17:** day card shows each punch on a map with distance from the allowed location and the in / out verdict. §B5, YX-AT-15. | 26 Sep 2026 |
| B2 | **Gap-register extension (user decision 26 Sep 2026): field-force tracking, wave 5.** Company switch per group (starter off); consent-based live location trail **during duty hours only, never off-duty**, "Tracking on" indicator, withdrawable consent, Confidential trail with company retention (starter 90 days); beat plans and visit logging with camera photo / notes / outcome; client-site attendance (present-field from site check-ins, host-location geofence for deputees); daily distance → **draft** M05 mileage line (road distance via maps provider = third-party add-on, D18); integrity flags, never auto-penalised. Background location via the store app (M04). §B8, YX-AT-16/17/18, M05 YX-EXP-16, M04 YX-MOB-13. | 26 Sep 2026 |
| B3 | **Gap-register extension (user decision 26 Sep 2026): auto-rostering designed now, built wave 6** (supersedes the "not in launch scope" line of Q2; waves are build order only). Staffing demand per location × shift × skill; auto-roster generator honouring skills / certifications, availability, leave, weekly offs, minimum rest, P07 and company OT / hour caps (hard) and fairness, preferences, continuity, cost (soft, company-weighted); coverage view with reasons for gaps; manager approval before publish; open shifts to eligible employees (claim, first-come or manager picks; starter manager picks); shift bidding with company tie-break rule (starter fairness then seniority); all rules from a labelled starter template (D17); solver included (D18). §B9, YX-AT-19/20, M04 YX-MOB-15. | 26 Sep 2026 |
| C1 | **Gap-register extension (user decision 26 Sep 2026): desktop-agent / Teams-presence attendance and visitor management, wave 6.** Presence: company option per group (starter off) + employee consent; activity signals only (presence, active / idle, lock / unlock), **never keystroke content**, screenshots, recordings, app names, titles or URLs; first-active / last-active punches or evidence only; no manager timelines. Visitor management as location operations: pre-registration with QR pass, host-approved walk-ins, badge, check-in / out log per location, NDA / safety acknowledgement, blocked list, "on site now" list, visitor data retention (starter 90 days). Employee ID cards stay in APX-F. §B10–§B11, YX-AT-21/22, M04 YX-MOB-16. | 26 Sep 2026 |
| G7 | **Market analysis addition (G7), founder decision: check-in card shows GPS pin, accuracy radius and geofence before submit**, with "retry location" and a plain reason when outside; every failed attempt is logged so HR can regularise without a late mark. New rule YX-AT-23; M04 YX-MOB-18. | 26 Sep 2026 |
| G8 | **Market analysis addition (G8), founder decision: offline check-in moved from wave 6 to wave 2** — queue punches with device time + GPS, sync later, flagged offline; selfie / face stays in wave 6. Amends Q6 (amendment note, history kept). New rule YX-AT-24; §B1; M04 Q7 amendment, §8. | 26 Sep 2026 |
| C1 | **Correction C1 (validation pass 3), 28 Sep 2026:** women's night-shift work (OSH Code, P07 `IN.OSH`; Factories Act s.66 / state S&E exemptions as transitional values): written consent per worker; establishment safeguards checklist per the appropriate government (transport, minimum group, security, register, etc.); manual roster, swaps, open shifts, bids and auto-roster enforce a **law guard** (P19 YX-RULE-03 style, no switch or override): no woman in the notified night window without valid consent and a valid checklist; register of women night-shift workers. Which shifts count as night stays company policy (D17) with the legal window as the floor. §B2, §B5, §B9, data model, YX-AT-25/26, YX-AT-19 amended. | 28 Sep 2026 |
| J6 | **Validation pass 3 Must (J6), founder decision 28 Sep 2026:** statutory **injury leave** type posted only from the M08 workplace accident / injury case (dates from the case, no balance, counts as service, never LOP); paid per company policy (D17, starter full pay for non-ESI) above the statutory floor — ESIC benefit for ESI-covered persons, employees' compensation (P07 `IN.EC`) otherwise (M03 YX-PAY-50); medical evidence Special. §A2, YX-LV-15. | 28 Sep 2026 |
| Validation pass 3 Should (J4), founder decision 28 Sep 2026 | **Attendance statuses Strike / Lockout / Lay-off** from an establishment industrial-action event; pay treatment in M03 per legality and P07 `IN.IR` (verify). Wave 4. §B12, YX-AT-27. | 28 Sep 2026 |
| Validation pass 3 Should (V7), founder decision 28 Sep 2026 | **On-call / standby roster slot type and call-out** with call-out minimum (D17, starter 2 h) and standby allowance. Wave 5. §B12, YX-AT-28. | 28 Sep 2026 |
| Validation pass 3 Should (V12), founder decision 28 Sep 2026 | **Mandatory block leave with system-access suspension** (BFSI pack; days per company policy, regulator guidance verify). Wave 6. §B12, YX-LV-16. | 28 Sep 2026 |
| Validation pass 3 Should (V13), founder decision 28 Sep 2026 | **Licences gate roster / trip / assignment**; expired or missing required licence blocks; legal licences no override. Wave 6. §B12, YX-AT-29. | 28 Sep 2026 |
| Validation pass 3 Should (T7), founder decision 28 Sep 2026 | **Hybrid office-attendance policy** (N office days a week), weekly compliance view, team office-day planning; not tied to pay by default; desk / room booking later. Wave 5. §B12, YX-AT-30. | 28 Sep 2026 |
