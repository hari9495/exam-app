# YukthiX Design System — decisions and rules (v1.0)

> **Status:** v1.0. All sections §0–§48 decided with the founder on 28 Sep 2026. Each section records the decision, the tokens / rules, and the components it drives. Nothing is built until its section is decided.
>
> **Builds on:** brand guidelines (`BRAND-GUIDELINES.md` v1.0, spec D21), UI brief (`reference/frappe-hrms-functional-spec/99-ui-design-brief.md`, 13 principles, page templates T1–T9), shared `packages/ui` + Storybook (spec D16), existing exam-app `ui-v2` (30 components).
>
> **Non-negotiable goal (founder):** the product must look and feel **human-designed**, not AI-generated. Section 0 turns that into testable rules.

---

## Audit of what exists (28 Sep 2026)

| Area | Finding | Action |
|---|---|---|
| Colour tokens | Four competing sets in the exam app: legacy brand (navy `#001E60`, blue `#0053E2`, amber `#FFC220`), Azure v2 (`#3B5FE3`), a green-grey "recruiter" set, generic shadcn HSL tokens, plus a separate status set | Collapse into one token set (§3) |
| Typography | Bricolage Grotesque (display) + Hanken Grotesk (body), self-hosted | Re-check display face against the "not AI-looking" goal (§2) |
| Shape / depth | Radius 6 / 8 / 9 / 12 px mixed; cards use a deep soft shadow; every button lifts and glows on hover | Fix one radius and elevation scale; remove decorative motion (§4, §7) |
| Type details | Uppercase, letter-spaced "kicker" labels | Recognised AI-template tell; decide (§0) |
| Components | AppShell, Sidebar, TopBar, DataTable, Dialog, Combobox, Tabs, Timeline, ApprovalTimeline, StatCard, Gauge, NotificationBell, TextField, PasswordField, Dropdown, Panel, Card… | Keep the good ones, restyle to the new tokens, add the missing HR components (§ Components) |
| Dark mode | Exists (flat navy) | Keep, re-derive from final palette |

---

## Section list (each gets decided; ✅ = decided)

**0. Look & feel and the "human-made" rules** — direction, anti-AI-slop rules, 21st.dev / third-party component policy
**Foundations (tokens)**
1. Brand expression in product (how much brand colour, personality in UI)
2. Typography (typefaces, scale, numerals, Indic scripts)
3. Colour palette and colour psychology (brand, neutrals, semantic, status, data-viz, dark mode, tenant colour)
4. Spacing, grid, layout and breakpoints (8-pt scale, density modes)
5. Shape: radius, borders, dividers
6. Elevation and shadows
7. Motion (durations, easing, what may move)
8. Iconography
9. Imagery and illustration in product
**Structure**
10. Map core data objects (person, employment, request, document, test, candidate, job…) and their pages
11. Establish hierarchy (page, section, card; heading levels; primary / secondary actions)
12. Navigation — two-tier sidebar layout, top bar, breadcrumbs, tabs, command palette, mobile tabs
13. Profile-centric views (person 360 page)
14. Reduce clicks (inline edit, bulk actions, keyboard, smart defaults)
**Components**
15. Buttons, links and actions
16. Forms (inputs, selects, date / time, currency ₹, validation, help text)
17. Modals / dialogs, confirmations
18. Slide-over panels (drawers)
19. Steppers / wizard forms
20. Advanced data tables (sort, filter, saved views, column control, grouping, frozen columns, virtualisation, export)
21. Org chart widget
22. Dashboards and cards (stat cards, charts, lists)
23. Charts / data visualisation
24. Status badges, tags and avatars
25. Feedback: toasts, banners, inline alerts
26. Data states: loading / skeleton, empty, error, no permission, offline, partial
27. First-time experience (onboarding, setup hub, quick start, empty-state teaching)
28. Calendar, roster grid and scheduler
29. Kanban (ATS pipeline) and timelines (approvals, history)
30. Search, filters, saved views, command palette
31. File upload, document viewer, e-sign
32. Notifications centre and approvals inbox
33. Tooltips, popovers, menus
**Cross-cutting**
34. Content / UX writing rules in UI (voice from brand Part 2)
35. Formats (₹ lakh / crore, dates, time zones, names)
36. Accessibility (WCAG 2.2 AA, keyboard, focus, screen readers)
37. Responsive and mobile patterns (bottom tabs, sheets, PWA)
38. Tenant theming and white-label
39. Localisation and scripts (EN / HI / TA / TE, RTL later)
40. Special surfaces: test-taking / proctoring screens, public careers pages, candidate portal, print & PDF (payslips, letters), email templates
**Governance**
41. Token naming and architecture (primitive → semantic → component)
42. Component specs format, Storybook, visual regression tests
43. Versioning, contribution and review rules
44. Design QA checklist before release
**Added during review**
45. AI assistant panel
46. Visual builders (rule builder, workflow studio, editors)
47. Comments and mentions
48. Chart colour palette and dark-mode tokens

---

## Decisions

*(Recorded section by section below as they are decided.)*

### ✅ §0 Look and feel (decided 28 Sep 2026)
- **Direction: quiet and precise, like a well-made tool.** Calm near-white surfaces, crisp 1 px borders instead of heavy shadows, typography does the work, colour only for meaning and actions, dense but readable tables. Reference feel: Linear, Stripe Dashboard, Notion — not their visuals copied.
- **Human-made rules (banned):** purple/blue gradients and gradient text; glassmorphism, blurred blobs, noise textures; glowing shadows and hover-lift on buttons; uppercase letter-spaced "kicker" labels above titles; emoji as icons; identical rounded cards in 3-column grids as the default layout; sparkle/magic-wand AI icons; centred hero layouts inside the app; decorative animation; vague placeholder copy; unstyled default icon sets.
- **Human-made rules (required):** every design uses real content (Indian names, ₹ amounts, real statuses); layout chosen per task (table, form, profile, board), not one card grid; one accent colour; visible alignment to the grid; deliberate type scale; every screen passes a human design review (§44) before it ships.
- **Third-party components (21st.dev, shadcn, Radix):** used only as a starting point for behaviour and accessibility; every imported component is restyled to our tokens, reviewed against these rules, added to Storybook and licence-checked before use. Never pasted into a screen as-is.

### ✅ §2 Typography (decided 28 Sep 2026; replaces Bricolage Grotesque + Hanken Grotesk from spec D16 / brand D21)
- **Typeface: IBM Plex Sans** for everything (UI, headings, numbers). **IBM Plex Mono** for IDs, codes, API keys. **IBM Plex Sans Devanagari** for Hindi; **Noto Sans Tamil / Telugu** for Tamil and Telugu (Plex has no Tamil / Telugu); **IBM Plex Sans Arabic** for RTL later (P21). Self-hosted, OFL licence. Letters and payslips (P05 PDF) use the same families.
- **Weights:** 400 regular, 500 medium (labels, table headers, buttons), 600 semibold (page titles, key numbers only). No 700 in the product.
- **Scale (desk, px / line height):** 12/16 caption · 13/18 small · **14/20 body (default)** · 16/24 lead · 18/26 section title · 22/28 page title · 28/34 key figure · 36/42 hero figure (dashboards, payslip net pay). Letter-spacing −0.01em from 18 px up; 0 below.
- **Numbers:** tabular figures everywhere numbers line up (tables, payslips, totals); right-aligned in tables; ₹ with Indian grouping (§35).
- **Density:** comfortable (default) = 14 px body, 40 px table rows, 36 px controls; **compact** (per-user setting) = 13 px body, 32 px rows, 32 px controls. Mobile body 16 px, controls 44 px (touch).

### ✅ §3 Colour palette and colour psychology (decided 28 Sep 2026)
**Accent:** Azure — 50 `#EEF2FD` · 100 `#DDE5FB` · 200 `#BACAF6` · 300 `#8FA4F0` · **500 `#3B5FE3` (primary)** · 600 `#3050CF` (hover) · 700 `#2A46B8` (pressed) · 800 `#22398F`.
**Neutrals (cool slate):** 0 `#FFFFFF` (cards) · 25 `#F7F8FA` (page) · 50 `#F3F5F7` (subtle fill) · 100 `#E2E8F0` (hairline) · 200 `#CBD5E1` (strong border) · 300 `#94A3B8` (disabled text, decorative icons) · 500 `#64748B` (secondary text, 4.8:1) · 600 `#475569` · 700 `#334155` · 800 `#1E293B` · 900 `#0B1220` (ink, primary text).
**Status (desaturated, text / background / border):** success `#1F6F4A` / `#E8F4EE` / `#B9DEC9` · warning `#8A5A00` / `#FBF3DD` / `#EDD49A` · danger `#B42318` / `#FDEDEC` / `#F4C3BE` · info = Azure 700 / Azure 50 / Azure 200 · AI `#6941C6` / `#F2EEFB` / `#D9CCF5`.
**Dark mode:** page `#0B1220`, cards `#111A2B`, hairline `#1E293B`, text `#E2E8F0` / `#94A3B8`, accent Azure 300; statuses use their light tints as text on 12 % tinted backgrounds. Derived tokens, never hand-picked per screen.
**Retired:** legacy navy `#001E60`, blue `#0053E2`, amber `#FFC220`, the green-grey "recruiter" set, and ad-hoc shadcn values — all mapped to the tokens above.
**Colour meaning (psychology rules):**
- Azure = act, selected, focus, links, trust. One accent-filled button per view.
- Green = done, paid, approved, present. Never used for "go" buttons.
- Amber = needs attention, pending, due soon. Never used for errors.
- Red = error, rejected, failed, irreversible action. Never for normal negative numbers (deductions, LOP) — money is not coloured by default.
- Purple = AI suggestion only, always labelled "Suggested by AI", used sparingly.
- Grey = neutral, inactive, archived.
- Colour never carries meaning alone: always with text or an icon (WCAG 1.4.1).
- Tenant brand colour (`--org-primary`) appears only on employee / candidate surfaces (§38) and never replaces status colours.
- Data-visualisation palette (§23): 8 colour-blind-safe categorical colours led by Azure; sequential = Azure tints; diverging = Azure ↔ amber.

### ✅ §4 Spacing, grid, layout and breakpoints (decided 28 Sep 2026)
- **Spacing scale (4-px base, 8-px rhythm):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Tokens `space-1` … `space-10`. No other values.
- **Grid:** 12 columns; gutters 24 px desk, 16 px mobile. Page padding 24 px desk, 16 px mobile.
- **Breakpoints:** 640 · 768 · 1024 · 1280 · 1536 px.
- **Widths:** tables full width; forms single column, labels above fields, max 640 px; reading pages max 1440 px.
- **Density:** comfortable (default) and compact (per-user), see §2.

### ✅ §5 Shape and §6 Elevation (decided 28 Sep 2026)
- **Radius:** 4 px (badges, checkboxes, tags) · 6 px (buttons, inputs, selects) · 8 px (cards, menus, popovers, table containers) · 12 px (dialogs, drawers, sheets). No pill buttons; avatars are circles.
- **Borders:** 1 px hairline (slate-100) by default; slate-200 for strong dividers and hovered inputs; 2 px Azure focus ring with 2 px offset.
- **Elevation — three shadows only, crisp and short, never glowing:** `shadow-1` popover / menu / toast (0 1px 2px, 0 4px 12px at low opacity) · `shadow-2` drawer (0 8px 24px) · `shadow-3` dialog (0 16px 40px). In-page cards are **flat and bordered** (no shadow). At most two floating layers on screen.

### ✅ §7 Motion (decided 28 Sep 2026: functional motion + a little delight)
- **Functional:** drawer slide 200 ms; dialog fade + 0.98→1 scale 150 ms; menus 120 ms; toasts in / out 150 ms; row expand 150 ms. Ease-out entering, ease-in leaving. Loading uses a static skeleton with a slow, low-contrast pulse (no shimmer sweep).
- **Delight (rare, meaningful, once):** a single subtle moment for real milestones — payroll locked, first payroll paid, offer accepted, onboarding complete, test submitted (candidate) — e.g. a check-mark draw and short confirmation; charts animate once on first load (≤ 400 ms). No confetti rain, no looping animation, never on routine actions.
- **Never:** hover lift or glow on buttons, bouncing, parallax, count-up numbers on money, animated backgrounds.
- **Reduce motion:** when the user's OS asks for it, all motion is instant and the delight moments become static confirmations.

### ✅ §8 Iconography (decided 28 Sep 2026: both; colour icons added 7 Oct 2026)
Two icon families, each with its own job.
- **Colour icons — Fluent UI System Icons, Color variant** (MIT, © Microsoft; npm [`@fluentui/react-icons`](https://www.npmjs.com/package/@fluentui/react-icons) pinned at 2.0.343; notice in `THIRD-PARTY-NOTICES.md`). The big, friendly icons: navigation areas in the sidebar (Home, People, Time and leave, Payroll, Hiring, Assessments, Service desk, Performance, Learning, Analytics, Settings), Home / dashboard tiles, empty states, the onboarding / setup hub and help. Sizes: **20 px** in navigation, **24–32 px** on tiles, **48 px** on empty states. Use the hand-drawn size where Fluent has one; otherwise the nearest larger drawing is scaled.
- **Outline icons — Lucide** (ISC licence), 1.5 px stroke, unchanged: everything small and dense — tables, buttons, form fields, menus, toolbars, side-panel links and status (16 px; 20 px in the panel). Outline icons carry a text label except universally known ones (search, close, more, back). Status keeps its green / amber / red meaning because outline icons take the status colour; colour icons never sit in a status slot.
- **Icon registry:** one meaning → one icon, in one place (`ColorIcon` / `COLOR_ICONS` in `@yukthix/ui`, keys such as `area.people`, `area.time`, `area.payroll`, `leave`, `approvals`). Screens never import Fluent icons directly; a new meaning is added to the registry first. Storybook "Foundations / Icons / Colour icons" shows the registry table.
- **Rules:** labels always visible next to a colour icon (rail, tiles, empty-state title); colour never carries meaning alone (§3); no emoji; no sparkle / magic-wand icon for AI (AI uses the "AI" text badge, §3 purple); never Icons8 or any other paid, subscription or attribution-required set. A 48 px colour icon on an empty state is an icon, not an illustration (§9, §26 still apply: no decorative drawings).
- **Dark mode:** checked on the dark surface (`#111A2B`). Most Fluent colour icons read better on dark than on light. Service desk (Headset) is the exception — its dark headband sits under 3:1 — so it is flagged `darkTile` and sits on a light neutral tile in dark mode. A mid-grey tile (Slate 700) was measured and lowers contrast for most icons, so Home tiles use the subtle neutral fill in both themes. Re-check any new icon the same way.
- **Licence watch:** Microsoft marks the Color variant *deprecated* in the package (accessibility guidance; may be removed in a future major release). We pin the version; the MIT licence lets us copy the SVGs into our own set if they are removed.
- **Custom YukthiX colour icons:** HR meanings Fluent Color does not cover are commissioned from the brand designer **in the same Fluent Color style** (soft gradients, same grid and sizes): payslip, attendance punch, statutory filing, proctoring, offer letter, org unit, rule builder, workflow. Listed as "commission" rows in the registry until delivered. Team action: add to the logo designer brief.

### ✅ §10 Core data objects and §11 Hierarchy (decided 28 Sep 2026)
- **Core objects:** Person (one record across employee / candidate / contractor / alumnus roles, P01 `persons`) · Employment · Org unit · Position · Request (leave, expense, any P03 request) · Pay run · Payslip · Document · Job · Application · Test · Attempt · Case / ticket · Project · Workflow.
- **Every object has the same four views:** list (advanced table, §20) · object page · quick view in a drawer (§18) · the same URL pattern (`/{area}/{object}/{id}`, tabs as `/…/{id}/{tab}`).
- **Object page anatomy:** header (name, status chips, 3–5 key facts, one primary action + overflow menu) → tabs → content; **right-side activity panel** (history, comments, approvals timeline), collapsible, remembered per user.
- **Hierarchy on every page:** one page title (22 px), one primary action, sections with 18 px titles, 14 px body; cards only when grouping genuinely helps; never more than three levels of nesting.

### ✅ §12 Navigation — two-tier sidebar (decided 28 Sep 2026)
- **Tier 1 rail (56 px):** icons with labels on hover for Home, People, Time, Pay, Hire, Assess, Performance, Learning, Helpdesk, Analytics, Settings — only what the role can see; product switch is implicit (YukthiX HR / Hire / Assess areas).
- **Tier 2 panel (240 px):** pages of the selected area with section headings, counters (e.g. Approvals 12), pinned favourites at the top; collapsible to rail-only; state remembered per user.
- **Top bar:** global search and command palette (Ctrl / Cmd + K, P17), company / entity switcher, notifications, help, profile menu.
- **Breadcrumbs** only on deep pages (object → sub-object). **Tabs** inside object pages. **Mobile:** bottom tabs Home · Time · Requests · Pay · Me (M04), with the rail's areas under "Me › More".

### ✅ §13 Profile-centric view — Person page (decided 28 Sep 2026)
- **Header:** photo, name, role, department, location, manager, status chips (e.g. On probation, Notice period), 2–3 primary actions (e.g. Start transfer, Message).
- **Tabs:** Overview · Job · Pay (permission-gated, P02) · Time · Documents · Performance · Learning · Assets · History.
- **Right column (280 px):** key facts and upcoming events (probation end, anniversary, pending requests, expiring documents).
- **History** shows all the person's roles as one timeline (candidate → employee → alumnus → rehire; contract worker → employee), per P01 `person_roles`.

### ✅ §14 Reduce clicks (decided 28 Sep 2026)
- Inline edit for simple fields (click → edit → Enter saves, Esc cancels; audited).
- Bulk actions on every list (select → approve, export, assign, message).
- Quick view in a drawer instead of navigating away.
- Keyboard shortcuts: J / K move, Enter open, A approve, R reject, / search, G then P / T / Y (People / Time / Pay), ? shows all shortcuts.
- Smart defaults: last-used entity, today's date, the person's manager, the previous period.
- Approve from notification, email or chat for low-risk actions (P03 rules).
- Target: any core task ≤ 3 clicks from Home (UI principle 11); measured in the design QA checklist (§44).

### ✅ §15 Buttons, links and actions (decided 28 Sep 2026)
- **Variants:** primary (Azure fill; one per view) · **secondary (white, 1 px border — the default)** · ghost (**icon-only buttons only**, in toolbars and table rows) · danger (red; irreversible actions only, always confirmed) · link (inline text actions).
- **Sizes:** 32 / 36 / 40 px (compact / default / large); icon-only buttons square with a tooltip and `aria-label`.
- **Labels:** verb first, sentence case, 1–3 words ("Run payroll", "Approve", "Add employee"); never "Submit" / "OK" / "Click here".
- **States:** default, hover (background tint only — no lift or glow), pressed, focus (2 px Azure ring), loading (spinner in place, width kept, label stays), disabled only when unavoidable (prefer enabled + explain on click).
- **Placement:** primary action top-right of the page header and bottom-right of forms / dialogs; destructive actions separated from safe ones.
- **Every button with a text label has a border or a fill** (founder review, 29 Sep 2026): a borderless text button does not read as a button. This covers Cancel, Back, Clear filters, Retry and every other text action. The borderless style is allowed only for icon-only buttons (with a tooltip). A low-emphasis action inside a sentence is a link, not a button.

### ✅ §16 Forms (decided 28 Sep 2026)
- **Layout:** single column, labels above, helper text below, max 640 px; related short fields may pair on one row (e.g. From / To date).
- **Required:** the word "Required" next to the label (no lone asterisk); optional fields marked "Optional" only when most are required.
- **Validation:** on blur and on submit; error text under the field says what to do ("Enter a 10-character PAN like ABCDE1234F"); error summary at the top for long forms, linked to fields.
- **Special inputs:** ₹ amount (Indian grouping, tabular, no decimals unless needed) · date (dd MMM yyyy, typing + calendar) · date range · time · PAN / IFSC / UAN / Aadhaar-masked with format masks and live checks · phone (+91 default, E.164) · person picker (photo, name, role, department) · entity / location / org-unit pickers · multi-select with chips · file upload (§31) · rich text (letters, policies).
- **Long forms:** sticky save bar with Save and Cancel; unsaved-changes guard; autosave drafts where the object supports it.

### ✅ §17 Dialogs, §18 Drawers, §19 Steppers (decided 28 Sep 2026)
- **Dialog** (centred, 480 / 640 px): short decisions and confirmations only, never long forms. Confirmations name the action and object ("Delete leave type Casual?"); destructive button right-most in red; type-the-name confirmation for large or irreversible deletions; Esc and outside-click close non-destructive dialogs only.
- **Drawer / slide-over** (from the right; 480 / 720 px / full): quick view of any object; create and edit forms up to ~12 fields; list stays visible; at most 2 stacked; Esc closes; unsaved-changes guard; deep-linkable URL.
- **Stepper / wizard:** only for processes with a real order (onboarding, payroll run, company setup, offer creation, migration, test publishing). Vertical steps on the left with status (done / current / error / locked), save and resume, Back never loses data, a final review step before commit, progress kept per user.

### ✅ §20 Advanced data tables (decided 28 Sep 2026: full set on every list)
Sort · filter bar + column filters · saved views (personal and shared) · column show / hide / reorder / resize · frozen first column and header · row selection + bulk actions · inline edit where allowed · group by · totals row for money columns · density toggle · pagination for large sets or virtual scroll up to 10k rows · export CSV / Excel respecting P02 field classes · empty / loading / error states (§26) · row click opens the quick-view drawer · full keyboard navigation. **Formatting:** numbers right-aligned and tabular, dates dd MMM yyyy, status as badges, people as avatar + name, IDs in Plex Mono.

### ✅ §21 Org chart widget (decided 28 Sep 2026)
Top-down tree with person cards (photo, name, role, team size) · expand / collapse per branch · search and jump to person · zoom and fit · views: reporting lines / department / position (vacant positions dashed) · dotted-line managers as dashed connectors · export PDF / PNG · respects P02 visibility (hidden fields never shown) · mobile uses a list drill-down instead of the tree. What-if restructuring stays Later (T23).

### ✅ §22 Dashboards and §23 Charts (decided 28 Sep 2026)
- **Role-based home:** employee, manager, HR admin, payroll admin and recruiter each get a default home made from a small widget set.
- **Order on every home:** "Needs your action" list first (approvals, tasks, deadlines), then key numbers, then trends.
- **Stat card:** label, big figure (Plex 28 px, tabular), change against the last period in words ("4 more than August"), and a link to the list behind it. Never a number the user cannot drill into.
- **Personalisation:** users add, remove and reorder widgets within what their role may see.
- **Charts:** bar and line by default; no 3-D; no pie with more than 4 slices; no decorative donuts; direct labels in preference to legends; one accent series, others in slate; small groups suppressed per P09.
- Charts animate once on first draw, 400 ms or less (§7); every chart has a "View as table" option for accessibility.

### ✅ §24 Badges, tags, avatars and §25 Feedback (decided 28 Sep 2026)
- **Badge:** 20 px high, 4 px radius, tinted background with darker text from §3, always text (never a dot alone). One status vocabulary per object: Draft, Pending, Approved, Rejected, Paid, Locked and so on, defined in the object catalogue.
- **Tag:** neutral grey, user-defined labels, removable with ×.
- **Avatar:** photo or initials on a muted tint derived from the name; sizes 20 / 24 / 32 / 40 / 64; groups show 3 avatars and "+N".
- **Toast:** bottom-left, 5 s, with Undo wherever the action allows; at most 3 stacked; errors never auto-dismiss.
- **Inline alert:** inside a form or section for errors and warnings tied to that content.
- **Page banner:** system-wide states only, such as trial, maintenance, read-only or impersonation.

### ✅ §26 Data states (decided 28 Sep 2026)
- **Loading:** skeleton in the real layout's shape, never a page-wide spinner; after 10 s, say what is happening.
- **First-use empty:** one sentence of explanation, the primary action and a help link ("No leave types yet. Add your first leave type."). No sad-face or decorative illustrations.
- **Filtered empty:** "No results for these filters" with Clear filters.
- **Error:** what failed, what to do next, Retry, the user's input kept, and a reference ID for support.
- **No permission:** say who can grant access; never a blank page.
- **Offline (mobile):** banner plus queued actions that sync later.
- **Partial data:** show what loaded and mark what did not.

### ✅ §27 First-time experience (decided 28 Sep 2026)
- **Admin:** welcome screen with 3 questions (company size, products, country and states), then the quick-start lane for the chosen product (5-minute first value, P20), then the setup hub checklist with progress (APX-E). A sample-data toggle lets admins explore safely.
- **Employee:** first login shows a 3-step intro (your profile, your payslips, how to apply leave) and a dismissible "Complete your profile" card.
- **Tips:** contextual tips appear once per feature and never block the screen. No 10-step pop-up product tours.

### ✅ §28 Calendar and roster, §29 Kanban and timelines (decided 28 Sep 2026)
- **Calendar:** month, week, day and agenda views for leave, holidays, interviews and exams. The team calendar shows who is away.
- **Roster:** people as rows, days as columns, shifts as coloured blocks that also carry a text code (G, N, M). Drag to assign, with a menu alternative for keyboard users. Conflict warnings inline. A publish step comes before staff see the roster.
- **Kanban:** only for hiring pipelines and helpdesk. Cards show avatar, name, two facts and days in stage. Drag between columns, with a "Move to" menu alternative.
- **Activity timeline:** vertical, newest first, actor + action + time, grouped by day.

### ✅ §30 Search, filters and command palette (decided 28 Sep 2026)
- **Global search (Ctrl/Cmd+K):** people, requests, jobs, candidates, documents, settings and actions ("Apply leave", "Run payroll"). Results grouped by type, keyboard-first, recent items on open, permissions respected.
- **Filter bar:** chips for active filters, a "More filters" panel, and filter state in the URL so views can be shared.
- **List search:** instant with a 200 ms debounce; matches name, ID, email and phone.

### ✅ §31 Upload and documents, §32 Notifications and approvals inbox (decided 28 Sep 2026)
- **Upload:** drag-drop or browse; allowed types and size limit shown before upload; progress per file; virus-scan status; retry.
- **Document viewer:** inline PDF and image preview in a drawer, download, version history, e-sign status.
- **Notifications:** bell with unread count, grouped by day, "Mark all read", per-type settings (APX-A).
- **Approvals inbox:** one list of everything waiting for me across all products. Each row shows who, what, amount or dates, and the policy-check result, with inline Approve and Reject. Bulk approve only for low-risk items.

### ✅ §33 Tooltips and menus, §34 UX writing (decided 28 Sep 2026)
- **Tooltips:** short; only for icon-only buttons and truncated text; never hide required information in them; 500 ms delay.
- **Menus:** about 8 items at most, grouped with dividers, destructive items last and in red.
- **Voice:** plain Indian English, sentence case, "you" for the user, verbs on buttons, no jargon, no exclamation marks.
- **Errors:** no blame ("We couldn't save your changes", not "You failed to…"), always say what to do next.
- **One term per concept:** a product glossary is kept in `packages/ui` docs ("leave", never mixed with "time off" or "absence").

### ✅ §35 Formats, §36 Accessibility, §37 Responsive (decided 28 Sep 2026)
- **Dates:** dd MMM yyyy (28 Sep 2026). **Time:** 12-hour for India, 24-hour as a user option; time zone shown when it differs from the user's.
- **Money:** ₹ with lakh / crore grouping (₹12,34,567); other currencies by locale. **Names:** stored and shown as the person enters them; no forced first / last split.
- **Accessibility:** WCAG 2.2 AA (P21). Text contrast 4.5:1, visible focus, full keyboard use, screen-reader labels, targets at least 24 px (44 px on mobile), no colour-only meaning, reduce-motion honoured, axe checks in CI.
- **Responsive:** every employee and manager task works fully on mobile. Admin-heavy screens (payroll setup, rule builder, workflow studio) are desktop-first with a read-only mobile view.

### ✅ §38 Tenant theming, §39 Localisation (decided 28 Sep 2026)
- **Company can set:** logo, one accent colour (contrast auto-checked; we generate the ramp), login background image, email header.
- **Where it applies:** employee and candidate surfaces only (careers, candidate portal, employee home, emails). Admin screens stay YukthiX Azure. No custom fonts or layouts.
- **Languages:** English at launch, then Hindi, Tamil and Telugu (fonts per §2). All text in message files, none in images. Layouts allow 40% text growth. RTL-ready for Arabic later.

### ✅ §40 Special surfaces (decided 28 Sep 2026: adopt + careers page builder)
- **Test-taking:** distraction-free full screen, 16 px text, no sidebar, timer always visible (amber at 5 minutes, never flashing), question navigator, autosave indicator.
- **Careers page and candidate portal:** tenant-branded, mobile-first, loads in under 2 s, apply in under 3 minutes.
- **Careers page builder:** drag-and-drop sections (hero, about, values, benefits, open jobs, locations, team photos, FAQ, footer) from a fixed, pre-designed section library, with 3 layout themes that all obey this design system. Companies pick sections, reorder them and fill content; they cannot change fonts, spacing or add free-form HTML. Preview on desktop and mobile, then publish. Sits in P20 growth scope; no extra charge (D18).
- **Print and PDF** (payslips, letters, reports): A4, Plex, black on white, company logo, page numbers, no UI chrome.
- **Email:** single column 600 px, plain layout, one button, text-only fallback, works in dark mode.

### ✅ §41–44 Governance (decided 28 Sep 2026)
- **§41 Tokens in three layers:** primitive (`azure-500`), semantic (`color.action.primary`, `color.status.danger.text`), component (`button.primary.bg`). Code uses only semantic and component tokens; lint blocks raw hex and px values.
- **§42 Storybook:** every component with all variants and states, the a11y add-on, and visual regression on every pull request (Playwright screenshots).
- **§43 Versioning and contribution:** semver for `packages/ui`, a changelog, deprecate for one release before removal. A new component needs a problem statement, design review, a Storybook story and an a11y check.
- **§44 Design QA checklist** (required before any screen ships):
  1. Uses only tokens; no raw colours or sizes.
  2. One primary action; hierarchy per §11.
  3. All data states designed (§26).
  4. Keyboard and screen-reader pass; contrast pass.
  5. Works at 375 px or has a stated desktop-only reason.
  6. Copy follows §34; formats follow §35.
  7. No item from the §0 banned list.
  8. Reviewed by a human designer.

### ✅ §1 Brand expression and §9 Imagery in product (decided 28 Sep 2026: quiet)
- Inside the app the brand shows as Azure on actions, focus and selection, and the X monogram at the top of the rail. Nothing else.
- Personality comes through words (§34) and the rare milestone delights (§7), not decoration.
- **Photos:** real photos of real employees only (avatars, org chart, careers team section). No stock photos.
- **Illustration:** one small set of flat, geometric line drawings for the login screen and careers page, commissioned with the icon set. No 3-D, no AI-generated art, no illustrations on empty states.
- The marketing website may be louder; the product stays quiet.

### ✅ §45 AI assistant panel (added 28 Sep 2026; P22 / P23)
- Right-side panel, 400 px, opened with Ctrl/Cmd+J or the "Ask" button in the top bar; pushes content rather than covering it on wide screens.
- Chat answers cite their sources (policy, record, report) as links.
- **Before any change to data:** the assistant shows a preview of exactly what will change, marked with the "AI" badge, and the user presses Confirm. It never changes data silently.
- Conversation history, thumbs up / down feedback, "Stop" while generating, and a clear note when the answer is uncertain.
- Purple (§3) is used only inside this panel and on AI suggestions elsewhere, always with the "AI" text badge. No sparkle icons.
- Respects permissions: the assistant can see and do only what the user can.

### ✅ §46 Visual builders (added 28 Sep 2026; P19 rule builder, P22 workflow studio, form and report editors)
- **Layout:** left palette of blocks, centre canvas, right properties drawer, bottom test-run panel.
- **Canvas:** nodes with connectors, snap to an 8 px grid, zoom and fit, mini-map for large flows. Rules can also be edited as a plain "When / If / Then" list for users who prefer text.
- **Safety:** every change is a draft until published; test-run with sample records before publishing; version history with side-by-side compare; one-click roll back.
- Validation errors shown on the node itself and listed in the test panel.

### ✅ §47 Comments and mentions (added 28 Sep 2026)
- A comment thread on any object page (in the right activity panel, §10).
- @mention people (they get a notification), attach files, edit within 15 minutes, resolve a thread.
- **Private HR notes:** visible only to the HR roles chosen, marked with a lock icon and "Private" label; never shown to the employee.

### ✅ §48 Chart palette and dark-mode tokens (added 28 Sep 2026)
**Categorical palette** (multi-series charts, in this order, checked for colour-blind separation; purple is excluded because it means AI):

| # | Name | Hex |
|---|---|---|
| 1 | Azure | #3B5FE3 |
| 2 | Teal | #0E9384 |
| 3 | Orange | #E07A2E |
| 4 | Magenta | #C2417A |
| 5 | Olive | #5B8C2A |
| 6 | Sky | #2E90C9 |
| 7 | Ochre | #B5891A |
| 8 | Slate | #64748B |

- More than 8 series: group the rest as "Other".
- **Sequential** (heatmaps, density): Azure 50 to 800. **Diverging** (above / below target): danger text, slate 100, Azure 700.
- Status colours are never used as series colours.

**Dark-mode semantic tokens:**

| Token | Light | Dark |
|---|---|---|
| bg.page | #F7F8FA | #0B1220 |
| bg.surface (cards, tables) | #FFFFFF | #111A2B |
| bg.raised (menus, drawers) | #FFFFFF | #172236 |
| border.hairline | #E2E8F0 | #1E293B |
| text.primary | #0B1220 | #E2E8F0 |
| text.secondary | #475569 | #94A3B8 |
| action.primary | #3B5FE3 | #6F8BF0 |
| focus.ring | #3B5FE3 | #8FA4F0 |
| success text / bg | #1F6F4A / #E8F4EE | #6CCB9A / #10281D |
| warning text / bg | #8A5A00 / #FBF3DD | #E8B85A / #2B2210 |
| danger text / bg | #B42318 / #FDEDEC | #F4877D / #2E1414 |
| ai text / bg | #6941C6 / #F2EEFB | #B69CF0 / #211A36 |

Dark mode has no shadows on in-page elements; raised layers are separated by the lighter surface colour instead. Every text / background pair must be checked at 4.5:1 in Storybook before release.

---

## Component inventory (v1, 28 Sep 2026)

Every component below lives in `packages/ui`, uses only §41 tokens, has a Storybook story with all states, and passes §44. **Source** says where we start: **Keep** = existing exam-app `ui-v2` component restyled; **Radix** = Radix / shadcn primitive restyled; **Build** = our own. 21st.dev may be used as a starting reference for any of them (§0 policy).

### Foundations
| Component | Source | Rules |
|---|---|---|
| Text, Heading | Keep | Only §2 scale steps; one 22 px page title |
| Icon | Build | Lucide 1.5 px outline for dense UI, 16 / 20 px; `ColorIcon` (Fluent Color, registry) for areas, tiles, empty states, 20 / 24–32 / 48 px (§8) |
| Logo, Monogram | Build | From the designer's files only |
| VisuallyHidden, FocusRing, Portal | Radix | Accessibility plumbing |

### Actions
| Component | Source | Rules |
|---|---|---|
| Button | Keep | Primary / secondary / ghost / danger / link; 32 / 36 / 40 (§15) |
| IconButton | Keep | Square, tooltip and aria-label required |
| ButtonGroup, SplitButton | Build | Split for "Approve / Approve with note" |
| Link | Keep | Underline on hover and focus |
| DropdownMenu | Radix | 8 items at most, destructive last (§33) |

### Inputs and forms
| Component | Source | Rules |
|---|---|---|
| TextField, TextArea, PasswordField | Keep | Label above, helper below, "Required" text (§16) |
| NumberField, CurrencyField (₹) | Build | Lakh / crore grouping, tabular |
| Select, Combobox, MultiSelect | Keep / Radix | Search inside when more than 7 options |
| Checkbox, Radio, Switch | Radix | Switch only for instant on / off settings |
| DatePicker, DateRangePicker, TimePicker | Build | dd MMM yyyy, typing and calendar |
| MaskedField (PAN, IFSC, UAN, Aadhaar-masked, phone) | Build | Live format check |
| PersonPicker, OrgUnitPicker, EntityPicker, LocationPicker | Build | Photo, name, role, department |
| FileUpload, Dropzone | Build | Type, size, progress, scan status (§31) |
| RichTextEditor | Build | Letters and policies; limited toolbar |
| FormField, FormSection, ErrorSummary, StickySaveBar | Build | §16 layout |
| ConditionBuilder | Build | When / If / Then rows (§46, P19) |

### Navigation and layout
| Component | Source | Rules |
|---|---|---|
| AppShell | Keep | Rail, panel and top bar (§12) |
| SideRail (56 px), SidePanel (240 px) | Keep | Role-filtered, counters, favourites |
| TopBar | Keep | Search, entity switcher, bell, help, profile, Ask |
| CommandPalette | Build | Ctrl/Cmd+K, records and actions (§30) |
| Breadcrumbs | Build | Deep pages only |
| Tabs | Keep | Object pages; URL per tab |
| PageHeader | Build | Title, facts, status, up to 3 actions (§11) |
| ObjectHeader | Build | Person / job / pay run header with photo and chips (§13) |
| MobileTabBar | Build | Home, Time, Requests, Pay, Me |
| Grid, Stack, Divider, Card, Panel | Keep | Flat cards, hairline borders (§5–6) |

### Overlays
| Component | Source | Rules |
|---|---|---|
| Dialog, ConfirmDialog, TypeToConfirmDialog | Keep | 480 / 640 px (§17) |
| Drawer (slide-over) | Build | 480 / 720 / full, at most 2 stacked (§18) |
| Popover, Tooltip | Radix | 500 ms tooltip delay |
| BottomSheet | Build | Mobile replacement for drawers and menus |
| AssistantPanel | Build | §45 |

### Data display
| Component | Source | Rules |
|---|---|---|
| DataTable | Keep (extend) | Full §20 set; virtual scroll |
| FilterBar, FilterChip, SavedViewMenu, ColumnManager, BulkActionBar | Build | §20, §30 |
| DescriptionList (key and value facts) | Build | Object page overview |
| Badge, Tag, Avatar, AvatarGroup | Keep / Build | §24 |
| StatCard | Keep | Figure, change in words, drill link (§22) |
| Charts: Bar, Line, Area, StackedBar, Heatmap, Funnel | Build | §23, §48 palette, "View as table" |
| Gauge | Keep | Only for a single progress-to-target value |
| Timeline, ApprovalTimeline, ActivityFeed | Keep | §29 |
| OrgChart | Build | §21 |
| Calendar, TeamCalendar, RosterGrid | Build | §28 |
| KanbanBoard | Build | Hiring and helpdesk only (§29) |
| DocumentViewer | Build | PDF / image in drawer, versions, e-sign status |
| CommentThread | Build | §47 |
| EmptyState, Skeleton, ErrorState, NoAccessState | Build | §26 |

### Feedback
| Component | Source | Rules |
|---|---|---|
| Toast | Build | Bottom-left, 5 s, Undo, errors persist (§25) |
| InlineAlert, PageBanner | Build | §25 |
| ProgressBar, Spinner | Build | Spinner only inside buttons and small areas |
| MilestoneMoment | Build | The five §7 delights; reduce-motion safe |

### Workflow and product patterns
| Component | Source | Rules |
|---|---|---|
| Stepper (vertical wizard) | Build | §19 |
| SetupChecklist, QuickStartLane | Build | §27 |
| ApprovalInboxRow | Build | Who, what, amount / dates, policy check, inline actions (§32) |
| NotificationCentre | Keep (NotificationBell) | §32 |
| BuilderCanvas, NodeCard, PropertiesDrawer, TestRunPanel, VersionCompare | Build | §46 |
| CareersSectionLibrary, PageBuilder | Build | §40 |
| ExamShell, QuestionNavigator, ExamTimer, AutosaveIndicator | Keep (exam app) | §40 test-taking |
| PrintLayout (payslip, letter, report) | Build | A4, §40 |
| EmailLayout | Build | 600 px, §40 |

**Build order:** Foundations, Actions and Inputs first; then AppShell and Overlays; then DataTable and data states; then product patterns as each module is built.

### ✅ §15a Buttons on data screens: tables, filters, timesheets, projects (founder review, 29 Sep 2026)
Every button with a text label has a border or a fill. Borderless is only for icon-only buttons, which always have a tooltip.

| Place | Buttons | Style |
|---|---|---|
| Page header | Secondary actions (Import, Export all), then **one** primary (Add employee, New project) on the right | Secondary bordered + one primary |
| Table toolbar | Filter, Clear all, View menu, Group, Columns, Export; density as an icon button | Small (32 px) secondary bordered; density is an icon button with a border |
| Filter chip | The chip itself opens its editor; the × removes it | Chip is bordered; × is part of the chip |
| Bulk bar (rows selected) | Actions for the selection, then Clear selection | Small secondary; irreversible ones (Close projects, Start exit) are danger, and still confirmed |
| Row | At most two inline actions (Approve, Send back), then the "⋯" menu | Inline: small secondary with icon + verb; "⋯" is icon-only |
| Row menu (⋯) | Open, edit and other actions; destructive last, in red, after a separator | Menu items |
| Column header | Click the name to sort; the small arrow opens column options (sort, group by, hide) | Arrow is icon-only, shown on hover or focus |
| Pagination | Previous and Next | Icon-only with a border |
| Timesheet header | Previous week, Next week (icon, bordered), This week, Copy last week, Save draft (secondary), **Submit week** (primary, full width on phones) | As listed |
| Timesheet rows | Add row (secondary with +); Remove row (icon-only trash with tooltip) | As listed |
| Empty and error states | The one way forward: New project (primary), Clear filters, Retry (secondary) | As listed |
| Drawer footer | Cancel or Close (secondary) left of the primary Save | Secondary + primary |

### Build log
- **7 Oct 2026, colour icons (§8):** `ColorIcon` + `COLOR_ICONS` registry in `@yukthix/ui` (Fluent UI System Icons Color, MIT, `@fluentui/react-icons` 2.0.343 pinned). Preview story "Foundations / Icons / Colour icons"; the real navigation still uses Lucide until the founder signs off.
- **29 Sep 2026, a11y correction to §3:** muted text uses **Slate 550 `#5B6778`** instead of Slate 500 `#64748B`. The axe check in Storybook showed `#64748B` falls just under 4.5:1 on the page (`#F7F8FA`) and subtle (`#F3F5F7`) backgrounds. Slate 500 stays for icons, borders and chart slate.
- **29 Sep 2026, phase 1 built:** `@yukthix/ui` (folder `yukthix-ui` next to this one) has foundations, actions, form structure, all inputs and pickers, badges and avatars, with Storybook, tests, the token check and a clean axe run in light, dark and compact. Status and next phases: `yukthix-ui/README.md`.
- **29 Sep 2026, data screens built:** DataTable (full §20 set), FilterBar with chips and shareable URL, SavedViewMenu, ColumnManager, Drawer, InlineAlert, Empty / Error / No-access states, Skeleton, Meter, Pagination, TimesheetGrid (M12 week grid + phone day list). Button rules for these screens in §15a.
- **29 Sep 2026, full inventory built:** all 11 families of the component inventory are in `@yukthix/ui` (322 stories, 169 tests), plus screenshot tests and a real-company-name check for sample data. Build status: `yukthix-ui/README.md`.
