# YukthiX screen review rules

The founder's rules, learned screen by screen (Settings, People). Every reviewer applies all of them. A finding names the rule it breaks.

## Founder rules (hard)

- **R1 Pay is private.** No salary, CTC, band or amount is visible to someone without pay access. Lists hide amounts behind "Show pay" (recorded). Managers without a salary grant see grades, not bands.
- **R2 Every text button has a border.** No borderless text links acting as buttons (e.g. "Edit" links in a list). Icon-only buttons are fine.
- **R3 Fictional data only.** No real company names. People, codes and numbers must be fictional and consistent (see Data facts).
- **R4 Every screen is responsive.** Desktop 1440, laptop 1280, tablet 871 and 768, phone 390. Tables become cards on phones when they would be clipped.
- **R5 No sideways scrollbar unless unavoidable.** Shrink columns, mark less important columns `optional: true` (the table hides them to fit), wrap two-line cells, merge columns. Plain tables wrap text.
- **R6 No AI slop.** Plain, specific words. No filler descriptions ("Type, effective date, new values…"), no jargon (T+0, LWD, F&F only where users know it, "rebases", "at cap"), no hard-coded sentences that ignore the data.
- **R7 Approve buttons are green (`variant="approve"`); Review buttons are blue (`variant="review"`).**
- **R8 No sticky or floating bars.** Save bars sit at the end of the page.
- **R9 Row buttons in a column are the same width** (the table does this; don't break it).
- **R10 Cards must not look crowded.** Two lines max per row where possible; badges short.
- **R11 Pick-one vs toggle.** Single-choice options use the joined `Segment` control (or a dropdown on phones); independent on/off filters use toggle chips with a check and "Only …" wording. Never mix them as identical chips.
- **R12 Clickable looks clickable.** Every control shows a hand cursor, changes on hover and shows a focus ring; text buttons, chips and tabs have a border, fill or underline indicator; selected differs by more than text colour; control edges are 3:1 (WCAG 1.4.11). `npm run test:affordance` enforces it (founder review 7 Oct 2026).

## Patterns the founder accepted (use them)

- Dates that matter show a relative badge: "in 6 days", "15 days ago", amber within a week, red when overdue.
- Merge columns that describe one fact (Effective + In → one cell). Drop columns that repeat (a Status that says the same thing on every row).
- Blocked actions are **disabled with the reason beside them** (`finishBlocked` / `continueBlocked` on the Stepper). Never let a button "work" when the process says it can't.
- Alerts that tell you to do something carry the button to do it.
- Facts the decision needs sit next to the form ("How it went" on probation review), and come first in reading order on narrow screens.
- Manager views show **only the manager's own reports** (`ME.name`). Divya Raghunathan is the signed-in manager.
- Avatars use the person's name (`avatarName`), never a title like "F&F · Meera Iyer".
- Status colours: amber only for real risk; neutral for information.
- Steps that lead to another screen have the button to open it ("Open F&F", "Open interview").
- Empty and filtered states say what to do next and offer the action.
- One alert per message (no red banner plus amber banner saying the same thing).

## Data facts (keep consistent across screens)

- The story world's "today" is **29 Sep 2026** (`TODAY`). Dates before it are past; after it, future. Statuses must agree with dates (someone "Exited" has a last day in the past).
- Company: Kaveri Foods Pvt Ltd (Bengaluru head office, Chennai office, Hosur plant); second entity Kaveri Foods Pvt Ltd (Tamil Nadu). Codes KF-xxxx.
- Signed-in people: Divya Raghunathan (KF-0001, Senior QA Engineer, Quality, manager persona); Lakshmi Venkatesan (HR Business Partner); Suresh Pillai (Payroll Manager).
- Department heads: Operations Ramesh Gowda, Quality Divya Menon, Engineering Karthik Subramanian, Finance Meera Iyer (note: a different Meera Iyer, KF-0118, Lab Analyst, is resigning with last day 19 Oct 2026), People Lakshmi Venkatesan, Sales Vikram Rao.
- India has one time zone (IST). Leave types: casual, sick, earned leave (not "privilege leave").
- If a screen contradicts another screen's data, report it as a consistency finding.

## How to report

Per screen: numbered problems, most important first, max 10. Each has: what is wrong (with the visible evidence), which rule, a concrete fix, severity (high = wrong/broken/rule breach, medium = confusing, low = polish), and whether the fix belongs in a shared component (fix once) or this screen.
