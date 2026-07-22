# Examination Platform — User Manual

*Version: July 2026*

This manual covers everything a user of the Examination Platform can see and do, organized by role. Every button, field, and message named in this manual appears in the product exactly as written here (in "quotes").

---

## Table of Contents

1. [What the Platform Is](#1-what-the-platform-is)
2. [Roles at a Glance](#2-roles-at-a-glance)
3. [Getting Started: First-Run Setup](#3-getting-started-first-run-setup)
4. [Signing In, Passwords & Your Profile](#4-signing-in-passwords--your-profile)
5. [Platform Admin Guide](#5-platform-admin-guide)
6. [Org Admin Guide](#6-org-admin-guide)
7. [Recruiter Guide](#7-recruiter-guide)
8. [Interview Panel Guide](#8-interview-panel-guide)
9. [Candidate Guide (Taking an Exam)](#9-candidate-guide-taking-an-exam)
10. [Walk-In Registration](#10-walk-in-registration)
11. [Monitoring, Proctoring & Integrity — How It Works](#11-monitoring-proctoring--integrity--how-it-works)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)

---

## 1. What the Platform Is

The Examination Platform is a multi-organization online assessment system. Each **organization** (a company or hiring team) gets its own isolated space with its own staff, question bank, exams, candidates, and branding. Within an organization:

- **Recruiters** build question banks and exams, invite candidates, watch exams live, and grade code answers.
- **Candidates** receive an invitation link by email (or self-register at a walk-in event), take the exam in their browser under automated monitoring, and optionally see their result.
- **Interview panel members** review results, compare candidates, and export reports.
- **Org admins** manage staff accounts, branding, integrations (email, AI, API, webhooks), single sign-on, the audit log, and GDPR data-rights requests.
- **Platform admins** (the operator of the whole system) create organizations and manage other platform admins.

Exams support multiple-choice, true/false, and live **code questions** (with an in-browser editor and a "Run" button that executes the candidate's code). Exams can be scheduled to a time window, restricted to an approved network (IP range), opened for walk-in self-registration, and randomized per candidate. Every attempt is monitored (webcam face-presence checks plus browser-activity signals), and after submission an **integrity analysis** summarizes anything suspicious for reviewers.

---

## 2. Roles at a Glance

| Role | Where you land after login | What you can do |
|---|---|---|
| **Platform Admin** (`super_admin`) | Platform console → Organizations | Create/manage organizations, manage platform admins |
| **Org Admin** | Org-Admin console → Staff Users | Manage staff, branding, integrations, SSO, audit log, candidate data rights |
| **Recruiter** | Recruiter console → Dashboard | Question bank, exams, candidates, invitations, live monitoring, grading |
| **Interview Panel** | Panel console → Exams (reports) | View results, candidate details, comparisons, exports (read-only) |
| **Candidate** | (no login) | Opens a personal invitation link; takes the exam |

Candidates never create accounts or passwords — their invitation link *is* their access. Each console only admits its own role; signing in with the wrong role for a page returns you to the login screen.

---

## 3. Getting Started: First-Run Setup

When the platform is installed for the very first time, no accounts exist yet. The server prints a **one-time setup token** to its log at startup.

1. Open **`/setup`** in a browser. You'll see the heading **"Platform setup"** with the note *"Create the first platform administrator account. Use the one-time token printed to the server log at startup."*
2. Fill in:
   - **"Setup token"** — the token from the server log.
   - **"Email"** — the first platform admin's email.
   - **"Password"** — their password.
3. Click **"Complete setup"**. On success you'll see *"Setup complete. Redirecting to login…"*.

If setup was already completed, `/setup` simply redirects to the login page. If something goes wrong you'll see *"Setup failed. Please try again."*

From here, the platform admin signs in and creates the first organization (see [Section 5](#5-platform-admin-guide)).

---

## 4. Signing In, Passwords & Your Profile

### 4.1 Logging in (all staff roles)

Open **`/login`**. The screen shows "Examination Platform — Sign in to manage exams, candidates, and results." If your organization has uploaded a logo, it appears once you enter your organization slug.

1. **"Organization slug"** — your organization's short identifier (given to you by your admin, e.g. `acme-corp`). Platform admins can leave their organization context implicit — they log in the same way with their credentials.
2. **"Email"** and **"Password"** — the eye icon toggles **"Show characters"** / **"Hide characters"**.
3. Click **"Log in"**. Errors from the server (wrong password, unknown account) appear in a banner above the form.

You are redirected by role: recruiters to the Dashboard, org admins to Staff Users, panel members to Exams (reports), platform admins to Organizations.

### 4.2 Logging in with SSO

If your organization has enabled SAML single sign-on, a **"Log in with SSO"** button appears automatically after you type your organization slug (the form checks SSO availability when you leave the slug field). Clicking it sends you to your company's identity provider; after you authenticate there, you return to the platform already signed in ("Signing you in…").

- If your account hasn't been set up for SSO: *"Your account isn't set up for SSO access. Contact your org admin."*
- Any other failure: *"Sign-in failed. Please try again or use your password."* with a "Back to login" link.

Password login continues to work even when SSO is enabled.

### 4.3 Forgot / reset password

1. From the login page click **"Forgot password?"**.
2. Enter **"Organization slug"** and **"Email"**, then click **"Send reset link"**. You'll always see *"If an account with that organization and email exists, we've sent a reset link to that email."* (the message is intentionally the same whether or not the account exists).
3. Open the link from your email. Enter **"New password"** and **"Confirm new password"** (the button stays disabled until they match — *"Passwords must match."*), then click **"Reset password"**. Success: *"Your password has been reset. Redirecting to login…"*.
4. An expired or reused link shows *"This reset link is invalid or has expired."* with a **"Request a new reset link"** shortcut.

### 4.4 My Profile

Every staff console's footer shows your name — click it to open **"My Profile"**.

- **"My Profile" card**: edit your **"Display name"** and click **"Save name"** (*"Name updated."*). Your "Email", "Role", and "Organization" are shown read-only.
- **"Change password" card**: enter **"Current password"**, **"New password"**, **"Confirm new password"**, then **"Change password"**. On success: *"Password changed. Other sessions have been signed out."* — any other browser where you were logged in must sign in again.

**"Log out"** is always available in the console navigation footer.

---

## 5. Platform Admin Guide

The Platform console has two pages: **"Organizations"** and **"Platform Admins"**.

### 5.1 Creating an organization

On **Organizations**, use the **"Create organization"** card:

1. **"Name"** — the organization's display name.
2. **"Slug"** — the short identifier staff will type at login (lowercase, no spaces recommended).
3. **"Region"** — **"US"** or **"EU"** (data-residency label).
4. **"Admin email"** — the first org admin's email address.
5. Click **"Create organization"**. Success toast: *"Created {name}. A setup email was sent to {email}."* The new org admin uses that email to get into their account, then builds out their team ([Section 6](#6-org-admin-guide)).

Below the form, all organizations are listed as cards (name, slug, region, created date) with a **"Search organizations"** box ("Name or slug…") and pagination.

### 5.2 Managing platform admins

On **Platform Admins**:

- **"Invite new admin"**: enter an email in **"Invite by email"** and click **"Invite"**.
- **"Promote existing user"**: enter an existing staff member's email in **"Promote by email"** and click **"Promote"**.

Both actions show a confirmation dialog: *"Grant super_admin access to {email}? This cannot be undone from this screen."* — click **"Confirm"** to proceed (*"Granted super_admin access to {email}."*). Treat this power carefully; platform admins can manage every organization.

The page lists current platform admins with a search box and pagination.

---

## 6. Org Admin Guide

The Org-Admin console navigation: **"Staff Users"**, **"Audit Log"**, **"Candidate Data Rights"**, **"Org Settings"**, **"Integrations"**, **"Single Sign-On"**.

### 6.1 Staff Users

Create and review your organization's staff accounts.

**To add a staff member**:
1. **"Email"** — their work email.
2. **"Password"** — an initial password (minimum 8 characters). Share it with them securely; they should change it from their profile after first login.
3. **"Role"** — **"Org Admin"**, **"Recruiter"**, or **"Interview Panel"**.
4. Click **"Add staff member"** (*"Added {email} as {role}."*).

Each staff card shows the email, a colored role badge, an account status badge (e.g. "Active"), and their last login time (or "Never"). Use the **"Search staff users"** box to filter by email.

### 6.2 Org Settings (Branding)

Make the platform look like *your* organization — the logo and colors appear on the login screen and throughout the candidate's exam experience.

- **Colors**: pick a **"Primary color"** and **"Accent color"**, then **"Save colors"** (*"Colors updated."*). The primary color also themes the candidate exam screens.
- **Logo**: choose a file with **"Logo (PNG, JPEG, or SVG, max 2MB)"** and click **"Upload logo"** (*"Logo updated."*). The current logo is previewed at the top.

### 6.3 Integrations

Four independent cards. Each shows its current status so you always know what's active.

**"Email (SMTP)"** — by default, invitation and password-reset emails are sent by the platform's shared mailer (*"Not configured — invites and password resets currently use the platform default."*). To send from your own mail server, fill in **"SMTP host"**, **"SMTP port"**, **"SMTP username"**, **"SMTP password"**, and optionally **"From address (optional)"**, then **"Save SMTP settings"**. Once configured, the card shows your host/port and the button reads **"Replace SMTP settings"**.

**"AI API key"** — AI features (code-review suggestions for graders, candidate insight summaries, integrity narratives) use the platform's default key unless you store your own Anthropic API key here. Enter it in **"AI API key"** and click **"Save AI API key"**. The key is stored encrypted and never displayed again.

**"Public API"** — generates an API key for machine-to-machine access to your organization's read-only data (exams, candidates, invitations, results). Click **"Generate"**; the full key appears **once** with the warning *"Copy this now — it won't be shown again."* Afterward only the key's prefix and creation date are displayed. **"Regenerate"** replaces the key (the old one stops working immediately); **"Revoke"** disables API access entirely.

**"Webhooks"** — push event notifications (e.g. invitation created, attempt settled) to your own system such as an ATS:
1. Enter your endpoint in **"Webhook URL"** (e.g. `https://your-ats.example.com/webhooks/exam-platform`) and click **"Save URL"**.
2. Click **"Generate signing secret"** — shown once, same copy-now warning. Your endpoint should use it to verify request signatures. **"Regenerate signing secret"** rotates it.
3. The **"Recent deliveries"** grid shows each delivery attempt: event type, status, "HTTP {code}", and timestamp — your first stop when debugging an integration ("No deliveries yet." until events flow).

### 6.4 Single Sign-On (SAML)

Let staff log in through your company identity provider (Okta, Azure AD, etc.).

1. Copy the metadata URL from the **"Give this to your IdP admin"** box — your IdP admin uses it to register the platform as a service provider.
2. From your IdP, collect and enter: **"IdP Entity ID"**, **"IdP SSO URL"**, and the **"IdP Certificate"** (paste the full `-----BEGIN CERTIFICATE-----` block). Click **"Save IdP settings"**.
3. Click **"Enable SSO"** (only enabled once all three fields are saved). The status line changes to *"Configured and enabled — staff can log in via SSO."* and the **"Log in with SSO"** button appears on your login page.
4. **"Disable SSO"** turns it off without losing the saved configuration.

Note: SSO signs in **existing** staff accounts (matched by email). Create the staff account first under Staff Users.

### 6.5 Audit Log

A permanent, filterable record of significant actions in your organization — exam published, invitations created, candidate erased, attempts settled, and more.

Filters: **"Actor user ID"**, **"Action"**, **"Entity type"**, **"From"** / **"To"** dates, then **"Apply filters"**. Each entry card shows the action (color-coded: destructive actions like `.erased`/`.revoked` in red, creative ones like `.published`/`.created` in green), the timestamp, who did it (or "System" for automated actions), and the entity affected. Click **"Load more"** to page further back.

The audit log also records security events — for example, `attempt.blocked_ip` when a candidate was refused entry to an exam from a non-approved network (with the candidate's observed IP in the details), useful when diagnosing "why can't this candidate start?".

### 6.6 Candidate Data Rights (GDPR)

Handle a candidate's data-subject request:

1. Enter their address in **"Candidate email"** and click **"Look up"** (*"Candidate not found"* if no match).
2. The result card shows their profile. From here:
   - **"Export data"** → review the on-screen sections ("Profile", "Invitations (n)", "Attempts (n)") and click **"Download JSON"** to hand the candidate a complete machine-readable export of everything stored about them (answers, events, results, messages).
   - **"Erase candidate"** → a confirmation dialog **"Erase candidate data?"** warns *"This permanently redacts {name}'s personal data. This cannot be undone."* You must **type the candidate's email** into **"Type the candidate's email to confirm"** before **"Confirm erase"** activates. After erasure the candidate's record shows "Erased at {time}" and they can no longer be invited to exams.

---

## 7. Recruiter Guide

The Recruiter console navigation: **"Dashboard"**, **"Exams"**, **"Question Bank"**, **"Candidates"**.

### 7.1 Dashboard

Your home screen:

- **Stat cards** with trend sparklines: "Total candidates", "Invitations sent", "Attempts in progress", "Pending grading".
- **"Candidate funnel"** — how many candidates were "Invited" → "Started" → "Submitted" → "Passed".
- **"Upcoming exams"** — exams with a scheduled window opening soon.
- **"Needs your attention"** — actionable queue: exams with answers awaiting manual grading, recent proctoring violations, and a count of "Candidates invited 5+ days ago, haven't started". Quick actions: **"Create exam"** and **"Invite candidates"**.
- **"Recent activity"** — a feed of recent events (publishes, invitations, submissions).

### 7.2 Question Bank

Build reusable questions once; use them in any number of exams.

#### Creating a question ("New question")

1. **"Question type"** — one of:
   - **"Single-correct MCQ"** — one right answer (radio selection).
   - **"Multiple-correct MCQ"** — several right answers (checkbox selection).
   - **"True / False"** — fixed True/False options.
   - **"Code"** — the candidate writes and runs real code.
2. **"Question text"** — the prompt.
3. **"Difficulty"** — "Easy" / "Medium" / "Hard" (shown as dots on the list; useful for organizing).
4. **"Marks"** — points for a correct answer (minimum 1). **"Negative marks"** — points *deducted* for a wrong answer (0 = no penalty). Negative marking is configured **per question**, right here.
5. For MCQ/True-False: fill each **"Option N text"** and mark the correct one(s) with **"Option N correct"**. **"Add option"** adds more choices (not applicable to True/False).
6. For Code questions:
   - **"Language"** — the programming language candidates will use (javascript, typescript, python, java, csharp, cpp, go, ruby).
   - **"Starter code"** — pre-filled scaffold the candidate begins from.
   - **"Allow candidates to provide input (stdin)"** — check if their program should read standard input during test runs.
7. **"Tags"** — if your organization has tags, check any that apply (tags help you find related questions later).
8. Click **"Create question"**.

Auto-gradable types (MCQ, True/False) are scored instantly at submission. **Code questions are graded by you** after submission (see [7.8 Grading](#78-grading-code-answers)) — with an AI-suggested score to speed you up.

#### Bulk upload

From the Question Bank click **"Bulk upload"**:
1. Click **"Download template"** to get the spreadsheet format (`.xlsx`).
2. Fill it in and choose the file under **"Question file (.xlsx or .csv, max 5MB)"**, then click **"Upload"**.
3. The results show *"{n} question(s) created."* and, if any rows were rejected, *"{n} row(s) had errors:"* with a row-by-row error table so you can fix and re-upload just those.

### 7.3 Creating & Configuring an Exam

Click **"New exam"** on the Exams page, give it at least a **"Title"**, and click **"Create exam"**. You land in the **exam builder**, which has six tabs: **"Details"**, **"Sections & Questions"**, **"Candidates"**, **"Live"**, **"Leaderboard"**, **"Grading"**.

#### Details tab — every setting explained

| Field | What it does |
|---|---|
| **"Title"** | Shown to candidates on their welcome screen. |
| **"Instructions"** | Free-text instructions candidates read before starting. |
| **"Duration (minutes)"** | The exam clock. A candidate's timer starts when *they* click "Start exam". |
| **"Pass criteria (%)"** | The score percentage at or above which an attempt counts as **Pass**. |
| **"Randomize question order for candidates"** | Each candidate sees the questions within each section in a different random order — deters answer-sharing between neighbors. |
| **"Candidate feedback"** | What the candidate sees after submitting: **"None — candidates just see "submitted""**, **"Pass/fail only"**, **"Score percentage"**, or **"Per-section breakdown"**. |
| **"Enable scheduling"** | Restricts the exam to a time window. Reveals **"Window opens"** and **"Window closes"**. Outside the window, candidates see "This exam opens on {date}…" or "…availability window has closed." Invitations for scheduled exams expire when the window closes. |
| **"Enable walk-in registration for this exam"** | Puts this exam on your organization's public walk-in registration page (see [Section 10](#10-walk-in-registration)). The exams list shows a "Walk-in" badge. |
| **"Allowed IP / CIDR range (optional)"** | Restricts *where* the exam can be taken. Enter a single IP (`203.0.113.4`) or a CIDR network range (`203.0.113.0/24`). Candidates outside the range are refused with *"Your network (their-ip) is not approved for this exam. Please contact the exam organizer."* — the message shows them their own IP so they can read it to you. Blocked tries are recorded in the org audit log. Leave blank for no restriction. Typical uses: lock a walk-in exam to the venue's network, or an internal exam to the office/VPN. |

Click **"Save details"** (*"Exam updated."*).

#### Sections & Questions tab

Exams are organized into **sections** (e.g. "Aptitude", "Coding"):

1. Type a **"New section title"** and click **"Add section"**.
2. On the section card, click **"Manage questions"** — the **"Add questions to section"** picker lists your entire question bank with checkboxes (each row shows the question text and its marks). Tick the ones you want and click **"Save questions"**.

Candidates see section names and per-section question counts on their welcome screen, and section headers during the exam.

#### Preview & Publish

- **"Preview"** (top of the builder) shows a read-only view of the exam's title, instructions, and sections.
- **"Publish"** (visible while the exam is a draft) makes the exam live — required before you can invite anyone. Toast: *"Exam published."* An exam must have at least one section with questions to publish. Status badges on the exams list: **"Draft"** → **"Published"**.

#### Duplicating an exam

On the Exams list, open the **"⋯" (More actions)** menu on any exam card and choose **"Duplicate"**. You get a new **draft** copy of the exam and its sections/questions. Note: the copy deliberately resets operational settings — scheduling, walk-in, and the allowed IP range are cleared so you consciously reconfigure them for the new run.

### 7.4 Candidates & Invitations

The **Candidates** page manages your talent pool and sends exam invitations.

#### Adding candidates one at a time

Fill **"Name"**, **"Email"**, optionally **"Phone"**, and click **"Add candidate"** (*"Candidate added."*).

#### Inviting candidates to an exam

1. Choose the exam in the **"Exam to invite to"** dropdown (published exams only).
2. Tick the checkbox on each candidate card you want to invite.
3. Click **"Send invitations"**. Toast: *"Invited N candidate(s). M skipped."* — "skipped" means they already had a live invitation to that exam (no duplicates are ever created).

Each invited candidate receives an email with their **personal exam link**. Invitations expire after 7 days — or, for scheduled exams, at the window close time.

#### Bulk upload & invite

Click **"Upload & invite"**:
1. Pick the target exam in **"Exam to invite to"** and click **"Download template"**.
2. Fill the spreadsheet (name, email, phone per row), choose it under **"Candidate file (.xlsx or .csv, max 5MB)"**, and click **"Upload & invite"**.
3. Results report *"{n} candidate(s) invited."*, an *"already invited"* list with reasons, and a row-level error table for rejected rows.

This one action creates any new candidate records *and* sends the invitations.

#### Accommodations (extra time)

In the exam builder's **"Candidates"** tab, each invited candidate has an **"Extra time (%)"** field (0–300). Enter e.g. `25` to give that candidate 25% more time than the exam duration, and click **"Save"** (*"Extra time saved."*). This must be set **before** the candidate starts — once their attempt exists, the value is locked and displayed read-only.

### 7.5 Live Monitoring

Open an exam → **"Live"** tab. This is your real-time control room while candidates take the exam. A connection badge shows "Connected" / "Connecting…" / "Disconnected" (with a toast *"Live connection lost. Reconnecting…"* if the link drops — it recovers automatically).

- **Stat cards**: "Online now", "In progress", "Submitted", "Alerts (last 5 min)".
- **Roster table** — one row per invited candidate: "Candidate", "Status" (invited / in_progress / submitted / auto_submitted / force_submitted / **blocked**), "Online", "Time remaining", "Progress" (answered / total questions), and "Integrity alerts" (a red count of medium+high-severity events for that attempt).
- **"Proctoring alerts"** side panel — a live feed of monitoring events as they happen: candidate name, severity badge (high / medium / low), the event type, and how long ago. See [Section 11](#11-monitoring-proctoring--integrity--how-it-works) for what each event means.
- **"Unblock"** — appears on a row when a candidate's session has been **blocked** by repeated webcam violations (3 strikes). Clicking it releases them to continue (*"Candidate unblocked."*). Their timer was paused while blocked, so they lose no time.

### 7.6 Leaderboard

Open an exam → **"Leaderboard"** tab: a live-updating ranked list (rank, candidate name, number of correct answers) that fills in as candidates answer auto-gradable questions. Candidates see an anonymized version of the same ranking during the exam. Empty state: *"No answers yet — the leaderboard fills in as candidates answer."*

### 7.7 What happens when a candidate finishes

- MCQ/True-False answers are **auto-graded instantly** at submission (with per-question negative marking applied).
- If the exam contains code questions, the attempt shows in the Dashboard's "Pending grading" until you grade it.
- If a candidate runs out of time, their attempt **auto-submits** with whatever they answered.

### 7.8 Grading Code Answers

Open the exam → **"Grading"** tab. Each pending attempt shows one block per code question:

1. Read the question and the candidate's submitted code (or "(no submission)").
2. Optionally click **"Generate AI Review"** — the AI reads the code and suggests a score: *"AI suggested {n} / {max} — {summary}"*. Treat it as a second opinion; **you** decide the score.
3. Enter your score in **"Marks for {question}"** (0 to the question's max) and click **"Save grade"** (*"Grade saved."*). Add optional comments in **"Feedback for {question}"**.
4. When every code question in the attempt is graded, **"Finalize grade"** activates. Clicking it settles the attempt (*"Attempt finalized."*) — the final score, pass/fail result, and integrity analysis are computed, and the candidate's feedback (per your exam's "Candidate feedback" setting) becomes available on their submitted screen.

---

## 8. Interview Panel Guide

The Panel console is read-only reporting. Its single navigation link **"Exams"** lists every exam with its status badge.

### 8.1 Exam results dashboard

Click an exam title to open its results:

- **Stat cards**: "Total candidates", "Settled", "Pass rate", "Average score".
- **"Question accuracy"** — per question: what percentage of candidates who attempted it got it right, plus "{attempted} / {included}" counts. Instantly shows which questions were too easy or too hard.
- **"Candidates"** — one row per candidate: name (click to open their detail page), pass/fail badge, status, score percentage, and an **integrity badge** (see [11.3](#113-integrity-analysis-after-submission)). Filter the list with the **"Integrity"** dropdown ("All integrity levels", "Clear", "Review recommended", "High concern").

### 8.2 Comparing candidates

Tick **"Select {name}"** on two or more candidates and click **"Compare selected"**. The comparison matrix shows each candidate side by side: "Overall score", "Result" (pass/fail), "Integrity", and one row per exam section — ideal for final-round decisions.

### 8.3 Candidate detail

Click a candidate's name for the full picture:

- Header with pass/fail and integrity badges.
- **"Integrity analysis"** — a plain-English narrative of anything the system found, plus each individual flag with its severity and, where relevant, the question involved. Similarity flags link directly to the matching candidate's report ("View {name}'s report").
- **"Score"** card and **"AI Insight"** — an AI-written summary of the candidate's performance (use **"Regenerate"** / **"Retry"** if it hasn't generated).
- Per-section cards showing every question, the options the candidate chose, and which were correct (correct options in green with a "(correct)" suffix; wrong selections in red).

### 8.4 Exports

From the results dashboard: **"Export CSV"**, **"Export Excel"**, **"Export PDF"**. All three include each candidate's score, result, and integrity level/flag count — ready to attach to a hiring packet.

---

## 9. Candidate Guide (Taking an Exam)

*This section is written to be shared with candidates.*

### 9.1 Before you start — what you need

- A **desktop or laptop** with a webcam and a modern browser (Chrome recommended). The exam interface — especially code questions — is not designed for phones.
- A quiet, well-lit place where your face is clearly visible to the camera.
- **One screen only.** If a second display is connected you will be asked to disconnect it before you can start.
- A stable internet connection.

### 9.2 Opening your invitation

You'll receive an email with your personal exam link. Open it **on the computer you'll take the exam on**. The link verifies itself ("Verifying your invitation — This only takes a moment.") and takes you to the welcome flow. If the link is expired or revoked, the page tells you exactly that — contact the recruiter who invited you.

**Important:** your link is personal. If it's opened somewhere else while you're taking the exam, your first session is signed out and the event is flagged to the recruiter.

### 9.3 Practice round (not scored)

Every exam starts with a short practice screen — **"Try the interface before you start"** — with one sample multiple-choice question and one sample code editor. *"These two questions aren't scored or saved."* Use it to get comfortable, then click **"Continue"** (or **"Skip practice"**).

### 9.4 Welcome screen: consent, camera, and start

You'll see the exam title, its duration, a **"What's in this exam"** breakdown of sections and question counts, and any instructions from the recruiter.

1. **Read the "Monitoring & consent" notice.** It lists exactly what is collected while you take the exam: webcam snapshots and face-presence checks; browser activity (tab switches, fullscreen exits, copy/paste, right-click, developer tools); and code-editor activity (paste sizes, typing-volume aggregates). This is *"Seen by the hiring organization's staff and stored with your attempt."* If you do not consent, close the page and contact your recruiter.
2. Click **"Enable camera"** and allow camera access in the browser prompt. Success shows *"Camera connected — We can see you clearly — you're good to go."* If access is blocked, follow the on-screen guidance and click **"Retry camera access"**.
3. Tick **"I understand and consent to monitoring during this exam"**.
4. If you see *"Please disconnect additional displays before starting the exam."* — unplug your second monitor, then click Start again.
5. Click **"Start exam"**. **Your timer starts now.**

If the exam is scheduled and not yet open, the screen says *"This exam opens on {date}. Come back then to start."* If the window has passed: *"This exam's availability window has closed. Please contact the recruiter who invited you."*

If you see *"Your network (…) is not approved for this exam."* — this exam can only be taken from a specific location/network (e.g. the test venue). Contact the organizer; the message shows the network address to read to them.

### 9.5 The exam screen

- **Timer** — top right, always visible ("{time} remaining"); it turns amber and then red as time runs low.
- **Question navigator** — a numbered grid of all questions. Colors show what's "Answered", "Marked for review", "Not answered". Click any number to jump.
- **"Mark for review"** — bookmark a question to revisit; it turns to "Marked for review".
- **Answering**: click an option (multiple-correct questions let you toggle several). Answers **save automatically** as you go — there is no save button.
- **Code questions**: write your solution in the editor (it starts with any provided scaffold). If enabled, put test input in **"Standard input (optional)"**. Click **"Run"** to execute your code and see real output — "Exit code: 0" means it ran cleanly; compile errors, stdout, and stderr are all shown, and *"Your program was stopped for taking too long."* appears if it hangs. Run count is limited ("{n} runs left"), so test deliberately.
- **Leaderboard** — an optional live widget showing your anonymous rank among current test-takers.
- **Section headers** show which section you're in as you move through.

### 9.6 Staying out of trouble while monitored

The exam records certain browser behaviors (see the consent list). Practical advice:

- **Stay in the exam tab, in focus, in fullscreen.** Switching tabs, switching to other applications, or exiting fullscreen are each recorded and visible to the recruiter live.
- **Don't open developer tools** — high-severity flag.
- **Don't plug in a second monitor mid-exam** — high-severity flag.
- **Type your code rather than pasting large blocks** — very large pastes and paste-dominant answers are flagged for review.
- **Keep your face visible to the camera.** If the system can't see you, the exam pauses with **"Face not visible" — "Warning {n}/3"**. Reposition yourself and click **"Continue"**. On the **third** warning your session is **blocked**: *"Exam paused — a recruiter needs to unblock your session."* The page checks automatically and resumes once the recruiter unblocks you. **Your timer is paused the whole time — you don't lose a second.**

One accidental notification popup or a brief focus slip won't hurt you — reviewers see patterns and context, not gotchas.

### 9.7 Submitting

Click **"Review & Submit"** (available on the last question and beside the navigator). The **"Submit exam?"** dialog shows your Answered / For review / Unanswered counts — *"You won't be able to change your answers after this."* Click **"Submit"** to finish or **"Keep reviewing"** to go back.

If submission fails due to a network hiccup: *"Your submission didn't go through. Your answers are saved — please retry."* — just press **"Retry"**.

If time runs out first, the exam submits itself with everything you've answered.

### 9.8 After submitting

You'll see **"Exam submitted"**. Depending on how the recruiter configured feedback, you may also see your pass/fail result, your score percentage, or a per-section breakdown — or, if code questions are awaiting human grading, *"Your code answers are still being reviewed."* (check back later using the same link). Some exams show no results at all by design.

---

## 10. Walk-In Registration

For on-site hiring events: candidates register themselves — no advance invitations needed.

### 10.1 Recruiter setup

1. In the exam builder's Details tab, tick **"Enable walk-in registration for this exam"** and save. The exam must be **published**.
2. Share your organization's walk-in page: **`/walk-in/{your-org-slug}`** — typically printed as a **QR code** at the venue.
3. Recommended for venue events: also set the exam's **"Allowed IP / CIDR range"** to the venue network, so the exam can only be *taken* on-site.

### 10.2 Candidate experience

1. Scan the QR / open the walk-in page — usually on a phone, which is fine, because registration and exam-taking are separate steps.
2. Fill in **"Name"**, **"Email"**, optionally **"Phone"**, and pick the **"Exam"** (the dropdown only appears when more than one exam is open for walk-in).
3. Click **"Email me my exam link"**. Confirmation: *"Check your email — we've sent your exam link to {email}. Open it on the device you'll use to take the exam."*
4. The candidate opens the emailed link **on a laptop/desktop** and goes through the normal exam flow ([Section 9](#9-candidate-guide-taking-an-exam)).

Registering twice with the same email for the same exam re-uses the existing invitation — no duplicates. If no exams are open for walk-in, the page says *"No exams are currently open for walk-in registration."*

Walk-in candidates appear in your Candidates list and exam rosters exactly like invited ones (their invitations are marked as walk-in sourced in the data).

---

## 11. Monitoring, Proctoring & Integrity — How It Works

This section explains what the system watches, how severe each signal is, and how it all rolls up into the integrity verdict reviewers see. Candidates consent to all of this explicitly before starting ([9.4](#94-welcome-screen-consent-camera-and-start)).

### 11.1 Live proctoring events

Every event below is recorded on the attempt, streamed live to the recruiter's Live tab, and kept for the final analysis:

| Event | Severity | What triggers it |
|---|---|---|
| Developer tools detected | **High** | Opening browser dev tools (keyboard shortcut or window-size heuristic) |
| Multiple login | **High** | The invitation link was opened in a second place while a session was active (the first session is signed out) |
| Second monitor detected | **High** | A display was connected **during** the exam (checked every 15 seconds) |
| Tab switch | Medium | The exam tab was hidden (switched to another tab / minimized) |
| Fullscreen exit | Medium | Leaving fullscreen mode |
| Copy/paste | Medium | Copy or paste anywhere on the exam page |
| Editor paste | Medium | Pasting a large block (200+ characters) into the code editor |
| Window focus lost | Medium | Focus moved to another application while the exam stayed visible (e.g. a chat or AI-assistant window on the same screen). Recorded with how long focus was away |
| Right-click | Low | Opening the context menu |
| Idle timeout | Low | 5 minutes with no keyboard/mouse activity |

Debouncing prevents noise: rapid repeats of the same signal within a few seconds count once.

**A note on limits:** browsers cannot see other applications or detect external screen-capture software directly. The high-value proxies — second-monitor detection and focus-loss tracking — are the industry-standard browser signals for exactly those behaviors, which is why the platform gates exam start on a single display and watches for changes after.

### 11.2 Webcam proctoring & the 3-strike rule

The candidate's webcam is checked continuously **on their own device** (face-presence detection runs in their browser; only violation snapshots are uploaded):

1. Face not visible / turned away for a sustained few seconds → the exam pauses with **"Warning 1/3"** (then 2/3).
2. **Third strike → the session is blocked.** The candidate sees "Exam paused" and waits; the recruiter sees a **"blocked"** status with an **"Unblock"** button on the Live tab.
3. The candidate's **timer is paused while blocked** — being blocked never costs them time.

### 11.3 Integrity analysis (after submission)

When an attempt settles, the system analyzes everything — code-editor telemetry, cross-candidate similarity, webcam history, and all proctoring events — and produces an **integrity level**:

- 🟢 **"Integrity: Clear"** — nothing noteworthy.
- 🟡 **"Integrity: Review recommended"** — at least one flag worth a human look.
- 🔴 **"Integrity: High concern"** — at least one high-severity flag.

The individual flags a reviewer might see:

| Flag | Meaning |
|---|---|
| Large paste | A single paste of 200+ characters into a code answer (800+ = high severity) |
| Paste-dominant | More of the final code was pasted than typed |
| Implausible speed | Far more final code than the active typing time could plausibly produce |
| No iteration | Full marks on a code question without ever running the code |
| Similarity match | The code is suspiciously similar to another candidate's — with a direct link to the counterpart's report |
| Webcam violations | Face-presence strikes occurred (high if the session was blocked) |
| Proctoring events | High if any high-severity live event occurred; medium when medium-severity events accumulated |

Each analysis includes an **AI-written narrative** summarizing the evidence in plain English. The level and flag count appear on panel dashboards, candidate detail pages, comparisons, and in every export.

**Philosophy:** signals are evidence, not verdicts. A single focus-slip or a stray paste never fails anyone automatically — humans review patterns with full context.

---

## 12. Troubleshooting & FAQ

**A staff member can't log in.**
Check all three: the exact **organization slug**, email, and password. Repeated rapid attempts are rate-limited — wait a minute and retry. Use "Forgot password?" if needed; org admins can verify the account exists (and its role) under Staff Users.

**A candidate says their link doesn't work.**
The start page states the exact reason: invalid token, revoked, or expired. Invitations expire after 7 days (or at the scheduling-window close). Re-invite the candidate from the Candidates page to issue a fresh link.

**A candidate is stuck on "Warning" / "Exam paused" screens.**
Warnings clear when their face is visible again ("Continue"). A fully blocked session needs you: open the exam's **Live** tab and click **"Unblock"** on their row. Their timer was paused throughout.

**A candidate can't start — "not approved for this exam" network message.**
The exam has an **"Allowed IP / CIDR range"** set. Either the candidate must move onto the approved network (venue Wi-Fi, office VPN) or you edit the exam's Details and widen/clear the range. Each refused try is in the org **Audit Log** (action `attempt.blocked_ip`) with the candidate's observed IP.

**A candidate can't start — being asked to disconnect a display.**
By design: a second monitor must be unplugged before starting. Once removed, clicking "Start exam" again proceeds immediately, no reload needed.

**Invitation or reset emails aren't arriving.**
Check spam first. Org admins: verify the **"Email (SMTP)"** card under Integrations — if your own SMTP is configured, confirm the credentials with your IT team; deliveries fail silently to the audit trail if the mail server rejects auth. Without custom SMTP, the platform default sender is used.

**"Send invitations" reported some candidates skipped.**
They already have a live invitation to that exam. This is duplicate protection, not an error — the original link still works.

**The Live tab shows "Disconnected".**
The realtime link dropped; it reconnects automatically. The roster refreshes on reconnect — no events are lost from the record.

**Code "Run" shows "Couldn't run your code right now."**
The code-execution sandbox was temporarily unavailable. The candidate can keep writing and try again; their answer text is saved regardless of runs.

**Where do I see who did what?**
Org admins: the **Audit Log**, filterable by actor, action, entity type, and date range.

**How do I completely delete a candidate's data?**
Org admins: **Candidate Data Rights** → look up by email → "Erase candidate" → type their email to confirm. Irreversible; offer the JSON export first if the candidate wants a copy.

**Can two people grade / watch at once?**
Yes — the Live tab and Grading tab are per-user views of shared state; grades save per question, and "Finalize grade" settles the attempt once, whoever clicks it.

---

*End of manual.*
