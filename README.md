# Online MCQ Examination Platform

## Phase 0: local development setup

1. Get a SQL Server instance reachable at `localhost:1433`. Either `docker compose up -d` (if Docker is available), or a native SQL Server Express/Developer install configured for TCP on port 1433 with Mixed Mode auth — see Task 2's notes in `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` for the exact native-install steps used on this project's original dev machine.
2. `npm install` — installs all workspace dependencies.
3. `cp .env.example apps/api/.env`
4. `cd apps/api && npx prisma migrate deploy && npx prisma generate && npx prisma db seed && cd ../..`
5. `npm run dev:api` (terminal 1), `npm run dev:web` (terminal 2)
6. Visit `http://localhost:3000/login` — log in with `admin@demo-org.test` / `DevAdmin123!`, org slug `demo-org`.

## Running tests

- Unit tests: `npm run test:api`
- End-to-end tests (requires the database from step 1 running and migrated): `npm run test:api:e2e`

## Working with packages/shared

`packages/shared`'s `package.json` `main` field points at its compiled `dist/index.js`, not the live `src/*.ts`, because `apps/api` and `apps/exam-runtime` resolve it as a normal Node package at runtime. `npm install` at the repo root triggers `packages/shared`'s `prepare` script (`npm run build`) automatically, so a fresh clone always gets a `dist/` build. However, if you edit anything under `packages/shared/src/` during an existing session, you must run `npm run build --workspace=packages/shared` yourself before `apps/api` or `apps/exam-runtime` will see the change — otherwise they keep running against the stale compiled output in `dist/`.

See `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md` for the full product/architecture design, and `docs/superpowers/plans/` for implementation plans.
