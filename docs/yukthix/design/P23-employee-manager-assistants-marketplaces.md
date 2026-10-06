# P23 · Employee & Manager Assistants and Marketplaces

> **Status:** ✅ Decided (founder selected these 9 features), 28 Sep 2026.
> **What it is:** nine helpers that sit on top of data YukthiX already holds:
> - **Employee helpers:** payslip explainer, tax planner, timesheet auto-fill.
> - **Manager helpers:** AI manager coach, review assistant with bias check.
> - **HR helpers:** AI policy & handbook writer, salary structure optimiser.
> - **Marketplaces (partner-run):** group insurance for small companies, employee perks.
>
> Competitors: Keka and Darwinbox payslip / tax help, greytHR and Zoho tax regime compare, Lattice and 15Five manager nudges and AI review writing, Textio-style bias checks, Plum / Loop / Onsurity group health for small teams, Vantage Circle / Advantage Club perks.
>
> **Builds on:**
> - M03 payslip lines with explanation (YX-PAY-12), `payslip_queries`, tax workspace and `tax_declarations`, CTC templates; P07 `IN.TDS` law versions, `IN.WAGES-CODE` (YX-STAT-21), minimum wage, PF / ESI;
> - P19 rules, law floors, "why" (YX-RULE-10); M08 `policies`, `policy_versions`, `policy_acknowledgements`;
> - M06 goals, check-ins, `one_on_ones`, `feedback_responses`, reviews, comp review; M12 `timesheets`, `timesheet_lines`; M11 `benefit_plans`, `benefit_enrolments`; M09 engage;
> - P02 sensitivity classes and visibility; P10 AI data rules (YX-AI-01/02/03/07/11/13/14), connector framework (B2); P14 metering and partner add-ons (YX-BILL-11); A13 / T05 fairness analytics.
>
> **Pricing (D18):** all helpers included up to AI fair use per user per month; beyond it, **AI credits**. Rule-based parts (payslip explanation, tax compare, salary optimiser) never use credits. Insurance and perks are **partner-run**: price paid to the partner, partner commission to YukthiX where the law allows.
> **Build:** wave 3 (payslip explainer rule-based, tax planner, salary optimiser) · wave 5 (payslip AI chat, policy writer, timesheet auto-fill, manager coach, review assistant, group insurance, perks).

---

## 1. Purpose & scope
Employees ask HR the same questions every month ("why is my pay lower?", "which tax regime is better?"). Managers forget 1:1s and write vague reviews. HR copies policies from the internet and guesses salary splits. Small companies can't buy group health cover easily.

P23 answers these inside YukthiX, from the company's own data, safely:
- numbers come from payroll and law data, never from an AI guess;
- AI only phrases, drafts and suggests (P10 YX-AI-01); a person decides;
- each person sees only what P02 already lets them see;
- marketplaces are run by licensed or contracted partners, clearly labelled, and switchable by the company (D17).

**Out of scope:**
- payroll and tax computation itself (M03, P07; P23 reads results, never changes them);
- legal or tax advice (every draft and estimate carries a disclaimer);
- selling insurance (only the IRDAI-licensed partner does);
- ads of any kind outside the perks marketplace.

## 2. What exists today
- **Design:**
  - M03 stores a formula, inputs and explanation on every payslip line and renders a "why this number" drawer (YX-PAY-12); payslip queries go to payroll;
  - M03 tax workspace (regime choice, declarations, proofs); P07 tax and wage rules as dated data;
  - P19 law floors, impact preview and "why"; M08 policy documents with acknowledgement;
  - M06 feedback, 1:1s, goals, reviews; M12 timesheets; M11 benefit enrolment and endorsements;
  - P10 AI data tiers, registry, agent contract, credits; Google / Microsoft calendar connector.
- **Missing:** month-to-month pay comparison, tax regime what-if, salary split suggestion, policy drafting, timesheet pre-fill from work tools, manager nudges, review writing help and bias check, insurance buying, perks.

## 3. Concepts

### 3.1 Payslip explainer (wave 3 rule-based · wave 5 AI chat)
- Employee opens a payslip and asks "why is my pay different this month?"
- The **pay-diff engine** compares this payslip with the previous one line by line and names the cause of each change from payroll data: LOP days (`lop_inputs`), arrears, tax change (declaration, regime, projection), new or ended component, loan EMI start / end, one-time pay, Code wage add-back (YX-STAT-21), withholds.
- Each cause reuses the line's stored explanation (YX-PAY-12) and the P19 "why".
- **Wave 5 AI chat:** the employee can ask follow-ups in plain words. The AI receives only the diff facts; rupee amounts are sent as placeholders and filled in by the app after the answer (P10 tier: no raw salary to external models). Region-bound tenants use an in-region model.
- **Own payslip only.** Asking about anyone else's pay is refused.
- **No guessing.** If a change has no data cause, the answer says so and offers **Raise a payslip query** (M03 `payslip_queries`) with the diff attached.

### 3.2 AI policy & handbook writer (wave 5)
- HR answers a short questionnaire: industry, states of work, headcount, work pattern, company choices (leave days, WFH days, expense limits, notice period, probation).
- AI drafts policies (leave, attendance, WFH, expense, travel, code of conduct, POSH policy, IT use) and an employee handbook.
- Every numeric value is checked against **P07 law floors** for each state chosen; a value below the floor is flagged and the legal minimum shown. Each clause shows its **source** (P07 rule, company answer, or "AI suggestion").
- HR edits and approves. **Drafts never publish on their own.**
- On approval: numeric values load as **P19 rule values** (with impact preview); the text loads as **M08 policy documents** with acknowledgement.
- Disclaimer on every draft: "Not legal advice; review by counsel recommended."
- The POSH policy draft contains only policy text; no POSH case data is read or sent.

### 3.3 Timesheet auto-fill (wave 5, M12)
- Sources: calendar meetings (P10 Google / Microsoft calendar connector), **Jira** and **GitHub** activity (new connectors).
- Each employee connects their own accounts (**OAuth per user, read-only scopes**) and can disconnect at any time.
- Only metadata is read: meeting title, time, duration; issue key, title, status change time; repository name, pull request / commit time and title. **No code, no diffs, no message or comment bodies, no attendee lists beyond count.**
- Mapping to project / task: company rules first (e.g. Jira project `PAY` → project *Payroll revamp*; calendar title contains "Acme" → client Acme), then AI suggestion for the rest, marked as a suggestion.
- The employee reviews, edits and submits. **Never auto-submit.**
- The raw activity is visible only to the employee; the manager sees only the submitted timesheet.

### 3.4 AI manager coach (wave 5)
- Weekly (company setting: weekly / fortnightly / off) nudges to each manager, built from team data the manager **already has access to** (P02):
  - team members with no feedback in N weeks (M06);
  - 1:1s due or overdue (`one_on_ones`);
  - large unused leave balances (counts only, never leave reasons);
  - overtime streaks (M02);
  - goals off track (M06);
  - new joiners' open onboarding tasks (M01).
- Suggested 1:1 agenda per person from open goals, recent feedback themes and last 1:1 notes.
- Signals are computed by rules inside YukthiX. AI only writes the wording and agenda; names are pseudonymised to external models.
- Never uses Special data (health, POSH, disciplinary). Attrition-risk scores are used only if the manager already sees them.
- Each manager can opt out; opt-out is not shown to HR as a performance signal.

### 3.5 Review assistant with bias check (wave 5, M06)
- In a review form, the manager can ask for a **draft** built from the person's goals, feedback received and 1:1 notes in the review period.
- The **bias check** flags, as suggestions only:
  - gendered or loaded words ("abrasive", "emotional");
  - personality-based criticism instead of behaviour and results;
  - age references ("young", "old-school");
  - vague praise or criticism with no example;
  - rating inconsistent with the text (e.g. "exceeds" rating, text lists only misses).
- The manager accepts, edits or ignores each flag. The manager's text and rating are final.
- Acceptance of suggestions is logged and reported **only in aggregate** (A13 / T05 fairness analytics style, small-group suppression P02), never per manager to peers.
- Performance text goes to an external model only when the tenant has enabled AI review summaries (P10 Q2). EU AI Act: "depends" (performance evaluation support); off for EU tenants until YX-AI-11 conditions are met.

### 3.6 Employee tax planner (wave 3, M03)
- Shown with tax declarations. Compares **old vs new regime** on the employee's **actual projected annual salary** (M03 projection) under the Income-tax Act 2025 rules for the year (P07 `IN.TDS` law version).
- Shows: tax under each regime, unused deduction headroom (e.g. 80C-equivalent, NPS, health insurance, home loan interest, HRA), monthly take-home effect.
- **What-if inputs:** extra investment, rent, home loan, NPS; the numbers update live.
- Rule-based calculation; no AI needed. An optional AI "explain this" uses placeholders for amounts, like 3.1.
- The **employee chooses** the regime; the tool never selects it.
- Disclaimer: "Estimate, not tax advice."
- Values are never visible to the manager or in any manager report; HR payroll sees only the chosen regime and declarations, as today.

### 3.7 Salary structure optimiser (wave 3, M03 / M06 comp)
- When HR sets or revises a CTC (offer, revision, comp review), **Suggest split** proposes components: basic, HRA, allowances, reimbursements, NPS employer contribution, meal cards, FBP.
- Bounds:
  - company policy (P19 component rules, CTC template);
  - law: Code wage 50 % rule (YX-STAT-21), minimum wage for the state and skill, PF / ESI thresholds and ceilings.
- Shows 2–3 options side by side: employee monthly take-home (both regimes), employer cost, PF / ESI effect.
- Rule-based calculator; no AI data leaves YukthiX.
- **HR chooses.** The chosen option and the suggestion shown are recorded (audit).

### 3.8 Group insurance for small companies (wave 5, M11)
- For companies with at least **7 employees** (insurer minimum **to verify**; varies by insurer).
- Quotes and purchase happen in-app **only through an IRDAI-licensed broker or corporate agent partner**. YukthiX does not sell, advise on or underwrite insurance.
- Comparison shown **neutrally**: same columns for every quote (sum insured, room rent, waiting periods, co-pay, cost per member), sorted by the viewer's choice, no "recommended" badge from YukthiX.
- Data to the partner: census only (name, date of birth, gender, relationship, sum insured). Any health declaration is filled on the partner's own screen and not stored in YukthiX.
- The insurance cost is paid to the partner / insurer. The policy then flows into M11 as a benefit with enrolment and endorsements (joiners, leavers, dependants) synced with the partner.
- Partner commission to YukthiX only as IRDAI rules permit (**to verify** with counsel before launch).

### 3.9 Employee perks marketplace (wave 5, M09 / M11)
- Partner discounts (phones, travel, groceries, learning) in the employee app, each card labelled **"Partner offer"**.
- Company switches it on or off (default off) and chooses categories (D17).
- No employee data goes to a merchant except what the employee agrees to at redemption (shown field by field).
- Never on payroll, payslip, tax or statutory screens.
- Partner commission to YukthiX; shown in the marketplace "About" page.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `payslip_diffs` | Payslip × previous payslip: changed lines, cause code (lop / arrears / tax / new_component / ended_component / loan / one_time / wage_addback / withhold / unexplained), source refs, explanation text |
| `assistant_conversations` | Person × feature: messages, feature version (P10 registry), data classes used, placeholders used, credits used; retention per P02 |
| `policy_questionnaires` | Tenant: answers (industry, states, headcount, choices), version |
| `policy_drafts` | Questionnaire × policy type: draft text, clause sources, law-floor findings, status (draft / in review / approved / discarded), approver, loaded rule refs and M08 policy version ref |
| `work_tool_connections` | Person × provider (google_calendar / microsoft_calendar / jira / github): OAuth token (vault ref), scopes, status, last sync, revoked_at |
| `timesheet_suggestions` | Person × day: source item (metadata only), suggested project / task, rule or AI, confidence, accepted / edited / rejected |
| `timesheet_mapping_rules` | Tenant: source pattern → project / task, priority |
| `coach_nudges` | Manager × week: signal type, team member ref, text, agenda, opened / dismissed / acted |
| `coach_settings` | Tenant frequency; manager opt-out |
| `review_assist_events` | Review × suggestion: type (draft / gendered / personality / age / vague / inconsistent), accepted / edited / ignored |
| `tax_scenarios` | Employee × tax year: law version, projected salary ref, regime results, what-if inputs; visible to the employee only |
| `salary_split_suggestions` | CTC event × option: components, take-home, employer cost, law checks, chosen flag, chosen by |
| `marketplace_partners` | Partner: type (insurance_broker / corporate_agent / perks), licence number and expiry (insurance), contract ref, commission terms, status |
| `insurance_quotes` | Tenant × partner request: census snapshot ref, quotes (JSON), chosen quote, purchase status, M11 `benefit_plans` ref |
| `perk_settings` | Tenant: on / off, categories |
| `perk_redemptions` | Employee × offer: fields consented, sent at, partner ref |

All carry `organization_id` + RLS. `tax_scenarios`, `assistant_conversations` and `work_tool_connections` are readable only by their owner (and platform support under audited break-glass, P12).

## 5. Rules (YX-AST)

| ID | Rule |
|---|---|
| YX-AST-01 | **Advisory only.** Every P23 output (explanation, draft, nudge, bias flag, suggestion, estimate, split, quote comparison) is a suggestion; a person accepts, edits or ignores it. Nothing is submitted, published, chosen or bought without that person's action (P10 YX-AI-01, YX-AI-13). |
| YX-AST-02 | **AI data tiers.** P23 AI features are registered (YX-AI-07) with allowed data classes. Special data is never sent to external models. Raw salary, bank and PAN values are sent only as placeholders and filled in by the app. Tenants whose region requires it use an in-region model (YX-AI-02/04). |
| YX-AST-03 | **Visibility.** Each helper reads only what the person already sees under P02. The payslip explainer and tax planner work only on the signed-in employee's own data; asking about someone else is refused and logged. |
| YX-AST-04 | **Payslip causes from data.** The pay-diff engine names a cause only when a payroll record supports it (LOP input, arrears line, tax projection change, component start / end, loan schedule, one-time pay, wage add-back, withhold). Anything left over is shown as "not explained" with a **Raise payslip query** action; the AI never invents a cause. |
| YX-AST-05 | **Numbers from engines.** Tax, take-home, statutory and pay amounts shown by P23 come from the M03 / P07 engines for the stated law version, never from an AI model. |
| YX-AST-06 | **Policy drafts.** A policy draft can be approved only after the P07 law-floor check for every chosen state has run and each finding is resolved or acknowledged. Drafts never auto-publish. Approved values enter P19 with impact preview; text enters M08 as a new policy version with acknowledgement. Every draft shows the disclaimer "Not legal advice; review by counsel recommended." |
| YX-AST-07 | **Clause sources.** Every clause in a policy draft is tagged as law (P07 rule ref), company answer, or AI suggestion; the tag stays visible until approval. |
| YX-AST-08 | **Work tool connectors.** Calendar, Jira and GitHub are connected per user by OAuth with read-only scopes, revocable by the user at any time (tokens deleted on revoke or exit). Only metadata is read: titles, times, durations, issue keys, repository names. Code, diffs and message or comment bodies are never read or stored. |
| YX-AST-09 | **Timesheet never auto-submitted.** Suggestions pre-fill a draft; only the employee submits. Raw activity and unaccepted suggestions are visible only to the employee, never to managers, HR reports or analytics. |
| YX-AST-10 | **Coach signals.** Nudges use only signals the manager is allowed to see; never Special data, leave reasons or health information; attrition-risk only where the manager already has that access. Frequency is a company setting; each manager can opt out. |
| YX-AST-11 | **Bias check.** Bias flags are suggestions; the manager's text and rating are final. Flag acceptance is reported only in aggregate with small-group suppression (P02), for fairness analytics (A13 / T05 style). The review assistant follows P10 EU classification (YX-AI-11) and the tenant's AI review summaries opt-in. |
| YX-AST-12 | **Tax planner.** Uses the employee's projected salary and the P07 `IN.TDS` law version for the tax year; shows "Estimate, not tax advice"; never selects a regime. Scenarios are private to the employee and never shown to the manager or in reports. |
| YX-AST-13 | **Salary optimiser.** Every suggested split passes company CTC rules (P19) and law (Code wage 50 % rule YX-STAT-21, state minimum wage, PF / ESI) before it is shown. HR chooses; the options shown and the choice are audited (P08). A later law change marks saved suggestions as stale. |
| YX-AST-14 | **Insurance only through a licensed partner.** Group insurance is quoted and sold only by an IRDAI-licensed broker or corporate agent whose licence is recorded and in date; an expired licence hides the offer. YukthiX never advises on or sells cover. The comparison uses the same fields for every quote and has no YukthiX recommendation. |
| YX-AST-15 | **Insurance eligibility and data.** The offer shows only to companies meeting the insurer's minimum headcount (default 7, to verify). The partner receives census fields only; health declarations stay on the partner's screen. Commission to YukthiX only as IRDAI rules permit. |
| YX-AST-16 | **Perks.** Off until the company switches it on; the company chooses categories (D17). Offers are labelled "Partner offer". No employee data goes to a merchant except the fields the employee consents to at redemption (consent recorded, YX-SEC-28). No offers or ads on payroll, payslip, tax or statutory screens. |
| YX-AST-17 | **Credits.** AI helpers are included up to fair use per user per month; beyond it they draw AI credits (D18, YX-AI-14). With no credits left the rule-based parts (payslip diff, tax compare, salary split) keep working. |
| YX-AST-18 | **Company switches (D17).** Each P23 helper and marketplace can be switched on or off by the company; coach frequency, timesheet mapping rules and perk categories are company settings. |
| YX-AST-19 | **Audit.** Every AI call (P10 `ai_calls`), policy approval, salary-split choice, insurance purchase and perk redemption is audited (P08) with person, feature version and data classes. |

## 6. Flows
1. **Payslip explainer:** Priya's October net pay is ₹4,210 lower → "Why is my pay different?" → diff: 2 LOP days (−₹3,100), new loan EMI (−₹2,000), tax down after HRA proof (+₹890) → all explained. In November one allowance changed with no record → "not explained" → Raise payslip query → payroll gets the query with the diff.
2. **Policy writer:** HR of a 60-person Bengaluru + Pune company fills the questionnaire → drafts for 8 policies + handbook → law check flags 10 earned-leave days as below the Maharashtra floor for Pune shop staff → HR raises it → approves → leave values enter P19 (impact preview: 22 people) → policies publish in M08 → employees acknowledge.
3. **Timesheet auto-fill:** Arjun connects Google Calendar and Jira → Friday draft: 6 h on *Payroll revamp* (PAY-112, PAY-118 by rule), 2 h "Client sync – Acme" (AI suggestion) → he edits one line and submits.
4. **Manager coach:** Monday nudge to Neha: "Rahul: no feedback in 8 weeks; 1:1 overdue. Sana: 14 leave days unused. New joiner Kiran: 3 onboarding tasks open." Suggested agenda for Rahul from his two off-track goals.
5. **Review assistant:** manager drafts a review → flags "abrasive" (personality word) and "rating 'exceeds', text lists only misses" → manager rewrites one line, ignores the other → both logged for aggregate analytics.
6. **Tax planner:** employee sees new regime ₹38,000 lower tax; what-if adds ₹1.5 lakh investment and rent → old regime now lower by ₹6,000 → employee chooses old regime in declarations.
7. **Salary optimiser:** HR sets ₹12 lakh CTC → three splits → option B gives +₹2,100 monthly take-home at the same employer cost and no Code wage add-back → HR picks B → audited.
8. **Group insurance:** 18-person company → three quotes from the broker partner → owner picks one, pays the partner → policy appears in M11 → a joiner next month is endorsed automatically.
9. **Perks:** HR switches on Travel and Learning → employee redeems a course discount → consents to share work email only → code issued.

## 7. UI
- **Payslip:** "Why is my pay different?" button; diff card per changed line; "not explained" row with Raise query; chat panel (wave 5).
- **Settings › Policies › Write with AI:** questionnaire, draft editor with clause source tags and law-floor findings, Approve & load button, disclaimer banner.
- **My timesheet:** "Pre-fill from my tools" with connect buttons; suggestion rows marked rule / AI; Submit stays manual. **Settings › Timesheets › Mapping rules.**
- **Manager home:** weekly coach card; 1:1 agenda in the 1:1 screen; opt-out in profile settings.
- **Review form:** "Help me draft" and inline bias flags with Accept / Ignore.
- **Tax declarations:** "Compare tax regimes" panel with what-if sliders and disclaimer.
- **Compensation / offer screen:** "Suggest split" with options side by side.
- **Benefits › Group health:** eligibility, partner name and licence, neutral quote table, buy on partner screen.
- **Employee app › Perks:** category tabs, "Partner offer" labels, consent sheet at redemption. **Settings › Perks:** on / off, categories.

## 8. Migration & rollout
- **Wave 3:** pay-diff engine and explainer (rule-based), tax planner, salary optimiser; no AI dependency.
- **Wave 5:** payslip AI chat, policy writer, timesheet auto-fill with Jira and GitHub connectors, manager coach, review assistant (off for EU tenants per YX-AI-11), group insurance, perks.
- Before wave 5 launch: IRDAI arrangement and commission checked by counsel; insurer minimum headcount confirmed; perks and broker partners listed as sub-processors / partners (APX-G).
- Existing payslips get diffs computed on first view; no backfill needed.

## 9. Acceptance tests (samples)
- A payslip change with no payroll record shows "not explained" and a query button; the AI answer never names a cause for it (YX-AST-04).
- An employee asking "what is Ravi's salary?" is refused and logged (YX-AST-03).
- The external AI call log for the payslip chat contains placeholders, not rupee amounts; an Aadhaar or health field never appears (YX-AST-02).
- A leave policy draft below the state floor can't be approved until the finding is resolved; a draft is never visible to employees before approval (YX-AST-06).
- The GitHub connector requests read-only scopes; stored items contain no code or diff text; the manager's timesheet view shows no raw activity (YX-AST-08/09).
- A timesheet with 40 h of suggestions stays in draft until the employee presses Submit (YX-AST-09).
- A manager without attrition-risk access never gets a nudge based on it; a sick-leave reason never appears in a nudge (YX-AST-10).
- Bias-flag acceptance for a team of 3 managers is suppressed in reports (YX-AST-11).
- The manager's team report has no tax planner data (YX-AST-12).
- A suggested split that would create a Code wage add-back or break minimum wage is not offered (YX-AST-13).
- A broker whose licence expired yesterday has no quotes shown (YX-AST-14).
- A company with perks off shows no Perks tab; the payslip screen never shows an offer (YX-AST-16).
- With zero AI credits, the payslip diff and tax compare still work (YX-AST-17).

## 10. Open questions (all decided)

| # | Question | Decision |
|---|---|---|
| Q1 | Which assistant and marketplace features to build? | The 9 features in §3, with the waves in §8. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Founder selected these 9 features:** (1) payslip explainer, rule-based wave 3, AI chat wave 5, own payslip only, unexplained changes go to payslip query; (2) AI policy & handbook writer, wave 5, P07 law floors, sources marked, HR approves, loads into P19 and M08, never auto-publishes, "not legal advice"; (3) timesheet auto-fill, wave 5, calendar / Jira / GitHub read-only per-user OAuth, metadata only, never auto-submit; (4) AI manager coach, wave 5, only data the manager already sees, no Special data, opt-out, company frequency; (5) review assistant with bias check, wave 5, suggestions only, aggregate fairness logging; (6) employee tax planner, wave 3, old vs new regime under Income-tax Act 2025 (P07 `IN.TDS`), employee chooses, "estimate, not tax advice", never shared with manager; (7) salary structure optimiser, wave 3, within P19 policy and law (YX-STAT-21, minimum wage, PF / ESI), HR chooses, audited; (8) group insurance for companies of 7+ (to verify) only via an IRDAI-licensed broker / corporate agent, neutral comparison, commission only as IRDAI permits (to verify); (9) perks marketplace, company on / off and categories (D17), consent at redemption, no ads on payroll or statutory screens, labelled partner offers. AI outputs advisory; P10 data tiers; AI credits beyond fair use (D18). YX-AST-01–19. | 28 Sep 2026 |
