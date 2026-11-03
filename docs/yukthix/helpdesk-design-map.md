# Helpdesk and Service desk: live pages and their designs (check)

This file checks, story by story, that every Helpdesk / Service desk design sub-page can be reached in the live app.
People, Pay, Time, Performance and Expenses were checked the same way (see `expenses-design-map.md` and the others).
Founder rule: never build a second, simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-hlp-01`): two sets of designs cover the same jobs. **A.** The founder's
Helpdesk designs HLP-01 … 14 (`packages/yx-ui/src/screens/ops/helpdesk.tsx`, `cases.tsx`, `cases-more.tsx`) and **B.**
the Service desk designs built with the desk server (`packages/yx-ui/src/screens/desk/*`). Every live page under
/yx/desk renders a B screen (or a stand-in copy) except /yx/desk/help, which now renders the designed HLP-01 screen
with `live` (round 1). The stand-in it replaced (desk `HelpCentreScreen` in `screens/desk/help.tsx`) is deleted with
its six stories in `desk.stories.tsx`, its tests, and the 7 "Live ·" stories of its chat offer and WhatsApp / SMS cards. The server for HLP-01 … 05
exists (`apps/api/src/service-desk`: tickets, catalogue, SLA, knowledge base, surveys, reports). HLP-06 … 14 (speak-up,
cases, ethics desk, policies, accidents, disputes, the policy writer) have no server at all.

Verdicts (the same words as People, Performance and Expenses): **live** (the live page renders the designed screen and
can reach this state; the note says how) · **live (gap)** (the design is live, but this state can't be fully reached
yet; the note says why) · **wire design** (a live page exists for this job but renders something else) · **design only,
feature not built** (no API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Helpdesk HLP-01 … 14 | 14 | 13 | 1 | 22 | 69 | 0 | 105 |
| B. Service desk designs | 6 | 80 | 2 | 0 | 0 | 0 | 82 |
| **All Helpdesk groups (A–B)** | **20** | **93** | **3** | **22** | **69** | **0** | **187** |

Counted by script 3 Nov 2026 on `feat/yukthix-hlp-01` (the script is in the appendix): every `export const` story in
the fourteen `hlp-NN.stories.tsx` files and the six Service desk design files against the rows in section 4. HLP-01 has
14 stories: the 10 approved ones plus 4 drawn this round for states only the real record has. The six desk Help centre
stories of the stand-in (Help, HelpEmpty, HelpWithBanner, HelpRaiseTooEarly, HelpRaised, HelpMeTooAgain) are deleted,
so Phase 3b-1 now has 33 stories. Not rows: the 110 "Live ·" stories left in `screens/desk/esm-live.stories.tsx`
(117 before; the 7 Help centre ones went with HLP-01); they are pictures of the live stand-ins, not designs (section 2
groups them).

## How it is wired today

- Every page under /yx/desk is a client page that reads the API with `useDesk` / `useDeskWrite`
  (`apps/web/lib/yx-desk`) and renders a screen from `@yukthix/ui/desk` with `state`, the data and the actions. None
  imports from `screens/ops` (grep for `AgentDeskScreen`, `TicketWorkspaceScreen`, `KbEditorScreen`,
  `SlaDashboardScreen` in `apps/web` finds nothing).
- HLP-01 takes `live` (helpdesk-live.tsx; samples for its new stories and tests in helpdesk-live-samples.ts). The other HLP screens are sample-only. Making one live means the
  Expenses pattern: `'live' in props ? <LiveX live={props.live} /> : <SampleX {...props} />`, the page passes real data,
  and the desk stand-in it replaces is deleted with its stories and tests.
- Server access is per desk (`desk-access.ts`): roles per desk, sensitive and private tickets hidden from anyone who is
  not on that desk's HR side, admins never see sensitive tickets. Permission keys are `desk.*` (55 routes use
  `desk.ticket.work`; reads use `desk.ticket.view`).
- Outside the signed-in app: the customer portal (/yx/portal/[org]/[portal]), the approval link (/yx/act/[token]), the
  wall screen (/yx/wall/[org]/[token]) and desk sign-up (/yx/start).

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/desk/help (?new=1, ?article=) | the designed `HelpCentreScreen` (HLP-01) with `live`: Find an answer, resolved-ticket card, My tickets with the resolution promise, the raise drawer (phone: bottom sheet); known issues, the chat offer, WhatsApp / SMS, reading aids and My data in the same layout | HLP-01 | `GET desk/my/tickets` (now with `clock`, `closesOn`, `reopenUntil`, `rating`, `canRate`), `POST desk/my/tickets`, `POST desk/my/tickets/:id/attachments`, `POST desk/my/tickets/:id/rating`, `GET desk/my/desks`, `GET desk/my/kb`, `/kb/suggest`, `/kb/articles/:n`, `POST /kb/articles/:id/feedback`, `GET desk/my/banners`, `POST …/me-too`, `GET/POST desk/my/privacy-requests`, `GET desk/my/chat/prompt`, `desk/my/messaging` (all implicit: the signed-in person's own records; 403 while acting for someone else) | live |
| /yx/desk/help/[id] | `MyTicketScreen` with `RequestTracker`, `MyDocumentsCard` (stand-ins) | Phase 3b-1 MyTicket | `GET desk/my/tickets/:id`, `POST …/messages`, `/watchers`, `/attachments`, `GET desk/my/requests/:id`, `/documents`, `POST desk/my/documents/:id/sign` (implicit: the requester or a watcher) | live |
| /yx/desk/tickets | `DeskTicketsScreen` (list and board, built-in and saved views, bulk, new ticket) | Phase 3b-1 Tickets, Board; HLP-02 not wired | `GET desk/tickets`, `GET/POST desk/views` (`desk.ticket.view`), `POST desk/tickets` (`desk.ticket.work`), `POST desk/tickets/bulk` (`desk.ticket.bulk`), `GET desk/tickets/export` (`desk.ticket.export`) | live (B); wire design (HLP-02) |
| /yx/desk/tickets/[id] | `TicketScreen` with `TicketWorkRail`, `ResolveDialog`, `EscalateDialog`, `RequestPanel`, `TicketEsmRail`, `TicketKbCard` (the last four are stand-ins) | Phase 3b-1 Workspace; HLP-03 not wired | `GET desk/tickets/:id`, `/timeline`, `/context`, `/sla`, `/work` (`desk.ticket.view`), `POST …/messages` (`desk.ticket.work` or `desk.ticket.note`), `/resolve`, `/escalate`, `/assign` (`desk.ticket.work`), `/merge` (`desk.ticket.merge`) | live (B); wire design (HLP-03) |
| /yx/desk/knowledge | `KnowledgeScreen` (spaces, articles, editor with review, gaps, recycle bin) | HLP-04 Knowledge; HLP-04 Knowledge base editor not wired | `GET desk/kb/spaces`, `/articles` (`desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish`), `POST desk/kb/articles`, `/versions`, `/submit` (`desk.kb.author`), `/review`, `/retire` (`desk.kb.publish`), `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`) | live (B); wire design (HLP-04) |
| /yx/desk/reports | `ReportsScreen` (dashboard, KPIs, library, funnel, my reports, walls, customers, NPS surveys) | Reports (HLP-05); HLP-05 SLA dashboard not wired | `GET desk/reports/*` (`desk.report.view`), custom reports, schedules, wallboards, KPI targets (`desk.report.manage`), `GET/POST desk/surveys` (`desk.survey.manage`); no-access state without either | live (B); wire design (HLP-05) |
| /yx/wall/[org]/[token] | `WallScreen` | Reports (HLP-05) Wall | `GET desk/wall/:org/:token` (the secret link; counts only) | live |
| /yx/desk/setup | `DeskSetupScreen` (desks, calendars, SLA, email, help pages, banners, `SetupStart`) and the stand-ins `CatalogAdmin`, `RulesAdmin`, `LifecycleAdmin`, `ChatQueuesAdmin`, `DeskOrgAdmin`, `SchedulesAdmin`, `MessagingAdmin` | Phase 3b-1 Setup and set-up tabs; Batch 4 GetStarted | desk set-up routes (`desk.settings.manage`, `desk.desk.create`, `desk.sla.manage`, `desk.mailbox.manage`, `desk.portal.manage`, `desk.catalog.manage`, `desk.rule.manage`, `desk.lifecycle.manage`, `desk.channel.manage`) | live |
| /yx/desk/calendar | `MyCalendarScreen` | Phase 3b-1 Calendar | `GET desk/me/calendar`, `GET desk/tasks` (implicit: an agent) | live |
| /yx/desk/customers | `CustomersScreen` | Phase 3b-1 Customers | `GET desk/customers/*` (`desk.customer.manage` or `desk.ticket.view`; changes `desk.customer.manage`) | live |
| /yx/desk/known-issues | `KnownIssuesScreen` | Batch 4 KnownIssues | `GET/POST desk/desks/:id/banners` (`desk.ticket.work`) | live |
| /yx/desk/people-list | `PeopleListScreen` | Batch 4 PeopleList | `GET desk/people-list` (`desk.directory.manage`) | live |
| /yx/desk/privacy | `PrivacyScreen` | Batch 4 Privacy | `GET desk/privacy/requests`, `/settings` (`desk.desk.create`) | live |
| /yx/start | `DeskSignUpScreen` | Batch 4 SignUp | `POST desk/signup` (public, throttled, challenge) | live |
| /yx/portal/[org]/[portal] | `PortalScreen` | Phase 3b-1 Portal stories | `GET desk/portal/:org/:portal`, `/me`, `/tickets`, `/tickets/:id` (the portal's own sign-in) | live |
| /yx/approvals | approvals page with `ChannelLinksCard` | Approval link and chat apps | `GET/POST/DELETE workflow/channel-links` (implicit: own links) | live (gap): real Teams / Slack transport not built |
| /yx/act/[token] | `ActionLinkScreen` | Approval link and chat apps | `GET/POST workflow/act/:token` (the single-use signed token) | live |
| /yx/support | `YukthixSupportScreen` | Contact YukthiX (SD-1.31) | `GET/POST desk/support/yukthix/tickets` (`org.yukthix_support.raise`) | live |
| every signed-in page | `HelpDrawer` (in-app Help, `desk-help.tsx`) | Phase 3b-1 HelpDrawerOpen | the same `desk/my` routes as /yx/desk/help | live |
| /yx/desk/catalog | `CatalogScreen` (stand-in) | none | `GET desk/my/catalog`, `/items/:id`, `/guides/:id` (implicit) | no design (section 2) |
| /yx/desk/chat | `RequesterChatScreen` (stand-in) | none | `GET desk/my/chat*` (implicit) | no design (section 2) |
| /yx/desk/live-chat | `AgentChatScreen` (stand-in) | none | `GET desk/chat/sessions*` (`desk.chat.work`) | no design (section 2) |
| /yx/desk/team | `TeamScreen` (stand-in) | none | `GET desk/desks/:id/team` (`desk.ticket.assign` or `desk.report.view`), shifts (`desk.ticket.assign`), `PUT desk/me/presence` | no design (section 2) |
| /yx/desk/confirm-chat | a small page of kit parts (Button, InlineAlert) | none | the chat confirm link | no design (too small to need one) |

## 2. Live pages with no design (stand-in copies still)

The design-live guard (`packages/yx-ui/src/design-live-guard.known.json`) lists 18 desk screens (20 before HLP-01: `ChatPromptBanner` and `MyChannelsCard` left with their 7 Live stories) under `liveCopies`:
live, but drawn only as "Live ·" pictures in `esm-live.stories.tsx`. Grouped by the design that should replace them:

| stand-in (`liveCopies`) | live page | "Live ·" stories | design that should replace it |
|---|---|---|---|
| `ArticleBody` | /yx/desk/help (inside the article drawer), the portal | Help article (3) | HLP-01 "Article open" now draws it in the Help centre; it stays listed because the portal and agents' knowledge pages still show it only through Live stories |
| `RequestTracker`, `MyDocumentsCard` | /yx/desk/help/[id] | My request (9) | HLP-01 (ticket and request view); no HLP story draws the approval route or documents to sign yet: draw first |
| `RequestPanel`, `TicketEsmRail`, `TicketKbCard`, `EscalateDialog` | /yx/desk/tickets/[id] | Ticket (12), Escalate (4) | HLP-03 Ticket workspace (its rail must take these cards: kit first) |
| `CatalogScreen` | /yx/desk/catalog | Catalogue (9) | none; HLP-01's "Raise ticket" is the nearest. Needs a design (service catalogue) |
| `RequesterChatScreen`, `AgentChatScreen` | /yx/desk/chat, /yx/desk/live-chat | Chat (12), Live chat (8), Calls (1) | none (HLP-01's assistant thread is the AI assistant, not live chat). Needs a design |
| `TeamScreen` | /yx/desk/team | Desk team (11) | none (HLP-05 is SLAs, not shifts). Needs a design |
| `CatalogAdmin`, `RulesAdmin`, `LifecycleAdmin`, `ChatQueuesAdmin`, `DeskOrgAdmin`, `SchedulesAdmin`, `MessagingAdmin` | /yx/desk/setup | Set-up (41) | none; the Phase 3b-1 set-up tabs are designs for the rest of the same page. Needs designs per tab |

And under `notLive`: designed, with no live page rendering them. `ops: AgentDeskScreen` (HLP-02), `ops:
TicketWorkspaceScreen` (HLP-03), `ops: KbEditorScreen` (HLP-04), `ops: SlaDashboardScreen` (HLP-05) have a live page
doing the same job with a B screen (section 5). `ops: SpeakUpScreen`, `ops: CheckReportScreen` (HLP-06), `ops:
MyCasesScreen` (HLP-07), `ops: CaseListScreen`, `ops: CaseWorkspaceScreen`, `ops: LoadingCase`, `ops: ErrorCase`
(HLP-08), `ops: EthicsDeskScreen` (HLP-09), `ops: PolicyLibraryScreen` (HLP-10), `ops: PolicyAdminScreen` (HLP-11),
`ops: AccidentWorkspaceScreen`, `ops: ReportAccidentScreen` (HLP-12), `ops: CollectiveDisputeScreen` (HLP-13), `ops:
PolicyWriterScreen` (HLP-14) and `ops: PoshCaseScreen` (no HLP story; the POSH case) have no server. Related phone and
portal designs also wait: `settings: MobileHelpTicketsScreen`, `MobilePolicyAckScreen`, `MobileSpeakUpScreen`,
`portals: AnonymousCaseScreen`, `ExternalPartyCaseScreen`, `HelpEditorScreen`.

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| HLP-06 Speak-up filing (12 stories) | grievance and whistleblower intake, anonymous access code and the no-login "check my report", POSH redirect to the internal committee; tables with RLS, a public route with throttling | L |
| HLP-07 My cases (8) | the complainant / respondent / witness view, show-cause reply and extension request | M (after HLP-08) |
| HLP-08 Cases, case team (12) | case records, members and conflict-of-interest check, disposal clocks, disciplinary steps (no decision before the reply), "not found" for non-members | XL |
| HLP-09 Ethics desk (6) | the ethics officer's whistleblower queue, route to the audit committee chair | M (after HLP-06, 08) |
| HLP-10 Policy library + acknowledgement (10) | policies, versions, acknowledgement by click, one-time code or quiz. The desk's document read-and-sign with a code (`POST desk/documents/:id/sign-code`, `/sign`) is the only near part; it signs one ticket document, not a company policy | L |
| HLP-11 Policy admin (6) | acknowledgement % by department, pending people and reminders, audience and method, re-acknowledge on a new version | M (with HLP-10) |
| HLP-12 Accident case workspace (8) | accident reports, ESIC report and EC claim clocks, contract workers, manager view | L |
| HLP-13 Collective dispute / settlement (3) | dispute record, conciliation, signed settlement sent to payroll arrears | L |
| HLP-14 Write policies with AI (4) | questionnaire, AI draft, law findings that block approval, approve and load into HLP-10 | L (after HLP-10) |

## 4. Design groups, story by story

### A. Helpdesk HLP-01 … 14

#### HLP-01 · Help centre

Live page: /yx/desk/help (menu Helpdesk › Help centre; ?new=1 opens the raise form, ?article=12 opens KB-12). The
page renders the designed `HelpCentreScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live part is
`screens/ops/helpdesk-live.tsx`. Open to everyone in the company (the requester's implicit role, own records only).
Four stories were drawn in the same layout for states only the real record has (known issues, an article open, the
chat offer and WhatsApp / SMS help, no access).

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Default | live (gap) | Find an answer (popular articles from `GET desk/my/kb`), the resolved-ticket card, My tickets with the "Resolve" promise badge (new: business minutes used of the target from `GET desk/my/tickets`), Private badge. Gap: the rail's assistant thread; there is no help assistant on the server yet (AI wave), so the rail shows "The assistant is not switched on yet." |
| SearchResults · Search results | live | typing 3 letters or more asks `GET desk/my/kb/suggest` (300 ms after typing stops); "N articles for …"; the title opens the article; category tag from the knowledge base |
| SearchNoMatch · Search · no match | live | "No articles match these words." |
| RaiseTicket · Raise ticket · article suggestions | live | the drawer: topic (every desk's categories, each naming its team, "private to this team's agents" when sensitive; "Something else for <team>"), subject, articles that may answer it with "This answers it" (counted as self-service, no ticket: `POST desk/my/kb/articles/:id/feedback {solved}`), details, attachments (sent to the new ticket after it is made, virus-checked; a file that fails is named in the toast), Keep this private. Pressed too early: each missing field says so and the first takes focus. Done: toast with the ticket number |
| RateResolved · Resolved ticket · rate or reopen | live | the newest solved or closed ticket that can still be rated or reopened: "Closes on <date> if you don't reply" (desk setting `autoCloseDays`, default 3) and "You can reopen it until <date>" (desk settings `requesterCanReopen`, `reopenWindowDays`, default 7, counted from the solve); 1–5 rating (`POST desk/my/tickets/:id/rating`, only the person who raised it, once; pressed with no choice says so); "Reopen ticket" opens the ticket, where a reply reopens it |
| NoTickets · Empty (no tickets, assistant not yet on) | live | "You have no tickets."; the assistant card says it is not switched on yet |
| Loading · Loading | live | while `GET desk/my/desks` and `/my/tickets` load |
| Error · Error | live | either fails; "Try again" refetches (a 403 shows the no-access state instead) |
| Phone · Help centre · phone | live | under 768 px: the design's phone layout (search, Raise a ticket, resolved card, My tickets) |
| PhoneRaise · Raise ticket · phone | live | under 768 px the raise form is a bottom sheet |
| KnownIssue · Known issue · Me too, reading aids and my data | live | new story: the desk's banners for the person (`GET desk/my/banners`) with "Me too" (`POST …/me-too`, once; pressed again says you are on it); rail: reading aids and "My data" (copy or erasure of my desk data) |
| ArticleOpen · Article open · was it helpful, this solved it | live | new story: the article drawer (`GET desk/my/kb/articles/:n`, other languages, Yes / No once, "This solved it", "I still need help" opens the raise form) |
| ChatAndPhone · Chat offer and help on WhatsApp or SMS | live | new story: the page's chat offer when an agent is online (`GET desk/my/chat/prompt`) and the WhatsApp / SMS card (`GET desk/my/messaging`, link my phone with a join code, unlink) |
| NoAccess · No access (acting for someone else) | live | the API refuses (403) anyone acting for someone else; the page shows the kit's no-access state |

#### HLP-02 · Agent desk

Live page for this job: /yx/desk/tickets renders `DeskTicketsScreen` (Phase 3b-1). The server has everything the
design shows (views, SLA "breaching soon", unassigned, bulk, sensitive tickets hidden by `desk-access.ts`).

| story (sub-page) | verdict | note |
|---|---|---|
| MyOpenTickets · My open tickets | wire design | live page /yx/desk/tickets renders DeskTicketsScreen (Phase 3b-1); its built-in view "My open tickets" is the same filter |
| AtRisk · At risk or breached view | wire design | live: built-in view "Breaching soon" (`breaching` filter from the SLA timers) |
| Unassigned · Unassigned | wire design | live: built-in view "Unassigned" |
| QuickView · Row quick view | wire design | DeskTicketsScreen has no quick view; a row opens the ticket page |
| Bulk · Bulk selection | wire design | live: bulk move / assign through `POST desk/tickets/bulk` (`desk.ticket.bulk`) |
| ItAgentNoSensitive · IT agent (sensitive tickets hidden) | wire design | the server already hides sensitive and private tickets from anyone not on the desk's HR side |
| Filtered · Filtered to nothing | wire design | DeskTicketsScreen's own empty filter state |
| Empty · Empty | wire design | DeskTicketsScreen's empty state |
| Loading · Loading | wire design | DeskTicketsScreen `state="loading"` |
| Error · Error | wire design | DeskTicketsScreen `state="error"` |

#### HLP-03 · Ticket workspace

Live page for this job: /yx/desk/tickets/[id] renders `TicketScreen` with `TicketWorkRail` (Phase 3b-1) and four
stand-in cards (section 2).

| story (sub-page) | verdict | note |
|---|---|---|
| Reply · Reply | wire design | live page /yx/desk/tickets/[id] renders TicketScreen (Phase 3b-1); reply through `POST desk/tickets/:id/messages` |
| MacroInserted · Reply with saved reply | wire design | saved replies are the desk's canned responses (`desks/:id/my-canned-responses`), used by TicketScreen |
| InternalNote · Internal note | wire design | notes exist (`desk.ticket.note`); a collaborator can only write notes |
| WaitingOnEmployee · Waiting on employee (SLA paused) | wire design | the SLA engine pauses timers in a waiting state; TicketScreen shows the timers |
| Breached · Breached SLA | wire design | the SLA engine marks breaches and asks for a breach reason (`POST …/sla/:timerId/breach-reason`) |
| Resolved · Resolved | wire design | resolve with a code and note (`ResolveDialog`, `POST …/resolve`) |

#### HLP-04 · Knowledge base editor

Live page for this job: /yx/desk/knowledge renders `KnowledgeScreen` (the "HLP-04 Knowledge" B design).

| story (sub-page) | verdict | note |
|---|---|---|
| Published · Published | wire design | live page /yx/desk/knowledge renders KnowledgeScreen (B design "HLP-04 Knowledge"); versions and publish exist |
| Draft · New draft | wire design | live: new article, save draft, submit for review (`desk.kb.author`) |
| ReviewDue · Review due | wire design | the server keeps `reviewDueOn` and marks overdue reviews in article health |

#### HLP-05 · SLA dashboard

Live page for this job: /yx/desk/reports renders `ReportsScreen` (the "Reports (HLP-05)" B design); response targets
are set in /yx/desk/setup (SLA tab).

| story (sub-page) | verdict | note |
|---|---|---|
| QueueLead · Queue lead | wire design | live page /yx/desk/reports renders ReportsScreen (B design "Reports (HLP-05)"); its dashboard and KPI tabs show SLA met / breached per desk, not the design's per-queue at-risk table |
| Loading · Loading | wire design | ReportsScreen tab loading |
| Empty · Empty (no tickets in period) | wire design | ReportsScreen's empty period |

#### HLP-06 · Speak-up filing

No server: no grievance, whistleblower or POSH routes or tables in `apps/api` (checked `apps/api/src` and
`schema.prisma`; `PerfDispute` is a performance review dispute, not this).

| story (sub-page) | verdict | note |
|---|---|---|
| NamedGrievance · Grievance · named, confidential | design only, feature not built | no speak-up API |
| Anonymous · Whistleblower · anonymous | design only, feature not built | no anonymous intake or access codes |
| AnonymousOff · Anonymous switched off by company | design only, feature not built | needs a company setting (default and HR setting) |
| PoshRedirect · Sexual harassment · goes to IC | design only, feature not built | no internal committee records |
| FiledNamed · Filed · named (GRC clock) | design only, feature not built | no grievance clock |
| FiledAnonymous · Filed · access code shown once | design only, feature not built | |
| Phone · Speak up · phone | design only, feature not built | the feature itself is not built |
| PhoneCode · Access code · phone | design only, feature not built | |
| CheckMyReport · Check my report (no login) | design only, feature not built | needs a public, throttled route |
| CheckWrongCode · Check my report · wrong code | design only, feature not built | |
| CheckLocked · Check my report · too many tries | design only, feature not built | |
| CheckOpen · Check my report · messages | design only, feature not built | |

#### HLP-07 · My cases

No server (no case records).

| story (sub-page) | verdict | note |
|---|---|---|
| List · My cases (complainant, respondent, witness) | design only, feature not built | no case API |
| ShowCauseReply · Show-cause reply | design only, feature not built | no disciplinary steps |
| ExtensionAsked · Show-cause · extension requested | design only, feature not built | |
| Replied · Reply sent | design only, feature not built | |
| Empty · Empty | design only, feature not built | |
| Loading · Loading | design only, feature not built | |
| Phone · My cases · phone | design only, feature not built | the feature itself is not built |
| PhoneReply · Show-cause reply · phone | design only, feature not built | |

#### HLP-08 · Cases (case team)

No server (no case records, members or clocks).

| story (sub-page) | verdict | note |
|---|---|---|
| CaseList · Case list | design only, feature not built | no case API |
| CaseListEmpty · Case list · empty | design only, feature not built | |
| Grievance · Grievance workspace (GRC, disposal clock) | design only, feature not built | |
| AnonymousMessages · Whistleblower · anonymous messages | design only, feature not built | |
| Disciplinary · Disciplinary · reply awaited | design only, feature not built | |
| DecisionBlocked · Disciplinary · decision blocked before reply | design only, feature not built | |
| DecisionAllowed · Disciplinary · record decision | design only, feature not built | |
| ConflictBlock · Add member · conflict of interest | design only, feature not built | |
| NonMember · Not a case member (shows Not found) | design only, feature not built | |
| NonMemberList · Case list · not a member (shows Not found) | design only, feature not built | |
| Loading · Loading | design only, feature not built | |
| Error · Error | design only, feature not built | |

#### HLP-09 · Ethics desk

No server.

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · Whistleblower queue | design only, feature not built | no whistleblower API |
| RouteToChair · Route to audit committee chair | design only, feature not built | |
| Empty · Empty | design only, feature not built | |
| Loading · Loading | design only, feature not built | |
| Error · Error | design only, feature not built | |
| NotEthicsOfficer · Not the ethics officer (shows Not found) | design only, feature not built | |

#### HLP-10 · Policy library + acknowledgement

No server for company policies. The only near part is the desk's read-and-sign of one ticket document with a one-time
code (`POST desk/documents/:id/sign-code`, `/sign`).

| story (sub-page) | verdict | note |
|---|---|---|
| ToAcknowledge · To acknowledge | design only, feature not built | no policy API |
| ClickAck · Acknowledge by click | design only, feature not built | |
| OtpAck · Critical policy · one-time code | design only, feature not built | the desk document signing code could be reused |
| QuizAck · Quiz · one wrong answer | design only, feature not built | |
| Acknowledged · Acknowledged | design only, feature not built | |
| UpToDate · Empty (nothing to acknowledge) | design only, feature not built | |
| Loading · Loading | design only, feature not built | |
| Error · Error | design only, feature not built | |
| Phone · Policies · phone | design only, feature not built | the feature itself is not built |
| PhoneOtp · One-time code · phone | design only, feature not built | |

#### HLP-11 · Policy admin

No server.

| story (sub-page) | verdict | note |
|---|---|---|
| Acknowledgement · Acknowledgement % | design only, feature not built | no policy API |
| Pending · Pending people · remind | design only, feature not built | |
| Versions · Versions | design only, feature not built | |
| Audience · Audience & method | design only, feature not built | |
| PublishReack · Publish new version · re-acknowledge | design only, feature not built | |
| AllDone · Everyone acknowledged | design only, feature not built | |

#### HLP-12 · Accident case workspace

No server (no accident records; ESIC and EC claim clocks not built).

| story (sub-page) | verdict | note |
|---|---|---|
| EsiCovered · ESI covered · ESIC report due | design only, feature not built | no accident API |
| Statutory · Non-ESI · EC claim overdue with interest | design only, feature not built | |
| Submitted · ESIC report submitted | design only, feature not built | |
| ContractWorker · Contract worker · contractor not filed | design only, feature not built | |
| ManagerView · Manager view (leave dates only) | design only, feature not built | |
| NonMember · Not a case member (shows Not found) | design only, feature not built | |
| ReportDesk · Report an accident | design only, feature not built | |
| ReportPhone · Report an accident · phone | design only, feature not built | the feature itself is not built |

#### HLP-13 · Collective dispute / settlement

No server (`WageSettlement`, `FnfSettlement` are pay records, not dispute settlements).

| story (sub-page) | verdict | note |
|---|---|---|
| Conciliation · Conciliation in progress | design only, feature not built | no dispute API |
| Signed · Settlement signed · send to payroll arrears | design only, feature not built | payroll arrears exist; the dispute record does not |
| NonMember · Not a case member (shows Not found) | design only, feature not built | |

#### HLP-14 · Write policies with AI

No server (needs HLP-10's policies first).

| story (sub-page) | verdict | note |
|---|---|---|
| Questionnaire · Questionnaire | design only, feature not built | no policy writer API |
| Generating · Drafting (loading) | design only, feature not built | |
| DraftBlocked · Draft · law finding blocks approval | design only, feature not built | |
| ApproveLoad · Findings resolved · Approve & load | design only, feature not built | |

### B. Service desk designs

#### Phase 3b-1 (wired screens)

The six old Help centre stories (Help, HelpEmpty, HelpWithBanner, HelpRaiseTooEarly, HelpRaised, HelpMeTooAgain) go with
the HLP-01 stand-in and are not rows.

| story (sub-page) | verdict | note |
|---|---|---|
| MyTicket · HLP-01 My ticket (requester view) | live | /yx/desk/help/[id] renders MyTicketScreen; replies, colleagues, files through `desk/my/tickets/:id` |
| Tickets · HLP-02 Agent desk · list | live | /yx/desk/tickets renders DeskTicketsScreen, list layout (HLP-02 design not wired: section 5) |
| Board · HLP-02 Agent desk · board | live | /yx/desk/tickets, board layout; moving a card changes the state |
| Workspace · HLP-03 Ticket workspace · agent, colleague typing | live | /yx/desk/tickets/[id] renders TicketScreen; presence through `POST desk/tickets/:id/presence` |
| WorkspaceCollaborator · HLP-03 Ticket workspace · collaborator (notes only) | live | a collaborator (`desk.ticket.note`) writes notes only |
| Setup · Desk set-up | live | /yx/desk/setup renders DeskSetupScreen |
| Calendar · SD-1.11 My calendar | live | /yx/desk/calendar; the calendar feed link can be made and revoked |
| SlaSetupTab · SD-1.14 Response targets (desk set-up tab) | live | /yx/desk/setup, SLA tab (`desk.sla.manage`) |
| EmailSetup · SD-1.18 Email (desk set-up tab) | live | /yx/desk/setup, Email tab (`desk.mailbox.manage`) |
| PortalSetup · SD-1.21 Help pages (desk set-up tab) | live | /yx/desk/setup, Help pages tab (`desk.portal.manage`) |
| BannerSetup · SD-1.23 Banners (desk set-up tab) | live | /yx/desk/setup, Banners tab |
| Customers · SD-1.22 Customers | live | /yx/desk/customers |
| HelpDrawerOpen · US-B-100 In-app Help drawer | live | `HelpDrawer` on every signed-in page (`desk-help.tsx`) |
| WorkspaceUnverified · SD-1.19 Ticket workspace · sender not verified, customer | live | an email ticket from a sender the mail checks did not verify; customer account and product |
| PortalLogin · US-G-021 Outside portal · sign in | live | /yx/portal/[org]/[portal] renders PortalScreen |
| PortalHomeStory · US-G-021 Outside portal · my tickets | live | the portal's own sign-in, then my tickets |
| PortalTicketStory · US-G-021 Outside portal · one ticket | live | |
| NewTicketTooEarly · HLP-02 New ticket · Raise ticket pressed with nothing filled | live | the field errors, focus on the first, nothing sent |
| ReplyTooEarly · HLP-03 Ticket workspace · Send reply pressed with nothing written | live | |
| ResolveTooEarly · SD-1.10 Resolve · pressed without a code or note | live | `ResolveDialog` when the desk needs a resolution code |
| NewDeskTooEarly · Desk set-up · Create desk pressed with nothing filled | live | |
| HolidayTooEarly · Desk set-up · Add holiday pressed with no date or name | live | |
| MailboxTooEarly · SD-1.18 Email · Add mailbox pressed with nothing filled | live | |
| DomainTooEarly · SD-1.18 Email · Add domain pressed with no domain | live | |
| PortalTooEarly · SD-1.21 Help pages · Save pressed with nothing filled | live | |
| PortalNoDesk · SD-1.21 Help pages · New help page with no customer desk (toast) | live | |
| BannerTooEarly · SD-1.23 Banners · Post pressed with nothing written | live | |
| HelpDrawerTooEarly · US-B-100 Help drawer · Raise ticket pressed with nothing filled | live | |
| MyTicketReplyTooEarly · HLP-01 My ticket · Send reply pressed with nothing written | live | |
| MyTicketWatchTooEarly · HLP-01 My ticket · Add colleague pressed with no email | live | |
| CustomersPlanTooEarly · SD-1.22 Customers · Add plan pressed with nothing filled | live | |
| CustomersPersonTooEarly · SD-1.22 Customers · Add person pressed with nothing filled | live | |
| CustomersProductTooEarly · SD-1.22 Customers · Add product pressed with no name | live | |

#### Reports (HLP-05)

Live page: /yx/desk/reports (only the open tab's data is fetched); the wall screen at /yx/wall/[org]/[token].

| story (sub-page) | verdict | note |
|---|---|---|
| Dashboard · Dashboard | live | `GET desk/reports/dashboard` (`desk.report.view`) |
| Kpis · KPIs with targets and forecast | live | `GET desk/reports/kpis/:deskId`; targets need `desk.report.manage` |
| Library · Report library | live | `GET desk/reports/library` |
| Funnel · Self-service funnel | live | `GET desk/reports/funnel` |
| MyReports · My reports and schedules | live | custom reports and schedules (`desk.report.manage` to change) |
| Walls · Wall screens | live | make and revoke the secret wall link |
| Customers · Customer reports | live | `GET desk/reports/customers/:accountId` |
| Surveys · NPS surveys | live | `GET/POST desk/surveys` (`desk.survey.manage`) |
| SurveysOnly · Surveys only (no report access) | live | with `desk.survey.manage` but not `desk.report.view` the page opens on Surveys |
| TabLoading · Tab loading | live | |
| NoAccess · No access | live | neither key: the page's `no-access` state |
| Wall · Wall screen (TV) | live | /yx/wall/[org]/[token], counts only, no session |
| WallOff · Wall screen · switched off | live | a revoked link |
| WallTooEarly · Wall screens · Make the link pressed with nothing filled | live | |
| CustomerTooEarly · Customer reports · Show report pressed with no company | live | |
| SurveyTooEarly · NPS surveys · Save survey pressed with nothing filled | live | |

#### Approval link and chat apps

Live pages: /yx/approvals (the chat apps card) and /yx/act/[token] (the approval link from an email or chat card).

| story (sub-page) | verdict | note |
|---|---|---|
| ChatApps · Chat apps · Teams linked, a card sent (demo) | live (gap) | only with the dev fake transport (`APPROVAL_CHANNELS=dev-fake`, never in production); no real Teams / Slack app yet |
| ChatAppsNone · Chat apps · none linked (production) | live | production shows no typed linking |
| ChatAppsMissing · Chat apps · Link pressed with no account | live (gap) | the typed account box exists only with the dev fake transport |
| ChatAppsFailed · Chat apps · linking refused | live | the server refuses a typed link outside the dev fake |
| LinkOpen · Approval link · open | live | `GET workflow/act/:token` |
| LinkRejectMissing · Approval link · not approving, sent with no reason | live | |
| LinkFailed · Approval link · the server refuses | live | |
| LinkDone · Approval link · done | live | `POST workflow/act/:token`; the token is single use |
| LinkSignIn · Approval link · sensitive, sign in to decide | live | |
| LinkClosed · Approval link · already closed | live | |
| LinkInvalid · Approval link · not valid | live | |
| LinkLoading · Approval link · loading | live | |

#### Batch 4 standalone and privacy

| story (sub-page) | verdict | note |
|---|---|---|
| PeopleList · People List | live | /yx/desk/people-list (`desk.directory.manage`) |
| Privacy · Privacy | live | /yx/desk/privacy (`desk.desk.create`) |
| GetStarted · Get Started | live | `SetupStart` inside /yx/desk/setup |
| KnownIssues · Known Issues | live | /yx/desk/known-issues |
| SignUp · Sign Up | live | /yx/start, `POST desk/signup` |
| PersonTooEarly · People list · Add person pressed with nothing filled | live | |
| SourceTooEarly · People list · Connect LDAP pressed with nothing filled | live | |
| RefuseTooEarly · Privacy · Refuse pressed with no note | live | |
| PrivacySaved · Privacy · what we keep saved (toast) | live | |
| GetStartedTooEarly · Get started · Create desk pressed with nothing filled | live | |
| SignUpTooEarly · Sign up · Start free trial pressed with nothing filled | live | |

#### HLP-04 Knowledge

Live page: /yx/desk/knowledge renders `KnowledgeScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| Articles · SD-1.24 Spaces and articles | live | `GET desk/kb/spaces`, `/articles` |
| Editor · SD-1.24 Article editor with review | live | versions, submit, review (`desk.kb.publish`) |
| Author · SD-1.24 Article editor · author only | live | `desk.kb.author` without publish: no publish, no gaps |
| EditorTooEarly · SD-1.24 Article editor · Save draft pressed with no title | live | |
| EditorSaved · SD-1.24 Article editor · draft saved (toast) | live | |
| NewCategoryTooEarly · SD-1.24 Categories · Add category pressed with no name | live | |

#### Contact YukthiX (SD-1.31)

Live page: /yx/support (Security › Contact YukthiX), with `org.yukthix_support.raise`.

| story (sub-page) | verdict | note |
|---|---|---|
| Contact · Contact YukthiX | live | `GET desk/support/yukthix/tickets` |
| Empty · Contact YukthiX · no tickets | live | |
| SendTooEarly · Contact YukthiX · Send pressed with nothing written | live | |
| Sent · Contact YukthiX · sent, the number in a toast | live | `POST desk/support/yukthix/tickets` |

## 4a. HLP-01 rules built (round 1)

- **Who:** everyone signed in to the company (the requester's implicit role, no key); every route returns only the
  person's own tickets (raised by them, raised for them, or followed). Someone acting for another person gets 403 and
  the page shows the no-access state. Agents and desk admins see their desk's tickets on /yx/desk/tickets, never here.
- **Resolution promise** (product default): the badge shows the resolution timer only (never internal targets or
  reasons, as US-G-016), as business minutes used of the target on the desk's calendar, the same clock the agent sees;
  "paused" while the ticket waits on the person. On track under 80 %, at risk from 80 %, missed at 100 % (the design's
  rule). Unit-tested in the page, e2e-tested on the server.
- **Close and reopen:** the desk's own settings, set in Desk set-up: `autoCloseDays` (default 3) and
  `requesterCanReopen` + `reopenWindowDays` (default 7, counted from the day it was solved). A reply inside the window
  reopens the ticket; after it a reply starts a follow-up ticket (unchanged server rule).
- **Rating:** 1 to 5, once, only by the person who raised it (not a colleague who follows it), on a solved or closed
  ticket. Bad input 400, another company 404.
- **Raise:** topic picks the team (the desk) and its category; a sensitive category is private by default; impact and
  urgency are sent as 3 (the desk's triage sets the priority); files go to the new ticket after it is made, each
  virus-checked, at most the desk's size and types.
- **Plain refusals stay on the page**; every success is a toast; Raise ticket and Send rating are never disabled
  (pressed too early they say what is missing and focus the field).

## 5. Two designs for one job

HLP-02 … 05 (founder-approved Helpdesk designs, `screens/ops/helpdesk.tsx`) and the Service desk designs (Phase 3b-1,
"HLP-04 Knowledge", "Reports (HLP-05)") draw the same four jobs twice:

| job | HLP design (not live) | B design (live) | live page |
|---|---|---|---|
| agent's ticket list | HLP-02 `AgentDeskScreen` | `DeskTicketsScreen` | /yx/desk/tickets |
| one ticket | HLP-03 `TicketWorkspaceScreen` | `TicketScreen` + `TicketWorkRail` | /yx/desk/tickets/[id] |
| knowledge articles | HLP-04 `KbEditorScreen` | `KnowledgeScreen` | /yx/desk/knowledge |
| SLA view | HLP-05 `SlaDashboardScreen` | `ReportsScreen` | /yx/desk/reports |

The B screens do more today (board layout, saved views, collaborators, ESM rails, spaces, gaps, report library, walls,
surveys). The HLP screens are the founder-approved look, sample-only.

## 6. Questions for the founder

1. **Which design wins for HLP-02 … 05?** *Suggested:* the HLP-NN ops design, the founder-approved one, the same as
   Expenses. Wire each HLP screen with a `live` prop to the server that exists; first draw HLP stories for the states
   only the B screen has (board, saved views, collaborator notes, request panel, document signing, spaces, report
   library, walls, surveys), kit first; then delete the B screen and its stories, as Expenses did with its stand-ins.
2. **Pages with no design at all** (catalogue, live chat, desk team, set-up admins: 117 "Live ·" stories). *Suggested:*
   design them in the HLP look after HLP-02 … 05, most-used first (catalogue, then chat).
3. **HLP-06 … 14 need law decisions before a server.** *Suggested:* one founder session per area: the POSH Act 2013
   (internal committee, 90-day inquiry, who sees what), whistleblower and grievance redressal (Industrial Relations Code
   grievance committee, the clock), disciplinary steps (standing orders, show-cause), accident reporting (ESIC accident
   report, Employees' Compensation Act claims, Factories Act / OSH Code notices), collective disputes (Industrial
   Disputes Act conciliation, settlements). Every policy choice gets a default and a company setting.
4. **Chat apps.** Real Teams and Slack apps are not built (dev fake only). *Suggested:* keep the dev fake for demos;
   build the real apps when a customer asks.

5. **HLP-01: "How soon do you need it?"** The old page asked it (Whenever … Right now); the approved design does not,
   so the live page sends "this week" and lets the agent set the priority. *Suggested:* keep the design; add the
   question back only if agents ask (it goes into the design first).
6. **HLP-01: "Reopen ticket"** opens the ticket, where a reply reopens it (the server rule needs a reply, so the team
   knows what is still wrong). *Suggested:* keep.
7. **HLP-01: the assistant rail.** No help assistant exists on the server; the card says "The assistant is not
   switched on yet." *Suggested:* keep until the AI wave; the Default story's assistant thread is the one gap.
8. **HLP-01: extras kept from the old page** (known issues with Me too, reading aids, My data, the chat offer,
   WhatsApp / SMS help) are drawn as 4 new HLP-01 stories in the design's layout. *Suggested:* keep.
9. **HLP-01: the resolved card shows one ticket** (the newest that can still be rated or reopened), as the design.
   *Suggested:* keep; older ones are rated from the ticket page.

## 7. Next pages (recommended order, with sizes)

| order | page | size | why |
|---|---|---|---|
| 1 | HLP-02 Agent desk | M | most used by agents; design and server exist; replace `DeskTicketsScreen` at /yx/desk/tickets (draw board and saved views first) |
| 2 | HLP-03 Ticket workspace | L | design and server exist; replace `TicketScreen`; the rail must take the 4 stand-in cards (request panel, ESM rail, KB card, escalate) |
| 3 | HLP-04 Knowledge base editor | M | design and server exist (versions, review due); replace `KnowledgeScreen` (draw spaces and gaps first) |
| 4 | HLP-05 SLA dashboard | M | server has SLA timers and reports; add the per-queue at-risk view to /yx/desk/reports and fold the report tabs into the HLP look |
| 5 | Request tracker and documents (help/[id]) | S | draw in HLP-01's look, replace `RequestTracker`, `MyDocumentsCard` |
| 6 | Service catalogue | M | live stand-in `CatalogScreen` with 9 "Live ·" stories; needs a design |
| 7 | Live chat (requester and agent) | M | stand-ins `RequesterChatScreen`, `AgentChatScreen`; needs a design |
| 8 | Desk team and the set-up admins | L | stand-ins `TeamScreen` and 7 set-up admins (41 "Live ·" stories); needs designs per tab |
| 9 | HLP-10 + HLP-11 Policy library and admin | L | no server; most staff touch it (acknowledgements); reuse the desk signing code for one-time codes; founder decisions on audience and quiz |
| 10 | HLP-06 Speak-up filing | L | no server; needs POSH Act 2013 internal committee and whistleblower decisions; public no-login route |
| 11 | HLP-08 + HLP-07 + HLP-09 Cases, my cases, ethics desk | XL | no server; one case engine for grievance, disciplinary and whistleblower cases, members, conflict check, clocks; standing orders and show-cause decisions |
| 12 | HLP-12 Accident case | L | no server; ESIC accident report, EC Act claim interest, Factories Act / OSH Code notices |
| 13 | HLP-13 Collective dispute | L | no server; Industrial Disputes Act conciliation and settlement to payroll arrears |
| 14 | HLP-14 Write policies with AI | L | no server; after HLP-10; law findings need a reviewed rule set |

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Helpdesk
and Service desk design story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/helpdesk-design-map.md and checks that
// every Helpdesk (screens/ops/hlp-NN) and Service desk design story file has exactly one row per story, in file order.
const fs = require('fs');
const OPS = 'packages/yx-ui/src/screens/ops/', DESK = 'packages/yx-ui/src/screens/desk/';
const DESK_FILES = ['desk', 'reports', 'approval-links', 'people-privacy', 'knowledge', 'yukthix-support'].map((f) => DESK + f + '.stories.tsx');
const files = [...fs.readdirSync(OPS).filter((f) => /^hlp-\d+\.stories\.tsx$/.test(f)).map((f) => OPS + f), ...DESK_FILES];
const want = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const title = s.match(/title:\s*'Screens\/(?:Helpdesk|Service desk)\/([^']+)'/)[1];
  want[title] = [...s.matchAll(/^export const (\w+)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/helpdesk-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0], c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

## Founder answers, 3 Nov 2026 (HLP-01, "all good")
(1) For HLP-02 … 05 the HLP design wins; the extra Service desk states are drawn into it first. (2) "How soon do you need
it?" stays off the raise form; the agent sets the priority. (3) "Reopen ticket" opens the ticket; a reply there reopens it.
(4) The assistant rail says "not switched on yet" until an assistant exists. (5) Keep the 4 extra HLP-01 stories (known
issue, article open, chat offer, no access). (6) The resolved card shows only the newest ticket that can be rated or
reopened. (7) HLP-06 … 14 (POSH and the internal committee, whistle-blower, disciplinary steps, accident reporting,
industrial disputes): one founder decision session per area before any server work.
