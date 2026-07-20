# Production Deployment — Phase 1: Hosting, Containerization & CD

## Context

This is Phase 1 of a multi-phase production-deployment initiative, triggered by a
production-readiness audit of the exam platform. The audit found the app has never
been deployed anywhere: no Dockerfile, no CD step in CI, all secrets in plain
`.env` files, local-only Redis, local-disk file storage, no observability, and a
network-isolation assumption (`127.0.0.1` binding between `apps/api` and
`apps/exam-runtime`) that only works when both processes share a host.

The full initiative is decomposed into sequenced phases, each with its own spec:

1. **Hosting, containerization & CD (this phase)** — get the app actually deployed.
2. Managed data & storage cutover — Azure SQL tier, managed Redis, Blob Storage, backups.
3. Secrets management — Azure Key Vault, replacing Container Apps' native secrets.
4. Observability & alerting — APM, error tracking, structured logging, uptime monitoring.
5. ~~Network isolation~~ — folded into this phase (see Architecture below); not a separate phase.
6. Piston sandbox hosting — folded into this phase as a minimal VM (see below); may be
   revisited later for a more scalable/HA setup if load requires it.
7. Staging environment, load testing, rollout strategy — validation phase, once 1-4 exist.

This spec covers **Phase 1 only**. Every other numbered item above is explicitly out of
scope here and will get its own spec when its turn comes.

## Problem

The exam platform (3-service npm-workspaces monorepo: `apps/api` and
`apps/exam-runtime` on NestJS, `apps/web` on Next.js, plus `packages/shared`) has no
deployment target. Nothing is running anywhere for real users. This phase makes it
possible to ship a working production deployment, with the minimum plumbing needed
for that to be true — not full production hardening (that's phases 2-7).

## Scope

- Containerize all 3 services with one multi-target Dockerfile.
- Host `apps/web`, `apps/api`, and `apps/exam-runtime` on Azure Container Apps (ACA),
  in a single Container Apps Environment.
- Solve internal service-to-service call isolation (`apps/api` ↔ `apps/exam-runtime`)
  using ACA's internal-only additional-port feature, replacing the current
  loopback-binding approach that breaks once the two services are separate containers.
- Stand up a minimal Azure VM running the existing Piston Docker image, since Piston's
  `privileged: true` requirement can't run on ACA (or any mainstream PaaS).
- Add a Redis Container App inside the same ACA Environment (not a managed service yet
  — that's Phase 2) to back rate limiting, the SAML replay cache, and BullMQ.
- Extend the existing CI workflow with a build-push-deploy stage that runs on every
  push to `main`, auto-deploying to production with no manual approval gate.
- Use GitHub Container Registry (GHCR) for images, authenticated via the GitHub
  Actions built-in token.
- No custom domain yet — ship on ACA's default `*.azurecontainerapps.io` hostnames;
  custom domain + TLS is a documented drop-in follow-up, not a blocker.
- Secrets for this phase live in ACA's built-in encrypted secrets store, set via
  `az containerapp secret set` — a real, adequate mechanism on its own, not a
  placeholder; Phase 3 later swaps the *source* to Key Vault without changing how the
  app consumes them.
- Database: point at the existing Azure SQL instance as-is (tier/backup-policy
  upgrades are Phase 2's concern, not this phase's).

## Out of Scope (explicitly deferred to later phases)

- Azure Key Vault / any secrets-manager migration (Phase 3).
- Custom domain, DNS, managed TLS certs (documented as a follow-up, not built here).
- Azure SQL tier change off serverless auto-pause, backup/PITR policy (Phase 2).
- Managed Azure Cache for Redis, Azure Blob Storage for file uploads (Phase 2).
- APM, error tracking (e.g. Sentry), structured logging, uptime monitoring, alerting
  (Phase 4).
- Staging environment, load testing, formal rollout/rollback runbook beyond basic
  SHA-tag rollback (Phase 7).
- Any change to Piston's own scaling/availability model beyond "one VM, running" —
  no HA, no autoscaling of the sandbox itself.
- Manual deployment approval gates — deploys are fully automatic on push to `main`,
  matching this project's existing direct-to-main workflow.

## Architecture

### Topology

Four deployable units:

| Unit | Where | Ingress |
|---|---|---|
| `apps/web` (Next.js) | Container App | External (public) |
| `apps/api` (NestJS) | Container App | External (public) + internal-only additional port |
| `apps/exam-runtime` (NestJS) | Container App | External (public) + internal-only additional port |
| Redis | Container App | Internal-only (never public) |
| Piston | Standalone Azure VM (`Standard_B2s` or similar burstable size) | Firewalled to the ACA Environment's outbound IP range only |

All three application Container Apps and the Redis Container App live in one Azure
Container Apps **Environment**, which gives them a shared internal DNS namespace and
private network — this is what makes internal-only ports and the Redis container
reachable to each other without being reachable from the public internet.

### Internal port isolation (replaces the `127.0.0.1` binding scheme)

Today, `apps/api` and `apps/exam-runtime` share a host in dev, and each exposes an
"internal" port bound to `127.0.0.1` — unreachable from outside that host by
construction — for cross-service calls (e.g. `apps/exam-runtime`'s AI-insight
regenerate route, called by `apps/api`). Every such call also carries
`INTERNAL_SERVICE_SECRET` as an app-level credential, independent of network position.

Once each service is its own Container App, `127.0.0.1` no longer refers to the other
service — this scheme stops working entirely, not just becomes less secure. The fix:
each of `apps/api` and `apps/exam-runtime` keeps its existing dual-port shape (one
public port, one internal port), but the internal port is configured as an ACA
**internal-only additional port** — reachable via the Container Apps Environment's
internal DNS name (e.g. `exam-runtime-internal.internal.<env-domain>`) from other apps
in the same environment, and *not* reachable from the public internet. This is a
native ACA capability at no extra cost — no VNet add-on purchase required.
`INTERNAL_SERVICE_SECRET` is unchanged and still validated on every internal request,
as defense in depth on top of the network-level restriction.

`EXAM_RUNTIME_INTERNAL_URL` and `API_INTERNAL_URL` (currently
`http://127.0.0.1:<port>`) change to point at each service's internal ACA DNS name
instead of loopback. `EXAM_RUNTIME_INTERNAL_HOST` / `API_INTERNAL_HOST` env vars are
repurposed (or replaced) accordingly at plan time.

The Phase 3d "internal bind-host regression guard" test currently protects the
invariant "the internal port isn't reachable from outside." That invariant is
unchanged; only its enforcement mechanism moves from an OS-level bind-address check to
an ACA-platform-level ingress check. The test itself needs a corresponding update —
left to the implementation plan, not this spec.

### Containerization

One root-level multi-stage `Dockerfile` with three build targets (`api`,
`exam-runtime`, `web`), sharing a common base stage that runs `npm ci` once at the
monorepo root and builds `packages/shared` once — avoiding three independent,
divergent rebuilds of the same shared package. Each target's final stage copies only
what that service needs (its own `dist/`, `node_modules`, and `packages/shared`'s
built output) into a slim runtime image.

### CD pipeline

Extends the existing `.github/workflows/ci.yml` (not a separate workflow file). After
the current test/build/`npm audit`/gitleaks steps pass on a push to `main`:

1. Log in to GHCR using the GitHub Actions built-in `GITHUB_TOKEN` — no new registry
   credential to create or rotate.
2. Build all three targets from the multi-target `Dockerfile`, tagging each image with
   the triggering commit's SHA (e.g. `ghcr.io/<org>/exam-app-api:<sha>`). SHA tags give
   a concrete audit trail of what's deployed at any point and make rollback
   (`az containerapp update --image ghcr.io/<org>/exam-app-api:<previous-sha>`)
   mechanical.
3. Push all three images to GHCR.
4. Run `az containerapp update` for each of the three application Container Apps
   (`apps/web`, `apps/api`, `apps/exam-runtime`) to deploy the new image, authenticated
   via an Azure service principal stored as a GitHub Actions secret, scoped to only
   this deployment's resource group.

No manual approval gate — every successful push to `main` deploys straight to
production, matching this project's existing direct-to-main development workflow.
There is no staging environment in this phase to gate against; that's Phase 7's
concern.

### Secrets & configuration

All secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CANDIDATE_JWT_*_SECRET`,
`INTERNAL_SERVICE_SECRET`, `ORG_SECRETS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`,
`DATABASE_URL`, `REDIS_URL`, `SMTP_*`) are set once per Container App via
`az containerapp secret set` (or an equivalent Bicep/ARM template checked into the
repo for repeatability) and injected as environment variables at container start.
Encrypted at rest by ACA. Not committed to git, not passed through CI logs.

### Piston

The existing `docker-compose.yml` Piston service configuration (image, privileged
mode, `PISTON_RUN_TIMEOUT`/`PISTON_COMPILE_TIMEOUT` overrides) is unchanged — it moves
onto a single Azure VM running Docker, using the same compose file (or an equivalent
`docker run` invocation) rather than any container orchestration platform, since it
needs privileged mode. `apps/exam-runtime`'s `PistonClient` base URL is reconfigured
to point at the VM's address. The VM's Piston port (2000) is firewalled (Azure Network
Security Group) to accept traffic only from the ACA Environment's outbound IP
range — never open to the public internet.

## Testing & Verification

- The existing test suite (unit + e2e, unchanged) remains the correctness gate in CI —
  this phase adds deployment plumbing, not application logic, so no new test suites
  are introduced.
- After the first successful deploy, a manual smoke-test pass: hit each service's
  public health endpoint directly, and separately trigger one real internal call (e.g.
  an AI-insight regenerate request from `apps/api` into `apps/exam-runtime`) to confirm
  the internal-port isolation works end-to-end in the deployed environment, not just
  in the design.
- Confirm the internal port is genuinely unreachable from outside the ACA
  Environment: attempt a direct request against the internal port's FQDN from outside
  the environment and confirm it fails.
- This smoke-test sequence is written down as a repeatable post-deploy checklist
  (exact commands), not just performed once and forgotten — future phases (7, in
  particular) may formalize it into an automated check.

## Error Handling & Rollback

- Rollback is a single `az containerapp update --image <previous-sha-tagged-image>`
  per affected service — no rebuild needed, since every deployed image is tagged with
  its exact source commit.
- A failed CI build or test run blocks the deploy stage entirely (existing CI
  behavior, unchanged) — a broken commit never reaches the build-push-deploy stage.
- A failed `az containerapp update` (e.g. bad image, container crash-loop) is visible
  in the GitHub Actions run log and in ACA's own revision history; ACA keeps the prior
  revision running until the new one is confirmed healthy (this is default ACA
  revision behavior, not something this phase builds custom logic for).
