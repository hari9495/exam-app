# YukthiX accessibility statement (DRAFT, not yet published)

Status: draft for the founder (answer 2333), 17 Nov 2026. Publish it at `/yx/legal/accessibility` once approved (question 2342).

## Our target

YukthiX aims to conform to the **Web Content Accessibility Guidelines (WCAG) 2.1, level AA**. Today we **partly
conform**: most of what we check passes, and the parts that do not are listed below. Nothing here has been checked by
an independent auditor yet.

This statement covers the YukthiX web app: the staff app (`/yx`), the sign-in pages, the careers and candidate pages,
and the test (exam) screens. It does not yet cover the older Prudent Hire exam console (`/v2`), the older candidate
pages outside the YukthiX design, or documents we generate (payslips, letters and reports as PDF).

## What you can change yourself: the Accessibility menu

Every page in scope has an **Accessibility** button (the person icon): on the staff top bar, on the sign-in pages, on the
careers and candidate pages, and on the test screen. A company cannot turn it off. It offers:

- **Contrast:** Normal or High contrast (black on white, text at 7:1 or more, black borders, underlined links, a thick
  focus outline).
- **Text size:** Bigger, Smaller and Normal, in five steps from 90 % to 150 %. Pages wrap to fit; at the larger steps
  some pages scroll.
- **Text spacing** (letter and word spacing) and **Line height** (1.5 times the text, with space between paragraphs),
  as WCAG 1.4.12 describes.
- **Big cursor**, **Reduce motion** (as well as your device's own "reduce motion" setting, which we always follow),
  **Stronger focus** outline and **Underline links**.
- **Reset all.**

Signed in, your choices are saved on your account and follow you to every device. Signed out, they are kept in this
browser. Your browser's own zoom, your device's high-contrast mode and your own screen reader keep working too; we do
not add our own screen reader, colour filters or a "basic HTML" view, because your device does these better.

## How we check

- Every screen is built from one design-system kit. Kit rules are checked by automated tests on every change: every
  control looks clickable (border or fill, hover, pointer, focus ring), pick-one choices use a proper radio group, and
  spacing comes from shared tokens.
- **Automated WCAG 2.1 A and AA checks** (axe-core) run in the kit's tests over the key screens: sign-in, the staff
  app shell and home, careers, the candidate portal, the test runner and the Accessibility menu (185 screen states).
  Colour contrast is checked separately on the built design library in light and dark.
- Text size at 100 % and 150 % is measured by a script on the main page frames (staff home, sign-in, careers, test
  runner): no overlapping blocks and no sideways scroll.

## Known gaps (honest list)

| # | Where | What | WCAG | Plan |
|---|---|---|---|---|
| G-1 | Any open dialog or drawer | While a dialog is open, the page behind it is hidden from screen readers but its buttons are still in the page's code. The keyboard cannot reach them (focus stays in the dialog), but automated checks flag it (14 screen states). | 4.1.2 | Make the page behind an open dialog inert. |
| G-2 | Charts | Not yet checked that every chart has a text or table version of its numbers. | 1.1.1 | Check each chart; add a table view where missing. |
| G-3 | Rich text editor, org chart, roster grid | Complex widgets not yet tested with a screen reader. | 2.1.1, 4.1.2 | One-time NVDA pass (answer 2330), then fixes. |
| G-4 | Whole app | No manual screen-reader (NVDA / JAWS / VoiceOver) pass has been done yet; only automated checks. | all | NVDA pass on the main flows (answer 2330). |
| G-5 | Screens at 150 % text | Only the four main page frames were measured at 150 %. Parts drawn with fixed sizes rather than the text tokens do not grow with the text-size setting (browser zoom still enlarges them), and other screens were not measured. | 1.4.4, 1.4.10 | Measure every screen story at 150 %; move fixed sizes to the tokens. |
| G-6 | High contrast | There is one high-contrast look (dark on light). A dark high-contrast look is not built. Your device's own high-contrast mode still works. | (beyond AA) | Question 2340. |
| G-7 | Older pages | The older Prudent Hire exam console (`/v2`) and older candidate pages are not built from the kit and do not have the Accessibility menu. | various | Being replaced by YukthiX screens. |
| G-8 | Documents | Generated PDFs (payslips, letters, reports) are not tagged for screen readers. | 1.3.1 | Tagged PDFs, later. |
| G-9 | Proctored tests | Camera and screen checks depend on the browser; a candidate who needs another way asks through an accommodation request (extra time, a reader, breaks). | 2.2.1 | Already offered: accommodation requests. |

## Feedback and contact

If something does not work for you, tell your company's HR team, or write to the YukthiX accessibility contact
(address to be confirmed, question 2342). We aim to reply within 5 working days.

## Preparation of this statement

Prepared on 17 Nov 2026 by the YukthiX team from automated tests and our own review. To be reviewed every six months
and after an independent audit.
