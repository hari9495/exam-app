# Compare: org, people records, onboarding and exit (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Org, My Team › Profile changes, Inbox archive) and `keka-map.md`;
- `zoho-pages.md` (Home › Organization, Onboarding, Files, Operations › Employee Information, Offboarding, General);
- YukthiX code on `test/yukthix-main` (PPL screens, T9 portals, HLP-10), plus `gap-audit.md` (K18, Z18, Z21).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Org, directory and records

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Directory | Org filters, three-column person cards | Department list on the left, cards on the right | Partly: table with a card drawer; cards on phones (PPL-01 `/yx/people/directory`) (unsure) | **Keep ours:** a table works for thousands of people |
| A2 | Org tree | Boxes with counts; go to me / top / my department; group by department; zoom | Person cards, print | Partly: PPL-02 show me, zoom, fit, find, three views, "as on" date, export; no "go to top" | **Keep ours**; add "Go to top" |
| A3 | Department view | — | Department tree with member counts | Partly: department view on the org chart | **Keep ours** |
| A4 | Company documents | Folders with counts; title, expiry, size, updated | Policies in list or folder view | Partly: policies by category; no folder library with expiry | **Take K:** folders with expiry dates |
| A5 | Policies with acknowledgement | — | — | Has: HLP-10, typed name or one-time code | **Keep ours** (neither has it) |
| A6 | My own documents | — | Personal uploads, private | Has: PPL-30 `/yx/me/documents` | **Keep ours** |
| A7 | Profile | — | Icon tiles, "About me", org structure | Partly: PPL-03 with ten tabs; no "About me" | **Take Z:** an optional "About me" |
| A8 | Self-service changes | Approvals and past changes | Photo change may need approval | Has: PPL-32 change requests to the manager's inbox | **Keep ours** |
| A9 | Masked IDs | Eye to reveal, "Verified" | Masked by default, "Show masked data" | Has: reveal is audited | **Keep ours** |
| A10 | Transfers log | — | HR process log; locked fields | Has: person history (unsure: locked fields) | **Keep ours** |
| A11 | Custom fields | — | Extend service | Has: `/yx/settings/custom-fields` | **Keep ours** |
| A12 | Office locations | — | Office cards and a map | Partly: latitude, longitude, geofence radius; no map | **Skip:** the map adds little |
| A13 | Internal jobs and referrals | Refer and apply | — | Has: HIR-13, HIR-12 | **Keep ours** |
| A14 | Assets | Asset requests in the archive | — | Has: PPL-25 register, employee acknowledges | **Keep ours** |
| A15 | Employee IDs and statuses | — | ID rules; editable status list | Partly: code pattern per legal entity; statuses come from probation and exit (unsure) | **Keep ours:** status follows the real process, fewer manual errors |

## B. Onboarding

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Pre-joining portal | — | Candidate portal switch | Has: T9-01 `/yx/join/[org]`, documents, BGV consent, letters | **Keep ours** |
| B2 | Onboarding flows | — | Flows with "applicable for" rules | Has: checklists by entity, location, department; no grade or employment type | **Keep ours**; add grade and type (with admin A3 groups) |
| B3 | Offer and appointment letters | — | Acceptance tracking | Has: offers, accept with an emailed code | **Keep ours** |
| B4 | E-sign | — | E-sign documents | Partly: emailed one-time code; no Aadhaar e-sign | **Keep ours**; add Aadhaar e-sign when a provider is chosen |
| B5 | Background checks | — | — | Partly: HIR-10 tracker, consent; no vendor link | **Keep ours**; vendor link later |
| B6 | First days | — | Day-one flow | Has: first 30 days, buddies (PPL-41), my tasks | **Keep ours** |
| B7 | Probation | — | Status only | Has: PPL-16 / PPL-17 with reminders, extensions | **Keep ours** |

## C. Exit

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Resignation | Exit requests in the archive | — | Has: PPL-18 `/yx/me/resignation` | **Keep ours** |
| C2 | Clearance | Asset requests | Checklist inside the exit form | Has: PPL-20 `/yx/people/clearance` | **Keep ours** |
| C3 | Exit interview | — | Questionnaire | Has: PPL-21 | **Keep ours** |
| C4 | Full and final | — | — | Has: PPL-22 with gratuity and encashment | **Keep ours** |
| C5 | Exit letters | — | Generate exit documents | Has: relieving and experience letters, can be held | **Keep ours** |
| C6 | Notice and buyout | — | Notice period per flow | Has: notice by probation or confirmed; buyout days | **Keep ours** |
| C7 | Alumni access | — | — | Has: T9-02 `/yx/alumni/[org]` (letters, payslips, Form 16) | **Keep ours** (neither has it) |
| C8 | Absconding | — | — | Has: PPL-24 | **Keep ours** (neither has it) |

## Suggested order to build

1. **Must for daily use:** A4 company documents in folders with expiry (M).
2. **Depth:** B2 grade and type rules (S), A2 "Go to top" (S), A7 "About me" (S).
3. **Later:** B4 Aadhaar e-sign (M), B5 background-check vendor link (M).
