# India HRMS / Payroll Pricing & Feature Catalog

Compiled 2026-09-27 for YukthiX pricing (reference: $1 ≈ ₹96 per employee per month per product, everything included).
Base: section 4 of `research-india-hrms.md`, re-checked and extended with about 60 searches and fetches (vendor pages fetched directly where possible; JS-hidden prices pulled from page source/JS with curl).

**Conventions**
- All INR figures exclude 18% GST unless noted. PEPM = per employee per month.
- "Date seen" = 2026-09-27 unless another date is given.
- Confidence: **H** = vendor page (including vendor page source/JS); **M** = tracker (indianhrm, techjockey, softwaresuggest, capterra, saasworthy); **L** = competitor blog, IndiaMART, or an inference.
- "not public" = vendor does not publish it and no reliable tracker figure was found. No numbers were invented.
- ⚠ **indianhrm.com is itself an HRMS vendor** ("Indian HRM", ₹39 PEPM), so its comparison pages are competitor content. Its figures are marked M only where a vendor page corroborates them, and L otherwise.

---

## 1. Master table: vendor × plan × price

| Vendor | Plan | List price | Unit | Included seats / minimum | Overage | Billing | Free tier / trial | Setup / lock-in | Source (conf.) |
|---|---|---|---|---|---|---|---|---|---|
| **Keka** | Foundation | base **hidden on vendor page**; trackers ₹9,999/mo (older quotes ₹6,999) | flat base + per emp | base covers 100 | **₹90**/emp | quoted monthly; tracker: quarterly invoicing from signature | Free trial | "Nominal setup fee" (vendor FAQ); tracker ~2% / ~2 months' fee | keka.com/pricing source (H, overage only); indianhrm.com/keka-pricing, 31 Jul 2026 (L); itforsme/ezhrm (L, older) |
| Keka | Strength | trackers ₹12,999/mo (older ₹9,999) | same | 100 | **₹120**/emp | same | trial | same | same |
| Keka | Growth | trackers ₹15,999/mo (older ₹13,999) | same | 100 | **₹150**/emp | same | trial | same | same |
| Keka (US page) | Foundation / Strength / Growth | **$9 / $16 / $22** | PEPM | — | — | — | trial | — | keka.com/us/pricing source (H; the values sit inside HTML comments, so they may be retired) |
| **greytHR** | Starter | ₹0 | — | ≤25 emp | — | — | free: 250 MB, 13 months of payroll history, no biometric/geo, deactivated after 3 idle months | — | greythr freshdesk + trackers (M); not shown on current pricing page |
| greytHR | Essential | **₹2,495/mo** | base + per emp | base = 50 ("whether you have that many or not") | **₹45** | monthly | 7-day trial | 3rd party: impl. ₹10k–50k (L) | greythr.com/pricing (H) |
| greytHR | Growth | **₹4,495/mo** | base + per emp | 50 | **₹85** | monthly | 7-day trial | — | greythr.com/pricing (H) |
| greytHR | Premium | quote ("~30% cheaper than Growth + add-ons") | — | — | — | — | — | — | greythr.com/pricing (H) |
| **Zoho People** | Free | ₹0 | — | ≤5 users (vendor page glitch says "53") | — | — | free forever | — | zoho.com/people/zohopeople-pricing.html (H, features); prices not rendered |
| Zoho People | Essential HR / Professional / Premium / Enterprise | ~₹50–60 / ₹100–120 / ₹165–180 / ₹230–240 (annual); another tracker ₹210/₹420/₹630 | per user/mo | 5-user minimum | per user | monthly or annual (>20% off annual) | 30-day trial | — | indianhrm 6 Aug 2026 (L); itforsme (L). **Conflicting; INR not on vendor HTML** |
| **Zoho Payroll** | Free | ₹0 | — | ≤10 emp | — | — | free forever | — | zoho.com/in/payroll/pricing-comparison (H) |
| Zoho Payroll | Standard | **₹1,000** annual / ₹1,250 monthly | base + per emp | 25 | ₹40 / ₹50 | monthly or annual | trial | **one subscription per legal entity** (L) | same (H) |
| Zoho Payroll | Professional | **₹3,000 / ₹3,750** | base + per emp | 50 | ₹60 / ₹75 | same | trial | — | same (H) |
| Zoho Payroll | Premium | **₹4,000 / ₹5,000** | base + per emp | 50 | ₹80 / ₹100 | same | trial | — | same (H) |
| **HROne** | Startup | not public | — | <50 emp | — | — | — | — | hrone.cloud/pricing (H) |
| HROne | Basic | **₹4,950/mo** | per user with a floor | **50-user minimum** (₹99 effective) | ₹99 | monthly, **billed from go-live** | demo | no setup fee on standard plans; "zero lock-in" but **2-month cancellation notice** | hrone.cloud/pricing (H) |
| HROne | Professional | **₹6,500/mo** | same | 50 min (₹130) | ₹130 | same | — | same | (H) |
| HROne | Enterprise | quote | — | 50+ | — | — | — | implementation fee (unpublished) | (H) |
| **Pocket HRMS** | Standard | **₹2,995/mo** | base + per emp | min 50 | ₹60 | **annual only** | demo | one-time "nominal" implementation fee (unpublished) | pockethrms.com/pricing (H) |
| Pocket HRMS | Professional | **₹4,495/mo** | same | min 50 | ₹90 | annual | — | same | (H) |
| Pocket HRMS | Premium | quote | — | min 100+ | — | — | — | same | (H) |
| **sumHR** | Startup / Basic / Advanced | **₹49 / ₹69 / ₹119** | PEPM | none stated | — | annual | free plan tied to Jupiter salary accounts | one-time setup fee by headcount; no lock-in or cancellation fee; volume discount at 100+ | sumhr.com/pricing-signup (H) |
| sumHR | Enterprise | quote | — | 250+ emp | — | — | — | — | (H) |
| **Zimyo** | Basic / Standard / Enterprise | **₹80 / ₹160 / ₹240** | PEPM | **min billing 50** (₹4k / ₹8k / ₹12k floor) | per emp | not stated | demo | not public | zimyo.com/pricing (H). Corrects the older ₹60/₹120/₹250 tracker figures |
| **Qandle** | Foundation | **₹2,950/mo monthly, ₹2,450/mo annual** (JS) | base | 50-user minimum; "or INR 3000 pm whichever is higher" | — | monthly or annual (25% off annual) | demo | nominal one-time impl. fee; **no lock-in**; unused annual credit not refunded | qandle.com JS `custom-neww_dd.js` (H) |
| Qandle | Regular | **₹99 monthly / ₹79 annual** PEPM (₹4,950 / ₹3,950 at 50) | PEPM | min 50 | per emp | same | — | same | (H) |
| Qandle | Plus | **₹124 / ₹99** PEPM (₹6,200 / ₹4,950 at 50) | PEPM | min 50 | — | same | — | same | (H) |
| Qandle | Premium | **₹160 / ₹129** PEPM (₹8,000 / ₹6,450 at 50) | PEPM | min 50 | — | same | — | same | (H) |
| Qandle | Enterprise | quote | — | >1,000 emp | — | — | — | — | (H) |
| **RazorpayX Payroll** (Opfin now redirects here) | Prime | **₹3,499/mo** | base + per emp | ≤20 emp | ₹150 | annual or semi-annual | **no free tier** | — | razorpay.com/payroll/pricing (H) |
| RazorpayX | Elite | **₹6,499/mo** annual (₹9,499 semi-annual) | base + per emp | 50 incl., cap 100 | ₹150 | annual / semi-annual | — | — | (H) |
| RazorpayX | Enterprise | quote | — | 100+ | — | — | — | — | (H) |
| **factoHR** | Free | ₹0 | — | ≤20 emp (employee data, letters, payslips only) | — | — | free forever | — | factohr.com/pricing (H) |
| factoHR | Core / Premium / Ultimate | **₹4,999 / ₹5,999 / ₹6,999/mo** (USD $125 / $175 / $225) | base + per emp | 50 | **₹99 / ₹119 / ₹139** ($2 / $3 / $4) | billed yearly | — | no cancellation fee or lock-in; remaining annual credit forfeited | (H). indianhrm lists Core at ₹4,499 + ₹89 (L; conflicting) |
| **Kredily** | Free Forever | ₹0 | — | **unlimited emp** (250 MB, 1 leave/attendance rule, 1 salary structure) | — | — | free | — | kredily.com/pricing (H) |
| Kredily | Payroll OS / Professional | **₹1,249 / ₹1,749/mo** | base + per emp | 25 | ₹50 / ₹70 | monthly | — | — | (H) |
| Kredily | Enterprise | quote | — | — | — | — | — | — | (H) |
| **Asanify** | Essential / VIP | **₹99 / ₹199** | PEPM | not stated | — | monthly or annual (2 months free) | 14-day trial | — | asanify.com/pricing (H) |
| Asanify | Enterprise | quote | — | >500 emp | — | annual | — | — | (H) |
| Asanify | EOR India | quote + pass-through | per emp | — | — | — | — | 1-month refundable deposit | (H) |
| **Superworks** | Startup / Professional / Premium | **₹4,000 / ₹5,000 / ₹6,750/mo** | base + per emp | 50 | **₹80 / ₹100 / ₹135** | quarterly (annual saves 15%) | no free plan | — | superworks.com/pricing (H). Techjockey's ₹3,499/4,499/5,999 is older (M) |
| **247HRM** | Professional | **₹8,999/mo** | base | 50 | not public | monthly or annual (15% off) | — | — | 247hrm.com/pricing (H) |
| 247HRM | Shoot / Sapling / Tree (older) | ₹2,499 / ₹3,999 / ₹4,999 | base + per emp | 30 | ₹49 / ₹99 / ₹199 | — | — | — | techjockey (M, likely superseded) |
| **Paybooks** | Essential / Regular / Premium | **₹2,499 / ₹4,999 / ₹9,999/mo** | base (headcount slab not shown) | tracker: 30 / 50 / 50 | not public | monthly | — | — | techjockey (M) |
| **SalaryBox** | Starter | ₹1,500/mo (₹1,350 quarterly) = ₹30/user | per user with a floor | floor implies about 50 users; ≤2 departments/branches | per user | monthly or quarterly (10% off) | — | — | salarybox.in/pricing (H) |
| SalaryBox | Business | ₹3,000/mo (₹2,700 quarterly) = ₹75/user | same | floor implies about 40 users | per user | same | — | — | (H) |
| SalaryBox | Enterprise | quote | — | 200+ staff | — | — | — | — | (H) |
| **PagarBook** | App / App+Web / Classic Suite (with Lens face) | **₹499 / ₹699 / ₹1,398** | per staff **per year** | pay per staff added | — | 1-year or 3-year | attendance marking free | — | search-surfaced pricing (M); vendor page prices JS-rendered and not captured |
| **Saral PayPack** (desktop) | Standard | **₹53,700/yr single user; ₹81,600 multi-user** | per licence per year | 2 companies × 300 emp | — | annual (includes AMC) | — | — | saralpaypack.com/desktop-pricing (H) |
| Saral PayPack | Corporate | **₹1,15,800 / ₹1,41,000/yr** | per licence | 3 companies × 2,000 emp | — | annual | — | — | (H) |
| Saral PayPack | Premium | quote | — | unlimited | — | — | — | — | (H) |
| **TallyPrime** (payroll built into accounting) | Silver / Gold | **₹22,500 / ₹67,500** perpetual; TSS renewal ₹4,500 / ₹13,500 per yr | per licence | single / multi-user | — | one-time + TSS | — | — | Tally partner pages (M) |
| **Darwinbox** | — | not public; trackers ₹200–600 PEPM; ~$5 at 100 emp falling to ~$3 at 1,000 | PEPM, quote | 4 headcount bands | — | 1–3 yr contracts; 3-yr term 12–18% off | — | impl. $5k–50k, 4–9 months | hrone/asanify (competitor, L); softwarefinder (M) |
| **PeopleStrong** | — | not public; ₹80–150 PEPM enterprise; from $3 PUPM at 501–1,000 | quote | enterprise | — | multi-year | — | — | hrone/akrivia/softwarefinder (L–M) |
| **Spine HR** | — | not public; ₹40,500/yr (techjockey); tiers ₹2,450–9,000/mo; iTQlick est. $29/user + $1–5k impl. | quote | — | — | — | no free plan | customisation/training extra (est.) | techjockey (M), others (L) |
| **Akrivia HCM** | — | not public; bills from go-live; no per-entity surcharge (own claim) | quote | — | — | — | demo | — | akriviahcm.com blog (H for the policy only) |
| **HRMantra** | — | not public (cloud subscription or on-prem licence + AMC) | quote | — | — | monthly or annual | demo | — | hrmantra.com guide (H) |
| **uKnowva** | Lite / Full | "Call for pricing"; trackers ₹70–125 PEPM (Full ~₹100–125) | quote | — | — | — | free version + trial (tracker) | — | uknowva.com/hrms-pricing (H: no price); techjockey/softwaresuggest (M) |
| **Beehive HRMS** | — | trackers: from ₹80/user, ₹4,000 minimum (older ₹2,699) | quote | ₹4k floor | — | — | — | — | techjockey/softwaresuggest (M) |
| **ZingHR** | Welcome / Power / Business / Turbo | from ₹60 PEPM ($2 international) | quote | — | — | — | — | training from ~$500 (L) | trackers (M–L) |
| **Mewurk** | Advanced | ~₹2/emp/day ≈ ₹60 PEPM; entry "₹1,500" | PEPM | — | — | — | — | — | mewurk blog (vendor, H-ish) / techjockey (M) |
| **Indian HRM** (runs indianhrm.com) | Foundation | ₹39 PEPM annual / ₹49 monthly | PEPM | min 20 | — | annual or monthly | 3 months free | — | indianhrm.com/pricing (H, own price) |
| **Craze** | — | trackers: ₹60 PEPM, or ₹5,499 for 50 + ₹120 | — | — | — | — | — | — | softwarefinder/sutrahr (L). ⚠ crazehq.com now redirects to craze.ai, an unrelated AI-media product; the India HR product looks **discontinued or pivoted** |
| **Rippling (India)** | — | not public for India; US payroll from $8 PEPM annual | quote | — | — | — | — | — | trackers (L) |
| **Deel (India)** | Contractor / Global Payroll / EOR | **$49** per contractor/mo; **$29** PEPM; **$599+** PEPM (India may carry a +$50–150 surcharge) | PEPM | — | — | monthly or annual | — | — | pin.com, eorhq (M) |
| **ADP India** | — | not public (India quote only) | quote | — | — | — | — | — | search (no India data) |
| **Sage People (India)** | — | not public; vendor site blocked fetch (403); no India-specific offer found | quote | — | — | — | — | — | — |
| **Jibble** (attendance) | Free / Premium / Ultimate | $0 unlimited users / **$3.99** / **$7.99** per user/mo (trackers vary: $2.49–4.49 / $4.99–7.99; INR from ₹37.99) | per user | — | — | monthly or annual | free forever | — | trackers (M); vendor page shows no prices |
| **Truein** (face attendance) | Time Capture | **₹69,000/yr base + ₹250/user/yr** | base + per user | — | — | **annual only** | 14-day trial | — | truein.com/pricing (H) |
| Truein | Advanced | **₹69,000/yr + ₹350/user/yr** | same | — | — | annual | 14-day trial | — | (H) |
| Truein | Enterprise | quote | — | 5,000+ staff | — | — | — | — | (H) |
| **TimeChamp** | Starter | **$3.90/user/mo** | per user | — | — | annual / quarterly / 3-yr | free trial | **impl. + training ₹350/user, minimum ₹6,000** | timechamp.io/pricing (H) |
| TimeChamp | Professional / Enterprise | quote | — | — | — | — | — | same | (H) |
| **SpringVerify** (BGV) | 3 packages | **₹799–1,599 per candidate** | per check package | — | — | pay per use | — | — | g2/softwaresuggest (M) |
| **OnGrid** (BGV) | — | quote; claims packages "< ₹1,000" | per candidate | — | — | — | — | — | tradebrains (L) |

---

## 2. Feature-by-plan tables

Legend: ✓ included · A = paid add-on · — = not in plan · ? = not stated · Q = only in quote tier

### Keka (vendor page, H)
| Area | Foundation | Strength | Growth |
|---|---|---|---|
| Core HR | org, documents/letters, basic onboarding, profiles, standard roles, exit, basic reports | + advanced onboarding, Keka Sign e-sign, travel desk, assets, people analytics, custom roles, exit survey | + workflow automation, custom report builder, headcount planning, pre-boarding |
| Leave / Attendance | leave, gamified attendance, overtime, basic shifts | + **selfie clock-in, continuous location, geofence** | ✓ |
| Payroll + statutory | ✓ (payroll + compliance, per trackers) | ✓ | ✓ |
| Performance | — | — | ✓ OKRs, goals, 360 reviews, feedback, praise |
| Engagement | — | surveys | ✓ |
| SSO | ? | ✓ (ESS SSO listed) | ✓ |
| Recruitment | A (Hire Pro ~₹1,500, Advanced ~₹2,500 per recruiter/mo, L) | A | A |
| Learning | A (Keka Learn ₹60/emp, 50-emp min, L) | A | A |
| PSA / Timesheets | A | A | A |

### greytHR (vendor page, H)
| Area | Starter (free) | Essential | Growth | Premium |
|---|---|---|---|---|
| Core HR, ESS, mobile, NAVOS AI bot | basic | ✓ | ✓ | ✓ |
| Payroll + PF/ESI/PT/LWF/TDS, Form 16 | ✓ (13-month history cap) | ✓ | ✓ | ✓ |
| Leave | ✓ | ✓ unlimited types | ✓ | ✓ |
| Attendance (shifts, OT, geofence) | — (no biometric/geo) | basic | ✓ + geofence, confirmation workflow | ✓ |
| GeoMark+ / Visage (face) | — | — | A | ✓ |
| Onboarding / exit, helpdesk | ? | ✓ | ✓ | ✓ |
| Expense | — | A ₹35 | A ₹35 | ✓ |
| Performance | — | — | A ₹35–45 | ✓ |
| Timesheets | — | — | A ₹35 | ✓ |
| Recruitment | — | A ₹2,500/recruiter | A | A |
| Analytics | — | — | ✓ advanced | ✓ |
| SSO / API / multi-company | — | A (SSO ₹10/emp, API ₹15/emp per tracker) | A | ✓ |
| GPS live tracking | — | — | A ₹140 | A ₹140 |
| Alumni portal | — | A ₹20 | A ₹20 | A |

### Zoho Payroll (vendor comparison page, H)
| Area | Free | Standard | Professional | Premium |
|---|---|---|---|---|
| Income tax, EPF with **ECR**, ESI + returns, PT + returns, LWF | ✓ | ✓ | ✓ | ✓ |
| Statutory bonus | — | ✓ | ✓ | ✓ |
| **Form 16** (with signer), TDS challans | — | — | ✓ | ✓ |
| Contractor payroll, revision letters | — | ✓ | ✓ | ✓ |
| Off-cycle / bonus runs, salary hold, documents | — | — | ✓ | ✓ |
| **Leave & attendance** (LOP, encashment, regularisation, OT) | — | — | — | ✓ only |
| Custom roles, validation rules, **webhooks**, custom functions, approvals | — | — | — | ✓ |
| Direct deposit | HSBC | + ICICI | ✓ | ✓ |
| Support | email | + voice | + voice | + voice |
| Multi-entity | one subscription per entity (L) | | | |

### Zoho People (vendor features H, prices L)
| Area | Free | Essential | Professional | Premium | Enterprise |
|---|---|---|---|---|---|
| Employee DB, time-off, documents | ✓ | ✓ | ✓ | ✓ | ✓ |
| Onboarding / offboarding | — | ✓ | ✓ | ✓ | ✓ |
| Attendance, timesheets, shifts | — | — | ✓ | ✓ | ✓ |
| Performance | — | — | — | ✓ | ✓ |
| LMS, HR helpdesk | — | — | — | — | ✓ |
| India statutory payroll | — (needs Zoho Payroll) | — | — | — | — |

### HROne (H)
| Area | Basic | Professional | Enterprise |
|---|---|---|---|
| Core HR, time office, payroll + statutory, mobile, reports | ✓ | ✓ | ✓ |
| Workforce management, digital letter acknowledgement | — | ✓ | ✓ |
| Recruitment, performance, engagement, expense, assets, helpdesk | — | — | ✓ |
| Support | 24-hr response, unlimited training | same | same |
| Add-ons (quote) | payroll outsourcing, WhatsApp bot, Teams bot, work plan, BI, workforce planning | | |

### Pocket HRMS (H)
| Area | Standard | Professional | Premium |
|---|---|---|---|
| Leave, attendance, **geo-tagging**, payroll, ESS, statutory, HRIS, report wizard | ✓ | ✓ | ✓ |
| **Geofencing**, payslip designer, confirmation, transfer, assets, exit | — | ✓ | ✓ |
| Payroll JV, auto shifts, break shifts, report designer, custom integrations, attendance fraud detection, **API/webhooks**, analytics, audit trail, custom SMTP | — | — | ✓ |
| Add-ons (price not public) | expense/travel, geo-tracking, timesheet, survey, helpdesk, recruitment, LMS, WhatsApp, PMS, ePOSH | | |

### Zimyo (H)
| Area | Basic ₹80 | Standard ₹160 | Enterprise ₹240 |
|---|---|---|---|
| Core HR, attendance, documents, workflow, roles, ESS + mobile, basic payroll | ✓ | ✓ | ✓ |
| Onboarding/offboarding, helpdesk, assets, tasks, dashboards, engagement (feed, chat, survey, recognition), advanced time | — | ✓ | ✓ |
| Expense, travel, vendor, petty cash, budgeting, manpower planning, performance (OKR, 9-box, bell curve, compensation), global payroll | — | — | ✓ |
| Add-ons | Recruit ₹4,000/recruiter · HR Analytics ₹20,000 per licence/mo · Timesheet ₹40 · LMS ₹40 · Trip ₹40 · e-sign / payouts quote | | |

### Qandle (H prices; features not in the fetched JS)
All tiers include payroll with PF/ESI statements, Form 16, loans/advances, flexi benefits, arrears, custom report builder (from vendor JS copy); per-tier module split not captured. Add-ons: shift planner, field-force tracking, timesheets (JS shows "0.8" for India; the unit is ambiguous, treat as **not public**); free biometric integration (scratchpad, H).

### RazorpayX Payroll (H)
| Area | Prime | Elite | Enterprise |
|---|---|---|---|
| Payroll, payslips, **direct salary payout**, one-time payments, salary register | ✓ | ✓ | ✓ |
| Compliance calculation, payments **and filings** | ✓ | ✓ | ✓ |
| Time & attendance, employee-delight features | ✓ | ✓ | ✓ |
| Advanced payroll | limited | full | full |
| Expense | — | limited | full |
| Integrations / support | limited | enhanced | full |

### factoHR (H)
| Area | Free | Core | Premium | Ultimate |
|---|---|---|---|---|
| Employee data, letters, payslips | ✓ | ✓ | ✓ | ✓ |
| Onboarding, HR, attendance & leave, **AI face recognition**, payroll, dashboard, helpdesk, mobile/ESS, **multiple entities** | — | ✓ | ✓ | ✓ |
| Travel, expense, reimbursement, **geofence** | — | — | ✓ | ✓ |
| Performance, survey & acknowledgement | — | — | — | ✓ |
| Add-ons | selfie punch $0.5 · timesheet $0.5 · Fia AI chatbot $0.5 per emp/mo · Recruitment $75/recruiter/mo | | | |

### Kredily (H)
| Area | Free | Payroll OS | Professional | Enterprise |
|---|---|---|---|---|
| Employee DB, onboarding, web attendance, ESS + app, PF/ESI/PT/TDS calculation | ✓ (1 rule, 1 structure, 250 MB) | ✓ | ✓ | ✓ |
| Bank payouts (ICICI/NEFT), PF/ESI challans, 12BB, **Form 16**, analytics, OT/daily wage | — | ✓ | ✓ | ✓ |
| Unlimited rules, **GPS/selfie attendance**, expense, unlimited storage | — | — | ✓ | ✓ |
| Exit/F&F, **multi-company**, dedicated support | — | — | — | ✓ |
| Add-ons | Klocky, Live Tracking (Android), **KredEYE face**: ₹50/user/mo each | | | |

### sumHR (H)
| Area | Startup ₹49 | Basic ₹69 | Advanced ₹119 |
|---|---|---|---|
| ESS, onboarding, HRIS, attendance & leave, payroll, mobile | ✓ | ✓ | ✓ |
| Expense, policy centre, checklists, letters, **biometric integration**, notice board, roles, MIS, org chart | — | ✓ | ✓ |
| Offer tracking, salary transfer, HR/IT/Finance helpdesk, OKRs, assets, 360 reviews, e-sign HR drive | — | — | ✓ |
| Add-ons | ATS ₹999/user/mo · GPS clock-in ₹25/user/mo | | |

### Asanify (H)
| Area | Essential ₹99 | VIP ₹199 | Enterprise |
|---|---|---|---|
| Payroll, attendance, leave, HRIS, org chart, basic analytics, **biometric integration**, ESS | ✓ | ✓ | ✓ |
| Performance/OKR/KPI, hiring portal, pre-onboarding, offer letters, expense, timesheets, Slack, custom dashboards, "agentic AI" | — | ✓ | ✓ |
| HR concierge, **compliance filing (PF/ESI/TDS/PT) as a service**, custom workflows, **SSO** | — | — | ✓ |

### Superworks (H)
| Area | Startup | Professional | Premium |
|---|---|---|---|
| Core HR, lifecycle, attendance & leave, payroll | ✓ | ✓ | ✓ |
| Assets, expense | — | ✓ | ✓ |
| Engagement, helpdesk, performance & OKR | — | — | ✓ |
| Add-ons (price not public) | biometric integration, face-scan attendance, payroll JV, live tracking | | |

### SalaryBox (H)
| Area | Starter | Business | Enterprise |
|---|---|---|---|
| GPS attendance, **geofence**, leave, alerts, basic fraud prevention | ✓ | ✓ | ✓ |
| AI fraud prevention, rosters, automated payroll, **compliance filing**, payslips, expense, phone support | — | ✓ | ✓ |
| **API, Tally integration**, RM, custom roles, activity logs | — | — | ✓ |
| Add-ons | live tracking ₹100/user/mo · field CRM ₹250/user/mo · BGV ₹350/check · bank verification ₹10 each · biometric device (in-app) · payouts (quote) | | |

### Saral PayPack desktop (H)
Standard: payroll, attendance & leave, statutory, reimbursements, payslips, F&F. Corporate adds bank formats, documents, audit trail, assets, custom report writer. Premium adds ESS, mobile app, biometric integration, custom payslip editor.

### Truein (H)
Capture: face recognition, GPS geofence, spoof detection, offline capture, job tracking, basic timesheets, multi-site. Advanced adds scheduling, activity tracking, OT rules, contractor management. Add-ons: live tracking ₹200/user/yr, leave ₹60/user/yr.

---

## 3. Add-on price list

| Vendor | Add-on | Price | Conf. |
|---|---|---|---|
| greytHR | Performance (PMS) | ₹35–45/user/mo | H |
| greytHR | Expense | ₹35/user/mo | H |
| greytHR | Timesheets | ₹35/user/mo | H |
| greytHR | GPS live tracking | ₹140/user/mo | H |
| greytHR | Recruit | ₹2,500/recruiter/mo | H |
| greytHR | Alumni portal | ₹20/user/mo | H |
| greytHR | SSO | ₹10/emp/mo | M (indianhrm) |
| greytHR | REST API | ₹15/emp/mo | M |
| greytHR | GeoMark+, Visage face, multi-company | Growth add-on, price not public | H |
| Keka | Hire Pro / Hire Advanced | ~₹1,500 / ~₹2,500 per recruiter/mo | L |
| Keka | Learn | ₹60/emp/mo, 50-emp minimum | L–M |
| Keka | Setup | "nominal"; trackers ~2% or ~2 months | H (existence) / L (amount) |
| Zimyo | Recruit ATS | ₹4,000/recruiter/mo | H |
| Zimyo | HR Analytics | ₹20,000/licence/mo | H |
| Zimyo | Timesheet / LMS / Trip | ₹40 each/user/mo | H |
| factoHR | Selfie punch / Timesheet / AI chatbot | $0.5 each/emp/mo | H |
| factoHR | Recruitment | $75/recruiter/mo | H |
| Kredily | Klocky / Live tracking / KredEYE face | ₹50 each/user/mo | H |
| sumHR | ATS | ₹999/user/mo | H |
| sumHR | GPS clock-in | ₹25/user/mo | H |
| SalaryBox | Live location tracking | ₹100/user/mo | H |
| SalaryBox | Field-force CRM | ₹250/user/mo | H |
| SalaryBox | Background verification | ₹350/check | H |
| SalaryBox | Bank account verification | ₹10/check | H |
| Truein | Live tracking / leave | ₹200 / ₹60 per user/yr | H |
| TimeChamp | Implementation + training | ₹350/user, minimum ₹6,000 | H |
| TimeChamp | Screen recording, keylogger, HR module, API, field staff, etc. | per user, not public | H |
| Pocket HRMS | expense, geo-tracking, timesheet, survey, helpdesk, recruitment, LMS, WhatsApp, PMS, ePOSH | not public | H |
| HROne | payroll outsourcing, WhatsApp/Teams bot, BI, workforce planning | not public | H |
| Qandle | shift planner, field-force, timesheet | not public (ambiguous "0.8" in JS) | H |
| Superworks | biometric, face scan, payroll JV, live tracking | not public | H |
| uKnowva | Aadhaar onboarding, geo-tag, geofence, QR recruitment, reporting | not public | H |
| 247HRM | payroll operations assistance | not public (priced by entities/states/SLA) | H |
| SpringVerify | BGV packages | ₹799–1,599/candidate | M |
| Industry (hidden costs) | implementation ₹15k to ₹5 lakh+; data migration ₹25k–1.5 lakh; per-entity ₹50k–2 lakh/yr; biometric ₹5–15k/device; renewal uplift 8–15% | — | L (akrivia blog, 14 Jul 2026) |

---

## 4. Pricing-model patterns

1. **Base fee + per-employee overage with a 50-seat floor is the dominant SMB model.** Used by greytHR (₹2,495 / ₹4,495 for 50), factoHR, Pocket HRMS, Superworks, Paybooks, 247HRM, RazorpayX Elite, and Zoho Payroll Pro/Premium. HROne, Zimyo and Qandle are PEPM with a **50-user minimum**. Keka uses a **100-seat base**; Kredily and Zoho Payroll Standard use **25**. So a 10-person company effectively pays for 25–100 seats.
2. **Headline overage by tier:** ₹45–85 (greytHR), ₹50–70 (Kredily), ₹60–90 (Pocket), ₹80–135 (Superworks), ₹90–150 (Keka), ₹99–139 (factoHR), ₹99–130 (HROne), ₹150 (RazorpayX). Pure PEPM runs ₹49–240 (sumHR ₹49 up to Zimyo ₹240).
3. **Module fragmentation and add-ons.** Performance, expense, timesheets, recruitment (per recruiter, ₹1,500–4,000/mo), GPS/face attendance, SSO and API are often sold separately (greytHR, Zimyo, Kredily, factoHR, sumHR). Zoho splits HR (People) from payroll (Payroll), with leave and attendance only in Payroll Premium. Recruitment is almost never included below enterprise.
4. **Quote-only at the top.** Darwinbox, PeopleStrong, Spine, Akrivia, HRMantra, ZingHR, uKnowva, ADP, Rippling, and every vendor's "Premium/Enterprise" tier. Implementation fees are mostly unpublished ("nominal"), from ₹10k up to "1–2× annual licence" for Darwinbox.
5. **Free tiers are crippled:** greytHR ≤25 (250 MB, 13 months of history, deactivated after 3 idle months), Zoho Payroll ≤10, Zoho People ≤5, factoHR ≤20 (no payroll run), Kredily unlimited but 1 rule, 1 structure, 250 MB and ads. RazorpayX withdrew its free tier.
6. **Annual-only or annual-favoured billing:** Pocket HRMS and factoHR (billed yearly), Truein (annual only), RazorpayX (annual or semi-annual only). Monthly carries a premium: Zoho ~25%, Qandle ~25%, Superworks 15%, 247HRM 15%, SalaryBox 10%. Unused annual credit is **forfeited** at factoHR and Qandle.
7. **Lock-in and notice:** "No lock-in" is common, but there is a 2-month notice at HROne, billing from contract signature at Keka (tracker), and billing from go-live at HROne and Akrivia (marketed as a differentiator). Year-2 renewal hikes of 8–25% are reported (L).
8. **Per-entity charging:** Zoho Payroll needs one subscription per legal entity. greytHR multi-company is a Growth add-on. Kredily multi-company is Enterprise only. factoHR includes multiple entities from Core.
9. **Desktop/perpetual licences persist:** Saral PayPack (₹53.7k–1.41 lakh/yr per licence, employee caps per company) and TallyPrime (₹22.5k perpetual + ₹4.5k/yr).
10. **Micro-SMB per-staff-per-year:** PagarBook ₹499–1,398/staff/yr and SalaryBox ₹30–75/user/mo target shops and blue-collar teams.

---

## 5. Effective price per employee: full HRMS + payroll bundle

Method: take the **highest published tier** that includes payroll, and add published add-ons where the tier lacks performance or expense. Result = monthly total ÷ headcount, ex-GST, annual billing where it is cheaper. Recruitment/ATS is excluded (per-recruiter pricing). **E** = estimate (tracker base or extrapolation beyond the published cap). Q = quote only.

| Vendor / bundle | 10 emp | 50 emp | 200 emp | 1,000 emp | Math |
|---|---|---|---|---|---|
| **YukthiX** (₹96 per product) | ₹96 (₹192 if HRMS and payroll count as 2 products) | ₹96 / 192 | ₹96 / 192 | ₹96 / 192 | flat, includes ATS and proctoring as separate products |
| Keka Growth (E: base from tracker) | ₹1,600 | ₹320 | ₹155 | ₹151 | 15,999 for 100; 200: 15,999+100×150=30,999; 1,000: 15,999+900×150=150,999 |
| greytHR Growth only | ₹450 | ₹90 | ₹86 | ₹85 | 4,495; 200: 4,495+150×85=17,245; 1,000: 4,495+950×85=85,245 |
| greytHR Growth + PMS ₹45 + Expense ₹35 | ₹530 | ₹170 | ₹166 | ₹165 | add ₹80 × N (add-ons are charged per user). Premium is Q |
| Zoho People Premium (₹165, L) + Zoho Payroll Premium (annual) | ₹565 | ₹245 | ₹245 | ₹245 | 10: 1,650+4,000=5,650; 50: 8,250+4,000; 200: 33,000+4,000+150×80=49,000; 1,000: 165,000+4,000+950×80=245,000 |
| HROne Professional (no performance/recruitment; Enterprise Q) | ₹650 | ₹130 | ₹130 | ₹130 | floor 50×130=6,500 |
| Pocket HRMS Professional (add-ons Q) | ₹450 | ₹90 | ₹90 | ₹90 | 4,495; 200: 4,495+150×90=17,995; 1,000: 89,995 |
| Zimyo Enterprise | ₹1,200 | ₹240 | ₹240 | ₹240 | floor 50×240=12,000 |
| Zimyo Standard (no performance/expense) | ₹800 | ₹160 | ₹160 | ₹160 | floor 50×160 |
| Qandle Premium (annual) | ₹645 | ₹129 | ₹129 | ₹129 (Q above 1,000) | floor 50×129=6,450 (monthly billing: ₹160) |
| RazorpayX Elite (payroll only) | ₹650 (Prime: ₹350) | ₹130 | ₹145 | ₹149 **E** (Q above 100) | 6,499; 200: 6,499+150×150=28,999; 1,000: 6,499+950×150 |
| factoHR Ultimate | ₹700 | ₹140 | ₹139 | ₹139 | 6,999; 200: 6,999+150×139=27,849; 1,000: 139,049 |
| Kredily Professional (no performance) | ₹175 | ₹70 | ₹70 | ₹70 | 1,749 for 25; 50: 1,749+25×70=3,499; 200: 13,999; 1,000: 69,999 |
| Kredily Professional + KredEYE face ₹50 | ₹225 | ₹120 | ₹120 | ₹120 | +50 × N |
| sumHR Advanced | ₹119 | ₹119 | ₹119 (volume discount at 100+ not public) | Q (250+ is Enterprise) | flat PEPM + one-time setup (not public) |
| Asanify VIP | ₹199 | ₹199 | ₹199 | Q (>500) | flat PEPM |
| Superworks Premium | ₹675 | ₹135 | ₹135 | ₹135 | 6,750; 200: 6,750+150×135=27,000; 1,000: 135,000 |
| 247HRM Professional | ₹900 | ₹180 | not public | not public | 8,999 for 50; overage not public |
| Paybooks Premium (**E**, 50-emp slab per tracker) | ₹1,000 | ₹200 | not public | not public | 9,999 |
| SalaryBox Business (quarterly) | ₹270 **E** (floor) | ₹67.5 | ₹67.5 | Q (200+) | ₹2,700 floor or ₹67.5 × N |
| Darwinbox | Q | Q | ₹200–600 **E** | ~$3 (≈₹290) **E** | tracker bands (L); plus $5k–50k implementation |
| PeopleStrong | Q | Q | ₹80–150 **E** | ~$3 **E** | tracker (L) |
| Saral PayPack Corporate (desktop, single user, payroll only) | ₹965 | ₹193 | ₹48 | ₹9.7 | 1,15,800 ÷ 12 = 9,650/mo ÷ N |
| Truein Advanced (attendance only, for reference) | ₹604 | ₹144 | ₹58 | ₹35 | (69,000 + 350N) ÷ 12 ÷ N |

**Takeaways for YukthiX at ₹96 (one product) or ₹192 (HRMS and payroll as two products):**
- At **10 employees**, seat floors push every base-fee vendor to ₹450–1,600/emp. Only Kredily (₹175), sumHR (₹119), Asanify (₹199) and the free tiers are lower. ₹96 all-inclusive beats every paid option.
- At **50–1,000 employees**, the full-featured median sits around ₹130–245. ₹96 undercuts everyone except greytHR Growth *without* add-ons (₹85–90), Pocket Professional (₹90), Kredily (₹70, fewer features), sumHR Startup/Basic (₹49–69) and desktop Saral. If HRMS and payroll are billed as two products (₹192), YukthiX lands mid-pack and above Keka, HROne and Qandle at scale.
- Selling points competitors charge extra for, all included at ₹96: face/geo attendance (₹25–140 elsewhere), SSO/API (₹10–15 at greytHR), multi-entity, recruitment (₹999–4,000 per recruiter).

---

## Sources (key; fetched or searched 2026-09-27)
- keka.com/pricing and keka.com/us/pricing (page source via curl); indianhrm.com/keka-pricing; hrone.cloud/blog/keka-pricing-india; itforsme.in/pricing/keka-india
- greythr.com/pricing; greythr.freshdesk.com Starter articles; indianhrm.com/greythr-pricing
- zoho.com/in/payroll/pricing-comparison; zoho.com/people/zohopeople-pricing.html; indianhrm.com/zoho-people-pricing; goforfiling.com
- hrone.cloud/pricing; hrone.cloud/blog/payroll-software-price-in-india (18 Sep 2026)
- pockethrms.com/pricing; zimyo.com/pricing; qandle.com/transparent-pricing.html plus /js/pricing/custom-neww_dd.js
- razorpay.com/payroll/pricing; opfin.com/pricing (redirects to RazorpayX)
- factohr.com/pricing; kredily.com/pricing; sumhr.com/pricing-signup; asanify.com/pricing; superworks.com/pricing; 247hrm.com/pricing
- techjockey.com (Paybooks, Spine, 247HRM, Beehive, uKnowva, Akrivia); softwaresuggest; saasworthy; capterra
- salarybox.in/pricing; pagarbook.com/pricing (plus search); saralpaypack.com/desktop-pricing; Tally partner price lists (markitsolutions, tallysupport)
- asanify.com/blog/competition/asanify-vs-darwinbox; hrone.cloud/blog/darwinbox-pricing; softwarefinder.com (Darwinbox, PeopleStrong)
- akriviahcm.com/blog/hr-payroll-software-pricing-india (14 Jul 2026); hrmantra.com cost guide; uknowva.com/hrms-pricing
- truein.com/pricing; timechamp.io/pricing; jibble.io and trackers; pin.com/blog/deel-pricing; eorhq.com; springverify (g2/softwaresuggest); ongrid (tradebrains)
- indianhrm.com/pricing (competitor vendor)
