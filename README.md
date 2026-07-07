# Online MCQ Examination Platform

## Phase 0: local development setup

1. Get a SQL Server instance reachable at `localhost:1433`. Either `docker compose up -d` (if Docker is available), or a native SQL Server Express/Developer install configured for TCP on port 1433 with Mixed Mode auth — see Task 2's notes in `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` for the exact native-install steps used on this project's original dev machine.
2. `npm install` — installs all workspace dependencies.
3. `cp .env.example apps/api/.env`
4. `cd apps/api && npx prisma migrate dev && npx prisma db seed && cd ../..`
5. `npm run dev:api` (terminal 1), `npm run dev:web` (terminal 2)
6. Visit `http://localhost:3000/login` — log in with `admin@demo-org.test` / `DevAdmin123!`, org slug `demo-org`.

## Running tests

- Unit tests: `npm run test:api`
- End-to-end tests (requires the database from step 1 running and migrated): `npm run test:api:e2e`

See `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md` for the full product/architecture design, and `docs/superpowers/plans/` for implementation plans.
