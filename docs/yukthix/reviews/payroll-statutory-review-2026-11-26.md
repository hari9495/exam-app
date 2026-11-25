# Payroll statutory review, 26 Nov 2026

A review, not new features. It compares what the payroll code calculates with
`docs/yukthix/reference/statutory/india-state-rules-2026-27.md` (the research) and
`CA-checklist-statutory-2026-27.docx` (56 items). No product code was changed.

- Code reviewed: branch `review/yukthix-statutory` at `cf86106af`. The payroll and statutory code there
  (`apps/api/src/payroll`, `apps/api/src/statutory`) is identical to `test/yukthix-main` (no diff).
- Main files: `apps/api/src/payroll/calc.ts` (the payslip), `apps/api/src/payroll/tax.ts` (the tax projection),
  `apps/api/src/statutory/evaluator.ts` (the calculators), `apps/api/src/statutory/packs/in.json`, `in-tax.json`,
  `in-exit.json`, `in-min-wages.json` (the figures), `apps/api/src/payroll/runs.service.ts` (what goes into a payslip).
- Failing tests that show the right figure: `apps/api/src/payroll/statutory-review.spec.ts` (8 tests, R1 to R8; all 8
  fail today with the figures quoted below). Run: `npx jest src/payroll/statutory-review.spec.ts` in `apps/api`.
- Every figure in the packs is still marked `verify: true` except the PT yearly cap and the 50 % wage rule; nothing
  here replaces the CA's sign-off.

## Summary

| Rank | Count | Items |
|---|---|---|
| Wrong money | 7 | R1 PF admin on the uncapped wage; R2 PF ceiling cut for mid-month joiners; R3 ESI low-wage exemption ignored; R4 Maharashtra PT nil for genders other than male and female; R5 international workers on the ceiling; R6 higher pension ignored; R7 no surcharge marginal relief |
| Wrong filing | 2 | F1 PF admin minimum (₹500) never applied; F2 R8 employer NPS deduction uncapped (Form 130 / Form 138 under-reports taxable salary) |
| Missing | 8 | M1 EPS eligibility not worked out; M2 bonus minimum ₹100; M3 LWF wage limits per state; M4 minimum-wage check gaps; M5 TN PT half-year income; M6 MP annual PT after a salary change; M7 7.5 lakh employer retirement-contribution cap; M8 tax rounding to ₹10 |
| OK | the rest | see "Checked and fine" |

## Wrong money (an employee or the company pays the wrong amount)

**R1. PF admin charges are worked out on the whole PF wage, not the wage PF is paid on.**
`apps/api/src/payroll/calc.ts:268` uses `base`, which is built at `calc.ts:255` from the uncapped PF wage. EPFO admin
charges are 0.5 % of the EPF wages contributions are paid on. With PF capped at the ceiling, the employer overpays.
Example (October 2026, ceiling 25,000): basic 60,000. PF 12 % × 25,000 = 3,000 (right). Admin: code 0.5 % × 60,000 =
**300**; should be 0.5 % × 25,000 = **125**. Test R1 fails (300 vs 125). When "PF on actual wage" is on, the code is right.
Doc / checklist: not covered (item 46 asks for the admin-charge ceiling; the rate itself matches).

**R2. A mid-month joiner (or leaver) gets a PF ceiling cut by the days worked.**
`calc.ts:244-247` scales the wage, EPS and EDLI ceilings by `segment days ÷ month days`. That is right for a pay change
inside the month (the parts add up to one full ceiling) but wrong when the person is not employed for the whole month: the
ceiling is a monthly limit on wages paid, not on days. Example: joins 16 Oct 2026 on basic 40,000. Earned basic 40,000 ×
16/31 = 20,645, below 25,000, so PF = 12 % × 20,645 = **2,477**. Code: ceiling 25,000 × 16/31 = 12,903, PF **1,548**.
Employee and employer both short by 929, EPS short too, and the ECR shows the wrong wage. A person with 15 days of loss of
pay keeps the full ceiling, so the two cases disagree. Test R2 fails (1,548 vs 2,477). CA to confirm the practice.

**R3. ESI: the low-wage exemption of the employee share is not applied.**
The pack has `dailyWageExempt: "176"` (`packs/in.json`, IN.ESI) but `evaluator.ts:83-88` (`esi`) never reads it. An
employee whose average daily wage is ₹176 or less pays no employee share; the employer still pays 3.25 %. Example: a
covered worker on 4,000 for October (129 a day): employee **0**, employer **130**. Code: employee **30**. Test R3 fails.

**R4. Maharashtra PT is nil for anyone recorded as transgender, non-binary or "prefer not to say".**
`evaluator.ts:113` keeps only slabs of the person's own gender (and treats "no gender" as male). People can record
`transgender`, `non_binary` or `prefer_not_to_say` (`apps/api/src/people/profile.dto.ts:11`); none of the Maharashtra
slabs (`packs/in.json` IN-MH: male and female only) matches, so PT is **0**. The 25,000 exemption is for women only;
everyone else should be on the general slab. Example: gross 58,900 in October: **200** expected, code **0** (and the PT
return is short). Test R4 fails for all three values. CA to confirm how the state treats each. Matches the doc otherwise
(slabs 7,500 / 10,000 / 25,000, February 300: OK).

**R5. International workers pay PF on the capped wage.**
The statutory profile stores `internationalWorker` (`apps/api/src/payroll/dto-5b.ts:357`,
`structures.service.ts:606`), but `runs.service.ts:1028-1040` never puts it on the payslip snapshot, and `calc.ts` has
no rule for it. An international worker contributes on the whole PF wage (no ceiling). Example: basic 1,00,000:
**12,000** expected; code **3,000**. Test R5 fails. Doc / checklist: not covered (the brief lists it). CA to confirm the
EPS treatment (SSA countries).

**R6. The higher-pension (joint option) flag is ignored.**
`higherPension` and `pre2014Member` are stored (`structures.service.ts:572, 606`) but never used. A member with the
higher-pension option (and PF on actual wage) gets EPS on the actual wage. Example: basic 1,00,000: EPS 8.33 % =
**8,330** expected; code **2,083** (capped). The EPF share is then too high by the same amount. Test R6 fails. CA to
confirm, as the higher-pension cases follow the EPFO orders after the Supreme Court judgment of Nov 2022.

**R7. Surcharge has no marginal relief.**
`evaluator.ts:349-351` applies the surcharge rate to the whole tax once income passes a threshold (50 lakh, 1 crore,
2 crore, 5 crore). The law limits tax plus surcharge to the tax at the threshold plus the income above it. Example (new
regime, taxable 50,10,000): tax 10,83,000. With relief: at most 10,80,000 + 10,000 = 10,90,000, with 4 % cess
**11,33,600**. Code: 10,83,000 + 1,08,300 surcharge, with cess **12,38,952** (₹1,05,352 too much in the year). Test R7
fails. The 87A marginal relief (new regime, just above 12 lakh) is right (`evaluator.ts:347`).

## Wrong filing (a return or challan would be wrong)

**F1. The PF admin minimum (₹500 a month per establishment) is never applied.**
The pack has `adminMinimum: "500"` (`packs/in.json` IN.PF), and `calc.ts:268` says "the establishment minimum is settled
on the challan", but nothing in `apps/api/src` reads `adminMinimum`. Example: an establishment with 5 people on basic
10,000: admin 0.5 % × 50,000 = 250; the challan must show **500**. The ECR / challan built from the payslip lines
(`statutory-filings.service.ts`) shows 250. (Together with R1 the figure is wrong in both directions.)

**F2 (R8). Employer NPS is allowed in full; it is capped at a share of basic + DA (14 % in the new regime and 10 % in
the old regime under the 1961 Act; CA to confirm the TY 2026-27 figures under the 2025 Act).**
`packs/in-tax.json` IN.TAXDED has `sec80ccd2: null` (no cap) and `evaluator.ts:374-381` (`taxDeduction`) has no
percentage cap. Example: basic 50,000 a month (6,00,000 a year), employer NPS 2,00,000: allowed **84,000**; code allows
**2,00,000**, so 1,16,000 of salary escapes TDS and Form 130 / Form 138 show it wrong. Test R8 fails.

## Missing

- **M1. EPS eligibility is not worked out.** `runs.service.ts:1031` defaults `eps` to true. A member who first joined PF
  after 1 Sep 2014 with a wage above the ceiling is not an EPS member; today payroll must set the flag by hand, and
  `pre2014Member` is stored but unused (see R6).
- **M2. Bonus minimum ₹100.** `evaluator.ts:228-236` (`bonus`) has no floor; the pack has none (checklist 43; doc 3.1 says
  "add the 100 minimum if the code lacks it" – it still lacks it). Only matters for very low wages or short service.
- **M3. LWF wage or role limits per state are not modelled.** `evaluator.ts:127-134` charges everyone in the state in the
  due months. The doc lists limits: Tamil Nadu excludes managers and supervisors above 15,000 a month and people with less
  than 30 days' work; Delhi excludes supervisors above 2,500; Gujarat may apply only up to 15,000 (unconfirmed).
- **M4. The minimum-wage check has gaps.** `calc.ts:419` compares the month's **gross** (HRA, conveyance and other
  allowances included) with the minimum wage, skips any month with loss of pay, and compares a part month (joiner or
  leaver) with the full-month minimum (a false "below"). Under the Code on Wages the comparison is on wages (basic + DA +
  retaining allowance, with the 50 % rule). CA to confirm what to compare.
- **M5. Tamil Nadu half-yearly PT uses this month's PT wage × 6** (`calc.ts:284`), not the half-year's income. For a
  joiner or a pay change in the half-year the band can differ. Example: joins in December on 15,000 a month, January
  deduction: code 15,000 × 6 = 90,000 → **1,250**; Dec–Mar actual income 60,000 → **930**. CA to confirm which income
  the Chennai rules use for part half-years.
- **M6. Madhya Pradesh annual PT after a pay change.** `evaluator.ts:116-119` takes a twelfth of the band worked out from
  each month's PT wage × 12, with the rest in March from March's band. If the band changes mid-year the year's total is
  neither band (example: 2,000-band until November, 2,500-band from December: 166 × 8 + 208 × 3 + 212 = **2,164**). CA to
  confirm the yearly liability for part years and changes.
- **M7. The ₹7.5 lakh yearly cap on employer PF + NPS + superannuation** (tax on the excess as a perquisite) is not
  worked out anywhere in `tax.ts`.
- **M8. Rounding of tax to ₹10.** `tax.ts:123` rounds taxable income to the nearest ₹10 (right); the tax itself is
  rounded to the rupee (`evaluator.ts:351`), where the Act rounds tax payable to the nearest ₹10. Small; CA to confirm for
  TDS.

## Checked and fine

PF
- Employee and employer 12 %, EPS 8.33 % of the wage up to the EPS ceiling, EPF = employer share − EPS, EDLI 0.5 %
  (`evaluator.ts:70-80`; `packs/in.json` IN.PF).
- Wage ceiling 15,000 until 16 Sep 2026 and 25,000 from 17 Sep 2026 (IN.PF 2026-v2), EPS cap 2,083 at 25,000 (25,000 ×
  8.33 % = 2,082.50 → 2,083): matches doc section 4 and checklist 46 (still needs the CA).
- No EPS from age 58, all to EPF (`evaluator.ts:77`); a non-member's EPS goes to EPF (`calc.ts:256-259`).
- "PF on actual wage": employee and employer on the whole wage, EPS and EDLI still capped (`evaluator.ts:73-78`).
- "Below the ceiling" components (answer 2403) use the earned PF wage after loss of pay (`calc.ts:250-251`).
- Voluntary PF: the chosen percent of the PF wage, rounded to the rupee, employee only (`calc.ts:264`).
- Rounding to the nearest rupee.

ESI
- Rates 0.75 % and 3.25 %, rounded up to the rupee (`evaluator.ts:83-88`).
- Ceiling 21,000, 25,000 for a person with a disability who consents (`evaluator.ts:91-94`).
- Contribution periods April–September and October–March; coverage decided at the start of the period (or on joining,
  from the package) and kept to its end even if pay rises (`runs.service.ts:1003-1015`). Overtime is outside the
  coverage test (the package has no overtime) and inside the contribution wage when the component says so.

Professional tax
- Slabs and months match the doc for Maharashtra (men and women, February 300), Karnataka (25,000, February 300),
  Telangana, Andhra Pradesh, Gujarat, West Bengal (2014 schedule to 30 Sep 2026, new from 1 Oct 2026), Madhya Pradesh
  (2,500 = 208 × 11 + 212 in March; 2,000 = 166 × 11 + 174), Assam (25,000 = 208, answer 2383), Tamil Nadu (slabs;
  August and January from 1 Oct 2026, September and March before).
- The yearly cap of 2,500 per person across the year (`calc.ts:285-287`).
- "No PT" states as explicit empty sets (H8), Odisha none from 1 Apr 2026.

LWF
- Amounts and months match the doc for Maharashtra (25 / 75, June and December), Karnataka (50 / 100, December), Tamil
  Nadu (20 / 40), Telangana (2 / 5), Delhi (0.75 / 2.25), Andhra Pradesh (30 / 70), Gujarat (6 / 12), Punjab and
  Chandigarh (5 / 20 monthly), West Bengal (3 / 30), Odisha (10 / 20, split assumed). Haryana's rate-with-cap evaluator
  is in place (`evaluator.ts:132-133`), data waiting for the CA.

Income tax (TY 2026-27, `packs/in.json` IN.TDS TY2026-27)
- New regime slabs 0–4 L nil, 4–8 L 5 %, 8–12 L 10 %, 12–16 L 15 %, 16–20 L 20 %, 20–24 L 25 %, above 30 %; rebate up to
  60,000 for income up to 12 lakh, with marginal relief just above; standard deduction 75,000.
- Old regime slabs 0–2.5 L nil, 2.5–5 L 5 %, 5–10 L 20 %, above 30 %; senior 3 L and super senior 5 L; rebate 12,500 up
  to 5 lakh (no marginal relief, right); standard deduction 50,000.
- Surcharge rates 10 / 15 / 25 %, and 37 % above 5 crore in the old regime only (the new regime stops at 25 %); cess 4 %.
- Professional tax deducted from income only in the old regime (`tax.ts:114`); taxable income rounded to ₹10
  (`tax.ts:123`); no rebate for non-residents; no PAN: the higher of the slab tax and 20 % (`tax.ts:126-131`).
- HRA month by month (least of the three, `evaluator.ts:366-371`); 80C 1.5 lakh, 80CCD(1B) 50,000, 80D caps, 24(b)
  2 lakh (old regime only); only employer NPS allowed in the new regime (but see F2).

Gratuity
- 15 days per year on 26 days of the last wage, part year over six months counted, five years' service (one year for
  fixed-term under the SS Code from 21 Nov 2025), no minimum on death, cap 20 lakh (`evaluator.ts:238-264`;
  IN.SS-CODE). Tax exemption cap 20 lakh, leave encashment 25 lakh, retrenchment 5 lakh (`packs/in-exit.json`).

Bonus
- Eligibility up to 21,000 a month; calculated on the lower of the wage and the higher of 7,000 and the minimum wage;
  rate 8.33 % to 20 % (`evaluator.ts:228-236`; IN.BONUS 2025-v2 from 21 Nov 2025, citing the Code on Wages). Matches
  doc 3.1 and checklist 42 / 44 (formula still for the CA).

Code wage (50 % rule)
- Exclusions above 50 % of total pay are added back to the PF, ESI, gratuity and bonus wage (`evaluator.ts:213-220`,
  `calc.ts:214-217`). Which components count is the company's component set-up (checklist 45).

Rounding
- Earnings per component (none, rupee, up to the rupee), PF to the nearest rupee, ESI up, PT and LWF whole amounts,
  monthly TDS to the rupee, net pay to the rupee when the company chooses (`calc.ts:14-15, 412-416`).

## Needs a CA's confirmation

1. R2: the PF ceiling for a part month (full monthly ceiling, as this review expects).
2. R4: Maharashtra PT for transgender and non-binary employees, and for "prefer not to say".
3. R5 / R6: international workers' EPS, and the higher-pension EPS base and arrears.
4. F2: the employer NPS cap for TY 2026-27 under the 2025 Act (14 % in both regimes?) and its section (checklist 50).
5. The PF ceiling change in the middle of September 2026: the code uses 25,000 for the whole September wage month (the
   rule in force on the last day). Splitting the month would give, for basic 30,000: 15,000 × 16/30 + 25,000 × 14/30 =
   19,667, PF 2,360 instead of 3,000. Checklist 46 asks for the effective date; also EDLI (still 15,000) and admin.
6. M4: what the minimum-wage comparison uses (wages under the Code, or gross), and the national floor (178 a day, 2019;
   checklist 49).
7. M5 / M6: part half-years in Tamil Nadu and part years or pay changes in Madhya Pradesh.
8. M8: rounding of TDS to ₹10.
9. Everything still open on the CA checklist (items 1–56); this review found no figure in the packs that contradicts the
   research document where the code has a set, except those listed above.

## Fixes (26 Nov 2026, founder answer 2730)

Fixed on `review/yukthix-statutory`, one commit each, each with its review test passing and a negative test:

- **R1** PF admin charges on the wage PF is paid on (`acdf70a04`).
- **R3** no employee ESI at or below Rs 176 a day over the days paid; the employer still pays (`dde2648b0`).
- **R7** surcharge marginal relief at each threshold (`37cf0fd4d`, typed in `c3b927e41`).
- **F1** the PF challan's admin charges are at least Rs 500 (`808c2c93c`; the ECR summary carries `adminCharges`).
- **M5 / M6** Tamil Nadu half-yearly and Madhya Pradesh yearly PT on the actual income so far plus the months left; an
  unchanged MP year stays 208 x 11 + 212 (`50d64a3ef`).
- **M7** employer PF, pension and NPS above Rs 7.5 lakh a year is taxable (`df7b297c9`; new rule set IN.RETIRE-CAP,
  migration 771). The accretion on the excess is not worked out.
- **M3** Tamil Nadu LWF only for people employed 30 days or more (`d1159805e`; IN.LWF IN-TN 2026-v2, migration 772).
  Not done: the managers and supervisors above 15,000 (Tamil Nadu) and the supervisors above 2,500 (Delhi): the person
  record has no role for "manager or supervisor" to test against.
- **M2** needed no change: the annual bonus already pays at least Rs 100 (`apps/api/src/payroll/bonus.ts:177`); only the
  monthly provision has no floor, and the provision is not money paid.

Waiting for the CA (tests skipped, 2730): R2, R4, R5 / R6, F2 (R8), the September 2026 PF ceiling split, the minimum-wage
comparison, M8 and M1.
