# Compare: helpdesk, HR letters and engagement (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Helpdesk, Engage, Home feed) and `keka-map.md`;
- `zoho-pages.md` (HR Help Desk, HR Letters, Employee Engagement, Home widgets);
- YukthiX code on `test/yukthix-main` (Desk / HLP screens, PPL-31, growth ENG screens), plus `gap-audit.md`
  (K13 to K15, Z19, Z20, Z22).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Helpdesk

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Ticket lists | Open, closed, raised by me, following | My requests | Has: agent lists with saved views (`/yx/desk/tickets`); mine and followed (`/yx/desk/my-cases`) | **Keep ours** |
| A2 | Raise a ticket | Drawer: category, title, rich text, attach | Form: priority, subject, rich text, attach; category note and who answers | Has: `/yx/desk/help` with category, rich text, attachments | **Keep ours**; add Zoho's "who will answer" |
| A3 | Ticket conversation | Chat bubbles, followers | — | Has: messages, followers, chat and live chat | **Keep ours** |
| A4 | SLA tracking | First-response and resolution status columns | — | Partly: SLA engine tracks both; no first-response column | **Take K:** add the column |
| A5 | Satisfaction | Score filter on closed tickets | Rating after closure | Partly: rating after close and NPS; no filter | **Take K:** a satisfaction filter |
| A6 | Search before raising | — | FAQ search first, then "Ask us" | Has: articles suggested before raising | **Keep ours** |
| A7 | Ask your manager | — | Route a category to the reporting manager | Missing | **Take Z:** many leave and shift questions belong with the manager |
| A8 | Categories and agents | Category, sub-category | Category cards with open counts, reorder | Has: routing by agent skills (unsure: reorder) | **Keep ours** |
| A9 | Escalation | Escalation reason filter | — | Has: SLA and rule escalation | **Keep ours** |
| A10 | Speak up and POSH | — | — | Partly: speak-up and ethics live; POSH committee case screens designed only | **Keep ours:** make the drawn POSH screens live (POSH Act duty) |

## B. HR letters

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Letter requests | — | Address proof, bonafide, experience as self-service forms | Has: PPL-31 `/yx/me/documents/certificate`, instant or via HR; no bonafide kind (unsure) | **Keep ours**; add a bonafide template |
| B2 | Templates and bulk letters | — | — | Has: `/yx/settings/letters`, `/yx/people/letters/bulk` | **Keep ours** |
| B3 | Verify a letter | — | — | Has: QR code, `/yx/verify` | **Keep ours** (neither has it) |

## C. Engagement

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Announcements | Cover image, Live / Drafts tabs, likes and comments | List with "Add announcement" | Designed only | **Take K**, in our drawn design: the notice board for factories and shift staff |
| C2 | Feed | Post, poll, praise composer; likes, comments | Status posts with @ mentions; filter tabs | Designed only | **Mix:** Keka's composer, Zoho's filters, with our moderation screen |
| C3 | Polls | Filter panel, "Exclude from wall", result bars | — | Designed only | **Take K** |
| C4 | Surveys | Scratch or template | eNPS, pulse, full engagement as tabs with size limits | Designed only (`apps/api/src/surveys` is for candidates) | **Take Z:** three clear sizes, anonymous by default |
| C5 | Praise | Certificate card with badges and a project tag | — | Partly: praise is a feedback type; wall and badges designed only | **Take K**, through our drawn wall |
| C6 | Celebrations | Birthdays, anniversaries, new joiners tabs | Birthday, wedding anniversary, new hires widgets | Partly: birthdays and anniversaries on Home (can be hidden); no new joiners | **Take K:** add a new joiners tab |
| C7 | Articles | Recent, popular, categories | — | Has as helpdesk knowledge and the public help centre | **Keep ours** |
| C8 | Rewards and perks | — | — | Designed only | **Skip** for now: cost, low use in mid-size firms |
| C9 | Groups and department wall | — | Department wall, groups | Missing | **Skip:** WhatsApp groups already do this |

## Suggested order to build

1. **Must for daily use:**
   - C1 announcements (M);
   - A10 POSH cases live (M);
   - A7 ask your manager (S);
   - A4 first-response column (S).
2. **Depth:**
   - C5 praise wall (M);
   - C4 surveys (L);
   - C3 polls (M);
   - C6 new joiners (S);
   - A5 satisfaction filter (S);
   - B1 bonafide template (S).
3. **Later:** C2 feed (L).
