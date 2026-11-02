# Performance design map: PRF-07 to PRF-12 (builder 2 notes)

For the lead to copy into `performance-design-map.md` (builder 1 owns that file). Branch `feat/yukthix-perf-2`.
Every live page below renders the approved design component with a `live` prop; the stand-in "Live · …" copies it
replaced are deleted with their stories. Status words: **live**, **live (gap)** + why, **feature not built** + why.

Phone stories: the designs have phone variants (`device="phone"`). The live pages render the desktop layout, which
reflows at phone width; the phone frame (bottom tabs, pinned buttons) is not wired. Marked "live (gap): phone view".

## PRF-07 · 360° nominations

Page: `/yx/performance/reviews/[id]/nominations` (new). API: `GET reviews/:id/nominations`, `GET reviews/:id/nominee-options`,
`POST reviews/:id/nominations`, `POST nominations/:id/approve|decline|withdraw`, **new** `POST reviews/:id/nominations/send`,
**new** `POST reviews/:id/nominations/approve-all` (service checks: the employee sends their own, the manager approves;
min and max of the cycle; the window). Migration `20261450000200_review_nominations_sent`.

| Story | Status | Note |
|---|---|---|
| Employee · nominate | live | Names searched on the server; blocked pairs, oneself and the manager never offered. |
| Employee · below minimum | live | The button is never disabled; pressed, it shows "Nominate at least N reviewers. You have M." |
| Employee · sent for approval | live | The manager is told once, when the list is sent (no longer once per name). |
| Manager · approve list | live | Approve one, remove a proposal, or approve the whole list (invites everyone). |
| Employee · phone / Manager · phone | live (gap): phone view | |
| Empty | live | |
| Error | live | New story. |

Gap: the review page (PRF-05, builder 1) still shows the old `PeerPanel` with its own nomination list. Builder 1's
review workspace should link "Nominate reviewers" to this page and drop the nomination part of PeerPanel (the 360°
results part stays). Notifications already link here.

## PRF-08 · Quick feedback

Page: `/yx/performance/feedback`. API: `GET feedback?view=received|given|team`, `GET feedback/employee/:id`
(perf.concern.seal), `POST feedback`, `POST feedback/:id/withdraw|seal`, `GET|POST feedback-requests`,
`POST feedback-requests/:id/decline`, **new** `GET feedback/goal-options/:employeeId` (only goals the giver may see:
manager chain or perf.goal.view in scope). Visibility "Them, their manager and HR" is new (`with_hr`); the default is
the company setting `perf.feedback.default_visibility` (default "them and their manager"). Migration `20261450000000_perf_designs_b2`.

| Story | Status | Note |
|---|---|---|
| Received | live | Linked goal shows by title; a sealed item shows "Removed by HR". |
| Give feedback sheet | live | Type is now the Segment (pick-one). A line links to the confidential concern channel. |
| Sent confirmation | live | Now a toast (founder rule), not an inline alert. |
| Requests to me | live | Give feedback answers the request; Decline added. |
| Phone / Phone · give feedback | live (gap): phone view | |
| Empty | live | |
| Ask for feedback sheet | live | New story (the button had no design). |
| Manager · my team | live | New story: the stand-in's team view, now in the design. |
| HR · concerns and sealing / HR · seal a concern | live | New stories: the stand-in's concern view, now in the design. |
| Error | live | New story. |

## PRF-09 · Calibration board and 9-box

Page: `/yx/performance/calibrations/[id]`. API: `GET calibrations/:id`, `POST calibrations/:id/changes`,
`POST calibrations/:id/sign-off`, **new** `POST calibrations/:id/potential` (perf.calibration.facilitate; facilitator
only; reason; audited `perf.calibration.potential`). Migration adds `reviews.potential` (1–3).

| Story | Status | Note |
|---|---|---|
| HR · ratings board with guide | live | Columns are the cycle's bands (3–6, CSS added); the chart uses the server's shares; no chart for a small group. |
| HR · change rating with reason | live | Moves to a band (the server takes the band's middle score). |
| Manager · own team movable | live (gap) | The API keeps the rule "only the facilitator changes ratings" (YX-PERF-08), so managers look only. Question 2. |
| 9-box (wave 6) | live | Potential is changed on the 9-box; performance is changed on the board. Empty potential shows as medium. |
| Changes log | live | Band and score, reason, who, when. |
| Empty | live | |
| HR · close calibration / Error | live | New stories. |

Gap: the sessions list (`CalibrationListScreen`) and the cycle's `CalibrationSessions` have no design; they stay live
copies (story "Calibration · Sessions list" and "Live · Calibration" with Sessions and Reports).

## PRF-10 · Comp review sheet

Page: `/yx/performance/comp/[id]`. API: `GET comp-cycles/:id/sheet` (now with grade, department, review score, and
`belowPeers` for HR and finance only), `PUT comp-proposals/:id`, `POST comp-cycles/:id/submit`, `PUT …/budgets`,
`POST …/open`, `POST …/apply` (step-up), `GET …/pay-equity` (HR and finance), **new** `POST comp-cycles/:id/decide`
(whoever holds an open approval task of the cycle: the manager's manager, HR, finance; checked by the service).

| Story | Status | Note |
|---|---|---|
| Manager · proposals with out-of-range row | live | Range and checks from the server's matrix cell, prorated. |
| Manager · justification for out-of-range | live | Now a proposal drawer: merit, promotion, bonus, justification (needed outside the range or with a promotion). |
| HR · approve with pay-equity panel | live | Gap by gender, grade or location (Segment); small groups suppressed. |
| Finance · over budget | live | |
| No market data | live | Always shown today: no benchmark source yet ("provider: to decide"). |
| Stale market data | feature not built | No market data source yet. |
| Manager · proposal with promotion and bonus, HR · set a department budget, HR · send back, HR · apply | live | New stories (the stand-in's HR steps, now in the design). |

Pay access: a manager never gets pay-gap figures nor who is below the median (it compares pay outside their team);
the card says so. Every manager read of team pay stays audited.

Gap: the comp cycles list (`CompCyclesScreen`) has no design and stays a live copy.

## PRF-11 · 1:1s

Pages: `/yx/performance/one-on-ones` and `/yx/performance/one-on-ones/[id]` (same screen, that 1:1 open in the
drawer). API: `GET one-on-ones` (now one row per pair: next, last held, rhythm, counts, the other person's role),
`POST one-on-ones` (now with `cadenceDays` 7/14/30), `PUT one-on-ones/:id` (held plans the next one on its rhythm and
moves open actions; past dates refused; held and rescheduled audited), agenda, private note, actions (the view now
lists the employee's goals for linking). Company setting `perf.one_on_one.cadence_days` (default 14).

| Story | Status | Note |
|---|---|---|
| Manager · list | live | |
| Manager · 1:1 record | live | Notes save when you leave the box (toast). Private notes stay with their author. |
| Employee · 1:1 record | live | |
| Employee · phone | live (gap): phone view | |
| Empty / Loading | live | |
| Manager · schedule 1:1, add action item, reschedule | live | New stories (the buttons had no design). |

Not wired: the suggested agenda (PRF-16, builder 3).

## PRF-12 · PIP record

Page: `/yx/performance/pips/[id]`. API: `GET pips/:id` (now with the approval route, `extendDays`, check-in ratings),
`POST pips/:id/acknowledge`, `POST pips/:id/checkins` (now with a rating), `POST …/outcome`, `POST …/letter`,
`POST …/start-exit`, **new** `POST pips/:id/decide` (perf.pip.manage; only HR whose approval task it is).
Company setting `perf.pip.extend_days` (default 30). Migration `20261450000100_pip_checkin_rating`.

| Story | Status | Note |
|---|---|---|
| Manager · active plan | live | "Download PIP letter" hidden: HR issues the letter; it is in the person's documents. |
| Manager · check-ins | live | Check-ins come from the plan's own schedule (protected leave moves the end). |
| HR · approve proposed plan | live | Approve and start, or send back with a reason, from the plan. |
| Manager · record outcome | live (gap) | Only HR records the outcome (API rule, YX-PERF-11). |
| HR · not met (next step is manual) | live (gap) | "Extend plan" is hidden after not met (a plan is extended once, while it runs). Exit case: dialog with last day and reason. |
| Employee · acknowledge | live | Plus "Add my note" on a held check-in. "Ask HR a question" goes to the Help centre. |
| Employee · acknowledge on phone | live (gap): phone view | |
| Manager · record check-in, HR · send back, HR · open exit case | live | New stories. |

Gap: the plans list (`PipsScreen`, with Propose) has no design and stays a live copy.

## Stand-ins removed

`Live · Feedback and 1:1s` (FeedbackScreen, OneOnOnesScreen, OneOnOneScreen: file deleted), `PipScreen`,
`CalibrationBoardScreen`, `CompSheetScreen` (their stories and tests removed or trimmed). Guard lists shrank by 12.

Still live copies with no design (need a design story before they can change): PipsScreen, CompCyclesScreen,
CalibrationListScreen and CalibrationSessions, PerformanceReportsScreen, FeedbackTasksScreen, PeerFormScreen,
ReviewerBlocksScreen, PeerSetup, PeerPanel.

## Questions (safe default built)

1. HR seeing "them, their manager and HR" feedback: today HR read it only through the Concerns view (perf.concern.seal).
   Suggested: also show it to perf.review.view in scope on the person's Performance tab (PPL-03).
2. Managers moving their own team in calibration: built as facilitator only (audit trail clear). Suggested: keep.
3. PIP outcome by the manager: built as HR only. Suggested: keep; the manager proposes the outcome in a check-in note.
4. Market data for comp: no source. Suggested: a salary-survey upload (CSV) per grade first, a provider later.
5. 9-box potential: set by the facilitator in calibration. Suggested: also let the manager propose it in the manager review (PRF-05).
