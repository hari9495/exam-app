# Screens brief — build every product screen (read fully before coding)

You build **product screens** for YukthiX from the screen catalogue, using the finished component library in this package
(`C:\Users\HariSivaSaiKumarMada\Downloads\YukthiX HR Product Design 1\yukthix-ui`). Other builders work in parallel on other areas.

**Also read `BUILD-BRIEF.md` in this folder — every rule there applies** (tokens only, banned list, button rules, accessibility, formats, writing, no new packages, don't edit shared files, deterministic data, tests, checks).

## Sources (read in this order)
1. `..\YukthiX\design\APX-D-screens-navigation.md` — §2 rows for YOUR screen IDs (columns: #, Screen, Tmpl, Doc, Personas, Wave, Where). Also §1 navigation (panel links per area), §4 (T9 portal shell), §5 (mobile tab map), §6 (help, empty, permission, irreversible-action patterns).
2. The owning design docs named in each row's **Doc** column (in `..\YukthiX\design\`) — read the sections that define the fields, rules, states and actions for your screens. Screens must show the real fields and rules, not generic filler.
3. `..\YukthiX\reference\frappe-hrms-functional-spec\99-ui-design-brief.md` — templates T1–T9 and principles (visual rules in `..\YukthiX\brand\DESIGN-SYSTEM.md` win where they differ).
4. `src/screens/_kit/frames.tsx` and `src/screens/_kit/data.ts` (shared frames and fictional data), and the component library in `src/components/` (see BUILD-BRIEF.md list; also shell, overlay, notify, charts, dashboard, calendar, roster, timeline, stepper, kanban, orgchart, document, condition, editor, builder, exam, careers, print).
5. Quality bar: `src/stories/table.stories.tsx`, `src/stories/timesheet.stories.tsx`, `src/stories/dashboard.stories.tsx`.

## What to build
- **Every screen ID assigned to you.** Nothing skipped. If a row lists several things ("Leave home (role-based)", "Roster (drag, copy week, swap, conflicts, publish)"), every listed thing must appear.
- Each screen is a real React component in `src/screens/<your-area>/` (props-driven, sample data passed in from the story, no fetches), named for what it is (`TodayBoardScreen`, `ApplyLeaveSheet`) with a `// TIM-01` style comment linking the ID.
- **Frames by the Where column:** `D` → `DesktopFrame` (area + panel links from APX-D §1 for your area, current page active) · `M` → `PhoneFrame` with `globals: { viewport: { value: 'mobile2', isRotated: false } }` · `D+M` → BOTH a desktop story and a phone story · `K` → `KioskFrame` · T9 portals → `PortalFrame` · YukthiX console → `ConsoleFrame`. Record panels (T3 panel) and request sheets (T4) open as a Drawer (or BottomSheet on phone) over the relevant list/page.
- **Templates:** T1 home (widgets, Needs your action first) · T2 list (PageHeader + DataTable + FilterBar + saved views + bulk + row click → drawer) · T3 record workspace (ObjectHeader + Tabs + right activity panel) · T4 request sheet (form with live effect summary, submit/cancel) · T5 wizard (Stepper) · T6 board / calendar / grid · T7 report (filters, table, chart, export, "View as table") · T8 mobile · T9 external portal.
- **States per screen:** the default state with realistic data, plus every state the row or doc names (e.g. blocked reason, locked, over limit, pending approval), plus empty / loading / error for lists and boards, and the persona variants the row lists (Emp / Mgr / HR see different data and actions). Aim for 2–5 stories per screen ID.
- **Missing building blocks:** if a screen needs a reusable piece the library lacks (clock-in card, geofence map, webcam check, live proctor tile, salary slip breakdown…), build it in `src/screens/<your-area>/<area>-kit.tsx` + `.css`, token-only, reusable, with its own stories. Don't duplicate existing components.
- **No external resources:** maps are simple SVG drawings (grid, pins, geofence circle, labelled "Map preview"); cameras are placeholder frames (SVG silhouette + state text); PDFs/images via inline data URIs.
- **Fixed time:** use `TODAY` from `_kit/data.ts` (Tue 29 Sep 2026, 9:42 am). Never `new Date()` or `Math.random()` in render.
- **Fictional names only** (the check fails on real companies). Company: Kaveri Foods Pvt Ltd (plus fictional clients/vendors you invent).

## Files you own
Only `src/screens/<your-area>/**` (create the folder; split into several files by sub-area, each under ~1,500 lines). Stories: `src/screens/<your-area>/*.stories.tsx`, title `Screens/<Area name>/<ID> · <short screen name>` (and `… · phone`, `… · empty` etc. as story names). CSS: `src/screens/<your-area>/*.css`, imported by your screen files. Tests: `src/screens/<your-area>/<area>.test.tsx`.
Do not edit anything else. Exception only if your assignment explicitly names another file.

## Checks before you finish (from the package folder)
- `npx tsc --noEmit` (fix errors in your files; ignore other builders' in-progress files and say so)
- `npx vitest run src/screens/<your-area>` — tests for real logic and key flows (calculations, validation, blocking rules, state changes)
- `node scripts/check-tokens.mjs` — fix every line naming your files (tokens, banned patterns, real names)
Do NOT start or navigate Storybook or the browser pane — the lead checks every screen visually.
**Write files as you go** (after each screen group) so an interruption loses little.

## Report (final message)
- A table: screen ID → story names (every assigned ID must appear; none may be missing).
- New kit components with exports.
- Test count, check results.
- Any assumption; any ID you could not fully build and exactly what is missing.
