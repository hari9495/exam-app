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
| A. Tours, help and what's new (6.1, 6.2) | 2 | 1 | 0 | 0 | 7 | 3 | 11 |
| B. Access and not found (6.3) | 1 | 0 | 2 | 0 | 2 | 2 | 6 |
| C. Irreversible actions (6.4) | 1 | 5 | 0 | 0 | 0 | 0 | 5 |
| D. Availability (6.5) | 1 | 0 | 1 | 0 | 7 | 1 | 9 |
| E. Empty states (6.6) | 1 | 1 | 7 | 0 | 1 | 1 | 10 |
| **All A-E** | **6** | **7** | **10** | **0** | **17** | **7** | **41** |
Recounted by script 11 Nov 2026 on `feat/yukthix-help-h1` after H-1: the one Help drawer (This page live), the irreversible and bulk-approve stories show the live parts.

Counted by script 11 Nov 2026 on `docs/yukthix-help-onboarding-map` (the script is in the appendix): the 41 stories
under Screens/Help and onboarding/Patterns (one file, grouped by its section comments 6.1 … 6.6). The 7 phone views need
the phone app, which is not built.

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
| TourManager · 6.1 Tour · manager first approval | design only, feature not built | no tour progress, no events, no `TourCard` mounted; the live Approvals inbox has no first-time prompt |
| TourPayroll · 6.1 Tour · payroll admin first run | design only, feature not built | as above, on the payroll run page |
| TourAdmin · 6.1 Tour · HR / System Admin first sign-in | design only, feature not built | drawn on the set-up hub (PLT-08), which is not live either; the live home (`RoleHomeScreen`) has a drawn `firstRun` tour prompt the web page never turns on |

#### 6.2 help drawer and what's new

| story (sub-page) | verdict | note |
|---|---|---|
| HelpDrawerPage · 6.2 Help drawer · this page (TIM-18 apply leave) | live | H-1 (11 Nov 2026): the one Help drawer (`screens/desk/help.tsx`, every page) opens on This page with the help articles tagged with the page (`GET desk/my/kb/page?route=`, answer 942), behind "Show page help" (on); the drawn topic body (steps, fields, glossary) is retired: page help is the articles |
| HelpDrawerNews · 6.2 Help drawer · what's new | design only, feature not built | H-1: the drawer shows the What's new tab only when given its content; hidden in the app until H-4 |
| HelpDrawerNewsEmpty · 6.2 Help drawer · what's new, nothing yet | design only, feature not built | as above |
| HelpDrawerTours · 6.2 Help drawer · tours (resume, replay) | design only, feature not built | H-1: the Tours tab (`TourList`) is hidden in the app until H-5 |
| HelpPhone · 6.2 Help · phone (bottom sheet content) | phone view, mobile app not built | the drawer’s This page content (`PageHelp`) in a bottom sheet |
| WhatsNewManager · 6.2 What's new · manager | design only, feature not built | a second what's-new design exists in Platform (PLT-50, `WhatsNewDrawer`, `WhatsNewSheet`), not live either; question 943 |

### B. Access and not found (6.3)

#### 6.3 permission

| story (sub-page) | verdict | note |
|---|---|---|
| AccessDenied · 6.3 Access denied · with Request access | live (gap) | live pages show the kit's `NoAccessState` (who to ask), in 77 files; the drawn `AccessDeniedState` with Request access is not used; question 946 |
| AccessRequestForm · 6.3 Request access · form | design only, feature not built | no general access request; only Payroll reports (`POST payroll/reports/access-request`), Pay access and the support console have one each |
| AccessRequestSent · 6.3 Request access · sent | design only, feature not built | as above |
| AccessDeniedPhone · 6.3 Access denied · phone | phone view, mobile app not built | |
| NotFound · 6.3 Not found (missing or restricted, identical) | live (gap) | the API answers 404 for missing and other-company records alike; pages show their own `EmptyState` "Not found", without the drawn reference code (`NotFoundState`); question 947 |
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
| Shortcut help ("press ?") | Overlays · Dialogs and sheets, `ShortcutHelp` / `useShortcutHelp` (kit) | not mounted in the app (Ctrl K is live) |
| Table first-use empty state | Data · Table and filters | live (kit `DataTable`) |
| Notification centre and Approvals inbox empty | Overlays · Notifications and approvals | live |
| PLT-02 Role home · employee first login (tour) | Platform · Shell & homes, `RoleHomeScreen firstRun` | home is live; the first-run prompt is never turned on |
| PLT-08 Set-up hub (3 stories) | Platform · Set-up & administration, `SetupHubScreen` | not live (design-live guard list) |
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
five verdicts. Copied from `visitors-design-map.md`; only the file and the grouping by section comment differ.

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
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 40), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story section: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
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

