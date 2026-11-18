# Compare summary: all areas (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder. One line per area, then one build order across all areas. Row ids point into
the area files:
- `compare-attendance-leave.md`;
- `compare-timesheet-projects.md`;
- `compare-approvals-team.md`;
- `compare-expenses-pay.md`;
- `compare-performance.md`;
- `compare-helpdesk-engage.md`;
- `compare-people-lifecycle.md`;
- `compare-admin-platform.md`.

The YukthiX column in every file was checked in code on `test/yukthix-main`. Size: S, M or L.

## Picks per area

| Area | Rows | Keep ours | Take | Mix | Skip | Top 3 to build |
|---|---|---|---|---|---|---|
| Attendance and leave | 42 | 14 | 20 | 6 | 1 | Leave C2 full history; Attendance A1 / A2 list view and day panel; Attendance B4 hourly permission |
| Timesheet and projects | 34 | 15 | 14 | 3 | 2 | A5 "Not sent" weeks; B1 approval drill-down; A3 copy last week |
| Approvals and notifications | 14 | 8 | 5 | 1 | 0 | A8 HR view of all pending approvals; A3 bulk reject; A2 three-column desk |
| Team view (manager) | 11 | 2 | 8 | 0 | 1 | C7 bulk penalty waiver; C3 team calendar dots; C5 negligence bands |
| Expenses and travel | 15 | 11 | 4 | 0 | 0 | A4 "Waiting on" column; A7 past-claim filters; A2 "Save and add another" |
| Pay, tax and payroll | 22 | 17 | 4 | 0 | 1 | B12 sign in again before salary; B7 declaration window cards; B3 salary timeline |
| Performance | 18 | 9 | 7 | 2 | 0 | A4 "no goals" with Remind; A2 progress summary; B2 quick actions and private notes |
| Helpdesk and HR letters | 13 | 10 | 3 | 0 | 0 | A10 POSH cases live; A7 ask your manager; A4 first-response column |
| Engagement | 9 | 1 | 5 | 1 | 2 | C1 announcements; C5 praise wall; C4 surveys |
| Org and people records | 15 | 12 | 2 | 0 | 1 | A4 company documents with expiry; A7 "About me"; A2 "Go to top" |
| Onboarding and exit | 15 | 15 | 0 | 0 | 0 | B2 grade and type rules; B4 Aadhaar e-sign; B5 background-check vendor |
| Admin and data safety | 19 | 6 | 10 | 3 | 0 | B4 sign in again; B2 recycle bin everywhere; A6 users and sign-in list |
| Home, navigation and reports | 13 | 5 | 7 | 1 | 0 | E1 / E2 reports library with schedules; D3 "last used" slot; D6 moved-page stubs |
| **All** | **240** | **125** | **89** | **17** | **8** | |

Notes:
- "Take" counts Take K and Take Z together.
- One attendance row (E1, team today) was "being built" and is now merged, so it has no pick.
- Attendance E2 (leave clash for the approver) is a Take K in its file, but the code audit found it live. It is not
  in the order below.
- YukthiX keeps its own way in about half the rows. It is far ahead on payroll, statutory work, onboarding and exit,
  expenses, and project cost and billing. The gaps are mostly daily-use views (lists, filters, nudges), engagement, and
  admin safety nets.

## Build order across all areas

### 1. Must for daily use

1. Pay B12 and Admin B4: sign in again before salary pages (S).
2. Attendance and leave C2: full leave history (S).
3. Admin B2: recycle bin across YukthiX (L).
4. Approvals A8: HR view of all pending approvals, with reassign (M).
5. Attendance and leave A1 / A2: list view and day panel (M).
6. Team C7: bulk waive late-mark penalties before payroll (M).
7. Attendance and leave B4: hourly permission (M).
8. Attendance and leave D15: LOP reversal (M).
9. Attendance and leave D11: exceptional working days (S).
10. Timesheet A5: "Not sent" weeks list (S).
11. Timesheet B1: approval drill-down (M).
12. Engagement C1: announcements (M).
13. Helpdesk A10: POSH cases live (M).
14. Admin E1 / E2: reports library with scheduled emails (L).
15. Team C3: team calendar dots and legend (S).
16. Team C5: negligence hour bands and breaks (M).
17. Approvals A3: bulk reject (S).
18. Attendance and leave A3: requests tab (S).
19. Pay B7: declaration window cards (S).
20. Admin A6: users and sign-in list (M).
21. People A4: company documents in folders with expiry (M).
22. Timesheet A3: copy last week (S).
23. Timesheet A14: daily nudge (S).
24. Timesheet B3: billable and non-billable totals (S).
25. Timesheet A8: request leave from the week (S).
26. Approvals A2: three-column desk (M).
27. Expenses A4: "Waiting on" column (S).
28. Expenses A7: past-claim filters (S).
29. Admin B1: activity log in plain sentences (S).
30. Performance A4: "no goals" list with Remind (S).
31. Performance A2: progress summary (S).
32. Performance B2: quick actions and private notes (S).
33. Helpdesk A7: ask your manager (S).
34. Helpdesk A4: first-response column (S).

### 2. Depth

35. Attendance and leave B6: bulk shift, weekly off and penalty changes (M).
36. Attendance and leave A9: office or remote label on each punch (M).
37. Attendance and leave D12: partial cancel and extend (M).
38. Attendance and leave D10: editable balance grid (S).
39. Attendance and leave D2 / D3 / D6 / D8: policy gallery, levels, clubbing, request limits (M).
40. Attendance and leave D9: comp-off auto credit and expiry (S).
41. Admin A2: modules list, on / off and order (M).
42. Admin A3: rule-based groups (M).
43. People B2: onboarding rules by grade and type (S).
44. Admin A5: pick a person per module (M).
45. Admin B3: scheduled backups (M).
46. Admin B5: import and export log (M).
47. Admin E4: headcount and attrition (M).
48. Team C6: leave overview cards (M).
49. Approvals A6: filter chips (S).
50. Approvals A4: "Decided by me" tab (S).
51. Notifications B3: Home nudges (S).
52. Notifications B2: WhatsApp and push choice (M).
53. Team C2: peers view (S).
54. Team C11: manager approves internal moves (S).
55. Timesheet A10 / A11: my projects with my hours (S).
56. Timesheet A9 / C4: tasks with assignees and a board (M).
57. Timesheet C2: actions pending and who is on leave (M).
58. Timesheet C10: per-project settings (M).
59. Timesheet B4: second approval level (M).
60. Timesheet C11: hours reports (M).
61. Timesheet A2: view switch (S).
62. Timesheet A6: activity card (S).
63. Pay B3: salary timeline (S).
64. Pay B1: pay summary (S).
65. Pay B4: download the year (S).
66. Expenses A2: "Save and add another" (S).
67. Expenses A6: advance rules (S).
68. Performance D3: "What is expected of me" page (M).
69. Performance D1 / D2: skills profile and matrix live (L).
70. Performance B1: agenda templates and calendar sync (M).
71. Performance A3: goal templates and import (M).
72. Performance C2: bell-curve guide (S).
73. Engagement C5: praise wall (M).
74. Engagement C4: surveys (L).
75. Engagement C3: polls (M).
76. Engagement C6: new joiners (S).
77. Helpdesk A5: satisfaction filter (S).
78. Helpdesk B1: bonafide letter template (S).
79. Home D2: choose Home widgets (S).
80. Home D3: "last used" slot (S).
81. Home D5: quick create (M).
82. Home D6: moved-page stubs (S).
83. Admin A4: settings and work-page cross-links (S).
84. Admin C1: renaming terms and Hindi screens (L).
85. Home D8: phone screens live (L).
86. People A2: "Go to top" (S).
87. People A7: "About me" (S).

### 3. Later

88. Attendance and leave A5: me vs team stats (S).
89. Attendance and leave C3: leave charts (S).
90. Attendance and leave D14: calendar sync (M).
91. Team C4: leaderboards (M).
92. Team C9: team reports in the library (L, with item 14).
93. Approvals A9: WhatsApp approvals (M).
94. Timesheet A7: attach a file (S).
95. Timesheet B5: phone approvals (M).
96. Timesheet C3: add several people at once (S).
97. Expenses A15: phone capture live (M).
98. Expenses A3: receipt reading switched on (S).
99. Performance D4: learning (L).
100. Engagement C2: feed (L).
101. People B4: Aadhaar e-sign (M).
102. People B5: background-check vendor link (M).
103. Admin C2: custom forms (L).
104. Admin C3: workflows (L).
105. Admin E3: report builder (L).
106. Admin A1: field-level control (M).

## Founder decision (17 Nov 2026, "ok for all")

Tier 1 is built in seven batches by area, in this order, after the assessments slices:
- **A. Attendance and leave daily:** 2, 5, 18, 7, 8, 9, plus attendance-leave C4 "Notify colleagues" on Apply leave.
- **B. Safety:** 1, 29, 20 first, then 3 (recycle bin).
- **C. Approvals and team:** 4, 17, 26, 6, 15, 16.
- **D. Timesheet:** 10, 11, 22, 23, 24, 25.
- **E. Pay and expenses quick wins:** 19, 27, 28.
- **F. Performance and helpdesk quick wins:** 30, 31, 32, 33, 34, 13.
- **G. Bigger single pieces:** 12, 14, 21.

Tiers 2 and 3 are decided after tier 1. Attendance-leave E2 (leave clash) is already live and off the list.

## Payroll (Zoho Payroll compare, 17 Nov 2026)

From `compare-payroll.md` (Zoho Payroll India trial, Keka My Finances, YukthiX code). 66 rows; 64 have a pick (two
point to `compare-expenses-pay.md`).

| Keep ours | Take Z | Mix | Skip |
|---|---|---|---|
| 42 | 10 | 11 | 1 |

YukthiX is ahead on runs, filings, arrears, bonus, F&F and controls. Zoho is ahead on statutory breadth (every PT and
LWF state, loan perquisites, flexible benefits, the new Act's section names).

Top 5 must-builds. They do not fit batches A to G, so they go in a new batch:

- **H. Payroll:**
  1. D4: PT rule files for every PT state (M).
  2. D14: loan perquisite worked out into TDS (M).
  3. D10: new Income Tax Act section numbers with the old ones in brackets (S).
  4. B2: "PF only below the ₹15,000 ceiling" component flag (S).
  5. A2: block run approval when the entity's TAN, PAN or a PT registration is missing (S).

The rest of the payroll Must tier (B8 / E5 flexible benefits, D5 LWF states, E1 open and lock declaration windows,
A3 "Not ready for payroll" on People, E2 HR declares on behalf) follows in batch H after these five.

## Founder decision (17 Nov 2026, "ok for all"): payroll and multi-country

- **Batch H (Payroll statutory) moves before batch C.** The order is now A, B, H, C, D, E, F, G. H covers:
  - PT rule files for every PT state;
  - the loan perquisite in TDS;
  - the new Income Tax Act section names;
  - the "PF only below ₹15,000" component flag;
  - blocking pay-run approval when PAN, TAN or PT registration is missing.

  LWF for every state and the bonus minimum wage per state go into H too.
- **Multi-country:**
  - HR works in any country, with per-country rule packs, currencies and time zones.
  - Payroll stays India-first; other countries connect to local payroll or EOR partners.
  - The Oracle pass covers multi-country (entities, countries, currencies) next to the six enterprise areas.
- **Enterprise batch:** gaps from the enterprise readiness check (costing and GL, retro pay, approval rules, position management, absence depth, audit history) become an "Enterprise" batch after tier 1, or earlier for a big customer.
- **India rule files marked "verify":** they must be checked by a CA before any real company goes live on payroll.

## Founder decision (17 Nov 2026, "ok for all"): GLPI ideas

- **Added to batch F (helpdesk quick wins):** GLPI 4, 8 and 10 from `glpi-docs.md`:
  - requester chase with auto-solve after N days with no reply (S);
  - OLA team targets on tickets (S);
  - rule export and import (S).
- **New "IT assets" batch, with the Enterprise batch after tier 1:** GLPI 1, 2, 3, 5, 6 and 7:
  - helpdesk IT asset register (L);
  - warranty and finance per asset (M);
  - asset booking (M);
  - vendor contracts and suppliers (M);
  - software licence seats (M);
  - ticket and change costs rolling into budgets (M).
- **GLPI 9:** notification templates in more languages, with the Hindi/locale work (Admin C1).

## Founder decision (17 Nov 2026, "ok for all"): earlier gap order folded in

Four items the founder had ranked first earlier move from tier 2 into **batch A**:
- attendance-leave D12: partial cancel and extend;
- D10: editable balance grid;
- A9: office or remote on each punch;
- B6: bulk shift, weekly-off and penalty changes.

Batch A is now: 2, 5, 18, 7, 8, 9, C4, D12, D10, A9, B6. The order stays A → B → H → C → D → E → F → G. This
replaces the 17 Nov "gap order" in `keka-ideas-map.md`; every item from it is now placed (calendar sync is tier 3,
backups tier 2).

## Founder decision (17 Nov 2026, "ok for all"): statutory findings

1. **Urgent fix, ahead of the queue:** the PF and EPS wage ceiling becomes a dated rule: ₹15,000 before 17 Sep 2026, ₹25,000 from 17 Sep 2026 (S.O. 5109(E); the CA to confirm).
2. **Same fix:** Tamil Nadu (Greater Chennai) PT deduction months become August and January, with the due date per the 4 Aug 2026 notice.
3. **Batch H follows the H1–H16 builder list** in `reference/statutory/india-state-rules-2026-27.md`. Officially confirmed states go first; the rest wait for the CA.
4. **CA checklist:** section 6 of that file goes out as a document for the CA.

**Founder answers (17 Nov 2026, "ok for all"), 2310 to 2316 (batch A):**
- 2310: hourly permission limits are a company setting, default 2 per month of up to 2 hours each; permission does not use leave; past the limit the request is refused (no automatic short day).
- 2311: an employee may ask to cancel days not yet taken, up to the leave's last day; extend is a new linked request; both go to the approver; HR may cancel any day with a reason (audited).
- 2312: a day with both office and remote punches follows a company setting (office wins / remote wins / first punch), default office wins.
- 2313: notify up to 10 colleagues, told on approval (not on applying), with the dates only, never the type or reason.
- 2314: each balance-grid edit needs a reason, is audited and posted as a ledger adjustment, and may not go below the leave type's minimum balance.
- 2315: LOP reversal for locked months goes through payroll corrections, paid in the next run; for an open month the drawer sends HR to regularisation.
- 2316: bulk shift, weekly-off and penalty-policy changes apply from a chosen date, never before the last locked attendance month.

**Builder questions (batch A part 2, 17 Nov 2026), each with the default built:**
- 2320: hourly permission uses the on-duty date window (asked up to 30 days ahead or 60 back, the on-duty settings). Suggested answer: keep it; give permission its own two settings only if HR asks.
- 2321: "Reverse loss of pay" sends all the picked days in one call (POST /payroll/corrections/lop-reversal, the same rules and approver as POST /payroll/corrections, one HR correction per day) so a bad day saves none. Suggested answer: keep it.
- 2322: in the reversal drawer HR types the days; it does not yet list the person's LOP days of that month. Suggested answer: add the list later from the locked month's attendance (read-only), keep typing as the fallback.
- 2323: "Notify colleagues" is offered when people apply for themselves, not when HR or a manager applies on someone's behalf. Suggested answer: keep it for self only.
- 2324: colleagues are told on approval only; if the leave is later cancelled they are not told again. Suggested answer: tell them "no longer away" on a cancel, same dates-only rule (small follow-up).

**Founder answers (17 Nov 2026, "ok for all"), 2320 to 2324 (batch A part 2):**
- 2320: hourly permission uses the on-duty date window (30 days ahead, 60 back); its own settings only if HR asks.
- 2321: the LOP reversal sends all days in one call, so one bad day saves none.
- 2322: the reversal drawer will list the person's loss-of-pay days to pick from, later.
- 2323: "Notify colleagues" is offered only when applying for yourself.
- 2324: when approved leave with notified colleagues is cancelled (fully or some days), they are told "no longer away", dates only.

## Accessibility batch (founder request, 17 Nov 2026; answers 2330 to 2333, "ok for all")

Reference: the Income Tax Department site's Accessibility menu (font size, saturation, screen reader, high contrast, basic HTML, invert colours).

- 2330: build an Accessibility menu with
  1. text size (5 steps, about 90 % to 150 %, scaling the --yx-text-* tokens; the no-scroll rule relaxes at the larger steps);
  2. a High contrast theme beside Light and Dark;
  3. a Reduce motion switch (as well as the OS setting);
  4. reading spacing (line and letter spacing, underlined links);
  5. a stronger focus outline;
  6. Reset.
  Choices are saved per person (follow them across devices), and a company can never turn them off. Plus automated WCAG 2.1 AA checks (axe) in the kit guards and a one-time NVDA pass on the main flows. Skipped: an in-site screen reader button, saturation, invert colours, basic HTML view (the OS and the user's own screen reader do these better; colour is never the only signal).
- 2331: the menu is on the staff top bar, the sign-in pages, the candidate and careers pages, and the exam screens.
- 2332: built as its own small batch right after batch A, before batch B.
- 2333: after it is built, publish a WCAG 2.1 AA conformance statement, with known gaps listed honestly.
- 2334 (17 Nov 2026, "good"): follow india.gov.in's Accessibility Tools panel as the layout reference: a grid of tiles in groups (Contrast: High contrast / Normal; Text size: Increase / Decrease / Reset; Text spacing and Line height as two separate tiles; Others: Big cursor). Add Big cursor; skip Hide images and the in-site Screen reader. Reduce motion and the stronger focus outline stay. Our own YukthiX design.

**Builder questions (batch A part 3, 17 Nov 2026), each with the default built:**
- 2325: HR's "cancel any day with a reason" is built in the API (POST /time/hr/leave/:employeeId/requests/:id/cancel-days, audited) but has no screen yet; the employee's TIM-19 drawer is the one built. Suggested answer: add a "Cancel some days" button to HR's view of a person's request in the next HR leave slice, reusing the same drawer (it already has an HR mode).
- 2326: when some days are cancelled, an approval delegation set for the leave stays for the original dates. Suggested answer: keep it (the approver is back but the delegate can still act); trim it per day only if approvers ask.
- 2325 (17 Nov 2026, "ok"): add HR's "Cancel some days" button now, reusing the drawer's HR mode.
- 2326 (17 Nov 2026, "ok"): after a partial cancel, the leave's approval delegation keeps the original dates; trim per day only if approvers ask.

## Oracle-based additions (founder answers 2340 to 2342, 17 Nov 2026, "all ok"; detail in compare-oracle.md)
- 2340: the Enterprise batch gets positions (O1–O6, O8, O9), the approval rules editor (O24–O26, the PLT-12 shape), automatic back-dated pay (O13, O14), costing (O19–O22) and payroll controls (O16, O17). It keeps its place after tier-1 batches A → H → … → G.
- 2341: positions are a company setting, off by default.
- 2342: fold into current leave work now: a ceiling (maximum balance) per service band (O10), and a period of ineligibility, "no accrual for the first N months", as a setting (O11).
### Accessibility batch: builder questions (17 Nov 2026), each with a suggested answer

- 2350: High contrast is one look today (black on white). Add a dark high-contrast look (white on black) too, chosen by the Light / Dark choice? Suggested: yes, later, as its own small item; the device's own high-contrast mode already works.
- 2351: On a shared computer, a signed-in person whose account has never saved choices keeps what this browser has (for example text made bigger on the sign-in page). Keep that, or reset to normal at sign-in? Suggested: keep it (a low-vision person who enlarged the sign-in page should not lose it); their first change saves to their own account.
- 2352: The public page `/yx/legal/accessibility` says "every screen in our design library is checked automatically", which is more than is true (the key screens are). Replace its text with the draft statement in `docs/yukthix/accessibility-statement.md` once you approve it, and which contact address goes in it? Suggested: yes, with accessibility@ the YukthiX domain.
- 2353: A support or impersonation session uses the menu but saves only in that browser, never on the person's account. OK? Suggested: yes.
- 2354: Big cursor uses a 40 px arrow and hand. Chrome may hide a cursor larger than 32 px near the edge of the window. Keep 40 px, or 32 px so it always shows? Suggested: keep 40 px.
- 2355: The old candidate pages outside the YukthiX design (the older welcome / readiness pages) and the `/v2` console have no Accessibility menu. Add it there, or wait until they are replaced? Suggested: wait; they are being replaced.
- 2356: Fix gap G-1 (the page behind an open dialog is hidden from screen readers but still in the code: 14 screen states flagged by axe) by making it inert, as the next small item? Suggested: yes.

**Founder answers (17 Nov 2026, "ok for all"):**
- 2350 to 2356 (accessibility): all as suggested. Dark high contrast later as a small item; a shared computer keeps the browser's choices until the person saves their own; replace the public accessibility page with the draft statement, contact accessibility@ the YukthiX domain; support and impersonation sessions save in the browser only; big cursor stays 40 px; old candidate and /v2 pages wait for replacement; fix G-1 (make the page behind an open dialog inert) next.
- 2360 to 2369 (batch B): all as suggested. Salary step-up needs a passkey or app factor (set-up prompt otherwise); HR and payroll pages only, not employees' own pay pages; salary keys are employee.salary.*, pay.range.* and payroll.* except payroll.query.handle; the re-check can be turned off (default on, audited, needs step-up); activity sentences in English now; the Accounts tab uses the security-admin key and user.manage plus step-up, never yourself or the last System Admin; add an invitation resend (never-signed-in only, old link revoked, 3 a day); recycle-bin first wave as listed (payroll and statutory never deletable); bin keeps 180 days by default, 30 to 365; the /v2 bin redirects to the new page.
- 2370 (17 Nov 2026, "ok"): when someone cancels "Confirm it's you" on a salary page, show "Confirm it's you to see salary details" with a Try again button (small kit follow-up).
- 2371 (17 Nov 2026, "ok"): the salary re-check keeps covering all payroll pages, including set-up screens with no amounts.

**Builder questions (batch A part 4, 17 Nov 2026), each with the default built:**
- 2327: the balance grid asks a reason for each cell (one dialog, one ledger line per edit). Suggested answer: keep it; add a "save several with one reason" mode for go-live and year-start loads only if HR asks.
- 2328: a penalty-policy change (free late marks, cost of each) starts on the 1st of a month, because late marks are counted a month at a time. Suggested answer: keep it.
- 2329: a fairness finding counts as "open" for Restore (2307) while the test's latest review is undecided or was decided Retire; Keep or Revise closes it. Suggested answer: keep it.
- 2335 (2330 to 2334 are taken): the bulk shift and weekly-off change saves each person's new week as a weekly shift pattern (named like "G · off Sat, Sun", reused by everyone with the same week). Suggested answer: keep; hide these generated patterns from the pattern list only if they clutter it.
- 2336: field staff punching with location recorded outside every office count as remote, like work from home. Suggested answer: add a third label "on site" for field staff later, if asked.
- 2337: the leave ceiling (2342) sits on the policy line beside the accrual rate, because years-of-service bands (D3) are not built yet; a credit over it is posted and lapsed at once so the ledger shows it. Suggested answer: move it into each band when D3 is built.
- 2327, 2328, 2329, 2335, 2336, 2337 (17 Nov 2026, "ok for all"): as built: one reason per balance-grid cell (a batch mode only if HR asks); penalty policy changes start on the 1st; a fairness finding is open while its latest review is undecided or decided Retire; bulk changes save generated weekly patterns (hide from the pattern list if they clutter it); field staff count as remote (an "on site" label later if asked); the leave ceiling moves into the service bands when D3 is built.
- 2390 to 2393 (17 Nov 2026): page translation and Bhashini are parked by the founder ("leave it now"). Notes for later: india.gov.in loads Bhashini's website_translation_utility.js (live machine translation of page text), Reverie Swalekh (Indic typing) and Reverie STT (voice search). If it is revisited: no live plugin on screens with personal data; human-reviewed translation files instead (C1).
- 2394, 2395 (18 Nov 2026, "ok", "go with your suggestion"): high contrast must be clearly visible. It follows the india.gov.in style: black page, white text, yellow headings, links, main buttons and focus ring, 2 px light borders, bright status colours. It replaces the black-on-white look and closes 2350.
- 2410 (18 Nov 2026): the founder chose to finish the agreed order first (batch B → H part 2 → v2 retirement → C → D → E → F → G → Enterprise → IT assets → tiers 2 and 3). The 226 designed-but-not-live screens (design-live-guard.known.json: about 65 phone screens, about 55 platform, 39 portals, 29 engage and learning, 18 proctoring, 6 compliance, 3 pay, 3 time, 2 settings, 1 kit) and the 9 performance and hiring live copies are planned after that.
- 2411 (18 Nov 2026, "ok"): when a batch works in an area, its builder also makes that area's already-designed, not-live screens live (and re-wires live copies) in the same batch, where they fit. Example: Engage and Learning screens in batches C–G, the 9 performance live copies when Performance is touched, proctoring analytics with the next assessment work. The mobile app, platform builder tools and portals stay at the end.

## Plans and apps, like Zoho One (founder request 18 Nov 2026; 2462 to 2465 PARKED to the end, after all building is finished)
- **Model:** YukthiX One (everything, one per-employee price), or separate apps bought à la carte and added later in the same account.
- **Draft app list:** People (base), Time, Payroll, Hire, Assess, Performance, Helpdesk, Engage & Learn, Expenses, Visitors & contract labour. Hire, Assess and Helpdesk work alone; the HR apps need People.
- **Build when resumed:**
  1. an app catalogue and plans in the staff console;
  2. apps on or off per company: menu, home, search and notifications show only bought apps, the API refuses the rest, and this is proved by tests;
  3. dependencies;
  4. per-app sign-up and set-up;
  5. billing: per employee or per candidate/minute, a One discount, prorated add/remove, GST invoices;
  6. trials and "Upgrade to One".
- **Pricing:** the mechanism only; prices are set in the console later, never in code. Existing demo companies go on One.
- **Size:** 3–4 weeks. It goes with AS-7 billing at the end, as the founder decided.

**Founder answers (18 Nov 2026, "ok for all"):**
- 2420 to 2438 (retire /v2), all as suggested:
  - super_admin lands on /staff/companies;
  - system logs live in the staff console only;
  - logo and colours go in Settings 1.1;
  - interview business hours reuse holiday calendars plus one hiring setting;
  - the pass certificate becomes a section on Settings 6.5;
  - candidate and job custom fields get an entity switch on /yx/settings/custom-fields;
  - field permissions are kept as a panel in Roles & access;
  - record visibility and reminders become settings on 6.1 Hiring;
  - ANL-08 goes live for scheduled reports;
  - approval, interview and sender emails go into 5.4 Notifications;
  - user groups go in 2.1 Roles & access;
  - a cross-company user search is added to the staff console;
  - ANL-02 goes live with hiring metrics;
  - old approval chains and drip campaigns are retired, with existing data moved into the new approvals and HIR-20 campaigns;
  - a stage message template editor goes on 6.1 Hiring;
  - offer templates move into Letters (5.2), used by the HIR-09 offer builder;
  - candidate experience surveys are kept and built later with Engage;
  - a Results tab goes on each test page (PRC-15 if it fits);
  - old gap pages stay until their new version exists, then redirect.
- 2439: the recycle bin saves and restores child rows (user group members, survey responses, billing draft lines). Items with no hard delete have nothing to bin.
- 2450: the ₹20,000 vs ₹2,00,000 exemption goes on the CA checklist; it is one rule value.
- 2451: TDS also counts this month's loan perquisite for the rest of the year (spread evenly).
- 2452: a salary advance is a concession loan; expense advances are not.
- 2453: a mid-month pre-closure and the re-run balance are accepted for now.
- 2454: manual "loan" perquisite entries are refused while the automatic calculation is on.
- 2455: design the employee FBP ledger and payroll's settlement screen in the Pay kit first, then make them live.
- 2456: benefits.settings.manage is added to the HR Admin role template.
- 2457: a part month counts in full.
- 2458: everyone gets every component for now; per-grade eligibility later.
- 2459: the year-end settlement is allowed only from the March pay month.
- 2460: the exit settlement starts automatically when F&F is handed off.
- 2461: FBP claims are taxable under the new regime (also added to the CA checklist).

## Old branch audit (18 Nov 2026; founder answers 2471 to 2476, "ok for all")
Audit of 69 local branches not in test main: 54 already in (by content or merged PRs), 9 redone later, 0 abandoned, 6 with missing work.
- 2471: merge feat/yukthix-postgres (health check 30s / 20s / 5) now.
- 2472: bring back the founder's testing record and docs from feat/yukthix-workspace (C:\D-drive\exam-app-ws). That means GO-LIVE-PLAN, the build designs, review/HANDOFF-2026-10-12-manual-testing.md, review/DESIGN-AUDIT-2026-10-15.md, GLOBAL-HCM-GAP-PASS.md and the side-by-side screenshots, plus manual-tests.json with 231 test results, hand-merged by test ID.
- 2473: port feat/yukthix-payroll-budget (#203) into test main now, as a small item (new migration name).
- 2474: port feat/yukthix-learning (#210) during the Engage and Learn batch, instead of rebuilding it.
- 2475: list each time piece from feat/yukthix-time-parity (#195) and feat/yukthix-reclockin (#212) and say whether a later decision replaced it; the founder then chooses which to rebuild. The pieces are geofence location fences, Wi-Fi names, device binding, dated leave type versions, hourly leave and re-clock-in.
- 2476: close the 15 safe old PRs after #221 merges (#220, #219, #216, #214, #209, #208, #207, #206, #205, #204, #202, #201, #200, #197, #194). Keep #203, #210, #195 and #212 open until ported. Leave Dependabot #173–177 open.
- 2477 (18 Nov 2026, "ok build now"): a time batch, rebuilt on today's code before batch C, from the old #195 and #212 pieces:
  1. several geofence points per location, plus office network and Wi-Fi names checked at check-in;
  2. phone binding, off until HR turns it on per site;
  3. dated leave type versions (leave follows the version in force on its first day; past leave unchanged);
  4. leave eligibility by employment type, months worked and probation, most days in a month, and blocked dates;
  6. paid or unpaid dated per version, with the payroll feed reading the rule in force on each leave day;
  7. clock in again after clocking out, per shift or location, off by default.

  Item 5 (leave by the hour) stays as hourly permission (B4). Check, and fill gaps in: leave during notice, credit during long absence, and a 10-character reason on attendance fixes and work-from-home requests shown to the approver.
- 2480 (18 Nov 2026, "ok"): add approved FBP claims to taxable pay for new-regime employees once the CA confirms checklist item 56; until then it stays on the checklist.
- 2481 (18 Nov 2026, "ok"): page the PAY-60 settlement list when a company passes a few thousand people.
- 2490 (18 Nov 2026, "ok"): "already clocked out" is refused only on web clock-in. Kiosk and phone punches (including offline syncs) are always recorded so nothing is lost.

**Batch C (approvals and team), founder answers (18 Nov 2026, "ok for all"), 2500 to 2509:**
- 2500: a new key, workflow.approvals.oversee, in the HR Admin template (legal-entity scope), for "Everyone's pending approvals".
- 2501: reassign to any active user who passes the step's own checks, never the requester. A reason is required; it is audited, and both the old and new approver are told.
- 2502: both HR and the approver can reassign; both need a reason.
- 2503: bulk "Do not approve" has the same 100 cap as bulk approve, with one shared reason the requester sees.
- 2504: the three-column desk shows at 1440 px or wider; below that, the list plus drawer.
- 2505: attendance.lock holders waive late marks, with a reason of 10 or more characters; a manager can only ask. Only for unlocked months; audited, and can be undone before lock.
- 2506: a waived late mark stays visible as "waived"; only the penalty goes.
- 2507: short-hours bands are a company setting, default under 4 h, 4–6 h and 6–8 h of worked time against the shift.
- 2508: frequent breaks are a setting, default more than 3 breaks or 60+ minutes a day. Where clock-in-again is off, the report says breaks are not recorded.
- 2509: team calendar dots are for the manager's own team now; peers come with C2 (tier 2).
- 2510: interview hours become one setting on 6.1 plus the company holiday calendars. Before the old holiday list is dropped, every date found only in the old list is reported to the founder; none are added automatically.
  - Built (18 Nov 2026, feat/yukthix-retire-v2-settings): interview business hours (2423) are one hiring setting on 6.1 Hiring: candidates may book interviews from / until (half hours, India time, default 09:30 to 18:30) and on which days (default Monday to Friday). Holidays come from the holiday calendars: the published calendar of the job's location, else the company-wide one; optional and restricted holidays stay open. Only the candidate self-booking link checks them, as before. Existing /v2 hours are copied once (open days, earliest opening, latest closing). Addition: before the old /v2 holiday list is dropped, every date only in the old list is reported per company (apps/api/scripts/v2-holiday-compare.ts, read-only) and nothing is added to a calendar automatically; the founder decides. On the local databases (examapp_pay, examapp_org, examapp) no company had /v2 hours or holidays, so the report was empty; the lead then had the old /organizations/business-hours endpoints, the report script and the two old columns removed (migration 202617z0000551).
- 2511 to 2517 (18 Nov 2026, "ok for all"), retiring the /v2 console (builder 2's half):
  - 2511: pending old approval_requests move into P03 at their current step with the same approvers; the move is re-runnable, keyed on the old id. Approved and rejected requests stay read-only.
  - 2512: the old job open/close gate in pipeline.service is replaced by P03 'ats.requisition'; ApprovalsService.submit/decide are then dropped.
  - 2513: drip members without talent-pool consent never move into a pool. Each drip becomes a DRAFT HIR-20 campaign (templates, pool and steps, waits = delayDays) with no members; active drip enrolments end as 'migrated'.
  - 2514: drip stage auto-enrol is dropped and noted on the migrated draft; add it back only if asked.
  - 2515: each offer template becomes a P05 'offer' letter template (same text, mapped fields, e-sign → "person signs"), re-runnable, and the HIR-09 builder lists them. Issuing the offer as a P05 letter with OTP e-accept is a separate next step.
  - 2516: the order is system logs and user search, then approvals and campaigns, then offer templates.
  - 2517: /v2/system-logs sends company admins to /yx/settings/audit-log.
- PR #221 (test/yukthix-main → main): the founder asked whether merging affects the present code. It doesn't. The repo has no deploy workflow, hooks or environments; only CI runs.
- 2520 to 2524 (18 Nov 2026, "ok for all"), offer templates into Letters:
  - 2520: the old recruiter-name field becomes "who signs" (the entity's signatory).
  - 2521: moved offer letters need no separate approval; offers already go through the P03 offer route.
  - 2522: moved templates come in switched on (preview recorded as seen by the system).
  - 2523: the 6.1 e-sign switch changes the Letters offer templates under the hiring settings key until the issue step, then it moves to Letters only.
  - 2524: until offers are issued as P05 letters, the offer email is built from the letter text and extra letter fields drop out. "Issue offers as real P05 letters with OTP e-accept" is scheduled right after batch C.
- 2525 (18 Nov 2026, "ok"): the reassign reason must be at least 10 characters (same as late-mark waivers).
- 2526 (18 Nov 2026, "ok"): "Everyone's pending" works by company or legal entity only; a location-only grant sees nothing.
- 2527 to 2529 (18 Nov 2026), batch C, awaiting founder: a manager "ask HR to waive" request in a later batch; WFH dots from the actual check-in place; half day against half the shift, and above the last band = no band.
- 2530 (18 Nov 2026, "ok"): make CI fully green before PR #221 merges. That means fixing the 114 affordance findings in the shared components, and updating the ~44 web-e2e journeys to the current screens (fixing any real bug they reveal). Builder 1 pauses the settings gaps for it.
- Founder answers (18 Nov 2026, "ok for all"):
  - **2527:** a manager "ask HR to waive" request (pick days and reason; HR waives from the same list) goes in a later batch.
  - **2528:** WFH dots come from the actual check-in place, not an approved WFH request alone.
  - **2529:** a half day is measured against half the shift; above the last band falls in no band.
  - **2541:** OTP e-accept applies per template ("Accepts it"), the default for new offer templates.
  - **2542:** the accepted offer letter is copied into the joiner's documents after joining (small follow-up).
  - **2543:** offers skip the template's "needs approval" (P03 covers it), and templates needing the company digital signature are refused for offers.
  - **2533:** Copy last week fills only empty cells, working days up to today, current projects, never notes.
  - **2534:** "Not sent" shows past weeks with expected hours never sent; last 12 weeks, then "Show older"; locked months are read-only.
  - **2535:** managers get a "Not sent" tab on PRJ-02 with Remind, once a day per person.
  - **2536:** the Home nudge appears from 4 pm when today has no hours, plus one reminder at 10:00 the day before the cut-off; both are company settings.
  - **2537:** B3 shows approved billable, approved non-billable and total booked hours for a chosen range.
  - **2538:** "By person" only regroups what the viewer may already approve.
  - **2539:** "Request leave" opens the leave drawer for that day, and the day shows "Leave requested" until decided.
  - **2540:** the PRJ-02 phone layout stays with phone approvals in tier 3.
- Founder answers (18 Nov 2026, "ok for all"):
  - 2557: the timesheet drill-down is read-only; "By person" shows one card per project.
  - 2558: a manager's "own team" means direct and indirect reports (same as the team calendar dots).
  - 2559: HR may decline an open waiver request after lock (no pay change); waiving and asking are refused after lock.
  - 2560: a declined day can be asked again with a new reason.
  - 2550: B7 window cards are already built; check and add a manual test.
  - 2551: "Waiting on" shows the approver's name, "HR" or "Finance" for a shared step, "You" when sent back, and "Finance (payment)" once approved and not paid.
  - 2552: managers also see "Waiting on" in Team claims.
  - 2553: past-claim filters are status (multi), a sent-date range with "Paid between", and search by title or claim number; 25 per page; filters kept in the page address.
  - 2554: Finance's To pay filters come later.
  - 2555: make the "payroll not set up" FirstUse empty state live in batch E.
  - 2556: a step with several approvers shows the first name and "and N more".
