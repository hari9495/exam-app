# Time module review, round 2 (after fixes)

No cap on problems. Status: new, NOT FIXED (from round 1), BROKEN BY FIX.

## XT · Extra · My attendance today (web clock-in) (round-1 fixes verified: 6)

- **XT.1** [H, new] **Clock-out early ignores the unpaid-break rule** — Use one worked-time function: subtract the break taken, or 30 min when there was no break and the day ran over 5 h. Show '7 h 02 m of 8 h 30 m'.
- **XT.2** [M, new] **Regularise drawer asks for a check-out on a day still in progress** — For today, while still clocked in, offer only check-in fixes and hide check-out. Hint check-out with the shift end (6:30 pm). Better still, prefill the recorded times.
- **XT.3** [M, BROKEN BY FIX] **'Wrong time recorded' doesn't show what was recorded** — Under the date, show the recorded punches for that day ('Recorded: in 9:38 am · no check-out'). In 'What changes', show the old time → the new time.
- **XT.4** [L, NOT FIXED] **Outside-network alert still repeats its title** — Body: 'Clock in as WFH or on duty instead?'
- **XT.5** [L, NOT FIXED] **Web block still uses location wording, not network** — Title 'Not on Chennai office Wi-Fi'. Button 'Check again'.
- **XT.6** [M, new] **Clock out is disabled on break with no reason** — Add a reason beside it: 'End your break to clock out'. Or let Clock out end the break and clock out in one step.
- **XT.7** [M, new] **After choosing WFH there is no way back, and the rules disappear** — Keep a short line under the badge: 'WFH · needs Divya Menon's approval · 1 of 4 used this month', with a bordered 'Change' button that brings back the choice.
- **XT.8** [M, new] **Punch note has no Save or Cancel, and the target punch is unclear** — Label it 'Note for your next punch (clock-out)' or 'Note on 9:38 am in'. Add bordered Save and Cancel buttons.
- **XT.9** [L, new] **Not clocked in after the grace period gives no warning** — After 9:40 am show an amber 'Late by 2 m if you clock in now · last free late mark'.
- **XT.10** [L, new] **Device block tells a desk user to use their phone** — 'This computer isn't approved for clock-in. Use your approved device, or ask HR to approve this one.'
- **XT.11** [L, new] **Short day shows an amber bar with no explanation** — Use neutral when the gap is within tolerance. Otherwise add a reason line ('4 m short · no effect on pay' or what happens).
- **XT.12** [L, new] **'1 day to fix before payroll' reads like a deadline** — '1 day needs fixing before payroll closes on <date>' with a relative badge for the cut-off.
- **XT.13** [L, new] **Month spelled 'Sept' in some places and 'Sep' in others** — Make shortDate use 'Sep' (fixed month names, not the locale's 'Sept').
- **XT.14** [L, new] **Request counts differ between the side nav and the bottom tabs** — Drive both badges from the same count.
- **XT.15** [L, new] **Drawer footer wraps badly on a phone** — On phones, put the hint on its own line above and Cancel and Send side by side (or stacked full width).
- **XT.16** [L, new] **Week codes 'P' and 'H' are unexplained letters** — Use words: 'Present' and 'Holiday' (or drop the chip, since the times and the holiday name already say it).

## XC · Extra · Attendance calendar (round-1 fixes verified: 8)

- **XC.1** [M, new] **Meera's comp-off overtime is counted as approved paid overtime** — Give comp-off overtime its own status and leave it out of the 'Overtime' KPI, or show 'Overtime 1 h 45 m · taken as comp-off'.
- **XC.2** [M, new] **Manager 'Open exceptions' button does nothing** — Go to TIM-04 Exceptions filtered to this person.
- **XC.3** [M, new] **Locked August still shows 'Days to fix 1' with no way to fix it** — In a locked month, hide 'Days to fix'. Or relabel it 'Can ask to change' and add a 'Raise late request for 21 Aug' button.
- **XC.4** [M, new] **Main screen at 390 wraps cell notes into 3 lines** — Use AttendanceMonth's compact mode (no late/OT sub-line) under about 600px, as the Phone story does, or shorten the note to '+22m' / 'OT 1h'.
- **XC.5** [L, new] **Error state still offers Export month and Regularise a day** — Disable Export month and Regularise a day while state is error or loading, and wire Retry to reload.
- **XC.6** [L, new] **Export month does nothing** — Download the month as CSV or PDF, or show a 'Preparing export' toast.
- **XC.7** [L, new] **Two date formats: '22 Sept' / '10 Sept' vs '10 Sep'** — Use one formatter (formatDate without the year) everywhere, so it reads '22 Sep'.
- **XC.8** [L, new] **'1 regularisations sent' grammar** — Pluralise it as '1 request sent' or 'N requests sent'.
- **XC.9** [L, new] **'since 23 Sep' is hard-coded for every waiting day** — Read the sent date from the exception or request row.
- **XC.10** [L, new] **22 Sep day card says 'pending' twice, and 'Regularise sent' is ungrammatical** — Use one line: 'Request sent 23 Sep · waiting for Divya Menon', next to View request and Withdraw.
- **XC.11** [L, new] **Phone and desktop label the same totals differently** — Reuse the desktop labels and notes on phone, and add the waiting count, or a '22 Sep waiting for Divya Menon' line with View.
- **XC.12** [L, new] **Meera's today cell and late count disagree with the Today board** — Show today's late in the cell ('Now · late 11 m') and count it, giving 'Late days 3 · 3 allowed a month'.
- **XC.13** [L, new] **Kiosk punch line repeats 'Kiosk' and shows a device code** — Show 'Chennai office · Reception kiosk'. Keep the device code for HR views only.
- **XC.14** [L, new] **Locked-month alert has no action** — Add 'Pick a day to raise a late request', or a 'Raise late request' button that opens the regularise drawer with an August date.

## T01 · Today board (round-1 fixes verified: 10)

- **T01.1** [H, new] **Empty state contradicts the header, and Nudge all still works** — When state is empty, loading or error, hide 'Nudge all' or disable it with a reason, for example 'No one to nudge'. In the empty state, drop the '(8)' count or say 'Your reports (8) · none rostered today'.
- **T01.2** [M, new] **'Nudge all not checked in' also nudges people who did check in, and never turns off** — Label the button 'Nudge 2 people' with the computed count, or limit it to not_in. Disable it with 'Everyone nudged' once the list is empty. Show a visible confirmation such as '2 nudges sent'.
- **T01.3** [M, new] **Anil Kumar after a 2 am call-out is treated as a no-show** — Give call-out rest its own status, for example 'Rest after call-out · due 11:00 am', shown neutral under WFH / on duty or a 'Resting' group. Remove the Nudge button, and leave him out of the Not checked in count and out of Nudge all.
- **T01.4** [M, new] **Emergency 'On site now' covers only Chennai, though HR scope is all locations** — Add a location Segment (Chennai office / Hosur plant / Bengaluru head office), or one block per site. Each gets its own employee count, visitor count and Download.
- **T01.5** [M, new] **'Visitors on site 3' is hard-coded and lists no one** — Read visitors from the Visitors module data and list them, with host and sign-in time, under the employees. If that data isn't available, drop the KPI.
- **T01.6** [M, new] **Next-step buttons do nothing** — Wire each button to its target screen (TIM-04 Exceptions, TIM-02 Muster, TIM-32 field map, Roster), or at least to the TimePage nav item. Make Retry re-run the load.
- **T01.7** [M, BROKEN BY FIX] **Wrapped person lines now make cards crowded** — Shorten the badge to 'No check-out 28 Sep'. Put the Nudge button under the text, or give the text full width. Keep times unbroken (nowrap on '9:00 am'). For HR, show the site as a short tag only when it differs from the column's majority.
- **T01.8** [M, new] **Phone Team today has no payroll alert, no Nudge all, and doesn't group people by action** — Add the same exceptions alert, with its button, above the list. Sort the list so people who need action (not checked in, missing check-out) come first, then late, then the rest. Add 'Nudge all (2)'.
- **T01.9** [M, new] **Floating help button covers row buttons on phone** — Add bottom padding to the page equal to the help button's height plus a gap, or move help into the top bar on phones.
- **T01.10** [L, new] **Payroll cut-off is tomorrow but shows no relative badge** — Add <DueBadge date={30 Sep 2026}/> ('tomorrow', amber) beside the alert title, matching TIM-02.
- **T01.11** [L, new] **Phone 'In 3' KPI doesn't match the In badges in the list** — Show Priya with both an 'In' badge and a small 'No check-out' badge plus her Nudge, or count her separately. Use the board's label 'Not checked in'.
- **T01.12** [L, new] **Location contradicts status on the HR board** — Skip the base location for wfh and od statuses. Show 'Home' or the duty place instead.
- **T01.13** [L, new] **Field tab: 'No trail' is unexplained for the on-duty auditor** — Give the reason: 'Tracking off · audit at supplier site', or add a field-day record for Nisha. Derive the badge from her data, not from a name match.
- **T01.14** [L, new] **Small jargon and abbreviations** — Use 'Back on 1 Oct' for Rekha, 'Late by 11 min', and 'everyone in your team' (manager) or 'everyone at Kaveri Foods' (HR).
- **T01.15** [L, new] **Empty 'Weekly off 0 · No one' column takes a whole row** — Hide the Weekly off column when its count is 0 (or show it in the KPI row only).
- **T01.16** [L, new] **HR header time breaks across lines at 871** — Keep the date and time together (nowrap span), or put the time on its own line, for example 'As of 9:42 am'.

## T02 · Muster (round-1 fixes verified: 9)

- **T02.1** [H, new] **September locked and 'payroll approved' before the month ends** — Disable Lock period until the cut-off has passed and show the reason beside it ('Lock opens after the 30 Sep cut-off'). For Freeze, either wait for the cut-off or warn that 30 Sep isn't recorded yet. Move the Locked story to a past month (August), or set its date after 30 Sep.
- **T02.2** [H, new] **'No open exceptions' but the grid still shows open MP / A cells** — Build the grid from rows whose exceptions are resolved when resolved/locked (e.g. pass a resolved set into monthFor, so the MP and A days become P or LOP with a note). Or count the blocking cells in MUSTER_ROWS so the badge, dialog and grid can never disagree.
- **T02.3** [H, new] **Day card punch contradicts the exception for the same day** — When a day has an exception (or a TEAM inAt/source for that date), take the in time and source from it. Priya's 28 Sep punch should be 9:29 am, kiosk.
- **T02.4** [M, new] **Assumed-present and timesheet people get late marks** — In MUSTER_ROWS, set lateMin/L only for Punch-mode rows. Assumed-present rows get P/leave/WO only. Timesheet rows get P plus timesheet exceptions.
- **T02.5** [M, NOT FIXED] **Totals scroll away; corner header slides off** — Make the four total columns sticky as well (left offsets after the name column), and make the corner thead th sticky top and left with a higher z-index. On load, scroll the grid so the last two weeks are in view, or add 'Jump to exceptions'.
- **T02.6** [M, new] **No legend for day codes; 'L' reads as Leave** — Render AttendanceLegend under the grid, filtered to the codes it uses. Show late days as 'P' with the 'late' mark, and drop the separate 'L' code.
- **T02.7** [M, new] **Same exception message shown three times** — Keep the reason beside Lock period (on the phone, under it) plus one alert with the button. Drop the red badge in the frozen stage.
- **T02.8** [M, new] **'Open exceptions' button does nothing; open-stage badge has no action** — Wire Open exceptions to the Exceptions screen (or a filtered drawer). Next to the badge in the Open stage, add a bordered 'Open exceptions' button, or filter the grid to people with exceptions.
- **T02.9** [M, new] **Bulk 'Mark present' gives no result and ignores current status** — List each name with that day's current code ('Gopal Iyer · Absent'), and skip or flag people already present. On confirm, show 'Marked 1 person present on 25 Sep' and update the cells and totals.
- **T02.10** [M, new] **Comp-off overtime counted as paid OT hours** — In monthSummary, leave out OT days that were converted to comp-off (or add an otStatus 'comp-off'), so OT h shows only paid overtime.
- **T02.11** [M, new] **Empty state talks about filters that don't exist** — Either add the location/department filters, or say 'No one is on the muster for Kaveri Foods (Tamil Nadu) this month' with an 'Open People' button. Make the header count agree (0 people).
- **T02.12** [L, new] **Payable days include today for some people only** — In monthSummary, exclude days on or after TODAY by date, not by the 'TODAY'/'FUT' codes.
- **T02.13** [L, new] **Header names only missing check-outs** — 'Open exceptions stop payroll approval · cut-off 30 Sep'.
- **T02.14** [L, new] **Hosur lab technicians get office shift and WFH days** — Decide plant/office by location (Hosur plant): no WFH, and the plant shift that matches the Today board.
- **T02.15** [L, new] **Phone cards show 'Punch' and dead 'To fix' badges** — Hide the mode when it is Punch, as desktop does. Make each to-fix date a small bordered button that opens that day card.
- **T02.16** [L, new] **Date format mixes 'Sept' and 'Sep'** — Make shortDate output 'Sep' (en-IN style, or a fixed month array).
- **T02.17** [L, new] **Single-letter weekdays are ambiguous** — Use two-letter days (Tu, Th, Sa, Su) or three-letter days in the header.

## T03 · Day card (round-1 fixes verified: 10)

- **T03.1** [M, BROKEN BY FIX] **'Review overtime' skips the review and goes straight to Approve** — Make 'Review overtime' open the OT review drawer for that row (with Approve in green, plus Reject and Comp-off), or rename the button 'Approve overtime' (green) and add a 'Reject' button beside it.
- **T03.2** [M, new] **Day-card overtime isn't in the overtime data** — Add Divya's 25 Sep (and 11 Sep) rows to the overtime data, or read otMin and otStatus for the day card from that list.
- **T03.3** [M, NOT FIXED] **No story shows pending overtime, so the new HR/manager action can't be checked** — Add a story such as 'Manager · pending overtime' with person 'Arun Prakash' and day 14, or Meera on a day with pending overtime, so the Review overtime path is visible.
- **T03.4** [M, new] **Muster backdrop doesn't say whose month it is** — Title the backdrop '<Name> · September 2026' (for example 'Meera Krishnan · September 2026') with a 'Back to muster' button, or render the muster grid behind the drawer.
- **T03.5** [L, new] **Pending regularisation is stated twice on the card** — Keep one line, for example a header of 'Regularisation pending · sent 23 Sep to Divya Menon' with View request and Withdraw beside it, and drop the bottom badge. Or keep the badge and change the note to 'Request sent 23 Sep: out was recorded outside the office'.
- **T03.6** [L, new] **Missing check-out punch row has no source or location badge** — Give kiosk punches a 'Kiosk' source chip and the inside or outside verdict badge, like mobile punches.
- **T03.7** [L, new] **Map distance not to scale for the outside punch** — Place outside pins by their distance (radius scaled from fence.radiusM), clamped to the map edge with an arrow when off-map.
- **T03.8** [L, new] **Phone: note line starts with a stray dot and the request buttons wrap unevenly** — On narrow widths drop the leading '·' when the note wraps (render it as a second line). Put the badge on its own line and the two buttons together on the next line.
- **T03.9** [L, new] **Missing check-out day shows an empty worked bar** — Draw an open (hatched) segment from 9:31 am, labelled 'no check-out'.
- **T03.10** [L, new] **HR subtitle entity is hard-coded** — Use the person's code, location and entity from TEAM/ME, for example 'HR view · KF-0001 · Chennai office'.
- **T03.11** [L, new] **'on duty' repeated in every on-duty punch row** — Show just 'Hosur plant · Pixel 7a · approved phone' in the rows. The chip can say 'On duty' instead of 'Field visit', or be dropped.

## T04 · Attendance exceptions (round-1 fixes verified: 9)

- **T04.1** [H, new] **Empty story says 'nothing open' while the header still shows '5 blocking' and an enabled Remind all** — Pass `rows={[]}` for the empty state, or work out `open` and `blocking` from the rows the table actually shows. That gives a green '0 blocking' badge and a disabled Remind all. For loading and error, hide the badge.
- **T04.2** [H, new] **'Present with approval' asks for actual times, but the dialog has no time fields** — When 'present' is chosen, show check-in and check-out time inputs, already filled with the punch on record (In 9:29 am), and add 'Enter the check-out time.' to `missing`. In the bulk dialog, offer 'present' only for refused check-ins, or ask for times per row.
- **T04.3** [M, new] **HR approves a request the dialog says is waiting for Divya's manager** — For HR, either label it 'Approve on behalf of Karthik Subramanian' and require a reason, or show the request read-only with a bordered 'Remind Karthik' button.
- **T04.4** [M, new] **Empty-state 'Open muster' button does nothing** — Link it to the muster screen (TIM-03), or remove it.
- **T04.5** [L, new] **Remind all and bulk Nudge give no lasting feedback and can be repeated** — After sending, disable Remind all when every open row is already nudged ('Reminders sent today'). Have bulk Nudge show 'Reminder sent to N people' and clear the selection.
- **T04.6** [L, new] **Error state Retry does nothing** — Wire Retry to reset the state to 'loading' and then 'ready' (local state), as the other Time screens do.
- **T04.7** [L, new] **Jargon in badges and details** — Use 'Doesn't block payroll', 'Saved offline 52 hours ago; only 48 hours allowed', and 'Absent (unpaid) · 1 day's pay deducted in September payroll'.
- **T04.8** [L, new] **Request details are hard-coded, not read from the row** — Add requested time and reason fields to the request data and render them from the row.
- **T04.9** [L, new] **How old an exception is isn't shown** — Add a DueBadge under the date ('19 days ago'), red when older than 7 days.

## T05 · Roster (round-1 fixes verified: 9)

- **T05.1** [H, new] **Employee (Line Operator) sees the full manager and admin Time menu** — Make timePanel role-aware. Employees get Today plus My attendance, My leave, My shifts and My timesheet. Managers get the team items without Time settings. Only HR and payroll admins get Time settings. Add a role field to TimeUser, or a seesTeam() helper next to seesEveryone().
- **T05.2** [M, NOT FIXED] **Leave cell is still blue borderless text** — In RosterGrid, draw a leave-only day as a neutral bordered block like the OFF cells, labelled 'Leave · CL'. Where a shift sits on a leave day, show the leave as a small neutral badge, not blue text that looks like a link.
- **T05.3** [M, new] **'Ask to swap a shift' sticks out of the phone frame** — Make the fullWidth Button respect its container (width:100% with box-sizing:border-box, or remove the extra margin inside PhoneFrame). Check the other PhoneFrame screens that use fullWidth.
- **T05.4** [M, new] **Roster grid scrolls sideways on phones and cuts off names** — Under 600 px, show one card per person: name, role, hours, and seven small day chips that wrap onto two lines. Or add a Day/Week Segment with a one-day list. For the employee persona on a phone, reuse the MyShiftsPhone list for their own row.
- **T05.5** [M, new] **Staff view has no key for shift codes and no shift times** — In read-only mode, show a non-interactive legend above the grid: 'M Morning 6 am – 2 pm · E Evening 2 – 10 pm · N Night 10 pm – 6 am · G General 9:30 am – 6:30 pm · SB Standby'.
- **T05.6** [M, new] **Two status badges that can disagree** — Keep one status. Either drop the grid badge when the page shows one, or lift status into RosterScreen (status/onPublish props on RosterGrid) and drive the header badge from it, e.g. 'Published today' after publish and 'Unpublished changes' after editing a published week.
- **T05.7** [M, new] **Copy last week confirms but does nothing** — Fill empty cells from a LAST_WEEK value and say how many: 'Fills 49 empty cells; Lalitha's leave day stays empty.' When nothing would change, disable Copy week with 'Every cell is already set'.
- **T05.8** [L, new] **Empty, Loading and Error states still offer Swap shifts and show a Draft status** — When state is not 'ready', hide the status badge (or show 'No roster yet') and disable Swap shifts with 'No shifts to swap yet'. In the empty state, either add an 'Apply shift patterns' button next to Copy last week or drop that phrase.
- **T05.9** [L, NOT FIXED] **Warning lines still lack the direct fix for leave** — Add 'Clear shift' on leave conflicts (assign null to that cell). Optionally add 'Open swap' prefilled with that cell on rest-gap conflicts.
- **T05.10** [L, new] **Bid window buttons do nothing** — 'Remind' should switch to a disabled 'Reminded' like the open-shift row does. 'Close window early' should open a ConfirmDialog ('27 of 42 have bid; the 15 others get the leftover slots').
- **T05.11** [L, new] **Dates use a leading zero and a different format from the rest of the screen** — Use '5 – 11 Oct 2026' for the range (rangeTitle) and 'Thu 8 Oct' in conflict messages (formatDate without zero padding).
- **T05.12** [L, new] **Employee's own row is not marked** — Add a 'You' tag next to Rekha's name or a light highlight on her row, and hide the tab list when only one tab is shown.

## T06 · Shift editor and patterns (round-1 fixes verified: 8)

- **T06.1** [H, BROKEN BY FIX] **Duplicate does nothing, but the Type helper tells people to use it** — Wire Duplicate to open a copy ('General (copy)', no people, Type enabled), or at least a dialog asking for the new name and type.
- **T06.2** [M, new] **'Add pattern' does nothing** — On click, show a blank pattern in the form (name empty, 7-day weekly, all OFF) with 'Editing' on a new row.
- **T06.3** [M, new] **'Starts on' and 'Assign to' cannot be changed** — Keep the start date in state per pattern and feed it to the 14-day list. List the real groups (Line 1, Line 2 morning crew, Line 2 night crew, Chennai office all staff…) in Assign to, or make it read-only text if assignment happens elsewhere.
- **T06.4** [M, new] **Night crew pattern contradicts Kavitha's Line 2 roster** — Give the night crew pattern its own start date (e.g. 29 Sep, so 5 Oct is day 7 and Kavitha's N N N N OFF OFF matches), or change Kavitha's row to match.
- **T06.5** [M, new] **Split shift preview shows one long shift block** — Pass both parts to ShiftBar as two blocks, and label the first pair 'First part from / to'.
- **T06.6** [M, new] **Effective date is never asked for, but Saved shows one** — Add an 'Effective from' date (default tomorrow, 30 Sep 2026) next to Save. Make the saved text plain: 'Applies to the 146 people on this shift from 1 Oct 2026. Earlier days keep the old rules.'
- **T06.7** [L, new] **'Assign to' value is cut off** — Drop the count from the option label (the list row already shows '18 people'), or let the field take the full row width.
- **T06.8** [L, new] **Preview sits under the whole form on tablet and phone** — Below 1024 px, put the Preview card right after Basics, or make it a collapsible summary at the top.
- **T06.9** [L, new] **Preview bar doesn't separate overtime** — Shade the part past the shift end as overtime (legend item 'Overtime'), or end the dashed Shift block visibly at 6:30 pm.
- **T06.10** [L, new] **14-day list has no weekdays and uses a different date format** — Show 'Mon 5 Oct' style rows, and use the same date format as the rest of the app (no leading zero).
- **T06.11** [L, new] **Switching to Weekly silently drops cycle days** — Confirm first ('Weekly keeps only the first 7 days. 14 days will be removed.'), or keep the old cycle so switching back restores it.
- **T06.12** [L, new] **Patterns marked Active while their start date is in the future** — Show the date the pattern actually started (a past date) for patterns in use, or show 'Starts 1 Oct · in 2 days' with a neutral badge.
- **T06.13** [L, new] **21-day cycle becomes 21 dropdowns, and the preview shows only 14** — Show the cycle as a compact row of small chips/cells per week (7 per line) that open a picker, and preview at least one full cycle.
- **T06.14** [L, new] **Breadcrumb doesn't match the navigation** — Use 'Time › Time settings › Shifts & patterns' (or match whatever path the nav uses).

## T07 · Attendance request (round-1 fixes verified: 8)

- **T07.1** [H, new] **Send request works with the required Reason left empty** — Make Reason controlled and add `!reason.trim() ? 'Enter a reason'` to `blocked`, so the button is disabled and the reason shows beside it.
- **T07.2** [H, new] **On-duty From/To times can't be changed; effect ignores the Where field** — Put from/to/where in state. Build the effect from them ('On duty at <where>, 8:30 am – 6:00 pm'). Block when To <= From.
- **T07.3** [M, new] **Regularise date has no limits and 'locked' doesn't follow the date** — Set max = TODAY for regularise. Work out locked from the date (before 1 Sep means a late request, up to 60 days back) and block anything older or in the future with the reason shown.
- **T07.4** [M, BROKEN BY FIX] **Request-type Segment is cramped at phone width in the drawer** — Switch to the Select by viewport width (or a container query), not only by the surface prop. Or shorten the labels (Regularise · WFH · On duty · OT).
- **T07.5** [M, BROKEN BY FIX] **Date helper is wrong for WFH and On duty** — Use one helper per type. WFH/On duty: 'Pick the day you will work from home / be on duty.' Keep the 'fix' text for Regularise only.
- **T07.6** [M, new] **WFH count doesn't match Divya's September calendar** — Work out the count as SEPTEMBER.filter(d => d.code === 'WFH').length (1), or add a second WFH day to the calendar.
- **T07.7** [M, new] **Sent state has no next action** — Add a bordered 'Withdraw request' button (allowed while it's waiting) and 'View in My attendance' next to Close.
- **T07.8** [M, new] **Empty check-out shows a value-like placeholder and the wrong error** — Use an empty placeholder ('--:--'). Say 'Enter the check-out time' when it's empty and keep 'after check-in' for a time that's too early. Keep both fields in the row the same width and top-aligned.
- **T07.9** [L, new] **Late request reason contradicts 'Full day (no punches)'** — Prefill a full-day reason for the locked story (e.g. 'Visited Hosur plant all day; kiosk there was offline'), or leave the reason empty.
- **T07.10** [L, new] **Read-only check-in looks editable** — Show the recorded check-in as plain text ('Recorded 9:31 am · kiosk') or give it the disabled/read-only field style, so only Check-out looks like an input.
- **T07.11** [L, new] **Late request doesn't say why HR approves** — Write 'Late requests also go to HR. They don't count towards your monthly limit.'
- **T07.12** [L, new] **Effect badge wraps and leaves the arrow on its own** — Keep before → after together (nowrap on the group), or stack before and after on two labelled lines.
- **T07.13** [L, new] **OT effect text: '2 h 00 m' and '01 Oct'** — Use fmtDuration output like '2 h' for whole hours, and show the date without a leading zero ('1 Oct 2026').
- **T07.14** [L, new] **OT 'Take as' label sits lower than 'Planned OT'** — Top-align the yx-tim-row fields (align-items: start) so both labels line up.
- **T07.15** [L, new] **Blocked reason crowds the footer** — Put the reason on its own line above the buttons, or right-align it on one line and vertically center it.
- **T07.16** [L, new] **Phone bottom sheet is wider than the phone frame** — Make the BottomSheet stay inside the PhoneFrame (width 100% of the frame), not fixed to the viewport.
- **T07.17** [L, new] **Sent subtitle repeats the success alert** — Drop the subtitle in the sent state, or change it to the request summary ('Regularise · 10 Sep').

## T08 · Shift change or swap (round-1 fixes verified: 6)

- **T08.1** [H, new] **Default swap puts Rekha inside the night window although she has no night-work consent, and the screen says 'Can swap'** — In swapCheck, block when the new shift overlaps 19:00–06:00 for someone without consent (end > 19 or start < 6). Then the default colleague must be someone on a Morning/General shift that ends before 7 pm, or the default story must show the block with Send disabled.
- **T08.2** [H, new] **Rest check ignores rest after the swapped shift: Rekha gets 8 h before Sunday** — Add each person's next-shift start to SwapPerson and check both gaps (before and after) for both people. Show 'You would get 8 h rest before your Sun Morning shift' and disable Send.
- **T08.3** [H, new] **Send request does nothing and there is no 'sent' state** — On click, close the form and show a sent state: 'Sent to Jaya. Next: Jaya agrees, then Supervisor decides before Fri 2 Oct', plus a pending badge on the Sat 3 Oct row of the week list.
- **T08.4** [M, new] **Jaya's shifts contradict the TIM-05 roster** — Take Jaya's (and Rekha's, Kavitha's) week from the same roster data TIM-05 uses, so the pattern is 4 on / 2 off and Mon 5 Oct matches.
- **T08.5** [M, new] **Consent card says 'Weekly hours stay 48', which doesn't match the week shown** — Compute weekly hours from the week list (for example 'Your hours this week stay 32 h'), or drop the sentence.
- **T08.6** [M, BROKEN BY FIX] **Blocked footer is crowded and Send drops onto a second line** — Keep Cancel and Send on one row with a short reason ('Pick another colleague') beside Send, or rely on the alert and drop the footer text. Let the reason wrap under the buttons, not between them.
- **T08.7** [M, new] **Line Operator sees the manager and admin Time navigation** — In timePanel, show only the 'My time' group (plus Leave calendar if allowed) when the user has no reports and no admin role. This is a shared fix in time-kit.tsx.
- **T08.8** [M, new] **'Ask to swap' on any day always opens the Sat 3 Oct request** — Pass the clicked day into the sheet and preselect it. Fill 'My shift' with the person's upcoming shifts from the week list.
- **T08.9** [L, NOT FIXED] **Phone stories still show an empty page behind the sheet** — Render the same week list (or MyShiftsPhone from roster.tsx) inside PhoneFrame behind the sheet.
- **T08.10** [L, new] **Swap-with value is cut at 390** — Shorten the label to 'Jaya Prakash · Evening 2–10 pm', or show the shift on a second line in the option.
- **T08.11** [L, new] **Consent card shows the requester's approval deadline instead of a reply deadline** — On the consent card, write 'Reply by Thu 1 Oct' (or 'Reply before Fri 2 Oct') with the badge.
- **T08.12** [L, new] **Approver Senthil Murugan doesn't match the reporting line** — Either make Senthil Murugan Rekha's reportsTo in time-data, or name the approver from the data ('Supervisor · Senthil Murugan, Line 2') so that both screens agree.
- **T08.13** [L, new] **Selvi Arumugam exists only on this screen** — Add Selvi to PLANT_PEOPLE and the roster, or use an existing roster operator for the rest-rule case.
- **T08.14** [L, new] **Night alert wording is legalistic** — 'Women need written consent to work between 7 pm and 6 am. You have none on file, so this can't be sent.'

## T09 · OT review (round-1 fixes verified: 8)

- **T09.1** [H, new] **Row '...' menu opens empty on decided and 'Sent to HR' rows** — In DataTable, render the '...' trigger only when rowActions(row) returns content. Fixing it there fixes every screen.
- **T09.2** [H, BROKEN BY FIX] **Checkboxes on ineligible rows look clickable but do nothing** — Add a per-row isSelectable to DataTable and disable those checkboxes, with a tooltip: 'Over the limit: decide one by one' or 'Already decided'.
- **T09.3** [H, NOT FIXED] **At 871 Date is hidden and Status and names are cut** — Keep Date (merge it into the Employee cell as a second line: '26 Sep · Morning shift'). Drop the Status column on pending rows, because the row buttons already say it is pending. Or switch to cards below 900px.
- **T09.4** [M, new] **Pending OT is not counted in the Requests nav badge** — Add pending OT_ROWS for mine(person) to timeCounts().Requests. For managers, count only rows within the limit, because over-limit rows sit with HR.
- **T09.5** [M, new] **Phone bottom tab 'Requests 3' is hard-coded** — Pass timeCounts(user).Requests to MobileTabBar in frames.tsx.
- **T09.6** [M, new] **Names are cut at 1440** — Let the person cell wrap to two lines, or give the Employee column a min width that fits common names. The OT column has plenty of slack.
- **T09.7** [M, new] **Pre-approved and Day are hidden at 1440, but the decision needs them** — Show them as a second line in the OT cell: '3 h 00 m · not pre-approved' and '6 h 00 m · holiday'. Then the separate optional columns can stay hidden.
- **T09.8** [M, new] **Reject happens at once, with no reason and no confirmation** — Open a small dialog with a required reason (like the override dialog), and use the danger variant on the confirm button.
- **T09.9** [M, new] **OT from 14 Sep still pending, with no age shown** — Under the date, add a relative badge ('15 days ago'), amber after 7 days, with a red 'Payroll closes 30 Sep' hint for September rows.
- **T09.10** [M, new] **Weekly-off OT is counted only after the shift end** — Make 26 Sep a normal day for Kavitha, or show the full worked time as OT (for example 10 h 15 m) and adjust weekHours.
- **T09.11** [M, new] **Override dialog does not show what is being approved** — Add one line above the reason: '25 Sep · 3 h 00 m OT · not pre-approved'. Do the same in the comp-off dialog.
- **T09.12** [M, new] **Phone cards are crowded** — Card: name, then '26 Sep · 2 h 15 m OT', then the limit badge, then the buttons. Move Shift, Day and Pre-approved behind a 'Details' row, or merge them into one line.
- **T09.13** [L, new] **'Hours over the limit go to HR' shows even when no row is over the limit** — Show it only when overPending > 0, for example '2 over the limit, sent to HR.'
- **T09.14** [L, new] **'rows' in the header summary is table jargon** — '4 waiting · 14 h 30 m of overtime.'
- **T09.15** [L, BROKEN BY FIX] **'Enter a reason' hint is misaligned in the override footer** — Align the hint vertically centred to the left of the buttons. Make sure the disabled approve variant is visibly muted.
- **T09.16** [L, new] **Arun's holiday row reads like he left early** — On holiday and weekly-off rows, show 'Holiday · worked 9:30 am – 3:30 pm' instead of the regular shift.
- **T09.17** [L, new] **Info icon sits alone on its own line at 390** — Put the icon inline at the end of the text, or move the rounding note into the description.
- **T09.18** [L, new] **Empty state has no next action** — Add 'Back to Requests', or 'See decided overtime' if decided rows move to another view.

## T10 · Device backfill correction (round-1 fixes verified: 5)

- **T10.1** [H, new] **Anil Kumar 'Late (6:24 am)' contradicts his 9:30 am shift** — Use a morning-shift operator for the new late mark (shift 6:00 am), or change the time to after 9:30 am, e.g. 'Present → Late (9:52 am)'.
- **T10.2** [M, new] **Device 'Reader KF-HSR-01' does not exist on the Devices screen** — Use the same device code as TIM-14 (KF-HSR-K1, Gate 1), or add the Gate 1 biometric reader KF-HSR-01 to the TIM-14 device list.
- **T10.3** [M, new] **Review summary drops the late-mark changes, and the pay note mentions only restored pay** — Summary: '38 people · 131 days · 6 absent → present · 2 late marks removed · 1 new late mark'. Alert: 'Effects land in September payroll: 6 people get pay back for absences; 1 new late mark may lead to a deduction.'
- **T10.4** [L, NOT FIXED] **Phone: Back still sits small and right-aligned under a full-width primary button** — In the shared Stepper footer on phones, make Back full width too (stacked under the primary button), or put both in one row at 50/50.
- **T10.5** [L, NOT FIXED] **Phone: names wrap beside the change text in the preview list** — Below 600px, stack the row: name and date on line 1, change on line 2 (left-aligned).
- **T10.6** [L, new] **Reason summary is hard-coded and does not follow what was typed** — Keep the reason in state (value/onChange) and build the summary from it, truncated. Do the same for the From/To dates in the Batch summary.

## T11 · Periods (round-1 fixes verified: 9)

- **T11.1** [H, BROKEN BY FIX] **Fix-it buttons added in round 1 do nothing** — Wire each to its screen, filtered to the month: Exceptions (TIM exceptions, Sep, blocking), Requests (attendance, pending), Leave requests (pending, Oct), OT (pending, Sep), Timesheets (missing). At minimum pass an onNavigate callback so the story shows the target.
- **T11.2** [H, new] **'Approve lock' button is blue, not green** — Use variant="approve" on 'Approve lock'.
- **T11.3** [M, new] **Nav counts ignore the 1 Oct state** — When after is true, pass counts={{ Exceptions: 0, Requests: 0 }} to TimePage, or derive both nav and checklist from the same 1 Oct data.
- **T11.4** [M, new] **Requests count differs between side nav and phone tab bar** — Feed the phone tab-bar badge from the same timeCounts(user).Requests value as the side nav.
- **T11.5** [M, new] **No 'waiting for approval' stage after HR sends** — Add a 'Waiting for payroll approval' stage: card badge plus 'Sent by Lakshmi Venkatesan 1 Oct'; HR's button becomes disabled 'Sent for approval'; Payroll Admin's drawer shows the sender and date above 'Approve lock'.
- **T11.6** [M, new] **October checklist marks work in a month that hasn't happened as 'Done'** — For rows with zero items in a future or unfinished month, show a neutral 'None yet' badge, not green 'Done'. Keep 'Done' for months that have ended.
- **T11.7** [M, new] **Reopen request can be sent with an empty required reason** — Hold the reason in state; disable 'Send reopen request' until it has text, with 'Enter a reason' beside the button.
- **T11.8** [M, new] **Drawer footer stacks Close, the reason and the main button on separate lines** — Put the reason on its own line above the buttons (or left-aligned), then Close and the main button together on one row, right-aligned.
- **T11.9** [L, new] **Card shows only exceptions, not every blocker** — Show every blocking item on the card ('5 exceptions · 1 attendance request open'), or a single 'Lock blocked: 6 items' badge that opens the checklist.
- **T11.10** [L, new] **'Locked 30 Aug' contradicts 'locked after payroll'** — Use lock dates after the freeze, e.g. 'Locked 2 Sep by Suresh Pillai' and 'Locked 2 Aug'.
- **T11.11** [L, new] **Reopen story 'August locked, nothing paid' is not believable on 29 Sep** — Make the reopenable period September (on 1 Oct, locked, payroll not yet run), or add a note to August such as 'Payroll on hold'.
- **T11.12** [L, new] **Reopen-refused dialog can't be reached from the screen** — Drop the story, or put 'Can't reopen: return filed' in the Lock summary drawer. Label a lone button 'Close'.
- **T11.13** [L, new] **Lock summary repeats its label in the value** — Values 'Filed 15 Sep' and '30 Aug by Suresh Pillai'.
- **T11.14** [L, new] **Unclear header fact 'late requests up to 60 days back'** — 'After a month is locked, people can still ask for fixes up to 60 days later; they are paid in the next payroll.' Or drop it from the header.
- **T11.15** [L, new] **Headcount '212 people' is hard-coded in the lock dialog** — Derive the number from the Tamil Nadu entity's active headcount in time-data.
- **T11.16** [L, new] **Checklist rows crowd on phone** — On phones put the label on line 1 and the badge and button on line 2, left-aligned, with buttons of the same width.

## T12 · Mobile check-in sheet (round-1 fixes verified: 9)

- **T12.1** [H, new] **Main actions do nothing when tapped** — Wire each one to local state the way the offline button is wired. Check in switches the sheet to the checked-in state with a 'Checked in at 9:24 am' success alert. WFH and on duty open a short reason step or show 'Sent for approval'. Retry shows 'Location updated'. Check out now closes the sheet with 'Checked out at 9:42 am · early exit'.
- **T12.2** [M, new] **'Sent to HR' promises the user won't be marked late** — Say what actually happens: 'HR will review your 9:27 am attempt. You'll get a notification when they decide.' Don't promise an outcome.
- **T12.3** [M, new] **Saved offline check-in is repeated four times, and the sheet still says 'Check in' and 'Shift starts in 1 m'** — After saving, change the badge to 'Checked in at 9:29 am · waiting to sync' and the title to 'Checked in'. Keep one alert ('Saved on this phone. It syncs when you're back online.') plus the disabled button. Drop the separate Waiting to sync card, or drop the alert and keep the card.
- **T12.4** [L, new] **Offline: the map and the queue claim a location the text says hasn't been checked** — Offline, show the dot without the inside/outside verdict (for example a grey dot with the caption 'Accuracy ±40 m · checked when online'). In the queue, write 'Check-in 9:29 am · location saved' instead of naming the office.
- **T12.5** [L, BROKEN BY FIX] **Bottom sheet is now wider than the phone frame** — In the BottomSheet, cap the width to the PhoneFrame width (or use max-width: 100% of the frame container), not a fixed 480 px.
- **T12.6** [L, new] **Location row breaks apart at 390** — Keep the icon and text together in a nowrap inline group with the text allowed to wrap, and put Retry location on its own right-aligned line, or make it an icon button with an aria-label.
- **T12.7** [L, new] **Map distance is misleading for far-away pins** — When the distance is beyond the map's scale, pin the dot to the edge with an arrow and the label '3.6 km →', or zoom out so the circle shrinks.
- **T12.8** [L, new] **Checked-in state says the same check-in four times** — Keep the badge and the single punch row. Drop the separate location row (or the 'At Chennai office' badge) in the checked-in state.
- **T12.9** [L, new] **Shift start repeated three times in the early state** — Change the alert to 'Check-in opens at 8:30 am (in 50 m)', which is the fact the user needs, and drop the shift-start sentence.
- **T12.10** [L, new] **Device block doesn't name either phone** — Write 'Your approved phone is Pixel 7a. This phone (<model>) isn't approved yet.' Add the matching Divya request to the TIM-14 sample requests, or say in the copy that HR approves it in Devices.

## T13 · Kiosk (round-1 fixes verified: 9)

- **T13.1** [H, BROKEN BY FIX] **Apply leave pre-selects days she has already requested** — Start with no days selected. Disable days that already have a request and label them ('8 Oct · Requested'). Set Kavitha's CL pending to 2 in time-data and work out 'balance after' as balance minus pending minus picked.
- **T13.2** [H, new] **Day tiles ignore her 4-on/2-off plant roster** — Build the tiles from her roster (the same cycle monthFor uses). Show weekly offs as disabled 'Weekly off' tiles and include Sun 4 Oct.
- **T13.3** [M, new] **Send leave request does nothing** — On tap, show a 'Sent to Ramesh Gowda · you'll get an SMS' confirmation with a Done button, and add the request to My requests.
- **T13.4** [M, NOT FIXED] **Kiosk calls the check-in a kiosk punch but the data says biometric** — Set TEAM t10 source to 'kiosk' (Hosur Gate 1 kiosk KF-HSR-K1), or call the device a biometric reader on the kiosk.
- **T13.5** [M, new] **Who approves Kavitha's leave differs between screens** — Pick one line supervisor for Kavitha (Senthil Murugan reporting to Ramesh Gowda) and use it in TEAM.reportsTo and requests.tsx. Put her on the same shift on every screen.
- **T13.6** [M, new] **Approved 1 Oct leave is not reflected in the balance** — Count the approved 1 Oct day (balance 2 plus 1 booked), or show 'Casual leave 3 days · 1 booked'.
- **T13.7** [L, new] **Typed employee code is tiny** — Show the code at heading size or larger with clear digit slots, e.g. 32 px with letter spacing.
- **T13.8** [L, new] **Any 4 digits sign you in as Kavitha** — Add an 'Unknown code' story or state ('No one with code KF-9999 · check your ID card'), and only go to the PIN screen for KF-0177.
- **T13.9** [L, new] **Leave type is a dropdown for a two-option choice** — Use the joined Segment control: Casual leave · 3 days | Earned leave · 11 days.
- **T13.10** [L, new] **Training session dropdown has one option and does nothing** — Show the session as plain text ('Food safety refresher · 9:00 am · Training room 1'). Use a list only when more than one session is open.

## T14 · Devices and kiosks (round-1 fixes verified: 8)

- **T14.1** [H, new] **Register kiosk and Reset kiosk key do nothing** — Wire Register kiosk to a register dialog (place, location, mode). Make Reset kiosk key open a ConfirmDialog: 'Reset KF-HSR-K1's key? The Gate 1 tablet stops recording check-ins until someone enters the new key on it.' After that, show 'Key reset · enter it on the tablet'.
- **T14.2** [M, new] **Offline kiosk shows 0 check-ins, but the alert says check-ins are kept on the tablet** — For Offline kiosks, show 'Not synced' (or '— · syncs when back') instead of 0. Show the count only for kiosks that are online or stale.
- **T14.3** [M, new] **Reject removes a phone request at once, with no reason or confirmation** — Open a small dialog that asks for a reason ('Phone model not allowed', 'Ask her to visit HR'), then show 'Rejected · Meera is told why'. For a lost-phone request, also say her old phone stays signed out.
- **T14.4** [M, new] **Requests badge differs between the phone nav and the sidebar** — Drive both badges from the same count in the shell (TimePage / AppShell).
- **T14.5** [M, BROKEN BY FIX] **Kiosk cell is cramped and wraps to three lines** — Give the two-line cell vertical padding so rows don't crowd. Set a wider minimum width on the Kiosk column, or shrink Mode and Last seen, so place · location stays on one line at 1440. Shorten the location to 'Bengaluru HO' if needed.
- **T14.6** [L, new] **Approved first phone never shows up under Employee phones** — Add every approved phone to the Employee phones list and show a short confirmation, e.g. 'Kavitha's Nokia G21 approved · she can check in from it now'.
- **T14.7** [L, new] **Employee phones is a two-item list with no search** — Make it a searchable table (person, phone, app version, last seen, status), with an 'Only lost or inactive' toggle and more fictional rows.
- **T14.8** [L, NOT FIXED] **Phone tabs wrap so 'Employee phones' sits alone on a second row** — Make TabsList scroll sideways inside itself on phones, or switch to a Select dropdown below 480 px, as round 1 suggested.
- **T14.9** [L, new] **Tamil Nadu entity's kiosk is at the other entity's Hosur plant** — Give the Tamil Nadu entity its own site (e.g. a Coimbatore unit, code KF-CBE-K1), or move the Hosur plant to the Tamil Nadu entity on every screen.
- **T14.10** [L, new] **Stale/Offline legend shows while loading and sits on the table edge** — Render the note only when state is ready and kiosks exist, and add top margin (or move it into the table footer).
- **T14.11** [L, new] **Columns and density controls on a tiny table and on phone cards** — Hide the table toolbar on the card layout, and on tables with few rows and no optional columns hidden.

## T15 · Timesheets (round-1 fixes verified: 4)

- **T15.1** [H, NOT FIXED] **Grid is still cut off at tablet and phone widths** — In TimesheetScreen, default `layout` to 'auto' (or stop passing it unless a story forces 'days'). Make useNarrow() in TimesheetGrid switch below about 1100 px so 871 and 768 get the day list.
- **T15.2** [M, NOT FIXED] **Future days are still editable** — Add a `lockFrom` (date) prop to TimesheetGrid. Render future-day cells read-only with a 'from 30 Sep' hint in the column header. Pass TODAY+1 from TimesheetScreen.
- **T15.3** [M, NOT FIXED] **Queried cell isn't marked on a sent-back week** — Add `sentBackCell {lineId, day}` to TimesheetGrid. Give that cell an amber outline and a title of 'Queried by Divya Menon'. In the phone day list, mark the same line under Tue 22 Sep.
- **T15.4** [M, new] **Resubmit works without the queried hours being changed** — Keep Resubmit disabled until the queried cell changes, with the reason beside it ('Change Tue 22 Sep SRF-24 hours first'). Or require a short reply note when the hours are left as they are.
- **T15.5** [M, new] **Next arrow on the locked August week jumps to this week** — Step one week at a time in both directions (keep a weekStart state, not 'this'/'last'). Add a 'This week' button (the grid already supports onThisWeek) when you're viewing an older week.
- **T15.6** [M, new] **Locked-week alert gives no way to make the correction** — Add an 'Add correction to this week' button to the alert. It opens the current week with a new adjustment row that refers back to 24–30 Aug.
- **T15.7** [L, NOT FIXED] **Phone still shows greyed-out disabled Billable checkboxes** — When the project isn't billable, show plain 'Not billable' text instead of the disabled checkbox. Do the same in the desk grid's Billable column.
- **T15.8** [L, new] **Spec code shown in the holiday warning** — Drop the spec reference: 'Hours on Gandhi Jayanti are paid at the holiday rate.'
- **T15.9** [L, new] **Read-only weeks show disabled checkboxes and mixed empty markers** — In read-only mode, show 'Billable' as text (or nothing) and use one empty marker ('–') everywhere.
- **T15.10** [L, new] **Header subtitle is long and wraps** — Use the subtitle 'Approver: Divya Menon'. Move the client check to the SRF-24 row (a 'Client checks: S. Balaji' hint) and drop the duplicate 'Week of …'.
- **T15.11** [L, new] **Phone header buttons are uneven and Pre-fill is missing** — Put Copy last week and Save draft side by side at equal width, and add Pre-fill as a third full-width button (or an overflow menu item) on phone.

## T16 · Attendance reports (round-1 fixes verified: 7)

- **T16.1** [H, BROKEN BY FIX] **Form 25 for Hosur lists only 5 workers with 20.5 OT hours, but the same report puts 194 OT hours and 46 late marks at Hosur** — Build the Hosur rows of LATE from the Form 25 worker list, or add enough Form 25 workers that the totals agree: Hosur OT = sum of Form 25 OT, and the late marks match. Then derive 'N workers' from that list.
- **T16.2** [M, NOT FIXED] **Export, Download PDF and Download Excel do nothing** — Wire these buttons to a toast or a download stub, for example 'Form 25 · Sep 2026 · Hosur.pdf downloaded'. For an open period, add the note 'Draft: September is not locked yet' to the file or toast.
- **T16.3** [M, new] **Gopal Iyer's Form 25 row disagrees with his exceptions and today's status** — Show Gopal as 23 present and 2 absent (or '1 absent + 1 open exception'), and count only days up to 28 Sep, or mark today as 'in progress'.
- **T16.4** [M, new] **Manager title says 'late and early' even after picking Overtime** — Use 'My team · attendance' as the title, or build it from `r` ('My team · overtime').
- **T16.5** [M, NOT FIXED] **Phone chart labels are still cut and unreadable** — At narrow widths, render the BarChart horizontally (labels on the y-axis), or use first names only. A shared BarChart option such as `horizontalBelow={480}` would fix this everywhere.
- **T16.6** [M, new] **Requests badge count differs between desktop sidebar and phone bottom bar** — Feed the bottom-bar badge from the same count as the sidebar (per persona).
- **T16.7** [M, new] **Manager sees the admin 'Time settings' links** — Hide the Time settings group in TimePage when the user is the manager persona (keep 'My time').
- **T16.8** [L, new] **Empty state shows two messages, and one of them suggests a search that does not exist** — When rows are empty, hide the chart, or drop its emptyText and let the table empty state be the only message. Change the table copy to 'No attendance for Operations at Bengaluru head office. Clear filters.'
- **T16.9** [L, new] **Worker name clipped in the Form 25 table at 871** — Let the person cell wrap or ellipsize with a title, or widen the Worker column (shrink the number columns).
- **T16.10** [L, new] **Night register header is cut at desktop width** — Shorten it to 'Night hours (7 pm–6 am)', or let headers wrap to two lines.
- **T16.11** [L, new] **'Pick-up and drop: Recorded for every shift' is hard-coded** — Store transport per row (for example '12 of 12 shifts') and show the count, with amber when any shift is missing.
- **T16.12** [L, new] **'September so far (1–29 Sep)' counts today, which is still in progress** — Show '1–28 Sep (today still open)', or 'up to now, 29 Sep'.
- **T16.13** [L, new] **Floating help button covers the total row** — Give the page enough bottom padding to clear the help button, or dock help in the top bar.
- **T16.14** [L, new] **Statutory card repeats 'Hosur plant' and the Factories Act note** — Keep the site in the title and cut the line to '5 workers · from the published roster and check-ins'. Put the Factories Act note in a tooltip on the format badge.
- **T16.15** [L, new] **Large blank gap between the header and the period line** — Move the period line and its badge into the PageHeader description, for example 'Kaveri Foods Pvt Ltd · September so far · Locks tomorrow'.

## T17 · Leave home (round-1 fixes verified: 8)

- **T17.1** [H, new] **'Apply for someone' opens Divya's own apply form (no employee picker)** — Give ApplyLeavePanel an optional `forSomeone` mode: first field a required PersonPicker (manager: myReports(); HR: everyone), balances from balancesFor(person), request person = picked person, approver = their reportsTo, alert 'Applied for Meera Krishnan · sent to Divya Raghunathan'. Disable 'Send request' with 'Pick the employee' until chosen.
- **T17.2** [H, new] **My requests rows crushed on phone width (one word per line)** — In MyRequests, below ~560px stack the row: title + subtitle on top, then a wrapping row of badges, then the buttons (same width). Put the 'in 13 days' badge on the subtitle line instead of the action row.
- **T17.3** [H, new] **Manager 'Waiting for you' rows truncate name and dates at 390** — On narrow widths stack the Send back / Approve buttons under the text (full row), and let PersonLabel secondary wrap instead of ellipsis.
- **T17.4** [M, NOT FIXED] **'All requests', 'Open requests' and 'Open leave calendar' buttons do nothing** — Wire them to the TimePage nav targets (Requests, Leave calendar / TIM-20) via the same navigation the sidebar uses, or render as link-buttons with href.
- **T17.5** [M, BROKEN BY FIX] **'Away this week' lists Meera Krishnan twice with inconsistent Pending badge** — Group by person+absence: one row 'Sick leave · 1 & 3 Oct (2 days)' with the Pending badge; check pending by request overlap, not exact start date.
- **T17.6** [M, new] **Phone Requests badge hard-coded to 3, disagrees with desktop counts** — Pass timeCounts(user).Requests into MobileTabBar instead of the literal 3.
- **T17.7** [M, new] **Phone manager view missing 'Away this week' and apply action** — Wrap the list in a 'Waiting for you (2)' card and add the 'Away this week' card (AwayList) below it, plus an 'Open leave calendar' button.
- **T17.8** [M, new] **'Needs HR' items have no action buttons and 'Negative balances 4 people' is hard-coded** — Add bordered sm buttons 'Review balances' and 'Verify certificate' (opens Meera Krishnan's request lr3); compute negative-balance count from data.
- **T17.9** [M, new] **Admin 'Time settings' menu shown to employee and manager** — In TimePage nav, show Time settings, Periods and Year-end only when seesEveryone(user).
- **T17.10** [L, new] **HR 'Pending with managers (3)' vs nav Requests 4** — Title the card 'Pending leave with managers (3)' or show the attendance request count beside 'Open requests'.
- **T17.11** [L, new] **After Approve, other parts of the page don't update** — Keep decided ids in state and pass them to AwayList / pendingFor so the badge drops and counts update.
- **T17.12** [L, new] **Pending status badge is amber** — Use tone 'neutral' (or 'info') for Pending; keep amber for Pending within a few days of the start date.
- **T17.13** [L, new] **Error state Retry does nothing and copy is employee-only** — Retry should re-run the load (set state back to loading in the story); use 'Leave didn't load' for manager/HR.

## T18 · Apply leave (round-1 fixes verified: 9)

- **T18.1** [H, new] **Default dates overlap Divya's own pending leave request (12–13 Oct), and nothing warns her** — In ApplyLeaveForm, check LEAVE_REQUESTS for ME.name with status Pending/Approved that overlap the range. Add an error such as '12 Oct is already in your pending request (Earned leave 12–13 Oct)' with a bordered 'Open that request' button. Or move the default range to dates with no overlap, for example 2–5 Oct... but 2 Oct is a holiday, so use 5–8 Oct.
- **T18.2** [L, NOT FIXED] **Summary still says 'Sandwich days counted'** — Rename the row to 'Weekends/holidays between leave days', or merge it into 'Days counted 4 (incl. 2 weekend days)' and drop the separate row.
- **T18.3** [M, new] **Leave-without-pay reason says paid leave is used up when it isn't** — Use a neutral LWP default ('Extended family travel') or leave it empty. Optionally show an info line when paid balances exist: 'You still have 14 days Earned leave. Use that instead?' with a bordered 'Switch to Earned leave' button.
- **T18.4** [M, new] **Phone story collapses into a crushed two-column layout on a wide canvas** — When phone is set (or inside BottomSheet), force a single column with a yx-tim-editor--stack class, or switch .yx-tim-editor to a container query on the sheet width.
- **T18.5** [M, new] **Notice-period warning doesn't name the last working day** — Show both dates: 'Your last working day moves from 30 Oct to 3 Nov (4 days).' For the persona, either add Divya's notice dates to the data or run this story as an employee who is on notice.
- **T18.6** [L, new] **Sick leave is applied for future days with a 'fever' reason** — Use 28–30 Sep (started yesterday) for the story args so the certificate rule still triggers at 3 days.
- **T18.7** [L, new] **Day list rows wrap and look crowded on desktop** — Shorten the row label to 'Weekend · counted' (the note above already explains why). Give the date cell white-space: nowrap.
- **T18.8** [L, new] **'Also off' line uses leave codes and means Divya's reports, not her team-mates** — Write the type in words ('Casual leave 5 Oct') and label it 'Your reports also off: …' because Divya is a manager. For a non-manager, use peers under the same reportsTo.
- **T18.9** [L, new] **Blocked-send reason sits misaligned and squeezed in the footer** — Vertically centre the reason (align-items: center on the footer). On phone, put it on its own line above the buttons.
- **T18.10** [L, new] **Negative 'Balance after' is not highlighted** — Render a negative balance-after in danger tone, for example '−0.5 (short by 0.5)'.
- **T18.11** [L, new] **Sent request's applied date doesn't match the same request on other screens** — Either use dates that are not already in LEAVE_REQUESTS for the Sent story, or build the request from lr1 when the range matches it.

## T19 · Leave request detail (round-1 fixes verified: 8)

- **T19.1** [H, NOT FIXED] **Manager can't see the requester's balance (Balance after removed instead of computed)** — Add PERSON_BALANCES entries for Meera Krishnan and Arun Prakash (and every report with a request), using the same figures TIM-21 shows. Keep the "<First>'s balance after" KPI. If a balance is truly missing, show 'Balance not available' rather than hiding the KPI.
- **T19.2** [M, NOT FIXED] **Phone manager: Approve is still a pale green outline** — Make the 'approve' variant solid green everywhere in Button (actions.css:139), or add .yx-tim-sheet-actions to the solid selector at actions.css:143. Fixing it in Button is better.
- **T19.3** [M, new] **Phone manager view never says whose request it is** — On the inline/phone surface, put the person first: title 'Meera Krishnan' with 'Sick leave · 1–3 Oct' under it (avatarName), or pass `${r.type} · ${r.person}` as the PhoneFrame title when viewer is mgr.
- **T19.4** [M, new] **Requests count disagrees: phone tab says 3, desktop nav says 2** — Have PhoneFrame take the badge from the same nav-count helper as the sidebar (time-data.ts navCounts) or from a prop. Don't hard-code 3.
- **T19.5** [L, new] **Closing the drawer leaves an empty page** — Render the real list behind the drawer (TIM-17 My leave list / manager requests list), with this request's row selected, or at least a 'Back to leave requests' bordered button.
- **T19.6** [L, new] **Stale othersOff numbers in request data contradict the computed overlap** — Remove the othersOff field from LeaveRequestRow and LEAVE_REQUESTS. Use othersOff() everywhere.
- **T19.7** [L, new] **'Balance after' on an already-taken leave shows today's balance** — For approved or past requests, label it 'Casual leave balance now' or drop the KPI. Keep 'Balance after' only for pending requests.
- **T19.8** [L, new] **Report-an-error dialog doesn't mention that September locks tomorrow** — Add the lock date with a DueBadge ('September locks 30 Sep · in 1 day; later fixes go to October pay') using the same SEP_LOCK constant.
- **T19.9** [L, new] **Timeline date formats are inconsistent ('Wed 09 Sep')** — Use an unpadded day (day: 'numeric') in the ApprovalTimeline date formatter.
- **T19.10** [L, new] **No story covers 'Ask to cancel' on future approved leave** — Add a future approved request for Divya (for example casual leave 26 Oct, approver ME.manager) and an 'Employee · ask to cancel' story with action 'cancel'.

## T20 · Team leave calendar (round-1 fixes verified: 6)

- **T20.1** [H, NOT FIXED] **Pending leave still looks the same as approved leave, and has no Review action** — Give pending chips a dashed border with a visible 'Pending' marker in both views. Add a legend under the grid (Approved / Pending / Holiday / Weekly off) and drop the 'point at the chip' note. In the manager view, list the pending items under the grid with a blue Review button each (variant="review").
- **T20.2** [H, NOT FIXED] **Team dropdown in the manager view does nothing** — In TeamCalendar, render the Select only when teamProp is undefined and there is more than one team. For the manager, drop it and keep 'Your team · Quality' in the subtitle.
- **T20.3** [H, NOT FIXED] **Desktop screen at phone width still shows 3 days with sideways scroll** — Below about 600px, render the same 'Who's away by day' list used in TeamLeaveCalendarPhone in place of the grid (the Month tab already collapses to dots). Re-check narrow() on resize (matchMedia listener) instead of only on first render.
- **T20.4** [M, BROKEN BY FIX] **Saturdays all shaded as weekly offs, but 3 Oct is a working day with leave on it** — Shade from the same isOff() rule the chips use: pass a weekly-off predicate (Sundays plus 2nd/4th Saturdays) to TeamCalendar and Calendar instead of isWeekend(). Label off days 'Off' in the header the way holidays get 'Hol'.
- **T20.5** [M, NOT FIXED] **Month chips still say 'Leave' and cut off the name and type at 871** — Let Calendar hide the type label for a single-type calendar (e.g. hideTypeLabel), or show the code first: 'CL · Sanjay R.'. Each event then fits at 871.
- **T20.6** [M, new] **Month view opens with 1 Oct selected instead of today** — Pass defaultDate={TODAY} (the month still shows October's weeks from 28 Sep) so the selected day and the detail panel start on today.
- **T20.7** [M, new] **HR view: Hosur plant people use the Chennai office holidays and offs, and no location is shown** — Show location next to the team under each name ('Quality · Hosur plant'). Shade offs per person's holiday calendar or shift pattern, or at least don't grey out working days for shift workers.
- **T20.8** [M, new] **Phone 'Who's away' repeats people day after day and stops at 2 weeks** — Group by person-absence (one row per request with its date range, sorted by start) under 'This week' / 'Next week' headings. Add a 'Next 2 weeks' button, and a Review button on pending rows for the manager.
- **T20.9** [L, new] **Dates with leading zeros, unlike the rest of the screen** — Use the no-leading-zero day format in rangeTitle and the holidays line in calendar.tsx (formatDate(...).slice(0,6) produces '02 Oct').
- **T20.10** [L, new] **Team name repeated under every person in the manager view** — Show the role (e.g. 'Lab Technician') or location under the name when every member has the same team, and keep the team line only in the HR view.
- **T20.11** [L, new] **Export works on an empty calendar and does nothing** — Disable Export with 'Nothing to export in this range' when there are no absences, and wire it to a download when there are.

## T21 · Leave card (round-1 fixes verified: 7)

- **T21.1** [H, BROKEN BY FIX] **Ledger now grants the whole year up front, but the cards and projection still add monthly credits** — Pick one accrual model. If the year is granted up front, which is what the ledger says, remove nextCredit from CL and EL in BALANCES and PERSON_BALANCES. projectBalance then gives 14 − 2 = 12 on 1 Dec. If the model is monthly, change the 1 Jan row to the 4 carried-forward days plus a monthly 'credited +1.25 Earned leave, +0.67 Casual leave' row for each month Jan–Sep, so the totals still add up.
- **T21.2** [M, new] **Adjust balance lets HR deduct more than the balance, which posts a negative balance** — When dir === 'deduct' and days > b.balance, set blockedBy to 'Only {b.balance} days to deduct' and set max on the NumberField to b.balance.
- **T21.3** [M, new] **Projection goes past the end of the leave year with no year-end rule** — Set max to 31 Dec 2026 and add a helper line 'Leave year ends 31 Dec'. Or model the year end: cap the balance at 30 days and add the 2027 grant.
- **T21.4** [M, NOT FIXED] **Floating help bubble still covers content on tablet and phone** — Remove the floating bubble and use the '?' icon that is already in the header. If it must stay, add bottom page padding equal to its height so it never sits on top of content.
- **T21.5** [M, NOT FIXED] **At 390 the ledger rows still wrap to 3–4 lines beside a fixed time column** — In the shared Timeline below about 480px, put the time on the date header line ('Thu 01 Jan 2026 · 12:05 am') and give the action text the full width. Shorten the system rows, for example '+4 Earned leave carried from 2025'.
- **T21.6** [M, new] **Phone leave card has no Apply leave button and no way to open the pending request** — Add an 'Apply leave' button in the phone frame header or at the top of the body. Pass onViewPending on phone too and open LeaveRequestView inline (surface='inline') instead of returning null at line 883.
- **T21.7** [L, new] **Comp-off card says '1 day' three times and crowds badge and button onto one row** — Drop the meter and the '0 of 1 used' text for Comp-off. Show 'Expires 14 Oct' with the 'in 15 days' badge on one line and put 'Use comp-off' on its own line below.
- **T21.8** [L, new] **Earned leave card runs to five lines of small text** — Shorten to '5 of 19 used' and move '15 for 2026 + 4 carried from 2025' into the meter tooltip. Remove the Next credit line (see the accrual finding). Keep 'Pending 2 days' and the View request button on one row.
- **T21.9** [L, new] **Projection result has no unit** — Show '{value} days', and after fixing the accrual model round it to the half-day the policy uses.
- **T21.10** [L, NOT FIXED] **System actor still shown as a person avatar** — Give AUTO a neutral system icon (for example a gear or clock) in Timeline instead of initials.
- **T21.11** [L, new] **Adjust dialog says adjustments can be reversed, but there is no way to reverse one** — For HR, add a bordered 'Reverse' button on adjustment rows that posts the opposite entry. Start the Reason field empty, so Post stays disabled and shows 'Add a reason' until HR types one.

## T22 · Comp-off claim (round-1 fixes verified: 7)

- **T22.1** [H, BROKEN BY FIX] **The new next-action buttons do nothing** — Give CompOffClaim an onOpenAttendance and onViewRequests prop (or a navigate callback) and wire it in the story to an action or link to TIM-01 My attendance and TIM-18 My requests. Do not render a button until it does something.
- **T22.2** [M, new] **Cancel and Close leave a blank 'My leave' page with no way back** — Render the drawer over the real MyLeave page content (BalanceCards and requests), or at minimum keep a 'Claim comp-off' button on the page so it can be reopened. After Send, add the claim to the pending list so the user sees it.
- **T22.3** [L, BROKEN BY FIX] **Sent alert repeats the approver and the use-by date** — Body: 'Half-day comp-off for Sat 26 Sep.' Keep the separate 'Use by 26 Oct · in 27 days' row and drop the repeated 'Waiting for…' and 'use it by…' sentences.
- **T22.4** [L, new] **Auto-credited 14 Sep note has no use-by date and uses smaller text** — 'Mon 14 Sep (Vinayaka Chaturthi): +1 day credited automatically · use by 14 Oct' with DueBadge(CO_EXPIRES). Use the normal muted body size.
- **T22.5** [L, new] **Worked hours on 26 Sep are hard-coded text, not read from the attendance data** — Build the option description, the helper and the Full-day disabled flag (workedMin < 480) from one claim-day record in time-data.ts that the TIM-31 timesheet also uses.

## T23 · Optional holidays (round-1 fixes verified: 7)

- **T23.1** [M, BROKEN BY FIX] **Used-up state says the same thing three times** — When usedUp, merge into one info alert: 'You've used your 1 optional holiday for 2026 (prorated after your move to Chennai on 1 Jul)'. Change the intro to 'Your optional holidays for 2026'. Drop the per-row 'No optional holidays left' text (keep the boxes disabled), since the alert already explains it.
- **T23.2** [M, new] **Entry button count is hard-coded and uses different words** — Work out the count from the same OPTIONAL data and quota as the sheet, and use the same wording, e.g. 'Optional holidays · 1 taken · 1 left'. When the quota is used up, show 'Optional holidays · all used'.
- **T23.3** [M, new] **Phone bottom sheet is wider than the phone frame** — Keep BottomSheet inside the PhoneFrame: position it within the frame, or set its max-width to the frame width. Fixing it once in BottomSheet or PhoneFrame fixes every phone story.
- **T23.4** [L, new] **Save is disabled with no reason given** — Show a muted 'Tick a holiday to save' before the disabled Save button until something changes.
- **T23.5** [L, new] **Countdown badges on rows you can't pick** — Render DueBadge only on rows that can be picked or are already picked (not locked).

## T24 · Encashment request (round-1 fixes verified: 8)

- **T24.1** [H, new] **Encashment limit differs between TIM-24 and TIM-27 Year-end** — Take the yearly encashment maximum from one shared policy constant (7 or 10) and use it on both TIM-24 and the TIM-27 year-end split.
- **T24.2** [M, new] **Request window contradicts the payout month** — Make the blocked reason something other than a calendar window that the open story breaks, such as a balance below the minimum or probation. Or, if the window is Dec, make the open story's payout 'December payroll' and set the not-open story in a context where the date logic still holds.
- **T24.3** [M, new] **'More' disabled at 5 with no reason beside it** — Put the effective maximum in the helper: 'You can encash up to 5 days (7 of your 12 must remain)'.
- **T24.4** [L, new] **Effect panel shows figures for an invalid request** — When there is an error, cap the preview at the maximum (5 days) or replace the panel values with a dash and 'Fix the days above to see the amount'.
- **T24.5** [L, new] **Story name 'Over yearly maximum' doesn't match what it shows** — Rename the story 'Over what you can encash', or add a separate story where the yearly cap of 7 is the limit hit (balance 20, 8 days).
- **T24.6** [L, new] **Leave type text cut off on phone** — Shorten the option to 'Earned leave · 12 available' and put '14 days, 2 pending' in the helper below. Or let the select wrap on phones.
- **T24.7** [L, new] **After-tax row wraps to four short lines at 390** — Value '₹7,311' on one line, with the 'at your 20% slab + 4% cess' note in small muted text underneath. Or stack label and value on narrow widths.
- **T24.8** [L, new] **'View leave policy' does nothing** — Make it open the Earned leave policy (Leave types & policies, or a policy drawer).
- **T24.9** [L, new] **Not-open maximum ignores credits before the window opens** — Say 'Based on today's 12 days available, you could encash up to 5', or project the balance on the opening date.

## T25 · Long-absence status card (round-1 fixes verified: 6)

- **T25.1** [H, BROKEN BY FIX] **New 'Open leave card' and 'Open profile' buttons do nothing** — Make them open the person's leave card (TIM leave balance screen) and their People profile, or remove them until there is a target.
- **T25.2** [M, BROKEN BY FIX] **HR action row has mixed button sizes and wraps** — Use one size for all four. Put the two link buttons in their own row ('Open leave card', 'Open profile') and the actions ('Extend', 'Record early return') in a second row, or use a single row with equal sizes.
- **T25.3** [M, BROKEN BY FIX] **Employee (Anitha) sees manager and HR menus** — In timePanel, show the team group only to managers and admins and Time settings only to admins. A plain employee sees only 'My time'.
- **T25.4** [M, new] **Extending maternity leave hides the pay effect** — For maternity say 'N more days beyond the 26 weeks, unpaid unless she uses earned leave; return moves to …'.
- **T25.5** [M, new] **The success message is not a sentence and the card does not update** — Write a sentence ('Sent to HR. They will confirm your new return date, 05 Feb 2027.' / 'Leave extended to 31 Mar 2027. Return 01 Apr 2027.'). After HR actions, update the end date in state so the meter, return date and pay effect recompute. For the employee request, show 'Waiting for HR' beside the return date.
- **T25.6** [M, new] **Crèche at the Chennai office contradicts Anitha's location** — Use the person's own work location ('crèche at Hosur plant'), or drop the location when it is unknown.
- **T25.7** [L, new] **Sabbatical pay effect is a bare 'Unpaid'** — Use the same formula as LWP for sabbatical: 'Unpaid for all 184 days · Jul–Dec payroll'.
- **T25.8** [L, new] **'(company rule)' is a vague reason** — Drop the bracket, or name the policy ('Sabbatical policy: no earned leave while away').
- **T25.9** [L, NOT FIXED] **Return badge uses a large day count** — Past about 60 days, have DueBadge show months ('in 4 months', 'in 3 months').
- **T25.10** [L, new] **Employee page is empty behind the drawer** — Show the normal My leave content (balances, requests) with a 'On maternity leave until 31 Jan 2027' card that opens this drawer.
- **T25.11** [L, new] **The name Ramesh Babu is used for two people** — Rename the sabbatical employee (e.g. 'Ramesh Natarajan') so the two people don't get confused.

## T26 · Holiday calendars (round-1 fixes verified: 10)

- **T26.1** [H, new] **Hosur plant has no calendar here, but other screens give Hosur holidays** — Give Hosur a published Tamil Nadu calendar in the main story. Make the no-calendar case a new location, for example a new depot that opens on 1 Nov 2026. Or derive each location's holidays from one shared source that the leave screens also read.
- **T26.2** [H, new] **There is no way to add, edit or publish a holiday** — Add a bordered "Add holiday" button above the table (name, date, optional switch), add "Edit date" to the row menu, and show the calendar status ("Published 2 Jan" or "Draft · Publish") beside the tab content with a Publish button at the end of the page.
- **T26.3** [M, BROKEN BY FIX] **The new transfer option label is cut off** — Shorten the option to "Split optional holidays by months at each office" or "Share by months at each office", or let the select wrap to two lines. You could also use a RadioGroup, as for the weekly-off rule.
- **T26.4** [M, new] **Saved rules are lost when you switch location tabs** — Lift the saved rules into HolidayCalendarsScreen state, keyed by location (like rows), or pass forceMount to the TabsContent elements.
- **T26.5** [M, new] **The state template adds stale and past dates** — Build the template from the feed's latest dates. In the dialog, say how past dates are handled, for example "6 holidays before today are added as records only and do not change past attendance", or add only dates from today onwards.
- **T26.6** [L, new] **An optional holiday on a weekly off is not flagged** — Apply the "on a Saturday off" badge to optional rows too, and include them in the weekly-off note. Or move the optional holiday's date.
- **T26.7** [L, new] **Phone cards are tall, with a lone "…" line** — Show the card as 2 lines: "Pongal" with the … button on the right, then "Thu 15 Jan 2026 · Holiday". Drop the Date/Type labels. On past rows, show the reason "In attendance records" instead of a menu with only a disabled item.
- **T26.8** [L, new] **Location tabs wrap badly on phone** — Make the tabs scroll sideways inside the tab bar on phones, or switch to a location dropdown under 480px.
- **T26.9** [L, new] **Upcoming holidays have no relative badge** — Add "in 3 days" (amber within a week) to the next holidays, and mute past rows or label them "Past".
- **T26.10** [L, new] **Clone ignores the pending feed changes** — While the feed changes are not reviewed, disable Clone with the reason "Review 2 feed changes first", or name them in the dialog. Label the button "Clone Chennai office to 2027".

## T27 · Leave type editor (round-1 fixes verified: 7)

- **T27.1** [M, BROKEN BY FIX] **Maternity save dialog says 248 people get the new rules** — Count only the people eligible for maternity leave, taken from the policies' data. For a colour-only change, skip the version and date dialog: save the colour directly with "Colour saved", or word the dialog as "Changes the colour for everyone".
- **T27.2** [M, new] **"1.25 days a month" contradicts the Karnataka policy's 18 days** — Work the per-policy rates out from POLICIES: "Staff · Tamil Nadu 15 a year (1.25/month), Staff · Karnataka 18 a year (1.5/month), Plant workers 1 per 20 days worked". Change the Crediting option label to match, or make crediting per policy.
- **T27.3** [M, new] **Priya's 15 credited by September disagrees with monthly crediting** — Set Priya's credited to 11.25 (balance 5.25) or change her data, so that the balance this example shows matches the crediting rule the editor describes.
- **T27.4** [M, new] **"Preview for a person" button does nothing** — Open a person picker that changes the live example's person and their balance, or remove the button.
- **T27.5** [M, new] **Eligibility has two controls for probation that can disagree** — Drop the switch, or reduce the select to the employment types (Permanent, Contract, Intern) and let the switch alone decide probation.
- **T27.6** [L, new] **"Gender or marital status" has no marital options** — Rename it to "Who can take it" (Everyone / Women only / Men only), or add the marital options.
- **T27.7** [L, new] **"Partially paid" has no field for how much** — When "Partially paid" is chosen, show "Paid at __ % of daily wage".
- **T27.8** [L, new] **Blocked dates can only be one preset or none** — Show the period as a removable item with an "Add dates" button (date range and reason).
- **T27.9** [L, new] **"Applies to" stays active when "Never count them" is chosen** — Disable "Applies to" with the helper "Not used when weekly offs and holidays are never counted".
- **T27.10** [L, new] **Version note in the save dialog is unclear** — Say "Leave days before 1 Oct 2026 follow the old rules; leave on or after it follows the new ones."
- **T27.11** [L, new] **No way back to the leave types list** — Add breadcrumbs: Leave types & policies › Earned leave.
- **T27.12** [L, new] **Legal jargon in the maternity alert** — Write "12 weeks for mothers who adopt a baby or have one through surrogacy".

## T28 · Leave policies (round-1 fixes verified: 9)

- **T28.1** [M, new] **Most buttons on the screen do nothing** — Make "Add a rule for grade S5" open the drawer as a new policy with Entity TN and Grade S5 already filled in. Make "Show them" open the People list filtered to those 3. Make "Edit" open the leave-type editor (TIM-27) for that entitlement, and make "New policy" and "Use a template" open a blank or template drawer.
- **T28.2** [M, new] **No way to add or end an override** — Add a bordered "Add override" button under the list and an "End" button on each row. Store an optional end date and show it ("15 Jul – 31 Dec 2026").
- **T28.3** [L, new] **Loading state shows the "3 people match no policy" alert before data loads** — Show the alert only when state==='ready' and rows are loaded.
- **T28.4** [L, new] **Headcount does not add up across screens** — Either label the total "248 covered · 3 not covered" and use 251 where the meaning is all staff (statutory maternity), or say the 3 joiners are not yet counted.
- **T28.5** [L, new] **Drawer subtitle and table still use leave codes** — Drop the leave types from the drawer subtitle and keep only "Tamil Nadu entity · grades S1–S4". In the table, keep the codes only if they have a legend, or write "Casual 8 · Sick 8 · Earned 15".
- **T28.6** [L, new] **Reordering is hidden in the row menu** — Put up/down icon buttons in the Order cell, or add a bordered "Change order" button to the toolbar.
- **T28.7** [L, new] **Phone cards are crowded and show noise** — Lay the card out as: title with an order badge ("#1"), the leave types line, then "Hosur plant · workers · 48 people · from 1 Apr 2026". Leave out "0 overrides" everywhere, desktop included.
- **T28.8** [L, new] **Drawer footer "No changes yet" is misaligned and wraps on phones** — Centre the note vertically and put it on its own line above the buttons, or use it as the disabled Save's tooltip/helper text. On phones, stack the full-width buttons.
- **T28.9** [L, new] **"Applies from" is far from the rule it dates** — Move "Applies from" into the "Who gets this policy" section right after Entity/Grade. Replace the muted sentence with "Changes start on the date below; earlier months stay as they were."
- **T28.10** [L, new] **Total row says "3 rows"** — Label it "3 policies", or "248 people covered" in the footer.

## T29 · Year-end wizard (round-1 fixes verified: 9)

- **T29.1** [H, new] **Review summaries are fixed text and ignore what was chosen** — Control the Entity select and the three checkboxes with state, and build the summaries and the TypeToConfirm consequence from that state, e.g. "Kaveri Foods Pvt Ltd (Tamil Nadu) · 2026" and "Employees told · managers not emailed · no payroll drafts".
- **T29.2** [H, new] **"Change starts" date can't be changed, and the short-year text ignores it** — Either make it a read-only fact ("Starts 1 Jan 2027, the day after the 2026 year-end") or store the date in state and work out the short-year months, credit and opening date from it.
- **T29.3** [M, BROKEN BY FIX] **"Showing 5 of 248 people" contradicts the pager "1–5 of 5"** — Keep one count, either the pager's or the line above, and make it agree with the total. For example, page over 248 rows ("1–25 of 312 balances · 248 people"), or say "Sample of 5 people. Download the full preview (248)" with a Download button.
- **T29.4** [M, new] **Leave type is hidden at desktop, so casual and earned rows look alike** — Don't mark Leave type optional. Merge it into the Employee cell as a second line ("Sanjay Rao · Casual leave") so it stays visible without adding width.
- **T29.5** [M, new] **Phone and tablet cards are long and crowded** — Use a compact card: name and type on line 1, then one line "45 → 30 carried · 10 paid out · 5 lapse", with lapse in amber only when it is above 0.
- **T29.6** [M, new] **Posting has no result and no next step** — After posting, show a done state: "Year-end 2026 posted on 2 Jan 2027 · 41 pay-out drafts added to January payroll" with "Open payroll drafts" and "View ledger" buttons, and remove "Post year-end".
- **T29.7** [M, new] **Pending requests don't block posting, even after 1 Jan** — While pending leave exists, block finish with the reason "Decide 3 pending leave requests first" (or make it an explicit acknowledgement checkbox). Word the alert by date: "…before you post" before 1 Jan, "3 requests from 2026 are still pending" after.
- **T29.8** [M, new] **Requests count differs: 3 in the alert and phone tab, 4 in the desktop sidebar** — Use one count source for the sidebar and the bottom nav badge. If the badge includes attendance, the phone badge must say 4 too.
- **T29.9** [M, new] **No page heading names the wizard** — Render the Stepper title as the page heading (or pass it to TimePage), e.g. "Leave year-end 2026" and "Change leave year · Karnataka entity".
- **T29.10** [M, new] **Short-year opening balance leaves out Oct–Dec credits and the 2026 year-end** — Start from the projected 31 Dec closing after the year-end carry-forward (same source as YE_ROWS), and label the column "Opening 1 Jan 2027 (after year-end)".
- **T29.11** [L, new] **"Paid out" column says it already happened** — Rename the columns "To pay out" and "Projected 31 Dec", or add the line "Projected to 31 Dec 2026" above the table.
- **T29.12** [L, new] **Blocked reason is red and sits away from the disabled button** — In Stepper, keep the reason next to the disabled finish button at every width, in neutral or secondary text, with Back first and Finish last.
- **T29.13** [L, new] **Dates show a leading zero ("01 Jan 2027")** — Make formatDate and the DatePicker display "1 Jan 2027".
- **T29.14** [L, new] **Read-only "Current leave year" looks like an editable field** — Show it as plain text (a definition row) instead of a read-only input.

## T30 · Leave reports (round-1 fixes verified: 8)

- **T30.1** [H, new] **Ledger's monthly credits contradict TIM-21's 1 Jan yearly credit and only cover 2 of the 6 people** — Pick the 1 Jan yearly credit, which is what TIM-21 and BALANCES use. Then remove the 'Monthly credit' rows and recompute 'Balance after' (Divya CL before 16 Sep = 6.5 → 4.5 after 16–17 Sep and 24 Sep). If monthly accrual is the real model, give every person shown a 1 Sep credit row and change TIM-21 and BALANCES.credited to match.
- **T30.2** [H, BROKEN BY FIX] **Negative balances at 1440 scrolls sideways and cuts the name after 'Open leave card' was added** — On the negative report, drop Casual/Sick/Comp-off (or mark them optional) and show Employee, Earned (red badge), Unpaid taken and the 'Open leave card' button, so it fits at 1440 and 871 without a scrollbar. Give Employee a min width (~200px).
- **T30.3** [M, NOT FIXED] **Employee names still cut at tablet width; Ledger hides 'Balance after' instead** — Give the person column a min width of about 200px, or let it wrap to two lines. On Ledger, mark Reason optional, not Balance after, and use a short date ('1 Sep'). The shared DataTable should never truncate a person column while number columns have slack.
- **T30.4** [M, new] **'Days taken by type, 2026' chart reads as company-wide but sums only 6 sample people** — Either feed the chart company totals (for example Earned 940 for 248 people, as in round 1) or retitle it 'Days taken by type, 2026 · these 6 people'. Keep KPIs, charts and footers on one scope.
- **T30.5** [M, new] **LOP alert sentence broken by the inline badge** — Put the badge at the end or in the title: 'Unpaid leave (LOP) for September payroll [locks tomorrow]'. Body: '3 unpaid days across 2 people go to payroll when September locks. Later corrections go to October.' Don't use the flex .yx-tim-row on running text.
- **T30.6** [L, NOT FIXED] **'EL' jargon left in the liability KPI and column after other headers were spelled out** — Rename them to 'Earned leave liability (all entities)' and 'Earned leave liability' (or 'Liability, ₹').
- **T30.7** [L, new] **Phone cards are 6 lines per person** — Below 600px render name plus one line: 'Casual 4.5 · Sick 6 · Earned 14 · Comp-off 1 · Unpaid 1', with Earned in a red badge when negative.
- **T30.8** [L, new] **Negative earned balance not flagged on the Liability report** — Reuse the Earned render (red badge when < 0) in liabCols.
- **T30.9** [L, new] **Meera Krishnan's leave data doesn't add up across screens** — Either credit Meera +1 comp-off on 17 Sep (ledger row, Comp-off balance 1) or change o6's status. Order her September leave so that earned leave is used before unpaid leave, or add a reason for the unpaid days (for example 'Leave without pay, requested').
- **T30.10** [L, new] **Requests badge differs between desktop sidebar and phone bottom nav for the same HR user** — Drive both badges from the same count (pending leave + attendance requests for HR = 4).

## T31 · Locations and geofence editor (round-1 fixes verified: 8)

- **T31.1** [H, new] **Save works for a new point with no location** — Check that latitude (-90 to 90) and longitude (-180 to 180) are filled for every point. Show the error on the field and add it to the 'N errors to fix' count so Save is disabled.
- **T31.2** [M, NOT FIXED] **Real business park address still in shared data** — Change LOCATIONS[maa].address in data.ts and the pay-data.ts address to '4th floor, Kaveri Towers, Taramani, Chennai 600113'. Then have TIM-31 read LOCATIONS instead of its own constant.
- **T31.3** [M, new] **Chennai headcount disagrees with Roster** — Pick one Chennai headcount, put it in shared data (LOCATIONS), and use it on TIM-31, TIM-42 and Roster.
- **T31.4** [M, new] **Save and its error count are far from the error** — Add 'Save location' at the end of the form too. Make '1 error to fix' a bordered button that scrolls to and focuses the first field with an error.
- **T31.5** [M, new] **Map stays editable in Field mode** — In Field mode, show the map read-only with no handle. Change the caption to 'Used to label check-ins as at office', and hide the keyboard note until the points are shown.
- **T31.6** [L, new] **Lone disabled Edit button on a single point** — Hide the Edit button for the point being edited, or when there is only one point. Keep '· editing' only when there are 2 or more points.
- **T31.7** [L, new] **Map does not follow typed coordinates** — Place each fence from its lat/lng relative to the location centre, and don't draw a point until it has coordinates.
- **T31.8** [L, new] **Switching mode overwrites the phone-binding choice** — Set the default only when the admin has not touched the switch, or ask before changing it.
- **T31.9** [L, BROKEN BY FIX] **Wi-Fi name says 5th floor, address says 4th floor** — Rename the Wi-Fi network to 'KF-Taramani-4F' everywhere, or change the address floor to match.
- **T31.10** [L, new] **Keyboard note reads like a developer hint** — Drop it, or put the help inside the map caption: 'Drag the handle, or type the radius in the form'.

## T32 · Field-force map (round-1 fixes verified: 7)

- **T32.1** [M, new] **Vikram's 14.2 km by 9:42 am cannot happen on his own timeline** — Set FIELD_DAY.km to something that fits 30 minutes on duty (e.g. 4.8 km), or move TODAY/visit times later so 14.2 km fits. Change it in time-data.ts once so TIM-32, TIM-33 and the TEAM row stay in step.
- **T32.2** [M, new] **Late field staff have no next action** — Add 'Message Bharath' (and 'Mark absent / on leave' if the manager can) inside the warning alert.
- **T32.3** [M, new] **'Tracking off' empty state gives a sales manager a settings button they can't use, and it does nothing** — For managers say 'Ask HR to turn on field tracking for your group' and give a 'Ask HR' button. Keep 'Open settings' (wired to the settings route) only for the HR persona.
- **T32.4** [M, new] **'Beat coverage' tab shows no beats, and its counts mix planned and unplanned visits** — Show one row per person/beat: beat, planned done of planned, unplanned, missed, with a short bar. Count 'Done' against planned visits only, or label it 'Done (incl. 1 unplanned)'.
- **T32.5** [M, new] **HR view rows run to four lines** — Merge the manager into the second line ('3 of 5 visits · 9.6 km · Vikram Rao'), or group the HR list by manager under a heading, and keep the badge beside the Open button.
- **T32.6** [L, new] **Drawer repeats the same fact twice** — Drop the Duty KPI (or the subtitle part). For a withdrawn person drop the Distance KPI and keep only the alert.
- **T32.7** [L, new] **'— km' reads as a broken value in the team row** — Leave the distance out when there is no trail ('2 of 3 visits'); the badge already says 'No trail' / 'Not checked in'.
- **T32.8** [L, new] **Live map shows a trail for Vikram only, and no flag on Suganya's pin** — Draw each tracked person's trail, or none on the overview. Give flagged people a warning-tone pin (the MapPin tone prop already exists).
- **T32.9** [L, new] **Manager and report share the first name Vikram** — Give the field sales officer a different first name across TEAM t9/FIELD_DAY (one change in time-data.ts), or show full names on map pins.
- **T32.10** [L, NOT FIXED] **Map caption layout from round 1 is not confirmed visually** — Re-take 1440, 871 and 390 screenshots once shot.mjs can resolve @playwright/test and confirm the icon and caption sit on one left-aligned line.

## T33 · Visit check-in and beat plan (round-1 fixes verified: 6)

- **T33.1** [M, new] **Check-in and photo times are later than the story's current time** — Derive the check-in time from NOW_MIN (for example 9:42 am, or fmt12 of NOW_MIN) and the photo stamp from that plus a few minutes. Or move TODAY's clock past 10:08 for every Time screen so TIM-32 shows Sri Murugan as 'On site'.
- **T33.2** [M, new] **Most buttons on the phone flow do nothing** — Keep the view in local state (beat → visit → photo → visit → beat). Wire Check in to open the visit, Take photo to the photo view, Use photo and Retake back to the visit, Check out to return to the beat with that visit marked Done, and Back to the previous view. Give Outcome a real useState.
- **T33.3** [M, new] **'Review mileage claim' is offered before the claim exists** — Before check-out, disable the button with 'Ready after you check out', or replace it with an outlined 'Open Pay › Expenses' link-button. Enable 'Review mileage claim' only in a checked-out state.
- **T33.4** [L, new] **Back arrow on the camera view goes to the wrong place** — On the photo view, label it 'Back to visit' and return to the visit form. Keep 'Back to beat plan' on the visit views only.
- **T33.5** [L, new] **Withdrawn view has no way to turn tracking back on** — Add an outlined 'Turn tracking back on' button (or 'Open Me › Privacy') to the alert.
- **T33.6** [L, new] **Visit status words differ from the manager view** — Use one word for both screens. 'Upcoming' (or a time badge like 'at 11:30 am') keeps 'Planned' free for planned vs unplanned.
- **T33.7** [L, new] **Two different tracking rules in the consent copy and the banner** — Use one sentence on both, for example 'every 5 minutes while you move, until you check out'.

## T34 · Auto-roster (round-1 fixes verified: 8)

- **T34.1** [H, BROKEN BY FIX] **New Wed-night explanation says 11 operators work Wed morning, but Wed morning is short (3/4)** — Make the reasons add up to the coverage. Example: '3 work Wed morning, 4 work Wed evening or Thu morning (rest under 11 h), 4 on weekly off with no consent…', and suggest a move that does not open another gap (e.g. 'Offer as open shift to Deepa Ramesh, who is off Tue–Wed', matching TIM-35).
- **T34.2** [H, new] **'Nights per person 2–3' contradicts the grid** — Work out the KPI from the grid (e.g. 'Nights per person: 2–5'), or spread Kavitha's nights so that 2–3 is true. Show who is highest if fairness matters.
- **T34.3** [M, new] **Leave and 48 h counts disagree between the list and the drawer and with the grid** — Use one leave count and one 48 h count for Wed 7 across the list and the drawer. Take the leave count from PLANT_LEAVE, or say they are people outside the 7 shown.
- **T34.4** [H, new] **Approve draft and Run again still work while the roster is generating** — While step === 'running', disable both buttons and add the reason 'Wait for the run to finish', or hide them.
- **T34.5** [M, new] **Header says Approved but the grid still says Draft; publishing changes nothing** — Pass defaultStatus approved/published to RosterGrid to match the header. After the confirm, set a published state: badge 'Published 29 Sep', a success alert that names the open shifts sent, and a link 'Open open shifts' (TIM-35).
- **T34.6** [M, new] **Run again, Import forecast and Add date override do nothing; Run again stays on after approval** — Wire Run again to the Generating step. After approval, ask 'Running again discards the approval' or disable it with that reason. Make Add date override open a small dialog and Import open a file picker, or remove them.
- **T34.7** [M, new] **Coverage day headers cut off at desktop and tablet** — Give the Slot column a max width (or wrap 'Morning · Line operator' onto two lines) and set the day columns to min 80px, or use short headers 'Mon', 'Tue' with the dates in the tab caption.
- **T34.8** [M, new] **'Why slots are unfilled' rows are crushed on phone** — On phones, stack the text first and the buttons below at full width (the list row should wrap at narrow widths).
- **T34.9** [M, new] **Draft roster grid scrolls sideways on phone and cuts names** — On phones show one person per card with a day Segment, or reuse the MyShiftsPhone list per person. At minimum, let names wrap onto two lines.
- **T34.10** [L, NOT FIXED] **Leave cells in the grid are borderless blue text** — Render leave cells as a neutral bordered block like the OFF cells (e.g. 'EL · leave').
- **T34.11** [L, new] **Saturday override reads as 4 + 1 = 5** — Show the cell as '4' with a small 'Festival sale' marker or tooltip ('3 + 1 override'), not a bare '+1'.
- **T34.12** [L, new] **Demand intro mentions an action that does not exist and uses filler wording** — Use 'People needed for each shift, each day.' and either add a 'Copy last week' button or drop the phrase.
- **T34.13** [L, new] **Drawer fact list is misaligned** — Left-align the reason column in yx-tim-days for every row, or use a two-column grid with a fixed label width.
- **T34.14** [L, new] **AI card mentions a credit cost but has no button** — Either show an 'Explain in plain words (1 AI credit)' button that reveals the text, or drop the credit sentence once the text is shown.

## T35 · Open shifts and bids (round-1 fixes verified: 8)

- **T35.1** [H, new] **Selvi Arumugam's night consent contradicts the Requests screen** — Make the two match. Either set nightConsent: true for Selvi in requests.tsx, or pick a different second claimant who has consent on both screens.
- **T35.2** [H, new] **Phone lets a worker claim two shifts on the same day with only 8 h rest** — After a claim, disable 'Claim' on clashing shifts and give the reason beside it, e.g. 'Clashes with your Night claim (8 h rest)'. You could also hide the clashing shift instead.
- **T35.3** [M, new] **Main buttons do nothing** — Wire each button to a state change. 'Offer an open shift' opens a dialog. Claim switches that row to the 'Waiting for manager' badge. Send bid shows 'Bid sent · you can change it until 15 Oct'. Remind changes to 'Reminded'.
- **T35.4** [M, new] **'Close window early' has no confirmation** — Use a ConfirmDialog with the consequence: '15 of 42 eligible people haven't bid. They lose the chance to rank patterns for November.'
- **T35.5** [M, NOT FIXED] **Shift times still break mid-time on desktop and phone** — Keep the time range on one line (nowrap on the slot span) and give the Shift column a min width. On phone, put the date on the first line and the time on the second.
- **T35.6** [M, new] **Skill is hidden at 871 while empty space remains** — Keep Skill visible by merging it into the Shift cell ('Line operator' under the time), or let the DataTable keep Skill before it drops required columns.
- **T35.7** [M, new] **Claimed shift has no withdraw action** — Add a bordered 'Withdraw claim' button under the badge, available until the manager awards the shift.
- **T35.8** [L, new] **Phone list has no relative date badge** — Add a DueBadge ('in 8 days') under each phone row title, the same as the manager table.
- **T35.9** [L, new] **'Widen pool' gets disabled without a reason and changes the pool silently** — Name the change in the label: 'Offer to all Hosur lines (+6 eligible)'. When disabled, show 'Already offered to the whole plant'.
- **T35.10** [L, new] **Jargon in the bid patterns** — Write 'Rotating: Morning, Evening, Night'. Move the tie-break rule to a line of muted text under the KPIs instead of a KPI tile.
- **T35.11** [L, new] **'Awards to approve' card is a placeholder with no action** — Say 'Awards appear here after the window closes on 15 Oct' and add an 'Open November roster' button.
- **T35.12** [L, new] **Phone 'none eligible' state has no next step** — Add 'See my shifts' or 'Turn on open-shift alerts'.
- **T35.13** [L, new] **Help button covers table text on phone** — Add bottom padding to the page that is at least the help button's height, or move the help button into the header on phones.

## T36 · Presence-based attendance (round-1 fixes verified: 8)

- **T36.1** [H, BROKEN BY FIX] **Without consent, the drawer always says 'Present', even for a half day** — Use statusTone(day.status) and day.status in that branch, and give each day its own web check-in time (or 'No check-in' when there isn't one).
- **T36.2** [M, new] **Every person has the same consent dates** — Add consentGiven and consentWithdrawn to each PresenceDay (or each person), and show them from that data. In the withdrawn story, withdraw consent for one person only, and show that person's days after the withdrawal date as check-in days.
- **T36.3** [M, BROKEN BY FIX] **New buttons do nothing** — Make 'Open in muster' and 'Review and give consent' links to the muster and Me › Privacy screens. For 'Correct day', open the regularise request form for that person and date. For 'View consent record', open a small panel with the consent dates and version.
- **T36.4** [M, new] **Number of WFH days differs from the request screen** — Make the SEPTEMBER calendar in time-data.ts hold 2 WFH days for Divya (or change wfhUsed to 1), so both screens agree.
- **T36.5** [L, new] **Employee page title is the same as the main attendance screen** — Title it 'My work-from-home days' (keep 'My attendance' highlighted in the nav), or put this list as a section inside the real My attendance screen.
- **T36.6** [L, new] **List is not sorted by date** — Sort days newest first (28, 25, 22, 21) before rendering.
- **T36.7** [L, new] **Drawer subtitle has an internal term** — Use 'Work from home' alone, or 'Work from home · from Teams status'.
- **T36.8** [L, new] **No-consent alert and button say the same thing twice** — Shorten the alert to 'No presence signals are read. Check in as usual.' and let the button carry the action.

## T37 · Industrial-action event (round-1 fixes verified: 8)

- **T37.1** [H, NOT FIXED] **'Edit dates' and 'Cancel event' do nothing** — Wire 'Cancel event' to a ConfirmDialog ('Cancel the lay-off for 120 workers, 5–7 Oct? Their days go back to normal attendance.') with variant danger, and wire 'Edit dates' to a dialog with From/To DatePickers that reuses the form's date check. Hide 'Cancel event' when the event has ended.
- **T37.2** [M, BROKEN BY FIX] **Effect sentence repeats itself and contradicts itself** — Keep the attendance part and the pay part separate and say each once: '120 workers × 3 days marked Strike, not absence or leave. Pay: none for these days.' Remove 'not counted as absent' from payLine's strike and lockout branch.
- **T37.3** [M, new] **'Legality not set' warning has no matching action** — When legality is undetermined, show one InlineAlert ('Pay for 360 worker-days is on hold until you set legality') with a primary 'Set legality' button, and label the header button 'Set legality' in that state.
- **T37.4** [M, new] **Header text is hard-coded and shows the raw value** — Store a verifiedOn date with legality and set it to TODAY when legality changes. Render labels from LEGALITY ('Legality: Legal, set 29 Sep'). Format the year from `to` (or use formatDate).
- **T37.5** [L, new] **Record does not show which workers or which notice** — Replace the 'Day status' KPI with 'Workers: Operations · Line workers'. Add a 'Notice' row (the reference entered) to the treatment card.
- **T37.6** [L, NOT FIXED] **'DA' is still unexplained** — Write it out: '50% of basic pay + dearness allowance'. If the KPI gets too long, use '50% of basic + allowance' and give the full term in the Payroll row.
- **T37.7** [L, new] **Blocked reason is cut off from the button on phone** — Put the reason directly under or next to 'Record event' (e.g. stack the reason above the button row on narrow screens). Show the date error only under the To field and use a short 'Fix the dates' beside the button.
- **T37.8** [L, NOT FIXED] **Cancel only half-resets the form** — Reset every field (type, from, to, group, legality, notice) to its initial value, or rename the button 'Clear form'.
- **T37.9** [L, new] **Requests count differs between desktop and phone** — Take both badges from one count in time-data (e.g. the same pending-requests length).

## T38 · Standby and call-out (round-1 fixes verified: 8)

- **T38.1** [M, BROKEN BY FIX] **Roster week does not match the call-outs it sits above** — Show the current week (28 Sep – 4 Oct) with Mon 28 SB and Tue 29 G marked, or add previous/next week buttons that open on the current week.
- **T38.2** [M, new] **Phone: grid scrolls sideways and names are cut** — Below 768, show one card per person with the 7 days as a two-column list (or a day picker), with the full name and hours in the card header.
- **T38.3** [M, new] **Phone: call-out row is squeezed into a narrow column** — On narrow screens, put the badge and button on their own row under the text (flex-wrap or a column layout below 600px).
- **T38.4** [M, new] **'Save call-out' does nothing** — Wire Save to close the dialog and add the row (or show a toast), and make the fields hold state.
- **T38.5** [L, new] **Dialog is pre-filled with a call-out that is already logged** — Pre-fill a different call-out time (for example 4:10 am – 4:50 am), or open with empty times and warn when a call-out overlaps one already logged.
- **T38.6** [M, new] **'Move next shift' changes a published shift with no confirm and no notice** — Open a small confirm that shows the new times (1:40 pm – 10:40 pm) and says 'Anil will be notified'. After moving, show 'Anil notified' on the row.
- **T38.7** [M, new] **Employee phone does not show today's short rest or the moved shift** — Add a 'Today' card: 'Your shift starts at 1:40 pm (moved for rest after your call-out)', or 'Rest short: 6 h 50 m · your manager has been told'.
- **T38.8** [L, new] **Published roster repeats the same rest-conflict pattern** — Flag standby followed by an early shift (a neutral 'If called out, rest is short' hint), or roster Fri 9 as a later or off day.
- **T38.9** [L, NOT FIXED] **Standby chips still show no time in the grid** — Show 'SB 6 pm' like the other chips.
- **T38.10** [L, new] **Large empty gap between the header and the legend** — Remove the extra top margin on the legend paragraph, or put it right above the grid header.

## T39 · Block-leave planner (round-1 fixes verified: 9)

- **T39.1** [H, new] **Suspension dialog always names Revathi, whichever row opened it** — Store the selected row (useState<BlockRow|null>) and build the name, start date and restore date (next working day after r.to) from it.
- **T39.2** [M, new] **Suspension story shows a confirm the screen would block** — Either set the story's TODAY context near 11 Oct, or label the dialog as scheduling a future suspension ('Schedule access pause from 12 Oct'), which makes early confirmation valid.
- **T39.3** [L, new] **Dialog says 'pause', button says 'suspension'** — Rename the button to 'Start block and pause access'.
- **T39.4** [L, new] **Manager empty state offers no next step** — Add a bordered 'Open team leave calendar' button, or drop the screen from the manager nav when nobody is in scope.
- **T39.5** [L, new] **Planned rows repeat the start date and have no relative badge** — Replace 'Starts 12 Oct' with a DueBadge ('in 13 days') as the disabled reason beside Start block.
- **T39.6** [L, new] **Phone KPIs leave 'Not planned' alone on a second line** — Drop the 'Roles in scope' KPI, or use a 2- or 3-column KPI grid on phones.
- **T39.7** [L, new] **No leave type shown for the block** — Add 'Earned leave · 18 left' to the secondary line of Not planned and Planned rows.

## T40 · Licence requirements (round-1 fixes verified: 10)

- **T40.1** [M, BROKEN BY FIX] **Babu Raj is blocked from 'today's forklift shift', but no roster has him and the roster's licence guard doesn't mention him** — Add Babu Raj to the plant roster people (PLANT_PEOPLE) on today's forklift shift, shown as blocked, and add a line to GuardsCard: 'Babu Raj · forklift licence expired 27 Sep · 2 days ago'. Better still, build GuardsCard from the same LIC watch list so both screens read one source.
- **T40.2** [M, new] **'View holders' lists only the people who need action, but the drawer subtitle says '6 holders'** — Either rename the button 'Needs action' and set the subtitle to '2 of 6 need action', or list all holders with their expiry date, sorted soonest first, with the expired and expiring ones at the top.
- **T40.3** [M, new] **Needs-action badges stack vertically and press against the row borders** — Give the Needs action column a min width (about 180px) or nowrap so both badges stay on one line, and add a small gap. Or show a single cell: '1 expired · 1 expiring'.
- **T40.4** [M, new] **'Find replacement' opens the manager's open-shifts view while the user is HR** — Link to the TIM-05 Roster (HR/plant persona) for today's forklift shift, or to an HR variant of the open-shifts story filtered to forklift.
- **T40.5** [L, new] **The alert says 'driving licence', but the requirement is 'LMV + forklift endorsement'** — Build the alert text from LIC[0].licence, or use 'forklift licence' everywhere.
- **T40.6** [L, new] **The month in the alert is hard-coded** — Use formatDate(babu.expires), as the drawer already does.
- **T40.7** [L, new] **Add/Edit requirement dialog saves nothing and doesn't check required fields** — Disable Save until the required fields are filled (show the reason), add the new or edited row to local state, and show a toast. Make the reminder days three number fields or a fixed multi-select.
- **T40.8** [L, new] **The Columns control shows on phone cards, where it has no clear effect** — Hide the Columns and density buttons in card mode (a shared DataTable fix), so the toolbar shows only the filter chip.

## T41 · Hybrid office days (round-1 fixes verified: 7)

- **T41.1** [H, new] **Plan grid scrolls sideways on phone (manager and employee)** — Below 768px, show the plan as cards. For the employee: one row per day with the Home | Office Segment, as HybridPhone does. For the manager: one card per person with five day chips, or a day picker with the team list under it. Remove the sideways-scroll region.
- **T41.2** [H, new] **Phone 'Save my plan' does nothing; desktop plan edits have no save at all** — Wire the save so it shows a toast ('Plan for week of 5 Oct saved'), and keep it disabled until something changes. Add the same 'Save plan' button at the end of the desktop plan tab (R8: not sticky). For the manager, say who is told ('Saved · Rahul Deshpande notified').
- **T41.3** [H, BROKEN BY FIX] **Policy form: Save does nothing and the fields can't be changed** — Hold the policy in state. Make the number and select editable. Disable Save until something changes, then show a 'Policy saved' toast. Build the header description from the saved policy.
- **T41.4** [H, new] **Employee sees manager and HR menus in the Time nav** — Have TimePage filter nav groups by the user's role. An employee sees 'My time' only.
- **T41.5** [M, new] **Plan cells give no sign they can be clicked; 'Home' is a borderless text button** — Give editable cells a bordered chip style with a hover state, or use a small Home|Office Segment as on the phone. Add a one-line hint above the grid ('Click a day to switch; Tue and Thu are fixed'), and show the anchor reason as visible text, not only a hover title.
- **T41.6** [M, new] **Compliance rows clip their facts on phone** — Let the secondary line wrap to two lines, or shorten it to '2 office + 1 on duty' with the explanation as a footnote ('On-duty and leave days count as office days'). Keep the badge on the name line.
- **T41.7** [M, new] **Plan tab shows 'Short by 1' with no action** — Put a 'Remind' button (bordered, size sm) next to the 'Short by 1' badge, as on the Compliance tab.
- **T41.8** [M, new] **HR policy page is titled 'Quality team' and sits under Team leave** — For HR, title the page 'Hybrid policy' and open on the Policy tab. Drop 'Plan week', or turn it into an office-wide view with a team filter. Give the screen its own nav entry ('Office days') rather than 'Team leave'.
- **T41.9** [L, new] **Jargon and a vague hint on the pay switch** — Use 'Link to pay deductions or ratings' with the helper 'Missed office days never cut pay unless HR adds a pay rule'.
- **T41.10** [L, new] **'Planned' column is mostly blank and its header doesn't fit what it shows** — Rename the column 'vs target' and show a neutral '3 of 3' when the target is met, or fold the short badge into the name cell. For the employee, drop the Person column and the blank Planned cell and show 'You: 3 of 3' above the table.
- **T41.11** [L, new] **Phone plan doesn't warn when you drop below target and has no 'Who's in'** — Turn the KPI amber and show 'Short by 1' under it when below target. Add a compact 'Who's in' line under each day (for example 'Nisha Menon').

## T42 · Holiday feed settings (round-1 fixes verified: 7)

- **T42.1** [H, new] **Change rows are crushed into a thin column on phones** — In time-kit.css, give .yx-tim-list__main a real basis (e.g. flex: 1 1 16rem) so the action group drops below the text on narrow screens. Every list that uses yx-tim-list will benefit.
- **T42.2** [H, BROKEN BY FIX] **Add feed dialog's confirm does nothing** — Append the new feed to feeds on confirm. Default to a state that has no feed yet, or disable states that already have one with "Already subscribed". Filter locations by the chosen state.
- **T42.3** [M, BROKEN BY FIX] **Remove deletes a feed at once, even with changes waiting** — Ask first: "Remove Tamil Nadu feed? Chennai office keeps its current holidays; the 2 waiting changes are dropped." Use the destructive variant on the confirm button.
- **T42.4** [M, new] **Publish does nothing when enabled** — On publish, clear the published changes, show a success alert ("Published 1 change to Chennai office calendar. Leave refunded for 2 people."), and set the Tamil Nadu badge to "Up to date".
- **T42.5** [M, new] **Check for updates and Start Hosur plant calendar do nothing** — Wire Check for updates to update "last checked" to today (29 Sep) and show a result. Wire Start Hosur plant calendar and Open holiday calendars to the TIM-26 calendar (Hosur tab, template start).
- **T42.6** [L, new] **Disabled header buttons give no reason when feeds are off** — Hide both buttons when feeds are off (the alert already explains), or add "Turn on feeds to add or check feeds".
- **T42.7** [L, new] **"Refunded" is unclear for leave** — "When you publish, their 9 Nov leave goes back to their balance and they are notified."
- **T42.8** [L, new] **People list opens as hidden text in the note** — Show the names as a short list under the note, with leave type and days (e.g. "Rahul Deshpande · Casual leave · 9 Nov").

## T43 · Timesheet pre-fill from my tools (round-1 fixes verified: 7)

- **T43.1** [H, BROKEN BY FIX] **Disabled 'Accept all new (0)' looks like a live solid-green button** — In actions.css, add .yx-button[data-variant="approve"]:disabled and the dialog, sheet and drawer foot variants with the disabled colours, after line 143. In this screen, hide the bulk button when fresh.length is 0 instead of showing '(0)'.
- **T43.2** [M, new] **Phone pre-fill has no way to finish or go back** — Render the same footer on phone ('Back to timesheet' plus 'Accept all new (n)', stacked full width). Add a back arrow to the PhoneFrame header. Make 'GitHub isn't connected' carry a 'Connect' button, or reuse the 'Your tools' card.
- **T43.3** [M, new] **Suggestion rows are crowded at phone width** — Below 480px, stack the row: the title on one line ('Mon 28 Sep · 1 h'), the project and task on the next, then the source with its badge, then the buttons on their own row (or 'Already on your timesheet' under the text). Keep the project code from breaking with white-space: nowrap.
- **T43.4** [L, new] **Phone can't edit a suggestion's hours, but the drawer at 390 can** — Show Edit on phone too; the NumberField row fits when the row is stacked. Otherwise drop the phone prop so both phone views behave the same.
- **T43.5** [L, new] **Edited hours aren't checked against the day** — Limit the field to what is left of the day's expected 8 h, or show a warning next to 'Save hours' that names the new day total (for example 'Mon would be 17 h').
- **T43.6** [L, new] **'Rule' and 'AI' badges don't say what they mean** — Put the reason in the source line, for example 'Matched by your rule: calendar titles with "Sundaram Retail" go to SRF-24'. For AI: 'Estimated from 6 Jira issues closed; check the hours'. Keep the badge short.
- **T43.7** [L, new] **Connect-tools empty state has no button** — Add a 'Connect work calendar' button to the empty state, or a 'Fill week by hand' button like the No suggestions state has.

## KIT · Kit (round-1 fixes verified: 10)

- **KIT.1** [M, new] **Not clocked in at 9:42 am, 12 min after a 9:30 shift start, with no late warning** — After shift start plus grace, show an amber badge such as '12 min late' or 'Late mark 3 of 3 if you clock in now' beside Not clocked in. Use the same lateMarkNumber logic the DayCard uses.
- **KIT.2** [M, new] **The same 29 Sep 9:38 am clock-in is Web in one story and Biometric in another** — Make the ClockCard stories share one punch fixture for 29 Sep, so the first in-punch is the same source in every state.
- **KIT.3** [M, new] **Month cells wrap overtime and late minutes over 2 to 3 lines on phone** — Below about 600 px, hide the cell mark (the legend and KPIs already carry it) or show a single dot. Otherwise use a short no-wrap form ('+45m') with white-space: nowrap.
- **KIT.4** [M, new] **Internal roadmap jargon in the camera caption** — Use 'Selfie check-in is not switched on for your company.' and drop the wave reference.
- **KIT.5** [L, BROKEN BY FIX] **'1 regularisations sent': plural is wrong** — Use the existing plural() helper: plural(s.waiting, 'regularisation sent', 'regularisations sent'), or reword the note as 'sent, waiting'.
- **KIT.6** [L, BROKEN BY FIX] **'Fix 10 Sep' button and 'Waiting for approval' sit apart from the KPI they belong to** — Put the 'Fix 10 Sep' button inside the Days to fix KPI cell (under '10 Sep'), or merge the two into '1 to fix · 1 waiting' with the button beside it.
- **KIT.7** [L, NOT FIXED] **Calendar cells still say 'OT' and today's cell says 'Now'** — Use '+45 m overtime' or a clock icon with '45 m', label today's cell 'Today', and format whole hours as '1 h'.
- **KIT.8** [L, new] **Clock out is disabled during a break with no reason given** — Add a muted line beside the button, 'End your break to clock out', or let Clock out end the break and clock out in one step.
- **KIT.9** [L, NOT FIXED] **Add note is offered before any punch exists** — Either show Add note only once a punch exists, or label it 'Add note to clock-in' and attach the note to the next punch.
- **KIT.10** [L, new] **Outside-office alert repeats its title in the body** — Body: 'Clock in as work from home or on duty instead?'.
- **KIT.11** [L, new] **Clocked-out progress bar turns amber for a normal day** — Keep the bar neutral or green when worked is within grace of expected. Use amber only when the shortfall causes a half-day or a penalty, and say so.
- **KIT.12** [L, new] **Pending regularisation badge is amber, and the header text says 'Regularise sent'** — Use a neutral badge, 'Waiting for Divya Menon since 23 Sep', and fix the data note to 'Regularisation sent 23 Sep: ...'.
- **KIT.13** [L, new] **Locked absent day shows 'Late No' and 'Overtime None', and the payroll month is unclear** — Show '—' for Late and Overtime when there are no punches. Name the payroll by the next open run. For the HR viewer, drop the 'extra HR approval' wording.
- **KIT.14** [L, new] **GeoMap accuracy circle is drawn larger than the 200 m zone** — Draw the accuracy radius and the distance at the same scale as the fence radius, or drop the halo and keep the caption. Offset the fence label so it doesn't collide with pins.
- **KIT.15** [L, new] **Phone ClockCard progress bar squeezed by its label** — Below about 480 px, put the label on its own line under a full-width bar.
- **KIT.16** [L, new] **Device codes break mid-code on phone** — Wrap device codes in a span with white-space: nowrap, or drop the code for employees (the 'Gate 2 reader' / 'Kiosk Reception' name is enough).
- **KIT.17** [L, new] **Page variant shows grace and opening time after clock-in** — Show the grace and opening line only while not clocked in (line 506).
- **KIT.18** [L, new] **ShiftBar axis labels crowd at phone width** — Below about 480 px, label every 6 hours (6 am, 12 pm, 6 pm) only.
