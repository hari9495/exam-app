# P20 · Growth, Trial & Customer Operations

> **Status:** ✅ Decided (5/5), 28 Sep 2026 (founder decisions on validation pass 3 Musts S1, S2, S3, S10, S11). Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:** [VALIDATION-PASS-3](VALIDATION-PASS-3.md) §2 **S2** (trial-to-paid journey), **S3** (5-minute first value per product), **S10** (public help centre), **S11** (incident and maintenance messages) and the business use of **S1** (product analytics). Raw evidence: [research/validation-pass-3/val3-platform-growth.md](research/validation-pass-3/val3-platform-growth.md).
> **What it is:** the machinery *around* the product that a $1 self-serve business needs:
> - a quick path to first value in every product;
> - a 30-day trial that turns into paid use without a sales team;
> - a public help centre that answers most questions before a ticket;
> - calm, fast, pre-approved messages when something breaks or needs maintenance.
>
> **Builds on:**
> - P09 §4.10 product analytics (event stream, `product.*` metrics, YX-MET-19–21);
> - P14 trial (Q4), billing from go-live (YX-BILL-12), tenant lifecycle, `cs_messages` / `cs_alerts`, customer success (YX-CONSOLE-05 / 06), status page and incident timings (YX-CONSOLE-07), product analytics access (YX-CONSOLE-08);
> - P13 brief #6 synthetic probes (S13) and #7 feature flags;
> - APX-E setup hub, quick start lanes (§1.6) and go-live readiness (§2);
> - APX-D §6 tours and contextual help;
> - P15 demo data; P04 channels; P12 incident response (YX-SECOPS-07);
> - brand guidelines Part 2 (voice and writing rules).
>
> **Pricing (D18):** included. Nothing here is an add-on.
> **Build:** everything before public launch; incident and maintenance templates and the status page before the wave-3 paid pilot.

---

## 1. Purpose & scope
YukthiX sells at $1 per unit per product (D18) with a published price and 90-day change notice (D20). At that price there is no room for a long sales cycle or heavy onboarding. Companies must:
- see value in their first session;
- learn the product without calling us;
- decide to switch on paid use inside the 30-day trial;
- trust us on the day something goes wrong.

P20 designs those four paths and the growth measures that show where people drop off.

**Out of scope:**
- the metric definitions and the event stream (P09 §4.10);
- prices, billing, invoices and the trial's legal limits (P14);
- the tenant's own HR helpdesk and knowledge base for employees (M08);
- feature flags and percentage rollout (P13 #7); A/B testing (Later, S19);
- the admin and partner academy with certification (Should, S10b).

**Voice.** Every customer-facing line here follows brand Part 2: short, calm, action-first; "switch on", "add product", "included"; never "plans", "tiers", "premium", "upgrade" or "unlock".

## 2. What exists today
- **Exam app:** self-serve organisation sign-up with Stripe checkout (P14 §2). No lifecycle messages, product analytics, public help centre or status page.
- **Design:**
  - P14 flow 1 (sign-up → trial → convert), trial banner, `billing.trial.ending.admin` (T-7, T-1), `cs_messages`, `cs_alerts` rule "set-up stalled > 14 days in trial";
  - P09 §4.9 B tenant-health feed (which tenant is at risk, not where people drop off);
  - APX-E setup hub (22 cards) and go-live checks, right for payroll go-live, slow for a trial;
  - APX-D §6.1 first-run tours and §6.2 contextual help model (one help topic per screen), with no public home for the articles;
  - P14 YX-CONSOLE-07 incident and maintenance timings, with no message content.
- **Missing:** quick start per product, activation definitions, lifecycle nudges, "switch on" moments, a sales-assist hand-off, trial extension rules, the public help centre, incident and maintenance templates.

## 3. Concepts
- **Quick start lane:** three steps per product, shown at the top of the setup hub, that reach the product's first value in about 5 minutes (APX-E §1.6):
  | Product | Lane | First value |
  |---|---|---|
  | YukthiX Assess | Pick a library test → check defaults → send an invite | First test invite sent |
  | YukthiX Hire | Company name and logo → job from a starter → post to the careers page | First job posted |
  | YukthiX HR | Company and entity → import employees from Excel → payslip preview | First payslip preview |
- **First value:** the event that shows the product working with the company's own (or sample) data. Recorded once per tenant × product.
- **Activation:** first value plus signs that the company will keep using the product, within 14 days of sign-up (starter definitions, team to tune with data):
  - **HR:** employees imported, a payslip preview, and a second admin invited or leave / attendance starters reviewed;
  - **Hire:** a job posted and at least one application moved to a next stage;
  - **Assess:** a test invite sent and at least one attempt completed.
- **Trial journey:** the 30-day trial (P14 Q4) with nudges on day 0, 1, 3, 7 and 14 chosen from setup-hub progress, "switch on" moments inside the product, a "talk to us" hand-off for larger companies, and extension rules.
- **Switch on:** the customer's decision to start paid use of a product: choose payment method, accept the terms (APX-G), and the product is theirs. **Billing still starts only at go-live** (YX-BILL-12); switching on during the trial costs nothing until then.
- **"Switch on" moment:** a short in-app card at a point where the next step needs a product or a live capability the tenant does not have yet.
- **Talk to us:** a hand-off from the self-serve path to a YukthiX person for trials above a size threshold or with complex needs. Offered, never forced.
- **Help centre:** help.yukthix.com, the public, searchable, versioned home of every help article and short video, linked from the in-app help drawer (APX-D §6.2).
- **Incident and maintenance messages:** pre-approved templates per stage, filled in by the on-call or support lead and published to the status page, in-app and by email (YX-CONSOLE-07).

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `quickstart_lanes` | Platform registry (code): product, ordered setup-step keys (APX-E registry), starters applied, first-value event key |
| `tenant_milestones` | Tenant × product: `signed_up_at`, `lane_started_at`, `first_value_at`, `activated_at`, `switched_on_at`, `went_live_at` (billing start, YX-BILL-12), size band, trial end, extensions used. Operational data (not product analytics); mirrored pseudonymously to `product_analytics.tenant_milestones` (P09) unless the tenant opted out |
| `trial_nudges` | Platform registry: key, day (0 / 1 / 3 / 7 / 14), product, condition (a setup-hub progress query), channels (in-app, email), template per locale, version, approved_by |
| `trial_nudge_sends` | Tenant × admin × nudge: sent / skipped (with reason: step already done, muted, daily limit), read, clicked step |
| `switch_on_moments` | Platform registry: key, trigger (module opened / trial limit reached / first value reached), product, audience roles, copy per locale |
| `switch_on_views` | Tenant × admin × moment: shown at, dismissed until, action (switch on / talk to us / not now) |
| `help_articles`, `help_article_versions` | Platform tables: key, product, module, screen IDs (APX-D), audience (admin / employee / candidate / partner / developer), locale, body, video ref (captions required), owner, status (draft / in review / published / archived), applies-from release, `last_reviewed_at` |
| `help_search_log` | Platform table: search term, locale, result count, clicked article, date. No tenant id, no user id; kept 13 months |
| `status_components` | Platform table: product × region × component (sign-in, payslips, bank files, test delivery, careers page, API) with current state, fed by P13 probes and staff |
| `incident_templates` | Platform table: kind (incident / maintenance / payroll-day note / post-incident), stage, locale, body with variables, version, approved_by |
| `status_incidents`, `status_updates` | Platform tables: severity, components, regions, affected-tenant rule, stage, times, template and version used, posted_by, approved_by |
| `maintenance_windows` | Platform table: components, regions, start / end, notice sent at, check result against each affected tenant's payroll-critical window and statutory dates (YX-CONSOLE-07) |
| `status_subscriptions` | Email, components, optional tenant; double opt-in; unsubscribe in one click |

Trial extensions are `tenant_lifecycle_events` of type `trial_extended` (P14) with who extended, reason and new end date. The sales-assist hand-off is a `cs_alerts` item with rule `trial_talk_to_us` (P14). Lifecycle nudges and incident notices are `cs_messages` of kind `lifecycle` and `incident` (P14 §4).

Tenant tables (`tenant_milestones`, `trial_nudge_sends`, `switch_on_views`) carry `organization_id` + RLS; the rest are platform tables.

## 5. Rules (YX-GRO)

| ID | Rule |
|---|---|
| YX-GRO-01 | **Quick start lanes (S3).** Every product has a registered quick start lane of at most three steps that reaches its first value with starter templates applied in one click (APX-E §1.6): Assess sends a library test invite, Hire posts a job to the careers page, HR imports employees from Excel and shows a payslip preview. Lane steps are ordinary setup steps (YX-ORG-23); a lane never marks a module ready or live, never skips a go-live check, and respects every trial limit (P14 Q4). Sample data (P15) can stand in for real data and is labelled on every screen. |
| YX-GRO-02 | **First value and activation (S1, S3).** First value and activation are recorded per tenant × product in `tenant_milestones` from the registered events, and measured only through the P09 `product.*` metrics (YX-MET-21). Activation definitions are versioned; a change applies to new cohorts and is noted in the metric changelog. |
| YX-GRO-03 | **Trial nudges (S2).** During a trial each admin who signed up, and each System Admin, gets nudges on day 0, 1, 3, 7 and 14, chosen from **setup-hub progress** (never from product-analytics events, so opted-out tenants get the same help): a nudge whose step is already done is skipped or replaced by the next suggested step. At most one lifecycle message per admin per day and none on a day the admin gets a CS message (YX-CONSOLE-06); admins can mute set-up tips in one click; only admins receive them, never employees or candidates. The existing trial-ending notices (T-7, T-1) are always sent. |
| YX-GRO-04 | **"Switch on" moments (S2).** A "switch on" card appears only when (a) an admin opens a product the tenant does not have, (b) a trial limit is reached (live bank file, statutory filing, partner add-on, bulk WhatsApp / SMS), or (c) the product's first value is reached. It states what the product does, the published price (YX-BILL-14) and that billing starts at go-live (YX-BILL-12), with **Switch on**, **Talk to us** and **Not now**. It never hides or blocks the tenant's own data or previews; a dismissed card is not shown again for 14 days; admins without billing permission see "Ask your System Admin" instead. |
| YX-GRO-05 | **Talk to us (S2).** A trial whose company is above the size threshold (starter: 200 employees imported or declared, 3 legal entities, 10 recruiters, or 2,000 test attempts expected; the team sets the numbers) or that asks for help with migration or a parallel run raises a `cs_alerts` item (`trial_talk_to_us`) to a sales-assist owner within one business day, and the admins see a "Talk to us" option to book a call. The self-serve path stays open; the price is the published price (no private discounting, YX-BILL-14). |
| YX-GRO-06 | **Trial extensions (S2; amended 28 Sep 2026, founder decision on trial end).** At day 30 the trial is **extended once, automatically, by 14 days** when the company has reached first value (YX-GRO-02); a company that has not reached first value can request the same single 14-day extension itself. This replaces the earlier self-serve 15-day extension (P14 Q4). A further extension is given only by YukthiX staff with a reason (for example, waiting for a payroll parallel run or the customer's approval), for at most 30 days at a time, audited and shown to the tenant's admins (YX-TEN-06 pattern). Extensions never change the rule that billing starts at go-live (YX-BILL-12). |
| YX-GRO-07 | **Help centre (S10).** help.yukthix.com is public and searchable, with versioned articles and short captioned videos per product, owned by the support lead. Every APX-D help topic links to a published article by key; a CI check fails the release when a screen's help key has no published English article. Articles are available in the four launch languages (English, Hindi, Tamil, Telugu); a missing translation shows the English article with a notice and is tracked by the owner. Screenshots use demo data only; articles carry no tenant data; each shows "applies from" (release or wave) and a last-reviewed date, and an article not reviewed for 12 months is flagged. Search terms are logged without tenant or user ids. |
| YX-GRO-08 | **Incident and maintenance messages (S11).** Every notice under YX-CONSOLE-07 uses an approved template for its stage: incident **investigating → identified → monitoring → resolved → post-incident summary**; maintenance **scheduled (≥ 72 hours ahead) → reminder (24 hours ahead) → started → completed** (or extended). Each message states the affected products, regions and components, the impact in plain words, what the company should do, and when the next update will come; when the incident falls in a tenant's payroll-critical window or on a statutory due date, the **payroll-day note** says whether payroll runs, bank files and filings are affected. A security incident that involves personal data follows P12 YX-SECOPS-07 and its legal notice, not these templates. Templates and changes to them need a second approver. |
| YX-GRO-09 | **Where messages go (S11).** Incident and maintenance messages go to the public status page (per product and region), in-app to the admins of affected tenants (always shown, YX-CONSOLE-06) and by email to those admins and to status-page subscribers. Employees and candidates see the status page link on the sign-in and error screens, not direct messages. Probe results (P13 #6) open or update the status components; a human confirms the stage wording. |
| YX-GRO-10 | **Growth data stays out of HR data (S1).** Growth, CS and support staff use only the P09 `product.*` metrics, `tenant_milestones`, setup-hub progress and billing status; never employee, candidate or payroll records. Nudges, "switch on" moments and the sales-assist hand-off are decided at tenant and admin level only. |

## 6. Flows
1. **First value, Assess (S3):**
   1. Sign up, choose YukthiX Assess.
   2. Quick start lane: pick "Customer support — English, 20 min" from the library.
   3. Defaults shown (proctoring profile, result visibility = status only).
   4. Send an invite to yourself; open it as a candidate.
   5. `first_value_reached`; the lane collapses; the "switch on" card (YX-GRO-04 c) and the next suggested card (reviewer pool) appear.
2. **First value, HR (S3):**
   1. Company name, one entity, state.
   2. Download the starter Excel sheet, fill 25 employees, upload; fix 2 rows in the preview.
   3. Apply the starter salary template; the payslip preview opens for the first employee.
   4. `first_value_reached`; the next suggested cards are Payroll (C11) and Leave (C07).
3. **Trial journey (S2):**
   1. Day 0: welcome (in-app + email) with the quick start lane.
   2. Day 1: "Finish your quick start" if first value is not reached; otherwise the next card.
   3. Day 3: the next incomplete required step, with its 2-minute help article.
   4. Day 7: progress summary (setup %), "invite a colleague", offer of a guided session.
   5. Day 14: what is left before go-live (readiness score), "Talk to us", how to extend.
   6. Day 21: self-serve extension available (YX-GRO-06).
   7. T-7 and T-1: trial ending (existing SCH-16 notices).
   8. Switch on at any point: payment method, terms, done. The meter starts at go-live.
4. **Talk to us (S2):** a trial imports 450 employees → `cs_alerts` `trial_talk_to_us` → the owner calls within one business day → optional assisted migration quote (P15 Q3) → the customer continues self-serve or with help.
5. **Incident (S11):**
   1. Probes fail for payslip view in India (P13 #6); on-call is paged.
   2. On-call opens an incident on the console from the "investigating" template; it is posted within 30 minutes (YX-CONSOLE-07).
   3. Updates at each stage, each with the next update time.
   4. Resolved; post-incident summary from its template, with cause, fix and prevention.
6. **Maintenance (S11):** staff propose a window → the console checks each affected tenant's payroll-critical window and statutory dates → notice ≥ 72 hours ahead → reminder 24 hours ahead → started → completed.
7. **Help article (S10):** support drafts → product owner reviews → published in English → translations follow → linked to screen help keys → yearly review flag.

## 7. UI
- **Setup hub:** quick start lane per product at the top (three steps, progress, "Use sample data"), collapsing to a "Done — next: …" strip.
- **Trial banner** (P14): days left, setup progress and **Switch on**.
- **"Switch on" card:** product name, one line on what it does, the published price per unit (e.g. HR: "₹96 a person a month. Everything included."), "Billing starts when you go live", buttons **Switch on** · **Talk to us** · **Not now**.
- **Talk to us dialog:** book a call slot, or ask a question by chat.
- **Settings › Billing & Account:** trial status and extension, product switch-on, non-essential analytics switch (P09 §4.10), status-page subscription, "mute set-up tips".
- **Help drawer** (APX-D §6.2): "Read more on help.yukthix.com" per topic.
- **Public:** help.yukthix.com (search, product sections, videos, language switch, "Was this helpful?", contact support); status page (components per product and region, history, subscribe).
- **Platform console:** growth dashboards (funnels, time to first value, cohorts, adoption; product analytics role only), nudge and "switch on" copy editor with preview and second approval, sales-assist queue, incident and maintenance composer with templates, help-centre editor.

## 8. Migration & rollout
- **Before the wave-3 paid pilot:** status page, incident and maintenance templates, status subscriptions; help-centre articles for the modules in the pilot.
- **Before public launch:** quick start lanes for all three products, trial nudges, "switch on" moments, "talk to us", extension rules, the full help centre in the four launch languages, growth dashboards (after P09 §4.10).
- **Exam-app organisations** get the help centre and status page at once; they already use their product, so they get no trial nudges.

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 Shoulds, group "Growth and operations" (option A: include all, before public launch). Source: research/validation-pass-3/SHOULD-DECISIONS.md.

| ID | What it does | Rule | When |
|---|---|---|---|
| S4 | What's new feed per product, with role-targeted announcements in app | YX-GRO-11 | Wave 6 |
| S5 | Feature requests with voting and status, public roadmap, opt-in beta / early access | YX-GRO-12 | Wave 6 |
| S6 | Cancellation reasons, save offers (pause, fewer products, partner help), win-back after deletion | YX-GRO-13 | Wave 6 |
| S7 | Customer referral: referrer and new company each get one month of their bill as credit after the new company's first paid month; "Powered by YukthiX" clicks attributed | YX-GRO-14 (credit mechanics P14 YX-BILL-21) | Wave 6 |
| S8 | Free public calculators (CTC to in-hand, old vs new regime, HRA, gratuity, PF / ESI, leave encashment) and letter generators (offer, appointment, payslip) | YX-GRO-15 | Wave 6 |
| S18 | Public integrations directory | YX-GRO-16 | Wave 6 |
| S10b | Admin and partner academy with certification | YX-GRO-17 | After public launch |

**Rules**

| Rule | Statement |
|---|---|
| YX-GRO-11 | **What's new feed.** Each product has a dated feed of changes; entries are targeted by role (admin, manager, employee) and by product switched on, shown once in app and kept on a feed page. Price or feature-change notices still follow P14 YX-BILL-12; the feed never replaces them. |
| YX-GRO-12 | **Feature requests, roadmap, beta.** Tenant users can raise and vote on requests (one vote per user per request); each request carries a status (under review, planned, in progress, shipped, not planned). The public roadmap shows only items marked public. Beta / early access is opt-in per company by an admin and can be switched off at any time; beta features are labelled in the UI. |
| YX-GRO-13 | **Cancellation and win-back.** Switching off a product or the company asks for a reason (fixed list + free text; answering is optional). Save offers shown: pause, fewer products, partner help; the customer can always cancel without accepting an offer, one click past the offers (no dark patterns). Win-back messages after deletion go only with marketing consent and stop on opt-out; deletion itself follows P14 YX-TEN-08. |
| YX-GRO-14 | **Referral.** A referral link / code is tied to the referring company. When the referred company completes its **first paid month**, both companies get one month of their own bill as credit (P14 YX-BILL-21). Self-referral and referrals between companies of the same group are not credited. "Powered by YukthiX" links (careers pages, payslips, public tools) carry attribution; clicks and resulting sign-ups are counted in the P09 §4.10 product metrics, never with HR data. |
| YX-GRO-15 | **Free public tools.** Public calculators reuse the P07 versioned calculators and rule-set parameters (same numbers as in the product, FY shown); letter generators reuse APX-F templates. No sign-up required; inputs are not stored beyond the session unless the user asks to email the result (with consent). Each result shows a "not tax advice" note and the rule-set version. |
| YX-GRO-16 | **Integrations directory.** A public page lists each integration (partner, category, what data moves, direction, status: live / beta / coming) from the same catalogue the product uses, so the directory never lists an integration the product does not have. |
| YX-GRO-17 | **Academy (after public launch).** Admin and partner courses with certification; certificates expire and can be verified by a public link. Partner certification is required before a partner implements for customers (P16 partner programme). |

**Acceptance tests**

- A referred company pays its first month: both the referrer and the new company show one month's bill as credit on their next invoice; a self-referral gets nothing.
- A user cancels a product: the reason prompt and save offers appear, and "cancel anyway" completes in one further click.
- The public CTC to in-hand calculator gives the same result as the payroll preview for the same inputs and FY, and shows the rule-set version.
- A beta feature switched on for company A is not visible to company B, and is labelled "beta" for company A.


## 9. Acceptance tests (samples)
- A new Assess tenant sends its first invite within 5 minutes of verification using only lane steps; the C20 card shows the same steps done (YX-GRO-01).
- A HR trial lane shows a payslip preview but offers no bank file and no filing; the C11 card still shows every go-live check open (YX-GRO-01).
- An admin who finished the quick start on day 0 gets no "Finish your quick start" message on day 1 (YX-GRO-03).
- A tenant that switched off non-essential analytics still gets the day 3 nudge based on setup progress (YX-GRO-03, YX-MET-20).
- An HR admin without billing permission sees "Ask your System Admin" on the "switch on" card; a dismissed card reappears only after 14 days (YX-GRO-04).
- No customer-facing string in the trial and switch-on copy contains "upgrade", "plan", "tier", "premium" or "unlock" (brand Part 2).
- A trial importing 450 employees raises a `trial_talk_to_us` alert; the "Talk to us" option appears for its admins (YX-GRO-05).
- A second self-serve extension request is refused; a staff extension without a reason cannot be saved (YX-GRO-06).
- A release adding a new screen whose help key has no published English article fails CI (YX-GRO-07).
- A Sev-1 incident posted at 10:00 reaches affected admins by 10:30 with a next-update time; a maintenance notice sent 60 hours ahead is refused (YX-GRO-08, YX-CONSOLE-07).
- A payroll-day incident message on the 30th includes the payroll-day note (YX-GRO-08).
- The sales-assist queue shows the tenant name, size band and setup progress but no employee names (YX-GRO-10).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | How fast should a trial reach value? (S3) | **A quick start lane per product** beside the setup hub: Assess sends a library test, Hire posts a job, HR imports employees and sees a payslip preview; the go-live checks stay for payroll. |
| Q2 | How does a trial become paid use? (S2) | **Day 1 / 3 / 7 / 14 nudges tied to setup-hub progress, in-app "switch on" moments, "talk to us" above a size threshold, and clear extension rules**; billing starts at go-live. |
| Q3 | Where do admins learn the product? (S10) | **help.yukthix.com**: public, searchable, versioned articles and short videos per product, linked from in-app help, four launch languages, owned by support; academy later. |
| Q4 | What do we say when something breaks? (S11) | **Pre-approved templates per stage** (investigating / identified / monitoring / resolved / post-incident) and for maintenance (≥ 72 hours), sent to the status page, in-app and email, with a payroll-day note. |
| Q5 | How does the growth team see where trials drop off? (S1) | **Our own product analytics on the P09 metric layer** (no third-party tool), pseudonymous and free of HR data; P20 uses the `product.*` metrics only. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| S3 | **Validation pass 3 Must (S3), founder decision 28 Sep 2026 (option A): 5-minute first value per product.** Quick start lane beside the 22-card setup hub: **Assess** pick a library test → send an invite; **Hire** post a job to the careers page; **HR** import employees from Excel → payslip preview. Go-live checks for payroll unchanged. APX-E §1.6; YX-GRO-01 / 02. | 28 Sep 2026 |
| S2 | **Validation pass 3 Must (S2), founder decision 28 Sep 2026 (option A): trial-to-paid journey.** Day 1 / 3 / 7 / 14 nudges tied to setup-hub progress, in-app "switch on" moments, "talk to us" hand-off for trials over a size threshold, trial extension rules; billing starts at go-live (YX-BILL-12). YX-GRO-03–06. Team action: set the size threshold. | 28 Sep 2026 |
| S10 | **Validation pass 3 Must (S10), founder decision 28 Sep 2026: public help centre.** help.yukthix.com, public, searchable, versioned articles and short videos per product, linked from contextual help, four launch languages, owned by support; admin and partner academy later (S10b). YX-GRO-07. Team action: name the support lead as owner. | 28 Sep 2026 |
| S11 | **Validation pass 3 Must (S11), founder decision 28 Sep 2026: incident and maintenance message templates.** Stages investigating / identified / monitoring / resolved / post-incident; maintenance notice ≥ 72 hours; linked to P14 YX-CONSOLE-07; notification types to be added to APX-A. YX-GRO-08 / 09. | 28 Sep 2026 |
| S1 | **Validation pass 3 Must (S1), founder decision 28 Sep 2026 (option C): product analytics, business use.** Growth, CS and support use the P09 §4.10 `product.*` metrics (funnels, time to first value, cohorts, feature adoption) and `tenant_milestones`, never HR data; staff access per P14 YX-CONSOLE-08. YX-GRO-02 / 10. | 28 Sep 2026 |
| Trial end | **Founder decision 28 Sep 2026 (option B):** one automatic 14-day extension when first value is reached (otherwise one self-serve 14-day extension on request), then P14 YX-TEN-08: 30 days read-only with export, reminders, then deletion with a certificate unless the company switches on. |  28 Sep 2026 |
| S4 | **Validation pass 3 Should (S4), founder decision 28 Sep 2026: what's new feed per product, role-targeted announcements.** Rule YX-GRO-11. | 28 Sep 2026 |
| S5 | **Validation pass 3 Should (S5), founder decision 28 Sep 2026: feature requests with voting and status, public roadmap, opt-in beta.** Rule YX-GRO-12. | 28 Sep 2026 |
| S6 | **Validation pass 3 Should (S6), founder decision 28 Sep 2026: cancellation reasons, save offers (pause, fewer products, partner help), win-back.** Rule YX-GRO-13. | 28 Sep 2026 |
| S7 | **Validation pass 3 Should (S7), founder decision 28 Sep 2026: referral: referrer and new company each get one month of their bill as credit after the new company's first paid month; "Powered by YukthiX" attribution.** Rule YX-GRO-14. | 28 Sep 2026 |
| S8 | **Validation pass 3 Should (S8), founder decision 28 Sep 2026: free public calculators (P07) and letter generators (APX-F).** Rule YX-GRO-15. | 28 Sep 2026 |
| S18 | **Validation pass 3 Should (S18), founder decision 28 Sep 2026: public integrations directory.** Rule YX-GRO-16. | 28 Sep 2026 |
| S10b | **Validation pass 3 Should (S10b), founder decision 28 Sep 2026: admin and partner academy with certification (after public launch).** Rule YX-GRO-17. | 28 Sep 2026 |
