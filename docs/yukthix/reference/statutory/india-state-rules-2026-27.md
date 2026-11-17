# India state statutory payroll rules, FY 2026-27 (research)

> **Research for builders and the CA; not legal advice; every value must be checked by a CA before go-live.**

- Researched: 17 Nov 2026. Rules in force for FY / tax year 2026-27 where found.
- Confidence labels: **official-confirmed** (read on a government site or gazette), **secondary-only** (payroll-vendor or consultancy pages only; marked "secondary"), **CONFLICT – CA to check** (sources disagree), **not found**.
- Where an official page could not be opened (several government hosts return HTTP 403 to automated readers), the label says "official (search snippet)": the figure came from the official document's indexed text, but the full document was not read.
- YukthiX files compared (read only): `apps/api/src/statutory/packs/in.json` (IN.PT, IN.LWF, IN.PF, IN.BONUS, crosswalk), `packs/in-dues.json` (PT / LWF due dates), `packs/in-tax.json` (IN.TAXDED), `packs/in-min-wages.json`. **Every YukthiX state PT, LWF and calendar set is marked `verify: true`** (only the national IN.PT cap and IN.WAGES-CODE are `verify: false`).
- All amounts are rupees. "pm" = per month, "HY" = per half-year, "pa" = per year.

Main secondary sources used as cross-checks (each "secondary"):
S1 https://hrms.verdeshell.com/guides/professional-tax-slabs-by-state ·
S2 https://www.tankhapay.com/blog/state-wise-professional-tax-slabs/ ·
S3 https://hrone.cloud/blog/professional-tax-slab-rates-2026-27/ (unreliable: contradicts official sources on KA, GJ, TN, KL) ·
S4 https://taxguru.in/corporate-law/labour-welfare-fund-2026-payroll-months-amounts-change-state.html ·
S5 https://hrengage.ai/compliance/lwf

---

## Section 1 – Professional Tax (PT)

National cap: Constitution art. 276(2), at most 2,500 pa per person. YukthiX has this (IN.PT, `verify: false`) – MATCH.

### 1.1 States and UTs that levy PT

| # | State | Basis / deduction | Slabs (salary → PT) | Special month / gender | Registration, return, due date | Source(s), date / notification | Confidence | YukthiX |
|---|---|---|---|---|---|---|---|---|
| 1 | Maharashtra | Monthly | **Men:** ≤7,500 nil; 7,501–10,000 = 175 pm; >10,000 = 200 pm. **Women:** ≤25,000 nil; >25,000 = 200 pm | Feb = 300 in the top band (year = 2,500). Women's exemption to 25,000 | Monthly return-cum-challan by last day of the month (larger employers; smaller ones less often – rule 11). A notification of 28 Feb 2026 amends PT Rule 11(3): text not read | Official rate schedule "updated up to 31.03.2025", women's slab and Feb 300 from 1 Apr 2023: https://www.mahagst.gov.in/public/uploads/menufiles/PT%20Rate%20Schedule%20updated%20upto%2031.03.2025%20(1)%20(1).pdf ; notifications list https://www.mahagst.gov.in/mr/profession-tax-and-allied-acts-notifications . Men's slabs: S1 (secondary) | official-confirmed (women, Feb); men's slab secondary | **HAS – MATCH** (IN-MH 2023-v1). Due date: HAS (last day) – MATCH; 28 Feb 2026 rule change not reflected – CA to check |
| 2 | Karnataka | Monthly | <25,000 nil; ≥25,000 = 200 pm | Feb = 300 (from 1 Apr 2025, Karnataka Act 33 of 2025 per secondary). No gender rule | Monthly; paid by 20th of next month (secondary) | S1, S2; https://www.sgcms.com/regulatory-updates/amendment-in-karnataka-professional-tax-april-2025/ (secondary). S3 shows an old 150 band – discard | secondary-only | **HAS – MATCH** (IN-KA 2025-v1; due 20th next month MATCH) |
| 3 | Andhra Pradesh | Monthly | ≤15,000 nil; 15,001–20,000 = 150; >20,000 = 200 | None | Monthly; due date not found officially (S3 says 10th, secondary) | Official First Schedule, AP PT Act 1987: https://apct.gov.in/apportal/AllActs/APPT/APPTSchedule.aspx | official-confirmed (slabs); due date secondary | **MISSING** |
| 4 | Telangana | Monthly | ≤15,000 nil; 15,001–20,000 = 150 pm; >20,000 = 200 pm | None. Max 2,500 pa | Monthly return; pay by 10th of next month | Official schedule https://www.tgct.gov.in/tgportal/AllActs/APPT/APPTSchedule.aspx ; FAQ https://www.tgct.gov.in/tgportal/faqs/FAQsProfessionTax.doc | official-confirmed | **HAS – MATCH** (IN-TS; due 10th MATCH) |
| 5 | Tamil Nadu (Greater Chennai Corporation; other local bodies set their own rates) | **Half-yearly** (Apr–Sep, Oct–Mar), on half-year gross | ≤21,000 nil; 21,001–30,000 = 180; 30,001–45,000 = 425; 45,001–60,000 = 930; 60,001–75,000 = 1,025; >75,000 = 1,250 (per HY, rates "II/2024-25") | **Deducted from August and January pay bills** (TN Urban Local Bodies Rules 2023, r.277(2)) | August deduction remitted by **30 Sep** with Form 14 (r.277(3)); January remittance date not stated in the release | Official: GCC Revenue Dept press release R.D. PT C.No/3555/2026 dated 04.08.2026: https://chennaicorporation.gov.in/gcc/pdf/PT_Press_Release.pdf | official-confirmed | **HAS – DIFFERENT**: slabs MATCH; YukthiX `deductMonths: [9, 3]` vs official **[8, 1]**; YukthiX due "end of the deduction month" vs official Aug deduction due 30 Sep. Other TN local bodies not modelled |
| 6 | Kerala | Half-yearly (local bodies) | Revised from 1 Oct 2024 (G.O. 1149/2024/LSGD, 27 Jun 2024): ≤11,999 nil; 12,000–17,999 = 320; 18,000–29,999 = 450; 30,000–44,999 = 600; 45,000–99,999 = 750; 1,00,000–1,24,999 = 1,000; ≥1,25,000 = 1,250 (per HY) | None | Half-yearly; S2 says by end Aug and end Feb | S1, S2 (secondary). S3 gives a different, older ladder (120/180/300/450/600/750/1,000/1,250) | **CONFLICT – CA to check** (upper bands) | **MISSING** |
| 7 | West Bengal | Monthly | **Up to 30 Sep 2026** (schedule w.e.f. 1 Apr 2014): ≤10,000 nil; 10,001–15,000 = 110; 15,001–25,000 = 130; 25,001–40,000 = 150; >40,000 = 200. **From 1 Oct 2026**: ≤20,000 nil; 20,001–30,000 = 100; 30,001–50,000 = 140; 50,001–1,00,000 = 170; >1,00,000 = 208 (max 2,496 pa) | None | Pay within 21 days of month end; annual return by 30 Apr (S2, secondary) | Old schedule (official): https://comtax.wb.gov.in/Ptax-Schedule-New_(w.e.f._1-4-2014).pdf . New schedule: Act amended by notification 756-L of 07.08.2026; draft schedule 1407-F.T. of 18.08.2026; final notification number disputed (one source: 1607-F.T. of 16.09.2026): https://www.sgcms.com/regulatory-updates/west-bengal-overhauls-professional-tax-new-schedule-notified/ (secondary) | new slabs secondary-only; **notification number CONFLICT – CA to check** | **MISSING** (both schedules) |
| 8 | Gujarat | Monthly | ≤12,000 nil; >12,000 = 200 pm | None | Monthly, within 15 days of month end; ≤20 staff may file annually (S2, secondary) | Official rate sheet: https://commercialtax.gujarat.gov.in/vatwebsite/download/schedule/Rate_of_Profession_Tax.pdf | official-confirmed (slabs); due date secondary | **MISSING** |
| 9 | Madhya Pradesh | **Annual** liability, deducted monthly | Annual salary ≤2,25,000 nil; 2,25,001–3,00,000 = 1,500; 3,00,001–4,00,000 = 2,000; >4,00,000 = 2,500 | Instalments: 2,000 = 166×11 + 174; 2,500 = 208×11 + 212 | Monthly return; within 10 days of month end (S2) | Nil band 2,25,000 official: https://mptax.mp.gov.in/mpvatweb/download/home/MPCTD_Registration_Checklist&_Rates.pdf (search snippet); other bands S1, S2 (secondary) | secondary-only (nil band official) | **MISSING** |
| 10 | Assam | Monthly | ≤15,000 nil; 15,001–24,999 = 180; ≥25,000 = 208 (from 1 Apr 2025, eCF No. 169350/124) | None | not found | https://ascent-hr.com/notification/revised-professional-tax-slabs-for-the-salaried-class/ ; greytHR https://product-updates.greythr.com/en/revised-assam-professional-tax-slabs-applicable-from-april-2025-GP8quctV (secondary) | secondary-only; boundary at exactly 25,000 **CONFLICT – CA to check** | **MISSING** |
| 11 | Bihar | Annual | ≤3,00,000 nil; 3,00,001–5,00,000 = 1,000; 5,00,001–10,00,000 = 2,000; >10,00,000 = 2,500 | Deducted in September (S2) | Deposit by 15 Nov; statement by 30 Nov (S2) | S1, S2 (secondary). S3 says "suspended" | **CONFLICT – CA to check** | **MISSING** |
| 12 | Jharkhand | Annual | ≤3,00,000 nil; 3,00,001–5,00,000 = 1,200; 5,00,001–8,00,000 = 1,800; 8,00,001–10,00,000 = 2,100; >10,00,000 = 2,500 | — | Quarterly: 15 May, 15 Aug, 15 Nov, 15 Feb (S2) | S1 (secondary); S2 could not confirm the figures | secondary-only | **MISSING** |
| 13 | Manipur | Annual | S1: ≤1,00,000 nil; 1,00,001–2,00,000 = 1,800; >2,00,000 = 2,500 (Gazette No. 431, 6 Mar 2020, from 1 Apr 2020). S2: nil to 50,000, bands 1,200–2,500 | — | not found | S1, S2 (secondary) | **CONFLICT – CA to check** | **MISSING** |
| 14 | Mizoram | Monthly | ≤5,000 nil; 5,001–8,000 = 75; 8,001–10,000 = 120; 10,001–12,000 = 150; 12,001–15,000 = 180; 15,001–20,000 = 195; >20,000 = 208 (schedule 11 Jul 2024) | — | not found | S1, S2 (secondary, agree) | secondary-only | **MISSING** |
| 15 | Nagaland | Monthly | <4,000 nil; 4,000–4,999 = 35; 5,000–6,999 = 75; 7,000–8,999 = 110; 9,000–11,999 = 180; ≥12,000 = 208 | — | not found | S1 (public notice Sept 2025). S2: notice dated Feb 2022, unconfirmed. S3 lists Nagaland as no-PT | **CONFLICT – CA to check** | **MISSING** |
| 16 | Tripura | Monthly | S1: ≤7,500 nil; 7,501–15,000 = 150; >15,000 = 208 | — | not found | S1; S2 says current rates unconfirmed (secondary) | **CONFLICT – CA to check** | **MISSING** |
| 17 | Sikkim | Monthly | ≤20,000 nil; 20,001–30,000 = 125; 30,001–40,000 = 150; >40,000 = 200 | — | not found | S1 (secondary); S2 could not confirm | secondary-only | **MISSING** |
| 18 | Meghalaya | Monthly (S3) | not found (schedule moved out of the Act in 2022; rates in a separate notification) | — | not found | S1, S2 both say current rates not confirmed | not found | **MISSING** |
| 19 | Puducherry | Half-yearly (maximum rates; councils may charge less) | ≤99,999 nil; 1,00,000–2,00,000 = 250; 2,00,001–3,00,000 = 500; 3,00,001–4,00,000 = 750; 4,00,001–5,00,000 = 1,000; >5,00,000 = 1,250 (per HY) | — | not found | S1, S2 (secondary, agree); S3 says monthly | secondary-only | **MISSING** |
| 20 | Punjab | Monthly | Not a PT schedule: **State Development Tax** 200 pm on persons whose income is above the income-tax exemption limit (Punjab State Development Tax Act 2018) | — | Monthly return (S2) | S1, S2 (secondary) | secondary-only | **MISSING** |
| 21 | Odisha | **None from 1 Apr 2026** | PT Act 2000 repealed by Odisha Ordinance 02 of 2026 (promulgated 21 Apr 2026, effect 1 Apr 2026); dues to Mar 2026 still payable | — | Old liabilities only | https://www.scconline.com/blog/post/2026/04/23/odisha-repeals-levy-of-professional-tax-effective-from-1-april-2026/ ; https://www.sgcms.com/regulatory-updates/odisha-abolishes-professional-tax/ (secondary). Ordinance – check it was replaced by an Act | secondary-only | **MISSING** (needs an explicit "no PT from 1 Apr 2026" set plus the pre-April schedule for arrears) |
| 22 | Chhattisgarh | — | S1: exempt for everyone since 1 Apr 2011. S3: levies, entry above 12,500, max 208 | — | — | S1, S3 (secondary) | **CONFLICT – CA to check** | **MISSING** |
| 23 | Goa | — | S3: levies, entry above 15,000, max 200. S2: no PT | — | — | S2, S3 (secondary) | **CONFLICT – CA to check** | **MISSING** |

### 1.2 States and UTs with no PT on salaries

Delhi, Haryana, Uttar Pradesh, Rajasthan, Uttarakhand, Himachal Pradesh, Arunachal Pradesh, Jammu & Kashmir, Chandigarh (S2, S3; secondary-only). Odisha from 1 Apr 2026 (row 21). Not confirmed either way: Ladakh, Andaman & Nicobar, Lakshadweep, Dadra & Nagar Haveli and Daman & Diu.

YukthiX: has Delhi as an explicit "no PT" set (IN-DL, empty slabs) – MATCH. No other no-PT states are recorded.

---

## Section 2 – Labour Welfare Fund (LWF)

| # | State | Employee | Employer | Frequency / deduction months | Wage ceiling / eligibility | Due date | Source(s), date / notification | Confidence | YukthiX |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Maharashtra | 25 per HY | 75 per HY (3× employee) | Half-yearly; on the register on 30 Jun and 31 Dec | Act text has no wage band. Older Board forms show 6/18 and 12/36 with a 3,000 band (superseded) | Before 15 Jul and 15 Jan | Official MLWF Act 1953 s.6BB(2)-(3), substituted by MGG Ext. No. 41 dated 18.3.2024: https://mlwb.in/react-static-files/pdf/homepage/Quick-Links/MLWB-Fund-Act-and-Rules-english-version.pdf | official-confirmed | **HAS – MATCH** on amounts and due dates; YukthiX `validFrom 2019-06-01` vs official text dated 18.3.2024 – CA to check the start date |
| 2 | Karnataka | 50 pa | 100 pa (plus State 50) | Yearly, calendar year (December) | Coverage threshold reportedly cut to 10+ employees from 7 Jan 2026 (Karnataka Act 05 of 2026?) – unconfirmed | **15 Jan** (CY 2025 due 15-01-2026: official) | Due date official: https://klwb.karnataka.gov.in/48/payment-of-contribution-for-the-calander-year-2025-press-note/en . Amounts: greytHR https://greythr.freshdesk.com/support/solutions/articles/1060000148594 , S5 (secondary). Start date: 10 Jan 2025 or CY 2025 per secondary | amounts secondary-only; start date **CONFLICT – CA to check** | **HAS – MATCH** on 50/100 and 15 Jan; YukthiX `validFrom 2024-01-01` vs secondary 2025 – CA to check |
| 3 | Tamil Nadu | 20 pa | 40 pa (plus Govt 20) | Yearly, December | 30+ days' employment; excludes managers, supervisors above 15,000 pm, apprentices, part-time (S4) | 31 Jan (S4, secondary) | Official Board table, G.O. No. 161 dated 02.12.2022: https://www.lwb.tn.gov.in/about.php | official-confirmed (amounts); due date secondary | **HAS – MATCH** (validFrom 2021-01-01 vs G.O. of 2 Dec 2022 – CA to check start date) |
| 4 | Telangana | 2 pa | 5 pa | Yearly | — | not found officially (secondary: 31 Jan) | Official Act s.10: https://labour.telangana.gov.in/content/ActsRules/TELANGANA%20LABOUR%20WELFARE%20FUND%20ACT,%201987.htm | official-confirmed (amounts) | **HAS – MATCH** |
| 5 | Andhra Pradesh | 30 pa | 70 pa | Yearly, December pay | — | 31 Jan (secondary) | S5; https://www.incorpx.io/blog/labour-welfare-fund-state-wise-rates-due-dates (secondary). One outlier lists 10/30 | secondary-only | **MISSING** |
| 6 | Delhi | 0.75 per HY | 2.25 per HY (Govt 1.50) | Half-yearly; 30 Jun and 31 Dec | 5+ persons; excludes supervisors above 2,500 pm | 15 Jul and 15 Jan | S5; https://www.vayasyaseva.com/en-in/labour-welfare-fund/delhi (secondary). One site claims an employer minimum of 2,500 per HY from 2026 – unconfirmed | secondary-only | **HAS – MATCH** (IN-DL; due 15th next month MATCH) |
| 7 | Gujarat | 6 per HY | 12 per HY | Half-yearly; June and December | 10+ employees (S); one source says only wages up to 15,000 pm – unconfirmed | 15 Jul and 15 Jan | S5; https://digiliance.in/labour-welfare-fund (secondary) | secondary-only | **MISSING** |
| 8 | Haryana | 0.2% of wages, max **35 pm** (from 1 Jan 2026) | 2× employee (max 70 pm) | Monthly deduction, paid yearly | Factories; shops with 10+ employees | 31 Dec (official FAQ / highlights) | Official highlights page still says max **31 pm**: https://hrylabour.gov.in/content/highlights ; notice of 07-03-2025 raised the s.9A limit from 1 Jan 2025 (amount not read). 35 pm: S4 (Board notification 8 May 2026, Gazette 11 May 2026; secondary) | **CONFLICT – CA to check** (31 / 34 / 35) | **MISSING** |
| 9 | Punjab | 5 pm | 20 pm | Monthly deduction (last day of month), remitted half-yearly | — | 15 Oct (Apr–Sep), 15 Apr (Oct–Mar) | https://digiliance.in/labour-welfare-fund ; S5 (secondary) | secondary-only | **MISSING** |
| 10 | Chandigarh | 5 pm | 20 pm | Monthly, remitted half-yearly | Factories, shops, establishments | 15 Oct and 15 Apr | S4 (Punjab LWF Act 1965 s.9A(2) as extended; secondary) | secondary-only | **MISSING** |
| 11 | West Bengal | 3 per HY | 30 per HY | Half-yearly; register on 30 Jun and 31 Dec | Employees on the register at period end | Before 15 Jul and 15 Jan | S4 (Notification Labr/576641/2024, in force 1 Jan 2024; WBLWF Act 1974 s.9(3); secondary) | secondary-only | **MISSING** |
| 12 | Odisha | 20 pa (10 per HY?) | 40 pa (20 per HY?) | Half-yearly; 30 Jun and 31 Dec | 20+ persons; 30 days in 12 months; excludes managers, apprentices, part-time | Before 15 Jul and 15 Jan (Form F) | S4 (Odisha LWF Rules 2015 r.6; secondary). Split per HY not stated in the rule | secondary-only; HY split **CA to check** | **MISSING** |
| 13 | Goa | S4: 10 per HY / S5: 60 per HY | S4: 30 per HY / S5: 180 per HY | Half-yearly (Jan–Jun, Jul–Dec) | not found | 31 Jul and 31 Jan (S4) | S4, S5 (secondary) | **CONFLICT – CA to check** | **MISSING** |
| 14 | Madhya Pradesh | 10 per HY | 30 total or 50 per HY (min 2,500 per establishment from 30 Jan 2026?) | Half-yearly; June and December | not found | 15 Jul and 15 Jan | S5; digiliance; others (secondary, disagree) | **CONFLICT – CA to check** | **MISSING** |
| 15 | Chhattisgarh | 15 per HY (S5) or 100 (other) | 45 per HY (S5) or 100 (other) | Half-yearly (S5) or monthly | not found | not found | S5 and another vendor (secondary, disagree) | **CONFLICT – CA to check** | **MISSING** |
| 16 | Kerala | Several separate Acts/boards by industry; shops & commercial: 50 pm employee and 50 pm employer (S5); other establishments 45 per HY | — | Monthly (shops) / half-yearly (others) | Depends on the board | not found | S5 (secondary) | secondary-only (needs a per-board study) | **MISSING** |

**States / UTs with no LWF** (not on any 16-state list; not officially confirmed – secondary-only): Rajasthan, Uttar Pradesh, Bihar, Jharkhand, Uttarakhand, Himachal Pradesh, Jammu & Kashmir, Assam and the other North-Eastern states, Puducherry and the remaining UTs. Mizoram does not appear on any list.

---

## Section 3 – Bonus and minimum wages

### 3.1 Statutory bonus

| Item | Value | Source | Confidence | YukthiX |
|---|---|---|---|---|
| Law in force | Bonus is now under the **Code on Wages 2019, Chapter IV (s.26 onwards)**, in force 21 Nov 2025; Payment of Bonus Act 1965 is subsumed | PIB / MoLE (see Section 4) | official-confirmed | IN.BONUS is tagged `OLD-ACT`, validFrom 2015 – **DIFFERENT (citation only)** |
| Eligibility ceiling | Wages not above **21,000 pm** – S.O. 4711(E) dated 25 Aug 2026 under s.26(1), deemed in force from 21 Nov 2025 | Gazette copy https://egazette.gov.in/WriteReadData/2026/275747.pdf and MoLE copy https://www.labour.gov.in/static/uploads/2026/09/3977906b27b1b53b9b98c245091b0726.pdf (search snippet); https://teamleaseregtech.com/updates/article/59059/ (secondary) | official (search snippet) | `eligibilityWage 21000` – **MATCH** |
| Calculation ceiling | Where wage exceeds **7,000 pm**, bonus is calculated on 7,000 or the minimum wage fixed by the appropriate government, whichever is higher – S.O. 4710(E) dated 25 Aug 2026 under s.26(2) | Same gazette set (snippet cut off before the full formula); formula wording from secondary pages | official (number/date); exact formula **CA to check** | `calculationCeiling 7000` – MATCH; YukthiX must still take max(7,000, applicable minimum wage) – CA to check that the code does this |
| Rates | Min 8.33% or 100, whichever higher (30 days' work); max 20% | Code on Wages s.26 per PIB backgrounder https://www.pib.gov.in/PressReleasePage.aspx?PRID=2193095 | official (search snippet) | minRate 0.0833 / maxRate 0.2 – MATCH (the 100 floor is not in the pack – CA to check) |

### 3.2 Minimum wages: where to find them (do not list every schedule)

Minimum wages are notified per state, per scheduled employment, per zone and skill, and most states revise the variable DA in April and October. Use the state labour department's latest notification.

| State | Authority / source | Example: shops & commercial, unskilled, top zone | Confidence | YukthiX |
|---|---|---|---|---|
| Central sphere | Chief Labour Commissioner (Central) | Area A unskilled 840/day from 1 Oct 2026 (= 21,840 pm at 26 days) – secondary only | secondary-only | not held |
| Karnataka | Labour Department, https://karmikaspandana.karnataka.gov.in (notification KAE 20 LMW 2017 + VDA 2026-27) | Zone 1 unskilled 11,587.83 basic + 4,549.20 VDA = **16,137.03 pm** (1 Apr 2026 – 31 Mar 2027) | official (from YukthiX's own sourced pack) | HAS (IN-KA KA-SHOPS-2026-27) |
| Tamil Nadu | Labour Welfare & Skill Development Dept, https://labour.tn.gov.in (G.O.(2D) No.65, 20 Aug 2024) | Zone A class 5 basic 6,691 pm + yearly DA (DA figure not held) | official (YukthiX pack) | HAS (basic only; DA missing) |
| Maharashtra | Labour Commissioner, https://labour.maharashtra.gov.in | Zone I unskilled 10,021 basic + 4,134 special allowance = **14,155 pm** (1 Jul – 31 Dec 2026, notified ~5 Aug 2026) | secondary-only (https://www.sgcms.com/regulatory-updates/minimum-rate-of-wages-maharashtra-august-2026/) | MISSING |
| Delhi | Labour Department, GNCT Delhi | Last confirmed order 1 Apr 2025: unskilled 18,456 pm (710/day). Oct 2026 figures on vendor sites (19,846 / 20,358) unverified; a fake Oct 2025 order circulated | **CONFLICT – CA to check** | MISSING |
| Haryana | Labour Department, https://hrylabour.gov.in | Unskilled **15,220.71 pm** (585.41/day) from 1 Apr 2026, Notification No. 2/25/26-2 Lab of 9 Apr 2026, under Code on Wages s.8(3) | secondary-only | MISSING |
| West Bengal | Labour Commissionerate, https://lc.wb.gov.in/synopsys/January/2026 (synopsis of rates as on Jan 2026) | not extracted | official source found, value not read | MISSING |
| Telangana | Labour Department, https://labour.telangana.gov.in | not found | not found | MISSING |
| Andhra Pradesh | Labour Department, http://labour.ap.gov.in/ELabour/Views/MinimumWagesSchedule74.aspx | not found | not found | MISSING |
| Gujarat | Labour & Employment Dept (URL not found) | not found | not found | MISSING |
| Uttar Pradesh | Labour Department, uplabour.gov.in (YukthiX found only VDA orders to early 2025) | not found | not found | MISSING (listed in YukthiX `missing`) |

---

## Section 4 – Labour codes status (as of Nov 2026)

| Item | Finding | Source | Confidence | YukthiX |
|---|---|---|---|---|
| Commencement | All four codes (Wages, IR, Social Security, OSH) in force from **21 Nov 2025**; existing Acts' rules, schemes and notifications continue during transition | PIB PRID 2192463 https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2192463 ; MoLE Annual Report 2025-26 https://www.labour.gov.in/static/uploads/2026/06/4b7ec0e8206aa4860576d6f75b432e97.pdf (search snippets) | official (search snippet) | IN.WAGES-CODE / IN.SS-CODE from 2025-11-21 – MATCH |
| Central rules | Final central rules notified **8 May 2026**: Code on Wages (Central) Rules G.S.R. 343(E); SS Code (Central) Rules G.S.R. 344(E); IR G.S.R. 342(E); OSH G.S.R. 345(E). State rules: many still in draft late 2026 | PRS https://prsindia.org/policy/monthly-policy-review/may-2026 ; https://prsindia.org/billtrack/code-on-wages-central-rules-2026 | secondary (PRS, citing gazette) | not recorded |
| Wages definition (50% rule) | Wages = basic + DA + retaining allowance. If excluded payments exceed 50% of total remuneration, the excess is added back to wages. MoLE FAQ: overtime counts in the 50% test; for the 50% test only statutory items such as employer PF/pension and statutory bonus are counted; gratuity, ESI and other retirement benefits are not | Code on Wages s.2(y); MoLE FAQ compilation (as on 25.10.2026) https://www.labour.gov.in/static/uploads/2026/11/da640b1558a315e81e22ce5ac12f463f.pdf and Additional FAQs (16.03.2026) https://www.labour.gov.in/static/uploads/2026/03/a4ccf4c6d97c4f1f36a6d83f8c64213d.pdf (search snippets; PDFs return 403 to the reader) | official (search snippet); FAQ wording **CA to check** | IN.WAGES-CODE `exclusionLimit 0.5` – MATCH; which items count in the 50% test – CA to check against the evaluator |
| Bonus | Under Code on Wages; ceilings 21,000 / 7,000 notified Aug 2026 (Section 3.1) | as above | official (search snippet) | see 3.1 |
| **PF wage ceiling** | **Raised from 15,000 to 25,000 pm**, notified in the Gazette on **17 Sep 2026** (S.O. 5109(E)) under the SS Code; EPS employer max rises from 1,250 to 2,083 pm; about 51 lakh more workers covered | PIB: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2310973 , https://www.pib.gov.in/PressReleasePage.aspx?PRID=2313829 ; MoLE https://www.labour.gov.in/static/uploads/2026/09/4f607a88c5342aeb980c6b999997caab.pdf (search snippets) | official (search snippet); EDLI / admin-charge ceilings **not found** | IN.PF `wageCeiling 15000`, `epsCeiling 15000`, `edliCeiling 15000` – **DIFFERENT** |
| ESI wage ceiling | Still 21,000 (25,000 for PwD); MoLE FAQ Oct 2026 says 21,000 is notified under SS Code s.2(26) | ESIC standard note https://esic.gov.in/attachments/publicationfile/Standard_Note_on_Employees_State_Insurance_Scheme_as_on_01_01_2025_English_1757940841.pdf ; MoLE FAQ (snippet) | official (search snippet) | IN.ESI 21,000 / 25,000 – MATCH |
| Gratuity | 15 days' wages per completed year (or part above 6 months), last wages drawn; fixed-term employees after **1 year**; wages per the new definition from 21.11.2025; ceiling 20 lakh unless revised (no revision found) | MoLE FAQ (snippet); SS Code s.53 | official (search snippet); ceiling secondary | IN.SS-CODE (fixedTermMinYears 1, cap 20,00,000) – MATCH |

**One line:** both the Code on Wages and the Code on Social Security are in force since 21 Nov 2025 and their central rules since 8 May 2026; the 50% wage rule drives PF/gratuity bases, bonus ceilings are re-notified at 21,000 / 7,000, and the PF wage ceiling is now 25,000 from 17 Sep 2026.

---

## Section 5 – Income-tax Act 2025: section mapping for payroll

- Act: Income-tax Act, 2025 (No. 30 of 2025), **in force 1 Apr 2026**; "tax year" replaces previous year. Income-tax Rules, 2026: CBDT notification G.S.R. 198(E) dated 20 Mar 2026, in force 1 Apr 2026 (official text read: https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-03/En-Notified-IT-Rules-2026-20-03-2026.pdf ). Salary for FY 2025-26 stays under the 1961 Act.
- Department TDS FAQ (official, read): https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance

| Old (1961 Act / 1962 Rules) | New (2025 Act / 2026 Rules) | Official evidence | Confidence | YukthiX crosswalk / in-tax.json |
|---|---|---|---|---|
| s.192 TDS on salary | **s.392(1)** | TDS FAQ no. 20; Rules 2026 r.204, r.205 | official-confirmed | s.392 – MATCH |
| s.80C (with 80CCE cap) | **s.123 read with Schedule XV** | TDS FAQ no. 21; Form 130 Part B line 10(a) | official-confirmed | TY2026-27 set says "to be confirmed" – can now be filled |
| s.80D | **s.126** | Form 130 Part B 10(d) "health insurance premia under section 126" | official-confirmed (form wording) | not mapped |
| s.80CCD(1B) | **s.124(3)** | Form 130 Part B 10(b) "amount paid/deposited to notified pension scheme under section 124(3)" – old Form 16 used the same wording for 80CCD(1B) | official form wording; mapping inferred – CA to check | not mapped |
| s.80CCD(2) | **s.124(1)(a)** | Form 130 Part B 10(c) "contribution by Employer to pension scheme" | official form wording; mapping inferred – CA to check | not mapped |
| s.80CCD(1) (employee's own NPS within the 1.5 lakh) | inside s.123 (Form 130 10(a) "certain pension funds, notified pension schemes") | Form 130 | official form wording – CA to check | not mapped |
| s.10(13A) HRA (rule 2A) | **s.11 read with Schedule III, Table Sl. No. 11** | Form 130 Part B line 2(b) | official-confirmed (form wording) | not mapped |
| s.10(5) LTA | s.11 read with Schedule III, Sl. No. 8 | Form 130 line 2(a) | official (form wording) | not mapped |
| s.16(ia) standard deduction | **s.19(1), Table Sl. No. 2** (s.19(1) Sl. No. 1 = tax on employment / PT) | Form 130 Part B line 4(b) | official-confirmed | s.19 – MATCH |
| s.89(1) relief | **s.157(1)** | Rules 2026 r.73 | official-confirmed | not mapped |
| Form 10E | **Form No. 39** (to employer under s.392(1), or with return) | Rules 2026 r.73(3)-(4) | official-confirmed | not mapped |
| Form 16 | **Form No. 130** (Parts A, B, C; r.215, s.395(4)); perquisites in Form No. 123 when salary > 1.5 lakh | Rules 2026 r.204(2), r.215 | official-confirmed | Form 130 – MATCH |
| Form 24Q | **Form No. 138** (quarterly statement for s.392) | Rules 2026 r.219 table Sl. 1 | official-confirmed | Form 138 – MATCH |
| Form 12BB | **Form No. 124** (r.205, s.392(5)(b)); landlord PAN when rent > 1 lakh pa and **relationship with landlord** | Rules 2026 r.205 | official-confirmed | not mapped (landlordPanAbove 1 lakh MATCH; relationship field missing) |
| s.87A rebate | YukthiX says s.156 | not found in what was read | **not confirmed** | s.156 – unverified |
| s.201(1A)/234E etc. (penalty set) | s.398 family (default), others not mapped | TDS FAQ 15-16 | partial | IN.PENALTY still cites 1961 sections |

---

## Section 6 – CA checklist (tick each)

PT
1. [ ] Maharashtra men's slabs (7,500 / 10,000) – only secondary seen; and the 28 Feb 2026 amendment to PT Rule 11(3) – effect on due dates.
2. [ ] Karnataka: 25,000 threshold start (2023 or 2025) and Feb 300 (Act 33 of 2025) – secondary only. YukthiX HAS.
3. [ ] Andhra Pradesh due date (10th?) – secondary.
4. [ ] Tamil Nadu: YukthiX deducts Sep/Mar; GCC says **Aug/Jan** (r.277(2) TNULB Rules 2023) – YukthiX DIFFERENT. Confirm January remittance date and how to model non-Chennai local bodies.
5. [ ] Kerala half-yearly slabs (G.O. 1149/2024) – CONFLICT on upper bands.
6. [ ] West Bengal new schedule from 1 Oct 2026 – final notification number (1407-F.T. draft vs 1607-F.T.?) and due dates. YukthiX MISSING.
7. [ ] Gujarat due date and small-employer annual filing – secondary.
8. [ ] Madhya Pradesh bands above 2,25,000 – secondary.
9. [ ] Assam: exact 25,000 boundary (180 or 208).
10. [ ] Bihar – in force or suspended? CONFLICT.
11. [ ] Jharkhand slabs and quarterly dates – secondary.
12. [ ] Manipur slabs – CONFLICT.
13. [ ] Mizoram slabs – secondary.
14. [ ] Nagaland – levies or not, and slabs – CONFLICT.
15. [ ] Tripura slabs – CONFLICT.
16. [ ] Sikkim slabs – secondary.
17. [ ] Meghalaya – rates not found.
18. [ ] Puducherry – half-yearly maximum rates and per-council rates – secondary.
19. [ ] Punjab State Development Tax – treat as PT in payroll? – secondary.
20. [ ] Odisha – repeal ordinance replaced by an Act? arrears handling – secondary.
21. [ ] Chhattisgarh – levies or exempt since 2011? CONFLICT.
22. [ ] Goa – levies or not? CONFLICT.
23. [ ] No-PT list (Delhi, Haryana, UP, Rajasthan, Uttarakhand, HP, Arunachal, J&K, Chandigarh) and the unconfirmed UTs.
24. [ ] All 19 PT rows missing from YukthiX (AP, GJ, WB, KL, MP, AS, BR, JH, MN, MZ, NL, TR, SK, ML, PY, PB, OD, CG, GA – the last two only if they levy).

LWF
25. [ ] Maharashtra: YukthiX validFrom 2019-06-01 vs Act text substituted 18.3.2024.
26. [ ] Karnataka 50/100 amounts and start (CY 2024 vs 2025); 10-employee threshold from 2026 – secondary/CONFLICT.
27. [ ] Tamil Nadu: validFrom (YukthiX 2021) vs G.O. 161 of 2 Dec 2022; 31 Jan due date – secondary.
28. [ ] Telangana due date – not found officially.
29. [ ] Andhra Pradesh 30/70 – secondary. YukthiX MISSING.
30. [ ] Delhi 0.75/2.25 and the claimed 2,500 employer minimum – secondary.
31. [ ] Gujarat 6/12 and any wage ceiling – secondary. MISSING.
32. [ ] Haryana cap 31 / 34 / 35 pm – CONFLICT. MISSING.
33. [ ] Punjab 5/20 pm – secondary. MISSING.
34. [ ] Chandigarh 5/20 pm – secondary. MISSING.
35. [ ] West Bengal 3/30 per HY – secondary. MISSING.
36. [ ] Odisha 20/40 pa and half-year split – secondary. MISSING.
37. [ ] Goa 10/30 vs 60/180 – CONFLICT. MISSING.
38. [ ] Madhya Pradesh employer 30 or 50, and establishment minimum – CONFLICT. MISSING.
39. [ ] Chhattisgarh 15/45 vs 100/100 – CONFLICT. MISSING.
40. [ ] Kerala per-board rules – secondary. MISSING.
41. [ ] "No LWF" list – secondary only.

Bonus, wages, codes
42. [ ] S.O. 4710(E) exact calculation formula (7,000 or minimum wage) and which minimum wage applies (state vs central).
43. [ ] Minimum bonus floor of 100 – not in YukthiX pack.
44. [ ] IN.BONUS still tagged OLD-ACT (2015) – re-cite to Code on Wages s.26 with S.O. 4710(E)/4711(E).
45. [ ] Items counted in the 50% wage test (MoLE FAQ) vs YukthiX evaluator.
46. [ ] **PF wage ceiling 25,000 from 17 Sep 2026 (S.O. 5109(E))** – YukthiX 15,000 DIFFERENT; confirm EPS, EDLI and admin-charge ceilings and the effective date.
47. [ ] Gratuity ceiling still 20 lakh under SS Code – no revision found.
48. [ ] Minimum wages: MH, DL (CONFLICT), HR, WB, TS, AP, GJ, UP not held; TN DA not held.
49. [ ] YukthiX national floor wage 178/day (2019) – check whether a Code on Wages floor wage has been notified.

Income tax
50. [ ] 80CCD(1B) → s.124(3) and 80CCD(2) → s.124(1)(a) – inferred from Form 130 wording.
51. [ ] 80CCD(1) inside s.123 – inferred.
52. [ ] 87A → s.156 (YukthiX) – not confirmed.
53. [ ] IN.PENALTY still cites 1961 sections for TY 2026-27.
54. [ ] Form 124 landlord-relationship field – not in YukthiX.

---

## Section 7 – Builder list for batch H

All new sets go in `apps/api/src/statutory/packs/in.json` (IN.PT / IN.LWF) and `packs/in-dues.json` (IN.CALENDAR), `verify: true`, each with its source URL and golden tests, loaded through the existing two-person console flow. Values from Sections 1–2; build CONFLICT rows only after the CA ticks them.

| # | Change | Size |
|---|---|---|
| H1 | **PF: new IN.PF version from 2026-09-17** with wageCeiling / epsCeiling 25,000 (EDLI and admin ceilings after CA item 46); goldens at 20,000 and 30,000 basic. Check every place that hard-codes 15,000 (`grep -rn 15000 apps/api/src/payroll`) | M **Done 17 Nov 2026** (branch `fix/yukthix-pf-ceiling-tn-pt`): IN.PF 2026-v2 from 2026-09-17, wage and EPS ceilings 25,000, EDLI and admin as before until item 46, `verify: true`; migration `202617z0000401_pf_ceiling_tn_pt`; arrears proposals raised for months already paid on the old ceiling (checked by each payslip's own period end). |
| H2 | **TN PT fix**: `deductMonths` [8, 1]; due date Aug → 30 Sep (and Jan → CA item 4); new version, keep the old one dated | S **Done 17 Nov 2026**: IN.PT IN-TN 2026-v2 and IN.CALENDAR TN-2026-v2 from 2026-10-01 (the Apr–Sep 2026 half-year was already deducted in September); August due 30 Sep, January the end of February until item 4. |
| H3 | **West Bengal PT**: two versions – 2014 schedule to 2026-09-30, new schedule from 2026-10-01; plus calendar (21 days after month end) | M |
| H4 | **Odisha PT**: explicit "no PT" set from 2026-04-01 and the pre-April schedule for arrears | S |
| H5 | PT, official-confirmed: **Andhra Pradesh, Gujarat** slabs + calendars | S |
| H6 | PT, secondary-only, after CA tick: **Madhya Pradesh** (annual liability, 11+1 instalments – needs an `annual` basis in the evaluator), **Assam, Mizoram, Sikkim, Jharkhand (annual, quarterly), Puducherry (half-yearly), Punjab (development tax)** | L |
| H7 | PT, conflicting, after CA tick: **Kerala, Bihar, Manipur, Nagaland, Tripura, Chhattisgarh, Goa, Meghalaya** | M |
| H8 | Explicit "no PT" sets for Haryana, UP, Rajasthan, Uttarakhand, HP, Arunachal, J&K, Chandigarh (like IN-DL) so a location in those states shows "none" instead of "no rule" | S |
| H9 | LWF, secondary-only, after CA tick: **Andhra Pradesh, Gujarat, Punjab, Chandigarh, West Bengal, Odisha** + calendars | M |
| H10 | LWF **Haryana**: percentage-with-cap contribution (0.2%, cap per CA, employer 2×), monthly – needs a `rate`+`cap` LWF kind in the evaluator | M |
| H11 | LWF conflicting, after CA tick: **Goa, Madhya Pradesh, Chhattisgarh**; **Kerala** per-board model | L |
| H12 | Fix LWF `validFrom` for MH (2024-03-18?), KA, TN after CA items 25–27 | S |
| H13 | **IN.BONUS** new CODE version from 2025-11-21 citing S.O. 4710(E) / 4711(E); add the 100 minimum and max(7,000, minimum wage) if the code lacks it | S |
| H14 | **IN.TAXDED TY2026-27**: fill section numbers (123/Sch XV, 126, 124(3), 124(1)(a), 11 + Sch III Sl. 11, 19(1)); crosswalk rows for 89(1)→157(1), Form 10E→39, 12BB→124, 80C/80D; keep 87A→156 flagged unconfirmed | S |
| H15 | Form 124 declaration: add "relationship with landlord" field | S |
| H16 | Minimum wages: Maharashtra (Jul–Dec 2026), Haryana (1 Apr 2026), TN DA, then DL/WB/TS/AP/GJ/UP when sourced | M |
