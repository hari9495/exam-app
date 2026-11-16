# YukthiX build standard (every feature, every builder)

The founder's rule (29 Oct 2026): think through every rule before building, build it production-grade, test every positive and
negative path. Rework costs more than doing it right once. A builder follows every line below; "done" means all of it.

## 0. Founder rules from earlier (all still apply, with everything below)

1. **The live page IS the designed yx-ui screen with real data.** Never build a second, simpler copy. No UI without a design
   story. A story drawn from the live screen is not a design.
2. **Success after an action = toast (5 s).** Inline alert only when the message must stay. No "OK" pop-ups.
3. **Confirm buttons are never disabled.** Pressed too early, show a field error and focus the field.
4. **Pick-one choices use the joined Segment control,** never chips that look stackable.
5. **Clickable must look clickable:** border or fill, hover, pointer cursor, focus ring. Fix it in the shared component, plus a guard test.
6. **Spacing comes only from tokens; blocks never touch; edges line up.** Measure it by script in every drawer and dialog.
7. **No page scroll at 1278 x 635** (a laptop at 150 %) unless the content really needs more.
8. **Dates show as "3 Nov 2026"** (`formatDate`). A weekday is a separate small label.
9. **Every company policy choice has a default AND a per-company HR setting.** Never hard-code it.
10. **Security gold standard:** proven libraries, never hand-rolled crypto, auth or parsers; deny by default; RLS on every tenant
    table; validation at every boundary; rate limits; audit every security event; OWASP ASVS L2. Test every security rule,
    including negatives: wrong tenant, expired token, replay, brute force.
11. **Never edit an applied migration.** Add a new forward migration. Prove it with a fresh DB from zero plus `migrate status`.
12. **Plain simple English** in every label and message. Messages state the fact, then the next step.
13. **Every page has positive AND negative test steps** with real demo data, written into the tracker before a page can Pass.
14. **Suggest features, never add them silently.** Anything extra goes in the report as a question.
15. **Never put real credentials or TOTP secrets in code, chat or the repo.** Test sign-in uses emailed codes. Never sign in
    from the built-in browser pane.
16. **Never run the API in watch mode, and never use commands that wait for input.** Use one-shot `npx vitest run` / `tsc` / jest.
17. **Work only in your own worktree; never push or merge.** The lead copies work into the test app and checks it.
18. **Build only from the design-system kit** (founder, 30 Oct 2026): the Storybook groups Foundations, Actions, Inputs, Data,
    Data display, Overlays, Shell, Dashboards, Time and activity, Workflow, Builders, Surfaces. Use their components, tokens and
    formats (`formatINR`, `formatDate`); no raw `<button>`, `<input>`, `<select>`, `<table>` or hand-made styles in a screen. A
    need the kit doesn't cover goes INTO the kit first (component + story + test), then the screen uses it. Copying a kit part
    into a screen is a mismatch and fails review. The kit guard test lists the few allowed exceptions, each with its reason.

## 1. Before writing code: write the feature sheet (in the PR / commit notes and the area's design map)

1. **Design first.** List the Storybook design group(s) and every sub-page (story) the feature makes live. The live page renders
   the DESIGNED component with a `live` prop. A story drawn from a live screen is never a design. No UI without a design story;
   if a needed state has no story, add it to the design file in the same style first.
2. **Rules.** Write down every business rule and its source:
   - Indian law: state-wise where it differs.
   - Company policy: a setting with a default and a per-company HR override, never hard-coded.
   - Defaults: what the product decides.

   Cover limits, rounding, time zones (IST and the location's zone), dates (leave year, financial year, cut-offs), holidays,
   weekly offs, half days, part-time staff, joiners and leavers mid-period, transfers, rehires, people on notice, and people on long leave.
3. **Who.** For each action, list who may do it: employee, manager, HR, scoped HR (entity/location), payroll, admin, and anyone acting on someone's
   behalf. Say what each of them sees (own / team / scope / company), and who is refused.
4. **States.** List the states: empty, loading, error, first use, not set up, locked/frozen, too early, over the limit, already
   done, someone else did it first, offline/retry.
5. **Edge cases.** Cover concurrency (two people at once), repeats (double click, retry, the same file twice), very large lists
   (pagination, 10k rows), and bad input.

## 2. Build

- **Data**
  - Tenant isolation with RLS on every new table; scope checks on the server, never in the UI only.
  - Writes in transactions; idempotency keys on create/submit; optimistic concurrency where two people edit.
  - Every change is audit-logged: who, when, before → after, reason.
  - Migrations: add a new forward migration; never edit an applied one. Prove it with a fresh DB from zero plus `migrate status`.
- **API**
  - Validate every input (class-validator/zod).
  - Clear refusal messages in plain English.
  - Correct status codes (400 bad input, 403 not allowed, 404 not yours or not found, 409 conflict, 429 with retryAfterSeconds).
  - Rate limits on public and costly routes.
  - Use proven libraries; never hand-roll crypto, auth or parsers.
- **External providers** (maps, face match, holiday feeds, calendars, SMS, bank checks): put each behind an adapter, with a
  `dev-fake` for local use, and record it in the area map as "provider: to decide". Never block a feature on picking a provider.
- **Jobs:** safe to re-run, with locks so two servers never do the same work, and visible status and failure messages.
- **UI house rules**
  - Toast for done (5 s); an inline alert only when the message must stay.
  - Confirm buttons are never disabled: pressed too early, they show a field error and focus the field. Busy shows `loading`.
  - Pick-one choices use Segment.
  - Dates look like "3 Nov 2026" (`formatDate`). A weekday is a separate small label.
  - Spacing only from tokens; blocks never touch.
  - Everything clickable looks clickable.
  - A page fits 1278 x 635 without page scroll unless the content needs more.
  - Plain simple English.
  - Accessible: labels, focus order, keyboard use, screen-reader names, contrast.

## 3. Test (the builder runs all of this; the lead re-runs it)

- **Unit:** every rule and every calculation, with boundary values: zero, the limit, limit + 1, the last day, a leap year, half days.
- **API e2e:** for every action, the positive path, plus the negatives:
  - the wrong role
  - another company
  - out of scope
  - bad input
  - a repeat
  - a conflict
  - a locked period
  - acting on someone's behalf

  Run the e2e for real. If the worktree has no `apps/api/.env`, copy it from `C:\D-drive\exam-app-org\apps\api\.env`.
- **UI:** each sub-page's state renders. Pressed-too-early errors and focus work. Toasts appear.
- **Guards:** design-live-guard, design-guard and ui-rules-guard pass. Lists in `design-live-guard.known.json` only shrink.
- **Typecheck** yx-ui, apps/web and apps/api.
- **Manual P/N steps:** write numbered positive and negative steps with real demo data (check the demo DB) into
  `C:\D-drive\exam-app-ws\docs\yukthix\tracker\manual-tests.json` for each page.

## 4. Report

Report in plain English:
- What is live, as design groups and sub-pages: live / phone view / gap with its reason.
- Rules implemented, and the settings with their defaults.
- API routes and their permission checks.
- Migrations.
- Tests run, with counts.
- Anything not run, and why.
- Product questions: make a sensible default choice, mark it, and keep going.
