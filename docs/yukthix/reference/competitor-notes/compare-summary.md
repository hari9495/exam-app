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

**Enterprise batch plan, builder 1 (25 Nov 2026).** The Enterprise batch is the founder's 2340: positions, the approval rules editor, automatic back-dated pay, costing and payroll controls (rows O1–O26 in `compare-oracle.md`). It also makes the designed, not-live screens in those areas live (2411). It comes after G and G4 in the agreed order (2410). Before writing this plan, I checked each area in code on `feat/yukthix-retire-v2-settings` (test main of 25 Nov):
- **Positions:** there is no position record. Headcount plans already exist, with lines per designation, grade and location, a count and a budget, approved through P03. A hiring job links to a plan line.
- **Approvals:** there are two systems.
  - The old chains (`approval_chains` / `approval_requests`, gates `requisition` and `offer`) still run the requisition gate in pipeline.service, the old offer submit in offers.service and hiring home. The live Hiring › Approvals page edits them.
  - The P03 engine already has skip conditions (P19), user groups, named users, the manager at level N, the cost-centre owner and HR. Its company editor (PLT-12, Settings 2.4) offers only 13 people request types, with "manager / manager's manager / HR" and "any / all".
- **Back-dated pay:** arrears worksheets are strong (corrected minus as-paid, per month and component, maker-checker). They are made by hand from a salary change, a statutory rule change or manually. Late attendance corrections are already paid automatically (late-corrections.ts).
- **Costing:**
  - The journal per run and its export are live.
  - The ledger mapping engine is live (cost centre, then entity, then company; unmapped amounts block export). Its API (`ledger-mappings`) is live, but no screen uses it; the PAY-16 set-up wizard's Accounting mapping step is only drawn.
  - The per-person cost-centre split by percent is live and dated with the assignment.
  - There are no department, location or project dimensions, and no reversal.
- **Payroll controls:** a pay group has a cut-off day and a pay day. Nothing exists for a separate payment, gross-up or a payslip release date.

Because of its size, the batch is built in five parts, each with its own commits and report. **Nothing in E2 or E3 is built before the Mythos review** (week of 23 Nov) passes the approval rules engine plan and the back-dated pay plan. E1, E4 and E5 can start first.

- **E1. Positions** (O1–O6, O8, O9; company setting, off by default, 2341):
  - **The record:** a position (seat) is a dated record: legal entity, department, location, designation, grade (the valid grades, with one default), FTE, headcount (1 or more), supervisor position, cost centre and a proposed entry salary (pay range check only). Its status is proposed, active, frozen or eliminated. History is dated like assignments: as-of views and "what changed when". New tables `positions` and `position_versions` (RLS, in rls-isolation).
  - **Filling a seat:** an assignment gets an optional position. When positions are on, a hire, transfer or promotion must name a seat with room. Then headcount minus incumbents gives the vacancies, and an empty seat is a vacancy.
  - **Org chart:** the chart can draw by position, so a vacant seat still shows, with its reports rolled up to the next filled seat. The reporting line by person stays the default.
  - **Requisitions (O4):** a requisition is raised against a seat. The seat's open headcount caps its openings. A requisition outside a seat is allowed only with the existing "outside the plan" reason.
  - **Budget (O5):** the headcount plan line gets an optional position. Each seat shows filled vs vacant vs budget, with the cost from the employee cost rates.
  - **Changes and bulk edits (O8):** creating, changing, freezing and eliminating a seat goes through P03 (new request type `org.position.change`, in the editor's list). Mass update (department, cost centre or supervisor for several seats, previewed first) and "copy seat" are included.
  - **Switching positions on:** a wizard builds one seat per current assignment (same designation, grade, location and department; grouped when identical, with headcount = count). Nothing moves until HR confirms the preview. Switching it off again keeps the data and hides it.
  - **Screens:** there are no position designs yet, so they are drawn in the kit first: POS-01 Positions list (filters, vacancies, budget strip), POS-02 Position record (details, incumbents, history, requisitions), POS-03 Switch-on wizard, POS-04 Mass update, plus the "by position" view on the org chart. Menu: People › Positions (shown only when the setting is on), with its yx-nav entry and test. Setting on 1.x Organisation.
- **E2. Approval rules editor** (O24–O26; after the Mythos review; the PLT-12 shape grown, never a second editor):
  - **The shape:** request type → its attributes → ordered rules (conditions → steps) → a fallback rule. This follows Oracle AME's order: transaction type, attributes, conditions, actions.
  - **Attributes (O24):** each request type declares typed attributes, so a company never types a field name. For example: amount, grade, department, legal entity, location, leave type and days, employment type, cost centre, "above the pay range". The engine's payload fields already carry most of them.
  - **Conditions:** these are the P19 conditions the engine already evaluates (skipIf), drawn with the PLT-32 Rule builder (conditions, summary in words, overlap warning).
  - **Approver kinds:** the steps reuse the engine's approvers, plus three new kinds:
    1. Up the manager chain until the approver's grade rank reaches a grade, or their approval limit covers the amount (O26). Approval limits are a new company table: grade → limit per request family, default empty, meaning the rule cannot be saved.
    2. An approver group (O25): a fixed user group (live), or a derived group, "holders of a key in the request's entity / department / location" (for example "the finance head of this entity" = holders of payroll.run.approve scoped to that entity).
    3. The holder of the supervisor position, or of a named position (only when positions are on). A vacant seat goes to the next filled seat up.
  - **Saving and testing:** a policy is versioned (new table `approval_policy_versions`, RLS). In-flight requests keep their snapshot; a change applies to new requests only, as now. Before saving, "Try it" runs the rules on a sample or real past request and shows who would approve (PLT-57 Test preview, PLT-33 Impact preview: how many open requests each rule would have caught). The edit is audited with before and after, and payroll and pay types need step-up.
  - **Floors a company can never remove:**
    - the requester never approves their own request;
    - payroll and pay keep maker-checker;
    - an offer above the grade range keeps its extra step (offer-builder);
    - exits and letters keep their module's minimum step.
    The editor shows these as locked steps.
  - **Request types:** the list grows from 13 to every engine type, grouped by area: People, Time, Expenses, Hiring (`ats.requisition`, `ats.offer`), Pay (revisions, arrears, one-time pay), Lifecycle (exits, letters), Org (headcount plan, `org.position.change`).
  - **How it replaces the old pieces** (2511, 2512 and 2515 already decided the moves; E2 finishes them):
    - **Old approval chains:** the requisition gate moves to `ats.requisition` (2512) and the old offer submit to `ats.offer`. Each company's enabled chain becomes its first rule for that type, step by step:
      - "users" become named users;
      - "reporting_manager" becomes the manager at the same level;
      - "hiring_manager" becomes a new attribute-based approver, the job's hiring manager;
      - a chain's group becomes the same user group.
      The move is re-runnable and keyed on the chain id. Pending `approval_requests` move to P03 at their current step (2511); decided ones stay read-only under the request's history. Then ApprovalsService.submit / decide, the chain endpoints and the four `approval_*` chain tables are dropped. This takes a separate migration after a release with the data move, never in the same one.
    - **The approval-email list** (`approval_email_templates`, 3 rows in the demo data, on Settings 5.4): the engine already sends requested, reminder, escalated, approved, turned down and sent back notices. Those notices get company-editable subject and body per event on 5.4 Notifications, for every request type (merge fields: request, requester, step, link). The 3 old rows are copied onto the matching events for the hiring types, and the old table and endpoints go once nothing reads them.
    - **/v2/approvals** (the old requisition and offer inbox): once pending requests are on P03, they appear in the live YukthiX Approvals inbox and "Everyone's pending" (2500). /v2/approvals then redirects to /yx/approvals, and the page and its old hooks are deleted.
    - **/v2/offer-template:** offer templates become Letters (5.2) offer templates (2515, 2520–2524, 2541–2543; being built on feat/yukthix-offer-issue). Their approval is `ats.offer` in this editor, and letter templates needing the company digital signature stay refused for offers (2543). When that branch merges, /v2/offer-template redirects to the Letters offer templates and is deleted. E2 only adds the redirect test if it is not there yet.
    - **Update after the 26 Nov 2026 integration merge** (feat/yukthix-retire-v2-console, 2433 and 2511-2513, with feat/yukthix-offer-issue): pending `approval_requests` already move into P03 at their step at start-up (the submitter taken off every step, so security fix F4 holds), the older ApprovalsService submit / decide and the `/approvals/requests` read and decide routes are gone (F3 holds in P03), and /v2/approvals and /v2/offer-template already redirect (to /yx/approvals and Settings › Letters). What E2 still does: turn each company's chain (`approval_chains` and steps, still read by `resolveSteps` when a requisition or offer is sent) into its first rule, re-wire Hiring › Approvals to the editor, move the approval-email list onto the engine's notices, then drop the chain and email tables in a later release.
    - **Hiring › Approvals** (the live ApprovalRoutesScreen copy on the old chains API) becomes the editor opened on the two hiring types (a re-wire, 2411), so there is one editor and one engine.
- **E3. Automatic back-dated pay** (O13, O14; after the Mythos review):
  - **Recalculate when (O14):** each pay component gets "recalculate when" switches: salary change, joining date change, LOP change, statutory rule change. The defaults follow the component's flags: Basic and allowances on salary and joining, PF / ESI / PT on the statutory rule.
  - **Triggers:** a back-dated change to a closed month fires a trigger that drafts an arrears worksheet for exactly the components switched on, from the change's date. A drafted worksheet is never paid by itself. It waits in Pay › Arrears with "drafted by the system, from <change>", and goes through the existing maker-checker. Payroll can discard a draft with a reason.
  - **Policy changes (O13):** a back-dated change to a salary template version, pay range or statutory rule (the StatutoryArrearsProposal path) drafts one worksheet per affected person, with an impact preview first (PLT-33 drawer: how many people, the total, the largest change).
  - **Mid-year moves:** a mid-year entity or grade move gets a true-up of the year's PF wage ceiling and tax projection, as a worksheet line kind.
  - **Overlaps:** never two open drafts for the same person, period and component; a newer trigger re-drafts the open draft and keeps its history. Recoveries still need the employee's agreement, as today.
- **E4. Costing** (O19–O22):
  - **GL mapping screen (O19):** a screen for company, entity and cost-centre mappings on the live `ledger-mappings` API. This makes the PAY-16 Accounting mapping step live, plus a Settings › Payroll › Accounting page.
  - **Suspense (O20):** a company setting (default on) sends an unmapped amount to a named suspense account instead of blocking export. The run shows "₹X in suspense" with a fix list, and a re-post moves it once mapped.
  - **Splits (O21):** the per-person cost-centre percentage split is live (assignment_cost_centres). E4 adds a split by project from a date, from the project allocations (ProjectAllocation), as a costing choice per company: by cost centre (default) or by project hours.
  - **Dimensions and formats (O22):**
    - department, location and project are optional dimensions on each journal line;
    - journal reversal is a reversing journal for a voided or reopened run, linked to the original;
    - export formats are the current CSV, plus Tally (already in the ledger export), SAP (IDoc-style flat file) and Oracle GL interface CSV.
    Columns are mapped per format, and the format choice is on the Accounting page.
- **E5. Payroll controls** (O16, O17):
  - **Separate payment and gross-up (O16):** a one-time pay item (special pay) can be "paid separately": its own bank file line and payslip section, same month and same tax year. Gross-up ("the company pays the tax") is a per-item switch: the item's TDS is computed and added as a company-borne perquisite, so the person receives the full amount. Its main use is a joining bonus net of TDS. Gross-up needs the payroll approver and is shown on the payslip.
  - **Cut-off and release dates (O17):** each pay group gets an input cut-off date (the existing cut-off day becomes a date per period, editable for one month) and a payslip release date.
    - Inputs that arrive after the cut-off roll to next month's run with a notice to the person who sent them, and are listed on the run.
    - Payslips stay hidden from employees until the release date, even when published. Publishing early needs a reason.
    - This makes PAY-02 Run readiness live: the pre-flight list before Calculate, with cut-off, missing inputs and blocking checks.
- **Designed, not-live screens made live (2411):**
  - **E2:** PLT-32 Rule builder (conditions), PLT-57 Test preview and PLT-33 Impact preview inside the editor; PLT-34 Lookup tables for the approval limits table; the Hiring ApprovalRoutesScreen live copy re-wired to the editor.
  - **E3:** PLT-33 for back-dated policy changes.
  - **E4:** the PAY-16 Accounting mapping step.
  - **E5:** PAY-02 Run readiness.
  - **Not in this batch:** PLT-24 Request-type builder, PLT-55 / 58 Workflow studio and versions, PLT-36 / 37 Validation rules and Why panel (platform builder tools, at the end per 2411); PLT-54 Payout readiness (needs the payout partner); PAY-43 Group health (benefits partner).
  - **New screens drawn first:** POS-01 to POS-04 for positions, plus the approval limits and suspense screens if the existing designs don't cover them.
- **Order and builder rules:**
  - Order: E1 → E4 → E5 → (Mythos review passed) E2 → E3.
  - Kit first and design story first.
  - Every new table in rls-isolation, with its migration made by hand (never `migrate diff`).
  - Policy choices are company settings with defaults, and each new settings page gets its yx-nav entry and test.
  - P+N tests by the builder and P+N manual tests in manual-tests.json; schema check; heavy steps one at a time.
  - The old chain tables are dropped only in a release after the data move.
- 2640: E2 (approval rules editor) and E3 (back-dated pay) are built only after the Mythos review passes their plans. E1, E4 and E5 go first, in the order E1 → E4 → E5. Suggested answer: yes.
- 2641: positions. One record per seat with headcount 1 or more (not one record per person), dated history, and statuses proposed / active / frozen / eliminated. A hire, transfer or promotion must name a seat with room only when the company setting is on. Suggested answer: yes.
- 2642: switching positions on builds a seat for each current assignment (identical ones grouped), shown as a preview that HR confirms. Switching off keeps the data and hides it. Suggested answer: yes.
- 2643: a requisition outside a seat (when positions are on) is allowed only with the existing "outside the plan" reason, and goes through `ats.requisition`. Suggested answer: yes.
- 2644: the approval rules editor covers every request type in the engine, grouped by area. Payroll and pay types keep maker-checker, offers above the pay range keep their extra step, and exits and letters keep their module's minimum step: these show as locked steps a company cannot remove. Suggested answer: yes.
- 2645: "approve up the chain until a level" (O26) uses grade rank, or an approval limit per grade for amount-based types. The limits are a new company table (Settings 2.4), empty by default, so the rule cannot be saved until limits are set. Suggested answer: yes.
- 2646: derived approver groups are "holders of a key in the request's entity, department or location" (for example payroll.run.approve in this entity = the finance head). No free-form formulas. Suggested answer: yes.
- 2647: old approval chains move into rules re-runnably, keyed on the chain id. "Hiring manager" becomes a new approver kind (the job's hiring manager). The old tables and endpoints are dropped in a later release than the data move. Suggested answer: yes.
- 2648: the approval emails become company-editable notices per event (requested, reminder, escalated, approved, turned down, sent back) on 5.4 Notifications, for every request type. The old approval-email rows are copied onto the hiring types' events. Suggested answer: yes.
- 2649: /v2/approvals redirects to /yx/approvals once its pending requests have moved, and /v2/offer-template redirects to the Letters offer templates when the offer-issue work merges. Both pages are then deleted. Suggested answer: yes.
  - Update (26 Nov 2026 merge): the /v2/approvals and /v2/offer-template redirects and the move of pending requests are already done by the retire-v2-console and offer-issue branches; 2647 and 2648 still stand for E2 (the chains as rules, the approval emails as notices).
- 2650: Hiring › Approvals stays in the Hiring menu, but opens the same editor filtered to requisitions and offers (one editor, one engine). Suggested answer: yes.
- 2651: back-dated pay. Each component gets "recalculate when" switches (salary change, joining date, LOP, statutory rule), with defaults from its flags. A trigger only drafts a worksheet; payroll still checks and approves it (maker-checker), and can discard it with a reason. Suggested answer: yes.
- 2652: a back-dated policy change (template version, pay range, statutory rule) shows an impact preview (people, total, largest change) before drafts are made for everyone affected. Suggested answer: yes.
- 2653: unmapped journal amounts go to a suspense account (company setting, default on) instead of blocking export, and the run shows the amount in suspense with a fix list. Suggested answer: yes.
- 2654: project split. A company chooses cost-centre split (default) or project-hours split for payroll costs. The project split uses approved timesheet hours of the month, else the allocations. Suggested answer: yes.
- 2655: journal formats. Keep CSV and Tally, and add SAP flat file and Oracle GL interface CSV, with department, location and project dimensions. A voided or reopened run gets a reversing journal. Suggested answer: yes.
- 2656: gross-up (company pays the tax) is per one-time pay item, needs the payroll approver, and shows on the payslip as tax paid by the company. A "paid separately" item gets its own bank file line in the same month. Suggested answer: yes.
- 2657: each pay group gets an input cut-off date and a payslip release date per period. Late inputs roll to next month with a notice. Payslips stay hidden until the release date, and publishing early needs a reason. Suggested answer: yes.
- 2658: PLT-24 Request-type builder, PLT-55 / 58 Workflow studio and versions, PLT-36 / 37 Validation rules and Why panel, PLT-54 Payout readiness and PAY-43 Group health stay out of this batch (platform tools at the end; partners not chosen). Suggested answer: yes.
- Founder answers (25 Nov 2026, "ok for all"): 2640-2658 approved exactly as suggested above.
- E1 built (25 Nov 2026, feat/yukthix-enterprise): positions are live behind the company setting org.positions.enabled (off). Seats with dated history; create, change, freeze, activate and eliminate, one or many (mass update), approved through P03 'org.position_change' by another holder of org.position.manage; the two-person switch-on; hires, promotions and transfers name an active seat with room; requisitions capped by the seat's openings (or outside the plan with a reason); headcount-plan lines may name a seat; empty seats on the org chart under the person in the seat above. Screens POS-01 to POS-04. What needs a choice, as questions:
- 2680: with positions on, a restructure (PPL-09) move is a transfer, so each person needs a seat; today the restructure refuses that person with "choose the seat" and moves the others. Suggested answer: add a seat column to the restructure plan in E1 follow-up; until then plan seats first, then restructure.
- 2681: seat changes are approved by another holder of org.position.manage (else the company's admins); HR Admin's template now has the key. Existing companies get it when their unchanged HR Admin role is synced to the template. In the demo company neither the System Admin (no employee.change.approve) nor HR Admin (key not yet synced) could approve the switch-on. Suggested answer: yes; sync the demo HR Admin role.
- 2682: money on seats: the entry salary only with pay.range.view, the plan budget only with ats.headcount.manage. The cost of filled seats comes with E4 costing. Suggested answer: yes.
- 2683: the HR person who approves the switch-on cannot link themselves (no one approves a change about themselves), so they are listed as "could not be given a seat". Suggested answer: add "Give a seat" on the seat page for anyone left without one, done by another HR person (small E1 follow-up).
- 2684: a seat's room is checked on the change's own date only, not on every later day. Suggested answer: keep; check the whole span if seats start being shrunk under scheduled moves.
- 2685: the Positions menu shows for org.position.manage only; org.structure.view holders read seats through the API and see empty seats on the org chart. Suggested answer: keep.
- 2686: seat changes start today or later (never back-dated). Suggested answer: keep.
- 2687: positions and the succession register's critical positions are separate lists. Suggested answer: link a critical position to a seat later, with the succession work.
- Founder answers (25 Nov 2026, "ok for all"): 2680-2687 (Positions) approved exactly as suggested above.
- E4 built (25 Nov 2026, feat/yukthix-enterprise): Pay › Ledger mapping (PAY-62) on the ledger-mapping API, with the suspense account as the mapping of the line "Suspense account"; Settings 4.12 Accounting & costing (suspense on by default, cost-centre split by default, CSV by default); the run journal parks unmapped amounts in suspense and still exports, carries department, location and project on every line, splits by approved project hours when chosen (else allocations, else cost centres), exports SAP flat file and Oracle GL interface CSV besides CSV, Tally and Zoho Books, and offers the reversing journal of a reopened or voided run whose journal went to the books. The cost of filled seats (2682) is on Positions for payroll.cost_rate.view. What needs a choice, as questions:
- 2700: with the suspense setting on but no suspense account mapped, an unmapped line still blocks the export (there is nowhere to park it). Suggested answer: keep; the journal page says to set one.
- 2701: once a line is mapped, the next export carries it to its account; nothing posts a separate "out of suspense" entry for a journal already in the books. Suggested answer: keep; add an automatic transfer journal (suspense to account) only if accountants ask.
- 2702: the reversing journal reverses the last export of the run, and "mark posted" is not offered for it (the accountant posts it). Suggested answer: keep; add "mark reversal posted" with the payroll audit if needed.
- 2703: the SAP file is one generic flat file (posting keys 40 and 50, the dimensions as columns); a company's own upload template may name columns differently. Suggested answer: keep; per-company column names later if asked.
- 2704: the project split keeps each person's main cost centre on every project share. Suggested answer: keep.
- 2680, 2681, 2683 built (26 Nov 2026): the restructure plan has a Seat column for each person when the entity people land in uses positions (the move names it; no seat or a full one is refused for that person); HR Admin holds org.position.manage in the template and the demo seed (the template sync adds it to unchanged copies); "Give a seat" on the seat page sends a dated correction for someone with no seat, approved by another HR person.
- E5 built (26 Nov 2026, feat/yukthix-e5): a one-time earning can be paid separately (its own bank file line, its own "Paid separately" section on the payslip) and grossed up (the company pays its income tax: a taxable "Tax paid by the company" line and the same amount deducted as TDS, found by repeating until it settles; always waits for the payroll approver). Each pay group has a payslip release day next to its cut-off day; one month's cut-off and release dates can be changed with a reason on the run's readiness page. One-time pay sent after its month's cut-off moves to the first month whose cut-off is still ahead; the sender is told on screen, the item says "Late for <month>", and both runs list it. Published payslips stay hidden from employees until the release date and they are told that day; releasing before the date needs a reason. PAY-02 Run readiness is live (dates, inputs after the cut-off, attendance, inputs, checks, then Calculate). Fixed on the way: approving one-time pay above the company's limit failed with an error. What needs a choice, as questions:
- 2770: only one-time pay entered by people (one by one or in bulk) rolls after the cut-off. Items sent by other modules (special pay postings, arrears, referral bonuses, expenses) keep their month. Suggested answer: keep; those postings already have their own month and approval.
- 2771: the notice to the sender of a late item is the answer on screen ("it came after the cut-off for September, so it is paid in October"), the item's "Late for" in the list and the run's "Inputs after the cut-off". No separate email or notification. Suggested answer: keep; the sender is the person acting.
- 2772: a separate payment is its own bank line only for a person paid into one account. With a pay split, or an F&F paid to nominees, the whole net goes as before (not split again). Suggested answer: keep until a company asks.
- 2773: gross-up covers income tax only; PF, ESI, PT or LWF that the item attracts are still the person's deductions. Suggested answer: yes (those are the person's own contributions).
- 2774: the payslip PDF marks the separate lines "(paid separately)" in the earnings list; it has no separate block, because PDF blocks come from the company's payslip layout. Suggested answer: keep; add a layout block if a company asks.
- 2775: cut-off and release dates are for monthly pay groups; weekly and fortnightly groups publish as before. Suggested answer: monthly only for now.

**Builder questions (offer templates into Letters, 18 Nov 2026), each with the default built:**
- 2520: the old {{recruiterName}} became {{signatory_name}} (who signs the letter). Suggested answer: keep it; an offer letter is signed by the entity's signatory, not the recruiter.
- 2521: moved offer letters have "needs approval" off. Suggested answer: keep it; offers already go through the P03 offer route.
- 2522: a moved template is switched on with its preview counted as seen by the system (the database requires a preview before "on"); a name HR already uses in Letters waits as a draft. Suggested answer: keep it, so offers keep their company text the day it moves.
- 2523: the 6.1 Hiring e-sign switches now change the Letters offer templates' "person signs", under the hiring settings key (not letter.template.manage). Suggested answer: keep it until the issue step, then move the switch to Letters only.
- 2524: until offers are issued as P05 letters, the offer email is made from the letter's text; letter fields other than the eight offer ones (and sections) drop out of the email. Suggested answer: accept; the next step issues the real letter.

**Builder questions (batch C items 15, 6 and 16, 18 Nov 2026), each with the default built:**
- 2527: answer 2505 says a manager can only ask for a late-mark waiver. No "ask HR to waive" flow is built yet; managers do not see Late marks. Suggested answer: add a small request (the manager picks the days and a reason, HR waives from the same Late marks list) in a later batch.
- 2528: a team calendar dot counts a day as "worked from home" by the company's mixed-day place rule (the same one My attendance uses), not by an approved work-from-home request. Suggested answer: keep it; a day with an approved request and no remote punch shows as present.
- 2529: the Short hours report measures a half day against half the shift, and a day above the last band (for example 8.5 h of a 9 h shift) is in no band. Suggested answer: keep both.

**Builder questions (offers issued as P05 letters, 18 Nov 2026; renumbered from 2530–2532, which clashed), each with the default built:**
- 2541: the candidate signs with the emailed one-time code only when the offer letter template's "The person" is "Accepts it" (founder decision 4); otherwise they accept by the link, as before. M10 D4 said OTP e-accept for every YukthiX offer. Suggested answer: keep it per template, and make "Accepts it" the default for new offer letter templates.
- 2542: a candidate's offer letter is kept on the offer (Hire), not in People › Letters, and is not copied into the joiner's My documents when they join. Suggested answer: show the accepted offer letter and its sealed copy in the joiner's documents after joining (small follow-up).
- 2543: for offers, the letter template's "needs approval" is not asked (the offer's own approval route is the approval), and a template that asks for the company's digital signature (DSC) is refused for offers with a plain message. Suggested answer: keep both.

**Batch D (timesheet) plan, builder (18 Nov 2026).** Order: A3 copy last week → A5 "Not sent" weeks → A8 request leave from the week → B3 billable totals → A14 daily nudge → B1 approval drill-down. Screens: A3, A5, A8 on TIM-15 My timesheet (A3's button is already drawn; A5 a new filter and empty states on the Time summary card, kit first); B3 on the PRJ-01 project page Team table (two columns); A14 on Home with the existing nudge card plus a P04 reminder; B1 on PRJ-02 approvals (a By project / By person Segment and an in-place week → day → task drill-down, kit first). Designed, not-live screens in this area are all phone ones (PRJ-02 phone, the mobile Time tab and approvals, TIM-43 phone): they stay with the mobile work (2411), unless 2540 says otherwise.
- 2533: Copy last week works as drawn: it fills only empty cells, only working days up to today, only projects the person is still allocated to; daily notes are not copied. Suggested answer: yes.
- 2534: "Not sent" lists past weeks with expected hours that were never sent, from the later of the joining day and the day timesheets were switched on; a week in a locked month is shown read-only (it needs a correction). Suggested answer: yes; the last 12 weeks, then "Show older".
- 2535: managers also get a "Not sent" tab on PRJ-02 for their projects' people, with Remind (once a day per person), because payroll needs full weeks. Suggested answer: yes, in batch D.
- 2536: the daily nudge shows on Home from 4 pm on a working day when today has no hours, for people with an active allocation; one reminder goes the day before the weekly cut-off at 10:00. Both are company settings (on by default, the times can change). Suggested answer: yes.
- 2537: B3 totals are approved billable, approved non-billable and total booked hours per person, for a chosen range (this week by default). Suggested answer: yes.
- 2538: B1's By person view shows only the hours the viewer may approve today (the switch regroups, never widens). Suggested answer: yes.
- 2539: "Request leave" on the week opens the existing leave drawer for the picked day; the day shows "Leave requested" until it is decided. Suggested answer: yes.
- 2540: make the PRJ-02 phone layout live together with B1, since the page is rebuilt anyway? Suggested answer: no; keep it with phone approvals (tier 3), as 2411 keeps phone screens to the end.

**Builder questions (batch D B1 and answer 2527, 18 Nov 2026), each with the default built:**
- 2557: B1's week → day → task drill-down is read only; approving, reducing and sending back stay on the cards. In "By person" a person who booked on two projects gets one card per project (each project's approver rules and bulk check stay as they are). Suggested answer: keep both.
- 2558: the manager asks from Time › Muster ("Late marks" button, for the month on screen). "Own team" is the whole reporting line on that day (direct and indirect reports), the same rule as the team calendar dots. Suggested answer: keep.
- 2559: HR can still decline an open request after the month is locked (it changes no pay and closes the request); waiving and asking are refused after the lock. Suggested answer: keep.
- 2560: a declined day can be asked again with a new reason; HR sees it as a new request. Suggested answer: keep.
- Found while building B1: the person's notice for a reduced or rejected timesheet line failed (the bell row's id was the week's date, not a UUID), so nobody was told. Fixed: it now points at the timesheet.

**Batch E built (18 Nov 2026, answers 2550 to 2556).** A4 "Waiting on" on the EXP-01 claim tiles and the Team claims column; A7 past-claim filters on My claims (`GET /expenses/me/claims`, 25 a page, filters in the address); B7 checked (live since batch H E1) with a manual test; the PAY-01 "payroll not set up" first-use piece is live.

**Batch F (performance and helpdesk quick wins) plan, builder (18 Nov 2026).** Items 30, 31, 32, 33, 34 and 13, plus GLPI 4, 8 and 10.
- Item → screen or kit piece:
  - 34 Helpdesk A4 first-response column → HLP-02 Agent desk ticket list (and HLP-07 My cases), a "First response" column from the SLA engine's first-response target (met, due, breached).
  - GLPI 4 requester chase → HLP-03 Ticket workspace (a "Waiting for the requester" pending reason) and the desk settings; a job that reminds in business hours, then solves the ticket.
  - GLPI 8 OLA team targets → desk settings (per team first-response and resolution targets) and HLP-03's SLA panel and HLP-05 SLA dashboard, next to the customer SLA.
  - 33 Helpdesk A7 ask your manager → a category setting "answered by the requester's manager" and HLP-01 Help centre's raise form ("Your manager answers this"); the manager answers from HLP-07 My cases.
  - GLPI 10 rule export and import → desk settings: export a desk's rules as a file; import with a dry-run preview.
  - 30 Performance A4 "no goals" with Remind → PRF-01 home (manager) and PRF-02 team tab: "No goals" and "Not updated" lists with a once-a-day Remind.
  - 31 Performance A2 progress summary → PRF-02 My goals and team tab: an average and status pills with counts on top (kit first).
  - 32 Performance B2 quick actions and private notes → PRF-08 Quick feedback: a quick-actions rail and private notes about a person (a new table).
  - 13 Helpdesk A10 POSH cases live → CMP-11 POSH case workspace, the POSH complaint form and the IC console.
- Designed, not-live screens in this area made live (2411): `PoshCaseScreen`, `PoshComplaintScreen`, `IcConsoleScreen` and their `ErrorCase` / `LoadingCase` states (item 13); the performance live copies `FeedbackTasksScreen` and `PeerFormScreen` re-wired with B2 (feedback area). The other seven live copies wait for the review and comp work; the Engage and Learning screens stay with batch G.
- Order: 34 → GLPI 4 → GLPI 8 → 33 → GLPI 10 → 30 → 31 → 32 → 13.
- 2570: the first-response column shows the target time, then Met or Breached; a ticket with no SLA shows "—". Suggested answer: yes.
- 2571: the requester chase is a desk setting, on by default: a reminder each business day while the ticket waits for the requester, at most 3, then the ticket is solved after 5 business days with no reply; the requester can reopen it within the desk's reopen window. Suggested answer: yes.
- 2572: OLA targets are per team (agent group), off until a desk sets them; they never pause or change the customer SLA, and breaches show on HLP-05. Suggested answer: yes.
- 2573: "Answered by the requester's manager" is a per-category setting; with no manager the ticket goes to the desk; confidential categories (POSH, speak-up, ethics) can never route to a manager. Suggested answer: yes.
- 2574: rule export and import covers a desk's rules, SLA and OLA policies, categories and templates (never people or tickets); import matches by name, shows a dry run first, needs the desk settings key and is audited. Suggested answer: yes.
- 2575: "No goals" is people with no goal in the current goal period; "Not updated" is no check-in for 30 days (a company setting, default 30). Remind goes at most once a day per person. Suggested answer: yes.
- 2576: the progress average uses goal weights where set, else a simple average; the pills count on track, at risk, off track and done. Suggested answer: yes.
- 2577: private notes about a person are seen only by their author (never the person, HR or the next manager), are never used in reviews, can be edited or deleted, at most 1,000 characters, and are included in the person's data-access export when the law needs it. Suggested answer: yes.
- 2578: POSH cases are built on the speak-up case store (a POSH kind), seen only by the company's Internal Committee members, with the POSH Act timers (notice, 90-day inquiry, report, employer action). The IC members are an HR setting per workplace. Suggested answer: yes.
- 2579: re-wire only `FeedbackTasksScreen` and `PeerFormScreen` in batch F; the other seven performance live copies go with the review and comp work. Suggested answer: yes.
- Founder answers (18 Nov 2026, "ok for all"): 2570-2579 approved exactly as suggested above.
- Batch F built (19 Nov 2026): 34, GLPI 4, GLPI 8, 33, GLPI 10, 30, 31, 32 and 13 are live. What was left out, as questions:
- 2590: POSH case workspace. A POSH complaint already opens in the live HLP-08 case workspace (notice, hearings, report, the POSH clocks, recusal), which only committee members can open. Making the separate designed `PoshCaseScreen` (CMP-11) live too would be a second workspace for the same case. Suggested answer: keep HLP-08 as the one POSH workspace and retire `PoshCaseScreen` (and its `ErrorCase` / `LoadingCase` states) from the designs.
- 2591: Internal Committee checks. The app records the committee's roles (presiding, member, external) but not whether a member is a woman or when their 3-year term ends, so the console checks only "a presiding officer" and "one external member". Suggested answer: add "woman" and "term ends" to the committee set-up (Speak-up set-up), required for the committee list only, and check "presiding is a woman", "at least half women" and "term not over" on the console.
- 2592: the committee is one list for the whole company today; 2578 said "per workplace". Suggested answer: one company committee by default, with an optional committee per workplace (a POSH complaint goes to its workplace's committee when there is one, else to the company's).
- 2593: the IC console's Annual report and Awareness log tabs need new records (the yearly report figures and the awareness sessions held). Suggested answer: build them with the compliance work (batch G); until then the live console shows Committee and Complaints only.
- 2594: private notes (item 32) in the data-access export. The app has no data-access export yet to add them to. Suggested answer: add "private notes I wrote" to the export when it is built (the notes are the author's data, never the subject's).
- 2595: the requester chase (GLPI 4) reminds requesters who are employees in the app (a notification). Customers of an external desk have no app login. Suggested answer: they get the reminder by email through the desk's email channel when that channel is set up; otherwise no reminder and no automatic solve.
- 2596: "Answered by the requester's manager" (item 33): the manager is told in the app (My cases › Asked of me) but not by email. Suggested answer: also an email with no details ("You have a question from your team in YukthiX"), like other notices.
- 2597: the POSH complaint form keeps "on her behalf", the late reason and the conciliation wish inside the complaint text (the speak-up record has one text field). Suggested answer: fine for now; give them their own fields when the POSH case work (2590) is done.
- Founder answers (19 Nov 2026, "ok for all"): 2590-2597 approved exactly as suggested above (2593: IC annual report and awareness log go into batch G).

**Batch G (Engage, Learning and compliance) plan, builder (19 Nov 2026).** Batch G is much bigger than F. Engage and Learning have no tables, routes or menu yet: the only survey code is the hiring candidate survey. So G is built in three parts, each with its own commits and report. The rules come from the decided module designs, M09 Engage (25 Sep) and M07 Learning (25-28 Sep). The first part is the POSH follow-ups the founder approved on 19 Nov.
- **G1. POSH and compliance follow-ups** (first; small, no new area):
  - 2591 woman and term end → Speak-up set-up › Internal Committee list (two new member fields, needed for the committee list only) and CMP-09 IC console warnings: "presiding officer is not a woman", "fewer than half are women", "term ended on …".
  - 2592 committees per workplace → Speak-up set-up: one company committee by default plus optional committees per workplace. A POSH complaint goes to its workplace's committee, else to the company's. The console shows the committees the member sits on.
  - 2597 own fields → the POSH complaint gets its own "on behalf of" (her name, relationship), "why late" and "asks for conciliation" fields (a migration on the speak-up report). The CMP-10 form sends them; the HLP-08 case workspace shows them. PoshCaseScreen and its ErrorCase / LoadingCase are dropped from the designs (2590), and the guard list shrinks.
  - 2596 manager email → an email with no details ("You have a question from your team in YukthiX") when a ticket in an "answered by the manager" category reaches them.
  - 2593 IC annual report and awareness log → CMP-09 tabs Annual report and Awareness log live. Two new tables: `posh_awareness_sessions` (date, workplace, topic, attendees count, file) and `posh_annual_reports` (year, figures built from the POSH cases, notes, sent-to-district-officer date, file). Both are seen by committee members only, with RLS and listed in rls-isolation.
  - CMP-02 Statutory set-up (compliance, not live) → stays parked: registrations are live in PAY-16 and the filing mode needs a partner connector (pay-design-map Q1). See 2611.
- **G2. Engage** (items 12, 73, 74, 75, 76, 100; M09):
  - 12 announcements → ENG-03 composer and acknowledgement tracking (audience, publish, pin, expiry, must-acknowledge with reminders).
  - 100 feed and spaces → ENG-01 feed, ENG-02 post composer, ENG-11 moderation queue (team / department / location spaces, company space with approval, blocked words EN / HI / TA / TE, auto-hide after 3 reports).
  - 73 praise wall → ENG-08 give kudos and ENG-09 recognition wall (company values, badges only, which is the M09 default; kudos shown in reviews, never scored, M09 Q6).
  - 74 surveys and 75 polls → ENG-04 surveys list and builder, ENG-05 take survey / pulse / eNPS, ENG-06 results (anonymous by default, no user id stored, groups under 5 hidden), ENG-07 action plans (within 30 days). Polls are one-question posts in the feed.
  - 76 new joiners → automatic celebration posts (new joiners, birthdays without the year, work anniversaries), each with a personal opt-out.
  - Not in G: ENG-10 Rewards and ENG-12 Perks (points, a voucher partner and payroll payout; see 2603).
  - New tables (all RLS, all in rls-isolation): spaces, posts, comments, reactions, reports, moderation actions, surveys, questions, invitations, responses, company values, badges, kudos, celebration settings, action plans. Settings: the moderation and celebration choices (6.x lists).
- **G3. Learning** (item 99; M07):
  - Courses, paths and the player → LRN-03 course builder, LRN-01 My learning and catalogue, LRN-02 course player (video, PDF, link, and a quiz through the assessment engine), LRN-13 My tests.
  - Sessions → LRN-04 sessions and trainers, LRN-05 trainer QR attendance, LRN-06 nomination and enrolment (approvals through the P03 engine; seats and waitlist), LRN-12 session feedback and the 60-day manager check.
  - Mandatory training → LRN-07 assignment rules (population, due in N days, yearly, reminders, then escalation), LRN-08 compliance dashboard (overdue lists, audit export). POSH awareness is a starter course, so the IC awareness log (2593) can count its completions too.
  - Skills → LRN-10 skills profile, LRN-09 team skills matrix, LRN-14 skills library admin, LRN-15 skill suggestions. These build on the existing Skills & competencies, not a second list.
  - Needs → LRN-11 training needs and budgets (department budget per year, warn by default).
  - Certificates → the existing certificate template and public verify page, opened up to any course completion.
  - Not in G: LRN-16 AI course drafts (AI credits; see 2607), SCORM, xAPI, provider connectors, live-class meeting creation, gamification, Open Badges / Credly, LTI, external-trainer login and training bonds (M07 waves 5-6; see 2606).
- Designed, not-live screens made live (2411): G1: CMP-09 Annual report and Awareness log tabs; PoshCaseScreen, ErrorCase, LoadingCase dropped (2590). G2: ENG-01 to ENG-09 and ENG-11 (11 screens). G3: LRN-01 to LRN-15 (15 screens). After G, 4 Engage and Learning screens remain (Rewards, Perks, AI course draft, and MobileLearningScreen with the phone work), plus CMP-02.
- Menu: two new areas, Engage and Learning, in lib/yx-nav.ts and yx-nav.test.ts; each settings page also goes in the 6.x settings lists.
- Order: G1 (2591 → 2592 → 2597 / 2590 → 2596 → 2593) → G2 (12 → 100 → 73 → 74 / 75 → 76) → G3 (courses and player → sessions → assignment rules and compliance dashboard → skills → needs and budgets). Items 14 (reports library) and 21 (company documents) were in the old G; see 2610.
- Builder rules as in F: kit first, design story first, every new table in rls-isolation, policy choices as company settings with defaults, P+N manual tests, schema check, heavy steps one at a time.
- 2600: G is built in three parts (G1 POSH and compliance follow-ups, G2 Engage, G3 Learning), each reported on its own; G1 starts as soon as these answers are in. Suggested answer: yes.
- 2601: who can post. As M09 Q1: team, department and location spaces are open to their members; on the company-wide space, announcers post directly and others after admin approval. Interest groups and the Teams / Slack / WhatsApp mirrors (M09 Q7) wait for later. Suggested answer: yes.
- 2602: announcements need the key `engage.announce` (System Admin and HR by default). "Must acknowledge" reminds after 2 and 5 days, and the composer shows who has not acknowledged. Suggested answer: yes.
- 2603: kudos with badges only in G (the M09 default). Points, rewards, perks and the voucher or payroll payout (ENG-10, ENG-12) wait until a rewards partner is chosen. Suggested answer: yes.
- 2604: surveys. Engagement, pulse and eNPS surveys are anonymous, and the mode is locked after launch. Onboarding and exit surveys may carry names. Results for groups under 5 are hidden (a company setting, 3 to 10). Starter templates: monthly 5-question pulse, quarterly eNPS, yearly engagement. Templates are off until HR launches one. Suggested answer: yes.
- 2605: celebrations. Birthdays (no year), work anniversaries and new joiners are on by default, each with a personal opt-out. Promotions are off until promotion letters are tied in. Directory privacy settings apply. Suggested answer: yes.
- 2606: Learning content in G: video, PDF, link and quiz courses, classroom and online sessions (a meeting link typed in), and certificates. SCORM (decided in M07 Q1) comes right after G3 once its open-source licence is checked. Everything else in M07 waves 5-6 comes later. Suggested answer: yes.
- 2607: LRN-16 AI course drafts use the company's AI (AI credits) and need a named reviewer. They come after G3, with the other AI work. Suggested answer: yes.
- 2608: course scores are Confidential: the learner, their manager chain and L&D (`learning.manage`) see them, and nobody else. Suggested answer: yes.
- 2609: mandatory training. Overdue goes to the manager after 7 days, then to HR after 14 (company settings). A certificate that expires creates a renewal enrolment 30 days before. Suggested answer: yes.
- 2610: items 14 (reports library with scheduled emails) and 21 (company documents in folders with expiry) were in the old batch G. Suggested answer: build them as G4 after Learning, before Enterprise.
- 2611: CMP-02 Statutory set-up stays not live. Registrations are live in Payroll set-up and the filing mode needs a partner connector. Suggested answer: keep it parked with the payroll partner work.
- 2612: 2594 (private notes in the data-access export) and 2595 (email chase for customers of an external desk) stay out of G, as the founder said. Suggested answer: yes.
- Founder answers (19 Nov 2026, "ok for all"): 2600-2612 approved exactly as suggested above.
- G1 built (19 Nov 2026): 2591, 2592, 2597 with 2590, 2596 and 2593 are live. What was left out or needs a choice, as questions:
- 2620: the CMP-09 design also has an HR view of the console (anonymised counts and the actions the committee gave HR). HR already gets interim-relief tasks from the case (HLP-08). Suggested answer: build the HR counts view with the compliance dashboard in G3 (counts only, hidden below 5 complaints).
- 2621: the annual report is counted and moved through its steps in the app, but there is no printable report yet. The presiding officer marks it sent to the employer and the District Officer. Suggested answer: add a PDF in the format the state asks for, with the P07 POSH parameters, after G3.
- 2622: the app does not record seniority, so the presiding officer counts as senior. The set-up asks for "a senior woman employee". Suggested answer: yes, leave it to the System Admin.
- 2623: when a member's term ends, the console and set-up warn, but complaints still reach that member. Suggested answer: keep the warning, remind the System Admin 30 days before a term ends, and stop routing new complaints to a member whose term has ended.
- 2624: the awareness log is typed in by committee members. Suggested answer: when Learning (G3) is live, POSH awareness course completions count in the annual report too, next to the sessions logged by hand.
- 2625: existing committee members can only get their woman and term-end fields by being removed and added again. Suggested answer: add "Edit member" on the Speak-up set-up lists (Internal Committee: woman, term end, role, committee), audited, with the same checks as adding.
- Founder answers (25 Nov 2026, "ok for all"): 2620-2625 approved exactly as suggested above. Also from builder 1's CI report: 2626 add a "Needs your action" home task when an employee nominates 360° reviewers; 2627 fix the wording to "1 anonymous response is held back" (singular/plural); 2628 the improvement-plan HR step stays with HR Admin (holder of perf.pip.manage), as now.
- Plan after answers 2620-2625 (25 Nov 2026): G2 (Engage) first. Then two small G1 follow-ups: 2623 (remind the System Admin 30 days before a committee term ends; new complaints never go to a member whose term has ended) and 2625 (Edit member on the Speak-up set-up lists). 2620 (the HR counts view of the IC console) and 2624 (POSH awareness course completions in the annual report) go with G3. 2621 (the annual report as a PDF in the state's format) comes after G3.
- 2629 (builder 1, CI fix 3): in the last days of a leave year HR could not plan a block-leave at all, because a block must end inside the current leave year. Founder answer (25 Nov 2026, "go ahead"): a block may fall in the next leave year when it starts within the next 60 days; the 60-day limit is a company setting.
- G2 built (25 Nov 2026): items 12, 100, 73, 74, 75 and 76 are live (Engage menu: Feed, Recognition, Announcements, Surveys or Team surveys, Moderation). 2626-2629 were builder 1's, so G2's questions start at 2630. What was left out or needs a choice:
- 2660: announcements go in the app and by email only. Push, WhatsApp and SMS, and the Teams / Slack mirror in the design, need those channels first. Suggested answer: add push and SMS when those channels are live; WhatsApp (company number) and the Teams / Slack mirror with the integrations work (M09 Q7).
- 2661: kudos are not yet shown in performance reviews (M09 Q6: as context, never scored, the person can hide one). Suggested answer: build it with the review work: the review shows the period's kudos by value, with a Hide from review switch for the person.
- 2662: interest groups (spaces people create, with approval) are not built; 2601 left them for later. Suggested answer: the next Engage pass.
- 2663: the composer's Event kind (date, place, RSVP) and photos in posts are not built. Suggested answer: the next Engage pass; photos are scanned and stored like other files.
- 2664: surveys run once and are launched by hand. Repeats (every month or quarter) and the automatic onboarding (after joining) and exit (when a resignation is accepted) sending are not built. Suggested answer: build them next, with the lifecycle events.
- 2665: survey results show no comment themes: anonymous text answers are never listed one by one, and the AI summary in the design needs the company's AI. Suggested answer: summarise anonymous comments with the company's AI (credits), only for groups above the smallest size, never naming anyone.
- 2666: the moderation queue counts an author's earlier actions and says "Tell HR"; the design's Route to HR button is not built. Suggested answer: a button that sends HR a notice naming the author and the count (never the post text).
- 2667: the recognition wall has no leaderboard, because the company thanks with badges only (2603). Suggested answer: keep it off until points are chosen.
- 2668: survey results cannot be exported yet. Suggested answer: a CSV of the shown (above the smallest group) results only.
- 2669: a manager's team in survey results is their direct reports today. Suggested answer: yes; reports further down roll up only into the company and department results.
- 2630-2632 (the 11 /v2 pages with no replacement, builder 1, 25 Nov):
  - 2630: /v2/approvals, /v2/offer-template and the approval-email list stay until the Enterprise approval rules editor (E2) replaces them.
    - Update (26 Nov 2026 merge): /v2/approvals and /v2/offer-template are retired (redirected) by the retire-v2-console and offer-issue branches. Only the approval-email list (Settings 5.4) and the hiring approval chains wait for E2.
  - 2631: /v2 brand, campaigns, settings/easy-apply and settings/pipelines get YukthiX versions in a small hiring-settings batch right after batch G, then the old pages are deleted.
  - 2632: /v2 all-users, organizations, plans, platform-admins and system-logs move into the staff console with the platform screens, then the old pages are deleted.
- Founder answers (25 Nov 2026, "ok for all"): 2630-2632 and 2660-2669 approved exactly as suggested; 2640-2658 (Enterprise plan, on feat/yukthix-retire-v2-settings) approved exactly as suggested.
- G3 built (25 Nov 2026): Learning goes forward on PR #210's build (courses, catalogue, player, course builder, assignment rules, compliance, requests through Approvals, external training, trainers, sessions with QR check-in, the team view and the person's Learning tab); this branch's own G3a/G3b were reverted. Added on top: rating a session and the manager's training check (LRN-12), overdue timing by 2609 (company settings), results visible only per 2608, a classroom course completes only by attending, skills profile and suggestions (LRN-10, LRN-15), team skills (LRN-09), training needs and budgets (LRN-11), the committees' counts for HR (2620) and POSH awareness course completions in the annual report (2624).
- 2670: PR #210 already has training bonds (on external training above a cost) and external trainers (a trainer list entry, no login); 2606 had put these later. Both work and are tested. Suggested answer: keep them; the external-trainer login portal stays later.
- 2671: LRN-14 (skills library admin) would be a second editor of the skills library that Settings › Performance already keeps live (the same company skills). Suggested answer: one library, edited in Settings › Performance; Learning links there; the LRN-14 extras (usage counts per skill) join that page later.
- 2672: a course's skills are names without a level, so a completed course suggests level 2 (working) for each. Suggested answer: add "level gained" per skill in the course builder, as the LRN-03 design shows.
- 2673: employees cannot add a skill themselves yet (the LRN-10 "Add a skill"); skills come from completed courses and the manager. Suggested answer: a self-added skill becomes a suggestion the manager confirms.
- 2674: the committees' counts for HR (2620) show on Learning › Compliance to people with training reports (learning.report.view) for the whole company. Suggested answer: yes; a separate key only if POSH oversight should sit with someone other than training reports.
- 2675: training needs are added by L&D only. The design also raises them automatically (skill gaps, review gaps) and from managers and employees. Suggested answer: managers raise needs for their team from Team skills next; automatic skill-gap needs in a nightly check after that.
- 2676: a department budget counts "spent" as the cost of courses completed in the financial year plus approved external training, and "committed" as the cost of open enrolments assigned in the year. The Finance view and export are not built. Suggested answer: yes; the export comes with G4 reports.
- 2677: LRN-13 (My tests) and LRN-16 (AI course drafts) are not in G3. Suggested answer: My tests with the assessments question bank later; AI drafts with the other AI work (2607).
- 2678: the skills profile shows gaps against the current job title; the design's "next role on path" needs career paths. Suggested answer: add next-role gaps when career paths are built.
- G1 follow-ups built (25 Nov 2026): 2625 Edit member on the Speak-up set-up lists; 2623 an ended committee term takes no new complaint, and the System Admins are reminded once 30 days before a term ends.
- G4 plan (25 Nov 2026; items 14, 21 and 92):
  - Reports library (ANL-06, live): one page listing every live area report the person may open (Payroll, Expenses, Attendance and registers, Performance, Learning compliance, Helpdesk SLAs, Visitors, Hiring costs), grouped by the question it answers, with search and personal favourites; Open goes to the area's own report page. Built now (no answer needed).
  - Scheduled report emails (ANL-08): waits on 2690 and 2691.
  - Export log (ANL-08 second tab): waits on 2692.
  - Team reports for managers (item 92): waits on 2693.
  - Company documents (item 21, People): folders, documents (title, file, optional expiry), counts per folder, download, remove, expiry warning. A design story first (no YukthiX design exists), then live. Built now with the suggested answers 2695-2697 as defaults that can change.
- 2690: scheduled report emails must build each recipient's own copy with their own rights (as the Helpdesk schedules already do). Suggested answer: the first pass schedules the reports that already export CSV (Payroll reports, Expense reports, Attendance reports, Performance reports, Learning compliance); daily, weekdays, weekly or monthly at 07:00 India time; recipients are people who hold that report's key; anyone who has lost it gets nothing.
- 2691: Confidential reports (pay) in an email. Suggested answer: no attachment; the email says the report is ready and links to YukthiX, where the person signs in to download it. Internal reports attach the CSV.
- 2692: the Export log needs one list of every export, but each area audits exports under its own action name (about 25). Suggested answer: an Export log that reads those audit actions, for holders of a new key (System Admin and auditors).
- 2693: team reports for managers (item 92). Suggested answer: the library shows managers the team views that exist (Attendance reports for their team, Learning › My team, Team skills, Team claims); new team reports come later with the metric layer.
- 2694: "New report" (the ANL-05 report builder) is not in G4. Suggested answer: later, with the metric layer (P09).
- 2695: who sees company documents. Suggested answer: a new key company.documents.manage (System Admin and HR Admin) creates folders and uploads; every employee sees folders marked "Everyone"; a folder marked "Document managers only" is seen only by key holders.
- 2696: expiring documents. Suggested answer: the uploader and the document managers are told once, 30 days before expiry (a company setting); an expired document stays listed, marked Expired, until someone removes or replaces it.
- 2697: policies stay in Policies (with acknowledgement); company documents are reference files people read and download, with no acknowledgement. Suggested answer: yes.
- G4 built (25 Nov 2026): Analytics › Report library (ANL-06 live, favourites) and People › Company documents (PPL-51, drawn then live, with expiry reminders) per 2695-2697 as suggested; the budgets export (2676). Scheduled emails, the export log and team reports wait on 2690-2693.
- Hiring settings plan (2631, 25 Nov 2026): the four older /v2 pages get YukthiX homes, then they are deleted (with redirects):
  - /v2/settings/pipelines → Settings › Hiring (6.1): pipelines become editable there (add a pipeline; stages: name, kind, order, remove; the statuses inside a stage; the stage rules that must be met before a candidate enters it: feedback, a passed test, a checklist), in a sheet drawn in the kit first, next to the stage targets.
  - /v2/settings/easy-apply → Hiring › Job boards: an Easy Apply part for LinkedIn and Indeed (the address to give the board, set or change the shared secret, turn off).
  - /v2/campaigns → Hiring › Talent pools (HIR-20 campaigns, where the older drips were already moved, answers 2433, 2512, 2513): a redirect only; see 2699.
  - /v2/brand: see 2698.
- 2698: /v2/brand is the older product's (Workfox) brand guidelines page, not a company setting. YukthiX's brand is its design system (the Storybook foundations and brand/DESIGN-SYSTEM.md). Suggested answer: no YukthiX page; delete /v2/brand and point the web app's notes at the YukthiX design system.
- 2699: the older campaigns could enrol a candidate automatically when they reached a pipeline stage; HIR-20 campaigns send only to a talent pool whose members gave talent-pool consent. Suggested answer: keep HIR-20 as it is (consent first); stage-triggered enrolment later, asking for talent-pool consent at that stage.
- Founder answers (25 Nov 2026, "ok for all"): 2670-2678 approved exactly as suggested above.
- Founder answers (25 Nov 2026, "ok for all"): 2690-2697 approved exactly as suggested above.
- Founder answers (25 Nov 2026, "ok for all"): 2698-2699 (hiring settings) approved exactly as suggested above.
- Engage follow-ups built (25 Nov 2026): 2664 (monthly or quarterly repeats; automatic onboarding and exit sending), 2666 (Route to HR: the author and the count, never the words) and 2668 (results CSV of the shown results only). Learning follow-ups built (26 Nov 2026): 2672 (level gained per course skill, kept with its skill when names are edited), 2673 (a skill a person adds waits for their manager) and 2675 (managers raise training needs from Team skills).
- IT assets plan (26 Nov 2026; GLPI 1, 2, 3, 5, 6 and 7 from the 17 Nov decision, after Enterprise per 2410):
  - What exists: one asset register, People › Assets (PPL-25, `lifecycle/assets`, tables `assets` and `asset_assignments`): add, issue, take back, the person's click to acknowledge, return at exit clearance with a recovery on F&F. Since the 28 Oct founder queue, issuing is IT's job: the IT / Admin coordinator template holds `asset.view` and `asset.manage` (by legal entity or location) and no employee grant; the CI fix of 18 Nov (`70e48d8d5`) gave IT its own person list (`GET lifecycle/assets/people`). The Helpdesk already links a ticket to one of these devices (`asset-pick.ts`, answers 1661, 1662, 1685, 1802). `Asset` has a free-text category, tag, serial, place, purchase date, cost and status (in stock, assigned, in repair, retired, lost). Facilities equipment (`sd_equipment`) is a separate list for the facilities desk and stays separate.
  - Oracle: none of the O-items is about assets. Only costing (O19–O22, the Enterprise batch) touches this batch, through GLPI 7 (costs into budgets).
  - GLPI 1, asset register (L): make the one register deeper; no second CMDB in the Helpdesk. An asset page with tabs (Details, History, Tickets, Licences, Bookings), maker and model, the person in charge, and categories from a company list. Waits on 2710, 2711, 2712 and 2722, except the asset page with Details and History (below).
  - GLPI 2, warranty and finance (M): supplier, invoice number, warranty months with the end date, warranty alerts, depreciation and net book value. The plain fields need no answer; the alerts, the supplier link and depreciation wait on 2713, 2714 and 2716.
  - GLPI 3, booking (M): bookable pool assets (spare laptops, projectors), bookings with repeats, a "free between" search, reminders and a loan report. Waits on 2715.
  - GLPI 5, suppliers and contracts (M): an IT and Admin supplier list; contracts with tacit or express renewal, notice alerts, support hours and covered assets. Waits on 2716 and 2717.
  - GLPI 6, software licences (M): seats per licence, an over-quota switch, expiry alerts, seats given to a person or a device and freed at exit. Waits on 2718.
  - GLPI 7, costs into budgets (M): waits on 2719 (needs Enterprise costing first).
  - Designed, not-live screens in this area (2411): Settings 2.8 Assets (`P2_8` and `P2_8_ReadOnly`: categories, the acknowledgement method, recovery to F&F and its basis) goes live in this batch (waits on 2712). `AssetAcknowledgePhone` (the PPL-25 phone view) stays with the mobile app. `VendorPortalScreen` is the staffing-vendor portal (hiring), not IT, and stays with the portals. No other screen this batch needs (asset page, bookings, licences, suppliers and contracts) has a design yet, so each gets a kit design story first.
  - Built now (no answer needed): the asset page (design story first), opened from the register: Details (with maker, model, invoice number, warranty months and the end date as plain fields) and History (who added, changed, issued and took back, from the audit log), for the same people who see the asset (`asset.view` over its place).
  - Order after answers: 2.8 categories (2712) → the asset page's Tickets tab (2722) → warranty alerts and depreciation (2713, 2714) → suppliers and contracts (2716, 2717) → licences (2718) → booking (2715) → tag numbering (2720) → costs into budgets after Enterprise (2719).
  - Builder rules as before: kit first, design story first, every new table in rls-isolation, every route in endpoint-permissions, menu entries in yx-nav, policy choices as company settings with defaults, P+N manual tests, schema check, heavy steps one at a time.
- 2710: one register. Suggested answer: the IT register is the People asset register made deeper (one `assets` table, one page). IT desk agents with `asset.view` also reach it from the Helpdesk menu as "IT assets". No second list in the Helpdesk.
- 2711: who does what. Suggested answer: `asset.view` and `asset.manage` stay as they are (IT / Admin coordinator, by entity or location); licences, bookings, suppliers and contracts use `asset.manage` too. Money (cost, net book value, contract value) is shown only to `asset.manage` holders and to a new key `asset.finance.view` (Finance), never to employees or managers.
- 2712: categories. Suggested answer: Settings 2.8 goes live: a company category list (name, tracked by, default recovery, useful life in years), starting from the drawn starter list; existing free-text categories become list entries in the migration. Acknowledgement offers "Click to accept" (default) and "None" now; "E-sign" waits for the e-sign partner. Recovery to F&F stays on by default, with the basis "Category default", "Written-down value" or "Decided by HR each time".
- 2713: depreciation. Suggested answer: straight-line over the category's useful life (Companies Act Schedule II style), with a declining-balance option per category. The net book value shows on the asset page and is the "Written-down value" for recovery. It is a management figure, not the tax books (income-tax block WDV stays with the accountant).
- 2714: warranty and contract alerts. Suggested answer: the asset managers of the asset's place are told once, 30 days before a warranty ends, and contract owners at the notice date (both company settings); an ended warranty shows in red on the register.
- 2715: booking. Suggested answer: IT marks assets "bookable"; any employee books one for up to 14 days (company setting), with daily or weekly repeats up to 3 months; no approval by default (a setting can require IT's approval). IT hands it over and takes it back, which records an issue and a return, so the register stays true. The person is reminded the day before it is due back, and IT when it is overdue.
- 2716: suppliers. Suggested answer: a new IT and Admin supplier list (name, contacts, optional GSTIN), separate from hiring's staffing vendors and from contract-labour contractors, which keep their own compliance checks. An asset and a contract may name a supplier.
- 2717: contracts. Suggested answer: type, number, supplier, start and length (the end date follows), tacit or express renewal, notice period, support hours, value, and the assets it covers (with an optional cap). Assigning a Helpdesk ticket to a supplier comes later with the Helpdesk vendor work (M14).
- 2718: licences. Suggested answer: a licence names the software, version, seats, expiry and an "allow over quota" switch. Seats go to a person or a device and are counted (no install scan, as there is no inventory agent). A leaver's seats join the exit clearance list for IT, and clearing the item frees them.
- 2719: costs into budgets (GLPI 7). Suggested answer: build after the Enterprise costing work (O19–O22) merges: ticket time × the team's hourly rate plus fixed or material cost lines on tickets and changes, charged to a yearly IT budget per department (like the training budgets), with spent and left.
- 2720: tag numbering (GLPI gap 27, not in the 17 Nov list, small). Suggested answer: an optional pattern per category (prefix, year and a padded counter, for example LAP-2026-0042); a typed tag still works; tags stay unique.
- 2721: left out of this batch: the inventory agent and import rules (GLPI gap 26; better as an Intune or Jamf connector with the integrations work), consumables stock (gap 24) and the impact graph (gap 25, out of scope in the ITSM plan). Suggested answer: yes, later.
- 2722: the asset's tickets. Suggested answer: the asset page lists the tickets about the device only to people who may see each ticket (agents of its desk); everyone else who sees the asset sees only a count.
- IT assets, part with no answer built (26 Nov 2026): the asset page (People › Assets › an asset's tag): Details with maker, model, invoice number and warranty months with the end date, Edit details for asset managers of its place, and History (added, changed, issued, confirmed, taken back). Everything else waits on 2710-2722.
- Payroll statutory review (26 Nov 2026): `docs/yukthix/reviews/payroll-statutory-review-2026-11-26.md` on branch `review/yukthix-statutory` (7 wrong-money, 2 wrong-filing, 8 missing; failing tests R1–R8). Fix decisions are with the founder.
- Tiers 2 and 3 plan (26 Nov 2026; the next stage after Enterprise and IT assets, per 2410). The lists are "### 2. Depth" (items 35–87) and "### 3. Later" (items 88–106) under "Build order across all areas" above.
  - Already built in earlier batches (not planned again): 35 B6, 36 A9, 37 D12, 38 D10 (batch A); 69 skills profile and matrix (G3 LRN-09, LRN-10); 73 praise wall, 74 surveys, 75 polls, 76 new joiners (G2); 99 learning (G3); 100 feed (G2); 92 team reports (G4, as 2693: the library shows managers the team views that exist); 46 export log (G4, 2692; the import log is still open).
  - Each remaining item is checked against the code before it is built; one found partly live is finished, not rebuilt (see 2753). Comp-off (40 D9) and Home nudges (51 B3) look partly live.
  - Tier 2, grouped into batches by area like tier 1 (sizes as in the list):
    - **T2-A. Attendance, leave and team:** 39 policy gallery, levels, clubbing and request limits (M); 40 comp-off auto credit and expiry (S); 48 leave overview cards (M); 53 peers view (S, the peers part of the team calendar, 2509); 54 manager approves internal moves (S).
    - **T2-B. Pay and expenses:** 63 salary timeline (S); 64 pay summary (S); 65 download the year (S); 66 "Save and add another" on a claim (S); 67 advance rules (S). The statutory review's fixes go here too, once the founder decides.
    - **T2-C. Performance:** 68 "What is expected of me" (M); 70 agenda templates (M; calendar sync with 90, see 2748); 71 goal templates and import (M); 72 bell-curve guide (S). The 5 performance live copies are re-wired to their designed screens in this batch (2411): `CompCyclesScreen`, `PerformanceReportsScreen`, `PerformanceSetupScreen`, `PipsScreen`, `ReviewerBlocksScreen`.
    - **T2-D. Timesheet and projects:** 55 my projects with my hours (S); 56 tasks with assignees and a board (M); 57 actions pending and who is on leave (M); 58 per-project settings (M); 59 second approval level (M); 60 hours reports (M); 61 view switch (S); 62 activity card (S).
    - **T2-E. Approvals and notifications:** 49 filter chips (S); 50 "Decided by me" (S); 51 Home nudges (S); 52 WhatsApp and push choice (M, waits on 2742).
    - **T2-F. Home, people and helpdesk:** 79 choose Home widgets (S); 80 "last used" slot (S); 81 quick create (M); 82 moved-page stubs (S); 86 "Go to top" (S); 87 "About me" (S); 43 onboarding rules by grade and type (S); 77 satisfaction filter (S); 78 bonafide letter template (S). The 2 hiring live copies (`ApprovalRoutesScreen` with the Enterprise approval editor, 2650; `JobBoardsScreen`) are re-wired when their pages are next touched.
    - **T2-G. Admin and platform basics:** 41 modules list, on / off and order (M, 2746); 42 rule-based groups (M, 2745); 44 pick a person per module (M, 2745); 45 scheduled backups (M, 2744); 46 the import log next to the export log (S); 47 headcount and attrition (M, 2747); 83 settings and work-page cross-links (S); 84 renaming terms and Hindi screens (L, 2743, with GLPI 9 notification templates per language).
    - **T2-H. Phone:** 85 Home D8 phone screens live (L): waits on 2741.
  - Tier 3 (after tier 2): 88 me vs team stats (S); 89 leave charts (S); 90 calendar sync (M, 2748); 91 leaderboards (M, off until points, 2667 / 2752); 93 WhatsApp approvals (M, 2742); 94 attach a file to a timesheet (S); 95 phone approvals (M, with T2-H); 96 add several people at once (S); 97 phone receipt capture (M, with T2-H); 98 receipt reading (S, the company's AI credits, 2749); 101 Aadhaar e-sign and 102 background-check vendor (M each, partners, 2749); 103 custom forms, 104 workflows, 105 report builder (L each, platform tools at the end, 2750; 105 is 2694); 106 field-level control (M, 2750).
  - Left over from earlier batches, placed here: 2621 the IC annual report as a PDF (T2-G); 2661 kudos in reviews (T2-C); 2662 interest groups and 2663 events and photos (Engage pass after T2-F); 2665 AI comment themes (with the AI work); 2694 report builder (105); 2699 stage-triggered campaigns (hiring, after T2-F); 2710–2722 IT assets answers (before tier 2, as now).
  - Order suggested (2740): T2-A → T2-B → T2-C → T2-D → T2-E → T2-F → T2-G → T2-H, then tier 3.
  - Builder rules as before: kit first, design story first, every new table in rls-isolation, every route in endpoint-permissions, menu entries in yx-nav, policy choices as company settings with defaults, P+N manual tests, schema check, heavy steps one at a time.
  - **Designed, not-live screens per area (2411; `packages/yx-ui/src/design-live-guard.known.json`, 193 screens plus 7 live copies):**
    - Kit (1): `LinksFrame` → check in T2-F whether a live page should use it; else drop it from the kit.
    - Growth (6): `RewardsScreen`, `PerksScreen` (wait for a rewards partner, 2603); `AiCourseDraftScreen` (AI work, 2607); `MyTestsScreen` (with the assessments question bank, 2677); `SkillsLibraryScreen` (one library in Settings › Performance, 2671: drop or point there); `EnrolmentSheet` → T2-C if Learning is touched, else with the next Learning pass.
    - Hiring (5): `InternalJobsPhone`, `ReferralsPhone`, `ScorecardPhone`, `TimesheetApprovalsPhone` → T2-H (phone); `AiInterviewReviewScreen` → the AI work.
    - Ops (1): `StatutorySetupScreen` (CMP-02) stays parked with the payroll partner (2611).
    - Pay (2): `GroupHealthScreen` (PAY-43) and `RunReadinessScreen` stay out with the platform tools and partners (2658).
    - People (11, all phone): `AssetAcknowledgePhone`, `BfsiPhone`, `CertificateRequestPhone`, `ClearancePhone`, `DisabilityPhone`, `ExitInterviewPhone`, `MyDocumentsPhone`, `PreclearancePhone`, `ProfileChangePhone`, `ResignationPhone`, `WhoAccessedPhone` → T2-H.
    - Time (15, phone or kiosk): `AttendanceCalendarPhone`, `DayCardPhone`, `ExceptionsPhone`, `FieldVisitPhone`, `HybridPhone`, `LeaveHomePhone`, `MobileCheckInSheet`, `MyShiftsPhone`, `OpenShiftsPhone`, `PrefillPhone`, `StandbyPhone`, `TeamLeaveCalendarPhone`, `TeamTodayPhone` → T2-H; `HomeClockScreen` (its clock card is already on the live Home, `attendance.tsx:2460`) → T2-A makes the live Home use the screen or drops the wrapper; `D` is a date helper in `time/live/kit.tsx:28` that the guard mistakes for a screen → renamed in T2-A (no screen).
    - Settings (33): the 30 `Mobile…` screens → T2-H; `AccessDeniedState`, `AvailabilityState`, `NotFoundState` → T2-G (the app's 403, maintenance and 404 pages). Also the settings pages drawn but not built (settings design map "Not built": 1.7, 1.8, 2.4, 2.8, 2.11, 4.11, 5.1, 5.6, 5.9, 6.4, 6.5, 7.4, 7.8, 7.9, 8.4, 8.5 and the rest of that row): each goes live with its feature (2.8 with IT assets, 2712).
    - Platform A (24) and Platform B (41): builder tools, billing, trials, copilot, data region and developers → the end (2750). `IntegrationsScreen`, `PoliciesPageScreen` and `CommandPaletteScreen` are checked in T2-G in case a live page should already use them.
    - Portals (39): partner, vendor, trainer, campus, IC member and status-page portals → the end (2411); `CollegeCoordinatorScreen` and `CampusRegistrationScreen` with the next assessment work.
    - Proctoring (15): analytics, planners and the invigilator and candidate apps → with the next assessment work (2411).
- 2740: tier-2 order. Suggested answer: T2-A attendance, leave and team → T2-B pay and expenses (with the statutory fixes) → T2-C performance (with the 5 live copies) → T2-D timesheet → T2-E approvals and notifications → T2-F home, people and helpdesk → T2-G admin and platform basics → T2-H phone; then tier 3. Each batch has its own plan and report, as before.
- 2741: the phone screens (85, about 65 designed phone screens). Suggested answer: first make the designed phone layouts live in the web app at phone width (installable as a web app, with push), for screens whose web page is live; a native app (offline punches, device binding, store listing) is a separate decision after that.
- 2742: WhatsApp and push (52, 93). Suggested answer: push through the installable web app (2741) in T2-E; WhatsApp needs a WhatsApp Business provider account and approved message templates per company, so it waits until the founder picks the provider (Meta's WhatsApp Cloud API directly, or a reseller).
- 2743: Hindi (84, GLPI 9). Suggested answer: Hindi for the employee self-service screens first (Home, Me, leave and attendance, payslips, helpdesk, approvals) and their notifications and emails; admin and payroll set-up screens stay English; renamed terms (company words for "department", "grade" and so on) for every screen. Other languages later, on the same files.
- 2744: scheduled backups (45). Suggested answer: the platform's own database backups stay ours; the company gets a scheduled export of its data (every table it owns, as CSV in an encrypted zip), weekly by default, sent to its own storage (Amazon S3, Azure Blob or Google Drive, connected by the System Admin), each export logged in the export log.
- 2745: rule-based groups and a person per module (42, 44). Suggested answer: one groups feature (rules on entity, location, department, grade, employment type and tags, members worked out daily), usable wherever an audience or approver is picked (announcements, surveys, learning rules, approvals); "a person per module" is a named owner per module (shown on Home and in helpdesk routing), not a new permission.
- 2746: modules on / off (41). Suggested answer: a module switched off hides its menus and pages and its API answers 403, but its data stays; switching it on again brings everything back. Payroll and People cannot be switched off.
- 2747: headcount and attrition (47). Suggested answer: headcount on the last day of each month, attrition = exits in the period ÷ average headcount, split voluntary / involuntary and by entity, department, location and grade; groups under 5 people show no split (like survey results); for People and analytics key holders.
- 2748: calendar sync (70, 90). Suggested answer: a private calendar feed link (read-only ICS: leave, holidays, one-on-ones, sessions) first; two-way Google and Microsoft sync later with the integrations work.
- 2749: partner items in tier 3 (98 receipt reading, 101 Aadhaar e-sign, 102 background checks). Suggested answer: they stay parked until the founder picks each partner; receipt reading uses the company's AI credits when the AI work is built.
- 2750: platform builder tools (103 custom forms, 104 workflows, 105 report builder, 106 field-level control and the platform A / B screens). Suggested answer: at the very end, after tier 2 and the rest of tier 3, as 2411 and 2658 say.
- 2751: designed, not-live leftovers. Suggested answer: as listed above; `SkillsLibraryScreen` is dropped (2671), the `D` helper renamed so the guard stops counting it, and `AccessDeniedState`, `AvailabilityState` and `NotFoundState` go live in T2-G.
- 2752: leaderboards (91). Suggested answer: stay off until points are chosen (2667).
- 2753: items that turn out partly live. Suggested answer: the builder checks each item against the code at the start of its batch, lists the ones already live (with a manual test), and builds only what is missing.
- 2730 (payroll statutory review 26 Nov, docs/yukthix/reviews/payroll-statutory-review-2026-11-26.md): fix now where the law is clear: R1 (PF admin charges on the capped wage), R3 (ESI no employee share at or below Rs 176 a day), R7 (surcharge marginal relief), F1 (Rs 500 PF admin minimum), M2 (Rs 100 minimum bonus), M3 (LWF state applicability), M5 (Tamil Nadu half-yearly PT on actual half-year income), M6 (Madhya Pradesh yearly PT after a mid-year change), M7 (Rs 7.5 lakh employer PF+NPS+superannuation cap). Send to the CA before any fix: R2 (mid-month joiner PF ceiling), R4 (Maharashtra PT for other genders), R5/R6 (international worker and higher pension), F2 (employer NPS 14% cap), the September 2026 PF ceiling split, what the minimum-wage check compares, M8 (tax rounding to Rs 10), M1 (EPS membership worked out).
- Founder answers (26 Nov 2026, "ok for all"): 2710-2722, 2730 and 2740-2753 approved exactly as suggested above.
- T2-A (attendance, leave and team: 39, 40, 48, 53, 54), checked against the code first (2753), 26 Nov 2026:
  - D8 request limits (part of 39): partly live before. Least and most days per request, most days in a month and notice (block or warn) were live. **Built now** (no decision needed; each is off until HR sets it on a leave type): most requests starting in a month, whole days that must pass between two requests of the type, and the weekdays it can be taken on (TIM-27 Rules tab; refused on apply with a plain reason). Not built: "most days in a row across back-to-back requests" (2756).
  - D9 comp-off (40): mostly live before. Expiry (leave.comp_off.expiry_days, default 60, lapse job), credit from approved overtime and from a holiday on a weekly off are live. Not built: crediting weekends and holidays worked without a claim, and "take now, work later" (2757).
  - D2 policy gallery, D3 experience levels, D6 clubbing (39): missing; each needs a decision (2754, 2755, 2758).
  - C6 leave overview cards (48): partly live (pending requests, who else is off, away this week on Team leave). The unplanned-leave and no-leave-taken cards need definitions (2759).
  - C2 peers view (53): missing; needs who counts as a peer and what they see (2760).
  - C11 manager approves internal moves (54): missing; it reverses an earlier founder decision (2761).
- 2754: D2 ready-made leave policies. Suggested answer: a gallery of starter leave types HR can add in one click (casual 12, sick 12, earned 15 with carry-forward 30, maternity 26 weeks and paternity 5 days, comp-off, leave without pay), each marked "starter" and editable; offered on first set-up and from Time › Set-up; state rules (for example Factories Act earned leave of 1 day per 20 days worked) as separate starters with their source.
- 2755: D3 experience levels. Suggested answer: a band changes only the yearly days (and, with answer 2337, the ceiling); service counts from the joining date; a new band applies from the next credit after the anniversary; bands are part of the dated policy version.
- 2756: most days in a row across back-to-back requests (D8). Suggested answer: count requests of the same type that touch each other, with weekly offs and holidays in between counting as joined; refuse above the limit, like the other limits.
- 2757: comp-off without a claim (D9). Suggested answer: keep the claim and the manager's approval for weekends and holidays worked (a punch alone is not proof of work asked for); add a company setting "credit automatically when the day is approved as worked by the roster", off by default. "Take now, work later" stays as a negative balance on the comp-off type.
- 2758: D6 clubbing ("cannot be taken next to"). Suggested answer: a leave type lists the types it cannot touch; weekly offs and holidays in between still count as touching; refused on apply with the other type named.
- 2759: C6 overview cards. Suggested answer: "unplanned" = leave applied on or after its first day (any type); "no leave taken" = no approved leave in the last 90 days (a company setting); managers see counts and names, never the leave type of sick or medical leave.
- 2760: C2 peers. Suggested answer: peers are people with the same manager today; the peers view shows only "away" on a day (no leave type, no times), read-only, for each person's own peers.
- 2761: C11 internal moves. Founder decision 6 (hiring) said the manager is told, not asked. Suggested answer: keep "told" by default and add a company setting "the manager approves releasing a person" (off by default); when on, the manager decides before the offer, through the approvals engine, and no answer in 5 working days goes to HR.
- Founder answers (26 Nov 2026, "ok for all") to the T2-A questions written on feat/yukthix-offer-issue, approved exactly as suggested:
  - 2754: a gallery of starter leave types (casual 12, sick 12, earned 15 with carry-forward 30, maternity 26 weeks, paternity 5 days, comp-off, leave without pay), marked "starter" and editable, offered at first set-up and from Time › Set-up.
  - 2755: a service band changes only the yearly days (and the ceiling, 2337); service counts from the joining date; a new band applies from the next credit after the anniversary; bands are part of the dated policy version.
  - 2756: most days in a row counts back-to-back requests of the same type, with weekly offs and holidays between them counting as joined; refused above the limit.
  - 2757: comp-off keeps the claim and the manager's approval; a company setting "credit automatically when the day is approved as worked by the roster", off by default; "take now, work later" stays as a negative balance.
  - 2758: a leave type lists the types it cannot touch; weekly offs and holidays between still count as touching; refused on apply with the other type named.
  - 2759: overview cards: "unplanned" = applied on or after its first day; "no leave taken" = no approved leave in 90 days (a company setting); managers see counts and names, never the type of sick or medical leave.
  - 2760: peers are people with the same manager today; the peers view shows only "away", read-only.
  - 2761: internal moves: the manager is told by default; a company setting "the manager approves releasing a person" (off by default) sends it through the approvals engine, and no answer in 5 working days goes to HR.
  - 2762 (payroll review M3): a "manager or supervisor" field on the job record, set by HR, used for the Tamil Nadu and Delhi LWF exclusions.
- 2780 (IT assets): the Finance role template holds asset.view as well as asset.finance.view, so Finance sees the whole register including who holds each asset. Founder answer (27 Nov 2026, "all ok"): keep it; Finance needs the holder to chase recoveries and write-offs; a company that wants it narrower makes its own role.
- 2781 (Learning, 27 Nov 2026): founder answer "ok": SCORM goes next for builder 2, right after IT assets and before the rest of T2-A. Scope: SCORM 1.2 and 2004 (xAPI later); a proven open-source player (licence checked first, e.g. scorm-again, MIT); upload a zip that is unpacked and virus-checked; the player in the course page, saving progress, score, completion and resume; LRN-06 enrolment sheet goes live with it. Security: packages run in a sandboxed frame on a separate origin, with zip size, count and path-escape limits, and may only report progress and score.
- Founder answers (27 Nov 2026, "ok for all"): 2770-2775 (E5 payroll controls) approved exactly as suggested above.
- E2/E3 plan review (docs/yukthix/reviews/e2-e3-plan-review-2026-11-27.md), founder answers (27 Nov 2026, "ok for all"):
  - 2785: payroll run, period reopen, correction, payment mode and reports access approvals stay built-in and read-only in the editor; other pay types allow only add-on steps.
  - 2786: "LOP change" is removed from the back-dated pay triggers (changes 2651): late attendance fixes are already paid as one-time pay. Triggers are salary change and joining date.
  - 2787: statutory rule changes do not auto-draft arrears; the existing proposal that a company user accepts stays, with the total and the largest change added.
  - 2788: "holders of a key in this entity" means scoped grants for the entity first, company-wide holders only when there are none; ordered, and "all" or "count" refused on a group that can exceed 25.
  - 2789: before old hiring chains move into rules, each company gets a dry-run of old versus new approvers; only matching companies move, the rest are listed for HR.
  - Cuts agreed: the separate rule-version table (use policyVersion on the request), impact counts on open requests, position-holder approvers until a customer uses positions, custom notice text except the two hiring types, and the mid-year PF/tax true-up. Build order as in the review.
- IT assets built (26-27 Nov 2026, branch feat/yukthix-it-assets; 2719 waits for costing): 2712 categories (Settings 2.8 live), 2720 tag numbering, 2711 money only for asset managers and asset.finance.view, 2710 Helpdesk › IT assets; 2713 depreciation and net book value (the "Written-down value" recovery); 2714 warranty and contract alerts; 2722 the asset's tickets; 2716 suppliers; 2717 contracts with tacit or express renewal; 2718 software licences with seats (freed at exit clearance); 2715 bookings (bookable assets, repeats, optional approval, hand-over and take-back on the register, reminders). Questions from the build, each with the default built:
- 2820: the F&F recovery on "Written-down value" uses the net book value as of today, worked out again each time the settlement is updated. Suggested answer: fix it at the leaver's last working day.
- 2821: contract types are a fixed list (Maintenance (AMC), Support, Lease or rental, Insurance, Subscription, Other). Suggested answer: keep the fixed list; add "edit in Settings 2.8" only if a customer asks.
- 2822: contract support hours are free text. Suggested answer: a weekday-and-time picker with the Helpdesk vendor work (M14), where SLA timing needs it.
- 2823: any site-level asset manager can retire a supplier from the company-wide list. Suggested answer: only company-wide asset managers retire suppliers; site managers add and edit.
- 2824: express contracts have no "Renew" button (a manager changes the start or length). Suggested answer: add "Renew" that adds one more length, recorded and audited.
- 2825: a leaver's licence seat is freed only when its clearance item is cleared, not waived. Suggested answer: waiving frees the seat too (the person has left either way), audited.
- 2826: a person's licence seats show under Me › My assets only. Suggested answer: also on the PPL-03 Assets tab for HR and managers, like their assets.
- 2827: employees can book bookable assets across the company. Suggested answer: yes, company-wide, with the location shown and a location filter (as built).
- Founder answers (27 Nov 2026, "ok for all"): 2820-2827 (IT assets follow-ups) approved exactly as suggested above. To build: 2820 (recovery value fixed at the last working day), 2823 (only company-wide asset managers retire suppliers), 2824 (Renew button on express contracts), 2825 (waiving the clearance item frees the licence seat), 2826 (licence seats on the profile Assets tab for HR and managers). 2821, 2822 and 2827 stay as built.
- SCORM built (27 Nov 2026, branch feat/yukthix-scorm, answer 2781): SCORM 1.2 and 2004 packages as course items (scorm-again 3.5.0, MIT), unpacked and virus-checked file by file, played in a sandboxed frame from a separate content origin (SCORM_CONTENT_ORIGIN) with signed short-lived links and a content security policy; only the allowed progress and score fields are kept; completion follows the normal course completion. LRN-06 enrolment sheet live.
- 2790: all packages share one sandboxed content origin. Suggested answer: keep one origin; a subdomain per package only if packages ever need same-origin storage.
- 2791: a launch link lasts 3 hours. Suggested answer: keep it fixed (not a company setting).
- T2-A build (feat/yukthix-t2a, 27 Nov 2026): 2754, 2755, 2756, 2757, 2758, 2759, 2760 and 2762 built; 2761 not yet. Questions:
- 2830: the "Unplanned leave" card counts requests whose first day is in the current month (applied on or after that day). Suggested answer: keep this month.
- 2831: "No leave in 90 days" leaves out people who joined less than 90 days ago (they could not have taken leave in the whole window). Suggested answer: keep.
- 2832: on Team › Leave, sick and medical leave show as "Leave" everywhere a manager reads the overview (away this week, who else is off); the approval itself still shows the type to the person deciding it. Suggested answer: keep.
- 2833: the earlier suggestion for 2754 also had state rules (Factories Act earned leave, 1 day per 20 days worked) as separate starters; the approved list did not. The factory leave table already applies that minimum at registered factories. Suggested answer: no separate starter; the factory table stays the source.
- 2834: comp-off from the roster (2757) counts a published roster shift on the person's usual weekly off (their location or pattern, without the roster) or a full holiday, worked for at least the half-day minutes, within the claim window (leave.comp_off.claim_within_days, default 30). Suggested answer: keep.
- 2835: the Tamil Nadu (15,000) and Delhi (2,500) supervisor levels are compared with the month's statutory-wage earnings, the same base as Haryana's rate. Suggested answer: keep until the CA says otherwise (rule sets marked verify).
- 2836: 2761's "5 working days" before HR gets the release: Monday to Friday less the company-wide holidays, as answer 973. Suggested answer: yes.
- T2-A follow-up (feat/yukthix-t2a, 27 Nov 2026): founder approved 2830-2836 as suggested. E2e on the real database for 2757, 2759 and 2760 (no fixes needed); the time controller in endpoint permissions; web tests for 2755 and 2762. **2761 built**: company setting hiring.internal.manager_release (off by default, Settings › Hiring › Internal jobs). On: applying for an internal job sends a release request to the current manager through the approvals engine (request type hiring.internal_release); no offer is made until they agree, and none after they refuse. With no decision in 5 working days (answer 2836) the hourly job also gives it to the company's HR Admins (not the manager's manager); either decides. Off: the manager is told, as before. Migration 852. Questions:
- 2837: HR gets the release only once the manager's 5 working days are fully over (asked on a Monday: the manager has Tuesday to the next Monday; HR from the Tuesday after). Suggested answer: keep.
- 2838: "HR" here means the company's HR Admins (people whose profile holds org.settings.manage), the same people the approvals engine uses for its HR step; a company admin by role only is not included. Suggested answer: keep.
- 2839: after the manager (or HR) refuses, the application stays on the hiring board but no offer can be made, and nobody can override it. Suggested answer: keep; add an HR override only if a customer asks.
- 2840: turning the setting off does not cancel releases already waiting; they still need a decision before an offer. Suggested answer: keep.
- 2841: the applicant sees the decision as the usual approval notice, but My applications does not yet show "Waiting for your manager". Suggested answer: add that status line on HIR-13 in the next hiring batch.
- T2-C plan (performance: 68, 70, 71, 72, 2661 and the 5 live copies), checked against the code first (2753), 27 Nov 2026:
  - 68 D3 "What is expected of me" (M): missing for employees. Live: the competency library (PRF-14, HR only: Performance › Competencies, setup routes competencies, import, merge, retire) and values inside review forms. To build: a read-only employee page from the competencies set for their job and the company's core values (2842).
  - 70 B1 agenda templates (M): missing. Live: 1:1s (PRF-11) with agenda items, actions, private notes, rhythm and a suggested agenda. To build: agenda templates picked when a 1:1 is set up (2843). Calendar sync stays with tier 3 item 90 (2748).
  - 71 A3 goal templates and import (M): missing. Live: one goal form, align to a parent, cascade; the competency import is the pattern for a file import (preview, errors per row). To build: templates and a CSV import (2844).
  - 72 C2 bell-curve guide (S): **mostly live**. A calibration session already takes an optional distribution guide (shares per band adding up to 100, a tolerance, notes when a band is off, never blocks sign-off; calibration-rules spec). Missing: a company default (2845). Manual test to add for the live part.
  - 2661 kudos in reviews (M): missing. Kudos are live in Engage (kudos.service); the review screens show none. To build: the period's kudos on the review by value, as context, never scored, the person can hide one (2846).
  - The 5 live copies to re-wire to their designed screens (2411; design-live-guard.known.json liveCopies): CompCyclesScreen (Performance › Comp), PerformanceReportsScreen (Reports), PerformanceSetupScreen (Settings › Performance), PipsScreen (PIPs), ReviewerBlocksScreen (Reviewer blocks). Each page renders the designed screen with `live`, the copy is deleted, and the guard's known list shrinks; parts of a design with no API yet are left out, not faked (2847).
  - Order: the 5 re-wires first (no new answer needed), then 72's company default, 2661, 68, 70, 71. Each item: API, kit story first for any new need, web, P+N tests, endpoint permissions, new tables in rls-isolation, Settings pages in yx-nav, a manual test.
- 2842: 68 "What is expected of me": what it shows and where. Suggested answer: under Performance › What is expected of me, read-only: the competencies set for the person's designation (or grade), each with its weight and behaviours, then the company's core values; no ratings; the manager sees the same page for each report.
- 2843: 70 agenda templates: who makes them. Suggested answer: HR makes company templates in Settings › Performance; a manager may save their own; picking one fills the 1:1's agenda, which stays editable.
- 2844: 71 goal templates and import: who uses them. Suggested answer: HR keeps goal templates (by department or designation) that anyone adding a goal can start from; a CSV import of goals for many people is for holders of the goal-setting key in scope, with a preview and a reason per refused row, like the competency import.
- 2845: 72 the bell-curve guide as a company setting. Suggested answer: a company default guide (Settings › Performance, off by default) that fills a new calibration session's guide, still changeable per session; it never blocks sign-off.
- 2846: 2661 kudos in reviews: which ones and when they can be hidden. Suggested answer: kudos received in the review period, grouped by value, shown to the person and their reviewers; the person can hide any one until the manager submits the review; hidden ones are never shown to reviewers; never scored.
- 2847: a designed screen whose parts have no API yet (for example report kinds not built). Suggested answer: when re-wiring the 5 live copies, show only the live parts of the designed screen and list the missing parts in the batch report, as 2411.
- E2 approval rules editor built (27 Nov 2026, branch feat/yukthix-e2-engine, parts 1-7): every engine request type in Settings › Approval policies by area (pay run types built in; other pay types, exits and letters add-on steps only; hiring, plans and positions fully editable), rules with conditions and an otherwise route, approver kinds (named people, groups, key holders, up the chain to a grade or the approval limit, hiring manager), Settings › Approval limits, "Try it" on the engine's own route, the hiring-route dry run and move, Hiring › Approvals on the same editor, and requisition and offer notice text.
- 2812: Hiring › Approvals now shows for those who may see the approval policies (the settings key, or HR who read the structure), not for the old approvals:configure key. Suggested answer: yes, one editor, one set of keys.
- 2813: changing loan approvals needs payroll.loan.approve (the key loans are approved with), not payroll.run.approve. Suggested answer: yes.
- 2814: on one-time pay and loans a company may add only named people, groups, HR Admins or holders of the pay key, so everyone is checked for the key when the policy is saved; managers and "up the chain" are refused there. Suggested answer: yes.
- 2815: once a company has its own requisition or offer policy, hiring stops reading the old route, and every requisition goes through the policy (no more opening at once when there is no route). Suggested answer: yes.
- 2816: "Reassigned to you" notices use the company's "Approval needed" text. Suggested answer: yes; add a separate "Reassigned" text only if a customer asks.
- 2817: the move of old hiring routes runs per company from Hiring › Approvals, and for every company with `npm run hiring:move-chains`. Suggested answer: run the command once after this release; companies that do not match see the differences in Hiring › Approvals until HR sets their rules.
- Founder answers (27 Nov 2026, "ok for all"), approved exactly as suggested:
  - 2790: one shared sandboxed content origin for all SCORM packages; a subdomain per package only if packages ever need their own storage.
  - 2791: the SCORM launch link lasts 3 hours, fixed (not a company setting).
  - 2810: IT cost lines get a date field: not in the future and not before the ticket was opened.
  - 2811: removed IT cost lines show struck through, with who removed them and why, to the desk's agents only.
  - 2812-2817: approval rules editor (E2) answers as suggested in the E2 report: Hiring › Approvals follows the editor's keys; loans need payroll.loan.approve to edit; one-time pay and loan add-on steps allow only named people, groups, HR Admins or pay-key holders; with its own policy hiring never reads the old route and a requisition never opens without approval; "reassigned to you" uses the "Approval needed" text; run npm run hiring:move-chains once after release.
  - 2818: the rule editor may scroll (an editing screen, an exception to the no-scroll rule); the move card's table of differences on Hiring › Approvals is collapsed by default so that page fits.
  - 2850: whoever approved the salary change cannot approve its arrears either (a third person approves).
  - 2851: a joining-date correction flow later, using the same trigger.
  - 2852: template version and pay-range re-pricing through a bulk salary revision with its own preview, when a customer asks.
  - 2853: a newer trigger draft replaces an older one; drafts made by hand are never replaced.
- Founder answers (27 Nov 2026, "ok for all"): 2830-2836 (T2-A) approved exactly as suggested: unplanned = first day this month; "no leave in 90 days" leaves out joiners under 90 days; sick and medical show as "Leave" across Team › Leave (the approver still sees the type); no separate Factories Act starter; roster comp-off counts a published shift on the weekly off or a full holiday, worked at least the half-day minutes, within the claim window; the Tamil Nadu and Delhi supervisor levels compare the month's statutory wage until the CA says otherwise; 5 working days = Monday-Friday less company-wide holidays.
- E3 back-dated pay built (27 Nov 2026, branch feat/yukthix-e3, on top of the arrears fixes already on test main): per-component "recalculate when" switches (salary change, joining date; LOP removed, 2786); a back-dated salary change or a joining date that reaches a paid month drafts arrears as a BullMQ job keyed on the change (maker = who asked for the change); statutory proposals get a worked-out impact (people, total, largest change) before they can be accepted, and acceptance drafts in chunks on the same job (2652, 2787); ESI on arrears keeps the coverage the period really had; a newer trigger draft keeps bases confirmed by hand; company setting payroll.arrears.auto_draft (default on).
- 2850: the arrears drafted after a back-dated salary change count the person who asked for the change as their maker (so they cannot approve them); whoever approved the change still can. Suggested answer: also bar the change's approver from approving its arrears.
- 2851: YukthiX has no way to correct an existing person's joining date, so the joining-date trigger runs when a person is added with a joining date in a month already paid (it drafts once a salary exists). Suggested answer: add a "correct joining date" change later; it uses the same trigger.
- 2852: a new salary template version or pay range does not re-price salaries already set, so the impact preview runs on statutory rule changes (and each salary change drafts on its own). Suggested answer: re-price through a bulk salary revision, with its own preview on the same job, when a customer asks.
- 2853: a newer draft from a trigger or rule replaces an older one over the same months (bases confirmed by hand are carried over); a draft payroll made by hand is never replaced, and the trigger lists that person as "not drafted" with why. Suggested answer: yes.
- Founder answers (27 Nov 2026, "ok for all"): 2837-2847 approved exactly as suggested above (internal-move release 2837-2841; T2-C performance 2842-2847).
- 2848 (T2-C): four performance list pages with no drawn design (Reviewer blocks, PIPs, Comp cycles, Reports) became kit design screens as they were. Founder answer (27 Nov 2026, "ok for all"): keep them; redraw only if the founder wants a different look.
- Founder answers (27 Nov 2026, "ok for all"): 2860-2864 (T2-B) approved exactly as suggested: 2860 the own-salary-history API leaves out pending or turned-down requests and names too; 2861 the advance limit is per advance; 2862 advances off refuses new ones and settles existing ones; 2863 one zip, single-use 60-second link, no password; 2864 the pay summary stays at the top of Me › Payslips.
- T2-B (pay and expenses: 63, 64, 65, 66, 67), checked against the code first (2753), 27 Nov 2026:
  - B3 salary timeline (63): partly live. The API already lets a person read their own salary history and the salary in force (the PAY-12 history, self allowed); only HR had a screen. **Built:** Me › My pay › My salary: the salary in force marked "Current", a later approved one marked "Starts on …", then earlier salaries newest first, each opening its breakdown (monthly and yearly per component). Shows approved salaries only (2860).
  - B1 pay summary (64): live. Me › Payslips opens on the latest payslip with net, gross, deductions, payment status, paid days and unpaid days, and the PDF (2864). Manual test MT-T2B-64-PAY-SUMMARY only.
  - B4 download the year (65): missing. **Built:** "Download the year" on Me › Payslips: one zip of that tax year's published payslips, each PDF drawn and watermarked as today, from a single-use 60-second link (2863).
  - A2 "Save and add another" (66): missing. **Built:** on a new claim line, "Save and add another" saves the line and opens a fresh form of the same kind.
  - A6 advance rules (67): partly live (approval route, settle days, recovery instalments). **Built:** company settings "Expense advances" (on by default) and "Most one advance can be" (off by default, can differ per legal entity and per grade). Off: no new advance, on its own or on a trip, with a notice on the Advances page (2862); the cap is checked on each advance asked for (2861).
  - Built on branch feat/yukthix-t2b-pay-expenses (27 Nov 2026), one commit each, manual tests MT-T2B-63 to MT-T2B-67. Also fixed on the way: Me › Payslips saved the PDF link's text instead of the PDF; it now follows the link.
  - Statutory review (2730): every "fix now" item is on test main (M2, the Rs 100 minimum bonus, is in the bonus rules; M3 came with T2-A). Nothing left for T2-B.
- 2860: B3 the employee's salary timeline shows approved salaries only; pay requests still waiting or turned down, and the names of who asked and who approved, are left out. Today the API's own-history answer still includes them. Suggested answer: approved only on the screen, and the API leaves requests and names out of a person's own history too.
- 2861: A6 the advance cap is checked on each advance asked for (on its own or on a trip), not on all open advances together; an approver may still approve less. Suggested answer: per advance, as built; a cap on all open advances together only if a customer asks.
- 2862: A6 with advances switched off, new advances (on their own or on a trip) are refused and the Advances page says so; advances already asked for or paid carry on and settle as usual. Suggested answer: yes.
- 2863: B4 "Download the year" gives one zip of the tax year's published payslips (regular and off-cycle), each watermarked with the person's name and the time, from a link used once within 60 seconds. Suggested answer: yes; no password on the zip (payslip passwords were dropped earlier).
- 2864: B1 the pay summary is the top of Me › Payslips (the latest payslip opens first), so no separate summary card is added. Suggested answer: keep as is.
- T2-D (timesheet and projects: 55-62), checked against the code first (2753), 27 Nov 2026:
  - A10 / A11 my projects with my hours (55): missing (the week's picker lists projects; no page of them). **Built:** a "My projects" tab on Me › My timesheet: each project I am or was allocated to, with my role, allocation dates and %, the project's status and manager, and my hours booked and approved on it. No new answer needed.
  - A9 / C4 tasks with assignees and a board (56): missing. Tasks have a budget and burn but no assignees, stages or board; needs answers on stages and on what an assignee changes (2865, 2866).
  - C2 actions pending and who is on leave (57): missing on the project page. "Actions pending" needs a definition (2867); who is away needs what the project manager may see of leave (2868).
  - C10 per-project settings (58) and B4 second approval level (59): missing; company-wide rules only, and one approval level (project manager, then the client if set). They go together: what a project may change and who the second approver is (2869, 2870).
  - C11 hours reports (60): partly live (capacity board, cost export, payroll feed); no hours reports. Needs which reports and who sees them (2871).
  - A2 view switch (61): partly live (the week turns into day cards only on narrow screens). **Built:** a Grid / Day cards switch on the week, remembered on the person's device.
  - A6 activity card (62): partly live (the audit log only). **Built:** an "Activity" card under the week: sent, recalled, each line approved, reduced or rejected, and the week's outcome, with who and when. Recalling a week is now audited too.
  - Built on branch feat/yukthix-t2d (27 Nov 2026), one commit each, manual tests MT-T2D-55, MT-T2D-61, MT-T2D-62. 56-60 wait on 2865-2871.
  - **Built (part 2, branch feat/yukthix-t2d2-t2e, 27 Nov 2026, after 2865-2871):** 56 task stages (To do, In progress, Done and up to 3 of the company's own in Settings › Projects), assignees from the team and a List / Board switch (drag or Move to; a Done task takes no new hours; my tasks first on my week); 57 actions pending for the project manager and who on the project is away in the next 14 days (Away with the days, never the leave type); 58 a Settings tab per project (who may book, daily comments, billable by default; anything left follows the company); 59 an optional second approver after the project manager, line by line, nobody approving their own hours, the client step last; 60 Projects › Hours reports (by person and by task, filters, CSV; PMs their projects, the new projects.reporting key all). Manual tests MT-T2D-56-TASK-BOARD, MT-T2D-57-PENDING-AND-AWAY, MT-T2D-58-59-PROJECT-SETTINGS, MT-T2D-60-HOURS-REPORTS. Question 2900.
- 2865: 56 task stages for the board. Suggested answer: a fixed list per company (To do, In progress, Done, plus up to 3 of the company's own in Settings › Projects); a task moves by drag or a menu; Done tasks take no new hours.
- 2866: 56 what a task's assignees change. Suggested answer: assignees are shown on the task and on the person's week (their tasks first in the picker); anyone allocated to the project can still book to any task; the project manager assigns.
- 2867: 57 "actions pending" on the project page. Suggested answer: for the project manager only: weeks waiting for their approval, people on the project with weeks not sent, resource requests waiting, and billing periods ready to invoice, each with a link.
- 2868: 57 who is on leave, on the project page. Suggested answer: people on the project away in the next 14 days, shown as "Away" with the days, never the leave type (as 2759 and 2760), for the project manager and the project's members.
- 2869: 58 per-project settings. Suggested answer: a Settings tab on the project for its manager: who may book (everyone allocated, or named people), daily notes required or not (overriding the company rule), billable by default, and the approval levels (59); anything not set follows the company rule.
- 2870: 59 the second approval level. Suggested answer: off by default; when on for a project, a named person (for example the delivery head) approves after the project manager, through the approvals engine, line by line as now; nobody approves their own hours; the client step stays last.
- 2871: 60 hours reports. Suggested answer: two reports in Projects › Reports: hours by person (week by week, billable and not, per project) and hours by task (budget, booked, approved), each filtered by project, client and dates, with CSV export; project managers see their projects, holders of the projects reporting key see all. The payroll feed stays as it is.
- Founder answers (27 Nov 2026, "ok for all"): 2865-2871 (T2-D part 2) approved exactly as suggested.
- T2-C built (27 Nov 2026, branch feat/yukthix-t2c): the 5 re-wires; 72 the company bell-curve guide (three company settings on Settings › Performance, off by default, fills a new calibration session's guide only when it names the cycle's scale bands); 2661 kudos in reviews (by value, never scored, the person hides one until the manager submits); 68 What is expected of me (PRF-18, the person and their manager chain); 70 1:1 agenda templates (company ones by HR, a manager's own; new table one_on_one_templates); 71 goal templates by department or designation and a CSV goal import with a preview (new table goal_templates); 2841 "Waiting for your manager" on HIR-13. Missing parts (2847): a competency weight is not kept anywhere (68 shows the expected level and behaviours); the goal import takes KPI goals only.
- 2880: 68 "What is expected of me" was to show each competency's weight, but competencies carry no weight (a review template weights the whole competencies section). Suggested answer: show the expected level and its behaviours as now; add a per-designation weight to the competency links only if the review starts scoring competencies one by one.
- 2881: 71 the goal CSV takes KPI goals only; an objective needs key results with start and target numbers, which make a file hard to fill. Suggested answer: keep KPI only in the file; objectives are added on the Goals page or from a goal template.
- 2882: 71 imported goals come in as drafts, so each person sends them to their manager as usual (the goal approval setting still applies). Suggested answer: keep drafts; if HR wants imported goals agreed at once, add a company setting later ("imported goals start as approved").
- 2883: 70 a manager's own 1:1 templates are seen only by that manager, and are not listed in Settings. Suggested answer: keep them private; HR shares good ones by making a company template.
- Founder answers (27 Nov 2026, "ok for all"): 2880-2883 (T2-C follow-ups) approved exactly as suggested.
- T2-F plan (home, people and helpdesk: 79, 80, 81, 82, 86, 87, 43, 77, 78), checked against the code first (2753), 27 Nov 2026:
  - 79 D2 choose Home widgets (S): **drawn, not live**. The kit's DashboardGrid has the drawn "Edit home" (show, hide, order, size); the live Home (RoleHomeScreen live) is fixed, and nothing stores a person's layout. To build: Edit home on the live Home, the layout kept per person (2884). **Built:** the drawn DashboardGrid Edit home on the live Home (remove, add back, order, size, Undo, Reset to company layout); the layout is kept per person in YukthiX (home_layouts, RLS), so it follows them to any device; pinned widgets (Needs your action, Attendance today, the nudge) cannot be hidden or moved. Who may personalise is the drawn 2.2 Home page setting "Roles that may personalise their own home" (off for every role by default, as drawn; question 2920) (MT-T2F-79).
  - 80 D3 "last used" slot (S): **partly live**. Ctrl K keeps Recent (yx-recent, per person and company, this browser only); the rail is fixed. No drawn "last used" slot. To build: one rail slot under the areas showing the last area used that is not already on the rail (2885). **Built:** the slot under the areas (above Settings): the last area opened that is not on the person's rail, opening the page last used there; kept in this browser like Ctrl K Recent (cleared on sign-out); nothing until one is used (MT-T2F-80).
  - 81 D5 quick create (M): **designed only**. PLT-05 request sheet (RequestSheetScreen, type picker and forms) is not live; Home quick actions and Ctrl K exist. To build: a "+ New" in the top bar opening the drawn PLT-05 type picker; each type opens its live form (2886). **Built:** New in the top bar opens the drawn PLT-05 type picker (RequestSheetScreen live) with only the types the person may raise, by the same rules as their menu: leave, attendance correction, expense claim, helpdesk ticket, letter or certificate, and a job request with the key to raise requisitions (the design gained the Help and Hiring groups); each opens its live form. Not in support sessions (MT-T2F-81).
  - 82 D6 moved-page stubs (S): **partly live**. Old addresses redirect silently (next.config redirects, /v2 and in-app moves); the not-found page says a page may have moved. To build: in-app moves show a short stub ("This page moved to …" with the link) instead of a silent redirect (2887). **Built:** the 9 in-app moves (Me › letters, hiring scorecards and duplicates, performance cycles and reviews, the 4 retired settings pages) show the 6.3 Moved page stub for 6 months from their move day, with the link, and open the new page after 5 seconds; then straight through. /v2 and outside links redirect at once as before (MT-T2F-82).
  - 86 A2 org chart "Go to top" (S): **missing**, needs no answer. PPL-02 has Show me, zoom, fit, find. To build: a "Go to top" button next to Show me that jumps to the top of the chart (the first person with no manager; several: the first of them).
  - 87 A7 "About me" (S): **missing**. No field on the person. To build: an optional About me on PPL-03 (2888). **Built:** an About me card on the record's Overview: the person writes it (500 characters at most, no approval), anyone who can open the record reads it, HR with employee.profile.edit clears it with a reason (audited); not in any export (MT-T2F-87).
  - 43 B2 onboarding rules by grade and type (S): **partly live**, needs no answer for grade and type. Journey templates match legal entity, location and department (most specific wins). To build: grade and employment type on a template and in the match (each as specific as a department). Reusable rule groups (admin A3) come later (2889).
  - 77 A5 satisfaction filter (S): **partly live**. Ratings after closing (sd_ratings, score 1–5, reason) are in the ticket report export; the ticket list has no rating filter (2890). **Built:** a Satisfaction filter on the ticket list (Low 1-2, Neutral 3, High 4-5, Not rated; any of them), on top of what the agent already sees; saved views and the export keep it (MT-T2F-77).
  - 78 B1 bonafide letter template (S): **missing**, needs no answer. PPL-31 self-service certificates are salary, address proof, employment and NOC. To build: a Bonafide certificate starter (instant, HR can switch on approval per template like the others) in the certificate list.
  - Also: `LinksFrame` (812) is the story-only app frame around design stories; no live page should use it. To do: mark it story-only in the design-live guard instead of "not live". The 2 hiring live copies (ApprovalRoutesScreen, JobBoardsScreen) stay for when their pages are next touched.
  - Order: 86, 78, 43 and the LinksFrame guard first (no answer needed), then 79, 80, 81, 82, 87, 77 after the answers.
- 2884: 79 where a person's Home layout is kept. Suggested answer: in YukthiX per person (a small table, so it follows them to any device), with "Reset to company layout"; the company layout stays the role default; pinned widgets cannot be hidden.
- 2885: 80 the rail's "last used" slot. Suggested answer: one slot below the areas with the last area opened that is not on the person's rail; kept in this browser like Ctrl K Recent; nothing shown until one is used.
- 2886: 81 what "+ New" offers. Suggested answer: the drawn PLT-05 type picker with the request types the person may raise (leave, attendance correction, expense claim, helpdesk ticket, letter or certificate, and for managers a job request); picking one opens that type's live form; the full inline sheet with every form waits for the approvals pass.
- 2887: 82 moved pages. Suggested answer: in-app pages that moved show a stub for 6 months ("This page has moved to …", the link, and it opens the new page after 5 seconds); /v2 and outside links keep redirecting at once.
- 2888: 87 About me. Suggested answer: optional, up to 500 characters, written by the person on their profile (no approval), seen by everyone who can open their profile; HR can clear it with a reason; never on exports.
- 2889: 43 reusable rule groups (admin A3). Suggested answer: build grade and employment type now; when A3 groups exist, a template may also name a group.
- 2890: 77 who uses the satisfaction filter and how. Suggested answer: on the ticket list for desk agents and desk managers who already see those tickets: Low (1–2), Neutral (3), High (4–5), Not rated; the person who rated is shown as today (no new exposure); the rating comment stays in the report.
- 2891: 43 a joining checklist cannot be picked by grade: a joiner has no grade until they join (the joiner form has a designation and an employment type, not a grade). Built: employment type (joining and leaving) and the place, now editable in the checklist editor ("Applies to"; before, only the API could set the place). Suggested answer: add an optional grade to the joiner form, then grade on checklists, in the A3 rule-group pass (2889); leaving checklists could use grade now but wait so both work the same.
- Founder answers (27 Nov 2026, "ok for all"): 2884-2891 (T2-F rest) approved exactly as suggested; 2891 the optional joiner grade and grade on checklists come with the A3 rule-group pass.
- T2-E (approvals and notifications: 49, 50, 51, 52), checked against the code first (2753), 27 Nov 2026:
  - A6 filters (49): partly live. Approvals has tabs (Waiting for me, Delegated to me, Sent by me, Team history, Everyone's pending), the kind of request as a joined Segment, and Type and Due filters with search. Missing: filters by who asked and by status (2872).
  - A4 "Decided by me" (50): partly live. The API already returns what I decided (my last 50 decisions) but no screen shows it. A "Decided by me" tab is small; it waits only on the period and what it lists (2873).
  - B3 Home nudges (51): partly live. Home shows one feature nudge (C-8) and the "no hours logged today" timesheet card. Missing: cards for a window that is closing (2874).
  - B2 WhatsApp and push choice (52): missing. Notification settings per kind are email on or off with a digest; approval cards for Teams, Slack and a phone push are built but the push service is a go-live line (nothing sends). Push needs the installable web app first (2741): a manifest, a service worker, keys, a subscription per device and a choice per kind (2875-2878). WhatsApp waits on the provider (2742, 2879).
  - Nothing in T2-E is built yet: each item needs an answer first. 50 can be built the same day 2873 is answered.
  - **Built (branch feat/yukthix-t2d2-t2e, 27 Nov 2026, after 2872-2879):** 50 "Decided by me" (30 days, 3 months by default, 12 months; present status; delegation marked); 49 Asked by (a person, my direct team, my whole team) and Status filters; 51 Home reminder cards (at most 2, Not today for the day, each kind a company setting on Settings › Notifications); 52 push through the installable web app (manifest, a service worker that caches nothing, web-push with keys only from server config, one subscription per device removed on sign-out or when gone, neutral titles, a Push column with Pause push and quiet hours 21:00-08:00, the company switch, the iPhone Home Screen hint). 2879 WhatsApp: nothing built. Manual tests MT-T2E-49-50-APPROVAL-FILTERS, MT-T2E-51-HOME-REMINDERS, MT-T2E-52-WEB-PUSH. Questions 2901, 2902.
- 2872: 49 the extra approval filters. Suggested answer: two filters in the filter bar (not chips): "Asked by" (a person, or "My direct team" / "My whole team") and "Status" on Sent by me and Team history (waiting, approved, not approved, sent back, withdrawn). Waiting for me has no status filter (all are waiting).
- 2873: 50 "Decided by me". Suggested answer: a tab listing every request I approved, did not approve or sent back, newest first, with the request's present status and a link to its trail; the period is a Segment (30 days, 3 months, 12 months), 3 months by default; decisions made for someone else (delegation) are included and marked.
- 2874: 51 which closing windows get a Home card. Suggested answer: the tax declaration window and the proof window (from 7 days before they close), the regime choice cut-off, an open self-review or manager review due in 3 days, an open survey closing in 2 days, and a sent-back request of mine waiting on me; at most 2 cards at once, each dismissable for the day; each kind can be turned off by the company.
- 2875: 52 push through the installable web app (2741). Suggested answer: YukthiX becomes installable (a web manifest and a service worker that caches nothing private); push uses the standard Web Push protocol with the web-push library (MIT) and company-independent keys held in server config; each signed-in device that allows notifications is one subscription, removed on sign-out or when the browser says it is gone.
- 2876: 52 what a push shows. Suggested answer: the same neutral rule as the approval cards: a short title only ("A leave request is waiting for you"), never pay figures, names of sensitive requests or ticket content; tapping it opens the page in the app after sign-in.
- 2877: 52 the person's choice. Suggested answer: in Me › Notifications, a Push column next to Email per kind (on by default for approvals waiting and decisions on my requests, off for the rest), plus "Pause push" with quiet hours (default 21:00-08:00 IST, the digest rule); the company can switch push off.
- 2878: 52 phones without the installed app (iPhone Safari needs it added to the Home Screen). Suggested answer: show "Add YukthiX to your Home Screen to get push" on iPhone, and keep email as the fallback; no native app now (2741).
- 2879: 52 WhatsApp. Suggested answer: wait for the provider choice (2742); when chosen, WhatsApp is one more column in Me › Notifications for the same neutral messages, with the company's approved templates, opt-in per person (phone number confirmed by a code).
- Founder answers (27 Nov 2026, "ok for all"): 2872-2879 (T2-E) approved exactly as suggested.
- 2900: T2-D 57 team members without a Projects key cannot open the project page, so they never see who is away. Suggested answer: show "Who is away" per project on their Me › My timesheet › My projects tab.
- 2901: T2-E 52 the push title is the notification kind's label; kinds not on the registered list get a generic title. Suggested answer: keep it, and add the timesheet-line kinds to the list so they get their own neutral title and a Push switch.
- 2902: T2-E 51 Home reminders are worked out each time Home opens. Suggested answer: keep it; add caching only if Home gets slow.
- 2920: T2-F 79 who may use Edit home: the Settings 2.2 design has "Roles that may personalise their own home", off for everyone; built as a company setting with that default. Suggested answer: keep off by default; turn on Employee and Manager in the demo company for testing.
- 2921: T2-F 79 the recruiter home has no option in that setting (the design lists Employee, Manager, HR, Finance). Suggested answer: add Recruiter when the setting is next touched.
- 2922: T2-F 81 "+ New" links to each type's existing form; the inline form per type waits for the approvals pass. Suggested answer: keep it so (as 2886).
- Also on merge (27 Nov 2026, lead): push endpoints are accepted only on the browsers' push services (FCM, Mozilla, Apple, Windows), because the server posts to them; any other address is refused.
- Founder answers (27 Nov 2026, "ok for all"): 2900-2902 and 2920-2922 approved exactly as suggested; 2900, 2901 and 2921 go into the next builder pass (T2-G), 2920 the demo company turns Edit home on for Employee and Manager.
