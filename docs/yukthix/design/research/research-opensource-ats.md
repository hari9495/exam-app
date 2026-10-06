# Market Research: Open-Source HR/Payroll and ATS/Recruiting — Complaints, Gaps, Pricing

Prepared for YukthiX (HRMS / payroll / ATS SaaS). Date: 2026-09-26.
Method: ~55 web searches + ~45 direct page fetches (GitHub issue trackers, discuss.frappe.io, Odoo forum, Capterra/SoftwareAdvice/SourceForge/Trustpilot review pages, Hacker News, Teamblind, vendor-neutral pricing round-ups). G2 pages returned HTTP 403 and could not be read directly; G2 findings below come via search snippets or third-party aggregators and are marked as such. Reddit was not directly fetchable; Reddit-sourced claims come from secondary write-ups and are marked "secondary".

Legend for frequency: **High** = appears in 3+ independent sources or is an aggregated review theme; **Medium** = 2 sources; **Low/anecdotal** = single source. Reviewer type: R = recruiter/HR practitioner, A = admin/IT/self-hoster, C = candidate, HM = hiring manager, Ag = staffing agency.

---

## PART A — OPEN-SOURCE HR / PAYROLL

### A1. Frappe HR (frappe/hrms) / ERPNext HRMS

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| **No official production self-hosting guide**; docs cover Frappe Cloud + Docker dev only | Issue #2818 "Production Self-Hosting Guide for Frappe HRMS", opened 2025-02-28, still open, 0 comments, among top-reacted open issues — https://github.com/frappe/hrms/issues/2818 | Medium (top-reacted) | A |
| **India statutory reports missing in core**: ESI returns, PF employer/employee contribution, PF challans | Issue #2174 "[India Payroll] PF, TDS and ESIC Reports", opened 2024-09-13 by a core maintainer (ruchamahabal), open, 0 comments — https://github.com/frappe/hrms/issues/2174 | Medium | R/A |
| India statutory logic lives in a **separate, small extension app** (frappe/india-payroll: PF w/ wage ceiling + ECR, ESI, PT, LWF, TDS, Form 16, Form 24Q). Only ~23 stars / 30 forks, 9 open issues, no tagged release visible; gratuity not mentioned | https://github.com/frappe/india-payroll (README) | — (fact) | A |
| **Income tax computed wrong** in payroll (v15.95) — open bug, no maintainer reply | Issue #3990, 2026-01-23 — https://github.com/frappe/hrms/issues/3990 | Low | R |
| Only **one Income Tax Slab per salary structure assignment**; request for multiple slab components open since 2022-10-27 | Issue #111 — https://github.com/frappe/hrms/issues/111 (top-reacted) | Medium | A |
| Payroll Entry fails with "Salary Slip … already exists" (re-run after partial failure) | Issue #3549 (2025-09-02) — https://github.com/frappe/hrms/issues/3549 ; Issue #2855 — https://github.com/frappe/hrms/issues/2855 | Medium | R/A |
| Loan repayment deducted from Net Pay but not displayed on slip preview | Issue #5093 — https://github.com/frappe/hrms/issues/5093 | Low | R |
| Half-day on holiday shows LOP 0.5 — settings interplay ("Consider Marked Attendance on Holidays") confusing; thread left unresolved | https://discuss.frappe.io/t/salary-slip-issue/134739 | Low | R |
| Amending a timesheet-based salary slip does not refresh hours/gross | https://discuss.frappe.io/t/issue-with-salary-slip-based-on-timesheet/30075 | Low | R |
| **Mobile (PWA) limitations**: check-in form not dynamic (can't add Project/Image fields) — #5277 (Sep 2026); theme config request for ESS mobile app — #3942 (top-reacted); geolocation check-in was a feature request (#1693) and **geofencing still requires custom JS** per 22-reply forum thread | https://github.com/frappe/hrms/issues/5277 ; https://github.com/frappe/hrms/issues/3942 ; https://github.com/frappe/hrms/issues/1693 ; https://discuss.frappe.io/t/geolocation-based-employee-attendance-check-in-system/72104 | High | A/R |
| Holiday list must be recreated yearly ("Auto-extend Holiday List" request, top-reacted) | https://github.com/frappe/hrms/issues/3154 | Medium | A |
| Backlog: **442 open issues** on frappe/hrms (2026-09) | https://github.com/frappe/hrms/issues | — | — |
| **Security (self-hosted only)**: Frappe Framework CVE-2025-52895 (SQLi, 8.7), CVE-2025-52896 (stored XSS via Data Import, 8.6), CVE-2025-52898 (password-reset token leak/account takeover, 8.7); fixed 15.58.0 / 14.94.3. Later CVE-2025-55731 (SQLi, fixed 15.74.2/14.96.15). ERPNext CVE-2025-52039/52042/52044 (SQLi), CVE-2025-66439 (through 15.89.0). Vendor messaging: "Frappe Cloud users are safe" — self-hosters must patch themselves | https://securityonline.info/security-flaws-in-frappe-framework-expose-self-hosted-erpnext-users-to-takeovers-xss-and-sql-injection/ ; https://www.sentinelone.com/vulnerability-database/cve-2025-52895/ ; https://www.sentinelone.com/vulnerability-database/cve-2025-55731/ ; https://github.com/advisories/GHSA-6329-q89j-9c7m | High | A |
| **Upgrade pain**: v14→v15 and v15→v16 need branch switch + `bench migrate`; breaking changes (Serial & Batch Bundle, Cashflow mapper removed) documented on wiki; third-party "upgrade playbooks" and paid "migration toolkits" exist, implying demand | https://github.com/frappe/erpnext/wiki/Migration-Guide-to-ERPNext-version-15 ; https://bwh.tech/blog/tutorial/the-erpnext-upgrade-playbook/ ; https://4devnet.com/erpnext-16-migration-complete-upgrade-guide/ | Medium | A |
| India GST side (resilient-tech/india-compliance): **107 open issues** incl. GSTR-2B not populating in Purchase Reconciliation (#4815), TCS folded into taxable value (#4939), e-Invoice/e-Way Bill actions block UI (#4845), multi-vehicle e-Way Bill (#4878) | https://github.com/resilient-tech/india-compliance/issues | Medium | A |

Uncertainty: could not fetch Reddit threads on "why we left ERPNext"; the self-hosting/TCO pain is inferred from #2818, the CVE cadence and the existence of paid migration guides rather than direct testimonials.

### A2. OrangeHRM (Open Source / Starter)

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| **Payroll, budgeting absent** in OSS edition; REST API, integration bus, payroll connectors (ADP/QuickBooks), LDAP/SSO, advanced ATS, performance mgmt gated to paid "Advanced" tier | https://www.opentechhub.io/orangehrm/ ; https://www.hrmsworld.com/open-source-hrms-guide.html | High | A |
| Fixed role model (Admin/ESS), "no configurable RBAC" | https://www.opentechhub.io/orangehrm/ | Medium | A |
| No built-in backup; leave policies complex; native reporting limited; "hard to set up… somewhat buggy… very slowly" | https://www.softwareadvice.com/hr/orangehrm-profile/reviews/ (search snippet) | Medium | A/R |
| SourceForge (4.1/5, 44 reviews) 1-star themes: "cannot even create a user"; "error unauthorized keeps popping" (2024); Leave module "can not see the holiday balance"; ">10 Projects" limit, no travel-expense module | https://sourceforge.net/projects/orangehrm/reviews/ | Medium | A |
| **Opaque paid pricing**: "up to email number 18 trying to get a price for the Professional version" | same SourceForge page | Medium | A |
| **CVEs 2025-26**: CVE-2025-66224 (5.0–5.7, unsanitized values into sendmail → file write/RCE; fixed 5.8; published 2025-11-30); CVE-2025-66289 (sessions not invalidated on disable/password change); CVE-2025-66290 (any ESS user can download candidate CVs, CVSS 5.3); CVE-2026-39348 (5.0–5.8, job-spec/vacancy attachment download without authz) | https://bitninja.com/blog/critical-orangehrm-vulnerability-cve-2025-66224/ ; https://osv.dev/vulnerability/CVE-2025-66290 ; https://osv.dev/vulnerability/CVE-2025-66289 ; https://www.cvedetails.com/product/10468/Orangehrm-Orangehrm.html?vendor_id=6180 | High | A |
| TCO: "IT staff comfortable tuning and patching a LAMP application"; single-app architecture, vertical scaling only; self-hosted instances carry no vendor attestations | https://www.opentechhub.io/orangehrm/ | Medium | A |

### A3. Odoo HR / Payroll (Community vs Enterprise)

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| **Payroll app is Enterprise-only**; Community users must use third-party/OCA modules ("By default the payroll apps is part of enterprise edition") | https://www.odoo.com/forum/help-1/is-the-payroll-module-available-on-the-community-edition-for-version-16-269835 ; https://www.odoo.com/forum/help-1/payroll-not-found-193354 ; https://www.odoo.com/forum/help-1/payroll-not-showing-as-app-available-for-install-212304 | High | A |
| **India localization (PF, ESIC, PT, LWF, TDS) is Enterprise**; GSTR e-filing module `l10n_in_reports_gstr` also Enterprise ("missing from Odoo 16" thread) | https://www.odoo.com/documentation/19.0/applications/hr/payroll/payroll_localizations/india.html ; https://www.odoo.com/forum/help-1/india-localization-module-l10n-in-reports-gstr-missing-from-odoo-16-228591 | High | A |
| OCA/payroll and marketplace "Indian Payroll" apps exist but bug support is per-publisher; Form 16 / gratuity coverage unconfirmed | https://github.com/OCA/payroll ; https://apps.odoo.com/apps/modules/16.0/ob_indian_payroll | Medium (uncertain) | A |

### A4. Sentrifugo

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| **Effectively unmaintained**: infrequent updates, forums "now quiet", PHP-compatibility patches wait "months or even years" (competitor blog — treat as biased but consistent with CVE record) | https://icehrm.com/blog/icehrm-vs-sentrifugo-free-open-source-hr-compared-q-76/ | Medium | A |
| Unpatched **SQLi (CVE-2020-10218 'id'; 'deptid' blind SQLi), stored XSS, file-upload bypass** in 3.2 with public exploits | https://www.exploit-db.com/exploits/48179 ; https://www.exploit-db.com/exploits/45266 ; https://app.opencve.io/cve/?product=sentrifugo&vendor=sentrifugo | High | A |

### A5. IceHrm

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| "Poor documentation about the API and the development environment"; dated UI; "support takes forever to reply"; setup slow; notifications weak | https://www.capterra.com/p/147873/IceHrm/reviews/ ; https://www.getapp.com/hr-employee-management-software/a/icehrm/reviews/ (snippets) | Medium | A/R |
| Release notes list fixes for custom-field labels not displaying, supervisors unable to "switch employee", managers creating reviews for non-reports, "critical security fixes" | https://icehrm.gitbook.io/icehrm/release-notes/release-notes-open | Low | A |

### A6. Horilla (Cybrosys)

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| **120 open issues** (2026-09); recent bugs: "creating a payslip 500s after committing" (#1238), "Unpaid leave is deducted twice" (#1225), "archived employee can still log in" (#1239), ZKTeco biometric scheduler creates duplicate attendance (#1227), Settings endpoints 500 (#1229), DEBUG=False breaks logout (#1237) | https://github.com/horilla/horilla-hr/issues | High | A |
| **Security**: 2.1.8 (2026-09-26) fixed **unauthenticated RCE via anonymous file upload on recruitment portal**, geofence bypass, IP-header spoofing; 2.1.7 fixed archived users retaining login; earlier release sandboxed payroll tax code to prevent RCE. 2.1.7 has a **non-reversible DB migration** | https://github.com/horilla-opensource/horilla/releases | High | A |
| Roadmap/issue triage depends on a single vendor (Cybrosys) | https://www.opensourcealternatives.to/item/horilla (opinion) | Low | A |

### A7. Bitrix24 (free plan)

| Complaint / gap | Evidence | Freq. | Who |
|---|---|---|---|
| HR features (role-based permissions, employee reports, time-tracking in tasks) restricted to top plans; free plan 5 GB, task limits after 100 tasks | https://helpdesk.bitrix24.com/open/25911331/ ; https://www.jibble.io/reviews/bitrix24 ; https://www.larksuite.com/en_us/blog/bitrix24-review | High | A |
| Trustpilot 2.1/5 (113 reviews): support "days, if not weeks"; mobile app crashes/forced logouts; **email sync failures**; features disabled on regional servers without disclosure; hard to delete accounts; no refunds | https://www.trustpilot.com/review/bitrix24.com | High | A |
| Steep learning curve is the most common complaint across 1,500+ reviews (aggregator) | https://www.uctoday.com/project-management/bitrix24-review-crm-project-management-and-more/ | High | A/R |

### A8. Kimai (timesheets) and TimeOff.Management (leave)

| Product | Complaint / gap | Evidence | Freq. |
|---|---|---|---|
| Kimai | **301 open issues**; data-integrity bug: concurrent timesheet creation bypasses overlap rules (#6168); "Cannot stop running timesheet" (#2273); timesheet import missing (#2754); API bug (#2550); requests for persistent filters/customer search. Working-hours/vacation/holidays is a **paid plugin** (kimai.org store "controlling") | https://github.com/kimai/kimai/issues ; https://github.com/kimai/kimai/issues/2273 ; https://github.com/kimai/kimai/issues/2754 ; https://www.kimai.org/en/store/controlling.html | Medium |
| TimeOff.Management | **218 open issues, 48 open PRs**; open security issues: "Leave revoke workflow bypass + hardcoded session secret" (#587, Mar 2026), "whole project is vulnerable to CSRF", LDAP auth broken; issues from 2023–2026 unresolved | https://github.com/timeoff-management/timeoff-management-application/issues | High |

### A9. Cross-cutting: why companies abandon self-hosted OSS HR (synthesis)

1. **Statutory gap is the deal-breaker in India**: none of the free editions ship complete PF/ESI/PT/LWF/TDS returns (ECR, ESI return, 24Q, Form 16) in core; Frappe puts it in a low-traffic extension, Odoo puts it behind Enterprise, OrangeHRM/Horilla/IceHrm/Sentrifugo have no Indian statutory engine at all.
2. **Security cadence**: 2025–26 saw high-severity CVEs in Frappe (3×~8.7), OrangeHRM (RCE), Horilla (unauth RCE), and unpatched ones in Sentrifugo and TimeOff.Management. Vendors explicitly say cloud tenants are protected while self-hosters must patch.
3. **Upgrade pain**: major-version migrations require CLI work, have breaking schema changes, and in Horilla's case irreversible migrations.
4. **Feature gating**: "open core" reality — API/SSO/payroll connectors (OrangeHRM), payroll (Odoo), working-hours plugin (Kimai), HR permissions (Bitrix24) are paid.
5. **Mobile**: PWA-only (Frappe), no geofencing without custom code, crashing apps (Bitrix24), dated UI (IceHrm, OrangeHRM).
6. **Support**: community forums slow/quiet; issues sit with 0 comments for 12–18 months (Frappe #2174, #2818).

---

## PART B — ATS / RECRUITING

### B1. Greenhouse

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| **Reporting** "fine for basics but not as robust as we'd like"; "custom reports exist, there are many limitations"; date-range reporting hard; slows when doing data/reporting or Google connector | https://www.softwareadvice.com/hr/greenhouse-profile/reviews/ (4.5/5, 765) ; https://www.g2.com/products/greenhouse/reviews?qs=pros-and-cons (snippet) | High | R |
| **Click-heavy / dated UI**: "extremely 'click-heavy'"; r/recruiting: "too many clicks to do anything and just an outdated UI" (secondary) | SoftwareAdvice ; https://curriculo.me/blogs/reddit-ats-complaints-2026/ | High | R |
| **Scheduling**: "native scheduling still lacks the complexity needed"; "not having time zones within the scheduling aspect" | SoftwareAdvice | Medium | R |
| **Duplicates**: "same candidate could appear multiple times"; resume parsing "not always accurate" | SoftwareAdvice | Medium | R |
| **Email/outreach**: "does not offer native candidate outreach sequences" → separate tool needed | SoftwareAdvice | Medium | R |
| **HM adoption**: "scorecard submissions are too easy to skip for people who aren't in the tool daily"; needs "constant training" | SoftwareAdvice | Medium | R/HM |
| Job-board posting limited: "cannot easily post to more job boards"; weak CRM/rediscovery | SoftwareAdvice ; hrstechspace review | Medium | R |
| HRIS integration shallow: BambooHR sync "only transferred a few things like the candidate's name" | https://news.ycombinator.com/item?id=47076001 thread / Capterra snippet | Low | R |
| **Pricing**: "quite pricey"; "astronomical price offer" at renewal; opacity | SoftwareAdvice ; G2 snippet | High | R/A |

### B2. Lever (Employ)

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| Reporting "hard to get meaningful data" (Owner, Staffing); "reporting module is not the greatest" | https://www.capterra.com/p/142452/Lever/reviews/?page=4 (4.6/5, 654) | High | R/Ag |
| "Scheduling interviews can be a pain"; "cannot request candidate availability"; cannot import email signature to templates | same | Medium | R |
| "Doesn't allow sourcing with key words"; "lacks a lot of automation" | same | Medium | R/Ag |
| "Customization has to be done through support"; single unified workflow, no per-department workflows | same | Medium | A |
| No EU-hours support ("wait until next day") | same | Low | R |
| **Candidate side**: candidates can be archived while job stays live; "almost zero self-service visibility" → r/recruitinghell threads (secondary) | https://leonstaff.com/blogs/lever-application-status-meaning/ ; https://curriculo.me/blogs/reddit-ats-complaints-2026/ | Medium | C |
| Upsell instead of fixing core; inadequate support post-acquisition (Trustpilot, low volume) | https://ca.trustpilot.com/review/lever.co (snippet) | Low | A |
| Opaque pricing; add-ons inflate quotes 40–60% (secondary) | curriculo.me | Medium | A |

### B3. Workable

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| **Add-on creep**: video interviews ($99/mo) + SMS ($79/mo) push Standard from $299 to $477/mo (+59%) | https://www.pin.com/blog/workable-pricing/ (snippet) | High | A |
| **Headcount cliff**: 20→21 employees triggers ~67% price jump; per-seat hiring-manager fees (~$50/seat, secondary) | same ; https://curriculo.me/blogs/reddit-ats-complaints-2026/ | High | A |
| Inflexible contracts, unexpected fees, unclear billing | https://www.capterra.com/p/130175/Workable/reviews/ (snippet) | Medium | A |
| Less customizable fields/workflows than enterprise ATS; limited CRM; reporting lags | https://www.outsail.co/post/workable-reviews---pricing-pros-cons-and-user-feedback | Medium | R |

### B4. SmartRecruiters (SAP)

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| Custom reports difficult; "creating reports and reviewing schedules/interviews could not be customized" | https://www.softwareadvice.com/hr/smartrecruiters-profile/reviews/ (4.2/5, 152) | High | R |
| Support inconsistent "for users on the lower tier pricing plan" | same | High | A |
| Candidate-status customization missing ("so candidates can clearly see where they are"); HTML email customization inflexible | same | Medium | R/C |
| **Agency portal "being mothballed and doesn't have a great deal of functionality"** | same | Low (important for Ag) | Ag |
| Mobile app doesn't match desktop; email notification reliability | G2 snippet via skima.ai | Medium | R |
| Free tier discontinued post-SAP; entry now ~$15k/yr (secondary) | https://leonstaff.com/blogs/ats-pricing-comparison-2026/ | Medium | A |

### B5. iCIMS

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| "Clunky system", "UI… looks like it's from 2005", "feels like 1999"; 3 minutes to input a candidate | https://capterra.com/p/93248/iCIMS-Recruit/reviews/ (4.3/5, 824) ; https://softwarefinder.com/hr/icims-talent-cloud/reviews | High | R |
| **Admin dependency**: "heavily relies on administrators for some simple things"; ticket for minor changes | Capterra ; SelectSoftwareReviews | High | R |
| Sluggish with multiple tabs; mobile "not optimized for cell use"; resume search ineffective | Capterra | Medium | R |
| Integration fees "ridiculously excessive" ($2k–$10k per integration per year, secondary) | Capterra ; leonstaff | Medium | A |
| Candidate: "too many steps to fill out" | Capterra (Banking, 10k+) | Medium | C |
| Contract traps: **36-month terms, 5–7% escalators, per-employee billing** ("3,000-person company pays for 3,000 people, even if only 8 recruiters touch the system"), module sprawl doubling year-2 cost | https://prepzo.ai/blog/icims-pricing | Medium | A |

### B6. Zoho Recruit

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| Support slow/vague, "no phone calls, no demo" for small agency | https://www.capterra.com/p/125768/Zoho-Recruit/reviews/ (4.5/5, 1,288) ; SoftwareAdvice snippet | High | Ag |
| Fields can't be hidden/renamed/deleted; cluttered UI; dated elements | same | High | R/Ag |
| Resume parsing needs improvement; M365 integration needs technical help; jobs don't auto-hide after close date | Capterra | Medium | Ag |
| Mobile app limited vs desktop; reporting inflexible for complex workflows | Capterra | Medium | R |
| Confusing packages/add-ons; essential features gated in lower tiers | SoftwareAdvice snippet | Medium | A |

### B7. Freshteam (Freshworks) — SUNSET

Facts: announced 2026-01-07; new signups and renewals stop 2026-03-07; one-year renewals allowed for contracts expiring before that, access ends by April 2027; product folded into "Freshservice for Business Teams" (an ITSM product) — https://www.peoplematters.in/news/business/freshworks-to-end-freshteam-hr-product-stop-renewals-from-march-2026-47939 ; https://100hires.com/freshteam-alternatives.html . "~9,000 companies" figure appears in a vendor blog title (lenavio.com) — unverified. Migration pain: replacing with a pure ATS loses the onboarding/employee-document half; Zoho publishes a Freshteam→Zoho Recruit CSV/XML migration path (users → candidates → clients → jobs → interviews/notes/attachments) — https://help.zoho.com/portal/en/kb/recruit/essentials/data-management/data-migration/articles/how-to-migrate-data-from-freshteam-to-zoho-recruit . **Opportunity: displaced SMB customers wanting ATS + onboarding in one.**

### B8. Recruitee / Teamtailor / Ashby

| Product | Complaint | Evidence | Freq. |
|---|---|---|---|
| Ashby | Steep setup; needs a dedicated admin; HM usability; **no mobile app**; **"merging duplicate candidate profiles doesn't fully resolve the issue"**; AI criteria filter "not consistently accurate"; **priced by total headcount** — "good until you grow", bill doubles when staff doubles; SSO $100/mo add-on on Foundations | https://skima.ai/blog/product-deep-dives/ashby-reviews ; https://www.dover.com/blog/ashby-ats-review-pricing-alternatives (snippet) ; curriculo.me | High |
| Teamtailor | Analytics "custom reporting requires workarounds"; per-seat cost escalates (~€99/seat/mo); limited CRM/sequences; complex approval chains hard; "not ideal for agencies"; pricing no longer public | https://perfectlyhired.com/knowledge-hub/ats-recruitment-technology/teamtailor-review-pros-cons ; https://www.hrstacks.com/product/teamtailor/ | Medium |
| Recruitee | Fewer complaints surfaced; positioned as transparent ($199/mo start) — praise more than pain | https://www.itqlick.com/compare/teamtailor/recruitee ; selecthub | Low |

### B9. JazzHR (Employ)

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| **Auto-renewal / cancellation**: "auto-renew you for a year without your consent"; "auto upgraded to a more expensive tier… without warning"; "difficult to cancel… siting small print"; 30-day notice ignored | https://www.trustpilot.com/review/jazzhr.com (2.3/5, 7 reviews — low volume) ; Capterra snippet | High (in low-volume sample) | A |
| Support waits "2 to 3 hours", tickets unresolved for days | Trustpilot | Medium | A |
| Price rises with no new features; extra charges for reporting/integrations | https://hrtechfeed.com/real-jazzhr-reviews-pros-cons-and-what-830-users-really-say/ ; ismartrecruit | Medium | A |
| Botched Lever→JazzHR migration ("historical records dumped… no structure") | Capterra snippet | Low | A |
| Reporting hard, little customization; **no mobile app** | Capterra/SelectSoftwareReviews snippets | Medium | R |

### B10. Bullhorn (staffing)

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| **Speed/timeouts**: "performance and speed negative in 80% of 55 reviews"; "login and timeout… negative in 85% of 33 reviews"; 5–10 s searches | https://www.leonar.app/blog/bullhorn-reviews/ ; https://www.capterra.com/p/140531/Bullhorn-Recruiting-Software/reviews?page=2 | High | Ag |
| **Search** "the worst I've ever seen"; Boolean needs training; inaccurate | Capterra ; G2 snippet | High | Ag |
| **Parsing** "limited to predefined job title keywords, frequently produces errors"; missing applications | Capterra ; leonar | Medium | Ag |
| **Hidden costs**: email automation and advanced features are paid add-ons; "$99–$199/user/mo" + modules; implementation avg ~$20k; 6–12 week basic, 3–6 month complex implementations; 62% cite pricing (SIA 2023 survey, secondary) | Capterra ; leonar ; juicebox.ai/blog/bullhorn-alternatives (snippet) | High | Ag |
| Dated UI; 40+ h training (secondary) | G2 snippet ; juicebox | High | Ag |
| **Weak for temp/shift staffing**: "works well for permanent recruitment but lacks features for temporary/shift-based staffing models" | Capterra p2 | Medium | Ag |
| Praise: central record candidate→placement; 350+ marketplace integrations; staffing depth | leonar | — | Ag |

### B11. Ceipal (India/US IT staffing)

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| Slow under load: "during peak usage hours, some pages take longer to load"; lag during bulk email, large searches, multi-tab | https://www.capterra.com/p/226634/CEIPAL-ATS/reviews/ (4.6/5, 1,264) | High | Ag |
| **Duplicates / parsing**: "sometimes it shows the same resume repeatedly"; "empty profiles from job boards without contact details"; errors moving resumes | Capterra ; SoftwareAdvice snippet | High | Ag |
| "UI… very outdated and has far too many clicks"; layout "very confusing" | Capterra | High | Ag |
| Reporting: dashboards only last 3 months, older data needs separate BI module; "could be more customizable" | skima.ai ; Capterra | Medium | Ag |
| Mobile app lacks desktop features; migration from prior ATS failed on format | skima.ai | Medium | Ag |
| No public per-seat pricing → procurement friction | skima.ai | Medium | A |
| Praise: VMS (vendor management) + workforce mgmt (timesheets, expenses, compliance docs) built in; AI matching; job-board integrations | ismartrecruit comparison ; Capterra | — | Ag |

### B12. Naukri RMS

| Complaint | Evidence | Freq. | Who |
|---|---|---|---|
| Search returns irrelevant profiles; outdated/inactive resumes in DB | https://www.capterra.com/p/169303/Naukri-RMS/reviews/ (4.3/5, 43) ; getapp | High | R/Ag |
| **"Lack of an integrated interview scheduling and communication interface"** | Capterra | Medium | R |
| Mobile app "confusing and inefficient", "didn't work properly" | Capterra ; getapp | High | R |
| Expensive add-ons (verification); rising subscription cost; India-only | Capterra ; softwaresuggest | Medium | A |
| OTP login friction; fake profiles | alternatives.co snippet | Low | R |

### B13. Candidate-side complaints (cross-ATS)

| Complaint | Evidence | Freq. |
|---|---|---|
| **Upload resume then re-type everything** (esp. Workday); parser "fails consistently… faster to enter data manually"; Workday insider: "Complicated or clumsy UIs are a good thing for job application websites" (filters "lazy" applicants); commenter: "candidates are losing thousands of opportunities bc the stupid thing didn't pull their work history" | https://www.teamblind.com/post/uploading-your-cv-and-still-having-to-enter-all-the-data-into-a-webform-37nxnhh5 ; https://www.teamblind.com/post/i-am-responsible-for-workdays-recruiting-ui-for-applicants-kzskqq05 ; https://www.teamblind.com/post/why-are-workday-job-applications-so-awful-hnw1avje | High |
| Multiple account registrations / lockouts per employer (Workday) | https://www.teamblind.com/post/current-state-of-industry-e46t17fw | Medium |
| **Black hole / no status**: HN — recruiters "leave 75% unreviewed"; "recruiter is literally waiting 5-10 seconds for one application to load in Workday"; "recruiters are still shuffling candidates around in Google Sheets" | https://news.ycombinator.com/item?id=47076001 | High |
| Lever: archived silently while job stays open; no self-service status | leonstaff (secondary) | Medium |
| **Bias**: Mobley v. Workday — AI screening alleged age/race/disability discrimination; certified as collective action May 2025 | https://www.shrm.org/topics-tools/news/technology/workday-ai-lawsuit-wake-up-call-hr ; https://www.forbes.com/sites/janicegassam/2025/06/23/what-the-workday-lawsuit-reveals-about-ai-bias-and-how-to-prevent-it/ | High |
| "AI screening is a black box" — scores lack explanations (recruiter side, secondary Reddit) | curriculo.me | Medium |
| Keyword-gaming: ~1 hour per application tailoring for ATS → 8–10 applications/day | Teamblind / substack snippet | Medium |

### B14. India staffing-agency gaps (synthesis; direct India-specific complaint threads were sparse)

- **Client portal / vendor submissions**: only Ceipal (VMS) and Bullhorn cover vendor/sub-vendor submission flows; SmartRecruiters' agency portal is "being mothballed"; Teamtailor "not ideal for agencies"; Zoho Recruit and Lever get reporting complaints from staffing owners.
- **GST invoicing + timesheets**: no ATS reviewed bundles GST-compliant invoicing (GSTR-1/3B, e-invoice/IRN) with timesheet-to-invoice; agencies stitch Zoho Invoice/Sleek Bill/Avaza/SmartAdmin to the ATS (https://www.zoho.com/in/invoice/ ; https://www.avaza.com/recruitment-agency-timesheet-software/ ; https://www.smartadmin.co.in/). Bullhorn is criticised as weak for temp/shift staffing (Capterra). India-Compliance (Frappe) e-invoice/e-way-bill has 107 open issues.
- **Naukri dependency**: Indian agencies rely on Naukri RMS/Resdex but complain of irrelevant search, stale profiles, no integrated scheduling/communication, weak mobile.
- Uncertainty: no primary Indian-agency forum posts were retrievable within budget; the above is triangulated from review sites.

---

## CROSS-PRODUCT THEME TABLE

| Theme | OSS HR (Frappe, OrangeHRM, Odoo CE, Horilla, IceHrm, Sentrifugo, Bitrix24, Kimai, TimeOff) | ATS (Greenhouse, Lever, Workable, SmartRecruiters, iCIMS, Zoho, Ashby, Teamtailor, JazzHR, Bullhorn, Ceipal, Naukri) | YukthiX implication |
|---|---|---|---|
| Reporting weak / inflexible | OrangeHRM native reporting limited; Frappe needs report builder skills | Greenhouse, Lever, SmartRecruiters, Zoho, JazzHR, Ceipal (3-month dashboards), Teamtailor, Bullhorn | Ship a real ad-hoc report builder + saved views + date-range and funnel analytics day one |
| Click-heavy / dated UI | OrangeHRM, IceHrm, Bitrix24 learning curve | Greenhouse "extremely click-heavy", iCIMS "from 2005", Bullhorn "very dated", Ceipal "far too many clicks" | Keyboard-first, bulk actions, inline editing |
| Duplicates & parsing | Horilla biometric duplicate attendance | Greenhouse, Ashby (merge doesn't resolve), Ceipal (same resume repeatedly, empty profiles), Bullhorn (parsing errors) | Deterministic dedupe on email/phone/PAN + fuzzy merge with audit |
| Scheduling / email sync | Bitrix24 email sync failures | Greenhouse (no time zones), Lever (availability requests), Naukri (no integrated scheduling), Bullhorn/Bitrix24 email issues | Native 2-way calendar/email with time-zone aware self-scheduling |
| Hiring-manager adoption | — | Greenhouse scorecards skipped; SmartRecruiters overwhelming; Ashby HM usability | Lightweight HM view (email/WhatsApp/Slack scorecards) |
| Mobile gaps | Frappe PWA not extensible, geofencing custom; Bitrix24 crashes; IceHrm dated | Ashby & JazzHR no app; Ceipal/Zoho/SmartRecruiters app ≠ desktop; Naukri app confusing | Full-parity mobile incl. geofenced check-in and HM approvals |
| India statutory | Frappe: reports missing in core, extension app small; Odoo: Enterprise-only; others none | ATS side: no GST invoicing/timesheet bundle for agencies | Native PF/ESI/PT/LWF/TDS/24Q/Form16/ECR + GST e-invoice for staffing |
| Security / patch burden | High-severity CVEs 2025–26 in Frappe, OrangeHRM, Horilla; unpatched Sentrifugo, TimeOff | (less visible) | Sell managed SaaS + published security posture; RLS multi-tenant |
| Upgrade pain | Frappe major upgrades, Horilla irreversible migration, OrangeHRM 4→5 | JazzHR/Ceipal botched data migrations | Free migration tooling from Frappe HR / Freshteam / Zoho |
| Pricing model pain | Open core gating (OrangeHRM API/SSO, Odoo payroll, Kimai plugins, Bitrix24 HR) | Headcount-based billing (Greenhouse, Ashby, iCIMS, Workable cliff at 21), add-on creep (Workable, Bullhorn, iCIMS), auto-renew/cancellation traps (JazzHR), 8–15% renewal escalators, 36-month terms | Transparent per-recruiter or flat tiers, monthly option, no headcount cliff, price-lock |
| Support | Slow/quiet forums; 0-comment issues for 18 months | Zoho, SmartRecruiters (lower tiers), Bullhorn, JazzHR, Bitrix24 | India-hours human support as differentiator |
| Vendor risk | Sentrifugo abandoned; single-vendor Horilla | Freshteam sunset (2026); Lever/JazzHR under Employ; SmartRecruiters agency portal mothballed | Position as stable, focused vendor |

---

## EXPLICITLY REQUESTED MISSING FEATURES (from issue trackers / reviews)

**Open-source HR**
- Production self-hosting guide (Frappe #2818); ESS mobile theme config (#3942); auto-extend holiday list (#3154); multiple income-tax slabs per assignment (#111); PF/ESI/TDS statutory reports (#2174); extensible PWA check-in form with project/photo (#5277); native geofencing (forum 72104).
- OrangeHRM: REST API, SSO/LDAP, configurable RBAC, payroll, travel-expense module, backups, >10 projects in free edition.
- Odoo CE: payroll + India localization without Enterprise.
- Kimai: timesheet import (#2754), persistent filters, customer-name search, concurrency-safe overlap rules (#6168).
- TimeOff.Management: check-in/check-out, CSRF fix, working LDAP.

**ATS**
- Greenhouse: time-zone aware scheduling, native outreach sequences, more job boards, better custom reports, duplicate merging.
- Lever: keyword sourcing, candidate availability requests, per-department workflows, email signatures in templates, self-serve customization.
- SmartRecruiters: custom candidate-visible statuses, HTML email customization, functioning agency portal.
- Zoho Recruit: hide/rename/delete fields, auto-close expired postings, better parsing.
- Ashby / JazzHR: native mobile app; Ashby: real duplicate merge, explainable AI screening.
- Naukri RMS: integrated scheduling + communication, relevance in search, fresh profiles.
- Bullhorn: temp/shift staffing features, faster search, built-in email automation without add-on.
- Ceipal: >3-month dashboards without BI module, dedupe, faster parsing, public pricing.
- Candidates: resume parse that actually fills forms, one account across employers, status visibility, explainable rejections.

---

## PRICING FACTS (with sources; ranges are third-party estimates unless vendor-published)

| Product | Facts | Source |
|---|---|---|
| Greenhouse | Headcount-based annual license; entry ~$5.1k–6.5k/yr; Plus $17k–36k; Pro $36k–70k+; median contract ~$12.25k (PriceLevel 2025); implementation $1k–15k (others say up to $30k); renewal escalators 8–15% (Vendr 2025); auto-renew; no free trial; TCO 30–50% over base | https://www.pin.com/blog/greenhouse-pricing/ ; https://leonstaff.com/blogs/ats-pricing-comparison-2026/ |
| Lever | Custom quotes only; ~$3.5k–4k/yr entry; median ~$12.24k; implementation $5k–15k | leonstaff comparison ; herohunt/pin snippets |
| Ashby | Foundations $300–400/mo (≤100 employees), 10% annual discount; Plus/Enterprise custom; **priced by total headcount**; SSO +$100/mo; typical $30k–70k/yr at 100–300 employees | https://skima.ai/blog/product-deep-dives/ashby-reviews ; dover.com snippet |
| Workable | Starter $149/mo; Standard $299/mo (≤20 employees); ~67% jump at 21 employees; video $99/mo, SMS $79/mo add-ons; ~$6–9 PEPM | pin.com snippet ; https://www.outsail.co/post/workable-reviews---pricing-pros-cons-and-user-feedback |
| iCIMS | ~$1.7k/mo SMB; ATS $30k–60k/yr, +Onboard $45k–90k, Talent Cloud $80k–250k+ (1k–10k employees); public-sector filings $8–22/employee/yr; implementation $15k–75k (up to $100k); **36-month terms, 5–7% escalators**; integrations $2k–10k/yr each | https://prepzo.ai/blog/icims-pricing ; leonstaff |
| SmartRecruiters | Essential ~$15k/yr; free tier discontinued post-SAP; implementation $5k–75k | leonstaff |
| JazzHR | Hero ~$75/mo ($900–1,000/yr, 3 jobs cap), Plus ~$3.2k–3.5k/yr, Pro ~$5k–5.5k/yr; annual auto-renew; 30-day notice disputes | leonstaff ; ismartrecruit ; Trustpilot |
| Bullhorn | $99–$199/user/mo (user-reported), modules extra; avg implementation ~$20k; 6–12 wk basic | leonar ; juicebox ; thedailyhire snippet |
| Teamtailor | ~€99/seat/mo start; no public pricing now | perfectlyhired |
| Recruitee | From $199/mo, public | itqlick/selecthub |
| Zoho Recruit | Forever Free + Standard/Professional/Enterprise; add-on confusion | Capterra/SoftwareAdvice |
| Ceipal | No public per-seat pricing | skima.ai |
| Naukri RMS | Not public; add-ons (verification) expensive | Capterra |
| OrangeHRM paid | Not public; users report 18 emails to get a quote | SourceForge |
| Kimai | Core free; working-hours/vacation plugin paid | kimai.org store |
| Bitrix24 | Free plan: 5 GB, task limits, no HR permissions/time tracking | helpdesk.bitrix24.com |

---

## PRAISE THEMES (what to match, not just beat)

- **Greenhouse**: structured hiring — interview plans & scorecards "provide structure and consistency"; "intuitive and recruiter friendly"; G2 #1 ATS Spring 2026.
- **Lever**: ease of use; Easy Book scheduling links; LinkedIn Recruiter integration; strong implementation teams.
- **Ashby**: "BI-grade analytics"; automation triggers; "exceptional Customer Success".
- **iCIMS**: "can report on almost any business need"; deep customization; full lifecycle.
- **SmartRecruiters**: collaboration for large hiring teams; candidate-friendly UX; job-board integrations.
- **Zoho Recruit**: "best value-for-money ATS"; customizable pipelines; ecosystem; 10-year customers.
- **Bullhorn**: single candidate→placement record; 350+ integrations; staffing-specific depth.
- **Ceipal**: VMS + workforce mgmt (timesheets/expenses/compliance) bundled; AI matching; job-board reach.
- **Naukri RMS**: largest Indian candidate pool; easy filters.
- **Teamtailor**: career-site builder, <2-minute mobile apply, anonymized screening.
- **Frappe HR**: fully open, extensible framework, active core team, Frappe Cloud option; India-Compliance is the most complete OSS GST stack.
- **Horilla**: rapid release cadence (three releases in Sep 2026), audit logging now default.
- **OrangeHRM**: "installation was straightforward"; long-lived OSS brand.

---

## KEY UNCERTAINTIES / GAPS IN THIS RESEARCH
1. G2 review pages blocked (403); G2 counts of "Reporting Issues (N)" not captured.
2. Reddit threads not fetched directly; r/recruiting and r/recruitinghell quotes are via curriculo.me and leonstaff.com (both vendor blogs) — verify before quoting externally. Teamblind and HN threads were read directly.
3. No direct Indian staffing-agency forum posts on GST invoicing/timesheets found within budget; that gap analysis is inferred from feature coverage.
4. Pricing ranges are from procurement-data aggregators/vendor-adjacent blogs, not vendor rate cards (none publish them except Recruitee, Workable, JazzHR, Zoho).
5. Frappe HR "why companies abandon self-hosting" is inferred from issue tracker + CVE cadence, not from exit testimonials.
