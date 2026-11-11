# Visitors: designs and what exists (audit)

This file checks, story by story, every Visitors design sub-page against what is live, in the same shape as
`hiring-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the designed one
live.

Status 10 Nov 2026 (branch `docs/yukthix-visitors-map`, from `test/yukthix-main` at 61b163d4a). Audit only: nothing was
built.

## What is live today (plain English)

- **Slice 1 is live (15 Nov 2026, branch `feat/yukthix-visitors-1`):** hosts invite visitors (Visitors › My visitors);
  the visitor gets an email with their link (/yx/visit/…): details, the notice, the QR pass; reception checks them in and
  out at its location (Visitors › Today's visitors); the log with CSV; Settings › Time & Leave › Visitors (3.12). Visits
  are deleted after the location's period with counts kept; forgotten check-outs close at the end of the window.
- **Slice 4 is live (17 Nov 2026, branch `feat/yukthix-visitors-4`):** the badge PDF the desk prints from the browser,
  reports from counts (no names) and the emergency roll-call (Visitors › Roll-call) with visitors and employees.
- **Slice 3 is live (16 Nov 2026, branch `feat/yukthix-visitors-3`):** the watch-list (Visitors › Watch-list, HR and
  Facility admins only), ID proof per location (type and last 4, or also a photo of the ID) and visitors under 18 with
  a named adult.
- Before slice 1 nothing of Visitors was live (no visitor table, no key, no page).
- The designs are complete in the kit: the reception desk, the host's pre-registration and approval card, the visitor
  kiosk, the log and reports, the visitor's own invite page (T9-14), the host's mobile list and Settings 3.12.
- One piece of the back end is ready: a Time device can already be enrolled in **visitor mode** (`time_devices.mode`
  = `visitor`), and the attendance kiosk refuses to check employees in on it.
- The rules are written: M02 §B11 and YX-AT-22 (visitor management), M04 YX-MOB-16 (host approval card), APX-A
  notification types `visitor.invite.visitor` and `visitor.walkin.approval.host`, APX-G G-27 (visitor privacy notice).

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Front desk and kiosk | 2 | 21 | 1 | 0 | 0 | 0 | 22 |
| B. Hosts | 2 | 7 | 1 | 0 | 0 | 4 | 12 |
| C. The visitor's own pages | 1 | 7 | 0 | 0 | 2 | 0 | 9 |
| D. Log, reports and settings | 4 | 12 | 2 | 0 | 0 | 0 | 14 |
| **All Visitors design groups (A–D)** | **9** | **47** | **4** | **0** | **2** | **4** | **57** |

Recounted by script 10 Nov 2026 on `feat/yukthix-visitors-2` after 711 (VIS-02 ApprovalSend drawn and live): 46 live, 4 with a gap, 2 not built, 4 phone views of 56.
Recounted by script 10 Nov 2026 on `feat/yukthix-visitors-2` after merging slice 4 (test main e26aaa556): 45 live, 4 with a gap, 2 not built (T9-14 Photo, PhotoBlocked), 4 phone views.
Recounted by script 10 Nov 2026 on `feat/yukthix-visitors-2` after merging slice 3 (test main 4b5598706): 38 live, 7 with a gap, 3 not built (T9-14 Photo, PhotoBlocked; VIS-04 Reports), 4 phone views; the kiosk's See reception is live with the watch-list.
Recounted by script 16 Nov 2026 on `feat/yukthix-visitors-3` after Visitors slice 3: 33 stories live (8 with a gap);
8 new stories drawn and live (VIS-01 CheckInIdPhoto and CheckInMinor, VIS-02 InviteMinor, VIS-05 the watch-list: List,
Add, Remove, Empty, Loading); 11 wait for slices 2 and 4; 4 phone views wait for the app.

Recounted by script 10 Nov 2026 on `feat/yukthix-visitors-2` after Visitors slice 2: 26 live, 9 with a gap, 5 wait for slices 3-4, 4 phone views; 4 new stories drawn and live (VIS-01 AddWalkIn and DecideForHost, VIS-02 Approval, VIS-03 Pass).
Recounted by script 15 Nov 2026 on `feat/yukthix-visitors-1` after Visitors slice 1: 23 stories live (9 with a gap), 1 new
story drawn and live (VIS-01 FindPass); 13 wait for slices 2-4; 4 phone views wait for the app.


Counted by script 10 Nov 2026 on `docs/yukthix-visitors-map` (the script is in the appendix): the 26 stories under
Screens/Visitors (VIS-01 to VIS-04), the 9 of Screens/Portals/T9-14 · Visitor invite page, the 2 visitor stories of
Screens/Mobile/Requests and Me tabs (`Visitors`, `VisitorsArrived`) and the 2 of Settings 3.12 (`P3_12`,
`P3_12_ReadOnly`). The 4 phone views are VIS-02 Phone, PhoneApproval and PhoneInvite and the Mobile "arrival alert": they need the phone
app, which is not built. Until then the web pages at phone width cover the same work (Mobile "Me · my visitors" is
counted as a page for that reason).

Kit parts (not stories, reusable): `VisitorBadge`, `VisitorDeskScreen`, `PreRegisterForm`, `PreRegisterScreen`,
`VisitorKioskScreen`, `VisitorLogScreen` (`screens/ops/visitors.tsx`), sample data (`visitors-data.ts`), the ops shell's
Visitors menu (Today's visitors, Invites, Visitor log, Watch-list, Roll-call, Reports; `ops-kit.tsx`; Kiosks & badges dropped, answer 617), `retentionLeft`
(`ops-rules.ts`), `MobileVisitorsScreen` (`settings/mobile-me.tsx`), `KioskFrame` (`_kit/frames.tsx`), `TenantPortal`
and `CameraFrame` (portals kit), and the Settings 3.12 page definition (`registry-g3.ts`, keys `vis.*`).

The **Kiosks & badges** menu item is dropped (answer 617, slice 4): kiosks are enrolled on the Time devices page and the
badge layout is one Settings 3.12 field.

## 1. Live pages

None.

## 2. Live pages with no design

None.

## 3. Designs with no live page or API

All 39 stories below.

## 4. Design groups, story by story

### A. Front desk and kiosk

#### VIS-01 · Today's visitors

| story (sub-page) | verdict | note |
|---|---|---|
| Expected · Expected · walk-in waiting for host | live | live 15 Nov 2026 at /yx/visitors (Reception role, per location): expected visitors of the location's day; slice 2 (10 Nov 2026): the walk-in waiting for the host with the time reception decides from, Decide for host once it has passed |
| OnSite · On site now (emergency list) | live | live: everyone checked in and not out (a walk-in with its photo for reception, 713: `GET visitors/desk/visits/:id/photo`, the desk key at the location, while waiting or on site, never cached), "Print badge" again (607), and the Roll-call button to the printable roll-call with employees (VIS-06, slice 4) |
| CheckedOut · Checked out | live | live: checked out, and closed as "Not checked out" at the end of the window (611) |
| Declined · Declined walk-ins counted on their own (797) | live | answer 797: a walk-in the host or reception declined has its own tab and count ("… checked out · N declined"), never counted as checked out |
| CheckIn · Check in · notice and badge | live | live: check in (`POST visitors/:id/check-in`); the notice, and (slice 2) the visit type's NDA and induction, ticked at the desk when not accepted on the link; the ID type and last 4 where the location takes ID (slice 3, 603); under 18 the named adult (614); "Check in and print badge" opens the label-size badge PDF (slice 4, 607; none where the pass is on the phone only), a photo badge carries the walk-in's photo (713, never under 18); reception sees the walk-in's photo while it waits and while on site (713) |
| CheckInIdPhoto · Check in · ID type, last 4 and photo of the ID | live | drawn 16 Nov 2026 (slice 3, 603): where the location keeps a photo of the ID, reception adds it (`POST visitors/:id/id-image`) with the type and last 4; private storage, virus-checked before it opens, deleted after the ID retention; never of an Aadhaar card |
| CheckInMinor · Check in · visitor under 18 with an adult | live | drawn 16 Nov 2026 (slice 3, 614): no ID and no photo; reception ticks that the named adult is there |
| FindPass · Scan or type the QR pass | live | drawn 15 Nov 2026: "Scan QR pass" takes the scanned or typed pass code (`POST visitors/desk/find`); a pass for another location or day is refused with the reason |
| AddWalkIn · Add a walk-in · type, host, NDA and induction | live | drawn 10 Nov 2026 (slice 2, answers 604, 606, 610): name, mobile, company, visitor type, purpose, host (searched, `GET visitors/desk/hosts`); the notice and the type's NDA and induction read and ticked (`GET visitors/desk/needs`); outside the allowed hours a reason (audited `visitor.hours_overridden`); `POST visitors/walk-ins`, the host is told (bell and email) |
| DecideForHost · Decide for the host after the timeout | live | drawn 10 Nov 2026 (604): after the host's minutes (`visitors.host_timeout_minutes`, default 10) reception lets them in or declines with a reason (`POST visitors/walk-ins/:id/decide`; before the deadline 409); audited `visitor.walkin_decided` with who decided; the walk-in's photo shows here for reception (713) |
| Blocked · Blocked visitor stopped | live | live (slice 3, 605): a visit matching the watch-list, or such a pass scanned, shows "Stop at reception" with the name only; no check-in; the reason is never shown |
| Empty · Empty | live | no visitors today |
| Loading · Loading | live | loading |

#### VIS-03 · Visitor kiosk

| story (sub-page) | verdict | note |
|---|---|---|
| Welcome · Welcome | live | slice 2 (10 Nov 2026): /yx/kiosk on a tablet enrolled in visitor mode (`GET visitor-kiosk/me`, the tablet's own secret, limited per kiosk; an attendance kiosk is refused 403); only where the location turned the kiosk on (`visitors.kiosk`, 601, default off) and inside the allowed hours (610) |
| Details · Walk-in details | live | name, mobile, company, visitor type, who they meet (matched to exactly one active person, else see reception) |
| Photo · Photo | live | the tablet camera (602, `visitors.photo` on by default): a JPEG kept in private storage, shown only to the host on the approval card, deleted with the visit; a blocked camera sends them to reception |
| Notice · Notice acknowledgement | live | redrawn 10 Nov 2026: the notice, and the visitor type's NDA and safety induction (published Policies versions), each with its own tick (`POST visitor-kiosk/needs`); recorded per visit; an NDA counts for a year for the same person and company (606) |
| Waiting · Waiting for host | live | `POST visitor-kiosk/walk-ins` then `GET visitor-kiosk/walk-ins/:id` every few seconds (only the kiosk that started it can read it) |
| Badge · Badge and QR | live (gap) | the badge on screen with the pass code; printing comes with slice 4 |
| SeeReception · See reception (blocked or problem) | live | kiosk off, outside the allowed hours, a host nobody (or several) match, a pass not for today here, a blocked camera, a watch-list match (605, `watchHit`; audited, nothing kept), or an ID photo the location keeps (taken at reception only); never the reason |
| Rejected · Host declined | live | the host (or reception after the timeout) declined |
| Pass · Scan or type my pass | live | drawn 10 Nov 2026: a pre-registered visitor's pass on the kiosk (`POST visitor-kiosk/pass`), then only what is left to accept, then checked in (`POST visitor-kiosk/visits/:id/check-in`) |

### B. Hosts

#### VIS-02 · Pre-register + my visitors

| story (sub-page) | verdict | note |
|---|---|---|
| MyVisitors · My visitors | live | live at /yx/visitors/invites: the host's own visitors; cancel while expected; a blocked visit says only that it can't go ahead (slice 3) |
| Invite · Invite a visitor | live | live: name, mobile (Indian or +country code), email (the pass goes there, answer 609), company, purpose, location, day, times in the location's time, vehicle; visitor type (slice 2, 606); under 18 with the adult (slice 3); a window outside the allowed hours is warned about in the toast, never refused (652); the ID type field is gone from the drawing (664: the visitor or reception gives it) |
| InviteMinor · Invite a visitor under 18 | live | drawn 16 Nov 2026 (slice 3, 614): "The visitor is under 18" asks for the adult who comes with them |
| Sent · Invite sent | live | toast with the pass code; the email carries the link to the pass page |
| Empty · Empty | live | no visitors yet |
| Phone · My visitors · phone | phone view, mobile app not built | the web page at phone width serves it until the app |
| PhoneApproval · Walk-in approval card · phone | phone view, mobile app not built | the phone app; the web card (Approval) serves it at phone width |
| Approval · Walk-in approval card | live | drawn 10 Nov 2026 (604, 602): on My visitors, each walk-in asking for the host (`GET visitors/approvals`, every 15 s) with the photo (`GET visitors/walk-ins/:id/photo`, the host only, while waiting, never cached; the page drops it when the card goes); Approve or Reject (`POST visitors/walk-ins/:id/decide`); Send someone (711, see ApprovalSend) |
| ApprovalSend · Walk-in approval · send someone | live | drawn 10 Nov 2026 (711): the host picks a colleague (`GET visitors/walk-ins/:id/colleagues`, the host only, while it waits) and sends (`POST visitors/walk-ins/:id/send`); the colleague becomes the host: the card, the photo and the location's minutes from now, told by bell and email with who sent them; the host's card and photo go; audited `visitor.walkin_sent` (from, to, deadline); a decision or another send meanwhile wins (409) |
| PhoneInvite · Invite · phone | phone view, mobile app not built | the web invite at phone width until the app |

#### Requests and Me tabs

| story (sub-page) | verdict | note |
|---|---|---|
| Visitors · Me · my visitors | live (gap) | served by /yx/visitors/invites at phone width (not the drawn phone component) |
| VisitorsArrived · Me · my visitors · arrival alert | phone view, mobile app not built | the arrival alert needs the phone app |

### C. The visitor's own pages

#### T9-14 · Visitor invite page

| story (sub-page) | verdict | note |
|---|---|---|
| Details · Your details | live | live at /yx/visit/[link]: the details, mobile masked, vehicle number |
| Id · ID | live | live (slice 3, 603): where the location takes ID, the visitor gives the ID type and last 4 before the notice (never a full number); none for a visitor under 18 |
| Photo · Photo · camera live | design only, feature not built | the visitor photo is taken on the kiosk (slice 2); a photo on the visitor's own link is not built (never for a visitor under 18, 614) |
| PhotoBlocked · Photo · camera blocked | design only, feature not built | as above |
| Notice · Privacy notice, induction and NDA | live | live: the location's notice and the privacy line, accepted at its version (a changed notice is read again); slice 2: the visitor type's NDA and induction texts and ticks, recorded at their versions |
| Pass · QR pass | live | live: the QR pass after the notice |
| PassDesktop · QR pass · desktop | live | same at desktop width |
| Expired · Pass expired | live | used, closed or past the window |
| Blocked · Visit blocked | live | live for a cancelled visit and a watch-list match (slice 3): no pass, "contact your host", no reason |

### D. Log, reports and settings

#### VIS-04 · Visitor log & reports

| story (sub-page) | verdict | note |
|---|---|---|
| Log · Log · retention countdown | live | live at /yx/visitors/log (log or desk key, per location): the day each visit is deleted (608); the ID shown and "Photo of ID" (audited; slice 3); export CSV for audit (no mobile numbers) |
| Reports · Reports by location, purpose, host | live | live (slice 4, 608): counts only, no names: by location, purpose and month, from the counts kept after deletion and the visits still kept; "by host" and average stay were dropped from the drawing (names; not in the counts) |
| Empty · Empty | live | no visits |
| Loading · Loading | live | loading |

#### VIS-05 · Visitor watch-list

| story (sub-page) | verdict | note |
|---|---|---|
| List · Watch-list | live | drawn and live 16 Nov 2026 (slice 3, 605) at /yx/visitors/watchlist: HR and Facility admins only (`visitors.watchlist.manage`, company-wide); the reasons; the day each entry lapses |
| Add · Add a person | live | name, mobile (optional; matched by mobile, then name), reason; audited without the reason; expected visits that match are blocked at once |
| Remove · Remove an entry | live | asks first; audited; visits already blocked stay blocked |
| Empty · Empty | live | nobody on the list |
| Loading · Loading | live | loading |

#### VIS-06 · Emergency roll-call

| story (sub-page) | verdict | note |
|---|---|---|
| RollCall · On site now · visitors and employees | live | drawn and live 17 Nov 2026 (slice 4, 612) at /yx/visitors/rollcall: visitors checked in and employees whose last check-in today was at the location; one A4 PDF to print (audited); for reception, security and HR (`visitors.rollcall.view` or the desk key there) |
| Empty · Empty | live | nobody on site |
| Loading · Loading | live | loading |

#### Group 3 · Time & Leave

| story (sub-page) | verdict | note |
|---|---|---|
| P3_12 · 3.12 Visitors | live (gap) | live at /yx/settings/visitors: host timeout, ID capture (off, type and last 4, or also a photo of the ID), photo, hours, notice, badge, retention, the watch-list link and its review period (slice 3); slice 2: visitor types (escort, NDA and induction policies, `PUT visitors/types`, audited) and the visitor kiosk toggle (drawn); per location where the founder said so |
| P3_12_ReadOnly · 3.12 Visitors · read-only | live (gap) | reception and anyone without the company-wide settings key read it |

## 5. What can be reused, and what is missing

Reuse (exists today):

| Need | Reuse | Where |
|---|---|---|
| Every screen | the drawn kit screens and their sample data | `packages/yx-ui/src/screens/ops/visitors.tsx`, `visitors-data.ts`, `mobile-me.tsx`, `portals/t9-14-visitor` screens |
| Visitor kiosk device | Time devices with `mode: 'visitor'`, enrolment codes, approval of a device, last seen | `apps/api/src/time/devices*`, `time_devices`; web devices page |
| Kiosk page shell | `KioskFrame`; the attendance kiosk page and its device token sign-in | `_kit/frames.tsx`, `apps/api/src/time/kiosk.service.ts` |
| Camera capture | `CameraFrame` (face, ID card, QR guides) and the candidate face-enrolment camera step | portals / time / ops kits; `apps/web/app/(candidate)/components/FaceEnrolmentStep.tsx` |
| Visitor's public pages | the token-link page pattern (offers, interviews, application status) and `TenantPortal` with company logo, colour and white-label | `public-applications`, `public-brand.ts`, `portals-kit.tsx` |
| QR pass and printed badge | `qrcode` and `pdfkit` / `pdf-lib` (letters already print a QR) | `apps/api/src/documents/letters/pdf.ts` |
| Host approval with a timeout | the P03 approvals engine (tasks, inbox, decisions) | `apps/api/src/approvals` |
| Messages | notifications (bell, email, digest); SMS and WhatsApp channels with opt-in | `notifications`, `sms-channel`, `whatsapp` |
| ID image storage | private blob storage with virus scan (fail closed) | documents / careers résumé scan |
| NDA / induction acknowledgement | the Policies module (versioned documents, acknowledgements) | `apps/api/src/policies` |
| Settings | the settings registry, `settingFor`, a live Settings page from its design (as 6.1 Hiring) | `org-structure/settings-registry.ts`, `screens/settings/hiring-live.ts` |
| Retention | scheduled delete-after-N-days jobs | `talent/retention.service.ts`, `proctoring-retention` |
| "On site now" | the Time Today board (employees checked in) | `apps/api/src/time/attendance-ops*` |
| Locations and hosts | P01 locations (state, time zone) and employees / users | org structure, People |
| Safety | workplace accident cases (a visitor injury can be recorded there) | `apps/api/src/accidents` |

Missing (to build):

- Tables: visitor types (or settings), visits (expected, walk-in, checked in, checked out, declined, cancelled), the
  watch-list, acknowledgements per visit, ID records; all with RLS and the retention delete.
- Keys and roles: `visitors.desk.manage` (reception), `visitors.invite` (hosts: every employee), `visitors.settings.manage`
  (Settings 3.12), `visitors.watchlist.view` / `.manage`, `visitors.report.view`; a "Reception" role template.
- The `vis.*` company settings in the API registry, and Settings 3.12 live.
- Web pages and the Visitors menu area; the kiosk page in visitor mode; the public invite page.
- Notification types `visitor.invite.visitor` and `visitor.walkin.approval.host` (APX-A) and the "arrived" alert.
- Badge print (a label-size PDF the desk prints from the browser).
- The G-27 visitor privacy notice text (a go-live item for the DPO).
- A design for the "Kiosks & badges" menu item (or drop the item: kiosks stay on the Time devices page).

## 6. Questions for the founder (before building)

Every policy below becomes a company setting (most per location) with the suggested answer as its default.

601. **Where walk-ins sign in.** Kiosk (a tablet in visitor mode), the reception desk screen, or a guard's phone.
     *Suggested: kiosk and reception desk both; a guard uses the reception desk page on a phone (no separate guard
     app). Setting per location: kiosk on / off (default off).*
602. **Visitor photo.** *Suggested: on by default (`vis.photo`); shown to the host only on the approval card and gone
     from their phone after the decision; deleted with the visit.*
603. **ID proof.** *Suggested: off by default (`vis.id_capture`), on per location where the site needs it. Keep the ID
     type and the last 4 digits only, never a full Aadhaar number (UIDAI rules); the ID image only if the location asks,
     deleted after 30 days (`vis.id_retention_days`).*
604. **Host approval.** *Suggested: every walk-in needs the host's yes; a pre-registered visitor does not. The host has
     10 minutes (`vis.host_approval_timeout`), then reception decides; the host can name someone else to meet them.*
605. **Watch-list (blocked visitors).** *Suggested: HR or Facility admin adds a person with a reason (matched by mobile
     number, then name); audited; only HR and Facility admin see the list and reasons (`vis.watchlist_access`); reception
     and the kiosk only see "see reception"; each entry is reviewed once a year or it lapses.*
606. **NDA and safety induction.** *Suggested: set per visitor type (`vis.types`: NDA yes / no, induction yes / no,
     escort yes / no); the texts are company policy documents (Policies module, versioned); acknowledged on the invite
     page or the kiosk before entry; an NDA counts for 1 year for the same person and company, the safety induction
     every visit.*
607. **Badge printing.** *Suggested: no printer integration. The desk prints a label-size PDF badge from the browser,
     and every visitor also has the QR pass on their phone. Setting `vis.badge`: name badge with QR (default), photo
     badge with QR, or pass on phone only.*
608. **What is kept and for how long.** *Suggested: name, mobile, email (optional), company, purpose, host, location,
     times, photo, ID last 4 and acknowledgements. Visits are deleted after 90 days (`vis.retention_days`, 30–730); ID
     images after 30 days; report counts are kept without names. Watch-list entries stay until removed or lapsed.*
609. **Messages to visitors.** *Suggested: email by default; WhatsApp or SMS only when the visitor ticks consent on the
     invite page (paid channel, as for candidates).*
610. **Allowed hours.** *Suggested: per location (`vis.hours_from`, `vis.hours_to`, default 09:00–18:30); outside the
     hours the kiosk says "see reception" and reception may let a visitor in with a reason (audited).*
611. **Forgotten check-out.** *Suggested: at the end of the visit window (or the location's closing time) the visit is
     closed as "not checked out" in the log; no message.*
612. **"On site now" list.** *Suggested: reception, security and HR see it, together with employees checked in; one
     printable roll-call for evacuations.*
613. **Who is reception.** *Suggested: a new "Reception" role template (`visitors.desk.manage`), granted per location;
     Facility admin gets Settings 3.12 and the watch-list.*
614. **Visitors under 18.** *Suggested: allowed only with a named adult; no photo and no ID for them.*
615. **Visitors or contract labour.** *Suggested: daily contract workers use Contract labour gate passes, not Visitors;
     a contractor's one-off visit (an engineer for a repair) is a visitor of type "Contractor".*
616. **Repeat visitors.** *Suggested: no saved profile across visits; the host's invite fills the details each time, and
     everything is deleted at the end of the retention period.*
617. **The "Kiosks & badges" menu item.** *Suggested: drop it; kiosks are enrolled on the Time devices page (visitor
     mode) and the badge layout is one Settings 3.12 field.*

## 7. Build plan (slices, max 3 builders at once)

| # | Slice | Stories made live | Size | Rough effort |
|---|---|---|---|---|
| 1 | Data, keys, Settings 3.12 live (2); hosts pre-register (VIS-02 MyVisitors, Invite, Sent, Empty; Mobile "Me · my visitors" at phone width); invite email with the QR pass page (T9-14 Details, Notice, Pass, PassDesktop, Expired); reception's Today list with check-in / out by QR or search (VIS-01 Expected, OnSite, CheckedOut, CheckIn, Empty, Loading); the log (VIS-04 Log, Empty, Loading); the retention delete | 21 | M | 6–8 builder days |
| 2 | Walk-ins: the kiosk in visitor mode (VIS-03 Welcome, Details, Photo, Notice, Waiting, Badge, Rejected), the host's approval card on the web with the timeout to reception, NDA / induction acknowledgements | 7 | M | 6–8 builder days |
| 3 | Watch-list and ID capture (VIS-01 Blocked, VIS-03 SeeReception, T9-14 Id, Photo, PhotoBlocked, Blocked); ID image retention | 6 | S | 3 days |
| 4 | Badge PDF print, reports (VIS-04 Reports), the "on site now" roll-call with employees | 1 | S | 3–4 days |

Rough total: about 3–4 weeks for one builder; about 2 weeks with two builders once slice 1 is in (slices 2 and 3 can
run side by side). The slices make all 35 page stories live; the 4 phone views wait for the mobile app.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Visitors
story file in scope has exactly one row per story, in file order, with one of the five verdicts. Copied from
`hiring-design-map.md`; only the file list, the filter and the title match (double quotes too) differ.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/visitors-design-map.md and checks that every
// Visitors story file in scope has exactly one row per story, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const UI = 'packages/yx-ui/src/';
const files = [
  ...['vis-01', 'vis-02', 'vis-03', 'vis-04', 'vis-05', 'vis-06'].map((f) => UI + 'screens/ops/' + f + '.stories.tsx'),
  UI + 'screens/portals/t9-14-visitor.stories.tsx',
  UI + 'screens/settings/mobile-me.stories.tsx',
  UI + 'screens/settings/settings-g3.stories.tsx',
];
// Only the visitor stories of the Mobile Me tabs and of Settings group 3 (3.12).
const keep = (f, n) => (f.endsWith('mobile-me.stories.tsx') ? /^Visitors/.test(n) : f.endsWith('settings-g3.stories.tsx') ? /^P3_12/.test(n) : true);
const want = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const title = s.match(/title:\s*(['"])(.+?)\1/)[2].split('/').pop();
  // Capital first letter only: lower-case exports are sample props (excludeStories).
  want[title] = [...s.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]).filter((n) => keep(f, n));
}
const doc = fs.readFileSync('docs/yukthix/visitors-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 40), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
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
const all = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) };
for (const c of Object.values(counts)) for (const k in all) all[k] += c[k];
counts['All A-D'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```


Founder approved, 10 Nov 2026 (questions 601-617, all as suggested; each policy a company setting, mostly per location,
with the suggested answer as its default). Build Visitors first (slices 1-4), then Contract labour.
Founder approved, 10 Nov 2026 (questions 651-654, 661-665, 711-714, all as suggested): keep 651, 653, 654,
661, 663, 665, 712, 714; (652) warn the host when the window is outside the allowed hours, never refuse; (662) HR people
who keep the watch-list get the Facility admin role; (664) remove the ID type field from the invite drawing; (711) build
"Send someone" next (the named colleague gets the card with their own minutes, audited); (713) reception sees the photo
at check-in and on the photo badge, never on the host's phone after the decision.
Founder approved, 10 Nov 2026 (questions 761-765, all as suggested): (761) the slice-2 photo is wired into the badge
after the merge; keep 762, 763, 764, 765.
Founder approved, 11 Nov 2026 (questions 791-800, all as suggested): (791) allow 00:00 and an "all day" choice for
visitor hours; (792) configure photo storage on the test app; (793) Revoke with a reason on the kiosk row; (794) remove an
unused visitor type, archive a used one; (795) allow deleting a role nobody holds, audited; (796) link the demo Recruiter
role to its template in the demo set-up; (797) a separate "declined" count; (798) automated e2e checks use their own
database and refuse to run against the test app database; (799) the kiosk details step in two columns on wide screens;
(800) the watch-list check right after the details step, before any photo.

## Visitors slice 1 built (answers 601-617; 15 Nov 2026, branch `feat/yukthix-visitors-1`)

- **Data:** `visits` (forced RLS; migration `202617v0000001_visitors_1`): the host, location, visitor (name, mobile as
  +country digits, email, company), purpose, window, status (expected, on site, checked out, not checked out, no show,
  cancelled), the link token (32 unguessable characters) and the pass code (V-XXXX-XXXX, unique in the company), the
  notice accepted (when, which version, on the link or at the desk), check-in and check-out with who, the badge number.
  `visit_counts` keeps counts by location, day and purpose after a visit is deleted (608). No ID number is stored.
- **Keys and roles (613):** `visitors.desk.manage` and `visitors.log.view` (granted per location or entity),
  `visitors.settings.manage` (company-wide); role templates **Reception** (desk and log, per location) and **Facility
  admin** (settings, desk, log). Every employee may invite (no key). System Admins have all three.
- **Settings (per location where the founder said so):** `visitors.host_timeout_minutes` (10), `visitors.id_capture`
  (off), `visitors.photo` (on), `visitors.hours_from` / `hours_to` (09:00-18:30), `visitors.notice` (text),
  `visitors.badge` (name badge with QR), `visitors.retention_days` (90), `visitors.id_retention_days` (30). Settings 3.12
  changes the company values (audited); a location's own value is set on Company rules and named on the field.
- **Hosts (VIS-02):** invite with the window in the location's time; the pass goes by email (609); cancel while
  expected. Refused while acting for someone else.
- **The visitor's page (T9-14):** `GET / POST public/visits/:token` (rate-limited per link, fail closed): details with
  the mobile masked, the notice accepted at its version (a changed notice is read again), then the QR pass.
- **Reception (VIS-01):** today at the location (its own day and time zone), scan or type the pass code, check in on
  the day before the window ends (the notice ticked at the desk when not accepted on the link), check out. Another
  location's pass or another day is refused with the reason; another company gets 404.
- **Log (VIS-04):** the locations in reach, the day each visit is deleted, CSV export without mobile numbers (audited).
- **Scheduled:** every 15 minutes, visits nobody checked out close as "not checked out" and expected visitors who never
  came as "no show" (611); nightly, visits past the location's period are deleted, counts kept (608). Both audited.
- **Go-live:** the visitor privacy notice (G-27) is on the go-live checklist for the DPO.
- **Tests:** API rules (unit), e2e `visitors-1` (8 scenarios, positive and negative), kit and web tests.

## Founder questions from Visitors slice 1 (15 Nov 2026)

651. **Visits without an email.** The pass goes only by email for now (609), so a visitor without an email cannot be
     invited (reception checks them in as a walk-in in slice 2). *Suggested: keep; WhatsApp or SMS with the visitor's
     opt-in comes with the messages work.*
652. **Allowed hours and invites.** Invites outside the location's allowed hours are not refused (the hours guard the
     kiosk in slice 2). *Suggested: warn the host when the window falls outside the hours, never refuse.*
653. **Early arrival.** Reception can check a visitor in any time on the day of the visit before the window ends.
     *Suggested: keep.*
654. **Retention counts from the end of the visit.** A visit is deleted N days after its window ends, and a cancelled
     visit the same way. *Suggested: keep.*

## Visitors slice 3 built (answers 603, 605, 614; 16 Nov 2026, branch `feat/yukthix-visitors-3`)

- **Watch-list (605):** table `visitor_watchlist` (forced RLS; migration `202617v0000003_visitors_3`): name, mobile
  (optional), reason, who added it, the last review and the day it lapses. Key `visitors.watchlist.manage`, company-wide
  only: System Admins and the **Facility admin** role (question 662 for HR). Only they see the list (VIS-05, Visitors ›
  Watch-list) and the reasons; acting for someone else cannot open it. Matched by mobile, then by name. A match blocks
  the visit: on the invite (no pass is emailed), when an entry is added (expected visits), and again at check-in and on
  the visitor's link. The host, reception and the visitor see only that the visit can't go ahead. Each entry is reviewed
  every `visitors.watchlist_review_days` (365, company setting) or it lapses and the nightly job deletes it. Adds,
  reviews, removals and lapses are audited, never with the name or the reason.
- **ID proof (603):** `visitors.id_capture` per location is now off (default), "ID type and last 4", or "ID type, last 4
  and a photo of the ID". Only the type and the last 4 characters are stored (the database refuses more). The visitor
  gives them on their link, or reception at check-in. The photo of the ID is taken at the desk where the location asks:
  private storage through the shared file pipeline (type checked from the bytes, virus-checked before it opens, every
  open audited), never of an Aadhaar card, and deleted with the type and last 4 after `visitors.id_retention_days` (30)
  by the nightly job (an owner's database function deletes the file row: the app cannot delete stored files).
- **Under 18 (614):** the host ticks "under 18" and names the adult; no ID is taken (the database refuses it), and the
  photo step (slice 2) must skip them; reception ticks that the adult is there before check-in.
- **Left for slice 2:** the kiosk (VIS-03 SeeReception uses `watchHit`), the visitor photo (T9-14 Photo, PhotoBlocked).
- **Tests:** rules (unit), e2e `visitors-3` (7 scenarios, positive and negative), kit and web tests.

## Founder questions from Visitors slice 3 (16 Nov 2026)

661. **Matching the watch-list.** A visitor matches an entry when the mobile number is the same, or the name is the
     same (case and spaces ignored). A common name can stop an innocent visitor; reception then calls the admin on duty.
     *Suggested: keep (safer to stop and check); the admin can let them in by removing or editing the entry.*
662. **HR and the watch-list.** The list is company-wide, but the HR Admin role is granted per legal entity, so it does
     not carry the watch-list key. *Suggested: HR people who keep the list get the Facility admin role (or a company-wide
     grant of the key); System Admins have it.*
663. **A lapsed entry.** An entry nobody reviewed by its date is deleted the next night (not kept as "lapsed").
     *Suggested: keep (least data kept); the list warns 30 days before.*
664. **Who gives the ID.** The drawn invite has an "ID type" field for the host; it is not used: the visitor gives the ID
     type and last 4 on their link, or reception at the desk. *Suggested: keep; remove the field from the drawing.*
665. **Removing an entry does not unblock visits.** Visits already blocked stay blocked; the host invites again.
     *Suggested: keep.*

## Visitors slice 2 built (answers 601, 602, 604, 606, 610; 10 Nov 2026, branch `feat/yukthix-visitors-2`)

- **Data:** migration `202617w0000000_visitors_2_walkins`: `visits` gains walk-in, visitor type, kiosk, photo, the host's
  deadline, who decided (host or reception), the reason and an hours override; two new states (`waiting`, `declined`).
  `visitor_types` (escort, NDA and induction policy) and `visit_acknowledgements` (policy version and text hash, a keyed
  hash of mobile and company, never the number; append-only), both with forced RLS. Setting `visitors.kiosk` (per
  location, off).
- **The kiosk (601):** a tablet enrolled as a Time device in visitor mode, at /yx/kiosk. Its own secret only
  (`x-kiosk-token`, 401 when unknown or reset), visitor mode only (an attendance kiosk is refused), every call limited
  per kiosk; a visit is read only by the kiosk that started it. Walk-ins and pre-registered passes.
- **Host approval (604):** the host is told (bell and email, `visitor.walkin.approval.host`) and has the location's
  minutes; the approval card on My visitors; then reception decides (with a reason to decline). Audited either way.
  Undecided walk-ins close as declined at the end of their day (sweep `visitors-walkins`).
- **Photo (602):** on by default, a JPEG or PNG checked by its bytes (600 KB at most), private storage; only the host,
  only while waiting, never cached (the page drops it when the card goes); deleted with the visit.
- **NDA and induction (606):** visitor types on Settings 3.12 name published policies; read and accepted on the
  visitor's link, the kiosk or at the desk, at the version shown (a policy published meanwhile is read again). An NDA
  counts for a year for the same person and company; the induction every visit. Acknowledgements are deleted once past
  their use.
- **Hours (610):** outside them the kiosk says "see reception"; reception lets a walk-in in with a reason (audited).
- **Tests:** API rules (unit), e2e `visitors-2` (10 scenarios, positive and negative; the tenth runs slice 3's watch list, under 18 and ID rules on walk-ins), kit and web tests.
- **Merge note:** slice 3 must keep `waiting` and `declined` when it changes `visits_status_check`.
- **Slice 4 merge (761, 713):** `VisitorReportsService.badge` now reads the walk-in's photo for a "photo badge with QR"
  location (never for a visitor under 18; the audit says whether a photo was drawn); e2e `visitors-4` adds the scenario.

## Founder answers built after Visitors slice 2 (711, 713, 701; 10 Nov 2026)

- **711 Send someone:** on the host's approval card. The named colleague becomes the host of the walk-in: the card with
  their own minutes (the location's, from the send), the photo while they decide, the bell and email saying who sent
  them; the first host's card and photo go. Audited `visitor.walkin_sent`. Refused while acting (403), to themselves
  (400), for anyone but the host or another company (404), once decided (409).
- **713 The photo at the desk:** reception at the location sees the walk-in's photo on today's list and in Decide for
  host, while it waits and while on site (`GET visitors/desk/visits/:id/photo`, never cached); after check-out not at
  all; never on the host's phone after the decision. A photo badge carries it (slice 4 merge), never for a visitor
  under 18.
- **701 demo staffing:** `apps/api/prisma/scripts/demo-staffing.ts` (run by the founder against the test app).
- **Tests:** e2e `visitors-2` (11 scenarios; the eleventh is 711 and 713), `visitors-4` (the photo badge), kit and web
  tests for Send someone and the desk photo.

## Founder questions from Visitors slice 2 (10 Nov 2026)

711. **"Send someone" on the approval card.** The drawn card lets the host name a colleague to meet the visitor; it is not
     built. *Suggested: build it next: the named colleague gets the card (their own minutes), audited.*
712. **Who matches the host on the kiosk.** The visitor types the host's name; exactly one active person must match,
     else "see reception" (so the kiosk never lists staff). *Suggested: keep.*
713. **The photo at the desk.** Reception does not take or see the photo yet (badge printing is slice 4). *Suggested:
     reception sees it on the check-in drawer and the printed photo badge in slice 4; still never on the host's phone
     after the decision.*
714. **Visitor types and purposes.** A visit has both a purpose (the six fixed ones) and an optional visitor type (the
     company's list, for the NDA and induction). *Suggested: keep both; reports group by purpose.*

## Visitors slice 4 built (answers 607, 608, 612, 617; 17 Nov 2026, branch `feat/yukthix-visitors-4`)

- **Badge (607):** `GET visitors/:id/badge.pdf`: a 100 x 62 mm label (a common 62 mm roll, landscape) made with PDFKit
  and the QR library already in use: the company and location, VISITOR, the name (Indian scripts in Noto fonts), company,
  host, valid until, the badge number and the QR of the pass code; "under 18, with …" when so. Reception at the
  location, for a visitor on site; audited. The browser prints it (no printer integration). Where the location's badge
  setting is "pass on the phone only", nothing prints and the visitor shows the QR pass on their link (T9-14).
- **Reports (608):** `GET visitors/reports`: visits by location, purpose and month over the last 12 months (or a from-to),
  from `visit_counts` (kept after deletion) plus the visits still kept; counts only, never a name. The log or desk key,
  the locations in reach. The drawn "by host" card and average stay are gone (they need names or times not kept).
- **Roll-call (612):** `GET visitors/rollcall` and `rollcall.pdf`: at one location, the visitors checked in and not out,
  and the employees whose last check-in today (the same punches the Time Today board reads) was at that location; one
  A4 PDF with a box to tick per person (audited). New key `visitors.rollcall.view` (location, entity or company) on the
  Reception, Facility admin and HR Admin roles, and a new **Security** role with only the roll-call. The desk key also
  opens it. Visitors › Roll-call (VIS-06, drawn first).
- **617:** the Kiosks & badges menu item is gone from the drawn Visitors menu.
- **Founder answers done in slice 4 (approved 18 Nov 2026):** 652, an invite outside the location's allowed hours is
  sent with a warning to the host (`outsideHours` on the invite), never refused; 664, the ID type field is removed from
  the host's invite drawing; 713, the badge PDF draws the visitor's photo on a photo badge (never for a visitor under
  18). The photo itself is stored by slice 2: after the slice 2 merge, one line in `VisitorReportsService.badge` reads it
  (marked in the code); until then the name badge prints.
- **Data:** no new table (migration `202617v0000005_visitors_4` adds the key); reports read `visits` and `visit_counts`,
  both under forced RLS.
- **Tests:** PDF unit tests, e2e `visitors-4` (3 scenarios, positive and negative), kit and web tests.

## Founder questions from Visitors slice 4 (17 Nov 2026)

761. **Photo badge.** The "photo badge with QR" setting prints the name badge until the slice 2 photo is wired in (one
     line after the merge; answer 713). *Suggested: wire it in the merge.*
762. **Employees on the roll-call.** Only people whose last check-in today was at this location are listed; people who
     did not check in (attendance not by punch, or forgot) and web check-ins without a location are not. *Suggested:
     keep, with the line on the list telling the warden to count them at the assembly point.*
763. **Who sees employee names on the roll-call.** Reception and security see every employee checked in at their
     location, beyond their usual access, because it is for an evacuation. *Suggested: keep; every print is audited.*
764. **Label size.** The badge is 100 x 62 mm. *Suggested: keep; a company that needs another size asks support (no
     setting until someone needs it).*
765. **Report period.** Reports cover the last 12 months by default, counted by the day the visit started (UTC, as the
     counts are kept). *Suggested: keep.*

## Built from the walk-through answers 791, 793, 794, 797, 799, 800 (11 Nov 2026, branch `feat/yukthix-visitors-walk-answers`)

- **791:** the hours run over the whole day: "allowed from" 00:00 to 23:30; "allowed until" 00:30 to "00:00 (midnight)" (kept as
  24:00); a new setting "Visitors allowed all day" (company or location; off by default) admits visitors at any hour. One
  place reads the hours (`VisitorsService.hours`); messages say "all day" or "from 09:00 to 00:00".
- **793:** Devices and kiosks: Revoke on each kiosk row, with the reason (required, kept with the audit); the API route
  now takes the reason.
- **794:** visitor types are matched by name when saved. A type taken off the list that no visit used is removed; one
  that visits used is archived (`visitor_types.archived_at`, migration `202617z0000002_visitors_walk`): kept on those
  visits, hidden from the kiosk, the desk and invites; saving the name again brings it back. Settings names the archived
  ones under the table.
- **797:** the desk counts declined walk-ins on their own ("Declined" tab and count), not as checked out.
- **799:** the kiosk's details step is two columns on a wide screen (1024 px column): at 1278 x 635 the ID fields show
  and Next ends at 561 px with no scroll (measured in Storybook); one column below 640 px.
- **800:** the kiosk sends the details (with the name) right after the details step; a watch-list match goes to "Please
  see the reception desk" before any photo or notice (audited, never says why). The walk-in itself checks again.
- **Tests:** API unit (`walkin-rules.spec`), kit tests (positive and negative), e2e visitors-2 (three new scenarios) and
  time-devices (the reason).

## Founder questions from the walk-through answers (11 Nov 2026)

871. **A revoked kiosk's history.** A revoked kiosk leaves the list; its check-ins stay. *Suggested: a "Show revoked"
     filter later if HR asks to see them.*
872. **Renaming a used visitor type.** Types are matched by name, so renaming a type visits used archives the old name and
     makes a new type. *Suggested: keep (old visits keep the name they had).*
873. **All day and the walk-in window.** An all-day location's walk-in pass runs to midnight that day. *Suggested: keep;
     a visitor still inside at midnight is closed as "Not checked out" by the nightly sweep as today.*

