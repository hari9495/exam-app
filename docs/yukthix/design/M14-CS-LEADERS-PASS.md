# M14 · Customer-support leaders pass (Zendesk, Freshdesk, Intercom, Help Scout)

> **Status:** 📝 For founder review, 8 Oct 2026. Docs only. Results are folded into [M14-BUILD-DESIGN.md](M14-BUILD-DESIGN.md) (§16 slices, §17 D8–D10) and the stories in `tracker/stories/G.json`.
> **Why:** founder decision 8 Oct 2026 (D8): customer support must be as strong as service management. The [Zoho Desk pass](M14-ZOHO-DESK-PASS.md) covered one support tool. This pass checks the four tools customers most often compare us with, for customer-support strengths only.

## Method

- **Public sources only:** public help centres, feature pages, pricing / plan pages and public API docs. No account, no trial, no log-in to any of the four products (their terms forbid competitive use of the service; reading public pages is fine).
- **Clean-room:** every line is written in our own words. No text, screenshots, layouts or field names are copied. Product names appear only as the "Seen in" label.
- **Focus:** messenger and chat-first support, bots and AI agents, workflows and macros, customer profiles and companies, multi-brand help centres, side conversations, proactive and outbound messages, inbox UX, CSAT / QA, routing, ecommerce context, community and deflection analytics.
- **One line = one capability.** Where several products have the same thing, the "Seen in" column lists all of them. Counts per product below count each line once for each product that has it.
- **Status:** **COVERED** (slice and / or story named) · **PARTLY** (what is missing → proposed slice, story, phase, priority) · **MISSING** (proposed slice, story, phase 3b-1…3b-4, priority 1 must / 2 should / 3 could) · **NOT FOR US** (founder decision named) · **see Zoho pass** (already listed in the Zoho pass; the story that now covers it is named).
- Checked against the build slices (SD-1.01…SD-4.38 after this pass), stories US-B-085…174 and US-G-001…255, founder decisions Q1–Q10 and D1–D10.

## Founder decisions used (8 Oct 2026)

| # | Decision |
|---|---|
| D8 | Customer support is first-class. A desk is created as **Employee help desk** or **Customer support desk**, each with a ready starter set-up; one engine underneath. One plan, ₹999 per agent, covers both (keeps Q8). |
| D9 | **No read receipts and no email open tracking** (privacy; we block tracking pixels inbound too). |
| D10 | **HIPAA deferred**: only if a US health customer comes. Recorded, not in the plan. |

---

## 1. Messenger, chat and messaging channels

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| One embeddable messenger on web pages with chat, help search and ticket status | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.20, SD-2.18 · US-G-069, US-B-132 |
| Ongoing conversation that survives page closes and devices; reply reaches the customer by push or email if they left | Zendesk, Freshdesk, Intercom, Help Scout | PARTLY | Chat ends as a ticket (US-B-132); one continuous thread with push / email fallback not named → SD-2.37 · US-G-235 · 3b-2 · 1 |
| Expected reply time or queue position shown to the waiting customer | Zendesk, Intercom | MISSING | SD-2.37 · US-G-235 · 3b-2 · 2 |
| Anonymous visitor becomes a known contact when they sign in or verify an email | Zendesk, Intercom | MISSING | SD-2.37 · US-G-235 · 3b-2 · 2 |
| Messenger home screen with arranged cards (search, recent chat, status, news) per brand | Intercom, Help Scout | MISSING | SD-2.37 · US-G-236 · 3b-2 · 2 |
| Article suggestions that change with the page the customer is on | Intercom, Help Scout | PARTLY | Widget KB search (US-G-069); page-aware suggestions not named → SD-2.37 · US-G-236 · 3b-2 · 2 |
| Mobile SDKs for iOS and Android | Zendesk, Freshdesk, Intercom | COVERED | SD-2.20 · US-G-069 |
| Signed identity of logged-in users passed to the widget | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.20 · US-G-069 |
| Office hours and away replies in chat; offline chat becomes a ticket | Zendesk, Intercom, Help Scout | COVERED | SD-1.02, SD-2.18 · US-B-095, US-B-132 |
| Buttons, cards, carousels, forms and files inside chat; chat rating | Zendesk, Freshdesk, Intercom | COVERED | SD-2.19 · US-G-059 |
| WhatsApp | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.21 · US-B-133 |
| Facebook Messenger and Instagram direct messages in the base plan | Zendesk, Freshdesk, Intercom, Help Scout | PARTLY | Planned in 3b-4 (SD-4.24, US-G-184); customer desks need them sooner → moved into SD-2.21 (3b-2 · 2), no new story |
| Voice calls with IVR, recordings and call-backs | Zendesk, Freshdesk, Intercom | COVERED | SD-4.24 · US-G-183 |
| "Seen" markers in chat and read receipts on replies | Zendesk, Intercom | NOT FOR US | Founder decision D9 (8 Oct 2026): read receipts and open tracking are not built |
| LINE and other regional messengers | Zendesk, Freshdesk | see Zoho pass | see Zoho pass (§3) |
| One live inbox for every messaging channel | Zendesk, Freshdesk, Intercom, Help Scout | see Zoho pass | see Zoho pass (§3) · US-G-242 |
| Open API to plug in any messaging channel | Zendesk | see Zoho pass | see Zoho pass (§3) · US-G-241 |

## 2. Bots, AI agent and AI answers

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| AI agent answers from the knowledge base with sources in chat, email and the messenger | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.12 · US-B-168, US-G-151 |
| AI agent follows written procedures and calls actions in outside systems (order status, returns, account changes) | Zendesk, Freshdesk, Intercom | PARTLY | Task topics (US-G-150) and agent studio (US-G-152) are employee-focused; customer procedures with confirm-and-limit actions not named → SD-4.37 · US-G-249 · 3b-4 · 1 |
| Test the AI agent on sample conversations before it goes live | Zendesk, Intercom | PARTLY | Eval gate is internal (US-E-290); admin-facing test sets not named → SD-4.37 · US-G-249 · 3b-4 · 1 |
| Short AI-only notes used as answer sources without publishing them | Intercom | MISSING | SD-4.37 · US-G-249 · 3b-4 · 2 |
| AI agent answers phone calls | Zendesk, Intercom | MISSING | SD-4.37 · US-G-250 · 3b-4 · 3 |
| No-code bot flows with questions, branches and API steps | Zendesk, Freshdesk, Intercom | COVERED | SD-4.12 · US-G-150 |
| AI agent hands over to a person with the full chat and a summary | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.12, SD-4.11 · US-B-168, US-G-148 |
| AI agent reports: resolution rate, unanswered topics, content to add | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.09 · US-G-153, US-G-163 |
| Agent assist: reply drafts, summaries, tone and grammar, translation | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.11 · US-B-167, US-G-149, US-G-161 |
| Agent asks the copilot a question and gets an answer with sources beside the ticket | Zendesk, Intercom | PARTLY | Suggestions only (US-B-167) → SD-4.11 · US-G-251 · 3b-4 · 2 |
| AI suggests new canned responses from repeated replies | Zendesk | MISSING | SD-4.11 · US-G-251 · 3b-4 · 3 |
| Every ticket tagged with intent, sentiment and language on arrival | Zendesk, Freshdesk | COVERED | SD-4.10 · US-B-166, US-G-156 |
| Trend and root-cause insights from conversations | Zendesk, Freshdesk | COVERED | SD-4.10, SD-4.14 · US-G-156, US-G-154 |
| AI answer at the top of help-centre search results | Zendesk, Intercom | PARTLY | Virtual agent only (SD-4.12) → SD-4.12 · US-G-252 · 3b-4 · 2 |
| Admin AI that reviews set-up and drafts rules | Zendesk, Intercom | COVERED | SD-4.13 · US-G-158 |
| AI step inside normal rules | Zendesk, Freshdesk | see Zoho pass | see Zoho pass (§7) · US-G-245 |
| AI priced per resolution / AI bundled in plan tiers | Zendesk, Intercom, Help Scout | NOT FOR US | Q9: AI is outside the ₹999; bring your own key or paid credits |

## 3. Workflows, macros and ticket handling

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Rules on create, update and time; one-click macros (fields + note + reply) | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.12, SD-1.07 · US-B-130, US-B-131, US-G-002 |
| Saved replies with variables, shared and personal | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.08 · US-B-090 |
| Side conversations by email, Slack / Teams or a child ticket | Zendesk, Freshdesk, Intercom | COVERED | SD-1.09 · US-G-005 |
| Back-office tickets for internal teams linked to the customer ticket | Freshdesk, Intercom | COVERED | SD-1.09, SD-2.10 · US-G-005, US-G-046 |
| Tracker ticket: many customer tickets linked to one bug, all told when it is fixed | Zendesk, Freshdesk, Intercom | PARTLY | Problem → incidents bulk close is ITIL (US-B-140); customer tracker with one fix message not named → SD-1.09 · US-G-220 · 3b-1 · 2 |
| A customer "thank you" does not reopen a solved ticket | Freshdesk | MISSING | SD-1.34 · US-G-219 · 3b-1 · 2 |
| Shared ownership: a second team works the ticket without moving it | Freshdesk | COVERED | SD-2.10 · US-G-046 |
| Approvals inside tickets | Zendesk, Freshdesk | COVERED | SD-2.05 · US-G-054 |
| Webhooks and HTTP actions | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.14 · US-B-136, US-G-060 |
| Snooze; send a reply later | Intercom, Help Scout | see Zoho pass | snooze SD-1.11 (US-G-009); send later: see Zoho pass (§1) · US-G-213 |
| Scheduled bulk actions | Zendesk | see Zoho pass | see Zoho pass (§7) · US-G-230 |

## 4. Customer profiles, companies and custom data

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Customer profile with all conversations, company and fields | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.28 · US-G-035 |
| Custom customer fields | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.01 · US-B-137 |
| Custom objects linked to customers and tickets (orders, subscriptions) | Zendesk, Freshdesk, Intercom | COVERED | SD-2.30 · US-G-064 |
| Contacts join their company by email domain | Zendesk, Freshdesk, Help Scout | PARTLY | Organisations exist (US-G-035); domain mapping not named → SD-1.28 · US-G-221 · 3b-1 · 2 |
| One person = one contact across email, phone, WhatsApp and chat | Zendesk, Freshdesk, Intercom | PARTLY | Merge of duplicates in Zoho pass; identity linking across channels not named → SD-1.28 · US-G-221 · 3b-1 · 2 |
| Product events from the company's app on the customer timeline | Zendesk, Intercom | MISSING | SD-2.38 · US-G-237 · 3b-2 · 2 |
| Saved customer segments used in routing, messages, SLAs and article audiences | Zendesk, Intercom, Help Scout | MISSING | SD-2.38 · US-G-237 · 3b-2 · 2 |
| Import customers by CSV; sync from CRM | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.29, SD-4.29 · US-B-121, US-G-201 |
| Free light seats for people who only add notes | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.13 · US-G-033 (Q10) |
| Outside collaborators (vendors) on a ticket | Freshdesk | COVERED | SD-1.09, SD-3.25 · US-G-005, US-G-119 |
| Merge duplicate contacts; notes and bulk actions on contacts | Zendesk, Freshdesk, Intercom, Help Scout | see Zoho pass | see Zoho pass (§2) · US-G-211, US-G-212 |

## 5. Help centres and knowledge (multi-brand)

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Several help centres, one per brand, own domain and theme | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.28 · US-G-071 |
| Restricted (sign-in) help centre and internal-only articles | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.24 · US-B-104, US-G-073 |
| Reusable content blocks across articles | Zendesk | COVERED | SD-1.25 · US-G-025 |
| Article versions and approval before publishing | Zendesk, Freshdesk | COVERED | SD-1.24 · US-B-104 |
| Scheduled publishing and article expiry | Zendesk | MISSING | SD-1.24 · US-G-222 · 3b-1 · 3 |
| Articles shown by customer segment | Zendesk, Freshdesk | PARTLY | Audiences by department / location / role (US-G-073); customer segments → SD-2.38 · US-G-237 · 3b-2 · 2 |
| Outside knowledge (wikis, websites) used by search and AI | Zendesk, Freshdesk, Intercom | COVERED | SD-4.17 · US-G-162 |
| Article feedback, failed searches, content gaps | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.25 · US-B-105, US-G-024 |
| Community forum with moderation | Zendesk, Freshdesk | COVERED | SD-4.30 · US-G-205 |
| Nested folders / category tree | Freshdesk | see Zoho pass | see Zoho pass (§5) · US-G-217 |
| 40+ languages, SEO, custom CSS, portal SSO / JWT | Zendesk, Freshdesk, Intercom, Help Scout | see Zoho pass | see Zoho pass (§4, §5, §10) · US-G-215, US-G-228, US-G-229 |

## 6. Proactive support and outbound

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Targeted banners, posts and chat prompts by page and customer segment | Zendesk, Intercom, Help Scout | PARTLY | Page / user prompts (US-G-059) and known-issue banners (US-G-020); segment targeting on the customer's own site not named → SD-2.39 · US-G-238 · 3b-2 · 2 |
| Service notices triggered by an event (order delayed, payment failed) | Zendesk, Intercom | MISSING | SD-2.39 · US-G-238 · 3b-2 · 2 |
| News / updates feed inside the messenger | Intercom | PARTLY | Status pages (US-B-163); messenger news not named → SD-2.37 · US-G-236 · 3b-2 · 2 |
| In-app surveys (CSAT, NPS, custom) | Zendesk, Intercom, Help Scout | COVERED | SD-2.29 · US-G-074, US-B-109 |
| Outbound email / SMS / WhatsApp / push to segments, and multi-step series | Zendesk, Intercom | MISSING | SD-4.38 · US-G-254 · 3b-4 · 3 (consent + unsubscribe; timed sequences per ticket already in US-G-053) |
| Product tours, tooltips and checklists inside the customer's app | Intercom | MISSING | SD-4.38 · US-G-255 · 3b-4 · 3 |
| Email open tracking for outbound messages | Intercom, Help Scout | NOT FOR US | Founder decision D9: no tracking pixels |

## 7. Inbox UX and agent productivity

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Views and folders by status, assignee, tag, channel, segment | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.07 · US-G-002 |
| Collision detection | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.08 · US-B-090 |
| Customer context side panel with apps | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.08, SD-4.22 · US-G-003, US-B-174 |
| Layout and tools change by ticket type or brand | Zendesk | COVERED | SD-2.30 · US-G-066 |
| Custom agent statuses (away, lunch) | Zendesk, Help Scout | COVERED | SD-2.25 · US-G-075 |
| Keyboard-first inbox with a command bar | Intercom, Help Scout | MISSING | SD-1.34 · US-G-219 · 3b-1 · 2 |
| See that a teammate has a draft in progress | Help Scout | MISSING | SD-1.34 · US-G-219 · 3b-1 · 3 |
| Agent mobile app | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.27 · US-G-068 |
| Pin, bookmark, print, zip download, personal defaults | Zendesk | see Zoho pass | see Zoho pass (§1, §14) · US-G-213 |

## 8. Routing and workforce

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Omnichannel routing with capacity per channel | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-2.25 · US-G-075 |
| Round-robin and load-balanced assignment | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.06 · US-B-087 |
| Skill- and language-based routing with fall-back after a wait | Zendesk, Freshdesk, Help Scout | PARTLY | Skills matrix is 3b-4 (US-G-197) and not used in routing → SD-2.35 · US-G-239 · 3b-2 · 1 |
| "Next ticket" button that gives the most urgent ticket the agent can handle | Zendesk, Freshdesk | MISSING | SD-2.35 · US-G-239 · 3b-2 · 2 |
| Forecasting, schedules and shifts | Zendesk, Freshdesk | COVERED | SD-2.26 · US-G-076, US-G-077 |
| Live supervisor view to act on queues | Zendesk, Freshdesk | see Zoho pass | see Zoho pass (§1) · US-G-225 |

## 9. Quality and satisfaction

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| CSAT after a conversation on every channel | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.26, SD-2.19 · US-B-108, US-G-059 |
| QA scorecards, sampled reviews, disputes and coaching | Zendesk, Freshdesk | COVERED | SD-4.28 · US-G-196 |
| AI scores every conversation, including the AI agent's, and flags churn risk, escalations and bot loops | Zendesk, Intercom | PARTLY | AI draft score in US-G-196; AI-agent review and risk flags not named → SD-4.28 · US-G-253 · 3b-4 · 2 |
| Reviewer calibration sessions | Zendesk | MISSING | SD-4.28 · US-G-253 · 3b-4 · 3 |

## 10. Ecommerce and business apps

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Shop orders beside the ticket and order actions (refund, cancel) | Zendesk, Freshdesk, Intercom, Help Scout | see Zoho pass | see Zoho pass (§14) · US-G-248, widened with order actions |
| Payment and subscription context (Stripe and similar) | Freshdesk, Intercom | MISSING | SD-4.36 · US-G-248 · 3b-4 · 2 |
| CRM context (Salesforce, HubSpot) | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.29 · US-G-201 |
| Escalate to Jira; Linear | Zendesk, Freshdesk, Intercom, Help Scout | PARTLY | Jira, GitHub, Azure DevOps in SD-2.15 (US-G-061); Linear not named → SD-2.15 · US-G-232 · 3b-2 · 3 |
| Marketplace and private apps in the agent side panel | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-4.22 · US-B-174, US-G-179 |
| MCP connection for outside AI tools | Freshdesk, Help Scout | COVERED | SD-4.16 · US-G-178 |
| Sandbox | Zendesk, Freshdesk | COVERED | SD-4.21 · US-B-173 |

## 11. Reports and deflection analytics

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| Ready dashboards, custom and scheduled reports, exports | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.27 · US-B-110, US-B-111 |
| Live dashboards | Zendesk, Freshdesk | COVERED | SD-1.27 · US-G-028 |
| One self-service funnel: views → searches → bot answers → tickets | Zendesk, Freshdesk, Intercom, Help Scout | PARTLY | Deflection counted (YX-HD-04) and content gaps (US-G-024); one funnel report not named → SD-1.27 · US-G-223 · 3b-1 · 2 |
| Data out to BI tools | Zendesk, Freshdesk | COVERED | SD-2.31 · US-G-067 |
| Benchmarks against other companies | Zendesk, Freshdesk | NOT FOR US | D7: peer benchmarks not built |

## 12. Plans, security and compliance

| Capability in our words | Seen in | Status | Our slice / story, or proposed slice · story · phase · priority |
|---|---|---|---|
| HIPAA (business associate agreement) | Zendesk, Intercom, Help Scout | NOT FOR US | D10: deferred until a US health customer comes; not in the plan |
| Choice of data-centre region | Zendesk, Freshdesk, Intercom | COVERED | YX-SEC-19 (company region) |
| Agent SSO, MFA, audit logs | Zendesk, Freshdesk, Intercom, Help Scout | COVERED | SD-1.01, SD-1.29 · US-B-113, US-B-114 |
| Masking of card numbers and personal data | Zendesk | COVERED | SD-1.12 · US-G-029 |
| Brand / department spaces that limit what agents see | Zendesk | COVERED | §5.7 restricted desks, SD-1.28 agent account scope |
| Features locked by plan tier; paid add-ons (copilot, QA, workforce, proactive pack); day passes | Zendesk, Freshdesk, Intercom, Help Scout | NOT FOR US | Q1 / Q8: one plan, every feature; Q9 for AI |

---

## Summary

| Status | Zendesk | Freshdesk | Intercom | Help Scout | Rows (unique) |
|---|---|---|---|---|---|
| COVERED | 54 | 50 | 40 | 32 | 58 |
| PARTLY | 15 | 10 | 14 | 8 | 17 |
| MISSING | 11 | 3 | 12 | 4 | 18 |
| NOT FOR US | 5 | 2 | 5 | 4 | 6 |
| see Zoho pass | 10 | 8 | 5 | 5 | 12 |
| **Total** | **95** | **73** | **76** | **53** | **111** |

"Rows (unique)" counts each capability line once. The four tools are strongest where we were thinnest for customer desks: the **messenger as a long-running conversation**, **AI agents that take actions**, **customer data (events, segments)** and **proactive messages**. Ticketing, SLA, knowledge, routing basics, CSAT and integrations were already well covered.

### Top 10 MISSING or PARTLY (new work)

| # | Capability | Slice · story | Phase · Pri |
|---|---|---|---|
| 1 | Ongoing messenger conversation across visits, with push / email fallback and wait time | SD-2.37 · US-G-235 | 3b-2 · 1 |
| 2 | Skill and language routing with fall-back; "next ticket" button | SD-2.35 · US-G-239 | 3b-2 · 1 |
| 3 | AI agent follows written procedures and takes approved actions; test sets before go-live | SD-4.37 · US-G-249 | 3b-4 · 1 |
| 4 | Customer events from the company's app and saved segments | SD-2.38 · US-G-237 | 3b-2 · 2 |
| 5 | Targeted banners, posts and event-triggered service notices | SD-2.39 · US-G-238 | 3b-2 · 2 |
| 6 | Tracker ticket that tells every linked customer when a bug is fixed | SD-1.09 · US-G-220 | 3b-1 · 2 |
| 7 | One self-service funnel report (views → searches → bot → tickets) | SD-1.27 · US-G-223 | 3b-1 · 2 |
| 8 | Contacts join companies by email domain; one person across all channels | SD-1.28 · US-G-221 | 3b-1 · 2 |
| 9 | Messenger home cards and page-aware article suggestions | SD-2.37 · US-G-236 | 3b-2 · 2 |
| 10 | AI reviews every conversation (people and AI agent) and flags risks | SD-4.28 · US-G-253 | 3b-4 · 2 |

Also new: keyboard-first inbox with shared-draft view and thank-you detector (US-G-219), copilot questions beside the ticket (US-G-251), AI answer in help-centre search (US-G-252), payment context (US-G-248), outbound series and product tours (US-G-254, US-G-255), AI on phone calls (US-G-250), scheduled publishing (US-G-222).

### Needs a founder view

- **"Seen" markers inside live chat.** Treated as read receipts and not built (D9). If the founder wants them for chat only (no pixels, the customer's own app reports it), that is a small change in SD-2.37.
- **Product tours and outbound campaigns** sit close to marketing tools. Kept as priority 3 in 3b-4 for service messages only; drop them if the founder wants the desk to stay strictly support.
- **Social direct messages moved earlier** (Facebook Messenger, Instagram into SD-2.21 in 3b-2), because customer desks expect them on day one.

---

## Sources (public pages read, 8 Oct 2026)

**Zendesk**
- https://www.zendesk.com/pricing/ (Suite plans and add-ons)
- https://www.zendesk.com/service/ai/ai-agents/
- https://www.zendesk.com/service/quality-assurance/

**Freshdesk**
- https://www.freshworks.com/freshdesk/pricing/
- https://www.freshworks.com/freshdesk/features/
- https://www.freshworks.com/freshdesk/omni/
- https://support.freshdesk.com/support/home (help-centre category index)

**Intercom**
- https://www.intercom.com/pricing
- https://www.intercom.com/help/en/ (collection index)
- https://www.intercom.com/help/en/collections/6485365-fin-ai-agent
- https://www.intercom.com/help/en/collections/3497068-inbox
- https://www.intercom.com/help/en/collections/2091449-outbound
- https://www.intercom.com/help/en/collections/2094808-contacts
- https://www.intercom.com/help/en/collections/2094721-workflows
- https://www.intercom.com/help/en/collections/2094767-proactive-support (Messenger collection)

**Help Scout**
- https://www.helpscout.com/pricing/
- https://www.helpscout.com/features/
- https://www.helpscout.com/beacon/
- https://docs.helpscout.com/ (help-centre category index)

Two help-centre pages returned "not found" and were skipped (a Zendesk messaging category and an Intercom inbox article). Where a public page named a capability only briefly, the line was kept at feature level and no detail was guessed.
