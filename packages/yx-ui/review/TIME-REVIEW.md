# Time module review (pilot)

Reply with the IDs to skip (e.g. "skip T05.3, T12.*") or "do all". Severity: H high, M medium, L low.

## Shared fixes (fix once, helps many screens)

- **S1** [H] **Signed-in person is hard-coded to Divya Raghunathan (Engineering, reports to Karthik), so every approver line and HR view is wrong** — In _kit/data.ts set ME.department = 'Quality' and ME.manager = 'Divya Menon' (Quality head, per DEPARTMENT_HEADS and Data facts). Replace every literal 'Karthik Subramanian' in the Time screens with ME.manager. For requests from Divya's reports (Meera Krishnan, Arun Prakash) the approver is ME.name, not Karthik. _(src/screens/_kit/data.ts (ME) + time-kit.tsx (DayCardBody line 612) + literal 'Karthik Subramanian' in leave.tsx:228/238/266/333/389, requests.tsx:154/166/171, attendance.tsx:139/256, ops.tsx:134; 10 screens)_
- **S2** [H] **TimePage has no user prop, so HR, Finance and System Admin stories all show the DR avatar** — Add `user?: {name, role}` to TimePage and pass it to DesktopFrame. HR stories pass HR_ADMIN (Lakshmi Venkatesan, LV), Finance/payroll stories pass PAYROLL_ADMIN (Suresh Pillai). Then HR leave-card and adjust-balance stories show Lakshmi adjusting Divya's balance, not Divya adjusting her own. _(time-kit.tsx TimePage (line 49) → _kit/frames.tsx DesktopFrame (user defaults to ME); 7 screens)_
- **S3** [H] **Manager scope is a department filter or hand-picked list, not 'my reports'** — Add `managerName` to TeamPerson (t1–t8 → 'Divya Raghunathan'; t9 Vikram Natarajan → 'Vikram Rao'; t10–t12 → 'Ramesh Gowda') and export `myReports = TEAM.filter(p => p.managerName === ME.name)`. Use it in every manager story. TEAM_MEMBERS = TEAM.slice(0,9) currently includes Vikram Natarajan (Sales). Exclude ME from the manager's own exception queue (TIM-04 shows two KF-0001 rows). _(src/screens/time/time-data.ts TEAM / TEAM_MEMBERS (no reportsTo field); screens filter by dept === 'Quality' or use hard-coded name lists; 11 screens)_
- **S4** [H] **DayCardBody hard-codes facts that should come from the day** — Show Worked as '—' (with 'no check-out') when there is no out punch, and show the break note only when worked > 5 h. Take the fence from the punch location (21 Sep is at Hosur plant, not 'Chennai office · 200 m'). Build the locked text from the day's month, not 'August 2026 is locked'. Count late marks from the month ('2 of 3', not '4'). Show 'Nudge to fix' / 'Fix this day' only for MP/A, not L. Pass the viewer to the alert copy so HR doesn't see 'Regularise it with your actual out time'. Require onFix. Show OT as 'pending' or 'approved' from the data so it matches the calendar's 'approved only' totals. _(time-kit.tsx DayCardBody (~lines 550–625); 5 screens)_
- **S5** [H] **ConfirmDialog has no approve variant: every approve confirm is blue** — Add `confirmVariant?: 'primary' | 'approve' | 'danger'`. Use approve for Approve, Award shift, Approve with override, Agree to swap and Approve draft; use danger for 'Confirm suspension'. The TIM-19 drawer footer Approve should also be the solid green `variant="approve"`, not the pale outline. _(src/components/overlay.tsx ConfirmDialog (only `destructive`); 6 screens)_
- **S6** [H] **DataTable truncates key text at 1440, hides the wrong columns and scrolls sideways on phones** — Wrap text to two lines by default instead of using an ellipsis. Hide only columns marked `optional: true`, never by position (Expired, Payroll, Statutory cap and Claims are hidden today). Below 600 px, render rows as cards (primary cell, then label/value pairs) instead of a clipped table. In the footer, pluralise ('1 row') and leave the total off when most columns can't be summed. _(src/components/table.tsx (DataTable); 10 screens)_
- **S7** [M] **Roster grid: Hours column clipped at 871, and leave days count as worked hours** — Pin or wrap the Hours column so it fits at 871. Exclude leave cells from weekly hours (Jaya Prakash shows 40 h with EL on Thu 8 Oct, so it should be 32 h). Block Publish while rest or leave conflicts are open (Senthil N Wed 7 then M Thu 8 has 0 h rest) and give each warning a 'Fix' button. _(src/components/roster.tsx (grid ~296–340); 3 screens)_
- **S8** [M] **GeoMap leaves empty bands and squeezes its caption** — Use 'xMidYMid slice' (or width 100% with height from the aspect ratio). Lay out the footer as one left-aligned row: icon, then caption. Replace filler captions ('Map preview · punches and the allowed geofence') with data, e.g. 'Accuracy 18 m'. _(time-kit.tsx GeoMap (line 167, preserveAspectRatio 'xMidYMid meet', caption footer); 6 screens)_
- **S9** [M] **PunchList and VERDICT labels are wrong for non-GPS sources and the rows crowd** — Give the time and kind columns no-wrap and a fixed min-width ('1:15 pm', 'Break start'). Don't show a geofence verdict for biometric, kiosk, Teams or desktop sources. Don't label Teams presence rows 'Field-recorded', and say 'Teams presence' only once per row. Use 'At Chennai office' instead of 'Inside geofence' in the employee-facing text. _(time-kit.tsx PunchList (line 91) + VERDICT/SOURCE_LABEL maps; 4 screens)_
- **S10** [M] **Text links act as buttons in shared pieces** — Replace <Link href="#"> actions with bordered <Button size="sm">: 'Add note', 'Regularise', 'Fix 10 Sep', 'Browse files', 'Choose optional holidays · 1 of 2', 'Open field-force map'. Hide 'Add note' when clock-in is blocked. Upload hint: show 'PDF, JPG or PNG · up to 10 MB' instead of the raw upper-cased MIME types. _(time-kit.tsx ClockCard (lines 438, 451), src/components/upload.tsx ('browse' link); 5 screens)_
- **S11** [M] **No shared relative-date badge, so dates that matter have no urgency and colours are wrong** — One helper: 'in 3 days' / '2 days ago'. Neutral beyond 7 days, amber within 7 days, red when overdue. Examples: comp-off 14 Oct = 'in 15 days', which is neutral, not amber. Block-leave cut-off 31 Oct = 'in 32 days', neutral, not red. September freeze 30 Sep = 'tomorrow', amber. Forklift licence 27 Sep = '2 days ago', red. _(time-kit.tsx (add DueBadge(date, TODAY)); 8 screens)_
- **S12** [M] **Time nav is missing pages and has a hard-coded Requests count** — Add 'Exceptions' and 'Team leave' items so pages stop borrowing 'Requests' or 'Leave calendar' as active. Employee pages (My shifts) use the My time group. Derive the Requests count from data: LEAVE_REQUESTS has 3 pending, the nav says 7 and TIM-29 says 12. _(time-kit.tsx timePanel (counts default { Requests: 7 }); 6 screens)_
- **S13** [M] **Pinned drawer/sheet footer and floating help button cover content on phone** — Pad the scroll area by the footer height (or put the footer at the end of the content, per R8). Offset the help button so it doesn't cover the last row, or hide it while a sheet is open. _(src/components/drawer.tsx sheet footer + shell help FAB; 3 screens)_
- **S14** [M] **Wizard 'review' stories render step 1** — Give the Stepper a final review step (or pass the `review` prop) so current='review' shows the summary before 'Apply backfill' / 'Post entries'. Disable those buttons with a reason when blocked: before 31 Dec for year-end, or while pending requests remain. _(src/components/stepper.tsx usage (no step with id 'review'; `review` prop not passed); 2 screens)_

## Data that disagrees across screens

- **C1** [H] **Divya Raghunathan's department and manager disagree with Data facts and with her own team** — _kit/data.ts ME: department 'Engineering', manager 'Karthik Subramanian'. RULES: Divya is Senior QA Engineer, Quality. All her reports in TEAM t1–t8 are Quality. Approver shown as Karthik (Engineering head) on TIM-03, TIM-07, TIM-15, TIM-18, TIM-19, TIM-21 ledger, TIM-22 and My attendance, while the TIM-17 fix proposes 'Waiting on Divya Menon (Quality head)'. → ME.department='Quality', ME.manager='Divya Menon', and use ME.manager everywhere.
- **C2** [H] **Divya's pending earned-leave request has two different date ranges and day counts** — LEAVE_REQUESTS lr1: EL 12–13 Oct, 2 days (shown on TIM-17, TIM-19). TIM-21 projection says '− 2 pending (9–12 Oct)'. TIM-18 form says 9–12 Oct, 'Days counted 4', but its Sent alert says '9–12 Oct (3 days)'. TIM-24 says '2 EL days pending for 9–12 Oct'. TIM-27's example calls the same 9–12 Oct leave 'Priya's'. → Use lr1 (12–13 Oct, 2 days) as the only pending request. Build TIM-18 Sent, TIM-21 projection and TIM-24 from lr1. Rename the TIM-27 example so it is no longer Divya's dates.
- **C3** [H] **Earned leave balance 14 doesn't add up on any screen** — BALANCES EL: credited 15, taken 5, balance 14 (15 − 5 = 10). TIM-21 ledger adds '+6 carry-forward' (15 + 6 − 5 = 16) and a projection of 16.5 (14 + 3.75 − 2 = 15.75). The TIM-21 adjust dialog says 'Balance after: 16'. TIM-27 example: 'Days counted 4, Balance after 10' from 14. TIM-24: 5 days encashed gives 'after 9', ignoring the 2 pending. → Set credited 15 + carried 4 = 19, taken 5, balance 14, pending 2 (available 12). Make the TIM-21 ledger entries sum to these figures (carry-forward +4, not +6) and derive every 'balance after' from BALANCES.
- **C4** [M] **Casual leave balance and taken days don't reconcile, and 4.5 is reused for other people** — BALANCES CL taken 3.5. September alone has CL 16–17 Sep plus a half day on 24 Sep (HD) = 2.5, but the TIM-21 ledger has only '−2 CL'. TIM-04 resolve dialog gives Priya Shankar 'Casual leave balance 4.5' (Divya's figure). The TIM-13 kiosk gives Kavitha 4.5 CL, while TIM-30 Leave reports show Kavitha CL 3. → Add ledger rows for the 24 Sep half day and the 1 day taken before September. Give Priya and Kavitha their own balance rows in time-data and read them by person.
- **C5** [H] **KF-0118 is two different people** — time-data.ts TEAM t2 / EXCEPTIONS x4: Meera Krishnan KF-0118, QA Analyst, Quality. Data facts: KF-0118 is Meera Iyer, Lab Analyst, resigning with last day 19 Oct 2026. Seen on TIM-01, TIM-04, TIM-17 and TIM-19. → Give Meera Krishnan a free code (e.g. KF-0119) in TEAM and EXCEPTIONS.
- **C6** [H] **Meera Krishnan checked in after 'now'** — TODAY is 29 Sep, 9:42 am. TEAM t2 inAt '09:58', 'Late by 28 m', shown on TIM-01 and TIM-17. → Set inAt '09:38' and detail 'Late by 8 m' (grace 10 min: either make her 'not_in' or 'late' with an in time before 9:42).
- **C7** [H] **Leave spans a public holiday and still counts it** — lr3 Meera Krishnan SL 1–3 Oct = 3 days, but 2 Oct is Gandhi Jayanti (HOLIDAYS), so it should be 2 days. The TIM-13 kiosk supervisor has 'Casual leave 2 Oct approved'. TIM-15 timesheet puts Gandhi Jayanti on Thu 1 Oct and expects 8 h on Fri 2 Oct. → lr3 days: 2. Move the kiosk supervisor's leave to 1 Oct. Put the timesheet holiday on Fri 2 Oct with 0 h expected.
- **C8** [H] **Open exception count differs on every screen** — EXCEPTIONS has 5 open blocking rows (x1, x2, x3, x4, x7) plus 1 request pending. TIM-01 says 3 (manager) / 7 (HR). TIM-02 Muster says '12 open exceptions' and its lock dialog says 3. TIM-11 Periods says '7 open · blocks'. TIM-01 phone KPI 'Not in 2' vs KPI 'Not checked in 1'. → Derive every count from EXCEPTIONS (scoped for the manager): HR 5 blocking, manager = those for myReports.
- **C9** [M] **Pending request totals disagree** — LEAVE_REQUESTS has 3 pending (lr1, lr3, lr4). The Requests nav badge is fixed at 7. TIM-29 says '12 leave requests are still pending'. TIM-11 shows '2 pending' leave for every month. → Compute the counts from LEAVE_REQUESTS (plus attendance and OT requests if the nav means all requests).
- **C10** [H] **September is described as frozen or locked before it ends** — TIM-11 Periods: September 'Open · Freezes 30 Sep'. TIM-10: 'September is frozen. Effects land in October payroll'. TIM-16 Form 25: 'frozen with the period lock'. Attendance calendar: August 'payroll approved 30 Aug' while 31 Aug is a working day marked P. → Treat TIM-11 as the source: September open until 30 Sep. Say 'freezes tomorrow' on TIM-10 and TIM-16. Approve August payroll on or after 31 Aug (e.g. 2 Sep).
- **C11** [H] **Events shown as done on dates after 29 Sep** — TIM-05 'Published 1 Oct'. TIM-38 call-out 'Thu 1 Oct, 2:00 am' logged and paid, phone 'standby tonight · Thu 8 Oct'. TIM-37 'legality verified 3 Oct'. TIM-15 hours booked for 30 Sep and 2 Oct, with the week ending 4 Oct approved. TIM-43 suggests 30 Sep commits. TIM-07 'OT pre-approval' for 22 Sep (past). TIM-11 lets October be locked on 29 Sep. TIM-29 posts year-end 2026 in September. → Move done-events to on or before 29 Sep (e.g. Published 26 Sep, call-out Mon 28 Sep, verified 25 Sep). Pre-approval dates go after today. Disable locking or posting for periods not yet ended, with the reason beside the button.
- **C12** [L] **Same leave approval has two approval dates** — lr2 Divya CL 16–17 Sep. The TIM-19 timeline shows it approved 10 Sep, 11:05 (leave.tsx:266). The TIM-21 ledger shows 'Karthik Subramanian approved −2 Casual leave' on 17 Sep, 11:05 (leave.tsx:333). → Use one date (e.g. 10 Sep, a day after applied 9 Sep) in both, from the request row.
- **C13** [M] **Comp-off credits for days Divya didn't work** — BALANCES CO: '1 day expires 14 Oct'. TIM-22 lists 'Mon 14 Sep · Vinayaka Chaturthi — Already credited automatically'. TIM-22 claims 4 h 30 m worked on Sat 26 Sep. SEPTEMBER has 14 Sep = 'H' and 26 Sep = 'WO', both with no workedMin or punches. → Give SEPTEMBER 14 and 26 a workedMin (e.g. 14 Sep 480, 26 Sep 270) with an OT/comp-off note, or move the credited day to a date she worked.
- **C14** [L] **Divya's 22 Sep is described three different ways** — EXCEPTIONS x5: 'Missing check-out', but DAY_22_PUNCHES has an Out at 14:02 (outside geofence). The SEPTEMBER note says 'Regularise sent 23 Sep: wrong time'. TIM-04 lists it as a Missing check-out. → Make x5 kind 'Check-out outside geofence' (or a new kind) and keep the regularise reason as 'Out recorded outside office'.
- **C15** [L] **Kavitha Sundaram's check-in time differs** — TEAM t10: in 06:02, biometric (TIM-01). TIM-13 kiosk: checked in 5:54 am. → Use 06:02 on the kiosk, or set the kiosk story time before her punch.
- **C16** [M] **Field visit numbers for Vikram Natarajan disagree** — TEAM t9 and TIM-32: '2 of 6 visits', 14.2 km. TIM-33 beat plan: 3 visits, 1 done. TIM-33 conveyance: 4 visits, 42 km. TIM-32 visit log: 3 visits. → Use one FIELD record for Vikram (e.g. 6 planned, 2 done, 14.2 km) in TIM-32 and TIM-33.
- **C17** [H] **Licence alert contradicts its own table** — TIM-40 blocked story: 'Driving licence expired 27 Sep for Mohammed Irfan' (before today, 29 Sep), but the Forklift driver row shows Expired 0 (roster.tsx:572). → Set l1 expired: 1.
- **C18** [H] **Roster people rostered against their leave, consent and skill** — Jaya Prakash is on approved EL Thu 8 Oct but rostered Morning (TIM-05, preselected in the swap). TIM-35 lists Jaya and Lalitha Devi (Quality Inspector) as claimants for Wed 7 Night 're-checked OK' while both work Morning that day. Rekha Balan has no night consent (TIM-05) but TIM-08 swaps her to Night with Send enabled. TIM-34 calls Rekha 'free' while she is on E Wed 7. → Remove Jaya's 8 Oct shift. Drop Lalitha and Jaya from the night claimants. Default the TIM-08 swap to a consenting colleague. Change the TIM-34 sentence to 'Rekha Balan works Evening Wed 7 and has no night consent'.
- **C19** [M] **Rekha Balan's weekly-off pattern differs** — TEAM t11: 'Weekly off (4-on / 2-off)' (TIM-01). Her TIM-02 muster row uses the Chennai office pattern (Sundays plus 2nd/4th Saturdays). TIM-06's 4-on/2-off pattern shows 5–6 Oct off, while TIM-05 has Line 2 working those days. → Generate Hosur plant muster rows and the Line 2 roster from the 4-on/2-off pattern.
- **C20** [M] **Locations and entities that don't exist** — Data facts: Bengaluru head office, Chennai office, Hosur plant; two entities. TIM-35: 'Hosur + Krishnagiri pool'. TIM-28: 'Krishnagiri depot'. TIM-42: 'Colombo sales office (Kaveri Foods Lanka)'. TIM-39: 'BFSI pack', branch cashier, core banking. → Replace with Hosur plant / Chennai office, drop the Sri Lanka feed, and use food-plant roles for TIM-39 (or remove the screen from the Kaveri Foods tenant).
- **C21** [L] **Leave policy headcount and holiday feed disagree with other screens** — TIM-27: EL 'used in 3 policies (212 people)', but the TIM-28 policies cover 112 + 88 + 48 = 248. TIM-42 feed covers Hosur plant, but TIM-26 says 'Hosur plant has no 2026 calendar'. TIM-42 pending change moves Deepavali to 9 Nov, while HOLIDAYS and TIM-26 still say 8 Nov. → Make the TIM-27 count match TIM-28. Either give Hosur a calendar or drop it from the feed. Show the pending Deepavali change on TIM-26.
- **C22** [M] **Encashment minimum differs inside one screen** — TIM-24 Request helper: 'at least 7 days must remain'. Not-open text: 'minimum left after encashing is 10'. Over-max story leaves 5. → Use one policy value (e.g. 7) from the leave type, and cap 'More' at balance − minimum − pending.

## XC · Extra · Attendance calendar

- **XC.1** [H] **Manager view of Meera shows Divya's month** — Load the picked person's own days. For managers, replace 'To fix' with 'Open exceptions' and Nudge buttons for that person.
  _Seen:_ 'Attendance · Meera Krishnan' shows Divya's September: 10 MP, 22 R, 24 HD, To fix 'Regularisation pending with Karthik Subramanian'. It also shows employee-only 'Fix'/'View' actions. Meera's muster row and TIM-04 (24 Sep refused check-in) differ.
- **XC.2** [H] **Locked 21 Aug 'Absent' shows 9 hours worked** — Key punches by full date. Absent days show no punches and 'Worked 0 m'.
  _Seen:_ Locked period · day card, Fri 21 Aug 'Absent': 'Worked 9 h 00 m' and two Hosur on-duty punches. punchesFor() matches only the day number 21, so it reuses September 21's punches.
- **XC.3** [M] **'Payroll approved 30 Aug' before the month ended** — Use a date after the month ends, for example 'payroll approved 3 Sep'.
  _Seen:_ August badge: 'Locked · payroll approved 30 Aug', but 31 Aug is a working day marked P.
- **XC.4** [M] **OT 'approved only' vs day card 'pending'** — Show 'OT hours 0 approved · 1.75 pending', or mark those days approved.
  _Seen:_ Totals: 'OT hours 1.75 · approved only'. Day cards for 11 Sep and 25 Sep both say '… · pending approval'.
- **XC.5** [L] **Totals card is crowded with zero rows** — Show only codes with a count above 0. Drop the 'To fix' KPI, since the card covers it.
  _Seen:_ Totals list 15 codes including 'Absent 0', 'Earned leave 0', 'Sick leave 0', 'On duty 1' in two dense columns. 'To fix 2' repeats the To fix card just below.
- **XC.6** [L] **Phone 'Present 16.5' vs legend 'Present 12'** — Label the phone KPI 'Paid days' or add 'incl. WFH, OD, half days'.
  _Seen:_ Phone KPI 'Present 16.5', while desktop explains 'Days present 16.5 incl. WFH, on duty, half days' and the legend says 'Present 12'.
- **XC.7** [M] **Phone has no 'To fix' list or Regularise** — Add a red '1 day to fix · 10 Sep missing check-out' alert with a 'Fix' button above the grid.
  _Seen:_ Phone calendar shows the grid, KPIs and legend only. The 10 Sep missing check-out that blocks payroll is only a red 'MP' cell.
- **XC.8** [L] **Jargon in the subtitle** — Remove 'Punch mode'.
  _Seen:_ Employee subtitle: 'Chennai office · General shift 9:30 am – 6:30 pm · Punch mode'.

## XT · Extra · My attendance today (web clock-in)

- **XT.1** [H] **'This week' ignores today's real state** — Build today's row from the clock state: 'Not in yet', 'In 9:52 am · late', '9:38 am – 6:41 pm'.
  _Seen:_ In every story, 'Tue 29 Sep · Now · In at 9:38 am' stays fixed: Not clocked in, Outside geofence (no punches), Late (in 9:52), Shift not started (7:50 am), Clocked out at 6:41 pm.
- **XT.2** [H] **Regularise has no time field and no reason** — Add a date (from the header button), the time field(s) for the chosen fix, and a required reason. Disable 'Send request' until they're filled.
  _Seen:_ Regularise drawer: 'Wrong time recorded' is selected and Effect says 'In 9:38 am → In 9:25 am', but there's nowhere to enter 9:25 and no reason box. 'Send request' is enabled. It's always '29 Sep', even from 'Regularise a day'.
- **XT.3** [M] **Request goes to the wrong approver** — Route to Divya's real manager per People data (Quality: Divya Menon), the same on the day card and calendar.
  _Seen:_ Drawer subtitle 'Attendance request · goes to Karthik Subramanian'. Karthik heads Engineering, but Divya is a Senior QA Engineer in Quality.
- **XT.4** [M] **Late clock-in doesn't update late marks** — Count today's late: '3 of 3 free used · next late is a penalty', in amber.
  _Seen:_ Late story ('Late by 22 m') still says 'Late marks · 2 of 3 free used this month'. Today should make it 3 of 3, the last free one.
- **XT.5** [M] **Text links acting as buttons** — Make 'Add note' a small bordered button. Put a bordered 'Fix 10 Sep' button in the alert. The header already has 'Regularise a day', so drop the inline link.
  _Seen:_ 'Add a note to this punch' (underlined link), 'Wrong or missing time? Regularise' (link), and the red alert's 'Fix 10 Sep' (link).
- **XT.6** [M] **Week card skips a day and miscounts** — List Mon–Sat in order, including Thu 1 Oct. Compute expected hours (4 working days × 8 h 30 m = 34 h). Drop 'days shown'.
  _Seen:_ Shows Mon 28, Tue 29, Wed 30, Fri 2 Oct (no Thu 1 Oct), footer '3 days shown · 40 h 30 m expected this week' with 4 rows shown. 40 h 30 m doesn't fit a week with a holiday.
- **XT.7** [L] **Outside-geofence alert repeats itself** — Body: 'Clock in as WFH or on duty instead?'
  _Seen:_ Title 'You're outside Chennai office, 850 m away', then body 'You're outside Chennai office. Clock in as WFH or on duty?'
- **XT.8** [L] **Page says network, block says distance** — For web clock-in use only the network message ('Not on Chennai office Wi-Fi'). Keep the distance wording for the phone app.
  _Seen:_ Description: 'web clock-in from the Chennai office network'. The geofence story blocks by distance (850 m away), which a desk browser can't reliably measure.

## T01 · Today board

- **T01.1** [H] **Late person checked in after 'now'** — Make Meera's check-in 9:41 am, 'Late by 11 min', or move the board's now to 10:05 am. Keep all check-in times before the header time.
  _Seen:_ Header says 'Tue 29 Sep 2026, 9:42 am' but Late column shows 'Meera Krishnan · In 9:58 am · Late by 28 m', a check-in 16 minutes in the future (TEAM t2 inAt '09:58').
- **T01.2** [H] **Manager Field tab shows a Sales person** — Build the Field list and pins from the same scoped people list as the board. For Divya, show only Nisha Menon.
  _Seen:_ Manager · team, Field tab: 'Vikram Natarajan · 2 of 6 visits · 14.2 km · Tracking on' and his trail on the map. Vikram is Sales, not one of Divya's Quality reports. FieldSummary is hard-coded and ignores persona.
- **T01.3** [H] **'Not checked in' count says 1, column shows 2** — Split the column. Put Priya under 'In' with a small red 'Yesterday's check-out missing' badge and her Nudge. Name the column 'Not checked in' so its count matches the KPI.
  _Seen:_ KPI 'Not checked in 1', but the 'Not checked in / exceptions' column badge says 2. It also lists Priya Shankar 'In 9:29 am', who did check in, with a Nudge button.
- **T01.4** [H] **Phone Team today numbers contradict the list** — Compute the phone KPIs from the same Quality list as the board: In 2, Late 1, Not in 1, Leave 1, WFH/on duty 2.
  _Seen:_ Phone KPIs read 'In 3 · Late 1 · Not in 2 · Leave 1'. The list below has only two people with an 'In' badge (Arun, Rahul), and WFH/on duty is not counted. The KPI values are hard-coded at attendance.tsx:440.
- **T01.5** [M] **Payroll-blocked note has no button** — Add an 'Open exceptions' button that goes to TIM-04, and use TIM-04's blocking count for the number.
  _Seen:_ Under 'Open exceptions 3' it says 'September payroll is blocked until fixed' but gives no way to act. The 3 (or 7 for HR) is hard-coded and doesn't match TIM-04 (5 blocking HR / 4 manager) or Muster ('12 open exceptions').
- **T01.6** [M] **Spec codes and jargon shown to users** — Delete the 'widest scope' line. Remove '(M02 §B11)' and '(TIM-32)'. Rename the link to 'Open field map'.
  _Seen:_ 'Opens in your widest scope: team' / 'entity' under the header. On site now: 'For emergencies: employees checked in plus visitors on site (M02 §B11)'. Field tab: 'Open field-force map (TIM-32)'.
- **T01.7** [M] **Field map link is a borderless text button** — Make it a bordered secondary Button 'Open field map'.
  _Seen:_ Field tab card ends with an underlined blue link 'Open field-force map (TIM-32)' that acts as a button.
- **T01.8** [M] **Person details cut off at 1440** — Let the second line wrap to 2 lines, or drop the location when it's the person's normal site and show only the exception, for example 'Shift started 9:00 am'.
  _Seen:_ At 1440 the cards show 'In 9:21 am · Chennai offi...', 'Shift started ...', 'In 9:29 am · M...', 'WFH appro...', 'On duty · su...', 'Standby last ni...'. The text is cut on the widest screen.
- **T01.9** [M] **HR on-site numbers contradict the board** — Use one data set: either the HR board covers the whole entity (dozens rostered), or on-site shows the 3–4 Chennai people who are actually in.
  _Seen:_ HR board: 'Rostered 12, In 3' for 'all locations'. The On site now tab says 'Employees in 41' at the Chennai office alone.
- **T01.10** [L] **Manager scope filtered by department, not reports** — Filter by reportsTo === ME.name, and label the header 'Your reports (8)'.
  _Seen:_ Manager board filters TEAM by dept === 'Quality', so the list depends on department, not on who reports to Divya. The Quality head is Divya Menon.

## T02 · Muster

- **T02.1** [H] **Cells show 'P0' (stray zero)** — Use `(d.lateMin || d.otMin) ? <mark/> : null` (or `!!`) so 0 never renders. Cells then read 'P'.
  _Seen:_ Divya's row reads 'P0 P0 L P0 P0 WO P0 …' at every width. `(d.lateMin || d.otMin) && …` renders the number 0 when otMin is 0.
- **T02.2** [H] **Lock dialog contradicts open exceptions** — Disable 'Lock period' while any blocking exception is open, with the reason beside it: '12 exceptions still open, resolve them first' plus an 'Open exceptions' button. Compute the dialog text from real counts.
  _Seen:_ Frozen page shows a '12 open exceptions' badge. The Lock dialog says '3 open exceptions resolved by HR' and still lets you lock after typing the name.
- **T02.3** [H] **Totals cut off; grid needs sideways scroll** — Pin Employee on the left and put the totals right after it (Payable, LOP, Late, OT) so they're always visible. Drop the Mode column into a small tag under the name. On phones, show one card per person with totals plus a 'View month' button.
  _Seen:_ At 1440 the grid ends at day 20. Days 21–30 and the Payable / LOP / Late / OT h totals (what payroll needs) are off-screen. At 390 the phone shows only days 1–3, with no card view.
- **T02.4** [H] **Bulk dialog runs with nobody selected** — List the selected names in the dialog, add a date field (default: the clicked column), and disable 'Mark present' until at least one person is selected and the reason is filled in.
  _Seen:_ Story 'Bulk mark present with reason': no row is checked, but the dialog says 'Mark 3 people present on 25 Sep' (falls back to `selected.length || 3`). The date 25 Sep has no picker. 'Mark present' is enabled.
- **T02.5** [H] **Locked September cell says 'August 2026 is locked'** — Pass the month to DayCardBody: '{Month} is locked; changes land in {next month} payroll'.
  _Seen:_ In the Locked stage, opening a cell passes locked=true to DayCardBody, which always shows 'August 2026 is locked … October payroll'. That's the wrong month.
- **T02.6** [M] **HR day card talks to the employee** — For HR/manager viewers, write 'Divya hasn't recorded a check-out. Resolve it with a reason or remind her.'
  _Seen:_ Cell → day card (HR viewing Divya, 10 Sep): alert says 'Regularise it with your actual out time.'
- **T02.7** [M] **Exception counts disagree across screens** — Drive the muster badge and cell codes from the EXCEPTIONS list so every screen shows the same number and the same days.
  _Seen:_ Muster '12 open exceptions' (counts MP + A cells). TIM-04 shows 5 blocking (7 rows). Today board says 3 (manager) / 7 (HR). Priya's 28 Sep missing check-out and Gopal's 25 Sep no attendance are TIM-04 rows but don't match the grid codes.
- **T02.8** [L] **Names wrap under the checkbox** — Keep checkbox and name on one line (no-wrap name, wider first column), with the code or mode as a muted second line.
  _Seen:_ Divya Raghunathan, Meera Krishnan, Rahul Deshpande, Vikram Natarajan and Kavitha Sundaram wrap below their checkbox, so rows have uneven heights; the shorter names sit inline.
- **T02.9** [L] **Jargon in header and footnote** — Header: 'Missing check-outs stop payroll approval · cut-off 30 Sep'. Remove 'day engine'. Replace the footnote with a small legend for 'late' and 'OT'.
  _Seen:_ 'Missing punches: block payroll approval (Punch mode)' and footer 'Row totals come from the day engine; Assumed-present rows never raise exceptions.'
- **T02.10** [L] **Plant workers get office weekly offs** — Generate Hosur Operations rows from their 4-on/2-off roster, and make 29 Sep a WO for Rekha.
  _Seen:_ Rekha Balan's Today board detail is 'Weekly off (4-on / 2-off)', but her muster row has the Chennai Sunday/Saturday WO pattern.

## T03 · Day card

- **T03.1** [H] **Manager views her own day as 'team member'** — Use a report for the manager and HR stories, for example Meera Krishnan on her late day, with her own punches.
  _Seen:_ Manager · late day: title 'Divya Raghunathan · 23 Sep 2026', subtitle 'Team member · you manage'. Divya is the signed-in manager. Same for HR · overtime day.
- **T03.2** [H] **'Late mark 4 of 3 free' contradicts the month** — Count late days up to and including this date: 'Late mark 2 of 3 free this month'.
  _Seen:_ Manager · late day: 'Late mark 4 of 3 free this month.' Divya has only 2 late days in September (3 and 23), and My attendance says '2 of 3 free used'. The code hard-codes '4' when lateness is over 30 min.
- **T03.3** [H] **Worked hours don't match the punches** — Compute Worked from the punches minus the break rule. Show the break note only when a break was actually deducted.
  _Seen:_ OT day: 9:35 am–7:35 pm with a 30 min break gives 9 h 30 m, but the card shows 'Worked 8 h 50 m'. On duty: 8:55–5:55 shows '9 h 00 m' under '30 min break deducted above 5 h'. Late day: 10:05–6:32 shows 8 h 20 m.
- **T03.4** [M] **On-duty day map shows Chennai office fence** — Draw the fence of the punch site (Hosur plant). For field or on-duty days with no fence, show 'No geofence · on-duty day'.
  _Seen:_ 21 Sep 'On duty · Hosur plant audit': map draws 'Chennai office · 200 m' with both Hosur punches inside it. The fence is hard-coded in DayCardBody.
- **T03.5** [M] **'Nudge to fix' on a late day** — Remove L from needsFix. On late days show only the late-mark note; the employee can use 'Regularise' if the time was wrong.
  _Seen:_ Manager · late day shows a primary 'Nudge to fix' button, but a late arrival with both punches has nothing to fix. The employee view gets 'Fix this day' for late days too, because needsFix includes 'L'.
- **T03.6** [M] **'Fix this day' does nothing** — Wire it to open the regularise sheet for that date with 'Missed check-out' chosen and an out-time field.
  _Seen:_ Employee · missing check-out shows a primary 'Fix this day'. onFix isn't passed in DayCardScreen, DayCardPhone or the calendar, so clicking does nothing.
- **T03.7** [M] **Pending regularisation has no next step** — Add 'View request' and 'Withdraw' buttons. Route it to Divya's actual approver, consistent with the People data.
  _Seen:_ Employee 22 Sep shows only a badge 'Regularisation pending with Karthik Subramanian'. There's no way to view or withdraw the request. Karthik is the Engineering head, not Divya's Quality approver.
- **T03.8** [M] **Overtime pending with no HR action** — For HR and managers, add 'Review overtime' (blue, R7) that opens OT review. Take the pending/approved status from the OT data instead of hard-coding it.
  _Seen:_ HR · overtime day: 'Overtime 1 h 00 m · pending approval', but HR gets no button. The calendar totals call OT 'approved only'.
- **T03.9** [L] **Phone sheet says 'Missing check-out' three times** — Drop the sheet description (or the code row) and keep the alert. Remove the repeated 'On duty' from the note.
  _Seen:_ Phone story: sheet description 'Missing check-out', code row 'MP Missing check-out', then red alert titled 'Missing check-out'. On duty phone: 'On duty' then 'On duty · On duty · Hosur plant audit'.
- **T03.10** [L] **Missing check-out shows 'Worked 0 m'** — Show 'Worked: not known · no check-out' and hide the break note.
  _Seen:_ 10 Sep: checked in 9:31 am, 'Worked 0 m' with '30 min break deducted above 5 h' beneath.

## T04 · Attendance exceptions

- **T04.1** [H] **Manager queue lists the manager's own exceptions** — Scope to reportsTo === ME.name and exclude ME. Divya's own exceptions belong on My attendance.
  _Seen:_ Manager · team shows two 'Divya Raghunathan KF-0001' rows (10 Sep, 22 Sep) with Nudge buttons, so the signed-in manager nudges herself. Scope is a hard-coded list of names. The phone story shows the same Divya row.
- **T04.2** [H] **Resolve works with an empty required reason** — Disable 'Resolve exception' until a reason is entered (hint beside it). Preselect nothing, or 'Present with approval' when there is a check-in.
  _Seen:_ Resolve dialog: 'Reason (audited) Required' is empty, yet 'Resolve exception' is enabled. Absent (LOP) is preselected for Priya, who checked in at 9:29 am.
- **T04.3** [M] **Payroll column hidden; key text cut** — Merge Exception + Detail into one two-line cell. Make Mode and Nudges optional. Fold 'Blocks payroll' into the Status cell as a red badge so it never hides.
  _Seen:_ At 1440 the table hides 1 column (the Payroll Blocks/Warning badge). The text is cut: 'Missing check-...', 'In 9:29 am (ki...', 'Refused check...', 'Divya Raghun', 'Kavitha Sunda'. Meanwhile Mode and Nudges take wide space. At 871, 4 columns are hidden.
- **T04.4** [M] **Pending request offers Resolve/Nudge, not Review** — For Request pending rows show a blue 'Review request' button that opens the request. Leave these rows out of 'Remind all'.
  _Seen:_ Row 'Divya Raghunathan 22 Sep · Request pending' shows 'Resolve' (HR) or 'Nudge' (manager), and 'Remind all' nudges it too. The employee already asked; the next step is to review the request.
- **T04.5** [M] **Leave balance in resolve dialog is someone else's** — Show the row person's balance, or omit the number if it's unknown.
  _Seen:_ Resolving Priya Shankar: 'Deduct leave · Casual leave first; balance 4.5'. 4.5 is Divya's casual balance from BALANCES.
- **T04.6** [L] **Spec code in the resolution text** — Remove '(YX-AT-23)'.
  _Seen:_ For refused check-ins the option reads 'no late mark for a location failure (YX-AT-23)'.
- **T04.7** [M] **Bulk 'Resolve N' resolves only the first row** — Open a bulk dialog titled 'Resolve 3 exceptions' that lists the names, with one shared resolution and reason.
  _Seen:_ bulkActions 'Resolve {n} with reason' opens the dialog for ids[0] only, and the title names one person.
- **T04.8** [L] **22 Sep labelled 'Missing check-out' but has one** — Call it 'Check-out outside geofence' (or 'Early check-out').
  _Seen:_ Row x5 says 'Missing check-out · Out 2:02 pm outside geofence'. The day card for 22 Sep shows an Out punch at 2:02 pm.
- **T04.9** [L] **Phone list is hard-coded and nudges do nothing** — Use the same scoped list as desktop, compute the count, and switch Nudge to a 'Nudged' badge after tapping.
  _Seen:_ Phone story: '4 open' alert is hard-coded, rows are EXCEPTIONS.slice(0,4) (not team-scoped), and the Nudge buttons have no handler or 'Nudged' state.
- **T04.10** [L] **Page highlights 'Requests' in the nav** — Add an 'Exceptions' item under Time (with the blocking count) and mark it active.
  _Seen:_ Left nav marks 'Requests 7' active while on Attendance exceptions. There is no Exceptions entry, so people can't find the queue.

## T05 · Roster

- **T05.1** [H] **Swap dialog suggests a swap that breaks rest and leave rules** — Run the same rest, leave and night-consent checks the grid uses on the chosen pair. Show the result under the selects, e.g. 'Rekha would get 8 h rest (needs 11 h)', and disable Swap shifts with that reason. Default to a pair that passes.
  _Seen:_ Swap shifts dialog preselects 'Jaya Prakash · Thu 8 Oct · Morning' with 'Rekha Balan · Thu 8 Oct · Evening'. Jaya is on approved EL that day, and Rekha works Evening Wed 7 (ends 10 pm), so a Thu 6 am Morning leaves her 8 h rest (rule 11 h). The dialog shows no check and 'Swap shifts' is enabled.
- **T05.2** [H] **Roster publishes with open conflicts and is shown as published** — Block publishing while any rest or leave conflict is open: 'Fix 2 conflicts to publish'. Each warning gets a 'Go to cell' button. Published stories should use a clean roster.
  _Seen:_ Publish only shows a warning ('2 warnings are still open') and then publishes. The Published and Employee stories still show Senthil 'Rest gap' (0 h rest) and Jaya rostered Morning on her EL day.
- **T05.3** [H] **'Published 1 Oct' is a future date** — Use 'Published 28 Sep' or 'Published today'.
  _Seen:_ Published and Employee stories show the badge 'Published 1 Oct', but today is 29 Sep 2026.
- **T05.4** [H] **Employee view shows coworkers' leave types and conflict flags** — For employees, show their own row first, then colleagues' shifts only. Show 'Off' instead of the leave type and hide conflict badges. Add an 'Ask to swap a shift' button that opens TIM-08.
  _Seen:_ Employee · read-only shows every person's row, including 'Leave EL' and 'Leave CL' for colleagues and the manager-only 'Rest gap' and 'On leave' conflict badges. It has no swap action.
- **T05.5** [H] **Night shift for Jaya Prakash not checked against night-work consent** — Add a night-consent check to the grid rules for every N cell inside the 7 pm – 6 am window. Either show Jaya's valid consent in the guards card or flag the cell 'No night consent'.
  _Seen:_ Jaya Prakash is rostered N 10 pm on Sun 11. The Law and licence guards card lists consent only for Kavitha, and no warning is raised for Jaya.
- **T05.6** [M] **Weekly hours count a leave day as worked** — Skip days with approved leave when totalling the Hours column, or show '32 h + 1 leave day'.
  _Seen:_ Jaya Prakash shows 40 h, but Thu 8 is approved EL. Only 4 shifts are actually worked, which is 32 h.
- **T05.7** [M] **Hours column is cut off at 871** — Narrow the day columns, for example by dropping the 'am/pm' time in the cell under 1024 px and keeping only the shift code. Hours then fits. Alternatively, pin Hours next to Person.
  _Seen:_ At 871 the last column header reads 'Ho' and the values read '4', '3'. The column is clipped with no sideways scroll cue.
- **T05.8** [M] **Warnings alert has no buttons to fix the problems** — Add a 'Go to cell' button per line that selects that cell, plus 'Mark Jaya on leave' to clear the Thu shift.
  _Seen:_ '2 warnings to check before you publish' lists Senthil and Jaya as plain text with no action.
- **T05.9** [M] **Developer code shown in user text** — Drop '(TIM-08)'. Say 'a swap they ask for needs the colleague's consent.'
  _Seen:_ The swap dialog says '…a swap they ask for does (TIM-08).'
- **T05.10** [L] **Auto-roster button does nothing; leave cell looks like a link** — Link Auto-roster to TIM-34. Render leave as a neutral bordered 'Leave · CL' cell that matches the shift cells.
  _Seen:_ The header 'Auto-roster' button has no handler or link. Lalitha's Tue cell shows a blue borderless 'Leave CL', unlike the bordered shift cells.

## T06 · Shift editor and patterns

- **T06.1** [H] **Pattern cycle cannot be edited** — Make each day a small shift Select (M/E/N/G/OFF) and add '+ Day' / remove buttons, so the length follows the number of days.
  _Seen:_ Patterns tab: 'Cycle (6 days)' shows read-only badges 'Day 1: M' … 'Day 6: OFF'. Nothing lets you change a day or the cycle length.
- **T06.2** [H] **Patterns tab keeps the General shift header and Save button** — Move Patterns to its own page, or change the header to the pattern name with 'Save pattern' and its own count of people.
  _Seen:_ On Patterns the header still says 'General shift · used by 146 people' with 'Save shift'. The form edits '4 on / 2 off · Morning', which is assigned to 18 people.
- **T06.3** [M] **Pattern preview contradicts the Line 2 roster** — Align the data. Either assign this pattern to a different group, or make the Next 14 days match the TIM-05 week.
  _Seen:_ The pattern assigned to 'Hosur plant · Line 2' shows 5 and 6 Oct Off, then Morning 7–10 Oct. The TIM-05 Line 2 roster for the same week has people working Mon 5 and Tue 6 on mixed M/E/N shifts.
- **T06.4** [M] **Pattern list rows have no way to open them** — Add a bordered 'Edit' button per row, and put 'Add pattern' in the card header. The form appears only when one is picked.
  _Seen:_ The Patterns card lists 3 patterns as plain rows with no Edit or Open. 'Add pattern' sits above the list, below a form that already looks like an edit form.
- **T06.5** [M] **Preview bar shows no worked time** — Pass both in and out punches (and the break) so the bar shows worked time and overtime past 6:30 pm.
  _Seen:_ The Preview ShiftBar shows only the dashed shift block. The 'Worked' green bar is missing even though the punches are 9:52 am and 7:20 pm. The code passes only the 'in' punch.
- **T06.6** [M] **Jargon in helper notes** — Use 'Days marked OFF are weekly offs.' and 'Under 4 h worked counts as absent. A missing punch shows as "Missing check-out".'
  _Seen:_ 'Weekly offs are rules, not stored rows.' and 'A missing punch is always "missing check-out", never a threshold status.'
- **T06.7** [M] **Save error does not match the form** — Put the error on a field that is actually wrong, e.g. half day 8 > full day 7.5. Highlight that field and add a 'Go to field' link.
  _Seen:_ 'Fix 1 thing to save: Check-in window must open before the shift starts.' The check-in field says 60 min before start, which is valid, and no field is highlighted.
- **T06.8** [L] **Type change on a shift used by 146 people changes its identity** — Lock Type on an existing shift that is in use. Offer 'Duplicate as new type' instead, or warn: 'Changes 146 people's shifts from <effective date>'.
  _Seen:_ Switching Type to Night retitles the page to 'Night shift' with code N and 10 pm – 6 am while still editing the General shift used by 146 people. Flexi keeps the name 'General' but changes to 8 am – 8 pm.

## T07 · Attendance request

- **T07.1** [H] **OT pre-approval is dated in the past** — When the type is OT pre-approval, default the date to a future day (for example 1 Oct) and block past dates. Show 'Pick today or a later date' if a past date is chosen.
  _Seen:_ OT pre-approval story: Date 22 Sep 2026 (today is 29 Sep). Effect says 'No OT approved → OT up to 2 h pre-approved'. You cannot pre-approve OT for a day that is already over.
- **T07.2** [H] **Wrong manager for Divya** — Route to Divya Menon in the subtitle, the Sent alert and the timeline.
  _Seen:_ Drawer subtitle 'Goes to Karthik Subramanian (your manager)' and Sent timeline 'Manager approval · Karthik Subramanian'. Divya Raghunathan is in Quality, and the Quality head is Divya Menon. Karthik heads Engineering.
- **T07.3** [M] **OT effect ignores 'Take as' choice** — Build the effect from the inputs: 'Paid at 2×' for paid overtime, or '0.5 day comp-off credit' for comp-off. Take the rate from the day type.
  _Seen:_ OT story: the effect badge is fixed text 'paid at 2× (normal day)'. It stays the same when 'Take as' is set to Comp-off credit, and it does not check whether the date is a weekly off or holiday.
- **T07.4** [M] **Over-limit request still says it goes only to the manager** — Change the subtitle to 'Goes to Divya Menon, then HR'. Add an HR step to the Sent timeline. Merge the two lines into one: 'Limit reached (4 of 4): HR approves too.'
  _Seen:_ Over-limit story: the effect shows 'Approval: Manager → HR', but the subtitle still says 'Goes to Karthik Subramanian (your manager)' and the Sent timeline has no HR step. The effect also says the same thing twice: '0 of 4 regularisations left' and 'You have used 4 of 4… so HR approves too'.
- **T07.5** [M] **Late request does not name the payroll month** — Name the month: 'August is locked. The fix is paid in September payroll.' State whether late requests count towards the monthly limit.
  _Seen:_ Locked date story: 21 Aug. The note says 'the effect lands in next month's payroll', and the line '3 of 4 regularisations left this month' counts it against September's limit. The reader can't tell which month is meant.
- **T07.6** [M] **Request type radios wrap into an odd second row** — Use a Segment with the 4 options (Regularise · WFH · On duty · OT). On phones, use a dropdown.
  _Seen:_ At 1440 and 871, 'OT pre-approval' drops to a second line with a large gap and looks like a separate field. R11 says pick-one choices use the joined Segment control.
- **T07.7** [L] **Neutral 'before' states shown in red** — Make the 'before' badge neutral. Keep red only for 'Absent (LOP)'.
  _Seen:_ The effect line uses red danger badges for 'Expected in office' and 'No OT approved'. These are information, not risk.
- **T07.8** [L] **Check-in stays editable when only check-out is missing** — For a missed check-out, show the recorded check-in as read-only ('Recorded 9:34 am') and edit only the missing time.
  _Seen:_ With 'Missed check-out' selected, the Check-in field shows 9:34 am and can still be edited, so the employee can change a punch that the device recorded.
- **T07.9** [L] **Jargon in the date helper** — Write 'You can fix any day in September. For older days, send a late request.'
  _Seen:_ 'Look-back: the open payroll period (September).'

## T08 · Shift change or swap

- **T08.1** [H] **Requester is shown swapping with herself** — Set the subtitle and requester to Rekha Balan. Remove Rekha ('Rekha Balan · Weekly off') from her own 'Swap with' list.
  _Seen:_ The drawer subtitle reads 'Kavitha Sundaram · Line Operator', but 'Swap with' is 'Kavitha Sundaram · Night…' and the Effect says 'Kavitha: Sat 3 Oct Night → Morning'. The consent card says Rekha asked.
- **T08.2** [H] **Default swap gives a Night shift to someone with no night consent, and Send is enabled** — Run the night-consent check on load. The default story should either pick a valid colleague (same shift type) or show the block and a disabled Send.
  _Seen:_ The Swap request story moves Rekha to Night 10 pm – 6 am and 'Send request' is enabled. TIM-05 and the Night-blocked story both say Rekha has no night-work consent and that there is no override.
- **T08.3** [H] **Rest hours contradict each other** — Compute rest from one source. Fri N to Sat M = 0 h, so it is blocked, and the consent card must not show this swap as fine.
  _Seen:_ The rest-blocked alert says Kavitha 'would have only 8 h rest after her Friday night shift'. A Fri night ending 6 am followed by Sat Morning at 6 am is 0 h. The consent card tells Kavitha 'Your rest before the new shift: 16 h'.
- **T08.4** [M] **Agree to swap button is blue** — Use variant="approve" (green) for 'Agree to swap'.
  _Seen:_ Consent card footer: 'Agree to swap' uses variant primary (blue).
- **T08.5** [M] **Swap list says 'free that day' but lists busy people** — Change the helper to 'Colleagues with the same skill at Hosur plant who can take your shift without breaking rest or consent rules', and filter the list to match.
  _Seen:_ Helper: 'Only colleagues … who are free that day'. The options are Kavitha (working Night) and Rekha (the requester).
- **T08.6** [M] **Desktop page behind the drawer is empty and in manager nav** — Render the employee's week (as in MyShiftsPhone) behind the drawer, under My time › My shifts. Each shift gets an 'Ask to swap' button.
  _Seen:_ The 'My shifts' page shows only a title and is marked active under the manager 'Roster' nav item. The employee has no list of shifts to pick from.
- **T08.7** [L] **Effect box lacks a decision date** — Add 'Needs approval before Fri 2 Oct' with an amber 'in 3 days' badge.
  _Seen:_ The Effect section lists the approval chain 'Kavitha's consent → Supervisor (Senthil Murugan)' but not when it must be decided for a shift on Sat 3 Oct, 4 days away.

## T09 · OT review

- **T09.1** [H] **Bulk Approve bypasses the statutory cap** — Allow selection only on Pending rows that are within the cap. Show '2 over cap need HR' next to the bulk buttons, or skip those rows and say so.
  _Seen:_ bulkActions calls setStatus(ids,'Approved') for any selected rows. A manager can tick Rekha (13 h this week) and Anil (77 h this quarter), which show 'Sent to HR' per row, and approve them in bulk. Already approved or comp-off rows can also be selected and changed.
- **T09.2** [H] **The cap column is hidden, so 'Sent to HR' has no reason** — Make Cap a required column. Merge Shift + Out into one two-line cell ('Morning, ended 2 pm · out 4:20 pm') and mark Pre-approved optional. Put the cap reason under the 'Sent to HR' badge: 'Over weekly cap (13 h)'.
  _Seen:_ At 1440, 'Columns (3 hidden)' hides Statutory cap, Rate and Pre-approved. Rekha and Anil show only 'Sent to HR' with no visible cause. At 871, 6 columns are hidden, including Date.
- **T09.3** [H] **Manager sees another team's OT** — Filter manager rows to people whose manager is ME.name, or use a plant supervisor persona for this story.
  _Seen:_ The signed-in user is Divya Raghunathan (Quality, KF-0001), but the manager story lists Hosur plant line operators Kavitha Sundaram and Rekha Balan and maintenance staff (Anil Kumar).
- **T09.4** [H] **Phone view is a clipped table** — Use cards on phones: name, date, OT hours, cap badge, then Approve (green) and Comp-off.
  _Seen:_ At 390, names are cut to 'Kavith', 'Rekh', 'Arun'. OT, date and status are hidden, and only Approve/Comp-off show.
- **T09.5** [M] **Override can be approved with an empty reason, and the button is blue** — Use variant='approve' (green). Disable it until a reason is typed and show 'Enter a reason' beside it.
  _Seen:_ Override dialog: Reason is required and empty, yet 'Approve with override' is enabled and blue.
- **T09.6** [M] **Total mixes formats and statuses** — Show the total as '17 h 15 m', or better, 'Pending 14 h 30 m' for the rows still to decide.
  _Seen:_ Footer total '17.25' is in decimal hours while rows show '2 h 15 m'. It also adds Approved and Comp-off rows to Pending ones.
- **T09.7** [M] **HR has no reject or comp-off option on over-cap rows** — Add 'Comp-off' and 'Reject' next to 'Override cap' for HR.
  _Seen:_ HR story: Rekha and Anil show only 'Override cap'. HR cannot reject or convert the hours to comp-off.
- **T09.8** [L] **'Rate' column shows day types, not rates** — Rename the column to 'Day', or show 'Normal · 2×'.
  _Seen:_ The Rate column values are 'Weekly off', 'Normal' and 'Holiday'.
- **T09.9** [L] **Header description is dense rules text** — Shorten to 'Legal limit: 12 h a week, 75 h a quarter.' Move the rounding rules to a help tooltip.
  _Seen:_ 'After the fact by default · minimum 30 min, rounded down to 15 min · Factories Act caps: 12 h a week, 75 h a quarter' wraps to 4 lines on phone.

## T10 · Device backfill correction

- **T10.1** [H] **Review story shows Step 1; there is no review step** — Pass review={{ title:'Review', note:'412 punches for 38 people are applied as one audited correction' }} so the summaries show before Apply.
  _Seen:_ The 'Review' story (current='review') renders 'Batch · In progress'. The wizard never passes the Stepper `review` prop, so the step summaries ('38 people · 131 days · 6 LOP reversals') are never shown before 'Apply backfill' changes 412 punches.
- **T10.2** [H] **'September is frozen' contradicts Periods** — Use one period state. Either show September as Inputs frozen on TIM-11, or here say 'September is open: effects land in September payroll'.
  _Seen:_ Preview alert: 'September is frozen. Effects land in October payroll'. On TIM-11 Periods, September is 'Open · Freezes 30 Sep'. The intro also says the punches are for dates 'already frozen or locked'.
- **T10.3** [M] **Only 3 of 131 changed days can be seen** — Add 'See all 131 changes' (a table or a download) under the sample list.
  _Seen:_ The preview lists Kavitha, Rekha and Anil, with no way to see the other 128 days or the 38 people.
- **T10.4** [M] **Jargon and dev-talk** — Use the title 'Late punches from a device'. Drop the code. Write 'Days rechecked' and '6 absences become present (pay restored)'.
  _Seen:_ 'Why this exists' title, '(YX-LOCK-09)', 'Days re-evaluated', 'LOP reversal / late marks'.
- **T10.5** [L] **Applied page has no next step** — Add 'View affected days' and 'Back to Periods' buttons.
  _Seen:_ Done state shows only a success alert, 'ref BKF-0917', with no button.
- **T10.6** [L] **Phone buttons misaligned** — Make Back full width too, or put both in one row. Stack name and change on two lines on phone.
  _Seen:_ At 390, Continue is full width and Back sits below it, small and right-aligned. 'Kavitha Sundaram · 15 / Sep' wraps mid-date.

## T11 · Periods

- **T11.1** [H] **Lock story locks October under a September title** — Build the dialog title and confirm text from the opened period. Disable lock for a month that hasn't ended: 'October can be locked after 30 Oct'.
  _Seen:_ Lock story: the drawer says 'October 2026 · pre-lock checklist' and 'Freeze and lock' is enabled on 29 Sep, before October has started. The dialog title is fixed text 'Lock September 2026' with confirm text 'KAVERI TN SEP 2026'.
- **T11.2** [H] **Checklist counts are the same for every month** — Put the checklist counts on each Period. Locked and filed months show a read-only summary ('Locked 30 Aug by Suresh Pillai · all items done').
  _Seen:_ '2 pending' leave, '4 pending' OT and '1 missing' timesheet show for September and October, and also under 'View' on locked August and filed July.
- **T11.3** [M] **'View' on locked months opens a 'pre-lock checklist'** — Title it 'August 2026 · lock summary' and show who locked it, when, and the payroll and bank file status.
  _Seen:_ August/July View opens a drawer titled 'August 2026 · pre-lock checklist'.
- **T11.4** [M] **Freeze and lock is disabled without a reason** — Add '7 attendance exceptions must be resolved first' next to the button.
  _Seen:_ September checklist: 'Freeze and lock' is greyed out with no text beside it.
- **T11.5** [M] **Blocking items have no button to fix them** — Add 'Resolve exceptions', 'Open leave requests' and 'Review OT' buttons on each row.
  _Seen:_ '7 open · blocks', '2 pending', '4 pending' and the card badge '7 open exceptions' are plain badges.
- **T11.6** [M] **Request reopen offered where it is always refused** — Disable the button on the card with the reason ('Bank file released: correct in next payroll'), or hide it on filed months.
  _Seen:_ August (bank file released) and July (filed) both show 'Request reopen'. Clicking either only opens a refusal dialog.
- **T11.7** [M] **Freeze date tomorrow has no urgency badge** — Add an amber 'tomorrow' badge next to the freeze date.
  _Seen:_ September 'Freezes 30 Sep' (tomorrow), with 7 exceptions open.
- **T11.8** [M] **August not filed though its return date has passed** — Mark August Filed 15 Sep, or show an overdue red badge 'Return due 15 Sep · 14 days ago'.
  _Seen:_ August is Locked, bank file released, but not Filed on 29 Sep. July was filed 15 Aug, so August's return was due 15 Sep.
- **T11.9** [L] **Payroll Admin view is identical to HR** — For HR, show 'Send for payroll approval'. For Payroll Admin, show 'Approve lock'.
  _Seen:_ The persona only changes the text 'Payroll Admin view'. The lock consequence says the lock needs payroll approval, but HR locks directly.
- **T11.10** [L] **Jargon in header** — Use 'Each month is frozen on the 30th, then locked after payroll, then filed.' Write 'PF and ESI returns filed'.
  _Seen:_ 'open → inputs frozen → locked → filed · cut-off day 30', '(ECR, ESI)'.

## T12 · Mobile check-in sheet

- **T12.1** [H] **Wrong next action when the phone is not approved** — For block.code 'device', replace 'Ask HR to regularise' with 'Ask HR to approve this phone'. It should create the device approval request that shows on TIM-14 Device approvals.
  _Seen:_ Device not bound: the alert says 'Use your approved phone, or ask HR to approve this one', but the only button is 'Ask HR to regularise'. Nothing lets the user request approval for this phone.
- **T12.2** [H] **Offline queue shows a check-in that hasn't happened yet** — Before the tap, show only 'No connection. Your check-in will be saved on this phone' and keep the queue empty. After the tap, show the queued row and swap the button to a disabled 'Saved on phone, waiting to sync'.
  _Seen:_ Offline story: the 'Offline queue' card already lists 'Check-in 9:29 am · Chennai office · Pending sync', and the alert says 'Your check-in is saved on this phone', yet the main button still reads 'Check in (saved on phone)' and has not been tapped.
- **T12.3** [H] **WFH and on-duty buttons are hidden under the footer** — Move the two options into the footer under the disabled Check in, as 'Check in as WFH' and 'Check in on duty', or let the sheet body scroll fully above the footer.
  _Seen:_ Outside story at 390: the 'Check in as WFH' and 'Check in on duty' buttons are cut off behind the sticky sheet footer. Only their top borders show under the warning alert.
- **T12.4** [M] **'Ask HR to regularise' offered where it doesn't fit** — Show the HR button only for 'outside'. For 'coarse', make 'Retry location' the full-width primary action. Reword to 'Ask HR to fix today's attendance'.
  _Seen:_ Accuracy too coarse: the fix is to move outdoors and retry, but the footer still offers 'Ask HR to regularise'. The same happens in the device story. 'Regularise' is also HR jargon to a line employee.
- **T12.5** [M] **Same 'outside, 943 m away' fact said three times** — Keep the alert only, titled 'You're 943 m from Chennai office', with the body 'Check in as WFH or on duty, or ask HR. This attempt is logged.' Drop the separate verdict row in this state.
  _Seen:_ Outside story: the row says 'Outside Chennai office, 943 m away', the alert title repeats it word for word, and the alert body says 'You're outside Chennai office' again.
- **T12.6** [M] **Check out allowed at 9:42 am with no warning** — Under the button, show 'Shift ends 6:30 pm. Checking out now marks an early exit.' and ask for confirmation, or require a reason before an early check out.
  _Seen:_ Checked in story: it is 9:42 am, the shift ends 6:30 pm, and the primary 'Check out' button is enabled with no note that this is 8 h 48 m early.
- **T12.7** [M] **Internal and technical words on the sheet** — Use 'Selfie check-in isn't on for your company yet', 'Location checked when you're back online' and 'Inside the office area'. Use 'check in' everywhere instead of 'clock-in'.
  _Seen:_ Selfie: 'Selfie check-in arrives in wave 6'. Offline: 'Verdict after sync'. Checked in: 'Inside geofence'. 'Clock-in opens at 8:30 am' is used next to 'Check in'.
- **T12.8** [L] **Map caption crowded, with a stray pin icon** — In GeoMap, put the icon and caption on one left-aligned line, 'Accuracy ±18 m'. Drop the words 'Map preview'.
  _Seen:_ Every story: the map footer shows a lone pin icon in the middle and 'Map preview · accuracy 18 m' squeezed onto two lines at the right, at 390 and also at 1440.
- **T12.9** [L] **Field staff told they are 'outside' the office** — In field mode, show 'Location recorded: 3.6 km from Chennai office', or the area name, without the word 'Outside'.
  _Seen:_ Field story: the verdict reads 'Outside Chennai office, 3.6 km away' next to the 'Field staff · location recorded' badge. That reads as a problem when it is allowed.
- **T12.10** [L] **Sheet spans the whole screen on desktop and tablet** — Cap the BottomSheet at the frame or phone width (about 480 px), or show it as a centred dialog at 768 px and wider.
  _Seen:_ Inside @1440 and @871: the phone frame is centred, but the bottom sheet stretches the full window width. The map floats in a huge empty card and 'Check in' is a 1,400 px wide button.

## T13 · Kiosk

- **T13.1** [H] **Net pay shown on a shared gate kiosk** — Remove the payslip amount from the kiosk. If needed, show 'Aug payslip ready · sent by SMS' with no amount.
  _Seen:_ Menu: 'Last payslip · Aug · ₹18,420 net' appears in large type on the Gate 1 kiosk, where the next person in the queue can read it.
- **T13.2** [H] **Supervisor's leave falls on a public holiday** — Move the sample leave to a working day, for example Mon 5 Oct. Also block leave requests on holidays.
  _Seen:_ Menu banner and My requests: 'Casual leave 2 Oct was approved on 25 Sep'. 2 Oct 2026 is Gandhi Jayanti, a holiday in the Holiday calendars data (HOL_2026).
- **T13.3** [H] **Next and Continue work with nothing entered** — Disable Next until 4 digits are entered and Continue until the PIN has 4 digits. Show '3 more digits' under the field.
  _Seen:_ Employee code: the code shows 'KF-0___' and Next is enabled. Wrong PIN: no dots are filled and Continue is enabled. You can go to the menu with no PIN.
- **T13.4** [M] **Apply leave and Training are dead ends** — Add a bordered 'Back' button next to the primary button on both views, the same as on My requests.
  _Seen:_ Training and Apply leave views have no Back or Cancel button. The only exit is the auto sign-out. My requests does have Back.
- **T13.5** [M] **Training can be marked hours before it starts** — Disable it with the reason 'Opens at 8:45 am'. List only sessions that are open now, or show an empty state.
  _Seen:_ It is 5:54 am. The session is 'Food safety refresher · 9:00 am', and 'Mark me present' is enabled 3 hours early.
- **T13.6** [M] **Leave dates can't actually be picked** — Use a large-touch date picker (from/to day tiles) suited to a kiosk, then show the day count and the balance after.
  _Seen:_ Apply leave: 'Dates' is a dropdown with a single option, 'Thu 8 Oct – Fri 9 Oct (2 days)'.
- **T13.7** [M] **Typed employee code is built wrongly** — Show 'KF-' plus 4 slots and fill them with the actual digits pressed.
  _Seen:_ The code display is 'KF-0' + the typed digits, so 4 key presses make 'KF-01111' (5 digits). Codes are KF-xxxx, for example Kavitha is KF-0177.
- **T13.8** [M] **Kavitha's numbers disagree with other Time screens** — Align the data: check-in 5:54 am via kiosk KF-HSR-K1 in time-data, and one casual leave balance shared by both screens.
  _Seen:_ The kiosk says she checked in at 5:54 am and has 4.5 days casual leave. Today's data has her in at 06:02 by biometric, and the Leave reports balance shows casual leave 3.
- **T13.9** [L] **Menu button text overflows on narrow screens** — Stack the menu grid to one column below 480 px, or shorten the label to 'Training'.
  _Seen:_ Menu @390: 'Mark training attendance' runs past the edges of its button.
- **T13.10** [L] **Long status badge** — Badge 'Pending', with 'With Senthil Murugan' as muted text under the row.
  _Seen:_ My requests: the badge reads 'Waiting for Senthil Murugan'.

## T14 · Devices and kiosks

- **T14.1** [H] **Empty state still warns about an offline kiosk** — Derive the alert from the kiosk rows: show it only when a row is Offline, and never when the list is empty.
  _Seen:_ Empty story: 'No kiosks registered' sits under a red alert, 'KF-HSR-K2 · Canteen has been offline for 3 h'.
- **T14.2** [H] **Phone view hides everything needed to decide** — Render cards on phones: kiosk name, location, heartbeat and status. For bind requests: name, old → new phone, reason, and the buttons. Make the tabs scrollable or use a dropdown.
  _Seen:_ @390: the kiosk table shows only 'KF-HSR-K1 ·…' plus Status, and the bind requests show 'Meera Krisl…' with Approve and Reject but no device or reason. Both tables scroll sideways (24 px and 6 px), and the tab strip cuts off 'Employee…'.
- **T14.3** [H] **Lost phone and new-phone approval are not linked** — On Approve for a 'lost' request, sign out the old phone in the same step: 'Approve and sign out Redmi Note 11'. Otherwise disable Approve with 'Sign out the lost phone first'.
  _Seen:_ Device approvals: Meera's 'Redmi Note 11 (lost)' → Galaxy M34 can be approved directly, while on Employee phones the lost Redmi is still 'Bound' and not signed out. The sign-out dialog says she 'signs in again on her new phone', which isn't approved yet.
- **T14.4** [M] **Kiosk names and locations cut even at 1440** — Make the kiosk column two lines (code above, place below), let Reason wrap, and mark Mode and Punches today optional instead of Last heartbeat. Better, merge heartbeat into Status: 'Offline · 3 h ago'.
  _Seen:_ @1440: 'KF-HSR-K1 · Gat…', 'KF-HSR-K2 · Can…' and 'Bengaluru head of…'. Bind requests: 'Old phone lost on 26…', 'Kavitha Sundaram…'. @871, 'Last heartbeat' is hidden, though it is the key fact behind Offline and Stale.
- **T14.5** [M] **Offline alert has no action, and Stale is ignored** — Add 'Notify site admin' to the alert. Add a tooltip or legend line: 'Stale = no heartbeat for 15+ min'.
  _Seen:_ The alert says 'Check power and Wi-Fi at the canteen' but has no button. The Bengaluru kiosk is 'Stale' (22 min) with no explanation anywhere.
- **T14.6** [M] **Jargon throughout** — Use 'Reset kiosk key', 'New phone requests', 'Last seen' and 'Meera is signed out on that phone at once'.
  _Seen:_ 'Rotate secret' on every row, 'Device-bind requests', 'Last heartbeat', and 'All sessions and push tokens on that phone stop' in the sign-out dialog.
- **T14.7** [M] **System Admin view is identical to HR** — Add an Entity column, or group by entity, for System Admin, and include a kiosk for Kaveri Foods Pvt Ltd (Tamil Nadu).
  _Seen:_ System Admin story: the subtitle says 'System Admin · all entities', but the table has no entity column and the same 4 Kaveri Foods Pvt Ltd kiosks. The Tamil Nadu entity is not shown.
- **T14.8** [L] **Wrong signed-in avatar on an HR screen** — Pass the persona to TimePage so HR stories show Lakshmi Venkatesan (LV).
  _Seen:_ Top bar shows 'DR' (Divya Raghunathan, the manager persona) on an HR-only registry whose subtitle says 'HR · Kaveri Foods'.
- **T14.9** [L] **Punch count on a visitor kiosk** — Show '—' for visitor kiosks, or rename the column 'Uses today'.
  _Seen:_ KF-MAA-K1 · Reception has Mode 'Visitor' but shows 14 under 'Punches today'.

## T15 · Timesheets

- **T15.1** [H] **Gandhi Jayanti is on the wrong day** — Move the holiday to index 4 (Fri 2 Oct) and make Thu 1 Oct a workday. Clear the Fri hours and move them to Thu.
  _Seen:_ Grid header: 'Thu 01 Oct · Gandhi Jayanti'. Gandhi Jayanti is 2 Oct, which is Friday in this week. Fri 02 Oct shows '8 h' expected, and 8 h is booked on it.
- **T15.2** [H] **Hours entered for days that haven't happened yet** — Fill only Mon and Tue, and lock future days with a 'from 30 Sep' hint. Disable Submit week until the last workday, with the reason beside it ('Opens Fri 2 Oct'). Move the Submitted/Approved/Locked stories to the previous week (21–27 Sep).
  _Seen:_ Today is 29 Sep. Draft already has 6/1/1 h on Wed 30 Sep and 5/2/1 h on Fri 2 Oct. Submit week is enabled, and the 'Approved' story approves a week that ends 4 Oct.
- **T15.3** [H] **Grid is cut off at tablet width** — Below about 1100 px, switch to the day-list layout (already built for phone), or narrow the Project/Task columns and stack Project over Task in one cell.
  _Seen:_ At 871 the Thu–Sun columns and Total run past the card edge ('Thu 01 / Ga Ja' is clipped). The scanner misses it because it isn't a DataTable.
- **T15.4** [M] **Wrong approver for a Quality employee** — Make the internal approver Divya Menon (Quality head). Name the client approver, e.g. 'S. Balaji, Sundaram Retail Foods', or drop it from the header and show it on the SRF-24 row.
  _Seen:_ Header: 'approver: Karthik Subramanian (internal)'. Divya Raghunathan works in Quality, and Karthik is the Engineering head. The client approver is a vague 'Sundaram Retail Foods contact'.
- **T15.5** [M] **Sent-back week still says 'Submit week'** — Label the button 'Resubmit week'. Highlight the Tue SRF-24 cell the manager queried. Hide 'Copy last week', because it would overwrite the corrected hours.
  _Seen:_ Sent back story: the banner asks to split Tue audit hours, but the buttons are the same as a fresh draft ('Copy last week', 'Submit week'). Tue SRF-24 cell isn't highlighted.
- **T15.6** [M] **Edit actions show on approved/locked weeks** — Hide Pre-fill when the week isn't draft or sent back, or disable it with 'Week is approved'.
  _Seen:_ Approved story still shows the 'Pre-fill from my tools' header button.
- **T15.7** [M] **No way to move between weeks** — Add previous/next week arrow buttons beside the week label, plus a 'Last week: Sent back' link when an older week needs action.
  _Seen:_ Header shows only '28 Sep 2026 – 04 Oct 2026', with no previous/next control on desktop or phone. A sent-back or late week can't be reached.
- **T15.8** [L] **Phone puts Submit before the hours** — Move Submit week to the end of the day list. Show the project code plus a short name ('SRF-24 · Supplier audit'). Show 'Not billable' as plain text instead of a disabled checkbox.
  _Seen:_ At 390, 'Submit week' (full-width primary) sits at the top, above three project editors. The project select is cut to 'SRF-24 · Supplier audit programr'. Greyed-out disabled 'Billable' checkboxes look broken.

## T16 · Attendance reports

- **T16.1** [H] **Filters and the report picker change nothing: 'Muster roll' shows the late/early chart, and filters never touch the rows** — Filter LATE by the chosen department and location before passing it to the chart and the table. Give 'muster' its own view, such as a per-person day grid that links to the Muster screen, or remove it from the Select.
  _Seen:_ ops.tsx 224-290: the `filters` state only drives `filtered` and the clear action. `rows` is always LATE, and the BarChart always uses all of LATE. Picking 'Muster roll' (value 'muster') is not statutory and not 'ot', so it shows the 'Late marks and early exits' chart and the same table.
- **T16.2** [H] **Entity is Kaveri Foods (Tamil Nadu) but rows include Sales, Finance and Engineering, and the location filter leaves out Bengaluru** — Make the header entity match the switcher. Either show the Bengaluru entity's departments with a Bengaluru head office location option, or limit the Tamil Nadu rows to Chennai and Hosur departments (Operations, Quality, Sales).
  _Seen:_ Header reads 'September 2026 · Kaveri Foods Pvt Ltd (Tamil Nadu)'. The top bar entity switcher says 'Kaveri Foods Pvt Ltd'. The table lists Finance (head Meera Iyer) and Engineering, which belong to the Bengaluru head office entity. The Location filter offers only 'Chennai office' and 'Hosur plant'.
- **T16.3** [H] **Form 25 says September is 'frozen with the period lock' when the month has not ended** — Show 'September so far (1–29 Sep) · locks after 30 Sep' with a neutral 'Period open' badge, or default to August 2026, which is locked. Add a month picker so the user can pick a period.
  _Seen:_ Form 25 card: '48 workers · generated from the published roster and punches · frozen with the period lock'. Today is 29 Sep 2026, so September is still open. The header also says 'September 2026' with no 'so far' note.
- **T16.4** [M] **Statutory registers show 1–2 rows but claim 48 workers or 6 women, with no way to see the rest** — Show the register as a DataTable with every worker (name, code, days present, OT h; or shifts, hours, consent ref, transport). Work out the counts from the rows so the summary always matches.
  _Seen:_ Form 25: '48 workers' then only 'Kavitha Sundaram · KF-0177'. Night register: '6 women · 38 night shifts' then 2 rows (12 + 8 = 20 shifts). The list has no table, no 'Show all 48', and no paging.
- **T16.5** [M] **Signed-in manager sees every department** — Give the screen a persona prop. For HR (Lakshmi Venkatesan), show the HR avatar. For the manager, filter to Divya's direct reports and title it 'My team · late and early'.
  _Seen:_ Avatar 'DR' is Divya Raghunathan, the manager persona. The report lists Operations, Sales, Finance and Engineering with company-wide totals (85 late marks).
- **T16.6** [M] **Phone: report table scrolls sideways and clips columns** — Mark OT hours and LOP days `optional: true` so they hide at narrow widths, or render cards per department on phone (Department title, then 'Late 14 · Early 3 · OT 12.5 h · LOP 1'). At 390, use a horizontal bar chart or shorter category labels.
  _Seen:_ At 390 the table shows 'Department | Late marks | Early ex…'. OT hours and LOP days are off-screen and the totals row is cut ('2…'). The chart labels are also cut ('Operati…', 'Enginee…').
- **T16.7** [M] **Empty state still shows a full chart, and its advice has no matching control** — When rows are empty, pass empty series or categories so the chart shows its empty text too. Add a month picker. Give the empty state a button such as 'Show August 2026' or 'Clear filters'.
  _Seen:_ The Empty story shows 'Nothing for these filters / Try another location or month.' in the table, while the chart above still draws all the bars. The emptyText goes through but the chart keeps its categories. The page has no month control and no 'Clear filters' button (no filters are set).
- **T16.8** [L] **Jargon and legal shorthand** — Use 'Format: OSH Code rules, 21 Nov 2025' with a tooltip, '96 h between 7 pm and 6 am', 'Unpaid days (LOP)', 'Overtime hours', and a legend for P/WO (Present / Weekly off). Use 'Night-work consent NWC-…'.
  _Seen:_ 'Format dated 21 Nov 2025 (OSH Code)', '96 h in the legal window', 'LOP days', 'OT hours', 'P P P P WO WO P …', 'Consent NWC-2026-014'.
- **T16.9** [L] **Two Export buttons on the same view** — Remove the header Export and keep the table's Export. On the statutory views, keep only Download PDF/Excel inside the card.
  _Seen:_ The header has 'Export' and the table toolbar has 'Export' too (1440 and 871). On the statutory views, the header 'Export' sits next to 'Download PDF' and 'Download Excel' in the card. Both table exports have no-op handlers (`onExport={() => {}}`).
- **T16.10** [L] **Statutory register cards are fixed to Hosur plant and ignore the Location filter** — Replace the filter bar on the statutory views with a single-choice Segment for the factory (only Hosur plant falls under the Factories Act), or put the location in the title from the filter value.
  _Seen:_ Card titles are hard-coded to '… · Hosur plant'. The Filter bar (Location: Chennai office) is still shown above and has no effect.

## T17 · Leave home

- **T17.1** [H] **Approve and Send back buttons do nothing** — Keep local state of decided ids: Approve removes the row and shows 'Approved · Meera Krishnan, 1–3 Oct'; Send back opens a small Dialog with a required reason TextArea, then removes the row. Wire Adjust balance to the TIM adjust-balance drawer/screen.
  _Seen:_ Manager and HR 'Waiting for you' rows: <Button size="sm">Send back</Button><Button variant="approve" size="sm">Approve</Button> (leave.tsx:105) have no onClick. Clicking does not remove the row, show a toast, or ask for a reason on Send back. 'Adjust balance' (line 66) also has no handler.
- **T17.2** [H] **HR view shows the manager's personal approval queue** — For persona 'hr', sign in as Lakshmi (LV avatar), replace 'Waiting for you' with a company-wide 'Pending with managers (n)' list that is read-only, with an 'Open requests' button and a 'Remind approver' button only for requests older than 2 days.
  _Seen:_ HR story: avatar is still 'DR' and 'Waiting for you (2)' lists Meera Krishnan and Arun Prakash (Divya's Quality reports) with Approve buttons. HR (Lakshmi Venkatesan) is not their approver. Code: the same `pending` list is used for persona !== 'emp' (line 60, 96-110).
- **T17.3** [H] **Earned leave balance doesn't add up** — Either set balance to 10, or show the carry-forward: credited 19 (15 this year + 4 carried from 2025) and text '5 of 19 used'. Also say whether 'balance' already subtracts the 2 pending days (e.g. '10 days · 8 after pending').
  _Seen:_ Earned leave card: '14 days' with '5 of 15 used this year' and '2 days pending approval'. 15 − 5 = 10, not 14 (casual 8 − 3.5 = 4.5 and sick 8 − 2 = 6 do add up). BALANCES in time-data.ts:184.
- **T17.4** [M] **Meera Krishnan reuses Meera Iyer's employee code** — Give Meera Krishnan a free code (e.g. KF-0119) in time-data.ts.
  _Seen:_ TEAM in time-data.ts:93 gives Meera Krishnan code KF-0118, Quality. RULES Data facts: KF-0118 is Meera Iyer, Lab Analyst, resigning with last day 19 Oct 2026.
- **T17.5** [M] **Employee pending request has no next action** — Add 'Waiting on Divya Menon (Quality head)' as the second line, a bordered 'Withdraw' sm button on Pending rows and 'Cancel' on future Approved rows, and a neutral 'in 13 days' badge next to the dates. Make each row open the request detail (TIM-19).
  _Seen:_ My requests: 'Earned leave · 12 Oct 2026 – 13 Oct 2026 · Pending' has only a badge. Can't withdraw it, see who it's waiting on, or open it. No relative date ('in 13 days').
- **T17.6** [M] **'Choose optional holidays' is a borderless text link acting as a button** — Use <Button size="sm">Choose optional holidays · 1 of 2 chosen</Button> that opens the optional-holiday picker.
  _Seen:_ Upcoming holidays card bottom: underlined blue 'Choose optional holidays (1 of 2 chosen)', rendered with <Link href="#"> (line 90) that goes nowhere.
- **T17.7** [M] **Phone employee view drops requests and holidays** — Below the balances add 'My requests' (same rows as desktop, stacked) and 'Upcoming holidays' (next 2 with relative badges). Move 'Apply leave' to the top under the title.
  _Seen:_ LeaveHomePhone persona 'emp' (lines 137-141) renders only balance cards and 'Apply leave'. The pending 12–13 Oct request and upcoming holidays from desktop are missing, so a phone user can't see their request status.
- **T17.8** [M] **Confusing approval details and grammar** — Pluralise: '1 other off then' / '3 others off then'. Replace the certificate text with 'Medical certificate not verified yet' (neutral) or 'Certificate verified'. Name who is off, e.g. 'Fathima Beevi also off 1 Oct'.
  _Seen:_ Manager row: '1 others off then · certificate attached · pending'. 'attached' and 'pending' contradict each other, and '1 others' is ungrammatical. The phone says '1 others off'.
- **T17.9** [L] **Nav highlights 'Leave calendar' on the Team leave page** — Add a 'Team leave' nav item, or make this page the calendar's summary. Add bordered 'Open leave calendar' and 'All requests' buttons in the card headers.
  _Seen:_ Manager and HR: sidebar 'Leave calendar' is active but the page is 'Team leave' / 'Leave · Kaveri Foods' with no calendar on it (TimePage active='Leave calendar', line 62). The manager also has no button to open the calendar or the full Requests list (7).
- **T17.10** [L] **Holiday list and 'Away this week' are hard-coded** — Filter HOLIDAYS by date >= TODAY and add 'in 3 days' (amber within a week). Build 'Away this week' from TEAM_ABSENCES overlapping 28 Sep–4 Oct and approved requests, with an empty state 'Everyone's in this week'.
  _Seen:_ HOLIDAYS.slice(1) (line 89) drops the first entry by position, not by date vs TODAY. 'Away this week' is a literal 'Sanjay Rao · 29–30 Sep' (line 112), not TEAM_ABSENCES. Holiday rows also have no relative badge (Gandhi Jayanti 02 Oct is in 3 days).

## T18 · Apply leave

- **T18.1** [H] **Send request still works when the form says it is blocked** — Move the leaveWarnings result up to ApplyLeaveSheet, or pass an onValidity callback up from the form, and render <Button variant="primary" disabled={w.errors.length>0}>Send request</Button> with a short reason next to it, such as 'Fix 2 things above'. Do the same for the drawer footer at leave.tsx:127.
  _Seen:_ Over balance shows a red 'Fix 2 things to send this' alert (not enough balance; more than 3 days), Sick leave shows 'Fix 1 thing' (no certificate) and Company block date shows 'Fix 1 thing'. In all three the blue 'Send request' button is fully enabled. leave.tsx:240 renders <Button variant="primary">Send request</Button> with no disabled prop, even though w.errors is computed inside ApplyLeaveForm.
- **T18.2** [H] **Sent message contradicts the summary: 3 days and 2 pending against 4 counted** — Build the Sent text from the counted total ("Earned leave 9–12 Oct (4 days, including 2 sandwich days). 4 days show as pending until it's decided.") and update the year-end projection at leave.tsx:348 to −4.
  _Seen:_ The default form (9–12 Oct, earned leave) shows 'Days counted 4, Sandwich days counted 2, Balance after 10'. The Sent story says 'Earned leave 9–12 Oct (3 days). Your balance shows 2 days pending'. leave.tsx:348 also says '− 2 pending (9–12 Oct)'. These are three different numbers for the same request.
- **T18.3** [M] **Approver note is hard-coded and ignores the dates chosen** — Work out the overlap from the team leave data for the selected range, for example '2 others in your team are off on 7 Oct'. Hide the clause when nobody overlaps.
  _Seen:_ Every story shows 'Approver: Karthik Subramanian · 2 others in your team are off on 12 Oct', including Over balance (5–9 Oct) and Sick leave (5–7 Oct), where 12 Oct is not in the range (leave.tsx:228).
- **T18.4** [M] **Approver is the Engineering head, but Divya is in Quality** — Read Divya Raghunathan's reporting manager from the data, or use Divya Menon (Quality head), and replace the literal names in leave.tsx.
  _Seen:_ The signed-in employee is Divya Raghunathan (Quality). The approver and the Sent title name Karthik Subramanian, who is the Engineering department head under Data facts (leave.tsx:228, 238, 266, 389).
- **T18.5** [L] **Sick-leave story keeps the reason 'Family function in Madurai'** — Make the default reason depend on the type: SL 'Fever, doctor advised rest'; EL/CL keep the family function; LWP its own reason.
  _Seen:_ In Sick leave · certificate required, the Reason field shows 'Family function in Madurai' (leave.tsx:206 uses one defaultValue for every leave type).
- **T18.6** [M] **Block-date error doesn't say which date is blocked or offer a fix** — Name the date and reason, for example '12 Oct is blocked (Hosur plant audit)'. Mark that row 'Blocked' in red in the day list and add a bordered 'Change dates' button that focuses the date picker.
  _Seen:_ Company block date alert: 'These dates include a company block date. Pick other dates.' It doesn't name the date or why it is blocked, and there is no action button. The day list on the right doesn't mark any day as blocked.
- **T18.7** [M] **Sent state has no next action** — Add bordered 'View request' (opens the request in My leave) and 'Withdraw' buttons below the success alert.
  _Seen:_ Sent shows only a green alert and a 'Close' button. There is no way to view the request, see its status, or withdraw it.
- **T18.8** [M] **Upload hint shows MIME types in capitals** — In FileUpload, map accept types to friendly labels ('PDF, JPG or PNG · up to 10 MB') and render 'Browse' as a bordered small button. This belongs in the shared FileUpload component.
  _Seen:_ Medical certificate drop zone: 'APPLICATION/PDF, IMAGE/JPEG, IMAGE/PNG · up to 10 MB'. The 'browse' link is also borderless underlined text acting as a button.
- **T18.9** [M] **On phone the summary is pushed below the form and hidden under the pinned footer** — On phone, show a compact summary line ("4 days · balance after 10") under the dates, or move the Summary above Reason. Let the sheet footer sit at the end of the content instead of overlaying it.
  _Seen:_ At 390 px the Summary card (days counted, balance after) starts after Delegate to. The pinned 'Send request / Cancel' footer covers it, so only 'Days counted 4' and a cut-off 'Holidays / weekly offs excluded' row are visible.
- **T18.10** [L] **Sandwich days lack a plain explanation, and the story name uses LWD** — Label the rows 'Weekend · counted (between leave days)' and add a one-line note: 'Weekends between leave days count as leave under your policy.' Rename the story 'During notice period · last day moves'.
  _Seen:_ The summary says 'Sandwich days counted 2' and the rows say 'Sandwich · counted' for 10–11 Oct (Sat/Sun) with no hint of what that means, while 'Holidays / weekly offs excluded' shows 0. The story name is 'During notice period · LWD moves'.

## T19 · Leave request detail

- **T19.1** [H] **Team overlap alert is hard-coded and wrong for every request** — Work out the overlap from TEAM_ABSENCES/LEAVE_REQUESTS for r.from–r.to, leaving out r.person. List those names with their dates and use the real count with correct plural ('1 other is off', '2 others are off'). If no one overlaps, show nothing or 'No one else is off then'.
  _Seen:_ leave.tsx:265 always prints 'Arun Prakash (EL 19–23 Oct) and Rahul Deshpande (EL 7–9 Oct) overlap partly.' On Meera Krishnan's 1–3 Oct request (Manager story) neither date range overlaps, and the title says '1 others off then' while it names 2 people. On Arun Prakash's own request (Approve story) it lists Arun as overlapping himself, and the title says '3 others' while it names 2.
- **T19.2** [H] **Manager approves requests that are waiting on someone else** — For reports' requests, set the approver to ME.name (Divya Raghunathan). For Divya's own leave, set it to her real manager in Quality (Divya Menon). If the signed-in user is not the current approver, disable the actions and show 'Waiting for <approver>' beside them.
  _Seen:_ Manager stories (signed-in manager Divya Raghunathan): the timeline says 'Manager approval · Karthik Subramanian · Waiting', but Divya still gets Send back / Reject / Approve. Karthik is the Engineering head, while Meera Krishnan and Arun Prakash are in Quality. Divya's own request (Pending story) is also routed to Karthik, although the Quality head is Divya Menon.
- **T19.3** [H] **Approve button is not a solid green and the confirm button is blue** — Have ConfirmDialog accept a confirmVariant and pass 'approve' at leave.tsx:277. Check that the Button 'approve' variant renders solid green with at least the same weight as 'danger', or this screen shows it wrong.
  _Seen:_ The drawer footer 'Approve' is a pale green outline that looks weaker than the solid red 'Reject' (1440 and phone). In the Approve story the confirm dialog's 'Approve' button is solid blue (ConfirmDialog default primary).
- **T19.4** [H] **Send back and Reject do nothing** — Add dialogs for both. Reject needs a required reason and states the result ('3 days return to Meera's balance'). Send back needs a note saying what to change (for example 'Attach the certificate').
  _Seen:_ leave.tsx:270: <Button>Send back</Button> and <Button variant="danger">Reject</Button> have no onClick. Only Approve opens a dialog.
- **T19.5** [M] **Meera Krishnan shares employee code KF-0118 with Meera Iyer** — Give Meera Krishnan a unique code that is not yet used (for example KF-0131) everywhere she appears in time-data.ts.
  _Seen:_ time-data.ts:93 gives Meera Krishnan code KF-0118. RULES Data facts says KF-0118 is Meera Iyer, Lab Analyst, who is resigning with last day 19 Oct 2026.
- **T19.6** [M] **'Ask to cancel' on leave that is already taken, with hard-coded consequences** — If r.to < TODAY, hide 'Ask to cancel' and offer 'Report an error' (attendance correction). Otherwise disable it with the reason 'Leave already taken'. Base the lock check on the payroll period that contains the leave, and use r.days in the text.
  _Seen:_ Cancel story: casual leave 16–17 Sep 2026 is in the past (today is 29 Sep). The dialog still says 'Your manager approves the cancellation. The 2 days return to your balance', and nothing mentions that the days were already taken. afterLock checks from < 1 Sep, so September's payroll-lock text never shows. The withdraw and cancel dialogs both hard-code '2 days'.
- **T19.7** [M] **Balance after is a fixed number, not the requester's** — Work out the balance after from the requester's balance for r.type minus r.days, using the same ledger source as TIM-21. For a manager, label it '<name>'s balance after'.
  _Seen:_ leave.tsx:262 sets Balance after to 12 for any earned leave and 4.5 for anything else. Arun Prakash's 4-day request and Divya's 2-day request both show 12, and Divya's casual leave shows 4.5, the same as Meera's sick leave.
- **T19.8** [L] **Fake midnight times in the timeline** — Give the applied timestamps real times in time-data.ts (for example 27 Sep 10:42 am), or show the date only when no time is stored.
  _Seen:_ 'Requested · Sun 27 Sep 2026, 12:00 am', 'Yesterday, 12:00 am', 'Fri 25 Sep 2026, 12:00 am': applied dates have no time, so every request looks like it was sent at midnight.
- **T19.9** [L] **Certificate badge doesn't say who must act** — Use 'Medical certificate attached · HR to verify' with neutral tone, and let the manager approve without waiting. Use 'Verified by HR' once verified.
  _Seen:_ 'Certificate attached · pending' is an amber badge. The manager can't tell whether HR still has to verify it or whether the manager should wait. The apply form says only HR sees the file.
- **T19.10** [L] **Phone manager view: stacked full-width Reject button outweighs Approve** — Put Approve (solid green) first or largest, and Reject and Send back as a bordered pair below it. This follows the same Button variant fix as above.
  _Seen:_ At 390px, Send back, Reject (solid red) and Approve (pale green) stack full-width. The destructive action is visually the main one and sits above Approve.

## T20 · Team leave calendar

- **T20.1** [H] **Month view shows every team to a manager** — Build Month events from the same filtered member list as People × days: ME.name's reports for a manager, everyone for HR.
  _Seen:_ In code, the Month tab builds events from all of TEAM_ABSENCES, while People × days filters to Quality. At width 1440 the manager's Month view lists every absence. This is safe today only because the sample data happens to be all Quality; any Sales or Operations leave would leak.
- **T20.2** [H] **Calendar hides most of its range behind a sideways scroll** — Show only as many days as fit (14 at 1440, 7 at 871) and add Prev/Next week buttons. Make the heading match the days shown.
  _Seen:_ The heading says '28 Sep – 25 Oct 2026', but at 1440 the columns stop at Fr 16 and at 871 they stop at Fr 9. Arun Prakash's EL 19–23 Oct is off-screen and nothing hints that you can scroll. The .yx-teamcal__scroll element scrolls sideways, and the table scan misses it because it only checks .yx-table__scroll.
- **T20.3** [H] **Phone calendar shows only 2 days** — On phones, swap the grid for a 'Who's away' list grouped by day (Today, Thu 1 Oct, …) with name, leave type and dates.
  _Seen:_ Phone at 390: the Person column takes half the width and only Mo 28 and Tu 29 are visible. Sanjay's second CL chip is cut off at the edge.
- **T20.4** [M] **'All teams' picker in the manager view** — Hide the team picker when only one team is in scope. Show it for HR only.
  _Seen:_ The manager story is described as 'Your team (Quality)', yet the dropdown above the grid says 'All teams' and offers only Quality.
- **T20.5** [M] **Leave marked on a holiday and a weekend** — Don't draw leave chips on holidays or weekly offs unless the sandwich rule applies. If it does, mark those days 'sandwich' so the count is clear.
  _Seen:_ Meera Krishnan's SL chips sit on Fri 2 Oct (Gandhi Jayanti, 'Hol') and Sat 3 Oct. Arun Prakash's EL in the Month view covers 20 Oct (Ayudha Puja). The days counted don't match the policy.
- **T20.6** [M] **HR scope text contradicts the people listed** — Add a location picker, or change the description to 'All teams · all locations'. Show each person's location under their name.
  _Seen:_ HR story at 871: the description reads 'All teams · Chennai office', but the list includes Sanjay Rao and Gopal Iyer, who are at the Hosur plant. It also shows 9 people from just 2 teams.
- **T20.7** [M] **Pending and approved leave look the same** — Show pending chips with a dashed border and a 'Pending' tooltip/label, and add a small legend under the grid.
  _Seen:_ The empty state promises 'Approved and pending leave shows here', but every chip uses the same style and nothing marks a request as pending.
- **T20.8** [L] **Month chips truncated and padded with 'Leave'** — Drop the 'Leave' prefix on this screen. Show 'Meera K. · SL', or show the type as a coloured code.
  _Seen:_ Month view at 1440: 'Leave Meera Krishna…' and 'Leave Rahul Deshpa…'. The word 'Leave' repeats on every chip and pushes the leave type (SL/EL) out of view.
- **T20.9** [L] **Jargon in the subtitle** — Use 'Your team · Quality · 8 people'.
  _Seen:_ 'Your team (Quality) · opens in your team scope'
- **T20.10** [L] **Empty state has no next step** — Change the text to 'No one is away 28 Sep – 25 Oct' and add a 'Next 4 weeks' button.
  _Seen:_ Empty story: 'No one is away in these two weeks' with no button, even though the page covers 4 weeks.

## T21 · Leave card

- **T21.1** [H] **Balance projection is hard-coded and its maths is wrong** — Work out the value from projDate: current EL + (number of 1st-of-month accruals between TODAY and projDate) × 1.25 − pending days that fall before projDate. Build the label from formatDate(projDate) and drop the rounding term. For 1 Dec this gives 15.75 (round the way the policy says, for example to 15.5, and show that in the note).
  _Seen:_ 'What will my balance be?' shows 'Earned leave on 1 Dec · 16.5' with note '14 now + 3 × 1.25 accrual − 2 pending (9–12 Oct) + 0.75 rounding'. 14 + 3.75 − 2 = 15.75, and the made-up '+0.75 rounding' pushes it to 16.5. The label, value and note are literals (leave.tsx line 348), so changing the date picker (projDate) changes nothing.
- **T21.2** [H] **Ledger does not add up to the balances it claims to explain** — Add the missing entries (1 Jan opening grants, the other CL/EL debits, the LWP day, the pending 9–12 Oct hold) so each card's figure is the sum of its rows. Change the EL card to '5 used of 21 (15 + 6 carried forward)'. Or remove the 'always the sum' sentence and title the card 'Recent entries' with a 'Show all' bordered button.
  _Seen:_ The note says 'The balance is always the sum of these entries; every screen shows the same figure.' The ledger has only 4 entries: −2 CL, +1.25 EL, +1 comp-off, +6 EL carry-forward. The cards show 3.5 CL used, 5 of 15 EL used with 14 left, 2 days EL pending, and 1 day leave without pay. None of the other debits, the opening grant or the LWP day are in the ledger. The Earned leave card also does not add up on its own terms: 15 − 5 = 10, not 14.
- **T21.3** [H] **HR view is the signed-in manager adjusting her own balance, with the wrong nav item highlighted** — For persona='hr', sign in as Lakshmi Venkatesan (LV avatar) and look at another employee's card (for example KF-0118 Meera Iyer, Lab Analyst). Highlight a People or Requests entry, or add a 'Leave cards' nav item. Change the projection title to 'What will {firstName}'s balance be?'.
  _Seen:_ The HR story shows the 'DR' avatar (Divya Raghunathan, the manager persona) at top right, with title 'Leave card · Divya Raghunathan' and an 'Adjust balance' button, so Divya is editing her own leave. The sidebar highlights 'Leave calendar' (line 356) although this is a person's leave card. The projection card still asks 'What will my balance be?'.
- **T21.4** [H] **Adjust balance dialog: 'Balance after' never changes and 'Post adjustment' does nothing** — Hold leave type, direction, days and reason in state. Show 'Balance after' = balance ± days for the selected type. Disable 'Post adjustment' with the reason beside it while Reason is empty or Days is 0. On submit, close the dialog and add the entry to the top of the ledger. List all leave types with their balances.
  _Seen:_ 'Balance after: 16 days' is a literal (line 365): switching Direction to Deduct or editing Days leaves it at 16. NumberField and Select have onChange={() => {}}, so the fields cannot be edited. 'Post adjustment' has no onClick: the dialog stays open and no ledger entry appears. The leave type list only offers Earned leave.
- **T21.5** [M] **Floating help button covers ledger text on tablet and phone** — Move help into the header '?' icon, which already exists, and remove the floating bubble. If the bubble stays, add bottom padding equal to its height so it never covers content.
  _Seen:_ At 871 the round help button in the bottom-right covers the last ledger time ('12:0…'). On the 390 phone it sits over the '12:0…' time of the Accrual job row.
- **T21.6** [M] **Employee leave card has no next action** — Add an 'Apply leave' primary button to the header for persona='emp'. Make '2 days pending approval' a bordered 'View request' button (opens TIM-19). Add a bordered 'Use comp-off' button on the Comp-off card that opens Apply leave with comp-off selected.
  _Seen:_ 'My leave card' has no header action. The Comp-off card shows '1 day expires 14 Oct' but nothing to use it with, and Earned leave shows '2 days pending approval' with no link to the request.
- **T21.7** [M] **Comp-off expiry badge is amber 15 days out and has no relative date** — Show 'Expires 14 Oct · in 15 days' in neutral tone. Switch to amber only when 7 days or fewer remain, and to red once it has expired. Use the shared relative-date badge helper.
  _Seen:_ The badge '1 day expires 14 Oct' is amber/warning. With today 29 Sep that is 15 days away, and it has no relative text.
- **T21.8** [M] **Phone ledger rows wrap to 3–4 lines and the time column crowds the text** — On narrow widths in the Timeline, move the time onto the date header line ('Thu 17 Sep 2026 · 11:05 am') so the action text gets the full width. Shorten the actions, for example '−2 Casual leave (16–17 Sep) · approved by Karthik Subramanian'. Put the projection card above the ledger on phone.
  _Seen:_ On 390 width, 'Karthik Subramanian approved −2 Casual leave (16–17 Sep)' wraps to 3 lines beside a fixed '11:05 am' column. The Accrual row is also cut under the help button. The projection card is not visible within 1200px.
- **T21.9** [L] **Jargon and system actors shown as people** — Write 'carried forward +6 Earned leave from 2025 (up to 30 days can carry over)'. Give system actors a neutral system icon and the actor name 'Automatic'. Rename the field label to 'Reason' and keep only the Required tag.
  _Seen:_ 'carried forward +6 Earned leave (cap 30)', where 'cap 30' is jargon. The system jobs 'Accrual job' and 'Year-end run 2025' get initial avatars 'AJ' and 'Y2' as if they were people. The dialog label 'Reason (required)' also shows a 'Required' tag, so required is said twice.
- **T21.10** [L] **Leave without pay card is missing its unit** — Show '1 day taken this year'. Use a bordered 'See dates' button, or list the date ('1 day · 4 Jun'), so the employee can check it against payroll.
  _Seen:_ The card reads '1 taken this year', while every other card says 'days'.

## T22 · Comp-off claim

- **T22.1** [H] **Sent state claims 1 day, but the form only allows a half day** — Change the Sent text to 'Half-day comp-off for Sat 26 Sep sent to <approver>. Once approved, use it by 26 Oct.' Better still, build the text from the same claim value the form uses.
  _Seen:_ In the Claim story, 'Half day (4 h+)' is selected, 'Full day' is disabled, and Effect reads '+0.5 day comp-off'. In the Sent story the success alert reads '1 day comp-off for 26 Sep'. Sat 26 Sep shows only 4 h 30 m worked, so 1 day is not possible.
- **T22.2** [H] **Send claim does nothing** — Keep the state locally (useState initialised from the state prop). Have Send claim switch it to 'sent'. Disable the button with a reason when Reason is empty.
  _Seen:_ Footer: <Button variant="primary">Send claim</Button> has no onClick. Clicking it leaves the drawer unchanged, and the 'sent' state can only be reached through a story arg.
- **T22.3** [M] **Approver is the Engineering head, not the signed-in employee's manager** — Use Divya Raghunathan's real reporting manager from the data (Divya Menon, Quality) in a single shared constant such as MY_APPROVER, and use that constant in every Time screen.
  _Seen:_ Effect reads '+0.5 day comp-off after Karthik Subramanian approves'. The employee is Divya Raghunathan (Quality). Per the data facts, Karthik Subramanian heads Engineering and Quality is headed by Divya Menon. The same approver also appears in attendance.tsx:256, leave.tsx:266/333 and ops.tsx:134.
- **T22.4** [M] **Full day is disabled with no reason beside it** — Add a description to the option, for example 'Full day (8 h or more) · you worked 4 h 30 m', or a helper line under Claim: 'Full day needs 8 h; you worked 4 h 30 m on 26 Sep.'
  _Seen:_ 'Full day (8 h+)' is shown greyed out and nothing explains why. The reason (only 4 h 30 m worked on 26 Sep) is two fields above.
- **T22.5** [M] **Empty state contradicts the claim list about auto-credited days** — Choose one approach. Either drop the disabled 14 Sep option from the picker (and show it as a plain note, 'Mon 14 Sep already credited +1 day'), or remove the 'aren't listed' sentence from the empty state.
  _Seen:_ The No eligible days text says 'Days already credited automatically aren't listed.' The Claim form does list 'Mon 14 Sep · Vinayaka Chaturthi — Already credited automatically' as a disabled radio.
- **T22.6** [M] **Empty and Sent states offer no next action** — Empty: add 'Open my attendance' (to check punches on holidays or offs) or 'Ask HR'. Sent: add 'View my requests' and show who it is with ('Waiting for <approver>').
  _Seen:_ No eligible days shows only an explanation and a Close button. Claim sent shows only Close, with no way to see the pending request or the comp-off balance.
- **T22.7** [L] **Expiry date has no relative badge, and the expiry text says it twice** — Show 'Use by 26 Oct' with a neutral 'in 27 days' badge (amber when within a week). Drop '(use within 30 days)'.
  _Seen:_ Effect reads 'expires 26 Oct (use within 30 days)' and Sent reads 'use it by 26 Oct', both as plain text. Today is 29 Sep, so 26 Oct is 27 days away, not 30. The '30 days' figure is counted from the worked day.
- **T22.8** [L] **Shorthand '4 h+' / '8 h+' and the bare 'Effect' heading** — Use 'Half day (4 h or more)' and 'Full day (8 h or more)'. Retitle the box 'What you'll get'.
  _Seen:_ The options read 'Half day (4 h+)' and 'Full day (8 h+)'. The summary box is titled 'Effect'.

## T23 · Optional holidays

- **T23.1** [H] **Prorated: quota already used, but you can still pick** — When the quota is used, show 'You've used your 1 optional holiday for 2026', disable the other boxes and replace Save with Close.
  _Seen:_ Prorated story: '1 of 1 chosen' because Onam is already taken. The other four boxes are still enabled and 'Save choices' is active, so you can pick a second holiday and only get an error afterwards.
- **T23.2** [M] **Lets you go over the limit, then tells you off** — Once the limit is reached, disable the unticked boxes with the note 'Limit reached · untick one to swap'. The red alert can then go.
  _Seen:_ Over-limit at 871: three boxes are ticked, '3 of 2 chosen', then a red alert says 'You can choose only 2'.
- **T23.3** [M] **Two holidays on the same day** — Group them into one row ('24 Nov · Karthigai Deepam or Guru Nanak Jayanti'), or warn 'Same day as Karthigai Deepam'.
  _Seen:_ Karthigai Deepam and Guru Nanak Jayanti are both '24 Nov 2026'. Picking both uses up the whole quota on one day off.
- **T23.4** [M] **No weekday, so weekend picks are a waste** — Show the weekday ('Sat 10 Oct'). Grey out days that fall on the person's weekly off and say 'Your weekly off'.
  _Seen:_ 'Mahalaya Amavasya · 10 Oct 2026' falls on a Saturday, a weekly off for office staff, but the list shows no weekday.
- **T23.5** [L] **No deadline or time left** — Add a relative badge to each date ('in 11 days', amber within a week). Add a line 'Choose by 30 Sep' if the policy has a cut-off.
  _Seen:_ Mahalaya is 11 days away, but there is no relative badge and no 'choose by' date.
- **T23.6** [L] **Count line is confusing** — Use '1 taken · 1 left to choose'.
  _Seen:_ 'Choose 2 of 5 …' plus '1 of 2 chosen', where the 1 is a holiday already taken.
- **T23.7** [L] **Save enabled with nothing changed** — Enable Save only after a change.
  _Seen:_ Choose story: nothing has been changed, but 'Save choices' is already active.

## T24 · Encashment request

- **T24.1** [H] **'Not open' message contradicts itself** — Use a real blocking reason ('Your earned leave balance is 8 days; you need more than 10 to encash'), or, if 4 days are allowed, show the form capped at 4.
  _Seen:_ The heading says 'Encashment isn't open for you', then the text says 'You have 14 days; the minimum left … is 10, so up to 4 days', which means it is open.
- **T24.2** [H] **Minimum balance differs between states** — Take one minimum-balance value from the policy and use it in both texts.
  _Seen:_ Request helper: 'at least 7 days must remain'. Not-open text: 'the minimum left after encashing is 10'.
- **T24.3** [M] **Pending leave ignored in balance after** — Use the available balance: 'Earned leave · 14 days (2 pending) → 12 available'. Base the maximum and 'Balance after' on 12.
  _Seen:_ The balance shows 14 days and 'Balance after 9 days', but TIM-21 shows 2 EL days pending for 9–12 Oct.
- **T24.4** [M] **'More' goes past the maximum** — Disable More at the effective maximum, min(7, balance − minimum). The error should name whichever limit is hit.
  _Seen:_ The More button has no upper limit. The over-max story shows 9 days, 'Balance after 5 days', which also breaks 'at least 7 must remain', yet the error only says 'At most 7 days'.
- **T24.5** [L] **Amount doesn't match the visible rate** — Show the line '5 × ₹1,846.15 = ₹9,231', or round the amount from the displayed rate.
  _Seen:_ The rate is shown as ₹1,846 a day, but 5 days shows ₹9,231 instead of ₹9,230.
- **T24.6** [L] **No tax estimate** — Add 'About ₹X after tax (at your current slab)', or a 'See tax impact' link to the pay screen.
  _Seen:_ The effect panel only says 'Paid in October payroll (taxable)', so the person can't see roughly what they will actually receive.
- **T24.7** [L] **Phone stepper wraps and looks crowded** — On phones, use icon-only − and + buttons on either side of the number. Split the rate onto two lines.
  _Seen:_ At 390, 'Less' and the number box sit on one line and 'More' drops to the next. The rate row runs to the edge.
- **T24.8** [L] **Dead end with only Cancel** — Label the button 'Close' and add 'View leave policy', or say when it will next be open.
  _Seen:_ The not-open story offers only a 'Cancel' button and no next step.

## T25 · Long-absence status card

- **T25.1** [H] **Maternity progress is wrong** — Work out the progress from TODAY, start and end. Show 'Day 58 of 182' instead of a bare percentage.
  _Seen:_ The card shows '57%' for 3 Aug 2026 – 31 Jan 2027. On 29 Sep that is 57 of 182 days, about 31%; 57 is the day count. LWP shows 20% where it should be 23% (14 of 61 days).
- **T25.2** [M] **Employee view shows someone else** — For the employee persona, make the card about the signed-in person, or make Anitha the signed-in user in this story.
  _Seen:_ The page is the employee persona's 'My leave' and the avatar is DR (Divya), but the drawer says 'Maternity leave · Anitha Rajan'.
- **T25.3** [M] **Buttons do nothing** — Wire up dialogs: a new return date plus reason for the employee, a new end date plus effect for Extend, and a return date plus effect on pay and accrual for early return. Make the drawer closable.
  _Seen:_ 'Tell HR my return date changed', 'Extend' and 'Record early return' have no handlers or dialogs. The drawer's close button does nothing (onOpenChange is a no-op).
- **T25.4** [M] **Jargon in pay and accrual rows** — Use 'Paid by ESI, not by Kaveri Foods. Claim it at your ESI branch.' and 'You keep earning leave while away.'
  _Seen:_ 'ESIC pays the benefit; no employer maternity pay (ESI-covered)' and 'Earned leave keeps accruing (law: counts as service)'
- **T25.5** [L] **Expected return shown twice** — Make the meter text 'Day 58 of 182' and keep the return date only in its own row, with a relative badge ('in 4 months').
  _Seen:_ The meter text ends with 'expected return 1 Feb 2027' and the next row is 'Expected return 1 Feb 2027'.
- **T25.6** [L] **HR view has no link to the person or the payroll effect** — Add '61 days LOP · Sep, Oct, Nov payroll' and buttons 'Open leave card' and 'Open profile'.
  _Seen:_ The HR LWP card says 'Loss of pay for all days' but gives no day count, no months affected and no link out.
- **T25.7** [L] **Filler attendance row** — Drop the row, or show it only to HR as 'Attendance alerts paused until 1 Feb 2027'.
  _Seen:_ 'No exceptions, nudges or late marks while away' appears on every kind of absence.

## T26 · Holiday calendars

- **T26.1** [H] **Phone hides the holiday name** — On phones show cards: "Pongal" as the title, "Thu 15 Jan 2026" below, with the type badge. Never hide the Holiday column.
  _Seen:_ Chennai story at 390: table shows only Date and Type ("Columns (2 hidden)"), so the rows say "15 Jan 2026 · Holiday" with no Pongal / Republic Day name.
- **T26.2** [H] **Template dialog names the wrong location** — Open the template dialog for the selected tab ("Start Chennai office from…"). Offer it only on tabs with no calendar, like the Hosur empty state.
  _Seen:_ Template story: the dialog says "Start Hosur plant from the Tamil Nadu template?" while the Chennai office tab is open behind it, and the header button is the same on every tab.
- **T26.3** [H] **Rules panel has no save and its fields do nothing** — Add "Save rules" at the end of the card (not sticky). Enable it only when something changed, and wire the fields to state.
  _Seen:_ "Optional holidays" number and "On transfer" select have onChange={() => {}}, and the Rules card has no Save button. Changing the weekly-off rule is never stored.
- **T26.4** [M] **Optional-holiday sentence is wrong and unclear** — Write "People choose [2] of the 2 optional holidays", using counts from the data.
  _Seen:_ Text beside the field reads "2" then "of 2 optional + 3 more". The table lists only 2 optional holidays, so "+ 3 more" matches nothing.
- **T26.5** [M] **Holidays not in date order** — Sort by date by default and keep optional holidays in place with their Optional badge.
  _Seen:_ 10 Oct 2026 Mahalaya Amavasya is listed after 08 Nov Deepavali, because the optional holidays are appended at the end.
- **T26.6** [M] **Feed note hides 2 pending changes** — Show one amber alert: "2 changes from the Tamil Nadu feed are waiting", with a "Review changes" button that opens TIM-42.
  _Seen:_ Note says "Feeds: Tamil Nadu public holidays (reviewed 2 Jan)". TIM-42 shows 2 changes waiting (Deepavali moves to 9 Nov, new 15 Oct election holiday), and this calendar still shows Deepavali on 8 Nov.
- **T26.7** [M] **Remove works on holidays that have passed** — Disable remove on past dates with the reason "Already in attendance records". Confirm the remove on future dates.
  _Seen:_ Every row, including 15 Jan Pongal and 14 Sep Vinayaka Chaturthi (before today, 29 Sep 2026), has a remove action with no confirmation.
- **T26.8** [M] **Bengaluru tab is one line of text** — Use the same table and rules layout as Chennai, with Karnataka holidays.
  _Seen:_ The Bengaluru head office tab shows only "Bengaluru head office · Karnataka template · 11 holidays.": no table and no rules.
- **T26.9** [L] **Jargon in subtitle and rule labels** — "People get the holidays of the office they work at, including people sent to another office". Change "Nothing extra (starter)" to "No extra day off (default)" and the transfer option to "Share optional holidays by months at each office".
  _Seen:_ "(host location for deputees)", "Nothing extra (starter)", "Prorate optional holidays".
- **T26.10** [L] **Header actions shown on an empty location** — On a location with no calendar, hide Clone and keep the single empty-state button.
  _Seen:_ No-calendar story (Hosur): "Clone to 2027" stays primary in the header with nothing to clone, and "Start from state template" appears twice (header and empty state).

## T27 · Leave type editor

- **T27.1** [H] **Locked maternity values can be edited and saved** — Make law fields read-only and show the values (26 weeks, paid). Allow only settings the company controls, such as colour, and disable Save until one changes.
  _Seen:_ Statutory story: the subtitle says "not editable" and the alert says "Law values are locked", yet Name, Code and Pay (with a Partially paid option) can be edited and "Save as version 5" is active.
- **T27.2** [H] **Live example is earned leave on every type** — Build the example from the type being edited. For maternity: "Delivery expected 10 Jan → leave 15 Nov–14 May, 26 weeks paid".
  _Seen:_ The maternity story still shows Priya's 9–12 Oct sandwich example, "Balance after 10" and "Accrual: 1.25 on the 1st of each month".
- **T27.3** [M] **People count disagrees with policies** — Calculate the count from the policies (248). Show per-policy accrual differences, or split plant EL into its own type.
  _Seen:_ Subtitle says "used in 3 policies (212 people)". TIM-28's three policies that include EL cover 112 + 88 + 48 = 248, and the plant policy gives EL "1 per 20 days", not monthly.
- **T27.4** [M] **Last tab label is cut off** — Let the tab list wrap or scroll with a fade and arrow, or shorten the label to "Notice".
  _Seen:_ At 1440 and 871 the last tab reads "Notice perioc", clipped at the form edge.
- **T27.5** [M] **Saving a new version has no effective date** — Disable it until something changes. On click, ask "Applies from" (default 1 Oct 2026) and show how many people it affects.
  _Seen:_ "Save as version 5" is primary and active with no changes made and no date, for a type used by 212 people.
- **T27.6** [L] **Balance before is missing in the example** — Show "Balance 14 → 10" in one line.
  _Seen:_ Live example shows "Days counted 4" and "Balance after 10", but never the starting 14.
- **T27.7** [L] **Jargon and mixed terms** — Pick one term ("unpaid leave") everywhere. Remove the true-up line (12 × 1.25 = 15 already). Name colours ("Teal") and drop "(starter)".
  _Seen:_ "Dec trues up to 15", "Colour: Series 3", "(starter)". The tabs mix "LOP" (Crediting, Notice) with "LWP" (Long absence).
- **T27.8** [L] **Rule fields lack meaning** — Rename them to "Apply at least 7 days ahead" and "Ask for a document when leave is longer than __ days (blank = never)".
  _Seen:_ Rules tab: "Notice (days)" clashes with the "Notice period" tab, and "Attachment after (days)" is empty with no hint.

## T28 · Leave policies

- **T28.1** [H] **Drawer shows the same rule and override for every policy** — Fill the rule fields and overrides from the opened policy. Show location/type fields for the plant policy and "No overrides" for Karnataka.
  _Seen:_ The drawer always shows Entity "Kaveri Foods Pvt Ltd (Tamil Nadu)", Grade "S1–S4" and override "Anitha Rajan · Plant workers → Staff TN". Plant workers (rule: Hosur plant + Worker) and Karnataka (0 overrides) would show the TN rule and Anitha.
- **T28.2** [M] **Override count does not match the list** — List both overrides, or correct the count to 1.
  _Seen:_ Staff · Tamil Nadu shows Overrides 2 in the table, but the drawer lists one person.
- **T28.3** [H] **Key columns cut with ellipsis at every width** — Wrap text to two lines in Leave types, Rule and Policy. Merge People + Overrides into one cell ("112 · 2 overrides").
  _Seen:_ At 1440: "CL 8 · SL 8 · EL 15 · CO…", "Entity KF (TN) and gra…", "Plant workers · Factori…". At 871 it gets worse ("CL 7 · SL 7 · EL 1 …").
- **T28.4** [M] **Phone shows only name and people** — Show cards on phones: the policy name, the leave types line, "Hosur plant · Workers" and "112 people · from 1 Jan 2026".
  _Seen:_ At 390: "Columns (4 hidden)". Leave types, rule and effective date are gone, and the name is cut to "Plant workers · Fac…".
- **T28.5** [M] **Empty state contradicts the alert** — With no policies, hide the 3-people alert and say "No one gets leave until you add a policy" in the empty state.
  _Seen:_ Empty story: "3 people match no policy" stays on screen while there are no policies at all, so everyone (248+) matches none.
- **T28.6** [M] **"First matching rule wins" but no order shown** — Add a "Priority" number column with Move up/down, or drop the claim.
  _Seen:_ Subtitle states the first match wins, but the table has no priority order and no way to reorder.
- **T28.7** [M] **Unknown location in alert, with no fix action** — Use a real location from the data, and add "Add a rule for this location" beside "Show them".
  _Seen:_ "New joiners at Krishnagiri depot get no leave…". Krishnagiri depot is not a known location (Bengaluru, Chennai, Hosur), and the only action is "Show them".
- **T28.8** [L] **Entitlements in codes, Edit buttons crowded** — Write "Casual leave · 8 days a year", "Comp-off", "Unpaid leave". Keep the bordered Edit buttons the same width.
  _Seen:_ Drawer lists "CL 8", "SL 8", "CO", "LWP" with an Edit button each.
- **T28.9** [L] **Save date is fixed and saves with no change** — Add an "Applies from" date field above the footer. Disable Save until something changes.
  _Seen:_ Drawer footer "Save from 1 Oct 2026" is primary and active with nothing changed, and the date cannot be picked.

## T29 · Year-end wizard

- **T29.1** [H] **Year-end 2026 can be posted in September** — Allow preview now but disable "Post year-end" with "Available from 1 Jan 2027 — balances are not final" (stepper finishBlocked).
  _Seen:_ Today is 29 Sep 2026 and the leave year runs to 31 Dec 2026. The wizard previews "Closing 34" balances and the typed-confirm "Post entries" can be used three months early.
- **T29.2** [H] **Review and confirm stories open on Scope** — Point those stories at the 'notify' step (or add a Review step) so the dialog opens after every step is done.
  _Seen:_ The "Year-end · review" story shows step 1 Scope "In progress". "Typed confirmation" opens the post dialog over Scope with Preview and Letters "Not started". No step has the id 'review'.
- **T29.3** [H] **Leave-year change preview shows year-end data** — Show per-person short-year columns: "Current balance", "Jan–Mar 2027 entitlement 4.5", "Opening 1 Apr 2027", for Karnataka staff only.
  _Seen:_ Transition preview (Karnataka, 88 people, short year) shows the year-end table: Divya Raghunathan 34 → carry 30, encash 4. That is not the short-year pro-rata, and Divya is a Quality person, not in the Karnataka entity.
- **T29.4** [M] **Pending-requests alert has no action and doesn't block** — Add "Open 12 pending requests" in the alert, and make the count match the Requests badge.
  _Seen:_ "12 leave requests are still pending — Decide them first…" has no button and Continue stays enabled. The Requests nav badge says 7, not 12.
- **T29.5** [M] **Phone preview table scrolls sideways** — Show cards on phones: the name and type, then one line "34 → 30 carried · 4 encashed · 0 lapse".
  _Seen:_ At 390 the table cuts after "Carry forward"; Encash and Lapse are off screen.
- **T29.6** [M] **Preview shows 4 of 248 with no way to find someone** — Use DataTable with search, "Showing 4 of 248", paging and an "Only people losing days" filter.
  _Seen:_ KPI says 248 people, but the table lists 4 rows with no count, search or paging.
- **T29.7** [M] **Encashment money visible without a pay check** — Show the rupee total only to users with pay access; others see "41 encashment drafts".
  _Seen:_ Preview KPI "41 · ₹12,84,600" and the confirm text show the amount. The signed-in avatar is DR (Divya Raghunathan, manager persona).
- **T29.8** [L] **Karnataka entity doesn't exist in the data** — Use a real entity, and add an Entity picker to the transition scope step.
  _Seen:_ Title "Leave-year change · Karnataka entity" and confirm text "KAVERI KA FY2027". The second entity is Kaveri Foods Pvt Ltd (Tamil Nadu).
- **T29.9** [L] **Preview table style differs from other tables** — Use the standard DataTable with right-aligned numbers.
  _Seen:_ Centred small cells, a grey border and bold names in the muster style, labelled "Table, scrolls sideways".

## T30 · Leave reports

- **T30.1** [H] **Ledger, Leave taken and LOP feed all show the same balances table** — Give each report its own columns and rows. Ledger: Date, Employee, Leave type, Change (+/-), Reason, Balance after. Leave taken: Employee, CL/SL/EL/Comp-off/LWP days taken in 2026. LOP feed: Employee, Sep LOP days, Dates, Source (absent/no balance), Sent to payroll (Yes/Pending). Keep the balances columns only for 'Balances matrix' and 'Negative balances'.
  _Seen:_ Picking Ledger, Leave taken or LOP feed to payroll in the report picker changes only the chart or alert at the top. The table underneath is the same 5-row balances matrix in every case (CL/SL/EL/Comp-off/LWP taken/EL liability, Divya 4.5/6/14...). Ledger shows no entries, dates or reasons. Leave taken shows balances, not days taken. LOP feed shows balances, not LOP days per person for September. In LeaveReportsScreen the columns `cols` and `rows = BAL` never depend on `r` (only 'negative' filters).
- **T30.2** [H] **Totals in the table contradict the headline numbers** — Either show all 248 people (paged), with a footer that matches the KPI, or label the table as a filtered sample, e.g. 'Showing 5 of 248 · total ₹48,12,600'. The LOP table should list the 18 people whose days add up to 41.
  _Seen:_ The LOP feed alert says '41 LOP days across 18 people' but the table below shows 5 rows totalling 4 LWP. On Finance · liability the KPIs say 'EL liability (all entities) ₹48,12,600' and 'People 248', but the table footer says 'Total · 5 rows ... ₹1,05,622'. On Leave taken the chart says EL 940 days taken while the table shows balances.
- **T30.3** [H] **Per-person rupee liability shown to the HR persona without a pay gate** — Show the EL liability column and the ₹ total only when the viewer has pay access (finance or payroll persona). For everyone else, remove the column or hide it behind a 'Show pay' button that records each reveal. Keep day counts visible.
  _Seen:_ The default HR story (header avatar DR) shows an 'EL liability' column with per-employee amounts: ₹25,846, ₹30,115, ₹41,538, ₹8,123. These amounts are worked out from each person's pay. The `persona` prop only changes the default report ('fin' goes to liability). The money column is always in `cols`, whatever the persona.
- **T30.4** [H] **Sideways scroll on phone; leave balances hidden but money kept on tablet and phone** — Mark EL liability and Comp-off as `optional: true`, not EL. Keep EL visible at every width. Below 768, render each employee as a card: name, then one line 'CL 4.5 · SL 6 · EL 14 · LWP 1'.
  _Seen:_ At 390 the table shows 'Columns (4 hidden)', names are cut ('Divya Raghu', 'Arun Prakas') and 'EL liabi...' / '₹25,84' are clipped off the right edge, so the table scrolls sideways. At 871, 'Columns (2 hidden)' hides EL and Comp-off. EL is the main balance and has the red -1.5 flag, but EL liability stays visible.
- **T30.5** [M] **Employee names cut at desktop width** — Give the Employee column a min width of about 220px, or let it wrap, and narrow the short number columns (CL, SL, EL, Comp-off).
  _Seen:_ At 1440 the names show as 'Divya Raghunatha' (cut), 'Meera Krishnan...' and 'Rahul Deshpande' (cut), while the number columns have about 150px of empty space each.
- **T30.6** [M] **Two Export buttons on every report** — Remove the header Export and keep the table toolbar Export (`onExport`). For liability, let that one export include the chart data.
  _Seen:_ There is an 'Export' button in the page header next to the report picker, and another 'Export' in the table toolbar just below it, in every story. The header one is `<Button icon={Download}>Export</Button>` with no onClick, so it does nothing.
- **T30.7** [M] **Negative balance and LOP alert have no next action** — Add a row button 'Open leave card' (bordered, same width as other row buttons) on the negative balances report. Add 'Open September payroll period' to the LOP alert. Change the negative empty state to 'No one is below zero. Check again after the next accrual run.'
  _Seen:_ On Negative balances, Meera Krishnan shows EL -1.5 in red and LWP 3, but the row offers no action (open leave card, adjust, recover in payroll). The empty state says only 'Try another report or filter.' The LOP alert says 'Sent to payroll after the period locks; late corrections go to October' but has no button to open the payroll period or to correct an entry.
- **T30.8** [M] **Abbreviations with no explanation, and LWP and LOP used for the same thing** — Use 'Casual', 'Sick', 'Earned' and 'Unpaid' as headers (or keep the short code with a tooltip), and pick one term for unpaid leave everywhere, e.g. 'Unpaid leave (LOP)' once, then 'Unpaid'.
  _Seen:_ The column headers are 'CL', 'SL', 'EL' and 'LWP taken'. The picker and alert say 'LOP feed to payroll' and '41 LOP days', and the chart says 'LWP'. These are two terms for unpaid leave on the same screen.
- **T30.9** [L] **Footer total leaves most columns blank and says '1 rows'** — Add `total: 'sum'` to cl, sl, el and co, or drop the footer. Fix the plural in the shared DataTable footer ('1 row').
  _Seen:_ The footer row reads 'Total · 5 rows' with only LWP (4) and EL liability summed. CL, SL, EL and Comp-off are blank. On Negative balances it reads 'Total · 1 rows'.
- **T30.10** [L] **Header line is filler** — Shorten it to 'Balances as of 29 Sep 2026'.
  _Seen:_ The subtitle reads 'As of 29 Sep 2026 · every figure is the ledger sum, the same as each employee's leave card'.

## T31 · Locations and geofence editor

- **T31.1** [H] **Save works with an invalid IP range** — Disable Save location while any field has an error, and show '1 error to fix' next to the button.
  _Seen:_ Invalid IP range story: the field is red with 'Line 2: 10.20.300.0/24 is not a valid range', yet 'Save location' is enabled.
- **T31.2** [H] **Header badge contradicts the chosen mode** — Drive the badge from the mode ('Field check-in' when Field). In Field mode, set the bind switch off by default or explain why it stays on.
  _Seen:_ Field mode story: the 'Field' radio is selected, but the header badge still says 'Restricted check-in'. 'Bind check-in to one device' stays on even though the helper says 'On for restricted staff'.
- **T31.3** [H] **Second point cannot be edited** — List each point as a row (name, lat/long, radius, Edit and Remove bordered buttons). The fields edit the selected row.
  _Seen:_ Multiple points: the map shows 'Annexe · 80 m', but the form has only one Latitude/Longitude/Radius set (Main block), plus a muted line '2 points: Main block, Annexe (80 m)'. There is no way to select, edit or remove the Annexe.
- **T31.4** [M] **IP field says 'per line' and 'Line 2' but is a single line** — Use a TextArea with one range per line, or keep commas and say 'Range 2'. Replace 'CIDR' with an example: 'e.g. 10.20.4.0/24'.
  _Seen:_ IP ranges is a one-line text field with '10.20.4.0/24, 10.20.5.0/24' separated by a comma. The helper says 'One CIDR range per line' and the error points to 'Line 2'.
- **T31.5** [M] **Field mode still asks for allowed points** — In Field mode, collapse those sections under a note: 'Points are used only to label check-ins as at office'.
  _Seen:_ Field mode: 'Allowed points' and 'Office network' stay fully editable and look required, though Field means 'Location recorded, not restricted'.
- **T31.6** [M] **No way back to the locations list** — Add a breadcrumb 'Locations › Chennai office', or a location dropdown in the header.
  _Seen:_ The page opens straight on 'Chennai office'. There is no breadcrumb or location switcher, though the nav item is 'Locations & geofences' and there are 3 sites.
- **T31.7** [L] **Real business park used as the address** — Use a fictional address, for example '4th floor, Kaveri Towers, Taramani, Chennai 600113'.
  _Seen:_ Header: 'Tidel Park, Taramani, Chennai 600113'. Tidel Park is a real, named IT park.
- **T31.8** [L] **Jargon in helpers** — Use 'On by default for restricted check-in' and drop the storage sentence. Use 'check-in' consistently.
  _Seen:_ 'On for restricted staff (starter)'; 'Points are stored as latitude / longitude'; 'Office network (web clock-in)'.
- **T31.9** [L] **Map caption crowded with stray icon** — Fix in GeoMap: one left-aligned line, 'Drag the handle or type the radius'.
  _Seen:_ At every width, the map footer has a lone pin icon in the centre and a two-line caption at the right. @390 it wraps to three lines: 'Map preview · drag the handle to change the radius, or type it'.

## T32 · Field-force map

- **T32.1** [H] **Manager view shows another department's team** — Either sign in as the Sales manager persona (Vikram Rao) for this story, or filter to ME's reports. Give the HR story a wider list (multiple managers, with a Manager column or filter).
  _Seen:_ Signed-in manager is Divya Raghunathan (Quality), but the page says 'Your sales team' and lists Sales officers (Vikram Natarajan KF-0171, Sales). The HR story shows the same 4 people.
- **T32.2** [H] **Drawer invents a trail for people with no tracking** — Build the drawer from the person's data. Not checked in: 'Not on duty yet' with no map. Consent withdrawn: visits list only, plus 'No trail: consent withdrawn at 1:00 pm'. Draw one pin per visit done.
  _Seen:_ Every person's drawer shows 'Duty In 9:12 am', a trail and 2 visit pins (hard-coded). Bharath is 'Not checked in, 0 of 4' and Pooja is 'Consent withdrawn · no trail', yet both would show a trail. Suganya shows '4 of 5' visits but only 2 pins.
- **T32.3** [H] **Tracking status never shown in the team list** — Add a short status badge per row: 'Not checked in' (amber after shift start), 'No trail' (neutral). Show '—' km when there is no trail.
  _Seen:_ FIELD.status ('Not checked in', 'Consent withdrawn · no trail') isn't rendered. Pooja shows '18.5 km' even though no trail exists to measure it.
- **T32.4** [M] **Integrity flag has no action** — Add 'Ask Suganya for a note' and 'Mark reviewed' buttons inside the alert, and show the note once it exists.
  _Seen:_ Flagged drawer: 'Mock location detected 11:12 am … the employee can add a note.' There's no button for the manager to do anything.
- **T32.5** [L] **Jargon in distance figure** — Say 'Estimated from visit points' and put the method in a help tip.
  _Seen:_ Drawer KPI note 'straight line × 1.2'.
- **T32.6** [M] **Map caption layout broken** — In GeoMap, put the icon and caption on one left-aligned line, and stretch the tile to the card width.
  _Seen:_ Under every map, the pin icon floats alone on the left and the caption 'Map preview · live positions during duty hours' wraps over 2–3 lines on the far right (1440 and 390). The map tile also leaves wide empty bands at 1440.
- **T32.7** [M] **Visit log covers only one person** — List all team visits with a person filter. Keep status (Done/Upcoming/Missed) in the badge and show 'Unplanned' as text in the detail line.
  _Seen:_ Visit log tab lists only Vikram's 3 visits, while the team has 9 done (Suganya 4, Pooja 3). The badge column mixes type and status ('Unplanned' in place of 'Done').
- **T32.8** [L] **Row text truncated and flag badge crowds the row** — Second line: '2 of 6 visits · 14.2 km', with the beat as the first part. Shorten the badge to 'Flag: mock location' and give the time in the drawer.
  _Seen:_ Vikram row: 'Chennai south · Tue beat · 2 of 6 visit…' is cut. Suganya's long badge 'Mock location detected 11:12 am' adds a third line.

## T33 · Visit check-in and beat plan

- **T33.1** [H] **Outside-site screen says 'check in' but the button checks out** — Split it into two steps. Before check-in, show the 'Check in here (outside site)' primary button. After check-in, show 'Checked in 12:04 pm' plus Outcome/Notes/Photo and 'Check out of visit'.
  _Seen:_ Visit outside story: the alert says 'You can still check in; the visit is marked outside site', but the only primary button is 'Check out of visit'. No check-in time is shown.
- **T33.2** [M] **Visit screen has no way back and wrong title** — Title the header with the store name ('Sri Murugan Traders') and add a back arrow to the beat plan.
  _Seen:_ Visit and photo views hide the bottom tabs, but the header still says 'Beat plan' and has no back or close button.
- **T33.3** [M] **Beat plan disagrees with the manager's map** — Use one data set for Vikram: the same visits, done count and km on both screens. Show a header like '2 of 6 visits · 14.2 km so far'.
  _Seen:_ TIM-32 shows Vikram with 6 planned visits, 2 done, including an unplanned Lakshmi Provisions. The phone beat shows 3 visits with 1 done, and conveyance shows 4 visits, 42 km (map: 14.2 km).
- **T33.4** [M] **Withdrawn story: times contradict** — Mark the 12:00 visit 'Missed' or 'Done', or set the withdrawal time before 12:00.
  _Seen:_ 'You withdrew consent at 1:00 pm' while the 12:00–1:00 pm Sri Murugan visit still shows 'Check in'.
- **T33.5** [L] **Jargon on consent and distance** — Use 'you, your manager and HR', drop the Method KPI (or 'Estimated from visit points'), and title the banner 'Location tracking is on'.
  _Seen:_ Consent: 'Who sees it: you, your manager and HR in scope'. Distance KPI: 'Method: Straight line × 1.2'. Banner title: 'Tracking on (duty)'.
- **T33.6** [L] **Map caption layout broken** — Fix it once in the shared GeoMap caption (one left-aligned line).
  _Seen:_ Pin icon alone on the left, caption wrapped on the right ('Map preview · / accuracy 20 m').

## T34 · Auto-roster

- **T34.1** [H] **Unfilled-slot explanation uses wrong rest maths** — Give a reason that follows from the data, e.g. 'worked Wednesday morning (6 am – 2 pm), only 8 h before 10 pm'. Make the AI summary match the counts.
  _Seen:_ Drawer: '11 people · Rest gap under 11 h after an evening shift' and the AI text 'Most operators worked Tuesday evening, so they can't start Wednesday night with enough rest'. Tue evening ends 10 pm and Wed night starts 10 pm, which is 24 h of rest.
- **T34.2** [H] **Coverage numbers contradict the draft grid and headcount** — Derive the KPIs and coverage from the grid and demand data instead of hard-coded numbers. Keep 42 people and 168 slots only if the grid shows them (with a filter).
  _Seen:_ Coverage shows Wed Night 1/2 with 'Assigned (Kavitha Sundaram)', but the grid below has Kavitha and Senthil on N Wed. The KPI says '165 of 168' slots and 'Generating … 42 people and 168 slots', but the demand table adds up to 64 slots and the grid shows 7 people.
- **T34.3** [H] **Two publish paths; grid Publish skips approval** — Hide the grid's Publish button here (pass readOnly publish or a flag). Publish only from the header after approval.
  _Seen:_ The header has 'Approve draft' and the embedded grid has its own 'Publish roster' button. That button publishes while the run is still 'Draft' with 3 slots unfilled.
- **T34.4** [H] **Approve draft is blue and does nothing** — Use variant="approve" (green) and wire it to the approved state. If unfilled slots must be handled first, disable it with '3 slots still unfilled'.
  _Seen:_ 'Approve draft' is variant primary (blue) with no handler, so it never moves to the Approved state.
- **T34.5** [H] **One short slot is not explained; the 'over' reason contradicts the grid** — List every short cell (add Sun 11 Night with 'Publish as open shift'). Rewrite the over reason with a real line operator, or drop it.
  _Seen:_ Sun 11 Night 1/2 is red but missing from 'Why slots are unfilled'. Fri Evening '1 over' says 'Mohammed Irfan's contracted hours can only be met on Friday', but he is a Forklift Driver (not a line operator) and works Evening Mon–Sat in the grid.
- **T34.6** [M] **Rekha called 'free' while she is rostered** — Change to 'Rekha Balan is on evening that day and has no night-work consent', or free her cell.
  _Seen:_ 'Rekha Balan is free but has no night-work consent.' The grid has Rekha on Evening (E 2 pm) on Wed 7.
- **T34.7** [M] **Coverage table scrolls sideways on phone** — On phones show one day at a time (day Segment) or a card per day listing the short slots only.
  _Seen:_ At 390 the coverage table is cut after 'Wed 7' ('T…' visible). The page header's Approve and Run again buttons stack loosely.
- **T34.8** [M] **Jargon in header and KPIs** — Use 'Rules: plant default', 'Run again' (with a helper only if a lock control exists), and 'Nights per person: 2–3'.
  _Seen:_ 'rule set v3 (starter template)', 'Run again (keeps locked cells)' with no visible lock control, and 'Fairness spread: Nights 2–3 each'.
- **T34.9** [L] **Date override not reflected in demand** — Show Sat Morning as 4 with an override marker on that cell, or remove the badge.
  _Seen:_ The badge 'Override: Sat 10 Oct festival sale +1 morning' is shown, but Sat Morning demand is 3, lower than weekdays (4). The +1 is not visible.

## T35 · Open shifts and bids

- **T35.1** [H] **Ineligible claimants marked 're-checked OK'** — Use claimants who pass the rules (e.g. an operator off on Wed), with the real rest hours from the roster. Add 'Night consent valid until …' to each option.
  _Seen:_ Wed 7 Oct Night (Line operator) claimants are Jaya Prakash and Lalitha Devi. Lalitha is a Quality Inspector (wrong skill). Both work Morning 6 am – 2 pm on Wed 7 in the roster, which leaves 8 h rest, yet the dialog says 'rest 14 h' / 'rest 12 h · re-checked OK'. Night-work consent is not shown for either.
- **T35.2** [H] **Phone bid list cannot be ranked** — Add up/down icon buttons (or drag handles) per row. Use a multi-date picker limited to November for days off.
  _Seen:_ 'Rank the patterns you prefer' shows a static numbered list with no drag handle or up/down buttons. 'Days I want off' is a free text box holding '14 Nov, 15 Nov'.
- **T35.3** [M] **Award shift button is blue** — Use variant="approve" (green) for 'Award shift'.
  _Seen:_ The award dialog footer 'Award shift' is variant primary.
- **T35.4** [M] **Shift column cut with ellipsis at 1440** — Shorten to 'Night 10 pm – 6 am' and let it wrap. Merge Date and Shift into one cell. Mark Award rule and Offered to optional, not Claims.
  _Seen:_ The Shift column shows 'Night 10:00 pm…', 'Morning 6:00 a…', 'Evening 2:00 p…' on a wide desktop. At 871, Claims is hidden even though it drives the 'Pick claimant' decision.
- **T35.5** [M] **Open shift with 0 claims has no next action** — Add 'Remind eligible' and 'Widen pool' buttons for rows with no claims. Add a relative badge 'in 8 days' to Date.
  _Seen:_ The Wed 7 Oct Morning row is Open with 0 claims, 3 days away, and has no button.
- **T35.6** [M] **Unknown site 'Krishnagiri' in the pool** — Use 'Hosur plant + Chennai office pool' or just 'Hosur plant'.
  _Seen:_ 'Hosur + Krishnagiri pool'. The data facts list only Bengaluru, Chennai and Hosur.
- **T35.7** [L] **Empty state has no action** — Add an 'Offer an open shift' button to the empty state.
  _Seen:_ Empty: 'No open shifts. Unfilled slots from auto-roster, sick calls or swaps can be offered here.' There is no button.
- **T35.8** [L] **'Fairness score' has no meaning shown** — Replace with plain facts: 'Nights this month: 2' / 'Nights this month: 4'.
  _Seen:_ Claimant descriptions read 'fairness score 62' and 'fairness score 71', with no hint of whether higher is better.
- **T35.9** [L] **Claim buttons styled differently on phone** — Use the same style for both Claim buttons.
  _Seen:_ Phone list: the first 'Claim' is filled blue, the second is outline, for the same action.

## T36 · Presence-based attendance

- **T36.1** [H] **Manager sees another department's person** — For the manager persona, use one of Divya's Quality reports (for example Meera Krishnan) and title the page 'Presence days · My team'.
  _Seen:_ Manager story: the signed-in manager is Divya Raghunathan (Quality), but the page is 'Presence days · Engineering (WFH)' and the card is for Asha Kulkarni.
- **T36.2** [H] **Manager sees first and last active times despite the promise** — For manager and HR, show only the status badge and 'Active time 7 h 40 m'. Keep first and last active for the employee.
  _Seen:_ Manager and HR: the KPIs show 'First active 9:12 am' and 'Last active 6:03 pm', and right below the note says 'Managers and HR see the day status and total active hours only'.
- **T36.3** [H] **'My attendance' shows someone else** — Use ME.name for the employee persona, or set the top-bar persona to Asha.
  _Seen:_ Employee story: the page is 'My attendance' with avatar DR (Divya), but the drawer is 'Asha Kulkarni · Mon 28 Sep'.
- **T36.4** [M] **Presence rows labelled 'Field-recorded'** — Add a 'presence' verdict to PunchList that shows no location badge, or shows 'From Teams'.
  _Seen:_ Employee: both Teams rows carry a blue 'Field-recorded' badge, though this is a work-from-home day with no location.
- **T36.5** [M] **No day result when consent is missing or withdrawn** — Under the alert, show the normal check-in result for the day (for example 'No check-in · Absent' or 'Checked in 9:20 am'). For a manager, add 'Open in muster'.
  _Seen:_ Consent withdrawn (manager) and No consent: the card shows only the alert and a link. The reader cannot tell whether Asha was present, absent or has a missing check-in on 28 Sep.
- **T36.6** [M] **Punch rows crowded and repetitive** — Make each row one line: '9:12 am · Became available on Teams'.
  _Seen:_ Employee @1440: each row is '9:12 am In · Teams presence · Teams presence: available (3 lines) · Field-recorded'. 'Teams presence' is said twice per row.
- **T36.7** [M] **Empty page behind the drawer** — Render the list of presence days (date, status, active hours) behind the drawer. Highlight 'My attendance' or 'Muster' in the nav, not 'Requests'.
  _Seen:_ Every story: the page under the drawer has only a title. There is no list of WFH days to come back to, and for managers the 'Requests' nav item is highlighted with nothing in it.
- **T36.8** [L] **HR view adds nothing over the manager view** — Give HR 'Correct day' and 'View consent record' bordered buttons, and a department filter in place of the fixed 'Engineering' title.
  _Seen:_ HR story is identical to Manager (same title and KPIs, no actions). HR cannot correct the day or see consent records.
- **T36.9** [L] **Jargon in the subtitle** — Use 'Work-from-home days, from Teams status and the YukthiX desktop app' and 'Idle after 10 minutes with no activity'.
  _Seen:_ 'Teams presence and desktop agent · WFH days only'; '10 min idle rule'.

## T37 · Industrial-action event

- **T37.1** [H] **Effect box is hard-coded and ignores the form** — Keep type, legality, from/to and group in useState. Build the sentence from them: '{count} workers × {days} days marked {Type}'. Show the pay line for the chosen legality, e.g. Lay-off legal: '50% of basic + DA paid'. Illegal strike: 'Unpaid; not counted as absent'. Undetermined: 'Pay on hold until legality is set'.
  _Seen:_ Effect says '120 workers × 3 days get the status Strike' whatever is picked. Type and Legality are uncontrolled RadioGroups (defaultValue), so picking Lay-off or Lockout still says 'Strike'. Picking Legal on the default story still shows 'Pay treatment waits until legality is set'. Changing the dates or the worker group does not change the 120 or the 3.
- **T37.2** [H] **Legality 'verified 3 Oct' is after today** — Use a past date such as 'verified 26 Sep' and add a relative badge on the dates: 'starts in 6 days' (amber within a week).
  _Seen:_ Record header: '5–7 Oct 2026 · 120 workers · legality: legal (verified 3 Oct)'. Today is 29 Sep 2026, so 3 Oct is in the future. The event itself is also upcoming, but nothing marks it as upcoming.
- **T37.3** [H] **Change legality always switches to 'undetermined' and says nothing about the result** — Put a Legal / Illegal / Undetermined choice in the dialog with the current value disabled. State the effect in plain words, e.g. 'Lay-off pay of 50% basic + DA for 360 worker-days will be held until legality is set again'.
  _Seen:_ The 'Change legality' button opens a ConfirmDialog with a fixed title 'Change legality to undetermined?'. You cannot pick Illegal. The text says 'All 360 affected days are recomputed before the period lock'. 'Period lock' is jargon, and the dialog does not say what happens to the 50% compensation.
- **T37.4** [M] **Record event and Cancel do nothing, and there is no validation** — Wire Record event to a confirm step ('Mark 120 workers as Strike for 5–7 Oct?') and then open the event record. Disable it with a reason beside it when a required field is empty or To is before From. Make Cancel go back to Requests.
  _Seen:_ 'Cancel' and 'Record event' have no onClick. Record event is enabled even when legality is Undetermined and the notice is empty, and it gives no feedback or confirmation. Recording the event changes 120 people's attendance.
- **T37.5** [M] **Pay terms shown to the signed-in manager, who also sees another team** — Make this screen HR/admin only, signed in as Lakshmi Venkatesan. If managers can see it, hide the Compensation KPI and the Payroll row unless the user has pay access, and limit the worker groups to the manager's own reports.
  _Seen:_ Signed-in as DR (Divya Raghunathan, Quality manager). The record shows 'Compensation 50% of basic + DA' and 'Payroll (M03)'. The form lets her record an event for 'Operations · Line workers (120)', who are Ramesh Gowda's team, not hers.
- **T37.6** [M] **Jargon and placeholder notes in the visible text** — 'Payroll (M03)' becomes 'Payroll'. 'Lay-off compensation line per IR Code (verify)' becomes 'Adds a lay-off pay line: 50% of basic + DA for 3 days'. 'Not Absent or LOP' becomes 'not counted as absent or unpaid leave'. The label 'Notice reference (IR Code)' becomes 'Notice reference'.
  _Seen:_ 'LOP', 'DA', 'IR Code', 'Payroll (M03)', 'per IR Code (verify)', 'never below the legal floor', 'Pay per legality and company policy'. '(verify)' reads like a note from the designer.
- **T37.7** [M] **Event record has no next actions** — Add buttons with borders: 'View 120 workers', 'Open muster 5–7 Oct', 'Edit dates' and 'Cancel event'. Add a small affected-workers table, shown as cards on phone.
  _Seen:_ After the KPIs and the treatment card, the record ends with no list of the 120 workers, no link to Muster or to the payroll period, and no way to change the dates, end the event early or cancel it. 'Employee timeline: Event shown on each worker's record' cannot be opened.
- **T37.8** [L] **Amber 'Lay-off' badge repeats the title** — Replace it with a lifecycle badge such as 'Upcoming' or 'In progress' (neutral), and use amber only if legality is undetermined.
  _Seen:_ The title 'Lay-off · Hosur plant' is followed by an amber 'Lay-off' badge. It adds no information, and amber suggests a risk.
- **T37.9** [L] **Worker picker helper says 'Group or a list' but you can only pick a group** — Remove the helper, or add a 'Pick people…' option that opens a people picker, and show the resulting count under the field ('120 workers selected').
  _Seen:_ The Workers affected Select has one option, 'Operations · Line workers (120)', with the helper 'Group or a list'. There is no way to pick a list of people.

## T38 · Standby and call-out

- **T38.1** [H] **Call-out logged for a future date** — Move the logged call-out to a past standby (for example Sun 27 Sep). Offer only past or current standby slots in the dialog.
  _Seen:_ Call-out log: 'Anil Kumar · Thu 1 Oct, 2:00 am – 2:40 am · paid 2 h'. Today is 29 Sep. The Log dialog is also pre-filled with 'standby Thu 8 Oct'.
- **T38.2** [H] **Published roster has zero rest for Senthil** — Fix the data (Thu 8 OFF) or show a red 'No rest after night shift' badge with a 'Change shift' button.
  _Seen:_ Senthil: Wed 7 'N 10 pm' (ends 6 am Thu) then Thu 8 'M 6 am', which means no rest. The only signal is a small 'Rest gap' chip on a 'Published' roster.
- **T38.3** [H] **Phone says 'tonight' for a date 9 days away** — Say 'Next standby: Thu 8 Oct · in 9 days', or use a standby that falls on 29 Sep.
  _Seen:_ Phone: 'You're on standby tonight · Thu 8 Oct, 6:00 pm – 6:00 am', but today is 29 Sep.
- **T38.4** [M] **Manager sees another team** — Use a maintenance supervisor persona for this story, or filter to ME.name's reports.
  _Seen:_ The signed-in user is Divya Raghunathan (Quality). The screen is 'Hosur maintenance' with Anil Kumar and Senthil Murugan, and it has a 'Log call-out' action.
- **T38.5** [M] **Rest conflict badge is long and has no action** — Short badge 'Rest 6 h 50 m', with the detail in the second line. Add a 'Move next shift' button.
  _Seen:_ Badge text: 'Rest conflict: next shift 9:30 am, 6 h 50 m rest'.
- **T38.6** [M] **Roster grid cut off at 871** — Let the day columns shrink, or move hours under the person's name at tablet width.
  _Seen:_ At 871, the Hours column is clipped at the right edge ('Ho', '3').
- **T38.7** [L] **Shift codes with no legend; standby has no times** — Show 'Standby 6 pm' on SB chips and add a one-line legend above the grid.
  _Seen:_ Chips show 'G', 'E', 'N', 'M', 'SB' and 'OFF'. SB shows no time, while the other chips show a start time.
- **T38.8** [L] **'OK' badge adds nothing** — Remove the badge. Show only conflicts.
  _Seen:_ Senthil's 27 Sep call-out has a green 'OK' badge.

## T39 · Block-leave planner

- **T39.1** [H] **Banking roles in a food company** — Use Kaveri Foods roles that need block leave (for example Accounts payable, Cash & bank, Stores in-charge) and say 'ERP and bank portal access'. Drop 'BFSI pack'.
  _Seen:_ The page header says 'BFSI pack', the roles are Branch cashier, Treasury officer and Payments approver, and the dialog says access to 'core banking' is suspended. The tenant is Kaveri Foods Pvt Ltd.
- **T39.2** [H] **Manager view is the same as HR** — Filter to ME.name's reports in scope, or show an empty state 'None of your team is in a block-leave role'. Hide 'Start block' for managers.
  _Seen:_ The Manager story at 871 shows exactly the HR list (same 4 people, KPIs 14 people) and can start a suspension. None of them report to Divya Raghunathan.
- **T39.3** [H] **KPIs don't match the list** — Calculate the KPIs from the rows, or list all 14 people with a filter.
  _Seen:_ The KPIs read 'People 14 · Taken 6 · Planned 5 · Not planned 3', but the list has 4 people and only 1 is not planned.
- **T39.4** [M] **Block isn't 10 working days** — Check plans against the holiday calendar and flag 'Only 9 working days · extend to 26 Oct'. Correct the sample data.
  _Seen:_ Revathi's block is 12–23 Oct, which includes Ayudha Puja on 20 Oct, so it's only 9 working days. The rule says '10 consecutive working days'.
- **T39.5** [M] **Loose 'Start block' button** — Put a 'Start block' row button on each Planned row. Enable it only on or near the start date; otherwise disable it with 'Starts 12 Oct'.
  _Seen:_ A full-width 'Start block for Revathi Chandran' sits under the list, cut off from her row and starting a block 13 days early.
- **T39.6** [M] **Suspension confirm isn't marked destructive** — Make the confirm button danger-styled (destructive), and name who can grant exceptions.
  _Seen:_ The dialog 'Start block leave and suspend access?' has a blue 'Confirm suspension' button.
- **T39.7** [M] **Red badge for a deadline still 32 days away** — Make the badge 'Not planned' in amber, with the date cell showing 'Plan by 31 Oct' plus a relative badge. Turn it red only when overdue.
  _Seen:_ 'Not planned · cut-off 31 Oct' is red on 29 Sep. The badge is long and wraps under the name on phones.
- **T39.8** [L] **Nudge does nothing** — Send the nudge and show 'Nudged 29 Sep' under the row. Disable for 3 days after sending.
  _Seen:_ 'Nudge to plan' has no handler and shows no record of nudges already sent.
- **T39.9** [L] **Jargon in header** — Use 'Staff in cash and payment roles take 10 working days off in a row each year. Their system access is paused while away.'
  _Seen:_ 'BFSI pack · designated roles take 10 consecutive working days a year · system access is suspended while away'. The persona line ('Compliance view' / 'Your team') is a muted fact.

## T40 · Licence requirements

- **T40.1** [H] **Blocked alert contradicts the table: forklift licence expired, but the Forklift row shows 0 expired** — When blocked is true, use expired: 1 for l1 (or set it to 1 always and make the alert the drill-down for it). Write the alert date with the relative badge pattern: 'expired 27 Sep · 2 days ago'.
  _Seen:_ Blocked story alert: 'Driving licence expired 27 Sep for Mohammed Irfan'. The table row directly below, 'Forklift driver (role)', shows Expired 0 (LIC l1 expired: 0, roster.tsx line 572). 27 Sep is before today (29 Sep), so the licence counts as expired.
- **T40.2** [H] **The blocked alert has no button to act on it** — Add bordered buttons inside the alert: 'Find replacement' (opens Open shifts / Roster for today's forklift shift) and 'Ask to renew' (sends a reminder to Mohammed Irfan).
  _Seen:_ The alert 'Assignment blocked … He can't be placed on today's forklift shift' carries no button. The manager can't find a replacement or ask Mohammed Irfan to upload a renewed licence from here.
- **T40.3** [H] **Rows lead nowhere: no way to see who is expired or expiring** — Add a row action column with bordered same-width buttons ('View holders'), or make the Expired and Expiring counts open a holder list filtered to those people. Add 'Edit' as a bordered button, not a link.
  _Seen:_ The rows show counts (Food handler: 5 expiring, 2 expired; First aider: 1 expired) but have no row action or link. Nothing on the screen lets a user see the names behind the counts, chase them, or edit the requirement.
- **T40.4** [M] **'Add requirement' buttons do nothing** — Wire both to one Add requirement dialog or sheet: Required for (role, skill or shift), Licence, Legal or Company, reminder days.
  _Seen:_ The header 'Add requirement' (line 589) and the empty-state 'Add requirement' (line 591) have no onClick. Clicking either does nothing.
- **T40.5** [H] **The most important column, Expired, is hidden at tablet and phone widths** — Mark Holders (and possibly Type) optional: true and keep Expired and Expiring visible. Better still, merge them into one 'Needs action' cell, e.g. '2 expired · 5 expiring', in red or amber. On phones render cards: requirement, licence, type badge, needs-action line.
  _Seen:_ At 871 the table shows 'Columns (1 hidden)', and Expired is the column dropped. At 390 'Columns (4 hidden)' leaves only Required for and a clipped Licence, so no counts or type are visible.
- **T40.6** [M] **Licence names are cut off with ellipsis at every width** — Let the Licence column wrap to two lines (wrap: true / no truncate) and narrow the Type column. Shorten the copy too: 'LMV + forklift endorsement', 'FSSAI food handler', 'Boiler attendant', 'First aid (company)'.
  _Seen:_ At 1440: 'Driving licence · class ...', 'FSSAI food handler ce...', 'Boiler attendant certifi...', 'First aid certificate (co...'. At 871 and 390 even more of each name is cut. The licence is the key fact on each row.
- **T40.7** [M] **Expired counts are plain numbers with no risk colour** — Make the Type badge neutral ('Legal' / 'Company'). Show non-zero Expired in a danger badge and non-zero Expiring in a warning badge. Show zero as a muted dash.
  _Seen:_ 'Expired 2' and 'Expired 1' look the same as '0'. Meanwhile every legal row carries a red 'Legal · no override' badge. Red is spent on a static type, and the real risk (people who can't be rostered) is shown in neutral text.
- **T40.8** [L] **Type badge is long and wraps to two lines; the wording also differs from its value** — Badge just 'Legal' / 'Company'. Put the override rule in the column header help or the page description ('Legal licences can't be overridden; HR can override company ones with a reason'). Use the same string for value and render.
  _Seen:_ The 'Company · override allowed' badge wraps onto two lines at 1440 and 871. The column value text is 'Company · HR override with reason', which differs from the badge text 'Company · override allowed' (line 582).
- **T40.9** [L] **Jargon suffixes in 'Required for' and description** — Show the kind as small secondary text ('Role', 'Skill', 'Shift'), or drop it. Rename 'Boiler shift (shift)' to 'Boiler shift'. Description: 'People without a valid licence can't be rostered. Reminders go out 60, 30 and 7 days before expiry.'
  _Seen:_ Rows read 'Forklift driver (role)', 'Food handler (skill)', 'Boiler shift (shift)', 'First aider (roster)'. '(shift)' after 'Boiler shift' is redundant. The description 'Roster, open shifts, bids and trips are blocked' mentions bids and trips, which mean nothing for a food plant.
- **T40.10** [L] **Empty table shows a large blank card on desktop with only one row of headers** — Add a toggle chip 'Only with expired or expiring' in the table toolbar. Its filtered-empty state says 'No licences need action' and offers a 'Show all' button.
  _Seen:_ At 1440 the list story leaves about 650px of empty page under four rows, and the toolbar (Columns, density) has no filter for 'Only with expired'. With 48 food handlers, the founder needs to filter to the problem rows.

## T41 · Hybrid office days

- **T41.1** [H] **'Who's in on Wed' contradicts the grid** — Build the sentence from the plan data, or drop it and add an 'In office' count row under the grid.
  _Seen:_ Note says 'Who's in on Wed 7 Oct: Divya Raghunathan, Fathima Beevi, Priya Shankar', but the grid shows only Arun Prakash and Rahul Deshpande in Office on Wed 7. The sentence is hard-coded.
- **T41.2** [H] **Employee can see colleagues' compliance** — For employees, hide Compliance (or show only their own row) and open on 'My office days'. Show teammates only as 'who's in' per day.
  _Seen:_ Employee story shows the Compliance tab, with 'Rahul Deshpande · Below · 1 of 3' visible to a peer. The employee also sees the whole team plan under 'My attendance'.
- **T41.3** [H] **Phone count contradicts its own list** — Compute the count from the list ('3 of 3') and label it 'Week of 5 Oct'.
  _Seen:_ Phone KPI 'This week 2 of 3' while the list shows 3 office days (Tue, Wed, Thu). The dates are 5–9 Oct, which is next week, not 'this week'.
- **T41.4** [H] **Plan cells don't do anything and can't be edited on phone** — Clicking a cell cycles Home↔Office, with anchor days locked and the reason 'Anchor day'. On phone, use a joined Segment (Home | Office) per day.
  _Seen:_ Grid cells are buttons with no click handler. Anchor cells look clickable too. Phone shows Home/Office as static badges, but has a 'Save my plan' button.
- **T41.5** [M] **Week and month missing, no navigation** — Add a 'Week of 5 Oct 2026' label with arrows. Show 'Planned' only when it isn't 3 of 3 (amber 'Short by 1').
  _Seen:_ Columns read 'Mon 5 … Fri 9' with no month or week label and no prev/next. The 'Planned 3 of 3' column is the same on every row.
- **T41.6** [M] **Office, Home and Anchor look identical** — Tint Office and Anchor cells (anchor with a lock icon) and leave Home plain.
  _Seen:_ All cells are bold black text on white. You can't scan who is in.
- **T41.7** [M] **Compliance: no period, partial list, no action** — Title it 'Week of 21 Sep'. List all 6. Add a 'Remind' button on rows below target. Say 'leave counts as an office day'.
  _Seen:_ Compliance lists 3 of 6 people with no week stated. 'Below · 1 of 3' has no nudge button. Copy says 'pro-rated to 2'.
- **T41.8** [M] **Policy form has no save and no anchor-day setting** — Add an 'Anchor days' weekday toggle group and a 'Save policy' button at the end of the form.
  _Seen:_ HR policy tab: fields and switch only, with no Save button. The header mentions 'anchor days Tue and Thu', but the form can't set them.

## T42 · Holiday feed settings

- **T42.1** [H] **Accept buttons are not green** — Use variant="approve" on Accept.
  _Seen:_ Review story: "Accept" beside each change is a plain grey bordered button, styled the same as "Ignore".
- **T42.2** [H] **Publish works with nothing accepted** — Show the decision on each row ("Accepted" / "Ignored" with Undo). Disable Publish with "Accept at least one change" and label it "Publish 1 change".
  _Seen:_ "Publish accepted changes" is primary and enabled before any change is accepted, and Accept/Ignore show no chosen state.
- **T42.3** [M] **Feed covers Hosur, which has no calendar** — List only Chennai office, or show "Hosur plant · no calendar yet" with a "Start calendar" button.
  _Seen:_ "India · Tamil Nadu — Chennai office, Hosur plant", but TIM-26 says "Hosur plant has no 2026 calendar".
- **T42.4** [M] **Unknown Sri Lanka entity and office** — Remove it, or add Colombo to the location data and TIM-26 tabs.
  _Seen:_ "Sri Lanka · Western Province — Colombo sales office (Kaveri Foods Lanka)": no such entity or office anywhere else, and TIM-26 has no Colombo tab.
- **T42.5** [M] **Moved holiday hits booked leave with no next step** — Add "See 2 people" and state the outcome: "Their leave on 9 Nov is refunded when you publish".
  _Seen:_ "64 people affected; 2 have leave on 9 Nov." There is no way to see those 2 or say what happens to their leave.
- **T42.6** [L] **Badge says to review but has no button** — Replace the badge with a bordered "Review 2 changes" button that scrolls to or opens the changes.
  _Seen:_ Tamil Nadu row shows a "2 changes to review" badge with no action. On the Subscriptions story there is no link to the changes either.
- **T42.7** [L] **Feeds off says nothing about what happens next** — Add "Calendars keep their holidays; you add changes by hand in Holiday calendars", with an "Open holiday calendars" button.
  _Seen:_ Off story: only the toggle remains. No text about whether calendars stay or how holidays get updated now.
- **T42.8** [L] **No way to add or remove a feed** — Add "Add feed" (country, region, locations) and a per-row menu with Remove.
  _Seen:_ The Subscriptions card lists 3 feeds but has no "Add feed" or per-feed remove/edit control.

## T43 · Timesheet pre-fill from my tools

- **T43.1** [H] **Suggestion from a tool that isn't connected** — Remove the code-host suggestion, or show GitHub as connected. Keep suggestions on or before today.
  _Seen:_ 'Wed 30 Sep · QA-ERP · Test execution · 3 h · Code host: 4 test commits in erp-tests', while Code host (GitHub) shows 'Connect'. Wed 30 Sep is also tomorrow (today 29 Sep).
- **T43.2** [H] **Accept would double-count hours already on the grid** — Show 'Already on your timesheet' (neutral) for matching cells and only offer the difference. After Accept, show 'Added to Mon · SRF-24' with an Undo button.
  _Seen:_ Mon SRF-24 2 h and Tue INT Meetings 1 h are already in the timesheet grid, but the suggestions offer them again. 'Added to draft' gives no sign they were merged.
- **T43.3** [M] **'Rule' tag looks like a button** — Make 'Rule' a badge styled like 'AI' (neutral tone, no button border), or write 'Matched by rule' in the source line.
  _Seen:_ 'Rule' is a bordered white box the same height as the Reject/Edit buttons, next to the purple 'AI' badge. On phone it looks like a tappable button.
- **T43.4** [M] **Edit does nothing; no undo after reject/accept** — Edit opens inline hour/project fields. Add 'Undo' on Added/Rejected rows.
  _Seen:_ 'Edit' has no handler. Once Rejected or Added, the row has no way back.
- **T43.5** [M] **No bulk accept or close step** — Add a footer with 'Accept all new (2)' and 'Back to timesheet' buttons.
  _Seen:_ Four rows each need a click. The drawer has no footer action like 'Add 2 to timesheet' or 'Done'.
- **T43.6** [M] **Empty and connect states give no next step** — Empty state: add a 'Connect code host' or 'Fill week by hand' button. Title the card 'Your tools' and show 'Not connected' text before Connect.
  _Seen:_ No-suggestions EmptyState has no action. In the Connect story the card is still titled 'Connected tools (read-only)' with nothing connected.
- **T43.7** [M] **Phone hides the reason and the reject option** — Add the source line and Reject beside Accept. Reword the note: 'You still submit the week yourself.'
  _Seen:_ Phone rows show only day, hours, project and Accept. There is no source ('Calendar: …'), no Reject, and no connected tools. The note 'Submit stays manual on your timesheet.' is awkward wording.
- **T43.8** [L] **Page behind the drawer is blank** — Render TimesheetScreen with prefillOpen so the drawer opens over the real week.
  _Seen:_ PrefillScreen renders only the 'My timesheet' title behind the drawer, without the grid.

## KIT · Kit

- **KIT.1** [H] **Borderless text links act as buttons on the ClockCard** — Replace both with <Button size="sm">: 'Add note' (icon StickyNote) beside Clock out / Start break, and a bordered 'Regularise' button in the footer row. Keep the 'Today's punches (n)' link on the home variant only if it navigates.
  _Seen:_ In every ClockCard story, 'Add a note to this punch' (line 438) and 'Regularise' in 'Wrong or missing time? Regularise' (line 451) are underlined <Link href="#"> with onClick handlers. They open a note box and start the regularise flow, so they are actions, not navigation.
- **KIT.2** [H] **DayCardBody shows 'Worked 0 m' and a hard-coded break note for an open day** — When there is no out-punch, show Worked as 'Not known, no check-out' and Overtime as '—'. Show the break note only when worked is over 5 h and a break was actually deducted.
  _Seen:_ DayCard story (10 Sep, Missing check-out, checked in 9:31 am): Worked shows '0 m', with the line '30 min break deducted above 5 h' under it (line 595). Nothing was deducted from 0 m, and the hours are unknown because there is no check-out. Overtime 'None' and Late 'No' sit beside it as if the day were complete.
- **KIT.3** [M] **The Missing check-out message appears twice and the alert has no button** — Drop the duplicate header line, or merge it into the alert. Put 'Fix this day' (or 'Regularise') inside the red alert. Keep a bottom button only for the other states (late request or nudge).
  _Seen:_ DayCard: the header line 'MP Missing check-out · Checked in 9:31 am, no check-out' is followed by a red alert titled 'Missing check-out' saying 'Regularise it with your actual out time'. The 'Fix this day' button sits at the very bottom, below the map and the punch list, not in the alert.
- **KIT.4** [M] **GeoMap leaves empty white bands and squeezes the caption** — Use preserveAspectRatio="xMidYMid slice", or size the figure to the SVG's aspect ratio (max-width ~480 px, centred), so the tiles fill the frame. Lay out the figcaption as an inline row: icon, then text left-aligned at full width.
  _Seen:_ MapTrail at 1440: the 320×200 SVG uses preserveAspectRatio 'meet', so about 200 px of blank white sits on each side of the map. In the footer, the pin icon floats in the middle and 'Map preview' wraps onto two lines at the far right. The DayCard map does the same, and its caption 'Map preview · punches and the allowed geofence' also wraps.
- **KIT.5** [L] **Filler and jargon map caption** — Give the caption the data, for example 'Chennai office · 1 punch inside the 200 m zone', or remove it. On employee badges, say 'At office' / 'Outside office (850 m away)' instead of 'Inside geofence'.
  _Seen:_ DayCardBody passes caption='Map preview · punches and the allowed geofence' (line 604), and the default caption is 'Map preview'. This text describes the widget rather than the data. 'Geofence' also shows on employee-facing badges ('Inside geofence').
- **KIT.6** [M] **PunchList time and type columns wrap and crowd at desktop width** — Give the time cell white-space: nowrap and a min-width (~72 px). Merge type into the time cell ('1:15 pm · Break start'), or nowrap the type column and let the location text wrap instead.
  _Seen:_ Punches at 1440 (card width 720): '1:15 pm' and '1:52 pm' break into '1:15 / pm', and 'Break start' / 'Break end' wrap to two lines, while 'In' / 'Out' stay on one. The rows have uneven heights, and the location column has spare room.
- **KIT.7** [L] **Punch rows give contradictory location text** — For biometric and kiosk punches, show 'Gate 2 reader' with no geofence badge. For mobile, show 'At Chennai office (40 m from centre)'. Hide IPs behind the HR view and replace '(bound)' with '(your approved phone)'.
  _Seen:_ Punches story: the biometric reader row says 'Inside geofence · at the site', while the mobile out-punch row says 'Inside geofence · 40 m from nearest site'. A fixed gate reader has no GPS, so a geofence verdict there means nothing. Web rows show raw 'IP 10.20.4.17', and the mobile row says 'Pixel 7a (bound)'.
- **KIT.8** [M] **Month summary uses jargon codes and 'To fix' has no action** — Rename to 'Unpaid leave days', 'Overtime', 'Late days (3 allowed)'. Make 'To fix' count only MP/A days, labelled 'Days to fix: 10 Sep', with a bordered 'Fix 10 Sep' button. Show pending regularisations separately as 'Waiting for approval 1'. Hide legend entries with count 0, or move them to a collapsed 'All codes'.
  _Seen:_ Month at 1440 and 871: the KPIs read 'LOP days', 'OT hours', 'Late marks 2 · 3 free a month', 'To fix 2'. 'To fix 2' does not say which days, and there is no button. It also seems to count 22 Sep 'R' (regularisation already pending) as something the employee must fix, though only 10 Sep (MP) needs action. The legend lists zero rows: 'Absent 0', 'Earned leave 0', 'Sick leave 0'.
- **KIT.9** [L] **Note link is still offered when clock-in is blocked** — Hide the note control (or disable it) whenever the primary punch action is disabled. Show it only when there is a punch to attach it to.
  _Seen:_ ClockDevice at 1440: Clock in is disabled because the device is not approved, but 'Add a note to this punch' stays active below it. There is no punch to note.
- **KIT.10** [L] **Timeline axis label pokes outside the card edge** — Anchor the first axis label with text-anchor start (and the last with end), or add horizontal padding equal to half a label width inside the ShiftBar track.
  _Seen:_ DayCard at 1440: the ShiftBar axis label '6 am' starts at x≈35, left of the card content edge at x=48, and the final '9 pm' label has no end tick. The first label is pushed past the gutter.
