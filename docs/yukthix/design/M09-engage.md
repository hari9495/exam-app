# M09 · Engage: Communication, Recognition & Surveys

> **Status:** ✅ Decided (8/8), 25 Sep 2026.
> **Covers:** spec §1.3.16, extended by decision D14. It includes:
> - announcements;
> - social feed;
> - polls, surveys, pulse and eNPS;
> - kudos and recognition with rewards;
> - automatic celebrations;
> - moderation;
> - engagement analytics.
>
> There is no Frappe reference, because Frappe has none of this; the only gap noted is "surveys, pulse, eNPS, recognition ❌".
> **Build wave:** 5. Simple announcements already ship with P04 in wave 1.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Announcements | Built in P04 as `posts.type = announcement`, with audience, channels and read/acknowledge tracking. Engage extends the same table | P04 Q8, §4.8 |
| Directory privacy | Birthday and anniversary visibility follows the employee's directory opt-out | P02 Q4 |
| Small-group suppression | Results for groups under 5 (configurable 3–10) are suppressed | P09 Q2 |
| Messages outside the app | Never carry sensitive content; quiet hours apply | P04 |
| WhatsApp | The company's own number carries announcements for key events | P04 Q2 |
| Kudos in reviews | Recognition is visible in performance reviews (spec). How it's used is set in Q6 | spec §1.3.16 |

---

## 1. Purpose & scope
Give Indian SMBs a single internal communication space, replacing WhatsApp groups for company news, with recognition and a voice for employees. It must be:
- **safe**: moderated and private where it needs to be;
- **measurable**: participation and sentiment can be tracked.

## 2. What exists today (exam app)
There is no social or survey feature. We reuse:
- `UserNotification`;
- BlobStorage for images;
- the P04 announcement table;
- the assessment engine's question types, which survey questions reuse (single choice, multi-select, rating, text);
- the AI providers, for moderation support (P10 tiers).

## 3. Concepts
- **Feed / space:** company, legal entity, location, department and team spaces are created automatically from the organisation. Interest groups are optional and created by admins or employees (Q1).
- **Post:** its type is announcement, update, kudos, celebration, poll or event. It holds text, images and links, the audience space, comments, reactions, pinned and expiry settings, and a moderation state.
- **Poll:** a single question with an instant result shown in the feed.
- **Survey:** multi-question, with an audience, schedule, anonymity mode (Q3) and a closing date. Types are **engagement survey**, **pulse** (short and recurring) and **eNPS** ("How likely are you to recommend…", 0–10).
- **Candidate experience survey (cNPS, gap-register tidy-up):** a starter survey **template** (D17) sent to **candidates**, not employees, after a hiring touchpoint: **post-assessment** (after submission of a T03 test; this is the T03 C5 post-test survey, YX-DLV-20), **post-interview** (after an M10 interview round is marked done) and optionally **post-decision** (offer or regret sent). Starter questions: "How likely are you to recommend applying here to a friend?" (0–10, candidate NPS), overall experience 1–5, communication, fairness, ease of scheduling / test platform, technical problems, free text. **Off until the company enables it** per trigger; **anonymous** (starter) or **confidential-linked** (the company sees answers joined to the application, never shown to interviewers / evaluators). Results feed P09. Rule YX-ENG-11.
- **Kudos:** appreciation from one employee to one or more others. It is tagged with a **company value**, can carry an optional badge, and optionally reward points (Q4).
- **Celebration:** a system post for a birthday, work anniversary, new joiner or promotion (Q5).
- **Action plan:** follow-up items created from survey results by a manager or HR (Q8).

## 4. Data model (main tables)

| Area | Tables |
|---|---|
| Feed | `spaces` (type org-derived / interest, auto-membership rule, posting policy), `posts` (extends P04: type, space, author, body, media, pinned, expiry, moderation_state), `post_comments`, `post_reactions`, `post_reports` |
| Moderation | `moderation_rules` (blocked words per language, link rules), `moderation_actions` (hide / restore / delete, by, reason) |
| Surveys | `surveys` (type, audience rule, schedule / recurrence, anonymity mode, min group size), `survey_questions` (reusing assessment question types + rating / NPS), `survey_invitations` (who was invited — employee or **candidate** (M10 candidate / T03 test-taker) with trigger (post-assessment / post-interview / post-decision) and source ref; for anonymous surveys never joined to responses), `survey_responses` (anonymous: no user id, only coarse demographic slice keys), `survey_results_cache` |
| Recognition | `company_values`, `badges`, `kudos` (giver, receivers, value, badge, message, points), `reward_budgets` (giver / manager × period), `reward_ledger` (earn / redeem / expire), `reward_redemptions` (catalog item or payroll payout, approval, status) |
| Celebrations | `celebration_settings` (per type on / off, per employee opt-out) |
| Actions | `action_plans` (survey, owner, team, items, status) |

All tables carry `organization_id` + RLS. For anonymous surveys, responses are stored **without** any user reference. Invitation status is kept separately, and only holds whether someone has answered, for reminder purposes.

## 5. Rules (YX-ENG)

| ID | Rule |
|---|---|
| YX-ENG-01 | Organisation spaces keep their membership in sync with P01 assignments. Leaving a team removes access to that team's space from the next day. |
| YX-ENG-02 | Who can post in each space follows the space's posting policy (Q1). Announcements can be posted only by users with the announcer permission (P02). |
| YX-ENG-03 | Every post and comment goes through the moderation filter (Q2). Blocked content is held with a reason. Reported content that passes the report threshold is hidden until reviewed. All moderation actions are audited. |
| YX-ENG-04 | Anonymous survey results are shown only for groups of at least the minimum size (P09, default 5). Filters that would narrow a group below the minimum are disabled. Free-text comments are shown without metadata. The minimum applies to every viewer, including HR admins: nobody has individual-level access to anonymous responses. |
| YX-ENG-05 | eNPS = % promoters (9–10) − % detractors (0–6). It is shown only when the minimum group size is met. |
| YX-ENG-06 | Kudos must name a company value. Nobody can give points to themselves or reward their own manager chain above the company limit. Points above the approval threshold need manager / HR approval (Q4). |
| YX-ENG-07 | Reward redemptions paid as cash or vouchers are sent to M03 as a taxable perquisite / one-time pay according to P07 rules (e.g. the gift threshold). |
| YX-ENG-08 | Celebrations respect each employee's opt-out and the P02 directory settings. Birthdays never show the year (Q5). |
| YX-ENG-09 | Posts from employees who have left stay visible, attributed to "Former employee", unless removed by moderation. |
| YX-ENG-10 | Engagement analytics (active users, participation, recognition by value and team, eNPS trend) go through P09 metrics with small-group suppression. |
| YX-ENG-11 | **Candidate experience survey (gap-register tidy-up).** Sent only for triggers the company enabled (starter: all off), once per candidate per trigger per application / drive, by email or the candidate portal / app (WhatsApp only with the candidate's channel opt-in, P04), after the step is complete, and never before a result or decision is released to the candidate. It is skippable, never affects scoring, stage, decision or ranking, and is never visible to interviewers, evaluators or reviewers. **Anonymous mode** (starter) stores responses as in YX-ENG-04 with coarse slice keys only (job family, stage, source, drive, college, recruiter team); **confidential-linked mode** must be stated in the survey intro and is visible only to recruiting ops / HR with `survey.candidate.view`. Reporting goes through P09 metrics (**cNPS** = % promoters − % detractors, as YX-ENG-05; response rate; scores by job, stage, source, recruiter, drive, college, vendor) with small-group suppression (min 5). Linked responses follow candidate retention (M10 Q6 / T05 Q7) and are anonymised with the candidate. Under-18 candidates are only surveyed anonymously. |

## 6. Flows
1. **Post:** compose → pick a space → moderation check → publish → notify followers (in-app; push for announcements and @mentions only, to avoid noise).
2. **Kudos:**
   1. Give kudos from the feed, a profile, or mobile quick action.
   2. Pick people, a value, an optional badge and points.
   3. Approval if above the threshold.
   4. The kudos is posted in the relevant space.
   5. The receiver is notified.
   6. It shows in their profile and in the review context (Q6).
3. **Survey:**
   1. HR builds the survey from templates (engagement, pulse, eNPS, onboarding 30/60/90, exit).
   2. Audience and schedule are set.
   3. Invites and reminders go out.
   4. Responses are collected.
   5. Results appear with heatmaps by department and location (suppressed where small).
   6. Managers receive their team view (if the group meets the minimum size, P09, default 5) and create action plans (Q8). Teams below the minimum roll up to the parent group.
4. **Celebrations:** a daily job posts today's birthdays, anniversaries and new joiners into the right spaces. Colleagues react and comment.
5. **Moderation queue:** reported and held items are reviewed with hide / restore / warn actions. Repeat offenders are routed to HR (M08 disciplinary, if needed).

**Events emitted:** `engage.post.published`, `engage.comment.added`, `engage.reaction.added`, `engage.post.held`, `engage.post.reported`, `engage.kudos.given`, `engage.reward.redeemed` (consumed by M03 as taxable one-time pay / perquisite, YX-ENG-07), `engage.survey.opened`, `engage.survey.closed`. Scheduler events for Engage (`engage.points.expiring`, `engage.survey.reminder_due`, `engage.survey.lifecycle_due`, `engage.action_plan.due`, `engage.celebration.due`) are raised by P04; catalogue in [APX-B](APX-B-events.md) §2.17.

**Events consumed:** `document.issued` (letter type *promotion* → promotion celebration, Q5); `employee.joined` (space membership; anchor for onboarding 30 / 60 / 90 surveys via SCH-58); `exit.case.accepted` (exit survey via SCH-58); `engage.survey.lifecycle_due` (survey invitation created); `engage.celebration.due` (birthday / anniversary post); `employee.change.effective` (space membership, YX-ENG-01); `employment.exited` (space memberships end); `announcement.published` (shown in the feed); `payroll.run.paid` (payroll-route reward redemptions marked paid).

## 7. UI
- **Home tab (mobile):**
  - pinned announcements;
  - celebrations strip;
  - feed with space filter;
  - "Give kudos" quick action;
  - open surveys card.
- **Desk:**
  - feed;
  - survey builder with question library and preview;
  - results dashboard (T6) with eNPS gauge, heatmap and comment themes (AI summary in P10 tiers; anonymous text only);
  - recognition wall and leaderboard (optional, company can switch it off);
  - moderation queue.

## 8. Migration & rollout
- In wave 1, announcements come from P04.
- In wave 5, the feed, kudos, surveys, celebrations and moderation launch.
- Starter content ships with it: value templates, badge set, survey templates (engagement, pulse, eNPS, onboarding, exit), and blocked-word lists in English, Hindi, Tamil and Telugu.

## 9. Acceptance tests (samples)
- An anonymous pulse with 4 responses in the Accounts team shows "Not enough responses to display" for that team (YX-ENG-04).
- A DB query on `survey_responses` for an anonymous survey contains no user id column value (YX-ENG-04).
- An employee who opted out of birthday celebrations gets no birthday post (YX-ENG-08).
- A post with a blocked word is held with a reason. Three reports hide a post until a moderator acts (YX-ENG-03).
- Redeeming ₹6,000 of points as a voucher creates a taxable one-time pay line above the gift threshold (YX-ENG-07).
- Moving from team A to team B removes team A space access the next day (YX-ENG-01).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Who can post where? | **Everyone posts in their team / department / location spaces; company-wide space: announcers + posts from anyone after admin approval** (company can open or close each space); interest groups can be created by employees with admin approval. |
| Q2 | Moderation style | **Post-moderation by default:** automatic blocked-word filter (4 languages) + optional AI check (P10 tier), report button, auto-hide after 3 reports; company can switch any space to **pre-approval**. |
| Q3 | Survey anonymity | **Anonymous by default** for engagement / pulse / eNPS (no identity stored; group minimum from P09); **named** allowed for onboarding / exit / feedback surveys; the mode is shown to employees before they answer and cannot change after launch. |
| Q4 | Rewards with kudos | **Company choice:** badges only (default), or **points** (monthly budget per manager / peer allowance) redeemable via a **voucher / gift-card partner** or **payout through payroll**; taxed per P07; approval above threshold. Team action: pick a rewards partner. |
| Q5 | Automatic celebrations | **On by default:** birthdays (no year), work anniversaries, new joiners (after joining, with photo only if employee added one), promotions (only after the letter is issued, company can switch off); each employee can opt out per type. |
| Q6 | Kudos in performance reviews | **Shown as context** in the review (list of kudos in the period, by value) for employee and manager; **never auto-scored**; employee can hide individual kudos from the review. |
| Q7 | Mirror to Teams / Slack / WhatsApp | **Optional mirrors:** announcements and celebrations to a Microsoft Teams / Slack channel via webhook, and key announcements via WhatsApp (P04, company number); comments and surveys stay in YukthiX. |
| Q8 | Pulse frequency & follow-up | **Monthly pulse by default** (5 questions, rotating from a library), eNPS quarterly, engagement survey yearly; managers see team results when the group is ≥ 5 and must create an **action plan** within 30 days (reminders); HR sees completion of action plans. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Team / department / location spaces open to their members; company-wide space: announcers post directly, others after admin approval**; each space's posting policy can be opened or closed by the company; interest groups created by employees with admin approval. | 25 Sep 2026 |
| Q2 | **Post-moderation by default:** blocked-word filter (EN / HI / TA / TE, company can extend) + optional AI check (P10 tier), report button, auto-hide after 3 reports (configurable) until a moderator reviews; any space can be switched to **pre-approval**; all actions audited. | 25 Sep 2026 |
| Q3 | **Engagement / pulse / eNPS anonymous by default** (no identity stored; P09 minimum group); **named** allowed for onboarding / exit / feedback surveys; mode shown to employees before answering and locked after launch. | 25 Sep 2026 |
| Q4 | **Company choice: badges only (default) or points** — monthly manager budget + peer allowance, point value set by company, expiry optional; redemption via **voucher / gift-card partner** or **payroll payout**; taxed per P07 (YX-ENG-07); approval above threshold (YX-ENG-06). Team action: pick a rewards / voucher partner. | 25 Sep 2026 |
| Q5 | **Celebrations on by default with per-type personal opt-out:** birthdays (no year), work anniversaries, new joiners (after joining day; photo only if the employee added one), promotions (after the letter is issued; company can switch off); company can disable any type; respects P02 directory settings. | 25 Sep 2026 |
| Q6 | **Kudos shown as context in M06 reviews** (period's kudos grouped by value) for employee and manager; **never auto-scored**; employee can hide individual kudos from the review. | 25 Sep 2026 |
| Q7 | **Optional one-way mirrors:** announcements and celebrations to Microsoft Teams / Slack channels via webhook (P10 integration hub), key announcements via WhatsApp (P04, company number); post text + link back only; comments, kudos, surveys stay in YukthiX. | 25 Sep 2026 |
| Q8 | **Default cadence:** monthly 5-question pulse (rotating library), quarterly eNPS, yearly engagement survey (all editable); managers see team results when group ≥ minimum and create an **action plan within 30 days** (P04 reminders); HR sees action-plan completion; teams below the minimum roll up to the parent group. | 25 Sep 2026 |
| F-follow-ups (consistency fix) | **Events aligned with APX-B §2.17 / §3 #2–3.** "Events emitted" completed, incl. `engage.reward.redeemed` (M03 taxable one-time pay / perquisite, YX-ENG-07); new "Events consumed": `document.issued` (promotion celebration), `employee.joined` (onboarding-survey anchor, SCH-58), `exit.case.accepted` (exit survey), `engage.survey.lifecycle_due`, `engage.celebration.due`, `employee.change.effective`, `employment.exited`, `announcement.published`, `payroll.run.paid`. | 26 Sep 2026 |
| Gap-register tidy-up | **Candidate experience survey (cNPS) template.** Starter template on the survey engine for candidates: post-assessment (= T03 C5 post-test survey, YX-DLV-20), post-interview (M10) and optional post-decision triggers; company-enabled per trigger (starter off); anonymous by default or confidential-linked (never shown to interviewers / evaluators); cNPS and experience scores feed P09 with small-group suppression; retention follows the candidate. Permission `survey.candidate.view` for linked results. Rule YX-ENG-11. | 26 Sep 2026 |
