# Appendix A · Notification catalogue

> **Status:** 📋 Draft catalogue, 26 Sep 2026. Closes GAP-REGISTER **F1** (notification types), **F3** (scheduled events) and the channel-consent part of **H6** (WhatsApp / SMS opt-in record). **Extended 26 Sep 2026** with the notification types and scheduler rules (SCH-73…79) of the gap-register features, the new category WRK and the P04 YX-NTF-15 / 16 channel rules. **P16 follow-up 26 Sep 2026:** partner notification types (§2.25). **P19 follow-up 26 Sep 2026:** policy rule and automation notification types (§2.26). **Corrected 28 Sep 2026 (validation pass 3, C1 / C2):** SCH-07, SCH-28, SCH-29 and the Form 130 (was Form 16) notification updated for the Labour Codes (in force 21 Nov 2025) and the Income-tax Act 2025 forms — Form 130 (was Form 16), Form 138 (was 24Q), Form 140 (was 26Q); type keys unchanged so preferences and templates stay valid; no types added. **Validation pass 3 Musts follow-up 28 Sep 2026:** 46 notification types for workplace accidents, statutory corrections and revised certificates, migration arrears, the identity chain, the person record, trials, platform status and export billing (§2.27–2.31) and scheduler rules SCH-80…87; no W / S rows, so the template pack is unchanged. **P22 follow-up 28 Sep 2026:** 10 workflow and AI assistant types (§2.33); no W / S rows. **P23 follow-up 28 Sep 2026:** 15 employee and manager assistant and marketplace types (§2.34) and scheduler rules SCH-96…98; no W / S rows; salary and tax values never in external channels.
> **Purpose:** the one list of every notification YukthiX sends: its type key, category, trigger, audience, default channels and handling. P04 designs the engine and gives examples; this appendix enumerates the types every module needs.
> **How to use:**
> - Every notification type in code (the `notification_types` registry, P04 §5) must exist here with the same key. A type that is not catalogued fails CI (APX-B §4).
> - Every trigger is an event key from [Appendix B](APX-B-events.md) or a scheduler rule `SCH-nn` (§3).
> - The WhatsApp (Meta) and SMS (DLT) template submission is prepared from this list: every row with **W** or **S** in its channels is in the template pack (§4).
> - Wording is not here. Templates are written per type × channel × language (P04 §4.3).
>
> **Builds on:** P04 (engine; rules YX-NTF-01…14), APX-B (events), P02 (audience re-check, field classes), P03 (approval events), spec D17 (lead times are company settings with starter values).

---

## 0. How to read the tables

| Column | Meaning |
|---|---|
| **Type key** | `domain.entity.event.audience`. The last segment names who receives it, so one event can have several types (one per audience). |
| **Cat** | Category code (§1). Users set channel preferences per category (P04 §4.7). |
| **Trigger** | The event key from APX-B that fires it, with a condition in brackets where needed, or a scheduler rule `SCH-nn` (§3), which raises its own event. |
| **Audience** | Who receives it. Resolved at send time and re-checked against P02 (YX-NTF-03). HR = HR Admin in scope of the subject's entity; Payroll = Payroll Admin; Admin = System Admin; Owner = owner of the record, connection or key. |
| **Channels** | Defaults per P04 Q1: **IA** in-app, **P** push, **E** email, **W** WhatsApp, **S** SMS. **W/S** = WhatsApp when the company's number is connected, else SMS (P04 Q2). W and S are used only when the recipient has an active channel consent (§5, YX-NTF-14) and the type is in the template pack (§4). |
| **Mand.** | **Y** = the user can't switch it off (YX-NTF-05). |
| **Ext-safe** | What may appear in email, push, WhatsApp and SMS (P04 Q6, YX-NTF-04). **Vars:** the listed variables may appear. **Link:** fixed text + first name + a link into the app. **Neutral:** only "You have an update on a confidential matter" + link (M08 YX-CASE-06). **Code:** OTP code, purpose and expiry only (YX-NTF-13). **—:** in-app only; no external channel. |
| **Dig.** | **Y** = may be grouped (YX-NTF-09) or put in a digest. **N** = sent on its own, immediately. **U** = urgent: immediate and bypasses quiet hours (YX-NTF-06). |
| **Src** | The design doc (and rule or question) that asks for it. |

**General rules**
1. **Specific beats generic.** A P03 request type with its own rows below (leave, expense claim, payroll run, roster swap) uses them; every other request type uses the generic `approval.*` rows with the request type's label as a variable. The router sends one of the two for the same request and recipient, never both.
2. **Always external-safe:** recipient first name, company short name, dates, times with zone, request-type labels and counts. Anything else must be listed in the row.
3. Channels are defaults. Users change them in Me › Notifications (except mandatory types); the tenant can switch channels off (P04 §4.7).
4. Lead times and reminder days in §3 are company settings seeded with a starter value (D17). Legal deadlines come from P07 and are not editable.
5. **Slack / Teams** (P04 §4.9, YX-NTF-16) is an extra channel a linked user may add per category in Me › Notifications; it follows the push rules (quiet hours, grouping) and the row's Ext-safe variables, and is not a default channel of any row. Sensitive content is always an in-app link.
6. **Payslip PDF by email** (`payslip.pdf_email.employee`, YX-NTF-15) is the only row that attaches a Confidential document to an external channel, and only when the legal entity's policy is on; WhatsApp, SMS, push, Slack and Teams stay link-only.

---

## 1. Categories

P04 §3 lists seven categories. This appendix keeps them and adds nine.

| Code | Category | Covers | Default channels | Status |
|---|---|---|---|---|
| APR | **Approvals** | Tasks waiting for a decision, reminders, escalations, delegation (P03) | IA P + W for managers + E for desk users | P04 |
| TIM | **Time** | Leave, holidays, check-in, attendance exceptions, rosters, timesheets (M02) | IA P + W for key items | P04 |
| PAY | **Pay** | Payroll, payslips, tax, loans, expenses and advances, F&F, statutory rules and compliance calendar (M03, M05, P07) | IA P E | P04 |
| DOC | **Documents** | Documents, expiry, letters, e-sign, verification, policy acknowledgement (P05, M08 policies) | IA P E | P04 |
| PPL | **People** | Org changes, pre-boarding, onboarding and exit journeys, probation, assets, lifecycle alerts (P01, P06, M01) | IA P E | P04 |
| SEC | **Security** | Sign-in, devices, bank / identity changes, access grants, audit integrity, OTP class | IA E (+ S for OTP) | P04, always mandatory |
| ANN | **Announcements** | Company announcements and acknowledgements (P04 §4.8) | IA P (+ E / W per post) | P04 |
| LRN | **Learning** | Enrolments, sessions, certifications, trainers (M07) | IA P E | **New** |
| PRF | **Performance** | Goals, check-ins, 1-on-1s, review stages, 360°, PIP, comp review (M06) | IA P E | **New** |
| ENG | **Engage** | Feed, mentions, kudos, rewards, surveys, celebrations (M09) | IA (P for mentions and kudos) | **New** |
| HLP | **Helpdesk & Cases** | Tickets, grievance / POSH / disciplinary / whistleblower cases, IC (M08) | IA P E; cases Neutral only | **New** |
| HIR | **Hiring** | Candidates, interviews, offers, BGV, referrals, staffing clients and placements (M10) | Candidates E + S / W; staff IA E | **New** |
| ASM | **Assessment** | Test invitations, slots, reminders, results, appeals, proctors, evaluators (T01–T05) | Candidates E + S / W; staff IA E | **New** |
| SYS | **Integrations & System** | Connections, devices, kiosks, channels and templates, API keys, webhooks, reports, retention | IA E (admins) | **New** |
| BIL | **Billing & Account** | Subscription, invoices, payment failure, usage caps (SMS, AI credits, API); partner programme (verification, commission, partner invoices, P16) | IA E (admins, billing contact) | **New** |
| WRK | **Work sites & projects** | Projects, milestones and project billing (M12), contract labour and contractor portal (M13), visitors (M02 §B11) | IA E (contractor, client contacts and visitors: E + W / S) | **New** |

---

## 2. Catalogue

**Count:** 626 notification types (recounted from the tables by script on 28 Sep 2026) (367 + 77 added 26 Sep 2026 for the gap-register features; + 18 partner types, §2.25, P16 follow-up 26 Sep 2026; + 6 policy rule and automation types, §2.26, P19 follow-up 26 Sep 2026; + 46 types for the validation pass 3 Musts, §2.27–2.31, 28 Sep 2026; + 87 types for the validation pass 3 Shoulds, §2.32, 28 Sep 2026 (38 for hiring, staffing and growth); + 10 workflow and AI assistant types, §2.33, P22, 28 Sep 2026; + 15 employee and manager assistant and marketplace types, §2.34, P23, 28 Sep 2026); scheduler rules SCH-01…SCH-98 in §3.

### 2.1 Approvals (P03, used by every module)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `approval.task.assigned.approver` | APR | `approval.task.assigned` | Approver (or delegate) | IA P W E | N | Vars: requester name, request label, dates; one-time link for low-risk types | Y | P03 §4.7, P04 Q1 |
| `approval.task.reminder.approver` | APR | `approval.task.reminder` (SCH-01) | Approver | IA P E | N | Link | Y | P03 §4.6 |
| `approval.task.escalated.escalatee` | APR | `approval.task.escalated` (SCH-01) | Escalation target (approver's manager or configured role) | IA P E | N | Vars: request label, pending age | N | P03 Q2 |
| `approval.task.escalated.approver` | APR | `approval.task.escalated` | Original approver | IA | N | — | Y | P03 §4.6 |
| `approval.task.reassigned.approver` | APR | `approval.task.reassigned` | New approver | IA P E | N | Vars: requester name, request label | Y | P03 YX-WF-06 |
| `approval.task.fallback.hr` | APR | `approval.task.assigned` (fallback resolver used) | HR of the requester's entity | IA E | N | Link | Y | P03 §4.3 |
| `approval.request.approved.requester` | APR | `approval.request.approved` | Requester (subject and proxy raiser) | IA P W | N | Vars: request label, dates | Y | P03, P04 Q1 |
| `approval.request.approved_with_changes.requester` | APR | `approval.request.approved` (changes made) | Requester | IA P W | N | Link (old → new shown in app) | N | P03 Q5 |
| `approval.request.rejected.requester` | APR | `approval.request.rejected` | Requester | IA P W | N | Vars: request label, dates (reason in app) | N | P03 YX-WF-08 |
| `approval.request.sent_back.requester` | APR | `approval.request.sent_back` | Requester | IA P E | N | Link | N | P03 Q7 |
| `approval.request.question.requester` | APR | `approval.request.question_asked` | Requester | IA P | N | Link | N | P03 §4.5 |
| `approval.request.answered.approver` | APR | `approval.request.question_answered` | Approver who asked | IA P | N | Link | Y | P03 §4.5 |
| `approval.request.withdrawn.approver` | APR | `approval.request.withdrawn` | Approvers with open tasks | IA | N | — | Y | P03 §4.5 |
| `approval.request.cancelled.approver` | APR | `approval.request.cancelled` | Approvers who had approved | IA E | N | Link | Y | P03 §4.5, P06 Q7 |
| `approval.request.auto_actioned.requester` | APR | `approval.request.auto_actioned` | Requester and skipped approver | IA P | N | Vars: request label, action | Y | P03 Q2 |
| `approval.request.on_behalf.subject` | APR | `approval.request.submitted` (raised by a proxy) | Subject employee | IA W/S (+ kiosk banner) | N | Vars: request label, dates, raiser name | N | P03 YX-WF-18, M04 YX-MOB-11 |
| `approval.request.decided_on_behalf.subject` | APR | `approval.request.approved` / `.rejected` (proxy-raised) | Subject employee | IA W/S (+ kiosk banner) | N | Vars: request label, dates, outcome | N | M04 YX-MOB-11 |
| `approval.delegation.started.delegate` | APR | `approval.delegation.started` | Delegate | IA P E | N | Vars: delegator name, dates | N | P03 Q3 |

### 2.2 Org & dated changes (P01, P06)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `employee.change.effective.employee` | PPL | `employee.change.effective` | Subject employee | IA P E | N | Vars: change label (promotion / transfer…), effective date; never pay values | N | P06 §9 |
| `employee.change.effective.manager` | PPL | `employee.change.effective` (manager changed) | New and previous manager | IA E | N | Vars: employee name, date | Y | P06, M06 D7 |
| `employee.change.cancelled.approver` | PPL | `employee.change.cancelled` | Approvers of the change | IA E | N | Vars: change label, employee name | Y | P06 Q7 |
| `employee.hired.manager` | PPL | `employee.hired` | Manager on the first assignment | IA E | N | Vars: joiner name, joining date | N | P01 §7 |
| `org.restructure.completed.hr` | PPL | `org.restructure.completed` | HR of the affected entities | IA E | N | Link | N | P01 YX-ORG-22 |

### 2.3 Security, access & privacy (P02, P08, M04, proposed P12)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `user.invite.employee` | SEC | `user.invited` | New user (employee, admin) | E S (W only with consent) | Y | Vars: company name, sign-in link | N | M04 §6 first run |
| `security.bank_change.requested.old_contact` | SEC | `security.bank_change.requested` | Employee's previous email and mobile | E S | Y | Link ("a bank-account change was requested; not you? contact HR") | U | P02 YX-SEC-13 |
| `security.bank_change.applied.employee` | SEC | `security.bank_change.applied` | Employee and previous contact | IA P E S | Y | Link | U | P02 §4.5, YX-SEC-25 |
| `security.identity.changed.employee` | SEC | `security.identity.changed` | Employee | IA E | Y | Vars: field label (PAN, legal name) | N | P02 YX-SEC-13 |
| `security.role.self_granted.admins` | SEC | `security.role.granted` (grantee = granter) | Other System Admins | IA E | Y | Vars: admin name, role name | U | P02 Q1 |
| `security.role.risk_override.admins` | SEC | `security.role.saved` (warnings overridden) | Other System Admins | IA E | Y | Vars: role name, warning count | N | P02 YX-SEC-18 |
| `security.self_approval.owner` | SEC | `approval.request.approved` (single-user maker = checker) | System Admin / owner | IA E | Y | Vars: item label, period | N | P02 YX-SEC-12 |
| `security.support_session.started.admins` | SEC | `security.support_session.started` | Tenant System Admins | IA E | Y | Vars: window, declared reason | U | P02 YX-SEC-20 |
| `security.support_session.ended.admins` | SEC | `security.support_session.ended` | Tenant System Admins | IA | Y | — | Y | P02 YX-SEC-20 |
| `security.grant.expiring.holder` | SEC | `security.grant.expiring` (SCH-08) | Holder of a time-boxed grant and the granting admin | IA E | N | Vars: role, end date | Y | P02 YX-SEC-15 |
| `security.device.bound.employee` | SEC | `device.bound` | Employee | IA E | Y | Vars: device label | N | M04 Q3 |
| `security.device.revoked.user` | SEC | `security.device.revoked` | User | IA E S | Y | Vars: device label | U | M04 YX-MOB-09 |
| `security.login.new_device.user` | SEC | `security.login.new_device` | User | IA P E | Y | Vars: device type, city, time | U | GAP A1 → P12 (proposed) |
| `security.credentials.changed.user` | SEC | `security.credentials.changed` | User | IA E | Y | Vars: what changed (password, MFA, passkey) | U | GAP A1 → P12 (proposed) |
| `audit.chain.failed.admins` | SEC | `audit.chain.verification_failed` (SCH-14) | Tenant System Admins + YukthiX security | IA E | Y | Link | U | P08 YX-AUD-03 |
| `privacy.export.ready.requester` | SEC | `privacy.export.ready` | Employee or candidate who asked | IA E | N | Link | N | P02 §6 |
| `privacy.erasure.completed.subject` | SEC | `privacy.erasure.completed` | Candidate / data subject | E | N | Vars: request date | N | T05 YX-EVAL-10, P02 §6 |

### 2.4 Announcements, channels & delivery (P04)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `announcement.published.audience` | ANN | `announcement.published` | Announcement audience | IA P (+ E / W chosen per post) | N (Y when acknowledgement required) | Vars: title (author confirms it is external-safe) | N | P04 §4.8 |
| `announcement.ack.reminder.audience` | ANN | `announcement.ack_due` (SCH-09) | Audience members who haven't acknowledged | IA P E | Y | Vars: title | Y | P04 Q8 |
| `channel.whatsapp.template_status.admin` | SYS | `channel.whatsapp.template.status_changed` | System Admin (channel owner) | IA E | N | Vars: template name, language, status | Y | P04 Q2 / Q5 |
| `channel.whatsapp.account_status.admin` | SYS | `channel.whatsapp.account.status_changed` | System Admin | IA E | Y | Vars: status, quality rating | U | P04 Q2 |
| `channel.delivery.failures.admin` | SYS | `notification.delivery.failed` | System Admin | IA E | N | Vars: count, channel | Y (daily) | P04 YX-NTF-10 |
| `channel.address.disabled.user` | SYS | `channel.address.opted_out` | The user whose address stopped working | IA | N | — | N | P04 YX-NTF-11 |
| `channel.consent.confirmed.recipient` | SYS | `channel.consent.recorded` | Recipient | The consented channel (W or S) | N | Vars: company name, how to stop | N | §5 |
| `channel.consent.withdrawn.recipient` | SYS | `channel.consent.withdrawn` | Recipient | The withdrawn channel (W or S), one final message | N | Vars: company name | N | §5 |

### 2.5 Documents, letters & e-sign (P05)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `document.expiring.owner` | DOC | `document.expiring` (SCH-02) | Document owner | IA P E | N | Vars: document type label, expiry date | Y | P05 YX-DOC-06 |
| `document.expiring.hr` | DOC | `document.expiring` (SCH-02) | HR | IA E | N | Vars: count | Y (daily) | P04 §1 |
| `document.expired.owner` | DOC | `document.expired` (SCH-02) | Document owner | IA P E | N | Vars: document type label | N | P05 YX-DOC-06 |
| `document.expired.hr` | DOC | `document.expired` (SCH-02) | HR | IA E | N | Vars: count | Y | P05 |
| `document.upload_requested.employee` | DOC | `document.upload.requested` | Employees asked to upload | IA P E | N | Vars: document type label | N | P05 §4.6 |
| `document.verification.pending.hr` | DOC | `document.uploaded` (type needs verification) | HR verifiers | IA E | N | Vars: count | Y | P05 Q7, M02 YX-LV-09 |
| `document.verified.owner` | DOC | `document.verified` | Owner | IA | N | — | Y | P05 §4.2 |
| `document.rejected.owner` | DOC | `document.rejected` | Owner / uploader | IA P E | N | Vars: document type label (reason in app) | N | P05 §4.2 |
| `document.quarantined.uploader` | DOC | `document.quarantined` | Uploader | IA | N | — | N | P05 YX-DOC-02 |
| `verification.check.failed.hr` | DOC | `verification.check.completed` (failed / name mismatch) | HR verification queue | IA E | N | Vars: check type, count | Y | P10 Q6 |
| `document.issued.employee` | DOC | `document.issued` | Letter subject (employee, alumnus or nominee) | IA P E | N | Vars: letter type label | N | P05 §4.3 |
| `letter.bulk_issue.completed.issuer` | DOC | `letter.bulk_issue.completed` | Issuer | IA E | N | Vars: issued / failed counts | N | P05 §4.3 |
| `signature.requested.signer` | DOC | `signature.requested` | Signer (employee, candidate, company signatory) | IA P E W | N | Vars: document type label, sign-by date | N | P05 §4.4 |
| `signature.reminder.signer` | DOC | `signature.pending` (SCH-03) | Signer | IA P E W | N | Vars: document type label | Y | P05 §4.4 |
| `signature.completed.issuer` | DOC | `signature.completed` | Issuer / HR | IA | N | — | Y | P05 YX-DOC-12 |
| `signature.declined.issuer` | DOC | `signature.declined` | Issuer / HR | IA E | N | Vars: document type label | N | P05 §4.4 |
| `alumni.access.activated.alumnus` | DOC | `employment.exited` | Leaver (personal email / mobile) | E S | N | Vars: company name, sign-in link | N | P05 YX-DOC-16 |
| `alumni.access.expiring.alumnus` | DOC | `alumni.access.expiring` (SCH-04) | Alumnus | E | N | Vars: end date | N | P05 Q6 |
| `nominee.access.granted.nominee` | DOC | `nominee.access.granted` | Nominee / legal heir | E S | N | Vars: company name, sign-in link | N | P05 YX-DOC-19 |
| `retention.deletion.upcoming.admin` | SYS | `retention.deletion.upcoming` (SCH-05) | System Admin + data owners (HR, recruiters, test owners) | IA E | N | Vars: data class, count, date | Y | P05 §4.7, T05 Q7, F3 |

### 2.6 Statutory rules & compliance calendar (P07)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `statutory.rule.published.admins` | PAY | `statutory.rule.published` | Payroll + HR of affected entities | IA E | Y | Vars: statute, state, effective date, impact count | N | P07 YX-STAT-08 |
| `statutory.rule.effective_soon.admins` | PAY | `statutory.rule.effective_soon` (SCH-06) | Payroll + HR of affected entities | IA E | Y | Vars: statute, effective date | Y | P07 Q5 |
| `statutory.arrears.proposed.payroll` | PAY | `statutory.arrears.proposed` | Payroll | IA E | Y | Vars: statute, periods, employee count | N | P07 Q4 |
| `compliance.due.upcoming.owner` | PAY | `compliance.due.upcoming` (SCH-07) | Item owner: Payroll per entity (PF, ESI, PT, LWF, TDS, bonus, IW-1, Worker Re-skilling Fund remittance), HR (Form L), IC presiding officer (POSH annual report), compliance owner (CLRA, M13) | IA P E | Y | Vars: statute / form, entity short name, due date | Y (daily) | P07 §4, P04 §4.7 |
| `compliance.due.today.owner` | PAY | `compliance.due.upcoming` (days left = 0) | Item owner | IA P E W | Y | Vars: statute / form, entity short name | N | P07 §4 |
| `compliance.overdue.owner` | PAY | `compliance.due.overdue` (SCH-07) | Item owner + HR head / finance head | IA P E | Y | Vars: statute / form, days overdue | N | P07 §4, M08 YX-POSH-06 |

### 2.7 Integrations, API & analytics (P09, P10, P11)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `integration.connection.failed.owner` | SYS | `integration.connection.failed` | Connection owner | IA E | N | Vars: connector name, error class | N | P10 YX-INT-01 |
| `integration.connection.restored.owner` | SYS | `integration.connection.restored` | Connection owner | IA | N | — | Y | P10 §B2 |
| `integration.device.offline.owner` | SYS | `integration.device.offline` (SCH-12) | Device / sync-agent owner (HR or site admin) | IA E | N | Vars: device, location, last seen | N | P10 §B3 |
| `integration.token.expiring.owner` | SYS | `integration.token.expiring` (SCH-10) | Connection owner | IA E | N | Vars: connector name, expiry date | Y | P10 §B2, F3 |
| `api.key.expiring.owner` | SYS | `api.key.expiring` (SCH-11) | Key owner + System Admin | IA E | N | Vars: key name, expiry date | Y | P11 Q4, F3 |
| `api.key.expired.owner` | SYS | `api.key.expired` (SCH-11) | Key owner + System Admin | IA E | N | Vars: key name | N | P11 Q4 |
| `api.oauth.app_connected.admins` | SEC | `api.oauth.grant.created` | System Admins | IA E | Y | Vars: app name, scope count | N | P11 Q4 |
| `webhook.endpoint.failing.admin` | SYS | `webhook.endpoint.failing` | System Admin + endpoint owner | IA E | N | Vars: endpoint label, failure count | Y | P11 YX-API-09 |
| `webhook.endpoint.disabled.admin` | SYS | `webhook.endpoint.disabled` | System Admin + endpoint owner | IA E | N | Vars: endpoint label | N | P11 YX-API-09 |
| `api.route.deprecated.admin` | SYS | `api.route.deprecated` | Admins of tenants that called the route | IA E | N | Vars: route, sunset date | N | P11 YX-API-13 |
| `report.ready.requester` | SYS | `report.prepared.ready` | User who ran the heavy query | IA E | N | Link | N | P09 §4.1 |
| `report.subscription.delivery.recipient` | SYS | `report.subscription.due` (SCH-15) | Subscription recipients | E IA (W link only) | N | File only without Confidential / Special data (YX-MET-08), else Link | N | P09 Q7 |
| `report.subscription.failed.owner` | SYS | `report.subscription.failed` | Subscription owner | IA E | N | Vars: report name | N | P09 §4.6 |
| `search.index.rebuild_failed.admin` | SYS | `search.index.rebuild_failed` | System Admin (+ YukthiX ops on-call) | IA E | N | Vars: source label, failed row count | N | P17 YX-SRCH-06 |
| `customisation.object.changed.admins` | SYS | `customisation.object.activated` / `customisation.object.archived` | System Admins + `customisation.manage` holders | IA E | N | Vars: object label, action (activated / archived) | Y | P18 §7 |
| `customisation.package.promoted.admins` | SYS | `customisation.package.promoted` | System Admins + `customisation.manage` holders | IA E | N | Vars: package version, change count | N | P18 YX-CUST-08 |

### 2.8 Billing & account (spec D15; proposed P14)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `billing.sms.cap_nearing.admin` | BIL | `channel.usage.threshold_reached` (SMS, 80 %) (SCH-13) | System Admin + billing contact | IA E | Y | Vars: % used, cap | N | P04 Q3, F3 |
| `billing.sms.cap_reached.admin` | BIL | `channel.usage.threshold_reached` (SMS, 100 %) | System Admin + billing contact | IA E | Y | Vars: cap | U | P04 YX-NTF-12 |
| `billing.ai_credits.nearing.admin` | BIL | `ai.credits.threshold_reached` (80 %) (SCH-13) | System Admin + billing contact | IA E | Y | Vars: % used | N | P10 YX-AI-03, F3 |
| `billing.ai_credits.exhausted.admin` | BIL | `ai.credits.threshold_reached` (100 %) | System Admin + billing contact | IA E | Y | Vars: plan limit | U | P10 YX-AI-03 |
| `billing.api_limit.nearing.admin` | BIL | `api.usage.threshold_reached` (SCH-13) | System Admin | IA E | N | Vars: % of fair-use limit | Y | P11 Q8 |
| `billing.invoice.issued.billing` | BIL | `billing.invoice.issued` | Billing contact | E IA | Y | Vars: invoice no., amount, due date (the tenant's own YukthiX invoice) | N | GAP A4 → P14 |
| `billing.payment.received.billing` | BIL | `billing.payment.received` | Billing contact | E | N | Vars: invoice no., amount | N | GAP A4 → P14 |
| `billing.payment.failed.billing` | BIL | `billing.payment.failed` | Billing contact + System Admin | E IA | Y | Vars: invoice no., retry date | U | GAP A4 → P14 |
| `billing.grace.ending.billing` | BIL | `billing.grace.ending` (SCH-16) | Billing contact + System Admin | E IA | Y | Vars: suspension date | N | GAP A4 → P14 |
| `billing.subscription.suspended.admins` | BIL | `billing.subscription.suspended` | All System Admins + billing contact | E IA | Y | Link | U | GAP A4 → P14 |
| `billing.trial.ending.admin` | BIL | `billing.trial.ending` (SCH-16) | System Admin | E IA | N | Vars: trial end date | N | GAP A4 → P14 |
| `tenant.export.ready.admin` | BIL | `tenant.export.ready` | System Admin who requested it | E IA | Y | Link | N | GAP A4 → P14 |
| `cs.message.admin` | BIL | `cs.message.published` | Tenant System Admins matching the message's audience rule | IA (banner + inbox "From YukthiX") E | N | Vars: title, link | N | P14 C8, YX-CONSOLE-06 |
| `cs.churn_risk.cs_owner` | BIL | `tenant.health.churn_risk_raised` | Assigned YukthiX CS owner (platform staff console) | IA E | N | Vars: tenant name, churn band, score change (never tenant HR data, YX-CONSOLE-01) | N | P14 YX-CONSOLE-05 |

### 2.9 Core HR & lifecycle (M01)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `preboarding.invite.candidate` | PPL | `preboarding.started` | Pre-boarder (personal email / mobile) | E W/S | N | Vars: company name, joining date, portal link | N | M01 §3.5 |
| `preboarding.reminder.candidate` | PPL | `preboarding.items.pending` (SCH-18) | Pre-boarder | E W/S | N | Vars: pending item count, joining date | Y | M01 Q2 |
| `preboarding.touchpoint.candidate` | PPL | `preboarding.touchpoint.due` (SCH-19) | Pre-boarder (campus / long pre-boarding) | E W | N | Vars: touchpoint title | N | M01 E18 |
| `preboarding.joining_date.changed.candidate` | PPL | `preboarding.joining_date.changed` | Pre-boarder | E W/S | N | Vars: new joining date | N | M01 YX-LC-13 |
| `preboarding.joining_date.changed.manager` | PPL | `preboarding.joining_date.changed` | Manager + journey task owners | IA E | N | Vars: joiner name, new date | Y | M01 YX-LC-13 |
| `preboarding.completed.hr` | PPL | `preboarding.completed` | HR onboarding owner | IA | N | — | Y | M01 §3.5 |
| `preboarding.cancelled.recruiter` | HIR | `preboarding.cancelled` | Recruiter + hiring manager | IA E | N | Vars: candidate name, outcome (did not join / reneged / withdrawn) | N | M01 YX-LC-12 |
| `employee.joining_tomorrow.manager` | PPL | `employee.joining_due` (SCH-20) | Manager, IT and admin task owners | IA P E | N | Vars: joiner name, date | N | M01 §3.5 |
| `journey.task.assigned.owner` | PPL | `journey.task.assigned` | Task owner (HR, IT, admin, manager, new hire, clearance owner) | IA P E | N | Vars: task title, person name, due date | Y | M01 YX-LC-02 |
| `journey.task.due.owner` | PPL | `journey.task.due` (SCH-21) | Task owner | IA P | N | Vars: task title, due date | Y | M01 YX-LC-02 |
| `journey.task.overdue.escalation` | PPL | `journey.task.overdue` (SCH-21) | Owner's manager, then HR | IA E | N | Vars: task title, days overdue | Y | M01 YX-LC-02 |
| `probation.review.due.manager` | PPL | `employee.probation.review_due` (SCH-22) | Manager | IA P E | N | Vars: employee name, probation end date | N | M01 YX-LC-01 |
| `probation.review.reminder.manager` | PPL | `employee.probation.review_due` (reminder offsets) | Manager | IA P | N | Vars: employee name, end date | Y | M01 Q3 |
| `probation.review.overdue.hr` | PPL | `employee.probation.overdue` (SCH-22) | HR + manager | IA E | N | Vars: employee name | N | M01 YX-LC-01 |
| `probation.confirmed.employee` | PPL | `employee.probation.confirmed` | Employee | IA P E | N | Vars: confirmation date | N | M01 Q3 |
| `probation.extended.employee` | PPL | `employee.probation.extended` | Employee | IA P E | N | Vars: new end date | N | M01 Q3 |
| `absence.return_due.manager` | PPL | `employee.absence.return_due` (SCH-25) | Manager + HR | IA E | N | Vars: employee name, return date (never the absence type) | N | M01 YX-EMP-06 |
| `asset.assigned.employee` | PPL | `asset.assigned` | Employee (acknowledgement) | IA P | N | Vars: asset name | N | M01 §3.6 |
| `asset.return_due.employee` | PPL | `asset.return_due` (SCH-27) | Leaver | IA P E | N | Vars: asset count, return-by date | Y | M01 §3.6, F3 |
| `asset.return_overdue.admin` | PPL | `asset.return_due` (overdue offset) | Asset admin + HR | IA E | N | Vars: employee name, asset count | Y | M01 §3.6 |
| `exit.case.opened.hr` | PPL | `exit.case.opened` | HR (+ manager for resignations) | IA E | N | Vars: employee name, exit type label, requested LWD | N | M01 §3.7 |
| `exit.precheck.flagged.hr` | PPL | `exit.case.opened` (open case or PIP found) | HR case owners only (never the manager for POSH) | IA | N | — | N | M01 YX-LC-23 |
| `exit.case.accepted.employee` | PPL | `exit.case.accepted` | Leaver | IA P E | N | Vars: approved LWD | N | M01 Q6 |
| `exit.case.withdrawn.stakeholders` | PPL | `exit.case.withdrawn` | Manager, HR, open task owners | IA E | N | Vars: employee name | N | M01 Q6 |
| `exit.lwd.changed.employee` | PPL | `exit.lwd.changed` | Leaver + manager | IA E | N | Vars: new LWD | N | M01 YX-LC-21 |
| `exit.lwd.approaching.employee` | PPL | `employment.lwd_approaching` (SCH-26) | Leaver | IA P E | N | Vars: LWD, pending item count | N | M01 D6, F3 |
| `exit.lwd.approaching.manager` | PPL | `employment.lwd_approaching` (SCH-26) | Manager + HR | IA E | N | Vars: employee name, LWD, open handover count | Y | M01 D6, F3 |
| `exit.deprovisioning.failed.hr` | PPL | `exit.deprovisioning.failed` | HR | IA E | N | Link | N | M01 YX-LC-14 |
| `fnf.due.payroll` | PAY | `fnf.due` (SCH-28) | Payroll + HR | IA E | N | Vars: employee name, deadline | Y | M01 YX-LC-08, M03 YX-PAY-48 |
| `fnf.overdue.payroll` | PAY | `fnf.overdue` (SCH-28) | Payroll + HR head | IA P E | Y | Vars: employee name, days overdue | N | M01 YX-LC-08, M03 YX-PAY-48 |
| `fnf.paid.employee` | PAY | `fnf.paid` | Leaver (alumni login) or nominees | IA E S | N | Link (statement in app) | N | M01 Q7 |
| `absconding.alert.manager` | PPL | `absconding.step.reached` (salary-hold step) | Manager + HR | IA E | Y | Vars: employee name, first absent date | N | M01 YX-LC-17 |
| `absconding.notice.employee` | PPL | `absconding.step.reached` (notice steps) | Employee (email; registered post is sent separately) | E | Y | Link to the P05 notice letter (the letter itself is the legal notice) | N | M01 YX-LC-17 |
| `absconding.abandonment.hr` | PPL | `absconding.step.reached` (deemed abandonment) | HR | IA E | N | Link | N | M01 YX-LC-17 |
| `retirement.approaching.hr` | PPL | `employee.retirement.approaching` (SCH-24) | HR + manager | IA E | N | Vars: employee name, retirement date | Y | M01 YX-LC-20, F3 |
| `retirement.approaching.employee` | PPL | `employee.retirement.approaching` (SCH-24) | Employee | IA E | N | Vars: retirement date | N | M01 YX-LC-20 |
| `contract.ending.hr` | PPL | `employment.contract_ending` (SCH-23) | HR + manager | IA E | N | Vars: employee name, end date, policy action | Y | M01 YX-LC-19 |
| `contract.ending.employee` | PPL | `employment.contract_ending` (SCH-23) | Employee | IA P E | N | Vars: end date | N | M01 YX-LC-19 |
| `transfer.continuity.pending.payroll` | PAY | `employment.opened` (inter-entity transfer) | Payroll of the new entity | IA | N | — | Y | M01 YX-EMP-08 |
| `gratuity.eligible.payroll` | PAY | `employee.gratuity.eligible` (SCH-29) | Payroll | IA | N | — | Y | P07, F3 |
| `position.vacant.hr` | PPL | `position.vacated` | HR + head of the position's department | IA E | N | Vars: position code, title | Y | M01 YX-EMP-09 |
| `workforce.scenario.approved.owner` | PPL | `workforce.scenario.approved` | Scenario owner, HR head, finance | IA E | N | Vars: scenario name, new position count | N | M01 YX-EMP-10 |

### 2.10 Leave & attendance (M02, M04 kiosk)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `leave.request.submitted.approver` | APR | `leave.request.submitted` | Leave approver (P03 task) | IA P W E | N | Vars: requester name, leave type label, dates, days, "N others off" | Y | P04 §1, M02 A2 |
| `leave.request.approved.employee` | TIM | `leave.request.approved` | Employee | IA P W | N | Vars: leave type label, dates | N | P04 Q1 |
| `leave.request.rejected.employee` | TIM | `leave.request.rejected` | Employee | IA P W | N | Vars: leave type label, dates (reason in app) | N | P04 Q1 |
| `leave.request.cancelled.approver` | TIM | `leave.request.cancelled` | Approvers + delegate | IA | N | — | Y | M02 A2 |
| `leave.compoff.credited.employee` | TIM | `leave.compoff.credited` | Employee | IA | N | — | Y | M02 A2 |
| `leave.compoff.expiring.employee` | TIM | `leave.compoff.expiring` (SCH-36) | Employee | IA P | N | Vars: days, expiry date | Y | M02 YX-LV-06 |
| `leave.year_end.posted.employee` | TIM | `leave.year_end.posted` | Employees in the run | IA P E | N | Vars: carried and lapsed days | N | M02 A2 |
| `holiday.calendar.published.employee` | TIM | `holiday.calendar.published` | Employees on that calendar | IA P | N | Vars: year, optional-holiday choose-by date | N | M02 A2 |
| `holiday.tomorrow.employee` | TIM | `holiday.tomorrow` (SCH-32) | Employees on that calendar | IA P | N | Vars: holiday name | N | P04 §4.6 |
| `attendance.checkin.missing.employee` | TIM | `attendance.checkin.missing` (SCH-33) | Employee (Punch mode, working day) | IA P W | N | Vars: shift start time | N (U when the shift falls in quiet hours) | P04 Q1 / Q7 |
| `attendance.exception.raised.employee` | TIM | `attendance.exception.raised` (SCH-34) | Employee, next day | IA P W | N | Vars: date, exception label ("No check-out") | Y | P08 §A4b |
| `attendance.exception.reminder.employee` | TIM | `attendance.exception.reminded` (HR "Remind all" / manager nudge) | Employee | IA P W | N | Vars: date, exception label | N | P08 Q4, M04 Q5 |
| `attendance.exception.weekly.manager` | TIM | `attendance.exceptions.weekly` (SCH-34) | Manager | IA E | N | Vars: team exception count | Y | P08 Q4 |
| `attendance.exception.digest.hr` | TIM | `attendance.exceptions.daily` (SCH-34) | HR | IA E | N | Vars: open count | Y | P08 Q4 |
| `attendance.cutoff.approaching.hr` | TIM | `attendance.cutoff.approaching` (SCH-35) | HR + Payroll (with "Remind all") | IA P E | N | Vars: cut-off date, open count | N | P08 Q2 / Q4 |
| `attendance.cutoff.approaching.employee` | TIM | `attendance.cutoff.approaching` (SCH-35) | Employees with open exceptions; managers with pending approvals | IA P W | N | Vars: cut-off date | N | P08 Q2 |
| `attendance.late_penalty.warning.employee` | TIM | `attendance.late_penalty.pending` | Employee | IA P | N | Vars: late count, penalty label | N | M02 Q4 |
| `attendance.late_penalty.posted.employee` | TIM | `attendance.late_penalty.posted` | Employee | IA | N | — | Y | M02 YX-AT-05 |
| `attendance.ot.cap_exceeded.hr` | TIM | `attendance.ot.cap_exceeded` | HR | IA E | N | Vars: employee name, hours | Y | M02 Q7 |
| `roster.published.employee` | TIM | `roster.published` | Affected employees | IA P W | N | Vars: period | Y | M02 YX-AT-07 |
| `roster.shift_changed.employee` | TIM | `roster.shift.changed` | Affected employee | IA P W/S | N | Vars: date, shift times | U (same day) / N | P04 Q7 |
| `roster.swap.consent.colleague` | APR | `approval.task.assigned` (swap-consent step) | Colleague asked to swap | IA P W | N | Vars: requester name, dates | N | M02 §B2 |
| `timesheet.due.employee` | TIM | `timesheet.due` (SCH-37) | Employee (Timesheet mode, placements, M12 project members) | IA P | N | Vars: week | Y | M02 §B7 |
| `timesheet.approval.client_contact` | HIR | `timesheet.submitted` (placement) | Client contact (portal) | E | N | Vars: contractor name, week, hours (never rates) | Y | M02 D4, M10 Q8 |
| `timesheet.rejected.employee` | TIM | `timesheet.rejected` | Employee | IA P | N | Vars: week, action label (rejected / hours reduced); reason in app | N | M12 YX-PRJ-04, M02 §B7 |
| `timesheet.client_approval.client_contact` | WRK | `approval.task.assigned` (client step of a project timesheet, after the PM) | Client contact (portal) | E | N | Vars: project name, week, hours (never rates) | Y | M12 YX-PRJ-04 |
| `kiosk.offline.admin` | SYS | `kiosk.heartbeat.missed` (SCH-12) | Kiosk owner (HR / site admin) | IA E | N | Vars: kiosk name, location, last seen | N | M04 Q4 |
| `field.tracking.consent_withdrawn.manager` | TIM | `field.tracking.consent_changed` (withdrawn) | Manager + HR in scope | IA | N | — | Y | M02 YX-AT-16 |
| `field.visit.missed.manager` | TIM | `field.visit.missed` (SCH-73) | Manager | IA E | N | Vars: employee name, site name, date | Y | M02 §B8 |
| `field.integrity.flagged.manager` | TIM | `field.integrity.flagged` | Manager | IA | N | — | Y | M02 YX-AT-17 |
| `field.mileage.draft.employee` | TIM | `field.mileage.drafted` | Employee | IA P | N | Vars: date, distance | Y | M02 YX-AT-18, M05 YX-EXP-16 |
| `roster.draft.ready.manager` | TIM | `roster.draft.generated` | Roster owner (manager) | IA E | N | Vars: location, period, unfilled slot count | N | M02 YX-AT-19 |
| `roster.open_shift.offered.employee` | TIM | `roster.open_shift.published` | Eligible employees only | IA P W | N | Vars: date, shift times, location | Y | M02 YX-AT-20 |
| `roster.open_shift.awarded.employee` | TIM | `roster.open_shift.awarded` | Awarded employee; other claimants get the "not awarded" variant | IA P W | N | Vars: date, shift times | N | M02 YX-AT-20 |
| `roster.bid_window.opened.employee` | TIM | `roster.bid_window.opened` | Employees in the window's scope | IA P | N | Vars: roster period, close date | N | M02 YX-AT-20 |
| `roster.bid_window.closing.employee` | TIM | `roster.bid_window.closing` (SCH-74) | Employees who haven't bid | IA P | N | Vars: close time | Y | M02 YX-AT-20 |
| `visitor.invite.visitor` | WRK | `visitor.registered` | Visitor (not a user; contact from the registration) | E W/S | N | Vars: host first name, location name, date / window, QR pass link, notice link (APX-G G-27) | N | M02 §B11 |
| `visitor.walkin.approval.host` | APR | `approval.task.assigned` (visitor walk-in step) | Host | IA P | N | Vars: visitor name, company | U | M02 §B11, M04 YX-MOB-16 |
| `visitor.arrived.host` | WRK | `visitor.checked_in` | Host | IA P W | N | Vars: visitor name, location | N | M02 YX-AT-22 |

### 2.11 Payroll, tax & statutory (M03)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `payroll.cutoff.approaching.hr` | PAY | `payroll.cutoff.approaching` (SCH-38) | HR, Payroll, managers with pending pay-affecting approvals | IA E | N | Vars: cut-off date | Y | P04 §4.6 |
| `payroll.run.calculated.payroll` | PAY | `payroll.run.calculated` | Maker (Payroll) | IA | N | — | N | M03 §6 |
| `payroll.run.submitted.approver` | APR | `approval.task.assigned` (payroll run / bank file) | Checker | IA P E | N | Link (login + MFA; no one-time link, no WhatsApp) | N | M03 Q2, P03 Q4 |
| `payroll.run.approved.payroll` | PAY | `payroll.run.approved` | Maker + Finance | IA E | N | Vars: pay group, period | N | M03 YX-PAY-07 |
| `payroll.run.voided.payroll` | PAY | `payroll.run.voided` | Payroll + Finance | IA E | N | Vars: pay group, period | N | M03 YX-PAY-08 |
| `period.reopened.admins` | PAY | `period.reopened` | Payroll + owner | IA E | Y | Vars: entity, period | N | P08 §A4 |
| `payslip.published.employee` | PAY | `payslip.published` | Each paid employee | IA P W E | Y | Vars: month (never amounts) | N | P04 §1, M03 §6 |
| `payslip.pdf_email.employee` | PAY | `payslip.published` (legal entity's payslip-email policy on) | Employee (verified address of the configured type; never CC / BCC) | E | Y | Password-protected PDF attached (AES-256); the email names the password scheme, never the password or any amount; missing scheme inputs → link-only | N | P04 YX-NTF-15 |
| `payment.failed.employee` | PAY | `payment.failed` (payslip) | Employee | IA P W/S | Y | Link ("update your bank details") | N | M03 YX-PAY-14 |
| `payment.failed.payroll` | PAY | `payment.failed` | Payroll | IA E | N | Vars: count, reason code | N | M03 D11 |
| `payroll.hold.released.employee` | PAY | `payroll.hold.released` | Employee | IA P | N | Link | N | M03 YX-PAY-28 |
| `payroll.hold.ageing.payroll` | PAY | `payroll.holds.weekly` (SCH-39) | Payroll | IA E | N | Vars: count by age | Y | M03 YX-PAY-28 |
| `payroll.recovery.deferred.employee` | PAY | `recovery.deferred` | Employee | IA | N | — | Y | M03 YX-PAY-11 |
| `payroll.carry_forward.employee` | PAY | `payroll.carry_forward.created` | Employee | IA | N | — | N | M03 YX-PAY-29 |
| `payslip.query.raised.payroll` | PAY | `payslip.query.raised` | Payroll query queue | IA E | N | Vars: count | Y | M03 YX-PAY-25 |
| `payslip.query.replied.employee` | PAY | `payslip.query.replied` | Employee | IA P | N | Link | N | M03 YX-PAY-25 |
| `payroll.journal.ready.finance` | PAY | `payroll.journal.ready` | Finance / accounting owner | IA E | N | Vars: entity, period | N | P10 Q7 |
| `statutory.filing.rejected.payroll` | PAY | `statutory.filing.rejected` | Payroll | IA P E | Y | Vars: statute, period | N | M03 Q7 |
| `case.action.payroll_input.payroll` | PAY | `case.action.applied` (suspension or deduction) | Payroll | IA | N | — (no case details) | N | M08 YX-CASE-07, M03 YX-PAY-23 |
| `tax.declaration.open.employee` | PAY | `tax.declaration.window.opened` | Employees (and joiners) | IA P E | N | Vars: close date | N | M03 Q5 |
| `tax.declaration.closing.employee` | PAY | `tax.declaration.window.closing` (SCH-40) | Employees without a submitted declaration | IA P E W | N | Vars: close date | Y | M03 Q5 |
| `tax.regime.cutoff.employee` | PAY | `tax.regime.cutoff_approaching` (SCH-41) | Employees who haven't confirmed a regime | IA P E | N | Vars: cut-off date | Y | M03 YX-TAX-01, F3 |
| `tax.proof.open.employee` | PAY | `tax.proof.window.opened` | Employees with declarations | IA P E | N | Vars: close date | N | M03 Q5 |
| `tax.proof.closing.employee` | PAY | `tax.proof.window.closing` (SCH-42) | Employees with unproven lines | IA P E W | N | Vars: close date, pending line count | Y | P04 §4.6, M03 Q5 |
| `tax.proof.submitted.payroll` | PAY | `tax.proof.submitted` | Proof verifiers | IA | N | — | Y (daily) | M03 YX-TAX-05 |
| `tax.proof.verified.employee` | PAY | `tax.proof.verified` | Employee | IA P | N | Link (line status in app) | Y | M03 YX-TAX-05 |
| `tax.form16.published.employee` | PAY | `document.issued` (Form 130; Form 16 for FY 2025-26 and earlier) | Employees and alumni | IA P W E | Y | Vars: tax year / financial year | N | M03 §6 |
| `tax.pan.inoperative.payroll` | PAY | `verification.check.completed` (PAN inoperative) | Payroll + HR | IA E | N | Vars: count | Y | M03 YX-TAX-10 |
| `tax.pan.inoperative.employee` | PAY | `verification.check.completed` (PAN inoperative) | Employee | IA P E | N | Link | N | M03 YX-TAX-10 |
| `loan.closed.employee` | PAY | `loan.closed` | Employee | IA | N | — | Y | M03 §6 |
| `ewa.draw.disbursed.employee` | PAY | `ewa.draw.disbursed` | Employee | IA P | N | Link (amount, fee and recovery month in app; never in push / WhatsApp, YX-MOB-14) | N | M03 YX-PAY-40 / 41 |
| `ewa.draw.failed.employee` | PAY | `ewa.draw.failed` | Employee | IA P | N | Link | N | M03 YX-PAY-40 |
| `esop.grant.issued.employee` | PAY | `esop.grant.approved` | Grantee | IA P E | N | Link (grant letter to e-sign in app; never units or price) | N | M03 YX-PAY-46 |
| `esop.vested.employee` | PAY | `esop.vested` | Grantee | IA P | N | Link | Y | M03 YX-PAY-46 |
| `esop.exercise.approved.employee` | PAY | `esop.exercise.approved` | Employee | IA P E | N | Link (perquisite and TDS preview in app) | N | M03 YX-TAX-18 |
| `esop.exercise_window.closing.employee` | PAY | `esop.exercise_window.closing` (SCH-75) | Holder of vested, unexercised units (leavers via the alumni login) | IA P E | N | Vars: window end date | N | M03 YX-PAY-46 |

### 2.12 Expenses, advances & travel (M05)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `expense.claim.submitted.approver` | APR | `expense.claim.submitted` | Claim approver (P03 task) | IA P W E | N | Vars: requester name, claim title; total only when ≤ the tenant's small-expense limit | Y | P04 §4.5 |
| `expense.claim.approved.employee` | PAY | `expense.claim.approved` | Employee | IA P W | N | Vars: claim title, payment route ("in October payroll") | N | M05 YX-EXP-07 |
| `expense.claim.partly_approved.employee` | PAY | `expense.claim.approved` (reduced lines) | Employee | IA P W | N | Link (amounts and reasons in app) | N | M05 YX-EXP-02 |
| `expense.claim.rejected.employee` | PAY | `expense.claim.rejected` | Employee | IA P W | N | Vars: claim title | N | M05 |
| `expense.claim.paid.employee` | PAY | `expense.claim.paid` | Employee | IA P | N | Vars: claim title | Y | M05 YX-EXP-07 |
| `expense.claim.payment_failed.employee` | PAY | `payment.failed` (expense payment) | Employee | IA P W/S | Y | Link | N | M05, M03 YX-PAY-14 |
| `expense.claim.flagged.finance` | PAY | `expense.claim.flagged` | Finance review queue | IA E | N | Vars: count, flag type | Y | M05 YX-EXP-04 |
| `trip.approved.employee` | PAY | `trip.approved` | Traveller | IA P W | N | Vars: trip title, dates | N | M05 §6 |
| `trip.booking_requested.travel_desk` | PAY | `trip.approved` (booking by travel desk) | Travel desk | IA E | N | Vars: traveller name, dates, route | N | M05 Q3 |
| `trip.bookings_uploaded.employee` | PAY | `trip.booking.uploaded` | Traveller | IA P E | N | Vars: trip title | N | M05 Q3 |
| `advance.paid.employee` | PAY | `advance.paid` | Employee | IA P | N | Vars: trip title | Y | M05 |
| `advance.settlement_due.employee` | PAY | `advance.settlement_due` (SCH-43) | Employee | IA P E | N | Vars: trip title, settle-by date | Y | M05 YX-EXP-09 |
| `advance.overdue.employee` | PAY | `advance.overdue` (SCH-43) | Employee + finance | IA P E | N | Vars: trip title, settle-by date | N | M05 YX-EXP-09 |
| `advance.recovery_scheduled.employee` | PAY | `advance.recovery.scheduled` | Employee | IA P E | N | Link (amounts in app) | N | M05 Q6 |
| `card.unmatched.employee` | PAY | `card.statement.imported` | Cardholder | IA P E | N | Vars: unmatched line count | Y | M05 Q8 |

### 2.13 Performance (M06)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `perf.cycle.launched.participant` | PRF | `perf.cycle.launched` | Cycle participants | IA P E | N | Vars: cycle name, first deadline | N | M06 §6 |
| `perf.stage.open.owner` | PRF | `perf.review.stage_opened` | Stage owner (self, manager, skip-level, HR release) | IA P E | N | Vars: cycle, stage label, due date | Y | M06 YX-PERF-06 |
| `perf.stage.reminder.owner` | PRF | `approval.task.reminder` (review stage) | Stage owner | IA P E | N | Vars: cycle, stage label, due date | Y | M06 YX-PERF-06 |
| `perf.stage.escalated.manager` | PRF | `approval.task.escalated` (review stage) | Owner's manager / HR | IA E | N | Vars: employee name, stage label | N | M06 YX-PERF-06 |
| `perf.feedback.requested.reviewer` | PRF | `perf.feedback.requested` | Nominated 360° reviewer | IA P E | N | Vars: subject name, due date | Y | M06 Q4 |
| `perf.feedback.reminder.reviewer` | PRF | `perf.feedback.pending` (SCH-44) | Reviewer who hasn't answered | IA P | N | Vars: due date | Y | M06 Q4 |
| `perf.review.released.employee` | PRF | `perf.review.released` | Employee | IA P E | N | Link (never the rating) | N | M06 YX-PERF-09 |
| `perf.review.ack_pending.employee` | PRF | `perf.review.ack_pending` (SCH-44) | Employee | IA P | N | Link | Y | M06 Q2 |
| `perf.review.disagreement.hr` | PRF | `perf.review.acknowledged` (disagreement flag) | HR | IA E | N | Link | N | M06 Q2 |
| `perf.calibration.assigned.facilitator` | PRF | `perf.calibration.session.created` | Facilitator + participants | IA E | N | Vars: group, date | N | M06 Q5 |
| `perf.comp_review.open.manager` | PRF | `perf.comp_cycle.opened` | Managers who propose | IA E | N | Vars: cycle name, deadline | N | M06 Q6 |
| `perf.pip.started.employee` | PRF | `perf.pip.started` | Employee (acknowledgement) | IA P E | N | Link | N | M06 Q7 |
| `perf.pip.checkin_due.participants` | PRF | `perf.pip.checkin_due` (SCH-47) | Manager + employee | IA P | N | Vars: check-in date | Y | M06 Q7 |
| `perf.pip.end_due.hr` | PRF | `perf.pip.end_due` (SCH-47) | HR + manager | IA E | N | Vars: employee name, end date | N | M06 YX-PERF-11 |
| `perf.pip.closed.employee` | PRF | `perf.pip.closed` | Employee + HR | IA E | N | Link | N | M06 Q7 |
| `perf.handover.new_manager` | PRF | `perf.owner.transferred` | New manager + HR | IA E | N | Vars: artefact count | N | M06 YX-PERF-13 |
| `perf.goal.checkin_due.owner` | PRF | `perf.goal.checkin_due` (SCH-45) | Goal owner | IA P | N | Vars: goal count | Y | M06 §3, F3 |
| `perf.one_on_one.upcoming.participants` | PRF | `perf.one_on_one.due` (SCH-46) | Employee + manager | IA P | N | Vars: date, time | Y | M06 §3, F3 |
| `perf.one_on_one.lapsed.manager` | PRF | `perf.one_on_one.lapsed` (SCH-46) | Manager | IA | N | — | Y | M06 §3, F3 |
| `perf.quick_feedback.received.employee` | PRF | `perf.feedback.quick_given` | Receiver | IA P | N | — | Y | M06 §6 |
| `perf.idp.approved.employee` | PRF | `perf.idp.approved` | Employee | IA P E | N | Vars: period | N | M06 YX-PERF-14 |
| `perf.idp.mentor_request.mentor` | PRF | `perf.idp.mentor_requested` | Named mentor (sees only their items) | IA P E | N | Vars: employee name | N | M06 YX-PERF-14 |
| `perf.talent_pool.added.employee` | PRF | `perf.talent_pool.changed` (added; company setting "tell pool members" on) | Employee | IA | N | — | N | M06 YX-PERF-16 |

### 2.14 Learning (M07)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `learning.enrolment.assigned.employee` | LRN | `learning.enrolment.created` | Employee | IA P E | N (Y for mandatory courses) | Vars: course title, due date | Y | M07 Q2 / Q3 |
| `learning.nomination.declined.manager` | LRN | `learning.enrolment.declined` | Nominating manager | IA | N | — | Y | M07 Q2 |
| `learning.enrolment.due.employee` | LRN | `learning.enrolment.due` (SCH-48) | Employee | IA P E | N | Vars: course title, due date | Y | M07 YX-LRN-04 |
| `learning.enrolment.overdue.manager` | LRN | `learning.enrolment.overdue` (SCH-48) | Manager, then HR | IA E | N | Vars: employee name, course title | Y | M07 YX-LRN-04 |
| `learning.session.reminder.attendee` | LRN | `learning.session.upcoming` (SCH-50) | Attendees + trainer | IA P E | N | Vars: course title, time, venue or link | N | M07 §3 |
| `learning.session.changed.attendee` | LRN | `learning.session.changed` | Attendees + trainer | IA P E | N | Vars: course title, new time / venue | N | M07 §3 |
| `learning.waitlist.promoted.employee` | LRN | `learning.waitlist.promoted` | Promoted employee | IA P E | N | Vars: course title, date | N | M07 YX-LRN-06 |
| `learning.completed.employee` | LRN | `learning.enrolment.completed` | Employee | IA P | N | Vars: course title | Y | M07 YX-LRN-01 |
| `learning.certification.expiring.employee` | LRN | `learning.certification.expiring` (SCH-49) | Employee + manager | IA P E | N | Vars: certification, expiry date | Y | M07 YX-LRN-05 |
| `learning.certification.expired.manager` | LRN | `learning.certification.expired` (SCH-49) | Employee, manager, L&D | IA E | N | Vars: certification, employee name | N | M07 YX-LRN-05 |
| `learning.feedback.requested.attendee` | LRN | `learning.session.ended` | Attendees | IA P | N | Vars: course title | Y | M07 Q8 |
| `learning.effectiveness.check.manager` | LRN | `learning.effectiveness.due` (SCH-51) | Manager | IA E | N | Vars: employee name, course title | Y | M07 Q8 |
| `learning.trainer.assigned.trainer` | LRN | `learning.session.trainer_assigned` | Trainer (external: email + OTP login) | E IA | N | Vars: course title, dates, sign-in link | N | M07 Q6 |
| `learning.trainer.attendance_due.trainer` | LRN | `learning.session.attendance_due` (SCH-50) | Trainer | E IA | N | Vars: course title, date | N | M07 Q6 / Q7 |
| `learning.need.created.lnd` | LRN | `learning.need.created` | L&D admin | IA | N | — | Y | M07 Q4 |
| `learning.budget.exceeded.lnd` | LRN | `learning.budget.threshold_reached` | L&D + department head | IA E | N | Vars: department, % used | N | M07 Q5 |
| `learning.badge.issued.employee` | LRN | `learning.badge.issued` | Employee | IA P E | N | Vars: certification name, share link | N | M07 YX-LRN-13 |
| `learning.badge.revoked.employee` | LRN | `learning.badge.revoked` | Employee | IA E | N | Vars: certification name, reason label (expired / revoked) | N | M07 YX-LRN-13 |
| `learning.provider.sync_failed.lnd` | LRN | `learning.provider.sync_failed` | L&D admin + connection owner | IA E | N | Vars: provider name, error class | N | M07 YX-LRN-10 |
| `learning.provider.unmatched.lnd` | LRN | `learning.provider.learners_unmatched` | L&D admin | IA | N | — | Y | M07 YX-LRN-10 |

### 2.15 Helpdesk, cases & policies (M08)

Case rows are all **Neutral** outside the app (YX-CASE-06). Case members are the named case team only (YX-CASE-02); P04 re-checks membership at send time.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `helpdesk.ticket.created.requester` | HLP | `helpdesk.ticket.created` | Requester (employee, email sender, client contact) | IA E | N | Vars: ticket number; subject only for non-sensitive categories | N | M08 §6 |
| `helpdesk.ticket.assigned.agent` | HLP | `helpdesk.ticket.assigned` | Agent | IA P E | N | Vars: ticket number, category | Y | M08 YX-HD-01 |
| `helpdesk.ticket.replied.requester` | HLP | `helpdesk.ticket.replied` (agent reply) | Requester | IA P E | N | Link | N | M08 §6 |
| `helpdesk.ticket.replied.agent` | HLP | `helpdesk.ticket.replied` (requester reply) | Agent | IA | N | — | Y | M08 §6 |
| `helpdesk.ticket.sla_warning.agent` | HLP | `helpdesk.ticket.sla_warning` (SCH-54) | Agent | IA P | N | Vars: ticket number, time left | N | M08 YX-HD-02 |
| `helpdesk.ticket.sla_breached.lead` | HLP | `helpdesk.ticket.sla_breached` (SCH-54) | Queue lead | IA P E | N | Vars: ticket number | N | M08 YX-HD-02 |
| `helpdesk.ticket.resolved.requester` | HLP | `helpdesk.ticket.resolved` | Requester (rating request) | IA P E | N | Vars: ticket number, rating link | N | M08 YX-HD-05 |
| `case.filed.owner` | HLP | `case.filed` | Case owner / IC presiding officer / ethics officer | IA P E | Y | Neutral | N | M08 §6 |
| `case.acknowledged.complainant` | HLP | `case.updated` (acknowledged) | Named complainant | IA E | Y | Neutral | N | M08 §6 |
| `case.update.member` | HLP | `case.updated` | Case members concerned by the step | IA P E | Y | Neutral | N | M08 YX-CASE-06 |
| `case.member.appointed.member` | HLP | `case.member.added` | New member (IC member, investigator, witness) | IA E | Y | Neutral | N | M08 Q4 |
| `case.notice.respondent` | HLP | `case.updated` (respondent formally notified) | Respondent (employee or external party) | IA E | Y | Neutral | N | M08 YX-CASE-02 / 09 |
| `case.external_access.party` | HLP | `case.member.added` (external party or member) | External complainant, respondent or member | E S | Y | Neutral + sign-in link | N | M08 YX-CASE-09 |
| `case.stage.due.member` | HLP | `case.stage.due` (SCH-53) | Stage owner | IA P E | Y | Neutral | N | M08 YX-CASE-05 |
| `case.stage.overdue.escalation` | HLP | `case.stage.overdue` (SCH-53) | Case owner + IC presiding officer / ethics officer | IA E | Y | Neutral | N | M08 YX-POSH-03 |
| `case.anonymous.update.reporter` | HLP | `case.updated` (anonymous case with contact given) | Anonymous reporter's encrypted contact | E or S | N | Neutral only | N | M08 YX-CASE-11 |
| `case.retaliation.flagged.owner` | HLP | `case.retaliation.flagged` | Case owner | IA P E | Y | Neutral | U | M08 YX-CASE-08 |
| `case.escalated.audit_chair` | HLP | `case.escalated` | Audit committee chair (external login) | E | Y | Neutral | N | M08 Q8 |
| `disciplinary.warning.expired.hr` | HLP | `disciplinary.warning.expired` (SCH-55) | HR case owner (employee informed in app) | IA | N | — | Y | M08 Q5, F3 |
| `posh.ic.invalid.hr` | HLP | `posh.ic.invalid` | HR + IC presiding officer | IA E | Y | Vars: workplace / entity name | N | M08 YX-POSH-01 |
| `posh.ic.tenure_expiring.hr` | HLP | `posh.ic.tenure_expiring` (SCH-56) | HR + IC presiding officer | IA E | Y | Vars: member count, tenure end date | Y | M08 YX-POSH-01, F3 |
| `policy.published.employee` | DOC | `policy.version.published` | Policy audience | IA P E (W key policies) | Y when acknowledgement required | Vars: policy title, acknowledge-by date | N | M08 Q6 |
| `policy.ack.reminder.employee` | DOC | `policy.ack.due` (SCH-52) | Audience members pending | IA P E W | Y | Vars: policy title, acknowledge-by date | Y | M08 YX-POL-02 |
| `policy.ack.overdue.manager` | DOC | `policy.ack.overdue` (SCH-52) | Manager | IA E | N | Vars: pending count | Y | M08 YX-POL-02 |

### 2.16 Engage (M09)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `engage.mention.user` | ENG | `engage.post.published` (@mention) | Mentioned user | IA P | N | — | Y | M09 §6 |
| `engage.comment.author` | ENG | `engage.comment.added` | Post author | IA | N | — | Y | M09 §6 |
| `engage.reactions.author` | ENG | `engage.reaction.added` | Post author | IA | N | — | Y ("12 people reacted") | P04 Q8 |
| `engage.post.held.author` | ENG | `engage.post.held` | Author | IA | N | — | N | M09 YX-ENG-03 |
| `engage.post.reported.moderator` | ENG | `engage.post.reported` | Moderators | IA E | N | Vars: count | Y | M09 YX-ENG-03 |
| `engage.kudos.received.employee` | ENG | `engage.kudos.given` | Receivers | IA P | N | Vars: giver name, company value | N | M09 §6 |
| `engage.reward.redemption.employee` | ENG | `engage.reward.redeemed` | Redeemer | IA P E | N | Vars: item name, status | N | M09 Q4 |
| `engage.points.expiring.employee` | ENG | `engage.points.expiring` (SCH-60) | Points holder | IA | N | — | Y | M09 Q4 |
| `engage.survey.invited.employee` | ENG | `engage.survey.opened` | Invitees | IA P E | N | Vars: survey name, close date | N | M09 §6 |
| `engage.survey.reminder.employee` | ENG | `engage.survey.reminder_due` (SCH-57) | Invitees who haven't answered (invitation status only) | IA P | N | Vars: close date | Y | M09 §4 |
| `engage.survey.onboarding.employee` | ENG | `engage.survey.lifecycle_due` (SCH-58, day 30 / 60 / 90) | New joiner | IA P E | N | Vars: survey name | N | M09 §6, F3 |
| `engage.survey.exit.employee` | ENG | `engage.survey.lifecycle_due` (SCH-58, exit) | Leaver | IA E | N | Vars: survey name | N | M01 §3.7, F3 |
| `engage.survey.results.manager` | ENG | `engage.survey.closed` | Survey owner + managers whose group meets the minimum | IA E | N | Link | N | M09 Q8 |
| `engage.action_plan.due.manager` | ENG | `engage.action_plan.due` (SCH-59) | Manager | IA E | N | Vars: survey name, due date | Y | M09 Q8 |
| `celebration.birthday.team` | ENG | `engage.celebration.due` (SCH-31, birthday) | Team / space members | IA | N | — | Y | P04 §1, M09 Q5 |
| `celebration.birthday.employee` | ENG | `engage.celebration.due` (SCH-31, birthday) | The person | IA P | N | — | N | M09 Q5 |
| `celebration.anniversary.team` | ENG | `engage.celebration.due` (SCH-31, anniversary) | Team / space members | IA | N | — | Y | M09 Q5 |
| `celebration.new_joiner.team` | ENG | `employee.joined` | Team / location space | IA | N | — | Y | M09 Q5 |
| `celebration.promotion.team` | ENG | `document.issued` (promotion letter) | Team | IA | N | — | Y | M09 Q5, APX-B §3 |

### 2.17 Hiring & staffing desk (M10)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `ats.application.received.candidate` | HIR | `ats.application.submitted` | Candidate | E W/S | N | Vars: job title, company name | N | M10 §2 |
| `ats.application.new.recruiter` | HIR | `ats.application.submitted` | Recruiters on the job | IA E | N | Vars: count | Y | M10 §6 |
| `ats.stage.changed.candidate` | HIR | `ats.application.stage_changed` (stage template on) | Candidate | E W/S | N | Vars: job title, stage label, portal link | N | P04 §2 |
| `ats.application.regret.candidate` | HIR | `ats.application.stage_changed` (rejected) | Candidate | E | N | Vars: job title | N | M10 §6 |
| `ats.referral.status.referrer` | HIR | `ats.application.stage_changed` (referred candidate) | Referrer | IA | N | — | Y | M10 §2 |
| `ats.referral.eligible.referrer` | HIR | `ats.referral.eligible` (SCH-63) | Referrer | IA P E | N | Vars: candidate name | N | M10 YX-ATS-12 |
| `ats.interview.scheduled.candidate` | HIR | `ats.interview.scheduled` | Candidate | E W/S | N | Vars: job title, date, time + zone, join link | N | M10 §2 |
| `ats.interview.scheduled.panel` | HIR | `ats.interview.scheduled` | Panel | IA E (+ calendar invite) | N | Vars: candidate name, job title, time | N | M10 §2 |
| `ats.interview.reminder.candidate` | HIR | `ats.interview.upcoming` (SCH-61) | Candidate | E W/S | N | Vars: job title, time + zone, join link | N | M10 §2 |
| `ats.interview.reminder.panel` | HIR | `ats.interview.upcoming` (SCH-61) | Panel | IA P E | N | Vars: candidate name, time | N | M10 §2 |
| `ats.scorecard.due.panel` | HIR | `ats.scorecard.due` (SCH-61) | Panelist | IA P E | N | Vars: candidate name, job title | Y | M10 YX-ATS-04 |
| `ats.self_booking.invite.candidate` | HIR | `ats.interview.booking_opened` | Candidate | E W/S | N | Vars: job title, booking link | N | M10 §2 |
| `ats.ai_interview.invite.candidate` | HIR | `ats.ai_interview.invited` | Candidate (not under 18) | E W/S | N | Vars: job title, deadline, link (with AI-use notice) | N | M10 Q4 |
| `ats.ai_interview.review.recruiter` | HIR | `ats.ai_interview.completed` | Recruiter | IA E | N | Vars: count | Y | M10 YX-ATS-05 |
| `ats.requisition.filled.hiring_manager` | HIR | `ats.requisition.filled` | Hiring manager | IA E | N | Vars: job title | N | M10 YX-ATS-13 |
| `ats.requisition.reopened.recruiter` | HIR | `ats.requisition.reopened` | Recruiters + hiring manager | IA E | N | Vars: job title, reason label | N | M10 YX-ATS-14 |
| `ats.requisition.reassigned.owner` | HIR | `employment.exited` (leaver owned requisitions) | New owner | IA E | N | Vars: requisition count | N | M01 D6 |
| `ats.offer.released.candidate` | HIR | `ats.offer.released` | Candidate | E W/S | N | Vars: job title, respond-by date, portal link (never CTC) | N | M10 Q3 |
| `ats.offer.revised.candidate` | HIR | `ats.offer.released` (version > 1) | Candidate | E W/S | N | Vars: job title, respond-by date | N | M10 YX-ATS-17 |
| `ats.offer.expiring.candidate` | HIR | `ats.offer.expiring` (SCH-62) | Candidate | E W/S | N | Vars: job title, expiry date | N | M10 Q3, F3 |
| `ats.offer.expiring.recruiter` | HIR | `ats.offer.expiring` (SCH-62) | Recruiter | IA E | N | Vars: candidate name, expiry date | Y | M10 Q3, F3 |
| `ats.offer.accepted.recruiter` | HIR | `ats.offer.accepted` | Recruiter, hiring manager, HR onboarding | IA P E | N | Vars: candidate name, joining date | N | M10 YX-ATS-07 |
| `ats.ready_to_onboard.hr` | HIR | `ats.offer.accepted` (manual hand-off mode) | HR | IA E | N | Vars: count | Y | M10 Q2 |
| `ats.offer.declined.recruiter` | HIR | `ats.offer.declined` / `ats.offer.expired` | Recruiter + hiring manager | IA E | N | Vars: candidate name, reason label | N | M10 §3 |
| `ats.offer.withdrawn.candidate` | HIR | `ats.offer.withdrawn` | Candidate | E | N | Link (letter in portal) | N | M10 YX-ATS-14 |
| `ats.bgv.consent.candidate` | HIR | `ats.bgv.requested` | Candidate | E W/S | N | Vars: consent link | N | M10 YX-ATS-08 |
| `ats.bgv.completed.hr` | HIR | `ats.bgv.completed` | HR + recruiters in scope | IA E | N | Link (report is Special) | N | M10 Q5 |
| `ats.guardian_consent.guardian` | HIR | `ats.guardian_consent.requested` | Guardian of an under-18 candidate | E S | N | Vars: candidate first name, consent link | N | M10 YX-ATS-19, T05 YX-EVAL-13 |
| `ats.consent_renewal.candidate` | HIR | `ats.candidate.retention_expiring` (SCH-64) | Non-hired candidate | E | N | Vars: company name, renew link | N | M10 Q6 |
| `ats.client.portal_invite.client_contact` | HIR | `ats.client_contact.invited` | Client contact | E | N | Vars: sign-in link | N | M10 Q8 |
| `ats.client.submission.client_contact` | HIR | `ats.submission.sent` | Client contact | E IA | N | Vars: job title, candidate count, portal link | N | M10 Q8 |
| `ats.client.feedback.recruiter` | HIR | `ats.submission.feedback` | Recruiter | IA E | N | Vars: job title, candidate name | Y | M10 Q8 |
| `ats.placement.started.contractor` | HIR | `ats.placement.started` | Contractor | IA P E | N | Vars: client name, start date | N | M10 §6 |
| `ats.placement.ending.account_team` | HIR | `ats.placement.ending` (SCH-65) | Account team | IA E | N | Vars: contractor name, end date | Y | M10 YX-ATS-15 |
| `ats.placement.ended.contractor` | HIR | `ats.placement.ended` | Contractor + account team | IA E | N | Vars: client name, end date | N | M10 YX-ATS-15 |
| `ats.bench.limit.hr` | HIR | `ats.bench.limit_reached` (SCH-65) | HR + account team | IA E | N | Vars: contractor name, bench days | N | M10 YX-ATS-15 |
| `ats.invoice.issued.client_billing` | HIR | `ats.invoice.issued` | Client billing contacts | E | N | Vars: invoice no., amount, due date; PDF attached (a B2B document for that client) | N | M10 Q7 |
| `ats.invoice.dunning.client_billing` | HIR | `ats.invoice.overdue` (SCH-66) | Client billing contacts | E | N | Vars: invoice no., amount, days overdue | N | M10 YX-ATS-16 |
| `ats.tds.unmatched.finance` | HIR | `ats.tds.unmatched` | Finance | IA E | N | Vars: count | Y | M10 YX-ATS-16 |
| `ats.crm.reply.recruiter` | HIR | `ats.crm.reply.received` | Sequence owner (recruiter) | IA E | N | Vars: candidate name, sequence name | Y | M10 YX-ATS-20 |
| `ats.posting.failed.recruiter` | HIR | `ats.posting.failed` | Recruiters on the job | IA E | N | Vars: job title, board name | N | M10 YX-ATS-23 |
| `ats.interview.reslot.recruiter` | HIR | `ats.interview.reslot_needed` | Recruiter | IA P E | N | Vars: candidate name, round | N | M10 YX-ATS-24 |
| `ats.vendor.portal_invite.vendor_contact` | HIR | `ats.vendor_contact.invited` | Vendor contact | E | N | Vars: sign-in link | N | M10 YX-ATS-25 |
| `ats.job_share.new.vendor_contact` | HIR | `ats.job_share.opened` | Contacts of the named vendors | E IA | N | Vars: job title (client masked if set), expiry date, portal link (never bill rate) | N | M10 YX-ATS-26 |
| `ats.job_share.closed.vendor_contact` | HIR | `ats.job_share.closed` | Contacts of vendors on the share | E IA | N | Vars: job title, reason label | Y | M10 YX-ATS-26 |
| `ats.vendor.submission.new.recruiter` | HIR | `ats.vendor.submission.received` | Recruiters on the job | IA E | N | Vars: vendor name, count | Y | M10 YX-ATS-27 |
| `ats.vendor.submission.duplicate.vendor_contact` | HIR | `ats.vendor.submission.duplicate` | Submitting vendor's contact | IA E | N | Vars: job title ("duplicate — not accepted"; never who holds the candidate) | N | M10 YX-ATS-27 |
| `ats.vendor_invoice.proposed.vendor_contact` | HIR | `ats.vendor_invoice.proposed` | Vendor contact | E IA | N | Vars: period, portal link (amount in the portal) | N | M10 YX-ATS-29 |
| `ats.vendor_invoice.approved.vendor_contact` | HIR | `ats.vendor_invoice.approved` | Vendor contact | E IA | N | Vars: invoice no., payment route (pay-when-paid noted) | N | M10 YX-ATS-29 |

### 2.18 Question bank & test builder (T01, T02)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `question.leak.alert.owner` | ASM | `question.leak.detected` | Question and test owners | IA E | N | — | N | T05 Q3 |
| `test.items.flagged.owner` | ASM | `test.items.flagged` | Item and test owners | IA E | N | — | Y | T02 §6, Q7 |
| `test.newer_version.owner` | ASM | `question.version.created` (used by a published test) | Test owners | IA | N | — | Y | T01 YX-QB-02 |
| `test.regrade.available.owner` | ASM | `question.answer_key.changed` (version already served) | Test owner | IA E | N | — | N | T01 YX-QB-03 |

Question review and test publish approvals use the generic `approval.*` rows (P03).

### 2.19 Test delivery (T03; T07 take-home)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `test.invitation.candidate` | ASM | `test.invitation.created` (candidate) | Candidate | E W/S | N | Vars: test name, window or booking link, time + zone | N | T03 §6 |
| `test.invitation.employee` | ASM | `test.invitation.created` (employee) | Employee | IA P E | N | Vars: test name, due date | N | T03 YX-DLV-13 |
| `test.slot.booked.candidate` | ASM | `slot.booked` | Candidate | E W/S | N | Vars: date, time + zone | N | T03 Q1 |
| `test.slot.rescheduled.candidate` | ASM | `slot.rescheduled` | Candidate | E W/S | N | Vars: new date, time + zone | N | T03 Q1 |
| `test.reminder.candidate` | ASM | `test.start.upcoming` (SCH-67) | Candidate (employee: IA P) | E W/S | N | Vars: test name, time + zone, link | N | T03 Q1, YX-DLV-01 |
| `test.window.closing.candidate` | ASM | `test.window.closing` (SCH-67) | Candidates who haven't started | E W/S | N | Vars: test name, closing time + zone | N | T03 YX-DLV-02 |
| `test.missed.candidate` | ASM | `slot.no_show` / `test.invitation.expired` | Candidate | E W/S | N | Vars: test name, next-steps link | N | T03 YX-DLV-02 |
| `test.missed.recruiter` | ASM | `slot.no_show` / `test.invitation.expired` | Recruiter / test owner (L&D for employees) | IA E | N | Vars: count | Y | T03 YX-DLV-02 |
| `test.accommodation.requested.reviewer` | ASM | `accommodation.requested` | Accommodation reviewer | IA E | N | — | Y | T03 Q8 |
| `test.accommodation.decided.candidate` | ASM | `accommodation.decided` | Candidate / employee | E IA | N | Link (what was approved, in the portal) | N | T03 §6 |
| `test.time_credit.approval.admin` | ASM | `attempt.time_credit.requested` | Test admin | IA P | N | — | U | T03 Q4 |
| `drive.capacity_plan.missing.owner` | ASM | `drive.capacity_plan.missing` (SCH-69) | Drive owner | IA E | N | Vars: drive name, date | N | T03 YX-DLV-12 |
| `test.admit_card.candidate` | ASM | `admit_card.issued` | Candidate / campus registrant | E W/S | N | Vars: test or drive name, date, portal link (card and QR in the portal only) | N | T03 YX-DLV-16 |
| `takehome.deadline.candidate` | ASM | `takehome.deadline.approaching` (SCH-79) | Candidate | E W/S | N | Vars: task name, deadline time + zone | N | T07 YX-CODE-05 |
| `takehome.closed.recruiter` | ASM | `takehome.closed` | Recruiter / test owner | IA E | N | Vars: candidate name, late flag | Y | T07 YX-CODE-05 |

### 2.20 Proctoring (T04; T08 secure client)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `proctor.shift.assigned.proctor` | ASM | `proctor.shift.assigned` | Proctor (tenant staff or YukthiX pool) | IA P E | N | Vars: date, time + zone, test name | N | T04 Q8 |
| `proctor.shift.reminder.proctor` | ASM | `proctor.shift.upcoming` (SCH-70) | Proctor | IA P E | N | Vars: time + zone | N | T04 §6 |
| `proctor.slot.understaffed.owner` | ASM | `proctor.slot.understaffed` (SCH-70) | Proctor planner / test owner (+ YukthiX ops for the YukthiX pool) | IA E | N | Vars: slot time, gap | N | T04 YX-PROC-08 |
| `attempt.terminated.recruiter` | ASM | `attempt.terminated` | Recruiter / test owner | IA | N | — | Y | T04 YX-PROC-02 |
| `secure_client.integrity_failed.test_admin` | ASM | `secure_client.integrity.failed` | Test admin / live proctor of the slot | IA | N | — | Y | T08 YX-SCL-01 |
| `secure_client.min_version.raised.test_admin` | ASM | `secure_client.release.published` (minimum version raised) | Owners of scheduled tests that require or allow the client | IA E | N | Vars: platform, minimum version, effective date | N | T08 YX-SCL-07 |
| `secure_client.update_required.candidate` | ASM | `secure_client.release.published` (minimum version raised) | Candidates with an upcoming slot that requires the client | E | N | Vars: test name, download link | N | T08 YX-SCL-01 |

### 2.21 Integrity, evaluation & outcomes (T05; T06 reports)

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `incident.assigned.reviewer` | ASM | `incident.opened` | Assigned reviewer | IA E | N | — | Y | T05 Q1 |
| `incident.review_due.reviewer` | ASM | `incident.review.due` (SCH-71) | Reviewer | IA P E | N | — | Y | T05 Q1 |
| `incident.second_review.reviewer` | ASM | `incident.second_review.requested` | Second reviewer / test owner | IA E | N | — | N | T05 YX-EVAL-01 |
| `result.released.candidate` | ASM | `result.released` (candidate) | Candidate | E W/S | N | Vars: test name, portal link | N | T05 Q5 |
| `result.released.employee` | ASM | `result.released` (employee) | Employee | IA P | N | Link | N | T03 YX-DLV-13 |
| `result.held.candidate` | ASM | `result.held` | Candidate | E | N | Vars: test name ("result under review") | N | T05 YX-EVAL-03 |
| `appeal.received.candidate` | ASM | `appeal.submitted` | Candidate | E | N | Vars: decide-by date | N | T05 Q2 |
| `appeal.submitted.reviewer` | ASM | `appeal.submitted` | Appeal reviewer (not the original one) | IA E | N | — | N | T05 YX-EVAL-04 |
| `appeal.due.reviewer` | ASM | `appeal.decision.due` (SCH-72) | Appeal reviewer | IA P E | N | — | Y | T05 Q2 |
| `appeal.decided.candidate` | ASM | `appeal.decided` | Candidate | E W/S | N | Link (decision and reason in portal) | N | T05 YX-EVAL-04 |
| `evaluation.assigned.evaluator` | ASM | `evaluation.assigned` | Evaluator | IA E | N | Vars: response count | Y | T05 Q4 |
| `evaluation.moderation.moderator` | ASM | `evaluation.moderation_required` | Moderator / third evaluator | IA E | N | Vars: response count | Y | T05 YX-EVAL-05 |
| `consent.withdrawn.recruiter` | ASM | `consent.withdrawn` | Recruiter / test owner | IA | N | — | Y | T05 YX-EVAL-10 |
| `privacy.retention_expiring.candidate` | ASM | `retention.deletion.upcoming` (candidate data class shown at consent) | Candidate | E | N | Vars: deletion date | N | T05 Q7 / Q8 |
| `session_report.ready.recruiter` | ASM | `session_report.ready` | Recruiter / test owner (hiring manager or institution user in scope) | IA E | N | Link (expiring, watermarked per viewer) | Y | T05 B5 |
| `assess.fairness.finding.owner` | ASM | `assess.fairness.finding.raised` | Test / question / instrument owner + the reviewer assigned to the finding | IA E | N | Link (no group data outside the app) | N | T05 YX-EVAL-25…27, T06 YX-PSY-08 |
| `assess.fairness.finding.decided.owner` | ASM | `assess.fairness.finding.decided` | Test owner + test admins | IA | N | — | Y | T05 YX-EVAL-27 |
| `psych.report.ready.recruiter` | ASM | `psych.report.released` (recruiter report) | Recruiter / hiring manager in scope | IA E | N | Link | Y | T06 §3 |
| `psych.report.released.candidate` | ASM | `psych.report.released` (candidate feedback report; company setting on) | Candidate | E W/S | N | Vars: test name, portal link | N | T06 YX-PSY-07, Q5 |
| `psych.report.released.employee` | ASM | `psych.report.released` (development report) | Employee | IA P E | N | Link | N | T06 Q5 / Q6 |
| `psych.decision_use.notice.employee` | ASM | `psych.decision_use.enabled` | Employees who took the assessment | IA E | Y | Link (notice text in app) | N | T06 YX-PSY-11 |

### 2.22 OTP & transactional authentication (YX-NTF-13)

OTP types bypass quiet hours, digests and grouping, are never user-configurable and carry only the code, its purpose and expiry.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `otp.login.user` | SEC | `auth.otp.requested` (mobile sign-in) | User | S or W (authentication template) | Y | Code | U | M04 Q2 |
| `otp.external_login.user` | SEC | `auth.otp.requested` (external / limited login) | Pre-boarder, alumnus, nominee, trainer, IC external member, audit chair, client contact, external case party, staffing vendor contact, contractor (vendor) contact, college coordinator | E or S | Y | Code | U | P02 §4.7 |
| `otp.esign.signer` | SEC | `auth.otp.requested` (e-sign / click-to-accept) | Signer (employee, candidate) | S or W (authentication) or E | Y | Code | U | P05 §4.4 |
| `otp.policy_ack.employee` | SEC | `auth.otp.requested` (critical policy) | Employee | S or W (authentication) | Y | Code | U | M08 Q6 |
| `otp.test_resume.candidate` | SEC | `auth.otp.requested` (Open-mode re-authentication) | Candidate | S or E | Y | Code | U | T03 Q4 |
| `otp.assistant_confirm.employee` | SEC | `auth.otp.requested` (WhatsApp assistant confirmation, wave 5) | Employee | W (authentication) | Y | Code | U | M04 Q6 |
| `otp.step_up.user` | SEC | `auth.otp.requested` (step-up for sensitive actions) | Admin / payroll user | S or W (authentication) | Y | Code | U | GAP A1 → P12 (proposed) |

### 2.23 Projects (M12)

Timesheet types are in §2.10 (`timesheet.*`); project invoices use the M10 invoice rows (`ats.invoice.issued.client_billing`, `source = project`).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `project.status.changed.members` | WRK | `project.status.changed` (on hold / closed) | Allocated members | IA | N | — | Y | M12 YX-PRJ-01 |
| `project.budget.threshold.pm` | WRK | `project.budget.threshold` | PM + account manager | IA E | N | Vars: project code, measure, % reached (never cost amounts) | N | M12 YX-PRJ-07 |
| `project.milestone.acceptance.client_contact` | WRK | `project.milestone.completed` (client acceptance required) | Client contact (portal) | E IA | N | Vars: project name, milestone name, portal link | N | M12 YX-PRJ-10 |
| `project.milestone.billable.account_manager` | WRK | `project.milestone.completed` (no acceptance needed) / `project.milestone.accepted` | Account manager | IA E | N | Vars: project name, milestone name | Y | M12 YX-PRJ-10 |
| `project.billing.due.account_manager` | WRK | `project.billing.due` (SCH-76) | Account manager | IA E | N | Vars: count of projects with WIP | Y | M12 §6 |
| `project.hours.mismatch.pm` | WRK | `project.hours.mismatch` | PM | IA | N | — | Y | M12 YX-PRJ-13 |

### 2.24 Contract labour (M13)

Contractor contacts use the Contractor (vendor) external login (P02 §4.7) and follow the §5 consent rule for W / S. CLRA return and register due dates reach the compliance owner through `compliance.due.upcoming.owner` (SCH-07).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `clra.portal_invite.contractor_contact` | WRK | `clra.contractor_contact.invited` | Contractor's representative | E | N | Vars: sign-in link, notice link (APX-G G-09 / G-32) | N | M13 YX-CLRA-11 |
| `clra.worker.deployed.contractor_contact` | WRK | `clra.worker.deployed` | Contractor contact + site admin | IA E | N | Vars: worker count, location name | Y | M13 §6 |
| `clra.licence.expiring.owner` | WRK | `clra.licence.expiring` (SCH-77) | Compliance owner + site HR | IA E | Y | Vars: contractor name, licence no., expiry date | N | M13 YX-CLRA-02 |
| `clra.licence.expiring.contractor_contact` | WRK | `clra.licence.expiring` (SCH-77) | Contractor contact | E IA | N | Vars: licence no., location name, expiry date | N | M13 YX-CLRA-02 |
| `clra.registration.expiring.owner` | WRK | `clra.registration.expiring` (SCH-77) | Compliance owner + site HR | IA E | Y | Vars: location name, RC no., expiry date | N | M13 YX-CLRA-02 |
| `clra.pack.opened.contractor_contact` | WRK | `clra.pack.opened` | Contractor contact | E IA | N | Vars: wage month, location name, due date | N | M13 YX-CLRA-05 |
| `clra.pack.due.contractor_contact` | WRK | `clra.pack.due` (SCH-78) | Contractor contact | E IA W/S | N | Vars: wage month, due date, pending proof count | N | M13 YX-CLRA-05 |
| `clra.pack.overdue.owner` | WRK | `clra.pack.overdue` (SCH-78) | Compliance owner + site HR (+ contractor contact) | IA E | Y | Vars: contractor name, wage month, days overdue | N | M13 YX-CLRA-05 / 07 |
| `clra.proof.submitted.verifier` | WRK | `clra.proof.submitted` | `clra.proof.verify` holders (never the uploader) | IA E | N | Vars: count | Y | M13 YX-CLRA-06 |
| `clra.proof.discrepancy.contractor_contact` | WRK | `clra.proof.discrepancy` | Contractor contact | E IA | N | Vars: wage month, proof type, check label | N | M13 YX-CLRA-06 |
| `clra.pack.verified.contractor_contact` | WRK | `clra.pack.verified` | Contractor contact | IA E | N | Vars: wage month | Y | M13 YX-CLRA-06 |
| `clra.alert.raised.owner` | WRK | `clra.alert.raised` | Compliance owner + site HR | IA P E | Y | Vars: alert type label, contractor name, location (never the liability estimate) | U (underage worker, unpaid wages) / N | M13 YX-CLRA-07 |
| `clra.payment.held.contractor_contact` | WRK | `clra.payment.held` | Contractor contact + finance | IA E | N | Vars: bill no., reason label | N | M13 YX-CLRA-08 |

### 2.25 Partners & accountant console (P16)

**Client admins** = all System Admins of the client tenant plus the named client contact (P16 YX-PTR-02). Partner users receive these in the partner-portal inbox and by email. No row uses W / S, so the template pack (§4) is unchanged. Vars never include client employee data (YX-PTR-07).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `partner.application.received.partner_team` | BIL | `partner.applied` | YukthiX partner team (platform console) | IA E | N | Vars: firm name, partner types | Y | P16 §6 flow 1 |
| `partner.verified.partner_admin` | BIL | `partner.verified` | Partner admin | E IA | Y | Vars: firm name, next-steps link | N | P16 YX-PTR-01 |
| `partner.suspended.partner_admin` | BIL | `partner.suspended` | All partner admins | E IA | Y | Vars: reason label | U | P16 YX-PTR-01 |
| `partner.suspended.client_admins` | SEC | `partner.suspended` | Client admins of every linked tenant | IA E | Y | Vars: partner firm name ("its access has stopped") | U | P16 YX-PTR-01 |
| `partner.link.requested.client_admins` | SEC | `partner.link.requested` (initiated by the partner) | Client admins | IA E | Y | Vars: partner firm name, relationship type, review link | N | P16 §6 flow 2, YX-PTR-02 |
| `partner.link.requested.partner_admin` | SEC | `partner.link.requested` (initiated by the client) | Partner admin | E IA | Y | Vars: client company name, relationship type | N | P16 §6 flow 2 |
| `partner.link.approved.partner_admin` | SEC | `partner.link.approved` | Partner admin | E IA | Y | Vars: client company name; Link (grant details in the portal) | N | P16 YX-PTR-02 |
| `partner.link.ended.partner_admin` | SEC | `partner.link.ended` | Partner admin + partner users assigned to that client | IA E | Y | Vars: client company name, end date | N | P16 YX-PTR-02 / 12 |
| `partner.link.ended.client_admins` | SEC | `partner.link.ended` (ended by the partner) | Client admins | IA E | Y | Vars: partner firm name, end date, open task count | N | P16 §6 flow 6 |
| `partner.grant.changed.client_admins` | SEC | `partner.grant.changed` | Client admins except the one who changed it | IA E | Y | Vars: partner firm name, changed-by name; Link (scope diff in-app) | N | P16 YX-PTR-02 / 05 |
| `partner.grant.changed.partner_admin` | SEC | `partner.grant.changed` | Partner admin + partner users assigned to that client | IA E | Y | Vars: client company name; Link | N | P16 YX-PTR-03 |
| `tenant.ownership_transfer.requested.client_admins` | SEC | `tenant.ownership_transfer.requested` | Client admins + named client contact | E IA | Y | Vars: partner firm name, direction, notice end date | U | P16 YX-PTR-13 |
| `tenant.ownership_transfer.requested.partner_admin` | SEC | `tenant.ownership_transfer.requested` | Partner admin | E IA | Y | Vars: client company name, direction, notice end date | U | P16 YX-PTR-13 |
| `tenant.ownership_transfer.completed.client_admins` | SEC | `tenant.ownership_transfer.completed` | Client admins + named client contact | E IA | Y | Vars: new owner, completion date | N | P16 YX-PTR-13 |
| `tenant.ownership_transfer.completed.partner_admin` | SEC | `tenant.ownership_transfer.completed` | Partner admin | E IA | Y | Vars: client company name, completion date | N | P16 YX-PTR-13 |
| `partner.commission.accrued.partner_admin` | BIL | `partner.commission.accrued` | Partner admin (master partner admin gets roll-up totals only, YX-PTR-10) | IA E | N | Vars: month, client count, total | Y | P16 YX-PTR-11 |
| `partner.commission.paid.partner_admin` | BIL | `partner.commission.paid` | Partner admin | E IA | N | Vars: amount, payout ref | N | P16 YX-PTR-11 |
| `partner.invoice.issued.partner_billing` | BIL | `partner.invoice.issued` | Partner billing contact | E IA | Y | Vars: invoice no., amount, due date, client count | N | P16 YX-PTR-11 |

### 2.26 Policy rules & automations (P19)

**Policy owner** = the owner of the rule's module policy point (P19 Q4). No row uses W / S, so the template pack (§4) is unchanged. Vars never include per-person results or money impact; those stay in the app (YX-RULE-10).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `rule.version.review_requested.approver` | APR | `rule.version.submitted` (high-risk: pay, leave balances, access or visibility) | Second approver (P03 task; never the author) | IA P E | N | Vars: rule name, module, author name, affected count; Link (preview in app) | Y | P19 YX-RULE-06 |
| `rule.activated.author` | SYS | `rule.activated` | Author + policy owner | IA E | N | Vars: rule name, module, effective date, affected count | Y | P19 §6 flow 1, YX-RULE-07 |
| `automation.run.failed.admin` | SYS | `automation.run.failed` | System Admin + automation owner | IA E | N | Vars: automation name, failed action, error class; Link (failure queue) | Y | P19 YX-RULE-11 |
| `automation.loop_blocked.admin` | SYS | `automation.loop_blocked` | System Admin + automation owner | IA E | N | Vars: automation name, record type | Y | P19 YX-RULE-11 |
| `automation.limit_reached.admin` | BIL | `automation.limit_reached` (80 % and 100 %) | System Admin | IA E | N | Vars: limit kind, used, limit, threshold | N | P19 Q6, D18 |
| `rule.legal_floor.digest.policy_owner` | PAY | `rule.legal_floor_applied` (daily summary) | Policy owner + compliance owner of the entity | IA E | N | Vars: rule name, entity, adjusted-person count, floor / cap kind | Y | P19 YX-RULE-03, Q3 |

### 2.27 Workplace accidents (M08, M02, M03)

**Case team** = the accident case team (location safety officer + HR, M08 YX-CASE-14). Medical details are **Special**: every row is in-app, or an email or push with a Link or the listed dates only; no row uses W / S, so the template pack (§4) is unchanged. Vars never include injury type, body part, diagnosis, disablement or amounts.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `case.accident.reported.owner` | HLP | `accident.reported` | Case team (location safety officer + HR) | IA P E | Y | Link | U | M08 YX-CASE-14 |
| `accident.report.due.owner` | HLP | `accident.report.due` (SCH-86) | Case team | IA E | Y | Vars: report kind (ESIC report / statutory notice), due date; Link | N | M08 YX-CASE-15 |
| `accident.report.overdue.escalation` | HLP | `accident.report.overdue` (SCH-86) | Case team + HR head + entity compliance owner | IA E | Y | Vars: report kind, due date; Link | U | M08 YX-CASE-15 |
| `accident.contractor_report.missing.principal` | WRK | `accident.report.overdue` (contract worker; contractor has not filed) | Principal employer's HR + CLRA compliance owner | IA E | Y | Vars: contractor name, report kind, due date; Link | U | M08 YX-CASE-15, M13 |
| `accident.injury_leave.posted.employee` | TIM | `accident.injury_leave.posted` | Injured employee | IA E | N | Link | N | M02 YX-LV-15 |
| `accident.injury_leave.posted.manager` | TIM | `accident.injury_leave.posted` | Manager | IA E | N | Vars: employee name, leave from / to dates (dates only; no injury details) | N | M02 YX-LV-15, M08 YX-CASE-14 |
| `accident.ec.payment.due.payroll` | PAY | `accident.ec.payment.due` (SCH-87) | Payroll + case team | IA E | Y | Vars: case ref, due date; Link | N | M08 YX-CASE-16, M03 YX-PAY-50 |
| `accident.ec.payment.overdue.payroll` | PAY | `accident.ec.payment.overdue` (SCH-87) | Payroll + case team + HR head | IA E | Y | Vars: case ref, due date, days late; Link | U | M08 YX-CASE-16, M03 YX-PAY-50 |
| `accident.ec.letter.issued.claimant` | PAY | `accident.ec.claim.computed` (EC letter, APX-F #111) | Injured person, or dependants / nominees on a death claim | IA E | Y | Link (letter and calculation in the app) | N | M08 YX-CASE-16 |

### 2.28 Statutory corrections, revised certificates & migration arrears (M03, P15)

No row uses W / S. Vars carry statutes, periods and counts only; amounts, wages and penalty values stay in the app (P04 Q6).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `statutory.supplementary.required.payroll` | PAY | `statutory.filing.supplementary.created` | Payroll (+ statutory partner in partner mode) | IA E | Y | Vars: statute (PF / ESI), month, employee count | Y | M03 YX-PAY-51 |
| `statutory.excess_request.updated.payroll` | PAY | `statutory.excess_request.raised`, `statutory.excess_request.settled` | Payroll | IA E | N | Vars: statute, month, status | Y | M03 YX-PAY-51 |
| `payroll.statutory_refund.employee` | PAY | `statutory.excess_request.settled` (employee share over-deducted; refund line in the next run) | Employee | IA P E | N | Vars: statute, month; Link (amount on the payslip) | N | M03 YX-PAY-51 |
| `tax.certificate.revised.employee` | PAY | `tax.certificate.revised` (Form 130; Form 16 for old periods) | Employee or alumnus (alumni login) | IA E | Y | Link (content-free outside the app) | N | M03 YX-TAX-20 |
| `tax.certificate.revised.consultant` | PAY | `tax.certificate.revised` (Form 131; Form 16A for old periods) | Consultant | E IA | Y | Link (content-free outside the app) | N | M03 YX-TAX-20 |
| `payroll.arrears.base_confirmation.payroll` | PAY | `payroll.arrears.base_confirmation.required` | HR + Payroll | IA E | Y | Vars: revision name, month count; Link | N | M03 YX-PAY-52 |
| `migration.as_paid.gap.admin` | SYS | `migration.as_paid_lines.imported` (months without lines) | Implementation admin + Payroll | IA E | N | Vars: import batch, missing month count, employee count | N | P15 YX-MIG-15 |

### 2.29 Identity chain & deepfake signals (T04, T05, M10)

Identity and synthetic-media signals are **Special** (biometric templates, consent per T05 YX-EVAL-09). Every row is in-app or an email with a Link only; never WhatsApp or SMS body text, so the template pack (§4) is unchanged. A signal is never a decision: reviewers decide through T05 incidents and appeals (YX-EVAL-30).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `identity.mismatch_flagged.reviewer` | ASM | `identity.mismatch_flagged` | Integrity reviewers (T05 queue) | IA E | N | Link | N | T04 YX-PROC-19, T05 YX-EVAL-30 |
| `identity.reverify_requested.candidate` | ASM | `identity.reverify_requested` | Candidate | E IA | Y | Link (re-verification page; no reason text) | N | T04 YX-PROC-19, M10 YX-ATS-32 |
| `identity.reverified.recruiter` | HIR | `identity.check_completed` (re-verification passed) | Recruiter on the application | IA E | N | Link | Y | M10 YX-ATS-32 |
| `deepfake.signal_flagged.reviewer` | ASM | `deepfake.check_completed` (signal raised) | Integrity reviewers (T05 queue) | IA E | N | Link | N | T04 YX-PROC-20, T05 YX-EVAL-30 |

### 2.30 Person record (P01, M01)

Matching evidence (PAN, UAN, phone, email) is never in a notification; the match queue shows it in the app to HR only (P01 YX-ORG-27).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `person.link.proposed.hr` | PPL | `person.link.proposed` | HR person-match queue | IA E | N | Vars: count | Y | P01 YX-ORG-27 |
| `application.ex_employee.flagged.recruiter` | HIR | `application.ex_employee.flagged` | Recruiter on the job (+ HR when rehire rules apply) | IA E | N | Link (rehire / alumni flags in the app) | N | M01 YX-LC-29 |

### 2.31 Trial, platform status & export billing (P20, P14)

**Admins** = System Admins of the tenant and, for trial rows, the admin who signed up. Incident and maintenance rows use the approved stage templates (P20 YX-GRO-08) and go to the admins of affected tenants and products (YX-GRO-09); status-page subscribers are external email addresses. Vars never include tenant HR data (YX-GRO-10). No row uses W / S, so the template pack (§4) is unchanged.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `trial.welcome.admin` | BIL | `trial.nudge.due` (day 0, SCH-80) | Admins | E IA | N | Vars: product, quick-start link | N | P20 YX-GRO-03 |
| `trial.nudge.day1.admin` | BIL | `trial.nudge.due` (day 1, SCH-80) | Admins | IA E | N | Vars: product, next setup step; Link | N | P20 YX-GRO-03 |
| `trial.nudge.day3.admin` | BIL | `trial.nudge.due` (day 3, SCH-80) | Admins | IA E | N | Vars: product, next setup step; Link | N | P20 YX-GRO-03 |
| `trial.nudge.day7.admin` | BIL | `trial.nudge.due` (day 7, SCH-80) | Admins | IA E | N | Vars: product, next setup step; Link | N | P20 YX-GRO-03 |
| `trial.nudge.day14.admin` | BIL | `trial.nudge.due` (day 14, SCH-80) | Admins | IA E | N | Vars: product, next setup step; Link | N | P20 YX-GRO-03 |
| `trial.first_value.admin` | BIL | `trial.first_value_reached` | Admins | IA E | N | Vars: product, milestone label | N | P20 YX-GRO-02 |
| `trial.extended.admin` | BIL | `trial.extended` | Admins | E IA | Y | Vars: product, new trial end date, reason (automatic / on request) | N | P20 YX-GRO-06, P14 YX-TEN-08 |
| `trial.switched_on.admin` | BIL | `product.switched_on` | Admins + billing contact | E IA | Y | Vars: product, plan, start date | N | P20 YX-GRO-04 |
| `trial.talk_to_us.cs_owner` | BIL | `trial.talk_to_us.raised` | YukthiX CS owner (platform console) | IA E | N | Vars: company name, product, size band | N | P20 YX-GRO-05 |
| `trial.readonly.started.admin` | BIL | `trial.readonly.started` | Admins | E IA | Y | Vars: product, deletion date, export link | N | P14 YX-TEN-08 |
| `trial.readonly.reminder.admin` | BIL | `trial.readonly.reminder_due` (read-only day 15 and 25, SCH-82) | Admins | E IA | Y | Vars: product, deletion date | N | P14 YX-TEN-08 |
| `trial.deleted.certificate.admin` | BIL | `trial.deleted` | Admins at deletion + billing contact | E | Y | Vars: product, deletion date; Link (deletion certificate) | N | P14 YX-TEN-08 |
| `platform.incident.investigating.admins` | SYS | `platform.incident.opened` | Admins of affected tenants | IA E | Y | Vars: product, region, stage, time + zone, status-page link | U | P20 YX-GRO-08 / 09 |
| `platform.incident.identified.admins` | SYS | `platform.incident.stage_changed` (identified) | Admins of affected tenants | IA E | Y | Vars: product, region, stage, time + zone, status-page link | U | P20 YX-GRO-08 / 09 |
| `platform.incident.monitoring.admins` | SYS | `platform.incident.stage_changed` (monitoring) | Admins of affected tenants | IA E | Y | Vars: product, region, stage, time + zone, status-page link | N | P20 YX-GRO-08 / 09 |
| `platform.incident.resolved.admins` | SYS | `platform.incident.resolved` | Admins of affected tenants | IA E | Y | Vars: product, region, stage, time + zone, status-page link | N | P20 YX-GRO-08 / 09 |
| `platform.incident.post_incident.admins` | SYS | `platform.incident.stage_changed` (post-incident review published) | Admins of affected tenants | IA E | Y | Vars: product, incident ref; Link | N | P20 YX-GRO-08 / 09 |
| `platform.maintenance.scheduled.admins` | SYS | `platform.maintenance.scheduled` (≥ 72 h notice) | Admins of affected tenants | IA E | Y | Vars: product, region, window start / end + zone, impact label | N | P20 YX-GRO-08 / 09 |
| `platform.maintenance.reminder.admins` | SYS | `platform.maintenance.reminder_due` (SCH-84, T-24 h) | Admins of affected tenants | IA E | Y | Vars: product, region, window start / end + zone | N | P20 YX-GRO-08 / 09 |
| `platform.maintenance.started.admins` | SYS | `platform.maintenance.started` | Admins of affected tenants | IA E | Y | Vars: product, region, window start / end + zone | U | P20 YX-GRO-08 / 09 |
| `platform.maintenance.completed.admins` | SYS | `platform.maintenance.completed` | Admins of affected tenants | IA E | Y | Vars: product, region, window start / end + zone | N | P20 YX-GRO-08 / 09 |
| `platform.maintenance.extended.admins` | SYS | `platform.maintenance.extended` | Admins of affected tenants | IA E | Y | Vars: product, region, new window end + zone | U | P20 YX-GRO-08 / 09 |
| `platform.status.update.subscriber` | SYS | `platform.incident.opened`, `platform.incident.stage_changed`, `platform.incident.resolved`, `platform.maintenance.*` | Status-page subscribers (email, per product and region) | E | N | Vars: product, region, stage, time + zone; unsubscribe link | N | P20 YX-GRO-09 |
| `billing.lut.expiring.yx_billing` | BIL | `billing.lut.expiring` (SCH-85) | YukthiX billing team + CA (platform console) | IA E | Y | Vars: financial year, valid-to date | N | P14 YX-BILL-16 |

### 2.32 Validation pass 3 Shoulds (28 Sep 2026)

Types for the Should rules added in validation pass 3. Sensitive items (disability, medical, union membership, PIT, whistleblower) are **Special**: in-app or an email Link only; no row here uses W / S, so the template pack (§4) is unchanged. New scheduler rules SCH-88…SCH-95 are in §3.

**Statutory & pay (E1: P07 YX-STAT-27…32, M03 YX-PAY-53…63).** Vars never carry amounts, rates or union names of members; check-off statements go to the union as a time-boxed Link only.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `statutory.coverage.approaching.payroll` | PAY | `statutory.coverage.approaching` | Payroll + HR of the entity | IA E | Y | Vars: statute, entity short name, headcount, threshold | Y | P07 YX-STAT-27, M03 YX-PAY-53 |
| `statutory.coverage.crossed.payroll` | PAY | `statutory.coverage.crossed` | Payroll + HR + entity compliance owner | IA E | Y | Vars: statute, entity short name, crossed-on date; Link (readiness screen) | U | P07 YX-STAT-27, M03 YX-PAY-53 |
| `payroll.eli.prerequisite.employee` | PAY | `journey.task.due` (SCH-21; ELI prerequisite task: UAN face authentication, Aadhaar–bank seeding) | New joiner eligible for ELI | IA P E | Y | Vars: task label, due date | N | M03 YX-PAY-55, P07 YX-STAT-29 |
| `incentive.statement.published.employee` | PAY | `incentive.results.approved` | Employees on the plan | IA P E | N | Vars: plan name, period (never amounts); Link | N | M03 YX-PAY-60 |
| `incentive.clawback.applied.employee` | PAY | `incentive.clawback.applied` | Employee | IA E | Y | Vars: plan name, period; Link (amount on the statement) | N | M03 YX-PAY-60 |
| `payroll.checkoff.remitted.union` | PAY | `payroll.checkoff.remitted` | Recognised union's nominated contact (external email) + Payroll | E IA | Y | Vars: union name, month, member count; Link (statement, time-boxed) | N | M03 YX-PAY-63 |

**Disclosure packs (E7: P09 YX-MET-23 / 24).**

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `disclosure.pack.ready.reviewer` | SYS | `disclosure.pack.ready_for_review` | CFO / Company Secretary named on the pack | IA E | Y | Vars: pack kind (BRSR workforce / Board's report), financial year; Link | N | P09 YX-MET-23 |
| `disclosure.pack.approved.preparer` | SYS | `disclosure.pack.approved` | Preparer + CFO / Company Secretary | IA E | Y | Vars: pack kind, financial year, frozen version | N | P09 YX-MET-23 |

**Lifecycle & attendance (E2: M01, M02, M08, M13, P19).** Disability, union membership, PIT and whistleblower items are **Special**: in-app or an email Link only, never WhatsApp / SMS body text (so the template pack, §4, is unchanged). Whistleblower acknowledgement and feedback clocks (M08 YX-CASE-17) are case stages on SCH-53 and use the existing `case.stage.due.member`, `case.stage.overdue.escalation` and `case.acknowledged.complainant` rows; policy re-acknowledgement (P19 YX-RULE-14) opens a new M08 acknowledgement cycle and uses the existing `policy.ack.*` rows (SCH-52).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `buddy.assigned.buddy` | PPL | `buddy.assigned` | Buddy | IA P E | N | Vars: joiner name, joining date | N | M01 YX-LC-33 |
| `buddy.assigned.joiner` | PPL | `buddy.assigned` | Joiner (pre-boarding portal) | IA E | N | Vars: buddy name | N | M01 YX-LC-33 |
| `buddy.checkin.due.buddy` | PPL | `journey.task.due` (SCH-21; buddy check-in or day-30 / 90 feedback task) | Buddy (feedback tasks: buddy and joiner) | IA P | N | Vars: joiner name, task label, due date | Y | M01 YX-LC-33 |
| `reverification.consent.requested.employee` | DOC | `reverification.cycle.opened` | Employee in the cycle | IA E | Y | Vars: consent-by date; Link (consent page) | N | M01 YX-EMP-16 |
| `reverification.consent.due.employee` | DOC | `reverification.consent.due` (SCH-94) | Employee without consent | IA P E | Y | Vars: consent-by date; Link | N | M01 YX-EMP-16 |
| `reverification.completed.hr` | PPL | `reverification.completed` | HR review owner | IA E | N | Link (result in the app; adverse findings Special) | N | M01 YX-EMP-16 |
| `declaration.due.employee` | DOC | `declaration.due` (SCH-91) | Designated person / employee | IA P E | Y | Vars: declaration kind (fit-and-proper / KMP / code-of-conduct attestation / PIT holdings), due date; Link | N | M01 YX-EMP-17 / 18 |
| `declaration.overdue.compliance_officer` | DOC | `declaration.overdue` (SCH-91) | Compliance officer | IA E | Y | Vars: declaration kind, pending count | Y | M01 YX-EMP-17 / 18 |
| `pit.preclearance.decided.employee` | DOC | `pit.preclearance.decided` | Designated person | IA E | Y | Link (decision and window in the app) | N | M01 YX-EMP-18 |
| `pit.preclearance.expiring.employee` | DOC | `pit.preclearance.expiring` (SCH-93) | Designated person | IA E | Y | Link | N | M01 YX-EMP-18 |
| `block_leave.unplanned.employee` | TIM | `block_leave.unplanned` (SCH-90) | Designated person without a planned block | IA E | Y | Vars: cut-off date | N | M02 YX-LV-16 |
| `block_leave.unplanned.compliance_officer` | TIM | `block_leave.unplanned` (SCH-90, at cut-off) | Compliance officer | IA E | Y | Vars: count, cut-off date | Y | M02 YX-LV-16 |
| `access.suspended.employee` | SEC | `block_leave.started` | Designated person | E IA | Y | Vars: from date, expected return date | N | M02 YX-LV-16, P02 |
| `access.restored.employee` | SEC | `block_leave.ended` | Designated person | E IA | Y | Vars: restored-on date | N | M02 YX-LV-16, P02 |
| `licence.expiring.employee` | TIM | `licence.expiring` (SCH-88) | Licence holder | IA P E | Y | Vars: licence type, expiry date | Y | M02 YX-AT-29 |
| `licence.expiring.manager` | TIM | `licence.expiring` (SCH-88) | Manager + roster owner | IA E | N | Vars: employee name, licence type, expiry date | Y | M02 YX-AT-29 |
| `licence.expired.manager` | TIM | `licence.expired` (SCH-88; assignments from the expiry date blocked) | Manager + roster owner + HR | IA E | Y | Vars: employee name, licence type, expired-on date | U | M02 YX-AT-29 |
| `attendance.office_days.shortfall.employee` | TIM | `attendance.office_days.shortfall` | Employee | IA | N | — | Y | M02 YX-AT-30 |
| `attendance.office_days.shortfall.manager` | TIM | `attendance.office_days.shortfall` (weekly team summary) | Manager | IA E | N | Vars: week, team member count below policy | Y | M02 YX-AT-30 |
| `client_pack.due.owner` | WRK | `client_pack.due` (SCH-95) | Entity's contractor-compliance owner | IA E | Y | Vars: client name, establishment, month, due date | N | M13 YX-CLRA-15 |
| `client_pack.overdue.owner` | WRK | `client_pack.overdue` (SCH-95) | Contractor-compliance owner + HR head | IA E | Y | Vars: client name, establishment, month, days overdue | U | M13 YX-CLRA-15 |
| `notice_of_change.issued.worker` | DOC | `notice_of_change.issued` | Affected workers | IA P E | Y | Vars: policy point name, effective date; Link (notice) | N | P19 YX-RULE-13 |
| `notice_of_change.issued.union` | DOC | `notice_of_change.issued` | Recognised union's nominated contact (external email) | E | Y | Vars: entity short name, policy point name, effective date; Link (notice) | N | P19 YX-RULE-13 |

**Global (E6: P21 YX-GLB-01…16).** EU whistleblower acknowledgement and feedback are covered once, above (E2).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `work_authorisation.expiring.employee` | DOC | `work_authorisation.expiring` (SCH-89) | Authorisation holder | IA P E | Y | Vars: authorisation type, country, expiry date | N | P21 YX-GLB-06 |
| `work_authorisation.expiring.hr` | PPL | `work_authorisation.expiring` (SCH-89; renewal task opened) | HR of the sponsor entity | IA E | Y | Vars: employee name, authorisation type, expiry date | Y | P21 YX-GLB-06 |
| `work_authorisation.expired.hr` | PPL | `work_authorisation.expired` (SCH-89) | HR + Payroll of the sponsor entity | IA E | Y | Vars: employee name, authorisation type, expired-on date (pre-flight flag; pay is never stopped automatically) | U | P21 YX-GLB-06 |
| `holiday.changed.employee` | TIM | `holiday_feed.item.confirmed` (date differs from the published calendar) | Employees on that calendar | IA P | N | Vars: holiday name, old date, new date | N | P21 YX-GLB-05 |
| `region_move.scheduled.admins` | SYS | `tenant.region_move.approved` | System Admins of the tenant | IA E | Y | Vars: entity / tenant, target region, freeze window start / end + zone | N | P21 YX-GLB-11, P02 YX-SEC-38 |
| `region_move.rejected.admins` | SYS | `tenant.region_move.rejected` | Requesting System Admin | IA E | Y | Vars: target region, reason label | N | P21 YX-GLB-11 |
| `region_move.completed.admins` | SYS | `tenant.region_move.completed` | System Admins of the tenant | IA E | Y | Vars: target region, completed-on date; Link (deletion certificate) | N | P21 YX-GLB-11, P02 YX-SEC-38 |
| `einvoice.rejected.maker` | BIL | `einvoice.rejected` | Invoice maker (M10 staffing tenant) or YukthiX billing team | IA E | Y | Vars: invoice no., scheme, error class | U | P21 YX-GLB-12 |
| `nationalisation.target.warning.hr` | PPL | `nationalisation.snapshot.created` (gap above zero or band down) | HR + entity compliance owner | IA E | Y | Vars: entity short name, band, gap count | N | P21 YX-GLB-13 |

**Skills & AI (E4: T03, T05, M06, M07, P10).**

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `agent.action.ready.person` | SYS | `agent.action_prepared` | Person the agent acted for | IA P | N | Link (confirm card in the app or the linked chat app; never a confirm by reply) | N | P10 YX-AI-13 |
| `skill.suggested.employee` | PRF | `skill.suggested` | Employee | IA | N | — | Y | M06 YX-PERF-20 |
| `result.reuse.consent.candidate` | ASM | `result.reuse.consent_requested` | Candidate | E IA | Y | Vars: job title; Link (consent page) | N | T03 YX-DLV-22 |
| `dispute.escalated.legal` | ASM | `dispute.escalated` (legal hold placed) | Tenant legal role + test owner | IA E | Y | Link | N | T05 YX-EVAL-31 |
| `bias_audit.due.admin` | HIR | `bias_audit.due` (SCH-92) | System Admin + hiring compliance owner | IA E | Y | Vars: feature name, last audit date, due date | N | T05 YX-EVAL-32 |
| `bias_audit.overdue.admin` | HIR | `bias_audit.overdue` (SCH-92; feature blocked for NYC jobs) | System Admin + hiring compliance owner | IA E | Y | Vars: feature name, last audit date | U | T05 YX-EVAL-32 |
| `learning.ai_draft.ready.reviewer` | LRN | `learning.course.ai_draft_ready` | Named reviewer | IA E | N | Vars: course title | N | M07 YX-LRN-15 |
| `learning.course.review_flagged.owner` | LRN | `learning.course.review_flagged` (source policy version changed) | Course owner + reviewer | IA E | N | Vars: course title, source document title | Y | M07 YX-LRN-15 |
| `eor.sync_failed.owner` | SYS | `eor.sync_failed` | Connection owner + Payroll | IA E | N | Vars: provider name, country, direction (push / pull), error class | N | P10 YX-INT-12 |

**Hiring & staffing (E3: M10 YX-ATS-34…45, M12 YX-PRJ-15…17).** Candidate data (application answers, scores, reference responses, fraud signals, deletion reasons) never goes in a message body: candidate and referee rows carry at most job title, company name and a Link, and no row uses W / S, so the template pack (§4) is unchanged. WhatsApp / chatbot apply consent and opt-out confirmations use the existing `channel.consent.confirmed.recipient` and `channel.consent.withdrawn.recipient` rows (§5).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `ats.posting.publish_blocked.recruiter` | HIR | `ats.posting.publish_blocked` (pay range missing where required, or banned pay-history question on) | Recruiter + requisition owner | IA E | Y | Vars: job title, reason label | N | M10 YX-ATS-34 |
| `ats.automation.notice.candidate` | HIR | `ats.application.submitted` (job uses automated screening, AI interview or AI scoring) | Candidate | E | Y | Vars: job title, company name; Link (notice + consent page) | N | M10 YX-ATS-35 |
| `ats.alt_process.requested.recruiter` | HIR | `ats.alt_process.requested` | Recruiter on the job | IA E | Y | Vars: job title; Link | N | M10 YX-ATS-35 |
| `ats.deletion.received.candidate` | HIR | `ats.candidate.deletion_requested` | Candidate | E | Y | Vars: company name, complete-by date (30 days) | N | M10 YX-ATS-35 |
| `ats.deletion.requested.recruiter` | HIR | `ats.candidate.deletion_requested` | Recruiter + privacy owner | IA E | Y | Vars: complete-by date; Link | N | M10 YX-ATS-35 |
| `ats.deletion.completed.candidate` | HIR | `ats.candidate.deletion_completed` (or legal hold applied) | Candidate (address kept only to send this) | E | Y | Vars: company name, completed-on date or hold reason label | N | M10 YX-ATS-35 |
| `ats.notetaker.consent.participants` | HIR | `ats.interview.scheduled` (notetaker on) | Candidate + panel | E IA | Y | Vars: job title, interview date + zone; Link (consent) | N | M10 YX-ATS-37 |
| `ats.reference.request.referee` | HIR | `ats.reference.requested` | Referee (external) | E | N | Vars: candidate first name, company name, expiry date; Link (questionnaire) | N | M10 YX-ATS-38 |
| `ats.reference.reminder.referee` | HIR | `ats.reference.reminder_due` | Referee (external) | E | N | Vars: candidate first name, company name, expiry date; Link | N | M10 YX-ATS-38 |
| `ats.reference.expired.referee` | HIR | `ats.reference.expired` | Referee (external) | E | N | Vars: candidate first name, company name | N | M10 YX-ATS-38 |
| `ats.reference.flagged.recruiter` | HIR | `ats.reference.flagged` | Recruiter | IA E | N | Link (signals in the app; never auto-decided) | N | M10 YX-ATS-38 |
| `ats.rediscovery.suggested.recruiter` | HIR | `ats.rediscovery.suggested` | Recruiter on the requisition | IA | N | — | Y | M10 YX-ATS-39 |
| `ats.interview_day.invite.candidate` | HIR | `ats.interview_day.published` (one per candidate) | Candidates on the drive | E | N | Vars: job title, company name, date, venue or join link, reporting time + zone | N | M10 YX-ATS-40 |
| `ats.offer.condition_due.candidate` | HIR | `ats.offer.condition_due` | Candidate | E | Y | Vars: condition label, due date; Link (portal) | N | M10 YX-ATS-41 |
| `ats.offer.condition_lapsed.recruiter` | HIR | `ats.offer.condition_lapsed` | Recruiter + hiring manager | IA E | N | Vars: job title, condition label | N | M10 YX-ATS-41 |
| `ats.offer.lapsed.candidate` | HIR | `ats.offer.lapsed` | Candidate | E | Y | Vars: job title, company name | N | M10 YX-ATS-41 |
| `ats.offer.lapsed.hr` | HIR | `ats.offer.lapsed` (pre-boarding unwound) | Recruiter + HR onboarding owner | IA E | N | Vars: candidate name, job title | N | M10 YX-ATS-41 |
| `ats.replacement.triggered.account_manager` | HIR | `ats.replacement.triggered` | Account manager + recruiter | IA E | N | Vars: client name, placement ref, guarantee end date | N | M10 YX-ATS-43 |
| `billing.einvoice.window_warning.maker` | BIL | `billing.einvoice.window_warning` (day 25 of 30) | Invoice maker (M10 / M12) + finance | IA E | Y | Vars: invoice no., invoice date, days left | U | M10 YX-ATS-44, M12 YX-PRJ-16 |
| `billing.einvoice.window_blocked.maker` | BIL | `billing.einvoice.window_blocked` (after day 30; re-issue needed) | Invoice maker (M10 / M12) + finance | IA E | Y | Vars: invoice no., invoice date | U | M10 YX-ATS-44, M12 YX-PRJ-16 |
| `project.credit_note.issued.client_billing` | WRK | `project.credit_note.issued` | Client billing contact | E | N | Vars: credit note no., original invoice no.; Link (portal) | N | M12 YX-PRJ-15 |
| `project.credit_note.issued.account_manager` | WRK | `project.credit_note.issued` | Account manager + PM | IA E | N | Vars: project code, credit note no. | Y | M12 YX-PRJ-15 |
| `project.resource_request.raised.resource_manager` | WRK | `project.resource_request.raised` | Resource manager | IA E | N | Vars: project code, role / level, start date | Y | M12 YX-PRJ-17 |
| `project.resource_request.matched.pm` | WRK | `project.resource_request.matched` | Requesting PM | IA | N | — | Y | M12 YX-PRJ-17 |
| `project.resource_request.confirmed.employee` | WRK | `project.resource_request.confirmed` | Allocated employee + PM | IA P E | N | Vars: project name, start date, % allocation | N | M12 YX-PRJ-17 |
| `project.bench.ageing.resource_manager` | WRK | `project.bench.ageing` (bench days cross the set threshold) | Resource manager + delivery head | IA E | N | Vars: count, threshold days | Y | M12 YX-PRJ-17 |

**Growth, billing & operations (E5: P20 YX-GRO-11…14, P14 YX-CONSOLE-09, YX-BILL-18…21, P12 YX-SECOPS-12).** Platform messages carry no tenant HR data. Win-back is a marketing message: sent only with a recorded marketing consent, stops on opt-out, never mandatory. The containment incident banner is a page element, not a notification type. No row uses W / S.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `whats_new.published.user` | SYS | `whats_new.item.published` (role and product match) | Users in the targeted roles | IA | N | — | Y | P20 YX-GRO-11 |
| `feature_request.status_changed.voter` | SYS | `feature_request.status_changed` | Requester + voters | IA E | N | Vars: request title, new status | Y | P20 YX-GRO-12 |
| `subscription.save_offer.admin` | BIL | `subscription.cancel_reason_recorded` (a save offer applies: pause, fewer products, partner help) | Admin who started the cancellation | IA E | N | Vars: product, offer label; Link (cancel stays available) | N | P20 YX-GRO-13 |
| `winback.offer.former_admin` | BIL | `winback.due` | Former admin with a recorded marketing consent | E | N | Vars: first name, company short name; unsubscribe link | N | P20 YX-GRO-13 |
| `referral_credit.issued.referrer_admin` | BIL | `referral_credit.issued` (side = referrer) | Billing contact of the referring company | IA E | N | Vars: credit (one month), invoice month | N | P20 YX-GRO-14, P14 YX-BILL-21 |
| `referral_credit.issued.referred_admin` | BIL | `referral_credit.issued` (side = referred) | Billing contact of the referred company | IA E | N | Vars: credit (one month), invoice month | N | P20 YX-GRO-14, P14 YX-BILL-21 |
| `payout.blocked.payroll` | PAY | `payout.readiness_failed` (KYB not approved, funding account not set or balance short) | Payroll + System Admin | IA E | Y | Vars: pay period, reason label (never amounts or balances) | U | P14 YX-BILL-18 |
| `payout.partial_released.payroll` | PAY | `payout.partial_released` | Payroll + System Admin | IA E | Y | Vars: pay period, paid count, open count | N | P14 YX-BILL-18 |
| `invoice.irn_due.yx_billing` | BIL | `invoice.irn_overdue` (day 20 of the 30-day window) | YukthiX billing team (platform console) | IA E | Y | Vars: invoice no., invoice date, days left | U | P14 YX-BILL-20 |
| `tenant.contained.admins` | SEC | `tenant.contained` | Tenant owner + System Admins | E IA | Y | Vars: company short name, contained-at time + zone (no reason text) | U | P12 YX-SECOPS-12 |
| `tenant.containment_lifted.admins` | SEC | `tenant.containment_lifted` | Tenant owner + System Admins | E IA | Y | Vars: company short name, lifted-at time + zone | U | P12 YX-SECOPS-12 |
| `tenant.cost_share.exceeded.staff` | SYS | `tenant.cost_share.exceeded` | YukthiX platform staff (console, YX-CONSOLE-08 access) | IA E | N | Vars: tenant id, month | Y | P14 YX-CONSOLE-09 |

### 2.33 P22 Workflow Studio & AI assistant (28 Sep 2026)

Types for [P22](P22-workflow-studio-ai-assistant.md) (YX-WFS-01…20) and P10 YX-AI-15. **Wave:** workflow types wave 2; script types wave 6; agent-plan types wave 5. **Owner** = the workflow's owner (publisher). No row uses W / S, so the template pack (§4) is unchanged. Vars carry names, counts and labels only; record values, script output and per-person results stay in the app (P02 classes).

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `workflow.run.failed.owner` | SYS | `workflow.run.failed` (step failed after retries, or run stopped by a per-run limit or the kill switch) | Workflow owner + System Admin | IA E | N | Vars: workflow name, version, failed step, status (failed / stopped), error class; Link (failure queue) | Y | P22 YX-WFS-07 / 09 |
| `workflow.limit.reached.admin` | BIL | `workflow.limit.reached` (80 % and 100 %; runs or records touched per day) | System Admin | IA E | N | Vars: limit kind, used, limit, threshold | N | P22 YX-WFS-07, D18 |
| `workflow.script_limit.reached.admin` | BIL | `workflow.limit.reached` (80 % and 100 %; script CPU seconds per day) | System Admin + script owner | IA E | N | Vars: limit kind, used, limit, threshold | N | P22 YX-WFS-07 / 13, D18 |
| `workflow.paused.owner` | SYS | `workflow.paused` (kill switch on one workflow or tenant-wide, or publisher lost rights) | Workflow owner + System Admin | IA E | Y | Vars: workflow name (or "all workflows"), reason label (kill switch / publisher rights reduced), paused by | U | P22 YX-WFS-12 / 14 |
| `workflow.version.review_requested.approver` | APR | `workflow.version.submitted` (touches pay, leave balances, access or people data) | Second approver (P03 task; never the author) | IA P E | N | Vars: workflow name, version, author name, affected count; Link (impact preview) | N | P22 YX-WFS-04 |
| `workflow.script.review_requested.approver` | APR | `workflow.version.submitted` (version with a script step touching pay or people data) | Second approver (P03 task; never the author) | IA P E | N | Vars: workflow name, script step name, author name, static-check result; Link (script diff) | N | P22 YX-WFS-15 |
| `workflow.run.undone.owner` | SYS | `workflow.run.undone` | Workflow owner + person who undid the run | IA E | N | Vars: workflow name, run ref, steps reversed, irreversible steps left | Y | P22 YX-WFS-10 |
| `agent.plan.approval_requested.requester` | SYS | `agent.plan.proposed` | Person who asked the AI | IA P | N | Vars: plan title, step count, record count, always-confirm step count; Link (plan card) | N | P22 YX-WFS-17, P10 YX-AI-15 |
| `agent.plan.step_confirmation.requester` | SYS | `agent.plan.step_awaiting_confirmation` (always-confirm step reached) | Person who approved the plan | IA P | Y | Vars: plan title, step label (money / filing / decision / pay change); Link (the app's own confirm screen) | N | P22 YX-WFS-18 |
| `agent.plan.completed.requester` | SYS | `agent.plan.completed` | Person who approved the plan | IA P E | N | Vars: plan title, steps done / skipped, records changed; Link (summary with Undo) | N | P22 YX-WFS-17 / 19 |

### 2.34 P23 Employee & manager assistants and marketplaces (28 Sep 2026)

Types for [P23](P23-employee-manager-assistants-marketplaces.md) (YX-AST-01…19). **Wave:** payslip explainer (rule-based), tax planner and salary optimiser wave 3; the rest wave 5. No row uses W / S, so the template pack (§4) is unchanged; **salary, tax, take-home, premium and payslip amounts never appear in any external channel** (email, push, Slack / Teams carry labels, counts and dates only; amounts stay in the app, YX-AST-02 / 05). Team-member names and coach signals stay in-app (YX-AST-10). New scheduler rules SCH-96…98 are in §3.

| Type key | Cat | Trigger | Audience | Channels | Mand. | Ext-safe | Dig. | Src |
|---|---|---|---|---|---|---|---|---|
| `payslip.diff.unexplained.employee` | PAY | `payslip.diff.unexplained` (a changed line with no supporting payroll record) | Employee (own payslip only) | IA P | N | Link (payslip diff with **Raise payslip query**; no amounts) | N | P23 YX-AST-04 |
| `payslip.query.raised_from_explainer.payroll` | PAY | `payslip.query.raised` (source = explainer; the diff is attached; replaces `payslip.query.raised.payroll` for these queries, general rule 1) | Payroll query queue | IA E | N | Vars: count; Link (query with diff) | Y | P23 YX-AST-04, M03 YX-PAY-25 |
| `policy_draft.review_ready.hr` | DOC | `policy_draft.created` | HR Admin (policy owner) + named approver | IA E | N | Vars: policy type, draft count, open law-floor finding count; Link (draft editor) | Y | P23 YX-AST-06 / 07 |
| `policy_draft.approved.hr` | DOC | `policy_draft.approved` (values loaded into P19, text published as a new M08 version; employees get the acknowledgement request through `policy.published.employee`) | Draft author + HR Admin | IA E | N | Vars: policy type, approver name, rule values loaded, affected count; Link (M08 policy version) | N | P23 YX-AST-06 / 19 |
| `work_tool.connection.revoked.owner` | SYS | `work_tool.revoked` (revoked by the user or provider, token expired, or exit) | Connected employee | IA E | N | Vars: provider (Google Calendar / Microsoft Calendar / Jira / GitHub), reason (expired / revoked); Link (reconnect) | N | P23 YX-AST-08 |
| `timesheet.prefill.ready.employee` | TIM | `timesheet.suggestions.generated` | Employee | IA P | N | Vars: week, suggested hours, line count; Link (draft timesheet; Submit stays manual) | Y | P23 YX-AST-09 |
| `coach.nudge.weekly.manager` | PRF | `coach.nudge.sent` (SCH-96; managers who opted out get none) | Manager | IA P E | N | Vars: nudge count; Link (coach card); team-member names and signals in-app only | Y | P23 YX-AST-10 / 18 |
| `tax.regime_compare.reminder.employee` | PAY | `tax_regime.compare.reminder_due` (SCH-97; declaration window open, regime not yet chosen) | Employee | IA P E | N | Vars: window close date; Link (Compare tax regimes); no tax amounts | Y | P23 YX-AST-12 |
| `salary_split.stale.hr` | PAY | `salary_split.stale` (a law version change affects saved suggestions) | HR / Payroll Admin who saved them | IA E | N | Vars: stale suggestion count, law label; Link | Y | P23 YX-AST-13 |
| `insurance.quotes.ready.owner` | PAY | `insurance.quote.received` (all requested quotes in, or the quote window closed) | Requester (owner / HR Admin) | IA E | N | Vars: partner name, quote count; Link (neutral comparison); no premiums | N | P23 YX-AST-14 |
| `insurance.purchased.hr` | PAY | `insurance.purchased` | Requester + HR Admin (benefits) | IA E | N | Vars: partner name, insurer name, cover start date; Link (M11 plan) | N | P23 YX-AST-14 / 19 |
| `insurance.endorsement.synced.hr` | PAY | `insurance.endorsement.synced` (joiners added / leavers removed) | HR Admin (benefits) | IA E | N | Vars: added count, removed count, effective date | Y | P23 YX-AST-15, M11 |
| `marketplace_partner.licence.expiring.yx` | SYS | `marketplace_partner.licence.expiring` (SCH-98) | YukthiX partner team (staff) | IA E | Y | Vars: partner name, licence type, expiry date | N | P23 YX-AST-14 |
| `marketplace_partner.licence.expired.admin` | SYS | `marketplace_partner.licence.expired` (offer hidden; open quotes withdrawn) | System Admin + HR Admin of tenants with open quotes | IA E | N | Vars: partner name, expired-on date | N | P23 YX-AST-14 |
| `perk.redeemed.employee` | ENG | `perk.redeemed` | Employee | IA E | N | Vars: partner name, offer title, fields shared; Link (code in the app) | N | P23 YX-AST-16 |

---

## 3. Scheduled notifications (P04 scheduler)

The P04 scheduler (§4.6) runs hourly / daily jobs in each recipient's time zone. Each rule raises an event (listed in APX-B with producer "P04 scheduler") and the types in §2 listen to it. Per spec **D17**, every lead time is a **company setting** (P01 scoped settings) seeded with the starter value shown; **law** marks values taken from P07 that the company can't loosen. Rules marked **F3** were missing from P04 §4.6 before this appendix.

| ID | Rule | Anchor · starter lead times | Raises | Types (§2) | Src |
|---|---|---|---|---|---|
| SCH-01 | Approval SLA | Step due time · reminders at 50 % and 100 % of SLA (working time, approver's calendar), escalate after | `approval.task.reminder`, `approval.task.escalated` | 2.1, 2.13 | P03 §4.6 |
| SCH-02 | Document expiry | `documents.expires_on` · T-30, T-15, T-7 (per document type), expired at T0 | `document.expiring`, `document.expired` | 2.5 | P05 YX-DOC-06 |
| SCH-03 | Signature pending | Sign-by date · T-3, T-1 | `signature.pending` | 2.5 | P05 §4.4 |
| SCH-04 | Alumni access ending | Exit + 7 years (law / P05 Q6) · T-30 | `alumni.access.expiring` | 2.5 | P05 Q6 |
| SCH-05 | Retention deletion pre-notice | Retention end per data class · T-7 | `retention.deletion.upcoming` | 2.5, 2.21 | P05 §4.7, T05 Q7 · **F3** |
| SCH-06 | Statutory rule effective | Rule effective date · T-7 | `statutory.rule.effective_soon` | 2.6 | P07 YX-STAT-08 |
| SCH-07 | **Compliance calendar** (single producer for statutory due dates) | P07 `calendar_rules` × the entity's `statutory_registrations` (PF, ESI, PT, LWF, TDS deposit and Form 138 / Form 140 (24Q / 26Q for quarters up to 31 Mar 2026), bonus, Worker Re-skilling Fund remittance after a retrenchment (`IN.IR`), annual health check-up for workers 40+ where prescribed (`IN.OSH`), transitional flags for state rules pending notification under the Labour Codes (P07 §4.7), gratuity Form L within 15 days of payability, POSH annual report, IW-1, CLRA returns and principal-employer registers per M13 YX-CLRA-10) · T-7, T-3, T-1, T0 (law for the due date; lead times editable) · overdue daily from T+1 until marked filed | `compliance.due.upcoming`, `compliance.due.overdue` | 2.6 | P07 §4, P04 §4.6, M13 YX-CLRA-10 · **F3** (Form L) |
| SCH-08 | Time-boxed grant expiry | Grant end · T-3 | `security.grant.expiring` | 2.3 | P02 YX-SEC-15 |
| SCH-09 | Announcement acknowledgement | Publish date · +3, +7 days until acknowledged | `announcement.ack_due` | 2.4 | P04 Q8 |
| SCH-10 | Integration credential / OAuth token expiry | Token expiry · T-14, T-3 | `integration.token.expiring` | 2.7 | P10 §B2 · **F3** |
| SCH-11 | API key expiry | `api_keys.expires_at` · T-14, T-3, expired at T0 | `api.key.expiring`, `api.key.expired` | 2.7 | P11 Q4 · **F3** |
| SCH-12 | Device and kiosk heartbeat | Last heartbeat · missed for 30 min (starter) | `integration.device.offline`, `kiosk.heartbeat.missed` | 2.7, 2.10 | P10 §B3, M04 Q4 |
| SCH-13 | Usage thresholds | Hourly metering · SMS cap 80 % and 100 %; AI credits 80 % and 100 %; API fair-use 80 % | `channel.usage.threshold_reached`, `ai.credits.threshold_reached`, `api.usage.threshold_reached` | 2.8 | P04 Q3, P10, P11 Q8 · **F3** |
| SCH-14 | Audit chain verification | Daily 02:00 platform time | `audit.chain.verification_failed` (on failure only) | 2.3 | P08 YX-AUD-03 |
| SCH-15 | Report subscriptions | Subscription schedule (daily / weekday / weekly / monthly) | `report.subscription.due` | 2.7 | P09 Q7 |
| SCH-16 | Trial and grace period | Trial end (day 30, or day 44 after the one 14-day extension; P14 YX-TEN-08) · T-7, T-1; grace end · T-3. The read-only stage after trial end is SCH-81…83 | `billing.trial.ending`, `billing.grace.ending` | 2.8 | GAP A4 → P14 |
| SCH-17 | Scheduled dated changes | Effective date, 00:00 in the employee's location time zone | `employee.change.effective` | 2.2 | P06 §4.3 |
| SCH-18 | Pre-boarding items pending | Joining date · T-10, T-5, T-2 while mandatory items are open | `preboarding.items.pending` | 2.9 | M01 Q2 |
| SCH-19 | Pre-boarding touchpoints | Joining date · offsets per the journey template | `preboarding.touchpoint.due` | 2.9 | M01 E18 |
| SCH-20 | Joining tomorrow | Joining date · T-1 | `employee.joining_due` | 2.9 | M01 §3.5 |
| SCH-21 | Journey task SLA | Task due date (± offset from anchor) · T-1, T0; overdue T+1 → manager, T+3 → HR | `journey.task.due`, `journey.task.overdue` | 2.9 | M01 YX-LC-02 |
| SCH-22 | Probation review | `probations.planned_end` · review created T-15; reminders T-7, T-3; escalate T0 | `employee.probation.review_due`, `employee.probation.overdue` | 2.9 | M01 Q3 |
| SCH-23 | Contract end | `employments.contract_end_on` · T-30, T-7; policy action at T0 | `employment.contract_ending` | 2.9 | M01 YX-LC-19 |
| SCH-24 | Retirement approaching | Computed retirement date · T-6 months, T-3 months, T-1 month | `employee.retirement.approaching` | 2.9 | M01 YX-LC-20 · **F3** |
| SCH-25 | Return from long absence | `employment_absences.expected_return_on` · T-7 | `employee.absence.return_due` | 2.9 | M01 YX-EMP-06 |
| SCH-26 | LWD approaching | `exit_cases.approved_lwd` · T-7, T-1; T0 runs "At LWD" handlers | `employment.lwd_approaching` | 2.9 | M01 D6 · **F3** |
| SCH-27 | Asset return due | LWD · T-3, T0; overdue T+3 | `asset.return_due` | 2.9 | M01 §3.6 · **F3** |
| SCH-28 | F&F deadline | Legal payment deadline from LWD: **2 working days** for every exit type (Code on Wages, P07 `IN.WAGES-CODE`) · T-1; overdue daily | `fnf.due`, `fnf.overdue` | 2.9 | M01 YX-LC-08, M03 YX-PAY-48 |
| SCH-29 | Gratuity eligibility | Service start + qualifying service (law, P07: 5 years; 1 year for fixed-term employees, Code on Social Security) · T0 | `employee.gratuity.eligible` | 2.9 | P07 · **F3** |
| SCH-30 | Absconding timeline | First day of unauthorised absence · day 3, 7, 14, 21 (company timeline) | `absconding.step.reached` | 2.9 | M01 YX-LC-17 |
| SCH-31 | Birthdays and work anniversaries | Daily 00:00 local; respects P02 directory opt-out and M09 opt-outs | `engage.celebration.due` | 2.16 | P04 §4.6, M09 Q5 |
| SCH-32 | Holiday tomorrow | Holiday date · T-1 at 17:00 local | `holiday.tomorrow` | 2.10 | P04 §4.6 |
| SCH-33 | Missing check-in | Shift start + grace + 15 min (Punch mode only; no nudge on D10 status days) | `attendance.checkin.missing` | 2.10 | P04 §4.6, M02 YX-AT-10 |
| SCH-34 | Attendance exceptions | Daily detection 06:00 local; employee next day; manager weekly (Monday); HR daily digest | `attendance.exception.raised`, `attendance.exceptions.weekly`, `attendance.exceptions.daily` | 2.10 | P08 Q4 |
| SCH-35 | Attendance cut-off | Entity cut-off day · T-3, T-1 | `attendance.cutoff.approaching` | 2.10 | P08 Q2 |
| SCH-36 | Comp-off expiry | Credit expiry · T-7, T-1 | `leave.compoff.expiring` | 2.10 | M02 YX-LV-06 |
| SCH-37 | Timesheet due | Week end · +1 day, +3 days (also M12's "missing week" nudge) | `timesheet.due` | 2.10 | M02 §B7, M12 §6 |
| SCH-38 | Payroll cut-off | Pay calendar cut-off · T-3, T-1 | `payroll.cutoff.approaching` | 2.11 | P04 §4.6 |
| SCH-39 | Salary hold ageing | Weekly (Monday) | `payroll.holds.weekly` | 2.11 | M03 YX-PAY-28 |
| SCH-40 | Tax declaration window | Window close · T-7, T-1 | `tax.declaration.window.closing` | 2.11 | M03 Q5 |
| SCH-41 | Tax regime cut-off | Company regime cut-off · T-7, T-1 | `tax.regime.cutoff_approaching` | 2.11 | M03 YX-TAX-01 · **F3** |
| SCH-42 | Tax proof window | Window close (Jan–Feb starter) · T-7, T-3, T-1 | `tax.proof.window.closing` | 2.11 | M03 Q5 |
| SCH-43 | Advance settlement | Trip end + settlement window (starter 30 days) · T-7 of window end; overdue at T0 | `advance.settlement_due`, `advance.overdue` | 2.12 | M05 YX-EXP-09 |
| SCH-44 | 360° feedback and review acknowledgement | Stage due date · T-3, T-1 | `perf.feedback.pending`, `perf.review.ack_pending` | 2.13 | M06 Q2 / Q4 |
| SCH-45 | Goal check-in cadence | Cycle cadence (starter monthly) · due date, +3 days | `perf.goal.checkin_due` | 2.13 | M06 §3 · **F3** |
| SCH-46 | 1-on-1 cadence | Scheduled 1-on-1 · T-1 day; lapsed when none in 30 days (starter) | `perf.one_on_one.due`, `perf.one_on_one.lapsed` | 2.13 | M06 §3 · **F3** |
| SCH-47 | PIP | PIP check-in dates · T-1; PIP end · T-7 | `perf.pip.checkin_due`, `perf.pip.end_due` | 2.13 | M06 Q7 |
| SCH-48 | Learning due dates | Enrolment due · T-7, T-1; overdue T+1 → manager, T+7 → HR | `learning.enrolment.due`, `learning.enrolment.overdue` | 2.14 | M07 YX-LRN-04 |
| SCH-49 | Certification expiry | `certifications.expires` · T-30 (renewal enrolment created), T-7; expired at T0 | `learning.certification.expiring`, `learning.certification.expired` | 2.14 | M07 YX-LRN-05 |
| SCH-50 | Sessions | Session start · T-1 day, T-1 h; attendance due session end + 1 day | `learning.session.upcoming`, `learning.session.attendance_due` | 2.14 | M07 §3 |
| SCH-51 | Training effectiveness check | Session end + 60 days | `learning.effectiveness.due` | 2.14 | M07 Q8 |
| SCH-52 | Policy acknowledgement | Publish date · +3, +7 reminders; +14 escalate to manager | `policy.ack.due`, `policy.ack.overdue` | 2.15 | M08 YX-POL-02 |
| SCH-53 | Case stage deadlines | Stage due date (POSH dates from P07, law) · T-3, T0; escalation per P07 POSH parameters (e.g. inquiry day 75) | `case.stage.due`, `case.stage.overdue` | 2.15 | M08 YX-CASE-05, YX-POSH-03 |
| SCH-54 | Helpdesk SLA | Queue business hours · 80 % warning, 100 % breach; resolved tickets auto-close after 3 days | `helpdesk.ticket.sla_warning`, `helpdesk.ticket.sla_breached`, `helpdesk.ticket.closed` | 2.15 | M08 YX-HD-02 / 05 |
| SCH-55 | Warning expiry | `warnings.expires` (starter 12 months) · T0 | `disciplinary.warning.expired` | 2.15 | M08 Q5 · **F3** |
| SCH-56 | IC tenure expiry | Member tenure end · T-60, T-30; at T0 composition re-validated | `posh.ic.tenure_expiring`, `posh.ic.invalid` | 2.15 | M08 YX-POSH-01 · **F3** |
| SCH-57 | Survey reminders | Survey close · open +3 days, T-1 | `engage.survey.reminder_due` | 2.16 | M09 §6 |
| SCH-58 | Lifecycle surveys | Joining date + 30 / 60 / 90 days; exit case accepted + 0, reminder LWD-3 | `engage.survey.lifecycle_due` | 2.16 | M09 §6, M01 §3.7 · **F3** |
| SCH-59 | Survey action plan | Survey close + 30 days · T-7, T0 | `engage.action_plan.due` | 2.16 | M09 Q8 |
| SCH-60 | Reward points expiry | Points expiry (if the company sets one) · T-30 | `engage.points.expiring` | 2.16 | M09 Q4 |
| SCH-61 | Interviews and scorecards | Interview start · T-24 h, T-1 h; scorecard due at end + 24 h | `ats.interview.upcoming`, `ats.scorecard.due` | 2.17 | M10 §2 |
| SCH-62 | Offer expiry | `offers` expiry · T-2 days, T-1 day; expired at T0 | `ats.offer.expiring`, `ats.offer.expired` | 2.17 | M10 Q3 · **F3** |
| SCH-63 | Referral bonus eligibility | Referred person's joining date + 90 days (company-set) | `ats.referral.eligible` | 2.17 | M10 YX-ATS-12 |
| SCH-64 | Candidate retention | Last activity + retention (starter 12 months) · T-30 renewal email; T0 anonymise (SCH-05 pre-notice applies) | `ats.candidate.retention_expiring` | 2.17 | M10 Q6 |
| SCH-65 | Placement end and bench | Placement end · T-30, T-7 (starter); bench max days · T-7, T0 | `ats.placement.ending`, `ats.bench.limit_reached` | 2.17 | M10 YX-ATS-15 |
| SCH-66 | Client dunning | Invoice due date · +7, +15, +30 (company schedule) | `ats.invoice.overdue` | 2.17 | M10 YX-ATS-16 |
| SCH-67 | Test reminders | Slot / window start · T-24 h, T-1 h; window close · T-24 h | `test.start.upcoming`, `test.window.closing` | 2.19 | T03 Q1 |
| SCH-68 | No-show and expired invitations | Slot end + 15 min grace; window end | `slot.no_show`, `test.invitation.expired` | 2.19 | T03 YX-DLV-03 |
| SCH-69 | Drive capacity plan | Drive start · T-7 when a drive above 1,000 has no approved plan | `drive.capacity_plan.missing` | 2.19 | T03 Q2 |
| SCH-70 | Proctor shifts | Shift start · T-1 h; Live slot without enough proctors · T-24 h | `proctor.shift.upcoming`, `proctor.slot.understaffed` | 2.20 | T04 Q8 |
| SCH-71 | Incident review SLA | Incident opened · 3 working days, reminders at 50 % and 100 % | `incident.review.due` | 2.21 | T05 Q1 |
| SCH-72 | Appeal decision SLA | Appeal submitted · 10 working days, reminders at 50 % and 100 % | `appeal.decision.due` | 2.21 | T05 Q2 |
| SCH-73 | Field visits | Beat-plan visit window end · missed when no site check-in by window end + 1 h (starter) | `field.visit.missed` | 2.10 | M02 §B8 |
| SCH-74 | Shift bid window | Bid window close · T-24 h | `roster.bid_window.closing` | 2.10 | M02 YX-AT-20 |
| SCH-75 | ESOP exercise window | Plan exercise-window end; leaver post-exit window (starter 90 days) · T-30, T-7 | `esop.exercise_window.closing` | 2.11 | M03 YX-PAY-46 |
| SCH-76 | Project billing day | Company billing day per entity (T&M WIP, retainers) · T0 | `project.billing.due` | 2.23 | M12 §6 |
| SCH-77 | CLRA licence and RC expiry | `contractor_licences.valid_to`, `clra_registrations.valid_to` · T-60, T-30, T-7 (starter) | `clra.licence.expiring`, `clra.registration.expiring` | 2.24 | M13 YX-CLRA-02 |
| SCH-78 | CLRA compliance pack | Pack due date (starter 15th of the following month, never after the statutory date) · T-5, T-1; overdue daily from T+1 | `clra.pack.due`, `clra.pack.overdue` | 2.24 | M13 YX-CLRA-05 |
| SCH-79 | Take-home deadline | Take-home deadline in the candidate's zone · T-24 h, T-2 h; closed at T0 | `takehome.deadline.approaching`, `takehome.closed` | 2.19 | T07 YX-CODE-05 |
| SCH-80 | Trial nudges | Trial start · day 0, 1, 3, 7, 14 (a nudge whose setup step is done is skipped) | `trial.nudge.due` | 2.31 | P20 YX-GRO-03 |
| SCH-81 | Trial end check | Trial day 30 · extended once by 14 days when first value is reached (else on request); at the end of the trial or extension without switch-on, read-only starts | `trial.extended`, `trial.readonly.started` | 2.31 | P14 YX-TEN-08, P20 YX-GRO-06 |
| SCH-82 | Trial read-only reminders | Read-only start · day 15, day 25 | `trial.readonly.reminder_due` | 2.31 | P14 YX-TEN-08 |
| SCH-83 | Trial deletion | Read-only start · day 30 (deletion certificate issued) | `trial.deleted` | 2.31 | P14 YX-TEN-08 |
| SCH-84 | Maintenance reminder | Maintenance window start · T-24 h (scheduling notice ≥ 72 h) | `platform.maintenance.reminder_due` | 2.31 | P20 YX-GRO-08 |
| SCH-85 | LUT renewal | Each year · 1 March and 15 March until the next financial year's LUT row exists (YukthiX platform) | `billing.lut.expiring` | 2.31 | P14 YX-BILL-16 |
| SCH-86 | Accident statutory reports | Accident date and time · per-case items on the P07 compliance calendar (ESIC accident report, statutory accident notice; **law**) · T-1 day, T0; overdue daily from T+1 until marked submitted | `accident.report.due`, `accident.report.overdue` | 2.27 | M08 YX-CASE-15 |
| SCH-87 | EC compensation due | EC claim due date (P07 `IN.EC`, **law**) · T-7, T-1; overdue daily from T+1 until paid or deposited | `accident.ec.payment.due`, `accident.ec.payment.overdue` | 2.27 | M08 YX-CASE-16, M03 YX-PAY-50 |
| SCH-88 | Worker licence expiry | Licence `valid_to` for a role / skill / shift requirement (M02) · T-60, T-30, T-7 (starter); expired at T0 (assignments blocked) | `licence.expiring`, `licence.expired` | 2.32 | M02 YX-AT-29 |
| SCH-89 | Work authorisation expiry | Authorisation expiry · T-90, T-60, T-30, T-7 (starter); expired at T0 | `work_authorisation.expiring`, `work_authorisation.expired` | 2.32 | P21 YX-GLB-06 |
| SCH-90 | Block-leave cut-off | Company cut-off date (BFSI pack) · T-14 to each designated person without a planned block; T0 list to the compliance officer | `block_leave.unplanned` | 2.32 | M02 YX-LV-16 |
| SCH-91 | Declarations and attestations | Due date from the company calendar (yearly; on designation or change) · T-14, T-3, T0; overdue weekly from T+1 | `declaration.due`, `declaration.overdue` | 2.32 | M01 YX-EMP-17 / 18 |
| SCH-92 | NYC bias audit | Last audit date + 12 months · T-60, T-30; overdue at T0 (feature blocked for NYC jobs) | `bias_audit.due`, `bias_audit.overdue` | 2.32 | T05 YX-EVAL-32 |
| SCH-93 | PIT pre-clearance window | Pre-clearance valid-to (starter 7 trading days) · T-1 trading day | `pit.preclearance.expiring` | 2.32 | M01 YX-EMP-18 |
| SCH-94 | Re-verification consent | Cycle opened · +7, +14 days until consent; then an HR task | `reverification.consent.due` | 2.32 | M01 YX-EMP-16 |
| SCH-95 | Client compliance pack (tenant as contractor) | Client's pack due date · T-5, T-1; overdue daily from T+1 | `client_pack.due`, `client_pack.overdue` | 2.32 | M13 YX-CLRA-15 |
| SCH-96 | Manager coach week | Company coach day (starter Monday 09:00; frequency weekly / fortnightly / off, company setting) · the P23 coach job builds each manager's nudges, then emits one event per manager | `coach.nudge.sent` | 2.34 | P23 YX-AST-10 / 18 |
| SCH-97 | Tax regime comparison reminder | Declaration window open (M03 tax settings) · window start + 3 days and T-7 before the window closes, only while the employee has not chosen a regime | `tax_regime.compare.reminder_due` | 2.34 | P23 YX-AST-12, M03 YX-TAX-01 |
| SCH-98 | Insurance partner licence expiry | `marketplace_partners` licence expiry (insurance) · T-60, T-30, T-7; at T0 the partner's offer is hidden (`marketplace_partner.licence.expired`) | `marketplace_partner.licence.expiring` | 2.34 | P23 YX-AST-14 |

**Single producer for statutory due dates.** Only SCH-07 creates due-date events: the P04 scheduler reads the P07 compliance calendar for each entity's registrations. M03 does not raise due dates; it emits `statutory.filing.filed`, which marks the calendar item done and stops further reminders (APX-B §3). The per-case accident report and EC items that M08 puts on the same calendar carry the case id; SCH-86 / SCH-87 remind the case team for those items instead of the generic SCH-07 reminder, so each item still has one producer.

---

## 4. WhatsApp / SMS template pack

The pack is every type in §2 with **W**, **W/S** or **S** in its channels. YukthiX writes one template per type × channel × language and submits it (P04 Q2 / Q5): WhatsApp templates under each company's own WhatsApp Business account, SMS templates on YukthiX's DLT registration (or the tenant's own DLT entity).

### 4.1 Groups

| Group | Types | Meta category | DLT content category | Buttons / links |
|---|---|---|---|---|
| **Approvals to managers** | `approval.task.assigned.approver`, `leave.request.submitted.approver`, `expense.claim.submitted.approver`, `roster.swap.consent.colleague` | Utility | Service-Implicit | Quick-reply "Approve" / "Reject" via the P03 one-time link (low-risk types only), URL "Open in app" |
| **Request outcomes** | `approval.request.approved.requester`, `approval.request.approved_with_changes.requester`, `approval.request.rejected.requester`, `approval.request.on_behalf.subject`, `approval.request.decided_on_behalf.subject`, `leave.request.approved.employee`, `leave.request.rejected.employee`, `expense.claim.approved.employee`, `expense.claim.partly_approved.employee`, `expense.claim.rejected.employee`, `trip.approved.employee` | Utility | Service-Implicit | URL "Open in app" |
| **Time** | `attendance.checkin.missing.employee`, `attendance.exception.raised.employee`, `attendance.exception.reminder.employee`, `attendance.cutoff.approaching.employee`, `roster.published.employee`, `roster.shift_changed.employee`, `roster.open_shift.offered.employee`, `roster.open_shift.awarded.employee` | Utility | Service-Implicit | URL "Fix now" / "Open in app" |
| **Pay & documents** | `payslip.published.employee`, `tax.form16.published.employee`, `payment.failed.employee`, `expense.claim.payment_failed.employee`, `tax.declaration.closing.employee`, `tax.proof.closing.employee`, `compliance.due.today.owner`, `signature.requested.signer`, `signature.reminder.signer`, `policy.published.employee`, `policy.ack.reminder.employee`, `report.subscription.delivery.recipient` (link only) | Utility | Service-Implicit | URL "Open in app" |
| **Security & access** | `user.invite.employee`, `security.bank_change.requested.old_contact`, `security.bank_change.applied.employee`, `security.device.revoked.user`, `alumni.access.activated.alumnus`, `nominee.access.granted.nominee`, `fnf.paid.employee`, `case.external_access.party`, `case.anonymous.update.reporter`, `channel.consent.confirmed.recipient`, `channel.consent.withdrawn.recipient` | Utility | Service-Implicit | URL "Sign in" |
| **Pre-boarding** | `preboarding.invite.candidate`, `preboarding.reminder.candidate`, `preboarding.touchpoint.candidate`, `preboarding.joining_date.changed.candidate` | Utility | Service-Implicit | URL "Open portal" |
| **Hiring (candidates)** | `ats.application.received.candidate`, `ats.stage.changed.candidate`, `ats.interview.scheduled.candidate`, `ats.interview.reminder.candidate`, `ats.self_booking.invite.candidate`, `ats.ai_interview.invite.candidate`, `ats.offer.released.candidate`, `ats.offer.revised.candidate`, `ats.offer.expiring.candidate`, `ats.bgv.consent.candidate`, `ats.guardian_consent.guardian` | Utility | Service-Implicit (applicant relationship) | URL "Open portal" |
| **Assessment (candidates)** | `test.invitation.candidate`, `test.slot.booked.candidate`, `test.slot.rescheduled.candidate`, `test.reminder.candidate`, `test.window.closing.candidate`, `test.missed.candidate`, `result.released.candidate`, `appeal.decided.candidate`, `test.admit_card.candidate`, `takehome.deadline.candidate`, `psych.report.released.candidate` | Utility | Service-Implicit | URL "Open test" / "Open portal" |
| **Sites, visitors & contractors** | `visitor.invite.visitor`, `visitor.arrived.host`, `clra.pack.due.contractor_contact` | Utility | Service-Implicit | URL "Show pass" / "Open portal" |
| **OTP** | all of §2.22 | **Authentication** (code + expiry, copy-code button; Meta's fixed wording) | Service-Implicit (OTP) | Copy code |

**Never submitted:** Marketing-category templates. Announcements (`announcement.published.audience`) go on WhatsApp only when the company's Engage mirror sends *key* announcements (M09 Q7); they are submitted as Utility with fixed wording ("You have a new company announcement: {title}. Open the app to read it."). If Meta re-categorises one as Marketing, it is billed as marketing to the company's own account (P04 Q2) and the admin sees the status via `channel.whatsapp.template_status.admin`.

### 4.2 Languages and volume
- **Volume at this draft:** 72 types use WhatsApp and 49 use SMS (OTP types included), so the pack is about **288 WhatsApp templates per company account** and **196 DLT content templates** (× 4 languages). The first submission (before wave 2) covers the Approvals, Request outcomes, Time and OTP groups plus `user.invite.employee` and the two channel-consent types; each other template is submitted before the wave that ships its type.
- Every template exists in **English, Hindi, Tamil and Telugu** (P04 Q4). Rendering falls back tenant default → English (YX-NTF-08); a language whose template is not yet approved falls back the same way, and the send is logged.
- WhatsApp: submitted per company account on connection (P04 Q2), with per-template status shown to the admin.
- SMS: registered once on YukthiX's DLT principal entity with the sender header per tenant brand where the tenant has its own; a tenant with its own DLT entity maps its template IDs in Settings › Notifications.
- New wording requested by a tenant goes through the same submission (P04 Q5) and is usable only once approved; until then the YukthiX default template is used.

### 4.3 Variable rules
1. **Only external-safe variables** (the row's Ext-safe column). No Confidential or Special values ever (YX-NTF-04): no salary, net pay, CTC, bank details, PAN, Aadhaar, health, leave reasons, ratings, case content, test scores.
2. **Personal data minimum:** first name only; no employee codes; no IDs in text (YX-MOB-04 uses names, not IDs).
3. **Links:** signed deep links with an opaque token; never personal data or record IDs in the query string. P03 one-time approval links follow YX-WF-13 (single use, 72 h).
4. **DLT limits:** each `{#var#}` is at most 30 characters; values are truncated with "…" rather than failing. URLs and call-back numbers in SMS templates are whitelisted on DLT.
5. **WhatsApp limits:** variables can't start or end the body and can't be adjacent; each template carries a sample value per variable for Meta review.
6. **Amounts:** only in `expense.claim.submitted.approver` (small-expense limit, P04 §4.5), and in B2B invoices to staffing clients by email (not WhatsApp / SMS).
7. **Dates and times** always carry the recipient's time zone where time matters (T03 YX-DLV-01).

---

## 5. Channel consent (WhatsApp and SMS opt-in)

Meta requires a recorded opt-in before a business sends WhatsApp messages to a person, and TRAI's DLT framework requires consent records for messages outside the service-implicit class. P04 had only opt-out (YX-NTF-11). This section adds the opt-in record (GAP-REGISTER H6) and rule **YX-NTF-14** (P04 §6).

### 5.1 Table `channel_consents` (P04 §5)

| Column | Meaning |
|---|---|
| `organization_id` | Tenant (RLS, P01) |
| `recipient_type`, `recipient_id` | user / employee / candidate / client contact / vendor or contractor contact / visitor / external party |
| `channel` | `whatsapp` / `sms` |
| `address_hash`, `address_masked` | The number the consent is for (hash for matching, masked for display); a new number needs a new consent |
| `scope` | `all_service` (default) or `authentication_only` (a user who picked WhatsApp at an OTP prompt) |
| `source` | `m04_first_run`, `me_settings`, `preboarding_portal`, `candidate_apply`, `candidate_portal`, `kiosk_enrolment`, `hr_recorded_paper` (signed form uploaded to P05), `client_portal`, `vendor_portal` (staffing vendor and contractor portals), `visitor_kiosk`, `otp_prompt`, `whatsapp_inbound` (the person messaged the company's number first), `import` (with evidence) |
| `text_version`, `language` | The exact consent wording shown (versioned, per language) |
| `captured_at`, `captured_by` | Time; self or the proxy who recorded it (HR, kiosk) |
| `evidence` | IP / device / document id / inbound message id |
| `withdrawn_at`, `withdrawal_source` | Time; `stop_keyword`, `me_settings`, `hr`, `provider_callback` (block, DLT opt-out) |

A consent is **active** when `withdrawn_at` is null and the address still matches the recipient's current number. Records are append-only; a re-opt-in is a new row. Consent records are audited (P08) and kept as evidence for the P08 audit period; when a candidate is anonymised (M10 Q6), the masked address and contact link are removed and only the hash, dates and text version remain.

### 5.2 Where consent is captured
- **M04 first run** (after "Choose a language"): "Get work updates on WhatsApp" and "Get work updates by SMS", both **unticked** by default, with the versioned text; also in **Me › Notifications** at any time.
- **Candidate apply / candidate portal** (M10, T03): optional tick-boxes on the application form and in the portal.
- **Pre-boarding portal** (M01): asked on the welcome page, carried into the employee record on joining.
- **Kiosk enrolment or HR-recorded paper form** for workers without the app (M04 Q4, YX-MOB-11): HR records it with the signed form as evidence.
- **Client portal** (M10 Q8), **vendor portal** (M10 YX-ATS-25) and **contractor portal** (M13 YX-CLRA-11): on first sign-in.
- **Visitor kiosk / invite page** (M02 §B11): optional tick-box for messages about future visits; without it the visitor invite goes by email only.
- **OTP prompt:** choosing "Send by WhatsApp" records an `authentication_only` consent.
- **Inbound WhatsApp:** a person who writes to the company's number first may be offered consent in the reply (inside the 24 h window).

### 5.3 Opt-out
- A **STOP** keyword reply (WhatsApp or SMS), the Me toggle, HR on request, or a provider callback (block, DLT opt-out) sets `withdrawn_at`. The engine stops that channel for that address (YX-NTF-11) and sends one confirmation (`channel.consent.withdrawn.recipient`).
- Opting out of WhatsApp or SMS never opts the person out of in-app, push or email.

### 5.4 Sending rule (YX-NTF-14)
1. **W or S only with an active consent** for that channel and address, for types in the §4 pack.
2. **No consent → fallback:** the message goes by in-app + push + email instead (P04 YX-NTF-07 fallback path, logged with reason "no channel consent"). Mandatory and transactional types (e.g. `payslip.published.employee`, `payment.failed.employee`, `security.*`) are never dropped: they fall back the same way.
3. **OTP:** an OTP goes by SMS or WhatsApp authentication template only when the person asked for it on that channel (the request is recorded as an `authentication_only` consent) or has an active consent; otherwise by email where the flow allows it.
4. **Candidates, visitors and external contacts** (client, vendor and contractor contacts) follow the same rule; their messages without consent go by email only.
5. **Kiosk workers without the app or email** need an HR-recorded consent before they get SMS / WhatsApp about proxy requests (YX-MOB-11); until then they see the kiosk banner only.
