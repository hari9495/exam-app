# Online MCQ Examination Platform — Product & Design Spec

**Status:** Draft — Part 1 of 3 (Product Scope). Sections 7-16 (Database, API, Architecture, Security, Roadmap) in progress.
**Date:** 2026-07-07

---

## 1. Requirement Analysis

| Dimension | Decision |
|---|---|
| Deployment model | White-label multi-tenant SaaS — each client org gets custom domain + full branding |
| Scale | 10,000+ concurrent candidates per exam |
| Candidate auth | Invite link/token (primary) + Email OTP (fallback/direct login) |
| Question types (v1) | Single-correct MCQ, Multiple-correct MCQ, True/False (Fill-in-blank, coding, subjective → future) |
| Negative marking | Yes, configurable per question |
| Timing | Overall timer + per-section timers + scheduled exam windows |
| Randomization | Random question order, random option order, random selection from question pool |
| Difficulty | Easy/Medium/Hard tagging |
| Languages | English only (v1); i18n-ready architecture for future |
| Result visibility | Never auto-shown to candidate — recruiter controls all disclosure |
| Certificates | Not needed |
| Proctoring | Full AI proctoring via third-party integration (webcam, face/gaze, screen) |
| Interview panel | View-only in v1 (no formal evaluation workflow yet) |
| Notifications | Email only (SMS/WhatsApp → future) |
| AI features (v1) | AI proctoring, AI-generated questions, AI-based evaluation insights/summaries |
| Compliance | GDPR, SOC 2 readiness, region-based data residency |
| Tech stack | Open — best-fit modern stack, cloud-agnostic where practical |
| Auditor/Compliance role | Deferred — out of v1 scope |

---

## 2. Product Vision

**Vision statement:** A white-label, enterprise-grade online assessment platform that lets any recruiting organization launch secure, branded, AI-proctored MCQ exams at any scale — from a 20-person startup screening round to a 10,000-candidate national hiring drive — without building their own exam infrastructure.

**Positioning:** This sits between generic exam tools (Google Forms, lightweight quiz tools) and heavyweight enterprise assessment suites (Mercer Mettl, HackerRank). Differentiators:
- **Multi-tenant white-label** — each client can present the platform as entirely their own (custom domain, branding, emails).
- **Built-in AI proctoring** integrated from day one, not bolted on later.
- **AI-assisted authoring** — recruiters can generate a first draft of a question bank from a job description/topic instead of writing 100 MCQs by hand.
- **Scale-first architecture** — designed for mass concurrent drives (10K+), not retrofitted.

**Primary business model implication:** Organizations are the billable unit (tenant). Plans likely gate: candidate volume, custom domain, AI proctoring minutes, AI question generation credits, data residency region. (Noted for later monetization design — not a v1 architecture blocker beyond keeping these things metering-friendly.)

### Key architecture decisions (already agreed)

1. **Multi-tenancy:** Shared database, row-level isolation via `organization_id` + Postgres Row-Level Security, with region-sharded deployments (e.g., separate EU/US clusters) to satisfy data residency — not database-per-tenant.
2. **AI Proctoring:** Integrate a specialized third-party proctoring provider behind an internal pluggable interface, rather than building proctoring ML in-house or going record-only.
3. **Real-time scale:** Event-driven architecture — WebSockets/SSE for candidate timer sync and auto-save, message broker (Redis Streams/Kafka) fanning out events to the live-monitoring dashboard — not polling-based.

---

## 3. User Roles

### Platform Super Admin (platform operator)
- Manage client organizations (tenants): onboarding, suspension, billing tier
- Configure global platform settings, feature flags per tenant plan
- Manage the AI proctoring provider integration, optional shared question bank templates
- Cross-tenant platform analytics (usage, health — not exam content)
- Global audit logs, security monitoring
- Audited support impersonation into a tenant

### Organization Admin (client's admin)
- Owns the org's branding/custom domain configuration
- Manages recruiters/panel members within their org (invite, roles, permissions)
- Manages org-wide billing/plan, candidate volume usage
- Views org-wide analytics across all recruiters' exams
- Configures org-level security policy (e.g., mandatory proctoring, session rules)

### Recruiter / HR
- Create/edit/clone/delete/archive exams
- Build sections, assign questions from bank or pool-based random selection
- Manage question bank (org-scoped)
- Invite candidates (bulk CSV, manual, link)
- Schedule exams, configure timing/negative marking/randomization per exam
- Monitor live exams
- View reports, export results
- Control result disclosure to candidates

### Interview Panel (view-only in v1)
- View candidate performance, section/question-wise scores
- Compare candidates side-by-side
- *(Future: evaluation notes/hire recommendation workflow)*

### Candidate
- Receive invitation (email link or OTP-based login)
- View instructions, complete system/device check (webcam/mic check for proctoring)
- Attend exam under proctoring
- Submit exam
- No result visibility — sees only a submission confirmation

*(Auditor/Compliance Viewer role considered and explicitly deferred post-v1 to keep scope tight.)*

---

## 4. Feature List by Module

### Authentication & Identity
- Candidate: invite-link login (tokenized, single-use or time-boxed), Email OTP login
- Staff (Super Admin/Org Admin/Recruiter/Panel): Email + password, SSO (Google/Microsoft) for enterprise orgs
- Password reset, forced password rotation policy (enterprise option)
- Two-Factor Authentication for staff roles (recommended mandatory for Org Admin)
- Session management: device/session listing, remote sign-out, single-active-session enforcement for candidates during an exam
- JWT access + refresh token rotation

### Platform / Organization Management (Super Admin)
- Tenant onboarding (create org, assign plan/limits)
- Custom domain configuration + SSL provisioning workflow
- Branding config (logo, colors, email templates) per org
- Plan/limit management (candidate volume, AI credits, proctoring minutes)
- Feature flagging per org (e.g., enable AI question gen, enable SSO)
- Cross-tenant analytics & platform health dashboard
- Global audit log viewer
- Support impersonation (audited)

### Dashboard (role-specific)
- Org Admin: org-wide stats, recruiter activity, usage vs. plan limits
- Recruiter: active/upcoming/completed exams, quick stats, notifications
- Panel: assigned candidate reviews pending
- Candidate: upcoming invitations, exam history

### Exam Management
- Create / Edit / Clone / Delete / Archive exam
- Draft mode → Publish workflow
- Section builder (multiple sections, per-section timer, per-section question count/pool)
- Schedule exam (fixed window, or open-window with per-candidate start-on-launch)
- Exam-level settings: negative marking default, randomization toggles, proctoring level, pass criteria
- Preview exam as candidate before publishing

### Question Bank
- Question types: Single-correct MCQ, Multiple-correct MCQ, True/False
- Metadata: tags, topic, category, difficulty (Easy/Medium/Hard), marks, negative marks
- Rich text editor (formatting), image support, mathematical equation support
- Bulk import (CSV/Excel template), bulk export
- Question versioning (edit history)
- **AI-generated questions**: input topic/JD/skill → generate draft MCQs for recruiter review/edit before adding to bank
- Duplicate detection on import (basic dedup by text similarity)

### Candidate Management
- Manual add, CSV bulk upload, invite by email, invite by shareable link
- Candidate groups/batches (e.g., "Campus Drive 2026 — Batch A")
- Status tracking: Invited → Started → In Progress → Submitted → Expired/No-show
- Resend invitation, revoke invitation

### Exam Engine (candidate-facing runtime)
- Pre-exam instructions screen + system/device check (camera/mic check for proctoring)
- Overall timer + per-section timer, auto-submit on expiry
- Auto-save answers (periodic + on every answer change)
- Resume on reconnect/refresh (state restored from last auto-save)
- Full-screen enforcement
- Question navigation: next/previous, jump-to, mark-for-review, skip
- Random question order, random option order, random pool selection
- Section lock (no going back once section time expires or candidate moves forward, if configured)
- Auto-submit at time expiry

### Anti-Cheating / Proctoring
- Browser-level: tab-switch detection, fullscreen-exit detection, copy/paste block, right-click disable, dev-tools detection, browser refresh warning, idle detection
- Device/session: device fingerprinting, multiple-login/session detection, single active session enforcement
- **AI Proctoring (third-party integrated)**: webcam monitoring, face presence/match verification, multiple-face detection, gaze/attention flagging, audio anomaly detection (optional), screen recording
- All events logged as timestamped flags with severity, surfaced to recruiter — **no automatic disqualification**; recruiter/panel makes the final call

### Live Monitoring (recruiter-facing)
- Real-time candidate roster: online/offline, progress %, remaining time
- Real-time proctoring flag feed (suspicious activity alerts)
- Disconnection/reconnection alerts
- Submission status feed
- Ability to message/force-submit a candidate (admin override, audited)

### Evaluation & Results
- Auto-grading: score, percentage, pass/fail against configured cutoff
- Rank (within exam/batch)
- Section-wise, topic-wise, question-wise breakdown
- Recruiter-controlled result publishing (per candidate or bulk)
- Candidate comparison view (side-by-side, for Panel + Recruiter)

### Analytics Dashboard
- Pass rate, average score, score distribution
- Difficulty analysis (accuracy per difficulty tier)
- Time-per-question analysis
- Question accuracy/discrimination index (flag questions too easy/hard/ambiguous)
- Candidate ranking, batch comparison
- Proctoring flag summary (trend of suspicious activity across an exam)
- **AI-based evaluation insights**: auto-generated candidate summary (e.g., "strong in SQL, weak in system design, 2 proctoring flags — tab switch") for Recruiter/Panel

### Notifications
- Email: invitation, reminder (T-24h/T-1h), exam-started confirmation, submission confirmation, result-published (if enabled), account/security emails
- Notification templates brandable per org (white-label)
- *(Future: SMS, WhatsApp)*

### Reports & Export
- Candidate-wise, exam-wise, batch-wise reports
- CSV/Excel export, PDF report export
- *(Future: scheduled/automated report emails)*

### Settings
- Org profile, branding, custom domain
- Roles & permissions management
- Notification template settings
- Security policy (2FA enforcement, session rules, proctoring defaults)
- API key management (for future public API access)

---

## 5. User Stories

**Org Admin**
- As an Org Admin, I want to configure our custom domain and branding so candidates experience our company's identity, not the platform's.
- As an Org Admin, I want to invite recruiters and assign roles so my team can start creating exams without me being a bottleneck.
- As an Org Admin, I want to see usage against our plan limits (candidates, AI credits) so I don't get surprised by overage.

**Recruiter**
- As a Recruiter, I want to build an exam from a question pool with randomized selection so no two candidates get an identical paper.
- As a Recruiter, I want to bulk-upload 5,000 candidates via CSV and invite them all at once for a campus drive.
- As a Recruiter, I want to generate a first draft of 30 MCQs from a job description using AI so I don't start from a blank question bank.
- As a Recruiter, I want to watch a live dashboard during the exam window so I can spot mass disconnections or proctoring issues in real time.
- As a Recruiter, I want to control exactly when and to whom results are visible, since we don't want candidates seeing scores before HR reviews them.

**Interview Panel**
- As a Panel member, I want to compare two candidates' section-wise scores side-by-side so I can make a shortlisting decision.
- As a Panel member, I want to see proctoring flags alongside scores so I can factor integrity concerns into my judgment.

**Candidate**
- As a Candidate, I want a clear pre-exam device check so I know my camera/mic work before the exam starts, not during it.
- As a Candidate, I want my answers auto-saved so a browser crash doesn't cost me my progress.
- As a Candidate, I want a visible countdown timer per section so I can pace myself.

**Super Admin**
- As a Super Admin, I want to onboard a new enterprise client and provision their custom domain without engineering involvement each time.
- As a Super Admin, I want cross-tenant health visibility (error rates, exam load) so I can catch platform issues before a client does.

---

## 6. Screen List

### Public / Auth
- Login (staff) — email/password, SSO button
- Candidate login (OTP entry / invite-link landing)
- Forgot Password / Reset Password
- 2FA challenge screen

### Super Admin
- Platform Dashboard (cross-tenant health/usage)
- Organizations list / Organization detail (plan, limits, domain, branding config)
- Global Audit Log
- Feature Flags / Plan Configuration
- Support Impersonation launcher

### Org Admin
- Org Dashboard (usage vs. plan, recruiter activity)
- Team Management (recruiters, panel members, roles/permissions)
- Branding & Domain Settings
- Org Security Policy Settings
- Org-wide Billing/Plan page

### Recruiter
- Recruiter Dashboard (active/upcoming/completed exams)
- Exam List
- Create/Edit Exam (multi-step: details → sections → questions → settings → schedule)
- Exam Preview (candidate-view simulation)
- Question Bank (list, filters by tag/topic/difficulty)
- Question Editor (rich text, image, equation support)
- AI Question Generator panel
- Bulk Import Question Bank (upload + mapping + validation results)
- Candidate List (per exam) + Bulk Upload/Invite flow
- Candidate Groups management
- Live Monitoring Dashboard
- Results & Reports (exam-level, candidate-level, export)
- Analytics Dashboard

### Interview Panel
- Panel Dashboard (assigned exams/candidates)
- Candidate Report Detail (section/question breakdown, proctoring flags)
- Candidate Comparison view

### Candidate
- Invitation landing page
- Instructions / Rules screen
- Device/System Check (camera, mic, fullscreen prompt)
- Exam Screen (question view, navigation panel, timer, mark-for-review)
- Submission Confirmation screen
- Exam History (past attempts, statuses — no scores, per product decision)
- Profile (minimal: name, contact, password)

### Shared
- Notification Center
- 404 / Error / Session Expired / Exam Locked-Out screens
- Maintenance / Org Suspended screen (for suspended tenants)

---

## Open Items / Still In Progress

The following sections are still being designed and will be appended to this document:

7. UI/UX Design System
8. Information Architecture
9. User Flow diagrams
10. Database Design
11. API Design
12. System Architecture
13. Security Design
14. Edge Cases
15. Development Roadmap
16. Future Enhancements
