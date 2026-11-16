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
| A. Helpdesk HLP-01 … 14 | 14 | 257 | 7 | 0 | 0 | 0 | 264 |
| B. Service desk designs | 5 | 55 | 2 | 0 | 0 | 0 | 57 |
| **All Helpdesk groups (A–B)** | **19** | **312** | **9** | **0** | **0** | **0** | **321** |
Round 14b recount (script, 4 Nov 2026, `feat/yukthix-hlp-14`, founder answers 101-108 and the industry warning): HLP-14
gains 4 stories (counsel note, POSH draft, discard, discarded) and HLP-11 1 (the publisher's counsel tick), all live.
HLP-14: 9 stories, all live.
Round 13b (script, 4 Nov 2026, `feat/yukthix-hlp-13`, answer 85): HLP-13 gains 1 story (Record a dispute · union from
payroll's register), live: 18 stories, all live.
Round 14 recount (script, 4 Nov 2026, `feat/yukthix-hlp-14`): HLP-14 has 5 stories (the 4 approved plus 1 drawn: AI off
with the starters), all live. No Helpdesk design is left as design only.
Round 8e (script, 4 Nov 2026, `feat/yukthix-hlp-07-09`): HLP-08 gains 5 stories (warning letter waiting and issued,
reports from managers, report misconduct, nobody reports to you), all live.
Round 12b (script, 4 Nov 2026, `feat/yukthix-hlp-12`, founder answers 43, 45, 46, 47): HLP-12 gains 2 stories
(ManagerLeavePending, ReporterStatus), both live; ManagerView moves from live (gap) to live (the roster line from the
injury leave in Time). HLP-12: 19 stories, 17 live, 2 live (gap) (questions 42 and 44, left for counsel and the first
factory customer).
Round 13 recount (script, 4 Nov 2026, `feat/yukthix-hlp-13`): HLP-13 has 17 stories (the 3 approved plus 14 drawn for
the real record: in the Cases list, record a dispute, add and settle a demand, log a meeting, record the settlement, the
second member approves, the recorder waits, sent back, sent to payroll, copy filed, closed, the close dialog, the IR team
in set-up), all live. Only HLP-14 (4) is left as design only.
Round 8d (script, 4 Nov 2026, `feat/yukthix-hlp-07-09`): the 7 disciplinary show-cause stories (HLP-07: 4, HLP-08: 3)
move from live (gap) to live; HLP-07 gains 1 story (ShowCauseLive) and HLP-08 gains 4 (OpenCase, DisciplinaryLive,
DisciplinaryDecide, InquiryOrdered), all live.
Round 9b (script, 4 Nov 2026, `feat/yukthix-hlp-07-09`): HLP-08 gains 1 story (Severity), live: 29 stories, 25 live.
Round 12 recount (script, 4 Nov 2026, `feat/yukthix-hlp-12`): HLP-12 has 17 stories (the 8 approved plus 9 drawn: ESI
cover not recorded, case details, mark submitted, ESIC details to print, work out compensation, medical records, manager
with no dates, no safety team, too early): 14 live, 3 live (gap) (the inspector notice, the typed EC age factor, the
roster line of the manager view). HLP-06 NamedGrievance moves to live (the accident choice).
Round 7-9 recount (script, 4 Nov 2026, `feat/yukthix-hlp-07-09`): HLP-07 has 13 stories (the 8 approved plus 5 drawn:
the reporter's view, the outcome shared, the respondent's notice, more time asked, no access): 9 live, 4 live (gap)
(the disciplinary show-cause stories: no disciplinary record yet). HLP-08 has 28 (the 12 approved plus 16 drawn: second
officer, proposer waits, propose, IC findings, IC signed, send notice, notice to send, delayed, delay, more time, relief
recorded, record relief, step aside, conflict override, evidence, no access): 24 live, 4 live (gap) (three disciplinary
stories; the list for someone on no case). HLP-09 has 8 (the 6 approved plus 2 drawn: a report about an officer, no
access): 7 live, 1 live (gap) (a non-officer sees an empty queue). HLP-06 Anonymous moves to live (update alerts built).
Round 6 recount (script, 3 Nov 2026, `feat/yukthix-hlp-06`): HLP-06 has 25 stories (the 12 approved plus 13 drawn for
the real records: topics and "about an officer", not set up, no IC, late POSH, too early, loading, error, no access, an
empty report, and four set-up states): 23 live, 2 live (gap) (the accident choice; update alerts for anonymous reporters).
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
| /yx/desk/help/[id] | `MyTicketScreen` with `RequestTracker`, `MyDocumentsCard` (HLP-19, drawn 12 Nov 2026) | Phase 3b-1 MyTicket | `GET desk/my/tickets/:id`, `POST …/messages`, `/watchers`, `/attachments`, `GET desk/my/requests/:id`, `/documents`, `POST desk/my/documents/:id/sign` (implicit: the requester or a watcher) | live |
| /yx/desk/tickets | the designed `AgentDeskScreen` (HLP-02) with `live`: views, filters (queue, priority, status, raised), table or board, quick view, bulk for team leads, move to another queue, new ticket for an employee, CSV | HLP-02 | `GET desk/tickets` (`desk.ticket.view`; now with `firstResponse`, `resolution`, `firstResponseAt`, and `createdFrom` / `createdTo`), `GET/POST desk/views` (`desk.ticket.view`), `POST desk/tickets`, `/:id/assign`, `PATCH desk/tickets/:id` (`desk.ticket.work`), `POST desk/tickets/bulk` (`desk.ticket.bulk`, lead of the desk), `POST desk/tickets/:id/move` (`desk.ticket.move`), `GET desk/tickets/export` (`desk.ticket.export`) | live |
| /yx/desk/tickets/[id] | `TicketScreen` with `TicketWorkRail`, `ResolveDialog`, `EscalateDialog`, `RequestPanel`, `TicketEsmRail`, `TicketKbCard` (the last four are stand-ins) | Phase 3b-1 Workspace; HLP-03 not wired | `GET desk/tickets/:id`, `/timeline`, `/context`, `/sla`, `/work` (`desk.ticket.view`), `POST …/messages` (`desk.ticket.work` or `desk.ticket.note`), `/resolve`, `/escalate`, `/assign` (`desk.ticket.work`), `/merge` (`desk.ticket.merge`) | live (B); wire design (HLP-03) |
| /yx/desk/knowledge | `KnowledgeScreen` (spaces, articles, editor with review, gaps, recycle bin) | HLP-04 Knowledge; HLP-04 Knowledge base editor not wired | `GET desk/kb/spaces`, `/articles` (`desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish`), `POST desk/kb/articles`, `/versions`, `/submit` (`desk.kb.author`), `/review`, `/retire` (`desk.kb.publish`), `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`) | live (B); wire design (HLP-04) |
| /yx/desk/knowledge (?article=) | the designed `KbEditorScreen` (HLP-04) with `live`: the article list per space, the article editor with four-eyes review, compare, preview, details, translations; categories, blocks, templates, content gaps and the recycle bin as tabs | HLP-04 | `GET desk/kb/spaces`, `/articles` (`desk.kb.view_internal`, `desk.kb.author` or `desk.kb.publish`), `POST desk/kb/articles`, `/versions`, `/submit`, `PATCH desk/kb/articles/:id` (now with `keywords`, `assistantUse`), `POST …/reviewed` (new) (`desk.kb.author`), `/review`, `/retire`, `/republish`, `DELETE` (`desk.kb.publish`), `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`) | live |
| /yx/desk/reports | `SlaDashboardScreen` with `live` (HLP-05; menu Helpdesk › SLAs); the report tabs (desk numbers, KPIs, library, self-service, my reports, walls, customers, NPS surveys) inside it | HLP-05 SLA dashboard | `GET desk/reports/sla` (new, `desk.report.view`), `GET desk/reports/*` (`desk.report.view`), custom reports, schedules, wallboards, KPI targets (`desk.report.manage`), `GET/POST desk/surveys` (`desk.survey.manage`), Reassign `POST desk/tickets/:id/assign` (`desk.ticket.assign` to show it); no-access state without either | live (HLP-05) |
| /yx/desk/policies (?policy=) | the designed `PolicyLibraryScreen` (HLP-10) with `live` | HLP-10 | `GET desk/my/policies`, `/:id`, `/:id/files/:fileId`, `POST …/versions/:versionId/code`, `POST …/acknowledge` (implicit: one's own policies; 403 while acting for someone else) | live |
| /yx/desk/policy-admin (?policy=) | the designed `PolicyAdminScreen` (HLP-11) with `live` | HLP-11 | `GET desk/policies`, `/:id`, `/:id/pending`, `/:id/files/:fileId` (`policy.manage` or `policy.publish`), `GET /options`, `POST`, `PATCH /:id`, `PUT /:id/draft`, `POST /:id/draft/files`, `/remove`, `/submit`, `/remind`, `GET /:id/evidence` (`policy.manage`), `POST /:id/publish`, `/send-back` (`policy.publish`); every route needs the key for the whole company | live |
| /yx/desk/policy-writer (?draft=) | the designed `PolicyWriterScreen` (HLP-14) with `live` | HLP-14 | `GET desk/policy-writer`, `POST /drafts` (throttled; the company's AI or a starter), `GET/PUT /drafts/:id`, `POST /drafts/:id/approve` (`policy.manage` for the whole company; writes 403 while acting for someone else; another company's draft 404); publishing stays `POST desk/policies/:id/publish` (`policy.publish`, never the approver) | live |
| /yx/desk/speakup | the designed `SpeakUpScreen` (HLP-06) with `live` | HLP-06 | `GET desk/speakup/form`, `POST desk/speakup/reports`, `/reports/:id/files` (implicit: one's own named report); anonymous: `POST desk/speakup/public/reports` (no login) | live |
| /yx/speakup/[org]/check | the designed `CheckReportScreen` (HLP-06) with `live` | HLP-06 | `GET desk/speakup/public/company/:org`, `POST desk/speakup/public/check`, `/check/reply`, `/check/files` (no login; the reply code; throttled and locked after 5 wrong codes an hour) | live |
| /yx/desk/speakup-setup | `SpeakUpSetupScreen` (HLP-06 set-up stories) | HLP-06 | `GET desk/speakup/setup`, `POST /setup/members`, `/setup/members/:id/remove` (`speakup.setup.manage`); case officers: `GET desk/speakup/cases`, `/cases/:id`, `POST /cases/:id/messages` (being routed is the access; 404 otherwise; every look audited) | live |
| /yx/desk/my-cases (?case=) | the designed `MyCasesScreen` (HLP-07) with `live` | HLP-07 | `GET desk/my/cases`, `/:id`, `POST …/messages` (reporter), `/reply`, `/more-time`, `/files`, `GET …/files/:fileId` (respondent) (implicit: one's own part only; 403 while acting for someone else) | live |
| /yx/desk/cases, /yx/desk/cases/[id] | the designed `CaseListScreen` and `CaseWorkspaceScreen` (HLP-08) with `live` | HLP-08 | `GET desk/cases`, `/:id`, `POST …/messages`, `/notice`, `/notice/delay`, `/more-time`, `/outcome`, `/outcome/approve`, `/outcome/send-back`, `/ic-report`, `/ic-report/vote`, `/ic-report/sign`, `/relief`, `/relief/:reliefId/done`, `/recuse`, `/members`, `/files`, `GET …/files/:fileId` (no key: a member who has not stepped aside; 404 otherwise; 403 while acting for someone else) | live |
| /yx/desk/ethics | the designed `EthicsDeskScreen` (HLP-09) with `live` | HLP-09 | `GET desk/ethics/reports`, `POST …/:id/route`, `POST …/:id/severity` (no key: an officer on the report; severity only an ethics officer); in the menu only for the ethics or escalation list (`GET workspace/counts` → `ethicsReports`) | live |
| /yx/wall/[org]/[token] | `WallScreen` | Reports (HLP-05) Wall | `GET desk/wall/:org/:token` (the secret link; counts only) | live |
| /yx/desk/setup | `DeskSetupScreen` (desks, calendars, SLA, email, help pages, banners, `SetupStart`) and the tabs `CatalogAdmin`, `RulesAdmin`, `LifecycleAdmin`, `ChatQueuesAdmin`, `DeskOrgAdmin`, `SchedulesAdmin`, `MessagingAdmin` (HLP-18, drawn 12 Nov 2026) | Phase 3b-1 Setup and set-up tabs; Batch 4 GetStarted | desk set-up routes (`desk.settings.manage`, `desk.desk.create`, `desk.sla.manage`, `desk.mailbox.manage`, `desk.portal.manage`, `desk.catalog.manage`, `desk.rule.manage`, `desk.lifecycle.manage`, `desk.channel.manage`) | live |
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
| /yx/desk/catalog | `CatalogScreen` | HLP-15 | `GET desk/my/catalog`, `/items/:id`, `/guides/:id` (implicit) | live |
| /yx/desk/chat | `RequesterChatScreen` | HLP-16 | `GET desk/my/chat*` (implicit) | live |
| /yx/desk/live-chat | `AgentChatScreen` | HLP-16 | `GET desk/chat/sessions*` (`desk.chat.work`) | live |
| /yx/desk/team | `TeamScreen` | HLP-17 | `GET desk/desks/:id/team` (`desk.ticket.assign` or `desk.report.view`), shifts (`desk.ticket.assign`), `PUT desk/me/presence` | live |
| /yx/desk/confirm-chat | a small page of kit parts (Button, InlineAlert) | none | the chat confirm link | no design (too small to need one) |

## 2. Live pages with no design (stand-in copies still)

**12 Nov 2026:** the five below were drawn as HLP-15 to HLP-19 (section 4) and left `liveCopies`; only `ArticleBody` stays (its
three "Live · Help article" stories). The table is kept for the record.

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
doing the same job with a B screen (section 5). (HLP-06 `SpeakUpScreen` and `CheckReportScreen` left the list: live) (HLP-07 `MyCasesScreen`,
HLP-08 `CaseListScreen` and `CaseWorkspaceScreen`, HLP-09 `EthicsDeskScreen` left the list: live; `ops: LoadingCase` and
`ops: ErrorCase` stay: the live workspace draws its own loading and error in the same look) (HLP-10 `PolicyLibraryScreen` and HLP-11 `PolicyAdminScreen` left the list: live)
(HLP-12 `AccidentWorkspaceScreen` and `ReportAccidentScreen` left the list: live) (HLP-13 `CollectiveDisputeScreen` left the list: live) (HLP-14
`PolicyWriterScreen` left the list: live) `ops: PoshCaseScreen` (no HLP story; the POSH case) has no server. Related phone and
portal designs also wait: `settings: MobileHelpTicketsScreen`, `MobilePolicyAckScreen`, `MobileSpeakUpScreen`,
`portals: AnonymousCaseScreen`, `ExternalPartyCaseScreen`, `HelpEditorScreen`.

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| ~~HLP-06 Speak-up filing~~ (done, round 6) | grievance and whistleblower intake, anonymous access code and the no-login "check my report", POSH redirect to the internal committee; tables with RLS, a public route with throttling | L |
| Disciplinary cases (HLP-07/08 show-cause stories) | a disciplinary case record raised by a manager or HR, standing orders per entity, show-cause, inquiry, penalties and letters | L (question 34) |
| ~~HLP-12 Accident case workspace~~ (done, round 12) | accident reports, ESIC report and EC claim clocks, contract workers, manager view | L |
| Domestic inquiry and penalties (after a disciplinary show-cause) | inquiry officer, hearings, findings, second show-cause on the penalty, penalties beyond a warning | L (questions 51, 52; waits for counsel) |
| HLP-12 Accident case workspace (8) | accident reports, ESIC report and EC claim clocks, contract workers, manager view | L |
| ~~HLP-13 Collective dispute / settlement~~ (done, round 13) | dispute record, conciliation, signed settlement sent to payroll arrears | L |
| ~~HLP-14 Write policies with AI~~ (done, round 14) | questionnaire, AI draft, law findings that block approval, approve and load into HLP-10 | L |

## 4. Design groups, story by story

### A. Helpdesk HLP-01 … 23
### A. Helpdesk HLP-01 … 22

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
| RateWithReason · Resolved ticket · rate with a reason | live | Answer 1643: after the stars, an optional "The main reason" Select from the desk's own list (`ratingReasons` on the ticket row); `POST desk/my/tickets/:id/rating {score, reason}` (a reason not on the desk's list is refused); the same on the ticket page and the customer portal; the agent's ticket shows "rated 2 of 5 (Slow)" |
| ClosedNow · Raise ticket · the team is closed now | live | Answer 1646: outside the desk's calendar `GET desk/my/desks` gives `closed {message, opensAt}`; the raise form shows the desk's message with {opens} as the next opening time (the next working start, skipping nights, weekends and holidays); the ticket can still be raised and is marked raised outside hours |
| RaiseWhichDevice · Raise ticket · which device? (IT desk) | live | Answer 1662: `GET desk/my/desks` gives `askDevice` (an IT desk and the person holds a device); the optional "Which device?" uses the catalogue's device picker (`GET desk/my/pick/assets`: only their own devices); `POST desk/my/tickets {assetId}` refuses a device not assigned to the person it is for, and any device on a non-IT desk. Answer 1685: raising for someone else, `GET desk/my/desks?for=` and `GET desk/my/pick/assets?for=` ask and list for the person it is for (the on-behalf right is checked), even when the person raising has no device; the help centre's form has no "for someone else" field yet |
| RaiseOnBehalf · Raise ticket · on behalf of a colleague | live | Answer 1801: for people holding `request.raise_on_behalf`, "Who is this for" (For me / On behalf of someone) and a colleague picker (`GET desk/my/pick/people`); the desks are read for that colleague (`GET desk/my/desks?for=`), so "Which device?" follows them (`GET desk/my/pick/assets?for=`); `POST desk/my/tickets {requestedForPersonId}` refuses anyone outside the person's team (403) |
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
| LookUpButton · Look up a Not found reference · button | live | Help H-2 (answer 971): an agent's "Look up a reference" on the desk opens the dialog (`GET desk/not-found/:code`, agents only) |
| LookUpResult · Look up a Not found reference · found | live | the dialog with a found reference: who asked for which address and when, never another company's |

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
| RelatedTickets · Related tickets, merge, tasks, side conversations, targets, reminders | live | new story: link, merge (the design's "Merge into another ticket"), split, parent, tracker; tasks; side conversations; Response targets with breach reasons; reminders and snooze; hidden personal data; answer 1648 (13 Nov 2026): the response targets card ends with "Timing" for agents: the average wait for a reply, time on hold, moves (queue or owner) and the agents involved, in the SLA engine's business time |
| Escalate · Move to another support level | live | new story: the header menu's "Move to another support level" (L1 / L2 / L3, group, reason; pressed with no reason says so) |
| ResolveWithCode · Resolve · code and note | live | new story: the resolve dialog |
| ResolvedRated · Resolved · closes on, the rating | live | new story |
| OutsideHours · Raised outside hours | live | Answer 1646: `sd_tickets.raised_outside_hours`, set when the person raises it themselves while the desk's calendar is closed (portal, help centre, email, chat; answer 1683: never on tickets agents log); a neutral badge beside the flags |
| Device · IT ticket · device set by an IT agent | live | Answer 1661: Details card, Device: an IT desk's agent searches any live company device (`GET desk/pick/assets`, tag, name or serial) and sets or clears it (`PUT desk/tickets/:id/device`, audited, a timeline event, toast); others see it read only; agents of other desks are refused (403) |
| FieldsLead · Fields · a team lead sets them (drop-down narrowed by another) | live | Answers 1641, 1650: Fields card, the catalogue's form (ServiceForm) with the dependent list; `PUT desk/tickets/:id/fields` refuses a value outside its parent (400) and a team-lead-only field from anyone else (403); timeline event (no value for team-lead-only), audited, toast |
| FieldsAgent · Fields · a first-line agent (no team-lead-only field) | live | Answer 1650: the server leaves the team-lead-only field out of the ticket for anyone but the desk's leads |
| FieldsReadOnly · Fields · read only | live | values only |
| Place · Facilities work order · building, area and equipment | live | Helpdesk plan item 4: Place card for a facilities desk's agents: building, floor or area, equipment (`GET desk/facilities/pick`, active only); equipment brings its building and area; `PUT desk/tickets/:id/place` (other desks 403, retired refused), audited, a timeline event, toast |
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
| Gaps · Content gaps | live | new story: `GET desk/kb/gaps` (`desk.report.view` or `desk.kb.publish`); article-request task (`desk.task.work`), toast. Answer 1647: a fourth list, "Articles that led to tickets" (`ledToTickets`: tickets raised from the help centre or portal while reading that article, counts only), from `sd_tickets.origin_article_id`; the search words are kept too (`origin_query`). Answer 1684: a fifth list, "Searches that led to tickets" (`searchesToTickets`: the same words counted together without case, counts only, "1 ticket was" / "3 tickets were"), each may become an article-request task. Answer 1803: a search shows only once at least 2 different people used the words (one person's words never show) |
| SearchWords · Search words that mean the same | live | Answers 1642, 1681: the knowledge base's own Search words tab (moved out of Desk set-up › Settings to shorten it), for the company's Service Desk owner (`desk.desk.create`): one group a line, commas between words; Use the starter list (Indian HR words); `PUT desk/kb/settings {synonyms}` (registry `desk.kb.synonyms`), audited, toast |
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

Live pages: /yx/desk/speakup (menu Helpdesk › Speak up, everyone), /yx/speakup/<company>/check (no login, the reply code)
and /yx/desk/speakup-setup (menu Helpdesk › Speak-up set-up, `speakup.setup.manage`, the System Admin). The pages render
the designed `SpeakUpScreen` and `CheckReportScreen` (`screens/ops/cases.tsx`) with `live`; the live part and the
new `SpeakUpSetupScreen` are `screens/ops/helpdesk-speakup-live.tsx`. Rules: section 4e. Thirteen stories were drawn in
the same look for states only the real records have. The case side (HLP-07 / 08 / 09) is not built this round; the API
already has the minimum it needs (the officers' case list, one case with the audited identity, team replies).

| story (sub-page) | verdict | note |
|---|---|---|
| NamedGrievance · Grievance · named, confidential | live | `GET desk/speakup/form`, `POST desk/speakup/reports` (implicit: the signed-in person; 403 while acting for someone else). HLP-12 (4 Nov 2026): the fourth choice, "A workplace accident or injury", is live: it shows "Continue to the accident report" (/yx/desk/accidents/report) |
| Anonymous · Whistleblower · anonymous | live | sent through the no-login route (`POST desk/speakup/public/reports`, no sign-in, no cookies): no user, IP or device kept. "Tell me when there's an update" (HLP-08 round): an optional email, stored encrypted (`alert_contact_enc`, org secrets key); a team message or an approved outcome sends only "You have an update" (question 23, built; SMS when the company's SMS channel exists) |
| AnonymousOff · Anonymous switched off by company | live | company setting `speakup.anonymous` (all / ethics_only / off, default all); the option is off and says why; the server refuses too (403) |
| PoshRedirect · Sexual harassment · goes to IC | live | "Continue to the complaint form": always named, only the Internal Committee members see it |
| FiledNamed · Filed · named (GRC clock) | live | the number (GRV-0001 …) and "What happens next": acknowledge by the company's days (`speakup.ack_days`, default 2), the decision by the rule set `IN.GRC` (verify) days. "Go to my cases" reads "Back to Help centre" until HLP-07 |
| FiledAnonymous · Filed · access code shown once | live | the reply code (16 characters, about 80 bits) shown once, kept only as an HMAC hash; files go up with the code |
| Phone · Speak up · phone | live | under 768 px: the design's phone layout |
| PhoneCode · Access code · phone | live | under 768 px |
| CheckMyReport · Check my report (no login) | live | `POST desk/speakup/public/check` (the company and the code; no login) |
| CheckWrongCode · Check my report · wrong code | live | 404 with the tries left (5 an hour per network address; the counter is never kept with a report) |
| CheckLocked · Check my report · too many tries | live | 429 with the time to try again |
| CheckOpen · Check my report · messages | live | the team's messages as "Case team"; reply (`/check/reply`) and files (`/check/files`), toast |
| TopicAndAbout · Topic and “is it about someone on the case team?” | live | new story: topics from the company settings (one a line); a report about an officer goes to the escalation list, never to them |
| NotSetUp · Nobody receives reports yet | live | new story: no officers chosen: the form says so, the server refuses (409 `SPEAKUP_NO_TEAM`) |
| PoshNoIc · Sexual harassment · no Internal Committee yet | live | new story: refused (409 `SPEAKUP_NO_IC`) with the Local Committee route; never sent to anyone else |
| PoshLate · Sexual harassment · complaint form, past the filing window | live | new story: the window and extension from the rule set `IN.POSH` (verify); still filed, marked late |
| TooEarly · File report pressed with nothing written | live | new story |
| FormLoading · Loading | live | new story |
| FormError · Error | live | new story |
| NoAccess · No access (acting for someone else) | live | new story |
| CheckEmpty · Check my report · no messages yet | live | new story |
| Setup · Set-up · who receives reports | live | new story: `GET desk/speakup/setup` (`speakup.setup.manage`): the grievance committee, the ethics team, the Internal Committee (presiding, member, external), the escalation list and (HLP-12) the Safety team; Remove (`POST …/members/:id/remove`), toast |
| SetupUnfinished · Set-up · Internal Committee and Escalation still empty | live | new story: page warning for the System Admin (founder approved 4 Nov) |
| SetupAddIc · Set-up · add to the Internal Committee | live | new story: `POST desk/speakup/setup/members` (one presiding officer) |
| SetupTooEarly · Set-up · Add pressed with nobody chosen | live | new story |
| SetupNoAccess · Set-up · no access (HR without the key) | live | new story: HR templates do not carry the key (403) |

#### HLP-07 · My cases

Live pages: /yx/desk/my-cases (HLP-07), /yx/desk/cases and /yx/desk/cases/[id] (HLP-08), /yx/desk/ethics (HLP-09), each rendering the designed screen with `live` (`screens/ops/cases-live.tsx`) on the HLP-06 case record. Rules: section 4f.

| story (sub-page) | verdict | note |
|---|---|---|
| List · My cases (complainant, respondent, witness) | live | `GET desk/my/cases` (implicit: own part only): role reporter or respondent, stage, next date, status; a row opens the drawer (`?case=`). Witness: no witness record yet (question 37) |
| ShowCauseReply · Show-cause reply | live | disciplinary cases are live (answer 34, round 8d): the employee opens the show-cause notice in My cases: what is alleged, the standing orders clause, the reply date and its source (the legal entity's setting or IN.SO.MODEL); reply with files |
| ExtensionAsked · Show-cause · extension requested | live | disciplinary cases are live (answer 34, round 8d): "Ask for more time" once, with a reason; the first date stands until HR decides |
| Replied · Reply sent | live | disciplinary cases are live (answer 34, round 8d): `POST desk/my/cases/:id/reply`, final once sent, added to, never replaced |
| Empty · Empty | live | "You're not part of any case." with Speak up |
| Loading · Loading | live | while `GET desk/my/cases` loads |
| Phone · My cases · phone | live | under 768 px: the design's phone list |
| PhoneReply · Show-cause reply · phone | live | disciplinary cases are live (answer 34, round 8d): under 768 px the notice and the reply fill the phone |
| ReporterView · Reporter · status, dates and messages only | live | new story: founder decision 4; the reporter's shape has no field for notes, witnesses or the respondent's reply |
| OutcomeShared · Reporter · closed, the outcome and the appeal date | live | new story: the summary the case team sends; the appeal date from the rule set |
| RespondentNotice · Respondent · notice, copy of the complaint, reply date | live | new story: the reply date with its source; Send reply (too early says why), files |
| MoreTimeAsked · Respondent · more time asked, waiting for the case team | live | new story: asked once, with a reason |
| ShowCauseLive · Show-cause notice (disciplinary) · rule, facts, reply date | live | new story (answer 34): the employee's view of a disciplinary case |
| NoAccess · No access (acting for someone else) | live | new story: 403 shows the kit's no-access state |

#### HLP-08 · Cases (case team)

Live pages: /yx/desk/my-cases (HLP-07), /yx/desk/cases and /yx/desk/cases/[id] (HLP-08), /yx/desk/ethics (HLP-09), each rendering the designed screen with `live` (`screens/ops/cases-live.tsx`) on the HLP-06 case record. Rules: section 4f.

| story (sub-page) | verdict | note |
|---|---|---|
| CaseList · Case list | live | `GET desk/cases`: only cases the person is a member of and has not stepped aside from; Type and Status filters; a row opens `/yx/desk/cases/[id]` |
| CaseListEmpty · Case list · empty | live | "You're not on any case." |
| Grievance · Grievance workspace (GRC, disposal clock) | live | `GET desk/cases/:id` (members only, audited): header, stages, due dates from IN.GRC / the settings, tabs, members rail |
| AnonymousMessages · Whistleblower · anonymous messages | live | "Anonymous messages" tab; `POST desk/cases/:id/messages`; the first message acknowledges; the reporter gets only "You have an update" by email when they left an address |
| Disciplinary · Disciplinary · reply awaited | live | disciplinary cases are live (answer 34, round 8d): `GET desk/cases/:id` for the HR members only: the Misconduct card (misconduct, standing orders clause, facts, employee), the Show-cause and reply tab, Decision, Actions for HR |
| DecisionBlocked · Disciplinary · decision blocked before reply | live | disciplinary cases are live (answer 34, round 8d): no decision before the notice and the reply or its date (409 `CASE_TOO_EARLY`); the drawer says why |
| DecisionAllowed · Disciplinary · record decision | live | disciplinary cases are live (answer 34, round 8d): Propose outcome with the Decision Segment (dropped, warning, inquiry), then a second HR person approves (never the proposer); no penalty or letter is generated (questions 52, 56) |
| ConflictBlock · Add member · conflict of interest | live | `POST desk/cases/:id/members`: 409 `CASE_CONFLICT` for a party or anyone above one in the reporting line |
| NonMember · Not a case member (shows Not found) | live | a case one is not on (HR, managers, System Admin, another company) is 404: the kit's Not found |
| NonMemberList · Case list · not a member (shows Not found) | live (gap) | someone on no case sees the empty list, not Not found (the list only ever holds their own cases) |
| Loading · Loading | live | while `GET desk/cases/:id` loads |
| Error · Error | live | any failure but 403 and 404; Try again refetches |
| SecondOfficer · Outcome · second officer approves or sends back | live | new story: founder decision 1: four eyes; send back needs a note |
| ProposedByMe · Outcome · proposer waits for a second officer | live | new story: the proposer gets no Approve |
| ProposeOutcome · Outcome · propose (finding, action, reasons) | live | new story: blocked before the reply or its date (says why); "not proved" and "false or malicious" kept apart (POSH s.14) |
| IcFindings · POSH · IC findings and members' views (1 of 3 agree) | live | new story: each member agrees or not (a no needs a note); the presiding officer signs only with a majority |
| IcSigned · POSH · IC report signed by the presiding officer | live | new story: final and dated; the employer-action clock from the rule set |
| NoticeToSend · Notice · not sent yet (send or delay) | live | new story: Send notice and copy (confirm, the reply date's source) |
| NoticeDelayed · Notice · delayed with a recorded reason | live | new story: founder decision 2: who, when, why, review date |
| SendNotice · Notice · choose the respondent, what is alleged, the papers | live | new story: `POST desk/cases/:id/notice` (respondent, allegations 10 letters or more, case files ticked to share); the reply date from IN.POSH.INQUIRY or `cases.reply_days` |
| DelayNotice · Notice · delay (reason and review date) | live | new story: both required |
| MoreTimeDecide · Notice · the respondent asked for more time | live | new story: give (new date) or refuse |
| InterimRelief · Interim relief · recorded, HR task | live | new story: founder decision 3: the HR task number and status; nothing changes in People |
| RecordRelief · Interim relief · record (gives HR a task) | live | new story: Segment: transfer, leave, stop reporting, other; what HR should do |
| StepAside · Step aside from a case (with a reason) | live | new story: recusal; the rail marks the member |
| ConflictOverride · Add member · conflict found, override with a reason | live | new story: 409 `CASE_CONFLICT`, then the second try with the reason |
| Evidence · Evidence · fingerprints, virus check and access log | live | new story: SHA-256, opens count, only clean files open |
| Severity · Ethics report · the ethics officer sets Serious or Standard | live | new story (founder answer 35): the rail's Severity card, a kit Segment for an ethics officer on the report (`POST desk/ethics/reports/:id/severity`; 403 `CASE_NOT_ETHICS_OFFICER` for the chair, 404 for non-members, 409 for the same value or a closed case); a badge for everyone else; each change is an append-only case step and an audit entry with the old and new value |
| OpenCase · Disciplinary · HR opens a show-cause case | live | new story (answer 34): "Open a case" on Cases for HR with `case.disciplinary.raise` (`GET desk/cases/disciplinary/people`: the people in their HR scope; `POST desk/cases/disciplinary`: employee, misconduct, clause, facts; a manager alone, oneself, someone outside the HR scope (403 `CASE_OUT_OF_SCOPE`) refused) |
| DisciplinaryLive · Disciplinary · the misconduct, the show-cause notice and the reply | live | new story: the reply date from the legal entity's `cases.disciplinary.reply_days` or the rule set IN.SO.MODEL (7 days, verify flag on) |
| DisciplinaryDecide · Disciplinary · propose: dropped, warning or inquiry | live | new story: Decision Segment; "What the employee is told" |
| InquiryOrdered · Disciplinary · inquiry ordered (recorded only) | live | new story: an approved inquiry keeps the case open at "Inquiry ordered"; the inquiry itself is not built (question 51) |
| WarningLetterWaiting · Disciplinary · warning approved, the letter waits for the company template | live | new story (answer 56): the Warning letter card; `POST desk/cases/:id/letter` (members; 400 until the company's "warning" template is switched on in Settings › Letter templates; 409 once issued) |
| WarningLetterIssued · Disciplinary · warning letter issued through Letters | live | new story: the reference number from Letters; the employee finds it with their letters; the case keeps a `letter_issued` step |
| ManagerReports · Cases · reports from managers (open or decline) | live | new story (answer 55): `GET desk/cases/disciplinary/drafts` (HR with `case.disciplinary.raise`, people in scope only), `POST …/drafts/:id/open` (becomes a case, the HR person its first member), `POST …/drafts/:id/decline` (a reason, kept with HR) |
| ReportMisconduct · Manager · report misconduct to HR | live | new story: /yx/desk/report-misconduct (menu Helpdesk › Report misconduct, managers only): `GET desk/my/misconduct-reports/people` (the people whose reporting line runs up to the manager today), `POST desk/my/misconduct-reports` (403 `CASE_NOT_YOUR_REPORT` for anyone else), `GET desk/my/misconduct-reports` (received, opened or declined; never the reason or the case) |
| ReportMisconductNoTeam · Manager · report misconduct · nobody reports to you | live | new story |
| NoAccess · No access (no case-team key) | live | new story: 403; a case one is not on stays "Not found" |

#### HLP-09 · Ethics desk

Live pages: /yx/desk/my-cases (HLP-07), /yx/desk/cases and /yx/desk/cases/[id] (HLP-08), /yx/desk/ethics (HLP-09), each rendering the designed screen with `live` (`screens/ops/cases-live.tsx`) on the HLP-06 case record. Rules: section 4f.

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · Whistleblower queue | live | `GET desk/ethics/reports`: open fraud and ethics reports the person is an officer on; next date, routed or not, anonymous |
| RouteToChair · Route to audit committee chair | live | `POST desk/ethics/reports/:id/route` (reason required): the escalation list joins the case; once only (409) |
| Empty · Empty | live | "No open reports." |
| Loading · Loading | live | while the queue loads |
| Error · Error | live | Try again refetches |
| NotEthicsOfficer · Not the ethics officer (shows Not found) | live (gap) | someone who is not an officer sees an empty queue, not Not found; any report itself is 404 to them |
| AboutOfficer · Report about a case officer · with the chair, not the officer | live | new story: Companies Act s.177; no Route button on it; routing needs a reason |
| NoAccess · No access (not an ethics officer) | live | new story: 403 |

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
| PublishCounsel · Publisher · counsel note to tick (HLP-14 draft) | live | new story (HLP-14 industry warning): the note shows; Publish too early asks for the tick; `POST …/publish` with `counselSeen: true`, audited `policy.counsel_note_seen`; a database CHECK keeps an unticked version unpublished |
| SendBack · Publisher · send back with a note | live | new story: `POST …/send-back` (note 3 to 500 letters) |
| SentBack · Writer · sent back with the note | live | new story |
| PendingByDept · Pending people · one department (drill-down) | live | new story |
| AudienceEdit · Audience & method · change who it applies to | live | new story |
| NotPublished · New policy · not published yet | live | new story |
| Loading · Loading | live | new story |
| Error · Error | live | new story |
| NoAccess · No access | live | new story: no key, or a key granted for one legal entity only (403) |

#### HLP-12 · Accident case workspace

Live (round 12, 4 Nov 2026, `feat/yukthix-hlp-12`): `apps/api/src/accidents` (`desk/accidents`), pages
/yx/desk/accidents/report and /yx/desk/accidents/:id, accident rows in /yx/desk/cases. Rules in section 4g.

| story (sub-page) | verdict | note |
|---|---|---|
| EsiCovered · ESI covered · ESIC report due | live (gap) | `GET desk/accidents/:id` (safety team or the HR handler): ESIC clock from `IN.ESI.ACCIDENT` (verify) on the accident date, Review report (`GET …/esic-form`, print), Mark submitted (`POST …/esic-filed`), toast. Gap: the "Reportable" badge and the inspector notice card (OSH Code / Factories, state rules) are not built: founder decision 3 names only ESIC and EC (question 44) |
| Statutory · Non-ESI · EC claim overdue with interest | live (gap) | ESI cover No: Work out compensation (`POST …/ec`) from `IN.EC.CLAIM` (verify): wage ceiling, minimums, partial share; pay-by date and interest estimate; Mark paid (`POST …/ec-paid`, payroll or deposit). Gap: the Schedule IV age factor is typed from the Act, not looked up (question 42); "Draft EC letter" not built |
| Submitted · ESIC report submitted | live | the date filed and the acknowledgement number; the buttons go |
| ContractWorker · Contract worker · contractor not filed | live | the case names the contractor; the contractor files (`POST …/contractor-filed`); past the deadline "The contractor hasn't filed yet" and the safety team is reminded at 09:00 IST on the company's schedule (`accident.contractor_reminder_days`, default every day) |
| ManagerView · Manager view (leave dates only) | live | the injured employee's current manager gets `view: manager` (name, leave dates, `leaveStatus`) and a notice when dates are recorded; the Roster line comes from the injury leave request in Time (founder answer 43): "Shifts in this period are marked as injury leave" once approved |
| NonMember · Not a case member (shows Not found) | live | 404 for the reporter, HR, other staff, the System Admin and other companies; the page shows Not found |
| ReportDesk · Report an accident | live | `GET desk/accidents/form`, `POST desk/accidents` (anyone signed in, for themselves or someone else; refused while acting for someone else), photos `POST …/photos`; the injured person is found by server search `GET desk/accidents/people?q=` (founder answer 46: 2+ letters, 20 names, own company); time is India time; toast; Helpdesk menu "Report an accident" for everyone (answer 47) |
| ReportPhone · Report an accident · phone | live | the same page on a narrow screen (phone layout, camera for photos) |
| EsiNotRecorded · ESI cover not recorded yet | live | new story: payroll's ESI setting fills it when known; otherwise "Record ESI cover" |
| CaseDetails · Case details (ESI cover, hospital, HR handler) | live | new story: `POST …/facts` (Segment Yes / No, IP number, hospital; only the safety team names the HR handler), toast |
| MarkFiled · Mark submitted (date filed) | live | new story: date between the accident and today, once (409 again) |
| EsicDetails · ESIC details to print | live | new story: the details to enter on the ESIC portal; Print; every preparation audited |
| WorkOutCompensation · Work out compensation (not ESI covered) | live | new story |
| MedicalRecords · Medical records (append-only, fingerprinted) | live | new story: `POST …/medical` (note and file, SHA-256 kept), open `GET …/files/:fileId` (clean files only, fingerprint checked, every open audited) |
| ManagerNoDates · Manager view · no leave dates yet | live | new story |
| NoSafetyTeam · Report · no safety team yet | live | new story: 409 `ACCIDENT_NO_TEAM`; the System Admin adds the Safety team in Speak-up set-up |
| ReportTooEarly · Report · pressed too early | live | new story |
| ManagerLeavePending · Manager view · injury leave waiting for approval in Time | live | new story (answer 43): the Roster line says it waits for approval |
| ReporterStatus · My cases · the reporter sees the status only | live | new story (answer 45): `GET desk/accidents/mine` and `mine/:id` (the reporter only; 404 for anyone else): number, Received / Closed, date; no injury, medical details, team or messages |

#### HLP-13 · Collective dispute / settlement

Live page: /yx/desk/disputes/[id] (`CollectiveDisputeScreen` with `live`, dispute-live.tsx; rules in section 4h), rows
in /yx/desk/cases for the industrial relations team, the IR team list in /yx/desk/speakup-setup.

| story (sub-page) | verdict | note |
|---|---|---|
| Conciliation · Conciliation in progress | live | `GET desk/disputes/:id` (IR team only, audited): header facts, the stage trail, demands, meetings, Next dates from `IN.IR.DISPUTE` (verify), who can see it |
| Signed · Settlement signed · send to payroll arrears | live | the approval itself sends the pay terms: one PAY-37 wage-settlement arrears worksheet that payroll previews, posts and gets approved as usual; "Open signed settlement" opens the fingerprinted copy |
| NonMember · Not a case member (shows Not found) | live | 404 for HR, the System Admin, managers, payroll, other staff and other companies; the page shows Not found |
| InCases · In the Cases list (IR team) | live | new story: `GET desk/disputes` rows merged into Cases (empty list for anyone off the IR team) |
| RecordDispute · Record a dispute | live | new story: `GET desk/disputes/form` (404 off the team: no button), `POST desk/disputes`; toast; opens the new dispute |
| RecordDisputeRegister · Record a dispute · union from payroll’s register | live | new story (answer 85): `GET desk/disputes/form` lists each location’s register unions; the union is chosen from that list (free text refused); the settlement carries it into PAY-37 |
| AddDemand · Add a demand | live | new story: `POST …/demands` (numbered D1, D2 …) |
| UpdateDemand · Demand agreed or withdrawn | live | new story: `POST …/demands/:demandId`, Segment Open / Agreed / Withdrawn / Not agreed; agreed needs the words |
| LogMeeting · Log a meeting (minutes fingerprinted) | live | new story: `POST …/papers` (SHA-256 kept) then `POST …/meetings`; conciliation needs the officer; held on ≤ today; next date after it |
| RecordSettlement · Record settlement (signed copy, pay terms) | live | new story: `POST …/settlement` with the signed copy and the monthly increase per worker category |
| ToApprove · Settlement · second IR member approves | live | new story: `POST …/settlement/approve`; toast says payroll pays it as usual |
| ProposerWaits · Settlement · the recorder waits (can’t approve) | live | new story: 403 for the recorder, refused by a database trigger too |
| SentBack · Settlement sent back | live | new story: `POST …/settlement/send-back` with a reason |
| SentToPayroll · Approved · sent to payroll arrears | live | new story |
| CopyFiled · Copy filed with the authorities | live | new story: `POST …/filed` (once, on or after signing, not in the future) |
| Closed · Closed without a settlement | live | new story |
| CloseDispute · Close without a settlement (dialog) | live | new story: `POST …/close` (withdrawn / no settlement, a note) |
| IrTeam · Speak-up set-up · Industrial relations team | live | new story: the System Admin's list (`speakup.setup.manage`); Segment Company member / Outside lawyer |

#### HLP-14 · Write policies with AI

Live page: /yx/desk/policy-writer (?draft=), menu Helpdesk › Write policies with AI (`policy.manage`). Rules in 4i.

| story (sub-page) | verdict | note |
|---|---|---|
| Questionnaire · Questionnaire | live | `GET desk/policy-writer` (the choices, AI state, the latest open draft); Policy to write is a dropdown (five types: Leave, Work from home, Notice and probation, Code of conduct, POSH; more than four, so not a Segment); industries from the `policy_industries` table; probation months start at the company's `probation.default_months` (answer 108); the numbers of the chosen type and optional notes (500, no names, emails or phones). The page text says Helpdesk › Write policies with AI; the review step says "Check your answers" once (kit fix) |
| Generating · Drafting (loading) | live | `POST desk/policy-writer/drafts` (the company's AI through `AiInvocationService`: provider and credit limit; throttled); a refusal returns to the same step with every answer |
| DraftBlocked · Draft · law finding blocks approval | live | `GET/PUT desk/policy-writer/drafts/:id`: rule and law lines read-only (from the numbers and the dated tables), prose editable; "Use the legal minimum" saves the fix; a number typed into prose is a finding too; Approve & load says what to fix (toast) |
| ApproveLoad · Findings resolved · Approve & load | live | `POST …/:id/approve`: the text becomes the next version of the HLP-10/11 policy (made if none), waiting; a second person publishes it in Policy admin (the approver refused: 403 and a database CHECK); toast, then Policy admin opens. Live dialog: policy, new version, who publishes (Time leave values do not change, question 102) |
| AiOff · AI off · start from a YukthiX starter | live | new story: the company setting `policy.ai_writer` off, or no AI provider: the page says so and Use a starter drafts the same way without the AI |
| CounselNote · Draft · counsel note (industry rules not checked) | live | new story (founder, industry warning): "Law check covers general labour law only; <industry> rules are not checked yet; review with counsel" on the draft and in the approve dialog; never blocks; carried to the version for the publisher's tick (HLP-11 PublishCounsel) |
| PoshDraft · POSH draft · Internal Committee below the IN.POSH minimum | live | new story (answer 101): the committee size and women share against `IN.POSH 2013-v2` (verify); the committee make-up and time limits quoted as law lines |
| Discard · Draft · Discard (confirm) | live | new story (answer 106): `POST …/:id/discard` (version check; audited); toast, back to the questions |
| Discarded · Discarded by the daily clean-up | live | new story (answer 106): read-only; by a person or by the morning clean-up after the company's `policy.ai_draft.discard_days` (default 90) |

#### HLP-15 · Service catalogue

File: `packages/yx-ui/src/screens/ops/hlp-15.stories.tsx`. Drawn 12 Nov 2026 (the founder's "draw the five stand-ins"): the live component in the Helpdesk frame with Kaveri Foods data; the page renders this same screen.

| story (sub-page) | verdict | note |
|---|---|---|
| Catalog · Items and a guide | live | /yx/desk/catalog renders `CatalogScreen` (`GET desk/my/catalog`, `/items/:id`, `/guides/:id`, `POST desk/my/catalog/checkout`; implicit, the requester's own) |
| CatalogItem · An item open | live | same page |
| CatalogItemMissing · Add to cart pressed with a required answer missing | live | same page |
| CatalogItemFailed · The item could not be opened | live | same page |
| CatalogSent · Request sent (toast with Follow) | live | same page |
| CatalogForOtherMissing · Send request for someone else with nobody chosen | live | same page |
| CatalogDeviceForWhom · An item with a device field asks who it is for first | live | Answer 1802: an item whose form has a device field shows "Who is this for" above the form; for someone else, the device picker lists that person's devices (`GET desk/my/pick/assets?for=`, the on-behalf right checked) and a device picked earlier is cleared; the cart's "Who is this for" is the same choice |
| CatalogEmpty · Nothing to order | live | same page |
| CatalogLoading · Loading | live | same page |
| CatalogError · Could not load | live | same page |

#### HLP-16 · Chat with a desk

File: `packages/yx-ui/src/screens/ops/hlp-16.stories.tsx`. Drawn 12 Nov 2026 (the founder's "draw the five stand-ins"): the live component in the Helpdesk frame with Kaveri Foods data; the page renders this same screen.

| story (sub-page) | verdict | note |
|---|---|---|
| RequesterChat · Requester, talking to IT | live | /yx/desk/chat renders `RequesterChatScreen` (`desk/my/chat*`, implicit) and /yx/desk/live-chat `AgentChatScreen` (`desk/chat/sessions*`, `desk.chat.work`) |
| RequesterChatTyping · Requester, the agent is typing | live | same page |
| RequesterChatOffline · Requester, connection lost | live | same page |
| RequesterChatNew · Requester, start a new chat | live | same page |
| RequesterChatNewMissing · Requester, start pressed with no subject | live | same page |
| RequesterChatSendMissing · Requester, Send pressed with nothing written | live | same page |
| RequesterChatRateMissing · Requester, Rate pressed with no stars | live | same page |
| RequesterChatEnded · Requester, ended (rate it) | live | same page. Answer 1682: an optional "The main reason" from the desk's preset list (`ratingReasons` on the ended chat); `POST desk/my/chat/:id/rate {score, reason}` refuses a reason not on the list; the one-click email rating page offers the same list (`GET desk/rate/:org/:token` gives `reasons`) |
| RequesterChatSendFailed · Requester, a message not sent | live | same page |
| RequesterChatEmpty · Requester, no chats yet | live | same page |
| RequesterChatLoading · Requester, loading | live | same page |
| RequesterChatError · Requester, could not load | live | same page |
| AgentChat · Agent, in a chat | live | same page |
| AgentChatWaiting · Agent, a chat waiting to be taken | live | same page |
| AgentChatTakeFailed · Agent, Take refused | live | same page |
| AgentChatHandMissing · Agent, Hand over pressed with nobody chosen | live | same page |
| AgentCallMissing · Agent, calls · Save pressed with no subject | live | same page |
| AgentChatEmpty · Agent, no chats | live | same page |
| AgentChatLoading · Agent, loading | live | same page |
| AgentChatError · Agent, could not load | live | same page |
| AgentChatNoAccess · No access | live | same page |

#### HLP-17 · Desk team and shifts

File: `packages/yx-ui/src/screens/ops/hlp-17.stories.tsx`. Drawn 12 Nov 2026 (the founder's "draw the five stand-ins"): the live component in the Helpdesk frame with Kaveri Foods data; the page renders this same screen.

| story (sub-page) | verdict | note |
|---|---|---|
| Team · Lead (capacity, shifts, forecast) | live | /yx/desk/team renders `TeamScreen` (`GET desk/desks/:id/team`, shifts with `desk.ticket.assign`, `PUT desk/me/presence`) |
| TeamAgent · Agent (my presence only) | live | same page |
| TeamRouting · Change capacity and languages | live | same page |
| TeamShiftMissing · Add the shift pressed with nothing filled | live | same page |
| TeamImportMissing · Import shifts pressed with nothing pasted | live | same page |
| TeamImported · Shifts imported (toast) | live | same page |
| TeamPresenceFailed · Presence change refused | live | same page |
| TeamEmpty · No one on the desk | live | same page |
| TeamLoading · Loading | live | same page |
| TeamError · Could not load | live | same page |
| TeamWorking · Saving presence | live | same page |

#### HLP-18 · Desk set-up tabs

File: `packages/yx-ui/src/screens/ops/hlp-18.stories.tsx`. Drawn 12 Nov 2026 (the founder's "draw the five stand-ins"): the live component in the Helpdesk frame with Kaveri Foods data; the page renders this same screen.

| story (sub-page) | verdict | note |
|---|---|---|
| Lifecycle · Ticket lifecycle designer | live | /yx/desk/setup renders the tab (`CatalogAdmin`, `RulesAdmin`, `LifecycleAdmin`, `ChatQueuesAdmin`, `DeskOrgAdmin`, `SchedulesAdmin`, `MessagingAdmin`) with its own key (`desk.catalog.manage`, `desk.rule.manage`, `desk.lifecycle.manage`, `desk.channel.manage`, `desk.desk.create`) |
| LifecycleProblem · Lifecycle check finds a problem | live | same page |
| LifecycleReady · Lifecycle check passes (toast) | live | same page |
| LifecycleEmpty · No lifecycle yet | live | same page |
| LifecycleLoading · Lifecycle loading | live | same page |
| Schedules · Recurring tickets and follow-ups | live | same page |
| SchedulesEquipment · Recurring maintenance of a piece of equipment | live | Helpdesk plan item 4: an optional Equipment on a recurring record (active, of the desk's own register); each due date makes one ticket naming it, its building and area; retired equipment pauses the schedule |
| SchedulesStandardChange · Recurring standard change (an IT desk, answer 1952) | live | answer 1952: a schedule raises a pre-approved standard change, one schedule per template; a window the change rules refuse is skipped and audited |
| SchedulesEmpty · No schedules yet | live | same page |
| SchedulesMissing · Recurring ticket Save pressed with nothing filled | live | same page |
| SequenceMissing · Save sequence pressed with nothing filled | live | same page |
| SchedulesStateFailed · Pausing a schedule refused | live | same page |
| ChatQueues · Chat queues and prompts | live | same page |
| ChatQueuesEdit · Edit a chat queue | live | same page |
| ChatQueuesNewMissing · New chat queue saved with no name | live | same page |
| ChatQueuesEmpty · No chat queues yet | live | same page |
| Messaging · WhatsApp, SMS and web chat widget | live | same page |
| MessagingEmpty · No messaging lines yet | live | same page |
| MessagingAddMissing · Add the line pressed with nothing filled | live | same page |
| MessagingWidgetMissing · Add the widget pressed with no name | live | same page |
| MessagingLoading · Messaging loading | live | same page |
| Org · Desks, branches, document templates, journeys | live | same page |
| OrgStarter · Starter pack asks about a restricted HR desk | live | same page |
| OrgStarterDone · Starter pack added (toast) | live | same page |
| OrgSiteMissing · Add site pressed with no location | live | same page |
| OrgTemplateMissing · Save template pressed with nothing filled | live | same page |
| OrgJourneyMissing · Save journey pressed with nothing filled | live | same page |
| OrgCloneMissing · Copy desk pressed with nothing filled | live | same page |
| OrgNoCreate · Someone who cannot make desks | live | same page |
| CatalogSetup · Catalogue items | live | same page |
| CatalogSetupEdit · Catalogue item editor | live | same page |
| CatalogSetupAddMissing · Add item pressed with no name | live | same page |
| CatalogSetupLimitStep · Moving the first section up says it is already first | live | same page |
| CatalogSetupAppOwner · Access request approved by the application owner | live | Helpdesk plan item 3: form question type "An application (live list)" (`GET desk/my/pick/apps`, active applications only) and approver "The owner of the application in the form" (`app_owner`); the desk's admins can decide too; the owner grants or refuses in their approvals (audited) |
| CatalogSetupEmpty · No catalogue items yet | live | same page |
| CatalogSetupSaveFailed · Saving an item refused | live | same page |
| Rules · Rules | live | same page |
| RulesEdit · Rule editor | live | same page |
| RulesRuns · What a rule did | live | same page |
| RulesEmpty · No rules yet (recipes) | live | same page |
| RulesSaveFailed · Saving a rule refused | live | same page |
| RulesTooEarly · New rule saved with no name | live | same page |
| WebhookTooEarly · Add webhook pressed with nothing filled | live | same page |
| WebhookAdded · Webhook added, secret to copy | live | same page |

#### HLP-19 · My request

File: `packages/yx-ui/src/screens/ops/hlp-19.stories.tsx`. Drawn 12 Nov 2026 (the founder's "draw the five stand-ins"): the live component in the Helpdesk frame with Kaveri Foods data; the page renders this same screen.

| story (sub-page) | verdict | note |
|---|---|---|
| Tracker · Tracker with the approval route | live | /yx/desk/help/[id] renders `RequestTracker` and `MyDocumentsCard` beside the ticket (`GET desk/my/requests/:id`, `/documents`, `POST desk/my/documents/:id/sign`; the requester or a watcher) |
| TrackerCancel · Cancel, asks why | live | same page |
| TrackerCancelFailed · Cancel refused | live | same page |
| TrackerReadOnly · Cannot cancel any more | live | same page |
| Documents · Documents to sign | live | same page |
| DocumentsSign · Read and sign, open | live | same page |
| DocumentsSignMissing · Send me a code pressed with nothing filled | live | same page |
| DocumentsCodeFailed · The code could not be sent | live | same page |
| DocumentsNone · No documents | live | same page |

#### HLP-20 · Help article

File: `packages/yx-ui/src/screens/ops/hlp-20.stories.tsx`. Drawn 12 Nov 2026 (answer 1603) in the HLP-04 article look: number and date first, the answer in a card, then the feedback; the help centre, the portal and the knowledge pages render this same `ArticleBody` (it left `liveCopies`; the "Live · Help article" pictures are gone).

| story (sub-page) | verdict | note |
|---|---|---|
| ArticleRead · Was this helpful? | live | /yx/desk/help, the portal and /yx/desk/knowledge open `ArticleDrawer` (`GET desk/my/kb/articles/:id`, feedback `POST …/feedback`) |
| ArticleVoteAgain · A second vote (toast) | live | one vote per article |
| ArticleSolved · This solved it (toast) | live | `POST …/solved`, no ticket made |
| ArticleFallback · Not in your language yet (shown in English) | live | the article in the company's default language when the person's is missing |

#### HLP-21 · Business applications

File: `packages/yx-ui/src/screens/ops/hlp-21.stories.tsx`. Drawn 13 Nov 2026 (Helpdesk plan item 3): the company's business applications and their owners, at /yx/desk/apps. Access is asked for through the service catalogue: an item whose form has an "application" question (type `app`, active applications only) and an approval step "the owner of the application in the form" (approver kind `app_owner` in the shared approvals engine); the desk's admins are added to that step. Nobody approves their own request (the engine's rule).

| story (sub-page) | verdict | note |
|---|---|---|
| Apps · Applications and their owners | live | `GET desk/apps` (the desks' staff and the company's Service Desk owner); RLS keeps it to the company |
| AppNew · New application | live | `POST desk/apps` (`desk.desk.create`): name, what it is for, owner (an active colleague), audited, toast |
| AppNewMissing · Save pressed with nothing filled | live | too-early: name, owner |
| AppEdit · Change the owner, or retire it | live | `PATCH desk/apps/:id` (version check, audited); a retired application drops out of the catalogue picker and is refused at checkout |
| AppSaveFailed · Saving refused (name already on the list) | live | 409, a name once per company |
| AppsReadOnly · Desk staff: read only | live | no New or Edit without `desk.desk.create` |
| AppsEmpty · No applications yet | live | |
| AppsLoading · Loading | live | |
| AppsError · Could not load | live | |
#### HLP-22 · Changes and problems

File: `packages/yx-ui/src/screens/ops/hlp-22.stories.tsx` (screens in `hlp-22-itsm.tsx`). A DRAFT drawn 13 Nov 2026 for
Helpdesk plan item 5 (IT change requests and problem records); the plan and questions 1931 to 1943 are in
`docs/yukthix/helpdesk-itsm-plan.md`. Founder approved 1931 to 1943 as suggested ("all ok"); built on
`feat/yukthix-itsm` (ITSM-1, ITSM-2) and `feat/yukthix-itsm-2` (ITSM-3, ITSM-4, answers 1951-1955).

| story (sub-page) | verdict | note |
|---|---|---|
| Changes · Changes · list, clash and the change calendar | live | ITSM-2: /yx/desk/changes renders ChangesScreen (live prop): the desk's changes, clashes on one service, freeze days of the next two weeks |
| ExportChanges · Changes · export for an audit (CSV or PDF, answer 1943) | live | ITSM-2: the Export dialog; GET /desk/changes/export (CSV or PDF), audited |
| ChangesEmpty · Changes · none yet | live | ITSM-2: the same page before the first change |
| NewChange · New change · kind, risk questions, window, way back | live | ITSM-2: NewChangeDrawer (live): the desk's questions (1933), the route by risk (1934), the window and freeze checks (1936) |
| NewChangeTooEarly · New change · sent with nothing filled | live | ITSM-2: the same drawer's checks before sending |
| NewEmergency · New change · emergency, one approver now | live | ITSM-2: an emergency goes to one IT lead; in a freeze it needs a reason (1936) |
| WaitingForApproval · A change · waiting for the change board (high risk) | live | ITSM-2: /yx/desk/changes/[id] renders ChangeRecordScreen (live prop) with the approvals engine's route |
| ScheduledClash · A change · scheduled, clashes with another | live | ITSM-2: a standard change from a pre-approved template (1935); the clash warning |
| InProgress · A change · in progress, the checklist and the outcome | live | ITSM-2: start in the window, the checklist, done / done with problems / backed out |
| Review · A change · review after it caused incidents | live | ITSM-2: the review after a high-risk, emergency or failed change, by a lead or the board (1938) |
| Problems · Problems · list, a repeat suggested | live | ITSM-3: /yx/desk/problems renders ProblemsScreen (live prop); the lead sees the repeat suggestion (1939) and opens a problem from it |
| ProblemInvestigating · A problem · linked incidents, cause not found yet | live | ITSM-3: /yx/desk/problems/[id] renders ProblemRecordScreen (live prop): incidents linked in bulk by number, the root cause |
| KnownError · A problem · known error, workaround to the knowledge base, fix by change | live | ITSM-3: known error with a draft article in the agents' space (1940) and a notice; the fixing change closes it and tells the incidents (1941) |
| NoAccess · No access (not on the IT desk) | live | ITSM-2: anyone without an IT desk seat |
| Settings · Settings · approval by risk, risk questions, banner and review, change window | live | ITSM-1: /yx/desk/setup › Changes (IT desks) renders ItsmSettingsPanel; desk settings with defaults (1933-1939), the company's window and freezes (1936) |
| SettingsReadOnly · Settings · an agent sees them, cannot change them | live | ITSM-1: agents of the IT desk see the tab read-only; the API refuses their changes |
| ChangesReport · Changes · report for the last 90 days (failed-change rate, problems by age) | live | ITSM-4: GET /desk/itsm/report on the Changes page |
| ChangesAsked · Changes · only those I am asked about (change board, application owner) | live | answer 1953: /yx/desk/changes for someone without an IT desk seat; Changes in the menu from the counts |
| NewProblem · Problems · new problem | live | ITSM-3: the New problem drawer |

#### HLP-23 · Buildings and equipment

File: `packages/yx-ui/src/screens/ops/hlp-23.stories.tsx`. Drawn 13 Nov 2026 (Helpdesk plan item 4) at /yx/desk/facilities: buildings are the company's locations; their floors or areas and the equipment (owned by a team of a facilities desk) are kept here. Read by the facilities desks' staff and the company's Service Desk owner; changed only by a facilities desk's admins (equipment: the admins of its own desk). RLS keeps it to the company.

| story (sub-page) | verdict | note |
|---|---|---|
| Equipment · Equipment | live | `GET desk/facilities` |
| EquipmentPage · An equipment page: maintenance and work orders | live | `GET desk/facilities/equipment/:id`: its tickets (only those the person may see), newest first, and the recurring maintenance on it |
| EquipmentNew · New equipment | live | `POST desk/facilities/equipment`: desk, owner team (a team of that desk), building, area of that building, tag once per company; audited, toast |
| EquipmentNewMissing · Save pressed with nothing filled | live | too-early: name, tag, desk, team, building |
| EquipmentEdit · Edit or retire equipment | live | `PATCH desk/facilities/equipment/:id` (version check); retired equipment drops out of every picker and pauses its maintenance |
| EquipmentSaveFailed · Saving refused (tag already used) | live | 409 |
| Buildings · Buildings and their areas | live | the company's locations with their areas |
| AreaNew · New area in a building | live | `POST/PATCH desk/facilities/areas` (a facilities desk's admins), a name once per building |
| ReadOnly · Desk staff: read only | live | no New or Edit without a facilities desk admin seat |
| Empty · No equipment yet | live | |
| Loading · Loading | live | |
| Error · Could not load | live | |

### B. Other Helpdesk designs (were "Service desk")

#### Desk set-up

File: `packages/yx-ui/src/screens/desk/desk.stories.tsx` (from "Phase 3b-1 (wired screens)", 12 Nov 2026): /yx/desk/setup: desks, calendars, response targets, email, help pages and banners; the other tabs are HLP-18.

| story (sub-page) | verdict | note |
|---|---|---|
| Setup · Desk set-up | live | /yx/desk/setup renders DeskSetupScreen |
| SetupKbReview · Desk set-up · Requesters · check help articles again every | live | HLP-04b (founder 3 Nov 2026): Settings tab, company's Service Desk owner (`desk.desk.create`): Segment 3, 6, 12 or 24 months; `GET/PUT desk/kb/settings` (registry `desk.kb.review_months`, default 12), toast |
| SetupAtRisk · Desk set-up · Tickets · at risk from (per desk) | live | HLP-05b (founder 3 Nov 2026): Settings tab, `desk.settings.manage` like the other desk settings: Segment 50 / 60 / 70 / 80 / 90 % (default 80), saved with Save settings (`PATCH desk/desks/:id`, version check, audited), toast |
| SetupRatingReasons · Desk set-up · Requesters · reasons to pick after a rating | live | Answer 1643: Settings tab, `desk.settings.manage`: one reason a line, up to 12 (starter: Quick help, Solved my problem, Friendly and clear, Slow, Not solved, Had to explain again; empty asks none); saved with Save settings (`PATCH desk/desks/:id {ratingReasons}`, version check, audited); reasons show in the Ratings report ("Reasons given") and as a custom-report column |
| SetupClosedMessage · Desk set-up · Requesters · message while closed | live | Answer 1646: Settings tab, `desk.settings.manage`: one line, 2 to 300 letters, {opens} becomes the next opening time (default: "We're closed now. We open again {opens}. …"); saved with Save settings (`PATCH desk/desks/:id {closedMessage}`, audited); needs a business-hours calendar (none: never closed) |
| SetupFields · Desk set-up · Fields | live | Answers 1641, 1650: the desk's own ticket fields (text, number, date, drop-down), for every ticket or one type; who sees each (everyone, desk staff only, team leads only); `POST/PATCH desk/desks/:id/fields` (`desk.settings.manage`), the whole set checked by the forms engine, audited, toast |
| SetupFieldEdit · Desk set-up · Fields · a drop-down narrowed by another | live | Answer 1641: "Narrowed by" a drop-down of the same tickets, and its choices under each parent choice (the forms engine's dependent list); a child of a hidden parent must be as hidden |
| SetupFieldNewMissing · Desk set-up · Fields · Save pressed with nothing filled | live | too-early: name, key |
| SlaSetupTab · SD-1.14 Response targets (desk set-up tab) | live | /yx/desk/setup, SLA tab (`desk.sla.manage`) |
| EmailSetup · SD-1.18 Email (desk set-up tab) | live | /yx/desk/setup, Email tab (`desk.mailbox.manage`) |
| PortalSetup · SD-1.21 Help pages (desk set-up tab) | live | /yx/desk/setup, Help pages tab (`desk.portal.manage`) |
| BannerSetup · SD-1.23 Banners (desk set-up tab) | live | /yx/desk/setup, Banners tab |
| NewDeskTooEarly · Desk set-up · Create desk pressed with nothing filled | live | |
| HolidayTooEarly · Desk set-up · Add holiday pressed with no date or name | live | |
| MailboxTooEarly · SD-1.18 Email · Add mailbox pressed with nothing filled | live | |
| DomainTooEarly · SD-1.18 Email · Add domain pressed with no domain | live | |
| PortalTooEarly · SD-1.21 Help pages · Save pressed with nothing filled | live | |
| PortalNoDesk · SD-1.21 Help pages · New help page with no customer desk (toast) | live | |
| BannerTooEarly · SD-1.23 Banners · Post pressed with nothing written | live | |

#### Customer portal

File: `packages/yx-ui/src/screens/desk/desk-portal.stories.tsx` (from "Phase 3b-1 (wired screens)", 12 Nov 2026): the outside portal (/yx/portal/[org]/[portal]) and /yx/desk/customers.

| story (sub-page) | verdict | note |
|---|---|---|
| Customers · SD-1.22 Customers | live | /yx/desk/customers |
| PortalLogin · US-G-021 Outside portal · sign in | live | /yx/portal/[org]/[portal] renders PortalScreen |
| PortalHomeStory · US-G-021 Outside portal · my tickets | live | the portal's own sign-in, then my tickets |
| PortalTicketStory · US-G-021 Outside portal · one ticket | live | |
| PortalTicketFields · US-G-021 Outside portal · one ticket with its fields | live | Answers 1641, 1650: the portal ticket gives only filled fields meant for everyone |
| PortalRaiseClosed · US-G-021 Outside portal · raise while the team is closed | live | Answer 1646: the portal's `info` gives each team's `closed {message, opensAt}`; the raise form (and Ask without an account) shows it under the team |
| CustomersPlanTooEarly · SD-1.22 Customers · Add plan pressed with nothing filled | live | |
| CustomersPersonTooEarly · SD-1.22 Customers · Add person pressed with nothing filled | live | |
| CustomersProductTooEarly · SD-1.22 Customers · Add product pressed with no name | live | |

#### My ticket, help drawer and calendar

File: `packages/yx-ui/src/screens/desk/desk-mine.stories.tsx` (from "Phase 3b-1 (wired screens)", 12 Nov 2026): a requester's ticket (/yx/desk/help/[id]), the in-app Help drawer, an agent's calendar and the resolve dialog.

| story (sub-page) | verdict | note |
|---|---|---|
| MyTicket · HLP-01 My ticket (requester view) | live | /yx/desk/help/[id] renders MyTicketScreen; replies, colleagues, files through `desk/my/tickets/:id` |
| Calendar · SD-1.11 My calendar | live | /yx/desk/calendar; the calendar feed link can be made and revoked |
| HelpDrawerOpen · US-B-100 In-app Help drawer | live | `HelpDrawer` on every signed-in page (`desk-help.tsx`) |
| ResolveTooEarly · SD-1.10 Resolve · pressed without a code or note | live | `ResolveDialog` when the desk needs a resolution code |
| HelpDrawerWhatsNew · US-B-100 Help drawer · What's new (H-4) | live | Help H-4 (answer 943): the Help drawer's What's new tab (`WhatsNewPanel`), for each person's role and the company's products |
| HelpDrawerTooEarly · US-B-100 Help drawer · Raise ticket pressed with nothing filled | live | |
| MyTicketFields · HLP-01 My ticket · the desk fields I may see | live | Answers 1641, 1650: `GET desk/my/tickets/:id` gives only filled fields meant for everyone (`deskFields`); staff-only and team-lead-only values never leave the server |
| MyTicketReplyTooEarly · HLP-01 My ticket · Send reply pressed with nothing written | live | |
| MyTicketWatchTooEarly · HLP-01 My ticket · Add colleague pressed with no email | live | |

#### HLP-05 · Wall screen

Live page: the wall screen at /yx/wall/[org]/[token]. The report tabs moved into HLP-05 SLA dashboard (round 5); their 14
stories were deleted with `ReportsScreen`.

| story (sub-page) | verdict | note |
|---|---|---|
| Wall · Wall screen (TV) | live | /yx/wall/[org]/[token], counts only, no session |
| WallOff · Wall screen · switched off | live | a revoked link |

#### Approval links

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

#### People list, privacy and sign-up

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

#### Contact YukthiX

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

## 4e. HLP-06 rules (speak-up filing)

Written before the build (3 Nov 2026, `feat/yukthix-hlp-06`), from the founder decisions of 3 Nov (end of this file).
This round builds the filing side only: the forms, the anonymous reply code, routing, and the smallest case record that
HLP-07 / 08 / 09 (my cases, the case team, the ethics desk) will use. The app records and routes; it decides nothing
legal. Every legal hook is marked **verify with counsel**; every legal number lives in a statutory rule set (with its
source and a verify flag), every company choice in a company setting.

**What the app does and why.** Anyone in the company can report a workplace grievance, a fraud or ethics concern, or
sexual harassment. Grievances and ethics concerns go to a separate case team of named case officers that the company
chooses (not ordinary HR). Sexual-harassment complaints go only to the Internal Committee (IC). A report about a case
officer skips that officer and goes to the next person (the escalation list, for example the audit committee chair).
A reporter may stay anonymous: they get a private reply code, shown once, to read answers and reply without a name.
A named reporter's identity is shown only to the case officers routed to the case, and every look is audited, so a
manager or HR who is not on the case can never find out who reported (retaliation protection).

**Indian legal hooks the app supports (it does not replace any of them):**
- **Companies Act 2013 s.177(9)-(10)** and Rule 7 of the Meetings of Board Rules: listed companies and some others must
  have a vigil mechanism for directors and employees, with safeguards against victimisation and direct access to the
  audit committee chair in fit cases. The ethics team, the escalation list and the retaliation flag support it.
  **Verify with counsel.**
- **SEBI LODR regulation 22** (listed companies): a vigil mechanism / whistle-blower policy overseen by the audit
  committee, disclosed on the website. The escalation list can hold the audit committee chair. **Verify with counsel.**
- **POSH Act 2013**: s.4 (an Internal Committee at every office of 10 or more), s.9 (a written complaint within a
  window from the incident, which the committee may extend), s.11 (inquiry within a set time), s.13 (report and the
  employer's action within set times), s.16 (the complainant's identity, the respondent, witnesses and the inquiry are
  confidential). The window and the timelines come from the statutory rule set `IN.POSH` (verify flag on), never from
  code. Only IC members on the case see a POSH complaint; it is always named (the committee must hear the complainant).
  With no IC set up the app does not hand the complaint to anyone else; it says so and names the Local Committee route
  (s.6). **Verify with counsel.**
- **Industrial Relations Code 2020 s.4**: a Grievance Redressal Committee where there are 20 or more workers, with a
  time to finish. That time comes from the rule set `IN.GRC`. **Verify with counsel.**
- **Whistle Blowers Protection Act 2014**: covers disclosures about public servants to a competent authority; it does
  not cover private-company vigil mechanisms. The app does not claim that protection. **Verify with counsel.**
- **DPDP Act 2023**: report text, names and files are personal data; kept for the purpose of handling the case,
  shown only to those handling it. Retention is a company setting to be built with counsel (question). **Verify with counsel.**

**Anonymity by design:**
- An anonymous report is sent through the no-login route (the app sends it without the sign-in), so the server never
  learns who sent it; the record has no user, no employee, no IP and no device. Its audit entry has no actor.
- The reply code (16 characters from 32 letters and digits, about 80 bits) is shown once and stored only as an HMAC
  hash. Lost codes cannot be recovered; the reporter can file a follow-up report naming the earlier number.
- Wrong codes are limited per network address (a short-lived counter, never stored with the report): 5 tries an hour,
  then locked until the hour ends.
- Files sent with an anonymous report or reply carry no uploader.

**Company settings** (Settings › Company rules › Speak-up; default first):

| setting | default | choices | what it does |
|---|---|---|---|
| `speakup.anonymous` | all | all, ethics_only, off | who may report without a name (ethics_only: fraud and ethics concerns only) |
| `speakup.ack_days` | 2 | 1, 2, 3, 5, 7 | days for the case team to acknowledge a report |
| `speakup.categories.grievance` | Pay and benefits, Working conditions, A manager, Transport, Safety, Other | one per line | topics of a grievance |
| `speakup.categories.ethics` | Fraud or theft, Bribery or corruption, Conflict of interest, Misuse of data, Other | one per line | topics of an ethics concern |

**Who:**
- **Any signed-in person** files a named report; anyone (no login) files anonymously and follows up with the code.
  Someone acting for another person cannot file a named report (403).
- **Case officers** are people on the company's lists (grievance team, ethics team, Internal Committee, escalation),
  set by **`speakup.setup.manage`** (new key; the System Admin, not the HR templates). Being on a list is the access:
  a case shows only to the officers routed to it; anyone else gets 404 (not found), including HR, the manager and admins.
- **Routing:** grievance → grievance team (the ethics team when it has nobody); fraud or ethics → ethics team;
  sexual harassment → IC. A report about one of the officers → the escalation list, never that officer.
- Every view of a case by an officer is audited, saying whether the named reporter's identity was shown.

**On filing:** a number (GRV-0001, WB-0001, POSH-0001 per company), the clock (acknowledge by the company's days;
decide or finish the inquiry by the rule set's days for grievances and POSH), a notice to the routed officers that says
only the number and "worried about retaliation" when ticked. Messages between the anonymous reporter and the team are
append-only. Nothing a reporter files can be changed or deleted by the app.
## 4f. HLP-07/08/09 rules (my cases, the case team, the ethics desk)
Written before the build (3 Nov 2026, `feat/yukthix-hlp-07-09`, phase A: designs and the screens' `live` interfaces
only). The case record itself (tables, routing to case officers or the Internal Committee, the reporter's identity, the
anonymous reply code) comes from HLP-06; these pages read and act on it. Like HLP-10/11, the app **records** each step
of a case and keeps its clocks; it decides nothing legal. People decide; the app makes sure the right people decided,
in the right order, and keeps the proof. Every legal hook is marked **verify with counsel**, and no legal time limit is
in code: every limit comes from the company's statutory rule set (a dated, versioned set per law and state) or a
company setting, and the screen shows where each date came from.

**Indian legal hooks the app supports (it does not replace any of them):**
- **POSH Act 2013, s.11 (inquiry):** the Internal Committee (IC) inquires following the principles of the service rules
  or, where there are none, the POSH Rules 2013; it sends the respondent a copy of the complaint and hears both sides.
  The time to send the copy, the respondent's time to reply and the time to finish the inquiry are read from the POSH
  rule set (the Rules today say 7 days, 10 days and 90 days). The app keeps the clocks and the record of each hearing.
  **Verify with counsel.**
- **POSH Act s.12 (interim relief):** during the inquiry the IC may recommend, at the complainant's written request, a
  transfer, leave or stopping the respondent from reporting on the complainant. The app records the recommendation as a
  case action and gives HR a task to carry it out; it never moves anyone in People on its own (founder decision 3).
  **Verify with counsel.**
- **POSH Act s.13 (inquiry report):** the IC gives its findings and recommendation to the employer within the rule
  set's time (today 10 days after the inquiry ends), and the employer acts on it within the rule set's time (today 60
  days). The report is the IC's: members record whether they agree, the majority view is the finding, and the presiding
  officer signs it (founder decision 1). **Verify with counsel.**
- **POSH Act s.14 (false or malicious complaint):** the IC may find a complaint false or malicious, but not merely
  because it could not be proved. The outcome form says so in plain words and keeps "not proved" and "false or
  malicious" as different outcomes; the second needs written reasons. **Verify with counsel.**
- **POSH Act s.16 (confidentiality):** the names and addresses of the complainant, respondent and witnesses, the
  inquiry and the recommendation are not published or told to anyone outside the case. The app shows each person only
  their own part (the "My cases" rule below), logs every view, and keeps case files out of search, reports and exports.
  **Verify with counsel.**
- **POSH Act s.18 (appeal):** a person not satisfied may appeal within the rule set's time (today 90 days from the
  recommendation). The app shows the appeal window on the case and in My cases; the appeal itself is outside the app.
  **Verify with counsel.**
- **Natural justice** (for every case kind): the person accused is told what is alleged, gets a copy of what is relied
  on, and has a fair time to reply before anything is decided; the person deciding has no stake in the case. The app
  blocks recording an outcome until the reply came or the reply date passed, and blocks a member with a conflict from
  the case unless an override is recorded with its reason. **Verify with counsel.**
- **Companies Act 2013 s.177 (vigil mechanism)** and its rules: listed companies and some others must have a vigil
  mechanism with direct access to the audit committee chair in fit cases, and safeguards against victimisation. A
  report about a case officer goes to the next person in the company's routing (for example the audit committee chair),
  not to that officer. **Verify with counsel.**
- **Disciplinary steps under Standing Orders** (Industrial Employment (Standing Orders) Act 1946, the certified
  standing orders, the Industrial Relations Code 2020 once in force): charge-sheet or show-cause, the employee's reply,
  inquiry where the misconduct is major, then the decision. The reply time comes from the company's standing orders
  (a setting per entity), never from code. **Verify with counsel.**
- **DPDP Act 2023:** a case holds personal and sensitive data. It is used only for the case, shown only to people on
  it, kept for the company's case-records period (a setting, question 31) and then deleted or anonymised. A person's
  request to see their data is answered with their own part only (the My cases rule). **Verify with counsel.**
- **Evidence** (Bharatiya Sakshya Adhiniyam 2023 s.63, earlier Indian Evidence Act s.65B): every file on a case keeps
  who added it, when, its SHA-256 fingerprint and its virus check; files are never changed or deleted (a new file is
  added instead); every open and download is logged with who and when; a case on legal hold cannot be closed or
  cleared. The export of a file carries these details so the company can give the certificate. **Verify with counsel.**

**Who:**
- **Reporter** (the person who raised it, named): sees in My cases only the case number, kind, stage, the dates that
  concern them, and the messages between them and the case team, plus the outcome summary the case team chooses to
  send. Never the investigation notes, witness names, the respondent's reply or other people's files (founder decision
  4). An anonymous reporter follows the case with the reply code (HLP-06), with the same limits.
- **Respondent:** once told, sees the notice, the copy of the complaint (or the allegations, as the IC decides), the
  reply date and its source, and sends a reply with files; may ask for more time once (the case team decides). Never
  sees the reporter's name where the law or the case team withholds it, the witnesses' statements before the case team
  shares them, or notes.
- **Witness:** sees that they are on a case, the date asked of them and their own messages and statement.
- **Case officer** (named by the company per case kind, HLP-06): sees and works the cases routed to them. Proposes the
  outcome of an ethics, grievance or disciplinary case; a **second officer** approves or sends it back, never the one
  who proposed it (four eyes, also a database check).
- **Internal Committee member** (POSH cases only): sees the POSH cases the committee holds; records findings and signs.
  The **presiding officer** signs the report once a majority agrees. HR, managers and admins never see POSH cases
  (HLP-06 decision 3).
- **Ethics officer:** the whistleblower queue (HLP-09); routes a report to the audit committee chair with a reason.
- **Audit committee chair** (external): reads only the reports routed to them, the updates and the outcome.
- **HR** (the HR task): gets a task for an interim relief or an outcome action with only what is needed to carry it
  out (who, what, by when), not the case.
- Anyone else: a case they are not on is "Not found" (404, never "no access", so its existence is not given away);
  the case pages without the case-team key show the no-access state (403). Someone acting for another person gets 403
  on My cases (a reply in a case is one's own act).

**Steps and their rules:**
- **Notice to the respondent:** "Send notice" sends the notice and the copy; the reply date is the rule set's (POSH) or
  the standing orders' (disciplinary) or the company setting's (ethics, grievance) days from the sending day, shown with
  its source. "Delay notice" needs a reason (3 to 500 letters) and a date to review it; the reason is on the case
  record and in the audit log (founder decision 2); the clock shows "notice delayed" with that reason.
- **Reply:** the respondent's reply (text 3 to 5000 letters, files optional) is final once sent; a second reply is
  added, never replaces the first. "Ask for more time" (reason required) goes to the case officer; until they decide,
  the first date stands.
- **Outcome (ethics, grievance, disciplinary):** "Propose outcome" (finding: proved, proved in part, not proved, false
  or malicious; the action; reasons 20 to 5000 letters) is blocked before the reply came or its date passed. The second
  officer approves (toast, the case moves on) or sends it back with a note. Optimistic version check: a proposal that
  changed meanwhile is 409.
- **IC report (POSH):** any IC member on the case drafts the findings and recommendation; each member on the case
  records "I agree" or "I don't agree" with an optional note; once more than half of the members on the case agree,
  the presiding officer signs, and the report is final and dated. A recused member does not count. The report date
  starts the employer-action clock from the rule set.
- **Interim relief:** the case officer or IC records the action (transfer, leave, stop reporting to the accused, other)
  with a note and the request it answers; the app creates an HR task (the task number shows on the case); the case
  shows the task's status. Nothing changes in People automatically.
- **Recusal and conflicts:** a member may step aside with a reason (the case goes on with the others; for an ethics
  case with only one officer, to the next person in the routing). Adding a member checks the conflict list (the
  respondent, the reporter, their managers up the chain, anyone named in the case); a conflict blocks it unless an
  override reason is recorded (409 `CASE_CONFLICT`, then a second try with the reason).
- **Evidence:** files up to the company's file limits, virus-checked; only clean files open; each file shows who added
  it, when, its fingerprint and how many times it was opened; the access log lists every view.

**Defaults the product decided (each a question at the stop):** case numbers by kind (GRV-, ETH-, POSH-, DSC-); the
respondent may ask for more time once; the outcome summary to the reporter is written by the case officer, never
generated; witnesses are not shown to each other.

**Built (rounds 7-9, 4 Nov 2026):** migrations `20261650000000_case_steps` (the append-only `speakup_case_steps`
log, RLS forced, no update or delete for the app role, the four-eyes check on approvals in SQL; `speakup_cases`
gains `respondent_user_id`, `version` and the encrypted `alert_contact_enc`; the rule set `IN.POSH.INQUIRY` with notice
7, reply 10 and appeal 90 days, verify flag on) and `20261650000001_speakup_status_width`. Company setting
`cases.reply_days` (5, 7, 10 or 15, default 7; Settings › Company rules › Speak-up). Notification types
`helpdesk.case.update` and `helpdesk.case.task`. Members are the HLP-06 routed officers plus anyone added (role officer
or investigator; the conflict check reads the reporting line from today's assignment, else the user's manager). The
reporter sees no officer names; the respondent never sees the reporter or the messages; the team's first message
acknowledges the report. A report about an officer is already with the escalation list (HLP-06); "Route to chair" adds
the escalation list to any other ethics report. Days are India days.

**Built (round 9b, founder answers 35 and 36, 4 Nov 2026):** severity on fraud and ethics reports: the latest
`severity_set` step (old and new value in the step and the audit; migration `20261650000002_case_severity` adds the kind and
a check that the value is one of the two and changes); default Serious when the reporter fears retaliation, else
Standard; set only by an ethics officer (on the company's ethics list) who is on the report; shown in the queue, the case
header and the rail. The menu: `GET workspace/counts` now carries `casesOpen` (present only for someone on a speak-up list
or a member of any case who has not stepped aside) and `ethicsReports` (only for the ethics or escalation list); the
menu shows Cases and Ethics desk with those counts; My cases stays for everyone. Witnesses are out of the My cases
description and type until counsel (answer 37).
## 4g. HLP-12 rules (accident cases)
Built 4 Nov 2026 (`feat/yukthix-hlp-12`) from the founder decisions of 4 Nov 2026 (end of this file).
- **Who reports:** anyone signed in, for themselves or someone else (an employee picked from the list, or a contract
  worker by name with the contractor). Refused (409 `ACCIDENT_NO_TEAM`) until the System Admin names the Safety team.
  The reporter does not see the case afterwards (only the number in the toast).
- **Who sees:** the Safety team (a speak-up list, `speakup.setup.manage`, System Admin only, not HR) and the HR person
  the safety team names as handler on each case: the whole case, medical included. The injured employee's current
  manager (today's assignment): name and leave dates only, and a notice when dates are recorded. Everyone else, other
  companies and YukthiX support (RLS): 404 / nothing. Every route 403 while acting for someone else. Each view audited
  (`accident.viewed` with the view and whether medical details were shown).
- **Clocks (never in code):** `IN.ESI.ACCIDENT 1950-v1` (verify): ESIC accident report one day after the accident date
  (India date). `IN.EC.CLAIM 2020-v1` (verify; not `IN.EC`, which payroll's injury pay reads): pay within 30 days of the
  day compensation fell due, 12 % a year simple interest estimate after that, wage ceiling ₹15,000, minimums, 25 % half-
  monthly temporary pay after 3 waiting days. ESI covered → ESIC report; not covered → EC claim (ESI Act s.53).
  ESI cover: recorded on the case, else payroll's `employee_statutory.esi` (yes/no) on the accident date.
- **Filing:** the app prepares the ESIC details to print; a person files on the ESIC portal and records the date and
  acknowledgement (once; not in the future, not before the accident). No government filing from the app.
- **Contract workers:** the contractor files; past the deadline the case shows "contractor not filed" and the safety team
  is reminded at 09:00 IST, every `accident.contractor_reminder_days` days (setting, default 1; `off` stops it).
- **Injury leave in Time (answer 43):** recording an employee's leave dates on the case raises a leave request in Time
  of the company's injury leave type (setting `accident.injury_leave_type`, a leave type code, default `INJURY`; 409
  `ACCIDENT_NO_LEAVE_TYPE` until HR adds that type), through `LeaveService.applyForCase`: the type's own rules and the
  person's normal approval chain, reason "Injury leave (accident case ACC-NNNN)", raised by the safety team member or
  handler. New dates are refused (409 `ACCIDENT_LEAVE_IN_TIME`) while that request is live; cancelled, withdrawn or
  rejected frees them. A contract worker has no leave in Time; the dates stay on the case. The manager's Roster line
  and the team's note read the request's status.
- **Reporter (answer 45):** My cases lists the accidents the person reported (`GET desk/accidents/mine`), status only:
  Received or Closed, number and date; no injury, medical details, team or messages; each look audited.
- **Search (answer 46):** `GET desk/accidents/people?q=` (2 to 80 letters, every word in a name, 20 names, own company).
- **Menu (answer 47):** "Report an accident" under Helpdesk for everyone; the phone Me tab design has the row (the live
  phone app is not built, question 61).
- **Add injury leave (answer 62):** Time › Leave policies shows "No injury leave type yet" with **Add injury leave** while
  the company has no leave type with the `accident.injury_leave_type` code (`GET time/setup` → `injuryLeave`). Only a press
  creates it (`POST time/setup/types/injury-leave`, `leave.settings.manage` for the whole company, never acting for
  someone, audited): "Injury leave", unpaid with no balance (kind Leave without pay, so it works for everyone without a
  policy line), no notice; 409 if the code is taken or the setting is not a valid code. HR may change it afterwards.
- **Payroll's injury days (answer 65):** payroll's special days of kind injury (the IN.EC injury pay) fill from approved
  leave of the injury leave type in the month, per employment of the legal entity (half days count half): each morning
  (this month and last) and whenever a regular run is calculated. A filled row is source `leave` and follows the leave
  (0 days once cancelled; the app may not delete); payroll's edit (`PUT payroll/special-days`) makes it source `payroll`
  and the app never changes it again; a locked or filed month is never changed. `in_feed_days`: days the Time feed
  already counts as unpaid (an unpaid injury type), not taken off twice by the calculation (attendance from the feed
  only). `GET payroll/special-days?month=` lists the month's rows with their source (`payroll.input.manage`, in scope).
  Answer 92: the run's Inputs tab shows them per person with their source and payroll edits them there (PAY-03 story
  `InputsSpecialDays`, `GET payroll/runs/:id/special-days`). Answer 93: the morning fill looks back four months; in a
  locked month, approved injury days beyond what was paid become a correction (`pay_corrections`, source
  `injury_leave`, the locked month's period) shown on the next open month's run "to review" with Add to this month;
  one per person and locked month for the same days; never applied by the app.
- **Settings (defaults, per company):** `accident.injury_leave_type` (INJURY), `accident.injury_types` (Crush, Cut, Burn, Fall, Sprain or strain, Other),
  `accident.contractor_reminder_days` (1).
- **Records:** `accident_cases`, `accident_steps` (facts, statement, photo, esic_filed, contractor_filed, ec_set, ec_paid,
  reminded, closed) and `accident_medical_records` are append-only (no UPDATE / DELETE for the app role, forced RLS,
  support sessions excluded); a medical file keeps its SHA-256 and is opened only if clean and matching, every open
  audited. Closing needs ESI cover recorded and every clock done.

**Built (round 8d, founder answer 34, 4 Nov 2026):** disciplinary show-cause cases on the same case record and steps.
Migration `20261670000000_disciplinary_cases`: the kind `disciplinary` (numbers DSC-0001 …), routed to `hr`, always
about an employee and named; the employee's legal entity and the standing orders clause on the case; the rule set
`IN.SO.MODEL` (show-cause reply 7 days, verify flag on); the key `case.disciplinary.raise` (System Admin and the HR
Admin template, granted in the normal role grants; it reaches only the people in the HR grant's scope, like
`perf.pip.manage`). Company setting `cases.disciplinary.reply_days` per legal entity (default `rule_set`). HR opens a
case; its members are the opener and the HR people they add (the manager joins only with a recorded override; the
employee is the respondent, never a member). The show-cause notice, the reply with files and "ask for more time" once
are the respondent flow of HLP-07. No decision before the reply or its date; two people decide (dropped, warning or
inquiry; an inquiry is recorded and keeps the case open). Suspension pending inquiry is an HR task like interim relief;
nothing changes in People or Pay. A disciplinary case has no messages; the employee is told through the notice and the
decision text. HR who hold the key see Cases in the menu.

**Built (round 8e, founder answers 55 and 56, 4 Nov 2026):** migration `20261690000000_misconduct_reports` (a
disciplinary case's `source`, hr or manager; statuses `draft` and `declined`, only for a manager's report; the steps
`report_opened`, `report_declined` (a reason, checked in SQL) and `letter_issued`). A manager reports misconduct by
someone whose reporting line today runs up to them; it is a draft disciplinary case with no members, numbered DSC-…,
seen only by HR with `case.disciplinary.raise` whose scope covers the employee (each look audited). HR opens it (it
becomes an ordinary case, that HR person its first member) or declines it with a reason the manager never sees; the
manager sees received, opened or declined. An approved Warning is issued through Letters (`LettersService.issueSystem`,
letter type `warning`, the company's active template; YukthiX adds a "Warning letter" starter with the merge fields
`case_reference`, `misconduct`, `standing_orders_clause`, `decision_summary`, `decision_date`); with no active template
the decision stands and the case shows the letter as waiting until a member issues it. Nothing changes in People or Pay.
## 4h. HLP-13 rules (collective disputes)
Built 4 Nov 2026 (`feat/yukthix-hlp-13`) from the founder decisions of 4 Nov 2026 (end of this file). Company side only.
- **Who:** the Industrial relations team, a speak-up list (`ir`) only the System Admin keeps (`speakup.setup.manage`;
  HR gets 403). An outside lawyer joins as `external` ("Outside lawyer"); they need a login in the company. The team
  sees and does everything; HR, the System Admin, managers, payroll, other staff, other companies and YukthiX support
  (RLS) get 404 (an empty list on Cases, no "Record a dispute"). Every route 403 while acting for someone else. Every
  look (`dispute.viewed`) and every paper open (`dispute.paper_opened`, with the SHA-256) is audited.
- **Record:** the dispute (title, union or workers' group as text, location, workers covered, charter received on ≤
  today), demands (D1 …, union and company positions, then open / agreed with the words / withdrawn / not agreed),
  bipartite and conciliation meetings (held on ≤ today and ≥ the charter; conciliation names the officer; the next date
  after it), papers (PDF, JPG, PNG up to 10 MB, scanned, SHA-256 kept, opened only when clean and matching).
- **Clocks (never in code):** `IN.IR.DISPUTE 2020-v1` (verify, from 21 Nov 2025): the conciliation officer's report 60
  days after the first conciliation meeting (done when the settlement is approved or the dispute closes); the settlement
  copy to the authorities 10 days after signing (done when "copy filed" is recorded). No rule set in force: no clock.
  The next meeting is the team's own date.
- **Settlement, two people:** one IR member records it (in conciliation or bipartite, signed on, effective from / to,
  covered, terms, the monthly increase per worker category (unskilled, semi-skilled, skilled, highly skilled) and the
  signed copy); one waits at a time. A second IR member approves (never the recorder: 403, and the database trigger
  `ir_dispute_four_eyes` refuses it; one approval per dispute by a unique index). The outside lawyer approves only when
  the company setting allows. Anyone on the team may send it back with a reason (the recorder: withdraw).
- **Payroll:** approval creates exactly one PAY-37 wage settlement (`SpecialPayService.settlementIn`, the pay guard
  opened to the location's legal entity for that one write, audited `payroll.settlement.added` with the dispute as
  source). Payroll previews it per category, posts it for a pay month and someone else approves it, as for any
  settlement; nothing is posted or paid from the dispute. The proposer and the entity's `payroll.special.manage` holders
  get a notice. The IR team gets no payroll access from this.
- **After:** the record is complete once approved (no more demands, meetings, settlements); "copy filed" once. A dispute
  with no settlement closes as withdrawn or no settlement with a note. Strike / lock-out notices and tribunal stages are
  not built (questions 81, 82).
- **The union (answer 85, built 4 Nov 2026):** when the location's legal entity has unions in payroll's union register
  (PAY-36), "Record a dispute" offers that list (names only; the pay guard opens to that one entity for the read) and
  the API refuses free text, a union of another entity or an unknown one (400). Free text is allowed only when the entity
  has no register entries. The dispute keeps the union (`ir_disputes.union_id`, migration `202616d0000000_dispute_union`)
  and the approved settlement's PAY-37 wage settlement carries it (`union_id`).
- **Settings (defaults, per company):** `dispute.lawyer_may_approve` (no).
- **Records:** `ir_disputes` and `ir_dispute_steps` (demand, demand_update, meeting, paper, settlement_proposed,
  settlement_sent_back, settlement_approved, filed, closed) are append-only (no UPDATE / DELETE for the app role,
  forced RLS, support sessions excluded). Migration `202616a0000000_collective_disputes`.
- **Menu:** Cases shows for anyone on a speak-up list (the IR team included); open disputes join the IR team's count.

## 4i. HLP-14 rules (write policies with AI)
Built 4 Nov 2026 (`feat/yukthix-hlp-14`) from the founder decisions of 4 Nov 2026 (end of this file).
- **Who:** `policy.manage` for the whole company drafts, edits and approves (a legal-entity grant: 403, as HLP-11);
  publishing stays in HLP-11 (`policy.publish`). Other staff 403; another company's draft 404 (RLS); every write 403
  while acting for someone else.
- **AI (decision 1):** the company's own AI through `AiInvocationService` (its provider, its AI credit limit; usage
  recorded as `policy_writer`). Company setting `policy.ai_writer` (default on); off, or no provider set up, the page
  says so and "Use a starter" drafts the same way from YukthiX starter text, with no AI call. A failing AI is a 503 with
  "try again or use a starter"; nothing is saved.
- **What reaches the AI (decision 2):** only the answers: policy type, industry, states, headcount, work pattern, the
  topics of the rule lines (not the numbers) and the optional notes. Notes are capped at 500, cleaned to plain text, and
  refused when they hold an email, a phone number or the full name of one of the company's employees. The prompt is
  fixed instructions followed by the answers as JSON in one `<answers>` block (angle brackets removed from the notes, so
  the block cannot be closed or faked); the instructions say the block is data, never instructions. Every run is audited
  (`policy.ai_draft_generated` / `policy.ai_draft_failed`: who, when, type, mode, provider, outcome; not the prompt or
  the notes). Route throttle `STRICT_AI_GENERATE_THROTTLE`.
- **AI output is untrusted:** at most 10 clauses, titles 120 and text 1500 characters, cleaned to plain text with the
  policy library's sanitiser (no tags, scripts, links or control characters); empty ones dropped. The policy text is
  built from escaped text (headings and paragraphs) and cleaned again. Edits are cleaned the same way.
- **Law check (decision 3):** the rule lines (earned, sick, casual, carry forward; work-from-home days; notice days,
  probation months) come only from the answers. Leave is checked against `IN.SE` per chosen state valid today (a group
  such as Tamil Nadu's casual and sick counts together; carry forward against the state's minimum) and quotes `IN.LEAVE`
  maternity. Any number in a prose clause is a finding (numbers come from the answers). Open findings block approval
  (409 `POLICY_LAW_FINDINGS`, checked again on approve); "Use the legal minimum" raises the number. A state with no
  table, and the other two policy types, show "unchecked: ask counsel" and do not block (question 104). Acknowledging a
  finding (in the design) is not built: only fixing clears it (question 103).
- **Approve and publish:** one policy manager approves the draft (version check; once only). The text becomes the next
  version of the policy with the type's title (Leave policy, Work from home policy, Notice period and probation policy),
  made if none (v1), or v2+ with a change summary; a version already being written with text blocks it (409). The
  version is sent (waiting) with `needs_second_person` always on and `ai_approved_by` = the approver; the approver is
  refused on publish (403) even with the company's second-person setting off, and the database CHECK
  `policy_versions_ai_approver_check` refuses it too. Publishers get the usual notice; the version history is HLP-10/11's.
- **Records:** `policy_ai_drafts` (forced RLS; no DELETE for the app role; an approved draft never changes, trigger).
  Migration `202616c0000000_policy_ai_drafts`.
- **Round 2 (founder answers 101, 104, 106, 108 and the industry warning, 4 Nov 2026):**
  - *Industries* live in `policy_industries` (global, read-only to the app; a platform admin adds a row, no deploy),
    seeded with the 10 of round 1, each naming the law tables (`law_statutes`) that apply to it. None is named yet
    (question 111). A table with leave floors (the `IN.SE` shape) is checked like a state's; anything else is not
    checked. When the industry's tables were not all checked, the draft shows "Law check covers general labour law
    only; <industry> rules are not checked yet; review with counsel". It never blocks approval; it is copied to the
    version (`policy_versions.counsel_note`) and the publisher ticks it as seen (400 `POLICY_COUNSEL_UNSEEN` without;
    audited `policy.counsel_note_seen`; CHECK `policy_versions_counsel_check`). An unknown or switched-off industry is
    400 `POLICY_INDUSTRY_UNKNOWN`.
  - *Types:* Code of conduct (no rule lines, no law table: unchecked) and POSH (Internal Committee members and women on
    it, checked against `IN.POSH 2013-v2`: at least a presiding woman, two employees and one outside member, at least
    half women; under ten people "unchecked: Local Committee"; the committee make-up and the time limits quoted as law
    lines). Titles: Code of conduct; Prevention of sexual harassment (POSH) policy. Same check, approval and publishing.
  - *State tables (verify):* `IN.SE` Maharashtra 2017 (casual 8, carry forward 45; earned leave is a rate, one day per
    twenty worked, so it shows "not checked"), Telangana 1988 (earned 15, sick 12, casual 12, carry forward 60), Delhi
    1954 (earned 15, casual and sick together 12, carry forward 45). Each row's `source` names the sections. These
    tables also apply to Time's leave floors for locations in those states (question 112).
  - *Discard:* `POST desk/policy-writer/drafts/:id/discard` (`policy.manage`, version check, 403 acting for someone,
    404 another company) marks the draft discarded (who, when, `manual`); the morning job (09:00 India time, with the
    policy reminders) discards drafts untouched for the company's `policy.ai_draft.discard_days` (30 / 60 / 90 / 180 /
    365, default 90) as `expired`; each audited `policy.ai_draft_discarded`. A discarded draft never changes (trigger).
  - *Probation* starts at the company's `probation.default_months` (whole-company value).
  - Migration `202616e0000000_policy_writer_more`.
- **Answer 111 (4 Nov 2026): the first industry table.** `IN.FACTORIES.LEAVE` (national, verify), linked to Manufacturing
  and Food and consumer goods: `1948-v1` (Factories Act 1948 ss.79-82, to 20 Nov 2025) and `2020-v1` (OSH Code 2020
  s.32, from 21 Nov 2025; 180 days worked instead of 240). The Act fixes one number, the carry forward (at least thirty
  days for an adult), which is checked with "Use the legal minimum"; the yearly leave is a rate (one day for every
  twenty days worked), shown as "ask counsel". Both rows name their sections in `source`. For leave policies those two
  industries no longer carry the counsel note; their other policy types, and the other eight industries, still do.
  Time's leave minimums do not read industry tables (question 131). Migration `202616g0000000_factory_leave_table`.
- **Answers 131 and 132 (4 Nov 2026):**
  - *Company industry:* setting `company.industry` (whole company, default "none" = Not chosen), its choices read from
    `policy_industries` when the settings are listed (labels too) and checked on save (an unknown or switched-off code is
    400). Settings › Company policies. Write policies with AI starts the questionnaire from it; a draft may still choose
    another industry.
  - *Registered factory:* a flag per location (`locations.registered_factory`, default off), edited in the location form
    (kit Checkbox; a "Factory" column in the list); every change audited `org.location.factory_changed` (from, to). Same
    keys and company rules as the rest of the location (org structure); another company 404.
  - *Time:* `statutoryOn` (the path the state `IN.SE` minimums take) adds `IN.FACTORIES.LEAVE` (the row valid on the
    date: Factories Act to 20 Nov 2025, OSH Code from 21 Nov 2025) only when the person's location on that date is a
    registered factory; the higher carry-forward minimum per kind wins, and each rule set used is named. It reaches the
    year-end carry forward and the leave-year change preview, as the state minimums do. Offices are unchanged. Time ›
    Leave policies "Minimums set by law" names "Registered factories (IN.FACTORIES.LEAVE 2020-v1)" while any location is
    flagged. Migration `202616h0000000_registered_factory`.
- **Answer 141 (4 Nov 2026): one source for "factory".** `factoriesActOn` (Time core) decides Factories Act coverage for
  overtime at the legal rate and the 240-day earned leave rule: a location marked Registered factory is covered, unless
  `attendance.factories_act` resolves to "not covered" at the person's department or employment type (office staff on a
  factory site); a company, entity or location value never undoes the flag. At a location that is not flagged the
  setting decides exactly as before (reading rule, no data migration), so no company's result changes until HR ticks
  the flag. Checked on this database (examapp_pay_check, 4 Nov 2026): no location is flagged; demo-org has one
  location-level "covered" value (Hosur plant, from 1 Jan 2026), which keeps working. The location form says it in one line; Time › Set-up ›
  Locations shows per location "Covered: registered factory", "Covered / Not covered: the Factories Act setting for …"
  or "Not covered", and the excluded departments and employment types; Settings › Attendance explains the rule.
  Overtime still also needs an employment category IN.FACTORIES counts as workers (unchanged).
- **Answer 151 (4 Nov 2026): the old location values.** Where a location has its own "covered" value for
  `attendance.factories_act` in force today but no Registered factory flag, Settings › Locations (in the location form)
  and Time › Set-up › Locations show the info alert "Mark the location as a registered factory to make it the one
  source" (Time links to Settings › Locations). Once the location is flagged, both say "The Factories Act setting for this
  location is no longer needed", and Settings › Attendance marks that value "No longer needed: the location is a
  registered factory". Nothing is flagged or removed by itself; removing the value afterwards changes nothing for the
  flagged location. demo-org's Hosur plant shows the alert today.

## 4j. HLP-15 to HLP-19 as built, and the one Helpdesk folder (12 Nov 2026)

- **The five stand-ins, drawn:** HLP-15 Service catalogue, HLP-16 Chat with a desk (requester and agent; the title avoids
  the word "Live", which the guard reads as a picture of the live app), HLP-17 Desk team and shifts, HLP-18 Desk set-up
  tabs (catalogue items, rules, lifecycle, chat queues, desks and branches, schedules, messaging) and HLP-19 My request
  (tracker and documents), as story files in `screens/ops/` (91 stories, from the 91 "Live ·" pictures), each in the
  Helpdesk frame (`OpsDesk`, whose panel now lists Service catalogue, Chat, Live chat, Desk team and Desk set-up) with
  Kaveri Foods data, names without the old "Catalogue ·" style prefixes. The drawing is the component the page renders,
  so there is one version: the 13 screens left `liveCopies` in `design-live-guard.known.json`. These screens take their
  live data as props (they were built that way), not through a separate `live` object; no stand-in copy existed to delete
  beyond the "Live ·" stories, which went.
- **One folder:** every "Screens/Service desk/" story moved under "Screens/Helpdesk/" with plain names: Desk set-up,
  Customer portal, and My ticket, help drawer and calendar (the old Phase 3b-1 file in three), Approval links, Contact
  YukthiX, People list, privacy and sign-up, and HLP-05 · Wall screen (the reports' wall, next to HLP-05). The help
  article's three pictures are "Helpdesk/Live · Help article". Titles and files only; no live behaviour changed.
- **The count:** rows for HLP-02's two look-up stories and Phase 3b-1's "Help drawer · What's new"; the script reads the
  three new desk files and prints "ok" (A: 19 groups, 357 stories; B: 7 groups, 58).
- **Tests:** web `yx-desk-esm-pages.test` (the catalogue lists and opens an item, a refused load says so; a requester's
  chats; an agent without the chat key gets no access; a lead sees the team and shifts, someone else's page never asks
  for the team; a request shows its stages and documents, a ticket without them shows neither). The kit's own tests of
  these screens (`esm.test`, `esm2.test`, `esm3.test`, `rules-admin.test`) and the desk set-up page tests stay.

### Questions (from 1601)

1601. **A deeper redesign.** The drawings keep the screens' present layout (built from the kit) in the Helpdesk frame.
      *Suggested: walk them as drawn; anything that should look different is changed in the drawing and the page at
      once (one version).*
1602. **Long set-up tabs.** Several set-up tabs and the team page need more than one screen at 1278 x 635 (lists of
      items, rules and shifts). *Suggested: keep them as lists that scroll; the page header and tab bar stay in view.*
1603. **The help article picture.** `ArticleBody` is still a "Live ·" picture (help centre, portal, knowledge pages).
      *Suggested: draw it with HLP-04's article view next.*

## 4k. Helpdesk items 1 and 2 as built (12 Nov 2026, branch `feat/yukthix-helpdesk-it`)

- **1. IT starter catalogue:** an `it` entry in `STARTER_PACKS` (`apps/api/src/service-desk/starter.ts`), installed on
  a new IT desk like the other kinds (adds only what is missing on a re-install): first response 30 minutes, 2, 4 and 8
  hours; resolution 4, 8, 24 and 40 hours (priorities 1 to 4, on the desk's calendar: Indian working days, Monday to
  Friday with its holidays). Items, each with its tasks: New laptop (5 working days), Software install (2) and VPN
  access (1), each approved by the manager first; Password reset (1); New-joiner IT kit (3, journeys only, never in the
  catalogue).
- **2. A device on a ticket:** a form field type "One of their devices (live list)" (`asset`) for catalogue items.
  `GET desk/my/pick/assets` returns the devices assigned to the person now (People asset register: handed over, not
  returned), searchable by tag or name; at checkout a device must be one assigned to the person the request is for
  (else "Choose one of your own devices from the list"). The chosen device shows on the ticket as its name and tag (the
  request's answers in the first message, the approval summary). `GET desk/pick/assets?deskId` lets an agent of an IT
  desk search the company's devices by tag, name or serial (not retired or lost); agents of other desks and requesters
  are refused (403). The agent's ticket context now lists the requester's devices ("Devices" in the requester panel,
  replacing "Assets show here from phase 3b-3"), only for those who may see the ticket. RLS keeps every read to the
  company.
- **Tests:** API e2e `service-desk-it` (the IT pack's items, approvals, tasks and targets; HR and Admin unchanged; a
  requester sees only their own devices; another company never sees these and its agent cannot search them; an IT
  agent searches by tag and name without retired ones; an HR agent and a requester cannot search; a picked device shows
  on the ticket, someone else's is refused, the IT agent sees the requester's devices and the HR agent does not).

### Questions (from 1661)

1661. **Where an IT agent picks a device.** The search exists for IT agents, but no agent screen offers it yet (the
      device field is filled by the requester on a catalogue form). *Suggested: a "Device" field on the ticket itself
      for IT desks (raised with it, changed by IT agents, shown in the ticket's details), drawn first.*
1662. **A plain ticket.** "Raise a ticket" (HLP-01) has no device question; only catalogue items do. *Suggested: offer
      "Which device?" on IT desk tickets when the person has a device assigned.*
1663. **IT starter targets.** First response 30 minutes for priority 1 and 8 working hours for priority 4.
      *Suggested: keep; each desk changes them in Response targets.*

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

23. **HLP-06: update alerts for anonymous reporters** ("Tell me when there's an update"). Not offered yet: nothing would
    send them until the team replies in HLP-08. *Suggested:* build with HLP-08, the contact stored encrypted and used only
    to say "You have an update".
24. **HLP-06: accident reports** stay off the speak-up form until HLP-12. *Suggested:* keep. (Done in HLP-12: the fourth choice leads to the accident report.)
25. **HLP-06: POSH complaints are always named** (the committee must hear the complainant; also a database check).
    *Suggested:* keep; an anonymous tip about harassment can go as an ethics concern.
26. **HLP-06: no Internal Committee** means the app refuses a POSH complaint and names the Local Committee route,
    instead of handing it to anyone else. *Suggested:* keep, and show the System Admin a set-up warning.
27. **HLP-06: a report about an officer** goes only to the escalation list (that officer's colleagues on the same list
    do not get it). With nobody on the escalation list it is refused, never sent to the officer. *Suggested:* keep;
    the System Admin must fill the escalation list.
28. **HLP-06: anonymous reports through the no-login route** can also come from outside the company (vendors) by
    design, limited per network address. *Suggested:* keep (a vigil mechanism may take outside reports); add a
    challenge if spam appears.
29. **HLP-06: retention of reports** (DPDP). Kept with no end date today. *Suggested:* a company setting after counsel,
    like policy acknowledgements.
30. **HLP-06: who may set the lists** is only the System Admin (`speakup.setup.manage`), not HR. *Suggested:* keep.

31. **HLP-07/08/09: keeping case records** (DPDP). Kept with no end date today. *Suggested:* a company setting after
    counsel (with HLP-06 question 29), default 8 years after the case closes; files on legal hold stay.
32. **HLP-08: POSH days are counted as calendar days.** The POSH Rules say "working days" for the notice (7) and the
    reply (10). *Suggested:* count working days on the company's holiday calendar once counsel confirms; until then the
    rule set `IN.POSH.INQUIRY` (verify flag on) holds 7 and 10 and the screen names it.
33. **HLP-08: what ends a case.** An approved outcome (grievance, ethics) or the signed IC report (POSH) closes the case
    in the app; the employer's action on a POSH report is tracked only as a date. *Suggested:* keep; add "Employer
    action recorded" when HR asks for it.
34. **Disciplinary cases** (the design's show-cause stories) have no record: speak-up cases come from a report, a
    disciplinary case from a manager or HR. *Suggested:* the next round builds it on the same steps (notice, reply, two
    people, relief), with the standing orders' reply days per legal entity as a setting.
35. **HLP-09: severity.** No one sets a severity yet; the queue shows "Serious" when the reporter fears retaliation and
    "Not set" otherwise. *Suggested:* the ethics officer sets Serious / Standard on the report (audited).
36. **Menu: Cases and Ethics desk show to everyone** (an empty list for someone on no case; every case is 404 to
    non-members). *Suggested:* show them only to people on a speak-up list or a case (a flag on the signed-in profile).
37. **Witnesses** have no record yet (the design's "witness" role in My cases). *Suggested:* add a witness invite step
    (the witness sees only the date asked of them and their own statement), after counsel on what they may see.
38. **Interim relief's HR task** is a notice to the chosen HR person plus "HR has done it" on the case; there is no HR
    task list. *Suggested:* show these tasks in the HR person's My tasks when that page exists.
39. **Outcome summary to the reporter and the respondent** is the same text, written by the proposing officer and sent
    on approval. *Suggested:* keep one text; add a second only if counsel wants different wording for the respondent.
40. **HLP-06 bug fixed here:** `speakup_cases.status` was VARCHAR(12) while its check allows "investigation" (13
    letters); migration `20261650000001_speakup_status_width` widens it. *Suggested:* none (fixed).

41. **HLP-12: who can be the HR handler.** The safety team may name any active person of the company; it does not check
    an HR role. *Built:* any active person, named only by the safety team, audited. *Suggested:* keep (small companies
    have no HR role); or limit to people with an HR template.
42. **HLP-12: the EC age factor** (Schedule IV) is typed by the person from the Act, not looked up. *Built:* typed, 1 to
    500, the working shown. *Suggested:* add the Schedule IV table to the `IN.EC.CLAIM` rule set after counsel checks the
    numbers, then fill it from the date of birth.
43. **HLP-12: injury leave in Time.** Leave dates live on the case and the manager sees them; nothing is written into
    Time or the roster. *Built:* "Record the leave in Time too" on the case. *Suggested:* a follow-up creates the leave
    (an "injury leave" type) from the case, so payroll and the roster see it.
44. **HLP-12: the inspector notice** (OSH Code / Factories Act, state rules: a "reportable" accident) is not built;
    founder decision 3 names only ESIC and EC. *Built:* no badge, no card. *Suggested:* add it with a state rule set
    (`IN.ACC.NOTICE`, per state, verify) when the first factory customer needs it.
45. **HLP-12: the reporter's view.** The reporter sees only the case number (toast); "My cases" does not list accident
    reports. *Built:* nothing more (founder: everyone else gets Not found). *Suggested:* keep; or show the reporter the
    status only (received, closed).
46. **HLP-12: the employee picker** lists names of up to 5,000 people to anyone reporting. *Built:* names only.
    *Suggested:* keep; a search box when a company is larger.
47. **HLP-12: a menu link "Report an accident".** Today the way in is Speak up's fourth choice. *Built:* no extra link.
    *Suggested:* add it under Helpdesk for everyone (and on the phone's Me tab).
51. **HLP-08: the domestic inquiry** (inquiry officer, presenting officer, hearings, findings, a second show-cause on
    the penalty) is not built. An approved "inquiry" decision is recorded as a step and the case stays open at
    "Inquiry ordered". *Suggested:* build it next on the same case steps, after counsel on the standing orders' steps.
52. **HLP-08: penalties beyond a warning** (fine, stoppage of increment, suspension as a punishment, discharge,
    dismissal) are not offered: the decisions are dropped, warning or inquiry. *Suggested:* add them with the inquiry,
    each major penalty only after an inquiry, as the standing orders require.
53. **HLP-08: suspension pending inquiry** is an HR task only; nothing changes in People and no subsistence allowance
    is paid by the app. *Suggested:* keep; link to Pay once payroll can pay subsistence allowance at the state's rates.
54. **HLP-08: show-cause reply days** come from the legal entity's setting `cases.disciplinary.reply_days` (3, 5, 7,
    10, 14 or 15), else the rule set IN.SO.MODEL (7 calendar days, verify flag on). *Suggested:* counsel confirms the
    figure and whether working days are meant; certified standing orders' own figure goes in the entity setting.
55. **HLP-08: how a manager reports misconduct.** Only HR with `case.disciplinary.raise` (in their HR scope) opens a
    case; a manager tells HR outside the app. *Suggested:* a short "Report misconduct to HR" form for managers that
    lands with HR as a draft case, which HR opens or drops.
56. **HLP-08: the warning letter** is not generated; the employee sees the decision text in My cases. *Suggested:*
    issue it through Letters (an HR letter template) once the decision is approved.
81. **HLP-13: strike and lock-out notices** (IR Code notice periods, the notice register, conciliation started by a
    notice) are not built (founder decision 2). *Built:* nothing; a notice is kept as a paper of the dispute.
    *Suggested:* build with the first customer that has a union, as notices with clocks from a verified rule set.
82. **HLP-13: tribunal stages** (failure report, reference to the Industrial Tribunal, award, its publication and
    implementation) are not built. *Built:* "Close without a settlement" (no settlement) with a note. *Suggested:* add
    the reference and award as steps after counsel, with the award's pay terms going to payroll like a settlement.
83. **HLP-13: pay terms are a rupee increase a month per worker category** (PAY-37 pays those), not a percentage of
    basic; the percentage is written in the terms. Payroll's categories are the job's skill class today. *Suggested:*
    keep; add a percentage-of-basic rate to PAY-37 if a customer's settlements are mostly percentages.
84. **HLP-13: may the outside lawyer approve a settlement?** *Built:* company setting `dispute.lawyer_may_approve`,
    default no (only the company's own IR members approve). *Suggested:* keep no.
85. **HLP-13: the union is free text,** not linked to payroll's union register (PAY-36), so the wage settlement has no
    union. *Suggested:* offer the payroll union list when the dispute's legal entity has one; free text otherwise.
86. **HLP-13: no warning in set-up while the IR team is empty** (most companies have no union). *Suggested:* keep;
    the Cases page simply has no "Record a dispute" until the System Admin names the team.
87. **HLP-13: the conciliation report and settlement copy days** (60 and 10, IR Code 2020, verify flag on) need counsel;
    the 10 days are from the rules, which may differ by state. *Suggested:* counsel confirms; per-state rule sets later.
88. **HLP-13: who in payroll hears about an approved settlement.** *Built:* every `payroll.special.manage` holder of the
    legal entity gets a notice (and the recorder). *Suggested:* keep.
101. **HLP-14: which policies the writer drafts.** *Built:* three types: Leave, Work from home, Notice and probation, one
    policy per run (the design's "8 policies and the handbook" is not built). *Suggested:* add Code of conduct and POSH
    next (POSH can quote `IN.POSH`), then others one at a time.
102. **HLP-14: loading rule values into Time.** The design dialog says the values go to the leave policy with an impact
    preview. *Built:* text only: the approved text becomes a policy version; Time's leave policies do not change.
    *Suggested:* keep; a later "apply to Time" step with the impact preview, after counsel.
103. **HLP-14: acknowledging a law finding** (the design's Acknowledge button). *Built:* not offered: a finding clears
    only when fixed (decision 3). *Suggested:* keep.
104. **HLP-14: states with no law table.** Only Karnataka and Tamil Nadu have `IN.SE` leave tables today; other states
    (and the work-from-home and notice types) show "unchecked: ask counsel" and do not block. *Suggested:* keep; load
    Maharashtra, Telangana and Delhi tables next (reviewed, with the verify flag).
105. **HLP-14: numbers in prose.** *Built:* any digit in an AI or starter clause blocks approval until taken out, so the
    AI can never state a lower number than the answers. *Suggested:* keep.
106. **HLP-14: drafts that are never approved** are kept (no delete); the page offers the latest one. *Suggested:* keep;
    add a Discard button and remove drafts untouched for 90 days.
107. **HLP-14: the AI default.** `policy.ai_writer` is on by default, so a company with no key of its own uses the
    platform AI key when one is set. *Suggested:* keep on (only questionnaire answers go out); a company switches it off
    in Settings › Company policies.
108. **HLP-14: probation months in the questionnaire** start at 6, not from the company's `probation.default_months`.
    *Suggested:* prefill from the company setting.
111. **HLP-14: which industries get their own law tables.** *Built:* the table and the check; no industry names a table
    yet, so every draft carries the counsel note. *Suggested:* first the Factories Act annual leave (one day per twenty
    worked) for Manufacturing and Food and consumer goods, written as a reviewed rule set by the compliance owner.
112. **HLP-14: the new Maharashtra, Telangana and Delhi leave tables also raise Time's leave floors** for locations in
    those states (the same `IN.SE` tables). *Built:* yes, as for Karnataka and Tamil Nadu. *Suggested:* keep; counsel
    confirms the three rows before go-live (all marked verify).
113. **HLP-14: Maharashtra earned leave is a rate** (one day per twenty days worked), not checked against the policy's
    yearly number. *Suggested:* keep "not checked, ask counsel"; a rate check needs the expected days worked.
114. **HLP-14: who may add an industry.** *Built:* only the platform (the table is read-only to the app). *Suggested:*
    keep; a company that needs one asks YukthiX support.
115. **HLP-14: the POSH committee under ten people.** *Built:* "unchecked: the district's Local Committee may handle
    complaints" (not blocking). *Suggested:* keep.
131. **HLP-14 answer 111: should Time's leave minimums read the factory table?** Time raises leave lines to the state
    `IN.SE` minimums per location; it does not read industry tables, and a company has no industry on record (the
    industry is only a questionnaire answer). *Built:* nothing (not wired). *Suggested:* not yet: the factory table
    fixes only a carry-forward minimum and applies to factory workers, not office staff; first record "this location is
    a factory" (question 132), then let Time apply the factory carry forward to those locations only.
132. **HLP-14: where the industry and "factory" live.** *Built:* the industry is chosen per draft. *Suggested:* a
    company setting for the industry (default none) and a "registered factory" flag per location, so the writer and
    Time read the same facts.
133. **HLP-14: the factory leave rate.** One day for every twenty days worked (fifteen for a child or adolescent) is
    not checked against the policy's yearly days. *Suggested:* keep "ask counsel"; checking it needs the expected days
    worked per year (a company setting) and counsel's sign-off.
134. **HLP-14: the factory table is national.** States amend the Factories Act (Rajasthan, for example, changed the
    240 days). *Suggested:* keep national with verify; add state rows when counsel lists the amendments that apply.
141. **Answers 131-132: two "factory" switches.** Time already has the dated setting `attendance.factories_act`
    (covered / not covered, per company, entity, location, department or employment type) for overtime at the legal rate
    and the 240-day leave eligibility; the new location flag drives the factory leave minimum. *Built:* both, separate.
    *Suggested:* make the location flag the one fact: a location marked as a registered factory counts as "covered"
    unless the setting says otherwise for a department or employment type (office staff in a factory), and the location
    form says so.
142. **Answer 131: whom the factory minimum covers.** *Built:* everyone whose location is a registered factory,
    including office staff on that site. *Suggested:* limit it to the employment categories IN.FACTORIES counts as
    workers (as overtime already does), after counsel confirms.
143. **Answer 132: the industry per legal entity.** *Built:* one industry for the whole company. *Suggested:* keep;
    a group with a plant entity and a services entity chooses per draft.
144. **Answer 131: the yearly factory leave rate in Time.** Time raises only the carry forward; the one-day-per-twenty
    rate is not applied to credits. *Suggested:* keep until counsel signs off the rate and the days-worked source
    (attendance), then apply it as a minimum at registered factories.
151. **Answer 141: move the old "covered" values onto the flag.** demo-org's plant is covered by a location-level
    "covered" value, not by the flag. *Built:* nothing moved (ticking the flag would also add the factory leave minimum
    of answer 131, which would change carry forward without anyone deciding it). *Suggested:* the location page and
    Time set-up show "Mark the location as a registered factory to make it the one source"; HR ticks it, then the old
    value can be removed.
152. **Answer 141: company, entity or location "covered" values.** They still cover unflagged locations, so the flag
    is the single source only where it is used. *Suggested:* after go-live, stop offering company / entity / location
    scopes for `attendance.factories_act` (keep department and employment type for exclusions) once no company has
    such a value left.
153. **Answer 141: excluding a department that spans several sites.** A "not covered" department excludes it at every
    flagged site. *Suggested:* keep (the usual case is office staff); per-site exclusions would need a location +
    department scope.

71. **HLP-08: a warning letter shows in People › Letters** (the HR register) to HR who hold `letter.issue` for the
    employee, not only to the case's HR members, because Letters keeps every issued letter in one register. The letter
    says only the case number, the misconduct and the decision. *Suggested:* keep (a warning on file is normal HR
    record); hide the register row from HR outside the case only if counsel asks.
72. **HLP-08: the employee does not sign the warning letter.** The YukthiX starter has "the employee signs" off, so it is
    issued, not accepted. *Suggested:* keep; a company that wants a signed acknowledgement switches it on in its template
    (Letters' e-sign then asks the employee to sign for receipt).
73. **HLP-08: HR is not alerted when a manager's report arrives** (done 4 Nov 2026: Cases count and a notice to HR in scope); it waits under Cases › Reports from managers.
    *Suggested:* add the count to the Cases menu item and a notice to HR in scope (both need the scope check per HR
    person; next round).
74. **HLP-08: who counts as the manager's "own report".** Anyone whose reporting line today runs up to the manager
    (their whole team, not only direct reports). *Suggested:* keep, or follow the company's "managers see their whole
    subtree / direct reports only" setting if HR asks.
75. **HLP-08: the warning letter is made only once per case** (a second Warning on the same case is not possible).
    *Suggested:* keep; a corrected letter is issued from People › Letters as a correction, like any letter.
61. **HLP-12: the phone Me tab.** The live app has no phone Me tab yet; "Report an accident" is in the Me tab design
    (`MobileMeTabScreen`, Help list) and in the Helpdesk menu, and the report page takes the phone layout on a narrow
    screen. *Built:* design row and menu link. *Suggested:* keep; it goes live with the phone app.
62. **HLP-12: the injury leave type.** The setting's default code is `INJURY`, but no company has that type until HR adds
    it (paid or not, its rules); until then recording leave dates says so (409). *Built:* setting plus clear refusal.
    *Suggested:* the Time set-up checklist offers "Add injury leave" (kind Other, unpaid by default: ESI pays the benefit).
63. **HLP-12: who approves injury leave.** It goes through the person's normal approval chain (the manager), with the
    case number in the reason. *Built:* the normal chain. *Suggested:* keep; or approved at once when the handler holds
    `leave.approve` over the person (the "on behalf" setting).
64. **HLP-12: changing injury leave dates.** Refused while the leave in Time is live; HR cancels it in Time, then the new
    dates are recorded on the case. *Built:* refusal with that next step. *Suggested:* keep.
65. **HLP-12: payroll's injury days** (Payroll inputs › special days, kind injury) are still typed by payroll, not taken
    from the approved injury leave. *Built:* nothing. *Suggested:* fill them from approved injury leave each month.

91. **HLP-12 answer 62: the kind of the injury leave type.** The suggestion said "kind Other", but a type of kind Other
    has a balance, so nobody could take it until a policy gives days. *Built:* kind Leave without pay (unpaid, no
    balance), named "Injury leave", no notice; HR can change it. *Suggested:* keep.
92. **HLP-12 answer 65: payroll does not see the injury days on a screen yet.** The rows are filled and listed by the API
    (`GET payroll/special-days`) and edited with the existing save; the run's Inputs card has no "special days" line.
    *Built:* API list, edit, morning fill. *Suggested:* add a "Special days (injury, maternity, suspension)" line to the
    run's Inputs card, drawn first.
93. **HLP-12 answer 65: injury leave that is approved after the month is locked** is not added (a locked month never
    changes). *Built:* nothing for that case. *Suggested:* the next month's run shows it as a correction to review.
94. **HLP-08 answer 73: who hears of a manager's report.** People holding `case.disciplinary.raise` whose scope covers the
    employee (up to 25), never the reporter or the employee; if nobody does, nobody is told (the report still waits under
    Cases). *Built:* that. *Suggested:* fall back to the System Admins when nobody holds the key in scope. (Done 4 Nov
    2026: the System Admins get the same notice, the number only.)

121. **HLP-12 answer 93: what "reviewed" means.** A late injury correction stays on the next open month's run until that
     month is paid; payroll adds it with Add to this month (or leaves it). There is no "Reviewed, not paid" button.
     *Built:* shown with Add to this month. *Suggested:* add "Not paid, with a reason" so the list empties, audited. (Done 4 Nov
     2026: Not paid with a reason, logged, never raised again; Undo while the run is open.)
122. **HLP-12 answer 93: corrections from earlier than four months** (leave approved very late) are not raised by the
     morning fill. *Built:* four months back. *Suggested:* keep; a company setting if anyone needs longer.
123. **HLP-12 answer 92: maternity and suspension days** show in the same card and payroll edits them there too (they were
     only in the API). *Built:* that. *Suggested:* keep.
124. **HLP-08 answer 94: the System Admin decides it then.** The System Admin role carries `case.disciplinary.raise`
     company-wide, so the notified System Admin can open or decline the waiting report from Cases. *Built:* notice to the
     System Admins (up to 25, never the reporter or the employee). *Suggested:* keep, and give an HR person the key for
     that entity in Roles & access so it reaches HR next time.
125. **Virus scan started inside a transaction.** HLP-12 photos and medical files and HLP-13 papers started their scan
     before the file was committed, so under load the scan missed it and the file stayed "being checked" until the hourly
     sweep (it failed the e2e twice). Fixed there: the scan starts after the commit. Other uploads (speak-up, cases, desk)
     use the same pattern. *Suggested:* the same small fix everywhere, in one pass with its own tests. (Done 4 Nov 2026:
     speak-up named and anonymous files and case evidence and replies now scan after the commit; desk tickets, chat and
     mail-in already did; a guard test fails if a FilesService scan runs inside a transaction or a function taking `tx`.)

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
| 10 | ~~HLP-06 Speak-up filing~~ (done, round 6) | L | no server; needs POSH Act 2013 internal committee and whistleblower decisions; public no-login route |
| 11 | ~~HLP-08 + HLP-07 + HLP-09 Cases, my cases, ethics desk~~ (done, rounds 7-9; disciplinary cases left, question 34) | XL | no server; one case engine for grievance, disciplinary and whistleblower cases, members, conflict check, clocks; standing orders and show-cause decisions |
| 12 | ~~HLP-12 Accident case~~ (done, round 12; inspector notice left, question 44) | L | no server; ESIC accident report, EC Act claim interest, Factories Act / OSH Code notices |
| 13 | ~~HLP-13 Collective dispute~~ (done, round 13; strike notices and tribunal stages left, questions 81, 82) | L | no server; Industrial Disputes Act conciliation and settlement to payroll arrears |
| 14 | ~~HLP-14 Write policies with AI~~ (done, round 14; more policy types and state tables, questions 101, 104) | L | no server; after HLP-10; law findings need a reviewed rule set |

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Helpdesk
and Service desk design story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/helpdesk-design-map.md and checks that
// every Helpdesk (screens/ops/hlp-NN) and Service desk design story file has exactly one row per story, in file order.
const fs = require('fs');
const OPS = 'packages/yx-ui/src/screens/ops/', DESK = 'packages/yx-ui/src/screens/desk/';
const DESK_FILES = ['desk', 'desk-portal', 'desk-mine', 'reports', 'approval-links', 'people-privacy', 'yukthix-support'].map((f) => DESK + f + '.stories.tsx');
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

## Founder answers, 3 Nov 2026 (HLP-10/11, "all good")
(1) The quiz comes with Learning. (2) Acknowledgement codes go by email; SMS once the company's SMS channel is set up.
(3) Keeping acknowledgements becomes a company setting, default employment plus 8 years — built only after counsel
agrees (go-live checklist). (4) The demo HR Admin role gets `policy.manage` and `policy.publish` (demo script).
(5) "Retire a policy" only when a company asks, drawn first. (6) The "waiting to publish" notice goes to every publisher
except the writer. (7) Confirmed: HLP-10/11 only shows and records policies and makes no legal decision.

## Founder decisions, 3 Nov 2026 (HLP-06 Speak-up, before any server work)
(1) Anonymous reports are allowed: the reporter gets a private reply code to follow up and answer questions without a
name; a company setting can turn anonymous reporting off. (2) Reports go to a separate ethics / case team of named case
officers chosen by the company, not ordinary HR; a report about a case officer goes to the next person (e.g. the audit
committee chair, Companies Act s.177 vigil mechanism — verify with counsel). (3) Sexual-harassment (POSH) complaints go
straight to the Internal Committee: only IC members see them; the POSH Act filing window and IC timelines are tracked as
settings from the statutory rules (verify with counsel). (4) A named reporter's identity is visible only to the assigned
case officers; hidden from managers and other HR; every view audited (retaliation protection).
Other choices built as company settings with safe defaults (categories, acknowledgement days, reminder schedule,
retention) and listed for the founder at the stop.

Founder approved, 4 Nov 2026 (HLP-06 follow-ups): (5) anonymous update alerts built with HLP-08 (contact stored encrypted,
alert text only "You have an update"); (6) accident reports stay off Speak-up until HLP-12; (7) POSH complaints are always
named, an anonymous tip goes in as an ethics concern; (8) no Internal Committee: refuse POSH and point to the district Local
Committee, plus a set-up warning for the System Admin; (9) a report about a case officer goes only to the escalation list,
refused if that list is empty; (10) outside reporters (vendors) may use the anonymous page, limited per network, challenge
only if spam appears; (11) retention is a setting after counsel agrees (GO-LIVE-CHECKLIST); (12) only the System Admin sets
officer lists.

## Founder decisions, 3 Nov 2026 (HLP-07, 08, 09 Cases, before any server work)
(1) Outcome: ethics cases need two people — the case officer proposes, a second officer approves; POSH cases: the
Internal Committee records its findings and recommendation (majority, presiding officer signs), as the POSH Act expects —
verify with counsel. (2) The respondent is told and given a copy and time to reply, per law (natural justice); for POSH
the time limits come from the statutory rule sets, never code; officers may delay notice only with a recorded reason.
(3) Interim relief (transfer, leave, stop reporting to the accused) is recorded as a case action and HR gets a task to
carry it out; nothing changes in People automatically. (4) "My cases" shows the reporter status, dates and messages only —
never investigation notes, witness names or the respondent's reply.
Built after HLP-06 is merged (it creates the case record HLP-07 … 09 use).

Founder approved, 4 Nov 2026 (questions 31-40, all as suggested): (31) case-record retention is a company setting after
counsel, default 8 years after closing (GO-LIVE-CHECKLIST); (32) POSH days become working days on the company holiday
calendar once counsel confirms (GO-LIVE-CHECKLIST); (33) keep: outcome or signed IC report closes the case, employer
action is a date; (34) disciplinary show-cause cases are built next on the same steps, reply days a setting per legal
entity; (35) the ethics officer sets Serious or Standard, audited; (36) Cases and Ethics desk show only to people on a
speak-up list or a case; (37) witness invite step after counsel; (38) relief tasks join HR My tasks when that page
exists; (39) one outcome summary for reporter and respondent; (40) status width fixed.

## Founder decisions, 4 Nov 2026 (HLP-12 Accident case, before any server work)
(1) Anyone can report an accident or injury: the injured person, a witness or a manager, also on behalf of someone else
(desk and phone). (2) A named safety team chosen by the System Admin (like the speak-up lists), plus the HR person who
files the ESIC report, handles the case and sees injury and medical details; the manager sees leave dates only; everyone
else gets Not found. (3) ESIC accident report and Employee Compensation Act claim: the app keeps the deadline clocks from
the statutory rule sets (verify with counsel, never in code), prepares the form details for printing, and a person files
on the ESIC portal and records the date; no direct government filing. (4) Contract workers: the case names the
contractor, the contractor files; the app reminds the safety team and shows "contractor not filed" when late, because
the principal employer stays responsible.

Founder approved, 4 Nov 2026 (HLP-12 questions 41-47 and disciplinary questions 51-56, all as suggested): (41) keep: any
active person can be the HR handler, named by the safety team, audited; (42) EC Schedule IV age factors go into the rule set
after counsel checks them, then fill from the date of birth (GO-LIVE-CHECKLIST); (43) create an injury leave record in Time
from the case; (44) the inspector notice comes with per-state rule sets when the first factory customer needs it; (45) the
reporter sees the status (received / closed) only; (46) a search box in the injured-person picker for larger companies;
(47) "Report an accident" in the Helpdesk menu for everyone and on the phone Me tab; (51) the domestic inquiry is built
next on the same case steps, after counsel; (52) major penalties come with the inquiry and only after one; (53) keep
suspension as an HR task, link to Pay when payroll can pay subsistence at state rates; (54) counsel confirms the
standing-orders reply days and whether they are working days (GO-LIVE-CHECKLIST); (55) a "Report misconduct to HR" form
for managers that reaches HR as a draft; (56) the warning letter is issued through Letters once the decision is approved.
Demo: the demo HR Admin role gets case.disciplinary.raise (prisma/scripts/demo-hr-admin-keys.ts).

## Founder decisions, 4 Nov 2026 (HLP-13 Collective dispute, before any server work)
(1) A named industrial-relations team chosen by the System Admin (HR head, legal; an outside lawyer can be added) handles
disputes; everyone else gets Not found. (2) The app keeps the record (demand, conciliation meetings, papers) and the legal
clocks from statutory rule sets marked verify (never in code); people negotiate. Strike / lock-out notices and tribunal
stages wait for the first customer with a union. (3) A signed settlement is recorded by one IR member and approved by a
second; then it goes to payroll as an arrears worksheet that payroll checks and runs as usual; nothing is paid
automatically. (4) Company side only: no union or worker view in the app.

## Founder decisions, 4 Nov 2026 (HLP-14 Write policies with AI, before any server work)
(1) The AI is the company's own AI setting through the existing AI service (provider, limits); with AI off the page says
so and offers the policy starters. (2) Only the questionnaire answers go to the AI, never employee names or personal data;
every run is logged. (3) The draft is checked against the law tables and any finding blocks approval until fixed; then one
policy manager approves and a second publishes through the HLP-10/11 policy library with its version history.

Founder approved, 4 Nov 2026 (questions 61-65 and 71-75, all as suggested): (61) the phone Me tab row goes live with
the phone app; (62) the Time set-up checklist offers "Add injury leave", unpaid by default (ESI pays the benefit); (63) keep
the normal leave approval chain; (64) keep: HR cancels the Time leave before new dates; (65) payroll's injury days fill each
month from approved injury leave; (71) keep: the warning letter is a normal HR record in People › Letters; (72) keep: no
e-sign unless the company template switches it on; (73) a count on the Cases menu item and a notice to HR in scope when a
manager's report arrives; (74) keep: the whole team down the reporting line; (75) keep: one warning letter per case.

Founder approved, 4 Nov 2026 (HLP-13 questions 81-88, all as suggested): (81) strike and lock-out notices come with the
first customer that has a union; (82) tribunal stages after counsel (GO-LIVE-CHECKLIST); (83) keep rupee-a-month rates per
category, add a percentage rate if customers need it; (84) keep dispute.lawyer_may_approve default no; (85) offer
payroll's union list when the legal entity has one; (86) keep: no set-up warning while the IR team is empty; (87) counsel
confirms the 60 and 10 days, per-state rule sets later (GO-LIVE-CHECKLIST); (88) keep the payroll notice recipients.

Founder approved, 4 Nov 2026 (questions 91-94 and 101-108, all as suggested, plus the industry warning): (91) keep
injury leave as leave without pay; (92) a "Special days" line on the run's Inputs card, drawn in the design first; (93)
injury leave approved after a locked month shows in the next run as a correction to review; (94) with nobody holding the key
in scope, the System Admins are told; (101) add Code of conduct and POSH policy types next; (102) keep text only, an "apply
to Time" step with impact preview after counsel (GO-LIVE-CHECKLIST); (103) keep: only fixing clears a finding; (104) keep
unchecked as "ask counsel", load Maharashtra, Telangana and Delhi tables next (marked verify); (105) keep: a number in a
clause blocks; (106) a Discard button and automatic clean-up of unapproved drafts after 90 days; (107) keep AI on by
default; (108) prefill probation months from probation.default_months. Industry: the industry list moves into a table,
each industry names the law tables that apply, and a draft for an industry without its own tables shows "Law check
covers general labour law only; <industry> rules are not checked yet; review with counsel", which the publisher must tick
as seen.

Founder approved, 4 Nov 2026 (questions 121-124, all as suggested): (121) a late injury correction gets "Not paid, with a
reason", logged; (122) keep the four-month look-back; (123) keep maternity and suspension days in the same card; (124) keep:
the System Admin decides a report nobody else may; give an HR person the key for that entity. Demo: the November payroll run
may be started for one demo-org pay group to walk the Special days card.

Founder approved, 4 Nov 2026 (questions 111-115, all as suggested): (111) the first industry tables are Factories Act
annual leave for Manufacturing and Food and consumer goods, as a reviewed rule set (verify); (112) keep: the new state
tables also set Time's leave minimums in those states; counsel confirms the rows before go-live; (113) keep Maharashtra
earned leave as "ask counsel"; (114) keep: only the platform adds an industry; (115) keep: POSH under 10 people is
unchecked, the district Local Committee may apply.

Founder approved, 4 Nov 2026 (questions 131-134, all as suggested): (132) a company setting for industry (default none)
and a "registered factory" flag per location, read by both the policy writer and Time; (131) then Time applies the
factory carry-forward minimum at registered-factory locations only; (133) keep the 1-in-20 rate as "ask counsel"; (134)
keep the factory table national and verify; add state rows once counsel lists the amendments.

Founder approved, 4 Nov 2026 (questions 141-144, all as suggested): (141) the location's Registered factory flag is the
single source: a flagged location counts as covered by the Factories Act for overtime and the 240-day eligibility too,
unless attendance.factories_act excludes a department or employment type (for example office staff on a factory site);
the location form says so; (142) after counsel confirms, the factory leave minimum covers only the employment types the
Act counts as workers, as overtime does (GO-LIVE-CHECKLIST); (143) keep one industry per company; (144) keep: the
1-in-20 rate is not applied to leave credits until counsel signs off the rate and the days-worked source.

Founder approved, 4 Nov 2026 (questions 151-153, all as suggested): (151) nothing moves automatically; the location page and
Time set-up show "Mark the location as a registered factory to make it the one source" where an old location-level
"covered" value exists; HR ticks it, then the old value can be removed; (152) after go-live, stop offering company / entity
/ location scopes for attendance.factories_act once no company uses them (GO-LIVE-CHECKLIST); (153) keep: a department
exclusion applies at every flagged site.

## Founder decision (12 Nov 2026, "ok for all")
Draw kit designs for the five live pages that still render stand-ins (service catalogue, live chat requester and agent, agent team and shifts, the set-up admin tabs, the request tracker and documents on a ticket), then make the drawn screens live. Also add rows for the 3 newer stories the count script flags (HLP-02 x2, Phase 3b-1 x1). Queued for the next free builder.
- Founder (12 Nov 2026, "ok for all"): after drawing the five designs, move every remaining "Screens/Service desk/" story into "Screens/Helpdesk/" with plain names (Desk set-up, Customer portal, Approval links, Contact YukthiX; the Reports tabs under HLP-05), then remove the empty Service desk folder. Storybook titles only; no live behaviour changes. Queued with the five designs for the next free builder.
- Founder (12 Nov 2026, "ok for all"): widen the desk for IT, facilities and business applications, smallest first:
  1. IT starter catalogue (new laptop, software install, VPN access, password reset, new-joiner kit), like the other
     desk kinds' starter packs (about 1 day).
  2. Pick a device on a ticket from the People asset register (the `pick/assets` picker now returns nothing; about 2 days).
  3. Business applications list (owner per app) and access requests routed to the app owner; design first (about 4 days).
  4. Buildings and equipment for facilities work orders, with recurring maintenance on them; design first (about 4 days).
  5. IT change requests and problem records (ITSM change and problem); design and founder questions first (larger).
  Queued after the five stand-in designs and the one-folder move, for the next free builder.
- Founder (12 Nov 2026, "ok for all"): 1601 to 1603 approved as suggested (founder looks at HLP-15 to HLP-19 in
  Storybook; changes go into the drawing and the page together; long set-up pages scroll with header and tabs in view;
  draw the help article view from HLP-04 next).
- Founder (12 Nov 2026, "ok for all"): from the Frappe Helpdesk feature comparison (features only; AGPL code never
  copied), approved as suggested: 1641 custom fields on tickets with dependent drop-downs; 1642 search synonyms with an
  Indian HR starter list; 1643 preset reasons with a rating; 1645 Exotel click-to-call and call log on tickets (needs the
  company's Exotel account); 1646 "we're closed now" with the next opening time and an outside-hours flag; 1647 store
  where a ticket came from (article or search) and show it in content gaps; 1648 fuller per-ticket timing; 1649 desk
  actions in the command palette; 1650 field-level hiding for custom fields (after 1641). Check before building: a note
  on the ticket when a reply bounces; customer admins inviting colleagues to the portal. (1644 dropped: desk automation
  rules already call webhooks with ids only.) Order after IT items 1-2: 1603, 1642, 1643, 1646, 1647, 1641, 1650,
  1648, 1649, then items 3-5 of the IT/facilities plan, then 1645.
- Founder (12 Nov 2026, "ok for all"): 1661 to 1663 approved as suggested. To build: a "Device" field on IT desk tickets, set or changed by IT agents and shown in the ticket details, drawn first (1661); "Which device?" on plain IT tickets when the person has a device assigned (1662).
- Founder (12 Nov 2026, "Ok for all"): 1681 to 1685 approved as suggested. To build: "Search words" moves to its own knowledge-base settings page (1681); rating reason in the one-click email rating and the chat rating (1682); "outside hours" flag only on tickets the person raised themselves, not agent-logged ones (1683); a "Searches that led to tickets" list, counts only (1684); "Which device?" shows when the person the ticket is for has a device (1685).
- Founder (13 Nov 2026, "Ok for all"): 1801 to 1804 approved as suggested. To build: "On behalf of" on the help-centre raise form for people allowed to raise for others (1801); ask "Who is this for?" before the item form when an item has a device field (1802); a search shows in "Searches that led to tickets" only once at least 2 different people used it (1803); split desk Settings into "Tickets" and "Requesters" tabs (1804).

## 1648 and 1649 built (13 Nov 2026, `feat/yukthix-helpdesk-timing-palette`): questions for the founder

1648: on a ticket's response targets card, agents see "Timing": the average wait for a reply, time on hold, how many
times it moved (queue or owner) and the agents involved, in business time on the calendar of the ticket's resolution
target (the SLA engine's clock), from the work panel (`GET /desk/tickets/:id/work`, agents only; observers,
collaborators and requesters never get it). 1649: in Ctrl K, an agent types a ticket number to open it (only a ticket
they may open, `GET /desk/tickets/by-number/:number`); on an open ticket, "Insert saved reply: …" and "Run scenario: …";
and "Set my status: …". Each shows only with its key (viewing or working tickets), and the API checks it again. Drawn
first: the command palette's "desk actions" story and timing on the HLP-03 work panel story.

1861. **The average wait.** From the ticket opening, or a requester's message, to the next public agent reply (notes
      and side conversations do not count); several requester messages in a row count from the first. *Suggested: keep.*
1862. **Time on hold** counts only the "On hold" status (not "Waiting on the requester"), in business time.
      *Suggested: keep; add the waiting time as its own line if you want it.*
1863. **Moves.** Each change of group, and each change of owner after the first (the first assignment is not a move;
      taking the owner away is). *Suggested: keep.*
1864. **Agents involved.** Everyone who replied or wrote a note, was the owner, or logged time on the ticket.
      *Suggested: keep.*
1865. **Palette saved replies** list the desk's and the agent's own active saved replies, all of them; Ctrl K's search
      narrows them as the agent types. *Suggested: keep.*

- Founder (13 Nov 2026, "all ok"): 1841 to 1846, 1861 to 1865, 1891 to 1894, 1911 to 1914 and 1931 to 1943 approved as suggested. To build: article-review cards to KB settings (1841); requesters fill "everyone" fields (1842); "Required before solving" per field (1843); field values in CSV and custom reports, lead-only to leads (1844); on-behalf picker shows only people one may raise for (1846); an "Application access" item in the IT starter catalogue (1891); an access register per application, later (1892); warn the Service Desk owner when an app owner leaves (1894); requesters name the building or area (1911); tell facilities admins when a schedule pauses (1913); "show more" on equipment history (1914); ITSM-1 to ITSM-4 as planned (1931-1943).
- Founder (13 Nov 2026): 1601, HLP-15 to HLP-23 designs reviewed in Storybook, "its good".
- Founder (13 Nov 2026): 1951 to 1958 (ITSM changes) approved as suggested.

## Founder request: "Ask YukthiX" assistant (13 Nov 2026, "yes and ok for all", 2101 to 2108)
A help assistant that answers questions about YukthiX like a support agent, built on the drawn HLP-01 assistant slot,
the knowledge base's "use in assistant answers" flag, Contact YukthiX tickets and the sales-assist queue.
- 2101: inside the app first (Help drawer and Help centre); the public website version second.
- 2102: Claude through YukthiX's own Anthropic account (YukthiX pays); the key lives only in server config, never in
  chat or the repo. The AI sees only the question and approved help text, never company data.
- 2103: answers only from approved YukthiX content (help articles, guides, plan facts, What's new, known issues), each
  answer citing its article; when nothing covers it, it says so and offers a person. Never guesses.
- 2104: hands over when unsure, when the issue needs someone to look at the account, after 2 unhelpful answers, or on
  request: "Raise support ticket" creates a Contact YukthiX ticket with the chat attached.
- 2105: "Send feature request" lands in a staff Feature requests list (duplicates grouped with a company count;
  Planned, Not now, Done; the company is told when it ships). Buying or upgrade questions go to sales-assist.
- 2106: English first, then Hindi, Tamil and Telugu.
- 2107: everyone in a customer company; answers follow the person's role.
- 2108: 50 questions per person per day, a platform setting.
Staff view: unanswered questions, thumbs up or down, chats that became tickets. About 2 to 3 weeks; drawn first.

### Ask YukthiX as built (branch `feat/yukthix-ask-assistant`)
- **Where:** the Help drawer's "Ask YukthiX" tab (every page; 2101). Staff: Console › Feature requests (requests and the
  Ask YukthiX review).
- **Claude (2102):** the official SDK (`@anthropic-ai/sdk` 1.3.0, API version 2026-10-21), YukthiX's own key in server
  config only: `ASK_YUKTHIX_ANTHROPIC_API_KEY` (unset: "not switched on yet" with Contact YukthiX). Model: platform
  setting `help.assistant.model`, default `claude-opus-5-5`; low effort; structured output; the server-side refusal
  fallback on models that take it. No tools: the model cannot act.
- **Content (2103):** only YukthiX help articles marked "Use in assistant answers" (the platform company's public space),
  What's new for the person and the current known issue; the person's role and the areas they can open (2107); never
  company records. Every answer cites its article or says it is not covered; refusals and broken replies are never shown.
  The question and the articles are data: the system prompt says so, and they never enter it.
- **Hand-over (2104, 2105):** "Raise support ticket" (the Contact YukthiX ticket with the chat, through its own service;
  only with its key, `org.yukthix_support.raise`); "Send feature request" for everyone; each once per chat, audited. A
  person is offered after `help.assistant.unhelpful_handover` (2) unhelpful answers or thumbs down. Buying questions get a
  note pointing to sales.
- **Limits and data (2108):** `help.assistant.daily_questions` (50) per person per India day, counted atomically in the
  database (a failed answer gives the question back). Chats in RLS-forced tables, the person's own (staff read them for the
  review); deleted after `help.assistant.keep_days` (90). Refused while acting as the person.
- **Staff:** the review (answers by outcome, thumbs, questions help did not answer with personal data, phones and emails
  hidden, chats that became tickets) and Feature requests (duplicates grouped with a company count; Planned, Not now, Done;
  Done tells everyone who asked, once; audited), with the help centre writers' key.
- **Tests:** API unit (prompt, reply checks, key, masking), e2e `ask-yukthix` (11), kit `ask-yukthix` (6) and
  `feature-requests` (3), web console page (2). Stories: seven Help drawer · Ask YukthiX, three Feature requests.

### Questions (from 2111)

2111. **Tickets from people without the Contact YukthiX key.** Only System Admins (the key) raise a ticket from a chat;
      others are told their System Admin can. *Suggested: keep; their feature requests and thumbs still reach YukthiX.*
2112. **Buying questions.** The assistant says YukthiX sales can help and points to Plan & add-ons; the sales-assist
      request there needs a nudge and a phone number. *Suggested: a sales request straight from the chat, asking for the
      phone there, with the chat attached.*
2113. **Who decides feature requests.** The help centre writers' key (`platform.helpcentre.write`).
      *Suggested: a key of its own, `platform.feature_requests.manage`, for product staff.*
2114. **The Service Desk Help centre (HLP-01) assistant card.** It is the company's own policies assistant and still says
      it is not switched on. *Suggested: leave it; Ask YukthiX lives in the Help drawer on every page, the Help centre
      included.*
2115. **Languages (2106).** English only for now. *Suggested: answer in Hindi, Tamil or Telugu once those help articles
      are translated.*
2116. **"Use in assistant answers" for YukthiX articles.** The switch is on by default and only the company KB editor
      shows it; the console help centre editor does not. *Suggested: add the switch to the console editor.*
2117. **The public website version (2101, second).** Not built. *Suggested: after the in-app one has a month of the
      review.*

**Founder answers (16 Nov 2026, "ok for all"), 2111 to 2117:**
- 2111: keep, only System Admins raise a ticket from a chat; others are told to ask them.
- 2112: yes, a sales request straight from the chat for buying questions.
- 2113: yes, feature requests get a permission of their own.
- 2114: leave the HLP-01 company-policies assistant card as it is.
- 2115: Hindi, Tamil and Telugu once those articles are translated.
- 2116: yes, add the "Use in assistant answers" switch to the console help-centre editor.
- 2117: the public website version after a month of the review.
Queued: 2112, 2113, 2116 (small follow-up slice).
