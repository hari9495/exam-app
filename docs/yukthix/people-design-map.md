# People: live pages and their designs (check)

This file checks, story by story, that every People design sub-page can be reached in the live app. Pay and Time were
checked the same way (see `pay-design-map.md`, `time-design-map.md`). Founder rule: never build a second, simpler
version of a designed screen; make the designed one live.

Status 30 Oct 2026 (branch `feat/yukthix-people-design-map`, from `test/yukthix-main`): almost every People page already
renders its designed PPL screen with a `live` prop. The one stand-in page (the pre-boarding portal, T9-01) is live with its
design since 2 Nov 2026 (branch `feat/yukthix-joiner-portal`). What is left is three hidden live copies the guard cannot see (section "Hidden copies"), a few dialogs built inside pages, and states
the API cannot produce yet.

Verdicts (the same words as Pay): **live** (the live page renders the designed screen and can reach this state; the
note says how) · **live (gap)** (the design is live, but this state can't be reached yet; the note says why) ·
**wire design** (a live page exists for this job but renders something else) · **design only, feature not built** (no
API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Directory, record and changes | 9 | 138 | 0 | 0 | 2 | 0 | 140 |
| B. Onboarding and probation | 7 | 69 | 2 | 0 | 0 | 0 | 71 |
| C. Exits | 7 | 55 | 1 | 0 | 0 | 3 | 59 |
| D. Assets, documents, letters and self-service | 9 | 50 | 4 | 0 | 0 | 9 | 63 |
| E. Identity, same person and records | 6 | 14 | 7 | 0 | 2 | 0 | 23 |
| F. Declarations, relations, special cases and checklists | 11 | 68 | 1 | 0 | 0 | 3 | 72 |
| **All PPL groups (A–F)** | **49** | **394** | **15** | **0** | **4** | **15** | **428** |
| G. Other People stories (no PPL number) | 4 | 44 | 0 | 0 | 0 | 0 | 44 |

Counted by script (2 Nov 2026, branch `feat/yukthix-people-changes`: builder 2 added 24 design stories (PPL-03 12, PPL-04 3, PPL-05 3, PPL-24 6) and made the 8 "wire design" stories live; earlier counts 30 Oct 2026, on `test/yukthix-main`; the script is in the appendix): every `export const` story in the 49 `ppl-NN.stories.tsx`
files (PPL-01 … 50; PPL-10 has no story) and in the four other People story files, against the rows in section 4. The
script fails unless each story file has exactly one row per story, in file order, and every verdict is one of the five
words. 49 groups, 404 stories (400 before the small gaps added four: PPL-37 MergedList and MergedEmpty, PPL-43 and PPL-44 NotDesignated); the other People stories (section G) are 44 more and are counted on their own line.
The Kit (`people-kit.stories.tsx`, 10 stories) is shared parts, not pages, and is not counted. T9-01 (the pre-boarding
portal) is a Portals design, not a People one; its 39 stories (34 live, 5 waiting for providers) are in their own section below and are not counted here.

The 15 phone views are the 11 People phone screens in `packages/yx-ui/src/design-live-guard.known.json` (asset
acknowledge ×2, BFSI, certificate, clearance, disability, exit interview, my documents ×3, pre-clearance, profile
change ×2, resignation, who accessed). They wait for the mobile app. Phone stories of screens the web page renders at
phone width (directory, probation drawer, bank abroad for oneself) are counted as live.

## How to wire (same as Pay and Time)

- The designed screen takes a `live` prop: `p.live ? <LiveX live={p.live} /> : <SampleX {...p} />`. Stories keep the
  sample; the app passes `live` with real data, `state`, `onRetry`, the actions and `can`.
- Everything the live copy does today moves into the designed screen. Nothing is dropped.
- Then the live copy, its stories and its tests are deleted, the tests are ported to the design, and its line leaves
  `known.json`.
- Routes stay the same; the menu (`apps/web/lib/yx-nav.ts`) does not change.

## Hidden copies (the guard cannot see them)

**Builder 2 (branch `feat/yukthix-people-changes`, 2 Nov 2026): none left in its area.** `ChangeDrawer` is deleted (the
PPL-04 `ChangeActionDrawer` is the one change form), `ReasonDialog` has PPL-04 / PPL-05 stories, `VrsCard` is deleted
(PPL-40 `VrsApply`).

The guard matches screen names. These live parts have no design story, yet the guard does not list them, because the
name clashes with a design elsewhere or the part is not a `…Screen`:

| live page | what it renders today (file) | design it should render | why the guard misses it |
|---|---|---|---|

## PPL-10 · Inter-entity continuity checklist

PPL-10 is in `docs/yukthix/design/APX-D-screens-navigation.md` ("Inter-entity continuity checklist (on the change)",
T3 panel, HR and payroll) but has **no story of its own**. The checklist is drawn in PPL-09 (`Checklist · PPL-10 ·
continuity checklist (live items)` and `PayrollChecklist`) on the restructure record, and that is live at
/yx/people/restructure/[id] (`GET restructures/continuity`, payroll ticks only payroll items). A single inter-entity
transfer raised from the change drawer is sent as a restructure (`POST restructures`), so it reaches the same record and
checklist. Nothing to build; the group number stays unused (Q6).

## Founder answers, 2 Nov 2026 (erasure scope follow-up, "all ok")
(1) the disability list does not show erased former employees as "Yes, details deleted"; the answer stays in the data
for counting; (2) for joinings cancelled before 30 Oct 2026 the cancellation day estimated from the record's last change
is accepted; (3) the dry-run name list is not paged for now.

## Founder answers, 30 Oct 2026 (what Special data erasure deletes, "All ok")
(1) disability: keep the yes/no answer for the disability register; delete the sealed details and the certificate after
the same period; (2) consent records are kept (they prove the checks were lawful, no Special values); (3) a background
check's result (clear / discrepancy) is kept; only the report file goes; (4) offers that never joined are included,
counted from the day the joining was cancelled; (5) Aadhaar inside pay records and filings is never erased (payroll keeps
its own period); (6) the dry run lists name, employee code and last day, not only counts; (7) keep the narrow owner
database function rather than delete rights for the app role.

**Built (branch `feat/yukthix-erasure-scope`, 30 Oct 2026):**

| answer | what the job does now | where | tests |
|---|---|---|---|
| (1) disability | the yes/no answer stays (`disability_declarations.answer`); after the period the sealed details go and `erased_at` is set; the `disability_certificate` document goes with its file. The HR diversity list skips erased rows (no details to show) | `erasure.service.ts`; migration `20261311000200_privacy_erasure_scope` (column `erased_at`, details check allows an erased "yes", owner function adds the certificate type and clears the declaration's link) | e2e "scope: the run deletes the disability details…" |
| (2) consent records | kept | not touched by the job | same e2e: count stays 1 |
| (3) check result | kept (clear / discrepancy); note and report link go | as before | same e2e: `clear` and `discrepancy` stay |
| (4) never joined | included, counted from the cancellation day (`preboardings.cancelled_on`, set by the cancel action; filled from `updated_at` for older ones). The Aadhaar typed in the pre-boarding portal (sealed answers) goes too, for leavers as well; the other answers stay sealed | owner function: "former employee" also accepts a cancelled joining with no employment; the period runs from the cancellation day at that joining's legal entity | e2e: Nora (2024) erased, Neel (a month ago) and Bina (company B) untouched; the function refuses Neel (period), a stranger, someone joining again; lifecycle-6b checks the cancellation day |
| (5) Aadhaar in pay | never erased (payroll's own period; the job cannot even read pay tables) | — | e2e: payslip snapshot and PF filing keep it |
| (6) dry run lists people | `GET people/privacy-erasure` adds `who`: name, employee code (null if never joined), last day or cancellation day; company-wide `org.settings.manage` only; reading it is never audited | card "Deleting Special data", table "Whose data" | e2e: exact list, audit count unchanged, emp/plant HR 403, company B sees only its own; yx-ui `org.test.tsx`; web `yx-org-pages.test.tsx` |
| (7) owner function | kept narrow: `CREATE OR REPLACE`, every guard of `20261311000100` kept (switched off, working or on notice, period not passed) | migration `20261311000200` | e2e (existing and new) |

Stories (Organisation): `AccessAndPrivacyErasureDryRun` (off, whose data, live), `AccessAndPrivacyErasureOn` (on, no one due:
empty state, last run with one failure, live), `AccessAndPrivacyErasureOnDue` (on, people due incl. a never-joined offer,
live), `AccessAndPrivacyErasureNoAccess` (no company-wide settings rights: no card, live). Manual steps MT-PPL-E-01 … 05.

## Founder answers, 30 Oct 2026 (People small-gap follow-ups, "all ok")
(10) "Possible same person" stays in the menu for 90 days after any merge; (11) "When a fixed-term contract ends"
(contract_end.action) joins the Fixed-term contracts settings; (12) an erasure job deletes personal data when its
retention period ends, special data first, as its own task; (13) a small read-only table goes into the kit and replaces
the three hand-drawn tables (rehire impact, Privacy, impact).

**Built (branch `feat/yukthix-people-followups`, 30 Oct 2026):**
- (10) `GET workspace/counts` sends `possibleSamePerson` while a pair waits or a merge happened in the last 90 days
  (`person_link_log` action `merge`); the menu item follows it (`samePersonInMenu` in `apps/web/lib/yx-nav.ts`).
- (11) Settings › Organisation › Fixed-term contracts holds `contract.max_years` and `contract_end.action` ("Remind HR to
  extend, convert or exit" / "Start the exit by itself a week before the end"), company, entity or employment type.
- (13) Kit: `PlainTable` (Data › Plain table, 3 stories, `components/plain-table.test.tsx`). It replaced five hand-drawn
  tables: PPL-12 rehire impact (live `LiveRehireImpactCard` and the design's `SampleRehireImpact`), PPL-33 What we hold
  (live `LiveMyDataScreen` and the design), and the joiner Postpone task table (`onboarding.tsx`, "Open tasks re-anchor").
  25 raw `<table>`s remain (changes.tsx 3, exits.tsx 4, import.tsx 1, increment.tsx 1, people-kit.tsx 1 (`yx-ppl__compare`),
  record.tsx 5, relations.tsx 1, restructure.tsx 1, selfservice.tsx 4, portals/t9-workforce.tsx 3 (`yx-ps-slabgrid`));
  `ui-rules-guard.test.ts` holds the count at 25 so it only goes down.
- (12) Special data erasure, off by default (`privacy.erasure.enabled`, company only, HR with `org.settings.manage`).
  Nightly sweep `privacy-erasure` (04:15 IST) per company that turned it on, for people with no open job and not joining
  again, once `privacy.retention.special_years` (their last entity's value) has passed since the last day: clears the
  Aadhaar on the record (sealed value, hash, last four), deletes documents of type `aadhaar` and `bgv_report` (stored file
  first, then the owner's function `erase_special_documents`, migration `20261311000000_privacy_erasure`), clears
  background check notes and report links (type and status stay). Pay records untouched. Audit `privacy.special.erased`
  per person and `privacy.erasure.run` per company, counts only. Dry run and last run: Settings › People & Access ›
  Access and privacy, card "Deleting Special data" (`GET people/privacy-erasure`, company-wide `org.settings.manage`).
  Stories: Organisation `AccessAndPrivacyErasureDryRun`, `AccessAndPrivacyErasureOn`. What counts as Special data is
  question 9 below.
- Manual steps MT-PPL-F-01 … 06.

## 1. Live pages

One row per live People page (the People menu in `apps/web/lib/yx-nav.ts`, the People part of Me, the People part of
Settings, and the pre-boarding portal).

| page | screen it renders | design | verdict |
|---|---|---|---|
| /yx/people/directory | `DirectoryScreen`, `DirectoryPhone` under 768 px; `HireDrawer` (Add person) | PPL-01 | live |
| /yx/people/directory/[id], /yx/people/profile | `PersonRecord` (web) → `PersonWorkspace` | PPL-03 (panels PPL-34, 35, 45, 50) | live; the record's dialogs (work phone, ask for a document, send back, upload for the person) are PPL-03 stories |
| /yx/people/directory/[id]/bank-abroad, /yx/me/bank-abroad | `BankAbroad` (web) → `InternationalBankTab`; for oneself `InternationalBankPhone` | PPL-46 | live (the person's own view is the phone design on the web, Q5) |
| /yx/people/org-chart | `OrgChartScreen` | PPL-02 | live |
| /yx/people/team | `TeamPage` (+ PPL-04 `ChangeActionDrawer`, Hiring `RequisitionSheet`) | PPL-08 | live |
| /yx/people/changes | `ChangeActionSheet` + `ChangeActionDrawer`, `ChangeReview`, `ReasonDialog` | PPL-04 | live |
| /yx/people/scheduled | `ScheduledChangesScreen` + `ChangeReview`, `ReasonDialog` | PPL-05 | live |
| /yx/people/bulk-changes | `BulkChangesScreen` (workforce/bulk.tsx) | People core | live |
| /yx/people/bulk-changes/increment | `BulkChangesWizard` | PPL-06 | live |
| /yx/people/import | `EmployeeImportWizard` | PPL-07 | live |
| /yx/people/restructure, /restructure/[id] | `RestructureWizard`, `FinishedRestructuresScreen`, `RestructureRecord` | PPL-09 (+ PPL-10 checklist) | live |
| /yx/people/history | `PersonHistoryScreen` | Job history | live |
| /yx/people/profile-requests | `ProfileRequestsScreen` | Access and privacy | live |
| /yx/people/pay-access | `PayAccessRequests` | PPL-50 | live |
| /yx/people/onboarding | `OnboardingBoard` + `AddJoinerDrawer`, `ImportDrawer` | PPL-11 | live |
| /yx/people/ready-to-onboard | `ReadyToOnboardQueue` | PPL-12 | live |
| /yx/people/onboarding/[id] | `JourneyRecord` + `JoinerPanel`, `BuddyCard`, `RehireCard`; status drawer | PPL-13, PPL-15 | live |
| /yx/people/batches | `PreboardingBatches` + `BatchDialog`, `AddMembersDialog` | PPL-14 | live |
| /yx/people/probation | `ProbationQueue` (queue and review drawer) | PPL-16, PPL-17 | live |
| /yx/people/buddies | `BuddyPanel` | PPL-41 | live |
| /yx/people/life-events | `LifeEventsList` | PPL-48 | live |
| /yx/people/my-tasks | `MyChecklistTasks` | PPL-47 | live |
| /yx/people/exits | `ExitCasesList` + `StartExitDialog` | PPL-19 | live |
| /yx/people/exits/[id] | `ExitCaseWorkspace`, `DeathInServiceFlow` | PPL-19, PPL-23 | live |
| /yx/people/exits/[id]/interview, /yx/me/exit-interview | `ExitInterview` | PPL-21 | live |
| /yx/people/fnf | re-exports /yx/payroll/fnf → `FnfCalculator` | PPL-22 | live |
| /yx/people/clearance | `ClearanceSignoffs` (owners: your sign-offs; HR: by leaver) | PPL-20 | live; "blocked" waits for a migration (PPL-20) |
| /yx/people/upcoming-exits | `UpcomingExits` + `ContractDialog` | PPL-49 | live |
| /yx/people/absconding | `AbscondingTimeline` + `StartAbscondingDialog`, `StopAbscondingDialog`, `DispatchProofDialog` | PPL-24 | live |
| /yx/people/documents | `DocumentVerificationQueue` | PPL-27 | live |
| /yx/people/letters, /letters/bulk | `IssuedLettersRegister`, `BulkLetterWizard` | PPL-28 | live |
| /yx/people/assets | `AssetRegister` + `AddAssetDrawer` | PPL-25 | live |
| /yx/people/succession | `SuccessionScreen` | PPL-26 | live |
| /yx/people/same-person | `SamePersonQueue` | PPL-36 | live |
| /yx/people/same-person/merge, /merged/[id] | `MergeReview` | PPL-37 | live |
| /yx/people/unions | `UnionRegister` | PPL-39 | live |
| /yx/people/retrenchment | `VrsScheme` (HR) | PPL-40 | live |
| /yx/people/reverification | `ReverificationCycles` | PPL-42 | live |
| /yx/people/declarations, /yx/me/declarations | `DisabilityDeclaration` (HR list, self) | PPL-38 | live |
| /yx/people/regulated-declarations, /yx/me/declarations/annual | `BfsiComplianceList`, `BfsiDeclarations` | PPL-43 | live |
| /yx/people/pre-clearance, /yx/me/declarations/pre-clearance | `PreclearanceQueue`, `TradingPreclearance` | PPL-44 | live |
| /yx/me/annual-declarations, /yx/me/pre-clearance | permanent redirect to the two pages above | — | — |
| /yx/me/documents | `MyDocuments` | PPL-30 | live |
| /yx/me/documents/certificate | `CertificateRequest` | PPL-31 | live |
| /yx/me/change-requests | `ProfileChangeRequest` | PPL-32 | live |
| /yx/me/privacy | `MyDataScreen` | PPL-33 | live |
| /yx/me/resignation | `ResignationSheet` (+ PPL-40 `VrsApply`) | PPL-18 (+ PPL-40 employee) | live |
| /yx/me/assets | `MyAssetsScreen` (people/live/exits.tsx) | Me and set-up (accepted design) | live |
| /yx/me/first-30-days | `FirstThirtyDaysScreen` (people/live/lifecycle.tsx) | Me and set-up (accepted design) | live |
| /yx/settings/checklists | `JourneyTemplatesScreen` (people/live/templates.tsx) | Me and set-up (accepted design) | live |
| /yx/settings/letters | `LetterTemplatesList` + `SignatoriesDrawer` | PPL-29 + Me and set-up | live |
| /yx/settings/custom-fields | `EmployeeFieldsScreen` | PPL-03 (custom field stories) | live |
| /yx/settings/access | `RolesAccessScreen` | Access and privacy | live |
| /yx/join/[org] | `PortalSignInScreen` (T9 design), then `PreboardingPortalScreen` with `live` (portals/t9-workforce.tsx) | T9-01 | live (2 Nov 2026); see "T9-01" below |

Not People: /yx/me/requests (inbox design), /yx/settings/access-settings and company-rules (company settings design),
/yx/me/delegation, notifications, security, language, and the pay pages under /yx/me (see `pay-design-map.md`).

## 2. Live People pages with no design

| page | what has no design | what it does | suggestion |
|---|---|---|---|
| /yx/people/directory/[id] Pay tab | account abroad card | PPL-46 `OnPayTab` draws it; the live Pay tab never passes `international` | pass it (S); the person's own desktop view is the phone design (Q5) |
| /yx/me/declarations/annual, /pre-clearance | "No declarations for you" / "No pre-clearance for you" (someone who is not designated) | done (small gaps): stories PPL-43 and PPL-44 NotDesignated; the screens take state 'not-designated' | — |

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| T9-01 Pre-boarding portal (5 of 39 stories) | done 2 Nov 2026 except what needs a provider: penny drop (verified, name mismatch), Aadhaar e-sign of the appointment letter, the letter of intent. Education form and "sign the code of conduct and POSH policy" are not in the portal sections (question) | M, needs providers |
| PPL-04 change drawer (6 stories) | the API exists (`POST changes`, preview, route, drafts, `POST restructures` for a move); only the screen is missing (hidden copy above) | M |
| PPL-40 employee VRS (2) | wire the design; add a VRS estimate (benefit, gratuity, leave encashment) and the reason someone is not eligible (age, years) to `GET lifecycle/me/vrs` | M |
| PPL-01 Contract workers and Placements cards (1), PPL-12 contract worker conversion (1), PPL-35 contract-worker and nominee roles (1) | a contract workers module (person type, agency, deployment) | L |
| PPL-03 Learning tab (1) | a learning module | L |
| PPL-34 Mismatch, PPL-36 FaceMatch (2); PPL-34 OnRecord, Refused (2, consent rows) | face matching with consent (photo at offer vs day one); the attestation path is already live | L |
| PPL-27 automated checks (2) | PAN check and bank penny drop on employee documents; needs a provider (Pay's payout penny drop may be reusable) | M |
| PPL-36 proposals (1) | propose "possible same person" on name + date of birth, PAN, UAN, not only a shared email | M |
| PPL-28 Held (1) | a "held" letter status (a relieving letter waits for clearance) | M |
| PPL-33 (1) | "How long" is done (small gaps: company settings per class); "Request a correction" and "Nominate someone" (M) | M |
| PPL-44 Blocked (1) | a trading-window calendar (closed periods set by the compliance officer), refused requests inside it | M |
| PPL-46 SplitPay, OverSplit (2) | pay split over several accounts, in the bank file too | L |
| PPL-22 absconding F&F (1) | a recovery-only F&F mode: "held until they claim it", no deadline while held | M |
| PPL-12 rehire preview (1) | done (small gaps): impact preview in the Create drawer, choices with a reason sent with the create | — |
| PPL-13 New hire view (1) | IT and Manager are done (small gaps: the API sends a non-HR owner only their tasks); the new hire's view is the portal (T9-01) and My first 30 days | — |
| PPL-20 HR all departments, Blocked (2) | an HR view by leaver on /yx/people/clearance (S); a "blocked" clearance status with a reason (S) | S |
| PPL-37 Unmerge later | done (small gaps): Possible same person › Merged lists every merged record | — |
| Me and set-up: starter copied twice, signatory with letters waiting (2) | done (small gaps): both refused with 409 | — |

## T9-01 · Pre-boarding portal (/yx/join/[org]): live with its design (2 Nov 2026)

/yx/join/[org] shows `PortalSignInScreen` (email and an emailed code), then `PreboardingPortalScreen` with `live`
(`portals/t9-workforce.tsx`). The stand-in `PortalScreen`, `SectionDrawer` and `LetterList` are deleted from
`people/live/joining.tsx`; `AcceptDialog` stays there as the design's accept step (My letters uses it too). The API is
`apps/api/src/lifecycle/portal.controller.ts`: `code`, `verify`, `me`, `step-up/code`, `step-up`, six `sections/*`,
`documents/:typeKey`, `bgv-consent`, `decline` (new), `letters/:id/file`, `letters/:id/sign[/code]`, `sign-out`.
e2e: `joiner-portal.e2e-spec.ts` (13 tests) and `lifecycle-6b`.

**Founder defaults applied (to confirm):** sign-in by email and code, no invitation link (the InviteExpired story is
dropped); penny drop, Aadhaar e-sign and the letter of intent wait for a provider (only their design-only stories
remain; the live bank step says "HR checks the account"); "Withdraw consent" added to the design (BgvWithdraw) and wired.

**Stand-in features kept:** a form for each of the six sections (personal, PAN and ID, bank, emergency, nominees, tax)
with server errors in a "Not saved" box; a fresh code before PAN and ID and before bank; documents from the checklist
with upload (phone camera, `FileUpload capture`), statuses and HR's send-back reason; BGV consent (the itemised notice,
one consent) and withdrawal; letters: download the letter and the acceptance copy, accept with an emailed code and the
e-sign disclosure; loading, could not load with Try again, sign out; employer, designation and manager in the welcome.

**Added from the design (server built):** the checklist by section with "x of y", HR-owned documents ("HR completes
this"), the joiner's own journey tasks with due dates ("After you join"), documents' due days, the pinned
"Continue / Fix" button, tabs Checklist / Offer and letters / Documents; "Your first day" (date, reporting time from
the setting `joining.reporting_time`, default 9:30 am, per entity or employment type; place and address; manager;
buddy; batch); "date moved" (from the audited postpone); decline offer with a reason (the joining closes as reneged,
HR gets the bell and an email, audited `preboarding.declined`); the outcome of a closed joining (declined, withdrawn,
cancelled, joined) readable after sign-in, every change refused (409 `PORTAL_CLOSED`); nominees per scheme (PF,
gratuity, group insurance, each 100 %; on joining one nomination per scheme, group insurance as `group_term`);
previous-employer income (Form 12B: gross, TDS) in the tax step, shown to HR. Audits without values:
`preboarding.nominees.saved`, `preboarding.form12b.saved`, `bgv.consent.withdrawn`.

**T9-01 stories (39, not counted in the People totals): 34 live, 5 design only (feature not built)**

| story (sub-page) | verdict | note |
|---|---|---|
| SignIn · Sign in (email OTP) | live | `PortalSignInScreen` with `live` |
| SignInCode · Sign in · code sent | live | after "Send code" (`POST code`) |
| SignInWrongCode · Sign in · wrong code, 2 attempts left | live | `POST verify` refuses |
| SignInLocked · Sign in · locked after 5 wrong codes | live | the screen locks after 5 wrong codes |
| Checklist · Checklist | live | from `me`: sections, documents, letters, tasks; "Bring on day one" from `me.firstDay.bring` (setting `joining.bring_on_day_one`) |
| ChecklistPhone · Checklist · phone | live | the same page at phone width |
| CampusBatch · Checklist · campus joining batch | live | `me.firstDay.batch` |
| Nominees · Family and nominees · shares do not add up | live | `sections/nominees` per scheme |
| BankStepUp · Bank details · step-up code | live | `step-up/code`, `step-up` (code by email) |
| BankForm · Bank details · form | live | `sections/bank`; "Save account", HR checks it |
| BankVerified · Bank details · verified | design only, feature not built | penny drop needs a provider |
| BankMismatch · Bank details · name mismatch | design only, feature not built | penny drop needs a provider |
| TaxRegime · Tax regime and previous income | live | `sections/tax` with `previousIncome` (Form 12B) |
| LetterOfIntent · Offer · letter of intent | design only, feature not built | no LOI for the portal (waits with e-sign) |
| ESign · Offer · e-sign appointment letter | design only, feature not built | Aadhaar e-sign needs a provider; the live accept is AcceptCode |
| Documents · Documents · one sent back | live | `documents/:typeKey`, HR's reason |
| BgvConsent · Background verification consent | design only, feature not built | per-purpose ticks and a named vendor; the live notice is BgvNotice |
| Postponed · Postponed | live | `me.dateMoved` (with the old date) |
| Withdrawn · Offer withdrawn · access ended | live | `me.closed.outcome` withdrawn |
| Joined · Joined · page closed | live | `me.closed.outcome` joined |
| Loading · Loading | live | before `me` answers |
| LoadError · Could not load · try again | live | `me` failed (not 401) |
| AfterYouJoin · Checklist · your tasks after joining | live | `me.tasks` (owner: the joiner) |
| PersonalForm · Personal details · pressed too early | live | `sections/personal` |
| PersonalFilled · Personal details · form | live | `sections/personal` |
| IdentityStepUp · PAN and ID · step-up code | live | same code as bank |
| IdentityForm · PAN and ID · form | live | `sections/identity` |
| EmergencyForm · Emergency contact · form | live | `sections/emergency` |
| NomineesAdd · Family and nominees · add a nominee | live | added in the form, saved with it |
| TaxRegimeEarly · Tax regime · pressed too early | live | TDS above gross refused (also by the server) |
| BgvNotice · Background check consent · the notice | live | `bgv-consent` true |
| BgvWithdraw · Background check consent · withdraw | live | `bgv-consent` false; checks stop |
| OfferLetters · Offer · letters to download and accept | live | `letters/:id/file` (letter, acceptance) |
| AcceptCode · Offer · accept with an emailed code | live | `letters/:id/sign/code`, `sign` |
| DeclineReason · Decline offer · reason | live | `POST decline` |
| Declined · Declined · page closed | live | `me.closed.outcome` reneged |
| Cancelled · Cancelled · access ended | live | `me.closed.outcome` cancelled (did not join) |
| WithdrawnLetters · Offer withdrawn · letters to download (read-only) | live | founder 2 Nov 2026: `me.letters` of a closed joining; `letters/:id/file` for the joiner's own letters only (404 otherwise); no accept; a letter still open reads "No longer needed"; every change 409 |
| JoinedLetters · Joined · letters to download (read-only) | live | the same for a joined joiner, with the accepted copy |

Founder answers 2 Nov 2026, built: (2) a closed joining (declined, withdrawn, cancelled, joined) downloads its letters
(offer, acceptance copy, withdrawal letter if issued), read-only; (5) "Bring on day one" is the setting
`joining.bring_on_day_one` (Settings › Organisation › Company rules › Joining day, next to `joining.reporting_time`):
short text HR writes, one thing a line, up to 500 characters, per company or legal entity; starter value "Original PAN
and Aadhaar (to be seen, not kept) / Two passport photos / Bank passbook or cancelled cheque". The server trims it and
refuses empty or longer text. Org story: `CompanyRulesBringOnDayOne` (Settings, the text editor). Manual tests MT-PPL-J-14 … 17.

Founder answers 2 Nov 2026 (follow-up), built: when a joining closes (Mark joined; HR's offer withdrawn, reneged or did
not join; the joiner's decline) every still-open e-sign request of that person becomes `cancelled` in the same
transaction (existing status, no migration), one `letter.signature.cancelled` audit row per letter with the reason;
signed and declined requests stay. The closed portal shows such a letter as "No longer needed". "Bring on day one" left
blank stays refused; joined employees keep their portal downloads. Manual test MT-PPL-J-18.

## 4. Design groups, story by story

### A. Directory, record and changes

#### PPL-01 · Directory

Live page: /yx/people/directory (menu People › Directory; HR and employees). Under 768 px the page renders `DirectoryPhone`.

| story (sub-page) | verdict | note |
|---|---|---|
| HrEmployees · HR · employees with workforce card | live | as HR (`employee.profile.view`); cards are Employees, Consultants, All persons only (GET people/workforce has no contract workers or placements) |
| HrContractWorkers · HR · contract workers | design only, feature not built | no contract-worker module or API; the live page shows no "Contract workers" card (`kinds` filters to cards the API sends) |
| HrAllPersons · HR · all persons | live | "All persons" card (HR only); counts distinct persons from `cards.persons` |
| Employee · Employee · public fields only | live | as an employee without `employee.profile.view`; the API sends public fields only |
| QuickView · Quick view drawer | live | click a row; "Open record" for HR goes to /yx/people/directory/[id] |
| Filtered · · filtered to nothing | live | search for a name no one has |
| Empty · · empty (first use) | live | only when the company has no one on the workforce list yet (an admin with no employee record, before the first hire) |
| Loading · · loading | live | while GET people/workforce and the grants load |
| LoadError · · error | live | GET people/workforce fails; Retry refetches |
| Phone · · phone | live | page width under 768 px renders `DirectoryPhone` |
| PhoneNoMatch · · phone, no match | live | phone width, search with no match |
| LiveHr · Live · HR, first month (no change line yet) | live | `previousMonth` is null until last month is on record |
| LiveHrTrend · Live · HR, with last month | live | once the API returns `previousMonth` and `previous` counts |
| LiveEmployee · Live · employee (quick chips from the person) | live | employee; quick chips from their own row (`me`) |
| LivePhone · Live · phone | live | phone width; row opens the card drawer |
| Hire · Add person · open | live | HR with `employee.change.manage`: "Add employee" opens `HireDrawer` |
| HireFilled · Add person · filled | live | same drawer, filled |
| HireMissing · Add person · Add pressed with nothing filled | live | client checks in `HireDrawer` |
| HireSamePerson · Add person · email already on record, Link pressed without the check | live | POST people/employees returns `POSSIBLE_SAME_PERSON` with `personIds` (persons.ts); api-client passes `code` and `body.personIds` |
| HireSamePersonChecked · Add person · same person checked, ready to link | live | tick "same person", then "Link and add" |
| HireFailed · Add person · the server refuses | live | any 4xx from POST people/employees (e.g. code already used) shows in the drawer |

#### PPL-02 · Org chart

Live page: /yx/people/org-chart (menu People › Org chart; HR and employees)

| story (sub-page) | verdict | note |
|---|---|---|
| Reporting · Reporting lines (today) | live | default view; GET people/org-chart |
| Department · Department view | live | view switch "Department" |
| Positions · Position view with vacancies | live | open jobs as vacant boxes; only for `pipeline:manage`, company-wide HR, or a hiring manager's own openings (`positions` flag) |
| PositionsPast · Position view on a past date (no openings) | live | past "As on" date: API returns no vacancies; "No open positions on this date" text |
| AsOnPast · As on 1 Jul 2026 | live | "View as on" date picker, any viewer |
| AsOnFuture · As on 1 Oct 2026 (scheduled changes) | live | HR or `org.structure.view` only (`futureDates`); others are capped at today and the API refuses |
| EmployeeView · Employee view | live | employee: chart opens on their own box (`meId`), no Open person |
| OneEntity · One entity · manager in another entity | live | pick a legal entity in the top bar; a manager outside it shows as `managerOutside` ("reports to … (entity)") |

#### PPL-03 · Person record

Live pages: /yx/people/directory/[id] (HR, managers from My team), /yx/people/profile (own record; menu Me › Profile). Both render `PersonRecord` → `PersonWorkspace` with `live`.

| story (sub-page) | verdict | note |
|---|---|---|
| HrOverview · HR · overview (masked IDs with audited reveal) | live | HR on someone's record; Show calls POST employees/:id/identity/reveal (audited) |
| EmployeeSelf · Employee · own record | live | /yx/people/profile |
| ManagerTeam · Manager · team member (Personal hidden) | live | manager opens a report from My team; API sends no Personal class |
| Job · Job tab | live | GET employees/:id/as-of |
| PayHr · Pay tab · HR | live | HR with pay access: "Show pay" card |
| PayGated · Pay tab · manager without salary grant | live | `payAccess` false → "Pay needs a salary grant for your team"; PPL-50 request button when a pay-access ask is allowed |
| PayGrant · Pay tab · manager with salary grant | live | manager whose grant reaches the person (or approved PPL-50 access) |
| PayShown · Pay tab · HR after Show pay | live | GET employees/:id/compensation through the pay guard |
| PaySelf · Pay tab · employee own pay (request a bank change) | live | own record; "Request change" goes to /yx/me/change-requests, "Bank abroad" to /yx/me/bank-abroad |
| PayNewJoiner · Pay tab · new joiner (no payslip, no tax regime yet) | live | a person with no published payslip and no regime choice |
| PayShowError · Pay tab · Show pay failed | live | compensation read fails: "…pay could not be loaded. Try again in a moment." |
| Time · Time tab | live | leave balances (time API) and this month's attendance card |
| Documents · Documents tab · HR verify | live | HR with `document.manage`: verify, send back (reason dialog), ask for upload, upload for them |
| DocumentsManager · Documents tab · manager (restricted classes hidden) | live | manager: GET documents/team/:personId (below Confidential only) |
| Performance · Performance tab | live | goals, reviews, 1:1s, feedback counts from the performance API |
| Learning · Learning tab | design only, feature not built | no learning module; the live record leaves the tab out (record.tsx "Learning … left out") |
| Assets · Assets tab | live | `asset.view` (all), manager (team assets) or self (my assets) |
| History · History tab (timeline, corrections, roles) | live | GET employees/:id/history and /person (roles) |
| AsOfPast · History · as on 1 Jul 2024 | live | as-of date picker sets `?asOf=` |
| AsOfFuture · History · as on 1 Oct 2026 (scheduled) | live | future `?asOf=` shows scheduled changes |
| Loading · · loading | live | while profile and as-of load |
| LoadError · · error | live | profile or as-of fails (not 403/404) |
| NotFound · · not found (restricted or missing) | live | API 403 or 404, or no employee record for /profile |
| EditFamily · HR · edit family and nominees | live | HR with `can.editFamily`: `FamilyDrawer`, PUT employees/:id/family |
| EditContacts · Employee · edit emergency contacts | live | own record: `ContactsDrawer`, PUT employees/:id/emergency-contacts |
| EditCustomFields · HR · edit additional details | live | when the company has custom fields and one is editable: `CustomFieldsDrawer` |
| CustomFieldsSettings · Settings · custom fields | live | /yx/settings/custom-fields (`EmployeeFieldsScreen`), Settings › People & Access › Custom fields |
| CustomFieldsSettingsEmpty · Settings · custom fields (none yet) | live | same page before any field is made |
| EditPersonal · Personal details · open (filled from the record) | live | "Edit" on Personal when `can.editPersonal` (self or HR with personal-data access): `PersonalDialog` |
| EditPersonalMissing · Personal details · Save pressed with required details missing | live | required list from company rules (`personalRequired`) |
| EditPersonalWrong · Personal details · Save pressed with a wrong email and phone | live | client checks |
| EditPersonalFailed · Personal details · the server refuses | live | PUT employees/:id/personal 4xx |
| RequestChange · Identity or bank change · open | live | HR with `employee.identity.manage` on someone's record: `ChangeDialog` (own changes use PPL-32 at /yx/me/change-requests) |
| RequestChangeFilled · Identity or bank change · new salary account filled | live | same dialog |
| RequestChangeMissing · Identity or bank change · Send pressed with nothing filled | live | client checks |
| RequestChangeInvalid · Identity or bank change · PAN in the wrong form | live | client checks |
| RequestChangeFailed · Identity or bank change · the server refuses | live | POST employees/:id/profile-requests 409 (one already waiting) |
| WithdrawChange · Withdraw a waiting change · open | live | a pending change on the record, raised by the viewer or own: `CancelDialog` |
| WithdrawChangeMissing · Withdraw a waiting change · no reason | live | client check |
| WithdrawChangeFailed · Withdraw a waiting change · the server refuses | live | POST profile-requests/:id/cancel after HR decided |
| WorkPhone · Work phone · open (HR) | live | `WorkPhoneDialog` (record-dialogs.tsx) from "Edit" on the work phone (`can.editWork`); PUT employees/:id/work-phone |
| WorkPhoneWrong · Work phone · Save pressed with a wrong number | live | client check (7+ digits, country code), field error with focus |
| WorkPhoneFailed · Work phone · the server refuses | live | API 4xx shown in the dialog |
| AskDocument · Ask for a document · open | live | `AskDocumentDialog` from the Documents tab (`document.manage`); POST documents/requests |
| AskDocumentMissing · Ask for a document · Send pressed with no document chosen | live | client check |
| AskDocumentFailed · Ask for a document · the server refuses | live | API 4xx shown in the dialog |
| SendBack · Send a document back · open | live | `SendBackDialog` from "Send back" on a document; POST documents/:id/decision (reject, reason) |
| SendBackMissing · Send a document back · no reason chosen | live | client check |
| SendBackFailed · Send a document back · the server refuses | live | API 409 (already decided) shown in the dialog |
| UploadFor · Upload for the person · open | live | `UploadForPersonDialog` (HR, not on one's own record); POST documents/people/:id/:type |
| UploadForMissing · Upload for the person · Upload pressed with nothing chosen | live | client check; Upload is never disabled |
| UploadForExpiry · Upload for the person · passport needs the expiry date | live | a type with `expiryTracked` |

#### PPL-04 · Change action

Live page: /yx/people/changes (menu People › Changes › Change action; HR with `employee.change.manage`, managers with `request.raise_on_behalf`). "Start change" opens the designed `ChangeActionDrawer` (people/changes.tsx), the one change form (founder Q3): also on /yx/people/history, /yx/people/team and the person record. The stories render that same drawer with sample data (`ppl-04-design.test.tsx`).

| story (sub-page) | verdict | note |
|---|---|---|
| Start · HR · find a person, changes waiting | live | live branch `LiveChangeActionPage`: person picker, drafts, waiting list (incl. inter-entity transfers) |
| Promotion · HR · promotion with pay change | live | POST changes/preview for what changes (kit `PlainTable`, "Stays the same" folded); the CTC helper shows the change on the pay in force; route line and "Approval route" card from GET changes/route |
| PromotionBoth · HR · promotion when the company requires both a new designation and grade | live | GET changes/rules `promotionMustChange` per entity: both fields required |
| Transfer · HR · transfer with impact preview (PT state) | live | only the new location; the preview adds holiday calendar, PT and LWF state, geofence |
| InterEntity · HR · inter-entity transfer options | live | `move` (POST restructures/preview, POST restructures); options on the company defaults; a master only for the old entity is required and says why |
| Retro · HR · correction into processed payroll | live | the preview's `retro.processed` (months whose regular payroll at the entity is approved or paid) gives "Payroll for … is already processed"; other past months "This changes the past" |
| Manager · Manager · promotion without salary grant | live | `request.raise_on_behalf`: promotion, transfer, new designation, manager change; no pay field, "Pay is proposed by HR" |
| Review · Review · impact with a later change recalculated | live | "Open" on a waiting change (`employee.change.approve`): `ChangeReview`, GET changes/:id/preview |
| ReviewWorking · Review · Approve pressed before the impact shows | live | Approve while the preview loads |
| ReviewNoImpact · Review · the impact could not be worked out | live | preview call fails |
| ReviewFailed · Review · the server refuses the approval | live | POST changes/:id/approve refuses maker = checker |
| ReviewSimple · Review · manager change, nothing recalculated | live | a manager change has no pay lines |
| Reject · Review · reject with a reason | live | "Reject" in the review: `ReasonDialog`; POST changes/:id/reject |
| RejectMissing · Review · Reject pressed with no reason | live | field error with focus |
| RejectFailed · Review · the server refuses the rejection | live | API 409 shown in the dialog |

#### PPL-05 · Scheduled changes

Live page: /yx/people/scheduled (menu People › Changes › Scheduled; `employee.change.manage` or `employee.change.approve`)

| story (sub-page) | verdict | note |
|---|---|---|
| Next30 · Next 30 days | live | default window; GET people/changes |
| Next90 · Next 90 days (two changes for one person) | live | window switch 90 days |
| Cancel · Cancel with reason | live | HR (`employee.change.manage`): POST changes/:id/cancel with reason |
| Empty · · empty | live | nothing scheduled or waiting |
| Review · Review a waiting change | live | approver: `ChangeReview` from a pending row |
| Move · Move a change to another date | live | "Edit" on a scheduled change: `ReasonDialog` (reschedule); PUT changes/:id with the new date (back to approval) |
| MoveMissing · Move pressed with no new date | live | field error with focus (also the same date as now) |
| MoveFailed · Move refused by the server | live | API 4xx shown in the dialog |

#### PPL-06 · Bulk changes wizard

Live page: /yx/people/bulk-changes/increment (from /yx/people/bulk-changes "Annual increment"; needs `employee.change.manage`, `employee.salary.manage` and `employee.salary.view`, else a no-access page)

| story (sub-page) | verdict | note |
|---|---|---|
| People · Step 1 · choose people | live | entities and departments from the company |
| Rule · Step 2 · increment rule | live | by rating (needs `perf.review.view`) |
| Preview · Step 3 · per-person preview (3 above band) | live | dry run POST people/change-batches/increment `dryRun`; `aboveBand` per person |
| PreviewCap · Step 3 · company rule: cap at the band maximum | live | entity setting `pay.band.above_max` = cap |
| PreviewBlock · Step 3 · company rule: block above the band | live | setting = block |
| Letters · Step 4 · letters (made after approval) | live | active letter templates from the dry run |
| LetterPreview · Step 4 · one person’s letter | live | POST change-batches/increment/letter-preview (PDF) |
| Review · Review | live | |
| Confirm · Send for approval | live | POST change-batches/increment, then back to /yx/people/bulk-changes?batch= |
| Same · Step 2 · same raise for everyone | live | the only rule without `perf.review.view` |
| Live · Live · choose people | live | |

#### PPL-07 · Employee import

Live page: /yx/people/import (menu People › Changes › Import; `employee.change.manage`; also "Import" on the directory)

| story (sub-page) | verdict | note |
|---|---|---|
| Upload · Upload | live | live branch `LiveEmployeeImport` |
| Saved · Saved import to resume | live | a saved draft shows `SavedImportNotice` (Resume / Discard) |
| Map · Match columns | live | |
| Validation · Validation preview with problems | live | server check of each row |
| Clean · Validation preview, all ready | live | file with no problems |
| Review · Review | live | |

#### PPL-08 · Team page

Live page: /yx/people/team (menu People › My team; managers)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Manager · team today | live | team, today's attendance, approvals, joiner tasks |
| Loading · · loading | live | |
| Empty · · empty (new manager) | live | a manager with no reports yet (menu shows "My team" only to managers, so reachable for a manager whose reports all moved) |

#### PPL-09 · Bulk transfer and restructure

Live pages: /yx/people/restructure (wizard for `employee.change.manage`; done list only for Payroll with `payroll.run.prepare`), /yx/people/restructure/[id] (record and continuity checklist)

| story (sub-page) | verdict | note |
|---|---|---|
| Scope · Step 1 · merge scope | live | |
| PickPeople · Step 1 · move part of the entity, pick people | live | "Pick people" reads GET people/workforce?legalEntityId= |
| Options · Step 2 · transfer options and overrides | live | |
| CloseBlocked · Step 3 · close blocked (payroll not locked) | live | preview check "Blocked" with the run to open (POST restructures/preview) |
| CloseReady · Step 3 · close checks pass | live | |
| Confirm · Review and send for approval (typed) | live | `TypeToConfirmDialog`, POST restructures |
| Record · Restructure record · approver | live | another HR person opens the record; API refuses the planner approving |
| Done · Restructure record · done, one person could not move | live | a person whose move failed shows "Couldn't move" |
| Checklist · PPL-10 · continuity checklist (live items) | live | GET restructures/continuity per person; PPL-10 has no story of its own |
| PayrollChecklist · Payroll · continuity checklist (ticks only Payroll items) | live | Payroll user opens a done restructure; API lets them tick Payroll items only |
| ScopeMissing · Step 1 · Continue with required fields missing | live | client checks |
| Drafts · Start · saved drafts (Save and exit) | live | GET restructures/drafts; `?draft=` continues |
| Finished · Start · finished restructures (Open goes to the record) | live | GET restructures?status=finished |
| FinishedEmpty · Start · no finished restructures yet | live | |
| PayrollFinished · Payroll · done restructures (no wizard) | live | Payroll without `employee.change.manage` gets `FinishedRestructuresScreen` |
| PayrollFinishedEmpty · Payroll · no done restructures yet | live | |

### B. Onboarding and probation

#### PPL-11 · Onboarding board

Live page: /yx/people/onboarding (menu People › Onboarding › Onboarding board; `lifecycle.onboarding.view` or `.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Board with progress rings | live | GET lifecycle/joiners (+ ready-to-onboard offers for HR); cards open the checklist |
| Loading · · loading | live |  |
| Empty · · empty | live | no joiners in scope: "No one is onboarding right now" |
| AddJoiner · Add a joiner · open | live | "Add joiner" (`canAdd` from the API, HR with `lifecycle.onboarding.manage`) opens `AddJoinerDrawer` |
| AddJoinerFilled · Add a joiner · filled | live |  |
| AddJoinerMissing · Add a joiner · Add pressed with nothing filled | live | checked in the drawer |
| AddJoinerFailed · Add a joiner · the server refuses | live | POST lifecycle/joiners refusals (e.g. joining day in the past) show in the drawer |
| Import · Import joiners · open | live | "Import joiners" once the board has cards (`ImportDrawer`) |
| ImportMissing · Import joiners · Check pressed with no file | live |  |
| ImportChecked · Import joiners · checked: 2 ready, 1 problem | live | POST lifecycle/joiners/import with commit false returns ready rows and problems |
| ImportFailed · Import joiners · the file could not be read | live | header-line error from the API |

#### PPL-12 · Ready to onboard

Live page: /yx/people/ready-to-onboard (menu People › Onboarding › Ready to onboard; `lifecycle.onboarding.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · Queue by person type | live | GET lifecycle/ready-to-onboard: New person, Ex-employee rehire, Current employee (that one goes to Change action) |
| CreateNew · Create employee (new person) | live | row → `CreateFromOffer` drawer; POST lifecycle/ready-to-onboard/:offerId |
| Rehire · Create employee (rehire impact preview) | live | an ex-employee offer: the Create drawer shows the policy per option for the chosen entity and the earlier spell (GET lifecycle/ready-to-onboard/:offerId/rehire); the offer joins on their own record as a rehire |
| RehireOverride · Rehire with an override (reason required) | live | change a choice in the drawer: Create without a reason shows the field error and focuses it; POST ready-to-onboard/:offerId takes `rehire` choices with the reason (also on the checklist's Rehire card) |
| Conversion · Contract worker conversion | live (gap) | the API has no contract-worker person type (contract workers module not built); only new, ex_employee, internal |
| Empty · · empty | live | no accepted offers waiting |

#### PPL-13 · Journey record

Live page: /yx/people/onboarding/[id] (open a card on the Onboarding board, or a task in My checklist tasks)

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · all tasks with owners and relative dates | live | HR with `lifecycle.onboarding.manage`; tasks in before / day / after phases |
| It · IT · own tasks | live | an IT or Admin team member opens the checklist from My checklist tasks: the API sends only tasks assigned to them or their team (`ownTasksOnly`, `taskTotal`); "You see the N tasks you own. HR sees all M." |
| Manager · Manager · manager and buddy tasks | live | the joiner's manager (preboarding `managerEmployeeId`) gets only the manager and buddy tasks |
| NewHire · New hire · own tasks | live (gap) | the joiner never sees this record: before day one the /yx/join portal (stand-in), after it /yx/me/first-30-days |
| LetterOverdue · Appointment letter overdue (compliance alert) | live | a locked letter task past due shows the red alert with "Issue letter" (`letter.issue`) |
| Cancelled · Live · cancelled joiner (reneged) | live | after Change status › Reneged; badge "Cancelled: reneged" |
| WasDue · Live · joining day passed, not joined | live | joining day passed, joiner not marked joined: "was due to join … days ago" |
| Joiner · Joiner · forms and background check (joining day) | live | `JoinerPanel` under the tasks for HR on a pre-boarding checklist (GET joiners/:id/forms) |
| JoinerEarly · Joiner · Mark joined pressed before the joining day | live | panel refuses; API also refuses (joining.service "Mark them joined on or after it") |
| JoinerNoPlan · Joiner · job details missing, Save pressed empty | live | PUT joiners/:id/plan |
| JoinerMarkJoined · Mark joined · open | live | needs `lifecycle.onboarding.manage` and `employee.change.manage` (`canJoin`) |
| JoinerMarkJoinedMissing · Mark joined · ID check not ticked | live |  |
| JoinerMarkJoinedFailed · Mark joined · the server refuses | live | POST joiners/:id/join refusals shown in the dialog |
| JoinerAddCheck · Background check · add a check | live | with `lifecycle.bgv.manage`; POST joiners/:id/bgv/checks |
| JoinerNoConsent · Background check · not asked yet | live | "Ask for consent": POST joiners/:id/bgv/ask |
| JoinerJoined · Joiner · joined | live | panel stays after joining |
| Rehire · Rehire · company policy choices | live | `RehireCard` for an ex-employee joiner still invited (GET joiners/:id/rehire) |
| RehireChoices · Rehire · change choices open | live |  |
| RehireMissing · Rehire · a choice away from policy without a reason | live |  |
| RehireFailed · Rehire · the server refuses | live | PUT joiners/:id/rehire version clash |
| Buddy · Buddy · none yet | live | `BuddyCard` while the joiner is invited |
| BuddyPicked · Buddy · picked | live |  |
| BuddyUnchanged · Buddy · Save pressed without a change | live |  |
| BuddyFailed · Buddy · the server refuses | live | API refuses over the buddy's pool cap ("already looks after …") |

#### PPL-14 · Pre-boarding batches

Live page: /yx/people/batches (menu People › Onboarding › Batches; `lifecycle.onboarding.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Campus batches | live | GET lifecycle/batches |
| ChangeDate · Change batch joining date (re-anchor) | live | row button "Change date" on a batch the viewer may manage, before its joining day |
| ChangeDateNoReason · Change batch joining date · Move pressed with no reason | live | also refused by the API ("Say why the batch joining day moves.") |
| ChangeDateSameDay · Change batch joining date · Move pressed on the same day | live | checked in the dialog |
| PlantHrReadOnly · Plant HR · read only | live | a batch outside the viewer's scope (`canManage` false): no buttons or menu items |
| Empty · · empty | live | no batches yet |
| NewBatch · New batch · open | live | "New batch" when `createIn` has a legal entity (`BatchDialog`) |
| NewBatchFilled · New batch · filled | live |  |
| NewBatchMissing · New batch · Save pressed with nothing filled | live |  |
| NewBatchFailed · New batch · the server refuses | live | POST lifecycle/batches refusal (duplicate name) |
| ChangeBatch · Change the batch · day moved, reason asked | live | menu "Rename or add touchpoints" (PUT batches/:id) |
| AddMembers · Add joiners · open | live | menu "Add joiners" (`AddMembersDialog`) |
| AddMembersPicked · Add joiners · two picked | live | waiting joiners of the same legal entity, not in a batch |
| AddMembersMissing · Add joiners · nobody picked, Add pressed | live |  |
| AddMembersNone · Add joiners · nobody waiting, Add pressed | live | no waiting joiner in that entity |
| AddMembersFailed · Add joiners · the server refuses | live | POST batches/:id/members refusal |

#### PPL-15 · Pre-boarding actions

Live page: /yx/people/onboarding/[id] › Change status (HR, pre-boarding joiner still invited)

| story (sub-page) | verdict | note |
|---|---|---|
| Postpone · Postpone (re-anchor preview) | live | POST joiners/:id/postpone; the drawer lists the tasks that move |
| DidNotJoin · Did not join (unwind) | live | API allows it only on or after the joining day; POST joiners/:id/cancel outcome did_not_join |
| Reneged · Reneged | live | outcome reneged |
| Withdraw · Withdraw offer · reason missing | live | outcome withdrawn; reason checked in the drawer |
| Rehire · Rehire pre-boarder · did not join (rehire impact) | live | a rehire joiner: the "Rehire: what the unwind reverses" note (code from GET joiners/:id/rehire) |

#### PPL-16 · Probation reviews queue

Live page: /yx/people/probation (menu People › Onboarding › Probation, or "For my team" for managers)

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · due, overdue, escalated | live | HR (`employee.profile.view`); GET people/probations; "escalated" = overdue with `escalatedOn` from the daily job |
| Manager · Manager · my team | live | a manager without HR keys: direct reports only |
| Decide · HR · decide an escalated review | live | HR with `employee.change.manage` (`canDecide`) opens the same form; a confirmation waiting approval opens Change action |
| Empty · · empty | live | no probations in scope |

#### PPL-17 · Probation review

Live page: /yx/people/probation (the review drawer, manager of a direct report whose review is open)

| story (sub-page) | verdict | note |
|---|---|---|
| Confirm · Manager · confirm | live | POST lifecycle/probations/:employeeId/review outcome confirm (goes to HR for approval) |
| ExtendOverLimit · Extend beyond the policy maximum | live | `maxMonthsLeft` from the API policy (maxTotalMonths) |
| Terminate · End employment (goes to HR) | live | outcome end: a recommendation to HR |
| Phone · · phone | live | same drawer at phone width (responsive page, no separate phone screen) |
| PhoneExtend · · phone, extend 3 months | live | as above |

### C. Exits

#### PPL-18 · Resignation

Live page: /yx/me/resignation (menu People › Me › My exit; employee)

| story (sub-page) | verdict | note |
|---|---|---|
| Form · Employee · resign with standard notice | live | GET lifecycle/me/resignation (notice from the company policy) |
| Shortfall · Early last day (notice shortfall) | live | pick a last day before the standard one |
| Vrs · A voluntary retirement scheme is open | live | PPL-40 `VrsApply` when GET lifecycle/me/vrs has a scheme |
| NoEmployment · · nothing to resign from | live | a person with no employment (notice null) |
| Pending · Submitted, pending (withdraw directly) | live | POST me/resignation/withdraw returns withdrawn |
| Accepted · Accepted (withdraw needs approval) | live | withdraw returns requested |
| WithdrawalAsked · Accepted, withdrawal asked for | live | pendingChange withdrawal |
| InterviewReady · Serving notice: exit interview ready, letter on hold | live | interview sent links to /yx/me/exit-interview; lettersHeld |
| Loading · · loading | live |  |
| Failed · · couldn't load | live |  |
| Phone · · phone | phone view, mobile app not built | `ResignationPhone` in known.json |

#### PPL-19 · Exit cases

Live pages: /yx/people/exits and /yx/people/exits/[id] (menu People › Exits › Exit cases; HR `lifecycle.exit.view/manage`, managers for their team)

| story (sub-page) | verdict | note |
|---|---|---|
| List · HR · exit cases | live | GET lifecycle/exits; HR persona when `employee.profile.view`, `lifecycle.exit.view` or `.manage` |
| ManagerList · Manager · my team | live | a manager without those keys |
| Case · HR · case stepper with deprovisioning | live | /yx/people/exits/[id]: approval, clearance, interview, F&F, documents; Deprovisioning card |
| CaseManager · Manager · case (no HR-only flags) | live | HR-only parts (held letters, deprovisioning steps) need `hr` from the API |
| Held · HR · open case holds letters | live | `lettersHeld` alert for HR |
| Loading · · loading | live |  |
| Empty · · empty | live | no exits in scope |
| Withdraw · HR · withdraw an exit HR started | live | `lifecycle.exit.manage`; POST exits/:id/withdraw (refused once F&F is finalised) |
| Withdrawn · HR · withdrawn exit | live |  |
| StartExit · Start exit · open | live | "Start exit" with `lifecycle.exit.manage` (`StartExitDialog`) |
| StartExitRetrenchment · Start exit · retrenchment filled (basis, notice, permission) | live | permissions from GET lifecycle/ir-permissions |
| StartExitTermination · Start exit · termination (another HR person approves) | live | API: termination needs another HR person's approval |
| StartExitAbsconding · Start exit · absconding (last day present, a past date) | live |  |
| StartExitMissing · Start exit · Start pressed with nothing filled | live |  |
| StartExitFailed · Start exit · the server refuses | live | API 409 "This person already has an exit in progress." |

#### PPL-20 · Clearance sign-offs

Live page: /yx/people/clearance (menu People › Exits › Clearance; owners of clearance items, HR with `lifecycle.exit.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · all departments | live | HR with `lifecycle.exit.manage`: "By leaver" (GET lifecycle/clearance, scoped by the server): every department with owners, the open count, a leaver picker |
| ItOwner · IT owner · own items | live | an IT group member with an open item; Sign off dialog (recovery, note) |
| FinanceOwner · Finance owner · blocked item | live | migration applied in the test app 2 Nov 2026; the owner marks an open item Blocked with the reason (POST lifecycle/clearance/:id/block, `Mark blocked`), shown as Blocked to HR and the owner; needs migration `20261312000000_clearance_blocked` (written, not applied) |
| Empty · · empty | live | "Nothing to sign off" |
| Phone · · phone | phone view, mobile app not built | `ClearancePhone` in known.json |

#### PPL-21 · Exit interview

Live pages: /yx/me/exit-interview (employee) and /yx/people/exits/[id]/interview (HR)

| story (sub-page) | verdict | note |
|---|---|---|
| Employee · Employee · survey | live | once HR sends the interview (link from My exit) |
| Answered · Employee · answers sent | live | status submitted |
| NoInterview · · employee, no exit interview to answer | live | GET lifecycle/me/exit-interview with no interview |
| Loading · · employee, loading | live |  |
| Hr · HR · answers and notes (confidential) | live | from the case's Exit interview step |
| HrNotAnswered · HR · not answered yet | live | status sent |
| HrNoKey · · HR without the confidential exit key | live | GET exits/:id/interview 404 → no-access |
| Phone · · phone | phone view, mobile app not built | `ExitInterviewPhone` in known.json |

#### PPL-22 · F&F calculator

Live page: /yx/people/fnf (same page as /yx/payroll/fnf; `payroll.fnf.manage` or `payroll.notice.waive`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Explained lines with deadline countdown | live | an open settlement with its explained lines and `DueCountdown` |
| DueSoon · One working day left (holiday skipped) | live | `workingDaysLeft` from the API counts holidays of the person's location |
| Overdue · Overdue | live | `overdue` from the API: red alert "Pay wage lines now" |
| Held · Part held for an open case | live | hold a non-wage line ("held" total, second run) |
| Absconding · Recovery-only (absconding) | live | GET payroll/fnf `heldForClaim` (absconding exit with the absconding salary hold still on): "Held until … claims it", the Recovery-only banner, never overdue |

#### PPL-23 · Death in service

Live page: /yx/people/exits/[id] for an exit of kind death (HR with `lifecycle.exit.manage`; F&F parts with `payroll.fnf.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Payees · Payees per nominations | live | GET exits/:id/payees from the nominations |
| LegalHeirs · No valid nomination (legal heirs) | live | no nominee: legal heirs and the succession certificate field |
| Dues · Dues split by share | live | "Dues and split" step |
| Forms · Claim forms checklist | live | "Claim forms" step |
| Letters · Letters and nominee access | live | "Letters and access" step, "Send nominee access" |

#### PPL-24 · Absconding timeline

Live page: /yx/people/absconding (menu People › Exits › Absconding; `lifecycle.exit.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Running · Running (day 9, notice 1 sent) | live | a running timeline after notice 1 |
| StopDialog · Stop with reason | live | "Stop timeline" opens the confirm with a reason |
| Stopped · Stopped (returned) | live | stopped with its reason |
| Deemed · Deemed abandonment (day 23) | live | deemed step done: alert with "Open exit case" |
| Start · Start a timeline · open | live | "Start a timeline": `StartAbscondingDialog`; POST lifecycle/absconding |
| StartMissing · Start a timeline · Start pressed with nothing filled | live | field errors with focus; the last day present must be before today |
| StartFailed · Start a timeline · the server refuses (one already running) | live | API 409 shown in the dialog |
| DispatchProof · Dispatch proof · open | live | "Add dispatch proof" on a sent notice: `DispatchProofDialog`; PUT lifecycle/absconding/:id/steps/:key/dispatch |
| DispatchProofMissing · Dispatch proof · Save pressed with no article number | live | field error with focus |
| DispatchProofFailed · Dispatch proof · the server refuses (timeline changed) | live | API 409 (stale version) shown in the dialog |

### D. Assets, documents, letters and self-service

#### PPL-25 · Asset register

Live page: /yx/people/assets (menu People › Assets; asset.view, add/issue/return need asset.manage)

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Admin · register | live | GET lifecycle/assets; Issue / Take back per row only where the row's canManage is true |
| Issue · Issue dialog | live | "Issue" on an in-stock row: person, date, condition; POST lifecycle/assets/:id/issue; the person is asked to acknowledge |
| Return · Return dialog with recovery | live | "Take back" on an assigned row; "Not returned" marks it lost; optional recovery amount goes on the F&F (POST …/return) |
| Empty · · empty | live | a company with no assets: "No assets yet" with Add asset (asset.manage only) |
| Acknowledge · Employee · acknowledge (phone) | phone view, mobile app not built | `AssetAcknowledgePhone` in known.json; on the web the person acknowledges on /yx/me/assets (MyAssetsScreen, "Me and set-up" group) |
| Acknowledged · Employee · acknowledged (phone) | phone view, mobile app not built | same |
| AddAsset · Add asset · open | live | Add asset (asset.manage) opens `AddAssetDrawer` (live/exits.tsx), the same component |
| AddAssetFilled · Add asset · filled | live | kind, name, tag, serial, entity, location, cost |
| AddAssetMissing · Add asset · nothing filled, Add asset pressed | live | errors under each required field, nothing sent |
| AddAssetFailed · Add asset · the server refuses (tag already used) | live | POST lifecycle/assets refuses a used tag; the drawer shows the server's message |

#### PPL-26 · Succession

Live page: /yx/people/succession (menu People › Succession; succession.manage, company-wide, Confidential)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · critical positions and readiness | live | GET people/succession; Add critical position, Nominate with readiness, Remove successor |
| Risk · No ready successor risk view | live | the "no ready successor" filter on the page |
| AllCovered · · risk view, nothing at risk | live | filter on when every position has a ready-now successor: "Every critical position has a ready-now successor" |
| Manager · Manager · no access | live | menu hidden without succession.manage; by URL the API answers 403 and the page shows the Confidential no-access state |

#### PPL-27 · Document verification queue

Live page: /yx/people/documents (menu People › Documents & letters; document.manage)

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · HR · queue with automated checks | live (gap) | queue, class badge and virus-scan status are live (GET documents/queue); the API runs no automated checks (PAN, penny drop) on employee documents, so no check column |
| Review · Review drawer (penny drop failed) | live (gap) | Review opens the drawer (file viewer, Mark verified / Reject); no penny-drop result to show (no API) |
| Reject · Reject with reason | live | Reject: reason list + message; POST documents/:id/decision (reject) |
| Special · Special class (Aadhaar) review | live | a special-class document shows "Special class: this view is recorded"; the API records the file view |
| Empty · · empty | live | nothing waiting: "Nothing to verify" |

#### PPL-28 · Issue letters

Live pages: /yx/people/letters (register, issue sheet, drafts) and /yx/people/letters/bulk (bulk issue); letter.issue

| story (sub-page) | verdict | note |
|---|---|---|
| Bulk · Bulk issue · preview with failures | live | /yx/people/letters/bulk (or Issue letter with several people from the directory): the check lists who cannot get the letter and why |
| BulkConfirm · Bulk issue · typed confirmation | live | "Issue N letters" asks for the typed phrase |
| Register · Issued letters register (superseded, held) | live (gap) | superseded, pending approval, waiting for signature, withdrawn are live; the API has no "Held" letter status (e.g. relieving letter held until clearance) |
| Empty · · register empty | live | no letters yet: "No letters issued yet", Issue letter when a template is active |
| Issue · Issue letter · preview with real data | live | Issue letter: type, person, preview PDF from POST letters/preview |
| Approval · Issue letter · approval before issue | live | a template with requiresApproval: "Send for approval"; approver = the entity's first signatory, never the issuer |
| Missing · Issue letter · missing fields block generation | live | the API answers 400 LETTER_FIELDS_MISSING with the fields; the sheet lists them |
| LiveBulk · Live · bulk issue · preview with failures | live | as Bulk |
| LiveBulkConfirm · Live · bulk issue · typed confirmation | live | as BulkConfirm |
| LiveDrafts · Live · a draft to review, a discarded draft, a letter that couldn’t be made | live | drafts come from a withdrawn offer (PPL-15); "Being made" with a render error |
| LiveDraftMenu · Live · draft row menu: Review and issue, Discard draft | live | row menu on a draft |
| LiveReview · Live · review a drafted letter, then issue | live | POST letters/:id/preview, then letters/:id/issue |
| LiveDiscardError · Live · discard a draft · reason missing | live | Discard draft asks for a reason; empty reason shows the error |
| LiveCouldNotMake · Live · couldn’t be made: the reason, and Try again | live | "Try again": POST letters/:id/render; toast if it still fails |

#### PPL-29 · Letter templates

Live page: /yx/settings/letters (menu Settings › Letter templates; letter.template.manage or letter.signatory.manage)

| story (sub-page) | verdict | note |
|---|---|---|
| List · Templates list | live | GET letters/templates; Download as Word, Duplicate, Stop using / Use again |
| Empty · · empty | live | no template yet: "No templates" with Open starter library |
| Upload · Word upload with validation report | live | POST letters/templates (multipart); unknown placeholders come back as 400 TEMPLATE_FIELDS with suggestions ("Use suggestion") |
| Editor · In-app editor with merge fields | live | Editor tab; POST letters/templates/compose |
| Fields · Field cheat-sheet | live | Field cheat-sheet tab from the API's field list |
| TestRender · Test render (activate after viewing) | live | Test render (GET …/preview?personId=); Activate stays off until a render is viewed |

#### PPL-30 · My documents and letters

Live page: /yx/me/documents (menu People › Me › Documents & letters; every employee)

| story (sub-page) | verdict | note |
|---|---|---|
| Desktop · Employee · documents and letters | live | my uploads, letters and pay documents in one list |
| Share · Share an expiring link | live | Share: POST documents/shares (days); Stop sharing revokes |
| Empty · · empty | live | a new employee with nothing yet |
| Phone · · phone | phone view, mobile app not built | `MyDocumentsPhone` in known.json |
| Camera · · phone, camera upload | phone view, mobile app not built | same |
| PhoneEmpty · · phone, empty | phone view, mobile app not built | same |
| UploadNew · Upload a document · nothing chosen yet, Upload pressed | live | Upload a document: errors under the type and file fields |
| UploadVersion · Upload a new version from a row (type fixed) | live | row menu "Upload a new version" |

#### PPL-31 · Certificate request

Live page: /yx/me/documents/certificate (My documents › Request a certificate)

| story (sub-page) | verdict | note |
|---|---|---|
| Request · Employee · choose certificate | live | GET letters/me/certificates: self-service templates of my legal entity (salary, address, employment, NOC) |
| Instant · Generated instantly with QR code | live | template without approval: POST letters/me/certificates issues at once with reference and verify code; open, download, share |
| NeedsApproval · NOC · needs HR approval | live | template with requiresApproval (NOC): "Send to HR", status pending_approval, approvers named |
| Phone · · phone | phone view, mobile app not built | `CertificateRequestPhone` in known.json |
| NoPurpose · · Generate with no purpose: says so under the field | live | purpose error under the field |
| AlreadyWaiting · · Send to HR for a certificate already waiting | live | GET returns `pending`; the page says it is already waiting and with whom |

#### PPL-32 · Profile change request

Live page: /yx/me/change-requests (menu People › Me › Change requests; HR decides on /yx/people/profile-requests)

| story (sub-page) | verdict | note |
|---|---|---|
| Bank · Employee · bank account (old to new, proof, cooling period) | live | old value, new account, proof upload, cooling days from the company setting (coolingHours) |
| LegalName · Legal name (dated) | live | legal_name with an effective date and proof |
| PanInvalid · PAN · invalid format | live | PAN format check under the field; Send stays off |
| Submitted · Submitted · approved, cooling period | live | after HR approves: steps with "Cooling period ends" while usableFrom is in the future; old contact told |
| Phone · · phone | phone view, mobile app not built | `ProfileChangePhone` in known.json |
| PhonePan · · phone, PAN invalid | phone view, mobile app not built | same |

#### PPL-33 · My data and who accessed it

Live page: /yx/me/privacy (menu People › Me › Privacy)

| story (sub-page) | verdict | note |
|---|---|---|
| MyData · My data (classes, retention, download, correction) | live (gap) | classes, download (PDF, JSON: GET people/me/data) and the "How long" column (company settings `privacy.retention.*`, Confidential from `payroll.document_retention_years`, sent by GET people/me/access-log) are live; no "Request a correction", no "Nominate someone" (no API; corrections go through Change requests) |
| Accessed · Who accessed my data | live | GET people/me/access-log: views of my Confidential and Special data |
| Off · Who accessed · turned off by the company | live | the API returns enabled=false when the company turns the view off; the page says so |
| Phone · · phone | phone view, mobile app not built | `WhoAccessedPhone` in known.json |

### E. Identity, same person and records

#### PPL-34 · Identity panel

Live page: /yx/people/directory/[id] (record menu › Identity; HR with employee.aadhaar.view, never one's own record)

| story (sub-page) | verdict | note |
|---|---|---|
| OnRecord · On the person record (consented) | live (gap) | panel, checks (day-1 attested, HR attested, re-verification asked), Request re-verification and Record HR attestation are live (employees/:id/identity-checks); no face-match consent is captured, so the consent table always says "No face-match consent on file" |
| Refused · Face consent refused (ID check and attestation) | live (gap) | the attestation path is live; a "refused" consent row needs face-match consent (not built) |
| Mismatch · Day-1 mismatch flagged for HR review | design only, feature not built | no automated day-1 match; the API never records a mismatch |

#### PPL-35 · Person roles panel

Live page: /yx/people/directory/[id] (record side panel "Person roles", shown when the person has roles other than login)

| story (sub-page) | verdict | note |
|---|---|---|
| OnRecord · On the person record | live | GET employees/:id/person: employee, consultant, candidate, joiner, former employee roles with dates |
| Panel · Panel alone (contract worker to employee, nominee) | live (gap) | nothing creates contract_worker roles (contract workers module not built); nominees are F&F payees, not person roles |

#### PPL-36 · Possible same person

Live page: /yx/people/same-person (menu People › More › Possible same person, shown while a pair waits and for 90 days after any merge; employee.change.manage, company-wide)

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · HR · proposals (name-only match never listed) | live (gap) | live proposals are only a login-only or help-desk record sharing another person's email; name + date of birth, PAN and UAN proposals are not built |
| Compare · Evidence side by side | live | open a row: evidence table, Not the same person / Review merge |
| FaceMatch · Consented face match proposal | design only, feature not built | no face match in the API |
| Empty · · empty | live | nothing proposed: "No possible matches" (menu item hidden at 0; reach by URL) |

#### PPL-37 · Merge and unmerge

Live pages: /yx/people/same-person/merge?a=&b= (from Review merge) and /yx/people/same-person/merged/[id]

| story (sub-page) | verdict | note |
|---|---|---|
| Merge · HR · field-by-field merge | live | pick per field; the live merge offers name, primary email and primary phone only (the rest stays with the kept record) |
| NoteMissing · Audit note missing | live | Merge with an empty note shows the error |
| Unmerge · Unmerge restores the split | live | the merged page opens right after a merge, and later from Possible same person › Merged; POST persons/:id/unmerge |
| UnmergeConfirm · Unmerge · confirm with note | live | Unmerge asks for a note; empty note shows the error |
| MergedList · Unmerge later · merged records list | live | /yx/people/same-person?view=merged (switch To check / Merged): GET people/same-person/merged, records still merged, newest first; Open goes to the merge record (a pre-undo Service Desk link opens read only) |
| MergedEmpty · Unmerge later · no merged records | live | Merged view with no merges: "No merged records" |

#### PPL-45 · Work authorisations tab

Live page: /yx/people/directory/[id] → Work authorisations tab (HR with the identity class, someone else's record)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · On the record (visa expiring, occupation differs) | live | GET employees/:id/work-authorisations; Expiring from the company reminder days; "occupation differs" compares the visa occupation with the designation |
| Empty · · empty | live | a person with no work authorisation: the tab shows with an empty table (the tab appears whenever the HR viewer may read identity) |

#### PPL-46 · International bank details

Live page: /yx/people/directory/[id]/bank-abroad (HR, record menu "Account abroad"), /yx/me/bank-abroad (the person, Pay tab "Account abroad")

| story (sub-page) | verdict | note |
|---|---|---|
| SplitPay · HR · IBAN and split pay across 3 accounts | live (gap) | the live form changes one salary account abroad (profile request `bank_international`, approval and cooling period); the API has no split pay across accounts |
| OnPayTab · On the Pay tab | live (gap) | live Pay tab never passes `international`, so the embedded card does not show; the account abroad is its own page (button "Account abroad") |
| InvalidIban · Invalid IBAN and BIC | live | /yx/people/directory/[id]/bank-abroad: IBAN length and check digits and BIC are checked in the form before Send |
| OverSplit · Split more than net pay | live (gap) | no split pay in the API (see SplitPay) |
| Phone · Employee · phone | live | /yx/me/bank-abroad renders `InternationalBankPhone` with `live` on the web (self) |
| PhoneInvalid · Employee · phone, invalid IBAN | live | same page, IBAN checked against the country from its first two letters |

### F. Declarations, relations, special cases and checklists

#### PPL-38 · Disability declaration

Live page: /yx/me/declarations (every employee), /yx/people/declarations (HR diversity role, `employee.disability.view`)

| story (sub-page) | verdict | note |
|---|---|---|
| Form · Employee · consent first | live | /yx/me/declarations with no declaration yet (GET me/disability returns null); save is PUT me/disability; certificate upload goes to documents |
| Declared · Employee · declared (withdraw) | live | after a declaration is saved; "Withdraw consent" confirm calls POST me/disability/withdraw; a rejected certificate shows "upload again" |
| Designated · Employee, designated person · Declarations holds the annual declarations and pre-clearance | live | the Disability / Annual / Pre-clearance switch shows only when workspace counts carry `declarationsDue` (a designated person, server decides) |
| Hr · HR diversity role · list | live | /yx/people/declarations; open certificate (recorded look), verify, reject with reason; empty, loading and error states in the live list |
| Phone · · phone | phone view, mobile app not built | `DisabilityPhone` is in known.json |

#### PPL-39 · Union register

Live page: /yx/people/unions (`lifecycle.exit.manage`; scope picker filters by legal entity)

| story (sub-page) | verdict | note |
|---|---|---|
| List · HR · unions and recognition | live | GET people/unions; Add union and Edit union dialogs (POST / PUT unions) |
| Record · Union record (office bearers) | live | click a row: drawer with recognition basis, period, office bearers, check-off count |
| Empty · · empty | live | a company with no union yet: "No unions recorded" with Add union |

#### PPL-40 · VRS scheme

Live page: /yx/people/retrenchment (HR, menu "VRS schemes"); employee side is /yx/me/resignation

| story (sub-page) | verdict | note |
|---|---|---|
| Applications · HR · applications and approvals | live | Applications tab: exit cases of type VRS from GET lifecycle/exits; a row opens /yx/people/exits/[id] |
| Setup · HR · scheme set-up | live | Set-up tab; open a scheme is POST lifecycle/vrs-schemes |
| Apply · Employee · apply with estimate | live | /yx/me/resignation renders `VrsApply`; GET lifecycle/me/vrs `estimate` (scheme benefit by Rule 2BA with `vrs.benefit_days`, gratuity, leave encashment); POST lifecycle/me/vrs |
| NotEligible · Employee · not eligible | live | GET lifecycle/me/vrs `age`, `serviceYears`: the rule and the person's age and years |
| Permissions · HR · government permission requests | live | Government permission tab: apply, decide, closure (lifecycle/ir-permissions) |

#### PPL-41 · Buddy panel

Live page: /yx/people/buddies (onboarding view keys; changes need `lifecycle.onboarding.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · pool, load and check-ins | live | GET people/buddies: pool with load and cap, joiners without a buddy, check-ins; add and remove volunteers |
| Assign · HR · assign a buddy to a joiner | live | "Assign buddy" on a joiner without one: PUT lifecycle/joiners/:id/buddy (the joiner's rule: never the manager, cap); read-only viewers get no button |
| Empty · · empty pool | live | no volunteers yet: "No buddies in the pool" |

#### PPL-42 · Re-verification cycles

Live page: /yx/people/reverification (`document.manage`; others get a no-access page)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · due list | live | GET documents/reverification/due; due and overdue first, "all" toggle; opens the queue at /yx/people/documents |
| Rules · HR · rules | live | Rules tab: GET documents/reverification/rules; end a rule (POST …/rules/:id/end) |
| AddRule · HR · add a rule | live | "Add rule" dialog: POST documents/reverification/rules (only with a company or entity it may manage) |
| Ask · HR · ask for a fresh copy | live | row action: POST documents/reverification/ask |
| Empty · · empty | live | a company with no rules |
| Loading · · loading | live |  |

#### PPL-43 · BFSI declarations

Live page: /yx/me/declarations/annual (designated person), /yx/people/regulated-declarations (`compliance.declaration.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Holdings · Employee · holdings | live | GET me/bfsi; add (dialog) and remove holdings; a person who is not designated gets the NotDesignated state |
| Related · Employee · related persons | live | Related tab: add and remove |
| Conflict · Employee · conflict of interest | live | Conflicts tab: PUT me/bfsi/coi (Save draft) |
| Attest · Employee · attestation with OTP | live | POST me/bfsi/submit has `@RequireStepUp`: the app's second-factor prompt asks the code, not the inline OTP field; the code-of-conduct text is generic (no version or document in the API) |
| Switch · Employee · under Me › Declarations (switch) | live | switch shows for a designated person (workspace counts `declarationsDue`) |
| Officer · Compliance officer · register | live | /yx/people/regulated-declarations: register, remind, review a submission, designate and undesignate, CSV export |
| Phone · · phone | phone view, mobile app not built | `BfsiPhone` is in known.json |
| NotDesignated · Employee · not a designated person (nothing to declare) | live | GET me/bfsi returns designated false: live state 'not-designated' inside the Me frame |

#### PPL-44 · Trading pre-clearance

Live page: /yx/me/declarations/pre-clearance (designated person; old /yx/me/pre-clearance redirects), /yx/people/pre-clearance (`compliance.declaration.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Request · Employee · request | live | POST me/pre-clearance; a person who is not designated gets 403 and the NotDesignated state |
| Approved · Approved · validity window and trade report | live | after the officer approves (validUntil set); trade report with contract note upload |
| Blocked · Blocked · trading window closed | live (gap) | the API has no trading-window calendar (closed periods); the rule text in live leaves out "never during a closed window" |
| Expired · Expired without report | live | the service marks an approved, unreported request past validUntil as Expired |
| Reported · Trade reported | live | POST me/pre-clearance/:id/report |
| Switch · Employee · under Me › Declarations (switch) | live | designated person only |
| Officer · Compliance officer · decisions | live | /yx/people/pre-clearance: approve or reject with note |
| Phone · · phone | phone view, mobile app not built | `PreclearancePhone` is in known.json |
| NotDesignated · Employee · not a designated person (no pre-clearance) | live | GET me/pre-clearance answers 403: live state 'not-designated' inside the Me frame |

#### PPL-47 · My checklist tasks

Live page: /yx/people/my-tasks (anyone with tasks, or `lifecycle.onboarding.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Manager · tasks by person | live | GET lifecycle/my-tasks; a manager with joiner tasks; done and skip with toasts; HR also uploads or issues letters |
| Empty · · nothing to do | live | no tasks |
| Loading · · loading | live |  |
| LoadError · · error | live | Retry refetches |

#### PPL-48 · Life events

Live page: /yx/people/life-events (onboarding view keys)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · running checklists | live | GET lifecycle/life-journeys; a row opens /yx/people/onboarding/[id] |
| Empty · · none running | live |  |
| Loading · · loading | live |  |
| LoadError · · error | live |  |

#### PPL-49 · Retirements and contract ends

Live page: /yx/people/upcoming-exits (menu "Retirements and contracts"; exit view keys; changes need `employee.change.manage`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · HR · coming exits | live | GET lifecycle/upcoming-exits; Set, Extend, Make permanent buttons |
| ViewOnly · HR · view only (no change key) | live | a viewer without `employee.change.manage` gets no buttons |
| Empty · · nothing coming | live |  |
| Loading · · loading | live |  |
| LoadError · · error | live |  |
| SetContract · Set a contract end · open (choose the person) | live | "Set a contract end" opens `ContractDialog` with a person picker |
| SetContractFilled · Set a contract end · filled | live | PUT lifecycle/contracts/:employeeId (action set) |
| ExtendContract · Extend the contract · for one person | live | row action Extend |
| MakePermanent · Make permanent · new employment type | live | row action; the move goes for approval |
| ContractMissing · Set a contract end · Save pressed with nothing filled | live | the dialog's own field errors |
| ContractFailed · Extend the contract · the server refuses | live | the API refuses e.g. "An extension moves the end later.", an end before joining, or an end past the fixed-term limit (company setting `contract.max_years`, default 3 years from joining; Settings › Organisation › Fixed-term contracts, which also holds `contract_end.action`: remind HR, or start the exit a week before the end) |

#### PPL-50 · Team pay access

Live page: /yx/people/directory/[id] → Pay tab (manager of the person), /yx/people/pay-access (`employee.pay_access.approve`)

| story (sub-page) | verdict | note |
|---|---|---|
| ManagerAsk · Manager · ask for access (Pay tab) | live | manager on a team member's Pay tab: ask dialog, POST people/pay-access; offered only while nothing waits for HR |
| ManagerWaiting · Manager · waiting for HR (approval 2 of 2) | live | GET pay-access/mine, state `second` |
| ManagerActive · Manager · access open until a day | live | state `active`: pay shows on the Pay tab |
| ManagerEnded · Manager · access ended (pay hidden again) | live | state `ended` (last day passed or HR ended it) |
| ManagerRefused · Manager · refused by HR | live | state `refused` |
| HrWaiting · HR · waiting requests | live | /yx/people/pay-access, Waiting filter |
| HrFirstStep · HR · first approval (length and who it covers) | live | POST pay-access/:id/decision (second factor) |
| HrSecondStep · HR · second approval (a different HR person) | live | the API refuses the same HR person twice and the manager |
| HrEnd · HR · end access early (reason required) | live | POST pay-access/:id/end with reason |
| HrEndedEarly · HR · ended early (by whom) | live | Closed filter: "Ended early by …" |
| Empty · · nothing waiting | live |  |
| Loading · · loading | live |  |
| LoadError · · error | live |  |
| NoAccess · · no access | live | loadState maps a 403 to no-access (someone opening the address without the key) |

### G. Other People stories (no PPL number)

#### People core

Live page: /yx/people/bulk-changes (`BulkChangesScreen`, workforce/bulk.tsx; menu People › Changes › Bulk changes, `employee.change.manage`). API: `GET/POST people/change-batches`, `POST change-batches/reassign`, `GET change-batches/:id`, `POST change-batches/:id/approve|reject|cancel`.

| story (sub-page) | verdict | note |
|---|---|---|
| BulkFile · Bulk changes · from a file | live | /yx/people/bulk-changes; CSV checked row by row (`POST change-batches`), team move (`change-batches/reassign`); "Increment" button only with `employee.salary.manage` + `employee.salary.view` (opens PPL-06 at /bulk-changes/increment) |
| BulkBatch · Bulk changes · batch to approve | live | /yx/people/bulk-changes?batch=<id> opens the batch (`defaultBatchId`); approve/reject need `employee.change.approve`, approve is a step-up action |

#### Access and privacy

Live page: /yx/settings/access (`RolesAccessScreen`, `access.role.manage`), /yx/people/profile-requests (`ProfileRequestsScreen`, menu People › Changes › Identity and bank changes, `employee.identity.approve` or `.manage`). API: access grants (`/grants/:id/approve`, `/users/:id/system-admin`), `GET people/profile-requests`, `POST profile-requests/:id/approve|reject`.

| story (sub-page) | verdict | note |
|---|---|---|
| RolesAccess · Roles & access · people, waiting, roles | live | /yx/settings/access as a System Admin |
| RolesAccessOther · Roles & access · another admin decides | live | same page; `meId` from the signed-in user, so a grant raised by someone else shows Approve / Reject (maker is not checker) |
| Requests · Identity and bank changes · payroll queue | live | /yx/people/profile-requests; `canDecide` = `employee.identity.approve` (without it the list is read only); approve asks a fresh second factor; proof opens through the document download |

#### Job history

Live page: /yx/people/history?person=<id>&asOf=<date> (`PersonHistoryScreen`; menu People › Changes › Job history for HR, or anyone the nav gives `n.history`). API: `GET people/employees/:id/as-of?date=&pay=true`, `GET employees/:id/history`, `GET/PUT employees/:id/service-dates`. The change drawer is raised from here only with `employee.change.manage`.

| story (sub-page) | verdict | note |
|---|---|---|
| HrToday · HR · today | live | as HR, pick a person |
| WithPay · Payroll · pay shown (recorded) | live | "Show pay" sends `&pay=true`; pay facts only with `employee.salary.view` (founder rule R1); the read is recorded server side |
| Scheduled · As on 1 Nov 2026 (scheduled promotion) | live | pick a future "As on" date (URL `asOf=`); the as-of view shows the approved future change |
| Manager · Manager · no pay, no change button | live | as a manager without `employee.salary.view` (API sends `payAccess: false`) and without `employee.change.manage` (no `change` prop, so no button) |
| NoPerson · · no person chosen | live | /yx/people/history with no `person=` |
| PromotionLowersPay · Change action · a promotion that lowers pay (warning, not a block) | live | `DesignImpact` inside the live `ChangeDrawer` (/yx/people/changes, /yx/people/history, /yx/people/team); the API adds "This promotion lowers the annual CTC…" (employee-history.service.ts `lowersPay`) and still lets it be sent; a viewer without pay access gets the warning stripped (`redactImpact`) |

#### Me and set-up · My assets, first 30 days, checklists and signatories

These four screens live under `people/live/` but the story file says "These stories are their design" (written after the PPL groups, with Kaveri Foods data). Treat them as accepted designs, as Pay did with "Me · Pay documents": the page renders the same component the story shows, so there is no second copy to remove. The guard does not list them.

Live pages: /yx/me/assets (`MyAssetsScreen`; not in the six-item Me menu, it is in the avatar menu "My assets", nav line 368), /yx/me/first-30-days (`FirstThirtyDaysScreen`; Home menu "My first 30 days" while a joining checklist runs, and the landing page then), /yx/settings/checklists (`JourneyTemplatesScreen`, `lifecycle.journey.template.manage`), /yx/settings/letters › Signatories (`SignatoriesDrawer`, `letter.signatory.manage`). API: `GET lifecycle/me/assets`, `POST lifecycle/me/assets/:id/acknowledge`; `GET lifecycle/me/first-30-days`, `POST lifecycle/tasks/:id/complete|skip` (version checked); `GET/POST/PUT lifecycle/journey-templates`, `POST journey-templates/from-starter`, `GET journey-templates/options`; `GET/POST letters/signatories`, `GET letters/signatories/people`, `POST letters/signatories/:id/remove`.

| story (sub-page) | verdict | note |
|---|---|---|
| Assets · My assets · two to confirm | live | /yx/me/assets, an employee holding assets issued in /yx/people/assets |
| AssetsAllConfirmed · My assets · all confirmed | live | after "I have it" on each row |
| AssetsConfirming · My assets · confirming | live | button busy while `POST me/assets/:id/acknowledge` runs; toast after |
| AssetsEmpty · My assets · none held | live | an employee with no assignment |
| AssetsLoading · My assets · loading | live |  |
| AssetsError · My assets · could not load | live | Retry refetches |
| AssetsPhone · My assets · phone | live | the same component at phone width in the web app (not a separate phone screen); the separate PPL-25 `AssetAcknowledgePhone` is the one waiting for the mobile app |
| First · My first 30 days · day 8 | live | /yx/me/first-30-days for a joiner with an active joining checklist |
| FirstQuiet · My first 30 days · nothing for today or this week | live | API returns empty today/week; manager and buddy null when not set |
| FirstRead · My first 30 days · a step to read | live | a `read` step from the checklist template (journey-rules `contentConfig`) |
| FirstSkip · My first 30 days · Skip pressed with no reason | live | Skip shows only where `canSkip` (not required); reason of 3+ characters checked before sending |
| FirstSurveyMissing · My first 30 days · survey sent with no ratings | live | a `survey` step; every statement needs a rating before Send |
| FirstFailed · My first 30 days · the server refuses | live | 409 "Someone else changed this task. Reload it." (version check in `finishIn`), or "This task waits for an earlier one." |
| FirstLoading · My first 30 days · loading | live |  |
| FirstError · My first 30 days · could not load | live |  |
| Checklists · Checklists · joining | live | /yx/settings/checklists |
| ChecklistsLeaving · Checklists · leaving, the starter to copy | live | "Leaving" tab with the offboarding starter not yet copied (`starters[].copied` false) |
| ChecklistsLife · Checklists · life events | live | "Life events" tab; a copied life-event checklist starts switched off (copyStarter) |
| ChecklistsStarterFailed · Checklists · copying the starter refused | live | copy a starter that is already copied (two tabs, or a double click): `copyStarter` answers 409 "You already have a copy of this starter. Reload the page to see it." |
| ChecklistsEmpty · Checklists · none yet | live | a company with no templates; starters list also empty only if `STARTERS` were empty, so in practice the starters still show |
| ChecklistsLoading · Checklists · loading | live |  |
| ChecklistsError · Checklists · could not load | live |  |
| ChecklistsNoAccess · Checklists · no access | live | open the URL without `lifecycle.journey.template.manage`: API 403 → `loadState` 'no-access' |
| EditChecklist · Edit a checklist · open | live | "Edit checklist" on a row |
| EditChecklistMissing · Edit a checklist · a new task saved with no name | live | checked in the form before `PUT` |
| EditChecklistFailed · Edit a checklist · the server refuses | live | 409 "Someone else changed this checklist. Reload it." (version check in `saveTemplate`) |
| Signatories · Signatories · open | live | /yx/settings/letters › Signatories (only with `letter.signatory.manage`) |
| SignatoriesEmpty · Signatories · no one yet | live | a company with no active signatory |
| SignatoriesRemoveFailed · Signatories · Remove refused | live | remove a signatory who signs letters waiting for approval: `removeSignatory` answers 409 "… signs N letters waiting for approval. Approve or withdraw them first." |
| AddSignatory · Add a signatory · open | live |  |
| AddSignatoryFilled · Add a signatory · filled | live |  |
| AddSignatoryMissing · Add a signatory · Add pressed with nothing filled | live | form check before `POST` |
| AddSignatoryFailed · Add a signatory · the server refuses | live | 400 "Choose an active user." / "No such legal entity." or 403 for an entity out of scope. Note: adding the same person again replaces the old row (no "already a signatory" refusal) |

#### Kit (people-kit.stories.tsx, 10 stories: shared parts, not pages)

Field class badges, masked value with audited reveal, field lists (HR, manager), progress ring, due countdown, fact rail, status checklist, explained F&F lines, compare table. Used by the designed screens in `assets.tsx`, `changes.tsx`, `checklists.tsx`, `custom-fields.tsx`, `directory.tsx`, `documents.tsx`, `exits.tsx`, `import.tsx`, `increment.tsx`, `onboarding.tsx`, `pay-access.tsx`, `record.tsx`, `relations.tsx`, `restructure.tsx`, `reverification.tsx`, `selfservice.tsx`, `upcoming.tsx`. Not counted.

## 5. Split into 3 builders

Split by file, so each builder owns its own design files, page files and API services. The pre-boarding portal goes
first.

| builder | owns (files) | work | size |
|---|---|---|---|
| 1 · Pre-boarding portal (first) · **done 2 Nov 2026** | `packages/yx-ui/src/screens/portals/t9-workforce.tsx` (T9-01 parts only), `t9-01-preboarding.stories.tsx`, `t9-data.ts`; `apps/web/app/yx/join/[org]/page.tsx`; `apps/api/src/lifecycle/portal.service.ts`, `portal.controller.ts`, `portal-dto.ts`; from `people/live/joining.tsx` only `PortalScreen`, `SectionDrawer`, `SectionsList`, `AnswersList`, `LetterList` (keep `AcceptDialog` as the design's accept step or move it into `t9-workforce.tsx`) | T9-01 takes `live` (as the alumni portal T9-02 already does); keep everything in the "stand-in has" table; add to `me` the checklist tasks with due dates and owners, first-day facts, "date moved"; an outcome read for a closed joining; decline offer; group-insurance nominees; previous income (Form 12B) in `sections/tax`; design stories first for the states T9-01 lacks (loading, error, personal / PAN and ID / emergency forms, PAN step-up, BGV withdraw). Remove `people: PortalScreen` from `known.json`. Penny drop, LOI and Aadhaar e-sign wait (Q2) | L |
| 2 · Changes, record dialogs, exits | `people/changes.tsx`, `history/history-kit.tsx` (`ChangeDrawer`), `history/job-changes.tsx` (`ReasonDialog`), `ppl-04`, `ppl-05` stories; `people/record.tsx`, `people/documents.tsx`, web `people/person-record.tsx`, `people/upload-doc-dialog.tsx`, `ppl-03` stories; `people/exits.tsx`, `people/live/special.tsx` (`VrsCard`), `ppl-24`, `ppl-40`, `ppl-20` stories; web `people/absconding`, `me/resignation`, `people/clearance` pages; `apps/api/src/lifecycle` exit and clearance services | PPL-04 drawer takes the `ChangeDrawer` props, then `ChangeDrawer` is deleted (it is used on /changes, /history, /team and the record: one swap); `ReasonDialog` stories; PPL-03 stories for work phone, ask for a document, send back, upload for the person, then move the dialogs; PPL-24 start and dispatch-proof stories; PPL-40 employee view replaces `VrsCard` (+ estimate and reason, M); PPL-20 HR view by leaver and "blocked" status | L |
| 3 · Small gaps | `people/live/templates.tsx`, `SignatoriesDrawer` in `people/live/joining.tsx` (that function only); `people/onboarding.tsx`, `ppl-12`, `ppl-13`; `people/relations.tsx`, `ppl-36`, `ppl-37`; `people/selfservice.tsx`, `ppl-33`, `ppl-43`, `ppl-44`; `people/upcoming.tsx`; the PPL-46 Pay tab line in the record's Pay tab (ask builder 2 before touching `record.tsx`, or land it after builder 2); the matching API services (journey templates, letters signatories, joiners, same person, privacy, contracts) | starter copy refused twice; signatory not removed while letters wait; PPL-13 "your tasks" filter; PPL-12 rehire impact in the Create drawer; merged-records list for Unmerge; PPL-33 retention column; PPL-43/44 empty stories; fixed-term contract limit as a company setting (Q4); PPL-46 account abroad on the Pay tab | M |

Not in this round (founder to decide, section 3): contract workers module, learning, face match, automated document
checks, held letters, trading-window calendar, split pay, absconding recovery-only F&F, privacy correction requests.

**Builder 2 done (branch `feat/yukthix-people-changes`, 2 Nov 2026):** PPL-04 `ChangeActionDrawer` replaces `ChangeDrawer` everywhere; `ReasonDialog`, PPL-03 record dialogs and PPL-24 start / dispatch proof have stories and are live; PPL-40 `VrsApply` with the estimate replaces `VrsCard`; PPL-20 HR view by leaver; PPL-22 recovery-only F&F for absconding. Left: PPL-20 "blocked" needs migration `20261312000000_clearance_blocked` applied. Manual steps MT-PPL-C-01 … 12.

**Builder 3 done (branch `feat/yukthix-people-small`, 30 Oct 2026):** starter copied once (409); signatory kept while letters wait for approval (409); PPL-13 own tasks (API filter); PPL-12 rehire impact in the Create drawer (an ex-employee's offer now joins as a rehire); PPL-37 Merged list; PPL-33 How long (settings `privacy.retention.internal_years` 8, `personal_years` 3, `special_years` 1); PPL-43/44 NotDesignated; fixed-term limit `contract.max_years` (default 3, Settings › Organisation › Fixed-term contracts). No migrations. Left: PPL-46 account abroad on the Pay tab needs `record.tsx` and lands after builder 2.

**Shared files and how to avoid conflicts**

| shared file | who touches it | rule |
|---|---|---|
| `packages/yx-ui/src/design-live-guard.known.json` | builder 1 (removes `people: PortalScreen`) | remove only your own line; never re-sort. Builders 2 and 3 add none: their parts are drawers and dialogs the guard does not track |
| `packages/yx-ui/src/screens/people/live/joining.tsx` | 1 (portal functions), 3 (`SignatoriesDrawer`) | delete or edit only your own functions; do not move or reformat the rest; unused imports in a last commit after rebase |
| `packages/yx-ui/src/screens/people/live/index.ts` (`@yukthix/ui/lifecycle`) and `_kit/live.ts` (`@yukthix/ui/frame`) | all three | edit only your own export lines; add new exports as one line at the end |
| `packages/yx-ui/src/screens/people/people-data.ts`, `portals/t9-data.ts` | 2 and 3; 1 | sample data for stories only; add a block at the end named after the group, change nothing that exists |
| `people/record.tsx` | 2, then 3 (one line for PPL-46) | builder 3 lands after builder 2 |
| `apps/api/src/lifecycle/*` | 1 portal files; 2 exits and clearance; 3 templates, letters, joiners, relations | stay in your own service files; a shared DTO or `lifecycle.module.ts` change goes at the end of the file |
| `apps/web/lib/yx-nav.ts` | none | routes and menu stay as they are |
| `people.css`, `people-kit.tsx`, `portals.css` | any, rarely | additions only, at the end, named after the group |

**Merge order:** builder 1, then 2, then 3, each rebased on the one before. Each builder ports the tests of what it
deletes (`joining-live.test.tsx` for the portal; the history tests for `ChangeDrawer`; `special-live.test.tsx` for
`VrsCard`) and runs the guard and `twin-stories.test.tsx` before handing over.

## 6. Questions for the founder

1. **The joining portal has no invitation link.** The design has an "Invitation link expired" page; the live portal signs
   in with the personal email and a code, with no link. Keep it that way?
   *Suggested: yes, keep email and code; drop the expired-link story from T9-01.* It is simpler and safer (no link to
   forward), and the sign-in already works.
2. **Joining portal: build the parts that need an outside provider now?** Bank check by penny drop, Aadhaar e-sign of the
   appointment letter, a letter of intent before the appointment letter.
   *Suggested: not now.* Wire T9-01 with what the API has (emailed-code acceptance, HR checks the bank) and show
   "HR checks it" where the design shows a verified tick. Add the providers when the company signs one; Pay's payout
   penny drop may be reused.
3. **The change form has two versions.** The live "Start change" form (`ChangeDrawer`) and the PPL-04 design do the same
   job. Make the PPL-04 design the only one?
   *Suggested: yes.* One form for one job (the founder rule); the live one's rules (promotion must change designation
   and grade, inter-entity move, drafts) move into the design.
4. **Fixed-term contracts: how long at most?** PPL-49 shows a refusal at 3 years; the app has no limit.
   *Suggested: a company setting, default 3 years, HR can change it* (company policy is configurable). **Accepted and built** (`contract.max_years`).
5. **Account abroad for the person themselves** shows the phone layout on the web (there is no desktop design).
   *Suggested: accept it;* it is a short form and works at web width. Add a desktop story only if the founder wants one.
6. **PPL-10 (continuity checklist) has no story of its own;** it is drawn and live inside PPL-09. Keep the number unused?
   *Suggested: yes;* no work, and the APX-D table gets a note "drawn in PPL-09".
7. **Withdrawing background-check consent in the portal.** The stand-in lets a joiner withdraw (the law requires it);
   the T9-01 design has no withdraw button.
   *Suggested: add "Withdraw consent" to the T9-01 design* (with the warning that checks stop), then wire it.
8. **Contract workers.** Three stories (directory card, conversion to employee, roles panel) wait for a contract workers
   module.
   *Suggested: leave them as "feature not built" until that module is planned;* they need agencies and deployments, a
   separate job (L).
9. **Answered 30 Oct 2026, built (see "Founder answers, 30 Oct 2026 (what Special data erasure deletes)").** Special data erasure (follow-up 12): what counts as Special data? Built only what the setting names ("Aadhaar,
   background checks"): the Aadhaar on the record, the `aadhaar` and `bgv_report` documents, background check notes.
   Not built, waiting for an answer:
   - disability declarations and the `disability_certificate` document (Special by class; the RPwD rules may need the
     employer's register kept). *Suggested: keep the declaration's yes/no for the register, erase the sealed details and
     the certificate with the same period.*
   - consent records (proof of consent for background checks). *Suggested: keep them; they prove lawful processing and
     hold no Special values.*
   - a background check's status (clear, discrepancy). *Suggested: keep it; it is a fact about the hiring decision.*
   - joiners who never joined (cancelled pre-boarding) and their checks. *Suggested: the same job, counted from the
     cancellation day.*
   - Aadhaar inside pay records and statutory filings. *Suggested: never; pay records keep payroll's own period.*
10. **Answered 30 Oct 2026, built (names, code, last day).** Erasure dry run: counts only, or also names? HR sees four counts. *Suggested: add a list of the people (name,
    code, last day) for HR to check before turning it on;* names of former employees are already visible to HR.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every People
story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/people-design-map.md and checks that
// every People story file has exactly one row per story, in file order.
const fs = require('fs');
const UI = 'packages/yx-ui/src/screens/';
const files = fs.readdirSync(UI + 'people').filter((f) => /^ppl-\d+\.stories\.tsx$/.test(f)).map((f) => 'people/' + f)
  .concat(['workforce/workforce.stories.tsx', 'access/access.stories.tsx', 'history/history.stories.tsx', 'people/live/lifecycle-gaps.stories.tsx']);
const want = {};
for (const f of files) {
  const s = fs.readFileSync(UI + f, 'utf8');
  want[s.match(/title:\s*'Screens\/People\/([^']+)'/)[1]] = [...s.matchAll(/^export const (\w+)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/people-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split('## 5.')[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0], c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    if (head.startsWith('Kit')) continue;
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

## Founder answers, 2 Nov 2026 (kit table and slider, "All ok")
(1) Pay tables keep the kit look (no grey header band); (2) People numbers move to right-aligned number columns, as its
own small change; (3) PlainTable keeps `hideHeader` and `empty`; (4) the kit Slider may be disabled when nothing can
change, with a hint saying why (the no-disabled rule covers buttons); (5) the run-files list (table on desktop, cards on
phone) waits for a kit pattern.

## Founder answers, 2 Nov 2026 (joiner portal T9-01, "all ok")
Confirmed: sign-in by email and an emailed code (no invitation link); penny drop, Aadhaar e-sign and the letter of intent
wait for a provider; BGV "Withdraw consent" added. (1) a joiner's decline is recorded in Hiring under their HR owner, with
the joiner's reason; (2) a closed joining can still download its letters, read-only; (3) joiners don't tick "read" tasks
before joining, for now; (4) Form 12B numbers given in the portal are not copied into Pay automatically (payroll needs the
PDF and approves it); (5) "Bring on day one" becomes a short text HR edits, shown on the portal; (6) the education form and
code-of-conduct / POSH policy signing join the portal in a later round.

## Founder answers, 2 Nov 2026 (joiner portal follow-up, "all ok")
(1) "Bring on day one" cannot be saved blank; HR keeps the starter list if nothing extra is needed; (2) when a joining
closes, its open signature requests are cancelled (small follow-up); (3) joined employees keep downloading their letters
in the portal until the employee app has a "My letters" page.

## Founder answers, 2 Nov 2026 (changes, record dialogs, exits, "ok for all")
(1) the clearance_blocked migration is applied in the test app; (2) VRS benefit days stay a company setting
(`vrs.benefit_days`, default 45; 30/45/60/90), not per scheme; (3) no separate Unblock: signing off or waiving ends a block.
