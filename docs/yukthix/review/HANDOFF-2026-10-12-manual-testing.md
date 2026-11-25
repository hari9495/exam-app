# Handover: manual testing (12 Oct 2026)

For a new session that continues the founder's manual testing. The building session stays open separately (it runs the payroll and performance builders); do not start or stop builders from the testing session.

## How we test
- The founder tests screen by screen on http://localhost:3000. Guide one test at a time, in plain simple English (non-native speaker), with numbered steps and the expected result.
- When something is wrong: find the root cause, fix it in one go (shared component or service, not just the one screen), add a test, commit, then tell the founder to refresh and retry.
- Rules: YukthiX design only; clickable must look clickable; a single choice uses the Segment control; no red error under a field while typing; gold-standard security; never weaken a check to pass a test.
- Show each screen in the preview pane when presenting it.
- **Before handing any test to the founder (rule, 20 Oct 2026):** walk through it yourself first — live screen next to its design (Storybook 6106) at 1278 x 635, the test steps as a user, the emails it sends (Mailpit 8025), empty states, errors, keyboard paths — and run the screen checklist: no scroll bar if it fits; durations in hours and minutes; no glued messages; one main button, negative actions plain until confirmed; every control looks clickable; designed email layout and plain subjects; texts name people and items; repeat actions work (no stale URL params or errors). Builders send design | live screenshots, checked before the founder sees them.
- Test list: `docs/yukthix/tracker/manual-tests.json` (update a test's wording when the real behaviour differs from it, and commit).

## Where we are
- Done: Areas 1–4 (MT-4-20 passed 12 Oct; its email-text fix is PR #153).
- **Test app moved to latest `main` on 12 Oct** (branch `test/yukthix-main` in the org worktree, `examapp_org` rebuilt from zero + seeded, Redis db 4 cleared). The founder must set up passkey, authenticator and mobile number again.
- Area 5 Access done 14 Oct (13/13 passed); its fixes are PR #171 (branch fix/yukthix-access-effective-card, which the org worktree is on until it merges). Rules from it: toasts for "done", Select max form width, Segment options bordered, Dialog `notice` slot.
- **Next: Area 6 People (MT-6-01).**
- Then Areas **5 Access (13 tests), 6 People (14), 7 Changes (19), 8 Privacy (11)**.

## The test app
- Runs from worktree `C:\D-drive\exam-app-org` (branch `test/yukthix-main`, tracking `origin/main`; to refresh: pull, `npm install`, `prisma migrate deploy`, `prisma generate`, then restart yx-api; do not re-run `prisma db seed` — its pay part fails on a second run), database `examapp_org`, Redis db 4. Preview servers (launch config `C:\.claude\launch.json`): yx-api 3001, yx-web 3000, yx-mock-idp 4010. Local mailbox (Mailpit) 8025; SMS texts are copied there as emails.
- Accounts: admin@demo-org.test / `DevAdmin123!`; others / `Passw0rd!2026` (hr@, panel@, arjun@, payroll@, …).
- Main also has Time and leave, payroll, onboarding and exit, Service Desk, global core and expenses. PowerShell 5.1 has no `&&`: give the founder commands for the Bash tool or one per line.
- Manual test lists do not exist yet for the new modules. After the move, write them in `manual-tests.json` (same style), area by area, starting with the ones the founder wants to see first (likely payroll screens and expenses).

## State of the code (12 Oct 2026)
- Merged to main: PRs #128–#150 (all modules above, plus CI that runs every e2e suite in 4 shards).
- Open work in the building session: remaining payroll screens and a six-change payroll batch (payroll builder, worktree `exam-app-pay`); performance PM2 onward (builder in `exam-app-life`, branch `feat/yukthix-performance-1`).
- Go-live checklist: `docs/yukthix/GO-LIVE-CHECKLIST.md`.
