# Attendance and leave: Keka, Zoho People and YukthiX side by side

Founder's method (16 Nov 2026): note everything Keka and Zoho People do on these screens first, then compare row by
row, pick the better pattern per row, and only then design (kit first). Layout and flow only: we never copy branding,
colours or wording, and we never store anyone's real data from these products here.

Sources: Keka seen 16 Nov 2026 (founder's own employee login, "Me" pages only, nothing submitted). Zoho People: to do.
YukthiX: the designed screens in the kit (Screens/Time · Attendance calendar, My attendance today, TIM-07, TIM-17, TIM-18).

Column key: ✓ has it, ✗ does not, ~ partly. "Pick" is filled in after Zoho is noted and we compare.

## 1. My attendance

| # | Feature | Keka | Zoho People | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Page layout | Three cards on top (Stats · Timings · Actions), then "Logs & Requests" with tabs | | Page header with actions, month bar, alert, calendar with a totals side card | |
| A2 | Stats: my average hours per day and on-time arrival %, with my team's average beside it, for a chosen period (Last week …) | ✓ | | ~ month totals only (days present, leave, late days, overtime), no team comparison, no on-time % | |
| A3 | Today's timing: shift hours as a coloured bar with the break marked, duration and break minutes, the week's days as dots | ✓ | | ~ separate "My attendance today" page | |
| A4 | Actions card: live clock, Web clock-in, Work from home, On duty, Attendance policy link | ✓ | | ~ buttons in the header (Export month, New request, Regularise a day); clock-in on its own page | |
| A5 | Tabs: Attendance log · Calendar · Attendance requests on one page | ✓ | | ✗ calendar only; requests elsewhere | |
| A6 | List view: one row per day with a small worked-time bar, effective hours, break taken, gross hours, arrival (late by / on time), a status icon; weekly offs as a grey full-width row | ✓ | | ✗ | |
| A7 | Period buttons: 30 days / month names (Nov, Oct, Sep …) to jump straight to a month | ✓ | | ~ previous / next arrows | |
| A8 | Calendar cell: date, a status icon (late, warning), "W-OFF" tag on weekly offs | ✓ | | ✓ day code (P, WFH, L, MP, CL, WO, H) and a short note (22 min late, +45 min OT), colour per status | |
| A9 | Click a day: details panel on the right: shift, gross and effective hours, late by, a "Regularize" link, every punch in / out with "MISSING" | ✓ | | ~ opens a day card (TIM-03) instead of a side panel | |
| A10 | Month totals side card | ✗ | | ✓ days present, leave days, unpaid leave, late days (with allowance), overtime, taken as comp-off | |
| A11 | "Fix before payroll closes" alert with the day to fix | ✗ | | ✓ | |
| A12 | Requests tab: Work from home / On duty requests and Regularization requests as two lists, each with a date range and a menu | ✓ | | ✗ on this page | |
| A13 | 24-hour time switch | ✓ | | ✗ | |
| A14 | Export the month | ✗ (not on this page) | | ✓ | |

## 2. My leave

| # | Feature | Keka | Zoho People | YukthiX today | Pick |
|---|---|---|---|---|---|
| L1 | Pending requests block at the top (empty state "No pending leave requests") | ✓ | | ~ "My requests" card lower down | |
| L2 | Request Leave button with links under it: request comp-off credit, comp-off history, leave policy document | ✓ | | ~ Apply leave button in the header; comp-off has "Use comp-off" on its card | |
| L3 | Year selector (Jan–Dec 2026) | ✓ | | ~ leave year shown as text | |
| L4 | Charts: weekly pattern (which weekdays taken), consumed by leave type (donut), monthly stats (bars) | ✓ | | ✗ | |
| L5 | Balance per leave type: donut with days available; available, consumed, accrued so far, annual quota; "View details" | ✓ | | ✓ card per type: days available, a bar, "x of y taken or booked", carried forward, pending; unpaid leave marked | |
| L6 | Leave history table: dates (with day count), type (requested on), status (approved by), requested by, action taken on, note, reject or cancel reason, actions menu; filters by type and status, search, total, pages | ✓ | | ~ last three requests with View / Withdraw / Ask to cancel | |
| L7 | Upcoming holidays with "in N days", and optional holidays taken / left | ✗ | | ✓ | |
| L8 | Apply leave as a side drawer: From and To with a day count between, leave type, note, Notify (pick colleagues), Cancel and Request | ✓ | | ✓ drawer: type, dates, first and last day halves, reason, delegate approvals, a live summary (days counted, weekends counted, balance after, each day listed, approver and who else in the team is off) | |
| L9 | Notify colleagues when applying | ✓ | | ✗ | |

## 3. Notes for the compare step

- Keka's strongest pieces: the day-by-day list view (A6), the day details side panel with punches and Regularize
  (A9), and the full leave history with filters (L6).
- YukthiX is ahead on: day codes in the calendar (A8), month totals (A10), the payroll alert (A11), the apply-leave
  summary (L8) and holidays (L7).
- Questions to settle when comparing: should a team comparison show on an employee's page (A2, privacy: averages
  only, never names)? Does a 24-hour switch belong in each page or in personal settings (A13)?
