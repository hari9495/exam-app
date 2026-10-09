# 07 · Performance — UI Reference

> **Purpose.** How Frappe HR lays out KRAs, appraisal templates, cycles, goals, appraisals and continuous feedback, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [07-performance.md](07-performance.md) (behaviour) and [07-performance.data-dictionary.md](07-performance.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 16 screenshots in [`../ui-screens/07-performance/`](../ui-screens/07-performance/). Internal reference only. Frappe's mobile app has no performance screens.

## Demo data behind the screenshots

| Item | Setup |
|---|---|
| KRAs | Revenue Growth, Customer Satisfaction, Team Development, Process Excellence, Hiring & Retention. |
| Feedback criteria | Communication, Ownership, Collaboration, Customer Focus. |
| Templates | **Sales H2 2026**: KRAs Revenue 50 / Customer Sat 30 / Team Dev 20; ratings Communication 30 / Ownership 40 / Customer Focus 30. **Operations H2 2026**: Process 60 / Team 25 / Hiring 15; Collaboration 50 / Ownership 50. |
| Cycle | **Q2 FY 2026-27 Review** (1 Jul – 30 Sep), goal-based automatic KRA scoring, 5 appraisees (Priya, Arjun on Sales; Vikram, Meera, Rahul on Operations). |
| Goals (7) | **Priya:** "Q2 revenue ₹1.2 Cr" (group) with child "Upsell existing distributors ₹40 L" 90 %; "Distributor NPS ≥ 40" 60 %; "Coach Arjun to own 5 key accounts" 100 %. **Arjun:** "Close 3 new accounts" 66 %. **Meera:** "Reduce ticket TAT by 20 %" 40 %. **Vikram:** "Roll out attendance app" 90 %. **Rahul:** none. |
| Priya's self-appraisal | Ratings 4 / 4 / 3 stars, plus reflections. |
| 360° feedback on Priya | From Ananya (CEO): 4 / 5 / 4 stars. |

**Resulting scores (average of goal, self and feedback, each on a 5-point scale):**

| Person | Goal score | Self | Feedback | Final |
|---|---|---|---|---|
| Priya | 4.15 (83 %) | 3.7 | 4.4 | **4.08** |
| Vikram | 2.7 | 0 | 0 | 0.9 |
| Arjun | 1.65 | 0 | 0 | 0.55 |
| Meera | 1.2 | 0 | 0 | **0.4** |
| Rahul | 0 | 0 | 0 | 0 |

**Problem hit while creating the data:** a child goal must belong to the **same employee** as its parent. Priya's team revenue goal cannot have Arjun's "close 3 accounts" underneath it, so **goals cannot cascade from manager to team** (U70).

---

## 1. Screen-by-screen

### 1.1 Performance home — [01](../ui-screens/07-performance/01-performance-workspace.png) · Dashboard — [13](../ui-screens/07-performance/13-performance-dashboard.png)
- **Layout:** sidebar (Goal, Appraisal Cycle, Appraisal, Employee Performance Feedback, **Employee Promotion**, Reports ›, Setup ›); workspace cards and a dashboard view.
- **YukthiX:** role-based home.
  - **Employee:** my goals with progress bars, "self-review due in 5 days", feedback received.
  - **Manager:** team goals, whose reviews are pending, one-click feedback.
  - **HR:** cycle progress funnel (goals set → self done → manager done → calibrated → published).

### 1.2 Masters — KRA list [02](../ui-screens/07-performance/02-kra-list.png), template [03](../ui-screens/07-performance/03-appraisal-template.png)
- **Template layout:** title, description; KRA grid (KRA, weight %); rating criteria grid (criteria, weight %).
- **Observed:** simple and clear, but there is no rating scale definition (what does 3 stars mean?) and no competency descriptions per level.
- **YukthiX:** keep the two-part template (KRAs / competencies). Add **rating scale with anchors** ("3 = meets expectations: …"), a competency library by role, and a preview of the form employees will see.

### 1.3 Appraisal cycle — [04](../ui-screens/07-performance/04-appraisal-cycle.png)
- **Layout:**
  - Tabs Overview / Applicable For.
  - **Stats strip:** appraisees 5 · self-appraisal pending 4 · employees without feedback 4 · employees without goals 1.
  - Connections: appraisals 5, feedback 1, goals 7.
  - Company, status | dates; description; KRA evaluation method (automated from goal progress / manual); "calculate final score based on formula".
  - Header: View Goals, Create Appraisals, Mark as Completed.
- **Observed:** the **stats strip is the best element** in the module: a live to-do count per stage. But it is text only; you can't click "without goals: 1" to see who (Rahul).
- **YukthiX:** keep and extend it into a **cycle control room**:
  - A stage funnel with clickable counts.
  - "Nudge all pending" (email/WhatsApp).
  - Timeline with phase dates: goal setting → mid-review → self → manager → calibration → publish. Stages open and close automatically.

### 1.4 Appraisal — list [05](../ui-screens/07-performance/05-appraisal-list.png); Priya: overview [06](../ui-screens/07-performance/06-appraisal-overview.png), KRAs [06b](../ui-screens/07-performance/06b-appraisal-kras.png), feedback [06c](../ui-screens/07-performance/06c-appraisal-feedback.png), self [06d](../ui-screens/07-performance/06d-appraisal-self.png); incomplete (Meera) [07](../ui-screens/07-performance/07-appraisal-incomplete.png)

| Tab | What it shows |
|---|---|
| Overview | Employee, department, designation \| company, cycle. **Final Score 4.083** with the help text "average of goal, feedback and self score". |
| KRAs | A **bar chart** (max vs obtained per KRA). The KRA grid: weight, goal completion %, weighted score (Revenue 50 % × 90 % = 45; Customer Sat 30 % × 60 % = 18; Team Dev 20 % × 100 % = 20). Goal score 83 %, total goal score 4.15. |
| Feedback | A **review summary** (average 4.4, stars, distribution bars, "based on 1 review"). A card per reviewer: name, designation, stars, comment, time. |
| Self Appraisal | A criteria grid with **star ratings**, total self score 3.7, and a rich-text **reflections** box. |

**Observed:**
- **The final score punishes unfinished stages.** Missing self or feedback scores count as **0**, so mid-cycle Meera shows **0.4 / 5** and Arjun 0.55. A manager glancing at the list would read them as failing.
- The final score is shown to 3 decimals (4.083) with no band ("Exceeds expectations").
- **The manager's own rating is missing from the layout.** There is goal (automatic), self and "feedback" (anyone). The manager's assessment is just one more feedback entry, with no distinct sign-off, calibration or override-with-reason.
- The KRA chart and the Feedback summary are good visual patterns.
- Priya's "Revenue" completion shows **90 %** (the child goal) although the parent goal was entered as 85 %. For a group goal, progress is recalculated from its children and the entered value is silently overwritten.
- Everything sits under a "Submit" button with "Submit this document to confirm". It isn't clear *who* submits, or what happens next.

**YukthiX:** an **appraisal workspace** per employee, with stages:
1. Goals (auto-score, with actuals).
2. Self-review.
3. Peer / 360 feedback.
4. **Manager review** (rating per KRA and competency, comments, recommended rating band).
5. Calibration (HR/leadership adjusts with reason).
6. Published → employee acknowledges.

Scores show only completed components ("goals 4.15 · self 3.7 · final pending manager"), and the final is a **band**, with the number secondary.

### 1.5 Goals — tree [08](../ui-screens/07-performance/08-goal-tree.png), list [09](../ui-screens/07-performance/09-goal-list.png), form [10](../ui-screens/07-performance/10-goal-form.png)
- **Tree layout:** filters (ID, company, cycle, employee, date range); the tree grouped under the **company**. Each row: goal, (employee), KRA chip, status pill; a group goal shows "0 of 1 Completed".
- **Form layout:** goal, is group, parent goal | progress (read-only for groups: "auto-calculated from child goals"), status; employee, dates, company; appraisal linking (cycle, KRA); description.
- **Observed:**
  - **Progress is a bare percentage.** No target value, current value, unit or check-ins: "₹1.2 Cr" lives only in the title, and 85 % is typed by hand.
  - **No cascading across people** (see Demo data): the "tree" is really a per-employee grouping, rendered under the company.
  - There is no alignment to company or department objectives, and no private vs shared visibility.
  - A group goal reads "0 of 1 Completed" next to 90 % progress: two measures disagree.
- **YukthiX:** **OKR-style goals**:
  - Objective → key results with **target / current / unit** (₹, %, count, done).
  - Progress computed from actuals; check-ins with comments (weekly or monthly); confidence (on / off track).
  - **Cascade and align across people:** Arjun's KR "3 new accounts" contributes to Priya's objective, which aligns to the company goal "₹5 Cr FY revenue".
  - Views: my goals, team tree, company alignment map.

### 1.6 Continuous feedback — [11](../ui-screens/07-performance/11-performance-feedback.png)
- **Layout:** employee, company | reviewer (an **employee**, not a user), designation, added on, cycle, appraisal; a ratings grid (criteria, weight, stars); feedback text; Submit.
- **Observed:**
  - Feedback must be tied to a cycle **and** an appraisal, so it isn't really continuous.
  - HR creates it on the desk; there is no quick "give feedback" from mobile.
  - The feedback card in the appraisal shows Ananya with a "G" avatar, not her initials.
- **YukthiX:**
  - **Quick feedback** from anywhere (web, mobile, and later a Slack/Teams/WhatsApp bot): pick a person, praise or suggestion, optional competency tags, visibility (private to manager / shared).
  - Periodic **360° requests** in a cycle: the employee or manager nominates peers; anonymous option; reminders.

### 1.7 Report — appraisal overview [12](../ui-screens/07-performance/12-report-appraisal-overview.png)
- **Layout:** filters (company, cycle, employee, department, designation); a grouped bar chart per person (goal, self, feedback, final); grid with feedback count, avg feedback, goal score, self score, final.
- **Observed:** the chart shows the zero-penalty problem clearly: tall goal bars, tiny final bars for everyone except Priya.
- **YukthiX:** a **calibration grid (9-box: performance × potential)**, rating-band distribution against target curve, manager-wise rating spread, and a drill-down to each appraisal. Links to promotion and increment planning (module 05 "Change" action).

---

## 2. YukthiX Performance screen inventory

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Performance home (employee / manager / HR) | 1.1 | Due items, team status, cycle funnel |
| 2 | Templates: KRAs, competencies, rating scale with anchors | 1.2 | Role-based competency library |
| 3 | **Cycle control room** | 1.3 | Clickable stage funnel, auto phases, nudges |
| 4 | **Appraisal workspace** (goals → self → 360 → manager → calibration → publish) | 1.4 | Distinct manager review, bands, acknowledgement |
| 5 | **Goals / OKRs** with targets, check-ins, cascading and alignment | 1.5 | Team tree, company map |
| 6 | Quick feedback + 360 requests | 1.6 | Mobile/chat, anonymity, visibility |
| 7 | Calibration (9-box, distribution) | 1.7 | Links to promotion/increment planning |
| 8 | 1:1 meetings (agenda, notes, action items) | — | New, commonly expected |
| 9 | PIP (performance improvement plan) | — | New, with checkpoints |

Items from the gap analysis in the functional spec (increment planning, bell curve, probation reviews, AI-assisted review summaries) attach to screens 4 and 7. AI summaries can reuse the exam app's AI metering.

---

## 3. UI issues seen on the instance (do not copy)

U1–U68 are in modules 01–06.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U69 | Appraisal | Missing self/feedback counted as 0 → mid-cycle finals like 0.4/5. | Score only completed components; show "pending". |
| U70 | Goals | Child goal must have the same owner as its parent; no cascading to team. | Cross-person cascade and alignment. |
| U71 | Goals | Progress is a typed %; no target/actual/unit; group goal overwrote the typed 85 % with 90 % and reads "0 of 1 completed". | Key results with target and actual; one progress measure. |
| U72 | Appraisal | No distinct manager review or calibration; manager is just another feedback giver. | Manager stage and calibration with reasons. |
| U73 | Appraisal | Final score as 4.083 with no band; unclear who submits and what happens next. | Bands; explicit stage owner and next step. |
| U74 | Cycle | Useful stats strip but counts are not clickable. | Clickable funnel with names. |
| U75 | Feedback | Tied to cycle + appraisal; desk-only; reviewer avatar shows wrong initial. | Quick feedback anytime, mobile, correct identity. |
| U76 | Navigation | Promotion lives in Performance, onboarding in "Tenure" (see U53). | Lifecycle vs performance clearly separated. |

---

## 4. Capture notes

- **Demo data:** `yx_demo07.py` in the session scratchpad: KRAs, criteria, 2 templates, the Q2 cycle (In Progress, appraisals created), 7 goals, Priya's self-appraisal, one feedback, appraisals re-saved to recalculate.
- An intermediate edit emptied the script file, so it was rewritten. No instance data was affected.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); default company (restored to *workfox (Demo)*).
- The performance data remains on the instance.
