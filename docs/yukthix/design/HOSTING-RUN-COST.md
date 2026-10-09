# Hosting run cost — what the servers cost per month, by hosting option, and where to save

> **Date:** 27 Sep 2026. **Question from the founder:** development is free for us; the price only has to cover server cost and the rest is profit. What does it cost to run YukthiX each month, on different hosting options, and where can we save?
>
> **This is input for the engineering team's P13 infrastructure decisions** (P13 is parked with the team). It does not choose a provider.
>
> **Model:** `research/hosting_model.py` (re-run it with new sizes or prices). **Prices checked today:** AWS Mumbai gp3 $0.131/GB, S3 ≈ ₹2.1/GB, egress $0.109/GB after 100 GB, CloudFront India $0.109/GB with 1 TB free ([PrecisionTech](https://precisiontech.in/cloud/amazon-aws-cloud/aws-pricing/aws-pricing-in-mumbai/), [itforsme](https://www.itforsme.in/pricing/aws-s3-india), [EgressCost](https://egresscost.com/aws/cloudfront-pricing/)); DigitalOcean managed Postgres with standby ≈ $122 for 4 GB, Spaces $5 base, $0.01/GB overage ([DigitalOcean docs](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)); Oracle Cloud Ampere $0.01 per OCPU-hour + $0.0015 per GB-hour, object $0.0255/GB, 10 TB egress free, same price in Mumbai and Hyderabad ([Oracle](https://www.oracle.com/cloud/compute/arm/)); E2E Networks 4 vCPU / 16 GB ₹3,000–6,000, managed Postgres ₹8,000–15,000, July 2026 price update ([E2E](https://docs.e2enetworks.com/docs/myaccount/billing/pricing-update-july-2026/)); Hetzner AX102 €122 a month, cloud prices raised in 2026 ([Hetzner](https://www.hetzner.com/dedicated-rootserver/ax102/), [Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases)). $1 = ₹96. All figures are estimates to ±30 %; the team should re-price with each provider's calculator before committing.

---

## 1. What we are paying for

| Part | What it runs | What drives its cost |
|---|---|---|
| App servers | API and web app (NestJS, Next.js) | Number of active users |
| Workers | Payroll runs, PDF payslips and letters, imports, notifications, reports | Payroll day peaks |
| Proctoring pipeline | Frame checks, recording processing, live-video relay for invigilators | Test attempts, and campus-drive peaks |
| Database | PostgreSQL primary + standby (high availability) + read replica for reports | Employees and history |
| Cache / queues | Redis | Small |
| File storage | Documents, payslips, proctoring recordings | Recording retention (default 30 days) |
| Bandwidth | App traffic, reviewers watching flagged clips, invigilators watching live | Mostly proctoring |
| Logs and backups | Logs kept at least 1 year (DPDP Rules 2025; also covers CERT-In's 180 days), point-in-time backups | Small |
| Included AI | Helpdesk answers, summaries, interview transcript scoring | Usage; heavy use is the AI-credits add-on |
| Staging / sandbox | Copies for testing | 15–30 % of production |
| Disaster recovery | Warm copy in a second Indian region (from year 3) | +25 % |

SMS, WhatsApp, e-sign, payouts and other partner services are **not** in this model: they are pass-through add-ons paid by the customer (D18).

**Sizing assumed**

| Stage | Employees on HRMS | Proctored attempts / month | Recruiter seats | Revenue / month at $1 |
|---|---|---|---|---|
| Pilot (year 1) | 5,000 | 5,000 | 50 | $10,050 (₹9.6 L) |
| Growth (year 2) | 25,000 | 25,000 | 250 | $50,250 (₹48 L) |
| Scale (year 3) | 100,000 | 100,000 | 1,000 | $2,01,000 (₹1.9 Cr) |
| Large (year 4+) | 500,000 | 500,000 | 5,000 | $10,05,000 (₹9.6 Cr) |

---

## 2. Monthly server cost by hosting option

| Hosting option | Pilot | Growth | Scale | Large | Notes |
|---|---|---|---|---|---|
| **AWS Mumbai, pay-as-you-go, fully managed** | $1,110 (₹1.07 L) | $2,437 (₹2.3 L) | $7,935 (₹7.6 L) | $32,456 (₹31 L) | Easiest to run, best known to enterprise buyers, most expensive |
| **AWS Mumbai with 1-year commitment** | $870 (₹0.84 L) | $1,935 (₹1.9 L) | $6,552 (₹6.3 L) | $27,789 (₹27 L) | ~35 % off compute and database |
| **DigitalOcean Bangalore, managed database** | $485 (₹0.47 L) | $1,285 (₹1.2 L) | $4,447 (₹4.3 L) | $19,683 (₹19 L) | Simple, India data centre, cheap bandwidth |
| **E2E Networks (Indian cloud), managed database** | $437 (₹0.42 L) | $1,170 (₹1.1 L) | $3,994 (₹3.8 L) | $17,432 (₹17 L) | INR billing, Indian company; verify SKUs after the July 2026 price change |
| **Oracle Cloud Mumbai / Hyderabad, we run Postgres** | $366 (₹0.35 L) | $1,032 (₹1.0 L) | $3,673 (₹3.5 L) | $16,357 (₹16 L) | Cheapest in India; two Indian regions for DR; 10 TB free bandwidth; needs database skills |
| **Hetzner dedicated servers (Europe / US only)** | $230 | $705 | $2,584 | $11,950 | **No India region.** Only for non-Indian customers, backups or a DR copy |

**Server cost as a share of revenue**

| Hosting option | Pilot | Growth | Scale | Large |
|---|---|---|---|---|
| AWS pay-as-you-go | 11.0 % | 4.8 % | 3.9 % | 3.2 % |
| AWS 1-year commitment | 8.7 % | 3.9 % | 3.3 % | 2.8 % |
| DigitalOcean Bangalore | 4.8 % | 2.6 % | 2.2 % | 2.0 % |
| E2E Networks | 4.4 % | 2.3 % | 2.0 % | 1.7 % |
| Oracle Cloud India | 3.6 % | 2.1 % | 1.8 % | 1.6 % |

**If only HRMS sells in the first year** (no proctoring revenue yet, proctoring servers scaled down): the pilot costs about **₹19 per employee a month on AWS pay-as-you-go (20 % of revenue)** and **₹7–8 on E2E or DigitalOcean (7–8 %)**. By year 2 it falls to ₹3–8 per employee.

**Answer to the founder's question:** on server cost alone, the $1 price leaves a margin of **89–96 % in year 1 and 96–98 % from year 3**, whichever option is chosen. Servers are not the risk. The larger running costs are the people and programmes around the servers (see §5).

**Where the money goes at Scale (E2E example, $3,994 a month):** database $1,162 (29 %), included AI $1,600 (40 %), compute $505 (13 %), storage $170, other $78. So the two things to watch are the **database** and **included AI**.

---

## 3. Where to save money

| # | Saving | How | Saves (approx.) |
|---|---|---|---|
| 1 | **Startup cloud credits** | AWS Activate (up to $100–200k with an investor or accelerator; $1–5k self-funded), Microsoft for Startups (up to $150k over ~4 years), Google for Startups (up to $200–350k for AI companies), Oracle for Startups. Credits usually expire in 12–24 months ([comparison](https://guptadeepak.com/aws-activate-vs-microsoft-for-startups-vs-google-for-startups-2026-who-each-one-is-actually-for/), [Causo](https://hub.causo.ai/guides/startup-cloud-credits-compared-2026)) | **100 % of hosting for 1–2 years** if approved; big credits need investor / accelerator backing |
| 2 | **Don't start on AWS pay-as-you-go** | Pilot on an Indian cloud (E2E, DigitalOcean Bangalore or Oracle India), or on AWS only with credits or a commitment | 55–65 % vs AWS pay-as-you-go |
| 3 | **Keep the stack portable** (already decided: Docker, Postgres, S3-compatible storage, Terraform) | Lets us move provider when credits end or prices rise, without rewriting | Negotiating power; avoids lock-in |
| 4 | **Arm servers** (AWS Graviton, Oracle Ampere) | Node.js and Postgres run well on Arm | ~20 % on compute |
| 5 | **Commit once usage is steady** | 1-year savings plans / reserved database after month 6 | ~35 % on compute and database |
| 6 | **Proctoring AI in the candidate's browser** (already in T04: on-device checks, frames sent only when flagged) | Server only processes flagged frames and stills | Largest proctoring saving; server proctoring cost falls 5–10× |
| 7 | **Low-bitrate recording + 30-day default retention** (decided, T05 G17) | Stills and clips for AI-only mode; full video only for record-and-review; longer retention is the tenant's paid storage add-on | Keeps storage flat as attempts grow |
| 8 | **Cold storage for old files** | Move recordings older than 7 days and documents older than a year to infrequent-access / archive tiers | 50–90 % on those files |
| 9 | **Autoscale for drive days and payroll day** | Scale proctoring and worker nodes up only for campus drives and payroll runs; use spot / pre-emptible machines for batch jobs (PDFs, reports) | 30–60 % on those nodes |
| 10 | **Cloudflare in front** (free or Pro plan) | CDN caching, WAF and DDoS protection; cuts bandwidth bills on AWS | Most of AWS egress; replaces a paid WAF |
| 11 | **Control included AI** | Small models by default, cache repeated answers, batch overnight jobs, fair-use limit then AI credits (D18) | 50–80 % of the AI line, the largest line at scale |
| 12 | **Database discipline** | Shared database with row-level security (decided, P01), pre-computed report tables (P09), read replica for reports, archive old audit rows | Delays the next database size step by 1–2 stages |
| 13 | **Switch off staging at night** | Staging and sandbox run only in working hours | ~60 % of non-production |
| 14 | **One region until Scale** | Cross-region backups only in years 1–2; warm DR in Hyderabad / Chennai from year 3 | Avoids +25 % early |
| 15 | **Negotiate** | Every provider discounts at ₹5–10 L a month of spend | 10–30 % at Scale |

With savings 1–2 in year 1 and 4–13 from year 2, the realistic server bill is about **₹0–40,000 a month in the pilot** and **₹3–5 L a month at 1 lakh employees**.

---

## 4. Which option when (suggestion for the engineering team)

| Stage | Suggested hosting | Why |
|---|---|---|
| **Pilot (year 1)** | Apply for startup credits first. If approved, use them (AWS or Azure Mumbai). If not, use **E2E Networks or DigitalOcean Bangalore with managed Postgres** | Near-zero cost; managed database means no DBA needed, which matters because the team is new to infrastructure |
| **Growth (year 2)** | Stay where credits or managed Postgres are; add Cloudflare, Arm, autoscaling and night shutdown of staging | Cost falls to 2–4 % of revenue |
| **Scale (year 3)** | Decide by customer mix. Enterprise / BFSI buyers who ask for AWS or Azure → AWS Mumbai with commitments. Price-led SMB mix → E2E or Oracle India with a hired database engineer. Add DR in a second Indian region | Enterprise credibility vs lowest cost |
| **Global customers** | A second region near them (Middle East, Singapore, EU) on the same stack | Data residency (P02) |

**Indian customers' data stays in India** (P02 residency, CERT-In log rules), so Hetzner and other non-Indian hosts are for non-Indian tenants, backups or DR only.

---

## 5. Running costs that are not servers

Development is free, but these still have to be paid from revenue (see PRICING-UNIT-ECONOMICS.md):

| Cost | Approximate | Note |
|---|---|---|
| Security programme (ISO 27001, then SOC 2; pen tests; security tools) | ₹40–90 L a year | Fixed; the main reason year 1 runs at a loss (P12) |
| Customer support staff | ~₹60,000 per person per month; about one per 150–200 companies | Grows with customers, not servers |
| Payment gateway | ~0 % on bank auto-debit / NEFT, 2.36 % on cards | YX-BILL-15 steers customers to bank rails |
| Domains, email service, monitoring tools, code signing, app-store fees | ₹10,000–40,000 a month | Small |
| Statutory content upkeep and compliance partner (P07) | Team decision | Needed for payroll correctness |

---

## 6. Summary

- **Servers cost 2–11 % of revenue at $1**, falling to about 2 % at scale on an Indian cloud. The price covers server cost many times over.
- **Cheapest in India:** Oracle Cloud India (needs database skills), then E2E Networks and DigitalOcean Bangalore (managed database). **Most expensive:** AWS pay-as-you-go, about 2–2.5× the Indian clouds.
- **Biggest savings:** startup credits (free for 1–2 years), not starting on AWS pay-as-you-go, proctoring AI in the browser, 30-day recording retention, and keeping included AI under a fair-use limit.
- **The real cost risk is not servers** but the fixed security programme and support staff. Those are covered from year 2 onward at the planned growth.
