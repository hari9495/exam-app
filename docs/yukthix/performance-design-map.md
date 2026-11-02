# Performance: live pages and their designs (check)

This file checks, story by story, that every Performance design sub-page can be reached in the live app. People, Pay and
Time were checked the same way (see `people-design-map.md`, `pay-design-map.md`, `time-design-map.md`). Founder rule:
never build a second, simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-perf-1`, from `test/yukthix-main`, performance builder 1): PRF-01 to PRF-06 are
live. The live pages render the designed screens (`PerformanceHomeScreen`, `MyGoalsScreen`, `CompanyGoalMapScreen`,
`CycleSetupScreen`, `CycleControlRoomScreen`, `ReviewWorkspaceScreen`, `ReviewAcknowledgeScreen`) with a `live` prop, and
the seven stand-in copies they replace are deleted (GoalsScreen, GoalScreen, GoalMapScreen, ReviewCyclesScreen,
CycleScreen, ReviewScreen, PeerSetup) with their stories and tests. PRF-07 to PRF-17 are for builders 2 and 3; they are
mapped here in full.

Verdicts (the same words as People): **live** (the live page renders the designed screen and can reach this state; the
note says how) · **live (gap)** (the design is live, but this state can't be fully reached yet; the note says why) ·
**wire design** (a live page exists for this job but renders something else) · **design only, feature not built** (no
API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Goals and reviews (PRF-01 … 06, builder 1) | 6 | 51 | 10 | 0 | 0 | 0 | 61 |
| B. Feedback, calibration, pay, plans and help (PRF-07 … 17) | 11 | 2 | 0 | 43 | 19 | 0 | 64 |
| **All PRF groups (A–B)** | **17** | **53** | **10** | **43** | **19** | **0** | **125** |
| C. Shared parts (Kit · Growth building blocks, Calibration · Sessions list) | 2 | 12 | 0 | 0 | 8 | 0 | 20 |

Counted by script (3 Nov 2026, branch `feat/yukthix-perf-1`; the script is in the appendix): every `export const` story in
the 17 `prf-NN.stories.tsx` files and the two shared story files, against the rows in section 4. The script fails unless
each story file has exactly one row per story, in file order, and every verdict is one of the five words. PRF-01 … 06 had
40 stories; this branch adds 21 design stories for states only the real record has (sending goals, the manager's
decision, the goal form, dropping a goal, periods, suggesting a parent, the cycle draft and its count, who is reviewed,
disagreements, the skip-level, HR's reopen, a former manager's input, the released review). The kit gains one story
(the company's own rating scale and band). The lead's figure of 107 PRF stories counted multi-line story entries
differently; the script counts 104 before this branch (40 + 64).

The design-live guard (`packages/yx-ui/src/design-live-guard.known.json`) shrinks by 14 lines: `liveCopies` loses
performance: CycleScreen, GoalMapScreen, GoalScreen, GoalsScreen, PeerSetup, ReviewCyclesScreen, ReviewScreen;
`notLive` loses growth: CompanyGoalMapScreen, CycleControlRoomScreen, CycleSetupScreen, MyGoalsScreen,
PerformanceHomeScreen, ReviewAcknowledgeScreen, ReviewWorkspaceScreen.

## How it is wired (same as People, Pay and Time)

- The designed screen takes a `live` prop: `'live' in props ? <LiveX live={props.live} /> : <SampleX {...props} />`.
  Stories keep the sample; the app passes `live` with real data, `state`, `onRetry` and the actions. The live parts are
  in `packages/yx-ui/src/screens/growth/perf-goals-live.tsx` and `perf-reviews-live.tsx`; API shapes and the mapping to
  the designs' shapes in `perf-live-data.ts`; the stories' live sample data in `perf-live-samples.ts`.
- Kit first (rule 18): the growth kit gained the server's progress on goals and key results (`progress`, used as is),
  `RatingScale levels` (the company's own scale), `ScoreBand band` (the server's band label) and `reviewStages` (the
  stages a review goes through, unit-tested). The design's check-in sheet now saves through a promise (busy button, the
  server's refusal inside the sheet) and takes "how far" for a goal without key results.
- The UI rules guard now also covers the two live files (no disabled buttons, no success alerts).
- Every success is a toast; refusals stay in the dialog or drawer; confirm buttons are never disabled (pressed too early
  they show the field error and focus the field). Pick-one choices (whose goal, kind of goal, outcome, stage) use Segment.

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/performance | `PerformanceHomeScreen` live (employee, manager or HR home; phone layout under 768 px) | PRF-01 | `GET performance/home` (implicit: own, team through the chain; HR part needs `perf.cycle.manage` company-wide; PIP count needs `perf.pip.manage`); `POST goals/:id/checkins` | live |
| /yx/performance/goals (?employee=, ?goal=) | `MyGoalsScreen` live: my goals, or a team member's as their manager; goal drawer; check-in; goal form; send; approve / send back; suggest; cascade; drop | PRF-02 | `GET goal-periods`, `GET goals?view=mine/employee/company` (now with key results, confidence, last check-in, `canDecide`), `GET goals/align-options`, `GET goals/:id`, `POST goals`, `PUT goals/:id`, `POST goals/submit`, `POST goals/decide` (new; the approval task's holder only), `POST goals/:id/checkins`, `/drop`, `/cascade` (all implicit; the service decides per goal) | live |
| /yx/performance/goals/[id] | redirects to /yx/performance/goals?goal=[id] (links in notifications) | PRF-02 | — | live |
| /yx/performance/goal-map | `CompanyGoalMapScreen` live: department filter, export (CSV), add company or team goal, add period, suggest a parent | PRF-03 | `GET goal-map` (`perf.goal.view`; now with confidence and department), `POST goals` and `POST goal-periods` (`perf.goal.manage`), `POST goals/:id/suggest-parent` (new, `perf.goal.manage`) | live |
| /yx/performance/cycles | redirects to the HR home's "Review cycles" | PRF-01 | — | live |
| /yx/performance/cycles/new, /cycles/[id] (draft) | `CycleSetupScreen` live (4 steps + review and launch; 360° set-up inside the stages step) | PRF-04 | `GET cycle-templates`, `POST/PUT cycles`, `PUT/DELETE cycles/:id/peer-feedback`, `POST cycles/:id/preflight`, `POST cycles/:id/launch` (all `perf.cycle.manage`) | live |
| /yx/performance/cycles/[id] (running) | `CycleControlRoomScreen` live: funnel with names, overdue by owner, reminders, extend a deadline, release; tabs Who is reviewed, Disagreements, Calibration (`CalibrationSessions`) | PRF-04 | `GET cycles/:id/funnel`, `GET cycles/:id/funnel/people` (new), `GET cycles/:id/overdue` (new), `POST cycles/:id/remind` (new, throttled), `POST cycles/:id/extend` (new, versioned), `POST cycles/:id/release`, `GET cycles/:id/eligibility`, `PUT eligibility/:id`, `GET cycles/:id/disagreements`, `POST disagreements/:id/decide`, calibration routes (all `perf.cycle.manage`) | live |
| /yx/performance/reviews/[id] | employee after release: `ReviewAcknowledgeScreen` live; everyone else: `ReviewWorkspaceScreen` live (self, manager, former manager, skip-level, chain, HR) | PRF-05, PRF-06 | `GET reviews/:id` (now with section scores), `PUT/POST reviews/:id/entries/self|manager|other[/submit]`, `POST reviews/:id/skip/agree`, `/send-back`, `/reopen` (`perf.cycle.manage`), `/other-reviewers` (`perf.cycle.manage`), `POST reviews/:id/acknowledge` (now takes `disagreement`, both in one step), `/disagree`, peer routes | live |

## 2. Live Performance pages with no design (or a stand-in copy still)

| page | what it renders | why it stays | suggestion |
|---|---|---|---|
| /yx/performance/reviews | `ReviewsScreen` (live copy): my reviews, my team's, in my scope, and hand-overs | no PRF design is a review list; hand-overs are PRF-13 (builder 3) | when PRF-13 is live, retire the list: the home (actions, team table) and the control room (names behind a stage) already open every review |
| /yx/performance/reviews/[id], 360° panel | `PeerPanel` (live copy) inside the PRF-05 workspace, nominations only (the grouped answers are now the design's peer card) | PRF-07 nominations is builder 2's | builder 2 wires `NominationsScreen` and removes `PeerPanel` |
| /yx/performance/feedback, feedback-tasks, one-on-ones, calibrations/[id], comp, pips, reviewer-blocks, reports, /yx/settings/performance | live copies (see section 4 B) | PRF-07 … 17 are builders 2 and 3 | — |

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| PRF-01 / PRF-16 coach card | the manager coach (nudges from feedback, 1:1s, overtime, goals; an AI wording step with names hidden) | L |
| PRF-01 HR stat cards' "last week / last period" | a daily snapshot of the figures (overdue stages, aligned %) | S |
| PRF-05 kudos card | Engage recognition (kudos) | L (Engage) |
| PRF-05 / PRF-06 "Download PDF" | a review PDF (the letters engine can render it) | M |
| PRF-09 9-box | a potential rating per person and the 9-box placement | M |
| PRF-10 market data | a salary benchmark source (provider: to decide) | M |
| PRF-13 HR decisions | an HR view of hand-overs needing a decision | S |
| PRF-15 escalation, legal hold, evidence export | escalation past HR's answer, a legal hold on the record, an evidence bundle | L |
| PRF-16 suggested agenda | agenda suggestions from goals, feedback and open actions | M |
| PRF-17 review assistant and bias check | AI drafting and wording checks (provider: to decide), a company switch | L |

## 4. Design groups, story by story

### A. Goals and reviews (PRF-01 … 06)

#### PRF-01 · Performance home

Live page: /yx/performance (menu Performance › Performance home). `GET performance/home` decides the role: HR who run
cycles company-wide, a manager with direct reports today, or an employee.

| story (sub-page) | verdict | note |
|---|---|---|
| Employee · Employee | live | as an employee: needs-action list (self review, acknowledgement, feedback asked of you), review stages, my goals with check-in, next 1:1, feedback received |
| Manager · Manager | live (gap) | team table (goal progress, review stage, last 1:1, my last feedback; Review and Goals links) and team goals tree; the coach card is PRF-16, not built, so the table takes the full width |
| HrAdmin · HR admin | live (gap) | cycles with done / eligible / overdue, overdue stages, PIPs (with `perf.pip.manage`), goals aligned %, last released bands by department; the stat cards have no "last week / last period" comparison (no history kept) |
| EmployeePhone · Employee · phone | live | page width under 768 px |
| ManagerPhone · Manager · phone | live (gap) | under 768 px; no coach card (PRF-16) |
| NoCycleRunning · HR · empty (no cycle) | live | first use: nothing to do, no goals, no cycle; "Start a review cycle" opens /cycles/new |
| Loading · Loading | live | while GET performance/home loads |
| Failed · Error | live | GET performance/home fails; Retry refetches |

#### PRF-02 · My goals and check-in

Live page: /yx/performance/goals (menu Performance › Goals); a manager opens a report's goals from the home (team table
"Goals", or the "Goals" action) at ?employee=.

| story (sub-page) | verdict | note |
|---|---|---|
| GoalTree · Employee · goal tree | live | my goals of the open period; key results with the server's progress |
| GoalOpen · Employee · goal panel with alignment | live | open a goal (?goal=); the drawer loads GET goals/:id: chain, key results, aligned goals, check-ins |
| CheckIn · Employee · check-in sheet | live | an approved goal's Check in; saves POST goals/:id/checkins, toast |
| ManagerApproval · Manager · approve goals (weights 90%) | live | ?employee= with goals sent to me (`canDecide`); Approve goals says why when weights are not 100% and sends nothing |
| Phone · Employee · phone | live | under 768 px |
| PhoneCheckIn · Employee · phone check-in | live | under 768 px, bottom sheet |
| Empty · Empty | live | no goals in the period (or no period yet: "No goal periods yet") |
| Loading · Loading | live | while periods and goals load |
| DraftsToSend · Employee · drafts to send to the manager | live | draft goals show "Send to my manager" |
| SendConfirm · Employee · send goals to the manager (confirm) | live | POST goals/submit; toast "Goals sent" |
| AddGoal · Employee · add goal form | live | POST goals; refused until it has a title, a weight and a key result past its start |
| AlignGoal · Employee · align to a goal (choose which) | live | the chosen goal's form opens with "Aligned to" |
| DraftOpen · Employee · draft goal panel (edit, drop) | live | the API's `can` decides the buttons (edit, ask to change, cascade, drop) |
| DropGoal · Employee · drop goal with a reason | live | POST goals/:id/drop, reason of 3+ characters |
| ManagerSendBack · Manager · send back with what to change | live | POST goals/decide send_back; reason of 3+ characters |
| ManagerSuggest · Manager · suggest a goal (cascade) | live | POST goals/:id/cascade to the person |
| CheckInByHand · Employee · check-in, goal without key results | live | the sheet asks "How far is this goal?" (0–100); the API refuses a typed figure when key results exist |

#### PRF-03 · Company goal map

Live page: /yx/performance/goal-map (menu Performance › Goal map, `perf.goal.view`).

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · goal map | live | as HR with `perf.goal.manage`; department filter keeps the goals above, Export saves a CSV |
| Empty · Empty (no company goals) | live | a period with no goals |
| Loading · Loading | live | while the map loads |
| Failed · Error | live | GET goal-map fails; Retry |
| Leadership · Leadership · read-only map | live | `perf.goal.view` without `perf.goal.manage`: no add, period or suggest buttons |
| AddCompanyGoal · HR · add company or team goal | live | Segment Company / A team; POST goals |
| AddPeriod · HR · add a goal period | live | POST goal-periods |
| DepartmentFilter · HR · unaligned goal to suggest a parent for | live | POST goals/:id/suggest-parent; the owner is notified |
| LeadershipLive · Leadership · read-only, no goals yet | live | a period with no goals, read-only |

#### PRF-04 · Cycle set-up and control room

Live pages: /yx/performance/cycles/new and a draft at /cycles/[id] (set-up); a running cycle at /cycles/[id] (control
room). HR with `perf.cycle.manage` company-wide.

| story (sub-page) | verdict | note |
|---|---|---|
| SetupBasics · Set-up · basics | live | name, type, period |
| SetupPopulation · Set-up · population and eligibility | live (gap) | departments, joining cut-off, leavers; the design's "Mid-cycle joiners" and "Transfers" choices are fixed rules in the API (months served; current manager with the earlier one's input), shown as text (Q2) |
| SetupTemplate · Set-up · template and scale | live (gap) | an active template of the type; weights, half points and the scale belong to the template (Settings › Performance), shown as a note, not edited per cycle (Q3) |
| SetupStages · Set-up · stages and deadlines | live (gap) | self, 360°, manager, skip-level with due days (the design shows "days"); calibration sessions are set up after launch; acknowledgement shows the company's disagreement window |
| ControlRoom · Control room · clickable funnel | live | GET cycles/:id/funnel and overdue |
| FunnelDrill · Control room · names behind a stage | live | GET cycles/:id/funnel/people; Open goes to the review |
| Loading · Loading | live | while the cycle loads |
| SetupDraft · Set-up · a draft with 360° feedback | live | PUT cycles/:id and PUT cycles/:id/peer-feedback |
| SetupCount · Set-up · count who is included | live | saves the draft, then POST cycles/:id/preflight |
| WhoIsReviewed · Control room · who is reviewed (include, leave out) | live | PUT eligibility/:id with a reason |
| Disagreements · Control room · disagreements to answer | live | POST disagreements/:id/decide |
| NamesBehindStage · Control room · names behind a stage (live) | live | as FunnelDrill, with the owner and due day |

#### PRF-05 · Review workspace

Live page: /yx/performance/reviews/[id] (from the home's actions and team table, or the control room).

| story (sub-page) | verdict | note |
|---|---|---|
| SelfReview · Employee · self review | live (gap) | the template's sections with the company's scale; Save draft and Complete self review; no kudos card (Engage not built) |
| ManagerReview · Manager · manager review with advisory peer panel | live (gap) | the self rating shows under each question once the manager saved a draft; the peer card shows the 360° groups (advisory); no kudos card, no review assistant (PRF-17) |
| SectionExcluded · Section without goals excluded | live | a rated section with no ratings is named and left out (YX-PERF-02) |
| Submitted · Submitted (locked) | live (gap) | locked after submit; "Download PDF" is not built |
| SkipLevel · Skip-level · agree or send back | live | the manager's manager; POST skip/agree or send-back with a reason |
| HrReopen · HR · reopen a finished review | live | POST reviews/:id/reopen with a reason |
| FormerManager · Former manager · advisory input | live | an "other" reviewer added by HR answers the manager's questions |

#### PRF-06 · Review acknowledgement

Live page: /yx/performance/reviews/[id] as the employee once released.

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Acknowledge | live (gap) | released score, band, section scores, the manager's summary; "Download review" is not built |
| Disagree · With disagreement flag | live | the disagreement goes with the acknowledgement in one call (20+ characters) |
| Done · Acknowledged | live | after acknowledging; the rating stays |
| Phone · Phone | live | under 768 px |
| PhoneDisagree · Phone · disagreement | live | under 768 px |
| Live · Released review with section scores | live | GET reviews/:id `sectionScores` |
| LiveDisagree · Disagreement too short (at least 20 characters) | live | refused in the screen and by the API (400) |
| AnsweredByHr · Acknowledged · HR answered the disagreement | live | the disagreement's status and HR's note; "I disagree" stays while the window is open |

### B. Feedback, calibration, pay, plans and help (PRF-07 … 17)

#### PRF-07 · 360° nominations

Live today: `PeerPanel` (live copy) inside /yx/performance/reviews/[id]. API: `GET reviews/:id/nominations`,
`/nominee-options`, `POST reviews/:id/nominations`, `POST nominations/:id/approve|decline|withdraw` (implicit, service decides).

| story (sub-page) | verdict | note |
|---|---|---|
| EmployeeNominates · Employee · nominate | wire design | PeerPanel "Suggest someone" |
| BelowMinimum · Employee · below minimum | wire design | min / max come from the cycle's 360° set-up |
| Sent · Employee · sent for approval | wire design | nomination status "proposed" |
| ManagerApproves · Manager · approve list | wire design | PeerPanel Approve / Decline |
| Phone · Employee · phone | wire design | with the design, under 768 px |
| ManagerPhone · Manager · phone | wire design | with the design, under 768 px |
| Empty · Empty | wire design | "No one asked yet" |

#### PRF-08 · Quick feedback

Live today: `FeedbackScreen`, `FeedbackTasksScreen` (live copies) at /yx/performance/feedback, /feedback-tasks. API:
`GET feedback`, `POST feedback`, requests, withdraw, seal (implicit; seal `perf.concern.seal`).

| story (sub-page) | verdict | note |
|---|---|---|
| Received · Received | wire design | GET feedback?view=received |
| Give · Give feedback sheet | wire design | POST feedback |
| Sent · Sent confirmation | wire design | a toast in the live app |
| Requests · Requests to me | wire design | GET feedback/requests |
| Phone · Phone | wire design | with the design, under 768 px |
| PhoneGive · Phone · give feedback | wire design | with the design, under 768 px |
| Empty · Empty | wire design | nothing received yet |

#### PRF-09 · Calibration board and 9-box

Live today: `CalibrationBoardScreen` (live copy) at /yx/performance/calibrations/[id]. API: calibration board, changes
with reasons, sign-off (`perf.calibration.facilitate`; board implicit for managers).

| story (sub-page) | verdict | note |
|---|---|---|
| HrBoard · HR · ratings board with guide | wire design | board with the distribution guide |
| ChangeWithReason · HR · change rating with reason | wire design | changes need a reason (API) |
| ManagerView · Manager · own team movable | wire design | the board's manager view |
| NineBox · 9-box (wave 6) | design only, feature not built | no potential rating in the API |
| ChangeLog · Changes log | wire design | the board's change list |
| Empty · Empty (no manager ratings yet) | wire design | a session with no rated reviews |

#### PRF-10 · Comp review sheet

Live today: `CompCyclesScreen`, `CompSheetScreen` (live copies) at /yx/performance/comp, /comp/[id]. API: comp cycles,
proposals, budgets, approval, pay equity (`perf.comp.manage`, `perf.comp.approve`; sheet implicit for managers).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerProposes · Manager · proposals with out-of-range row | wire design | proposals against the matrix |
| Justify · Manager · justification for out-of-range | wire design | the API asks for a reason out of range |
| HrApproves · HR · approve with pay-equity panel | wire design | pay equity exists in the API |
| FinanceOverBudget · Finance · over budget | wire design | budget use from the API |
| NoMarketData · No market data | design only, feature not built | no salary benchmark source (provider: to decide) |
| StaleMarketData · Stale market data | design only, feature not built | as above |

#### PRF-11 · 1:1s

Live today: `OneOnOnesScreen`, `OneOnOneScreen` (live copies) at /yx/performance/one-on-ones, /one-on-ones/[id]. API:
1:1 meetings, agenda, actions, private notes (implicit).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerList · Manager · list | wire design | GET one-on-ones |
| ManagerRecord · Manager · 1:1 record | wire design | GET one-on-ones/:id |
| EmployeeRecord · Employee · 1:1 record | wire design | same, as the employee |
| Phone · Employee · phone | wire design | with the design, under 768 px |
| Empty · Empty | wire design | no 1:1 yet |
| Loading · Loading | wire design | while it loads |

#### PRF-12 · PIP record

Live today: `PipsScreen`, `PipScreen` (live copies) at /yx/performance/pips, /pips/[id]. API: propose, HR approval,
acknowledge, check-ins, outcome, the exit link (`perf.pip.manage`; implicit for the person and manager).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerActive · Manager · active plan | wire design | GET pips/:id |
| CheckIns · Manager · check-ins | wire design | POST pips/:id/checkins |
| HrApproval · HR · approve proposed plan | wire design | HR approval exists |
| RecordOutcome · Manager · record outcome | wire design | POST pips/:id/outcome |
| NotMet · HR · not met (next step is manual) | wire design | the exit link exists |
| EmployeeAck · Employee · acknowledge | wire design | POST pips/:id/acknowledge |
| EmployeeAckPhone · Employee · acknowledge on phone | wire design | with the design, under 768 px |

#### PRF-13 · Hand-over list

Live today: hand-overs inside `ReviewsScreen` (live copy) at /yx/performance/reviews. API: `GET handovers` (implicit,
the old and new manager).

| story (sub-page) | verdict | note |
|---|---|---|
| NewManager · New manager · handed over to you | wire design | GET handovers |
| HrDecisions · HR · needs decision | design only, feature not built | no HR view of hand-overs needing a decision |
| Empty · Empty | wire design | nothing handed over |
| Loading · Loading | wire design | while it loads |

#### PRF-14 · Competency framework

Live today: `PerformanceSetupScreen` (live copy) at /yx/settings/performance. API: competencies, skills, starters
(`perf.setup.manage`).

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Competency with levels and roles | wire design | competencies with levels and roles |
| StarterItem · Starter template item | wire design | starters from YukthiX |
| RetireInUse · Retire (in use, cannot delete) | wire design | retire exists |
| Empty · Empty | wire design | a new company |

#### PRF-15 · Dispute escalation and evidence export

Live today: the employee's disagreement (PRF-06, live) and HR's answer (PRF-04 control room, live). Escalation past
HR's answer, legal hold and evidence export have no API.

| story (sub-page) | verdict | note |
|---|---|---|
| EmployeeEscalates · Employee · escalate | design only, feature not built | no escalation after HR's answer |
| EmployeeSent · Employee · escalation raised | design only, feature not built | as above |
| EmployeePhone · Employee · phone | design only, feature not built | as above |
| HrRecord · HR · dispute record with legal hold | design only, feature not built | no dispute record or legal hold (HR answers in the control room) |
| HrExport · HR · evidence export | design only, feature not built | no evidence bundle |
| HrExported · HR · exported | design only, feature not built | as above |

#### PRF-16 · Manager coach and 1:1 agenda

No coach API; 1:1 agendas exist (PRF-11) without suggestions.

| story (sub-page) | verdict | note |
|---|---|---|
| CoachCard · Coach card on manager home | design only, feature not built | no coach (nudges) API |
| CoachCardPhone · Coach card · phone | design only, feature not built | as above |
| NoNudges · No nudges this week | design only, feature not built | as above |
| OptedOut · Opted out | design only, feature not built | as above |
| SuggestedAgenda · Suggested 1:1 agenda panel | design only, feature not built | no agenda suggestions |
| SuggestedAgendaPhone · Suggested 1:1 agenda · phone | design only, feature not built | as above |

#### PRF-17 · Review assistant and bias check

The workspace (PRF-05) is live; its assistant panel is not, as there is no AI drafting or wording-check API.

| story (sub-page) | verdict | note |
|---|---|---|
| HelpMeDraft · Help me draft | design only, feature not built | no drafting API (provider: to decide) |
| DraftShown · Draft suggested | design only, feature not built | as above |
| BiasFlags · Bias flags with Accept or Ignore | design only, feature not built | the rules exist in the kit (`detectBiasFlags`), no company switch or API |
| NoFlags · Nothing to flag | live | the live workspace shows no flags (nothing to flag is its normal state) |
| AssistantOff · AI review summaries off for the company | live | the live workspace has no assistant, as when the company has it off |

### C. Shared parts

#### Kit · Growth building blocks

Shared parts, not pages. Live where a live Performance page uses them.

| story (sub-page) | verdict | note |
|---|---|---|
| ProgressRings · ProgressRings | live | home, goals, goal map |
| GoalTreeAlignment · Goal tree | live | PRF-02 |
| GoalTreeCompact · Goal tree · compact map | live | PRF-01 team goals, PRF-03 |
| Rating · Rating | live | PRF-05 |
| RatingCompanyScale · Rating · the company’s own scale and band | live | PRF-05 / 06 with the company's levels and the server's band |
| Stages · Stages | live | PRF-01, PRF-05 |
| NineBoxGrid · 9-box | design only, feature not built | PRF-09 9-box |
| NineBoxMoveReason · NineBoxMoveReason | design only, feature not built | as above |
| Enps · Enps | design only, feature not built | Engage (not Performance) |
| Qr · Rotating QR | design only, feature not built | Learning attendance (not Performance) |
| Skills · Skills | live | skills library in Settings › Performance (PRF-14's set-up copy) |
| Posts · Feed posts | design only, feature not built | Engage feed |
| Poll · Poll | design only, feature not built | Engage feed |
| Coach · Coach card | design only, feature not built | PRF-16 |
| Bias · Bias flags | design only, feature not built | PRF-17 |

#### Calibration · Sessions list

Live page: /yx/performance/calibrations (`CalibrationListScreen`), and the control room's Calibration tab
(`CalibrationSessions`).

| story (sub-page) | verdict | note |
|---|---|---|
| List · Calibration sessions · list | live | GET calibrations |
| ListEmpty · Calibration sessions · none yet | live | no session yet |
| ListLoading · Calibration sessions · loading | live | while it loads |
| ListError · Calibration sessions · could not load | live | the read fails; Retry |
| ListNoAccess · Calibration sessions · no access | live | without `perf.calibration.facilitate` (403) |

## 5. Questions for the founder (safe default built)

1. **Cycle-level weights and scale.** The design edits section weights, half points and the scale in the cycle wizard;
   the API keeps them on the template (frozen per cycle). Built: the wizard shows them as the template's, with a note.
   Suggested answer: keep them on the template (one place to change, audited), and add "Copy the template and change it"
   later if HR asks.
2. **Mid-cycle joiners and transfers.** The design offers choices; the API has one rule each (months served and
   prorated; the current manager reviews with the earlier one's input). Built: shown as fixed text. Suggested answer:
   keep the rule; make it a company setting (default as now) only if a customer asks.
3. **Disagreement length.** The design asks for 20+ characters; the older "Disagree" route still takes 3+. Built: 20 in the
   screen and on the new combined call. Suggested answer: 20 everywhere (a small change to the old route).
4. **The reviews list** (/yx/performance/reviews) has no design. Built: it stays as is (it also shows hand-overs).
   Suggested answer: retire it when PRF-13 is live.
5. **Who sees the HR home.** HR who run cycles company-wide (`perf.cycle.manage`) get the HR home even if they also
   manage a team. Suggested answer: yes; their team is one click away (Goals, Reviews).

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every
Performance story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/performance-design-map.md and checks that
// every Performance story file has exactly one row per story, in file order.
const fs = require('fs');
const UI = 'packages/yx-ui/src/screens/';
const files = fs.readdirSync(UI + 'growth').filter((f) => /^prf-\d+\.stories\.tsx$/.test(f)).map((f) => 'growth/' + f)
  .concat(['growth/growth-kit.stories.tsx', 'performance/live/calibration-sessions.stories.tsx']);
const want = {};
for (const f of files) {
  const s = fs.readFileSync(UI + f, 'utf8');
  want[s.match(/title:\s*'Screens\/Performance\/([^']+)'/)[1]] = [...s.matchAll(/^export const (\w+)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/performance-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split('## 5.')[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0], c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
```
