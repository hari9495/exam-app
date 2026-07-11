# Phase 6a: CI Pipeline + Dependency/Secret Scanning — Design Spec

## 1. Context & Scope

Phase 6 ("Compliance & Security Hardening") bundles at least six largely-independent workstreams in the master spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`): GDPR consent flows, biometric data retention/deletion, audit log completeness, access review, rate limiting hardening, dependency/secret scanning in CI, and a third-party pen test. Per this project's established pattern for every other multi-feature phase (1a-1d, 3a-3d, 4a-4e, 5a-5d), Phase 6 is decomposed into sub-phases:

- **6a (this spec): CI pipeline + dependency/secret scanning** — foundational, currently entirely missing.
- **6b: Rate limiting hardening** — also entirely missing today.
- **6c: Audit log completeness + access review** — widens existing sparse coverage, adds read/admin visibility.
- **6d: GDPR data subject rights** — consent capture, export/delete workflows.

The pen test line item from the master spec is explicitly **not** a sub-phase — it's an external vendor engagement that happens after 6a-6d ship, outside this implementation process entirely.

**Current state, confirmed by direct codebase survey before scoping:**
- No `.github/workflows` directory exists anywhere in the repo — there is no CI pipeline of any kind today.
- No dependency-scanning or secret-scanning tooling exists in any `package.json` across the five workspaces (root, `apps/api`, `apps/exam-runtime`, `packages/shared`, `apps/web`).
- No GitHub remote is configured — `git remote -v` returns nothing. This repo has been local-only for its entire history so far.
- Root `package.json` already declares `engines: { node: ">=20 <21" }`, and already has working `test:shared`, `test:api`, `test:exam-runtime` scripts that every phase of this project has used throughout.

## 2. Architecture

A single new GitHub Actions workflow, `.github/workflows/ci.yml`, triggered on every `push` and `pull_request` — this covers both this project's current direct-to-main pattern and any future PR-based flow without needing changes later. One job runs on `node: 20` (matching the existing `engines` constraint), with these steps in order:

1. `npm ci` at the repo root — installs all five workspaces in one pass from the existing lockfile.
2. `npm run test:shared`, `npm run test:api`, `npm run test:exam-runtime` — the three existing unit-test scripts, invoked exactly as they already exist, no new scripts needed.
3. `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime` — confirms both apps still compile.
4. **Dependency scan**: `npm audit --audit-level=high` (fails the job on high/critical findings), plus a second, non-blocking `npm audit` run with no severity floor (`|| true`) purely to surface moderate/low findings in the log without failing the build — matching "fail on high/critical, warn on moderate/low."
5. **Secret scan**: `gitleaks` via the public `gitleaks-action`, run against the full repo history. Chosen over GitHub's native secret scanning because native scanning requires GitHub Advanced Security (paid) for private repositories, while `gitleaks` works identically on any repo visibility with no GitHub plan dependency. Any detected secret fails the job.

Alongside the workflow: `.github/dependabot.yml` configures weekly automated dependency-update PRs for each of the five `package.json`s. This is complementary to the `npm audit` gate, not redundant with it — `npm audit` catches known-vulnerable versions already sitting in the lockfile *now*; Dependabot keeps dependencies from silently drifting stale *going forward*, catching future advisories automatically rather than only at the next manual audit run.

Both `.github/ci.yml` and `.github/dependabot.yml` sit inert until a GitHub remote exists — this phase deliberately does **not** set one up (a separate, meaningful decision involving visibility/access/billing that shouldn't be bundled into a compliance-hardening sub-phase). They activate automatically the moment a remote is connected and code is pushed.

**No application code changes** — this sub-phase is entirely CI/config; nothing in `apps/*` or `packages/*` changes.

## 3. File Structure

- **Create** `.github/workflows/ci.yml` — the pipeline described above.
- **Create** `.github/dependabot.yml` — weekly update PRs. A single root `npm` entry (Dependabot auto-detects npm workspaces from the root `package.json`/lockfile — a per-workspace entry would error, since all five workspaces share one lockfile), plus one `github-actions` entry. Corrected here from this spec's original per-workspace-entry claim during plan-writing self-review.
- **Create** `.nvmrc` (repo root, contents `20`) — matches the existing `engines` constraint so any tool that respects `.nvmrc` (including some GitHub Actions setup steps, and local `nvm`/`fnm` usage) stays consistent with CI without hardcoding the version in more than one place.

## 4. Testing & Verification Approach

There is no GitHub remote to run this pipeline against, so there is no way to get a live CI execution proving it passes end-to-end on GitHub's runners during this phase — that is a real, explicit limitation, not something to gloss over. Verification instead runs every step locally, standing in for what CI would do:

1. `npm ci` from a clean state, confirming the lockfile installs cleanly — exactly CI's first step.
2. Each of the three test scripts individually, confirming exit 0 — the exact commands the workflow invokes, not an approximation.
3. Both build commands, confirming exit 0.
4. `npm audit --audit-level=high` run locally against this repo's actual current dependency state — given the `ioredis`/`bullmq` exact-pin history from Phase 5a, there's a real chance this surfaces something worth knowing about *before* it becomes a CI gate everyone has to work around, so this needs to actually run and be read, not just authored.
5. `gitleaks` installed locally (a single static binary, no GitHub account needed) and run against the full repo history once, confirming it doesn't immediately flag anything already committed across five phases of AI-integration work (API keys pasted into test fixtures, stray `.env` files, etc.) — better to find that now, locally, than have the very first real CI run fail on day one for an unrelated historical reason.
6. YAML correctness is verified by careful manual authoring plus a local schema-aware check if one is available in this environment (e.g. `actionlint`) — GitHub Actions' own workflow-schema validation only happens on an actual push, which isn't possible yet.

## 5. Open Items

- No live CI execution is possible this phase without a GitHub remote. The pipeline's actual first real run happens whenever a remote is connected — explicitly out of scope for this sub-phase, per an earlier explicit decision.
- E2e tests are not included in this pipeline (explicit decision) — a natural follow-up sub-phase once this base pipeline is proven live, since e2e needs SQL Server + Redis as CI service containers, a meaningfully bigger addition than this phase's scope.
- The master spec's "third-party security review/pen test" line item is not addressed by 6a or any Phase 6 sub-phase — it's external vendor work, out of this implementation process's scope entirely.
