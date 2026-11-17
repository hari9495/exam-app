# What to build from Oracle (draft 17 Nov 2026, for the founder)

Sources: `oracle-ebs-pages.md` (what we saw in EBS R12, sessions 1–2), `enterprise-readiness.md` (code audit of
YukthiX) and general knowledge of Oracle Fusion HCM (marked "Fusion").

Rule: take Oracle's **depth** (data model, rules, controls) and keep Keka/Zoho-level **simplicity** on screen. We
never copy Oracle's screens, which are dense and old; the screens stay in our own design, kit first.

Sizes: S (days), M (1–2 weeks), L (3+ weeks). Pick key: **Build**, **Later**, **Skip**.

## 1. Positions (the biggest gap; YukthiX has no position record)

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O1 | Position = one seat (org + job + grade + location + FTE + headcount), with an ID and date-tracked history | Yes | No | **Build** | L |
| O2 | Seat status: active, frozen, proposed, eliminated; a vacancy is an empty seat | Yes | No | **Build**, with O1 | — |
| O3 | Supervisor position and position hierarchy (the org chart works even when a seat is vacant) | Yes | Reporting line by person only | **Build** | M |
| O4 | Requisition and opening raised against a seat; the seat's headcount caps the openings | Yes | Openings not tied to seats | **Build** | M |
| O5 | Position budget: approved headcount and cost per seat per year, filled vs vacant vs budget | Yes | Headcount plans exist | **Build** (extend the headcount plans) | M |
| O6 | Valid grades per seat and a proposed entry salary | Yes | Grades exist | **Build**, with O1 | S |
| O7 | Relief and successor seats (feeds succession) | Yes | No | **Later** (with succession) | S |
| O8 | Position changes go through approval; mass update and copy | Yes | — | **Build**, with O1 | S |
| O9 | A setting: a company can run with or without positions (small companies don't need them) | Fusion: yes | — | **Build** (default off) | S |

## 2. Leave depth

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O10 | Accrual bands by years of service (rate, carry-over cap, ceiling) | Yes | Being built (batch A, D3 levels) | Make sure it includes a **ceiling** per band | S |
| O11 | Period of ineligibility (no accrual in the first N months), as a setting | Yes | Check | **Build** if missing | S |
| O12 | Net-calculation rules: which other leave types reduce this balance | Yes | No | **Later** | S |
| O13 | Recalculate after a back-dated policy change; true-up after a mid-year move | Fusion: yes | Missing (audit) | **Build** | M |

## 3. Payroll and back-dated pay

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O14 | Per pay item, "recalculate when": salary change, joining date, LOP, statutory rule. Back-dated pay is then auto-created for exactly those items | Yes | Arrears worksheet is strong, but is created by hand | **Build** | M |
| O15 | Proration rule per pay item: calendar days, working days or fixed 30 | Yes | Check | **Build** if missing (batch H) | S |
| O16 | Pay item paid as a separate payment, and gross-up (company pays the tax) | Yes | No | **Build** (joining bonus net of TDS is common) | M |
| O17 | Input cut-off date and payslip release date per pay group; late inputs roll to next month with a notice | Yes | Partly (period lock) | **Build** | S |
| O18 | Each pay period has its own status (open or closed) and dates | Yes | Yes | **Keep ours** | — |

## 4. Costing and GL

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O19 | GL mapping screen: our cost centre and pay item → the customer's account codes | Yes | Engine exists, no screen | **Build** | S |
| O20 | Suspense account: costs with no valid account go to suspense, never fail | Yes | No | **Build** | S |
| O21 | Split one person's cost across cost centres or projects by %, from a date | Yes | Cost-centre split exists, check per person by % | **Build** if missing | M |
| O22 | Department, location and project as costing dimensions; journal reversal; SAP / Oracle formats | Yes | Missing (audit) | **Build** | M |
| O23 | Charges between legal entities (inter-entity) | Yes | No | **Later** (multi-entity groups ask for it) | L |

## 5. Approvals

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O24 | Rules editor: transaction type → attributes (amount, grade, department, entity) → conditions → actions (supervisor chain up to a level, approver group, position) | Yes (AME, from docs) | Engine is enterprise-grade; no company editor (drawn in PLT-12) | **Build** the PLT-12 editor in this shape | L |
| O25 | Approver groups: fixed lists, or a list from a rule (for example "the finance head of this entity") | Yes | Partly | **Build**, with O24 | — |
| O26 | Approve up the chain until a grade or amount level is reached | Yes | Check | **Build**, with O24 | — |

## 6. Organisation and several countries

| # | Feature | Oracle | YukthiX today | Pick | Size |
|---|---|---|---|---|---|
| O27 | One organisation can be several things at once: legal entity + payroll unit + cost centre, with extra details per role | Yes | Separate lists | **Later**. Our separate lists work; revisit when a customer needs it | M |
| O28 | Per country: payroll rules, statutory codes and currency, with several legal employers under it | Fusion: yes | India only | **Build** when the first non-India customer signs (already the agreed multi-country approach) | L |
| O29 | Buy leave: an employee buys extra days through a salary deduction, beside encashment | Yes (net calculation, "Accrual Buy") | Encashment only | **Later** | S |
| O30 | Time-to-pay rules: daily, weekly and double-time thresholds, holiday premium, shift differential, unpaid break deduction; raw time kept, pay hours derived | Yes (OTM earning policies) | Overtime rules exist (check against this list) | **Check, then build gaps** (Factories Act: 2x over 9 h a day or 48 h a week) | M |
| O31 | "What changed when": per record, the fields changed in each period | Yes (DateTrack History summary) | Full history kept; check whether this summary view exists | **Later** if missing | S |

## 7. Already as good as or better than Oracle (keep)
- Audit: date-tracked history, as-of views, a hash-chained audit log, payslip snapshots (audit verdict: best area).
- Indian statutory rules built in (Oracle needs a localisation pack and partners).
- Modern, simple screens; self-service; mobile; assessments and proctoring (Oracle has none of these built in).

## Suggested plan
- **Enterprise batch** (after tier-1 batches A → H → … → G):
  - Positions: O1–O6, O8, O9.
  - Approval rules editor: O24–O26.
  - Back-dated pay auto-create: O13, O14.
  - Costing: O19–O22.
  - Payroll controls: O16, O17.
- Fold the small leave items O10 and O11 into the current batch A or batch H, as they touch the same code.
- Later: O7, O12, O23, O27. Build O28 when the first non-India customer signs.
