# Help and onboarding: designs and what exists (audit)

This file checks, story by story, every Help and onboarding design sub-page against what is live, in the same shape as
`visitors-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the designed one
live.

Status 11 Nov 2026 (branch `docs/yukthix-help-onboarding-map`, from `test/yukthix-main` at 9de3c7a4e). Audit only:
nothing was built.

## What is live today (plain English)

- **Nothing of the drawn Help and onboarding patterns is live as drawn.** All 41 stories come from one file,
  `screens/settings/help.stories.tsx`, and render parts of `screens/settings/help.tsx` (APX-D §6): `TourCard`,
  `HelpDrawer`, `HelpTopicBody`, `WhatsNewList`, `AccessDeniedState`, `NotFoundState`, `IrreversibleActionDialog`,
  `BulkApproveConfirm`, `AvailabilityBanner`, `AvailabilityState`, `RoleEmptyState`. No live page imports any of them
  (checked by search over `apps/web` and the kit's live screens). The coordinator's "mixed" label comes from the frames
  (`DesktopFrame`, `PhoneFrame`, `PageHeader`), which are live; the help parts themselves are not.
- **But much of the behaviour is live through other kit parts**, which is why many rows below are "live (gap)":
  - **No access:** live pages use the kit's `NoAccessState` ("You don't have access to … Ask … to give you access.",
    in 77 files). "Request access" exists only in three places: Payroll reports (PAY-25), Pay access and the platform
    support console.
  - **Not found:** the API answers 404 for a record that does not exist and for another company's record alike
    (YX-SEC-10). Each page shows its own `EmptyState` "Not found", not the drawn `NotFoundState` with a reference code.
  - **Irreversible actions:** the pay kit's `IrreversibleSheet` (`screens/pay/pay-kit.tsx`) is live in payroll runs,
    payments, consultants, records, compliance and expenses finance. It has the same parts as the drawn dialog: what
    happens, figures, cannot undo, the correction path, a typed phrase, a reason, maker and checker, and a named block.
  - **Bulk approve:** live in the Approvals inbox (`ApprovalsInboxScreen`, PLT-04) with its own count confirmation.
  - **Empty states:** every live list uses the kit's `EmptyState` (the same component `RoleEmptyState` wraps) with the
    page's own words; tables say "No results for these filters" when filters are on (`DataTable` `filtered`).
  - **Help:** a different Help drawer is live (`screens/desk/help.tsx`, US-B-100, opened from Help in the top bar on every
    page): known issues with "Me too", raise a ticket (it remembers the page, suggests knowledge-base articles while you
    type) and my open tickets. The drawn help drawer (this page, what's new, tours) is not live. **These are two
    versions of one drawer** (question 941).
- **Not live at all:** first-run tours, page help topics, what's new, tour history, the generic access request,
  maintenance, degraded and read-only states, module switches and waves, sample data, and shortcut help (`ShortcutHelp`
  is in the kit, not mounted).

Verdicts (the same words as the other maps): **live** · **live (gap)** · **wire design** · **design only, feature not
built** (no API for this feature) · **phone view, mobile app not built**. Here "live (gap)" means the live app does that
job with another kit part (named in the note); the drawn component itself is not what renders.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Tours, help and what's new (6.1, 6.2) | 2 | 4 | 0 | 0 | 4 | 3 | 11 |
| B. Access and not found (6.3) | 1 | 5 | 0 | 0 | 0 | 2 | 7 |
| C. Irreversible actions (6.4) | 1 | 5 | 0 | 0 | 0 | 0 | 5 |
| D. Availability (6.5) | 1 | 0 | 1 | 0 | 7 | 1 | 9 |
| E. Empty states (6.6) | 1 | 1 | 7 | 0 | 1 | 1 | 10 |
| **All A-E** | **6** | **15** | **8** | **0** | **12** | **7** | **42** |
Recounted 11 Nov 2026 on test/yukthix-main after merging H-1 (help drawer, What's new tab, irreversible sheet) with H-2 (access and not found).

Counted by script 11 Nov 2026 on `docs/yukthix-help-onboarding-map` (the script is in the appendix): the 41 stories
under Screens/Help and onboarding/Patterns (one file, grouped by its section comments 6.1 … 6.6). The 7 phone views need
the phone app, which is not built. Recounted after H-2 (11 Nov 2026, branch `feat/yukthix-help-h2`): 42 stories (one
added, NotFoundRecord), and group B is live apart from its two phone views.

## 1. Live pages

None of the drawn patterns. The live equivalents are named in each row's note.

## 2. Live pages with no design

None for this group. (The live Help drawer has its own design: Helpdesk US-B-100, `desk.stories.tsx`.)

## 3. Designs with no live page or API

The 18 "design only" rows: tours (3), the help drawer's page help, what's new and tours tabs (4) and the What's new page
(1), the generic access request (2), availability (7) and sample data (1).

## 4. Design groups, story by story

### A. Tours, help and what's new (6.1, 6.2)

#### 6.1 tours

| story (sub-page) | verdict | note |
|---|---|---|
| TourEmployee · 6.1 Tour · employee first sign-in (phone) | phone view, mobile app not built | `TourCard` on the phone home; no tour engine exists |
| TourEmployeeStep3 · 6.1 Tour · employee, last step | phone view, mobile app not built | as above (step 3 of 3) |
| TourManager · 6.1 Tour · manager first approval | live (H-5) | floats on Approvals once a request has come to the person |
| TourPayroll · 6.1 Tour · payroll admin first run | live (H-5) | floats on Payroll › Runs once a run exists, for people who work runs |
| TourAdmin · 6.1 Tour · HR / System Admin first sign-in | design only, feature not built | drawn on the set-up hub (PLT-08), which is not live either; the live home (`RoleHomeScreen`) has a drawn `firstRun` tour prompt the web page never turns on |

#### 6.2 help drawer and what's new

| story (sub-page) | verdict | note |
|---|---|---|
| HelpDrawerPage · 6.2 Help drawer · this page (TIM-18 apply leave) | live | H-1 (11 Nov 2026): the one Help drawer (`screens/desk/help.tsx`, every page) opens on This page with the help articles tagged with the page (`GET desk/my/kb/page?route=`, answer 942), behind "Show page help" (on); the drawn topic body (steps, fields, glossary) is retired: page help is the articles |
| HelpDrawerNews · 6.2 Help drawer · what's new | live | H-4's `WhatsNewPanel` (PLT-50) in the drawer's What's new tab (H-1 merge); the tab shows only when there are entries |
| HelpDrawerNewsEmpty · 6.2 Help drawer · what's new, nothing yet (the tab is hidden) | live | with no entries (or What's new off) the drawer has no What's new tab |
| HelpDrawerTours · 6.2 Help drawer · tours (resume, replay) | design only, feature not built | H-1: the Tours tab (`TourList`) is hidden in the app until H-5 |
| HelpPhone · 6.2 Help · phone (bottom sheet content) | phone view, mobile app not built | the drawer’s This page content (`PageHelp`) in a bottom sheet |
| WhatsNewManager · 6.2 What's new · manager | live | the story shows PLT-50's `WhatsNewPanel` (answer 943: the one version), live in the Help drawer's What's new tab; the drawn `WhatsNewList` is retired |

### B. Access and not found (6.3)

#### 6.3 permission

| story (sub-page) | verdict | note |
|---|---|---|
| AccessDenied · 6.3 Access denied · with Request access | live | H-2 (946): every live `NoAccessState` offers Request access when the company allows it (the app frame provides it); the drawn `AccessDeniedState` now renders that same state |
| AccessRequestForm · 6.3 Request access · form | live | H-2: reason (10 to 500 characters) and how long, up to Longest access; `POST access/requests`; decided in Roles & access › Requests |
| AccessRequestSent · 6.3 Request access · sent | live | H-2: the state says waiting, given until a day, refused with the reason (Ask again), or ended (Ask again) |
| AccessDeniedPhone · 6.3 Access denied · phone | phone view, mobile app not built | |
| NotFound · 6.3 Not found (missing or restricted, identical) | live | H-2 (947): every API 404 to a signed-in person carries a reference (`NF-` and 6 characters), the same for missing and other-company records; the web's own Not found page asks `POST help/not-found` for one |
| NotFoundRecord · 6.3 Not found · a record page, with its reference | live | H-2: a page's own `EmptyState` "Not found" shows the reference of the 404 on that page (kit `NotFoundReferenceContext`); support looks it up in Helpdesk › Tickets › Look up a reference |
| NotFoundPhone · 6.3 Not found · phone | phone view, mobile app not built | |

### C. Irreversible actions (6.4)

#### 6.4 irreversible

| story (sub-page) | verdict | note |
|---|---|---|
| IrreversiblePublish · 6.4 Irreversible · publish payslips | live | H-1: the story shows the live pay-kit `IrreversibleSheet` (payroll runs, payments, records, compliance, expenses); the drawn dialog is retired (answer 945) |
| IrreversibleTyped · 6.4 Irreversible · phrase typed, ready | live | as above |
| IrreversibleSamePerson · 6.4 Irreversible · maker is the checker (blocked) | live | `IrreversibleSheet` with maker = checker offers "Send to … for approval" |
| IrreversibleReopen · 6.4 Irreversible · reopen period (reason required) | live | `IrreversibleSheet` `reasonRequired`; Payroll › Reopen requests |
| BulkApprove · 6.4 Bulk approve · count confirmation | live | H-1: the story shows the live Approvals inbox (PLT-04) bulk confirmation; the drawn `BulkApproveConfirm` is retired |

### D. Availability (6.5)

#### 6.5 availability

| story (sub-page) | verdict | note |
|---|---|---|
| Maintenance · 6.5 Availability · maintenance banner | design only, feature not built | no maintenance window or status feed; the kit's `PageBanner` (system-wide states) exists and is not mounted for it |
| MaintenancePage · 6.5 Availability · down for maintenance | design only, feature not built | as above |
| Degraded · 6.5 Availability · degraded | design only, feature not built | the API health check reports degraded internally; nothing tells users |
| ReadOnly · 6.5 Availability · read-only account | design only, feature not built | no read-only company mode (a suspended company cannot sign in at all); Platform PLT-43 draws a trial read-only banner too |
| ReadOnlyPhone · 6.5 Availability · read-only (phone) | phone view, mobile app not built | |
| Wave · 6.5 Availability · available in wave 6 | design only, feature not built | no release waves |
| NotEnabledAdmin · 6.5 Availability · not enabled (admin) | design only, feature not built | no per-company module switch; the menu hides areas by permission; Platform PLT-40 "Switch on" draws the admin side |
| NotEnabledEmployee · 6.5 Availability · not enabled (deep link, employee) | design only, feature not built | as above |
| SetupNeeded · 6.5 Availability · set-up needed | live (gap) | pages say it in their own words (Expenses "not set up yet", the onboarding checklist refusal, Performance set-up starters); not the drawn `AvailabilityState` |

### E. Empty states (6.6)

#### 6.6 empty states

| story (sub-page) | verdict | note |
|---|---|---|
| EmptyEmployee · 6.6 Empty · first use, employee | live (gap) | H-1: the story shows the kit `EmptyState` (as live lists); `RoleEmptyState` is retired; the "How it works" help link is not on live pages |
| EmptyManager · 6.6 Empty · first use, manager | live (gap) | H-1: the story shows the kit `EmptyState` (as live lists); `RoleEmptyState` is retired; the "How it works" help link is not on live pages |
| EmptyHr · 6.6 Empty · first use, HR | live (gap) | H-1: the story shows the kit `EmptyState` (as live lists); `RoleEmptyState` is retired; the "How it works" help link is not on live pages |
| EmptyPayroll · 6.6 Empty · first use, payroll admin | live (gap) | H-1: the story shows the kit `EmptyState` (as live lists); `RoleEmptyState` is retired; the "How it works" help link is not on live pages |
| EmptySandbox · 6.6 Empty · sandbox with sample data toggle | design only, feature not built | no sample data for a company; question 950 |
| EmptyFiltered · 6.6 Empty · filtered to nothing | live | the kit `DataTable` shows "No results for these filters" when filtered; the story shows the same `EmptyState` |
| EmptyNotDue · 6.6 Empty · not due | live (gap) | `EmptyState` with the page's words; not checked page by page that each module says "not due" this way |
| EmptyNotCovered · 6.6 Empty · not covered | live (gap) | as above (Payroll › Earned wage access is live) |
| EmptyPending · 6.6 Empty · pending | live (gap) | as above |
| EmptyPhone · 6.6 Empty · first use (phone) | phone view, mobile app not built | |

## Related help and onboarding designs outside this group (not counted here)

| design | where | live? |
|---|---|---|
| Help drawer (US-B-100): known issues, raise a ticket, my tickets | Helpdesk, `screens/desk/help.tsx` | **live** on every page (Help in the top bar) |
| Help centre (HLP-01), knowledge-base articles, assistant "not yet on" | Helpdesk map | live (the Helpdesk map holds its rows) |
| Shortcut help ("press ?") | Overlays · Dialogs and sheets, `ShortcutHelp` / `useShortcutHelp` (kit) | **live** on every signed-in page (H-3, answer 951) |
| Table first-use empty state | Data · Table and filters | live (kit `DataTable`) |
| Notification centre and Approvals inbox empty | Overlays · Notifications and approvals | live |
| PLT-02 Role home · employee first login (tour) | Platform · Shell & homes, `RoleHomeScreen firstRun` | home is live; the first-run prompt is never turned on |
| PLT-08 Set-up hub (3 stories) | Platform · Set-up & administration, `SetupHubScreen` | live (H-6, Settings › Set-up hub); off the design-live guard list |
| PLT-09 Tenant wizard (5 stories) | same, `TenantWizardScreen` | not live (guard list) |
| PLT-39 Quick-start lane, PLT-40 Switch on, PLT-42 trial extension, PLT-43 trial read-only, PLT-50 What's new | Platform · Jobs, trial & account (`growth-screens.tsx`) | not live |
| PLT-47 Copilot action card; `AssistantPanel` (kit) | Platform; kit `notify.tsx` | used only in drawn screens (the drawn Help centre's "Ask the assistant" rail, send does nothing); the live Help centre (`LiveHelpCentre`) has no assistant |
| Service Desk getting started (set-up checklist, first-desk wizard) | `screens/desk/setup-start.tsx` (`SetupStart`) | in the kit; the live desk set-up page uses `DeskSetupScreen` |
| MOB-01 First run (11 + 6 stories) | Mobile shell / Mobile | phone views (app not built) |

## 5. What can be reused, and what is missing

Reuse (never a second version):

- **The live Help drawer** (`screens/desk/help.tsx` `HelpDrawer`, web `desk-help.tsx`): opened from every page, already
  knows the page (`screen`), suggests knowledge-base articles (`GET desk/my/kb/suggest`). The drawn tabs (this page,
  what's new, tours) belong inside it, not in a second drawer.
- **The knowledge base** (`service-desk/kb.service.ts`, HLP-04 editor, HLP-01 Help centre): page help topics can be
  knowledge-base articles tagged with the pages they explain; no separate help-topic store.
- **Kit states:** `EmptyState`, `NoAccessState`, `ErrorState`, `PageBanner` (system-wide states: trial, maintenance,
  read-only, impersonation), `DataTable` `filtered`, `ShortcutHelp` and `useShortcutHelp`, `AssistantPanel`.
- **The irreversible pattern:** the pay kit's `IrreversibleSheet` (live) and the kit `TypeToConfirmDialog` (live, in 8
  files); step-up `StepUpDialog` for sensitive changes.
- **Access requests:** Payroll reports' and Pay access's request and approve flow (`pay_access_requests`, the reports
  access request) as the pattern for a general one.
- **Settings registry** (`org-structure/settings-registry.ts`) for every new policy, with defaults and company scope.
- **The audit log, notifications and email templates** for requests, tours and what's new.

Second versions to retire when building (keep the live one):

| drawn here | already live or drawn elsewhere | keep |
|---|---|---|
| `HelpDrawer` (settings/help.tsx) | `HelpDrawer` (desk/help.tsx, live) | the live drawer, with the drawn tabs added |
| `IrreversibleActionDialog` | `IrreversibleSheet` (pay kit, live) | `IrreversibleSheet` (moved to the kit) |
| `BulkApproveConfirm` | the Approvals inbox's own confirmation (live) | the inbox one |
| `RoleEmptyState` | `EmptyState` (kit, live) | `EmptyState` with each page's words |
| `WhatsNewList` | `WhatsNewDrawer` / `WhatsNewSheet` (PLT-50, not live) | one of them (question 943) |
| `AvailabilityBanner` (read-only) | PLT-43 trial read-only banner (not live), kit `PageBanner` | `PageBanner` |

Missing (to build):

- Tours: tour definitions, a tour progress record per person and tour version, the events that start them, resume and
  replay in Help.
- What's new: entries (written by YukthiX), targeted by role and products switched on, read marks.
- A general access request (who to ask, reason, how long, approve or refuse, notify, audit).
- The not-found reference code (support can look it up).
- Maintenance, degraded and read-only states (a platform status the shell reads); module switches and release waves;
  sample data; the set-up hub (PLT-08) and company set-up wizard (PLT-09).
- Shortcut help mounted on every page.

## 6. Questions for the founder (before building)

941. **One Help drawer.** Two drawers are designed: the live one (known issues, raise a ticket, my tickets) and the drawn
     one (this page, what's new, tours). *Suggested: one drawer, the live one, with four tabs: This page, Ask (raise a
     ticket), What's new, Tours.*
942. **Where page help comes from.** *Suggested: knowledge-base articles tagged with the pages they explain (HR or desk
     admins write them; YukthiX ships starter articles); no separate help store. Company setting "Show page help" (on by
     default).*
943. **What's new.** Two designs exist (this group's list, Platform PLT-50 drawer and sheet). *Suggested: YukthiX writes the
     entries; each person sees only those for their role and the products their company uses; keep the PLT-50 design as the
     one version (it has the phone and role variants) and show it in the Help drawer's tab. Company setting "Show what's
     new" (on by default).*
944. **Tours.** *Suggested: the four drawn tours (employee, manager, payroll admin, HR and System Admin), at most 3 steps,
     shown once per tour version after its event, skip and resume from Help. Company setting "First-run tours" (on by
     default); each person can stop them.*
945. **Second versions.** *Suggested: keep the live parts and retire the drawn duplicates: `IrreversibleSheet` (moved to
     the kit, used for every irreversible action), the Approvals inbox's bulk confirmation, `EmptyState` with each page's
     words.*
946. **Request access.** *Suggested: on every "You don't have access" page, "Request access" with a reason and how long
     (up to 30 days), sent to the people who can grant that key; they approve or refuse; both audited. Company settings
     "Allow access requests" (on) and "Longest access" (30 days). Payroll's own request stays as it is.*
947. **Not found reference.** *Suggested: show a short reference on the Not found page that support can look up (never
     saying whether the record exists).*
948. **Maintenance, degraded and read-only.** *Suggested: later, with the platform console: YukthiX staff set maintenance
     windows (banner a day before, page during); a company whose subscription lapses goes read-only before deletion.
     Platform policy, not a company setting.*
949. **Module switches, waves and set-up needed.** *Suggested: later, with billing (PLT-40 Switch on); until then menus keep
     hiding areas by permission.*
950. **Sample data.** *Suggested: not now (the demo company covers it).*
951. **Shortcut help.** *Suggested: turn on the kit's "press ?" list on every page with the live shortcuts (Ctrl K, the go-to
     keys).*
952. **Set-up hub and company wizard.** *Suggested: the set-up hub (PLT-08) next, from what each area already knows is set up;
     the company wizard (PLT-09) after it, for new companies.*
953. **Phone views.** *Suggested: the 7 phone views wait for the mobile app; the web pages at phone width cover them.*

## 7. Build plan (slices, max 3 builders at once)

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| H-1 | One Help drawer: the live drawer gains the tabs This page (articles tagged with the page) and Ask; retire the drawn duplicates (answers 941, 942, 945) | desk `HelpDrawer`, KB, kit states | M | 3 days |
| H-2 | Request access and the Not found reference (946, 947) | `NoAccessState`, the pay access request flow, notifications, audit | S | 2 days |
| H-3 | Shortcut help on every page (951) | kit `ShortcutHelp` | S | 0.5 day |
| H-4 | What's new: entries, targeting, read marks, the Help tab and page (943) | PLT-50 design, notifications | S | 2 days |
| H-5 | Tours: definitions, progress per person and version, events, resume and replay (944) | `TourCard`, Help tab | M | 4 days |
| H-6 | Set-up hub (PLT-08) from each area's completeness (952) | settings registry, existing set-up pages | M | 4 days |
| H-7 | Later: company wizard (PLT-09), availability (948), module switches and waves (949), sample data (950) | platform console, billing | L | 2 to 3 weeks |

Order: H-1, H-2 and H-3 together (three builders), then H-4 and H-5, then H-6. H-7 waits for billing and the platform
console. Every slice draws any new state first, keeps RLS, adds positive and negative tests and an e2e suite.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every story of the
file has exactly one row, in file order, under the heading of its section comment (`/* 6.1 tours */` …), with one of the
six verdicts ("retired", with or without the answer that retired it, e.g. "retired (answer 943)", counts as retired). Copied from `visitors-design-map.md`; only the file and the grouping by section comment differ.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/help-onboarding-design-map.md and checks
// that every story of the Help and onboarding file has exactly one row, in file order. Reads the story file, not Storybook.
const fs = require('fs');
const UI = 'packages/yx-ui/src/';
const file = UI + 'screens/settings/help.stories.tsx';
// One group per section comment of the file: /* 6.1 tours */ … /* 6.6 empty states */.
const want = {};
const parts = fs.readFileSync(file, 'utf8').split(/^\/\* (6\.\d[^*]*?) \*\/$/m);
for (let i = 1; i < parts.length; i += 2) {
  // Capital first letter only: lower-case exports are sample props (excludeStories).
  want[parts[i].trim()] = [...parts[i + 1].matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/help-onboarding-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built', 'retired'];
// A drawn story an answer replaced: "retired" or "retired (answer 943)" both count as retired.
const verdict = (v) => (/^retired( \(answer \d+\))?$/.test(v) ? 'retired' : v);
// Self-check of the verdict rule before counting.
for (const [v, want] of [['retired', 'retired'], ['retired (answer 943)', 'retired'], ['retired early', 'retired early'], ['live', 'live']])
  if (verdict(v) !== want) throw new Error(`verdict rule: ${v} -> ${verdict(v)}`);
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 40), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story section: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = verdict(l.split('|')[2].trim()); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story section with no rows: ' + h);
const all = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) };
for (const c of Object.values(counts)) for (const k in all) all[k] += c[k];
counts['All A-E'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

Founder approved, 12 Nov 2026 (questions 941-953, all as suggested): one Help drawer (the live one) with This page, Ask,
What's new and Tours tabs; page help from tagged knowledge-base articles; what's new written by YukthiX (PLT-50 the one
version); four tours, at most 3 steps, once per version; retire the drawn duplicates; a general Request access (default on,
longest 30 days); a not-found reference; availability states and module switches later with the console and billing; no
sample data; "press ?" shortcut help on; the set-up hub next, the company wizard after; phone views wait for the mobile app.
Build H-1 to H-3 now, then H-4 to H-6; H-7 later.

## H-1 built (answers 941, 942, 945; 11 Nov 2026, branch `feat/yukthix-help-h1`)

- **One Help drawer** (941): the live drawer in `screens/desk/help.tsx` (Help in the top bar, every page) now has tabs:
  known issues stay on top; **This page**, **Ask** (raise a ticket and my open tickets; Raise ticket shows only here),
  **What's new** and **Tours**. What's new and Tours show only when their content is given: they are **hidden** in the
  app until H-4 and H-5 (the design allows it; the stories still draw them with sample content). The drawer opens on
  This page when the page has articles, otherwise on Ask.
- **This page** (942): help articles tagged with the page. An article gets "Show in Help on these pages" (app addresses
  such as /yx/time/leave, up to 20; the page and every page under it) in the knowledge-base editor (HLP-04, drawn first).
  `GET desk/my/kb/page?route=` returns the published articles the person may read (same reader rules as article
  suggestions), closest page first, then featured, at most 6. Record ids in the address are dropped before asking.
  Company setting `help.page_help` ("Show page help", on by default) on Desk set-up › Settings (the Service Desk owner,
  audited); off hides the tab. Migration `202617z0000012_help_h1` (`sd_kb_articles.pages`).
- **Second versions retired** (945): the drawn help drawer and its page topic body (`HelpTopicBody`), the drawn
  irreversible dialog (`IrreversibleActionDialog`), bulk confirmation (`BulkApproveConfirm`) and `RoleEmptyState` are
  removed from `screens/settings/help.tsx`; their stories now show the live parts (the one drawer, the pay kit's
  `IrreversibleSheet`, the Approvals inbox, the kit `EmptyState`).
- **Design-live guard:** `IrreversibleActionDialog`, `BulkApproveConfirm` and `RoleEmptyState` left the not-live list;
  `WhatsNewList` and `TourList` joined it. They were never live: the guard counted the drawn drawer as live because the
  live one has the same name. Net one shorter.
- **Tests:** kit (`help-h1.test.tsx`: tabs, empty and error, hidden tabs, the setting switch, the pages field) and web
  (`yx-desk-help-drawer.test.tsx`), positive and negative; e2e `service-desk-hlp04` (tagging, the page lookup, another
  company, the setting).

## Founder questions from H-1 (11 Nov 2026)

961. **Who writes page help.** Articles are written in the Service Desk knowledge base, so page help comes from desk
     authors. *Suggested: keep; HR's own help articles live in an HR desk's knowledge space.*
962. **Moving `IrreversibleSheet` into the kit.** It stays in the pay kit, used by Pay, Compliance and Expenses; the story
     imports it from there. *Suggested: move it to the shared kit in a small tidy-up when the next area needs it.*
963. **The guard's two new entries.** `WhatsNewList` and `TourList` are now listed as not live (they always were).
     *Suggested: accept; H-4 and H-5 take them off.*
964. **Articles in other languages.** "This page" lists the original articles; the Help centre opens them in the reader's
     language when a translation exists. *Suggested: keep.*

## H-3 built: shortcut help on every page (answer 951; 12 Nov 2026, branch `feat/yukthix-help-h3`)
- "?" opens Keyboard shortcuts on every page of the signed-in app (`apps/web/app/yx/(app)/layout.tsx`), never while typing
  in a field or with Ctrl, Alt or ⌘. It is the kit's dialog: focus moves into it, Esc closes it and focus returns.
- The list is only what works (drawn first in the kit, `SHORTCUT_GROUPS`; stories "Shortcut help · open" and "· without
  leave or expenses"): Ctrl K (⌘ K) search, N L apply for leave and N E claim an expense (only for people who have those
  actions, from the palette's own shortcuts), ? and Esc; in lists, after moving to a row, J / K or the arrows, Enter, and
  Space or X to tick. The drawn A / R approve, G P / G T / G Y go-to, "/" and Ctrl J were never built and are removed.
- Tests: kit (opens on ?, not while typing or with Ctrl; focus in and Esc closes; no unbuilt shortcut; N L / N E only for
  those who have them). Manual test MT-HLP-951.
## Founder questions from H-3 (12 Nov 2026)
981. **Go-to keys.** The design's G P / G T / G Y (go to People, Time, Pay) were never built, so the list leaves them out.
     *Suggested: do not build them; Ctrl K already finds every page.*
982. **Shortcut help outside the app.** "?" works on the signed-in app only, not on the careers site, the client or vendor
     portals, the kiosk or the public help centre. *Suggested: keep (those pages have no shortcuts to list).*
Founder approved, 12 Nov 2026 (questions 981-982, as suggested): no go-to keys (Ctrl K finds every page); "?" only in the signed-in app.
## H-4 built: What's new (answer 943; 12 Nov 2026, branch `feat/yukthix-help-h4`)
- **Entries (platform data):** `whats_new_entries` (migration `202617z0000031_help_whats_new`): title, text, products,
  who it is for (everyone, employees, managers, HR, payroll, System Admins), publish date; withdrawn, never deleted. No
  company column: every signed-in session may read; only the platform (super-admin) context may insert or update (RLS
  policies), and the runtime role cannot delete. Read marks: `whats_new_reads` (forced RLS).
- **Console › What's new** (`/staff/whats-new`, key `platform.news.manage`, YukthiX staff with their security key):
  list (Published / Planned / Withdrawn), New entry, Change entry (version-checked), Withdraw (confirmed, final). Every
  change is in the platform audit log in plain words. Stories "What's new · entries / new entry / none yet".
- **People:** `GET /help/whats-new`, `POST /help/whats-new/read`: the published entries for their audiences (worked out
  from facts and keys: an employee record, direct reports, HR keys, payroll keys, System Admin) and their company's
  products, newest 50, unread marked; Mark all read. 403 while acting for someone. The PLT-50 list is the one design:
  `WhatsNewPanel` (stories "PLT-50 · What's new · Help tab"), exported from `@yukthix/ui/desk`; web hook
  `useWhatsNew(open)` in `apps/web/lib/yx-whats-new.ts` (null when the company turned it off; `unread` for a count).
- **Help drawer:** one optional `whatsNew` slot on `HelpDrawer` (shown as a "What's new" section, story "Help drawer ·
  What's new (H-4)"); H-1 moves it into the drawer's What's new tab.
- **Setting:** Settings › Organisation › Help: "Help: show What's new" (`help.whats_new.show`, default on).
- Tests: kit (console inputs, add with field errors and focus, change with version, withdraw confirmed, no key no
  actions, audit words; panel unread, mark all read, empty, error, failure); e2e `help-whats-new` (staff only, field
  checks, audit, role and product targeting, another company, per-person read marks, RLS: a company cannot write
  entries or see another's marks, version conflict, withdraw final, setting off, 403 while acting). Manual tests
  MT-HLP-943a (console) and MT-HLP-943b (people).
## Founder questions from H-4 (12 Nov 2026)
991. **"See all updates".** The drawn drawer links to a page of all updates; the tab already lists the person's latest 50.
     *Suggested: no separate page.*
992. **When an entry counts as read.** Only Mark all read marks entries read; opening the tab does not. *Suggested: keep
     (people decide), with a dot on Help while something is unread (with H-1).*
993. **Who counts as HR, payroll and System Admin.** HR: holds leave settings or onboarding keys; payroll: prepares pay
     runs; System Admin: the role. A System Admin also sees HR and payroll entries (they hold those keys).
     *Suggested: keep.*
994. **A new company's backlog.** A company that joins today sees every published entry for its products (latest 50).
     *Suggested: show only entries from the last 6 months.*
Founder approved, 12 Nov 2026 (questions 961-964 and 991-994, all as suggested): (961) HR or the help-desk team writes page
help as tagged articles, YukthiX starter articles later; (962) move IrreversibleSheet into the shared kit; (963) accept the
two honest guard entries; (964) "This page" shows the article in the person's language when a translation exists; (991) no
separate updates page; (992) keep "Mark all read" and add an unread dot on Help; keep 993; (994) show only the last 6 months
of what's new to a new company.
## H-2 as built (answers 946, 947; 11 Nov 2026)
- **Request access (946).** Every live "You don't have access" page (the kit's `NoAccessState`, 125 places) offers
  Request access when the company allows it: the app frame provides it, so no page changed. The person gives a reason
  (10 to 500 characters) and how long (1 day up to Longest access). One open request per person and page. Never while
  acting for someone or in a YukthiX support session (403).
- **Who decides.** Whoever can grant access (`access.role.manage`: the System Admins), in Settings › Roles & access ›
  Requests, and in their Approvals inbox and bell. Approve opens Give access for the person who asked, with the last day
  set from the request; it must end within Longest access. Every Give access rule applies: a Confidential role waits for a
  second admin who neither gave nor receives it, a grant over many people asks for the risk confirmation. Refuse needs a
  reason the person reads. Nobody decides their own request (also a database check). The grant ends by itself on its last
  day; the person's page then says it ended and they can ask again.
- **Settings.** Settings › Access and privacy › Access requests: "Allow access requests" (on) and "Longest access"
  (30 days), both System Admin settings. Payroll's own request (Team pay access) is unchanged.
- **Audit.** `access.request.sent`, `access.request.approved` (with the grant), `access.request.refused`, and the grant's
  own `access.grant.created` / approvals.
- **Not found reference (947).** Every 404 the API sends to a signed-in person of a company carries `reference`
  (`NF-` and 6 letters or digits, no 0, O, 1 or I). It is saved in that person's company with only who, when and the
  address they asked for (no query), so a missing record and another company's record give the same answer. Record
  pages show it under their own "Not found"; the web's own Not found page asks for one. Helpdesk agents and System Admins
  look one up in Helpdesk › Tickets › Look up a reference (another company's reference is "not found").
- **Tables.** `access_requests` and `not_found_refs`, both with forced row-level security; neither can be deleted by the
  app. Tests: kit (Request access, Roles & access requests, the lookup, the reference), web (the reference store, the Not
  found page), and the e2e suite `help-h2` (16 tests, positive and negative).
### Questions (from 971)
971. **Who decides a request.** *Suggested: the System Admins, as built. The drawing says "the owner of that area" (for
     example the Payroll Manager) with the System Admin after 2 working days; pages do not know an area owner yet. Later,
     each area could name who decides its requests.*
972. **Which role.** *Suggested: the admin picks the role on approval, as built (the page does not say which permission it
     needs). Later, pages could name their permission so the smallest role is picked first.*
973. **A reminder.** *Suggested: remind the System Admins once if a request waits 2 working days (not built).*
974. **Keeping references.** *Suggested: delete Not found references after 90 days, with the platform log retention (they
     are kept for now).*
975. **YukthiX support.** *Suggested: YukthiX staff look up a reference inside the company's support session, as built; a
     look-up across companies waits for the platform console.*

## H-6 as built (answer 952; 11 Nov 2026)

- **Settings › Set-up hub** (`/yx/settings/setup-hub`, first in Settings › Organisation) is the designed `SetupHubScreen`
  with live data from `GET help/setup-hub`. Only people with Company rules (`org.settings.manage`: HR set-up and System
  Admins) see it; everyone else, and anyone acting for someone without that key, is refused. Each company reads only its
  own records (forced RLS).
- **Areas and checks**, all from what the areas already hold; nothing new is asked:
  - Organisation: legal entities, locations, structure (departments, designations, employment types) - blocking; company
    rules reviewed - starter.
  - People: employees added - blocking; a manager for everyone but the top person; letter templates (starter); employee
    record rules reviewed (starter).
  - Roles & access: a second System Admin; roles; access and privacy rules reviewed (starter).
  - Time & Leave: leave types, leave policies, holiday calendars - blocking; shifts; attendance rules reviewed (starter).
  - Payroll: pay groups, salary components, salary templates - blocking; payroll rules reviewed (starter). Only whether
    pay set-up rows exist is read, server-side, past the pay guard; no pay data leaves it.
  - "Reviewed" means the company has saved at least one company rule of that area (the settings registry); until then its
    rules are YukthiX starter defaults and count in "Starter templates to review".
- **Each check** has Start / Continue opening its set-up page. The design's Go live, Sign off and Skip stay in the stories
  only (no go-live or sign-off exists; answer 952 asks nothing new).
- **Settings** (Company rules › Set-up hub): "Set-up hub shows Time & Leave" and "Set-up hub shows Payroll" (both shown), so a
  company that does not use an area in YukthiX can still reach complete.
- **Tour anchors** for the HR / System Admin first-run tour (6.1 TourAdmin, H-5): `data-tour="setup-hub"` (the page),
  `setup-modules` (the area cards) and `setup-starter` (the starter count).
- **Tests:** kit (`setup-hub.test.tsx`, 4), web nav, and the e2e suite `help-h6` (5 tests: refused roles, a new company,
  checks turning done, company isolation, hidden areas).

### Questions (from 1011)

1011. **Go-live and sign-off.** *Suggested: leave them out until the company wizard (PLT-09, H-7) brings a go-live date; the
      hub stays a progress view.*
1012. **What blocks.** *Suggested: keep blocking fixed as built (an area cannot work without them); make it a setting only if
      a customer asks.*
1013. **More areas.** *Suggested: add Hiring, Performance and Helpdesk cards when their set-up pages report completeness;
      today they would have one weak check each.*
1014. **"Reviewed" rules.** *Suggested: one saved rule marks an area's rules as reviewed, as built; a per-rule "confirmed"
      mark would ask HR something new, which 952 rules out.*

## H-1 with H-4 merged, and answers 962, 964, 992 built (12 Nov 2026, branch `feat/yukthix-help-h1`)
- **What's new in its tab:** H-4's `WhatsNewPanel` (PLT-50) is the content of the drawer's What's new tab; the tab shows
  only when the person has entries (none, or What's new off: no tab). H-4's temporary section and its separate slot are
  gone: `whatsNew` is the tab's one way in. The drawn `WhatsNewList` (and its sample `NEWS`, `newsFor`) is retired; the
  6.2 stories show `WhatsNewPanel`, so it left the design-live guard's not-live list.
- **Tours** stays a plain `tours` slot (any content), hidden until H-5 passes its panel in.
- **962:** `IrreversibleSheet` (and `confirmPhraseMatches`) moved from the pay kit to the shared kit
  (`components/irreversible.tsx` and `.css`, exported from `@yukthix/ui`); Pay runs, payroll records, consultants,
  payments, Compliance and Expenses import it from there. Same behaviour; only its class names lost the `yx-pay-` prefix.
- **964:** "This page" asks with the person's language: the browser's first language the help centre offers (en, hi, ta,
  te). Each listed article is swapped for its published translation in that language when there is one (a draft
  translation is not); otherwise the original shows. `GET desk/my/kb/page?route=&lang=` (other languages: 400).
- **992:** a dot on Help in the top bar while What's new has unread entries (`TopBar helpUnread`, story "Top bar · Help
  with something new in What's new"); the button's name says "Help, new in What's new". Gone after Mark all read; never in
  a support session.
- Tests: kit (dot and no dot; the moved sheet from the kit root, typed phrase), web (lang asked or not; What's new tab
  shown or hidden), e2e `service-desk-hlp04` (translation shown once published; English, Hindi without a translation, and
  a draft show the original; unknown language 400). Manual tests MT-HLP-H1-04 and MT-HLP-H1-05.

## Founder approved (11 Nov 2026, "ok for all")
- 971 to 975 (H-2): System Admins decide requests, as built; the page does not name its permission; remind the System
  Admins once after 2 working days (to build); delete Not found references after 90 days (to build); YukthiX staff look
  up a reference inside the company's support session, as built, and a look-up across companies comes with the YukthiX
  staff console.
- 1001 to 1004 (H-5): the admin tour starts in Settings now and points at the Set-up hub as version 2 once H-6 is in
  (to build); the first-approval tour shows to anyone a request comes to; Esc counts as skipped; the phone tour waits
  for the mobile app.
- 1011 to 1014 (H-6): no go-live or sign-off on the hub until the company wizard (H-7); the checks are fixed; Hiring,
  Performance and Helpdesk cards come later; one saved rule marks an area's rules reviewed.

Founder approved, 12 Nov 2026 (questions 991-994, all as suggested): 991 and 993 stay as built; 992's dot on Help comes
with H-1; 994 built: people see entries published in the last 6 months only, still at most 50 (staff see all in the
console).

## H-5 built: first-run tours (answer 944; 12 Nov 2026, branch `feat/yukthix-help-h5`)
- **The four tours** (kit `TOURS`, at most 3 steps, version 1 each): employee (Home), first approval (Approvals),
  payroll run (Payroll › Runs), set up your company (Home). The words were redrawn so each step names only what works
  today: the admin tour no longer starts at the set-up hub (not built) and the employee tour no longer promises a
  location check (question 1001).
- **Events, worked out by the API:** employee: an employee record; first approval: a request has come to the person;
  payroll: a pay run exists and the person can see or prepare runs; admin: HR keys or System Admin. A tour applies only
  after its event; it floats once on its page (per tour version) and resumes at the step reached.
- **Progress per person:** `tour_progress` (migration `202617z0000041_help_tours`, forced RLS): in progress at a step,
  finished or skipped, per tour and version; a person can stop tours for themselves (Help › Tours › Stop tours) and
  start them again. `GET /help/tours`, `PUT /help/tours/:id`, `PUT /help/tours/stopped`; 403 while acting.
- **Accessible:** the tour is never modal and never a focus trap (Tab leaves it); focus moves into it when it appears and
  goes back where it was when it closes; Esc dismisses it (saved as skipped; replay from Help); it animates only when
  reduced motion is not asked for.
- **Web:** `TourHost` (`apps/web/lib/yx-tours.tsx`) in the app layout floats the tour; `useToursPanel()` fills H-1's
  Tours tab (`ToursPanel`; starting a tour closes Help). H-1's placeholder `TourList` is retired (one version). Kit `ToursPanel` (resume, replay, start, stop / start again), exported from `@yukthix/ui/desk`.
  Stories in `screens/settings/tours.stories.tsx` (the tour on its page, the Tours tab, stopped, none yet).
- **Setting:** Settings › Organisation › Help: "Help: first-run tours" (`help.tours.show`, default on).
- Tests: kit (four tours, ≤ 3 steps, no unbuilt page named; focus in, steps saved, Finish; Esc as skipped, not modal,
  Tab leaves; inline card ignores Esc; motion only without reduced motion; panel resume / replay / start, stop and start
  again, none, error, failed stop); web (which tour starts where, Esc saves skipped and gives focus back, Next saves the
  step, nothing on other pages, replay from Help, setting off); e2e `help-tours` (events: none, HR, payroll key without a
  run, first approval; per-person progress; version, step, status and owner checks; RLS; stop and start again; setting
  off; 403 while acting). Manual test MT-HLP-944.

- **Answer 1001 (built after H-6):** the admin tour is version 2 on Settings › Set-up hub: start at the hub, the starter
  templates to review, open an area (steps point at H-6's `data-tour` anchors `setup-hub`, `setup-starter`,
  `setup-modules`; the floating card outlines each and brings it into view, without motion when reduced motion is
  asked). It is for whoever can open the hub (`org.settings.manage`); someone who finished version 1 sees version 2
  once. Story "6.1 Tour · on its page (set up your company, set-up hub, step 2)"; kit, web and e2e tests.

## Founder questions from H-5 (12 Nov 2026)

1001. **Tour words changed from the drawing.** The admin tour now starts at Settings (the set-up hub is not built) and the
      employee tour no longer mentions a location check (it depends on the company's rule). *Suggested: when the set-up
      hub is built, point the admin tour at it as version 2 (everyone sees it once more).*
1002. **Who gets the first-approval tour.** Anyone a request comes to (an HR approver too), not only managers.
      *Suggested: keep.*
1003. **Esc.** Esc closes the tour and counts as skipped; Help › Tours replays it. *Suggested: keep.*
1004. **Tours on the phone.** The drawn employee tour is on the phone home; it waits for the mobile app. *Suggested: keep.*
1005. **HR without company settings.** The admin tour now lives on the set-up hub, which needs the company settings key;
      HR people without it get no admin tour (they still get the employee, approval or payroll tour when those apply).
      *Suggested: keep (the hub is the set-up person's page).*
## H-2b built: reminders and Not found retention (answers 973, 974; 12 Nov 2026, branch `feat/yukthix-help-h2b`)
- **973, the reminder.** An access request still waiting on the 2nd working day after the IST day it was sent reminds
  everyone who can grant access (`access.role.manage`, not the person who asked) once: a bell notice "… has waited 2
  working days for access to …" that opens Roles & access › Requests (and an email, by each person's own email choices),
  and in their Approvals inbox the request now has that day as its due date, so it shows overdue after it.
  Working days are Monday to Friday less the company's company-wide holiday calendar: the app keeps no company working
  week, so Saturday and Sunday are off for every company (question 1022). Hourly job `access-request-reminders`; each
  company is read and written in its own context; `reminded_at` is set in the statement that claims the reminder, so a
  rerun or a second server never sends it twice. A decided request is never reminded. Audit `access.request.reminded`.
- **974, retention.** Nightly job `not-found-retention` deletes Not found references older than the company's setting
  "Keep Not found references for (days)" (`help.not_found.keep_days`: 30, 60, 90, 180 or 365; 90 by default; System
  Admins; Settings › Access and privacy › Privacy), following the audit log's own retention setting. The app still may not
  delete them: only the database function `purge_not_found_refs` does, inside one company's context and never under 30
  days. Audit `help.not_found.purged` with the count. Migration `202617z0000041_help_h2b`.
- Tests: unit (`remindOn`: weekends, holidays, the IST day; the sweep registry), e2e `help-h2b` (not at 1 working day,
  at 2 once in bell and inbox, not the asker, never a decided request, never twice nor with two servers at once, holiday
  and weekend skipped, each company in its own run; references at 89 days kept and 91 deleted, another company untouched,
  the app cannot delete, 180-day company keeps them, only a System Admin sets it). Manual tests MT-HLP-973, MT-HLP-974.

### Questions from H-2b (from 1021)
1021. **Email too.** The reminder is a bell notice and also an email, by each System Admin's own email choices (as every
      system notice). *Suggested: keep.*
1022. **Six-day weeks.** Working days are Monday to Friday for every company; the app has no company working week yet.
      *Suggested: use the company's weekly offs once a company working week exists.*
1023. **Which holidays.** The company-wide holiday calendar (not each System Admin's location). *Suggested: keep.*
1024. **Only one reminder.** After the one reminder the request stays overdue in the inbox; there is no second nudge.
      *Suggested: keep (answer 973 says once).*

## Walk-through findings, founder approved (11 Nov 2026, "ok for all")
- 1031: the hub says "Set-up complete" and "Must be done first", not go-live (until the company wizard, H-7).
- 1032: an area shows "Done" only at 100%; below that "Nothing blocking" with its percentage.
- 1033: the hub fits 1278 x 635 without a page scroll (shorter area cards).
- 1034: one Not found reference per page visit, not one per failed background call.
- 1035: three demo help articles linked to Home, Leave and the set-up hub (demo data approved).
