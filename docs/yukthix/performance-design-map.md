# Performance: live pages and their designs (check)

This file checks, story by story, that every Performance design sub-page can be reached in the live app. People, Pay and
Time were checked the same way (see `people-design-map.md`, `pay-design-map.md`, `time-design-map.md`). Founder rule:
never build a second, simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-perf-map`, from `test/yukthix-main` after all three Performance builders
merged): every PRF design (PRF-01 to PRF-17) is rendered by a live page; what is left is gaps (below) and nine list
screens with no design yet (section 2). Builder 1 made PRF-01 to PRF-06 live. The live pages render the designed screens (`PerformanceHomeScreen`, `MyGoalsScreen`, `CompanyGoalMapScreen`,
`CycleSetupScreen`, `CycleControlRoomScreen`, `ReviewWorkspaceScreen`, `ReviewAcknowledgeScreen`) with a `live` prop, and
the seven stand-in copies they replace are deleted (GoalsScreen, GoalScreen, GoalMapScreen, ReviewCyclesScreen,
CycleScreen, ReviewScreen, PeerSetup) with their stories and tests. Builder 2 made PRF-07 to PRF-12 live and builder 3
PRF-13 to PRF-17; their map notes are folded in here (and deleted), checked against the code.

Verdicts (the same words as People): **live** (the live page renders the designed screen and can reach this state; the
note says how) · **live (gap)** (the design is live, but this state can't be fully reached yet; the note says why) ·
**wire design** (a live page exists for this job but renders something else) · **design only, feature not built** (no
API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Goals and reviews (PRF-01 … 06, builder 1) | 6 | 55 | 8 | 0 | 0 | 0 | 63 |
| B. Feedback, calibration, pay, plans and help (PRF-07 … 17, builders 2 and 3) | 11 | 76 | 16 | 0 | 1 | 0 | 93 |
| **All PRF groups (A–B)** | **17** | **131** | **24** | **0** | **1** | **0** | **156** |
| C. Shared parts (Kit · Growth building blocks, Calibration · Sessions list) | 2 | 17 | 0 | 0 | 4 | 0 | 21 |

Recounted by script 3 Nov 2026 on `feat/yukthix-perf-followups-a` (two PRF stories and one kit story added: PRF-01
EmployeeEarlierReviews, PRF-05 ManagerPotential, Kit Potential; PRF-01 Manager and ManagerPhone now live with the coach
card). Before that, recounted on `feat/yukthix-perf-map` after the builder 2 and 3 notes were folded in: B grew from 64 to
93 stories (builders 2 and 3 added 29 design stories for states the real record has); the one story still not built is
PRF-10 "Stale market data" (no market data source). The four kit stories not built are Engage and Learning parts
(eNPS, rotating QR, feed posts, poll), not Performance. First counted on `feat/yukthix-perf-1` (the script is in the appendix): every `export const` story in
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

| /yx/performance/reviews | redirects to the home (the old list is retired; earlier reviews are linked on the home) | PRF-01 | — | live |
| /yx/performance/reviews/[id]/nominations | `NominationsScreen` live | PRF-07 | nominations routes (implicit; the service decides) | live |
| /yx/performance/feedback | `QuickFeedbackScreen` live | PRF-08 | feedback and feedback-requests routes (implicit; sealing `perf.concern.seal`) | live |
| /yx/performance/calibrations | `CalibrationListScreen` | Calibration · Sessions list | `GET calibrations` (`perf.calibration.facilitate`) | live |
| /yx/performance/calibrations/[id] | `CalibrationScreen` live (board, 9-box, changes, close) | PRF-09 | calibration routes (`perf.calibration.facilitate`; board read implicit) | live |
| /yx/performance/comp/[id] | `CompReviewScreen` live | PRF-10 | comp sheet routes (`perf.comp.manage`, `perf.comp.approve`; managers implicit) | live |
| /yx/performance/one-on-ones, /one-on-ones/[id] | `OneOnOneScreen` live (with the PRF-16 suggested agenda for the manager) | PRF-11, PRF-16 | 1:1 routes (implicit) | live |
| /yx/performance/pips/[id] | `PipRecordScreen` live | PRF-12 | PIP routes (`perf.pip.manage`; person and manager implicit) | live |
| /yx/performance/handovers | `HandoverListScreen` live | PRF-13 | handover-list routes (implicit; all `perf.cycle.manage`) | live |
| /yx/performance/competencies | `CompetencyFrameworkScreen` live | PRF-14 | competencies routes (`perf.setup.manage`) | live |
| /yx/performance/reviews/[id]/dispute | `DisputeRaiseScreen` live | PRF-15 | `reviews/:id/dispute` (implicit, the employee) | live |
| /yx/performance/disputes, /disputes/[id] | `DisputeListScreen`, `DisputeRecordScreen` live | PRF-15 | disputes routes (`perf.dispute.manage`) | live |
| /yx/performance/coach | `ManagerCoachHome` live | PRF-16 | coach routes (implicit, managers) | live |
## 2. Live Performance pages with no design (stand-in copies still)

The design-live guard's `liveCopies` still lists seven Performance screens (the reviews list and the old 360° panel were
retired 3 Nov 2026, founder Q4 and Q7). None of them has a PRF design story yet, so
none can be swapped; each needs a design story first (rule 18).

| page | what it renders (live copy) | note |
|---|---|---|
| /yx/performance/comp | `CompCyclesScreen` (comp cycles list) | no design |
| /yx/performance/pips | `PipsScreen` (plans list, propose) | no design |
| /yx/performance/feedback-tasks, /feedback-tasks/[id] | `FeedbackTasksScreen`, `PeerFormScreen` (360° answers owed) | no design |
| /yx/performance/reviewer-blocks | `ReviewerBlocksScreen` | no design |
| /yx/performance/reports | `PerformanceReportsScreen` | no design |
| /yx/settings/performance | `PerformanceSetupScreen` (scales, templates, skills) | no design (competencies moved to PRF-14) |

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| PRF-01 HR stat cards' "last week / last period" | a daily snapshot of the figures (overdue stages, aligned %) | S |
| PRF-05 kudos card | Engage recognition (kudos) | L (Engage) |
| PRF-05 / PRF-06 "Download PDF" | a review PDF (the dispute export already renders one with pdf-lib) | M |
| PRF-10 market data, stale market data | a salary benchmark source (provider: to decide) | M |
| PRF-13 "Reassign to HR", "View audit entry" | a bulk reassign and a link into the audit log | S |
| PRF-14 Import and the skills-test link | a file import and the question-bank link | M |
| PRF-15 legal hold that blocks something | a retention purge for reviews (the hold is a flag today) | M |
| PRF-16 more signals | unused leave, overtime, onboarding tasks | M |
| Phone frames for PRF-07 … 17 | switch the designs' phone layout on below 768 px, as PRF-01, 02 and 06 do | M |

## 4. Design groups, story by story

### A. Goals and reviews (PRF-01 … 06)

#### PRF-01 · Performance home

Live page: /yx/performance (menu Performance › Performance home). `GET performance/home` decides the role: HR who run
cycles company-wide, a manager with direct reports today, or an employee.

| story (sub-page) | verdict | note |
|---|---|---|
| Employee · Employee | live | as an employee: needs-action list (self review, acknowledgement, feedback asked of you), review stages, my goals with check-in, next 1:1, feedback received |
| Manager · Manager | live | team table (goal progress, review stage, last 1:1, my last feedback; Review and Goals links), team goals, and the PRF-16 coach card beside the team (founder 3 Nov 2026; GET performance/coach) |
| HrAdmin · HR admin | live (gap) | cycles with done / eligible / overdue, overdue stages, PIPs (with `perf.pip.manage`), goals aligned %, last released bands by department; the stat cards have no "last week / last period" comparison (no history kept) |
| EmployeePhone · Employee · phone | live | page width under 768 px |
| ManagerPhone · Manager · phone | live | under 768 px, with the coach card on top |
| NoCycleRunning · HR · empty (no cycle) | live | first use: nothing to do, no goals, no cycle; "Start a review cycle" opens /cycles/new |
| Loading · Loading | live | while GET performance/home loads |
| Failed · Error | live | GET performance/home fails; Retry refetches |
| EmployeeEarlierReviews · Employee · earlier reviews | live | my other reviews linked under My review (`earlierReviews` from GET performance/home); the old reviews list is retired |

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
| ManagerReview · Manager · manager review with advisory peer panel | live (gap) | the self rating shows under each question once the manager saved a draft; the peer card shows the 360° groups (advisory); no kudos card (Engage not built); the PRF-17 assistant shows under the summary when the company has it on; nominations are the PRF-07 page ("Nominate reviewers"), the old 360° panel is gone |
| SectionExcluded · Section without goals excluded | live | a rated section with no ratings is named and left out (YX-PERF-02) |
| Submitted · Submitted (locked) | live (gap) | locked after submit; "Download PDF" is not built |
| SkipLevel · Skip-level · agree or send back | live | the manager's manager; POST skip/agree or send-back with a reason |
| HrReopen · HR · reopen a finished review | live | POST reviews/:id/reopen with a reason |
| FormerManager · Former manager · advisory input | live | an "other" reviewer added by HR answers the manager's questions |
| ManagerPotential · Manager · potential for calibration | live | the manager proposes Low / Medium / High with the manager review (`potential` on PUT/POST entries/manager; manager only, 1–3, audited); the employee never sees it; the PRF-09 9-box starts from it |

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

Phone stories here: the PRF-07 … 17 live pages render the desktop layout, which reflows at phone width; the designs'
phone frame (bottom tabs, pinned buttons) is not switched on below 768 px (only PRF-01, 02 and 06 do that). They are
"live (gap)".

#### PRF-07 · 360° nominations

Live page: /yx/performance/reviews/[id]/nominations (`NominationsScreen` with `live`; linked from the PRF-05 workspace as
"Nominate reviewers" when the cycle has 360° feedback and the viewer may nominate). API (implicit; the service checks
the employee sends their own list, the manager approves, the cycle's min and max and the window): `GET
reviews/:id/nominations`, `GET reviews/:id/nominee-options`, `POST reviews/:id/nominations`, `POST
reviews/:id/nominations/send`, `POST reviews/:id/nominations/approve-all`, `POST nominations/:id/approve|decline|withdraw`.

| story (sub-page) | verdict | note |
|---|---|---|
| EmployeeNominates · Employee · nominate | live | names searched on the server; blocked pairs, oneself and the manager never offered |
| BelowMinimum · Employee · below minimum | live | Send is never disabled: pressed, it says "Nominate at least N reviewers. You have M." |
| Sent · Employee · sent for approval | live | POST nominations/send; the manager is told once per list |
| ManagerApproves · Manager · approve list | live | approve one, remove one, or approve the whole list |
| Phone · Employee · phone | live (gap) | desktop layout at phone width; the phone frame is not switched on |
| ManagerPhone · Manager · phone | live (gap) | as above |
| Empty · Empty | live | no one nominated yet |
| LoadError · Error | live | the read fails; Retry |

#### PRF-08 · Quick feedback

Live page: /yx/performance/feedback (`QuickFeedbackScreen` with `live`). API: `GET feedback?view=received|given|team`,
`GET feedback/employee/:id` (`perf.concern.seal`), `POST feedback`, `POST feedback/:id/withdraw|seal`, `GET|POST
feedback-requests`, `POST feedback-requests/:id/decline`, `GET feedback/goal-options/:employeeId` (only goals the giver
may see). Company setting `perf.feedback.default_visibility` (default "them and their manager").

| story (sub-page) | verdict | note |
|---|---|---|
| Received · Received | live | a linked goal shows by title; a sealed item shows "Removed by HR" |
| Give · Give feedback sheet | live | type is a Segment; a line links to the confidential concern channel |
| Sent · Sent confirmation | live | a toast |
| Requests · Requests to me | live | Give feedback answers the request; Decline |
| Phone · Phone | live (gap) | desktop layout at phone width |
| PhoneGive · Phone · give feedback | live (gap) | as above |
| Empty · Empty | live | nothing received yet |
| Ask · Ask for feedback sheet | live | POST feedback-requests |
| LoadError · Error | live | the read fails; Retry |
| Team · Manager · my team | live | view=team |
| Concerns · HR · concerns and sealing | live | `perf.concern.seal` |
| Seal · HR · seal a concern | live | POST feedback/:id/seal with a reason |

#### PRF-09 · Calibration board and 9-box

Live page: /yx/performance/calibrations/[id] (`CalibrationScreen` with `live`). API: `GET calibrations/:id`, `POST
calibrations/:id/changes`, `POST calibrations/:id/sign-off`, `POST calibrations/:id/potential` (the facilitator,
`perf.calibration.facilitate`; reasons; audited).

| story (sub-page) | verdict | note |
|---|---|---|
| HrBoard · HR · ratings board with guide | live | columns are the cycle's bands; no chart for a small group |
| ChangeWithReason · HR · change rating with reason | live | moves to a band (the server takes the band's middle score) |
| ManagerView · Manager · own team movable | live (gap) | managers look only: the API lets only the facilitator change ratings (`can.change`, YX-PERF-08) |
| NineBox · 9-box (wave 6) | live | potential (1–3) set on the 9-box by the facilitator; empty shows as medium |
| ChangeLog · Changes log | live | band and score, reason, who, when |
| Empty · Empty (no manager ratings yet) | live | a session with no rated reviews |
| Close · HR · close calibration | live | POST calibrations/:id/sign-off |
| LoadError · Error | live | the read fails; Retry |

#### PRF-10 · Comp review sheet

Live page: /yx/performance/comp/[id] (`CompReviewScreen` with `live`). API: `GET comp-cycles/:id/sheet` (pay-gap figures
and "below peers" only for HR and finance), `PUT comp-proposals/:id`, `POST comp-cycles/:id/submit`, `PUT
comp-cycles/:id/budgets`, `POST comp-cycles/:id/open`, `POST comp-cycles/:id/apply` (step-up), `GET
comp-cycles/:id/pay-equity`, `POST comp-cycles/:id/decide` (whoever holds an open approval task of the cycle).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerProposes · Manager · proposals with out-of-range row | live | range and checks from the server's matrix cell, prorated |
| Justify · Manager · justification for out-of-range | live | the proposal drawer asks for a reason outside the range or with a promotion |
| HrApproves · HR · approve with pay-equity panel | live | gap by gender, grade or location (Segment); small groups suppressed |
| FinanceOverBudget · Finance · over budget | live | budget use from the API |
| NoMarketData · No market data | live | always the state today: no benchmark source yet (provider: to decide) |
| StaleMarketData · Stale market data | design only, feature not built | no market data source, so nothing can be stale |
| Proposal · Manager · proposal with promotion and bonus | live | PUT comp-proposals/:id |
| Budgets · HR · set a department budget | live | PUT comp-cycles/:id/budgets |
| SendBack · HR · send back with what to change | live | POST comp-cycles/:id/decide |
| Apply · HR · apply approved pay changes | live | POST comp-cycles/:id/apply (step-up) |

#### PRF-11 · 1:1s

Live pages: /yx/performance/one-on-ones and /one-on-ones/[id] (`OneOnOneScreen` with `live`, the 1:1 open in the
drawer). API: `GET one-on-ones` (one row per pair), `POST one-on-ones` (with a rhythm), `PUT one-on-ones/:id` (held plans
the next on its rhythm; past dates refused; audited), agenda, private note, actions. Company setting
`perf.one_on_one.cadence_days` (default 14).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerList · Manager · list | live | my reports and my manager, one row per pair |
| ManagerRecord · Manager · 1:1 record | live | notes save on leaving the box (toast); private notes stay with their author |
| EmployeeRecord · Employee · 1:1 record | live | as the employee |
| Phone · Employee · phone | live (gap) | desktop layout at phone width |
| Empty · Empty | live | no 1:1 yet |
| Loading · Loading | live | while it loads |
| Schedule · Manager · schedule 1:1 | live | POST one-on-ones with a rhythm |
| AddAction · Manager · add action item | live | POST one-on-ones/:id/actions |
| Reschedule · Manager · reschedule | live | PUT one-on-ones/:id |

#### PRF-12 · PIP record

Live page: /yx/performance/pips/[id] (`PipRecordScreen` with `live`). API: `GET pips/:id`, `POST pips/:id/acknowledge`,
`POST pips/:id/checkins` (with a rating), `POST pips/:id/outcome` (HR), `POST pips/:id/letter`, `POST
pips/:id/start-exit`, `POST pips/:id/decide` (`perf.pip.manage`, HR whose approval task it is). Company setting
`perf.pip.extend_days` (default 30).

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerActive · Manager · active plan | live | "Download PIP letter" hidden: HR issues it; it is in the person's documents |
| CheckIns · Manager · check-ins | live | from the plan's schedule; protected leave moves the end |
| HrApproval · HR · approve proposed plan | live | approve and start, or send back with a reason |
| RecordOutcome · Manager · record outcome | live (gap) | only HR records the outcome (API, YX-PERF-11: "HR records the outcome.") |
| NotMet · HR · not met (next step is manual) | live (gap) | "Extend plan" hidden after not met (a plan is extended once, while it runs); the exit case opens from a dialog |
| EmployeeAck · Employee · acknowledge | live | plus "Add my note" on a held check-in |
| EmployeeAckPhone · Employee · acknowledge on phone | live (gap) | desktop layout at phone width |
| RecordCheckIn · Manager · record check-in | live | POST pips/:id/checkins |
| SendBack · HR · send back with a reason | live | POST pips/:id/decide |
| StartExit · HR · open exit case after not met | live | POST pips/:id/start-exit |

#### PRF-13 · Hand-over list

Live page: /yx/performance/handovers (`HandoverListScreen` with `live`; managers see what moved to or from them, HR with
`perf.cycle.manage` the company list). API: `GET handover-list`, `GET handover-list/all` (`perf.cycle.manage`), `GET
handover-list/:id/parent-options`, `POST handover-list/:id/decide` (once; audited).

| story (sub-page) | verdict | note |
|---|---|---|
| NewManager · New manager · handed over to you | live | reviews, goal parents, PIPs and 1:1 actions from perf_owner_transfers |
| HrDecisions · HR · needs decision | live (gap) | "Reassign to HR" (bulk) and "View audit entry" are not built (hidden); a moved PIP shows only to HR with `perf.pip.manage` company-wide |
| ReparentGoal · Re-parent a moved goal | live | align to one of the new manager's goals in the same period, or leave unaligned |
| Empty · Empty | live | nothing handed over |
| Loading · Loading | live | while it loads |

#### PRF-14 · Competency framework

Live page: /yx/performance/competencies (`CompetencyFrameworkScreen` with `live`, `perf.setup.manage`). API: `GET|POST
competencies`, `PUT competencies/:id`, `POST competencies/:id/retire`, `POST competencies/:id/merge`, `POST
setup/from-starter`.

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Competency with levels and roles | live (gap) | "Rated in" lists active templates with a competencies section; Import (file) is hidden and the skills-test link shows "None" (no question bank link yet) |
| StarterItem · Starter template item | live | POST setup/from-starter |
| RetireInUse · Retire (in use, cannot delete) | live | POST competencies/:id/retire |
| AddCompetency · Add competency | live | POST competencies |
| MapRole · Map a role to a level | live | PUT competencies/:id |
| MergeInto · Merge into another competency | live | POST competencies/:id/merge; the merged one retires, its job titles move |
| Empty · Empty | live | "Load starter library" |

#### PRF-15 · Dispute escalation and evidence export

Live pages: /yx/performance/reviews/[id]/dispute (`DisputeRaiseScreen`, the employee, linked from PRF-06 once HR
answered); /yx/performance/disputes and /disputes/[id] (`DisputeListScreen`, `DisputeRecordScreen`,
`perf.dispute.manage`). API: `GET|POST reviews/:id/dispute`, `POST disputes/:id/files`, `GET disputes` (audited), `GET
disputes/:id` (audited), `POST disputes/:id/legal-hold`, `POST disputes/:id/decision`, `POST disputes/:id/export`, `GET
disputes/:id/exports/:exportId/file`. Company setting `perf.dispute.escalate_days` (default 15).

| story (sub-page) | verdict | note |
|---|---|---|
| EmployeeEscalates · Employee · escalate | live | within the window after HR's answer |
| EmployeeSent · Employee · escalation raised | live | "See your escalation …" from PRF-06 |
| EmployeePhone · Employee · phone | live (gap) | desktop layout at phone width |
| HrRecord · HR · dispute record with legal hold | live (gap) | legal hold is a flag: no retention purge exists for reviews yet, so it blocks nothing today |
| HrExport · HR · evidence export | live | a PDF (pdf-lib) stored with its hash; the certificate wording is still to be confirmed by counsel |
| HrDecision · HR · record decision | live | a decision never changes the rating |
| HrList · HrList | live | /yx/performance/disputes |
| HrListEmpty · HR · no disputes | live | no dispute yet |
| HrExported · HR · exported | live | GET disputes/:id/exports/:exportId/file |

#### PRF-16 · Manager coach and 1:1 agenda

Live pages: /yx/performance/coach (`ManagerCoachHome` with `live`, managers) and the 1:1 drawer on
/yx/performance/one-on-ones/[id] (suggested agenda, the 1:1's manager only). API: `GET coach`, `POST coach/dismiss`,
`POST coach/opt-out`, `GET one-on-ones/:id/suggested-agenda` (404 to anyone but the 1:1's manager). Company setting
`perf.coach.frequency` (weekly / fortnightly / off; default weekly).

| story (sub-page) | verdict | note |
|---|---|---|
| CoachCard · Coach card on manager home | live (gap) | on its own page, not yet on the PRF-01 manager home; signals built: feedback in 6 weeks, 1:1 overdue or over 35 days, goals off track or at risk (unused leave, overtime and onboarding-task signals not built); wording is fixed text, no AI call |
| CoachCardPhone · Coach card · phone | live (gap) | desktop layout at phone width |
| NoNudges · No nudges this week | live | nothing to suggest |
| OptedOut · Opted out | live | POST coach/opt-out |
| CompanyOff · Turned off by the company | live | `perf.coach.frequency` off |
| NotManager · No team yet | live | a viewer with no reports |
| SuggestedAgenda · Suggested 1:1 agenda panel | live | "Add to agenda" uses PRF-11's agenda route |
| SuggestedAgendaPhone · Suggested 1:1 agenda · phone | live (gap) | desktop layout at phone width |

#### PRF-17 · Review assistant and bias check

Live page: /yx/performance/reviews/[id], the review's current manager at the manager stage (the assistant panel under
the manager's summary). API: `GET reviews/:id/assistant`, `POST reviews/:id/assistant/draft` (through the AI service:
quota, spend record, names stripped), `POST reviews/:id/assistant/check`, `POST reviews/:id/assistant/flags` (Accept /
Ignore audited). Company setting `perf.ai.review_assistant` (default off).

| story (sub-page) | verdict | note |
|---|---|---|
| HelpMeDraft · Help me draft | live | the company has it on and an AI provider set up |
| DraftShown · Draft suggested | live | "Use as starting text" or discard; never saved by itself |
| BiasFlags · Bias flags with Accept or Ignore | live | loaded or gendered words, personality, age, vague, rating against text |
| NoFlags · Nothing to flag | live | the check finds nothing |
| AssistantOff · AI review summaries off for the company | live | `perf.ai.review_assistant` off (the default) |
| AiNotSetUp · AI provider not set up | live | no provider configured |
| PanelSpread · PanelSpread | live | the manager's ratings against the company spread (5+ on each side, gap 0.75 or more; or all the same at 3+) |

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
| Potential · Potential · the manager’s proposal | live | PRF-05 manager review (`PotentialChoice`) |
| Stages · Stages | live | PRF-01, PRF-05 |
| NineBoxGrid · 9-box | live | PRF-09 calibration board (potential on the 9-box) |
| NineBoxMoveReason · NineBoxMoveReason | live | PRF-09: moving someone asks for a reason |
| Enps · Enps | design only, feature not built | Engage (not Performance) |
| Qr · Rotating QR | design only, feature not built | Learning attendance (not Performance) |
| Skills · Skills | live | PRF-14 competency levels (/yx/performance/competencies) |
| Posts · Feed posts | design only, feature not built | Engage feed |
| Poll · Poll | design only, feature not built | Engage feed |
| Coach · Coach card | live | PRF-16, /yx/performance/coach |
| Bias · Bias flags | live | PRF-17 assistant on the review |

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

6. **Coach card on the manager home.** PRF-16's coach is live on /yx/performance/coach; the PRF-01 manager home still has
   no coach card. Suggested answer: show the card on the home (the same API), keep the page for the full list.
7. **The old 360° panel on the review.** The PRF-05 page still shows `PeerPanel` (nominations, approvals) next to the
   "Nominate reviewers" link to the PRF-07 page. Suggested answer: drop the panel's nomination part.
8. **The "Performance set-up" role and the goal map.** The role template (set-up, goals, cycles, calibration) has
   `perf.goal.manage` but not `perf.goal.view`, and the goal map needs `perf.goal.view`. So hr-tester@demo-org.test can add
   goals but may not open the goal map unless their base role has it; MT-PRF-06 / 07 stay with hr@demo-org.test.
   Suggested answer: add `perf.goal.view` to the template.
9. From builder 2 (safe defaults built): HR reads "them, their manager and HR" feedback only through Concerns
   (suggested: also `perf.review.view` in scope on the person's Performance tab); only the calibration facilitator moves
   ratings (suggested: keep); only HR records a PIP outcome (suggested: keep); market data: a salary-survey CSV per grade
   first, a provider later; 9-box potential set by the facilitator (suggested: let the manager propose it in PRF-05).

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

3 Nov 2026 (walk as HR, manager and employee in the test app; branch `feat/yukthix-perf-walkfix`): a refused page (403) shows
the designed no-access state ("Screens/Performance/No access") on every Performance page, never "check your connection";
refused visitors see no header actions; the shell names each Performance sub-page in the breadcrumb and highlights its own
(or parent) menu entry, also for a typed address. Manual tests MT-PRF-B3-16..18.

## Founder answers, 3 Nov 2026 (all three Performance builders, "all good")
Build: (3) a disagreement needs at least 20 characters on every route; (4) retire the old reviews list (home and the
control room open every review); (6) drop the old 360° panel from the review page (the "Nominate reviewers" link covers
it); (7) the PRF-16 coach card also shows on the PRF-01 manager home; (8) `perf.goal.view` joins the "Performance set-up"
role template (and the demo role), so its holders can open the goal map; (9) feedback shared "with them, their manager
and HR" is also visible to HR with review access on the person's Performance tab; (12) comp market data starts as a
salary-survey CSV upload per grade (a provider later); (13) the manager proposes 9-box potential in the PRF-05 review.
Keep as built: (1) weights and scale on the template; (2) fixed mid-cycle joiner and transfer rules; (5) a cycle runner
who manages a team sees the HR home; (10) only the calibration facilitator moves ratings; (11) only HR records a PIP
outcome; (14) AI review summaries off until HR turns them on; (15) coach and agenda wording from fixed rules; (16) rating
disputes only for the "Rating disputes" role, not HR Admin by default; (17) escalation window 15 days. Founder to do:
(18) a lawyer confirms the evidence-export certificate wording before first use.

## Built 3 Nov 2026 from the founder answers (branch `feat/yukthix-perf-followups-a`, builder 1)
(3) both disagreement routes need 20+ characters (one rule, `DISAGREEMENT_MIN`); (4) /yx/performance/reviews redirects
to the home, `ReviewsScreen` deleted, the "Reviews & cycles" menu item removed, earlier reviews linked on the home
(design story PRF-01 EmployeeEarlierReviews), review notifications link to the home or hand-overs; (6) the old 360°
`PeerPanel` is deleted, nominations are the PRF-07 page; (7) the PRF-16 coach card sits on the PRF-01 manager home,
desktop and phone; (8) the "Performance set-up" template has `perf.goal.view`; migration 20261470000100 brings following
company roles up to it (additive, audited as access.role.template_synced; edited roles untouched) and the template sync
covers older copies at start-up; the demo script adds missing keys, so MT-PRF-06/07 use hr-tester; (13) the manager
proposes 9-box potential in the manager review (migration 20261470000000, `reviews.proposed_potential`; kit
`PotentialChoice`, design story PRF-05 ManagerPotential); the calibration board starts from it and the facilitator's
value wins. Not built here: (9) and (12) (other builders).

## Founder answers, 3 Nov 2026 (partly-live Performance rows)
(a) PIP "not met": HR may extend the plan once more after "not met" (days a company setting, with a reason); then only
close or open an exit case. (b) HR home "vs last period": a scheduled monthly snapshot of the HR home numbers; the stat
cards show the change against last month. Rows decided by the founder (cycle weights/scale on the template, fixed
mid-cycle rules, facilitator-only calibration moves, HR-only PIP outcome) are live by decision, not gaps.
