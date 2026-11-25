# Compare: admin, data safety, home, navigation and reports (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (shell, Home, Me › Apps, reports libraries) and `keka-map.md`;
- `zoho-pages.md` (shell, Operations, Data Administration, Settings › Manage Accounts, Reports);
- YukthiX code on `test/yukthix-main` (PLT, ANL and platform screens), plus `gap-audit.md` (Z1, Z4, Z6, Z7, Z11 to
  Z13, Z24, K7, K24).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.
Keka was seen as an employee, so its admin cells are mostly empty.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Roles, modules and groups

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Roles and permissions | — | General and specific roles, function permissions, per-module admin, field permissions | Partly: PLT-11 roles from templates, scoped grants with dates, access preview; no field-level control here | **Keep ours**; add field-level control for salary and ID fields |
| A2 | Modules on / off | — | One list: switch and reorder | Partly: separate switches per module | **Take Z** |
| A3 | Reusable groups | — | Rule-based groups (role, location, department, type) | Partly: fixed user groups only | **Take Z:** rules reused by policies and checklists |
| A4 | Use, operations, settings | — | Three layers with cross-links | Partly: no operations home | **Mix:** cross-links between settings and work pages; no extra home page |
| A5 | Pick a person per module | — | "User-specific operations" search | Partly | **Take Z** |
| A6 | Users and sign-in list | — | Login enabled, disabled, invited | Missing (unsure) | **Take Z:** needed at go-live and for leavers |

## B. Data safety

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Activity log | — | Timeline of plain sentences, export, filter | Partly: PLT-16 `/yx/settings/audit-log` with filters, CSV, daily integrity check; event codes, not sentences (unsure) | **Mix:** keep our integrity check; add Zoho's plain sentences |
| B2 | Recycle bin | — | Every form, restore for 180 days | Partly: hiring only, 30 days, older app | **Take Z:** across YukthiX; days as a company setting |
| B3 | Backups | — | Scheduled full backup with a monthly quota | Partly: one-off company export | **Take Z:** scheduled export with a log |
| B4 | Masking and sign in again | Eye to reveal | Masked by default; sign in again with a timeout | Partly: masking and step-up; no timeout gate on salary pages | **Take Z** (same build as pay B12) |
| B5 | Import and export log | Import shifts and weekly offs | Import log and export log | Partly: imports per area; no central log | **Take Z:** one log page (our drawn jobs and errors screen) |
| B6 | Sign-in security | — | Domains, custom sign-in page, federated sign-in | Has: SSO, verified domains, MFA, session limits, login activity | **Keep ours** |
| B7 | Personal data rights | — | Consent receipts report | Has: data copies and erasure desk, "my data", who viewed my data | **Keep ours** (DPDP Act) |

## C. Platform

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Languages and terms | — | Rename system terms, add languages | Partly: company words in Hindi, Tamil, Telugu; screens in English; no renaming | **Mix:** renaming (Zoho) plus a full Hindi screen language for factory staff |
| C2 | Custom forms | — | Extend service, custom services | Designed only | **Take Z**, later |
| C3 | Workflows | — | Schedulers, workflows, alerts | Designed only; approval policies live | **Take Z**, later |
| C4 | Integrations | Apps centre by category | Marketplace, developer space | Partly: connectors, API keys, webhooks, calendar | **Keep ours** |
| C5 | Subscription | — | Licence count | Partly: plan, usage, invoices (read-only) | **Keep ours** |
| C6 | Set-up guide | — | "Getting started" per module | Has: PLT-08 set-up hub, payroll go-live | **Keep ours** |

## D. Home and navigation

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| D1 | Home today | Clock, project time, inbox, on leave, remote | Check-in, week schedule, nudges | Has: PLT-02 `/yx/home` with attendance, "Needs your action", my team today, leave, holidays, celebrations | **Keep ours** |
| D2 | Choose Home widgets | Fixed | Customise widgets | Designed only: "Edit home" drawn, not wired | **Take Z**, through our drawn editor |
| D3 | Left rail | Fixed rail | Rail with a "last used" slot | Partly: rail live; Ctrl K has "Recent" | **Take Z:** a "last used" slot |
| D4 | Search with actions | Search people or actions (Alt + K) | People search | Has (merged): Ctrl K with actions | **Keep ours** |
| D5 | Quick create | — | "+" menu with search | Partly: Home quick actions and Ctrl K; request sheet designed only | **Take Z**, through our drawn request sheet |
| D6 | Moved pages | Stub with a link to the new place | — | Partly: the not-found page says a page moved | **Take K** |
| D7 | Dark mode | — | Dark mode, accessibility | Has | **Keep ours** |
| D8 | Phone screens | — | — | Partly: pages work on phones; phone screens drawn, not live | **Keep ours:** make the drawn phone screens live (mobile-first staff) |

## E. Reports and analytics

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| E1 | Reports library | Categories, search, favourites, recently used, report cards | My / Team / Organisation, star per report | Designed only: ANL-06; each area has its own reports page | **Mix:** Keka's layout, Zoho's My / Team / Organisation scope |
| E2 | Scheduled email reports | Scheduled reports | Schedulers | Partly: helpdesk only | **Take K**, with E1 (monthly MIS) |
| E3 | Custom report builder | — | Analytics builder | Designed only: ANL-05 | **Take Z**, later |
| E4 | Headcount and attrition | — | Cards with trends and top-10 pies | Designed only: monthly snapshot data only | **Take Z** |
| E5 | Statutory registers | — | Muster roll | Has: time, payroll and contract-labour registers | **Keep ours** |

## Suggested order to build

1. **Must for daily use:**
   - B4 sign in again before salary pages (S);
   - B2 recycle bin across YukthiX (L);
   - A6 users and sign-in list (M);
   - E1 / E2 reports library with schedules (L);
   - B1 plain-sentence activity log (S).
2. **Depth:**
   - A2 modules list (M);
   - A3 rule-based groups (M);
   - A5 pick a person per module (M);
   - B3 scheduled backups (M);
   - B5 import and export log (M);
   - E4 headcount and attrition (M);
   - D2 Home widgets (S);
   - D3 "last used" slot (S);
   - D5 quick create (M);
   - D6 moved-page stubs (S);
   - A4 cross-links (S);
   - C1 renaming and Hindi screens (L);
   - D8 phone screens live (L).
3. **Later:** C2 custom forms (L), C3 workflows (L), E3 report builder (L), A1 field-level control (M).
