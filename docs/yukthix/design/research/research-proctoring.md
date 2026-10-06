# Competitive Pain-Point Research: Online Assessment & Proctoring Vendors

**Prepared for:** YukthiX Proctoring/Assessment product team
**Date:** 2026-09-26
**Method:** ~65 web searches + ~45 page fetches (Trustpilot, Capterra, TrustRadius, vendor pricing/support pages, court/settlement sites, EFF/CDT/ACLU, news, Levels.fyi/Blind/Reddit via search). G2 and Gartner Peer Insights pages returned HTTP 403 to fetches, so G2 items below are paraphrased from search-result snippets and are marked **[G2 via search snippet]**. Blind (teamblind.com) could not be fetched directly; Blind items are from search snippets. Nothing below is an invented quote; where I only have a paraphrase I say so.

**Confidence legend:** (H) fetched primary page; (M) search snippet of the named page; (L) third-party aggregator/blog claim, unverified.

---

## 1. Per-vendor recurring complaints

### 1.1 HackerRank (technical screening, "Proctor Mode")
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Expensive; extra licenses too costly; cost hard to justify when no open roles | Recruiter/SMB | High | [G2 via search snippet] "additional license costs are too high"; pricing "a barrier for smaller companies" https://www.g2.com/products/hackerrank-developer-skills-platform/reviews?qs=pros-and-cons (M) |
| Question leakage -> plagiarism flags | Recruiter | Med | G2 reviewer: "significant leakage of test content, leading to many plagiarism flags" (M, same URL). Public GitHub "hackerrank-solutions" topics with thousands of repos: https://github.com/topics/hackerrank-solutions (H) |
| AI-plagiarism detector precision only ~85%; off by default; flags legit external-IDE paste | Recruiter + candidate | Med | HackerRank KB: ML model "85%" precision, "not enabled by default", struggles with short solutions; pasting from external IDE "will likely trigger flags" https://support.hackerrank.com/articles/8000786908-ai-plagiarism-detection (H) |
| Rejected after perfect score with no feedback; webcam/camera disconnect anxiety; flags "not manually reviewed" | Candidate | High | Blind threads (M): https://www.teamblind.com/post/camera-disconnected-for-5-seconds-in-a-proctored-hackerrank-oa-will-i-get-instantly-disqualified-o87upgaj ; https://www.teamblind.com/post/hackerrank-nightmares-djlrxnuf |
| Clunky UI between test creation / reports / settings; hidden test cases; no integrated debugger; outdated challenges; unresponsive support | Recruiter + candidate | Med | Capterra/G2 paraphrase (M): https://www.capterra.com/p/143549/HackerRank/reviews/ (fetch returned 404; snippet only) |
| Detection gaps: invisible overlays (Interview Coder/Cluely) not seen; voice-mode LLM on second device missed; gaze detection only limited release (Jul 2026) | Recruiter | Rising | https://www.herohunt.ai/blog/detecting-ai-interview-cheating-2026/ (H, secondary) ; HackerRank's own 2025 playbook https://www.hackerrank.com/writing/stopping-ai-cheating-remote-tech-assessments-2025-playbook-recruiters (M) |

Praise: large question library, brand recognition with candidates, broad ATS library (30+ connectors claimed), 4.6/5 on ~1,015 G2 reviews (M).

### 1.2 Codility
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Steep price jump between tiers; "Licence package too broad and expensive" | Recruiter | High | Capterra (H) https://www.capterra.com/p/177457/Codility/reviews/ ; pricing page (H) https://www.codility.com/pricing/ |
| Hidden test cases; "Does not have a debugging pane"; "test cases are not visible to the programmer" | Candidate/eng | High | Capterra (H) |
| Over-indexed on edge cases; severe time limits add "unnecessary stress" | Candidate | Med | Capterra (H) |
| Doesn't test what engineers do: "Over half of what our engineers do is debug... None of these things are tested" (2-star) | Eng manager | Med | Capterra (H) |
| ATS integrations "aren't quite as polished yet"; no non-technical tests | Recruiter | Med | Capterra (H) |
| Reporting "kinda messy and less interactive"; slow initial setup | Recruiter | Low | Capterra (H) |
| Blind threads: "failure despite doing all questions correctly" (Microsoft OA) | Candidate | Med | https://www.teamblind.com/post/microsoft-codility-online-assessment-failure-despite-doing-all-questions-correctly-vrgo1rum (M) |

Praise: strong similarity/leak detection (scrapes web for leaked solutions, ~10-11% cheat rate reported) https://support.codility.com/hc/en-us/articles/360043825273-Similarity-Check-and-what-to-do (M); unlimited candidates on monthly plan; 4.6/5 (43 Capterra reviews).

### 1.3 CodeSignal (GCA, Suspicion Score)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Opaque cheating accusations; reason changed on appeal; "their decision was final"; MDN docs use (permitted) triggered "unauthorized device/resources" | Candidate | High (viral) | Levels.fyi thread (H) https://www.levels.fyi/community/thread/3dFjyV/what-to-log-for-codesignal-gca-accusation-defense |
| Requires government ID + continuous video/audio; data not shared with employer -> candidate can't contest | Candidate | Med | Blind (M) https://www.teamblind.com/post/codesignal-proctoring-7cbsha4c |
| On-demand credits $20 each after allotment; quote-based upper tiers | Recruiter | Med | Pricing page (H) https://codesignal.com/pricing/ |
| Cannot distinguish "genuine hesitation from AI pausing"; doesn't detect live-video feeds | Recruiter | Rising | herohunt (H, secondary) |
| Self-reported fraud attempts on proctored assessments 35% (Feb 2026), up from 16% in 2024 | Vendor stat | — | https://aiseptor.com/research/ai-cheating-statistics-2026 (H, secondary) |

Praise: self-serve pricing from $79/mo; GCA score portability; AI interviewer bundled.

### 1.4 HackerEarth
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "The pricing when compared to features was quite not that reasonable"; per-user/per-job pricing; cost climbs before features unlock | Recruiter | High | Capterra (H) https://www.capterra.com/p/183879/HackerEarth-Recruit/reviews/ ; G2 (M) |
| Customization gated behind enterprise; specialized-role tests "restricted or impractical" on standard plans | Recruiter | Med | G2 (M) https://www.g2.com/products/hackerearth-assessments/reviews |
| Unclear question requirements/grading; unexpected logouts/disconnects; emails land in spam | Candidate | Med | Capterra (H) |
| UI "a bit better" needed; not beginner-friendly | Both | Med | Capterra (H) |
Praise: 4.7/5 (26 Capterra); good for high-volume campus hiring; responsive to custom asks.

### 1.5 Mercer | Mettl
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "a lot of glitches" in tech + customer service; "lengthy procedure for security and updates" | Admin/university | Med | SoftwareSuggest (H) https://www.softwaresuggest.com/mettl-online-assessment/reviews ; G2 (M) "Terrible platform, doesn't work and HORRENDOUS customer service" https://www.g2.com/products/mercer-mettl-assessments/reviews?qs=pros-and-cons |
| Per-assessment charges "pretty higher"; pricing high for small teams | Recruiter | Med | G2 (M) |
| Inflexible templates; custom question banks time-consuming; advanced features need onboarding | Recruiter | Med | G2 (M) |
| AI flags (face not visible, looking away, phone) treated as accusations; 98% detection claim raises false-positive questions | Student/candidate | Med | Student-defense law firm page https://www.studentdisciplinedefense.com/mercer-mettl-and-online-cheating (M) |
| Privacy policy: undefined "permissible related purpose" secondary use; no retention period | Policy critique | Low | MediaNama Aug 2020 (H) https://www.medianama.com/2020/08/223-ai-proctored-exams-privacy/ |
| Quote-only pricing; no public rates | Buyer | — | https://mettl.com/pricing/ (H) |
Praise: large enterprise client base in India; broad test catalog; DU/OBE-scale delivery.

### 1.6 TestGorilla
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Annual lock-in, no monthly; refused refunds; auto-renew; "emailed support almost 20 times begging for cancellation... only offered a rigid 3-month pause" | SMB buyer | Very high | Capterra (H) https://www.capterra.com/p/203823/TestGorilla/reviews/ ; Trustpilot (H) "charged $169 USD for seven consecutive months, even after I explicitly canceled" (Jan 16 2026) https://www.trustpilot.com/review/testgorilla.com?page=2 |
| Credits don't pause/carry forward when hiring stops | SMB buyer | High | https://www.willo.video/blog/testgorilla-pricing-review (H) |
| Test quality: "not written correctly... not even written in full english" (Dec 2025); "advanced SQL test is not a realistic scenario"; PHP tests "poorly constructed" | Candidate + CTO | High | Trustpilot (H); Capterra (H) |
| Irrelevant questions, "Unrealistic completion timing"; result not shown to candidate | Candidate | High | Trustpilot (H) Sep/Dec 2025 |
| Features (video, ATS, seats, branding) require Plus/custom quote; Greenhouse integration "only returned summary scores" | Buyer | Med | willo (H); hiretruffle (M) |
| Support slow / "doesn't understand customer needs" | Buyer | Med | Capterra (H) |
Ratings split: G2 ~4.5 (1,400+) vs Trustpilot 3.6-3.9 (1,700+). Praise: large library, easy candidate UX, free tier.

### 1.7 iMocha
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Slow/laggy at times | Candidate | Med | G2 (M) https://www.g2.com/products/imocha/video-reviews |
| Unclear question wording | Candidate | Med | G2 (M) |
| UX "overwhelming" vs competitors | Recruiter | Low | G2 (M) |
| No public pricing on site (third parties cite ~$400/mo start) | Buyer | — | https://www.imocha.io/pricing-skills-assessment (H – no prices shown) |
Praise: 4.4/5 (276 G2), skill variety, proctoring features.

### 1.8 Xobin
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "minor technical glitches"; "OTP issue, CV format issue" | Recruiter | Med | Capterra (H) https://www.capterra.com/p/166457/Xobin/reviews/ |
| Question bank not exhaustive; C++/automation-testing question quality | Recruiter | Med | Capterra (H) |
| "not able to notify candidate directly about their score/result"; can't preview own created assessment; no automation to next round | Recruiter | Med | Capterra (H) |
| Wants better integrations and "more advanced proctoring features" | Recruiter | Med | G2 (M) |
Praise: 4.5/5 (38), "affordable", "very helpful and quick to respond" support.

### 1.9 Wheebox (ETS subsidiary, India)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Claims IT Act s.79 intermediary status, shifting data-security liability to institutions; no retention period | Policy critique | Low | MediaNama (H) |
| Students required to install app for IIT-Bhubaneswar exams; students alleged problems, IIT denied | Student | Low | https://news.careers360.com/iit-bhubaneswar-denies-students-claims-on-online-exams (M) |
| Gartner Peer Insights page exists but fetch blocked; no verified cons captured | — | — | https://www.gartner.com/reviews/market/remote-proctoring-services-for-higher-education/vendor/wheebox/... (blocked) |
**Uncertainty:** I found no documented large-scale Wheebox outage in news; treat "Wheebox glitches" as unverified anecdote.

### 1.10 Talview
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Secure browser "extreemly unpleasant... forced both of us to create extreemly exotic settings" (1-star) | Admin/candidate | Med | Capterra (H) https://www.capterra.com/p/142374/Talview/reviews/ |
| Slow processing; portal stuck; "customer care number not working at the time of the examination" | Admin | Med | Capterra (H) |
| "I can not edit the registration form and to make changes I need to wait for 2 weeks"; large data downloads hard; integration "took much longer than anticipated" | Admin | Med | Capterra (H) |
| AI proctoring false positives; high bandwidth in pre-checks; promised features missing (per-question timer, reporting detail) | Candidate/admin | Med | G2 (M) https://www.g2.com/products/talview/reviews?qs=pros-and-cons |
| Unit-based pricing, ~150-200 candidate minimum, quote-only | Buyer | — | https://www.talview.com/en/pricing (H) |
Praise: 4.2/5 (42), Gartner presence, end-to-end interview+proctor.

### 1.11 Proctorio
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Accessibility: screen readers incompatible; stimming/headscarf flagged; ADHD gaze flagged | Students, disability advocates | Very high | Inside Higher Ed Feb 2021 (H) https://www.insidehighered.com/news/2021/02/01/u-illinois-says-goodbye-proctorio ; Truthout Jun 2022 (H) https://truthout.org/articles/surveillance-tech-is-wrongly-accusing-disabled-students-of-cheating-on-tests/ |
| "spyware": monitors "keystrokes, downloads, screen content" | Students | Very high | UIUC petition ~1,000 signatures (H, IHE) |
| Litigating critics (Linkletter, Johnson) | Public | High | EFF (H) https://www.eff.org/deeplinks/2022/03/eff-client-eric-johnson-and-proctorio-settle-lawsuit-over-bogus-dmca-claims ; Vice (H) https://www.vice.com/en/article/proctorio-is-doubling-down-on-lawsuits-against-its-critics/ |
| CEO posted student's support chat log on Reddit | Students | High | Ubyssey Jun 2020 (H) https://www.ubyssey.ca/news/proctorio-chat-logs/ |
| Chrome extension crashed mid-exam; support "MIA" | Student | Med | Ubyssey (H) |
| Low evidentiary value: UT Austin panel — 27 referrals, 13 upheld; "psychological (and financial) costs... not worth the small benefit" | Faculty | Med | The Register Aug 2021 (H) https://www.theregister.com/2021/08/20/ai_proctoring_software/ |
| Cost to institutions/students | University | Med | search-snippet pricing (below) |
Praise (Amsterdam court): encrypted, auto-deleted after 30 days, no live monitoring — ruled GDPR-compliant (M) https://gdprhub.eu/index.php?title=Rb._Amsterdam_-_C%2F13%2F684665_%2F_KG_ZA_20-481

### 1.12 Honorlock
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Fails to detect darker skin when looking up; false flags for leg-shaking/tapping | Students | High | FIU PantherNOW Feb 2024 (M) https://panthernow.com/2024/02/11/honorlock-may-be-going-down-and-it-rightfully-should/ |
| Retains facial data, driver's licenses, network info up to 1-2 years | Students (UT Dallas, Texas A&M petitions) | High | College Fix (M) https://www.thecollegefix.com/remote-proctoring-services-are-invasive-biased-and-cant-stop-cheating-critics-say/ |
| Room scans -> Fourth Amendment ruling (Ogletree) | Students | High | Higher Ed Dive (H) |
| BIPA exposure: Healy v. Honorlock, S.D. Fla. 2022 (face-geometry scans) | Students | Med | https://www.ahdootwolfson.com/blog/honorlock-facial-recognition-biometric-privacy-class-action-investigation/ (H) |
| Higher cost -> "reserve for high-stakes" guidance | University | Med | Univ. of Missouri teaching blog (M) https://teaching.missouri.edu/blog/navigating-online-proctoring-introducing-honorlock |
Praise: hybrid AI+live-pop-in reduces false positives; LMS-native; institutional docs generally positive.

### 1.13 ProctorU / Meazure Learning
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Proctor no-shows; waits of 1-6 hours; forced reschedules | Test-takers | Very high | Trustpilot go.proctoru.com **1.1/5, 171 reviews, 97% one-star** (H) https://www.trustpilot.com/review/go.proctoru.com ; BBB complaints https://www.bbb.org/us/al/hoover/profile/online-education/proctoru-0463-90114361/complaints (M) |
| Exam terminated near completion for "violated integrity policy" (Sep 19 2026) | Test-taker | High | Trustpilot (H) |
| "proctors have access to my full name, date of birth, home address, and driver's license number" (Sep 13 2026) | Test-taker | High | Trustpilot (H) |
| Told "not to look away... not rock back and forth" (Jul 2026) | Test-taker | High | Trustpilot (H) |
| Setup ~50 minutes; "English is terribly broken" | Test-taker | High | Trustpilot (H) |
| 2020 breach: 444k records (HIBP) -> BIPA class action (Thakkar, C.D. Ill., Mar 2021) | Students | High | https://haveibeenpwned.com/Breach/ProctorU (M); LawStreet (H) https://lawstreetmedia.com/news/tech/students-sue-online-exam-proctoring-service-proctoru-for-biometrics-violations-following-data-breach/ |
| Rush fees $8-12 for <72h scheduling | Students/universities | Med | Oklahoma State page (M) https://itle.okstate.edu/online-test-proctoring |
Praise: human validation, scale for credentialing bodies; G2 page exists (fetch blocked).

### 1.14 Examity (now Meazure)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "The program stalled, could not log in to start, proctor would not connect" (Oct 2024) | Test-taker | High | Trustpilot **1.6/5, 37 reviews** (H) https://ca.trustpilot.com/review/examity.com |
| "Forced to give a 'house tour' of all my closets, bathrooms, bedroom" (Jul 2024) | Test-taker | High | Trustpilot (H) |
| "Customer service has no capacity to think outside of the exam instructions"; can't understand proctors | Test-taker | High | Trustpilot (H) |
| Links sent after deadline; every test cancelled; reschedule fees | Test-taker | Med | Revdex (M) https://www.revdex.com/reviews/examity/8909301 |
Acquired by Meazure Learning Sept 2023 (H) https://www.meazurelearning.com/resources/meazure-learning-strengthens-position-as-global-leader-of-assessment-solutions-with-acquisition-of-examity

### 1.15 Respondus (LockDown Browser / Monitor)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Skin-tone bias measured: darker-skin students 6.07 flags/assessment vs 1.19 lighter; face detection 78% vs 92%; darkest-skin women 5.6x more likely flagged | Students/researchers | High | Frontiers in Education, Sep 2022, n=357, Univ. of Louisville (H) https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.881449/full |
| BIPA: Patterson/Veiga v. Respondus, **$6.25M settlement** (class Nov 2015–Jun 2023) | Students | High | https://topclassactions.com/lawsuit-settlements/closed-settlements/respondus-online-exam-bipa-6-25m-class-action-lawsuit-settlement/ (M); https://www.bipa-examsettlement.com/ (blocked) |
| Room scans -> Ogletree ruling | Students | High | Higher Ed Dive (H) |
| Univ. of Denver advises against facial detection feature due to false flags on students of color/accommodations | Faculty | Med | https://otl.du.edu/inclusive-use-of-proctoring-technology-lockdown-browser-respondus-monitor/ (M) |
| Crashes/freezes requiring hard restart | Students | Med | institutional KBs (M) |
Praise: cheapest at scale ($15/student/yr option); Respondus claims 80% false-positive reduction (M).

### 1.16 ExamSoft (Examplify)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Crashes/blank screens/lockouts during Oct 2020 & Jul 2021 remote bar exams | Bar candidates | Very high | The Markup Oct 2020 (M) https://themarkup.org/coronavirus/2020/10/13/remote-exam-software-failures-privacy ; Top Class Actions (M) |
| Facial recognition failed for darker skin, religious dress; Ian To demand letter | Bar candidates | High | VentureBeat/CSMonitor (M); Senators' letter Dec 2020 https://www.blumenthal.senate.gov/download/120320_-examsoft---letter- (M) |
| NCBE dropped ExamSoft for NextGen bar (Jul 2026) in favor of Surpass | Licensing body | — | ABA Journal Feb 2024 (H) https://www.abajournal.com/news/article/revised-bar-exam-wont-use-software-that-caused-tech-problems-for-some-test-takers |
| Disability-law suits vs NCBE/State Bar of CA re remote exam | Candidates | Med | (M) |
Pricing: not found publicly (search budget exhausted) — **unknown**.

### 1.17 Pearson VUE OnVUE
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Exams revoked mid-test for minor movement/bathroom break; "I did not see you pressed the 'take a break' button" (Jan 2026) | Cert candidates | Very high | Microsoft Q&A (H) https://learn.microsoft.com/en-us/answers/questions/5723752/pearson-vue-proctor-abusively-revoked-ai-102-exam ; AWS re:Post, Cisco community (M) |
| Opaque appeal; case review ~4 weeks; "never admitted there was an issue" | Candidates | High | same |
| OnVUE app heavy; laggy; crashes 20 min in | Candidates | High | Trustpilot pearsonvue.co.uk (M; fetch timed out) https://www.trustpilot.com/review/www.pearsonvue.co.uk ; SmartCustomer 1.3/5 (M) |
| Proctors with limited English; dismissive | Candidates | High | Trustpilot (M) |
| Global scheduled outage Oct 11-13 2024 | All | Low | https://www.cfre.org/news/pearson-vue-scheduled-outage/ (M) |

### 1.18 SHL
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Tests "had almost nothing to do with the actual role"; "abstract puzzles" (Nov 2025) | Candidates | High | Trustpilot **3.7/5, 47 reviews** (H) https://www.trustpilot.com/review/shl.com |
| Time pressure: even practice timed; "measuring how fast you can click" | Candidates | High | Trustpilot (H) |
| "broken interface. Expects you to drag and drop stuff while not saying so" (Jan 2026); platform errors (Oct 2024) | Candidates | Med | Trustpilot (H) |
| No feedback/results to candidates; can't skip/return to questions | Candidates | Med | Trustpilot (M) shl.co.uk |
Pricing (UK G-Cloud): per-candidate solution subscriptions; ~$30-60/test starter, $10-20 enterprise (L) https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/712341/704579213621572-pricing-document-2024-05-03-1352.pdf

### 1.19 Aon (cut-e)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Costly for smaller firms; reporting/analytics limited; support slow during implementation | HR buyers | Low-Med | SelectHub (L) https://www.selecthub.com/p/talent-assessment-tools/aon-assessment/ |
| Candidate complaints mostly about difficulty/time pressure (prep-site framing) | Candidates | Low | assessmentday (L) |
Pricing: quote-based; "$25,000 annual start", "$30-150 per candidate" (L, unverified).

### 1.20 Vervoe
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "It is soooo buggy, seems like they are still in beta" (2-star) | Recruiter | Med | Capterra **4.5/5, 65** (H) https://www.capterra.com/p/156174/Vervoe/reviews/ |
| "You can't delete your data, even the test data" | Recruiter | Med | Capterra (H) |
| "No internal communication tool with the candidates"; can't revive rejected candidate | Recruiter | Med | Capterra (H) |
| "It takes them days to reply and their technical support team is non-existent" | Recruiter | Med | Capterra (H) |
| Analytics "pretty basic"; wants ATS integration; filtering applicants "not usable" | Recruiter | Med | Capterra (H) |
Pricing: Pay & Go from $300 one-time (M).

### 1.21 Glider AI
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "tricky to use", "overwhelming", "congested" UI | Recruiter | High | G2 (M) https://www.g2.com/products/glider-ai-glider-ai/reviews?qs=pros-and-cons ; Capterra (H) https://www.capterra.com/p/153248/Glider/reviews/ |
| "about 75% candidates do well on the test and then get rejected in client interviews" (predictive validity) | Staffing firm | Med | Capterra (H) |
| Question types listed but "cannot be implemented"; glitches block candidate access | Recruiter | Med | Capterra (H) |
| "haven't improved anything in the last 4 years"; "a bit pricey" | Admin | Med | G2 (M) |
| Candidates refuse tests due to low brand recognition | Recruiter | Low | Capterra (H) |

### 1.22 Karat / interviewing.io (live human interviews)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| Karat interviewers "robotic", "poker-faced", read from script; no company/culture conversation; "basically a proctored HackerRank test" | Candidates | High | Blind (M) https://www.teamblind.com/post/karat-is-just-pathetic-ekubdk1k ; https://www.teamblind.com/post/karat-interview-is-insane-ratdqx2w |
| Inconsistent outcomes (working solution rejected; unfinished accepted) | Candidates | Med | Blind (M) |
| $200-450 per interview; annual minimum volume; rush +15-25%; total 10-20% over quote | Employers | Med | https://www.hireinsouth.com/post/karat-pricing (H, secondary); https://interviewcost.com/karat-cost (M) |
| Karat can't independently verify identity; deepfake exposure | Employers | Rising | herohunt (H) |
| interviewing.io: $179-339/session, $2,000 for 3 coaching sessions; quality "isn't perfectly consistent" | Candidates | Med | https://igotanoffer.com/blogs/tech/interviewingio-alternatives (M); dev.to review (M) |
Praise: Karat human probing resists AI cheating; interviewing.io anonymity valued.

### 1.23 HireVue (AI/one-way video interviews)
| Complaint | Who | Freq | Evidence |
|---|---|---|---|
| "Horrible format that has no consideration for your time" (Sep 2026); "treats you like a child"; no way to ask questions | Candidates | High | Trustpilot **2.1/5, 9 reviews** (H) https://www.trustpilot.com/review/hirevue.com |
| No support: bot says "call the company HR you are applying to" | Candidates | Med | Trustpilot (H) |
| IP/likeness terms: "you won't even own your likeness anymore" (Jan 2025) | Candidates | Low | Trustpilot (H) |
| Candidates dropping out / blacklisting employers that use AI interviews (CNBC Sep 15 2026) | Candidates + recruiters | Rising | https://www.cnbc.com/2026/09/15/job-seekers-refusing-ai-interviews-blacklisting-employers.html (M; fetch blocked) |
| No explanation of rejection; algorithmic bias fears | Candidates | High | NBC/Fortune (M) |
| $35k+/yr, implementation $15-40k, multi-year required (L) | Buyers | Med | https://leonstaff.com/blogs/hirevue-pricing-cost/ ; https://www.vendr.com/buyer-guides/hirevue (L) |

---

## 2. Cross-vendor theme table

| Theme | Coding-test vendors (HR, Codility, CS, HE, Mettl, TG, iMocha, Xobin, Glider, Vervoe) | Exam proctoring (Proctorio, Honorlock, ProctorU, Examity, Respondus, ExamSoft, OnVUE, Talview, Wheebox) | Psychometric/AI-interview (SHL, Aon, HireVue, Karat) | Who complains |
|---|---|---|---|---|
| Opaque / unappealable cheating flags | CodeSignal (reason changed), HackerRank (85% precision, no manual review at big cos), Mettl | ProctorU/OnVUE revocations, Proctorio gaze, Respondus priority scores | — | Candidates (very high) |
| Bias: skin tone, disability, religious dress | — | Respondus (peer-reviewed), ExamSoft, Honorlock, Proctorio | HireVue (ACLU deaf/Indigenous complaint) | Students, advocates, senators |
| Privacy / biometrics / BIPA | HireVue $3.75M | Respondus $6.25M; ProctorU breach + suit; Honorlock (Healy); Proctorio DMCA fights | HireVue | Students, applicants |
| Room scans / home intrusion | — | Ogletree v. CSU (Respondus/Honorlock); Examity "house tour" | — | Students |
| Live proctor no-show / long waits | — | ProctorU (1-6h), Examity | — | Test-takers |
| Tech fragility (crash, lockdown browser, bandwidth) | Talview secure browser, Xobin OTP, Glider access errors, iMocha lag | ExamSoft bar crashes, Proctorio extension, OnVUE lag, Respondus freezes | SHL drag-drop UI | Candidates, admins |
| Question leakage & AI cheating | HackerRank (GitHub repos), Codility (scrapes leaks), CodeSignal 35% fraud attempts, Interview Coder/Cluely overlays undetected | — | Karat human probing as answer | Recruiters |
| Pricing lock-in / hidden costs | TestGorilla annual + credits; Codility tier jump; HackerEarth per-job; CodeSignal $20 overage; Karat minimums; HireVue multi-year | ProctorU rush fees; Honorlock per-exam; Respondus seat tiers | SHL/Aon quote-only | SMB buyers, universities |
| Weak reporting/analytics | Codility "messy", Vervoe "basic", Aon limited, Xobin dashboard | Talview reporting detail | — | Recruiters |
| ATS integration gaps | Codility "not polished", TestGorilla summary-only to Greenhouse, Vervoe none, Xobin wants more | LMS integration generally OK | — | Recruiters |
| No candidate feedback / results | TestGorilla, Xobin (can't notify score) | — | SHL, HireVue, Karat | Candidates |
| Test relevance / validity | Codility edge cases, Glider 75% fail client interview, TestGorilla unrealistic SQL | UT Austin: 13/27 upheld | SHL "abstract puzzles" | Candidates, hiring managers |
| Support quality | TestGorilla, Vervoe, Mettl, HackerRank | Examity, ProctorU, Talview (number not working during exam) | HireVue bot | Everyone |

---

## 3. Explicitly requested missing features (verbatim or near-verbatim asks)

1. Visible debugger / debugging pane and visible test cases (Codility, HackerRank) — Capterra (H).
2. Tests that assess debugging/real work, not edge-case puzzles (Codility 2-star review; Glider "more hands-on coding tasks").
3. Non-technical tests (cognitive, culture, personality) alongside coding (Codility).
4. Deeper two-way ATS sync (Codility, Vervoe, Xobin, TestGorilla — Greenhouse returned "only summary scores").
5. Candidate-facing result/score notification and feedback (Xobin, TestGorilla, SHL, HireVue).
6. Ability to preview/take your own created assessment (Xobin).
7. Automation to move shortlisted candidates to next round; bulk registration (Xobin, Glider).
8. Editable registration forms without vendor turnaround ("wait for 2 weeks" — Talview).
9. Per-question timer and richer reporting (Talview); interactive reporting (Codility); analytics depth (Vervoe, Aon).
10. Data deletion / retention controls incl. test data (Vervoe "can't delete your data"; MediaNama on Mettl/Wheebox retention).
11. Monthly billing and pausable credits (TestGorilla, Codility Starter annual-only).
12. Flag review workflow with evidence shown to candidate and appeal path (CodeSignal, OnVUE, ProctorU).
13. Accommodation-aware proctoring: declare ADHD/stimming, screen-reader compatibility, bathroom breaks without termination (CDT, Truthout, UIUC).
14. Skin-tone-robust face detection or no-face-detection mode (Respondus/Univ. of Denver guidance).
15. Live proctor SLA / guaranteed start time (ProctorU, Examity).
16. Lightweight, low-bandwidth client; no kernel-level lockdown (Talview secure browser, Proctorio extension, OnVUE CPU load).
17. Detection of overlay assistants (Interview Coder/Cluely) and second-device voice LLMs (universal gap per herohunt/Fabric).
18. Identity/deepfake verification for live interviews (Karat gap).
19. Grid/list question view; international version (Mettl); contests frequency (HackerEarth).
20. Human-in-the-loop for AI interviews; ability for candidate to ask questions (HireVue).

---

## 4. Pricing facts (with confidence)

| Vendor | Public price points | Model / minimums | Conf. |
|---|---|---|---|
| Codility | Starter $1,200/yr (1 user, 120 invites/yr); Scale $6,000/yr or $500/mo (3 users, 300 invites/yr, max 25/mo); Custom quote | Annual only for Starter; enterprise ATS/SSO gated to Custom | H https://www.codility.com/pricing/ |
| CodeSignal | Build $79/mo annual ($948) or $99/mo, 60 credits/yr; Grow $479/mo annual ($5,748) or $599/mo, 420 credits/yr; Pro custom; **$20 per on-demand credit** | Credit = one assessment | H https://codesignal.com/pricing/ |
| TestGorilla | Free (10 credits/mo); Core $142/mo billed annually ($1,704) [willo cites $77/mo, 250 credits — likely older]; Plus from $400/mo ($4,800/yr); Enterprise custom | **Annual only**; credits charged when candidate *starts*; 1 credit/skills test, 2/AI interview | H https://www.testgorilla.com/pricing/ |
| HackerRank | Starter ~$165/mo (third-party); higher tiers quote | Page fetch failed | M/L https://www.g2.com/products/hackerrank-developer-skills-platform/pricing |
| HackerEarth | per-user + per-job pricing (reviews); page fetch redirected | — | L |
| Mettl | Quote only | — | H https://mettl.com/pricing/ |
| Talview | Unit-based, quote; ~150-200 candidate/yr typical minimum; pilot free ≤10 candidates; third parties cite ~$25k/yr | — | H https://www.talview.com/en/pricing |
| iMocha | No public prices; third parties cite ~$400/mo start | — | H (no prices) |
| Vervoe | Pay & Go from $300 one-time | — | M |
| Respondus Monitor | Year 1 flat **$4,950**; then tiered $5,950/1,000 seats + $1,950 per extra 1,000; unlimited by quote; **student purchase $15/12 months**; 200 free seats with LockDown Browser license | Requires LockDown Browser (FTE-based) | H https://web.respondus.com/he/monitor/pricing/ |
| Proctorio | $3-5/exam institutional; student pay-as-you-go $10/exam or $20/course; UChicago $5/student/exam; ~$8-10/student/yr unlimited (aggregator) | — | M/L https://academictech.uchicago.edu/proctorio-contact-form ; https://edulegit.com/blog/online-proctoring-cost-breakdown/ |
| Honorlock | ~$4-9/exam automated; $12.50/exam live/record-review; $16-25/student/yr site license; Purdue $8.24/exam | Custom | M/L https://www.purdue.edu/innovativelearning/tools-resources/instructional-technology/honorlock |
| ProctorU (Meazure) | OSU: $16.80 (≤60 min), $22.05 (61-120), $27.30 (121-180), $32.55 (181-240); rush +$8-12 within 48-72h, more within 24h | Institution or student pays | M https://itle.okstate.edu/online-test-proctoring |
| Karat | $200-450/interview; typical $250-350; annual minimum volume; rush +15-25% | Quote | L https://www.hireinsouth.com/post/karat-pricing |
| interviewing.io | $179-339/session; $2,000/3-session package | Candidate pays | M |
| HireVue | ~$35k/yr start; avg ~$50k; implementation $15-40k; multi-year | Quote | L |
| SHL | G-Cloud: per-candidate subscription; ~$30-60/test starter → $10-20 enterprise (blog estimate) | 24-month examples | L |
| Aon | ~$25k/yr start; $30-150/candidate (aggregator) | Quote | L |
| ExamSoft, Wheebox, Glider, Xobin, Pearson OnVUE | Not found / not public | — | — |

---

## 5. Controversies & legal cases (chronological)

| Date | Vendor | Event | Source |
|---|---|---|---|
| Nov 6 2019 | HireVue | EPIC files FTC complaint over facial-analysis "cognitive ability/emotional intelligence" claims | https://epic.org/documents/in-re-hirevue/ (M) |
| Jun 2020 | ProctorU | Breach of 444k records (HIBP); Australian universities' data leaked | https://haveibeenpwned.com/Breach/ProctorU (M) |
| Jun 11-12 2020 | Proctorio | Amsterdam District Court rules UvA's Proctorio use GDPR-compliant (Art. 6(1)(e)); upheld on appeal | https://gdprhub.eu/index.php?title=Rb._Amsterdam_-_C%2F13%2F684665_%2F_KG_ZA_20-481 (M) |
| Jun 27 2020 | Proctorio | CEO Mike Olsen posts UBC student's support chat log on Reddit; apologizes/deletes | https://www.ubyssey.ca/news/proctorio-chat-logs/ (H) |
| Fall 2020 | Proctorio | Sues UBC's Ian Linkletter over tweeted links; he spends >CAD 107k defending (anti-SLAPP countersuit) | https://www.vice.com/en/article/proctorio-is-doubling-down-on-lawsuits-against-its-critics/ (H) |
| Oct 2020 | ExamSoft | Remote bar exam crashes/lockouts; facial-recognition failures for darker skin | https://themarkup.org/coronavirus/2020/10/13/remote-exam-software-failures-privacy (M) |
| Nov 2020 | Proctorio | DMCA takedowns of Miami Univ. student Erik Johnson's tweets | https://techcrunch.com/2020/11/05/proctorio-dmca-copyright-critical-tweets/ (M) |
| Dec 3 2020 | ExamSoft, Proctorio, ProctorU | Senators Blumenthal/Warren/Booker letters on bias and trade practices | https://www.blumenthal.senate.gov/download/120320_-examsoft---letter- (M) |
| Jan 2021 | HireVue | Drops facial analysis after audit | https://epic.org/hirevue-facing-ftc-complaint-from-epic-halts-use-of-facial-recognition/ (M) |
| Jan/Feb 2021 | Proctorio | UIUC declines to renew ("significant accessibility concerns"); UC Berkeley, Baruch also stop | https://www.insidehighered.com/news/2021/02/01/u-illinois-says-goodbye-proctorio (H) |
| Mar 15 2021 | ProctorU | Thakkar et al. BIPA class action, C.D. Ill., after breach | https://lawstreetmedia.com/... (H) |
| Apr 2021 | Respondus | Third BIPA suit filed | https://www.biometricupdate.com/202104/online-proctor-faces-third-biometric-privacy-suit-as-bipa-arbitration-rules-considered (M) |
| Aug 2021 | Proctorio/ProctorU | UT Austin committee: 13 of 27 referrals upheld; recommends against AI proctoring | https://www.theregister.com/2021/08/20/ai_proctoring_software/ (H) |
| Jan 27 2022 | HireVue | Deyerler v. HireVue BIPA class action (Cook County → N.D. Ill.) | https://www.classaction.org/media/deyerler-v-hirevue-inc.pdf (M) |
| Mar 25 2022 | Proctorio | Settles with Erik Johnson; drops copyright/defamation claims | https://www.eff.org/deeplinks/2022/03/... (H) |
| Jun 29 2022 | Honorlock | Healy v. Honorlock, S.D. Fla., BIPA face-geometry claims survive | https://www.ahdootwolfson.com/blog/honorlock-facial-recognition-biometric-privacy-class-action-investigation/ (H) |
| Aug 23 2022 | Respondus/Honorlock (via CSU) | Ogletree v. Cleveland State: room scans violate Fourth Amendment | https://www.highereddive.com/news/test-proctoring-room-scans-violated-college-students-privacy-judge-rules/630340/ (H) |
| Sep 20 2022 | Respondus | Frontiers study: darker-skin students flagged 5x more; women darkest skin 5.6x | https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.881449/full (H) |
| Jun 2023 | Respondus | $6.25M BIPA settlement (Veiga/Patterson), class Nov 11 2015–Jun 2 2023 | https://topclassactions.com/lawsuit-settlements/closed-settlements/respondus-online-exam-bipa-6-25m-class-action-lawsuit-settlement/ (M) |
| Sep 2023 | Examity | Acquired by Meazure Learning (Gryphon-backed) | https://www.meazurelearning.com/resources/... (H) |
| Feb 1 2024 | ExamSoft | NCBE picks Surpass, not ExamSoft, for NextGen bar (Jul 2026) | https://www.abajournal.com/news/article/revised-bar-exam-wont-use-software-that-caused-tech-problems-for-some-test-takers (H) |
| Feb 2024 | Honorlock | FIU student paper: "Honorlock may be going down, and it rightfully should" | https://panthernow.com/2024/02/11/... (M) |
| 2024-25 | HireVue | $3.75M BIPA settlement (Deyerler) | https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/3-75m-hirevue-illinois-bipa-class-action-settlement/ (M) |
| Mar 19 2025 | HireVue/Intuit | ACLU of Colorado EEOC/CCRD complaint: deaf Indigenous employee denied captioning, told to "practice active listening"; HireVue: "Intuit did not use a HireVue AI-based assessment" | https://www.hrdive.com/news/ai-intuit-hirevue-deaf-indigenous-employee-discrimination-aclu/743273/ (H) |
| Jan 1 2026 | All AI hiring tools (IL) | Illinois HB 3773 in force — AI discrimination liability + notice | https://risktemplate.com/blog/2026-04-03-illinois-ai-video-interview-act-compliance/ (L) |
| Jan 2026 | Pearson VUE | AI-102 exam revoked after authorized break (public complaint) | https://learn.microsoft.com/en-us/answers/questions/5723752/... (H) |
| Sep 15 2026 | HireVue et al. | CNBC: job seekers refusing AI interviews, blacklisting employers | https://www.cnbc.com/2026/09/15/job-seekers-refusing-ai-interviews-blacklisting-employers.html (M) |

---

## 6. Praise themes (what incumbents get right — table stakes for YukthiX)

- **HackerRank/Codility/CodeSignal:** large curated question libraries; plagiarism/similarity detection that scans leaked solutions; candidate familiarity; broad ATS connectors; CodeSignal self-serve pricing and AI interviewer bundle.
- **TestGorilla/Xobin/iMocha:** easy candidate UX, breadth of non-technical tests, responsive support (Xobin), affordable entry.
- **Honorlock:** LMS-native, hybrid AI + human pop-in cuts false positives; institutions like configurable settings.
- **Respondus:** lowest cost at scale, simple lockdown browser, $15 student option; vendor claims big false-positive reduction.
- **Proctorio (per Dutch court):** encryption, 30-day auto-deletion, no live human watching — a privacy design that survived GDPR scrutiny.
- **ProctorU/Meazure:** human validation for high-stakes credentialing; Examity chat helpers praised in one 4-star review.
- **Karat/interviewing.io:** human interviewers resist AI cheating; anonymity; structured rubrics.
- **SHL/Aon:** psychometric validity heritage; "Very smooth service, the communication is great" (Trustpilot Sep 2025).

---

## 7. Implications for YukthiX (brief)

1. **Transparent, appealable flags** with evidence shown to the candidate is the single most common unmet need across coding tests and exam proctoring.
2. **Bias-tested face handling** (publish skin-tone detection parity; offer no-face-detection mode) plus **accommodation declarations** (ADHD, screen reader, breaks) addresses the UIUC/CDT/Frontiers/Ogletree cluster.
3. **Privacy by default**: short retention (≤30 days), no room scans by default, BIPA/GDPR consent flows, data-deletion API — Proctorio's court win shows this is defensible; Respondus/HireVue/ProctorU paid for its absence.
4. **Pricing**: monthly plans, pausable credits, no per-attempt surprise (contrast TestGorilla, CodeSignal $20 overage, Karat minimums); publish rates (Mettl/Talview/iMocha/HireVue don't).
5. **Anti-AI-cheating**: overlay/second-device detection, human-in-loop review, and dynamic/rotating question pools to counter GitHub leakage.
6. **Reliability SLA** for live proctoring (ProctorU 1.1/5 is almost entirely no-shows and terminations).
7. **Reporting + two-way ATS sync** (Greenhouse/Lever/Workday/Ashby) with per-question detail, not summary scores.
