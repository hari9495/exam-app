# Helpdesk and Service desk: live pages and their designs (check)

This file checks, story by story, that every Helpdesk / Service desk design sub-page can be reached in the live app.
People, Pay, Time, Performance and Expenses were checked the same way (see `expenses-design-map.md` and the others).
Founder rule: never build a second, simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-hlp-02`): two sets of designs cover the same jobs. **A.** The founder's
Helpdesk designs HLP-01 … 14 (`packages/yx-ui/src/screens/ops/helpdesk.tsx`, `cases.tsx`, `cases-more.tsx`) and **B.**
the Service desk designs built with the desk server (`packages/yx-ui/src/screens/desk/*`). Every live page under
/yx/desk renders a B screen (or a stand-in copy) except /yx/desk/help, which now renders the designed HLP-01 screen
with `live` (round 1), and /yx/desk/tickets, which now renders the designed HLP-02 agent desk with `live` (round 2;
its stand-in `DeskTicketsScreen` in `screens/desk/tickets.tsx` is deleted with its 3 Phase 3b-1 stories and 3 tests).
The HLP-01 stand-in (desk `HelpCentreScreen` in `screens/desk/help.tsx`) is deleted with
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
| A. Helpdesk HLP-01 … 14 | 14 | 128 | 3 | 0 | 53 | 0 | 184 |
| B. Service desk designs | 5 | 54 | 2 | 0 | 0 | 0 | 56 |
| **All Helpdesk groups (A–B)** | **19** | **182** | **5** | **0** | **53** | **0** | **240** |
Round 10 recount (script, 3 Nov 2026, `feat/yukthix-hlp-10-11`, from `test/yukthix-main` without the HLP-03 branch):
HLP-10 has 13 stories (the 10 approved plus 3 drawn: typed name, a newer version, no access): 12 live, 1 live (gap)
(the quiz). HLP-11 has 22 stories (the 6 approved plus 16 drawn for the real records' states), all live.
Round 3 recount (script, 3 Nov 2026, `feat/yukthix-hlp-03`): HLP-03 has 18 stories (the 6 approved plus 12 drawn for
the old workspace's states), all live; Phase 3b-1 loses the stand-in's 4 stories (Workspace, WorkspaceCollaborator,
WorkspaceUnverified, ReplyTooEarly) and has 26; esm-live loses the 16 "Live ·" stories of the ticket side cards and the
escalate dialog (94 left).
Round 2 (HLP-02):
Round 4b (script, 3 Nov 2026, `feat/yukthix-hlp-04b`): Phase 3b-1 gains 1 story (Desk set-up · Settings · check help
articles again every), live.
Round 4 recount (script, 3 Nov 2026, `feat/yukthix-hlp-04`): HLP-04 has 24 stories (the 3 approved plus 21 drawn for
the old knowledge screen's states): 23 live, 1 live (gap) (Review due: the design's group audience). The Service desk
group "HLP-04 Knowledge" (6 stories) is deleted with its stand-in `KnowledgeScreen`, so B has 5 groups; the script no
longer reads `knowledge.stories.tsx`.
Round 5b (script, 3 Nov 2026, `feat/yukthix-hlp-05b`): Phase 3b-1 gains 1 story (Desk set-up · Settings · at risk from
(per desk)), live.
Round 5 recount (script, 3 Nov 2026, `feat/yukthix-hlp-05`): HLP-05 has 20 stories (the 3 approved plus 17 drawn for
the old reports page's tabs and states), all live; Reports (HLP-05) loses the stand-in's 14 stories and keeps the wall
screen's 2.

Round 2 recount (script, 3 Nov 2026, `feat/yukthix-hlp-02`): HLP-02 has 20 stories (the 10 approved plus 10 drawn for
the old agent screen's states), all live; Phase 3b-1 loses the stand-in's 3 stories (Tickets, Board,
NewTicketTooEarly) and has 30.
Round 1 (HLP-01):

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
| /yx/desk/tickets | the designed `AgentDeskScreen` (HLP-02) with `live`: views, filters (queue, priority, status, raised), table or board, quick view, bulk for team leads, move to another queue, new ticket for an employee, CSV | HLP-02 | `GET desk/tickets` (`desk.ticket.view`; now with `firstResponse`, `resolution`, `firstResponseAt`, and `createdFrom` / `createdTo`), `GET/POST desk/views` (`desk.ticket.view`), `POST desk/tickets`, `/:id/assign`, `PATCH desk/tickets/:id` (`desk.ticket.work`), `POST desk/tickets/bulk` (`desk.ticket.bulk`, lead of the desk), `POST desk/tickets/:id/move` (`desk.ticket.move`), `GET desk/tickets/export` (`desk.ticket.export`) | live |
| /yx/desk/tickets/[id] | `TicketScreen` with `TicketWorkRail`, `ResolveDialog`, `EscalateDialog`, `RequestPanel`, `TicketEsmRail`, `TicketKbCard` (the last four are stand-ins) | Phase 3b-1 Workspace; HLP-03 not wired | `GET desk/tickets/:id`, `/timeline`, `/context`, `/sla`, `/work` (`desk.ticket.view`), `POST …/messages` (`desk.ticket.work` or `desk.ticket.note`), `/resolve`, `/escalate`, `/assign` (`desk.ticket.work`), `/merge` (`desk.ticket.merge`) | live (B); wire design (HLP-03) |
| /yx/desk/knowledge | `KnowledgeScreen` (spaces, articles, editor with review, gaps, recycle bin) | HLP-04 Knowledge; HLP-04 Knowledge base editor not wired | `GET desk/kb/spaces`, `/articles` (`desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish`), `POST desk/kb/articles`, `/versions`, `/submit` (`desk.kb.author`), `/review`, `/retire` (`desk.kb.publish`), `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`) | live (B); wire design (HLP-04) |
| /yx/desk/knowledge (?article=) | the designed `KbEditorScreen` (HLP-04) with `live`: the article list per space, the article editor with four-eyes review, compare, preview, details, translations; categories, blocks, templates, content gaps and the recycle bin as tabs | HLP-04 | `GET desk/kb/spaces`, `/articles` (`desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish`), `POST desk/kb/articles`, `/versions`, `/submit`, `PATCH desk/kb/articles/:id` (now with `keywords`, `assistantUse`), `POST …/reviewed` (new) (`desk.kb.author`), `/review`, `/retire`, `/republish`, `DELETE` (`desk.kb.publish`), `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`) | live |
| /yx/desk/reports | `SlaDashboardScreen` with `live` (HLP-05; menu Helpdesk › SLAs); the report tabs (desk numbers, KPIs, library, self-service, my reports, walls, customers, NPS surveys) inside it | HLP-05 SLA dashboard | `GET desk/reports/sla` (new, `desk.report.view`), `GET desk/reports/*` (`desk.report.view`), custom reports, schedules, wallboards, KPI targets (`desk.report.manage`), `GET/POST desk/surveys` (`desk.survey.manage`), Reassign `POST desk/tickets/:id/assign` (`desk.ticket.assign` to show it); no-access state without either | live (HLP-05) |
| /yx/desk/policies (?policy=) | the designed `PolicyLibraryScreen` (HLP-10) with `live` | HLP-10 | `GET desk/my/policies`, `/:id`, `/:id/files/:fileId`, `POST …/versions/:versionId/code`, `POST …/acknowledge` (implicit: one's own policies; 403 while acting for someone else) | live |
| /yx/desk/policy-admin (?policy=) | the designed `PolicyAdminScreen` (HLP-11) with `live` | HLP-11 | `GET desk/policies`, `/:id`, `/:id/pending`, `/:id/files/:fileId` (`policy.manage` or `policy.publish`), `GET /options`, `POST`, `PATCH /:id`, `PUT /:id/draft`, `POST /:id/draft/files`, `/remove`, `/submit`, `/remind`, `GET /:id/evidence` (`policy.manage`), `POST /:id/publish`, `/send-back` (`policy.publish`); every route needs the key for the whole company | live |
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

The design-live guard (`packages/yx-ui/src/design-live-guard.known.json`) lists 14 desk screens (18 before HLP-03, which took `EscalateDialog`, `RequestPanel`, `TicketEsmRail` and `TicketKbCard` into its design; 20 before HLP-01: `ChatPromptBanner` and `MyChannelsCard` left with their 7 Live stories) under `liveCopies`:
live, but drawn only as "Live ·" pictures in `esm-live.stories.tsx`. Grouped by the design that should replace them:

| stand-in (`liveCopies`) | live page | "Live ·" stories | design that should replace it |
|---|---|---|---|
| `ArticleBody` | /yx/desk/help (inside the article drawer), the portal | Help article (3) | HLP-01 "Article open" now draws it in the Help centre; it stays listed because the portal and agents' knowledge pages still show it only through Live stories |
| `RequestTracker`, `MyDocumentsCard` | /yx/desk/help/[id] | My request (9) | HLP-01 (ticket and request view); no HLP story draws the approval route or documents to sign yet: draw first |
| `CatalogScreen` | /yx/desk/catalog | Catalogue (9) | none; HLP-01's "Raise ticket" is the nearest. Needs a design (service catalogue) |
| `RequesterChatScreen`, `AgentChatScreen` | /yx/desk/chat, /yx/desk/live-chat | Chat (12), Live chat (8), Calls (1) | none (HLP-01's assistant thread is the AI assistant, not live chat). Needs a design |
| `TeamScreen` | /yx/desk/team | Desk team (11) | none (HLP-05 is SLAs, not shifts). Needs a design |
| `CatalogAdmin`, `RulesAdmin`, `LifecycleAdmin`, `ChatQueuesAdmin`, `DeskOrgAdmin`, `SchedulesAdmin`, `MessagingAdmin` | /yx/desk/setup | Set-up (41) | none; the Phase 3b-1 set-up tabs are designs for the rest of the same page. Needs designs per tab |

And under `notLive`: designed, with no live page rendering them. `ops: TicketWorkspaceScreen` (HLP-03; HLP-02 left the list in round 2, HLP-04 in round 4), `ops: SlaDashboardScreen` (HLP-05) have a live page
And under `notLive`: designed, with no live page rendering them. `ops: TicketWorkspaceScreen` (HLP-03; HLP-02 left the list in round 2), `ops: KbEditorScreen` (HLP-04) have a live page (HLP-05 `ops: SlaDashboardScreen` left the list: live)
doing the same job with a B screen (section 5). `ops: SpeakUpScreen`, `ops: CheckReportScreen` (HLP-06), `ops:
MyCasesScreen` (HLP-07), `ops: CaseListScreen`, `ops: CaseWorkspaceScreen`, `ops: LoadingCase`, `ops: ErrorCase`
(HLP-08), `ops: EthicsDeskScreen` (HLP-09), (HLP-10 `PolicyLibraryScreen` and HLP-11 `PolicyAdminScreen` left the list: live)
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

Live page: /yx/desk/tickets (menu Helpdesk › Tickets, with `desk.ticket.view`). The page renders the designed
`AgentDeskScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live part is `screens/ops/helpdesk-desk-live.tsx`. Round
2 (founder answer 1: the HLP design wins): 10 stories were drawn in the same layout for the states the old agent screen
had (board, saved views, change priority, move to another queue, tags, bulk refusals, a new ticket for an employee,
the quick view with both targets, an agent who is not a lead, no access).

| story (sub-page) | verdict | note |
|---|---|---|
| MyOpenTickets · My open tickets | live | the page opens on "My open tickets" (`assignee=me`, open states). Columns as the design: ticket, subject (lock on sensitive or private, VIP and not-verified marks), requester, queue (the desk), category, priority, status, Resolution SLA (new: business minutes used of the target from `GET desk/tickets`), assignee; facts "N in this view · M past the target" |
| AtRisk · At risk or breached view | live | built-in view "At risk or breached" (`breaching`: a target missed, or at risk by the desk's own at-risk point, HLP-05b); the banner's "Show breaching tickets" opens it |
| Unassigned · Unassigned | live | built-in view "Unassigned" |
| QuickView · Row quick view | live | a row opens the design's drawer: requester, priority, assignee, raised (date and channel), first response and resolution targets (new clocks; "Met" once answered or solved); "Assign to me" (`POST desk/tickets/:id/assign`, `desk.ticket.work`, toast) and "Open ticket" |
| Bulk · Bulk selection | live | team leads only (`canBulk`: `desk.ticket.bulk` and lead on that desk): "Assign N to me", "Change priority", "Move to queue", "Add a tag", up to two scenarios; a toast says how many changed |
| ItAgentNoSensitive · IT agent (sensitive tickets hidden) | live | the server lists sensitive and private tickets only to their own team (`visibleTickets`, RLS); desk admins never see them (e2e) |
| Filtered · Filtered to nothing | live | filter bar: queue (when on more than one desk), priority, status, Raised (new `createdFrom` / `createdTo`, India days); "Clear filters" goes back to the view |
| Empty · Empty | live | "No tickets in your queues." |
| Loading · Loading | live | while desks and views load (the table's loading rows) |
| Error · Error | live | either fails; Try again refetches (a 403 shows the no-access state instead) |
| Board · Board · tickets by state | live | new story: the "Show as" Segment's Board; moving a card changes the state through the desk's status for it (a desk without one says so) |
| SavedView · Saved views · my own view open | live | new story: built-in and saved views in the design's view menu; "Save as" (`POST desk/views`, shared only with one desk), toast |
| ChangePriority · Bulk · change priority (with a reason) | live | new story: Segment P1 … P4 and the reason (3 to 300 letters, pressed too early says so); `POST desk/tickets/bulk` |
| MoveQueue · Bulk · move to another queue | live | new story: the desks this desk may forward to (Desk set-up); desk and reason required; each ticket `POST desk/tickets/:id/move` (`desk.ticket.move`); the ones refused are listed |
| AddTag · Bulk · add a tag | live | new story: letters, digits, spaces, dashes, up to 40 |
| BulkRefused · Bulk · some tickets not changed | live | new story: "N changed. M not changed: <ticket>: <reason>" stays on the page |
| NewTicket · New ticket for an employee | live | new story: desk, find the employee, category, subject, what they need (all required but category; pressed too early says so); `POST desk/tickets` (`desk.ticket.work`), then the ticket opens |
| QuickViewLive · Quick view · both response targets, assign to me | live | new story: a ticket past both targets |
| AgentNotLead · Agent (not a team lead) · no bulk selection | live | new story: no tick boxes; row actions Assign to me, Set waiting on employee (the desk's waiting status, pauses the clock, toast), Open ticket (reply, merge, resolve) |
| NoAccess · No access (no desk seat) | live | new story: the API refuses (403) anyone without `desk.ticket.view`; the kit's no-access state |

#### HLP-03 · Ticket workspace

Live page: /yx/desk/tickets/[id] (from Helpdesk › Tickets, with `desk.ticket.view` and a seat on the desk). The page
renders the designed `TicketWorkspaceScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live part is
`screens/ops/helpdesk-ticket-live.tsx`, and the side cards (request and approvals, move / share / documents /
follow-ups, articles, related tickets and the rest of the work rail) sit in the design's rail. Round 3 (founder answer
1): 12 stories were drawn in the same layout for the states the old workspace had.

| story (sub-page) | verdict | note |
|---|---|---|
| Reply · Reply | live | the design's header (subject, number · queue · category · raised date via channel; status, priority, Resolution target badge from the ticket's timers; Wait on employee / Resume, Resolve, Assign to me), Conversation (replies, notes, files, merged messages), Respond with "Reply to <name>" (`POST desk/tickets/:id/messages`, `desk.ticket.work`), files (virus-checked), "Then set the status", toast; pressed with nothing written says so |
| MacroInserted · Reply with saved reply | live | "Insert saved reply": the desk's saved replies (shared and mine) with the first name, number and agent filled in; "Insert an article" adds a link the requester can open |
| InternalNote · Internal note | live | the Internal note tab (`desk.ticket.note`); "Tell colleagues" mentions; notes are marked "Internal note, not visible to <name>" and never reach the requester (e2e) |
| WaitingOnEmployee · Waiting on employee (SLA paused) | live | "Wait on employee" sets the desk's waiting status (toast); the paused note and the paused badge; "Resume" sets the open status |
| Breached · Breached SLA | live | the Resolution badge says "Breached …" from the timer; the breach reason and exclusion are in the rail's Response targets card |
| Resolved · Resolved | live | Resolve opens the resolve dialog (code and note when the desk asks); the resolved note says "Closes on <date> if <name> doesn't reply" (new: `closesOn`, the desk's auto-close days) and the rating (new: `rating`) |
| AgentWorking · Agent · colleague writing, mentions and files | live | new story: who else is on the ticket and who is writing (every 15 seconds); mentions; files |
| RequestApprovals · Request and approvals · ask a colleague to approve | live | new story: the ordered items with their approval route and tasks; "Ask for approval" (any or all, the question; pressed too early says so) |
| MoveShareDocs · Move, share, documents and follow-ups | live | new story: the HR summary, move to another desk (reason), share with another desk, documents to sign, follow-up sequences |
| Articles · Articles used · solved by, out of date, make one | live | new story: articles used on the ticket, "Solved by this", "Out of date" with a reason, make a draft article |
| RelatedTickets · Related tickets, merge, tasks, side conversations, targets, reminders | live | new story: link, merge (the design's "Merge into another ticket"), split, parent, tracker; tasks; side conversations; Response targets with breach reasons; reminders and snooze; hidden personal data |
| Escalate · Move to another support level | live | new story: the header menu's "Move to another support level" (L1 / L2 / L3, group, reason; pressed with no reason says so) |
| ResolveWithCode · Resolve · code and note | live | new story: the resolve dialog |
| ResolvedRated · Resolved · closes on, the rating | live | new story |
| Collaborator · Collaborator · notes only | live | new story: no Reply tab, no work controls (the server refuses a collaborator's reply, e2e) |
| ReadOnly · Desk admin · read only | live | new story: "Read-only: you set this desk up"; no Respond card (the server refuses their notes) |
| SenderUnverified · Email from an unproven sender, customer | live | new story: the warning; customer, plan and product in the rail |
| NoAccess · No access (not on this desk) | live | new story: a 403 shows the no-access state |

#### HLP-04 · Knowledge base editor

Live page: /yx/desk/knowledge (menu Helpdesk › Knowledge base, with `desk.kb.view_internal`, `desk.kb.author` or
`desk.kb.publish`). The page renders the designed `KbEditorScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live
part is `screens/ops/helpdesk-kb-live.tsx`. Round 4 (founder answer 1: the HLP design wins): 21 stories were drawn in
the same look for the states the old Service desk knowledge screen had (the article list, spaces, categories, blocks,
templates, content gaps, recycle bin, four-eyes review, compare, preview, details, read only, no access).

| story (sub-page) | verdict | note |
|---|---|---|
| Published · Published | live | an open article: the design's header (KB-n, by the last writer, updated date, Published badge), title and answer, rail "Where it shows" (space, who can read it, category, "Also suggest for these words", "Use in assistant answers"), "How it's doing" (views 90 days, answered without a ticket, helpful, health), "Versions" with Compare. The primary button is "Publish changes" when another writer's version waits and the viewer is a publisher, else "Send for review" (four eyes) |
| Draft · New draft | live | "New article" starts a draft (`POST desk/kb/articles`, `desk.kb.author`); Save draft (`PATCH desk/kb/articles/:id` for the rail choices, then `POST …/versions`), toast |
| ReviewDue · Review due | live (gap) | review date passed (the company's interval after the article was started or last marked reviewed, YX-GRO-07; default 12 months): "Review due" badge and the banner with Mark reviewed (new `POST desk/kb/articles/:id/reviewed`, `desk.kb.author`: next check after the company's interval, toast). Gap: the design's Audience is a list of groups (Hosur plant, managers); the server's audience is per space (agents, people who ask this desk, public), shown read only (question 13) |
| Articles · Knowledge base · articles in a space | live | new story: `GET desk/kb/spaces`, `GET desk/kb/articles?spaceId=` (search, state Segment, out of date); the space Select; a row opens the article (`?article=`) |
| NewArticle · New article | live | new story: title (required), summary, category, template; "Start the draft" |
| NewSpace · New space | live | new story: `POST desk/kb/spaces` (`desk.desk.create`, or `desk.settings.manage` for one's own desk); who can read it is a Segment; toast |
| NoSpaces · No spaces yet | live | new story |
| Categories · Categories of a space | live | new story: add, rename, move up / down, delete an empty one (`desk.kb.publish`, `desk.settings.manage` or `desk.desk.create`); three levels |
| Blocks · Reusable blocks | live | new story: `GET/POST/PATCH desk/kb/blocks` (publishers change them) |
| Templates · Article templates | live | new story: `GET/POST/PATCH desk/kb/templates` |
| Gaps · Content gaps | live | new story: `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`); article-request task (`desk.task.work`), toast |
| RecycleBin · Recycle bin | live | new story: `GET desk/recycle-bin`, Put back, toast |
| WaitingReview · Publisher · a version waiting for your review | live | new story: banner "Version N by … is waiting for your review" with Compare and Send back |
| PublishConfirm · Publisher · publish the reviewed version | live | new story: the design's publish dialog; `POST desk/kb/articles/:id/review` approve (`desk.kb.publish`, never one's own version), toast |
| SendBack · Publisher · send back with a note | live | new story: note of 3 letters or more; pressed too early says so |
| Compare · Versions · compare with the published one | live | new story: the version beside the one published now (or the one before it) |
| AuthorDraft · Author · own draft, send for review | live | new story: no Publish for an author; Send for review saves, then `POST …/submit` |
| SendTooEarly · Author · Send for review pressed with no answer | live | new story: the field says why and takes the focus |
| ReviewDueLive · Review due · mark reviewed | live | new story |
| OutOfDate · Marked out of date | live | new story: `POST …/flag` (a reason), shown as a banner; publishing a new version clears it |
| Preview · Preview as employee | live | new story: the editor's own reading view of the current text (its schema keeps only safe tags) |
| Details · Details · web address, dates, owner | live | new story: web address, search title and description, review by, when it expires; featured, publish at, expires at and owner for publishers |
| ReadOnly · Reader (no author rights) · read only | live | new story: `desk.kb.view_internal` only (a desk admin): the article as published, the rail read only |
| NoAccess · No access | live | new story: the API refuses (403) anyone without a knowledge key; the kit's no-access state |

#### HLP-05 · SLA dashboard

Live page: /yx/desk/reports (menu Helpdesk › SLAs, with `desk.report.view` or `desk.survey.manage`). The page renders the
designed `SlaDashboardScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live part is `screens/ops/helpdesk-sla-live.tsx`.
Round 5 (founder answer 1: the HLP design wins): the old reports page's tabs are drawn as tabs under the design's header
(17 new stories); its stand-in `ReportsScreen` is deleted with 14 stories and 6 tests. Response targets are still set
in /yx/desk/setup (SLA tab).

| story (sub-page) | verdict | note |
|---|---|---|
| QueueLead · Queue lead | live | the page opens on "Response targets": the four design cards from `GET desk/reports/sla` (open now; missed now; first response met % with the period before and the weekly trend; answered by an article = the self-service rate), resolution met / missed by queue, the weekly met % with the queue's own target line (one queue chosen), the at-risk table (live resolution clock from the SLA engine, Reassign, a row opens the ticket) and agent load (open, at risk, rating). Period 7 / 30 / 90 days and Queue in the header; Export downloads the "Response targets met" CSV |
| Loading · Loading | live | while permissions or the figures load (card, chart and table skeletons) |
| Empty · Empty (no tickets in period) | live | no open tickets and no target finished in the period |
| Reassign · Reassign an at-risk ticket | live | new story: the queue's agents (`GET desk/desks/:id/team`), not the current one; `POST desk/tickets/:id/assign`, toast "IT-1002 is now with …"; the clock is not restarted |
| NoReassign · Desk admin · no Reassign, sensitive tickets counted but not listed | live | new story: without `desk.ticket.assign` the row offers Open ticket; sensitive and private tickets count in the figures but stay out of the list ("1 more is sensitive or private …") |
| DeskNumbers · Desk numbers (backlog, times, ratings, agents) | live | new story: was the reports Dashboard tab (`GET desk/reports/dashboard`), now design stat cards with drill links, ageing chart and the agents table |
| Kpis · KPIs with targets and forecast | live | new story: `GET desk/reports/kpis/:deskId`; colour in words; the trend and the 7-day forecast as a kit line chart; Set target needs `desk.report.manage` (toast) |
| Library · Report library | live | new story: `GET desk/reports/library`, Run and Download CSV |
| Funnel · Self-service funnel | live | new story: `GET desk/reports/funnel` |
| MyReports · My reports and schedules | live | new story: custom reports and schedules (`desk.report.manage` to change; toasts) |
| Walls · Wall screens | live | new story: make (link shown once) and switch off the secret wall link |
| Customers · Customer reports | live | new story: `GET desk/reports/customers/:accountId` |
| Surveys · NPS surveys | live | new story: `GET/POST desk/surveys` (`desk.survey.manage`) |
| SurveysOnly · Surveys only (no report access) | live | new story: with `desk.survey.manage` but not `desk.report.view` the page opens on Surveys and never asks for the figures |
| Error · Error | live | new story: permissions fail; a tab that fails shows its own Try again |
| NoAccess · No access | live | new story: neither key; the kit's no-access state |
| ReassignTooEarly · Reassign pressed with nobody chosen | live | new story: "Choose who takes the ticket." |
| WallTooEarly · Wall screens · Make the link pressed with nothing filled | live | new story |
| CustomerTooEarly · Customer reports · Show report pressed with no company | live | new story |
| SurveyTooEarly · NPS surveys · Save survey pressed with nothing filled | live | new story |

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

Live page: /yx/desk/policies (menu Helpdesk › Policies, every employee; ?policy=<id> opens one). The page renders the
designed `PolicyLibraryScreen` (`screens/ops/helpdesk.tsx`) with `live`; the live part is
`screens/ops/helpdesk-policy-live.tsx`. Rules: section 4d. Three stories were drawn in the same layout for states only
the real record has (typed name, a newer version published meanwhile, no access).

| story (sub-page) | verdict | note |
|---|---|---|
| ToAcknowledge · To acknowledge | live | `GET desk/my/policies` (implicit: the person's own; the audience covers their job today): pending and overdue with the due date (the company's due days from the later of the effective day and joining), "needs a one-time code"; the overdue banner names the company's manager-reminder days |
| ClickAck · Acknowledge by click | live | the reader drawer (`GET desk/my/policies/:id`): version, effective date, owner, "What changed", the cleaned text, attachments (clean files only, `GET …/files/:fileId`); tick, then Acknowledge (`POST …/acknowledge` with the version read), toast; pressed too early the tick says so and takes the focus |
| OtpAck · Critical policy · one-time code | live | "Send code to acknowledge" (`POST …/versions/:versionId/code`): 6 digits to the sign-in email (5 minutes, the send limits of letters); the design's "by SMS" reads "by email" (like letters) |
| QuizAck · Quiz · one wrong answer | live (gap) | no quiz on the server (the design's quiz comes from Learning, not built): a policy is acknowledged by confirmation or one-time code (question 17) |
| Acknowledged · Acknowledged | live | "You acknowledged vN on <date> by <method>"; the record (version, text fingerprint, time, method, typed name, IP, device) cannot be changed or deleted by the app (e2e) |
| UpToDate · Empty (nothing to acknowledge) | live | "Nothing to acknowledge." |
| Loading · Loading | live | while `GET desk/my/policies` loads |
| Error · Error | live | "Try again" refetches (a 403 shows the no-access state instead) |
| Phone · Policies · phone | live | under 768 px: the design's phone layout (the two lists) |
| PhoneOtp · One-time code · phone | live | under 768 px the reader and the code step fill the phone screen |
| TypedName · Acknowledge · type your name (company setting) | live | new story: `policy.ack.typed_name` on: the name as on the record (any case, any spacing), refused otherwise (400) |
| NewerVersion · A newer version was published meanwhile | live | new story: acknowledging an older version is refused (409 `POLICY_NEWER_VERSION`); "Read the new version" reloads it |
| NoAccess · No access (acting for someone else) | live | new story: every `desk/my/policies` route refuses (403) anyone acting for someone else |

#### HLP-11 · Policy admin

Live page: /yx/desk/policy-admin (menu Helpdesk › Policy admin, with `policy.manage` or `policy.publish` held for the
whole company; ?policy=<id> opens one). The page renders the designed `PolicyAdminScreen` with `live`. Sixteen stories
were drawn in the same layout for states only the real records have (the list, a new policy, writing a version, the
second person, sent back, the drill-down, editing the audience, not published yet, loading, error, no access).

| story (sub-page) | verdict | note |
|---|---|---|
| Acknowledgement · Acknowledgement % | live | `GET desk/policies/:id`: the design's header (version, effective, owner, Published, "Critical: one-time code"; facts Acknowledged %, Audience, Pending, Due), the meter, "Acknowledged by department" (groups under 5 hidden) and a "By department" table whose row opens the pending people of that department |
| Pending · Pending people · remind | live | `GET desk/policies/:id/pending` (most overdue first; manager, due, days overdue, Reminded <date> / Manager told); tick people and "Remind N", or "Send reminder" for all (`POST …/remind`, `policy.manage`; skips anyone reminded today; toast) |
| Versions · Versions | live | every published version: effective, what changed, asked again, written / published by, acknowledged |
| Audience · Audience & method | live | entities, locations, departments (with the ones under them), grades from the org structure (`GET desk/policies/options`, `PATCH desk/policies/:id` with the row version), the method, and the company's rules read from the settings |
| PublishReack · Publish new version · re-acknowledge | live | the design's dialog is the publisher's step (`POST …/publish`, `policy.publish`, never the writer while `policy.publish.second_person` is on, also a DB check); the re-acknowledge switch sits on the version being written (default from `policy.reack.default`) |
| AllDone · Everyone acknowledged | live | "Everyone has acknowledged." |
| PolicyList · All policies | live | new story: `GET desk/policies`; a row opens the policy |
| NoPolicies · No policies yet | live | new story |
| NewPolicy · New policy | live | new story: title, kind, method; `POST desk/policies` (a title used before is 409); toast, then the version tab |
| NewPolicyTooEarly · New policy · Make pressed with nothing filled | live | new story |
| Write · Write a new version (text, what changed, attachments) | live | new story: the kit editor (server allow-list), "What changed", re-acknowledge, attachments (`POST …/draft/files`, PDF / Word / image, 10 MB, virus-checked); Save draft (`PUT …/draft`), Send to be published (`POST …/submit`), toasts |
| WriteTooEarly · Send to be published pressed with no “what changed” | live | new story |
| WaitingWriter · Writer · waiting for a second person to publish | live | new story: "You wrote vN, so another publisher publishes it." |
| PublishLive · Publisher · publish the waiting version | live | new story |
| SendBack · Publisher · send back with a note | live | new story: `POST …/send-back` (note 3 to 500 letters) |
| SentBack · Writer · sent back with the note | live | new story |
| PendingByDept · Pending people · one department (drill-down) | live | new story |
| AudienceEdit · Audience & method · change who it applies to | live | new story |
| NotPublished · New policy · not published yet | live | new story |
| Loading · Loading | live | new story |
| Error · Error | live | new story |
| NoAccess · No access | live | new story: no key, or a key granted for one legal entity only (403) |

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
| Setup · Desk set-up | live | /yx/desk/setup renders DeskSetupScreen |
| SetupKbReview · Desk set-up · Settings · check help articles again every | live | HLP-04b (founder 3 Nov 2026): Settings tab, company's Service Desk owner (`desk.desk.create`): Segment 3, 6, 12 or 24 months; `GET/PUT desk/kb/settings` (registry `desk.kb.review_months`, default 12), toast |
| SetupAtRisk · Desk set-up · Settings · at risk from (per desk) | live | HLP-05b (founder 3 Nov 2026): Settings tab, `desk.settings.manage` like the other desk settings: Segment 50 / 60 / 70 / 80 / 90 % (default 80), saved with Save settings (`PATCH desk/desks/:id`, version check, audited), toast |
| Calendar · SD-1.11 My calendar | live | /yx/desk/calendar; the calendar feed link can be made and revoked |
| SlaSetupTab · SD-1.14 Response targets (desk set-up tab) | live | /yx/desk/setup, SLA tab (`desk.sla.manage`) |
| EmailSetup · SD-1.18 Email (desk set-up tab) | live | /yx/desk/setup, Email tab (`desk.mailbox.manage`) |
| PortalSetup · SD-1.21 Help pages (desk set-up tab) | live | /yx/desk/setup, Help pages tab (`desk.portal.manage`) |
| BannerSetup · SD-1.23 Banners (desk set-up tab) | live | /yx/desk/setup, Banners tab |
| Customers · SD-1.22 Customers | live | /yx/desk/customers |
| HelpDrawerOpen · US-B-100 In-app Help drawer | live | `HelpDrawer` on every signed-in page (`desk-help.tsx`) |
| PortalLogin · US-G-021 Outside portal · sign in | live | /yx/portal/[org]/[portal] renders PortalScreen |
| PortalHomeStory · US-G-021 Outside portal · my tickets | live | the portal's own sign-in, then my tickets |
| PortalTicketStory · US-G-021 Outside portal · one ticket | live | |
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

Live page: the wall screen at /yx/wall/[org]/[token]. The report tabs moved into HLP-05 SLA dashboard (round 5); their 14
stories were deleted with `ReportsScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| Wall · Wall screen (TV) | live | /yx/wall/[org]/[token], counts only, no session |
| WallOff · Wall screen · switched off | live | a revoked link |

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

## 4b. HLP-02 rules built (round 2)

- **Who:** `desk.ticket.view` lists tickets; the server lists only what the person may see (their desks; sensitive and
  private tickets only to their own team, never to desk admins; RLS). Changing many at once needs `desk.ticket.bulk`
  and being a team lead of that desk (`canBulk` per row; an agent gets no tick boxes). Assign to me and Set waiting need
  `desk.ticket.work`; moving to another desk `desk.ticket.move` and the desk's own forward list. No seat: 403 and the
  no-access state.
- **Clocks** (product default): first response and resolution as business minutes used of the target on the desk's
  calendar (the same engine as the ticket page); at risk from the desk's at-risk point (HLP-05b, default 80 %), missed at 100 %; paused while
  waiting on the employee. The banner counts tickets in the view with a missed target.
- **Raised filter:** India days, both ends included; a bad or reversed range is refused (400).
- **Built-in views** take the design's names: My open tickets, Unassigned, At risk or breached (missed, or at risk by
  the desk's at-risk point), Waiting on employee, All open, Snoozed by me, All in my queues.
- Every success is a toast; bulk refusals stay on the page with each ticket and its reason; no button is greyed out
  (pressed too early, the field says why).

## 4c. HLP-04 rules built (round 4)
- **Who:** reading needs `desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish` and a space one may read
  (company-wide, or a desk one is on). Authors (`desk.kb.author`) write drafts, send them for review, set the "Where it
  shows" choices and mark a published article reviewed. Publishers (`desk.kb.publish`) publish, send back, retire, put
  back and delete, and set featured, dates and owner; never their own version (four eyes, also in SQL). A desk admin
  with only `desk.kb.view_internal` reads. No key: 403 and the no-access state. Another company: 404.
- **Keywords** ("Also suggest for these words", new column `keywords`, migration `20261590000000_kb_article_keywords`):
  letters, digits, spaces and commas, up to 300; cleaned on the server (trimmed, one space, no repeats in any case);
  search finds a published article by them, weighted like the title.
- **Use in assistant answers** (new column `assistant_use`, default on): kept per article; the help assistant is not
  built, so it changes nothing yet (the switch says so).
- **Mark reviewed** (YX-GRO-07): only a published article; the next review is the company's interval from today (India
  date), in calendar months (31 Aug + 6 → 28 or 29 Feb); audited with the old and new date; a stale version is 409.
- **Review interval** (founder 3 Nov 2026, round 4b): company setting `desk.kb.review_months` in the settings registry:
  3, 6, 12 or 24 months, default 12. Changed in Desk set-up › Settings by the company's Service Desk owner
  (`desk.desk.create`, `PUT desk/kb/settings`) or in the Settings registry (`org.settings.manage`); both audited. A new
  article and Mark reviewed take it; review dates already set stay as they are (they may have been set by hand).
- Save draft saves the rail choices first (`PATCH`, with the article's version), then the words as a version. Every
  success is a toast; refusals stay on the page; no button is greyed out (pressed too early, the field says why).
- Article text is cleaned on the server (sanitize-html allow-list). The preview of unsaved text uses the editor's own
  reading view, never raw HTML.
## 4c. HLP-05 rules built (round 5)
- **Who:** `desk.report.view` sees the figures for the desks they lead, work or run (the Service Desk admin: every
  desk); collaborators and employees get 403 and the no-access state. `desk.survey.manage` alone opens on Surveys.
  Reassign shows with `desk.ticket.assign`; the server checks the assign itself. Another company's desk id is 404.
- **Figures** (`GET desk/reports/sla`, India dates, both ends included, a year at most): open now and missed now;
  at risk = the desk's at-risk point of the resolution target used (HLP-05b), missed = 100 %, paused while waiting on
  the employee (the HLP-02 rule);
  the clock is the SLA engine's own business-minute maths (`SlaService.clocks`, no second implementation). Met % counts
  targets kept or missed in the period, excluded ones left out (the dashboard's rule); the change is against the same
  number of days just before. "Answered by an article" is the self-service rate (solved by an article, of those solved
  by an article or raised as a ticket). Weeks start on Monday (India). The target line is the queue's own resolution
  target (Desk set-up › SLA), shown only with one queue chosen.
- **Privacy:** counts cover every ticket of the desks (YX-HD-03: numbers show); the at-risk list holds only tickets the
  person may open, and says how many more stay with their own team.
- **Limit:** the newest 5000 open tickets get a live clock (code note `shortcut:`); a bigger desk set needs a stored
  clock state.
- No new table and no migration. Success is a toast; nothing is greyed out.

## 4d. HLP-05b rules built (the at-risk point per desk)
- **Setting:** `sd_desks.at_risk_percent`, one of 50, 60, 70, 80, 90 (default 80; a CHECK in the database, the same
  five in the API, anything else including null is 400). Migration `20261620000000_sd_desk_at_risk_percent` (adds a
  column with a default to a table that already has RLS; no data change). A copied desk keeps it.
- **Who:** set in Desk set-up › Settings with the other desk settings: `desk.settings.manage` and desk admin on that
  desk (or the Service Desk admin); agents, leads and employees 403; another company's desk 404. Optimistic version
  check (409); audited as `desk.desk.updated` with before and after.
- **One rule:** `clockState` (api `sla.service.ts`) and `slaState` (kit `ops-rules.ts`) read the desk's point, which
  every clock now carries (`atRiskPercent` in `GET desk/tickets`, `GET desk/reports/sla`, `GET desk/tickets/:id/sla`
  and the help centre's clocks). Used by the HLP-05 cards and at-risk table, the HLP-02 "At risk or breached" view
  (it was "missed or due within 4 hours") and the row and quick-view badges, and the ticket page and help-centre
  badges. Missed stays at 100 %.
## 4d. HLP-10/11 rules (policy library, acknowledgement and policy admin)
Written before the build (3 Nov 2026, `feat/yukthix-hlp-10-11`). Founder answer 7 (3 Nov) asks for care in law areas:
this feature only records that a policy was shown and acknowledged; it decides nothing legal. Every legal hook below is
marked **verify with counsel**, and no legal figure is in code (every number is a company setting).
**What the app does and why.** HR writes the company's policies (code of conduct, POSH, leave, IT security …) as rich
text with attachments. Every change is a new version with a short "what changed". A version goes live only after a
second person publishes it (maker-checker, like letters), and a published version never changes again. Each policy has
an audience built from the existing org structure. The people in it see the policy under Helpdesk › Policies, read the
exact version and acknowledge it. The app keeps who acknowledged which version, when, how and from where. The app
cannot change or delete that record. HR sees completion per policy and per department, sends reminders, and exports
the record as evidence that the policy was communicated.
**Indian legal hooks the app supports (it does not replace any of them):**
- **POSH Act 2013** (Sexual Harassment of Women at Workplace Act): the employer must have a written policy against
  sexual harassment and make it known to employees, with the Internal Committee and how to complain. The app publishes
  it, keeps the acknowledgements and shows who has not read it. It does not set up the Internal Committee or replace
  displaying the notice at the workplace. **Verify with counsel.**
- **Industrial Employment (Standing Orders) Act 1946** (and the Industrial Relations Code 2020 once in force): certified
  standing orders are displayed at the workplace in English and the local language. **State Shops and Establishments
  Acts**: some states ask for notices and abstracts to be displayed; a few accept electronic display. The app's copy and
  acknowledgements add to the notice board; they do not replace it. Which states accept an electronic notice is a
  per-state question. **Verify with counsel.**
- **IT Act 2000** (sections 4 and 10A): electronic records and agreements made electronically are valid. A click, a
  typed name or a one-time code is not an "electronic signature" under section 3A (that needs Aadhaar eSign or a DSC),
  so the record is proof that the policy was shown and accepted, not a signed contract. **Verify with counsel.**
- **Evidence** (Indian Evidence Act 1872 section 65B, Bharatiya Sakshya Adhiniyam 2023 section 63): an electronic record
  used in a hearing needs a certificate about the system that made it. The export carries, per acknowledgement, the
  version, the SHA-256 fingerprint of the exact text read, the time (IST), the method, the typed name, the IP and the
  device, so the company can give that certificate. A one-time code makes the record stronger than a click.
  **Verify with counsel.**
- **DPDP Act 2023**: an acknowledgement holds personal data (name, time, IP, device). It is kept for employment
  compliance (a legitimate use for employment, section 7), shown to the person, and kept no longer than needed.
  Retention is not built yet (question). **Verify with counsel.**
**Company settings** (Settings registry, `org.settings.manage`, company-wide, every change audited; the default is
**Company settings** (Settings › Company rules › Company policies; `org.settings.manage`, company-wide, every change audited; the default is
what a new company gets):
| setting | default | choices | what it does |
|---|---|---|---|
| `policy.ack.due_days` | 14 | 7, 14, 15, 30, 45, 60 | days to acknowledge, from the version's effective date or the person's joining date, whichever is later |
| `policy.reminder.every_days` | 3 | off, 1, 2, 3, 7 | a pending person is reminded every this many days |
| `policy.reminder.manager_after_days` | 7 | off, 3, 7, 14, 30 | the manager is told once when someone is this many days overdue |
| `policy.reack.default` | on | on, off | whether "Ask everyone to acknowledge again" starts switched on for a new version |
| `policy.ack.typed_name` | off | off, on | the person also types their name as on their record |
| `policy.publish.second_person` | on | on, off | a version is published by someone other than its writer; turning it off loosens a control, so it also needs `access.role.manage` |
**Who:**
- **Employee** (implicit, own records only): sees published policies whose audience covers their current job today,
  reads the current version and its attachments, acknowledges it. Someone acting for another person gets 403.
- **`policy.manage`** (new key; HR Admin template): makes policies, writes and sends versions, sets the audience and
  the method, sees completion, the pending people, sends reminders, exports the evidence. It may be granted per legal
  entity (the HR Admin template's usual scope), but the policy pages need it for the whole company (an entity grant
  gets 403: one policy set serves the company).
- **`policy.publish`** (new key; HR Admin template): publishes or sends back a waiting version, never their own while
  the second-person setting is on (also a database check).
- Anyone else: 403 and the no-access state. Another company's policy: 404.
**Versions:** v1, v2 … Each is a draft, then waiting for publishing, then published (or sent back with a note, then
draft again). One open version per policy. From v2 "What changed" is required (3 to 500 letters). Text is cleaned on
the server (the sanitize-html allow-list of the desk editor); attachments go through the file service (PDF, DOCX, PNG,
JPG, up to 10 MB, virus-checked; only clean files open). A published version never changes (database trigger) and is
never deleted (the app's database role has no delete). The effective date is the publish day (India).
**Audience:** any of legal entities, locations, departments and grades (empty = all), matched against each person's
**Audience:** any of legal entities, locations, departments (with the ones under them) and grades (empty = all), matched against each person's
assignment in force today (the existing org structure). Leavers drop out. Someone moved out of the audience is no longer
pending; their acknowledgements stay on record. A new joiner is in from their joining day.
**Acknowledgement:** a policy needs acknowledging for its latest version that asked for it (v1 always does). A person
is done once they acknowledged that version or a later one. Only the current version can be acknowledged (an older one
is refused, 409, "A newer version …"); once per version per person (a repeat is 409). Methods per policy: confirmation
(tick "I have read and understood", plus the typed name when the setting is on) or one-time code (6 digits to the
sign-in email, 5 minutes, the send limits of letters). The record: person, version, text fingerprint, time, method,
typed name, IP, device. Append-only: the app's database role cannot change or delete it.
**Due and reminders:** due = the later of the version's effective date and the joining date, plus the due days.
Overdue the day after. On publish, everyone who must acknowledge gets a notice. Every morning (09:00 IST) the job reminds
each pending person every N days and tells their manager once at M days overdue; it is safe to run twice. HR's "Send
reminder" reminds the pending people (or the ones ticked) who were not reminded today.
**Export:** CSV of every acknowledgement of every version of one policy (`policy.manage`, audited).
**Defaults the product decided:** policy numbers POL-01 …; categories are free text; department means that department
only, not the ones under it (question); no quiz (question).
**Defaults the product decided:** policy numbers POL-01 …; categories are free text; no quiz (question).

## 5. Two designs for one job

HLP-02 … 05 (founder-approved Helpdesk designs, `screens/ops/helpdesk.tsx`) and the Service desk designs (Phase 3b-1,
"HLP-04 Knowledge", "Reports (HLP-05)") draw the same four jobs twice:

| job | HLP design (not live) | B design (live) | live page |
|---|---|---|---|
| agent's ticket list | HLP-02 `AgentDeskScreen` | done in round 2: the HLP design is live, `DeskTicketsScreen` deleted | /yx/desk/tickets |
| one ticket | HLP-03 `TicketWorkspaceScreen` | `TicketScreen` + `TicketWorkRail` | /yx/desk/tickets/[id] |
| knowledge articles | HLP-04 `KbEditorScreen` | `KnowledgeScreen` | /yx/desk/knowledge |
| SLA view | HLP-05 `SlaDashboardScreen` | done in round 5: the HLP design is live, `ReportsScreen` deleted | /yx/desk/reports |

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

10. **HLP-02: "Merge into another ticket"** (a design row action) opens the ticket, where merge already lives (it needs
    the other ticket chosen and checked). *Suggested:* keep.
11. **HLP-02: "Move to queue"** moves only to the desks this desk may forward to (Desk set-up), one ticket at a time on
    the server, each with the reason. *Suggested:* keep.
12. **HLP-02: the row opens the quick view** (the design), not the ticket page; "Open ticket" is one more click.
    *Suggested:* keep (agents can scan and assign without leaving the list).

13. **HLP-03: the design's "Change queue" and "Merge into another ticket"** menu items are the rail's Move card and
    Related tickets card (they need the desk, the other ticket and a reason). The header menu keeps Change ticket type,
    Move to another support level and the desk's scenarios. *Suggested:* keep.
14. **HLP-03: the design's "Related articles" card** is the live "Articles used" card (articles linked or that solved
    it, out of date, make one); suggesting articles by the subject happens in "Insert an article". *Suggested:* keep.
15. **HLP-03: Details are editable** (status, priority with a reason, assignee, group, category, tags, private) where
    the design shows them read only; an agent who cannot work the ticket sees them as text. *Suggested:* keep.
13. **HLP-04: Audience.** The design picks groups (a plant, an entity, managers); the server decides who reads by the
    space (agents, people who ask this desk, public). The article shows its space's audience, read only. *Suggested:*
    keep spaces for now; add group audiences when a customer needs one article hidden inside a space.
14. **HLP-04: one category per article.** The design allows several; the server keeps one (with sections under it).
    *Suggested:* keep one.
15. **HLP-04: "Publish" for an author.** Four eyes stay: an author's button is "Send for review"; only a publisher who
    did not write the waiting version sees "Publish". *Suggested:* keep.
16. **HLP-04: review every 12 months** is a product rule today. *Suggested:* add a company setting (default 12 months)
    in Desk set-up when a company asks.
13. **HLP-05: the page name.** The menu item and title are now "SLAs" (the design); the page also holds the reports and
    surveys tabs. *Suggested:* keep "SLAs"; rename to "SLAs and reports" only if people can't find the reports.
14. **HLP-05: period choice.** The design offers 7 / 30 / 90 days; the old page had any From / To dates (up to a year)
    for the library and funnel. *Suggested:* keep the design's three; add "Last 365 days" to the design first if
    finance-year reports are asked for.
15. **HLP-05: at-risk point.** Answered 3 Nov 2026: a desk setting now (default 80 %, built in round 5b, see 4d).
16. **HLP-05: the target line** shows only with one queue chosen (each queue has its own target). *Suggested:* keep.
16. **HLP-04: review every 12 months.** Answered 3 Nov 2026: a company setting now (built in round 4b, see 4c).

17. **HLP-10: the quiz** (design story QuizAck). The design takes the quiz from Learning, which is not built; a policy
    is acknowledged by confirmation or a one-time code. *Suggested:* add the quiz with Learning (questions per version,
    all answers right to pass), drawn into HLP-11 first.
18. **HLP-10: the one-time code goes by email**, not SMS as the design says (the same as letters and desk documents).
    *Suggested:* keep email; SMS when the company's SMS channel is set up.
19. **HLP-10/11: keeping acknowledgements** (DPDP). Records are kept with no end date today. *Suggested:* keep them for
    the employment plus the company's records period (a setting, default 8 years after the person leaves), after counsel.
20. **HLP-11: the demo HR Admin** (hr@demo-org.test) does not get the new keys: its role was changed from the template,
    so the migration leaves it alone (by design). *Suggested:* the founder adds `policy.manage` and `policy.publish` in
    Settings › Roles & access, or tests with admin@ and admin2@ (System Admins carry both).
21. **HLP-11: retiring a policy** (not in the design). A policy can only get new versions today. *Suggested:* add
    "Retire" (it stops showing; records stay) when a company asks, drawn first.
22. **HLP-11: who gets "waiting to be published" notices**: every user whose role carries `policy.publish` (up to 25)
    and the System Admins without a role, not the writer. *Suggested:* keep.

## 7. Next pages (recommended order, with sizes)

| order | page | size | why |
|---|---|---|---|
| 1 | ~~HLP-02 Agent desk~~ (done, round 2) | M | most used by agents; design and server exist; replace `DeskTicketsScreen` at /yx/desk/tickets (draw board and saved views first) |
| 2 | HLP-03 Ticket workspace | L | design and server exist; replace `TicketScreen`; the rail must take the 4 stand-in cards (request panel, ESM rail, KB card, escalate) |
| 3 | HLP-04 Knowledge base editor | M | design and server exist (versions, review due); replace `KnowledgeScreen` (draw spaces and gaps first) |
| 4 | ~~HLP-05 SLA dashboard~~ (done, round 5) | M | server has SLA timers and reports; add the per-queue at-risk view to /yx/desk/reports and fold the report tabs into the HLP look |
| 5 | Request tracker and documents (help/[id]) | S | draw in HLP-01's look, replace `RequestTracker`, `MyDocumentsCard` |
| 6 | Service catalogue | M | live stand-in `CatalogScreen` with 9 "Live ·" stories; needs a design |
| 7 | Live chat (requester and agent) | M | stand-ins `RequesterChatScreen`, `AgentChatScreen`; needs a design |
| 8 | Desk team and the set-up admins | L | stand-ins `TeamScreen` and 7 set-up admins (41 "Live ·" stories); needs designs per tab |
| 9 | ~~HLP-10 + HLP-11 Policy library and admin~~ (done, round 10) | L | no server; most staff touch it (acknowledgements); reuse the desk signing code for one-time codes; founder decisions on audience and quiz |
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
const DESK_FILES = ['desk', 'reports', 'approval-links', 'people-privacy', 'yukthix-support'].map((f) => DESK + f + '.stories.tsx');
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

## Founder answers, 3 Nov 2026 (HLP-02, "all good")
Keep as built: "Merge into another ticket" opens the ticket page; "Move to queue" only to desks this desk may hand
tickets to, with a reason; a row click opens the quick view, "Open ticket" goes to the ticket page.

## Founder answers, 3 Nov 2026 (HLP-03 and HLP-04, "all good")
HLP-03, keep as built: "Change queue" and "Merge" through the Move and Related tickets cards (target and reason needed);
"Related articles" is the live "Articles used" card; the Details card is editable for agents, plain text for others.
HLP-04: keep audience per space (group audiences when a customer needs them); one category per article with sections;
an author sends for review and only a publisher who did not write the version publishes. Build: the article review
interval becomes a company setting in Desk set-up (default 12 months), instead of a fixed product rule.
## Founder answers, 3 Nov 2026 (HLP-04)
Answers 1–3 as suggested: articles keep their space's audience; one category per article; four eyes stay ("Send for
review" for authors). Answer 4: the review interval is a company setting now (3, 6, 12 or 24 months, default 12) in
Desk set-up › Settings; built in round 4b.

## Founder answers, 3 Nov 2026 (HLP-05, "all good")
Keep: the menu item and title read "SLAs"; the period offers 7, 30 and 90 days ("Last 365 days" only after it is drawn
into the design); the target line shows when one queue is chosen. Build: the "at risk" point becomes a desk setting
(default 80% of the target), used by the HLP-05 dashboard and the HLP-02 agent desk ("At risk or breached" view and
quick view).
