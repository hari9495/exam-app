# SH · YukthiX Sheets · Build design

> **Status:** 📝 Draft for the founder, 13 Oct 2026. The founder decided on 13 Oct 2026 to build a web spreadsheet as the first non-HR app of the YukthiX ecosystem. This doc compares the engine options, sets the v1 scope, describes the architecture and security, splits the work into PR-sized slices, and lists the decisions the founder must take (§16). Nothing here is built yet.
> **Scope:** workbooks and sheets, formulas, formatting, charts, filter and sort, freeze, comments, version history, sharing through our permissions, real-time co-editing, XLSX and CSV import and export, templates, mobile view, and the YukthiX differentiators: live HR, payroll and expense data that respects each viewer's permissions, audit of sensitive views and exports, and data residency.
> **Order:** a one-week spike (**SH-0**), then seven batches **SH-1 → SH-7**. SH-1–SH-3 give a useful single-user product with sharing and files. SH-4 adds co-editing. SH-5 adds charts and the mobile view. SH-6 adds the YukthiX data connectors. SH-7 ships it as a separate product.
> **Builds on:** P01 tenancy and people, P02 access and field classes, P04 notifications, P08 audit, P09 metric layer and small-group suppression, P10 AI rules and connectors, P11 API, P12 login and MFA, P14 products and billing, P21 regions and residency, G1 translations, the shared file store with virus scan (`common/scanner.ts`).
> **Clean-room:** written in our own words. Engine facts come from each project's public docs and, for GridCraft, from reading its source as data (never built or run). No Microsoft, Google or Zoho screens, text, icons or sample files are copied. The UI follows our own design system (`brand/DESIGN-SYSTEM.md`), not any vendor's ribbon.

---

## 1. How to read this doc

- **Section 2** compares the spreadsheet engines and recommends one, with a fallback.
- **Section 3** is the v1 scope and what comes later.
- **Sections 4–9** are the architecture: where it lives, storage, co-editing, permissions, connectors, reuse.
- **Section 10** is how it ships as its own product and inside the suite.
- **Section 11** is security.
- **Sections 12–14** are permissions, API and screens.
- **Section 15** is the build order with tests and an effort estimate.
- **Section 16** holds the decisions for the founder, each with a recommended default.

Words used here:
- **Engine:** the code that holds cells, calculates formulas and draws the grid in the browser.
- **Workbook:** one spreadsheet file. It has one or more **sheets**.
- **Mutation (op):** one small, saved change, for example "set B2:C4 to these values" or "insert 3 rows at row 10".
- **Snapshot:** the full workbook state at one revision.
- **Revision:** a number that goes up by one with every accepted op.
- **Connector block:** a range filled with live YukthiX data (for example a headcount list). It stores the question, not the answer.
- **Viewer:** the signed-in person looking at a workbook right now.

---

## 2. Engine options

### 2.1 What we looked at

| Option | Language | Licence | What it is |
|---|---|---|---|
| **Univer (open-source core)** | TypeScript | Apache-2.0 | A full spreadsheet framework for the browser and Node: canvas grid, formula engine, plugins, commands and mutations, a "Facade" API. About 22.6k GitHub stars, very active. |
| **Univer Pro** | TypeScript (+ server) | Commercial | Paid add-ons on top of the core: co-editing server and SDK, edit history, XLSX import / export, print, charts, pivots, sparklines, a faster "advanced formula" engine. Free to try with limits (§2.3). |
| **GridCraft** (founder supplied) | Rust → WebAssembly | MIT **or** Apache-2.0 | An Excel-style desktop and web app by the ArtCraft team. Engine crates (`core`, `formula`, `functions`, `calc`, `model`, `xlsx`) plus an egui UI. Alpha. |
| **IronCalc** | Rust → WebAssembly | MIT or Apache-2.0 | A headless engine with an XLSX reader and writer, and a small web UI. Self-described "work in progress". About 4.2k stars. |
| **FortuneSheet** | TypeScript / React | MIT | A React rewrite of the older Luckysheet. Has an op stream for co-editing. No charts or pivots yet; APIs "may change before 1.0". About 3.7k stars. |
| **HyperFormula** | TypeScript | GPLv3 or commercial | A headless formula engine (400+ functions) from the Handsontable team. No grid. |
| **Office document servers** (ONLYOFFICE, Collabora) | C++ / JS | AGPL-3.0 (or commercial) | A whole office suite run as a separate server, embedded in an iframe. |
| **Build our own** | TypeScript | Ours | Write the grid, formula engine and XLSX code ourselves. |

### 2.2 Comparison

Ratings: ●●● strong · ●● usable · ● weak · ○ missing. "Pro" means only in the paid Univer Pro.

| Criterion | Univer core (OSS) | Univer + Pro | GridCraft | IronCalc | FortuneSheet | HyperFormula | Build our own |
|---|---|---|---|---|---|---|---|
| Formula coverage and correctness | ●●● (hundreds of functions, dependency graph, web-worker calc, LET / LAMBDA per its docs; exact count to be measured in SH-0) | ●●● + faster engine | ●●● (claims 513 of 523 Excel functions, dynamic arrays, LAMBDA; open correctness bugs listed in its `docs/gaps.md` #6) | ●● | ●● (forked parser) | ●●● (400+) | ● for 1–2 years |
| XLSX import / export | ○ in OSS | ●●● (server-side converter) | ●●● best of the open ones (styles, CF, tables, charts, pivots round-trip; "not proven in Excel" yet) | ●● | ● (separate plugin) | ○ | ● |
| Charts and pivots | ○ (Pro) | ●●● | ●●● charts and pivots | ○ | ○ | ○ | ○ |
| Large sheets | ●● (canvas, virtual rendering, worker calc) | ●●● | ●● (copy-on-write store; single-threaded calc; ~100 MB files fail, gap #2) | ●● | ● (DOM-heavy) | ●● | ? |
| Co-editing | ●● building blocks: every change is a JSON mutation we can send and replay; no transform server | ●●● OT server / SDK | ○ (gap #16, "needs the owner") | ○ | ●● op stream, demo server only | ○ | ○ |
| Web bundle | ●● modular (plugin mode trims it; measure in SH-0) | ●● | ● (whole app in one WASM file, runs its own UI on a canvas) | ●● | ●● | ●●● | — |
| Fit with our TypeScript / React stack | ●●● same language, React-friendly, Node headless runtime | ●●● | ● Rust; its web build is a complete app, not a component; no JS API to embed | ●● (WASM bindings) | ●●● | ●●● | ●●● |
| Licence | ●●● Apache-2.0 (patent grant; trademark not granted) | Commercial terms, price on request | ●●● pick Apache-2.0 for the patent grant; ArtCraft marks excluded | ●●● | ●● MIT (no patent grant) | ● GPLv3 forces our front-end code open, else buy | ●●● |
| Maintenance and maturity | ●●● company-backed, years of releases, large community | ●●● | ● first commits about 6 Oct 2026, 9 contributors, written largely by AI agents, alpha (~50% "ready for real work" by its own estimate) | ●● small team | ●● slow, pre-1.0 | ●●● | Our own load |
| Security | ●● pure client code, no macros or scripts in the core; we must harden import ourselves | ●● | ●●● careful parser limits (512 MB part cap, entry cap, DOCTYPE refused in ODS), `unsafe` forbidden, `WEBSERVICE` / `FILTERXML` return errors, no external fetch | ●● | ●● | ●●● | ●●● |
| Long-term risk | Low–medium: the open / paid line could move; core is Apache so we can fork | Medium: price and terms set by one vendor | High today: very young, may change fast or stop | Medium | Medium–high | Licence risk | High cost risk |
| Accessibility | ●● (canvas grid; we add a screen-reader layer) | ●● | ● (no accessible grid tree, gap #18) | ● | ●● | — | ●●● if we invest |

### 2.3 What is open and what is paid in Univer (public docs, Oct 2026)

- **Open source (Apache-2.0):** the core framework, sheets editing, formulas, number formats, filter and sort, data validation, conditional formatting, notes and thread comments, tables, hyperlinks, images and drawings, find and replace, freeze panes, the Facade API and the Node headless runtime.
- **Univer Pro (commercial):** co-editing (server or Node SDK, OT based), edit history, XLSX import / export (server-side `exchange` module), print, charts, pivot tables, sparklines, shapes, data connectors, the "advanced formula" engine.
- **Pro without a licence:** usable for trials with limits stated in the docs: import up to 1 MB, export up to 10k cells with a watermark, co-editing on at most 5 documents and 3 people each, print up to 3 pages. A paid licence removes them. Prices are not published.
- **Action:** before we sign anything, counsel reads the Pro licence and we get a written quote. We plan v1 **without** Pro (§2.5) so this is not on the critical path.

### 2.4 GridCraft in detail (from its source, read only)

- **Strong:** the function library (~13k lines), the formula parser and the XLSX crate (~11k lines) are serious work. The XLSX reader works on byte slices only, caps decompression, limits XML nesting and refuses DTDs in ODS. Network functions are stubs that return `#VALUE!`. External links are kept as pass-through parts, never fetched.
- **Weak for us:** the web build runs the full desktop UI (egui) on one canvas. There is no JavaScript API to put it inside our React screens, no accessible grid, no co-editing, single-threaded calc, and large files fail. The project is about one week old in git history and in alpha. Its UI copies the Excel ribbon on purpose; we must not ship that look.
- **Useful later:** its engine crates could run headless (WASM in Node) as an XLSX converter or as a "second opinion" when we test formula results. That needs a separate review and build of its code, which we do not do now.

### 2.5 Recommendation

- **Use Univer's open-source core (Apache-2.0) as the engine.** It is TypeScript like the rest of YukthiX, it embeds as a component in our own React shell, it runs the same formula engine in the browser and in Node (we need that for imports and connectors), and its change model (JSON mutations) is the right base for co-editing.
- **Do not depend on Univer Pro for v1.** We build the paid parts we need ourselves, small and on our platform: the co-editing server (§6), XLSX import / export with our safety rules (§11), version history (§5) and a simple chart plugin (§3). Buying Pro stays an option (D3, D4) if our own pieces cost too much.
- **Fallback:** if Univer's core licence or direction changes, we keep our pinned fork of the Apache core (the licence allows it). If the engine itself fails our SH-0 tests, the fallback is **GridCraft's engine crates behind our own TypeScript grid**, re-checked when it reaches beta. Its XLSX crate is also the fallback converter if ExcelJS fidelity is too low.
- **Rule:** our code talks to the engine only through one thin adapter (`packages/yx-sheets/src/engine/`). Our storage, ops, permissions and connectors never import Univer types directly. This keeps a switch possible.

### 2.6 "Build our own engine": the honest cost

| Part | Effort (experienced engineers with AI help) |
|---|---|
| Canvas grid: virtual scroll, selection, editing, merged cells, freeze, IME, copy-paste, accessibility | 6–9 engineer-months |
| Formula language and engine: parser, dependency graph, 400+ functions, dynamic arrays, dates, number formats, Excel edge cases | 8–14 engineer-months |
| XLSX read / write with styles, CF, validation, charts | 4–6 engineer-months |
| Charts, pivots | 4–6 engineer-months |
| **Total to reach "usable"** | **~22–35 engineer-months**, then a permanent team to fix compatibility bugs |

Evidence: GridCraft is about 115k lines of Rust and calls itself ~50% ready for real work. Building our own gives no customer benefit that Univer's open core does not already give. **Not recommended.**

---

## 3. Product scope

### 3.1 v1 (SH-1 → SH-7)

| Area | In v1 |
|---|---|
| Workbooks and sheets | Create, rename, copy, move to folder, star, trash with 30-day restore. Add, rename, hide, colour, reorder sheets. |
| Formulas | Everything the engine supports, calculated in a web worker. Network functions are off (§11.6). Named ranges. |
| Formatting | Number formats, fonts, fill, borders, alignment, wrap, merge, column width and row height, conditional formatting, data validation (all from the open core). |
| Data tools | Filter, sort, freeze rows and columns, find and replace, hide rows and columns. |
| Charts | Our own small chart plugin: column, bar, line, area, pie, scatter, placed over the grid and fed by a range. Drawn with the chart library the web app already uses (`recharts`). |
| Comments | Threaded comments on cells, @mentions, resolve. Notifications through P04. |
| Version history | Automatic checkpoints, named versions, compare by sheet, restore as a new version (§5.4). |
| Sharing | With people, teams (user groups) and departments in the company; roles owner / editor / commenter / viewer; company-only links. Built on P02 and RLS (§7). |
| Co-editing | Live edits, presence, coloured selections (§6). Depends on D3. |
| Import / export | CSV and XLSX in, CSV, XLSX and PDF (print view) out, with safe parsing (§11). |
| Templates | YukthiX starters (for example headcount plan, team budget, training tracker, interview scorecard summary) written by us, plus company templates. |
| Mobile | Responsive web: open, scroll, read, edit a cell, comment. No chart or format editing on phones in v1. |
| YukthiX connectors | Live data blocks from HR, payroll and expenses reports, filtered by each viewer's rights (§8). Audit of views and exports of sensitive data. |
| Residency | Workbook content stays in the company's home region (P21). |
| Standalone | Sign-up for Sheets alone, light people list, billing (§10). |

### 3.2 Later (not v1)

- Pivot tables (own plugin on the headless engine, or Univer Pro).
- Charts inside XLSX export (v1 exports the data and warns that charts are left out).
- Offline editing (queued ops and rebase; the ops log design allows it, §6.6).
- Native mobile app view (M04) and editing charts on phones.
- AI help (§9.3): only a seam now.
- Public "anyone with the link" sharing outside the company (D8).
- Slicers, sparklines, scripts. **Macros and user scripts: never** (§11.6).
- Import from Google or Zoho accounts (needs OAuth connectors under P10).

---

## 4. Where it lives and what we reuse

**API:** `apps/api/src/sheets/` (NestJS `SheetsModule`): `workbooks`, `sharing`, `ops` (sequencer), `versions`, `comments`, `connectors`, `files` (import / export jobs), `templates`. A Socket.IO gateway `sheets.gateway.ts` on namespace `/sheets`, using the Socket.IO and Redis adapter already used by `service-desk/chat.gateway.ts`. Pure rules in `sheets-rules.ts` (role checks, op validation, transforms, CSV escaping), unit-tested.

**Converter worker:** `apps/sheets-worker/` (Node, own container, like `apps/ocr-worker`). It runs XLSX / CSV parsing, compaction and connector refresh with the Univer headless runtime. It has no public network access, a memory cap and a time limit per job (§11).

**UI:** `packages/yx-sheets/` (React): the engine adapter, our toolbar and menus built from `yx-ui` components, the chart plugin, the share dialog, version panel and comments panel. Loaded only on `/yx/sheets/*` routes (dynamic import), so HR screens do not grow.

**Web:** `apps/web` pages `/yx/sheets` (home, recent, shared with me, templates, trash) and `/yx/sheets/[id]`.

**Reused as is:**
- **P12 login, MFA, SSO, sessions** (step-up MFA for sensitive exports).
- **P02** roles, grant scopes, field classes, `buildViewer`, `field-permissions/redact.ts`.
- **P08 audit** and the hash chain (`payroll/audit-chain.ts` pattern) for views and exports of sensitive data.
- **Shared file store and `common/scanner.ts`** (ClamAV, fail closed) for every uploaded file.
- **P04 notifications** for shares, mentions and comments.
- **P09 metric layer** as the only source of aggregated connector data (small-group suppression comes with it).
- **P14** products, plans, quotas (`billing/quota.service.ts`), usage.
- **P21** regions and home region.
- **G1** translations for our UI text and template text; the engine's own function names stay English in v1.
- **`user-groups`** for teams; `org-structure` for departments.
- **BullMQ** for jobs (`sheets-jobs.ts`).
- **`exceljs`** (already in `apps/api`) and **`csv-parse`** for import / export, run only inside the worker.

### 4.1 Changes needed in other modules (small, listed for their owners)

| # | Module | Change | Needed by |
|---|---|---|---|
| 1 | P14 billing | Product key `sheets`; plan rows; quota keys `sheets.storage_bytes`, `sheets.editors` | SH-7 |
| 2 | P09 metrics | A "connector" read API: run a saved metric or report definition for a viewer, return rows with their field classes | SH-6 |
| 3 | P08 audit | Event kinds `sheets.sensitive_view`, `sheets.export`, `sheets.share.change` | SH-2, SH-6 |
| 4 | P04 | Notification types in §13.2 | SH-2 |
| 5 | M03 / M05 / M01 reports | Mark which saved reports are allowed as connector sources | SH-6 |
| 6 | P01 standalone people list | Reuse the light people list made for the standalone Service Desk (M14 SD-1.29) | SH-7 |

---

## 5. Storage model

### 5.1 Choice: snapshot + ops log (not one row per cell)

| | One row per cell in Postgres | **Snapshot + ops log (chosen)** |
|---|---|---|
| Write cost | Every paste of 10k cells = 10k rows under RLS | One op row per change |
| Load cost | Read millions of rows, rebuild in memory | Read one compressed snapshot per sheet chunk, replay recent ops |
| Co-editing | Hard (no ordering) | Natural: ops have revision numbers |
| Version history | Expensive | Free: checkpoints are snapshots |
| Query cells from SQL | Easy | Not needed (connectors read HR tables, not sheet cells) |

### 5.2 Tables (all follow the YukthiX rules)

Every table has `organization_id NOT NULL`, composite keys on `(organization_id, id)`, **forced RLS** with `tenant_isolation`, and the restrictive `support_session_excluded` policy on content tables (YukthiX support never reads sheet content). Writes take `version` for optimistic locking.

| Table | Main columns | Notes |
|---|---|---|
| `sheet_workbooks` | `title`, `owner_user_id`, `folder_id`, `region`, `sensitivity` (`internal` / `confidential`), `head_rev`, `snapshot_rev`, `cell_count`, `byte_size`, `status` (`active` / `trashed` / `deleted`), `trashed_at`, `template_id` | Metadata only. `sensitivity` rises to `confidential` when a Confidential connector is added (§8.4). |
| `sheet_folders` | `owner_user_id`, `parent_id`, `name` | Personal folders; sharing is per workbook in v1 |
| `sheet_acl` | `workbook_id`, `principal_type` (`user` / `group` / `department` / `company_link`), `principal_id`, `role` (`owner` / `editor` / `commenter` / `viewer`), `granted_by`, `expires_at` | Checked by the service and by a restrictive RLS policy (§7.3) |
| `sheet_snapshots` | `workbook_id`, `rev`, `sheet_id`, `chunk_no`, `file_key`, `sha256`, `byte_size` | Each sheet is split into chunks of 10k rows, stored compressed in the file store |
| `sheet_ops` | `workbook_id`, `rev`, `user_id`, `client_id`, `client_seq`, `base_rev`, `mutations` (JSONB), `created_at` | Append-only. Unique `(workbook_id, rev)` is the sequencer. `app_runtime` has no `UPDATE` / `DELETE`. |
| `sheet_versions` | `workbook_id`, `rev`, `name`, `kind` (`auto` / `named` / `import` / `restore`), `created_by` | Points at a snapshot revision |
| `sheet_comments` | `workbook_id`, `sheet_id`, `anchor` (row, col, held in sync by the sequencer), `thread_id`, `author_id`, `body`, `resolved_at` | Ours, not the engine's, so P04 and audit work |
| `sheet_connectors` | `workbook_id`, `sheet_id`, `anchor_range`, `source_key`, `definition` (JSONB: report, filters, columns), `refresh` (`on_open` / `manual`), `created_by` | Stores the question only, never the rows (§8) |
| `sheet_files` | `workbook_id`, `kind` (`import` / `export`), `format`, `file_id`, `status`, `warnings` (JSONB), `requested_by` | Import and export jobs |
| `sheet_templates` | `scope` (`yukthix` / `company`), `name`, `category`, `snapshot_file_key`, `starter_key` | YukthiX starters are copied, never overwritten |

### 5.3 Compaction and large sheets

- A BullMQ job compacts a workbook after 500 new ops or 5 minutes idle: the worker loads the last snapshot, replays ops in the headless engine and writes new chunks. Only changed chunks are rewritten.
- Opening a workbook loads the first visible sheet's chunks, then the rest in the background.
- **v1 limits (raised after load tests):** 2 million non-empty cells per workbook, 200 sheets, 1,000 columns per sheet, 50 MB upload. A clear message is shown at 80% and at the limit.
- SH-0 measures load and scroll time for 100k, 500k and 2M cells on a mid-range laptop and phone. Target: first paint under 2 s for 500k cells.

### 5.4 Version history

- Automatic checkpoint every compaction and before every import, restore or connector change. Named versions on request.
- Restore never deletes: it writes the old snapshot as a new revision with `kind = restore`.
- Keep all named versions; keep automatic checkpoints 30 days at full detail, then one per day for a year (company setting).
- "Who changed this cell" reads the ops log for that cell range.

---

## 6. Co-editing (real-time)

### 6.1 Choice: server-ordered ops with a small transform set (OT style)

- **Why not a CRDT (for example Yjs):** a spreadsheet is not text. Formulas point at cells, and inserting a row must move every reference. A generic CRDT does not know that, and we would still need spreadsheet rules on top. The engine already speaks in mutations; ordering them on the server is simpler and matches how the engine works.
- **Why our own and not Univer Pro's server:** we need our permissions, audit, residency and connectors inside the same server. Univer Pro's Node SDK leaves users and roles to the host app, so it remains an option (D3-C).

### 6.2 How it works

1. The browser joins the room `wb:{id}` on `/sheets` after the server checks the viewer's role (§7).
2. Each local change becomes a batch of mutations with `base_rev` (the last revision the client has seen) and `client_seq`.
3. The server checks the role (viewer and commenter cannot send cell ops), validates every mutation against an allow-list (§11.7), then:
   - if `base_rev == head_rev`: insert with `rev = head_rev + 1` (the unique key makes this safe across API nodes), then broadcast;
   - if behind: transform the batch over the ops since `base_rev` (§6.3), then insert and broadcast;
   - if a pair cannot be transformed: reject; the client undoes its local change, reloads that sheet and shows "Your last change clashed with Priya's; please redo it."
4. Every client applies remote ops in order. Its own pending ops are transformed the same way (the same pure function runs in browser and server).
5. Presence (who is here, their selection colour) goes through Redis pub/sub only, never the database.

### 6.3 The transform set (v1)

| Incoming op ↓ / earlier op → | Set values / styles on a range | Insert / delete rows or columns | Add / remove / rename sheet | Merge / unmerge |
|---|---|---|---|---|
| Set values / styles | Same cell: later wins; different cells: no change | Shift or drop the range | Drop if the sheet is gone | Clip to the merge rule |
| Insert / delete rows or columns | No change | Shift index; overlapping deletes merge | Drop if the sheet is gone | Reject |
| Formula text | Rewrite references by the same rules the engine uses on structural edits | Rewrite references | Rewrite sheet names | — |

Anything outside this table (for example sort while someone else inserts columns) is rejected and redone by the user. We log how often that happens; if it is common, we add the pair.

### 6.4 Scale

- One room per workbook. Up to 50 editors and 200 viewers per workbook in v1.
- The Redis adapter fans out across API nodes. No sticky sessions needed because ordering is in Postgres.
- Load target (SH-4 test): 50 editors typing, p95 op round trip under 150 ms in the same region.

### 6.5 Fallback if D3 says "no co-editing in v1"

One editor at a time with a lock (taken on first edit, freed after 2 minutes idle). Others see live changes read-only and can comment. The ops log stays the same, so co-editing can be switched on later without a migration.

### 6.6 Offline (later)

The client keeps unsent ops in IndexedDB and replays them through §6.2 on reconnect. Connector blocks never work offline (live data must not be cached on devices).

---

## 7. Permissions

### 7.1 Workbook roles

| Role | Can |
|---|---|
| Owner | Everything, including share, delete, transfer, add connectors (if allowed by §12) |
| Editor | Edit cells, sheets, charts; share only if the owner allows "editors can share" |
| Commenter | Read and comment |
| Viewer | Read; export only if the owner allows it and the viewer holds `sheets.export` |

### 7.2 Who can be given a role

- People, teams (user groups) and departments in the same company.
- A **company link**: anyone signed in to the same company with the link gets the chosen role.
- No public links in v1 (D8). Never for a `confidential` workbook.
- External guests (for example an accountant) come later through the P16 partner model.

### 7.3 Two locks, not one

1. **Service check:** every API call and socket join checks `sheet_acl` and the RBAC keys (§12).
2. **Database check:** a restrictive RLS policy `sheet_member` on `sheet_workbooks`, `sheet_ops`, `sheet_snapshots`, `sheet_comments` lets a row through only if the current user (from `app.current_user_id`) has an ACL entry, directly or through a group or department. A bug in the service cannot leak another person's workbook.

### 7.4 Company admins and leavers

- Admins see a list of workbooks (title, owner, size, sharing) for governance, **not the content**.
- When an owner leaves, ownership moves to their manager or a chosen person (M01 exit task), logged.
- Legal hold (P08) blocks delete and purge.

---

## 8. YukthiX data connectors (the differentiator)

### 8.1 What they do

A user picks "Insert YukthiX data", chooses a source (for example "Headcount by department", "Payroll register for September", "Expense claims this quarter"), filters and columns. A connector block appears on the sheet. Formulas, charts and filters can use it like any other range.

### 8.2 The rule: each viewer sees only what they may see

- The workbook stores the **question** (`sheet_connectors.definition`), never the rows.
- When a viewer opens the sheet, the browser asks the API to run the question **as that viewer**. The API uses the same P02 scopes, field classes and pay-privacy rules as the HR screens:
  - rows outside the viewer's scope are not returned;
  - hidden fields come back as a lock symbol, not a value (`redact.ts`);
  - Confidential pay fields need the viewer's own right to see pay; otherwise masked;
  - Special fields are never offered as connector columns in v1.
- **Aggregates** go through the P09 metric layer, so small-group suppression applies (default fewer than 5 people → hidden or rolled into "Other").
- **So two people can see different totals in the same workbook.** The sheet shows a banner: "Live YukthiX data: you see the rows and fields you are allowed to see."
- Formulas that depend on a connector block are calculated in the viewer's browser only. Their results are **never saved** into the shared snapshot. The saved snapshot holds an empty placeholder.

### 8.3 Stopping leaks

| Path | Control |
|---|---|
| Copy cells to the clipboard | Allowed (the viewer may see them anyway), but copying more than 100 Confidential cells is audited |
| "Paste as values" / "Convert to static data" | Only for viewers holding `sheets.connector.freeze` and the P02 export right for that data; audited; the workbook becomes `confidential` |
| Export (XLSX, CSV, PDF) | Connector data is included only if the viewer holds `sheets.export` and the P02 export right; Confidential columns need step-up MFA; audited with row and column counts; file names carry "Confidential" |
| Share a workbook with connectors | Allowed; each new viewer still sees only their own data. The share dialog says so. |
| Company link / future public link | Connector blocks show nothing to anyone without a YukthiX identity and rights |
| Formula tricks (for example `INDIRECT` to reach hidden fields) | Impossible: hidden values never reach the browser |
| Screenshot | Not preventable; covered by policy and the audit of views |

### 8.4 Audit

- Opening a sheet that shows Confidential connector data writes one `sheets.sensitive_view` audit event per session (who, workbook, source, columns, row count), on the P08 hash chain.
- Every export and freeze writes `sheets.export` with format and counts.
- The employee's "who accessed my data" page (P02) lists sheet views of their pay data like any other view.

### 8.5 Sources in v1

| Source | Owner | Field classes |
|---|---|---|
| People directory and headcount | M01 / P09 | Internal, Personal |
| Leave balances and attendance summary | M02 | Personal |
| Payroll register and cost by department | M03 / P09 | Confidential |
| Expense claims and spend by category | M05 | Personal, Confidential |
| Any saved report marked "allowed in Sheets" | P09 | As the report |

---

## 9. Reuse of the shared platform

### 9.1 Separate product and suite (also §10)
Login, SSO, MFA, people, teams, audit, notifications, billing and translations are the same services. Sheets adds only its own tables and screens.

### 9.2 Residency
- Workbook rows, ops, snapshots and files live in the company's home region (P21 YX-SEC-19). The socket server for a workbook runs in that region's cell.
- Region move (P21) copies snapshots and ops like other tenant files.
- Exports are created and stored in the same region and expire after 24 hours.

### 9.3 AI (seam only, nothing built)
- The op API (§13) is the seam: a later assistant would propose a batch of mutations that the user previews and accepts.
- P10 rules apply when it is built: advisory only, no Special data to any external model, connector data only with the viewer's rights, and a company switch to turn it off.

---

## 10. How it ships

### 10.1 Inside the suite
- A "Sheets" app tile in the YukthiX app switcher. Same URL family (`/yx/sheets`). Same people, groups and roles.
- HR screens get "Open in Sheets" on reports (creates a workbook with that report as a connector block).

### 10.2 As its own product
- Product key `sheets` in P14. A company that buys only Sheets signs up, gets the light people list (P01 persons, CSV import, directory sync, reused from the standalone Service Desk) and SSO / MFA.
- Its own landing page and short host (for example `sheets.yukthix.com`), served by the same web app with a Sheets-only shell.
- Connectors to HR data appear only when the company also has the HR product. The upgrade path keeps every workbook; people are already P01 persons.

### 10.3 Pricing (D6)
- Fits P14 D18: price per billable unit per month, bundle discount for 2+ products, storage beyond fair use as a paid extra (D18b).

---

## 11. Security

### 11.1 Threats and controls

| Threat | Control |
|---|---|
| **CSV / formula injection on export** (a cell like `=HYPERLINK(...)` or `+cmd` runs in the user's desktop app) | On CSV export, any text cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading apostrophe, following OWASP guidance. Real numbers are left alone. XLSX export writes such text as text, never as formula. Unit tests with the OWASP sample payloads. |
| **XLSX zip bombs** | Before any inflate, read the zip central directory: refuse more than 10,000 entries, a declared total over 250 MB, any part over 100 MB, or a ratio above 100:1. Inflate with a running byte counter that stops at the cap (a lying header cannot get past it). Worker memory cap 1 GB, time limit 60 s. |
| **XXE and XML tricks** | Refuse any part containing a DOCTYPE. Our parser never resolves external entities. Nesting depth limit 256. |
| **External links** | `externalLink` parts and `[1]Sheet!A1` style references are dropped on import; those formulas keep their last cached value as plain data; a warning lists them. We never fetch a URL from a file. |
| **Remote images** | Only embedded PNG and JPEG are kept, and only after re-encoding. Linked (remote) images are dropped. No SVG in v1. |
| **Macros and active content** | `.xlsm`, `vbaProject.bin`, ActiveX, OLE objects, DDE and custom XML are dropped with a warning. `.xlsb`, `.xls` are refused in v1. Content is sniffed; the extension is not trusted. |
| **Malware in uploads** | Every upload passes `common/scanner.ts` (ClamAV) before parsing. Fail closed. |
| **Parser bugs** | Parsing runs only in `apps/sheets-worker`: separate container, no outbound network, read-only filesystem, non-root, memory and time limits. Fuzz tests with malformed files (SH-3). |
| **Formula abuse** | Network functions (`WEBSERVICE`, `IMPORTDATA`-like, `IMAGE` with a URL) are turned off. `HYPERLINK` allows only `https:`, `http:`, `mailto:`; clicking shows the target first and opens with `noopener`. Calc runs in a web worker with a time budget; a runaway workbook stops calculating, not the tab. |
| **Data exfiltration** | §8.3. Plus: export permission, audit with counts, rate limits on exports (P11), step-up MFA for Confidential exports. |
| **Cross-tenant or cross-user leak** | Forced RLS, `sheet_member` policy (§7.3), support exclusion, socket join checks every time (not cached across role changes). |
| **Malicious ops from a modified client** | Server validates each mutation against the allow-list and limits (cells per op 100k, op size 2 MB, ops per second per user 50). Unknown mutation types are refused. |
| **XSS through cell content or comments** | The grid draws on canvas; comments and chart labels are rendered as text by React, never as HTML. CSP as for the rest of the web app. |
| **Abuse of share links** | Company links need a signed-in company user; links can expire and be revoked; every use is logged. |

### 11.2 What we do not build
- No user scripts, macros, add-ins or custom functions in JavaScript. Ever, unless the founder decides otherwise in a later design with a full sandbox.

---

## 12. Permission keys (P02)

| Key | Default holders | Notes |
|---|---|---|
| `sheets.use` | Every user of a company with the Sheets product (or the HR product, if D6-A) | Open and create workbooks |
| `sheets.share.company_link` | Every user | Company switch can turn it off |
| `sheets.export` | Every user | Company switch; connector data also needs the P02 export right |
| `sheets.connector.add.<source>` | HR admin, payroll admin, finance; managers for their team sources | Scoped like the source report |
| `sheets.connector.freeze` | HR admin, payroll admin | Turn live data into static data; audited |
| `sheets.admin` | Company admin | Governance list, ownership transfer, settings; no content |

---

## 13. API, events and jobs

### 13.1 API (P11 style, versioned, scoped keys)

| Endpoint | What |
|---|---|
| `GET/POST /sheets/workbooks`, `GET/PATCH/DELETE /sheets/workbooks/:id` | List, create, rename, trash |
| `GET /sheets/workbooks/:id/snapshot?sheet=&chunk=` | Load chunks (signed short-lived file URLs) |
| `GET /sheets/workbooks/:id/ops?from=` | Catch-up ops |
| `POST /sheets/workbooks/:id/ops` | Send ops when sockets are not available (same rules as §6.2) |
| `GET/PUT /sheets/workbooks/:id/acl` | Sharing |
| `GET/POST /sheets/workbooks/:id/versions`, `POST .../versions/:rev/restore` | History |
| `GET/POST /sheets/workbooks/:id/comments` | Comments |
| `POST /sheets/workbooks/:id/connectors`, `POST /sheets/connectors/:id/run` | Add a connector; run it as the caller |
| `POST /sheets/imports`, `POST /sheets/workbooks/:id/exports`, `GET /sheets/files/:id` | Import and export jobs |
| `GET /sheets/templates`, `POST /sheets/templates/:id/use` | Templates |

Socket events on `/sheets`: `join`, `ops`, `ack`, `reject`, `presence`, `reload`.

### 13.2 Notifications (P04)
`sheets.shared_with_you`, `sheets.mentioned`, `sheets.comment_reply`, `sheets.ownership_transferred`, `sheets.import_done`, `sheets.export_ready`.

### 13.3 Jobs (`sheets-jobs.ts`)
`compact`, `import`, `export`, `purge-trash` (after 30 days), `prune-checkpoints`, `connector-refresh` (only for scheduled exports, run as the requesting user).

---

## 14. Screens (our design system, no vendor look)

| ID | Screen |
|---|---|
| SHT-01 | Sheets home: recent, shared with me, starred, folders, templates, trash |
| SHT-02 | Workbook editor: our toolbar (`yx-ui` buttons, Segment controls for single choices), formula bar, grid, sheet tabs, side panels |
| SHT-03 | Share dialog: people, teams, departments, company link, roles, "editors can share", sensitivity notice |
| SHT-04 | Version history panel: list, preview, compare, restore, name |
| SHT-05 | Comments panel and cell comment popover |
| SHT-06 | Insert YukthiX data: source, filters, columns, preview "as you see it" |
| SHT-07 | Import wizard: upload, scan status, warnings list (dropped macros, links, images), open |
| SHT-08 | Export dialog: format, include live data (if allowed), MFA step-up |
| SHT-09 | Chart editor side panel |
| SHT-10 | Mobile workbook view: read, edit cell, comment |
| SHT-11 | Admin: Sheets settings and governance list |
| SHT-12 | Standalone sign-up and set-up wizard |

Standing YukthiX rules apply: every clickable control looks clickable (border or fill, hover, pointer, focus ring); single choices use the joined Segment control; every screen is shown in the preview pane at review; keyboard use and a screen-reader summary of the selected cell and range.

---

## 15. Build order (PR-sized slices)

Effort is in engineer-weeks for an experienced full-stack engineer working with AI agents. Totals include tests and review.

### 15.1 SH-0 · Spike (1 week, no product code merged)

| ID | Slice | Tests / output |
|---|---|---|
| SH-0.01 | Pin one Univer core version; build the smallest plugin set; measure bundle (gzip) | Report: KB per plugin; target under 1.5 MB gzip for the editor route |
| SH-0.02 | Load 100k / 500k / 2M cells; scroll, edit, recalc times on a laptop and a phone | Report against §5.3 targets |
| SH-0.03 | Formula check: 300 hand-written cases from public function documentation (dates, text, lookup, financial, dynamic arrays) | Pass rate; list of wrong results |
| SH-0.04 | ExcelJS round trip of 30 home-made test workbooks (no vendor samples) | Fidelity table: what survives, what is lost |
| SH-0.05 | Counsel reads the Apache core notice and the Pro terms; quote for Pro asked | One-page licence note |

Gate: if SH-0.02 or SH-0.03 fails badly, stop and take D1 again.

### 15.2 SH-1 · Workbooks, engine and storage (6 slices, ~5 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-1.01 | Migration SH1 (§5.2 tables), forced RLS, `support_session_excluded`, `sheet_member` policy; keys `sheets.*` | e2e: RLS isolation for every table; a user not on the ACL gets nothing, also with a hand-made SQL query |
| SH-1.02 | Workbooks API: create, list, rename, folders, trash, restore, purge job | e2e: trash restores within 30 days; purge after; owner only |
| SH-1.03 | `packages/yx-sheets` engine adapter, editor shell SHT-02, formulas, formats, filter, sort, freeze | unit: adapter maps engine mutations to our op shape; Playwright: type a formula, format, freeze, filter |
| SH-1.04 | Ops log and single-user autosave through `POST /ops`; op allow-list and limits | unit: unknown mutation refused; 100k-cell op limit; e2e: reload shows saved state |
| SH-1.05 | `apps/sheets-worker` with headless engine; compaction into chunks | e2e: 1,000 ops → snapshot equals replay; only changed chunks rewritten |
| SH-1.06 | SHT-01 home; G1 strings; limits and messages | Playwright: limit warning at 80%; Tamil UI strings |

### 15.3 SH-2 · Sharing, comments, history (5 slices, ~4 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-2.01 | ACL API, groups and departments, company link, expiry; SHT-03 | e2e: viewer cannot send ops; group member gets access; removed member loses it on the next call and socket join |
| SH-2.02 | Comments, mentions, resolve; anchors move with structural edits; P04 notifications | e2e: insert a row above → comment stays on its cell; mention sends one notification |
| SH-2.03 | Versions: auto checkpoints, named versions, restore as new revision; SHT-04 | e2e: restore never deletes; compare shows changed cells |
| SH-2.04 | Audit events for share changes; admin governance list without content; ownership transfer on exit | e2e: admin sees title, not cells; leaver's workbooks move to the manager |
| SH-2.05 | Templates: YukthiX starters and company templates | e2e: starter copied once, never overwritten |

### 15.4 SH-3 · Import and export (5 slices, ~4 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-3.01 | Upload, virus scan, content sniffing, zip pre-checks (§11.1) | unit: bomb fixtures (ratio, entry count, lying header) refused; EICAR blocked |
| SH-3.02 | XLSX import in the worker: values, formulas, styles, merges, CF, validation, images; drop list with warnings; SHT-07 | unit: DOCTYPE refused; external link → value + warning; `vbaProject.bin` dropped; fuzz 10k malformed files without a crash |
| SH-3.03 | CSV import (encoding, delimiter detection) | unit: UTF-8 BOM, Windows-1252, semicolons |
| SH-3.04 | XLSX and CSV export with formula-injection escaping; PDF print view; SHT-08 | unit: OWASP payloads escaped; numbers untouched; e2e: export link expires in 24 h |
| SH-3.05 | Network functions off; safe `HYPERLINK`; calc time budget | unit: `WEBSERVICE` returns an error; `javascript:` link refused |

### 15.5 SH-4 · Co-editing (5 slices, ~5 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-4.01 | `/sheets` gateway, join checks, rooms, Redis adapter | e2e: join refused without ACL; role change kicks the socket |
| SH-4.02 | Sequencer: base_rev, unique rev, ack / reject, catch-up | unit: two nodes race → one rev each, no gaps |
| SH-4.03 | Transform set (§6.3), shared code for browser and server | property tests: random op pairs → all clients converge; formula references rewritten correctly |
| SH-4.04 | Presence and selections | Playwright: two browsers see each other's cursor |
| SH-4.05 | Load and chaos | load: 50 editors, p95 < 150 ms; kill an API node mid-session → no lost ops |

### 15.6 SH-5 · Charts and mobile (3 slices, ~3 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-5.01 | Chart plugin: six types, range binding, live update, SHT-09 | unit: range shrink and grow; Playwright: create a pie chart |
| SH-5.02 | Charts saved in snapshot and ops; export warning for XLSX | e2e: chart survives reload and co-edit |
| SH-5.03 | Mobile view SHT-10 | Playwright at 375 px: open, scroll, edit a cell, comment |

### 15.7 SH-6 · YukthiX connectors (5 slices, ~5 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-6.01 | P09 connector read API; sources marked "allowed in Sheets" | e2e: run as a manager returns only their team |
| SH-6.02 | Connector blocks, SHT-06; results never saved in snapshots | e2e: snapshot file has no connector values; two viewers see different rows |
| SH-6.03 | Field classes and pay privacy: masks, lock symbols, no Special columns, small-group suppression | e2e: a manager without pay rights sees masked salary; a 3-person department total is suppressed |
| SH-6.04 | Sensitive-view and export audit on the hash chain; "who accessed my data" | e2e: opening a payroll block writes one audit row per session; chain verifies |
| SH-6.05 | Freeze to static data, export of connector data with step-up MFA | e2e: freeze without the key refused; workbook becomes `confidential`; public-type sharing blocked |

### 15.8 SH-7 · Separate product and launch (4 slices, ~3 weeks)

| ID | Slice | Tests |
|---|---|---|
| SH-7.01 | P14 product `sheets`, plans, quotas (storage, editors) | e2e: over quota → read-only with a clear message, no data loss |
| SH-7.02 | Standalone sign-up, light people list, SHT-12, Sheets-only shell and host | e2e: standalone company cannot see connector menu; upgrade to HR keeps workbooks |
| SH-7.03 | Residency: storage and socket in home region; region move | e2e: EU tenant's chunks only in the EU bucket |
| SH-7.04 | Launch checks: pen test of import and ops, accessibility pass, GO-LIVE items | External pen test report; axe checks clean on SHT-01…10 |

### 15.9 Effort summary

| Batch | Slices | Engineer-weeks |
|---|---|---|
| SH-0 Spike | 5 | 1 |
| SH-1 Workbooks, engine, storage | 6 | 5 |
| SH-2 Sharing, comments, history | 5 | 4 |
| SH-3 Import and export | 5 | 4 |
| SH-4 Co-editing | 5 | 5 |
| SH-5 Charts and mobile | 3 | 3 |
| SH-6 Connectors | 5 | 5 |
| SH-7 Product and launch | 4 | 3 |
| **Total** | **38** | **~30 engineer-weeks** (plus ~25% buffer: **~37**) |

With two engineers working in parallel after SH-1 (SH-2/SH-3 together, then SH-4/SH-5 together), v1 is about **4–5 months** of calendar time. Without co-editing (D3-B), take off about 4 weeks.

---

## 16. Decisions for the founder

Recommended defaults are in **bold**.

### D1 · Which engine
- A: **Univer open-source core (Apache-2.0), our own pieces for the paid parts.**
- B: Univer core plus a paid Univer Pro licence (faster start for co-editing, XLSX, charts, pivots; ongoing fee and vendor lock).
- C: GridCraft engine crates with our own grid (Rust; too young today; re-check at its beta).
- D: Build our own engine (~22–35 engineer-months; not recommended).

### D2 · v1 scope cut
- A: **§3.1 as written: no pivots, no charts in XLSX export, no offline, no public links.**
- B: Smaller: also no co-editing and no charts (about 8 weeks less).
- C: Bigger: add pivots in v1 (about +4 weeks, or buy Pro).

### D3 · Co-editing in v1
- A: **Yes, with our own server-ordered ops (§6).**
- B: No: one editor at a time with live view; co-editing in v2 without a migration.
- C: Yes, with Univer Pro's collaboration SDK (paid).

### D4 · XLSX converter
- A: **ExcelJS (already in our repo) inside the isolated worker, with our safety checks.**
- B: Univer Pro's exchange module (paid; better fidelity).
- C: GridCraft's XLSX crate after a security review and build (strongest open code; young project).

### D5 · Charts
- A: **Our own small chart plugin with `recharts` (six chart types).**
- B: Univer Pro charts (paid).

### D6 · Pricing and bundling
- A: **Included for every user of any paid YukthiX product (fair-use storage); standalone Sheets at $1 per active editor per month (viewers free), minimum 10, bundle discount as P14.**
- B: A paid add-on even inside the suite.
- C: Free for everyone, including standalone, as a lead product.

### D7 · Name
- A: **"YukthiX Sheets"** (simple, clear, matches "YukthiX Service Desk").
- B: "YukthiX Grid".
- C: "YukthiX Calc".
Before launch: a trademark search in India, the EU and the US.

### D8 · Links outside the company
- A: **v1: company-only links. Public view-only links later, never for `confidential` workbooks or sheets with connectors.**
- B: Public view-only links in v1.

### D9 · Live HR data in exports
- A: **Allowed only with the export right for that data; Confidential columns need step-up MFA; always audited.**
- B: Never export live data; the user must freeze it first.
- C: Same rules as ordinary cells (not recommended).

### D10 · v1 size limits
- A: **2 million cells per workbook, 50 MB upload, 200 sheets; raise after load tests.**
- B: 5 million cells (needs more SH-0 proof).

### D11 · Different totals for different viewers
- A: **Accept it, with a clear banner (§8.2). It is the only way to respect pay privacy.**
- B: Connector blocks show only to people with full access to the source; others see "No access".

---

## 17. Sources (public, read Oct 2026)

- Univer repository and README (licence, open vs Pro features): github.com/dream-num/univer
- Univer docs: Pro introduction and trial limits, Docker server (OT), collaboration SDK, import / export, web workers: docs.univer.ai
- IronCalc repository: github.com/ironcalc/IronCalc
- FortuneSheet repository: github.com/ruilisi/fortune-sheet
- HyperFormula repository (GPLv3 or commercial): github.com/handsontable/hyperformula
- GridCraft source as supplied by the founder (read only): `README.md`, `NOTICE`, `docs/architecture.md`, `docs/gaps.md`, `docs/roadmap.md`, `crates/xlsx/src/{lib,package}.rs`, `crates/functions/src/info.rs`, `contributors/contributors.json`
- OWASP: CSV injection guidance

## Revision history

| Date | Change |
|---|---|
| 13 Oct 2026 | First draft for the founder |
