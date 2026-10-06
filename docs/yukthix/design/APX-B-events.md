# Appendix B · Domain event catalogue

> **Status:** 📋 Draft catalogue, 26 Sep 2026. Closes GAP-REGISTER **F2** (event catalogue). **Extended 26 Sep 2026** with the events of the gap-register features (M01–M07, M10, M12, M13, P14, P17, P18, T03, T05–T08; §2, §3 #13). **P16 follow-up 26 Sep 2026:** partner events (§2.27). **P19 follow-up 26 Sep 2026:** policy rule and automation events (§2.28). **Corrected 28 Sep 2026 (validation pass 3, C1 / C2):** consumers and payloads updated for the Labour Codes (automatic F&F off-cycle run, M03 YX-PAY-48) and the Income-tax Act 2025 forms — Form 130 (was Form 16), Form 131 (was Form 16A), Form 138 (was 24Q), Form 140 (was 26Q); event keys unchanged; no events added. **Validation pass 3 Musts follow-up 28 Sep 2026:** 64 events for workplace accidents, statutory corrections and revised certificates, migration arrears, the identity chain, the person record, trials, platform status and export billing (§2.29–2.33), including the scheduler events of APX-A SCH-80…87. **P22 follow-up 28 Sep 2026:** 19 workflow, service-identity and agent-plan events (§2.35). **P23 follow-up 28 Sep 2026:** 23 employee and manager assistant and marketplace events (§2.36), including the scheduler events of APX-A SCH-97 / 98.
> **Purpose:** the one list of every domain event YukthiX emits: key, version, producer, payload, sensitivity, consumers, public-webhook flag and wave. It is the content of the P11 `event_catalogue` table and the source of the public webhook list (P11 Q5).
> **How to use:**
> - Every event a module emits must be listed here; every subscription (notification, handler, webhook) must name a listed event. CI enforces both (§4).
> - Notification types are in [Appendix A](APX-A-notifications.md); the **Consumers** column below names the P04 types each event triggers, followed by the other consumers.
> - Where this appendix and a module's "Events emitted" line differ, **this appendix wins** until the module doc is updated (§3 lists the known differences).
>
> **Builds on:** P04 (outbox, YX-NTF-01), P11 (webhooks, YX-API-09 / 10, versioning Q3), P02 (sensitivity classes), APX-A (notification types, scheduler rules `SCH-nn`).

---

## 1. Conventions

| Topic | Convention |
|---|---|
| **Key** | `domain.entity.verb`, lower case, dots between segments, underscores inside a segment: `leave.request.approved`, `employee.probation.review_due`. Past tense for things that happened (`approved`, `published`); state words for scheduler events (`expiring`, `due`, `overdue`). One key per business fact: no aliases. |
| **Version** | Integer, starting at 1. Adding an optional payload field keeps the version. Removing or renaming a field, or changing its meaning, creates version N+1; both versions are emitted side by side for the P11 notice period (12 months, P11 Q3). Subscribers and webhooks pin a version. |
| **Envelope** | Every event carries `event_id` (UUID, the idempotency key), `type`, `version`, `occurred_at`, `organization_id`, `legal_entity_id` (when there is one), `actor` (user / key / system job), `subject` (entity type + id) and `payload`. |
| **Emission** | Written to `event_outbox` in the **same transaction** as the business change and published **after commit** (YX-NTF-01); never emitted for a rolled-back change. Delivery to consumers is at-least-once; every consumer is idempotent on `event_id`. |
| **Scheduler events** | Producer "P04 scheduler (SCH-nn)": the time-based rules of APX-A §3 raise ordinary events, once per subject × rule × offset (idempotency key), in the subject's time zone. |
| **Sensitivity** | The **highest P02 class** of any field in the internal payload: Public · Internal · Personal · Confidential · Special. "Per document type" = the class of the P05 document type. Internal payloads carry IDs and labels; they never carry Confidential values that the consumer can read from the source (amounts, bank data, scores). |
| **Thin payload** | Public webhooks for **Confidential** or **Special** events carry **IDs and change type only**; the receiver fetches details through the API with a properly scoped key (YX-API-10). Marked "Yes (thin)" below. |
| **Public webhook** | "Yes" = the event is in the public P11 catalogue and can be subscribed to by a tenant's webhook endpoint (YX-API-09 signing, retries, replay). "No" = internal only. Special-class events are public only as thin payloads, and case (M08) events are never public. |
| **Wave** | Build wave of the producer (spec §4). **Proc** = Proctoring product (live exam app; T-doc build order). **P12 / P14** = producer is a proposed doc (GAP A1 / A4); the wave is set when that doc is decided. |
| **P09** | P09 metrics consume events for snapshots and counts. An event whose only consumer is P09 is marked **metrics-only**. |

**Retired key:** `employee.assignment.effective` (P01 §7) is the same fact as P06's `employee.change.effective` and is not emitted; consumers subscribe to `employee.change.effective`. `statutory.filing.due` (M03 §6) is not emitted; due dates come only from `compliance.due.upcoming` (§3).

---

## 2. Catalogue

Columns: **Event** · **v** (version) · **Producer** · **Payload** (beyond the envelope) · **Sens.** · **Consumers** (P04 types from APX-A, then other consumers) · **Webhook** · **Wave**.

**Count:** 662 event rows (343 + 83 added 26 Sep 2026 for the gap-register features, §2.9–2.26 and §3 #13; + 12 partner events, §2.27, P16 follow-up 26 Sep 2026; + 10 policy rule and automation events, §2.28, P19 follow-up 26 Sep 2026; + 64 events for the validation pass 3 Musts, §2.29–2.33, 28 Sep 2026; + 108 events for the validation pass 3 Shoulds, §2.34, 28 Sep 2026 (46 for hiring, staffing and growth); + 19 workflow, service-identity and agent-plan events, §2.35, P22, 28 Sep 2026; + 23 employee and manager assistant and marketplace events, §2.36, P23, 28 Sep 2026); the `custom.<api_name>.*` family counts as one row.

### 2.1 Organisation, people & dated changes (P01, P06)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `org.master.changed` | 1 | P01 §7 | master type, id, change (created / archived / moved) | Internal | P02 (scope and grant recompute); P09 | Yes | W1 |
| `employee.hired` | 1 | P01 §7 (M01 direct entry, import, M10 hand-off) | employee_id, employment_id, joining date, source (offer / direct / import), person type (new / rehire / internal / contractor) | Internal | P04: `employee.hired.manager`; M01 (journey start); M10 (candidate linked to employee); P09 | Yes | W1 |
| `employee.joined` | 1 | M01 §3.5 (joining date / "Mark joined") | employee_id, employment_id, joined_on | Internal | P04: `celebration.new_joiner.team`; P02 (user account, implicit grants); P10 (SSO / SCIM provisioning); M07 (joiner assignment rules); M08 (joiner policy tasks, YX-POL-03); M09 (space membership; SCH-58 anchor); P14 (metering starts); P09 | Yes | W1 |
| `employee.change.effective` | 1 | P06 §4.3 (applied now, or by SCH-17) | change_id, change type, effective date, names of facts changed (never Confidential values), `affects_compensation` flag | Internal | P04: `employee.change.effective.employee`, `employee.change.effective.manager`; P02 (implicit grants recompute, YX-SEC-04); M02 (holiday calendar, shift, leave policy); M06 (manager change → owner transfer, YX-PERF-13); M07 (role-change assignment rules); M09 (space membership, YX-ENG-01); P09 | Yes | W1 |
| `employee.change.cancelled` | 1 | P06 Q7 | change_id, reason | Internal | P04: `employee.change.cancelled.approver` | No | W1 |
| `employment.opened` | 1 | P01 §7 | employment_id, employee_id, legal entity, linked transfer / rehire id | Internal | P04: `transfer.continuity.pending.payroll`; M01 (continuity checklist, YX-EMP-08); M03 (Form 12B carry-over, YTD per PAN × TAN × FY); M02 (leave-ledger transfer in); P09 | Yes | W1 |
| `employment.closed` | 1 | P01 §7 | employment_id, closed_on, reason (transfer / restructure) | Internal | M02 (leave-ledger transfer out); M03 (settlement option per YX-ORG-17); P09 | Yes | W1 |
| `org.restructure.completed` | 1 | P01 YX-ORG-22 | restructure id, source / target entities, counts | Internal | P04: `org.restructure.completed.hr`; P09 | No | W4 |

### 2.2 Security, access & privacy (P02, M04; proposed P12)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `user.invited` | 1 | P02 / M04 §6 first run | user_id, channels used | Personal | P04: `user.invite.employee` | No | W1 |
| `auth.otp.requested` | 1 | P02 §4.7, M04 Q2, P05 §4.4, M08 Q6, T03 Q4 | login or user id, purpose, channel requested, expiry; the code travels in a sealed field with a minutes-long TTL, never logged | Confidential | P04: `otp.login.user`, `otp.external_login.user`, `otp.esign.signer`, `otp.policy_ack.employee`, `otp.test_resume.candidate`, `otp.assistant_confirm.employee`, `otp.step_up.user`; P14 (SMS quota metering, YX-NTF-13) | No | W1 |
| `security.bank_change.requested` | 1 | P02 §4.5 | employee_id, request id (no account data) | Confidential | P04: `security.bank_change.requested.old_contact` | No | W1 |
| `security.bank_change.applied` | 1 | P02 §4.5, YX-SEC-25 | employee_id, effective date, cooling-period waived flag | Confidential | P04: `security.bank_change.applied.employee`; M03 (account used by the next bank file; "bank failure" holds released); P09 | Yes (thin) | W1 |
| `security.identity.changed` | 1 | P02 YX-SEC-13 | employee_id, field name (PAN / legal name / statutory address) | Confidential | P04: `security.identity.changed.employee`; P10 (re-verification); M03 (PAN status for TDS); P09 | Yes (thin) | W1 |
| `security.role.granted` | 1 | P02 §4.2 | grant id, user, role, scope, granted_by, includes Confidential flag | Internal | P04: `security.role.self_granted.admins`; P09 | No | W1 |
| `security.role.saved` | 1 | P02 YX-SEC-18 | role id, warnings overridden | Internal | P04: `security.role.risk_override.admins` | No | W1 |
| `security.support_session.started` | 1 | P02 YX-SEC-20 | session id, window, reason | Internal | P04: `security.support_session.started.admins` | No | W1 |
| `security.support_session.ended` | 1 | P02 YX-SEC-20 | session id, ended_by (expiry / admin) | Internal | P04: `security.support_session.ended.admins` | No | W1 |
| `security.grant.expiring` | 1 | P04 scheduler SCH-08 | grant id, holder, end date | Internal | P04: `security.grant.expiring.holder` | No | W1 |
| `security.device.revoked` | 1 | M04 YX-MOB-09 | user, device id, revoked_by | Internal | P04: `security.device.revoked.user`; M04 (sessions and push tokens dropped); P04 (push endpoint removed) | No | W2 |
| `device.bound` | 1 | M04 Q3 | user, device id, approved_by | Internal | P04: `security.device.bound.employee`; M02 (check-in binding, YX-MOB-08) | No | W2 |
| `security.login.new_device` | 1 | P12 (proposed, GAP A1) | user, device type, city | Personal | P04: `security.login.new_device.user` | No | P12 |
| `security.credentials.changed` | 1 | P12 (proposed, GAP A1) | user, what changed (password / MFA / passkey) | Internal | P04: `security.credentials.changed.user` | No | P12 |
| `privacy.export.ready` | 1 | P02 §6 | request id, file id, expires | Personal | P04: `privacy.export.ready.requester` | No | W1 |
| `privacy.erasure.completed` | 1 | P02 §6, T05 YX-EVAL-10 | subject type, request id, data classes erased | Personal | P04: `privacy.erasure.completed.subject`; P09 | No | W1 |

### 2.3 Approvals (P03)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `approval.request.submitted` | 1 | P03 §4 | request id, request type, subject employee, raised_by (proxy), policy id | Internal | P04: `approval.request.on_behalf.subject`; P09 (turnaround) | Yes | W1 |
| `approval.task.assigned` | 1 | P03 §4.3 | task id, request id, assignee, on_behalf_of, step, due_at, risk level | Internal | P04: `approval.task.assigned.approver`, `approval.task.fallback.hr`, `roster.swap.consent.colleague`, `payroll.run.submitted.approver`; P09 | No | W1 |
| `approval.task.reminder` | 1 | P03 SLA timer (SCH-01) | task id, % of SLA elapsed | Internal | P04: `approval.task.reminder.approver`, `perf.stage.reminder.owner` | No | W1 |
| `approval.task.escalated` | 1 | P03 SLA timer (SCH-01) | task id, escalated_to | Internal | P04: `approval.task.escalated.escalatee`, `approval.task.escalated.approver`, `perf.stage.escalated.manager`; P09 | No | W1 |
| `approval.task.reassigned` | 1 | P03 YX-WF-06 | task id, from, to, reason | Internal | P04: `approval.task.reassigned.approver` | No | W1 |
| `approval.request.approved` | 1 | P03 §4.5 | request id, final flag, changes flag, decided_by, on_behalf_of, channel | Internal | P04: `approval.request.approved.requester`, `approval.request.approved_with_changes.requester`, `approval.request.decided_on_behalf.subject`, `security.self_approval.owner`; P09 (the request type's effect runs in the same transaction, YX-WF-10, not via this event) | Yes | W1 |
| `approval.request.rejected` | 1 | P03 §4.5 | request id, decided_by, channel | Internal | P04: `approval.request.rejected.requester`, `approval.request.decided_on_behalf.subject`; P09 | Yes | W1 |
| `approval.request.sent_back` | 1 | P03 Q7 | request id, step | Internal | P04: `approval.request.sent_back.requester`; P09 | No | W1 |
| `approval.request.withdrawn` | 1 | P03 §4.5 | request id | Internal | P04: `approval.request.withdrawn.approver`; P09 | Yes | W1 |
| `approval.request.cancelled` | 1 | P03 §4.5 | request id, cancellation request id | Internal | P04: `approval.request.cancelled.approver`; P09 | Yes | W1 |
| `approval.request.auto_actioned` | 1 | P03 Q2 | request id, action, rule | Internal | P04: `approval.request.auto_actioned.requester`; P09 | No | W1 |
| `approval.request.question_asked` | 1 | P03 §4.5 | request id, asked_by | Internal | P04: `approval.request.question.requester` | No | W1 |
| `approval.request.question_answered` | 1 | P03 §4.5 | request id | Internal | P04: `approval.request.answered.approver` | No | W1 |
| `approval.delegation.started` | 1 | P03 Q3 (manual, or on `leave.request.approved`) | delegator, delegate, dates, request types | Internal | P04: `approval.delegation.started.delegate` | No | W1 |

### 2.4 Notifications, announcements & channels (P04)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `announcement.published` | 1 | P04 §4.8 | post id, audience rule, channels, acknowledgement required | Internal | P04: `announcement.published.audience`; M09 (feed, wave 5); P10 (Teams / Slack mirror, M09 Q7) | Yes | W1 |
| `announcement.ack_due` | 1 | P04 scheduler SCH-09 | post id, pending count | Internal | P04: `announcement.ack.reminder.audience` | No | W1 |
| `notification.delivery.failed` | 1 | P04 channel adapters (YX-NTF-10) | delivery id, channel, error class | Internal | P04: `channel.delivery.failures.admin`; P09 | No | W1 |
| `channel.address.opted_out` | 1 | P04 provider callbacks (YX-NTF-11) | recipient, channel, masked address | Personal | P04: `channel.address.disabled.user`; P04 (address status; consent withdrawn, APX-A §5) | No | W1 |
| `channel.consent.recorded` | 1 | P04 (APX-A §5) | consent id, recipient, channel, source, text version | Personal | P04: `channel.consent.confirmed.recipient`; P09 | No | W2 |
| `channel.consent.withdrawn` | 1 | P04 (APX-A §5) | consent id, withdrawal source | Personal | P04: `channel.consent.withdrawn.recipient`; P09 | No | W2 |
| `channel.whatsapp.template.status_changed` | 1 | P04 (BSP callback) | template, language, status, reason | Internal | P04: `channel.whatsapp.template_status.admin` | No | W2 |
| `channel.whatsapp.account.status_changed` | 1 | P04 (BSP callback) | status, quality rating | Internal | P04: `channel.whatsapp.account_status.admin` | No | W2 |
| `channel.usage.threshold_reached` | 1 | P04 metering (SCH-13) | channel, % used, cap | Internal | P04: `billing.sms.cap_nearing.admin`, `billing.sms.cap_reached.admin`; P14 (billing meter) | No | W2 |

### 2.5 Documents, letters & e-sign (P05)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `document.uploaded` | 1 | P05 §4.2 | document id, type, owner, version | Per document type | P04: `document.verification.pending.hr`; P10 (automatic PAN / penny-drop check, Q6); P09 | No | W1 |
| `document.upload.requested` | 1 | P05 §4.6 | document type, employees | Internal | P04: `document.upload_requested.employee` | No | W1 |
| `document.verified` | 1 | P05 §4.2 | document id, type, verified_by (partner / HR) | Per document type | P04: `document.verified.owner`; M03 (payroll pre-flight, YX-DOC-17); M01 (onboarding task closed); P09 | No | W1 |
| `document.rejected` | 1 | P05 §4.2 | document id, type | Per document type | P04: `document.rejected.owner`; M01 (onboarding task reopened); P09 | No | W1 |
| `document.quarantined` | 1 | P05 YX-DOC-02 | file id, uploader | Internal | P04: `document.quarantined.uploader` | No | W1 |
| `document.expiring` | 1 | P04 scheduler SCH-02 | document id, type, expires_on, days left | Internal | P04: `document.expiring.owner`, `document.expiring.hr`; P09 | No | W1 |
| `document.expired` | 1 | P04 scheduler SCH-02 (P05 status job) | document id, type, expired_on | Internal | P04: `document.expired.owner`, `document.expired.hr`; M03 (pre-flight when the type is payroll-required); P09 | Yes | W1 |
| `document.issued` | 1 | P05 §4.3 | document id, letter / document type, subject, reference no. | Per document type | P04: `document.issued.employee`, `tax.form16.published.employee`, `celebration.promotion.team`; **M09** (promotion letter → celebration, M09 Q5); M10 (offer letter linked to the offer); M01 (probation / exit letters recorded on the case); P09 | Yes (thin) | W1 |
| `document.superseded` | 1 | P05 YX-DOC-09 | old id, new id | Per document type | M10 (superseded offer can't be accepted, YX-ATS-17); P09 | Yes (thin) | W1 |
| `letter.bulk_issue.completed` | 1 | P05 §4.3 | batch id, issued / failed counts | Internal | P04: `letter.bulk_issue.completed.issuer` | No | W1 |
| `signature.requested` | 1 | P05 §4.4 | request id, document id, signer, method, sign-by | Internal | P04: `signature.requested.signer` | No | W1 |
| `signature.pending` | 1 | P04 scheduler SCH-03 | request id, days left | Internal | P04: `signature.reminder.signer` | No | W1 |
| `signature.completed` | 1 | P05 YX-DOC-12 | request id, document id, signer, method | Internal | P04: `signature.completed.issuer`; M10 (offer e-accept → `ats.offer.accepted`); M01 (appointment / pre-boarding item done); M07 (training bond accepted); M03 (overpayment instalment consent, YX-PAY-30); M08 (critical-policy acknowledgement); P09 | Yes | W1 |
| `signature.declined` | 1 | P05 §4.4 | request id, reason code | Internal | P04: `signature.declined.issuer`; M10 (offer decline path) | No | W1 |
| `retention.deletion.upcoming` | 1 | P04 scheduler SCH-05 (retention policies of P05, T05, M10, P08) | data class, count, deletion date, subject ids for candidate notices | Internal | P04: `retention.deletion.upcoming.admin`, `privacy.retention_expiring.candidate` | No | W1 |
| `nominee.access.granted` | 1 | P05 YX-DOC-19 | exit case id, nominee | Personal | P04: `nominee.access.granted.nominee`; P02 (nominee login grant) | No | W4 |
| `alumni.access.expiring` | 1 | P04 scheduler SCH-04 | user, end date | Personal | P04: `alumni.access.expiring.alumnus` | No | W4 |

### 2.6 Statutory rules & compliance calendar (P07)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `statutory.rule.published` | 1 | P07 §4.3 (YukthiX console) | rule set id, statute, jurisdiction, valid_from, version, retro flag, impacted-tenant count | Public | P04: `statutory.rule.published.admins`; M03 (retro → arrears proposal, YX-STAT-07); P09 | No | W1 |
| `statutory.rule.effective_soon` | 1 | P04 scheduler SCH-06 | rule set id, effective date | Public | P04: `statutory.rule.effective_soon.admins` | No | W1 |
| `statutory.rule.effective` | 1 | P07 (on the effective date) | rule set id, statute, jurisdiction | Public | M03 (new version used from that period); M02 (statutory leave and OT caps) | No | W1 |
| `statutory.arrears.proposed` | 1 | P07 Q4 (for M03) | proposal id, entity, periods, employee count | Confidential | P04: `statutory.arrears.proposed.payroll`; M03 (accepted into the next run) | No | W3 |
| `compliance.due.upcoming` | 1 | **P04 scheduler SCH-07** from P07 `calendar_rules` × entity registrations (the only producer of statutory due dates) | item id, entity, statute / form, period, due date, days left, owner role | Internal | P04: `compliance.due.upcoming.owner`, `compliance.due.today.owner`; M03 (statutory hub due-date strip); M08 (POSH annual-report card); P09 | Yes | W3 |
| `compliance.due.overdue` | 1 | P04 scheduler SCH-07 | item id, entity, statute / form, days overdue | Internal | P04: `compliance.overdue.owner`; P09 | Yes | W3 |

### 2.7 Period locks & audit (P08)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `period.frozen` | 1 | P08 §A3 | entity, period type, period, cut-off | Internal | M02 (late-request banner on apply sheets); M03 (inputs frozen); P09 | No | W2 |
| `period.locked` | 1 | P08 YX-LOCK-04 (on payroll approval) | entity, pay group, period | Internal | M02 (attendance and pay-affecting leave locked); M05 (paid claims in that month locked, YX-EXP-12); P09 | Yes | W3 |
| `period.reopened` | 1 | P08 §A4 | entity, period, reason, approvers | Internal | P04: `period.reopened.admins`; M03 (new payslip versions, YX-LOCK-06); M02 (dates editable again) | No | W3 |
| `audit.chain.verification_failed` | 1 | P08 daily job (SCH-14) | tenant, date, first broken row | Internal | P04: `audit.chain.failed.admins`; YukthiX security on-call (P13) | No | W1 |

### 2.8 Analytics, integrations, AI & API (P09, P10, P11)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `report.prepared.ready` | 1 | P09 §4.1 | result id, requested_by, expires | Internal | P04: `report.ready.requester` | No | W2 |
| `report.subscription.due` | 1 | P04 scheduler SCH-15 | subscription id | Internal | P04: `report.subscription.delivery.recipient`; P09 (renders a permission-filtered copy per recipient) | No | W2 |
| `report.subscription.failed` | 1 | P09 §4.6 | subscription id, error | Internal | P04: `report.subscription.failed.owner` | No | W2 |
| `integration.connection.failed` | 1 | P10 §B2 | connection id, connector type, error class | Internal | P04: `integration.connection.failed.owner`; P09 | No | W1 |
| `integration.connection.restored` | 1 | P10 §B2 | connection id | Internal | P04: `integration.connection.restored.owner`; P09 | No | W1 |
| `integration.device.offline` | 1 | P04 scheduler SCH-12 (P10 device heartbeat) | device id, location, last seen | Internal | P04: `integration.device.offline.owner` | No | W2 |
| `integration.token.expiring` | 1 | P04 scheduler SCH-10 | connection id, expiry | Internal | P04: `integration.token.expiring.owner` | No | W2 |
| `verification.check.completed` | 1 | P10 Q6 (PAN, PAN operative status, bank penny-drop) | check id, type, subject, result (pass / fail / name mismatch / inoperative) | Confidential | P04: `verification.check.failed.hr`, `tax.pan.inoperative.payroll`, `tax.pan.inoperative.employee`; P05 (document marked verified); M03 (pre-run PAN status, YX-TAX-10; expedited bank change, YX-SEC-25); P09 | No | W3 |
| `ai.credits.threshold_reached` | 1 | P10 metering (SCH-13) | % used, plan limit | Internal | P04: `billing.ai_credits.nearing.admin`, `billing.ai_credits.exhausted.admin`; P14 (billing) | No | W1 |
| `api.key.expiring` | 1 | P04 scheduler SCH-11 | key id, owner, expires_at | Internal | P04: `api.key.expiring.owner` | No | W1 |
| `api.key.expired` | 1 | P04 scheduler SCH-11 | key id, owner | Internal | P04: `api.key.expired.owner` | No | W1 |
| `api.oauth.grant.created` | 1 | P11 Q4 | app id, scopes, granted_by | Internal | P04: `api.oauth.app_connected.admins`; P09 | No | W3 |
| `webhook.endpoint.failing` | 1 | P11 YX-API-09 | endpoint id, consecutive failures | Internal | P04: `webhook.endpoint.failing.admin` | No | W1 |
| `webhook.endpoint.disabled` | 1 | P11 YX-API-09 | endpoint id | Internal | P04: `webhook.endpoint.disabled.admin` | No | W1 |
| `api.route.deprecated` | 1 | P11 YX-API-13 (release process) | route, sunset date, tenants using it | Public | P04: `api.route.deprecated.admin` | No | W3 |
| `api.usage.threshold_reached` | 1 | P11 metering (SCH-13) | key or tenant, % of fair-use limit | Internal | P04: `billing.api_limit.nearing.admin`; P14 (limits add-on) | No | W3 |

### 2.9 Billing & account (proposed P14)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `billing.invoice.issued` | 1 | P14 (proposed, GAP A4) | invoice id, amount, due date | Internal | P04: `billing.invoice.issued.billing`; P09 | No | P14 |
| `billing.payment.received` | 1 | P14 (proposed) | invoice id, amount | Internal | P04: `billing.payment.received.billing`; P09 | No | P14 |
| `billing.payment.failed` | 1 | P14 (proposed) | invoice id, retry date, attempt | Internal | P04: `billing.payment.failed.billing`; P09 | No | P14 |
| `billing.subscription.suspended` | 1 | P14 (proposed) | subscription id, reason | Internal | P04: `billing.subscription.suspended.admins`; P02 (read-only mode) | No | P14 |
| `billing.trial.ending` | 1 | P04 scheduler SCH-16 | trial end | Internal | P04: `billing.trial.ending.admin` | No | P14 |
| `billing.grace.ending` | 1 | P04 scheduler SCH-16 | suspension date | Internal | P04: `billing.grace.ending.billing` | No | P14 |
| `tenant.export.ready` | 1 | P14 (proposed) | export id, file id, expires | Internal | P04: `tenant.export.ready.admin` | No | P14 |
| `cs.message.published` | 1 | P14 flow 6 (C8; second-person approved) | message id, audience rule, locale, schedule | Internal | P04: `cs.message.admin` | No | P14 |
| `tenant.health.churn_risk_raised` | 1 | P14 YX-CONSOLE-05 (nightly tenant-health job) | tenant id, churn band, score change, `cs_alerts` id | Internal | P04: `cs.churn_risk.cs_owner`; P09 | No | P14 |

### 2.10 Core HR & lifecycle (M01)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `preboarding.started` | 1 | M01 §3.5 | preboarding id, candidate, employee id, joining date, batch | Personal | P04: `preboarding.invite.candidate`; P09 | No | W4 |
| `preboarding.items.pending` | 1 | P04 scheduler SCH-18 | preboarding id, pending count, days to joining | Personal | P04: `preboarding.reminder.candidate` | No | W4 |
| `preboarding.touchpoint.due` | 1 | P04 scheduler SCH-19 | preboarding id, touchpoint id | Internal | P04: `preboarding.touchpoint.candidate` | No | W4 |
| `preboarding.joining_date.changed` | 1 | M01 YX-LC-13 | preboarding id, old / new date | Internal | P04: `preboarding.joining_date.changed.candidate`, `preboarding.joining_date.changed.manager`; M01 (journey re-anchored); M10 (offer joining date); P09 | No | W4 |
| `preboarding.completed` | 1 | M01 §3.5 | preboarding id | Internal | P04: `preboarding.completed.hr`; P09 | No | W4 |
| `preboarding.cancelled` | 1 | M01 YX-LC-12 | preboarding id, outcome (did_not_join / reneged / withdrawn), reason code | Internal | P04: `preboarding.cancelled.recruiter`; M10 (requisition reopened, plan line released, candidate marked reneged); P09 | Yes | W4 |
| `employee.joining_due` | 1 | P04 scheduler SCH-20 | employee id, joining date | Internal | P04: `employee.joining_tomorrow.manager` | No | W4 |
| `journey.task.assigned` | 1 | M01 journey engine | task id, journey id, owner, due | Internal | P04: `journey.task.assigned.owner` | No | W4 |
| `journey.task.due` | 1 | P04 scheduler SCH-21 | task id, due | Internal | P04: `journey.task.due.owner` | No | W4 |
| `journey.task.overdue` | 1 | P04 scheduler SCH-21 | task id, days overdue | Internal | P04: `journey.task.overdue.escalation`; P09 | No | W4 |
| `employee.probation.review_due` | 1 | P04 scheduler SCH-22 | probation id, employee, planned end, days left | Internal | P04: `probation.review.due.manager`, `probation.review.reminder.manager`; M06 (from wave 5: review created from the probation template) | No | W4 |
| `employee.probation.overdue` | 1 | P04 scheduler SCH-22 | probation id, planned end | Internal | P04: `probation.review.overdue.hr`; P09 | No | W4 |
| `employee.probation.confirmed` | 1 | M01 §3.4 | probation id, employee, confirmed_on | Internal | P04: `probation.confirmed.employee`; P05 (confirmation letter); M02 (leave eligibility, dated); P09 | Yes | W4 |
| `employee.probation.extended` | 1 | M01 §3.4 | probation id, new end date | Internal | P04: `probation.extended.employee`; P05 (extension letter); P09 | Yes | W4 |
| `employee.probation.terminated` | 1 | M01 §3.4 | probation id, employee | Internal | M01 (exit case of type probation termination); P09 | No | W4 |
| `employee.absence.started` | 1 | M01 YX-EMP-06 | employment id, absence type, valid_from, expected return | Special | M02 (expected status D10, accrual YX-LV-11); M03 (pay effect, PF NCP days); P09 | No | W4 |
| `employee.absence.return_due` | 1 | P04 scheduler SCH-25 | employment id, expected return (absence type omitted) | Internal | P04: `absence.return_due.manager` | No | W4 |
| `employee.absence.ended` | 1 | M01 YX-EMP-06 | employment id, returned_on | Internal | M01 (return-to-work journey); M02; M03; P09 | No | W4 |
| `employee.retirement.approaching` | 1 | P04 scheduler SCH-24 | employment id, retirement date, months left | Internal | P04: `retirement.approaching.hr`, `retirement.approaching.employee`; M01 (at the last lead time, opens a retirement exit case) | No | W4 |
| `employment.contract_ending` | 1 | P04 scheduler SCH-23 | employment id, contract_end_on, days left, policy action | Internal | P04: `contract.ending.hr`, `contract.ending.employee`; M01 (auto-exit at T0 when the policy says so) | No | W4 |
| `employee.gratuity.eligible` | 1 | P04 scheduler SCH-29 | employment id, eligible_on | Internal | P04: `gratuity.eligible.payroll`; M03 (gratuity payability); P09 | No | W3 |
| `asset.assigned` | 1 | M01 §3.6 | assignment id, asset type, employee | Internal | P04: `asset.assigned.employee`; P05 (acknowledgement request); P09 | Yes | W4 |
| `asset.return_due` | 1 | P04 scheduler SCH-27 | employment id, asset count, return-by | Internal | P04: `asset.return_due.employee`, `asset.return_overdue.admin` | No | W4 |
| `asset.returned` | 1 | M01 §3.6 | assignment id, condition | Internal | M01 (clearance item closed; F&F recovery line removed); P09 | Yes | W4 |
| `exit.case.opened` | 1 | M01 §3.7 | exit case id, employment, exit type, requested LWD, open-case flag (boolean only) | Confidential | P04: `exit.case.opened.hr`, `exit.precheck.flagged.hr`; P09 | Yes (thin) | W4 |
| `exit.case.accepted` | 1 | M01 Q6 | exit case id, exit type, approved LWD, backfill_requested | Confidential | P04: `exit.case.accepted.employee`; M01 (offboarding journey; SCH-26 / 27 / 28 anchors); M09 (exit survey, SCH-58); M03 (F&F off-cycle run created, 2-working-day deadline, YX-PAY-48); M10 (replacement requisition when backfill requested, YX-LC-15; clawback check → `ats.bonus.clawback`); P09 | Yes (thin) | W4 |
| `exit.case.withdrawn` | 1 | M01 Q6 | exit case id | Confidential | P04: `exit.case.withdrawn.stakeholders`; M01 (journey cancelled); M10 (replacement requisition cancelled); P09 | Yes (thin) | W4 |
| `exit.lwd.changed` | 1 | M01 YX-LC-21 | exit case id, old / new LWD | Confidential | P04: `exit.lwd.changed.employee`; M01 (anchors re-set); M03 (F&F notice-shortfall line) | No | W4 |
| `employment.lwd_approaching` | 1 | P04 scheduler SCH-26 | employment id, LWD, days left | Internal | P04: `exit.lwd.approaching.employee`, `exit.lwd.approaching.manager`; "At LWD" handlers (M01 D6): P03 (pending approvals reassigned); T04 / T05 (proctor shifts, evaluator queues unassigned); M07 (enrolments cancelled, seats released); M08 (tickets and queue membership reassigned); M06 (goals, reviews, PIPs transferred); M10 (requisitions reassigned); M01 assets (clearance) | No | W4 |
| `employment.exited` | 1 | M01 §3.7 (P01 §7), end of the LWD | employment id, employee id, LWD, exit type code | Confidential | P04: `alumni.access.activated.alumnus`, `ats.requisition.reassigned.owner`; T+0 / T+N handlers (M01 D6): P02 (alumni conversion, grants end); M04 (devices, push tokens, sessions, kiosk PIN); P10 (biometric enrolments, face template, calendar OAuth); P11 (user API keys, OAuth grants); P03 (delegations); M08 (case memberships, IC seat, IC validity re-check); M09 (spaces); M05 (open claims and advances into F&F); M10 (headcount line at T+N, requisitions); P05 (alumni access, YX-DOC-16); P14 (metering stops); P09 | Yes (thin) | W4 |
| `exit.deprovisioning.failed` | 1 | M01 YX-LC-14 | exit case id, module, action, attempts | Internal | P04: `exit.deprovisioning.failed.hr` | No | W4 |
| `fnf.due` | 1 | P04 scheduler SCH-28 | fnf id, deadline | Confidential | P04: `fnf.due.payroll` | No | W4 |
| `fnf.overdue` | 1 | P04 scheduler SCH-28 | fnf id, days overdue | Confidential | P04: `fnf.overdue.payroll`; P09 | No | W4 |
| `fnf.approved` | 1 | M01 Q7 (P03 approval) | fnf id, exit case, off-cycle run id, payee count | Confidential | M03 (payment in the off-cycle bank file / payout); M05 (advances and claims settled via F&F); M07 (bond recovery closed); P09 | Yes (thin) | W4 |
| `fnf.paid` | 1 | M01 (from M03 payment status) | fnf id, paid_on | Confidential | P04: `fnf.paid.employee`; P05 (F&F statement letter to the vault); M01 (held letters released); P09 | Yes (thin) | W4 |
| `absconding.step.reached` | 1 | P04 scheduler SCH-30 (M01 timeline) | timeline id, employment, step (hold / notice 1 / notice 2 / deemed abandonment), day | Confidential | P04: `absconding.alert.manager`, `absconding.notice.employee`, `absconding.abandonment.hr`; M03 (salary hold, reason absconding, YX-PAY-28); P05 (notice letters); M02 (expected status "absconding", D10); M01 (exit case at deemed abandonment) | No | W4 |
| `position.changed` | 1 | M01 YX-EMP-09 (P03 position request applied) | position id, entity, change (created / regraded / frozen / closed), effective date | Internal | M10 (plan line and linked requisition kept in step); P17 (index); P09 (positions, vacancies, budgeted cost) | Yes | W5 |
| `position.vacated` | 1 | M01 YX-EMP-09 (incumbent's exit or transfer) | position id, entity, previous employment id | Internal | P04: `position.vacant.hr`; M10 ("Open requisition" on the vacant position, plan line); P09 | Yes | W5 |
| `workforce.scenario.approved` | 1 | M01 YX-EMP-10 (P03) | scenario id, positions created, plan lines created (costs never in the payload) | Confidential | P04: `workforce.scenario.approved.owner`; M10 (headcount-plan lines); P09 | No | W5 |

### 2.11 Leave & attendance (M02, M04 kiosk)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `leave.request.submitted` | 1 | M02 §A2 | request id, employee, leave type, dates, days, half-day flags, attachment status (never the file) | Internal | P04: `leave.request.submitted.approver`; P09 | Yes | W2 |
| `leave.request.approved` | 1 | M02 (P03 effect) | request id, employee, leave type, dates | Internal | P04: `leave.request.approved.employee`; **P10** (calendar out-of-office); **P03** (automatic delegation while away, Q3); M02 day engine (expected status); P09 | Yes | W2 |
| `leave.request.rejected` | 1 | M02 (P03 effect) | request id, employee | Internal | P04: `leave.request.rejected.employee`; P09 | Yes | W2 |
| `leave.request.cancelled` | 1 | M02 §A2 | request id | Internal | P04: `leave.request.cancelled.approver`; P10 (out-of-office removed); P03 (automatic delegation ended); P09 | Yes | W2 |
| `leave.compoff.credited` | 1 | M02 §A2 | credit id, days, expiry | Internal | P04: `leave.compoff.credited.employee`; P09 | No | W2 |
| `leave.compoff.expiring` | 1 | P04 scheduler SCH-36 | credit id, days, expiry | Internal | P04: `leave.compoff.expiring.employee` | No | W2 |
| `leave.year_end.posted` | 1 | M02 YX-LV-07 | run id, employee count | Internal | P04: `leave.year_end.posted.employee`; M03 (encashment drafts as one-time pay); P09 | No | W2 |
| `holiday.calendar.published` | 1 | M02 §A2 | calendar id, year | Public | P04: `holiday.calendar.published.employee`; M04 (offline cache) | Yes | W2 |
| `holiday.tomorrow` | 1 | P04 scheduler SCH-32 | calendar id, holiday | Public | P04: `holiday.tomorrow.employee` | No | W2 |
| `attendance.punch.recorded` | 1 | M02 §B1 | punch id, employee, time, source, location verdict | Personal | P09 (live "who's in") — metrics-only | No | W2 |
| `attendance.checkin.missing` | 1 | P04 scheduler SCH-33 | employee, shift, date | Internal | P04: `attendance.checkin.missing.employee` | No | W2 |
| `attendance.exception.raised` | 1 | M02 day engine / P08 §A4b (SCH-34) | exception id, employee, date, kind | Internal | P04: `attendance.exception.raised.employee`; P08 (payroll readiness, YX-LOCK-08); P09 | No | W2 |
| `attendance.exception.resolved` | 1 | M02 §B3 | exception id, resolution (request / HR) | Internal | P08 (payroll readiness); P09 | No | W2 |
| `attendance.exception.reminded` | 1 | M02 (HR "Remind all", manager nudge) | employee, exception ids, by | Internal | P04: `attendance.exception.reminder.employee` | No | W2 |
| `attendance.exceptions.daily` | 1 | P04 scheduler SCH-34 | entity, open count | Internal | P04: `attendance.exception.digest.hr` | No | W2 |
| `attendance.exceptions.weekly` | 1 | P04 scheduler SCH-34 | manager, team count | Internal | P04: `attendance.exception.weekly.manager` | No | W2 |
| `attendance.cutoff.approaching` | 1 | P04 scheduler SCH-35 | entity, cut-off date, open count | Internal | P04: `attendance.cutoff.approaching.hr`, `attendance.cutoff.approaching.employee` | No | W2 |
| `attendance.late_penalty.pending` | 1 | M02 Q4 | employee, month, late count | Internal | P04: `attendance.late_penalty.warning.employee` | No | W2 |
| `attendance.late_penalty.posted` | 1 | M02 YX-AT-05 | posting id | Internal | P04: `attendance.late_penalty.posted.employee`; P09 | No | W2 |
| `attendance.ot.cap_exceeded` | 1 | M02 Q7 | employee, period, hours over | Internal | P04: `attendance.ot.cap_exceeded.hr`; P09 | No | W2 |
| `attendance.feed.ready` | 1 | M02 §B6 (after the period locks) | entity, pay group, period, feed id | Internal | M03 (payable days, LOP, OT, allowances, timesheet hours) | No | W3 |
| `roster.published` | 1 | M02 §B2 | roster id, period, employees | Internal | P04: `roster.published.employee`; P09 | Yes | W2 |
| `roster.shift.changed` | 1 | M02 §B2 | employee, date, old / new shift, same-day flag | Internal | P04: `roster.shift_changed.employee` | No | W2 |
| `timesheet.due` | 1 | P04 scheduler SCH-37 | employee, week | Internal | P04: `timesheet.due.employee` | No | W2 |
| `timesheet.submitted` | 1 | M02 §B7, M12 YX-PRJ-03 | timesheet id, employee, week, placement / project, hours (never rates) | Internal | P04: `timesheet.approval.client_contact`; P03 (approver resolver, D4; M12 project resolver and optional client step, YX-PRJ-04); P09 | No | W2 |
| `timesheet.approved` | 1 | M02 §B7, M12 YX-PRJ-04 | timesheet id, approver (project manager / client contact) | Internal | M03 (rate-based pay, YX-PAY-24); M10 (invoice lines, YX-ATS-10); M12 (cost postings and WIP, YX-PRJ-07 / 09); P09 | Yes | W2 |
| `timesheet.rejected` | 1 | M02 §B7, M12 YX-PRJ-04 | timesheet id, line ids, action (rejected / hours reduced), reason code | Internal | P04: `timesheet.rejected.employee`; P09 | No | W2 |
| `kiosk.heartbeat.missed` | 1 | P04 scheduler SCH-12 (M04 kiosk registry) | kiosk id, location, last heartbeat | Internal | P04: `kiosk.offline.admin` | No | W2 |
| `field.tracking.consent_changed` | 1 | M02 YX-AT-16 (M04 consent sheet, Me › Privacy) | employee, group, given / withdrawn, text version | Personal | P04: `field.tracking.consent_withdrawn.manager`; M04 (trail collection starts / stops at once); P09 | No | W5 |
| `field.visit.missed` | 1 | P04 scheduler SCH-73 | beat plan id, visit id, employee, planned date | Internal | P04: `field.visit.missed.manager`; P09 (planned vs done) | No | W5 |
| `field.integrity.flagged` | 1 | M02 YX-AT-17 | employee, date, flag kinds (mock location / impossible speed / gap) | Confidential | P04: `field.integrity.flagged.manager`; P09 | No | W5 |
| `field.mileage.drafted` | 1 | M02 YX-AT-18 | employee, duty date, draft line id, distance, method (straight-line / road) | Internal | P04: `field.mileage.draft.employee`; M05 (draft mileage line, YX-EXP-16) | No | W5 |
| `roster.draft.generated` | 1 | M02 YX-AT-19 (auto-roster run) | roster id, location, period, run id, unfilled / over-staffed slot counts | Internal | P04: `roster.draft.ready.manager`; P09 (coverage) | No | W6 |
| `roster.open_shift.published` | 1 | M02 YX-AT-20 | open shift id, location, date, shift, eligible employee ids | Internal | P04: `roster.open_shift.offered.employee` | No | W6 |
| `roster.open_shift.awarded` | 1 | M02 YX-AT-20 (after re-check / P03 award) | open shift id, awarded employee, other claimants | Internal | P04: `roster.open_shift.awarded.employee`; P09 | No | W6 |
| `roster.bid_window.opened` | 1 | M02 YX-AT-20 | window id, location, roster period, closes at | Internal | P04: `roster.bid_window.opened.employee` | No | W6 |
| `roster.bid_window.closing` | 1 | P04 scheduler SCH-74 | window id, closes at | Internal | P04: `roster.bid_window.closing.employee` | No | W6 |
| `attendance.presence.consent_changed` | 1 | M02 YX-AT-21 (agent / Teams opt-in, Me › Privacy) | employee, source (teams / desktop), given / withdrawn, text version | Personal | M02 (employee falls back to the group's check-in mode); P10 (Graph subscription / agent signals stopped); P09 | No | W6 |
| `visitor.registered` | 1 | M02 YX-AT-22 (host pre-registration) | visit id, location, host, window; visitor contact in a sealed field for the invite only | Confidential | P04: `visitor.invite.visitor` | No | W6 |
| `visitor.checked_in` | 1 | M02 YX-AT-22 (QR scan, reception or visitor kiosk) | visit id, location, host, time | Confidential | P04: `visitor.arrived.host`; P09 ("on site now", visitor log) | No | W6 |
| `visitor.checked_out` | 1 | M02 YX-AT-22 | visit id, location, time | Confidential | P09 (visitor log, "on site now") — metrics-only | No | W6 |

### 2.12 Payroll, tax & statutory (M03)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `payroll.cutoff.approaching` | 1 | P04 scheduler SCH-38 | pay group, cut-off date | Internal | P04: `payroll.cutoff.approaching.hr` | No | W3 |
| `payroll.run.calculated` | 1 | M03 §6 | run id, pay group, period, counts, totals | Confidential | P04: `payroll.run.calculated.payroll`; P09 | Yes (thin) | W3 |
| `payroll.run.approved` | 1 | M03 YX-PAY-07 | run id, approved_by | Confidential | P04: `payroll.run.approved.payroll`; P08 (period → locked, YX-LOCK-04); P09 | Yes (thin) | W3 |
| `payroll.run.paid` | 1 | M03 §6 (payment status: all lines settled) | run id, paid_on, off-cycle flag | Confidential | **M05** (claims paid via payroll → `expense.claim.paid`; advance instalments recovered); M01 (F&F off-cycle → `fnf.paid`); M09 / M10 (reward and referral payouts marked paid); P09 | Yes (thin) | W3 |
| `payroll.run.voided` | 1 | M03 YX-PAY-08 | run id, reason | Confidential | P04: `payroll.run.voided.payroll`; **M05** (claims back to approved-unpaid, queued for the next run); M01 (F&F back to approved); P09 | Yes (thin) | W3 |
| `payslip.published` | 1 | M03 §6 | payslip id, employee, period | Confidential | P04: `payslip.published.employee`; M04 (payslip list cache, no figures); P09 | Yes (thin) | W3 |
| `payment.failed` | 1 | M03 payment status (bank return, payout callback via P10) | payment line id, kind (payslip / expense / F&F), employee, reason code | Confidential | P04: `payment.failed.employee`, `payment.failed.payroll`, `expense.claim.payment_failed.employee`; M03 (hold reason "bank failure", re-pay route); **M05** (claim payment failed, YX-EXP-07); P02 (expedited bank change, YX-SEC-25); P09 | Yes (thin) | W3 |
| `payroll.hold.applied` | 1 | M03 YX-PAY-28 | hold id, employee, reason code | Confidential | P09 (hold ageing) — metrics-only | No | W3 |
| `payroll.hold.released` | 1 | M03 YX-PAY-28 | hold id, release route | Confidential | P04: `payroll.hold.released.employee`; P09 | No | W3 |
| `payroll.holds.weekly` | 1 | P04 scheduler SCH-39 | entity, hold count by age | Internal | P04: `payroll.hold.ageing.payroll` | No | W3 |
| `recovery.deferred` | 1 | M03 YX-PAY-11 / YX-PAY-32 | employee, run, item (loan EMI / advance instalment / carry-forward), deferred to | Confidential | P04: `payroll.recovery.deferred.employee`; **M05** (advance instalment schedule shifted; open balance kept for F&F); M03 loans (schedule change); M01 (F&F refresh); P09 | No | W3 |
| `payroll.carry_forward.created` | 1 | M03 YX-PAY-29 | employee, run, balance id | Confidential | P04: `payroll.carry_forward.employee`; M01 (F&F line); P09 | No | W3 |
| `payslip.query.raised` | 1 | M03 YX-PAY-25 | query id, payslip, source (payslip / explainer, P23 YX-AST-04), diff id when raised from the explainer | Confidential | P04: `payslip.query.raised.payroll`, `payslip.query.raised_from_explainer.payroll`; P09; M08 (queue migrates in wave 5) | No | W3 |
| `payslip.query.replied` | 1 | M03 YX-PAY-25 | query id | Confidential | P04: `payslip.query.replied.employee`; P09 | No | W3 |
| `payroll.journal.ready` | 1 | M03 §6 → P10 Q7 | run id, entity, period, journal id | Confidential | P04: `payroll.journal.ready.finance`; P10 (Tally / Zoho export, Accounting API) | Yes (thin) | W3 |
| `compensation.changed` | 1 | M03 (compensation written by a P06 change) | employee, compensation id, effective date, reason (revision / promotion / offer / comp review); values never in the payload | Confidential | M03 (arrears when retro, P06 Q4); M06 (comp-review proposal closed); P09 | Yes (thin) | W3 |
| `statutory.filing.filed` | 1 | M03 statutory hub | filing id, entity, statute, form code and law version (e.g. Form 138, or 24Q up to 31 Mar 2026), period, acknowledgement no. | Internal | P08 (period → filed); P04 scheduler (compliance item done, SCH-07 reminders stop); P09 | Yes | W3 |
| `statutory.filing.rejected` | 1 | M03 Q7 (partner path) | filing id, reason | Internal | P04: `statutory.filing.rejected.payroll`; P09 | No | W3 |
| `tax.declaration.window.opened` | 1 | M03 Q5 | entity, FY, close date | Internal | P04: `tax.declaration.open.employee` | No | W3 |
| `tax.declaration.window.closing` | 1 | P04 scheduler SCH-40 | entity, FY, close date | Internal | P04: `tax.declaration.closing.employee` | No | W3 |
| `tax.regime.cutoff_approaching` | 1 | P04 scheduler SCH-41 | entity, FY, cut-off date | Internal | P04: `tax.regime.cutoff.employee` | No | W3 |
| `tax.proof.window.opened` | 1 | M03 Q5 | entity, FY, close date | Internal | P04: `tax.proof.open.employee` | No | W3 |
| `tax.proof.window.closing` | 1 | P04 scheduler SCH-42 | entity, FY, close date | Internal | P04: `tax.proof.closing.employee` | No | W3 |
| `tax.proof.submitted` | 1 | M03 §6 | proof id, employee, line count | Confidential | P04: `tax.proof.submitted.payroll`; P09 | No | W3 |
| `tax.proof.verified` | 1 | M03 YX-TAX-05 | proof id, line statuses | Confidential | P04: `tax.proof.verified.employee`; M03 (TDS projection, YX-TAX-03); P09 | No | W3 |
| `loan.closed` | 1 | M03 Q4 | loan id, employee, closed_on | Confidential | P04: `loan.closed.employee`; M01 (F&F refresh); P09 | No | W3 |
| `ewa.draw.disbursed` | 1 | M03 YX-PAY-40 (partner / payout confirmation) | draw id, employee, recovery period, funding (partner / employer); amounts never in the payload | Confidential | P04: `ewa.draw.disbursed.employee`; **M03** (recovery deduction in the next regular run, YX-PAY-41; balance to F&F on exit); P14 (partner add-on metering, YX-BILL-08); P09 | No | W5 |
| `ewa.draw.failed` | 1 | M03 YX-PAY-40 (partner / payout rejection) | draw id, reason code | Confidential | P04: `ewa.draw.failed.employee`; P09 | No | W5 |
| `esop.grant.approved` | 1 | M03 YX-PAY-46 (P03) | grant id, plan, employee (units and price never in the payload) | Confidential | P04: `esop.grant.issued.employee`; P05 (grant letter APX-F #94 → `signature.requested`); P09 | No | W6 |
| `esop.vested` | 1 | M03 YX-PAY-46 (vesting date, or milestone confirmed by an approver) | grant id, vest event id | Confidential | P04: `esop.vested.employee`; P09 (cap table) | No | W6 |
| `esop.exercise.approved` | 1 | M03 YX-PAY-46 (P03) | exercise id, grant id, exercise month, TDS deferral flag | Confidential | P04: `esop.exercise.approved.employee`; **M03** (perquisite in the month's TDS projection or deferred, YX-TAX-18; Form 12BA); P09 | No | W6 |
| `esop.exercise_window.closing` | 1 | P04 scheduler SCH-75 | grant id, window end, leaver flag | Confidential | P04: `esop.exercise_window.closing.employee` | No | W6 |

### 2.13 Expenses, advances & travel (M05)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `expense.claim.submitted` | 1 | M05 §6 | claim id, employee, title, total, line count, flags | Confidential | P04: `expense.claim.submitted.approver`; P09 | Yes (thin) | W5 |
| `expense.claim.approved` | 1 | M05 (P03 effect) | claim id, approved total, reduced flag, payment route | Confidential | P04: `expense.claim.approved.employee`, `expense.claim.partly_approved.employee`; M03 (next-payroll route: reimbursement input); P10 (accounting lines, YX-EXP-11; direct payout); P09 | Yes (thin) | W5 |
| `expense.claim.rejected` | 1 | M05 (P03 effect) | claim id | Confidential | P04: `expense.claim.rejected.employee`; P09 | Yes (thin) | W5 |
| `expense.claim.flagged` | 1 | M05 YX-EXP-04 | claim id, flag types (incl. employee-entered FX rate outside the company tolerance, YX-EXP-14) | Confidential | P04: `expense.claim.flagged.finance`; P09 | No | W5 |
| `expense.claim.paid` | 1 | M05 (on `payroll.run.paid` or payout confirmation) | claim id, paid_on, route | Confidential | P04: `expense.claim.paid.employee`; P09 | Yes (thin) | W5 |
| `trip.approved` | 1 | M05 (P03 effect) | trip id, employee, dates, advance requested | Internal | P04: `trip.approved.employee`, `trip.booking_requested.travel_desk`; M05 (advance record created, YX-EXP-08); P10 (travel booking partner, wave 6); P09 | Yes | W5 |
| `trip.booking.uploaded` | 1 | M05 Q3 | trip id, booking count | Internal | P04: `trip.bookings_uploaded.employee` | No | W5 |
| `advance.paid` | 1 | M05 §6 | advance id, trip | Confidential | P04: `advance.paid.employee`; P09 | No | W5 |
| `advance.settlement_due` | 1 | P04 scheduler SCH-43 | advance id, settle-by date | Confidential | P04: `advance.settlement_due.employee` | No | W5 |
| `advance.overdue` | 1 | M05 YX-EXP-09 (SCH-43 at window end) | advance id, open balance | Confidential | P04: `advance.overdue.employee`; M05 (recovery per Q6 starts); P09 | No | W5 |
| `advance.recovery.scheduled` | 1 | M05 Q6 | advance id, instalments, start period | Confidential | P04: `advance.recovery_scheduled.employee`; **M03** (one-time deductions per instalment, protected net YX-PAY-11); P09 | No | W5 |
| `advance.settled` | 1 | M05 §3 | advance id, how (claims / returned / recovered / F&F) | Confidential | M01 (F&F refresh, YX-LC-07); P09 | No | W5 |
| `card.statement.imported` | 1 | M05 Q8 | import id, unmatched count per cardholder | Confidential | P04: `card.unmatched.employee`; P09 | No | W6 |

### 2.14 Performance (M06)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `perf.cycle.launched` | 1 | M06 §6 | cycle id, type, participant count | Internal | P04: `perf.cycle.launched.participant`; P09 | No | W5 |
| `perf.review.stage_opened` | 1 | M06 YX-PERF-06 | review id, stage, owner, due | Internal | P04: `perf.stage.open.owner` | No | W5 |
| `perf.feedback.requested` | 1 | M06 Q4 | nomination id, reviewer, subject, due | Internal | P04: `perf.feedback.requested.reviewer` | No | W5 |
| `perf.feedback.pending` | 1 | P04 scheduler SCH-44 | nomination id, days left | Internal | P04: `perf.feedback.reminder.reviewer` | No | W5 |
| `perf.review.released` | 1 | M06 YX-PERF-09 | review id, employee (no score in payload) | Confidential | P04: `perf.review.released.employee`; M01 (succession "latest band"); M07 (review recommendations → training needs); P09 | No | W5 |
| `perf.review.ack_pending` | 1 | P04 scheduler SCH-44 | review id | Confidential | P04: `perf.review.ack_pending.employee` | No | W5 |
| `perf.review.acknowledged` | 1 | M06 Q2 | review id, disagreement flag | Confidential | P04: `perf.review.disagreement.hr`; P09 | No | W5 |
| `perf.calibration.session.created` | 1 | M06 Q5 | session id, facilitator, group | Confidential | P04: `perf.calibration.assigned.facilitator` | No | W5 |
| `perf.comp_cycle.opened` | 1 | M06 Q6 | cycle id, budget scope | Confidential | P04: `perf.comp_review.open.manager` | No | W5 |
| `perf.comp.approved` | 1 | M06 YX-PERF-10 | proposal id, employee, change kinds (increment / bonus / promotion), effective date; amounts never in the payload | Confidential | M03 (compensation change; bonus-pool split as one-time pay); M01 (promotion change + letter); P09 | No | W5 |
| `perf.pip.started` | 1 | M06 Q7 | pip id, employee, dates | Confidential | P04: `perf.pip.started.employee`; M01 (exit pre-check, YX-LC-23); P09 | No | W5 |
| `perf.pip.checkin_due` | 1 | P04 scheduler SCH-47 | pip id, check-in date | Confidential | P04: `perf.pip.checkin_due.participants` | No | W5 |
| `perf.pip.end_due` | 1 | P04 scheduler SCH-47 | pip id, end date | Confidential | P04: `perf.pip.end_due.hr` | No | W5 |
| `perf.pip.closed` | 1 | M06 Q7 | pip id, outcome (met / extended / not met) | Confidential | P04: `perf.pip.closed.employee`; M01 (exit pre-check cleared; "not met" → HR decision); P09 | No | W5 |
| `perf.skill_gap.found` | 1 | M06 Q8 | employee, competency, gap level | Confidential | M07 (training need → `learning.need.created`); P09 | No | W5 |
| `perf.owner.transferred` | 1 | M06 YX-PERF-13 | employee, old / new manager, artefact list | Confidential | P04: `perf.handover.new_manager`; P09 | No | W5 |
| `perf.goal.checkin_due` | 1 | P04 scheduler SCH-45 | owner, goal count | Internal | P04: `perf.goal.checkin_due.owner` | No | W5 |
| `perf.one_on_one.due` | 1 | P04 scheduler SCH-46 | 1-on-1 id, time | Internal | P04: `perf.one_on_one.upcoming.participants` | No | W5 |
| `perf.one_on_one.lapsed` | 1 | P04 scheduler SCH-46 | manager, employee, days since last | Internal | P04: `perf.one_on_one.lapsed.manager`; P09 | No | W5 |
| `perf.feedback.quick_given` | 1 | M06 §6 | feedback id, giver, receiver, visibility | Internal | P04: `perf.quick_feedback.received.employee`; P09 | No | W5 |
| `perf.idp.approved` | 1 | M06 YX-PERF-14 (P03, manager approval) | IDP id, employee, period, item counts by kind (course / competency / mentor / action) | Confidential | P04: `perf.idp.approved.employee`; **M07** (enrolment requests for course items, YX-LRN-07); M01 (succession view link, YX-PERF-16); P09 | No | W5 |
| `perf.idp.mentor_requested` | 1 | M06 YX-PERF-14 | IDP id, item id, mentor | Internal | P04: `perf.idp.mentor_request.mentor` | No | W5 |
| `perf.talent_pool.changed` | 1 | M06 YX-PERF-16 | pool id, employee, change (added / removed), reason code | Confidential | P04: `perf.talent_pool.added.employee` (only when the company tells pool members); **M01** (succession view and successor proposals, M01 Q8); P09 | No | W6 |

### 2.15 Learning (M07)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `learning.enrolment.created` | 1 | M07 §3 | enrolment id, employee, course, source, due date, assessment attached | Internal | P04: `learning.enrolment.assigned.employee`; **T03** (employee test invitation when an assessment is attached, YX-DLV-13); P09 | No | W5 |
| `learning.enrolment.declined` | 1 | M07 Q2 | enrolment id, reason | Internal | P04: `learning.nomination.declined.manager`; P09 | No | W5 |
| `learning.enrolment.due` | 1 | P04 scheduler SCH-48 | enrolment id, due date | Internal | P04: `learning.enrolment.due.employee` | No | W5 |
| `learning.enrolment.overdue` | 1 | P04 scheduler SCH-48 | enrolment id, days overdue | Internal | P04: `learning.enrolment.overdue.manager`; P09 (compliance dashboard) | No | W5 |
| `learning.enrolment.completed` | 1 | M07 YX-LRN-01 | enrolment id, employee, course, pass flag, certificate flag | Confidential | P04: `learning.completed.employee`; P05 (certificate issued → `document.issued`); M06 (competency profile, YX-LRN-03); M08 (policy quiz counted as acknowledgement where set); M01 (onboarding task closed); P09 | Yes (thin) | W5 |
| `learning.session.upcoming` | 1 | P04 scheduler SCH-50 | session id, start | Internal | P04: `learning.session.reminder.attendee` | No | W5 |
| `learning.session.attendance_due` | 1 | P04 scheduler SCH-50 | session id, trainer | Internal | P04: `learning.trainer.attendance_due.trainer` | No | W5 |
| `learning.session.changed` | 1 | M07 §3 | session id, what changed | Internal | P04: `learning.session.changed.attendee` | No | W5 |
| `learning.session.ended` | 1 | M07 §3 | session id | Internal | P04: `learning.feedback.requested.attendee`; P09; SCH-51 anchor | No | W5 |
| `learning.session.trainer_assigned` | 1 | M07 Q6 | session id, trainer | Internal | P04: `learning.trainer.assigned.trainer`; P02 (external-trainer login grant) | No | W5 |
| `learning.waitlist.promoted` | 1 | M07 YX-LRN-06 | enrolment id | Internal | P04: `learning.waitlist.promoted.employee` | No | W5 |
| `learning.certification.expiring` | 1 | P04 scheduler SCH-49 | certification id, expires | Internal | P04: `learning.certification.expiring.employee`; M07 (renewal enrolment at T-30, YX-LRN-05) | No | W5 |
| `learning.certification.expired` | 1 | P04 scheduler SCH-49 | certification id | Internal | P04: `learning.certification.expired.manager`; P09 (compliance dashboard: non-compliant) | No | W5 |
| `learning.effectiveness.due` | 1 | P04 scheduler SCH-51 | enrolment id, manager | Internal | P04: `learning.effectiveness.check.manager` | No | W5 |
| `learning.need.created` | 1 | M07 Q4 | need id, source, employee / group, competency | Internal | P04: `learning.need.created.lnd`; P09 | No | W5 |
| `learning.budget.threshold_reached` | 1 | M07 Q5 | department, FY, % used | Internal | P04: `learning.budget.exceeded.lnd` | No | W5 |
| `learning.bond.recovery_confirmed` | 1 | M07 Q5 (HR confirms after exit) | bond id, employee | Confidential | M01 (F&F recovery line, YX-LC-07) | No | W5 |
| `learning.badge.issued` | 1 | M07 YX-LRN-13 | badge id, certification id, employee, issuer (Open Badges 3.0 / Credly), expiry | Internal | P04: `learning.badge.issued.employee`; P05 (public verify page, credential status); P10 (Credly push); P09 | Yes | W5 |
| `learning.badge.revoked` | 1 | M07 YX-LRN-13 (certification revoked or expired) | badge id, reason (revoked / expired) | Internal | P04: `learning.badge.revoked.employee`; P05 (verify page shows revoked / expired); P10 (Credly revocation) | Yes | W5 |
| `learning.provider.sync_failed` | 1 | M07 YX-LRN-10 (P10 content connector) | connection id, provider, error class | Internal | P04: `learning.provider.sync_failed.lnd`; P09 | No | W6 |
| `learning.provider.learners_unmatched` | 1 | M07 YX-LRN-10 (sync finished with exceptions) | connection id, provider, unmatched count | Internal | P04: `learning.provider.unmatched.lnd` | No | W6 |

### 2.16 Helpdesk, cases & policies (M08)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `helpdesk.ticket.created` | 1 | M08 §6 | ticket id, queue, category, requester (sensitive categories: category only) | Internal | P04: `helpdesk.ticket.created.requester`; P09 | No | W5 |
| `helpdesk.ticket.assigned` | 1 | M08 YX-HD-01 | ticket id, agent | Internal | P04: `helpdesk.ticket.assigned.agent`; P09 | No | W5 |
| `helpdesk.ticket.replied` | 1 | M08 §6 | ticket id, by (agent / requester) | Internal | P04: `helpdesk.ticket.replied.requester`, `helpdesk.ticket.replied.agent`; P09 | No | W5 |
| `helpdesk.ticket.sla_warning` | 1 | P04 scheduler SCH-54 | ticket id, time left | Internal | P04: `helpdesk.ticket.sla_warning.agent` | No | W5 |
| `helpdesk.ticket.sla_breached` | 1 | P04 scheduler SCH-54 | ticket id | Internal | P04: `helpdesk.ticket.sla_breached.lead`; P09 | No | W5 |
| `helpdesk.ticket.resolved` | 1 | M08 §6 | ticket id | Internal | P04: `helpdesk.ticket.resolved.requester`; P09 (deflection, CSAT) | No | W5 |
| `helpdesk.ticket.closed` | 1 | M08 YX-HD-05 (SCH-54 auto-close) | ticket id | Internal | P09 (CSAT) — metrics-only | No | W5 |
| `case.filed` | 1 | M08 §6 | case id, type, confidentiality level (no parties, no text) | Special | P04: `case.filed.owner`; P09 (anonymised counts, YX-POSH-05) | No | W4 |
| `case.updated` | 1 | M08 (each timeline step) | case id, step kind, recipient case roles | Special | P04: `case.acknowledged.complainant`, `case.update.member`, `case.notice.respondent`, `case.anonymous.update.reporter` | No | W4 |
| `case.member.added` | 1 | M08 §3 | case id, member, role, external flag | Special | P04: `case.member.appointed.member`, `case.external_access.party`; P02 (IC external member / external party login grant) | No | W4 |
| `case.stage.due` | 1 | P04 scheduler SCH-53 | case id, stage, due date | Special | P04: `case.stage.due.member`; P09 (case ageing) | No | W4 |
| `case.stage.overdue` | 1 | P04 scheduler SCH-53 | case id, stage, days overdue | Special | P04: `case.stage.overdue.escalation`; P09 | No | W4 |
| `case.retaliation.flagged` | 1 | M08 YX-CASE-08 | case id, linked case id | Special | P04: `case.retaliation.flagged.owner` | No | W4 |
| `case.escalated` | 1 | M08 Q8 | case id, escalated to (audit committee chair) | Special | P04: `case.escalated.audit_chair`; P02 (audit-chair login grant) | No | W5 |
| `case.action.applied` | 1 | M08 YX-CASE-07 | case id, employee, action (warning / suspension / deduction / training / termination), effective date | Special | P04: `case.action.payroll_input.payroll`; **M03** (subsistence allowance YX-PAY-23; deduction as one-time pay); **M01** (termination → exit case; suspension status); **M02** (expected status "suspended", D10); **M07** (training enrolment); P09 (counts) | No | W4 |
| `case.closed` | 1 | M08 YX-CASE-05 | case id, outcome code | Special | M01 (held letters / F&F released, YX-LC-23); P09 | No | W4 |
| `disciplinary.warning.expired` | 1 | P04 scheduler SCH-55 | warning id, employee | Special | P04: `disciplinary.warning.expired.hr`; M01 (employee file shows the warning as expired) | No | W5 |
| `posh.ic.invalid` | 1 | M08 YX-POSH-01 (on composition change, member exit, tenure end) | committee id, entity, failed checks | Internal | P04: `posh.ic.invalid.hr`; P07 compliance calendar (banner); P09 | No | W4 |
| `posh.ic.tenure_expiring` | 1 | P04 scheduler SCH-56 | committee id, member count, tenure end | Internal | P04: `posh.ic.tenure_expiring.hr` | No | W4 |
| `policy.version.published` | 1 | M08 Q6 | policy id, version, audience, acknowledgement required, critical flag | Internal | P04: `policy.published.employee`; P10 (AI helpdesk index, P10 Q8); M01 (joiner onboarding tasks, YX-POL-03) | Yes | W5 |
| `policy.acknowledged` | 1 | M08 YX-POL-02 | policy id, version, employee, method | Internal | M01 (onboarding task closed); P09 | No | W5 |
| `policy.ack.due` | 1 | P04 scheduler SCH-52 | policy id, pending count | Internal | P04: `policy.ack.reminder.employee` | No | W5 |
| `policy.ack.overdue` | 1 | P04 scheduler SCH-52 | policy id, manager, pending count | Internal | P04: `policy.ack.overdue.manager`; P09 | No | W5 |

### 2.17 Engage (M09)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `engage.post.published` | 1 | M09 §6 | post id, space, type, mentions | Internal | P04: `engage.mention.user`; P10 (Teams / Slack mirror, M09 Q7); P09 | No | W5 |
| `engage.comment.added` | 1 | M09 §6 | post id, comment id, actor | Internal | P04: `engage.comment.author`; P09 | No | W5 |
| `engage.reaction.added` | 1 | M09 §6 | post id, actor | Internal | P04: `engage.reactions.author`; P09 | No | W5 |
| `engage.post.held` | 1 | M09 YX-ENG-03 | post id, reason | Internal | P04: `engage.post.held.author`; P09 | No | W5 |
| `engage.post.reported` | 1 | M09 YX-ENG-03 | post id, report count | Internal | P04: `engage.post.reported.moderator`; P09 | No | W5 |
| `engage.kudos.given` | 1 | M09 §6 | kudos id, giver, receivers, value, points | Internal | P04: `engage.kudos.received.employee`; M06 (kudos shown in review context, M09 Q6); P09 | No | W5 |
| `engage.reward.redeemed` | 1 | M09 Q4 | redemption id, employee, kind (voucher / payroll payout), status, points value | Confidential | P04: `engage.reward.redemption.employee`; **M03** (taxable one-time pay / perquisite per P07, YX-ENG-07); P10 (voucher partner); P09 | No | W5 |
| `engage.points.expiring` | 1 | P04 scheduler SCH-60 | employee, points, expiry | Internal | P04: `engage.points.expiring.employee` | No | W5 |
| `engage.survey.opened` | 1 | M09 §6 | survey id, type, anonymity mode, close date | Internal | P04: `engage.survey.invited.employee`; P09 | No | W5 |
| `engage.survey.reminder_due` | 1 | P04 scheduler SCH-57 | survey id | Internal | P04: `engage.survey.reminder.employee` | No | W5 |
| `engage.survey.lifecycle_due` | 1 | P04 scheduler SCH-58 | template, employee, kind (onboarding 30 / 60 / 90, exit) | Internal | P04: `engage.survey.onboarding.employee`, `engage.survey.exit.employee`; M09 (survey invitation created) | No | W5 |
| `engage.survey.closed` | 1 | M09 §6 | survey id, response counts | Internal | P04: `engage.survey.results.manager`; P09; SCH-59 anchor | No | W5 |
| `engage.action_plan.due` | 1 | P04 scheduler SCH-59 | survey id, manager | Internal | P04: `engage.action_plan.due.manager` | No | W5 |
| `engage.celebration.due` | 1 | P04 scheduler SCH-31 | kind (birthday / anniversary), employee(s), space | Internal | P04: `celebration.birthday.team`, `celebration.birthday.employee`, `celebration.anniversary.team`; M09 (celebration post, wave 5) | No | W1 |

### 2.18 Hiring & staffing desk (M10)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `ats.application.submitted` | 1 | M10 (exists in the exam app) | application id, job, candidate, source | Confidential | P04: `ats.application.received.candidate`, `ats.application.new.recruiter`; P09 | Yes (thin) | W7 |
| `ats.application.stage_changed` | 1 | M10 §6 | application id, from / to stage, rejected flag | Confidential | P04: `ats.stage.changed.candidate`, `ats.application.regret.candidate`, `ats.referral.status.referrer`; T03 (ATS stage trigger → test invitation, T03 §6); P09 | Yes (thin) | W7 |
| `ats.interview.scheduled` | 1 | M10 §2 | interview id, application, time, panel | Confidential | P04: `ats.interview.scheduled.candidate`, `ats.interview.scheduled.panel`; P10 (calendar invites); P09 | No | W7 |
| `ats.interview.booking_opened` | 1 | M10 §2 | application id, booking link id | Confidential | P04: `ats.self_booking.invite.candidate` | No | W7 |
| `ats.interview.upcoming` | 1 | P04 scheduler SCH-61 | interview id, start | Confidential | P04: `ats.interview.reminder.candidate`, `ats.interview.reminder.panel` | No | W7 |
| `ats.scorecard.due` | 1 | P04 scheduler SCH-61 | interview id, panelist | Internal | P04: `ats.scorecard.due.panel`; P09 | No | W7 |
| `ats.ai_interview.invited` | 1 | M10 Q4 | AI interview id, application, deadline | Confidential | P04: `ats.ai_interview.invite.candidate`; P09 | No | W7 |
| `ats.ai_interview.completed` | 1 | M10 Q4 | AI interview id, application (recording refs never in the payload) | Confidential | P04: `ats.ai_interview.review.recruiter`; P09 | No | W7 |
| `ats.referral.eligible` | 1 | P04 scheduler SCH-63 (M10 YX-ATS-12) | referral id, referrer employee, referred employee | Confidential | P04: `ats.referral.eligible.referrer`; **M03** (referral bonus one-time pay); P09 | No | W7 |
| `ats.requisition.filled` | 1 | M10 YX-ATS-13 | requisition id, plan line | Internal | P04: `ats.requisition.filled.hiring_manager`; P09 | Yes | W7 |
| `ats.requisition.reopened` | 1 | M10 YX-ATS-14 | requisition id, reason | Internal | P04: `ats.requisition.reopened.recruiter`; P09 | Yes | W7 |
| `ats.offer.released` | 1 | M10 Q3 | offer id, version, application, expiry | Confidential | P04: `ats.offer.released.candidate`, `ats.offer.revised.candidate`; P05 (offer letter issued, signature request); P09 | No | W7 |
| `ats.offer.expiring` | 1 | P04 scheduler SCH-62 | offer id, expiry | Confidential | P04: `ats.offer.expiring.candidate`, `ats.offer.expiring.recruiter` | No | W7 |
| `ats.offer.expired` | 1 | P04 scheduler SCH-62 (T0) | offer id | Confidential | P04: `ats.offer.declined.recruiter`; P09 | No | W7 |
| `ats.offer.accepted` | 1 | M10 YX-ATS-07 (on `signature.completed` for the offer) | offer id, candidate, person type, joining date, hand-off mode | Confidential | P04: `ats.offer.accepted.recruiter`, `ats.ready_to_onboard.hr`; **M01** (hand-off: pre-boarding / rehire / transfer / employment-type change); P09 | Yes (thin) | W7 |
| `ats.offer.declined` | 1 | M10 §3 | offer id, decline reason | Confidential | P04: `ats.offer.declined.recruiter`; P09 (offer-acceptance analytics) | No | W7 |
| `ats.offer.withdrawn` | 1 | M10 YX-ATS-14 | offer id, reason, after-acceptance flag | Confidential | P04: `ats.offer.withdrawn.candidate`; M01 (pre-boarding unwind, YX-LC-12); P05 (withdrawal letter); P09 | No | W7 |
| `ats.bgv.requested` | 1 | M10 Q5 | BGV id, candidate, package | Confidential | P04: `ats.bgv.consent.candidate`; P10 (BGV partner) | No | W7 |
| `ats.bgv.completed` | 1 | M10 Q5 (P10 inbound partner result) | BGV id, candidate, status, discrepancy flag | Special | P04: `ats.bgv.completed.hr`; M01 (outcome gate, e.g. clear before confirmation); P09 | No | W7 |
| `ats.guardian_consent.requested` | 1 | M10 YX-ATS-19, T05 YX-EVAL-13 | candidate id, guardian contact | Personal | P04: `ats.guardian_consent.guardian` | No | W7 |
| `ats.candidate.retention_expiring` | 1 | P04 scheduler SCH-64 | candidate id, expiry date | Personal | P04: `ats.consent_renewal.candidate` | No | W7 |
| `ats.candidate.anonymised` | 1 | M10 Q6 | candidate id | Internal | T05 (scores follow ATS retention, T05 Q7); P09 (counts kept) | No | W7 |
| `ats.bonus.clawback` | 1 | M10 Q3 (on `exit.case.accepted` inside the clawback period) | offer id, employee, bonus kind, clawback amount | Confidential | **M03** / M01 (F&F recovery line, YX-LC-07) | No | W7 |
| `ats.commission.earned` | 1 | M10 YX-ATS-16 | placement id, recipients, period | Confidential | **M03** (placement commission as one-time pay, E17) | No | W7 |
| `ats.client_contact.invited` | 1 | M10 Q8 | contact id, client | Personal | P04: `ats.client.portal_invite.client_contact`; P02 (client-contact login grant) | No | W7 |
| `ats.submission.sent` | 1 | M10 Q8 | submission id, client, job | Confidential | P04: `ats.client.submission.client_contact`; P09 | No | W7 |
| `ats.submission.feedback` | 1 | M10 Q8 | submission id, feedback kind | Confidential | P04: `ats.client.feedback.recruiter`; P09 | No | W7 |
| `ats.placement.started` | 1 | M10 §6 | placement id, contractor employment, client, start (rates never in the payload) | Confidential | P04: `ats.placement.started.contractor`; M02 (timesheets open); M03 (rate-based compensation from the rate card); P09 | Yes (thin) | W7 |
| `ats.placement.ending` | 1 | P04 scheduler SCH-65 | placement id, end date | Internal | P04: `ats.placement.ending.account_team` | No | W7 |
| `ats.placement.ended` | 1 | M10 YX-ATS-15 | placement id, end date, reason | Internal | P04: `ats.placement.ended.contractor`; **M02** (timesheets close); **M03** (bench pay % per bench policy); M10 (bench status); P09 | Yes | W7 |
| `ats.bench.limit_reached` | 1 | P04 scheduler SCH-65 | employment id, bench days | Internal | P04: `ats.bench.limit.hr` | No | W7 |
| `ats.invoice.issued` | 1 | M10 Q7 | invoice id, client, amount, due date | Confidential | P04: `ats.invoice.issued.client_billing`; P10 (accounting export); P09 | Yes (thin) | W7 |
| `ats.invoice.overdue` | 1 | P04 scheduler SCH-66 | invoice id, days overdue | Confidential | P04: `ats.invoice.dunning.client_billing`; P09 (receivables ageing) | No | W7 |
| `ats.tds.unmatched` | 1 | M10 YX-ATS-16 (Form 26AS / AIS reconciliation; verify name) | client, invoice count | Confidential | P04: `ats.tds.unmatched.finance` | No | W7 |
| `ats.crm.optout` | 1 | M10 YX-ATS-20 (unsubscribe link, STOP reply, preference page) | candidate id, channel, source | Personal | **M10** (every campaign and sequence stops for that channel at once); P04 (channel suppression, YX-NTF-11); P09 | No | W7 |
| `ats.crm.reply.received` | 1 | M10 YX-ATS-20 | sequence id, candidate id, channel | Confidential | P04: `ats.crm.reply.recruiter`; M10 (sequence stops for the candidate); P09 | No | W7 |
| `ats.posting.closed` | 1 | M10 YX-ATS-23 | posting id, job, board, reason (requisition filled / closed / manual / board expiry) | Internal | P10 (board connector closes the live posting); P09 (cost per hire, source) | No | W7 |
| `ats.posting.failed` | 1 | M10 YX-ATS-23 (P10 board connector) | posting id, job, board, error class | Internal | P04: `ats.posting.failed.recruiter` | No | W7 |
| `ats.interview.reslot_needed` | 1 | M10 YX-ATS-24 (panelist declined, or slot no longer free at booking) | interview id, round, panelist | Confidential | P04: `ats.interview.reslot.recruiter` | No | W7 |
| `ats.vendor_contact.invited` | 1 | M10 YX-ATS-25 | contact id, vendor | Personal | P04: `ats.vendor.portal_invite.vendor_contact`; P02 (vendor-contact login grant) | No | W7 |
| `ats.job_share.opened` | 1 | M10 YX-ATS-26 | share id, job, vendors, expiry (rate cap never in the payload) | Confidential | P04: `ats.job_share.new.vendor_contact`; P09 | No | W7 |
| `ats.job_share.closed` | 1 | M10 YX-ATS-26 | share id, reason (withdrawn / filled / expired) | Internal | P04: `ats.job_share.closed.vendor_contact` | No | W7 |
| `ats.vendor.submission.received` | 1 | M10 YX-ATS-27 | submission id, share id, vendor, candidate id, status (accepted / disputed) | Confidential | P04: `ats.vendor.submission.new.recruiter`; P09 (vendor scorecard, YX-ATS-30) | No | W7 |
| `ats.vendor.submission.duplicate` | 1 | M10 YX-ATS-27 | submission id, share id, vendor (the holding source is never in the payload) | Confidential | P04: `ats.vendor.submission.duplicate.vendor_contact`; P09 (duplicate rate) | No | W7 |
| `ats.vendor_invoice.proposed` | 1 | M10 YX-ATS-29 | vendor invoice id, vendor, period | Confidential | P04: `ats.vendor_invoice.proposed.vendor_contact` | No | W7 |
| `ats.vendor_invoice.approved` | 1 | M10 YX-ATS-29 (P03) | vendor invoice id, vendor, period, pay-when-paid flag | Confidential | P04: `ats.vendor_invoice.approved.vendor_contact`; **M03** (consultant invoice → TDS 194C / 194J, payout, Form 140 (was 26Q), Form 131 (was Form 16A), payment advice APX-F #91; YX-PAY-38); P10 (accounting export); P09 | Yes (thin) | W7 |

### 2.19 Question bank & test builder (T01, T02)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `question.approved` | 1 | T01 §6 | question id, version (answer key never in the payload) | Internal | T02 (available to test builders); P09 | Yes | Proc |
| `question.version.created` | 1 | T01 §6 | question id, version, major flag | Internal | P04: `test.newer_version.owner`; T02 (newer-version prompt) | Yes | Proc |
| `question.retired` | 1 | T01 §6 | question id | Internal | T02 (excluded from draws); P09 | Yes | Proc |
| `question.answer_key.changed` | 1 | T01 YX-QB-03 | question version, attempts affected | Confidential | P04: `test.regrade.available.owner`; T05 (re-grade under result-release rules) | No | Proc |
| `question.leak.detected` | 1 | T05 Q3 (partner add-on) | question version, source, evidence ref | Confidential | P04: `question.leak.alert.owner`; T01 (retire / rotate); T02 (excluded from draws) | No | Proc |
| `test.published` | 1 | T02 Q6 (after publish approval) | test id, version, proctoring mode | Internal | T03 (invitations allowed); T04 (proctoring profile active); P09 | Yes | Proc |
| `test.items.flagged` | 1 | T02 §6 (nightly calibration) | test id, item ids, flag kinds (low discrimination / distractor / over-exposed) | Internal | P04: `test.items.flagged.owner` | No | Proc |

### 2.20 Delivery (T03)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `test.invitation.created` | 1 | T03 §6 | invitation id, test-taker type and id, source (ATS stage / M07 enrolment / manual), window | Confidential | P04: `test.invitation.candidate`, `test.invitation.employee`; P09 | Yes (thin) | Proc |
| `test.invitation.expired` | 1 | P04 scheduler SCH-68 (T03) | invitation id | Internal | P04: `test.missed.candidate`, `test.missed.recruiter`; M10 (pipeline shows "missed"); M07 (enrolment no-show); P09 | Yes | Proc |
| `slot.booked` | 1 | T03 Q1 | booking id, slot, invitation | Internal | P04: `test.slot.booked.candidate`; T04 (proctor shift planning); P09 | No | Proc |
| `slot.rescheduled` | 1 | T03 Q1 | booking id, old / new slot | Internal | P04: `test.slot.rescheduled.candidate`; T04 (proctor shift planning); P09 | No | Proc |
| `slot.no_show` | 1 | P04 scheduler SCH-68 (T03 YX-DLV-03) | booking id, invitation | Internal | P04: `test.missed.candidate`, `test.missed.recruiter`; M10 (pipeline); M07 (enrolment no-show); T04 (proctor capacity released); P09 | Yes | Proc |
| `test.start.upcoming` | 1 | P04 scheduler SCH-67 | invitation id, start | Internal | P04: `test.reminder.candidate` | No | Proc |
| `test.window.closing` | 1 | P04 scheduler SCH-67 | invitation id, closes at | Internal | P04: `test.window.closing.candidate` | No | Proc |
| `accommodation.requested` | 1 | T03 Q8 | request id, invitation, types requested (evidence ref only) | Special | P04: `test.accommodation.requested.reviewer` | No | Proc |
| `accommodation.decided` | 1 | T03 Q8 | request id, approved types | Special | P04: `test.accommodation.decided.candidate`; T03 (applied to the invitation); T04 (adjusted proctoring profile); P09 | No | Proc |
| `attempt.submitted` | 1 | T03 §6 | attempt id, invitation, submitted_at | Internal | T05 (integrity checks, evaluation queue); T02 (item statistics); P09 | Yes | Proc |
| `attempt.time_credit.requested` | 1 | T03 YX-DLV-05 | attempt id, lost time | Internal | P04: `test.time_credit.approval.admin` | No | Proc |
| `drive.capacity_plan.missing` | 1 | P04 scheduler SCH-69 | drive id, start | Internal | P04: `drive.capacity_plan.missing.owner` | No | Proc |
| `admit_card.issued` | 1 | T03 YX-DLV-16 (issue or reissue) | admit card id, registration / invitation id, reissue flag (QR token never in the payload) | Internal | P04: `test.admit_card.candidate`; P05 (APX-F #86 rendered); P09 | No | Proc |

### 2.21 Proctoring (T04)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `proctor.shift.assigned` | 1 | T04 Q8 | assignment id, proctor, pool, slot window | Internal | P04: `proctor.shift.assigned.proctor`; P02 (proctor-service grant for the YukthiX pool, YX-SEC-23) | No | Proc |
| `proctor.shift.upcoming` | 1 | P04 scheduler SCH-70 | assignment id, start | Internal | P04: `proctor.shift.reminder.proctor` | No | Proc |
| `proctor.slot.understaffed` | 1 | P04 scheduler SCH-70 | slot id, needed / assigned | Internal | P04: `proctor.slot.understaffed.owner` | No | Proc |
| `proctoring.signal.raised` | 1 | T04 runtime | attempt id, signal type, severity, evidence ref | Special | T05 (grouped into incidents); P09 | No | Proc |
| `attempt.terminated` | 1 | T04 YX-PROC-02 | attempt id, reason, proctor | Special | P04: `attempt.terminated.recruiter`; T05 (incident opened, evidence preserved); P09 | No | Proc |

### 2.22 Integrity, evaluation & outcomes (T05)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `incident.opened` | 1 | T05 §6 | incident id, attempt, severity | Special | P04: `incident.assigned.reviewer`; T05 (result held, YX-EVAL-03); M10 (candidate stage frozen); P09 | No | Proc |
| `incident.review.due` | 1 | P04 scheduler SCH-71 | incident id, SLA state | Special | P04: `incident.review_due.reviewer` | No | Proc |
| `incident.second_review.requested` | 1 | T05 YX-EVAL-01 | incident id | Special | P04: `incident.second_review.reviewer` | No | Proc |
| `incident.verdict` | 1 | T05 Q1 | incident id, verdict, section ids, final flag | Special | T05 (release or hold); M10 (auto-advance only when clear / cleared, YX-EVAL-12); M07 (completion only after release); P09 | Yes (thin) | Proc |
| `appeal.submitted` | 1 | T05 Q2 | appeal id, attempt / incident / score | Special | P04: `appeal.received.candidate`, `appeal.submitted.reviewer`; T05 (result held); P09 | No | Proc |
| `appeal.decision.due` | 1 | P04 scheduler SCH-72 | appeal id, SLA state | Special | P04: `appeal.due.reviewer` | No | Proc |
| `appeal.decided` | 1 | T05 YX-EVAL-04 | appeal id, outcome | Special | P04: `appeal.decided.candidate`; T05 (release / re-score); M10; M07; P09 | Yes (thin) | Proc |
| `result.released` | 1 | T05 Q5 | attempt id, test-taker, released elements (score band only) | Confidential | P04: `result.released.candidate`, `result.released.employee`; **M10** (suggest next stage / auto-advance, YX-EVAL-12); **M07** (enrolment result, YX-LRN-01); **M06** (competency evidence); P09 | Yes (thin) | Proc |
| `result.held` | 1 | T05 YX-EVAL-03 | attempt id, reason (incident / appeal) | Internal | P04: `result.held.candidate`; M10 (stage move held) | No | Proc |
| `evaluation.assigned` | 1 | T05 Q4 | response ids, evaluator | Internal | P04: `evaluation.assigned.evaluator`; P09 | No | Proc |
| `evaluation.moderation_required` | 1 | T05 YX-EVAL-05 | response id | Internal | P04: `evaluation.moderation.moderator` | No | Proc |
| `consent.withdrawn` | 1 | T05 YX-EVAL-10 | candidate, attempt, purpose | Personal | P04: `consent.withdrawn.recruiter`; T05 (erasure flow); T04 (capture stops) | No | Proc |
| `session_report.ready` | 1 | T05 B5 (integrity review closed, or on demand as "provisional") | report id, attempt id, document id, provisional flag | Confidential | P04: `session_report.ready.recruiter`; P05 (stored document, APX-F #97); P10 (ATS connectors: report link back, YX-EVAL-17); P09 | Yes (thin) | Proc |
| `assess.fairness.finding.raised` | 1 | T05 A13 analysis job (YX-EVAL-25 / 26; also for T06 instruments, YX-PSY-08) | finding id, analysis id, scope (test / section / cut score / ATS stage / question version / instrument), kind (adverse impact / item bias), response mode (alert / auto-suspend); no group statistics in the payload | Confidential | P04: `assess.fairness.finding.owner`; **T02** (auto-suspend: test excluded from new attempts); **T01** (question excluded from draws); P09 | No | Proc |
| `assess.fairness.finding.decided` | 1 | T05 YX-EVAL-27 | finding id, decision (keep with justification / revise / retire), decided_by | Internal | P04: `assess.fairness.finding.decided.owner`; T02 / T01 (suspension lifted, or item revised / retired); P09 | No | Proc |

### 2.23 Projects & timesheets (M12)

Timesheet events (`timesheet.submitted` / `.approved` / `.rejected`, `timesheet.due` for M12's `timesheet.missing`) are in §2.11; project invoices are M10's `ats.invoice.issued` with `source = project` (M12 YX-PRJ-11).

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `project.created` | 1 | M12 §6 | project id, code, entity, client id (blank = internal), billing model, PM | Internal | P17 (index); P10 (project dimension for the accounting export, YX-PRJ-12); P09 | Yes | W5 |
| `project.status.changed` | 1 | M12 YX-PRJ-01 | project id, from / to status | Internal | P04: `project.status.changed.members`; M02 (timesheet grid: closed or on-hold projects take no new time); P09 | Yes | W5 |
| `project.budget.threshold` | 1 | M12 YX-PRJ-07 | project id, measure (hours / cost / fee), threshold % (amounts never in the payload) | Internal | P04: `project.budget.threshold.pm`; P09 | No | W5 |
| `project.milestone.completed` | 1 | M12 YX-PRJ-10 | milestone id, project id, client acceptance required | Internal | P04: `project.milestone.acceptance.client_contact`, `project.milestone.billable.account_manager`; P09 | Yes | W5 |
| `project.milestone.accepted` | 1 | M12 YX-PRJ-10 (client portal) | milestone id, client contact | Internal | P04: `project.milestone.billable.account_manager`; P09 | Yes | W5 |
| `project.billing.due` | 1 | P04 scheduler SCH-76 | entity, billing day, projects with WIP | Internal | P04: `project.billing.due.account_manager` | No | W5 |
| `project.hours.mismatch` | 1 | M12 YX-PRJ-13 | employee, week, project hours vs attendance worked hours | Internal | P04: `project.hours.mismatch.pm`; P09 | No | W5 |

### 2.24 Contract labour (M13)

Due dates for CLRA returns and principal-employer registers come only from the compliance calendar (SCH-07, `compliance.due.upcoming`; §3 #1); a missing wage-payment proof by the statutory wage date is a `clra.alert.raised` of type *unpaid wages*.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `clra.contractor.onboarded` | 1 | M13 §6 flow 2 | contractor id, entity, establishments | Internal | M03 (vendor payee in the consultant register, YX-CLRA-09); P17 (index); P09 | No | W5 |
| `clra.contractor_contact.invited` | 1 | M13 YX-CLRA-11 | contact id, contractor | Personal | P04: `clra.portal_invite.contractor_contact`; P02 (Contractor login grant, P02 §4.7) | No | W5 |
| `clra.worker.deployed` | 1 | M13 YX-CLRA-02 / 03 (site admin approval, P03) | deployment id, worker id, contractor, location, gate-pass no. | Personal | P04: `clra.worker.deployed.contractor_contact`; P05 (gate pass APX-F #101 → `document.issued`); P10 (kiosk / biometric `device_user_map`); P09 | No | W5 |
| `clra.worker.released` | 1 | M13 §6 flow 8 | deployment id, worker id, end date | Personal | P05 (gate pass void); P10 (device mapping removed); P09 | No | W5 |
| `clra.licence.expiring` | 1 | P04 scheduler SCH-77 | licence id, contractor, location, valid_to | Internal | P04: `clra.licence.expiring.owner`, `clra.licence.expiring.contractor_contact` | No | W5 |
| `clra.registration.expiring` | 1 | P04 scheduler SCH-77 | RC id, location, valid_to | Internal | P04: `clra.registration.expiring.owner` | No | W5 |
| `clra.pack.opened` | 1 | M13 YX-CLRA-05 (wage month start) | pack id, contractor, location, wage month, due date, required proof types | Internal | P04: `clra.pack.opened.contractor_contact` | No | W5 |
| `clra.pack.due` | 1 | P04 scheduler SCH-78 | pack id, due date, pending proof count | Internal | P04: `clra.pack.due.contractor_contact` | No | W5 |
| `clra.pack.overdue` | 1 | P04 scheduler SCH-78 (from T+1) | pack id, days overdue | Internal | P04: `clra.pack.overdue.owner`; M13 (liability alert, YX-CLRA-07; bill hold per policy, YX-CLRA-08); P09 | No | W5 |
| `clra.proof.submitted` | 1 | M13 YX-CLRA-06 (contractor or HR upload) | proof id, pack id, type, uploaded_by | Internal | P04: `clra.proof.submitted.verifier`; P09 | No | W5 |
| `clra.proof.discrepancy` | 1 | M13 YX-CLRA-06 | proof id, pack id, failed check kinds | Confidential | P04: `clra.proof.discrepancy.contractor_contact`; P09 | No | W5 |
| `clra.pack.verified` | 1 | M13 YX-CLRA-06 | pack id | Internal | P04: `clra.pack.verified.contractor_contact`; M03 (bill hold released, YX-CLRA-08); P09 | No | W5 |
| `clra.alert.raised` | 1 | M13 YX-CLRA-01 / 02 / 07 | alert id, type (threshold crossed without RC / unpaid wages / below minimum wage / missing or short PF or ESI challan / expired licence or RC / over licence or RC limit / underage worker), contractor, location, severity; the liability estimate is never in the payload | Confidential | P04: `clra.alert.raised.owner`; P09 | No | W5 |
| `clra.payment.held` | 1 | M13 YX-CLRA-08 | contractor invoice id, pack id, reason, override flag | Confidential | P04: `clra.payment.held.contractor_contact`; M03 (invoice held, or released on override); P09 | No | W5 |

### 2.25 Search & customisation (P17, P18)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `search.reindex.requested` | 1 | P17 §7 (bulk backfill: new source, format change, restore) | source key, scope, requested_by | Internal | P17 indexer (backfill job) | No | W2 |
| `search.index.rebuild_failed` | 1 | P17 indexer (backfill or re-index job) | source key, scope, error class, failed row count | Internal | P04: `search.index.rebuild_failed.admin`; P09 | No | W2 |
| `custom.<api_name>.created` / `.updated` / `.deleted` | 1 | P18 §4 (generated per active custom object; one key family, one row) | record id, object api name, names of changed fields | Per object (highest field class) | P17 (index); P09 (custom reports / metrics); P04 (custom request-type "notify" effects, YX-CUST-05); P11 webhooks | Yes (thin when Confidential / Special) | W6 |
| `customisation.object.activated` | 1 | P18 §7 flow 1 (activate / promote) | object api name, package version | Internal | P04: `customisation.object.changed.admins`; P17 (search source registered); P11 (generated API, OpenAPI and webhook events published); P09 | Yes | W6 |
| `customisation.object.archived` | 1 | P18 YX-CUST-07 | object api name, package version | Internal | P04: `customisation.object.changed.admins`; P17 (source removed); P11 (routes deprecated, YX-API-13) | Yes | W6 |
| `customisation.package.promoted` | 1 | P18 YX-CUST-08 (sandbox → production, P03) | package version, change counts, promoted_by, approved_by | Internal | P04: `customisation.package.promoted.admins`; P11 (OpenAPI regenerated); P09 | Yes | W6 |

### 2.26 Psychometrics, project coding & secure client (T06, T07, T08)

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `psych.report.released` | 1 | T06 YX-PSY-07 (with `result.released`, T05 Q5) | report id, attempt id, audience (recruiter / candidate / development), instrument version | Confidential | P04: `psych.report.ready.recruiter`, `psych.report.released.candidate`, `psych.report.released.employee`; M06 (development report as IDP evidence, T06 Q6); P09 | Yes (thin) | Proc |
| `psych.decision_use.enabled` | 1 | T06 YX-PSY-11 (HR-only approval, P03) | assessment id, affected employee ids, approved_by | Confidential | P04: `psych.decision_use.notice.employee`; P09 | No | Proc |
| `workspace.submitted` | 1 | T07 YX-CODE-03 | workspace id, attempt or interview id, snapshot ref (commit hash), template version | Internal | T05 (grader run, evaluation queue); T02 (item statistics); P09 | Yes | Proc |
| `takehome.deadline.approaching` | 1 | P04 scheduler SCH-79 | take-home repo id, deadline | Internal | P04: `takehome.deadline.candidate` | No | Proc |
| `takehome.closed` | 1 | P04 scheduler SCH-79 at the deadline (T07 YX-CODE-05 closes pushes) | take-home repo id, final commit, late-commit flag | Internal | P04: `takehome.closed.recruiter`; T05 (diff review with rubric); P09 | Yes | Proc |
| `interview_room.ended` | 1 | T07 §6 flow 4 | room id, M10 interview id, recording flag | Confidential | M10 (scorecard prompt and playback link on the interview, YX-CODE-07); T05 (retention clock for playback and recording, T07 Q5); P09 | No | Proc |
| `secure_client.integrity.failed` | 1 | T08 YX-SCL-01 (launch handshake) | client session id, attempt id, platform, client version, failure kind (signature / below minimum version / tampering) | Internal | P04: `secure_client.integrity_failed.test_admin`; T04 (signal; the attempt cannot start); P09 (detection dashboard) | No | Proc |
| `secure_client.release.published` | 1 | T08 §6 flow 5 (staff console, P14) | release id, platform, version, rollout %, minimum-version raised flag | Public | P04: `secure_client.min_version.raised.test_admin`, `secure_client.update_required.candidate`; T03 (readiness check uses the new minimum); P09 | No | Proc |

### 2.27 Partners & accountant console (P16)

Firm-level events (`partner.applied`, `.verified`, `.suspended`, commission and partner-invoice events) are platform events: `organization_id` is empty and the partner id is in the payload. Link, grant and ownership-transfer events carry the client tenant's `organization_id`. No payload carries client HR data.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `partner.applied` | 1 | P16 §6 flow 1 (partner sign-up) | partner id, types, region | Internal | P04: `partner.application.received.partner_team`; P14 console (verification queue) | No | W3 |
| `partner.verified` | 1 | P16 YX-PTR-01 (YukthiX partner team, P14 console) | partner id, types, agreement version (G-34), verified_by | Internal | P04: `partner.verified.partner_admin`; P16 (client links may activate; directory listing allowed); P09 | No | W3 |
| `partner.suspended` | 1 | P16 YX-PTR-01 (P14 console) | partner id, reason code, linked tenant ids | Internal | P04: `partner.suspended.partner_admin`, `partner.suspended.client_admins`; P02 (every grant of the partner suspended at once); P16 (directory listing hidden); P09 | No | W3 |
| `partner.link.requested` | 1 | P16 §6 flow 2 (client invites a partner, or a partner requests a link, incl. from the directory) | link id, partner id, relationship type, initiated_by (client / partner) | Internal | P04: `partner.link.requested.client_admins` (partner-initiated), `partner.link.requested.partner_admin` (client-initiated) | No | W3 |
| `partner.link.approved` | 1 | P16 YX-PTR-02 (client admin approves the grant; partner-created tenant once the client contact accepts, YX-PTR-08) | link id, partner id, ownership (client / partner), grant version, approved_by | Internal | P04: `partner.link.approved.partner_admin`; P02 (partner grant active); P16 (partner status feed starts, YX-PTR-07); P14 (billing mode and commission basis for the client); P09 | No | W3 |
| `partner.link.ended` | 1 | P16 §6 flow 6 (client ends, or partner ends with notice) | link id, partner id, ended_by, reason code | Internal | P04: `partner.link.ended.partner_admin`, `partner.link.ended.client_admins`; P02 (partner access revoked immediately); P16 (open tasks handed back, status feed stops, YX-PTR-12); P14 (commission stops from the next billing month); P09 | No | W3 |
| `partner.grant.changed` | 1 | P16 YX-PTR-02 / 05 (client-side grant editor, Settings › Partners) | link id, grant version before / after, changed scopes, delegation flags, changed_by | Internal | P04: `partner.grant.changed.client_admins`, `partner.grant.changed.partner_admin`; P02 (effective partner scope); P09 | No | W3 |
| `tenant.ownership_transfer.requested` | 1 | P16 YX-PTR-13 (either side; YukthiX verifies the requester) | transfer id, partner id, direction, requested_by, notice ends | Internal | P04: `tenant.ownership_transfer.requested.client_admins`, `tenant.ownership_transfer.requested.partner_admin`; P16 (notice timer; open payroll runs flagged to complete or hand over); P14 console (verification) | No | W3 |
| `tenant.ownership_transfer.completed` | 1 | P16 YX-PTR-13 (notice ended; or client-owner approval for client → partner) | transfer id, partner id, direction, new owner, billing account moved flag | Internal | P04: `tenant.ownership_transfer.completed.client_admins`, `tenant.ownership_transfer.completed.partner_admin`; P14 (billing account moves with ownership); P02 (owner / admin grants); P09 | No | W3 |
| `partner.commission.accrued` | 1 | P14 monthly billing (after `billing.invoice.issued` for a direct-billed partner client) | commission id, partner id, month, client invoice id, amount | Internal | P04: `partner.commission.accrued.partner_admin`; P14 console (commission approval); P16 (roll-up to the master partner, YX-PTR-10); P09 | No | W3 |
| `partner.commission.paid` | 1 | P14 console (payout recorded) | commission ids, partner id, amount, payout ref | Internal | P04: `partner.commission.paid.partner_admin`; P09 | No | W3 |
| `partner.invoice.issued` | 1 | P14 monthly billing (consolidated partner invoice, YX-PTR-11) | invoice id, partner id, partner-billed client count, amount, due date | Internal | P04: `partner.invoice.issued.partner_billing`; P09 | No | W3 |

### 2.28 Policy rules & automations (P19)

Rule events carry IDs, names and counts only. Rule expressions, per-person results and money impact are never in a payload; they are read in the app or through the API with a scoped key (P02 classes, YX-RULE-10).

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `rule.version.submitted` | 1 | P19 §6 flow 1 (high-risk version submitted for approval, YX-RULE-06) | rule id, version id, owner module, policy point / record type, risk flags (pay / leave balances / access / visibility), author, impact-preview id | Internal | P04: `rule.version.review_requested.approver`; P03 (second-person approval task, maker ≠ checker); P09 | No | W1 |
| `rule.version.approved` | 1 | P19 YX-RULE-06 (P03 approval) | rule id, version id, approved_by, effective from | Internal | P19 (version activates on its effective date, or at once when current); P09 | No | W1 |
| `rule.activated` | 1 | P19 §6 flow 1 (after the stored impact preview, YX-RULE-07) | rule id, version id, owner module, policy point / record type / trigger, scope summary, effective from, affected count, legal-floor count | Internal | P04: `rule.activated.author`; owning module (policy point resolves to the new version; back-dated → P06 retro proposal, YX-RULE-08); P09 | Yes | W1 |
| `rule.retired` | 1 | P19 (rule retired, or its last version end-dated) | rule id, version id, retired_by, effective to, fallback (next matching rule or starter) | Internal | owning module (policy point resolves to the fallback, YX-RULE-09); P09 | Yes | W1 |
| `rule.legal_floor_applied` | 1 | P19 engine, daily summary job (YX-RULE-03) | entity, policy point, rule id, version id, date, adjusted-person count, floor / cap kind, P07 rule-set ref | Internal | P04: `rule.legal_floor.digest.policy_owner`; P09 | No | W1 |
| `rule.impact_preview.completed` | 1 | P19 §3 test mode (live read-only or sandbox) | preview id, rule version id, data source (live / sandbox), affected count, validation-failure count, automation-run count; money impact never in the payload | Internal | P19 (preview stored with the version; activation allowed, YX-RULE-07); P09 | No | W1 |
| `automation.run.failed` | 1 | P19 automation runner (after retries with backoff, YX-RULE-11) | run id, rule id, version id, trigger, record type, record id, failed action, error class, attempts | Internal | P04: `automation.run.failed.admin`; P19 (failure queue: retry / skip); P09 | No | W2 |
| `automation.loop_blocked` | 1 | P19 YX-RULE-11 (loop protection) | chain id, rule id, version id, record type, record id, blocked action | Internal | P04: `automation.loop_blocked.admin`; P19 (loop warning in the run log); P09 | No | W2 |
| `automation.limit_reached` | 1 | P19 fair-use meter (Q6, D18) | limit kind (automation runs per day / active rules / lookup rows), threshold (80 % / 100 %), used, limit, date | Internal | P04: `automation.limit_reached.admin`; P14 (usage page, add-on offer); P09 | No | W1 |
| `lookup_table.changed` | 1 | P19 §3 lookup tables (rows added / changed / removed as a new dated version) | table id, name, version, valid from, changed row count, changed_by, ids of rules that read it | Internal | P19 (rules that read the table use the new rows from `valid_from`; back-dated → P06 retro proposal, YX-RULE-08); P09 | No | W1 |

### 2.29 Workplace accidents (M08, M02, M03)

Accident events are case events (M08), so they are **never public webhooks**. Medical details (injury type, diagnosis, disablement) and amounts are never in a payload; payloads carry IDs, dates and counts, and the class is **Special** because the subject is an injury.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `accident.reported` | 1 | M08 YX-CASE-14 | case id, person id (employee or M13 worker), contractor id for a contract worker, location, occurred at, lost-days flag | Special | P04: `case.accident.reported.owner`; P09 | No | W5 |
| `accident.reportable.flagged` | 1 | M08 YX-CASE-15 (death, or disablement beyond the P07 days) | case id, report kinds due, P07 rule-set ref | Special | P07 (per-case compliance calendar items, SCH-86); P09 | No | W5 |
| `accident.report.submitted` | 1 | M08 YX-CASE-15 (marked submitted with the acknowledgement no.) | case id, report kind, filed by (company / contractor), submitted at | Special | P07 (calendar item done; stops SCH-86); P09 | No | W5 |
| `accident.report.due` | 1 | P04 scheduler SCH-86 | case id, report kind, due at | Special | P04: `accident.report.due.owner` | No | W5 |
| `accident.report.overdue` | 1 | P04 scheduler SCH-86 | case id, report kind, due at, days overdue, contractor-filing flag | Special | P04: `accident.report.overdue.escalation`, `accident.contractor_report.missing.principal`; P07 (estimated penalty shown); P09 | No | W5 |
| `accident.injury_leave.posted` | 1 | M02 YX-LV-15 (posted from the case) | case id, employee id, leave request id, from / to dates, day count | Special | P04: `accident.injury_leave.posted.employee`, `accident.injury_leave.posted.manager`; M03 (injury pay category, YX-PAY-50); P09 | No | W5 |
| `accident.ec.claim.computed` | 1 | M08 YX-CASE-16 (P07 `IN.EC` formula) | case id, claim id, payment route (payroll / lump sum / commissioner deposit), due date, rule version; amounts never in the payload | Special | P04: `accident.ec.letter.issued.claimant`; M03 (temporary-disablement payments, YX-PAY-50); P05 (EC letter, APX-F #111); P07 (due date on the calendar, SCH-87); P09 | No | W5 |
| `accident.ec.payment.due` | 1 | P04 scheduler SCH-87 | case id, claim id, due date | Special | P04: `accident.ec.payment.due.payroll` | No | W5 |
| `accident.ec.payment.overdue` | 1 | P04 scheduler SCH-87 | case id, claim id, due date, days late | Special | P04: `accident.ec.payment.overdue.payroll`; M03 (interest and penalty payable lines); P09 | No | W5 |
| `accident.ec.paid` | 1 | M03 YX-PAY-50 (payroll or lump-sum payment recorded) | case id, claim id, payment ref, paid on, route | Special | M08 (claim status); P07 (calendar item done; stops SCH-87); P09 | No | W5 |
| `accident.ec.deposited` | 1 | M08 YX-CASE-16 (deposit with the commissioner) | case id, claim id, deposit ref, deposited on | Special | M08 (claim status); P07 (calendar item done; stops SCH-87); P09 | No | W5 |
| `accident.case.closed` | 1 | M08 YX-CASE-14 (closure) | case id, closed on, accidents-register entry id | Special | M03 / P07 (accidents register entry, YX-PAY-39); P09 | No | W5 |

### 2.30 Statutory corrections, revised certificates & migration arrears (M03, P15)

Payloads carry IDs, periods and counts; amounts, wages and penalty values are read in the app or through the API with a scoped key.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `statutory.filing.supplementary.created` | 1 | M03 YX-PAY-51 | filing id, original filing id, statute (PF / ESI), month, cause (arrears / missed employee / wrong wage), employee count, payslip-line count | Confidential | P04: `statutory.supplementary.required.payroll`; P07 (child card under the original month in the statutory hub); P16 (partner mode); P09 | Yes (thin) | W3 |
| `statutory.excess_request.raised` | 1 | M03 YX-PAY-51 | request id, filing id, statute, month, kind (adjustment / refund), employee-share flag | Confidential | P04: `statutory.excess_request.updated.payroll`; P09 | No | W3 |
| `statutory.excess_request.settled` | 1 | M03 YX-PAY-51 | request id, outcome (adjusted / refunded / rejected), settled on, affected employee count | Confidential | P04: `statutory.excess_request.updated.payroll`, `payroll.statutory_refund.employee`; M03 (named refund line in the next run for an over-deducted employee share); P09 | No | W3 |
| `statutory.penalty_line.computed` | 1 | M03 YX-PAY-51 | filing id, kind (EPF s.7Q interest / s.14B damages / ESI interest / ESI damages), days late, rule version; amount never in the payload | Confidential | M03 (employer-cost payable line, never an employee deduction); P10 (accounting lines); P09 | No | W3 |
| `tax.return.correction.accepted` | 1 | M03 YX-TAX-19 / 20 (TRACES in self-file mode, the partner in partner mode) | return id, form (138 / 140; 24Q / 26Q for quarters up to 31 Mar 2026), quarter, TAN, token no., affected person count | Confidential | M03 (revised certificate generation, YX-TAX-20); P09 | No | W3 |
| `tax.certificate.revised` | 1 | M03 YX-TAX-20 | certificate id, superseded certificate id, form (130 / 131; 16 / 16A for old periods), person id, role (employee / alumnus / consultant), tax year | Confidential | P04: `tax.certificate.revised.employee`, `tax.certificate.revised.consultant`; P05 (DSC-signed publish; correction statement, APX-F #27); P09 | Yes (thin) | W3 |
| `tax.certificate.superseded` | 1 | M03 YX-TAX-20 | certificate id, superseded-by certificate id | Confidential | P05 (verify page shows "superseded"; never deleted) | No | W3 |
| `migration.as_paid_lines.imported` | 1 | P15 YX-MIG-15 | import batch id, tax year, month count, employee count, missing-month count, validation-failure count | Confidential | P04: `migration.as_paid.gap.admin`; M03 (as-paid base for arrears and YTD, YX-PAY-52 / YX-TAX-15); P15 (readiness checks); P09 | No | W3 |
| `payroll.arrears.base_confirmation.required` | 1 | M03 YX-PAY-52 | worksheet id, revision id, months without imported lines, employee count | Confidential | P04: `payroll.arrears.base_confirmation.payroll`; P09 | No | W3 |
| `payroll.arrears.base_confirmed` | 1 | M03 YX-PAY-52 (HR enters the base with a reason) | worksheet id, month, employee count, confirmed by | Confidential | M03 (arrears approval unblocked); P08 (audit); P09 | No | W3 |

### 2.31 Identity chain & deepfake signals (T04, T05, M10)

Biometric templates and signal details are **Special** and never in a payload: events carry IDs, check kinds and outcome codes. None is a public webhook (candidate biometric data, T05 YX-EVAL-09).

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `identity.template_captured` | 1 | T04 YX-PROC-19, M10 YX-ATS-32 (with consent) | person id, capture point (application / test / interview / joining), consent id, template ref | Special | T04 (later checks compare against it); P05 (retention clock); P09 | No | Proc |
| `identity.check_completed` | 1 | T04 YX-PROC-19 | check id, person id, capture point, outcome (match / mismatch / inconclusive), re-verification flag | Special | P04: `identity.reverified.recruiter` (re-verification passed); M10 (application stage); P09 | No | Proc |
| `identity.mismatch_flagged` | 1 | T04 YX-PROC-19 | check id, person id, attempt or application id, capture points compared | Special | P04: `identity.mismatch_flagged.reviewer`; T05 (incident, YX-EVAL-30); P09 | No | Proc |
| `identity.reverify_requested` | 1 | T05 YX-EVAL-30 (reviewer action) | check id, person id, request id, due by | Special | P04: `identity.reverify_requested.candidate`; M10 (stage held) | No | Proc |
| `identity.template_erased` | 1 | T04 / P05 retention (consent withdrawn, retention end or privacy request) | person id, template ref, reason | Special | P02 (privacy request evidence); P09 | No | Proc |
| `deepfake.check_completed` | 1 | T04 YX-PROC-20 (interview video / audio only) | check id, interview id, person id, signal kinds raised (synthetic video / voice clone) or none | Special | P04: `deepfake.signal_flagged.reviewer` (signal raised); T05 (incident, YX-EVAL-30); P09 | No | Proc |

### 2.32 Person record (P01, M01)

One `persons` record per tenant with role attachments (P01 YX-ORG-26). Payloads carry IDs and role kinds only; matching evidence (PAN, UAN, phone, email) is never in a payload.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `person.created` | 1 | P01 YX-ORG-26 | person id, first role kind | Personal | P09 | No | W1 |
| `person.role.attached` | 1 | P01 YX-ORG-26 | person id, role kind (candidate / test-taker / employee / alumnus / nominee / consultant / contract worker), role record id | Personal | M01 (rehire / alumni detection, YX-LC-29); P09 | No | W1 |
| `person.role.ended` | 1 | P01 YX-ORG-26 | person id, role kind, role record id, ended on | Personal | P09 | No | W1 |
| `person.link.proposed` | 1 | P01 YX-ORG-27 (conflicting details) | proposal id, person ids, matched key kinds (never the values) | Personal | P04: `person.link.proposed.hr`; P09 | No | W1 |
| `person.link.confirmed` | 1 | P01 YX-ORG-27 (auto-link or HR confirmation) | proposal id, person id, role record id, method (auto / HR) | Personal | M01, M10 (history shown on the person); P09 | No | W1 |
| `person.link.rejected` | 1 | P01 YX-ORG-27 | proposal id, rejected by | Personal | P09 | No | W1 |
| `person.merged` | 1 | P01 YX-ORG-27 | surviving person id, merged person id, merged by | Personal | P02 (grants and privacy scope follow the survivor); P17 (search re-index); P09 | Yes | W1 |
| `person.unmerged` | 1 | P01 YX-ORG-27 | person ids restored, role record ids moved | Personal | P02; P17 (search re-index); P09 | Yes | W1 |
| `person.converted` | 1 | M01 YX-LC-30 (contract worker / candidate / consultant → employee) | person id, from role kind, to role kind, new employment id | Personal | M13 (worker record closed); P09 | Yes | W4 |
| `application.ex_employee.flagged` | 1 | M01 YX-LC-29 (application, referral or campus registration links to a person with an employee or alumnus role) | application id, person id, flags (rehire-eligible / not eligible / alumnus) | Confidential | P04: `application.ex_employee.flagged.recruiter`; M10 (flag on the application); P09 | No | W4 |
| `privacy.request.person_scope.resolved` | 1 | P02 privacy request (P01 YX-ORG-26) | request id, person id, role kinds in scope, record count | Personal | P02 (request fulfilled across all roles); P09 | No | W1 |

### 2.33 Trial, platform status & export billing (P20, P14, P13)

Trial and platform events are produced by the YukthiX platform console and scheduler; payloads never carry tenant HR data (P20 YX-GRO-10). Incident and maintenance events are Public in class because the status page shows them.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `trial.first_value_reached` | 1 | P20 YX-GRO-02 (`tenant_milestones`) | tenant id, product, milestone key | Internal | P04: `trial.first_value.admin`; P20 (done steps drop out of nudges; SCH-81 extension check); P09 | No | W3 |
| `trial.activated` | 1 | P20 YX-GRO-02 | tenant id, product, activation milestone key | Internal | P20 (CS health score); P09 | No | W3 |
| `trial.nudge.due` | 1 | P04 scheduler SCH-80 | tenant id, product, day (0 / 1 / 3 / 7 / 14), next setup step key | Internal | P04: `trial.welcome.admin`, `trial.nudge.day1.admin`, `trial.nudge.day3.admin`, `trial.nudge.day7.admin`, `trial.nudge.day14.admin` | No | W3 |
| `trial.extended` | 1 | P14 YX-TEN-08 (SCH-81 automatic at day 30, or on request) | tenant id, product, new end date, reason (automatic / request) | Internal | P04: `trial.extended.admin`; P09 | No | W3 |
| `trial.readonly.started` | 1 | P14 YX-TEN-08 (SCH-81) | tenant id, product, deletion date | Internal | P04: `trial.readonly.started.admin`; P02 (write access off for the product); P09 | No | W3 |
| `trial.readonly.reminder_due` | 1 | P04 scheduler SCH-82 | tenant id, product, read-only day (15 / 25), deletion date | Internal | P04: `trial.readonly.reminder.admin` | No | W3 |
| `trial.deleted` | 1 | P14 YX-TEN-08 (SCH-83) | tenant id, product, deleted on, deletion certificate id | Internal | P04: `trial.deleted.certificate.admin`; P09 | No | W3 |
| `trial.talk_to_us.raised` | 1 | P20 YX-GRO-05 | tenant id, product, size band, trigger (threshold / request) | Internal | P04: `trial.talk_to_us.cs_owner`; P14 console (CS task); P09 | No | W3 |
| `product.switched_on` | 1 | P20 YX-GRO-04, P14 (subscription starts) | tenant id, product, plan, start date | Internal | P04: `trial.switched_on.admin`; P14 (billing, metering); P09 | Yes | W3 |
| `platform.incident.opened` | 1 | P20 YX-GRO-08 (platform console) | incident id, products, regions, stage (investigating), started at, template id | Public | P04: `platform.incident.investigating.admins`, `platform.status.update.subscriber`; status page; P09 | No | W3 |
| `platform.incident.stage_changed` | 1 | P20 YX-GRO-08 | incident id, stage (identified / monitoring / post-incident), changed at, template id | Public | P04: `platform.incident.identified.admins`, `platform.incident.monitoring.admins`, `platform.incident.post_incident.admins`, `platform.status.update.subscriber`; status page | No | W3 |
| `platform.incident.resolved` | 1 | P20 YX-GRO-08 | incident id, resolved at, duration | Public | P04: `platform.incident.resolved.admins`, `platform.status.update.subscriber`; status page; P09 (uptime) | No | W3 |
| `platform.maintenance.scheduled` | 1 | P20 YX-GRO-08 (≥ 72 h notice) | maintenance id, products, regions, window start / end, impact label | Public | P04: `platform.maintenance.scheduled.admins`, `platform.status.update.subscriber`; status page; SCH-84 anchor | No | W3 |
| `platform.maintenance.reminder_due` | 1 | P04 scheduler SCH-84 | maintenance id, window start | Public | P04: `platform.maintenance.reminder.admins` | No | W3 |
| `platform.maintenance.started` | 1 | P20 YX-GRO-08 | maintenance id, started at | Public | P04: `platform.maintenance.started.admins`, `platform.status.update.subscriber`; status page | No | W3 |
| `platform.maintenance.extended` | 1 | P20 YX-GRO-08 | maintenance id, new window end | Public | P04: `platform.maintenance.extended.admins`, `platform.status.update.subscriber`; status page | No | W3 |
| `platform.maintenance.completed` | 1 | P20 YX-GRO-08 | maintenance id, completed at | Public | P04: `platform.maintenance.completed.admins`, `platform.status.update.subscriber`; status page; P09 | No | W3 |
| `platform.probe.failed` | 1 | P13 synthetic probes (P20 YX-GRO-09) | probe id, product, region, check kind, failed at | Internal | P20 (on-call alert, incident draft); status page (component state); P09 (uptime) | No | W3 |
| `platform.probe.recovered` | 1 | P13 synthetic probes | probe id, recovered at, down duration | Internal | status page; P09 (uptime) | No | W3 |
| `tenant.analytics_optout.changed` | 1 | P20 YX-GRO-10 (tenant setting) | tenant id, opted out (boolean), changed by | Internal | P09 (product analytics off for the tenant); P20 | No | W3 |
| `help.article.published` | 1 | P20 YX-GRO-07 (help centre) | article id, product, version, locale | Public | APX-D help-topic links; P17 (help search index) | No | W3 |
| `billing.export_invoice.issued` | 1 | P14 YX-BILL-16 (export of services under LUT) | invoice id, tenant id, currency, LUT id | Internal | P14 (foreign receipt matching); P10 (accounting); P09 | No | W3 |
| `billing.foreign_receipt.matched` | 1 | P14 YX-BILL-17 | receipt id, invoice ids, FIRC / e-BRC ref | Internal | P14 (invoice paid); P10 (accounting); P09 | No | W3 |
| `billing.foreign_receipt.unmatched` | 1 | P14 YX-BILL-17 | receipt id, currency, received on | Internal | P14 console (exception queue) | No | W3 |
| `billing.lut.expiring` | 1 | P04 scheduler SCH-85 | LUT id, financial year, valid to | Internal | P04: `billing.lut.expiring.yx_billing` | No | W3 |

### 2.34 Validation pass 3 Shoulds (28 Sep 2026)

Events for the Should rules added in validation pass 3. Special-class events (disability, union membership, check-off, PIT) are never public webhooks. Wave **P21** = producer is the new global doc P21; the wave is set when P21 is scheduled.

**Statutory & pay (E1).**

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `statutory.coverage.approaching` | 1 | P07 coverage monitor YX-STAT-27 | entity id, statute, headcount, threshold, basis | Internal | P04: `statutory.coverage.approaching.payroll`; M03 (readiness screen, YX-PAY-53); P09 | No | W3 |
| `statutory.coverage.crossed` | 1 | P07 coverage monitor YX-STAT-27 | entity id, statute, crossed on | Internal | P04: `statutory.coverage.crossed.payroll`; M03 (pre-run validation blocks approval until switched on, YX-PAY-53); P09 | No | W3 |
| `incentive.results.approved` | 1 | M03 YX-PAY-60 | plan id, period, employee count; amounts never in the payload | Confidential | P04: `incentive.statement.published.employee`; M03 (one-time pay lines); P09 | Yes (thin) | W3 |
| `incentive.clawback.applied` | 1 | M03 YX-PAY-60 | plan id, employee, period, clawback id | Confidential | P04: `incentive.clawback.applied.employee`; M03 (recovery line; F&F, YX-LC-07); P09 | Yes (thin) | W3 |
| `payroll.checkoff.remitted` | 1 | M03 YX-PAY-63 | union id, month, member count, remittance ref | Special | P04: `payroll.checkoff.remitted.union`; P09 | No | W3 |
| `actuarial.valuation.booked` | 1 | M03 YX-PAY-57 | entity id, valuation date, valuation id, report document id | Confidential | P10 (accounting export, provision journal); P09 | No | W3 |

**Disclosure packs (E7).**

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `disclosure.pack.ready_for_review` | 1 | P09 YX-MET-23 | pack id, kind, financial year, preparer | Internal | P04: `disclosure.pack.ready.reviewer` | No | W5 |
| `disclosure.pack.approved` | 1 | P09 YX-MET-23 (frozen version) | pack id, kind, financial year, version, approved by | Internal | P04: `disclosure.pack.approved.preparer`; P05 (frozen export stored); P09 | No | W5 |

**Lifecycle & attendance (E2).**

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `disability.declared` | 1 | M01 YX-EMP-14 (with consent) | employee id, consent id; category never in the payload | Special | M03 (ESI PwD ceiling, YX-PAY-56); P09 (aggregate, suppressed) | No | W4 |
| `disability.withdrawn` | 1 | M01 YX-EMP-14 (consent withdrawn) | employee id, consent id | Special | M03 (ceiling reverts); P09 | No | W4 |
| `union.membership.changed` | 1 | M01 YX-EMP-15 | employee id, union id, change (joined / left), check-off authorisation id | Special | M03 (check-off deduction, YX-PAY-63); P09 (aggregate) | No | W4 |
| `ir_event.recorded` | 1 | M02 YX-AT-27 | IR event id, kind (strike / lockout / lay-off), establishment, dates, legality status | Internal | M02 day engine (industrial-action statuses); M03 (lay-off compensation, YX-PAY-63); P09 | No | W5 |
| `ir_event.legality_changed` | 1 | M02 YX-AT-27 | IR event id, from / to legality status, reference (award / settlement) | Internal | M02 (status re-derived); M03 (arrears or recovery); P09 | No | W5 |
| `callout.logged` | 1 | M02 YX-AT-28 | slot id, employee, call-out start / end | Internal | M03 (call-out pay, YX-PAY-62); P09 | No | W5 |
| `block_leave.started` | 1 | M02 YX-LV-16 | employee id, block id, from, to | Confidential | P02 (access suspended until return); P04: `access.suspended.employee`; P09 | No | W5 |
| `block_leave.ended` | 1 | M02 YX-LV-16 | employee id, block id, returned on | Confidential | P02 (access restored); P04: `access.restored.employee` | No | W5 |
| `block_leave.unplanned` | 1 | P04 scheduler SCH-90 | employee ids, cut-off date | Confidential | P04: `block_leave.unplanned.employee`, `block_leave.unplanned.compliance_officer` | No | W5 |
| `licence.expiring` | 1 | P04 scheduler SCH-88 | licence id, employee, licence type, valid to, days left | Personal | P04: `licence.expiring.employee`, `licence.expiring.manager` | No | W5 |
| `licence.expired` | 1 | P04 scheduler SCH-88 | licence id, employee, licence type, expired on, legal / company requirement | Personal | P04: `licence.expired.manager`; M02 (licence gate blocks rosters, trips and assignments, YX-AT-29); P09 | No | W5 |
| `attendance.office_days.shortfall` | 1 | M02 YX-AT-30 (weekly computation) | employee id, week, office days done, required (pro-rated) | Internal | P04: `attendance.office_days.shortfall.employee`, `attendance.office_days.shortfall.manager`; P09 | No | W5 |
| `buddy.assigned` | 1 | M01 YX-LC-33 | journey id, joiner, buddy | Internal | P04: `buddy.assigned.buddy`, `buddy.assigned.joiner`; M01 (buddy tasks from the onboarding template) | No | W4 |
| `reverification.cycle.opened` | 1 | M01 YX-EMP-16 | cycle id, employee, trigger (periodic / role change / client mandate), consent-by date | Personal | P04: `reverification.consent.requested.employee`; SCH-94 anchor | No | W4 |
| `reverification.consent.due` | 1 | P04 scheduler SCH-94 | cycle id, employee, consent-by date | Personal | P04: `reverification.consent.due.employee` | No | W4 |
| `reverification.completed` | 1 | M01 YX-EMP-16 (P10 BGV connector result) | cycle id, employee, result class (clear / adverse); findings never in the payload | Confidential | P04: `reverification.completed.hr`; M01 (HR review task; no automatic status change); P09 | No | W4 |
| `declaration.submitted` | 1 | M01 YX-EMP-17 / 18 | declaration id, employee, kind, version | Confidential | M01 (declaration status; stops SCH-91); P09 | No | W4 |
| `declaration.due` | 1 | P04 scheduler SCH-91 | declaration id, employee, kind, due date | Confidential | P04: `declaration.due.employee` | No | W4 |
| `declaration.overdue` | 1 | P04 scheduler SCH-91 | kind, entity, pending employee ids, days overdue | Confidential | P04: `declaration.overdue.compliance_officer`; P09 | No | W4 |
| `pit.preclearance.decided` | 1 | M01 YX-EMP-18 | request id, employee, decision, valid to | Special | P04: `pit.preclearance.decided.employee`; SCH-93 anchor; P09 (pre-clearance log) | No | W4 |
| `pit.preclearance.expiring` | 1 | P04 scheduler SCH-93 | request id, employee, valid to | Special | P04: `pit.preclearance.expiring.employee` | No | W4 |
| `settlement.signed` | 1 | M08 YX-CASE-18 | case id, settlement id, signed on, establishment, award / settlement ref | Internal | M03 (settlement arrears, YX-PAY-63); P19 (notice-of-change exception reference, YX-RULE-13); P09 | No | W5 |
| `client_pack.uploaded` | 1 | M13 YX-CLRA-15 (tenant as contractor) | pack id, client, establishment, month, uploaded by | Internal | M13 (pack status; stops SCH-95); P09 | No | W5 |
| `client_pack.due` | 1 | P04 scheduler SCH-95 | pack id, client, establishment, month, due date | Internal | P04: `client_pack.due.owner` | No | W5 |
| `client_pack.overdue` | 1 | P04 scheduler SCH-95 | pack id, client, month, days overdue | Internal | P04: `client_pack.overdue.owner`; P09 | No | W5 |
| `notice_of_change.issued` | 1 | P19 YX-RULE-13 | notice id, rule version id, policy point, effective date, worker count, union ids | Internal | P04: `notice_of_change.issued.worker`, `notice_of_change.issued.union`; P05 (notice document); P19 (activation date check); P09 | No | W1 |
| `rule_version.activated_with_reack` | 1 | P19 YX-RULE-14 | rule version id, M08 policy version id, audience | Internal | M08 (new acknowledgement cycle; reminders via SCH-52 `policy.ack.due`); P09 | No | W1 |

**Global (E6).**

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `work_authorisation.expiring` | 1 | P04 scheduler SCH-89 | authorisation id, person, type, country, sponsor entity, expiry date, days left | Personal | P04: `work_authorisation.expiring.employee`, `work_authorisation.expiring.hr`; M01 (renewal task) | No | P21 |
| `work_authorisation.expired` | 1 | P04 scheduler SCH-89 | authorisation id, person, type, country, expired on | Personal | P04: `work_authorisation.expired.hr`; M03 (pre-flight flag; pay never stopped automatically); M01 (blocks new employment / assignment start in that country); P09 | No | P21 |
| `holiday_feed.item.confirmed` | 1 | P21 YX-GLB-05 (moving holiday confirmed from the feed) | feed item id, country / region, holiday name, date, previous date, source ref | Public | M02 (holiday calendars updated); P04: `holiday.changed.employee` | No | P21 |
| `tenant.region_move.requested` | 1 | P21 YX-GLB-11 (System Admin request) | request id, tenant / entity, from region, to region | Internal | YukthiX platform console (approval queue); P09 | No | P21 |
| `tenant.region_move.approved` | 1 | P21 YX-GLB-11 (YukthiX approval) | request id, to region, freeze window start / end | Internal | P04: `region_move.scheduled.admins`; P13 (move job) | No | P21 |
| `tenant.region_move.rejected` | 1 | P21 YX-GLB-11 | request id, reason code | Internal | P04: `region_move.rejected.admins` | No | P21 |
| `tenant.region_move.completed` | 1 | P21 YX-GLB-11 (verified cut-over; source deleted) | request id, to region, completed on, deletion certificate id | Internal | P04: `region_move.completed.admins`; P02 (residency record, YX-SEC-38); P09 | No | P21 |
| `einvoice.accepted` | 1 | P21 YX-GLB-12 (scheme acceptance) | invoice id, scheme, clearance ref | Internal | P14 / M10 (invoice final); P10 (accounting export) | No | P21 |
| `einvoice.rejected` | 1 | P21 YX-GLB-12 | invoice id, scheme, error codes | Internal | P04: `einvoice.rejected.maker`; P14 / M10 (invoice back to draft) | No | P21 |
| `nationalisation.snapshot.created` | 1 | P21 YX-GLB-13 (monthly per GCC entity) | entity id, pack (`AE.EMIRATISATION` / `SA.NITAQAT`), nationals, non-nationals, band, target, gap | Internal | P04: `nationalisation.target.warning.hr`; P09 (nationalisation status) | No | P21 |

**Skills & AI (E4).**

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `agent.action_prepared` | 1 | P10 YX-AI-13 | agent action id, person, feature and version, channel, target request / draft id | Internal | P04: `agent.action.ready.person`; P10 (`agent_actions` log) | No | W6 |
| `agent.action_confirmed` | 1 | P10 YX-AI-13 (person's explicit confirmation) | agent action id, person, confirmed at, resulting request id | Internal | P03 (request submitted with source `agent:<feature>`); P10 (`agent_actions` log); P09 | No | W6 |
| `skill.suggested` | 1 | M06 YX-PERF-20 | employee id, skill id, source (learning / assessment / project) | Internal | P04: `skill.suggested.employee` | No | W5 |
| `skill.confirmed` | 1 | M06 YX-PERF-20 | employee id, skill id, level, confirmed by | Internal | M07 (recommendations use confirmed skills only, YX-LRN-15); M10 / T01 (mapped views); P09 (skills coverage) | No | W5 |
| `review_eligibility.computed` | 1 | M06 YX-PERF-21 (cycle start) | cycle id, employee id, eligible, proration factor, rule version | Internal | M06 (review forms); P09 | No | W5 |
| `learning.recommended` | 1 | M07 YX-LRN-15 | employee id, course id, reason key | Internal | M07 (recommendation card; never an enrolment); P09 | No | W5 |
| `learning.course.ai_draft_ready` | 1 | M07 YX-LRN-15 | course id, source document versions, reviewer | Internal | P04: `learning.ai_draft.ready.reviewer` | No | W5 |
| `learning.course.review_flagged` | 1 | M07 YX-LRN-15 (P05 source document version changed) | course id, source document id, new version | Internal | P04: `learning.course.review_flagged.owner` | No | W5 |
| `result.reuse.consent_requested` | 1 | T03 YX-DLV-22 | candidate, application, original attempt id | Personal | P04: `result.reuse.consent.candidate` | No | Proc |
| `result.reused` | 1 | T03 YX-DLV-22 (consent recorded) | invitation id, original attempt id, application id, validity end | Personal | M10 (stage result linked); T05 (score rule per job); P09 | No | Proc |
| `dispute.escalated` | 1 | T05 YX-EVAL-31 (after final appeal verdict) | dispute id, attempt id, recorded by, legal hold flag | Confidential | P08 (legal hold on the attempt and evidence); P04: `dispute.escalated.legal`; P09 | No | Proc |
| `bias_audit.recorded` | 1 | T05 YX-EVAL-32 | audit id, feature, audit date, summary URL | Internal | M10 (feature unblocked for NYC jobs; stops SCH-92); P09 | No | Proc |
| `bias_audit.due` | 1 | P04 scheduler SCH-92 | feature, last audit date, due date | Internal | P04: `bias_audit.due.admin` | No | Proc |
| `bias_audit.overdue` | 1 | P04 scheduler SCH-92 | feature, last audit date | Internal | P04: `bias_audit.overdue.admin`; M10 (feature blocked for NYC jobs) | No | Proc |
| `eor.pushed` | 1 | P10 YX-INT-12 | connection id, country, record kinds, record count, period | Internal | P10 (sync log); P09 | No | W6 |
| `eor.pulled` | 1 | P10 YX-INT-12 | connection id, country, period, payslip document count | Confidential | P05 (payslips stored); P08 (period locked); P10 (accounting export); P09 | No | W6 |
| `eor.sync_failed` | 1 | P10 YX-INT-12 (Jobs & errors, YX-INT-10) | connection id, country, direction, error class | Internal | P04: `eor.sync_failed.owner`; P10 (Jobs & errors) | No | W6 |

**Hiring & staffing (E3).** Staffing-desk fees and guarantees (M10 YX-ATS-43) are wave W7; the rest of M10 and M12 is W5.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `ats.posting.publish_blocked` | 1 | M10 YX-ATS-34 | job id, target (board / careers page), reason (pay range missing / pay-history question) | Internal | P04: `ats.posting.publish_blocked.recruiter`; P09 (pay-transparency compliance) | No | W5 |
| `ats.consent.recorded` | 1 | M10 YX-ATS-35 | candidate id, application id, notice version, scope (automated screening / AI interview / AI scoring / notetaker), given or withdrawn, at | Personal | M10 (automation gate); T03 / T05 (AI scoring allowed); P09 | No | W5 |
| `ats.alt_process.requested` | 1 | M10 YX-ATS-35 | application id, candidate id, requested at | Personal | P04: `ats.alt_process.requested.recruiter`; M10 (human-only path, no disadvantage); P09 | No | W5 |
| `ats.candidate.deletion_requested` | 1 | M10 YX-ATS-35 | request id, candidate id, complete-by date, legal hold flag | Personal | P04: `ats.deletion.received.candidate`, `ats.deletion.requested.recruiter`; P09 (turnaround) | No | W5 |
| `ats.candidate.deletion_completed` | 1 | M10 YX-ATS-35 (request closed; data removed by the `ats.candidate.anonymised` job, or held) | request id, candidate token, completed on or hold reason | Personal | P04: `ats.deletion.completed.candidate`; P08 (audit); P09 | No | W5 |
| `ats.reference.requested` | 1 | M10 YX-ATS-38 (after candidate consent) | reference id, application id, referee id, expiry | Personal | P04: `ats.reference.request.referee` | No | W5 |
| `ats.reference.reminder_due` | 1 | M10 reference job (YX-ATS-38; template reminder days) | reference id, referee id, expiry | Personal | P04: `ats.reference.reminder.referee` | No | W5 |
| `ats.reference.expired` | 1 | M10 reference job (YX-ATS-38) | reference id, application id | Personal | P04: `ats.reference.expired.referee`; M10 (reference status) | No | W5 |
| `ats.reference.completed` | 1 | M10 YX-ATS-38 | reference id, application id, completed at; answers never in the payload | Confidential | M10 (visible to recruiter and panel only); P09 (completion rate) | No | W5 |
| `ats.reference.flagged` | 1 | M10 YX-ATS-38 | reference id, application id, signal codes (referee domain = candidate's, same device) | Confidential | P04: `ats.reference.flagged.recruiter`; M10 (review task, never auto-decided); P09 | No | W5 |
| `ats.rediscovery.suggested` | 1 | M10 YX-ATS-39 (requisition opened) | requisition id, candidate ids, match reasons | Personal | P04: `ats.rediscovery.suggested.recruiter`; P09 (hires from rediscovery) | No | W5 |
| `ats.interview_day.published` | 1 | M10 YX-ATS-40 | drive id, job id, date, venue, candidate ids, slots | Personal | P04: `ats.interview_day.invite.candidate`; M10 (bulk scheduler, bulk offers); P09 | No | W5 |
| `ats.offer.condition_due` | 1 | M10 offer-condition job (YX-ATS-41) | offer id, condition id, label, due date | Personal | P04: `ats.offer.condition_due.candidate` | No | W5 |
| `ats.offer.condition_lapsed` | 1 | M10 YX-ATS-41 | offer id, condition id | Personal | P04: `ats.offer.condition_lapsed.recruiter`; M10 (offer lapses, `ats.offer.lapsed`) | No | W5 |
| `ats.offer.lapsed` | 1 | M10 YX-ATS-41 (condition unmet or offer unsigned at the deadline) | offer id, application id, reason | Personal | P04: `ats.offer.lapsed.candidate`, `ats.offer.lapsed.hr`; M01 (pre-boarding tasks cancelled, accounts not created); P01 (headcount slot released); P09 (lapse rate) | No | W5 |
| `ats.placement.fee_invoiced` | 1 | M10 YX-ATS-43 | placement id, client, fee basis (fixed / % of CTC), invoice id | Confidential | P10 (accounting export); P09 (placement fee revenue) | No | W7 |
| `ats.conversion.fee_invoiced` | 1 | M10 YX-ATS-43 | placement id, months served, invoice id | Confidential | P10 (accounting export); P09 (conversion fee revenue) | No | W7 |
| `ats.replacement.triggered` | 1 | M10 YX-ATS-43 (placed person left inside the guarantee) | placement id, client, remedy (replacement / pro-rated credit note), guarantee end | Confidential | P04: `ats.replacement.triggered.account_manager`; M10 (replacement requisition or credit note); P09 (guarantee claims) | No | W7 |
| `billing.einvoice.window_warning` | 1 | M10 YX-ATS-44 / M12 YX-PRJ-16 (daily invoice-window job, day 25) | invoice id, source (staffing / project), invoice date, days left | Internal | P04: `billing.einvoice.window_warning.maker`; P09 (invoice age) | No | W5 |
| `billing.einvoice.window_blocked` | 1 | M10 YX-ATS-44 / M12 YX-PRJ-16 (after day 30) | invoice id, source, invoice date | Internal | P04: `billing.einvoice.window_blocked.maker`; M10 / M12 (re-issue flow); P09 | No | W5 |
| `project.timesheet.post_invoice_correction` | 1 | M12 YX-PRJ-15 | timesheet id, project id, invoice id, hours delta (amounts never in the payload) | Internal | M12 (credit note or supplementary invoice draft); P09 (margin restated) | No | W5 |
| `project.credit_note.issued` | 1 | M12 YX-PRJ-15 | credit note id, original invoice id, project id, client | Confidential | P04: `project.credit_note.issued.client_billing`, `project.credit_note.issued.account_manager`; P10 (accounting export); P09 | No | W5 |
| `project.resource_request.raised` | 1 | M12 YX-PRJ-17 | request id, project id, skills, level, dates, % allocation | Internal | P04: `project.resource_request.raised.resource_manager`; M12 (matching); P09 (fill time) | No | W5 |
| `project.resource_request.matched` | 1 | M12 YX-PRJ-17 (skills from M06 YX-PERF-20, bench first) | request id, ranked employee ids | Internal | P04: `project.resource_request.matched.pm` | No | W5 |
| `project.resource_request.confirmed` | 1 | M12 YX-PRJ-17 (resource manager confirms) | request id, employee id, allocation id | Internal | P04: `project.resource_request.confirmed.employee`; M12 (allocation created); P09 | No | W5 |
| `project.bench.status_changed` | 1 | M12 YX-PRJ-17 | employee id, from / to status (allocated / partly allocated / bench) | Internal | M12 (bench board); P09 (bench count) | No | W5 |
| `project.bench.ageing` | 1 | M12 nightly bench job (YX-PRJ-17) | employee ids, bench days, threshold | Internal | P04: `project.bench.ageing.resource_manager`; P09 (bench ageing) | No | W5 |

**Growth, billing & operations (E5).** Wave **Pilot** = built before the pilot (P14 YX-BILL-18, YX-CONSOLE-09, P12 YX-SECOPS-12, M04 YX-MOB-19); `invoice.irn_overdue` follows P14 YX-BILL-20 (Wave 3).

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `whats_new.item.published` | 1 | P20 YX-GRO-11 | item id, product, target roles, published at | Public | P04: `whats_new.published.user`; P09 | No | W6 |
| `feature_request.voted` | 1 | P20 YX-GRO-12 | request id, tenant id, voter id | Internal | P20 (vote count); P09 | No | W6 |
| `feature_request.status_changed` | 1 | P20 YX-GRO-12 | request id, from / to status (under review / planned / in progress / shipped / declined) | Internal | P04: `feature_request.status_changed.voter`; P20 (public roadmap); P09 | No | W6 |
| `beta.opted_in` | 1 | P20 YX-GRO-12 | tenant id, feature flag key, by | Internal | P13 (flag on for the tenant); P09 | No | W6 |
| `beta.opted_out` | 1 | P20 YX-GRO-12 | tenant id, feature flag key, by | Internal | P13 (flag off); P09 | No | W6 |
| `subscription.cancel_reason_recorded` | 1 | P20 YX-GRO-13 (P14 cancel flow; answering optional) | tenant id, scope (product / company), reason code, free-text flag (text stays in P20) | Internal | P04: `subscription.save_offer.admin`; P09 (cancellation reasons) | No | W6 |
| `save_offer.accepted` | 1 | P20 YX-GRO-13 | tenant id, offer (pause / fewer products / partner help) | Internal | P14 (subscription changed); P16 (partner-help lead); P09 (save-offer take-up) | No | W6 |
| `winback.due` | 1 | P20 win-back job (YX-GRO-13; tenant deleted, marketing consent on record, not opted out) | former tenant ref, contact id, sequence step | Personal | P04: `winback.offer.former_admin` | No | W6 |
| `referral.qualified` | 1 | P20 YX-GRO-14 (referred company's first paid month; self and same-group referrals excluded) | referral id, referring tenant, referred tenant | Internal | P14 (credits, YX-BILL-21); P09 (referral funnel) | No | W6 |
| `referral_credit.issued` | 1 | P14 YX-BILL-21 | referral id, tenant id, side (referrer / referred), credit note id, invoice month | Internal | P04: `referral_credit.issued.referrer_admin`, `referral_credit.issued.referred_admin`; P09 | No | W6 |
| `referral_credit.reversed` | 1 | P14 YX-BILL-21 (qualifying month refunded or charged back) | referral id, tenant id, credit note id, reason | Internal | P14 (next invoice adjusted); P09 | No | W6 |
| `powered_by.click_attributed` | 1 | P20 YX-GRO-14 (careers page, payslip, public tool link) | source surface, referring tenant, session ref; never HR data | Internal | P09 §4.10 (metrics-only) | No | W6 |
| `payout.readiness_failed` | 1 | P14 YX-BILL-18 (check before payout release) | tenant id, payroll run id, failed check (KYB / funding account / balance) | Confidential | P04: `payout.blocked.payroll`; M03 (release held; admin chooses partial payout or waits); P09 | No | Pilot |
| `payout.partial_released` | 1 | P14 YX-BILL-18 | payroll run id, paid line count, open line count | Confidential | P04: `payout.partial_released.payroll`; M03 (unpaid lines stay open, never marked paid); P10 (bank reconciliation); P09 | No | Pilot |
| `invoice.irn_overdue` | 1 | P14 YX-BILL-20 (daily job; day 20, IRN not generated) | invoice id, invoice date, days left | Internal | P04: `invoice.irn_due.yx_billing` | No | W3 |
| `tenant.contained` | 1 | P12 YX-SECOPS-12 (contain action with reason and step-up auth) | tenant id, contained by, reason code, breach clock record id | Confidential | P04: `tenant.contained.admins`; P02 (sessions, API keys, OAuth and partner grants revoked; MFA re-auth); M03 / P11 (bank-detail changes, bulk exports, payout release frozen); UI shell (incident banner); P12 (breach clock, YX-SECOPS-07) | No | Pilot |
| `tenant.containment_lifted` | 1 | P12 YX-SECOPS-12 (two-person lift) | tenant id, lifted by (two user ids) | Confidential | P04: `tenant.containment_lifted.admins`; P02 / M03 / P11 (frozen items resume); UI shell (banner removed) | No | Pilot |
| `tenant.cost_share.exceeded` | 1 | P14 YX-CONSOLE-09 (daily cost attribution) | tenant id, month, cost-share band (staff-only) | Internal | P04: `tenant.cost_share.exceeded.staff`; P09 (cost vs revenue) | No | Pilot |
| `mobile.release_budget_failed` | 1 | M04 YX-MOB-19 (release pipeline) | release id, platform, failed budget (app size / cold start / crash-free / minimum OS) | Internal | P13 (release blocked); P09 (per-release mobile metrics) | No | Pilot |

### 2.35 P22 Workflow Studio & AI assistant (28 Sep 2026)

Events for [P22](P22-workflow-studio-ai-assistant.md) (YX-WFS-01…20) and P10 YX-AI-15. Payloads carry IDs, counts and labels only; record values, script inputs / outputs and per-person results are never in a payload (P02 classes; read in the app or through the API with a scoped key). Internal only (no public webhooks) until P11 decides otherwise. Wave: workflows W2, service identities W6, agent plans W5.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `workflow.version.submitted` | 1 | P22 YX-WFS-04 / 15 (version touching pay, leave balances, access or people data, or with a script step, submitted for approval) | workflow id, version id, author, risk flags, has script step, impact-preview id, static-check result | Internal | P04: `workflow.version.review_requested.approver`, `workflow.script.review_requested.approver`; P03 (second-approver task); P09 | No | W2 |
| `workflow.published` | 1 | P22 YX-WFS-03 / 04 (after impact preview and test run; second approver when needed) | workflow id, version id, published by, approved by, source (manual / AI draft / gallery template), service identity id | Internal | P22 (triggers armed); P08 audit; P09 | No | W2 |
| `workflow.paused` | 1 | P22 YX-WFS-12 / 14 (kill switch, or publisher rights reduced) | workflow id (or tenant-wide flag), paused by (user / support / system), reason (kill switch / publisher rights), runs held | Internal | P04: `workflow.paused.owner`; P22 (runs hold before the next step); P08 audit | No | W2 |
| `workflow.resumed` | 1 | P22 YX-WFS-12 | workflow id (or tenant-wide flag), resumed by, held runs resumed / cancelled | Internal | P22 (held runs continue or cancel); P08 audit | No | W2 |
| `workflow.retired` | 1 | P22 (workflow retired by its owner or an admin) | workflow id, last version id, retired by | Internal | P22 (triggers removed; running runs finish); P09 | No | W2 |
| `workflow.run.started` | 1 | P22 runner (event / schedule / person / inbound webhook or email / agent plan) | run id, workflow id, version id, trigger kind, started by | Internal | P09 (metrics-only) | No | W2 |
| `workflow.run.completed` | 1 | P22 runner | run id, workflow id, version id, steps executed, records touched, script CPU seconds, duration | Internal | P09 (run and usage metrics); P14 (usage meter) | No | W2 |
| `workflow.run.failed` | 1 | P22 YX-WFS-07 / 09 (step failed after retries, or run stopped by a limit or the kill switch) | run id, workflow id, version id, failed step, status (failed / stopped), error class, attempts | Internal | P04: `workflow.run.failed.owner`; P22 (failure queue); P10 Jobs & errors (APX-D PLT-38); P09 | No | W2 |
| `workflow.run.undone` | 1 | P22 YX-WFS-10 | run id, workflow id, undone by, steps reversed, irreversible steps left, conflicts refused | Internal | P04: `workflow.run.undone.owner`; P08 audit; P09 | No | W2 |
| `workflow.limit.reached` | 1 | P22 fair-use meter (YX-WFS-07, D18) | limit kind (runs / records touched / script CPU seconds / AI calls per day), threshold (80 % / 100 %), used, limit, date | Internal | P04: `workflow.limit.reached.admin`, `workflow.script_limit.reached.admin`; P14 (usage page, workflow usage add-on offer); P09 | No | W2 |
| `workflow.inbound_webhook.rejected` | 1 | P22 YX-WFS-11 (bad HMAC signature, timestamp older than 5 minutes, or inbound email from a sender not on the allow-list) | workflow id, channel (webhook / email), reason code, source IP or sender domain | Internal | P10 Jobs & errors (APX-D PLT-38); P12 (security signal on repeats); P09 | No | W2 |
| `service_identity.created` | 1 | P22 YX-WFS-14 (script published) | service identity id, workflow id, scopes (equal to or narrower than the publisher), created by | Internal | P02 (identity registered); P08 audit | No | W6 |
| `service_identity.suspended` | 1 | P22 YX-WFS-14 (publisher rights reduced, publisher left, or admin action) | service identity id, workflow id, reason | Internal | P22 (workflow paused, emits `workflow.paused`); P02; P08 audit | No | W6 |
| `agent.plan.proposed` | 1 | P22 YX-WFS-17, P10 YX-AI-15 (AI do mode) | plan id, requester, step count, record count, irreversible and always-confirm step counts | Internal | P04: `agent.plan.approval_requested.requester`; P08 audit | No | W5 |
| `agent.plan.approved` | 1 | P22 YX-WFS-17 (person approves the plan once) | plan id, approved by, plan hash | Internal | P22 (execution starts through public APIs with the person's permissions); P08 audit | No | W5 |
| `agent.plan.step_awaiting_confirmation` | 1 | P22 YX-WFS-18 (always-confirm step reached) | plan id, step id, step kind (money / statutory filing / decision on others' requests / candidate rejection / termination / pay change) | Internal | P04: `agent.plan.step_confirmation.requester` | No | W5 |
| `agent.plan.step_confirmed` | 1 | P22 YX-WFS-18 (confirmed on the app's own screen) | plan id, step id, confirmed by, confirmed at | Internal | P22 (step runs); P08 audit | No | W5 |
| `agent.plan.completed` | 1 | P22 YX-WFS-17 / 19 | plan id, steps done / skipped, records changed, summary ref | Internal | P04: `agent.plan.completed.requester`; P08 audit; P09 | No | W5 |
| `agent.plan.failed` | 1 | P22 YX-WFS-17 (step failed, or a step outside the plan stopped the run) | plan id, failed step, reason (error / outside plan / confirmation declined) | Internal | P22 (plan card shows the failure and Undo); P08 audit; P09 | No | W5 |

### 2.36 P23 Employee & manager assistants and marketplaces (28 Sep 2026)

Events for [P23](P23-employee-manager-assistants-marketplaces.md) (YX-AST-01…19). Payloads carry IDs, counts, codes and labels only; pay, tax, take-home and premium amounts, review text and work-tool item titles are never in a payload (P02 classes; YX-AST-02 / 08). `tax_scenarios`, `assistant_conversations` and `work_tool_connections` stay owner-only. Internal only (no public webhooks) until P11 decides otherwise. Wave: payslip diff, tax planner and salary optimiser W3; the rest W5.

| Event | v | Producer | Payload | Sens. | Consumers | Webhook | Wave |
|---|---|---|---|---|---|---|---|
| `payslip.diff.computed` | 1 | P23 YX-AST-04 (pay-diff engine; on payslip publish, or first view for older payslips) | payslip id, previous payslip id, changed line count, cause codes (lop / arrears / tax / new_component / ended_component / loan / one_time / wage_addback / withhold / unexplained), unexplained count (no amounts) | Confidential | P23 (explainer card and chat context); P09 (explainer metrics) | No | W3 |
| `payslip.diff.unexplained` | 1 | P23 YX-AST-04 (a changed line has no supporting payroll record) | payslip id, diff id, unexplained line count, component codes | Confidential | P04: `payslip.diff.unexplained.employee`; P09 (unexplained-change rate) | No | W3 |
| `policy_draft.created` | 1 | P23 YX-AST-06 / 07 (policy writer, after the questionnaire) | questionnaire id, draft ids, policy types, states, law-floor finding count | Internal | P04: `policy_draft.review_ready.hr`; P09 | No | W5 |
| `policy_draft.approved` | 1 | P23 YX-AST-06 (all law-floor findings resolved or acknowledged) | draft id, policy type, approver, P19 rule refs loaded, M08 policy version id | Internal | P04: `policy_draft.approved.hr`; P19 (values loaded with impact preview); M08 (new policy version → `policy.version.published`); P08 audit; P09 | No | W5 |
| `policy_draft.discarded` | 1 | P23 YX-AST-06 | draft id, policy type, discarded by | Internal | P09 (metrics-only) | No | W5 |
| `work_tool.connected` | 1 | P23 YX-AST-08 (per-user OAuth, read-only scopes) | connection id, person, provider (google_calendar / microsoft_calendar / jira / github), scopes | Internal | P23 (sync starts); P08 audit; P09 | No | W5 |
| `work_tool.revoked` | 1 | P23 YX-AST-08 (by the user, provider revocation, token expiry, or `employment.exited`) | connection id, person, provider, reason (user / provider / expired / exit) | Internal | P04: `work_tool.connection.revoked.owner`; P10 (token deleted from the vault); P08 audit | No | W5 |
| `timesheet.suggestions.generated` | 1 | P23 YX-AST-09 (timesheet auto-fill run) | person, week, line count, suggested hours, rule / AI split (no source item titles) | Internal | P04: `timesheet.prefill.ready.employee`; P09 (suggestion acceptance; never shown to managers per person) | No | W5 |
| `coach.nudge.sent` | 1 | P23 coach job after P04 scheduler SCH-96 (YX-AST-10) | manager, week, nudge count, signal types (no team-member signal values) | Internal | P04: `coach.nudge.weekly.manager`; P09 (nudge action rate) | No | W5 |
| `coach.optout.changed` | 1 | P23 YX-AST-10 / 18 (manager opt-out or company frequency change) | scope (manager / tenant), manager, opted out flag or frequency | Internal | P23 (SCH-96 audience); P08 audit | No | W5 |
| `review_assist.flag.resolved` | 1 | P23 YX-AST-11 (manager accepts, edits or ignores a draft or bias flag) | review id, flag type (draft / gendered / personality / age / vague / inconsistent), outcome (accepted / edited / ignored); no review text | Confidential | P09 (aggregate bias-flag metrics, small-group suppression, A13 / T05) | No | W5 |
| `tax_scenario.saved` | 1 | P23 YX-AST-12 (employee saves a comparison or what-if) | scenario id, employee, tax year, law version (no amounts) | Confidential | P09 (regime choice split, aggregate only; never manager or per-person reports) | No | W3 |
| `tax_regime.compare.reminder_due` | 1 | P04 scheduler SCH-97 | employee, tax year, window close date | Internal | P04: `tax.regime_compare.reminder.employee` | No | W3 |
| `salary_split.suggested` | 1 | P23 YX-AST-13 (Suggest split on a compensation / offer screen) | CTC event ref, option count, law version, checks passed | Confidential | P08 audit (options shown); P09 | No | W3 |
| `salary_split.chosen` | 1 | P23 YX-AST-13 (HR picks an option) | CTC event ref, option id, chosen by | Confidential | M03 (salary structure on the CTC event); P08 audit; P09 (take-home gain) | No | W3 |
| `salary_split.stale` | 1 | P23 YX-AST-13 (on `statutory.rule.published` affecting a saved suggestion) | suggestion ids, law rule set, version | Internal | P04: `salary_split.stale.hr` | No | W3 |
| `insurance.quote.received` | 1 | P23 YX-AST-14 (broker / corporate-agent partner returns quotes) | quote request id, partner id, quote count, window closed flag (no premiums in the payload) | Confidential | P04: `insurance.quotes.ready.owner`; P09 | No | W5 |
| `insurance.purchased` | 1 | P23 YX-AST-14 / 19 (purchase confirmed by the partner) | quote request id, partner id, insurer, plan type, cover start date | Confidential | P04: `insurance.purchased.hr`; M11 (benefit plan created); P08 audit; P14 (partner commission where IRDAI permits); P09 | No | W5 |
| `insurance.endorsement.synced` | 1 | P23 YX-AST-15 (joiner / leaver endorsement confirmed by the partner) | plan id, partner id, added / removed counts, effective date | Confidential | P04: `insurance.endorsement.synced.hr`; M11 (enrolments updated); P09 | No | W5 |
| `marketplace_partner.licence.expiring` | 1 | P04 scheduler SCH-98 | partner id, licence type, expiry date | Internal | P04: `marketplace_partner.licence.expiring.yx` | No | W5 |
| `marketplace_partner.licence.expired` | 1 | P23 YX-AST-14 (licence expiry date passed) | partner id, licence type, expired on | Internal | P04: `marketplace_partner.licence.expired.admin`; P23 (offer hidden, open quotes withdrawn); P08 audit | No | W5 |
| `perks.settings.changed` | 1 | P23 YX-AST-16 / 18 (company switches perks on / off or changes categories) | enabled flag, categories, changed by | Internal | P23 (Perks tab shown / hidden); P08 audit | No | W5 |
| `perk.redeemed` | 1 | P23 YX-AST-16 / 19 (after the employee consents to the fields shared) | redemption id, employee, partner id, offer id, fields consented (names only), consent record id | Personal | P04: `perk.redeemed.employee`; P08 audit; P14 (partner commission); P09 | No | W5 |

---

## 3. Consumer-matrix issues fixed

GAP-REGISTER F2 found producers without consumers, consumers without producers and two producers for one fact. This catalogue settles them as follows; module docs are aligned when next edited.

| # | Issue (F2) | Resolution in this catalogue |
|---|---|---|
| 1 | **Two producers for statutory due dates:** M03 §6 emits `statutory.filing.due` and the P04 scheduler raises "statutory due dates" (§4.6). | **One producer:** the P04 scheduler rule **SCH-07** reads the P07 compliance calendar (`calendar_rules` × the entity's `statutory_registrations`) and emits `compliance.due.upcoming` / `compliance.due.overdue`. **M03 emits only `statutory.filing.filed`** (and `.rejected` on the partner path), which marks the calendar item done so reminders stop. `statutory.filing.due` is retired. |
| 2 | **M09 promotion celebrations need `document.issued`**, which P05 didn't emit. | **P05 emits `document.issued`** for every issued letter or system document (letter type in the payload). M09 posts the promotion celebration when the letter type is *promotion* (M09 Q5: "only after the letter is issued"); P04 sends `document.issued.employee`. |
| 3 | **M09 / M10 never emitted the reward, referral and clawback events M03 consumes** as one-time-pay sources. | M09 emits **`engage.reward.redeemed`**; M10 emits **`ats.referral.eligible`** (SCH-63), **`ats.bonus.clawback`** and **`ats.commission.earned`**. M03 consumes all four as named one-time-pay sources (M03 §3); clawbacks also reach the F&F (YX-LC-07). |
| 4 | **M05 never subscribed to payroll outcomes.** | M05 consumes **`payroll.run.paid`** (claims routed via payroll → paid, `expense.claim.paid`; advance instalments recovered), **`payroll.run.voided`** (claims back to approved-unpaid, queued for the next run), **`payment.failed`** (claim payment failed, re-routed, YX-EXP-07) and **`recovery.deferred`** (advance instalment deferred under protected net pay; the open balance is kept and goes to the F&F if still open). |
| 5 | **`employment.exited` was consumed only by Engage and face-template deletion.** | Consumers follow the M01 D6 deprovisioning table: T+0 / T+N handlers subscribe to **`employment.exited`** (P02, M04, P10, P11, P03, M08, M09, M05, M10, P05, P14); "At LWD" handlers subscribe to the scheduler event **`employment.lwd_approaching`** (P03, T04 / T05, M07, M08, M06, M10, M01 assets). Each handler reports its status to the exit case's deprovisioning panel (YX-LC-14). |
| 6 | **Duplicate key for dated changes:** P01 `employee.assignment.effective` vs P06 `employee.change.effective`. | One key, **`employee.change.effective`** (P06 is the writer of dated facts). The P01 name is retired (§1). |
| 7 | **Docs without "Events emitted":** M01, M02, M08, T02–T05, P05, P08. | Their events are listed in §2 (P05 §2.5, P08 §2.7, M01 §2.10, M02 §2.11, M08 §2.16, T02–T05 §2.19–2.22). This appendix is the authoritative list until each doc gains its own line. |
| 8 | **Sensitivity per event never assigned.** | Every row has a P02 class (§1) and, where public, a thin-payload flag. |
| 9 | **Approval notifications could double up** (P03 generic events and module events such as `leave.request.submitted`). | APX-A rule 1: a request type with its own notification rows uses them; the router sends one of the two per request × recipient. Both events stay in the catalogue because P09 and webhooks use them. |
| 10 | **Leave approval side effects were implicit.** | **`leave.request.approved`** is consumed by P10 (calendar out-of-office), P03 (automatic delegation while away, Q3) and the M02 day engine; `leave.request.cancelled` reverses both. |
| 11 | **Staffing lifecycle events had no consumers listed.** | **`ats.placement.ended`** → M02 (timesheets close), M03 (bench pay), M10 bench status; **`timesheet.approved`** → M03 rate-based pay and M10 invoice lines (YX-ATS-10). |
| 12 | **Case outcomes had no path to payroll and lifecycle.** | **`case.action.applied`** → M03 (subsistence allowance, deductions), M01 (termination → exit case), M02 (suspended status), M07 (training); **`case.closed`** → M01 (held letters / F&F released, YX-LC-23). Case events are never public webhooks. |
| 13 | **Gap-register features (26 Sep 2026) listed events "to be catalogued"** (M06, M07, M10, M12, M13, P17, P18, T05 B5 / A13, T06–T08, M01–M05 extensions, P14 C8). | All added in §2 (83 keys). One key per fact kept: M12 `timesheet.missing` is the existing scheduler event **`timesheet.due`** (SCH-37); CLRA register and return due dates come from **SCH-07** `compliance.due.upcoming`, not an M13 event; a missing wage-payment proof is **`clra.alert.raised`** (type *unpaid wages*); fairness findings for T06 instruments use the T05 key **`assess.fairness.finding.raised`** (single producer, EVT-7); project invoices reuse **`ats.invoice.issued`** (`source = project`). |

---

## 4. CI rule (event registry check)

Events and subscriptions are declared in code: an **event registry** (key, version, producer module, payload schema, sensitivity, public flag, wave, `metrics_only` flag) mirrored into the P11 `event_catalogue` table, and a **subscription registry** (consumer module, event key + version, handler). The build runs these checks and fails on any error:

| Check | Fails when |
|---|---|
| **EVT-1 Catalogued** | A module emits an event key or version that is not in this appendix / the registry. |
| **EVT-2 Consumed** | A registered event has **no consumer** (no P04 notification type, no module handler, no P09 metric) and is not marked `metrics_only`. |
| **EVT-3 Subscribed to something real** | A consumer (P04 notification type trigger, module handler, webhook default subscription) references an event key or version that is not registered. Every P04 notification type (APX-A) must reference a registered event or a scheduler rule `SCH-nn`. |
| **EVT-4 Sensitivity** | An event has no sensitivity class, or its payload schema contains a field whose P02 class is higher than the declared class. |
| **EVT-5 Thin public payloads** | An event marked public with class Confidential or Special has a webhook payload schema with fields other than IDs, type, version, timestamps and change type (YX-API-10); or an M08 case event is marked public. |
| **EVT-6 Versioning** | A payload schema changes incompatibly without a new version, or a version is removed before its notice period ends (P11 Q3). |
| **EVT-7 Single producer** | Two modules register the same event key (e.g. the retired `statutory.filing.due` next to `compliance.due.upcoming`). |

The same registry drives the public webhook event picker (P11 §7) and the developer-portal event reference: only rows marked **Webhook: Yes** appear there.
