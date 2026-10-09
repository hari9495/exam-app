# Consistency review — 25 Sep 2026

## What was checked
- **Automated check.** Every rule ID (`YX-…`) is defined once. Every reference points to a rule that exists, and every "Pxx Qn" / "Mxx Qn" reference points to a real question. Result before the fixes: 291 rules, no duplicates, no broken rule references. After the fixes: **298 rules** (new: YX-SEC-21/22, YX-WF-17, YX-NTF-13, YX-AUD-08, YX-MET-12, YX-PAY-23), still no duplicates or broken references.
- **Reading review.** All 20 documents were read against the §11 decisions of every other document. The review looked for:
  - body text that no longer matched its own decision;
  - conflicts between documents;
  - build-wave mismatches;
  - wrong cross-references;
  - platform capabilities that later module decisions depend on but the platform documents did not yet describe.
- **About 85 findings.** They were fixed in the source documents, so the text of this specification already includes the corrections.

## New decision taken during the review

| # | Decision | Where |
|---|---|---|
| R1 | **AI interview data path.** The video/voice recording and the face match stay in-region on the proctoring engine. Only the text transcript (no face or voice data) goes to external AI for scoring. AI scores are advisory, and a human always decides. This is an explicit exception to YX-AI-01, which otherwise says AI never scores. | P10, M10 |

## What changed, by type

| Type | Examples of what was fixed |
|---|---|
| Body text not updated after a "both / company choice" decision | M10: offer → employee is now automatic **or** manual "Create employee" (Q2) in the rules, flows and tests. M03: TDS and PF/ESI filing include the partner paths (Q6/Q7). M10: BGV runs after acceptance by default. |
| Wrong cross-references | Frappe module numbers replaced with YukthiX docs (e.g. advances → M05/M03, calibration → M06, headcount plan → M10). TDS filing reference moved from P07 to M03 Q6. |
| Platform catalogues behind the module decisions | **P02:** external / limited logins (pre-boarding candidate, alumni, external trainer, POSH external member, audit-committee chair, client contact). New roles: ethics officer, helpdesk agent, L&D admin, travel desk, announcer / moderator. Dotted-line scope and API-key grants. **P10:** connectors for TDS self-file vs e-filing partner, compliance-filing partner, GSP e-invoicing, rewards/vouchers, travel TMC, card statements, Teams/Slack mirrors. **P07:** Factories Act OT and registers, maternity / S&E leave, perquisites (loan benchmark rate, gift threshold), POSH Act parameters, subsistence allowance. **P01:** grade pay ranges, dotted-line managers, division flag. **P05:** PIP, POSH, bond and suspension letters. **P04:** native push, OTP message class. |
| Conflicts between documents | Blanket super-admin data access removed (support sessions only, P02 Q8). Late requests on locked periods now follow P08 Q4 in P01 and P03. Payroll approval = period locked (P08) in M03. Attendance exceptions can't be waived and block approval. Audit diffs mask salary / bank / PAN for readers without access. Grievance and whistleblower cases added to the restricted areas. Manager comp-review pay visibility recorded as a P02 exception. Mobile analytics cards deferred (M04 Q5). Receipt OCR follows P10 Q2. Anonymous-survey minimums apply to every viewer, HR included. |
| Wave alignment | Guided calibration in wave 5 and 9-box in wave 6 (spec updated). POSH awareness logged manually in wave 4, then through M07 from wave 5. Probation uses a simple form in wave 4, then the M06 engine. Basic offer hand-off in waves 4–6, with structured offers in wave 7. |
| Payroll inputs | M03 now lists every one-time-pay source (claims, advance instalments, comp review, bonus pool, rewards, referral and joining bonus, subsistence allowance, loans). YX-PAY-11 protected net pay applies to all recoveries. F&F recoveries include training bonds, bonus clawback, and expense and salary advances. |

## Open team actions (not design questions)

| Area | Action |
|---|---|
| People | Appoint the compliance owner and a partner CA firm (P07 Q2) |
| Content | Start minimum-wage data for all states in waves 1–2 (P07 Q7); POSH and statutory parameters as dated data |
| Licences | Verify docxtemplater (P05) and the SCORM player runtime (M07) licences before use |
| Partners | Payout (P10 Q5), PAN / bank verification (P10 Q6), TDS e-filing (M03 Q6), PF/ESI compliance filing (M03 Q7), BGV (M10 Q5), Aadhaar eSign (P05 Q2), WhatsApp BSP (P04), rewards / vouchers (M09 Q4), GSP e-invoicing (M10 Q7), travel TMC (M05 Q3) |
| Pricing | Add-on prices; partner fees passed through or bundled; SMS quota and overage (P04 Q3) |
| Legal | F&F payment deadline and labour-code wage rules (M01 Q7); POSH record retention (M08 Q7); enforceability of training bonds (M07 Q5) |
| Team review | **TR1 (P11):** decide how far to go with Salesforce-style extensibility (component SDK, custom objects, page-layout builder, partner marketplace, branded portals) and in which wave |
| Pricing | One plan per product + add-ons (spec D15, add-on list decided): set the prices and the bundle discount |
