# 99 · Gap Summary — Frappe reference vs YukthiX spec

**Date:** 24 Sep 2026 · **Inputs:** modules 00–10 of this reference + `spec.md` (Leave §1.3.3 updated 23 Sep)
**Full row-by-row list (191 rows, auto-generated):** [99-gap-register.md](99-gap-register.md)
**Status:** priorities below are **recommendations** for the team to confirm in Phase 2.

---

## 1. Headline numbers

| What | Count |
|---|---|
| Modules documented | 11 (00–10) |
| Data objects / fields catalogued | 195 / 1,915 |
| Numbered business rules | 478 |
| Suspected Frappe defects (to verify, not to copy) | 132 |
| Gap rows analysed | 191 |

| Class | Meaning | Rows | What it means for us |
|---|---|---|---|
| **A** | In our spec, **no reference** in Frappe | 63 | Design from scratch — biggest effort |
| **B** | Frappe has it, **missing from our spec** | 12 | Add to `spec.md` (cheap wins) |
| **C** | **Neither** has it | 29 | India needs & differentiators — decide in/out |
| **D** | Frappe **partial** | 36 | Use Frappe as a starting point, then do better |
| **E** | **Both** have it | 51 | Frappe rules = ready reference; build to them |

**Bottom line:** about **45 %** of what we need has a usable reference (E + D); **55 %** (A + C) is ours to design — and that's where YukthiX differentiates.

---

## 2. The most important finding: gaps cluster into shared platform services

Many gaps across modules are the *same* missing capability. Build each **once** in the Platform Foundation (§2.1) and every module benefits.

| Platform service (spec §) | Gaps it closes across modules |
|---|---|
| **Workflow & approval engine** (§2.1.4) | Requisition & offer approval (08) · payroll maker-checker (03) · overtime pre-approval (02) · profile change requests (00, 10) · resignation (05) · travel approval (06) · appraisal stages (07) · leave delegation & multi-level (01, 09) · amount-based routing for claims (06) |
| **Notification engine** (§2.1.7) | Frappe notifies only leave / expense / shift, English only (10) · all modules need events, templates, WhatsApp / SMS, regional languages |
| **Letters & documents** (§2.1.8, §2.1.9) | Offer, appointment, confirmation, promotion, relieving, experience, F&F letters (05) · document collection with expiry (00, 05) · certificates (09) · payslip / Form 16 / letters download incl. alumni (05, 10) · e-sign |
| **Effective-dated job history + scheduled changes** (§1.3.1) | Frappe keeps history only for department / designation / branch and can't future-date promotions / transfers (05) · mid-month salary revision (03 B-D1) |
| **Statutory rules as dated data** (§2.1.6) | PT & LWF slabs hard-coded and outdated (04) · tax slabs · minimum wages · bonus · rate change without a release |
| **Period locks** | Attendance lock after payroll (02) · payroll freeze (03) · leave / attendance edits after slip (01, 02) |
| **Privacy & security by design** (§2.1.3, §2.1.16) | Employees can see everyone's tax / PF / PAN reports (03, 04) · ECR download open to any user (04) · SSA salary readable by employees (03) · field-level protection for Aadhaar, bank, health (00) · candidate consent & retention (08) · grievance confidentiality (09) |
| **AI layer** (§2.1.14) | Resume parsing & dedup (08) · AI first-round interview (08) · receipt OCR (06) · expense fraud / duplicate checks (06) · selfie / face check-in (02, 10 — reuse Proctoring) |
| **Integration hub** (§2.1.13) | Biometric device connectors (02) · job boards (08) · background verification (05, 08) · bank payout files / APIs (03) · accounting export — Tally / Zoho (03, 06) · calendar sync (08) · TDS filing provider (04) |

> **Recommendation:** design these nine services first in Phase 3 — every module design depends on them.

---

## 3. Recommended launch scope — India SMB HRMS

**P0 = needed before the first paying India SMB customer.** P1 = first releases after launch. P2 = later / differentiators.

### P0 — launch

| Area | Must include | Where the gap comes from |
|---|---|---|
| Core HR | Employee master with India IDs (PAN, Aadhaar, UAN, ESIC, IFSC) validated & masked; locations with state; org chart | 00 |
| Leave | All 18 approved features (decided 23 Sep) | 01 |
| Attendance | Check-in (mobile + geofence), shifts & rosters, auto-attendance, **regularisation with times**, **late-coming penalties**, biometric import (at least file / API), attendance lock | 02 |
| Payroll | Components / structures / CTC builder, payroll run with **maker-checker**, **variance report**, **lock**, bank file, payslips (password PDF), arrears, correct mid-month revisions | 03 |
| India statutory | EPF incl. **employer split, EPS pre-2014 & age-58 rules**, ECR per month; ESI with **contribution-period continuation** and rupee round-up; PT / LWF for launch states **as dated data**; TDS projection, old / new regime (new = default), declarations & proofs with HR verification, 12BB; challans, **24Q**, **Form 16** | 04 |
| Lifecycle | Onboarding checklist, **probation & confirmation**, **resignation workflow + notice period**, **F&F calculation**, core letters (offer, appointment, confirmation, relieving, experience) | 05 |
| Self-service | Mobile PWA: attendance, leave, expense, payslip / Form 16 / letters download, approvals, notifications | 10 |
| Platform | Workflow engine, notification engine (e-mail + in-app + push; WhatsApp optional), letters, privacy / row-level security, audit log | §2 above |

### P1 — soon after launch
- Expenses with **policy limits**, mileage, per-diem, advances with instalment recovery (06)
- Performance: goals / OKRs, review stages, manager vs peer ratings, 360° with nominations (07)
- Training enrolment, certifications with expiry (09)
- **POSH** case management and disciplinary workflow (09) — *legally required process for employers with 10+ employees; consider P0 if early customers ask*
- Employee helpdesk, policy acknowledgement (09)
- Compliance calendar with due dates and penalty estimates (04)
- Statutory bonus, minimum-wage checks, gratuity provisioning (03, 04)
- Overtime pre-approval + Factories Act OT limits, shift / night allowance (02)

### P2 — later / differentiators
- Calibration / 9-box, compensation review linked to ratings, PIP, succession planning (05, 07)
- Selfie / face check-in, offline check-in, native apps (02, 10)
- Corporate cards, GST input capture, travel bookings (06)
- Engagement surveys, recognition (09)
- Alumni portal (05)

> ATS (§1.2) and Proctoring (§1.1) are separate products — module 08 gives the Internal ATS baseline; External staffing is entirely ours.

---

## 4. Class B — add to `spec.md` (Frappe has them, our spec doesn't mention them)

| # | Capability | Module | Suggested spec section |
|---|---|---|---|
| 1 | Geofence per location for check-in | 02 | §1.3.4 |
| 2 | Split shifts / multiple shifts per day | 02 | §1.3.4 |
| 3 | WFH / on-duty requests (with monthly limits) | 02 | §1.3.4 |
| 4 | Break rules (unpaid break deduction) | 02 | §1.3.4 |
| 5 | Bank payment file (bank-specific formats) | 03 | §1.3.5 |
| 6 | Off-cycle / supplementary payroll | 03 | §1.3.5 |
| 7 | Payroll lock / freeze after run | 03 | §1.3.5 |
| 8 | Pre-run validation dashboard (missing bank, PAN, structure, attendance) | 03 | §1.3.5 |
| 9 | Previous-employer income (Form 12B) | 03 | §1.3.5 |
| 10 | Receipt capture (+ OCR, mandatory above an amount) | 06 | §1.3.7 |
| 11 | Competency framework / skills assessment | 07 | §1.3.8 |
| 12 | Daily check-ins / stand-ups (in-app) | 09 | §1.3.16 or drop |

---

## 5. Class C — India needs & differentiators (neither has them)

| Theme | Items |
|---|---|
| **India compliance** | Statutory bonus (Bonus Act), minimum wages by state / skill, Factories Act OT limits and muster roll / Form 25, compliance calendar, statutory rates maintained centrally |
| **Payroll control** | Maker-checker approval, month-over-month variance, attendance lock, report privacy |
| **Attendance for Indian workforces** | Late-coming penalties, flexi / core hours, minimum rest between shifts, shift / night allowance, auto comp-off from holiday work, IP / Wi-Fi restriction, offline & selfie check-in |
| **Performance** | Calibration / 9-box, compensation review link, PIP, training needs from skill gaps |
| **Expenses** | GST per bill, duplicate / fraud checks, corporate cards |

---

## 6. Frappe defects we must NOT replicate (top 12)

| # | Defect | Module |
|---|---|---|
| 1 | Employees can run tax / PF / PT reports for **all** employees (PAN, PF no., tax) | 03, 04 |
| 2 | ECR (PF) download needs no permission — any user gets UANs and wages | 04 |
| 3 | Employer PF / EPS / EDLI / admin never computed; EPS wrong for pre-2014 members | 04 |
| 4 | ESI re-tested monthly (no contribution-period continuation), rounded to paise | 04 |
| 5 | PT / LWF slabs hard-coded and outdated (Kerala breaks the ₹2,500 cap; Haryana LWF flat) | 04 |
| 6 | Mid-month salary revision not split; conditions evaluated on the first cycle only | 03 |
| 7 | No proof by March → all declared exemptions dropped → TDS spike | 03 |
| 8 | Annexure II / Form 16 use projected (not deducted) tax; leavers omitted | 04 |
| 9 | Cancelling a payroll run **deletes** salary slips (no audit trail) | 03 |
| 10 | F&F journal doesn't balance with withheld salary; F&F has no calculation | 05 |
| 11 | Partly-paid leave inverted between leave- and attendance-based payroll | 01 |
| 12 | Permission gaps: HR Manager can't submit separation / cancel appraisal; nobody can cancel payroll correction; only Administrator can submit gratuity | 05, 07, 03 |

> Full list: the "Suspected defects" section of each module (132 items). Verify the top ones on the local Frappe instance before quoting them externally.

---

## 7. Open design questions (Phase 3 input)

| Module | Open questions | Status |
|---|---|---|
| 01 Leave | 6 | ✅ all decided (23 Sep) |
| 02 Attendance | 8 | open (incl. weekly-off rule deferred from Leave) |
| 03 Payroll | 8 | open |
| 04 India statutory | 6 | open |
| 05 Lifecycle | 7 | open |
| 06 Expenses | 6 | open |
| 07 Performance | 6 | open |
| 08 Recruitment | 6 | open |
| 10 Mobile | 5 | open |
| **Total open** | **52** | |

---

## 8. Suggested next steps

1. **Phase 2 — confirm scope (1–2 sessions):** walk this summary with the team; accept / change P0–P2; approve the 12 Class-B additions; decide Class-C items in or out.
2. **Update `spec.md`** with the approved additions (as done for Leave).
3. **Phase 3 — design, in this order:**
   1. Platform services (§2): tenancy & org model, RBAC & privacy, workflow engine, notification engine, letters & documents, effective-dated history, statutory-rules-as-data, period locks.
   2. Core HR + Lifecycle (00, 05).
   3. Leave + Attendance together (01, 02) — answer module 02's 8 questions.
   4. Payroll + India statutory together (03, 04).
   5. Self-service / mobile (10).
   6. P1 modules (06, 07, 09) and ATS (08).
4. Each design doc: our own data model, rules as testable IDs (`YX-…`), and acceptance tests derived from the Frappe rule IDs + law.


---

## 9. Phase 2 decisions (recorded as made)

| # | Decision | Answer | Date |
|---|---|---|---|
| P2-1 | P0 launch scope | ✅ **Approved all 8 areas as listed in §3** (Core HR, Leave, Attendance, Payroll, India statutory, Lifecycle, Self-service, Platform) | 24 Sep 2026 |
| P2-2 | POSH | ✅ **P0, simple version at launch:** Internal Committee setup, confidential (optionally anonymous) complaint intake, case tracking with 90-day inquiry timer, annual-report template. Disciplinary workflow and helpdesk stay P1. | 24 Sep 2026 |
| P2-3 | Class B additions | ✅ **All as recommended** — P0: geofence, WFH / on-duty with limits, break rules, bank file, payroll lock, pre-run validation, Form 12B · P1: split shifts, off-cycle payroll, receipt OCR · P2: competency framework · Dropped: daily stand-ups | 24 Sep 2026 |
| P2-4 | Class C items (22 distinct) | ✅ **All as recommended** — P0: statutory bonus, minimum-wage check, compliance calendar, central statutory rates, auto comp-off (+ maker-checker, variance, report privacy, late penalties, attendance lock already P0) · P1: Factories Act OT & registers, gratuity provisioning, flexi-time, minimum rest, shift allowance, OT pre-approval, IP restriction, ratings→compensation link, PIP, expense fraud checks · P2: offline & selfie check-in, calibration / 9-box, training needs, GST per bill, corporate cards | 24 Sep 2026 |
| P2-5 | P1 / P2 lists | ✅ **Everything (P0 + P1 + P2) is in scope for the market launch.** P0/P1/P2 now mean **build order only**. A **private pilot** with 1–2 friendly companies runs on ready modules (payroll first) during the build; public release when all is complete. | 24 Sep 2026 |
| P2-6 | Build order | ✅ **Wave order approved:** 1 Platform + Core HR · 2 Leave + Attendance + basic mobile · 3 Payroll + India statutory (**pilot starts**) · 4 Lifecycle incl. F&F, letters, POSH · 5 Expenses, Performance, Training, Helpdesk, Disciplinary · 6 Differentiators (P2). **ATS after HRMS wave 5** (option A). | 24 Sep 2026 |
