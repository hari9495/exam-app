# Production Deployment — Phase 1: Hosting, Containerization & CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the exam platform (`apps/api`, `apps/exam-runtime`, `apps/web`) actually running in production for the first time, on Azure Container Apps, with automated deploy-on-push CI/CD.

**Architecture:** Containerize all 3 services via one multi-target Dockerfile, host them on a single Azure Container Apps Environment (plus a Redis Container App and a standalone Piston VM), and extend the existing GitHub Actions CI workflow to build/push/deploy on every push to `main`. Internal `apps/api` ↔ `apps/exam-runtime` calls move from loopback-binding isolation to Azure Container Apps' internal-only additional-port feature.

**Tech Stack:** Docker, Azure Container Apps (ACA), Azure Bicep (infrastructure as code), GitHub Actions, GitHub Container Registry (GHCR), Azure VM (Piston).

## Global Constraints

- Node engine range is `>=20 <21` (root `package.json`) — all Docker base images must be `node:20-*`.
- No manual deploy-approval gate: every successful push to `main` deploys straight to production (confirmed decision, matches this project's existing direct-to-main workflow).
- No custom domain in this phase — ship on Azure's default `*.azurecontainerapps.io` hostnames.
- Secrets live in Azure Container Apps' built-in secrets store (not Key Vault — that's a later phase), set via infrastructure-as-code / `az containerapp secret set`, never committed to git.
- Redis is a Container App inside the same ACA Environment (not a managed service yet — that's a later phase).
- Piston (code-execution sandbox) cannot run on ACA (`privileged: true` isn't supported there) — it gets a standalone Azure VM, firewalled to only accept traffic from the ACA Environment's outbound IP range.
- Registry is GitHub Container Registry (GHCR), authenticated via the GitHub Actions built-in `GITHUB_TOKEN` — no separate registry credential to create or rotate for CI.
- This repo has **no GitHub remote configured yet** (`git remote -v` is empty) — Task 1 creates it. The existing `.github/workflows/ci.yml` has therefore never actually run in GitHub Actions before this plan.
- Use Bicep (deployed via `az deployment group create`), not `az containerapp create/update --yaml`, for any Container App using `additionalPortMappings` — there's a documented bug where the CLI's `--yaml` path silently ignores `additionalPortMappings` (https://github.com/microsoft/azure-container-apps/issues/1073). Bicep goes through ARM directly and isn't affected by that specific CLI code path.
- Azure CLI in this environment is already authenticated to a real subscription (`az account show` → subscription `fdb37ff9-cbb2-4a58-997a-acec3bcc5458`, "Azure subscription 1") and `gh` is authenticated to GitHub account `hari9495` with `repo`+`workflow` scopes — every task below runs real commands against real infrastructure, not a simulation.

---

### Task 1: Create the GitHub repository and push

**Files:**
- None (no code changes — this is standing up the remote).

**Interfaces:**
- Produces: a GitHub repo at `hari9495/exam-platform` (private), with `main` pushed and tracking `origin/main`. Every later task assumes this repo exists and CI runs there.

- [ ] **Step 1: Create the private repo and push in one command**

```bash
cd "D:/exam app"
gh repo create hari9495/exam-platform --private --source=. --remote=origin --push
```

- [ ] **Step 2: Verify the repo exists and `main` matches local HEAD**

```bash
gh repo view hari9495/exam-platform --json name,visibility,defaultBranchRef
git rev-parse HEAD
git rev-parse origin/main
```

Expected: `visibility` is `PRIVATE`, and both `git rev-parse` commands print the same commit SHA.

- [ ] **Step 3: Confirm the existing CI workflow actually runs, and passes, on GitHub for the first time**

The push in Step 1 triggers `.github/workflows/ci.yml` (it's `on: push`). Wait for it and check the result:

```bash
gh run list --repo hari9495/exam-platform --limit 1
gh run watch --repo hari9495/exam-platform --exit-status
```

Expected: the run completes with conclusion `success`. If it fails, read the failure with `gh run view --repo hari9495/exam-platform --log-failed` — this is the first time this test suite has ever run in GitHub's clean-runner environment (as opposed to this local dev machine), so a genuine environment-difference failure here is a real finding, not a fluke. Fix root cause before proceeding to Task 2; do not skip or work around a failing baseline CI run.

- [ ] **Step 4: Report**

Note the repo URL and the passing run URL (`gh run view --repo hari9495/exam-platform --web` gives a link) in the task report.

---

### Task 2: Multi-target Dockerfile and first manual image push

**Files:**
- Create: `Dockerfile` (repo root)
- Create: `.dockerignore` (repo root)
- Modify: `apps/web/next.config.js`

**Interfaces:**
- Produces: three buildable image targets — `api`, `exam-runtime`, `web` — pushed to `ghcr.io/hari9495/exam-platform-api`, `ghcr.io/hari9495/exam-platform-exam-runtime`, `ghcr.io/hari9495/exam-platform-web`, each tagged with the current git SHA. Task 4 references these exact image references.
- Consumes: the existing, already-verified-working CI install/build sequence from `.github/workflows/ci.yml` (`npm ci --ignore-scripts` → `npx prisma generate` → `npm rebuild` → `npm run build --workspace=packages/shared` → per-app build) — the Dockerfile's build stage mirrors this exactly rather than inventing a new sequence.

- [ ] **Step 1: Enable Next.js standalone output**

`apps/web/next.config.js` currently has no `output` setting, so `next build` produces a full build that still needs the entire `node_modules` tree at runtime — too large for a lean container image. Add `output: 'standalone'`, which makes `next build` trace actual runtime dependencies and emit a self-contained `.next/standalone` folder with a minimal `server.js`.

```js
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
};
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
**/node_modules
**/dist
**/.next
.git
.env
.env.local
docs
.superpowers
```

- [ ] **Step 3: Write the root `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/exam-runtime/package.json apps/exam-runtime/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts

FROM base AS build
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm rebuild
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api
RUN npm run build --workspace=apps/exam-runtime
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS api
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
EXPOSE 3001 3505
CMD ["node", "apps/api/dist/main.js"]

FROM node:20-alpine AS exam-runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/exam-runtime/dist ./apps/exam-runtime/dist
COPY --from=build /repo/apps/exam-runtime/package.json ./apps/exam-runtime/package.json
EXPOSE 3002 3003
CMD ["node", "apps/exam-runtime/dist/main.js"]

FROM node:20-alpine AS web
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Note on the `web` target's `COPY` paths: Next.js standalone output in an npm-workspaces monorepo mirrors the source tree, so the traced server entrypoint should land at `.next/standalone/apps/web/server.js`. Step 5 below verifies this by actually running the built image — if the container fails to start with a "cannot find module" style error, run `docker run --rm --entrypoint sh ghcr.io/hari9495/exam-platform-web:test -c "find / -maxdepth 4 -name server.js"` inside the built image to find the real path and correct the `COPY`/`CMD` lines accordingly, rather than guessing.

- [ ] **Step 4: Build all three targets locally**

```bash
docker build --target api -t exam-platform-api:test .
docker build --target exam-runtime -t exam-platform-exam-runtime:test .
docker build --target web -t exam-platform-web:test .
```

Expected: all three builds exit 0.

- [ ] **Step 5: Run each image and confirm it actually boots**

Use this machine's existing local Redis (`docker-compose.yml`'s `redis` service — start it with `docker compose up -d redis` if not already running) and the `DATABASE_URL` already configured for local dev (check `apps/api/.env` for the current value) to give each container a real, working set of dependencies to connect to:

```bash
docker run --rm -p 3001:3001 -p 3505:3505 \
  -e DATABASE_URL="<value from apps/api/.env>" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e JWT_ACCESS_SECRET=test -e JWT_REFRESH_SECRET=test \
  -e CANDIDATE_JWT_ACCESS_SECRET=test -e CANDIDATE_JWT_REFRESH_SECRET=test \
  -e INTERNAL_SERVICE_SECRET=test -e ORG_SECRETS_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e API_ORIGIN=http://localhost:3001 -e WEB_ORIGIN=http://localhost:3000 \
  exam-platform-api:test
```

Expected: logs show NestJS's `Nest application successfully started` for both the public and internal listeners, no crash. Repeat the same pattern for `exam-runtime:test` (swap in its own env vars: `EXAM_RUNTIME_PORT`, `EXAM_RUNTIME_INTERNAL_PORT`, `PISTON_API_URL=http://localhost:2000` is fine to leave unreachable for this smoke check) and for `web:test` (`docker run --rm -p 3000:3000 -e NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1 exam-platform-web:test`, expect the Next.js "Ready" log line and a `200` from `curl http://localhost:3000`).

- [ ] **Step 6: Log in to GHCR and push all three images tagged with the current commit SHA**

```bash
SHA=$(git rev-parse HEAD)
echo $(gh auth token) | docker login ghcr.io -u hari9495 --password-stdin

docker tag exam-platform-api:test ghcr.io/hari9495/exam-platform-api:$SHA
docker tag exam-platform-exam-runtime:test ghcr.io/hari9495/exam-platform-exam-runtime:$SHA
docker tag exam-platform-web:test ghcr.io/hari9495/exam-platform-web:$SHA

docker push ghcr.io/hari9495/exam-platform-api:$SHA
docker push ghcr.io/hari9495/exam-platform-exam-runtime:$SHA
docker push ghcr.io/hari9495/exam-platform-web:$SHA
```

Expected: all three pushes succeed. Note the exact `$SHA` value used — Task 4 references these three image tags by this same SHA.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore apps/web/next.config.js
git commit -m "build: multi-target Dockerfile for api, exam-runtime, and web"
git push
```

---

### Task 3: Azure base infrastructure — resource group, Log Analytics, Container Apps Environment, Redis

**Files:**
- Create: `infra/main.bicep`
- Create: `infra/README.md`

**Interfaces:**
- Produces: resource group `exam-platform-prod`, Container Apps Environment `exam-platform-env`, and a running `redis` Container App reachable at internal DNS name `redis` (ACA resolves internal-only Container App names directly by app name within the same environment). Task 4 deploys into this same environment and references `redis` as `REDIS_URL=redis://redis:6379`.

- [ ] **Step 1: Register required resource providers and the Container Apps CLI extension**

```bash
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

- [ ] **Step 2: Create the resource group**

```bash
az group create --name exam-platform-prod --location eastus
```

- [ ] **Step 3: Write `infra/main.bicep`**

```bicep
@description('Azure region for all resources')
param location string = resourceGroup().location

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'exam-platform-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'exam-platform-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource redis 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'redis'
  location: location
  properties: {
    managedEnvironmentId: acaEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 6379
        transport: 'tcp'
      }
    }
    template: {
      containers: [
        {
          name: 'redis'
          image: 'redis:7-alpine'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output acaEnvId string = acaEnv.id
output acaEnvDefaultDomain string = acaEnv.properties.defaultDomain
```

- [ ] **Step 4: Validate before deploying**

```bash
az deployment group validate \
  --resource-group exam-platform-prod \
  --template-file infra/main.bicep
```

Expected: no errors. If Bicep reports an unknown property, that property name has drifted from what's documented above — check the error message (it names the exact invalid property) and correct it; don't guess.

- [ ] **Step 5: Deploy**

```bash
az deployment group create \
  --resource-group exam-platform-prod \
  --template-file infra/main.bicep \
  --query properties.outputs
```

Note the `acaEnvId` and `acaEnvDefaultDomain` outputs — Task 4's Bicep needs `acaEnvId` as an input parameter.

- [ ] **Step 6: Verify Redis is actually running**

```bash
az containerapp show \
  --name redis --resource-group exam-platform-prod \
  --query "properties.runningStatus"
```

Expected: `"Running"`. Full end-to-end proof that `apps/api`/`apps/exam-runtime` can actually reach it happens in Task 4's verification, once those apps exist to test from.

- [ ] **Step 7: Write `infra/README.md`**

```markdown
# Infrastructure

Bicep templates for the exam platform's Azure Container Apps deployment.

- `main.bicep` — resource group contents: Log Analytics workspace, the
  Container Apps Environment, and the Redis Container App.

Deploy changes with:

    az deployment group validate --resource-group exam-platform-prod --template-file infra/main.bicep
    az deployment group create --resource-group exam-platform-prod --template-file infra/main.bicep

Secrets referenced by the app Container Apps (see `apps.bicep`, added in a
later task) are set once via `az containerapp secret set` and are not stored
in this repo.
```

- [ ] **Step 8: Commit**

```bash
git add infra/main.bicep infra/README.md
git commit -m "infra: Azure base infrastructure (resource group, Log Analytics, ACA environment, Redis)"
git push
```

---

### Task 4: Deploy the three application Container Apps

**Files:**
- Create: `infra/apps.bicep`

**Interfaces:**
- Consumes: `acaEnvId` output from Task 3's `main.bicep`; the three GHCR image tags pushed in Task 2 (`ghcr.io/hari9495/exam-platform-{api,exam-runtime,web}:$SHA`).
- Produces: three running, publicly-reachable Container Apps with real `*.azurecontainerapps.io` FQDNs. Task 5 (Piston) and Task 6 (CD) both reference these app names (`exam-platform-api`, `exam-platform-exam-runtime`, `exam-platform-web`).

- [ ] **Step 1: Set all application secrets once, before deploying**

Container App secrets must exist before a container app definition can reference them via `secretRef`. Use the actual production-appropriate values (generate fresh secrets — do not reuse the `dev-*-change-me` placeholders from `.env.example`):

```bash
RG=exam-platform-prod

az containerapp env show --name exam-platform-env --resource-group $RG >/dev/null # sanity check it exists

# Generate fresh secrets for anything that's a random key, reuse real values for anything that must match an external system (DB, SMTP, Anthropic key)
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CANDIDATE_JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CANDIDATE_JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
INTERNAL_SERVICE_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ORG_SECRETS_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Record these generated values somewhere safe outside this repo (a password manager) — they are not recoverable from Azure after creation, only rotatable.

The remaining secrets (`DATABASE_URL` for the existing Azure SQL instance, `ANTHROPIC_API_KEY`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`) come from whatever real values are already in use — check `apps/api/.env` for the current `DATABASE_URL` and `ANTHROPIC_API_KEY`, and the org's real SMTP provider credentials.

- [ ] **Step 2: Write `infra/apps.bicep`**

```bicep
@description('Resource ID of the Container Apps Environment from main.bicep')
param acaEnvId string

@description('Image tag (git SHA) to deploy — shared across all three services')
param imageTag string

@secure()
param databaseUrl string
@secure()
param jwtAccessSecret string
@secure()
param jwtRefreshSecret string
@secure()
param candidateJwtAccessSecret string
@secure()
param candidateJwtRefreshSecret string
@secure()
param internalServiceSecret string
@secure()
param orgSecretsEncryptionKey string
@secure()
param anthropicApiKey string
@secure()
param smtpHost string
param smtpPort string
@secure()
param smtpUser string
@secure()
param smtpPass string
@secure()
param ghcrToken string

var registrySecrets = [
  { name: 'ghcr-token', value: ghcrToken }
  { name: 'database-url', value: databaseUrl }
  { name: 'jwt-access-secret', value: jwtAccessSecret }
  { name: 'jwt-refresh-secret', value: jwtRefreshSecret }
  { name: 'candidate-jwt-access-secret', value: candidateJwtAccessSecret }
  { name: 'candidate-jwt-refresh-secret', value: candidateJwtRefreshSecret }
  { name: 'internal-service-secret', value: internalServiceSecret }
  { name: 'org-secrets-encryption-key', value: orgSecretsEncryptionKey }
  { name: 'anthropic-api-key', value: anthropicApiKey }
  { name: 'smtp-user', value: smtpUser }
  { name: 'smtp-pass', value: smtpPass }
]

var registryConfig = {
  server: 'ghcr.io'
  username: 'hari9495'
  passwordSecretRef: 'ghcr-token'
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'exam-platform-api'
  location: resourceGroup().location
  properties: {
    managedEnvironmentId: acaEnvId
    configuration: {
      registries: [registryConfig]
      secrets: registrySecrets
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        additionalPortMappings: [
          { external: false, targetPort: 3505, exposedPort: 3505 }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: 'ghcr.io/hari9495/exam-platform-api:${imageTag}'
          env: [
            { name: 'API_PORT', value: '3001' }
            { name: 'API_INTERNAL_PORT', value: '3505' }
            { name: 'API_INTERNAL_HOST', value: '0.0.0.0' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', value: 'redis://redis:6379' }
            { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
            { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
            { name: 'ACCESS_TOKEN_TTL_SECONDS', value: '900' }
            { name: 'REFRESH_TOKEN_TTL_DAYS', value: '30' }
            { name: 'CANDIDATE_JWT_ACCESS_SECRET', secretRef: 'candidate-jwt-access-secret' }
            { name: 'CANDIDATE_JWT_REFRESH_SECRET', secretRef: 'candidate-jwt-refresh-secret' }
            { name: 'CANDIDATE_ACCESS_TOKEN_TTL_SECONDS', value: '14400' }
            { name: 'CANDIDATE_REFRESH_TOKEN_TTL_DAYS', value: '1' }
            { name: 'INTERNAL_SERVICE_SECRET', secretRef: 'internal-service-secret' }
            { name: 'ORG_SECRETS_ENCRYPTION_KEY', secretRef: 'org-secrets-encryption-key' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'SMTP_HOST', value: smtpHost }
            { name: 'SMTP_PORT', value: smtpPort }
            { name: 'SMTP_USER', secretRef: 'smtp-user' }
            { name: 'SMTP_PASS', secretRef: 'smtp-pass' }
            { name: 'EXAM_RUNTIME_INTERNAL_URL', value: 'http://exam-platform-exam-runtime:3003/api/v1' }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource examRuntime 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'exam-platform-exam-runtime'
  location: resourceGroup().location
  properties: {
    managedEnvironmentId: acaEnvId
    configuration: {
      registries: [registryConfig]
      secrets: registrySecrets
      ingress: {
        external: true
        targetPort: 3002
        transport: 'http'
        additionalPortMappings: [
          { external: false, targetPort: 3003, exposedPort: 3003 }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'exam-runtime'
          image: 'ghcr.io/hari9495/exam-platform-exam-runtime:${imageTag}'
          env: [
            { name: 'EXAM_RUNTIME_PORT', value: '3002' }
            { name: 'EXAM_RUNTIME_INTERNAL_PORT', value: '3003' }
            { name: 'EXAM_RUNTIME_INTERNAL_HOST', value: '0.0.0.0' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', value: 'redis://redis:6379' }
            { name: 'CANDIDATE_JWT_ACCESS_SECRET', secretRef: 'candidate-jwt-access-secret' }
            { name: 'CANDIDATE_JWT_REFRESH_SECRET', secretRef: 'candidate-jwt-refresh-secret' }
            { name: 'INTERNAL_SERVICE_SECRET', secretRef: 'internal-service-secret' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'API_INTERNAL_URL', value: 'http://exam-platform-api:3505/api/v1' }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'exam-platform-web'
  location: resourceGroup().location
  properties: {
    managedEnvironmentId: acaEnvId
    configuration: {
      registries: [registryConfig]
      secrets: [{ name: 'ghcr-token', value: ghcrToken }]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'ghcr.io/hari9495/exam-platform-web:${imageTag}'
          env: [
            { name: 'NEXT_PUBLIC_API_BASE', value: 'https://${api.properties.configuration.ingress.fqdn}/api/v1' }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output apiFqdn string = api.properties.configuration.ingress.fqdn
output examRuntimeFqdn string = examRuntime.properties.configuration.ingress.fqdn
output webFqdn string = web.properties.configuration.ingress.fqdn
```

Note: `API_INTERNAL_URL` on `exam-runtime` above uses `exam-platform-api`'s in-environment app name directly (ACA resolves a Container App's own name to its internal address within the same environment automatically — this works for the additional internal-only port the same way it works for `redis` in Task 3), not a manually-looked-up FQDN.

- [ ] **Step 3: Deploy, passing the SHA from Task 2 and the secrets from Step 1**

```bash
SHA=<the exact SHA used when pushing images in Task 2, Step 6>
MAIN_OUTPUTS=$(az deployment group show --resource-group exam-platform-prod --name main --query properties.outputs)
ACA_ENV_ID=$(echo $MAIN_OUTPUTS | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).acaEnvId.value)")

az deployment group create \
  --resource-group exam-platform-prod \
  --template-file infra/apps.bicep \
  --parameters \
    acaEnvId="$ACA_ENV_ID" \
    imageTag="$SHA" \
    databaseUrl="<real value>" \
    jwtAccessSecret="$JWT_ACCESS_SECRET" \
    jwtRefreshSecret="$JWT_REFRESH_SECRET" \
    candidateJwtAccessSecret="$CANDIDATE_JWT_ACCESS_SECRET" \
    candidateJwtRefreshSecret="$CANDIDATE_JWT_REFRESH_SECRET" \
    internalServiceSecret="$INTERNAL_SERVICE_SECRET" \
    orgSecretsEncryptionKey="$ORG_SECRETS_ENCRYPTION_KEY" \
    anthropicApiKey="<real value>" \
    smtpHost="<real value>" smtpPort="587" smtpUser="<real value>" smtpPass="<real value>" \
    ghcrToken="$(gh auth token)" \
  --query properties.outputs
```

- [ ] **Step 4: Second pass — wire the cross-service URLs now that FQDNs are known**

`WEB_ORIGIN` (needed by `api` and `exam-runtime` for CORS) can only be set once `web`'s FQDN exists, which only happens after Step 3's deploy. Update all three apps:

```bash
WEB_FQDN=$(az containerapp show --name exam-platform-web --resource-group exam-platform-prod --query properties.configuration.ingress.fqdn -o tsv)
API_FQDN=$(az containerapp show --name exam-platform-api --resource-group exam-platform-prod --query properties.configuration.ingress.fqdn -o tsv)
EXAM_RUNTIME_FQDN=$(az containerapp show --name exam-platform-exam-runtime --resource-group exam-platform-prod --query properties.configuration.ingress.fqdn -o tsv)

az containerapp update --name exam-platform-api --resource-group exam-platform-prod \
  --set-env-vars "WEB_ORIGIN=https://$WEB_FQDN" "API_ORIGIN=https://$API_FQDN"

az containerapp update --name exam-platform-exam-runtime --resource-group exam-platform-prod \
  --set-env-vars "WEB_ORIGIN=https://$WEB_FQDN"
```

`EXAM_RUNTIME_INTERNAL_URL` (on `api`) and `API_INTERNAL_URL` (on `exam-runtime`) don't need this second pass — both point at the other service's in-environment app name (`exam-platform-exam-runtime`, `exam-platform-api`), which ACA resolves within the environment regardless of any FQDN, so both are already set directly in Step 2's Bicep. Only `WEB_ORIGIN`/`API_ORIGIN`, which need the real public FQDNs, wait for this second pass.

- [ ] **Step 5: Verify the public endpoints are actually reachable**

```bash
curl -i https://$API_FQDN/api/v1/auth/saml/nonexistent-org/status
curl -i https://$EXAM_RUNTIME_FQDN/api/v1
curl -i https://$WEB_FQDN
```

Expected: real HTTP responses (not connection errors) from all three — a 4xx from the SAML status check is fine (it's a real endpoint responding, just to a nonexistent org), a 200/302 from the others.

- [ ] **Step 6: Verify the internal port actually enforces isolation**

Confirm `additionalPortMappings` genuinely applied (this is the exact failure mode the CLI-YAML bug in the Global Constraints note would cause — Bicep should avoid it, but verify directly rather than trusting that):

```bash
az containerapp show --name exam-platform-api --resource-group exam-platform-prod \
  --query "properties.configuration.ingress.additionalPortMappings"
```

Expected: shows the `3505` mapping with `external: false`. Then confirm it's unreachable from outside the environment:

```bash
curl -i --max-time 5 https://exam-platform-api--<any-revision-suffix>.<region>.azurecontainerapps.io:3505/api/v1
```

Expected: connection failure/timeout, not a response — the internal port must not be reachable via any public URL. If `additionalPortMappings` is empty despite Step 2's Bicep specifying it, this is the documented Azure platform bug reproducing even via Bicep; escalate by filing/checking https://github.com/microsoft/azure-container-apps/issues/1073 for updates and report this finding rather than proceeding as if isolation is in place.

- [ ] **Step 7: Commit**

```bash
git add infra/apps.bicep
git commit -m "infra: deploy the three application Container Apps"
git push
```

---

### Task 5: Piston sandbox VM

**Files:**
- Create: `infra/piston-vm.sh`

**Interfaces:**
- Produces: a running Azure VM serving Piston on port 2000, reachable only from the ACA Environment's outbound IPs. Sets `PISTON_API_URL` on `exam-platform-exam-runtime`.

- [ ] **Step 1: Find the ACA Environment's outbound IP range**

```bash
az containerapp env show --name exam-platform-env --resource-group exam-platform-prod \
  --query "properties.staticIp"
```

Note this IP — it's the source address the NSG rule in Step 3 needs to allow. (Consumption-plan ACA environments route outbound traffic through this static IP.)

- [ ] **Step 2: Write `infra/piston-vm.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
RG=exam-platform-prod
VM_NAME=exam-platform-piston
ACA_OUTBOUND_IP=$1 # pass the IP found in Step 1

az vm create \
  --resource-group $RG \
  --name $VM_NAME \
  --image Ubuntu2404 \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard

az vm open-port --resource-group $RG --name $VM_NAME --port 22 --priority 900
az vm open-port --resource-group $RG --name $VM_NAME --port 2000 --priority 910 \
  --source-address-prefixes "$ACA_OUTBOUND_IP/32"

az vm run-command invoke \
  --resource-group $RG --name $VM_NAME \
  --command-id RunShellScript \
  --scripts "
    curl -fsSL https://get.docker.com | sh
    docker run -d --restart unless-stopped --name piston \
      --privileged \
      -p 2000:2000 \
      --tmpfs /piston/jobs:exec \
      -e PISTON_RUN_TIMEOUT=10000 \
      -e PISTON_COMPILE_TIMEOUT=10000 \
      ghcr.io/engineer-man/piston
  "

az vm show --resource-group $RG --name $VM_NAME --show-details --query publicIps -o tsv
```

This mirrors `docker-compose.yml`'s existing Piston service configuration exactly (same image, same privileged mode, same timeout overrides) — no change to how Piston itself is configured, only where it runs.

- [ ] **Step 3: Run it**

```bash
chmod +x infra/piston-vm.sh
ACA_IP=<value from Step 1>
./infra/piston-vm.sh "$ACA_IP"
```

Note the printed public IP.

- [ ] **Step 4: Wire `PISTON_API_URL` on exam-runtime**

```bash
PISTON_IP=<value from Step 3>
az containerapp update --name exam-platform-exam-runtime --resource-group exam-platform-prod \
  --set-env-vars "PISTON_API_URL=http://$PISTON_IP:2000"
```

- [ ] **Step 5: Verify end-to-end through the real deployed exam-runtime**

Don't just curl the VM directly (the NSG rule from Step 2 restricts port 2000 to the ACA outbound IP only, so a direct curl from this machine should fail — that's the isolation working correctly). Instead, exercise the actual code-execution path through the deployed API. If a real recruiter/candidate account with a code question isn't set up yet, at minimum confirm the NSG restriction:

```bash
curl -i --max-time 5 http://$PISTON_IP:2000/api/v2/runtimes
```

Expected: this fails/times out from this machine (not the ACA environment) — confirming the firewall genuinely restricts access, not just documents an intent to.

- [ ] **Step 6: Commit**

```bash
git add infra/piston-vm.sh
git commit -m "infra: Piston code-execution sandbox VM"
git push
```

---

### Task 6: CD pipeline — extend CI with build, push, migrate, deploy

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the Dockerfile from Task 2, the Container App names from Task 4 (`exam-platform-api`, `exam-platform-exam-runtime`, `exam-platform-web`).
- Produces: on every push to `main` that passes the existing test suite, new images are built, pushed to GHCR tagged with the triggering commit's SHA, database migrations are applied, and all three Container Apps are updated to the new image.

- [ ] **Step 1: Create an Azure service principal scoped to only this resource group, for GitHub Actions to authenticate as**

```bash
az ad sp create-for-rbac \
  --name "exam-platform-github-actions" \
  --role Contributor \
  --scopes /subscriptions/fdb37ff9-cbb2-4a58-997a-acec3bcc5458/resourceGroups/exam-platform-prod \
  --sdk-auth
```

Copy the full JSON output.

- [ ] **Step 2: Store it as a GitHub Actions secret**

```bash
gh secret set AZURE_CREDENTIALS --repo hari9495/exam-platform --body '<the JSON from Step 1>'
```

Also set the database URL as a secret (needed for the migration step, separate from the ACA-stored one since GitHub Actions can't read ACA secrets directly):

```bash
gh secret set DATABASE_URL --repo hari9495/exam-platform --body '<same value used in Task 4>'
```

- [ ] **Step 3: Add the deploy job to `.github/workflows/ci.yml`**

Append a new job after the existing `test` job (leave every existing step in `test` untouched):

```yaml
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push api
        uses: docker/build-push-action@v6
        with:
          context: .
          target: api
          push: true
          tags: ghcr.io/hari9495/exam-platform-api:${{ github.sha }}

      - name: Build and push exam-runtime
        uses: docker/build-push-action@v6
        with:
          context: .
          target: exam-runtime
          push: true
          tags: ghcr.io/hari9495/exam-platform-exam-runtime:${{ github.sha }}

      - name: Build and push web
        uses: docker/build-push-action@v6
        with:
          context: .
          target: web
          push: true
          tags: ghcr.io/hari9495/exam-platform-web:${{ github.sha }}

      - name: Check migration status before deploying
        run: npx prisma migrate status --schema=apps/api/prisma/schema.prisma
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Apply pending migrations
        run: npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Azure login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Deploy api
        run: az containerapp update --name exam-platform-api --resource-group exam-platform-prod --image ghcr.io/hari9495/exam-platform-api:${{ github.sha }}

      - name: Deploy exam-runtime
        run: az containerapp update --name exam-platform-exam-runtime --resource-group exam-platform-prod --image ghcr.io/hari9495/exam-platform-exam-runtime:${{ github.sha }}

      - name: Deploy web
        run: az containerapp update --name exam-platform-web --resource-group exam-platform-prod --image ghcr.io/hari9495/exam-platform-web:${{ github.sha }}
```

The `migrate status` step before `migrate deploy` is a deliberate safety check: this project has a documented history of using `prisma db push` as a local-dev fallback (shadow-database permission constraints on this machine), which doesn't record migration history the same way `migrate deploy` expects. `migrate status` surfaces any drift between the live database's actual schema and what the migration files describe as a readable report (not a silent failure) before `migrate deploy` attempts to apply anything — if it reports drift, stop and resolve it manually (e.g. `prisma migrate resolve --applied <name>` for migrations already reflected in the live schema) rather than letting `migrate deploy` run against an inconsistent history.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build, push, migrate, and deploy stage"
git push
```

- [ ] **Step 5: Verify the full pipeline actually runs end-to-end**

This push itself triggers the new `deploy` job (since it's a push to `main` that will pass `test`).

```bash
gh run watch --repo hari9495/exam-platform --exit-status
```

Expected: `success`. Then confirm a new revision actually landed:

```bash
az containerapp revision list --name exam-platform-api --resource-group exam-platform-prod \
  --query "[].{name:name, active:properties.active, image:properties.template.containers[0].image}"
```

Expected: the active revision's image tag matches the SHA of the commit just pushed.

---

### Task 7: Post-deploy smoke test script and final verification

**Files:**
- Create: `scripts/smoke-test.sh`

**Interfaces:**
- Produces: a repeatable, documented post-deploy check — not a one-time manual pass.

- [ ] **Step 1: Write `scripts/smoke-test.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
RG=exam-platform-prod

API_FQDN=$(az containerapp show --name exam-platform-api --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
EXAM_RUNTIME_FQDN=$(az containerapp show --name exam-platform-exam-runtime --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
WEB_FQDN=$(az containerapp show --name exam-platform-web --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)

echo "== Public health checks =="
curl -sf -o /dev/null -w "api: %{http_code}\n" "https://$API_FQDN/api/v1/auth/saml/smoke-test-org/status" || echo "api: FAILED"
curl -sf -o /dev/null -w "exam-runtime: %{http_code}\n" "https://$EXAM_RUNTIME_FQDN/api/v1" || echo "exam-runtime: FAILED"
curl -sf -o /dev/null -w "web: %{http_code}\n" "https://$WEB_FQDN" || echo "web: FAILED"

echo "== Internal port isolation =="
if curl -sf --max-time 5 "https://$API_FQDN:3505/api/v1" >/dev/null 2>&1; then
  echo "FAIL: api's internal port 3505 is publicly reachable"
  exit 1
else
  echo "OK: api's internal port is not publicly reachable"
fi

echo "Smoke test complete."
```

- [ ] **Step 2: Run it for real against the live deployment**

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

Expected: all checks pass. Fix any failure by tracing it back to the relevant task above (a `FAILED` health check likely means Task 4's env wiring needs a correction; a reachable internal port means Task 4 Step 6's `additionalPortMappings` verification needs re-checking).

- [ ] **Step 3: Run the full existing test suites one more time to confirm nothing in this phase's work broke application code**

```bash
npm run test:shared
npm run test:api
npm run test:exam-runtime
cd apps/web && npm test && cd ../..
```

Expected: all pass, matching pre-existing baseline counts (this phase touched no application logic, only build/deploy plumbing — any regression here points at something Task 2's Dockerfile or `next.config.js` change broke).

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test.sh
git commit -m "chore: post-deploy smoke test script"
git push
```

- [ ] **Step 5: Document rollback in `infra/README.md`**

Append to the file created in Task 3:

```markdown

## Rollback

Every deployed image is tagged with its exact source commit SHA (see
`.github/workflows/ci.yml`'s `deploy` job). To roll a service back to a
previous commit:

    az containerapp update --name <exam-platform-api|exam-platform-exam-runtime|exam-platform-web> \
      --resource-group exam-platform-prod \
      --image ghcr.io/hari9495/<same-suffix>:<previous-good-commit-sha>

Find candidate SHAs with:

    az containerapp revision list --name <app-name> --resource-group exam-platform-prod \
      --query "[].{revision:name, image:properties.template.containers[0].image, active:properties.active, created:properties.createdTime}"
```

```bash
git add infra/README.md
git commit -m "docs: rollback procedure"
git push
```

- [ ] **Step 6: Write the final verification summary**

Record in the task report: the live URLs (`api`, `exam-runtime`, `web` FQDNs), confirmation the smoke test and full test suites pass, and the exact list of what's explicitly still missing (matching the spec's Out of Scope section) — Key Vault, custom domain, managed Redis/Blob Storage/SQL tier upgrade, APM/observability, staging environment, load testing — so the next phase has a clean, accurate starting point.
