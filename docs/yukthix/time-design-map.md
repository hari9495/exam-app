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
| Attendance (TIM-01…04, 07, 10, 12…14, 36, Extra ×2) | 112 | 0 | 19 | 0 |
| Leave (TIM-17…25) | 48 | 0 | 11 | 0 |
| Set-up (TIM-26…29, 31, 42) | 35 | 0 | 0 | 0 |
| Rosters and shifts (TIM-05, 06, 08, 34, 35, 38…41) | 46 | 0 | 10 | 0 |
| Overtime, periods, reports, timesheets (TIM-09, 11, 15, 16, 30, 37, 43) | 49 | 0 | 3 | 0 |
| Field force (TIM-32, 33) | 7 | 0 | 9 | 0 |
| **All 45 design groups (349 sub-pages counted)** | **297** | **0** | **52** | **0** |

3 Nov 2026 (branch `feat/yukthix-flexi-split`): TIM-06 Flexi and Split made live; recounted by script over the story rows (same rule):
Rosters 44 → 46 live, 2 → 0 not built; All 291 → 293 live, 4 → 2 not built (TIM-02/Attendance 1 and Set-up 1 left), 52 phone, 0 gaps.

Counted from the stories and the rows below by script (29 Oct 2026, after rosters/devices/field, the roster fixes and founder decisions 1-7 were merged into the test app). Section counts further down may be older; this table is the current one.
Recounted by script on 30 Oct 2026 (time small items: TIM-13 Training, Leave, UnknownCode and the new TrainingNone story live; TIM-26 Clone and
Template live). The script reads every story row under each TIM heading; it found the Set-up row stale (26 live, 8 not built
before this work, as the Set-up section counts say), so Set-up is now 28 / 6 and All is the sum of the rows.

30 Oct 2026 (branch `feat/yukthix-time-gaps`): 9 gaps made live, recounted by script over the story rows (each row's
"where it shows live" starting with "gap" / "feature not built" / "phone view", else live): Attendance gaps 6 → 2
(Manager · one person, OutsideNetwork, ChoseWfh, ShiftNotStarted live), Leave 3 → 0 (TIM-17 Manager, TIM-19 Manager ×2),
Set-up 1 → 0 (TIM-31 IpError), Rosters 1 → 0 (TIM-39 Suspend). Gaps left: TIM-13 UnknownCode (another builder's) and
Extra · today WithNote (migration written, not applied).

30 Oct 2026 (branch `feat/yukthix-time-followups`, the founder's "all ok" follow-ups): recounted by script over the story
rows (same rule as above). New stories, all live: TIM-13 MenuLeaveOff, TIM-14 Training / TrainingAdd / TrainingEdit /
TrainingCancel / TrainingEmpty, TIM-19 SendBack and SentBack. Extra · today WithNote made live (the last gap). The script
found Set-up at 29 live / 6 not built (the table had 27 / 8), so the table now matches the rows: 337 sub-pages, 273 live,
12 not built, 52 phone, 0 gaps. Outside Time, new stories also live: SEC-01 "Sign in · access paused for block leave" and
PLT-04 "Approvals · send back for changes".

2 Nov 2026 (branch `feat/yukthix-time-q34`, follow-up items 3 and 4): three new TIM-03 stories, all live (Note, NoteMgr,
NoteHr · punch with a note): Attendance 96 → 99 live, all 337 → 340 sub-pages, 273 → 276 live. Expense send back has no
new story (the claim page and PLT-04 SendBack already drew it).

2 Nov 2026 (branch `feat/yukthix-time-leave-rules`): recounted by script over the story rows (timecount3: a row whose
"where it shows live" starts with "gap" or "phone view", or says "feature not built", is not live). Made live: TIM-03 OnDuty,
TIM-07 OnDuty, TIM-27 Notice and Statutory, TIM-29 Transition, TransitionPreview and TransitionPosted; the TIM-27 Rules and
Year end rows no longer have parts not built. Attendance 99 → 101 live, Set-up 29 → 34; all 340 sub-pages: 283 live, 5 not
built (TIM-07 Ot, TIM-31 Multi, two roster stories, Extra · today one), 52 phone, 0 gaps.

2 Nov 2026 (branch `feat/yukthix-time-ot-preapproval`, founder follow-ups): TIM-07 Ot made live and a new TIM-07 story
(OnDutySentBack, live). Recounted by script (timecount3): 341 sub-pages, 285 live, 4 not built, 52 phone, 0 gaps; Attendance 101 → 103 live, 2 → 1 not built.

2 Nov 2026 (branch `feat/yukthix-ot-muster`, founder answers on overtime pre-approval, item 1): five new TIM-02 stories, all
live (Manager · team muster; Pre-approve overtime, filled in, pressed too early, refused). Recounted by script (timecount3):
346 sub-pages, 290 live, 4 not built, 52 phone, 0 gaps; Attendance 103 → 108 live. Manual tests MT-TIM-L-31..34.

2 Nov 2026 (branch `feat/yukthix-time-points-devices`): TIM-31 Multi (several check-in points) and Extra · today DeviceNotApproved (web clock-in from an approved computer) made live, plus two new TIM-14 stories (Computers · new computer request, Computers · remove a computer's approval), both live. Recounted by script (timecount3 over the story rows; the OT group's #### sections kept from the table): Attendance 109 → 112 live, 1 → 0 not built; Set-up 34 → 35 live, 1 → 0; all 349 sub-pages: 295 live, 2 not built (the two roster stories: flexi and split shifts, founder decision), 52 phone, 0 gaps. Manual tests MT-TIM-L-41..48.

Kit (24 stories) are shared parts, not pages; section E lists which live screens use them.

## Founder decisions, 29 Oct 2026 (all eight suggestions accepted: "all OK")

1. **Long absence and block dates.** Design a "Record long absence" dialog on the HR leave home and a "Company block dates"
   card on the leave policy page, in the house style, then make both live.
2. **Notice period per leave type.** Each leave type has its own notice days, with a company default; sick leave defaults to 0.
3. **Leave liability report reads pay from Payroll.** Money shows only to people allowed to see pay (HR, Payroll); everyone else
   sees days only.
4. **Month lock: one step by default** (HR locks after a confirm and an authenticator code). Two steps (HR sends, Payroll
   approves) is a company setting. No change needed.
5. **A separate permission, "Approve attendance lock"** (`attendance.lock.approve`), given to the Payroll role by default; it no
   longer reuses `payroll.correction.approve`.
6. **Withdraw consent stays, with a proper design.** A confirm dialog says what happens: tracking stops, the location trail is
   deleted, attendance days stay (pay needs them). Same rule for the field-force tracking consent.
7. **Design "Reopen a locked month"** (reason + authenticator code, audit-logged) **and a list of past strikes and lockouts**,
   then make both live.
Status (branch `feat/yukthix-time-decisions-att`): 5 done (key `attendance.lock.approve`, migration `20261305000000_time_decisions_att`);
6 done (one designed dialog for TIM-36 and TIM-33; the server deletes the trail, keeps the days, audits counts); 7 done (TIM-11
"Open the month again" for a frozen month; TIM-37 "Past events" list). Rows below say where each story shows.

8. **Menu: "Registers"** (legal forms for inspectors) **and "Attendance reports"** (numbers for managers). No change needed.

### Founder answers A and B, 29 Oct 2026 (both "yes"; builder "timeleave", branch `feat/yukthix-time-leave-onbehalf`)

**A. Payroll reads the leave liability report, least privilege.** New key `leave.liability.view` ("View leave liability"),
migration `20261306000000_leave_liability_view` (adds the key; roles that follow the Payroll Admin template get it at
start-up, the demo seeds carry it; role template history regenerated). With it and without `leave.view`: `GET
hr/leave-report?report=liability` and its export only (every other report 403 "You can open the leave liability report
only."; the leave home and leave cards 403); scope (entity/location grants) as for `leave.view`; money only where the
person holds `employee.salary.view` (Payroll Admin does). A filter naming another company's entity, location or
department is 404 (every report). Web: menu link **"Leave liability"** (people with `leave.view` keep "Leave balances");
the page opens on the liability report with a one-report picker and no "Open leave card".

**B. "Apply for someone" is live** on /yx/time/leave-home (TIM-17 HR, the design's button) for people with
`leave.balance.adjust`; the drawer is the employee's TIM-18 live drawer with an Employee field first (one component).

| rule | source | setting · default |
|---|---|---|
| HR applies only for people in their `leave.balance.adjust` scope; never their own record (403 "Apply for your own leave in My leave."); never while acting for someone else (403); another company's person 404 | product (P02) | — |
| Only that person's leave types (their policy) are offered, with their balances; the summary is the server's own rules for that person | product | — |
| The notice a type asks for is skipped when HR applies, and the approver sees "Applied by HR: N days' notice not needed" (audited `noticeSkipped`) | company | `leave.notice.on_behalf` · skip |
| **Decision: the request goes through the person's normal approval chain** (manager, then HR above the type's limit) with "Applied by: HR, on their behalf". A company may approve it at once instead, and only when the HR person also holds `leave.approve` over them (else it still goes to the chain); audited `approvedAtOnce` | company | `leave.on_behalf.approval` · chain |
| Every other rule is the employee's: balance, block dates, overlap, locked month, probation, notice period, certificate; refusals name the person ("Arjun Kumar already has leave on 3 Nov.") | product | — |

**API:** `GET /time/hr/leave/:employeeId` (the person, their types and balances, the approval route), `POST
/time/hr/leave/:employeeId/preview`, `POST /time/hr/leave/:employeeId`; all `leave.balance.adjust` in scope.
**States:** no person yet, their leave did not load, summary waiting for dates, refused (red box / "Not sent"), sent
(toast). **Spacing (script, 1278 x 635):** form blocks 16 px apart, one left edge (578) and one right edge (914), the
summary column on its own edge; drawer full height, no page scroll. Attachment: none in the design (a certificate
tick, as for the employee). **Tests:** e2e time-leave-decisions 29 (A 4, B 6 new); UI apply-for-live 6, liability-only 1.

### Feature sheet: decisions 1, 2 and 3, leave side (builder "timeleave", 29 Oct 2026, BUILD-STANDARD §1)

**Design first, then live** (the live page renders the same component):

| decision | design group · new or changed stories | live page |
|---|---|---|
| 1 Long absence | TIM-17 · "HR · record long absence", "HR · record long absence · leave in the way" (new); "HR" has the Record long absence button | /yx/time/leave-home → Record long absence (`RecordAbsenceDialog`, also in the design) |
| 1 Block dates | TIM-28 · "Company block dates · add", "Company block dates · none yet" (new); "Policies and rules" has the Policies / Company block dates tabs | /yx/time/setup → Company block dates tab (`BlockDatesCard`) |
| 2 Notice per type | TIM-27 · "Rules" (the notice field names the company default) | /yx/time/setup/types/<id> → Rules |
| 3 Liability | TIM-30 · "Payroll · liability" (daily pay, No pay set), "Liability · days only (no pay access)" (new) | /yx/time/balances → Report: Leave liability |

**Rules** (company choices are settings with a default; HR changes them in Settings › Company rules):

| rule | source | setting · default |
|---|---|---|
| A long absence (sabbatical, long leave without pay) is refused (409) while the person has leave waiting or approved on those days, or another long absence; nothing is cancelled silently, the leave is listed with "withdraw or cancel it first" | product | — |
| Refused (400) before the joining day, after the exit date, after the last working day of someone on notice, or in a month locked for attendance | product + P08 lock | — |
| Pay effect: the days are unpaid (payroll gets them as unpaid days); leave credits stop unless the company says so; maternity is unchanged (law) | company | `leave.long_absence.accrues` · no |
| Block dates stop the leave types HR ticks; none ticked = planned leave only. Sick leave is never stopped unless ticked; maternity leave can never be stopped (Maternity Benefit Act) | law + company | per block date · planned leave |
| A new block date never cancels leave already asked for or approved: the card lists those people ("their leave stays") and the audit row counts them | product | — |
| Planned leave on a block date is refused, or allowed with a note to the approver | company | `leave.block_dates.mode` · refused |
| Each leave type has its own "apply at least N days ahead"; a type without a number uses the company default; sick leave without a number asks for none. Stored numbers are kept (no data change); new types start blank | company | `leave.notice_days.default` · 0 |
| The refusal says the fact and the next step: "Earned leave needs 7 days' notice. Pick a date on or after 12 Nov 2026, or ask your manager." | product | type rule `noticeMode` · refused |
| HR applying for someone (`POST hr/leave/:employeeId`) skips the notice; the approver sees "Applied by HR: 7 days' notice not needed" and the audit row records it | company | `leave.notice.on_behalf` · skip |
| Liability = unused days of the leave types that can be cashed in × daily pay; a negative balance counts as 0 | product | — |
| Daily pay = monthly pay from Payroll (`payOn`, the compensation in force today, read through the pay guard) on the encashment basis ÷ the divisor; named on the report | company | `payroll.leave_encashment_basis` · Basic + DA; `leave.liability.divisor` · 26 (or 30, or the days in the month) |
| No pay set up → "No pay set", never 0 | product | — |

**Who** (checked on the server): Record long absence and its check, HR applying for someone: `leave.balance.adjust` in scope,
never one's own record, never while acting for someone else (403); another company's person → 404. Block dates:
`leave.settings.manage`. Liability: `leave.view` for the rows; the money fields only for the legal entities where the
viewer holds `employee.salary.view` (others get days only and the API sends no money fields; the export the same).
Managers and employees: refused.

**States:** dialog empty / checking / effect / problems / not checked (Retry by changing a field); card loading, could
not load, none yet, list, removed; report with money, days only, No pay set. **Edge cases:** two HR admins recording at
once (per-person lock), double click on Add block dates (409 "already there"), very large reports (pay read per row of
the page; export up to 10,000 rows).

**API routes** (all /api/v1/time): `GET hr/long-absences/check`, `POST hr/long-absences` (now with the checks),
`POST hr/leave/:employeeId`, `GET|POST setup/block-dates` (`leaveTypeIds`, `affected`, `types`, `entities`,
`locations`), `GET hr/leave-report?report=liability` and its export. Migration `20261305100000_leave_block_types`
(adds `leave_block_dates.leave_type_ids`, empty = planned leave only). No external provider.

Later on 29 Oct ("both OK", then "OK"): the Ledger and LOP month picker stays in the page header beside the report picker; "Adjust balance" is live on the HR leave home (design TIM-17 HR). It loads only the chosen person's balances (`GET people/:id/balances`). HR can pick themselves, and the server refuses that, as Apply for someone does.

## Founder answers, 2 Nov 2026 (punch note and expense send back, "all ok")
(1) no company switch for expense send back for now; add one if a company asks; (2) an expense rejection from the
approvals inbox needs at least 3 letters too, as on the claim page (done); (3) a manager or HR sees the note on a refused
punch (already so).

## Founder answers, 30 Oct 2026 (Time follow-up questions, "all ok")
(1) training "Who" is who attends (everyone at a location, or chosen people); a trainer name field later if needed;
(2) a sent-back leave request that is resent goes through the whole approval chain again; (3) expense claims move onto
the shared approvals-engine "send back" decision, as its own small task; (4) the employee sees their punch note on the
day card: a small design addition first, then live.

### Follow-up items 3 and 4 (built 2 Nov 2026, branch feat/yukthix-time-q34)

| item | where it shows live | rules |
|---|---|---|
| (4) Punch note on the day card | TIM-03 Note, NoteMgr, NoteHr (rows below) | The note comes with the day card (GET /time/people/:id/days/:on, scoped by `mustSee`: self, the manager, `attendance.view` in scope); no new route. Stored once with the punch, never changed |
| (3) Expense claims: Send back for changes | /yx/expenses/claims/:id (approver: Send back → "What should change"; employee: the note, the step shows "Sent back", Send for approval sends it again) and the approvals inbox (Send back) | The approvals engine's own `send_back` decision (no more reject plus a flag; column `send_back_pending` dropped by migration 20261311200000_expense_send_back_engine). Reason required, at least 3 characters (the expense rule, also from the inbox). Only the holder of the open task (others 403 / 404). Resend = submit again: every check again, a new request, the whole route from the manager. Audit like leave: `workflow.request.sent_back`, `expense.claim.sent_back` (reason), `expense.claim.resent` (previous and new request). The employee is told "sent back for changes", no longer "not approved". Toasts: "Claim sent back to <name> for changes", "Claim sent again. Approval starts over." No setting: a claim could always be sent back (leave has `leave.send_back`) |

## Founder answers, 30 Oct 2026 (Time follow-ups, "all ok")
(1) "Clock in as WFH" on by default, HR can turn it off; (2) check-in opens any time by default, a company may set a
limit; (3) a person paused for block leave sees "Your access is paused for block leave until <date>", not "deactivated";
(4) managers get "Send back for changes" on leave, as its own task; (5) HR adds training sessions on a "Training" tab of
Devices and kiosks (design story first); (6) a kiosk where leave is off hides "Apply leave"; (7) comp-off for a holiday on
a weekly off follows each person's roster, not the location; (8) removing a holiday gives back leave already booked on
it; (9) no entity-AND-grade policy rule for now. Also pending: WithNote (punch note) needs migration
docs/yukthix/pending-migrations/20261310000000_punch_note.

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
| Manager · Manager · team | /yx/time/today as a manager (their reports, never themselves) |
| Hr · HR · entity | /yx/time/today with attendance.view (the top bar's legal entity narrows it) |
| Nudged · Nudge sent | /yx/time/today → Nudge (once a day per person; toast, then "Nudged") |
| FieldTab · Field tab | /yx/time/today → Field: people whose check-in was recorded as field. Gap: no map pins or trail (field force, TIM-32, not built) |
| OnSite · HR · on site now | /yx/time/today → On site now: checked in and not out, per site, with Download list. Gap: visitors (the Visitors module is not built) |
| Empty · no one rostered | /yx/time/today when no one in scope is rostered today |
| Loading | /yx/time/today while loading |
| Failed · Error | /yx/time/today when the call fails (Try again); no access says who grants it |
| Phone · Team today | phone view, mobile app not built |

### TIM-02 · Muster

| story (sub-page) | where it shows live |
|---|---|
| Open · Open month | /yx/time/muster |
| CellOpen · Cell → day card | /yx/time/muster → click a cell |
| Freeze · Freeze inputs | /yx/time/muster → Freeze inputs (attendance.lock; from the 2nd of the next month; refused while requests wait) |
| Frozen · all exceptions resolved | /yx/time/muster on a frozen month → Lock period (one-step flow) or Send for approval / Approve lock (two-step) |
| FrozenBlocked · lock blocked | /yx/time/muster on a frozen month with open exceptions: Lock says why and opens nothing |
| Lock · confirm | /yx/time/muster on a frozen month → Lock period: plain confirm plus the authenticator step (attendance.lock) |
| Locked (August) | /yx/time/muster on a locked month |
| Bulk · mark present with reason | /yx/time/muster → tick people → Mark present with reason (leave.approve; never one's own row) |
| Empty | /yx/time/muster with no one in scope ("No one on the muster") |
| Loading | /yx/time/muster while loading |
| Failed · Error | /yx/time/muster when the API fails (Try again) |
| Manager · Manager · team muster | /yx/time/muster as a manager (scope team): their reports and their own row; no freeze, lock or bulk; "Pre-approve overtime" in the header and on the day card of someone in their reporting line (founder 2 Nov 2026; the muster marks those people with `ot`) |
| PreApprove · Manager · Pre-approve overtime | /yx/time/muster (manager) → Pre-approve overtime: person (the reporting line only: direct and indirect reports, never a dotted-line report or oneself; one is chosen when there is one), date (today to that person's `attendance.overtime.plan_ahead_days`, from the muster), hours 0.5–12 in quarter hours, Paid overtime / Comp-off credit (Segment), reason; POST time/team/overtime/plans/:employeeId, approved at once and audited; toast "Overtime pre-approved for …" |
| PreApproveFilled · filled in | the same sheet filled: the effect "Up to N h OT · paid at the overtime rate" or "· comp-off credit" |
| PreApproveErrors · pressed too early | Pre-approve with fields missing: each field names what is missing, the first takes the focus; the button is never disabled |
| PreApproveRefused · refused | a server refusal stays in the sheet ("Not pre-approved" with the reason, e.g. that day already has overtime asked for; outside the line 404) |
| PreApproveFactory · factory worker (paid only) | a person covered by the Factories Act (the muster's `ot.factoriesAct`): Take as shows one choice, Paid overtime, with "… works under the Factories Act, so overtime is paid by law."; the server still refuses comp-off for them |

Live extras from the design file: month arrows (the top bar has no month on this page); next month that has not started says so in a toast.
Founder (29 Oct 2026): the lock is a plain confirm plus the authenticator step, here and on Periods (the Lock story is renamed "Lock · confirm").
Question: an HR "open again" for a month HR froze exists in the API (POST /time/periods/unfreeze, with a reason) but has no design, so no button.

### TIM-03 · Day card

| story (sub-page) | where it shows live |
|---|---|
| Employee · outside-geofence punch | /yx/time/attendance → a day; refused punches show "Not recorded: reason" (map left out, see gaps) |
| MissingOut · missing check-out, Fix | /yx/time/attendance → a missing day → Fix this day → TIM-07 sheet |
| OnDuty · field-recorded, offline punch | /yx/time/attendance → a day with approved on duty: the header "On duty" with the place and times (from the day card's `onDuty`); the same card for the manager and HR on the muster. The time counts as worked (2 Nov 2026). Offline punches stay with the device sync (TIM-10) |
| Late · Manager · late day | /yx/time/muster (manager) → a late day |
| Overtime · HR · overtime day | /yx/time/muster → a day with overtime: "N h · approved / pending approval / not claimed yet" |
| PendingOt · Manager · pending overtime | /yx/time/muster (the approver) → a day with a pending claim: Approve overtime / Reject (reason) / Give comp-off (weekly off or holiday) |
| Note · Employee · punch with a note | /yx/time/attendance → a day: a punch's note shows under it ("Note: …"); also today's punch list |
| NoteMgr · Manager · punch with a note | /yx/time/muster (manager) → a report's day: the note under the punch |
| NoteHr · HR · punch with a note | /yx/time/muster (attendance.view) → a day in scope: the note under the punch. Anyone who may not see the day gets 404, so never the note |
| HrFix · HR · resolve missing punch | /yx/time/muster (leave.approve) → a past missing day → Resolve with reason. Today is read only; a frozen or locked month says to record a correction |
| Phone | phone view, mobile app not built |
| PhoneOd · Phone · on duty | phone view, mobile app not built |

### TIM-04 · Attendance exceptions

| story (sub-page) | where it shows live |
|---|---|
| Hr · HR · queue | /yx/time/exceptions with attendance.view |
| Manager · team | /yx/time/exceptions as a manager (no Resolve; a waiting fix they approve shows Review request) |
| Resolve · HR · resolve with reason | /yx/time/exceptions → Resolve (one, or ticked rows): Present (times) or Absent, reason. Gap: "Deduct leave" is not offered (the leave API takes no HR leave on someone's behalf) |
| OnePerson · one person | /yx/time/exceptions?search=<name> |
| Empty · nothing open | /yx/time/exceptions when nothing is open |
| Loading | /yx/time/exceptions while loading |
| Failed · Error | /yx/time/exceptions when the call fails |
| Phone · manager | phone view, mobile app not built |

### TIM-07 · Attendance request

| story (sub-page) | where it shows live |
|---|---|
| Regularise · effect preview | /yx/time/attendance → Regularise a day (or Fix 6 Oct / Fix this day) |
| OverLimit · over monthly limit → HR | same, when the month's fixes are used up ("Goes to your manager, then HR") |
| LateRequest · locked date | /yx/time/attendance → a day of a frozen or locked month → the sheet sends a late correction (manager → HR → payroll; reason of 10+ letters; up to payroll.late_request_max_days, default 60) |
| Wfh · WFH | /yx/time/attendance → Request work from home (or ?request=wfh from Home) |
| OnDuty · with location | /yx/time/attendance → Regularise a day → On duty: date (attendance.on_duty.ahead_days 30 / back_days 60), Where, From, To (at least 30 min), reason; field errors and focus, effect preview, toast. To the manager (P03), who may approve, turn down or send it back for changes (attendance.on_duty.send_back, default on); a sent-back one shows in "Waiting for approval" with the reason → Change and send again, or Withdraw (2 Nov 2026) |
| Ot · OT pre-approval | /yx/time/attendance → New request → OT: date (today to attendance.overtime.plan_ahead_days, 30), planned hours (0.5–12, quarter hours), Paid overtime / Comp-off credit, reason; field errors and focus, effect, toast; to the manager (P03). Waiting ones are listed with Withdraw. A manager may plan it for a report (POST /time/team/overtime/plans/:id, approved at once, no screen yet). A later claim reads it: "Pre-approved up to N h" to the approver; without one, attendance.overtime.pre_approval decides (flag by default: "not pre-approved" on TIM-09; refuse; allow) (2 Nov 2026) |
| OnDutySentBack · On duty · sent back, change and send again | /yx/time/attendance → Waiting for approval → a sent-back on-duty request → View: what the manager asked, the request, the steps; Change and send again (the sheet starts from it) or Withdraw (confirm, toast) (2 Nov 2026) |
| Invalid · Validation error | the sheet → Send with a field missing (error on the field, focus moves there) |
| Sent | toast "Sent to your manager" and the sheet closes (house rule: done = toast) |
| Phone | phone view, mobile app not built |
| PhoneWfh · Phone · WFH | phone view, mobile app not built |

### TIM-10 · Device backfill correction

| story (sub-page) | where it shows live |
|---|---|
| Batch · Step 1 | /yx/time/device-punches (attendance.lock; the top bar's legal entity): the devices with punches waiting |
| Preview · Step 2 | → Preview: each day worked out with the punches and rolled back; frozen / locked days become corrections; Download all changes |
| Reason · Step 3 | → Reason (10+ letters, field error when pressed too early) |
| Review | → Review → Apply punches (the authenticator step; the reviewed count must still match) |
| Done · Applied | → after applying: the record with links to the muster and Periods (and the toast) |

### TIM-12 · Mobile check-in sheet

API ready for the phone app (/time/devices/me, me/bind, me/bind/withdraw, me/punch, me/sync): with
`attendance.phone_binding` on only the approved phone punches; every phone punch carries its own client_ref and is
made once (offline sync safe, 72 h back / 2 min ahead).

| story (sub-page) | where it shows live |
|---|---|
| Inside · ready | phone view, mobile app not built (API: POST /time/devices/me/punch) |
| Outside · blocked | phone view, mobile app not built (API: the punch's refusal) |
| Coarse · retry | phone view, mobile app not built |
| Early · shift not started | phone view, mobile app not built |
| Offline · before check-in | phone view, mobile app not built |
| OfflineSaved · waiting to sync | phone view, mobile app not built (API: POST /time/devices/me/sync, a result per punch) |
| Field · recorded, not restricted | phone view, mobile app not built |
| CheckedIn · check out | phone view, mobile app not built |
| Device · not bound | phone view, mobile app not built (API: GET /time/devices/me binding + request; PHONE_NOT_APPROVED refusal) |
| Selfie · not on yet | phone view, mobile app not built |

### TIM-13 · Kiosk

Live at /yx/kiosk (outside the app shell; set up with HR's one-time key). Small items (30 Oct 2026): training check-in, leave at the kiosk and the unknown-code refusal are live. Face sign-in: API only (kiosk.methods
"face", consent on record), provider: to decide (dev-fake adapter `KIOSK_FACE_PROVIDER`), no design story for it.

| story (sub-page) | where it shows live |
|---|---|
| Code · Employee code | /yx/kiosk: keypad with the company's code prefix ("KF-____") |
| UnknownCode | /yx/kiosk → type an unknown code, Next: "No one with code KF-9999 · Check the code on your ID card and try again" before the PIN (POST /kiosk/code; founder decision; company setting `kiosk.tell_unknown_code`, default yes; with it off the PIN answer stays the same as before) |
| Qr · Scan ID card QR | /yx/kiosk → Scan ID card (the tablet camera, where the browser can read QR codes) |
| Pin | /yx/kiosk after Next: "Enter your PIN" (no name before the PIN, same reason as UnknownCode) |
| WrongPin | /yx/kiosk: "Code or PIN didn't match. After 5 wrong tries a code locks for 15 minutes…" with Scan ID card |
| Menu | /yx/kiosk after the PIN: "Hello, <first name>", Check in / Check out, My requests, signing out in 30 s (the balance tiles and supervisor banner: gap, no kiosk API for balances yet) |
| CheckedIn | /yx/kiosk after Check in / out: badge, time, location, shift; clears itself |
| Training | /yx/kiosk → Training: today's sessions at this kiosk's location that are for everyone there or for this person (TIM-14 Training "Who"), title, time, room, Mark me present; before it opens "Training opens at 8:45 am" (setting `kiosk.training_opens_minutes`, default 15); marked once; HR adds, changes and cancels sessions on the TIM-14 Training tab (30 Oct 2026) |
| TrainingNone · Training · none today (new story) | /yx/kiosk → Training with no session today: "No training here today." |
| MenuLeaveOff · Menu · leave off at this kiosk (new story, 30 Oct 2026) | /yx/kiosk after the PIN where `kiosk.leave` is off for the person here: no Apply leave (GET /kiosk/person/today sends `leave`); the leave routes refuse too (KIOSK_LEAVE_OFF) |
| Leave · Apply leave | /yx/kiosk → Apply leave: earned, casual and comp-off with days left after pending requests, sick leave "ask <approver> to record", the next 10 days (weekly off / on leave / requested locked, holiday shift hint), first then last day, balance after, Send leave request → "Sent to <manager>"; the normal leave rules and approval chain (setting `kiosk.leave`, default on) |
| Status · Request status | /yx/kiosk → My requests: leave and attendance requests of the last 30 days with status |

### TIM-14 · Devices and kiosks

| story (sub-page) | where it shows live |
|---|---|
| Kiosks · HR · kiosks and last seen | /yx/time/setup/devices, Kiosks tab: health (stale 15 min, offline 1 h), check-ins today, Register kiosk (the one-time set-up key stays on screen until Done), Reset kiosk key |
| Binds · New phone requests | /yx/time/setup/devices, New phone requests tab: approve (the old phone is signed out in the same step) or reject with a reason |
| Phones · Employee phones | /yx/time/setup/devices, Employee phones tab (inactive: not seen for 30 days) |
| SignOut · Remote sign-out | /yx/time/setup/devices → Sign out remotely / Sign out phone: the phone stops and every sign-in of the person ends |
| SystemAdmin | /yx/time/setup/devices: the Entity column shows when the company has more than one legal entity (set-up is company-wide) |
| Empty | /yx/time/setup/devices with no kiosks: "No kiosks registered" |
| Loading | /yx/time/setup/devices while loading |
| Training · sessions (new story, 30 Oct 2026) | /yx/time/setup/devices, Training tab (`TrainingTab`, kit parts only): sessions from 7 days back and all coming ones, When (date, start – end at the location), Location, Who ("Everyone at <location>" or the people), Marked present, Status (Upcoming / On now / Ended / Cancelled). GET /time/devices/training (leave.settings.manage) |
| TrainingAdd · Training · add a session (new story) | same → Add training: title, location, room, date, start, end, Who (Segment: everyone at the location / chosen people, searched by name or code, GET training/people); pressed too early each field says what is missing and takes focus; POST /time/devices/training; toast "Training added · <title>" |
| TrainingEdit · Training · change a session (new story) | same → Edit (upcoming only): the form from the session; PUT /time/devices/training/:id with the version seen (409 "Someone else changed this session" stays in the form); a started session is refused; audited before → after; toast |
| ComputerRequest · Computers · new computer request (new story, 2 Nov 2026) | /yx/time/setup/devices, New phone requests tab: a computer asked for from My attendance today shows "Computer: Chrome on Windows"; Approve approves it at once (the person's phone and other computers stay as they are); Reject with a reason. Own computer: refused ("Another HR admin decides it") |
| ComputerRemove · Computers · remove a computer's approval (new story) | /yx/time/setup/devices, Employee phones tab: "Computer · Edge on Windows" with Remove approval → confirm ("can't clock in from this computer any more and stays signed in") → POST /time/devices/phones/:id/sign-out (no sign-in ends); toast |
| TrainingCancel · Training · cancel a session (new story) | same → Cancel session (upcoming or on now): confirm ("the N already marked stay on record"), POST training/:id/cancel; an ended one is refused with the reason in the dialog; toast |
| TrainingEmpty · Training · none yet (new story) | same tab with no sessions: "No training sessions" with Add training |

### TIM-36 · Presence-based attendance

| story (sub-page) | where it shows live |
|---|---|
| Employee · what was recorded | /yx/time/presence?view=me → a day decided by presence: first / last active, active time, what is recorded |
| Manager · status and total only | /yx/time/presence as a manager: status and active time, never times |
| Hr | /yx/time/presence with attendance.view: department filter, View consent record |
| NoConsent | /yx/time/presence?view=me without consent: Review and give consent (company switch attendance.presence must be on) |
| Withdrawn · Consent withdrawn · manager | /yx/time/presence → a day after the person withdrew: "Consent withdrawn on …" |
| WithdrawConsent · Employee · withdraw consent | /yx/time/presence?view=me → Withdraw consent (page header) → the designed dialog (tracking stops, presence trail deleted, attendance days stay; Withdraw consent / Keep it) → toast. Days presence decided before keep their status and active time (from the day record). |

Provider: to decide (Teams presence). The YukthiX desktop app posts the person's own states to POST /time/me/presence/signals; the app itself is not built. Withdraw consent sits on the page header, in the design too (founder decision 6).

### Extra · Attendance calendar

| story (sub-page) | where it shows live |
|---|---|
| Employee · September | /yx/time/attendance (header: New request opens the TIM-07 sheet with only the choices the person may use; founder 2 Nov 2026) |
| DayOpen · missing check-out | /yx/time/attendance → click a missing day |
| DayOpenPending · regularisation pending | /yx/time/attendance → a day with a waiting fix (View in "Waiting for approval"), Withdraw there |
| Locked · August | /yx/time/attendance on a frozen or locked month (the day card and the request sheet say so) |
| LockedDay · locked day card | /yx/time/attendance → a day of a locked month: "is locked", Raise late request |
| Manager · one person | /yx/time/muster → a cell → "Open <name>'s month" → /yx/time/muster/<id> (`AttendanceCalendarScreen personLive`): the person's month, totals, open exceptions (each opens the day card), Person picker (the muster's people), Export month. GET /time/people/:id/attendance (team or attendance.view scope; anyone else 404). Gaps 30 Oct 2026 |
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
| OutsideNetwork · blocked outside office network | /yx/time/attendance?view=today off the office network: "Not on <office> Wi-Fi" before any punch (GET me/attendance `network` from the request IP when the location's networks decide; a geofence still decides at the punch), Check again reloads; Clock in says why |
| ChoseWfh · outside → clock in as WFH | same, "Clock in as WFH" (setting attendance.wfh_same_day, default on): "WFH · needs <manager>'s approval · N of M used this month"; Clock in sends `wfh` and raises today's request with the punch. Rejected or withdrawn, the day engine leaves those web punches out (punches stay append-only). On duty: not offered (no on-duty request in the API) |
| ShiftNotStarted | /yx/time/attendance?view=today before check-in opens (setting attendance.check_in_opens_minutes, default any): "Your shift has not started yet · Clock-in opens at …"; the server refuses earlier check-ins with the same words |
| DeviceNotApproved | /yx/time/attendance?view=today with the company setting `attendance.web_device_approval` on (default off) on a computer HR has not approved: "This computer isn't approved for clock-in · Use your approved device, or ask HR to approve this one", Ask HR to approve → POST /time/me/web-device (self; one request per computer, a repeat answers the same one; toast "Request sent to HR") → "Requested · Request sent to HR · this computer"; HR approves, refuses or removes the approval on TIM-14 (Computers stories). The computer is the sign-in device cookie (yx_device); only its SHA-256 is stored. A punch from an unapproved computer is refused (403 DEVICE_NOT_APPROVED, same words) and audited (time.web_device.punch_refused); requests, approvals, refusals and removals are audited. Migration 20261410000100_web_device_approval (2 Nov 2026) |
| WithNote · Note open | /yx/time/attendance?view=today once today has a punch → Add note: the note (1–200 characters, trimmed; Save with nothing typed says "Type a note") goes with the next punch (POST /time/me/punch `note`, kept with the punch and never changed; migration 20261310200000_punch_note); a refused punch keeps it for the retry (30 Oct 2026) |
| Live · ticking clock | /yx/time/attendance?view=today (always ticks) |
| RegulariseOpen · Regularise → sheet | /yx/time/attendance?view=today → Regularise (TIM-07 sheet) |
| HomeWidget · not clocked in | /yx/home (clock card) |
| HomeWidgetWorking · working | /yx/home after checking in |

### 3. Counts

- Sub-pages live: 66 (time ops, 29 Oct 2026: +36; decision 6: TIM-36 WithdrawConsent)
- Feature not built: 21
- Phone view: 19
- Gaps: 0 here (30 Oct 2026 follow-ups: Extra · today WithNote live; TIM-13 MenuLeaveOff and TIM-14 Training ×5 added and live). 30 Oct 2026: Manager one person, OutsideNetwork, ChoseWfh and ShiftNotStarted made live
- Total: 111 stories (TIM-36 "Manager · status and total only" was not counted before)

### Gaps and questions

- Day card map: punches carry no map position from the API, so the live day card leaves the map out (shift bar, KPIs and punch list stay).
- Day card "Late mark N of 3 free" uses the design's 3-a-month rule; the real policy number is not sent yet.
- Night work card (opt-in, confirm with a code, withdraw) has no design; kept on the calendar page so the feature is not lost. Question: design a TIM card for it?
- Question: the calendar header has "Clock in or out" (link to the today page) and the today page "My month"; neither is in the design. Chosen so each page reaches the other.
- Leave days show "LV · On leave" (new day code) because the day engine does not say which leave type; half-day leave shows HD.

## B. Leave

Builder B. Designs live in `packages/yx-ui/src/screens/time/leave.tsx` (TIM-30 in ops.tsx, TIM-39 in roster.tsx, TIM-42 and
TIM-29 in leave-admin.tsx). The live pages render the designs with a `live` prop.

### Leave v2 feature sheet (29 Oct 2026, BUILD-STANDARD §1)

**Rules and their source** (company choices are settings with a default; HR changes them per company, entity or
location in Settings, key in brackets):

| # | Rule | Source | Default |
|---|---|---|---|
| 1 | Leave year starts in a month (calendar or financial year) | company (`leave.year_start_month`) | January |
| 2 | Accrual monthly or yearly, pro rata for joiners and leavers, rounding per policy line | company (policy lines) | per policy |
| 3 | Never below the state's Shops & Establishments floor (days a year, carry-forward floor) | law, per state (P07 IN.SE rule sets) | — |
| 4 | Earned leave in a factory needs 240 days worked in the calendar year before; a joiner last year needs 2/3 of the days from joining; a joiner this year earns it from next year | law, Factories Act 1948 s.79 (applies where `attendance.factories_act` = covered) | not covered |
| 5 | Carry forward up to the policy cap (never below the state floor), the rest lapses at year end | company + law | per policy |
| 6 | Year end lists requests still waiting with days in the closing year; posting is refused (409) unless HR ticks Post anyway, and they stay pending | product | — |
| 7 | Half days, minimum / maximum days, negative balance limit, sandwich rule, certificate after N days | company (leave type rules) | per type |
| 8 | Short notice: refused, or allowed and flagged to the approver; each type its own notice days, blank = the company default (sick leave 0); HR applying for someone skips it | company (type rule `noticeMode`, `leave.notice_days.default`, `leave.notice.on_behalf`) | refused, 0, skip |
| 9 | Company block dates: the leave types HR ticks are refused or flagged; none ticked = planned leave (not sick, maternity, paternity or unpaid); maternity never | company (`leave.block_dates.mode`, per block date) | refused, planned leave |
| 10 | Leave during the notice period: last day stays, last day moves by the leave days (a half day moves it a day), or only sick and unpaid leave; leave can't pass the last working day | company (`leave.notice_period.leave`) | last day stays |
| 11 | Probation: every type, casual / sick / unpaid only, or unpaid only (an HR eligibility override lets one person through) | company (`leave.probation.leave`) | every type |
| 12 | Gender eligibility (maternity / paternity) with a plain "ask HR" message and HR override; maternity weeks and 80 days worked | law (Maternity Benefit Act) + company | existing |
| 13 | Holidays and weekly offs inside a range are not counted (unless sandwiched); overlapping requests refused | product | — |
| 14 | Cancel approved leave through the manager; a locked month is refused ("ask HR") | product (P08) | — |
| 15 | Comp-off: claim a worked weekly off or holiday within N days; half day from the location's half-day minutes, full day from full-day minutes; one claim per day; manager approves | company (`leave.comp_off.claim_within_days`) | 30 days |
| 16 | Comp-off expires N days after the day worked, oldest credit used first; overtime comp-off uses the same ledger and rule | company (`leave.comp_off.expiry_days`) | 60 days |
| 17 | Encashment while working: window month (or off), most days a year, days that must stay, one request waiting, manager then HR approve; the days are held while waiting; daily rate = monthly basic + DA (or gross) ÷ divisor; paid as a payroll one-time pay | company (`leave.encashment.window`, `.max_days`, `.min_left`, `.divisor`, `payroll.leave_encashment_basis`) | off, 7, 7, 26, basic + DA |
| 18 | Encashment tax note: taxed as salary in service; at exit exempt up to the s.10(10AA) limit | law (Income-tax Act) | — |
| 19 | Encashment at exit: in the F&F settlement (payroll, unchanged) | law + company | — |
| 20 | Long absence: maternity counts as service (earns leave); sabbatical and long unpaid leave earn none unless the company says so; monthly credits drop by the days away | law + company (`leave.long_absence.accrues`) | no |
| 21 | Optional holidays: N of M a year; after a move to another office during the year, N × months left ÷ 12 (rounded); over the limit after HR lowers it: no new picks until one is given back | company (`leave.optional_holiday.prorate_on_move`) | yes |
| 22 | Block leave: roles that need it (by designation, department, location, entity) take N working days in a row a year, from earned leave | company (`leave.block_leave.required`, `.days`) | not required, 10 |
| 23 | Public-holiday feeds: changes wait for HR review; an accepted new holiday gives back leave already on that date | company (`holiday.feeds`) | off |
| 24 | Unpaid leave (LOP) to payroll: approved unpaid leave days plus absent days with no leave (LOP report; the frozen payroll feed is unchanged) | product | — |
| 25 | Transfers between states: the state floors apply by date; leave carries or lapses by `transfer.leave` (existing) | law + company | carry |

Dates are India time (IST) for "today"; the leave dates are the location's calendar dates.

**Who** (checked on the server for every row): employee — own claims, encashment, ledger, absence; manager — approves
in Approvals, sees the block-leave rows of the team read only; HR with `leave.view` in scope — leave home, reports and
export, block-leave plans, nudges and access pause; `leave.balance.adjust` — long absences (never one's own);
`leave.settings.manage` — block dates, holiday feeds, year end. Acting for someone else is refused on every write.
Another company's rows answer 404.

**Provider: to decide** — public-holiday feed (`HolidayProvider` in apps/api/src/time/holiday-feed.provider.ts; the
dev-fake answers until a provider is chosen).

**API routes** (all under /api/v1/time): `GET me/leave/ledger`, `GET|POST me/comp-off`, `POST me/comp-off/:id/withdraw`,
`GET|POST me/encashment`, `POST me/encashment/:id/withdraw`, `GET me/long-absence`, `POST me/long-absence/:id/return-date`,
`GET hr/leave-home`, `POST hr/leave-home/remind/:requestId`, `GET hr/leave-report`, `GET hr/leave-report/export`,
`GET|POST hr/long-absences`, `POST hr/long-absences/:id/extend|early-return`, `GET hr/block-leave`,
`POST hr/block-leave/:employeeId/plan|nudge|pause`, `GET|POST setup/block-dates`, `POST setup/block-dates/:id/remove`,
`GET|POST setup/holiday-feeds`, `POST setup/holiday-feeds/check|decide`, `POST setup/holiday-feeds/:id/remove`;
`POST setup/year-end` takes `acknowledgePending`. Comp-off service for overtime: `LeaveV2Service.creditCompOff`.

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/leave | `LeaveHomeScreen live` with the designed sheets: `ApplyLeaveSheet`, `LeaveRequestDetail`, `OptionalHolidaysSheet`, `CompOffClaim`, `EncashmentRequest`, `LongAbsenceCard` (each `live`) | TIM-17 Employee, TIM-18, 19, 22, 23, 24, 25 | now the designs |
| /yx/time/leave/card (new) | `LeaveCardScreen mine` | TIM-21 Employee | now the design |
| /yx/time/leave-home (new, HR) | `LeaveHomeScreen hrLive` | TIM-17 HR, TIM-25 HR | now the design |
| /yx/time/team | `TeamLeaveCalendarScreen live` | TIM-20 | unchanged |
| /yx/time/balances | `LeaveReportsScreen live`; `?person=<id>` opens `LeaveCardScreen live` | TIM-30, TIM-21 HR | now the designs: everyone × balances with a row to the card |

### TIM-17 · Leave home

| story (sub-page) | where it shows live |
|---|---|
| Employee | /yx/time/leave: balance cards, My requests (a request sent back shows "Sent back for changes" with Change and send again), Upcoming holidays, Optional holidays, plus My leave card, Claim comp-off, Encash leave, the long-absence card and "Waiting for approval" (claims, encashment) |
| Manager | /yx/time/team-leave (nav "Leave to approve", `LeaveHomeScreen mgrLive`): "Leave waiting for you (N)" from the manager's own team only (GET /time/team/leave-home: their open approval tasks), who else in the team is off, certificate, View and Approve (toast), Send back (opens TIM-19 Manager with "Send back to <name>?": What to change, required; shown while the company setting `leave.send_back`, default on, allows it); "Also in Requests: N attendance or overtime requests"; Away this week; Open leave calendar. Not here: Apply for someone (HR's, leave.balance.adjust) |
| HR | /yx/time/leave-home: pending leave with managers (approvers, age, Remind approver once a day), away this week, Needs HR (negative balances, certificates, long absences, year-end); Record long absence, Adjust balance and Apply for someone buttons, as in the design (leave.balance.adjust). Adjust balance (founder-approved, 29 Oct 2026) is the leave card's `AdjustBalanceDialog`: Employee search (HR scope), then that person's balances (`GET people/:id/balances`), Days empty, `POST people/:id/adjust`; toast "Posted ±N <type> for X". The leave card (/yx/time/balances → Open leave card) keeps its own Adjust |
| HR · apply for someone (new, founder answer B) | /yx/time/leave-home → Apply for someone: the TIM-18 drawer (the employee's own live drawer, `forSomeone`): Employee search, then only that person's leave types and balances, dates and halves, reason, certificate tick when needed (no delegate); Summary from the server (days, balance after, "Notice: Applied by HR: N days' notice not needed", their team, "Goes to their manager … marked \"Applied by HR\"" or "Approved at once (company setting)"); toast "Leave applied for X · sent for approval" |
| HR · apply for someone · refused (new) | same drawer when the rules refuse (block date, overlap "X already has leave on …", balance, locked month, notice when the company applies it): the red box on Send, or "Not sent" with the API's message; nothing is sent |
| HR · record long absence | /yx/time/leave-home → Record long absence: person (HR scope search), Sabbatical / Long leave without pay, first and last day, reason; "What this does" (days, unpaid, leave credits by the company setting, back at work); toast "Long absence recorded" |
| HR · record long absence · leave in the way | same, when the check finds leave waiting or approved, another absence, notice, a joining day or a locked month: the red box says why and Record does nothing |
| Employee · no requests yet | /yx/time/leave for a new joiner |
| Loading | /yx/time/leave while it loads |
| Error | /yx/time/leave when the API fails: Retry |
| Phone · employee | phone view, mobile app not built |
| Phone · manager | phone view, mobile app not built |

### TIM-18 · Apply leave

| story (sub-page) | where it shows live |
|---|---|
| Earned leave · sandwich counted | /yx/time/leave → Apply leave: days counted incl. days between leave days |
| Half days at both ends | /yx/time/leave → Apply leave: First day / Last day |
| Over balance · blocked | /yx/time/leave → Apply leave: field error on Send |
| Short notice warning | /yx/time/leave → Apply leave: a warning when the type flags short notice (`noticeMode` warn); the approver sees "Short notice"; refused when the type refuses it |
| Sick leave · certificate required | /yx/time/leave → Apply leave: the certificate tick (HR verifies). Partial: the file upload waits for P05 documents |
| Company block date | /yx/time/leave → Apply leave on a block date: refused with the reason, or a warning the approver sees (setting) |
| During notice period · last day moves | /yx/time/leave → Apply leave while on notice: "Last working day" row (stays / moves to …) and a warning; refused past the last day or for paid leave when only sick and unpaid are allowed |
| Leave without pay · taken, no balance | /yx/time/leave → Apply leave on unpaid leave |
| Sent | toast "Leave sent for approval" |
| Phone | phone view, mobile app not built |

### TIM-19 · Leave request detail

| story (sub-page) | where it shows live |
|---|---|
| Employee · pending | /yx/time/leave → View (LeaveRequestDetail live) |
| Withdraw | /yx/time/leave → Withdraw |
| Employee · approved | /yx/time/leave → View on approved leave |
| Past approved leave · report an error | /yx/time/leave → Ask to cancel on last month's leave; a locked month is refused ("ask HR") |
| Employee · ask to cancel future leave | /yx/time/leave → Ask to cancel (reason required) |
| Manager · with team availability | /yx/time/team-leave → View (or ?open=<id>): GET /time/requests/:id adds `team`: who else under the same manager is off (people the viewer may see), "<name>'s balance after", the viewer's open task; someone outside the team 404 |
| Manager · approve | same → Approve (confirm, toast) or Reject (reason required) through POST /workflow/approvals/tasks/:id/decide (only the task holder); waiting on someone else: "Waiting for another approver" |
| SendBack · Manager · send back for changes (new story, 30 Oct 2026) | same → Send back: "Send back to <first name>?", What to change (required: pressed too early, the field says so and takes focus), decision `send_back` through the approvals engine (reason required, audited `workflow.request.sent_back` and `leave.request.sent_back`; the request's days stop waiting; the employee is told). Also in the approvals inbox (PLT-04 · send back for changes) where the type allows it. Setting `leave.send_back` (default on) |
| SentBack · Employee · sent back, change and send again (new story) | /yx/time/leave → a request "Sent back for changes" → View: who sent it back and what to change, Change and send again (Apply leave from the request; every rule again; POST /time/me/leave/:id/resend raises a new request, the old one becomes "Changed and sent again"; once only) or Withdraw |
| Phone | phone view, mobile app not built |
| Phone · manager | phone view, mobile app not built |

### TIM-20 · Team leave calendar

| story (sub-page) | where it shows live |
|---|---|
| Manager | /yx/time/team as a manager |
| Month | /yx/time/team → Month |
| Hr | /yx/time/team with leave.view |
| Empty | /yx/time/team when no one is away |
| Loading | /yx/time/team while loading |
| Phone | phone view, mobile app not built |

### TIM-21 · Leave card

| story (sub-page) | where it shows live |
|---|---|
| Employee · ledger and projection | /yx/time/leave/card (My leave → My leave card): balances, every ledger line, "What will my balance be?" (pending requests that start by the date) |
| HR | /yx/time/balances → Open leave card on a row (?person=). The HR projection card is not shown (the HR API has no pending dates per person) |
| HR · adjust with reason | /yx/time/balances?person=… → Adjust balance |
| Phone | phone view, mobile app not built |

### TIM-22 · Comp-off claim

| story (sub-page) | where it shows live |
|---|---|
| Claim | /yx/time/leave → Claim comp-off: worked weekly offs and holidays in the window, half or full day (full only with the full-day minutes), reason, use-by date |
| No eligible days | /yx/time/leave → Claim comp-off with nothing to claim |
| Sent | toast "Comp-off claim sent to your manager"; the claim shows under "Waiting for approval" with Withdraw |
| Phone | phone view, mobile app not built |

### TIM-23 · Optional holidays

| story (sub-page) | where it shows live |
|---|---|
| Choose 2 of 5 | /yx/time/leave → Optional holidays |
| At the limit · others locked | /yx/time/leave → Optional holidays at the limit; over the limit (HR lowered it): a warning to untick, new picks refused |
| Prorated after transfer | /yx/time/leave → Optional holidays after a move to another office this year: the prorated limit and why |
| Phone | phone view, mobile app not built |

### TIM-24 · Encashment request

| story (sub-page) | where it shows live |
|---|---|
| Request · amount preview | /yx/time/leave → Encash leave (while the window is open): days, rate, amount before tax, balance after, tax note. "After tax (about)" is left out: the person's slab is not known here |
| Over what you can encash | /yx/time/leave → Encash leave: field error with the cap and the days that must stay |
| Request already waiting | /yx/time/leave → Encash leave with a request waiting: Withdraw request |
| Phone | phone view, mobile app not built |

### TIM-25 · Long-absence status card

| story (sub-page) | where it shows live |
|---|---|
| Employee · maternity | /yx/time/leave: approved maternity leave starts the status; Open status → progress, return, pay and accrual, Tell HR my return date changed |
| HR · sabbatical | /yx/time/leave-home → Needs HR → Open status: Extend / Record early return (reason, version-checked). A new one is recorded with Record long absence (TIM-17) |
| HR · long LWP | same as HR · sabbatical |
| Phone · maternity | phone view, mobile app not built |

### Counts

59 sub-pages: 48 live, 0 not built, 11 phone, 0 gaps (TIM-17 Manager and TIM-19 Manager ×2 made live 30 Oct 2026; TIM-19 SendBack and SentBack added and live in the follow-ups).

### Questions (defaults chosen, marked)

- Done 29 Oct (founder decision 1): Record long absence on the HR leave home and Company block dates on Leave policies.
- (was) Recording a new sabbatical or long unpaid leave, and managing company block dates, have APIs but no designed HR
  screen yet. Proposed: a "Record long absence" dialog on the HR leave home and a "Company block dates" card in TIM-26.
- The notice-period choice is a company setting; TIM-27 drew it per leave type. Default kept company-wide; per type if wanted.
  (Leave during the notice period stays a company setting. Notice days to apply ahead are per leave type with a company default since founder decision 2.)
- "Last working day moves": shown to the employee and the approver; the exit case's date itself is changed by HR in the exit flow.
- The block-leave access pause is recorded and audited; turning access off on those dates belongs to the access area (not built).

## C. Leave and attendance set-up

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/setup | LeavePoliciesScreen `live` (leave-admin.tsx) | TIM-28 · Leave policies | now the TIM-28 design (was the tabbed live TimeSetupScreen, deleted) |
| /yx/time/setup/types/[id] (new) | LeaveTypeEditorScreen `live` | TIM-27 · Leave type editor | now the TIM-27 design; opened from the "Leave types" menu on Leave policies (id or `new`) |
| /yx/time/setup/holidays (new) | HolidayCalendarsScreen `live` | TIM-26 · Holiday calendars | now the TIM-26 design |
| /yx/time/setup/year-end (new) | YearEndWizard `live` | TIM-29 · Year-end wizard | now the TIM-29 design |
| /yx/time/setup/locations (new) | GeofenceEditorScreen `live` | TIM-31 · Locations and geofence editor | now the TIM-31 design (with Multi: several points), plus the location's shift and weekly offs (Question: no design shows them) |

Menu (yx-nav.ts, not mine): only "Leave types & policies" → /yx/time/setup exists. The design's Time menu also has
"Holiday calendars", "Locations & geofences" (Time settings) and "Year-end". Until the coordinator adds those links,
the three new pages are reachable only by address.

### TIM-26 · Holiday calendars

| story (sub-page) | where it shows live |
|---|---|
| Chennai · Chennai office · rules | /yx/time/setup/holidays → a location tab: holidays table (weekday, date, due badge, type, "on a weekly off"), Published badge, feed changes waiting (Review changes → holiday feeds), "Rules for this calendar": Holiday on a weekly off (no extra day / substitute day off in the holiday lookup / comp-off credit by the daily job: since 30 Oct 2026 for each person whose own day is off by their roster, pattern or else the location; people rostered to work get the holiday rule instead), optional holidays each person chooses, When someone moves (the location's value of `leave.optional_holiday.prorate_on_move`), plus the half-day rule (Question). Add holiday; Change date and Remove holiday (future only) with confirm; leave on a new holiday date goes back to the balance, and leave across the old date (or a removed holiday) counts that day again: a working day is leave again as booked, approved leave takes it from the balance, audited `leave.request.recounted`, the person is told (30 Oct 2026; the same on an accepted feed removal) |
| Clone · Clone to next year | /yx/time/setup/holidays → Clone <location> to <next year> (waits while feed changes are waiting) → "<year> draft created" → Open draft: Confirm date for each festival, Publish (refused until every festival date is confirmed); drafts never reach employees |
| Template · Start from state template | /yx/time/setup/holidays → a location with no calendar → Start from the <state> template (the holiday feed provider, dev-fake until decided; today to 31 Dec) → draft → Publish; "Add holidays one by one" beside it; a state with no template keeps "Add a calendar for <location>" |
| NoCalendar · Location without a calendar | /yx/time/setup/holidays → tab of a location with no calendar → "Add a calendar for <location>" |
| Empty | /yx/time/setup/holidays, company with no calendars (each tab as above); no locations at all → "No locations yet" |

### TIM-27 · Leave type editor

| story (sub-page) | where it shows live |
|---|---|
| Counting · Counting · live example | /yx/time/setup/types/<id> → Counting tab (weekly offs/holidays rule, applies to, half days) with the live example over the next weekend |
| Basics | → Basics tab: name, code (fixed once saved), kind (Question: kept from the old page), pay (paid/unpaid; "partially paid" not built), colour, in use. Save with a bad code / no name / paid "without pay" → field errors, Basics tab opens |
| Crediting | → Crediting tab: read-only, each policy's days and how it credits (set in the policy) |
| Rules | → Rules tab: notice days (blank = the company default, named in the helper; sick leave none), least/most days, "Most days in a month" (0.5–31, pending and approved together, half days exact; enforced on apply with the month named; a request bigger than the month is refused on save, field focused), document after, below zero, HR approval above, medical. "Dates when no one can take it" is the company block dates on Leave policies (TIM-28) (2 Nov 2026) |
| YearEnd · Year end | → Year end tab: each policy's carry-forward (read-only), "can be cashed in", and for a cash-in type: encash per year up to, keep at least, pay for each day (company default ÷ 26/30, or the type's own), pay out at exit. Blank = the company setting (named). Payroll reads them: in-service cash-in, the year-end pay-out (TIM-29) and the final settlement (2 Nov 2026) |
| Notice · Absence & notice | → Absence & notice tab: crediting during a sabbatical or long unpaid leave (company default / stop / keep), and leave during the notice period (company default / allowed / moves the last day / not allowed). "Counted as unpaid leave": not offered (Question) (2 Nov 2026) |
| Statutory · Statutory template · maternity | /yx/time/setup/types/<maternity type> → "The law sets these values" (P07 IN.LEAVE: 26 weeks, 12 from the 3rd child or adoption, 8 before delivery, 80 days worked), Set by law (read-only), Set by you (colour), Save colour. The server refuses shorter, unpaid, reduced pay, a monthly limit, refusing short notice or switching it off, with the law named (2 Nov 2026). Paternity: locked only where a state IN.LEAVE rule gives it (none seeded, Question) |

### TIM-28 · Leave policies

| story (sub-page) | where it shows live |
|---|---|
| List · Policies and rules | /yx/time/setup → Policies tab: table (#order, policy, arrows, leave types, who gets it + dates, people today, overrides = per-person assignments, "Changes from" badge), "N people match no policy" (Show them), "N people covered by M policies", the law's minimums; arrows make a draft order, Save order from a date (a later order shows "New order from …"); Apply to: whole company, a legal entity, a location or a grade. The design's combined rule (entity AND grade) is not built: a grade applies company-wide (Question 3) |
| Company block dates · add (`BlockDatesAdd`) | /yx/time/setup → Company block dates tab: each block (dates, reason, where, the leave types it stops, "Already on leave then (their leave stays)"), Remove with a confirm; Add block dates: from, to, reason, Where (Segment: whole company / a legal entity / a location), the leave types (planned leave ticked, sick not, maternity not offered); field errors and focus; toasts |
| Company block dates · none yet (`BlockDatesNone`) | same tab with no block dates: "No block dates" + Add block dates; loading and could not load (Retry) inside the card |
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
| PendingBlocked · pending requests | /yx/time/setup/year-end → Scope lists the pending requests; Post is blocked until "Post anyway" is ticked (the API answers 409 otherwise) |
| Post · typed confirmation | → Post year-end → type LEAVE YEAR <year> → Post entries |
| Posted · posted | → after posting: "Year end is being posted" (stays, founder OK) |
| Transition · Leave-year change · scope | /yx/time/setup/year-end?mode=transition → Scope: entity, new leave year (default April), "A short year is created" (from the day after the next year end); a change that can't be made says why (same month, a short year running) (2 Nov 2026) |
| TransitionPreview | → Preview: per person and type, opening (after the year end, credits still due, cap applied), short-year credit (its months only), balance at its end → carried / to pay out / lapse; search; failed preview → Try again |
| TransitionPosted | → Post transition → type SHORT YEAR <year> → "Leave-year change scheduled" (toast too); audited `leave.year_change.scheduled`; once per entity and date (a second one while one waits: 409). The page shows the scheduled change when opened again |

Letters and notices step: feature not built (left out live).
Year end (2 Nov 2026): over the carry-forward cap, a cash-in type is paid out up to its yearly cash-in limit (setting `leave.year_end.encash_excess`, default on), the rest lapses; the preview shows "· N to pay out" and a Paid out total; posting writes `encashed` ledger entries and a one-time pay (leave_encashment) for payroll. A year end is posted once per policy and date (`leave_year_runs`); the page then says "posted on … by …" and a second post is refused (409 YEAR_END_POSTED).
Menu: "Change leave year" has no menu link yet (reachable by address, like the other new set-up pages).

### TIM-31 · Locations and geofence editor

| story (sub-page) | where it shows live |
|---|---|
| Edit · Geofence and IP ranges | /yx/time/setup/locations → location picker, map of the points and radius (drag the handle), check-in mode, shift and weekly offs from a date (errors: start = end, no date), Allowed points and office networks edited here (Settings › Locations still edits the first point) |
| Multi · Multiple points | /yx/time/setup/locations → Allowed points (the design's `GeoPointsSection`, shared by the story and the live page): each point with Edit / Remove (only with more than one), name, latitude, longitude, radius 50–1,000 m, Add another point, Save points (pressed with a wrong field: the field is focused, nothing sent); POST /time/setup/locations/:id/points (leave.settings.manage; up to 20 points, unique names, the location's updatedAt seen or 409 "Someone else changed this location…"; audited before → after; toast "Points saved"). A punch inside any point is inside (web and phone punches); the field-force map draws every point. Old single-point locations became one point (migration 20261410000000_location_geo_points) (2 Nov 2026) |
| Field · Field mode | → choose Field in Check-in mode, Save |
| IpError · Invalid IP range | /yx/time/setup/locations → Office network: IP ranges, one per line; Save office network checks each line ("Line 2: 10.20.300.0/24 is not a valid range…", field focused) and the server again (POST /time/setup/locations/:id/networks, leave.settings.manage, audited) |

### TIM-42 · Holiday feed settings

| story (sub-page) | where it shows live |
|---|---|
| Settings · Subscriptions | /yx/time/setup/holiday-feeds (new): on/off, feeds per state with their locations, Add feed, Check for updates, Remove. Provider: to decide (dev-fake until then) |
| Review · Review before publish | → changes waiting: Accept / Ignore each, Publish; leave already on an accepted holiday goes back to the balance and the people are told |
| Off · Feeds off | → switch off (asks first when changes wait) |

### Counts

35 stories: TIM-26 template, clone and Chennai rules made live and TIM-31 IpError made live (30 Oct 2026); see the counts table for totals.

## D. Rosters and shifts

### Feature sheet: rosters, devices and field (builder "roster", 29 Oct 2026, BUILD-STANDARD §1)

Design groups made live by this work: TIM-05, 06, 08, 12 (API only), 13, 14, 32, 33 (web/API only), 34, 35, 38, 40, 41, 43.
Phone stories stay "phone view". Each rule: source · setting (default) · where it is enforced.

Rules (law is per location: the location's state picks the statute values; company choices are settings with a default
and a per-company / entity / location HR override, PUT /org/settings):

1. Minimum rest between two shifts of one person: Factories Act s.55/56 practice, founder 9 Oct 2026 · `attendance.min_rest_hours` (11) ·
   roster check (blocks publish), swap request and swap approval, open-shift claim and award, auto-roster, call-out (flags the next shift).
2. Hours a day, hours a week, spread-over: Factories Act 1948 s.54 (9 h), s.51 (48 h), s.56 (10.5 h); OSH Code 2020 s.25; a state
   shops act may be stricter · `roster.max_daily_hours` (9), `roster.max_weekly_hours` (48), `roster.max_spread_over_hours` (10.5) ·
   same places as rule 1. Hours = shift length less its break; spread-over = start to end.
3. Women's night work: OSH Code 2020 s.43 and state rules (the night window and the safeguards checklist come from P07 IN.OSH per
   state): consent on record, confirmed by the worker with a one-time code, and the location's safeguards in date · no setting
   (law) · every path that puts a person on a shift: draft, publish, pattern, swap (request and approval), open-shift claim/award,
   auto-roster. Withdrawing consent is never a ground for adverse action.
4. Weekly off: Factories Act s.52, shops acts · `roster.min_weekly_offs` (1) per Monday–Sunday week · roster check (blocks publish),
   swap, open shift, auto-roster.
5. Published roster changes: YX-AT-07 · `roster.change_notice_hours` (24) · a change to a published day that starts within the notice
   needs a reason (kept on the day and in the audit, before → after), and the person is told at once; past days and locked months never change here.
6. Staff see the team roster: founder decision 29 Oct 2026 · `roster.staff_see_team` (off) · off: an employee sees only their own
   shifts; on: their team's (same manager) published roster read-only, colleagues' leave shown only as "Away", no drafts, no conflicts.
7. Swaps: same manager, the colleague agrees, then the manager approves (P03); no swap that breaks rules 1–4 or 8 for either person,
   checked when asked and again when approved (codes REST_GUARD, HOURS_GUARD, NIGHT_GUARD, LICENCE_GUARD, WEEKLY_OFF_GUARD).
8. Licences: a shift (at all or one location) needs a licence type (forklift, boiler attendant…); a person is placed on it only with
   a licence of that type valid on that day (valid_from ≤ day ≤ expires_on). Expired = blocked, no override. Reminders at the type's
   lead days (60/30/7 by default), once each (job safe to re-run).
9. Open shifts: `roster.open_shift_rule` (manager_picks). Eligible = employed at that location that day, not working an overlapping
   shift, passes rules 1–4 and 8, not on approved leave. First come: the first eligible claim wins (row lock; a second claim gets 409).
   Manager picks: fair order suggested = fewest open shifts won in the last 30 days, then fewest rostered hours that week, then the
   earliest bid, then employee code. The award writes the published roster (source "open").
10. Standby and call-out: a standby slot (≤ 24 h) per person; a call-out is paid at least `standby.call_out_minimum_hours` (2)
    whatever was worked; logging it shows the rest left before the next shift (rule 1) so the manager can move that shift (a published
    change with reason, rule 5). The standby allowance and call-out pay rates belong to payroll (PAY on-call rules).
11. Auto-roster: demand per location, shift and weekday; fills only empty days of the week as drafts (never overwrites a draft or a
    published day), people ordered by fewest hours, then fewest nights (fair spread); each unfilled slot says why each candidate
    was skipped; one run per location week at a time; the manager reviews and publishes through the normal publish (rules re-checked).
12. Hybrid office days: `hybrid.office_days` (0 = no rule), `hybrid.anchor_days` (none), `hybrid.evidence` (geofence, network, kiosk)
    · each person plans office / home days for the week; the week counts as met when the office days with evidence (an accepted punch
    inside a geofence, from the office network, or at a kiosk) reach the target. No pay link (Question).
13. Devices (TIM-14): kiosks are registered by HR (`leave.settings.manage`) and set up with a one-time code (30 min); the kiosk then
    holds a secret the server keeps only as a SHA-256 hash; revoke stops it at once. Phones: `attendance.phone_binding` (off); a person
    asks to bind a phone, HR approves or refuses with a reason; one approved phone per person; a lost phone is revoked and its sessions
    signed out.
14. Kiosk (TIM-13): `kiosk.methods` (pin, qr), `kiosk.pin_tries` (5) then a 15-minute lock; PINs stored as argon2 hashes; the ID-card QR
    is a signed token (jose) that a rotated nonce voids; face match through a provider adapter (dev-fake; provider: to decide), only with
    the person's consent on record. The screen shows a first name only and clears itself. Offline punches carry the device's own id
    for each punch: a repeat returns the first result and never makes a second punch; punches older than 72 h or in the future are refused.
15. Field force (TIM-32/33, DPDP Act 2023 s.4–6, s.8(7)): `field.tracking` (off), `field.ping_minutes` (5), `field.max_accuracy_m` (100),
    `field.trail_retention_days` (30). Tracking only with the person's consent (notice version kept; withdraw any time), only while on
    duty (checked in, not checked out), only for their own manager or attendance.view in scope; the trail is deleted after the retention
    (daily job, safe to re-run). Integrity flags (mock location, impossible speed, poor accuracy) are shown, never a penalty by themselves.
    Map tiles and place names through a provider adapter (dev-fake; provider: to decide).
16. Timesheet suggestions (TIM-43): `timesheet.tool_suggestions` (off); each person connects their own calendar / work tool (adapter,
    dev-fake; providers: to decide); suggestions are only suggestions: nothing is added until the person accepts a line.
17. Time zones: every roster day is the location's local date (Facts.zone); standby, call-outs, pings and punches are stored as instants.

Who: planning (roster, open shifts, standby, auto-roster, demand) = a manager for their own team (implicit) or `roster.manage` in scope,
never one's own row; licence types and shift requirements, devices and kiosks = `leave.settings.manage` (company-wide set-up);
a person's licences = `roster.manage` in scope; field map = the manager's own team or `attendance.view` in scope; everything "me" = the
signed-in person only, never while acting for someone else. Another company's ids answer 404.

States: empty, loading, error, no access, not set up (no demand / no licence types / tracking off), too early (bid window closed, past
day), over the limit (rules 1–4), already done (claimed, awarded, revoked), someone else first (409), offline / retry (device receipts).

### Live pages

| page | live screen today | design story | verdict |
|---|---|---|---|
| /yx/time/roster | `RosterScreen live={…}` (roster.tsx) | TIM-05 Roster | now the TIM-05 design with real data; live copy `RosterPlannerScreen` deleted |
| /yx/time/shifts | `ShiftSwapSheet live={…}` (requests.tsx) | TIM-08 Shift change or swap (its desk page is "My shifts") | now the TIM-08 design with real data; live copy `MyShiftsScreen` deleted |
| /yx/time/shifts-setup | `ShiftEditorScreen live={…}` (roster.tsx) | TIM-06 Shift editor and patterns | now the TIM-06 design (Shift, Patterns tabs) with real data, plus 3 extra tabs with no design (Overtime, Timesheet projects, Night work); live copy `ShiftsSetupScreen` deleted |

### TIM-05 · Roster

| story (sub-page) | where it shows live |
|---|---|
| Draft (Manager · draft with conflicts) | /yx/time/roster, a week with unpublished changes: "Draft · N changes not visible to staff" badge, conflicts in the grid, server checks in "Law and rule checks" (rest, overlap, hours a day / week, spread-over, weekly off, licence, night work, leave, holiday); publishing is refused with the first rule break a draft adds (REST_GUARD, HOURS_GUARD, WEEKLY_OFF_GUARD, LICENCE_GUARD, NIGHT_GUARD) |
| Published | /yx/time/roster, a week with no drafts: "Published" badge |
| CopyWeek (Copy last week) | /yx/time/roster → Copy last week → confirm dialog (refusal shows in the dialog) |
| Swap (Swap shifts) | /yx/time/roster → Swap shifts → dialog with cover, rest, leave and night-consent checks (no role check: the API sends no roles) |
| Hr | /yx/time/roster as HR with roster.manage. Header like the design: title "Roster · <reach>" ("Roster · Everyone" company-wide, "Roster · The people you plan" for a scoped grant, "Roster · Your team" for a manager; the API sends the reach, not one place, and the design has no several-locations case), actions Copy last week · Swap shifts · Auto-roster (to /yx/time/auto-roster) in one row with the week arrows. The grid fits Person + Mon–Sun + Hours at 1278 x 635 with the sidebar open (days 100 px, as the design; was 117 px with Sunday under Hours, fix 29 Oct 2026); with less room the frame scrolls sideways, Person and Hours stay |
| Staff (Employee · read-only) | /yx/time/roster for anyone who plans no one (nav "Team roster"): their published week read-only, "You" first; with `roster.staff_see_team` on (off by default, founder decision 29 Oct 2026) their team's (same manager) rows too, a colleague's leave only as "Away"; off: own row and a note. GET /time/roster/team |
| Notice (Publish · changes inside the notice) | /yx/time/roster → Publish roster when a change starts inside `roster.change_notice_hours` → "Some changes start too soon" dialog: Reason required (field error + focus when pressed too early), published with the reason (kept on the day, in the audit, the people told). New design story 29 Oct 2026 |
| Empty (Empty week) | /yx/time/roster with no one to plan → "No one to plan" empty state (a week with people but no plan shows the grid on pattern defaults) |
| Loading | /yx/time/roster while loading |
| Failed (Error) | /yx/time/roster when the load fails → Retry |
| Phone (Phone · my shifts) | phone view, mobile app not built |

Inside RosterScreen: the Open shifts tab is live (the TIM-35 panel); the Bids tab (pattern bid windows) is not built (hidden in live); Auto-roster is its own page /yx/time/auto-roster.

### TIM-06 · Shift editor and patterns

| story (sub-page) | where it shows live |
|---|---|
| Fixed (Fixed shift · preview) | /yx/time/shifts-setup → Shift tab: shift list, editor form, preview |
| Flexi (Flexi with core hours) | /yx/time/shifts-setup → Add a shift → Type "Flexi with core hours" (the Type field shows once HR turns on `attendance.shift_types.flexi` in Settings › Company rules; off by default): window start and end, Core from / Core to (inside the shift, field error otherwise), Overtime after (h worked; empty = the full day); preview "Everyone is in for core hours …", Late from core start, Overtime after N h. A saved shift keeps its type (Type locked, Duplicate for another). Built 3 Nov 2026 (branch `feat/yukthix-flexi-split`) |
| Split (Split shift) | /yx/time/shifts-setup → Add a shift → Type "Split" (shows once HR turns on `attendance.shift_types.split`): First part from / to, Second part from / to (in order, within 24 h, the gap at least `attendance.split.min_gap_minutes`, default 1 h; field errors), no break rule (the gap is the break); preview with both parts on the bar and "The … gap is the break, not shift time"; the list shows both parts. Built 3 Nov 2026 (branch `feat/yukthix-flexi-split`) |
| Night (Night shift · law notice) | /yx/time/shifts-setup → a shift ending next morning, or Night allowance on → law notice, "(next day)" |
| Patterns (Patterns · N-day cycle) | /yx/time/shifts-setup → Patterns tab: new pattern (weekly or N-day cycle), saved pattern with "Who follows it" and apply form, 14-day preview |
| SaveError (Save error) | /yx/time/shifts-setup → Save shift with half day ≥ full day (or other missing fields) → error summary + field error |
| Saved (Saved (effective dated)) | /yx/time/shifts-setup → Save shift → toast "Shift times saved"; a future-dated change shows the "Changes from <date>" badge |

Extra live tabs with no design (Question below): Overtime (rules list + add drawer), Timesheet projects (list + drawer), Night work (safeguards, consents, opt-ins + drawers).

### TIM-08 · Shift change or swap

| story (sub-page) | where it shows live |
|---|---|
| Request (Swap request) | /yx/time/shifts → Ask to swap on a day → "Shift change or swap" sheet (field errors on Send) |
| RestBlocked (Blocked · rest rule) | /yx/time/shifts → Send a swap that would leave less than `attendance.min_rest_hours` rest (or break hours, weekly off or licence) for either person → the server's REST_GUARD refusal shows in the sheet ("Not sent"); checked again when the manager approves |
| NightBlocked (Blocked · no night-work consent) | /yx/time/shifts → Send → the server's night-work refusal shows in the sheet ("Not sent") |
| Consent (Colleague consent card) | the colleague sees "X asks to swap" on /yx/time/shifts; they agree or decline in Approvals (P03 step "Colleague agrees") |
| Accepted (Consent given) | Approvals (P03) after agreeing; /yx/time/shifts keeps "Swap pending" until the manager decides |
| Phone (Phone · request) | phone view, mobile app not built |
| PhoneConsent (Phone · consent card) | phone view, mobile app not built |

"Change my shift" (the second Request option): gap, the API has swaps only; live shows the swap form only (Question: build "ask my manager for another shift"?).

### TIM-34 · Auto-roster

| story (sub-page) | where it shows live |
|---|---|
| Draft (Coverage and draft) | /yx/time/auto-roster (`AutoRosterScreen live`, auto-roster-live.tsx) → Coverage and draft tab: KPIs (slots filled, unfilled, over-staffed, new drafts, nights per person), coverage chips per shift and day (got/need of the latest run), "Why slots are unfilled", the week's draft grid; empty: "No draft for this week yet" + Generate; failed run: the reason + Run again. OT hours KPI: gap (no OT forecast in the API) |
| Demand (Demand editor) | Header (all tabs and states): actions in one row level with the title like the design (week arrows, Run again / Generate, Approve draft or Publish roster); with several locations (HR) the Location picker sits under the subtitle (fix 29 Oct 2026; it was in the actions at full width and pushed Generate under it). /yx/time/auto-roster → Demand tab: people needed per shift and weekday at the location (0–500), Save demand, or Run again saves then generates; not set up: "Not set up" badge and Demand tab first. "Import forecast (CSV)" and the festival-sale date override: gap (demand is per weekday only; no CSV import in the API) |
| Running (Generating) | /yx/time/auto-roster while Generate runs, or when another planner's run is going ("Check again"); a second Generate gets 409 "already running" |
| Explain (Unfilled slot explained) | /yx/time/auto-roster → a red chip or Explain → drawer: reasons with counts and each person checked with the guard's reason; "Offer as open shift" links to /yx/time/open-shifts. The "Plain-words summary (1 AI credit)" card: gap (no AI explain in the API) |
| Approved (Approved · publish) | /yx/time/auto-roster → Approve draft (page step, no API) → Publish roster → POST /time/roster/publish (all the planner's drafts for the two weeks; every rule re-checked; a refusal stays on the page). Unfilled slots are not sent as open shifts automatically: gap, the planner offers them on /yx/time/open-shifts |

### TIM-35 · Open shifts and bids

| story (sub-page) | where it shows live |
|---|---|
| Manager (Manager · open shifts) | /yx/time/open-shifts (`OpenShiftsScreen live`, open-shifts-live.tsx): the designed table (open, awarded, cancelled rows of the last 30 days), "Pick claimant" award dialog with the fair order and the bids that can't be picked (server reason), "Offer an open shift" dialog (location, date ≤ 120 days, shift, licence, award rule Segment from `roster.open_shift_rule`, bids close, note), "Cancel offer". `OpenShiftsPanel` is exported for the roster's Open shifts tab |
| Empty | /yx/time/open-shifts with no open shifts → "No open shifts" + Offer |
| Loading | /yx/time/open-shifts while loading |
| Phone (Phone · eligible open shifts) | phone view, mobile app not built (API live: GET /time/me/open-shifts) |
| PhoneClaimed | phone view, mobile app not built (API live: POST /time/me/open-shifts/:id/claim, /withdraw) |
| PhoneBid | phone view, mobile app not built; the "rank patterns for next month" bid is not built (no pattern bidding in the API) |
| PhoneNone | phone view, mobile app not built (API answers an empty list) |

Bid windows tab (pattern bidding for next month) and "Remind eligible" / "Offer to all lines": feature not built (hidden in live). "Cancel offer" is added on the designed row buttons (no story of its own).

### TIM-38 · Standby and call-out

| story (sub-page) | where it shows live |
|---|---|
| Manager (Standby slots and call-out log) | /yx/time/standby (`StandbyScreen live`, standby-live.tsx): week Segment, shift key, read-only roster grid (SB on standby days), call-out log with paid time (minimum from `standby.call_out_minimum_hours`), next shift and rest left (rule 1), "Rest N h" badge + "Move next shift" on the latest; a "Standby slots" card with Cancel for slots not started |
| Moved (After the shift is moved) | /yx/time/standby after "Move next shift" → the row shows the new shift and full rest, no badge; toast "Shift moved" |
| LogCallOut (Log call-out · rest check) | /yx/time/standby → Log call-out: person on standby (started slots), start, end, reason, source, Effect (paid, minimum); the rest shows in the toast and the log after saving |
| SetStandby (Set standby) | /yx/time/standby → Set standby (new design story for the slot dialog: who, from, until, ≤ 24 h) |
| Phone (Phone · employee on standby) | phone view, mobile app not built |
| PhoneMoved | phone view, mobile app not built |

Standby allowance per slot and call-out pay rates are payroll's (PAY on-call rules): the live header says so and shows no money.

### TIM-39 · Block-leave planner

| story (sub-page) | where it shows live |
|---|---|
| Hr (HR · compliance view) | /yx/time/block-leave (new): people whose role needs it (setting), taken / planned / not planned, Nudge to plan, Plan block leave |
| Manager | /yx/time/block-leave as a manager: the team's rows, read only |
| Suspend (Access suspension confirmation) | /yx/time/block-leave → Schedule access pause → the confirmation ("paused from <first day>, 12:00 am and restored on <day after>"). The hourly time job pauses sign-in on the first day (user status "paused", sessions and refresh tokens revoked, audited) and restores it after the last day; an HR exception (access turned back on) sticks. From the first day the row shows "Access paused" and the pause can no longer be cancelled or re-planned |

### TIM-40 · Licence requirements

| story (sub-page) | where it shows live |
|---|---|
| List (Requirements) | /yx/time/setup/licences as HR (leave.settings.manage company-wide; else no access): one row per licence type, "Required for" = its roles / shifts (with location), Role / Shift / Role and shift, Licence + note, Legal / Company, Holders, Needs action (expired / expiring from the API's watch list, overrides counted as "overridden"), "Only needing action". Who needs action drawer: DueBadge per person, Ask to renew / Ask all to renew (once a day per person), Override… (company licences, expired holders: reason 5–300 + until ≤ 90 days), Record licence. Edit dialog: name, note, type, reminders (version check: "Someone else changed this licence…"), requirements listed with Remove and added with Role/Shift Segment + role or shift + optional location. Add requirement = the type (Code field, prefilled from the name) + its first requirement. Live: GET /time/licences, POST types, PUT types/:id, POST requirements, requirements/:id/remove, holders, overrides, renew-asks. Gap: "Skill" (the design's third kind) has no data model, so the Segment offers Role and Shift; no "active" switch (the API keeps it, the dialog sends it unchanged) |
| Record (Record licence) | /yx/time/setup/licences → Who needs action → Record licence: Person, Licence number, Valid from, Expires on (empty = never); a renewal is recorded the same way (the latest counts). Design added first (story Record) |
| Blocked (Roster block · expired licence) | shown on the roster (/yx/time/roster: Licence conflict in Law and rule checks, and LICENCE_GUARD refusal); the licences API does not list who is rostered within 14 days, so this page shows no Blocked alert |
| Empty | /yx/time/setup/licences with no licence types: "No licence requirements yet" + Add requirement |
| Loading | /yx/time/setup/licences while GET /time/licences loads (also error with Try again, and no access) |

### TIM-41 · Hybrid office days

| story (sub-page) | where it shows live |
|---|---|
| Manager (Manager · team plan) | /yx/time/hybrid as a manager (Divya): "Plan week" grid of the manager (you) and their own team for this or next week, Home/Office switch per open day, anchor and closed days (holiday, leave, today, over) as badges, "Short by N" + Remind (once a day, bell notice), "In office" totals; Save plan (toast). Live: GET /time/hybrid/me, /team, PUT /plan, POST /remind. Small differences: this week is the same grid (open days still plannable) instead of a read-only "Who's in this week" card; a day not yet planned shows "Not set"; a manager's change says "Updated for …" (no notice to the person) |
| Compliance (Weekly compliance) | Title as the design's "Office days · <team>": manager "Office days · Your team", HR "Office days · Everyone" (compliance reaches the whole company, `can.everyone` from GET /time/hybrid/me) or "Office days · The people you see" (scoped), employee "My office days" (fix 29 Oct 2026: HR saw "My office days"). Subtitle: the person's rule ("3 office days a week · anchor day Wed"); HR: "Whole company · …" from the company policy, else "Office-day rules for N groups · see the Policy tab", else "No office-day rule yet. HR sets one on the Policy tab." Gap: the design's place · group name ("Chennai office · Quality, Engineering") is not sent by the API. /yx/time/hybrid → Compliance (manager: own team; HR: attendance.view in scope): last week per person, office days with evidence (geofence / office network / kiosk per hybrid.evidence) + full leave days vs hybrid.office_days, "planned but not in" days, Met / N of M / No rule, "Remind about next week". Gap: on-duty days are not counted (no on-duty request in the API); no week picker (the design shows one week) |
| Policy (HR · policy) | /yx/time/hybrid as HR with org.settings.manage ("Hybrid policy" when it is their only tab, else a "Policy" tab): group = company, legal entity, location or department; office days (0 = no rule), anchor days, evidence; saved through PUT /org/settings (three settings). Gap / Question: "Link to pay deductions or ratings" has no setting (no pay link), so the form only says missed days don't affect pay |
| Employee | /yx/time/hybrid as an employee (Arjun): Home/Office Segment per open day, anchor days fixed, "You: N of M office days" + Short badge, "Who else is in" (same manager), Save plan (toast; pressed with no change says why). No rule (office days 0): "No office-day rule for you" |
| Phone (Phone · my office days) | phone view, mobile app not built |

### Counts

56 sub-pages (3 new stories: TIM-05 Notice, TIM-38 SetStandby, TIM-40 Record): live 40 · feature not built 5 · phone view 10 · gaps 1 (3 Nov 2026: TIM-06 Flexi and Split are live, so TIM-06 is 7 live; the table at the top is the current count).
Live 40 = TIM-05 10, TIM-06 5, TIM-08 5, TIM-34 5, TIM-35 3, TIM-38 4, TIM-40 4, TIM-41 4. Not built 5 = TIM-06 Flexi and Split, TIM-39 ×3
(not in this scope). Gap 1 = TIM-40 Blocked (shown on the roster instead). Also gaps inside live stories, listed in the rows (TIM-08 "Change my shift",
TIM-34 OT forecast / CSV import / AI summary, TIM-35 bid windows, TIM-40 Skill).

### Questions

- Question: Overtime rules, Timesheet projects and Night-work records have no design. They stay as extra tabs of the live TIM-06 screen, built from the same Card / Drawer / table parts. They need designs.
- Decided 29 Oct 2026 (founder): employees see their team's published roster only when HR turns on `roster.staff_see_team` (off by default).
- Question: a saved pattern can't be edited (the API has create, apply and remove only). Live shows its days read-only and says "add a new one for a new rhythm".
- Question: "Change my shift" (ask the manager for another shift, no colleague) is not in the API. The rest check on swaps is built (REST_GUARD).
- Question: a location's usual shift has no shift id, so a swap of a "usual shift" day is written as a weekly off when approved (older behaviour, unchanged); the rule checks judge it as the person's own usual shift. Fix by giving the location's shift an id?

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
| Manager · own reports (`Manager`) | /yx/time/overtime-review as a manager: Approve, Reject (reason), Give comp-off, and bulk Approve / Reject within the limit. Each is the viewer's own approval task (POST /time/overtime/:id/decide → the shared engine), so Approvals shows the same state (founder: yes). |
| Plant head · over the legal limit (`PlantHead`) | /yx/time/overtime-review: a claim over the limit shows the red "Over the limit" badge and its minutes; the manager sees its status. |
| HR (`Hr`) | /yx/time/overtime-review as HR (scope: everyone). |
| HR · override limit with reason (`Override`) | /yx/time/overtime-review → "Override limit" on a claim HR may pay → dialog; Pay pressed without a 10-letter reason shows the field error. |
| Convert to comp-off (`CompOff`) | /yx/time/overtime-review → … → Give comp-off: settles the claim as comp-off and approves it (never under the Factories Act; needs a comp-off leave type; a reason when part is over a limit). |
| Empty (`Empty`) | /yx/time/overtime-review, a month with no claims: "No overtime to review". |
| Loading (`Loading`) | /yx/time/overtime-review while loading (table loading). |
| Error (`Failed`) | /yx/time/overtime-review when the call fails: error with Retry. No access: "You don't have access to overtime". |

#### TIM-11 · Periods

| story (sub-page) | where it shows live |
|---|---|
| HR · month cards (`Hr`) | /yx/time/periods: month cards per legal entity (newest first), stage badge, "Locked 2 Sep 2026 by …". Year arrows: Next at this year and Previous before 2025 stay clickable and say why (toast). |
| Payroll Admin (`PayrollAdmin`) | /yx/time/periods as payroll (attendance.lock.approve, "Approve attendance lock"; founder decision 5) when the company's attendance.lock_flow = two_step: "With payroll" cards, Approve lock (authenticator step; never the person who sent it). |
| Pre-lock checklist · blocked (`Checklist`) | /yx/time/periods → "Pre-lock checklist" on an open month: exceptions and each waiting request kind with counts; "Lock the month" pressed says "Settle what is still waiting…" and focuses the list. |
| October · month not over (`NotEnded`) | /yx/time/periods → current month card "Can be locked from the 2nd of the next month"; in its checklist, Lock pressed says "October 2026 can be locked from 2 Oct 2026." |
| HR · send for payroll approval (`Send`) | /yx/time/periods (two_step) → checklist → Send for approval (freezes the month; refused while anything is open). Setting attendance.lock_flow, default one_step (HR locks). |
| Payroll Admin · approve lock (`Lock`) | /yx/time/periods → checklist (all done) → "Lock the month" (one step) or "Approve lock" (two step) → plain confirmation → the authenticator step (founder OK, 29 Oct 2026; the story no longer types a name). |
| Lock summary · filed month (`Summary`) | /yx/time/periods → "Lock summary" on a locked or filed month: lock date and person, stage, whether reopen is allowed. |
| Reopen request · September locked 1 Oct (`ReopenAllowed`) | /yx/time/periods → "Request reopen" on a locked month (card or summary) → dialog; reason of 10+ letters; sent → toast; the card then shows "Reopen asked · Waiting for two approvals". A filed month shows "Filed: corrections only". |
| HR · open a frozen month again (`OpenAgain`) | /yx/time/periods → "Open the month again" on a Frozen card (attendance.lock over the entity) → dialog: reason of 10+ letters (pressed early: field error and focus, never disabled), then the authenticator code → toast; the card shows Open and "reopened … : reason". Payroll-frozen months are refused with the reason (founder decision 7a). |

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

Also not live from this design: "Copy last week" (the API returns only last weeks' totals, not their lines). "Pre-fill from my tools" is live since 29 Oct 2026 (TIM-43 drawer, work-tool providers: to decide).

#### TIM-16 · Attendance reports

| story (sub-page) | where it shows live |
|---|---|
| Late and early (`LateEarly`) | /yx/time/reports: late marks, early exits, OT hours and unpaid days by department and site, chart and table, CSV export. |
| Overtime (`Overtime`) | /yx/time/reports → Report: Overtime (approved paid OT hours lead). |
| Form 25 register (`Form25`) | /yx/time/registers: the register card per establishment with Download PDF / Excel (toast when done; "Draft" when the month is not locked). Gap: the register rows are only in the download, not on the page. |
| Women night-shift register (`NightRegister`) | /yx/time/reports → Register of women night-shift workers (attendance.view): shifts, night hours (7 pm–6 am), consent on file. Gap: pick-up and drop records (not in the app). |
| August 2026 (locked) (`August`) | /yx/time/registers ("Month locked") and /yx/time/payroll-feed ("Frozen 2 Oct 2026") with a locked month picked. |
| Manager · my team (`Manager`) | /yx/time/reports as a manager: their reports by person (no statutory registers). |
| Empty · no rows for these filters (`Empty`) | /yx/time/registers with no establishment in scope; /yx/time/payroll-feed with no legal entity or no people. |
| Loading (`Loading`) | Both pages while loading; errors show Retry, no access says who grants it. |

#### TIM-30 · Leave reports

| story (sub-page) | where it shows live |
|---|---|
| Balances (`Balances`) | /yx/time/balances: everyone in leave.view scope × leave types, filters (entity, location, department, name) in one toolbar row with Columns / density at the right (live addition to the design; fixed 29 Oct: toolbar selects are content-sized in the shared table toolbar; at 1278 x 635 the toolbar is 63 px, was 195 px, and 8 rows show, was 5), 50 a page with Previous / Next, Export CSV (every row, up to 10,000), Open leave card per row |
| Leave taken (`Taken`) | /yx/time/balances → Report: Leave taken (this leave year) |
| Unpaid leave (LOP) to payroll (`Lop`) | /yx/time/balances → Report: Unpaid leave (LOP), by month: unpaid leave days and absent days with no leave |
| Payroll · liability (`Liability`) | /yx/time/balances → Report: Leave liability, for someone with leave.view, or with leave.liability.view alone (Payroll: menu link "Leave liability", the picker lists this report only, no leave cards; founder answer A), who may see pay: KPIs (unused days, liability of the people on the page, the daily-pay rule), days per type, Daily pay, Liability, "No pay set"; Export CSV with the money. Partial gap: the "by month" chart and "Change vs last month" need monthly snapshots (not built) |
| Liability · days only (`LiabilityDays`) | same report for someone without pay access: the days only and "The money shows only to people who may see pay"; the API sends no money fields |
| Negative balances (`Negative`) | /yx/time/balances → Report: Negative balances |
| Ledger (`Ledger`) | /yx/time/balances → Report: Ledger, by month (the Month picker sits by Report in the page header, also for LOP; in the toolbar it pushed Columns to a second row at 1278 x 635) |
| Loading (`Loading`) | /yx/time/balances while loading |
| Error (`Failed`) | /yx/time/balances when the API fails: Retry |

#### TIM-37 · Industrial-action event

| story (sub-page) | where it shows live |
|---|---|
| Record event (`Form`) | /yx/time/industrial-action (attendance.lock): type, establishment, dates, workers (everyone or one department), legality, notice; Record event with a confirm |
| Record event · legal picked (`Legal`) | same, Legality: Legal (the effect line shows the pay) |
| Event record · lay-off (`Record`) | /yx/time/industrial-action?id=… : KPIs, pay and attendance treatment, Edit dates, Cancel event, Change legality (version-checked) |
| Event record · legality not set (`RecordUndetermined`) | same, undetermined: "Pay for N worker-days is on hold" with Set legality |

| Past events · list (`List`) | /yx/time/industrial-action (the page now opens here; founder decision 7b): events in scope newest first, dates "3 Nov 2026 – 5 Nov 2026", establishment, workers, legality, status; Open → ?id=; Record event → ?new=1; server paging 25 / 50 / 100 |
| Past events · none yet (`ListEmpty`) | same, no events: "No strikes, lockouts or lay-offs yet" with Record event |
| Past events · loading (`ListLoading`) | same, while loading |

The record has "All events" back to the list; the form's Cancel goes to the list. No phone stories in this group.

#### TIM-43 · Timesheet pre-fill from my tools

| story (sub-page) | where it shows live |
|---|---|
| Suggestions · rule and AI (`Suggestions`) | /yx/time/timesheet → "Pre-fill from my tools" (only while timesheet.tool_suggestions is on for the person): suggestions for days up to today from the connected tools, mapped onto active projects (an unknown project asks "Choose a project" and Accept pressed first says so and focuses it); Accept / Edit / Reject / Undo / Accept all new put hours into the grid only; the week is saved by Save draft. Providers: to decide (work calendar, issue tracker, code host; dev-fake today). Gap: "Manage rules" (personal matching rules) is not in the API; matching is by project code or name |
| Connect tools (`Connect`) | Same drawer: "Your tools" card, Connect / Revoke per tool (one live connection per tool, revoke audited and always allowed); "Connect a tool to get suggestions" when none is connected; "Not set up for your company" when the setting is off |
| No suggestions (`None`) | Same drawer, connected tools with nothing to match this week: "No suggestions for this week" + Fill week by hand / Connect the next tool |
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

- Sub-pages live: 39 (TIM-09: 8, TIM-11: 9, TIM-15: 5, TIM-16: 8, TIM-30: 2, TIM-37: 7); TIM-30 Payroll · liability and Liability · days only are live since 29 Oct (founder decision 3)
- Feature not built: 10 (TIM-30: 7, TIM-43: 3)
- Phone view: 3 (TIM-15: 2, TIM-43: 1)
- Gaps: 0. Partial gaps noted in the rows: sent-back reason, locked-week correction, register rows on the page, night-register pick-up and drop.
- Kit: 24 shared parts (listed above), not counted as pages.

## F. Field force (live page /yx/time/field-force since 29 Oct 2026)

### TIM-32 · Field-force map

| story (sub-page) | where it shows live |
|---|---|
| Manager · live map | live: /yx/time/field-force as a manager (own team, implicit): `FieldForceScreen live={…}`; pins only for people on duty with consent and tracking on; map is the GeoMap drawing (no tiles); maps / place names: adapter, dev-fake, provider: to decide |
| HR · all field staff | live: /yx/time/field-force with attendance.view in scope ("All field staff", manager name on each row; field staff = tracking on or visits today, first 200) |
| Person trail and visits | live: Open on a row → drawer with the duty trail (good readings only), distance, visits today (GET /time/field/people/:id) |
| Integrity flag | live: mock location / impossible speed (> 200 km/h) flag and "Mark reviewed" (toast); gap: "Ask … for a note" (no note request feature yet) |
| Tracking off for group | live: no one in reach has `field.tracking` on → HR: "Open settings" (Settings › Company rules); gap: the manager's "Ask HR" button (no request-to-HR feature yet) |
| Person not checked in | live: "Not checked in" badge and "Not on duty yet" panel, no location; gap: "Message …" button (no messaging from here yet) |
| Consent withdrawn · no trail | live: "No trail: consent withdrawn at …" (withdrawal deletes the trail, keeps attendance days and visits; founder decision 6); also "has not agreed" for people who never consented |

### TIM-33 · Visit check-in and beat plan

| story (sub-page) | where it shows live |
|---|---|
| Consent (first use) | phone view, mobile app not built; API live: GET /time/me/field (notice, version), POST /time/me/field/consent |
| Beat plan · tracking banner | phone view, mobile app not built; API live: my beat today in GET /time/me/field, readings POST /time/me/field/pings; managers plan with POST /time/field/visits (no web plan screen in the designs) |
| Visit check-in · inside site | phone view, mobile app not built; API live: POST /time/me/field/visits/:id/check-in (inside the radius), /check-out; web: Visit log tab |
| Visit · outside site | phone view, mobile app not built; API live: the same check-in answers inside: false (shown "Outside site" in the Visit log) |
| Camera photo | phone view, mobile app not built; gap: no visit photo in the API yet |
| Distance → draft mileage | phone view, mobile app not built; gap: distance is shown on the map, no mileage claim link yet |
| Consent withdrawn | phone view, mobile app not built; API live: POST /time/me/field/consent/withdraw (tracking stops, trail deleted, days and visits kept, audited with counts) |
| Withdraw consent · confirm (`WithdrawConsent`) | phone view, mobile app not built: the tracking banner's Withdraw consent opens the same dialog as TIM-36 (founder decision 6) |
| Web app · only while open | phone view, mobile app not built |

## G. Time ops feature sheet (attendance, overtime, periods) · 29 Oct 2026

Built in branch `feat/yukthix-time-ops`. Designs made live: TIM-01, TIM-02 (stages, bulk), TIM-03 (overtime, HrFix),
TIM-04, TIM-07 (late request), TIM-09 (decisions), TIM-10, TIM-11 (two-step), TIM-16 (late / OT / night register),
TIM-36, TIM-37, Extra · Attendance calendar (Locked, LockedDay). Migration `20261129100000_time_ops` (additive).

### Rules and where they come from

Law (P07 data on the compliance verify list, never code; the code falls back to the national value):
- **Overtime (Factories Act s.59, 64, 65; state Shops and Establishments acts):** at most 10 h of work a day and 125 h of
  OT a quarter (IN.FACTORIES `dailyMaxWorkMinutes`, `quarterlyOtMinutes`; quarter = Jan–Mar …). OT is paid at 2× the
  ordinary rate (`rate`). Minutes past a limit are "over the limit": paid only after an HR override with a reason
  (leave.approve over the person, never one's own claim). Where the Factories Act covers the person (setting
  `attendance.factories_act` + the employment category), OT is always paid at the legal rate, never comp-off.
- **Women at night (OSH Code / Factories Act s.66 as each state applies it):** night window 7 pm – 6 am (IN.OSH). The
  register of women night-shift workers lists each woman's night shifts, night hours and consent on file.
- **Industrial action (Industrial Disputes Act 1947 s.22–25C; Payment of Wages Act 1936):** strike days unpaid whether
  legal or not (a tribunal's later award is a correction); lockout unpaid when legal, full wages when illegal; lay-off
  unpaid in attendance and paid as lay-off compensation (50 % of basic + DA, s.25C) by payroll when legal, full wages when
  illegal; undetermined holds the pay (neither paid nor unpaid) until HR sets the legality. Weekly offs, holidays and
  approved leave inside the event stay as they are; a worker who checked in that day worked. Product choice (no law): the
  45-day lay-off ceiling and the "50+ workmen" threshold are payroll's when it pays the compensation.
- **Late requests after a lock (P08 Q4, YX-LOCK-02):** a day of a frozen or locked month goes as a late correction
  (manager → HR → payroll), paid in the next payroll, up to `payroll.late_request_max_days` (default 60) days back; past
  that only HR records a correction.

Company policy (a setting with a default; HR changes it per company or legal entity):
| setting | default | what it does |
|---|---|---|
| `attendance.lock_flow` (new) | `one_step` | one step: whoever holds attendance.lock locks; two step: HR sends, payroll (attendance.lock.approve, decision 5) approves, never the same person |
| `attendance.late_marks_free` (new) | 3 | late marks a month without a deduction (the day card's "Late mark N of 3 free" now reads it) |
| `attendance.late_mark_penalty` (new) | 0 | days of pay each late mark over the free ones costs (0, 0.5, 1); goes into the feed's unpaid days (`late_lop_days`) |
| `attendance.presence` (new) | off | presence-based attendance on work-from-home days |
| shift: grace, half-day and full-day minutes, break rule | per shift (General 10 / 240 / 480, 30 above 5 h) | late mark after the grace; present at full-day minutes, half day at half-day minutes, else absent |
| OT rule: minimum, rounding, daily cap, approval, settle (pay / comp-off), comp-off half / full minutes | per rule (30 min, 15-min steps) | weekly-off and holiday work: the whole day counts; settle as comp-off or pay |
| `attendance.missing_punch_effect` | block payroll approval | a missing check-in / check-out blocks the lock until resolved or corrected |
| `attendance.regularise_monthly_limit` / `wfh_monthly_limit` | 4 / 4 | beyond them HR approves too |
| `attendance.mode` | punch | punch, assumed present or timesheet |

Product defaults (decided here; questions below):
- A month can be frozen or locked from the 2nd of the next month (its last night shift has ended). Freezing fixes the
  days in the database (founder D2), so it is refused while requests still wait; HR may open a month it froze again
  with a reason (not one payroll froze for a run).
- Night shift across midnight: a punch belongs to the day the shift started (YX-AT-13, existing).
- Time zone: each day is the location's own date (`locations.timezone`), never the server's; "today" is the person's.
- Joiners and leavers mid-month: only days between joining and leaving count (calendar days, paid days, exceptions).
- Transfers: each day uses the assignment in force that day (location, rules, legal entity, OT rule).
- HR resolution (TIM-04 / HrFix / bulk): present (with times: worked out like a fix, late mark included; without: present)
  or absent (final, unpaid). It outranks the employee's fix, is kept as history (latest wins, never edited), and a repeat
  within a minute is the same resolution. Today is never resolved; a waiting fix is decided first.
- Presence: counts only with consent in force all through the day and the company switch on; it decides the day only
  when there are no punches (active minutes against the shift's thresholds).

### Who may do what (checked on the server; the UI only hides)
| action | who | sees |
|---|---|---|
| Today board, exceptions, reports, presence days | manager (own reports), HR with attendance.view (scope) | team / scope, never themselves |
| Resolve, bulk mark present | leave.approve over the person | never one's own day; not while acting for someone |
| Decide OT on the review page | the holder of the claim's open approval task | same engine and rules as Approvals |
| Freeze, open again, send, lock (one step) | attendance.lock over the legal entity | lock and approve need the authenticator step |
| Approve lock (two step) | attendance.lock.approve over the legal entity (Payroll role by default; decision 5) | never the person who sent it |
| Industrial action, device punches | attendance.lock over the legal entity | device apply needs the authenticator step |
| Night-shift register | attendance.view | HR only |
| Presence consent and states | the person only | their own times; others see status and total |

### API routes (AttendanceOpsController, `/api/v1/time`)
GET `today`, GET `exceptions`, POST `exceptions/resolve` (leave.approve), POST `muster/mark-present` (leave.approve),
POST `periods/freeze` | `unfreeze` | `send` (attendance.lock), POST `periods/approve-lock` (attendance.lock.approve,
step-up), POST `overtime/:id/decide`, GET `reports/attendance`, GET `reports/night` (attendance.view), GET/POST
`industrial-actions` (+ `options`, `:id`, `:id/legality`, `:id/dates`, `:id/cancel`; attendance.lock), GET
`me/presence`, POST `me/presence/consent`, POST `me/presence/signals`, GET `presence`, GET `device-batches`
(+ `preview`), POST `device-backfills` (attendance.lock, step-up). Changed: GET `periods` and `periods/preflight` also
for payroll; POST `periods/lock` refuses in the two-step flow; the muster returns its period card; the day card returns
overtime, late marks, HrFix and the resolution; `me/attendance` returns locked days. Payroll: held device punches for open
days are applied from Time.

### States covered
Empty, loading, error, no access on every page; not set up (no OT rule, no comp-off type, presence switched off, no
establishment in scope, no device batch); too early (freeze / lock before the 2nd, today read only); over the limit
(OT caps; late requests past 60 days); locked / frozen (resolve, legality and dates refused; late route); already done
(repeat resolution, repeat send, decided claim, nudged today); someone else first (event version check, approval task
closed, batch changed since review); acting for someone else refused.

### Questions (sensible defaults taken)
1. Default lock flow is one step (keeps today's behaviour); the founder's "HR sends, Payroll Admin approves" is one
   setting away. Should two step be the default for new companies?
2. ~~Payroll's approval key~~ Decided (5): `attendance.lock.approve`; `unfreeze` now also asks for the second step (7a); GET `industrial-actions` is paged (7b).
3. "Deduct leave" in the resolve dialog needs an HR-leave-on-behalf API from the Leave builder; not offered live.
4. Reminders for past-day exceptions ("Remind all" on TIM-04): the nudge API covers today's check-in only; not offered.
5. Decided (6, 7): designs added and live. Was: no design for opening a frozen month again, a list of industrial-action events, withdrawing presence consent on
   the web (the consent page is a phone design). The API exists for each; the UI has only what the designs show, plus
   Withdraw consent on the presence page header (consent must be withdrawable).
6. Visitors on site (TIM-01) and the field map (TIM-32) wait for their modules.

## Founder answers, 2 Nov 2026 (leave rules, year end, on duty, "ok for all")
(1) Paternity stays a company choice until the compliance partner confirms a state law; (2) maternity: the server keeps
refusing "refuse short notice" and switching the type off; (3) year end pays out cash-in leave over the cap by default
(company setting); (4) the change-leave-year screen keeps "New leave year starts in", default April; (5) a design story
for a sent-back on-duty request ("Change and send again"), TIM-19 SentBack style; (6) overtime pre-approval is built next
(a planned-overtime record the claim reads); (7) the attendance page's "Request work from home" button becomes
"New request" (Regularise / WFH / On duty), so on duty is findable; (8) the change-leave-year page fits 1278 x 635.

## Founder answers, 2 Nov 2026 (overtime pre-approval, "ok for all 4")
(1) a manager planning overtime for a report gets a "Pre-approve overtime" action designed on the team muster first, then
wired to the existing API; (2) overtime past the pre-approved hours is allowed and flagged to the approver, not refused;
(3) `attendance.overtime.pre_approval` defaults to `flag`; (4) overtime pre-approval is manager-only (no HR step, no send
back), like work from home within its limit.

## Founder answers, 2 Nov 2026 (Pre-approve overtime on the muster, "ok for all")
(1) the muster sends the company's `attendance.overtime.plan_ahead_days` and the sheet uses it; (2) only the reporting
line (direct and indirect managers) may pre-approve a report's overtime; dotted-line, department-head and HR routes are
removed from the plan endpoint; (3) for people covered by the Factories Act the sheet offers only Paid overtime.

Built 2 Nov 2026 (branch `feat/yukthix-ot-muster-2`): (1) the muster gives each person in the viewer's reporting line
`ot: { aheadDays, factoriesAct }` and the sheet's date limit and hint use it; (2) POST time/team/overtime/plans/:employeeId
is for direct and indirect managers only (dotted-line managers, department heads and HR now get 404; oneself 403);
(3) a factory worker gets only Paid overtime in the sheet (new TIM-02 story PreApproveFactory); the server still refuses
comp-off for them. Recounted by script (timecount3): 347 sub-pages, 291 live, 4 not built, 52 phone, 0 gaps; Attendance
108 → 109 live. Manual tests MT-TIM-L-35..38.

Built 2 Nov 2026 (branch `feat/yukthix-exit-order-callout`, pay gaps answer 3): the roster's weekly-hours rule (rule 2,
`roster.max_weekly_hours`) counts the call-out hours of a person's on-call slots (PAY-35) on their day when the slot's
on-call rule says "count call-out hours towards the weekly limit"; a rule that says no adds nothing. It applies everywhere
the roster guard judges a week (week view warnings, publish, swaps, open shifts, auto-roster) and the message says
"N h of call-outs included". On-call is pay data: the guard opens the pay guard for this check only, to the person's own
legal entities, reading dates, hours and the flag. No new stories (the week warning already has its design). Manual tests
MT-TIM-L-39..40.

## Founder answers, 2 Nov 2026 (flexi and split shifts)
(1) Flexi: late if the person arrives after core hours start; short if the day's total is below the shift's hours (both
company settings with defaults). (2) Split: each part is checked for late/early on its own; the gap is unpaid and not
worked; missing one part is a half day; rest and weekly-hour checks use both parts. (3) Flexi and split are company
settings, off by default; existing fixed shifts do not change.

## Founder answers, 3 Nov 2026 (geofence points and computer approval, "all good")
(1) a switch for `attendance.web_device_approval` on TIM-14 Devices and kiosks, designed first; (2) the TIM-14 tabs are
renamed "New device requests" and "Employee devices"; (3) a person may have more than one approved computer (keep);
(4) HR admins get a notification when someone asks for a computer to be approved; (5) accepted: the approval rides on the
sign-in device cookie, so moving that cookie moves the approval.
Built 3 Nov 2026 (branch `feat/yukthix-flexi-split`, founder answers on flexi and split shifts): TIM-06 Flexi and Split
are live.
- Settings (Settings › Company rules › "Flexi and split shifts"): `attendance.shift_types.flexi` and
  `attendance.shift_types.split` (company, off by default; off, the API refuses the type with SHIFT_TYPE_OFF and the
  Shift tab shows no Type field), `attendance.flexi.late_from` (`core_start` default, or `never`),
  `attendance.flexi.short_by` (`shift_hours` default: below the full-day hours is a half day / absent as for any shift; or
  `core_hours`: present when in for all core hours), `attendance.split.min_gap_minutes` (30 / 60 default / 90 / 120 / 180).
- Data: `shifts.kind` (fixed / flexi / split, never changes once saved; every existing shift is fixed), and on
  `shift_versions` core start / end and overtime-after (flexi), first part end / second part start (split). Migration
  `20261420000000_flexi_split_shifts` (check constraints; the tables already have forced RLS). Created and new versions
  are audited with the type's fields.
- Set-up checks (API and the form): core hours inside the shift; split parts in order, no overlap, within 24 h, the gap at
  least the company minimum, no break rule (the gap is the break); a fixed shift carries neither.
- Day engine: flexi is late from core start + grace (or never); a split judges each part on its own (late per part, the
  gap is never worked time, one part missing is a half day, a check-in left open is a missing check-out, a half-day leave
  expects only the other part); a night split across midnight belongs to the day it started.
- Roster guard (week view, publish, swaps, open shifts, auto-roster, standby): hours a day and a week count both parts
  of a split and a flexi's hours (overtime-after, else the full day); the spread-over and rest use the whole day (a split's
  gap included, a flexi's whole window). The night window checks only a split's parts.
- Muster (TIM-01 today): late counts from core start on flexi, from the part checked in for on a split; the monthly
  register's "early" is before core end on flexi. Night register: only a split's parts count as night minutes.
- Overtime and the payroll feed: overtime counts beyond both parts (split) or after the flexi's hours; the feed pays days
  by the engine's status, so a split's missing part is half a day.
Manual tests MT-TIM-L-50..57.

Questions (safe default built, suggested answer):
1. A flexi shift's rest and spread-over use its whole window (the person may come at the start and leave at the end), so
   a wide window (for example 7 am – 10 pm) warns on rest every day. Suggested: keep (it is the legally safe reading);
   HR sets windows inside the limits.
2. When the company turns flexi or split off again, existing shifts of that type keep being judged as their type, but new
   times for them are refused. Suggested: keep.
3. The design's fourth type "Night (across midnight)" stays a fixed shift ending next morning plus the Night allowance
   switch (as before); the live Type field offers Fixed, Flexi and Split. Suggested: keep.

## Founder answers, 3 Nov 2026 (flexi and split shifts built, "all good")
(1) a flexi shift's rest and spread-over checks use its whole window (legally safe); HR sets windows inside the limits;
(2) turning flexi or split off again keeps existing shifts of that type working but refuses new times for them;
(3) the Type field offers Fixed, Flexi and Split only; a night shift stays a fixed shift ending next morning plus the
night allowance switch.
