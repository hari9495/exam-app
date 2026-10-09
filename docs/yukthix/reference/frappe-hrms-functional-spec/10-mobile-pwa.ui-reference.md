# 10 · Mobile PWA — UI Reference

> **Purpose.** Bring together all Frappe HR mobile (PWA) screens captured in modules 01–06, add the manager and shell screens, and define the YukthiX mobile app structure (decision D13).
> **Companion to:** [10-mobile-pwa.md](10-mobile-pwa.md) (behaviour).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). The mobile pattern P5 is defined there.
> **Captured:** 24 Sep 2026 on the local test instance at a 390 × 844 phone viewport, as Vikram (HR Manager, also an approver), Priya for expenses. 26 mobile screenshots in total: 7 new in [`../ui-screens/10-mobile/`](../ui-screens/10-mobile/), 19 earlier ones listed below. Internal reference only.

## Why the mobile app matters most

For an Indian SMB, most employees (field sales, operations, shop floor) will **only ever use the phone**: check in, apply leave, claim expenses, see payslips. Managers approve on the phone. The desk is for HR and finance.

Frappe's PWA is the **cleanest UI in the whole product**, and its shell is a good starting point. Its weaknesses lie in the details: wording, statuses, and approvals that fall back to raw forms.

**PWA basics seen:** the page declares "add to home screen" (Apple web-app tags, icons). An install prompt and offline support were not tested.

---

## 1. App shell & home — home + team requests [m01](../ui-screens/10-mobile/m01-home-team-requests.png), check-in confirm [m04](../ui-screens/10-mobile/m04-checkin-dialog.png), notifications [m05](../ui-screens/10-mobile/m05-notifications.png), profile [m06](../ui-screens/10-mobile/m06-profile.png), settings [m07](../ui-screens/10-mobile/m07-settings.png)

**Layout:**
- **Top bar:** app title, bell with an unread dot, avatar.
- **Bottom tabs:** Home, Attendance, Leaves, Expenses, Salary.
- **Home:**
  - Greeting card with the last check-out time and a **Check In** button.
  - Quick links (request attendance, shift, leave, expense, advance, salary slips).
  - A **My Requests / Team Requests** switch.
- **Team Requests:** a single mixed list of everything waiting from the team. Each row shows an icon per type, a title ("Calls & 1 more", "Night (10pm–6am)", "Sick Leave"), dates or amount, the person (avatar + name) and a status pill. This is a good pattern.
- **Check-in:** a bottom sheet with a big live clock ("06:04:43 pm · 24 Sep, 2026") and **Confirm Check In**. (Opened only; nothing was confirmed or recorded.)
- **Notifications:** "12 unread", Show all, Mark all as read. Each item is sentence-style ("Priya Sharma raised a new Expense Claim for approval: HR-EXP-2026-00003"), then Load more.
- **Profile:** avatar, name, designation; links to employee, company, contact and salary information; settings; log out.

**Observed:**
- **Team Requests mixes drafts with pending items.** Arjun's *draft* claim and Priya's *draft* On-Duty request appear next to open items, although drafts are not yet sent for approval. There are no approve/reject buttons on the rows.
- **Notifications are one per document and end with a raw ID.** There is no grouping ("5 leave requests waiting") and no action from the notification itself.
- **The check-in sheet shows only time.** There is no shift, location or geofence status, and no selfie (module 02 §1.12).
- There is no search and no language switch.

## 2. Approving on mobile — team leave list [m02](../ui-screens/10-mobile/m02-leave-team-tab.png), leave approval view [m03](../ui-screens/10-mobile/m03-leave-approval-view.png)
- **Layout:** opening Priya's open leave request as the approver shows the **full editable form**:
  - employee, leave type, company and department dropdowns;
  - date pickers, total days, reason;
  - approver, "follow via email", posting date, **Status dropdown**;
  - attachments, and a **Submit** button pinned at the bottom.
- **Observed:** this is the desk approval problem (Leave U3) on a phone. The approver must scroll, change "Status" to Approved, then press Submit. There are:
  - no Approve / Reject buttons;
  - no balance or team-availability context;
  - input fields the approver shouldn't touch (dates, type) left editable.
- **YukthiX:** an **approval card**:
  - Who and what ("Priya · Privilege Leave · 12–16 Oct · 5 days").
  - Balance after approval, "2 others off", the reason and any attachment.
  - Large **Approve** / **Reject** buttons, with an optional comment.
  - Swipe approve and bulk-approve from the Team list.
  - The same card for every request type (leave, attendance, shift, expense, advance).

## 3. Screens from earlier modules (kept in place)

| Area | Screens | Main findings (see the module doc) |
|---|---|---|
| Leave | [01 m1–m5](../ui-screens/01-leave/) home, leave dashboard, apply, list, detail | Good balance cards; "7.5/7.5" wrong denominator; no 1st/2nd-half choice; read-only detail rendered as inputs (Leave §2.15, U11) |
| Attendance | [02 m1–m7](../ui-screens/02-attendance/) check-in, calendar, punch history, requests, shift request, assignments | Late days shown green; raw punch log; employee picks own approver (Attendance §1.12, U23) |
| Salary | [03 m1–m2](../ui-screens/03-payroll/) salary home, payslip | Payslip opens on a tab with no money; YTD ignores opening balances; tabs cut off (Payroll §1.13, U29/U31) |
| Expenses | [06 m1–m5](../ui-screens/06-expenses/) dashboard, new claim, detail, advances, new advance | Partial cut shown as "rejected"; pill overflow; no camera-first capture (Expenses §1.9, U68) |
| Statutory, lifecycle, performance, recruitment, training | — | **No mobile screens exist in Frappe** |

## 4. YukthiX mobile app — target structure

**Bottom tabs (5):** **Home · Time · Requests · Pay · Me**

| Tab | Contents | Built from |
|---|---|---|
| **Home** | Check-in card (shift, location status, selfie option, offline queue) · to-dos (approve 3, self-review due, proof upload) · announcements · holidays | m01, 02-m1 |
| **Time** | Attendance calendar with late/early dots · day card with punches + *Fix* · leave balances · apply leave (range picker, half per end, live summary) · roster / my shifts | 01-m2/m3, 02-m2/m3 |
| **Requests** | *Mine* / *Team* lists. Team = approval cards with Approve/Reject and bulk. Types: leave, regularise, WFH, on-duty, shift, expense, advance, overtime | m01, m03 |
| **Pay** | Payslips (net first, days strip, tax card) · tax centre (regime, declarations, proofs) · expenses (camera-first) · advances · Form 16 | 03-m1/m2, 06-m1…m5 |
| **Me** | Profile & documents · goals and feedback (quick feedback) · learning & certificates · helpdesk cases · settings (language, notifications) | m06, m07 |

**Cross-cutting rules for mobile:**
1. **Every approval is one tap** with context; never a form.
2. **Read-only data is shown as text, not disabled inputs.**
3. **Names, not IDs**, everywhere (notifications, approver fields).
4. **Grouped, actionable notifications:** "3 leave requests waiting · Review".
5. **Offline tolerant:** check-in, drafts (leave, expense) and receipts queue and sync later.
6. **Languages:** English + Hindi + Tamil + Telugu first (India launch), with plain-language labels.
7. **Low-end Android first:** small bundle, works on 3G, dark-mode aware.
8. **Push + WhatsApp** as notification channels (exam app already has WhatsApp/SMS templates).
9. **Beyond HR:** the same shell can host candidate views (exam app's candidate portal) and proctored assessments, so it becomes one YukthiX app.

---

## 5. UI issues seen on the instance (do not copy)

U1–U90 are in modules 01–09.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U91 | Mobile approval | Approver gets the full editable form; approve = change Status + Submit. | Approval card with Approve/Reject. |
| U92 | Team Requests | Drafts mixed with items actually awaiting approval; no row actions. | Only pending items; inline actions. |
| U93 | Notifications | One per document, ending with a raw ID; no grouping or action. | Grouped, actionable, names not IDs. |
| U94 | Check-in sheet | Time only; no shift, location or geofence feedback. | Context-rich check-in. |
| U95 | Coverage | No mobile screens for statutory, lifecycle, performance, training or helpdesk. | Mobile for every employee-facing flow. |

---

## 6. Capture notes

- **New mobile screens:** as Vikram (Administrator temporarily linked to HR-EMP-00002, single-use login key).
  - The check-in sheet was **opened but not confirmed**. We verified that no new check-in was created: the only punch dated today is demo data (Rahul, 06:08 OUT).
  - A "team expense claims" capture came out blank and was dropped.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); employee link (removed); one-time key (used once).
- **This completes the UI reference for modules 01–10.**
