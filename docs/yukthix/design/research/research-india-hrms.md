# India HRMS / Payroll — Customer Complaint & Pricing Research

Prepared for YukthiX. Research date: 2026-09-26. ~50 web searches, ~70 page fetches.

## Method and caveats (read first)

- Sources actually fetched and read: Capterra (US + India), GetApp, Software Advice, Techjockey, Apple App Store review pages (Keka, Darwinbox, greytHR), greytHR Community forum, Zoho help community, vendor pricing pages (RazorpayX, factoHR, Kredily, Pocket HRMS, Qandle, Zimyo-partial, sumHR), indianhrm.com / aidukan.in / itforsme.in pricing trackers, hr.software, Omni HR FAQ, Akrivia and HRSuggest comparison pages.
- **Blocked / not directly readable** in this environment: g2.com (403), play.google.com, trustpilot.com, softwaresuggest.com, hrone.cloud, zoho.com, gartner.com, keka.com/pricing (cert error), mouthshut.com (connection reset). Where G2/Play Store/Trustpilot/MouthShut data appears below it comes from **search-engine snippets or third-party pages quoting them** and is marked **[indirect]**.
- **Reddit**: no thread could be fetched directly. The one Reddit data point (r/IndiaTax on RazorpayX) is quoted second-hand from two competitor blogs — marked **[indirect, competitor-sourced]**.
- **Competitor-authored content** (HROne blog, Akrivia, Omni HR, EZHRM, Jibble, sumHR blog, Craze) is flagged **[competitor]**. Treat its framing as biased; only concrete, checkable facts are used.
- "Frequency" = number of distinct reviews/posts I actually saw mentioning the theme, or the mention-count the platform itself shows (G2 shows counts). Where I could only see a page-1 sample, frequency is a lower bound.
- Reviewer type key: **HR** = HR admin/payroll/ops; **EMP** = employee end-user; **FDR** = founder/director/CXO; **DEV** = engineer/IT.

---

## 1. Per-product complaints

### 1.1 Keka

Ratings seen: Capterra 4.4/5 (91 reviews) — https://www.capterra.com/p/149253/Keka/reviews/ ; App Store (IN) 4.7/5 (7.3k) — https://apps.apple.com/in/app/keka-hr/id1448024119?see-all=reviews ; Play Store 4.32/5 (~35k ratings) [indirect] — https://play.google.com/store/apps/details?id=com.keka.xhr

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Customer support slow / unaccountable, esp. on payroll days | "Customer support is not timely and lacks proper coordination. Customer requests are not seriously considered or resolved." (1★, 201-500 emp) ; "the customer service is abysmal" (1★) ; "Strong improvement is needed in customer handling, communication, and accountability" | https://www.softwareadvice.com/hr/keka-profile/reviews/ ; https://www.capterra.com/p/149253/Keka/reviews/ ; https://www.getapp.com/hr-employee-management-software/a/keka/reviews/ | G2 shows **156 mentions** of "poor customer support" [indirect: https://www.g2.com/products/keka/reviews?qs=pros-and-cons]; 4+ on Capterra/GetApp | HR, FDR |
| 2 | No weekend/phone escalation | "no telephonic POC for emergencies on Friday 6 PM to Monday 10 AM, per a verified G2 review" | https://www.hr.software/reviews/keka [indirect] | 1 | HR |
| 3 | Rigid / hard-wired configuration; can't run a subset of modules | "Lot of the functionality is hard wired; impossible to make any changes." (3★, Director) ; "No way to use a subset of features. Onboarding requires filling 25 sheets even if you are looking to use a subset" (1★, CTO) | https://www.capterra.com/p/149253/Keka/reviews/ | 4+ | FDR, DEV |
| 4 | Mobile app: clock-in missing, GPS wrong, login loops, crashes | "not able to detect my correct location and this app is also a battery killer" (App Store, Apr 2025) ; "After entering the OTP, it redirects me back to the login page… 'Unable to initiate login'" (Aug 2025) ; "clock in and out issues quite often" ; Play Store: "Clock In option is not showing on the mobile app" [indirect] | https://apps.apple.com/in/app/keka-hr/id1448024119?see-all=reviews ; https://play.google.com/store/apps/details?id=com.keka.xhr [indirect] | 4 on App Store page-1; several on Play [indirect] | EMP |
| 5 | Mobile feature parity lags web | "mobile app lags the web by roughly 40% on feature parity" ; "Mobile app has limitations and bugs and doesn't work as smoothly as web" | https://www.hr.software/reviews/keka ; https://www.softwareadvice.com/hr/keka-profile/reviews/ | 3+ | HR, EMP |
| 6 | Biometric integration / attendance sync unreliable | "Integration with biometrics is limited and doesn't work properly sometimes, and attendance data doesn't get synchronized" [indirect G2 snippet] | https://www.g2.com/products/keka/reviews?qs=pros-and-cons [indirect] | 2+ | HR |
| 7 | Reporting limited unless on higher plan; custom reports gated | "deep analytics or custom reports are limited unless you pay for higher plans" [indirect]; "Customization options for workflows and reports are somewhat limited" | https://www.g2.com/products/keka-technologies-keka-hr/reviews?qs=pros-and-cons [indirect] ; https://www.getapp.com/hr-employee-management-software/a/keka/reviews/ | 3+ | HR |
| 8 | Tax calc errors / refund not honoured | "Tax calculation errors reported" ; "unresolved refund commitments negatively impacted trust" | https://www.capterra.com/p/149253/Keka/reviews/ ; https://www.getapp.com/hr-employee-management-software/a/keka/reviews/ | 2 | HR |
| 9 | Slow with large data | "the system can feel slightly slow when handling large data" | https://www.getapp.com/hr-employee-management-software/a/keka/reviews/ | 2 | HR |
| 10 | Integration gaps (Oracle, Slack/JIRA, accounting journal) | "Oracle integration is called out as weak… monthly salary journal reports are not proper" [indirect]; "Missing third-party integrations (Slack, Basecamp, JIRA)" | G2 [indirect] ; https://www.capterra.com/p/149253/Keka/reviews/ | 2-3 | HR, DEV |
| 11 | Billing starts at signature, not go-live; ~2% setup fee | "2% monthly setup fee, billed from day one regardless of go-live status"; "Keka starts metering subscription the day you sign, while implementation typically runs 45 to 90 days" | https://hrone.cloud/blog/keka-pricing-india/ [competitor, indirect] | competitor claim — **unverified** | FDR |
| 12 | Scales poorly past ~500 emp / multi-entity / multi-state | "Keka hits a ceiling around 500 employees… multi-entity management and multi-state payroll rules require workarounds" | https://hrone.cloud/blog/outgrowing-keka-darwinbox-greythr-india/ [competitor] ; https://www.hrsuggest.com/resources/darwinbox-vs-keka-india-march-2026 ("verify exceptions… arrears, reversals, late joinings") | analyst/competitor claims | FDR |

### 1.2 greytHR

Ratings: Capterra 4.3/5 (297; distribution 3★ 8%, 2★ 2%, 1★ 1%) — https://www.capterra.com/p/150850/greytHR/reviews/ ; App Store (IN) 4.6/5 (18k) — https://apps.apple.com/in/app/greythr-the-one-stop-hr-app/id959795880?see-all=reviews&platform=iphone ; Trustpilot 26 reviews [indirect] — https://www.trustpilot.com/review/www.greythr.com

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Payroll support agents lack payroll knowledge; long ticket TAT | "Support agents lack payroll knowledge" (HR Mgr) ; "Payroll processing sometimes stalls; support delays up to 4 months" (HR Ops) ; "under-trained team handling tickets you raise" [indirect] ; "Technical errors… need to go back to technical team / backend which consumes time" | https://www.capterra.com/p/150850/greytHR/reviews/ ; https://www.getapp.com/hr-employee-management-software/a/greythr/reviews/ | 6+ | HR |
| 2 | Payroll/leave calc errors that recur monthly | Community post: "Leave approvals are not being credited… Wrong calculation of LOP — an employee whose LOP was calculated at 44 days in a month… Employees not yet joined was given a full month salary" (Mar 2024) ; "Monthly challenges with payroll calculations; support response times are difficult and recurring issues arise" ; "we had to manually correct employee leave balances" [indirect] | https://community.greythr.com/t/greythr-system-errors/12514 ; https://www.softwareadvice.com/hr/greythr-profile/reviews/ | 3+ | HR |
| 3 | Leave module rigid (accrual rules not configurable) | "Leave Module has very limited features and accrual calculations cannot be configured." ; "No approved leave forms PDF printing option" | https://www.softwareadvice.com/hr/greythr-profile/reviews/ ; https://www.capterra.com/p/150850/greytHR/reviews/ | 2 | HR |
| 4 | Dated UI; auto-logout; slow login | "UI of greytHR is horrible" (3★) ; "interface seems a bit old-fashioned" ; "automatically logs users out when they close the browser" | https://www.capterra.com/p/150850/greytHR/reviews/ | 4+ | HR |
| 5 | Mobile app crashes / hangs at sign-in → LOP for employees | "This app is frequently crashing in a day or two… I marked late because of this app many times" (Mar 2025) ; "Every time there is an update it stops working… 'oops something gone wrong'" ; "Taking at least 4-5 minutes to load" ; Play Store: "app takes too much time to open… sometimes leading to loss of pay (LOPs)" [indirect] | https://apps.apple.com/in/app/greythr-the-one-stop-hr-app/id959795880?see-all=reviews&platform=iphone ; https://play.google.com/store/apps/details?id=com.greytip.ghress [indirect] | 6+ on App Store page | EMP |
| 6 | Unannounced maintenance / instability | "frequent periods of instability or maintenance, often occurring without any prior notification" (Director) | https://www.getapp.com/hr-employee-management-software/a/greythr/reviews/ | 1-2 | FDR |
| 7 | Features hidden behind support activation | "most features to be activated through customer support, and some useful features may not be activated for users who are unaware" [indirect] | https://www.capterra.com/p/150850/greytHR/reviews/ (search snippet) | 1 | HR |
| 8 | Implementation team unprofessional; plan quietly downgraded in quote | "from the start, the staff and implementation team have been incredibly unprofessional" (Sep 2024) ; "they reduced the price but smartly downgraded the plan without explaining" (Jul 2025) | https://apps.apple.com/in/app/greythr-the-one-stop-hr-app/id959795880?see-all=reviews&platform=iphone | 2 | FDR/HR |
| 9 | Module integration gaps (HRIS↔Letter/Exit/Expense; QuickBooks; biometric) | "does not always integrate smoothly with the Letter module, Exit module, or Expense module" [indirect] ; "better integration with systems like QuickBooks" ; users request "integration with third-party biometric machines" | https://www.techjockey.com/blog/greythr-vs-keka-hrms-vs-zoho-people [indirect] ; https://www.getapp.com/hr-employee-management-software/a/greythr/reviews/ | 3 | HR |
| 10 | Reports have "loopholes"; compliance reports not submission-ready | "loopholes in the reports which if corrected would be more useful" (Trustpilot) [indirect] ; "Compliance reports need improvement for direct client submission" ; TDS return prep "not as convenient as the TDS software that I use" | https://www.trustpilot.com/review/www.greythr.com [indirect] ; https://www.softwareadvice.com/hr/greythr-profile/reviews/ ; GetApp | 3 | HR, FDR |
| 11 | No native webhooks in API; REST API is a paid add-on | "The greytHR API does not natively support webhooks" ; REST API Rs 15/emp/month | https://www.getknit.dev/blog/greythr-api-directory-9RnbMR [indirect] ; https://www.indianhrm.com/greythr-pricing | analyst | DEV |
| 12 | Add-on sprawl + renewal uplift | "Add-ons like Performance, Expense, or SSO account for 15 to 25% on top" ; "8% renewal uplift applies from Year 2" | https://hrone.cloud/blog/greythr-pricing-india/ [competitor, indirect] | competitor claim — **unverified** | FDR |

### 1.3 Darwinbox

Ratings: Capterra 4.2/5 (46; 2×1★, 3×3★) — https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ ; GetApp 4.2 (46) ; App Store (IN) 4.6 (14k) — https://apps.apple.com/in/app/darwinbox/id1268513740?see-all=reviews ; Gartner PI 4.7 (593) [indirect] ; Glassdoor employer 3.2 (562) [indirect, not product]

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Slow page loads / slow app | G2 dislikes: "slow loading times (12 mentions), slow overall performance (11 mentions)" ; "Mobile user interface is slow and needs to be improved" (3★) | https://www.omnihr.co/faqs/darwinbox-common-complaints [competitor, citing G2] ; https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ | **23 G2 mentions** [indirect] + 4 Capterra | HR, EMP |
| 2 | Check-in fails: GPS not fetched / office not geofenced / selfie crash | "unable to check-in repeatedly even at the correct place… GPS inaccurate and marks out of range" [Play, indirect] ; "captures a mandatory selfie but crashes immediately upon clicking submit… retry 10-15 times" [Play, indirect] ; "not taking the location of the office" (App Store, Nov 2024) ; "Plant level requirements… forcibly putting false attendance regularisation" (Jan) | https://play.google.com/store/apps/details?id=com.darwinbox.darwinbox [indirect] ; https://apps.apple.com/in/app/darwinbox/id1268513740?see-all=reviews | 5+ | EMP |
| 3 | No credential persistence; forced biometric re-auth loops on iOS | "Every single time I open it, I am forced to manually re-enter the company URL, login ID, and password… zero credential persistence" ; "repeatedly checks biometric authentication" (iOS 26.2.1) | https://apps.apple.com/in/app/darwinbox/id1268513740?see-all=reviews | 2 | EMP |
| 4 | Navigation depth / steep learning curve / click-heavy | "sometimes it becomes too complex to check for specific things… UI is not to pleasant" ; "Multi-tab navigation creates a click-depth tax on HR Ops teams" [indirect] | https://www.getapp.com/hr-employee-management-software/a/darwinbox/reviews/ ; https://www.rfp.wiki/hr-office/cloud-hcm-suites-for-1-000-employee-enterprises/darwinbox [indirect] | 5+ | HR, EMP |
| 5 | Reporting limited; customisation needs vendor | "Reporting and restrictions are not there" (Payroll Mgr, 3★) ; "advanced customizations require support assistance rather than self-service" | https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ ; https://www.omnihr.co/faqs/darwinbox-common-complaints | 4+ | HR |
| 6 | Implementation 3-9 months while billing runs from day one | "Implementations that stretch for months while billing runs from day one" ; "Implementation drag across 3 to 6 months is cited in zero-star reviews" [indirect] ; implementation = "1x to 2x annual license fees… runs 4 to 9 months" | https://akriviahcm.com/blog/darwinbox-alternatives-india-2026 [competitor] ; https://www.rfp.wiki/... [indirect] ; https://hrone.cloud/blog/darwinbox-pricing/ [competitor, indirect] | competitor/analyst claims | FDR |
| 7 | Support tickets stall during payroll cycle; specialist handoff | "Support tickets that sit open during payroll cycles" ; "specialist support handoffs stall after first-line tickets" ; "Customer support leaves a lot to be desired and they're not always available" (1★) | Akrivia [competitor] ; rfp.wiki [indirect] ; https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ | 4+ | HR |
| 8 | Privacy: employee phone numbers visible org-wide | "everyone can access anyone's details in the organization, and their number is shared with people they don't want" [indirect Capterra snippet] | https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ (search snippet) | 1 | EMP |
| 9 | Payroll module weaker than rest of suite | "payroll module friction appears repeatedly relative to other suite strengths" (Gartner PI summary) [indirect] | https://www.gartner.com/reviews/market/cloud-hcm-suites-for-1000-employees/vendor/darwinbox/product/darwinbox [indirect] | analyst | HR |
| 10 | "Created more work" (1★) | "The worst HRIS solution I've ever worked it... Created more work for the organisation" (Business Systems Analyst, 1★) | https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ | 1 | DEV |
| 11 | Opaque pricing, renewal escalators, per-entity charges, data-exit friction | "Renewal contracts with escalation clauses that quietly compound" ; "contract clauses around data portability and export formats" | https://akriviahcm.com/blog/darwinbox-alternatives-india-2026 [competitor] | competitor claim — **unverified** | FDR |

### 1.4 Zoho People + Zoho Payroll

Ratings: Capterra People 4.4/5 (366; 1★ 1%, 2★ 2%, 3★ 6%) — https://www.capterra.com/p/110931/Zoho-People/reviews/ ; Play Store People 3.61/5 (5.6k) [indirect] — https://play.google.com/store/apps/details?id=com.zoho.people

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Mobile check-in geolocation wrong; can't preview pin; photo verification slow | "the geo location is not accurate it's always pinned 2-3 streets away… we can't check if the app is choosing the right location before submitting" ; "I am not able to check in and checkout in zoho people even location access allowed" ; "check-in and check-out taking more than 10 minutes for photo verification" [indirect] | https://help.zoho.com/portal/en/community/topic/check-in-out-location ; https://help.zoho.com/portal/en/community/topic/i-am-not-able-to-check-in-and-checkout-in-zoho-people-even-location-access-allowed ; Techjockey [indirect] | 4+ | EMP |
| 2 | Mobile app far thinner than web; cluttered | "mobile app version has very limited features compared to the web version" ; "Zoho's mobile app needs an upgrade to include all the tools available on the web" | https://www.capterra.in/reviews/110931/zoho-people ; https://www.techjockey.com/blog/greythr-vs-keka-hrms-vs-zoho-people [indirect] | 5+ | EMP, HR |
| 3 | Support gives canned answers / slow | "Support agents provide 'canned' responses or links to documentation rather than digging into specific technical glitches" (CEO) ; "lack of customer support with long wait times" [indirect] | https://www.capterra.com/p/110931/Zoho-People/reviews/ | 4+ | FDR, HR |
| 4 | Setup / permissions complexity | "There is a learning curve during the initial setup, especially when configuring permissions" ; "certain workflows need multiple steps" | https://www.capterra.com/p/110931/Zoho-People/reviews/ ; https://www.softwareadvice.com/hr/zoho-people-profile/reviews/ | 5+ | HR |
| 5 | People does not do Indian statutory payroll → second product, second bill, per-legal-entity | "Zoho People does not run Indian statutory payroll. PF, ESI, PT and TDS" need Zoho Payroll ; "Separate subscription required for each registered company" ; leave & attendance in Payroll "restricted to Premium only" | https://www.indianhrm.com/zoho-people-pricing ; https://www.indianhrm.com/zoho-payroll-pricing | analyst | FDR |
| 6 | Single-org model; groups run multiple tenants + Excel | "organisational unit (OU) model is single-org by design, so groups with three legal entities often end up running three tenants and consolidating in Excel" | https://hrone.cloud/blog/keka-vs-zoho-people-india/ [competitor, indirect] | competitor claim | FDR |
| 7 | Charged for profiles that never log in | "Higher rates for employee profiles who do not access the system" (GM) | https://www.capterra.com/p/110931/Zoho-People/reviews/ | 1 | FDR |
| 8 | Leave rules hostile to employees (predated leave, medical cert) | Play Store: "the worst app ever… very unfriendly site for employees… issues with applying for predated leave requests and strict medical certificate requirements" [indirect] | https://play.google.com/store/apps/details?id=com.zoho.people [indirect] | 2+ | EMP |
| 9 | Regularisation UX: re-enter date/time every time | "In the attendance regularization process, the date and time needs to be added every time" [indirect] | https://www.g2.com/products/zoho-people/reviews [indirect] | 1 | EMP |
| 10 | Zoho Payroll: statutory gaps for multi-state; no PF/ESI registration help | "gaps in statutory logic, with multi-state PF/ESI overrides" [indirect, competitor] ; "if assistance with PF and ESI registration is provided, it would be more helpful" [indirect] | https://hrone.cloud/blog/best-payroll-software-india/ [competitor, indirect] ; https://www.softwaresuggest.com/zoho-payroll/reviews [indirect] | 2 | HR |
| 11 | Reporting / analytics weak | "Reporting and analytics can be improved" ; "Reporting and customization have a learning curve" | Capterra ; Software Advice | 3 | HR |

### 1.5 HROne

Ratings: Capterra 4.4/5 (28) — https://www.capterra.com/p/222335/HROne/reviews/ ; Techjockey 4.7 (104) — https://www.techjockey.com/reviews/hr-one-hrms

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Support unprofessional (minority but severe) | "Their support is very pathetic...least bothered...very unprofessional" (Deputy Mgr, 3★) | Capterra | 1-2 | HR |
| 2 | Network errors, attendance miscalculation, server down | "The network errors and attendance mis calculation and no server most of the time" (3★) ; "Delayed attendance reflection in punching system" | Capterra | 3 | HR, EMP |
| 3 | Slow home page / mobile load; lag at payroll peak | "it takes a lot of loading time" ; "system lags during peak payroll periods" [indirect] | Capterra ; https://www.hr.software/reviews/hrone | 3 | EMP, HR |
| 4 | Inflexible admin config; can't delete employee; backdated transfer blocked | "No employee deletion option; inflexible onboarding/configuration" (2★) ; "backdated transfer is not allowed. Appointment letter is not generated through miscellaneous" | Capterra ; Techjockey | 3 | HR |
| 5 | Missing custom reports / flexible salary calcs / compliance reports | "There should be more detailed reports. More Compliance related reports should be added." ; "missing features… like custom reports and flexible salary calculations" [indirect] | Techjockey ; TrustRadius [indirect] | 3 | HR |
| 6 | No ATS in recruitment module; org chart weak | "Missing ATS (Applicant Tracking System) in recruitment module" ; "organizational chart limitations" [indirect] | Capterra ; TrustRadius [indirect] | 2 | HR |
| 7 | UI complex to find features | "The UI is kind of complex to use. It took me a lot of time to find features" (3★) | Capterra | 2 | EMP |
| 8 | 50-user floor makes it expensive for small firms | "a 20-person company pays for 50 users, which puts the real cost near Rs 292 per employee per month with GST" | https://www.indianhrm.com/hrone-pricing | analyst | FDR |
| 9 | Biometric hardware extra; 2-month cancellation notice | "Biometric hardware must be purchased separately" ; "Cancellation requires two months' notice" | https://www.hr.software/reviews/hrone ; indianhrm | analyst | FDR |

### 1.6 Pocket HRMS

Ratings: Capterra 4.0/5 (15) — https://www.capterra.com/p/157434/Pocket-HCM/reviews/

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Punch in/out errors, network errors marking attendance | "errors coming while punch in & punch out" (3★) ; "network errors while marking attendance" [indirect] | Capterra ; Techjockey [indirect] | 2 | HR, EMP |
| 2 | No proper recruitment module / candidate export | "Does not have any proper recruitment module" (2★, Recruiter); can't "download whole candidate data in a tabular/excel format" | Capterra | 1 | HR |
| 3 | No error logs; hard to trace failures | "Error log is missing" (COO, 3★) | Capterra | 1 | FDR |
| 4 | Menus greyed out (plan gating) | "certain options or menus are greyed out" (3★) | Capterra | 1 | HR |
| 5 | No linking between two companies | "no linking between two companies" | Capterra | 1 | HR |
| 6 | Missing hospitality features (comp-off, break shifts) | "Missing hospitality-specific features (comp-off, break shifts)" | Capterra | 1 | HR |
| 7 | Accuracy in attendance & tax; "sluggish and unreliable" | "issues with the software's accuracy, particularly regarding attendance tracking and tax calculations… 'sluggish and unreliable'" [indirect] | https://www.selecthub.com/p/hr-management-software/pocket-hrms/ [indirect] | 2 | HR |
| 8 | 50-employee minimum + one-time implementation fee | "Minimum 50 employees required for Standard and Professional plans"; implementation fee "varies" | https://www.pockethrms.com/pricing/ | vendor page | FDR |

### 1.7 sumHR

Ratings: Software Finder 4.7 (3) ; SoftwareSuggest [blocked]. Small review base — **low confidence**.

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Reporting basic, no custom dashboards | "Reporting can also feel fairly basic… specially when more detailed reports" ; "lack customization for dashboards and workforce planning" | https://softwarefinder.com/hr/sumhr/reviews | 3 | HR |
| 2 | Limited customisation | "Customization options are limited" | Software Finder | 3 | HR |
| 3 | Expense module basic (no OCR, multi-level approvals, cards) | "missing receipt OCR, multi-level approvals, and corporate card integration" | Software Finder | 1 | HR |
| 4 | Payroll inaccuracies, slow pages, bugs, weak support | "occasional payroll inaccuracies, slow pages, and frustrating UI/UX… persistent bugs, limited clarity, ineffective support" [indirect] | https://www.itqlick.com/sumhr [indirect] | aggregate | HR |
| 5 | API setup needs IT | "setting these up can be technical and might require IT support" [indirect] | https://comparecamp.com/sumhr-review-pricing-pros-cons-features/ [indirect] | 1 | DEV |
| 6 | Recruitment "coming soon" | Recruitment module listed as "coming soon" on pricing page | https://www.sumhr.com/pricing/ | vendor | HR |

### 1.8 Zimyo

Ratings: Capterra 4.4 (33) — https://www.capterra.com/p/275269/Zimyo-HRMS/reviews/ ; Techjockey 4.5 (15) ; Trustpilot 4 reviews [indirect]

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Support weak / calls unanswered / don't deliver after upfront payment | "The support is very weak. No personnel attends you promptly." (Founder, 1★) ; "Bad support team and do not pay them upfront as they dont deliver" (Mar 2023) ; "Call not answering" | Capterra ; Techjockey | 4 | FDR, HR |
| 2 | Setup dragged 3+ months; Zimyo→2.0 migration rough | "not having a good experience even after spending and following up for over 3 months for the setup" [indirect] ; "Migration from ZIMYO to ZIMYO 2.0 was not smooth" [indirect] | https://www.softwaresuggest.com/zimyo/reviews [indirect] ; Techjockey [indirect] | 2 | HR |
| 3 | Payroll "almost a manual process"; portal slow | "Sometimes portal works very slowly, Running payroll on this portal is almost a manual process." (2★) ; "Manual feeding of data" | Capterra | 3 | HR |
| 4 | Doesn't fit company policy | "doesn't have features as per our policy." (2★) | Capterra | 1 | HR |
| 5 | Tax-proof upload hidden | "Finding where to upload all tax proof is kind of hidden." | Capterra | 1 | EMP |
| 6 | Pricing inconsistent | "clearer and more consistent pricing would make the platform even better" [indirect] | G2 [indirect] | 1 | FDR |
| 7 | 40-employee minimum billing | "minimum billing for 40 employees" | https://www.saasworthy.com/product/zimyo-hrms [indirect] | analyst | FDR |

### 1.9 Qandle

Ratings: Capterra 4.4 (28) — https://www.capterra.com/p/173077/Qandle/reviews/ ; Techjockey 4.8 (19)

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Bugs, crashes, lag on save | "Lots of bugs and the application crashes at times" (3★, SDE) ; "editing a field and saving it is laggy" ; "Lags a lot, customer support has been poor" (HR) | Capterra | 4 | EMP, HR |
| 2 | Biometric sync missing | "Does not sync with bio-metric machines" | Capterra | 1 | DEV |
| 3 | Price feels high; 50-user minimum; no refund of remaining credit | "price feel more" ; "Minimum billing amount we charge is for 50 users" ; "Remaining credit will not be refunded if you decide to discontinue" | Capterra ; https://www.qandle.com/transparent-pricing.html | 1 + vendor | FDR |
| 4 | Mobile app & customisation limits | "Mobile app experience and customization limitations." | Techjockey | 2 | HR |
| 5 | Slow rollout of new modules | "poor customer support and slow implementation of new modules" [indirect] | Techjockey [indirect] | 1 | HR |

### 1.10 RazorpayX Payroll

Ratings: Techjockey [timed out]; MouthShut [blocked]. Complaint data is thin and mostly pricing.

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Free tier withdrawn with 2 weeks' notice mid-FY | r/IndiaTax user: "spoilt by the free version of RazorpayX Payroll, and now they're changing to ₹2k per month for my 4 employees, with literally 2 weeks of notice in Q3 of the FY" | quoted in https://hrone.cloud/blog/razorpayx-payroll-pricing/ [competitor, indirect — original Reddit thread not fetched] | 1 | FDR |
| 2 | Entry plan lacks approvals, integrations, APIs, L&A | "Prime Plan… lacking access to essential features like approval workflows, third-party tool integrations and APIs, and robust Leaves and Attendance workflows" [indirect] ; official page: Integrations "Limited in PRIME", Support "Limited in PRIME/ELITE" | https://www.techjockey.com/reviews/razorpayx [indirect] ; https://razorpay.com/payroll/pricing/ | 2 + vendor | FDR |
| 3 | Support slow/limited | "occasional slow or limited support availability" [indirect] | SoftwareSuggest/Slashdot [indirect] | 2 | FDR |
| 4 | Thin HRMS/reporting | "incomplete features around reports, compliance integrations and HRMS functionality" [indirect] | Slashdot [indirect] | 2 | HR |
| 5 | Worst per-head economics at tiny headcounts | ₹3,499/mo for ≤20 emp → ₹175/emp; ₹500/emp for the 4-emp Reddit case | https://razorpay.com/payroll/pricing/ | computed | FDR |

### 1.11 factoHR

Ratings: Capterra 4.7 (10; 1×1★) — https://www.capterra.com/p/166224/factoHR/reviews/

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Salary calc errors | "some errors in salary calculations" | Capterra | 1 | HR |
| 2 | Complex, long learning curve | "functionality is a bit complex, so we have to devote considerable time learning" | Capterra | 2 | HR |
| 3 | Basic UI | "UI is very basic they need to work on it" (UI/UX lead) | Capterra | 2 | DEV |
| 4 | Limited customisation & reporting | "customization options can be limited… reporting features could be more advanced" (2★) | Capterra | 2 | DEV |
| 5 | Lag during updates | "software shows some lagging issues at times" | Capterra | 1 | HR |
| 6 | SAP SF OData not callable | "doesn't support calling SAP SF ODATA APIs" [indirect] | G2 [indirect] | 1 | DEV |

### 1.12 Spine HR

Ratings: Techjockey 4.3 (53) — https://www.techjockey.com/reviews/spine-hr-suite

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Tickets closed in a hurry; no documented support IDs | "Too much hurry to close the ticket whichever raised by team" ; "no offline or documented support ids there" | Techjockey | 3 | HR |
| 2 | Shift/attendance mismatch | "Shift scheduled is not showing proper attendance despite general shift" | Techjockey | 1 | HR |
| 3 | Dated UI, poor Android app, slow reports | "non-intuitive interface… criticizing the Android application's performance… slow report generation" [indirect] | https://www.g2.com/products/spine-hrms/reviews?qs=pros-and-cons [indirect] | 3+ | HR, EMP |
| 4 | Limited dashboard/form customisation; no automated local compliance reporting | "No automated compliance reporting for local laws… no advanced payroll customization" [indirect] | https://hrone.cloud/blog/spine-hr-review/ [competitor, indirect] | 2 | HR |
| 5 | Costly for small firms; quote-only | "Little bit costly but worth it" ; ~₹40,500/yr or ₹200+/emp/mo quotes [indirect] | Techjockey ; indianhrm [indirect] | 2 | FDR |

### 1.13 PeopleStrong

Ratings: Software Advice 4.2 (12) — https://www.softwareadvice.com/hr/peoplestrong-alt-profile/reviews/

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Payslips not protected / no 2FA | "Pay slips from PeopleStrong are not protected, need two factor authentication" (3★) | Software Advice | 1 | EMP |
| 2 | Mobile slower than web; app needs multiple attempts to open | "Mobile version slower than the web version" ; "took time to open and required multiple attempts" [indirect] | Software Advice ; G2 [indirect] | 3 | EMP |
| 3 | Dated, uninspiring UI | "web design… too simple and lacks motivational appeal" ; "visuals looked somewhat outdated and not very interactive" [indirect] | Software Advice ; G2 [indirect] | 3 | EMP |
| 4 | No real-time analytics | "Lacks real-time analytics; backend limitations require manual data highlighting" | Software Advice | 1 | HR |
| 5 | Notifications not to linked Outlook | "Triggers should come to linked outlook ID" | Software Advice | 1 | HR |
| 6 | Complex; needs IT & training | "requiring IT support and extensive configuration" [indirect] | selecthub [indirect] | 2 | HR |
| 7 | Vendor conduct (1★) | "Fake company..arrogant people unethical people bad management" (51-200 emp, 1★) — **unverified, single review** | Software Advice | 1 | FDR |

### 1.14 Kredily

Ratings: Capterra India 3.8 (12) — https://www.capterra.in/software/186516/kredily ; Techjockey [timed out]

| # | Complaint | Quote / paraphrase | Source | Freq | Who |
|---|---|---|---|---|---|
| 1 | Ads on every login in the "free forever" plan | "Annoying ads every time you log in or refresh the page" (2★) ; forced ads for "health insurance, renewal offers… if they try to skip them, it prompts them to set up a call" [indirect] | Capterra India ; SoftwareSuggest [indirect] | 2 | HR |
| 2 | Features removed without warning (even paid) | "Remove features without warning" ; "even if you pay for useful features, they can disappear without notice" [indirect] | Capterra India ; SoftwareSuggest [indirect] | 2 | HR |
| 3 | Hidden charges / T&C changes | "frequently changes terms and conditions with hidden details… adding many additional charges after the customer commits" [indirect] | SoftwareSuggest [indirect] | 1-2 | FDR |
| 4 | Payslip generation window crashes | "window crashes most of the time and users must repeat the procedure" [indirect] | SoftwareSuggest [indirect] | 1 | HR |
| 5 | Session expiry / auto-logout / login issues | "Automatic logout after inactivity is irritating" ; "Login issues and session expiry when navigating pages" | Capterra India | 2 | HR |
| 6 | Support 2-3 day response | "responses coming in 2 or 3 days" [indirect] | SoftwareSuggest [indirect] | 1 | HR |
| 7 | Free plan limits: 250MB, 1 leave rule, 1 salary structure, no bank payout/Form 16 | vendor pricing page | https://kredily.com/pricing | vendor | FDR |

---

## 2. Cross-product theme matrix

Legend: ● strong/recurring evidence, ○ some evidence, — not seen. (Kd = Kredily, PS = PeopleStrong, Sp = Spine, RX = RazorpayX, ZP = Zoho People/Payroll, PH = Pocket HRMS)

| Theme | Keka | greytHR | Darwinbox | ZP | HROne | PH | sumHR | Zimyo | Qandle | RX | factoHR | Sp | PS | Kd |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Slow / unknowledgeable support, esp. payroll week | ● | ● | ● | ● | ○ | ○ | ○ | ● | ○ | ○ | — | ● | — | ○ |
| Mobile app crashes / login loops / forced re-auth | ● | ● | ● | ○ | ○ | — | — | — | ○ | — | — | ○ | ○ | ○ |
| GPS/geofence/selfie check-in failures | ● | — | ● | ● | ○ | ○ | — | — | — | — | — | — | — | — |
| Attendance ↔ biometric sync issues | ● | ○ | — | — | ○ | — | — | — | ● | — | — | ○ | — | — |
| Payroll / leave / LOP / tax calc errors | ○ | ● | ○ | ○ | ○ | ○ | ○ | — | — | — | ○ | ○ | — | — |
| Rigid config; can't model own policy | ● | ● | ○ | ○ | ● | ○ | ● | ○ | ○ | — | ○ | ○ | — | — |
| Weak / gated reporting, no custom reports | ● | ● | ● | ○ | ● | — | ● | — | — | ○ | ○ | ● | ○ | — |
| Slow page loads / lag with data | ○ | ○ | ● | ○ | ● | ○ | ○ | ○ | ○ | — | ○ | ○ | ○ | — |
| Dated / cluttered UI | — | ● | ○ | ○ | ○ | ○ | ○ | ○ | — | — | ○ | ● | ● | — |
| Mobile feature parity < web | ● | — | ○ | ● | — | — | — | — | ○ | — | — | — | ○ | — |
| Long implementation; billing from signature | ● | ○ | ● | — | — | ○ | — | ● | ○ | — | — | — | ○ | — |
| Seat minimums / flat floors hurt small firms | ● (100) | ○ (50 in base) | ● | ○ | ● (50) | ● (50) | — | ● (40) | ● (50) | ● (20) | ○ (50) | ● | ● | — |
| Add-on sprawl / hidden fees / renewal uplift | ● | ● | ● | ○ | ○ | ○ | — | ○ | ○ | ● | — | ○ | — | ● |
| Sudden pricing/feature changes | — | ○ | — | — | — | — | — | — | — | ● | — | — | — | ● |
| Integration gaps (Tally/QuickBooks/Oracle/SAP/Slack) | ● | ● | ○ | — | — | — | ○ | — | — | ○ | ○ | — | ○ | — |
| API: no webhooks / paid / gated | — | ● | — | — | — | — | ○ | — | — | ● | ○ | — | — | — |
| Multi-entity / multi-state weakness | ● | ○ | — | ● | — | ● | — | — | — | — | — | — | — | ○ |
| Unannounced downtime / instability | — | ● | ○ | — | ○ | — | — | ○ | ○ | — | — | — | — | — |
| Data export / exit friction | ○ | — | ○ | — | — | — | — | — | — | — | — | — | — | — |
| Privacy / payslip security | — | — | ○ | — | — | — | — | — | — | — | — | — | ○ | — |
| Ads inside product | — | — | — | — | — | — | — | — | — | — | — | — | — | ● |

Top 5 cross-cutting pains (by breadth): (1) support quality during payroll week, (2) mobile attendance reliability (GPS/selfie/login), (3) reporting depth and gating, (4) policy rigidity (leave accrual, shifts, comp-off), (5) seat minimums + add-on/renewal surprises.

---

## 3. Features customers explicitly ask for (missing today)

| Ask | Who asked / where |
|---|---|
| Configurable leave accrual rules; approved-leave PDF export | greytHR reviewers — https://www.softwareadvice.com/hr/greythr-profile/reviews/ ; Capterra |
| Preview GPS pin before submitting check-in; accurate geofence; offline check-in | Zoho community — https://help.zoho.com/portal/en/community/topic/check-in-out-location ; Zoho People Capterra ("limited offline access") |
| Persist credentials / biometric login that doesn't loop | Darwinbox App Store — https://apps.apple.com/in/app/darwinbox/id1268513740?see-all=reviews |
| Phone/weekend escalation for payroll emergencies | Keka (hr.software citing G2) |
| Use a subset of modules without full 25-sheet onboarding | Keka Capterra 1★ CTO |
| Custom / compliance-ready reports, real-time analytics, dashboards | HROne Techjockey; sumHR; Darwinbox; PeopleStrong; Spine |
| Plant/shift-level attendance rules without forced regularisation; comp-off, break shifts | Darwinbox App Store; Pocket HRMS Capterra (hospitality) |
| Multi-company linking / group consolidation in one tenant | Pocket HRMS Capterra; Zoho (per-entity subscription); Keka >500 [competitor] |
| Native Tally / QuickBooks / Oracle / SAP OData connectors; Slack/JIRA | greytHR GetApp; Keka G2 [indirect]; factoHR G2 [indirect]; https://hrone.cloud/blog/hrms-integrations-india-tally-sap-biometric/ [competitor] |
| Webhooks + bundled API (not ₹15/emp add-on) | greytHR API directory — https://www.getknit.dev/blog/greythr-api-directory-9RnbMR |
| Third-party biometric device sync | greytHR Capterra; Qandle Capterra |
| Payslip protection / 2FA on payslips | PeopleStrong Software Advice |
| Candidate data export (Excel) from ATS; an ATS at all | Pocket HRMS Capterra; HROne Capterra |
| Employee deletion / backdated transfers | HROne Capterra & Techjockey |
| Error logs visible to admins | Pocket HRMS Capterra |
| Expense: receipt OCR, multi-level approvals, corporate cards | sumHR Software Finder |
| PF/ESI registration assistance | Zoho Payroll [indirect] |
| Directory privacy controls (hide phone numbers) | Darwinbox Capterra [indirect] |
| Notifications to linked Outlook; WhatsApp payslips; regional-language app | PeopleStrong; WhatsApp/regional asks appear in vendor marketing (https://www.zfour.in/post/whatsapp-hrms-integration-the-end-of-hr-portals-in-2026) — **demand signal, not a review quote** |
| Notify before maintenance windows | greytHR GetApp (Director) |
| Transparent renewal pricing; no billing before go-live | Keka/Darwinbox/greytHR [competitor blogs]; Akrivia |

---

## 4. Pricing facts (INR, ex-GST unless noted; 18% GST applies everywhere)

| Product | Plans / list price | Included seats / minimum | Overage | Implementation / add-ons | Source & confidence |
|---|---|---|---|---|---|
| **Keka** | Foundation ₹9,999/mo; Strength ₹12,999; Growth ₹15,999 (US: $9/$16/$22 PEPM) | Base covers up to 100 emp | +₹90 / ₹120 / ₹150 per emp | Keka Learn ₹60/emp/mo (50-emp min); Hiring Pro & PSA custom quote; competitor claims "2% setup fee" and metering from signature | https://www.hr.software/reviews/keka (medium); https://hrone.cloud/blog/keka-pricing-india/ [competitor, indirect]. Other trackers show older ₹6,999/₹9,999/₹13,999 (https://ezhrm.in/keka-hr-pricing/) — **conflicting; verify on keka.com** |
| **greytHR** | Starter free ≤25 emp (250MB cap, deactivates after 3 idle months); Essential ₹2,495/mo; Growth ₹4,495/mo; Premium quote | Base covers first 50 emp "whether you have that many or not" | +₹45 (Essential) / +₹85 (Growth) per emp >50 | GPS Live Tracking ₹140/user; Recruit ₹2,500/recruiter; Performance ₹35-45/user; Timesheets ₹35; Expense ₹35; Alumni ₹20; SSO ₹10/emp; **REST API ₹15/emp/mo**. Third-party: implementation ₹10k-50k, biometric ₹5-15k/device | https://www.indianhrm.com/greythr-pricing (high, dated Sep 2026); https://aidukan.in/greythr-price-india/ (medium). Some partner pages show different tiers (₹3,495/25; ₹4,995/50; Pro ₹149 PEPM — https://www.itforsme.in/pricing/greythr-india) — **conflicting** |
| **Zoho People** | Essential ₹50-60 PEPM; Professional ₹100-120; Premium ₹165-180; Enterprise ₹230-240 (annual saves >20%) | Free ≤5 users; 5-user minimum | per user | **No Indian statutory payroll** — needs Zoho Payroll | https://www.indianhrm.com/zoho-people-pricing (medium) |
| **Zoho Payroll** | Free ≤10 emp; Standard ₹1,000/mo annual (₹1,250 monthly); Professional ₹3,000 (₹3,750); Premium ₹4,000 (₹5,000) | Standard covers 25; Pro/Premium cover 50; not strictly enforced | +₹40/₹60/₹80 (annual) or ₹50/₹75/₹100 (monthly) | Leave & attendance **Premium only**; **separate subscription per legal entity**; 100 emp People Pro + Payroll Pro ≈ ₹23,010/mo incl. GST | https://www.indianhrm.com/zoho-payroll-pricing (high) |
| **HROne** | Basic ₹4,950/mo; Professional ₹6,500/mo; Enterprise quote | **50-user floor** (₹99 / ₹130 per user effective) | +₹99 / +₹130 per user | No setup fee on standard; implementation fee on enterprise (unpublished); add-ons (Payroll outsourcing, WhatsApp bot, Teams bot, BI, Workforce planning) quote-only; **2-month cancellation notice** | https://www.indianhrm.com/hrone-pricing (high, verified 17 Sep 2026) |
| **Pocket HRMS** | Standard ₹2,995/mo; Professional ₹4,495/mo (billed annually); Premium quote | **Min 50 emp**; Premium min 100+ | +₹60 / +₹90 per emp | **One-time implementation fee** (varies); add-ons: Expense, Geo-tracking, Timesheet, Survey, Helpdesk, Recruitment, Learning, WhatsApp automation, PMS, ePOSH; custom API integrations priced separately | https://www.pockethrms.com/pricing/ (high, vendor) |
| **sumHR** | ₹1,428/emp/year (≈₹119 PEPM), pay-as-you-go | no stated minimum | — | Payroll outsourcing add-on; recruitment "coming soon" | https://www.sumhr.com/pricing/ (medium; page partially readable) |
| **Zimyo** | Basic ₹60 PEPM; Standard ₹120; Enterprise ₹250 (other trackers: from ₹80 PEPM) | **Min billing 40 emp** (~₹4,000 floor) | per emp | not published | https://www.saasworthy.com/product/zimyo-hrms and https://www.softwaredekho.in/software/zimyo-hr [indirect, medium-low]; vendor page timed out |
| **Qandle** | Foundation ₹2,950/mo; Regular ₹4,950; Plus ₹6,200; Premium ₹8,000; Enterprise >1,000 emp quote | **Min billing 50 users** | per emp beyond 50 (rate not published) | "Nominal one time implementation fee"; add-ons Shift Planning, Field Force Tracking, Timesheets, HR/Payroll/Compliance advisory; **no refund of remaining credit**; free biometric integration | https://www.qandle.com/transparent-pricing.html (high) + Techjockey [indirect] for tier prices |
| **RazorpayX Payroll** | Prime ₹3,499/mo; Elite ₹6,499/mo (annual) or ₹9,499 (semi-annual); Enterprise quote (100+) | Prime ≤20 emp; Elite ≤50 | +₹150/emp/mo | **No free tier** (free tier withdrawn; r/IndiaTax user quoted ₹2k/mo for 4 emp with 2 weeks' notice [indirect]); integrations & advanced payroll "Limited in PRIME"; expense & support limited below Enterprise | https://razorpay.com/payroll/pricing/ (high, vendor) |
| **factoHR** | Free ≤20 emp; Core ₹4,999/mo; Premium ₹5,999; Ultimate ₹6,999 (billed yearly) | Base covers 50 | +₹99 / ₹119 / ₹139 per emp | Selfie punch, Timesheet, AI chatbot ~$0.5/emp; Recruitment $75/recruiter; "no cancellation fee or lock-in" | https://factohr.com/pricing/ (high, vendor) |
| **Spine HR** | Quote-only; trackers cite ₹40,500/yr, ₹35,000/mo (IndiaMART listing), or ₹200+ PEPM; iTQlick est. $29/user + $1-5k implementation | — | — | customisation/training extra (est.) | indianhrm / techjockey / indiamart [indirect, low] |
| **PeopleStrong** | Quote-only; ~₹120 PEPM mid-market; $3 PUPM at 501-1000 (volume discounts >1000) | enterprise | — | — | softwarefinder / hrstacks / akrivia [indirect, low] |
| **Darwinbox** | Quote-only; ₹150-400 PEPM for 100-300 emp; ₹200-600 PEPM cited; **implementation $5k-50k** or "1x-2x annual licence", 4-9 months | 4 bands (<500 / 500-2.5k / 2.5k-10k / >10k) | — | renewal escalators, per-entity charges [competitor] | https://asanify.com/blog/competition/asanify-vs-darwinbox/ ; https://hrone.cloud/blog/darwinbox-pricing/ [both competitor, indirect, low-medium] |
| **Kredily** | Free ₹0 unlimited emp (250MB, 1 leave rule, 1 salary structure, ads); Payroll OS ₹1,249/mo; Professional ₹1,749/mo; Enterprise quote | Paid plans cover 25 | +₹50 / +₹70 per emp | Klocky, Live Tracking, KredEYE face-recog ₹50/user/mo each; bank payouts, PF/ESI challans, Form 16 only on paid | https://kredily.com/pricing (high, vendor) |

Market-wide pricing complaints (secondary sources, treat as directional): renewals "hike rates by 15-25% in year two"; hidden costs "add 30-60% to your quoted price" — https://ezhrm.in/hr-software-cost-india/ [competitor]; "When HR managers in India switch software providers, the most common complaint isn't the product — it's the surprise invoice" — https://www.trilliantsoftware.com/hrms-software-price-in-india-complete-pricing-guide-for-2026/ [vendor].

---

## 5. What customers praise (the bar to clear)

| Product | Praise themes (from same review pages) |
|---|---|
| Keka | Clean modern UI; payroll usable by non-finance staff; ESS adoption 80-90% in first quarter; consolidated attendance/leave/expense/performance in one place; easy report export (Capterra, GetApp, hr.software) |
| greytHR | Deepest Indian statutory compliance (PF/ESI/PT/TDS, ECR files); "battle-tested" since 2009; support often praised as prompt (Trustpilot, App Store "Great Support"); cost-effective for SMEs; biometric integration works (Capterra, GetApp, Trustpilot [indirect]) |
| Darwinbox | Mobile-first, "consumer grade" UI on iOS; single platform hire-to-retire; face-recognition attendance; configurable workflows; Gartner PI 4.7/593 (App Store, Capterra, Gartner [indirect]) |
| Zoho People | Highly customisable forms/workflows; Zoho ecosystem integration (Books, Recruit); cheap PEPM; "no training whatsoever was needed" (Capterra, Play [indirect]) |
| Zoho Payroll | Low entry price, free ≤10; auto PF/ESI/PT/LWF/TDS; plugs into Books/People; "saved eight hours per month" (GeeksforGeeks case) |
| HROne | Compliance-aligned forms; security; fast performance; strong support (4.8/5 Techjockey); biometric integration |
| Pocket HRMS | Support within 1-8 hours; GPS mobile app; 360° appraisal; value for money |
| sumHR | Simple setup; Google Workspace integration; automation for leave/attendance/payroll; affordable |
| Zimyo | Responsive support (4.6/5 Capterra despite outliers); all-in-one; easy mobile app; ~$2/user value |
| Qandle | Clean UX; geofenced attendance; support 4.9/5 Techjockey; no lock-in |
| RazorpayX | Salary disbursed directly from the product; auto-files TDS/PF/PT/ESI; automatic payslips reduce employee queries; ideal for startups/contractor payouts |
| factoHR | Payroll & customizable reports rated 5.0; peer recognition/gamification; mobile-first; no lock-in |
| Spine HR | Strong reporting/data management for those who like it; scalable; complete package for small orgs |
| PeopleStrong | Payroll accuracy; performance module; AI recruiting; enterprise scale |
| Kredily | Truly free for unlimited employees; simple; fast support (when it responds) |

Implication for YukthiX: the bar is (a) greytHR-grade statutory correctness with ECR/challan/Form 16/24Q out of the box, (b) Keka/Darwinbox-grade UI, (c) a mobile check-in that actually works (GPS preview, offline queue, no re-auth loops), (d) support with a human on payroll days, and (e) pricing with no seat floor, no billing-before-go-live, API and webhooks bundled, and a documented one-click full data export.

---

## Appendix: source index (fetched or cited)

Capterra: https://www.capterra.com/p/149253/Keka/reviews/ · https://www.capterra.com/p/150850/greytHR/reviews/ · https://www.capterra.com/p/150606/Darwinbox-HR/reviews/ · https://www.capterra.com/p/110931/Zoho-People/reviews/ · https://www.capterra.com/p/222335/HROne/reviews/ · https://www.capterra.com/p/157434/Pocket-HCM/reviews/ · https://www.capterra.com/p/275269/Zimyo-HRMS/reviews/ · https://www.capterra.com/p/173077/Qandle/reviews/ · https://www.capterra.com/p/166224/factoHR/reviews/ · https://www.capterra.in/software/186516/kredily
GetApp / Software Advice: https://www.getapp.com/hr-employee-management-software/a/keka/reviews/ · https://www.getapp.com/hr-employee-management-software/a/greythr/reviews/ · https://www.getapp.com/hr-employee-management-software/a/darwinbox/reviews/ · https://www.softwareadvice.com/hr/keka-profile/reviews/ · https://www.softwareadvice.com/hr/greythr-profile/reviews/ · https://www.softwareadvice.com/hr/zoho-people-profile/reviews/ · https://www.softwareadvice.com/hr/peoplestrong-alt-profile/reviews/
Techjockey: https://www.techjockey.com/reviews/spine-hr-suite · https://www.techjockey.com/reviews/zimyo-hrms · https://www.techjockey.com/reviews/qandle · https://www.techjockey.com/reviews/hr-one-hrms
App Store: https://apps.apple.com/in/app/keka-hr/id1448024119?see-all=reviews · https://apps.apple.com/in/app/darwinbox/id1268513740?see-all=reviews · https://apps.apple.com/in/app/greythr-the-one-stop-hr-app/id959795880?see-all=reviews&platform=iphone
Forums: https://community.greythr.com/t/greythr-system-errors/12514 · https://community.greythr.com/t/if-you-encountered-a-bug-or-discrepancy-in-greythr-e-g-payroll-mis-calculation-how-did-you-identify-it-and-fix-it/21044 · https://help.zoho.com/portal/en/community/topic/check-in-out-location · https://help.zoho.com/portal/en/community/topic/i-am-not-able-to-check-in-and-checkout-in-zoho-people-even-location-access-allowed
Pricing: https://razorpay.com/payroll/pricing/ · https://factohr.com/pricing/ · https://kredily.com/pricing · https://www.pockethrms.com/pricing/ · https://www.qandle.com/transparent-pricing.html · https://www.sumhr.com/pricing/ · https://www.indianhrm.com/greythr-pricing · https://www.indianhrm.com/zoho-payroll-pricing · https://www.indianhrm.com/zoho-people-pricing · https://www.indianhrm.com/hrone-pricing · https://aidukan.in/greythr-price-india/ · https://www.itforsme.in/pricing/greythr-india
Analyst / competitor (flagged): https://www.hr.software/reviews/keka · https://www.hr.software/reviews/hrone · https://www.hr.software/reviews/razorpayx-payroll · https://www.omnihr.co/faqs/darwinbox-common-complaints · https://akriviahcm.com/blog/darwinbox-alternatives-india-2026 · https://www.hrsuggest.com/resources/darwinbox-vs-keka-india-march-2026 · https://hrone.cloud/blog/keka-pricing-india/ · https://hrone.cloud/blog/greythr-pricing-india/ · https://hrone.cloud/blog/razorpayx-payroll-pricing/ · https://hrone.cloud/blog/outgrowing-keka-darwinbox-greythr-india/ · https://hrone.cloud/blog/darwinbox-pricing/ · https://www.getknit.dev/blog/greythr-api-directory-9RnbMR · https://ezhrm.in/keka-hr-pricing/ · https://www.asanify.com/blog/competition/asanify-vs-darwinbox/
Blocked (data used only via snippets): g2.com, play.google.com, trustpilot.com, mouthshut.com, softwaresuggest.com, gartner.com, keka.com/pricing, zoho.com
