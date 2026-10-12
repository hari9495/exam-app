# Handover: manual testing (12 Oct 2026)

For a new session that continues the founder's manual testing. The building session stays open separately (it runs the payroll and performance builders); do not start or stop builders from the testing session.

## How we test
- The founder tests screen by screen on http://localhost:3000. Guide one test at a time, in plain simple English (non-native speaker), with numbered steps and the expected result.
- When something is wrong: find the root cause, fix it in one go (shared component or service, not just the one screen), add a test, commit, then tell the founder to refresh and retry.
- Rules: YukthiX design only; clickable must look clickable; a single choice uses the Segment control; no red error under a field while typing; gold-standard security; never weaken a check to pass a test.
- Show each screen in the preview pane when presenting it.
- Test list: `docs/yukthix/tracker/manual-tests.json` (update a test's wording when the real behaviour differs from it, and commit).

## Where we are
- Done: Areas 1–3, and Area 4 up to **4-19**.
- **Next: MT-4-20** (SMS monthly limit): Settings › SMS → Monthly limit = 1 → save → Send test → expect the "Monthly limit reached" notice, no text sent, and an admin email in the local mailbox (http://localhost:8025). Then clear the limit (empty = no limit) and save. Before 4-20, set Test gateway's Development **Result** back to **Works** if it is still Unavailable from 4-19.
- Then Areas **5 Access (13 tests), 6 People (14), 7 Changes (19), 8 Privacy (11)**.

## The test app
- Runs from worktree `C:\D-drive\exam-app-org` (branch `feat/yukthix-org`, the old org branch), database `examapp_org`, Redis db 4. Preview servers (launch config `C:\.claude\launch.json`): yx-api 3001, yx-web 3000, yx-mock-idp 4010. Local mailbox (Mailpit) 8025; SMS texts are copied there as emails.
- Accounts: admin@demo-org.test / `DevAdmin123!`; others / `Passw0rd!2026` (hr@, panel@, arjun@, payroll@, …).
- **After 4-20, move the test app to the latest `main`.** Main now also has Time and leave, payroll (runs, payslips, filings), onboarding and exit, Service Desk, global core (hours, translations, Add a country) and expenses (with receipt OCR). Plan: point the org worktree at a new branch from `origin/main`, rebuild `examapp_org` from zero (migrate deploy + seed), restart the three preview servers. Warn the founder first: the data is reset, so they must set up their passkey, authenticator and mobile number again.
- Manual test lists do not exist yet for the new modules. After the move, write them in `manual-tests.json` (same style), area by area, starting with the ones the founder wants to see first (likely payroll screens and expenses).

## State of the code (12 Oct 2026)
- Merged to main: PRs #128–#150 (all modules above, plus CI that runs every e2e suite in 4 shards).
- Open work in the building session: remaining payroll screens and a six-change payroll batch (payroll builder, worktree `exam-app-pay`); performance PM2 onward (builder in `exam-app-life`, branch `feat/yukthix-performance-1`).
- Go-live checklist: `docs/yukthix/GO-LIVE-CHECKLIST.md`.
