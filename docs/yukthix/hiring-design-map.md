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
- **Few of the Hiring designs are live.** Of 255 design stories (HIR-01 … 31, the careers site, candidate
  identity check and the hiring settings), 118 of 271 are live with their design (recount 12 Nov 2026, after HIR-10 manual BGV on /yx/hiring/bgv, HIR-20 Talent CRM on /yx/hiring/pools and the HIR-07 scorecard comments). First the "Request a hire" sheet (HIR-02
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
  bench, client invoices, collections, placement fees, e-invoice window: HIR-14 … 19, 30, 31), internal jobs (HIR-13),
  AI interview review (HIR-08), notetaker and recording consent (HIR-25), candidate identity checks (HIR-22, T9-15),
  bias audit (HIR-23), BGV partner checks (HIR-10), bulk interview day and bulk offers (HIR-27, 28), interview slot finder from calendars (HIR-06), CRM sequences and
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
| B. Candidates, pipeline and interviews | 8 | 46 | 0 | 0 | 13 | 1 | 60 |
| C. Offers, BGV and joining | 4 | 19 | 4 | 0 | 5 | 0 | 28 |
| D. Referrals, internal jobs, CRM and rediscovery | 4 | 20 | 0 | 0 | 7 | 4 | 31 |
| E. Staffing agency | 8 | 0 | 0 | 4 | 44 | 0 | 48 |
| F. Compliance and fairness | 5 | 4 | 1 | 0 | 20 | 0 | 25 |
| G. Careers site, portals and settings | 4 | 54 | 4 | 2 | 11 | 0 | 71 |
| **All Hiring design groups (A–G)** | **37** | **179** | **10** | **6** | **100** | **5** | **300** |
| H. Kit and "Live ·" groups (not designs; own line) | 3 | 5 | 0 | 5 | 5 | 0 | 15 |
Recounted by script 12 Nov 2026 on `feat/yukthix-hir-09` after merging the Settings 6.1 follow-ups with answers 332 and 334-337: A–G 179 live, 10 gap, 6 wire, 100 not built, 5 phone, of 300.

Recounted by script on `test/yukthix-main` after merging the Settings 6.1 follow-ups with HIR-10/20: A–G 176 live, 12 gap, 6 wire, 100 not built, 5 phone, of 299 (H: the old scorecard-templates group left with its page).
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

## 3. Designs with no live page or API

| design | what is missing | size |
|---|---|---|
| HIR-08 AI interview review | no async AI interview, recordings or advisory score | L |
| HIR-10 partner BGV | no BGV partner integration (founder decision 3: after a vendor contract); manual checks are live on /yx/hiring/bgv | M (per partner) |
| HIR-13 internal jobs | no internal posting, eligibility rule or employee apply | M |
| HIR-14 … 19, 21 (part), 30, 31 | the staffing-agency business: clients, rate cards, submissions to clients, placements, bench, invoices, receivables, fees, e-invoice | XL |
| HIR-22, T9-15 identity | no candidate ID or selfie check (People's face match waits for a provider too) | M + provider |
| HIR-23 bias audit | no audit record or NYC setting | S |
| HIR-25 notetaker | no recording, consent or AI draft (an older notes-to-scorecard AI route exists: `POST interviews/:id/scorecard`, unused) | L |
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
saved views (225), the Referrals & internal tab and Share with vendors (226). The job form and the candidate pages read the custom field definitions from
`GET custom-fields/in-use` (results:view or pipeline:manage; ats.job.manage counts), so recruiters see them; the settings
list `GET custom-fields` stays `org:manage_settings` and is no longer called by these pages (it was refused for recruiters).

| story (sub-page) | verdict | note |
|---|---|---|
| List · Jobs list | live | `GET jobs` (`results:view`); job numbers, filters, search, Export CSV of the visible columns (CSV only, answer 241); row menu: copy careers link, send for approval, withdraw, put on hold, resume, close, reopen, delete (`pipeline:manage`); Recruiter column; saved views wait (225) |
| Workspace · Job workspace · overview | live | `GET jobs/:id` with `payLaw` and `postings`; job number; recruiter; stage counts from `GET jobs`; put on hold, resume, close, reopen; Open pipeline |
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

No live page. Designed: `BulkInterviewDayScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| Assigned · Auto-assigned · ready to send | design only, feature not built | no drive / interview-day API |
| OverCapacity · Over capacity · some unassigned | design only, feature not built | same |
| NotAssigned · Empty · not assigned yet | design only, feature not built | same |
| Sent · Invites sent | design only, feature not built | same |

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

No live page. Designed: `BulkOfferScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| Values · Per-candidate values · checks | design only, feature not built | no batch offers |
| Template · Template step | design only, feature not built | same |
| Preview · Preview step | design only, feature not built | same |
| Sent · Sent · batch status | design only, feature not built | same |

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

No live page, no API. Designed: `InternalJobsScreen`, `InternalJobsPhone`.

| story (sub-page) | verdict | note |
|---|---|---|
| Browse · Browse and my applications | design only, feature not built | no internal posting or employee apply |
| Apply · Apply sheet | design only, feature not built | same |
| NotEligible · Blocked · not yet eligible | design only, feature not built | needs an eligibility policy (default + HR setting) |
| Empty · Empty · no openings | design only, feature not built | same |
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

### E. Staffing agency

HIR-14 … 19 and HIR-30 have no page and no API (no client, rate card, placement, client invoice or collection model).
HIR-21 overlaps with the recruitment-agency feature that exists (Agency, AgencyJob, AgencySubmission; public
/agency/[token]; older v2 /settings/agencies and /agency-submissions). Scope: question 1.

#### HIR-14 · Clients

| story (sub-page) | verdict | note |
|---|---|---|
| List · Account manager · clients list | design only, feature not built | no client model |
| Workspace · Client workspace · overview | design only, feature not built | same |
| Contacts · Client workspace · contacts and portal access | design only, feature not built | same |
| Contracts · Client workspace · contracts | design only, feature not built | same |
| Slas · Client workspace · SLAs | design only, feature not built | same |
| Empty · Empty | design only, feature not built | same |
| Loading · Loading | design only, feature not built | same |
| Error · Error | design only, feature not built | same |

#### HIR-15 · Rate cards

| story (sub-page) | verdict | note |
|---|---|---|
| Current · Account manager · current rates with margin | design only, feature not built | no rate cards |
| History · Dated history shown | design only, feature not built | same |
| ChangeRate · Dated rate change | design only, feature not built | same |
| Recruiter · Recruiter · no pay rates or margins | design only, feature not built | same |
| Empty · Empty | design only, feature not built | same |

#### HIR-16 · Submissions board

| story (sub-page) | verdict | note |
|---|---|---|
| Board · Account manager · board | design only, feature not built | no submissions to client companies |
| Submit · Submit to client (bulk) | design only, feature not built | same |
| Recruiter · Recruiter · submit sheet | design only, feature not built | same |
| Empty · Empty | design only, feature not built | same |
| Loading · Loading | design only, feature not built | same |
| Error · Error | design only, feature not built | same |

#### HIR-17 · Placements and bench board

| story (sub-page) | verdict | note |
|---|---|---|
| List · Placements list with margin | design only, feature not built | no placements |
| Record · Placement record · ending soon | design only, feature not built | same |
| Extend · Extend (dated change) | design only, feature not built | same |
| EndEarly · End early · confirmation | design only, feature not built | same |
| VendorSupplied · Vendor-supplied placement | design only, feature not built | same |
| Bench · Bench board · policy days | design only, feature not built | same |
| BenchEmpty · Bench · empty | design only, feature not built | same |
| Loading · Loading | design only, feature not built | same |

#### HIR-18 · Invoices

| story (sub-page) | verdict | note |
|---|---|---|
| Finance · Finance · invoice list | design only, feature not built | no client invoices |
| AccountManager · Account manager · read only | design only, feature not built | same |
| IntraState · Invoice · CGST + SGST, credit note | design only, feature not built | same |
| InterState · Invoice · IGST (inter-state) | design only, feature not built | same |
| IrnWarning · Invoice · IRN day 28 warning | design only, feature not built | same (HIR-31) |
| Empty · Empty | design only, feature not built | same |
| Error · Error | design only, feature not built | same |

#### HIR-19 · Receivables and collections

| story (sub-page) | verdict | note |
|---|---|---|
| Ageing · Finance · ageing, TDS and disputes | design only, feature not built | no receivables |
| Receipt · Record part payment | design only, feature not built | same |
| Empty · Empty · nothing outstanding | design only, feature not built | same |
| Loading · Loading | design only, feature not built | same |
| Error · Error | design only, feature not built | same |

#### HIR-21 · Staffing vendors

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Register · one vendor pending documents | wire design | agencies exist (older v2 /settings/agencies); API: no vendor documents |
| ShareJob · Share job · rate cap and masked client | wire design | `AgencyJob` shares a job; API: no rate cap or masked client |
| Submissions · Vendor submissions · duplicate and over cap | wire design | `AgencySubmission` with `isDuplicate` (v2 /agency-submissions); API: no rate cap |
| Invoices · Vendor invoices · proposed from hours | design only, feature not built | no vendor invoices or hours |
| Scorecards · Scorecards | design only, feature not built | no vendor scorecards |
| Empty · Empty register | wire design | no agencies |

#### HIR-30 · Placement fee and replacement guarantee

| story (sub-page) | verdict | note |
|---|---|---|
| Percent · Account manager · % of CTC, replacement | design only, feature not built | no placement fees |
| FixedRefund · Finance · fixed fee, pro-rated credit | design only, feature not built | same |
| OutsideGuarantee · Left after the guarantee period | design only, feature not built | same |

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

| story (sub-page) | verdict | note |
|---|---|---|
| Valid · Audit valid | design only, feature not built | no audit record; only needed for NYC jobs with an automated tool (question 7) |
| Overdue · Overdue · feature blocked for NYC jobs | design only, feature not built | same |
| RecordAudit · Record new audit | design only, feature not built | same |
| NotApplicable · Not applicable · NYC setting off | design only, feature not built | same |

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

| story (sub-page) | verdict | note |
|---|---|---|
| AllConsented · All consented · recording | design only, feature not built | no recording or consent per participant (question 2) |
| OneDeclined · One declined · no recording | design only, feature not built | same |
| Waiting · Waiting for the candidate | design only, feature not built | same |
| DraftReview · Draft scorecard · 1 of 4 confirmed | design only, feature not built | an older notes-to-scorecard AI route exists (`POST interviews/:id/scorecard`), unused by YukthiX |
| DraftAllConfirmed · Draft scorecard · all confirmed, ready to submit | design only, feature not built | same |

#### HIR-31 · E-invoice window banner

| story (sub-page) | verdict | note |
|---|---|---|
| DayTen · Day 10 · within window | design only, feature not built | goes with client invoices (HIR-18) |
| DayTwentyEight · Day 28 · warning from day 25 | design only, feature not built | same |
| DayThirtyThree · Day 33 · blocked after day 30 | design only, feature not built | same |
| BelowThreshold · Entity below threshold · not applicable | design only, feature not built | same |
| OnInvoice · On the invoice · Send for IRN blocked | design only, feature not built | same |

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
| WhiteLabel · Careers home · white-label | live (gap) | no white-label setting in the API: "Powered by YukthiX" always shows (question 356) |
| NoJobs · Careers home · no open jobs | live | no open jobs |
| Job · Job page with pay range and apply | live (gap) | range only when the job shows it; no "apply by" date, experience or requirements list on a job (question 353); no WhatsApp apply (question 354) |
| JobPhone · Job page · phone | live | same page at phone width |
| Applied · Job page · application sent | live | after apply |
| Closed · Job page · closed | live | closed, on hold or unknown link: "This role is not accepting applications" (answer 242) |
| JobPayQuestion · Job page · pay question where the law allows | live | answer 224: only where the job asks and HIR-24's law row allows; dropped by the API otherwise |
| JobOnHold · Job page · not accepting applications (on hold) | live | answer 242 |
| Status · Application status | live | /yx/application/[token]: this application only, candidate words (no stage name) |
| StatusPhone · Application status · phone | live | same page at phone width |
| StatusDecision · Application status · decision made | live | rejected or archived |
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
| P6_1_StageTargets · 6.1 Hiring · stage targets | live | answer 302: Stage targets on a pipeline row opens `StageTargetsSheet`; `PATCH pipelines/stages/:id` (`pipelines:configure`, never while acting; audited); values checked and focused before saving; read-only without the key. The job's Settings tab shows them read-only with "Change in Settings" |
| P6_1_ScorecardEdit · 6.1 Hiring · edit scorecard | live | answer 345: Edit on a scorecard row opens `ScorecardTemplateSheet`; `PUT hiring/scorecard-templates/:id` (`pipelines:configure`, never while acting; audited `ats.scorecard_template.updated`); name, scale 3-10, pass bar 1 to the scale, skills with whole per cent weights adding to 100 (total shown live), what good looks like, from the competency library; pressed too early: field errors and focus; toast. Older 1-10 weights open as per cent |
| P6_1_ScorecardNew · 6.1 Hiring · add scorecard | live | Add scorecard: `POST hiring/scorecard-templates` (audited `ats.scorecard_template.created`); one skill at 100 % to start |
| P6_1_ScorecardUsed · 6.1 Hiring · used scorecard (saved as a copy) | live | a template already used by a scorecard is never changed: “Save as a copy” posts a new template named “(copy)”; the API refuses a change with 409 |
| P6_1_ScorecardView · 6.1 Hiring · scorecard, view only | live | the view-only sheet (skills with per cent, scale, pass bar) is drawn; live shows the list rows read-only without the pipelines key instead of opening it. Archive scorecard (danger, after a confirmation): `DELETE hiring/scorecard-templates/:id`, jobs using it go back to no scorecard, filled scorecards keep it |
| P6_1_StaleRecruiter · 6.1 Hiring · default recruiter no longer qualifies | live | answer 348: a stored default who left or no longer holds the recruiter key reads as None with a warning naming them; new requisitions start with no recruiter (`defaultRecruiter`); the API refuses anyone else as default with 400, on both `PUT hiring/settings` and `PUT org/settings` |
| P6_2 · 6.2 Staffing desk | design only, feature not built | rate cards, bill multipliers, invoice numbering: staffing business (question 1) |
| P6_2_ReadOnly · 6.2 Staffing desk · read-only | design only, feature not built | same |

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
| 14 | HIR-13 internal jobs (after question 6) | new API + page | M |
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
