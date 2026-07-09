# Phase 3b (Exam Runtime Service Isolation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the candidate-facing exam-taking hot path out of `apps/api` into a new, independently-runnable NestJS app, `apps/exam-runtime`, sharing the same SQL Server database — with zero admin-side runtime dependency in the candidate's login → start → autosave → submit → grade → analyze chain.

**Architecture:** `PrismaModule`/`AuditModule` move into a new shared workspace package, `packages/shared`, consumed by both apps. `CandidateAuthModule`, `MonitoringModule`, `ProctoringAnalysisModule`, `GradingModule`, and the candidate-facing half of `attempts/` move as one atomic unit into `apps/exam-runtime` (they are mutually interdependent and cannot move incrementally). The admin-facing half of `attempts/` becomes `AttemptsAdminModule`, staying in `apps/api`. Three of `AttemptsAdminService`'s methods (`forceSubmit`, `sendMessage`, `reanalyze`) call directly into logic that's moving — resolved with a small internal-only HTTP surface (`InternalModule`) on `apps/exam-runtime`, authenticated by a shared-secret header, never exposed publicly. Four e2e spec files mix admin and candidate HTTP calls against one `AppModule` today; each is converted to boot both apps' `AppModule`s side by side.

**Tech Stack:** NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest — no new runtime dependencies (the internal HTTP call from `apps/api` to `apps/exam-runtime` uses Node 20's built-in `fetch`, already within this project's `engines` floor).

## Global Constraints

- **No Docker, no cloud deployment, no Terraform in this phase.** `apps/exam-runtime` is a second workspace app started the same way `apps/api` is (`npm run start:dev --workspace=...`), on a second local port. Azure SQL exists but is not wired to this project — both apps keep pointing at the current local SQL Server.
- **No data model changes.** No new tables, no new columns, no RLS policy changes.
- **No frontend changes.** No candidate-facing or live-monitoring UI exists in `apps/web` yet.
- **The five interdependent modules (`CandidateAuthModule`, `MonitoringModule`, `ProctoringAnalysisModule`, `GradingModule`, candidate-side `attempts/`) move together in one task (Task 4).** They reference each other directly (`GradingModule` imports `MonitoringModule` and `ProctoringAnalysisModule`; `CandidateAuthModule` imports `MonitoringModule`; the candidate `AttemptModule` imports all three) — there is no way to move a subset and keep either app compiling.
- **`packages/shared` (`@exam-platform/shared`) is extracted FIRST (Task 1), before any cross-app move**, so every file's Prisma/Audit import is already correct (`@exam-platform/shared`) by the time Task 4 relocates files — Task 4 then only has to fix imports *among* the five moving modules, not Prisma/Audit imports too.
- **The internal HTTP surface (`InternalModule` in `apps/exam-runtime`) is authenticated by a shared-secret header (`INTERNAL_SERVICE_SECRET`), never staff JWT, never candidate JWT, never RBAC.** `apps/api` has already done the real authorization (staff JWT + `exam:manage` permission check) before making the internal call — the internal endpoint only needs to confirm the caller is `apps/api` itself. This surface has no CORS config and is not part of either service's public API contract.
- **`apps/api`'s `AttemptsAdminService` still does its own org-ownership check (via `TenantPrismaService.forTenant`) before calling any internal endpoint** — the internal endpoint trusts that check already happened; it does not re-derive org scoping itself. Do not remove this pre-check when rewriting the service.
- **Prisma/Audit import rewrite is mechanical and total**: every file across `apps/api/src` that imports `PrismaService`/`TenantPrismaService`/`TenantContext` from `../prisma/...` or `AuditService` from `../audit/...` gets that import's source path changed to `@exam-platform/shared`, and nothing else — the imported symbol names are unchanged. Two separate `import { X } from '@exam-platform/shared'` lines in the same file (if a file previously had two separate imports from `../prisma/...` and `../audit/...`) are left as two lines, not consolidated — functionally correct, not worth the extra edit risk.
- Migrations are not touched in this phase (none needed).
- Full spec: `docs/superpowers/specs/2026-07-09-phase-3b-exam-runtime-isolation-design.md`.

---

## File Structure

```
packages/
  shared/                                                  # Create: new workspace
    package.json
    tsconfig.json
    src/
      index.ts                                              # Create: barrel export
      prisma/                                                # Move from apps/api/src/prisma/ (unchanged content)
        prisma.module.ts
        prisma.service.ts
        tenant-prisma.service.ts
        tenant-context.ts
      audit/                                                 # Move from apps/api/src/audit/ (unchanged content)
        audit.module.ts
        audit.service.ts
        audit.service.spec.ts
apps/
  exam-runtime/                                              # Create: new workspace app
    package.json
    tsconfig.json
    jest.config.js
    src/
      main.ts
      app.module.ts
      candidate-auth/                                        # Move from apps/api/src/candidate-auth/ (Task 4)
      monitoring/                                             # Move from apps/api/src/monitoring/ (Task 4)
      proctoring-analysis/                                     # Move from apps/api/src/proctoring-analysis/ (Task 4)
      grading/                                                 # Move from apps/api/src/grading/ (Task 4)
      attempts/                                                # Move candidate-half from apps/api/src/attempts/ (Task 4)
      internal/                                                # Create: internal HTTP surface (Task 4)
        internal-auth.guard.ts
        internal-auth.guard.spec.ts
        internal.controller.ts
        internal.controller.spec.ts
        internal.module.ts
        dto/
          notify-message-sent.dto.ts
    test/
      jest-e2e.json
  api/
    package.json                                             # Modify: add @exam-platform/shared dep,
                                                               #         @exam-platform/exam-runtime devDep,
                                                               #         remove websockets/socket.io/anthropic deps
    src/
      app.module.ts                                          # Modify: remove moved module imports, add AttemptsAdminModule
      attempts/                                               # Modify: candidate half removed (Task 4);
                                                               #         attempts.controller.ts/attempts-admin.service.ts
                                                               #         removed (Task 3, moved to attempts-admin/)
      attempts-admin/                                          # Create (Task 3): admin-facing attempt review + actions
        attempts-admin.controller.ts
        attempts-admin.service.ts
        attempts-admin.service.spec.ts
        attempts-admin.module.ts
        exam-runtime-internal.client.ts                        # Create (Task 4): HTTP client to the internal surface
        exam-runtime-internal.client.spec.ts
        dto/
          send-candidate-message.dto.ts                        # Move from attempts/dto/
    test/
      dual-app.ts                                              # Create (Task 6): shared dual-app-boot e2e helper
      exam-taking-runtime.e2e-spec.ts                          # Modify (Task 6): dual-app boot
      ai-proctoring.e2e-spec.ts                                # Modify (Task 7): dual-app boot
      session-enforcement-anti-cheat.e2e-spec.ts               # Modify (Task 8): dual-app boot
      live-monitoring.e2e-spec.ts                              # Modify (Task 9): dual-app boot
package.json                                                 # Modify: workspaces += packages/*, add dev:exam-runtime etc.
.env.example                                                  # Modify: add exam-runtime + internal-surface vars
```

---

### Task 1: Extract `packages/shared` (Prisma + Audit)

**Files:**
- Modify: `package.json` (repo root)
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Move: `apps/api/src/prisma/*` → `packages/shared/src/prisma/*` (4 files: `prisma.module.ts`, `prisma.service.ts`, `tenant-prisma.service.ts`, `tenant-context.ts`)
- Move: `apps/api/src/audit/*` → `packages/shared/src/audit/*` (3 files: `audit.module.ts`, `audit.service.ts`, `audit.service.spec.ts`)
- Modify: every file under `apps/api/src/**` whose import path is `../prisma/prisma.service`, `../prisma/tenant-prisma.service`, `../prisma/tenant-context`, or `../audit/audit.service` (36 import lines across ~30 files — enumerated in Step 5)
- Modify: `apps/api/src/app.module.ts`, `apps/api/package.json`

**Interfaces:**
- Produces: `@exam-platform/shared` exporting `PrismaModule`, `PrismaService`, `TenantPrismaService`, `TenantContext`, `AuditModule`, `AuditService` — every later task in this plan (2, 3, 4, 6-9) imports from this package instead of relative `../prisma/...`/`../audit/...` paths.

- [ ] **Step 1: Add the new workspace to the root `package.json`**

`package.json` (repo root) — modify the `workspaces` array and add two scripts:
```json
{
  "name": "exam-platform",
  "private": true,
  "engines": {
    "node": ">=20 <21"
  },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "npm run start:dev --workspace=apps/api",
    "dev:web": "npm run dev --workspace=apps/web",
    "test:api": "npm run test --workspace=apps/api",
    "test:api:e2e": "npm run test:e2e --workspace=apps/api"
  }
}
```
(Only `"workspaces"` changes in this step — `dev:exam-runtime`/`test:exam-runtime` scripts are added in Task 2, once that workspace exists.)

- [ ] **Step 2: Scaffold `packages/shared`**

`packages/shared/package.json`:
```json
{
  "name": "@exam-platform/shared",
  "version": "0.0.1",
  "main": "src/index.ts",
  "scripts": {
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@prisma/client": "^5.10.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3"
  }
}
```
(`main` points straight at the TypeScript source, not a compiled `dist` — this package is never built/published independently, only consumed in-repo by the two apps' own `ts-jest`/`nest build` compilation, the same way `apps/api`'s own `src/` is never pre-compiled before its tests run.)

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "baseUrl": "./",
    "outDir": "./dist"
  }
}
```
(Identical shape to `apps/api/tsconfig.json` — same decorator settings, since `PrismaService`/`AuditService` use `@Injectable()`.)

`packages/shared/src/index.ts`:
```typescript
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';
export * from './prisma/tenant-prisma.service';
export * from './prisma/tenant-context';
export * from './audit/audit.module';
export * from './audit/audit.service';
```

- [ ] **Step 3: Move the Prisma files**

```bash
mkdir -p packages/shared/src/prisma
git mv apps/api/src/prisma/prisma.module.ts packages/shared/src/prisma/prisma.module.ts
git mv apps/api/src/prisma/prisma.service.ts packages/shared/src/prisma/prisma.service.ts
git mv apps/api/src/prisma/tenant-prisma.service.ts packages/shared/src/prisma/tenant-prisma.service.ts
git mv apps/api/src/prisma/tenant-context.ts packages/shared/src/prisma/tenant-context.ts
```
Expected: no content changes in any of these 4 files — `prisma.module.ts`/`prisma.service.ts`/`tenant-context.ts` have zero relative imports to fix; `tenant-prisma.service.ts` imports `./prisma.service` and `./tenant-context` (both same-directory, still correct after the move).

- [ ] **Step 4: Move the Audit files**

```bash
mkdir -p packages/shared/src/audit
git mv apps/api/src/audit/audit.module.ts packages/shared/src/audit/audit.module.ts
git mv apps/api/src/audit/audit.service.ts packages/shared/src/audit/audit.service.ts
git mv apps/api/src/audit/audit.service.spec.ts packages/shared/src/audit/audit.service.spec.ts
```
`audit.service.ts` and `audit.service.spec.ts` both import `TenantPrismaService`/`TenantContext` via `'../prisma/tenant-prisma.service'`/`'../prisma/tenant-context'` — still correct after the move, since `packages/shared/src/audit/` and `packages/shared/src/prisma/` preserve the same sibling relationship they had in `apps/api/src/`.

- [ ] **Step 5: Rewrite every remaining `../prisma/...`/`../audit/...` import in `apps/api/src` to `@exam-platform/shared`**

Run this from the repo root (Git Bash) — it rewrites exactly the 4 import-path strings below, wherever they appear, across every file in `apps/api/src`:
```bash
grep -rl "from '\.\./prisma/prisma\.service'" apps/api/src | xargs sed -i "s#from '\.\./prisma/prisma\.service'#from '@exam-platform/shared'#g"
grep -rl "from '\.\./prisma/tenant-prisma\.service'" apps/api/src | xargs sed -i "s#from '\.\./prisma/tenant-prisma\.service'#from '@exam-platform/shared'#g"
grep -rl "from '\.\./prisma/tenant-context'" apps/api/src | xargs sed -i "s#from '\.\./prisma/tenant-context'#from '@exam-platform/shared'#g"
grep -rl "from '\.\./audit/audit\.service'" apps/api/src | xargs sed -i "s#from '\.\./audit/audit\.service'#from '@exam-platform/shared'#g"
```
Expected: this touches every file listed below (confirmed via `grep -rn` against the current tree before this task started) — verify the count matches after running:
```bash
grep -rl "from '@exam-platform/shared'" apps/api/src | wc -l
```
Expected: `30` (the 30 distinct files below; several have more than one of the 4 patterns, which is why there are 36 import-line changes across 30 files):
```
apps/api/src/audit/audit.service.spec.ts        (already moved in Step 4 — this file no longer exists at this path; skip)
apps/api/src/users/users.service.ts
apps/api/src/users/users.service.spec.ts
apps/api/src/users/users.controller.ts
apps/api/src/questions/questions.service.ts
apps/api/src/questions/questions.service.spec.ts
apps/api/src/questions/questions.controller.ts
apps/api/src/invitations/invitations.service.ts
apps/api/src/invitations/invitations.service.spec.ts
apps/api/src/invitations/invitations.controller.ts
apps/api/src/attempts/attempt.service.ts
apps/api/src/attempts/attempt.service.spec.ts
apps/api/src/attempts/last-seen.interceptor.ts
apps/api/src/attempts/last-seen.interceptor.spec.ts
apps/api/src/attempts/attempts-admin.service.ts
apps/api/src/attempts/attempts-admin.service.spec.ts
apps/api/src/attempts/attempts.controller.ts
apps/api/src/exams/exams.service.ts
apps/api/src/exams/exams.service.spec.ts
apps/api/src/exams/exams.controller.ts
apps/api/src/rbac/permissions.guard.ts
apps/api/src/candidates/candidates.service.ts
apps/api/src/candidates/candidates.service.spec.ts
apps/api/src/candidates/candidates.controller.ts
apps/api/src/proctoring-analysis/attempt-analysis.service.ts
apps/api/src/proctoring-analysis/attempt-analysis.service.spec.ts
apps/api/src/auth/auth.service.spec.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/current-tenant.decorator.ts
apps/api/src/candidate-auth/candidate-jwt.strategy.spec.ts
apps/api/src/candidate-auth/candidate-auth.service.ts
apps/api/src/candidate-auth/candidate-jwt.strategy.ts
apps/api/src/candidate-auth/candidate-auth.service.spec.ts
apps/api/src/organizations/organizations.controller.ts
apps/api/src/organizations/organizations.service.spec.ts
apps/api/src/organizations/organizations.service.ts
apps/api/src/monitoring/monitoring.service.ts
apps/api/src/monitoring/monitoring.gateway.spec.ts
apps/api/src/monitoring/monitoring.gateway.ts
apps/api/src/monitoring/monitoring.service.spec.ts
```
(The files under `attempts/`, `proctoring-analysis/`, `candidate-auth/`, `monitoring/` are still physically inside `apps/api/src` at this point in the plan — they don't move to `apps/exam-runtime` until Task 4. Fixing their Prisma/Audit imports now, while they're still in `apps/api`, means Task 4's move doesn't have to touch these particular import lines again.)

- [ ] **Step 6: Update `apps/api/src/app.module.ts`**

Replace the `PrismaModule` and `AuditModule` imports:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StaticUploadsModule,
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    CandidateAuthModule,
    AttemptModule,
  ],
})
export class AppModule {}
```
(Every other import/module is unchanged — `CandidateAuthModule` and `AttemptModule` still live in `apps/api` at this point; they move in Task 4.)

- [ ] **Step 7: Add the workspace dependency to `apps/api/package.json`**

Add to `dependencies` (alphabetical position, next to `@nestjs/common`):
```json
    "@exam-platform/shared": "0.0.1",
```

- [ ] **Step 8: Install and verify**

Run (from repo root): `npm install`
Expected: installs cleanly; `node_modules/@exam-platform/shared` is a symlink into `packages/shared` (npm workspace linking).

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions — every Prisma/Audit-consuming file now resolves the same classes via `@exam-platform/shared` instead of relative paths.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 9: Commit**

```bash
git add package.json packages/shared apps/api/package.json apps/api/package-lock.json apps/api/src/app.module.ts
git add -u apps/api/src
git commit -m "refactor: extract Prisma and Audit into packages/shared workspace"
```
(`git add -u apps/api/src` stages the modified-in-place import edits across the ~30 files in Step 5, plus the deletions from the Step 3/4 moves; `git add packages/shared` stages the new/moved files there as additions — Git's rename detection will show most of these as renames, not add+delete pairs, since content is unchanged.)

---

### Task 2: Scaffold `apps/exam-runtime`

**Files:**
- Create: `apps/exam-runtime/package.json`, `tsconfig.json`, `jest.config.js`, `test/jest-e2e.json`
- Create: `apps/exam-runtime/src/main.ts`, `apps/exam-runtime/src/app.module.ts`
- Modify: `package.json` (repo root), `.env.example` (repo root)

**Interfaces:**
- Produces: a bootable, independently-testable `apps/exam-runtime` app with no real feature modules yet (just `ConfigModule` + `@exam-platform/shared`'s `PrismaModule`) — Task 4 adds the five moved modules and `InternalModule` on top of this shell.

- [ ] **Step 1: `apps/exam-runtime/package.json`**

```json
{
  "name": "@exam-platform/exam-runtime",
  "version": "0.0.1",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",
    "@exam-platform/shared": "0.0.1",
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/platform-socket.io": "^10.3.0",
    "@nestjs/websockets": "^10.3.0",
    "@prisma/client": "^5.10.0",
    "argon2": "^0.31.2",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.11.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "socket.io-client": "^4.7.5",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```
(This dependency list is exactly what `CandidateAuthModule`, `MonitoringModule`, `ProctoringAnalysisModule`, `GradingModule`, and candidate-side `attempts/` need — cross-checked against Task 4's move. No `multer`, `cookie-parser`, `@nestjs/serve-static`, `csv-parse`, `nodemailer`, or `uuid` — none of the moving code uses them. No explicit HTTP-client dependency for `InternalModule`'s *outbound* calls because `InternalModule` is the receiving side in this app; `apps/api` is the caller, and it uses Node 20's built-in `fetch` in Task 4, needing no new dependency there either.)

- [ ] **Step 2: `apps/exam-runtime/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "baseUrl": "./",
    "outDir": "./dist"
  }
}
```
(Identical to `apps/api/tsconfig.json`.)

- [ ] **Step 3: `apps/exam-runtime/jest.config.js` and `test/jest-e2e.json`**

`apps/exam-runtime/jest.config.js`:
```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```
(Identical to `apps/api/jest.config.js`.)

`apps/exam-runtime/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```
(Identical to `apps/api/test/jest-e2e.json`.)

- [ ] **Step 4: `apps/exam-runtime/src/main.ts` and `app.module.ts`**

`apps/exam-runtime/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.EXAM_RUNTIME_PORT ?? 3002);
}
bootstrap();
```
(No `cookie-parser` — nothing moving to this app reads/writes cookies; `apps/api`'s `main.ts` uses it for staff auth, which stays in `apps/api`.)

`apps/exam-runtime/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
  ],
})
export class AppModule {}
```
(Task 4 adds `CandidateAuthModule`, `AttemptModule`, `MonitoringModule`, `ProctoringAnalysisModule`, `GradingModule`, `InternalModule` to this `imports` array.)

- [ ] **Step 5: Add root scripts and env vars**

`package.json` (repo root) — add two scripts after the existing `dev:api`/`test:api` ones:
```json
    "dev:exam-runtime": "npm run start:dev --workspace=apps/exam-runtime",
    "test:exam-runtime": "npm run test --workspace=apps/exam-runtime",
    "test:exam-runtime:e2e": "npm run test:e2e --workspace=apps/exam-runtime",
```

`.env.example` (repo root) — add:
```
EXAM_RUNTIME_PORT=3002
```
(`EXAM_RUNTIME_INTERNAL_URL` and `INTERNAL_SERVICE_SECRET` are added in Task 4, once the internal surface they configure actually exists.)

Create `apps/exam-runtime/.env` (gitignored, same as `apps/api/.env` — `.gitignore`'s bare `.env` pattern already matches this new path) with the same `DATABASE_URL` as `apps/api/.env`, plus:
```
EXAM_RUNTIME_PORT=3002
CANDIDATE_JWT_ACCESS_SECRET="dev-candidate-access-secret-change-me"
CANDIDATE_JWT_REFRESH_SECRET="dev-candidate-refresh-secret-change-me"
CANDIDATE_ACCESS_TOKEN_TTL_SECONDS=14400
CANDIDATE_REFRESH_TOKEN_TTL_DAYS=1
JWT_ACCESS_SECRET="dev-access-secret-change-me"
ANTHROPIC_API_KEY="sk-ant-dev-key-change-me"
WEB_ORIGIN=http://localhost:3000
```
(`JWT_ACCESS_SECRET` — the *staff* secret — is needed here too: `MonitoringGateway`'s `handleConnection` verifies a staff JWT for the live-monitoring dashboard's socket connection, and that gateway is moving to this app in Task 4. Must be the same value as `apps/api/.env`'s `JWT_ACCESS_SECRET`, or a staff token issued by `apps/api` won't verify against `apps/exam-runtime`'s socket gateway.)

- [ ] **Step 6: Install and verify the shell boots**

Run (from repo root): `npm install`
Expected: installs cleanly.

Run: `npm run test:exam-runtime` (from repo root)
Expected: `No tests found` (expected — no `.spec.ts` files exist yet) but the Jest process itself exits cleanly, confirming the config is valid.

Run: `npm run dev:exam-runtime` (from repo root), wait for `Nest application successfully started`, then in a separate terminal:
```bash
curl http://localhost:3002/api/v1/
```
Expected: a 404 JSON response (no routes registered yet) — confirms the process is up and listening on the configured port, not a connection-refused error. Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add package.json .env.example apps/exam-runtime
git commit -m "feat: scaffold apps/exam-runtime as an independently-runnable NestJS app"
```

---

### Task 3: Split `attempts/` into candidate half and `attempts-admin/` (same-app, safe checkpoint)

This task stays entirely within `apps/api` — nothing crosses to `apps/exam-runtime` yet. Its only purpose is to separate the admin-facing controller/service from the candidate-facing one *before* Task 4 moves the candidate half out, so Task 4 doesn't also have to do this split under cross-app pressure. `AttemptsAdminService` still directly injects `MonitoringGateway`/`AttemptSettlementService`/`AttemptAnalysisService` after this task — that only changes in Task 4.

**Files:**
- Move: `apps/api/src/attempts/attempts.controller.ts` → `apps/api/src/attempts-admin/attempts-admin.controller.ts`
- Move: `apps/api/src/attempts/attempts-admin.service.ts` → `apps/api/src/attempts-admin/attempts-admin.service.ts`
- Move: `apps/api/src/attempts/attempts-admin.service.spec.ts` → `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`
- Move: `apps/api/src/attempts/dto/send-candidate-message.dto.ts` → `apps/api/src/attempts-admin/dto/send-candidate-message.dto.ts`
- Create: `apps/api/src/attempts-admin/attempts-admin.module.ts`
- Modify: `apps/api/src/attempts/attempt.module.ts`, `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `AttemptsAdminModule` (new), registered in `AppModule`. `AttemptsAdminController` (renamed from `AttemptsController`) still serves the same 5 routes at the same `/attempts` path prefix — no HTTP contract change.

- [ ] **Step 1: Move the 4 files**

```bash
mkdir -p apps/api/src/attempts-admin/dto
git mv apps/api/src/attempts/attempts.controller.ts apps/api/src/attempts-admin/attempts-admin.controller.ts
git mv apps/api/src/attempts/attempts-admin.service.ts apps/api/src/attempts-admin/attempts-admin.service.ts
git mv apps/api/src/attempts/attempts-admin.service.spec.ts apps/api/src/attempts-admin/attempts-admin.service.spec.ts
git mv apps/api/src/attempts/dto/send-candidate-message.dto.ts apps/api/src/attempts-admin/dto/send-candidate-message.dto.ts
```
Expected: `attempts-admin.service.ts`'s imports (`../grading/attempt-settlement.service`, `../monitoring/monitoring.gateway`, `../proctoring-analysis/attempt-analysis.service`, and the already-`@exam-platform/shared` Prisma/Audit imports from Task 1) are all still correct after this move — `apps/api/src/attempts-admin/` is a sibling of `grading/`, `monitoring/`, `proctoring-analysis/` at the same depth `apps/api/src/attempts/` was.

- [ ] **Step 2: Rename the controller class**

In `apps/api/src/attempts-admin/attempts-admin.controller.ts`, rename the class (route path and every method/decorator stays identical — read the file first to confirm current content matches what Task-1's Step 5 sed left in place, i.e. `TenantContext` now imported from `@exam-platform/shared`):
```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AttemptsAdminService } from './attempts-admin.service';
import { SendCandidateMessageDto } from './dto/send-candidate-message.dto';

@Controller('attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttemptsAdminController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequirePermissions('exam:manage')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  @Post(':id/force-submit')
  @RequirePermissions('exam:manage')
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId);
  }

  @Post(':id/message')
  @RequirePermissions('exam:manage')
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendCandidateMessageDto,
  ) {
    return this.attemptsAdminService.sendMessage(tenant, id, userId, dto.body);
  }

  @Get(':id/messages')
  @RequirePermissions('exam:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listMessages(tenant, id);
  }

  @Post(':id/reanalyze')
  @RequirePermissions('exam:manage')
  reanalyze(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.reanalyze(tenant, id);
  }
}
```
(Only the class name changed, `AttemptsController` → `AttemptsAdminController` — every route, guard, and method body is byte-identical to the pre-move file.)

- [ ] **Step 3: Create `AttemptsAdminModule`**

`apps/api/src/attempts-admin/attempts-admin.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptsAdminController } from './attempts-admin.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [AttemptsAdminController],
  providers: [AttemptsAdminService],
})
export class AttemptsAdminModule {}
```
(Mirrors `AttemptsAdminService`'s actual constructor dependencies: `AttemptSettlementService` from `GradingModule`, `MonitoringGateway` from `MonitoringModule`, `AttemptAnalysisService` from `ProctoringAnalysisModule` — `TenantPrismaService`/`AuditService` come from the `@Global()` `packages/shared` modules already registered in `AppModule`, so they don't need to be listed here.)

- [ ] **Step 4: Slim down `AttemptModule` to the candidate half only**

Read `apps/api/src/attempts/attempt.module.ts` first to confirm its current exact content, then replace the whole file:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule, MonitoringModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
```
(`ProctoringAnalysisModule` is dropped from this module's imports — neither `AttemptController` nor `AttemptService` injects `AttemptAnalysisService` directly; only `AttemptsAdminService` did, and that's moved out now. `AttemptsController`/`AttemptsAdminService` are dropped from `controllers`/`providers` — they live in `AttemptsAdminModule` now.)

- [ ] **Step 5: Register `AttemptsAdminModule` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import and registration:
```typescript
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';
```
```typescript
    CandidateAuthModule,
    AttemptModule,
    AttemptsAdminModule,
```
(Appended after the existing `AttemptModule` entry in the `imports` array — every other line in the file is unchanged from Task 1's Step 6.)

- [ ] **Step 6: Run the tests to verify everything still passes**

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions — `attempts-admin.service.spec.ts`'s tests are unaffected by the file move (same content, same relative imports).

Run: `npm run test:api:e2e` (from repo root)
Expected: all e2e suites passing — `/attempts/:id/*` routes still resolve identically, since the route path (`@Controller('attempts')`) didn't change.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/attempts-admin apps/api/src/attempts/attempt.module.ts apps/api/src/app.module.ts
git commit -m "refactor: split admin-facing attempt review into its own AttemptsAdminModule"
```

---

### Task 4: Move the candidate hot path to `apps/exam-runtime`, add the internal HTTP surface

This is the one big atomic task — `CandidateAuthModule`, `MonitoringModule`, `ProctoringAnalysisModule`, `GradingModule`, and the candidate half of `attempts/` move together, `apps/exam-runtime` becomes the real candidate-facing app, and `apps/api`'s `AttemptsAdminService` is rewritten to reach the moved logic via a new internal HTTP surface. Neither app compiles cleanly between these steps — that's expected and unavoidable given the dependency graph (see Global Constraints); the deliverable is only complete, and only tested, at the end of this task.

**Correction discovered during execution:** `ExamsService.getResults` (staff-side, staying in `apps/api`) also calls `AttemptSettlementService.settleIfExpired` directly — a 4th cross-reference into the moving modules that this plan's original file inventory missed (it only checked `AttemptsAdminService`, never `exams/`). Resolved with a 4th internal endpoint, `POST /internal/attempts/:id/settle-if-expired`, added to `InternalController`, following the exact same pattern as `force-submit`/`reanalyze`. `ExamRuntimeInternalClient` moved out of `attempts-admin/` into its own `apps/api/src/exam-runtime-client/` module (with an `ExamRuntimeClientModule` wrapper) so both `AttemptsAdminModule` and `ExamsModule` can consume it. See the design spec's Section 4 for full detail — updating the steps below only where the file lists changed as a result.

**Files:**
- Move: `apps/api/src/candidate-auth/` → `apps/exam-runtime/src/candidate-auth/` (whole folder)
- Move: `apps/api/src/monitoring/` → `apps/exam-runtime/src/monitoring/` (whole folder)
- Move: `apps/api/src/proctoring-analysis/` → `apps/exam-runtime/src/proctoring-analysis/` (whole folder)
- Move: `apps/api/src/grading/` → `apps/exam-runtime/src/grading/` (whole folder)
- Move: `apps/api/src/attempts/` → `apps/exam-runtime/src/attempts/` (whole folder — after Task 3, contains only the candidate half)
- Create: `apps/exam-runtime/src/candidate-auth/dto/refresh.dto.ts`
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`
- Create: `apps/exam-runtime/src/internal/internal-auth.guard.ts` (+ spec), `internal.controller.ts` (+ spec), `internal.module.ts`, `dto/notify-message-sent.dto.ts`
- Modify: `apps/exam-runtime/src/app.module.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/attempts-admin/exam-runtime-internal.client.ts` (+ spec)
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts`, `attempts-admin.service.spec.ts`, `attempts-admin.module.ts`
- Modify: `apps/api/package.json`, `apps/exam-runtime/package.json` (no change — deps already scoped correctly in Task 2), `.env.example`, `apps/api/.env`, `apps/exam-runtime/.env`

**Interfaces:**
- Produces: `apps/exam-runtime` serving `/api/v1/candidate-auth/*`, `/api/v1/attempt/*`, the `/monitoring` WebSocket namespace, and `/api/v1/internal/*` (internal-only). `AttemptsAdminService.forceSubmit`/`sendMessage`/`reanalyze` now call `ExamRuntimeInternalClient` instead of injecting `MonitoringGateway`/`AttemptSettlementService`/`AttemptAnalysisService` directly.

- [ ] **Step 1: Move the 5 folders**

```bash
git mv apps/api/src/candidate-auth apps/exam-runtime/src/candidate-auth
git mv apps/api/src/monitoring apps/exam-runtime/src/monitoring
git mv apps/api/src/proctoring-analysis apps/exam-runtime/src/proctoring-analysis
git mv apps/api/src/grading apps/exam-runtime/src/grading
git mv apps/api/src/attempts apps/exam-runtime/src/attempts
```
Expected: every cross-reference among these 5 folders (`../monitoring/...`, `../grading/...`, `../proctoring-analysis/...`, `../candidate-auth/...`, and the already-`@exam-platform/shared` Prisma/Audit imports) is still correct — they preserve the same sibling relationship under `apps/exam-runtime/src/` that they had under `apps/api/src/`.

- [ ] **Step 2: Fix the one broken import — `RefreshDto`**

`apps/exam-runtime/src/candidate-auth/dto/refresh.dto.ts` (new file, a same-shape copy of `apps/api/src/auth/dto/refresh.dto.ts` — not shared, since it's a trivial 5-line DTO and the two controllers' refresh flows are conceptually distinct even though identically shaped):
```typescript
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
```

In `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`, change the import:
```typescript
import { RefreshDto } from './dto/refresh.dto';
```
(Was `from '../auth/dto/refresh.dto'` — that path no longer exists from this file's new location; `apps/api/src/auth/dto/refresh.dto.ts` is untouched and still serves the staff-side controller in `apps/api`.)

- [ ] **Step 3: Wire `apps/exam-runtime/src/app.module.ts`**

Replace the whole file:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    InternalModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Remove the moved modules from `apps/api/src/app.module.ts`**

Replace the whole file:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StaticUploadsModule,
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    AttemptsAdminModule,
  ],
})
export class AppModule {}
```
(`CandidateAuthModule` and `AttemptModule` are gone — they live in `apps/exam-runtime` now.)

- [ ] **Step 5: Create the internal auth guard**

`apps/exam-runtime/src/internal/internal-auth.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    if (!process.env.INTERNAL_SERVICE_SECRET || providedSecret !== process.env.INTERNAL_SERVICE_SECRET) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return true;
  }
}
```

`apps/exam-runtime/src/internal/internal-auth.guard.spec.ts`:
```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeEach(() => {
    guard = new InternalAuthGuard();
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
  });

  function makeContext(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a request with the correct secret header', () => {
    expect(guard.canActivate(makeContext({ 'x-internal-secret': 'test-internal-secret' }))).toBe(true);
  });

  it('rejects a request with a missing secret header', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong secret', () => {
    expect(() => guard.canActivate(makeContext({ 'x-internal-secret': 'wrong' }))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 6: Run the guard test to verify it passes**

Run: `npm run test:exam-runtime -- internal-auth.guard` (from repo root)
Expected: `3 passed`.

- [ ] **Step 7: Create the internal DTO and controller**

`apps/exam-runtime/src/internal/dto/notify-message-sent.dto.ts`:
```typescript
import { IsDateString, IsString } from 'class-validator';

export class NotifyMessageSentDto {
  @IsString()
  examId!: string;

  @IsString()
  attemptId!: string;

  @IsString()
  candidateId!: string;

  @IsDateString()
  sentAt!: string;
}
```

`apps/exam-runtime/src/internal/internal.controller.ts`:
```typescript
import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { InternalAuthGuard } from './internal-auth.guard';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  @Post('attempts/:id/force-submit')
  async forceSubmit(@Param('id') id: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: { invitation: { include: { exam: true } } },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${id} not found`);
    }
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException(`Attempt ${id} cannot be force-submitted from status "${attempt.status}"`);
    }
    const exam = attempt.invitation.exam;
    const finalized = await this.prisma.$transaction((tx) => this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted'));
    return { status: finalized.status };
  }

  @Post('attempts/:id/reanalyze')
  @HttpCode(204)
  async reanalyze(@Param('id') id: string): Promise<void> {
    await this.attemptAnalysis.analyze(id);
  }

  @Post('monitoring/message-sent')
  @HttpCode(204)
  async notifyMessageSent(@Body() dto: NotifyMessageSentDto): Promise<void> {
    this.monitoringGateway.emitMessageSent(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      sentAt: new Date(dto.sentAt),
    });
  }
}
```
(`forceSubmit`'s org-ownership check already happened in `apps/api` before this endpoint was ever called — see Step 11 — so this endpoint only re-fetches the attempt to get the full `Attempt`+`Exam` shape `AttemptSettlementService.finalize` needs, and enforces the `in_progress` business rule, which is orthogonal to org ownership. `reanalyze` doesn't re-check existence: `AttemptAnalysisService.analyze` already no-ops with a logged warning for an unknown `attemptId`, so there's nothing to guard against here.)

`apps/exam-runtime/src/internal/internal.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { PrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

describe('InternalController', () => {
  let controller: InternalController;
  let prisma: { attempt: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let monitoringGateway: { emitMessageSent: jest.Mock };

  beforeEach(async () => {
    prisma = { attempt: { findUnique: jest.fn() }, $transaction: jest.fn((fn) => fn('tx')) };
    attemptSettlement = { finalize: jest.fn() };
    attemptAnalysis = { analyze: jest.fn() };
    monitoringGateway = { emitMessageSent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AttemptAnalysisService, useValue: attemptAnalysis },
        { provide: MonitoringGateway, useValue: monitoringGateway },
      ],
    }).compile();
    controller = moduleRef.get(InternalController);
  });

  describe('forceSubmit', () => {
    it('throws NotFoundException when the attempt does not exist', async () => {
      prisma.attempt.findUnique.mockResolvedValue(null);

      await expect(controller.forceSubmit('attempt-1')).rejects.toThrow(NotFoundException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      prisma.attempt.findUnique.mockResolvedValue({ id: 'attempt-1', status: 'submitted', invitation: { exam: {} } });

      await expect(controller.forceSubmit('attempt-1')).rejects.toThrow(BadRequestException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('finalizes an in_progress attempt and returns its new status', async () => {
      const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt = { id: 'attempt-1', status: 'in_progress', invitation: { exam } };
      prisma.attempt.findUnique.mockResolvedValue(attempt);
      attemptSettlement.finalize.mockResolvedValue({ status: 'force_submitted' });

      const result = await controller.forceSubmit('attempt-1');

      expect(attemptSettlement.finalize).toHaveBeenCalledWith('tx', exam, attempt, 'force_submitted');
      expect(result).toEqual({ status: 'force_submitted' });
    });
  });

  describe('reanalyze', () => {
    it('delegates to AttemptAnalysisService.analyze', async () => {
      await controller.reanalyze('attempt-1');

      expect(attemptAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });

  describe('notifyMessageSent', () => {
    it('delegates to MonitoringGateway.emitMessageSent', async () => {
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' };

      await controller.notifyMessageSent(dto);

      expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        sentAt: new Date('2026-07-09T00:00:00.000Z'),
      });
    });
  });
});
```

`apps/exam-runtime/src/internal/internal.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [InternalController],
})
export class InternalModule {}
```

- [ ] **Step 8: Run the new tests to verify they pass**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites pass, including the moved specs (unchanged content) and the 2 new `internal/` spec files.

- [ ] **Step 9: Create `ExamRuntimeInternalClient` in `apps/api`**

`apps/api/src/attempts-admin/exam-runtime-internal.client.ts`:
```typescript
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

interface ForceSubmitResult {
  status: string;
}

interface NotifyMessageSentPayload {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

@Injectable()
export class ExamRuntimeInternalClient {
  async forceSubmit(attemptId: string): Promise<ForceSubmitResult> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/force-submit`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async reanalyze(attemptId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/reanalyze`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async notifyMessageSent(payload: NotifyMessageSentPayload): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/monitoring/message-sent`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
  }

  private baseUrl(): string {
    return process.env.EXAM_RUNTIME_INTERNAL_URL as string;
  }

  private headers(): Record<string, string> {
    return { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string };
  }

  private async throwIfNotOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const body = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 404) {
      throw new NotFoundException(body.message);
    }
    if (response.status === 400) {
      throw new BadRequestException(body.message);
    }
    throw new InternalServerErrorException(body.message ?? 'Exam runtime internal call failed');
  }
}
```

`apps/api/src/attempts-admin/exam-runtime-internal.client.spec.ts`:
```typescript
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

describe('ExamRuntimeInternalClient', () => {
  let client: ExamRuntimeInternalClient;

  beforeEach(() => {
    client = new ExamRuntimeInternalClient();
    process.env.EXAM_RUNTIME_INTERNAL_URL = 'http://localhost:3002';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    global.fetch = jest.fn();
  });

  describe('forceSubmit', () => {
    it('POSTs to the internal force-submit endpoint with the shared secret and returns the parsed body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: 'force_submitted' }) });

      const result = await client.forceSubmit('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/force-submit', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });

    it('translates a 404 response into NotFoundException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Attempt attempt-1 not found' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('translates a 400 response into BadRequestException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'not in_progress' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(BadRequestException);
    });

    it('translates any other non-ok response into InternalServerErrorException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => { throw new Error('no body'); } });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('reanalyze', () => {
    it('POSTs to the internal reanalyze endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.reanalyze('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/reanalyze', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
      });
    });
  });

  describe('notifyMessageSent', () => {
    it('POSTs the payload as JSON to the internal message-sent endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await client.notifyMessageSent({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/monitoring/message-sent', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt }),
      });
    });
  });
});
```

- [ ] **Step 10: Run the client test to verify it passes**

Run: `npm run test:api -- exam-runtime-internal.client` (from repo root)
Expected: `6 passed`.

- [ ] **Step 11: Rewrite `AttemptsAdminService`**

Replace the whole file, `apps/api/src/attempts-admin/attempts-admin.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateMessage, ProctoringAnalysis, ProctoringEvent } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly examRuntime: ExamRuntimeInternalClient,
  ) {}

  async listProctoringEvents(context: TenantContext, attemptId: string): Promise<ProctoringEvent[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });
    });
  }

  async forceSubmit(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.forceSubmit(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.force_submit',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }

  async sendMessage(
    context: TenantContext,
    attemptId: string,
    actorUserId: string,
    body: string,
  ): Promise<{ id: string; sentAt: Date }> {
    const { created, examId, candidateId } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      const created = await tx.candidateMessage.create({
        data: { attemptId: attempt.id, sentByUserId: actorUserId, body },
      });
      return { created, examId: attempt.examId, candidateId: attempt.candidateId };
    });

    await this.examRuntime.notifyMessageSent({ examId, attemptId: created.attemptId, candidateId, sentAt: created.sentAt });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.message_sent',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return { id: created.id, sentAt: created.sentAt };
  }

  async listMessages(context: TenantContext, attemptId: string): Promise<CandidateMessage[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.candidateMessage.findMany({ where: { attemptId }, orderBy: { sentAt: 'asc' } });
    });
  }

  async reanalyze(context: TenantContext, attemptId: string): Promise<ProctoringAnalysis> {
    await this.requireOwnedAttempt(context, attemptId);

    await this.examRuntime.reanalyze(attemptId);

    return this.tenantPrisma.forTenant(context, (tx) => tx.proctoringAnalysis.findUniqueOrThrow({ where: { attemptId } }));
  }

  private async requireOwnedAttempt(context: TenantContext, attemptId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
    });
  }
}
```
(`forceSubmit`/`reanalyze` now only verify org ownership before delegating — the `in_progress` status check for force-submit moved into `InternalController.forceSubmit`, Step 7, since that endpoint already re-fetches the attempt anyway. `sendMessage`'s `CandidateMessage` row write is unchanged — still a direct `apps/api` DB write — only the live-socket notification now goes through `examRuntime.notifyMessageSent`.)

- [ ] **Step 12: Rewrite `attempts-admin.service.spec.ts`**

Replace the whole file, `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let examRuntime: { forceSubmit: jest.Mock; reanalyze: jest.Mock; notifyMessageSent: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    examRuntime = { forceSubmit: jest.fn(), reanalyze: jest.fn(), notifyMessageSent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });

  describe('listProctoringEvents', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listProctoringEvents(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the ordered proctoring events for an owned attempt', async () => {
      const events = [{ id: 'event-1' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' }, orderBy: { occurredAt: 'asc' } });
      expect(result).toBe(events);
    });
  });

  describe('forceSubmit', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.forceSubmit).not.toHaveBeenCalled();
    });

    it('delegates to the internal client and records an audit entry', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.forceSubmit.mockResolvedValue({ status: 'force_submitted' });

      const result = await service.forceSubmit(context, 'attempt-1', 'user-1');

      expect(examRuntime.forceSubmit).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.force_submit', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });
  });

  describe('sendMessage', () => {
    it('throws NotFoundException without writing a message when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.sendMessage(context, 'attempt-1', 'user-1', 'hi')).rejects.toThrow(NotFoundException);
      expect(examRuntime.notifyMessageSent).not.toHaveBeenCalled();
    });

    it('writes the CandidateMessage row, notifies the internal client, and records an audit entry', async () => {
      const sentAt = new Date('2026-07-09T00:00:00.000Z');
      const created = { id: 'msg-1', attemptId: 'attempt-1', sentAt };
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1' }) },
        candidateMessage: { create: jest.fn().mockResolvedValue(created) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.sendMessage(context, 'attempt-1', 'user-1', 'Please stay on the exam tab');

      expect(tx.candidateMessage.create).toHaveBeenCalledWith({ data: { attemptId: 'attempt-1', sentByUserId: 'user-1', body: 'Please stay on the exam tab' } });
      expect(examRuntime.notifyMessageSent).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.message_sent', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ id: 'msg-1', sentAt });
    });
  });

  describe('listMessages', () => {
    it('returns the ordered messages for an owned attempt', async () => {
      const messages = [{ id: 'msg-1' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue(messages) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listMessages(context, 'attempt-1');

      expect(result).toBe(messages);
    });
  });

  describe('reanalyze', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.reanalyze(context, 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.reanalyze).not.toHaveBeenCalled();
    });

    it('triggers reanalysis via the internal client, then reads back the fresh ProctoringAnalysis row', async () => {
      const analysis = { attemptId: 'attempt-1', status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ proctoringAnalysis: { findUniqueOrThrow: jest.fn().mockResolvedValue(analysis) } });
      });

      const result = await service.reanalyze(context, 'attempt-1');

      expect(examRuntime.reanalyze).toHaveBeenCalledWith('attempt-1');
      expect(result).toBe(analysis);
    });
  });
});
```

- [ ] **Step 13: Update `AttemptsAdminModule`**

Replace the whole file, `apps/api/src/attempts-admin/attempts-admin.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AttemptsAdminController } from './attempts-admin.controller';
import { AttemptsAdminService } from './attempts-admin.service';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

@Module({
  controllers: [AttemptsAdminController],
  providers: [AttemptsAdminService, ExamRuntimeInternalClient],
})
export class AttemptsAdminModule {}
```
(`GradingModule`/`MonitoringModule`/`ProctoringAnalysisModule` are no longer imported here — those modules don't exist in `apps/api` anymore.)

- [ ] **Step 14: Add the new env vars**

`.env.example` (repo root) — add:
```
EXAM_RUNTIME_INTERNAL_URL=http://localhost:3002
INTERNAL_SERVICE_SECRET="dev-internal-secret-change-me"
```

`apps/api/.env` — add the same two lines.

`apps/exam-runtime/.env` (created in Task 2) — add:
```
INTERNAL_SERVICE_SECRET="dev-internal-secret-change-me"
```
(Must be the identical value in both `.env` files — it's a shared secret, not two independent ones.)

- [ ] **Step 15: Remove now-unused dependencies from `apps/api/package.json`**

Remove these 3 lines from `dependencies`: `"@anthropic-ai/sdk"`, `"@nestjs/platform-socket.io"`, `"@nestjs/websockets"`, `"socket.io"` (4 lines total). Remove this 1 line from `devDependencies`: `"socket.io-client"`.

Run (from repo root): `npm install`
Expected: installs cleanly, `package-lock.json` updated, `apps/api`'s `node_modules` no longer needs these (they remain available to `apps/exam-runtime`, which now declares them itself).

- [ ] **Step 16: Run the full test suite for both apps**

Run: `npm run test:api` (from repo root)
Expected: all suites pass — including the rewritten `attempts-admin.service.spec.ts` and the new `exam-runtime-internal.client.spec.ts`.

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites pass — every moved `.spec.ts` file (unchanged content) plus the 2 new `internal/` spec files from Step 7.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

Run: `npx nest build` (from `apps/exam-runtime/`)
Expected: clean build.

- [ ] **Step 17: Commit**

```bash
git add apps/exam-runtime apps/api/src/app.module.ts apps/api/src/attempts-admin apps/api/package.json apps/api/package-lock.json .env.example
git commit -m "feat: move candidate exam-taking hot path to apps/exam-runtime; add internal HTTP surface for admin actions"
```
(This commit does not include `apps/api/.env`/`apps/exam-runtime/.env` — both are gitignored, per this project's existing `.env` convention.)

---

### Task 5: Dual-app e2e helper, convert `exam-taking-runtime.e2e-spec.ts`

Four existing e2e spec files each boot a single `AppModule` and mix admin-side HTTP calls (exams/questions/candidates/invitations/results — and, after Task 3, `attempts-admin`) with candidate-side calls (candidate-auth, `attempt/*`) in one test file. After Task 4, no single `AppModule` serves both anymore — each of these 4 files needs to boot `apps/api`'s `AppModule` *and* `apps/exam-runtime`'s `AppModule` side by side, and route each request to whichever app actually serves that path. This task builds the shared helper and converts the first (and simplest) of the 4 files; Tasks 6-8 convert the remaining 3.

**Files:**
- Modify: `apps/api/package.json` (add `@exam-platform/exam-runtime` devDependency)
- Create: `apps/api/test/dual-app.ts`
- Modify: `apps/api/test/exam-taking-runtime.e2e-spec.ts`

**Interfaces:**
- Produces: `bootAdminApp(configure?)`, `bootRuntimeApp(configure?)`, `listenOnRandomPort(app)` — Tasks 6-8 reuse these exact exports unchanged.

- [ ] **Step 1: Add the cross-workspace devDependency**

In `apps/api/package.json`, add to `devDependencies`:
```json
    "@exam-platform/exam-runtime": "0.0.1",
```
This makes the workspace link explicit (rather than relying on implicit npm hoisting) for the relative import the helper in Step 2 makes into `apps/exam-runtime/src/app.module.ts`.

Run (from repo root): `npm install`
Expected: installs cleanly.

- [ ] **Step 2: Write the dual-app helper**

`apps/api/test/dual-app.ts`:
```typescript
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule as AdminAppModule } from '../src/app.module';
import { AppModule as RuntimeAppModule } from '../../exam-runtime/src/app.module';

export type Configure = (builder: TestingModuleBuilder) => TestingModuleBuilder;

async function bootApp(appModuleClass: unknown, configure?: Configure): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [appModuleClass as never] });
  if (configure) {
    builder = configure(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

export function bootAdminApp(configure?: Configure): Promise<INestApplication> {
  return bootApp(AdminAppModule, configure);
}

export function bootRuntimeApp(configure?: Configure): Promise<INestApplication> {
  return bootApp(RuntimeAppModule, configure);
}

export async function listenOnRandomPort(app: INestApplication): Promise<number> {
  await app.listen(0);
  return (app.getHttpServer().address() as { port: number }).port;
}
```
(Both boot functions skip `cookieParser()`/CORS setup that the real `main.ts` files apply — neither is needed for supertest-driven e2e tests, matching how the pre-split single-app e2e specs already omitted them too.)

- [ ] **Step 3: Convert `exam-taking-runtime.e2e-spec.ts`**

Replace the whole file, `apps/api/test/exam-taking-runtime.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam-Taking Runtime HTTP flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  let singleMcqId: string;
  let multiMcqId: string;
  let trueFalseId: string;
  let singleMcqOptions: { id: string; text: string }[];
  let multiMcqOptions: { id: string; text: string }[];
  let trueFalseOptions: { id: string; text: string }[];
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    runtimeApp = await bootRuntimeApp();
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-attempt-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Attempt Org', slug: `ci-attempt-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-attempt.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-attempt.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-attempt.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-attempt.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Full Stack Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const singleMcq = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    singleMcqId = singleMcq.body.id;
    singleMcqOptions = singleMcq.body.options;

    const multiMcq = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'multi_mcq', text: 'Which are prime numbers?', difficulty: 'medium', marks: 4,
        options: [
          { text: '2', isCorrect: true }, { text: '3', isCorrect: true },
          { text: '4', isCorrect: false }, { text: '9', isCorrect: false },
        ],
      })
      .expect(201);
    multiMcqId = multiMcq.body.id;
    multiMcqOptions = multiMcq.body.options;

    const trueFalse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'TypeScript is a superset of JavaScript.', difficulty: 'easy', marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    trueFalseId = trueFalse.body.id;
    trueFalseOptions = trueFalse.body.options;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [singleMcqId, multiMcqId, trueFalseId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndRedeem(email: string, name: string): Promise<{ candidateId: string; token: string }> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const candidateId = candidateResponse.body.id;

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);

    return { candidateId, token: inviteResponse.body.created[0].token };
  }

  it('runs the full candidate exam-taking flow and reports a graded result to the recruiter', async () => {
    const { token } = await inviteAndRedeem('alice@ci-attempt.test', 'Alice');

    const redeemResponse = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const candidateAccessToken = redeemResponse.body.accessToken;

    const previewResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(previewResponse.body.exam.title).toBe('Full Stack Round');
    expect(previewResponse.body.sections).toBeUndefined();

    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(startResponse.body.status).toBe('in_progress');

    const stateResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(stateResponse.body.sections).toHaveLength(1);
    const allQuestions = stateResponse.body.sections[0].questions;
    allQuestions.forEach((question: Record<string, unknown>) => {
      (question.options as Record<string, unknown>[]).forEach((option) => expect(option).not.toHaveProperty('isCorrect'));
    });

    const correctSingleOptionId = singleMcqOptions.find((option) => option.text === '4')!.id;
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: singleMcqId, selectedOptionIds: [correctSingleOptionId] })
      .expect(201);

    const partialMultiOptionId = multiMcqOptions.find((option) => option.text === '2')!.id;
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: multiMcqId, selectedOptionIds: [partialMultiOptionId] })
      .expect(201);

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: 'not-a-real-question-id', selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const correctTrueFalseOptionId = trueFalseOptions.find((option) => option.text === 'True')!.id;
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: trueFalseId, selectedOptionIds: [correctTrueFalseOptionId] })
      .expect(201);

    const submitResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(submitResponse.body).toEqual({ status: 'submitted' });
    expect(submitResponse.body.score).toBeUndefined();

    const duplicateSubmitResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(duplicateSubmitResponse.body).toEqual({ status: 'submitted' });

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: trueFalseId, selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const aliceResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Alice');
    expect(aliceResult.status).toBe('submitted');
    expect(aliceResult.score).toBe(6);
    expect(aliceResult.maxScore).toBe(10);
    expect(aliceResult.percentage).toBe(60);
    expect(aliceResult.passFail).toBe('pass');

    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('rejects a candidate from accessing another candidate\'s attempt', async () => {
    const bobTokens = await inviteAndRedeem('bob@ci-attempt.test', 'Bob');
    const carolTokens = await inviteAndRedeem('carol@ci-attempt.test', 'Carol');

    const bobAccess = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: bobTokens.token }).expect(200)).body.accessToken;
    const carolAccess = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: carolTokens.token }).expect(200)).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${bobAccess}`).expect(201);

    const carolState = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${carolAccess}`)
      .expect(200);
    expect(carolState.body.sections).toBeUndefined();
  });

  it('auto-submits and grades an attempt that is touched again after its duration has elapsed', async () => {
    const { token } = await inviteAndRedeem('dave@ci-attempt.test', 'Dave');
    const daveAccess = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(201);

    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.attempt.update({ where: { id: startResponse.body.id }, data: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } }),
    );

    const currentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(200);
    expect(currentResponse.body.status).toBe('auto_submitted');
    expect(currentResponse.body.remainingSeconds).toBe(0);

    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const daveResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Dave');
    expect(daveResult.status).toBe('auto_submitted');
    expect(daveResult.score).toBe(0);
  });

  it('rejects redeeming a revoked or expired invitation with a specific error, not a generic 404', async () => {
    const { candidateId, token } = await inviteAndRedeem('erin@ci-attempt.test', 'Erin');
    const listResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const erinInvitation = listResponse.body.find((inv: { candidateId: string }) => inv.candidateId === candidateId);

    await request(adminHttp)
      .post(`/api/v1/invitations/${erinInvitation.id}/revoke`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    await request(runtimeHttp)
      .post('/api/v1/candidate-auth/redeem')
      .send({ token })
      .expect(400);

    await request(runtimeHttp)
      .post('/api/v1/candidate-auth/redeem')
      .send({ token: 'this-token-does-not-exist' })
      .expect(404);
  });
});
```
(Every assertion and every fixture value is unchanged from the pre-split file — the only systematic change is which app's `getHttpServer()` each `request(...)` call targets, based on which app now serves that route, plus `adminApp`/`runtimeApp` both being closed in `afterAll`.)

- [ ] **Step 4: Run this one e2e spec to verify it passes**

Run (from repo root): `npx jest --config apps/api/test/jest-e2e.json exam-taking-runtime`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/test/dual-app.ts apps/api/test/exam-taking-runtime.e2e-spec.ts
git commit -m "test: convert exam-taking-runtime e2e spec to boot both apps/api and apps/exam-runtime"
```

---

### Task 6: Convert `ai-proctoring.e2e-spec.ts`

**Files:**
- Modify: `apps/api/test/ai-proctoring.e2e-spec.ts`

**Interfaces:**
- Consumes: `bootAdminApp`, `bootRuntimeApp` (Task 5, unchanged).

This file's `ClaudeProctoringClient` override moves to the *runtime* app's builder — `ProctoringAnalysisModule` (which provides `ClaudeProctoringClient`) now lives in `apps/exam-runtime`, not `apps/api`. The `/attempts/:id/reanalyze` call stays on `adminHttp` (it's `AttemptsAdminModule`, still in `apps/api`) — internally it now round-trips through the internal HTTP surface to `apps/exam-runtime`, but that's invisible to this black-box test.

- [ ] **Step 1: Convert the file**

Replace the whole file, `apps/api/test/ai-proctoring.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ClaudeProctoringClient } from '../../exam-runtime/src/proctoring-analysis/claude-proctoring.client';

describe('AI Proctoring flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeClaudeProctoringClient = { assessRisk: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    runtimeApp = await bootRuntimeApp((builder) => builder.overrideProvider(ClaudeProctoringClient).useValue(fakeClaudeProctoringClient));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-proctoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Proctoring Org', slug: `ci-ai-proctoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-proctoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-proctoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Proctoring Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this an AI proctoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  async function pollForAnalysis(attemptCandidateEmail: string, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const results = await request(adminHttp)
        .get(`/api/v1/exams/${examId}/results`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      const row = results.body.find((r: any) => r.candidateName === attemptCandidateEmail);
      if (row?.proctoringAnalysis) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for proctoring analysis for ${attemptCandidateEmail}`);
  }

  it('records a completed analysis with the LLM-provided risk level and summary for an attempt with proctoring events', async () => {
    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'medium', summary: 'One tab switch mid-exam.' });

    const token = await inviteAndGetToken('alice@ci-ai-proctoring.test', 'Alice');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Alice');

    expect(row.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'medium', summary: 'One tab switch mid-exam.' });
    expect(fakeClaudeProctoringClient.assessRisk).toHaveBeenCalledWith([
      expect.objectContaining({ eventType: 'tab_switch', severity: 'medium' }),
    ]);
  });

  it('records skipped_clean without ever calling the LLM for an attempt with no proctoring events', async () => {
    const token = await inviteAndGetToken('bob@ci-ai-proctoring.test', 'Bob');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    fakeClaudeProctoringClient.assessRisk.mockClear();

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Bob');

    expect(row.proctoringAnalysis).toEqual({ status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' });
    expect(fakeClaudeProctoringClient.assessRisk).not.toHaveBeenCalled();
  });

  it('records a failed analysis when the LLM client throws, then replaces it with a completed one via reanalyze', async () => {
    fakeClaudeProctoringClient.assessRisk.mockRejectedValueOnce(new Error('rate limited'));

    const token = await inviteAndGetToken('carol@ci-ai-proctoring.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'copy_paste' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const failedRow = await pollForAnalysis('Carol');
    expect(failedRow.proctoringAnalysis).toEqual({ status: 'failed', riskLevel: null, summary: null });

    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'high', summary: 'Copy-paste detected.' });
    await request(adminHttp)
      .post(`/api/v1/attempts/${failedRow.attemptId}/reanalyze`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const finalResults = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const finalRow = finalResults.body.find((r: any) => r.candidateName === 'Carol');
    expect(finalRow.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' });
  });
});
```
(`ClaudeProctoringClient` is imported from its new home under `../../exam-runtime/src/proctoring-analysis/` and overridden on the *runtime* app's builder — everything else, including every assertion, is unchanged.)

- [ ] **Step 2: Run this e2e spec to verify it passes**

Run (from repo root): `npx jest --config apps/api/test/jest-e2e.json ai-proctoring`
Expected: all 3 tests pass. The third test's `reanalyze` call now exercises the full round-trip through `AttemptsAdminService` → `ExamRuntimeInternalClient` → `apps/exam-runtime`'s `InternalController` → `AttemptAnalysisService` — this is the first test in the suite that actually proves the internal HTTP surface works end-to-end against two real running app instances (Task 4's unit tests mocked both sides of that boundary).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/ai-proctoring.e2e-spec.ts
git commit -m "test: convert ai-proctoring e2e spec to boot both apps/api and apps/exam-runtime"
```

---

### Task 7: Convert `session-enforcement-anti-cheat.e2e-spec.ts`

**Files:**
- Modify: `apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts`

**Interfaces:**
- Consumes: `bootAdminApp`, `bootRuntimeApp` (Task 5, unchanged).

`/api/v1/attempts/:id/proctoring-events` and `/api/v1/attempts/:id/force-submit` both stay on `adminHttp` (`AttemptsAdminModule`). `force-submit`'s underlying finalize call now happens inside `apps/exam-runtime` via the internal surface — invisible here, same as Task 6.

- [ ] **Step 1: Convert the file**

Replace the whole file, `apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Session Enforcement & Anti-Cheat HTTP flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    runtimeApp = await bootRuntimeApp();
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-anticheat-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Anti-Cheat Org', slug: `ci-anticheat-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-anticheat.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-anticheat.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-anticheat.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-anticheat.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Anti-Cheat Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a test question?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);

    return inviteResponse.body.created[0].token;
  }

  it('kills an old session live when the same invitation is redeemed again, and logs a multi_login event once an attempt exists', async () => {
    const token = await inviteAndGetToken('alice@ci-anticheat.test', 'Alice');

    const firstRedeem = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const firstAccessToken = firstRedeem.body.accessToken;

    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ deviceFingerprint: 'fp-first-device' })
      .expect(201);
    const attemptId = startResponse.body.id;

    const secondRedeem = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const secondAccessToken = secondRedeem.body.accessToken;

    await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(401);

    await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(200);

    const eventsResponse = await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const multiLoginEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'multi_login');
    expect(multiLoginEvent).toBeDefined();
    expect(multiLoginEvent.severity).toBe('high');
  });

  it('records client-reported proctoring events with server-computed severity, and rejects a client-submitted multi_login', async () => {
    const token = await inviteAndGetToken('bob@ci-anticheat.test', 'Bob');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);

    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'multi_login' })
      .expect(400);

    const eventsResponse = await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const tabSwitchEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'tab_switch');
    expect(tabSwitchEvent.severity).toBe('medium');

    await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('force-submits an in-progress attempt and records an audit log entry', async () => {
    const token = await inviteAndGetToken('carol@ci-anticheat.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    const forceSubmitResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(forceSubmitResponse.body).toEqual({ status: 'force_submitted' });

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    const auditRows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.auditLog.findMany({ where: { entityType: 'attempt', entityId: attemptId, action: 'attempt.force_submit' } }),
    );
    expect(auditRows).toHaveLength(1);
  });

  it('starts an attempt successfully with no device fingerprint provided', async () => {
    const token = await inviteAndGetToken('dave@ci-anticheat.test', 'Dave');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
  });
});
```

- [ ] **Step 2: Run this e2e spec to verify it passes**

Run (from repo root): `npx jest --config apps/api/test/jest-e2e.json session-enforcement-anti-cheat`
Expected: all 4 tests pass. The second-to-last test is the important regression guard: it proves `force-submit`'s 400 (attempt not `in_progress`) — which moved from `AttemptsAdminService` into `apps/exam-runtime`'s `InternalController` in Task 4 — still surfaces correctly through `apps/api`'s public route via `ExamRuntimeInternalClient`'s status-code translation.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts
git commit -m "test: convert session-enforcement-anti-cheat e2e spec to boot both apps/api and apps/exam-runtime"
```

---

### Task 8: Convert `live-monitoring.e2e-spec.ts`

**Files:**
- Modify: `apps/api/test/live-monitoring.e2e-spec.ts`

**Interfaces:**
- Consumes: `bootAdminApp`, `bootRuntimeApp`, `listenOnRandomPort` (Task 5, unchanged).

The socket.io client connects to `apps/exam-runtime`'s port now (that's where `MonitoringGateway` lives) — only `runtimeApp` needs `listenOnRandomPort`; `adminApp` doesn't need a real listening port, same as every other e2e spec in this project. The recruiter's staff JWT is issued by `adminApp` (`/auth/staff/login`) but verified by `runtimeApp`'s gateway using the same `JWT_ACCESS_SECRET` value both apps' `.env` files share (Task 2, Step 5) — this is the one place in this whole plan where the two apps' independence actually depends on a shared config value being kept in sync, worth knowing if this test ever fails mysteriously in a fresh environment.

- [ ] **Step 1: Convert the file**

Replace the whole file, `apps/api/test/live-monitoring.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp, listenOnRandomPort } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Live Monitoring WebSocket flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let runtimePort: number;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    runtimeApp = await bootRuntimeApp();
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    runtimePort = await listenOnRandomPort(runtimeApp);

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-monitoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Monitoring Org', slug: `ci-monitoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-monitoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-monitoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Live Monitoring Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a live monitoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  function connectRecruiterSocket(token: string = recruiterAccessToken): Socket {
    return io(`http://localhost:${runtimePort}/monitoring`, { auth: { token }, transports: ['websocket'], forceNew: true });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  it('sends a roster snapshot on join, then pushes attempt:status and proctoring:flag as they happen', async () => {
    const token = await inviteAndGetToken('alice@ci-monitoring.test', 'Alice');
    const socket = connectRecruiterSocket();

    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    const snapshot = await waitForEvent<any[]>(socket, 'roster:snapshot');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ candidateName: 'Alice', status: 'invited', online: false });

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const attemptStatusPromise = waitForEvent<any>(socket, 'attempt:status');
    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    const attemptStatus = await attemptStatusPromise;
    expect(attemptStatus).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), status: 'in_progress' });

    const proctoringFlagPromise = waitForEvent<any>(socket, 'proctoring:flag');
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    const proctoringFlag = await proctoringFlagPromise;
    expect(proctoringFlag).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), eventType: 'tab_switch', severity: 'medium', occurredAt: expect.any(String) });

    socket.disconnect();
  });

  it('delivers a recruiter message to the candidate on their next poll, and notifies the room', async () => {
    const token = await inviteAndGetToken('bob@ci-monitoring.test', 'Bob');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    const messageSentPromise = waitForEvent<any>(socket, 'message:sent');
    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/message`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ body: 'Please stay on the exam tab' })
      .expect(201);
    await messageSentPromise;

    const currentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(currentResponse.body.messages).toHaveLength(1);
    expect(currentResponse.body.messages[0].body).toBe('Please stay on the exam tab');

    const secondCurrentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(secondCurrentResponse.body.messages).toHaveLength(0);

    socket.disconnect();
  });

  it('force-submits an attempt, pushing attempt:status to the room exactly once', async () => {
    const token = await inviteAndGetToken('carol@ci-monitoring.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    // Collect every attempt:status event (rather than resolving on the first with .once()) so
    // we can assert there is exactly one — a regression guard against force-submit emitting the
    // event itself in addition to the emit already performed inside AttemptSettlementService.finalize().
    const attemptStatusEvents: any[] = [];
    socket.on('attempt:status', (payload) => attemptStatusEvents.push(payload));

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    // Round-trip another HTTP call through the same server/socket stack so any second,
    // asynchronously-delivered copy of the event would have had time to arrive before we assert.
    await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/messages`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(attemptStatusEvents).toHaveLength(1);
    expect(attemptStatusEvents[0]).toEqual({ attemptId, candidateId: expect.any(String), status: 'force_submitted' });

    socket.disconnect();
  });

  it('rejects a socket connection with no token, and rejects joining an exam outside the caller organization', async () => {
    const unauthenticated = io(`http://localhost:${runtimePort}/monitoring`, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve) => unauthenticated.on('disconnect', () => resolve()));

    const otherOrgHash = await argon2.hash('OtherOrgPassw0rd!');
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-monitoring-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({ data: { name: 'CI Monitoring Other Org', slug: `ci-monitoring-other-org-${randomUUID()}`, planId: otherPlan.id } });
    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: otherOrg.id, email: 'other@ci-monitoring.test', passwordHash: otherOrgHash, role: 'recruiter' } }),
    );
    const otherAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: otherOrg.slug, email: 'other@ci-monitoring.test', password: 'OtherOrgPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const otherSocket = connectRecruiterSocket(otherAccessToken);
    await waitForEvent(otherSocket, 'connect');
    const errorPromise = waitForEvent<any>(otherSocket, 'error');
    otherSocket.emit('join-exam', { examId });
    const error = await errorPromise;
    expect(error.message).toBe(`Exam ${examId} not found`);
    otherSocket.disconnect();

    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: otherOrg.id } } }));
    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });
});
```
(The socket URL now uses `runtimePort` instead of the old single-app `port`; the message/force-submit HTTP calls stay on `adminHttp`; everything else — every event name, every assertion, the whole "exactly one `attempt:status` event" regression guard — is unchanged.)

- [ ] **Step 2: Run this e2e spec to verify it passes**

Run (from repo root): `npx jest --config apps/api/test/jest-e2e.json live-monitoring`
Expected: all 4 tests pass. This is the strongest end-to-end proof this whole plan is correct: a staff JWT minted by `apps/api` authenticates a WebSocket connection to `apps/exam-runtime`, and both a direct candidate action (`attempt/start`) and an `apps/api`-initiated admin action (`force-submit` via the internal surface) correctly reach the same `MonitoringGateway` room.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/live-monitoring.e2e-spec.ts
git commit -m "test: convert live-monitoring e2e spec to boot both apps/api and apps/exam-runtime"
```

---

### Task 9: Full-suite verification and Azure DevOps sync

**Files:** none (verification + process only).

- [ ] **Step 1: Run everything, one more time, from a clean state**

Run (from repo root):
```bash
npm run test:api
npm run test:exam-runtime
npm run test:api:e2e
npm run test:exam-runtime:e2e
```
Expected: every suite passes. `test:api:e2e` includes the 4 converted specs (Tasks 5-8) plus the 7 untouched ones (`health`, `auth-flow`, `candidates-invitations`, `exam-builder`, `organization-branding`, `question-bank`, `tenant-isolation`) — none of those 7 ever call a candidate-auth/attempt/monitoring route, so they should pass completely unchanged against `apps/api`'s now-smaller `AppModule`. If any of them fails, that's a signal one of Task 1-4's moves broke something outside this plan's assumed blast radius — stop and investigate before proceeding, don't paper over it.

Run: `npx nest build` (from `apps/api/`) and `npx nest build` (from `apps/exam-runtime/`)
Expected: both clean.

Run (from repo root, in two separate terminals): `npm run dev:api` and `npm run dev:exam-runtime`
Expected: both start successfully, each on its own port (`3001` and `3002`), with no port conflict and no startup error referencing a missing module or unresolved provider. Stop both afterward.

- [ ] **Step 2: Sync to Azure DevOps**

Per this project's established convention (every phase becomes a `Feature` work item under the existing product Epic, with `User Story`/`Task` items underneath, each closed with a narrative comment): create a `Feature` for Phase 3b under the existing Epic, and one `User Story` per task in this plan (Tasks 1-9 above), using `az boards` (pre-authenticated for org `PIDC-Salesforce` / project `Interview App`):
```bash
az boards work-item create --type Feature --title "Phase 3b: Exam Runtime Service Isolation" --org https://dev.azure.com/PIDC-Salesforce --project "Interview App" --fields "System.Description=Split the candidate-facing exam-taking hot path out of apps/api into an independently-runnable apps/exam-runtime, sharing the same DB, with a shared packages/shared workspace for Prisma/Audit and a narrow internal HTTP surface for the 3 admin actions that still need to reach it."
```
Note the returned work item ID, then link it under the Epic and create one `User Story` per task (Task 1-9 titles from this plan), each linked as a child of the new Feature. Close each `User Story` with a narrative comment describing what was actually done and any deviation from the plan (e.g. Task 4's discovery that led to the internal HTTP surface) — **not** a bare "done." Before considering this phase closed, run the zero-comment audit query this project uses to catch silently-closed items:
```bash
az boards query --wiql "SELECT [System.Id],[System.Title],[System.WorkItemType] FROM WorkItems WHERE [System.TeamProject]='Interview App' AND [System.CommentCount]=0 AND [System.WorkItemType] IN ('Epic','Feature','User Story','Task') AND [System.State]<>'Removed'" -o table
```
Expected: no rows referencing this phase's Feature or its User Stories. If any appear, add the missing comment before reporting the phase done.

---

## Self-Review Notes

- **Spec coverage:** every in-scope item from `docs/superpowers/specs/2026-07-09-phase-3b-exam-runtime-isolation-design.md` maps to a task — `packages/shared` extraction (Task 1), `apps/exam-runtime` scaffold (Task 2), the `attempts`/`attempts-admin` split (Task 3), the atomic cross-app move plus the internal HTTP surface amendment (Task 4), env/running-locally conventions (folded into Tasks 2 and 4), and the full e2e re-homing (Tasks 5-8). The spec's explicit out-of-scope items (Docker, cloud deployment, load testing, new frontend, splitting `Invitations`/`Exams`/`Questions`) are not touched anywhere in this plan.
- **Placeholder scan:** no TBD/TODO markers. Every step with a code change shows complete code; every pure-relocation step gives an exact, runnable `git mv` plus (where needed) the exact before/after import line — deliberately not reproducing unchanged file bodies wholesale, per this plan's own Global Constraints on the Task 1 Step 5 rewrite being total and mechanical.
- **Type/interface consistency:** `TenantContext`/`TenantPrismaService`/`PrismaService`/`AuditService` are defined once in `packages/shared` (Task 1) and imported identically everywhere after; `ExamRuntimeInternalClient`'s 3 methods (Task 4, Step 9) match exactly the 3 internal endpoints `InternalController` exposes (Task 4, Step 7) — same paths, same payload shapes, same status-code-to-exception mapping tested on both sides (Task 4, Steps 5 and 9-10). `bootAdminApp`/`bootRuntimeApp`/`listenOnRandomPort` (Task 5) are the only 3 exports every subsequent e2e task (6-8) relies on, and none of those tasks needs anything beyond them.
- **Sequencing double-checked:** Task 1 (shared package) deliberately precedes Task 4 (cross-app move) specifically so Task 4 never has to touch a Prisma/Audit import — confirmed by re-reading Task 4's file list, which only edits imports *among* the 5 moving modules, never `../prisma/...`/`../audit/...`. Task 3 (same-app split) deliberately precedes Task 4 so the admin/candidate `attempts/` split isn't done under the added pressure of a simultaneous cross-app move.
- **Known, deliberate tradeoff flagged in-line (Task 4, Step 11):** `AttemptsAdminService.forceSubmit`/`reanalyze` each do one DB read in `apps/api` (to verify org ownership) before the internal call, and `InternalController` does a second, independent DB read in `apps/exam-runtime` (to actually perform the action) — a mild redundancy accepted because a low-frequency admin action doesn't need a smarter cross-service protocol, and because keeping the two responsibilities (authorization vs. execution) cleanly separated by service boundary is more valuable here than saving one query.

