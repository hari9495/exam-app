# Compare: approvals, notifications and the team view (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Inbox, My Team) and `keka-map.md`;
- `zoho-pages.md` (Home › Team, Operations › Approvals, Home › My Space › Delegation, notifications);
- YukthiX code on `test/yukthix-main` (PLT-04 approvals, PLT-65 notifications, PPL-08 team, TIM-16 / TIM-20), plus
  `gap-audit.md` (K1 to K5).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.
Attendance and leave rows for managers (team today, leave clash, bulk shift changes) are in `compare-attendance-leave.md`.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Approvals inbox

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Kinds with counts | Groups: leave, regularisation, timesheets | Filter chips | Has (merged): kind chips with counts | **Keep ours** |
| A2 | Layout | Three columns: groups, list, detail with a comment box | List with a filter drawer | Partly: tabs, list, side drawer with approve / reject and a reason (PLT-04 `/yx/approvals`) | **Take K:** three columns on wide screens; the drawer stays on laptops |
| A3 | Bulk decisions | Select all, approve or reject | — | Partly: select all and "Approve N"; no bulk reject | **Take K:** add bulk reject with one reason |
| A4 | Decided items | Archive of the last 3 months with the approval trail | — | Partly: "Sent by me" and "Team history" tabs with a timeline | **Keep ours**; add a "Decided by me" tab with a period |
| A5 | Leave clash for the approver | "No teammates on leave on this day" | — | Has | **Keep ours** |
| A6 | Filters | Search, newest first | Chips: approver, record owner, form, status, employee status | Partly: type, due date, search | **Take Z:** chips for team and status |
| A7 | Delegation | — | Reassign approvals for a time frame | Has: from-to dates, "Delegated to me" tab (`/yx/me/delegation`) | **Keep ours** |
| A8 | All pending approvals (HR) | — | Org-wide list in Operations | Missing (unsure): each person sees only their own | **Take Z:** HR sees stuck items and reassigns when an approver leaves |
| A9 | Approve outside the app | — | — | Partly: one-time links for Teams, Slack, push (`/act/[token]`); no WhatsApp | **Keep ours**; add WhatsApp later |
| A10 | Approval rules | Approval chain per project | Approvals per form | Has: policy editor (PLT-12 `/yx/settings/approval-policies`) | **Keep ours** |
| A11 | Profile changes | My Team › Profile changes | — | Has (merged): in the inbox | **Keep ours** |

## B. Notifications

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Bell and feed | Notifications tab, "Mark all as read" | Right-hand drawer | Has: bell with mark all read, `/yx/notifications` | **Keep ours** |
| B2 | Channel choice | — | Email on / off for the company | Partly: email on / off per kind and a digest (`/yx/me/notifications`); no WhatsApp or push choice | **Mix:** keep per kind; add WhatsApp and push; company sets defaults |
| B3 | Reminders and nudges | — | Nudge cards ("yet to submit time logs") | Partly: approval reminders and escalation; manager "Nudge" to check in | **Take Z:** nudge cards on Home (time not logged, a window closing) |

## C. Team view (manager)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Team today | On leave, not in, on time, late, WFH, remote | Yet to check in | Has (merged): "My team today" card | **Keep ours** |
| C2 | Direct reports / peers | Switch | Department view | Partly: subtree and dotted-line reports; no peers | **Take K** for peers: read-only, no times shown |
| C3 | Team calendar | Row per person, coloured day dots, full legend | On leave: list, week, month | Partly: TIM-20 `/yx/time/team` leave chips; no attendance or WFH dots | **Take K:** dots and a legend |
| C4 | Leaderboards | Top 5 on time, hours, overtime | — | Missing | **Take K**, later: managers only, company switch |
| C5 | Negligence | Late arrivals, least-hours bands, frequent breaks | — | Partly: late marks, early exits, overtime per person (TIM-16 `/yx/time/reports`) | **Take K:** add hour bands and breaks (discipline in factories and BPOs) |
| C6 | Team leave overview | Trend per type; unplanned, no leave, most leave | — | Partly: pending, who else is off, who is away this week | **Take K:** the unplanned and "no leave taken" cards (burnout check) |
| C7 | Bulk regularise and cancel penalties | Date range, filters, bulk action | — | Partly: bulk approve regularisations; exceptions page; no penalty waiver (unsure) | **Take K:** bulk waive late-mark penalties before payroll closes |
| C8 | Team list | Cards with an "IN" badge | Grouped by designation with live status | Has: list with today's in / out and an as-of time (PPL-08 `/yx/people/team`) | **Keep ours** |
| C9 | Team reports | Reports library per area | Team reports (muster, consecutive absences) | Partly: attendance and overtime reports, team expenses | **Take K**, with the reports library (admin E1) |
| C10 | Team space | — | Department wall, groups, surveys | Missing (feed designed only) | **Skip:** comes with the Engage feed, if ever |
| C11 | Team hiring | Requisitions; internal job approvals | — | Partly: "Request hire" raises a requisition; internal moves only tell the manager | **Take K:** the manager approves releasing a person |

## Suggested order to build

1. **Must for daily use:**
   - A3 bulk reject (S);
   - A8 HR view of all pending approvals, with reassign (M);
   - C3 team calendar dots (S);
   - C7 bulk penalty waiver (M);
   - C5 negligence bands (M);
   - A2 three-column desk (M).
2. **Depth:**
   - A6 filter chips (S);
   - A4 "Decided by me" (S);
   - C6 leave overview cards (M);
   - B3 Home nudges (S);
   - C2 peers (S);
   - C11 internal move approval (S);
   - B2 WhatsApp and push choice (M).
3. **Later:** C4 leaderboards (M), C9 team reports (with the library, L), A9 WhatsApp approvals (M).
