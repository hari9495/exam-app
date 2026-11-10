# Visitors: designs and what exists (audit)

This file checks, story by story, every Visitors design sub-page against what is live, in the same shape as
`hiring-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the designed one
live.

Status 10 Nov 2026 (branch `docs/yukthix-visitors-map`, from `test/yukthix-main` at 61b163d4a). Audit only: nothing was
built.

## What is live today (plain English)

- **Nothing of Visitors is live.** There is no visitor table, no visitor key, no web page and no menu entry (the web
  menu test lists `visitors` among the areas that must stay hidden until built).
- The designs are complete in the kit: the reception desk, the host's pre-registration and approval card, the visitor
  kiosk, the log and reports, the visitor's own invite page (T9-14), the host's mobile list and Settings 3.12.
- One piece of the back end is ready: a Time device can already be enrolled in **visitor mode** (`time_devices.mode`
  = `visitor`), and the attendance kiosk refuses to check employees in on it.
- The rules are written: M02 §B11 and YX-AT-22 (visitor management), M04 YX-MOB-16 (host approval card), APX-A
  notification types `visitor.invite.visitor` and `visitor.walkin.approval.host`, APX-G G-27 (visitor privacy notice).

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Front desk and kiosk | 2 | 0 | 0 | 0 | 15 | 0 | 15 |
| B. Hosts | 2 | 0 | 0 | 0 | 5 | 4 | 9 |
| C. The visitor's own pages | 1 | 0 | 0 | 0 | 9 | 0 | 9 |
| D. Log, reports and settings | 2 | 0 | 0 | 0 | 6 | 0 | 6 |
| **All Visitors design groups (A–D)** | **7** | **0** | **0** | **0** | **35** | **4** | **39** |

Counted by script 10 Nov 2026 on `docs/yukthix-visitors-map` (the script is in the appendix): the 26 stories under
Screens/Visitors (VIS-01 to VIS-04), the 9 of Screens/Portals/T9-14 · Visitor invite page, the 2 visitor stories of
Screens/Mobile/Requests and Me tabs (`Visitors`, `VisitorsArrived`) and the 2 of Settings 3.12 (`P3_12`,
`P3_12_ReadOnly`). The 4 phone views are VIS-02 Phone, PhoneApproval and PhoneInvite and the Mobile "arrival alert": they need the phone
app, which is not built. Until then the web pages at phone width cover the same work (Mobile "Me · my visitors" is
counted as a page for that reason).

Kit parts (not stories, reusable): `VisitorBadge`, `VisitorDeskScreen`, `PreRegisterForm`, `PreRegisterScreen`,
`VisitorKioskScreen`, `VisitorLogScreen` (`screens/ops/visitors.tsx`), sample data (`visitors-data.ts`), the ops shell's
Visitors menu (Today's visitors, Invites, Visitor log, Kiosks & badges, Reports; `ops-kit.tsx`), `retentionLeft`
(`ops-rules.ts`), `MobileVisitorsScreen` (`settings/mobile-me.tsx`), `KioskFrame` (`_kit/frames.tsx`), `TenantPortal`
and `CameraFrame` (portals kit), and the Settings 3.12 page definition (`registry-g3.ts`, keys `vis.*`).

Not drawn: the **Kiosks & badges** menu item has no screen (kiosks are enrolled on the Time devices page today; badge
layout is one Settings 3.12 field).

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
| Expected · Expected · walk-in waiting for host | design only, feature not built | reception's list for the location today; a walk-in waits for the host's answer (timeout, then reception decides) |
| OnSite · On site now (emergency list) | design only, feature not built | everyone checked in and not out; for emergencies, beside employees checked in (Time Today board) |
| CheckedOut · Checked out | design only, feature not built | times in and out |
| CheckIn · Check in · notice and badge | design only, feature not built | QR scan or search; notice and NDA / induction acknowledged; badge printed or shown |
| Blocked · Blocked visitor stopped | design only, feature not built | a watch-list match: reception sees "do not admit", not the reason |
| Empty · Empty | design only, feature not built | no visitors today |
| Loading · Loading | design only, feature not built | loading state |

#### VIS-03 · Visitor kiosk

| story (sub-page) | verdict | note |
|---|---|---|
| Welcome · Welcome | design only, feature not built | a tablet enrolled as a Time device in visitor mode (the mode exists; no kiosk page) |
| Details · Walk-in details | design only, feature not built | name, mobile, company, purpose, host |
| Photo · Photo | design only, feature not built | camera capture (setting `vis.photo`) |
| Notice · Notice acknowledgement | design only, feature not built | the G-27 privacy notice and the visitor type's NDA / safety induction |
| Waiting · Waiting for host | design only, feature not built | the host's approval card is out |
| Badge · Badge and QR | design only, feature not built | badge on screen and printed; QR for check-out |
| SeeReception · See reception (blocked or problem) | design only, feature not built | watch-list match, outside hours or any problem: no reason shown |
| Rejected · Host declined | design only, feature not built | the host said no |

### B. Hosts

#### VIS-02 · Pre-register + my visitors

| story (sub-page) | verdict | note |
|---|---|---|
| MyVisitors · My visitors | design only, feature not built | the host's own expected and past visitors |
| Invite · Invite a visitor | design only, feature not built | name, mobile, email, company, purpose, location, day and window |
| Sent · Invite sent | design only, feature not built | the visitor gets the invite with the QR pass link |
| Empty · Empty | design only, feature not built | no visitors yet |
| Phone · My visitors · phone | phone view, mobile app not built | the same list on the phone |
| PhoneApproval · Walk-in approval card · phone | phone view, mobile app not built | approve / decline / send someone (YX-MOB-16); the photo leaves the phone after the decision |
| PhoneInvite · Invite · phone | phone view, mobile app not built | invite from the phone |

#### Requests and Me tabs

| story (sub-page) | verdict | note |
|---|---|---|
| Visitors · Me · my visitors | design only, feature not built | Mobile Me tab list; the web page at phone width can serve it |
| VisitorsArrived · Me · my visitors · arrival alert | phone view, mobile app not built | "your visitor has arrived" alert |

### C. The visitor's own pages

#### T9-14 · Visitor invite page

| story (sub-page) | verdict | note |
|---|---|---|
| Details · Your details | design only, feature not built | the link in the invite: the visitor checks their details (public page, token in the link) |
| Id · ID | design only, feature not built | ID type and number where the location asks (`vis.id_capture`) |
| Photo · Photo · camera live | design only, feature not built | photo before the visit |
| PhotoBlocked · Photo · camera blocked | design only, feature not built | camera refused: reception takes it |
| Notice · Privacy notice, induction and NDA | design only, feature not built | G-27 notice, induction and NDA acknowledged before arrival |
| Pass · QR pass | design only, feature not built | the QR pass for the gate |
| PassDesktop · QR pass · desktop | design only, feature not built | same at desktop width |
| Expired · Pass expired | design only, feature not built | past the window |
| Blocked · Visit blocked | design only, feature not built | the visit was cancelled or blocked: no reason shown |

### D. Log, reports and settings

#### VIS-04 · Visitor log & reports

| story (sub-page) | verdict | note |
|---|---|---|
| Log · Log · retention countdown | design only, feature not built | per location; days left before deletion (`retentionLeft`) |
| Reports · Reports by location, purpose, host | design only, feature not built | counts by location, purpose, host |
| Empty · Empty | design only, feature not built | no visits |
| Loading · Loading | design only, feature not built | loading state |

#### Group 3 · Time & Leave

| story (sub-page) | verdict | note |
|---|---|---|
| P3_12 · 3.12 Visitors | design only, feature not built | visitor types (escort, NDA, induction), host timeout 10 min, ID and photo, hours, notice, badge, watch-list readers, retention 90 / 30 days; none of the `vis.*` keys is in the API registry |
| P3_12_ReadOnly · 3.12 Visitors · read-only | design only, feature not built | the same, read-only |

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
  ...['vis-01', 'vis-02', 'vis-03', 'vis-04'].map((f) => UI + 'screens/ops/' + f + '.stories.tsx'),
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
