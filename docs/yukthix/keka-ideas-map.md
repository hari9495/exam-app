# Keka ideas, built in our own design (branch `feat/yukthix-keka-ideas`, 17 Nov 2026)

Seven ideas from the Keka notes (`reference/competitor-notes/keka-map.md`). For each one we first checked what YukthiX
already had, then filled only the gap. Keka's screenshots were used for layout only and stay in the git-ignored folder.
Nothing uses Keka's look or wording.

## 1. Search that starts actions

**Already there.** Ctrl K listed Apply leave, Approve requests and New expense claim, each only for people who may do it
(`apps/web/lib/yx-palette.ts`).

**Added.** Each new action shows only to people who may do it, and opens the sheet its page already has:
- Regularise a day (`?request=regularise`);
- Request work from home (`?request=wfh`);
- Add an expense (item 4, `?save=1`);
- Raise a ticket (`/yx/desk/help?new=1`).

The PLT-20 design sample lists the new actions too.

## 2. Approvals grouped by kind with counts

**Already there.** PLT-04 had tabs and a Type filter.

**Added.** A row of kinds with counts above the list ("All · 7", "Leave · 2", "Expense · 2", and so on). It filters the
current tab and appears only when more than one kind is waiting. It is a pick-one control (one kind or all), so it uses
the joined Segment, not chips.

## 3. "My team today" for managers

**Already there.** The manager Home had a one-line "Team today" from the muster. For HR that line covered everyone in
their scope, not only their team.

**Added.** `GET /time/team-today` returns my direct reports today (my record as their manager on today's job). It
respects record visibility, and returns nobody while I act for someone else. Each person has one state, from the day
engine, approved leave and approved work-from-home or on-duty requests.

The Home card "My team today" shows a count per group, and picking a group shows who is in it:
- on leave;
- not in yet (with Nudge);
- late (with the minutes);
- working from home or on duty.

The weekly late check-ins card stays as it was.

## 4. Expenses saved first, claimed later

**Checked first.** The expenses design map and its founder answers have nothing against it. "Save draft" and the
company-card draft lines are separate and stay as they are.

**Added.**
- A new table `expense_items`: forced row-level security, `tenant_isolation`, and no deletes by the app.
- Routes:
  - `GET /expenses/me/items`;
  - `POST /expenses/me/items` (amount, date, where, what for, an optional receipt);
  - `POST /expenses/me/items/:id/remove`;
  - `POST /expenses/claims/:id/items`, which picks saved spends into my draft claim. Each becomes a line, its receipt
    moves with it, and it leaves the saved list.
- The same receipt is never saved or claimed twice.
- On Expenses home, a new "Expenses to be claimed" card, with "Add an expense" and "Claim selected". The selected ones
  go into a new claim or a draft claim.
- Migration `202617z0000361_expense_items` (no data written).

## 5. Profile edits that need approval

**Already there, and works end to end.** Me › Change requests (PPL-32), where HR decides on People › Identity and bank
changes with a fresh second factor.

**Gap fixed.** These changes never reached the approvals inbox, which shows only approvals-engine tasks. Pending changes
someone else raised now show there for holders of `employee.identity.approve`, under their own kind "Profile change".
Each row opens the change page to decide, because the decision needs the second factor, the proof and the cooling
period.

## 6. Time summary on the timesheet

**Added.**
- `GET /time/me/timesheet/summary?year=` returns my weeks of a year with hours and status.
- A "Time summary" tab on My timesheet: a bar per week (the kit's BarChart, one series), the year's total and how many
  weeks were approved, then the weeks with hours and status. A week opens in the grid.
- The design sample has the tab too.

## 7. Payslips: months on the left, the payslip on the right

**Added.** On desk, PAY-21 has a tax-year picker (when there is more than one year) and the months of that year on the
left, with net pay. The selected payslip, its PDF and the query actions are on the right. The phone keeps its earlier
list. The design sample and the live page match.

## Tests

- e2e `keka-ideas` (8).
- API units `team-today` and `derive-entry-exam-results`.
- Kit:
  - inbox kinds (2);
  - payslip months (2);
  - time summary (2);
  - team today (1);
  - saved expenses (3).
- Web:
  - palette;
  - approvals profile rows (2);
  - home `teamTodayCard`.

Manual tests: MT-KEKA-1 to MT-KEKA-3.

## Questions (from 2251)

2251. **Add to a claim from the claim page.** Saved expenses are picked from Expenses home (into a new or a draft
      claim). *Suggested: also an "Add saved expenses" button in the claim's add-a-line sheet, next.*
2252. **Reading the receipt of a saved expense.** A saved receipt is not read (amount, date) until it is in a claim.
      *Suggested: read it when saved, to fill the amount and date, as a claim's receipt is.*
2253. **Team today for a manager's whole line.** Built for direct reports only (as the brief says). *Suggested: keep;
      a "whole reporting line" switch only if managers of managers ask.*
2254. **Profile changes decided in the inbox.** They open their own page (second factor, proof, cooling period).
      *Suggested: keep.*
2255. **Time summary download.** Keka offers a download of the weeks. *Suggested: a CSV of the weeks next, if asked.*
