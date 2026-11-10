# Hiring: live pages and their designs (check)

This file checks, story by story, that every Hiring design sub-page can be reached in the live app. People, Pay, Time,
Performance, Expenses and Helpdesk were checked the same way (see `people-design-map.md`, `helpdesk-design-map.md`).
Founder rule: never build a second, simpler version of a designed screen; make the designed one live.

Status 9 Nov 2026 (branch `feat/yukthix-hiring-design-map`, from `test/yukthix-main` at b84c3c671). Audit only: nothing
was built.

## What is live today (plain English)

- **Few Hiring designs are live yet.** The "Request a hire" sheet (HIR-02 NewRequisition) on People › My team; HIR-01,
  the headcount plan board (all 10 stories); and HIR-03 Jobs list, Create job sheet and job workspace on /yx/hiring/jobs and
  /yx/hiring/jobs/[id], with the HIR-24 pay range by location law (one story live with a gap: the apply form has no
  pay-history question). Since 9 Nov 2026 also HIR-04, the pipeline board (all 7 stories) on /yx/hiring/jobs/[id]/pipeline.
  Counts in the table below.
- **Few of the Hiring designs are live.** Of the design stories (HIR-01 … 31, the careers site, candidate
  identity check and the hiring settings), 201 of 306 are live with their design and 11 more live with a gap (recount 13 Nov 2026, after HIR-23 the bias audit, HIR-25 the interview notetaker and HIR-13 Internal jobs merged with test main on /yx/hiring/internal-jobs; before that HIR-10 manual BGV on /yx/hiring/bgv, HIR-20 Talent CRM on /yx/hiring/pools and the HIR-07 scorecard comments). First the "Request a hire" sheet (HIR-02
  NewRequisition), which People › My team (/yx/people/team) renders with `live` and sends to `POST jobs/requisitions`. Since 9 Nov 2026 (branch `feat/yukthix-hir-01`) HIR-01, the headcount plan board, is live too: all 10 of
  its stories (section 4). HIR-05 (branch `feat/yukthix-hir-05`): the candidate record with the ex-employee match and merge, plus the newly drawn candidate list (with Possible duplicates) and candidate data retention pages. HIR-11 Recruiting costs (/yx/hiring/costs) and HIR-12 Referrals (/yx/hiring/referrals, with HR's
  All referrals at /yx/hiring/referrals/all) are live too (branch `feat/yukthix-hir-11-12`).
  its stories (section 4). HIR-11 Recruiting costs (/yx/hiring/costs) and HIR-12 Referrals (/yx/hiring/referrals, with HR's
  All referrals at /yx/hiring/referrals/all) are live too (branch `feat/yukthix-hir-11-12`). HIR-02 Requisitions
  (/yx/hiring/requisitions, menu Hiring › Requisitions) and the HIR-26 rediscovery panel are live too (branch
  `feat/yukthix-hir-02-26`, section 4).
- **Hiring itself works, but on stand-in screens.** The 14 pages under /yx/hiring render the older "Live ·" screens from
  `packages/yx-ui/src/screens/hiring/live/*` (the package path `@yukthix/ui/hiring` points there). None of them passes a
  `live` prop to a designed HIR screen. The design-live guard already lists all 14 as `liveCopies` and every HIR screen
  as `notLive` (`packages/yx-ui/src/design-live-guard.known.json`).
- **The server is there for the core hiring flow:** headcount plans, requisitions with approval routes, jobs, the
  pipeline board (move, reject with reason, bulk), candidates (profile, merge, pools, legal hold, retention), interviews
  and scorecards, offers (letter, PDF, approval, candidate accept/decline by link), job boards, careers site with entity
  pages and consent, recruiting costs, referrals, recruitment agencies (submissions by a link). An accepted offer becomes
  a joiner in People (PPL-12), and background checks are recorded on the joiner (People onboarding).
- **Not built at all (no API):** the staffing-agency business (clients, rate cards, submissions to clients, placements,
  bench, client invoices, collections, placement fees, e-invoice window: HIR-14 … 19, 30, 31),
  AI interview review (HIR-08), a recording provider for the notetaker (HIR-25), candidate identity checks (HIR-22, T9-15),
  BGV partner checks (HIR-10), bulk interview day and bulk offers (HIR-27, 28), interview slot finder from calendars (HIR-06), CRM sequences and
  sourced profiles (HIR-20). (Pay-transparency law rules, HIR-24, went live 9 Nov 2026.)
- **The public careers site** is live on T9-09 since 11 Nov 2026 (/yx/careers/[org], its job pages, /yx/apply/[token])
  with the candidate pages outside the app (status, candidate page, offer accept, interview booking); the Surfaces/Careers
  page builder is live at /yx/hiring/careers (decision 8).

Verdicts (the same words as People and Helpdesk): **live** (the live page renders the designed screen and can reach this
state; the note says how) · **live (gap)** (the design is live, but this state can't be reached yet; the note says why) ·
**wire design** (a live page exists for this job but renders something else, so the designed screen must be wired; when
the API also lacks a field or a route for this state, the note names it; when the API exists but no YukthiX page shows
it yet, the note says so) · **design only, feature not built** (no API for this feature) · **phone view, mobile app not
built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Plans, requisitions, jobs and costs | 4 | 36 | 1 | 0 | 0 | 0 | 37 |
| B. Candidates, pipeline and interviews | 8 | 58 | 1 | 0 | 9 | 1 | 69 |
| C. Offers, BGV and joining | 4 | 24 | 4 | 0 | 1 | 0 | 29 |
| D. Referrals, internal jobs, CRM and rediscovery | 4 | 25 | 0 | 0 | 3 | 4 | 32 |
| E. Staffing agency | 8 | 49 | 15 | 0 | 0 | 0 | 64 |
| F. Compliance and fairness | 5 | 21 | 4 | 0 | 6 | 0 | 31 |
| G. Careers site, portals and settings | 4 | 64 | 4 | 2 | 9 | 0 | 79 |
| **All Hiring design groups (A–G)** | **37** | **277** | **29** | **2** | **28** | **5** | **341** |
| H. Kit and "Live ·" groups (not designs; own line) | 3 | 5 | 0 | 5 | 5 | 0 | 15 |
Recounted by script 17 Nov 2026 on `feat/yukthix-hiring-small-6` (from `test/yukthix-main` c8e6752f7) after answers 531 and 532: 1 new story drawn and live (HIR-05 ApplicationSendNotice): A–G 277 live, 29 gap, 2 wire, 28 not built, 5 phone, of 341.
Recounted by script 16 Nov 2026 on `feat/yukthix-hiring-small-5` (from `test/yukthix-main` 5b7855eb0) after answers 502 and 514: 3 new stories drawn and live (HIR-28 ValuesBlank, T9-09 StatusNycNotice, HIR-05 ApplicationRecordAlternative): A–G 276 live, 29 gap, 2 wire, 28 not built, 5 phone, of 340 (rows B, C, E, F, G recounted from the script; two 6.1 rows put back in file order).
Recounted by script on `test/yukthix-main` after merging round 4 (442, 452, 473, 474): A–G 273 live, 29 gap, 2 wire, 28 not built, 5 phone, of 337.
Recounted by script on `test/yukthix-main` after merging the Hiring walk-through fixes: A–G 270 live, 29 gap, 2 wire, 28 not built, 5 phone, of 334.
Recounted by script on `test/yukthix-main` after merging staffing slice 3 (invoices, collections, fees, e-invoice banner, client portal) and answers 482-484, 489: A–G 267 live, 29 gap, 2 wire, 28 not built, 5 phone, of 331.
Recounted by script 13 Nov 2026 on `feat/yukthix-hiring-walk` (answer 476, from test main 9b05e1e73): the table had fallen behind for C, F and G; now A–G 250 live, 24 gap, 2 wire, 49 not built, 5 phone, of 330, with the walk's 3 new no-access stories (candidate list, bias audit, 6.1).
Recounted by script 15 Nov 2026 on `feat/yukthix-hiring-small-4` (from `test/yukthix-main` 9b05e1e73 with HIR-23, staffing 2 and offers 3) after answers 473 and 474: 3 new stories drawn and live (6.1 P6_1_NycHint, T9-09 JobNycNotice, HIR-05 ApplicationAlternative): A–G 250 live, 24 gap, 2 wire, 49 not built, 5 phone, of 330 (rows C, F and G recounted from the script).
Recounted by script on `test/yukthix-main` after merging staffing slice 2 (submissions, placements, bench, vendors): A–G 247 live, 24 gap, 2 wire, 49 not built, 5 phone, of 327.
Recounted by script on `test/yukthix-main` after merging HIR-23 bias audit: A–G 226 live, 17 gap, 6 wire, 65 not built, 5 phone, of 319.
Recounted by script on `test/yukthix-main` after merging offers round 3 (376, 402, 404, 423, 443): A–G 220 live, 17 gap, 6 wire, 69 not built, 5 phone, of 317.
Recounted by script on `test/yukthix-main` after merging staffing slice 1 (clients, rate cards, 6.2): A–G 217 live, 18 gap, 6 wire, 68 not built, 5 phone, of 314.
Recounted by script on `test/yukthix-main` after merging the careers follow-ups, HIR-13 internal jobs and HIR-25 notetaker: A–G 204 live, 11 gap, 6 wire, 83 not built, 5 phone, of 309.
Recounted by script on `test/yukthix-main` after merging HIR-28 bulk offers (with the HIR-09 follow-ups) and HIR-27 interview days: A–G 189 live, 11 gap, 6 wire, 92 not built, 5 phone, of 303.
Recounted by script 13 Nov 2026 on `feat/yukthix-careers-2` after the careers follow-ups (answers 351-353, 355-357, 359, 362): T9-09 WhiteLabel live (gap) → live; 2 new T9-09 stories drawn and live (JobInternationalPhone, PortalWithLogo); Job stays live (gap) for WhatsApp apply (354).
Recounted by script 13 Nov 2026 on `feat/yukthix-hir-23` after HIR-23 went live: its 4 stories design only → live, plus 2 new drawn stories for the gate (HIR-26 AiBlocked, HIR-25 AiBlocked); A–G 201 live, 11 gap, 6 wire, 83 not built, 5 phone, of 306.
Recounted by script 13 Nov 2026 on `feat/yukthix-hir-25` after HIR-25 went live: its 5 stories design only → 4 live and 1 live (gap, no recording provider), plus 4 new drawn stories (YourAnswer, NoProvider, TranscriptAdded, AiOff), all live; A–G 195 live, 11 gap, 6 wire, 87 not built, 5 phone, of 304.
Recounted by script 13 Nov 2026 on `feat/yukthix-hir-13` after merging `test/yukthix-main` (Settings rounds 2-3, HIR-09 follow-ups, HIR-28): A–G 187 live, 10 gap, 6 wire, 92 not built, 5 phone, of 300.
Recounted by script 13 Nov 2026 on `feat/yukthix-hir-13` after HIR-13 went live: Browse, Apply, NotEligible and Empty design only → live (no story added or removed; the two phone stories stay phone views); A–G 180 live, 12 gap, 6 wire, 96 not built, 5 phone, of 299. Settings 6.1 gained the drawn Internal jobs section inside the existing P6_1 stories.
Recounted by script 14 Nov 2026 on `feat/yukthix-offers-3` after answers 376, 402, 404, 423 and 443: 3 new stories drawn and live (HIR-04 BulkActionsOffers, HIR-27 RemoveSlot, 6.1 P6_1_StaleBandApprover): A–G 195 live of 308.
Recounted by script 14 Nov 2026 on `feat/yukthix-offers-3` after merging the careers follow-ups into `test/yukthix-main` (HIR-27 and HIR-28 in): A–G 192 live, 10 gap, 6 wire, 92 not built, 5 phone, of 305.
Recounted by script 12 Nov 2026 on `feat/yukthix-hir-28` after HIR-28 went live (all 4 stories).

Recounted by script 12 Nov 2026 on `feat/yukthix-hir-09` after merging the Settings 6.1 follow-ups with answers 332 and 334-337: A–G 179 live, 10 gap, 6 wire, 100 not built, 5 phone, of 300.

Recounted by script on `test/yukthix-main` after merging the Settings 6.1 follow-ups with HIR-10/20: A–G 176 live, 12 gap, 6 wire, 100 not built, 5 phone, of 299 (H: the old scorecard-templates group left with its page).
Recounted by script 10 Nov 2026 on `feat/yukthix-staffing-3` after answers 482, 483, 484 and 489: HIR-17 Bench live (gap closed); HIR-21 1 new drawn story (Review dispute).
Recounted by script 10 Nov 2026 on `feat/yukthix-staffing-3` after staffing slice 3: HIR-18 7, HIR-19 5, HIR-30 3 and HIR-31 5 stories design only → live (8 with a gap) plus 2 new HIR-18 stories (create invoices, draft) and 1 new HIR-17 story (weekly hours); HIR-21 Invoices → live (gap); HIR-14 Workspace and Contacts gaps closed or narrowed; section E has no design-only story left.
Recounted by script 10 Nov 2026 on `feat/yukthix-staffing-2` after staffing slice 2: HIR-16 6 and HIR-17 8 stories design only → live (4 with a gap) plus 6 new drawn stories (submit by email, desk off, new client job, new placement, add to bench, recruiter view); HIR-21 4 wire design and Scorecards → live (1 with a gap) plus 2 new (add vendor, share client job); Invoices stays design only (slice 3); Settings 6.2 gains the slice-2 policies.
Recounted by script 14 Nov 2026 on `feat/yukthix-staffing-1` after staffing slice 1: HIR-14 8 stories and HIR-15 5 stories design only → live (6 with a gap) plus 4 new drawn stories (add client, add contact, desk off, add role); Settings 6.2 P6_2 and P6_2_ReadOnly → live plus the new invoice series story.
Recounted by script 14 Nov 2026 on `feat/yukthix-hir-27` after HIR-27 went live: its 4 stories design only → live (1 with a gap) plus 3 new drawn stories (some not sent, plan sheet, no days yet).
Recounted by script 12 Nov 2026 on `feat/yukthix-hiring-settings-2` after the Settings 6.1 follow-ups (answers 341, 345, 348): 5 new 6.1 stories drawn and live (edit, add, used and view-only scorecard; default recruiter no longer qualifies); the "Live · Job workspace and interviews" group's last stand-in story (Scorecards) was deleted with the /yx/hiring/scorecards page.
Recounted by script 11 Nov 2026 on `feat/yukthix-hir-09` after founder answers 332 and 334-337: HIR-09 HrEmployerCost and HIR-29 Reminder became live; a new T9-09 story (OfferSign, the e-sign accept page) is live.

Recounted by script 11 Nov 2026 on `feat/yukthix-hir-09` (merged with HIR-06/07 and Settings 6.1) after HIR-09 / HIR-29 went live: HIR-09 7 live and 3 live (gap), HIR-29 2 live and 2 live (gap); the HIR-05 Application offer story now opens the offer record (answer 301); the kit's CTC breakup table is live.
Recounted by script 11 Nov 2026 on `feat/yukthix-careers` after the careers site went live (decisions 8 and 10): T9-09 8 stories wire design → live (2 with a gap) plus 17 new (the pay question, on hold, and the drawn candidate pages: status 4, candidate page 3, offer 4, interview 4); Surfaces/Careers 18 → live (2 with a gap) plus 6 new (site settings, company pages, notices 2, company switch and assistant, full apply form); the 2 "Live · Careers site" stand-in stories were deleted with the stand-in.
Recounted by script 12 Nov 2026 on `feat/yukthix-hir-10-20` after HIR-10 (manual BGV) and HIR-20 (pools, postings) went live and answer 322 (scorecard comments) was built: HIR-10 6 wire design → live plus 3 new stories (RecordResult, Decide, AddCheck); HIR-20 3 → live plus 2 new (PoolMembers, NewPool); HIR-07 1 new (SubmittedComments, live); the "Live · Candidates" stand-in group (Pools, 1 story) deleted with `TalentPoolsScreen`.
Recounted by script 11 Nov 2026 on `feat/yukthix-hir-06-07` after HIR-06 and HIR-07 went live: HIR-06 3 stories wire design → live (the slot finder's 2 stay feature not built), HIR-07 4 → live plus 1 new story (Overseer); the 3 "Live · Job workspace and interviews" stand-in stories (Interview, InterviewSubmitted, MyInterviews) were deleted with the stand-ins.
Recounted by script 10 Nov 2026 on `feat/yukthix-hiring-settings` after Settings 6.1 Hiring went live (P6_1, P6_1_ReadOnly: wire design → live; new P6_1_StageTargets, answer 302) and four new drawn stories went live: HIR-02 Hiring manager cancel (293), HIR-12 All referrals undo paid (283) and paid outside payroll (285).
Recounted by script 10 Nov 2026 on `feat/yukthix-hir-04-followups` after founder answers 261 and 263: HIR-04 gained 3 sheet stories, HIR-05 the 2 Application stories, HIR-03 the Settings story; the 3 "Live · Job workspace" stand-in stories were deleted with the stand-ins.
Recounted by script 9 Nov 2026 on `feat/yukthix-hir-04` after HIR-04 went live (its 7 stories: wire design → live; no story added or removed). Before that, recounted on `feat/yukthix-hir-03-24` after HIR-01 (four new stories, Plans and NoPlans deleted), HIR-03 and HIR-24 went live and the HIR-03 follow-ups added the Change recruiter story (HIR-03 gained the Create job sheet story; the "Live · Jobs" stand-in and its 4 stories were deleted). First counted (the script is in the appendix): every `export const`
Recounted by script 9 Nov 2026 on `feat/yukthix-hir-05` after HIR-05 went live: the record (10 stories, one new: choose the duplicate), the new Candidate list (8) and Candidate data retention (9) designs (founder decision 9); the "Live · Candidates" stand-ins and 6 of their 7 stories deleted (Pools stays for HIR-20).
Recounted by script 9 Nov 2026 on `feat/yukthix-hir-03-24` after HIR-01 (four new stories, Plans and NoPlans deleted), HIR-03 and HIR-24 went live and the HIR-03 follow-ups added the Change recruiter story (HIR-03 gained the Create job sheet story; the "Live · Jobs" stand-in and its 4 stories were deleted). First counted (the script is in the appendix): every `export const`
Recounted by script 10 Nov 2026 on `feat/yukthix-hir-02-26` after merging HIR-04 (7 stories live) and the HIR-02 / HIR-26 follow-ups 252-257 (three new HIR-02 stories: Approver, Cancel requisition, Assign recruiter). Before that, recounted 9 Nov 2026 after HIR-02 (8 stories) and HIR-26 (4 stories plus 2 new: AI notes, plain search) went live. Before that, recounted on `feat/yukthix-hir-03-24` after HIR-01 (four new stories, Plans and NoPlans deleted), HIR-03 and HIR-24 went live and the HIR-03 follow-ups added the Change recruiter story (HIR-03 gained the Create job sheet story; the "Live · Jobs" stand-in and its 4 stories were deleted). First counted (the script is in the appendix): every `export const`
Recounted by script 9 Nov 2026 on `feat/yukthix-hir-11-12` after HIR-11 (5 stories) and HIR-12 (4 stories plus 3 new All referrals design stories, founder answer 204) went live on top of HIR-01. Before that, recounted on `feat/yukthix-hir-01` after HIR-01 went live (four new HIR-01 design stories; the stand-in's Plans and NoPlans stories deleted). First counted by script 9 Nov 2026 on `feat/yukthix-hiring-design-map` (the script is in the appendix): every `export const`
story with a capital first letter (the lower-case exports are sample props, excluded from Storybook by
`excludeStories`) in the 31 `hir-NN-*.stories.tsx` files, `hiring-kit.stories.tsx`, the five `hiring/live/*.stories.tsx`,
`portals/t9-09-careers.stories.tsx`, `portals/t9-15-identity.stories.tsx`, `stories/careers.stories.tsx` and the hiring
stories of `settings/settings-g6.stories.tsx` (Overview, OverviewLoading, the P6_1 stories, P6_2, P6_2_ReadOnly; 6.3
Performance, 6.4 Learning and 6.5 Assessments belong to other areas), against the rows in section 4. The script fails
unless each story file has exactly one row per story, in file order, with one of the five verdicts. Not counted: the
eight PRJ-01 … 08 project stories that live in the same folder (Projects is its own area).

The 5 phone views are the phone stories of the scorecard (HIR-07), referrals (HIR-12) and internal jobs (HIR-13): each is
a separate phone component (`ScorecardPhone`, `ReferralsPhone`, `InternalJobsPhone`) listed as `notLive` in the guard.
The careers site's phone stories (T9-09, Surfaces/Careers) are the public web page at phone width and are counted with
the web page.

## How it is wired today

- Every /yx/hiring page is a client page that reads the API with `useHiring` / `useHiringWrite` (`apps/web/lib/yx-hiring`)
  or the older hooks in `apps/web/lib/hooks` (`usePipeline`, `useCandidates`, `useJobBoards`, `useCareersSettings`) and
  renders a stand-in from `@yukthix/ui/hiring` (= `screens/hiring/live/index.ts`). grep for any HIR screen name
  (`HeadcountPlanScreen`, `RequisitionsScreen`, `PipelineBoardScreen`, `CandidateRecordScreen`, `OfferBuilderScreen`, …)
  in `apps/web` finds nothing; only `RequisitionSheet` is imported (from `@yukthix/ui/frame`, by /yx/people/team).
- The designed screens are in `screens/hiring/hiring-plan.tsx` (HIR-01, 02, 03, 11, 12, 13, 24, 26),
  `hiring-pipeline.tsx` (HIR-04 … 08, 25, 27), `hiring-offers.tsx` (HIR-09, 10, 20, 23, 28, 29) and
  `hiring-staffing.tsx` (HIR-14 … 19, 21, 30), parts in `hiring-kit.tsx`. Only `RequisitionSheet` has a `live` prop.
  Making one live means the usual pattern: `'live' in props ? <LiveX live={props.live} /> : <SampleX {...props} />`, the
  page passes real data, and the stand-in it replaces is deleted with its "Live ·" stories and tests.
- Permissions: plans `ats.headcount.manage`; requisitions `ats.requisition.raise`; jobs and the board `pipeline:manage`
  (write) / `results:view` (read); candidates `candidate:manage` / `candidate:view`; data rights `candidate:data_rights`;
  interviews `interview:view_assigned`; scorecard templates and pipelines `pipelines:configure`; careers, job boards,
  costs `org:manage_settings`; approval routes `approvals:configure`. Nav: `apps/web/lib/yx-nav.ts` lines 263-281.
- Outside the signed-in app: the careers site (/careers/[orgSlug], /careers/[orgSlug]/jobs/[slug], sitemap), apply
  (/apply/[applyToken]), application status (/application/[statusToken]), candidate portal (/portal/[portalToken]),
  offer (/offer/[token]), interview booking (/interview/[token]) and the agency portal (/agency/[token]). All are
  hand-written pages, not yx-ui screens.

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/hiring/plans | `HeadcountPlanScreen` with `live` (designed) | HIR-01 | `GET hiring/plans` (`ats.headcount.manage` or `ats.requisition.raise`), `POST/PUT hiring/plans`, `POST hiring/plans/:id/submit` (`ats.headcount.manage`), `GET hiring/plan-lines` | live |
| /yx/hiring/jobs | `JobsScreen` with `live` (designed, 9 Nov 2026): jobs and requisitions in one list, Create job sheet with pay range | HIR-02, HIR-03 list, HIR-24 | `GET/POST jobs`, `GET jobs/pay-settings`, `PATCH/DELETE jobs/:id`, `POST jobs/:id/submit`, `/approval/cancel` (`pipeline:manage`; refused while acting for someone else) | live |
| /yx/hiring/jobs/[id] | `JobWorkspaceScreen` with `live` (designed, 9 Nov 2026): overview, postings, pay range, settings (10 Nov 2026, answer 261) | HIR-03 workspace, HIR-24 | `GET jobs/:id` (`results:view`), `PATCH jobs/:id` (`pipeline:manage`) | live |
| /yx/hiring/jobs/[id]/pipeline | the designed `PipelineBoardScreen` with `live`, its Bulk actions and Add candidate sheets; a card opens the HIR-05 record with the application (offers there until HIR-09) | HIR-04, HIR-05 Application | `GET hiring/jobs/:id/board` (`results:view`), `POST hiring/entries/:id/move`, `/reject`, `/reject/undo`, `hiring/entries/bulk`, `PUT hiring/jobs/:id/scorecard` (`pipeline:manage`), `POST/GET pipeline/entries/:id/offers`, `/interviews`, `offers/:id/send`, `/submit`, `/withdraw` (`pipeline:manage`) | live |
| /yx/hiring/jobs/[id]/pipeline/list | `JobWorkspaceScreen` (stand-in, board removed): candidates list with bulk move / test / email / reject, Add candidate, Export, job settings; `ApplicationPanel`: interviews, offers, feedback | HIR-09 (application), none for the list and settings (question 261) | `hiring/entries/bulk`, `PUT hiring/jobs/:id/scorecard`, `POST jobs/:id/entries` (`pipeline:manage`), `POST/GET pipeline/entries/:id/offers`, `/interviews`, `offers/:id/send`, `/submit`, `/withdraw` (`pipeline:manage`) | wire design |
| /yx/hiring/candidates | `CandidateListScreen` with `live` (designed 9 Nov 2026, decision 9) | HIR-05 List | `GET/POST/PATCH candidates`, bulk delete, upload and invite, email, pools (`candidate:manage` / `candidate:view`; writes refused while acting) | live |
| /yx/hiring/candidates/[id] | `CandidateRecordScreen` with `live` (designed) | HIR-05 | `GET hiring/candidates/:id` (viewer-aware: contact details with `candidate:manage` or data rights; ex-employee match for people who may see the employee), `PUT …/legal-hold`, `POST candidates/:id/erase`, `GET …/export` (`candidate:data_rights`), `POST …/merge` (manage + data rights), `POST …/consents/withdraw`; writes refused while acting | live |
| /yx/hiring/duplicates | opens /yx/hiring/candidates?view=duplicates (the list's Possible duplicates tab) | HIR-05 List, Merge | `GET hiring/duplicates` (`candidate:manage`), merge (manage + `candidate:data_rights`) | live |
| /yx/hiring/pools | the designed `TalentCrmScreen` with `live` (12 Nov 2026; the `TalentPoolsScreen` stand-in is deleted): pools and hotlists with owner, last change and talent-pool consent count, members drawer with consent, new pool, delete, remove, open; job-board postings | HIR-20 Pools, Postings | `GET hiring/pools` (+ `consented`, `ownerName`, `updatedAt`), `GET …/members` (+ each member's `consent`) (`candidate:manage` or `candidate:view`); `POST/DELETE hiring/pools`, `POST/DELETE …/members` (`candidate:manage`; a talent pool takes only consented people; refused while acting); new `GET hiring/postings` (`pipeline:manage` or `results:view`); posting changes are `PATCH jobs/:id jobBoardIds` (`pipeline:manage`) | live |
| /yx/hiring/bgv | the designed `BgvTrackerScreen` with `live` (12 Nov 2026), menu Hiring › Background checks | HIR-10 (manual) | new `GET lifecycle/bgv` (`lifecycle.bgv.manage` in each joiner's scope; refused while acting; each look audited `bgv.tracker.viewed`), `POST lifecycle/joiners/:id/bgv/ask`, `/bgv/checks`, `POST lifecycle/bgv/checks/:id` (+ `checkedOn`; who checked, report version), new `POST lifecycle/bgv/checks/:id/decision`; evidence opens with `GET documents/:id/file?version=` (document keys) | live |
| /yx/hiring/retention | `CandidateRetentionScreen` with `live` (designed 9 Nov 2026, decision 9) | HIR-05 Retention | `POST hiring/retention/run`, `GET …/runs`, `POST hiring/data-requests/lookup`, export, erase (`candidate:data_rights`; a real run, export and erase refused while acting) | live |
| /yx/hiring/interviews | the designed `InterviewCalendarScreen` with `live` (11 Nov 2026); recruiters see the company week, everyone else their own interviews and scorecards; India time | HIR-06 | new `GET hiring/interviews?from=&to=` (≤ 62 days; `pipeline:manage` = company, else panel or the job's hiring manager), `GET hiring/interviews/mine` (+ overdue, setting `hiring.scorecard.overdue_hours`, default 24) | live |
| /yx/hiring/interviews/[id] | the designed `ScorecardScreen` with `live` (11 Nov 2026): the panellist's form, the panel's submitted scorecards, résumé, earlier rounds; recruiters resend or cancel here (answer 301) | HIR-07 | `GET hiring/interviews/:id`, `PUT …/scorecard`, `POST …/scorecard/submit` (own session only), `POST interviews/:id/send`, `/cancel` (`pipeline:manage`, own session only) | live |
| /yx/hiring/scorecards | removed 12 Nov 2026 (answer 345): permanent redirect to /yx/settings/hiring; `ScorecardTemplatesScreen` deleted | Settings 6.1 | `GET/POST/PUT/DELETE hiring/scorecard-templates` (`pipelines:configure`, never while acting; weights whole per cent adding to 100) | live |
| /yx/hiring/approval-routes | `ApprovalRoutesScreen` (stand-in) | Settings 6.1 | approval chains (`approvals:configure`) | wire design |
| /yx/hiring/careers | `CareersSiteScreen` (stand-in; the guard lists it as `portals: CareersSiteScreen`) | Surfaces/Careers page builder | `organizations/careers` (+ banner), `hiring/careers-entities`, `hiring/consent-notices` (`org:manage_settings`) | wire design |
| /yx/hiring/job-boards | `JobBoardsScreen` (stand-in): boards | HIR-03 Postings, HIR-20 Postings | `organizations/job-boards` (`org:manage_settings`) | wire design |
| /yx/hiring/costs | the designed `RecruitingCostsScreen` with `live` | HIR-11 | `GET/POST hiring/costs`, `PUT/DELETE hiring/costs/:id`, `GET hiring/costs/overview` (`ats.costs.manage`; writes refused while acting) | live |
| /yx/hiring/referrals | the designed `ReferralsScreen` with `live` | HIR-12 | `GET referrals/mine`, `/jobs`, `/policy`, `POST referrals` (anyone signed in; refused while acting) | live |
| /yx/hiring/referrals/all | the designed `AllReferralsScreen` with `live` | HIR-12 All referrals | `GET referrals`, `PATCH referrals/:id/reward` (`ats.referral.manage` or `candidate:view` / `pipeline:manage`; refused while acting; paid outside payroll and undo paid, answers 283 and 285) | live |
| /yx/hiring/internal-jobs | the designed `InternalJobsScreen` with `live` (13 Nov 2026) | HIR-13 | `GET internal-applications/jobs`, `/eligibility`, `/mine`, `POST internal-applications` (anyone signed in, own data only; rules from People and the `hiring.internal.*` settings; refused while acting); job switches `PATCH jobs/:id internalOpen / referralOpen` (`pipeline:manage`) | live |
| /yx/settings/hiring | the designed `SettingsPageScreen` (6.1) with `live`; scorecard templates in `ScorecardTemplateSheet` (answer 345) | Settings 6.1 Hiring | `GET/PUT hiring/settings` (read: `pipeline:manage`, `pipelines:configure`, `ats.headcount.manage`, `ats.referral.manage`, `ats.settings.manage`, `org.settings.manage`; change: `ats.settings.manage` or `org.settings.manage` company-wide, never while acting), `PATCH pipelines/stages/:id` (`pipelines:configure`) | live |
| /yx/hiring/requisitions | the designed `RequisitionsScreen` with `live`, its drawer and the designed `RediscoveryPanel` with `live`; the request sheet for managers | HIR-02, HIR-26 | `GET hiring/requisitions` (`pipeline:manage` / `ats.headcount.manage`: all; `ats.requisition.raise`: own, read-only), `GET hiring/requisitions/:id/rediscovery` (and `candidate:view` or `pipeline:manage`), `POST jobs/:id/submit`, `/approval/cancel`, `POST jobs/:id/entries`, `POST jobs/requisitions` (writes refused while acting) | live |
| /yx/people/team (Request a hire) | the designed `RequisitionSheet` with `live` | HIR-02 NewRequisition | `POST jobs/requisitions` (`ats.requisition.raise`) | live |
| /yx/people/onboarding/[id] | People onboarding (PPL design) with the joiner's BGV checks (the same store as /yx/hiring/bgv) | HIR-10 (manual part) | `POST lifecycle joiners/:id/bgv/ask`, `/bgv/checks`, `bgv/checks/:checkId` | live (HIR-10 is /yx/hiring/bgv) |
| /careers/[orgSlug], /jobs/[slug] | hand-written server pages | T9-09, Surfaces/Careers | public careers API | wire design |
| /apply/[applyToken] | hand-written apply form | T9-09 Job, Surfaces/Careers ApplyForm | public apply API | wire design |

## 2. Live pages with no design (stand-ins with nothing to wire to)

| page | what it does | suggestion |
|---|---|---|
| /application/[statusToken], /portal/[portalToken], /offer/[token], /interview/[token] | candidate's status page, portal, offer accept / decline, interview booking | candidate portal designs are needed (question 10) |
| /agency/[token] and v2 /settings/agencies, /agency-submissions | recruitment agencies submit candidates by link; the older v2 screens review them | HIR-21 covers part of it (question 1) |
| v2 /referrals | the older recruiter list of referrals | HIR-12 replaces it |
| ~~v2 /internal-mobility~~ | deleted 13 Nov 2026; redirects to /yx/hiring/internal-jobs | HIR-13 replaced it |

## 3. Designs with no live page or API

| design | what is missing | size |
|---|---|---|
| HIR-08 AI interview review | no async AI interview, recordings or advisory score | L |
| HIR-10 partner BGV | no BGV partner integration (founder decision 3: after a vendor contract); manual checks are live on /yx/hiring/bgv | M (per partner) |
| HIR-14 … 19, 21 (part), 30, 31 | the staffing-agency business: clients, rate cards, submissions to clients, placements, bench, invoices, receivables, fees, e-invoice | XL |
| HIR-22, T9-15 identity | no candidate ID or selfie check (People's face match waits for a provider too) | M + provider |
| HIR-25 recording provider | consent, the transcript by upload and the AI draft are live; no recording or transcription provider (question 431) | M + provider |
| HIR-27, 28 bulk day, bulk offers | no drive scheduling, no batch offers | M each |
| HIR-06 slot finder | no calendar free/busy (needs Google / Microsoft calendar link) | M + partner |
| Settings 6.2 Staffing desk | goes with the staffing business | with E |

## 4. Design groups, story by story

### A. Plans, requisitions, jobs and costs

#### HIR-01 · Headcount plan board

Live page: /yx/hiring/plans (menu Hiring › Headcount plan, `ats.headcount.manage` or `ats.requisition.raise`) renders
the designed `HeadcountPlanScreen` with `live` (branch `feat/yukthix-hir-01`, 9 Nov 2026). The stand-in
`HeadcountPlansScreen` and its "Live ·" stories are deleted. API: `GET hiring/plans` (HR: every plan with its route and
the viewer's own task; hiring manager: own department's approved plans, no budgets, setting
`ats.headcount_plan.manager_view`), `POST/PUT hiring/plans`, `POST hiring/plans/:id/submit` (an approved plan is
revised; refused while acting for someone else), decisions on `POST workflow/approvals/tasks/:id/decide`.

| story (sub-page) | verdict | note |
|---|---|---|
| HrApproved · HR · approved plan | live | HR with every plan approved; Export (CSV) and Revise plan |
| FinanceRevision · Finance · revision pending approval | live | whoever holds the approval task sees Send back / Approve revision and the route; the change is worded from the revision |
| HiringManager · Hiring manager · own department | live | decision 11: own department (or the subtrees they head), approved plan only, no budgets; Open requisition opens the PPL-08 sheet on that line |
| HrDepartments · HR · departments at different steps | live | plans are kept per department: each column shows Draft / Waiting / Sent back / Revision pending / Approved · vN |
| HrRevisePlan · HR · revise plan sheet | live | new plan, draft or revision of an approved plan; a line in use keeps its designation and at least its requisitions and hires |
| FinanceSendBack · Finance · send back with a reason | live | reason required; HR sees it on the board |
| HrOnly · Hiring manager · company shows HR only | live | only when the API refuses with code `HEADCOUNT_PLAN_HR_ONLY` (setting `ats.headcount_plan.manager_view` = off) |
| NoAccess · No access · no hiring role | live | any other 403 (no `ats.headcount.manage` and no `ats.requisition.raise`): kit NoAccessState, your System Admin gives it through Roles & access |
| Empty · Empty · no plan for the year | live | no plan for the chosen year (year Segment) |
| Loading · Loading | live | while `GET hiring/plans` loads |
| Error · Error | live | `GET hiring/plans` fails; Try again |

#### HIR-02 · Requisitions

Live 9 Nov 2026 (branch `feat/yukthix-hir-02-26`): /yx/hiring/requisitions renders the designed `RequisitionsScreen` with
`live` on `GET hiring/requisitions`. Recruiting (`pipeline:manage`) and HR (`ats.headcount.manage`) see every requisition;
a hiring manager (`ats.requisition.raise` only) sees the ones they raised or are hiring manager of, read-only, without plan
budgets (decision 11). A requisition is a job that went through the requisition flow (a reason, plan line, outside-plan
flag or approval request, or still draft / waiting). Status: draft, sent back (its latest request was rejected), pending
approval (waiting on the current step), approved (open or on hold), filled or closed. The drawer shows the route the
approvals engine ran (the company's own approvers, not the drawn HM → HRBP → Finance chain) and the sent-back reason.
Approvers decide in Approvals (`/workflow/approvals/tasks/:id/decide`); recruiting sends a draft or sent-back requisition
again and withdraws a waiting one; "Open job" opens the job workspace. Follow-ups 10 Nov 2026 (answers 252, 253, 257;
migration 202617h0000000): the approval task holder approves or sends back in the drawer; a hiring manager changes and
resends their own sent-back requisition; recruiting assigns a recruiter, duplicates and cancels with a reason
("Cancelled" status). Raising a requisition (`POST jobs/requisitions`) is now
refused while acting for someone else, and its "Send for approval" is never greyed out (pressed too early it shows each
missing field and focuses the first; also on People › My team and the plan board).

| story (sub-page) | verdict | note |
|---|---|---|
| Recruiter · Recruiter · all requisitions | live (gap) | live list, filters, search, export, row selection with Assign recruiter, Duplicate and Cancel (answer 253); saved views wait for the kit's view store |
| OutsidePlan · Outside plan · extra CFO approval | live | the "Outside the plan" step (holders of `ats.headcount.manage`) and the reason; the panel below shows past candidates |
| InPlan · In plan · short chain | live | plan line, free positions, budget left (not for hiring managers), the company's route |
| HiringManagerSentBack · Hiring manager · sent back | live | the reason shows; "Edit and resubmit" opens the request sheet filled in, `PUT jobs/requisitions/:id` (own, sent back only; answer 252) |
| NewRequisition · New requisition sheet | live | "New requisition" for `ats.requisition.raise` (not while acting); also on /yx/people/team and the plan board |
| Empty · Empty | live | no requisitions |
| Loading · Loading | live | while `GET hiring/requisitions` loads |
| Error · Error | live | it fails; Retry |
| Approver · Approver · approve or send back | live | the holder of the approval task (`myTaskId`): Approve, or Send back with a required reason, through `/workflow/approvals/tasks/:id/decide` (answer 257) |
| CancelRequisition · Cancel requisition · reason | live | `POST hiring/requisitions/:id/cancel` with a reason (`pipeline:manage`; withdraws a waiting approval, closes the job; refused once filled; audited; answer 253) |
| HiringManagerCancel · Hiring manager · cancel own waiting requisition | live | the same `POST hiring/requisitions/:id/cancel` with a reason for `ats.requisition.raise`: only the manager's own requisition (else 404), only while it waits for approval (else 409 with the reason), never while acting; audited `by: hiring_manager` (answer 293) |
| AssignRecruiter · Assign recruiter | live | `PATCH jobs/:id` `recruiterUserId` for each chosen requisition (answer 253) |

#### HIR-03 · Jobs and job workspace

Live 9 Nov 2026 (branch `feat/yukthix-hir-03-24`): /yx/hiring/jobs renders the designed `JobsScreen` with `live`, and
/yx/hiring/jobs/[id] the designed `JobWorkspaceScreen` (hiring-plan.tsx) with `live`. The stand-in list (`HiringJobsScreen`)
is deleted; the stand-in workspace (board, applications, job settings) moved to /yx/hiring/jobs/[id]/pipeline ("Open
pipeline") until HIR-04 is wired. Founder answers 222, 223, 225 and 229 built the same day (migration 202617c0000001):
a Recruiter on every job (default who opened it; Change recruiter in the job menu, `pipeline:manage`, audited
`job.recruiter_changed`), On hold (status `on_hold`: off the careers site, public applications and job boards, which all
read status `open`; the board sync retracts paid postings; candidates stay; Resume or Close), company job numbers
(JOB-0001 on, per company, from the `job_number_counters` row lock, never reused) on the list and the workspace, Export of
the visible columns as CSV, and a location from the masters for jobs of a legal entity outside India. Still waiting:
saved views (225) and Share with vendors (226); the Referrals & internal tab went live with HIR-13 (13 Nov 2026). The job form and the candidate pages read the custom field definitions from
`GET custom-fields/in-use` (results:view or pipeline:manage; ats.job.manage counts), so recruiters see them; the settings
list `GET custom-fields` stays `org:manage_settings` and is no longer called by these pages (it was refused for recruiters).

| story (sub-page) | verdict | note |
|---|---|---|
| List · Jobs list | live | `GET jobs` (`results:view`); job numbers, filters, search, Export CSV of the visible columns (CSV only, answer 241); row menu: copy careers link, send for approval, withdraw, put on hold, resume, close, reopen, delete (`pipeline:manage`); Recruiter column; saved views wait (225) |
| Workspace · Job workspace · overview | live | `GET jobs/:id` with `payLaw` and `postings`; job number; recruiter; stage counts from `GET jobs`; put on hold, resume, close, reopen; Open pipeline; the Referrals & internal tab (answer 226, HIR-13): Show on internal jobs and Open for referrals, `PATCH jobs/:id internalOpen / referralOpen`, toast |
| Postings · Job workspace · board postings (one failed) | live | `postings` (every company board, its publication status and error); post, refresh, retry, close by `PATCH jobs/:id jobBoardIds` |
| Empty · Empty | live | no jobs |
| Loading · Loading | live | while `GET jobs` loads |
| Error · Error | live | `GET jobs` fails |
| CreateJob · Create job sheet | live | added 9 Nov 2026 (the stand-in's new-job form, drawn from the kit): `POST jobs`; pay fields, plan line, replacement, custom fields, AI draft; outside India the API needs a location from the masters (229); a typed place carries its country and a foreign one is refused even under an Indian entity (244) |
| ChangeRecruiter · Job workspace · change recruiter | live | added 9 Nov 2026 (answer 222): `PATCH jobs/:id recruiterUserId` (`pipeline:manage`), audited; pressed with no change: field error |
| Settings · Job workspace · settings (tests, scorecard, applying, fit, stage targets) | live | added 10 Nov 2026 (answer 261, moved from the deleted /pipeline/list): `GET hiring/jobs/:id/interview-settings` (`results:view`), link / unlink a test, the stage that sends it, the scorecard (`pipeline:manage`; refused while acting), public applying and careers site, job boards, fit criteria with per-cent weights adding up to 100 (`PATCH jobs/:id`); stage targets (answer 263, `PATCH pipelines/stages/:id`, `pipelines:configure`, refused while acting); without the keys the values show as text |

#### HIR-11 · Recruiting costs entry

Live page: /yx/hiring/costs (Hiring › Reports & compliance › Recruiting costs, key `ats.costs.manage`: HR Admin and Recruiter
templates, System Admin, founder answer 202) renders the designed `RecruitingCostsScreen` with `live` (branch
`feat/yukthix-hir-11-12`, 9 Nov 2026). Costs left the Job boards stand-in. A referral bonus marked paid in All referrals
posts a read-only Referral bonus row (answer 203); assessments have no cost anywhere yet, so none is posted.

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Costs by type with cost per hire | live | `GET hiring/costs`, `GET hiring/costs/overview` (quarter in India time, its hires, jobs); spend and cost per hire add only this quarter; Edit / Delete (`PUT/DELETE hiring/costs/:id`) for typed rows, posted rows read-only (409); CSV export |
| AddCost · Add cost sheet | live | `POST hiring/costs`: rupees with paise, month as a Segment of the three months of this quarter, starting on this month (India time; the API refuses others, answer 206); never disabled, too-early errors; toast |
| Empty · Empty | live | no costs |
| Loading · Loading | live | while loading |
| Error · Error | live | API fails or no key; Try again |

### B. Candidates, pipeline and interviews

#### HIR-04 · Pipeline board

Live page: /yx/hiring/jobs/[id]/pipeline ("Open pipeline" on the job), since 9 Nov 2026 (branch `feat/yukthix-hir-04`): the
designed `PipelineBoardScreen` with `live`. Follow-ups 10 Nov 2026 (branch `feat/yukthix-hir-04-followups`, founder answers
261 and 263): "Bulk actions" and "Add candidate" are designed sheets on the board (every bulk function of the deleted
/pipeline/list kept: move, send a test, email, reject with a reason and an optional message that waits 24 hours, undo,
Export CSV); a card opens the HIR-05 candidate record with that application (`?entry=`; old links too); the job settings
moved to the HIR-03 workspace; each stage has an optional days target and limit (migration 202617i0000000, empty = none).
/pipeline/list, `ApplicationPanel` and the stand-in `JobWorkspaceScreen` are deleted.

| story (sub-page) | verdict | note |
|---|---|---|
| Recruiter · Recruiter · rich cards | live | `GET hiring/jobs/:id/board` (`results:view`): one column per stage (archived hidden, Hired collapsed), cards with email · source, Test / AI fit (advisory) / Panel chips, next step in India time, days in stage; the job picker lists open and on-hold jobs; a stage's days target (amber over it) and limit (column flagged over it) from `pipeline_stages.days_target` / `stage_limit` (answer 263, none by default) |
| HiringManager · Hiring manager | live | `results:view` without `pipeline:manage` (or acting for someone else): read-only, no drag and no Move menu, Share feedback; the API refuses moves (403) |
| MoveMenu · Move to menu (keyboard alternative) | live | `POST hiring/entries/:id/move` with `fromStatusId`: a repeat ("Already moved") and an out-of-date card are 409, exactly one of two moves at once lands; stage rules, audit `entry.stage_changed`; toast 5 s; a refused move goes back with an error toast |
| RejectReason · Reject asks for a reason | live | `POST hiring/entries/:id/reject` (reason required, 400 without), audit `entry.rejected`, toast with Undo; no candidate email unless `hiring.reject.email_candidate` is on (default off; then the Rejected template waits 24 h). Moving to Rejected through move is refused ("Use Reject") |
| Empty · Empty | live | job with no applicants; Add candidate opens the sheet |
| Loading · Loading | live | while loading |
| Error · Error | live | board or job fails to load; Retry |
| BulkActions · Bulk actions · tick candidates, then move, test, email or reject | live | added 10 Nov 2026 (answer 261): `POST hiring/entries/bulk` (move, assessment, reject; each move follows the stage rules and answer 272), `POST hiring/entries/:id/reject` and `/undo`, `POST bulk-candidate-email/by-entries`, `GET jobs/:id/candidates.csv` (`pipeline:manage`; refused while acting); toasts |
| BulkActionsOffers · Bulk actions · make bulk offers (offer-pay key) | live | drawn 14 Nov 2026 (answer 402): for holders of the offer-pay key, "Make bulk offers" opens the HIR-28 batch page with the ticked candidates already chosen (`?entries=`); without the key the button is not there |
| AddCandidate · Add candidate · existing candidate | live | added 10 Nov 2026 (answer 261): `POST jobs/:id/entries {candidateId}`; pressed too early: field error |
| AddCandidateNew · Add candidate · new candidate | live | `POST jobs/:id/entries {newCandidate}` (an email already known adds that person) |

#### HIR-05 · Candidate record

Live page: /yx/hiring/candidates/[id], the designed `CandidateRecordScreen` with `live` (9 Nov 2026, branch
`feat/yukthix-hir-05`); the stand-in `CandidateProfileScreen` is deleted. Merge: the designed `MergeDrawer` (record and the
list's Possible duplicates tab).

| story (sub-page) | verdict | note |
|---|---|---|
| Recruiter · Recruiter · default | live | `GET hiring/candidates/:id` (candidate keys); facts, applications, scores (with each interview in IST, opening HIR-07), consent & retention, activity built from the record; Email, Schedule interview and Move to next stage as drawn (answer 274: `pipeline:manage`, not while acting; the open application, `POST pipeline/entries/:id/interviews`, `POST hiring/entries/:id/move`), else Open in pipeline; menu (pool, merge, export, legal hold, erase) |
| ExEmployeeRecruiter · Ex-employee · recruiter sees exit details | live | People's person match (`personByEmail`, the one the offer hand-off uses); exit date and type need `lifecycle.exit.view`/`manage` reaching the person |
| RehireIneligibleHr · Ex-employee · rehire ineligible, HR can clear | live | rehire eligibility needs `lifecycle.exit.confidential.view`; Clear flag uses the existing `PUT lifecycle/exits/:id/hr` (exit manage + confidential) with a reason. Answer 272: with company setting `hiring.rehire_flag.blocks_screening` on (default off) every move past the first stage is refused (409) until HR clears it |
| ExEmployeeHiringManager · Ex-employee · hiring manager sees flag only | live | flag only for a viewer with `employee.profile.view` reaching the person and no exit key; nobody who may not see the employee gets even the flag |
| Merge · Merge duplicate · field-level choice | live | `POST hiring/candidates/:id/merge` now needs `candidate:manage` AND `candidate:data_rights`; confirm says what happens; audited |
| MergeChooseDuplicate · Merge with another candidate · choose the duplicate first | live | new story (kit first): the record's menu merge picks the other candidate; "Record to keep" choice |
| IdentityFlag · Identity review flag | design only, feature not built | no candidate identity check (HIR-22) |
| Minor · Under 18 · guardian consent pending | design only, feature not built | no date of birth / guardian consent on candidates |
| NoAccess · No access | live | 403 without a candidate key |
| NotFound · Not found (anonymised) | live | 404, or an erased candidate |
| Application · Application · messages, notes, offers | live | added 10 Nov 2026 (answer 261, moved from the deleted `ApplicationPanel`): the record's `?entry=` or Open application; stage, reject / undo, owner, checklist, fit, email / SMS / WhatsApp / survey, notes, offers (listed; made and worked on the HIR-09 pages); toasts. Interviews left it 11 Nov 2026 (answer 301): schedule on the record header, open / resend / cancel on HIR-07, the list on HIR-06 and the record's Scores tab |
| ApplicationOffer · Application · an offer opens its record (HIR-09) | live | HIR-09 (answer 301): the Offers tab lists the offers (pay text only with the key) and opens the offer builder or record; approvers decide in the approvals inbox |
| ApplicationSendNotice · Application · send the New York City notice (never told) | live | drawn 17 Nov 2026 (answer 531): a candidate added by hand who was never sent the notice (added before the setting was on, or the email failed): "Send the New York City notice" (`POST hiring/entries/:id/tool-notice`, `pipeline:manage`, not while acting); the same email, audit and notice-day start as 502; claimed before sending, so a second press is 409 and never a second email |
| ApplicationRecordAlternative · Application · record a request for another process (New York City) | live | drawn 16 Nov 2026 (answer 502): where the notice applies (board row `toolNotice`), the recruiter records a request made by phone or email (`POST hiring/entries/:id/alternative-process`, `pipeline:manage`, not while acting, audited); it then shows like an apply-form request |
| ApplicationAlternative · Application · asked for another process (New York City) | live | drawn 15 Nov 2026 (answer 474): the applicant ticked "Assess me another way" on a NYC job; the drawer says so with the day (board row `alternativeRequestedAt`); the AI draft scorecard is not used for them |

#### HIR-05 · Candidate list

Live page: /yx/hiring/candidates (and /yx/hiring/duplicates, which opens the Possible duplicates tab). Designed 9 Nov 2026
from kit parts (founder decision 9): `CandidateListScreen` in `hiring-candidates.tsx`; the stand-in
`HiringCandidatesScreen` and `DuplicatesScreen` are deleted. Every stand-in function kept (search, active / inactive,
stage, add / edit with custom fields, upload and invite, invite, email, add to a list, re-engage, deactivate, delete).

| story (sub-page) | verdict | note |
|---|---|---|
| Recruiter · Recruiter · default | live | `GET candidates` (server paging and filters), `POST/PATCH candidates`, bulk delete, invitations, email, pools (`candidate:manage`; writes refused while acting) |
| HiringManager · Hiring manager · read-only | live | `candidate:view` only: no add, upload, bulk actions or duplicates tab |
| Empty · Empty · first use | live | no candidates |
| Loading · Loading | live | while loading |
| Failed · Error | live | API fails |
| NoAccess · No access · no candidate key | live | drawn 13 Nov 2026 (Hiring walk, answer 476): the page opened without a candidate key (managers, employees) says so; no table, no requests the API would refuse |
| Duplicates · Possible duplicates | live | `GET hiring/duplicates` (`candidate:manage`) |
| DuplicatesNoMergeKey · Possible duplicates · no data-rights key | live | pairs shown, no merge |
| MergePair · Possible duplicates · compare and merge | live | `MergeDrawer` with Record to keep; `POST hiring/candidates/:id/merge` |

#### HIR-05 · Candidate data retention

Live page: /yx/hiring/retention. Designed 9 Nov 2026 from kit parts (founder decision 9): `CandidateRetentionScreen` in
`hiring-candidates.tsx`; the stand-in of the same name is deleted.

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · default | live | `GET hiring/retention/runs`; period = company setting `ats.retention_months` (default 12) |
| Preview · Preview · changes nothing | live | `POST hiring/retention/run` `{ dryRun: true }` |
| RequestFound · Data request · person found | live | new `POST hiring/data-requests/lookup` (email in the body), `GET candidates/:id/export`, `POST candidates/:id/erase` (all `candidate:data_rights`; export and erase refused while acting; erase audited) |
| RequestOnHold · Data request · on legal hold, no erase | live | the API refuses erase under legal hold (409) |
| RequestNobody · Data request · nobody with that email | live | `{ match: null }` |
| PeriodReadOnly · Period · no settings key | live | without `org.settings.manage` |
| NoRuns · First use · no runs yet | live | empty history |
| Loading · Loading | live | while loading |
| NoAccess · No access · no data-rights key | live | 403 |

#### HIR-06 · Interview calendar

Live page: /yx/hiring/interviews, the designed `InterviewCalendarScreen` with `live` (11 Nov 2026, branch `feat/yukthix-hir-06-07`); the stand-in `MyInterviewsScreen` and its story are deleted. Its Scorecards-to-do filter became the order of the list (overdue, to fill, the rest).

| story (sub-page) | verdict | note |
|---|---|---|
| RecruiterWeek · Recruiter · week | live | new `GET hiring/interviews?from=&to=` (company-wide for `pipeline:manage`); IST; an entry opens HIR-07; Find a slot hidden until the slot finder exists |
| SlotFinder · Slot finder · proposed slots ranked | design only, feature not built | no panel calendar free/busy (needs a calendar partner); candidate self-booking slots exist (`booking-slots.ts`) |
| UnknownAvailability · Slot finder · required panelist has no calendar | design only, feature not built | same |
| Interviewer · Interviewer · my interviews and scorecards | live | `GET hiring/interviews/mine` (only interviews they are on) plus the range for the agenda; badges due / overdue (company setting) / started / submitted / cancelled; Fill scorecard or Open goes to HIR-07 |
| Empty · Empty · interviewer with nothing assigned | live | empty `mine` |

#### HIR-07 · Scorecard form

Live page: /yx/hiring/interviews/[id], the designed `ScorecardScreen` with `live` (11 Nov 2026); the stand-in `InterviewScreen` and its two stories are deleted. Ratings and the recommendation became joined Segment controls (house rule); Submit is never disabled (pressed too early it names the gap and focuses it); a Summary field was added to the design (the API had it). Scale and pass bar come from the job's scorecard template (one pass bar for every item; weights shown as per cent of the total).

| story (sub-page) | verdict | note |
|---|---|---|
| Blank · Interviewer · blank | live | `GET hiring/interviews/:id` with the job's (or the interview's) scorecard template |
| MeetsBar · Complete · meets the bar, next-step prompt | live | Save draft = `PUT hiring/interviews/:id/scorecard` (only the interviewer sees a draft; refused while acting); toast |
| BelowBar · Complete · below the bar on 2 skills | live | same; "Below pass bar" per item against the template's bar |
| IdentityFlag · Identity flag shown, not a reason | design only, feature not built | no candidate identity check (HIR-22) |
| Submitted · Submitted · read only | live | `POST …/scorecard/submit` after a confirm: read-only, audited (`ats.scorecard.submitted`), a second submit 409; colleagues' submitted scorecards then show (D7). "Add comment" goes to the comment area (answer 322, next row) |
| SubmittedComments · Submitted · comments (append-only) | live | answer 322 (12 Nov 2026), kit story first (Time and activity › Comment thread, append-only): `POST hiring/interviews/:id/scorecards/:scorecardId/comments` under a submitted scorecard only (a draft 409); whoever may read that scorecard (the panellist, colleagues after their own submit, recruiters, the job's hiring manager; anyone else 404); never while acting (403); append-only (a table trigger refuses edits; the candidate erase redacts the text); audited `ats.scorecard.commented` without the text; a request key makes a retry the same comment; toast |
| Overseer · Recruiter or hiring manager · submitted scorecards, resend and cancel | live | new story 11 Nov 2026 (drawn in the same style): recruiters and the job's hiring manager read every submitted scorecard (never drafts) and the panel result; `pipeline:manage` resends or cancels (answer 301); each submitted scorecard shows its comments with a composer (answer 322) |
| Phone · phone | phone view, mobile app not built | `ScorecardPhone` |

#### HIR-08 · AI interview review player

No live page. Designed: `AiInterviewReviewScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| LowScore · Low advisory score · stays in review | design only, feature not built | no async AI interview, recordings or advisory score (question 2) |
| IdentityFlag · Identity and deepfake flag | design only, feature not built | same, plus HIR-22 |
| Decided · Decided · moved to panel | design only, feature not built | same |
| AlternativeProcess · Candidate asked for a human process | design only, feature not built | same |

#### HIR-27 · Bulk interview-day scheduler

Live 14 Nov 2026 (branch `feat/yukthix-hir-27`): /yx/hiring/interview-days (from Hiring › Interviews › Interview days)
renders the designed `BulkInterviewDayScreen` with `live`. API `GET/POST hiring/interview-days`, `GET
hiring/interview-days/options`, `GET hiring/interview-days/:id`, `POST …/:id/assign`, `POST …/:id/send`, all
`pipeline:manage` (the key that schedules interviews), writes never while acting (403), another company 404. Migration
`202617o0000002_hir27_interview_days` (three tables with RLS). Company settings (6.1): `hiring.interview_day.slot_minutes`
(30/45/60/90, default 45) and `hiring.interview_day.assign` (by slot as drawn / by panel, default by slot). Each candidate
becomes an ordinary HIR-06 interview (the panel as panellists, the room, the job's scorecard, the same invite emails)
when sent, row by row: a row that fails keeps its reason and never stops the others; a sent row is never sent again; a
retry reuses the interview already made; a second send while one runs is 409.

| story (sub-page) | verdict | note |
|---|---|---|
| Assigned · Auto-assigned · ready to send | live | Auto-assign places the job's candidates of the chosen stage (oldest in the stage first; erased, rejected and archived left out) by the company rule; rows already sent keep their place |
| OverCapacity · Over capacity · some unassigned | live | candidates who do not fit are listed (they get nothing) |
| NotAssigned · Empty · not assigned yet | live | a new day; Auto-assign |
| Sent · Invites sent | live (gap) | the WhatsApp reminder switch is hidden: no interview reminders exist (question 421) |
| SentSomeFailed · Invites sent · some not sent | live | new story (drawn): each row's badge (Invite sent / Not sent) and an alert listing each reason; Send again retries only those |
| Plan · Plan an interview day | live | new story (drawn): `InterviewDaySheet`: name, job, stage, day, first slot and number of slots (length from 6.1), panels with room and members; checked and focused before saving; a member on two panels is refused |
| NoDays · No interview days yet | live | new story (drawn): the empty page with Plan an interview day |
| RemoveSlot · Remove a slot · lunch break | live | drawn 14 Nov 2026 (answer 423): the plan sheet lists each slot to untick; on the board, Remove takes one slot out (`DELETE hiring/interview-days/:id/slots/:start`, audited); its unsent candidates wait again and Auto-assign skips it; refused for a slot with a sent invite (409), the last slot (400) or while sending |

### C. Offers, BGV and joining

#### HIR-09 · Offer builder

Live 11 Nov 2026 (branch `feat/yukthix-hir-09`, founder decisions 4 and 5): /yx/hiring/offers/new?entry= and
/yx/hiring/offers/[id]/revise render the designed `OfferBuilderScreen` with `live`; /yx/hiring/offers/[id] renders the
designed `OfferRecordScreen` with `live` (HIR-29 conditions tab inside). The HIR-05 Application drawer's Offers tab lists
the offers and opens these pages (answer 301). API: `GET hiring/offers/setup`, `POST hiring/offers/preview`,
`POST hiring/offers`, `GET hiring/offers/:id`, `POST hiring/offers/:id/versions`, `/submit`, `/conditions`, `/conditions/:id/met`,
`/waive` (`ats.offer.manage` or `pipeline:manage`; amounts and pay writes need `ats.offer.compensation.view`; writes
refused while acting for someone else); sending, the letter, withdraw and accept by link stay on `offers/:id/*` and
`public/offers/:token/*` (plus `POST public/offers/:token/esign-code`).

| story (sub-page) | verdict | note |
|---|---|---|
| WithinRange · Recruiter · within range, CTC breakup preview | live | CTC lines from the company's salary structure (Pay's own breakup for the work location, only lines inside the CTC); live, only holders of the offer-pay key reach the builder, so they see employer costs too (question 331) |
| HrEmployerCost · HR · employer costs, joining bonus with clawback | live | employer costs and the joining bonus with its clawback months are kept on the version and in the letter; answer 334: at joining the bonus is one-time pay in the first run (payroll's intake, linked to the offer), and a joiner who leaves within the months repays it in the final settlement (all of it, or pro rata: `hiring.offer.clawback_basis`) |
| AboveRange · Above range · extra approval | live | above the grade range adds one P03 step; who approves is `hiring.offer.band_approver` (default the HR head = head of the department coded HR, else the people with the offer-pay key); the sender never approves |
| Revision · Revision v2 · re-approval because CTC changed | live | `POST hiring/offers/:id/versions`; a changed CTC or grade goes back through approval, the earlier letter's link stops working; unchanged pay stays approved |
| Letter · Letter step | live | the company's offer templates; e-sign only when the template switches it on (one-time code by email and the disclosure, evidence kept); accept by link otherwise |
| AcceptedManual · Accepted · manual hand-off, HR creates employee | live | "Create employee" opens People › Ready to onboard (PPL-12, unchanged); at joining the offer's structure and fixed CTC go to Pay as the first salary, a pay change for approval |
| AcceptedRehire · Accepted · alumni rehire | live (gap) | the rehire is found and chosen in People's create drawer (unchanged); the offer record does not name the person type yet |
| PartialMatch · Accepted · partial match stops the hand-off | live (gap) | People's same-person check runs when HR creates the joiner; the offer record does not show a partial match |
| Reneged · Reneged · pre-boarding unwound | live (gap) | withdrawn and declined banners are live; reneging after acceptance is closed on the joiner in People (joining.service.ts), the offer record does not show it |
| Versions · Versions tab | live | every version with who, when, the note and whether it needed approval; an older text offer reads as version 0 (amounts and text only with the key) |

#### HIR-10 · BGV tracker

Live page: /yx/hiring/bgv (12 Nov 2026, branch `feat/yukthix-hir-10-20`), the designed `BgvTrackerScreen` with `live`, on the
checks People records on each joiner (one store, `bgv_checks`; People onboarding shows the same). Founder decision 3: manual
tracking now; the BGV partner and the candidate ID / selfie check wait for a vendor contract, so the partner-only parts
(Start BGV, partner package, partner status) are hidden behind the "No BGV partner" note and stay gaps. Only HR with the
background-check key (`lifecycle.bgv.manage`, in the joiner's scope) sees the page; nothing while acting; every look is
audited. A result records who checked it, the day (India date, not in the future, not before the check was added) and
its evidence (the person's BGV report document keeps each upload as a version; each check points at its version; the
virus scan runs after the commit and the report opens only when clean). A discrepancy goes to a person: proceed / do not
proceed with a reason, audited (`bgv.discrepancy.decided`); company setting `hiring.bgv.decider_other_person` (default
**on**: not the person who recorded it); "proceed" lets a "must be clear before joining" check pass; nothing is ever
withdrawn automatically ("do not proceed" only records it; HR cancels the joining on the onboarding page). A new result
clears an earlier decision. Columns show "Not added" for a check type the joiner has none of.

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · partner checks | design only, feature not built | no BGV partner integration (decision 3: after a vendor contract) |
| Discrepancy · Discrepancy · never auto-withdrawn | live | the drawer's alert shows what was found (the check's note) until a person decides |
| ConsentPending · Consent pending | live | consent pending or not asked: row button Resend consent link / Ask for consent (`POST joiners/:id/bgv/ask`), toast; the joiner consents in the joining portal |
| Manual · Manual tracking · no add-on | live | `GET lifecycle/bgv`; "No BGV partner" note; package = Manual · N checks |
| Empty · Empty | live | no joiner has checks or a consent request |
| Loading · Loading | live | while loading |
| Error · Error | live | API fails; Try again |
| RecordResult · Manual · record a result (who, day, evidence) | live | new story 12 Nov 2026: result (joined Segment), day, what was found (required for a discrepancy), report; `POST lifecycle/bgv/checks/:id` (version; 409 when someone else changed it); toast |
| Decide · Manual · a person decides the discrepancy | live | new story: `POST lifecycle/bgv/checks/:id/decision` (proceed / do not proceed, reason); the recorder sees "another person decides" instead of the button while the setting is on; toast |
| AddCheck · Manual · add a check | live | new story: `POST lifecycle/joiners/:id/bgv/checks` (needs consent; never for oneself); toast |

#### HIR-28 · Bulk offer screen

Live 12 Nov 2026 (branch `feat/yukthix-hir-28`): the job workspace's menu "Make bulk offers" (people with the offer-pay
key) opens /yx/hiring/jobs/[id]/bulk-offers, the designed `BulkOfferScreen` with `live`; sending opens
/yx/hiring/offer-batches/[id], the same screen's sent state. API: `GET hiring/offer-batches/setup?jobId=`,
`POST hiring/offer-batches` (rate-limited; refused while acting for someone else), `GET hiring/offer-batches/:id`
(`ats.offer.manage` or `pipeline:manage`; pay and making offers need `ats.offer.compensation.view`). Every row is an
ordinary HIR-09 offer made by the single-offer service: the band check and its extra step, the company's route (the
sender never approves), the company's conditions, the letter's e-sign, and an idempotent send. One bad row fails alone with
its reason; an application that already has an offer is skipped; the same batch key never sends twice. Settings:
`hiring.bulk_offer.plan_check` (hold, the starter, or off) and `hiring.offer.expiry_days` (7).

| story (sub-page) | verdict | note |
|---|---|---|
| Values · Per-candidate values · checks | live | the job's candidates without an open offer; CTC per row (inline edit); the grade range per row; rows beyond the free places on the job's plan line are held (in list order); pressed too early it names the candidates with no CTC |
| Template · Template step | live | letter kind, the company's salary structure, one joining date (drawn 12 Nov 2026 in place of "joining batch", question 401), work location and letter template (drawn, for e-sign) |
| Preview · Preview step | live | the chosen letter filled for the first selected candidate |
| Sent · Sent · batch status | live | the counts and each candidate's result with its reason and Open offer (drawn 12 Nov 2026: the results table); pay column only with the key |
| ValuesBlank · Per-candidate values · CTC left blank | live | drawn 16 Nov 2026 (answer 514): each Fixed CTC starts blank (never ₹0); Continue with a blank (or 0) names the rows and puts the cursor in the first one's cell (kit DataTable `openEdit`); the API refuses 0 or blank (400) |

#### HIR-29 · Offer conditions tab

Live 11 Nov 2026: the Conditions tab of /yx/hiring/offers/[id] (`OfferConditionsTab` with `live`). A new offer can start
with the company's list (`hiring.offer.default_conditions`, one a line, due on the joining day); add, mark met (with an
optional note) or waive with a reason (refused without one, never twice).

| story (sub-page) | verdict | note |
|---|---|---|
| OnTrack · Open conditions · on track | live | due by the joining day |
| Reminder · Overdue condition · lapse reminder | live | answers 335 and 336: HR is told on the joining day (once) about conditions still open; Send reminder emails the candidate the company's "Documents still due" template (only by the button, at most once a day) |
| Lapsed · Lapsed · pre-boarding unwound | live (gap) | founder answer 335: HR decides (nothing lapses or unwinds by itself); the alert says to decide, the design's automatic unwinding stays unbuilt by choice |
| AllMet · All met or waived | live | |

### D. Referrals, internal jobs, CRM and rediscovery

#### HIR-12 · Referrals

Live page: /yx/hiring/referrals (Hiring › Referrals for employees and anyone with a hiring key; never in a support session) renders the designed
`ReferralsScreen` with `live` (branch `feat/yukthix-hir-11-12`). `GET referrals/mine` (now with stage, joining day and the
bonus promised), `GET referrals/jobs`, `GET referrals/policy`, `POST referrals`. The bonus (default ₹25,000), the days
before it is due (default 90) and the days an own application blocks credit (default 90, answer 201) are company settings
`ats.referral.bonus_inr` / `qualify_days` / `self_apply_days` (Settings › Company rules › Referrals); the amount is kept on
each referral when it is made. The joining day and any exit come from People: leaving before the qualifying day means no
bonus (answer 205). HR's All referrals (answer 204) is at /yx/hiring/referrals/all (Hiring › Reports & compliance;
`ats.referral.manage` or `candidate:view`): `GET referrals`, `PATCH referrals/:id/reward` (paid only when due; refused
while acting). Founder answers 231 and 234 (10 Nov 2026, branch `feat/yukthix-hir-followups-2`): marking paid hands payroll
a one-time **Referral bonus** line (`referral_bonus`, source `m10`, linked `referral:<id>`) for the referrer's employee
record through `PayrollIntakeService.oneTime`, in this month or the next open one; the Recruiting cost is posted when the
run whose payslip carries that line is approved (outbox event `payroll.run.approved`, once per referral); undoing "paid"
cancels the line while no approved run has it (the cost goes too) and is refused with the month after. A resignation
waiting for approval shows **Bonus on hold** in both lists and refuses mark-paid with the reason.

| story (sub-page) | verdict | note |
|---|---|---|
| MyReferrals · My referrals and bonus status | live | tiles and rows; Applied / In process / Hired / Not selected; countdown from the accepted offer's start date (India time); paid or turned down from the reward status |
| Refer · Refer sheet | live | `POST referrals` with consent (audited); PDF résumé up to 5 MB; never disabled, too-early errors and focus; toast |
| Duplicate · Blocked · already applied | live | 409 when already referred for this role, or when the person applied for this job on their own within the set days (answer 201); the sheet says why |
| Empty · Empty | live | no referrals; no open jobs shows its own message in the sheet |
| Phone · phone | phone view, mobile app not built | `ReferralsPhone` |
| PhoneRefer · phone · refer | phone view, mobile app not built | same |
| AllReferrals · All referrals (HR) | live | /yx/hiring/referrals/all: tiles, filters by bonus and stage, Due on, amounts; Bonus on hold (answer 234) |
| AllReferralsMarkPaid · All referrals · mark bonus paid | live | confirm, then toast "Bonus sent to payroll"; the payroll line is made (answer 231); refused with the reason when not due, on hold, left early or the referrer has no employee record (409) |
| AllReferralsUndoPaid · All referrals · undo paid | live | row menu of a paid bonus: back to due (`PATCH referrals/:id/reward` `approved`); through payroll until an approved run has the line, outside payroll while its quarter is open; refused with the reason in the dialog after (answer 283) |
| AllReferralsPaidOutside · All referrals · paid outside payroll | live | Mark paid with "Pay through" (joined Segment: Payroll / Paid outside payroll); a referrer with no employee record is paid outside payroll without a choice; no pay line, the Referral bonus cost (origin "Paid outside payroll") is posted at once; audited (answer 285) |
| AllReferralsEmpty · All referrals · empty | live | no referrals |

#### HIR-13 · Internal jobs

Live page: /yx/hiring/internal-jobs (13 Nov 2026, branch `feat/yukthix-hir-13`; menu Hiring › Internal jobs for anyone
with an employee record, never in a support session) renders the designed `InternalJobsScreen` with `live`. API (all the
signed-in person's own): `GET internal-applications/jobs` (open jobs with "Show on internal jobs" on, never a job the
person is the hiring manager of), `GET …/eligibility` (the company rule, the reason and the day it opens, the manager's
name and when they are told), `POST internal-applications` (note required, optional PDF résumé up to 5 MB; refused while
acting for someone else; 404 for a job not on Internal jobs or another company's, 409 closed / on hold / already
applied, 403 not eligible or the job's own hiring manager), `GET …/mine`. Founder decision 6 as company settings with
defaults, on Settings 6.1 (new drawn section "Internal jobs", audited, the page's keys): `hiring.internal.after_probation`
(on), `hiring.internal.months_in_role` (12; counted from the start of the current designation) and
`hiring.internal.tell_manager` (When they apply / At the offer stage; default when they apply). Someone serving notice or
with no current employee record can never apply. The current manager is told by a bell notice and email
(`hiring.internal.applied`), never asked, and sees nothing of the application (no candidate, notes or tests). New table
`internal_applications` (RLS) keeps the person's words, their manager and when the manager was told; the words also go
to the application's notes for the hiring team. The job workspace's "Referrals & internal" tab is wired (answer 226):
`jobs.internal_open` and `jobs.referral_open` (both on by default; referrals respect it). The older v2 Internal Mobility
page is deleted; its addresses redirect here.

| story (sub-page) | verdict | note |
|---|---|---|
| Browse · Browse and my applications | live | the openings as drawn (department · location · type, posted date); My applications with Applied / Assessment / Interview / Offer / Selected / Not selected from the pipeline (Selected added for the hired stage) |
| Apply · Apply sheet | live | note required (too-early error and focus, never disabled), optional PDF résumé, the manager notice from the setting; toast "Applied for …"; refusals stay in the sheet |
| NotEligible · Blocked · not yet eligible | live | the company rule and the day it opens (probation, months in the role, notice, no employee record); Send says why and sends nothing |
| Empty · Empty · no openings | live | no openings / no applications |
| Phone · phone | phone view, mobile app not built | `InternalJobsPhone` |
| PhoneApply · phone · apply | phone view, mobile app not built | same |

#### HIR-20 · Talent CRM

Live page: /yx/hiring/pools (12 Nov 2026, menu Hiring › Talent CRM), the designed `TalentCrmScreen` with `live`; the
`TalentPoolsScreen` stand-in, its story and test are deleted (every function kept: lists, create, archive, members,
remove, open). Consent shown: per pool the members with a current talent-pool consent, per member Given / Not given. The
design's Email / WhatsApp opt-in columns are not shown (no channel opt-in store; candidates only have opt-out flags), and
the Campaigns and Sourced tabs and New sequence are hidden (not built). Board setup stays on /yx/hiring/job-boards.

| story (sub-page) | verdict | note |
|---|---|---|
| Pools · Pools and hotlists | live | `GET hiring/pools` with owner, last change and the consent count; Delete pool (confirm, toast); New pool needs `candidate:manage` |
| Campaigns · Sequence and engagement timeline | design only, feature not built | one-off bulk email exists; no sequences or engagement timeline |
| SequenceBuilder · Sequence builder · consent-based audience | design only, feature not built | same |
| Sourced · Sourced profiles · pending consent | design only, feature not built | no sourcing |
| Postings · Job-board postings | live | new `GET hiring/postings`: open / on-hold jobs and any job still posted, with each board's posting (the same as the job workspace); Post / Refresh / Close with `pipeline:manage` (`PATCH jobs/:id`), toast |
| Empty · Empty | live | no pools |
| PoolMembers · Pool members · consent, open, remove | live | new story 12 Nov 2026: `GET hiring/pools/:id/members` with consent; Open the candidate; Remove after a confirm (`DELETE …/members/:candidateId`), toast |
| NewPool · New pool or hotlist | live | new story: type (joined Segment), name (pressed too early: field error and focus), purpose; `POST hiring/pools`, toast |

#### HIR-26 · Rediscovery panel

Live 9 Nov 2026 (branch `feat/yukthix-hir-02-26`) in the HIR-02 drawer: the designed `RediscoveryPanel` with `live` on
`GET hiring/requisitions/:id/rediscovery`. Founder decision 2: advisory only. A plain text match always picks and orders
the people (a word of the title or designation in their résumé title or a past role, or a skill found in the
requisition; location adds a reason). Only this company's candidates who gave talent-pool consent (not withdrawn), within
the retention period (`ats.retention_months`), not erased, merged, on legal hold, hired or already on the job; only for
viewers who may see candidates (`pipeline:manage` or `candidate:view`), a hiring manager only on their own requisitions.
With the company setting `hiring.rediscovery.ai` (default **off**) and an AI provider, the company's AI
(AiInvocationService: its provider and credit limit) adds a short note per person, shown as "AI note, advice only"; it
never adds, drops or reorders anyone. Only role facts and past role titles, skills, years and stage go to it (no names,
emails, phones or ids). Every run is audited (`ats.rediscovery.run`: mode, outcome, count, provider; never the prompt).
No AI runs while acting for someone else. Recruiting adds a person to the pipeline (`POST jobs/:id/entries`).

| story (sub-page) | verdict | note |
|---|---|---|
| OnRequisition · On the requisition · recruiter | live | in the HIR-02 drawer |
| Recruiter · Panel · recruiter | live | Add to pipeline; Contact opens the candidate email (`bulk-candidate-email/by-candidates`) only for an email opt-in, otherwise it says why (answer 254) |
| HiringManager · Panel · hiring manager | live | Suggest to recruiter: `POST hiring/requisitions/:id/rediscovery/:candidateId/suggest`, a bell notice to the recruiter, audited, once per person (answer 255) |
| NoMatches · Empty · no matches | live | nothing matches, or no consented candidates |
| AiNotes · Panel · AI notes, advice only | live | company AI setting on and a provider set up |
| PlainSearch · Panel · plain search, AI off | live | AI off, not set up, failed, or acting for someone else |
| AiBlocked · Panel · AI blocked, bias audit overdue (NYC) | live | drawn 13 Nov 2026 (HIR-23): a New York City requisition with the NYC setting on and no audit in the last year; the reason in a warning, plain search below |

### E. Staffing agency

Staffing desk slice 1 (14 Nov 2026, branch `feat/yukthix-staffing-1`): HIR-14 clients and HIR-15 rate cards are live, with
Settings 6.2. The desk is off until the company turns it on (`staffing.desk.enabled`, default off); then the Hiring
menu shows a "Staffing desk" group (Clients, Rate cards) to holders of `ats.staffing.manage` (account managers: clients,
contacts, pay rates, margins, invoice series; new template "Staffing account manager") or `ats.staffing.view` (recruiters:
clients and bill rates only). API `/staffing/*` (desk, clients, contacts, rates, rate changes, settings, invoice series);
writes are refused while acting (403); another company's records 404; migration `202617o0000003_staffing_1` (four
tables with RLS; the two keys; the GST state codes as a rule set `GST.STATE_CODES`, data not code). Money is paise
(BigInt) in the database and exact rupee text on the wire. HIR-16 … 19 and HIR-30, 31 have no page yet (slices 2 and 3).
HIR-21 overlaps with the recruitment-agency feature that exists (Agency, AgencyJob, AgencySubmission; public
/agency/[token]; older v2 /settings/agencies and /agency-submissions): slice 2 must build HIR-21 on those models and the
agency token page, adding the staffing parts (sub-vendor rate caps, duplicate checks) to them, never a second vendor
model. Scope: question 1.

Staffing desk slice 2 (10 Nov 2026, branch `feat/yukthix-staffing-2`): HIR-16 submissions, HIR-17 placements and bench
and HIR-21 vendors are live, with the slice-2 policies on Settings 6.2. Migration `202617o0000004_staffing_2`: three new
tables with forced RLS (`staffing_submissions`, `staffing_placements`, `staffing_bench`); client jobs are ordinary jobs
pointing at a client and its rate-card line (`jobs.staffing_client_id`, `staffing_line_id`); vendor documents, share
terms and the vendor's quote, consent and ownership are columns on the existing `agencies`, `agency_jobs` and
`agency_submissions` (one vendor model). A placement points at the client and the rate-card line; its bill rate is the
line's rate on the day, so a dated rate change flows through. Pay rates, vendor quotes, caps and margins go only to
account managers (vendor quotes and caps also to vendor managers, `ats.agency.manage`); recruiters never see them.
Vendors (Hiring › Vendors) work without the desk, for any company using recruitment agencies; only Forward to client
needs it. The older v2 /settings/agencies and /agency-submissions redirect to /yx/hiring/vendors (pages removed), and the
older allow-list and accept routes refuse a client job (it goes through the cap, duplicate and consent checks).

Staffing desk slice 3 (10 Nov 2026, branch `feat/yukthix-staffing-3`): HIR-18 invoices (with vendor invoices, answer
490), HIR-19 receivables, HIR-30 fees and guarantee and HIR-31 the e-invoice window are live, with Settings 6.2
reminders and e-invoicing, the client's TDS section and invoice grouping (answer 454) and the client portal per contact
(answer 453, T9-06: drawn sign-in by email code; jobs, submissions, timesheets and invoices tabs live; interviews and
tickets not built, question 491). Migration `202617o0000005_staffing_3`: eight tables with forced RLS (weekly hours,
invoices and lines, receipts and allocations, client terms, vendor invoices, portal sessions); a credit-note counter on
the slice-1 series; key `ats.staffing.billing` (new template "Staffing finance"); rule sets `GST.STAFFING_RATE`,
`GST.EINVOICE_WINDOW` and `TDS.SECTIONS` (all verify; go-live lines for counsel and the CA). Invoices are drafted from
client-approved hours (a week counts in the month of its Monday) at the rate-card bill rate of that week, numbered from
the series only when issued (only up, never reused, at most 16 characters), and never edited after: credit notes (own
CN number) or cancel and reissue. The IRP is not connected: "Send for IRN" says so. Account managers read invoices and
keep hours and fees; recruiters see none of it.

#### HIR-14 · Clients

| story (sub-page) | verdict | note |
|---|---|---|
| List · Account manager · clients list | live (gap) | /yx/staffing/clients: name, GSTIN and state, status, contacts, contract end, account manager; search and status filter. Gap: open jobs, placements, receivable and overdue (slices 2, 3), portal invites (no client portal), saved views and export |
| Workspace · Client workspace · overview | live (gap) | /yx/staffing/clients/[id]: legal name, billing address, place of supply, payment terms (client's or the company default), TDS by client and invoice grouping (answer 454); Change client, Rate card, Fees and guarantee. Gap: Raise ticket (no client tickets) |
| Contacts · Client workspace · contacts and portal access | live | add, change, remove (after a confirmation), billing contact; one email per client; portal access per contact (answer 453): Invite (an email with the portal link), Invited, Active on the first sign-in, Remove (ends the sessions) |
| Contracts · Client workspace · contracts | live (gap) | contract start, end and notice from the client. Gap: contract documents, fees and guarantee (slice 3, HIR-30) |
| Slas · Client workspace · SLAs | live (gap) | first submission and client feedback days. Gap: ticket SLAs (no client tickets) |
| Empty · Empty | live | no clients yet, with Add client for account managers |
| Loading · Loading | live | |
| Error · Error | live | |
| AddClient · Add client | live | new story (drawn): `ClientSheet`: GSTIN checked (shape, check character, state code against the billing state from the rule set), contract dates, SLAs, payment terms; duplicates 409; a stale change 409 |
| AddContact · Client workspace · add contact | live | new story (drawn): `ContactSheet` |
| DeskOff · Staffing desk turned off | live | new story (drawn): the calm state while the desk is off (API 403 with that reason) |

#### HIR-15 · Rate cards

| story (sub-page) | verdict | note |
|---|---|---|
| Current · Account manager · current rates with margin | live | /yx/staffing/rate-cards?client=: bill, pay, gross margin (exact paise, one decimal), OT and holiday multipliers, valid from; a client picker |
| History · Dated history shown | live | Show expired rates: every dated version |
| ChangeRate · Dated rate change | live (gap) | a dated change: after the current start, no earlier than the company allows (`staffing.rate_change.backdate_days`, default today or later); the old rate ends the day before; pay never above bill; reason required; a replaced rate 409. Gap: "affects N active placements" (slice 2) |
| Recruiter · Recruiter · no pay rates or margins | live | `ats.staffing.view` only: the API never sends pay rates or margins |
| Empty · Empty | live | |
| AddRole · Add role | live | new story (drawn): `RateLineSheet`: role, skills, location, unit (Segment), bill and pay with the margin, the company's OT and holiday multipliers as defaults; the same role, skill and location twice 409 |

#### HIR-16 · Submissions board

| story (sub-page) | verdict | note |
|---|---|---|
| Board · Account manager · board | live | /yx/staffing/submissions: Submitted, Client review (the client's feedback SLA flags a late card), Interview, Selected, Rejected by client (a reason is required); each card shows the job, client, bill rate and source (Bench, Pipeline, Vendor: name); a move audited; a placed card cannot go back (409); a rejected card cannot come back once the person is submitted again (409) |
| Submit · Submit to client (bulk) | live (gap) | `SubmitToClientSheet`: a client job, people (bench first, then the job's pipeline), a contact, the bill rate from the rate card; one email to the contact; someone already submitted is reported, never sent twice. Gap: the client portal (question 453); email is the only way |
| Recruiter · Recruiter · submit sheet | live | `ats.staffing.view` submits and moves cards; the board never carries a pay rate |
| Empty · Empty | live | |
| Loading · Loading | live | |
| Error · Error | live | |
| SubmitByEmail · Submit to client · by email | live | new story (drawn): the live sheet; masked by default (`staffing.submission.mask_contact`, default on): the email names the people only |
| DeskOff · Desk off | live | new story (drawn) |
| NewClientJob · New client job · on a rate-card line | live | new story (drawn): `ClientJobSheet`: account managers open an ordinary job (pipeline, approvals, sharing) on a client's current rate-card line |

#### HIR-17 · Placements and bench board

| story (sub-page) | verdict | note |
|---|---|---|
| List · Placements list with margin | live (gap) | /yx/staffing/placements: person, client, supply, dates, bill rate, margin per unit (account managers only), status (ending soon within `staffing.placement.ending_soon_days`, default 30). Gap: approved hours (slice 3), saved views and export |
| Record · Placement record · ending soon | live (gap) | /yx/staffing/placements/[id]: bill rate on the day, pay or vendor rate, statutory cost (`staffing.statutory_cost_pct`, default 0) and margin for account managers. Gap: hours, billed, timesheet approver, commission and client notice (slice 3) |
| Extend · Extend (dated change) | live (gap) | a later last day and a reason, with the version (stale 409). Gap: rates change on the rate card (a dated rate change), not in this sheet |
| EndEarly · End early · confirmation | live | last day within the placement and a reason (client, performance, resigned); own payroll moves to the bench from the next day |
| VendorSupplied · Vendor-supplied placement | live | cost is the vendor's quote; no bench |
| Bench · Bench board · policy days | live | /yx/staffing/bench: days on the bench against `staffing.bench.max_days` (default 30), bench pay `staffing.bench.pay_pct` (default 50) and what follows `staffing.bench.after` (default redeploy or exit review); take off the bench. Answer 482: each finished pay month, every bench spell goes to payroll once as loss-of-pay days on the existing LOP input (source bench; added to a manual LOP of that month; a locked or frozen month is skipped). Answer 483: a nightly job ends an own-payroll placement past its last day (completed, audited) and benches the person from the next day unless re-placed or already on the bench. The exit review stays manual |
| BenchEmpty · Bench · empty | live | |
| Loading · Loading | live | |
| NewPlacement · New placement · from a selected submission | live | new story (drawn): `PlacementSheet`: a selected submission, once; a rate on the first day; a pipeline candidate joins as an employee first (question 481); placing takes the person off the bench the day before |
| AddToBench · Add to bench | live | new story (drawn): `BenchSheet`: active employees not placed and not on the bench |
| RecruiterView · Recruiter · no pay rates or margins | live | new story (drawn) |
| Hours · Placement record · weekly hours | live | new story (drawn): `PlacementHours`: account managers enter a week (Monday start, inside the placement); the client approves or sends it back in the portal, or the account manager records an approval naming the contact; an approved week is never changed |

#### HIR-18 · Invoices

| story (sub-page) | verdict | note |
|---|---|---|
| Finance · Finance · invoice list | live (gap) | /yx/staffing/invoices: number (draft until issued), client, date, period, type, taxable, GST, total, status (draft, issued, part paid, paid), IRN day from the rule set; Create invoices. Gap: export to accounting, bulk Send for IRN (IRP not connected), PDF (question 492) |
| AccountManager · Account manager · read only | live (gap) | `ats.staffing.manage` reads; no Create. Gap: Download (no PDF yet) |
| IntraState · Invoice · CGST + SGST, credit note | live | /yx/staffing/invoices/[id]: lines (hours × rate, overtime at the line's multiplier), CGST + SGST half each from `GST.STAFFING_RATE`; credit notes listed and opened |
| InterState · Invoice · IGST (inter-state) | live | supplier state from the series GSTIN (rule set `GST.STATE_CODES`) against the client's state |
| IrnWarning · Invoice · IRN day 28 warning | live | the banner from `GST.EINVOICE_WINDOW` (30 days, warn from 25; verify) when `staffing.einvoice.applies` is on |
| Empty · Empty | live | |
| Error · Error | live | |
| CreateInvoices · Create invoices · from approved hours | live | new story (drawn): `CreateInvoicesSheet`: client, month, series, PO; one draft a month or one per placement (the client's grouping) |
| Draft · Invoice · draft before issue | live | new story (drawn): issue (next number, today) or delete (hours free again) |

#### HIR-19 · Receivables and collections

| story (sub-page) | verdict | note |
|---|---|---|
| Ageing · Finance · ageing, TDS and disputes | live (gap) | /yx/staffing/collections: outstanding by client and ageing group, TDS receivable against the 26AS amount entered, disputes (pause reminders), next reminder on `staffing.dunning.schedule` (default standard). Gap: reminders are shown, not sent yet (question 493); disputes are per invoice, not per line |
| Receipt · Record part payment | live | `ReceiptSheet`: amount, date, client TDS (the client's section), allocations that must add up to amount + TDS, never more than outstanding; TDS spread in proportion |
| Empty · Empty · nothing outstanding | live | |
| Loading · Loading | live | |
| Error · Error | live | |

#### HIR-21 · Staffing vendors

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Register · one vendor pending documents | live | /yx/hiring/vendors: the existing agencies with PAN, GSTIN (must carry the PAN), TDS section, tier, agreement date and bank verified; status pending until every document is in; portal link, new link, stop sharing (what the older page did) |
| ShareJob · Share job · rate cap and masked client | live | `ShareJobSheet`: rate cap suggested as the bill rate less `staffing.vendor.target_margin_pct` (default 25), never above the bill rate; most submissions per vendor; last day; hide the client; a client job only to complete vendors; an ordinary job without a cap |
| Submissions · Vendor submissions · duplicate and over cap | live | the vendor's quote (exact paise), right to represent and consent; the first vendor holds a person for a job for `staffing.vendor.ownership_days` (default 90); a later vendor's submission, or one for someone already in the job's pipeline, is a duplicate (the vendor sees only "duplicate"); over the cap needs an exception with a reason; Forward to client (account managers, desk on) accepts into the pipeline and makes a client submission; ordinary jobs: Accept or Reject (recruiters) |
| Invoices · Vendor invoices · proposed from hours | live (gap) | answer 490: proposed per vendor worker and month from approved hours × the vendor rate; GST 18% when the vendor has a GSTIN; TDS by the vendor's section (`TDS.SECTIONS`; PAN of an individual 1%, others 2% for 194C); Vendor confirmed (their number), Mark paid. Gap: no consultant invoice in payroll yet (question 496) |
| Scorecards · Scorecards | live (gap) | submissions, duplicate rate, placements and tier. Gap: time to first submission |
| Empty · Empty register | live | |
| AddVendor · Add vendor · documents | live | new story (drawn): `VendorSheet` |
| ShareClientJob · Share client job · cap suggested, incomplete vendor blocked | live | new story (drawn) |
| ReviewDispute · Review dispute · override the duplicate with a reason | live | new story (drawn, answer 489): the design's Review dispute opens an override for an account manager (`ats.staffing.manage`): a reason (audited), then Forward to client; the other vendor is not told; the same person already submitted to the client job is refused (409) |

#### HIR-30 · Placement fee and replacement guarantee

| story (sub-page) | verdict | note |
|---|---|---|
| Percent · Account manager · % of CTC, replacement | live | /yx/staffing/clients/[id]/fees: fee as % of CTC (exact, 2 decimals) or fixed; conversion taper from month 0 that only goes down; guarantee days and free replacement or pro-rated credit; the example computed the same way |
| FixedRefund · Finance · fixed fee, pro-rated credit | live (gap) | staffing finance reads. Gap: fee invoices and guarantee credit notes are not raised from these terms yet (question 494) |
| OutsideGuarantee · Left after the guarantee period | live | |

### F. Compliance and fairness

#### HIR-22 · Identity strip

| story (sub-page) | verdict | note |
|---|---|---|
| Clear · Strip · all matched, interviewer attested | design only, feature not built | no candidate identity checkpoints (T9-15 needs a provider) |
| Flagged · Strip · mismatch and deepfake signal | design only, feature not built | same |
| Reverified · Strip · re-verified, flag closed | design only, feature not built | same |
| OnApplication · On the application | design only, feature not built | same |
| OnReviewPlayer · On the AI interview review player | design only, feature not built | same (HIR-08) |
| OnScorecard · On the panel scorecard | design only, feature not built | same |

#### HIR-23 · Bias audit record

Live 13 Nov 2026 (branch `feat/yukthix-hir-23`, founder decision 2, question 7): /yx/hiring/bias-audits (Hiring › Reports
& compliance › Bias audits; recruiting and the hiring settings holders) renders the designed `BiasAuditScreen` with `live`.
The company setting `hiring.bias_audit.nyc` ("We use an automated tool for jobs in New York City", default off; Settings
6.1, in the Interview notetaker section, audited) turns it on. The law is data: rule set `HIR.BIAS_AUDIT` (US-NY,
NYC Local Law 144: the city names that count, 12 months, the EEO-1 sex and race / ethnicity categories), marked verify
(GO-LIVE-CHECKLIST: counsel checks it). API: `GET hiring/bias-audits` (`ats.settings.manage`, `org.settings.manage` or
`pipeline:manage`), `POST hiring/bias-audits` (the hiring settings key for the whole company; refused while acting; the
date not in the future and still within 12 months; every law category once, selected ≤ assessed; https summary; a real
PDF report ≤ 5 MB), `GET hiring/bias-audits/:id/report` (a short-lived link; another company 404). Table `bias_audits`
(forced RLS, append-only; migration `202617r0000000_hir23_bias_audit` also inserts the rule-set row, under
`set_config('app.is_super_admin','on',true)`). The gate: with the setting on and no audit in the last 12 months, the
HIR-26 rediscovery AI notes (`ai: 'blocked'` with the reason, plain search still shown, audited) and the HIR-25 AI draft
scorecard (409 with the reason; the notetaker card says why before anyone presses Draft) are refused for jobs whose
company location is in a covered city (or whose free-text place names one); other jobs are not affected.

| story (sub-page) | verdict | note |
|---|---|---|
| Valid · Audit valid | live | the latest audit: auditor, date, valid until (12 months, the rule set), published summary, the impact-ratio tables from the entered results; Open audit report; Download export and Auditor access are hidden (question 472) |
| Overdue · Overdue · feature blocked for NYC jobs | live | the banner names the tools that are on; the gate refuses them for NYC jobs |
| RecordAudit · Record new audit | live | drawn 13 Nov 2026 into the drawer: the numbers per law category and the auditor's PDF report; never-disabled Save with field errors; toast |
| NotApplicable · Not applicable · NYC setting off | live | the NYC setting off (the default) |
| NoAccess · No access | live | drawn 13 Nov 2026 (Hiring walk, answer 476): opened without a hiring key |

#### HIR-24 · Job pay range fields

Live 9 Nov 2026: the Pay range tab of /yx/hiring/jobs/[id] renders the designed `JobPayRangePanel` with `live`. The law
comes from the rule set `HIR.PAY_TRANSPARENCY` (statutory_rule_sets, every row `verify`; migration 202617c0000000): India
(none), US-NY, US-CA, US-CO, US-WA, US-IL and the EU directive (a country list), matched by the location's state code, then
country, then list. Where no row applies, the company settings `hiring.pay_range.show` (default off) and
`hiring.pay_history.ask` (default off) decide (tenant, legal entity or location). The API refuses: minimum above maximum,
hiding the range or asking pay history where the law says so, publishing (careers, public applications or a board) without
both ends where required. Jobs now keep `salaryPeriod` and `askPayHistory`.

| story (sub-page) | verdict | note |
|---|---|---|
| RequiredMissing · Required by law · missing, publish blocked | live | New York location: Publish shows the issues and focuses Minimum; the API refuses too |
| RequiredFilled · Required by law · filled, pay-history banned | live (gap) | the switch is off and locked and the API refuses it; the public apply form does not ask the question yet (question 224) |
| CompanySetting · Company setting · range shown | live | India: the switch follows `showSalary`, its text the company setting |
| InvalidRange · Error · minimum above maximum | live | the screen and `PATCH jobs/:id` refuse it |
| InWorkspace · In the job workspace | live | /yx/hiring/jobs/[id] › Pay range |

#### HIR-25 · Interview notetaker consent

Live 13 Nov 2026 (branch `feat/yukthix-hir-25`, founder decision 2): the designed `NotetakerConsentPanel` on the HIR-07
interview page (/yx/hiring/interviews/[id]) when the company has the notetaker on, and the designed `DraftScorecardReview`
at /yx/hiring/interviews/[id]/draft. Company settings on Settings 6.1 › Interview notetaker (audited, the page's keys):
`hiring.notetaker.enabled` (off), `hiring.notetaker.ai_draft` (off), `hiring.notetaker.keep_days` (90). API (the panel and
the job's overseers; another company 404, off the panel 403, every write refused while acting): `GET hiring/interviews/:id/notetaker`,
`PUT …/notetaker/consent` (`me` = a panellist for themselves; `candidate` = recorded by the panel or a recruiter, with who
recorded it), `PUT …/notetaker/transcript` (a panellist, only with everyone's consent), `POST …/notetaker/draft` and
`GET …/notetaker/draft` (the panellist's own). Any "no", also a later one, deletes the transcript and every draft at once.
Provider: to decide; no recording or transcription provider is connected, so the transcript is added as a .txt file. The
AI draft goes through `AiInvocationService` (the company's AI, credits, logged; the prompt has the skills and transcript
only) and is a suggestion: the panellist confirms or changes each rating, picks a recommendation and submits their own
scorecard (`POST interviews/:id/scorecard/submit`, audited `fromDraft`); the draft is deleted then. The older
`POST interviews/:id/scorecard` notes-to-scorecard route, its service method and client are removed. Retention: the daily
candidate retention sweep deletes transcripts and drafts after the company's days; the candidate erase deletes them at
once. Migration `202617q0000000_hir25_notetaker` (three tables, forced RLS; schema only).

| story (sub-page) | verdict | note |
|---|---|---|
| AllConsented · All consented · recording | live (gap) | everyone's consent is recorded and shown; no recording provider is connected, so the badge stays "Not recording" and the transcript is added by upload (question 431) |
| OneDeclined · One declined · no recording | live | "… declined. No recording or transcript"; nothing can be added; a later "no" deletes the transcript and drafts |
| Waiting · Waiting for the candidate | live | "Recording starts only after every participant consents" |
| DraftReview · Draft scorecard · 1 of 4 confirmed | live | the panellist's own draft; the scorecard's scale; never-disabled Submit names what is missing and focuses it |
| DraftAllConfirmed · Draft scorecard · all confirmed, ready to submit | live | with the drawn recommendation Segment; submits the panellist's own scorecard; toast |
| YourAnswer · Your answer and the candidate's · asked | live | drawn 13 Nov 2026: I consent / I decline for oneself, Candidate agreed / declined for the candidate; withdraw asks first |
| NoProvider · All consented · no provider, add the transcript | live | drawn 13 Nov 2026: "No recording provider is connected"; a .txt file up to 200,000 characters |
| TranscriptAdded · Transcript added · draft with AI | live | drawn 13 Nov 2026: who added it and when; Draft my scorecard (AI badge) |
| AiOff · Transcript added · AI drafting off | live | drawn 13 Nov 2026: "AI drafting is off for your company. Fill the scorecard yourself." |
| AiBlocked · Transcript added · AI draft blocked (NYC, bias audit overdue) | live | drawn 13 Nov 2026 (HIR-23): the reason before anyone presses Draft; the API refuses the draft with 409 |

#### HIR-31 · E-invoice window banner

| story (sub-page) | verdict | note |
|---|---|---|
| DayTen · Day 10 · within window | live | `LiveEInvoiceBanner`: days and limits from the rule set `GST.EINVOICE_WINDOW` (verify) |
| DayTwentyEight · Day 28 · warning from day 25 | live | |
| DayThirtyThree · Day 33 · blocked after day 30 | live | Cancel and reissue: a full credit note and the same lines as a new draft |
| BelowThreshold · Entity below threshold · not applicable | live (gap) | e-invoicing off for the company (`staffing.einvoice.applies`, default off). Gap: per legal entity (question 495) |
| OnInvoice · On the invoice · Send for IRN blocked | live (gap) | Send for IRN says the IRP is not connected. Gap: IRP integration |

### G. Careers site, portals and settings

#### T9-09 · Careers site

Live (11 Nov 2026, founder decisions 8 and 10): /yx/careers/[org] (+ ?company=), /yx/careers/[org]/jobs/[slug] (with
Google for Jobs JSON-LD and /yx/careers/[org]/sitemap.xml), /yx/apply/[token], and the candidate pages outside the app
/yx/application/[token], /yx/candidate/[token], /yx/offer/[token], /yx/interview/[token] (old addresses redirect).
`CareersSiteScreen`, `CareersJobScreen` (`screens/portals/t9-candidate.tsx`) and the newly drawn candidate pages
(`screens/portals/t9-09-candidate-pages.tsx`) take a `live` prop.

| story (sub-page) | verdict | note |
|---|---|---|
| Home · Careers home | live | builder layout, banner as hero photo, company pages, assistant when on |
| HomePhone · Careers home · phone | live | same page at phone width |
| WhiteLabel · Careers home · white-label | live | answer 356: company setting `brand.white_label` (default off) hides "Powered by YukthiX" on the careers site, job page and every candidate page |
| NoJobs · Careers home · no open jobs | live | no open jobs |
| Job · Job page with pay range and apply | live (gap) | range only when the job shows it; Apply by and Experience shown when the job has them (answer 353; the job closes itself after that day); requirements stay in the description; no WhatsApp apply (354, with T9-20) |
| JobPhone · Job page · phone | live | same page at phone width |
| Applied · Job page · application sent | live | after apply |
| Closed · Job page · closed | live | closed, on hold or unknown link: "This role is not accepting applications" (answer 242) |
| JobPayQuestion · Job page · pay question where the law allows | live | answer 224: only where the job asks and HIR-24's law row allows; dropped by the API otherwise |
| JobOnHold · Job page · not accepting applications (on hold) | live | answer 242 |
| JobInternationalPhone · Job page · outside India (international number) | live | drawn 13 Nov 2026 (answer 359): a job whose place is outside India takes a number with any country code (kit `MaskedField` kind `intlPhone`) |
| JobNycNotice · Job page · New York City automated tool notice | live | drawn 15 Nov 2026 (answer 474): with "We use an automated tool for jobs in New York City" on, a NYC job shows the kit `AutomatedToolNotice` (the tool is used, what it assesses, the business days of notice from HIR.BIAS_AUDIT, how to ask for another process) and the apply form offers "Assess me another way" (kept on the application, audited) |
| PortalWithLogo · Candidate page · company logo | live | drawn 13 Nov 2026 (answers 357, 362): the kit `TenantLogo` in the portal header on every candidate page; offer and interview answers carry the company's logo, colour, careers link and white-label |
| Status · Application status | live | /yx/application/[token]: this application only, candidate words (no stage name) |
| StatusPhone · Application status · phone | live | same page at phone width |
| StatusDecision · Application status · decision made | live | rejected or archived |
| StatusNycNotice · Application status · New York City notice, ask for another process | live | drawn 16 Nov 2026 (answer 502): the link in the notice email (a candidate added by hand to a NYC job, setting on); the notice and "Assess me another way" (`POST public/applications/:token/alternative-process`, audited); once asked, the page says when |
| StatusNotFound · Application status · link not valid | live | unknown token |
| Portal · Candidate page | live | /yx/candidate/[token]: details, resume, own applications, interviews, offers, other open jobs |
| PortalPhone · Candidate page · phone | live | same page at phone width |
| PortalEmpty · Candidate page · no applications, full form to apply | live | one click only with a resume, no consent and no required questions |
| Offer · Offer to accept | live | /yx/offer/[token]: the existing accept-by-link; answers once, refuses expired |
| OfferPhone · Offer to accept · phone | live | same page at phone width |
| OfferSign · Offer · sign with a code (e-sign on) | live | drawn 11 Nov 2026 (answer 337): when the company's offer letter has e-sign on, the candidate agrees to sign electronically, gets a one-time code by email (`POST public/offers/:token/esign-code`) and enters it; Sign and accept sends the code and the agreement (evidence kept on the offer); pressed too early it names what is missing |
| OfferAccepted · Offer · accepted | live | after accept, or opened again later |
| OfferExpired · Offer · expired | live | past the answer-by date |
| Interview · Interview · choose a proposed time | live | /yx/interview/[token]: confirm, ask for another time, decline |
| InterviewPhone · Interview · phone | live | same page at phone width |
| InterviewSelfBook · Interview · book a free time | live | self-booking: free times from the panel's calendars, re-checked on booking |
| InterviewConfirmed · Interview · confirmed | live | confirmed time in the interview's time zone |

#### T9-15 · Candidate identity verification

| story (sub-page) | verdict | note |
|---|---|---|
| Consent · Consent (biometric) | design only, feature not built | no candidate ID or selfie check; needs a provider (question 3) |
| Id · ID document | design only, feature not built | same |
| Selfie · Selfie · camera live | design only, feature not built | same (the assessment's face enrolment is a different product part) |
| SelfieBlocked · Selfie · camera blocked | design only, feature not built | same |
| Verified · Verified | design only, feature not built | same |
| Mismatch · No match · human review, never auto-reject | design only, feature not built | same |
| ReVerify · Re-verification after a failed match | design only, feature not built | same |
| Fallback · Consent declined · ID check with a person | design only, feature not built | same |
| UnderEighteen · Under 18 · ID check only | design only, feature not built | same |

#### Careers

`Surfaces/Careers` (`stories/careers.stories.tsx`, `components/careers.tsx`: `CareersPage`, `PageBuilder`, `JobApplyForm`;
`components/careers-admin.tsx`: `CareersCompanyPages`, `CareersNotices`). The page builder is live at /yx/hiring/careers
(decision 8); `CareersPage` and `JobApplyForm` render inside the T9-09 screens.

| story (sub-page) | verdict | note |
|---|---|---|
| Classic · Classic | live | layout theme "Classic" (inside T9-09 careers home) |
| Compact · Compact | live | theme saved by the builder |
| Split · Split | live | same |
| TenantAccent · Tenant accent (#1F6F4A, 6.4:1) | live | accent saved by the builder; under 4.5:1 falls back |
| AccentTooLight · Tenant accent too light (falls back) | live | same |
| Mobile · Mobile | live | phone width |
| MobileSplit · MobileSplit | live | same, split layout |
| NoOpenJobs · NoOpenJobs | live | no open jobs |
| WhiteLabel · White-label (no Powered by) | live (gap) | no white-label setting (question 356) |
| MinimalPage · Minimal (hero text only, jobs) | live | the layout before anyone used the builder (headline + intro) |
| PageBuilderEditing · Page builder — editing | live | /yx/hiring/careers; edits are a draft until Publish |
| PageBuilderMobilePreview · Page builder — mobile preview | live | same |
| PageBuilderPublished · Page builder — published | live | published = the careers site is on and unchanged since Publish |
| PageBuilderLightAccent · Page builder — accent too light | live | same |
| PageBuilderSiteSettings · Page builder — site settings (photo, assistant, offline) | live | the old page's banner, assistant and on/off |
| CompanyPages · Company pages (one per company in the group) | live | /yx/hiring/careers, under the builder (the old stand-in's card) |
| PrivacyNotices · Privacy notices (versioned) | live | same |
| PrivacyNoticesNone · Privacy notices · none yet | live | same |
| CompaniesAndAssistant · Company switch and careers assistant | live | ?company= pages and the assistant on the public page |
| ApplyForm · ApplyForm | live | inside the T9-09 job page |
| ApplyFormMobile · ApplyFormMobile | live | same at phone width |
| ApplyFormSent · ApplyFormSent | live | after apply |
| ApplyFormFull · Apply form · notices, pay question and company questions | live | versioned notices, answer 224, candidate custom fields shown on apply |
| BrandPlaceholders · Logo and monogram (placeholders) | live (gap) | the company logo is not shown on the careers pages yet (question 357) |

#### Group 6 · Hiring & Assessments

Only the hiring stories of `settings/settings-g6.stories.tsx` (6.3 Performance, 6.4 Learning and 6.5 Assessments belong
to other areas). Since 10 Nov 2026 (branch `feat/yukthix-hiring-settings`) /yx/settings/hiring renders `SettingsPageScreen` with `live`
for 6.1; the group landing (`SettingsGroupScreen`) is not live. Since 12 Nov 2026 (branch `feat/yukthix-hiring-settings-2`,
answers 341, 345, 348) the seven hiring settings are on 6.1, scorecard templates are edited there and the /yx/hiring/scorecards
stand-in is gone. Approval routes, careers and job boards stay on their stand-in pages.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 6 · Hiring & Assessments | wire design | the group's landing in Settings |
| OverviewLoading · Group 6 · loading | wire design | same, loading |
| P6_1 · 6.1 Hiring | live | /yx/settings/hiring (Settings › Hiring & Assessments › Hiring) renders `SettingsPageScreen` with `live`: pipeline templates (read-only list, Stage targets per row), scorecard templates (skills with per cent weights, scale, pass bar; Add and Edit with the pipelines key, answer 345), default recruiter for new requisitions (only people with the recruiter key, answer 348), headcount plan mode (`ats.headcount_plan`, the joined Segment: Not used / Advisory / Required) and the hiring manager's view (`ats.headcount_plan.manager_view`), show the pay range and ask pay history on new jobs (`hiring.pay_range.show`, `hiring.pay_history.ask`, company value), “not eligible for rehire” stops at the first stage (`hiring.rehire_flag.blocks_screening`), a BGV discrepancy is decided by someone other than who recorded it (`hiring.bgv.decider_other_person`, default on, answer 362), candidate retention (`ats.retention_months`), AI notes on past candidates (`hiring.rediscovery.ai`), tell candidates not selected (`hiring.reject.email_candidate`), the referral rule (`ats.referral.bonus_inr`, `ats.referral.qualify_days`, one fixed row) and the self-apply days (`ats.referral.self_apply_days`) — all with their defaults (answer 341); HIR-09 (drawn 11 Nov 2026): who approves an offer above the pay range (`hiring.offer.band_approver`: HR head, hiring manager or a named person with the offer-pay key, answer 332), joining bonus clawback basis (`hiring.offer.clawback_basis`, answer 334), offer letters signed electronically (each offer template's e-sign switch, answer 337); the referral settings are on 6.1 only (answer 384, removed from Company rules). A default recruiter who goes stale is told once to the hiring settings holders (answer 385). `GET/PUT hiring/settings`: read by `pipeline:manage`, `pipelines:configure`, `ats.headcount.manage`, `ats.referral.manage` or the settings keys; changed by `ats.settings.manage` or `org.settings.manage` held company-wide, never while acting; every key and value checked before any write; audited `org.setting.changed`; toast. Gap: the designed fields with no setting yet (plan approvers, extra approver, replacement link, offer expiry, clawback, range check, offer template, hand-off, BGV packages and timing, consent renewal, minors, AI interview and languages, careers colour and heading, cost categories) are left out, not shown with sample data (answer 342); pay range and pay history values for one legal entity or location are not shown on 6.1 (question 382) |
| P6_1_ReadOnly · 6.1 Hiring · read-only | live | without the edit keys (or while acting): every value as text, no save, no edit buttons; the Request access button is not shown in live (no request flow, answer 349). With the pipelines key (not acting) Add scorecard and Edit still show on the scorecard list |
| P6_1_NoAccess · 6.1 Hiring · no access | live | drawn 13 Nov 2026 (Hiring walk, answer 476): opened with no hiring key: the no-access state, no "View only" badge |
| P6_1_StageTargets · 6.1 Hiring · stage targets | live | answer 302: Stage targets on a pipeline row opens `StageTargetsSheet`; `PATCH pipelines/stages/:id` (`pipelines:configure`, never while acting; audited); values checked and focused before saving; read-only without the key. The job's Settings tab shows them read-only with "Change in Settings" |
| P6_1_ScorecardEdit · 6.1 Hiring · edit scorecard | live | answer 345: Edit on a scorecard row opens `ScorecardTemplateSheet`; `PUT hiring/scorecard-templates/:id` (`pipelines:configure`, never while acting; audited `ats.scorecard_template.updated`); name, scale 3-10, pass bar 1 to the scale, skills with whole per cent weights adding to 100 (total shown live), what good looks like, from the competency library; pressed too early: field errors and focus; toast. Older 1-10 weights open as per cent |
| P6_1_ScorecardNew · 6.1 Hiring · add scorecard | live | Add scorecard: `POST hiring/scorecard-templates` (audited `ats.scorecard_template.created`); one skill at 100 % to start |
| P6_1_ScorecardUsed · 6.1 Hiring · used scorecard (saved as a copy) | live | a template already used by a scorecard is never changed: “Save as a copy” posts a new template named “(copy)”; the API refuses a change with 409 |
| P6_1_ScorecardView · 6.1 Hiring · scorecard, view only | live | the view-only sheet (skills with per cent, scale, pass bar) is drawn; live shows the list rows read-only without the pipelines key instead of opening it. Archive scorecard (danger, after a confirmation): `DELETE hiring/scorecard-templates/:id`, jobs using it go back to no scorecard, filled scorecards keep it |
| P6_1_StaleRecruiter · 6.1 Hiring · default recruiter no longer qualifies | live | answer 348: a stored default who left or no longer holds the recruiter key reads as None with a warning naming them; new requisitions start with no recruiter (`defaultRecruiter`); the API refuses anyone else as default with 400, on both `PUT hiring/settings` and `PUT org/settings` |
| P6_1_NycHint · 6.1 Hiring · AI on with a New York City location | live | drawn 15 Nov 2026 (answer 473): AI notes on past candidates or the AI draft is on, the company has a location in New York City (HIR.BIAS_AUDIT's city rules; `GET hiring/settings` `nycLocations`) and the NYC switch is off: a warning on the switch; nothing is blocked |
| P6_1_StaleBandApprover · 6.1 Hiring · approver above the range can no longer approve | live | drawn 14 Nov 2026 (answer 376): a named approver who left or lost the offer-pay key stays named ("(cannot approve)") with a warning; the step goes to the company admins until HR chooses again |
| P6_2 · 6.2 Staffing desk | live (gap) | /yx/settings/staffing: turn on the staffing desk (`staffing.desk.enabled`, default off, drawn), the rate-change backdating (`staffing.rate_change.backdate_days`, default 0, drawn), OT and holiday multipliers (1.5 and 2), default payment terms (30 days), invoice numbering (one series per GSTIN per financial year; the next number only goes up) and the r.46(b) law row. Changed by `ats.staffing.manage` or `org.settings.manage` company-wide, never while acting; audited. Slice 2 (drawn, live): submissions and placements (mask contact details, ending soon days, statutory cost %), vendors (target margin for the rate cap, ownership days) and the bench policy (bench pay, maximum days, then review or unpaid; a Segment). Gap: collections, dunning, client-portal times and e-invoicing (slice 3) are left out |
| P6_2_ReadOnly · 6.2 Staffing desk · read-only | live | recruiters (`ats.staffing.view`) read it |
| P6_2_InvoiceSeries · 6.2 Staffing desk · add invoice series | live | new story (drawn): `InvoiceSeriesSheet`: the GSTIN must be one of the entity's registrations; a duplicate year and GSTIN 409; the number cannot go back |

### H. Kit and "Live ·" groups (not designs)

The Kit is shared parts; the "Live ·" groups are pictures of today's stand-ins (a story drawn from the live screen is not
a design, BUILD-STANDARD rule 1). Each "Live ·" story is deleted with its stand-in when its HIR design is wired.

#### Kit · Hiring and projects building blocks

| story (sub-page) | verdict | note |
|---|---|---|
| Tiles · SummaryTiles | wire design | used by HIR list screens |
| Pipeline · PipelineFacts | wire design | HIR-04 cards |
| Consent · ConsentBadges | wire design | candidate channel consent exists |
| ExEmployee · ExEmployeeBanner · recruiter and HM | live | HIR-05 record (levels: flag, exit, rehire) |
| Identity · IdentityStrip | design only, feature not built | HIR-22 |
| Postings · PostingStrip | wire design | job boards |
| EInvoice · EInvoiceBanner · warning | design only, feature not built | HIR-31 |
| Ctc · CtcBreakupTable | live | HIR-09 builder and offer record |
| Recording · RecordingPlaceholder | design only, feature not built | HIR-08, 25 |
| Slots · SlotGrid | design only, feature not built | HIR-06 slot finder |
| Budget · BudgetBars | design only, feature not built | Projects (no projects API) |
| Status · StatusLine | wire design | publish readiness (HIR-03, 24) |

#### Live · Careers site and job boards

| story (sub-page) | verdict | note |
|---|---|---|
| JobBoards · JobBoards | live | /yx/hiring/job-boards; goes with HIR-03 / 20 postings (costs moved to HIR-11) |
| NoJobBoards · NoJobBoards | live | same, empty |

#### Live · Plans and approvals

| story (sub-page) | verdict | note |
|---|---|---|
| Routes · Department head | live | /yx/hiring/approval-routes; goes with Settings 6.1 |

## 5. Two designs for one job

| job | design 1 | design 2 | suggestion |
|---|---|---|---|
| Public careers site and apply | T9-09 (`portals/t9-candidate.tsx`, 8 stories) | Surfaces/Careers (`components/careers.tsx`, 18 stories, with the page builder and apply form) | keep T9-09 for the public pages, Surfaces/Careers' page builder for the admin page; drop the other half (question 8) |
| Job workspace | `JobWorkspaceScreen` in `hiring-plan.tsx` (HIR-03, live at /yx/hiring/jobs/[id]) | `JobWorkspaceScreen` in `live/job-workspace.tsx` (stand-in, now /yx/hiring/jobs/[id]/pipeline) | same name, two files: rename nothing; since HIR-04 the stand-in has no board and serves only /pipeline/list (candidates list and job settings, question 261); delete it when those have designs |
| Pools and postings | HIR-20 Talent CRM tabs | HIR-03 Postings tab | both read the same publications; one source of truth (the API), two views is fine |

## 6. Questions for the founder (before building)

1. **Staffing agency (HIR-14 … 21, 30, 31, Settings 6.2: 54 stories).** These are for a company whose business is placing
   its candidates with client companies (clients, rate cards, submissions to clients, placements and bench, client
   invoices with GST and e-invoice, collections, placement fees, sub-vendors). It is a separate product, about as big as
   all the rest of Hiring. Is it in scope now, later, or never for YukthiX? *Suggested: later (not in the first Hiring
   release). Keep the designs; build only HIR-21's "recruitment agencies submit candidates to us" part now, because the
   API for that already exists and normal companies use agencies.*
2. **AI in hiring (HIR-08 AI interview review, HIR-25 notetaker and AI draft scorecard, HIR-26 rediscovery).** Under the
   AI rules already decided (company's own AI setting through the existing AI service; off by default; only the needed
   data goes to the AI; every run logged; a person decides), do we build these? *Suggested: build HIR-26 rediscovery
   first (search only, advisory, works with AI off as plain text search). Build HIR-25 after, with consent from every
   participant before any recording, no recording if anyone declines, and the interviewer confirms each drafted rating.
   Leave HIR-08 (AI video interview with a score) for later: an advisory score never moves or rejects anyone, the
   candidate can always ask for a human process, and the NYC bias audit (HIR-23) must be in place before it is offered
   for NYC jobs.*
3. **BGV and identity partners (HIR-10 partner checks, HIR-22, T9-15).** Treat them like the other partner items (penny
   drop, PAN check, face match in People): wait for a chosen provider? *Suggested: yes. Wire HIR-10 now with manual
   tracking (the API exists on the joiner); add the partner (one Indian BGV vendor first) and the candidate ID / selfie
   check when the provider contract is signed. A failed match always goes to a person, never auto-reject (as drawn).*
4. **Offer approval and e-sign (HIR-09).** The offer approval route exists. Should an offer above the grade band add an
   extra approval step, and should the candidate sign the offer electronically? *Suggested: yes to the band step (a
   company setting: which step, default = HR head). E-sign: same rule as letters (founder answer 72): no e-sign unless
   the company's offer template switches it on; accepting by the link is the default.*
5. **Offer pay as CTC lines (HIR-09, 28, 29).** Today an offer's pay is one text field. Change it to CTC lines (fixed,
   variable, joining bonus with clawback) from the grade band, with versions? *Suggested: yes; it is needed for the band
   check, the employer-cost view, the hand-off to Pay, and versions. Old text offers stay readable.*
6. **Internal jobs (HIR-13).** Who can apply, and when? *Suggested: a company setting with a default: employees past
   probation and at least 12 months in their current role; the manager is told when the person applies (not asked).*
7. **Pay range and bias audit by location (HIR-24, HIR-23).** Which laws do we ship rules for? *Suggested: a small law
   table by location (none required in India; the range is a company setting there), with NYC / US states and EU pay
   transparency as rows; the pay-history question is hidden where it is banned. HIR-23 only when HIR-08 ships.*
8. **Which careers design wins (section 5)?** *Suggested: T9-09 for the public site and the job page; the Surfaces/Careers
   page builder for /yx/hiring/careers; delete the Surfaces/Careers public layouts (Classic, Compact, Split) unless you
   want layout choice.*
9. **Candidate list and retention have no design.** Draw them (HIR-05 List; retention under Settings 6.1) before wiring?
   *Suggested: yes, draw both from the kit first, then wire.*
10. **Candidate pages outside the app** (status page, candidate portal, offer accept, interview booking) have no design.
    *Suggested: draw them as T9 portal stories with the T9-09 careers look, after the careers site.*
11. **Hiring manager views (HIR-01, HIR-02).** Should a hiring manager see their own department's plan and their own
    requisitions in Hiring (today they only raise from My team)? *Suggested: yes, read-only for their department.*

## 7. Next pages (suggested build order, smallest useful first, max 3 builders at once)

One page or area per builder. Each follows BUILD-STANDARD.md (feature sheet, P+N tests, design-live guard) and deletes the
stand-in it replaces with its "Live ·" stories.

| # | page / area | what | size |
|---|---|---|---|
| 1 | ~~HIR-11 recruiting costs~~ | done 9 Nov 2026: /yx/hiring/costs | S |
| 2 | ~~HIR-12 referrals~~ | done 9 Nov 2026: /yx/hiring/referrals; phone stories wait for the app | S |
| 3 | HIR-01 headcount plan | wire `HeadcountPlanScreen`; then plan revisions (API) for FinanceRevision | M |
| 4 | HIR-02 requisitions list (+ HIR-26 rediscovery panel, AI off = text search) | wire `RequisitionsScreen`; hiring manager's own list | M |
| 5 | HIR-03 jobs list and workspace, HIR-24 company-setting pay range | wire `JobsScreen`, `JobWorkspaceScreen`, `JobPayRangePanel` | M |
| 6 | HIR-04 pipeline board | wire `PipelineBoardScreen` on /yx/hiring/jobs/[id] | M |
| 7 | ~~HIR-05 candidate record (+ ex-employee match, merge)~~ | done 9 Nov 2026: record, merge, candidate list and retention (decision 9) | M |
| 8 | ~~HIR-06 interviewer list, HIR-07 scorecard~~ | done 11 Nov 2026: calendar (recruiter week and interviewer), scorecard, Schedule and Move on the record (answer 274) | M |
| 9 | Settings 6.1 Hiring | wire the settings page; retire /yx/hiring/scorecards and /approval-routes stand-ins | S |
| 10 | HIR-09 offer builder (after questions 4, 5) | CTC lines, band check, versions, hand-off | L |
| 11 | ~~HIR-10 BGV tracker, manual~~ | done 12 Nov 2026: /yx/hiring/bgv on the joiner's checks; a person decides a discrepancy | S |
| 12 | T9-09 careers site + page builder (after question 8) | public pages and /yx/hiring/careers | M |
| 13 | ~~HIR-20 talent CRM (pools, postings)~~ | done 12 Nov 2026: /yx/hiring/pools; sequences and sourcing later | M |
| 14 | ~~HIR-13 internal jobs~~ | done 13 Nov 2026: /yx/hiring/internal-jobs; phone stories wait for the app | M |
| later | HIR-25, HIR-08, HIR-22 / T9-15, partner BGV, HIR-27, 28, 29, slot finder, staffing E | after the founder answers and providers | L–XL |

Suggested first wave (3 builders): 1 + 2 (one builder, both S), 3, 5.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Hiring
story file in scope has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/hiring-design-map.md and checks that every
// Hiring story file in scope has exactly one row per story, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const UI = 'packages/yx-ui/src/';
const H = UI + 'screens/hiring/';
const files = [
  ...fs.readdirSync(H).filter((f) => /^hir-\d+-.*\.stories\.tsx$/.test(f)).map((f) => H + f),
  H + 'hiring-kit.stories.tsx',
  ...fs.readdirSync(H + 'live').filter((f) => f.endsWith('.stories.tsx')).map((f) => H + 'live/' + f),
  UI + 'screens/portals/t9-09-careers.stories.tsx', UI + 'screens/portals/t9-15-identity.stories.tsx',
  UI + 'stories/careers.stories.tsx', UI + 'screens/settings/settings-g6.stories.tsx',
];
// Only the hiring pages of Settings group 6 (6.3 Performance, 6.4 Learning, 6.5 Assessments are other areas).
const keep = (f, n) => !f.endsWith('settings-g6.stories.tsx') || /^(Overview|P6_[12])/.test(n);
const want = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const title = s.match(/title:\s*'([^']+)'/)[1].split('/').pop();
  // Capital first letter only: lower-case exports are sample props (excludeStories).
  want[title] = [...s.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]).filter((n) => keep(f, n));
}
const doc = fs.readFileSync('docs/yukthix/hiring-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 40), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
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
const all = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) };
for (const [n, c] of Object.entries(counts)) if (!n.startsWith('H.')) for (const k in all) all[k] += c[k];
counts['All A-G'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

## Founder decisions, 9 Nov 2026 (before building)
All eleven questions answered as suggested, with question 1 timed: (1) the staffing-agency part (HIR-14 to 21, 30, 31,
Settings 6.2) is built right after the main hiring flow (build order items 1 to 13) is built and founder-tested; now only
the HIR-21 part where outside recruitment agencies send us candidates; (2) AI: rediscovery first (advisory, plain search
when AI is off), then the notetaker (everyone consents first, no recording if anyone declines, the interviewer confirms
each AI draft rating), AI interview review last (never moves or rejects anyone, a human process on request, bias audit
first); (3) BGV and identity: manual BGV tracking now, one Indian BGV vendor and the ID and selfie check after a contract;
a failed match always goes to a person; (4) offers above the grade band add one approval step, who approves is a company
setting (default HR head); e-sign only when the company's offer template switches it on; accept by link stays the
default; (5) offer pay becomes CTC lines with versions; old text offers stay readable; (6) internal jobs: a company
setting, default past probation and 12 months in the current role; the manager is told, not asked; (7) pay range and bias
audit: a small table of laws by location (India: the company chooses; NYC, US states, EU pay transparency rows; hide the
pay-history question where banned); the bias audit only when AI interview review ships; (8) T9-09 for the public careers
pages, Surfaces/Careers for the admin page builder; (9) draw the candidate list and retention page designs first, then
wire them; (10) draw the candidate pages outside the app (status, portal, offer accept, interview booking) in the T9-09
portal style; (11) hiring managers see their own department's plan and their own requisitions, read-only.

## Founder questions from the HIR-03 / HIR-24 build (9 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
221. **Show the pay range by default in India?** Built: company setting `hiring.pay_range.show`, default **off** (today's
     behaviour; the design's "YukthiX starter: on" text now shows the company's own setting). *Suggested: keep off; HR
     switches it on per company, entity or location.*
222. **Recruiter column.** A job has no recruiter field; the list shows who opened the job. *Suggested: add a Recruiter
     field on the job (default: the person who opens it), changeable by HR.*
223. **"Put on hold" (list and workspace menus).** Not built: jobs have no on-hold status. *Suggested: add "On hold":
     hides the job from the careers page and boards, keeps the candidates, and reopens in one click.*
224. **Pay-history question on the apply form.** Built: the per-job switch, the company default (`hiring.pay_history.ask`,
     off) and the law check (refused where banned). The public apply form does not ask the question yet. *Suggested: add
     it with the T9-09 apply page, never shown where the law bans it.*
225. **Job codes, saved views ("My open jobs") and Export in the designed list.** Not built (no job number, no saved-view
     store); hidden in live. *Suggested: a company job number (JOB-0001 onwards), saved views when the kit's view store
     exists, Export of the visible columns.*
226. **Referrals & internal tab and "Share with vendors".** Hidden in live until HIR-12, HIR-13 and HIR-21 are built.
     *Suggested: wire them with those pages.*
227. **What moved.** The old list's "Pipeline" column (candidates per stage) is now "Candidates by stage" in the job
     overview; the list shows Applicants and In pipeline. The old workspace (board, applications, job settings, careers
     toggles, fit criteria, tests, export) is on "Open pipeline" (/yx/hiring/jobs/[id]/pipeline). *Suggested: keep until
     HIR-04 replaces the board.*
228. **Which law rows.** Built: India (none), New York, California, Colorado, Washington, Illinois and the EU directive, all
     marked verify; employer-size limits (15 or more staff in CA, WA, IL) are not modelled, so the rule applies to every
     company there. *Suggested: counsel checks each row; add a size limit only if a customer is below it.*
229. **A job with a free-text location** (no P01 location) has no law applied. *Suggested: require a location from the
     masters for jobs outside India.*

Founder approved, 9 Nov 2026 (questions 201-207, 211-216, 221-229, all as suggested):
- Referrals and costs: (201) no referral credit when the person applied on their own in the last N days, N a company setting
  (default 90); (202) a new hiring key for recruiting costs, given to HR and recruiters; (203) payroll posts a referral-bonus
  cost when it pays one, assessments post their cost; (204) draw an HR "All referrals" design first, then wire it; (205) the
  bonus becomes "No bonus" automatically when the joiner exits before the qualifying day; (206) costs can be entered for any
  month of the current quarter; (207) keep Referrals in the menu for employees and anyone with a hiring key.
- Headcount plan: (211) same approvers for a budget-raising revision, a setting later if needed; (212) own department plus
  departments headed; (213) no budgets for hiring managers; (214) approved plans only for them; (215) April-March year,
  a setting when a Jan-Dec customer comes; (216) one plan per department with its own version.
- Jobs and pay range: (221) pay range off by default in India; (222) a Recruiter field on the job, default the person who
  opened it; (223) an On hold status that hides the job from careers and boards but keeps candidates; (224) the pay-history
  question goes on the T9-09 apply page; (225) company job numbers JOB-0001 on, saved views later, export of visible
  columns; (226) Referrals & internal tab and Share with vendors wired with HIR-12, HIR-13 and HIR-21; (227) keep the old
  workspace behind Open pipeline until HIR-04; (228) counsel checks every pay-law row (GO-LIVE-CHECKLIST), size limits only
  if a customer needs them; (229) jobs outside India need a location from the masters.

## Founder questions from the HIR-03 follow-ups (9 Nov 2026)
241. **Export menu offers "Excel" too.** The kit's table always shows CSV and Excel; both download the same CSV file
     (Excel opens it). *Suggested: keep one file; later add an `exportFormats` option to the kit table to show CSV only.*
242. **On hold and a job's public link.** On hold, the apply link answers "This role is not accepting applications" and the
     careers page drops the job; candidates already in the pipeline keep moving. *Suggested: keep; tell applicants nothing
     extra.*
243. **Job numbers of older jobs.** Existing jobs (deleted ones too) were numbered by the date they were opened, so a
     company's numbers start at JOB-0001 for its oldest job. *Suggested: keep.*
244. **"Outside India" is decided by the job's legal entity** (or the company's default entity when none is chosen). A job
     of an Indian entity may still use a free-text place abroad. *Suggested: also require a master location whenever the
     job's place is outside India, once locations carry a country for every company.*


## Founder questions from the HIR-02 / HIR-26 build (9 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
251. **AI notes on past candidates by default?** Built: company setting `hiring.rediscovery.ai`, default **off** (plain
     text search). *Suggested: keep off; HR switches it on per company once they have an AI key.*
252. **Hiring manager "Edit and resubmit" on a sent-back requisition.** Not built: decision 11 makes the hiring manager's
     list read-only, so recruiting sends it again. *Suggested: let a hiring manager edit and resend only their own
     sent-back requisition (refused while acting for someone else).*
253. **Saved views, "Assign recruiter" (bulk), Duplicate and Cancel requisition.** Hidden in live (no view store; no bulk
     recruiter change; no cancel state). *Suggested: Assign recruiter with the HIR-03 recruiter field; Duplicate opens the
     request sheet filled in; Cancel closes a draft or waiting requisition with a reason; saved views when the kit's store exists.*
254. **"Contact" on a past candidate.** Hidden in live (no messaging from the panel). *Suggested: open the existing
     candidate email with the consent check (only "opted in").*
255. **Hiring manager "Suggest to recruiter".** Hidden (read-only). *Suggested: a bell notice to the requisition's
     recruiter naming the person, audited; refused while acting.*
256. **Who sees "New requisition".** Built: holders of `ats.requisition.raise` (hiring managers), not while acting.
     The Recruiter role does not hold it, so recruiters open requisitions with Jobs › Create job. *Suggested: keep.*
257. **Approve / Send back in the requisition drawer.** Not built: approvers decide in Approvals (the drawn screen has no
     approver persona). *Suggested: add the approver's Approve / Send back to the drawer (kit story first), as on the HIR-01 board.*
258. **Requisition code.** Built: REQ-0007 uses the job's number (the same requisition is JOB-0007 on Jobs). *Suggested: keep.*
259. **Who can be rediscovered.** Built: only candidates with talent-pool consent (not withdrawn), in their retention
     period, not on legal hold, not hired. *Suggested: keep (consent law); no company setting, as it is not a choice.*

Founder approved, 10 Nov 2026 (questions 231-234, 241-244, all as suggested): (231) marking a referral bonus paid also
creates the payroll one-time pay line (referral component, linked to the referral); the cost follows that line: posted when
the run is approved, removed if the line is cancelled; (232) keep: only careers-site applications count as applied on
their own; (233) post assessment costs once assessment pricing exists; (234) keep: only an accepted exit cancels the
bonus, and show "Bonus on hold" while a resignation is pending; (241) the kit table can offer CSV only, and Jobs does;
(242) keep the on-hold apply message; (243) keep the numbering of older jobs; (244) a job whose place is abroad needs a
master location even under an Indian legal entity.
## Founder questions from the HIR-04 build (9 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
261. **Where the old workspace went.** The design has no candidates list, bulk dialog or job settings. Built: "Bulk actions"
     opens the candidates list (/pipeline/list: select several to move, send a test, email or reject; Export CSV; Job
     settings tab: tests, scorecard, public applying, boards, fit criteria) and "Add candidate" opens it with the Add dialog;
     a card opens the old application panel (interviews, offers, messages, notes, checklist). *Suggested: draw a Bulk
     actions sheet and an Add candidate sheet in HIR-04, move the job settings into the HIR-03 workspace, and replace the
     application panel with HIR-05 / HIR-09; delete /pipeline/list then.*
262. **Telling the candidate on rejection.** Built: company setting `hiring.reject.email_candidate`, default **off**: a
     board rejection saves the reason and tells the candidate nothing; on, the Rejected stage's template (or the built-in
     "Not moving forward") goes after 24 hours, undoable until then. The bulk Reject on the list still lets the recruiter
     write a message by hand. *Suggested: keep off by default; let HR pick the template in the setting later.*
263. **Stage time targets and limits.** The design flags cards over a stage's days target (Applied 3, Screening 5, Panel 7)
     and a Panel limit of 6. Built: none in live (no such pipeline setting). *Suggested: add "days target" and "limit" per
     stage in pipeline settings (empty = none).*
264. **Share feedback for a hiring manager.** The design shows the button with no target. Built: it says "Open a candidate
     to share feedback"; a name opens the application where the note is added. *Suggested: keep; or draw a feedback sheet
     that lists the candidates waiting for the manager's view.*
265. **Moving out of Rejected.** Built: allowed for the job-manage key; it cancels a waiting rejection email. *Suggested:
     keep.*
Founder approved, 10 Nov 2026 (questions 251-259, 261-265, all as suggested):
- Requisitions and rediscovery: (251) AI notes off by default, HR turns them on per company; (252) a hiring manager edits
  and resends their own sent-back requisition (not while acting for someone else); (253) Assign recruiter (the job's
  recruiter field), Duplicate (opens the request sheet filled in), Cancel requisition (with a reason); saved views later;
  (254) Contact opens the candidate email only when the person opted in; (255) Suggest to recruiter is a bell notice to
  the recruiter, audited; (256) keep New requisition for raise-requisition holders, recruiters use Jobs - Create job;
  (257) Approve / Send back inside the drawer, kit story first; (258) keep REQ numbers following JOB numbers; (259) keep
  talent-pool consent as a fixed rule.
- Pipeline: (261) draw Bulk actions and Add candidate sheets in HIR-04, move job settings into the HIR-03 workspace,
  replace the application panel with HIR-05 and HIR-09, then delete /pipeline/list; (262) keep the rejection email off by
  default, a template choice later; (263) an optional days target and limit per stage in pipeline settings, empty means
  none; (264) keep Share feedback pointing to a candidate, a feedback sheet only if managers ask; (265) keep moving out of
  Rejected with the job-manage key, cancelling a waiting rejection email.
## Founder questions from the HIR-05 build (9 Nov 2026)
271. **Who sees the ex-employee match?** Built: only people who may see the employee: `employee.profile.view` gives the
     flag; an exit key (`lifecycle.exit.view`/`manage`) adds the exit date and type; the confidential exit key adds rehire
     eligibility; exit manage + confidential may clear it. A plain Recruiter or Hiring manager (no People key) sees nothing,
     not even the flag the design shows the hiring manager. *Suggested: keep; HR gives a recruiter `employee.profile.view`
     only if they should see the flag.*
272. **Should an ineligible rehire flag block Screening?** The design said "Screening can't be passed until HR clears the
     flag". Built: it does not block (the banner says HR can clear it; nothing is rejected automatically). *Suggested:
     add a company setting `hiring.rehire_flag.blocks_screening` (default off), checked when the card leaves Screening.*
273. **Merge now needs the data-rights key** (founder brief) on top of `candidate:manage`; plain recruiters see the pairs
     but cannot merge. *Suggested: keep; give recruiters who clean duplicates the Hiring admin template.*
274. **Design actions with no live route.** "Schedule interview" and "Move to next stage" became "Open in pipeline" (the
     board does both); the hiring manager's "Add feedback" is on the interview scorecard; "Expected CTC", "Notice period"
     and "Next action" are not stored on a candidate; the identity strip (HIR-22) and under-18 consent are not built.
     *Suggested: add Move and Schedule on the record when HIR-04 and HIR-06 are wired; add expected CTC and notice period
     as candidate fields only if recruiters ask.*
275. **An erased candidate opens "Not found (anonymised)"** as designed; the stand-in showed the erased record with its
     applications. Applications and scores stay on the job board without the name. *Suggested: keep.*
276. **Erase of a hired candidate.** The API (DPDP rules already built) refuses erase only under legal hold; the nightly sweep
     also skips hired people and open processes. *Suggested: refuse a requested erase while an offer is accepted or a
     process is open too (409 with the reason), the same rules as the sweep.*
277. **Data-request register.** Built: find by email, export (JSON), erase; each export and erase is in the audit log. There
     is no list of past requests with due dates. *Suggested: add a "Data requests" log with the DPDP response date when the
     Data Protection Board rules fix it.*
278. **Writes refused while acting** are added on the candidate, merge, hold, consent, pool and erase/export routes.
     Invitations, bulk email and re-engage (other modules) still allow it. *Suggested: refuse them too in their own build.*
Founder approved, 10 Nov 2026 (questions 271-278, all as suggested): (271) keep: the ex-employee match only for people who
may see the employee; give the People profile key to whoever should see the flag; (272) a company setting "not eligible
for rehire blocks Screening", default off; (273) keep: merge needs the data-rights key, give Hiring admin to whoever
cleans duplicates; (274) Move and Schedule come onto the candidate record when HIR-06 is wired; (275) keep: an erased
candidate shows Not found; (276) a requested erase is also refused while an offer is accepted or a process is open, the
same as the sweep; (277) a data-request log with due dates once the DPDP rules fix the deadline; (278) assessment
invites, bulk email and re-engage refuse acting-for in those modules' own builds.
## Founder questions from the HIR follow-ups round 2 (10 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
281. **Typed place names.** A typed place carries a country (default India) and a foreign one is refused; the words
     themselves ("Boston, USA") are not read. *Suggested: keep; the country choice is what counts.*
282. **Undo while a draft run has the line.** Built as asked: undo cancels the line until an approved run has it; a draft
     run that already calculated it shows the change only after it is recalculated. *Suggested: keep; payroll's own
     one-time pay cancel works the same way.*
283. **Undo paid in the screen.** The API undoes "paid" (to approved or rejected), but All referrals has no Undo item (the
     design has none). *Suggested: draw "Undo paid" in the row menu (shown while no approved run has it).*
284. **Referral bonus pay flags.** `referral_bonus` starts as the performance bonus does: taxable, in the PT wage, outside
     the Code wage. *Suggested: keep; payroll can change the flags per company.*
285. **A referrer without an employee record** (a contractor or an outside person) cannot be paid through payroll; mark-paid
     is refused with the reason. *Suggested: add a "paid outside payroll" choice that posts the cost at once.*
286. **Other tables that offer Excel but write CSV** (answer 241 asked to list them): HIR-01 headcount plan, Helpdesk
     tickets, Pay component library, Pay inputs (LOP, one-time pay, payment status), Piece-rate check, People assets,
     People letters, Time attendance reports, the HIR-04 candidates list; People directory passes the format to the
     server. *Suggested: give each `exportFormats={['csv']}` in one small change.*
## Founder questions from the HIR-02 / HIR-26 follow-ups (10 Nov 2026)
291. **Who is the recruiter of a manager's request?** Built (unchanged from HIR-03): the person who raises it, so a
     hiring manager is first the recruiter of their own request; "Suggest to recruiter" then says "no recruiter yet" until
     recruiting assigns one. *Suggested: a request raised with the requisition key starts with no recruiter (or the
     company's default recruiter, a setting), so suggestions reach recruiting at once.*
292. **Cancelled requisitions and the plan.** Built: a cancelled requisition closes its job, so its openings return to
     the plan line at once. *Suggested: keep.*
293. **Who may cancel.** Built: recruiting (`pipeline:manage`), never while acting for someone else; a hiring manager
     cannot cancel their own. *Suggested: let a hiring manager cancel their own requisition while it is still waiting
     for approval, with a reason.*
294. **Contact on WhatsApp.** Built: Contact uses the candidate email only (opt-in checked; the email worker also skips
     anyone who opted out). *Suggested: add WhatsApp when the candidate WhatsApp consent is recorded as an opt-in.*
295. **Edit and resubmit, and what changed.** Built: the hiring manager's change replaces the requisition's facts and
     sends it to the route again (audited `ats.requisition.changed` with title and positions). *Suggested: show approvers
     what changed since it was sent back (a "was → now" line), later.*
## Founder questions from the HIR-04 follow-ups and answers 272 / 276 (10 Nov 2026)
301. **Where the application went.** The old panel's content (stage, owner, checklist, fit, interviews, messages, notes,
     offers) is now an "Application" drawer on the HIR-05 record, drawn as two HIR-05 stories; nothing it did was dropped.
     *Suggested: keep it until HIR-06 / 07 (interviews), HIR-09 (offers) and the notes design replace its parts.*
302. **Stage targets belong to the pipeline**, which several jobs can share; they are edited on the job's Settings tab (the
     pipelines key) because Settings 6.1 is not wired. *Suggested: move the editor to Settings 6.1 when it is wired; keep
     the read-only view on the job.*
303. **Fit rubric weights.** The API has always required whole per-cent weights adding up to 100; the old form allowed 1 to
     10 and could never save. Built: per-cent weights with the total checked before saving. *Suggested: keep.*
304. **Share feedback for a hiring manager** still points to a candidate (answer 264); the card now opens the record, where
     the note is added under Application › Notes. *Suggested: keep.*
311. **Who learns why a move was refused (272).** The refusal says the candidate worked here and is not eligible for rehire
     (no exit type or reason). A recruiter without People keys learns that much. *Suggested: keep; the move cannot be
     explained without it.*
312. **"Screening or later" (272)** is any stage after the pipeline's first active stage (pipelines name stages freely).
     Rejecting, moving back and undo are never blocked. *Suggested: keep.*
313. **Erase refused (276)** names the open job and says to reject or close the application and withdraw any offer first;
     with an accepted offer it says the details are kept for joining and HR handles the request on the People record.
     *Suggested: keep.*
Founder approved, 10 Nov 2026 (questions 281-286, 291-295, 301-304, 311-313, all as suggested): (281) keep: only the chosen
country counts for a typed place; (282) keep undo until the run is approved; (283) draw an "Undo paid" row action in All
referrals, then wire it; (284) keep the referral bonus pay settings; (285) a "Paid outside payroll" choice that posts the
cost at once; (286) the nine tables listed under 241 offer CSV only; (291) a manager's request starts with no recruiter,
or the company default recruiter from a setting; (292) keep: cancelled openings go back to the plan line at once; (293) a
hiring manager may cancel their own waiting requisition with a reason; (294) WhatsApp contact once a WhatsApp opt-in is
recorded; (295) a "was / now" line for approvers later; (301) keep the Application drawer until HIR-06/07 and HIR-09
replace its parts; (302) move the stage-target editor to Settings 6.1 when it is wired; (303) keep whole per-cent rubric
weights adding to 100; (304) keep Share feedback opening the record; (311-313) keep as built.
## Founder questions from the HIR-06 / HIR-07 build (11 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
321. **Which clock interview times use.** Built: India time (IST) everywhere staff see or enter a time (calendar,
     scorecard, the record's Scores tab, the Schedule dialog says "(IST)"); the dialog's time zone field is only the
     candidate's, for their invitation. *Suggested: keep IST; show a location's own zone only when a job is abroad.*
322. **"Add comment" on a submitted scorecard** (drawn on the Submitted story). Built: hidden; a submitted scorecard cannot
     change and there is no comment store. *Suggested: add append-only comments under a submitted scorecard (kit story
     first), audited, visible to whoever may read the scorecard.*
323. **Find a slot (slot finder, free / busy).** Built: hidden on the recruiter week; scheduling is the record's Schedule
     interview (proposed times or candidate self-booking). *Suggested: build it when the Google / Microsoft calendar link
     is chosen (provider: to decide), using the drawn SlotGrid.*
324. **When a scorecard is "overdue".** Built: company setting `hiring.scorecard.overdue_hours` (12 / 24 / 48 / 72, default
     24) after the interview ended; the reminder emails stay at 24 and 48 hours. *Suggested: keep; let the reminders
     follow the same setting later.*
325. **Who sees the company-wide week.** Built: everyone with the pipeline key (`pipeline:manage`) sees every interview in
     the company; anyone else only interviews they are on, plus a hiring manager's own jobs. *Suggested: keep; limit a
     recruiter to their own jobs only if companies ask.*
326. **Hiring manager on HIR-07.** Built: reads every submitted scorecard and the panel result for their job (never a
     draft), no resend or cancel. *Suggested: keep.*
327. **Which application Move and Schedule act on (answer 274).** Built: the application open on the record (`?entry=`),
     else the first open one; the dialog title names the job. *Suggested: keep.*
328. **The stand-in "Scorecards to do / All" switch** on My interviews became the order of the drawn Scorecards list
     (overdue, to fill, then submitted / cancelled). *Suggested: keep.*
329. **Pass bar per skill.** The design has one per skill; the API's scorecard template has one bar for the whole card,
     shown on each item, and weights 1-10 shown as a per cent of the total. *Suggested: keep one bar per template; add
     per-item bars only if recruiters ask.*
330. **Scorecard templates page** (/yx/hiring/scorecards) stays the stand-in until Settings 6.1 is wired (queue item 9).
     *Suggested: keep.*
Founder approved, 10 Nov 2026 (questions 321-330, all as suggested): (321) keep India time for staff, a location's own zone
only for jobs abroad; (322) append-only scorecard comments, audited, visible to whoever reads the scorecard, kit story
first; (323) slot finder once a Google or Microsoft calendar provider is chosen; (324) keep the overdue setting, reminders
follow it later; (325) keep the company-wide week for the pipeline key; (326) keep the hiring manager read-only on
submitted scorecards; (327) keep Schedule and Move acting on the open application; (328) keep the list order; (329) keep
one pass bar per card, per-skill bars only if recruiters ask; (330) keep the templates page until Settings 6.1.
## Founder questions from the HIR-09 / HIR-29 build (11 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
331. **Recruiters without the offer-pay key.** Built: building or revising an offer needs `ats.offer.compensation.view`
     (you cannot set pay you may not see); without it a recruiter sees the offer without pay and can still send an
     approved offer, withdraw it and work its conditions. *Suggested: keep; give the key to the recruiters who make offers.*
332. **Who is "the HR head"?** Built: the head of the department coded HR; with none, the people who hold the offer-pay
     key. *Suggested: add a named "HR head" person to the company setting `hiring.offer.band_approver`.*
333. **Below the range.** Built per decision 4: shown on the badge, never an extra step. *Suggested: keep.*
334. **Joining bonus, clawback and variable pay in Pay.** Built: the hand-off carries the salary structure and the fixed
     CTC (lines worked out again with the employee's own facts); the bonus and its clawback months stay on the offer.
     *Suggested: pay the joining bonus as one-time pay in the first run and add the clawback to the final settlement when
     the person leaves within the months.*
335. **Conditions never lapse by themselves.** Built: the tab warns before and after the joining day; HR decides.
     *Suggested: keep HR deciding (like a BGV discrepancy, never auto-withdrawn), and tell HR on the joining day.*
336. **Reminders.** "Send reminder" (sent offers) and the candidate's condition reminder are not built (hidden live).
     *Suggested: two email templates, sent by the recruiter's button, never automatically.*
337. **E-sign switch and the candidate's page.** The template switch is in the API only (no settings screen yet) and the
     public offer page has no design (decision 10). *Suggested: add the switch to the offer-template editor when Settings
     6.x is wired; draw the T9 accept and sign page.*
338. **What approvers see.** Built: the approvals inbox summary shows the version, fixed CTC and range check (cards
     outside the app stay neutral). *Suggested: keep; approvers decide on pay.*
339. **Older offer routes.** `POST offers/:id/submit` now runs on the P03 engine; requests made before stay on the older
     inbox; `POST pipeline/entries/:id/offers` (text pay) still exists for older callers. *Suggested: retire the text
     route when the stand-in /pipeline/list page is deleted.*
## Founder questions from the Settings 6.1 Hiring build (10 Nov 2026)
Built on `feat/yukthix-hiring-settings` (answers 283, 285, 286, 291, 293, 302). Each has a safe default already built; the
suggestion is the answer we propose.
341. **Hiring settings with no place in the 6.1 design.** `ats.headcount_plan` (off / advisory / required),
     `ats.headcount_plan.manager_view`, `ats.referral.self_apply_days`, `hiring.pay_range.show`, `hiring.pay_history.ask`,
     `hiring.rediscovery.ai` and `hiring.rehire_flag.blocks_screening` are not on 6.1 (no layout invented). Built: the
     self-apply days stay on Settings › Company rules › Referrals; the other six still have no screen (defaults apply).
     *Suggested: draw them into 6.1: plan mode and manager view under "Pipelines, scorecards and approvals", pay range and
     pay-history question under "Offers and hand-off", AI notes on past candidates beside AI interview, the rehire flag
     under "Background checks and candidate data", the self-apply days under the referral rule.*
342. **Designed 6.1 fields with nothing behind them** (plan approvers, extra approver, replacement link, offer expiry,
     clawback, range check, offer template link, hand-off, BGV packages and timing, consent renewal, minors, AI interview
     and languages, careers colour and heading, cost categories) are left out of the live page, never shown with sample
     values. *Suggested: keep; each returns when its feature is built.*
343. **Who changes hiring settings.** Built: a new key `ats.settings.manage` (System Admin and the Hiring admin template;
     migration 202617l0000000) or HR's `org.settings.manage`, held for the whole company; recruiting and hiring admins read.
344. **"Undoable while not reconciled" (285).** There is no reconcile step for recruiting costs. Built: a bonus paid
     outside payroll can be undone while its cost's month is in the current quarter (the recruiting-costs rule, answer
     206); after that it is refused with the reason. *Suggested: keep until Finance gets a reconcile step.*
345. **Pipeline and scorecard templates are read-only on 6.1** (adding or editing a template is not built in YukthiX;
     scorecards stay on /yx/hiring/scorecards). *Suggested: draw template editing into 6.1 and retire the stand-in.*
346. **Candidate retention is a choice of 6, 9, 12, 18, 24 or 36 months**, not the design's free number 6-36 (the setting
     allows only those). *Suggested: keep.*
347. **One referral rule for all roles.** The design shows rules by role; the setting is company-wide. *Suggested: rules by
     role or grade only if a customer asks.*
348. **Default recruiter choices** are any active person of the company (the same as a job's recruiter). *Suggested: only
     people who hold the recruiter key, once the API can list key holders.*
349. **Request access on a read-only settings page** is hidden in live (no request flow). *Suggested: wire it to the access
     request flow when that is built.*
350. **Existing requisitions where the manager is their own recruiter (291):** 0 in the test app's demo-org (1 requisition
     there); none changed. *Suggested: leave them; recruiting uses Assign recruiter.*
Founder approved, 10 Nov 2026 (questions 331-339, 341-350, all as suggested):
- Offers: (331) keep: building an offer needs the offer-pay key, give it to recruiters who make offers; (332) the band
  approver setting can name a person; (333) keep: below the band shows but adds no step; (334) the joining bonus is paid as
  one-time pay in the first run and the clawback recovered in the final settlement; (335) keep HR deciding conditions, tell
  HR on the joining day; (336) two reminder email templates, sent only when the recruiter presses the button; (337) the
  e-sign switch goes into the offer template editor and the accept-and-sign page is drawn (T9-09 portal style); (338) keep
  the fixed CTC in the approvers' inbox summary; (339) retire the old free-text offer route later.
- Settings 6.1: (341) draw the seven settings into the matching 6.1 sections; (342) keep fields without a feature out;
  (343) keep who changes hiring settings; (344) keep undo while the cost quarter is open; (345) draw template editing into
  6.1, then remove the old scorecard templates page; (346) keep the retention choices; (347) referral rules by role only if
  a customer asks; (348) the default recruiter must hold the recruiter key; (349) Request access when that flow exists;
  (350) nothing to change.
## Founder questions from the careers site build (11 Nov 2026)
351. **Old addresses.** The careers site and the candidate pages moved under /yx (/yx/careers, /yx/apply, /yx/application,
     /yx/candidate, /yx/offer, /yx/interview). Emails, the job-board feeds and search results still carry the old
     addresses; built: permanent redirects from each. *Suggested: switch the API's links to the /yx addresses in one small
     change and keep the redirects for a year.*
352. **An infected resume (question 125).** The scan now runs after the application is saved, so the application goes in
     and the resume is quarantined (recruiters can never open it); the applicant is not told. *Suggested: email the
     applicant "we could not accept your resume file" with their candidate-page link to upload another.*
353. **Job facts the design shows but a job does not have:** "Apply by" date, experience and a requirements list. Built:
     hidden; the job's description fills "The job". *Suggested: optional Apply-by (the job closes itself that night) and
     Experience fields on the job; keep requirements inside the description.*
354. **"Apply on WhatsApp"** (T9-09 design). Built: hidden (no WhatsApp apply). *Suggested: add it with T9-20 chat apply.*
355. **The pay-history answer** (answer 224) is stored on the application in rupees a year, only where allowed. Built:
     nobody sees it in the app yet. *Suggested: show it in the HIR-05 Application drawer to people with the pay key only.*
356. **White-label** (no "Powered by YukthiX"). Built: no setting; it always shows. *Suggested: a plan-level company
     setting (D15), default off.*
357. **Company logo on the careers pages.** Built: the company name in text (the kit has no tenant-logo part). *Suggested:
     add a TenantLogo kit part (image with alt text, size-capped) and show the company logo on every candidate page.*
358. **Careers assistant** moved from a floating chat bubble to an "Ask about these jobs" section on the page (new kit
     part, same API, same company setting). *Suggested: keep.*
359. **Mobile number** is required and Indian (10 digits) on the designed apply form; the API takes any. Applicants
     abroad cannot enter theirs. *Suggested: an international number field when the job's place is outside India.*
360. **Builder drafts.** Edits stay in the browser until Publish; leaving the page loses unpublished edits. *Suggested:
     keep; save drafts on the server only if HR asks.*
361. **Status words.** The stage's category decides the candidate words (first active stage: "Application received";
     later: "Under review"; offer or hired: "Moving forward"; rejected: "A decision has been made"); the stage name is
     never shown (the candidate page showed it before). *Suggested: keep.*
362. **Offer and interview pages** show the company name but not its colour or careers link (those APIs send the name
     only). *Suggested: add the company's brand to those two answers.*
Founder approved, 9 Nov 2026 (questions 351-362, all as suggested): (351) switch the API's email and feed links to the new
addresses, keep the redirects for a year; (352) email the applicant to upload another file from their candidate page when a
résumé is quarantined; (353) optional Apply by and Experience fields on the job; (354) WhatsApp apply with T9-20; (355) show
the pay-history answer in the HIR-05 Application drawer to pay-key holders only; (356) a plan-level white-label company
setting, default off; (357) a tenant-logo kit part; (358) keep the assistant as a page section; (359) an international
number field for jobs outside India; (360) keep builder edits as a draft until Publish; (361) keep candidate status words
from the stage category; (362) add the company colour and careers link to the offer and interview page answers.
Founder approved, 9 Nov 2026 (HIR-10/20/07 questions 361-368, all as suggested): (361) keep the BGV tracker to holders of
lifecycle.bgv.manage, give a hiring admin the key per person when HR wants; (362) keep: a discrepancy is decided by someone
other than the recorder (setting hiring.bgv.decider_other_person, default on), draw the switch into 6.1 under Background
checks; (363) keep: only a discrepancy needs a decision; (364) block confirming probation while a "clear before
confirmation" check is open, the same way joining is blocked; (365) show email and WhatsApp opt-in columns when sequences
are built; (366) keep who may comment on a scorecard; (367) redact the scorecard summary and rating notes in the candidate
erase too; (368) keep the BGV export to results only.
## Founder questions from the HIR-10 / HIR-20 build and answer 322 (12 Nov 2026)
Built on `feat/yukthix-hir-10-20`. Each has a safe default already built; the suggestion is the answer we propose.
361. **Who may see the BGV tracker.** Built: only holders of the HR background-check key (`lifecycle.bgv.manage`, HR Lifecycle
     admin), in each joiner's scope; the Hiring admin and Recruiter templates do not get it (Special data). *Suggested: keep;
     give a hiring admin the key per person when HR wants them to run checks.*
362. **Who decides a discrepancy.** Built: anyone with the key, but not the person who recorded it (company setting
     `hiring.bgv.decider_other_person`, default on); "proceed" lets a "must be clear before joining" check pass; "do not
     proceed" only records it (no automatic withdrawal). The setting has no screen yet (defaults apply; Settings 6.1's
     "Background checks" section has no place for it). *Suggested: keep; draw the switch into 6.1 under Background checks.*
363. **"Could not check" (Insufficient).** Built: it is a result like any other; only a discrepancy needs a decision.
     *Suggested: keep; ask a person only for discrepancies.*
364. **The "before confirmation" gate.** A check can be marked "must be clear before confirmation", but nothing enforces it
     at confirmation today (existing gap, found here). *Suggested: block confirming probation while such a check is open,
     the same way joining is blocked.*
365. **Email and WhatsApp opt-in columns on Talent CRM.** Built: hidden; the only consent shown is the talent-pool consent
     (candidates have opt-out flags, no opt-in store). *Suggested: show them when sequences (Campaigns tab) are built.*
366. **Who may comment on a scorecard (answer 322).** Built: whoever may read that submitted scorecard (its panellist,
     colleagues who submitted theirs, recruiters, the job's hiring manager); comments show to the same people.
     *Suggested: keep.*
367. **Scorecard text on candidate erase.** Built: comments are redacted by the erase. Found: the scorecard's own summary
     and rating notes are not redacted today (existing gap). *Suggested: redact them in the same erase.*
368. **BGV export.** Built: Export gives results only (joiner, check, result, who, day, decision), never notes or reports.
## Settings 6.1 follow-ups built (answers 341, 345, 348; 12 Nov 2026, branch `feat/yukthix-hiring-settings-2`)
- (341) The seven settings are drawn into 6.1 and live, each a company setting with its default, audited, changed by the
  same keys as the page: plan mode (Segment; default Advisory) and the hiring manager's view (on) under "Pipelines,
  scorecards and approvals"; show pay range (off) and ask pay history (off) under "Offers and hand-off"; the rehire flag
  (off) under "Background checks and candidate data"; AI notes on past candidates (off) beside AI interview; the
  self-apply days (90) under the referral rule. The settings kit gained the `segment` kind (2-4 short options).
- (345) Scorecard templates are added, edited (a used one is saved as a copy) and archived on 6.1 in the new
  `ScorecardTemplateSheet` (pipelines key, never while acting). Weights are whole per cent adding to 100 (API 400
  otherwise); older templates keep their weights and score the same. /yx/hiring/scorecards, its menu item and
  `ScorecardTemplatesScreen` are deleted; the old address redirects to /yx/settings/hiring.
  Migration `202617o0000000_scorecard_weight_per_cent` widens the item weight check from 1-10 to 1-100 (schema only).
- (348) The default recruiter's choices are the people who hold the recruiter key (`pipeline:manage`, resolved like the
  guard: role, profile, role grants, and `ats.job.manage` / `ats.candidate.manage` company-wide). Anyone else is refused
  with 400 on `PUT hiring/settings` and `PUT org/settings`. A stored default who left or lost the key reads as None with a
  warning, and new requisitions start with no recruiter.
## Founder questions from the Settings 6.1 follow-ups (12 Nov 2026)
381. **Which key makes a recruiter.** Built: `pipeline:manage` (the key recruiting works with). Besides Recruiters, System
     Admins hold it, and so does the older "hiring_manager" user role and the agency consultant in demo-org (role
     recruiter). *Suggested: keep; if hiring managers or agency people must not be offered, narrow to people with
     `ats.job.manage` and not an agency login.*
382. **Pay range and pay history for one entity or location.** 6.1 shows and saves the company value only; a value set for
     a legal entity or location (company settings API) still applies there but is not shown on 6.1. *Suggested: show
     "Different for: …" under each and let HR pick the entity or location, when a customer uses them.*
383. **Older scorecard weights.** Templates saved before keep their 1-10 weights (scores unchanged); the list and editor
     show them as per cent, and saving stores per cent. *Suggested: keep; no data change.*
384. **Referral settings in two places.** The bonus, qualifying days and now self-apply days are on 6.1 and on Settings ›
     Company rules › Referrals (the same company settings). *Suggested: keep them on 6.1 only and drop the Company rules
     section.*
385. **A default recruiter who goes stale.** Built: the warning on 6.1 and None for new requisitions; nobody is told when
     it happens. *Suggested: tell the hiring settings holders by notification when the default recruiter leaves or loses
     the key.*
Founder approved, 9 Nov 2026 (questions 381-385, all as suggested): (381) keep `pipeline:manage` as the recruiter key;
(382) add "Different for: …" on 6.1 when a customer uses entity or location values; (383) keep older 1-10 weights, no
data change; (384) referral settings on 6.1 only (remove them from Company rules › Referrals); (385) notify the holders
of the hiring settings key when the default recruiter goes stale.
## Settings 6.1 round 3 built (answers 362, 364, 367, 384, 385; 13 Nov 2026, branch `feat/yukthix-hiring-settings-3`)
- (362) "A discrepancy is decided by someone other than who recorded it" is drawn into 6.1 under "Background checks and
  candidate data" and wired: `hiring.bgv.decider_other_person` (default on), saved with the page's keys, audited
  `org.setting.changed`; the BGV tracker reads the same setting.
- (364) A check marked "must be clear before confirmation" blocks confirming the probation while it is open (not clear,
  not cancelled, not a discrepancy decided "proceed"): approving a confirmation change (also through bulk changes and
  restructure) is refused with 409 `BGV_NOT_CLEAR_FOR_CONFIRMATION`; joining straight as confirmed (or a rehire that
  skips probation) is refused the same way; the company's auto-confirm rule waits and records
  `employee.probation.auto_confirm_held` once. Joining's own gate now carries 409 `BGV_NOT_CLEAR_FOR_JOINING`.
- (367) The candidate erase also redacts each scorecard's summary and rating notes ('Redacted'); the rating,
  recommendation and score stay. Migration `202617o0000001_scorecard_erase_redaction` adds `scorecards.redacted_at` and lets
  a submitted scorecard change only by that redaction, once (schema only, no data write).
- (384) Settings › Company rules no longer has a Referrals section; the Company rules design has no place for a link, so
  none was added (question 394).
- (385) An hourly sweep (`hiring-default-recruiter`) tells the people with the hiring settings key for the whole company
  (bell and email, `hiring.default_recruiter.stale`, link to Settings › Hiring) when the default recruiter has left or lost
  the recruiter key, once for each saved value (marker `hiring.default_recruiter.stale_notified`).
## Founder questions from Settings 6.1 round 3 (13 Nov 2026)
391. **A rehire who skips probation with an open "before confirmation" check.** Built: joining is refused with the code
     until the check is clear or HR changes its gate. *Suggested: keep; HR decides.*
392. **Confirmation while a check is open.** Built: refused at approval; HR can still raise the confirmation and see the
     preview. *Suggested: keep; also show the open check on the probation page.*
393. **A default recruiter who regains and then loses the key** without anyone saving the setting is told only once (the
     notice is per saved value). *Suggested: keep.*
394. **Link from Company rules to 6.1.** The Company rules design has no place for a link, so the Referrals section was
     removed without one. *Suggested: add a short "Referral bonuses moved to Settings › Hiring" line to the design if HR
     asks.*
395. **Erased scorecards keep their numbers.** The rating per skill, the recommendation and the score stay (no text about
     the person). *Suggested: keep, so panel and funnel figures stay right.*
Founder approved, 9 Nov 2026 (questions 391-395, all as suggested): (391) keep: a rehire skipping probation is refused
at joining while a "before confirmation" check is open, HR decides; (392) also show the open check on the Probation page;
(393) keep: reported once; (394) add the "Referral bonuses moved to Settings › Hiring" line to the design only if HR asks;
(395) keep ratings, recommendation and score on erased scorecards.
## Founder questions from the HIR-09 answers 332, 334-337 build (11 Nov 2026)
Each has a safe default already built; the suggestion is the answer we propose.
371. **Joining bonus month.** Built: the joining month's run; if that month is locked, the next one; if both are locked,
     nothing is queued and the offer's activity says so for payroll. *Suggested: keep.*
372. **Clawback of a bonus not paid yet.** Built: when the person leaves within the months before any run paid the bonus,
     it is simply not paid (cancelled), nothing is recovered. *Suggested: keep.*
373. **Clawback basis.** Built: company setting, default all of it; pro rata counts the days of the period not served.
     Taxes on a repaid bonus are left to payroll's usual F&F recovery line. *Suggested: keep; counsel checks the clause
     wording in the offer letter template.*
374. **Who is told on the joining day.** Built: the joiner's HR owner in People, plus whoever made and sent the offer, in
     the bell and by email, once per offer. *Suggested: keep.*
375. **Reminder limit.** Built: one reminder of each kind per offer a day (the button says why when refused).
     *Suggested: keep.*
376. **A named band approver who loses the offer-pay key later.** Built: refused at save; if the key goes later, the step
     falls back to the company admins (the P03 rule for a step with nobody). *Suggested: keep; tell HR on the settings
     page when the named person can no longer approve.*
377. **E-signed letter copy.** Built: the evidence (time, address, device, the letter's fingerprint) is kept on the offer;
     no sealed PDF copy is made for the candidate as letters do. *Suggested: add the sealed copy with the letters' signer
     when the offer letter moves to People letter templates (PPL-29).*
## Founder questions from the HIR-28 bulk offers build (12 Nov 2026)
401. **Joining batch.** The design chose a "joining batch"; offers have no batches (People's joiner batches come after
     acceptance). Built: one joining date for the whole batch, drawn in its place. *Suggested: keep; link the accepted
     offers to a People joiner batch when HR adds the joiners.*
402. **Where bulk offers start.** Built: "Make bulk offers" in the job workspace's menu (drawn), for people with the
     offer-pay key; the batch page is reached from there and from each offer. *Suggested: also add it to the pipeline
     board's Bulk actions sheet for selected candidates.*
403. **Plan check order.** Rows beyond the free places on the job's plan line are held in the order listed (free = the
     line's count less hires and offers in play on its jobs); a job with no plan line is not checked. *Suggested: keep.*
404. **Expiry.** Built: `hiring.offer.expiry_days` (7) after sending, never after the joining day (single offers keep
     their own chosen expiry). *Suggested: show it on Settings 6.1 "Offer expires after" (drawn there) and use it as the
     single builder's default too.*
405. **Batch size and speed.** Built: at most 100 candidates; rows are made one after another in the request (about a
     second each). *Suggested: keep for campus batches; move to a background job with progress if batches grow.*
406. **Same CTC for everyone.** Each row's CTC is typed; there is no "apply to all". *Suggested: add "Set the same CTC
     for the selected" in the kit table's bulk edit later.*
Founder approved, 10 Nov 2026 (questions 371-377, 401-406, 411-414, 421-425, all as suggested): keep 371, 372, 374,
375, 403, 411-414, 424, 425; (373) keep, counsel checks the clawback wording (go-live list); (376) warn HR on 6.1 when
the named band approver loses the offer-pay key; (377) sealed e-sign PDF with PPL-29 letter templates (later); (401) link
accepted offers to a People joiner batch (later); (402) add bulk offers to the pipeline board Bulk actions; (404) one
"Offer expires after" on 6.1, used by single and bulk offers; (405) background job with progress if batches grow (later);
(406) bulk edit in the kit table (later); (421) WhatsApp slot reminders with interview reminders, opted-in only (later);
(422) drag to swap on the interview-day board (later); (423) let the planner remove single slots.
Founder approved, 10 Nov 2026 (questions 431-435 and 441-444, all as suggested): (431) keep the transcript upload;
pick a recording provider when a customer asks, behind the same consent (later); (432) keep the recorded answer, also ask
the candidate on their interview page once it is drawn (later); (433)-(435) keep; (441) keep the India date for Apply by,
use the job location's time zone when hiring abroad (later); (442) YukthiX staff switch white-label on from the console
with the plan; (443) add the quarantine-email switch to 6.1 under candidate data; (444) keep the Indian mobile for jobs
in India.
Founder approved, 10 Nov 2026 (questions 442, 451-456, 461-463, 471-476, 481-490, all as suggested): (442) build a
YukthiX-staff-only "Company settings" page in the console for white-label, audited, tied to the plan; keep 451, 455, 456,
461-463, 472, 485-488, 490; (452) give recruiters `ats.staffing.view` in companies that turn the desk on; (453, 454) client
portal, TDS as data and invoice grouping in slice 3; (471) keep, counsel confirms the NYC city list and remote roles;
(473) hint on 6.1 when an AI tool is on and the company has a NYC location; (474) the NYC candidate notice on the job page
and apply form when the setting is on; (475) "Data from / to" only if counsel wants it; (476) one free builder builds the
small approved items, the other walks Hiring as real users, live against design, and fixes what it finds; (481) keep, a
selected candidate starts onboarding from the card later; (482) bench pay as a payroll input in slice 3, the exit review
stays manual; (483) a nightly job puts own-payroll people on the bench the day after the last day; (484) 13% statutory
cost (employer PF and ESI) for companies with those registrations; (489) a duplicate override with a reason, audited, for
an account manager.
Founder approved, 10 Nov 2026 (questions 491-505 and 511-515, all as suggested): (491) client portal interviews with
HIR-06 scheduling, tickets through the help desk later; (492) a GST invoice PDF (r.46 fields) next, then a Tally/Zoho
export; (493) a daily payment reminder email to billing contacts, paused by a dispute; (494) raise the fee invoice and the
guarantee credit from the placement record; (495) e-invoicing per legal entity later; (496) link confirmed vendor invoices
to the consultant payouts (PAY 8); (497) Time timesheets flow in later; (498) keep; (499) allow paise in the money field;
(500) client picker later; (501, 503) counsel (go-live list); (502) email the notice to hand-added NYC candidates and let
the recruiter record their request; (504, 505) keep; (511) interviewer keys only for people on an interview panel, an
employee's Hiring menu is Referrals and Internal jobs; (512, 513) keep; (514) bulk-offer CTC starts blank and Next asks
for it; (515) recruiting reads job-board names (never keys).
Founder approved, 10 Nov 2026 (questions 531, 532, 541, 542, all as suggested): (531) a "Send the New York City
notice" button on the Application drawer; (532) the single offer builder refuses a ₹0 CTC with the same words; (541) leave
the older v2 screens as they are (being retired); (542) HR removes results:view and interview:view_assigned from a
company-made manager role if managers should not read jobs and test results; panel membership is enough for interviews.
## HIR-27 bulk interview day and answer 392 built (14 Nov 2026, branch `feat/yukthix-hir-27`)
- HIR-27: see its section above. Interview days open from Hiring › Interviews (a new "Interview days" button, drawn on the
  HIR-06 header).
- (392) People › Probation: HR (who raises or approves job changes) sees "A background check must be clear before
  confirmation" in the review drawer while such a check is open, with why approving will be refused; a manager is never
  told (the count is not sent to them). Story PPL-16 BgvOpen.
## Founder questions from the HIR-27 build (14 Nov 2026)
421. **WhatsApp reminders 2 hours before each slot** (drawn on the day). No interview reminders exist, so the switch is
     hidden. *Suggested: add them with the HIR-06 reminder work (only to candidates who opted in).*
422. **Swapping two candidates** ("you can swap afterwards" in the design). Not built: Auto-assign places everyone; a
     single interview can still be moved on its own. *Suggested: drag to swap on the board in a later round.*
423. **Breaks in the day.** Slots are evenly spaced from the first slot (the 6.1 length); a lunch break needs a second
     day or fewer slots. *Suggested: let the planner remove single slots.*
424. **Time zone.** Every day is India time (IST), like HIR-06. *Suggested: keep; add a zone when a company hires abroad.*
425. **Panel email on a retry.** A row whose candidate email bounced is resent as HIR-06 resends: the panel gets the invite
     again. *Suggested: keep (same as a single resend).*
## Careers follow-ups built (answers 351-353, 355-357, 359, 362; 13 Nov 2026, branch `feat/yukthix-careers-2`)
- (351) The API's emails, feeds and sitemap use the /yx addresses (offer, interview, application, candidate, apply); the
  old-address redirects stay until 13 Nov 2027 (noted in `apps/web/next.config.js`).
- (352) When a résumé is quarantined, the applicant gets "We could not accept your résumé file" with their candidate-page
  link to upload another (audited `candidate.resume.quarantine_told`). Company setting
  `hiring.resume_quarantine.tell_applicant`, default on.
- (353) Jobs gain optional Apply by (date) and Experience (up to 60 characters) on Create job (kit `CreateJobSheet`) and
  the job API. After the Apply-by day (India date) the job is off the careers site, feeds and sitemap and its apply link
  says "This role is not accepting applications". Migration `202617p0000000_job_apply_by_experience` (two nullable columns).
- (355) The HIR-05 Application drawer shows a "Pay history" card with the pay given when applying, fetched from
  `GET hiring/offers/current-pay` only by holders of the offer-pay key (another company's entry: 404).
- (356) Company setting `brand.white_label`, default off: hides "Powered by YukthiX" on the careers site, job page and every
  candidate page.
- (357) New kit part `TenantLogo` (image with the company name as alt text, 24 / 40 px caps, name as fallback), story
  Foundations › TenantLogos; shown in the portal header of every candidate page and on the careers banner.
- (359) A job whose location is outside India takes an international number (kit `MaskedField` kind `intlPhone`, checked
  with libphonenumber); the job answer carries `internationalPhone`. Jobs in India keep the 10-digit mobile.
- (362) The offer and interview answers carry the company's brand (name, logo, careers link, colour, white-label).
## Founder questions from the careers follow-ups (13 Nov 2026)
441. **Apply-by day.** The job closes after the Apply-by day in India time, also for jobs abroad (a New York job closes
     at 2:30 pm New York time). *Suggested: keep for now; use the location's time zone when overseas hiring grows.*
442. **Where white-label is switched on.** `brand.white_label` is a company setting with no screen yet (D15 says
     plan-level). *Suggested: YukthiX staff switch it from the console with the plan; HR does not see it.*
443. **Quarantine email switch.** `hiring.resume_quarantine.tell_applicant` (default on) has no place on Settings 6.1
     yet. *Suggested: draw it on 6.1 under "Background checks and candidate data".*
444. **International number on jobs in India.** The designed form still asks Indian applicants for a 10-digit mobile;
     the API accepts any number (an applicant abroad applying to an India job must use an Indian number). *Suggested:
     keep; add a "my number is not Indian" switch only if recruiters ask.*
## HIR-13 internal jobs built (founder decision 6, answer 226; 13 Nov 2026, branch `feat/yukthix-hir-13`)
- Who can apply, and when, are company settings with defaults on Settings 6.1 › Internal jobs (audited, the page's keys):
  past probation (on), months in the current role (12), tell the current manager (when they apply). Never while serving
  notice, never without a current employee record, never for a job one is the hiring manager of.
- Migration `202617p0000000_hir13_internal_jobs`: `jobs.internal_open`, `jobs.referral_open` (both default on) and the
  `internal_applications` table (forced RLS). Schema only; no data written.
## Founder questions from the HIR-13 build (13 Nov 2026)
411. **New jobs on Internal jobs by default.** Built: every job (new and existing) shows on Internal jobs and stays open
     for referrals until a recruiter switches it off in the job's "Referrals & internal" tab. *Suggested: keep; switch a
     confidential replacement off by hand. If customers often forget, add a company setting "New jobs show on Internal
     jobs" (default on).*
412. **Serving notice.** Built: someone whose employment status is "notice" can never apply (not a setting); someone whose
     resignation still waits for approval can. *Suggested: keep both.*
413. **What counts as "current role".** Built: the months count from the day the current designation started; a move of
     department, location or manager alone does not restart the count. *Suggested: keep.*
414. **Who reads "Why are you interested?"** Built: the hiring team sees it as the first note on the application; the
     current manager is told only the person's name and the job, and sees no notes, tests or stage. *Suggested: keep.*
## HIR-25 interview notetaker built (founder decision 2; 13 Nov 2026, branch `feat/yukthix-hir-25`)
- Company settings with defaults on Settings 6.1 › Interview notetaker (audited, the page's keys): the notetaker (off), the
  AI draft scorecard (off), keep transcripts and drafts (90 days). Consent from every participant before any transcript or
  AI note; a "no" at any time deletes them. The AI draft is a suggestion the panellist confirms and submits themselves.
- HIR-12 fix on the same branch: a referral résumé that is not a real PDF (by its content) is refused with 400.
## Founder questions from the HIR-25 build (13 Nov 2026)
431. **Recording provider.** Built: no recording or transcription provider is connected; once everyone consents a
     panellist adds the transcript as a .txt file from their meeting tool. *Suggested: keep the upload path; pick a
     provider (Zoom / Google Meet / Teams transcripts, or an Indian speech-to-text vendor) when a customer asks, behind
     the same consent.*
432. **How the candidate consents.** Built: a panellist or recruiter records the candidate's answer ("Candidate agreed" /
     "declined"), with who recorded it in the record and the audit. *Suggested: also ask the candidate on their interview
     link page before the call (needs a drawn candidate page, like question 10).*
433. **Who on the panel adds the transcript.** Built: any panellist, only while everyone has consented; adding another
     replaces it and drops drafts made from the old one. *Suggested: keep.*
434. **AI note text kept as rating notes.** Built: when the panellist submits from the draft, each skill's AI note goes in
     as that rating's note (the panellist saw it next to the rating). *Suggested: keep; a panellist who wants their own
     words fills the scorecard form instead of the draft.*
435. **Recruiters off the panel.** Built: they see the consent card and record the candidate's answer, but never give
     panel consent, add a transcript or draft. *Suggested: keep.*
## Staffing desk slice 1 built (14 Nov 2026, branch `feat/yukthix-staffing-1`)
- HIR-14, HIR-15 and Settings 6.2: see their rows above. Company settings with defaults: `staffing.desk.enabled` (off),
  `staffing.ot_multiplier` (1.5), `staffing.holiday_multiplier` (2), `staffing.payment_terms_days` (30),
  `staffing.rate_change.backdate_days` (0).
- For slice 2: HIR-21 must reuse Agency, AgencyJob, AgencySubmission and /agency/[token]; placements and submissions
  should point at `staffing_clients` and the current `staffing_rates` line (by `line_id` and the day).
## Founder questions from the staffing desk slice 1 (14 Nov 2026)
451. **Pay above bill.** A rate-card line whose pay rate is above its bill rate is refused (the database refuses it too).
     *Suggested: keep; a loss-making line needs a deliberate exception later if ever.*
452. **Who gets the staffing keys.** Built: System Admins and the new "Staffing account manager" template; the Recruiter
     template is unchanged (no `ats.staffing.view`). *Suggested: add `ats.staffing.view` to the Recruiter template for
     companies that turn the desk on.*
453. **Client portal.** The design's portal access per contact (Active / Invited / Invite to portal) is not built: there is
     no client sign-in. *Suggested: build it with slice 3 (clients see their placements and invoices).*
454. **TDS by client and invoice grouping** (design overview) are left out until invoices (slice 3). *Suggested: keep
     the TDS section as data (a rule set like the GST state codes) and add both with slice 3.*
455. **Clients without a GSTIN.** Allowed (an unregistered client, B2C invoicing later). *Suggested: keep; the invoice
     slice warns when a client has none.*
456. **The desk switch and existing data.** Turning the desk off hides the menu and closes the pages (403); the data stays
     and returns when it is turned on. *Suggested: keep.*
Founder approved, 14 Nov 2026 (questions 441-444, all as suggested): keep 441 and 444; (442) YukthiX staff switch
white-label per company from the console with the plan; (443) draw the quarantine-email switch on 6.1.
## Offers round 3 built (answers 376, 402, 404, 423, 443; 14 Nov 2026, branch `feat/yukthix-offers-3`)
- (376) Settings 6.1: a named approver above the range who left or lost the offer-pay key is named on the field ("Ravi
  Kumar (cannot approve)") with a warning, like the stale default recruiter; until HR chooses again the step goes to the
  company admins. `GET hiring/settings` returns `staleBandApprover`. Story P6_1_StaleBandApprover.
- (402) The pipeline board's Bulk actions sheet has "Make bulk offers" for holders of the offer-pay key: it opens the
  HIR-28 batch page with the ticked candidates chosen (`?entries=`); the others start unticked. Story BulkActionsOffers.
- (404) One "Offer expires after" on 6.1 (`hiring.offer.expiry_days`, 3/5/7/10/14/30 days, default 7): bulk offers use it
  and the single offer builder starts its expiry date that many days from today (the recruiter can change it).
- (423) Interview days: the plan sheet lists each slot to untick (a lunch break), and on the board Remove takes one slot
  out (`DELETE hiring/interview-days/:id/slots/:start`, audited `ats.interview_day.slot_removed`); candidates placed there
  and not yet sent wait again, and Auto-assign skips the slot. Refused for a slot with a sent invite (409), the day's last
  slot (400), while sending (409). Story RemoveSlot.
- (443) 6.1 "Tell an applicant when their résumé file is blocked" (on by default) under "Background checks and candidate
  data", drawn first; saved and audited as `hiring.resume_quarantine.tell_applicant`.
- (442) Not built: the YukthiX console has no per-company settings page (Companies › one company has lifecycle, trial,
  support access, admins and history only; Plans has prices only). Left for the coordinator, as asked.
## Founder questions from offers round 3 (14 Nov 2026)
461. **A slot removed for one panel only.** Remove takes a time out for every panel of the day (a lunch break for all).
     One panel cannot break at a different time. *Suggested: keep; add per-panel breaks only if planners ask.*
462. **Bulk offers from the board.** Ticked candidates who cannot get a bulk offer (for example already holding an offer
     in play) are not on the batch page, so they quietly drop out. *Suggested: keep; the batch page lists who can get one.*
463. **Offer expiry choices.** 6.1 offers 3, 5, 7, 10, 14 or 30 days (the design drew any number 1-60). *Suggested: keep
     the fixed list.*
## HIR-23 bias audit built (founder decision 2, question 7; 13 Nov 2026, branch `feat/yukthix-hir-23`)
- The company setting "We use an automated tool for jobs in New York City" (`hiring.bias_audit.nyc`, off) on Settings 6.1;
  the law as the rule set HIR.BIAS_AUDIT (verify; GO-LIVE-CHECKLIST line for counsel); audits append-only, each valid 12
  months; with the setting on and no valid audit, the rediscovery AI notes and the AI draft scorecard are refused for New
  York City jobs with a plain message. HIR-08 (AI video interview score) must use the same gate before it is offered.
## Founder questions from the HIR-23 build (13 Nov 2026)
471. **Which jobs are "New York City".** Built: a job whose company location is in New York state with a city named in the
     rule set (New York, Manhattan, Brooklyn, Queens, the Bronx, Staten Island); a job with only a free-text place counts
     when the text names one of them. Remote jobs tied to a NYC office are not modelled. *Suggested: keep; counsel confirms
     the city list (GO-LIVE) and whether remote roles reporting to a NYC office count.*
472. **Download export and Auditor access.** Drawn but hidden: YukthiX keeps no sex or race data on candidates, so there is
     nothing to export, and there is no time-boxed auditor login. *Suggested: keep hidden; the auditor works from the
     company's own data and the entered results are their summary.*
473. **Setting off while using AI on NYC jobs.** Built: with the setting off nothing is blocked (the company says it does
     not use an automated tool for NYC jobs). *Suggested: keep, and show a hint on 6.1 when AI notes or the AI draft are
     on and the company has a New York City location.*
474. **Candidate notice.** NYC Local Law 144 also asks for a notice to candidates 10 business days before the tool is
     used, and an alternative process on request. Not built. *Suggested: add the notice to the T9-09 job page and the
     apply form for NYC jobs when the setting is on.*
475. **Data period.** The design shows the period the audit data covers; not stored. *Suggested: add "Data from / to" to
     the record form if counsel wants it on the page.*
## Staffing desk slice 2 built (10 Nov 2026, branch `feat/yukthix-staffing-2`)
- HIR-16, HIR-17, HIR-21 and the Settings 6.2 additions: see their rows above. New company settings with defaults:
  `staffing.vendor.target_margin_pct` (25), `staffing.vendor.ownership_days` (90), `staffing.submission.mask_contact`
  (on), `staffing.placement.ending_soon_days` (30), `staffing.statutory_cost_pct` (0), `staffing.bench.pay_pct` (50),
  `staffing.bench.max_days` (30), `staffing.bench.after` (review).
- Slice 3 still to build: hours and timesheets, client invoices (HIR-18), collections (HIR-19), vendor invoices, fees
  (HIR-30), e-invoicing (HIR-31), the client portal.
## Founder questions from the staffing desk slice 2 (10 Nov 2026)
481. **A pipeline candidate placed on own payroll.** Refused until they join as an employee (People › Onboarding); then
     they are submitted from the bench. *Suggested: keep; later, a "selected" candidate can start onboarding from the card.*
482. **Bench pay and the exit review.** The bench board shows days against the policy and what follows, but bench pay is
     not sent to payroll and no exit review starts. *Suggested: bench pay as a payroll input in slice 3; the exit review
     stays a manual HR step.*
483. **A placement that simply reaches its last day.** It shows Ended; the person is not put on the bench by itself (only
     End early does that). *Suggested: a nightly job puts own-payroll people on the bench the day after the last day.*
484. **Statutory cost.** One company percentage of the pay rate (default 0%, so margins show bill − pay). *Suggested: set
     13% (employer PF and ESI) for companies with those registrations; a per-rule calculation with payroll later.*
485. **Vendors without the desk.** Hiring › Vendors works for any company with recruitment agencies; only client jobs
     (with a cap) and Forward to client need the desk. *Suggested: keep.*
486. **Who sees vendor quotes.** Account managers and vendor managers (`ats.agency.manage`); recruiters with only the
     pipeline key see "over / within the cap", never the amounts. *Suggested: keep.*
487. **Submitting to a client is by email only.** The contact gets one email; if it fails the submission stays and the page
     says so. *Suggested: keep until the client portal (question 453).*
488. **Ownership window.** Counted per job from the first submission (or the person joining the job's own pipeline); the
     same vendor sending the same person twice is refused. *Suggested: keep 90 days as the default.*
489. **Duplicate disputes.** The design's "Review dispute" is not built: a duplicate cannot be forwarded and has no override.
     *Suggested: add an override with a reason (audited) for an account manager.*
490. **Vendor invoices.** The Vendor invoices tab stays hidden until hours exist (slice 3). *Suggested: keep.*
## Staffing desk slice 3 built (10 Nov 2026, branch `feat/yukthix-staffing-3`)
- HIR-18, HIR-19, HIR-30, HIR-31, the vendor invoices tab, the client portal (T9-06) and Settings 6.2: see their rows and
  the section E note. New company settings: `staffing.dunning.schedule` (standard), `staffing.einvoice.applies` (off).
  Client fields: `tds_section`, `invoice_grouping` (month). Rule sets (verify): `GST.STAFFING_RATE`,
  `GST.EINVOICE_WINDOW`, `TDS.SECTIONS`.
## Staffing follow-ups built (answers 482, 483, 484, 489; 10 Nov 2026, branch `feat/yukthix-staffing-3`)
- Migration `202617o0000006_staffing_followups`: `lop_inputs.source` may be `bench`; `staffing_bench_pay` (once per bench
  spell per pay month, RLS); the duplicate override columns on `agency_submissions`. Nightly job `staffing-nightly` at
  01:30 India time (BullMQ, idempotent).
## Founder questions from the staffing desk slice 3 (10 Nov 2026)
491. **Client portal: interviews and tickets.** The drawn Interviews (schedule) and Tickets tabs are not built: interview
     scheduling with a client panel and client tickets have no back end. *Suggested: interviews with HIR-06 scheduling;
     tickets through the help desk later.*
492. **Invoice PDF and export.** No invoice PDF, Download or Export to accounting yet; the client portal shows invoices
     without a PDF. *Suggested: a GST invoice PDF (r.46 fields) next, then a Tally/Zoho export.*
493. **Payment reminders.** The next reminder date is shown on the company's schedule, but no reminder email is sent yet.
     *Suggested: a daily job that emails the billing contacts, paused by a dispute.*
494. **Fee invoices and guarantee credits.** HIR-30 terms are kept, but a permanent placement or conversion does not yet
     raise a fee invoice, and a leaver inside the guarantee does not raise the credit. *Suggested: raise both from the
     placement record when the client hires.*
495. **E-invoicing per legal entity.** E-invoicing is one company setting (the design shows it per legal entity).
     *Suggested: per legal entity once a company has entities on both sides of the limit.*
496. **Vendor invoices into payroll.** The design says a confirmed vendor invoice becomes a consultant invoice in payroll
     (TDS under the vendor's section). Built: confirm and mark paid on the staffing desk only. *Suggested: link to the
     consultant payouts (PAY 8) so TDS is deposited and certified there.*
497. **Hours entry.** Weekly hours are entered by the account manager (a drawn sheet); workers do not enter them, and
     the employee timesheets of the Time area are not used. *Suggested: let own-payroll workers' approved Time
     timesheets flow in later.*
498. **A week across two months.** A week counts in the month of its Monday (for invoices and vendor invoices).
     *Suggested: keep; split by day only if a client asks.*
499. **Credit notes in whole rupees.** The credit-note and receipt fields take whole rupees (the kit's money field); the
     API takes paise. *Suggested: allow paise in the money field.*
500. **Client sign-in for a contact of two clients.** A person who is a contact of two clients signs in to the first.
     *Suggested: a client picker if it ever happens.*
## Hiring walk as real users (answer 476; 13 Nov 2026, branch `feat/yukthix-hiring-walk`)
Walked on the test app as hr-tester (Hiring admin + Recruiter), panel (Divya, manager and panellist), arjun (employee)
and admin-tester (settings), every Hiring page and its main drawers, against the Storybook designs at 1278 x 635.
Fixed: the no-access state (instead of a load error or an empty list) on Candidates, Bias audits and Settings › Hiring;
no requests the API refuses a role (message templates, sender addresses, pipelines, pools) so no 403s in the console for
managers and employees; the job overview's legal entity; the candidate source in words; the jobs list totals on one line
with In pipeline summed. Screenshots and the per-page results are in the walk report.
## Founder questions from the Hiring walk (13 Nov 2026)
511. **What an employee sees under Hiring.** Arjun (a plain employee) has Jobs & requisitions, Interviews and Test results
     (older screens) because the default employee role holds the interviewer keys (`results:view`,
     `interview:view_assigned`): he can read every job with its applicant counts. *Suggested: give those keys only to people
     put on an interview panel (or a Panellist role), so an employee's Hiring menu is Referrals and Internal jobs.*
512. **Breadcrumbs.** Every live Hiring page shows "Hiring › page" above the title; the designs do not. *Suggested: keep (the
     app shell adds them everywhere); no design change.*
513. **Long emails in the candidate list.** An email or mobile number that wraps makes a 6-row list scroll by a few lines at
     1278 x 635. *Suggested: keep wrapping (nothing is cut off); revisit if HR asks for one-line rows.*
514. **Bulk offers start at ₹0.** The per-candidate Fixed CTC starts empty as ₹0 until typed. *Suggested: start blank with
     "Enter the CTC" on Next, so ₹0 is never sent by mistake.*
515. **Recruiters and job boards.** A recruiter without the settings key cannot read the company's board list, so the job's
     Settings tab offers no boards to pick (postings already made still show). *Suggested: let recruiting (`pipeline:manage`)
     read the board names (never their keys), so they can post a job themselves.*
## Small items round 4 built (answers 442, 452, 473, 474; 15 Nov 2026, branch `feat/yukthix-hiring-small-4`)
- (442) Console › Companies › one company › **Company settings** (YukthiX staff only, platform session with the security
  key): `brand.white_label` switched per company with a reason (`PATCH platform/companies/:id/settings`,
  `platform.companies.manage`; read with `platform.companies.view`), audited `platform.company.setting_changed` in the
  company's history. Tied to the plan: plans had no feature list, so `products.features` (data, migration
  `202617s0000000_product_features`; D15: `white_label` in the HR and Service Desk plans) decides; switching on is refused
  (409) when none of the company's products includes it; off is always allowed. The company cannot change or remove it
  (`PUT org/settings` 403). Drawn first: console stories CompanySettings and CompanySettingsNotInPlan.
- (452) The Recruiter template gains `ats.staffing.view` (clients and bill rates), in effect only while the company's desk
  is on (the staffing routes refuse otherwise). Template history as for the slice-1 template; existing recruiters (the
  older recruiter role and company roles still following the template) get it by migration
  `202617s0000001_recruiter_staffing_view`, written with the super-admin line and audited `access.role.template_synced`
  like the template sync; changed roles are left alone.
- (473) Settings 6.1: a warning on "We use an automated tool for jobs in New York City" when it is off, AI notes on past
  candidates or the AI draft scorecard is on, and the company has a location in New York City (HIR.BIAS_AUDIT city rules;
  `GET hiring/settings` returns `nycLocations`). Nothing is blocked.
- (474) With the NYC setting on, a NYC job's page shows the kit `AutomatedToolNotice` (the tool is used, what it assesses,
  the notice days, how to ask for another process; `nycNotice` on the public job answer) and the apply form offers
  "Assess me another way". The request is kept on the application (`pipeline_entries.alternative_requested_at`, audited
  `candidate.alternative_process.requested`) and shown to the recruiter (board row, Application drawer). The 10 business
  days are data: HIR.BIAS_AUDIT 2023-v2 (`noticeBusinessDays`; 2023-v1 withdrawn, migration
  `202617s0000002_nyc_candidate_notice`). The AI draft scorecard is refused for a NYC application until the notice days
  have run from the day it came in, and never for a candidate who asked.
## Founder questions from small items round 4 (15 Nov 2026)
501. **Business days.** The notice days count Monday to Friday; US public holidays are not taken out. *Suggested: keep;
     counsel confirms (GO-LIVE), and a holiday list can join the rule set if needed.*
502. **NYC candidates a recruiter adds.** They never saw the job page notice: the AI draft waits the notice days from when
     they were added, but nobody tells them and they cannot ask for another process themselves. *Suggested: email them
     the notice when added to a NYC job, and let the recruiter record a request for another process.*
503. **Rediscovery and the notice.** AI notes on past candidates look at people for a new job; the notice and the
     request apply to the AI draft only. *Suggested: keep; counsel confirms whether rediscovery needs its own notice.*
504. **Plan features.** `products.features` has no console editor (only `white_label` exists today); a change is a
     migration. *Suggested: keep until a second plan feature appears.*
## Small items round 5 built (answers 502, 514; 16 Nov 2026, branch `feat/yukthix-hiring-small-5`)
- (502) A candidate a recruiter adds by hand to a New York City job while "We use an automated tool for jobs in New York
  City" is on is emailed the automated-tool notice (what it assesses, the notice days, their status link to ask for
  another process), kept with the candidate's messages; `pipeline_entries.tool_notice_at` (migration
  `202617t0000000_nyc_notice_email`), audited `candidate.tool_notice.sent`. The notice days count from that email (an
  applicant's from the day they applied). The status page shows the notice and "Assess me another way"
  (`POST public/applications/:token/alternative-process`, audited `candidate.alternative_process.requested`); the
  recruiter records a request made by phone or email on the Application drawer (`POST hiring/entries/:id/alternative-process`,
  audited `candidate.alternative_process.recorded`). Both show the same way as the apply-form request.
- (514) Bulk offers: each Fixed CTC starts blank, never ₹0. Continue with a blank (or 0) names the rows and puts the
  cursor in the first one's cell (kit DataTable `openEdit` / `editLabel`). The API refuses 0 or blank (400).
## Founder questions from small items round 5 (16 Nov 2026)
531. **Hand-added candidates never told.** A candidate added before the company turned the NYC setting on, or whose
     notice email failed or who unsubscribed from emails, has no notice: the AI draft stays refused for them, with that
     reason. *Suggested: a "Send the New York City notice" button on the Application drawer.*
532. **A CTC of ₹0 on a single offer.** The single offer builder has no ₹0 check of its own, only what the salary structure refuses (bulk
     offers now refuse 0). *Suggested: refuse 0 there too, with the same words.*
## Small items round 6 built (answers 531, 532; 17 Nov 2026, branch `feat/yukthix-hiring-small-6`)
- (531) Application drawer: "Send the New York City notice" for a NYC job with the setting on, shown while a candidate
  added by hand was never told (board row `toolNoticeNeeded`). The same email, audit (`candidate.tool_notice.sent`) and
  notice-day start as 502; the entry is claimed before the email goes, so two presses never send two emails (409), and a
  failed email gives the claim back with a plain message. Refused while acting, for an applicant (told on the page), and
  where no notice applies.
- (532) The single offer builder refuses a ₹0 or blank fixed CTC, on the screen and in the API (`Enter a fixed CTC above
  ₹0.`, the bulk offers words); the preview is not asked until the CTC is above 0.
- Found while testing: the kit Drawer showed its error notice only when it had a footer, so the HIR-05 Application
  drawer (no footer) never showed a refusal. The Drawer now shows the notice either way.
## Founder questions from small items round 6 (17 Nov 2026)
551. **Sending the notice again.** Once the notice email has gone, there is no "send again" (a candidate who says it
     never arrived). *Suggested: keep; the recruiter records their request for another process by phone instead.*

