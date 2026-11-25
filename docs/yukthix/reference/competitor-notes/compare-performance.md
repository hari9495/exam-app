# Compare: performance (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Me › Performance, My Team › Performance, Performance menu) and `keka-map.md`;
- `zoho-pages.md` (Performance "Getting started" and LMS; the module was off, so few Zoho cells);
- YukthiX code on `test/yukthix-main` (PRF-01 to PRF-17, growth and learning screens), plus `gap-audit.md`
  (K11, K12, K19, K21, K22).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Goals (KRAs)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Goal lists | Mine, department, company; timeframe; type, status, tag filters | Review methods: KRA, goals | Has: PRF-02 `/yx/performance/goals` mine, team, person, company by period | **Keep ours** |
| A2 | Progress summary | Average % and coloured status pills with counts | — | Partly: progress and on track / at risk per goal; no roll-up (unsure) | **Take K:** average and status pills on top |
| A3 | Add a goal | Three-step drawer, templates, import, "include in review" tick | — | Partly: one form, align to a parent, cascade; no templates or import | **Mix:** keep our one-page form; add Keka's templates and import |
| A4 | Manager insights | People without goals with Remind; goals not updated; per-person table | — | Partly: team table and the coach card; no "without goals" list | **Take K:** "no goals" and "not updated" with Remind |
| A5 | Alignment | Unaligned count | — | Has: PRF-03 goal map | **Keep ours** |

## B. Conversations

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | 1:1 meetings | Schedule form (place, calendar sync, repeat), agenda templates, action items across meetings | — | Partly: PRF-11 agenda, actions, private notes, rhythm, suggested agenda; no templates or calendar sync | **Mix:** keep ours; add agenda templates and calendar sync |
| B2 | Feedback | Five tabs; quick-actions rail; private notes about a person | — | Partly: PRF-08 received, given, team; praise or suggestion; ask; notes only inside 1:1s | **Take K:** quick-actions rail and private notes on a person |
| B3 | Continuous coaching | — | "Continuous" review type | Partly: PRF-16 coach (fixed rules); PRF-17 AI review assistant | **Keep ours** (neither has it) |

## C. Reviews and pay

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | My reviews | Active and completed; given to others; read-only completed form | Self, multi-rater, manager | Has: PRF-05 workspace, PRF-06 read-only acknowledgement | **Keep ours** |
| C2 | Cycles, 360, calibration | Cycle list per manager | Rating and normalisation set-up | Has: PRF-04 cycles, PRF-07 nominations, PRF-09 calibration with 9-box; no forced distribution (unsure) | **Keep ours**; add an optional bell-curve guide as a company setting |
| C3 | Rating disputes | — | — | Has: PRF-15 | **Keep ours** (neither has it) |
| C4 | PIP | In process, completed, approval requests | — | Has: PRF-12 `/yx/performance/pips/[id]` | **Keep ours** |
| C5 | Salary and promotion | Pending / finalised, tied to rating | Revision templates | Has: PRF-10 rating-to-raise grid, pay equity, market data | **Keep ours** |
| C6 | Reports | Review, 1:1, feedback, goal, skill reports | — | Has: five reports with CSV (`/yx/performance/reports`) | **Keep ours**; joins the reports library later |

## D. Skills and growth

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| D1 | My skills | Stat cards; table with rating, certificates, experience; update requests | Skill set inside Performance | Partly: company skills library live; skills profile designed only | **Take K:** make our drawn skills profile live |
| D2 | Team skills matrix | Group by skill, skill gap, bulk ratings | — | Designed only | **Take K**, through our drawn matrix |
| D3 | Competencies and core values | Read-only page per job: weight, behaviours; core values | Competency review method | Partly: PRF-14 live for HR; values only inside review forms | **Take K:** an employee "What is expected of me" page |
| D4 | Learning | — | Courses, plans, catalog, course requests, notes | Designed only: LRN-01 to LRN-16 | **Take Z**, later (mandatory courses such as POSH awareness first) |

## Suggested order to build

1. **Must for daily use:**
   - A4 "no goals" list with Remind (S);
   - A2 progress summary (S);
   - B2 quick actions and private notes (S).
2. **Depth:**
   - D3 expectations page (M);
   - D1 / D2 skills profile and matrix live (L);
   - B1 agenda templates and calendar sync (M);
   - A3 goal templates and import (M);
   - C2 bell-curve guide (S).
3. **Later:** D4 learning (L).
