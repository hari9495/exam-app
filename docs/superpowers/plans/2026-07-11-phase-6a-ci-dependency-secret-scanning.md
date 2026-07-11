# Phase 6a — CI Pipeline + Dependency/Secret Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up this repo's first CI pipeline (`.github/workflows/ci.yml`) running the existing unit-test suites and builds, add a dependency-vulnerability gate (`npm audit`) and a secret-scanning gate (`gitleaks`) to it, and add `.github/dependabot.yml` for ongoing dependency freshness — all authored ready-to-run, since no GitHub remote exists yet to execute it live.

**Architecture:** One GitHub Actions workflow file, built up across three tasks (base pipeline, then dependency scanning, then secret scanning), plus one small standalone Dependabot config file and a `.nvmrc`. No application code changes anywhere — this phase is entirely CI/config.

**Tech Stack:** GitHub Actions (YAML), `npm audit` (built into npm, no new dependency), `gitleaks/gitleaks-action` (a public GitHub Action, no local install required for CI itself), Dependabot (native GitHub feature, config-only).

## Global Constraints

- No GitHub remote exists yet (`git remote -v` returns nothing) — this phase authors config that sits inert until one is connected. Setting up a remote is explicitly out of scope.
- Node version is pinned to `20` everywhere (matches the existing root `package.json`'s `engines: { node: ">=20 <21" }`).
- The workflow triggers on `push` and `pull_request` (both, unconditionally — no branch filter), since this project currently pushes directly to `main` and may use PRs later.
- Unit tests only in this pipeline — `test:shared`, `test:api`, `test:exam-runtime`. E2e tests are explicitly out of scope for this phase (they need SQL Server + Redis service containers, a bigger follow-up).
- Dependency scanning: `npm audit` must **fail the job** at `--audit-level=high` (blocks on high/critical), and separately **report** all severities without failing (moderate/low are visible, not blocking).
- Secret scanning: any detected secret **fails the job**. Use `gitleaks` specifically (not GitHub's native secret scanning, which requires paid GitHub Advanced Security for private repos).
- No live CI execution is possible this phase (no remote) — every task's verification is running the equivalent commands locally and confirming exit codes / output, not a live GitHub Actions run.

---

## File Structure

- **Create** `.github/workflows/ci.yml` — the pipeline, built incrementally across Tasks 1-3.
- **Create** `.nvmrc` — pins local tooling to the same Node version as CI.
- **Create** `.github/dependabot.yml` — weekly dependency-update PRs.

---

### Task 1: Base CI pipeline — install, unit tests, builds

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`

**Interfaces:**
- Consumes: the existing root `package.json` scripts `test:shared`, `test:api`, `test:exam-runtime` (unchanged, already used throughout this whole project) and the existing `npm run build --workspace=<name>` pattern (unchanged).
- Produces: `.github/workflows/ci.yml` with a single `test` job — Task 2 and Task 3 both add more steps to this same job, after the steps this task creates.

- [ ] **Step 1: Create `.nvmrc`**

Create `.nvmrc` at the repo root:

```
20
```

- [ ] **Step 2: Create the base workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run packages/shared unit tests
        run: npm run test:shared

      - name: Run apps/api unit tests
        run: npm run test:api

      - name: Run apps/exam-runtime unit tests
        run: npm run test:exam-runtime

      - name: Build apps/api
        run: npm run build --workspace=apps/api

      - name: Build apps/exam-runtime
        run: npm run build --workspace=apps/exam-runtime
```

- [ ] **Step 3: Validate the YAML is well-formed**

Since there's no GitHub remote to trigger a real run against, confirm the file parses as valid YAML (this catches indentation/syntax mistakes, though not GitHub Actions' own schema rules):

Run: `npx -y js-yaml .github/workflows/ci.yml`
Expected: exit 0, and the tool prints back the parsed structure (job name `test`, `runs-on`, and all 7 steps) with no error.

- [ ] **Step 4: Locally run every command the workflow invokes, in order**

This stands in for the live CI run that isn't possible yet. Run each of the following from the repo root and confirm it exits 0:

```bash
npm ci
npm run test:shared
npm run test:api
npm run test:exam-runtime
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
```

Expected: all six commands exit 0. `npm ci` reinstalls the entire dependency tree from the lockfile (this can take a few minutes and will remove `node_modules` first) — this is the same clean-install behavior CI will do on every run, so confirming it works locally now is directly meaningful, not just a formality.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .nvmrc
git commit -m "feat: add base CI pipeline (install, unit tests, builds)"
```

---

### Task 2: Dependency scanning

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: the `test` job and its existing steps from Task 1 — this task appends two new steps after the last one Task 1 created (`Build apps/exam-runtime`).
- Produces: nothing new consumed by Task 3 (Task 3 appends its own step independently, after this task's).

- [ ] **Step 1: Add the dependency-scan steps to the workflow**

Modify `.github/workflows/ci.yml` — add these two steps at the end of the `steps:` list, after the existing `Build apps/exam-runtime` step:

```yaml
      - name: Dependency audit report (all severities, informational)
        run: npm audit || true

      - name: Dependency audit gate (fails on high/critical)
        run: npm audit --audit-level=high
```

The report step runs first and always succeeds (the `|| true` absorbs npm audit's non-zero exit when it finds anything, at any severity) so its full output — including moderate/low findings — is always visible in the job log. The gate step runs second and genuinely fails the job only when `npm audit`'s own `--audit-level=high` threshold is met (high or critical severity).

The complete file after this step:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run packages/shared unit tests
        run: npm run test:shared

      - name: Run apps/api unit tests
        run: npm run test:api

      - name: Run apps/exam-runtime unit tests
        run: npm run test:exam-runtime

      - name: Build apps/api
        run: npm run build --workspace=apps/api

      - name: Build apps/exam-runtime
        run: npm run build --workspace=apps/exam-runtime

      - name: Dependency audit report (all severities, informational)
        run: npm audit || true

      - name: Dependency audit gate (fails on high/critical)
        run: npm audit --audit-level=high
```

- [ ] **Step 2: Create the Dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Note on why this is a single `npm` entry, not one per workspace (`apps/api`, `apps/exam-runtime`, `packages/shared`, `apps/web`): Dependabot's `npm` ecosystem auto-detects npm workspaces from the root `package.json`/`package-lock.json` and covers every workspace's dependencies from that one root `directory: "/"` entry — pointing it at each workspace subdirectory individually would be both unnecessary and incorrect, since those subdirectories don't have their own lockfile (they share the root's). The second entry (`github-actions`) keeps the pinned action versions in `ci.yml` itself (`actions/checkout@v4`, `actions/setup-node@v4`, and Task 3's `gitleaks/gitleaks-action`) up to date too — a standard, low-cost pairing with an `npm` entry.

- [ ] **Step 3: Validate both YAML files**

Run: `npx -y js-yaml .github/workflows/ci.yml && npx -y js-yaml .github/dependabot.yml`
Expected: exit 0 for both, no syntax errors.

- [ ] **Step 4: Run the two new commands locally**

```bash
npm audit
npm audit --audit-level=high
```

Expected: the first command exits with whatever npm audit's real exit code is for this repo's current dependency state (informational — read the output, note anything found) and the second command's exit code is what will actually gate CI. If the second command exits non-zero, this means the pipeline as written would currently fail on a real push — read the audit output, and if it reveals a real high/critical finding, note it in the report; do not silently change the gate's severity threshold to make it pass without that being a visible, deliberate decision.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml
git commit -m "feat: add dependency scanning (npm audit gate) and Dependabot"
```

---

### Task 3: Secret scanning

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `test` job from Tasks 1-2 — appends one more step at the end.
- Produces: nothing new consumed by later tasks (Task 4 is verification-only).

- [ ] **Step 1: Add the secret-scan step to the workflow**

Modify `.github/workflows/ci.yml` — add this step at the very end of the `steps:` list, after the existing `Dependency audit gate (fails on high/critical)` step:

```yaml
      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`gitleaks-action` scans the commits introduced by the triggering push (or the PR's diff, on `pull_request`) by default — it fails the job the moment it finds anything. This is deliberately narrower than the full-history scan Task 4 runs locally: the local one-time full-history check exists specifically to catch anything already committed *before* this gate ever went live, since the CI gate itself will only ever see new commits going forward.

The complete file after this step:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run packages/shared unit tests
        run: npm run test:shared

      - name: Run apps/api unit tests
        run: npm run test:api

      - name: Run apps/exam-runtime unit tests
        run: npm run test:exam-runtime

      - name: Build apps/api
        run: npm run build --workspace=apps/api

      - name: Build apps/exam-runtime
        run: npm run build --workspace=apps/exam-runtime

      - name: Dependency audit report (all severities, informational)
        run: npm audit || true

      - name: Dependency audit gate (fails on high/critical)
        run: npm audit --audit-level=high

      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate the YAML**

Run: `npx -y js-yaml .github/workflows/ci.yml`
Expected: exit 0, no syntax errors.

- [ ] **Step 3: Attempt a local one-time full-history secret scan**

There is no way to exercise `gitleaks-action` itself locally (it's a GitHub Actions-specific wrapper around the `gitleaks` CLI, meant to run inside a GitHub-hosted runner with GitHub's own commit/diff context). Instead, run the underlying `gitleaks` CLI directly against this repo's full history once, to confirm nothing already committed across this project's ~230 commits would trip the scanner the moment this gate goes live.

Attempt to install `gitleaks` via Chocolatey (already present on this Windows dev machine):

```bash
choco install gitleaks -y
```

If that succeeds, run a full-history scan from the repo root:

```bash
gitleaks detect --source . --log-opts="--all" --verbose
```

Expected: exit 0, with a summary reporting zero leaks found.

**If `choco install` fails** (e.g. blocked by permissions in a non-interactive session — a real possibility, since this exact class of problem was already hit trying to start Docker Desktop's Windows service earlier in this project), do not spend more than one attempt on it. Fall back to a manual heuristic sweep instead: search tracked files for common secret-shaped patterns that wouldn't already be caught by `.env` being gitignored:

```bash
git grep -niE "(sk-ant-|sk-|api[_-]?key\s*=\s*['\"][a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)" -- . ':!*.md' ':!package-lock.json'
```

Expected: no output (no matches). This is a narrower, best-effort substitute for a real `gitleaks` history scan — note explicitly in the report whether the real tool or this fallback was used, so a future pass with a working `gitleaks` install can do the complete check.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add secret scanning (gitleaks) to CI"
```

---

### Task 4: Final verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Validate all three config files as well-formed YAML**

Run: `npx -y js-yaml .github/workflows/ci.yml && npx -y js-yaml .github/dependabot.yml`
Expected: exit 0 for both.

- [ ] **Step 2: Re-run every command the finished workflow invokes, in the exact order they appear in the file**

```bash
npm ci
npm run test:shared
npm run test:api
npm run test:exam-runtime
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
npm audit || true
npm audit --audit-level=high
```

Expected: all commands behave the same as when first verified in Tasks 1-2 (no regression from the intervening commits) — the last command (`npm audit --audit-level=high`) is the one whose exit code determines whether the pipeline would currently pass on a real push.

- [ ] **Step 3: Re-confirm the secret-scan result from Task 3**

If `gitleaks` was successfully installed in Task 3, re-run:

```bash
gitleaks detect --source . --log-opts="--all" --verbose
```

If Task 3 used the manual fallback instead (because `choco install` was blocked), re-run the same fallback `git grep` command from Task 3 Step 3 and confirm it still finds nothing. Do not attempt a fresh `choco install` here if it already failed once in Task 3 — that outcome is already established.

- [ ] **Step 4: Confirm no unintended changes outside this phase's scope**

Run: `git status --short`
Expected: clean (everything from Tasks 1-3 already committed) — no untracked or modified files outside `.github/workflows/ci.yml`, `.github/dependabot.yml`, and `.nvmrc` across this phase's full commit history.

No commit for this task — verification only, matching this project's established final-verification-task precedent.
