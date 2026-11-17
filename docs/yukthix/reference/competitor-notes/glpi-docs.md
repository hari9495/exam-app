# GLPI: functional reference from the official docs

GLPI is an open-source IT service management (ITSM) and IT asset tool from Teclib. It covers an asset register
(CMDB), a helpdesk run on ITIL lines (tickets, problems, changes), contracts and finance, a knowledge base, and a
multi-entity admin model. These notes cover what it does: its features, rules and settings. They are a functional
reference for the YukthiX Helpdesk and IT service desk. The docs describe GLPI 11.

**Sources (read 17 Nov 2026, public, no login):**
- Current English user docs (GLPI 11): https://help.glpi-project.org/documentation/ (page index at
  https://help.glpi-project.org/llms.txt)
- Older user docs (now frozen; they point to the site above): https://glpi-user-documentation.readthedocs.io/
- Dashboards tutorial: https://help.glpi-project.org/tutorials/readme-1/dashboard
- Module list and licence: https://github.com/glpi-project/glpi (README)

**Licence note.** GLPI is GPL v3. These notes are a summary, in our own words, of what the product does. They take
**ideas and features only**. No GLPI code, schema or text has been copied or adapted, and none may be. Build anything
taken from here clean-room, from these notes, never from the GLPI source.

Links below drop the `.md` suffix. Both forms open the same page.

---

## 1. Assets / CMDB

- **Asset types.** Computers, monitors, software, network equipment, peripherals, printers, cartridges, consumables,
  phones, racks, enclosures, PDUs, passive devices, cables, SIM cards and "unmanaged" assets (devices seen on the network
  but not managed). A global search covers all of them.
  [assets](https://help.glpi-project.org/documentation/modules/assets)
- **Custom asset types (new in 11).** An admin defines a new asset type: a label, an icon and the "capacities" it
  gets (software, network ports, contracts, documents and so on). It can have custom fields of type text, number,
  date, URL, yes/no or dropdown. Each field can be mandatory, take a default, or be read-only or hidden per profile.
  Rights are set per profile, with "assigned" and "owned" variants, plus which profiles may link the type to tickets.
  [asset definitions](https://help.glpi-project.org/documentation/modules/configuration/asset-definitions)
- **Computer record.** Name, status, location, technician and group in charge, the main user and an alternate user,
  type, maker, model, serial, inventory number and UUID. Tabs:
  - hardware components and disk volumes (with an "encrypted" flag)
  - installed software, connected peripherals and network ports (VLAN, link)
  - management (finance), contracts, remote-access tools found on it, antivirus
  - tickets, problems and changes; reservations; history; locks
  [computers](https://help.glpi-project.org/documentation/modules/assets/computers)
- **Inventory agent.** The GLPI Agent sends hardware and software inventory and keeps the record up to date. Any field
  edited by hand is **locked**, so the next inventory does not overwrite it. Import rules decide how incoming data
  maps to records (see 4).
  [computers](https://help.glpi-project.org/documentation/modules/assets/computers)
- **Software and versions.** A software belongs to an entity. Versions are what gets installed, with an installation
  count per version. Uninstalling keeps the licence on the machine but clears the version in use. Dictionaries clean
  up software names as they come in from inventory.
  [software](https://help.glpi-project.org/documentation/modules/assets/softwares)
- **Consumables** (cables, USB sticks, spares). A type, stock count, alert threshold and stock target. Items are
  issued to a user or group and can be returned to stock. The agent cannot track them.
  [consumables](https://help.glpi-project.org/documentation/modules/assets/consumables)
- **Racks / data centre.** A rack has its room position, door orientation, units, size, power limits (maximum and
  measured watts) and maximum weight. An Items tab shows a picture of where each device sits in the rack. Data
  centres, clusters, appliances, databases, domains and certificates are kept under Management.
  [racks](https://help.glpi-project.org/documentation/modules/assets/racks)
- **Financial and admin info** (the Management tab on any asset; off by default):
  - lifecycle dates: order, purchase, delivery, start of use, last physical inventory, and end of life ("reform")
  - supplier, order, invoice and delivery-note numbers, and the budget it is charged to
  - purchase value, warranty start and months (the expiry date shows in red once passed), warranty extension cost
  - depreciation: linear or declining, over a number of years, giving a net book value
  - total cost of ownership: value plus intervention costs, also shown per month
  - per-entity rules can fill these dates in automatically when an asset's status changes
  [management tab](https://help.glpi-project.org/documentation/modules/tabs/management)
- **Relations between assets.** Connections (a monitor or phone attached to a computer), rack placement, and the
  **impact analysis** graph. Arrows show what fails if this item fails and what this item depends on. Items can be
  grouped in labelled boxes, the number of levels shown can be limited, and the graph can be saved as a PNG.
  [impact analysis](https://help.glpi-project.org/documentation/tabs/impact_analysis)
- **Templates and auto-numbering.** Asset templates pre-fill the shared fields. A field pattern can build values such as
  inventory numbers from a counter padded to a set width, plus year, month or day codes.
  [templates](https://help.glpi-project.org/documentation/modules/overview/templates)
- **Reservations.** An item is made bookable from its Reservation tab. A booking is for a user, with a start and an
  end. Bookings can repeat daily, weekly on chosen days, or monthly, and need an end date. A search finds items free
  for a given period. "Make unavailable" hides an item's bookings without losing them, while "prohibit" deletes
  them. There is a global planning view and one per item, and the Loan report lists a person's past, current and
  future bookings. [reservations](https://help.glpi-project.org/documentation/modules/tools/reservations)

## 2. Assistance

### Tickets
- **Ways in:**
  - simplified portal form, or the full form for agents
  - service-catalogue forms
  - a public page for people who are not signed in (confirmed by email)
  - email to a collector mailbox
  - recurrent tickets
  - an operator or group delegate raising a ticket for someone else
  [opening a ticket](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketopening)
- **Actors.** Requester, watcher (observer) and assignee. Each can be a user or a group, and the assignee can also be
  a supplier. While picking an assignee, the screen shows how many tickets that person or group already has. People
  without an account can be added by email address.
  [actors](https://help.glpi-project.org/documentation/modules/assistance/actors)
- **Types and statuses.** Two types, incident and request. Seven fixed statuses: New, Approval,
  Processing (assigned), Processing (planned), Pending, Solved, Closed. Assigning moves a ticket to
  "assigned", and adding a scheduled task moves it to "planned". The requester accepting the solution closes it. A
  requester can delete a ticket only while it is still New and untouched.
  [life cycle](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketlifecycle)
- **Life cycle matrix per profile.** Each profile has a grid of the status moves it may make, separately for tickets,
  problems and changes. On the portal, the grid also decides whether a user may close a solved ticket or reopen a
  closed one. [life cycle matrix](https://help.glpi-project.org/documentation/modules/administration/profiles/lifecyclematrix)
- **Priority matrix.** The requester sets urgency and the technician sets impact. Priority is looked up in an
  urgency × impact grid that an admin can edit, and it applies to tickets, problems and changes. Any urgency or impact
  level can be switched off except Medium. A separate **Major** priority sits above the grid and needs its own right.
  [priority matrix](https://help.glpi-project.org/documentation/modules/assistance/prioritymatrix)
- **Categories.** A tree, each category with a technician and group in charge. A category can be hidden from the
  portal, shown or hidden per type (incident, request, problem, change), and tied to a template and to a default
  knowledge-base category.
  [categories](https://help.glpi-project.org/documentation/modules/configuration/dropdowns/categories)
- **Templates and mandatory fields.**
  - Templates make fields mandatory, predefined or hidden. A hidden mandatory field does not block saving.
  - Which template applies: the one for the category and type first, then the profile's default, then the entity's
    default. Changing entity, type or category while filling in the form picks the template again.
  - Templates also apply on update and to recurrent tickets. Fields marked with a red star must be filled.
  [templates](https://help.glpi-project.org/documentation/modules/overview/templates)
- **Follow-ups.** Public or private (private ones need a right to see), with the source recorded (email, phone, web
  and so on), templates, attachments, and an optional notice when edited. A follow-up can be **turned into a new
  ticket**. [follow-up](https://help.glpi-project.org/documentation/modules/assistance/tabs/followup)
- **Tasks.** Public or private, estimated duration, state (information, to do, done), category, and an assignee
  (person or group). A task can be scheduled with a reminder, and time spent can be logged. Task templates exist. A
  task carrying a pending reason puts the ticket on hold.
  [task](https://help.glpi-project.org/documentation/modules/assistance/tabs/task)
- **Pending reasons.** Each reason has its own calendar, a follow-up template and a solution template. While pending,
  the ticket sends **automatic reminders** to the requester, from daily to every 4 weeks, within working hours. After 0
  to 3 unanswered reminders it is **solved by itself**. The requester's reply ends the hold.
  [pending reason](https://help.glpi-project.org/documentation/modules/assistance/tabs/pending-reason)
- **Solutions.**
  - Solution types (fix, workaround, information given and so on) are shown per kind of record and used in
    statistics.
  - Solution templates with variables.
  - Search the knowledge base from the solution form, or save the solution as a new article.
  - The requester accepts or refuses the solution. With no answer it is accepted after a set delay (15 days by
    default). A profile right decides who may accept solutions and answer surveys.
  [solution](https://help.glpi-project.org/documentation/modules/assistance/tabs/solution)
- **Administrative closure.** A solved ticket closes by itself after a delay set per entity, counted in calendar
  working time. Zero closes it at once.
  [to go further](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketadvanced),
  [automatic actions](https://help.glpi-project.org/documentation/modules/configuration/crontasks)
- **Links.** Four kinds:
  - "linked to" (for information only)
  - "duplicates" (closing one closes all of them)
  - parent and child (children close before the parent)
  There is a Costs tab and a Statistics tab (SLA met, time to process, time waiting).
  [manage tickets](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketmanagement)
- **Approvals (validation).**
  - A request goes to one user, to one group (any member's answer counts for the whole group), or to chosen members of
    a group. Approval templates have variables and translations.
  - **Steps** each have a minimum approval percentage, for example 50 % of two approvers means one yes is enough.
  - A chain of steps (HR, then accounting, then IT, then the department head) is driven by business rules. A rule
    sends the next request when the previous one is granted, and another closes the ticket on a rejection.
  - Approvers answer by email or in the ticket, and can change their answer later.
  [approvals](https://help.glpi-project.org/documentation/modules/assistance/tabs/approvals)
- **Satisfaction surveys.** Set per entity, separately for tickets and changes:
  - internal (GLPI's own form) or external (a URL with ticket tags filled in)
  - sent from 0 to 90 days after closing, to a set share of closed tickets
  - open for up to 100 days, and only for tickets closed after a chosen date
  - scored 0 to 10 as stars; a comment is required at or below a threshold score
  - the requester can change the answer within 12 hours; results appear in the statistics
  [satisfaction survey](https://help.glpi-project.org/documentation/modules/assistance/tabs/satisfaction-survey)
- **SLAs and OLAs.** An SLA is the promise to the customer, and an OLA is an internal promise between teams. Each has
  a TTO (time to own, that is to assign) and a TTR (time to resolve), and a ticket can carry both an SLA and an OLA.
  - Time runs around the clock unless a calendar is attached (the SLA's own or the entity's).
  - Targets in days count working days, optionally to the end of the working day. Targets in hours count opening hours
    only.
  - **Pending pauses the clock** and pushes the due date out.
  - Business rules can attach an SLA by category, but cannot replace one already set by a person or a template.
  - **Escalation levels** fire a set time before or after the due date. Each level has optional criteria (for example
    "still New") and actions (reassign, raise the priority, remind).
  [service levels](https://help.glpi-project.org/documentation/modules/configuration/service_levels)
- **Recurrent tickets.**
  - Built from a ticket template, with a period, a required start date and an optional end date.
  - "Preliminary creation" opens each ticket a set time early, and a calendar limits which days it may run.
  - Equipment can be attached, with an option for one ticket per item.
  - An automatic action (RecurrentItems) creates them. The same exists for changes.
  [recurrent tickets](https://help.glpi-project.org/documentation/modules/assistance/recurrentticket)

### Problems and changes
- **Problems.** Use the same core fields as tickets (actors, urgency, impact, priority, category).
  - An Analysis tab records impacts, causes and symptoms.
  - Linked tickets, and a workaround can be **applied to all linked tickets at once** without solving the problem.
  - Linked changes, affected items, projects and knowledge-base articles.
  - Costs (human, material, fixed), locked once the problem is solved.
  - Its own notifications, statistics and history.
  [problems](https://help.glpi-project.org/documentation/modules/assistance/problems)
- **Changes.** Raised from a ticket, a problem or the menu.
  - An Analysis tab (impacts and a control list of steps).
  - A **Plans** tab: a deployment plan, a backup (rollback) plan and a checklist.
  - Approvals, linked tickets, problems, projects and items, costs, and the impact graph.
  - Statuses cover evaluation, approval, testing and qualification. The example life cycle matrix will not let a new
    change be Accepted without passing Evaluation or Validation first.
  [changes](https://help.glpi-project.org/documentation/modules/assistance/changes)
- **Kanban.** A board for tickets, problems, changes and projects, one type per board, with statuses as columns.
  Dragging a card changes its status. Search accepts field tags such as `title:`, `!` to exclude and `#` for a regex.
  [kanban](https://help.glpi-project.org/documentation/modules/overview/kanban)

### Planning and knowledge base
- **Planning.** Shows scheduled tasks from tickets, problems and changes, plus notes. Four views, each gated by a right:
  mine, my group, any user, any group. Filters by date range and type. Export as an iCal file or a webcal
  subscription link with a secret key that the user can regenerate.
  [planning](https://help.glpi-project.org/documentation/modules/assistance/planning)
- **Knowledge base.** Serves two purposes: internal notes for technicians and a public **FAQ** for the portal (only FAQ
  articles show on the portal).
  - An article is readable only once it has at least one **target**: an entity, group, profile or user. Without one
    it stays unpublished and private to its writer. Targeting the root entity shows it to everyone.
  - A display window (from and to dates), categories, revisions with restore, comments, attachments and history.
  - Translations, if switched on in the settings.
  [knowledge base](https://help.glpi-project.org/documentation/modules/tools/knowledgebase)

### Service catalogue and forms (native in 11; replaces the old Formcreator plugin)
- **Catalogue.** Switched on per entity, with an option to inherit the setting from the parent entity. Categories
  can nest (three levels at most is the advice), each with a description and an image. Forms can be pinned to the
  top. Search tolerates typos and sorts A to Z, Z to A, or by popularity. Users see only the forms their profile,
  entity and rights allow. Knowledge-base articles can be shown in the catalogue as well.
  [service catalog](https://help.glpi-project.org/documentation/modules/assistance/service-catalog)
- **Forms.**
  - Sections and question types: text, email, number, date, people or groups, urgency, request type, file, radio,
    checkbox, dropdown, and pickers for GLPI items (including "my own devices").
  - Conditions show or hide questions and decide when the submit button appears. Answers can be checked against a
    regex.
  - One submission can create **several tickets, changes or problems**, each only when a condition on the answers
    holds. Each can get a follow-up, task or approval.
  - Each field of the new record is a fixed value, a template value, or the answer to a question.
  - A form can be public, limited to chosen users, groups or profiles, or open to people with no account. It can be
    translated.
  [forms](https://help.glpi-project.org/documentation/modules/administration/forms)

## 3. Management

- **Contracts.**
  - Type, number, and support hours (weekdays, Saturday, Sunday and holidays).
  - A start date and initial length give the end date (red once expired). There is also a renewal period and an
    invoice period.
  - Renewal is **tacit** (renews unless ended) or **express** (both sides must agree).
  - A notice period drives alerts, and a maximum number of items can be covered.
  - An accounting number, and a Costs tab whose lines are each tied to a budget. One or more suppliers.
  - Alerts at the end date, the notice date or each period, switched on per entity.
  [contracts](https://help.glpi-project.org/documentation/modules/management/contract)
- **Suppliers and contacts.** The supplier (where it was bought) is kept apart from the manufacturer. Contacts belong
  to a supplier. Tickets can be assigned to a supplier, and a supplier record shows its contracts, tickets, problems
  and changes. [suppliers](https://help.glpi-project.org/documentation/modules/management/suppliers)
- **Budgets.** An amount for a period, with an optional type. Asset values and cost lines from tickets, changes and
  contracts are charged to it, and the main tab shows spend by item type and what is left. The balance can go
  negative. [budgets](https://help.glpi-project.org/documentation/modules/management/budgets)
- **Licences.**
  - Each licence must point to a software item. It has a seat count, an **allow over-quota** switch, an expiry date
    (for alerts) and a parent licence (for packs).
  - It records the version bought next to the version in use and flags any mismatch. Licences are attached from the
    asset's Software tab.
  - The docs say plainly that the seat count has to be checked against installs by hand.
  [licenses](https://help.glpi-project.org/documentation/modules/management/licenses)
- **Documents.** Uploaded files or web links, filed under nested headings and linked to any object. Allowed file types
  are a dropdown list. Some files can be excluded from email import (for example logos in signatures).
  [documents](https://help.glpi-project.org/documentation/modules/management/documents)
- **Phone lines.** Line type, operator, caller number, and the user or group it belongs to.
  [lines](https://help.glpi-project.org/documentation/modules/management/lines)

## 4. Administration and setup

- **Entities.** A tree of separate units in one instance (by company, client or directory).
  - A parent sees its own items and its children's. A child sees only its own.
  - A user holds a **profile per entity**, optionally passed down (recursive) to the sub-entities, and can switch
    entity and profile during a session.
  - Each entity carries its own settings: address, default templates, calendar and ticket type, auto-assignment, the
    auto-close delay, surveys, notification sender and signature, alerts, custom CSS, enforced two-factor sign-in,
    and the portal home page. **Most settings inherit from the parent** unless changed.
  - Entity admins can be named (delegated administration).
  [entities](https://help.glpi-project.org/documentation/modules/administration/entities)
- **Profiles and rights.**
  - Each profile uses either the standard interface or the simplified one (the portal).
  - Rights per object: read, update, create, delete (to the bin) and purge (for good). No right implies another, so
    editing also needs read.
  - Ticket rights include: see my, my group's or all tickets; see assigned; assign; **steal** (take a ticket over);
    be in charge; see private follow-ups; edit everyone's follow-ups; approve.
  - A default profile is given to new users unless a rule sets another.
  [profiles](https://help.glpi-project.org/documentation/modules/administration/profiles/profiles),
  [assistance rights](https://help.glpi-project.org/documentation/modules/administration/profiles/assistancetab)
- **Groups.** A tree, with flags for "visible in tickets", "can be notified", "can be manager" (projects) and "can
  hold items or users". Turning every flag off hides a retired group but keeps its history. Groups have managers
  (used in notifications) and can be imported from LDAP.
  [groups](https://help.glpi-project.org/documentation/modules/administration/groups)
- **Rules engine** (shared by many rule sets).
  - Rule sets: entity and authorisation, software categories, ticket business rules, mail collector, assets import and
    link, location, data dictionaries, transfer, and blacklists.
  - Tests: equals, contains, starts or ends with, under or not under (for trees), and regex. A regex's captured parts
    can be used in the actions (`#0`, `#1`).
  - Criteria combine with AND or OR. Rule sets run in one of three ways: stop at the first match, apply every match,
    or pass each result on to the next rule.
  - There is a **Test** button. Rules can be off while being drafted, duplicated, and **exported or imported as XML**
    (from a test system to the live one).
  [rules](https://help.glpi-project.org/documentation/modules/administration/rules/rulesmanagement)
- **Ticket business rules.**
  - Run on create (checked against all submitted fields) and on update (only when a field named in the rule changed).
  - A "stop processing" action ends the run.
  - A rule that changes urgency or impact needs a "recalculate priority" action.
  - Rules of the parent entity run before the entity's own rules.
  [ticket business rules](https://help.glpi-project.org/documentation/modules/administration/rules/ticketbusinessrules)
- **Authorisation rules.** They give each user profile and entity pairs at sign-in, from LDAP organisational units,
  groups or other attributes, or from the email domain. Every rule runs, so a user can end up with several pairs. One
  regex rule can map every organisational unit to its entity.
  [user authorizations](https://help.glpi-project.org/documentation/modules/administration/rules/userauthorizations)
- **Asset import rules.** Entity assignment runs first: by name, serial, IP, subnet or tag, the first match wins, and
  only on the first import. Then import or link rules: link to an existing asset, import, or refuse (for example
  refuse placeholder serials such as an OEM "to be filled" string). Blacklists drop junk values.
  [inventory rules](https://help.glpi-project.org/documentation/modules/administration/rules/inventorytools)
- **Automatic actions (cron).**
  - Each has its own interval, a time window it may run in, history kept for 0 to 360 days, and run statistics.
    Next-run dates can be reset and a run can be forced.
  - They run either as a side effect of page views or (as advised) from a system cron every minute.
  - Main jobs: auto-close, SLA levels, mail import, surveys, expiry alerts (certificates, contracts, domains, licences,
    warranties), low-stock alerts, reservation reminders, log purge, ticket purge, recurrent items.
  [automatic actions](https://help.glpi-project.org/documentation/modules/configuration/crontasks)
- **Notifications.** Each notification ties an item type, an event, a channel (email or in-browser, each with its own
  template) and recipients.
  - Recipients are roles such as requester, watcher, assignee or assigned group (with or without its manager),
    requester's group, admins, entity admins, a profile, a named group, or the technician in charge of the linked
    asset.
  - Optional filters, such as a category or a minimum urgency.
  [definitions](https://help.glpi-project.org/documentation/modules/configuration/notifications/definitions)
- **Notification templates.** One template per language, with a no-language version as the fallback. Each has a
  subject, an HTML body and a text body (built from the HTML if left empty), plus an optional stylesheet. Tags come in
  four kinds: value, field label, condition, and loop (over all items, or the first or last N).
  [templates](https://help.glpi-project.org/documentation/modules/configuration/notifications/templates)
- **Mail collector ("Receivers").**
  - IMAP or POP, with folders for accepted and refused mail and a maximum attachment size.
  - Options: use Reply-To as the requester, add CC and To recipients as watchers, create users from senders, read only
    unread mail.
  - Blacklists strip signatures or block senders. Text between GLPI's reply markers is removed on import.
  - Routing rules pick the entity or refuse the mail, the first match wins, and the sender can be told about a
    refusal.
  - Solutions and closures cannot come in by email. A job warns when a collector keeps failing.
  [receivers](https://help.glpi-project.org/documentation/modules/configuration/collectors)
- **Webhooks.** One item type and one event per webhook, optionally for sub-entities too.
  - The JSON body can be replaced with any format using field placeholders.
  - Security: a SHA-256 signature with a shared secret, an expiry window against replays, a challenge-response, OAuth
    client credentials, or custom headers.
  - A set number of retries through a queue job, and a manual resend.
  - A search-based filter with a **preview** of which records would match.
  [webhook](https://help.glpi-project.org/documentation/modules/configuration/webhook)
- **Dropdowns.** Admin-managed lists (assistance, calendars, categories, common, network and others), many of them
  trees, with translations. [dropdowns](https://help.glpi-project.org/documentation/modules/configuration/dropdowns)
- **History tab on every object.** Each line has an id, the date, the user (blank when the system did it, such as an
  inventory), the field, and old to new values or a summary of the action. A child's changes also show on its parent.
  [history](https://help.glpi-project.org/documentation/modules/tabs/historical)
  Retention is set per kind of change (relations, add, delete, software installs, finance, user profiles and groups,
  components): delete, keep, or delete after 1 to 120 months.
  [logs purge](https://help.glpi-project.org/documentation/modules/configuration/general/logs_purge)
  System logs and events can be read in the app, behind a right.
  [logs](https://help.glpi-project.org/documentation/modules/administration/logs)
- **Transfer between entities.** Transfer profiles say what happens to each linked item: keep, move to the bin,
  delete, or disconnect. Entity rules can move computers by themselves when inventory data changes.
  [entities](https://help.glpi-project.org/documentation/modules/administration/entities),
  [rules](https://help.glpi-project.org/documentation/modules/administration/rules/rulesmanagement)

## 5. Self-service portal (simplified interface)

- **Home:** the user's ticket counts by status, and the most popular and newest FAQ entries.
- **Can:**
  - raise and follow tickets, for themselves or (with the right) for someone else
  - book items
  - read the FAQ and public notes or RSS feeds, and write private notes
  - accept or refuse solutions and answer surveys (by profile right)
- **Since 11:** a service catalogue home with search and categories, set per entity.
- **The profile's status grid** decides whether a portal user may close or reopen a ticket.
[interfaces](https://help.glpi-project.org/documentation/readme-1-1/interfaces),
[service catalog](https://help.glpi-project.org/documentation/modules/assistance/service-catalog)

## 6. Reports, statistics and dashboards

- **Statistics.** Global counts (opened, solved, late, closed) and breakdowns by any ticket field, by device features
  (model, OS) and by device. Measures: average time to first action, to solve and to close; real time spent; surveys
  sent and answered, and the average score. Trees (groups, categories) can roll up one level at a time.
  [statistics](https://help.glpi-project.org/documentation/modules/assistance/statistics)
- **Reports.** Assets by type and OS; assets by contract or by year; the financial summary per asset type and for
  consumables and licences; network by location or socket; loans (reservations); assets by status.
  [reports](https://help.glpi-project.org/documentation/modules/tools/reports)
- **Dashboards.**
  - Built-in Central, Assets and Assistance dashboards, all editable. Tiles can be resized and each picks a data
    source, chart style and colours.
  - Dashboard filters (for example a technician group). Clicking a tile opens the matching list.
  - Sharing: by profile, entity, user or group; a full-screen link that needs no sign-in; or an iframe.
  - Can be cloned. Defaults are set per home page and per module.
  [dashboard tutorial](https://help.glpi-project.org/tutorials/readme-1/dashboard)
- **Home views:** personal (my tickets and those waiting for my approval), group, and global.
  [interfaces](https://help.glpi-project.org/documentation/readme-1-1/interfaces)

---

## Patterns worth noting

1. **Urgency × impact gives priority.** The requester sets urgency and the agent sets impact. The grid is editable
   and levels can be switched off. "Major" sits above the grid behind its own right.
2. **SLA plus OLA on the same ticket, each with TTO and TTR.** Calendar-aware, paused while pending, with **escalation
   levels** at offsets before or after the due time. Each level has its own criteria and actions (reassign, raise the
   priority, remind).
3. **Entity tree with recursive rights.** A profile per entity, optionally passed down. Settings inherit down the tree
   unless changed. Parent rules run before the entity's own.
4. **One rules engine, many rule sets.** Criteria, actions, regex captures, three run modes, a Test button, and XML
   export and import to promote rules from a test system.
5. **Rules re-run on update only when a field they name changed.** This cuts noise. A "recalculate priority" action is
   needed whenever a rule changes urgency or impact.
6. **History tab on every object**, with retention set per kind of change and a blank user meaning "the system did
   it".
7. **Field locks.** A field edited by hand is locked against the next automatic inventory.
8. **Pending reasons that chase the requester.** Reminders within working hours, then the ticket solves itself after N
   unanswered reminders.
9. **The solution has to be accepted.** Refused means reopened. Silence means accepted after N days, then
   administrative closure.
10. **Approvals by percentage per step**, chained by rules into multi-department flows. A group answers once for all
    its members.
11. **Recurrent tickets and changes** from a template, with early creation, a calendar, and one ticket per linked item.
12. **Reservations** of any asset, with repeats, an availability search, and soft versus hard disabling.
13. **Workaround to all linked incidents** from a problem in one action. A change carries deployment and rollback
    plans and a checklist.
14. **One form, many records.** Conditional destinations create tickets, changes or problems, and each field comes
    from a fixed value, a template or an answer.
15. **Template precedence**: category and type, then profile, then entity, picked again when any of them changes.
16. **Status grid per profile**, separately for tickets, problems and changes, which also controls closing and
    reopening on the portal.
17. **Notification recipients are roles**, resolved on each record. Templates have condition and loop tags and a
    no-language fallback.
18. **Webhooks with signature, replay window, retries and a match preview.**
19. **Asset finance.** Warranty expiry alerts, depreciation, net book value, TCO, and dates filled in automatically when
    the status changes.
20. **Contracts with tacit or express renewal, a notice period and a cap on covered items.**

---

## Ideas YukthiX may be missing

Checked against the code on `test/yukthix-main` (17 Nov 2026). Code was searched and read only; nothing was built or
run. HAS = present, PARTLY = some of it, MISSING = not found. Size: S under 3 days, M 3 to 7 days, L over 7 days.

**Already present (no work; listed so they aren't re-proposed)**

1. Urgency × impact priority grid per desk. **HAS.** `apps/api/prisma/schema.prisma` `SdPriorityMatrix`;
   `apps/api/src/service-desk/desk-org.service.ts`.
2. SLA escalation levels at set percentages, with raise priority and move to group. Calendars and pause states.
   **HAS.** `apps/api/src/service-desk/sla-engine.ts` (`MILESTONE_ACTIONS`); `SdSlaPolicyVersion.pauseStates`,
   `calendarId`.
3. Approvals with a quorum (any, all, at least N, or a percentage) and multiple steps. **HAS.**
   `apps/api/src/workflow/approvals-engine.service.ts` (`mode: 'percent'`).
4. Satisfaction surveys and ratings after closing. **HAS.** `apps/api/src/service-desk/surveys.service.ts`;
   `SdRating`, `SdSurvey`.
5. Fields mandatory, hidden or dependent by ticket type; templates with defaults. **HAS.**
   `SdTicketField` (`visibility`, `requiredToSolve`, `dependsOn`); `SdTemplate`.
6. Allowed status moves per ticket type, each limited to an agent or a lead, with required fields. **HAS.**
   This is close to GLPI's per-profile grid. `apps/api/src/service-desk/lifecycle.ts`.
7. Parent and child tickets, merge, duplicate, split (follow-up to a new ticket), trackers. **HAS.**
   `apps/api/src/service-desk/work.service.ts`; `dto.ts` `LINK_KINDS`.
8. Changes with plan, backout plan, risk and CAB; problems with a known error and a workaround to the knowledge base.
   **HAS.** `apps/api/src/service-desk/changes.service.ts`, `problems.service.ts`; `docs/yukthix/helpdesk-itsm-plan.md`.
9. Knowledge base with audience, versions, translations, expiry and review dates. **HAS.** `SdKbArticle`
   (`audience`, `expiresAt`, `reviewDueOn`, `translationOfId`); `SdKbArticleVersion`.
10. Mail to ticket with rules, CC as watchers, regex rules. **HAS.** `apps/api/src/service-desk/mail-in.service.ts`,
    `mail-rules.ts`; `SdEmailRule`.
11. Recurring tickets on RFC 5545 rules. **HAS.** `apps/api/src/service-desk/recurring.service.ts`; `SdRecurring`.
12. Calendar feed, board (kanban) layout, wallboard by private link. **HAS.** `SdCalendarFeed`;
    `apps/api/src/service-desk/dto.ts` (`layout: 'board'`); `SdWallboard`.
13. Rule dry run, signed webhooks with retries. **HAS.** `apps/api/src/rules-engine/automation.service.ts`
    (`dryRun`); `AutomationWebhook`, `WebhookDelivery`.

**Gaps (most useful first)**

14. **IT asset register for the desk** (CMDB-lite): status, location, user, technician in charge, type-specific
    fields, a history tab, and an asset's tickets. **PARTLY.** The People asset register only does issue and return
    (`apps/api/prisma/schema.prisma` `Asset`, `AssetAssignment`). Tickets can pick a device
    (`apps/api/src/service-desk/asset-pick.ts`). There is facilities equipment (`SdEquipment`). Size **L**.
15. **Warranty and financial info per asset**: purchase, supplier, invoice, warranty months with expiry alerts,
    depreciation and net book value. **MISSING.** `Asset` has only `purchasedOn` and `cost`; no "warranty" in the
    service desk. Size **M**.
16. **Asset reservations / loans** (spare laptops, projectors): repeats, a "free between" search, reminders, and a loan
    report. **MISSING.** No booking or reservation in the service desk or facilities code. Size **M**.
17. **Pending reasons that chase the requester**: automatic reminders in business hours, then solve after N with no
    reply. **PARTLY.** SLA pause states and auto-close of resolved tickets exist
    (`apps/api/src/service-desk/work.service.ts` `autoClose`, line 543). No repeated chase was found. Size **S**.
18. **Vendor contracts and suppliers**: tacit or express renewal, notice-period alerts, support hours, covered assets,
    and assigning a ticket to a supplier. **MISSING.** No supplier or contract register in `apps/api/src/service-desk`
    (only starter text). Size **M**.
19. **Software licence seats**: seat count, an over-quota flag, expiry alerts, and assignment to a device or person.
    **MISSING.** `LicenceType` and `EmployeeLicence` are professional or driving licences, not software. Size **M**.
20. **Ticket and change costs rolling into a budget** (time × rate, fixed, material). **PARTLY.** Time is logged
    (`SdTimeEntry`), but there are no cost lines or budget. Size **M**.
21. **OLA per team on tickets** (internal TTO and TTR next to the customer SLA). **PARTLY.** OLAs exist only on
    catalogue fulfilment tasks (`apps/api/src/service-desk/catalog.service.ts`, `olaHours`). Size **S**.
22. **Rule export and import** (move a desk's rules and settings from a trial company to the live one). **MISSING.**
    No export was found in `apps/api/src/rules-engine`. Size **S**.
23. **Notification templates per language** with condition and loop tags. **PARTLY.** One template per language is
    planned but English is fixed (`apps/api/src/email-templates/email-templates.service.ts`, `LANGUAGE = 'en'`).
    Size **M**.
24. **Consumables stock** (cables, mice, toner): a threshold alert and issue to a person. **MISSING.** Size **S**.
25. **Impact graph between business apps and devices** (what breaks if X is down). **MISSING**, and left out of scope
    on purpose (`docs/yukthix/helpdesk-itsm-plan.md` §1). `SdBusinessApp` has no dependencies. Size **L**.
26. **Inventory agent and import rules** (auto-discovery, link or refuse, field locks). **MISSING.** Size **L**.
    Probably better as a connector to an MDM (Intune, Jamf) than a YukthiX agent.
27. **Asset auto-numbering pattern** (counter plus year or month in the asset tag). **MISSING.** `Asset.tag` is free
    text. Size **S**.
28. **One form creates several records** (an incident plus a problem, picked by answers). **PARTLY.** The catalogue
    makes a request plus tasks for several teams (`catalog.service.ts` fulfilment plan). Creating different record
    kinds from one form was not seen. Size **M**.
29. **Settings inherited down an entity tree** (legal entity or branch inherits from the company unless changed).
    **PARTLY.** Desk branches carry their own calendar, group and admin (`SdDeskBranch`). A general inheritance model
    was not checked. Size **L**.
30. **History retention per kind of change**, set by the admin. **PARTLY.** Ticket events and audit exist
    (`SdTicketEvent`, `apps/api/src/audit`), and privacy retention runs nightly (`desk-jobs.service.ts`). Per-category
    retention was not seen. Size **S**.
