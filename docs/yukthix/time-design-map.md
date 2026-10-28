# Time: live pages and their designs

Every Time page in the web app now renders the designed TIM screen (with a `live` prop and real data). The old
"Live" copies under `packages/yx-ui/src/screens/time/live/` and their stories are gone. This file lists every live
page, then every design group with every story (sub-page) and where that state shows in the live app.

Verdicts: **wire design** (a live page exists for this job, now the design) · **design only, feature not built**
(the API has nothing for it) · **phone view, mobile app not built**. A **gap** is a state of a wired design that the
live page cannot reach yet (the reason is given).

## Counts (sub-pages = stories)

| | live | feature not built | phone view | gap |
|---|---|---|---|---|
| Attendance (TIM-01…04, 07, 10, 12…14, 36, Extra ×2) | 29 | 46 | 19 | 15 |
| Leave (TIM-17…25) | 25 | 11 | 11 | 6 |
| Set-up (TIM-26…29, 31, 42) | 20 | 11 | 0 | 2 |
| Rosters and shifts (TIM-05, 06, 08, 34, 35, 38…41) | 17 | 24 | 10 | 2 |
| Overtime, periods, reports, timesheets (TIM-09, 11, 15, 16, 30, 37, 43) | 22 | 19 | 3 | 3 |
| Field force (TIM-32, 33) | 0 | 7 | 8 | 0 |
| **All 45 design groups (310 sub-pages counted)** | **113** | **118** | **51** | **28** |

Kit (24 stories) are shared parts, not pages; section E lists which live screens use them.

## A. Attendance

### 1. Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/attendance | `AttendanceCalendarScreen` with `live` (attendance.tsx) | Extra · Attendance calendar (+ TIM-03 day card, TIM-07 request sheet) | now the design: month calendar, totals, fix alert, waiting requests, day card, request sheet; night work card kept (no design, see gaps) |
| /yx/time/attendance?view=today | `MyAttendanceTodayScreen` with `live` | Extra · My attendance today | now the design: clock card (page), this week, your rules, fix alert |
| /yx/time/attendance?request=wfh / ?request=regularise | the calendar (or today page) with the TIM-07 sheet open | TIM-07 · Attendance request | now the design (Regularise and WFH only) |
| /yx/home (clock card only) | `HomeClockCard` = designed `ClockCard` variant home, on live data (moved to attendance.tsx) | Extra · My attendance today › Home widget | already the design; "Today's punches" now opens the today page, Regularise opens the sheet there |
| /yx/time/muster | `MusterScreen` with `live` (attendance.tsx) | TIM-02 · Muster (+ TIM-03 day card) | now the design: grid with pinned names and totals, legend, phone cards, month sheet, day card; read only |

Old live copies deleted: live/my-attendance.tsx (MyAttendanceScreen, TodayCard, WfhDrawer, FixDrawer), live/team.tsx (live MusterScreen), their "Live" stories, live/live.test.tsx (ported to attendance-live.test.tsx).

### TIM-01 · Today board

| story (sub-page) | where it shows live |
|---|---|
| Manager · Manager · team | feature not built as a Time page (the team's day is on Home › Team today, PLT-02) |
| Hr · HR · entity | feature not built |
| Nudged · Nudge sent | feature not built (nudge API exists, used by Home) |
| FieldTab · Field tab | feature not built |
| OnSite · HR · on site now | feature not built |
| Empty · no one rostered | feature not built |
| Loading | feature not built |
| Failed · Error | feature not built |
| Phone · Team today | phone view, mobile app not built |

### TIM-02 · Muster

| story (sub-page) | where it shows live |
|---|---|
| Open · Open month | /yx/time/muster |
| CellOpen · Cell → day card | /yx/time/muster → click a cell |
| Freeze · Freeze inputs | gap: freeze/lock live on /yx/time/periods (Periods), not on the muster |
| Frozen · all exceptions resolved | gap: the muster API returns no period stage |
| FrozenBlocked · lock blocked | gap: as above |
| Lock · typed confirmation (August) | gap: locking a month lives on /yx/time/periods (Periods), not on the muster; the muster API returns no period stage |
| Locked (August) | gap: as above |
| Bulk · mark present with reason | feature not built (no bulk mark-present API) |
| Empty | /yx/time/muster with no one in scope ("No one on the muster") |
| Loading | /yx/time/muster while loading |
| Failed · Error | /yx/time/muster when the API fails (Try again) |

Live extras from the design file: month arrows (the top bar has no month on this page); next month that has not started says so in a toast.

### TIM-03 · Day card

| story (sub-page) | where it shows live |
|---|---|
| Employee · outside-geofence punch | /yx/time/attendance → a day; refused punches show "Not recorded: reason" (map left out, see gaps) |
| MissingOut · missing check-out, Fix | /yx/time/attendance → a missing day → Fix this day → TIM-07 sheet |
| OnDuty · field-recorded, offline punch | feature not built (no on-duty or offline punches in the API) |
| Late · Manager · late day | /yx/time/muster (manager) → a late day |
| Overtime · HR · overtime day | gap: day card has no overtime figures (OT lives on /yx/time/overtime) |
| PendingOt · Manager · pending overtime | gap: as above |
| HrFix · HR · resolve missing punch | gap: no HR resolve API; the live muster day card is read only (no button that does nothing) |
| Phone | phone view, mobile app not built |
| PhoneOd · Phone · on duty | phone view, mobile app not built |

### TIM-04 · Attendance exceptions

| story (sub-page) | where it shows live |
|---|---|
| Hr · HR · queue | feature not built (no exceptions API; the muster shows "N days to fix") |
| Manager · team | feature not built |
| Resolve · HR · resolve with reason | feature not built |
| OnePerson · one person | feature not built |
| Empty · nothing open | feature not built |
| Loading | feature not built |
| Failed · Error | feature not built |
| Phone · manager | phone view, mobile app not built |

### TIM-07 · Attendance request

| story (sub-page) | where it shows live |
|---|---|
| Regularise · effect preview | /yx/time/attendance → Regularise a day (or Fix 6 Oct / Fix this day) |
| OverLimit · over monthly limit → HR | same, when the month's fixes are used up ("Goes to your manager, then HR") |
| LateRequest · locked date | gap: the API has no locked periods for the person yet; the server refuses with its reason |
| Wfh · WFH | /yx/time/attendance → Request work from home (or ?request=wfh from Home) |
| OnDuty · with location | feature not built (no on-duty API) |
| Ot · OT pre-approval | feature not built here (overtime claims are on /yx/time/overtime) |
| Invalid · Validation error | the sheet → Send with a field missing (error on the field, focus moves there) |
| Sent | toast "Sent to your manager" and the sheet closes (house rule: done = toast) |
| Phone | phone view, mobile app not built |
| PhoneWfh · Phone · WFH | phone view, mobile app not built |

### TIM-10 · Device backfill correction

| story (sub-page) | where it shows live |
|---|---|
| Batch · Step 1 | feature not built (no device or backfill API) |
| Preview · Step 2 | feature not built |
| Reason · Step 3 | feature not built |
| Review | feature not built |
| Done · Applied | feature not built |

### TIM-12 · Mobile check-in sheet

| story (sub-page) | where it shows live |
|---|---|
| Inside · ready | phone view, mobile app not built |
| Outside · blocked | phone view, mobile app not built |
| Coarse · retry | phone view, mobile app not built |
| Early · shift not started | phone view, mobile app not built |
| Offline · before check-in | phone view, mobile app not built |
| OfflineSaved · waiting to sync | phone view, mobile app not built |
| Field · recorded, not restricted | phone view, mobile app not built |
| CheckedIn · check out | phone view, mobile app not built |
| Device · not bound | phone view, mobile app not built |
| Selfie · not on yet | phone view, mobile app not built |

### TIM-13 · Kiosk

| story (sub-page) | where it shows live |
|---|---|
| Code · Employee code | feature not built (no kiosk API) |
| UnknownCode | feature not built |
| Qr · Scan ID card QR | feature not built |
| Pin | feature not built |
| WrongPin | feature not built |
| Menu | feature not built |
| CheckedIn | feature not built |
| Training | feature not built |
| Leave · Apply leave | feature not built |
| Status · Request status | feature not built |

### TIM-14 · Devices and kiosks

| story (sub-page) | where it shows live |
|---|---|
| Kiosks · HR · kiosks and last seen | feature not built (no device API) |
| Binds · New phone requests | feature not built |
| Phones · Employee phones | feature not built |
| SignOut · Remote sign-out | feature not built |
| SystemAdmin | feature not built |
| Empty | feature not built |
| Loading | feature not built |

### TIM-36 · Presence-based attendance

| story (sub-page) | where it shows live |
|---|---|
| Employee · what was recorded | feature not built (no presence API) |
| Hr | feature not built |
| NoConsent | feature not built |
| Withdrawn · Consent withdrawn · manager | feature not built |

### Extra · Attendance calendar

| story (sub-page) | where it shows live |
|---|---|
| Employee · September | /yx/time/attendance |
| DayOpen · missing check-out | /yx/time/attendance → click a missing day |
| DayOpenPending · regularisation pending | /yx/time/attendance → a day with a waiting fix (View in "Waiting for approval"), Withdraw there |
| Locked · August | gap: no period lock info in /me/attendance |
| LockedDay · locked day card | gap: as above |
| Manager · one person | gap: managers open a person's day from the muster; no one-person month page for managers |
| ManagerDay · day card | /yx/time/muster (manager) → a cell |
| Loading | /yx/time/attendance while loading |
| Failed · Error | /yx/time/attendance when the API fails (Try again) |
| Phone | phone view, mobile app not built |
| PhoneDay · day sheet | phone view, mobile app not built |
| PhoneLocked · locked month | phone view, mobile app not built |

### Extra · My attendance today

| story (sub-page) | where it shows live |
|---|---|
| Working · since 9:38 am | /yx/time/attendance?view=today after checking in |
| NotClockedIn | /yx/time/attendance?view=today before checking in |
| LateClockIn | same, checked in after the grace ("Late by …") |
| OnBreak | same, after Start break |
| ClockedOut · already clocked out | same, after Clock out (pressing Clock in says why) |
| LeftEarly | same, out before the shift end |
| OutsideNetwork · blocked outside office network | gap: the server decides; a refused punch shows "Not recorded: reason" with Retry location |
| ChoseWfh · outside → clock in as WFH | gap: WFH is asked for ahead (TIM-07 sheet); an approved WFH day shows the badge |
| ShiftNotStarted | gap: the server decides when check-in opens |
| DeviceNotApproved | feature not built (no device binding API) |
| WithNote · Note open | gap: the punch API takes no note, so the live card offers none |
| Live · ticking clock | /yx/time/attendance?view=today (always ticks) |
| RegulariseOpen · Regularise → sheet | /yx/time/attendance?view=today → Regularise (TIM-07 sheet) |
| HomeWidget · not clocked in | /yx/home (clock card) |
| HomeWidgetWorking · working | /yx/home after checking in |

### 3. Counts

- Sub-pages live: 29
- Feature not built: 46
- Phone view: 19
- Gaps: 15
- Total: 109 stories

### Gaps and questions

- Day card map: punches carry no map position from the API, so the live day card leaves the map out (shift bar, KPIs and punch list stay).
- Day card "Late mark N of 3 free" uses the design's 3-a-month rule; the real policy number is not sent yet.
- Night work card (opt-in, confirm with a code, withdraw) has no design; kept on the calendar page so the feature is not lost. Question: design a TIM card for it?
- Question: the calendar header has "Clock in or out" (link to the today page) and the today page "My month"; neither is in the design. Chosen so each page reaches the other.
- Leave days show "LV · On leave" (new day code) because the day engine does not say which leave type; half-day leave shows HD.

## B. Leave

Builder B. Designs live in `packages/yx-ui/src/screens/time/leave.tsx`. The live pages now render the designs with a `live` prop.

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/leave | `LeaveHomeScreen live` (leave.tsx). The old `MyLeaveScreen` copy is deleted. | TIM-17 Leave home (Employee). Apply leave TIM-18, request detail TIM-19 and optional holidays TIM-23 open from it. | Now the TIM-17 design |
| /yx/time/team | `TeamLeaveCalendarScreen live`. The old `TeamLeaveScreen` copy is deleted. | TIM-20 Team leave calendar (Manager, HR, Month) | Now the TIM-20 design |
| /yx/time/balances | `LeaveCardScreen live` (HR). The old `LeaveBalancesScreen` copy is deleted. | TIM-21 Leave card (HR, Adjust) | Now the TIM-21 design, one person at a time, with an Employee picker. Question: the people × balances table is the TIM-30 Balances report (ops.tsx, builder E). Once E wires it, it can link to this card. |

### TIM-17 · Leave home

| story (sub-page) | where it shows live |
|---|---|
| Employee | /yx/time/leave: balance cards, My requests (View / Withdraw / Ask to cancel), Upcoming holidays, Optional holidays button |
| Manager | gap: no manager leave home. Managers use /yx/time/team (TIM-20) and answer requests in /yx/approvals |
| HR | gap: no HR leave home. HR uses /yx/time/balances (TIM-21) and /yx/time/team |
| Employee · no requests yet | /yx/time/leave for a new joiner: "No leave requests yet" with Apply leave |
| Loading | /yx/time/leave while it loads |
| Error | /yx/time/leave when the API fails: error state with Retry |
| Phone · employee | phone view, mobile app not built |
| Phone · manager | phone view, mobile app not built |

### TIM-18 · Apply leave

| story (sub-page) | where it shows live |
|---|---|
| Earned leave · sandwich counted | /yx/time/leave → Apply leave. If the policy counts sandwich days, the summary shows "Days counted (incl. N days between leave days)" from the server preview |
| Half days at both ends | /yx/time/leave → Apply leave: First day / Last day half selects (Part of the day for one day) |
| Over balance · blocked | /yx/time/leave → Apply leave: the server preview's block shows as a field error on Send, and nothing is sent |
| Short notice warning | /yx/time/leave → Apply leave: the API blocks short notice ("needs N days' notice"), so it shows as an error, not a warning |
| Sick leave · certificate required | /yx/time/leave → Apply leave: "I will give a certificate to HR" tick when the rules need one (field error if missing). The file upload is not in the API |
| Company block date | feature not built: the API has no company block dates |
| During notice period · last day moves | feature not built: the API has no notice-period rule for leave |
| Leave without pay · taken, no balance | /yx/time/leave → Apply leave on Leave without pay: "Unpaid days this year (with this)". The "use paid leave instead" nudge is not built |
| Sent | /yx/time/leave → Send request: toast "Leave sent for approval", and the request shows in My requests. The design's sent panel is replaced by the toast |
| Phone | phone view, mobile app not built |

### TIM-19 · Leave request detail

| story (sub-page) | where it shows live |
|---|---|
| Employee · pending | /yx/time/leave → View on a pending request (drawer) |
| Withdraw | /yx/time/leave → Withdraw: confirm dialog; a server refusal shows in the dialog |
| Employee · approved | /yx/time/leave → View on an approved request |
| Past approved leave · report an error | /yx/time/leave → Ask to cancel on approved leave from last month. The API's cancel covers it; there is no separate "report to HR" flow |
| Employee · ask to cancel future leave | /yx/time/leave → Ask to cancel: reason required (field error), then sent |
| Manager · with team availability | gap: managers review leave in /yx/approvals (P03), not in this drawer |
| Manager · approve | gap: approving happens in /yx/approvals (P03) |
| Phone | phone view, mobile app not built |
| Phone · manager | phone view, mobile app not built |

### TIM-20 · Team leave calendar

| story (sub-page) | where it shows live |
|---|---|
| Manager · people × days | /yx/time/team as a manager: two weeks (one week under 1100 px), Previous / Next week, "Waiting for approval" with Review going to /yx/approvals, Export |
| Month view | /yx/time/team → Month tab: the page loads that month |
| HR · all teams | /yx/time/team as HR: the people in leave.view scope |
| Empty | /yx/time/team when no one is away in the range: "No one is away …" with Next 2 weeks. ("No one to show" when the scope has no people.) |
| Loading | /yx/time/team while it loads |
| Phone | phone view, mobile app not built. At phone width the web page still shows the grid, not the design's list |

### TIM-21 · Leave card

| story (sub-page) | where it shows live |
|---|---|
| Employee · ledger and projection | gap: there is no "my leave card" page (the /me/leave API has no ledger for self). My leave shows the balances |
| HR | /yx/time/balances: Employee picker, balance cards, History (ledger) timeline. The projection card is not shown, because the API gives no pending dates per person (gap) |
| HR · adjust with reason | /yx/time/balances → Adjust balance (only when canAdjust): Direction, Days, Reason. Post pressed too early shows field errors; a server refusal stays in the dialog |
| Phone | phone view, mobile app not built |

### TIM-22 · Comp-off claim

| story (sub-page) | where it shows live |
|---|---|
| Claim | feature not built: no claim for working on a holiday. Comp-off is only credited from overtime settled as comp-off (/yx/time/overtime) |
| No eligible days | feature not built |
| Sent | feature not built |
| Phone | phone view, mobile app not built |

### TIM-23 · Optional holidays

| story (sub-page) | where it shows live |
|---|---|
| Choose 2 of 5 | /yx/time/leave → "Optional holidays · N chosen · M left": tick and Save choices (each change goes to choose / unchoose) |
| At the limit · others locked | /yx/time/leave → Optional holidays at the calendar's limit: the others lock with "Limit reached · untick one to swap" |
| Prorated after transfer | gap: the API has no prorated limit after a transfer |
| Phone | phone view, mobile app not built |

### TIM-24 · Encashment request

| story (sub-page) | where it shows live |
|---|---|
| Request · amount preview | feature not built: the API has no encashment request (only an `encashable` flag at year end) |
| Over what you can encash | feature not built |
| Request already waiting | feature not built |
| Phone | phone view, mobile app not built |

### TIM-25 · Long-absence status card

| story (sub-page) | where it shows live |
|---|---|
| Employee · maternity | feature not built: maternity is a leave type you can apply for, but there is no long-absence status (extend, early return) in the API |
| HR · sabbatical | feature not built |
| HR · long LWP | feature not built |
| Phone · maternity | phone view, mobile app not built |

### Counts

53 sub-pages in total: 25 live, 11 not built, 11 phone, 6 gaps.
- Gaps: TIM-17 Manager, TIM-17 HR, TIM-19 Manager, TIM-19 Approve, TIM-21 Employee, TIM-23 Prorated.

## C. Leave and attendance set-up

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/setup | LeavePoliciesScreen `live` (leave-admin.tsx) | TIM-28 · Leave policies | now the TIM-28 design (was the tabbed live TimeSetupScreen, deleted) |
| /yx/time/setup/types/[id] (new) | LeaveTypeEditorScreen `live` | TIM-27 · Leave type editor | now the TIM-27 design; opened from the "Leave types" menu on Leave policies (id or `new`) |
| /yx/time/setup/holidays (new) | HolidayCalendarsScreen `live` | TIM-26 · Holiday calendars | now the TIM-26 design |
| /yx/time/setup/year-end (new) | YearEndWizard `live` | TIM-29 · Year-end wizard | now the TIM-29 design |
| /yx/time/setup/locations (new) | GeofenceEditorScreen `live` | TIM-31 · Locations and geofence editor | now the TIM-31 design, plus the location's shift and weekly offs (Question: no design shows them) |

Menu (yx-nav.ts, not mine): only "Leave types & policies" → /yx/time/setup exists. The design's Time menu also has
"Holiday calendars", "Locations & geofences" (Time settings) and "Year-end". Until the coordinator adds those links,
the three new pages are reachable only by address.

### TIM-26 · Holiday calendars

| story (sub-page) | where it shows live |
|---|---|
| Chennai · Chennai office · rules | /yx/time/setup/holidays → a location tab: holidays table (weekday, date, due badge, type, "on a weekly off") and "Rules for this calendar" (optional holidays each person chooses; plus the half-day rule, Question). Add holiday dialog (name, date, type, half day) with field errors; Remove holiday (future only) with confirm. "Holiday on a weekly off" and "When someone moves" rules: feature not built |
| Clone · Clone to next year | feature not built (no clone or publish/draft in the API) |
| Template · Start from state template | feature not built (no state templates); the live empty tab offers "Add a calendar for <location>" instead |
| NoCalendar · Location without a calendar | /yx/time/setup/holidays → tab of a location with no calendar → "Add a calendar for <location>" |
| Empty | /yx/time/setup/holidays, company with no calendars (each tab as above); no locations at all → "No locations yet" |

### TIM-27 · Leave type editor

| story (sub-page) | where it shows live |
|---|---|
| Counting · Counting · live example | /yx/time/setup/types/<id> → Counting tab (weekly offs/holidays rule, applies to, half days) with the live example over the next weekend |
| Basics | → Basics tab: name, code (fixed once saved), kind (Question: kept from the old page), pay (paid/unpaid; "partially paid" not built), colour, in use. Save with a bad code / no name / paid "without pay" → field errors, Basics tab opens |
| Crediting | → Crediting tab: read-only, each policy's days and how it credits (set in the policy) |
| Rules | → Rules tab: notice days, least/most days, document after, below zero, HR approval above, medical. "Most days in a month" and "dates when no one can take it": feature not built |
| YearEnd · Year end | → Year end tab: each policy's carry-forward (read-only) and "can be cashed in". Encash limits and payout formula: feature not built |
| Notice · Absence & notice | feature not built |
| Statutory · Statutory template · maternity | feature not built (statutory types are not locked by law in the API) |

### TIM-28 · Leave policies

| story (sub-page) | where it shows live |
|---|---|
| List · Policies and rules | /yx/time/setup → table (policy, leave types, who gets it + dates, "Changes from" badge) and the law's minimums. Order arrows, grades, overrides and "people match no policy": feature not built |
| Open · Policy drawer | /yx/time/setup → click a policy (or New policy): entitlements (days, carry forward, credited, joiners' share), Applies from, Who gets this policy (remove a future one; Apply to dialog: scope + from, "Choose one." error); New policy without a name → field error |
| Empty | /yx/time/setup with no policies → "No leave policies yet" + New policy (templates not built) |
| Loading | /yx/time/setup while loading (also error with Retry, and no access) |

### TIM-29 · Year-end wizard

| story (sub-page) | where it shows live |
|---|---|
| Scope · Year-end · scope | /yx/time/setup/year-end → Scope: last day of the leave year (default 31 Dec last year) |
| Preview · Year-end · preview | → Preview: KPIs, per person balance → carried, lapse badge, search, "only people losing days"; failed preview → Try again |
| Review · Year-end · review | → Review step, Post year-end |
| Blocked · review, post blocked | → Review when nothing lapses ("Nothing lapses on that date…"). The "available from 1 Jan" lock: the date picker stops at today instead |
| PendingBlocked · pending requests | gap: the API has no pending-requests check for year end |
| Post · typed confirmation | → Post year-end → type LEAVE YEAR <year> → Post entries |
| Posted · posted | → after posting: "Year end is being posted" (stays, founder OK) |
| Transition · Leave-year change · scope | feature not built |
| TransitionPreview | feature not built |
| TransitionPosted | feature not built |

Letters and notices step: feature not built (left out live).

### TIM-31 · Locations and geofence editor

| story (sub-page) | where it shows live |
|---|---|
| Edit · Geofence and IP ranges | /yx/time/setup/locations → location picker, map of the point and radius, check-in mode, shift and weekly offs from a date (errors: start = end, no date), point and networks read-only with a link to Settings › Locations (where they are edited) |
| Multi · Multiple points | feature not built (one point per location) |
| Field · Field mode | → choose Field in Check-in mode, Save |
| IpError · Invalid IP range | gap: IP ranges are edited in Settings › Locations (org design), not here |

### TIM-42 · Holiday feed settings

| story (sub-page) | where it shows live |
|---|---|
| Settings · Subscriptions | feature not built (no holiday feeds in the API) |
| Review · Review before publish | feature not built |
| Off · Feeds off | feature not built |

### Counts

33 stories: live 20 (TIM-26: 3, TIM-27: 5, TIM-28: 4, TIM-29: 6, TIM-31: 2) · feature not built 11 (TIM-26: 2,
TIM-27: 2, TIM-29: 3, TIM-31: 1, TIM-42: 3) · phone 0 · gaps 2 (TIM-29 PendingBlocked, TIM-31 IpError).

## D. Rosters and shifts

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/roster | `RosterScreen live={…}` (roster.tsx) | TIM-05 Roster | now the TIM-05 design with real data; live copy `RosterPlannerScreen` deleted |
| /yx/time/shifts | `ShiftSwapSheet live={…}` (requests.tsx) | TIM-08 Shift change or swap (its desk page is "My shifts") | now the TIM-08 design with real data; live copy `MyShiftsScreen` deleted |
| /yx/time/shifts-setup | `ShiftEditorScreen live={…}` (roster.tsx) | TIM-06 Shift editor and patterns | now the TIM-06 design (Shift, Patterns tabs) with real data, plus 3 extra tabs with no design (Overtime, Timesheet projects, Night work); live copy `ShiftsSetupScreen` deleted |

### TIM-05 · Roster

| story (sub-page) | where it shows live |
|---|---|
| Draft (Manager · draft with conflicts) | /yx/time/roster, a week with unpublished changes: "Draft · N changes not visible to staff" badge, conflicts in the grid, server checks in "Law and rule checks" |
| Published | /yx/time/roster, a week with no drafts: "Published" badge |
| CopyWeek (Copy last week) | /yx/time/roster → Copy last week → confirm dialog (refusal shows in the dialog) |
| Swap (Swap shifts) | /yx/time/roster → Swap shifts → dialog with cover, rest, leave and night-consent checks (no role check: the API sends no roles) |
| Hr | /yx/time/roster as HR with roster.manage ("The people you plan" / "Everyone") |
| Staff (Employee · read-only) | gap: the API gives an employee only their own shifts, so the employee page is /yx/time/shifts (TIM-08 My shifts list), not the team grid |
| Empty (Empty week) | /yx/time/roster with no one to plan → "No one to plan" empty state (a week with people but no plan shows the grid on pattern defaults) |
| Loading | /yx/time/roster while loading |
| Failed (Error) | /yx/time/roster when the load fails → Retry |
| Phone (Phone · my shifts) | phone view, mobile app not built |

Inside RosterScreen the Open shifts and Bids tabs and the Auto-roster button: feature not built (hidden in live).

### TIM-06 · Shift editor and patterns

| story (sub-page) | where it shows live |
|---|---|
| Fixed (Fixed shift · preview) | /yx/time/shifts-setup → Shift tab: shift list, editor form, preview |
| Flexi (Flexi with core hours) | feature not built (shifts have no type or core hours in the API) |
| Split (Split shift) | feature not built (no split shifts in the API) |
| Night (Night shift · law notice) | /yx/time/shifts-setup → a shift ending next morning, or Night allowance on → law notice, "(next day)" |
| Patterns (Patterns · N-day cycle) | /yx/time/shifts-setup → Patterns tab: new pattern (weekly or N-day cycle), saved pattern with "Who follows it" and apply form, 14-day preview |
| SaveError (Save error) | /yx/time/shifts-setup → Save shift with half day ≥ full day (or other missing fields) → error summary + field error |
| Saved (Saved (effective dated)) | /yx/time/shifts-setup → Save shift → toast "Shift times saved"; a future-dated change shows the "Changes from <date>" badge |

Extra live tabs with no design (Question below): Overtime (rules list + add drawer), Timesheet projects (list + drawer), Night work (safeguards, consents, opt-ins + drawers).

### TIM-08 · Shift change or swap

| story (sub-page) | where it shows live |
|---|---|
| Request (Swap request) | /yx/time/shifts → Ask to swap on a day → "Shift change or swap" sheet (field errors on Send) |
| RestBlocked (Blocked · rest rule) | gap: the API does not check rest when a swap is asked (only night work and same shift) |
| NightBlocked (Blocked · no night-work consent) | /yx/time/shifts → Send → the server's night-work refusal shows in the sheet ("Not sent") |
| Consent (Colleague consent card) | the colleague sees "X asks to swap" on /yx/time/shifts; they agree or decline in Approvals (P03 step "Colleague agrees") |
| Accepted (Consent given) | Approvals (P03) after agreeing; /yx/time/shifts keeps "Swap pending" until the manager decides |
| Phone (Phone · request) | phone view, mobile app not built |
| PhoneConsent (Phone · consent card) | phone view, mobile app not built |

"Change my shift" (the second Request option): gap, the API has swaps only; live shows the swap form only.

### TIM-34 · Auto-roster

| story (sub-page) | where it shows live |
|---|---|
| Draft (Coverage and draft) | feature not built |
| Demand (Demand editor) | feature not built |
| Running (Generating) | feature not built |
| Explain (Unfilled slot explained) | feature not built |
| Approved (Approved · publish) | feature not built |

### TIM-35 · Open shifts and bids

| story (sub-page) | where it shows live |
|---|---|
| Manager (Manager · open shifts) | feature not built |
| Empty | feature not built |
| Loading | feature not built |
| Phone (Phone · eligible open shifts) | phone view, mobile app not built |
| PhoneClaimed | phone view, mobile app not built |
| PhoneBid | phone view, mobile app not built |
| PhoneNone | phone view, mobile app not built |

### TIM-38 · Standby and call-out

| story (sub-page) | where it shows live |
|---|---|
| Manager (Standby slots and call-out log) | feature not built |
| Moved (After the shift is moved) | feature not built |
| LogCallOut (Log call-out · rest check) | feature not built |
| Phone (Phone · employee on standby) | phone view, mobile app not built |
| PhoneMoved | phone view, mobile app not built |

### TIM-39 · Block-leave planner

| story (sub-page) | where it shows live |
|---|---|
| Hr (HR · compliance view) | feature not built |
| Manager | feature not built |
| Suspend (Access suspension confirmation) | feature not built |

### TIM-40 · Licence requirements

| story (sub-page) | where it shows live |
|---|---|
| List (Requirements) | feature not built |
| Blocked (Roster block · expired licence) | feature not built |
| Empty | feature not built |
| Loading | feature not built |

### TIM-41 · Hybrid office days

| story (sub-page) | where it shows live |
|---|---|
| Manager (Manager · team plan) | feature not built |
| Compliance (Weekly compliance) | feature not built |
| Policy (HR · policy) | feature not built |
| Employee | feature not built |
| Phone (Phone · my office days) | phone view, mobile app not built |

### Counts

53 sub-pages: live 17 · feature not built 24 · phone view 10 · gaps 2 (TIM-05 Staff, TIM-08 RestBlocked).
Live 17 = TIM-05 8, TIM-06 5, TIM-08 4 (Consent and Accepted through Approvals). Also a gap inside TIM-08 Request: "Change my shift".

### Questions

- Question: Overtime rules, Timesheet projects and Night-work records have no design. They stay as extra tabs of the live TIM-06 screen, built from the same Card / Drawer / table parts. They need designs.
- Question: should an employee see the whole team's published roster (TIM-05 Staff)? The API gives only their own shifts today, so /yx/time/shifts shows TIM-08's list.
- Question: a saved pattern can't be edited (the API has create, apply and remove only). Live shows its days read-only and says "add a new one for a new rhythm".
- Question: "Change my shift" (ask the manager for another shift, no colleague) and a rest check on swap requests are not in the API.

## E. Overtime, periods, reports, timesheets, Kit

Builder E, 29 Oct 2026.

### 1. Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/overtime-review | `OtReviewScreen` with `live` (requests.tsx) | TIM-09 · OT review | Now the TIM-09 design: the design's table (Employee, Worked, OT, Legal limit) with real claims, month arrows, and the "Override limit" dialog (reason of 10+ letters, field error). The old live copy `OvertimeReviewScreen` is deleted. |
| /yx/time/overtime | `OtReviewScreen` with `mine` (requests.tsx) | none of its own; TIM-09's parts | Question: My overtime has no design. It is shown with TIM-09's parts: the same table style for "Days you can claim" and "My claims", a claim dialog, and Withdraw. The old `MyOvertimeScreen` is deleted. (TIM-07's "OT pre-approval" request is a different thing: asking before the work.) |
| /yx/time/periods | `PeriodsScreen` with `live` (requests.tsx) | TIM-11 · Periods | Now the TIM-11 design: month cards per legal entity, the pre-lock checklist drawer (from the API's pre-flight), the lock confirmation, the lock summary, and the reopen request dialog. The old live `PeriodsScreen` is deleted. |
| /yx/time/registers | `AttendanceReportsScreen` with `live.report = 'registers'` (ops.tsx) | TIM-16 · Attendance reports (Form 25 register card) | Now the TIM-16 design: one statutory register card per establishment with Download PDF / Download Excel, a Month picker, "Month locked" / "Draft" badges, and a toast when a download is done. The old `RegistersScreen` is deleted. |
| /yx/time/payroll-feed | `AttendanceReportsScreen` with `live.report = 'feed'` (ops.tsx) | TIM-16 · Attendance reports (report table) | Now the TIM-16 design: the report table (with totals and hideable columns) of the feed, Legal entity and Month pickers, "Frozen" / "Preview" badge. The old `PayrollFeedScreen` is deleted. |
| /yx/time/timesheet | `TimesheetScreen` with `live` (ops.tsx) | TIM-15 · Timesheets | Now the TIM-15 design: the shared timesheet grid, Save draft (toast), Submit / Resubmit week with the grid's checks, "Recall to edit" for a sent week, week arrows (the next-week arrow at this week says why). The old `MyTimesheetScreen` is deleted. |

### 2. Design groups

#### TIM-09 · OT review

| story (sub-page) | where it shows live |
|---|---|
| Manager · own reports (`Manager`) | /yx/time/overtime-review as a manager: the team's claims for the month. Gap: Approve / Give comp-off / Reject are not on this page; claims are decided in Approvals (the API has no decide call here). Question: move the decisions here? |
| Plant head · over the legal limit (`PlantHead`) | /yx/time/overtime-review: a claim over the limit shows the red "Over the limit" badge and its minutes; the manager sees its status. |
| HR (`Hr`) | /yx/time/overtime-review as HR (scope: everyone). |
| HR · override limit with reason (`Override`) | /yx/time/overtime-review → "Override limit" on a claim HR may pay → dialog; Pay pressed without a 10-letter reason shows the field error. |
| Convert to comp-off (`CompOff`) | Gap: no comp-off decision in the API; how a claim is settled comes from the policy and shows as "Comp-off N days" in the OT column. |
| Empty (`Empty`) | /yx/time/overtime-review, a month with no claims: "No overtime to review". |
| Loading (`Loading`) | /yx/time/overtime-review while loading (table loading). |
| Error (`Failed`) | /yx/time/overtime-review when the call fails: error with Retry. No access: "You don't have access to overtime". |

#### TIM-11 · Periods

| story (sub-page) | where it shows live |
|---|---|
| HR · month cards (`Hr`) | /yx/time/periods: month cards per legal entity (newest first), stage badge, "Locked 2 Sep 2026 by …". Year arrows: Next at this year and Previous before 2025 stay clickable and say why (toast). |
| Payroll Admin (`PayrollAdmin`) | Gap / Question: the API has one step (whoever holds attendance.lock locks, with a fresh sign-in step); there is no HR-sends, Payroll-Admin-approves split. |
| Pre-lock checklist · blocked (`Checklist`) | /yx/time/periods → "Pre-lock checklist" on an open month: exceptions and each waiting request kind with counts; "Lock the month" pressed says "Settle what is still waiting…" and focuses the list. |
| October · month not over (`NotEnded`) | /yx/time/periods → current month card "Can be locked from the 2nd of the next month"; in its checklist, Lock pressed says "October 2026 can be locked from 2 Oct 2026." |
| HR · send for payroll approval (`Send`) | Gap / Question: no send-for-approval step in the API (see Payroll Admin). |
| Payroll Admin · lock with typed confirmation (`Lock`) | /yx/time/periods → checklist (all done) → "Lock the month" → confirmation dialog → the web app asks for the fresh second step. Question: a plain confirmation instead of typing the name, because the second sign-in step already guards it. |
| Lock summary · filed month (`Summary`) | /yx/time/periods → "Lock summary" on a locked or filed month: lock date and person, stage, whether reopen is allowed. |
| Reopen request · September locked 1 Oct (`ReopenAllowed`) | /yx/time/periods → "Request reopen" on a locked month (card or summary) → dialog; reason of 10+ letters; sent → toast; the card then shows "Reopen asked · Waiting for two approvals". A filed month shows "Filed: corrections only". |

#### TIM-15 · Timesheets

| story (sub-page) | where it shows live |
|---|---|
| Desk · weekly grid (`Draft`) | /yx/time/timesheet, this week as a draft: grid, Save draft (toast), Submit week (an empty week shows "Fix these before sending"). |
| Submitted · last week (`Submitted`) | /yx/time/timesheet, a sent week: "Waiting for the project manager." + "Recall to edit". |
| Sent back with reason · last week (`SentBack`) | /yx/time/timesheet, a sent-back week: "Resubmit week". Gap: the API does not return the reason or the queried cell, so they are not shown. |
| Approved · last week (`Approved`) | /yx/time/timesheet, an approved week: "Approved by the project manager." |
| Locked · August week (`Locked`) | /yx/time/timesheet, a week in a locked month (grid locked); a week partly locked names the locked days. Gap: "Add correction" for a locked week is not in the API. |
| Phone · sent back, resubmit (`PhoneSentBack`) | Phone view, mobile app not built. |
| Phone · day list, submit week (`Phone`) | Phone view, mobile app not built. |

Also not live from this design: "Copy last week" (the API returns only last weeks' totals, not their lines) and "Pre-fill from my tools" (TIM-43, not built).

#### TIM-16 · Attendance reports

| story (sub-page) | where it shows live |
|---|---|
| Late and early (`LateEarly`) | Feature not built (no late/early report in the API). |
| Overtime (`Overtime`) | Feature not built (no overtime report; claims are on /yx/time/overtime-review). |
| Form 25 register (`Form25`) | /yx/time/registers: the register card per establishment with Download PDF / Excel (toast when done; "Draft" when the month is not locked). Gap: the register rows are only in the download, not on the page. |
| Women night-shift register (`NightRegister`) | Feature not built (the API's registers are muster and leave only; night shifts are a column of the payroll feed). |
| August 2026 (locked) (`August`) | /yx/time/registers ("Month locked") and /yx/time/payroll-feed ("Frozen 2 Oct 2026") with a locked month picked. |
| Manager · my team (`Manager`) | Feature not built (team late/early report). |
| Empty · no rows for these filters (`Empty`) | /yx/time/registers with no establishment in scope; /yx/time/payroll-feed with no legal entity or no people. |
| Loading (`Loading`) | Both pages while loading; errors show Retry, no access says who grants it. |

#### TIM-30 · Leave reports

| story (sub-page) | where it shows live |
|---|---|
| Balances (`Balances`) | Design only, feature not built (no leave reports page; HR balances per person are on /yx/time/balances). |
| Leave taken (`Taken`) | Design only, feature not built. |
| Unpaid leave (LOP) to payroll (`Lop`) | Design only, feature not built (LOP days per person are in the payroll feed). |
| Payroll · liability (`Liability`) | Design only, feature not built. |
| Negative balances (`Negative`) | Design only, feature not built. |
| Ledger (`Ledger`) | Design only, feature not built (a person's ledger is on their leave card). |
| Loading (`Loading`) | Design only, feature not built. |
| Error (`Failed`) | Design only, feature not built. |

#### TIM-37 · Industrial-action event

| story (sub-page) | where it shows live |
|---|---|
| Record event (`Form`) | Design only, feature not built (no strike / lockout / lay-off in apps/api/src/time). |
| Record event · legal picked (`Legal`) | Design only, feature not built. |
| Event record · lay-off (`Record`) | Design only, feature not built. |
| Event record · legality not set (`RecordUndetermined`) | Design only, feature not built. |

#### TIM-43 · Timesheet pre-fill from my tools

| story (sub-page) | where it shows live |
|---|---|
| Suggestions · rule and AI (`Suggestions`) | Design only, feature not built (no tool connections or suggestions in the API). |
| Connect tools (`Connect`) | Design only, feature not built. |
| No suggestions (`None`) | Design only, feature not built. |
| Phone (`Phone`) | Phone view, mobile app not built. |

#### Kit (time-kit.stories.tsx: shared parts, not pages)

| story (part) | live screens that use it |
|---|---|
| ClockCard · not clocked in (`ClockNotIn`) | Home clock card (/yx/home) and /yx/time/attendance (builder A). |
| ClockCard · working (`ClockWorking`) | Same as above. |
| ClockCard · on break (`ClockBreak`) | Same as above. |
| ClockCard · clocked out (`ClockOut`) | Same as above. |
| ClockCard · outside office (`ClockOutside`) | Same as above (geofence check). |
| ClockCard · shift not started (`ClockEarly`) | Same as above. |
| ClockCard · device not approved (`ClockDevice`) | Same as above. |
| ClockCard · page variant (`ClockPage`) | /yx/time/attendance. |
| ClockCard · narrow (`ClockPhone`) | Phone view, mobile app not built. |
| AttendanceMonth + legend (`Month`) | /yx/time/attendance calendar (builder A). |
| AttendanceMonth · compact (`MonthCompact`) | /yx/time/attendance on narrow widths, muster person month. |
| PunchList (`Punches`) | Inside the day card (DayCardBody) on /yx/time/attendance and the muster day. |
| PunchList · empty (`PunchesEmpty`) | Same, a day with no punches. |
| ShiftBar (`Bar`) | Inside the day card; the roster design (roster.tsx). |
| ShiftBar · in progress (`BarLive`) | Inside the day card for today. |
| GeoMap · pin, accuracy, geofence (`Map`) | Designs only today (field force, geofence editor); not on a live page. |
| GeoMap · trail and visits (`MapTrail`) | Field-force design only, feature not built. |
| GeoMap · editable (`MapEditable`) | Geofence editor design only, feature not built. |
| CameraFrame · states (`Camera`) | Field visit design only, feature not built. |
| DayCardBody (`DayCard`) | /yx/time/attendance day card and the muster day (builder A). |
| DayCardBody · regularisation pending (`DayCardPending`) | Same, a day with a fix waiting. |
| DayCardBody · on duty at Hosur plant (`DayCardOnDuty`) | Same, an on-duty day. |
| DayCardBody · locked month (HR) (`DayCardLocked`) | Muster day card for HR in a locked month. |
| DueBadge · relative dates (`Due`) | Leave and roster designs that are live (builders B/D); my live screens do not use it. |

### 3. Counts (groups TIM-09, 11, 15, 16, 30, 37, 43)

- Sub-pages live: 22 (TIM-09: 7, TIM-11: 6, TIM-15: 5, TIM-16: 4)
- Feature not built: 19 (TIM-16: 4, TIM-30: 8, TIM-37: 4, TIM-43: 3)
- Phone view: 3 (TIM-15: 2, TIM-43: 1)
- Gaps: 3 (TIM-09 comp-off decision; TIM-11 Payroll Admin and HR-send steps). Partial gaps noted in the rows: OT approve/reject live in Approvals, sent-back reason, locked-week correction, register rows on the page.
- Kit: 24 shared parts (listed above), not counted as pages.

## F. Field force (no live page)

### TIM-32 · Field-force map

| story (sub-page) | where it shows live |
|---|---|
| Manager · live map | feature not built (no field tracking in the API) |
| HR · all field staff | feature not built |
| Person trail and visits | feature not built |
| Integrity flag | feature not built |
| Tracking off for group | feature not built |
| Person not checked in | feature not built |
| Consent withdrawn · no trail | feature not built |

### TIM-33 · Visit check-in and beat plan

| story (sub-page) | where it shows live |
|---|---|
| Consent (first use) | phone view, mobile app not built |
| Beat plan · tracking banner | phone view, mobile app not built |
| Visit check-in · inside site | phone view, mobile app not built |
| Visit · outside site | phone view, mobile app not built |
| Camera photo | phone view, mobile app not built |
| Distance → draft mileage | phone view, mobile app not built |
| Consent withdrawn | phone view, mobile app not built |
| Web app · only while open | phone view, mobile app not built |
