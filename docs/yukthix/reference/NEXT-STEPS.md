# YukthiX — Pending next steps

Parked 24 Sep 2026, to pick up later.

## Exam-app repository preparation and PostgreSQL migration (decision D10)

| # | Step | Risk | Status |
|---|---|---|---|
| 1 | Update local `main` from GitHub (fetch + fast-forward; 169 commits behind `origin/main`) | None | ⏸ pending approval |
| 2 | Save the 7 uncommitted files on `feat/careers-site` (sidebar / dashboard UI + one doc) by committing them to that branch | None | ⏸ pending approval |
| 3 | Branch clean-up: delete the 12 squash-merged duplicate branches, keep `feat/grouped-sidebar` parked, merge Dependabot NestJS + react-query bumps, close monaco 0.56 (breaks editor; runbook pins 0.52.2). Show full branch list before deleting. | Low | ⏸ pending approval |
| 4 | Write the PostgreSQL migration plan: fresh baseline; ~50 RLS policy migrations; session-context calls; raw SQL (item analytics, approvals, usage / quota); ~440 column-type annotations; append-only audit trigger; add tenant keys to exam tables that lack them (attempts, answers, invitations, results, proctoring events); file storage Azure Blob → S3-compatible; run ~5,000 unit + ~150 e2e tests; new effort estimate | Planning only | ⏸ pending approval |

Options offered: **A** all four (recommended) · **B** plan only · **C** other. Waiting for the team's decision.

Reference: `exam-app-reuse-inventory.md`.
