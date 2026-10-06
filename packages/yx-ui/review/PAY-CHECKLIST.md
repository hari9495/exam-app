# Payroll review checklist

Every reviewer works through EVERY item for EVERY story of their screen and records pass or fail. Founder rules R1–R11 are in RULES.md and apply in full. A failure is a problem to report, whatever its size: the founder wants nothing skipped.

## A. Every story, every width (1440, 871, 390)
1. Nothing cut off, clipped, overlapping or pushed past an edge (buttons in drawer and dialog footers included).
2. No sideways scroll unless a wide table truly can't fit (R5).
3. No crowded cards (R10); row buttons in a table are equal width (R9).
4. No sticky or floating bars (R8).

## B. Every button and control
5. Read its onClick / href in code. It must do something visible (state change, alert, dialog, link to the right story with the right filter).
6. Text buttons have a border (R2). Approve is green, Review is blue (R7).
7. Blocked actions are disabled with the reason beside them.
8. Pick-one = Segment control (a dropdown on phones). Toggles = check-chips (R11).
9. Destructive or money-moving actions (lock, release bank file, publish, pay) ask to confirm and say exactly what happens.

## C. Numbers and money (most important in Payroll)
10. Every total adds up: gross = sum of earnings; net = gross − deductions; table footers = sum of rows; KPIs = counts in the list below them.
11. Statutory amounts follow Indian rules as of Sep 2026:
    - PF: 12% employee + 12% employer of PF wage, wage capped at Rs 15,000 unless the company opts for actual. EPS 8.33% of capped wage.
    - ESI: only if gross ≤ Rs 21,000; 0.75% employee, 3.25% employer.
    - Professional tax: per state (Tamil Nadu half-yearly slab, Karnataka Rs 200/month above Rs 25,000).
    - TDS: matches the chosen regime; new regime is the default.
    - LOP reduces pay by days / days-in-month as the screen's own rule says.
12. Indian number format (Rs 1,23,456), the same rounding everywhere.
13. The same person, amount, date or count is identical on every screen (pay-data.ts, Time and People data). Check at least one cross-screen value per story.
14. Dates agree with today 29 Sep 2026 and the September 2026 run (cut-off, lock, pay day, 'in N days' badges).

## D. Access and privacy
15. Pay is visible only to people allowed to see it (R1): an employee sees only their own pay; a manager sees no salaries unless the screen is for that.
16. Manager views show only the manager's own reports.
17. Only fictional data (R3).

## E. Words
18. Plain words, no jargon, no AI-style filler (R6). Every alert that asks for action carries its button.
19. Empty, loading and error states exist where the screen loads data, and say what to do next.

## Reporting
Report EVERY failure, no limit: title, evidence (screenshot name or file:line), rule (checklist number or R-number), the exact fix, severity (high = wrong money, privacy, broken action or crash; medium = misleading or blocked flow; low = polish), and scope (screen or shared-component).
