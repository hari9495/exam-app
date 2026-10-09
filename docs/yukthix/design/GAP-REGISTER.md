# Gap register — "gold standard" review, 25 Sep 2026

> **What this is.** After all 26 design docs were decided, four independent reviews looked for what is still missing:
> 1. **Spec coverage** — every bullet of `spec.md` checked against the docs.
> 2. **Non-functional** — security, reliability, operations, data, commercial, quality, AI governance.
> 3. **HRMS / ATS benchmark** — Darwinbox, Keka, greytHR, Zoho, HROne, Workday, Greenhouse, Lever, Bullhorn, Lattice, Zoho Expense.
> 4. **Proctoring benchmark** — HackerRank, CodeSignal, Codility, Mettl, TestGorilla, Talview, Proctorio, Honorlock, Pearson VUE, SHL.
>
> **Result.** The functional design is strong: ≈278 of ≈309 spec bullets are fully covered, HRMS ≈95 %, Proctoring ≈93 %, ATS ≈92 %. The gaps cluster in three places: **(A) the platform layer nobody owns yet** (security, infrastructure, billing, tenant lifecycle, migration), **(B) a few feature areas buyers expect** (benefits, projects, contractor pay, registers, partner console), and **(C) proctoring depth** (project coding, psychometrics, secure client, norms). Every item below is a proposal until decided.

## Status snapshot — 26 Sep 2026

| Section | Items | Done | Partly done | Open |
|---|---|---|---|---|
| A · Must have | 13 | **12** (A1, A2 → P12 · A4 → P14 · A5 → P15 · A6 → M11 · **A7 → P16** · A8 → M03 / P07 · A9 → P07 / M03 · A10 → T07 · A11 → T06 · A12 → T08 · A13 → T05 / T02 / P09, 26 Sep) | 0 | 1 (A3 parked for the engineering team) |
| B · Should have | 20 | **20** (26 Sep; see the resolution table below) | — | 0 |
| C · Later | 8 groups | **8** (26 Sep; design now, build waves per doc) | — | 0 |
| D · Design defects | 13 | **13** | — | 0 |
| E · India lifecycle events | 20 | **20** | — | 0 |
| F · Catalogues | 7 | **7** (APX-A–D, F) | — | 0 |
| G · Admin editors | 7 | **7** (APX-E, T05) | — | 0 |
| H · Analytics & legal | 7 | **7** (APX-C, APX-G, APX-D) | — | 0 |

**Remaining work (26 Sep 2026):** only **A3 / P13** infrastructure & operations, **parked for the engineering team** (brief: `P13-infrastructure-operations-TEAM-BRIEF.md`). Everything else in sections A–H is designed and decided (A7 → P16 on 26 Sep).

### Resolution of B, C and A10–A13 (26 Sep 2026)

User decisions: include all B items; B3 designed now, built in wave 6; B19 a company option, off by default; B20 designed now, built in wave 6; all C items designed now; A10–A13 as full docs with questions.

| # | Where it is designed |
|---|---|
| A7 | **P16** Partner & accountant console (YX-PTR-01..14) |
| A10 | **T07** Project coding & live technical interview (YX-CODE-01..09) |
| A11 | **T06** Psychometric & behavioural assessments (YX-PSY-01..11) |
| A12 | **T08** YukthiX Secure Client (YX-SCL-01..08) |
| A13 | **T05** fairness & validity analytics (YX-EVAL-24..28, Q9–Q10) · **T02** YX-TB-18 · **P09** YX-MET-18 |
| B1 | **M12** Projects & timesheets (YX-PRJ) |
| B2, B3 | **M02** field force and auto-roster (B3 built in wave 6) · M04 |
| B4, B5, B6, B7, B14, B15 | **T01–T05** extensions (YX-QB-13..15, YX-TB-13..17, YX-DLV-14..20, YX-PROC-13..16, YX-EVAL-16..23) · M04 |
| B8 | **M10** talent CRM and job-board connectors (YX-ATS-20..30) · P10 |
| B9 | **P04 / P10** Slack and Teams bot |
| B10 | **M03** earned wage access · P10 · P14 add-on |
| B11 | **P17** Global search (YX-SRCH-01..12) |
| B12 | **P02** DSAR, DPO, DPIA and RoPA tooling |
| B13 | **P10** AI governance (YX-AI-07..10) · P09 YX-MET-17 |
| B16 | **M01** positions and workforce planning · **M06** career paths, IDPs, attrition risk · P09 |
| B17 | **P07** advisory feed and IN.CLRA · **M13** Contract labour (YX-CLRA-01..12) |
| B18 | **P11 / M05** i18n and multi-currency |
| B19 | **P04** payslip PDF, a company option that is off by default (YX-NTF-15) |
| B20 | **P18** Custom objects & form builder (YX-CUST-01..11, built in wave 6) |
| C1 | **M02** desktop agent and visitor management · APX-F ID card |
| C2 | **M07** content providers, live classes, gamification (YX-LRN-10..14) |
| C3 | **P09** DEI template and pay gap · P10 benchmark feed · P14 add-on |
| C4 | **P07 / M03** country packs (UAE WPS, GCC gratuity, US 1099) and ESOP |
| C5 | **T03 / T04 / T05** test-centre mode, invigilator app, keystroke biometrics, AI-allowed mode |
| C6 | **P10** accounting connectors, mailbox sync, Aadhaar eKYC / DigiLocker |
| C7 | **M10** vendor submission portal |
| C8 | **P14** customer-success console (YX-CONSOLE-05..06) |

## A. Cannot ship a gold-standard product without these

| # | Gap | Found by | Proposed home | Size |
|---|---|---|---|---|
| A1 | **Authentication & security baseline** — MFA (TOTP / passkey, enforced for payroll & HR admins, step-up for bank-file release), Google / Entra OIDC + multi-IdP SAML, SCIM provisioning & deprovisioning, session / idle / concurrent-session policy, password policy, tenant IP allow-list, login history, tenant *Settings › Security* page, bot protection on public pages | Spec §2.1.2 (not designed), NFR 1–4, 12, Bench 28 | **New P12 · Identity & security** | M |
| A2 | **Security programme** — encryption & key management (KMS, rotation, per-tenant keys, crypto-shredding), secure SDLC (SAST/DAST, SBOM, patch SLAs), pen test before the payroll pilot, incident response + DPDP breach notification, DPA & sub-processor governance, SOC 2 / ISO 27001 roadmap | NFR 5–11 | P12 (part B) | M |
| A3 | **Infrastructure, reliability & observability** — spec §3 is empty; today production is one VM + pm2. HA (multi-AZ Postgres/Redis, stateless API, worker split), backups + restore drills, RPO/RTO, DR per region, zero-downtime deploys & migration policy, WAF/DDoS, capacity targets, central logs (PII-redacted), metrics/tracing, alerting & on-call, status page, runbooks (payroll day, statutory deadline, drive day), feature flags, environments & IaC, testing strategy (e2e in CI on Postgres, payroll regression corpus per rule-pack version), release management | Spec §3, NFR 13–28, 45–46 | **New P13 · Infrastructure, operations & release** | L |
| A4 | **Billing, entitlements & tenant lifecycle** — D15 model needs an engine: metering definitions (active employee, recruiter, test taken), entitlements per product / add-on, proration, GST tax invoices + e-invoice, Indian gateway (Razorpay / UPI / NEFT; Stripe unsuitable), dunning / grace / suspension, partner pass-through fees, bundle discount, usage & billing page; self-serve sign-up & trial; tenant offboarding with export + certified deletion; whole-tenant export; platform super-admin console & staff role model (least privilege, MFA); product support tiers & in-app help | Spec §2.1.17 (not designed), NFR 29–35, 39–44 | **New P14 · Billing, tenant lifecycle & platform console** | L |
| A5 | **Migration, implementation & sandbox** — spec calls migration "a deal-closer"; design has scattered CSV imports. Migration framework (templates, dry-run validation, rollback, ID mapping, history import: payslips, leave ledgers, attendance, documents), competitor mappers (greytHR, Keka, Zoho, Darwinbox, Frappe, Excel), implementation playbook & go-live checklist, UAT / pilot exit criteria, **tenant sandbox** (clone my config, dry-run payroll, promote), anonymised demo-data generator | Spec §2.1.11, §2.1.19, NFR 33, 37–38, 40, 47, Bench 37 | **New P15 · Migration, implementation & sandbox** | M |
| A6 | **Benefits administration & FBP** — spec §1.3.6 has zero design. GMC / GPA / term insurance enrolment with dependants, endorsements on join/exit, insurer/broker sync (Plum, Loop, Nova), TPA e-cards, premium deductions → M03; **flexible benefit plan** (meal card, fuel, LTA, telephone, books) with declarations, bills, year-end taxable sweep; NPS 80CCD(2) component & corporate NPS enrolment | Spec §1.3.6, Bench 1–3 | **New M11 · Benefits & FBP** | M |
| A7 | **Accountant / partner console** — one CA or payroll-bureau login serving many client tenants, cross-client compliance dashboard; reseller hierarchy & partner-managed tenants; "payroll bureau operator" role; managed-payroll service tier | Bench 5–7 | **New P16 · Partner & accountant console** | L |
| A8 | **Contractor / consultant payouts** — 194C / 194J TDS, invoice-based pay, GST, Form 16A, quarterly 26Q | Bench 12 | Extend **M03** + P07 IN.TDS | M |
| A9 | **State S&E registers & statutory forms library** — state-wise wage / leave / fines / advances registers, bonus Form C, gratuity Form F, PF Form 11/2, ESIC Form 1, Form 12BB, 12BA, 16A; penalty / interest estimates in the compliance calendar | Spec 1.3.15 partial, Bench 33–34 | Extend **P07** (`IN.SE`, penalty rules) + M03 statutory hub + P05 library | M |
| A10 | **Proctoring: project-based coding & live technical interview** — multi-file IDE projects, front-end preview, notebooks / DevOps tasks, git take-home; live pair-programming interview with shared editor, video and code playback | Proc 8–13 | **New T07 · Project coding & live interview** | L |
| A11 | **Proctoring: psychometric & behavioural tests** — Big Five, SJT, cognitive ability, culture fit; Likert / forced-choice items, trait scales, norm groups, reports | Proc 3 | **New T06 · Psychometric assessments** | L |
| A12 | **YukthiX Secure Client** — own desktop client (process blocking, VM / virtual camera / virtual audio / screen-mirroring detection, capture blocking, LAN second-device hints), plus a lighter Chrome-extension tier; give it a wave | Spec 1.1.6 partial, Proc 21 | **New T08 · Secure client** (currently "later" in T04 Q2) | L |
| A13 | **Assessment fairness & validity analytics** — adverse-impact (4/5ths rule) and DIF per item; predictive validity of test scores vs M06 ratings & retention (unique suite advantage); cross-tenant anonymised norms (opt-in, k-anonymity) | Proc 2, 31–32 | Extend **T02 / T05 / P09** | M |

## B. Should have — buyers ask in demos and RFPs

| # | Gap | Found by | Proposed home | Size |
|---|---|---|---|---|
| B1 | Projects & timesheets for services firms — project / task master, weekly timesheets, utilisation, project costing, client billing outside the staffing desk | Bench 11 | **New M12 · Projects & timesheets** (grow M02 §B7) | M–L |
| B2 | Field-force tracking — live trail, visit / beat log, client-site attendance, distance-based conveyance | Bench 10 | Extend M02 §B1 + M04 | M |
| B3 | Demand-based auto-scheduling, open shifts, shift bidding | Bench 9 (M02 Q2 said not at launch) | Extend M02 §B2 | L |
| B4 | Role-based pre-built *tests* and job-role templates (starter questions exist, tests don't); AI test assembly from a JD; sectional cut-offs | Proc 1, 6, 7 | Extend T01 Q7 / T02 | M |
| B5 | Proctoring detection parity — object detection (phone, notes, earbuds), gaze, numeric integrity score, post-exam PDF session report | Proc 20, 23, 24, 26 | Extend T04 / T05 | M |
| B6 | ATS connectors for standalone Proctoring — Greenhouse, Lever, Workday, SAP SF (send test from stage, results back); assessment webhook events | Proc 34, 36 | Extend P10 B3 + T05 | M |
| B7 | Campus drive kit — self-registration portal, college master & reporting, hall ticket / admit card; native candidate mobile app with proctoring | Proc 15–17, 22 | Extend T03 + M04 | M–L |
| B8 | Talent CRM — drip campaigns, nurture sequences, sourcing extension; Naukri / Shine job-board connectors; panel auto-slotting | Bench 24, 26, 27 | Extend M10 + P10 B3 | M |
| B9 | Slack / Teams interactive bot (approve, check-in, balances) reusing the WhatsApp assistant design | Bench 29 | Extend P04 / P10 | M |
| B10 | Earned wage access (self-serve, partner-funded, auto-recovered) as an add-on | Bench 4 | Extend M03 Q4 + P10 B3 | M |
| B11 | Global search across records honouring P02 visibility; command palette | Spec §2.1.10 (not designed), Bench 38 | Short **P17 · Global search** or extend P11 | S–M |
| B12 | DPDP / GDPR programme extras — DPO / grievance officer, DPIA, RoPA, DSAR SLA tooling, breach workflow, master retention schedule per data class | Spec §2.1.16 partial, NFR 10, 36 | Extend P02 §6 (+ P12) | S–M |
| B13 | AI governance — model / prompt registry, eval sets (OCR, AI interview, helpdesk RAG, LLM-likeness), drift monitoring, bias testing beyond face models, red-team regime, EU AI Act high-risk note | NFR 51–52 | Extend P10 | M |
| B14 | Language proficiency with AI-scored speaking / writing (CEFR); typing test | Proc 4, 5 | Extend T01 / T05 / P10 | M |
| B15 | Certification depth — equating across parallel forms, cut-score studies, Open Badges / Credly, LTI 1.3 for external LMSs | Proc 27–29, 35 | Extend T02 / P05 / T05 | M |
| B16 | Workforce planning & scenarios; position management; career pathing / IDPs; attrition-risk scoring | Bench 15, 16, 19, 20 | Extend M10 Q1 / M01 / M06 / P10 | M |
| B17 | Statutory: NPS 80CCD(2) (in A6), labour-law advisory feed, CLRA contract-labour vendor compliance (later) | Bench 13, 35 | P07 / new M13 later | S / L |
| B18 | Localisation — desk-UI i18n framework & translation workflow; multi-currency expenses with FX; HRMS web/mobile WCAG target | Spec §2.1.6 partial, NFR 48–50, Bench 42 | Extend UI brief / M05 | S |
| B19 | Payslip as password-protected PDF attachment (tenant opt-in) — deliberate divergence from P04 Q6; competitors do it and RFPs ask | Bench 31 | P04 tenant option | S |
| B20 | Custom objects & form / page-layout builder (already TR1) | Spec §2.1.5 partial, Bench 39 | P11 TR1 decision | L |

## C. Nice to have / later

| # | Gap | Proposed home |
|---|---|---|
| C1 | Employee ID-card generation; visitor management; desktop-agent / Teams-presence attendance | P05 / skip / M02 |
| C2 | LMS content marketplace & LinkedIn Learning / Coursera connectors; live-class auto-creation; gamification | M07 / P10 |
| C3 | Compensation benchmarking feed; DEI dashboard template; pay-equity metric | P09 / P10 |
| C4 | Multi-country payroll packs (UAE WPS, GCC gratuity, US 1099); ESOP management | P07 packs / partner |
| C5 | Test-centre / offline hybrid mode; invigilator app; keystroke biometrics; "AI-allowed" coding mode; candidate CSAT survey | T03 / T04 / T02 |
| C6 | QuickBooks / Busy / Marg connectors; mailbox (Gmail / Outlook) sync; Aadhaar eKYC / DigiLocker onboarding | P10 |
| C7 | VMS vendor-submission portal for staffing (spec says out of scope) | new M-doc later |
| C8 | Customer-success tooling (health scores, in-app messaging) | P14 |

## Proposed plan

**New docs (10):** P12 Identity & security · P13 Infrastructure, operations & release · P14 Billing, tenant lifecycle & platform console · P15 Migration, implementation & sandbox · P16 Partner & accountant console · M11 Benefits & FBP · M12 Projects & timesheets · T06 Psychometrics · T07 Project coding & live interview · T08 Secure client.

**Extension bundles (answered as short question sets on existing docs):** M03 contractor payouts (A8) · P07 registers & forms (A9) · T02/T05/P09 fairness & validity (A13) · M02 field force & rostering (B2, B3) · T01/T02 role tests (B4) · T04/T05 detection parity (B5) · P10 connectors (B6, B8, B9, B10) · P02 §6 privacy programme (B12) · P10 AI governance (B13) · small items (B11, B18, B19).

**Suggested order:** A1–A5 first (P12–P15: nothing ships safely without them and they change waves 1–3), then A6 (M11, needed for the wave-3 payroll pilot), A8–A9 (payroll completeness), A7 (P16, go-to-market), then Proctoring depth (A10–A13, T06–T08), then the B bundles.


---

# Second pass — 25 Sep 2026 (new items only)

> Four more reviews with different lenses: **persona journeys** (14 "day in the life" walkthroughs), **India edge cases** (89 lifecycle / payroll / time / case events), **cross-product integration & analytics** (hand-offs, events, metrics, reports, settings), and **UI / admin / legal artefacts** (screens, U-issue closure, editors, templates, legal pages). Nothing below repeats sections A–C.
>
> **Headline.** Sections A–C were about *missing features*. This pass found something different: **several design defects that would break real journeys** (D), **lifecycle events named but not designed** (E), and **catalogues the docs promise but never enumerate** (F–H). D1–D13 must be fixed before build regardless of what else is chosen.

## D. Design defects — would break a real journey (fix in existing docs)

> ✅ **All 13 fixed on 26 Sep 2026.** User decisions: **D1** attendance mode per group (Punch / Assumed present / Timesheet) + block-or-warn switch in Punch mode, all company-configured · **D3** hand-off matrix by person type + did-not-join unwind · **D5** proxy requests, company chooses who and which types · **D12** YukthiX proctors via per-slot grant after company opt-in. The other nine were consistency fixes. New rules: YX-ORG-18/19, YX-SEC-23–27, YX-WF-18, YX-DOC-18, YX-AT-09/10, YX-LV-09, YX-PAY-24/25, YX-LC-11–15, YX-ATS-13/14, YX-MOB-11, YX-DLV-13, YX-PROC-12, YX-PERF-13 (397 rules in total, no duplicates or broken references).

| # | Defect | Why it matters | Fix in |
|---|---|---|---|
| D1 | **Payroll blocked for tenants without attendance.** YX-LOCK-07 raises an exception for every working day without punches; YX-LOCK-08 / YX-PAY-05 make them non-waivable and block approval. A payroll-only tenant, or desk staff who never punch, can't run payroll. | Most SMBs start with payroll only | M02: attendance mode per employee group (punch-based / assumed-present with HR LOP entry / timesheet); P08 Q4 exceptions only for punch-mode; M03 manual LOP input |
| D2 | **Employees can't take tests.** T03 invitations are candidate × test; M07 training quizzes, M06 skills tests and certifications are taken by *employees*, who have no candidate row, no invite path, no result routing to the enrolment, no consent / retention rule. | Internal training use case (spec §1.1) doesn't work | T03: `test_takers` identity (candidate or employee); M07 enrolment → invitation → result; P02 test-taker scope; M04 Me tab |
| D3 | **Offer → employee only handles new people.** YX-ATS-07 always creates an employee; internal candidates, alumni rehires and contractor conversions hit the PAN-duplicate check and fail. No **did-not-join / renege / postponed / withdrawn-after-acceptance** states, so pre-boarding employees, employments, codes and headcount lines are never unwound. | Campus hires, rehires, internal moves | M10: hand-off matrix by person type; M01 §3.5: pre-boarding exit states + journey re-anchoring on joining-date change; M10 Q1: plan-line release; P14: pre-boarders not metered |
| D4 | **Deployed contractors can't be paid.** YX-ATS-10 says "payroll pays at the pay rate" but M03 has only monthly CTC / fixed pay; no hourly / day-rate compensation, no timesheet-hours feed, no OT / holiday multipliers from rate cards, no placement id on payslips for margin. | Staffing desk (wave 7) | M03: rate-based compensation + timesheet input source; M02 §B6 / §B7: hours feed, timesheet entry screens, approver resolver; M10 Q7 |
| D5 | **No "raise on behalf of".** P03 has requester / approver / admin only. Shop-floor workers without phones or accounts can't get leave, regularisation or claims filed for them; the kiosk only checks in. | Blue-collar tenants | P03: proxy requester with subject semantics (chain and self-approval rule resolve on the subject, "on behalf" in the timeline); M04 Q4 kiosk apply-leave |
| D6 | **Exit deprovisioning fan-out is missing.** `employment.exited` is consumed only by Engage spaces and face-template deletion. Devices / push tokens, kiosk PINs, biometric enrolments, API keys / OAuth grants, delegations, proctor shifts, enrolments, helpdesk queues and case memberships, IC seats, goals / reviews mid-cycle, calendar OAuth and headcount lines are never released. | Security and data-hygiene hole | M01 §3.7: exit deprovisioning table (module × action × timing); each module lists its handler |
| D7 | **Manager leaves mid-cycle.** M06 has no owner transfer for in-flight reviews, 360° nominations, calibration sessions, comp proposals, PIPs and 1-on-1 notes; YX-SEC-06 time-bound visibility cuts the new manager off from the period before the transfer. | Every reorg | M06: owner-transfer rules per artefact; P02: cycle-scoped read-back exception |
| D8 | **Settings scope enum can't hold decisions already taken.** P01 scopes = tenant / entity / location / department / grade / employee, but M01 Q3, P04 Q1, P09 Q1, M03 and P07 need *employment type*, *pay group* and *designation*; no rule says which settings are effective-dated, so payroll re-runs may read today's value. | Config engine | P01 §4.6: add scopes; `dated: true` registry flag with as-of resolution |
| D9 | **Medical certificates on leave requests are Special-class but shown to managers** (the approval card shows the attachment). | Privacy breach | M02 + P05: document type "medical certificate", HR verifies, approver sees status only |
| D10 | **Attendance engine ignores employment status.** Suspended, maternity / sabbatical / LWP and absconding employees generate daily exceptions, nudges and late penalties. | Noise, and blocked payroll with D1 | M02 §B3: expected status from employment status; P08 YX-LOCK-07 |
| D11 | **Bank return + cooling period** (P02 §4.5) leaves a returned salary stuck; no expedited fix (checker + penny-drop waives cooling), no interim payment, no employee notice. | Real monthly event | P02 §4.5 exception; M03 §6 payment-failure sub-flow |
| D12 | **YukthiX-provided proctors have no data path.** P02 has no external-proctor template; YX-SEC-20 support sessions (24 h, tenant-approved) don't fit shift proctoring of Special streams. | T04 Q8 add-on unsellable | P02: proctor-service grant type (per slot, tenant opt-in, audited); T04 `proctors.tenant_scope` |
| D13 | **Payslip queries have no channel in waves 3–4** (helpdesk is wave 5; P04 Q6 forbids details outside the app). | Pilot support | M03 §7 "raise a query" on the payslip viewer → Payroll Admin queue, or pull the M08 helpdesk core into wave 3 |

## E. Lifecycle events named but not designed (India)

> ✅ **All 20 designed on 26 Sep 2026.** User decisions: **E-Q1** death in service = statutory flow + optional company support policy · **E-Q2** maternity = statutory calculation (ESIC-paid excluded) + company top-up option · **E-Q3** absconding = default 3 / 7 / 14 / 21-day timeline, company edits · **spec D17** (user principle): where policy differs between companies, every option is available, each company sets its own policy from a labelled starter template; only law is enforced — applied to rehire, leave in notice, cash pay, contract end, retirement, sabbatical, bench, holiday-on-weekly-off. Legal rules (deduction cap, s.10(10AA), s.206AA, NRI, perquisites, minors' consent) applied directly. **Team action:** confirm fixed-term pro-rata gratuity status under the Code on Social Security; verify maternity and 206AA figures when P07 rule sets are authored.

| # | Event | Status | What's missing | Home |
|---|---|---|---|---|
| E1 | **Death in service** | exit type only | Nominee-payee F&F (nominee bank, share %), gratuity / encashment to nominee, TDS treatment for a legal heir, EDLI / EPS family pension / ESI dependant claim support, Form 16 to heir, letters to next of kin, alumni / nominee document access, immediate revoke, no exit interview, compassionate flow | M01 §3.7 + M03 F&F + P05 + P07 |
| E2 | **Maternity Benefit Act** | template only | 80-days eligibility, benefit = average daily wage of the last 3 months, ₹3,500 medical bonus, ESIC-paid vs employer-paid, adoption / surrogacy / miscarriage / tubectomy variants, crèche at 50+, no-dismissal guard, post-maternity WFH | M02 statutory template + P07 IN.LEAVE + M03 component |
| E3 | **Sabbatical / long LWP / long-term disability** | missing | Absence status as a dated fact, accrual pause per type, zero-wage months (PF NCP days in ECR, ESI continuation), gratuity service counting, exception suppression (D10), return-to-work tasks, ESI disablement benefit | P06 + M02 + M03 + M01 |
| E4 | **Absconding** | exit type only | N days unauthorised absence → auto salary hold → notice 1 / 2 (registered post + email) → deemed abandonment after X days → LWD = last present day, recovery-only F&F, rehire flag | M01 §3.7 + P05 + M03 withhold |
| E5 | **Rehire / boomerang** | flag only | Onboarding source "rehire" with pre-fill and code reuse, service-continuity options (mirror YX-ORG-17: gratuity, seniority, leave), UAN reuse / PF transfer, **YTD + TDS + Form 16 combined per PAN × TAN × FY** (YX-PAY-10 counts per employment), prior warnings / PIP visibility | M01 §3.5 + P01 + M03 YX-PAY-10 / YX-TAX-07 |
| E6 | **Fixed-term contracts, interns, apprentices** | partial | `contract_end_on` on employment (the P04 scheduler already fires "contract end" with no source), extension / conversion change types, auto-exit or alert; apprentice category (no PF / ESI / bonus / gratuity, NAPS / NATS stipend), intern stipend TDS, explicit statutory matrix per employment-type category | P01 + P06 + M01 + P07 IN.APPRENTICE |
| E7 | **Retirement & re-employment** | partial | Superannuation alerts N months ahead, extension as a dated change, "retired re-employed" type (no EPS, no probation), PF final settlement / pension forms, gratuity payout trigger | M01 §3.7 + M03 |
| E8 | **Deputation / secondment / client-site posting; mergers & bulk restructure** | missing | Host entity / location fields (holiday calendar, PT state, geofence), cross-entity recharge; bulk transfer wizard with continuity defaults, entity close / merge | P01 + M01 §3.3 + P06 |
| E9 | **Inter-entity transfer statutory continuity** | 5 options exist | PF UAN transfer (Form 13 / auto), ESI IP continuity, Form 12B auto-populated into the new entity, copied declarations / proofs, re-parented loans, leave-ledger transfer entries, gratuity exemption across two payouts | P01 YX-ORG-17 + M03 |
| E10 | **Leave during the notice period** | missing | Policy per leave type: blocked / LOP / extends LWD; effect on F&F notice shortfall; warning in the apply sheet | M02 + M01 |
| E11 | **Statutory exit tasks & first-payroll statutory IDs** | missing | Clearance: EPFO date-of-exit, ESIC exit, gratuity Form L within 15 days; onboarding: UAN generation / link, ESIC IP registration, Form 11 / Form 2; YX-PAY-05 validates missing UAN / ESI number | M01 templates + M03 YX-PAY-05 |
| E12 | **Cash / cheque paid employees** | missing | `payment_mode` per employee, disbursement list, paid status, reconciliation | M03 |
| E13 | **Salary hold reasons; negative net carry-forward; overpayment recovery** | partial | Reason codes, auto-hold triggers, PF / ESI / TDS on accrued pay while held, hold ageing; negative net → carry-forward balance; instalment plan with consent, cross-FY (89(1)), write-off | M03 |
| E14 | **Court attachment / garnishment; Payment of Wages deduction cap** | missing | Deduction type with priority after statutory, 50 % / 75 % total-deduction cap, remittance, order end | M03 + P07 |
| E15 | **Tax rules absent from P07** | missing | s.10(10AA) leave-encashment exemption (₹25 L lifetime, formula); s.206AA PAN missing → 20 %, not a block ("PANNOTAVBL" in 24Q); inoperative PAN; NRI residential-status test / no 87A / DTAA; Rule 3 car and rent-free accommodation perquisites (→ 12BA); gratuity 5-year waiver on death / disablement; PF / ESI / PT on arrears basis rules; EPS higher-pension option; IW-1 return | P07 IN.TDS / IN.GRATUITY / IN.PF + M03 |
| E16 | **Cases: non-employee parties; a party exits during a case; minors** | partial | External-party record for POSH (contractor / vendor / client staff), complainant without login; exit case blocked / letters held while a case is open, case continues post-exit via alumni-scoped access, ex-employee can file within 3 months; under-18 candidates: DOB gate, parental consent (DPDP s.9), no AI interview | M08 + M01 + T05 + M10 |
| E17 | **Staffing lifecycle & collections** | partial | Placement end / extension / bench (pay policy, auto-exit), `ats.placement.ended`, commission as an M03 input; receivables ledger, ageing, dunning, client-side TDS (26AS), part payments, disputes, PO on the portal | M10 + M03 |
| E18 | **Offers: revision / decline reasons; campus offers months ahead** | partial | Offer versions with re-approval, decline-reason enum (feeds P09), long pre-boarding state (not billed, touchpoints, batch joining, LOI) | M10 Q3 + M01 + P14 |
| E19 | **Smaller time edge cases** | partial | Public holiday on a weekly off (substitute / comp-off / none), half-day + late / OT interplay, night shift over the lock boundary, biometric batch backfill after freeze as an HR bulk correction, leave-year change mid-way, holiday calendar on transfer, two shifts in one day | M02 + P08 |
| E20 | **Anonymous reporter return path** | missing | Case access code, no-login channel, notification contract for anonymous grievance / whistleblower | M08 + P02 §4.7 |

## F. Catalogues promised but never enumerated

> ✅ **Done 26 Sep 2026** as appendices: **APX-A** notifications (367 types, 72 scheduler rules, WhatsApp/SMS pack, channel opt-in YX-NTF-14) · **APX-B** events (343 events, 74 public webhooks, CI checks EVT-1–7) · **APX-C** reports (130) & metrics (96 new) · **APX-D** screens (249), Settings map (62 pages / 8 groups), T9 external shell, canonical mobile map, U1–U103 closure (70 by rule, 31 by pattern, 2 won't-do) · **APX-F** template library (90 starter templates incl. payslip layout, GST invoice, statutory forms).

| # | Catalogue | Gap | Home | Importance |
|---|---|---|---|---|
| F1 | **Notification-type catalogue** | P04 gives examples only; modules say "notify / remind / escalate" ~60 times with no type key; categories lack Learning, Cases, Engage, Hiring, Assessment, Integrations, Billing; candidate-side templates are unowned; admin / system alerts (integration health, kiosk offline, WhatsApp template status, SMS cap, audit-chain failure, IC invalid) are untyped. **Blocks the Meta / DLT template submission before wave 2.** | P04 Appendix A (event → type → category → audience → channels → mandatory → external-safe variables) | High |
| F2 | **Event catalogue** | The P11 `event_catalogue` table exists, but its content is undefined; M01, M02, M08, T02–T05, P05 and P08 have no "Events emitted"; the sensitivity class per event is never assigned; two producers for statutory due dates (M03 and the P04 scheduler); M09 promotion celebrations need a `document.issued` event that P05 doesn't emit; M09 / M10 never emit the reward / referral / clawback events M03 consumes; M05 never subscribes to `payroll.run.paid / voided`, `payment.failed` or `recovery.deferred`. | `design/events.md` (key, version, payload, sensitivity, producer, consumers, wave) + CI check that every emitted event has a consumer | High |
| F3 | **Scheduled events** | P04 §4.6 misses: warning expiry, IC tenure expiry, retirement approaching, LWD approaching, offer expiry, asset return due, API key / token expiry, SMS / AI-credit cap nearing, goal check-in / 1-on-1 cadence, regime cut-off, gratuity 5-year eligibility, retention-deletion pre-notice, and the onboarding 30 / 60 / 90 and exit survey triggers (M09 templates exist, nothing schedules them) | P04 §4.6 + M09 | Medium |
| F4 | **Report library** | P09 describes a library but never lists it. Unnamed reports: salary register, payroll reconciliation, arrears register, YTD statement, **employee CTC report**, TDS reconciliation vs challans / 26AS, Form 16 batch status, leave balance / ledger / **liability**, negative balances, bank advice & failed payments, headcount as-on / joiners-leavers / probation due / contracts & retirements due / document expiry / assets, expense summary / advance ageing / unpaid claims / over-limit, requisition status / offer register / BGV status / consent-retention, cohort result sheet / incident & appeal register / proctor log, loan ledger, human-readable EPF / ESIC / PT / LWF registers | P09 Appendix: report catalogue (name, owner, wave, sensitivity, format) + named in each module §7 | High |
| F5 | **Screen inventory & navigation** | The UI brief has no **Engage** module row; no **Settings map** (15+ settings areas, re-creating U90); no **T9 external-portal shell** for the six OTP logins, the candidate portal and the verify page; the M04 tab map omits ~10 employee flows (policy acknowledgement, exit clearance, probation form, PIP acknowledgement, comp-off claim, optional holidays, shift-swap consent, delegation, my data / who accessed, timesheets, case filing, referrals, internal jobs); no desk **Time › Today** board; no 1:1 record; no timesheet entry screen; stand-ups undecided (U88); brief §8 is stale for Proctoring (+10 screens) and the staffing desk (+5) | UI brief §3 / §4 / §8; M04 §3 as the canonical mobile map | High |
| F6 | **U-issue closure** | 49 of 103 U-issues are cited nowhere. Substantive: U45–U47 (TDS challan pre-fill, prior-month deductees, deductor address / reconciliation), U33 (**no payslip layout designed or editable**), U26–U28 (blocking review grid, per-employee progress, pre-flight), U16 / U17 / U23 / U7 / U67 (desk team views, punch map, mobile markers, unpaid-leave display, dashboard queue counts). The rest are covered in substance but uncited. | M03 rules + payslip template; M02 / M04 / M05; add "fixes Uxx" in every §9 | Medium |
| F7 | **Letter & document templates** | The P05 library omits: termination, resignation acceptance, early release / buy-out, retirement, end of contract / renewal, absconding notices, bonus / incentive, loan sanction, retention-bonus / clawback agreement, disciplinary decision & appeal outcome, POSH acknowledgement, placement / deployment letter, **client GST invoice template**, pre-boarding welcome / joining instructions, nominee letters | P05 §4.3 | High |

## G. Admin editors and setup with no screen designed

> ✅ **Done 26 Sep 2026:** **APX-E** setup hub (22 cards), go-live readiness (67 checks), admin editor inventory (174 editors, 50 with Excel import), roster ownership; reviewer assignment + conflict rule in T05 (YX-EVAL-15).

| # | Area | Configurable things with no editor | Home |
|---|---|---|---|
| G1 | **Setup hub / go-live readiness** | The P01 (org) and M03 (payroll) wizards are disconnected; nothing covers leave types / policies / holidays, shifts / weekly-off / check-in rules, approval policies, roles & admin users, notification channels (the WhatsApp "checklist step" is undefined), letterheads / signatories, document types, expense policy, review templates, helpdesk queues, IC constitution, privacy-notice publication or mobile roll-out. No readiness model for A5's checklist to read. | P01 §7 "Set-up hub" with a completeness card per module |
| G2 | **M02** | Leave-policy bundles & assignment rules, weekly-off precedence, check-in rules per location / group **incl. geofence drawing on a map** (no map component in the brief), late-penalty policy, regularisation limits, shift patterns; Settings › Time (cut-off, max lateness, device binding, session length) | M02 §7 + brief §5 map editor |
| G3 | **M01** | Journey / checklist template builder, probation & notice policies, transfer defaults, asset categories, rehire rules; Settings › Lifecycle (F&F deadline, retro limit) | M01 §6 |
| G4 | **M03** | Component library editor, pay groups, loan types, bonus policy, one-time pay types, **payslip layout editor**, HR proof-verification queue screen; Settings › Payroll (day basis, variance threshold, protected net, windows, regime cut-off); bulk import of month-end inputs from Excel | M03 §7 |
| G5 | **Other modules** | M04: kiosk registration & heartbeat, device-bind queue, HR remote sign-out. P05: document-type registry, signatories & DSC, letterheads, reference prefixes. M06: review-template builder, rating-scale editor, competency editor. M08: queue config, misconduct-matrix editor, KB editor, IC membership editor. M05: category / per-diem / mileage / city-tier / advance-rule editors. M07: assignment-rule editor, budgets, bond terms, trainer master. M09: spaces, reward catalogue & budgets, celebration settings, blocked-word lists. M10: pipeline & scorecard templates, rate cards, BGV packages. Settings › Hiring / Assessments / Privacy / Engage / Cases / Analytics | Each doc §7 |
| G6 | **Roster ownership** | No `attendance.roster.manage` permission / scope; the M02 roster screen has no owner | P02 + M02 |
| G7 | **Reviewer assignment** | T05 incidents: no assignment policy, no conflict-of-interest rule (reviewer ≠ recruiter / hiring manager of that candidate), no capacity dashboard | T05 Q1 |

## H. Analytics without sources, and legal artefacts

> ✅ **Done 26 Sep 2026:** H1 `recruiting_costs` (M10) + `test_costs` (T02); H2–H5 in **APX-C**; H6 **APX-G** (23 legal artefacts as lawyer briefs, `legal_documents` / `legal_acceptances`, YX-SEC-28); H7 help & onboarding patterns in **APX-D §6**.

| # | Gap | Home | Importance |
|---|---|---|---|
| H1 | **Cost per hire is undeliverable**: no `recruiting_costs` table in M10, no cost per test in T02 | M10 + T02 | High |
| H2 | **The metric dictionary omits whole modules** that route "via P09": M05 spend / over-limit / advance ageing; M07 scores, hours, budget; M08 deflection, CSAT, SLA, case ageing; M09 participation, eNPS, kudos; T03–T05 no-show %, readiness fails, incident & appeal rate, proctor utilisation; P03 approval turnaround; P11 API usage; AI credits. YX-MET-01 forbids unregistered numbers, so those dashboards can't ship. | 11-analytics §5 + P09 (a domain per module, before wave 5) | High |
| H3 | **Finance provisions**: leave-encashment liability, gratuity provision trend, bonus provision, loan book, unsettled advances — no metric or month-end report | P09 + M03 | High |
| H4 | Compensation analytics (compa-ratio distribution, range penetration, increment budget vs plan); lifecycle & compliance metrics (pre-boarding %, onboarding SLA, probation outcomes, document backlog, policy acknowledgement %, succession coverage, DSAR SLA); a `regretted` flag on exit cases (P09 Q1 needs it); offer `decline_reason`; snapshots for pipeline / placements / cases / enrolments | P09 + M01 + M10 | Medium |
| H5 | Role dashboards missing for compliance owner, L&D admin, helpdesk lead, ethics officer / IC, staffing head, finance-expenses, System Admin ops, and employee "me" cards | P09 §4.4 | Medium |
| H6 | **Legal artefacts not mentioned anywhere**: terms of service / subscription agreement + order form; **WhatsApp & SMS per-recipient opt-in record** (Meta / TRAI-DLT requirement; P04 has opt-out only); tenant-facing privacy policy (YukthiX as processor) and notices for the six external logins; cookie notice on public pages; customer SLA document; acceptable-use policy; accessibility statement; public retention-schedule page (BIPA); security / trust page; e-sign disclosure (IT Act evidence); open-source attribution page | P14 / P02 §6 / P04 / brief T9 footer | High (opt-in, ToS, privacy) |
| H7 | Help & onboarding UX: role-based first-run tours (first approval, first payroll), a per-screen contextual help model, permission-denied vs 404 pattern + "request access", an irreversible-action dialog (impact preview + typed confirm), "available in wave X" states | UI brief §5 / §6 + M04 §6 | Medium |

## Updated proposed plan

1. **Fix D1–D13 now** in the existing docs. Short question sets where a decision is needed (D1 attendance modes, D3 hand-off matrix, D5 proxy requests, D12 proctor grants); the rest are straightforward additions.
2. **E1–E20 as one "India lifecycle events" extension bundle** across M01 / M02 / M03 / P07 (about 10 questions: death, maternity funding, absconding timeline, rehire continuity, notice-period leave, cash pay, garnishment cap, tax rules).
3. **F1–F7 + G1–G7 as appendices** to P04 / P11 / P09 / P05 / P01 / the UI brief. Mostly enumeration work, few decisions.
4. **H1–H7** with P09 and P14.
5. Then the first-pass plan (P12–P16, M11–M12, T06–T08, B bundles).

---

# Third pass — 28 Sep 2026 (proposals, not yet decided)

Five new lenses found **98 more gaps** (4 corrections to text that treats laws already in force as future, 22 new Musts, 50 Should, 21 Later, 1 Skip). Full list with evidence: [VALIDATION-PASS-3.md](VALIDATION-PASS-3.md). Items move into this register's resolution tables only after founder decisions.
