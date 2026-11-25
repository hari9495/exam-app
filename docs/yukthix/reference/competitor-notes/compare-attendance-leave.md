# Compare: attendance and leave (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md`, `keka-map.md` and `attendance-and-leave.md`;
- `zoho-pages.md`;
- YukthiX's designed screens TIM-01 to TIM-43 and the attendance calendar, plus its code.

A few YukthiX cells say "check": a full code audit is running and will confirm them.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. My attendance (employee)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Views of my days | Log list, calendar, requests as tabs | List (day timeline), table (first in, last out, payable hours), calendar | Calendar only, with a totals card | **Mix:** add a list view (Keka's row with a worked-time bar and late-by) and Zoho's table columns as a toggle; keep our calendar |
| A2 | Day details | Side panel: shift, gross and effective hours, late by, every punch, Regularize link | — | Day card (TIM-03) opens separately | **Take K:** side panel on the same page |
| A3 | Requests on the same page | Tab with WFH / on duty and regularisation lists | Split button (regularisation, on duty) plus lists with a status filter | Elsewhere | **Mix:** a Requests tab and a "Request" split button |
| A4 | Totals for the month | — | Sticky footer counters (payable days, present, on duty, paid leave, holidays, weekend), days / hours switch | Totals side card | **Keep ours**, add Zoho's "payable days" and the days / hours switch |
| A5 | Me vs team stats | Average hours a day and on-time %, me vs my team | — | — | **Take K**, team as an average only |
| A6 | Today's timing bar | Shift bar with break | Shift drawn on an hour axis | Separate "My attendance today" page | **Mix:** small timing bar on the page |
| A7 | Payroll deadline alert | — | — | "1 day needs fixing before payroll closes" | **Keep ours** (neither has it) |
| A8 | Day codes in calendar | Icons, W-OFF tag | "Absent" chips | P, WFH, L, MP, CL, WO, H with notes | **Keep ours** |
| A9 | Office vs remote check-in | — | Each punch marked office or remote by source, IP range, map area; rule for days with both | IP / office-network and geofence rules exist (check: whether each punch is labelled) | **Take Z** if the label is missing |
| A10 | Regularisation form | Drawer: date, shift, exempt from penalty, note | Day, date, attachment, table of check-in / check-out / total / description | TIM-07 attendance request | **Keep ours**, add Zoho's attachment and "exempt from penalty" if missing |

## B. Attendance rules (admin)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Hours counting | — | First in / last out or every pair; strict or lenient; round-off; max hours a day | Check | **Take Z** for any missing switch |
| B2 | What counts as payable | — | Weekends, statutory and non-statutory off, holidays, leave | Check | **Take Z** if missing |
| B3 | Punch sources | Web clock-in | Web, mobile, kiosk with photo, biometric, API, FTP, import / export of punches | Kiosk (TIM-13), devices (TIM-14), mobile (TIM-12), geofence (TIM-31), face checks exist | **Keep ours**; check punch import / export |
| B4 | Hourly permission | — | Methods switch | Not found | **Take Z** (common in India: "2 h permission") |
| B5 | Biometric ID mapping | — | Device user id to person | Devices exist (check mapping) | **Keep ours** / fill gap |
| B6 | Bulk team changes | Change shift, weekly off, penalty policy for ticked people; import | Shift groups, roster grid | Roster (TIM-05), auto-roster (TIM-34) | **Take K** for the bulk change bar if missing |
| B7 | Muster roll | — | Report: shift and status per day, full legend | Muster (TIM-02) | **Keep ours**, compare the legend |

## C. My leave (employee)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Balances | Donut per type: available, consumed, accrued, quota | — (blocked in this account) | Card per type with a bar, taken or booked, carried, pending | **Keep ours**, add "accrued so far" |
| C2 | Full history | Table with type and status filters, search, pages | Requests list with views and filters | Last three only | **Take K** |
| C3 | Charts | Weekday pattern, by type, by month | — | — | **Take K**, low priority |
| C4 | Apply leave | Drawer: dates with a day count, type, note, Notify colleagues | Modal: type, dates, team email, reason | Drawer with live summary, half days, delegate, who else is off | **Keep ours**, add "Notify colleagues" |
| C5 | Holidays | — | Per location and per shift, April–March year, list / calendar | Upcoming holidays, optional holidays (TIM-23), holiday calendars (TIM-26) | **Keep ours**; check per-shift holidays |
| C6 | Fix-it empty states | — | "Update the Date of Joining…" with a link | Check | **Take Z** everywhere |
| C7 | Team availability | Team calendar with day dots and a legend | On leave: list / week / month | Team leave calendar (TIM-20) | **Keep ours**, compare with Keka's dots |

## D. Leave rules (admin)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| D1 | Policy editor | — | 4-step wizard: details, entitlement, applicability, restrictions | Leave type editor (TIM-27), policies (TIM-28) | **Mix:** keep ours; compare field by field with Zoho's 4 steps |
| D2 | Ready-made policies | — | Policy gallery | Check | **Take Z** (Indian templates: CL, SL, EL, maternity per Act) |
| D3 | Experience levels | — | "Add new level" by years of service | Check | **Take Z** if missing |
| D4 | Accrual, carry forward, encash | — | Yes | Accrual, carry forward and encashment (TIM-24) exist | **Keep ours** |
| D5 | Sandwich rule | — | Yes, per policy and organisation-wide | Exists | **Keep ours** |
| D6 | Cannot combine with | — | "Clubbing" | Barely found | **Take Z** |
| D7 | Units | — | Full, half, quarter day, hourly | Half and quarter found | **Keep ours**; add hourly if B4 is built |
| D8 | Request limits | — | Min / max per request, max consecutive, gap between, per week or month, notice, only on certain days | Check | **Take Z** for any missing |
| D9 | Comp-off rules | — | Auto from overtime, per weekend and holiday worked, expiry, take now and work later | Comp-off claim (TIM-22) | **Mix:** add auto credit and expiry if missing |
| D10 | Balance correction grid | — | People by leave types, Paid / Unpaid | Check | **Take Z** |
| D11 | Exceptional working days | — | Mark a holiday or weekend as working | Not found | **Take Z** |
| D12 | Cancel and extend rules | — | Who may cancel (self, manager, approver) by period; partial cancel; extend | Withdraw and ask to cancel exist | **Mix:** add partial cancel and extend |
| D13 | Bradford score | — | Optional absence score | Not found | **Skip** for now (rare in India) |
| D14 | Calendar sync | — | Google and Microsoft 365, busy / free per type | Not found | **Take Z**, later |
| D15 | LOP reversal | — | Payroll leave report option | Not found | **Take Z** (needed for Indian payroll corrections) |

## E. Manager

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| E1 | Team today | On leave, not in, on time, late, WFH, remote | — | Being built (Keka ideas) | Being built |
| E2 | Leave approval clash check | "No teammates on leave on this day" | — | Already live: TIM-19 manager view shows who else is off (gap audit) | **Keep ours** |
| E3 | Leaderboards and negligence | Top 5 on time, hours, overtime; late, least hours, breaks | — | Weekly stat cards | **Take K**, later (sensitive: show to managers only) |

## Suggested order to build

1. **Must for Indian daily use:**
   - C2 full leave history;
   - A1 / A2 list view and day panel;
   - A3 requests tab;
   - B4 hourly permission;
   - D11 exceptional working days;
   - D15 LOP reversal;
   - E2 clash check.
2. **Rules depth:** D2 policy gallery, D3 experience levels, D6 clubbing, D8 request limits, D9 comp-off auto credit, D10 balance grid, D12 partial cancel and extend.
3. **Later:** A5 stats, C3 charts, D14 calendar sync, E3 leaderboards.
