# M14 · Zoho Desk deep pass (help-centre level)

> **Status:** 📝 For founder review, 8 Oct 2026. Docs only. **Folded in (8 Oct 2026):** every MISSING / PARTLY line is now in a slice of [M14-BUILD-DESIGN.md](M14-BUILD-DESIGN.md) §16 and a story US-G-211…248 (see also the [customer-support leaders pass](M14-CS-LEADERS-PASS.md)). Founder decisions: read receipts not built (D9), HIPAA deferred (D10).
> **Why:** the M14 gap check (7 Oct 2026) looked at Zoho Desk only at feature-page level. This pass walks Zoho's public help centre index by index and checks each capability against the 130 build slices (SD-1.01…SD-4.34), the stories (US-B-085…174, US-G-001…209) and the founder decisions (M14 Q1–Q10, build design D1–D7).

## Method

- **Public sources only:** Zoho's public help centre (help.zoho.com/portal/en/kb/desk), the public pricing and features pages on zoho.com/desk, and the public developer-space articles. No Zoho account, no trial, no use of the product. (Zoho's terms forbid using the service for competitive purposes; reading public docs is fine.)
- **Clean-room:** every capability below is written in our own words. No Zoho text, screenshots or layouts are copied. Zoho feature names appear only as a short source label where needed.
- **How deep:** every category and sub-category index was opened and every article title read (about 400 titles). Around 15 articles were opened in full where the title alone did not show what the feature does (e.g. supervisor dashboard, board work mode, AI agents, schedules, attachment control, backup, recycle bin, training module).
- **Status:** **COVERED** (slice and / or story named) · **PARTLY** (what is missing, with proposed phase and priority) · **MISSING** (proposed phase 3b-1…3b-4, priority 1 must / 2 should / 3 could) · **NOT FOR US** (clashes with a founder decision, named).
- One line can merge several Zoho articles that describe the same capability.

### Help-centre sections covered

| # | Zoho help-centre category | Sub-categories | Article titles read |
|---|---|---|---|
| 1 | Conceptual learning | 0 | 2 |
| 2 | Getting started | 0 | 2 |
| 3 | Organisation settings (company, personal, rebranding, departments, satisfaction) | 5 | 11 |
| 4 | User management and security (agents and teams, roles and profiles, data sharing, data security, compliance) | 5 | 19 |
| 5 | Support channels (email, help centre, community, web form, chat, social, instant messaging) | 7 (+16 IM topics) | 35 |
| 6 | Ticket management (replies, views, actions, customisation, work modes, time tracking, status, linking) | 8 | 36 |
| 7 | Agentic AI | 0 | 2 |
| 8 | Self service (knowledge base, help widget, guided conversations) | 3 (+4 KB) | 40 |
| 9 | AI assistant (overview, intelligence, prediction, generative AI, answer bot, data handling) | 6 | 13 |
| 10 | Automation (assignment, SLA, support plans, functions, time rules, schedules and contracts, macros, workflows, blueprint, webhooks, studio) | 11 | 27 |
| 11 | Customisation (modules, layouts and fields, templates, notifications, general, buttons) | 7 | 22 |
| 12 | Data administration (import / export, migration, sandbox, audit, bulk log, backup, security, recycle bin) | 8 | 13 |
| 13 | Reports and dashboards | 3 | 20 |
| 14 | Contacts and accounts | 0 | 14 |
| 15 | Activities (tasks, calls, events) | 0 | 17 |
| 16 | Productivity (feeds, gamification) | 2 | 3 |
| 17 | Accessibility and preferences | 0 | 8 |
| 18 | Billing and subscriptions | 0 | 7 |
| 19 | Integrations and marketplace | 12 (+2 telephony) | 102 |
| 20 | Mobile apps | 6 | 2 (+ topic lists) |
| 21 | Developer space (REST APIs, messaging API, widget SDKs, connections, API usage, webhooks) | 9 | 9 (+ topic lists) |
| — | FAQs, Troubleshooting | not walked | Support answers, no new capabilities |

Also read: public pricing page (5 editions and what each unlocks) and public features page.

---

## 1. Tickets and agent workspace

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Merge duplicate tickets | COVERED | SD-1.09 · US-B-092 |
| Ticket detail actions (assign, status, priority, close, print, follow) | COVERED | SD-1.03, SD-1.08 · US-B-089 |
| Pin an important note or message to the top of a ticket | MISSING | 3b-1 · 3 |
| Bulk update many tickets at once | COVERED | SD-1.07 · US-G-002 |
| Free-form tags on tickets | COVERED | SD-1.07 · US-G-010 |
| Follow a ticket, comment, and see the raw email headers | COVERED | SD-1.04 watchers, SD-1.19 "show original" · US-G-004 |
| Collision warning when two agents work one ticket | COVERED | SD-1.08 · US-B-090, YX-SD-07 |
| Share a ticket with another department without moving it | COVERED | SD-2.10 · US-G-046 |
| Translate labels of custom fields and values into several languages | PARTLY | UI languages planned (US-G-203, P21); per-company field-label translations not named → add to SD-2.01 · 3b-2 · 3 |
| Mass comment and mass reply to many tickets | COVERED | SD-1.07 scenarios (field changes + note + reply) · US-G-002 |
| Send a reply later at a chosen time | MISSING | 3b-1 · 3 |
| Read receipt on a reply (did the customer open it) | MISSING | 3b-1 · 3 · off by default; tracking pixels clash with our privacy stance, needs founder view |
| Reusable text snippets inside replies | COVERED | SD-1.08 canned responses · US-B-090 |
| CC secondary contacts on a ticket | COVERED | SD-1.04 · US-G-004 |
| Agent emails a contact first and it becomes a ticket | COVERED | SD-1.03 raise on behalf · US-G-004 |
| Public vs private threads and comments | COVERED | SD-1.08 notes vs replies, SD-1.09 side conversations · YX-SD-13 |
| CRM details shown inside the ticket | COVERED | SD-4.29 · US-G-201 |
| Custom list views and filters; archived-ticket view | COVERED | SD-1.07, SD-3.29 · US-G-002, US-G-130 |
| Live supervisor console: traffic last hour, unassigned and overdue, agent load per channel, act (reassign) from it | PARTLY | Wallboard and live dashboards SD-1.27 (US-G-028); acting from the board not named → 3b-2 · 2 |
| Board view with columns by any field, live moves, next-ticket side panel, select 50 at once | COVERED | SD-1.07 board + bulk · US-G-002 |
| Time tracking with billing preferences | COVERED | SD-1.08, SD-2.32 · US-B-091, US-G-079 |
| Custom ticket number format (prefix, suffix, start number) | PARTLY | Desk prefix numbering in SD-1.03 (YX-SD-01); free format not named → 3b-1 · 3 |
| On-hold state that pauses the SLA; custom status labels | COVERED | SD-1.03, SD-1.15 · US-G-001, YX-SD-02 |
| Parent / child tickets | COVERED | SD-1.09 · US-B-092 |
| Link a ticket to an account; who can see which ticket | COVERED | SD-1.28, SD-1.12 · US-G-035, §5.7 |
| Start a remote-support or AR camera session in the company's own tool from the ticket | COVERED | SD-4.23 launch link · US-G-181 (Q6) |
| Remote control of the customer's device run by the desk vendor itself | NOT FOR US | Q4 / Q6: no remote actions, only launch links to the company's own tool |

## 2. Contacts, accounts and activities

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Contact and account pages with their tickets and history | COVERED | SD-1.28 · US-G-035 |
| Bulk actions on contacts and accounts | PARTLY | Bulk on tickets only (SD-1.07) → extend to contacts / accounts in SD-1.28 · 3b-1 · 2 |
| Invite a contact to the help centre | COVERED | SD-1.22 · US-B-103 |
| Mark a contact as spam and block them | COVERED | SD-1.19 spam guard, SD-1.20 email rules (reject) · US-B-102, US-G-018 |
| Follow a customer's activity | PARTLY | Watchers on tickets only → follow a contact / account · 3b-1 · 3 |
| One contact in several accounts | COVERED | SD-1.28 · US-G-035 |
| Find and merge duplicate contacts and accounts | MISSING | 3b-1 · 1 (email-created contacts duplicate fast) |
| Sync contacts from a CRM on demand | COVERED | SD-4.29 · US-G-201 |
| Notes on contacts and accounts | PARTLY | Not named in SD-1.28 → 3b-1 · 3 |
| Tasks with owner, due date, priority, close and reopen; task views | COVERED | SD-1.10 · US-G-006 |
| Log calls against a contact; call views | COVERED | SD-2.17 · US-B-135, US-G-056 |
| Calendar events / meetings with a customer from the ticket (with video link) | MISSING | 3b-2 · 3 |
| Search records across modules | COVERED | P17 search; SD-1.07 |

## 3. Channels

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Email channel set-up, forwarding, several addresses per department | COVERED | SD-1.19 · US-B-101 |
| SPF and DKIM set-up for the company's domain | COVERED | SD-1.18 · US-G-017 |
| Embeddable web form for outside sites | COVERED | SD-2.20 widget, SD-1.22 open portal · US-G-069, US-G-021 |
| Feedback widget on a site | COVERED | SD-2.20 · US-G-069 |
| Web-form analytics (views, drop-off, goals) | MISSING | 3b-2 · 3 |
| Live chat and chat-to-ticket; proactive chat | COVERED | SD-2.18, SD-2.19 · US-B-132, US-G-059 |
| Facebook, Instagram and X as ticket sources | COVERED | SD-4.24 · US-G-184 |
| WhatsApp | COVERED | SD-2.21 · US-B-133 |
| Telegram, Messenger, Instagram direct messages | COVERED | SD-4.24 · US-G-184 |
| LINE, WeChat, WeCom and Arattai (Zoho's Indian messenger) | MISSING | 3b-4 · 3 |
| One inbox for all messaging channels | PARTLY | Chat console SD-2.18 (US-B-132); social and IM land as tickets, not one live inbox → 3b-4 · 3 |
| Bots answering in messaging channels | COVERED | SD-4.12 · US-B-168, US-G-150 |
| API to plug any custom messaging channel into the desk | MISSING | 3b-4 · 2 |
| Phone: inbound / outbound, toll-free, multi-level IVR, browser calling, many PBX / cloud-phone connectors | COVERED | SD-4.24 · US-G-183 |
| SMS notifications and two-way SMS | COVERED | SD-2.23, P04 · US-G-058 |
| App-store reviews, Play-store reviews and video comments as tickets | MISSING | 3b-4 · 3 |
| Fax in / out | MISSING | 3b-4 · 3 (only if a customer asks) |
| Microsoft Teams and Slack: bot, notifications, work in chat | COVERED | SD-2.22 · US-B-134, US-G-057 |
| Google Chat and other team chat apps for notifications | PARTLY | Teams / Slack only (SD-2.22) → add Google Chat · 3b-2 · 3 |

## 4. Help centre, portal and community

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Customer's ticket dashboard in the portal (own and company tickets) | COVERED | SD-1.21, SD-1.28 · US-B-099, YX-SD-16 |
| Internal employee portal for agents and staff | COVERED | SD-2.28 · US-G-070 |
| Training courses for agents inside the portal (lessons, quizzes, progress) | PARTLY | M07 learning covers HRMS companies; a standalone desk has none → light course space for agents · 3b-4 · 3 |
| Bot check on portal forms | COVERED | SD-1.22 Turnstile · US-G-021 |
| Portal sign-in by SMS one-time code | COVERED | SD-1.22 OTP login · US-B-103 (P02 §4.7) |
| "My area" profile and preferences page | COVERED | SD-1.21 · US-B-099 |
| Own sub-domain and custom domain | COVERED | SD-1.21 · US-B-099 |
| Help centre in 40+ languages | PARTLY | 4 at launch (P21), more in SD-4.30 (US-G-203); 40+ not targeted · 3b-4 · 3 |
| Labels / badges on portal users (e.g. top helper) | MISSING | 3b-4 · 3 (with community forum) |
| Custom CSS and HTML templates for the help centre | MISSING | 3b-2 · 2 (CSS and templates only; no custom JavaScript on our domain, ASVS L2) |
| Sitemap, page titles and meta for search engines; 301 redirect when an article URL changes | MISSING | 3b-1 · 2 |
| Web analytics on the help centre (GA4 or our own privacy-friendly counts) | MISSING | 3b-2 · 3 (consent banner needed) |
| Several brands, each with its own help centre | COVERED | SD-2.28 · US-G-071 |
| Home page builder | COVERED | SD-2.28 · US-G-070 |
| Access settings: public, sign-in only, sign-up approval, allowed domains; manage portal users | COVERED | SD-1.22 · US-G-021 |
| Community forum: set-up, moderation, views, recent posts | COVERED | SD-4.30 · US-G-205 |
| Points and badges in the community | PARTLY | Agent gamification only (SD-4.28, US-G-198) → community points · 3b-4 · 3 |

## 5. Knowledge base

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Rich editor; add, edit, clone, unpublish articles | COVERED | SD-1.24 · US-B-104 |
| Moderation of article comments | PARTLY | Feedback with comment only (SD-1.24) → with public comments below · 3b-4 · 3 |
| Article templates | COVERED | SD-1.25 · US-G-025 |
| Follow a category or article and get told about changes | MISSING | 3b-1 · 3 |
| Filter articles by state, visibility and expiry | COVERED | SD-1.24 (review_due_on) · US-B-104 |
| 301 redirect for moved articles; SEO per article | MISSING | 3b-1 · 2 (same item as help-centre SEO) |
| Download or print an article as PDF | MISSING | 3b-1 · 3 |
| Reviewers per category; approval before publish | COVERED | SD-1.24, SD-2.29 · US-B-104, US-G-072 |
| Short stable article numbers | MISSING | 3b-1 · 3 |
| Permissions per category; user groups | COVERED | SD-2.29 · US-G-073 |
| Category → section → sub-section tree | PARTLY | Spaces only in `sd_kb_spaces` → add a category tree to SD-1.24 · 3b-1 · 2 |
| Article versions and history | COVERED | SD-1.24 · US-B-104 |
| Public comments on articles | MISSING | 3b-4 · 3 |
| Article insights, feedback, views; KB dashboard | COVERED | SD-1.25, SD-1.27 · US-G-024 |
| Article drafted from a ticket conversation | COVERED | SD-1.24, SD-4.13 · US-B-106, US-G-163 |

## 6. Help widget, guided flows and SDKs

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Help widget on web: install, look, welcome text, accessibility | COVERED | SD-2.20 · US-G-069 |
| Signed identity for logged-in widget users | COVERED | SD-2.20 widget identity secret · §14.4 |
| Interactive cards in the widget | COVERED | SD-2.19 · US-G-059 |
| Widget SDKs for iOS, Android, React Native and Flutter apps | COVERED | SD-2.20 mobile SDK · US-G-069 (name the four targets when built) |
| No-code guided flow builder: message, question, choice and action cards, variables, outside calls, many channels, languages, ready gallery | COVERED | SD-4.12 · US-G-150 |

## 7. Automation

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Manual assignment; rule-based assignment | COVERED | SD-1.06, SD-2.12 · US-B-087, US-B-130 |
| Auto triage: round-robin, load, skills, availability | COVERED | SD-1.06, SD-2.25 · US-G-011, US-G-075 |
| SLAs with several escalation levels | COVERED | SD-1.14…1.16 · US-B-094, US-B-096, US-G-014 |
| Support plans per account | COVERED | SD-1.28 · US-G-036 |
| Support contracts tied to accounts | COVERED | SD-1.28, SD-2.32 · US-G-036, US-G-078 |
| Custom script functions run by rules; ready function gallery | COVERED | SD-4.22, SD-2.12 recipes · US-G-176, US-G-051 |
| Teams usable in rules (notify, assign, escalate) | COVERED | SD-2.12 groups · US-B-131 |
| Time-based supervisor rules | COVERED | SD-2.12 time triggers · US-B-130 |
| Scheduled jobs that act on many tickets at a set time (e.g. end-of-day reassign, offline-agent sweep) | PARTLY | Recurring records (SD-2.13) and time rules per record; a scheduled bulk action is not named → 3b-2 · 3 |
| Macros (one-click bundles) | COVERED | SD-1.07 scenarios · US-G-002 |
| Workflow rules: field updates, alerts, tasks, outside calls | COVERED | SD-2.12 · US-B-131 |
| AI step inside a rule (classify, summarise, draft) | PARTLY | AI agent studio SD-4.16 (US-G-152); an AI action in normal rules not named → 3b-4 · 2 |
| Rules on satisfaction ratings (e.g. bad rating → follow-up) | COVERED | SD-1.26, SD-2.12 · US-B-108 (M14 §18) |
| Visual process designer with required fields per step; its dashboard | COVERED | SD-2.11, SD-1.27 · US-G-062, US-G-027 |
| Outgoing webhooks | COVERED | SD-2.14 · US-B-136 |
| One canvas to build all automation from blocks | COVERED | SD-2.12 on P22 Workflow Studio · US-B-130 |

## 8. AI (source label: Zia)

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Auto tags and keywords per thread | COVERED | SD-4.10 · US-G-156 |
| Alerts on unusual rises or drops in ticket volume | COVERED | SD-4.14 · US-G-154 |
| AI predicts values for any pick-list field | PARTLY | Category and routing only (SD-4.10, US-B-166) → any field · 3b-4 · 3 |
| Knowledge article drafted from a ticket thread | COVERED | SD-4.13 · US-G-163 |
| Several AI providers with the company's own key | COVERED | SD-4.09 · US-G-153 (Q9 BYO key) |
| Ticket summary, reply drafts, writing help, tone check, insights | COVERED | SD-4.11 · US-B-167, US-G-149 |
| Sentiment per ticket | COVERED | SD-4.10 · US-G-156 |
| Answer bot from the knowledge base in chat and widget | COVERED | SD-4.12 · US-B-168 |
| AI usage and performance dashboard | COVERED | SD-4.09 AI hub · US-G-153 |
| AI agent that answers email tickets from KB and hands back to a human when unsure | COVERED | SD-4.12 · US-G-151 |
| AI agent that writes a resolution summary on closed tickets | COVERED | SD-4.11 · US-G-148 |
| AI tokens bundled free inside each paid edition | NOT FOR US | Q9: AI is outside the ₹999; BYO key or paid credits |
| Quality goals for human and AI agents | COVERED | SD-4.28 · US-G-196 |

## 9. Customisation

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Custom modules (record types) and their list views | COVERED | SD-2.30 · US-G-064 |
| Customise standard modules and fields | COVERED | SD-2.01 · US-B-137 |
| Formula (calculated) fields on records | MISSING | 3b-2 · 2 (P18 field type on the P19 expression engine; US-E-302 covers report formulas only) |
| Colour per pick-list value | MISSING | 3b-2 · 3 |
| Encrypt standard and custom fields | COVERED | SD-1.12 · US-G-029 |
| Regex checks and validation rules | COVERED | SD-2.01 · US-G-063 |
| Lookup fields to other records | COVERED | SD-2.01, SD-2.30 · US-G-063 |
| Dependent (nested) pick-lists | COVERED | SD-2.01 · US-G-063 |
| Several layouts with show / hide rules | COVERED | SD-2.01, SD-2.30 · US-G-039, US-G-066 |
| Ticket templates and email templates | COVERED | SD-1.10 · US-G-001; US-C-015 |
| Notification rules | COVERED | P04 · US-C-015, US-C-017 |
| Agent idle timeout | COVERED | US-A-010, US-A-015 |
| Spam detection settings | COVERED | SD-1.19 · US-B-102 |
| Custom buttons on tickets | COVERED | SD-4.22 · US-G-176 |
| Company details, business hours and holidays | COVERED | SD-1.02 · US-B-095 |
| Products linked to tickets | COVERED | SD-1.28 · US-G-038 |
| Custom domain and rebranding (remove vendor name) | COVERED | SD-1.21, SD-2.28 · US-B-099 |
| Departments | COVERED | SD-1.01 desks · US-B-085 |
| Personal ticket layout per agent; default actions after reply (e.g. go to next ticket) | PARTLY | Layout by type / desk / brand (SD-2.30); personal defaults not named → 3b-1 · 3 |
| Keyboard shortcuts | COVERED | Design system (DESIGN-SYSTEM.md shortcuts) |
| User profile and preferences | COVERED | US-C-017; design system |

## 10. Users, roles and security

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Agents and teams | COVERED | SD-1.01 · US-B-112 |
| Permission profiles and a role hierarchy | COVERED | P02 role templates, SD-1.01 · US-B-112 |
| Data sharing rules per module | COVERED | P02 scopes, SD-1.12 restrictive RLS · US-B-093 |
| OpenID Connect, SAML and federated (social) sign-in for portal customers | MISSING | 3b-2 · 2 (agents already have SSO via P12) |
| Signed-token (JWT) sign-in from the company's own site into the portal | PARTLY | Widget only (SD-2.20) → also for portal · 3b-2 · 2 |
| MFA for portal users | PARTLY | OTP sign-in (SD-1.22); optional second factor for portal users not named → 3b-2 · 3 |
| Data retention rules | COVERED | SD-1.30 · US-B-113, US-B-115 |
| Encryption at rest and in transit | COVERED | US-A-161 BYOK; platform |
| Agent SSO with Active Directory / ADFS / SAML | COVERED | SD-1.29 · US-B-114 (P12) |
| Data subject requests and GDPR | COVERED | SD-1.30 · US-B-115 |
| HIPAA readiness (business associate agreement, PHI rules) | MISSING | 3b-4 · 3 (needs a founder view on US health customers) |
| Restrict attachment file types (incoming and outgoing) | COVERED | SD-1.05 · US-G-031 |

## 11. Data administration

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Import and export per module | COVERED | SD-4.21, SD-1.07 CSV · US-B-172, US-G-002 |
| Assisted migration from Zendesk, Freshdesk and other help desks | PARTLY | Importers for Zoho Desk, Freshservice, Jira SM, CSV (SD-4.21); Zendesk and Freshdesk not named → 3b-4 · 2 |
| Move data between two accounts of the same product | PARTLY | Config packages only (SD-4.22, US-G-180) → data too · 3b-4 · 3 |
| Sandbox | COVERED | SD-4.21 · US-B-173 |
| Audit log | COVERED | SD-1.12, P08 · US-G-030 |
| Log of bulk actions | COVERED | SD-1.07, YX-SD-18 audit |
| Scheduled backups (weekly → quarterly, incremental, password-protected archive) | PARTLY | Full export any time (US-B-055); no schedule or incremental → 3b-2 · 3 |
| Recycle bin with restore window | PARTLY | Records never hard-deleted (YX-SD-19); contacts, articles, views need the A.json soft-delete / recycle-bin pattern → 3b-1 · 3 |
| Data region choice | COVERED | US-A-197 |

## 12. Reports and dashboards

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Lifecycle / time-in-status reports | COVERED | SD-1.27 · US-G-027 |
| Formulas inside reports | COVERED | US-E-302 (P09) |
| Agent availability and performance reports | COVERED | SD-2.26 · US-G-077 |
| Ready (predefined and static) reports | COVERED | SD-1.27 · US-G-027 |
| Reports across all departments | COVERED | SD-1.27 · US-B-110 |
| Scheduled and custom reports | COVERED | SD-1.27 · US-B-111 |
| Ready dashboards: overview, status, SLA, process, rep self-review | COVERED | SD-1.27 · US-B-110, US-G-027 |
| Telephony dashboard | PARTLY | Call data in SD-4.24; no call dashboard named → 3b-4 · 3 |
| Clear definitions of response and resolution times | COVERED | SD-1.14 (§8.1) · US-G-012 |

## 13. Productivity, accessibility, billing

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Internal team feed of record activity with follow | PARTLY | Mentions and notifications (US-B-089, US-C-015); no team feed → 3b-2 · 3 |
| Points, badges and leaderboards for agents | COVERED | SD-4.28 · US-G-198 |
| Accessibility controls, personas, screen-reader support | COVERED | WCAG 2.2 AA (P21 R19), SD-1.21 reading aids · US-G-022 |
| Manage paid agent seats | COVERED | SD-1.13 · US-B-122 |
| Cheaper "light" seat for people who only view and comment | COVERED | Collaborators are free (Q10) · US-G-033 |
| Free edition | NOT FOR US | Q1 / Q8 (D3): no free tier, 30-day trial |
| Features locked by edition (five price tiers) | NOT FOR US | Q1 / Q8: one plan with every feature |

## 14. Integrations and marketplace

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Marketplace of extensions and a guided tour | COVERED | SD-4.22 · US-B-174, US-G-179 |
| Zapier and similar tools | COVERED | SD-4.22 · US-G-177 |
| Calendar sync (Google, Outlook) | COVERED | SD-1.11 iCal feed · US-G-009 |
| Checklists on tickets | COVERED | SD-1.10 · US-G-006 |
| Machine translation of conversations | COVERED | SD-4.11 · US-G-161 |
| Outside survey tools | COVERED | SD-2.29 survey builder · US-G-074 |
| Agent attendance from an outside tracker | COVERED | SD-1.06 leave / shift skip, SD-2.25 presence · US-G-011 |
| Contact location and enrichment from outside data (company size, logo) | MISSING | 3b-4 · 3 |
| Password-vault link to share secrets safely with an agent | MISSING | 3b-4 · 3 |
| Video meeting (Zoom and others) started from the ticket | MISSING | 3b-2 · 3 (same as customer meetings in §2) |
| Customer ticket history and related tickets by field | COVERED | SD-1.08 context panel · US-G-003 |
| Bookmarks on tickets | MISSING | 3b-1 · 3 |
| Download all attachments of a ticket as one zip | MISSING | 3b-1 · 3 |
| Print a ticket | PARTLY | Not named → print view in SD-1.08 · 3b-1 · 3 |
| Google Contacts sync | MISSING | 3b-4 · 3 |
| Jira, GitHub, Azure DevOps | COVERED | SD-2.15 · US-G-061 |
| GitLab | PARTLY | Not named in SD-2.15 → add · 3b-2 · 3 |
| Sync tickets to project tools (Asana, Trello, Zoho Projects) | PARTLY | Own projects and M12 (SD-4.18); outside tools via HTTP steps only → 3b-4 · 3 |
| Attach files from cloud drives (Google Drive, OneDrive, Egnyte) | MISSING | 3b-2 · 3 |
| Microsoft 365 / Google Workspace set-up | COVERED | SD-1.19, SD-1.29 · US-G-017, US-G-032 |
| Accounting and billing apps (invoices, subscriptions) | COVERED | SD-3.25, SD-3.28 · US-G-117, US-G-126 |
| Inventory app link | PARTLY | Own stock (SD-3.18); outside inventory apps not named → 3b-4 · 3 |
| E-commerce order details in the ticket (Shopify, WooCommerce) | MISSING | 3b-4 · 2 (standalone support desks for online shops) |
| CRMs (Salesforce, HubSpot, Pipedrive, Zoho CRM) | COVERED | SD-4.29 · US-G-201 |
| Email-marketing list sync (Mailchimp and similar) | MISSING | 3b-4 · 3 |
| Power BI and other BI tools | COVERED | SD-2.31 · US-G-067 |
| E-signature (DocuSign, Adobe Sign) | COVERED | SD-2.07 (P05) · US-G-045 |
| Phone systems: Twilio, Amazon Connect, RingCentral, 3CX, Vonage, hosted PBX | COVERED | SD-4.24 connectors · US-G-183 |

## 15. Mobile

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| Agent app for iOS and Android | COVERED | SD-2.27 · US-G-068 |
| Manager app with live KPIs and dashboards | COVERED | SD-2.27 manager KPIs · US-G-068 |
| Extensions that also run in the mobile app | PARTLY | SDK (SD-4.22) is web-first → mobile widget slots · 3b-4 · 3 |
| Vendor builds a custom mobile app for a customer on request | NOT FOR US | Q1 / Q8: one plan, no add-on SKUs or paid services |

## 16. Developer space

| Capability in our words | Status | Our slice / story, or proposed phase + priority |
|---|---|---|
| REST API with OAuth | COVERED | SD-2.14 (P11) · US-B-136 |
| Full ticket history through the API | COVERED | `GET /tickets/{id}/timeline` (§12.1) |
| Stored connections to outside services | COVERED | SD-2.14 connector framework · US-E-279 |
| API usage dashboard and alerts at a threshold | PARTLY | P11 limits (YX-API-08); company-facing usage view and alerts not named → 3b-2 · 2 |
| API calls capped by paid credits per edition | NOT FOR US | Q1: one plan; P11 fair-use rate limits instead |
| Webhooks and process-step APIs | COVERED | SD-2.14 · US-B-136 |
| Messaging-channel API | MISSING | Same item as §3 · 3b-4 · 2 |

---

## Summary

| Status | Count |
|---|---|
| COVERED | 152 |
| PARTLY | 31 |
| MISSING | 33 |
| NOT FOR US | 6 |
| **Total capabilities** | **222** |

Zoho Desk is a customer-support desk, so it adds little to ITIL areas (problem, change, CMDB, assets). Most of what it has is already in the plan. The gaps are mostly small agent and portal polish, customer sign-in options, SEO for the public help centre, and extra channels.

### Top 15 MISSING

| # | Capability | Phase | Pri |
|---|---|---|---|
| 1 | Find and merge duplicate contacts and accounts | 3b-1 | 1 |
| 2 | Help-centre SEO: sitemap, page titles and meta, 301 redirect when an article URL changes | 3b-1 | 2 |
| 3 | Portal sign-in for customers through SAML / OpenID Connect and social logins | 3b-2 | 2 |
| 4 | Formula (calculated) fields on records | 3b-2 | 2 |
| 5 | Custom CSS and HTML templates for the help centre (no custom JavaScript) | 3b-2 | 2 |
| 6 | E-commerce order details beside the ticket (Shopify, WooCommerce) | 3b-4 | 2 |
| 7 | API to plug any custom messaging channel into the desk | 3b-4 | 2 |
| 8 | Send a reply later at a chosen time | 3b-1 | 3 |
| 9 | Pin an important note or message to the top of a ticket | 3b-1 | 3 |
| 10 | Follow a KB category or article and get told about changes | 3b-1 | 3 |
| 11 | Short article numbers and PDF / print of articles | 3b-1 | 3 |
| 12 | Web analytics on the help centre with consent | 3b-2 | 3 |
| 13 | Attach files from Google Drive / OneDrive | 3b-2 | 3 |
| 14 | App-store, Play-store reviews and video comments as tickets | 3b-4 | 3 |
| 15 | LINE, WeChat, WeCom and Arattai channels | 3b-4 | 3 |

### Notable PARTLY items

- Live supervisor console that lets a lead reassign from the board (3b-2 · 2).
- Zendesk and Freshdesk importers next to the planned ones (3b-4 · 2).
- AI action inside normal automation rules (3b-4 · 2).
- Signed-token sign-in for the portal, not only the widget (3b-2 · 2).
- Knowledge category tree under spaces (3b-1 · 2).

### Needs a founder view

- **Read receipts** on replies (tracking pixels; we block them inbound).
- **HIPAA** readiness, if US health customers are a target.

---

## Sources (public pages read, 8 Oct 2026)

- https://help.zoho.com/portal/en/kb/desk (category index)
- https://help.zoho.com/portal/en/kb/desk/conceptual-learning
- https://help.zoho.com/portal/en/kb/desk/getting-started
- https://help.zoho.com/portal/en/kb/desk/organization-settings · /company-settings · /personal-settings · /rebranding · /departments · /customer-happiness
- https://help.zoho.com/portal/en/kb/desk/user-management-and-security · /agents-and-teams · /roles-and-profiles · /data-sharing · /data-security · /compliance
- https://help.zoho.com/portal/en/kb/desk/user-management-and-security/data-security/articles/data-retention
- https://help.zoho.com/portal/en/kb/desk/support-channels · /email · /help-center · /community · /web-form · /chat · /social · /instant-messaging
- https://help.zoho.com/portal/en/kb/desk/support-channels/help-center/articles/manage-employee-portal-in-help-center-and-access-learning-materials-in-the-training-module
- https://help.zoho.com/portal/en/kb/desk/ticket-management · /ticket-replies · /views-and-filters · /actions-in-tickets · /ticket-customization · /work-modes · /time-tracking · /ticket-status · /linking-tickets
- https://help.zoho.com/portal/en/kb/desk/ticket-management/work-modes/articles/ticket-work-modes
- https://help.zoho.com/portal/en/kb/desk/ticket-management/views-and-filters/articles/headquarters-dashboard
- https://help.zoho.com/portal/en/kb/desk/agentic-ai
- https://help.zoho.com/portal/en/kb/desk/agentic-ai/articles/agentic-ai-in-desk-support-specialist-and-resolution-expert
- https://help.zoho.com/portal/en/kb/desk/self-service · /knowledge-base (/editor, /user-actions, /setting-up-and-permission, /performance-monitoring) · /asap · /guided-conversations
- https://help.zoho.com/portal/en/kb/desk/zia · /overview · /intelligence · /prediction · /generative-ai · /answer-bot · /data-handling-and-privacy
- https://help.zoho.com/portal/en/kb/desk/automation · /assignment-rules-notification · /escalate-sla · /support-plans · /actions · /skills-supervise · /support-contract-schedules · /macros · /workflows · /blueprint · /webhooks · /automation-studio
- https://help.zoho.com/portal/en/kb/desk/automation/support-contract-schedules/articles/creating-and-managing-schedules
- https://help.zoho.com/portal/en/kb/desk/customization · /modules · /layouts-and-fields · /templates · /notifications · /ticket-status-and-time-tracking · /general-settings · /custom-buttons
- https://help.zoho.com/portal/en/kb/desk/data-administration · /import-export · /data-migration · /sandbox · /audit-log · /bulk-actions-log · /backup-and-data-archive · /security-settings · /recycle-bin
- https://help.zoho.com/portal/en/kb/desk/data-administration/security-settings/articles/working-with-attachments-control
- https://help.zoho.com/portal/en/kb/desk/data-administration/backup-and-data-archive/articles/backing-up-your-help-desk-data
- https://help.zoho.com/portal/en/kb/desk/data-administration/recycle-bin/articles/using-the-recycle-bin
- https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards · /reports · /dashboards · /response-and-resolution-times
- https://help.zoho.com/portal/en/kb/desk/contacts-and-accounts
- https://help.zoho.com/portal/en/kb/desk/activities
- https://help.zoho.com/portal/en/kb/desk/productivity · /feeds · /gamescope
- https://help.zoho.com/portal/en/kb/desk/accessibility-and-preferences
- https://help.zoho.com/portal/en/kb/desk/billing-and-subscriptions
- https://help.zoho.com/portal/en/kb/desk/integrations-and-marketplace · /general · /agent-productivity · /analytics-and-reports · /channels · /collaboration · /e-commerce · /e-signature · /finance · /project-management · /sales-and-marketing · /self-service · /telephony-and-sms (/hosted-cloud)
- https://help.zoho.com/portal/en/kb/desk/mobile-apps · /android · /radar · /on-demand-mobile-app
- https://help.zoho.com/portal/en/kb/desk/developer-space · /rest-apis · /connections · /apidashboard · /asap
- https://www.zoho.com/desk/pricing.html
- https://www.zoho.com/desk/features.html
