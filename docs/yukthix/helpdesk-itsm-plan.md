# Helpdesk plan item 5: IT change requests and problem records (ITSM)

Design and questions only (13 Nov 2026, branch `docs/yukthix-helpdesk-itsm`). Nothing is built and no migration is
written until the founder answers the questions below. The drawn screens are in the design kit as
**Screens/Helpdesk/HLP-22 · Changes and problems** (`packages/yx-ui/src/screens/ops/hlp-22-itsm.tsx`,
`hlp-22.stories.tsx`).

## 1. What a small or mid-size Indian IT team needs (kept lean)

The companies we serve have an IT team of 2 to 30 people, often one IT head, a few engineers and an outsourced partner
for the network or ERP. They do not run a full ITIL office. What hurts them is: a change made on a Friday evening that
takes payroll down on the 1st; nobody knowing what changed when something breaks; the same incident coming back every
month because nobody owns the cause; and auditors (ISO 27001, SOC 2, RBI/SEBI for regulated firms) asking for evidence
that changes were approved and reviewed. So the two records do only this:

### Change requests (current practice: "change enablement")

- **Request.** What will change, why, which services and locations it touches, who does it, the plan to do it, the
  test, and the way back (backout plan). Raised from scratch, from an incident or problem ("fix it properly"), or from a
  template for a routine change.
- **Three kinds.**
  - *Standard*: a routine, pre-approved change done from a template (for example "add a user to the VPN", "monthly
    patching of laptops"). No approval each time; it is logged and scheduled.
  - *Normal*: assessed and approved before it is scheduled.
  - *Emergency*: needed now to stop or prevent an outage; approved quickly by one or two people, reviewed afterwards.
- **Risk.** Five plain questions (how many people it affects, can it be undone, was it tested, has it been done before,
  does it touch payroll, attendance or money) give Low, Medium or High. The agent can raise the risk, never lower it
  below the answers without saying why.
- **Approval (CAB).** Who approves follows the risk: Low by the IT lead alone, Medium by the IT lead and the service
  owner, High by the change advisory board (a named group; for most of our customers 3 to 5 people meeting weekly or
  approving online). Emergency changes need one approver now and the board's review later. Approvals use the existing
  approvals engine (every step, reminder and escalation as today).
- **Schedule.** A start and end time inside the company's change windows (for example weeknights after 8 pm), never in
  a freeze (by default the payroll days: the first 7 and last 3 days of the month, and statutory due dates, the same
  rule the platform uses for its own maintenance). Clashes with another change on the same service are flagged. People
  affected see a known-issue banner before and during the window.
- **Implement.** A checklist of tasks (the existing ticket tasks), started and finished with times, and the outcome:
  done, done with problems, or backed out.
- **Review.** After a High, Emergency or failed change: did it work, did it cause incidents (linked automatically when
  an incident is linked as "caused by" this change), what to do differently. Closed only after the review.
- **Linked incidents.** A change links to the incidents and problem that asked for it, and to the incidents it caused.

### Problem records ("problem management")

- **Many incidents, one cause.** An agent links any number of incidents to a problem (from the ticket, or by picking
  several in the ticket list). A problem is also suggested when the same category gets N incidents in M days.
- **Root cause.** Who investigates, what was found, and a cause category (hardware, software, network, vendor, process,
  people, unknown). Time spent is logged as on any ticket.
- **Known error.** When the cause is known but not yet fixed, the problem becomes a *known error* with a workaround.
- **Workaround into the knowledge base.** One click drafts a knowledge-base article from the workaround (for agents
  only, or for everyone), and optionally a known-issue banner with "Me too", so new incidents are linked instead of
  raised again.
- **Permanent fix.** A change request raised from the problem; when that change is done and reviewed, the problem is
  closed and its linked incidents are told.

Not in scope (too heavy for our customers, or for later): a configuration management database with relationships
between every item, release management, change models with many custom stages, service maps, and AI root-cause
analysis. The device on a ticket (1661) and the business applications list (plan item 3) already give the "what is
affected" we need.

## 2. What already exists to build on

| Building block | Where | How changes and problems use it |
|---|---|---|
| Tickets with types, statuses, priorities, groups, assignees, numbers per desk | `apps/api/src/service-desk/tickets.service.ts`, `dto.ts` (`TYPE_KINDS = incident, request, question`) | A change and a problem are tickets of two new type kinds on the IT desk, with their own statuses; everything a ticket has (thread, notes, files, time, watchers, collaborators, SLA, audit) comes free. |
| Ticket links | `dto.ts` `LINK_KINDS` (related, blocks, caused_by, tracked_by); `work.service.ts` (link, merge, split, parent) | Incident "caused by" a change; incidents "tracked by" a problem; a change "fixes" a problem (a new link kind). |
| Trackers (major incidents) | `tickets.service.ts` `solveTracked` (US-G-220) | When a problem is closed, its linked incidents get one reply and are solved, as a tracker does today. |
| Approvals engine | `apps/api/src/workflow/approvals-engine.service.ts`; ad-hoc approvals on a ticket in `catalog.service.ts` (`askApproval`, `adhocDecided`) | The CAB approval is an approval request on the change, with steps by risk, reminders, escalation and audit; no second approval system. |
| Tasks on a ticket | `SdTask` in `schema.prisma`; `work.service.ts` (tasks, checklists) | The implementation plan and the review are task checklists. |
| Recurring records | `recurring.service.ts`, `recurrence.ts` (RFC 5545 rules, runs, late/missed) | Standard changes on a schedule (monthly patching) are recurring records made from a change template. |
| Templates | `SdTemplate` and `DeskTemplates` | Standard-change templates (pre-approved) and normal-change templates. |
| Known-issue banners with "Me too" | `SdBanner`; `portal.service.ts` (`myBanners`, `myMeToo`); `/yx/desk/known-issues` | Banners before and during a change window, and for a known error, linking new incidents to the change or problem. |
| Knowledge base | `kb.service.ts`; "make an article from a ticket" on the ticket workspace (`TicketKbCard`) | The workaround of a known error becomes a draft article. |
| Business calendars and the SLA engine | `business-time.ts`, `sla.service.ts`, `sla-engine.ts` | Review deadlines and "approve within" targets in business time; no second clock. |
| Maintenance windows with freeze days | `apps/api/src/platform/maintenance.service.ts` (payroll days and statutory dates blocked, notice hours, banner hours) | The same rules, as company settings for change windows and freezes (YukthiX's own platform windows stay as they are). |
| Desk automation | `desk-automation.ts` | "When an incident is linked to a problem", "when a change is approved" triggers for the company's own rules. |
| Reports | `reports.service.ts` | Changes by kind and outcome, failed-change rate, problems open and age, incidents per problem. |
| Device on a ticket (1661), business applications (plan item 3) | `asset-pick.ts` | What a change touches, without a CMDB. |

## 3. The drawn screens (design kit)

**Screens/Helpdesk/HLP-22 · Changes and problems** (`packages/yx-ui/src/screens/ops/hlp-22-itsm.tsx`), in the HLP style
(the ops desk frame, page header, kit table, cards, approval timeline, drawers):

- **Changes**: the list with kind, risk, status, window and linked incidents; the change calendar for the next two
  weeks with freeze days and clashes; empty.
- **New change** (drawer): kind as a single choice, services, the five risk questions with the risk worked out, window,
  plan, test and backout plan; errors shown when pressed too early.
- **A change**: waiting for approval (the approval route by risk), scheduled with a clash warning, in progress with the
  implementation checklist, and review after a failed change with the incidents it caused.
- **Problems**: the list with incident counts and age; a problem with its linked incidents, root cause and workaround;
  a known error with "Draft a knowledge-base article" and "Show a known-issue banner".
- **No access**: someone without the IT desk.

## 4. Questions for the founder (from 1931)

1931. **Where they live.** Change requests and problems are two new ticket types on IT desks only (not HR, payroll or
      facilities), so they share the ticket list, search, SLA and audit. *Suggested: yes; facilities can be added
      later as a setting per desk.*
1932. **Who raises a change.** IT agents and IT leads of the desk; never requesters. *Suggested: keep; a requester asks
      through a normal request, and an agent turns it into a change.*
1933. **Risk questions.** Five fixed questions give Low, Medium or High; the agent may raise the risk but lowering it
      below the answers needs a reason. *Suggested: keep the five as the starter, editable per desk (a desk setting
      with these defaults).*
1934. **Who approves.** Low: the IT lead; Medium: the IT lead and the service owner; High: the change board (a named
      group of the desk), all members or a majority as the desk chooses; Emergency: one IT lead now, the board reviews
      within 2 working days. *Suggested: these as the desk's defaults, each changeable in desk set-up.*
1935. **Standard changes.** A desk lead marks a template as pre-approved; changes from it skip approval but are logged,
      scheduled and can be reviewed. *Suggested: keep; a standard change that fails loses its pre-approval until a
      lead restores it.*
1936. **Change windows and freezes.** Default window: weekdays 8 pm to 6 am and weekends; default freeze: the first 7
      and last 3 days of each month and the 7th, 15th and 20th (the payroll and statutory days we use for our own
      maintenance). *Suggested: these as company settings with these defaults; an emergency change may go into a
      freeze with a reason, never silently.*
1937. **Telling people.** A known-issue banner for the people and locations affected, from 24 hours before until the
      window ends, and an email to the service owners. *Suggested: on by default, a setting per change with the
      24 hours as a desk setting.*
1938. **Review after a change.** Required after a High, Emergency or failed change, due within 5 working days; optional
      otherwise. *Suggested: keep; the 5 days a desk setting.*
1939. **Problems from repeats.** Suggest a problem when the same category on the same desk gets 3 incidents in 7 days.
      *Suggested: on, with 3 and 7 as desk settings; it is a suggestion to an IT lead, never automatic.*
1940. **Known errors in the knowledge base.** The workaround drafts an article for agents only by default; a lead can
      make it public. *Suggested: keep.*
1941. **Closing a problem.** When its fixing change is done and reviewed, the problem closes and every open linked
      incident gets one reply and is solved (as trackers do). *Suggested: keep, with the reply text editable.*
1942. **Licence.** Changes and problems are part of the IT desk (the Service Desk add-on), not a separate add-on.
      *Suggested: keep.*
1943. **Audit evidence.** A change export (PDF or CSV) with the request, risk answers, approvals with times, schedule,
      outcome and review, for ISO 27001 and SOC 2 audits. *Suggested: build it with the first slice.*

## 5. Build plan (after the answers)

| Slice | What | Size |
|---|---|---|
| ITSM-1 | Ticket kinds `change` and `problem` on IT desks with their statuses; desk settings (risk questions, approval route by risk, review days, repeat rule) with defaults; company settings for windows and freezes; new link kinds (`fixes`, `caused_by` reused); migrations with forced RLS. | M, 4 days |
| ITSM-2 | Change request: the new-change drawer, risk worked out, approval route through the approvals engine, schedule with window, freeze and clash checks, banners, implementation checklist, outcome, review; standard-change templates and recurring standard changes. HLP-22 change screens live. | L, 7 days |
| ITSM-3 | Problems: link many incidents (from a ticket and in bulk), root cause, known error, workaround to a draft article and banner, fix by change, closing tells the incidents; the repeat suggestion. HLP-22 problem screens live. | M, 5 days |
| ITSM-4 | Reports (changes by kind and outcome, failed-change rate, open problems by age, incidents per problem) and the audit export; desk automation triggers. | S, 3 days |

About 19 working days for one builder, or about 2 weeks for two (ITSM-2 and ITSM-3 in parallel after ITSM-1). Every
slice: drawn first in HLP-22, positive and negative tests, forced RLS on new tables, policy as settings with defaults.

**Founder answers (14 Nov 2026, "ok for all"), 2051 to 2058:**
- 2051: yes, "Me too" on the known-error notice raises an incident already linked to the problem.
- 2052: yes, "done with problems" closes the problem; a backed-out change does not.
- 2053: as built, raised in the name of the person who set up the schedule.
- 2054: yes, the desk's IT leads also get a notice when a scheduled run is skipped.
- 2055: keep it, no export on the asked-about Changes view.
- 2056: yes, later: the notice can be limited by location or application (setting, default all employees).
- 2057: yes, repeats count by category or by the same application.
- 2058: yes, "Raise a change to fix it" opens the New change drawer with the problem linked.

**Founder answers (16 Nov 2026, "ok for all"), 2071 to 2075:** all as suggested.
- 2071: a one-lead desk falls back to the desk admin for approval; desk setting, on by default.
- 2072: the "Me too" toast gets an "Open it" action to My cases.
- 2073: leave old notices; only new notices drop the prefix.
- 2074: accept three fields on one line everywhere; the lead checks the 9 affected screens.
- 2075: make the hourly-limit automation e2e wait for the rule's run instead of timing.
Queued: 2071, 2072, 2075.

**Founder answers (16 Nov 2026, "ok for all"), 2091 to 2093:** all as suggested.
- 2091: keep, "Open it" opens the raised ticket.
- 2092: lock per rule around the hourly-limit check and the run (queued).
- 2093: a small notice list in the console header later, starting with kept-record removals and breach reminders (queued).

### Rule lock as built (branch `feat/yukthix-rule-lock`, 16 Nov 2026; answer 2092)
- **What:** with more than one API server, two rule runners could pass a rule's hourly-limit check at the same moment
  and both run. A rule's run now takes a per-rule Postgres advisory lock (`pg_advisory_xact_lock` on the rule id) for the
  run's transaction, counts the rule's matched runs in the last hour again under the lock, and only then runs the
  actions. A runner that finds the limit reached under the lock keeps nothing of its run, records `limit_stopped` and
  pauses the rule; only the runner that actually paused it tells the admins and writes `rule.paused_at_limit`, once.
  The quick unlocked check before stays (no lock needed when the rule is clearly at its limit). Other rules never wait
  on this rule's lock. No migration.
- **Proof:** e2e `rule-lock` fires runners in parallel through the real engine and database with an action that takes
  400 ms: limit 1 with two runners gives one run and one stop; limit 3 with six gives exactly three; under the limit
  nobody is stopped; two rules do not hold each other. With the lock taken out the first test fails (2 runs on a limit of 1).

### Questions (from 2171)

2171. **The per-minute company limit.** The company's 300 rule runs a minute is still checked without a lock, so many
      servers at once can pass it by a few runs. *Suggested: keep; it is a guard against storms, not a promise to the
      company, and the per-rule limit now holds exactly.*
2172. **Long actions hold the rule.** While one record's actions run, the same rule on another record waits (up to the
      run's length). *Suggested: keep; rule actions are short database changes (webhooks go to a queue).*
