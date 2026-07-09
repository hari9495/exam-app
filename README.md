# Online MCQ Examination Platform

## Phase 0: local development setup

1. Get a SQL Server instance reachable at `localhost:1433`. Either `docker compose up -d` (if Docker is available), or a native SQL Server Express/Developer install configured for TCP on port 1433 with Mixed Mode auth — see Task 2's notes in `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` for the exact native-install steps used on this project's original dev machine.
2. `npm install` — installs all workspace dependencies.
3. `cp .env.example apps/api/.env`
4. `cd apps/api && npx prisma migrate deploy && npx prisma generate && npx prisma db seed && cd ../..`
5. `npm run dev:api` (terminal 1), `npm run dev:web` (terminal 2)
6. Visit `http://localhost:3000/login` — log in with `admin@demo-org.test` / `DevAdmin123!`, org slug `demo-org`.

## Phase 0: local development setup — apps/exam-runtime

`apps/exam-runtime` is a second app, separate from `apps/api`. It's the candidate-facing service — exam-taking, live monitoring, proctoring analysis, and grading. It needs its own `.env` file:

1. `cp .env.example apps/exam-runtime/.env`
2. Set `DATABASE_URL` to the same value as `apps/api/.env`.
3. Set `EXAM_RUNTIME_PORT`, `CANDIDATE_JWT_ACCESS_SECRET`, `CANDIDATE_JWT_REFRESH_SECRET`, and `ANTHROPIC_API_KEY`.
4. Set `WEB_ORIGIN`.
5. Set `JWT_ACCESS_SECRET` to the exact same value as `apps/api/.env`'s — the live-monitoring WebSocket gateway verifies staff JWTs issued by `apps/api`, so the secrets must match.
6. Set `INTERNAL_SERVICE_SECRET` to the exact same value as `apps/api/.env`'s as well.
7. `apps/exam-runtime` now starts two listeners: the public candidate-facing one on `EXAM_RUNTIME_PORT` (default 3002, all interfaces), and an internal-only one on `EXAM_RUNTIME_INTERNAL_PORT` (default 3003) bound to `EXAM_RUNTIME_INTERNAL_HOST` (default `127.0.0.1` — deliberately not reachable from outside this machine). `apps/api/.env`'s `EXAM_RUNTIME_INTERNAL_URL` must point at wherever the internal listener actually is (default `http://127.0.0.1:3003`). The `INTERNAL_SERVICE_SECRET` header check still applies on top of this network restriction — it isn't a replacement for it.
8. `npm run dev:exam-runtime` (in its own terminal, alongside `dev:api` and `dev:web`).

## Running tests

- Unit tests: `npm run test:api`
- End-to-end tests (requires the database from step 1 running and migrated): `npm run test:api:e2e`

## Working with packages/shared

`packages/shared`'s `package.json` `main` field points at its compiled `dist/index.js`, not the live `src/*.ts`, because `apps/api` and `apps/exam-runtime` resolve it as a normal Node package at runtime. `npm install` at the repo root triggers `packages/shared`'s `prepare` script (`npm run build`) automatically, so a fresh clone always gets a `dist/` build. However, if you edit anything under `packages/shared/src/` during an existing session, you must run `npm run build --workspace=packages/shared` yourself before `apps/api` or `apps/exam-runtime` will see the change — otherwise they keep running against the stale compiled output in `dist/`.

See `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md` for the full product/architecture design, and `docs/superpowers/plans/` for implementation plans.
