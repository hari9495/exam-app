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
- 2511 to 2517 (18 Nov 2026, "ok for all"), retiring the /v2 console (builder 2's half):
  - 2511: pending old approval_requests move into P03 at their current step with the same approvers; the move is re-runnable, keyed on the old id. Approved and rejected requests stay read-only.
  - 2512: the old job open/close gate in pipeline.service is replaced by P03 'ats.requisition'; ApprovalsService.submit/decide are then dropped.
  - 2513: drip members without talent-pool consent never move into a pool. Each drip becomes a DRAFT HIR-20 campaign (templates, pool and steps, waits = delayDays) with no members; active drip enrolments end as 'migrated'.
  - 2514: drip stage auto-enrol is dropped and noted on the migrated draft; add it back only if asked.
  - 2515: each offer template becomes a P05 'offer' letter template (same text, mapped fields, e-sign → "person signs"), re-runnable, and the HIR-09 builder lists them. Issuing the offer as a P05 letter with OTP e-accept is a separate next step.
  - 2516: the order is system logs and user search, then approvals and campaigns, then offer templates.
  - 2517: /v2/system-logs sends company admins to /yx/settings/audit-log.
- PR #221 (test/yukthix-main → main): the founder asked whether merging affects the present code. It doesn't. The repo has no deploy workflow, hooks or environments; only CI runs.

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
