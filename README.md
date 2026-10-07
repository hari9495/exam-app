# Online MCQ Examination Platform

## Phase 0: local development setup

1. Start PostgreSQL 17: put `POSTGRES_SUPERUSER_PASSWORD`, `APP_DB_OWNER_PASSWORD` and `APP_DB_APP_PASSWORD` (any random dev values, e.g. `openssl rand -base64 24`) in a repo-root `.env`, then `docker compose up -d`. The first start of the empty volume provisions the roles described under [Database](#database).

1a. Get Redis reachable at `localhost:6379` — `docker compose up -d` starts it (this repo's `docker-compose.yml`, added in Phase 5a). Required for `apps/api` to boot at all (it runs an in-process BullMQ worker) and for its e2e suite to run, not just for AI-job-specific features.

1b. `apps/api/package.json` pins `ioredis` to an exact version (`5.10.1`, no caret) instead of a caret range, because it must match `bullmq`'s own nested `ioredis` dependency exactly — a caret range doesn't dedupe against it, leaving two structurally-incompatible `Redis` classes and a TypeScript compile error. If bumping `bullmq`, check its `package.json` for its current `ioredis` requirement and update this pin to match.

2. `npm install` — installs all workspace dependencies. The Prisma client is generated automatically during install (`packages/shared`'s `prepare` script runs `prisma generate` before its own build, since its compile depends on the generated client). No separate `prisma generate` step is needed after a plain `npm install`/`npm ci` — only `--ignore-scripts` installs (like CI's) still need it run explicitly.
3. `cp .env.example apps/api/.env`, then fill the two passwords into `DATABASE_URL` / `MIGRATION_DATABASE_URL`.
4. `cd apps/api && npx prisma migrate deploy && npx prisma db seed && cd ../..`
5. `npm run dev:api` (terminal 1), `npm run dev:web` (terminal 2)
6. Visit `http://localhost:3000/login` — log in with `admin@demo-org.test` / `DevAdmin123!`, org slug `demo-org`.

### Sign-in on your laptop (YukthiX sign-in: email, mobile, Microsoft, Google)

The seed turns every way in on for the demo company (codes by email and SMS, Google and Microsoft) and gives
`recruiter@demo-org.test` the fictional verified mobile number +91 98450 12345. Google and Microsoft are a local
mock (panva's `oidc-provider`, a devDependency): nothing is sent to Google or Microsoft.

1. `npm run dev:mock-idp` (its own terminal) — a local "Google" and "Microsoft" at `http://127.0.0.1:4010`.
2. In `apps/api/.env` add `YX_MOCK_IDP_URL=http://127.0.0.1:4010`, `DEV_SMS_LOG_TEXT=1` and `DEV_SMS_TO_MAIL=1`,
   then restart `npm run dev:api`. (All three are for a laptop only: with `NODE_ENV=production` the API refuses
   to start with any of them, and `DEV_SMS_TO_MAIL` also refuses an `SMTP_HOST` that is not this machine.)
3. `cd apps/api && npx prisma db seed` once (it updates an existing demo company too).
4. Open `http://localhost:3000/yx/sign-in`:
   - **Continue with Google / Microsoft** opens the mock's page: pick *Demo admin*, *Demo recruiter* or *Demo panel
     member* to sign in (a role that needs two-step verification is asked to set it up). The people marked
     *(refused)* show what must fail: YukthiX staff, an address Google has not verified, another Microsoft
     directory claiming the admin's address, a personal Microsoft account. Each ends on the sign-in screen with
     the same message, and the reason is in Admin › Login activity.
   - **Continue with mobile**: `98450 12345`, *Text me a code* (or WhatsApp); the text arrives in Mailpit
     (`http://127.0.0.1:8025`) as a mail to `+919845012345@sms.local`, subject *SMS to +91 98450 12345*, and is
     also printed in the `dev:api` log (`[DevSms] sms to +919845012345: 123456 is your YukthiX sign-in code`).
   - **Work email**: as before (password, emailed code in Mailpit, or the company's SSO).
5. Settings › Security › *Allow sign-in with Google / Microsoft* turns each one off for the company (sign in as
   the admin; saving asks you to confirm it's you).

The API e2e suite starts the same mock on a free port (`apps/api/test/social-sign-in.e2e-spec.ts`).

## Phase 0: local development setup — apps/exam-runtime

`apps/exam-runtime` is a second app, separate from `apps/api`. It's the candidate-facing service — exam-taking, live monitoring, proctoring analysis, and grading. It needs its own `.env` file:

1. `cp .env.example apps/exam-runtime/.env`
2. Set `DATABASE_URL` to the same value as `apps/api/.env` (the app role). exam-runtime never migrates, so it does not need `MIGRATION_DATABASE_URL`.
3. Set `EXAM_RUNTIME_PORT`, `CANDIDATE_JWT_ACCESS_SECRET`, `CANDIDATE_JWT_REFRESH_SECRET`, and `ANTHROPIC_API_KEY`.
4. Set `WEB_ORIGIN`.
5. Set `JWT_ACCESS_SECRET` to the exact same value as `apps/api/.env`'s — the live-monitoring WebSocket gateway verifies staff JWTs issued by `apps/api`, so the secrets must match.
6. Set `INTERNAL_SERVICE_SECRET` to the exact same value as `apps/api/.env`'s as well.
7. `apps/exam-runtime` now starts two listeners: the public candidate-facing one on `EXAM_RUNTIME_PORT` (default 3002, all interfaces), and an internal-only one on `EXAM_RUNTIME_INTERNAL_PORT` (default 3003) bound to `EXAM_RUNTIME_INTERNAL_HOST` (default `127.0.0.1` — deliberately not reachable from outside this machine). `apps/api/.env`'s `EXAM_RUNTIME_INTERNAL_URL` must point at wherever the internal listener actually is (default `http://127.0.0.1:3003`). The `INTERNAL_SERVICE_SECRET` header check still applies on top of this network restriction — it isn't a replacement for it.
8. `npm run dev:exam-runtime` (in its own terminal, alongside `dev:api` and `dev:web`).

## Running tests

- Unit tests: `npm run test:api`
- End-to-end tests (requires the database from step 1 running and migrated): `npm run test:api:e2e`
- Database-level tenant isolation (runs as the app role; part of the e2e suite): `cd apps/api && npx jest --config ./test/jest-e2e.json rls-isolation`

## Database

PostgreSQL 17. Tenant isolation is enforced by the database with row-level security, not by app code alone:

- **Roles.** `examapp_owner` owns the database and schema and is the only role that runs `prisma migrate` (`MIGRATION_DATABASE_URL`, the schema's `directUrl`). `examapp_app` is the apps' login (`DATABASE_URL`): `NOSUPERUSER NOBYPASSRLS`, owns nothing, and gets DML through the `NOLOGIN` group `app_runtime`. Locally `docker/postgres/init/01-roles.sh` creates them; in production a DBA creates the same three roles once before the first `prisma migrate deploy` (the citext extension is created by the baseline migration and is a trusted extension, so the owner needs no superuser).
- **Policies.** Every table with an `organization_id` column has RLS enabled **and forced**, with one policy (`USING` + `WITH CHECK`): `organization_id = app.current_org`, or `app.is_super_admin = 'on'`. No context means zero rows and every write rejected. `audit_logs` is append-only for the app role. `rls-isolation.e2e-spec.ts` fails if a new tenant table is missing forced RLS.
- **Context.** `TenantPrismaService.forTenant` sets the context with `set_config(..., true)` inside the request's transaction, so it is discarded at commit/rollback and cannot leak across pooled connections. Scripts that need cross-tenant access do the same with `set_config('app.is_super_admin', 'on', true)` inside one `$transaction`.
- **Deploy.** `cd apps/api && npx prisma migrate deploy` (needs `MIGRATION_DATABASE_URL`), then start the apps with only `DATABASE_URL`. Use TLS (`sslmode=require` or `verify-full`) for any non-local server. The pre-PostgreSQL SQL Server migration history is kept read-only in `apps/api/prisma/migrations-sqlserver-archive/`; it is not applied.

## Working with packages/shared

`packages/shared`'s `package.json` `main` field points at its compiled `dist/index.js`, not the live `src/*.ts`, because `apps/api` and `apps/exam-runtime` resolve it as a normal Node package at runtime. `npm install` at the repo root triggers `packages/shared`'s `prepare` script (`npm run build`) automatically, so a fresh clone always gets a `dist/` build. However, if you edit anything under `packages/shared/src/` during an existing session, you must run `npm run build --workspace=packages/shared` yourself before `apps/api` or `apps/exam-runtime` will see the change — otherwise they keep running against the stale compiled output in `dist/`.

See `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md` for the full product/architecture design, and `docs/superpowers/plans/` for implementation plans.
