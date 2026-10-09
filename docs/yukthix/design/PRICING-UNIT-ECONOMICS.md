# Pricing & unit economics — price point, minimum, gateway fees, partner commission

> **Date:** 27 Sep 2026. **Purpose:** set the exact price and per-product minimum (D18, YX-BILL-09 / 14), show where the money goes per employee per month, and show how to cut the two "commissions": payment-gateway fees and partner commission.
>
> **Sources checked today:** Razorpay pricing blog (2 % + 18 % GST platform fee on cards, UPI, wallets and net banking; 2.15 % corporate cards; up to 3 % international; custom pricing above ₹5 lakh a month; zero fees for new merchants up to ₹5 lakh or 90 days): https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/ · NPCI UPI MDR framework 2026 (0.4 % MDR on person-to-merchant UPI above ₹2,000 from 15 Oct 2026, capped ₹300; zero below ₹2,000): https://www.insightsonindia.com/2026/09/16/upi-merchant-discount-rate-mdr-framework-2026/ · Razorpay recurring payments (UPI Autopay up to ₹15,000 per cycle; e-NACH above that): https://razorpay.com/blog/upi-autopay-vs-enach-comparison/ · Stripe India (2 % domestic cards; 3–4.3 % international plus 2 % currency conversion): https://www.skydo.com/compare/stripe-pricing · USD/INR ≈ 96 on 26 Sep 2026: https://tradingeconomics.com/india/currency · multi-tenant SaaS infrastructure benchmarks ($200–600 a month for the first 50 tenants; $5–15 per tenant a month when optimised): https://wring.co/blog/cloud-costs-for-saas-companies
>
> **Not verified:** the exact e-NACH per-debit fee (typically a flat few rupees; confirm with Razorpay), and whether Razorpay's 2 % platform fee still applies on top of UPI MDR under a negotiated plan. Both are team actions before launch.

---

## 1. Where the ₹ goes: cost per HRMS employee per month

Assumptions: fully loaded support person ₹60,000 a month; security programme (ISO 27001, pen tests, tooling, SOC 2 later) ₹40–90 lakh a year; storage, email, monitoring ₹1 per employee; payment via Razorpay standard rails at 2.36 %. Founders' salaries are excluded, as agreed under D18. GST is collected on top and is not a cost.

| Stage | Employees on platform | Tenants | Support staff | Infra ₹/emp | Support ₹/emp | Security ₹/emp | Gateway ₹/emp | Total cost ₹/emp | Margin at ₹99 | Margin at ₹99 after 20 % partner commission |
|---|---|---|---|---|---|---|---|---|---|---|
| Year 1 pilot | 5,000 | 80 | 2 | 18.0 | 24.0 | 66.7 | 2.3 | **112** | **−13 %** | −33 % |
| Year 2 | 25,000 | 400 | 4 | 10.0 | 9.6 | 15.0 | 2.3 | **38** | **62 %** | 42 % |
| Year 3 | 100,000 | 1,500 | 10 | 7.0 | 6.0 | 5.0 | 2.3 | **21** | **78 %** | 58 % |
| Scale | 500,000 | 7,000 | 35 | 5.0 | 4.2 | 1.5 | 2.3 | **14** | **86 %** | 66 % |

**Reading it**
- The $1 price works. From about **10,000 employees on the platform** the product covers its own running cost, and from 25,000 the margin is healthy even after paying partners.
- **Year 1 loses money whatever the price.** The security programme (₹40 lakh a year) is a fixed cost spread over few employees. Pricing at ₹79 instead of ₹99 does not change that; it only delays break-even. So the price should not be cut below $1 for cost reasons.
- **Support is the only cost that scales with people, not servers.** The design already attacks it: setup hub, self-serve editors, AI helpdesk, impact previews, "why" explanations. Keep the ratio at one support person per 150–200 tenants.
- **Gateway fees are small per employee but 100 % avoidable.** ₹2.3 of ₹99 (2.4 %) on cards or standard UPI, near zero on bank rails. See §3.

Proctoring and ATS follow the same shape. A proctored attempt costs about ₹5–15 in video storage, AI processing and bandwidth for a 60-minute low-bandwidth session held 30 days, so $1 ≈ ₹96 per attempt is safe. An ATS recruiter seat costs more than an employee (parsing, job-board calls, careers site) but the seat count is small; the minimum in §2 covers it.

---

## 2. Recommended price and minimum

| Item | Recommendation | Why |
|---|---|---|
| **Price in India** | **₹99 per employee per month** (HRMS), **₹99 per recruiter seat**, **₹99 per proctored attempt**. Elsewhere **$1**, billed in USD. | $1 at today's rate is ₹96; ₹99 is a stable, memorable Indian number and does not move with the dollar. Full-featured competitor plans land at ₹150–400 per employee (Keka Growth, greytHR Premium, Darwinbox, Zoho People Premium + Payroll), so ₹99 all-inclusive is 35–70 % below them, with no seat floor and no add-ons. Their cheaper entry plans (greytHR Essential ₹50 effective at exactly 50 seats, Kredily ₹50–70) exist, but strip modules, carry seat floors and sell API, SSO and GPS as add-ons. Going to ₹79 would not change year-1 losses and would weaken the "serious product" signal. |
| **Annual prepay** | **10 months for 12** (₹990 per employee per year ≈ ₹82.50 a month), paid by NEFT / RTGS. | Removes gateway fees entirely, brings cash forward, and the 17 % discount is the market's usual annual saving. |
| **Bundle** | 2 products −10 %, 3 products −15 %, automatic. | Already decided (P14 Q7). |
| **Founding-customer offer** | First 100 companies (or the pilot cohort): **₹79 per employee locked for 36 months**, in exchange for a case study and a review. | This is the attention-grabbing number, time-boxed and cohort-limited, so it does not reset the list price. |
| **Minimum per product per month** | **HRMS ₹499** (≈ 5 employees), **ATS ₹999** (≈ 10 seats), **Proctoring ₹999 in any month with at least one attempt, ₹0 otherwise**. Outside India $5 / $10 / $10. | A 5-person company pays ₹499, about $5, which meets the "few dollars" rule (YX-BILL-14). It covers the fixed per-tenant cost (roughly ₹300–400 a month for support and infra at scale) and the flat e-NACH debit fee. ATS and Proctoring have higher per-tenant fixed costs and tiny unit counts, so a ₹999 floor is fair and still far below Zoho Recruit or any coding-test vendor. |
| **Free tier** | **None.** 30-day trial without a card, and the pilot cohort offer instead. | Free tiers are what RazorpayX and Kredily withdrew or degraded, which is exactly the trust break reviewers punish. A ₹499 floor is cheap enough to replace "free". |

**Sanity check against YX-BILL-09:** at ₹99 the fully loaded cost is ₹38 in year 2 and ₹21 in year 3, so the agreed-margin test passes from year 2 onward. The guard should therefore be set as "fully loaded cost per unit ≤ 40 % of price from month 18", and reviewed monthly in the console.

---

## 3. Cutting the payment "commission" (gateway fees)

What each rail costs on a typical 60-employee invoice of ₹5,940 a month:

| Rail | Fee | On ₹5,940 | Notes |
|---|---|---|---|
| **NEFT / RTGS / IMPS bank transfer** | **₹0 to YukthiX** | ₹0 | The payer's bank may charge ₹2–25. Reconciliation needs a virtual account number per tenant so payments match invoices automatically (Razorpay Smart Collect or the bank's virtual accounts). |
| **e-NACH auto-debit** (bank mandate) | flat, a few rupees per debit (verify) | ≈ ₹5–10 | Best for monthly billing: automatic, no card limits, near-zero cost. Needs a one-time mandate signed by the customer's bank account holder. |
| **UPI Autopay** | 0.4 % MDR above ₹2,000 from 15 Oct 2026, capped ₹300, plus Razorpay's platform fee unless negotiated | ≈ ₹24 + platform fee | Up to ₹15,000 per cycle. Fine for small tenants; e-NACH above that. |
| **Cards / net banking via Razorpay standard** | 2 % + GST = 2.36 % | ≈ ₹140 | Corporate cards 2.54 %, international 3.54 %. |
| **Stripe, international card with currency conversion** | 3–4.3 % + 2 % FX | ≈ ₹370 | Only for non-INR customers; push them to ACH (0.8 %, capped) or SEPA (flat) inside Stripe. |

**What to do (adds to P14 Q3)**
1. **Default payment method = auto-debit from the company bank account (e-NACH), with NEFT / RTGS for annual invoices.** Cards remain available but are not the default. This alone removes ~95 % of gateway cost.
2. **Bank-transfer discount, not a card surcharge.** Show ₹99 as the list price and give **2 % off when the tenant pays by e-NACH, UPI Autopay or NEFT**. Card-network rules in India frown on surcharging customers; a discount framed the other way is allowed and feels like a gift.
3. **Virtual account per tenant** so every bank transfer reconciles itself. Without it, NEFT creates manual matching work that costs more than the fee it saves.
4. **Annual prepay by NEFT** is the cleanest: zero fee, one reconciliation a year, cash up front.
5. **Negotiate with Razorpay once volume passes ₹5 lakh a month** (custom pricing exists) and use the new-merchant zero-fee window (₹5 lakh or 90 days) for the pilot.
6. **Route by amount:** below ₹15,000 a month UPI Autopay; above, e-NACH. Let the gateway route.
7. **Never absorb international card fees on the $1 price:** for non-INR customers require annual prepay or ACH / SEPA, or show the card fee as a separate line where local rules allow.

**Partner-service pass-throughs stay pass-throughs (D18).** WhatsApp is on the company's own number and Meta bill; SMS is quota plus overage; AI is credits; payout, e-sign, BGV and filing partners are billed at cost plus the partner reference (YX-BILL-08). None of these touch the ₹99.

---

## 4. Partner commission (P16 YX-PTR-11): keeping it affordable

Partners (CA firms, bureaus, resellers) are paid one of two ways. Both must fit inside the margin above.

| Setting | Recommendation | Effect at ₹99 |
|---|---|---|
| **Referral commission (direct billing)** | **15 % of collected subscription revenue** (net of GST, discounts and gateway fee), paid monthly, **for the first 24 months of each client**, then **5 % for as long as the partner actively operates the client** (has an active link with the "operates" relationship). Nothing on add-on pass-throughs. | ₹15 in years 1–2, ₹5 afterwards. Margin at year-2 scale stays above 45 %. |
| **Partner-billed discount** | **15 % off list** on the consolidated invoice; the partner re-bills its clients with its own fee. Paid by NEFT only. | Same ₹15 cost, zero gateway fee, one invoice to chase. |
| **Reseller hierarchy** | The master partner earns **3 %** on sub-partner clients, taken out of the 15 %, not added. | Total never exceeds 15 %. |
| **Implementation partners** | No recurring commission. They charge the client for their work (paid customisation, D18) and may take a **one-time bounty of ₹2,000 per client that goes live** funded from month-1–3 margin. | One-off. |
| **Paid on cash, never on invoice** | Commission accrues only when the client's payment clears; claw-back if the client is refunded within 90 days. | Protects cash. |
| **Cap** | Total partner cost for any client never exceeds 15 % of that client's collected revenue in any month. | Guard for YX-BILL-09. |

Why 15 % and not 20–30 %: Indian HRMS resellers commonly see 20–25 % on ₹150–400 price points; at ₹99 that would consume most of the year-2 margin. 15 % on a product that sells itself on price, plus the free partner console, directory listing and white-label, is a fair trade. Make the console and directory the recruiting tool, not the percentage.

---

## 5. Decisions (27 Sep 2026)

| # | Decision | Outcome |
|---|---|---|
| E1 | Price point | **$1 per unit per month stays, everywhere.** The founder's reasoning: this is a market-capture strategy, not a profit price; the aim is customers, proof and investor attention for a multi-product company. India is billed at the INR equivalent (₹96 at Sep 2026, published, changed only with the 90-day notice). No founding-customer discount below $1. Recorded in spec D18. |
| E2 | Minimums | **HRMS ₹499, ATS ₹999, Proctoring ₹999 in months with at least one attempt** ($5 / $10 / $10 outside India). YX-BILL-14. |
| E3 | Gateway fees | **Bank auto-debit (e-NACH) default for monthly, NEFT / RTGS for annual; 2 % bank-rail discount; cards at list price; virtual account per tenant.** YX-BILL-15. |
| E4 | Partner commission | **Deferred.** The founder will research partner commissions in the market first. §4 above is a reference schedule only, not adopted. P16 Q3 rates remain open. |
| E5 | Founding offer | Not adopted (see E1). |

Applied to spec D18, P14 (YX-BILL-09 margin test, YX-BILL-14, YX-BILL-15) and P16 (rates deferred).
